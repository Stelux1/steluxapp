import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES } from '../shared/resources.ts';
import { availabilityFor, pageAvailable, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { pagePilots, PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import { canAction } from '../shared/permissions.ts';
import { PROCUREMENT_PAGES, archiveDefaultRange, archivedOrders, csvCell, dateRangeError, momentOf, orderChoiceText, orderPlanning, orderStatus, pendingLines, printMoment, receiptItems, receiptLog, receiptMoment, receiptQuantityErrors, receiptRemaining, receivableOrders, supplierChoiceText, toCsv } from '../shared/mto-procurement.ts';
import { ORDER_COLUMNS, orderDocumentModel } from '../shared/pdf-documents.ts';
import { requirementExecution } from '../shared/materials.ts';
import type { Row, User } from '../shared/types.ts';

const actor = { id: 'procurement-test', name: 'Procurement test' };
const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
function fixture(t: { after: (fn: () => void) => void }) { const s = new Store(':memory:'); seed(s); t.after(() => s.close()); return s; }
const rows = (s: Store) => Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key, true)])) as Record<string, Row[]>;
const snapshot = (s: Store) => JSON.stringify({ rows: rows(s), audit: s.activity(10000), counters: s.db.prepare('SELECT * FROM counters ORDER BY key').all() });
const orderRequirements = (s: Store, requirementIds: string[], extra: Record<string, unknown> = {}) => { const result = runAction(s, 'order-requirements', { requirementIds, date: '2026-10-25', ...extra }, actor); assert.ok('record' in result && result.record); return result.record!; };
const stockOf = (s: Store, materialId: string, warehouseId: string, chargeNo: string) => Number(s.list('stock').find(r => r.materialId === materialId && r.warehouseId === warehouseId && (r.chargeNo || '') === chargeNo)?.quantity ?? 0);
/** A take-in books into the Material inventory of the order's project site (shared/mto-stock.ts). */
const siteStockOf = (s: Store, materialId: string, siteId: string, chargeNo: string) => Number(s.list('stock').find(r => r.locationKind === 'site' && r.materialId === materialId && r.siteId === siteId && (r.chargeNo || '') === chargeNo)?.quantity ?? 0);

test('Order materials adds one row per material over the isometrics that still need it and drops what is ordered', t => {
  const s = fixture(t);
  const catalog = s.create('materials', { materialNo: 'PROC-PIPE-6', description: 'Seamless pipe 6 in SCH 40', materialGroup: 'Pipe', articleNo: 'ART-PROC', dia: '6', lbs: 'SCH 40', uom: 'M' }, actor);
  const a = s.create('iso_materials', { isoId: 'iso-1', materialId: catalog.id, quantity: 5.5 }, actor);
  const b = s.create('iso_materials', { isoId: 'iso-2', materialId: catalog.id, quantity: 2 }, actor);
  const c = s.create('iso_materials', { isoId: 'iso-5', materialId: catalog.id, quantity: 4 }, actor);
  let plan = orderPlanning(rows(s)).filter(g => g.material.id === catalog.id);
  assert.equal(plan.length, 1); assert.equal(plan[0].quantity, 11.5); assert.deepEqual(plan[0].requirementIds.sort(), [a.id, b.id, c.id].sort()); assert.equal(plan[0].isoIds.length, 3);
  // Filters: project and isometric.
  assert.equal(orderPlanning(rows(s), { projectId: 'project-cooling' }).find(g => g.material.id === catalog.id)!.quantity, 7.5);
  assert.equal(orderPlanning(rows(s), { isoId: 'iso-5' }).find(g => g.material.id === catalog.id)!.quantity, 4);
  assert.equal(orderPlanning(rows(s), { query: 'no-such-material' }).length, 0);
  // Order checked materials: one order, a running number, and the ordered quantities leave the list.
  const first = orderRequirements(s, [a.id, b.id]); const second = orderRequirements(s, [c.id]);
  assert.match(String(first.number), /^PO-\d{4}-\d{4}$/); assert.notEqual(first.number, second.number);
  assert.equal(s.list('order_lines').filter(l => l.orderId === first.id).length, 2); assert.equal(first.status, 'Pending'); assert.equal(first.supplierId, '');
  plan = orderPlanning(rows(s)).filter(g => g.material.id === catalog.id); assert.equal(plan.length, 0);
});

test('Pending order lists open lines with ordered against received, and Order archive filters by project and date', t => {
  const s = fixture(t);
  const order = orderRequirements(s, ['requirement-2', 'requirement-8'], { date: '2026-11-02' });
  const lines = s.list('order_lines').filter(l => l.orderId === order.id);
  let pending = pendingLines(rows(s)).filter(p => p.order.id === order.id);
  assert.equal(pending.length, 2); assert.deepEqual(pending.map(p => p.outstanding).sort(), [4, 4]);
  runAction(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 1.5, chargeNo: 'PEND-1' }] }, actor);
  pending = pendingLines(rows(s)).filter(p => p.order.id === order.id);
  assert.equal(pending.length, 2); assert.equal(pending.find(p => p.line.id === lines[0].id)!.outstanding, 2.5);
  runAction(s, 'receive', { orderId: order.id, warehouseId: 'warehouse-main', items: lines.map(l => ({ lineId: l.id, quantity: Number(l.quantity) - Number(s.get('order_lines', l.id).received) })) }, actor);
  assert.equal(pendingLines(rows(s)).filter(p => p.order.id === order.id).length, 0);
  assert.equal(s.get('orders', order.id).status, 'Received');
  // Archive: newest first, project filter, date range, and an inverted range is an error.
  const all = archivedOrders(rows(s)); assert.equal(all[0].id, order.id);
  // The order spans the cooling and skid projects, so it appears under both and not under the steam project.
  for (const projectId of ['project-skid', 'project-cooling']) assert.ok(archivedOrders(rows(s), { projectId }).some(o => o.id === order.id), projectId);
  assert.ok(!archivedOrders(rows(s), { projectId: 'project-steam' }).some(o => o.id === order.id));
  assert.deepEqual(archivedOrders(rows(s), { from: '2026-11-01', to: '2026-11-30' }).map(o => o.id), [order.id]);
  assert.equal(archivedOrders(rows(s), { from: '2026-11-03' }).length, 0);
  assert.match(dateRangeError('2026-11-05', '2026-11-01'), /not be after/); assert.equal(dateRangeError('2026-11-01', '2026-11-05'), ''); assert.equal(dateRangeError('', '2026-11-05'), '');
});

