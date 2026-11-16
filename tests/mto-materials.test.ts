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
  assert.deepEqual(lines.get('r1'), { requirementId: 'r1', required: 10, ordered: 10, isOrdered: true, inventory: 3, picked: 2, hasOrder: true, orderId: 'o1', orderNo: '' });
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
  const fresh = f.store.create('materials', { materialNo: 'FRESH-1', description: 'Nothing is ordered for this', materialGroup: 'Pipe', uom: 'EA' }, actor);
  response = await f.request('/api/actions/add-iso-material', 'POST', { isoId: 'iso-1', source: 'Catalog', materialGroup: 'Pipe', materialId: fresh.id, quantity: 1.5, phaseId: 'phase-0', revisionId: 'revision-iso-1' });
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
  const line = runAction(f.store, 'add-iso-material', { isoId: iso.id, source: 'Custom', materialNo: 'CUS-TAKE-1', description: 'Site-measured pipe', materialGroup: 'Pipe', uom: 'M', quantity: 4, componentCode: '1', phaseId: 'phase-0', revisionId: 'revision-iso-1' }, actor);
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

// ----- Materials panel of the isometric (wave 3: w3-mto-iso-materials) ---------------------------------------------------------

import { renderToStaticMarkup } from 'react-dom/server';
import { requirementExecution } from '../shared/materials.ts';
import {
  ADD_MATERIAL_DIALOG, ISO_IMPORT_COLUMNS, NO_REVISION_CHANGES, ORDERED_LINE_REFUSAL, SET_TYPE_DIALOG, chargeNumberOptions, formatMaterialStatus, inventoryLevel, inventoryTooltip, isoImportPreview,
  isoMaterialDeleteRefusal, listIsoMaterials, materialStatusByRevision, materialsOfGroup, orderDetails,
} from '../shared/mto-materials.ts';
import { commitIsoMaterialImport } from '../server/mto-materials.ts';
import { MaterialStatusSlot, statusCardParts } from '../client/iso-header.tsx';
import { pdfQuery, pdfEntries } from '../client/pdf-reports.tsx';

/** One isometric with a material ordered (order 00006, 10 of 10), stocked on site (4) and received in two parts. */
function orderedRows() {
  return {
    isometrics: [row('iso-a', { projectId: 'p', isoNo: 'ISO-A' })], projects: [row('p', { siteId: 'site-a' })], materials: [row('m1', { materialNo: '8138265581', description: 'BLT/N A320-L43', materialGroup: 'BOLTS A320-L43', uom: 'EA' }), row('m2', { materialNo: '7662782601', description: 'FLG PIPE', materialGroup: 'FITTING CS FLG', uom: 'EA' })], custom_materials: [] as Row[],
    iso_materials: [row('r1', { isoId: 'iso-a', materialId: 'm1', quantity: 10, phaseId: 'shop' }), row('r2', { isoId: 'iso-a', materialId: 'm2', quantity: 16, phaseId: 'field' })],
    operation_phases: [row('shop', { name: 'Shop', number: 1 }), row('field', { name: 'Field', number: 2 })],
    orders: [row('o1', { projectId: 'p', status: 'Partially received', number: '00006', date: '2024-03-20', supplierId: 's1' })],
    order_lines: [row('l1', { orderId: 'o1', materialId: 'm1', requirementId: 'r1', quantity: 10, received: 4 })],
    receipts: [row('rc1', { orderId: 'o1', lineId: 'l1', materialId: 'm1', quantity: 3, date: '2024-03-21', supplierId: 's1' }), row('rc2', { orderId: 'o1', lineId: 'l1', materialId: 'm1', quantity: 1, date: '2024-07-04', supplierId: 's1' })],
    stock: [row('s1', { materialId: 'm1', locationKind: 'site', siteId: 'site-a', quantity: 4 })], picklists: [] as Row[], material_quantity_changes: [] as Row[], revisions: [] as Row[],
  } as Record<string, Row[]>;
}

