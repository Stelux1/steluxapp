import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { seedMtoDashboard } from '../server/mto-dashboard-seed.ts';
import { RESOURCES } from '../shared/resources.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import { canScope } from '../shared/permissions.ts';
import {
  AGING_BUCKETS, ALL_PHASES, BOARD_COLUMNS, BOARD_PAGE_SIZES, BOARD_RELOAD_MS, BOARD_TABS, KPI_FILTERS, MATERIAL_VIEW_COLUMNS, MTO_DASHBOARD_PANEL_AREAS, MTO_DASHBOARD_REQUIRED,
  agingBucket, agingOf, boardCounts, boardDate, boardPage, boardTabMatches, chartLabel, dashboardFilters, dashboardPanels, daysBetween, defaultDashboardPhase, freePoolByMaterial, logisticsSignalOf,
  materialList, materialRevisionRows, mtoDashboard, priorityRank, readinessOf,
} from '../shared/mto-dashboard.ts';
import type { Row, User } from '../shared/types.ts';

let created = 0;
const row = (id: string, data: Record<string, unknown>): Row => ({ id, _archived: false, _createdAt: `2026-09-01T00:00:${String(created++ % 60).padStart(2, '0')}.${String(created).padStart(3, '0')}Z`, _version: 1, ...data }) as Row;
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const byIsoNo = (model: ReturnType<typeof mtoDashboard>) => Object.fromEntries(model.board.map(item => [item.isoNo, item]));

// ----- the reference sandbox (project site Zandbak, project 20240101), re-typed from the captures ---------------------

/**
 * Sources: mto__iso__0001.txt:153-176, mto__iso__00032.txt:160-162, mto__iso__00022.txt:161-162 (lines, quantities and
 * operation phases: 0001's line "1" (TEST) and 00022's 8138268881 are Field, the rest Shop); the Material inventory
 * (mto__order__material-inventory.txt:71-77; 7430052832 only in a storehouse); pick list 00001 of 00022, not taken
 * (mto__projects__pick-list-archive.txt:70); the order lines (order archive / take-in: 00004 of 20-03-2024 for 0001,
 * 00007 for 00022's Field line); spool SP01 of 0001 on laydown "Farbara osnovi premaz" since 28.06.2024
 * (mto__logistic__service-request.txt:84, __spool-history.txt:18-21). Today is 2026-11-16, the capture day.
 */
function sandbox(): Record<string, Row[]> {
  created = 0;
  const numbers = ['8138265581', '1', '8138268881', '7662782601', '7636669711', '7633384771', '7430050581', '7430052832', '8138678259', '8138664911', '7436330731', 'P235GH'];
  const materials = numbers.map(materialNo => row(`m-${materialNo}`, { materialNo, description: materialNo === '1' ? 'TEST' : `Material ${materialNo}` }));
  const SHOP = 'ph-1', FIELD = 'ph-2';
  const lines = (iso: string, list: (readonly [string, number, string])[]) => list.map(([no, quantity, phaseId], i) => row(`${iso}-${i}`, { isoId: iso, materialId: `m-${no}`, quantity, phaseId }));
  const onHand = [['1', 3], ['P235GH', 7], ['8138265581', 2], ['7662782601', 2], ['7636669711', 8], ['7633384771', 13], ['7430050581', 6], ['8138268881', 10], ['8138678259', 2]] as const;
  const orderLine = (id: string, orderId: string, requirementId: string, no: string, quantity: number, received: number) => row(id, { orderId, requirementId, materialId: `m-${no}`, quantity, received });
  return {
    sites: [row('zandbak', { name: 'Zandbak' })], projects: [row('p-20240101', { siteId: 'zandbak', internnumber: '20240101' })],
    isometrics: [row('iso-0001', { isoNo: '0001', projectId: 'p-20240101' }), row('iso-00032', { isoNo: '00032', projectId: 'p-20240101' }), row('iso-00022', { isoNo: '00022', projectId: 'p-20240101' })],
    operation_phases: [row(SHOP, { name: 'Shop' }), row(FIELD, { name: 'Field' })],
    materials, custom_materials: [], reservations: [],
    iso_materials: [
      ...lines('iso-0001', [['8138265581', 2, SHOP], ['1', 3, FIELD], ['8138268881', 3, SHOP], ['7662782601', 6, SHOP], ['7636669711', 8, SHOP], ['7633384771', 13, SHOP], ['7430050581', 6, SHOP], ['7430052832', 12, SHOP], ['8138678259', 16, SHOP]]),
      ...lines('iso-00032', [['8138664911', 16, SHOP], ['8138268881', 16, SHOP], ['7436330731', 16, SHOP]]),
      ...lines('iso-00022', [['8138678259', 2, SHOP], ['8138268881', 10, FIELD]]),
    ],
    stock: [...onHand.map(([no, quantity]) => row(`stock-${no}`, { materialId: `m-${no}`, locationKind: 'site', siteId: 'zandbak', quantity })), row('storehouse-line', { materialId: 'm-7430052832', warehouseId: 'magacin-belgija', quantity: 40 })],
    picklists: [row('pick-1', { reportNo: '00001', isoId: 'iso-00022', requirementId: 'iso-00022-0', materialId: 'm-8138678259', quantity: 2, taken: false, date: '2025-11-06' }), row('pick-2', { reportNo: '00001', isoId: 'iso-00022', requirementId: 'iso-00022-1', materialId: 'm-8138268881', quantity: 10, taken: false, date: '2025-11-06' })],
    orders: [row('o-00004', { number: '00004', projectId: 'p-20240101', date: '2024-03-20', status: 'Partially received' }), row('o-00005', { number: '00005', projectId: 'p-20240101', date: '2024-05-02', status: 'Received' }), row('o-00006', { number: '00006', projectId: 'p-20240101', date: '2024-02-01', status: 'Received' }), row('o-00007', { number: '00007', projectId: 'p-20240101', date: '2025-10-30', status: 'Received' })],
    order_lines: [
      orderLine('ol-1', 'o-00004', 'iso-0001-0', '8138265581', 2, 2), orderLine('ol-2', 'o-00004', 'iso-0001-2', '8138268881', 3, 0), orderLine('ol-3', 'o-00004', 'iso-0001-3', '7662782601', 6, 4),
      orderLine('ol-4', 'o-00004', 'iso-0001-4', '7636669711', 8, 8), orderLine('ol-5', 'o-00004', 'iso-0001-5', '7633384771', 13, 13), orderLine('ol-6', 'o-00004', 'iso-0001-6', '7430050581', 6, 6),
      orderLine('ol-7', 'o-00004', 'iso-0001-7', '7430052832', 12, 0), orderLine('ol-8', 'o-00006', 'iso-0001-1', '1', 3, 3), orderLine('ol-9', 'o-00007', 'iso-00022-1', '8138268881', 10, 10),
      orderLine('ol-10', 'o-00005', 'iso-00022-0', '8138678259', 2, 2),
    ],
    spools: [row('sp-01', { name: 'SP01', isoId: 'iso-0001', laydownId: 'ld-farbara' }), row('sp-j', { name: 'Spool J', isoId: 'iso-00032' })],
    laydowns: [row('ld-farbara', { name: 'Farbara osnovi premaz' }), row('ld-transport', { name: 'Transportovano' }), row('ld-stara', { name: 'Stara Hala' })],
    spool_moves: [
      row('mv-1', { spoolId: 'sp-01', date: '2024-06-28 12:02', type: 'Laydown', location: 'Stara Hala', laydownId: 'ld-stara' }), row('mv-2', { spoolId: 'sp-01', date: '2024-06-28 12:02', type: 'Laydown', location: 'Farbara osnovi premaz', laydownId: 'ld-farbara' }),
      row('mv-3', { spoolId: 'sp-01', date: '2024-06-28 12:02', type: 'Laydown', location: 'Transportovano', laydownId: 'ld-transport' }), row('mv-4', { spoolId: 'sp-01', date: '2024-06-28 12:11', type: 'Laydown', location: 'Farbara osnovi premaz', laydownId: 'ld-farbara' }),
    ],
    service_requests: [], material_locations: [], material_location_events: [],
  };
}
const CAPTURE_DAY = '2026-11-16';

