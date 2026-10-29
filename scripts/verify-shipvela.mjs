import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// This script resets only an explicitly selected, disposable loopback database.
const databaseUrl = process.env.STELUX_TEST_SHIPVELA_DATABASE_URL;
if (!databaseUrl) throw new Error('Set STELUX_TEST_SHIPVELA_DATABASE_URL to a disposable local stelux_shipvela_test database.');
const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/stelux_shipvela_test') {
  throw new Error('Refusing to run outside the local stelux_shipvela_test database.');
}
const port = Number(process.env.STELUX_TEST_SHIPVELA_PORT || 5317);
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  STELUX_CLOUD_DATABASE: 'evaluation',
  DATABASE_URL: '', STELUX_DEMO_DATABASE_URL: databaseUrl,
  STELUX_DEMO_DATABASE_PASSWORD: decodeURIComponent(target.password), STELUX_DEMO_DATABASE_CA: '',
  STELUX_PUBLIC_URL: base,
};
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
try { await db.query('DROP SCHEMA IF EXISTS stelux CASCADE'); } finally { await db.end(); }
const prepare = spawnSync(process.execPath, ['dist-server/server/prepare-cloud.js'], { env, encoding: 'utf8' });
assert.equal(prepare.status, 0, 'Disposable database preparation must succeed.');

const trace = JSON.parse(readFileSync('.next/server/pages/api/[[...path]].js.nft.json', 'utf8'));
for (const name of ['dist-server/server/serverless.js', 'dist-server/server/postgres-worker.mjs', 'node_modules/pg/', 'node_modules/express/', 'node_modules/exceljs/']) {
  assert.ok(trace.files.some(file => file.includes(name)), `SSR trace must include ${name}`);
}
assert.ok(!trace.files.some(file => /(?:^|\/)(?:\.data|backups|\.env(?:\.|$))(?:\/|$)/.test(file)), 'Local databases and environment files must not enter the SSR artifact.');
if (existsSync('dist-server/server/runtime-env.json')) {
  const privateValues = JSON.parse(readFileSync('dist-server/server/runtime-env.json', 'utf8'));
  assert.ok(trace.files.some(file => file.endsWith('/dist-server/server/runtime-env.json')));
  for (const file of readdirSync('.next/static', { recursive: true })) {
    const path = '.next/static/' + file;
    if (!statSync(path).isFile()) continue;
    const content = readFileSync(path, 'utf8');
    for (const value of [privateValues.STELUX_DEMO_DATABASE_PASSWORD, privateValues.STELUX_DEMO_DATABASE_URL, privateValues.STELUX_DATABASE_PASSWORD, privateValues.DATABASE_URL].filter(Boolean)) {
      assert.ok(!content.includes(value), 'Private server configuration must not enter browser assets.');
    }
  }
}

