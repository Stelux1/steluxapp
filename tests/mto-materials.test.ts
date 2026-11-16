import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { runAction } from '../server/workflows.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { isoBudgets as statusBudgets } from '../shared/iso-status.ts';
import { isoBudgets, isoMaterialInputErrors, materialLineStatuses, materialStatus, phaseLocation, progressClassOf } from '../shared/mto-materials.ts';
import type { Row } from '../shared/types.ts';
import ExcelJS from 'exceljs';
import {
  MASS_EDIT_FIELDS, MATERIAL_DEFAULT_SORT, MATERIAL_FORM_FIELDS, MATERIAL_IMPORT_COLUMNS, MATERIAL_PAGE_SIZE, MATERIAL_PAGE_SIZES, importField, massEditChanges, massEditRefusal,
  materialImportPreview, materialImportSummary, materialTypeLabel, nextPhaseNumber, phasesById, phasesByName, resolveMaterialUom, showingEntries, sortMaterials, summaryText,
} from '../shared/material-db.ts';

const actor = { id: 'test', name: 'Test' };
const row = (id: string, props: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: `2026-01-01T00:00:0${id.length % 10}Z`, _updatedAt: '', ...props }) as Row;
const rows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));

// ----- pure functions -----------------------------------------------------------------------------------------------

test('a phase counts as Shop or Field by its explicit location, else by the word in its name', () => {
  assert.equal(phaseLocation(row('a', { name: 'Shop' })), 'shop');
  assert.equal(phaseLocation(row('a', { name: 'Support Shop' })), 'shop');
  assert.equal(phaseLocation(row('a', { name: 'Hydrotest field' })), 'field');
  assert.equal(phaseLocation(row('a', { name: 'Valves' })), undefined);
  assert.equal(phaseLocation(row('a', { name: 'Support WS' })), undefined);
  assert.equal(phaseLocation(row('a', { name: 'Shop Field swap' })), undefined, 'both words: ambiguous');
  assert.equal(phaseLocation(row('a', { name: 'Valves', progressLocation: 'Field' })), 'field', 'an explicit location wins');
  assert.equal(phaseLocation(row('a', { name: 'Shop', progressLocation: 'Field' })), 'field');
  assert.equal(phaseLocation(undefined), undefined);
});

function budgetRows() {
  return {
    isometrics: [row('iso-a'), row('iso-b')],
    operation_phases: [row('shop', { name: 'Shop' }), row('field', { name: 'Field' }), row('valves', { name: 'Valves' })],
    materials: [row('pipe', { progressClass: 'Pipe' }), row('support', { progressClass: 'Supports' }), row('appendage', { progressClass: 'Appendages' }), row('plain', { progressClass: '' }), row('bad', { progressClass: 'Fittings' })],
    custom_materials: [] as Row[],
    iso_materials: [
      row('r1', { isoId: 'iso-a', materialId: 'pipe', quantity: 12.5, phaseId: 'shop' }),
      row('r2', { isoId: 'iso-a', materialId: 'pipe', quantity: 2.25, phaseId: 'shop' }),
      row('r3', { isoId: 'iso-a', materialId: 'pipe', quantity: 7, phaseId: 'field' }),
      row('r4', { isoId: 'iso-a', materialId: 'support', quantity: 5, phaseId: 'shop' }),
      row('r5', { isoId: 'iso-a', materialId: 'appendage', quantity: 2, phaseId: 'field' }),
      row('r6', { isoId: 'iso-a', materialId: 'plain', quantity: 40, phaseId: 'shop' }),
      row('r7', { isoId: 'iso-a', materialId: 'support', quantity: 9, phaseId: 'valves' }),
      row('r8', { isoId: 'iso-a', materialId: 'support', quantity: 3, phaseId: '' }),
      row('r9', { isoId: 'iso-a', materialId: 'bad', quantity: 3, phaseId: 'shop' }),
      row('r10', { isoId: 'iso-b', materialId: 'pipe', quantity: 99, phaseId: 'shop' }),
      row('r11', { isoId: 'iso-a', materialId: 'pipe', quantity: 4, phaseId: 'shop', _archived: true }),
      row('r12', { isoId: 'iso-a', materialId: 'pipe', quantity: 0, phaseId: 'field' }),
      row('r13', { isoId: 'iso-a', customMaterial: true, materialNo: 'C-SUP', progressClass: 'Supports', quantity: 4, phaseId: 'field' }),
    ],
  } as Record<string, Row[]>;
}

test('isoBudgets sums classified materials of one isometric by progress driver and Shop / Field phase', () => {
  const data = budgetRows();
  assert.deepEqual(isoBudgets(data.isometrics[0], data), { shop: { materialPipe: 14.75, supports: 5 }, field: { materialPipe: 7, appendages: 2, supports: 4 } });
  assert.deepEqual(isoBudgets(data.isometrics[1], data), { shop: { materialPipe: 99 } });
  assert.deepEqual(statusBudgets(data.isometrics[0], data), isoBudgets(data.isometrics[0], data), 'iso-status delegates to the MTO budgets');
});

test('isoBudgets stays undefined without rows, without classified lines and for unknown classes', () => {
  const data = budgetRows();
  assert.equal(isoBudgets(data.isometrics[0]), undefined);
  assert.equal(statusBudgets(data.isometrics[0]), undefined);
  assert.equal(isoBudgets(row('iso-none'), data), undefined);
  assert.equal(isoBudgets(data.isometrics[0], { ...data, iso_materials: data.iso_materials.filter(line => ['r6', 'r7', 'r8', 'r9'].includes(line.id)) }), undefined);
  assert.equal(progressClassOf(data, data.iso_materials.find(line => line.id === 'r9')!), undefined);
  assert.equal(progressClassOf(data, data.iso_materials.find(line => line.id === 'r13')!), 'Supports');
});

