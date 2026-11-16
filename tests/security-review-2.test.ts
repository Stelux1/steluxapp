import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { inspectionRules } from '../server/inspections.ts';
import { runAction } from '../server/workflows.ts';
import { columnsFor } from '../server/project-import.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import * as FLANGES from '../shared/flanges.ts';
import { PWHT_DOCUMENT } from '../shared/inspections.ts';
import type { User } from '../shared/types.ts';

/**
 * Regression tests of the independent security review 2 (sec2-001 … sec2-013): one test per finding, named with its id.
 * Sample data (server/seed.ts): North fabrication yard holds STX-2401 (iso-1..3) and STX-2403 (iso-7..10); Riverside
 * installation holds STX-2402 (iso-4..6).
 */
const PASSWORD = 'Security-Review-Password';
const RW = 'Read & write', NONE = 'No access', ADMIN = 'Administration', READ = 'Read only';
const NORTH = 'site-north', RIVER = 'site-river';
const HOSTED = availabilityFor(HOSTED_RELEASE_PROFILE)!;
type Options = { method?: string; pilot?: string; data?: unknown; site?: string };

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-security-review-2-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const app = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data, site }: Options = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(site ? { 'X-Stelux-Site': site } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, unknown>) => store.create('profiles', { name, description: name, toolsPermission: NONE, settingsPermission: NONE, ...levels }).id;
  const matrix = (name: string, rules: Record<string, string[]>) => profile(name, { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE });
  /** An account; `sites` gives the chosen main projects per limited pilot (stored as user_sites links). */
  const account = (name: string, data: Record<string, unknown>, sites: Partial<Record<'weld' | 'mto', string[]>> = {}) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    for (const [pilot, ids] of Object.entries(sites)) for (const siteId of ids!) store.create(USER_SITES, { userId: user.id, pilot, siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client();
    return { user, as, login: () => as.login(String(user.email)) };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Review admin', email: 'review-admin@example.test', password: PASSWORD } })).status, 201);
  const adminRow = store.list('users').find(row => row.email === 'review-admin@example.test')!;
  return { store, app, client, admin, adminRow, profile, matrix, account };
}
const adminLevels = { generalPermission: ADMIN, materialsPermission: ADMIN, weldingPermission: ADMIN, settingsPermission: ADMIN };
const levelsOf = (row: Record<string, unknown>) => ['generalPermission', 'materialsPermission', 'weldingPermission', 'toolsPermission', 'settingsPermission', 'permissionMode', 'permissionRules'].map(name => row[name] ?? '');

test('sec2-001: an administrator limited to some main projects does not change the rights of a profile used by accounts outside its reach', async t => {
  const f = await fixture(t);
  const adminProfile = f.profile('Site admin', adminLevels);
  const shared = f.profile('Shared review', { generalPermission: READ, materialsPermission: READ, weldingPermission: READ });
  const limited = f.account('North admin', { profileId: adminProfile, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH], mto: [NORTH] });
  await limited.login();
  // The shared profile is the profile of a Riverside-only account.
  f.account('River reviewer', { profileId: shared, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [RIVER], mto: [RIVER] });
  const before = f.store.get('profiles', shared);
  const widen = (as: ReturnType<typeof f.client>) => as.request(`/records/profiles/${shared}`, { method: 'PUT', pilot: 'weld', data: { ...adminLevels, _version: f.store.get('profiles', shared)._version } });
  const refused = await widen(limited.as);
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.deepEqual(levelsOf(f.store.get('profiles', shared)), levelsOf(before), 'the stored levels are unchanged');
  // Archiving that profile is refused as well.
  assert.equal((await limited.as.request(`/records/profiles/${shared}/archive`, { method: 'POST', pilot: 'weld', data: { _version: before._version } })).status, 403, 'archive');
  assert.equal(f.store.get('profiles', shared, true)._archived, false);
  // A profile used only by accounts within its reach stays editable for the limited administrator.
  const northOnly = f.profile('North review', { generalPermission: READ, materialsPermission: READ, weldingPermission: READ });
  f.account('North reviewer', { profileId: northOnly, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH], mto: [NORTH] });
  const own = await limited.as.request(`/records/profiles/${northOnly}`, { method: 'PUT', pilot: 'weld', data: { weldingPermission: RW, _version: f.store.get('profiles', northOnly)._version } });
  assert.equal(own.status, 200, await own.clone().text());
  // The administrator of every main project changes the shared profile.
  const allowed = await widen(f.admin);
  assert.equal(allowed.status, 200, await allowed.clone().text());
  assert.equal(f.store.get('profiles', shared).settingsPermission, ADMIN);
});