test('material status shows a whole percent (49.3 as 49) and the word Empty without lines', () => {
  assert.equal(formatMaterialStatus(49.3), '49%');
  assert.equal(formatMaterialStatus(100), '100%');
  assert.equal(formatMaterialStatus(0), '0%');
  assert.equal(formatMaterialStatus(null), 'Empty');
  const data: Record<string, Row[]> = { ...statusRows(), iso_materials: [row('q1', { isoId: 'iso-a', materialId: 'm1', quantity: 69 })], order_lines: [] as Row[], picklists: [] as Row[], stock: [row('s1', { materialId: 'm1', locationKind: 'site', siteId: 'site-a', quantity: 34 })] };
  assert.equal(materialStatus(data.isometrics[0], data).percent, 49, '34 of 69 is 49.27 %: whole percent');
  assert.equal(formatMaterialStatus(materialStatus(data.isometrics[0], data).percent), '49%');
  assert.equal(formatMaterialStatus(materialStatus(row('iso-empty'), data).percent), 'Empty');
  const markup = renderToStaticMarkup(MaterialStatusSlot({ percent: null, hydrotest: { inScope: false, completed: false } }));
  assert.ok(markup.includes('>Empty<'), markup);
});

test('the MTO Status card holds Hydrotest completed then Material status and none of the Weld Pilot extras', () => {
  assert.deepEqual(statusCardParts('mto'), { weldExtras: false });
  assert.deepEqual(statusCardParts('weld'), { weldExtras: true });
  assert.deepEqual(statusCardParts(undefined), { weldExtras: true }, 'outside the pilots nothing changes');
  const markup = renderToStaticMarkup(MaterialStatusSlot({ percent: 49, hydrotest: { inScope: true, completed: false } }));
  assert.ok(markup.indexOf('Hydrotest completed') >= 0 && markup.indexOf('Hydrotest completed') < markup.indexOf('Material status'), markup);
  assert.ok(markup.includes('>49%<'));
  for (const word of ['Blockers', 'Priority', 'Punch', 'Release']) assert.ok(!markup.includes(word), word);
});

test('the Inv. truck reads "Ord. 10 | Inv. 4" on an ordered line and "Need 16 | Have 0" on one without an order, and the Ord.? link names the order', () => {
  const data = orderedRows(), lines = materialLineStatuses(data, 'iso-a');
  const ordered = lines.get('r1')!, open = lines.get('r2')!;
  assert.equal(inventoryTooltip(ordered), 'Ord. 10 | Inv. 4');
  assert.equal(inventoryTooltip(open), 'Need 16 | Have 0');
  assert.deepEqual([ordered.hasOrder, ordered.orderId, ordered.orderNo], [true, 'o1', '00006']);
  assert.deepEqual([open.hasOrder, open.orderId], [false, '']);
  assert.deepEqual([inventoryLevel(ordered), inventoryLevel(open), inventoryLevel({ ...ordered, inventory: 10 })], ['orange', 'red', 'green']);
});

test('the stock detail of a line: order, dates, quantities and the receipts of that order, newest first', () => {
  const data = orderedRows(), ordered = orderDetails(data, 'r1')!, open = orderDetails(data, 'r2')!;
  assert.deepEqual([ordered.orderNo, ordered.orderDate, ordered.orderedOnIso, ordered.receivedInOrder, ordered.inventory, ordered.showOrderedInOrder], ['00006', '2024-03-20', 10, 4, 4, false]);
  assert.deepEqual(ordered.history.map(entry => [entry.date, entry.orderNo, entry.quantity, entry.action]), [['2024-07-04', '00006', 1, 'Receipt'], ['2024-03-21', '00006', 3, 'Receipt']]);
  assert.deepEqual([open.orderNo, open.orderedOnIso, open.orderedInOrder, open.history.length, open.showOrderedInOrder], ['-', 0, 0, 0, false]);
  assert.equal(orderDetails(data, 'nope'), undefined);
});

