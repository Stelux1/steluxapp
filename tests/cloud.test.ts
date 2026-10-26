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
import { cloudDatabase, rejectEvaluationDatabase, workspaceCloudDatabase } from '../server/cloud-database.ts';
import { createCloudApp } from '../server/cloud-app.ts';
import { backupPostgres } from '../server/postgres-backup.ts';
import { prepareWeldingTraceability, verifyWeldingTraceability } from '../server/welding-schema.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';

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

test('existing workspace cloud access requires explicit selection and uses its own connection settings', () => {
  const env = { ...cloudEnv, STELUX_CLOUD_DATABASE: 'workspace', DATABASE_URL: 'postgresql://postgres@127.0.0.1/stelux_workspace_test', STELUX_DATABASE_PASSWORD: 'existing-workspace-password' };
  const config = runtimeConfig(env);
  assert.equal(config.databaseUrl, env.DATABASE_URL);
  assert.equal(config.cloudDatabaseSource, 'workspace');
  assert.equal(config.profile, 'welding-demo');
  assert.equal(postgresConfig(env, false).database, 'stelux_workspace_test');
  assert.equal(postgresConfig(env, false).password, env.STELUX_DATABASE_PASSWORD);
  assert.throws(() => runtimeConfig({ ...env, DATABASE_URL: '' }), /Set DATABASE_URL/);
  assert.throws(() => runtimeConfig({ ...env, STELUX_CLOUD_DATABASE: 'typo' }), /STELUX_CLOUD_DATABASE/);
  assert.equal(runtimeConfig(cloudEnv).cloudDatabaseSource, 'evaluation');
});

async function serve(store: Store, dir: string, initializeStorage = true) {
  return listen(createApp(store, dir, { releaseProfile: 'welding-demo', publicOrigin: cloudEnv.STELUX_PUBLIC_URL, secureCookies: true, documentStorage: 'database', initializeStorage }));
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0, '127.0.0.1');
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
    const existing = new Store(':memory:', db); seed(existing);
    const existingApp = await serve(existing, '/unused-workspace-path', false);
    const credentials = { name: 'Existing administrator', email: 'existing@example.test', password: 'Existing-Test-Password-123' };
    try { assert.equal((await existingApp.request('/api/auth/setup', 'POST', credentials)).status, 201); }
    finally { await existingApp.close(); }
    const savedCredential = db.prepare('SELECT hash FROM credentials').get()?.hash;
    existing.update('welds', 'weld-1', { description: 'Existing workspace record' }, existing.get('welds', 'weld-1')._version);
    assert.throws(() => workspaceCloudDatabase(db), /cloud document storage/);
    workspaceCloudDatabase(db, true);
    initializeDocumentStorage(existing);
    db.prepare("INSERT INTO metadata VALUES ('cloud_storage_v1','1')").run();
    assert.throws(() => cloudDatabase(db), /not an evaluation database/);
    const hostedEnv = { ...cloudEnv, STELUX_CLOUD_DATABASE: 'workspace', DATABASE_URL: testUrl!, STELUX_DEMO_DATABASE_URL: 'postgresql://wrong:wrong@127.0.0.1:1/unused' };
    for (const field of ['material1Id','material2Id','certificate1Id','certificate2Id']) db.exec(`ALTER TABLE welds DROP COLUMN "${field}"`);
    assert.throws(() => verifyWeldingTraceability(db), /Prepare welding traceability/);
    assert.throws(() => createCloudApp(hostedEnv), /Prepare welding traceability/);
    const prepared = prepareWeldingTraceability(db);
    assert.equal(prepared.recordsPreserved, true); assert.equal(prepared.counts.users, 1);
    assert.equal(prepareWeldingTraceability(db).recordsPreserved, true);
    assert.equal(db.prepare('SELECT hash FROM credentials').get()?.hash, savedCredential);
    const runtime = createCloudApp(hostedEnv);
    assert.equal(runtime.config.profile, HOSTED_RELEASE_PROFILE);
    const hosted = await listen(runtime.app);
    try {
      const status = await (await hosted.request('/api/auth/status')).json();
      assert.equal(status.requiresSetup, false);
      assert.equal(status.sampleWorkspace, false);
      assert.ok(status.availability.features.includes('lisl'));
      assert.ok(!status.availability.features.includes('local-access'));
      assert.equal(status.availability.reports.lisl.length, 87);
      assert.ok(status.availability.resources.certifications);
      const login = await hosted.request('/api/auth/login', 'POST', credentials);
      assert.equal(login.status, 200);
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      const bootstrap = await hosted.request('/api/bootstrap', 'GET', undefined, cookie);
      assert.equal(bootstrap.status, 200);
      assert.equal((await bootstrap.json()).rows.welds.find((row: { id: string }) => row.id === 'weld-1').description, 'Existing workspace record');
      assert.equal((await hosted.request('/api/auth/setup', 'POST', credentials)).status, 409);
      assert.equal((await hosted.request('/api/reports/lisl', 'GET', undefined, cookie)).status, 200);
      assert.equal(db.prepare('SELECT hash FROM credentials').get()?.hash, savedCredential);
      assert.equal(existing.list('users').length, 1);
    } finally { await hosted.close(); runtime.store.close(); }
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
    assert.throws(() => workspaceCloudDatabase(db), /full workspace/);
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
