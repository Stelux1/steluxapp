import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import type { ClientConfig } from 'pg';
import { postgresParameters, type Database, type DatabaseValue } from './database.ts';

export class PostgresDatabase implements Database {
  readonly dialect = 'postgres' as const;
  private worker: Worker;
  private closed = false;
  get usable() { return !this.closed; }
  private control = new SharedArrayBuffer(8);
  private output = new SharedArrayBuffer(64 * 1024 * 1024);

  constructor(config: ClientConfig) {
    this.worker = new Worker(new URL('./postgres-worker.mjs', import.meta.url), { workerData: { config }, execArgv: [] });
    this.worker.on('error', () => { this.closed = true; });
    try { this.exec('SELECT 1'); }
    catch (error) { this.closed = true; void this.worker.terminate(); throw error; }
  }
  private query(sql: string, values: DatabaseValue[] = [], close = false) {
    if (this.closed) throw new Error('The PostgreSQL connection is closed. Restart the server.');
    const state = new Int32Array(this.control);
    Atomics.store(state, 0, 0);
    this.worker.postMessage({ sql, values, close, control: this.control, output: this.output });
    const deadline = Date.now() + 45_000;
    while (Atomics.load(state, 0) === 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.closed = true;
        void this.worker.terminate();
        throw new Error('PostgreSQL timed out. Restart the server before retrying the operation.');
      }
      Atomics.wait(state, 0, 0, remaining);
    }
    const response = JSON.parse(Buffer.from(this.output, 0, Atomics.load(state, 1)).toString());
    if (response.error) {
      if (response.error.code === 'STELUX_CONNECTION_LOST') { this.closed = true; void this.worker.terminate(); }
      throw Object.assign(new Error(response.error.message), { code: response.error.code });
    }
    return response as { rows: Record<string, unknown>[]; rowCount: number };
  }
  exec(sql: string) { this.query(sql); }
  prepare(sql: string) {
    const query = postgresParameters(sql);
    return {
      all: (...values: DatabaseValue[]) => this.query(query, values).rows,
      get: (...values: DatabaseValue[]) => this.query(query, values).rows[0],
      run: (...values: DatabaseValue[]) => ({ changes: this.query(query, values).rowCount }),
    };
  }
  close() {
    if (!this.closed) {
      try { this.query('', [], true); } finally { this.closed = true; void this.worker.terminate(); }
    }
  }
}

export function postgresConfig(env: NodeJS.ProcessEnv = process.env, demo = false): ClientConfig {
  if (demo) {
    if (!env.STELUX_DEMO_DATABASE_URL) throw new Error('Set STELUX_DEMO_DATABASE_URL for the evaluation workspace.');
    return postgresConfig({ DATABASE_URL: env.STELUX_DEMO_DATABASE_URL, STELUX_DATABASE_PASSWORD: env.STELUX_DEMO_DATABASE_PASSWORD, STELUX_DATABASE_CA: env.STELUX_DEMO_DATABASE_CA });
  }
  if (!env.DATABASE_URL) throw new Error('Set DATABASE_URL in the local .env file.');
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const password = env.STELUX_DATABASE_PASSWORD || (url.password ? decodeURIComponent(url.password) : '');
  if (!password) throw new Error('Enter STELUX_DATABASE_PASSWORD in the local .env file.');
  // Use explicit fields: pg's connectionString parser otherwise overwrites a
  // separately supplied password and TLS options with values from the URL.
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || 'postgres'),
    database: decodeURIComponent(url.pathname.slice(1) || 'postgres'),
    password,
    ssl: local ? false : { rejectUnauthorized: true, ...(env.STELUX_DATABASE_CA ? { ca: readFileSync(env.STELUX_DATABASE_CA, 'utf8') } : {}) },
    connectionTimeoutMillis: 15_000,
    application_name: 'stelux-local',
  };
}