test('an ordered line cannot be deleted: the server refuses it and leaves it live, a line without an order is archived', t => {
  const s = fixture(t); s.hostedRules = true;
  const requirement = s.create('iso_materials', { isoId: 'iso-1', materialId: 'material-1', quantity: 5, phaseId: 'phase-0' }, actor, 'req-ordered');
  const plain = s.create('materials', { materialNo: 'NOORDER-1', description: 'Never ordered', materialGroup: 'Pipe', uom: 'EA' }, actor), free = s.create('iso_materials', { isoId: 'iso-1', materialId: plain.id, quantity: 2, phaseId: 'phase-0' }, actor);
  const order = s.create('orders', { number: 'T-1', projectId: s.get('isometrics', 'iso-1').projectId, status: 'Pending', date: '2026-11-01' }, actor);
  s.create('order_lines', { orderId: order.id, materialId: 'material-1', requirementId: requirement.id, isoId: 'iso-1', quantity: 5, received: 0 }, actor);
  assert.throws(() => runAction(s, 'archive-iso-materials', { requirementIds: [free.id, requirement.id] }, actor), (e: AppError) => e.status === 409 && e.message.includes(ORDERED_LINE_REFUSAL));
  assert.equal(s.get('iso_materials', requirement.id)._archived, false);
  assert.equal(s.get('iso_materials', free.id)._archived, false, 'nothing is archived when one line is refused');
  runAction(s, 'archive-iso-materials', { requirementIds: [free.id] }, actor);
  assert.equal(s.get('iso_materials', free.id, true)._archived, true);
  assert.equal(isoMaterialDeleteRefusal(materialLineStatuses(rows(s), 'iso-1').get(requirement.id)), ORDERED_LINE_REFUSAL);
  assert.equal(isoMaterialDeleteRefusal(undefined), '');
});

test('Add material from DB: Revision (while the isometric has revisions), Type and a quantity of 0.01 or more are required', t => {
  const s = fixture(t); s.hostedRules = true;
  const base = { isoId: 'iso-1', source: 'Catalog', materialId: 'material-1', quantity: 1, phaseId: 'phase-0', revisionId: 'revision-iso-1' };
  const refused = (data: Record<string, unknown>, field: string) => assert.throws(() => runAction(s, 'add-iso-material', { ...base, ...data }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.[field]), field);
  refused({ revisionId: '' }, 'revisionId');
  refused({ phaseId: '' }, 'phaseId');
  refused({ quantity: 0.001 }, 'quantity');
  assert.ok(runAction(s, 'add-iso-material', { ...base, quantity: 0.01 }, actor));
  assert.deepEqual(isoMaterialInputErrors({ source: 'Catalog', materialId: 'x', quantity: 1 }, { requireRevision: true, requirePhase: true }), { revisionId: 'Choose the revision.', phaseId: 'Choose the type.' });
  assert.equal(isoMaterialInputErrors({ source: 'Catalog', materialId: 'x', quantity: 0.001 }, { minQuantity: 0.01 }).quantity, 'The quantity must be at least 0.01.');
  // Another profile keeps accepting a line without a revision or a type.
  const other = fixture(t);
  assert.ok(runAction(other, 'add-iso-material', { isoId: 'iso-1', source: 'Catalog', materialId: 'material-1', quantity: 0.5 }, actor));
});

test('Add custom material: UOM starts at EA, a revision is required, and Auto fill narrows the charge numbers by the Material No', t => {
  const s = fixture(t); s.hostedRules = true;
  const custom = { isoId: 'iso-1', source: 'Custom', materialNo: 'CUS-EA-1', description: 'Custom bracket', materialGroup: 'Support', quantity: 2, phaseId: 'phase-0', revisionId: 'revision-iso-1' };
  const added = runAction(s, 'add-iso-material', custom, actor);
  assert.ok('record' in added && added.record);
  assert.equal(s.get('custom_materials', String(added.record!.customMaterialId)).uom, 'EA');
  assert.throws(() => runAction(s, 'add-iso-material', { ...custom, materialNo: 'CUS-EA-2', revisionId: '' }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.revisionId));
  assert.deepEqual(chargeNumberOptions(['11111', '1212', '564321', '98784987', 'ada', '1212'], ''), ['11111', '1212', '564321', '98784987', 'ada']);
  assert.deepEqual(chargeNumberOptions(['11111', '1212', '564321', 'ADA-9'], '12'), ['1212']);
  assert.deepEqual(chargeNumberOptions(['11111', 'ADA-9'], 'ada'), ['ADA-9']);
  assert.deepEqual(chargeNumberOptions(['11111'], '8138265581'), [], 'no results');
  assert.deepEqual([ADD_MATERIAL_DIALOG.title, ADD_MATERIAL_DIALOG.submit, ADD_MATERIAL_DIALOG.quantityMin], ['Add material', 'Add', 0.01]);
});

