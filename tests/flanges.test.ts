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
import * as F from '../shared/flanges.ts';
import { readFileSync } from 'node:fs';
import { pageAvailable } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { SITE_RULES } from '../shared/site-scope.ts';
import { RESOURCE_SCOPES } from '../shared/permissions.ts';

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
  /** A multipart request (signatures, hard copies, files) with the same session. */
  const form = async (path: string, body: FormData) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Flange-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, dir, request, form, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Flange admin', email: 'flange-admin@example.test', password })).status, 201) };
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
  assert.equal(again.status, 409); const repeated = await again.json(); assert.equal(repeated.error, 'Flange ID FL-U-1 already exists.'); assert.ok(repeated.fields.flange_id);
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

/* ======================================================================== wave 3: detail page, Edit and Documents */
test('Edit flange: the Add field groups with Note last and no Finished? box, titled Edit with Update (pilots); other profiles keep Finished on edit', () => {
  const names = FLANGE_FIELDS.map(field => field.name);
  assert.equal(names.at(-1), 'note'); assert.equal(FLANGE_FIELDS.at(-1)!.type, 'textarea'); assert.equal(FLANGE_FIELDS.at(-1)!.label, 'Note');
  const edit = F.flangeDialogFields(true, true).map(field => field.name), add = F.flangeDialogFields(true, false).map(field => field.name);
  assert.deepEqual(edit, add, 'Edit has the fields of Add');
  assert.ok(!edit.includes('finished')); assert.ok(edit.includes('note'));
  assert.ok(F.flangeDialogFields(false, true).some(field => field.name === 'finished'), 'the generic profiles still offer Finished on edit');
  assert.ok(!F.flangeDialogFields(false, false).some(field => field.name === 'finished'));
  const pilot = F.flangeEditorResource(RESOURCE_MAP.flanges, true);
  assert.deepEqual(pilot.wording, { add: 'Add Flange', edit: 'Edit', remove: 'Delete Flange' });
  assert.equal(F.flangeEditorResource(RESOURCE_MAP.flanges, false).wording, undefined);
  // The editor uses the shared rule and the resource wording (title "Edit", button "Update" when wording is set).
  const dialogs = readFileSync(new URL('../client/dialogs.tsx', import.meta.url), 'utf8');
  assert.match(dialogs, /flangeFieldInDialog\(f\.name,Boolean\(pilotKey\),Boolean\(record\)\)/);
  assert.match(dialogs, /def\.wording \? \(record \? 'Update' : 'Add'\)/);
});

test('Flange Size and Flange Rating suggest the reference lists and still accept any text', () => {
  const size = FLANGE_FIELDS.find(field => field.name === 'flange_size')!, rating = FLANGE_FIELDS.find(field => field.name === 'flange_rating')!;
  assert.deepEqual(size.options, ['1/2"', '3/4"', '1"', '1.1/2"', '2"', '3"', '4"', '6"', '8"', '10"', '12"', '14"', '16"', '18"', '20"', '24"', '30"', '36"', '42"', '48"']);
  assert.deepEqual(rating.options, ['150#', '300#', '600#', '900#', '1500#', '2500#']);
  assert.equal(size.free, true); assert.equal(rating.free, true);
  assert.equal(size.hint, undefined); assert.equal(rating.hint, undefined);
  assert.deepEqual(flangeInputErrors({ flange_size: 'DN150', flange_rating: 'PN 16' }), {});
});

test('the list shows 10 / 20 / 50 / 100 / 500 rows, 100 by default, sorted by Target Moment ascending; every column sorts', () => {
  assert.deepEqual(F.FLANGE_PAGE_SIZES, [10, 20, 50, 100, 500]); assert.equal(F.FLANGE_DEFAULT_PAGE_SIZE, 100);
  assert.deepEqual(F.FLANGE_DEFAULT_SORT, { key: 'target_moment_nm', dir: 'asc' });
  const items = flangeItems([row({ id: 'a', target_moment_nm: 100, flange_id: 'FL-10' }), row({ id: 'b', target_moment_nm: '', flange_id: 'FL-2' }), row({ id: 'c', target_moment_nm: 20, flange_id: 'FL-1' })], [], []);
  assert.deepEqual(F.sortFlanges(items, 'target_moment_nm', 'asc').map(item => item.row.id), ['c', 'a', 'b'], '20 before 100, empty last');
  assert.deepEqual(F.sortFlanges(items, 'target_moment_nm', 'desc').map(item => item.row.id), ['a', 'c', 'b'], 'empty last in either direction');
  assert.deepEqual(F.sortFlanges(items, 'flange_id', 'asc').map(item => item.row.id), ['c', 'b', 'a'], 'natural text order');
  const page = readFileSync(new URL('../client/flanges.tsx', import.meta.url), 'utf8');
  assert.match(page, /useState\(FLANGE_DEFAULT_PAGE_SIZE\)/); assert.match(page, /FLANGE_PAGE_SIZES\.map/); assert.match(page, /aria-sort=/);
});