test('sandbox, phase Shop: the operations board of mto__start__dashboard.txt:182-184, recomputed', () => {
  const model = mtoDashboard(sandbox(), { phaseId: 'ph-1', today: CAPTURE_DAY }), board = byIsoNo(model);
  assert.deepEqual(Object.keys(board).sort(), ['0001', '00022', '00032']);
  // Free pool (site Zandbak) = inventory − reservations (none) − untaken pick lists: 8138268881 10 − 10 = 0,
  // 8138678259 2 − 2 = 0; 7430052832 exists only in a storehouse, so it has no pool.
  // 0001, Shop lines 2,3,6,8,13,6,12,16 = 66; covered min(qty, free) = 2,0,2,8,13,6,0,0 = 31 → "Covered 31 / 66".
  const iso0001 = board['0001'];
  assert.deepEqual([iso0001.readiness, iso0001.covered, iso0001.required, iso0001.shortage], ['PARTIAL', 31, 66, 35]);
  // Shortage 35 = 3 (8138268881) + 4 (7662782601) + 12 (7430052832) + 16 (8138678259); the cell shows the two largest.
  assert.equal(materialList(iso0001.shortageMaterials, 2), '8138678259 (16), 7430052832 (12)');
  // Blocking backorder = open order quantity for the short lines: 3 (ol-2, 3−0) + 2 (ol-3, 6−4) + 12 (ol-7) = 17; rest 35 − 17 = 18 not ordered.
  assert.deepEqual([iso0001.blockingBackorder, iso0001.notOrdered], [17, 18]);
  assert.equal(materialList(iso0001.backorderMaterials), '7430052832 (12), 7662782601 (2), 8138268881 (3)');
  // 00022: started; its Shop line (2) is covered by its own untaken pick list although the stock is claimed → 2 / 2, nothing short.
  assert.deepEqual([board['00022'].readiness, board['00022'].covered, board['00022'].required, board['00022'].shortage, board['00022'].notOrdered], ['STARTED', 2, 2, 0, 0]);
  // 00032: three lines of 16, no free stock for any (8138268881 claimed by 00022), nothing on order.
  assert.deepEqual([board['00032'].readiness, board['00032'].covered, board['00032'].required, board['00032'].blockingBackorder, board['00032'].notOrdered], ['BLOCKED', 0, 48, 0, 48]);
  assert.equal(materialList(board['00032'].shortageMaterials, 2), '7436330731 (16), 8138268881 (16)');
});

test('sandbox, phase Shop: KPI cards and chips of mto__start__dashboard.txt:129-138, recomputed', () => {
  const model = mtoDashboard(sandbox(), { phaseId: 'ph-1', today: CAPTURE_DAY });
  // Theoretical startable 0 (3 in scope, started 1); Partially covered 1 (0001); Blocked 2 = not started and short (0001 35, 00032 48), reserved 0;
  // Blocking backorder 17 in 1 isometric, open ordered total 17; Not ordered materials 5 = 7662782601 + 8138678259 (0001) + 8138664911 + 8138268881 +
  // 7436330731 (00032), in 2 isometrics; Free pool materials 5 = 8138265581, 7662782601, 7636669711, 7633384771, 7430050581 (positive pool, on a Shop line).
  assert.deepEqual(model.kpis, { startable: 0, started: 1, inScope: 3, partial: 1, blocked: 2, reserved: 0, blockingQuantity: 17, blockingIsometrics: 1, notOrderedMaterials: 5, notOrderedIsometrics: 2, freePoolMaterials: 5, openOrdered: 17 });
  // Max startable 1: only 00022 is coverable (own pick list), started ones count. Ordered 62 = every order line of the Shop materials:
  // 2 + (3 + 10, the 10 ordered for 00022's Field line) + 6 + 8 + 13 + 6 + 12 + 2; received 2 + 0 + 10 + 4 + 8 + 13 + 6 + 0 + 2 = 45; open 3 + 2 + 12 = 17.
  // Not ordered 66 = 18 + 48 + 0. Aging: 0001 971 days (15+); 00022 and 00032 "No log".
  assert.deepEqual(model.chips, { maxStartable: 1, freePoolMaterials: 5, ordered: 62, received: 45, openOrdered: 17, blockingBackorder: 17, notOrdered: 66, aging: { '0-7 days': 0, '8-14 days': 0, '15+ days': 1 }, noLogisticsUpdate: 2 });
  // Backlog by site: one bar "Site" 17 / 17 / 66 (projectChartRows :2609).
  assert.deepEqual(model.backlog, [{ scope: 'Site', openOrdered: 17, blockingBackorder: 17, notOrdered: 66 }]);
});

