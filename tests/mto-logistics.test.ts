import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, pageAvailable, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { PILOTS, pilotItemPath } from '../shared/pilots.ts';
import { planHostedSchema } from '../server/hosted-schema.ts';
import { DEFAULT_PERCENT_RANGE, EXECUTION_EXPORT_COLUMNS, EXECUTION_TYPES, PERCENT_CHIPS, PICKLIST_ARCHIVE_COLUMNS, archiveDefaultRange, canStartAt, defaultMaterialGroup, executionBoard, executionPriority, executionTypePhaseId, isoStatuses, laydownContent, laydownHistory, materialCurrentLabel, materialHistory, materialServiceRows, materialStatus, nextRequestNumber, drawnSignature, materialRequestNumber, requestKind, signOffComplete, percentBand, pickListReports, pickListStamp, planReserve, requestArchive, reservedMaterials, spoolExportLines, spoolHistory, spoolLocation, spoolRows, startedReports } from '../shared/mto-logistics.ts';
import { requirementExecution } from '../shared/materials.ts';
import { ACTIONS } from '../shared/actions.ts';
import { materialLocations } from '../shared/material-logistics.ts';
import type { Row } from '../shared/types.ts';

const actor = { id: 'mto-test', name: 'MTO test operator' };
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
const stockOf = (store: Store, materialId: string) => store.list('stock').filter(row => row.materialId === materialId).reduce((sum, row) => sum + Number(row.quantity), 0);
function sample(t: { after: (fn: () => void) => void }) { const store = new Store(':memory:'); seed(store); pinFlanges(store); seedMtoLogistics(store, SYSTEM); t.after(() => store.close()); return store; }
/** The base sample receives twelve units of one of two materials by chance of row order: pin the class 150 flanges (material-3) to the three in stock. */
function pinFlanges(store: Store) { for (const row of store.list('stock').filter(row => row.materialId === 'material-3' && row.chargeNo !== 'H-1042')) store.update('stock', row.id, { quantity: 0 }, row._version, actor); }
/** The three flanges lie in the Main warehouse: hand them to the North fabrication yard, whose isometrics count and pick from its Material inventory. */
function flangesToNorth(store: Store) { const line = store.list('stock').find(row => row.locationKind !== 'site' && row.materialId === 'material-3' && row.warehouseId === 'warehouse-main')!; runAction(store, 'stock-to-project', { siteId: 'site-north', items: [{ stockId: line.id, quantity: 3 }], date: '2026-10-19' }, actor); }
const bare = (t: { after: (fn: () => void) => void }) => { const store = new Store(':memory:'); seed(store); pinFlanges(store); flangesToNorth(store); t.after(() => store.close()); return store; };
const PAYLOADS: Record<string, Record<string, unknown>> = {
  'reserve-iso': { isoId: 'iso-3', date: '2026-10-27' }, 'start-iso': { isoId: 'iso-3', date: '2026-10-27' }, 'take-picklist': { reportNo: 'PL-2026-0002', date: '2026-10-27' },
  service: { spoolIds: ['spool-1'], companyId: 'service-pwht' }, 'move-spools': { spoolIds: ['spool-1'], laydownId: 'laydown-a' },
  'move-materials': { requirementIds: ['requirement-1'], laydownId: 'mlaydown-rack-1' },
  'picklist-note': { reportNo: '00001', note: 'Issued to J. de Vries' }, 'undo-iso-execution': { reportNo: '00002' }, 'move-materials-inventory': { requirementIds: ['requirement-1'] },
};

test('material status is the covered share of the requirement, rounded down, and empty without requirements', () => {
  assert.equal(materialStatus([]), null);
  assert.equal(materialStatus([{ required: 0, picked: 0, available: 5 }]), null);
  assert.equal(materialStatus([{ required: 10, picked: 4, available: 3 }]), 70);
  assert.equal(materialStatus([{ required: 10, picked: 8, available: 5 }]), 100);
  assert.equal(materialStatus([{ required: 3, picked: 0, available: 2 }]), 66);
  assert.equal(materialStatus([{ required: 200, picked: 199, available: 0 }]), 99);
  assert.equal(materialStatus([{ required: 10, picked: 10, available: 0 }, { required: 10, picked: 0, available: 0 }]), 50);
  assert.deepEqual([100, 99, 80, 79, 70, 69, 0, null].map(percentBand), ['100 %', '80–99 %', '80–99 %', '70–79 %', '70–79 %', '< 70 %', '< 70 %', '']);
});

test('the local sample spreads isometrics over every percentage band and the type filter narrows the lines', t => {
  const store = sample(t); const rows = rowsOf(store); const statuses = isoStatuses(rows);
  const bands = new Set([...statuses.values()].map(status => percentBand(status.percent)));
  for (const band of ['100 %', '80–99 %', '70–79 %', '< 70 %']) assert.ok(bands.has(band as never), band);
  assert.equal(statuses.get('iso-1')!.percent, 100);
  const valves = isoStatuses(rows, { phaseId: executionTypePhaseId(rows, 'Valves') });
  assert.deepEqual([...valves.keys()], ['iso-1']); assert.equal(valves.get('iso-1')!.lines.length, 1);
  assert.ok([...isoStatuses(rows, { phaseId: executionTypePhaseId(rows, 'Field') }).keys()].includes('iso-6'));
});

test('reserve sets the uncovered quantity aside from free stock so another isometric cannot take it', t => {
  const store = bare(t);
  // Three class 150 flanges are in stock; iso-3 needs twelve, iso-9 gets its own requirement of two.
  store.create('iso_materials', { isoId: 'iso-9', materialId: 'material-3', quantity: 2, phaseId: 'phase-1' }, actor, 'req-flange-9');
  const before = isoStatuses(rowsOf(store));
  assert.equal(before.get('iso-3')!.lines[0].available, 3); assert.equal(before.get('iso-9')!.lines.find(line => line.requirement.id === 'req-flange-9')!.available, 2);
  const result = runAction(store, 'reserve-iso', { isoId: 'iso-9', date: '2026-10-22' }, actor);
  assert.ok(result.records!.every(row => row.status === 'Reserved'));
  assert.equal(store.list('reservations').find(row => row.requirementId === 'req-flange-9')!.quantity, 2);
  const after = isoStatuses(rowsOf(store));
  assert.equal(after.get('iso-3')!.lines[0].available, 1, 'the other isometric only sees what is left');
  assert.equal(after.get('iso-9')!.lines.find(line => line.requirement.id === 'req-flange-9')!.available, 2, 'the owner keeps its reservation');
  assert.throws(() => runAction(store, 'reserve-iso', { isoId: 'iso-9', date: '2026-10-22' }, actor), /already picked|No free stock/);
  // iso-3 can reserve the rest, and nothing more.
  runAction(store, 'reserve-iso', { isoId: 'iso-3', date: '2026-10-23' }, actor);
  assert.equal(store.list('reservations').find(row => row.isoId === 'iso-3')!.quantity, 1);
  assert.throws(() => runAction(store, 'reserve-iso', { isoId: 'iso-3', date: '2026-10-23' }, actor), /No free stock/);
  // Releasing returns the quantity to the free pool.
  const reservation = store.list('reservations').find(row => row.requirementId === 'req-flange-9')!;
  runAction(store, 'release-reservation', { reservationIds: [reservation.id] }, actor);
  assert.equal(store.get('reservations', reservation.id).status, 'Released');
  assert.throws(() => runAction(store, 'release-reservation', { reservationIds: [reservation.id] }, actor), /already used or released/);
  assert.equal(isoStatuses(rowsOf(store)).get('iso-3')!.lines[0].available, 3, 'its own reserved flange plus the two released ones');
  assert.equal(planReserve(rowsOf(store), 'iso-9').length > 0, true);
  assert.throws(() => runAction(store, 'reserve-iso', { isoId: 'missing-iso' }, actor), /could not be found/);
});

// ---- Isometric execution: Start, Confirm material take, Undo execution, Move to inventory (every quantity by hand) ------

const PIPE = 'material-exe-pipe', BOLT = 'material-exe-bolt';
/**
 * EXE-01 in Cooling water (North site) needs 10 m of EXE-PIPE (Shop) and 4 sets of EXE-BOLT (Field). North's Material
 * inventory holds pipe 6 m on charge C-1 and 5 m on C-2 (11 m) and 3 bolt sets on K-1.
 *   Mat.status = (min(10, 11) + min(4, 3)) / 14 = 13 / 14 = 92.8 % → 92 %; Shop 10 / 10 = 100 %; Field 3 / 4 = 75 %.
 */