let child;
async function start() {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error('Next production server exited before becoming ready.');
    try { const health = await fetch(base + '/api/health'); if (health.ok) return; } catch { /* starting */ }
    await delay(250);
  }
  throw new Error('Next production API did not become healthy within 30 seconds.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([stopped, delay(5000)]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await stopped; }
}
let cookie = '';
function request(path, method = 'GET', body, origin = base) {
  return fetch(base + path, {
    method, headers: { Origin: origin, 'X-Stelux-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
}
try {
  await start();
  const health = await request('/api/health');
  assert.equal((await health.json()).database, 'postgres');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  for (const path of ['/', '/welding/lisl', '/welding/welds', '/workspace/projects', '/materials/materials', '/materials/certifications', '/materials/planning', '/materials/iso_materials', '/materials/calculation_norms', '/materials/cut_list']) assert.equal((await request(path)).status, 200, path);
  for (const path of ['/tools/articles', '/workspace/schema', '/README.md', '/server/serverless.js', '/dist-server/server/runtime-env.json', '/.env']) assert.equal((await request(path)).status, 404, path);
  assert.equal((await request('/api/bootstrap')).status, 401);
  const credentials = { name: 'Next test administrator', email: 'next@example.test', password: 'Disposable-Next-Test-123' };
  const setup = await request('/api/auth/setup', 'POST', credentials);
  assert.equal(setup.status, 201);
  cookie = setup.headers.get('set-cookie').split(';')[0];
  assert.match(setup.headers.get('set-cookie'), /HttpOnly/);
  const bootstrap = await request('/api/bootstrap');
  assert.equal(bootstrap.status, 200);
  const { rows } = await bootstrap.json();
  const weld = rows.welds.find(row => row.id === 'weld-1');
  assert.ok(weld);
  const update = { _version: weld._version, description: 'Verified through Next production API' };
  assert.equal((await request('/api/records/welds/weld-1', 'PUT', update, 'https://untrusted.example.test')).status, 403);
  assert.equal((await request('/api/records/welds/weld-1', 'PUT', update)).status, 200);
  const bytes = Buffer.from([0, 255, 19, 88, 128, 64]);
  const form = new FormData();
  form.set('entityType', 'welds'); form.set('entityId', 'weld-1');
  form.set('file', new Blob([bytes]), 'next-report.pdf');
  const upload = await request('/api/files', 'POST', form);
  assert.equal(upload.status, 201);
  const { record } = await upload.json();
  const download = await request(`/api/files/${record.id}`);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.equal((await request('/api/records/materials')).status, 200);
  assert.equal((await request('/api/records/certifications')).status, 200);
  assert.equal((await request('/api/records/articles')).status, 404);
  const material = rows.materials[0];
  const certificateResponse = await request('/api/records/certifications', 'POST', { name: 'NEXT-MATERIAL-CERT-01', indexNo: '0007', materialId: material.id, chargeNo: weld.chargeNo1 || 'NEXT-HEAT' });
  assert.equal(certificateResponse.status, 201);
  const certificate = (await certificateResponse.json()).record;
  const latestWeld = (await (await request('/api/bootstrap')).json()).rows.welds.find(row => row.id === weld.id);
  assert.equal((await request(`/api/records/welds/${weld.id}`, 'PUT', { _version: latestWeld._version, material1Id: material.id, certificate1Id: certificate.id })).status, 200);
  const lisl = await request('/api/reports/lisl');
  assert.equal(lisl.status, 200); assert.match(await lisl.text(), /0007/);
  assert.equal((await request('/api/export/welds?format=xlsx')).status, 200);
  const control = new pg.Client({ connectionString: databaseUrl });
  await control.connect();
  try { await control.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name='stelux-local' AND pid<>pg_backend_pid()"); }
  finally { await control.end(); }
  const lost = await request('/api/health');
  assert.equal(lost.status, 500, 'A lost database connection fails the current request.');
  assert.equal((await request('/api/health')).status, 200, 'The next request reconnects without replaying a mutation.');
  await stop();
  await start();
  const persisted = await request('/api/bootstrap');
  assert.equal(persisted.status, 200, 'Database sessions survive runtime replacement.');
  const saved = (await persisted.json()).rows.welds.find(row => row.id === weld.id);
  assert.equal(saved.description, update.description);
  assert.deepEqual(Buffer.from(await (await request(`/api/files/${record.id}`)).arrayBuffer()), bytes);
  assert.equal((await request('/api/auth/logout', 'POST', {})).status, 200);
  cookie = '';
  const login = await request('/api/auth/login', 'POST', credentials);
  assert.equal(login.status, 200, 'Existing credentials survive runtime replacement.');
  await stop();
  // The same disposable fixture now represents an existing internal workspace.
  // Exercise source selection in the packed Next runtime with its saved account.
  const workspace = new pg.Client({ connectionString: databaseUrl });
  await workspace.connect();
  try { await workspace.query("DELETE FROM stelux.metadata WHERE key='release_profile'"); }
  finally { await workspace.end(); }
  env.STELUX_CLOUD_DATABASE = 'workspace';
  env.DATABASE_URL = databaseUrl;
  env.STELUX_DATABASE_PASSWORD = decodeURIComponent(target.password);
  env.STELUX_DATABASE_CA = '';
  env.STELUX_DEMO_DATABASE_URL = 'postgresql://wrong:wrong@127.0.0.1:1/unused';
  cookie = '';
  await start();
  const existingStatus = await (await request('/api/auth/status')).json();
  assert.equal(existingStatus.requiresSetup, false);
  assert.equal(existingStatus.sampleWorkspace, false);
  const existingLogin = await request('/api/auth/login', 'POST', credentials);
  assert.equal(existingLogin.status, 200, 'Hosted workspace mode uses the existing account.');
  cookie = existingLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/bootstrap')).status, 200);
  assert.deepEqual(Buffer.from(await (await request(`/api/files/${record.id}`)).arrayBuffer()), bytes);
  console.log('Shipvela Next production verification passed: SSR pages, private API, existing-account login, permissions, origin protection, weld edits, XLSX, uploads and persistence after restart in both database modes.');
} finally { await stop(); }
