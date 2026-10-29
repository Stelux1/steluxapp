import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { RESOURCES } from '../shared/resources.ts';
import { wdiProgress } from '../shared/wdi.ts';
import { calculationEntries } from '../shared/planning.ts';
import { buildReport } from '../shared/reports.ts';
import { projectScope } from '../shared/project-scope.ts';
import type { Row } from '../shared/types.ts';

const rows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
function fixture(t: { after: (fn: () => void) => void }) { const store = new Store(':memory:'); seed(store); t.after(() => store.close()); return store; }
function requirement(store: Store, isoId = 'iso-1') {
  return store.create('iso_materials', { isoId, customMaterial: true, materialNo: 'PLANNING-PIPE', description: 'Measured planning material', uom: 'M', quantity: 4.5 });
}

test('WDI weights diameter inches and Welder IDs independently of dates and welder count', () => {
  const weld = (id: string, props: Record<string, unknown>) => ({ id, _archived: false, ...props } as Row);
  const result = wdiProgress([
    weld('large', { diameterId: 'eight', welder2Id: 'second', welder3Id: 'third', date: '' }),
    weld('small', { diameterId: 'two', welder1Id: '', date: '2026-10-29' }),
    weld('unknown', { diameterId: 'missing', welder1Id: 'first' }),
    weld('archived', { diameterId: 'eight', welder1Id: 'first', _archived: true }),
  ], [weld('eight', { sizeinch: 8 }), weld('two', { sizeinch: 2 })]);
  assert.deepEqual(result, { total: 10, completed: 8, remaining: 2, percent: 80, unmeasured: 1, welds: 3, completedWelds: 2 });
  assert.equal(wdiProgress([], []).percent, 0);
  assert.equal(wdiProgress([weld('none', { diameterId: 'invalid' })], [weld('invalid', { sizeinch: null })]).unmeasured, 1);
});

test('calculation follows MTO quantity changes, separates units, and preserves explicit zero norms', t => {
  const store = fixture(t), material = requirement(store);
  const norm = store.create('calculation_norms', { name: 'Test pipe operation', uom: 'm', hoursPerUnit: 0.25 });
  store.create('calculation_lines', { name: 'Pipe operation', isoId: material.isoId, requirementId: material.id, normId: norm.id, quantity: 999 });
  let entries = calculationEntries(rows(store)); assert.equal(entries[0].quantity, 4.5); assert.equal(entries[0].hours, 1.125);
  store.update('iso_materials', material.id, { quantity: 7.2 }, material._version);
  entries = calculationEntries(rows(store)); assert.equal(entries[0].quantity, 7.2); assert.equal(entries[0].hours, 1.8);
  const zero = store.update('calculation_norms', norm.id, { hoursPerUnit: 0 }, norm._version);
  assert.equal(calculationEntries(rows(store))[0].hours, 0);
  store.update('calculation_norms', norm.id, { uom: 'EA' }, zero._version);
  entries = calculationEntries(rows(store)); assert.equal(entries[0].hours, null); assert.equal(entries[0].status, 'Unit mismatch');
  const restricted = rows(store); restricted.calculation_norms = [];
  assert.equal(calculationEntries(restricted)[0].hours, null);
});

test('planning rejects cross-isometric links, fractional pieces, unit mismatches and invalid quantities atomically', t => {
  const store = fixture(t), material = requirement(store);
  const norm = store.create('calculation_norms', { name: 'EA norm', uom: 'EA', hoursPerUnit: 1 });
  const before = store.activity(10000).length;
  assert.throws(() => store.create('cut_list', { name: 'Other ISO', isoId: 'iso-2', requirementId: material.id, quantity: 1, lengthMm: 100 }), /belong to the selected/);
  assert.throws(() => store.create('cut_list', { name: 'Fractional', isoId: material.isoId, requirementId: material.id, quantity: 1.5, lengthMm: 100 }), /whole number/);
  assert.throws(() => store.create('cut_list', { name: 'Wrong spool', isoId: material.isoId, requirementId: material.id, spoolId: 'spool-2', quantity: 1, lengthMm: 100 }), /spool must belong/);
  assert.throws(() => store.create('calculation_lines', { name: 'Wrong unit', isoId: material.isoId, requirementId: material.id, normId: norm.id }), /same unit/);
  assert.throws(() => store.create('calculation_lines', { name: 'No quantity', isoId: material.isoId, normId: norm.id }), /manual quantity/);
  assert.equal(store.list('cut_list').length, 0); assert.equal(store.list('calculation_lines').length, 0); assert.equal(store.activity(10000).length, before);
});