test('the list page shows no tightening-standard banner (the catalog hint belongs to the dialog)', () => {
  const page = readFileSync(new URL('../client/flanges.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../client/flanges.css', import.meta.url), 'utf8');
  assert.ok(!page.includes('Tightening standard')); assert.ok(!page.includes('flange-standard')); assert.ok(!css.includes('.flange-standard'));
});

test('validated passes and bolts: within ±5% of the master targets; bolt numbers within the studbolt count; a failed bolt needs a deviation', () => {
  const flange = { target_moment_nm: 100, target_stress: '200', aantal_studbolts: 8 };
  assert.equal(F.passWithinTolerance({ torque_nm: 104, stress_value: 200 }, flange), true, '4% above passes');
  assert.equal(F.passWithinTolerance({ torque_nm: 106, stress_value: 200 }, flange), false, '6% above fails');
  assert.equal(F.passWithinTolerance({ torque_nm: 95, stress_value: 210 }, flange), true, 'both at the limit');
  assert.equal(F.passWithinTolerance({ torque_nm: 100, stress_value: 212 }, flange), false, 'stress outside fails');
  assert.equal(F.passWithinTolerance({ torque_nm: 100, stress_value: 999 }, { target_moment_nm: 100, target_stress: 'n/a' }), true, 'a Target Stress that is no number is not compared');
  assert.equal(F.passWithinTolerance({ torque_nm: 100, stress_value: 1 }, { target_moment_nm: '' }), false, 'no target, no validated pass');
  assert.ok(F.passInputErrors({ pass_number: 1, torque_nm: 100, stress_value: 1, tool_id: 'T', operator_name: 'O', performed_at: '2026-11-16T10:00' }, { target_moment_nm: '' }).torque_nm);
  assert.deepEqual(F.passInputErrors({ pass_number: 1, torque_nm: 100, stress_value: 1, tool_id: 'T', operator_name: 'O', performed_at: '2026-11-16T10:00' }, flange), {});
  assert.deepEqual(Object.keys(F.passInputErrors({ pass_number: 10 }, flange)).sort(), ['operator_name', 'pass_number', 'performed_at', 'stress_value', 'tool_id', 'torque_nm']);
  assert.equal(F.boltNumberValid(8, flange), true); assert.equal(F.boltNumberValid(9, flange), false); assert.equal(F.boltNumberValid(0, flange), false); assert.equal(F.boltNumberValid(2.5, flange), false);
  const passes = [row({ id: 'p1', flangeId: 'f' })];
  assert.ok(F.boltInputErrors({ passId: 'p1', bolt_no: 9, torque_nm: 100, stress_value: 200 }, flange, passes).bolt_no, 'above the studbolt count');
  const failed = F.boltInputErrors({ passId: 'p1', bolt_no: 2, torque_nm: 120, stress_value: 200 }, flange, passes);
  assert.ok(failed.deviation_reference && failed.deviation_reason, 'a failed bolt without deviation reference and reason is refused');
  assert.deepEqual(F.boltInputErrors({ passId: 'p1', bolt_no: 2, torque_nm: 120, stress_value: 200, deviation_reference: 'DEV-1', deviation_reason: 'Over torque' }, flange, passes), {});
  assert.ok(F.boltInputErrors({ passId: 'other', bolt_no: 2, torque_nm: 100, stress_value: 200 }, flange, passes).passId);
});