function statusRows() {
  return {
    isometrics: [row('iso-a', { projectId: 'p' }), row('iso-b', { projectId: 'p' })],
    materials: [row('m1', { materialNo: 'M1' }), row('m2', { materialNo: 'M2' }), row('m3', { materialNo: 'M3' })], custom_materials: [] as Row[],
    iso_materials: [row('r1', { isoId: 'iso-a', materialId: 'm1', quantity: 10 }), row('r2', { isoId: 'iso-a', materialId: 'm2', quantity: 4 }), row('r3', { isoId: 'iso-a', materialId: 'm3', quantity: 6 }), row('r4', { isoId: 'iso-b', materialId: 'm1', quantity: 5 })],
    orders: [row('o1', { projectId: 'p', status: 'Pending' })],
    order_lines: [row('l1', { orderId: 'o1', materialId: 'm1', requirementId: 'r1', quantity: 10, received: 0 }), row('l2', { orderId: 'o1', materialId: 'm2', requirementId: 'r2', quantity: 2, received: 0 })],
    stock: [row('s1', { materialId: 'm1', warehouseId: 'w', quantity: 3 }), row('s2', { materialId: 'm2', warehouseId: 'w', quantity: 9 })],
    picklists: [row('k1', { isoId: 'iso-a', materialId: 'm1', requirementId: 'r1', quantity: 2 })],
  } as Record<string, Row[]>;
}

test('Ord.? / Inv. / Picked come from the requirement execution of the isometric', () => {
  const data = statusRows(), lines = materialLineStatuses(data, 'iso-a');
  assert.deepEqual([...lines.keys()], ['r1', 'r2', 'r3'], 'only this isometric');
  assert.deepEqual(lines.get('r1'), { requirementId: 'r1', required: 10, ordered: 10, isOrdered: true, inventory: 3, picked: 2 });
  assert.equal(lines.get('r2')!.isOrdered, false, 'ordered 2 of 4 is not ordered');
  assert.equal(lines.get('r2')!.inventory, 9);
  assert.deepEqual([lines.get('r3')!.ordered, lines.get('r3')!.inventory, lines.get('r3')!.picked, lines.get('r3')!.isOrdered], [0, 0, 0, false]);
});

test('material status is covered ÷ required, where covered = min(required, picked + inventory)', () => {
  const data = statusRows(), status = materialStatus(data.isometrics[0], data);
  // r1: min(10, 2 + 3) = 5; r2: min(4, 0 + 9) = 4 (inventory above the need counts only up to it); r3: 0.
  assert.deepEqual(status.lines, [{ requirementId: 'r1', required: 10, covered: 5 }, { requirementId: 'r2', required: 4, covered: 4 }, { requirementId: 'r3', required: 6, covered: 0 }]);
  assert.deepEqual([status.required, status.covered, status.percent], [20, 9, 45]);
  assert.equal(materialStatus(data.isometrics[1], data).percent, 60, 'iso-b reads the same inventory: min(5, 0 + 3) / 5');
  assert.equal(materialStatus(row('iso-empty'), data).percent, null, 'nothing required: no percentage');
  const full: Record<string, Row[]> = { ...data, stock: [row('s9', { materialId: 'm3', warehouseId: 'w', quantity: 100 }), ...data.stock] };
  assert.deepEqual([materialStatus(data.isometrics[0], full).covered, materialStatus(data.isometrics[0], full).percent], [15, 75]);
  assert.equal(materialStatus(data.isometrics[0], { ...full, iso_materials: full.iso_materials.map(line => line.id === 'r3' ? { ...line, _archived: true } : line) }).percent, 64.3, 'an archived line no longer counts');
});

test('isoMaterialInputErrors checks the catalog and the custom forms', () => {
  assert.deepEqual(isoMaterialInputErrors({ source: 'Catalog', materialId: 'm1', quantity: 2 }), {});
  assert.deepEqual(Object.keys(isoMaterialInputErrors({ source: 'Catalog', materialId: '', quantity: '' })), ['quantity', 'materialId']);
  for (const quantity of [0, -1, NaN, '3']) assert.ok(isoMaterialInputErrors({ source: 'Catalog', materialId: 'm1', quantity }).quantity, String(quantity));
  const custom = { source: 'Custom', materialNo: 'C-1', description: 'Clamp', uom: 'EA', quantity: 1, materialGroup: 'Support' };
  assert.deepEqual(isoMaterialInputErrors(custom, { requireGroup: true }), {});
  assert.deepEqual(Object.keys(isoMaterialInputErrors({ ...custom, materialNo: ' ', description: '', uom: '', materialGroup: '' }, { requireGroup: true })), ['materialNo', 'description', 'uom', 'materialGroup']);
  assert.equal(isoMaterialInputErrors({ ...custom, materialGroup: '' }).materialGroup, undefined, 'the group is only required when asked for');
  assert.ok(isoMaterialInputErrors({ ...custom, price: -1 }).price);
  assert.ok(isoMaterialInputErrors({ ...custom, progressClass: 'Valves' }).progressClass);
  assert.deepEqual(isoMaterialInputErrors({ ...custom, progressClass: 'Pipe', price: '' }), {});
  assert.ok(isoMaterialInputErrors({ source: 'Other', quantity: 1 }).source);
});

// ----- the transactional actions -------------------------------------------------------------------------------------

function fixture(t: { after: (fn: () => void) => void }) { const store = new Store(':memory:'); seed(store); t.after(() => store.close()); return store; }

test('adding a catalog material checks the group, the revision and the quantity', t => {
  const s = fixture(t), material = s.get('materials', 'material-9');
  const revision = s.create('revisions', { isoId: 'iso-2', type: 'ISO', revNo: '1', previousRev: '0', date: '2026-10-01' }, actor);
  const otherIsoRevision = s.create('revisions', { isoId: 'iso-3', type: 'ISO', revNo: '1', previousRev: '0', date: '2026-10-01' }, actor);
  const itpRevision = s.create('revisions', { isoId: 'iso-2', type: 'ITP', revNo: '1', previousRev: '0', date: '2026-10-01' }, actor);
  const base = { isoId: 'iso-2', source: 'Catalog', materialId: material.id, quantity: 3, phaseId: 'phase-3' };
  const added = runAction(s, 'add-iso-material', { ...base, materialGroup: 'Support', revisionId: revision.id }, actor);
  assert.ok('record' in added && added.record);
  assert.deepEqual([added.record.isoId, added.record.materialId, added.record.quantity, added.record.phaseId, added.record.revisionId, added.record.customMaterial], ['iso-2', 'material-9', 3, 'phase-3', revision.id, false]);
  assert.throws(() => runAction(s, 'add-iso-material', { ...base, materialGroup: 'Pipe' }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.materialId));
  for (const revisionId of [otherIsoRevision.id, itpRevision.id]) assert.throws(() => runAction(s, 'add-iso-material', { ...base, revisionId }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.revisionId));
  assert.throws(() => runAction(s, 'add-iso-material', { ...base, quantity: 0 }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.quantity));
  assert.throws(() => runAction(s, 'add-iso-material', { ...base, materialId: '' }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.materialId));
  assert.throws(() => runAction(s, 'add-iso-material', { ...base, phaseId: 'missing' }, actor), AppError);
  assert.equal(s.list('iso_materials').filter(line => line.isoId === 'iso-2' && line.materialId === 'material-9').length, 1, 'refused requests leave nothing behind');
});