function execution(t: { after: (fn: () => void) => void }) {
  const store = bare(t);
  store.create('materials', { materialNo: 'EXE-PIPE', description: 'Pipe 2 in sch 40 A106B', materialGroup: 'Pipe', uom: 'm' }, actor, PIPE);
  store.create('materials', { materialNo: 'EXE-BOLT', description: 'Stud bolt set 5/8 in', materialGroup: 'Bolt', uom: 'SET' }, actor, BOLT);
  store.create('isometrics', { isoNo: 'EXE-01', projectId: 'project-cooling', priority: 'Prio 1' }, actor, 'iso-exe');
  store.create('iso_materials', { isoId: 'iso-exe', materialId: PIPE, quantity: 10, phaseId: 'phase-0' }, actor, 'req-a-pipe');
  store.create('iso_materials', { isoId: 'iso-exe', materialId: BOLT, quantity: 4, phaseId: 'phase-1' }, actor, 'req-b-bolt');
  for (const [materialId, chargeNo, quantity] of [[PIPE, 'C-1', 6], [PIPE, 'C-2', 5], [BOLT, 'K-1', 3]] as const) runAction(store, 'stock-add', { siteId: 'site-north', materialId, chargeNo, quantity, date: '2026-11-10' }, actor);
  return store;
}
/** What North's Material inventory holds of one material, per charge. */
const charges = (store: Store, materialId: string) => Object.fromEntries(store.list('stock').filter(row => row.locationKind === 'site' && row.siteId === 'site-north' && row.materialId === materialId).map(row => [String(row.chargeNo), Number(row.quantity)]).sort());
const percentOf = (store: Store, isoId: string, phaseId?: string) => isoStatuses(rowsOf(store), phaseId ? { phaseId } : {}).get(isoId)?.percent ?? null;
const lineOf = (store: Store, requirementId: string) => isoStatuses(rowsOf(store)).get(String(store.get('iso_materials', requirementId).isoId))!.lines.find(line => line.requirement.id === requirementId)!;
const board = (store: Store, phaseId: string) => executionBoard(rowsOf(store), { phaseId, from: 70, to: 100 }).map(entry => entry.iso.id);
const day = '2026-11-16';
/** Movements are written in the same millisecond: compare them as sets. */
const sorted = (lines: unknown[][]) => [...lines].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('delta-I3-R1 / mto-iso-execution-014 / scn-SC-D5: Start books the pick list out of the inventory at once and Undo execution puts back exactly what it took', t => {
  const store = execution(t);
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 6, 'C-2': 5 }, { 'K-1': 3 }]);
  assert.deepEqual([percentOf(store, 'iso-exe'), percentOf(store, 'iso-exe', 'phase-0'), percentOf(store, 'iso-exe', 'phase-1')], [92, 100, 75]);
  assert.ok(board(store, 'phase-0').includes('iso-exe') && board(store, 'phase-1').includes('iso-exe'));
  const movements = store.list('movements').length;
  const started = runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-0', date: day, note: 'Shop week 47' }, actor);
  const reportNo = String(started.records![0].reportNo); assert.match(reportNo, /^\d{5}$/);
  // One line per requirement: all 10 m of pipe, the 3 bolt sets that are there; Taken? No, already issued.
  assert.deepEqual(started.records!.map(line => [line.requirementId, line.quantity, line.taken, line.issued, line.note, line.phaseId]), [['req-a-pipe', 10, false, true, 'Shop week 47', 'phase-0'], ['req-b-bolt', 3, false, true, 'Shop week 47', 'phase-0']]);
  // The inventory drops at Start, charge by charge in charge order: pipe C-1 6 − 6 = 0, C-2 5 − 4 = 1; bolts K-1 3 − 3 = 0.
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 0, 'C-2': 1 }, { 'K-1': 0 }]);
  const log = `Isometric execution EXE-01 | Pick List ${reportNo}`;
  assert.deepEqual(sorted(store.list('movements').filter(move => move.pickListNo === reportNo).map(move => [move.materialId, move.chargeNo, move.quantity, move.type, move.note, move.siteId])),
    sorted([[PIPE, 'C-1', -6, 'Issue', log, 'site-north'], [PIPE, 'C-2', -4, 'Issue', log, 'site-north'], [BOLT, 'K-1', -3, 'Issue', log, 'site-north']]));
  assert.equal(store.list('movements').length, movements + 3);
  // Picked = the issued lines (10 and 3), Inv. = what is left (1 and 0); nothing is claimed twice, the status stays 92 %.
  assert.deepEqual(requirementExecution(rowsOf(store), { isoId: 'iso-exe' }).map(entry => [entry.picked, entry.inventory]), [[10, 1], [3, 0]]);
  assert.deepEqual([lineOf(store, 'req-a-pipe').claimed, lineOf(store, 'req-a-pipe').picked, percentOf(store, 'iso-exe')], [0, 10, 92]);
  // An issued line is no claim on the stock: another isometric can still count the one metre that is left.
  store.create('iso_materials', { isoId: 'iso-9', materialId: PIPE, quantity: 2, phaseId: 'phase-0' }, actor, 'req-exe-other');
  assert.equal(lineOf(store, 'req-exe-other').available, 1);
  // scn-SC-D5: started from Shop, EXE-01 leaves the Shop board (the Field board still lists it: 3 of 4 bolts = 75 %); Start again from Shop is refused.
  assert.equal(board(store, 'phase-0').includes('iso-exe'), false); assert.ok(board(store, 'phase-1').includes('iso-exe'));
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-0', date: day }, actor), /already started for this type/);
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-1', date: day }, actor), /None of the missing materials is in stock/);
  assert.deepEqual(startedReports(rowsOf(store), 'iso-exe'), [reportNo]);
  // Undo execution: every Issue of the pick list comes back on its own charge (+6 C-1, +4 C-2, +3 K-1).
  const undone = runAction(store, 'undo-iso-execution', { reportNo }, actor);
  assert.equal(undone.records!.length, 2); assert.ok(undone.records!.every(line => line._archived === true), 'the pick list is archived, never deleted');
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 6, 'C-2': 5 }, { 'K-1': 3 }]);
  assert.deepEqual(sorted(store.list('movements').filter(move => move.pickListNo === reportNo && move.type === 'Return to inventory').map(move => [move.materialId, move.chargeNo, move.quantity, move.note])),
    sorted([[PIPE, 'C-1', 6, `Undo execution EXE-01 | Pick List ${reportNo}`], [PIPE, 'C-2', 4, `Undo execution EXE-01 | Pick List ${reportNo}`], [BOLT, 'K-1', 3, `Undo execution EXE-01 | Pick List ${reportNo}`]]));
  assert.equal(store.list('picklists').filter(line => line.reportNo === reportNo).length, 0);
  assert.equal(store.list('picklists', true).filter(line => line.reportNo === reportNo && line._archived).length, 2);
  // Not started again: back on the Shop board with the status of before; Picked 0, Inv. 11 and 3 again.
  assert.deepEqual(startedReports(rowsOf(store), 'iso-exe'), []);
  assert.ok(board(store, 'phase-0').includes('iso-exe')); assert.equal(percentOf(store, 'iso-exe'), 92);
  assert.deepEqual(requirementExecution(rowsOf(store), { isoId: 'iso-exe' }).map(entry => [entry.picked, entry.inventory]), [[0, 11], [0, 3]]);
  assert.throws(() => runAction(store, 'undo-iso-execution', { reportNo }, actor), /could not be found/);
});

test('mto-iso-execution-014: Undo execution releases the isometric’s reservations and returns a start that used part of them', t => {
  const store = execution(t);
  // Reserve: pipe 10 of the free 11, bolts 3 of 3.
  runAction(store, 'reserve-iso', { isoId: 'iso-exe', date: day }, actor);
  const reserved = () => Object.fromEntries(store.list('reservations').filter(row => row.isoId === 'iso-exe').map(row => [row.materialId, [row.status, row.quantity]]));
  assert.deepEqual(reserved(), { [PIPE]: ['Reserved', 10], [BOLT]: ['Reserved', 3] });
  // Two metres are written off from the inventory (charge order: C-1 6 → 4), so pipe has 9 left for its reservation of 10.
  runAction(store, 'inventory-remove', { siteId: 'site-north', materialId: PIPE, quantity: 2, comment: 'Damaged in transport' }, actor);
  assert.deepEqual(charges(store, PIPE), { 'C-1': 4, 'C-2': 5 });
  const started = runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-0', date: day }, actor); const reportNo = String(started.records![0].reportNo);
  assert.deepEqual(started.records!.map(line => line.quantity), [9, 3]);
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 0, 'C-2': 0 }, { 'K-1': 0 }]);
  // The pick list used 9 of the 10 reserved metres (1 stays reserved) and all 3 bolt sets.
  assert.deepEqual(reserved(), { [PIPE]: ['Reserved', 1], [BOLT]: ['Used', 3] });
  runAction(store, 'undo-iso-execution', { reportNo }, actor);
  // Back: C-1 0 + 4 = 4, C-2 0 + 5 = 5, K-1 0 + 3 = 3; the remaining reservation is released, the used one stays used.
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 4, 'C-2': 5 }, { 'K-1': 3 }]);
  assert.deepEqual(reserved(), { [PIPE]: ['Released', 1], [BOLT]: ['Used', 3] });
  assert.equal(lineOf(store, 'req-a-pipe').available, 9, 'the nine metres are free stock again');
});