test('the materials of a group come in database order as "<Material No> <description>", and Set type reads Type / Update', () => {
  const data = orderedRows(), list = [...data.materials, row('m3', { materialNo: '8138259941', description: 'BLT 2', materialGroup: 'BOLTS A320-L43' })];
  assert.deepEqual(materialsOfGroup(list, 'BOLTS A320-L43'), [{ id: 'm1', label: '8138265581 BLT/N A320-L43' }, { id: 'm3', label: '8138259941 BLT 2' }], 'database order, not by Material No');
  assert.deepEqual(materialsOfGroup(list, 'nothing'), []);
  assert.deepEqual([SET_TYPE_DIALOG.title, SET_TYPE_DIALOG.placeholder, SET_TYPE_DIALOG.submit], ['Set type', 'Type', 'Update']);
});

test('the Materials table is sorted by Picked ascending, filtered by Type and searched over its columns', () => {
  const data = orderedRows();
  data.iso_materials = [row('r1', { isoId: 'iso-a', materialId: 'm1', quantity: 10, phaseId: 'shop' }), row('r2', { isoId: 'iso-a', materialId: 'm2', quantity: 16, phaseId: 'field' }), row('r3', { isoId: 'iso-a', materialId: 'm1', quantity: 3, phaseId: 'shop' })];
  data.picklists = [row('k1', { isoId: 'iso-a', materialId: 'm1', requirementId: 'r1', quantity: 4 }), row('k2', { isoId: 'iso-a', materialId: 'm2', requirementId: 'r2', quantity: 1 })];
  const statuses = materialLineStatuses(data, 'iso-a');
  assert.deepEqual(listIsoMaterials(data.iso_materials, data, statuses, {}).map(line => [line.id, statuses.get(line.id)!.picked]), [['r3', 0], ['r2', 1], ['r1', 4]], 'Picked ascending first');
  assert.deepEqual(listIsoMaterials(data.iso_materials, data, statuses, { phaseId: 'shop' }).map(line => line.id), ['r3', 'r1']);
  assert.deepEqual(listIsoMaterials(data.iso_materials, data, statuses, { query: ' flg ' }).map(line => line.id), ['r2'], 'search over the description, any case');
  assert.deepEqual(listIsoMaterials(data.iso_materials, data, statuses, { query: '7662782601', phaseId: 'shop' }), []);
  assert.deepEqual(listIsoMaterials(data.iso_materials, data, statuses, { query: 'Field' }).map(line => line.id), ['r2'], 'the Type column is searched too');
});

test('Print passes the Type chosen on the panel to the MTO report', () => {
  const item = pdfEntries('mto', 'materials').find(entry => entry.key === 'mto-report')!;
  const query = pdfQuery(item, 'iso-1', { type: 'All', weldRecord: true, signature: false, phase: 'phase-3', projectId: '', siteId: '' });
  assert.equal(new URLSearchParams(query).get('phase'), 'phase-3');
});

test('Material status per revision: empty without revision-linked changes, else the removals per revision (newest first)', t => {
  const s = fixture(t); s.hostedRules = true;
  const empty = materialStatusByRevision(rows(s), 'iso-1');
  assert.deepEqual(empty, []); assert.equal(NO_REVISION_CHANGES, 'No revision-linked material changes yet.');
  const requirement = s.list('iso_materials').find(line => line.isoId === 'iso-1')!, revision = s.get('revisions', 'revision-iso-1');
  runAction(s, 'remove-material-quantity', { requirementId: requirement.id, revisionId: revision.id, quantity: 0.5 }, actor);
  const groups = materialStatusByRevision(rows(s), 'iso-1');
  assert.equal(groups.length, 1); assert.equal(groups[0].revisionId, revision.id);
  assert.deepEqual(groups[0].changes.map(change => [change.requirementId, change.removed]), [[requirement.id, 0.5]]);
  assert.deepEqual(materialStatusByRevision(rows(s), 'iso-2').filter(group => group.changes.some(change => change.requirementId === requirement.id)), [], 'another isometric is not touched');
});

