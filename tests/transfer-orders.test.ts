import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { ACTIONS } from '../shared/actions.ts';
import { canAction } from '../shared/permissions.ts';
import { ADJUST_REFUSED, LINE_STATUSES, TRANSFER_STATUSES, canAssign, completePlan, conservedTotals, isOpenOrder, lineStatus, mayAdjustQuantity, nextStatus, orderStatus, pickLine, pickSheetModel, qtyPicked, reservedOnOpenOrders, returnToInventoryPlan, reversePlan, storehouseManagers, transferOrderPath, transferTypeLabel } from '../shared/mto-stock.ts';
import type { Row, User } from '../shared/types.ts';

/**
 * Transfer orders (STO) with the reference lifecycle (mto-procurement-stock-009), Return to inventory from a storehouse line
 * (-003) and the Storehouse manager tick (delta-I2b-005). Every quantity below is worked out by hand from the sample seed:
 *   Main warehouse   SS-T114 (material-5) H-1042 38 · CS-V060 (material-6) 50 · CS-B020 (material-8) 74 · CS-P060 (material-1) 8
 *   Prefab yard      SS-P114 (material-4) H-3310 18.5
 *   North inventory  CS-P060 H-1042 16 + H-2206 12 + H-2207 2 = 30
 *   Riverside inv.   CS-P060 H-1042 4 · SS-P114 H-1042 20
 * Rules checked: on every move the totals per material and charge over all places stay the same (conservedTotals); a
 * completion moves only the picked quantities; a reverse restores exactly what moved and keeps the original movements.
 */