test('sandbox, phase Shop: logistics / aging and the chart by current location (:182-184, locationChartRows :2608)', () => {
  const model = mtoDashboard(sandbox(), { phaseId: 'ph-1', today: CAPTURE_DAY }), board = byIsoNo(model);
  // 0001: spool SP01 on laydown Farbara osnovi premaz; oldest open order 00004 of 20-03-2024 → 2026-11-16 is 730 + 241 = 971 days.
  assert.deepEqual([board['0001'].signal, board['0001'].location, board['0001'].ageDays, board['0001'].logistics], ['At laydown', 'Farbara osnovi premaz', 971, 'Ordered 20-03-2024 / 971 days']);
  assert.deepEqual([board['00022'].signal, board['00022'].ageDays, board['00022'].logistics], ['Started', null, 'Materials issued / No log']);
  assert.deepEqual([board['00032'].signal, board['00032'].ageDays, board['00032'].logistics], ['Not-sent', null, 'Not sent / No log']);
  assert.deepEqual(model.locations.map(bar => [bar.label, bar.isometrics]), [['Farbara o.', 1], ['Not sent', 1], ['Materials.', 1]]);
});

test('sandbox, phase Shop: the Open ordered view lists materials with Shortage, Open ordered and Not ordered', () => {
  const model = mtoDashboard(sandbox(), { phaseId: 'ph-1', today: CAPTURE_DAY });
  // 7430052832: short 12 (0001), open 12, not ordered 0; 7662782601: short 4, open 2, not ordered 2;
  // 8138268881: short 3 (0001) + 16 (00032) = 19, open 3 (ol-2), not ordered 16. Σ open = 17 = the Open ordered chip.
  assert.deepEqual(model.materials.map(item => [item.materialNo, item.shortage, item.openOrdered, item.notOrdered]), [['7430052832', 12, 12, 0], ['7662782601', 4, 2, 2], ['8138268881', 19, 3, 16]]);
  assert.equal(round(model.materials.reduce((sum, item) => sum + item.openOrdered, 0)), model.chips.openOrdered);
  assert.deepEqual([...MATERIAL_VIEW_COLUMNS], ['Material number', 'Description', 'Shortage', 'Open ordered', 'Not ordered']);
});

test('sandbox, phase Field: the figures of mto__start__dashboard__phase.txt:46-105, recomputed', () => {
  const model = mtoDashboard(sandbox(), { phaseId: 'ph-2', today: CAPTURE_DAY }), board = byIsoNo(model);
  // 0001's Field line TEST 3 is covered by the 3 on hand → Startable 3 / 3; 00022's Field line 10 by its own pick list → 10 / 10.
  assert.deepEqual([board['0001'].readiness, board['0001'].covered, board['0001'].required], ['STARTABLE', 3, 3]);
  assert.deepEqual([board['00022'].readiness, board['00022'].covered, board['00022'].required], ['STARTED', 10, 10]);
  // No open order for 0001's Field lines → aging from the spool's last laydown move (28-06-2024): 730 + 141 = 871 days.
  assert.deepEqual([board['0001'].logistics, board['0001'].ageDays], ['Farbara osnovi premaz / 871 days', 871]);
  assert.deepEqual(model.kpis, { startable: 1, started: 1, inScope: 2, partial: 0, blocked: 0, reserved: 0, blockingQuantity: 0, blockingIsometrics: 0, notOrderedMaterials: 0, notOrderedIsometrics: 0, freePoolMaterials: 1, openOrdered: 3 });
  // Ordered 16 = TEST 3 + 8138268881 (3 + 10); received 3 + 0 + 10 = 13; open 3. Max startable 2 (both).
  assert.deepEqual(model.chips, { maxStartable: 2, freePoolMaterials: 1, ordered: 16, received: 13, openOrdered: 3, blockingBackorder: 0, notOrdered: 0, aging: { '0-7 days': 0, '8-14 days': 0, '15+ days': 1 }, noLogisticsUpdate: 1 });
  assert.deepEqual(model.locations.map(bar => [bar.label, bar.isometrics]), [['Farbara o.', 1], ['Materials.', 1]]);
  assert.deepEqual(model.backlog, [{ scope: 'Site', openOrdered: 3, blockingBackorder: 0, notOrdered: 0 }]);
});

test('a spool moved to a laydown refreshes the logistics signal; a service company and a pick list override it', () => {
  const rows = sandbox();
  assert.deepEqual(logisticsSignalOf(rows, 'iso-00032'), { signal: 'Not-sent', location: 'Not sent', date: '' });
  rows.spools = rows.spools.map(spool => spool.id === 'sp-j' ? { ...spool, laydownId: 'ld-stara' } : spool);
  rows.spool_moves.push(row('mv-5', { spoolId: 'sp-j', date: '2026-11-10 09:00', type: 'Laydown', location: 'Stara Hala', laydownId: 'ld-stara' }));
  assert.deepEqual(logisticsSignalOf(rows, 'iso-00032'), { signal: 'At laydown', location: 'Stara Hala', date: '2026-11-10' });
  const board = byIsoNo(mtoDashboard(rows, { phaseId: 'ph-1', today: CAPTURE_DAY }));
  // No open order for 00032 → aging from the move: 6 days, "Stara Hala / 6 days", bucket 0-7, and the At laydown view lists it.
  assert.deepEqual([board['00032'].logistics, board['00032'].aging], ['Stara Hala / 6 days', '0-7 days']);
  assert.ok(boardTabMatches(board['00032'], 'At laydown'));
  // Sent to a service company: At service with the company's name, dated by its Service history entry.
  rows.service_companies = [row('sc-1', { name: 'Farbara' })];
  rows.spools = rows.spools.map(spool => spool.id === 'sp-j' ? { ...spool, laydownId: '', serviceCompanyId: 'sc-1' } : spool);
  rows.spool_moves.push(row('mv-6', { spoolId: 'sp-j', date: '2026-11-12', type: 'Service', location: 'Ord. No. 00003 Farbara' }));
  assert.deepEqual(logisticsSignalOf(rows, 'iso-00032'), { signal: 'At service', location: 'Farbara', date: '2026-11-12' });
  // A material requirement on a material laydown counts too, the later place wins.
  rows.material_laydowns = [row('mld-1', { name: 'Rack A' })];
  rows.material_locations = [row('loc-1', { requirementId: 'iso-00032-0', laydownId: 'mld-1', date: '2026-11-14' })];
  assert.deepEqual(logisticsSignalOf(rows, 'iso-00032'), { signal: 'At laydown', location: 'Rack A', date: '2026-11-14' });
  rows.picklists.push(row('pick-3', { isoId: 'iso-00032', requirementId: 'iso-00032-0', materialId: 'm-8138664911', quantity: 1, taken: true, date: '2026-11-15' }));
  assert.deepEqual(logisticsSignalOf(rows, 'iso-00032'), { signal: 'Started', location: 'Materials issued', date: '' });
});