test('mto-iso-execution-015: Confirm material take records the Note and moves no stock; the Note can be edited; a taken pick list cannot be undone', t => {
  const store = execution(t);
  const reportNo = String(runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-0', date: day }, actor).records![0].reportNo);
  const stock = () => JSON.stringify(store.list('stock').map(row => [row.id, row.quantity]));
  const after = stock(), movements = store.list('movements').length;
  assert.throws(() => runAction(store, 'take-picklist', { reportNo, date: '2026-11-15' }, actor), /before the pick list date/);
  assert.throws(() => runAction(store, 'take-picklist', { reportNo, date: day, note: 'x'.repeat(2001) }, actor), /too long/);
  const taken = runAction(store, 'take-picklist', { reportNo, date: day, note: 'Issued to J. de Vries' }, actor);
  assert.deepEqual(taken.records!.map(line => [line.taken, line.takenDate, line.note]), [[true, day, 'Issued to J. de Vries'], [true, day, 'Issued to J. de Vries']]);
  assert.equal(stock(), after, 'taking booked out at Start: no stock moves again'); assert.equal(store.list('movements').length, movements);
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 0, 'C-2': 1 }, { 'K-1': 0 }]);
  assert.deepEqual(requirementExecution(rowsOf(store), { isoId: 'iso-exe' }).map(entry => entry.picked), [10, 3]);
  assert.equal(pickListReports(rowsOf(store)).find(report => report.reportNo === reportNo)!.note, 'Issued to J. de Vries');
  // Edit of the note (#materialTakeEdit): the lines change, the stock does not.
  runAction(store, 'picklist-note', { reportNo, note: 'Issued to J. de Vries, foreman shop' }, actor);
  assert.ok(store.list('picklists').filter(line => line.reportNo === reportNo).every(line => line.note === 'Issued to J. de Vries, foreman shop'));
  assert.equal(stock(), after); assert.equal(store.list('movements').length, movements);
  assert.throws(() => runAction(store, 'picklist-note', { reportNo: '99999', note: 'x' }, actor), /could not be found/);
  // Undo is refused once the take is confirmed, and changes nothing.
  assert.throws(() => runAction(store, 'undo-iso-execution', { reportNo }, actor), /already taken/);
  assert.equal(stock(), after); assert.equal(store.list('picklists').filter(line => line.reportNo === reportNo).length, 2);
  assert.throws(() => runAction(store, 'take-picklist', { reportNo, date: day }, actor), /already taken/);
});

test('mto-iso-execution-013: Start is allowed from a Mat.status of 70 %, and its Note stays on the pick list', t => {
  const store = execution(t);
  assert.deepEqual([null, 0, 69, 70, 100].map(value => canStartAt(value)), [false, false, false, true, true]);
  // STX-CW-003 needs 12 flanges (3 in North) and gets 88 m of a plate: 100 units, covered 3 + plate stock.
  store.create('materials', { materialNo: 'EXE-PLATE', description: 'Plate 10 mm', materialGroup: 'Plate', uom: 'm' }, actor, 'material-exe-plate');
  store.create('iso_materials', { isoId: 'iso-3', materialId: 'material-exe-plate', quantity: 88, phaseId: 'phase-0' }, actor, 'req-exe-plate');
  runAction(store, 'stock-add', { siteId: 'site-north', materialId: 'material-exe-plate', chargeNo: 'P-1', quantity: 66, date: day }, actor);
  assert.equal(percentOf(store, 'iso-3'), 69, '(3 + 66) / 100');
  const stock = JSON.stringify(store.list('stock').map(row => [row.id, row.quantity]));
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-3', date: day }, actor), /from a material status of 70 %\. This isometric is at 69 %/);
  assert.equal(JSON.stringify(store.list('stock').map(row => [row.id, row.quantity])), stock, 'a refused Start moves nothing');
  runAction(store, 'stock-add', { siteId: 'site-north', materialId: 'material-exe-plate', chargeNo: 'P-1', quantity: 1, date: day }, actor);
  assert.equal(percentOf(store, 'iso-3'), 70);
  const started = runAction(store, 'start-iso', { isoId: 'iso-3', date: day, note: 'Rush: shutdown week' }, actor);
  assert.deepEqual(started.records!.map(line => [line.materialId, line.quantity, line.note, line.phaseId]), [['material-3', 3, 'Rush: shutdown week', ''], ['material-exe-plate', 67, 'Rush: shutdown week', '']]);
  // The Type chip decides the threshold when it is given: Field of EXE-01 is at 75 %, a type without lines is refused.
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-2', date: day }, actor), /no materials of this type/);
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-missing', date: day }, actor), /could not be found/);
});

test('delta-I3-R1: a pick list written before Start issued stock still claims its quantity until it is taken, and its undo returns nothing', t => {
  const store = execution(t);
  const old = (reportNo: string, quantity: number) => store.create('picklists', { number: `PICK-${reportNo}`, reportNo, isoId: 'iso-exe', materialId: PIPE, requirementId: 'req-a-pipe', warehouseId: '', siteId: 'site-north', quantity, date: '2026-11-01', chargeNo: '', taken: false }, actor);
  old('00090', 4);
  // The stock is still there (11 m) but 4 m are claimed: picked 0, claimed 4, available 11 − 4 = 7 → covered min(10, 4 + 6) = 10.
  assert.deepEqual(charges(store, PIPE), { 'C-1': 6, 'C-2': 5 });
  assert.deepEqual([lineOf(store, 'req-a-pipe').picked, lineOf(store, 'req-a-pipe').claimed, lineOf(store, 'req-a-pipe').available], [0, 4, 6]);
  assert.equal(requirementExecution(rowsOf(store), { isoId: 'iso-exe' })[0].inventory, 7);
  // Taking it issues the 4 m now, as before: C-1 6 → 2.
  runAction(store, 'take-picklist', { reportNo: '00090', date: day }, actor);
  assert.deepEqual(charges(store, PIPE), { 'C-1': 2, 'C-2': 5 });
  assert.deepEqual(store.list('movements').filter(move => move.pickListNo === '00090').map(move => [move.chargeNo, move.quantity, move.type]), [['C-1', -4, 'Issue']]);
  assert.equal(lineOf(store, 'req-a-pipe').picked, 4);
  // An old untaken pick list never took stock: undoing it archives its lines and puts nothing back.
  old('00091', 2);
  runAction(store, 'undo-iso-execution', { reportNo: '00091' }, actor);
  assert.deepEqual(charges(store, PIPE), { 'C-1': 2, 'C-2': 5 });
  assert.equal(store.list('picklists').some(line => line.reportNo === '00091'), false);
  // A line issued directly (no report number) is not an execution pick list.
  const direct = runAction(store, 'issue-material', { isoId: 'iso-exe', materialSource: 'Catalog', materialId: BOLT, requirementId: 'req-b-bolt', quantity: 1, date: day }, actor).record!;
  assert.throws(() => runAction(store, 'undo-iso-execution', { reportNo: String(direct.number) }, actor), /Only a pick list made by Start/);
});

