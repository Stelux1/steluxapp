import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor } from '../shared/release.ts';
import { PILOT_MAP, pagePilots } from '../shared/pilots.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { areaPilots, canResource } from '../shared/permissions.ts';
import { DEFAULT_NDT_PERCENT, isoItpId, isoItpLinks, itpNdtPercent, itpSlotRefresh, itpUsage, itpsForProject, weldItpId } from '../shared/itp-dashboard.ts';
import {
  COMPLIANCE_PAGE_SIZE, DASHBOARD_REFRESH_MS, NO_DASHBOARD_FILTERS, NO_TRACER_CANDIDATES, VIEW_OPTIONS, barPercent, breakdownText, dashboardFilterCount, defaultDashboardFilters, defectFlag, filterGroups, filterSummary,
  groupTracerProposal, headerDate, isNdtCompleted, isTracerWeld, itpOptionLabel, ndtProcessLabel, pageOf, pageRange, percentLabel, requiredExaminations, scheduleDashboardRefresh, share, tracerStatus, viewLabel, weldDashboard,
  weldTypeLabel, welderLabel, welderOptionLabel, type DashboardFilters, type DashboardRows, type WeldView,
} from '../shared/weld-dashboard.ts';
import { weldItpCode } from '../shared/inspections.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data } as Row);