test('aging text: Started has none; an open order wins over a location; without either it is "No log"', () => {
  const at = { signal: 'At laydown' as const, location: 'Bay 3', date: '2026-11-01' };
  assert.deepEqual(agingOf({ signal: 'Started', location: 'Materials issued', date: '' }, '2026-01-01', CAPTURE_DAY), { ageDays: null, text: 'Materials issued / No log' });
  assert.deepEqual(agingOf(at, '2026-10-01', CAPTURE_DAY), { ageDays: 46, text: 'Ordered 01-10-2026 / 46 days' });
  assert.deepEqual(agingOf(at, '', CAPTURE_DAY), { ageDays: 15, text: 'Bay 3 / 15 days' });
  assert.deepEqual(agingOf({ signal: 'Not-sent', location: 'Not sent', date: '' }, '', CAPTURE_DAY), { ageDays: null, text: 'Not sent / No log' });
  assert.equal(boardDate('2024-03-20'), '20-03-2024');
  assert.deepEqual(['Farbara osnovi premaz', 'Materials issued', 'Not sent', 'Stara Hala', 'Transporto'].map(chartLabel), ['Farbara o.', 'Materials.', 'Not sent', 'Stara Hala', 'Transporto']);
});

// ----- a small hand-computed sample (today = 2026-11-12) -------------------------------------------------------------

/**
 * Materials A-001 (mA), B-002 (mB), C-003 (mC), all on project site site-1.
 *   stock: mA 15, mB 5, mC none.  reservations: 2 × mB for requirement r4.  Free pool: mA 15, mB 3 (= 5 − 2), mC 0.
 *   Allocation order: iso-a (Prio 1), iso-b (Prio 2), iso-d (Prio 3), iso-c and iso-e (no priority, ISO number).
 */
const iso = (id: string, isoNo: string, projectId: string, priority = '') => row(id, { isoNo, projectId, priority });
function sample(): Record<string, Row[]> {
  return {
    sites: [row('site-1', { name: 'Riverside' })],
    projects: [row('p1', { internnumber: 'P-100', siteId: 'site-1' }), row('p2', { internnumber: 'P-200', siteId: 'site-1' })],
    isometrics: [iso('iso-a', 'A-100', 'p1', 'Prio 1'), iso('iso-b', 'B-200', 'p1', 'Prio 2'), iso('iso-c', 'C-300', 'p1'), iso('iso-d', 'D-400', 'p2', 'Prio 3'), iso('iso-e', 'E-500', 'p1')],
    operation_phases: [row('ph-shop', { name: 'Shop', sort: 1 }), row('ph-field', { name: 'Field', sort: 2 })],
    materials: [row('mA', { materialNo: 'A-001', description: 'Pipe 4 in' }), row('mB', { materialNo: 'B-002', description: 'Elbow 4 in' }), row('mC', { materialNo: 'C-003', description: 'Gasket' })],
    iso_materials: [
      row('r1', { isoId: 'iso-a', materialId: 'mA', quantity: 10, phaseId: 'ph-shop' }), row('r2', { isoId: 'iso-a', materialId: 'mB', quantity: 3, phaseId: 'ph-shop' }),
      row('r3', { isoId: 'iso-b', materialId: 'mA', quantity: 10, phaseId: 'ph-shop' }), row('r4', { isoId: 'iso-c', materialId: 'mB', quantity: 6, phaseId: 'ph-field' }),
      row('r5', { isoId: 'iso-d', materialId: 'mA', quantity: 5, phaseId: 'ph-shop' }), row('r6', { isoId: 'iso-e', materialId: 'mC', quantity: 3, phaseId: 'ph-shop' }),
    ],
    stock: [row('s1', { materialId: 'mA', locationKind: 'site', siteId: 'site-1', quantity: 15 }), row('s2', { materialId: 'mB', locationKind: 'site', siteId: 'site-1', quantity: 5 })],
    reservations: [row('res1', { isoId: 'iso-c', requirementId: 'r4', materialId: 'mB', quantity: 2, status: 'Reserved' }), row('res2', { isoId: 'iso-a', requirementId: 'r1', materialId: 'mA', quantity: 4, status: 'Released' })],
    picklists: [row('pl1', { isoId: 'iso-d', requirementId: 'r5', materialId: 'mA', quantity: 5, taken: true, date: '2026-11-01', reportNo: 'PL-1' })],
    orders: [row('o1', { number: '00001', projectId: 'p1', supplierId: 'sup-1', date: '2026-10-01', status: 'Pending' }), row('o2', { number: '00002', projectId: 'p1', date: '2026-10-02', status: 'Cancelled' }), row('o3', { number: '00003', projectId: 'p1', supplierId: 'sup-2', date: '2026-10-10', status: 'Pending' })],
    order_lines: [
      row('l1', { orderId: 'o1', requirementId: 'r3', materialId: 'mA', quantity: 8, received: 3 }),
      row('l2', { orderId: 'o1', requirementId: 'r4', materialId: 'mB', quantity: 10, received: 10 }),
      row('l3', { orderId: 'o1', materialId: 'mB', quantity: 2, received: 0 }),
      row('l4', { orderId: 'o3', requirementId: 'r6', materialId: 'mC', quantity: 1, received: 0 }),
      row('l5', { orderId: 'o2', requirementId: 'r6', materialId: 'mC', quantity: 100, received: 0 }),
    ],
    material_laydowns: [row('mld-1', { name: 'Rack A' })], service_companies: [row('sc-1', { name: 'Coaters' })],
    material_locations: [row('loc1', { requirementId: 'r1', laydownId: 'mld-1', date: '2026-10-20' }), row('loc2', { requirementId: 'r3', companyId: 'sc-1', date: '2026-10-25' })],
    service_requests: [], spools: [], spool_moves: [],
    revisions: [row('rev-1', { isoId: 'iso-b', type: 'ISO', revNo: '2' })],
    material_quantity_changes: [row('c1', { requirementId: 'r3', sequence: 1, type: 'Revision removal', revisionId: 'rev-1', previousQuantity: 12, quantity: -2, newQuantity: 10, date: '2026-10-05', note: 'Spool deleted' })],
  };
}
const TODAY = '2026-11-12';

