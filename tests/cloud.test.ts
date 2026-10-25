import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { initializeDocumentStorage } from '../server/documents.ts';
import { runtimeConfig } from '../server/runtime-config.ts';
import { PostgresDatabase, postgresConfig } from '../server/postgres.ts';
import { cloudDatabase, rejectEvaluationDatabase } from '../server/cloud-database.ts';
import { backupPostgres } from '../server/postgres-backup.ts';

const cloudEnv = { STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: 'welding-demo', STELUX_DEMO_DATABASE_URL: 'postgresql://postgres@127.0.0.1/stelux_cloud_test', STELUX_DEMO_DATABASE_PASSWORD: 'disposable-test-password', STELUX_PUBLIC_URL: 'https://welding.example.test' };
test('cloud configuration requires a dedicated database and exact public origin while local demo remains isolated', () => {
  assert.throws(() => runtimeConfig({ STELUX_RUNTIME: 'cloud' }), /welding-demo/);
  assert.throws(() => runtimeConfig({ ...cloudEnv, STELUX_DEMO_DATABASE_URL: '' }), /separate evaluation/);
  assert.throws(() => runtimeConfig({ ...cloudEnv, DATABASE_URL: cloudEnv.STELUX_DEMO_DATABASE_URL.replace('postgres@', 'another-user@') }), /separate from DATABASE_URL/);
  assert.throws(() => runtimeConfig({ ...cloudEnv, STELUX_PUBLIC_URL: '' }), /STELUX_PUBLIC_URL/);
  for (const url of ['https://welding.example.test/path', 'https://user:password@welding.example.test', 'https://welding.example.test?key=value', 'http://welding.example.test']) assert.throws(() => runtimeConfig({ ...cloudEnv, STELUX_PUBLIC_URL: url }));
  const config = runtimeConfig(cloudEnv);
  assert.equal(config.host, '0.0.0.0'); assert.equal(config.port, 3000); assert.equal(config.secureCookies, true); assert.equal(config.documentStorage, 'database');
  assert.equal(config.publicOrigin, 'https://welding.example.test');
  assert.equal(postgresConfig(cloudEnv, true).database, 'stelux_cloud_test');
  assert.equal(postgresConfig({ ...cloudEnv, STELUX_DATABASE_PASSWORD: 'must-not-be-used' }, true).password, cloudEnv.STELUX_DEMO_DATABASE_PASSWORD);
  assert.throws(() => postgresConfig({ ...cloudEnv, STELUX_DEMO_DATABASE_PASSWORD: '', STELUX_DATABASE_PASSWORD: 'must-not-be-used' }, true), /PASSWORD/);
  const local = runtimeConfig({ ...cloudEnv, STELUX_RUNTIME: 'local' });
  assert.equal(local.databaseUrl, undefined); assert.equal(local.documentStorage, 'disk'); assert.equal(local.host, '127.0.0.1');
});

