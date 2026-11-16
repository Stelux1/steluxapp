import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { ACTIONS } from '../shared/actions.ts';
import { canAction, canResource } from '../shared/permissions.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import { conservedTotals, inventoryLog, inventoryRows, materialsList, projectHoldings, stockDetails, validQuantity } from '../shared/mto-stock.ts';
import type { Row, User } from '../shared/types.ts';

const actor = { id: 'tester', name: 'Test engineer' };
const fixture = () => { const store = new Store(':memory:'); seed(store); return store; };
const all = (store: Store) => Object.fromEntries(['stock', 'movements', 'materials', 'custom_materials', 'warehouses', 'sites', 'projects', 'isometrics', 'iso_materials', 'orders', 'order_lines', 'picklists'].map(key => [key, store.list(key, true)]));
const line = (store: Store, warehouseId: string, materialId: string, chargeNo = 'H-1042') => store.list('stock').find(row => row.warehouseId === warehouseId && row.materialId === materialId && row.chargeNo === chargeNo)!;
const run = (store: Store, key: string, data: Record<string, unknown>) => runAction(store, key, { date: '2026-11-01', ...data }, actor);
const total = (store: Store) => conservedTotals(all(store));
const refused = (status: number, pattern: RegExp) => (error: unknown) => { assert.equal((error as { status: number }).status, status); assert.match((error as Error).message, pattern); return true; };

test('quantities must be at least 0.01 in steps of 0.01', () => {
  for (const value of [0.01, 0.5, 1, 12.34, 100]) assert.ok(validQuantity(value), String(value));
  for (const value of [0, -1, 0.001, 0.005, 1.005, NaN, Infinity, '1', null]) assert.equal(validQuantity(value), false, String(value));
});

test('transfer to a project is conserved: the storehouse loses exactly what the project holds, and a return restores it', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-4'), before = total(s), stockBefore = Number(main.quantity);
  run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 5.25 }], note: 'Steam header' });
  assert.equal(Number(s.get('stock', main.id).quantity), stockBefore - 5.25);
  assert.deepEqual(total(s), before, 'storehouse plus project totals are unchanged');
  const held = projectHoldings(all(s)).find(entry => entry.siteId === 'site-river' && entry.materialId === 'material-4')!;
  assert.equal(held.quantity, 5.25);
  assert.equal(s.list('movements').filter(m => m.type === 'Project transfer' && m.siteId === 'site-river').at(0)!.quantity, -5.25);
  run(s, 'stock-return', { stockId: main.id, siteId: 'site-river', quantity: 1.25 });
  assert.equal(Number(s.get('stock', main.id).quantity), stockBefore - 4);
  run(s, 'stock-return', { stockId: main.id, siteId: 'site-river', all: true });
  assert.equal(Number(s.get('stock', main.id).quantity), stockBefore);
  assert.equal(projectHoldings(all(s)).some(entry => entry.siteId === 'site-river' && entry.materialId === 'material-4'), false);
  assert.deepEqual(total(s), before);
});

test('stock never goes negative and a refused action leaves everything unchanged', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-3'), snapshot = JSON.stringify([s.list('stock'), s.list('movements', true)]);
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: main.id, quantity: Number(main.quantity) + 0.01 }] }), refused(409, /Insufficient stock/));
  // The second line fails after the first was applied: the whole transfer rolls back.
  const other = line(s, 'warehouse-main', 'material-1');
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: other.id, quantity: 1 }, { stockId: main.id, quantity: 999 }] }), refused(409, /Insufficient/));
  assert.throws(() => run(s, 'stock-move', { stockId: main.id, toWarehouseId: 'warehouse-field', quantity: 500 }), refused(409, /Insufficient/));
  assert.throws(() => run(s, 'stock-return', { stockId: main.id, siteId: 'site-river', quantity: 1 }), refused(409, /holds/), 'a project cannot return what it never received');
  assert.throws(() => run(s, 'stock-adjust', { stockId: main.id, quantity: -1, reasonText: 'Count' }), refused(422, /zero or more/));
  assert.equal(JSON.stringify([s.list('stock'), s.list('movements', true)]), snapshot);
});

