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
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { ACTIONS } from '../shared/actions.ts';
import { canAction, canResource } from '../shared/permissions.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import { conservedTotals, defaultTransferType, inventoryLog, inventoryRows, materialsList, siteInventoryLog, stockDetails, storehouseRows, transferOrderFields, transferRoute, transferTypesFor, unmigratedHoldings, validQuantity } from '../shared/mto-stock.ts';
import { requirementExecution } from '../shared/materials.ts';
import { materialStatus } from '../shared/mto-materials.ts';
import { isoStatuses } from '../shared/mto-logistics.ts';
import { migrateProjectHoldings } from '../server/mto-stock.ts';
import type { Row, User } from '../shared/types.ts';

const actor = { id: 'tester', name: 'Test engineer' };
const fixture = () => { const store = new Store(':memory:'); seed(store); return store; };
const all = (store: Store) => Object.fromEntries(['stock', 'movements', 'materials', 'custom_materials', 'warehouses', 'sites', 'projects', 'isometrics', 'iso_materials', 'orders', 'order_lines', 'picklists', 'reservations', 'certifications', 'operation_phases'].map(key => [key, store.list(key, true)]));
/** A storehouse line (material and charge in one storehouse). */
const line = (store: Store, warehouseId: string, materialId: string, chargeNo = 'H-1042') => store.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === warehouseId && row.materialId === materialId && row.chargeNo === chargeNo)!;
/** What a project site's Material inventory holds of one material, every charge together. */
const onSite = (store: Store, siteId: string, materialId: string) => store.list('stock').filter(row => row.locationKind === 'site' && row.siteId === siteId && row.materialId === materialId).reduce((sum, row) => sum + Number(row.quantity), 0);
const inv = (store: Store, requirementId: string) => requirementExecution(all(store)).find(entry => entry.requirement.id === requirementId)!.inventory;
const run = (store: Store, key: string, data: Record<string, unknown>) => runAction(store, key, { date: '2026-11-01', ...data }, actor);
const total = (store: Store) => conservedTotals(all(store));
const refused = (status: number, pattern: RegExp) => (error: unknown) => { assert.equal((error as { status: number }).status, status); assert.match((error as Error).message, pattern); return true; };

test('quantities must be at least 0.01 in steps of 0.01', () => {
  for (const value of [0.01, 0.5, 1, 12.34, 100]) assert.ok(validQuantity(value), String(value));
  for (const value of [0, -1, 0.001, 0.005, 1.005, NaN, Infinity, '1', null]) assert.equal(validQuantity(value), false, String(value));
});

