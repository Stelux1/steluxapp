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
import { loadDiameterCatalog } from '../server/diameter-catalog.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { ASME_P_NUMBERS, DIAMETER_NUMBER_MESSAGE, FLAG_BULK_RESOURCES, HOSTED_COLUMN_LABELS, HOSTED_COLUMNS, ISO_15608_GROUPS, PROJECT_TOOLBAR_RESOURCES, diameterNumbers, hostedField, hostedFieldOrder, hostedRelation, listDefaultSort, materialTypeOptionLabel, parseDiameterDecimal, supplierOptionLabel } from '../shared/welder-data.ts';
import { diameterRecord, missingDiameters, parseDiameterCapture, type DiameterCatalogRow } from '../shared/diameter-catalog.ts';
import { diameterOptionValue, diameterOptions } from '../shared/weld-entry.ts';
import { RELATIONS } from '../shared/welding.ts';
import type { Row } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const hostedFields = (key: string) => projectResource(hosted, RESOURCE_MAP[key]).fields;
const names = (key: string) => hostedFields(key).filter(field => !field.hidden && !field.generated).map(field => field.name);
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-material-data-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Material-Data-Password';
  return { store, request, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Material admin', email: 'material-admin@example.test', password })).status, 201), password, hash: passwordHash };
}
const json = async (response: Response) => response.json() as Promise<Record<string, any>>;

test('weld diameters list by Sorting; the catalog fields take a decimal comma and refuse other text with the reference message', async t => {
  assert.equal(listDefaultSort('diameters', true, 'diameter'), 'sorting');
  assert.equal(listDefaultSort('diameters', false, 'diameter'), 'diameter');
  assert.equal(listDefaultSort('material_parts', true, 'name'), 'name');
  assert.deepEqual(hostedFields('diameters').filter(field => field.decimal).map(field => field.name), ['size', 'sizeinch', 'outline']);
  assert.equal(RESOURCE_MAP.diameters.fields.some(field => field.decimal), false, 'the other profiles keep their number inputs');
  assert.equal(parseDiameterDecimal('279,1'), 279.1); assert.equal(parseDiameterDecimal('5.'), 5); assert.equal(parseDiameterDecimal(''), null); assert.equal(parseDiameterDecimal('abc'), undefined); assert.equal(parseDiameterDecimal('1,2,3'), undefined);
  assert.deepEqual(diameterNumbers({ size: '88,9', sizeinch: '3', outline: '279,1' }).values, { size: 88.9, sizeinch: 3, outline: 279.1 });
  assert.equal(diameterNumbers({ outline: 'abc' }).errors.outline, DIAMETER_NUMBER_MESSAGE);
  const f = await fixture(t); await f.setup();
  let response = await f.request('/api/records/diameters', 'POST', { diameter: '99"x18"', size: '88,9', sizeinch: '3', outline: '279,1', sorting: 0 });
  assert.equal(response.status, 201); const stored = (await json(response)).record;
  assert.equal(stored.size, 88.9); assert.equal(stored.outline, 279.1); assert.equal(stored.sizeinch, 3);
  response = await f.request('/api/records/diameters', 'POST', { diameter: '99"x20"', size: '88,9', outline: 'abc' });
  assert.equal(response.status, 422); assert.equal((await json(response)).fields.outline, DIAMETER_NUMBER_MESSAGE);
  response = await f.request(`/api/records/diameters/${stored.id}`, 'PUT', { sizeinch: '0,75', _version: stored._version });
  assert.equal(response.status, 200); assert.equal((await json(response)).record.sizeinch, 0.75);
});