test('transfer quantities are validated: at least 0.01, step 0.01, a target project and no duplicate lines', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-1');
  for (const quantity of [0, -2, 0.005, 1.234, '3', null]) assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: main.id, quantity }] }), refused(422, /at least 0.01/), String(quantity));
  assert.throws(() => run(s, 'stock-to-project', { items: [{ stockId: main.id, quantity: 1 }] }), /./);
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'missing', items: [{ stockId: main.id, quantity: 1 }] }), /could not be found/);
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [] }), refused(422, /at least one/));
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 1 }, { stockId: main.id, quantity: 1 }] }), refused(422, /only once/));
});

test('move to another storehouse takes a quantity or everything and keeps the charge and any corrected wording', () => {
  const s = fixture(), source = line(s, 'warehouse-main', 'material-5'), before = total(s), amount = Number(source.quantity);
  run(s, 'stock-correct', { stockId: source.id, materialGroup: 'Tee', articleNo: '', uom: 'EA', description: 'Corrected tee wording', dia: '4', lbs: 'SCH 10S', reason: 'Name correction', chargeNo: 'H-1042' });
  run(s, 'stock-move', { stockId: source.id, toWarehouseId: 'warehouse-field', quantity: 4 });
  const moved = line(s, 'warehouse-field', 'material-5');
  assert.equal(Number(moved.quantity), 4); assert.equal(moved.corrected, true); assert.equal(stockDetails(all(s), moved).description, 'Corrected tee wording');
  run(s, 'stock-move', { stockId: source.id, toWarehouseId: 'warehouse-field', all: true });
  assert.equal(Number(s.get('stock', source.id).quantity), 0); assert.equal(Number(line(s, 'warehouse-field', 'material-5').quantity), amount);
  assert.deepEqual(total(s), before);
  assert.throws(() => run(s, 'stock-move', { stockId: source.id, toWarehouseId: 'warehouse-field', all: true }), refused(422, /nothing to move/));
  assert.throws(() => run(s, 'stock-move', { stockId: moved.id, toWarehouseId: 'warehouse-field', quantity: 1 }), refused(422, /different storehouse/));
  const types = s.list('movements').filter(m => m.materialId === 'material-5').map(m => m.type);
  assert.ok(types.includes('Transfer out') && types.includes('Transfer in') && types.includes('Correction'));
});

test('correcting an entry needs a reason, logs what changed and never touches the quantity or the catalog', () => {
  const s = fixture(), target = line(s, 'warehouse-main', 'material-2'), catalog = JSON.stringify(s.get('materials', 'material-2'));
  const base = { stockId: target.id, materialGroup: 'Elbow 90', articleNo: 'ART-1002', uom: 'EA', description: 'Elbow 90°, long radius, butt weld', dia: '2', lbs: 'SCH 40', chargeNo: 'H-1042' };
  assert.throws(() => run(s, 'stock-correct', { ...base }), refused(422, /reason/));
  assert.throws(() => run(s, 'stock-correct', { ...base, reason: 'Other' }), refused(422, /Reason text is required/));
  assert.throws(() => run(s, 'stock-correct', { ...base, reason: 'Guess' }), refused(422, /reason/));
  assert.throws(() => run(s, 'stock-correct', { ...base, reason: 'Import error', description: 'x'.repeat(2001) }), refused(422, /too long/));
  assert.throws(() => run(s, 'stock-correct', { ...base, reason: 'Import error', materialGroup: 'g'.repeat(101) }), refused(422, /too long/));
  assert.throws(() => run(s, 'stock-correct', { ...base, reason: 'Import error', reasonText: 'r'.repeat(501) }), refused(422, /too long/));
  assert.throws(() => run(s, 'stock-correct', { ...base, reason: 'Import error', materialGroup: '' }), refused(422, /Material group is required/));
  const unchanged = stockDetails(all(s), target);
  assert.throws(() => run(s, 'stock-correct', { stockId: target.id, materialGroup: unchanged.group, articleNo: unchanged.articleNo, uom: unchanged.uom, description: unchanged.description, dia: unchanged.dia, lbs: unchanged.lbs, reason: 'Other', reasonText: 'No change', chargeNo: 'H-1042' }), refused(422, /at least one value/));
  const quantity = Number(target.quantity);
  run(s, 'stock-correct', { ...base, reason: 'Import error', reasonText: 'Imported from the supplier sheet with the wrong end type.' });
  const corrected = s.get('stock', target.id);
  assert.equal(corrected.corrected, true); assert.equal(Number(corrected.quantity), quantity); assert.equal(JSON.stringify(s.get('materials', 'material-2')), catalog);
  assert.equal(stockDetails(all(s), corrected).description, 'Elbow 90°, long radius, butt weld');
  const log = inventoryLog(all(s), corrected).find(move => move.type === 'Correction')!;
  assert.equal(log.reason, 'Import error'); assert.match(String(log.note), /Description/);
  assert.ok(s.activity(20).some(event => event.action === 'corrected' && event.entityId === target.id));
});

