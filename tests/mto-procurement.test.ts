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
import { PROCUREMENT_PAGES, archivedOrders, csvCell, dateRangeError, orderPlanning, orderStatus, pendingLines, receiptLog, receiptQuantityErrors, receiptRemaining, toCsv } from '../shared/mto-procurement.ts';
import type { Row, User } from '../shared/types.ts';

const actor = { id: 'procurement-test', name: 'Procurement test' };
const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
function fixture(t: { after: (fn: () => void) => void }) { const s = new Store(':memory:'); seed(s); t.after(() => s.close()); return s; }
const rows = (s: Store) => Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key, true)])) as Record<string, Row[]>;
const snapshot = (s: Store) => JSON.stringify({ rows: rows(s), audit: s.activity(10000), counters: s.db.prepare('SELECT * FROM counters ORDER BY key').all() });
const orderRequirements = (s: Store, requirementIds: string[], extra: Record<string, unknown> = {}) => { const result = runAction(s, 'order-requirements', { requirementIds, date: '2026-10-25', ...extra }, actor); assert.ok('record' in result && result.record); return result.record!; };
const stockOf = (s: Store, materialId: string, warehouseId: string, chargeNo: string) => Number(s.list('stock').find(r => r.materialId === materialId && r.warehouseId === warehouseId && (r.chargeNo || '') === chargeNo)?.quantity ?? 0);

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
  assert.equal(stockOf(s, String(lines[0].materialId), 'warehouse-main', 'TI-100'), 4);
  // A single receiving storehouse is optional only when the choice is unambiguous.
  assert.throws(() => runAction(s, 'receive', { orderId: order.id, items: [{ lineId: lines[1].id, quantity: 1 }] }, actor), /storehouse/);
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
  // Stock that was already issued cannot be taken back: 3 of 4 leave the storehouse, so only 1 can be corrected.
  runAction(s, 'issue-material', { isoId: 'iso-2', requirementId: 'requirement-2', materialId: material, warehouseId: 'warehouse-main', chargeNo: 'CORR-1', quantity: 3 }, actor);
  const issued = snapshot(s);
  assert.throws(() => runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 2, note: 'Counted twice' }, actor), /Insufficient stock/);
  assert.equal(snapshot(s), issued, 'a refused correction rolls back completely');
  const result = runAction(s, 'correct-receipt', { receiptId: receipt.id, quantity: 1, date: '2026-10-28', note: 'Counted twice' }, actor);
  assert.ok('record' in result && result.record); assert.equal(result.record!.quantity, -1); assert.equal(result.record!.correction, true); assert.equal(result.record!.correctsId, receipt.id);
  assert.equal(stockOf(s, material, 'warehouse-main', 'CORR-1'), 0); assert.equal(Number(s.get('order_lines', line.id).received), 3);
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
  assert.deepEqual(receiptQuantityErrors([{ lineId: 'a', outstanding: 4, quantity: '' }, { lineId: 'b', outstanding: 4, quantity: 4 }, { lineId: 'c', outstanding: 4, quantity: 4.5 }, { lineId: 'd', outstanding: 4, quantity: -1 }]), { c: 'At most 4 can be received.', d: 'Enter a quantity of zero or more.' });
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
  // Order checked materials -> one order with a running number.
  const ordered = await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-2', 'requirement-8'], date: '2026-10-29', note: 'Hosted order' });
  assert.equal(ordered.status, 201); const order = (await ordered.json()).record as Row; assert.match(String(order.number), /^PO-/);
  assert.equal((await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-2'], date: '2026-10-29' })).status, 409, 'already fully ordered');
  const data = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  const lines = data.rows.order_lines.filter(l => l.orderId === order.id); assert.equal(lines.length, 2);
  for (const key of ['orders', 'order_lines', 'receipts', 'suppliers', 'warehouses']) assert.ok(data.rows[key], key);
  // Over-receipt is refused, nothing is recorded.
  const over = await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', date: '2026-10-30', note: '', items: [{ lineId: lines[0].id, quantity: 99 }] });
  assert.equal(over.status, 409); assert.equal(f.store.list('receipts').filter(r => r.orderId === order.id).length, 0);
  // Unknown fields are refused by the delivered action.
  assert.equal((await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', items: [{ lineId: lines[0].id, quantity: 1 }], status: 'Received' })).status, 404);
  const received = await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', date: '2026-10-30', note: 'Dock 2', items: lines.map(l => ({ lineId: l.id, quantity: Number(l.quantity), chargeNo: 'API-HEAT' })) });
  assert.equal(received.status, 201);
  const log = (await (await f.request('/api/records/receipts')).json()).rows as Row[]; const mine = log.filter(r => r.orderId === order.id); assert.equal(mine.length, 2); assert.ok(mine.every(r => r.supplierId === 'supplier-steel'));
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
  // Someone with no procurement areas sees none of it.
  await f.signIn('Isometric viewer', detailed({ '4': ['show'], '5': ['show'], '64': ['show'], '70': ['show'] }));
  for (const key of ['orders', 'order_lines', 'receipts']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  const body = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> }; for (const key of ['orders', 'order_lines', 'receipts']) assert.equal(body.rows[key], undefined, key);
  assert.equal((await f.request('/mto/materials/take-in')).status, 200, 'the page shell is served; the page itself shows its no-access state');
});