test('free pool is site inventory minus open reservations and untaken pick lists, per material, never negative; storehouses do not count', () => {
  const pools = freePoolByMaterial(sample());
  assert.deepEqual([...pools].map(([key, pool]) => [key, pool.stock, pool.reserved, pool.free]), [['site-1|catalog:mA', 15, 0, 15], ['site-1|catalog:mB', 5, 2, 3]]);
  const over = sample(); over.reservations.push(row('res3', { isoId: 'iso-a', requirementId: 'r2', materialId: 'mB', quantity: 9, status: 'Reserved' }));
  assert.equal(freePoolByMaterial(over).get('site-1|catalog:mB')!.free, 0);
  const claimed = sample(); claimed.picklists.push(row('pl2', { isoId: 'iso-b', requirementId: 'r3', materialId: 'mA', quantity: 4, taken: false }));
  assert.equal(freePoolByMaterial(claimed).get('site-1|catalog:mA')!.free, 11, '15 − 4 on a pick list not taken yet');
  const storehouse = sample(); storehouse.stock.push(row('s3', { materialId: 'mC', warehouseId: 'w1', quantity: 50 }));
  assert.equal(freePoolByMaterial(storehouse).get('site-1|catalog:mC'), undefined);
});

test('coverage is handed out in priority then ISO order and drives the readiness of each isometric', () => {
  const model = mtoDashboard(sample(), { today: TODAY }), board = byIsoNo(model);
  assert.deepEqual([board['A-100'].required, board['A-100'].covered, board['A-100'].readiness], [13, 13, 'STARTABLE']);
  assert.deepEqual([board['B-200'].covered, board['B-200'].shortage, board['B-200'].readiness], [5, 5, 'PARTIAL'], 'only 15 − 10 = 5 of mA is left for the second isometric');
  assert.deepEqual([board['D-400'].covered, board['D-400'].shortage, board['D-400'].readiness], [5, 0, 'STARTED'], 'a pick list exists');
  assert.deepEqual([board['C-300'].covered, board['C-300'].shortage, board['C-300'].readiness], [2, 4, 'PARTIAL'], 'its own 2 reserved, the free mB was taken by iso-a');
  assert.deepEqual([board['E-500'].covered, board['E-500'].shortage, board['E-500'].readiness], [0, 3, 'BLOCKED']);
  assert.deepEqual(board['B-200'].shortageMaterials, [{ materialNo: 'A-001', description: 'Pipe 4 in', quantity: 5 }]);
  // Exception score = not ordered × 2 + blocking backorder + 1 when aged 15+: B-200 0 + 5 + 1, C-300 4 + 2 + 0, E-500 4 + 1 + 1 = 6;
  // A-100 0 + 0 + 1 (on Rack A for 23 days); D-400 0 (started, no aging).
  assert.deepEqual(model.board.map(item => [item.isoNo, item.exceptionScore]), [['B-200', 6], ['C-300', 6], ['E-500', 6], ['A-100', 1], ['D-400', 0]]);
});

test('shortage splits into blocking backorder (open order lines) and not ordered; cancelled orders and received lines do not count', () => {
  const model = mtoDashboard(sample(), { today: TODAY }), board = byIsoNo(model);
  assert.deepEqual([board['B-200'].blockingBackorder, board['B-200'].notOrdered, board['B-200'].openOrdered], [5, 0, 5], 'line l1: 8 ordered − 3 received = 5 open');
  assert.deepEqual([board['C-300'].blockingBackorder, board['C-300'].notOrdered, board['C-300'].openOrdered], [2, 2, 2], 'l2 is received in full; l3 has no requirement and is matched by project and material');
  assert.deepEqual([board['E-500'].blockingBackorder, board['E-500'].notOrdered, board['E-500'].openOrdered], [1, 2, 1], 'l4 open 1; the cancelled order l5 is ignored');
  assert.deepEqual([board['A-100'].blockingBackorder, board['A-100'].notOrdered], [0, 0]);
  for (const item of model.board) assert.equal(round(item.blockingBackorder + item.notOrdered), item.shortage, item.isoNo);
});

test('the six KPI cards and the chips of the sample', () => {
  const model = mtoDashboard(sample(), { today: TODAY });
  // Blocked 3 = B-200, C-300, E-500 (not started, short). Free pool materials 2 = mA, mB. Open ordered by material: 5 (l1) + 2 (l3) + 1 (l4) = 8.
  assert.deepEqual(model.kpis, { startable: 1, started: 1, inScope: 5, partial: 2, blocked: 3, reserved: 2, blockingQuantity: 8, blockingIsometrics: 3, notOrderedMaterials: 2, notOrderedIsometrics: 2, freePoolMaterials: 2, openOrdered: 8 });
  // Max startable 3 = A-100, B-200 (10 ≤ 15 alone) and the started D-400. Ordered 8 + 10 + 2 + 1 = 21, received 3 + 10 = 13.
  // Aging: A-100 Rack A since 20-10 = 23, B-200 ordered 01-10 = 42, E-500 ordered 10-10 = 33 (all 15+); C-300 and D-400 "No log".
  assert.deepEqual(model.chips, { maxStartable: 3, freePoolMaterials: 2, ordered: 21, received: 13, openOrdered: 8, blockingBackorder: 8, notOrdered: 4, aging: { '0-7 days': 0, '8-14 days': 0, '15+ days': 3 }, noLogisticsUpdate: 2 });
  assert.deepEqual(model.backlog, [{ scope: 'Site', openOrdered: 8, blockingBackorder: 8, notOrdered: 4 }]);
  assert.deepEqual(model.signals, { 'Not-sent': 2, 'At service': 1, 'At laydown': 1, Started: 1 });
  assert.deepEqual(model.locations.map(bar => [bar.location, bar.isometrics]), [['Coaters', 1], ['Rack A', 1], ['Not sent', 2], ['Materials issued', 1]]);
  const board = byIsoNo(model);
  assert.deepEqual(['A-100', 'B-200', 'C-300', 'D-400', 'E-500'].map(no => board[no].logistics), ['Rack A / 23 days', 'Ordered 01-10-2026 / 42 days', 'Not sent / No log', 'Materials issued / No log', 'Ordered 10-10-2026 / 33 days']);
});