test('a custom material keeps its progress class and can be added to the catalog with it', t => {
  const s = fixture(t), count = s.list('materials').length;
  const custom = { isoId: 'iso-2', source: 'Custom', materialNo: 'CUS-PIPE-1', description: 'Site-measured pipe', materialGroup: 'Pipe', uom: 'M', quantity: 6.5, phaseId: 'phase-0', componentCode: 'PIP', progressClass: 'Pipe' };
  const kept = runAction(s, 'add-iso-material', custom, actor);
  assert.ok('record' in kept && kept.record); assert.equal(s.list('materials').length, count);
  assert.deepEqual([kept.record.customMaterial, kept.record.progressClass, kept.record.componentCode], [true, 'Pipe', 'PIP']);
  const budgets = isoBudgets(s.get('isometrics', 'iso-2'), rows(s));
  assert.deepEqual(budgets, { shop: { materialPipe: 6.5 } }, 'the custom line feeds the Shop pipe budget');
  const saved = runAction(s, 'add-iso-material', { ...custom, materialNo: 'CUS-PIPE-2', addToDB: true }, actor);
  assert.ok('record' in saved && saved.record);
  const entered = s.get('materials', String(saved.record.materialId));
  assert.deepEqual([entered.progressClass, entered.componentCode, entered.materialGroup], ['Pipe', 'PIP', 'Pipe']);
  assert.throws(() => runAction(s, 'add-iso-material', { ...custom, materialNo: 'CUS-PIPE-3', materialGroup: '', addToDB: true }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.materialGroup));
  assert.throws(() => runAction(s, 'add-iso-material', { ...custom, materialNo: 'CUS-PIPE-4', progressClass: 'Fittings' }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.progressClass));
  assert.throws(() => runAction(s, 'add-iso-material', { ...custom, materialNo: 'CUS-PIPE-2', addToDB: true }, actor), AppError, 'a catalog number is unique');
  assert.equal(s.list('iso_materials').filter(line => line.materialNo === 'CUS-PIPE-2').length, 1, 'the failed duplicate rolled back its requirement');
});

test('Set type changes the operation phase of all checked lines or none', t => {
  const s = fixture(t), ids = ['requirement-1', 'requirement-11'];
  const result = runAction(s, 'set-material-type', { requirementIds: ids, phaseId: 'phase-4' }, actor);
  assert.ok('records' in result && result.records?.length === 2);
  assert.deepEqual(ids.map(id => s.get('iso_materials', id).phaseId), ['phase-4', 'phase-4']);
  const before = JSON.stringify(s.list('iso_materials'));
  assert.throws(() => runAction(s, 'set-material-type', { requirementIds: ['requirement-2', 'nope'], phaseId: 'phase-0' }, actor), AppError);
  assert.throws(() => runAction(s, 'set-material-type', { requirementIds: ['requirement-2'], phaseId: 'nope' }, actor), AppError);
  assert.throws(() => runAction(s, 'set-material-type', { requirementIds: [], phaseId: 'phase-0' }, actor), (e: AppError) => e.status === 422);
  assert.equal(JSON.stringify(s.list('iso_materials')), before);
});

test('Delete selected archives the checked lines, keeps them restorable and rolls back as a whole', t => {
  const s = fixture(t);
  assert.throws(() => runAction(s, 'archive-iso-materials', { requirementIds: ['requirement-12', 'nope'] }, actor), AppError);
  assert.equal(s.get('iso_materials', 'requirement-12')._archived, false);
  const result = runAction(s, 'archive-iso-materials', { requirementIds: ['requirement-12', 'requirement-13'] }, actor);
  assert.ok('records' in result && result.records?.every(record => record._archived));
  assert.equal(s.list('iso_materials').some(line => line.id === 'requirement-12'), false);
  const archived = s.get('iso_materials', 'requirement-12', true); s.archive('iso_materials', archived.id, archived._version, actor);
  assert.equal(s.get('iso_materials', 'requirement-12')._archived, false, 'restored');
  assert.throws(() => runAction(s, 'archive-iso-materials', { requirementIds: [] }, actor), (e: AppError) => e.status === 422);
});

// ----- the hosted profile --------------------------------------------------------------------------------------------

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;