// ----- hand-computed dataset ----------------------------------------------------------------------------------------
// welders: wa = WA1 Alex Taylor (company c1), wb = WB2 Robin Lane (c2).  WPS: w1, w2.  ITP/KNR: i30 = 30 %, i50 = 50 %, i-empty = no NDT %.
// iso1: project p1, ITP No 1 = i30.   iso2: project p1, no ITP.   iso3: project p2, ITP No 2 = i50.   iso4: project p2, no welds.   p3: no isometric.
// t1 = Shop 'BW', t2 = Field without abbreviation ("Branch welds - Field").
// iso1 / wa / w1 / Shop: a1..a8. a1 accepted, a2 NA (rejected), a3 NDT Req. without result, a4 repaired, a8 tracer.
// iso2 / wa / w1 / Field: f1..f3, f1 accepted.   iso3 / wb / w2 / Field: c1..c4, c1 and c2 accepted (c1 on a UT process).
// d1: iso1, no welder, no date, flagged repaired (welded and repair counts skip it). One archived weld is ignored.
const results = [
  row('x-a1', { weldId: 'a1', type: 'NDT', result: 'Accepted', date: '2026-10-10' }),
  row('x-a2', { weldId: 'a2', type: 'NDT', result: 'Rejected', date: '2026-10-10' }),
  row('x-f1', { weldId: 'f1', type: 'NDT', result: 'Accepted', date: '2026-11-10' }),
  row('x-c1', { weldId: 'c1', type: 'NDT', result: 'Accepted', date: '2026-10-20' }),
  row('x-c2', { weldId: 'c2', type: 'NDT', result: 'Accepted', date: '2026-10-20' }),
  row('x-a3-vi', { weldId: 'a3', type: 'VI', result: 'Accepted', date: '2026-10-10' }),
];
const welds = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => row(`a${i}`, { typeId: 't1', wpsId: 'w1', weldNo: `A${i}`, isoId: 'iso1', welder1Id: 'wa', date: `2026-10-0${i}`, ndoReq: i === 3, repair: i === 4, tracer: i === 8 })),
  ...[1, 2, 3].map(i => row(`f${i}`, { weldNo: `F${i}`, isoId: 'iso2', typeId: 't2', wpsId: 'w1', welder1Id: 'wa', date: `2026-11-0${i}` })),
  ...[1, 2, 3, 4].map(i => row(`c${i}`, { weldNo: `C${i}`, isoId: 'iso3', typeId: 't2', wpsId: 'w2', welder1Id: 'wb', date: '2026-10-15' })),
  row('d1', { weldNo: 'D1', isoId: 'iso1', typeId: 't1', wpsId: 'w1', repair: true }),
  row('gone', { weldNo: 'G1', isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa', date: '2026-10-09', _archived: true }),
];
const rows: DashboardRows = {
  welds, results,
  isometrics: [row('iso1', { projectId: 'p1', itpId: 'i30', pipingClass: 'CS150', irn: 'IRN-1', ped: 'Cat II', material: 'A106 Gr B' }), row('iso2', { projectId: 'p1', pipingClass: 'SS300' }), row('iso3', { projectId: 'p2', itp2Id: 'i50' }), row('iso4', { projectId: 'p2' })],
  projects: [row('p1'), row('p2'), row('p3')],
  weldTypes: [row('t1', { name: 'Butt Weld - Shop', abbreviation: 'BW', location: 'Shop' }), row('t2', { name: 'Branch welds - Field', location: 'Field' })],
  welders: [row('wa', { number: 'WA1', name: 'Alex Taylor', companyId: 'c1' }), row('wb', { number: 'WB2', name: 'Robin Lane', companyId: 'c2' })],
  wps: [row('w1', { name: 'WPS-141' }), row('w2', { name: 'WPS-135' })],
  itps: [row('i30', { number: 'ITP-30', ndtPercent: 30 }), row('i50', { number: 'ITP-50', ndtPercent: 50, scope: 'Field' }), row('i-empty', { number: 'ITP-E', ndtPercent: null })],
  ndtProcesses: [row('pRT', { name: 'RT', groupId: 'g1' }), row('pUT', { name: 'UT', groupId: 'g2' })],
  requests: [row('r1', { weldId: 'a1', type: 'NDT', processId: 'pRT' }), row('r2', { weldId: 'c1', type: 'NDT', processId: 'pUT' }), row('r3', { weldId: 'a3', type: 'VI', processId: 'pRT' })],
};
const dash = (filters: Partial<DashboardFilters> = {}, site: Row | null = row('site', { repairLimit: 5 }), view: WeldView = 'welds', data = rows) => weldDashboard(data, { ...NO_DASHBOARD_FILTERS, ...filters }, site, view);

test('required examinations round up and never overshoot on floating-point dust', () => {
  for (const [welds, percent, expected] of [[3, 10, 1], [10, 10, 1], [11, 10, 2], [7, 30, 3], [4, 50, 2], [0, 50, 0], [5, 0, 0], [3, 33.3, 1], [10, 33.3, 4], [100, 7, 7], [20, 15, 3], [1, 100, 1], [1, 14, 1], [7, 14, 1], [15, 10, 2]] as const) assert.equal(requiredExaminations(welds, percent), expected, `${welds} x ${percent}`);
  assert.equal(requiredExaminations(Number.NaN, 10), 0);
});

test('KPI cards: counts, weld types, welded, examined %, repaired, repair rate and the repair scope (weld-dashboard-reports-011/-020/-021)', () => {
  const { kpis } = dash();
  // Projects / Isometrics: the distinct ones of the welds in scope — p3 (no isometric) and iso4 (no weld) are not counted.
  assert.deepEqual([kpis.projects, kpis.isometrics], [2, 3]);
  // 8 + 3 + 4 + 1 live welds; the archived one is ignored. Types: BW (t1) a1..a8 + d1 = 9, "Branch welds - Field" (no abbreviation) 3 + 4 = 7.
  assert.equal(kpis.totalWelds, 16);
  assert.deepEqual(kpis.weldsByType.map(item => [item.label, item.count]), [['BW', 9], ['Branch welds - Field', 7]]);
  assert.equal(breakdownText(kpis.weldsByType), 'BW 9, Branch welds - Field 7');
  assert.equal(kpis.welded, 15);                       // every weld but d1 has a welder
  assert.equal(breakdownText(kpis.weldedByType), 'BW 8, Branch welds - Field 7');
  assert.equal(kpis.examined, 5);                      // a1, a2 (an NA completes the NDT), f1, c1, c2; the VI result of a3 does not count
  assert.equal(kpis.examinedPercent, 31.3);            // 5 / 16 = 31.25 %
  assert.equal(kpis.repaired, 1);                      // a4; d1 has no welder and is excluded
  assert.equal(kpis.repairRate, 6.7);                  // 1 / 15 welded = 6.67 %
  assert.deepEqual([kpis.repairPerformance.value, kpis.repairPerformance.limit, kpis.repairPerformance.aboveLimit], [6.7, 5, true]);
  assert.equal(kpis.repairPerformance.scopePercent, 6.3);   // Scope = repaired / every weld in scope = 1 / 16 = 6.25 %
  assert.deepEqual([percentLabel(kpis.repairPerformance.limit), percentLabel(kpis.repairPerformance.scopePercent), percentLabel(0)], ['5.0 %', '6.3 %', '0.0 %']);
  assert.equal(weldTypeLabel(undefined), 'UNK');
  assert.equal(headerDate(new Date(2026, 10, 16)), 'Monday 16 November 2026');
});

test('reference repair card: Scope 7 / 77 = 9.1 %, Repair rate 7 / 59 = 11.9 %, Examined 9 / 77 = 11.7 % (weld__start__dashboard.txt:1992)', () => {
  assert.deepEqual([share(7, 77), share(7, 59), share(9, 77)], [9.1, 11.9, 11.7]);
  assert.deepEqual([percentLabel(share(7, 77)), percentLabel(5)], ['9.1 %', '5.0 %']);
});

test('Examined % leaves tracer welds out and counts only fully completed NDT (weld-dashboard-reports-012)', () => {
  const base = { isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa', date: '2026-10-01' };
  // t1 has two requested processes (columns Initial and Remaining) and only the Initial result: not completed. t2 has both. t3 is an accepted tracer.
  const extra: DashboardRows = { ...rows, welds: [row('t1w', { ...base, weldNo: 'T1', ndtProcess1Id: 'pRT', ndtProcess2Id: 'pUT' }), row('t2w', { ...base, weldNo: 'T2', ndtProcess1Id: 'pRT', ndtProcess2Id: 'pUT' }), row('t3w', { ...base, weldNo: 'T3', tracerOfId: 't1w' })],
    results: [row('r-t1', { weldId: 't1w', type: 'NDT', round: 'Initial', result: 'Accepted' }), row('r-t2a', { weldId: 't2w', type: 'NDT', round: 'Initial', result: 'Accepted' }), row('r-t2b', { weldId: 't2w', type: 'NDT', round: 'Remaining', result: 'Rejected' }), row('r-t3', { weldId: 't3w', type: 'NDT', round: 'Initial', result: 'Accepted' })] };
  const kpis = dash({}, null, 'welds', extra).kpis;
  assert.equal(kpis.examined, 1);                       // only t2w
  assert.equal(kpis.examinedPercent, 33.3);             // 1 / 3 welds in scope
  assert.equal(isNdtCompleted(extra.results, extra.welds[0]), false);
  assert.equal(isNdtCompleted(extra.results, extra.welds[1]), true);
  assert.equal(isNdtCompleted([], row('n', {})), false);
  assert.equal(isTracerWeld(row('t', { tracer: true })), true); assert.equal(isTracerWeld(row('t', { tracer: false })), false);
});

test('View: Welds length sums the weld length in mm; Repair rate becomes repaired mm / examined mm (weld-dashboard-reports-010)', () => {
  // l1 250 mm (length weld, accepted), l2 a 100 mm diameter outline (NA, repaired), l3 400 mm (no result), l4 100 mm (no welder).
  const base = { isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa', date: '2026-10-01' };
  const data: DashboardRows = { ...rows, diameters: [row('dA', { outline: 100 })],
    welds: [row('l1', { ...base, weldNo: 'L1', lengthMode: 'Length in mm', dialen: 250 }), row('l2', { ...base, weldNo: 'L2', diameterId: 'dA', repair: true }), row('l3', { ...base, weldNo: 'L3', lengthMode: 'Length in mm', dialen: 400 }), row('l4', { isoId: 'iso1', weldNo: 'L4', diameterId: 'dA' })],
    results: [row('r1', { weldId: 'l1', type: 'NDT', result: 'Accepted' }), row('r2', { weldId: 'l2', type: 'NDT', result: 'Rejected' })] };
  const length = dash({}, null, 'length', data).kpis, count = dash({}, null, 'welds', data).kpis;
  assert.equal(length.totalWelds, 850);                 // 250 + 100 + 400 + 100
  assert.equal(length.examinedPercent, 41.2);           // examined l1 + l2 = 350 mm of 850 mm
  assert.equal(length.repaired, 100);                   // l2
  assert.equal(length.repairRate, 28.6);                // 100 mm / 350 mm examined
  assert.equal(length.repairPerformance.scopePercent, 11.8);   // 100 / 850
  assert.equal(length.welded, 3);                       // a count in both views
  assert.deepEqual([count.totalWelds, count.examinedPercent, count.repaired, count.repairRate, count.repairPerformance.scopePercent], [4, 50, 1, 33.3, 25]);   // 2/4, 1 of 3 welded, 1/4
  assert.deepEqual(VIEW_OPTIONS.map(option => option.label), ['Welds length', 'Number of welds']);
  assert.deepEqual([viewLabel('welds'), viewLabel('length')], ['View: Number of welds', 'View: Welds length']);
});

test('repair performance uses the main project limit, 5 % when it is empty, and the badge only fires above the limit', () => {
  assert.equal(dash({}, row('s', { repairLimit: 8 })).kpis.repairPerformance.aboveLimit, false);
  assert.equal(dash({}, row('s', { repairLimit: 6.7 })).kpis.repairPerformance.aboveLimit, false);   // equal is not above
  assert.deepEqual([dash({}, row('s', { repairLimit: null })).kpis.repairPerformance.limit, dash({}, null).kpis.repairPerformance.limit], [5, 5]);
  assert.equal(dash({}, row('s', { repairLimit: 0 })).kpis.repairPerformance.limit, 0);
});

test('an empty selection shows zeros, never NaN', () => {
  const none = dash({ welderIds: ['wb'], wpsIds: ['w1'] });
  assert.deepEqual([none.kpis.totalWelds, none.kpis.welded, none.kpis.examinedPercent, none.kpis.repairRate, none.kpis.repairPerformance.value, none.kpis.repairPerformance.scopePercent, none.kpis.projects, none.kpis.isometrics], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(none.compliance, []);
  assert.deepEqual([none.summary.totalGroups, none.summary.status], [0, 'COMPLIANT']);
  assert.equal(share(0, 0), 0); assert.equal(barPercent(3, 0), 0);
});

test('compliance groups by welder + WPS + ITP/KNR; COMPLIANT when examined + selected covers the requirement (weld-dashboard-reports-001)', () => {
  const groups = dash().compliance;
  assert.equal(groups.length, 3);
  const a = groups.find(group => group.welderId === 'wa' && group.itpId === 'i30')!;
  // 7 non-tracer welds (a1..a7) at 30 % -> ceil(2.1) = 3. Examined a1, a2. Selected a3 (NDT Req., no NDT result). Remaining max(0, 3 - 2 - 1) = 0.
  assert.deepEqual([a.total, a.required, a.examined, a.selected, a.remaining, a.compliant, a.usedPercent, a.itpPercent], [7, 3, 2, 1, 0, true, 30, 30]);
  // Without the selection (a3 not marked) 2 of 3 are covered: remaining 1, not compliant.
  const unselected = weldDashboard({ ...rows, welds: rows.welds.map(weld => weld.id === 'a3' ? { ...weld, ndoReq: false } as Row : weld) }, NO_DASHBOARD_FILTERS, null).compliance.find(group => group.itpId === 'i30')!;
  assert.deepEqual([unselected.remaining, unselected.compliant], [1, false]);
  // iso2 has no ITP/KNR: 10 % of 3 welds -> 1, examined f1.
  const b = groups.find(group => group.welderId === 'wa' && group.itpId === '')!;
  assert.deepEqual([b.total, b.required, b.examined, b.selected, b.remaining, b.compliant, b.usedPercent, b.itpPercent, b.itpNumber, b.percentLabel], [3, 1, 1, 0, 0, true, DEFAULT_NDT_PERCENT, null, 'Unassigned', 'Fallback 10%']);
  // iso3: Field welds use ITP No 2 (50 %): 4 x 50 % = 2 exactly, examined c1 and c2.
  const c = groups.find(group => group.welderId === 'wb')!;
  assert.deepEqual([c.total, c.required, c.examined, c.compliant, c.wpsName, c.itpNumber, c.welderLabel, c.percentLabel], [4, 2, 2, true, 'WPS-135', 'ITP-50', 'WB2 - Robin Lane', '50.0 %']);
  // Order: welder number, then (all compliant here) total welds ascending: WA1 '' (3), WA1 ITP-30 (7), WB2.
  assert.deepEqual(groups.map(group => group.key), [b.key, a.key, c.key]);
});

test('the defect block works per group, with Exam %, flag, tracer status and the Tracers action (weld-dashboard-reports-005, delta-I2b-R1)', () => {
  const groups = dash().compliance;
  const a = groups.find(group => group.itpId === 'i30')!.defects;
  // a1..a7: examined a1 a2 -> 2/7 = 28.6 %; rejected a2 -> 1/2 = 50 %; 2 tracers expected, none linked (a8 is flagged, not linked).
  assert.deepEqual([a.welds, a.examined, a.examinedPercent, a.rejected, a.rejectedPercent, a.expectedTracers, a.tracerWelds, a.missingTracers], [7, 2, 28.6, 1, 50, 2, 0, 2]);
  assert.deepEqual([a.flag, a.flagReason, a.tracerStatus, a.tracerAction, a.tracerHint], ['bad', 'Rejected but tracers missing', { value: 'Missing', hint: '2 of 2 tracer(s) still required.' }, true, 'Missing 2']);
  const c = groups.find(group => group.welderId === 'wb')!.defects;
  assert.deepEqual([c.welds, c.examined, c.examinedPercent, c.rejected, c.flag, c.tracerStatus.value, c.tracerAction], [4, 2, 50, 0, 'ok', 'Not needed', false]);
  // Client answer 17.11.2026: a rejected weld counts as Rejected only until it is repaired. A2 gets its repair weld; once that
  // repair is accepted the group has no rejected weld (no tracers expected, flag ok), before that A2 still counts.
  const repair = row('a2r1', { typeId: 't1', wpsId: 'w1', weldNo: 'A2R1', isoId: 'iso1', welder1Id: 'wa', date: '2026-10-12', repairOfId: 'a2' });
  const withRepair = (result?: string): DashboardRows => ({ ...rows, welds: [...welds, repair], results: result ? [...results, row('x-a2r1', { weldId: 'a2r1', type: 'NDT', result, date: '2026-10-14' })] : results });
  const defectsOf = (data: DashboardRows) => dash({}, undefined, 'welds', data).compliance.find(group => group.itpId === 'i30')!.defects;
  assert.equal(defectsOf(withRepair()).rejected, 1, 'a repair without an accepted result does not close the rejection');
  assert.equal(defectsOf(withRepair('Rejected')).rejected, 2, 'a rejected repair is rejected as well');
  const repaired = defectsOf(withRepair('Accepted'));
  assert.deepEqual([repaired.rejected, repaired.expectedTracers, repaired.missingTracers, repaired.flag], [0, 0, 0, 'ok']);
  // Tracer status branches (reference buildTracerStatus).
  assert.deepEqual(tracerStatus({ expectedTracers: 0, tracerWelds: 0, tracerExamined: 0, tracerRejected: 0, missingTracers: 0 }), { value: 'Not needed', hint: 'No tracer action required for this group.' });
  assert.deepEqual(tracerStatus({ expectedTracers: 4, tracerWelds: 3, tracerExamined: 2, tracerRejected: 1, missingTracers: 1 }), { value: 'Rejected', hint: '1 accepted / 1 rejected | 1 additional tracer(s) still required.' });
  assert.deepEqual(tracerStatus({ expectedTracers: 2, tracerWelds: 2, tracerExamined: 0, tracerRejected: 0, missingTracers: 0 }), { value: 'Selected', hint: '2 of 2 tracer(s) selected.' });
  assert.deepEqual(tracerStatus({ expectedTracers: 2, tracerWelds: 0, tracerExamined: 0, tracerRejected: 0, missingTracers: 0 }), { value: 'Open', hint: 'Tracer workflow is open for this group.' });
  assert.deepEqual([defectFlag({ examined: 0, rejected: 0, missingTracers: 0 }), defectFlag({ examined: 2, rejected: 1, missingTracers: 0 }), defectFlag({ examined: 2, rejected: 1, missingTracers: 2 })],
    [{ flag: 'warn', reason: 'Not examined' }, { flag: 'ok', reason: '' }, { flag: 'bad', reason: 'Rejected but tracers missing' }]);
  // Linking the two tracers fills the status and clears the action hint.
  const linked = weldDashboard({ ...rows, welds: rows.welds.map(weld => ['a5', 'a6'].includes(weld.id) ? { ...weld, tracerOfId: 'a2' } as Row : weld) }, NO_DASHBOARD_FILTERS, null).compliance.find(group => group.itpId === 'i30')!;
  assert.deepEqual([linked.total, linked.defects.tracerWelds, linked.defects.missingTracers, linked.defects.flag, linked.defects.tracerStatus.value, linked.defects.tracerHint], [5, 2, 0, 'ok', 'Selected', 'Open details']);
  // A tracer on an isometric of another main project still counts for the rejected weld (`tracerWelds` = every weld the reader sees).
  const elsewhere = row('far', { weldNo: 'X1', isoId: 'other-site-iso', tracerOfId: 'a2' });
  const far = weldDashboard({ ...rows, tracerWelds: [...rows.welds, elsewhere] }, NO_DASHBOARD_FILTERS, null).compliance.find(group => group.itpId === 'i30')!;
  assert.deepEqual([far.total, far.defects.tracerWelds, far.defects.missingTracers, far.defects.tracerStatus.hint], [7, 1, 1, '1 of 2 tracer(s) still required.']);
});

test('a weld counts in the group of every one of its welders; the KPIs count it once (weld-dashboard-reports-002)', () => {
  const data: DashboardRows = { ...rows, welds: [row('two', { weldNo: '003', isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa', welder2Id: 'wb', date: '2026-10-01' })], results: [] };
  const result = weldDashboard(data, NO_DASHBOARD_FILTERS, null);
  assert.deepEqual(result.compliance.map(group => [group.welderId, group.total]), [['wa', 1], ['wb', 1]]);
  assert.deepEqual([result.kpis.totalWelds, result.kpis.welded, result.summary.totalWelds], [1, 1, 2]);
  // The welder filter keeps the weld and lists only the chosen welder's group.
  assert.deepEqual(weldDashboard(data, { ...NO_DASHBOARD_FILTERS, welderIds: ['wb'] }, null).compliance.map(group => group.welderId), ['wb']);
  // The company filter matches any of the weld's welders.
  assert.equal(weldDashboard(data, { ...NO_DASHBOARD_FILTERS, companyId: 'c2' }, null).kpis.totalWelds, 1);
});

test('Field welds use ITP No 2, Shop and untyped welds ITP No 1; an empty slot falls back to 10 % (weld-dashboard-reports-003)', () => {
  const itps = [row('i30', { number: 'ITP-30', ndtPercent: 30, scope: 'Shop' }), row('i50', { number: 'ITP-50', ndtPercent: 50, scope: 'Field' }), row('both', { number: 'ITP-SF', ndtPercent: 20, scope: 'Shop+Field' })];
  const iso = row('iso', { itpId: 'i30', itp2Id: 'i50' });
  assert.deepEqual([weldItpId(iso, 'Field', itps), weldItpId(iso, 'Shop', itps), weldItpId(iso, '', itps)], ['i50', 'i30', 'i30']);
  assert.equal(weldItpId(row('x', { itpId: 'both' }), 'Field', itps), 'both');     // a Shop+Field entry in slot 1 covers the field welds
  assert.equal(weldItpId(row('x', { itpId: 'i30' }), 'Field', itps), '');          // Shop only: the field weld has no ITP/KNR
  assert.equal(weldItpId(row('x', { itp2Id: 'i50' }), 'Shop', itps), '');         // slot 2 never serves a shop weld
  const data: DashboardRows = { ...rows, itps, isometrics: [row('iso1', { projectId: 'p1', itpId: 'i30', itp2Id: 'i50' })], results: [],
    welds: [row('s', { weldNo: '001', isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa' }), row('f', { weldNo: '016', isoId: 'iso1', typeId: 't2', wpsId: 'w1', welder1Id: 'wa' })] };
  const groups = weldDashboard(data, NO_DASHBOARD_FILTERS, null).compliance;
  assert.deepEqual(groups.map(group => [group.itpNumber, group.total]).sort(), [['ITP-30', 1], ['ITP-50', 1]]);
  assert.equal(weldDashboard(data, { ...NO_DASHBOARD_FILTERS, itpId: 'i50' }, null).kpis.totalWelds, 1);
  // The tracer group rule follows the same slot once the weld types are known (server/inspections.ts passes them).
  assert.equal(weldItpCode(data.welds[1], { isometrics: data.isometrics, itps, weldTypes: rows.weldTypes }), 'ITP-50');
  assert.equal(weldItpCode(data.welds[1], { isometrics: data.isometrics, itps }), 'ITP-30');
  assert.equal(isoItpId(row('x', { itpId: '', itp2Id: 'i2' })), 'i2'); assert.equal(isoItpId(undefined), '');
});

test('weld numbers coded GAP, SP, E or B stay out of the KPIs and the compliance (weld-dashboard-reports-004)', () => {
  const base = { isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa' };
  const data: DashboardRows = { ...rows, results: [], welds: ['E01', '09E', '12GAP', '1SP2', 'B01', '001', '005A', '010R1'].map(weldNo => row(`w-${weldNo}`, { ...base, weldNo })) };
  const result = weldDashboard(data, NO_DASHBOARD_FILTERS, null);
  assert.equal(result.kpis.totalWelds, 3);
  assert.equal(result.summary.totalWelds, 3);
});

test('To Date defaults to today and an undated weld stays in scope under a date filter (weld-dashboard-reports-013/-014)', () => {
  assert.deepEqual(defaultDashboardFilters('2026-11-16'), { ...NO_DASHBOARD_FILTERS, to: '2026-11-16' });
  assert.equal(dashboardFilterCount(defaultDashboardFilters('2026-11-16'), defaultDashboardFilters('2026-11-16')), 0);
  assert.equal(dashboardFilterCount({ ...defaultDashboardFilters('2026-11-16'), welderIds: ['wa'] }, defaultDashboardFilters('2026-11-16')), 1);
  assert.equal(dashboardFilterCount(defaultDashboardFilters('2026-11-16')), 1);
  // To = 2026-11-16 keeps every weld: the 15 dated ones and d1 (no date, no welder).
  assert.equal(dash({ to: '2026-11-16' }).kpis.totalWelds, 16);
  // Welded without a date (reference 0003/005, 0001/010R1) is still welded under a date filter.
  const undated: DashboardRows = { ...rows, welds: [...rows.welds, row('u', { weldNo: 'U1', isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa' })] };
  assert.deepEqual([dash({ to: '2026-10-07' }, null, 'welds', undated).kpis.totalWelds, dash({ to: '2026-10-07' }, null, 'welds', undated).kpis.welded], [9, 8]);   // a1..a7 + d1 + u; welded a1..a7 + u
});

test('filters narrow the welds: dates, company, weld type, the four multi-selects, ITP, isometric fields, NDT process (weld-dashboard-reports-015)', () => {
  const count = (filters: Partial<DashboardFilters>) => dash(filters).kpis.totalWelds;
  assert.equal(count({ from: '2026-11-01' }), 4);                 // f1..f3 + d1 (undated)
  assert.equal(count({ to: '2026-10-07' }), 8);                   // a1..a7 + d1
  assert.equal(count({ from: '2026-10-08', to: '2026-10-15' }), 6);   // a8 + c1..c4 + d1
  assert.equal(count({ companyId: 'c2' }), 4);
  assert.equal(count({ location: 'Field' }), 7);                  // t2: f1..f3, c1..c4
  assert.equal(count({ location: 'Shop' }), 9);
  assert.deepEqual([count({ projectIds: ['p2'] }), count({ projectIds: ['p1', 'p2'] }), count({ projectIds: [] })], [4, 16, 16]);
  assert.deepEqual([count({ welderIds: ['wb'] }), count({ welderIds: ['wa', 'wb'] }), count({ welderIds: [] })], [4, 15, 16]);
  assert.equal(count({ itpId: 'i30' }), 9);                       // a1..a8 + d1 (Shop welds of iso1)
  assert.equal(count({ itpId: 'i50' }), 4);                       // the Field welds of iso3 (ITP No 2)
  assert.equal(count({ pipingClass: 'SS300' }), 3);
  assert.equal(count({ irn: 'IRN-1' }), 9);
  assert.equal(count({ ped: 'Cat II' }), 9);
  assert.equal(count({ material: 'A106 Gr B' }), 9);
  assert.deepEqual([count({ wpsIds: ['w2'] }), count({ wpsIds: ['w1', 'w2'] })], [4, 16]);
  assert.equal(count({ ndtProcessId: 'pRT' }), 1);                // a1 (the VI request of a3 is not an NDT process)
  assert.equal(count({ ndtProcessId: 'pUT' }), 1);
  assert.deepEqual([count({ ndtGroupIds: ['g2'] }), count({ ndtGroupIds: ['g1', 'g2'] })], [1, 2]);
  assert.equal(count({ ndtGroupIds: ['g1'], ndtProcessId: 'pUT' }), 0);
  const field = dash({ location: 'Field' });
  // Field: 7 welds on iso2 and iso3 of p1 and p2; examined f1, c1, c2 = 3/7; no repair; groups wa/'' and wb/i50.
  assert.deepEqual([field.kpis.projects, field.kpis.isometrics, field.kpis.examinedPercent, field.kpis.repairRate, field.compliance.length], [2, 2, 42.9, 0, 2]);
  assert.deepEqual(filterSummary({ ...NO_DASHBOARD_FILTERS, from: '2026-11-01', welderIds: ['wa', 'wb'] }, { project: id => id, welder: id => id.toUpperCase(), date: value => value.split('-').reverse().join('.') }),
    [['From Date', '01.11.2026'], ['Project', 'All'], ['Welder', 'WA, WB']]);
});

test('option labels and group wording follow the reference (weld-dashboard-reports-016/-017)', () => {
  assert.equal(welderOptionLabel(row('w', { number: 'ML396', name: 'Aleksandar Djuric' })), 'ML396 | Aleksandar Djuric');
  assert.equal(itpOptionLabel(row('i', { number: '111111', ndtPercent: 14 })), '111111 | 14%');
  assert.equal(itpOptionLabel(row('i', { number: '1', ndtPercent: null })), '1 | 10%');
  assert.equal(ndtProcessLabel(row('p', { name: 'RT', description: 'Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1' })), 'RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1');
  assert.equal(ndtProcessLabel(row('p', { name: 'UT' })), 'UT');
  assert.deepEqual([welderLabel(row('w', { number: 'ML396', name: 'Aleksandar Djuric' })), welderLabel(row('w', { number: 'W01', name: '' })), welderLabel(undefined)], ['ML396 - Aleksandar Djuric', 'W01', 'Unknown welder']);
  const alt: DashboardRows = { ...rows, isometrics: rows.isometrics.map(iso => iso.id === 'iso2' ? { ...iso, itpId: 'i-empty' } as Row : iso) };
  const missing = weldDashboard(alt, NO_DASHBOARD_FILTERS, null).compliance.find(item => item.itpNumber === 'ITP-E');
  // iso2's welds are Field welds: ITP No 1 = i-empty (no scope = Shop+Field) covers them, without an NDT %.
  assert.ok(missing);
  assert.deepEqual([missing!.itpPercent, missing!.usedPercent, missing!.required, missing!.usesFallback, missing!.percentLabel, missing!.issue], [null, 10, 1, true, 'Fallback 10%', 'Central ITP/KNR percentage missing. Using 10% fallback.']);
  const unassigned = dash().compliance.find(item => item.itpId === '')!;
  assert.deepEqual([unassigned.itpNumber, unassigned.issue], ['Unassigned', 'No central ITP/KNR linked for this weld.']);
  const zero: DashboardRows = { ...rows, itps: rows.itps.map(itp => itp.id === 'i30' ? { ...itp, ndtPercent: 0 } as Row : itp) };
  const free = weldDashboard(zero, NO_DASHBOARD_FILTERS, null).compliance.find(item => item.itpId === 'i30')!;
  assert.deepEqual([free.required, free.compliant, free.testedPercent, free.selectedPercent, free.remainingPercent, free.percentLabel], [0, true, 0, 0, 0, '0.0 %']);
  assert.equal(itpNdtPercent(row('x', { ndtPercent: 120 })), null); assert.equal(itpNdtPercent(null), null);
});

test('group filter, search, paging by 50 with the range text (weld-dashboard-reports-018)', () => {
  const groups = dash().compliance;
  assert.equal(filterGroups(groups, 'Not compliant', '').length, 0);
  assert.equal(filterGroups(groups, 'Compliant', '').length, 3);
  assert.equal(filterGroups(groups, 'All groups', '').length, 3);
  assert.deepEqual(filterGroups(groups, 'All groups', ' ROBIN ').map(group => group.welderLabel), ['WB2 - Robin Lane']);
  assert.deepEqual(filterGroups(groups, 'All groups', 'wb2').length, 1);
  assert.deepEqual(filterGroups(groups, 'All groups', 'wps-135').length, 1);
  assert.equal(filterGroups(groups, 'All groups', 'unassigned').length, 1);
  assert.equal(COMPLIANCE_PAGE_SIZE, 50);
  const items = Array.from({ length: 120 }, (_, index) => index);
  assert.deepEqual(pageOf(items, 0).items, items.slice(0, 50));
  assert.deepEqual([pageOf(items, 2).items.length, pageOf(items, 2).pages, pageOf(items, 9).page, pageOf(items, -3).page], [20, 3, 2, 0]);
  assert.deepEqual(pageOf([], 4), { items: [], page: 0, pages: 1 });
  assert.deepEqual([pageRange(3, 0), pageRange(120, 1), pageRange(120, 2), pageRange(0, 0)], ['1–3 of 3', '51–100 of 120', '101–120 of 120', '0–0 of 0']);
});

test('the dashboard reloads every 3 minutes and stops when it closes (weld-dashboard-reports-029)', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let calls = 0;
    const stop = scheduleDashboardRefresh(() => { calls++; });
    mock.timers.tick(DASHBOARD_REFRESH_MS - 1); assert.equal(calls, 0);
    mock.timers.tick(1); assert.equal(calls, 1);
    mock.timers.tick(DASHBOARD_REFRESH_MS); assert.equal(calls, 2);
    stop(); mock.timers.tick(DASHBOARD_REFRESH_MS * 3); assert.equal(calls, 2);
  } finally { mock.timers.reset(); }
  assert.equal(DASHBOARD_REFRESH_MS, 180000);
});

test('ITP/KNR Manager: Usage counts the isometrics linked per definition (weld-dashboard-reports-019)', () => {
  const usage = itpUsage(rows.itps, [...rows.isometrics, row('iso5', { itpId: 'i30', itp2Id: 'i50' }), row('iso6', { itpId: 'i30', _archived: true })]);
  assert.deepEqual([...usage], [['i30', 2], ['i50', 2], ['i-empty', 0]]);
});

// ----- captured rows of the reference sandbox ----------------------------------------------------------------------------
// weld__iso__0005 / weld__ndt-manager__ndt-archive.txt:232-234: 0005 002t (tracer, Accepted), 003 (NA), 004 (Accepted), all WS, ML396,
// WPS 22.028BR; iso 0005 has no ITP. weld__iso__0001.txt: 0001 has ITP No 111111 / ITP No 2 222222 (both 14 %); 003 untyped,
// ML396 + ML670, WPS 11111, RT/MT/PT Accepted; 016 FW, W01 (no name), WPS 11111, no NDT. 0005/333 FW, W01, WPS 11111. 0003 E01: ML396.
const captured: DashboardRows = {
  welders: [row('w28', { number: 'ML396', name: 'Aleksandar Djuric' }), row('w163', { number: 'ML670', name: 'Dimitrije Tunic' }), row('w2', { number: 'W01', name: '' })],
  wps: [row('wps1', { name: '11111' }), row('wps6', { name: '22.028BR' })],
  itps: [row('i111', { number: '111111', ndtPercent: 14, scope: 'Shop' }), row('i222', { number: '222222', ndtPercent: 14, scope: 'Field' })],
  isometrics: [row('i0001', { isoNo: '0001', projectId: 'prj', itpId: 'i111', itp2Id: 'i222', itpNo: '111111', itpNo2: '222222' }), row('i0005', { isoNo: '0005', projectId: 'prj' }), row('i0003', { isoNo: '0003', projectId: 'prj' })],
  projects: [row('prj', { internnumber: '20240101' })],
  weldTypes: [row('ws', { name: 'Shop weld', abbreviation: 'WS', location: 'Shop' }), row('fw', { name: 'Butt Weld - Field', abbreviation: 'FW', location: 'Field' })],
  welds: [
    row('5-002t', { weldNo: '002t', isoId: 'i0005', typeId: 'ws', wpsId: 'wps6', welder1Id: 'w28', tracer: true, date: '2025-01-13' }),
    row('5-003', { weldNo: '003', isoId: 'i0005', typeId: 'ws', wpsId: 'wps6', welder1Id: 'w28', date: '2025-01-05' }),
    row('5-004', { weldNo: '004', isoId: 'i0005', typeId: 'ws', wpsId: 'wps6', welder1Id: 'w28', date: '2025-01-06' }),
    row('5-333', { weldNo: '333', isoId: 'i0005', typeId: 'fw', wpsId: 'wps1', welder1Id: 'w2' }),
    row('1-003', { weldNo: '003', isoId: 'i0001', wpsId: 'wps1', welder1Id: 'w28', welder2Id: 'w163', date: '2024-03-21' }),
    row('1-016', { weldNo: '016', isoId: 'i0001', typeId: 'fw', wpsId: 'wps1', welder1Id: 'w2' }),
    row('3-E01', { weldNo: 'E01', isoId: 'i0003', welder1Id: 'w28' }),
  ],
  results: [
    row('r-002t', { weldId: '5-002t', type: 'NDT', round: 'Initial', result: 'Accepted' }), row('r-003', { weldId: '5-003', type: 'NDT', round: 'Initial', result: 'Rejected' }), row('r-004', { weldId: '5-004', type: 'NDT', round: 'Initial', result: 'Accepted' }),
    ...['Initial', 'Remaining', 'Additional 1'].map(round => row(`r-1-003-${round}`, { weldId: '1-003', type: 'NDT', round, result: 'Accepted' })),
  ],
  ndtProcesses: [], requests: [],
};

test('captured rows: the group cards of the reference come out figure for figure (weld__start__dashboard__compliance-all.txt)', () => {
  const result = weldDashboard(captured, NO_DASHBOARD_FILTERS, row('site', { repairLimit: 5 }));
  const find = (welder: string, wps: string, itp: string) => result.compliance.find(group => group.welderId === welder && group.wpsId === wps && group.itpId === itp)!;
  // ML396 / 22.028BR / Unassigned (:16-27): 003 + 004 (002t is a tracer) -> 2 welds, ceil(2 x 10 %) = 1, examined 2, selected 0, remaining 0.
  const br = find('w28', 'wps6', '');
  assert.deepEqual([br.welderLabel, br.wpsName, br.itpNumber, br.percentLabel, br.issue], ['ML396 - Aleksandar Djuric', '22.028BR', 'Unassigned', 'Fallback 10%', 'No central ITP/KNR linked for this weld.']);
  assert.deepEqual([br.total, br.required, br.examined, br.selected, br.remaining, br.compliant], [2, 1, 2, 0, 0, true]);
  // "Tested 2 / 1  Selected 0 / 1  Remaining 0 / 1": counts uncapped, bars capped (delta-I2b-006).
  assert.deepEqual([br.testedPercent, br.selectedPercent, br.remainingPercent], [100, 0, 0]);
  assert.equal(barPercent(4, 1), 100);   // ML396 / 11111 / 222222 "Selected 4 / 1"
  // Defect block: Welds 2, Examined 2, Exam % 100.0 %, Rejected 1 (003), Reject % 50.0 %, Tracers 0 "Missing 2", Missing "2 of 2 tracer(s) still required.", BAD.
  const d = br.defects;
  assert.deepEqual([d.welds, d.examined, percentLabel(d.examinedPercent), d.rejected, percentLabel(d.rejectedPercent), d.tracerWelds, d.tracerHint, d.tracerStatus.value, d.tracerStatus.hint, d.flag.toUpperCase(), d.flagReason],
    [2, 2, '100.0 %', 1, '50.0 %', 0, 'Missing 2', 'Missing', '2 of 2 tracer(s) still required.', 'BAD', 'Rejected but tracers missing']);
  // W01 / 11111 / 222222 (:68): 0001/016 is a Field weld -> ITP No 2 222222 at 14 %: ceil(0.14) = 1 required, nothing examined -> NOT COMPLIANT, WARN.
  const w01 = find('w2', 'wps1', 'i222');
  assert.deepEqual([w01.welderLabel, w01.itpNumber, w01.percentLabel, w01.issue, w01.total, w01.required, w01.examined, w01.remaining, w01.compliant, w01.defects.flag, w01.defects.flagReason, w01.defects.tracerStatus.value],
    ['W01', '222222', '14.0 %', '', 1, 1, 0, 1, false, 'warn', 'Not examined', 'Not needed']);
  // W01 / 11111 / Unassigned (:69): 0005/333 (iso 0005 has no ITP).
  const w01u = find('w2', 'wps1', '');
  assert.deepEqual([w01u.percentLabel, w01u.total, w01u.required, w01u.remaining, w01u.compliant], ['Fallback 10%', 1, 1, 1, false]);
  // 0001/003 (ML396 + ML670, untyped -> ITP No 1 111111) counts in both welders' groups, each 1 weld, ceil(0.14) = 1, examined 1.
  assert.deepEqual([find('w28', 'wps1', 'i111').total, find('w163', 'wps1', 'i111').total, find('w163', 'wps1', 'i111').compliant], [1, 1, true]);
  // Order: ML396 (111111 total 1, then 22.028BR total 2), ML670, W01 (222222 before Unassigned).
  assert.deepEqual(result.compliance.map(group => `${group.welderLabel}|${group.wpsName}|${group.itpNumber}`),
    ['ML396 - Aleksandar Djuric|11111|111111', 'ML396 - Aleksandar Djuric|22.028BR|Unassigned', 'ML670 - Dimitrije Tunic|11111|111111', 'W01|11111|222222', 'W01|11111|Unassigned']);
  // Summary (weld-dashboard-reports-007): totals over the groups = 2+1+1+1+1 = 6 welds (UNK twice for 0001/003), required 1+1+1+1+1 = 5,
  // examined 2+1+1+0+0 = 4, selected 0, remaining 0+0+0+1+1 = 2, fallback groups 2 (the two Unassigned), 3 of 5 compliant.
  const s = result.summary;
  assert.deepEqual([s.totalWelds, breakdownText(s.weldsByType), s.required, s.examined, s.selected, s.remaining, s.fallbackGroups, s.compliantGroups, s.totalGroups, s.status], [6, 'FW 2, UNK 2, WS 2', 5, 4, 0, 2, 2, 3, 5, 'NOT COMPLIANT']);
  // KPIs: E01 is out -> 6 welds, all welded; examined 0005/003, 0005/004, 0001/003 (002t is a tracer) = 3/6 = 50.0 %.
  assert.deepEqual([result.kpis.totalWelds, result.kpis.welded, result.kpis.examined, result.kpis.examinedPercent, breakdownText(result.kpis.weldsByType)], [6, 6, 3, 50, 'WS 3, FW 2, UNK 1']);
  assert.deepEqual(result.warnings, []);
  // Data quality: an isometric with a free-text ITP number only, and a linked ITP without NDT %.
  const dirty = weldDashboard({ ...captured, isometrics: captured.isometrics.map(iso => iso.id === 'i0005' ? { ...iso, itpNo: 'OLD-1' } as Row : iso), itps: captured.itps.map(itp => itp.id === 'i222' ? { ...itp, ndtPercent: null } as Row : itp) }, NO_DASHBOARD_FILTERS, null);
  assert.deepEqual(dirty.warnings, ['1 isometrics still miss a central ITP/KNR link.', 'Missing central percentage for: 222222.']);
});

test('one welder\'s groups stay together, not-compliant first inside a welder (delta-I2b-007)', () => {
  // Three more untyped ML396 welds without WPS on 0005: required ceil(0.3) = 1, nothing examined -> NOT COMPLIANT, listed first among ML396.
  const more: DashboardRows = { ...captured, welds: [...captured.welds, ...[1, 2, 3].map(i => row(`nw${i}`, { weldNo: `10${i}`, isoId: 'i0005', welder1Id: 'w28' }))] };
  assert.deepEqual(weldDashboard(more, NO_DASHBOARD_FILTERS, null).compliance.map(group => `${group.welderNumber}|${group.wpsName}|${group.compliant ? 'ok' : 'bad'}`),
    ['ML396|No WPS|bad', 'ML396|11111|ok', 'ML396|22.028BR|ok', 'ML670|11111|ok', 'W01|11111|bad', 'W01|11111|bad']);
});

test('Tracer proposal of a group: rejected welds are the sources, examined welds are never candidates (weld-dashboard-reports-006)', () => {
  const context = { requests: captured.requests, isometrics: captured.isometrics, itps: captured.itps, weldTypes: captured.weldTypes };
  // ML396 / 22.028BR / Unassigned: 003 is rejected, 004 is examined, 002t is a tracer -> no candidate, the reference's warning.
  const proposal = groupTracerProposal(captured, { welderId: 'w28', wpsId: 'wps6', itpId: '' }, context)!;
  assert.deepEqual(proposal.group, { welderId: 'w28', welderLabel: 'ML396 - Aleksandar Djuric', wpsId: 'wps6', wpsLabel: '22.028BR', itpId: '', itpLabel: 'Unassigned', ndtPercent: 10 });
  assert.deepEqual([proposal.status.rejectedWelds, proposal.status.expectedTracers, proposal.status.existingTracers, proposal.status.missingTracers, proposal.status.candidateCount, proposal.status.defectFlag], [1, 2, 0, 2, 0, 'bad']);
  assert.deepEqual(proposal.warnings, [NO_TRACER_CANDIDATES]);
  assert.deepEqual(proposal.sources.map(entry => [entry.source.weldNo, entry.source.isoNo, entry.linked, entry.expected, entry.source.statusLabel, entry.source.typeLabel]), [['003', '0005', 0, 2, 'Rejected weld', 'Shop']]);
  // A not-examined weld of the same welder + WPS + ITP is a candidate; one of another ITP/KNR (0001, ITP No 1) is not.
  const open: DashboardRows = { ...captured, welds: [...captured.welds, row('5-005', { weldNo: '005', isoId: 'i0005', typeId: 'ws', wpsId: 'wps6', welder1Id: 'w28' }), row('1-020', { weldNo: '020', isoId: 'i0001', typeId: 'ws', wpsId: 'wps6', welder1Id: 'w28' })] };
  const next = groupTracerProposal(open, { welderId: 'w28', wpsId: 'wps6', itpId: '' }, { ...context, isometrics: open.isometrics })!;
  assert.deepEqual(next.sources[0].candidates.map(item => item.weldNo), ['005']);
  assert.deepEqual([next.status.candidateCount, next.warnings], [1, []]);
  assert.equal(groupTracerProposal(captured, { welderId: 'w28', wpsId: 'nope', itpId: '' }, context), null);
});
// ----- ITP / KNR links ---------------------------------------------------------------------------------------------------

test('ITP links: project scope, duplicate slots, number and revision copied from the register, stored links never block other edits', () => {
  const itps = [row('i1', { number: 'ITP-01', revision: '2' }), row('i2', { number: 'ITP-02', revision: '' }), row('i3', { number: 'ITP-03' }), row('gone', { number: 'ITP-X' })];
  itps[3] = { ...itps[3], _archived: true } as Row;
  const links = [row('l1', { itpId: 'i1', projectId: 'p1' }), row('l2', { itpId: 'i3', projectId: 'p2' })];
  assert.deepEqual(itpsForProject(itps, links, 'p1').map(itp => itp.id), ['i1', 'i2']);     // i3 is limited to p2, the archived entry is gone
  assert.deepEqual(itpsForProject(itps, links, 'p2').map(itp => itp.id), ['i2', 'i3']);
  const ok = isoItpLinks({ projectId: 'p1', itpId: 'i1', itp2Id: 'i2' }, itps, links);
  assert.deepEqual(ok.errors, {}); assert.deepEqual(ok.values, { itpNo: 'ITP-01', itpRevNo: '2', itpNo2: 'ITP-02' });   // i2 has no revision: the slot keeps its own
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p1', itpId: 'i3' }, itps, links).errors), ['itpId']);
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p1', itpId: 'i1', itp2Id: 'i1' }, itps, links).errors), ['itp2Id']);
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p1', itpId: 'gone' }, itps, links).errors), ['itpId']);
  assert.deepEqual(isoItpLinks({ projectId: 'p1', itpId: '', itp2Id: '' }, itps, links), { errors: {}, values: {} });
  // A link that is already stored (and a project that did not change) is not judged again.
  const stored = row('iso', { projectId: 'p1', itpId: 'i3' });
  assert.deepEqual(isoItpLinks({ projectId: 'p1', itpId: 'i3' }, itps, links, stored).errors, {});
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p2', itpId: 'i3', itp2Id: 'i3' }, itps, links, stored).errors), ['itp2Id']);
  assert.equal(isoItpId(row('x', { itpId: '', itp2Id: 'i2' })), 'i2'); assert.equal(isoItpId(row('x', { itpId: 'i1', itp2Id: 'i2' })), 'i1'); assert.equal(isoItpId(undefined), '');
});

test('editing a register entry refreshes the slots linked to it and leaves free text alone', () => {
  const itp = row('i1', { number: 'ITP-01-B', revision: '3' });
  const isos = [row('iso1', { itpId: 'i1', itpNo: 'ITP-01', itpRevNo: '2' }), row('iso2', { itp2Id: 'i1', itpNo2: 'ITP-01-B', itp2RevNo: '3' }), row('iso3', { itpNo: 'ITP-01', itpRevNo: '2' })];
  assert.deepEqual(itpSlotRefresh(itp, isos), [{ id: 'iso1', values: { itpNo: 'ITP-01-B', itpRevNo: '3' } }]);
});

// ----- menu, pilot and permission wiring ----------------------------------------------------------------------------------

test('ITPs sit in Weld Pilot → Welding data, not in MTO Pilot, and belong to the weld pilot only', () => {
  const weld = PILOT_MAP.weld.groups.find(group => group.title === 'Welding data')!.items.map(item => item.label);
  assert.ok(weld.includes('ITPs')); assert.ok(weld.indexOf('ITPs') === weld.indexOf('Isometrics list') + 1);
  assert.ok(!PILOT_MAP.mto.groups.flatMap(group => group.items).some(item => item.resource === 'itps'));
  assert.ok(!PILOT_MAP.weld.groups.flatMap(group => group.items).some(item => item.label === 'ITP templates'));
  assert.deepEqual(pagePilots('/welding/itps'), ['weld']);
  assert.deepEqual(areaPilots('local-itps'), ['weld']);
  assert.ok(RESOURCE_MAP.itps.fields.find(field => field.name === 'number')!.required);
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.resources.itps.includes('projectIds')); assert.ok(hosted.resources.isometrics.includes('itpId') && hosted.resources.isometrics.includes('itp2Id'));
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; assert.equal(Object.hasOwn(other.resources, 'itps'), false, profile); assert.ok(!other.resources.isometrics.includes('itpId'), profile); }
  assert.equal(Object.hasOwn(availabilityFor('full') ?? {}, 'resources'), false);
});

// ----- HTTP: register, linking, access in both directions, pilot boundary ---------------------------------------------------

const PASSWORD = 'Itp-Test-Password';
const RW = 'Read & write', RO = 'Read only', NONE = 'No access';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-itp-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data }: { method?: string; pilot?: string; data?: unknown } = {}) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const account = (name: string, levels: Record<string, string>, extra: Record<string, unknown> = {}) => {
    const profile = store.create('profiles', { name: `${name} profile`, settingsPermission: NONE, toolsPermission: NONE, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, profileId: profile.id, ...extra });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return String(user.email);
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Itp admin', email: 'itp-admin@example.test', password: PASSWORD } })).status, 201);
  return { store, client, admin, account };
}
const body = async <T = Record<string, any>>(response: Response) => await response.json() as T;

test('register: create with project links, unique number, NDT % bounds, access in both directions and the pilot boundary', async t => {
  const f = await fixture(t);
  const created = await f.admin.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-09', description: 'Hydrotest piping', ndtPercent: 15, revision: '1', projectIds: ['project-cooling'] } });
  assert.equal(created.status, 201); const itp = (await body(created)).record as Row;
  assert.deepEqual([itp.number, itp.ndtPercent, itp.revision], ['ITP-09', 15, '1']);
  assert.deepEqual(f.store.list('itp_projects').filter(link => link.itpId === itp.id).map(link => link.projectId), ['project-cooling']);
  for (const bad of [{ number: 'ITP-10', ndtPercent: 101 }, { number: 'ITP-10', ndtPercent: -1 }, { number: '' }]) assert.equal((await f.admin.request('/records/itps', { method: 'POST', pilot: 'weld', data: bad })).status, 422, JSON.stringify(bad));
  assert.ok([409, 422].includes((await f.admin.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-09' } })).status));
  // Weld Pilot: the account with write access works, a reader reads but cannot write, MTO Pilot reads the register (through the Isometrics right, for the ITPs card) but never writes it.
  const writer = f.client(); await writer.login(f.account('Itp writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }));
  const reader = f.client(); await reader.login(f.account('Itp reader', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO }));
  const blind = f.client(); await blind.login(f.account('Itp blind', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE }, { weldEnabled: false, mtoEnabled: true }));
  assert.equal((await writer.request('/records/itps', { pilot: 'weld' })).status, 200);
  assert.equal((await writer.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-11', ndtPercent: 5 } })).status, 201);
  assert.equal((await reader.request('/records/itps', { pilot: 'weld' })).status, 200);
  assert.equal((await reader.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-12' } })).status, 403);
  assert.equal((await reader.request(`/records/itps/${itp.id}`, { method: 'PUT', pilot: 'weld', data: { ndtPercent: 90, _version: itp._version } })).status, 403);
  assert.equal((await writer.request('/records/itps', { pilot: 'mto' })).status, 200);
  assert.equal((await writer.request('/records/itps', { method: 'POST', pilot: 'mto', data: { number: 'ITP-13' } })).status, 403);
  assert.equal((await blind.request('/records/itps', { pilot: 'weld' })).status, 403);
  assert.equal((await blind.request('/records/itps', { pilot: 'mto' })).status, 200, 'read through Isometrics (64)');
  assert.equal((await f.admin.request('/records/itps', { pilot: 'mto' })).status, 200);
  assert.equal((await f.admin.request('/records/itps', { method: 'POST', pilot: 'mto', data: { number: 'ITP-14' } })).status, 403);
  const bootstrap = async (as: ReturnType<typeof f.client>, pilot: string) => (await body<{ rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot }))).rows;
  assert.ok((await bootstrap(writer, 'weld')).itps.length >= 5);
  assert.ok((await bootstrap(writer, 'mto')).itps.length >= 5);
  // The register is not delivered to the other release profiles.
  assert.ok(!canResource({ id: 'u', name: 'x', email: 'x', profileId: 'p', availability: availabilityFor('welding-demo'), permissions: { general: 3, materials: 3, welding: 3, tools: 3, settings: 3 } }, 'itps'));
});

test('Link ITP: the picker rules are enforced on the server, number and revision follow the register, unlinking keeps the free text', async t => {
  const f = await fixture(t);
  const put = async (id: string, data: Record<string, unknown>, as = f.admin) => { const iso = f.store.get('isometrics', id); return as.request(`/records/isometrics/${id}`, { method: 'PUT', pilot: 'weld', data: { ...data, _version: iso._version } }); };
  // iso-7 (project-steam... skid/steam isometrics keep their free text) -> link ITP-02 (limited to project-steam, revision 1).
  const iso7 = f.store.get('isometrics', 'iso-7'); const project = String(iso7.projectId);
  const itp03 = f.store.get('itps', 'itp-03');
  assert.equal(project, 'project-skid'); assert.equal(iso7.itpNo, 'ITP-03');
  assert.equal((await put('iso-7', { itpId: 'itp-02' })).status, 422);                     // ITP-02 is linked to project-steam only
  assert.equal((await put('iso-7', { itpId: 'does-not-exist' })).status, 422);
  const linked = await put('iso-7', { itpId: 'itp-03' }); assert.equal(linked.status, 200);
  const iso = (await body(linked)).record as Row; assert.deepEqual([iso.itpId, iso.itpNo, iso.itpRevNo], ['itp-03', 'ITP-03', itp03.revision]);
  assert.equal((await put('iso-7', { itp2Id: 'itp-03' })).status, 422);                    // the two slots cannot share an entry
  const open = await put('iso-7', { itp2Id: 'itp-ndt-01' }); assert.equal(open.status, 200);   // no project link: open to every project
  const both = (await body(open)).record as Row; assert.deepEqual([both.itpNo2, both.itpId], ['ITP-NDT-01', 'itp-03']);
  // An unrelated edit never trips over the stored links.
  assert.equal((await put('iso-7', { description: 'Skid line' })).status, 200);
  // Editing the entry refreshes the slot; archiving it is refused while it is linked.
  const entry = f.store.get('itps', 'itp-03');
  assert.equal((await f.admin.request('/records/itps/itp-03', { method: 'PUT', pilot: 'weld', data: { number: 'ITP-03-A', revision: '4', _version: entry._version } })).status, 200);
  const refreshed = f.store.get('isometrics', 'iso-7'); assert.deepEqual([refreshed.itpNo, refreshed.itpRevNo], ['ITP-03-A', '4']);
  const archive = await f.admin.request('/records/itps/itp-03/archive', { method: 'POST', pilot: 'weld', data: { _version: f.store.get('itps', 'itp-03')._version } });
  assert.ok([409, 422].includes(archive.status), String(archive.status));
  // Unlink: the link goes, the number and revision stay as free text.
  const unlinked = (await body(await put('iso-7', { itpId: '' }))).record as Row;
  assert.deepEqual([unlinked.itpId, unlinked.itpNo, unlinked.itpRevNo], ['', 'ITP-03-A', '4']);
  // Rights: a reader may not link; MTO Pilot links like Weld Pilot (same rules, same rights).
  const reader = f.client(); await reader.login(f.account('Link reader', { generalPermission: RO, materialsPermission: RW, weldingPermission: RO }));
  assert.equal((await put('iso-7', { itpId: 'itp-03' }, reader)).status, 403);
  const mto = f.client(); await mto.login(f.account('Link mto', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }));
  // iso-1: STX-2403 (iso-7) is switched off for MTO Pilot, which does not deliver it at all (scn-SC-N9).
  const stale = f.store.get('isometrics', 'iso-1');
  const viaMto = await mto.request('/records/isometrics/iso-1', { method: 'PUT', pilot: 'mto', data: { itpId: 'itp-03', _version: stale._version } });
  assert.notEqual(viaMto.status, 403, `MTO Pilot may link with the rights (${viaMto.status})`);
});

test('the sample data gives the dashboard figures, weld type abbreviations and tracers', () => {
  const store = new Store(':memory:'); seed(store);
  const list = (key: string) => store.list(key);
  const data: DashboardRows = { welds: list('welds'), isometrics: list('isometrics'), projects: list('projects'), weldTypes: list('weld_types'), welders: list('welders'), wps: list('wps'), itps: list('itps'), ndtProcesses: list('ndt_processes'), requests: list('inspection_requests'), results: list('inspection_results') };
  const result = weldDashboard(data, NO_DASHBOARD_FILTERS, list('sites').find(site => site.id === 'site-north'));
  // 31 welds in the sample, one without a welder (W031); the main project's limit is 4 %; W005 was repaired.
  assert.deepEqual([result.kpis.totalWelds, result.kpis.welded, result.kpis.repaired, result.kpis.repairPerformance.limit], [31, 30, 1, 4]);
  assert.equal(result.kpis.repairRate, 3.3);                                          // 1 / 30
  assert.equal(result.kpis.repairPerformance.scopePercent, 3.2);                      // 1 / 31
  // Abbreviations come from the weld catalog owner (server/weld-catalogs-seed.ts): the Shop / Field code of the reference (WS / FW).
  assert.deepEqual(result.kpis.weldsByType.map(item => item.label).sort(), ['FW', 'WS']);
  assert.equal(result.kpis.weldsByType.reduce((sum, item) => sum + item.count, 0), 31);
  // Every welded, non-tracer weld counts once per welder.
  const tracers = data.welds.filter(weld => isTracerWeld(weld)).length;
  const entries = data.welds.filter(weld => !weld._archived && !isTracerWeld(weld)).reduce((sum, weld) => sum + [1, 2, 3, 4].filter(side => weld[`welder${side}Id`]).length, 0);
  assert.ok(tracers >= 2);
  assert.equal(result.summary.totalWelds, entries);
  assert.equal(result.compliance.reduce((sum, group) => sum + group.total, 0), entries);
  assert.ok(result.compliance.every(group => group.required >= 1));
  assert.ok(result.compliance.some(group => group.defects.flag === 'bad') && result.compliance.some(group => group.defects.flag === 'warn'));
  assert.equal(result.summary.status, result.compliance.every(group => group.compliant) ? 'COMPLIANT' : 'NOT COMPLIANT');
  assert.equal(DEFAULT_NDT_PERCENT, 10);
});

test('HTTP: the dashboard\'s tracer proposal per group and saving it for the group\'s welder (weld-dashboard-reports-006)', async t => {
  const f = await fixture(t);
  // Make weld-20 a rejected weld: its group (welder, WPS, no ITP/KNR) then has weld-16 as a not-examined candidate.
  const source = f.store.get('welds', 'weld-20'), welderId = String(source.welder1Id), wpsId = String(source.wpsId);
  const list = (key: string) => f.store.list(key);
  const before = weldDashboard({ welds: list('welds'), isometrics: list('isometrics'), projects: list('projects'), weldTypes: list('weld_types'), welders: list('welders'), wps: list('wps'), itps: list('itps'), ndtProcesses: list('ndt_processes'), requests: list('inspection_requests'), results: list('inspection_results') }, NO_DASHBOARD_FILTERS, null)
    .compliance.find(group => group.weldIds.includes('weld-20'))!;
  const actor = { id: 'test', name: 'Test' } as never;
  f.store.create('inspection_results', { weldId: 'weld-20', type: 'NDT', round: 'Initial', result: 'Rejected', date: '2026-10-25', reportNo: 'RT-TEST-20' }, actor);
  // A weld of the same group without any NDT request or result (the sample's other group weld already has a request).
  const fresh = f.store.create('welds', { weldNo: 'W900', isoId: source.isoId, typeId: source.typeId, wpsId, welder1Id: welderId, date: '2026-10-24' }, actor);
  before.weldIds.push(fresh.id);
  const query = `/tracer-proposal?group=1&welderId=${welderId}&wpsId=${wpsId}&itpId=${before.itpId}`;
  const response = await f.admin.request(query, { pilot: 'weld' });
  assert.equal(response.status, 200);
  const { proposal } = await body<{ proposal: ReturnType<typeof groupTracerProposal> & object }>(response);
  assert.deepEqual(proposal.sources.map(entry => entry.source.id), ['weld-20']);
  const candidates = proposal.sources[0].candidates.map(item => item.id);
  assert.ok(candidates.length >= 1, 'the other weld of the group is offered');
  assert.ok(proposal.sources[0].candidates.every(item => before.weldIds.includes(item.id)));
  assert.equal((await f.admin.request(query, { pilot: 'mto' })).status, 403, 'not from MTO Pilot');
  assert.equal((await f.admin.request(`/tracer-proposal?group=1&welderId=nobody&wpsId=${wpsId}&itpId=`, { pilot: 'weld' })).status, 404);
  // Saving: the welder must be one of the rejected weld's welders; then the candidate is linked as its tracer.
  const other = f.store.list('welders').find(welder => welder.id !== welderId)!.id;
  assert.equal((await f.admin.request('/actions/tracers', { method: 'POST', pilot: 'weld', data: { assignments: { 'weld-20': [candidates[0]] }, welderId: other } })).status, 422);
  const saved = await f.admin.request('/actions/tracers', { method: 'POST', pilot: 'weld', data: { assignments: { 'weld-20': [candidates[0]] }, welderId } });
  assert.ok([200, 201].includes(saved.status), String(saved.status));
  assert.equal(f.store.get('welds', candidates[0]).tracerOfId, 'weld-20');
  const after = (await body<{ proposal: { sources: { linked: number }[]; status: { existingTracers: number } } }>(await f.admin.request(query, { pilot: 'weld' }))).proposal;
  assert.deepEqual([after.sources[0].linked, after.status.existingTracers], [1, 1]);
});