async function serve(store: Store, dir: string, initializeStorage = true) {
  const server = createApp(store, dir, { releaseProfile: 'welding-demo', publicOrigin: cloudEnv.STELUX_PUBLIC_URL, secureCookies: true, documentStorage: 'database', initializeStorage }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (path: string, method = 'GET', body?: unknown, cookie = '', origin = cloudEnv.STELUX_PUBLIC_URL) => fetch(base + path, { method, headers: { 'X-Stelux-Request': '1', Origin: origin, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const close = () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  return { request, close };
}

test('cloud origin checks and database documents survive a new process directory without using local uploads', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'stelux-cloud-documents-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = join(dir, 'database.sqlite');
  let store = new Store(filename); seed(store);
  let app = await serve(store, join(dir, 'first-runtime'));
  try {
    for (const origin of ['https://welding.example.test.attacker.test', 'http://welding.example.test', 'http://127.0.0.1:3000']) assert.equal((await app.request('/api/auth/setup', 'POST', { name: 'Denied', email: 'no@example.test', password: 'Test-Password-123' }, '', origin)).status, 403);
    const setup = await app.request('/api/auth/setup', 'POST', { name: 'Cloud administrator', email: 'cloud@example.test', password: 'Test-Password-123' });
    assert.equal(setup.status, 201); assert.match(setup.headers.get('set-cookie')!, /; Secure/);
    const cookie = setup.headers.get('set-cookie')!.split(';')[0];
    const bytes = Buffer.from([0, 255, 19, 88, 0, 128, 64]);
    const upload = () => { const form = new FormData(); form.set('entityType', 'welds'); form.set('entityId', 'weld-1'); form.set('file', new Blob([bytes]), 'inspection.pdf'); return form; };
    assert.equal((await app.request('/api/files', 'POST', upload())).status, 401);
    const response = await app.request('/api/files', 'POST', upload(), cookie); assert.equal(response.status, 201);
    const attachment = (await response.json()).record;
    const count = store.list('attachments', true).length;
    const invalid = upload(); invalid.set('entityType', 'pqr'); invalid.set('entityId', 'pqr-1');
    assert.equal((await app.request('/api/files', 'POST', invalid, cookie)).status, 404);
    assert.equal(store.list('attachments', true).length, count);
    assert.equal(store.db.prepare('SELECT count(*) AS total FROM upload_blobs').get()?.total, 1);
    assert.equal(existsSync(join(dir, 'first-runtime')), false);
    await app.close(); store.close();
    store = new Store(filename); app = await serve(store, join(dir, 'replacement-runtime'));
    const download = await app.request(`/api/files/${attachment.id}`, 'GET', undefined, cookie);
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.equal(download.headers.get('cache-control'), 'no-store'); assert.match(download.headers.get('content-disposition')!, /attachment/);
    assert.equal((await app.request('/api/records/materials', 'GET', undefined, cookie)).status, 404);
    assert.equal(existsSync(join(dir, 'replacement-runtime')), false);
  } finally { await app.close(); store.close(); }
});

const testUrl = process.env.STELUX_TEST_CLOUD_DATABASE_URL;
test('PostgreSQL cloud preparation rejects internal workspaces and preserves accounts and files across independent connections', { skip: !testUrl }, async () => {
  const url = new URL(testUrl!);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/stelux_cloud_test', 'Use only the disposable local stelux_cloud_test database.');
  const config = postgresConfig({ DATABASE_URL: testUrl });
  let db = new PostgresDatabase(config);
  try {
    db.exec('DROP SCHEMA IF EXISTS stelux CASCADE');
    assert.throws(() => cloudDatabase(db), /Initialize/);
    assert.equal(db.prepare("SELECT to_regclass('stelux.metadata') AS name").get()?.name, null);
    db.exec("CREATE SCHEMA stelux; CREATE TABLE stelux.metadata(key TEXT PRIMARY KEY,value TEXT); INSERT INTO stelux.metadata VALUES ('seed_version','1')");
    assert.throws(() => cloudDatabase(db, true), /not an evaluation database/);
    assert.equal(db.prepare('SELECT count(*) AS total FROM stelux.metadata').get()?.total, 1);
    db.exec('DROP SCHEMA stelux CASCADE');
    cloudDatabase(db, true);
    assert.throws(() => cloudDatabase(db), /Finish/);
    const store = new Store(':memory:', db); seed(store); initializeDocumentStorage(store);
    store.db.prepare("INSERT INTO metadata VALUES ('cloud_storage_v1','1')").run();
    const app = await serve(store, '/unused-runtime-path', false);
    let cookie = ''; let attachmentId = '';
    try {
      const setup = await app.request('/api/auth/setup', 'POST', { name: 'Cloud test administrator', email: 'cloud@example.test', password: 'Test-Password-123' });
      assert.equal(setup.status, 201); cookie = setup.headers.get('set-cookie')!.split(';')[0];
      const form = new FormData(); form.set('entityType', 'welds'); form.set('entityId', 'weld-1'); form.set('file', new Blob(['Persistent cloud report']), 'cloud-report.txt');
      const upload = await app.request('/api/files', 'POST', form, cookie); assert.equal(upload.status, 201); attachmentId = (await upload.json()).record.id;
    } finally { await app.close(); }
    db.close(); db = new PostgresDatabase(config);
    cloudDatabase(db);
    assert.throws(() => rejectEvaluationDatabase(db), /full workspace/);
    const reopened = new Store(':memory:', db, { initialize: false });
    const replacement = await serve(reopened, '/another-unused-runtime-path', false);
    try {
      assert.equal((await replacement.request('/api/bootstrap', 'GET', undefined, cookie)).status, 200);
      const download = await replacement.request(`/api/files/${attachmentId}`, 'GET', undefined, cookie);
      assert.equal(download.status, 200); assert.equal(await download.text(), 'Persistent cloud report');
      assert.equal(reopened.list('users').length, 1);
    } finally { await replacement.close(); }
    const backupDir = mkdtempSync(join(tmpdir(), 'stelux-cloud-backup-'));
    try {
      backupPostgres(backupDir, config);
      const sql = readFileSync(join(backupDir, 'stelux-postgres.sql'), 'utf8');
      assert.match(sql, /INSERT INTO upload_blobs/);
      db.exec('DROP SCHEMA stelux CASCADE');
      const restored = new Store(':memory:', db); initializeDocumentStorage(restored);
      db.exec(sql);
      cloudDatabase(db);
      assert.equal(restored.list('users').length, 1);
      const content = restored.db.prepare('SELECT content FROM upload_blobs WHERE attachment_id=?').get(attachmentId)?.content;
      assert.equal(Buffer.from(String(content), 'base64').toString(), 'Persistent cloud report');
      assert.equal(restored.db.prepare('SELECT count(*) AS total FROM credentials').get()?.total, 1);
    } finally { rmSync(backupDir, { recursive: true, force: true }); }
  } finally { db.close(); }
});