test('mto-logistics-010: Move to inventory puts the issued material back into the site inventory, charge by charge, and the line is no longer picked', t => {
  const store = execution(t);
  const reportNo = String(runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-0', date: day }, actor).records![0].reportNo);
  store.create('material_laydowns', { name: 'Pipe rack 1' }, actor, 'mlaydown-rack-1');
  runAction(store, 'move-materials', { requirementIds: ['req-a-pipe'], laydownId: 'mlaydown-rack-1', date: day }, actor);
  assert.deepEqual(charges(store, PIPE), { 'C-1': 0, 'C-2': 1 });
  runAction(store, 'move-materials-inventory', { requirementIds: ['req-a-pipe'], date: day }, actor);
  // Back as it left: C-1 0 + 6 = 6, C-2 1 + 4 = 5; the bolts stay issued.
  assert.deepEqual([charges(store, PIPE), charges(store, BOLT)], [{ 'C-1': 6, 'C-2': 5 }, { 'K-1': 0 }]);
  assert.deepEqual(sorted(store.list('movements').filter(move => move.type === 'Return to inventory' && move.materialId === PIPE).map(move => [move.chargeNo, move.quantity])), [['C-1', 6], ['C-2', 4]]);
  assert.deepEqual(requirementExecution(rowsOf(store), { isoId: 'iso-exe' }).map(entry => [entry.picked, entry.inventory]), [[0, 11], [3, 0]]);
  assert.equal(percentOf(store, 'iso-exe'), 92, 'the pipe is covered by free stock again: (10 + 3) / 14');
  assert.equal(store.list('picklists').find(line => line.reportNo === reportNo && line.materialId === PIPE)!.returned, true);
  const location = store.list('material_locations').find(row => row.requirementId === 'req-a-pipe')!;
  assert.deepEqual([location.laydownId, location.companyId], ['', '']);
  assert.deepEqual(materialHistory(rowsOf(store), 'req-a-pipe').map(entry => entry.location), ['Inventory', 'mlaydown-rack-1']);
  // Nothing issued is left on the pipe line; a pick list with material moved back cannot be undone.
  assert.throws(() => runAction(store, 'move-materials-inventory', { requirementIds: ['req-a-pipe'], date: day }, actor), /nothing to move back/);
  assert.throws(() => runAction(store, 'undo-iso-execution', { reportNo }, actor), /moved back to the inventory/);
  assert.deepEqual(charges(store, PIPE), { 'C-1': 6, 'C-2': 5 });
});

test('delta-I3-001 / mto-iso-execution-017: a Type chip is one operation phase; the board filters by percent and priority, highest status first', t => {
  const store = sample(t);
  store.create('iso_materials', { isoId: 'iso-2', materialId: 'material-9', quantity: 1, phaseId: 'phase-3' }, actor, 'req-support-shop');
  const rows = rowsOf(store); const shop = executionTypePhaseId(rows, 'Shop');
  assert.deepEqual(EXECUTION_TYPES.map(type => executionTypePhaseId(rows, type)), ['phase-0', 'phase-1', 'phase-5']);
  assert.equal(executionTypePhaseId(rows, 'Bernecker'), '');
  // 'Support Shop' is not Shop.
  assert.equal(isoStatuses(rows, { phaseId: shop }).get('iso-2')!.lines.some(line => line.requirement.id === 'req-support-shop'), false);
  assert.ok(isoStatuses(rows, { phaseId: 'phase-3' }).get('iso-2')!.lines.some(line => line.requirement.id === 'req-support-shop'));
  const list = executionBoard(rows, { phaseId: shop, ...DEFAULT_PERCENT_RANGE });
  assert.ok(list.length > 0 && list.every(entry => entry.percent >= 70 && entry.status.lines.every(line => String(line.requirement.phaseId) === shop)));
  assert.deepEqual(list.map(entry => entry.percent), [...list.map(entry => entry.percent)].sort((a, b) => b - a));
  const all = executionBoard(rows, { phaseId: shop, from: 0, to: 100 });
  assert.ok(all.some(entry => entry.percent < 70), 'the All chip shows the isometrics below 70 % as well');
  assert.deepEqual(executionBoard(rows, { phaseId: '', from: 0, to: 100 }), []);
  assert.ok(executionBoard(rows, { phaseId: shop, from: 0, to: 100, prio: 'Prio-1' }).every(entry => entry.priority === 'Prio-1'));
  assert.deepEqual(['Prio 1', 'Critical', '', 'Prio 3', 'No priority'].map(executionPriority), ['Prio-1', 'Prio-1', 'Prio not set', 'Prio-3', 'Prio not set']);
  assert.deepEqual(PERCENT_CHIPS.map(chip => [chip.label, chip.from, chip.to]), [['All', 0, 100], ['100%', 100, 100], ['80 – 99%', 80, 99], ['70 – 79%', 70, 79], ['< 70%', 0, 69]]);
  assert.deepEqual([...EXECUTION_EXPORT_COLUMNS], ['Project', 'ISO', 'Piping class', 'Priority', 'Drawing no. 1', 'Chemical clean', 'Mat.status']);
  // The seed started STX-CW-001 without a Type: like the reference's 00022 it stays on the board.
  assert.ok(startedReports(rows, 'iso-1').length > 0); assert.ok(all.some(entry => entry.iso.id === 'iso-1'));
  // Reserved materials (Print): per reservation, or summed per material.
  const lines = reservedMaterials(rows, { grouped: false }); const grouped = reservedMaterials(rows, { grouped: true });
  assert.ok(lines.length > 0);
  const total = (items: { quantity: number }[]) => items.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(total(grouped), total(lines)); assert.equal(new Set(grouped.map(line => line.materialNo)).size, grouped.length);
});

test('mto-iso-execution-016: the archive lists date and time, exports its five columns and opens on the last 30 days to the end of the month', () => {
  assert.deepEqual([...PICKLIST_ARCHIVE_COLUMNS], ['Date', 'Report No.', 'Project', 'ISO No', 'Taken?']);
  assert.deepEqual(archiveDefaultRange('2026-11-16'), { from: '2026-10-17', to: '2026-11-30' });
  const line = (date: string, createdAt: string) => ({ id: createdAt, date, _createdAt: createdAt } as unknown as Row);
  assert.equal(pickListStamp([line('2026-11-16', '2026-11-16T07:44:00.000Z')]), '2026-11-16T07:44:00.000Z', 'started today: date and time');
  assert.equal(pickListStamp([line('2026-10-23', '2026-11-16T07:44:00.000Z')]), '2026-10-23', 'dated another day: the day only');
});

test('mto-logistics-010 / delta-I3-010: Service req. - Materials opens on group SUPPORT, shows "No update" and the Material history, and sends lines on no laydown', t => {
  const store = sample(t);
  assert.equal(defaultMaterialGroup(rowsOf(store)), 'Support', 'the sample writes the group Support');
  store.create('materials', { materialNo: 'SUP-X1', description: 'Pipe shoe', materialGroup: 'SUPPORT', uom: 'EA' }, actor);
  assert.equal(defaultMaterialGroup(rowsOf(store)), 'SUPPORT');
  assert.equal(defaultMaterialGroup({ materials: [{ id: 'a', materialGroup: 'Valve' }, { id: 'b', materialGroup: 'Bolt' }] as unknown as Row[] }), 'Bolt', 'else the first group A-Z');
  const rows = rowsOf(store); const label = (resource: string, id: string) => String(rows[resource]?.find(row => row.id === id)?.name ?? id);
  const valves = materialServiceRows(rows, { group: 'Valve' }, label);
  const valve = valves.find(entry => entry.requirement.id === 'requirement-field-1')!;
  assert.ok(valves.every(entry => entry.material.materialGroup === 'Valve'));
  assert.equal(materialCurrentLabel(valve, label), 'Delta Blast & Paint');
  const free = valves.find(entry => !entry.locationId)!; assert.equal(materialCurrentLabel(free, label), 'No update');
  assert.deepEqual(materialServiceRows(rows, { group: 'Valve', currently: 'Service:service-blast' }, label).map(entry => entry.requirement.id), ['requirement-field-1']);
  assert.ok(materialServiceRows(rows, { group: 'Valve', keyword: 'cs-v' }, label).length > 0);
  // Material history: newest first, with the request number on the service entry.
  const request = store.list('service_requests').find(row => row.requirementId === 'requirement-field-1')!;
  assert.deepEqual(materialHistory(rows, 'requirement-field-1', label).map(entry => [entry.date, entry.location, entry.orderNo]), [['2026-10-25', 'Delta Blast & Paint', String(request.number)], ['2026-10-22', 'Valve cage', '']]);
  assert.deepEqual(materialHistory(rows, free.requirement.id, label), []);
  // A line on no laydown can be sent to a service company; the request carries the user's name.
  const sent = runAction(store, 'service-materials', { requirementIds: [free.requirement.id], companyId: 'service-pwht', note: 'Coating' }, { id: 'u1', name: 'Matej Spisak' });
  assert.equal(sent.records![0].name, 'Matej Spisak'); assert.equal(store.list('material_locations').find(row => row.requirementId === free.requirement.id)!.companyId, 'service-pwht');
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual([...hosted.actions['service-materials']].sort(), ['companyId', 'note', 'requirementIds']);
  assert.deepEqual([...hosted.actions['move-materials-inventory']], ['requirementIds']);
  assert.deepEqual([...hosted.actions['start-iso']].sort(), ['date', 'isoId', 'note', 'phaseId']);
  assert.ok(['picklist-note', 'undo-iso-execution', 'take-picklist'].every(key => hosted.actions[key]?.includes('reportNo')));
  assert.equal(ACTIONS['undo-iso-execution'].description, 'This will reverse the pick list, release reservations and return materials to inventory if already issued. The isometric will appear on the execution board again. Continue?');
});

test('pick lists issued directly count as taken and the archive groups lines per report with date and project filters', t => {
  const store = sample(t); const rows = rowsOf(store);
  const reports = pickListReports(rows);
  assert.ok(reports.some(report => report.reportNo.startsWith('PICK-') && report.taken), 'a line issued directly stands alone and is taken');
  assert.equal(reports.filter(report => /^\d{5}$/.test(report.reportNo)).length, 2);
  assert.deepEqual(reports.map(report => report.date), [...reports.map(report => report.date)].sort().reverse());
  const open = reports.find(report => !report.taken)!; assert.equal(open.lines.length, 2); assert.ok(open.lines.every(line => line.taken === false));
  assert.ok(pickListReports(rows, { from: '2026-10-25' }).every(report => report.date >= '2026-10-25'));
  assert.ok(pickListReports(rows, { to: '2026-10-19' }).every(report => report.date <= '2026-10-19'));
  assert.deepEqual(pickListReports(rows, { projectId: 'project-skid' }).map(report => report.isoId), ['iso-7']);
  assert.deepEqual(pickListReports(rows, { projectId: 'project-steam' }).map(report => report.isoId), ['iso-5']);
  assert.deepEqual(pickListReports(rows, { projectId: 'project-cooling' }).map(report => report.isoId), ['iso-1']);
});

test('spool locations show the service company, the laydown or nothing, and requests group by number in the archive', t => {
  const store = sample(t); const rows = rowsOf(store);
  assert.deepEqual(spoolLocation({ serviceCompanyId: 'c', laydownId: 'l' } as unknown as Row), { type: 'Service', id: 'c' });
  assert.deepEqual(spoolLocation({ laydownId: 'l' } as unknown as Row), { type: 'Laydown', id: 'l' });
  // mto-logistics-002: a spool on no laydown and at no company is on nothing; the app invents no "Transport" place.
  assert.deepEqual(spoolLocation({} as unknown as Row), { type: '', id: '' });
  const spools = spoolRows(rows);
  assert.ok(spools.every(entry => (entry.location.type as string) !== 'Transport'));
  assert.equal(spools.find(entry => entry.spool.id === 'spool-2')!.location.type, 'Service');
  assert.equal(spools.find(entry => entry.spool.id === 'spool-3')!.location.id, 'laydown-c');
  assert.equal(spools.find(entry => entry.spool.id === 'spool-2')!.openRequest!.includeDrawings, true);
  assert.deepEqual(spoolRows(rows, { projectId: 'project-skid' }).map(entry => entry.iso.projectId), ['project-skid', 'project-skid', 'project-skid']);
  // One request for two spools is one archive line.
  const created = runAction(store, 'service', { spoolIds: ['spool-1', 'spool-5'], companyId: 'service-pwht', name: 'Batch 2', includeDrawings: false, date: '2026-10-27' }, actor);
  assert.equal(created.records!.length, 2); assert.ok(created.records!.every(row => row.includeDrawings === false));
  const archive = requestArchive(rowsOf(store), { kind: 'Spool' });
  const batch = archive.find(request => request.name === 'Batch 2')!; assert.equal(batch.items.length, 2); assert.equal(batch.kind, 'Spool'); assert.equal(batch.status, 'Requested'); assert.equal(batch.openIds.length, 2);
  assert.ok(requestArchive(rowsOf(store), { kind: 'Material' }).some(request => request.kind === 'Material' && request.status === 'Requested'));
  assert.ok(archive.some(request => request.status === 'Completed' && request.completedAt === '2026-10-22'));
  assert.deepEqual(requestArchive(rowsOf(store), { kind: 'Spool', from: '2026-10-27' }).map(request => request.name), ['Batch 2']);
  assert.deepEqual(archive.map(request => request.date), [...archive.map(request => request.date)].sort().reverse());
  // Moving the spools to a laydown is their return: the open requests close and the spools are on the laydown, not on "Transport".
  runAction(store, 'move-spools', { spoolIds: batch.openIds.map(id => store.get('service_requests', id).spoolId), laydownId: 'laydown-a', date: '2026-10-28' }, actor);
  assert.equal(spoolRows(rowsOf(store)).find(entry => entry.spool.id === 'spool-1')!.location.id, 'laydown-a');
  assert.equal(requestArchive(rowsOf(store), { kind: 'Spool' }).find(request => request.name === 'Batch 2')!.status, 'Completed');
});

test('mto-logistics-007: request numbers are five digits and continue after the highest one', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  assert.equal(nextRequestNumber([]), '00001'); assert.equal(nextRequestNumber(['SR-2026-0007', '00002']), '00003'); assert.equal(nextRequestNumber(['00009', '00010']), '00011');
  const numberOf = (result: { records?: Row[] }) => String(result.records![0].number);
  const first = runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht' }, actor);
  assert.match(numberOf(first), /^\d{5}$/);
  const second = runAction(store, 'service', { spoolIds: ['spool-5'], companyId: 'service-pwht' }, actor);
  assert.equal(Number(numberOf(second)), Number(numberOf(first)) + 1);
  // A material request takes the next number of the same sequence; old SR-2026-nnnn numbers stay as stored.
  const third = runAction(store, 'move-spools', { spoolIds: ['spool-1'], laydownId: 'laydown-a' }, actor); assert.equal(third.resource, 'spools');
  const fourth = runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht' }, actor);
  assert.equal(Number(numberOf(fourth)), Number(numberOf(second)) + 1);
});