test('the diameter catalog is read from the capture, skips test entries and loads without overwriting what exists', () => {
  const capture = [
    'DTROW || 3500 | 3500 | 138 | - | 0 | {A "" .buttonEdit data-id="519"} {A "" .buttonDelete}',
    'DTROW || 5 mm | 5 | . | 5 | 0 | {A "" .buttonEdit data-id="489"}',
    'DTROW || 3" | 88,9 | 3 | 279,1 | 7 | {A "" .buttonEdit data-id="8"}',
    'DTROW || test | 1 | 1 | 1 | 1 | {A "" .buttonEdit data-id="540"}',
    'DTROW || 7 mm | abc | - | - | 1 | {A "" .buttonEdit data-id="541"}',
    'DTROW || 3" | 88,9 | 3 | 279,1 | 7 | {A "" .buttonEdit data-id="542"}',
    '       TR .odd role="row" || 1/2" | 21,3 | 0,5 | 66,9 | 1 | {A "" .buttonEdit.open-editWeldDiameters.btn data-id="1"} {A "" .buttonDelete}',
    '       TR role="row" || TH:Diameter | TH:Size in mm',
    'TR || not a data row',
  ].join('\n');
  const { rows, skipped } = parseDiameterCapture(capture);
  assert.deepEqual(rows.map(item => [item.diameter, item.size, item.sizeinch, item.outline, item.sorting, item.ref]), [['3500', 3500, 138, null, 0, 519], ['5 mm', 5, null, 5, 0, 489], ['3"', 88.9, 3, 279.1, 7, 8], ['1/2"', 21.3, 0.5, 66.9, 1, 1]]);
  assert.deepEqual(skipped.map(item => item.ref), [540, 541, 542]);
  assert.deepEqual(diameterRecord(rows[0]), { diameter: '3500', size: 3500, sizeinch: 138, sorting: 0 });
  const store = new Store(':memory:');
  store.create('diameters', { diameter: '3"', size: 88.9, sizeinch: 3, outline: 111, sorting: 4 });
  assert.deepEqual(missingDiameters(rows, store.list('diameters', true)).map(item => item.diameter), ['3500', '5 mm', '1/2"']);
  assert.equal(loadDiameterCatalog(store, rows), 3);
  assert.equal(loadDiameterCatalog(store, rows), 0, 'a second run adds nothing');
  assert.equal(store.list('diameters').find(item => item.diameter === '3"')!.outline, 111, 'an existing diameter keeps its own values');
  assert.equal(store.list('diameters').length, 4);
  store.close();
  const sample = new Store(':memory:'); seed(sample); assert.ok(sample.list('diameters').length >= 490, 'the sample workspace holds the reference catalog'); assert.equal(sample.list('diameters').filter(item => item.diameter === '1/2"').length, 1, 'no diameter twice'); sample.close();
});

test('Dia. offers one entry per distinct Size in inches and maps the stored row to its entry', () => {
  const rows = [row('a', { diameter: '3/4"', sizeinch: 0.75, sorting: 2 }), row('b', { diameter: '1/2"', sizeinch: 0.5, sorting: 1 }), row('c', { diameter: '3/4"x16"', sizeinch: 0.75, sorting: 2 }), row('d', { diameter: '5 mm', sorting: 0 }), row('e', { diameter: '1"', sizeinch: 1 })];
  const options = diameterOptions(rows);
  assert.deepEqual(options.map(option => [option.value, option.label]), [['d', '5 mm'], ['b', '0.5'], ['a', '0.75'], ['e', '1']]);
  assert.equal(diameterOptionValue(options, 'c'), 'a');
  assert.equal(diameterOptionValue(options, 'missing'), 'missing');
  assert.equal(diameterOptions(rows, false).length, 5, 'without the hosted profile every row keeps its own entry');
});

test('material part Custom is text; the five catalogs lose the Description box; old Yes/No values still read and save', async t => {
  assert.equal(RESOURCE_MAP.material_parts.fields.find(field => field.name === 'custom')!.type, 'text');
  for (const key of ['material_parts', 'material_types', 'suppliers', 'ndt_locations', 'pwht_locations']) assert.equal(hosted.resources[key]?.includes('description'), false, `${key} still delivers a Description`);
  assert.equal(projectResource(hosted, RESOURCE_MAP.ndt_locations).fields.some(field => field.name === 'description'), false);
  assert.equal(projectResource(undefined, RESOURCE_MAP.suppliers).fields.some(field => field.name === 'description'), true, 'the other profiles keep it');
  assert.deepEqual(names('material_parts'), ['name', 'custom']);
  const f = await fixture(t); await f.setup();
  const old = f.store.list('material_parts').find(part => part.name === 'Customer spool piece')!;
  f.store.db.prepare('UPDATE material_parts SET data=? WHERE id=?').run(JSON.stringify({ name: 'Customer spool piece', custom: true, description: 'kept' }), old.id);
  const listed = ((await json(await f.request('/api/records/material_parts'))).rows as Row[]).find(part => part.id === old.id)!;
  assert.equal(listed.custom, 'Yes'); assert.equal('description' in listed, false);
  const response = await f.request(`/api/records/material_parts/${old.id}`, 'PUT', { name: 'Customer spool', _version: listed._version });
  assert.equal(response.status, 200); assert.equal(f.store.get('material_parts', old.id).description, 'kept', 'existing values stay stored');
  assert.equal((await f.request('/api/records/material_parts', 'POST', { name: 'Reducer 2', custom: 'Special' })).status, 201);
});

