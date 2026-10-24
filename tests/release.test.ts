import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { runtimeConfig } from '../server/runtime-config.ts';
import { RESOURCES } from '../shared/resources.ts';
import { availabilityFor, projectResource } from '../shared/release.ts';
import { availableWps, RELATIONS, relationIds } from '../shared/welding.ts';
import type { Bootstrap, Row } from '../shared/types.ts';
import * as catalog from '../client/catalog.ts';

const password = 'Evaluation-Test-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-release-'));
  const s = new Store(join(dir, 'test.sqlite')); seed(s);
  // Deliberately present files that must never be served by the public profile.
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  writeFileSync(join(dir, 'private.js.map'), 'private source content');
  writeFileSync(join(dir, 'README.md'), 'internal documentation');
  const demo = createApp(s, dir, { releaseProfile: 'welding-demo', distDir: dir }).listen(0, '127.0.0.1');
  const full = createApp(s, dir, { distDir: dir }).listen(0, '127.0.0.1');
  await Promise.all([once(demo, 'listening'), once(full, 'listening')]);
  const base = (server: typeof demo) => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies = { full: '', demo: '' };
  async function request(path: string, method = 'GET', data?: unknown, internal = false) {
    const cookieKey=internal?'full':'demo'; const cookie=cookies[cookieKey];
    const response = await fetch(base(internal ? full : demo) + path, { method, headers: { ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: base(internal ? full : demo), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined || method === 'GET' || method === 'HEAD' ? undefined : data instanceof FormData ? data : JSON.stringify(data) });
    const next = response.headers.get('set-cookie'); if (next) cookies[cookieKey] = next.split(';')[0];
    return response;
  }
  const setup = async () => {
    const response = await request('/api/auth/setup', 'POST', { name: 'Evaluation admin', email: 'evaluation@example.test', password });
    assert.equal(response.status, 201);
    assert.match(response.headers.get('set-cookie')!, /^blitzkrieg_session=/);
    assert.equal((await request('/api/auth/login','POST',{email:'evaluation@example.test',password},true)).status,200);
    return response.json();
  };
  t.after(async () => {
    await Promise.all([demo, full].map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
    s.close(); rmSync(dir, { recursive: true, force: true });
  });
  return { s, dir, request, setup };
}
const allRows = (s: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, s.list(resource.key, true)]));