const actor = { id: 'tester', name: 'Test engineer' };
const fixture = () => { const store = new Store(':memory:'); seed(store); return store; };
const run = (store: Store, key: string, data: Record<string, unknown>) => runAction(store, key, { date: '2026-11-04', ...data }, actor);
const rowsOf = (store: Store) => Object.fromEntries(['stock', 'movements', 'materials', 'custom_materials', 'warehouses', 'sites', 'transfer_orders', 'transfer_order_items', 'certifications'].map(key => [key, store.list(key, true)]));
const total = (store: Store) => conservedTotals(rowsOf(store));
const refused = (status: number, pattern: RegExp) => (error: unknown) => { assert.equal((error as { status: number }).status, status); assert.match((error as Error).message, pattern); return true; };
/** Balance of one storehouse line (material and charge in one storehouse); 0 when the line does not exist. */
const inStore = (store: Store, warehouseId: string, materialId: string, chargeNo = 'H-1042') => Number(store.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === warehouseId && row.materialId === materialId && row.chargeNo === chargeNo)?.quantity ?? 0);
/** What a project site's inventory holds of one material (one charge, or all charges). */
const onSite = (store: Store, siteId: string, materialId: string, chargeNo?: string) => store.list('stock').filter(row => row.locationKind === 'site' && row.siteId === siteId && row.materialId === materialId && (chargeNo === undefined || row.chargeNo === chargeNo)).reduce((sum, row) => sum + Number(row.quantity), 0);
const created = (result: ReturnType<typeof runAction>) => ('record' in result ? result.record! : null as never);
const itemsOf = (store: Store, orderId: string) => store.list('transfer_order_items').filter(item => item.orderId === orderId).sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)) || a.id.localeCompare(b.id));
const row = (data: Record<string, unknown>) => ({ id: 'x', _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;

test('mto-procurement-stock-009: statuses, line statuses and the state machine follow the reference lifecycle; a stored Open reads as Requested', () => {
  assert.deepEqual([...TRANSFER_STATUSES], ['Requested', 'Assigned', 'In progress', 'Completed', 'Partial', 'Cancelled']);
  assert.deepEqual([...LINE_STATUSES], ['Pending', 'Picked', 'Not found', 'Partial']);
  assert.deepEqual(RESOURCE_MAP.transfer_orders.fields.find(field => field.name === 'status')!.options, [...TRANSFER_STATUSES]);
  assert.equal(orderStatus(row({ status: 'Open' })), 'Requested'); assert.equal(orderStatus(row({})), 'Requested'); assert.equal(isOpenOrder(row({ status: 'Open' })), true);
  assert.equal(lineStatus(row({})), 'Pending'); assert.equal(qtyPicked(row({})), 0);
  assert.equal(transferTypeLabel('Storehouse → Project'), 'Storehouse - Project'); assert.equal(transferTypeLabel('Return → Inventory'), 'Return - Inventory'); assert.equal(transferTypeLabel('Inventory - Storehouse'), 'Inventory - Storehouse');
  const at = (status: string, extra: Record<string, unknown> = {}) => row({ status, ...extra });
  const step = (status: string, event: Parameters<typeof nextStatus>[1], outcome?: 'Completed' | 'Partial', extra: Record<string, unknown> = {}) => { const result = nextStatus(at(status, extra), event, outcome); return result.ok ? result.value : `refused ${result.status}`; };
  assert.deepEqual(['Open', 'Requested', 'Assigned', 'In progress', 'Completed', 'Partial', 'Cancelled'].map(status => step(status, 'assign')), ['Assigned', 'Assigned', 'Assigned', 'In progress', 'refused 409', 'refused 409', 'refused 409']);
  assert.deepEqual(['Requested', 'Assigned', 'In progress', 'Completed'].map(status => step(status, 'pick')), ['refused 409', 'In progress', 'In progress', 'refused 409']);
  assert.deepEqual(['Requested', 'Assigned', 'In progress'].map(status => step(status, 'complete', 'Partial')), ['refused 409', 'Partial', 'Partial']);
  assert.deepEqual(['Requested', 'Assigned', 'In progress', 'Completed', 'Cancelled'].map(status => step(status, 'cancel')), ['Cancelled', 'Cancelled', 'Cancelled', 'refused 409', 'refused 409']);
  assert.deepEqual(['In progress', 'Completed', 'Partial', 'Cancelled'].map(status => step(status, 'reverse')), ['refused 409', 'Completed', 'Partial', 'refused 409']);
  assert.equal(step('Completed', 'reverse', undefined, { reversedAt: '2026-11-04T10:00:00Z' }), 'refused 409', 'a reversed order cannot be reversed twice');
  assert.equal(canAssign(at('Assigned', { assignedTo: 'tester' }), 'tester').ok, false, 'already mine'); assert.equal(canAssign(at('Assigned', { assignedTo: 'other' }), 'tester').ok, true, 'take over');
});

test('mto-procurement-stock-009: pick results are checked line by line against the ordered quantity', () => {
  const item = row({ id: 'line', materialNo: 'SS-T114', quantity: 10 });
  const pick = (qty: unknown, status: string) => { const result = pickLine(item, { qtyPicked: qty, lineStatus: status }); return result.ok ? result.value : result.message; };
  assert.deepEqual(pick(null, 'Picked'), { qtyPicked: 10, lineStatus: 'Picked' }, 'Picked without a quantity means the full 10');
  assert.deepEqual(pick(10, 'Picked'), { qtyPicked: 10, lineStatus: 'Picked' });
  assert.deepEqual(pick(2.5, 'Partial'), { qtyPicked: 2.5, lineStatus: 'Partial' });
  assert.deepEqual(pick('', 'Not found'), { qtyPicked: 0, lineStatus: 'Not found' });
  assert.deepEqual(pick(0, 'Pending'), { qtyPicked: 0, lineStatus: 'Pending' });
  assert.match(String(pick(9, 'Picked')), /Picked means the full quantity \(10\)/);
  assert.match(String(pick(10, 'Partial')), /above 0 and below 10/); assert.match(String(pick(0, 'Partial')), /above 0 and below 10/);
  assert.match(String(pick(11, 'Partial')), /cannot exceed the ordered quantity \(10\)/);
  assert.match(String(pick(1, 'Not found')), /not found line has no picked quantity/);
  assert.match(String(pick(1.005, 'Partial')), /steps of 0.01/); assert.match(String(pick(-1, 'Partial')), /zero or more/); assert.match(String(pick('3', 'Partial')), /zero or more/);
  assert.match(String(pick(3, 'Lost')), /choose the line status/);
  // Complete transfer: no line may still be Pending, something must be picked; all lines in full = Completed, else Partial.
  const lines = (...entries: [number, number, string][]) => entries.map(([quantity, picked, status], i) => row({ id: `l${i}`, materialNo: `M${i}`, quantity, qtyPicked: picked, lineStatus: status }));
  const plan = (items: Row[]) => { const result = completePlan(items); return result.ok ? { outcome: result.value.outcome, moves: result.value.moves.map(move => [move.item.id, move.quantity]) } : result.message; };
  assert.deepEqual(plan(lines([10, 10, 'Picked'], [4, 4, 'Picked'])), { outcome: 'Completed', moves: [['l0', 10], ['l1', 4]] });
  assert.deepEqual(plan(lines([10, 10, 'Picked'], [4, 2.5, 'Partial'], [2, 0, 'Not found'])), { outcome: 'Partial', moves: [['l0', 10], ['l1', 2.5]] }, 'only the picked quantities move');
  assert.match(String(plan(lines([10, 10, 'Picked'], [4, 0, 'Pending']))), /M1 still pending/);
  assert.match(String(plan(lines([2, 0, 'Not found']))), /Nothing was picked/);
});

test('mto-procurement-stock-009: Requested → Assign → save picks (one line Not found) → Complete gives Partial and moves only the picked quantities; Reverse restores every balance', () => {
  const s = fixture(), before = total(s);
  // Storehouse → Storehouse, Main warehouse → Field stores: 10 SS-T114, 4 CS-V060, 2 CS-B020.
  const order = created(run(s, 'transfer-order-create', { type: 'Storehouse → Storehouse', priority: 'Urgent', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-field', notes: 'Valves and tees for the steam header.', items: [{ materialNo: 'SS-T114', quantity: 10, uom: 'EA' }, { materialNo: 'CS-V060', quantity: 4, uom: 'EA' }, { materialNo: 'CS-B020', quantity: 2, uom: 'SET' }] }));
  assert.equal(order.status, 'Requested'); assert.equal(order.createdByName, 'Test engineer');
  assert.deepEqual([inStore(s, 'warehouse-main', 'material-5'), inStore(s, 'warehouse-main', 'material-6'), inStore(s, 'warehouse-main', 'material-8')], [38, 50, 74], 'creating moves nothing');
  const byNo = (no: string) => itemsOf(s, order.id).find(item => item.materialNo === no)!;
  const tee = byNo('SS-T114'), valve = byNo('CS-V060'), bolts = byNo('CS-B020');
  const picks = (items: Record<string, unknown>[]) => run(s, 'transfer-order-pick', { orderId: order.id, items });
  assert.throws(() => picks([{ itemId: tee.id, qtyPicked: 10, lineStatus: 'Picked' }]), refused(409, /Assign the transfer order to yourself first/));
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: order.id }), refused(409, /Assign the transfer order to yourself first/));
  const assigned = created(run(s, 'transfer-order-assign', { orderId: order.id }));
  assert.deepEqual([assigned.status, assigned.assignedTo, assigned.assignedName], ['Assigned', 'tester', 'Test engineer']); assert.ok(assigned.assignedAt);
  assert.throws(() => run(s, 'transfer-order-assign', { orderId: order.id }), refused(409, /already assigned to you/));
  // Assigned but nothing picked yet: Complete is refused while lines are Pending.
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: order.id }), refused(409, /still pending/));
  // Refused pick results change nothing.
  assert.throws(() => picks([{ itemId: tee.id, qtyPicked: 9, lineStatus: 'Picked' }]), refused(422, /Picked means the full quantity/));
  assert.throws(() => picks([{ itemId: 'not-on-this-order', qtyPicked: 1, lineStatus: 'Partial' }]), refused(422, /not on this transfer order/));
  assert.throws(() => picks([{ itemId: tee.id, qtyPicked: 10, lineStatus: 'Picked' }, { itemId: tee.id, qtyPicked: 10, lineStatus: 'Picked' }]), refused(422, /only once/));
  assert.equal(s.get('transfer_orders', order.id).status, 'Assigned');
  picks([{ itemId: tee.id, qtyPicked: 10, lineStatus: 'Picked' }, { itemId: valve.id, qtyPicked: 2.5, lineStatus: 'Partial' }, { itemId: bolts.id, lineStatus: 'Not found' }]);
  assert.equal(s.get('transfer_orders', order.id).status, 'In progress');
  assert.deepEqual(['SS-T114', 'CS-V060', 'CS-B020'].map(no => [no, byNo(no).qtyPicked, byNo(no).lineStatus]), [['SS-T114', 10, 'Picked'], ['CS-V060', 2.5, 'Partial'], ['CS-B020', 0, 'Not found']]);
  assert.equal(inStore(s, 'warehouse-main', 'material-5'), 38, 'saving picks moves nothing');
  run(s, 'transfer-order-complete', { orderId: order.id, date: '2026-11-05' });
  const done = s.get('transfer_orders', order.id);
  assert.deepEqual([done.status, done.completedDate], ['Partial', '2026-11-05']); assert.ok(done.completedAt);
  // By hand: SS-T114 main 38 − 10 = 28, field 0 + 10 = 10; CS-V060 main 50 − 2.5 = 47.5, field 2.5; CS-B020 not found: main stays 74, field gets no line.
  assert.deepEqual([inStore(s, 'warehouse-main', 'material-5'), inStore(s, 'warehouse-field', 'material-5')], [28, 10]);
  assert.deepEqual([inStore(s, 'warehouse-main', 'material-6'), inStore(s, 'warehouse-field', 'material-6')], [47.5, 2.5]);
  assert.deepEqual([inStore(s, 'warehouse-main', 'material-8'), s.list('stock').some(item => item.warehouseId === 'warehouse-field' && item.materialId === 'material-8')], [74, false]);
  assert.deepEqual(total(s), before, 'totals conserved by the completion');
  const originals = s.list('movements').filter(move => move.transferOrder === order.number);
  assert.deepEqual(originals.map(move => [move.materialId, move.warehouseId, move.quantity]).sort(), [['material-5', 'warehouse-field', 10], ['material-5', 'warehouse-main', -10], ['material-6', 'warehouse-field', 2.5], ['material-6', 'warehouse-main', -2.5]]);
  assert.throws(() => run(s, 'transfer-order-cancel', { orderId: order.id, reason: 'Too late' }), refused(409, /already partial/));
  // Reverse order: compensating movements; balances exactly as before the completion; the originals stay.
  run(s, 'transfer-order-reverse', { orderId: order.id });
  assert.deepEqual([inStore(s, 'warehouse-main', 'material-5'), inStore(s, 'warehouse-field', 'material-5'), inStore(s, 'warehouse-main', 'material-6'), inStore(s, 'warehouse-field', 'material-6'), inStore(s, 'warehouse-main', 'material-8')], [38, 0, 50, 0, 74]);
  assert.deepEqual(total(s), before, 'totals conserved by the reverse');
  const after = s.list('movements').filter(move => move.transferOrder === order.number);
  assert.equal(after.filter(move => move.type !== 'Reversal').length, 4, 'the original movements stay');
  assert.deepEqual(after.filter(move => move.type === 'Reversal').map(move => [move.materialId, move.warehouseId, move.quantity]).sort(), [['material-5', 'warehouse-field', -10], ['material-5', 'warehouse-main', 10], ['material-6', 'warehouse-field', -2.5], ['material-6', 'warehouse-main', 2.5]]);
  const reversed = s.get('transfer_orders', order.id);
  assert.equal(reversed.status, 'Partial', 'the status stays; reversedAt marks the reverse'); assert.ok(reversed.reversedAt); assert.equal(reversed.reversedBy, 'Test engineer');
  assert.throws(() => run(s, 'transfer-order-reverse', { orderId: order.id }), refused(409, /already reversed/));
  assert.deepEqual(['created', 'assigned', 'picked', 'completed', 'reversed'].map(action => s.activity(100).some(event => event.entityId === order.id && event.action === action)), [true, true, true, true, true]);
});