test('an operation phase narrows the lines, the order totals and the free-pool materials', () => {
  const model = mtoDashboard(sample(), { phaseId: 'ph-field', today: TODAY }), board = byIsoNo(model);
  assert.deepEqual(model.board.map(item => item.isoNo), ['C-300']);
  // Only r4 competes for mB now: 2 reserved + 3 free = 5 of 6; l3 (project p1, mB) covers the 1 short.
  assert.deepEqual([board['C-300'].covered, board['C-300'].shortage, board['C-300'].blockingBackorder, board['C-300'].notOrdered], [5, 1, 1, 0]);
  assert.deepEqual([model.chips.ordered, model.chips.received, model.chips.openOrdered], [12, 10, 2], 'mB: l2 10 / 10 and l3 2 / 0');
  assert.deepEqual([model.kpis.startable, model.kpis.partial, model.kpis.blocked, model.kpis.freePoolMaterials, model.chips.maxStartable], [0, 1, 1, 1, 0]);
  assert.equal(mtoDashboard(sample(), { phaseId: 'no-such-phase', today: TODAY }).board.length, 0);
});

test('server-side filters: project, spool and supplier narrow the lines; the supplier also narrows the order totals', () => {
  const rows = sample();
  assert.deepEqual(mtoDashboard(rows, { projectId: 'p2', today: TODAY }).board.map(item => item.isoNo), ['D-400']);
  rows.spools = [row('sp1', { isoId: 'iso-c', name: 'S1' })];
  assert.deepEqual(mtoDashboard(rows, { spoolId: 'sp1', today: TODAY }).board.map(item => item.isoNo), ['C-300']);
  // Supplier sup-1 (order o1): requirement lines with an order line on o1 are r3 (B-200) and r4 (C-300); its lines l1, l2, l3 = 8 + 10 + 2 ordered, 3 + 10 received.
  const bySupplier = mtoDashboard(rows, { supplierId: 'sup-1', today: TODAY });
  assert.deepEqual(bySupplier.board.map(item => item.isoNo).sort(), ['B-200', 'C-300']);
  assert.deepEqual([bySupplier.chips.ordered, bySupplier.chips.received, bySupplier.chips.openOrdered], [20, 13, 7]);
  assert.deepEqual(bySupplier.filters, { phaseId: '', projectId: '', spoolId: '', supplierId: 'sup-1' });
});

test('the deep-link parameters and the default operation phase (Shop, chosen anew on every visit)', () => {
  const phases = sample().operation_phases;
  assert.equal(defaultDashboardPhase(phases), 'ph-shop');
  assert.equal(defaultDashboardPhase([row('v', { name: 'Valves' }), row('f', { name: 'Field' })]), 'v', 'no Shop: the first of the list');
  assert.equal(defaultDashboardPhase([]), '');
  assert.deepEqual(dashboardFilters(new URLSearchParams(''), 'ph-shop'), { phaseId: 'ph-shop', projectId: '', spoolId: '', supplierId: '' });
  assert.deepEqual(dashboardFilters(new URLSearchParams(`type=${ALL_PHASES}`), 'ph-shop').phaseId, '', 'type=0 is All operation phases');
  assert.deepEqual(dashboardFilters(new URLSearchParams('project=p1&spool=sp1&supplier=sup-1&type=ph-field'), 'ph-shop'), { phaseId: 'ph-field', projectId: 'p1', spoolId: 'sp1', supplierId: 'sup-1' });
});

test('focus lists: startable by priority, blocked by shortage, hottest materials by isometrics waiting then shortage', () => {
  const model = mtoDashboard(sample(), { today: TODAY });
  assert.deepEqual(model.focus.startable.map(item => item.isoNo), ['A-100']);
  assert.deepEqual(model.focus.blocked.map(item => item.isoNo), ['B-200', 'C-300', 'E-500']);
  assert.deepEqual(model.focus.materials.map(item => [item.materialNo, item.isometrics, item.shortage, item.blockingBackorder, item.notOrdered]), [['A-001', 1, 5, 5, 0], ['B-002', 1, 4, 2, 2], ['C-003', 1, 3, 1, 2]]);
});

test('operations board: quick filters as the reference names them, KPI click-throughs, paging 4 / 25 / 50 / 100, 45 s reload', () => {
  const model = mtoDashboard(sample(), { today: TODAY }), counts = boardCounts(model.board);
  assert.deepEqual([...BOARD_TABS], ['All', 'Startable', 'Partial', 'Blocked', 'Open ordered', 'Not ordered', 'At service', 'At laydown', 'Aging']);
  assert.deepEqual([...BOARD_COLUMNS], ['Project / ISO', 'Readiness', 'Shortage', 'Blocking backorder', 'Not ordered', 'Logistics / aging', 'Action']);
  assert.deepEqual(counts, { All: 5, Startable: 1, Partial: 2, Blocked: 3, 'Open ordered': 3, 'Not ordered': 2, 'At service': 1, 'At laydown': 1, Aging: 3 });
  assert.equal(counts.Blocked, model.kpis.blocked, 'the Blocked card and the Blocked filter show the same isometrics');
  assert.deepEqual(KPI_FILTERS, { startable: 'Startable', partial: 'Partial', blocked: 'Blocked', backorder: 'Open ordered', notOrdered: 'Not ordered', freePool: 'All' });
  assert.deepEqual([...BOARD_PAGE_SIZES], [4, 25, 50, 100]); assert.equal(BOARD_RELOAD_MS, 45000);
  const page = boardPage(model.board, 1, 2); assert.deepEqual([page.items.map(item => item.isoNo), page.page, page.pages, page.total], [['E-500', 'A-100'], 1, 3, 5]);
  assert.equal(boardPage(model.board, 99, 2).page, 2, 'the page stays in range'); assert.equal(boardPage([], 3).pages, 1);
  assert.equal(boardPage(model.board, 0).items.length, 4, 'four per page first');
  assert.deepEqual(model.materials.map(item => [item.materialNo, item.shortage, item.openOrdered, item.notOrdered]), [['A-001', 5, 5, 0], ['B-002', 4, 2, 2], ['C-003', 3, 1, 2]]);
});

