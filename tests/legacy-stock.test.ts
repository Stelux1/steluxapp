import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { runHostedPreparation, type PreparationParts } from '../server/hosted-preparation.ts';
import type { PrepareResult } from '../server/hosted-schema.ts';
import { hostedDataSteps } from '../server/hosted-data-steps.ts';
import { RESOURCES } from '../shared/resources.ts';
import { requirementExecution } from '../shared/materials.ts';
import { freePool, isoStatuses, poolKey } from '../shared/mto-logistics.ts';
import { conservedTotals, countedSiteId, countedStock, inventoryRows, legacyInventorySiteId, materialsList, storehouseRows } from '../shared/mto-stock.ts';
import type { Row } from '../shared/types.ts';

/**
 * Stock of the old model after the hosted upgrade (shared/mto-stock.ts, "Stock of the old model"): before the two location
 * kinds a storehouse belonged to one main project and its isometrics counted its stock. The upgrade only inserts, so those
 * rows keep no `locationKind`; they are read as inventory of their storehouse's main project.
 */
const actor = { id: 'legacy-test', name: 'Legacy stock test' };
const day = '2026-11-16';
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
const NORTH = 'site-north', RIVER = 'site-river';

/**
 * A workspace as the old model wrote it: the Main warehouse belongs to site-north, Field stores to site-river, the yard
 * store to no main project; stock rows without `locationKind`; an untaken pick list of the old rule (it names its
 * storehouse and charge) for iso-1; the orders of the sample data stay open. Written with plain SQL, as stored data.
 */
function oldWorkspace(t: { after: (fn: () => void) => void }) {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  store.db.exec('DELETE FROM transfer_order_items; DELETE FROM transfer_orders; DELETE FROM reservations; DELETE FROM picklists; DELETE FROM stock; DELETE FROM movements');
  const json = (id: string, table: string, data: Record<string, unknown>, at: string) => store.db.prepare(`INSERT INTO "${table}"(id,data,created_at,updated_at) VALUES (?,?,?,?)`).run(id, JSON.stringify(data), at, at);
  for (const [id, siteId] of [['warehouse-main', NORTH], ['warehouse-field', RIVER]]) {
    const row = store.get('warehouses', id); const { id: _id, _version, _archived, _createdAt, _updatedAt, ...data } = row;
    store.db.prepare('UPDATE warehouses SET data=? WHERE id=?').run(JSON.stringify({ ...data, siteId }), id);
  }
  const stock: [string, string, string, string, number, string][] = [
    // id, storehouse, material, charge, quantity, written
    ['old-n-1a', 'warehouse-main', 'material-1', 'H-1001', 10, '2025-03-01T08:00:00.000Z'],
    ['old-n-1b', 'warehouse-main', 'material-1', 'H-1002', 5, '2025-04-01T08:00:00.000Z'],
    ['old-n-3', 'warehouse-main', 'material-3', 'H-1001', 6, '2025-03-01T08:00:00.000Z'],
    ['old-n-5', 'warehouse-main', 'material-5', 'H-1001', 40, '2025-03-01T08:00:00.000Z'],
    ['old-r-1', 'warehouse-field', 'material-1', 'H-1003', 20, '2025-03-01T08:00:00.000Z'],
    ['old-r-3', 'warehouse-field', 'material-3', 'H-1001', 50, '2025-03-01T08:00:00.000Z'],
    ['old-r-5', 'warehouse-field', 'material-5', 'H-1001', 6, '2025-03-01T08:00:00.000Z'],
    ['old-y-5', 'warehouse-yard', 'material-5', 'H-1001', 100, '2025-03-01T08:00:00.000Z'],
  ];
  for (const [id, warehouseId, materialId, chargeNo, quantity, at] of stock) json(id, 'stock', { materialId, warehouseId, chargeNo, quantity }, at);
  const claimFor = store.list('iso_materials').find(row => row.isoId === 'iso-1' && row.materialId === 'material-1')!;
  json('old-pick-1', 'picklists', { number: 'PICK-OLD-1', isoId: 'iso-1', warehouseId: 'warehouse-main', materialId: 'material-1', requirementId: claimFor.id, quantity: 3, date: '2025-05-01', chargeNo: 'H-1002', taken: false }, '2025-05-01T08:00:00.000Z');
  return store;
}
const snapshot = (store: Store) => new Map(RESOURCES.map(resource => [resource.key, new Map((store.db.prepare(`SELECT id, data, version, archived, created_at, updated_at FROM "${resource.key}"`).all() as { id: string }[]).map(row => [row.id, { ...row }]))]));
function prepare(store: Store) {
  const parts: PreparationParts = {
    schemaUpToDate: () => true,
    prepareSchema: ({ dryRun }) => ({ dryRun, upToDate: true, created: { tables: [], columns: [], foreignKeys: [], indexes: [], rowLevelSecurity: [] }, columns: [], counts: {}, recordsPreserved: true } as unknown as PrepareResult),
    dataSteps: hostedDataSteps(() => store), backup: () => 'backup',
  };
  return runHostedPreparation(parts, false);
}
const percent = (store: Store, isoId: string) => isoStatuses(rowsOf(store), { isoId }).get(isoId)?.percent ?? null;
const inv = (store: Store, isoId: string, materialId: string) => requirementExecution(rowsOf(store), { isoId }).find(entry => entry.requirement.materialId === materialId)!.inventory;
const pool = (store: Store, siteId: string, materialId: string) => freePool(rowsOf(store)).get(poolKey(siteId, `catalog:${materialId}`)) ?? { stock: 0, reserved: 0, claimed: 0, free: 0 };
const quantity = (store: Store, id: string) => Number(store.get('stock', id).quantity);