test('mto-procurement-stock-009: an inventory order takes charges in charge order; Reverse is refused, with nothing changed, when the destination no longer holds the material', () => {
  const s = fixture();
  // A pipe of its own in North's inventory, three charges: C-1 16, C-2 12, C-3 2 (30 m); Riverside holds none.
  const pipe = s.create('materials', { materialNo: 'TO-PIPE-90', description: 'Transfer test pipe', materialGroup: 'Pipe', uom: 'M' }, actor, 'material-to-pipe');
  for (const [chargeNo, quantity] of [['C-1', 16], ['C-2', 12], ['C-3', 2]] as const) run(s, 'stock-add', { siteId: 'site-north', materialId: pipe.id, chargeNo, quantity });
  const before = total(s);
  // Inventory - Project, North → Riverside, 20 m.
  const order = created(run(s, 'transfer-order-create', { type: 'Inventory - Project', fromSiteId: 'site-north', siteId: 'site-river', items: [{ materialNo: 'TO-PIPE-90', quantity: 20, uom: 'M' }] }));
  run(s, 'transfer-order-assign', { orderId: order.id });
  run(s, 'transfer-order-pick', { orderId: order.id, items: [{ itemId: itemsOf(s, order.id)[0].id, qtyPicked: 20, lineStatus: 'Picked' }] });
  run(s, 'transfer-order-complete', { orderId: order.id });
  assert.equal(s.get('transfer_orders', order.id).status, 'Completed', 'every line picked in full');
  // By hand: C-1 16 taken whole, then 4 of C-2. North 16/12/2 → 0/8/2 = 10; Riverside C-1 16 and C-2 4, 20 in all.
  assert.deepEqual([onSite(s, 'site-north', pipe.id, 'C-1'), onSite(s, 'site-north', pipe.id, 'C-2'), onSite(s, 'site-north', pipe.id, 'C-3'), onSite(s, 'site-north', pipe.id)], [0, 8, 2, 10]);
  assert.deepEqual([onSite(s, 'site-river', pipe.id, 'C-1'), onSite(s, 'site-river', pipe.id, 'C-2'), onSite(s, 'site-river', pipe.id)], [16, 4, 20]);
  assert.deepEqual(total(s), before);
  // Riverside uses 18 m: C-1 16 → 0, C-2 4 → 2. Reversing needs 16 back from C-1: refused, nothing changes.
  run(s, 'inventory-remove', { siteId: 'site-river', materialId: pipe.id, quantity: 18, comment: 'Cut for the header spools' });
  const snapshot = JSON.stringify([s.list('stock'), s.list('movements', true), s.get('transfer_orders', order.id)]);
  assert.throws(() => run(s, 'transfer-order-reverse', { orderId: order.id }), refused(409, /Insufficient stock/));
  assert.equal(JSON.stringify([s.list('stock'), s.list('movements', true), s.get('transfer_orders', order.id)]), snapshot);
  // Pure plan: one opposite booking per movement, arrivals first; per material and charge they sum to zero.
  const plan = reversePlan(s.get('transfer_orders', order.id), s.list('movements', true));
  assert.ok(plan.ok);
  if (plan.ok) {
    const sums = new Map<string, number>(); for (const entry of plan.value) { const key = `${entry.move.materialId}|${entry.move.chargeNo}`; sums.set(key, Math.round(((sums.get(key) || 0) + entry.quantity) * 1e6) / 1e6); }
    assert.deepEqual([...sums.values()], [0, 0]); assert.ok(plan.value[0].quantity < 0, 'what arrived is taken back first');
  }
});