test('the hosted profile delivers the MTO catalogs and the data behind Ord.? / Inv. / Picked', () => {
  for (const key of ['materials', 'uoms', 'operation_phases', 'iso_materials', 'material_parts', 'material_types', 'suppliers']) assert.ok(hosted.navigation.includes(key), `${key} has a page`);
  for (const key of ['custom_materials', 'orders', 'order_lines', 'stock', 'movements', 'picklists', 'material_quantity_changes']) assert.ok(hosted.resources[key]?.length, `${key} is delivered`);
  // The stock page belongs to the inventory flow (Material inventory); the others stay data only here.
  for (const key of ['custom_materials', 'orders', 'order_lines', 'movements', 'material_quantity_changes']) assert.ok(!hosted.navigation.includes(key), `${key} has no page of its own here`);
  assert.deepEqual(hosted.resources.uoms, ['name']);
  for (const name of ['componentCode', 'progressClass', 'partId', 'typeId', 'materialGroup']) assert.ok(hosted.resources.materials.includes(name), name);
  for (const name of ['progressClass', 'componentCode', 'revisionId']) assert.ok(hosted.resources.iso_materials.includes(name), name);
  assert.ok(hosted.resources.operation_phases.includes('progressLocation'));
  for (const key of ['add-iso-material', 'set-material-type', 'archive-iso-materials', 'remove-material-quantity']) assert.ok(hosted.actions[key], key);
  // The Material database shows the reference columns and labels in the reference order.
  const materials = projectResource(hosted, RESOURCE_MAP.materials);
  assert.deepEqual(materials.columns.map(key => materials.fields.find(field => field.name === key)!.label), ['Component code', 'Material group', 'Article No', 'Material No', 'Material description', 'DIA', 'LBS/SCH', 'UOM']);
  assert.ok(materials.fields.find(field => field.name === 'materialGroup')!.required, 'the group is required in the form');
  assert.deepEqual(materials.fields.filter(field => !field.hidden).slice(0, 11).map(field => field.label), ['Component code', 'Material group', 'Article No', 'Legacy No', 'Material No', 'DIA', 'LBS/SCH', 'UOM', 'Material part', 'Type of material', 'Material description']);
  const phases = projectResource(hosted, RESOURCE_MAP.operation_phases);
  assert.deepEqual(phases.columns.map(key => phases.fields.find(field => field.name === key)!.label), ['ID', 'Operation Phase']);
  const uoms = projectResource(hosted, RESOURCE_MAP.uoms);
  assert.deepEqual([uoms.columns, uoms.fields.map(field => field.label)], [['name'], ['UOM']]);
  assert.equal(RESOURCE_MAP.materials.fields.find(field => field.name === 'materialGroup')!.required, undefined, 'other profiles do not require it');
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: 'full' | typeof HOSTED_RELEASE_PROFILE = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-materials-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const form = data instanceof FormData;
    const response = await fetch(origin + path, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Mto-Materials-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Admin', email: 'mto-admin@example.test', password })).status, 201) };
}
const body = async (response: Response) => await response.json() as { record?: Row; records?: Row[]; rows?: Record<string, Row[]>; count?: number; errors?: unknown[]; fields?: Record<string, string> };

test('the Material database requires a group in the pilots profile, validates the class and supports mass edit', async t => {
  const f = await hostedFixture(t); await f.setup();
  const bare = { materialNo: 'HTTP-PIPE-1', description: 'Seamless pipe, A106 Gr B', uom: 'M', dia: '3', lbs: 'SCH 40' };
  let response = await f.request('/api/records/materials', 'POST', bare);
  assert.equal(response.status, 422); assert.ok((await body(response)).fields?.materialGroup);
  response = await f.request('/api/records/materials', 'POST', { ...bare, materialGroup: 'Pipe', componentCode: 'PIP', progressClass: 'Fittings' });
  assert.equal(response.status, 422); assert.ok((await body(response)).fields?.progressClass);
  response = await f.request('/api/records/materials', 'POST', { ...bare, materialGroup: 'Pipe', componentCode: 'PIP', progressClass: 'Pipe', partId: 'part-0', typeId: 'material-type-0' });
  assert.equal(response.status, 201); const created = (await body(response)).record!;
  assert.deepEqual([created.progressClass, created.componentCode, created.partId], ['Pipe', 'PIP', 'part-0']);
  const second = (await body(await f.request('/api/records/materials', 'POST', { ...bare, materialNo: 'HTTP-PIPE-2', materialGroup: 'Pipe' }))).record!;
  // Mass edit of the checked rows: all or nothing.
  response = await f.request('/api/bulk/materials', 'POST', { ids: [created.id, second.id], changes: { uomId: 'uom-KG', lbs: 'SCH 80' }, versions: { [created.id]: created._version, [second.id]: second._version } });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); assert.equal((await body(response)).count, 2);
  assert.deepEqual([f.store.get('materials', created.id).uom, f.store.get('materials', second.id).lbs], ['KG', 'SCH 80']);
  response = await f.request('/api/bulk/materials', 'POST', { ids: [created.id, second.id], changes: { materialGroup: '' }, versions: { [created.id]: created._version + 1, [second.id]: second._version + 1 } });
  assert.equal(response.status, 422); assert.equal(f.store.get('materials', created.id).materialGroup, 'Pipe');
  // UOMs and Operation Phases follow the reference fields.
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'RL' })).status, 201);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'RL' })).status, 409);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: '' })).status, 422);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'XX', symbol: 'x' })).status, 404, 'only the UOM field is delivered');
  response = await f.request('/api/records/operation_phases', 'POST', { name: 'Support WS', progressLocation: 'Shop' });
  assert.equal(response.status, 201);
  assert.equal((await f.request('/api/records/operation_phases', 'POST', { name: 'Odd', progressLocation: 'Yard' })).status, 422);
});

test('CSV import (where it exists) keeps accepting the earlier column headings of the Material database', async t => {
  const f = await hostedFixture(t, 'full'); await f.setup();
  const upload = (csv: string) => { const form = new FormData(); form.set('file', new Blob([csv], { type: 'text/csv' }), 'materials.csv'); return f.request('/api/import/materials/preview', 'POST', form); };
  const earlier = await body(await upload('Material number,Description,Unit of measure,Material group,Diameter\nIMP-1,Gate valve 150,EA,Valve,2\n'));
  assert.deepEqual([earlier.count, earlier.errors], [1, []]);
  const current = await body(await upload('Material No,Material description,UOM,Material group,DIA\nIMP-2,Gate valve 300,EA,Valve,2\n'));
  assert.deepEqual([current.count, current.errors], [1, []]);
  const hostedImport = await hostedFixture(t); await hostedImport.setup();
  assert.equal((await hostedImport.request('/api/import/materials/preview', 'POST', new FormData())).status, 404, 'the pilots profile keeps CSV import closed');
});

test('the MTO actions are allowed to MTO writers and refused to readers, other pilots and anonymous callers', async t => {
  const f = await hostedFixture(t);
  const requirement = f.store.get('iso_materials', 'requirement-1');
  assert.equal((await f.request('/api/actions/set-material-type', 'POST', { requirementIds: [requirement.id], phaseId: 'phase-1' })).status, 401);
  await f.setup();
  // Administrator in the MTO pilot.
  let response = await f.request('/api/actions/set-material-type', 'POST', { requirementIds: [requirement.id], phaseId: 'phase-1' });
  assert.equal(response.status, 201); assert.equal((await body(response)).records?.[0].phaseId, 'phase-1');
  response = await f.request('/api/actions/add-iso-material', 'POST', { isoId: 'iso-1', source: 'Catalog', materialGroup: 'Pipe', materialId: 'material-1', quantity: 1.5, phaseId: 'phase-0' });
  assert.equal(response.status, 201); const added = (await body(response)).record!;
  assert.equal((await f.request('/api/actions/add-iso-material', 'POST', { isoId: 'iso-1', source: 'Catalog', materialGroup: 'Valve', materialId: 'material-1', quantity: 1 })).status, 422);
  assert.equal((await f.request('/api/actions/add-iso-material', 'POST', { isoId: 'iso-1', source: 'Catalog', materialId: 'material-1', quantity: 1, price: 3, surprise: true })).status, 404, 'undelivered fields are refused');
  // The Weld pilot refuses all of it.
  f.usePilot('weld');
  for (const [key, data] of [['set-material-type', { requirementIds: [added.id], phaseId: 'phase-2' }], ['archive-iso-materials', { requirementIds: [added.id] }], ['add-iso-material', { isoId: 'iso-1', source: 'Catalog', materialId: 'material-1', quantity: 1 }]] as const) assert.equal((await f.request(`/api/actions/${key}`, 'POST', data)).status, 403, key);
  f.usePilot('mto');
  assert.equal(f.store.get('iso_materials', added.id).phaseId, 'phase-0');
  response = await f.request('/api/actions/archive-iso-materials', 'POST', { requirementIds: [added.id] });
  assert.equal(response.status, 201); assert.equal((await body(response)).records?.[0]._archived, true);
});

