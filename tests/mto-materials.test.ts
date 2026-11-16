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
import { isoStatuses } from '../shared/mto-logistics.ts';
import type { Row } from '../shared/types.ts';

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
    isometrics: [row('iso-a', { projectId: 'p' }), row('iso-b', { projectId: 'p' })], projects: [row('p', { siteId: 'site-a' })],
    materials: [row('m1', { materialNo: 'M1' }), row('m2', { materialNo: 'M2' }), row('m3', { materialNo: 'M3' })], custom_materials: [] as Row[],
    iso_materials: [row('r1', { isoId: 'iso-a', materialId: 'm1', quantity: 10 }), row('r2', { isoId: 'iso-a', materialId: 'm2', quantity: 4 }), row('r3', { isoId: 'iso-a', materialId: 'm3', quantity: 6 }), row('r4', { isoId: 'iso-b', materialId: 'm1', quantity: 5 })],
    orders: [row('o1', { projectId: 'p', status: 'Pending' })],
    order_lines: [row('l1', { orderId: 'o1', materialId: 'm1', requirementId: 'r1', quantity: 10, received: 0 }), row('l2', { orderId: 'o1', materialId: 'm2', requirementId: 'r2', quantity: 2, received: 0 })],
    // The Material inventory of the isometrics' project site, and a storehouse line that no isometric counts.
    stock: [row('s1', { materialId: 'm1', locationKind: 'site', siteId: 'site-a', quantity: 3 }), row('s2', { materialId: 'm2', locationKind: 'site', siteId: 'site-a', quantity: 9 }), row('s3', { materialId: 'm1', warehouseId: 'w', quantity: 50 })],
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
  const full: Record<string, Row[]> = { ...data, stock: [row('s9', { materialId: 'm3', locationKind: 'site', siteId: 'site-a', quantity: 100 }), ...data.stock] };
  assert.deepEqual([materialStatus(data.isometrics[0], full).covered, materialStatus(data.isometrics[0], full).percent], [15, 75]);
  // 9 of 14 = 64.28 %: whole percent, rounded down.
  assert.equal(materialStatus(data.isometrics[0], { ...full, iso_materials: full.iso_materials.map(line => line.id === 'r3' ? { ...line, _archived: true } : line) }).percent, 64, 'an archived line no longer counts');
  const elsewhere: Record<string, Row[]> = { ...data, stock: [row('s9', { materialId: 'm3', locationKind: 'site', siteId: 'site-b', quantity: 100 }), row('s8', { materialId: 'm3', warehouseId: 'w', quantity: 100 }), ...data.stock] };
  assert.equal(materialStatus(data.isometrics[0], elsewhere).percent, 45, 'stock of another project site or of a storehouse does not count');
});

/**
 * The reference sandbox (project site Zandbak), re-typed from the captures: mto__iso__0001.txt:153-176 (status 49 %,
 * nine lines), mto__iso__00032.txt:160-162 (0 %), mto__iso__00022.txt:161-162 (Started, 100 %),
 * mto__order__material-inventory.txt:71-77 (the inventory), mto__projects__pick-list-archive.txt:70 (pick list 00001 of
 * 00022, not taken). In our model the stock stays on hand until the pick list is taken, so the inventory also holds the
 * 10 + 2 that pick list claims. A storehouse line of 7430052832 shows that storehouse stock is not counted.
 */