test('record rules: protocol completeness, alignment to 3 decimals, latest leak test, open deviations, final pass', () => {
  const complete: Record<string, unknown> = { assembly_date: '2026-11-16', tightening_method: 'Hydraulic torque', tool_id: 'T-1', operator_name: 'A. Fitter', method_equipment_id: 'HT-2', method_pressure_a: '700', method_pressure_b: '650', lmra_confirmed: true, installer_name: 'A. Fitter', installer_initials: 'AF' };
  for (const [key] of F.FLANGE_PREPARATION_CONTROLS) complete[`check_${key}`] = true;
  for (const [key] of F.FLANGE_ASSEMBLY_CHECKLIST) complete[`checklist_${key}`] = true;
  for (const [key] of F.FLANGE_COMPLETION_CHECKS) { complete[`${key}_date`] = '2026-11-16'; complete[`${key}_time`] = '10:15'; }
  for (const n of F.ALIGNMENT_POINTS) { complete[`alignment_before_${n}`] = '1.0'; complete[`alignment_after_${n}`] = '1,25'; }
  assert.equal(F.protocolMissing(complete), '');
  assert.match(F.protocolMissing(undefined), /No assembly record/);
  assert.match(F.protocolMissing({ ...complete, check_faces_checked: false }), /preparation/);
  assert.match(F.protocolMissing({ ...complete, method_pressure_b: '' }), /tightening method/);
  assert.match(F.protocolMissing({ ...complete, fifth_pass_time: '' }), /completion check/);
  assert.match(F.protocolMissing({ ...complete, alignment_after_3: '3.5' }), /above 2 mm/);
  assert.equal(F.protocolMissing({ ...complete, alignment_after_3: '3.5', deviation_reference: 'DEV-9' }), '');
  assert.equal(F.alignmentDifference('1.25', '0.1'), 1.15); assert.equal(F.alignmentDifference('0.5', '0,5004'), 0); assert.equal(F.alignmentDifference('', '1'), null);
  assert.deepEqual(F.recordInputErrors({ alignment_before_1: 'abc', initial_alignment_time: '25:00' }), { alignment_before_1: 'Enter a number in mm.', initial_alignment_time: 'Enter the time as HH:MM.' });
  const tests = [row({ id: 't1', flangeId: 'f', tested_at: '2026-11-15T09:00', result: 'Passed' }), row({ id: 't2', flangeId: 'f', tested_at: '2026-11-16T09:00', result: 'Failed' })];
  assert.equal(F.latestLeakTestPassed(tests, 'f'), false, 'only the latest result counts');
  assert.equal(F.latestLeakTestPassed([...tests, row({ id: 't3', flangeId: 'f', tested_at: '2026-11-16T12:00', result: 'Passed' })], 'f'), true);
  const events = [row({ id: 'd1', flangeId: 'f', reference: 'DEV-1', event: 'Opened', _createdAt: '2026-11-16T08:00:00Z' }), row({ id: 'd2', flangeId: 'f', reference: 'DEV-2', event: 'Opened', _createdAt: '2026-11-16T08:01:00Z' }), row({ id: 'd3', flangeId: 'f', reference: 'DEV-1', event: 'Restored', _createdAt: '2026-11-16T09:00:00Z' })];
  assert.deepEqual(F.openDeviations(events, 'f'), ['DEV-2']);
  const passes = [row({ id: 'p2', flangeId: 'f', pass_number: 2, result: 'NOK', performed_at: '2026-11-16T10:00' }), row({ id: 'p1', flangeId: 'f', pass_number: 1, result: 'OK', performed_at: '2026-11-16T09:00' })];
  assert.equal(F.finalPass(passes, 'f')!.id, 'p2', 'the highest pass decides');
});