test('a read-only MTO account reads the data behind the columns but cannot change materials', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('MTO viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  for (const key of ['materials', 'uoms', 'operation_phases', 'iso_materials', 'orders', 'order_lines', 'stock', 'picklists', 'movements', 'custom_materials']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  const bootstrap = await body(await f.request('/api/bootstrap'));
  for (const key of ['orders', 'stock', 'picklists', 'uoms']) assert.ok(Array.isArray(bootstrap.rows?.[key]), `${key} is in the MTO bootstrap`);
  for (const [key, data] of [['set-material-type', { requirementIds: ['requirement-1'], phaseId: 'phase-1' }], ['archive-iso-materials', { requirementIds: ['requirement-1'] }], ['add-iso-material', { isoId: 'iso-1', source: 'Catalog', materialId: 'material-1', quantity: 1 }]] as const) assert.equal((await f.request(`/api/actions/${key}`, 'POST', data)).status, 403, key);
  assert.equal((await f.request('/api/records/materials', 'POST', { materialNo: 'RO-1', materialGroup: 'Pipe', description: 'x', uom: 'EA' })).status, 403);
  assert.equal((await f.request('/api/bulk/materials', 'POST', { ids: ['material-1'], changes: { uom: 'KG' }, versions: { 'material-1': 1 } })).status, 403);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'RO' })).status, 403);
  // The same account in the Weld pilot has no MTO records at all (it has no Weld rights either).
  f.usePilot('weld');
  assert.ok([403].includes((await f.request('/api/records/orders')).status));
});

test('the Weld pilot bootstrap carries no order, stock or pick data', async t => {
  const f = await hostedFixture(t); await f.setup();
  f.usePilot('weld');
  const weld = await body(await f.request('/api/bootstrap'));
  for (const key of ['orders', 'order_lines', 'stock', 'movements', 'picklists', 'uoms', 'iso_materials', 'custom_materials', 'operation_phases']) assert.equal(weld.rows?.[key], undefined, key);
  f.usePilot('mto');
  const mto = await body(await f.request('/api/bootstrap'));
  const execution = materialLineStatuses(mto.rows!, 'iso-1');
  assert.ok(execution.size >= 4, 'the first sample isometric has its requirement lines');
  assert.ok(materialStatus(mto.rows!.isometrics.find(iso => iso.id === 'iso-1')!, mto.rows!).required > 0);
  assert.ok(isoBudgets(mto.rows!.isometrics.find(iso => iso.id === 'iso-1')!, mto.rows!)?.shop?.materialPipe, 'the sample isometric has a Shop pipe budget');
});

test('hosted MTO catalogs use the capture wording: suppliers, service companies, laydowns and storehouses; other profiles keep theirs', () => {
  const resource = (key: string, profile: Parameters<typeof availabilityFor>[0] = HOSTED_RELEASE_PROFILE) => projectResource(availabilityFor(profile), RESOURCES.find(row => row.key === key)!);
  const columnLabels = (key: string) => { const def = resource(key); return def.columns.map(name => def.fields.find(field => field.name === name)?.label); };
  assert.deepEqual(columnLabels('suppliers'), ['Name', 'Address', 'Email address', 'Phone']);
  assert.equal(resource('service_companies').fields.find(field => field.name === 'name')?.label, 'Name');
  assert.equal(resource('service_companies').fields.find(field => field.name === 'email')?.label, 'Email address');
  assert.equal(resource('laydowns').fields.find(field => field.name === 'name')?.label, 'Laydown');
  assert.equal(resource('material_laydowns').fields.find(field => field.name === 'name')?.label, 'Laydown');
  assert.equal(resource('warehouses').title, 'Storehouses');
  assert.equal(resource('suppliers', 'full').fields.find(field => field.name === 'name')?.label, 'Supplier name');
  assert.equal(resource('warehouses', 'full').title, 'Warehouses');
});

// ----- Material database (w2-mto-material-db) ---------------------------------------------------------------------------

test('material forms: reference field order, Type of material option text, mass edit fields without Material No', () => {
  assert.deepEqual(MATERIAL_FORM_FIELDS.map(name => RESOURCE_MAP.materials.fields.find(field => field.name === name)!.label), ['Component code', 'Material group', 'Article No', 'Legacy No', 'Material No', 'DIA', 'LBS/SCH', 'UOM', 'Material part', 'Type of material', 'Material description']);
  assert.ok(!MASS_EDIT_FIELDS.includes('materialNo'));
  assert.equal(materialTypeLabel({ name: 'A106 Gr B', typeOfSteel: 'CS', materialDescription: 'Pipe', basicMaterial: 'C-Si' }), 'A106 Gr B / CS / Pipe / C-Si');
  assert.equal(materialTypeLabel({ name: 'A106-B', typeOfSteel: 'CS' }), 'A106-B / CS /  / ', 'empty parts are kept');
  assert.deepEqual(massEditChanges({ materialGroup: ' X ', dia: '', uomId: 'uom-M', lbs: undefined }), { materialGroup: 'X', uomId: 'uom-M' });
  assert.match(massEditRefusal({ materialNo: 'N' }), /cannot be changed/);
  assert.match(massEditRefusal({}), /at least one/);
  assert.equal(massEditRefusal({ materialGroup: 'X', description: 'Y' }), '');
});

test('the list shows 20 of 10/20/50/100/500 entries, sorted by UOM to start with, and sorts any column both ways', () => {
  assert.deepEqual([MATERIAL_PAGE_SIZES, MATERIAL_PAGE_SIZE, MATERIAL_DEFAULT_SORT], [[10, 20, 50, 100, 500], 20, { column: 'uom', direction: 'asc' }]);
  const list = [row('a', { materialNo: 'M-10', uom: 'M', componentCode: '2' }), row('b', { materialNo: 'M-2', uom: 'EA', componentCode: '' }), row('c', { materialNo: 'M-1', uom: 'EA', componentCode: '1' })];
  assert.deepEqual(sortMaterials(list, 'uom', 'asc').map(item => item.id), ['c', 'b', 'a'], 'ties by Material No, numbers by value');
  assert.deepEqual(sortMaterials(list, 'componentCode', 'desc').map(item => item.id), ['a', 'c', 'b']);
  assert.deepEqual(sortMaterials(list, 'materialNo', 'asc').map(item => item.id), ['c', 'b', 'a']);
  assert.equal(showingEntries(21, 40, 1234), 'Showing 21 to 40 of 1,234 entries');
  assert.equal(showingEntries(1, 0, 0), 'Showing 0 to 0 of 0 entries');
});