test('take-in assigns the supplier, logs every line and refuses over-receipt without changing anything', t => {
  const s = fixture(t);
  const order = orderRequirements(s, ['requirement-2', 'requirement-8']); const lines = s.list('order_lines').filter(l => l.orderId === order.id);
  const before = snapshot(s);
  assert.throws(() => runAction(s, 'receive', { orderId: order.id, warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 1 }] }, actor), /supplier/);
  assert.throws(() => runAction(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 1 }, { lineId: lines[1].id, quantity: 4.01 }] }, actor), /exceeds/);
  assert.throws(() => runAction(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 0 }] }, actor), /greater than zero/);
  assert.equal(snapshot(s), before, 'a refused take-in leaves no receipt, stock, movement, counter or audit entry');
  runAction(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', date: '2026-10-26', items: [{ lineId: lines[0].id, quantity: 4, chargeNo: 'TI-100' }, { lineId: lines[1].id, quantity: 1, chargeNo: 'TI-101' }] }, actor);
  const log = receiptLog(rows(s)).filter(e => e.order?.id === order.id);
  assert.equal(log.length, 2); assert.ok(log.every(e => e.supplierId === 'supplier-pipe' && Number(e.receipt.quantity) > 0 && e.receipt.correction === false));
  assert.equal(s.get('orders', order.id).supplierId, 'supplier-pipe'); assert.equal(s.get('orders', order.id).status, 'Partially received');
  assert.equal(siteStockOf(s, String(lines[0].materialId), 'site-north', 'TI-100'), 4, 'into the project site inventory, not the named storehouse');
  assert.equal(stockOf(s, String(lines[0].materialId), 'warehouse-main', 'TI-100'), 0);
  // No receiving storehouse is chosen: the order's project site decides.
  runAction(s, 'receive', { orderId: order.id, date: '2026-10-26', items: [{ lineId: lines[1].id, quantity: 1, chargeNo: 'TI-101' }] }, actor);
  assert.equal(siteStockOf(s, String(lines[1].materialId), 'site-north', 'TI-101'), 2);
  assert.equal(receiptLog(rows(s), { from: '2026-10-27' }).filter(e => e.order?.id === order.id).length, 0);
});

test('a correction needs a reason, is bounded by the delivery and cannot take stock below zero', t => {
  const s = fixture(t);
  const order = orderRequirements(s, ['requirement-2']); const line = s.list('order_lines').find(l => l.orderId === order.id)!;
  runAction(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', items: [{ lineId: line.id, quantity: 4, chargeNo: 'CORR-1' }] }, actor);
  assert.equal(s.get('orders', order.id).status, 'Received');
  const receipt = s.list('receipts').find(r => r.orderId === order.id)!; const material = String(line.materialId);
  const before = snapshot(s);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 1 }, actor), /reason/);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 4.5, note: 'Typed too much' }, actor), /Only 4 of this delivery/);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: -1, note: 'Negative input' }, actor), /greater than zero/);
  assert.equal(snapshot(s), before);
  // Stock that already left cannot be taken back: 3 of 4 leave the project site's inventory (charge CORR-1 first), so only 1 can be corrected.
  runAction(s, 'inventory-remove', { siteId: 'site-north', materialId: material, quantity: 3, comment: 'Used for a field repair' }, actor);
  assert.equal(siteStockOf(s, material, 'site-north', 'CORR-1'), 1);
  const issued = snapshot(s);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 2, note: 'Counted twice' }, actor), /Insufficient stock/);
  assert.equal(snapshot(s), issued, 'a refused correction rolls back completely');
  const result = runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 1, date: '2026-10-28', note: 'Counted twice' }, actor);
  assert.ok('record' in result && result.record); assert.equal(result.record!.quantity, -1); assert.equal(result.record!.correction, true); assert.equal(result.record!.correctsId, receipt.id);
  assert.equal(siteStockOf(s, material, 'site-north', 'CORR-1'), 0); assert.equal(Number(s.get('order_lines', line.id).received), 3);
  assert.equal(s.get('orders', order.id).status, 'Partially received'); assert.equal(receiptRemaining(rows(s), s.get('receipts', receipt.id)), 3);
  assert.ok(s.list('movements').some(m => m.type === 'Adjustment' && Number(m.quantity) === -1 && String(m.note).includes('Counted twice')));
  // The log keeps the negative entry; a correction cannot itself be corrected.
  const log = receiptLog(rows(s)).filter(e => e.order?.id === order.id); assert.deepEqual(log.map(e => Number(e.receipt.quantity)).sort((a, b) => a - b), [-1, 4]);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: result.record!.id, quantity: 1, note: 'Undo' }, actor), /Only a delivery/);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: 'missing', quantity: 1, note: 'x' }, actor), /not be found|required/);
});