test('type of material: the ISO 15608 and P-Number lists are the reference lists and the three selects take a typed value', async t => {
  assert.deepEqual(ISO_15608_GROUPS, ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.4', '7.1', '7.2', '7.3', '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2', '10.3', '11.1']);
  assert.deepEqual(ASME_P_NUMBERS, ['P-1', 'P-3', 'P-4', 'P-5A', 'P-5B', 'P-5C', 'P-6', 'P-7', 'P-8', 'P-9A', 'P-9B', 'P-10A', 'P-10H', 'P-10I', 'P-15E', 'P-34']);
  const free = hostedFields('material_types').filter(field => field.free);
  assert.deepEqual(free.map(field => field.name), ['iso15608', 'asmePNumber', 'asmeGroup']);
  assert.ok(free.every(field => field.blank === 'Choose or type'));
  assert.match(free[0].intro!, /^Optional\. You can leave this empty\. Choose a value or type one that is not in the list\.$/);
  assert.equal(RESOURCE_MAP.material_types.fields.some(field => field.free), false);
  const f = await fixture(t); await f.setup();
  const response = await f.request('/api/records/material_types', 'POST', { name: 'X52', typeOfSteel: 'Carbon steel', iso15608: '12.4', asmePNumber: 'P-99', asmeGroup: '7' });
  assert.equal(response.status, 201); assert.match((await json(response)).record.isoAsme, /^12\.4 \/ P-99 Gr 7$/);
  assert.equal((await f.request('/api/records/material_types', 'POST', { name: 'X53', typeOfSteel: 'Carbon steel', iso15608: 'x'.repeat(60) })).status, 422);
});

test('supplier form has the ten reference fields in order; selects label suppliers and types of material like the reference', async t => {
  assert.deepEqual(names('suppliers'), ['name', 'address', 'zip', 'residence', 'mailbox', 'mnzip', 'mnresidence', 'phone', 'fax', 'email']);
  assert.deepEqual(hostedFields('suppliers').filter(field => ['mailbox', 'mnzip', 'mnresidence', 'fax'].includes(field.name)).map(field => field.label), ['Mailbox number', 'MN-Zip code', 'MN-Residence', 'Fax']);
  assert.equal(projectResource(undefined, RESOURCE_MAP.suppliers).fields.filter(field => !field.hidden).some(field => field.name === 'fax'), false, 'the other profiles do not show the new fields');
  assert.equal(supplierOptionLabel({ name: 'PFF BV', residence: 'Klundert' }), 'PFF BV Klundert');
  assert.equal(supplierOptionLabel({ name: 'Montavar Metalna Lola D.O.O.' }), 'Montavar Metalna Lola D.O.O.');
  assert.equal(materialTypeOptionLabel({ name: 'A234 Gr WPB', typeOfSteel: 'CS', materialDescription: 'Fitting' }), 'A234 Gr WPB/CS/Fitting/');
  assert.equal(materialTypeOptionLabel({ name: 'A106 Gr B', typeOfSteel: 'CS', materialDescription: 'Pipe', basicMaterial: 'C-Si' }), 'A106 Gr B/CS/Pipe/C-Si');
  const f = await fixture(t); await f.setup();
  const response = await f.request('/api/records/suppliers', 'POST', { name: 'New Supplier', mailbox: 'PB 12', mnzip: '1234 AB', mnresidence: 'Zwolle', fax: '+31 10 555 0100' });
  assert.equal(response.status, 201); const created = (await json(response)).record; assert.equal(created.fax, '+31 10 555 0100'); assert.equal(created.mnresidence, 'Zwolle');
});

test('welding wire form: reference field order, generated index number, free text types, Project with ALL, flag headers', async t => {
  assert.deepEqual(names('welding_wires'), ['chargeNo', 'attestNo', 'diameter', 'classification', 'typeMaterial', 'norm', 'supplierId', 'certType', 'controlled', 'accepted', 'description']);
  const wire = Object.fromEntries(hostedFields('welding_wires').map(field => [field.name, field]));
  assert.deepEqual([wire.diameter.label, wire.classification.label, wire.typeMaterial.label, wire.certType.label, wire.description.label, wire.controlled.label, wire.accepted.label], ['mm', 'Rod type', 'Type of material', 'Certificate-type', 'Note', 'Controlled', 'Accepted']);
  assert.equal(wire.typeMaterial.type, 'text'); assert.equal(wire.certType.type, 'text'); assert.equal(wire.certType.options, undefined);
  assert.ok(wire.name.generated && !wire.name.required, 'the index number is not asked for'); assert.ok(wire.allProjects.hidden); assert.equal(wire.manufacturer, undefined); assert.equal(wire.materialTypeId, undefined);
  assert.equal(hostedFields('certifications').find(field => field.name === 'certType')!.type, 'text');
  assert.equal(RESOURCE_MAP.welding_wires.fields.find(field => field.name === 'certType')!.type, 'select', 'the other profiles keep the EN 10204 list');
  const relation = hostedRelation('welding_wires', RELATIONS.welding_wires[0]);
  assert.deepEqual([relation.label, relation.allField, relation.showIf], ['Project', 'allProjects', undefined]);
  assert.deepEqual(hostedFieldOrder('welding_wires', [{ name: 'description' }, { name: 'projectIds' }, { name: 'norm' }, { name: 'chargeNo' }]).map(field => field.name), ['chargeNo', 'norm', 'projectIds', 'description']);
  assert.deepEqual(HOSTED_COLUMNS.welding_wires, ['name', 'chargeNo', 'classification', 'typeMaterial', 'diameter', 'certType', 'attestNo', 'supplierId', 'controlled', 'accepted']);
  // The list headers read Ctrl. / Accp. (wire and certificate); the form labels stay in full.
  assert.deepEqual(HOSTED_COLUMN_LABELS.welding_wires, { controlled: 'Ctrl.', accepted: 'Accp.' }); assert.deepEqual(HOSTED_COLUMN_LABELS.certifications, { controlled: 'Ctrl.', accepted: 'Accp.' });
  assert.equal(hostedField('certifications', RESOURCE_MAP.certifications.fields.find(field => field.name === 'controlled')!).label, 'Controlled');
  const f = await fixture(t); await f.setup();
  let response = await f.request('/api/records/welding_wires', 'POST', { chargeNo: 'C-77', typeMaterial: 'A106 Gr B', certType: '152516', diameter: 1.6, allProjects: true });
  assert.equal(response.status, 201); const created = (await json(response)).record;
  assert.match(created.name, /^\d{4}$/); assert.equal(created.certType, '152516'); assert.equal(created.typeMaterial, 'A106 Gr B'); assert.equal('manufacturer' in created, false);
  response = await f.request('/api/records/certifications', 'POST', { name: 'ATT-1', certType: '152516', allProjects: false, projectIds: ['project-steam'] });
  assert.equal(response.status, 201); assert.equal((await json(response)).record.certType, '152516');
  // Wires written before the field existed show the name of their linked type of material.
  const listed = ((await json(await f.request('/api/records/welding_wires'))).rows as Row[]).find(item => item.id === 'wire-1')!;
  assert.equal(listed.typeMaterial, 'A312 TP316L');
  f.store.db.prepare('UPDATE welding_wires SET data=? WHERE id=?').run(JSON.stringify({ ...f.store.get('welding_wires', 'wire-1'), typeMaterial: '' }), 'wire-1');
  const legacy = ((await json(await f.request('/api/records/welding_wires'))).rows as Row[]).find(item => item.id === 'wire-1')!;
  assert.equal(legacy.typeMaterial, 'A312 TP316L'); assert.equal('materialTypeId' in legacy, false);
});

test('Controlled / Accepted can be set on ticked welding wires and certificates; nothing else is bulk-editable there', async t => {
  assert.deepEqual(FLAG_BULK_RESOURCES, ['certifications', 'welding_wires']);
  const f = await fixture(t); await f.setup();
  const wires = f.store.list('welding_wires');
  const versions = Object.fromEntries(wires.map(wire => [wire.id, wire._version]));
  let response = await f.request('/api/bulk/welding_wires', 'POST', { ids: wires.map(wire => wire.id), changes: { controlled: true, accepted: false }, versions });
  assert.equal(response.status, 200); assert.equal((await json(response)).count, wires.length);
  assert.ok(f.store.list('welding_wires').every(wire => wire.controlled === true && wire.accepted === false));
  assert.equal((await f.request('/api/bulk/welding_wires', 'POST', { ids: [wires[0].id], changes: { norm: 'x' } })).status, 404);
  const certificates = f.store.list('certifications');
  response = await f.request('/api/bulk/certifications', 'POST', { ids: [certificates[0].id], changes: { controlled: true }, versions: { [certificates[0].id]: certificates[0]._version } });
  assert.equal(response.status, 200); assert.equal(f.store.get('certifications', certificates[0].id).controlled, true);
  assert.equal((await f.request('/api/bulk/certifications', 'POST', { ids: [certificates[0].id], changes: { chargeNo: 'x' } })).status, 404);
  assert.equal((await f.request('/api/bulk/material_types', 'POST', { ids: ['material-type-0'], changes: { typeOfSteel: 'x' } })).status, 404);
  assert.deepEqual(PROJECT_TOOLBAR_RESOURCES, ['certifications', 'welding_wires']);
});