test('the quantity changes in one place: the record route refuses a new quantity, the quantity log removes by revision without a date or a note', async t => {
  const f = await hostedFixture(t); await f.setup();
  const line = f.store.get('iso_materials', 'requirement-1');
  const refused = await f.request(`/api/records/iso_materials/${line.id}`, 'PUT', { quantity: Number(line.quantity) + 1, _version: line._version });
  assert.equal(refused.status, 422); assert.ok((await body(refused)).fields?.quantity);
  assert.equal(f.store.get('iso_materials', line.id).quantity, line.quantity);
  const removed = await f.request('/api/actions/remove-material-quantity', 'POST', { requirementId: line.id, revisionId: `revision-${line.isoId}`, quantity: 0.25, expectedVersion: line._version });
  assert.equal(removed.status, 201);
  const after = f.store.get('iso_materials', line.id);
  assert.equal(after.quantity, Number(line.quantity) - 0.25);
  const change = f.store.list('material_quantity_changes').find(entry => entry.requirementId === line.id)!;
  assert.equal(change.date, new Date().toISOString().slice(0, 10)); assert.equal(change.type, 'Revision removal');
});

test('Edit material changes Type, Component code, UOM and Charge number, writes the isometric audit trail and refuses the quantity', t => {
  const s = fixture(t); s.hostedRules = true;
  const custom = runAction(s, 'add-iso-material', { isoId: 'iso-1', source: 'Custom', materialNo: 'CUS-EDIT-1', description: 'Editable', materialGroup: 'Support', uom: 'EA', quantity: 3, phaseId: 'phase-0', revisionId: 'revision-iso-1' }, actor).record!;
  const uom = s.list('uoms').find(row => row.name !== 'EA')!;
  const done = runAction(s, 'edit-iso-material', { requirementId: custom.id, phaseId: 'phase-1', componentCode: '2', uom: String(uom.name), chargeNo: 'H-9001', expectedVersion: custom._version }, actor).record!;
  assert.deepEqual([done.phaseId, done.componentCode, done.progressClass, done.uom, done.chargeNo, done.quantity], ['phase-1', '2', 'Supports', uom.name, 'H-9001', 3]);
  assert.equal(s.get('custom_materials', String(done.customMaterialId)).uom, uom.name, 'the identity record carries the unit');
  assert.equal(done.customMaterialId, custom.customMaterialId, 'the line keeps its identity for orders and stock');
  const trail = s.activity(1000).filter(event => event.entityType === 'isometrics' && event.entityId === 'iso-1' && event.action === 'material edited');
  assert.ok(trail.length === 1 && trail[0].summary.includes('type') && trail[0].summary.includes('charge number'), JSON.stringify(trail));
  for (const field of ['quantity', 'materialNo', 'description', 'materialGroup']) assert.throws(() => runAction(s, 'edit-iso-material', { requirementId: custom.id, [field]: field === 'quantity' ? 99 : 'x' }, actor), (e: AppError) => e.status === 422 && Boolean(e.fields?.[field]), field);
  assert.throws(() => runAction(s, 'edit-iso-material', { requirementId: custom.id, componentCode: '9' }, actor), (e: AppError) => e.status === 422);
  assert.throws(() => runAction(s, 'edit-iso-material', { requirementId: custom.id, uom: 'NOPE' }, actor), (e: AppError) => e.status === 422);
  assert.equal(s.get('iso_materials', custom.id).quantity, 3);
});

test('Import in ISO: two rows become two lines of this isometric only, an unknown UOM or type is an error row', async t => {
  const s = fixture(t); s.hostedRules = true;
  const preview = isoImportPreview([
    { rowNo: 2, values: { materialNo: 'IMP-1', description: 'Imported pipe', materialGroup: 'Pipe', uom: 'M', quantity: '6' } },
    { rowNo: 3, values: { materialNo: 'IMP-2', description: 'Imported elbow', quantity: '2,5', componentCode: '1' } },
    { rowNo: 4, values: { materialNo: 'IMP-3', description: 'Bad unit', uom: 'ZZ', quantity: '1' } },
    { rowNo: 5, values: { materialNo: 'IMP-4', description: 'Bad type', phase: 'Nowhere', quantity: '1' } },
    { rowNo: 6, values: { materialNo: '', quantity: '0' } },
  ], Object.fromEntries(['materials', 'uoms', 'operation_phases'].map(key => [key, s.list(key)])));
  assert.deepEqual(preview.map(row => Object.keys(row.error).sort()), [[], [], ['uom'], ['phase'], ['materialNo', 'quantity']]);
  assert.equal(preview[1].uom, 'EA', 'UOM starts at EA'); assert.equal(preview[1].quantity, 2.5);
  assert.deepEqual(ISO_IMPORT_COLUMNS.map(column => column.header), ['CC', 'Group', 'Article No', 'Material No', 'Description', 'DIA', 'LBS/SCH', 'UOM', 'Qty', 'Operation phase', 'Spool']);
  const before = { x: s.list('iso_materials').filter(line => line.isoId === 'iso-1').length, other: s.list('iso_materials').filter(line => line.isoId !== 'iso-1').length };
  const result = commitIsoMaterialImport(s, 'iso-1', preview.map(row => ({ rowNo: row.rowNo, values: row.values })), actor);
  assert.deepEqual(result, { committed: 2, failed: 3 });
  const lines = s.list('iso_materials');
  assert.equal(lines.filter(line => line.isoId === 'iso-1').length, before.x + 2); assert.equal(lines.filter(line => line.isoId !== 'iso-1').length, before.other);
  const imported = lines.filter(line => line.materialNo === 'IMP-1')[0];
  assert.deepEqual([imported.quantity, imported.revisionId, imported.uom], [6, 'revision-iso-1', 'M']);
});