test('mto-logistics-007: a third request after 00001 and 00002 is numbered 00003', t => {
  const store = new Store(':memory:'); t.after(() => store.close()); seed(store);
  for (const [number, id] of [['00001', 'spool-1'], ['00002', 'spool-2']] as const) store.create('service_requests', { number, spoolId: id, companyId: 'service-coating', date: '2026-10-01', status: 'Completed' }, actor);
  const result = runAction(store, 'service', { spoolIds: ['spool-3'], companyId: 'service-coating', date: '2026-10-27' }, actor);
  assert.equal(result.records![0].number, '00003');
});

test('mto-logistics-003: a hosted service request is named after the signed-in user and stamped now, whatever the client sent', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  const result = runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht', name: 'Client name', date: '2020-01-01', note: 'Pick up Monday', includeDrawings: true }, { id: 'u1', name: 'Matej Spisak' }, { hosted: true });
  const request = result.records![0];
  assert.equal(request.name, 'Matej Spisak'); assert.equal(request.addedBy, 'Matej Spisak'); assert.equal(request.date, new Date().toISOString().slice(0, 10));
  assert.ok(Math.abs(Date.parse(String(request.requestedAt)) - Date.now()) < 60_000, 'the request carries the time it was made');
  assert.equal(request.note, 'Pick up Monday'); assert.equal(request.includeDrawings, true);
  // The dialog of the hosted profile has exactly these fields; the other profiles keep Name and Date.
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual([...hosted.actions.service].sort(), ['companyId', 'includeDrawings', 'note', 'spoolIds']);
  assert.deepEqual([...hosted.actions['move-spools']].sort(), ['laydownId', 'spoolIds']);
  assert.deepEqual([...hosted.actions['move-materials']].sort(), ['laydownId', 'requirementIds']);
});

test('mto-logistics-013 / -006: moves are stored as spool history, and a spool at a service company returns by Move to laydown', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  const history = () => spoolHistory(rowsOf(store), 'spool-1');
  assert.deepEqual(history(), [], 'existing spools have no history until their first move');
  runAction(store, 'move-spools', { spoolIds: ['spool-1'], laydownId: 'laydown-a', date: '2026-11-01' }, actor);
  const request = runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-11-02' }, actor).records![0];
  runAction(store, 'move-spools', { spoolIds: ['spool-1'], laydownId: 'laydown-b', date: '2026-11-03' }, actor);
  assert.deepEqual(history().map(entry => [entry.type, entry.location]), [['Laydown', 'Laydown B — Field'], ['Service', `Ord. No. ${request.number} Thermotech Heat Treatment`], ['Laydown', 'Laydown A — Prefab']]);
  // The return closed the request, with the move date.
  assert.equal(store.get('service_requests', request.id).status, 'Completed'); assert.equal(store.get('service_requests', request.id).completedAt, '2026-11-03');
  assert.equal(store.get('spools', 'spool-1').serviceCompanyId, ''); assert.equal(store.get('spools', 'spool-1').laydownId, 'laydown-b');
  // There is no Complete step left in the model.
  assert.equal(ACTIONS['complete-service'], undefined); assert.equal(ACTIONS['complete-material-service'], undefined);
  assert.equal(ACTIONS.service.fields.some(field => field.name === 'laydownId'), false); assert.equal(ACTIONS['service-materials'].fields.some(field => field.name === 'materialLaydownId'), false);
  assert.throws(() => runAction(store, 'complete-service', { requestIds: [request.id] }, actor), /does not exist/);
});

test('mto-logistics-017: a laydown lists the spools on it with their requests, and its history every spool that was moved onto it', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  runAction(store, 'move-spools', { spoolIds: ['spool-1'], laydownId: 'laydown-a', date: '2026-11-01' }, actor);
  runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-11-02' }, actor);
  assert.deepEqual(laydownContent(rowsOf(store), 'laydown-a').map(line => line.spool.id).includes('spool-1'), false, 'a spool at a service company is not on the laydown');
  runAction(store, 'move-spools', { spoolIds: ['spool-1'], laydownId: 'laydown-a', date: '2026-11-03' }, actor);
  const line = laydownContent(rowsOf(store), 'laydown-a').find(entry => entry.spool.id === 'spool-1')!;
  assert.equal(line.services, 1); assert.equal(line.treatments.chemicalClean, String(store.get('isometrics', String(line.spool.isoId)).chemicalClean ?? ''));
  assert.equal(laydownHistory(rowsOf(store), 'laydown-a').filter(entry => entry.spool.id === 'spool-1').length, 2, 'moved onto it twice');
});

test('mto-catalogs-022: Paint spec., PWHT and Chemical clean of a spool are its isometric’s', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  const isoId = String(store.get('spools', 'spool-1').isoId);
  const iso = store.get('isometrics', isoId); store.update('isometrics', isoId, { paintSpec: 'A10', chemicalClean: 'N/A', pwht: true }, iso._version, actor);
  const spool = store.get('spools', 'spool-1'); store.update('spools', 'spool-1', { paintSpec: 'stale copy', chemicalClean: 'stale copy', pwht: false }, spool._version, actor);
  const entry = spoolRows(rowsOf(store)).find(row => row.spool.id === 'spool-1')!;
  assert.deepEqual([entry.paintSpec, entry.chemicalClean, entry.pwht], ['A10', 'N/A', true]);
  assert.equal(store.get('spools', 'spool-1').paintSpec, 'stale copy', 'the stored spool values are kept');
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(['paintSpec', 'chemicalClean', 'pwht'].every(name => !hosted.resources.spools.includes(name) && hosted.resources.isometrics.includes(name)));
});

test('mto-logistics-012 / -015: the spool filters, the default order (Last request) and the Excel export lines', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM); const rows = rowsOf(store);
  const label = (resource: string, id: string) => String(rows[resource]?.find(row => row.id === id)?.name ?? id);
  const all = spoolRows(rows); assert.ok(all.length > 4);
  const numbers = all.map(entry => entry.lastRequest ? String(entry.lastRequest.number) : '');
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), 'Last request ascending, spools without a request first');
  assert.equal(numbers[0], '');
  const request = all.find(entry => entry.lastRequest)!; const number = String(request.lastRequest!.number);
  assert.ok(spoolRows(rows, { lastReport: number }).every(entry => entry.lastRequest?.number === number));
  assert.deepEqual(spoolRows(rows, { currently: `Service:${request.location.id}` }).every(entry => entry.location.type === 'Service'), true);
  const withPaint = all.find(entry => entry.paintSpec)!;
  assert.ok(spoolRows(rows, { paintSpec: withPaint.paintSpec.slice(1, 4).toLowerCase() }).every(entry => entry.paintSpec.toLowerCase().includes(withPaint.paintSpec.slice(1, 4).toLowerCase())));
  assert.deepEqual(spoolRows(rows, { spoolName: String(all[0].spool.name) }).every(entry => entry.spool.name === all[0].spool.name), true);
  const lines = spoolExportLines(rows, {}, label); assert.equal(lines.length, all.length); assert.equal(lines[0][2], String(all[0].spool.name));
});