test('a correction cannot rename a charge onto an existing line of the same material', () => {
  const s = fixture(), a = line(s, 'warehouse-main', 'material-1');
  run(s, 'stock-add', { warehouseId: 'warehouse-main', materialId: 'material-1', chargeNo: 'H-9000', quantity: 3 });
  const base = { stockId: a.id, materialGroup: 'Pipe', articleNo: 'ART-1001', uom: 'M', description: 'Seamless carbon steel pipe', dia: '2', lbs: 'SCH 40', reason: 'Other', reasonText: 'Wrong heat number' };
  assert.throws(() => run(s, 'stock-correct', { ...base, chargeNo: 'H-9000' }), refused(409, /already holds/));
  run(s, 'stock-correct', { ...base, chargeNo: 'H-1042-R' });
  assert.equal(s.get('stock', a.id).chargeNo, 'H-1042-R');
});

test('adjusting the quantity records the difference with its reason; removing writes off the rest and archives the line', () => {
  const s = fixture(), target = line(s, 'warehouse-main', 'material-7'), start = Number(target.quantity);
  assert.throws(() => run(s, 'stock-adjust', { stockId: target.id, quantity: start - 3 }), refused(422, /Reason text is required/));
  assert.throws(() => run(s, 'stock-adjust', { stockId: target.id, quantity: start, reasonText: 'Same' }), refused(422, /equals/));
  run(s, 'stock-adjust', { stockId: target.id, quantity: start - 3, reasonText: 'Three elbows damaged in transport' });
  assert.equal(Number(s.get('stock', target.id).quantity), start - 3);
  const adjustment = s.list('movements').find(move => move.type === 'Adjustment' && move.reasonText === 'Three elbows damaged in transport')!;
  assert.equal(adjustment.quantity, -3);
  assert.throws(() => run(s, 'stock-remove', { stockId: target.id }), refused(422, /Reason text is required/));
  run(s, 'stock-remove', { stockId: target.id, reasonText: 'Imported by mistake' });
  assert.equal(s.get('stock', target.id, true)._archived, true);
  assert.equal(s.list('movements').find(move => move.type === 'Removal' && move.materialId === 'material-7')!.quantity, -(start - 3));
  assert.equal(inventoryRows(all(s), { warehouseId: 'warehouse-main', onlyWithQuantity: false }).some(entry => entry.stock.id === target.id), false);
  assert.ok(s.activity(30).some(event => event.action === 'removed'));
  // The same material can be added again afterwards.
  run(s, 'stock-add', { warehouseId: 'warehouse-main', materialId: 'material-7', chargeNo: 'H-1042', quantity: 2 });
  assert.equal(Number(line(s, 'warehouse-main', 'material-7').quantity), 2);
});

test('the inventory shows only lines with quantity unless all materials are requested', () => {
  const s = fixture(); const target = line(s, 'warehouse-main', 'material-3');
  run(s, 'stock-adjust', { stockId: target.id, quantity: 0, reasonText: 'Used up' });
  const only = inventoryRows(all(s), { warehouseId: 'warehouse-main', onlyWithQuantity: true }), everything = inventoryRows(all(s), { warehouseId: 'warehouse-main', onlyWithQuantity: false });
  assert.equal(only.some(entry => entry.stock.id === target.id), false); assert.equal(everything.some(entry => entry.stock.id === target.id), true);
  const found = inventoryRows(all(s), { warehouseId: 'warehouse-main', onlyWithQuantity: false, query: 'cs-f150' });
  assert.ok(found.length >= 1 && found.every(entry => entry.details.materialNo === 'CS-F150'));
  assert.ok(everything.every(entry => entry.stock.warehouseId === 'warehouse-main'));
});