test('planning scopes match main project and isometric reports, including custom MTO materials', t => {
  const store = fixture(t), material = requirement(store), other = requirement(store, 'iso-4');
  const norm = store.create('calculation_norms', { name: 'Metre operation', uom: 'M', hoursPerUnit: 2 });
  for (const item of [material, other]) {
    store.create('calculation_lines', { name: 'Scoped operation', isoId: item.isoId, requirementId: item.id, normId: norm.id });
    store.create('cut_list', { name: 'Piece 1', isoId: item.isoId, requirementId: item.id, quantity: 3, lengthMm: 1250.5 });
  }
  const all = rows(store), siteId = String(store.get('projects', store.get('isometrics', material.isoId).projectId).siteId), scoped = projectScope(all, siteId);
  for (const key of ['mto', 'calculation', 'cut-list']) assert.deepEqual(buildReport(key, all, { siteId }).rows, buildReport(key, scoped).rows);
  const cut = buildReport('cut-list', all, { isoId: String(material.isoId) });
  assert.equal(cut.rows.length, 1); assert.equal(cut.rows[0].values.totalMm, 3751.5); assert.equal(cut.rows[0].values.material, 'PLANNING-PIPE');
});

test('hosted planning CRUD, formula spreadsheets, scoped exports and viewer permissions work together', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-planning-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const app = createApp(store, dir, { releaseProfile: 'welding-workspace', serveClient: false }).listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { app.close(() => resolve()); app.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`; let cookie = '';
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  }
  const password = 'Planning-Test-Password';
  assert.equal((await request('/auth/setup', 'POST', { name: 'Planning admin', email: 'plan@example.test', password })).status, 201);
  let response = await request('/actions/add-iso-material', 'POST', { isoId: 'iso-1', source: 'Custom', materialNo: 'HTTP-PIPE', description: 'HTTP pipe', quantity: 2.5, uom: 'M' });
  assert.equal(response.status, 201); const material = (await response.json()).record;
  response = await request('/records/calculation_norms', 'POST', { name: 'HTTP metre norm', uom: 'M', hoursPerUnit: 0.5 });
  assert.equal(response.status, 201); const norm = (await response.json()).record;
  assert.equal((await request('/records/calculation_lines', 'POST', { name: 'HTTP work', isoId: 'iso-1', requirementId: material.id, normId: norm.id })).status, 201);
  assert.equal((await request('/records/cut_list', 'POST', { name: 'HTTP cut', isoId: 'iso-1', requirementId: material.id, quantity: 2, lengthMm: 1000.25 })).status, 201);
  for (const [key, output, expected, formula] of [['calculation', 'hours', 1.25, 'E2*H2'], ['cut-list', 'totalMm', 2000.5, 'F2*G2']] as const) {
    response = await request(`/reports/${key}?isoId=iso-1&format=xlsx`); assert.equal(response.status, 200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
    assert.equal(workbook.worksheets[0].name, key === 'cut-list' ? 'MSPS_Cut_list' : 'M25001_Project_cal_MSPS');
    const report = buildReport(key, rows(store), { isoId: 'iso-1' });
    const column = report.columns.findIndex(column => column.key === output) + 1;
    assert.deepEqual(workbook.worksheets[0].getCell(2, column).value, { formula, result: expected });
    assert.equal(workbook.worksheets[0].rowCount, 2);
    assert.equal((await request(`/reports/${key}?isoId=iso-2`)).status, 200);
    assert.doesNotMatch(await (await request(`/reports/${key}?isoId=iso-2`)).text(), /HTTP work|HTTP cut/);
  }
  const update = await request(`/records/iso_materials/${material.id}`, 'PUT', { quantity: 5, _version: material._version }); assert.equal(update.status, 200);
  assert.equal(buildReport('calculation', rows(store), { isoId: 'iso-1' }).rows[0].values.hours, 2.5);
  const user = store.create('users', { name: 'Planning viewer', email: 'viewer-plan@example.test', profileId: 'profile-viewer', active: true });
  const { passwordHash } = await import('../server/auth.ts'); store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
  assert.equal((await request('/auth/login', 'POST', { email: user.email, password })).status, 200);
  assert.equal((await request('/reports/mto?isoId=iso-1')).status, 200);
  assert.equal((await request('/records/cut_list', 'POST', { name: 'Denied' })).status, 403);
  assert.equal((await request('/actions/add-iso-material', 'POST', {})).status, 403);
  assert.equal((await request(`/records/iso_materials/${material.id}/archive`, 'POST', { _version: 2 })).status, 403);
});

test('empty project hierarchy can be archived and restored while active links and stale versions are protected', t => {
  const store = fixture(t), site = store.create('sites', { name: 'Archive test main project' });
  const project = store.create('projects', { internnumber: 'Archive test subproject', siteId: site.id });
  const iso = store.create('isometrics', { isoNo: 'Archive test ISO', projectId: project.id });
  assert.throws(() => store.archive('sites', site.id, site._version, { id: 'test', name: 'Test' }), /used by active/);
  const archivedIso = store.archive('isometrics', iso.id, iso._version, { id: 'test', name: 'Test' });
  assert.throws(() => store.archive('isometrics', iso.id, iso._version, { id: 'test', name: 'Test' }), /changed/);
  const archivedProject = store.archive('projects', project.id, project._version, { id: 'test', name: 'Test' });
  const archivedSite = store.archive('sites', site.id, site._version, { id: 'test', name: 'Test' });
  for (const [key, record] of [['sites', archivedSite], ['projects', archivedProject], ['isometrics', archivedIso]] as const) assert.equal(store.archive(key, record.id, record._version, { id: 'test', name: 'Test' })._archived, false);
});