test('sec2-002: Undo on an NDT request needs the Delete right of the NDT area, not only Show on the request archive', async t => {
  const f = await fixture(t);
  for (const id of ['weld-22', 'weld-23']) f.store.update('welds', id, { ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ndtProcess2Id: 'ndt-1' }, f.store.get('welds', id)._version, SYSTEM);
  const made = inspectionRules(f.store, SYSTEM).run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'] }).records!;
  const line = made.find(row => row.weldId === 'weld-22')!;
  const result = f.store.create('inspection_results', { requestId: line.id, weldId: 'weld-22', type: 'NDT', round: 'Initial', result: 'Accepted', reportNo: 'RT-SEC2-002', processId: 'ndt-0' }, SYSTEM);
  const body = { type: 'NDT', requestNo: line.number, weldId: 'weld-22' };
  const viewer = f.account('Archive viewer', { profileId: f.matrix('Archive viewer', { '63': ['show'], '66': ['show'], '76': ['show'] }) });
  await viewer.login();
  assert.equal((await viewer.as.request('/actions/inspection-request-undo', { method: 'POST', pilot: 'weld', data: body })).status, 403);
  assert.equal(f.store.get('inspection_requests', line.id, true)._archived, false, 'the request line stays');
  assert.equal(f.store.get('inspection_results', result.id, true)._archived, false, 'its result stays');
  // NDT Pre: the Delete right of NDT (76) is no right on NDT Pre (94).
  const ndtDelete = f.account('NDT archivist', { profileId: f.matrix('NDT archivist', { '63': ['show'], '66': ['show'], '76': ['show', 'delete'], '94': ['show'] }) });
  await ndtDelete.login();
  assert.equal((await ndtDelete.as.request('/actions/inspection-request-undo', { method: 'POST', pilot: 'weld', data: { ...body, type: 'NDT PRE' } })).status, 403, 'NDT Pre without Delete on 94');
  const done = await ndtDelete.as.request('/actions/inspection-request-undo', { method: 'POST', pilot: 'weld', data: body });
  assert.equal(done.status, 201, await done.clone().text());
  assert.equal(f.store.get('inspection_requests', line.id, true)._archived, true);
});