test('old-model stock counts for its storehouse\'s main project only, after a preparation that changes no stored row', t => {
  const store = oldWorkspace(t);
  const before = snapshot(store);
  prepare(store);
  const after = snapshot(store);
  for (const [key, rows] of before) for (const [id, stored] of rows) assert.deepEqual(after.get(key)!.get(id), stored, `${key} ${id} is unchanged`);
  assert.equal(store.get('stock', 'old-n-1a').locationKind, undefined, 'the row still has no location kind');
  const rows = rowsOf(store);
  assert.deepEqual(['old-n-1a', 'old-r-1', 'old-y-5'].map(id => legacyInventorySiteId(rows, store.get('stock', id))), [NORTH, RIVER, '']);

  // iso-3 (site-north) needs 12 of material-3: north's old row gives 6, river's 50 do not count → floor(6 / 12 × 100) = 50 %.
  assert.equal(inv(store, 'iso-3', 'material-3'), 6); assert.equal(percent(store, 'iso-3'), 50);
  // iso-5 (site-river) needs 12 of material-5: river's 6 count; north's 40 and the yard's 100 (no main project) do not → 50 %.
  assert.equal(inv(store, 'iso-5', 'material-5'), 6); assert.equal(percent(store, 'iso-5'), 50);
  // material-1 in the north: 10 + 5 on hand, 3 claimed by the old pick list of iso-1 → Inv. 12; iso-9 needs 12 → 100 %.
  assert.deepEqual(pool(store, NORTH, 'material-1'), { stock: 15, reserved: 0, claimed: 3, free: 12 });
  assert.equal(inv(store, 'iso-9', 'material-1'), 12); assert.equal(percent(store, 'iso-9'), 100);
  assert.deepEqual(pool(store, RIVER, 'material-1'), { stock: 20, reserved: 0, claimed: 0, free: 20 });
  // The Materials list (Inv.) reads the same rule.
  assert.equal(materialsList(rows, { isoId: 'iso-3' })[0].values.inventory, 6);
  // The rows stay listed where they are: storehouse lines, not rows of the Material inventory page.
  assert.ok(storehouseRows(rows, { warehouseId: 'warehouse-main', onlyWithQuantity: false }).some(entry => entry.stock.id === 'old-n-1a'));
  assert.equal(inventoryRows(rows, { siteId: NORTH, onlyWithQuantity: false }).some(row => row.lines.some(line => line.id === 'old-n-1a')), false);

  // A second derivation counts nothing twice: same figures, and every row counts for at most one main project.
  assert.deepEqual([...freePool(rowsOf(store))], [...freePool(rows)]);
  const total = rows.stock.reduce((sum, row) => sum + Number(row.quantity), 0);
  const counted = [...freePool(rows).values()].reduce((sum, value) => sum + value.stock, 0);
  const uncounted = rows.stock.filter(row => !countedSiteId(rows, row)).reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal(counted + uncounted, total); assert.equal(uncounted, 100, 'only the yard store, which names no main project');
  // A second preparation adds nothing.
  const settled = snapshot(store); prepare(store); assert.deepEqual(snapshot(store), settled);
});