test('mto-procurement-stock-009: Cancel needs a reason; a cancelled, a reserved and a legacy order follow the rules; an invalid destination refuses Complete', () => {
  const s = fixture();
  const line = s.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-main' && row.materialId === 'material-1')!;
  const order = created(run(s, 'transfer-order-create', { type: 'Storehouse → Project', siteId: 'site-river', items: [{ stockId: line.id, materialNo: 'CS-P060', quantity: 3, uom: 'M' }] }));
  assert.equal(reservedOnOpenOrders(rowsOf(s), line), 3, 'a Requested order reserves its line');
  run(s, 'transfer-order-assign', { orderId: order.id });
  assert.equal(reservedOnOpenOrders(rowsOf(s), s.get('stock', line.id)), 3, 'an Assigned order still reserves it');
  assert.throws(() => run(s, 'transfer-order-cancel', { orderId: order.id }), refused(422, /Reason is required/));
  assert.throws(() => run(s, 'transfer-order-cancel', { orderId: order.id, reason: '   ' }), refused(422, /Reason is required/));
  run(s, 'transfer-order-cancel', { orderId: order.id, reason: 'Material taken from the yard instead.' });
  const cancelled = s.get('transfer_orders', order.id);
  assert.deepEqual([cancelled.status, cancelled.cancelReason], ['Cancelled', 'Material taken from the yard instead.']); assert.match(String(cancelled.notes), /Cancelled: Material taken from the yard instead\./);
  assert.equal(reservedOnOpenOrders(rowsOf(s), s.get('stock', line.id)), 0); assert.equal(inStore(s, 'warehouse-main', 'material-1'), 8, 'no stock moved');
  assert.throws(() => run(s, 'transfer-order-assign', { orderId: order.id }), refused(409, /already cancelled/));
  // An order stored before the lifecycle (status Open, items without pick results) reads Requested and goes through it unchanged.
  const spare = s.create('warehouses', { name: 'Spare container', location: 'Rotterdam, quay 4', use: 'Materials', companyId: 'company-stelux' }, actor);
  const legacy = s.create('transfer_orders', { number: 'TO-OLD-1', type: 'Storehouse → Storehouse', status: 'Open', fromWarehouseId: 'warehouse-main', toWarehouseId: spare.id }, actor);
  const legacyItem = s.create('transfer_order_items', { orderId: legacy.id, materialNo: 'CS-V060', quantity: 1 }, actor);
  assert.equal(orderStatus(legacy), 'Requested'); assert.equal(lineStatus(legacyItem), 'Pending');
  assert.equal(created(run(s, 'transfer-order-assign', { orderId: legacy.id })).status, 'Assigned');
  run(s, 'transfer-order-pick', { orderId: legacy.id, items: [{ itemId: legacyItem.id, lineStatus: 'Picked' }] });
  // The destination storehouse now holds tools only (no material can arrive) after the picks: Complete is refused and nothing moves.
  s.update('warehouses', spare.id, { use: 'Tools' }, s.get('warehouses', spare.id)._version, actor);
  assert.throws(() => run(s, 'transfer-order-complete', { orderId: legacy.id }), refused(409, /destination of this transfer order is no longer valid/));
  assert.equal(inStore(s, 'warehouse-main', 'material-6'), 50);
  // To project site lists only active project sites: an archived site is refused as a destination.
  const river = s.get('sites', 'site-river'); s.update('sites', river.id, { archived: true }, river._version, actor);
  assert.throws(() => run(s, 'transfer-order-create', { type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ materialNo: 'CS-P060', quantity: 1 }] }), refused(422, /active project site/));
});