test('sec2-003: Order checked materials refuses a requirement line of another main project before anything is written', async t => {
  const f = await fixture(t);
  const orderer = f.matrix('North orderer', { '13': ['show', 'print'], '70': ['show'], '64': ['show'], '5': ['show'], '4': ['show'], '6': ['show'] });
  const north = f.account('North orderer', { profileId: orderer, mtoProfileId: orderer, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  await north.login();
  // A North line and a Riverside line of the same material, beyond what open orders bring.
  const materialId = f.store.get('iso_materials', 'requirement-1').materialId;
  const mine = f.store.create('iso_materials', { isoId: 'iso-1', materialId, quantity: 500, phaseId: 'phase-0' }, SYSTEM);
  const river = f.store.create('iso_materials', { isoId: 'iso-4', materialId, quantity: 30, phaseId: 'phase-0' }, SYSTEM);
  const counts = () => [f.store.list('orders', true).length, f.store.list('order_lines', true).length];
  const before = counts();
  const refused = await north.as.request('/actions/order-requirements', { method: 'POST', pilot: 'mto', data: { requirementIds: [mine.id, river.id] } });
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.deepEqual(counts(), before, 'no order and no order line');
  // Its own line alone is still ordered.
  const own = await north.as.request('/actions/order-requirements', { method: 'POST', pilot: 'mto', data: { requirementIds: [mine.id] } });
  assert.equal(own.status, 201, await own.clone().text());
});

test('sec2-004: Storehouse manager is an access change: never on one\'s own account, on another only from an administrator of every MTO main project', async t => {
  const f = await fixture(t);
  const target = f.store.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-main' && row.materialId === 'material-8')!;
  const adjust = (as: ReturnType<typeof f.client>) => as.request('/actions/stock-adjust', { method: 'POST', pilot: 'mto', data: { stockId: target.id, quantity: Number(target.quantity) - 1, reason: 'Count correction', reasonText: 'Cycle count' } });
  const keeper = f.matrix('User keeper', { '26': ['show', 'edit'], '53': ['show'], '75': ['show', 'edit'], '16': ['show', 'insert'] });
  const self = f.account('Store keeper', { profileId: keeper, weldEnabled: false });
  await self.login();
  assert.equal((await adjust(self.as)).status, 403, 'not a storehouse manager');
  const own = await self.as.request(`/records/users/${self.user.id}`, { method: 'PUT', pilot: 'mto', data: { storehouseManager: true, _version: f.store.get('users', self.user.id)._version } });
  assert.equal(own.status, 403, await own.clone().text());
  assert.equal(f.store.get('users', self.user.id).storehouseManager === true, false, 'nothing stored');
  assert.equal((await adjust(self.as)).status, 403, 'Adjust quantity stays refused');
  // Not on another account without the right to change rights either.
  const other = f.account('Store hand', { profileId: keeper, weldEnabled: false });
  const tick = (as: ReturnType<typeof f.client>, id: string) => as.request(`/records/users/${id}`, { method: 'PUT', pilot: 'mto', data: { storehouseManager: true, _version: f.store.get('users', id)._version } });
  assert.equal((await tick(self.as, other.user.id)).status, 403, 'without Edit on Profiles');
  // An administrator limited to North in MTO Pilot does not tick it on a North account, nor on a new one.
  const adminProfile = f.profile('Site admin', adminLevels);
  const limited = f.account('North admin', { profileId: adminProfile, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  await limited.login();
  const northHand = f.account('North hand', { profileId: keeper, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  assert.equal((await tick(limited.as, northHand.user.id)).status, 403, 'limited in MTO Pilot');
  const users = f.store.list('users').length;
  const created = await limited.as.request('/records/users', { method: 'POST', pilot: 'mto', data: { name: 'North manager', email: 'north-manager@example.test', profileId: keeper, active: true, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteIds: [NORTH], storehouseManager: true, password: 'North-Manager-Password-1' } });
  assert.equal(created.status, 403, await created.clone().text());
  assert.equal(f.store.list('users').length, users, 'no account was created');
  // The administrator of every main project ticks it on another account; that account then adjusts.
  const done = await tick(f.admin, other.user.id);
  assert.equal(done.status, 200, await done.clone().text());
  await other.login();
  assert.equal((await adjust(other.as)).status, 201);
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082', 'hex');
const signForm = (role: string) => { const body = new FormData(); body.set('role', role); body.set('method', 'Drawn signature'); body.set('statement', 'true'); body.set('file', new Blob([PNG], { type: 'image/png' }), 'signature.png'); return body; };
const completeRecord = () => {
  const values: Record<string, unknown> = { assembly_date: '2026-11-16', tightening_method: 'Torque', tool_id: 'TW-12', operator_name: 'R. Bolt', method_equipment_id: 'TW-12', lmra_confirmed: true, installer_name: 'R. Bolt', installer_initials: 'RB', pass1_target: '190', pass1_actual: '191', pass1_result: 'OK' };
  for (const [key] of FLANGES.FLANGE_PREPARATION_CONTROLS) values[`check_${key}`] = true;
  for (const [key] of FLANGES.FLANGE_ASSEMBLY_CHECKLIST) values[`checklist_${key}`] = true;
  for (const [key] of FLANGES.FLANGE_COMPLETION_CHECKS) { values[`${key}_date`] = '2026-11-16'; values[`${key}_time`] = '11:00'; }
  for (const n of FLANGES.ALIGNMENT_POINTS) { values[`alignment_before_${n}`] = '0.5'; values[`alignment_after_${n}`] = '0.2'; }
  return values;
};

test('sec2-005: after the QA/QC sign-off nothing is added to the flange record\'s evidence, and Release judges the signed record and its registered PDF', async t => {
  const f = await fixture(t);
  const first = f.store.list('flanges')[0];
  f.store.update('flanges', first.id, { target_moment_nm: 190, aantal_studbolts: 8, target_stress: '' }, first._version, SYSTEM);
  const id = first.id, target = 190;
  const qc = f.account('Flange QC', { profileId: f.matrix('Flange QC', { '5': ['show'], '64': ['show'], '100': ['show', 'insert', 'edit', 'delete', 'import'] }) });
  await qc.login();
  const post = (path: string, data: unknown) => qc.as.request(`/flanges/${id}/${path}`, { method: 'POST', pilot: 'weld', data });
  assert.equal((await post('record', completeRecord())).status, 201);
  // The signed evidence: a pass outside tolerance and a failed leak test.
  const pass = await post('passes', { pass_number: 1, torque_nm: target * 1.06, stress_value: 1, tool_id: 'TW-12', operator_name: 'R. Bolt', performed_at: '2026-11-16T11:00' });
  assert.equal(pass.status, 201);
  const passId = (await pass.json() as { record: { id: string } }).record.id;
  assert.equal((await post('leak-tests', { test_type: 'Hydrostatic', pressure_value: '15', pressure_unit: 'bar', result: 'Failed', tested_at: '2026-11-16T12:00' })).status, 201);
  for (const role of ['Technician', 'QA/QC']) assert.equal((await qc.as.request(`/flanges/${id}/signatures`, { method: 'POST', pilot: 'weld', data: signForm(role) })).status, 201, role);
  const evidence = () => ['flange_passes', 'flange_bolts', 'flange_leak_tests', 'flange_labels', 'flange_deviations'].map(key => f.store.list(key, true).filter(row => row.flangeId === id).length);
  const before = evidence();
  const attempts: [string, unknown][] = [
    ['passes', { pass_number: 2, torque_nm: target, stress_value: 1, tool_id: 'TW-12', operator_name: 'R. Bolt', performed_at: '2026-11-16T13:00' }],
    ['bolts', { passId, bolt_no: 1, torque_nm: target, stress_value: 1 }],
    ['leak-tests', { test_type: 'Hydrostatic', pressure_value: '15', pressure_unit: 'bar', result: 'Passed', tested_at: '2026-11-16T13:00' }],
    ['labels', { label_number: 'L-SEC2', qr_token: 'QR-SEC2-005' }],
    ['deviations', { reference: 'DEV-SEC2', reason: 'Late deviation', event: 'Opened' }],
  ];
  for (const [path, data] of attempts) { const response = await post(path, data); assert.equal(response.status, 422, `${path}: ${await response.text()}`); }
  assert.deepEqual(evidence(), before, 'no evidence row was added');
  assert.equal((await post('protocol-pdf', {})).status, 201, 'the registered PDF shows the NOK pass and the failed leak test');
  // Evidence written after the PDF (an older row of before this rule) does not count for Release.
  f.store.create('flange_passes', { flangeId: id, recordId: '', pass_number: 2, torque_nm: target, stress_value: 1, tool_id: 'TW-12', operator_name: 'R. Bolt', performed_at: '2026-11-16T14:00', result: 'OK' }, SYSTEM);
  f.store.create('flange_leak_tests', { flangeId: id, test_type: 'Hydrostatic', pressure_value: '15', pressure_unit: 'bar', result: 'Passed', tested_at: '2026-11-16T14:00' }, SYSTEM);
  const release = await post('workflow', { to_status: 'Released' });
  assert.equal(release.status, 422, await release.clone().text());
  assert.match((await release.json() as { error: string }).error, /leak test/);
});

/** An .xlsx as the import template has it: row 1 hints, row 2 headers, data from row 3. */
async function importSheet(mode: 'full' | 'projects', lines: Record<string, string>[], options: { withWelds?: boolean; clean?: boolean } = {}) {
  const list = columnsFor(HOSTED, mode);
  const book = new ExcelJS.Workbook(); const page = book.addWorksheet('Import');
  page.addRow(list.map(column => column.hint)); page.addRow(list.map(column => column.header));
  for (const line of lines) page.addRow(list.map(column => line[column.key] ?? ''));
  const form = new FormData(); form.set('mode', mode); form.set('file', new Blob([await book.xlsx.writeBuffer()]), 'import.xlsx');
  if (options.withWelds !== undefined) form.set('withWelds', String(options.withWelds));
  if (options.clean !== undefined) form.set('clean', String(options.clean));
  return form;
}

test('sec2-006: a project switched off for a pilot is neither archived by a clean import nor by its archive route from that pilot', async t => {
  const f = await fixture(t);
  assert.equal((await f.admin.request('/auth/site', { method: 'POST', data: { siteId: NORTH } })).status, 200);
  // A blank North project, switched off for Weld Pilot; and a blank one that is on.
  const off = f.store.create('projects', { internnumber: 'OFF-WELD-1', siteId: NORTH, weldPilot: false }, SYSTEM);
  const on = f.store.create('projects', { internnumber: 'ON-WELD-1', siteId: NORTH }, SYSTEM);
  const clean = await f.admin.request('/project-import/commit', { method: 'POST', pilot: 'weld', data: await importSheet('projects', [{ 'projects.internnumber': 'STX-2401', 'projects.authority': 'Inspector' }], { clean: true }) });
  assert.equal(clean.status, 201, await clean.clone().text());
  assert.equal(f.store.get('projects', off.id, true)._archived, false, 'the switched-off project stays');
  assert.equal(f.store.get('projects', on.id, true)._archived, true, 'a blank project of the pilot is still cleaned');
  // The archive route from Weld Pilot answers as if the project did not exist there.
  const archived = await f.admin.request(`/records/projects/${off.id}/archive`, { method: 'POST', pilot: 'weld', data: { _version: off._version } });
  assert.equal(archived.status, 404, await archived.clone().text());
  assert.equal(f.store.get('projects', off.id, true)._archived, false);
  // From MTO Pilot, where it is switched on, it is archived as before.
  const fromMto = await f.admin.request(`/records/projects/${off.id}/archive`, { method: 'POST', pilot: 'mto', data: { _version: off._version } });
  assert.equal(fromMto.status, 200, await fromMto.clone().text());
});

test('sec2-007: Project import writes welds only into projects switched on for Weld Pilot and material lines only into projects switched on for MTO Pilot', async t => {
  const f = await fixture(t);
  assert.equal((await f.admin.request('/auth/site', { method: 'POST', data: { siteId: NORTH } })).status, 200);
  const noWeld = f.store.create('projects', { internnumber: 'NO-WELD-1', siteId: NORTH, weldPilot: false }, SYSTEM);
  const noMto = f.store.create('projects', { internnumber: 'NO-MTO-1', siteId: NORTH, mtoPilot: false }, SYSTEM);
  const counts = () => [f.store.list('welds').length, f.store.list('iso_materials').length, f.store.list('isometrics').length];
  const before = counts();
  // From MTO Pilot: welds for a project switched off for Weld Pilot.
  const welds = await f.admin.request('/project-import/commit', { method: 'POST', pilot: 'mto', data: await importSheet('full', [{ 'projects.internnumber': String(noWeld.internnumber), 'isometrics.isoNo': 'NO-WELD-ISO', 'welds.start': '1', 'welds.end': '2' }], { withWelds: true }) });
  assert.equal(welds.status, 403, await welds.clone().text());
  assert.match((await welds.json() as { error: string }).error, /Weld Pilot/);
  // From Weld Pilot: a material line for a project switched off for MTO Pilot.
  const line = { 'projects.internnumber': String(noMto.internnumber), 'isometrics.isoNo': 'NO-MTO-ISO', 'iso_materials.componentCode': '1', 'iso_materials.materialNo': 'NO-MTO-PIPE', 'iso_materials.description': 'Pipe', 'iso_materials.uom': 'M', 'iso_materials.quantity': '2', 'iso_materials.phase': 'Shop' };
  const materials = await f.admin.request('/project-import/commit', { method: 'POST', pilot: 'weld', data: await importSheet('full', [line], { withWelds: false }) });
  assert.equal(materials.status, 403, await materials.clone().text());
  assert.match((await materials.json() as { error: string }).error, /MTO Pilot/);
  // Copy isometrics has the same rule for the welds it copies.
  const copied = await f.admin.request('/actions/copy-isometrics', { method: 'POST', pilot: 'mto', data: { isoIds: ['iso-1'], projectId: noWeld.id, copyWelds: true } });
  assert.equal(copied.status, 403, await copied.clone().text());
  assert.deepEqual(counts(), before, 'no weld, material line or isometric was written');
  // The same material line into a project switched on for MTO Pilot still imports.
  const fine = await f.admin.request('/project-import/commit', { method: 'POST', pilot: 'weld', data: await importSheet('full', [{ ...line, 'projects.internnumber': String(noWeld.internnumber) }], { withWelds: false }) });
  assert.equal(fine.status, 201, await fine.clone().text());
});

test('sec2-008: removing PWHT documents needs Delete on 97, and Restart NDT process needs Delete on the NDT area', async t => {
  const f = await fixture(t);
  // A PWHT result with its document.
  const weld = f.store.list('welds').find(row => row.pwhtReq === true)!;
  const section = { type: 'PWHT', locationId: 'pwht-site', processId: 'pwht-2', reportNo: 'PWHT-SEC2-008', date: '2026-10-20', checked: true };
  const result = inspectionRules(f.store, SYSTEM).run('pwht-weld', { weldId: weld.id, sections: [section] }).records![0];
  const file = f.store.create('attachments', { name: 'chart.pdf', entityType: 'inspection_results', entityId: result.id, documentType: PWHT_DOCUMENT, mime: 'application/pdf', size: 12, note: '' }, SYSTEM);
  const adder = f.account('PWHT adder', { profileId: f.matrix('PWHT adder', { '63': ['show'], '97': ['show', 'insert'] }) });
  await adder.login();
  const save = (as: ReturnType<typeof f.client>, deleteFileIds: string[]) => as.request('/actions/pwht-weld', { method: 'POST', pilot: 'weld', data: { weldId: weld.id, sections: [section], deleteFileIds } });
  const refused = await save(adder.as, [file.id]);
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.equal(f.store.get('attachments', file.id, true)._archived, false, 'the document stays');
  assert.equal((await save(adder.as, [])).status, 201, 'saving without removing a document needs only Add');
  const remover = f.account('PWHT remover', { profileId: f.matrix('PWHT remover', { '63': ['show'], '97': ['show', 'insert', 'delete'] }) });
  await remover.login();
  assert.equal((await save(remover.as, [file.id])).status, 201);
  assert.equal(f.store.get('attachments', file.id, true)._archived, true);
  // Restart NDT process archives the NDT results of the picked processes.
  for (const id of ['weld-22', 'weld-23']) f.store.update('welds', id, { ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ndtProcess2Id: 'ndt-1' }, f.store.get('welds', id)._version, SYSTEM);
  const line = inspectionRules(f.store, SYSTEM).run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'] }).records!.find(row => row.weldId === 'weld-22')!;
  const ndt = f.store.create('inspection_results', { requestId: line.id, weldId: 'weld-22', type: 'NDT', round: 'Initial', result: 'Accepted', reportNo: 'RT-SEC2-008', processId: 'ndt-0' }, SYSTEM);
  const restart = { weldId: 'weld-22', type: 'NDT', processIds: ['ndt-0'] };
  const ndtAdder = f.account('NDT adder', { profileId: f.matrix('NDT adder', { '63': ['show'], '76': ['show', 'insert'] }) });
  await ndtAdder.login();
  assert.equal((await ndtAdder.as.request('/actions/ndt-restart', { method: 'POST', pilot: 'weld', data: restart })).status, 403);
  assert.equal(f.store.get('inspection_results', ndt.id, true)._archived, false, 'the NDT result stays');
  const ndtRemover = f.account('NDT remover', { profileId: f.matrix('NDT remover', { '63': ['show'], '76': ['show', 'insert', 'delete'] }) });
  await ndtRemover.login();
  assert.equal((await ndtRemover.as.request('/actions/ndt-restart', { method: 'POST', pilot: 'weld', data: restart })).status, 201);
  assert.equal(f.store.get('inspection_results', ndt.id, true)._archived, true);
});

test('sec2-009: a typed Prefab release report number that the main project already used for Prefab is refused with a sentence naming it', async t => {
  const f = await fixture(t);
  const released = new Set(f.store.list('releases').filter(row => row.type === 'Prefab').map(row => String(row.isoId)));
  const ready = (ids: string[]) => ids.filter(id => !released.has(id)).map(id => { const iso = f.store.get('isometrics', id); return f.store.update('isometrics', id, { itpNo: 'ITP-SEC2-009', prefabCompletedAt: '2026-11-01T10:00:00.000Z', prefabCompletedBy: 'Inspector' }, iso._version, SYSTEM); });
  const [north1, north2, north3] = ready(['iso-7', 'iso-8', 'iso-9', 'iso-10', 'iso-1', 'iso-2', 'iso-3']);
  const [river1] = ready(['iso-4', 'iso-5', 'iso-6']);
  assert.ok(north1 && north2 && north3 && river1, 'three North and one Riverside isometric ready for Prefab release');
  const release = (isoId: string, reportNo?: string) => f.admin.request('/actions/release', { method: 'POST', pilot: 'weld', data: { type: 'Prefab', isoIds: [isoId], ...(reportNo === undefined ? {} : { reportNo }) } });
  const first = await release(north1.id);
  assert.equal(first.status, 201, await first.clone().text());
  const used = String(f.store.list('releases').find(row => row.isoId === north1.id && row.type === 'Prefab')!.reportNo);
  const count = f.store.list('releases', true).length;
  const refused = await release(north2.id, used);
  assert.equal(refused.status, 422, await refused.clone().text());
  assert.ok((await refused.json() as { error: string }).error.includes(used), 'the sentence names the number');
  assert.equal(f.store.list('releases', true).length, count, 'no release row was added');
  // A new typed number, and the same number in another main project, are still accepted.
  assert.equal((await release(north2.id, 'PFR-SEC2-009')).status, 201);
  assert.equal((await release(river1.id, used)).status, 201);
});

test('sec2-010: Stock to project and a transfer order copy only certificates of a main project the request reaches', async t => {
  const f = await fixture(t);
  // certificate-1 (sample) is a North certificate of material-1, charge H-1042, on a Main warehouse line.
  const pipe = f.store.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-main' && row.materialId === 'material-1')!;
  const cert = f.store.get('certifications', 'certificate-1');
  const store = f.matrix('River store', { '75': ['show', 'insert', 'edit'], '16': ['show', 'insert'], '18': ['show'], '6': ['show'], '4': ['show'] });
  const river = f.account('River store', { profileId: store, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [RIVER] });
  await river.login();
  assert.notEqual((await river.as.request('/records/certifications/certificate-1', { pilot: 'mto' })).status, 200, 'it cannot open the North certificate');
  const copies = () => f.store.list('certifications', true).filter(row => row.siteId === RIVER && row.name === cert.name).length;
  const quantity = Number(pipe.quantity);
  const moved = await river.as.request('/actions/stock-to-project', { method: 'POST', pilot: 'mto', data: { siteId: RIVER, items: [{ stockId: pipe.id, quantity: 1, certIds: [cert.id] }] } });
  assert.equal(moved.status, 422, await moved.clone().text());
  assert.equal(copies(), 0, 'no Riverside copy of the North certificate');
  assert.equal(Number(f.store.get('stock', pipe.id).quantity), quantity, 'nothing moved');
  const order = await river.as.request('/actions/transfer-order-create', { method: 'POST', pilot: 'mto', data: { type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: RIVER, items: [{ materialNo: 'CS-P060', quantity: 1, certIds: [cert.id] }] } });
  assert.equal(order.status, 422, await order.clone().text());
  // Without the certificate the same transfer still runs.
  const plain = await river.as.request('/actions/stock-to-project', { method: 'POST', pilot: 'mto', data: { siteId: RIVER, items: [{ stockId: pipe.id, quantity: 1 }] } });
  assert.equal(plain.status, 201, await plain.clone().text());
});

test('sec2-011: an Inventory → Storehouse order stays readable where the storehouse is, without the source inventory or its certificates; only the source main project acts on it', async t => {
  const f = await fixture(t);
  const source = f.store.list('stock').find(row => row.locationKind === 'site' && row.siteId === NORTH && row.materialId === 'material-1' && Number(row.quantity) >= 1)!;
  assert.ok(source, 'a North inventory row');
  const materialNo = String(f.store.get(source.materialId ? 'materials' : 'custom_materials', String(source.materialId || source.customMaterialId)).materialNo);
  const done = runAction(f.store, 'transfer-order-create', { type: 'Inventory - Storehouse', fromSiteId: NORTH, toWarehouseId: 'warehouse-main', date: '2026-11-16', items: [{ stockId: source.id, materialNo, quantity: 1, certIds: ['certificate-1'] }] }, SYSTEM);
  const order = (done as { record: { id: string } }).record;
  const item = f.store.list('transfer_order_items').find(row => row.orderId === order.id)!;
  const logistics = f.matrix('Store hand', { '16': ['show', 'insert', 'export'], '75': ['show'], '4': ['show'], '6': ['show'] });
  const river = f.account('River hand', { profileId: logistics, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [RIVER] });
  const north = f.account('North hand', { profileId: logistics, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  await river.login(); await north.login();
  // Readable (storehouses are company-wide), as intended: the order and its lines.
  const orders = await river.as.request('/records/transfer_orders', { pilot: 'mto' });
  assert.ok((await orders.json() as { rows: { id: string }[] }).rows.some(row => row.id === order.id), 'the order is listed');
  const lines = await river.as.request('/records/transfer_order_items', { pilot: 'mto' });
  assert.equal(lines.status, 200);
  assert.ok((await lines.json() as { rows: { id: string }[] }).rows.some(row => row.id === item.id), 'its line is listed');
  // Not the North inventory row behind it, nor the North certificate it carries.
  assert.notEqual((await river.as.request(`/records/stock/${source.id}`, { pilot: 'mto' })).status, 200, 'the inventory row stays closed');
  assert.notEqual((await river.as.request('/records/certifications/certificate-1', { pilot: 'mto' })).status, 200, 'the certificate stays closed');
  const stock = await river.as.request('/records/stock', { pilot: 'mto' });
  assert.ok(!(await stock.json() as { rows: { id: string }[] }).rows.some(row => row.id === source.id), 'no North inventory quantity in the list');
  // Acting on it is for the source main project only.
  const version = f.store.get('transfer_orders', order.id)._version;
  for (const [key, data] of [['transfer-order-assign', {}], ['transfer-order-pick', { items: [{ itemId: item.id, qtyPicked: 1, lineStatus: 'Picked' }] }], ['transfer-order-cancel', { reason: 'Not ours' }], ['transfer-order-complete', {}]] as const) {
    const response = await river.as.request(`/actions/${key}`, { method: 'POST', pilot: 'mto', data: { orderId: order.id, ...data } });
    assert.equal(response.status, 403, `${key}: ${await response.text()}`);
  }
  assert.equal(f.store.get('transfer_orders', order.id)._version, version, 'the order is unchanged');
  const assigned = await north.as.request('/actions/transfer-order-assign', { method: 'POST', pilot: 'mto', data: { orderId: order.id } });
  assert.equal(assigned.status, 201, await assigned.clone().text());
});

test('sec2-012: isometric Attachments stores only real PDFs, checked by content, with the type set by the server', async t => {
  const f = await fixture(t);
  const type = f.store.list('attachment_names')[0];
  assert.ok(type, 'the sample data has attachment names');
  const upload = (body: string, name: string, mime: string) => { const form = new FormData(); form.set('reportNo', type.id); form.append('files', new Blob([body], { type: mime }), name); return f.admin.request('/isometrics/iso-1/attachments', { method: 'POST', pilot: 'weld', data: form }); };
  const count = () => f.store.list('attachments').filter(row => row.entityType === 'isometrics' && row.entityId === 'iso-1').length;
  const before = count();
  for (const mime of ['text/html', 'application/pdf']) {
    const refused = await upload('<html><script>alert(1)</script></html>', 'report.pdf', mime);
    assert.equal(refused.status, 422, `${mime}: ${await refused.clone().text()}`);
    assert.match((await refused.json() as { error: string }).error, /report\.pdf/);
  }
  assert.equal(count(), before, 'no attachment was added');
  const real = await upload('%PDF-1.4 real', 'real.pdf', 'application/pdf');
  assert.equal(real.status, 201, await real.clone().text());
  assert.equal((await real.json() as { records: { mime: string }[] }).records[0].mime, 'application/pdf');
});

test('sec2-013: a new profile with rights needs the right to change rights and never grants more than its creator holds', async t => {
  const f = await fixture(t);
  const none = { generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE, toolsPermission: NONE, settingsPermission: NONE };
  const create = (as: ReturnType<typeof f.client>, name: string, levels: Record<string, unknown>) => as.request('/records/profiles', { method: 'POST', pilot: 'weld', data: { name, description: 'Harmless reader', ...levels } });
  const profiles = () => f.store.list('profiles', true).length;
  // Show and Add on Profiles only.
  const adder = f.account('Profile adder', { profileId: f.matrix('Profile adder', { '53': ['show', 'insert'] }) });
  await adder.login();
  const before = profiles();
  const refused = await create(adder.as, 'Reader', { ...adminLevels, toolsPermission: ADMIN });
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.equal(profiles(), before, 'no profile was added');
  const empty = await create(adder.as, 'Empty profile', none);
  assert.equal(empty.status, 201, await empty.clone().text());
  // With the right to change rights, but holding only the Users and Profiles boxes: no profile wider than that.
  const keeper = f.account('Rights keeper', { profileId: f.matrix('Rights keeper', { '26': ['show', 'insert', 'edit'], '53': ['show', 'insert', 'edit'] }) });
  await keeper.login();
  assert.equal((await create(keeper.as, 'Wide', { ...none, weldingPermission: RW })).status, 403, 'a right the creator does not hold');
  const within = await create(keeper.as, 'Profile reader', { ...none, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '53': ['show'] }) });
  assert.equal(within.status, 201, await within.clone().text());
  // The administrator creates any profile.
  assert.equal((await create(f.admin, 'Full', { ...adminLevels, toolsPermission: ADMIN })).status, 201);
});