test('a take back to zero returns the order to Pending, and custom materials stay out of the catalog', t => {
  const s = fixture(t); const catalogCount = s.list('materials').length;
  const added = runAction(s, 'add-iso-material', { isoId: 'iso-8', source: 'Custom', materialNo: 'PROC-BRACKET', description: 'Pipe support bracket, galvanized', uom: 'EA', quantity: 6 }, actor); assert.ok('record' in added && added.record);
  const order = orderRequirements(s, [added.record!.id]); const line = s.list('order_lines').find(l => l.orderId === order.id)!;
  runAction(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-field', items: [{ lineId: line.id, quantity: 6, chargeNo: 'BR-1' }] }, actor);
  const receipt = s.list('receipts').find(r => r.orderId === order.id)!; assert.equal(receipt.materialId, ''); assert.equal(receipt.customMaterialId, line.customMaterialId);
  runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 6, note: 'Delivered to the wrong site' }, actor);
  assert.equal(s.get('orders', order.id).status, 'Pending'); assert.equal(Number(s.get('order_lines', line.id).received), 0);
  assert.equal(s.list('materials').length, catalogCount);
  const entry = receiptLog(rows(s)).find(e => e.receipt.id === receipt.id)!; assert.equal(entry.material?.materialNo, 'PROC-BRACKET');
});

test('order status, quantity checks and CSV cells follow one explicit rule each', () => {
  assert.equal(orderStatus([]), 'Pending'); assert.equal(orderStatus([{ quantity: 4, received: 0 }]), 'Pending');
  assert.equal(orderStatus([{ quantity: 4, received: 1 }, { quantity: 2, received: 2 }]), 'Partially received'); assert.equal(orderStatus([{ quantity: 4, received: 4 }, { quantity: 2, received: 2 }]), 'Received');
  // Today rec.: more than ordered is accepted; a negative value takes back at most what the line received (here 2).
  assert.deepEqual(receiptQuantityErrors([{ lineId: 'a', received: 2, quantity: '' }, { lineId: 'b', received: 2, quantity: 12 }, { lineId: 'c', received: 2, quantity: -2 }, { lineId: 'd', received: 2, quantity: -2.5 }, { lineId: 'e', received: 2, quantity: 'x' }]), { d: 'At most 2 can be taken back.', e: 'Enter a number.' });
  assert.deepEqual(receiptItems({ a: '', b: '12', c: '-10', d: '0', e: 'x' }), [{ lineId: 'b', quantity: 12 }, { lineId: 'c', quantity: -10 }]);
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"'); assert.equal(csvCell('-5'), '-5'); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell(null), '');
  assert.equal(toCsv(['A', 'B'], [[1, 'x']]), 'A,B\r\n1,x');
});

test('the menu items open the four pages, each in MTO Pilot only, and the hosted profile delivers them without a table page', () => {
  const items = PILOT_MAP.mto.groups.find(g => g.title === 'Order / Take in')!.items;
  for (const [label, path] of [['Order materials', '/materials/order-materials'], ['Pending order', '/materials/pending-orders'], ['Material take in', '/materials/take-in'], ['Order archive', '/materials/order-archive']]) {
    assert.equal(pilotItemPath(items.find(item => item.label === label)!), path, label);
    assert.deepEqual(pagePilots(path), ['mto'], path);
    assert.ok(pageAvailable(hosted, `/mto${path}`, RESOURCES), path);
    assert.equal(pageAvailable(availabilityFor('welding-demo'), path, RESOURCES), false, `${path} stays out of other profiles`);
  }
  assert.deepEqual(PROCUREMENT_PAGES.map(page => page.scope), ['13', '14', '15', '17']);
  assert.equal(pageAvailable(hosted, '/mto/materials/orders', RESOURCES), false); assert.equal(pageAvailable(hosted, '/mto/materials/receipts', RESOURCES), false);
  for (const key of ['orders', 'order_lines', 'receipts', 'stock', 'suppliers', 'warehouses']) assert.ok(hosted.resources[key], key);
  assert.deepEqual(Object.keys(hosted.actions).filter(key => ['order-requirements', 'receive', 'correct-receipt'].includes(key)).sort(), ['correct-receipt', 'order-requirements', 'receive']);
  // Old databases: nothing but the new receipts table is needed, and every reference of it points at an existing table.
  const receipts = RESOURCES.find(r => r.key === 'receipts')!; for (const field of receipts.fields.filter(f => f.ref)) assert.ok(RESOURCES.some(r => r.key === field.ref), field.name);
  const user = (capabilities: Record<string, string[]>) => ({ id: 'u', name: 'U', email: 'u@example.test', profileId: 'p', availability: hosted, permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 }, capabilities } as unknown as User);
  assert.equal(canAction(user({ '15': ['show', 'insert'], '16': ['show'] }), 'correct-receipt'), false);
  assert.equal(canAction(user({ '15': ['show', 'insert'], '16': ['show', 'insert'] }), 'correct-receipt'), true);
  assert.equal(canAction(user({ '15': ['show', 'insert'], '16': ['show'] }), 'receive'), true);
  assert.equal(canAction(user({ '16': ['show', 'insert'] }), 'correct-receipt'), false);
  assert.equal(canAction(user({ '17': ['show', 'print'] }), 'assign-order-supplier'), true);
  assert.equal(canAction(user({ '17': ['show'] }), 'assign-order-supplier'), false);
  assert.ok(hosted.actions['assign-order-supplier'], 'assign-order-supplier is delivered');
});

// ----- wave 3: ordering and take-in as in the reference (pilots profile, runAction with hosted: true) -----------------------