test('the iso material import is delivered to MTO writers only: template, preview and commit', async t => {
  const f = await hostedFixture(t);
  assert.equal((await f.request('/api/iso-material-import/template?isoId=iso-1')).status, 401);
  await f.setup();
  assert.equal((await f.request('/api/iso-material-import/template?isoId=iso-1')).status, 200);
  assert.equal((await f.request('/api/iso-material-import/template')).status, 422, 'an isometric is needed');
  const form = await workbook(['Material No', 'Description', 'Qty', 'UOM'], [['HTTP-IMP-1', 'Imported by file', '3', 'EA'], ['HTTP-IMP-2', 'Second line', '1', 'EA']]); form.set('isoId', 'iso-1');
  let response = await f.request('/api/iso-material-import/preview', 'POST', form);
  const preview = await response.json() as { rows: { rowNo: number; values: Record<string, string>; error: Record<string, string> }[]; summary: { valid: number } };
  assert.equal(response.status, 200); assert.equal(preview.rows.length, 2);
  response = await f.request('/api/iso-material-import/commit', 'POST', { isoId: 'iso-1', rows: preview.rows.map(row => ({ rowNo: row.rowNo, values: row.values })) });
  assert.equal(response.status, 201);
  assert.equal(f.store.list('iso_materials').filter(line => line.isoId === 'iso-1' && String(line.materialNo).startsWith('HTTP-IMP')).length, preview.summary.valid);
  f.usePilot('weld');
  assert.equal((await f.request('/api/iso-material-import/template?isoId=iso-1')).status, 403, 'the Weld pilot has no materials');
});

test('Ordered stays on its line when another line of the same material changes quantity (no order link: stable by line order and start quantity)', () => {
  const line = (id: string, quantity: number, n: number) => row(id, { isoId: 'iso-a', materialId: 'm1', quantity, _createdAt: `2026-01-01T00:00:0${n}Z` });
  const data: Record<string, Row[]> = {
    isometrics: [row('iso-a', { projectId: 'p' })], projects: [row('p', { siteId: 'site-a' })], materials: [row('m1', { materialNo: 'M1' })], custom_materials: [],
    iso_materials: [line('c', 4, 1), line('b', 30, 2), line('a', 40, 3)],
    orders: [row('o1', { projectId: 'p', status: 'Pending', number: '00001' })], order_lines: [row('l1', { orderId: 'o1', materialId: 'm1', quantity: 12, received: 0 })], stock: [], picklists: [], material_quantity_changes: [],
  };
  const orderedOf = (rowsOf: Record<string, Row[]>) => Object.fromEntries(requirementExecution(rowsOf).map(entry => [entry.requirement.id, entry.ordered]));
  assert.deepEqual(orderedOf(data), { c: 4, b: 8, a: 0 });
  // 2 of the 4 are removed by a revision: the quantity log keeps the start quantity.
  const changed: Record<string, Row[]> = { ...data, iso_materials: [line('c', 2, 1), line('b', 30, 2), line('a', 40, 3)], material_quantity_changes: [row('x1', { requirementId: 'c', sequence: 1, previousQuantity: 4, quantity: -2, newQuantity: 2 })] };
  assert.deepEqual(orderedOf(changed), { c: 4, b: 8, a: 0 }, 'only line c is touched; b keeps its 8');
});