test('mto-logistics-008 / -009 / scn-SC-N8: the archive lists one type, with the creating user, newest first or oldest first, from the last 30 days; an attached document shows in its row', t => {
  assert.deepEqual(archiveDefaultRange('2026-11-16'), { from: '2026-10-17', to: '2026-11-30' });
  assert.deepEqual(archiveDefaultRange('2026-03-05'), { from: '2026-02-03', to: '2026-03-31' });
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  const made = runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-11-10' }, { id: 'u1', name: 'Matej Spisak' }).records![0];
  const spools = requestArchive(rowsOf(store), { kind: 'Spool' }); const materials = requestArchive(rowsOf(store), { kind: 'Material' });
  assert.ok(spools.every(request => request.kind === 'Spool') && materials.every(request => request.kind === 'Material') && materials.length > 0);
  assert.equal(spools.find(request => request.number === made.number)!.addedBy, 'Matej Spisak');
  assert.deepEqual(requestArchive(rowsOf(store), { kind: 'Spool', sort: 'asc' }).map(request => request.number), [...spools].reverse().map(request => request.number));
  assert.equal(requestArchive(rowsOf(store), { kind: 'Spool', from: '2026-11-01', to: '2026-11-30' }).length, 1);
  // SC-N8: a document attached to the request (the generic file route) is part of its archive row.
  assert.deepEqual(spools.find(request => request.number === made.number)!.documents, []);
  store.create('attachments', { name: 'signed-release.pdf', entityType: 'service_requests', entityId: made.id, documentType: 'Signed release document', mime: 'application/pdf', size: 12 }, actor);
  const row = requestArchive(rowsOf(store), { kind: 'Spool' }).find(request => request.number === made.number)!;
  assert.deepEqual(row.documents.map(document => document.name), ['signed-release.pdf']);
});

test('service companies need an address and the logistics resources carry the new fields', () => {
  assert.equal(RESOURCE_MAP.service_companies.fields.find(field => field.name === 'address')!.required, true);
  const store = new Store(':memory:'); try {
    assert.throws(() => store.create('service_companies', { name: 'No address' }, actor), (error: { fields?: Record<string, string> }) => error.fields?.address === 'Address is required.');
    assert.equal(store.create('service_companies', { name: 'Complete', address: '1 Dock Road', phone: '+31 10 555 0100', email: 'a@example.com' }, actor).address, '1 Dock Road');
    assert.throws(() => store.create('reservations', { isoId: 'x', requirementId: 'y', quantity: 1 }, actor), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.isoId));
  } finally { store.close(); }
  assert.ok(RESOURCE_MAP.picklists.fields.some(field => field.name === 'reportNo') && RESOURCE_MAP.picklists.fields.some(field => field.name === 'taken'));
  // The general hosted preparation (server/hosted-schema.ts) derives every table from RESOURCES: on an empty database it
  // creates reservations with its reference columns and its unique rule on requirementId.
  const plan = planHostedSchema({ tables: new Map(), columns: new Map(), foreignKeys: new Map(), indexes: new Map() });
  assert.ok(plan.tables.includes('reservations'), 'the hosted database prepares the new table');
  assert.ok(['isoId', 'requirementId', 'materialId', 'customMaterialId'].every(field => plan.columns.some(column => column.table === 'reservations' && column.field === field)));
  assert.ok(plan.indexes.some(index => index.table === 'reservations'));
  // mto-logistics-013: the spool history is a new record type; the upgrade creates its table and leaves every existing row valid.
  assert.ok(plan.tables.includes('spool_moves'));
  assert.ok(['spoolId', 'laydownId', 'requestId'].every(field => plan.columns.some(column => column.table === 'spool_moves' && column.field === field)));
});

// ---- Through HTTP: hosted profile, both pilots ------------------------------------------------------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-logistics-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store); pinFlanges(store); seedMtoLogistics(store, SYSTEM);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    const response = await request('/api/auth/login', 'POST', { email: user.email, password }); assert.equal(response.status, 200);
  };
  /** A multipart upload (one file) as the browser sends it. */
  const upload = async (path: string, file: { name: string; type: string; bytes: Uint8Array }) => {
    const body = new FormData(); body.set('file', new Blob([Buffer.from(file.bytes)], { type: file.type }), file.name);
    return fetch(origin + path, { method: 'POST', headers: { 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body });
  };
  return { store, request, upload, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Pilot admin', email: 'pilot-admin@example.test', password })).status, 201) };
}
const FULL = { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' };

test('the hosted profile delivers the pages, resources and actions of this flow and the menu points at them', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const path of ['/mto/materials/iso-execution', '/mto/materials/service-spools', '/mto/materials/service-materials', '/mto/materials/picklists', '/mto/materials/service_requests', '/mto/materials/service_companies', '/mto/materials/laydowns', '/mto/materials/material_laydowns']) assert.ok(pageAvailable(hosted, path, RESOURCES), path);
  // Material inventory (/mto/materials/stock) is the stock flow's page, so stock is no longer data only.
  for (const path of ['/mto/materials/reservations', '/mto/materials/material_locations']) assert.equal(pageAvailable(hosted, path, RESOURCES), false, path);
  for (const key of ['reserve-iso', 'release-reservation', 'start-iso', 'take-picklist', 'service', 'move-spools', 'move-materials', 'service-materials']) assert.ok(hosted.actions[key], key);
  for (const key of ['complete-service', 'complete-material-service']) assert.equal(hosted.actions[key], undefined, key);
  assert.deepEqual(hosted.actions.service.sort(), ['companyId', 'includeDrawings', 'note', 'spoolIds']);
  assert.ok(!hosted.actions['service-materials'].includes('materialLaydownId'));
  assert.ok(!hosted.navigation.includes('reservations'));
  const mto = PILOTS.find(pilot => pilot.key === 'mto')!; const labels = Object.fromEntries(mto.groups.flatMap(group => group.items).map(item => [item.label, pilotItemPath(item)]));
  assert.equal(labels['Isometric execution'], '/materials/iso-execution'); assert.equal(labels['Pick List archive'], '/materials/picklists'); assert.equal(labels['Service request'], '/materials/service-spools');
  assert.equal(labels['Service req. - Materials'], '/materials/service-materials'); assert.equal(labels['Request archive'], '/materials/service_requests');
  assert.equal(labels['Laydown areas'], '/materials/laydowns'); assert.equal(labels['Laydown materials'], '/materials/material_laydowns'); assert.equal(labels['Service companies'], '/materials/service_companies');
});