test('Start takes old-model stock of its own main project, charge by charge, leaving what an old pick list claims; Undo puts it back', t => {
  const store = oldWorkspace(t); prepare(store);
  const started = runAction(store, 'start-iso', { isoId: 'iso-9', date: day }, actor);
  const reportNo = String(started.records![0].reportNo);
  // 12 needed: H-1001 gives its 10, H-1002 gives 2 and keeps the 3 the old pick list of iso-1 claims; river's row is untouched.
  assert.deepEqual([quantity(store, 'old-n-1a'), quantity(store, 'old-n-1b'), quantity(store, 'old-r-1')], [0, 3, 20]);
  assert.deepEqual(store.list('movements').filter(move => move.pickListNo === reportNo).map(move => [move.warehouseId, move.siteId, move.chargeNo, move.quantity]).sort(),
    [['warehouse-main', NORTH, 'H-1001', -10], ['warehouse-main', NORTH, 'H-1002', -2]]);
  assert.equal(percent(store, 'iso-9'), 100, 'picked now');
  const rows = rowsOf(store);
  assert.equal(countedSiteId(rows, store.get('stock', 'old-n-1b')), NORTH, 'what is left still counts for site-north');
  assert.deepEqual(pool(store, NORTH, 'material-1'), { stock: 3, reserved: 0, claimed: 3, free: 0 });
  // The old pick list can still be taken from its own line.
  const taken = runAction(store, 'take-picklist', { reportNo: 'PICK-OLD-1', date: day }, actor);
  assert.equal(taken.records!.length, 1); assert.equal(quantity(store, 'old-n-1b'), 0);

  // Undo execution of the Start gives each charge back to the line it came from, still counted for site-north.
  runAction(store, 'undo-iso-execution', { reportNo }, actor);
  assert.deepEqual([quantity(store, 'old-n-1a'), quantity(store, 'old-n-1b')], [10, 2]);
  assert.deepEqual(countedStock(rowsOf(store), NORTH, 'catalog:material-1').map(entry => [entry.row.id, entry.free]), [['old-n-1a', 10], ['old-n-1b', 2]]);
});

test('a transfer of part of an old-model row to another main project moves exactly that quantity; totals are conserved', t => {
  const store = oldWorkspace(t); prepare(store);
  const totals = conservedTotals(rowsOf(store));
  runAction(store, 'stock-to-project', { siteId: RIVER, items: [{ stockId: 'old-n-3', quantity: 2 }], date: day }, actor);
  assert.equal(quantity(store, 'old-n-3'), 4);
  assert.deepEqual([pool(store, NORTH, 'material-3').stock, pool(store, RIVER, 'material-3').stock], [4, 52], 'north 6 − 2, river 50 + 2');
  assert.equal(inv(store, 'iso-3', 'material-3'), 4); assert.equal(percent(store, 'iso-3'), 33);
  assert.deepEqual(conservedTotals(rowsOf(store)), totals);
  // Material moved INTO an old-model row makes it an ordinary storehouse line: moved-in stock never becomes a main project's inventory.
  runAction(store, 'stock-move', { stockId: 'old-y-5', toWarehouseId: 'warehouse-main', quantity: 10, date: day }, actor);
  assert.equal(store.get('stock', 'old-n-5').locationKind, 'storehouse'); assert.equal(quantity(store, 'old-n-5'), 50);
  assert.equal(pool(store, NORTH, 'material-5').stock, 0);
  assert.deepEqual(conservedTotals(rowsOf(store)), totals);
});

test('rows written after the upgrade always carry a location kind and are never derived', t => {
  const store = oldWorkspace(t); prepare(store);
  runAction(store, 'adjust-material', { materialId: 'material-7', warehouseId: 'warehouse-main', chargeNo: 'H-9001', quantity: 9, date: day, note: 'Found at the count' }, actor);
  const added = store.list('stock').find(row => row.materialId === 'material-7' && row.chargeNo === 'H-9001')!;
  assert.equal(added.locationKind, 'storehouse');
  assert.equal(countedSiteId(rowsOf(store), added), '');
});
