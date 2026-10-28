import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store, SYSTEM } from '../server/store.ts';
import { importAccessPrototype } from '../server/import-access-prototype.ts';
import { runtimeConfig } from '../server/runtime-config.ts';
import { createApp } from '../server/http.ts';
import { RESOURCES } from '../shared/resources.ts';
import { availabilityFor, pageAvailable, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { buildReport } from '../shared/reports.ts';
import { LISL_COLUMNS } from '../shared/lisl.ts';
import { runAction } from '../server/workflows.ts';
import { passwordHash } from '../server/auth.ts';

const source = (weld = '01') => ({
  'Project site': 'Prototype test yard', Project: 'TEST-PV01', Isometric: 'TEST-ISO-001', 'Weld No': weld,
  'ITP No': 'ITP-001', 'X-Ray': '10', 'Weld Type': 'S', 'Joint type': 'BW', Welder: 'TEST80 | Test Welder', 'Welder 2': '------',
  'Weld date': '2024-09-03', VT: 'Yes', 'VT Report': '00119', 'NDT Req#': 'Yes',
  'NDT 1': 'RT test method', 'NDT 1 result': 'YES', 'NDT Report 1': 'REPORT-01',
  'WPS No': 'TEST-WPS-01', 'Diameter (inch)': '3', Outline: '279,1', 'Dia Length': '0',
  'Index No 1': '0060', 'Charge No 1': 'TEST-HEAT-1', 'Material 1': 'Test flange', 'Article no 1': 'TEST-FLANGE',
  'Index No 2': '0056', 'Charge No 2': 'TEST-HEAT-2', 'Material 2': 'Test elbow', 'Article no 2': 'TEST-ELBOW',
  'Wall thickness 1': 'SCH 10S', 'Wall thickness 2': 'SCH 10S', 'Schedule 1': 'SCH 10S', 'Schedule 2': 'SCH 10S',
  Created: '2024-09-05', 'Last edit date': '2024-09-05',
});
const rows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
function fixture(t: { after: (fn: () => void) => void }) { const store = new Store(':memory:'); t.after(() => store.close()); return store; }

test('LISL matches every source column and joins the normalized Access import without losing identifiers', t => {
  const store = fixture(t); assert.deepEqual(importAccessPrototype(store, [source(), source('02')]), { imported: 2, skipped: 0 });
  const schema = JSON.parse(readFileSync(new URL('../reference/access-prototype-schema.json', import.meta.url), 'utf8'));
  assert.equal(LISL_COLUMNS.length, 87); assert.deepEqual(LISL_COLUMNS.map(column => column.key), schema.columns);
  const report = buildReport('lisl', rows(store)); assert.equal(report.rows.length, 2);
  const first = report.rows.find(row => row.values['Weld No'] === '01')!;
  for (const column of report.columns) assert.ok(Object.hasOwn(first.values, column.key), column.key);
  assert.equal(first.values['Index No 1'], '0060'); assert.equal(first.values['Index No 2'], '0056');
  assert.equal(first.values['VT Report'], '00119'); assert.equal(first.values['VT Uploade'], 'No');
  assert.equal(first.values.Outline, 279.1); assert.equal(first.values.Created, '2024-09-05');
  assert.equal(first.values['NDT 1 result'], 'Accepted'); assert.equal(first.values['Material 2'], 'Test elbow');
  assert.equal(first.values['Welder 2'], ''); assert.equal(store.list('isometrics').length, 1); assert.equal(store.list('certifications').length, 2);
  assert.equal(store.list('isometrics')[0].ndtPercentage, 10);
  assert.ok(store.list('inspection_results').every(result => result.date === ''));
  assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(importAccessPrototype(store, [source(), source('02')]), { imported: 0, skipped: 2 });
});

test('an invalid later import row rolls back all related records, counters and audit events', t => {
  const store = fixture(t), before = JSON.stringify({ rows: rows(store), audit: store.activity(10000), counters: store.db.prepare('SELECT * FROM counters').all() });
  assert.throws(() => importAccessPrototype(store, [source(), { ...source('02'), 'NDT 1 result': 'unrecognized' }]), /Unknown inspection result/);
  assert.equal(JSON.stringify({ rows: rows(store), audit: store.activity(10000), counters: store.db.prepare('SELECT * FROM counters').all() }), before);
  assert.throws(() => importAccessPrototype(store, [source(), { ...source('02'), 'ITP No': 'CONFLICT' }]), /Conflicting ISO/);
  assert.equal(store.list('welds').length, 0);
});

test('both weld sides enforce material and heat-number certificates, including later certificate edits', t => {
  const store = fixture(t); importAccessPrototype(store, [source()]); const weld = store.list('welds')[0];
  for (const side of [1, 2]) {
    const other = side === 1 ? 2 : 1, before = JSON.stringify({ rows: rows(store), audit: store.activity(10000) });
    assert.throws(() => store.update('welds', weld.id, { [`certificate${side}Id`]: weld[`certificate${other}Id`] }, weld._version), /certificate must match/);
    assert.throws(() => store.update('welds', weld.id, { [`chargeNo${side}`]: 'WRONG-HEAT' }, weld._version), /must match the certificate/);
    const certificate = store.get('certifications', weld[`certificate${side}Id`]);
    assert.throws(() => store.update('certifications', certificate.id, { chargeNo: 'WRONG-HEAT' }, certificate._version), /linked to a weld/);
    assert.equal(JSON.stringify({ rows: rows(store), audit: store.activity(10000) }), before);
  }
  const newWeld = store.create('welds', { weldNo: '03', isoId: weld.isoId, certificate1Id: weld.certificate1Id });
  assert.equal(newWeld.material1Id, weld.material1Id); assert.equal(newWeld.chargeNo1, weld.chargeNo1);
});

test('LISL displays the latest result per NDT request while preserving all results and heat treatment links', t => {
  const store = fixture(t); importAccessPrototype(store, [source()]); const weld = store.list('welds')[0];
  const request = store.list('inspection_requests').find(request => request.type === 'NDT')!;
  runAction(store, 'inspection-result', { requestId: request.id, result: 'Rejected', reportNo: 'REJECT-02', naLength: 12, defectType: 'Test defect', date: '2024-09-06' }, SYSTEM);
  const process = store.create('pwht_processes', { name: 'Test heat treatment' }), location = store.create('pwht_locations', { name: 'Test furnace' });
  const heat = runAction(store, 'inspection-request', { weldIds: [weld.id], type: 'PWHT', pwhtProcessId: process.id, pwhtLocationId: location.id, date: '2024-09-07' }, SYSTEM);
  runAction(store, 'inspection-result', { requestId: heat.records![0].id, result: 'Accepted', reportNo: 'HEAT-01', date: '2024-09-08' }, SYSTEM);
  const values = buildReport('lisl', rows(store)).rows[0].values;
  assert.equal(values['NDT 1 result'], 'Rejected'); assert.equal(values['NDT Report 1'], 'REJECT-02'); assert.equal(values['NA Length'], 12);
  assert.equal(values['PWHT location'], 'Test furnace'); assert.equal(values['PWHT report no'], 'HEAT-01');
  assert.equal(store.list('inspection_results').filter(result => result.type === 'NDT').length, 2);
  assert.throws(() => runAction(store, 'inspection-result', { requestId: request.id, result: 'Rejected', reportNo: 'INVALID', examinedLength: 10, naLength: 11 }, SYSTEM), /Not accepted length/);
});

test('prototype runtime remains local and its catalog keeps the existing welding-demo scope intact', () => {
  const config = runtimeConfig({ STELUX_RELEASE_PROFILE: 'access-prototype', DATABASE_URL: 'postgresql://production.invalid/db', STELUX_HOST: '0.0.0.0', NODE_ENV: 'production' });
  assert.equal(config.databaseUrl, undefined); assert.equal(config.host, '127.0.0.1'); assert.equal(config.port, 3003);
  assert.match(config.dataDir, /access-prototype$/); assert.match(config.distDir, /dist-access-prototype$/);
  assert.throws(() => runtimeConfig({ STELUX_RELEASE_PROFILE: 'access-prototype', STELUX_PROTOTYPE_DATA_DIR: '.data' }), /own data directory/);
  assert.throws(() => runtimeConfig({ STELUX_RELEASE_PROFILE: 'access-prototype', STELUX_PROTOTYPE_DATA_DIR: '.data/welding-demo' }), /own data directory/);
  assert.throws(() => runtimeConfig({ STELUX_RELEASE_PROFILE: 'access-prototype', STELUX_RUNTIME: 'cloud' }), /requires the welding-demo/);
  const prototype = availabilityFor('access-prototype')!, demo = availabilityFor('welding-demo')!;
  assert.ok(prototype.resources.certifications); assert.equal(demo.resources.certifications, undefined);
  assert.ok(pageAvailable(prototype, '/welding/lisl', RESOURCES)); assert.equal(pageAvailable(prototype, '/workspace/schema', RESOURCES), false); assert.ok(!pageAvailable(demo, '/welding/lisl', RESOURCES));
  assert.ok(!demo.resources.welds.includes('certificate1Id')); assert.ok(!demo.actions['inspection-result'].includes('naLength'));
});

test('local prototype persists across reopening without seeding fictional project records', t => {
  const dir = mkdtempSync(join(tmpdir(), 'access-prototype-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'test.sqlite'); let store = new Store(file); importAccessPrototype(store, [source()]); const weld = store.list('welds')[0]; store.close();
  store = new Store(file); try { assert.equal(store.list('welds').length, 1); assert.equal(store.get('welds', weld.id).certificate1Id, weld.certificate1Id); assert.equal(store.list('projects').length, 1); assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []); } finally { store.close(); }
});

for (const releaseProfile of ['access-prototype', HOSTED_RELEASE_PROFILE] as const) test(`${releaseProfile} HTTP serves the joined CSV, validates writes, and keeps read-only accounts restricted`, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'access-prototype-http-')); const store = new Store(join(dir, 'test.sqlite')); importAccessPrototype(store, [source()]);
  const server = createApp(store, dir, { releaseProfile }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/reports/lisl')).status, 401);
  const setup = await request('/auth/setup', 'POST', { name: 'Local tester', email: 'prototype@example.test', password: 'Local-Prototype-Test-Only' });
  assert.equal(setup.status, 201); assert.ok(setup.headers.get('set-cookie')!.startsWith(releaseProfile === 'access-prototype' ? 'blitzkrieg_prototype_session=' : 'blitzkrieg_session='));
  const bootstrap = await (await request('/bootstrap')).json(); assert.equal(bootstrap.rows.welds.length, 1); assert.equal(bootstrap.rows.certifications.length, 2); assert.equal(bootstrap.user.availability.features.includes('local-access'), releaseProfile === 'access-prototype');
  const csv = await request('/reports/lisl?q=0060'); assert.equal(csv.status, 200); assert.match(await csv.text(), /0060/);
  const project = store.list('projects')[0], iso = store.list('isometrics')[0];
  assert.equal((await request('/bulk/projects', 'POST', { ids: [project.id], changes: { contact: 'Bulk contact' }, versions: { [project.id]: project._version } })).status, 200);
  assert.equal(store.get('projects', project.id).contact, 'Bulk contact');
  assert.equal((await request('/bulk/isometrics', 'POST', { ids: [iso.id], changes: { area: 'Unit A' }, versions: { [iso.id]: iso._version } })).status, 200);
  assert.equal(store.get('isometrics', iso.id).area, 'Unit A');
  assert.equal((await request('/bulk/projects', 'POST', { ids: [project.id], changes: { contact: 'Must not save', workingdays: 25 } })).status, 404);
  assert.equal(store.get('projects', project.id).contact, 'Bulk contact');
  assert.equal((await request('/bulk/welds', 'POST', { ids: [bootstrap.rows.welds[0].id], changes: { description: 'Unavailable bulk area' } })).status, 404);

  const weld = store.list('welds')[0]; assert.equal((await request(`/records/welds/${weld.id}`, 'PUT', { _version: weld._version, chargeNo1: 'WRONG' })).status, 422);
  const wps = store.get('wps', weld.wpsId); store.update('wps', wps.id, { active: false }, wps._version);
  assert.equal((await request('/records/welds', 'POST', { weldNo: 'NEW', isoId: weld.isoId, wpsId: wps.id })).status, 422);
  const profile = store.create('profiles', { name: 'Prototype viewer', generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  assert.equal((await request('/records/users', 'POST', { name: 'Viewer', email: 'viewer@example.test', profileId: profile.id, password: 'Prototype-Viewer-Test-Only', active: true })).status, 404);
  const viewer = store.create('users', { name: 'Viewer', email: 'viewer@example.test', profileId: profile.id, active: true });
  store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(viewer.id, passwordHash('Prototype-Viewer-Test-Only'));
  assert.equal((await request('/auth/login', 'POST', { email: 'viewer@example.test', password: 'Prototype-Viewer-Test-Only' })).status, 200);
  assert.equal((await request('/reports/lisl')).status, 200);
  assert.equal((await request(`/records/welds/${weld.id}`, 'PUT', { _version: weld._version, description: 'Blocked edit' })).status, 403);
  assert.equal((await request('/bulk/projects', 'POST', { ids: [project.id], changes: { contact: 'Blocked viewer' } })).status, 403);
});