test('add material from the database creates or increases a line and logs it', () => {
  const s = fixture(), before = s.list('stock').length;
  const created = run(s, 'stock-add', { warehouseId: 'warehouse-field', materialId: 'material-8', chargeNo: 'H-7001', quantity: 2.5 });
  assert.equal(s.list('stock').length, before + 1); assert.equal(Number('record' in created ? created.record!.quantity : 0), 2.5);
  run(s, 'stock-add', { warehouseId: 'warehouse-field', materialId: 'material-8', chargeNo: 'H-7001', quantity: 0.5 });
  assert.equal(Number(line(s, 'warehouse-field', 'material-8', 'H-7001').quantity), 3);
  assert.throws(() => run(s, 'stock-add', { warehouseId: 'warehouse-field', materialId: 'material-8', quantity: 0 }), refused(422, /at least 0.01/));
  assert.throws(() => run(s, 'stock-add', { warehouseId: 'warehouse-field', materialId: 'missing', quantity: 1 }), /could not be found/);
});

test('transfer orders: validation follows the type, items need a material number and a valid quantity', () => {
  const s = fixture(); const item = { materialNo: 'CS-P060', description: 'Seamless carbon steel pipe', quantity: 2, uom: 'M' };
  const create = (data: Record<string, unknown>) => run(s, 'transfer-order-create', { items: [item], ...data });
  assert.throws(() => create({ type: 'Somewhere', fromWarehouseId: 'warehouse-main', siteId: 'site-river' }), refused(422, /type/));
  assert.throws(() => create({ type: 'Storehouse → Project', priority: 'Soon', fromWarehouseId: 'warehouse-main', siteId: 'site-river' }), refused(422, /Normal or Urgent/));
  assert.throws(() => create({ type: 'Storehouse → Project', siteId: 'site-river' }), /./);
  assert.throws(() => create({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main' }), /./);
  assert.throws(() => create({ type: 'Storehouse → Storehouse', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-main' }), refused(422, /different storehouses/));
  assert.throws(() => create({ type: 'Return → Inventory', toWarehouseId: 'warehouse-main' }), /./);
  assert.throws(() => create({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [] }), refused(422, /at least one item/));
  assert.throws(() => create({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ ...item, materialNo: '' }] }), refused(422, /Material no\. is required/));
  for (const quantity of [0, 0.004, -1]) assert.throws(() => create({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ ...item, quantity }] }), refused(422, /at least 0.01/));
  assert.throws(() => create({ type: 'Inventory - Project', fromWarehouseId: 'warehouse-field', siteId: 'site-river', items: [{ ...item, stockId: line(s, 'warehouse-main', 'material-1').id }] }), refused(422, /not in the chosen storehouse/));
  const before = s.list('transfer_orders').length;
  const result = create({ type: 'Storehouse → Project', priority: 'Urgent', fromWarehouseId: 'warehouse-main', siteId: 'site-river', notes: 'Header spools' });
  const order = 'record' in result ? result.record! : null as never;
  assert.equal(s.list('transfer_orders').length, before + 1); assert.equal(order.status, 'Open'); assert.equal(order.priority, 'Urgent'); assert.match(String(order.number), /^TO-\d{4}-\d{4}$/);
  assert.equal(s.list('transfer_order_items').filter(i => i.orderId === order.id).length, 1);
  assert.equal(create({ type: 'Storehouse → Storehouse', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-field', siteId: 'site-river' }).resource, 'transfer_orders');
  assert.equal(s.list('transfer_orders').find(o => o.type === 'Storehouse → Storehouse' && o.notes === '')!.siteId, '', 'a storehouse move keeps no project');
});

test('completing a transfer order applies its movements; totals are conserved and the order cannot be completed twice', () => {
  const s = fixture(), before = total(s);
  const created = run(s, 'transfer-order-create', { type: 'Storehouse → Storehouse', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-field', items: [{ materialNo: 'CS-P060', quantity: 7.5, uom: 'M' }, { materialNo: 'cs-e090', quantity: 4, uom: 'EA' }] });
  const order = 'record' in created ? created.record! : null as never;
  const stockBefore = Number(line(s, 'warehouse-main', 'material-1').quantity);
  assert.equal(Number(line(s, 'warehouse-main', 'material-1').quantity), stockBefore, 'creating an order moves nothing');
  run(s, 'transfer-order-complete', { orderId: order.id });
  assert.equal(Number(line(s, 'warehouse-main', 'material-1').quantity), stockBefore - 7.5);
  assert.equal(Number(line(s, 'warehouse-field', 'material-1').quantity), 7.5);
  assert.equal(s.get('transfer_orders', order.id).status, 'Completed'); assert.ok(s.get('transfer_orders', order.id).completedDate);
  assert.deepEqual(total(s), before);
  assert.ok(s.list('movements').some(move => move.transferOrder === order.number && move.type === 'Transfer in'));
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: order.id }), refused(409, /already completed/));
  assert.throws(() => run(s, 'transfer-order-cancel', { orderId: order.id }), refused(409, /already completed/));
  assert.ok(s.activity(30).some(event => event.action === 'completed' && event.entityId === order.id));
});

test('an order that cannot be fully supplied stays open and moves nothing', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-3'); const onHand = s.list('stock').filter(row => row.warehouseId === 'warehouse-main' && row.materialId === 'material-3').reduce((sum, row) => sum + Number(row.quantity), 0);
  const created = run(s, 'transfer-order-create', { type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ materialNo: 'CS-P060', quantity: 1, uom: 'M' }, { materialNo: 'CS-F150', quantity: onHand + 1, uom: 'EA' }] });
  const order = 'record' in created ? created.record! : null as never;
  const snapshot = JSON.stringify([s.list('stock'), s.list('movements', true), s.get('transfer_orders', order.id)]);
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: order.id }), refused(409, /Not enough CS-F150/));
  assert.equal(JSON.stringify([s.list('stock'), s.list('movements', true), s.get('transfer_orders', order.id)]), snapshot);
  assert.equal(s.get('transfer_orders', order.id).status, 'Open');
  run(s, 'transfer-order-cancel', { orderId: order.id, note: 'Replaced by a purchase' });
  assert.equal(s.get('transfer_orders', order.id).status, 'Cancelled'); assert.match(String(s.get('transfer_orders', order.id).notes), /Replaced by a purchase/);
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: order.id }), refused(409, /already cancelled/));
});