test('the release gate lists the six captured checks in order; a technician signature alone is no QC sign-off', () => {
  assert.deepEqual([...F.GATE_LABELS], ['Passed mandatory leak test', 'Complete protocol and checklist', 'QC sign-off', 'Registered protocol PDF', 'Validated tightening pass within tolerance', 'No open deviations']);
  const empty = F.releaseGate({}, 'f');
  assert.deepEqual(empty.map(check => check.ok), [false, false, false, false, false, true], 'as captured on a new flange');
  const record = row({ id: 'r1', flangeId: 'f', _createdAt: '2026-11-16T00:00:00Z' });
  const technician = row({ id: 's1', flangeId: 'f', recordId: 'r1', role: 'Technician', method: 'Drawn signature' });
  assert.equal(F.releaseGate({ flange_records: [record], flange_signatures: [technician] }, 'f')[2].ok, false);
  assert.equal(F.releaseGate({ flange_records: [record], flange_signatures: [technician, row({ id: 's2', flangeId: 'f', recordId: 'r1', role: 'QA/QC', method: 'Signed hard-copy' })] }, 'f')[2].ok, false, 'a hard copy is no signature until validated');
  const qc = row({ id: 's3', flangeId: 'f', recordId: 'r1', role: 'QA/QC', method: 'Saved signature' });
  assert.equal(F.releaseGate({ flange_records: [record], flange_signatures: [technician, qc] }, 'f')[2].ok, true);
  const later = row({ id: 'r2', flangeId: 'f', _createdAt: '2026-11-17T00:00:00Z' });
  assert.equal(F.releaseGate({ flange_records: [record, later], flange_signatures: [technician, qc] }, 'f')[2].ok, false, 'signatures of an older record do not count');
  assert.equal(F.recordPdfHashMatches('a'.repeat(64), 'a'.repeat(64)), true); assert.equal(F.recordPdfHashMatches('a'.repeat(64), 'b'.repeat(64)), false); assert.equal(F.recordPdfHashMatches('', ''), false);
  assert.match(F.gateRefusal(empty), /^Release is not possible yet: Passed mandatory leak test\./);
  assert.deepEqual(F.workflowOptions(empty), ['Assembled', 'Rejected'], 'Released is offered once the gate is open');
  assert.deepEqual(F.workflowOptions(empty.map(check => ({ ...check, ok: true }))), ['Assembled', 'Rejected', 'Released']);
});

test('the record types are read only, delivered without a page, scoped through their flange, in the Flanges area; the detail page is delivered', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const resource of F.FLANGE_RECORD_RESOURCES) {
    assert.equal(RESOURCE_MAP[resource.key], resource); assert.equal(resource.readonly, true, resource.key);
    assert.deepEqual(hosted.resources[resource.key], resource.fields.map(field => field.name), resource.key);
    assert.ok(!hosted.navigation.includes(resource.key), `${resource.key} has no menu page`);
    assert.deepEqual(SITE_RULES[resource.key], { via: [['flangeId', 'flanges']] }, resource.key);
    assert.deepEqual(RESOURCE_SCOPES[resource.key], ['100'], resource.key);
    assert.equal(resource.fields.find(field => field.name === 'flangeId')?.ref, 'flanges');
  }
  assert.equal(F.FLANGE_RECORD_RESOURCES.length, 8);
  assert.ok(hosted.resources.attachments.includes('sha256') && hosted.resources.attachments.includes('recordId'));
  assert.equal(pageAvailable(hosted, '/weld/welding/flanges/flange-1', RESOURCES), true);
  assert.equal(pageAvailable(availabilityFor('welding-demo'), '/welding/flanges/flange-1', RESOURCES), false);
  assert.equal(F.flangePath('flange-1'), '/weld/welding/flanges/flange-1', 'the QR label leads to the detail page');
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082', 'hex');
const signForm = (role: string, extra: Record<string, string> = {}) => { const body = new FormData(); body.set('role', role); body.set('method', 'Drawn signature'); body.set('statement', 'true'); for (const [k, v] of Object.entries(extra)) body.set(k, v); body.set('file', new Blob([PNG], { type: 'image/png' }), 'signature.png'); return body; };
const completeRecord = () => {
  const values: Record<string, unknown> = { assembly_date: '2026-11-16', tightening_method: 'Torque', tool_id: 'TW-12', operator_name: 'R. Bolt', method_equipment_id: 'TW-12', lmra_confirmed: true, installer_name: 'R. Bolt', installer_initials: 'RB', pass1_target: '190', pass1_actual: '191', pass1_result: 'OK' };
  for (const [key] of F.FLANGE_PREPARATION_CONTROLS) values[`check_${key}`] = true;
  for (const [key] of F.FLANGE_ASSEMBLY_CHECKLIST) values[`checklist_${key}`] = true;
  for (const [key] of F.FLANGE_COMPLETION_CHECKS) { values[`${key}_date`] = '2026-11-16'; values[`${key}_time`] = '11:00'; }
  for (const n of F.ALIGNMENT_POINTS) { values[`alignment_before_${n}`] = '0.5'; values[`alignment_after_${n}`] = '0.2'; }
  return values;
};

