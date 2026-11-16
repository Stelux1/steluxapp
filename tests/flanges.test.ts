import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { FLANGE_FIELDS, FLANGE_LIST_COLUMNS, FLANGE_STATUSES, FLANGE_TORQUE_CATALOGS, filterFlanges, flangeAssetTag, flangeInputErrors, flangeIsoPrefill, flangeItems, flangeStandardNotice, flangeStatus, flangeStoredValue, flangeTorqueErrors, flangeTorqueSuggestion, flangesCsv, isoFlangeCount, NO_FLANGE_FILTERS, selectedFlanges } from '../shared/flanges.ts';
import { FLANGE_STANDARDS } from '../shared/site-settings.ts';
import type { Bootstrap, Row } from '../shared/types.ts';

const row = (data: Record<string, unknown>) => ({ id: 'x', _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;

test('the flange fields carry the reference labels in six form sections and require the isometric', () => {
  const labels = FLANGE_FIELDS.map(field => field.label);
  const expected = ['Project', 'Isometric', 'Flange ID', 'From equipment', 'To equipment', 'Equipment connection', 'IRN no', 'Criticality', 'High risk', 'P&ID', 'Fluid code', 'Pipe class', 'Area/unit', 'Location', 'Flange type', 'Flange size', 'Flange rating', 'Flange rate/size', 'Gasket type', 'Gasket material', 'Stud bolt dimension', 'Stud diameter', 'Number of stud bolts', 'Lubricant used', 'Stud bolt material', 'Nut material', 'Torque wrench type', 'Torque wrench ID', 'First pass (Nm)', 'Second pass (Nm)', 'Target moment (Nm)', 'Target stress', 'Max deviation', 'Tightening date', 'Report no.', 'Operator', 'CQI', 'Commissioning date', 'Rejection type', 'Inspection result', 'Operating pressure', 'Operating temperature', 'Test pressure', 'Asset tag'];
  for (const label of expected) assert.ok(labels.includes(label), label);
  assert.deepEqual([...new Set(FLANGE_FIELDS.map(field => field.section))], ['Identification and location', 'Flange and gasket', 'Bolting', 'Tightening', 'Inspection and commissioning', 'Operating data']);
  assert.equal(FLANGE_FIELDS.find(field => field.name === 'isoId')?.required, true);
  assert.equal(new Set(FLANGE_FIELDS.map(field => field.name)).size, FLANGE_FIELDS.length);
  // Names saved before this module are kept, so older databases open unchanged.
  for (const name of ['flange_id', 'tightning_date', 'commisioning_date', 'studbolt_afmeting', 'first_pass_nm', 'second_pass_nm', 'target_moment_nm', 'max_dev', 'insp_result', 'finished']) assert.ok(FLANGE_FIELDS.some(field => field.name === name), name);
  assert.equal(RESOURCE_MAP.flanges.fields, FLANGE_FIELDS);
});

test('the add form of the reference: Project before Isometric, Flange ID optional, one Asset tag field (stored in line_number)', () => {
  assert.deepEqual(FLANGE_FIELDS.slice(0, 3).map(field => field.label), ['Project', 'Isometric', 'Flange ID']);
  assert.equal(FLANGE_FIELDS.find(field => field.name === 'flange_id')?.required, undefined);
  assert.ok(!FLANGE_FIELDS.some(field => field.name === 'assetTag'), 'the retired assetTag field is gone');
  assert.ok(!FLANGE_FIELDS.some(field => field.label === 'Line number'));
  assert.equal(FLANGE_FIELDS.filter(field => field.label === 'Asset tag').map(field => field.name).join(), 'line_number');
  assert.equal(flangeAssetTag({ line_number: 'AT-1', assetTag: 'old' }), 'AT-1');
  assert.equal(flangeAssetTag({ line_number: '', assetTag: 'old' }), 'old', 'an older record still shows its asset tag');
});


test('status is derived: planned, tightened, inspected, finished', () => {
  assert.deepEqual([...FLANGE_STATUSES], ['Planned', 'Tightened', 'Inspected', 'Finished']);
  assert.equal(flangeStatus({}), 'Planned');
  assert.equal(flangeStatus({ tightning_date: '2026-10-19' }), 'Planned', 'a date without passes is not tightened');
  assert.equal(flangeStatus({ first_pass_nm: 60, second_pass_nm: 120 }), 'Planned', 'passes without a date are not tightened');
  assert.equal(flangeStatus({ tightning_date: '2026-10-19', first_pass_nm: 60, second_pass_nm: 120 }), 'Tightened');
  assert.equal(flangeStatus({ tightning_date: '2026-10-19', first_pass_nm: 60, second_pass_nm: 120, insp_result: 'Accepted' }), 'Inspected');
  assert.equal(flangeStatus({ insp_result: 'Accepted', commisioning_date: '2026-11-02' }), 'Finished');
  assert.equal(flangeStatus({ finished: true }), 'Finished');
  assert.equal(flangeStatus({ finished: false, insp_result: '  ' }), 'Planned');
});

test('torque values are compared only with each other on recorded passes: first <= second <= target + max deviation', () => {
  assert.deepEqual(flangeTorqueErrors({}), {});
  assert.deepEqual(flangeTorqueErrors({ first_pass_nm: 60, second_pass_nm: 120, target_moment_nm: 190, max_dev: 10 }), {});
  assert.deepEqual(flangeTorqueErrors({ first_pass_nm: 120, second_pass_nm: 120, target_moment_nm: 120 }), {}, 'equal values are allowed');
  assert.deepEqual(flangeTorqueErrors({ second_pass_nm: 195, target_moment_nm: 190, max_dev: 10 }), {}, 'inside the deviation');
  assert.ok(flangeTorqueErrors({ first_pass_nm: 130, second_pass_nm: 120 }).first_pass_nm);
  assert.ok(flangeTorqueErrors({ second_pass_nm: 201, target_moment_nm: 190, max_dev: 10 }).second_pass_nm);
  assert.ok(flangeTorqueErrors({ second_pass_nm: 191, target_moment_nm: 190 }).second_pass_nm, 'no deviation means none allowed');
  assert.ok(flangeTorqueErrors({ first_pass_nm: 250, target_moment_nm: 190, max_dev: 10 }).first_pass_nm, 'the first pass alone is checked against the limit');
  assert.deepEqual(flangeTorqueErrors({ first_pass_nm: 60, second_pass_nm: 120 }), {}, 'without a target only the order is checked');
  assert.deepEqual(flangeTorqueErrors({ first_pass_nm: '60', second_pass_nm: '120', target_moment_nm: '190' }), {}, 'numbers saved as text still compare');
});

test('saving master data does not compare the passes; only a negative torque is refused, in plain words', () => {
  assert.deepEqual(flangeInputErrors({ first_pass_nm: 500, second_pass_nm: 400, target_moment_nm: 300 }), {});
  assert.deepEqual(flangeInputErrors({}), {});
  assert.deepEqual(flangeInputErrors({ first_pass_nm: -5 }), { first_pass_nm: 'Torque must be 0 or more.' });
  assert.deepEqual(Object.keys(flangeInputErrors({ second_pass_nm: -1, target_moment_nm: '-2', max_dev: -3 })), ['second_pass_nm', 'target_moment_nm', 'max_dev']);
  for (const name of ['first_pass_nm', 'second_pass_nm', 'target_moment_nm', 'max_dev']) assert.equal(FLANGE_FIELDS.find(field => field.name === name)?.min, undefined, `${name} has no generic range message`);
});

test('choosing the isometric fills the empty flange fields from it and keeps what is entered', () => {
  const iso = { assetTag: 'AT-1', irn: 'IRN-1', pipingClass: 'CS150', testPressure: '15 bar' };
  assert.deepEqual(flangeIsoPrefill(iso, {}), { line_number: 'AT-1', irnno: 'IRN-1', pipe_class: 'CS150', testPressure: '15 bar' });
  assert.deepEqual(flangeIsoPrefill({ assetTag: 'AT-1', irn: 'IRN-1', pipingClass: 'CS150', testPressure: '15' }, { line_number: 'kept' }), { irnno: 'IRN-1', pipe_class: 'CS150', testPressure: '15' });
  assert.deepEqual(flangeIsoPrefill({ assetTag: '', irn: ' ' }, {}), {}, 'an empty source fills nothing');
  assert.deepEqual(flangeIsoPrefill(undefined, {}), {});
});

test('every standard is free entry: no torque table is installed and nothing is suggested', () => {
  assert.deepEqual(FLANGE_TORQUE_CATALOGS, {});
  for (const standard of FLANGE_STANDARDS) assert.equal(flangeTorqueSuggestion(standard, { flange_size: '6"', flange_rating: 'Class 150' }), null);
  const none = flangeStandardNotice({ flangeStandard: FLANGE_STANDARDS[0] });
  assert.equal(none.standard, FLANGE_STANDARDS[0]); assert.equal(none.catalog, false); assert.match(none.message, /by hand/);
  const asme = flangeStandardNotice({ flangeStandard: 'ASME B16.5 torque table (2012)' });
  assert.equal(asme.standard, 'ASME B16.5 torque table (2012)'); assert.match(asme.message, /ASME B16\.5/); assert.match(asme.message, /not installed/);
  assert.equal(flangeStandardNotice(undefined).standard, FLANGE_STANDARDS[0]);
  assert.equal(flangeStandardNotice({ flangeStandard: 'Made up' }).standard, FLANGE_STANDARDS[0]);
});

test('older text values of number fields are read as numbers, other text stays an error', () => {
  const field = FLANGE_FIELDS.find(f => f.name === 'first_pass_nm')!;
  assert.equal(flangeStoredValue(field, '60'), 60); assert.equal(flangeStoredValue(field, '60,5'), 60.5);
  assert.equal(flangeStoredValue(field, ''), ''); assert.equal(flangeStoredValue(field, 'abc'), 'abc'); assert.equal(flangeStoredValue(field, 45), 45);
  assert.equal(flangeStoredValue(FLANGE_FIELDS.find(f => f.name === 'operator')!, '60'), '60');
});

test('the list joins project and isometric, filters by project, finished and isometric, and exports what is listed', () => {
  const projects = [row({ id: 'p1', internnumber: 'P-100' }), row({ id: 'p2', internnumber: 'P-200' })];
  const isos = [row({ id: 'i1', isoNo: 'ISO-1', projectId: 'p1' }), row({ id: 'i2', isoNo: 'ISO-2', projectId: 'p2' })];
  const flanges = [row({ id: 'f1', isoId: 'i1', flange_id: 'FL-1', line_number: 'AT-1', flange_size: '6"', flange_rating: 'Class 150', criticality: 'High', gasket_type: 'Spiral wound', target_moment_nm: 190 }), row({ id: 'f2', isoId: 'i2', flange_id: '=HYPERLINK("x")', finished: true }), row({ id: 'f3', isoId: 'i1', flange_id: 'FL-3, "B"', insp_result: 'Accepted' })];
  const items = flangeItems(flanges, isos, projects);
  assert.deepEqual(items.map(item => [item.projectName, item.isoNo, item.status]), [['P-100', 'ISO-1', 'Planned'], ['P-200', 'ISO-2', 'Finished'], ['P-100', 'ISO-1', 'Inspected']]);
  assert.deepEqual(FLANGE_LIST_COLUMNS.map(column => column.label), ['Project', 'Iso number', 'Flange ID', 'Asset tag', 'Flange Size', 'Gasket Type', 'Target Moment (Nm)', 'Criticality', 'Status']);
  assert.deepEqual(FLANGE_LIST_COLUMNS.filter(column => column.hidden).map(column => column.label), ['Criticality'], 'Criticality is hidden by default');

  const ids = (filters: Partial<typeof NO_FLANGE_FILTERS>) => filterFlanges(items, { ...NO_FLANGE_FILTERS, ...filters }).map(item => item.row.id);
  assert.deepEqual(ids({}), ['f1', 'f2', 'f3']);
  assert.deepEqual(ids({ projectId: 'p1' }), ['f1', 'f3']);
  assert.deepEqual(ids({ finished: 'Yes' }), ['f2']);
  const unticked = flangeItems([row({ id: 'f5', isoId: 'i1', insp_result: 'Accepted', commisioning_date: '2026-11-02', finished: false })], isos, projects);
  assert.equal(unticked[0].status, 'Finished');
  assert.deepEqual(filterFlanges(unticked, { ...NO_FLANGE_FILTERS, finished: 'Yes' }), [], 'the filter follows the stored finished flag, not the derived status');
  assert.equal(filterFlanges(unticked, { ...NO_FLANGE_FILTERS, finished: 'No' }).length, 1);

  assert.deepEqual(ids({ finished: 'No' }), ['f1', 'f3']);
  assert.deepEqual(ids({ projectId: 'p2', finished: 'No' }), []);
  assert.deepEqual(ids({ isoId: 'i2' }), ['f2']);
  assert.deepEqual(ids({ query: 'spiral' }), ['f1']);
  assert.equal(isoFlangeCount([...flanges, row({ id: 'f4', isoId: 'i1', _archived: true })], 'i1'), 2);
  const csv = flangesCsv(items).split('\r\n');
  assert.equal(csv[0], 'Project,Iso number,Flange ID,Asset tag,Flange Size,Gasket Type,Target Moment (Nm),Criticality,Status');
  assert.equal(csv[1], 'P-100,ISO-1,FL-1,AT-1,"6"" / Class 150",Spiral wound,190,High,Planned');
  // Export, Report and Print labels act on the ticked rows only.
  const ticked = selectedFlanges(items, ['f3', 'f1', 'missing']);
  assert.deepEqual(ticked.map(item => item.row.id), ['f1', 'f3'], 'list order, unknown ids ignored');
  assert.equal(flangesCsv(ticked).trimEnd().split('\r\n').length, 3, 'the header and exactly the two ticked flanges');
  assert.deepEqual(selectedFlanges(items, []), []);
  assert.ok(csv[2].includes(`'=HYPERLINK`), 'a formula is quoted so a spreadsheet does not run it');
  assert.ok(csv[3].includes('"FL-3, ""B"""'));
});

test('the hosted profile delivers the flange record and the Weld Pilot menu lists it under Releases only', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.navigation.includes('flanges'));
  assert.deepEqual(hosted.resources.flanges, FLANGE_FIELDS.map(field => field.name));
  for (const profile of ['welding-demo', 'access-prototype'] as const) assert.ok(!availabilityFor(profile)!.navigation.includes('flanges'), profile);
  assert.equal(availabilityFor('full'), undefined);
  const releases = PILOT_MAP.weld.groups.find(group => group.title === 'Releases')!;
  assert.ok(releases.items.some(item => item.label === 'Flange Management' && item.resource === 'flanges'));
  assert.ok(!PILOT_MAP.mto.groups.some(group => group.items.some(item => item.resource === 'flanges')));
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-flanges-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Flange-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Flange admin', email: 'flange-admin@example.test', password })).status, 201) };
}
const RW = 'Read & write', RO = 'Read only', NONE = 'No access';

test('flanges are saved through the API with the torque rule enforced on the server', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Weld writer', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const data = await (await f.request('/api/bootstrap')).json() as Bootstrap;
  assert.equal(data.rows.flanges.length, 4, 'the sample flanges are delivered');
  assert.deepEqual(new Set(data.rows.flanges.map(flange => flangeStatus(flange))), new Set(FLANGE_STATUSES));
  const created = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-NEW-1', line_number: 'AT-NEW-1', first_pass_nm: 50, second_pass_nm: 100, target_moment_nm: 150, max_dev: 5 });
  assert.equal(created.status, 201); const flange = (await created.json()).record;
  assert.equal(flange.first_pass_nm, 50);
  // Isometric is required; a flange id is unique per isometric.
  const noIso = await f.request('/api/records/flanges', 'POST', { flange_id: 'FL-NEW-2' }); assert.equal(noIso.status, 422); assert.ok((await noIso.json()).fields.isoId);
  assert.ok([409, 422].includes((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-NEW-1' })).status), 'duplicate flange id on one isometric');
  // Saving master data does not compare the passes (the reference add form has no such check); a negative torque is refused plainly.
  const accepted = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-NEW-3', first_pass_nm: 500, second_pass_nm: 400, target_moment_nm: 300, max_dev: 5 });
  assert.equal(accepted.status, 201, 'a pass above target + deviation is accepted on add');
  const negative = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-NEW-5', first_pass_nm: -5 });
  assert.equal(negative.status, 422); assert.equal((await negative.json()).fields.first_pass_nm, 'Torque must be 0 or more.');
  const over = await f.request(`/api/records/flanges/${flange.id}`, 'PUT', { second_pass_nm: 200, _version: flange._version }); assert.equal(over.status, 200, 'and on edit');
  const ok = await f.request(`/api/records/flanges/${flange.id}`, 'PUT', { second_pass_nm: 154, _version: (await over.json()).record._version }); assert.equal(ok.status, 200);
  assert.equal((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-NEW-4', first_pass_nm: 'abc' })).status, 422);
  // Delete archives and keeps the record.
  assert.equal((await f.request(`/api/records/flanges/${flange.id}/archive`, 'POST', { _version: (await ok.json()).record._version })).status, 200);
});

test('flange access follows the Weld Pilot profile and stays closed in MTO Pilot and without a welding profile', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Weld reader', { generalPermission: RO, materialsPermission: RW, weldingPermission: RO });
  assert.equal((await f.request('/api/records/flanges')).status, 200);
  assert.equal((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'DENIED' })).status, 403, 'read only cannot insert');
  assert.equal((await f.request('/api/records/flanges/flange-1', 'PUT', { operator: 'Nobody', _version: 1 })).status, 403, 'read only cannot edit');
  assert.equal((await f.request('/api/records/flanges/flange-1/archive', 'POST', { _version: 1 })).status, 403, 'read only cannot delete');
  f.usePilot('mto');
  assert.ok([403, 404].includes((await f.request('/api/records/flanges')).status), 'the other pilot refuses the record');
  assert.ok([403, 404].includes((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'DENIED' })).status));
  const mto = await (await f.request('/api/bootstrap')).json() as Bootstrap; assert.equal(mto.rows.flanges, undefined);
  const f2 = await hostedFixture(t); await f2.setup();
  await f2.signIn('Materials only', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  f2.usePilot('mto');
  assert.ok([403, 404].includes((await f2.request('/api/records/flanges')).status));
  f2.usePilot('weld');
  assert.ok([403, 404].includes((await f2.request('/api/records/flanges')).status), 'no welding profile, no flanges');
});

test('the sample flanges sit on isometrics of the sample projects', async t => {
  const f = await hostedFixture(t);
  const flanges = f.store.list('flanges'); assert.equal(flanges.length, 4);
  assert.ok(flanges.every(flange => f.store.list('isometrics').some(iso => iso.id === flange.isoId)));
  assert.equal(isoFlangeCount(flanges, 'iso-1'), 2);
});

test('a flange needs no Flange ID; a filled one stays unique per isometric, and only one flange without one per isometric; the project follows the isometric', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Weld writer', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const blank = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3' });
  assert.equal(blank.status, 201, 'add without Flange ID is accepted');
  const second = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3' });
  assert.equal(second.status, 422, 'a second one without Flange ID on the same isometric is refused');
  assert.equal((await second.json()).fields.flange_id, 'This isometric already has a flange without a Flange ID. Enter a Flange ID.');
  assert.equal((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-1' })).status, 201, 'one without Flange ID on another isometric');
  const blankRecord = (await blank.clone().json()).record;
  assert.equal((await f.request(`/api/records/flanges/${blankRecord.id}`, 'PUT', { operator: 'Edited', _version: blankRecord._version })).status, 200, 'the flange without Flange ID can still be edited');
  assert.equal((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-U-1' })).status, 201);
  const again = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-U-1' });
  assert.equal(again.status, 422); assert.ok((await again.json()).fields.flange_id);
  assert.equal((await f.request('/api/records/flanges', 'POST', { isoId: 'iso-1', flange_id: 'FL-U-1' })).status, 201, 'the same ID on another isometric');
  const iso = f.store.get('isometrics', 'iso-3'); const record = (await blank.json()).record;
  assert.equal(record.projectId, iso.projectId, 'stored from the isometric');
  const other = f.store.list('projects').find(project => project.id !== iso.projectId)!;
  const wrong = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-U-2', projectId: other.id });
  assert.equal(wrong.status, 201); assert.equal((await wrong.json()).record.projectId, iso.projectId, 'a project sent with the form only narrows the list');
  assert.ok(!f.store.list('flanges').some(flange => 'assetTag' in flange), 'the sample flanges keep their asset tag in line_number');
  assert.ok(['flange-1', 'flange-2', 'flange-3', 'flange-4'].every(id => flangeAssetTag(f.store.get('flanges', id)).startsWith('AT-')));
});

test('the flange report and the labels cover exactly the ticked flanges', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Weld writer', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const { flangeReportModel, flangeReportOptions } = await import('../shared/pdf-lists.ts');
  const rows = { flanges: f.store.list('flanges'), isometrics: f.store.list('isometrics'), projects: f.store.list('projects'), sites: f.store.list('sites'), companies: f.store.list('companies') };
  const options = flangeReportOptions({ ids: 'flange-1,flange-4' });
  assert.equal(options.error, undefined, 'ticked flanges need no isometric or project');
  assert.deepEqual(flangeReportModel(rows, options.options, new Set(rows.isometrics.map(iso => iso.id))).items.map(item => item.row.id).sort(), ['flange-1', 'flange-4']);
  assert.ok(flangeReportOptions({}).error, 'without ticks, isometric or project the report asks for one');
  const pdf = async (path: string) => { const response = await f.request(path); return { status: response.status, head: new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5)) }; };
  assert.deepEqual(await pdf('/api/pdf/flange-report?ids=flange-1,flange-2'), { status: 200, head: '%PDF-' });
  assert.deepEqual(await pdf('/api/pdf/flange-labels?ids=flange-1,flange-2,flange-3'), { status: 200, head: '%PDF-' });
  assert.equal((await f.request('/api/pdf/flange-labels')).status, 422, 'no ticked flanges, no labels');
  assert.equal((await f.request('/api/pdf/flange-labels?ids=unknown')).status, 404);
});