test('an order built from inventory lines takes exactly those lines; a return order brings project material back', () => {
  const s = fixture(), before = total(s), pipe = line(s, 'warehouse-main', 'material-1');
  run(s, 'stock-add', { warehouseId: 'warehouse-main', materialId: 'material-1', chargeNo: 'H-1', quantity: 5 });
  const toProject = run(s, 'transfer-order-create', { type: 'Inventory - Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ stockId: pipe.id, materialNo: 'CS-P060', quantity: 6, uom: 'M' }] });
  run(s, 'transfer-order-complete', { orderId: ('record' in toProject ? toProject.record! : null as never).id });
  assert.equal(Number(s.get('stock', pipe.id).quantity), Number(pipe.quantity) - 6); assert.equal(Number(line(s, 'warehouse-main', 'material-1', 'H-1').quantity), 5, 'the other charge is untouched');
  const back = run(s, 'transfer-order-create', { type: 'Return → Inventory', siteId: 'site-river', toWarehouseId: 'warehouse-field', items: [{ materialNo: 'CS-P060', quantity: 4, uom: 'M' }] });
  run(s, 'transfer-order-complete', { orderId: ('record' in back ? back.record! : null as never).id });
  assert.equal(Number(line(s, 'warehouse-field', 'material-1').quantity), 4);
  assert.equal(projectHoldings(all(s)).find(entry => entry.siteId === 'site-river' && entry.materialId === 'material-1')!.quantity, 2);
  const tooMuch = run(s, 'transfer-order-create', { type: 'Return → Inventory', siteId: 'site-river', toWarehouseId: 'warehouse-field', items: [{ materialNo: 'CS-P060', quantity: 2.01, uom: 'M' }] });
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: ('record' in tooMuch ? tooMuch.record! : null as never).id }), refused(409, /too little/));
  assert.deepEqual(Object.fromEntries(Object.entries(total(s)).filter(([key]) => !key.endsWith('|H-1'))), Object.fromEntries(Object.entries(before)), 'only the added charge differs from the start');
});

test('the seed gives every screen realistic data: storehouses, a project holding, a corrected line and orders in each status', () => {
  const s = fixture();
  assert.deepEqual(s.list('warehouses').map(w => w.name).sort(), ['Field stores', 'Main warehouse', 'Prefab yard store']);
  assert.ok(s.list('warehouses').every(w => w.description));
  assert.deepEqual([...new Set(s.list('transfer_orders').map(o => o.status))].sort(), ['Completed', 'Open']);
  assert.ok(s.list('transfer_orders').some(o => o.priority === 'Urgent'));
  assert.ok(s.list('stock').some(row => row.corrected === true));
  assert.ok(projectHoldings(all(s)).length > 0);
  assert.ok(inventoryRows(all(s), { warehouseId: 'warehouse-yard', onlyWithQuantity: true }).length >= 3);
});