const hostedRun = (s: Store, key: string, data: Record<string, unknown>) => { const result = runAction(s, key, data, actor, { hosted: true }); assert.ok('record' in result && result.record); return result.record!; };
const setOrderCounter = (s: Store, value: number) => s.db.prepare("INSERT INTO counters(key,value) VALUES ('PO',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
/** A catalog material of its own and requirements of it on isometrics of the North fabrication yard (iso-1, iso-2: project STX-2401). */
function bolts(s: Store, quantities: [string, number][], group = 'BOLTS A320-L43') {
  const material = s.create('materials', { materialNo: `8138${quantities.length}${group.length}`, description: 'BLT/N A320-L43 CTD 8UN 1000MM 4IN', materialGroup: group, articleNo: '100518128', uom: 'EA' }, actor);
  return { material, requirements: quantities.map(([isoId, quantity]) => s.create('iso_materials', { isoId, materialId: material.id, quantity }, actor)) };
}

test('mto-procurement-stock-021/013: ordering two isometrics\' lines of one material makes one merged order line, no supplier, ordered now', t => {
  const s = fixture(t); const { material, requirements: [a, b] } = bolts(s, [['iso-1', 3], ['iso-2', 10]]);
  const plan = orderPlanning(rows(s)).find(g => g.material.id === material.id)!; assert.equal(plan.quantity, 13); assert.deepEqual([...plan.requirementIds].sort(), [a.id, b.id].sort());
  const order = hostedRun(s, 'order-requirements', { requirementIds: plan.requirementIds, supplierId: 'supplier-steel' });
  const lines = s.list('order_lines').filter(l => l.orderId === order.id);
  assert.equal(lines.length, 1, 'one line per material'); assert.equal(Number(lines[0].quantity), 13); assert.equal(Number(lines[0].received), 0);
  assert.deepEqual(String(lines[0].requirementIds).split(',').sort(), [a.id, b.id].sort()); assert.equal(lines[0].requirementId, ''); assert.equal(lines[0].isoId, '', 'two isometrics');
  assert.equal(order.supplierId, '', 'a supplierId sent is ignored: the supplier is assigned in Order archive'); assert.equal(order.projectId, 'project-cooling'); assert.equal(order.status, 'Pending');
  assert.ok(order.orderedAt && !Number.isNaN(Date.parse(String(order.orderedAt)))); assert.equal(order.date, new Date().toISOString().slice(0, 10), 'dated today');
  // Ord.? Yes on both isometric lines: the merged 13 is given out in requirement order, 3 and 10.
  const execution = requirementExecution(rows(s)); assert.equal(execution.find(e => e.requirement.id === a.id)!.ordered, 3); assert.equal(execution.find(e => e.requirement.id === b.id)!.ordered, 10);
  assert.equal(execution.find(e => e.requirement.id === b.id)!.toOrder, 0);
  assert.ok(!orderPlanning(rows(s)).some(g => g.material.id === material.id), 'ordered rows drop out of Order materials');
  // Pending order shows the one line under both isometrics' project; the isometric filter finds it through the requirements.
  assert.equal(pendingLines(rows(s), { isoId: 'iso-2' }).filter(p => p.order.id === order.id).length, 1);
  // The full profile keeps its order line per requirement.
  const other = bolts(s, [['iso-1', 1], ['iso-2', 2]], 'BOLTS B7M');
  const full = orderRequirements(s, other.requirements.map(r => r.id)); assert.equal(s.list('order_lines').filter(l => l.orderId === full.id).length, 2);
});

test('mto-procurement-stock-015: order numbers continue the order counter as five digits; old PO-year numbers stay as stored', t => {
  const s = fixture(t);
  const old = s.list('orders').map(o => String(o.number)); assert.ok(old.length && old.every(n => /^PO-\d{4}-\d{4}$/.test(n)), 'sample orders keep their numbers');
  setOrderCounter(s, 6);
  const { requirements: [a] } = bolts(s, [['iso-1', 2]]); const { requirements: [b] } = bolts(s, [['iso-2', 4]], 'PIPE 316');
  assert.equal(hostedRun(s, 'order-requirements', { requirementIds: [a.id] }).number, '00007');
  assert.equal(hostedRun(s, 'order-requirements', { requirementIds: [b.id] }).number, '00008');
  assert.deepEqual(s.list('orders').filter(o => old.includes(String(o.number))).map(o => String(o.number)).sort(), [...old].sort());
});

test('mto-procurement-stock-016: quantity to order = Σ not-ordered need − Σ (ordered − received) of open order lines of the material; a fully received line is not netted', t => {
  const s = fixture(t); const { material, requirements: [first] } = bolts(s, [['iso-1', 3]]);
  const order = hostedRun(s, 'order-requirements', { requirementIds: [first.id] });
  const line = s.list('order_lines').find(l => l.orderId === order.id)!; assert.equal(Number(line.quantity), 3);
  const later = s.create('iso_materials', { isoId: 'iso-2', materialId: material.id, quantity: 16 }, actor);
  // 16 not ordered − (3 ordered − 0 received) = 13, as the reference shows for 8138268881.
  let plan = orderPlanning(rows(s)).find(g => g.material.id === material.id)!;
  assert.deepEqual([plan.need, plan.outstanding, plan.quantity], [16, 3, 13]); assert.deepEqual(plan.requirementIds, [later.id]);
  // 1 received: outstanding 2, quantity 14.
  hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', items: [{ lineId: line.id, quantity: 1 }] });
  plan = orderPlanning(rows(s)).find(g => g.material.id === material.id)!; assert.deepEqual([plan.need, plan.outstanding, plan.quantity], [16, 2, 14]);
  // Fully received (and over-received): the line is not netted, the full 16 is shown.
  hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', items: [{ lineId: line.id, quantity: 3 }] });
  plan = orderPlanning(rows(s)).find(g => g.material.id === material.id)!; assert.deepEqual([plan.need, plan.outstanding, plan.quantity], [16, 0, 16]);
  // An open order covering the need hides the row and refuses to order it again.
  const covering = hostedRun(s, 'order-requirements', { requirementIds: [later.id] }); assert.equal(Number(s.list('order_lines').find(l => l.orderId === covering.id)!.quantity), 16);
  const another = s.create('iso_materials', { isoId: 'iso-1', materialId: material.id, quantity: 5 }, actor);
  assert.ok(!orderPlanning(rows(s)).some(g => g.material.id === material.id), '5 − 16 open is below zero: nothing to order');
  assert.throws(() => hostedRun(s, 'order-requirements', { requirementIds: [another.id] }), /Open orders already cover/);
});

test('mto-procurement-stock-017/018: receiving 12 on an order line of 10 is accepted, as is −10; the figures of the line, Pending order and the inventory', t => {
  const s = fixture(t); const { material, requirements: [req] } = bolts(s, [['iso-1', 10]]);
  const order = hostedRun(s, 'order-requirements', { requirementIds: [req.id] }); const line = s.list('order_lines').find(l => l.orderId === order.id)!;
  const inventory = () => s.list('stock').filter(r => r.locationKind === 'site' && r.siteId === 'site-north' && r.materialId === material.id).reduce((sum, r) => sum + Number(r.quantity), 0);
  const state = () => { const l = s.get('order_lines', line.id); return { ordered: Number(l.quantity), received: Number(l.received), pending: pendingLines(rows(s)).filter(p => p.line.id === line.id).map(p => p.outstanding)[0] ?? 0, inventory: inventory(), status: s.get('orders', order.id).status }; };
  assert.deepEqual(state(), { ordered: 10, received: 0, pending: 10, inventory: 0, status: 'Pending' });
  // +12: received 0 + 12 = 12 > 10 ordered; outstanding max(0, 10 − 12) = 0 so it leaves Pending order; inventory 0 + 12 = 12.
  hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', items: [{ lineId: line.id, quantity: 12 }] });
  assert.deepEqual(state(), { ordered: 10, received: 12, pending: 0, inventory: 12, status: 'Received' });
  // A Received order can still be chosen and taken in: −10 gives received 12 − 10 = 2, outstanding 8, inventory 12 − 10 = 2.
  assert.ok(receivableOrders(rows(s)).some(o => o.id === order.id));
  hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', items: [{ lineId: line.id, quantity: -10 }] });
  assert.deepEqual(state(), { ordered: 10, received: 2, pending: 8, inventory: 2, status: 'Partially received' });
  const log = receiptLog(rows(s)).filter(e => e.order?.id === order.id);
  assert.deepEqual(log.map(e => Number(e.receipt.quantity)).sort((x, y) => x - y), [-10, 12]); assert.ok(log.every(e => e.supplierId === 'supplier-pipe' && e.receipt.takenAt));
  assert.equal(log.find(e => Number(e.receipt.quantity) < 0)!.receipt.correction, true);
  assert.ok(s.list('movements').some(m => m.siteId === 'site-north' && m.materialId === material.id && m.type === 'Adjustment' && Number(m.quantity) === -10));
  // Refused without a trace: taking back more than received (2), a zero, a cancelled order.
  const before = snapshot(s);
  assert.throws(() => hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', items: [{ lineId: line.id, quantity: -3 }] }), /Only 2 of this line can be taken back/);
  assert.throws(() => hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', items: [{ lineId: line.id, quantity: 0 }] }), /other than zero/);
  assert.throws(() => hostedRun(s, 'receive', { orderId: order.id, items: [{ lineId: line.id, quantity: 1 }] }), /supplier/);
  assert.equal(snapshot(s), before);
  // Stock already used cannot be taken back: 2 leave the site, then −2 is refused and nothing changes.
  runAction(s, 'inventory-remove', { siteId: 'site-north', materialId: material.id, quantity: 2, comment: 'Used' }, actor);
  const used = snapshot(s);
  assert.throws(() => hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', items: [{ lineId: line.id, quantity: -2 }] }), /Insufficient stock/);
  assert.equal(snapshot(s), used);
  // The order's own supplier is never filled from a take-in.
  assert.equal(s.get('orders', order.id).supplierId, '');
});

test('mto-procurement-stock-019: assign-supplier sets the order\'s supplier; a receipt with another supplier does not change it', t => {
  const s = fixture(t); const { requirements: [req] } = bolts(s, [['iso-1', 4]]);
  const order = hostedRun(s, 'order-requirements', { requirementIds: [req.id] }); const line = s.list('order_lines').find(l => l.orderId === order.id)!;
  assert.throws(() => hostedRun(s, 'assign-order-supplier', { orderId: order.id, supplierId: '' }), /Choose a supplier/);
  assert.equal(hostedRun(s, 'assign-order-supplier', { orderId: order.id, supplierId: 'supplier-steel' }).supplierId, 'supplier-steel');
  hostedRun(s, 'receive', { orderId: order.id, supplierId: 'supplier-pipe', items: [{ lineId: line.id, quantity: 4 }] });
  assert.equal(s.get('orders', order.id).supplierId, 'supplier-steel');
  assert.equal(receiptLog(rows(s)).find(e => e.order?.id === order.id)!.supplierId, 'supplier-pipe', 'the log shows the take-in supplier');
  assert.equal(supplierChoiceText({ id: 'x', name: 'PFF BV', residence: 'Klundert' } as unknown as Row), 'PFF BV Klundert');
});

test('mto-procurement-stock-014: the order PDF model lists one line per material with the reference columns and the order number', t => {
  const s = fixture(t); setOrderCounter(s, 6);
  s.update('isometrics', 'iso-1', { pipingClass: 'A1' }, s.get('isometrics', 'iso-1')._version, actor);
  const { material, requirements } = bolts(s, [['iso-1', 3], ['iso-2', 10]]);
  const order = hostedRun(s, 'order-requirements', { requirementIds: requirements.map(r => r.id) });
  const model = orderDocumentModel(rows(s), order.id, new Set(['project-cooling']))!;
  assert.deepEqual(ORDER_COLUMNS, ['Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Piping class', 'Description', 'Quantity', 'UOM']);
  assert.equal(model.number, '00007'); assert.deepEqual(model.items.map(i => i.label), ['Home location', 'Address', 'Phone', 'Order number']);
  assert.deepEqual(model.items.map(i => i.value), ['North fabrication yard', '18 Foundry Road, 3089 Rotterdam', '+31 10 555 0142', '00007']);
  assert.equal(model.lines.length, 1);
  const pipingClasses = [...new Set(['iso-1', 'iso-2'].map(id => String(s.get('isometrics', id).pipingClass || '')).filter(Boolean))].sort();
  assert.deepEqual(model.lines[0].filter((_, n) => n !== 5), ['BOLTS A320-L43', '100518128', String(material.materialNo), '', '', 'BLT/N A320-L43 CTD 8UN 1000MM 4IN', '13', 'EA']);
  assert.deepEqual(model.lines[0][5].split(', ').sort(), pipingClasses, 'the piping classes of both isometrics');
  // An older order made per requirement is merged per material in the document too; an order outside the pilot's projects is not printed.
  const older = orderRequirements(s, bolts(s, [['iso-1', 1], ['iso-2', 2.5]], 'GASKETS').requirements.map(r => r.id));
  assert.equal(s.list('order_lines').filter(l => l.orderId === older.id).length, 2);
  assert.deepEqual(orderDocumentModel(rows(s), older.id, new Set(['project-cooling']))!.lines.map(line => line[7]), ['3.5']);
  assert.equal(orderDocumentModel(rows(s), order.id, new Set(['project-steam'])), null);
});

test('mto-procurement-stock-026/020: take-in and order moments, the archive default range and its sort', t => {
  assert.equal(printMoment({ date: '2025-11-06', time: '07:43' }), '06.11.2025 07:43');
  assert.equal(printMoment({ date: '2025-11-06', time: '07:42' }, true), '06.11.2025. 07:42');
  assert.equal(printMoment(momentOf('2026-10-23', '')), '23.10.2026', 'an older receipt without a time shows its date');
  const local = new Date(2025, 10, 6, 7, 43); assert.deepEqual(momentOf('2025-11-06', local.toISOString()), { date: '2025-11-06', time: '07:43' });
  assert.equal(printMoment(receiptMoment({ id: 'r', date: '2025-11-06', takenAt: local.toISOString() } as unknown as Row)), '06.11.2025 07:43');
  assert.equal(orderChoiceText({ id: 'o', number: '00007', date: '2025-11-06', orderedAt: new Date(2025, 10, 6, 7, 42).toISOString() } as unknown as Row), '00007 | 06.11.2025. 07:42');
  // Opened on 16.11.2026: From 17.10.2026, To 30.11.2026 (the reference menu link).
  assert.deepEqual(archiveDefaultRange('2026-11-16'), { from: '2026-10-17', to: '2026-11-30' });
  assert.deepEqual(archiveDefaultRange('2026-03-15'), { from: '2026-02-13', to: '2026-03-31' });
  const s = fixture(t);
  const desc = archivedOrders(rows(s)).map(o => o.id), asc = archivedOrders(rows(s), {}, 'asc').map(o => o.id);
  assert.ok(desc.length > 1); assert.deepEqual(asc, [...desc].reverse());
});

test('mto-procurement-stock-033/011: Order materials rows are sorted by Material group; the Order / Take in menu has no Isometric materials', t => {
  const s = fixture(t);
  bolts(s, [['iso-1', 2]], 'PIPE 316'); bolts(s, [['iso-1', 2]], 'BOLTS B16'); bolts(s, [['iso-1', 2]], 'BOLTS A320-L7');
  const groups = orderPlanning(rows(s)).map(g => String(g.material.materialGroup ?? ''));
  assert.deepEqual(groups, [...groups].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
  assert.ok(groups.indexOf('BOLTS A320-L7') < groups.indexOf('BOLTS B16') && groups.indexOf('BOLTS B16') < groups.indexOf('PIPE 316'));
  const items = PILOT_MAP.mto.groups.find(g => g.title === 'Order / Take in')!.items.map(item => item.label);
  assert.deepEqual(items, ['Order materials', 'Pending order', 'Material take in', 'Material inventory', 'Materials list', 'Order archive', 'Certifications']);
  // The full profile keeps the generic Isometric materials page that Material execution links to.
  assert.equal(pageAvailable(availabilityFor('full'), '/materials/iso_materials', RESOURCES), true);
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-procurement-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  const signIn = async (name: string, profileFields: Record<string, unknown>) => {
    const profile = store.create('profiles', { name, ...profileFields });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    cookie = ''; const response = await request('/api/auth/login', 'POST', { email: user.email, password }); assert.equal(response.status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Procurement admin', email: 'procurement-admin@example.test', password })).status, 201) };
}
const detailed = (rules: Record<string, string[]>) => ({ permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules) });
/** Areas an MTO account needs to open the isometric workspace and read the procurement records. */
const BASE_RULES = { '4': ['show'], '5': ['show'], '6': ['show'], '12': ['show'], '64': ['show'], '70': ['show'], '75': ['show'], '13': ['show', 'print'], '14': ['show'], '17': ['show', 'print'] };

test('through the hosted API: order, take in, over-receipt, correction and the audit trail work in MTO Pilot only', async t => {
  const f = await hostedFixture(t); await f.setup();
  // Order checked materials -> one order with a five-digit number, no supplier (a supplierId sent is ignored).
  const ordered = await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-2', 'requirement-8'], supplierId: 'supplier-steel' });
  assert.equal(ordered.status, 201); const order = (await ordered.json()).record as Row; assert.match(String(order.number), /^\d{5}$/); assert.equal(order.supplierId, ''); assert.ok(order.orderedAt, 'ordered now: the time is kept');
  assert.equal((await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-2'], date: '2026-10-29' })).status, 409, 'already fully ordered');
  const data = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  const lines = data.rows.order_lines.filter(l => l.orderId === order.id); assert.equal(lines.length, 2, 'two different materials: two lines');
  for (const key of ['orders', 'order_lines', 'receipts', 'suppliers', 'warehouses']) assert.ok(data.rows[key], key);
  // The order document of the new order opens (GET, as the new tab does).
  const pdf = await f.request(`/api/pdf/order-materials?orderId=${order.id}`); assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(String(pdf.headers.get('content-disposition')), new RegExp(`_R${order.number}-OrderMaterial\\.pdf`));
  assert.equal((await f.request('/api/pdf/order-materials?orderId=missing')).status, 404);
  // Taking back more than received is refused, nothing is recorded.
  const back = await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', items: [{ lineId: lines[0].id, quantity: -1 }] });
  assert.equal(back.status, 409); assert.equal(f.store.list('receipts').filter(r => r.orderId === order.id).length, 0);
  // Unknown fields are refused by the delivered action.
  assert.equal((await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 1 }], status: 'Received' })).status, 404);
  // More than ordered is accepted (4 ordered, 6 received on the first line).
  const received = await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', items: lines.map((l, n) => ({ lineId: l.id, quantity: Number(l.quantity) + (n ? 0 : 2) })) });
  assert.equal(received.status, 201);
  assert.equal(Number(f.store.get('order_lines', lines[0].id).received), Number(lines[0].quantity) + 2); assert.equal(f.store.get('orders', order.id).status, 'Received'); assert.equal(f.store.get('orders', order.id).supplierId, '', 'the take-in supplier stays on the receipt');
  const log = (await (await f.request('/api/records/receipts')).json()).rows as Row[]; const mine = log.filter(r => r.orderId === order.id); assert.equal(mine.length, 2); assert.ok(mine.every(r => r.supplierId === 'supplier-steel' && r.takenAt));
  // Order archive: assign the order to a supplier.
  assert.equal((await f.request('/api/actions/assign-order-supplier', 'POST', { orderId: order.id, supplierId: 'supplier-pipe' })).status, 201); assert.equal(f.store.get('orders', order.id).supplierId, 'supplier-pipe');
  // Correction: reason required (422), then recorded (201), then visible in the log and in the order's audit trail.
  assert.equal((await f.request('/api/actions/correct-receipt', 'POST', { receiptId: mine[0].id, quantity: 1, date: '2026-10-31', note: '' })).status, 422);
  const corrected = await f.request('/api/actions/correct-receipt', 'POST', { receiptId: mine[0].id, quantity: 1, date: '2026-10-31', note: 'Short delivery found at count' }); assert.equal(corrected.status, 201);
  assert.equal(Number(((await corrected.json()).record as Row).quantity), -1);
  const history = await (await f.request(`/api/history/orders/${order.id}`)).json() as { events: { summary: string }[] }; assert.ok(history.events.length >= 2, 'created and updated');
  // The pilot boundary: Weld Pilot refuses every one of these, even for the same administrator.
  f.usePilot('weld');
  for (const key of ['orders', 'order_lines', 'receipts']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  assert.equal((await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 1 }] })).status, 403);
  assert.equal((await f.request('/api/actions/correct-receipt', 'POST', { receiptId: mine[0].id, quantity: 1, note: 'No' })).status, 403);
  assert.equal((await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-5'] })).status, 403);
  assert.equal((await f.request('/api/actions/assign-order-supplier', 'POST', { orderId: order.id, supplierId: 'supplier-steel' })).status, 403);
  assert.equal((await f.request(`/api/pdf/order-materials?orderId=${order.id}`)).status, 403);
  assert.equal(((await (await f.request('/api/bootstrap')).json()) as { rows: Record<string, Row[]> }).rows.receipts, undefined);
});

test('through the hosted API: receiving and correcting need different rights, and each page area gates its own records', async t => {
  const f = await hostedFixture(t); await f.setup();
  const first = await (await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-2'], date: '2026-10-29' })).json(); const order = first.record as Row;
  const line = f.store.list('order_lines').find(l => l.orderId === order.id)!;
  // A receiving clerk: add on take-in, view-only inventory.
  await f.signIn('Receiving clerk', detailed({ ...BASE_RULES, '15': ['show', 'insert'], '16': ['show'] }));
  assert.equal((await f.request('/api/records/receipts')).status, 200); assert.equal((await f.request('/api/records/orders')).status, 200);
  assert.equal((await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', items: [{ lineId: line.id, quantity: 3, chargeNo: 'CLERK' }] })).status, 201);
  const receipt = f.store.list('receipts').find(r => r.orderId === order.id)!;
  assert.equal((await f.request('/api/actions/correct-receipt', 'POST', { receiptId: receipt.id, quantity: 1, note: 'Not allowed' })).status, 403);
  assert.equal(f.store.list('receipts').filter(r => r.orderId === order.id).length, 1);
  // A stock controller may also add to inventory, so a correction is allowed.
  await f.signIn('Stock controller', detailed({ ...BASE_RULES, '15': ['show', 'insert'], '16': ['show', 'insert'] }));
  const fix = await f.request('/api/actions/correct-receipt', 'POST', { receiptId: receipt.id, quantity: 1, note: 'One damaged piece sent back' }); assert.equal(fix.status, 201, JSON.stringify(await fix.json()));
  // Someone who only sees Pending order reads orders but not the take-in log and cannot receive or order.
  await f.signIn('Pending viewer', detailed({ ...BASE_RULES, '13': [], '17': [], '14': ['show'] }));
  assert.equal((await f.request('/api/records/orders')).status, 200); assert.equal((await f.request('/api/records/receipts')).status, 403);
  assert.equal((await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', items: [{ lineId: line.id, quantity: 1 }] })).status, 403);
  assert.equal((await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-8'] })).status, 403);
  // Assigning the supplier and printing the order need the print right of Order archive (17) or, for the PDF, of Order materials (13).
  assert.equal((await f.request('/api/actions/assign-order-supplier', 'POST', { orderId: order.id, supplierId: 'supplier-pipe' })).status, 403);
  assert.equal((await f.request(`/api/pdf/order-materials?orderId=${order.id}`)).status, 403);
  await f.signIn('Archive clerk', detailed({ ...BASE_RULES, '13': [], '17': ['show', 'print'] }));
  assert.equal((await f.request(`/api/pdf/order-materials?orderId=${order.id}`)).status, 200);
  assert.equal((await f.request('/api/actions/assign-order-supplier', 'POST', { orderId: order.id, supplierId: 'supplier-pipe' })).status, 201);
  assert.equal(f.store.get('orders', order.id).supplierId, 'supplier-pipe');
  // Someone with no procurement areas sees none of it.
  await f.signIn('Isometric viewer', detailed({ '4': ['show'], '5': ['show'], '64': ['show'], '70': ['show'] }));
  for (const key of ['orders', 'order_lines', 'receipts']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  const body = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> }; for (const key of ['orders', 'order_lines', 'receipts']) assert.equal(body.rows[key], undefined, key);
  assert.equal((await f.request('/mto/materials/take-in')).status, 200, 'the page shell is served; the page itself shows its no-access state');
});

// ----- wave 3 integration (E4): a requirement on a merged order line is ordered -------------------------------------------
test('E4: a requirement named only by a line merged per material cannot be deleted, and the dashboard gives that line\'s open quantity to its own requirements', async t => {
  const { allocateOpenOrders } = await import('../shared/mto-dashboard.ts');
  const { requirementOrderLines, materialIdentity } = await import('../shared/materials.ts');
  const s = fixture(t); s.hostedRules = true;
  const { material, requirements: [a, b] } = bolts(s, [['iso-1', 12], ['iso-2', 5]]);
  const third = s.create('iso_materials', { isoId: 'iso-1', materialId: material.id, quantity: 4 }, actor);
  // One merged line of 12 for a and b: in requirement order a takes all 12, so b has nothing ordered, but it is on the order; the third line is not.
  const order = s.create('orders', { number: '00090', projectId: 'project-cooling', status: 'Pending', date: '2026-11-01' }, actor);
  s.create('order_lines', { orderId: order.id, materialId: material.id, quantity: 12, received: 0, requirementId: '', isoId: '', requirementIds: `${a.id},${b.id}` }, actor);
  assert.deepEqual([a, b, third].map(r => requirementOrderLines(rows(s), r.id).length), [1, 1, 0], 'one rule names the merged line for both requirements');
  assert.equal(requirementExecution(rows(s)).find(e => e.requirement.id === b.id)!.ordered, 0, 'b gets nothing of the 12');
  // Delete: refused for b (nothing stored), allowed for the third line.
  assert.throws(() => runAction(s, 'archive-iso-materials', { requirementIds: [b.id] }, actor, { hosted: true }), (error: { status?: number }) => error.status === 409);
  assert.equal(s.get('iso_materials', b.id)._archived, false);
  runAction(s, 'archive-iso-materials', { requirementIds: [third.id] }, actor, { hosted: true });
  assert.equal(s.get('iso_materials', third.id, true)._archived, true);
  // Dashboard: another line of the same material and project short 4 (listed first), a short 10, b short 5; the merged line has 12 open.
  const identity = materialIdentity({ materialId: material.id } as unknown as Row);
  const line = (requirementId: string, isoId: string, shortage: number) => ({ requirementId, isoId, identity, shortage, blockingBackorder: 0, notOrdered: 0, openLinked: 0, openExtra: 0 }) as unknown as Parameters<typeof allocateOpenOrders>[1][number];
  const lines = [line('other', 'iso-1', 4), line(a.id, 'iso-1', 10), line(b.id, 'iso-2', 5)];
  allocateOpenOrders(rows(s), lines, () => 'project-cooling');
  assert.deepEqual(lines.map(item => [item.blockingBackorder, item.notOrdered]), [[0, 4], [10, 0], [2, 3]], 'the merged line blocks its own requirements (a 10, then b 2), not another line of its project');
});