test('a full assembly record through the API: passes, bolts, leak tests, labels, deviations, signatures, immutable PDF and release; the master record never changes', async t => {
  const f = await hostedFixture(t); await f.setup();
  const first = f.store.list('flanges')[0];
  f.store.update('flanges', first.id, { target_moment_nm: 190, aantal_studbolts: 8, target_stress: '' }, first._version);
  const master = f.store.get('flanges', first.id), target = 190, stress = 1, id = master.id;
  const json = async (response: Response) => ({ status: response.status, body: await response.json() as { error?: string; fields?: Record<string, string>; record?: Row } });
  await f.signIn('Flange fitter', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  // Generic routes cannot write the record types.
  assert.equal((await f.request('/api/records/flange_passes', 'POST', { flangeId: id, pass_number: 1 })).status, 405);
  // Nothing can be signed before a record is saved.
  assert.equal((await json(await f.form(`/api/flanges/${id}/signatures`, signForm('Technician')))).body.error, 'Save the record before signing it.');
  assert.equal((await f.request(`/api/flanges/${id}/record`, 'POST', { ...completeRecord(), alignment_before_1: 'abc' })).status, 422);
  assert.equal((await f.request(`/api/flanges/${id}/record`, 'POST', completeRecord())).status, 201);
  // A pass 6% above target is stored as failed and the gate stays closed; 4% is within tolerance.
  const pass = (pass_number: number, torque: number) => f.request(`/api/flanges/${id}/passes`, 'POST', { pass_number, torque_nm: torque, stress_value: stress, tool_id: 'TW-12', operator_name: 'R. Bolt', performed_at: `2026-11-16T1${pass_number}:00` });
  const high = await json(await pass(1, target * 1.06)); assert.equal(high.status, 201); assert.equal(high.body.record!.result, 'NOK');
  assert.equal(F.releaseGate({ flange_passes: f.store.list('flange_passes') }, id)[4].ok, false, 'a failed final pass keeps the gate closed');
  const good = await json(await pass(2, target * 1.04)); assert.equal(good.body.record!.result, 'OK');
  assert.equal((await pass(3, 0)).status, 422, 'a measured torque of 0 is refused');
  // Bolts: within the studbolt count; a failed one needs and opens a deviation.
  const bolt = (extra: Record<string, unknown>) => f.request(`/api/flanges/${id}/bolts`, 'POST', { passId: good.body.record!.id, bolt_no: 1, torque_nm: target, stress_value: stress, ...extra });
  assert.equal((await bolt({ bolt_no: 9 })).status, 422, 'a bolt number above the studbolt count is refused');
  const noRef = await json(await bolt({ torque_nm: target * 1.2 })); assert.equal(noRef.status, 422); assert.ok(noRef.body.fields!.deviation_reference);
  assert.equal((await bolt({ torque_nm: target * 1.2, deviation_reference: 'DEV-B1', deviation_reason: 'Bolt 1 over torque' })).status, 201);
  assert.deepEqual(F.openDeviations(f.store.list('flange_deviations'), id), ['DEV-B1'], 'the failed bolt opened its deviation');
  assert.equal((await f.request(`/api/flanges/${id}/deviations`, 'POST', { reference: 'DEV-X', reason: 'r', event: 'Restored' })).status, 422, 'no restoration without an open deviation');
  assert.equal((await f.request(`/api/flanges/${id}/deviations`, 'POST', { reference: 'DEV-B1', reason: 'Bolt replaced and re-torqued', event: 'Restored' })).status, 201);
  // Leak test: only the latest result counts. Labels: a QR token is registered once.
  assert.equal((await f.request(`/api/flanges/${id}/leak-tests`, 'POST', { test_type: 'Hydrostatic', pressure_value: '15', pressure_unit: 'bar', result: 'Failed', tested_at: '2026-11-16T12:00' })).status, 201);
  assert.equal((await f.request(`/api/flanges/${id}/leak-tests`, 'POST', { test_type: 'Hydrostatic', result: 'Passed' })).status, 422, 'Tested at is required');
  assert.equal((await f.request(`/api/flanges/${id}/labels`, 'POST', { label_number: 'L-1', qr_token: 'QR-TOKEN-1' })).status, 201);
  assert.equal((await f.request(`/api/flanges/${id}/labels`, 'POST', { label_number: 'L-2', qr_token: 'QR-TOKEN-1' })).status, 409);
  // Technician signature; QA/QC without the commit right is refused.
  const noStatement = signForm('Technician'); noStatement.set('statement', '');
  assert.equal((await json(await f.form(`/api/flanges/${id}/signatures`, noStatement))).body.error, 'Confirmation is required.');
  assert.equal((await f.form(`/api/flanges/${id}/signatures`, signForm('Technician'))).status, 201);
  assert.equal((await f.request(`/api/flanges/${id}/protocol-pdf`, 'POST', {})).status, 422, 'no PDF before the QA/QC sign-off');
  await f.signIn('Flange editor without commit', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '64': ['show'], '100': ['show', 'insert', 'edit', 'delete'] }) });
  assert.equal((await f.form(`/api/flanges/${id}/signatures`, signForm('QA/QC'))).status, 403, 'QA/QC signing without the commit flag');
  assert.equal((await f.request(`/api/flanges/${id}/workflow`, 'POST', { to_status: 'Assembled' })).status, 201, 'Flanges Edit records a workflow action');
  assert.equal((await f.request(`/api/flanges/${id}/workflow`, 'POST', { to_status: 'Released' })).status, 403, 'release needs the commit right');
  await f.signIn('Flange QC', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '64': ['show'], '100': ['show', 'insert', 'edit', 'delete', 'import'] }) });
  assert.equal((await f.form(`/api/flanges/${id}/signatures`, signForm('QA/QC', { qc_note: 'Checked on site.' }))).status, 201);
  assert.equal((await f.request(`/api/flanges/${id}/record`, 'POST', completeRecord())).status, 422, 'a record signed by QA/QC cannot change');
  // Release refuses with the first missing gate check: the latest leak test failed.
  const early = await json(await f.request(`/api/flanges/${id}/workflow`, 'POST', { to_status: 'Released' }));
  assert.equal(early.status, 422); assert.match(early.body.error!, /Passed mandatory leak test/);
  assert.equal((await f.request(`/api/flanges/${id}/leak-tests`, 'POST', { test_type: 'Hydrostatic', pressure_value: '15', pressure_unit: 'bar', result: 'Passed', tested_at: '2026-11-16T13:00' })).status, 201);
  assert.match((await json(await f.request(`/api/flanges/${id}/workflow`, 'POST', { to_status: 'Released' }))).body.error!, /Registered protocol PDF/);
  // The immutable PDF: stored once with its SHA-256; opened only while the hash matches.
  const generated = await json(await f.request(`/api/flanges/${id}/protocol-pdf`, 'POST', {})); assert.equal(generated.status, 201);
  const file = f.store.get('attachments', generated.body.record!.id);
  assert.match(String(file.sha256), /^[0-9a-f]{64}$/); assert.equal(file.documentType, F.FLANGE_PROTOCOL_DOCUMENT);
  assert.equal((await f.request(`/api/flanges/${id}/protocol-pdf`, 'POST', {})).status, 422, 'generated once per record');
  const opened = await f.request(`/api/flanges/${id}/protocol`); assert.equal(opened.status, 200); assert.equal(new TextDecoder().decode((await opened.arrayBuffer()).slice(0, 5)), '%PDF-');
  assert.equal((await f.request(`/api/flanges/${id}/protocol-preview`)).status, 200);
  assert.equal((await f.request(`/api/flanges/${id}/documents/${file.id}/archive`, 'POST', {})).status, 422, 'the registered PDF cannot be deleted');
  assert.equal((await f.request(`/api/flanges/${id}/workflow`, 'POST', { to_status: 'Released' })).status, 201, 'every gate check is met');
  // A changed file fails the hash check: it is not opened and release is refused.
  const stored = f.store.db.prepare('SELECT filename FROM upload_paths WHERE attachment_id=?').get(file.id) as { filename: string };
  writeFileSync(join(f.dir, 'uploads', stored.filename), Buffer.from('%PDF-1.7 changed'));
  assert.equal((await f.request(`/api/flanges/${id}/protocol`)).status, 409);
  assert.match((await json(await f.request(`/api/flanges/${id}/workflow`, 'POST', { to_status: 'Released' }))).body.error!, /does not match its stored hash/);
  // The flange master record is unchanged after the whole record.
  assert.deepEqual(f.store.get('flanges', id), master);
});