test('the materials list is computed live from requirements, orders, stock and picks', () => {
  const s = fixture(); let rows = materialsList(all(s), { siteId: 'site-north' });
  assert.ok(rows.length > 0);
  const entry = rows[0]; assert.deepEqual(Object.keys(entry.values), ['project', 'iso', 'chemicalClean', 'group', 'materialNo', 'description', 'quantity', 'ordered', 'inventory', 'picked']);
  const requirement = s.get('iso_materials', entry.id), material = s.get('materials', String(requirement.materialId));
  const stock = s.list('stock').filter(row => row.materialId === material.id).reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal(entry.values.inventory, stock);
  run(s, 'stock-adjust', { stockId: s.list('stock').find(row => row.materialId === material.id && Number(row.quantity) > 0)!.id, quantity: 1, reasonText: 'Count' });
  rows = materialsList(all(s), { siteId: 'site-north' });
  assert.equal(rows.find(row => row.id === entry.id)!.values.inventory, s.list('stock').filter(row => row.materialId === material.id).reduce((sum, row) => sum + Number(row.quantity), 0), 'a new stock figure shows at once, no cache');
  const river = materialsList(all(s), { siteId: 'site-river' });
  assert.ok(river.length > 0 && river.every(row => !rows.some(other => other.id === row.id)), 'each main project lists only its own materials');
  assert.equal(materialsList(all(s), { query: 'no-such-material' }).length, 0);
  assert.equal(materialsList(all(s), { projectId: 'project-cooling' }).every(row => row.values.project === 'STX-2401'), true);
});

test('an older database without the new columns and tables still opens and works', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-stock-')); const file = join(dir, 'old.sqlite');
  try {
    const old = new DatabaseSync(file);
    old.exec('CREATE TABLE "movements" (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    old.close();
    const store = new Store(file);
    const columns = (store.db.prepare('PRAGMA table_xinfo("movements")').all() as { name: string }[]).map(column => column.name);
    assert.ok(columns.includes('siteId'));
    assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('transfer_orders','transfer_order_items')").all().length === 2);
    store.create('sites', { name: 'Old site' }, SYSTEM, 'old-site');
    assert.equal(store.create('movements', { number: 'M1', type: 'Project transfer', quantity: -1, siteId: 'old-site' }, SYSTEM).siteId, 'old-site');
    store.close();
    const again = new Store(file); assert.equal(again.list('movements').length, 1); again.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the hosted profile delivers storehouses, inventory, transfer orders and the actions; other profiles are unchanged', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const key of ['warehouses', 'stock', 'transfer_orders']) assert.ok(hosted.navigation.includes(key), key);
  for (const key of ['movements', 'transfer_order_items']) assert.ok(hosted.resources[key] && !hosted.navigation.includes(key), `${key} is data only`);
  for (const key of Object.keys(ACTIONS).filter(key => key.startsWith('stock-') || key.startsWith('transfer-order-'))) assert.deepEqual(new Set(hosted.actions[key]), new Set(ACTIONS[key].fields.map(f => f.name)), key);
  assert.deepEqual(hosted.resources.warehouses, ['name', 'address', 'zip', 'residence', 'phone', 'email', 'description']);
  assert.ok(!hosted.actions['adjust-material'] && !hosted.actions.receive, 'the older stock actions stay full-profile only');
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; for (const key of ['warehouses', 'stock', 'movements', 'transfer_orders']) assert.equal(Object.hasOwn(other.resources, key), false, `${profile} ${key}`); assert.ok(!Object.keys(other.actions).some(key => key.startsWith('stock-'))); }
  assert.equal(availabilityFor('full'), undefined);
  const mto = PILOT_MAP.mto.groups.flatMap(group => group.items);
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Storehouses')!), '/workspace/warehouses');
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Material inventory')!), '/materials/stock');
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Materials list')!), '/materials/materials-list');
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Transfer orders')!), '/materials/transfer_orders');
  assert.ok(PILOT_MAP.weld.groups.flatMap(group => group.items).every(item => !['Material inventory', 'Materials list', 'Transfer orders'].includes(item.label)));
});