test('phases: ID order for the Add material Type select (first one preselected), A-Z for the dashboard and Set type', () => {
  const phases = [row('p-field', { name: 'Field', sort: 2 }), row('p-shop', { name: 'Shop', sort: 1 }), row('p-new', { name: 'Bernecker', number: 7 }), row('p-gone', { name: 'Old', number: 9, _archived: true })];
  assert.deepEqual(phasesById(phases).map(phase => phase.name), ['Shop', 'Field', 'Bernecker']);
  assert.deepEqual(phasesByName(phases).map(phase => phase.name), ['Bernecker', 'Field', 'Shop']);
  assert.equal(nextPhaseNumber(phases), 10, 'deleted phases keep their number');
});

test('the import reads the reference headings and checks every row as the reference preview does', () => {
  assert.deepEqual(MATERIAL_IMPORT_COLUMNS.map(column => column.header), ['CC', 'Group', 'Article No', 'Material No', 'Description', 'DIA', 'LBS/SCH', 'UOM', 'Legacy No', 'Type Material', 'Material Part']);
  assert.deepEqual(['CC', 'group', 'Article  No', 'MATERIAL NO', 'LBS/SCH', 'Type Material', 'Material Part', 'Colour'].map(importField), ['componentCode', 'materialGroup', 'articleNo', 'materialNo', 'lbs', 'typeMaterial', 'materialPart', '']);
  const context = { materials: [row('m', { materialNo: 'OLD-1' })], uoms: [row('ea', { name: 'EA' }), row('m-uom', { name: 'M' })], parts: [row('pipe', { name: 'Pipe' })], types: [row('t', { name: 'A106 Gr B' })] };
  const preview = materialImportPreview([
    { rowNo: 2, values: { componentCode: '1', materialGroup: 'PIPE', materialNo: 'NEW-1', uom: 'm', materialPart: 'pipe', typeMaterial: 'A106 Gr B' } },
    { rowNo: 3, values: { componentCode: '4', materialGroup: '', materialNo: 'NEW-2', uom: 'XX', materialPart: 'Bolt', typeMaterial: 'Nope' } },
    { rowNo: 4, values: { materialGroup: 'PIPE', materialNo: 'OLD-1', uom: 'EA' } },
    { rowNo: 5, values: { materialGroup: 'PIPE', materialNo: 'NEW-1', uom: 'EA' }, action: 'skip' },
    { rowNo: 6, values: { materialGroup: 'PIPE', uom: '' } },
  ], context);
  assert.deepEqual(preview.map(item => Object.keys(item.error).sort()), [[], ['componentCode', 'materialGroup', 'materialPart', 'typeMaterial', 'uom'], [], ['materialNo'], ['materialNo', 'uom']]);
  assert.ok(preview[2].warning.materialNoExists, 'a Material No in the database is a warning');
  assert.equal(preview[3].action, 'skip');
  assert.equal(summaryText(materialImportSummary(preview)), 'Rows: 5 | Errors: 3 | Importable now: 1');
});

test('a hosted material write points at a UOMs record: EA when none is given, a typed code must exist', () => {
  const uoms = [row('uom-EA', { name: 'EA' }), row('uom-M', { name: 'M' }), row('uom-X', { name: 'X', _archived: true })];
  assert.deepEqual(resolveMaterialUom({}, undefined, uoms), { uomId: 'uom-EA', uom: 'EA' });
  assert.deepEqual(resolveMaterialUom({ uom: 'm' }, undefined, uoms), { uomId: 'uom-M', uom: 'M' });
  assert.deepEqual(resolveMaterialUom({ uom: 'XX' }, undefined, uoms), { error: ['uom', 'UOM XX is not on the UOMs page.'] });
  assert.ok('error' in resolveMaterialUom({ uomId: 'uom-X' }, undefined, uoms), 'a deleted UOM cannot be chosen');
  assert.deepEqual(resolveMaterialUom({}, row('old', { uom: 'M' }), uoms), { uomId: 'uom-M', uom: 'M' }, 'a material saved with a code gets its UOM record');
});

async function workbook(header: string[], lines: string[][]) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Materials'); sheet.addRow(header); for (const line of lines) sheet.addRow(line);
  const form = new FormData(); form.set('file', new Blob([await book.xlsx.writeBuffer()]), 'materials.xlsx'); return form;
}
interface PreviewBody { rows: { rowNo: number; values: Record<string, string>; action: string; source: string; origin?: string; error: Record<string, string>; warning: Record<string, string> }[]; summary: { rows: number; errors: number; importable: number }; empty?: boolean }