test('Documents: a general attachment through the generic upload, signed hard copies with their fields; delete archives and keeps the evidence', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Flange documents', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const id = f.store.list('flanges')[0].id;
  const upload = (documentType: string) => { const body = new FormData(); body.set('entityType', 'flanges'); body.set('entityId', id); body.set('documentType', documentType); body.set('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'datasheet.pdf'); return f.form('/api/files', body); };
  assert.equal((await upload(F.FLANGE_GENERAL_DOCUMENT)).status, 201);
  assert.equal((await upload(F.FLANGE_PROTOCOL_DOCUMENT)).status, 422, 'a protocol PDF cannot be uploaded as an attachment');
  const hardcopy = (fields: Record<string, string>, name = 'signed.pdf', type = 'application/pdf', bytes: Buffer = Buffer.from('%PDF-1.4 signed')) => { const body = new FormData(); for (const [k, v] of Object.entries(fields)) body.set(k, v); body.set('hard_copy_file', new Blob([new Uint8Array(bytes)], { type }), name); return f.form(`/api/flanges/${id}/hardcopy`, body); };
  const full = { signer_role: 'Technician', signer_name: 'R. Bolt', signed_date: '2026-11-16', reference: 'HC-1' };
  for (const missing of ['signer_name', 'signed_date', 'reference']) assert.equal((await hardcopy({ ...full, [missing]: '' })).status, 422, `${missing} is required`);
  assert.equal((await hardcopy(full, 'signed.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK'))).status, 422, 'a .docx is refused');
  assert.equal((await hardcopy(full, 'signed.pdf', 'application/pdf', Buffer.from('not a pdf'))).status, 422, 'the content must be a PDF');
  assert.equal((await hardcopy(full)).status, 201);
  const evidence = f.store.list('flange_signatures').find(row => row.flangeId === id)!;
  assert.deepEqual([evidence.method, evidence.role, evidence.signer_name, evidence.reference], ['Signed hard-copy', 'Technician', 'R. Bolt', 'HC-1']);
  const files = F.flangeDocuments(f.store.list('attachments'), id);
  assert.deepEqual(files.map(file => file.documentType), [F.FLANGE_GENERAL_DOCUMENT, F.FLANGE_HARDCOPY_DOCUMENT]);
  assert.equal((await f.request(`/api/flanges/${id}/documents/${files[1].id}/archive`, 'POST', {})).status, 422, 'signed evidence is kept');
  assert.equal((await f.request(`/api/flanges/${id}/documents/${files[0].id}/archive`, 'POST', {})).status, 200);
  assert.equal(f.store.get('attachments', files[0].id, true)._archived, true, 'delete archives the file');
  await f.signIn('Flange reader', { generalPermission: RO, materialsPermission: NONE, weldingPermission: RO });
  assert.equal((await hardcopy({ ...full, reference: 'HC-2' })).status, 403, 'read only cannot upload');
  assert.equal((await f.request(`/api/flanges/${id}/record`, 'POST', completeRecord())).status, 403, 'read only cannot record');
  assert.equal((await f.request(`/api/flanges/${id}/protocol-preview`)).status, 200, 'read only may open the preview');
});