test('mto-procurement-stock-003: Return to inventory moves a storehouse line into the current site\'s free-pool inventory as a completed Return - Inventory order', () => {
  const s = fixture(), before = total(s);
  const yard = s.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-yard' && row.materialId === 'material-4')!;
  assert.deepEqual(ACTIONS['stock-return'].fields.map(field => [field.name, field.label, field.hidden === true]), [['stockId', 'Storehouse line', false], ['siteId', 'Project site', true], ['quantity', 'Quantity to return', false], ['all', 'Return all', false]], 'no destination, date or notes');
  // Rules of the dialog: more than 0, at most the available 18.5.
  const plan = (input: Record<string, unknown>) => { const result = returnToInventoryPlan(yard, input); return result.ok ? result.value : `${result.status} ${result.message}`; };
  assert.equal(plan({ quantity: 5 }), 5); assert.equal(plan({ all: true }), 18.5); assert.equal(plan({ quantity: 18.5 }), 18.5);
  assert.match(String(plan({ quantity: 0 })), /^422 /); assert.match(String(plan({ quantity: 0.005 })), /^422 /); assert.match(String(plan({ quantity: 18.51 })), /^409 Quantity exceeds available balance \(18.5\)/);
  const snapshot = JSON.stringify([s.list('stock'), s.list('movements', true), s.list('transfer_orders', true)]);
  for (const quantity of [0, -1, 18.51]) assert.throws(() => run(s, 'stock-return', { stockId: yard.id, siteId: 'site-river', quantity }), /./);
  assert.equal(JSON.stringify([s.list('stock'), s.list('movements', true), s.list('transfer_orders', true)]), snapshot, 'a refused return changes nothing');
  // By hand: yard SS-P114 H-3310 18.5 − 5 = 13.5; Riverside SS-P114 H-1042 20 stays, H-3310 0 + 5 = 5, 25 in all.
  const result = run(s, 'stock-return', { stockId: yard.id, siteId: 'site-river', quantity: 5 });
  assert.equal(inStore(s, 'warehouse-yard', 'material-4', 'H-3310'), 13.5);
  assert.deepEqual([onSite(s, 'site-river', 'material-4', 'H-1042'), onSite(s, 'site-river', 'material-4', 'H-3310'), onSite(s, 'site-river', 'material-4')], [20, 5, 25]);
  assert.deepEqual(total(s), before);
  const order = created(result);
  assert.deepEqual([order.type, transferTypeLabel(order.type), order.status, order.fromWarehouseId, order.siteId, order.assignedTo], ['Return → Inventory', 'Return - Inventory', 'Completed', 'warehouse-yard', 'site-river', 'tester']);
  assert.deepEqual(itemsOf(s, order.id).map(item => [item.materialNo, item.quantity, item.qtyPicked, item.lineStatus, item.stockId]), [['SS-P114', 5, 5, 'Picked', yard.id]]);
  assert.deepEqual(s.list('movements').filter(move => move.transferOrder === order.number).map(move => [move.type, move.warehouseId, move.siteId, move.quantity]).sort(), [['Return to inventory', '', 'site-river', 5], ['Return to inventory', 'warehouse-yard', 'site-river', -5]]);
  // Return all: the remaining 13.5; then the line is empty and nothing more can be returned. It can be reversed like any completed order.
  run(s, 'stock-return', { stockId: yard.id, siteId: 'site-river', all: true });
  assert.deepEqual([inStore(s, 'warehouse-yard', 'material-4', 'H-3310'), onSite(s, 'site-river', 'material-4', 'H-3310')], [0, 18.5]);
  assert.throws(() => run(s, 'stock-return', { stockId: yard.id, siteId: 'site-river', all: true }), refused(422, /nothing to return/));
  run(s, 'transfer-order-reverse', { orderId: order.id });
  assert.deepEqual([inStore(s, 'warehouse-yard', 'material-4', 'H-3310'), onSite(s, 'site-river', 'material-4', 'H-3310')], [5, 13.5]);
  assert.deepEqual(total(s), before);
  // A site inventory row is not a storehouse line.
  const inventory = s.list('stock').find(item => item.locationKind === 'site' && item.siteId === 'site-river')!;
  assert.throws(() => run(s, 'stock-return', { stockId: inventory.id, siteId: 'site-river', quantity: 1 }), refused(422, /not in a storehouse/));
});