test('take-in books into the order\'s project site inventory, one inventory row per Material No; storehouse lines do not count', () => {
  const s = fixture();
  const material = s.create('materials', { materialNo: 'TI-ELB-90', description: 'Take-in test elbow', materialGroup: 'Elbow', uom: 'EA' }, actor, 'material-take-in');
  const requirement = s.create('iso_materials', { isoId: 'iso-1', materialId: material.id, quantity: 10, phaseId: 'phase-0' }, actor);
  const order = run(s, 'order-requirements', { requirementIds: [requirement.id] }).record!;
  const orderLine = s.list('order_lines').find(row => row.orderId === order.id)!;
  // Site A = North fabrication yard (iso-1 → project-cooling). No storehouse is named.
  run(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', items: [{ lineId: orderLine.id, quantity: 6, chargeNo: 'RX-1' }] });
  const received = s.list('stock').filter(row => row.materialId === material.id);
  assert.equal(received.length, 1);
  assert.deepEqual([received[0].locationKind, received[0].siteId, received[0].warehouseId, received[0].quantity], ['site', 'site-north', '', 6]);
  assert.equal(inv(s, requirement.id), 6, 'Inv. counts the site inventory: 6');
  run(s, 'receive', { orderId: order.id, supplierId: 'supplier-steel', items: [{ lineId: orderLine.id, quantity: 4, chargeNo: 'RX-2' }] });
  const rows = inventoryRows(all(s), { siteId: 'site-north', onlyWithQuantity: true }).filter(row => row.materialId === material.id);
  assert.equal(rows.length, 1, 'two charges, one row per Material No'); assert.equal(rows[0].quantity, 10, '6 + 4'); assert.equal(rows[0].lines.length, 2);
  assert.equal(inventoryRows(all(s), { siteId: 'site-river', onlyWithQuantity: false }).some(row => row.materialId === material.id), false, 'not in the other site');
  // A storehouse line of the same material changes nothing for the site's isometrics.
  run(s, 'adjust-material', { materialId: material.id, warehouseId: 'warehouse-main', chargeNo: 'RX-1', quantity: 50, note: 'Storehouse opening balance' });
  assert.equal(inv(s, requirement.id), 10, 'Inv. stays 10 with 50 in a storehouse');
  assert.equal(materialStatus(s.get('isometrics', 'iso-1'), all(s)).lines.find(entry => entry.requirementId === requirement.id)!.covered, 10);
  assert.equal(storehouseRows(all(s), { onlyWithQuantity: true }).filter(entry => entry.stock.materialId === material.id).length, 1);
  assert.equal(siteInventoryLog(all(s), 'site-north', `catalog:${material.id}`).filter(move => move.type === 'Receipt').length, 2, 'the Material log shows both receipts');
});

test('transfer to project moves storehouse material into the chosen site inventory with its certificates; totals are conserved', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-4'), before = total(s), stockBefore = Number(main.quantity);
  const riverBefore = onSite(s, 'site-river', 'material-4'), invBefore = inv(s, 'requirement-4');
  run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: main.id, quantity: 5.25 }], note: 'Steam header' });
  assert.equal(Number(s.get('stock', main.id).quantity), stockBefore - 5.25, 'storehouse line −5.25');
  assert.equal(onSite(s, 'site-river', 'material-4'), riverBefore + 5.25, 'Riverside inventory +5.25');
  assert.equal(inv(s, 'requirement-4'), invBefore + 5.25, 'the Riverside isometric counts it');
  assert.deepEqual(total(s), before, 'storehouse plus site inventories: unchanged');
  const moves = s.list('movements').filter(move => move.type === 'Project transfer' && move.materialId === 'material-4' && move.note === 'Steam header');
  assert.deepEqual(moves.map(move => [move.warehouseId, move.siteId, move.quantity]).sort(), [['', 'site-river', 5.25], ['warehouse-main', 'site-river', -5.25]], 'a movement on both sides');
  assert.deepEqual(unmigratedHoldings(all(s)), [], 'no invisible holding');
  // The ticked certificates of the line are copied to the destination site, each with its index number there.
  const pipe = line(s, 'warehouse-main', 'material-1');
  run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: pipe.id, quantity: 2, certIds: ['certificate-1'] }] });
  const copy = s.list('certifications').find(cert => cert.siteId === 'site-river' && cert.name === 'ATT-26-1184')!;
  assert.ok(copy, 'certificate copied'); assert.match(String(copy.indexNo), /^\d{4}$/); assert.equal(copy.chargeNo, 'H-1042'); assert.equal(copy.materialId, 'material-1');
  assert.equal(s.get('certifications', 'certificate-1').siteId, 'site-north', 'the original stays');
  run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: pipe.id, quantity: 1, certIds: ['certificate-1'] }] });
  assert.equal(s.list('certifications').filter(cert => cert.siteId === 'site-river' && cert.name === 'ATT-26-1184').length, 1, 'copied once');
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: pipe.id, quantity: 1, certIds: ['certificate-2'] }] }), refused(422, /does not belong/));
  // The current site is a destination too.
  const northBefore = onSite(s, 'site-north', 'material-4');
  run(s, 'stock-to-project', { siteId: 'site-north', items: [{ stockId: main.id, quantity: 1 }] });
  assert.equal(onSite(s, 'site-north', 'material-4'), northBefore + 1);
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: s.list('stock').find(row => row.locationKind === 'site')!.id, quantity: 1 }] }), refused(422, /inventory, not in a storehouse/));
});

test('scenario S14: transferring storehouse stock to the isometric\'s own site raises its coverage, and a reservation is never undercut by a storehouse transfer', () => {
  // STX-CW-002 (iso-2, North) needs 4 CS-E090 (material-2) and reserves them; then every storehouse line of CS-E090 goes to North.
  const s = fixture();
  run(s, 'reserve-iso', { isoId: 'iso-2' });
  assert.equal(s.list('reservations').find(row => row.isoId === 'iso-2')!.quantity, 4);
  const before = isoStatuses(all(s)).get('iso-2')!.percent, north = onSite(s, 'site-north', 'material-2');
  assert.equal(before, 100);
  const lines = s.list('stock').filter(row => row.locationKind !== 'site' && row.materialId === 'material-2' && Number(row.quantity) > 0);
  const moved = lines.reduce((sum, row) => sum + Number(row.quantity), 0);
  run(s, 'stock-to-project', { siteId: 'site-north', items: lines.map(row => ({ stockId: row.id, quantity: Number(row.quantity) })) });
  assert.equal(onSite(s, 'site-north', 'material-2'), north + moved, 'all of it arrives in the North inventory');
  assert.equal(isoStatuses(all(s)).get('iso-2')!.percent, 100, 'D3: 100 % stays 100 % (was 88.2 %)');
  assert.equal(materialStatus(s.get('isometrics', 'iso-2'), all(s)).percent, 100);
  assert.equal(s.list('reservations').find(row => row.isoId === 'iso-2')!.status, 'Reserved');
});