test('permissions: the new resources and actions follow the Material inventory area and stay out of Weld Pilot', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const account = (permissions: Partial<User['permissions']>, extra: Partial<User> = {}): User => ({ id: 'u', name: 'T', email: 't@example.test', profileId: 'p', availability: hosted, permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions }, ...extra });
  const writer = account({ general: 2, materials: 2 }), reader = account({ general: 1, materials: 1 }), welder = account({ general: 2, welding: 3 });
  for (const key of Object.keys(ACTIONS).filter(key => key.startsWith('stock-') || key.startsWith('transfer-order-'))) { assert.equal(canAction(writer, key), true, key); assert.equal(canAction(reader, key), false, key); assert.equal(canAction(welder, key), false, key); }
  for (const key of ['stock', 'movements', 'transfer_orders', 'transfer_order_items']) { assert.equal(canResource(writer, key), true, key); assert.equal(canResource(reader, key), true, key); assert.equal(canResource(welder, key), false, key); }
  assert.equal(canResource(writer, 'warehouses', 'edit'), true); assert.equal(canResource(reader, 'warehouses', 'edit'), false);
  // With a detailed matrix, removal needs the archive right of the Material inventory area.
  const matrix = (rights: string[]) => account({ materials: 2 }, { capabilities: { '16': rights as never } });
  assert.equal(canAction(matrix(['show', 'insert']), 'stock-remove'), false); assert.equal(canAction(matrix(['show', 'insert', 'delete']), 'stock-remove'), true);
  assert.equal(canAction(matrix(['show', 'insert']), 'stock-move'), true); assert.equal(canAction(matrix(['show']), 'stock-move'), false);
  assert.deepEqual(RESOURCE_MAP.transfer_orders.fields.find(field => field.name === 'type')!.options, ['Inventory - Project', 'Inventory - Storehouse', 'Storehouse → Project', 'Storehouse → Storehouse', 'Return → Inventory']);
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-http-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Stock-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; } };
}

test('HTTP: the MTO pilot operates the inventory, Weld Pilot and read-only accounts are refused, nothing changes on refusal', async t => {
  const f = await hostedFixture(t); const s = f.store;
  await f.signIn('Store keeper', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  const main = line(s, 'warehouse-main', 'material-4'), before = total(s), quantity = Number(main.quantity);
  const move = await f.request('/api/actions/stock-to-project', 'POST', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 2 }], date: '2026-11-02' });
  assert.equal(move.status, 201);
  assert.equal(Number(s.get('stock', main.id).quantity), quantity - 2); assert.deepEqual(total(s), before);
  const data = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  for (const key of ['stock', 'movements', 'warehouses', 'transfer_orders', 'transfer_order_items']) assert.ok(data.rows[key]?.length, key);
  assert.equal((await f.request('/api/records/stock')).status, 200);
  assert.equal((await f.request('/api/records/stock', 'POST', { warehouseId: 'warehouse-main', quantity: 5 })).status, 405, 'stock is only changed through the actions');
  // Unknown fields, bad quantities and shortages are refused with nothing applied.
  assert.equal((await f.request('/api/actions/stock-to-project', 'POST', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 2 }], extra: 1 })).status, 404);
  const bad = await f.request('/api/actions/stock-to-project', 'POST', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 0.001 }] }); assert.equal(bad.status, 422);
  const short = await f.request('/api/actions/stock-to-project', 'POST', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 9999 }] }); assert.equal(short.status, 409);
  assert.equal(Number(s.get('stock', main.id).quantity), quantity - 2);
  // Transfer order over HTTP, with the audit trail visible in the hosted profile.
  const created = await f.request('/api/actions/transfer-order-create', 'POST', { type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ materialNo: 'SS-P114', quantity: 1, uom: 'M' }], date: '2026-11-02' });
  assert.equal(created.status, 201); const order = (await created.json()).record as Row;
  assert.equal((await f.request('/api/actions/transfer-order-complete', 'POST', { orderId: order.id, date: '2026-11-03' })).status, 201);
  const history = await (await f.request(`/api/history/transfer_orders/${order.id}`)).json() as { events: { action: string }[] };
  assert.ok(history.events.some(event => event.action === 'completed'));
  const stockHistory = await (await f.request(`/api/history/stock/${main.id}`)).json() as { events: { action: string }[] };
  assert.ok(stockHistory.events.some(event => event.action === 'transferred'));
  // The pilot boundary: the same account inside Weld Pilot, and accounts without write access, are refused.
  f.usePilot('weld');
  assert.equal((await f.request('/api/actions/stock-to-project', 'POST', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 1 }] })).status, 403, 'not enabled for Weld Pilot');
  await f.signIn('Weld lead', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Administration' });
  for (const key of ['stock-add', 'stock-move', 'stock-remove', 'transfer-order-complete']) assert.equal((await f.request(`/api/actions/${key}`, 'POST', {})).status, 403, key);
  for (const key of ['stock', 'movements', 'transfer_orders']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  assert.equal((await f.request('/api/mto/materials-list')).status, 403);
  assert.equal(((await (await f.request('/api/bootstrap')).json()) as { rows: Record<string, Row[]> }).rows.stock, undefined);
  f.usePilot('mto');
  await f.signIn('Material viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/records/stock')).status, 200);
  for (const key of ['stock-to-project', 'stock-move', 'stock-correct', 'stock-adjust', 'stock-remove', 'transfer-order-create', 'transfer-order-cancel']) assert.equal((await f.request(`/api/actions/${key}`, 'POST', {})).status, 403, key);
  assert.equal(Number(s.get('stock', main.id).quantity), quantity - 3);
  // A request without a pilot is refused outright.
  f.usePilot('');
  assert.equal((await f.request('/api/actions/stock-move', 'POST', { stockId: main.id })).status, 403);
});