function sandboxRows() {
  const materials = ['8138265581', '1', '8138268881', '7662782601', '7636669711', '7633384771', '7430050581', '7430052832', '8138678259', '8138664911', '7436330731', 'P235GH']
    .map(materialNo => row(`m-${materialNo}`, { materialNo }));
  const line = (iso: string, materialNo: string, quantity: number, n: number) => row(`${iso}-${n}`, { isoId: iso, materialId: `m-${materialNo}`, quantity, _createdAt: `2025-11-0${n % 9 + 1}T00:00:00Z` });
  const iso0001 = [['8138265581', 2], ['1', 3], ['8138268881', 3], ['7662782601', 6], ['7636669711', 8], ['7633384771', 13], ['7430050581', 6], ['7430052832', 12], ['8138678259', 16]] as const;
  const iso00032 = [['8138664911', 16], ['8138268881', 16], ['7436330731', 16]] as const;
  const iso00022 = [['8138678259', 2], ['8138268881', 10]] as const;
  const onHand = [['1', 3], ['P235GH', 7], ['8138265581', 2], ['7662782601', 2], ['7636669711', 8], ['7633384771', 13], ['7430050581', 6], ['8138268881', 10], ['8138678259', 2]] as const;
  return {
    sites: [row('zandbak', { name: 'Zandbak' })], projects: [row('p-20240101', { siteId: 'zandbak' })],
    isometrics: ['0001', '00032', '00022', '0003', '0005'].map(isoNo => row(`iso-${isoNo}`, { isoNo, projectId: 'p-20240101' })),
    materials, custom_materials: [] as Row[], orders: [] as Row[], order_lines: [] as Row[], reservations: [] as Row[],
    iso_materials: [...iso0001.map(([no, q], i) => line('iso-0001', no, q, i)), ...iso00032.map(([no, q], i) => line('iso-00032', no, q, i)), ...iso00022.map(([no, q], i) => line('iso-00022', no, q, i))],
    stock: [...onHand.map(([no, q]) => row(`stock-${no}`, { materialId: `m-${no}`, locationKind: 'site', siteId: 'zandbak', quantity: q })), row('storehouse-line', { materialId: 'm-7430052832', warehouseId: 'magacin-belgija', quantity: 40 })],
    picklists: [row('pick-1', { reportNo: '00001', isoId: 'iso-00022', requirementId: 'iso-00022-0', materialId: 'm-8138678259', quantity: 2, taken: false }), row('pick-2', { reportNo: '00001', isoId: 'iso-00022', requirementId: 'iso-00022-1', materialId: 'm-8138268881', quantity: 10, taken: false })],
  } as Record<string, Row[]>;
}

test('Material status on the sandbox: 0001 = 49 %, 00032 = 0 %, 00022 = 100 %, one figure with the Isometric execution page', () => {
  const data = sandboxRows(), statuses = isoStatuses(data);
  const status = (isoNo: string) => materialStatus(data.isometrics.find(iso => iso.isoNo === isoNo)!, data);
  // 0001: Σ min(Qty., free stock) = 2 + 3 + 0 (10 claimed by 00022) + 2 + 8 + 13 + 6 + 0 (storehouse only) + 0 (2 claimed) = 34; 34 / 69 = 49.28 → 49.
  assert.deepEqual([status('0001').covered, status('0001').required, status('0001').percent], [34, 69, 49]);
  // 00032: no free stock for any of its three lines (the 10 of 8138268881 are claimed): 0 / 48.
  assert.deepEqual([status('00032').covered, status('00032').required, status('00032').percent], [0, 48, 0]);
  // 00022: started; its own untaken pick list (2 + 10) covers both lines: 12 / 12.
  assert.deepEqual([status('00022').covered, status('00022').required, status('00022').percent], [12, 12, 100]);
  assert.equal(status('0003').percent, null, 'an isometric without lines shows no figure');
  for (const iso of data.isometrics) assert.equal(materialStatus(iso, data).percent, statuses.get(iso.id)?.percent ?? null, `${iso.isoNo}: header = execution page`);
  // Inv. leaves out what any untaken pick list claims (00022 shows Inv. 0 on both rows), and never counts a storehouse.
  const inv = (isoId: string) => [...materialLineStatuses(data, isoId).values()].map(line => line.inventory);
  assert.deepEqual(inv('iso-0001'), [2, 3, 0, 2, 8, 13, 6, 0, 0]);
  assert.deepEqual(inv('iso-00022'), [0, 0]);
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
  response = await f.request('/api/bulk/materials', 'POST', { ids: [created.id, second.id], changes: { uom: 'KG', progressClass: 'Supports' }, versions: { [created.id]: created._version, [second.id]: second._version } });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); assert.equal((await body(response)).count, 2);
  assert.deepEqual([f.store.get('materials', created.id).uom, f.store.get('materials', second.id).progressClass], ['KG', 'Supports']);
  response = await f.request('/api/bulk/materials', 'POST', { ids: [created.id, second.id], changes: { materialGroup: '' }, versions: { [created.id]: created._version + 1, [second.id]: second._version + 1 } });
  assert.equal(response.status, 422); assert.equal(f.store.get('materials', created.id).materialGroup, 'Pipe');
  // UOMs and Operation Phases follow the reference fields.
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'RL' })).status, 201);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'RL' })).status, 409);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: '' })).status, 422);
  assert.equal((await f.request('/api/records/uoms', 'POST', { name: 'XX', symbol: 'x' })).status, 404, 'only the UOM field is delivered');
  response = await f.request('/api/records/operation_phases', 'POST', { name: 'Support WS', sort: 9, progressLocation: 'Shop' });
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