test('Import material: an .xlsx with the reference headings is previewed per row and commit imports only the valid rows', async t => {
  const f = await hostedFixture(t); await f.setup();
  const existing = f.store.get('materials', 'material-1');
  const headings = ['CC', 'Group', 'Article No', 'Material No', 'Description', 'DIA', 'LBS/SCH', 'UOM'];
  const form = await workbook(headings, [['1', 'PIPE CS', 'ART-9', 'IMP-PIPE-1', 'Pipe 6"', '6', 'SCH 40', 'M'], ['2', 'SUPPORT', '', 'IMP-SUP-1', 'Shoe', '6', '', 'XX'], ['', 'PIPE CS', '', String(existing.materialNo), 'Duplicate', '', '', 'EA'], ['3', 'PIPE CS', '', 'IMP-PIPE-1', 'Again', '', '', 'EA']]);
  let response = await f.request('/api/material-import/preview', 'POST', form);
  assert.equal(response.status, 200, await response.clone().text());
  const preview = await response.json() as PreviewBody;
  assert.deepEqual(preview.rows.map(item => [item.rowNo, Object.keys(item.error), Object.keys(item.warning)]), [[2, [], []], [3, ['uom'], []], [4, [], ['materialNoExists']], [5, ['materialNo'], []]]);
  assert.deepEqual(preview.summary, { rows: 4, errors: 2, importable: 1 });
  // The page sends the rows back; the server checks them again and saves only the valid one.
  const before = f.store.list('materials').length;
  response = await f.request('/api/material-import/commit', 'POST', { rows: preview.rows });
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { committed: 1, skipped: 0, failed: 3, linked: 0 });
  assert.equal(f.store.list('materials').length, before + 1);
  const imported = f.store.list('materials').find(item => item.materialNo === 'IMP-PIPE-1')!;
  assert.deepEqual([imported.componentCode, imported.materialGroup, imported.uom, imported.uomId, imported.lbs], ['1', 'PIPE CS', 'M', 'uom-M', 'SCH 40']);
  // Editing the existing Material No on the page makes that row importable; a skipped row is left out.
  const edited = preview.rows.map(item => item.rowNo === 4 ? { ...item, values: { ...item.values, materialNo: 'IMP-RENAMED' } } : item.rowNo === 3 ? { ...item, action: 'skip' } : item);
  const checked = await (await f.request('/api/material-import/check', 'POST', { rows: edited })).json() as PreviewBody;
  // Row 2 (IMP-PIPE-1) is in the database now; row 3 keeps its UOM error; the edited row 4 is clean; row 5 repeats row 2.
  assert.deepEqual(checked.rows.map(item => Object.keys(item.warning).length + Object.keys(item.error).length), [1, 1, 0, 1]);
  response = await f.request('/api/material-import/commit', 'POST', { rows: edited });
  assert.equal(((await response.json()) as { committed: number; skipped: number }).committed, 1);
  assert.ok(f.store.list('materials').some(item => item.materialNo === 'IMP-RENAMED'));
  assert.equal((await f.request('/api/material-import/commit', 'POST', { rows: [{ rowNo: 2, values: { surprise: 'x' } }] })).status, 422);
  assert.equal((await f.request('/api/material-import/commit', 'POST', { rows: preview.rows, options: { clean: true } })).status, 422, 'Clean import comes with the per-site materials');
  // The template holds the reference headings in order and our example rows.
  response = await f.request('/api/material-import/template');
  assert.equal(response.status, 200);
  const template = new ExcelJS.Workbook(); await template.xlsx.load(await response.arrayBuffer());
  assert.deepEqual((template.worksheets[0].getRow(1).values as unknown[]).slice(1), MATERIAL_IMPORT_COLUMNS.map(column => column.header));
  assert.ok(template.worksheets[0].rowCount >= 6);
  // A read-only account and the other profiles have no import.
  await f.signIn('Material reader', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/material-import/preview', 'POST', await workbook(headings, [['1', 'G', '', 'RO-1', '', '', '', 'EA']]))).status, 403);
  const full = await hostedFixture(t, 'full'); await full.setup();
  assert.equal((await full.request('/api/material-import/template')).status, 404);
});

test('Take over missing materials: custom isometric lines of the site fill the preview and commit links them to the new catalog rows', async t => {
  const f = await hostedFixture(t); await f.setup();
  const iso = f.store.get('isometrics', 'iso-1'), siteId = String(f.store.get('projects', iso.projectId).siteId);
  const line = runAction(f.store, 'add-iso-material', { isoId: iso.id, source: 'Custom', materialNo: 'CUS-TAKE-1', description: 'Site-measured pipe', materialGroup: 'Pipe', uom: 'M', quantity: 4, componentCode: '1' }, actor);
  assert.ok('record' in line && line.record);
  const counts = await (await f.request(`/api/material-import/take-over?siteId=${siteId}`)).json() as { iso: number; order: number };
  assert.ok(counts.iso >= 1 && counts.order >= 1, JSON.stringify(counts));
  const preview = await (await f.request('/api/material-import/take-over', 'POST', { siteId, source: 'iso' })).json() as PreviewBody;
  const row = preview.rows.find(item => item.values.materialNo === 'CUS-TAKE-1')!;
  assert.deepEqual([row.source, row.origin, row.values.uom, row.values.componentCode, Object.keys(row.error)], ['iso', 'CUS-TAKE-1', 'M', '1', []]);
  const response = await f.request('/api/material-import/commit', 'POST', { siteId, rows: [row] });
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { committed: 1, skipped: 0, failed: 0, linked: 1 });
  const material = f.store.list('materials').find(item => item.materialNo === 'CUS-TAKE-1')!;
  const linked = f.store.get('iso_materials', line.record.id);
  assert.deepEqual([linked.materialId, linked.customMaterial, linked.quantity], [material.id, false, 4]);
  const after = await (await f.request(`/api/material-import/take-over?siteId=${siteId}`)).json() as { iso: number };
  assert.equal(after.iso, counts.iso - 1);
  assert.equal((await f.request('/api/material-import/take-over', 'POST', { siteId, source: 'elsewhere' })).status, 422);
});

test('Mass edit sets every filled field at once, keeps the empty ones and never changes Material No', async t => {
  const f = await hostedFixture(t); await f.setup();
  const [a, b] = ['material-1', 'material-2'].map(id => f.store.get('materials', id));
  const versions = () => Object.fromEntries([a, b].map(item => [item.id, f.store.get('materials', item.id)._version]));
  let response = await f.request('/api/bulk/materials', 'POST', { ids: [a.id, b.id], changes: { materialGroup: 'X GROUP', articleNo: 'ART-X', dia: '', uomId: 'uom-SET', partId: 'part-2', description: 'Mass edited' }, versions: versions() });
  assert.equal(response.status, 200, await response.clone().text());
  for (const item of [a, b]) {
    const now = f.store.get('materials', item.id);
    assert.deepEqual([now.materialGroup, now.articleNo, now.dia, now.uom, now.uomId, now.partId, now.description, now.materialNo], ['X GROUP', 'ART-X', item.dia, 'SET', 'uom-SET', 'part-2', 'Mass edited', item.materialNo]);
  }
  response = await f.request('/api/bulk/materials', 'POST', { ids: [a.id, b.id], changes: { materialNo: 'SAME' }, versions: versions() });
  assert.equal(response.status, 422);
  response = await f.request('/api/bulk/materials', 'POST', { ids: [a.id], changes: { dia: '' }, versions: versions() });
  assert.equal(response.status, 422, 'nothing filled');
  response = await f.request('/api/bulk/materials', 'POST', { ids: [a.id], changes: { uomId: 'nope' }, versions: versions() });
  assert.equal(response.status, 422);
});

