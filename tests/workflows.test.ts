import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError, positive, validDate } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction, weldLength } from '../server/workflows.ts';
import { summary } from '../shared/metrics.ts';
import { RESOURCES } from '../shared/resources.ts';
const actor = { id: 'test-actor', name: 'Test operator' };
function fixture(t: {after: (fn: () => void) => void}) { const s = new Store(':memory:'); seed(s); t.after(() => s.close()); return s; }
const snapshot = (s: Store) => JSON.stringify({ rows: Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key, true)])), audit: s.activity(10000), counters: s.db.prepare('SELECT * FROM counters ORDER BY key').all() });
const toolQty = (s: Store, articleId: string, warehouseId = 'warehouse-main') => Number(s.list('tool_stock').find(r => r.articleId === articleId && r.warehouseId === warehouseId)?.quantity || 0);
const materialQty = (s: Store, materialId: string, warehouseId: string, chargeNo: string) => Number(s.list('stock').find(r => r.materialId === materialId && r.warehouseId === warehouseId && r.chargeNo === chargeNo)?.quantity || 0);

test('seed is idempotent and local records persist across reopening the database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stelux-persistence-')); const filename = join(dir, 'test.sqlite');
  try { let s = new Store(filename); seed(s); const count = s.list('welds').length; s.create('sites', { name: 'Persistent test site' }, actor); s.close(); s = new Store(filename); seed(s); assert.equal(s.list('welds').length, count); assert.ok(s.list('sites').some(r => r.name === 'Persistent test site')); s.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('partial receipt updates only the delivered line, balances, and order state', t => {
  const s = fixture(t); const order = s.list('orders').find(o => o.status === 'Pending')!; const lines = s.list('order_lines').filter(l => l.orderId === order.id); const line = lines[0];
  runAction(s, 'receive', { orderId: order.id, warehouseId: 'warehouse-field', items: [{ lineId: line.id, quantity: 2.5, chargeNo: 'HEAT-X' }], date: '2026-10-21' }, actor);
  assert.equal(s.get('orders', order.id).status, 'Partially received'); assert.equal(s.get('order_lines', line.id).received, 2.5); assert.equal(materialQty(s, String(line.materialId), 'warehouse-field', 'HEAT-X'), 2.5); assert.equal(s.get('order_lines', lines[1].id).received, 0);
  const remaining = lines.map(l => ({ lineId: l.id, quantity: Number(l.quantity) - Number(s.get('order_lines', l.id).received), chargeNo: 'HEAT-X' }));
  runAction(s, 'receive', { orderId: order.id, warehouseId: 'warehouse-field', items: remaining, date: '2026-10-21' }, actor); assert.equal(s.get('orders', order.id).status, 'Received');
  assert.throws(() => runAction(s, 'receive', { orderId: order.id, warehouseId: 'warehouse-field', items: [{ lineId: line.id, quantity: 1 }] }, actor), /no outstanding/);
});
test('a bad second receipt line rolls back the first line, stock, counters, and audit events', t => {
  const s = fixture(t); const order = s.list('orders').find(o => o.status === 'Pending')!; const lines = s.list('order_lines').filter(l => l.orderId === order.id); const before = snapshot(s);
  assert.throws(() => runAction(s, 'receive', { orderId: order.id, warehouseId: 'warehouse-field', items: [{ lineId: lines[0].id, quantity: 1 }, { lineId: lines[1].id, quantity: 999999 }] }, actor), /outstanding/); assert.equal(snapshot(s), before);
});
test('receiving rejects duplicate lines, lines from another order, and invalid dates without mutation', t => {
  const s = fixture(t); const orders = s.list('orders'); const a = s.list('order_lines').find(l => l.orderId === orders[0].id)!; const b = s.list('order_lines').find(l => l.orderId === orders[1].id)!; const before = snapshot(s);
  assert.throws(() => runAction(s, 'receive', { orderId: orders[0].id, warehouseId: 'warehouse-main', items: [{ lineId: b.id, quantity: 1 }] }, actor), /belong/);
  assert.throws(() => runAction(s, 'receive', { orderId: orders[0].id, warehouseId: 'warehouse-main', items: [{ lineId: a.id, quantity: 1 }, { lineId: a.id, quantity: 1 }] }, actor), /once/);
  assert.throws(() => runAction(s, 'receive', { orderId: orders[0].id, warehouseId: 'warehouse-main', date: '2026-02-30', items: [{ lineId: a.id, quantity: 1 }] }, actor), /valid date/); assert.equal(snapshot(s), before);
});
test('material transfer conserves fractional quantities and heat-number separation', t => {
  const s = fixture(t); const original = materialQty(s, 'material-1', 'warehouse-main', 'H-1042'); const otherHeat = materialQty(s, 'material-1', 'warehouse-main', 'H-1043');
  runAction(s, 'transfer-material', { materialId: 'material-1', fromId: 'warehouse-main', toId: 'warehouse-field', chargeNo: 'H-1042', quantity: 1.125 }, actor);
  assert.equal(materialQty(s, 'material-1', 'warehouse-main', 'H-1042'), original - 1.125); assert.equal(materialQty(s, 'material-1', 'warehouse-field', 'H-1042'), 1.125); assert.equal(materialQty(s, 'material-1', 'warehouse-main', 'H-1043'), otherHeat);
  const before = snapshot(s); assert.throws(() => runAction(s, 'transfer-material', { materialId: 'material-1', fromId: 'warehouse-main', toId: 'warehouse-field', quantity: 100000, chargeNo: 'H-1042' }, actor), /Insufficient/); assert.equal(snapshot(s), before);
});
test('issuing material creates a linked pick list and prevents negative inventory', t => {
  const s = fixture(t); const available = materialQty(s, 'material-2', 'warehouse-main', 'H-1042');
  const result = runAction(s, 'issue-material', { isoId: 'iso-2', materialId: 'material-2', warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: 3 }, actor);
  assert.equal(materialQty(s, 'material-2', 'warehouse-main', 'H-1042'), available - 3); assert.ok('record' in result && result.record?.isoId === 'iso-2');
  const before = snapshot(s); assert.throws(() => runAction(s, 'issue-material', { isoId: 'iso-2', materialId: 'material-2', warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: available }, actor), /Insufficient/); assert.equal(snapshot(s), before);
});
test('rent, partial return, final return, and excess-return rejection conserve stock', t => {
  const s = fixture(t); const original = toolQty(s, 'article-4'); const result = runAction(s, 'rent', { articleId: 'article-4', warehouseId: 'warehouse-main', clientId: 'client-1', quantity: 3, date: '2026-10-21' }, actor); assert.ok('record' in result && result.record); const id = result.record!.id;
  assert.equal(toolQty(s, 'article-4'), original - 3); runAction(s, 'return', { rentalId: id, quantity: 1, date: '2026-10-21' }, actor); assert.equal(s.get('rentals', id).status, 'Partially returned'); assert.equal(toolQty(s, 'article-4'), original - 2);
  runAction(s, 'return', { rentalId: id, quantity: 2, date: '2026-10-21' }, actor); assert.equal(s.get('rentals', id).status, 'Returned'); assert.equal(toolQty(s, 'article-4'), original);
  const before = snapshot(s); assert.throws(() => runAction(s, 'return', { rentalId: id, quantity: 1 }, actor), /outstanding/); assert.equal(snapshot(s), before);
});
test('consumables cannot be returned as loans and tool quantities must be whole', t => {
  const s = fixture(t); const consumed = s.list('rentals').find(r => r.status === 'Consumed')!; const before = snapshot(s);
  assert.throws(() => runAction(s, 'return', { rentalId: consumed.id, quantity: 1 }, actor), /Consumable/);
  assert.throws(() => runAction(s, 'rent', { articleId: 'article-1', warehouseId: 'warehouse-main', clientId: 'client-1', quantity: 0.5 }, actor), /whole/);
  assert.throws(() => runAction(s, 'transfer-tool', { articleId: 'article-1', fromId: 'warehouse-main', toId: 'warehouse-field', quantity: 1.5 }, actor), /whole/); assert.equal(snapshot(s), before);
});
test('tool transfer updates both balances and rejects same-warehouse transfers', t => {
  const s = fixture(t); const beforeQty = toolQty(s, 'article-8'); runAction(s, 'transfer-tool', { articleId: 'article-8', fromId: 'warehouse-main', toId: 'warehouse-field', quantity: 2 }, actor); assert.equal(toolQty(s, 'article-8'), beforeQty - 2); assert.equal(toolQty(s, 'article-8', 'warehouse-field'), 2);
  const before = snapshot(s); assert.throws(() => runAction(s, 'transfer-tool', { articleId: 'article-8', fromId: 'warehouse-main', toId: 'warehouse-main', quantity: 2 }, actor), /different/); assert.equal(snapshot(s), before);
});
test('configured diameter outlines match the inspected original reference values', t => {
  const s = fixture(t); assert.equal(weldLength(s, s.get('welds', 'weld-1')), 189.3); assert.equal(weldLength(s, s.get('welds', 'weld-2')), 358.9);
  const w = s.get('welds', 'weld-1'); const explicit = s.update('welds', w.id, { lengthMode: 'Length in mm', dialen: 250.25, ndoReq: true, ndtpercent: 20 }, w._version, actor); assert.equal(weldLength(s, explicit), 250.25);
});
test('inspection requests, rejection, repair, and additional result retain their history', t => {
  const s = fixture(t); const request = runAction(s, 'inspection-request', { weldIds: ['weld-25'], type: 'NDT', processId: 'ndt-0' }, actor); assert.ok('records' in request && request.records?.length === 1); const id = request.records![0].id;
  assert.throws(() => runAction(s, 'inspection-request', { weldIds: ['weld-25'], type: 'NDT' }, actor), /open request/);
  runAction(s, 'inspection-result', { requestId: id, result: 'Rejected', reportNo: 'TEST-RT-1', examinedLength: 100, round: 'Initial' }, actor);
  runAction(s, 'repair', { weldId: 'weld-25', note: 'Remove indication and re-examine.' }, actor);
  runAction(s, 'inspection-result', { requestId: id, result: 'Accepted', reportNo: 'TEST-RT-2', examinedLength: 100, round: 'Additional 1' }, actor);
  assert.equal(s.get('inspection_requests', id).status, 'Accepted'); assert.equal(s.get('welds', 'weld-25').repair, true); assert.equal(s.list('inspection_results').filter(r => r.requestId === id).length, 2); assert.ok(s.activity(1000).some(e => e.entityId === 'weld-25' && e.action === 'repair'));
});
test('batch inspection request is atomic when a later weld already has an open request', t => {
  const s = fixture(t); const open = s.list('inspection_requests').find(r => r.status === 'Open')!; const before = snapshot(s);
  assert.throws(() => runAction(s, 'inspection-request', { weldIds: ['weld-30', open.weldId], type: 'NDT' }, actor), /open request/); assert.equal(snapshot(s), before);
});
test('revisions preserve previous revision; phase changes leave unselected flags intact', t => {
  const s = fixture(t); const original = s.get('isometrics', 'iso-1'); runAction(s, 'revision', { isoId: original.id, type: 'ISO', revNo: '3', comment: 'Updated routing' }, actor); assert.equal(s.get('isometrics', original.id).revNo, '3'); const revision = s.list('revisions')[0]; assert.equal(revision.previousRev, original.revNo);
  runAction(s, 'phases', { isoIds: ['iso-1', 'iso-2'], prefab_doc: 'Complete', field_release: 'Keep current' }, actor); assert.equal(s.get('isometrics', 'iso-1').prefab_doc, true); assert.equal(s.get('isometrics', 'iso-1').field_release, original.field_release);
  assert.throws(() => runAction(s, 'revision', { isoId: original.id, type: 'ISO', revNo: '3' }, actor), /differ/);
});
test('spool service records change location and completion restores the laydown', t => {
  const s = fixture(t); const result = runAction(s, 'service', { spoolIds: ['spool-1', 'spool-2'], companyId: 'service-coating', services: 'Coating', laydownId: 'laydown-b' }, actor); assert.ok('records' in result && result.records?.length === 2); assert.equal(s.get('spools', 'spool-1').serviceCompanyId, 'service-coating'); assert.equal(s.get('spools', 'spool-1').laydownId, '');
  runAction(s, 'complete-service', { requestIds: result.records!.map(r => r.id) }, actor); assert.equal(s.get('spools', 'spool-1').laydownId, 'laydown-b'); assert.equal(s.get('spools', 'spool-1').serviceCompanyId, '');
});
test('stale edits, duplicate scoped identifiers, and mismatched spool/isometric are rejected', t => {
  const s = fixture(t); const project = s.get('projects', 'project-cooling'); s.update('projects', project.id, { contact: 'Updated contact' }, project._version, actor); assert.throws(() => s.update('projects', project.id, { contact: 'Stale contact' }, project._version, actor), /changed/); assert.equal(s.get('projects', project.id).contact, 'Updated contact');
  assert.throws(() => s.create('isometrics', { isoNo: 'STX-CW-001', projectId: 'project-cooling' }, actor), /already exists/); assert.throws(() => s.create('welds', { weldNo: 'X1', isoId: 'iso-1', spoolId: 'spool-2' }, actor), /belong/);
});
test('dashboard does not double count repeated examination length and handles empty denominators', t => {
  const s = fixture(t); const rows = Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key)])); const sum = summary(rows); assert.ok(sum.examinedLength <= sum.totalLength); assert.equal(sum.pendingOrders, 2); assert.equal(sum.activeProjects, 3);
  const empty = summary({}); assert.equal(empty.examinedPercent, 0); assert.equal(empty.repairPercent, 0); assert.ok(Number.isFinite(empty.totalLength));
});
test('validation rejects blank identifiers, negative quantities, NaN, tiny rounded quantities, and invalid calendar dates', t => {
  const s = fixture(t); assert.throws(() => s.create('sites', { name: '   ' }, actor), AppError); assert.throws(() => s.create('materials', { materialNo: 'X', description: 'X', uom: 'EA', price: -1 }, actor), AppError);
  for (const v of [-1, 0, NaN, Infinity, 0.000000001, '1']) assert.throws(() => positive(v)); assert.throws(() => validDate('2026-02-29')); assert.equal(validDate('2028-02-29'), '2028-02-29');
});
test('custom isometric material stays out of the catalog unless add-to-catalog is selected', t => {
  const s = fixture(t); const count = s.list('materials').length;
  const result = runAction(s, 'add-iso-material', { isoId: 'iso-1', source: 'Custom', materialNo: 'CUSTOM-01', description: 'Custom support bracket', uom: 'EA', quantity: 2, price: 5.5, phaseId: 'phase-0', addToDB: false }, actor);
  assert.equal(s.list('materials').length, count); assert.ok('record' in result && result.record); assert.equal(result.record!.customMaterial, true); assert.equal(result.record!.materialId, ''); assert.equal(s.display('iso_materials', result.record!), 'CUSTOM-01');
  const saved = runAction(s, 'add-iso-material', { isoId: 'iso-2', source: 'Custom', materialNo: 'CUSTOM-02', description: 'Catalog support bracket', uom: 'EA', quantity: 3, price: 4.5, addToDB: true }, actor);
  assert.equal(s.list('materials').length, count + 1); assert.ok('record' in saved && saved.record?.materialId); assert.equal(s.get('materials', saved.record!.materialId).materialNo, 'CUSTOM-02');
});
test('a failed custom material requirement rolls back a newly created catalog material', t => {
  const s = fixture(t); const before = snapshot(s);
  assert.throws(() => runAction(s, 'add-iso-material', { isoId: 'iso-1', source: 'Custom', materialNo: 'BAD-CUSTOM', description: 'Invalid price', uom: 'EA', price: -1, quantity: 2, addToDB: true }, actor), AppError); assert.equal(snapshot(s), before);
});
test('opening an older database adds new reference columns without losing data or foreign-key checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stelux-migrate-')); const filename = join(dir, 'test.sqlite');
  try {
    let s = new Store(filename); seed(s); s.db.exec('ALTER TABLE isometrics DROP COLUMN fieldPackageId'); const before = s.get('isometrics', 'iso-1'); s.close();
    s = new Store(filename); const columns = s.db.prepare('PRAGMA table_xinfo(isometrics)').all() as {name:string}[]; assert.ok(columns.some(c => c.name === 'fieldPackageId')); assert.deepEqual(s.get('isometrics', 'iso-1'), before);
    s.update('isometrics', before.id, {fieldPackageId:'fwp-1'},before._version,actor); assert.equal(s.get('isometrics',before.id).fieldPackageId,'fwp-1');
    assert.throws(() => s.db.prepare("UPDATE isometrics SET data=json_set(data,'$.fieldPackageId','missing-package') WHERE id='iso-1'").run(), /FOREIGN KEY/); s.close();
  } finally { rmSync(dir, {recursive:true,force:true}); }
});