test('stock never goes negative and a refused action leaves everything unchanged', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-3'), snapshot = JSON.stringify([s.list('stock'), s.list('movements', true)]);
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: main.id, quantity: Number(main.quantity) + 0.01 }] }), refused(409, /Insufficient stock/));
  // The second line fails after the first was applied: the whole transfer rolls back.
  const other = line(s, 'warehouse-main', 'material-1');
  assert.throws(() => run(s, 'stock-to-project', { siteId: 'site-river', items: [{ stockId: other.id, quantity: 1 }, { stockId: main.id, quantity: 999 }] }), refused(409, /Insufficient/));
  assert.throws(() => run(s, 'stock-move', { stockId: main.id, toWarehouseId: 'warehouse-field', quantity: 500 }), refused(409, /Insufficient/));
  assert.throws(() => run(s, 'stock-return', { stockId: main.id, siteId: 'site-river', quantity: Number(main.quantity) + 1 }), refused(409, /Insufficient/), 'a storehouse cannot return more than it holds');
  assert.throws(() => run(s, 'inventory-remove', { siteId: 'site-north', materialId: 'material-3', quantity: 999, comment: 'Count' }), refused(409, /Insufficient stock/));
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
  run(s, 'adjust-material', { warehouseId: 'warehouse-main', materialId: 'material-1', chargeNo: 'H-9000', quantity: 3, note: 'Second heat' });
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
  assert.equal(storehouseRows(all(s), { warehouseId: 'warehouse-main', onlyWithQuantity: false }).some(entry => entry.stock.id === target.id), false);
  assert.ok(s.activity(30).some(event => event.action === 'removed'));
  // The same material can come into the storehouse again afterwards.
  run(s, 'adjust-material', { warehouseId: 'warehouse-main', materialId: 'material-7', chargeNo: 'H-1042', quantity: 2, note: 'Recount' });
  assert.equal(Number(line(s, 'warehouse-main', 'material-7').quantity), 2);
});

test('the Material inventory of a site lists one row per Material No with the quantity of every charge, and only rows with quantity unless asked', () => {
  const s = fixture();
  // SS-P114 (material-4) in the North inventory: 12 (H-1042) from the sample, then 6.5 of a second heat.
  run(s, 'stock-add', { siteId: 'site-north', materialId: 'material-4', chargeNo: 'H-3310', quantity: 6.5 });
  const pipe = inventoryRows(all(s), { siteId: 'site-north', onlyWithQuantity: true }).filter(row => row.details.materialNo === 'SS-P114');
  assert.equal(pipe.length, 1); assert.equal(pipe[0].quantity, 18.5, '12 + 6.5'); assert.deepEqual(pipe[0].lines.map(row => row.chargeNo).sort(), ['H-1042', 'H-3310']);
  const rows = inventoryRows(all(s), { siteId: 'site-north', onlyWithQuantity: false });
  assert.equal(new Set(rows.map(row => row.details.materialNo)).size, rows.length, 'every Material No once');
  assert.ok(rows.every(row => row.siteId === 'site-north' && row.lines.every(stock => stock.locationKind === 'site')));
  // Removing all of a Material No: it leaves the list unless all materials are shown.
  run(s, 'inventory-remove', { siteId: 'site-north', materialId: 'material-4', quantity: 18.5, comment: 'Used for the cooling loop spool repair' });
  assert.equal(onSite(s, 'site-north', 'material-4'), 0);
  assert.equal(inventoryRows(all(s), { siteId: 'site-north', onlyWithQuantity: true }).some(row => row.materialId === 'material-4'), false);
  assert.equal(inventoryRows(all(s), { siteId: 'site-north', onlyWithQuantity: false }).some(row => row.materialId === 'material-4'), true);
  const removals = siteInventoryLog(all(s), 'site-north', 'catalog:material-4').filter(move => move.type === 'Removal');
  assert.deepEqual(removals.map(move => move.quantity).sort((a, b) => Number(a) - Number(b)), [-12, -6.5], 'one removal per charge, written off with the comment');
  assert.ok(removals.every(move => move.reasonText === 'Used for the cooling loop spool repair'));
  assert.throws(() => run(s, 'inventory-remove', { siteId: 'site-north', materialId: 'material-1', quantity: 1 }), refused(422, /Comment is required/));
  const found = inventoryRows(all(s), { siteId: 'site-north', onlyWithQuantity: false, query: 'cs-e090' });
  assert.deepEqual(found.map(row => [row.details.materialNo, row.quantity]), [['CS-E090', 15]], '12 transferred + 3 from the completed transfer order');
});