test('Add material: only the group and Material No are needed, UOM defaults to EA and must be a UOMs record', async t => {
  const f = await hostedFixture(t); await f.setup();
  let response = await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve', materialNo: 'ADD-1' });
  assert.equal(response.status, 201, await response.clone().text());
  const added = (await body(response)).record!;
  assert.deepEqual([added.uom, added.uomId, added.description], ['EA', 'uom-EA', '']);
  response = await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve', materialNo: 'ADD-2', uom: 'XX' });
  assert.equal(response.status, 422); assert.ok((await body(response)).fields?.uom);
  response = await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve', materialNo: 'ADD-3', uomId: 'uom-M' });
  assert.equal((await body(response)).record?.uom, 'M');
  assert.equal((await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve' })).status, 422, 'Material No stays required');
  // Materials saved with a code only are read with the UOM record of that code.
  const rows = (await body(await f.request('/api/records/materials'))).rows as unknown as Row[];
  assert.equal(rows.find(item => item.id === 'material-1')?.uomId, `uom-${f.store.get('materials', 'material-1').uom}`);
  // Other profiles keep the free code and the required description.
  const full = await hostedFixture(t, 'full'); await full.setup();
  assert.equal((await full.request('/api/records/materials', 'POST', { materialNo: 'FREE-1', uom: 'XX' })).status, 422, 'description still required');
  assert.equal((await full.request('/api/records/materials', 'POST', { materialNo: 'FREE-1', uom: 'XX', description: 'Free code' })).status, 201);
});

test('Delete material removes an unused material from the database (archived underneath) and refuses one an isometric uses', async t => {
  const f = await hostedFixture(t); await f.setup();
  const used = f.store.get('materials', 'material-1');
  assert.ok(f.store.list('iso_materials').some(line => line.materialId === used.id));
  let response = await f.request(`/api/materials/${used.id}/delete`, 'POST', { _version: used._version });
  assert.equal(response.status, 422); assert.match(String((await response.json() as { error?: string }).error ?? ''), /used by isometric materials/);
  const fresh = (await body(await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve', materialNo: 'DEL-1' }))).record!;
  assert.equal((await f.request(`/api/materials/${fresh.id}/delete`, 'POST', { _version: fresh._version + 1 })).status, 409, 'a stale version');
  response = await f.request(`/api/materials/${fresh.id}/delete`, 'POST', { _version: fresh._version });
  assert.equal(response.status, 200);
  assert.equal(f.store.list('materials').some(item => item.id === fresh.id), false, 'no longer in the material database');
  assert.equal(f.store.get('materials', fresh.id, true)._archived, true, 'the record is still archived underneath');
  assert.equal(f.store.history('materials', fresh.id).events[0].action, 'archived');
  const listed = (await body(await f.request('/api/records/materials'))).rows as unknown as Row[];
  assert.equal(listed.some(item => item.id === fresh.id), false, 'the list does not show it');
  assert.equal((await f.request(`/api/materials/${fresh.id}/delete`, 'POST', { _version: f.store.get('materials', fresh.id, true)._version })).status, 404, 'a second delete does not restore it');
  const reused = await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve', materialNo: 'DEL-1' });
  assert.equal(reused.status, 201, 'a new material may take the Material No of the deleted one');
  await f.signIn('Material reader 2', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  const other = f.store.create('materials', { materialGroup: 'Valve', materialNo: 'DEL-2', description: 'x' });
  assert.equal((await f.request(`/api/materials/${other.id}/delete`, 'POST', { _version: other._version })).status, 403);
});

test('materials follow a UOM rename, and a UOM in use cannot be deleted', async t => {
  const f = await hostedFixture(t); await f.setup();
  const created = (await body(await f.request('/api/records/materials', 'POST', { materialGroup: 'Valve', materialNo: 'UOM-1' }))).record!;
  const older = f.store.list('materials').find(item => item.uom === 'EA' && !item.uomId)!;
  assert.ok(older, 'a sample material saved with the code only');
  const ea = f.store.get('uoms', 'uom-EA');
  const refused = await f.request(`/api/records/uoms/${ea.id}/archive`, 'POST', { _version: ea._version });
  assert.equal(refused.status, 422); assert.match(String((await refused.json() as { error?: string }).error), /used by materials/);
  const response = await f.request(`/api/records/uoms/${ea.id}`, 'PUT', { name: 'EACH', _version: ea._version });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual([f.store.get('materials', created.id).uom, f.store.get('materials', older.id).uom, f.store.get('materials', older.id).uomId], ['EACH', 'EACH', 'uom-EA']);
  const listed = (await body(await f.request('/api/records/materials'))).rows as unknown as Row[];
  assert.equal(listed.find(item => item.id === created.id)?.uom, 'EACH');
  const unused = (await body(await f.request('/api/records/uoms', 'POST', { name: 'RL' }))).record!;
  assert.equal((await f.request(`/api/records/uoms/${unused.id}/archive`, 'POST', { _version: unused._version })).status, 200);
});

test('an operation phase gets the next ID on create; the ID cannot be typed and the earlier typed number shows as the ID', async t => {
  const f = await hostedFixture(t); await f.setup();
  const phases = projectResource(hosted, RESOURCE_MAP.operation_phases);
  assert.deepEqual([phases.columns, hosted.resources.operation_phases.includes('sort'), hosted.resources.operation_phases.includes('description')], [['number', 'name'], false, false]);
  const first = (await body(await f.request('/api/records/operation_phases', 'POST', { name: 'Bernecker' }))).record!;
  const second = (await body(await f.request('/api/records/operation_phases', 'POST', { name: 'Paint shop', number: 1 }))).record!;
  assert.deepEqual([first.number, second.number], [7, 8], 'one above the six sample phases; a sent number is ignored');
  assert.equal((await f.request('/api/records/operation_phases', 'POST', { name: 'Typed', sort: 3 })).status, 404);
  assert.equal((await f.request(`/api/records/operation_phases/${second.id}/archive`, 'POST', { _version: second._version })).status, 200);
  const third = (await body(await f.request('/api/records/operation_phases', 'POST', { name: 'Coating' }))).record!;
  assert.equal(third.number, 9, 'a deleted phase keeps its number');
  const updated = (await body(await f.request(`/api/records/operation_phases/${first.id}`, 'PUT', { name: 'Bernecker yard', _version: first._version }))).record!;
  assert.equal(updated.number, 7);
  const listed = (await body(await f.request('/api/records/operation_phases'))).rows as unknown as Row[];
  assert.equal(listed.find(item => item.id === 'phase-0')?.number, 1);
});