test('delta-I2b-005: Storehouse manager is an MTO Pilot tick of the user form (default off); notifications and Adjust quantity follow it', () => {
  const field = RESOURCE_MAP.users.fields.find(item => item.name === 'storehouseManager')!;
  assert.deepEqual([field.label, field.type, field.default, field.hint, field.showIf], ['Storehouse manager', 'checkbox', false, 'Receives notifications for transfer orders.', ['mtoEnabled', true]]);
  const names = RESOURCE_MAP.users.fields.map(item => item.name);
  assert.ok(names.indexOf('storehouseManager') > names.indexOf('mtoSiteScope') && !names.includes('weldStorehouseManager'), 'in the MTO Pilot block, after Access');
  const hosted = projectResource(availabilityFor(HOSTED_RELEASE_PROFILE)!, RESOURCE_MAP.users);
  assert.equal(hosted.fields.find(item => item.name === 'storehouseManager')?.hidden, false, 'shown in the hosted user form');
  for (const profile of ['welding-demo', 'access-prototype'] as const) assert.equal(Boolean(availabilityFor(profile)!.resources.users?.includes('storehouseManager')), false, `${profile} unchanged`);
  assert.equal(field.hidden, true, 'hidden outside the pilots profile');
  assert.deepEqual(storehouseManagers([row({ id: 'a', storehouseManager: true }), row({ id: 'b' }), row({ id: 'c', storehouseManager: false })], ['a', 'b', 'c']), ['a']);
  assert.equal(mayAdjustQuantity(true, undefined), true); assert.equal(mayAdjustQuantity(false, row({ storehouseManager: true })), true); assert.equal(mayAdjustQuantity(false, row({})), false);
  assert.equal(transferOrderPath('abc'), '/materials/transfer_orders?order=abc');
  // The new steps keep the transfer-order gate (Material inventory 16 add right): no Weld Pilot, no read-only account.
  const account = (permissions: Partial<User['permissions']>, extra: Partial<User> = {}): User => ({ id: 'u', name: 'T', email: 't@example.test', profileId: 'p', availability: availabilityFor(HOSTED_RELEASE_PROFILE), permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions }, ...extra });
  for (const key of ['transfer-order-assign', 'transfer-order-pick', 'transfer-order-reverse']) { assert.equal(canAction(account({ general: 2, materials: 2 }), key), true, key); assert.equal(canAction(account({ general: 1, materials: 1 }), key), false, key); assert.equal(canAction(account({ general: 2, welding: 3 }, { pilot: 'weld' }), key), false, key); }
});