test('evaluation storage cannot select the full workspace or its configured PostgreSQL database', t => {
  const env = { DATABASE_URL: 'postgresql://production.invalid/database', STELUX_DATA_DIR: '/private/tmp/full-workspace' };
  const full = runtimeConfig(env, '/private/tmp/project');
  const demo = runtimeConfig({ ...env, STELUX_RELEASE_PROFILE: 'welding-demo' }, '/private/tmp/project');
  assert.equal(full.databaseUrl, env.DATABASE_URL);
  assert.equal(demo.databaseUrl, undefined);
  assert.notEqual(demo.dataDir, full.dataDir);
  assert.equal(runtimeConfig({STELUX_RELEASE_PROFILE:'welding-demo',NODE_ENV:'production'}).port,3002);
  assert.equal(runtimeConfig({NODE_ENV:'production'}).port,3000);
  assert.match(demo.distDir, /dist-welding-demo$/);
  assert.throws(() => runtimeConfig({ ...env, STELUX_RELEASE_PROFILE: 'welding-demo', STELUX_DEMO_DATA_DIR: env.STELUX_DATA_DIR }), /own data directory/);
  assert.throws(() => runtimeConfig({ STELUX_RELEASE_PROFILE: 'typo' }), /Unknown/);
  const root = mkdtempSync(join(tmpdir(), 'blitzkrieg-storage-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'full')); symlinkSync(join(root, 'full'), join(root, 'alias'));
  assert.throws(() => runtimeConfig({ STELUX_RELEASE_PROFILE: 'welding-demo', STELUX_DATA_DIR: 'full', STELUX_DEMO_DATA_DIR: 'alias' }, root), /own data directory/);
  assert.throws(() => runtimeConfig({ STELUX_RELEASE_PROFILE: 'welding-demo', STELUX_DATA_DIR: 'full', STELUX_DEMO_DATA_DIR: 'full/uploads/evaluation' }, root), /own data directory/);
});

test('the delivered catalog removes fields, actions, relations and reports and can restore the full catalog', () => {
  const availability = availabilityFor('welding-demo')!;
  catalog.configureCatalog(availability);
  assert.equal(catalog.RESOURCE_MAP.materials, undefined);
  assert.equal(catalog.RESOURCE_MAP.pqr, undefined);
  assert.ok(catalog.RESOURCE_MAP.welds.fields.some(field => field.name === 'wire1Id'));
  assert.ok(!catalog.RESOURCE_MAP.welds.fields.some(field => field.name === 'pwhtReq'));
  assert.deepEqual(catalog.ACTIONS['inspection-request'].fields.find(field => field.name === 'type')?.options, ['NDT', 'VI']);
  assert.equal(catalog.ACTIONS.release, undefined);
  assert.deepEqual(catalog.RELATIONS.wps.map(relation => relation.field), ['projectIds', 'siteIds']);
  assert.deepEqual(catalog.REPORTS.map(report => report.key), ['wdi', 'inspection-results']);
  for (const resource of catalog.RESOURCES) for (const field of resource.fields) if (field.ref) assert.ok(catalog.RESOURCE_MAP[field.ref], `${resource.key}.${field.name} has a missing reference`);
  catalog.configureCatalog();
  assert.ok(catalog.RESOURCE_MAP.materials);
  assert.ok(catalog.ACTIONS.release);
  assert.equal(catalog.RELATIONS.wps.length, 3);
});

test('administrator bootstrap exposes only positive capabilities and allowed inspection records', async t => {
  const f = await fixture(t); const setup = await f.setup();
  assert.equal(setup.user.permissions.materials, 0); assert.equal(setup.user.permissions.settings, 0);
  f.s.create('inspection_requests', { weldId: 'weld-1', type: 'PWHT', date: '2026-10-01', status: 'Open' });
  const response = await f.request('/api/bootstrap'); assert.equal(response.status, 200);
  const data = await response.json() as Bootstrap;
  const availability = data.user.availability!;
  for (const key of ['materials', 'articles', 'pqr', 'profiles', 'users', 'revisions', 'releases', 'pwht_processes', 'welder_certificates', 'wps_pqr']) assert.equal(data.rows[key], undefined, key);
  assert.ok(data.rows.wps_sites.length); assert.ok(data.rows.welds.length);
  assert.ok(data.rows.inspection_requests.every(row => ['NDT', 'VI'].includes(String(row.type))));
  assert.equal(data.rows.welds[0].pwhtReq, undefined); assert.equal(data.rows.isometrics[0].revNo, undefined); assert.equal(data.rows.wps[0].pqrId, undefined);
  assert.deepEqual(Object.keys(availability.reports), ['wdi', 'inspection-results']);
  for (const [key, rows] of Object.entries(data.rows)) for (const row of rows) for (const name of Object.keys(row)) assert.ok(name === 'id' || name.startsWith('_') || availability.resources[key].includes(name), `${key}.${name}`);
  const full = await (await f.request('/api/bootstrap', 'GET', undefined, true)).json() as Bootstrap;
  assert.equal(full.user.availability, undefined); assert.ok(full.rows.materials.length); assert.ok(full.rows.pqr.length); assert.equal(full.user.permissions.settings, 3);
});

test('evaluation and internal session cookies coexist and signing out preserves the other session', async t => {
  const f = await fixture(t); await f.setup();
  assert.equal((await f.request('/api/bootstrap')).status, 200);
  assert.equal((await f.request('/api/bootstrap', 'GET', undefined, true)).status, 200);
  const logout = await f.request('/api/auth/logout', 'POST', {});
  assert.match(logout.headers.get('set-cookie')!, /^blitzkrieg_session=/);
  assert.equal((await f.request('/api/bootstrap')).status, 401);
  assert.equal((await f.request('/api/bootstrap', 'GET', undefined, true)).status, 200);
  const status = await (await f.request('/api/auth/status')).json();
  assert.deepEqual(status.availability.inspectionTypes, ['NDT', 'VI']);
});

test('direct routes, disabled verbs and forged fields cannot bypass the public profile', async t => {
  const f = await fixture(t); await f.setup();
  for (const key of ['materials', 'articles', 'pqr', 'profiles', 'users', 'revisions', 'releases', 'test_systems']) {
    for (const endpoint of [`/api/records/${key}`, `/api/export/${key}`, `/api/history/${key}/any`]) assert.equal((await f.request(endpoint)).status, 404, endpoint);
    assert.equal((await f.request(`/api/records/${key}`, 'POST', {})).status, 404);
  }
  for (const endpoint of ['/api/import/welds/template', '/api/import/welds/preview', '/api/import/welds', '/api/bulk/welds', '/api/revisions']) assert.equal((await f.request(endpoint, endpoint.endsWith('template') ? 'GET' : 'POST', {})).status, 404, endpoint);
  for (const key of ['release', 'revision', 'phases', 'rent', 'service-materials']) assert.equal((await f.request(`/api/actions/${key}`, 'POST', {})).status, 404, key);
  for (const type of ['NDT PRE', 'PWHT', 'PRE-HT']) assert.equal((await f.request('/api/actions/inspection-request', 'POST', { type, weldIds: ['weld-1'], date: '2026-10-01' })).status, 404);
  const weld = f.s.get('welds', 'weld-1');
  assert.equal((await f.request('/api/records/welds/weld-1', 'PUT', { _version: weld._version, pwhtReq: true })).status, 404);
  assert.equal(f.s.get('welds', weld.id)._version, weld._version);
  for (const route of ['/materials', '/tools', '/welding/pqr', '/settings/profiles', '/workspace/reports', '/welding/reports?report=releases', '/private.js.map', '/README.md']) assert.equal((await f.request(route)).status, 404, route);
  assert.equal((await f.request('/welding/welds')).status, 200);
});

test('editing basic records preserves hidden values, PQR links and WPS project/site applicability', async t => {
  const f = await fixture(t); await f.setup();
  const wps = f.s.create('wps', { name: 'SCOPE-TEST', method: '141', definition: 'Scope test', allProjects: false, siteIds: ['site-north'], projectIds: ['project-cooling'], pqrIds: ['pqr-1'] });
  const before = allRows(f.s); const oldRelations = RELATIONS.wps.map(relation => relationIds(before, relation, wps.id));
  const response = await f.request(`/api/records/wps/${wps.id}`, 'PUT', { _version: wps._version, definition: 'Updated scope description' }); assert.equal(response.status, 200);
  const updated = f.s.get('wps', wps.id); assert.equal(updated.pqrId, wps.pqrId);
  assert.deepEqual(RELATIONS.wps.map(relation => relationIds(allRows(f.s), relation, wps.id)), oldRelations);
  assert.equal(availableWps(allRows(f.s), updated, 'project-cooling'), true); assert.equal(availableWps(allRows(f.s), updated, 'project-steam'), false);
  const iso = f.s.get('isometrics', 'iso-1');
  assert.equal((await f.request(`/api/records/isometrics/${iso.id}`, 'PUT', { _version: iso._version, description: 'Edited basic drawing' })).status, 200);
  const changed = f.s.get('isometrics', iso.id); const visible = projectResource(availabilityFor('welding-demo'), RESOURCES.find(resource => resource.key === 'isometrics')!);
  for (const field of RESOURCES.find(resource => resource.key === 'isometrics')!.fields.filter(field => !visible.fields.some(allowed => field.name === allowed.name))) assert.deepEqual(changed[field.name], iso[field.name], field.name);
  const bad = await f.request('/api/records/welds', 'POST', { weldNo: 'BAD-SCOPE', isoId: 'iso-5', wpsId: wps.id }); assert.equal(bad.status, 422);
});

test('allowed welding workflow supports rejected results, repair, repeat examinations and documents', async t => {
  const f = await fixture(t); await f.setup();
  let response = await f.request('/api/records/welds', 'POST', { weldNo: 'DEMO-CYCLE', isoId: 'iso-1', welder1Id: 'welder-1', lengthMode: 'Length in mm', dialen: 150, date: '2026-10-01', ndoReq: true });
  assert.equal(response.status, 201); const weld = (await response.json()).record as Row;
  assert.equal(weld.pwhtReq, undefined);
  response = await f.request('/api/actions/inspection-request', 'POST', { type: 'NDT', weldIds: [weld.id], date: '2026-10-02' }); assert.equal(response.status, 201); const request = (await response.json()).records[0] as Row;
  assert.equal(request.pwhtProcessId, undefined);
  response = await f.request('/api/actions/inspection-result', 'POST', { requestId: request.id, reportNo: 'NDT-001', result: 'Rejected', round: 'Initial', examinedLength: 150, date: '2026-10-03' }); assert.equal(response.status, 201);
  assert.equal((await f.request('/api/actions/repair', 'POST', { weldId: weld.id, date: '2026-10-04', note: 'Repair recorded' })).status, 201);
  response = await f.request('/api/actions/inspection-result', 'POST', { requestId: request.id, reportNo: 'NDT-002', result: 'Accepted', round: 'Additional 1', examinedLength: 150, date: '2026-10-05' }); assert.equal(response.status, 201); const result = (await response.json()).record as Row;
  const file = new FormData(); file.set('entityType', 'inspection_results'); file.set('entityId', result.id); file.set('file', new Blob(['Accepted inspection report']), 'ndt-report.txt');
  response = await f.request('/api/files', 'POST', file); assert.equal(response.status, 201); const attachment = (await response.json()).record as Row;
  response = await f.request(`/api/files/${attachment.id}`); assert.equal(response.status, 200); assert.equal(await response.text(), 'Accepted inspection report');
  assert.equal((await f.request('/api/actions/inspection-request', 'POST', { type: 'VI', weldIds: [weld.id], date: '2026-10-05' })).status, 201);
  assert.equal(f.s.list('inspection_results').filter(row => row.requestId === request.id).length, 2); assert.equal(f.s.get('inspection_requests', request.id).status, 'Accepted'); assert.equal(f.s.get('welds', weld.id).repair, true);
  const history = await (await f.request(`/api/history/welds/${weld.id}`)).json(); assert.ok(history.events.some((event: { action: string }) => event.action === 'repair'));
});

test('files, inspection subtype history and CSV/XLSX/report exports cannot expose omitted data', async t => {
  const f = await fixture(t); await f.setup();
  f.s.audit('welds', 'weld-1', 'inspected', 'NDT PRE accepted · PRIVATE-REPORT', { id: 'test-auditor', name: 'Test auditor' });
  const privateEvent = f.s.activity(1000).find(event => event.summary.includes('PRIVATE-REPORT'))!;
  const weldHistory = await (await f.request('/api/history/welds/weld-1')).json();
  assert.ok(!weldHistory.events.some((event: { id: string }) => event.id === privateEvent.id));
  const bootstrapHistory = await (await f.request('/api/bootstrap')).json() as Bootstrap;
  assert.ok(!bootstrapHistory.activity.some(event => event.id === privateEvent.id));
  const hidden = f.s.create('inspection_requests', { weldId: 'weld-1', type: 'PWHT', date: '2026-10-01', status: 'Open' });
  for (const [type, id] of [['inspection_requests', hidden.id], ['pqr', 'pqr-1']]) {
    const body = new FormData(); body.set('entityType', type); body.set('entityId', id); body.set('file', new Blob(['Hidden record document']), 'private.txt');
    const uploaded = await f.request('/api/files', 'POST', body, true); assert.equal(uploaded.status, 201); const attachment = (await uploaded.json()).record as Row;
    assert.equal((await f.request(`/api/files/${attachment.id}`)).status, 404);
    assert.equal((await f.request(`/api/history/attachments/${attachment.id}`)).status, 404);
    assert.equal((await f.request('/api/files', 'POST', body)).status, 404);
    const bootstrap = await (await f.request('/api/bootstrap')).json() as Bootstrap;
    assert.ok(!bootstrap.rows.attachments.some(row => row.id === attachment.id));
  }
  assert.equal((await f.request(`/api/history/inspection_requests/${hidden.id}`)).status, 404);
  assert.equal((await f.request('/api/actions/inspection-result', 'POST', { requestId: hidden.id, reportNo: 'HIDDEN', result: 'Accepted', date: '2026-10-02' })).status, 404);
  for (const key of ['releases', 'mto', 'welder', 'weld-cards', 'revisions']) assert.equal((await f.request(`/api/reports/${key}`)).status, 404);
  for (const endpoint of ['/api/export/welds', '/api/export/wps', '/api/export/isometrics', '/api/reports/wdi', '/api/reports/inspection-results']) {
    const response = await f.request(endpoint); assert.equal(response.status, 200, endpoint);
    const text = await response.text(); assert.doesNotMatch(text, /PWHT|Pre-HT|NDT PRE|PQR|Qualification|Revision|Prefab|Hydrotest/i, endpoint);
  }
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook(); const xlsx = await f.request('/api/export/welds?format=xlsx'); assert.equal(xlsx.status, 200);
  await workbook.xlsx.load(await xlsx.arrayBuffer());
  assert.doesNotMatch(JSON.stringify(workbook.worksheets[0].getRow(1).values), /PWHT|Pre-HT|NDT PRE|PQR|Qualification|Revision/i);
});

test('account permissions still restrict writes and report exports within the delivered scope', async t => {
  const f = await fixture(t); await f.setup();
  assert.equal((await f.request('/api/records/users', 'POST', { name: 'Viewer', email: 'viewer@example.test', profileId: 'profile-viewer', active: true, password }, true)).status, 201);
  assert.equal((await f.request('/api/auth/login', 'POST', { email: 'viewer@example.test', password })).status, 200);
  assert.equal((await f.request('/api/records/welds', 'POST', { weldNo: 'DENIED', isoId: 'iso-1' })).status, 403);
  assert.equal((await f.request('/api/actions/inspection-request', 'POST', { type: 'NDT', weldIds: ['weld-1'], date: '2026-10-01' })).status, 403);
  assert.equal((await f.request('/api/reports/wdi')).status, 200);
  assert.equal((await f.request('/api/records/materials')).status, 404);
  const profile = f.s.create('profiles', { name: 'Treatment results only', permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '97': ['show'] }) });
  assert.equal((await f.request('/api/records/users', 'POST', { name: 'Scoped reader', email: 'scoped@example.test', profileId: profile.id, active: true, password }, true)).status, 201);
  assert.equal((await f.request('/api/auth/login', 'POST', { email: 'scoped@example.test', password })).status, 200);
  assert.equal((await f.request('/api/records/inspection_results')).status, 403);
  assert.equal((await f.request('/api/reports/inspection-results')).status, 403);
  const data = await (await f.request('/api/bootstrap')).json() as Bootstrap;
  assert.equal(data.rows.inspection_results, undefined);
});