test('Reserve, Start and taking a pick list work through the API for MTO accounts and are refused elsewhere', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Work preparator', FULL);
  // Reads: only what the pages need.
  for (const key of ['picklists', 'reservations', 'stock', 'service_requests', 'service_companies', 'laydowns', 'material_laydowns', 'material_locations', 'spools']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  const stock = await (await f.request('/api/records/stock')).json() as { rows?: Row[] } | Row[];
  const first = (Array.isArray(stock) ? stock : stock.rows || [])[0]; assert.ok(first); assert.ok(first.warehouseId || first.siteId, 'the storehouse of a line, or the project site of an inventory row, is delivered');
  // Weld Pilot: the pilot boundary refuses every record and action of this flow.
  f.usePilot('weld');
  for (const key of ['picklists', 'reservations', 'stock', 'service_requests', 'service_companies', 'laydowns']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  for (const key of Object.keys(PAYLOADS)) assert.equal((await f.request(`/api/actions/${key}`, 'POST', PAYLOADS[key])).status, 403, key);
  f.usePilot('mto');
  // Undelivered fields are refused.
  assert.equal((await f.request('/api/actions/start-iso', 'POST', { isoId: 'iso-3', warehouseId: 'warehouse-main' })).status, 404);
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', services: 'Anything' })).status, 404);
  assert.equal((await f.request('/api/records/reservations', 'POST', { isoId: 'iso-3', requirementId: 'requirement-3', quantity: 1 })).status, 405);
  assert.equal((await f.request('/api/records/picklists', 'POST', { isoId: 'iso-3' })).status, 405);
  // Reserve, Start, take.
  const reserved = await f.request('/api/actions/reserve-iso', 'POST', { isoId: 'iso-8', date: '2026-10-27' }); assert.equal(reserved.status, 201);
  assert.ok(f.store.list('reservations').some(row => row.isoId === 'iso-8'));
  assert.equal((await f.request('/api/actions/reserve-iso', 'POST', { isoId: 'iso-8', date: '2026-10-27' })).status, 409);
  // Below 70 % Start is refused (STX-SK-008 is at 9 %); STX-ST-006 is at 72 %.
  assert.equal((await f.request('/api/actions/start-iso', 'POST', { isoId: 'iso-8', date: '2026-10-27' })).status, 409);
  const total = () => f.store.list('stock').reduce((sum, row) => sum + Number(row.quantity), 0);
  const before = total();
  const started = await f.request('/api/actions/start-iso', 'POST', { isoId: 'iso-6', date: '2026-10-27', note: 'Field crew B' }); assert.equal(started.status, 201);
  const body = await started.json() as { records: Row[] }; const reportNo = String(body.records[0].reportNo); assert.equal(body.records[0].taken, false); assert.equal(body.records[0].note, 'Field crew B');
  // Start issues the material at once (delta-I3-R1): the inventory drops by the pick list, taking it moves nothing.
  const picked = body.records.reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal(total(), before - picked);
  assert.equal((await f.request('/api/actions/take-picklist', 'POST', { reportNo, date: '2026-10-27', note: 'Issued to the field crew' })).status, 201);
  assert.equal(total(), before - picked);
  assert.equal((await f.request('/api/actions/take-picklist', 'POST', { reportNo, date: '2026-10-27' })).status, 409);
  assert.equal((await f.request('/api/actions/picklist-note', 'POST', { reportNo, note: 'Issued to P. Jansen' })).status, 201);
  assert.equal((await f.request('/api/actions/undo-iso-execution', 'POST', { reportNo })).status, 409, 'a taken pick list cannot be undone');
  // An untaken execution pick list can be undone: what it issued returns.
  const second = await (await f.request('/api/actions/start-iso', 'POST', { isoId: 'iso-4', date: '2026-10-27' })).json() as { records: Row[] };
  const issued = second.records.reduce((sum, row) => sum + Number(row.quantity), 0); assert.ok(issued > 0);
  assert.equal(total(), before - picked - issued);
  assert.equal((await f.request('/api/actions/undo-iso-execution', 'POST', { reportNo: String(second.records[0].reportNo) })).status, 201);
  assert.equal(total(), before - picked);
  // Excel of a table and the Reserved materials PDF.
  const excel = await f.request('/api/mto/table-export', 'POST', { table: 'picklist-archive', columns: ['Date', 'Report No.'], rows: [['16.11.2026. 07:44', reportNo]] });
  assert.equal(excel.status, 200); assert.match(String(excel.headers.get('content-type')), /spreadsheetml/);
  assert.equal((await f.request('/api/mto/table-export', 'POST', { table: 'anything', columns: ['A'], rows: [] })).status, 404);
  const pdf = await f.request('/api/pdf/reserved-materials?grouped=1'); assert.equal(pdf.status, 200); assert.match(String(pdf.headers.get('content-type')), /pdf/);
  const archive = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  assert.ok(archive.rows.picklists.some(row => row.reportNo === reportNo && row.taken === true));
  assert.ok(archive.rows.reservations.some(row => row.isoId === 'iso-8'));
});

test('read-only and partial permission profiles cannot reserve, start or take, and logistics keep their rules', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Material viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/records/picklists')).status, 200);
  for (const key of Object.keys(PAYLOADS)) assert.equal((await f.request(`/api/actions/${key}`, 'POST', PAYLOADS[key])).status, 403, key);
  // Detailed permissions: pick list archive alone ("21") is view, export and print only.
  await f.signIn('Archive only', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '21': ['show', 'export', 'print'], '5': ['show'], '64': ['show'] }) });
  assert.equal((await f.request('/api/records/picklists')).status, 200);
  assert.equal((await f.request('/api/records/reservations')).status, 403);
  assert.equal((await f.request('/api/actions/take-picklist', 'POST', { reportNo: 'PL-2026-0002', date: '2026-10-27' })).status, 403);
  // ISO execution ("20") may reserve and start, but does not manage service requests.
  await f.signIn('Iso execution', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '20': ['show', 'insert'], '5': ['show'], '64': ['show'], '70': ['show'], '16': ['show'], '21': ['show'] }) });
  assert.equal((await f.request('/api/actions/reserve-iso', 'POST', { isoId: 'iso-6', date: '2026-10-27' })).status, 201);
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht' })).status, 403);
  // Full MTO rights: the existing service rules still hold and the new drawings flag is stored.
  await f.signIn('Logistics', FULL);
  // The name and the date of a hosted request are not the client's to send.
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', name: 'Hosted batch', date: '2026-10-27' })).status, 404);
  const service = await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', includeDrawings: true, note: 'Hosted note' }); assert.equal(service.status, 201);
  const open = f.store.list('service_requests').find(row => row.spoolId === 'spool-1' && row.status !== 'Completed')!;
  assert.equal(open.includeDrawings, true); assert.equal(open.name, 'Logistics'); assert.match(String(open.number), /^\d{5}$/);
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht' })).status, 409, 'an open request blocks a second one');
  // Move to laydown is the return of a spool at a service company: it closes the open request and writes the history.
  assert.equal((await f.request('/api/actions/move-spools', 'POST', { spoolIds: ['spool-1'], laydownId: 'laydown-c' })).status, 201);
  assert.equal(f.store.get('service_requests', open.id).status, 'Completed');
  assert.equal(f.store.get('spools', 'spool-1').laydownId, 'laydown-c');
  assert.deepEqual(f.store.list('spool_moves').filter(row => row.spoolId === 'spool-1').map(row => row.type).sort(), ['Laydown', 'Service']);
  assert.equal((await f.request('/api/actions/complete-service', 'POST', { requestIds: [open.id] })).status, 404);
  // The Excel spool export follows the page's order and carries the isometric's treatments.
  const exported = await f.request('/api/export-spools'); assert.equal(exported.status, 200); assert.match(String(exported.headers.get('content-type')), /spreadsheetml/);
  // Catalogs: Address is required, Name is unique.
  assert.equal((await f.request('/api/records/service_companies', 'POST', { name: 'No address' })).status, 422);
  assert.equal((await f.request('/api/records/service_companies', 'POST', { name: 'Harbour Coatings', address: '5 Quay Street', phone: '+31 10 555 0110' })).status, 201);
  assert.equal((await f.request('/api/records/service_companies', 'POST', { name: 'Harbour Coatings', address: '5 Quay Street' })).status, 409);
  assert.equal((await f.request('/api/records/laydowns', 'POST', { name: 'Laydown D — Hydrotest' })).status, 201);
  assert.equal((await f.request('/api/records/material_laydowns', 'POST', { name: 'Flange shelf' })).status, 201);
});

// ---- Service request documents, signing and the materials archive (w3-service-request-docs) ---------------------------

const PNG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNED = { contractorName: 'Ivo Contractor', contractorDate: '2026-11-12', contractorMethod: 'Draw', contractorSignature: PNG_URL, clientName: 'Ana Client', clientDate: '2026-11-12', clientSignature: PNG_URL, noboName: 'Nora NoBo', noboDate: '2026-11-13', noboSignature: PNG_URL };
const SCAN = { name: 'scan.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n%%EOF') };

test('mto-logistics-005: Sign & save needs every name and signature; a drawn signature must be a PNG; a saved one must exist', () => {
  assert.deepEqual(signOffComplete(SIGNED), {});
  const { noboSignature: _nobo, ...withoutNobo } = SIGNED;
  assert.deepEqual(Object.keys(signOffComplete(withoutNobo)), ['noboSignature']);
  assert.deepEqual(Object.keys(signOffComplete({ ...SIGNED, contractorName: ' ', clientName: '', noboName: '' })).sort(), ['clientName', 'contractorName', 'noboName']);
  assert.ok(signOffComplete({ ...SIGNED, contractorMethod: 'Signature' }).contractorSignature, 'no saved signature');
  assert.deepEqual(signOffComplete({ ...SIGNED, contractorMethod: 'Initials', contractorSignature: '' }, { Signature: false, Initials: true }), {});
  assert.ok(signOffComplete({ ...SIGNED, clientDate: '12.11.2026' }).clientDate);
  assert.ok(drawnSignature(PNG_URL)); assert.equal(drawnSignature('data:image/png;base64,AAAA'), null); assert.equal(drawnSignature('data:image/jpeg;base64,/9j/'), null); assert.equal(drawnSignature(42), null);
});

test('mto-logistics-023: material requests count their own Report No. per main project, apart from the spool requests', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM);
  const rows = () => Object.fromEntries(['service_requests', 'iso_materials', 'spools', 'isometrics', 'projects'].map(key => [key, store.list(key, true)])) as Record<string, Row[]>;
  // The sample: spool requests 00001-00003, and one material request 00001 on the North yard.
  assert.equal(materialRequestNumber(rows(), 'site-north'), '00002'); assert.equal(materialRequestNumber(rows(), 'site-river'), '00001');
  const spool = runAction(store, 'service', { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-11-02' }, actor).records![0];
  assert.equal(spool.number, '00004', 'the spool sequence ignores the material numbers');
  assert.equal(materialRequestNumber(rows(), 'site-north'), '00002', 'and a spool request does not move the material sequence');
  runAction(store, 'move-materials', { requirementIds: ['requirement-1', 'requirement-4'], laydownId: 'mlaydown-rack-1', date: '2026-11-01' }, actor);
  const north = runAction(store, 'service-materials', { requirementIds: ['requirement-1'], companyId: 'service-blast', date: '2026-11-03' }, actor).records![0];
  const river = runAction(store, 'service-materials', { requirementIds: ['requirement-4'], companyId: 'service-blast', date: '2026-11-04' }, actor).records![0];
  assert.deepEqual([north.number, river.number], ['00002', '00001']);
  runAction(store, 'move-materials', { requirementIds: ['requirement-2', 'requirement-5'], laydownId: 'mlaydown-rack-1', date: '2026-11-01' }, actor);
  assert.throws(() => runAction(store, 'service-materials', { requirementIds: ['requirement-2', 'requirement-5'], companyId: 'service-blast' }, actor), /one main project/);
  // The archive keeps same-numbered requests of the two kinds and of two main projects apart.
  const materials = requestArchive(rowsOf(store), { kind: 'Material' });
  assert.ok(materials.every(request => request.kind === 'Material' && requestKind(store.get('service_requests', request.headId)) === 'Material'));
  assert.deepEqual(materials.map(request => request.number), ['00001', '00002', '00001'], 'newest first');
  assert.deepEqual(requestArchive(rowsOf(store), { kind: 'Material', sort: 'asc' }).map(request => request.date), ['2026-10-25', '2026-11-03', '2026-11-04']);
  assert.equal(new Set(materials.map(request => request.key)).size, 3);
  assert.ok(requestArchive(rowsOf(store), { kind: 'Spool' }).every(request => request.kind === 'Spool' && !request.items.some(item => item.startsWith('Unavailable'))));
  // Old numbers stay as stored and do not count.
  store.create('service_requests', { number: 'SR-2026-0009', requirementId: 'requirement-2', companyId: 'service-blast', date: '2026-01-02', status: 'Completed' }, actor);
  assert.equal(materialRequestNumber(rows(), 'site-north'), '00003');
});