test('add material from DB puts it into the Material inventory of the project site and logs it', () => {
  const s = fixture(), before = s.list('stock').length;
  const created = run(s, 'stock-add', { siteId: 'site-river', materialId: 'material-8', chargeNo: 'H-7001', quantity: 2.5 });
  const record = 'record' in created ? created.record! : null as never;
  assert.equal(s.list('stock').length, before + 1); assert.deepEqual([record.locationKind, record.siteId, record.warehouseId, record.quantity], ['site', 'site-river', '', 2.5]);
  run(s, 'stock-add', { siteId: 'site-river', materialId: 'material-8', chargeNo: 'H-7001', quantity: 0.5 });
  assert.equal(Number(s.get('stock', record.id).quantity), 3);
  assert.equal(siteInventoryLog(all(s), 'site-river', 'catalog:material-8').length, 2);
  assert.throws(() => run(s, 'stock-add', { siteId: 'site-river', materialId: 'material-8', quantity: 0 }), refused(422, /at least 0.01/));
  assert.throws(() => run(s, 'stock-add', { siteId: 'site-river', materialId: 'missing', quantity: 1 }), /could not be found/);
  assert.throws(() => run(s, 'stock-add', { materialId: 'material-8', quantity: 1 }), /./, 'a project site is required');
});