test('single rules: readiness, priority rank, days and aging buckets', () => {
  assert.deepEqual([{ required: 4, covered: 4, started: false }, { required: 4, covered: 4, started: true }, { required: 4, covered: 1, started: false }, { required: 4, covered: 0, started: false }, { required: 4, covered: 1, started: true }].map(readinessOf), ['STARTABLE', 'STARTED', 'PARTIAL', 'BLOCKED', 'STARTED']);
  assert.deepEqual([{ priority: 'Prio 1' }, { priority: 'Critical' }, { priority: 'Prio 5' }, { priority: '' }, { priority: 'Normal' }].map(item => priorityRank(item as unknown as Row)), [1, 1, 5, 99, 3]);
  assert.deepEqual([daysBetween('2026-11-01', '2026-11-12'), daysBetween('2026-11-12', '2026-11-12'), daysBetween('2026-11-20', '2026-11-12'), daysBetween('', '2026-11-12'), daysBetween('2026-10-31', '2026-11-01')], [11, 0, 0, null, 1]);
  assert.deepEqual([0, 7, 8, 14, 15, 40].map(days => agingBucket(days)), ['0-7 days', '0-7 days', '8-14 days', '8-14 days', '15+ days', '15+ days']); assert.equal(agingBucket(null), '');
  assert.deepEqual([...AGING_BUCKETS], ['0-7 days', '8-14 days', '15+ days']);
});

test('Material revisions report lists the quantity-by-revision log, newest first, with the phase filter', () => {
  const rows = sample(); rows.material_quantity_changes.push(row('c2', { requirementId: 'r4', sequence: 1, type: 'Edit', previousQuantity: 8, quantity: -2, newQuantity: 6, date: '2026-10-30' }), row('c3', { requirementId: 'r4', sequence: 2, type: 'Edit', previousQuantity: 6, quantity: 0, newQuantity: 6, date: '2026-10-30', _archived: true }));
  assert.deepEqual(materialRevisionRows(rows).map(line => [line.isoNo, line.materialNo, line.type, line.revision, line.date, line.previous, line.change, line.quantity, line.note]),
    [['C-300', 'B-002', 'Edit', '', '2026-10-30', 8, -2, 6, ''], ['B-200', 'A-001', 'Revision removal', '2', '2026-10-05', 12, -2, 10, 'Spool deleted']]);
  assert.deepEqual(materialRevisionRows(rows, 'ph-shop').map(line => line.isoNo), ['B-200']);
});

test('an empty or partial workspace gives an empty dashboard instead of an error', () => {
  const model = mtoDashboard({}, { today: TODAY });
  assert.deepEqual([model.board.length, model.kpis.inScope, model.kpis.freePoolMaterials, model.chips.maxStartable, model.backlog.length, model.locations.length, model.materials.length], [0, 0, 0, 0, 0, 0, 0]);
  const noIso = sample(); noIso.iso_materials = []; assert.equal(mtoDashboard(noIso, { today: TODAY }).board.length, 0);
});

test('the local sample shows every readiness state, a blocking backorder and a not-ordered material', t => {
  const store = new Store(':memory:'); seed(store); seedMtoLogistics(store, SYSTEM); seedMtoDashboard(store, SYSTEM); seedMtoDashboard(store, SYSTEM); t.after(() => store.close());
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
  const model = mtoDashboard(rows, { today: '2026-11-16' }), board = byIsoNo(model);
  for (const state of ['STARTED', 'PARTIAL', 'BLOCKED'] as const) assert.ok(model.board.some(item => item.readiness === state), state);
  // STX-CW-002 is startable: its own reservations cover every line. The partial delivery of order 2026-10-16 (server/seed.ts)
  // is the material-3 line on every run, so its 6 flanges are reserved.
  const cw2 = board['STX-CW-002'];
  assert.ok(cw2.lines.every(line => line.reserved >= line.required), 'every line reserved');
  assert.equal(cw2.readiness, 'STARTABLE');
  assert.deepEqual([board['STX-SK-010'].readiness, board['STX-SK-010'].required, board['STX-SK-010'].covered, board['STX-SK-010'].blockingBackorder, board['STX-SK-010'].notOrdered], ['BLOCKED', 10, 0, 8, 2]);
  assert.equal(rows.materials.filter(item => item.id === 'material-dash-1').length, 1, 'the sample runs once');
  assert.ok(new Set(model.board.map(item => item.signal)).size >= 2, 'logistics signals vary');
});

// ----- through HTTP: the data the dashboard computes from, the page areas and the pilot boundary ---------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-dashboard-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const password = 'Pilot-Test-Password';
  const client = () => {
    let cookie = '';
    const request = async (path: string, pilot = 'mto', method = 'GET', data?: unknown) => {
      const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
    };
    return { request, login: async (email: string) => assert.equal((await request('/api/auth/login', 'mto', 'POST', { email, password })).status, 200, email) };
  };
  const admin = client();
  assert.equal((await admin.request('/api/auth/setup', 'mto', 'POST', { name: 'Pilot admin', email: 'dashboard-admin@example.test', password })).status, 201);
  const account = (name: string, data: Record<string, unknown>) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password)); return { email: String(user.email) };
  };
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, settingsPermission: 'No access', toolsPermission: 'No access', ...levels }).id;
  const detailed = (name: string, rules: Record<string, string[]>) => store.create('profiles', { name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: 'No access', materialsPermission: 'No access', weldingPermission: 'No access', toolsPermission: 'No access', settingsPermission: 'No access' }).id;
  return { store, client, account, profile, detailed };
}
const rowsOf = async (response: Response) => { const body = await response.json() as { rows: Record<string, Row[]> }; assert.equal(response.status, 200); return body.rows; };

