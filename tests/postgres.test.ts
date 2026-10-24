import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgresDatabase, postgresConfig } from '../server/postgres.ts';
import { postgresParameters } from '../server/database.ts';
import { migrateSqlite } from '../server/migrate-data.ts';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES } from '../shared/resources.ts';

test('PostgreSQL placeholders preserve literals, identifiers and comments', () => {
  assert.equal(postgresParameters(`SELECT '?', "?", ? -- ?\n, 'it''s ?', ? /* ? */`), `SELECT '?', "?", $1 -- ?\n, 'it''s ?', $2 /* ? */`);
});

test('remote database configuration requires a password and verifies TLS', () => {
  assert.throws(() => postgresConfig({ DATABASE_URL: 'postgresql://postgres@example.com/postgres' }), /STELUX_DATABASE_PASSWORD/);
  const config = postgresConfig({ DATABASE_URL: 'postgresql://postgres@example.com/postgres?sslmode=disable', STELUX_DATABASE_PASSWORD: 'private-test-password' });
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.password, 'private-test-password');
  assert.ok(!config.connectionString?.includes('sslmode'));
});

const testUrl = process.env.STELUX_TEST_DATABASE_URL;
test('PostgreSQL preserves migration, authentication, inventory transactions and import previews', { skip: !testUrl }, async t => {
  const url = new URL(testUrl!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/stelux_test', 'Use only the disposable local stelux_test database.');
  const db = new PostgresDatabase(postgresConfig({ DATABASE_URL: testUrl }));
  t.after(() => db.close());
  db.exec('DROP SCHEMA IF EXISTS stelux CASCADE');
  const dir = mkdtempSync(join(tmpdir(), 'stelux-pg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = new Store(join(dir, 'source.sqlite'));
  seed(source);
  const user = source.create('users', { name: 'Migration Admin', email: 'admin@example.com', profileId: 'profile-admin', active: true });
  source.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash('migration-test-password'));
  const sourceRows = Object.fromEntries(RESOURCES.map(r => [r.key, source.list(r.key, true)]));
  source.close();
  const counts = migrateSqlite(join(dir, 'source.sqlite'), db);
  assert.equal(counts.users, 1);
  assert.throws(() => migrateSqlite(join(dir, 'source.sqlite'), db), /not empty/);
  const store = new Store(':memory:', db);
  for (const resource of RESOURCES) assert.deepEqual(store.list(resource.key, true), sourceRows[resource.key], resource.key);
  const initialAudit = store.activity(10000);
  assert.throws(() => store.transaction(() => {
    store.create('sites', { name: 'Must roll back' });
    store.create('materials', { materialNo: 'PG-ROLLBACK', description: 'Temporary', uom: 'EA' });
    throw new Error('Deliberate rollback');
  }), /Deliberate rollback/);
  assert.ok(!store.list('sites').some(row => row.name === 'Must roll back'));
  assert.deepEqual(store.activity(10000), initialAudit);
  const stockBefore = store.list('stock').find(row => Number(row.quantity) > 0 && row.materialId)!;
  const stockQuantity = Number(stockBefore.quantity);
  runAction(store, 'adjust-material', { materialId: stockBefore.materialId, warehouseId: stockBefore.warehouseId, chargeNo: stockBefore.chargeNo || '', quantity: 2, date: '2026-10-24', note: 'Integration check' }, SYSTEM);
  assert.equal(Number(store.get('stock', stockBefore.id).quantity), stockQuantity + 2);
  const site = store.create('sites', { name: 'Postgres site' });
  assert.throws(() => store.create('sites', { name: 'Postgres site' }), error => (error as { status?: number }).status === 409);
  assert.throws(() => store.update('sites', site.id, { name: 'Stale update' }, site._version + 1), error => (error as { status?: number }).status === 409);
  for (let i = 0; i < 52; i++) store.audit('sites', site.id, 'checked', `Check ${i}`, SYSTEM);
  const first = store.history('sites', site.id);
  assert.equal(first.events.length, 50);
  assert.ok(first.nextCursor);
  assert.equal(store.history('sites', site.id, Number(first.nextCursor)).events.length, 3);

  const server = createApp(store, dir).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await (await fetch(`${base}/api/health`)).json()).database, 'postgres');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-stelux-request': '1' }, body: JSON.stringify({ email: 'admin@example.com', password: 'migration-test-password' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const bootstrap = await fetch(`${base}/api/bootstrap`, { headers: { cookie } });
  assert.equal(bootstrap.status, 200);
  assert.equal((await bootstrap.json()).user.id, user.id);
  const form = new FormData();
  form.append('file', new Blob(['name\nPostgres site\nPreview valid\n'], { type: 'text/csv' }), 'sites.csv');
  const preview = await fetch(`${base}/api/import/sites/preview`, { method: 'POST', headers: { cookie, 'x-stelux-request': '1' }, body: form });
  assert.equal(preview.status, 200);
  const parsed = await preview.json();
  assert.equal(parsed.errors.length, 1);
  assert.ok(!store.list('sites').some(row => row.name === 'Preview valid'));
  // Reopen using a second actual connection: persistence is remote, not a cache.
  const otherDb = new PostgresDatabase({ connectionString: testUrl });
  try {
    const other = new Store(':memory:', otherDb);
    assert.equal(other.get('sites', site.id).name, 'Postgres site');
    const schemas = otherDb.prepare("SELECT schema_name FROM information_schema.schemata WHERE schema_name='stelux'").all();
    assert.equal(schemas.length, 1);
  } finally { otherDb.close(); }
});