test('mto-logistics-011: Service req. - Materials lists one row per isometric material line of the group with its whole quantity', t => {
  const store = bare(t); seedMtoLogistics(store, SYSTEM); const rows = rowsOf(store);
  const group = String(store.get('materials', 'material-9').materialGroup);
  const expected = store.list('iso_materials').filter(line => line.materialId && store.get('materials', String(line.materialId)).materialGroup === group);
  assert.ok(expected.length > 0);
  const lines = materialLocations(rows, { group });
  assert.deepEqual(lines.map(entry => entry.requirement.id).sort(), expected.map(line => line.id).sort());
  assert.ok(lines.every(entry => entry.requirement.quantity === expected.find(line => line.id === entry.requirement.id)!.quantity));
  assert.equal(ACTIONS['service-materials'].fields.some(field => field.type === 'number'), false, 'no part quantity: a line moves whole');
});

test('mto-logistics-004 / -005: Confirm stores both documents; Sign online signs the Release note once, never moves a spool, and Upload attaches a signed scan', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Logistics signer', FULL);
  const service = await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1', 'spool-7'], companyId: 'service-pwht', note: 'Two projects' }); assert.equal(service.status, 201);
  const head = (await service.json() as { records: Row[] }).records[0];
  // The documents sit on the request's head in the archive; the records of one Confirm share their creation time, so read the files of all of them.
  const requestIds = () => f.store.list('service_requests').filter(row => row.number === head.number && row.spoolId).map(row => row.id);
  const files = () => f.store.list('attachments').filter(row => row.entityType === 'service_requests' && requestIds().includes(String(row.entityId)));
  assert.deepEqual(files().map(row => row.documentType).sort(), ['CoatingRelease', 'ServiceRequest']);
  assert.ok(files().every(row => /^\d{8}_S\d+_R\d{5}-(ServiceRequest|CoatingRelease)\.pdf$/.test(String(row.name)) && String(row.name).includes(`_R${head.number}-`)));
  for (const kind of ['service-request', 'coating-release']) { const response = await f.request(`/api/service-requests/${head.id}/document/${kind}`); assert.equal(response.status, 200, kind); assert.equal(response.headers.get('content-type'), 'application/pdf'); }
  assert.equal((await f.request(`/api/service-requests/${head.id}/document/signed`)).status, 404, 'nothing signed yet');
  // A request of the sample (made before documents were stored) prints a fresh build.
  const old = f.store.list('service_requests').find(row => row.spoolId === 'spool-2')!;
  assert.equal((await f.request(`/api/service-requests/${old.id}/document/service-request`)).status, 200);

  const spoolState = () => ['spool-1', 'spool-7'].map(id => { const spool = f.store.get('spools', id); return [spool.laydownId, spool.serviceCompanyId, spool._version]; });
  const spoolsBefore = spoolState(); const movesBefore = f.store.list('spool_moves').length;
  const sign = (data: Record<string, unknown>) => f.request(`/api/service-requests/${head.id}/sign`, 'POST', data);
  // Refused: no NoBo signature; a saved signature the account does not have (another user's never counts); a drawing that is no PNG; fields that are not on the form.
  const { noboSignature: _nobo, ...withoutNobo } = SIGNED;
  const refused = await sign(withoutNobo); assert.equal(refused.status, 422); assert.ok((await refused.json() as { fields: Record<string, string> }).fields.noboSignature);
  const someone = f.store.list('users')[0];
  const other = f.store.create('signatures', { name: String(someone.name), userId: someone.id, kind: 'Full signature' });
  f.store.create('attachments', { name: 'other.png', entityType: 'signatures', entityId: other.id, documentType: 'Full signature', mime: 'image/png', size: 10 });
  assert.equal((await sign({ ...SIGNED, contractorMethod: 'Signature', contractorSignature: '' })).status, 422);
  assert.equal((await sign({ ...SIGNED, clientSignature: 'data:image/png;base64,AAAA' })).status, 422);
  assert.equal((await sign({ ...SIGNED, signedBy: 'Forged' })).status, 404);
  assert.equal(f.store.get('service_requests', head.id).signedAt, '');
  // Signed: every record of the request, the note as changed, the signed Release note stored.
  const signed = await sign({ ...SIGNED, note: 'Collected Thursday' }); assert.equal(signed.status, 201);
  const records = f.store.list('service_requests').filter(row => row.number === head.number && row.spoolId); assert.equal(records.length, 2);
  for (const record of records) { assert.ok(record.signedAt); assert.equal(record.signedBy, 'Logistics signer'); assert.equal(record.signedVia, 'Online'); assert.equal(record.noboName, 'Nora NoBo'); assert.equal(record.note, 'Collected Thursday'); }
  const stored = files().find(row => row.documentType === 'Signed release note')!; assert.match(String(stored.name), /-CoatingRelease-signed\.pdf$/);
  const download = await f.request(`/api/service-requests/${head.id}/document/signed`); assert.equal(download.status, 200);
  assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString('latin1'), '%PDF-');
  // The spools have not moved.
  assert.deepEqual(spoolState(), spoolsBefore); assert.equal(f.store.list('spool_moves').length, movesBefore);
  // Read-only afterwards: no second signing, no upload, no record edit, no deleting its files.
  assert.equal((await sign(SIGNED)).status, 409);
  assert.equal((await f.upload(`/api/service-requests/${head.id}/upload`, SCAN)).status, 409);
  assert.notEqual((await f.request(`/api/records/service_requests/${head.id}`, 'PUT', { noboName: 'Changed', _version: f.store.get('service_requests', head.id)._version })).status, 200);
  assert.equal(f.store.get('service_requests', head.id).noboName, 'Nora NoBo');
  assert.notEqual((await f.request(`/api/records/attachments/${stored.id}/archive`, 'POST', { _version: stored._version })).status, 200);
  assert.equal(f.store.get('attachments', stored.id, true)._archived, false);

  // Upload signed doc on another request: a PDF only; the request is then signed (via Upload) and read-only.
  const second = await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-5'], companyId: 'service-blast' }); assert.equal(second.status, 201);
  const request = (await second.json() as { records: Row[] }).records[0];
  assert.equal((await f.upload(`/api/service-requests/${request.id}/upload`, { name: 'scan.png', type: 'image/png', bytes: Buffer.from(PNG_URL.split(',')[1], 'base64') })).status, 422);
  assert.equal((await f.upload(`/api/service-requests/${request.id}/upload`, SCAN)).status, 201);
  assert.equal(f.store.get('service_requests', request.id).signedVia, 'Upload');
  assert.equal((await f.request(`/api/service-requests/${request.id}/sign`, 'POST', SIGNED)).status, 409);
  assert.equal((await f.request(`/api/service-requests/${request.id}/document/signed`)).status, 200);
  // The archive row carries the documents and the sign-off.
  const archive = requestArchive(rowsOf(f.store), { kind: 'Spool' });
  const row = archive.find(entry => entry.ids.includes(head.id))!;
  assert.ok(row.files.serviceRequest && row.files.coatingRelease && row.files.signed); assert.equal(row.signOff?.via, 'Online'); assert.deepEqual(row.documents, []);
  assert.equal(archive.find(entry => entry.headId === request.id)!.signOff?.via, 'Upload');
});

test('mto-logistics-005: read-only accounts may print but not sign or upload, and Weld Pilot reaches none of it', async t => {
  const f = await hostedFixture(t); await f.setup();
  const id = f.store.list('service_requests').find(row => row.spoolId === 'spool-2')!.id;
  await f.signIn('Logistics viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  assert.equal((await f.request(`/api/service-requests/${id}/document/coating-release`)).status, 200);
  assert.equal((await f.request(`/api/service-requests/${id}/sign`, 'POST', SIGNED)).status, 403);
  assert.equal((await f.upload(`/api/service-requests/${id}/upload`, SCAN)).status, 403);
  f.usePilot('weld');
  assert.equal((await f.request(`/api/service-requests/${id}/document/coating-release`)).status, 403);
  f.usePilot('mto');
  const material = f.store.list('service_requests').find(row => row.requirementId)!;
  assert.equal((await f.request(`/api/service-requests/${material.id}/document/service-request`)).status, 404, 'material requests have no spool documents');
});

// ----- wave 3 integration: the MTO dashboard reads a started pick list with the execution rule -----------------------------
test('after Start the MTO dashboard counts the issued lines as Picked (10 and 3), no claim, and the metre left stays in the free pool', async t => {
  const { mtoDashboard } = await import('../shared/mto-dashboard.ts');
  const store = execution(t);
  runAction(store, 'start-iso', { isoId: 'iso-exe', phaseId: 'phase-0', date: day, note: 'Shop week 47' }, actor);
  const model = mtoDashboard(rowsOf(store), { today: day, phaseId: '' });
  const item = model.board.find(row => row.isoId === 'iso-exe')!;
  assert.equal(item.readiness, 'STARTED');
  const figures = (requirementId: string) => { const line = item.lines.find(entry => entry.requirementId === requirementId)!; return [line.picked, line.claimed, line.covered, line.shortage]; };
  assert.deepEqual([figures('req-a-pipe'), figures('req-b-bolt')], [[10, 0, 10, 0], [3, 0, 3, 1]], 'Picked as the Materials panel shows it (requirementExecution); nothing claimed twice');
  // A second isometric's line of pipe is covered by the one metre left in North's inventory.
  store.create('iso_materials', { isoId: 'iso-9', materialId: PIPE, quantity: 2, phaseId: 'phase-0' }, actor, 'req-exe-other');
  const other = mtoDashboard(rowsOf(store), { today: day, phaseId: '' }).board.find(row => row.isoId === 'iso-9')!.lines.find(line => line.requirementId === 'req-exe-other')!;
  assert.deepEqual([other.covered, other.shortage], [1, 1]);
});