test('HTTP: a detailed profile needs the archive right to remove inventory lines', async t => {
  const f = await hostedFixture(t); const s = f.store, target = line(s, 'warehouse-main', 'material-8');
  await f.signIn('No removal', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '16': ['show', 'insert'], '5': ['show'], '4': ['show'], '75': ['show'], '64': ['show'], '70': ['show'] }) });
  assert.equal((await f.request('/api/actions/stock-remove', 'POST', { stockId: target.id, reasonText: 'Imported by mistake' })).status, 403);
  assert.equal(s.get('stock', target.id)._archived, false);
  await f.signIn('With removal', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '16': ['show', 'insert', 'delete'], '5': ['show'], '4': ['show'], '75': ['show'], '64': ['show'], '70': ['show'] }) });
  assert.equal((await f.request('/api/actions/stock-remove', 'POST', { stockId: target.id, reasonText: 'Imported by mistake' })).status, 201);
  assert.equal(s.get('stock', target.id, true)._archived, true);
});

test('HTTP: the materials list is computed on every request, scoped to the main project, exportable and permission-checked', async t => {
  const f = await hostedFixture(t); const s = f.store;
  await f.signIn('Planner', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  const first = await (await f.request('/api/mto/materials-list?siteId=site-north')).json() as { columns: { label: string }[]; rows: { id: string; values: Record<string, unknown> }[] };
  assert.deepEqual(first.columns.map(column => column.label), ['Project', 'Iso number', 'Ch.clean', 'Group', 'Mat.no.', 'Description', 'Qty.', 'Ord.?', 'Inv.', 'Picked']);
  assert.ok(first.rows.length > 0);
  const target = first.rows[0], material = s.get('materials', String(s.get('iso_materials', target.id).materialId));
  const holder = s.list('stock').find(row => row.materialId === material.id && Number(row.quantity) > 0)!;
  assert.equal((await f.request('/api/actions/stock-adjust', 'POST', { stockId: holder.id, quantity: 0.5, reasonText: 'Recount' })).status, 201);
  const second = await (await f.request('/api/mto/materials-list?siteId=site-north')).json() as typeof first;
  assert.notEqual(second.rows.find(row => row.id === target.id)!.values.inventory, target.values.inventory, 'no cache: the new figure shows at once');
  assert.equal((await (await f.request('/api/mto/materials-list?siteId=missing-site')).json() as typeof first).rows.length, 0);
  const csv = await f.request('/api/mto/materials-list?siteId=site-north&format=csv'); assert.equal(csv.status, 200); assert.match(await csv.text(), /Project","Iso number","Ch\.clean"/);
  assert.equal((await f.request('/api/mto/materials-list?format=xlsx')).status, 200);
  assert.equal((await f.request('/api/mto/materials-list?pilot=weld', 'GET', undefined, { 'X-Stelux-Pilot': 'mto' })).status, 403, 'a header and a query naming different pilots are refused');
});