test('transfer-order types route as in the reference: source, destination and the fields the dialog shows', () => {
  assert.deepEqual(transferRoute('Inventory - Project'), { from: 'inventory', to: 'site' });
  assert.deepEqual(transferRoute('Inventory - Storehouse'), { from: 'inventory', to: 'storehouse' });
  assert.deepEqual(transferRoute('Storehouse → Project'), { from: 'storehouse', to: 'site' });
  assert.deepEqual(transferRoute('Storehouse → Storehouse'), { from: 'storehouse', to: 'storehouse' });
  assert.deepEqual(transferRoute('Return → Inventory'), { from: 'storehouse', to: 'inventory' });
  assert.equal(transferRoute('Somewhere'), null);
  // #stoType handler: 1 To storehouse; 5 To project site; 2 From storehouse (not in the inventory context or with carried lines) + To project site; 3 the same + To storehouse; 4 From storehouse only.
  const shown = (type: string, context: 'inventory' | 'store' | 'page', carried = false) => transferOrderFields(type, context, carried);
  assert.deepEqual(shown('Inventory - Storehouse', 'inventory'), { fromStorehouse: false, toSite: false, toStorehouse: true });
  assert.deepEqual(shown('Inventory - Project', 'inventory'), { fromStorehouse: false, toSite: true, toStorehouse: false });
  assert.deepEqual(shown('Storehouse → Project', 'page'), { fromStorehouse: true, toSite: true, toStorehouse: false });
  assert.deepEqual(shown('Storehouse → Project', 'store', true), { fromStorehouse: false, toSite: true, toStorehouse: false });
  assert.deepEqual(shown('Storehouse → Storehouse', 'inventory'), { fromStorehouse: false, toSite: false, toStorehouse: true });
  assert.deepEqual(shown('Return → Inventory', 'page'), { fromStorehouse: true, toSite: false, toStorehouse: false });
  assert.deepEqual(shown('Return → Inventory', 'store', true), { fromStorehouse: false, toSite: false, toStorehouse: false });
  assert.equal(defaultTransferType('inventory'), 'Inventory - Project'); assert.equal(defaultTransferType('store'), 'Storehouse → Project');
  assert.deepEqual(transferTypesFor('inventory'), ['Inventory - Project', 'Inventory - Storehouse']);
  assert.deepEqual(transferTypesFor('store'), ['Storehouse → Project', 'Storehouse → Storehouse', 'Return → Inventory']);
  assert.equal(transferTypesFor('page').length, 5);
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
  assert.throws(() => create({ type: 'Inventory - Project', fromSiteId: 'site-north', siteId: 'site-river', items: [{ ...item, stockId: line(s, 'warehouse-main', 'material-1').id }] }), refused(422, /not in the inventory of this project site/));
  assert.throws(() => create({ type: 'Inventory - Project', siteId: 'site-river' }), refused(422, /project site whose inventory gives/), 'the source is the active site');
  assert.throws(() => create({ type: 'Inventory - Project', fromSiteId: 'site-north', siteId: 'site-north' }), refused(422, /different project site/));
  assert.throws(() => create({ type: 'Inventory - Storehouse', fromSiteId: 'site-north' }), /./, 'a storehouse is required');
  assert.throws(() => create({ type: 'Storehouse → Storehouse', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-field', items: [{ ...item, stockId: line(s, 'warehouse-field', 'material-2').id }] }), refused(422, /not in the chosen storehouse/));
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

test('inventory orders take from the active site\'s inventory; Return → Inventory takes from a storehouse into the active site; totals are conserved', () => {
  const s = fixture(), before = total(s);
  const order = (data: Record<string, unknown>) => { const created = run(s, 'transfer-order-create', data); return ('record' in created ? created.record! : null as never); };
  const complete = (o: Row) => run(s, 'transfer-order-complete', { orderId: o.id });
  // 5 Inventory - Project: North → Riverside, 6 m of CS-P060 (North holds 16 H-1042 + 14 H-2207 = 30, taken in charge order).
  const northPipe = onSite(s, 'site-north', 'material-1'), riverPipe = onSite(s, 'site-river', 'material-1');
  const toRiver = order({ type: 'Inventory - Project', fromSiteId: 'site-north', siteId: 'site-river', items: [{ materialNo: 'CS-P060', quantity: 6, uom: 'M' }] });
  assert.equal(onSite(s, 'site-north', 'material-1'), northPipe, 'creating an order moves nothing');
  complete(toRiver);
  assert.equal(onSite(s, 'site-north', 'material-1'), northPipe - 6); assert.equal(onSite(s, 'site-river', 'material-1'), riverPipe + 6);
  // 1 Inventory - Storehouse: North → Field stores, 2 elbows.
  const northElbow = onSite(s, 'site-north', 'material-2'), fieldElbow = Number(line(s, 'warehouse-field', 'material-2').quantity);
  complete(order({ type: 'Inventory - Storehouse', fromSiteId: 'site-north', toWarehouseId: 'warehouse-field', items: [{ materialNo: 'CS-E090', quantity: 2, uom: 'EA' }] }));
  assert.equal(onSite(s, 'site-north', 'material-2'), northElbow - 2); assert.equal(Number(line(s, 'warehouse-field', 'material-2').quantity), fieldElbow + 2);
  // 4 Return → Inventory: from the Prefab yard store into the active site's (Riverside) inventory.
  const yard = line(s, 'warehouse-yard', 'material-4', 'H-3310'), riverTube = onSite(s, 'site-river', 'material-4');
  complete(order({ type: 'Return → Inventory', fromWarehouseId: 'warehouse-yard', siteId: 'site-river', items: [{ materialNo: 'SS-P114', quantity: 8.5, uom: 'M' }] }));
  assert.equal(Number(s.get('stock', yard.id).quantity), 18.5 - 8.5); assert.equal(onSite(s, 'site-river', 'material-4'), riverTube + 8.5, 'the active site\'s inventory row rises');
  // 2 Storehouse → Project with lines that carry their own storehouse (no From storehouse).
  const mainFlange = line(s, 'warehouse-main', 'material-3'), northFlange = onSite(s, 'site-north', 'material-3');
  complete(order({ type: 'Storehouse → Project', siteId: 'site-north', items: [{ stockId: mainFlange.id, materialNo: 'CS-F150', quantity: 3, uom: 'EA' }] }));
  assert.equal(Number(s.get('stock', mainFlange.id).quantity), 0); assert.equal(onSite(s, 'site-north', 'material-3'), northFlange + 3);
  assert.deepEqual(total(s), before, 'every quantity that left one location arrived in another');
  const short = order({ type: 'Inventory - Project', fromSiteId: 'site-river', siteId: 'site-north', items: [{ materialNo: 'CS-P060', quantity: 999, uom: 'M' }] });
  assert.throws(() => complete(short), refused(409, /Not enough CS-P060 in the inventory of Riverside installation/));
  // An order planned before the site inventories (no source site) must be planned again.
  const legacy = s.create('transfer_orders', { number: 'TO-OLD', type: 'Return → Inventory', status: 'Open', siteId: 'site-river', toWarehouseId: 'warehouse-main' }, actor);
  s.create('transfer_order_items', { orderId: legacy.id, materialNo: 'CS-P060', quantity: 1 }, actor);
  assert.throws(() => complete(legacy), refused(409, /planned before project site inventories/));
});

test('the seed gives every screen realistic data: shared storehouses, site inventories, a corrected line and orders in each status', () => {
  const s = fixture();
  assert.deepEqual(s.list('warehouses').map(w => w.name).sort(), ['Field stores', 'Main warehouse', 'Prefab yard store']);
  assert.ok(s.list('warehouses').every(w => w.description && w.location && !w.siteId), 'company storehouses with a location and no project site');
  assert.deepEqual([...new Set(s.list('transfer_orders').map(o => o.status))].sort(), ['Completed', 'Open']);
  assert.ok(s.list('transfer_orders').some(o => o.priority === 'Urgent'));
  assert.ok(s.list('stock').some(row => row.corrected === true));
  assert.deepEqual(unmigratedHoldings(all(s)), []);
  for (const site of ['site-north', 'site-river']) assert.ok(inventoryRows(all(s), { siteId: site, onlyWithQuantity: true }).length >= 4, site);
  assert.ok(storehouseRows(all(s), { warehouseId: 'warehouse-yard', onlyWithQuantity: true }).length >= 3);
});

test('the materials list is computed live from requirements, orders, the site inventory and picks', () => {
  const s = fixture(); let rows = materialsList(all(s), { siteId: 'site-north' });
  assert.ok(rows.length > 0);
  const river = materialsList(all(s), { siteId: 'site-river' });
  const entry = river.find(row => row.id === 'requirement-4')!; assert.deepEqual(Object.keys(entry.values), ['project', 'iso', 'chemicalClean', 'group', 'materialNo', 'description', 'quantity', 'ordered', 'inventory', 'picked']);
  // requirement-4: iso-4 (Riverside), SS-P114 (material-4): Riverside holds the 20 transferred from the Main warehouse; the 20 left there do not count.
  assert.equal(entry.values.inventory, 20);
  run(s, 'stock-add', { siteId: 'site-river', materialId: 'material-4', chargeNo: 'H-1', quantity: 1 });
  assert.equal(materialsList(all(s), { siteId: 'site-river' }).find(row => row.id === entry.id)!.values.inventory, 21, 'a new stock figure shows at once, no cache');
  run(s, 'adjust-material', { materialId: 'material-4', warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: 100, note: 'Storehouse count' });
  run(s, 'stock-add', { siteId: 'site-north', materialId: 'material-4', chargeNo: 'H-2', quantity: 50 });
  assert.equal(materialsList(all(s), { siteId: 'site-river' }).find(row => row.id === entry.id)!.values.inventory, 21, 'neither a storehouse line nor another site counts');
  assert.ok(river.length > 0 && river.every(row => !rows.some(other => other.id === row.id)), 'each main project lists only its own materials');
  assert.equal(materialsList(all(s), { query: 'no-such-material' }).length, 0);
  assert.equal(materialsList(all(s), { projectId: 'project-cooling' }).every(row => row.values.project === 'STX-2401'), true);
});

test('the hosted preparation books the first version\'s project holdings into the site inventories, once', () => {
  const s = fixture(), main = line(s, 'warehouse-main', 'material-5'), before = total(s);
  // A transfer of the first version: only the storehouse side, the project "holds" 7.
  s.update('stock', main.id, { quantity: Number(main.quantity) - 7 }, main._version, actor);
  s.create('movements', { number: 'MM-OLD', materialId: 'material-5', warehouseId: 'warehouse-main', siteId: 'site-river', type: 'Project transfer', quantity: -7, chargeNo: 'H-1042', date: '2026-10-01' }, actor);
  assert.deepEqual(total(s), before, 'the holding counts in the totals');
  const river = onSite(s, 'site-river', 'material-5');
  assert.deepEqual(migrateProjectHoldings(s, { dryRun: true }), { holdings: 1, quantity: 7 });
  assert.equal(onSite(s, 'site-river', 'material-5'), river, 'a dry run changes nothing');
  assert.deepEqual(migrateProjectHoldings(s), { holdings: 1, quantity: 7 });
  assert.equal(onSite(s, 'site-river', 'material-5'), river + 7);
  assert.deepEqual(unmigratedHoldings(all(s)), []); assert.deepEqual(total(s), before);
  assert.deepEqual(migrateProjectHoldings(s), { holdings: 0, quantity: 0 }, 'a second run does nothing');
});

test('Start makes one pick-list line per requirement from the site inventory, with a five-digit Pick List No.', () => {
  const s = fixture();
  const material = s.create('materials', { materialNo: 'PL-BOLT', description: 'Stud bolt set', materialGroup: 'Bolt', uom: 'SET' }, actor, 'material-pick');
  for (const [chargeNo, quantity] of [['A-1', 7], ['B-2', 5]] as const) run(s, 'stock-add', { siteId: 'site-north', materialId: material.id, chargeNo, quantity });
  // An isometric of its own in the same project (Start needs a Mat.status of 70 %): 11 of 11 covered.
  s.create('isometrics', { isoNo: 'PL-01', projectId: s.get('isometrics', 'iso-3').projectId }, actor, 'iso-pick');
  const first = s.create('iso_materials', { isoId: 'iso-pick', materialId: material.id, quantity: 5, phaseId: 'phase-0' }, actor, 'req-pick-1');
  s.create('iso_materials', { isoId: 'iso-pick', materialId: material.id, quantity: 6, phaseId: 'phase-0' }, actor, 'req-pick-2');
  const result = run(s, 'start-iso', { isoId: 'iso-pick' });
  const lines = ('records' in result ? result.records! : []).filter(row => row.materialId === material.id);
  assert.deepEqual(lines.map(row => [row.requirementId, row.quantity]), [[first.id, 5], ['req-pick-2', 6]], 'one line per requirement (5 and 6), not per charge');
  assert.ok(lines.every(row => row.warehouseId === '' && row.siteId === 'site-north' && /^\d{5}$/.test(String(row.reportNo))));
  assert.equal(inv(s, first.id), 1, 'Inv. after Start: 12 on hand − 11 issued at Start = 1');
  run(s, 'take-picklist', { reportNo: String(lines[0].reportNo) });
  // Issued at Start in charge order: 5 from A-1, then 2 from A-1 and 4 from B-2; B-2 keeps 1. Taking moves nothing more.
  assert.deepEqual(s.list('movements').filter(move => move.type === 'Issue' && move.materialId === material.id).map(move => [move.chargeNo, move.quantity]).sort(), [['A-1', -2], ['A-1', -5], ['B-2', -4]]);
  assert.equal(onSite(s, 'site-north', material.id), 1);
  assert.deepEqual(requirementExecution(all(s)).filter(entry => entry.material.id === material.id).map(entry => [entry.picked, entry.inventory]), [[5, 1], [6, 1]]);
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
  // Add storehouse (reference #addLager): Name*, Location, Description; nothing else in the pilots profile.
  assert.deepEqual(hosted.resources.warehouses, ['name', 'location', 'description']);
  const form = projectResource(hosted, RESOURCE_MAP.warehouses);
  assert.deepEqual(form.fields.map(field => [field.name, field.label, Boolean(field.required)]), [['name', 'Name', true], ['location', 'Location', false], ['description', 'Description', false]]);
  assert.equal(form.title, 'Storehouses');
  assert.equal(projectResource(availabilityFor('full'), RESOURCE_MAP.warehouses).fields.some(field => field.name === 'use'), true, 'the full profile keeps Used for');
  for (const key of ['locationKind', 'siteId']) assert.ok(hosted.resources.stock.includes(key), `stock ${key}`);
  // receive is delivered by the procurement flow (Material take in); the older adjust action stays full-profile only.
  assert.ok(!hosted.actions['adjust-material'], 'the older stock actions stay full-profile only');
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; for (const key of ['warehouses', 'stock', 'movements', 'transfer_orders']) assert.equal(Object.hasOwn(other.resources, key), false, `${profile} ${key}`); assert.ok(!Object.keys(other.actions).some(key => key.startsWith('stock-'))); }
  assert.equal(availabilityFor('full'), undefined);
  const mto = PILOT_MAP.mto.groups.flatMap(group => group.items);
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Storehouses')!), '/workspace/warehouses');
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Material inventory')!), '/materials/stock');
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Materials list')!), '/materials/materials-list');
  assert.equal(pilotItemPath(mto.find(item => item.label === 'Transfer orders')!), '/materials/transfer_orders');
  assert.ok(PILOT_MAP.weld.groups.flatMap(group => group.items).every(item => !['Material inventory', 'Materials list', 'Transfer orders'].includes(item.label)));
});

test('permissions: inventory operations need Material inventory (16), storehouse-line operations Storehouses (75); none run in Weld Pilot', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const account = (permissions: Partial<User['permissions']>, extra: Partial<User> = {}): User => ({ id: 'u', name: 'T', email: 't@example.test', profileId: 'p', availability: hosted, permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions }, ...extra });
  const writer = account({ general: 2, materials: 2 }), reader = account({ general: 1, materials: 1 }), welder = { ...account({ general: 2, welding: 3 }), pilot: 'weld' as const };
  for (const key of Object.keys(ACTIONS).filter(key => key.startsWith('stock-') || key.startsWith('transfer-order-') || key === 'inventory-remove')) { assert.equal(canAction(writer, key), true, key); assert.equal(canAction(reader, key), false, key); assert.equal(canAction(welder, key), false, key); }
  for (const key of ['stock', 'movements', 'transfer_orders', 'transfer_order_items']) { assert.equal(canResource(writer, key), true, key); assert.equal(canResource(reader, key), true, key); assert.equal(canResource(account({ general: 2, welding: 3 }), key), false, key); }
  assert.equal(canResource(writer, 'warehouses', 'edit'), true); assert.equal(canResource(reader, 'warehouses', 'edit'), false);
  // A detailed matrix: 16 without 75 runs the inventory but no storehouse dialog, and the reverse.
  const matrix = (rules: Record<string, string[]>) => account({ materials: 2, general: 2 }, { capabilities: rules as never });
  const inventoryOnly = matrix({ '16': ['show', 'insert', 'delete'] }), storehouseOnly = matrix({ '75': ['show', 'insert', 'edit', 'delete'] });
  for (const key of ['stock-add', 'inventory-remove', 'transfer-order-create']) { assert.equal(canAction(inventoryOnly, key), true, key); assert.equal(canAction(storehouseOnly, key), false, key); }
  for (const key of ['stock-to-project', 'stock-move', 'stock-return', 'stock-correct', 'stock-adjust', 'stock-remove']) { assert.equal(canAction(inventoryOnly, key), false, key); assert.equal(canAction(storehouseOnly, key), true, key); }
  assert.equal(canAction(matrix({ '75': ['show', 'insert'] }), 'stock-correct'), false, 'correcting a line needs the edit right');
  assert.equal(canAction(matrix({ '75': ['show', 'insert', 'edit'] }), 'stock-remove'), false, 'removing a line needs the archive right');
  assert.equal(canAction(matrix({ '16': ['show', 'insert'] }), 'inventory-remove'), false, 'removing from the inventory needs its archive right');
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
  // Add storehouse: Name, Location, Description; the storehouse holds materials and belongs to no project site.
  const added = await f.request('/api/records/warehouses', 'POST', { name: 'MAGACIN BELGIJA', location: 'Antwerp harbour, quay 12', description: 'Bonded store for imported fittings.' });
  assert.equal(added.status, 201);
  const storehouse = s.get('warehouses', ((await added.json()) as { record: Row }).record.id);
  assert.deepEqual([storehouse.use, storehouse.siteId, storehouse.location], ['Materials', '', 'Antwerp harbour, quay 12']);
  assert.equal((await f.request('/api/records/warehouses', 'POST', { name: 'Other store', siteId: 'site-north' })).status, 404, 'no project site field in the pilots profile');
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

test('HTTP: a detailed profile needs the archive right of Storehouses (75) to remove a storehouse line', async t => {
  const f = await hostedFixture(t); const s = f.store, target = line(s, 'warehouse-main', 'material-8');
  await f.signIn('No removal', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '16': ['show', 'insert', 'delete'], '5': ['show'], '4': ['show'], '75': ['show', 'insert', 'edit'], '64': ['show'], '70': ['show'] }) });
  assert.equal((await f.request('/api/actions/stock-remove', 'POST', { stockId: target.id, reasonText: 'Imported by mistake' })).status, 403);
  assert.equal(s.get('stock', target.id)._archived, false);
  await f.signIn('With removal', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '16': ['show'], '5': ['show'], '4': ['show'], '75': ['show', 'insert', 'edit', 'delete'], '64': ['show'], '70': ['show'] }) });
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
  assert.equal((await f.request('/api/actions/stock-add', 'POST', { siteId: 'site-north', materialId: material.id, chargeNo: 'H-NEW', quantity: 0.5, date: '2026-11-02' })).status, 201);
  const second = await (await f.request('/api/mto/materials-list?siteId=site-north')).json() as typeof first;
  assert.notEqual(second.rows.find(row => row.id === target.id)!.values.inventory, target.values.inventory, 'no cache: the new figure shows at once');
  assert.equal((await (await f.request('/api/mto/materials-list?siteId=missing-site')).json() as typeof first).rows.length, 0);
  const csv = await f.request('/api/mto/materials-list?siteId=site-north&format=csv'); assert.equal(csv.status, 200); assert.match(await csv.text(), /Project","Iso number","Ch\.clean"/);
  assert.equal((await f.request('/api/mto/materials-list?format=xlsx')).status, 200);
  assert.equal((await f.request('/api/mto/materials-list?pilot=weld', 'GET', undefined, { 'X-Stelux-Pilot': 'mto' })).status, 403, 'a header and a query naming different pilots are refused');
});