test('Export is a real Excel workbook of exactly the ticked flanges with the list columns', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Flange exporter', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const response = await f.request('/api/flanges-export?ids=flange-2,flange-1');
  assert.equal(response.status, 200);
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
  const sheet = workbook.getWorksheet('Flanges')!;
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), FLANGE_LIST_COLUMNS.map(column => column.label));
  assert.equal(sheet.rowCount, 3, 'the header and the two ticked flanges');
  assert.equal(sheet.getRow(2).getCell(3).value, f.store.get('flanges', 'flange-2').flange_id, 'in the order sent');
  assert.equal((await f.request('/api/flanges-export')).status, 422, 'nothing ticked');
  assert.equal((await f.request('/api/flanges-export?ids=unknown')).status, 404);
  assert.equal(FLANGE_FIELDS.find(field => field.name === 'highRisk')?.hint, 'Requires enhanced control');
});

test('old flanges stay valid without a record; a free Flange Size and the Note are stored as typed', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Flange writer free', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  for (const flange of f.store.list('flanges')) assert.equal(F.latestRecord(f.store.list('flange_records'), flange.id), undefined);
  const created = await f.request('/api/records/flanges', 'POST', { isoId: 'iso-3', flange_id: 'FL-FREE', flange_size: 'DN150', flange_rating: 'PN 16', note: 'Spare flange' });
  assert.equal(created.status, 201); const record = (await created.json()).record;
  assert.deepEqual([record.flange_size, record.flange_rating, record.note], ['DN150', 'PN 16', 'Spare flange']);
});