test('Print pick sheet: the model lists every line with its place and the pick results saved so far', () => {
  const s = fixture();
  const line = s.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-main' && row.materialId === 'material-1')!;
  const order = created(run(s, 'transfer-order-create', { type: 'Storehouse → Project', siteId: 'site-north', items: [{ stockId: line.id, materialNo: 'CS-P060', description: 'Seamless pipe', quantity: 3, uom: 'M' }] }));
  const model = pickSheetModel(rowsOf(s), order.id)!;
  assert.deepEqual([model.type, model.status, model.from, model.to], ['Storehouse - Project', 'Requested', 'Storehouse of each item', 'North fabrication yard']);
  assert.deepEqual(model.lines, [['1', 'CS-P060', 'Seamless pipe', '3', 'M', 'Main warehouse · H-1042', '', '']]);
  assert.equal(pickSheetModel(rowsOf(s), 'missing'), null);
});

// ---- HTTP: notifications to storehouse managers, Adjust quantity, the pick sheet, Return to inventory in the session's main project ----

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-sto-http-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const password = 'Transfer-Order-Test-Password';
  /** An account with its own session: `request(path, method, body, headers)`. */
  const account = async (name: string, levels: Record<string, string>, extra: Record<string, unknown> = {}) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true, ...extra });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    let cookie = '';
    const request = async (path: string, method = 'GET', data?: unknown, headers: Record<string, string> = {}) => {
      const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
    };
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
    return { user, request };
  };
  return { store, account };
}
const writer = { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' };

test('HTTP delta-I2b-005: new, completed and reversed transfer orders notify only the storehouse managers that may open them, never the actor', async t => {
  const f = await hostedFixture(t), s = f.store;
  const planner = await f.account('Planner', writer);
  const manager = await f.account('Store manager', writer, { storehouseManager: true });
  const plain = await f.account('Store hand', writer);
  const bell = async (who: typeof planner) => (await (await who.request('/api/notifications')).json()) as { unread: number; notifications: { title: string; link: string }[] };
  const createdOrder = await planner.request('/api/actions/transfer-order-create', 'POST', { type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', items: [{ materialNo: 'CS-P060', quantity: 2, uom: 'M' }], date: '2026-11-04' });
  assert.equal(createdOrder.status, 201); const order = ((await createdOrder.json()) as { record: Row }).record;
  assert.deepEqual((await bell(manager)).notifications.map(item => [item.title, item.link]), [[`New Transfer Order ${order.number}`, `/materials/transfer_orders?order=${order.id}`]]);
  assert.equal((await bell(plain)).unread, 0, 'no tick, no notification'); assert.equal((await bell(planner)).unread, 0, 'never the actor');
  // The manager handles it: the planner is no storehouse manager, so the completion reaches nobody else; then the planner reverses it.
  assert.equal((await manager.request('/api/actions/transfer-order-assign', 'POST', { orderId: order.id })).status, 201);
  const item = s.list('transfer_order_items').find(entry => entry.orderId === order.id)!;
  assert.equal((await manager.request('/api/actions/transfer-order-pick', 'POST', { orderId: order.id, items: [{ itemId: item.id, qtyPicked: 2, lineStatus: 'Picked' }] })).status, 201);
  assert.equal((await manager.request('/api/actions/transfer-order-complete', 'POST', { orderId: order.id, date: '2026-11-05' })).status, 201);
  assert.equal((await bell(manager)).unread, 1, 'the manager who completed it is not told again');
  assert.equal((await planner.request('/api/actions/transfer-order-reverse', 'POST', { orderId: order.id, date: '2026-11-06' })).status, 201);
  assert.deepEqual((await bell(manager)).notifications.map(entry => entry.title), [`Transfer Order Reversed ${order.number}`, `New Transfer Order ${order.number}`]);
  assert.equal((await bell(plain)).unread, 0);
  // Return to inventory completes an order at once: sto_completed to the managers.
  const yard = s.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-yard' && row.materialId === 'material-4')!;
  assert.equal((await planner.request('/api/actions/stock-return', 'POST', { stockId: yard.id, siteId: 'site-river', quantity: 1 })).status, 201);
  assert.match((await bell(manager)).notifications[0].title, /^Transfer Order Completed TO-/);
  assert.deepEqual(s.list('notifications').map(entry => entry.userId).filter(id => id !== manager.user.id), []);
});

test('HTTP delta-I2b-005: Adjust quantity saves only for an administrator or a storehouse manager', async t => {
  const f = await hostedFixture(t), s = f.store;
  const target = s.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-main' && row.materialId === 'material-8')!;
  const adjust = (who: { request: (path: string, method?: string, data?: unknown) => Promise<Response> }, quantity: number) => who.request('/api/actions/stock-adjust', 'POST', { stockId: target.id, quantity, reason: 'Count correction', reasonText: 'Cycle count' });
  const hand = await f.account('Store hand', writer);
  const refusedResponse = await adjust(hand, 70);
  assert.equal(refusedResponse.status, 403); assert.equal(((await refusedResponse.json()) as { error: string }).error, ADJUST_REFUSED);
  assert.equal(Number(s.get('stock', target.id).quantity), 74, 'nothing saved');
  const manager = await f.account('Store manager', writer, { storehouseManager: true });
  assert.equal((await adjust(manager, 70)).status, 201); assert.equal(Number(s.get('stock', target.id).quantity), 70);
  const admin = await f.account('Stock administrator', { ...writer, settingsPermission: 'Administration' });
  assert.equal((await adjust(admin, 72)).status, 201); assert.equal(Number(s.get('stock', target.id).quantity), 72);
});

test('HTTP mto-procurement-stock-003: Return to inventory books into the main project the session works in; the pick sheet prints for the export right', async t => {
  const f = await hostedFixture(t), s = f.store;
  const keeper = await f.account('Store keeper', writer);
  const main = s.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === 'warehouse-main' && row.materialId === 'material-1')!;
  const northBefore = s.list('stock').filter(row => row.locationKind === 'site' && row.siteId === 'site-north' && row.materialId === 'material-1').reduce((sum, row) => sum + Number(row.quantity), 0);
  // Returning 5 of 8 from the storehouse line leaves 3 there and adds 5 to the inventory of the main project in use (North), whatever site the body names.
  const returned = await keeper.request('/api/actions/stock-return', 'POST', { stockId: main.id, siteId: 'site-river', quantity: 5 }, { 'X-Stelux-Site': 'site-north' });
  assert.equal(returned.status, 201);
  assert.equal(Number(s.get('stock', main.id).quantity), 3);
  assert.equal(s.list('stock').filter(row => row.locationKind === 'site' && row.siteId === 'site-north' && row.materialId === 'material-1').reduce((sum, row) => sum + Number(row.quantity), 0), northBefore + 5);
  assert.equal(onSite(s, 'site-river', 'material-1'), 4, 'Riverside unchanged');
  assert.equal((await keeper.request('/api/actions/stock-return', 'POST', { stockId: main.id, quantity: 1, date: '2026-11-04' }, { 'X-Stelux-Site': 'site-north' })).status, 404, 'no Date or Notes on this dialog');
  // Print pick sheet of the order the return made.
  const order = ((await returned.json()) as { record: Row }).record;
  const pdf = await keeper.request(`/api/pdf/pick-sheet?orderId=${order.id}`);
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await keeper.request('/api/pdf/pick-sheet?orderId=missing')).status, 404);
  const welder = await f.account('Weld lead', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Administration' });
  assert.notEqual((await welder.request(`/api/pdf/pick-sheet?orderId=${order.id}`)).status, 200, 'no transfer-order rights, no pick sheet');
});