test('the MTO-only account loads every record the dashboard reads and the figures are consistent; the weld-only account is refused in the MTO pilot', async t => {
  const f = await hostedFixture(t);
  const writer = f.profile('Writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const as = f.client(); await as.login(mtoOnly.email);
  const body = await (await as.request('/api/bootstrap', 'mto')).json() as { rows: Record<string, Row[]>; user: User };
  const rows = body.rows;
  assert.ok(!rows.welds, 'MTO-only: no weld register');
  for (const key of MTO_DASHBOARD_REQUIRED) assert.ok(Array.isArray(rows[key]), `the bootstrap delivers ${key}`);
  assert.deepEqual(dashboardPanels(key => canScope(body.user, key)), { logistics: true, materials: true, orders: true }, 'a module-level profile reads every panel');
  const model = mtoDashboard(rows, { today: '2026-11-12' });
  assert.ok(model.board.length > 0, 'the sample has isometrics with requirements');
  for (const item of model.board) {
    assert.equal(round(item.covered + item.shortage), item.required, `${item.isoNo}: covered + shortage = required`);
    assert.equal(round(item.blockingBackorder + item.notOrdered), item.shortage, `${item.isoNo}: blocking + not ordered = shortage`);
    assert.ok(item.covered >= 0 && item.shortage >= 0);
  }
  const { kpis } = model; assert.equal(kpis.startable + kpis.started + kpis.partial + model.board.filter(item => item.readiness === 'BLOCKED').length, kpis.inScope);
  assert.equal(boardCounts(model.board).All, kpis.inScope);
  assert.equal(model.chips.blockingBackorder, kpis.blockingQuantity);
  assert.equal(Object.values(model.signals).reduce((a, b) => a + b, 0), kpis.inScope);
  assert.equal(model.locations.reduce((a, bar) => a + bar.isometrics, 0), kpis.inScope, 'every isometric has one bar');
  // The same account's pilot menu offers the dashboard as its Start page.
  assert.ok(PILOT_MAP.mto.groups.some(group => group.title === 'Start' && group.items.some(item => pilotItemPath(item) === '/dashboard')));

  const weld = f.client(); await weld.login(weldOnly.email);
  const refused = await weld.request('/api/bootstrap', 'mto'); assert.equal(refused.status, 403); assert.equal((await refused.json() as { code: string }).code, 'pilot');
  assert.equal((await weld.request('/api/records/iso_materials', 'mto')).status, 403);
  assert.equal((await weld.request('/api/records/stock', 'mto')).status, 403);
});

test('page areas 1 / 2 / 3 gate the dashboard panels: an account without "Dashboard - Pending materials" (2) sees no KPI cards or board', async t => {
  const f = await hostedFixture(t);
  assert.deepEqual(MTO_DASHBOARD_PANEL_AREAS, { logistics: '1', materials: '2', orders: '3' });
  const base = { '64': ['show'], '70': ['show'], '16': ['show'] };
  const without = f.account('No pending materials', { weldEnabled: false, mtoEnabled: true, profileId: f.detailed('Without 2', { ...base, '1': ['show'], '3': ['show'] }), mtoProfileId: f.detailed('Without 2 (MTO)', { ...base, '1': ['show'], '3': ['show'] }) });
  const none = f.account('No dashboard areas', { weldEnabled: false, mtoEnabled: true, profileId: f.detailed('No areas', base), mtoProfileId: f.detailed('No areas (MTO)', base) });
  const a = f.client(), b = f.client(); await a.login(without.email); await b.login(none.email);
  const userA = (await (await a.request('/api/bootstrap', 'mto')).json() as { user: User }).user, userB = (await (await b.request('/api/bootstrap', 'mto')).json() as { user: User }).user;
  assert.equal(userA.capabilities?.['2'], undefined, 'area 2 is not granted');
  assert.deepEqual(dashboardPanels(key => canScope(userA, key)), { logistics: true, materials: false, orders: true });
  assert.deepEqual(dashboardPanels(key => canScope(userB, key)), { logistics: false, materials: false, orders: false });
});

test('an MTO profile without materials rights receives none of the dashboard records, so the page shows its no-access state', async t => {
  const f = await hostedFixture(t);
  const narrow = f.profile('General only', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'No access' });
  const account = f.account('No materials', { profileId: narrow, weldEnabled: false, mtoEnabled: true, mtoProfileId: narrow });
  const as = f.client(); await as.login(account.email);
  const response = await as.request('/api/bootstrap', 'mto');
  if (response.status === 200) {
    const body = await response.json() as { rows: Record<string, Row[]>; user: User };
    assert.ok(MTO_DASHBOARD_REQUIRED.some(key => !body.rows[key]), 'at least one required collection is missing, which the client reads as no access');
    for (const key of ['iso_materials', 'stock', 'reservations', 'picklists', 'orders', 'order_lines']) assert.ok(!body.rows[key]?.length, `${key} is not delivered`);
    assert.deepEqual(dashboardPanels(key => canScope(body.user, key)), { logistics: false, materials: false, orders: false }, 'no materials level: no dashboard area either');
  } else assert.equal(response.status, 403);
  assert.equal((await as.request('/api/records/stock', 'mto')).status, 403);
  assert.equal((await as.request('/api/records/order_lines', 'mto')).status, 403);
});

test('the "Open ordered" chip equals the Site backlog bar and the sum of the Open ordered view on the local sample', t => {
  const store = new Store(':memory:'); seed(store); seedMtoLogistics(store, SYSTEM); seedMtoDashboard(store, SYSTEM); t.after(() => store.close());
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
  for (const phaseId of ['', ...rows.operation_phases.map(phase => phase.id)]) {
    const model = mtoDashboard(rows, { today: '2026-11-16', phaseId });
    assert.equal(model.chips.openOrdered, model.backlog[0]?.openOrdered ?? 0, `phase ${phaseId || 'all'}`);
    assert.equal(model.chips.openOrdered, round(model.materials.reduce((sum, item) => sum + item.openOrdered, 0)), `phase ${phaseId || 'all'}: material view`);
  }
  const all = mtoDashboard(rows, { today: '2026-11-16' });
  assert.ok(all.chips.openOrdered > 0, 'the sample has open ordered quantity');
});

test('E6: the sample order of 2026-10-16 receives its partial delivery on the material-3 line on every run', () => {
  for (let run = 0; run < 5; run++) {
    const store = new Store(':memory:'); seed(store);
    const order = store.list('orders').find(item => item.date === '2026-10-16')!;
    const received = store.list('order_lines').filter(line => line.orderId === order.id).map(line => [line.materialId, Number(line.received || 0)]).sort();
    assert.deepEqual(received, [['material-1', 0], ['material-3', 10]], 'received 12, two corrected back');
    store.close();
  }
});
