import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM, today } from '../server/store.ts';
import { seed, seedInspectionSamples } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { runAction } from '../server/workflows.ts';
import { inspectionRules } from '../server/inspections.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, pageAvailable, type ReleaseProfile } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { canAction } from '../shared/permissions.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { isoBlockers } from '../shared/iso-status.ts';
import {
  ARCHIVE_TITLES, MANAGER_PATH, MANAGER_TABS, cellStatusTitle, heatSections, viCellText, weldArchive, countsForCompliance, inspectionCellState, workspaceCellRows, isTracer, managerColumns, managerRequests, managerWelds, nextRepairNumber, repairChain, repairState,
  resultLabel, roundErrors, roundLabel, storedResult, tracerError, tracerSummary, inspectionFileError,
  naBlockErrors, roundsHaveNa, roundLockedError, autoReweld, notAccepted, repairDue, repairsOf, tracerProposal, tracerDetail, TRACER_DETAIL_TEXTS,
  ARCHIVE_PAGE_SIZES, MANAGER_PAGE_SIZES, MASS_REQUEST_TEXTS, PWHT_DOCUMENT, archiveViewLabel, filterManagerWelds, groupRequests, keepEligible, managerResults, massRequestPlan, monthRange, nextRequestNumber, openProcessIds, requestNumberShown, requestSelectable,
} from '../shared/inspections.ts';
import { MassRequestForm, TracerDetailBody, weldingProcessText } from '../client/inspections.tsx';
import type { Row, User } from '../shared/types.ts';

let sequence = 0;
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: `2026-10-01T00:00:${String(sequence++ % 60).padStart(2, '0')}.${String(sequence).padStart(3, '0')}Z`, _updatedAt: '', ...data } as Row);
const weld = (id: string, data: Record<string, unknown> = {}) => row(id, { weldNo: id.toUpperCase(), isoId: 'iso', ...data });
const result = (weldId: string, value: string, date: string, extra: Record<string, unknown> = {}) => row(`${weldId}-${value}-${date}-${sequence}`, { weldId, type: 'NDT', result: value, date, round: 'Initial', ...extra });
const PASSWORD = 'Inspection-Test-Password';

test('results and rounds keep their stored values and read like the reference', () => {
  assert.equal(resultLabel('Rejected'), 'NA'); assert.equal(resultLabel('Accepted'), 'Accepted'); assert.equal(resultLabel(''), '—');
  assert.equal(storedResult('NA'), 'Rejected'); assert.equal(storedResult('Accepted'), 'Accepted'); assert.equal(storedResult('—'), '');
  assert.equal(roundLabel('Additional 1'), 'Additional'); assert.equal(roundLabel('Additional 3'), 'Additional 3');
});

test('a round validates its result and report number; a column without NDT process stays locked', () => {
  assert.deepEqual(roundErrors({ round: 'Initial', result: 'Accepted', reportNo: 'RT-1' }), {});
  assert.ok(roundErrors({ round: 'Initial', result: 'Accepted' }).reportNo);
  assert.ok(roundErrors({ round: 'Initial', filmNo: 'F-1' }).result, 'a film number needs a result');
  assert.ok(roundErrors({ round: 'Additional 4' }).round);
  assert.match(roundLockedError({ round: 'Additional 2', result: 'Accepted', reportNo: 'RT' }), /NDT process of this column/);
  assert.equal(roundLockedError({ round: 'Additional 2', processId: 'ndt-0', result: 'Accepted', reportNo: 'RT' }), '');
  assert.equal(roundLockedError({ round: 'Additional 2' }), '', 'an empty locked column is fine');
  assert.ok(inspectionFileError('NDT document', 'report.png')); assert.equal(inspectionFileError('NDT document', 'report.PDF'), ''); assert.equal(inspectionFileError('Attachment', 'photo.png'), '');
});

test('the NA block (NA length, Defect type, Welder for error, ReWeld?) is one set per weld, entered whenever any round is NA', () => {
  const ndt = (hasNa: boolean, length = 189) => ({ pre: false, hasNa, length, welderIds: ['welder-1', 'welder-2'] });
  // NA on the Remaining round (reference weld 002 had NA on RT, Accepted on MT): NA length and defect type are accepted.
  assert.equal(roundsHaveNa([{ result: 'Accepted' }, { result: 'Rejected' }]), true);
  assert.deepEqual(naBlockErrors({ naLength: '40', defectType: '401', welderForErrorId: 'welder-2', reweld: true }, ndt(true)), {});
  // Defect type on an NA of any round, Additional 3 included.
  assert.equal(roundsHaveNa([{ result: '' }, { result: '' }, { result: '' }, { result: '' }, { result: 'Rejected' }]), true);
  assert.deepEqual(naBlockErrors({ defectType: 'Porosity' }, ndt(true)), {});
  assert.match(naBlockErrors({ defectType: 'Porosity' }, ndt(false)).naLength, /with a result of NA/, 'without NA the block is empty');
  assert.match(naBlockErrors({ reweld: true }, ndt(false)).naLength, /with a result of NA/);
  assert.ok(naBlockErrors({ naLength: '4.5' }, ndt(true)).naLength, 'NA length is digits only (mm)');
  assert.ok(naBlockErrors({ naLength: '200' }, ndt(true)).naLength, 'NA length within the weld length');
  assert.ok(naBlockErrors({ welderForErrorId: 'welder-9' }, ndt(true)).welderForErrorId, 'Welder for error is one of the weld\'s welders');
  // NDT Pre: NA length always disabled, no defect type, welder for error or ReWeld?.
  assert.ok(naBlockErrors({ naLength: '5' }, { pre: true, hasNa: true }).naLength);
  assert.deepEqual(naBlockErrors({}, { pre: true, hasNa: true }), {});
  // ReWeld? is ticked automatically on welds of at most 3 inch.
  const diameters = [row('d-half', { sizeinch: 0.5 }), row('d-ten', { sizeinch: 10 })];
  assert.equal(autoReweld(weld('a', { lengthMode: 'Diameter', diameterId: 'd-half' }), diameters), true);
  assert.equal(autoReweld(weld('b', { lengthMode: 'Diameter', diameterId: 'd-ten' }), diameters), false);
  assert.equal(autoReweld(weld('c', { lengthMode: 'Length in mm', dialen: 50 }), diameters), false);
});

test('a ticked ReWeld? counts as not accepted and expects a repair; a weld added by hand as <no>R1 is the repair', () => {
  const original = weld('o', { weldNo: '002', ndoReq: true });
  const results = [result('o', 'Rejected', '2024-12-27', { requestId: 'q', round: 'Initial', reweld: true }), result('o', 'Accepted', '2024-12-28', { requestId: 'q', round: 'Remaining' })];
  assert.equal(notAccepted(original, results), true, 'Initial NA, Remaining Accepted, ReWeld? ticked');
  assert.equal(repairDue(original, [original], results), true);
  assert.equal(notAccepted(original, results.map(item => ({ ...item, reweld: false }))), false, 'without ReWeld? the accepted Remaining closes it');
  const state = repairState(original, [original], results)!; assert.equal(state.open, true); assert.equal(state.repair, undefined);
  assert.equal(nextRepairNumber(original, [original]), '002R1');
  // The user adds 002R1 with Add weld (no repairOfId): it is linked by number; a later accepted result closes the repair.
  const byHand = weld('r', { weldNo: '002R1' }), elsewhere = weld('x', { weldNo: '002R1', isoId: 'other-iso' });
  assert.deepEqual(repairsOf(original, [original, byHand, elsewhere]).map(w => w.id), ['r']);
  assert.equal(repairDue(original, [original, byHand], results), false);
  assert.equal(repairState(original, [original, byHand], [...results, result('r', 'Accepted', '2025-01-05')])!.open, false);
  const spaced = weld('s', { weldNo: '002 R2' });
  assert.deepEqual(repairChain(original, [original, byHand, spaced]).map(w => w.weldNo), ['002R1', '002 R2'], 'the reference also writes "001_2 R1"');
});

test('the inspection cell shows No, Yes while open, requested, accepted and not accepted, with files and the tracer button', () => {
  const w = weld('w1', { ndoReq: true, welder1Id: 'welder' });
  assert.equal(inspectionCellState(weld('w0'), 'NDT', {}).status, 'not-required');
  assert.equal(inspectionCellState(w, 'VI', {}).required, false, 'VI follows the VT reports, not the welder (weld-inspections-001)');
  assert.equal(inspectionCellState(w, 'NDT', {}).status, 'open');
  const request = row('req', { weldId: 'w1', type: 'NDT', status: 'Open' });
  assert.equal(inspectionCellState(w, 'NDT', { requests: [request] }).status, 'requested');
  const rejected = result('w1', 'Rejected', '2026-10-02', { reportNo: 'RT-9' });
  const state = inspectionCellState(w, 'NDT', { requests: [request], results: [rejected], attachments: [row('a', { entityType: 'inspection_results', entityId: rejected.id }), row('b', { entityType: 'inspection_requests', entityId: 'req', documentType: 'Request document' })] });
  assert.equal(state.status, 'rejected'); assert.equal(state.tracer, false, 'a rejected weld that is no tracer has no T'); assert.equal(state.reportFiles.length, 1); assert.equal(state.requestFiles.length, 1);
  assert.equal(inspectionCellState(w, 'NDT', { results: [rejected, result('w1', 'Accepted', '2026-10-05')] }).status, 'accepted');
  // Pre-HT/PWHT is accepted only when every flagged treatment is.
  const hot = weld('h', { pwhtReqPre: true, pwhtReq: true });
  assert.equal(inspectionCellState(hot, 'PWHT', { results: [result('h', 'Accepted', '2026-10-01', { type: 'PWHT' })] }).status, 'open');
  assert.equal(inspectionCellState(hot, 'PWHT', { results: [result('h', 'Accepted', '2026-10-01', { type: 'PWHT' }), result('h', 'Accepted', '2026-10-01', { type: 'PRE-HT' })] }).status, 'accepted');
  assert.equal(inspectionCellState(w, 'VI', { results: [result('w1', 'Not applicable', '2026-10-01', { type: 'VI' })] }).status, 'not-applicable');
  // The weld table passes the workspace rows, keyed by resource: the cell must still see the results and requests.
  const workspace = { inspection_results: [rejected], inspection_requests: [request], attachments: [], welds: [w] };
  const fromWorkspace = inspectionCellState(w, 'NDT', workspaceCellRows(workspace));
  assert.equal(fromWorkspace.status, 'rejected'); assert.equal(fromWorkspace.tracer, false);
});

test('repair welds are numbered R1, R2 along the chain and the original stays open until a repair is accepted', () => {
  const original = weld('o', { weldNo: '010', ndoReq: true });
  const r1 = weld('r1', { weldNo: '010R1', repairOfId: 'o', repair: true, ndoReq: true });
  assert.equal(nextRepairNumber(original, [original]), '010R1');
  assert.equal(nextRepairNumber(r1, [original, r1]), '010R2');
  assert.equal(nextRepairNumber(original, [original, weld('x', { weldNo: '010R1' })]), '010R2', 'a used number is skipped');
  const r2 = weld('r2', { weldNo: '010R2', repairOfId: 'r1', repair: true, ndoReq: true });
  assert.deepEqual(repairChain(original, [original, r1, r2]).map(w => w.weldNo), ['010R1', '010R2']);
  const rejected = [result('o', 'Rejected', '2026-10-01'), result('r1', 'Rejected', '2026-10-03')];
  const state = repairState(original, [original, r1, r2], rejected)!;
  assert.equal(state.open, true); assert.equal(state.repair!.weldNo, '010R2');
  assert.equal(repairState(r1, [original, r1, r2], rejected), null, 'the repair is named by its original');
  assert.equal(repairState(original, [original, r1, r2], [...rejected, result('r2', 'Accepted', '2026-10-05')])!.open, false);
  const iso = row('iso'); const input = (results: Row[], welds = [original, r1, r2]) => ({ iso, welds, weldTypes: [], diameters: [], results });
  const repair = isoBlockers(input(rejected)).groups.find(group => group.key === 'repair')!;
  assert.deepEqual(repair.items.map(({ target: _target, ...item }) => item), [{ weldId: 'o', message: 'Rejection on weld 010, repair 010R1 is still open' }, { weldId: 'r1', message: 'Rejection on weld 010R1, repair 010R2 is still open' }], 'one item per rejection (reference wording, shared/iso-status.ts)');
  assert.equal(isoBlockers(input([...rejected, result('r2', 'Accepted', '2026-10-05')])).groups.find(group => group.key === 'repair'), undefined);
  // Without a repair weld the item names the next repair number.
  assert.equal(isoBlockers(input([result('o', 'Rejected', '2026-10-01')], [original])).groups.find(group => group.key === 'repair')!.items[0].message, 'Rejection on weld 010, repair 010R1 is still open');
});

test('tracers: two per not-accepted weld, chosen manually, excluded from compliance', () => {
  const source = weld('s', { weldNo: '020' }); const a = weld('a'), b = weld('b'), c = weld('c'), repair = weld('s1', { repairOfId: 's' });
  const welds = [source, a, b, c, repair]; const results = [result('s', 'Rejected', '2026-10-01')];
  assert.equal(tracerError(source, ['a', 'b'], welds, results), '');
  assert.match(tracerError(source, ['a', 'b', 'c'], welds, results), /at most 2/);
  assert.match(tracerError(source, ['s'], welds, results), /itself or one of its repairs/);
  assert.match(tracerError(source, ['s1'], welds, results), /itself or one of its repairs/);
  assert.match(tracerError(a, ['b'], welds, results), /not accepted/);
  assert.match(tracerError(source, ['a'], [source, weld('a', { tracerOfId: 'other' })], results), /another weld/);
  assert.equal(tracerError(a, [], welds, results), '', 'an empty set unlinks');
  const linked = [source, weld('a', { tracer: true, tracerOfId: 's' }), b];
  const summary = tracerSummary(source, linked, results);
  assert.equal(summary.text, '1 linked of 2 required'); assert.equal(summary.needed, true);
  assert.equal(tracerSummary(linked[1], linked, results).source!.id, 's', 'a tracer shows its source weld');
  assert.equal(tracerSummary(b, linked, results).source, undefined, 'no source weld link');
  assert.equal(isTracer(linked[1]), true); assert.equal(countsForCompliance(linked[1]), false); assert.equal(countsForCompliance(b), true);
  // A tracer examined by NDT shows the tracer button in the NDT column only, not in an NDT (Pre) column that does not apply.
  const tracerWeld = weld('t', { tracer: true, tracerOfId: 's', ndoReq: true });
  assert.equal(inspectionCellState(tracerWeld, 'NDT', {}).tracer, true);
  assert.equal(inspectionCellState(tracerWeld, 'NDT PRE', {}).tracer, false);
});

test('NDT/PWHT Manager: welds enter a tab by flag; the PWHT manager also lists accepted welds', () => {
  assert.deepEqual(MANAGER_TABS.map(tab => tab.label), ['NDT Pre', 'NDT', 'NDT archive PRE', 'NDT archive', 'NDT request archive', 'PWHT request manager', 'PWHT archive', 'PWHT request archive']);
  assert.deepEqual(managerColumns(MANAGER_TABS[0]), ['Project', 'ISO', 'Weld no.', 'Type', 'Welder', 'NDT Pre', 'NDT R/Nr.', 'Idx. No.', 'Chg.No.', 'Material ①', 'Ind.No.', 'Chg.No.', 'Material ②', 'Proces', 'WPS']);
  const welds = [weld('p', { ndoReqPre: true }), weld('n', { ndoReq: true }), weld('done', { ndoReq: true }), weld('h', { pwhtReq: true }), weld('hdone', { pwhtReqPre: true }), weld('none')];
  const results = [result('done', 'Accepted', '2026-10-01'), result('hdone', 'Accepted', '2026-10-01', { type: 'PRE-HT' })];
  const ids = (key: string) => managerWelds(MANAGER_TABS.find(tab => tab.key === key)!, welds, results).map(w => w.id);
  assert.deepEqual(ids('ndt-pre'), ['p']); assert.deepEqual(ids('ndt'), ['n']);
  // weld-inspections-030: every weld with Pre-HT or PWHT required, accepted ones too (they show the archived request icon).
  assert.deepEqual(ids('pwht'), ['h', 'hdone']);
  const requests = [row('r1', { type: 'NDT' }), row('r2', { type: 'PWHT' }), row('r3', { type: 'VI' })];
  assert.deepEqual(managerRequests(MANAGER_TABS[4], requests).map(r => r.id), ['r1']); assert.deepEqual(managerRequests(MANAGER_TABS[7], requests).map(r => r.id), ['r2']);
});

test('PWHT request manager columns: no NDT R/Nr., the isometric is named Isometric, the PWHT cell follows the weld table (weld-inspections-030)', () => {
  const pwht = MANAGER_TABS.find(tab => tab.key === 'pwht')!;
  assert.deepEqual(managerColumns(pwht), ['Project', 'Isometric', 'Weld no.', 'Type', 'Welder', 'PWHT', 'Ind.No.', 'Chg.No.', 'Material ①', 'Ind.No.', 'Chg.No.', 'Material ②', 'Proces', 'WPS']);
  assert.ok(!managerColumns(pwht).includes('NDT R/Nr.'));
});

test('Proces is the welding process of the weld, never an NDT process (weld-inspections-028)', () => {
  const processes = [row('wp-141', { name: 'TIG' })];
  assert.equal(weldingProcessText(weld('a', { processId: 'wp-141', ndtProcess1Id: 'ndt-0' }), processes), 'TIG');
  assert.equal(weldingProcessText(weld('b', { ndtProcess1Id: 'ndt-0' }), processes), '-');
});

test('manager page sizes: 10 / 25 / 50 / 100 for the request managers, 10 / 20 / 50 / 100 / 500 for the archives (weld-inspections-026)', () => {
  assert.deepEqual(MANAGER_PAGE_SIZES, [10, 25, 50, 100]); assert.equal(MANAGER_PAGE_SIZES[0], 10);
  assert.deepEqual(ARCHIVE_PAGE_SIZES, [10, 20, 50, 100, 500]);
  const welds = [weld('a', { typeId: 't1', welder2Id: 'w2' }), weld('b', { typeId: 't2' })];
  assert.deepEqual(filterManagerWelds(welds, { weldType: 't1' }, () => 'p1').map(w => w.id), ['a']);
  assert.deepEqual(filterManagerWelds(welds, { welder: 'w2' }, () => 'p1').map(w => w.id), ['a']);
  assert.deepEqual(filterManagerWelds(welds, { project: 'p2' }, () => 'p1'), []);
});

test('request numbers: R + five digits counted on from the highest, a typed number is ignored (weld-inspections-023)', () => {
  assert.equal(nextRequestNumber([]), 'R00001');
  assert.equal(nextRequestNumber([row('a', { number: 'R00029' }), row('b', { number: 'R00007' })]), 'R00030');
  assert.equal(nextRequestNumber([row('a', { number: 'R-2026-0007' }), row('b', { number: 'VT 3' })]), 'R00001', 'older numbers do not take part');
  assert.equal(nextRequestNumber([row('a', { number: 'R00029', _archived: true })]), 'R00030', 'a removed request keeps its number');
  assert.equal(requestNumberShown('R00029'), '00029'); assert.equal(requestNumberShown('R-2026-0001'), 'R-2026-0001');
});

test('archive tabs: one row per examined process result, three views (weld-inspections-031)', () => {
  const ndt = MANAGER_TABS.find(tab => tab.key === 'ndt-archive')!;
  const welds = [weld('w5a', { ndoReq: true, ndtProcess1Id: 'rt', ndtProcess2Id: 'mt', ndtProcess3Id: 'pt' }), weld('w6', { ndoReq: true, ndtProcess1Id: 'rt', ndtProcess2Id: 'mt' }), weld('w7', { ndoReq: true, ndtProcess1Id: 'rt' }), weld('w8', { ndoReq: true })];
  const processes = [row('rt', { name: 'RT' }), row('mt', { name: 'MT' }), row('pt', { name: 'PT' })];
  const requests = [row('r-a', { number: 'R00011', weldId: 'w5a', type: 'NDT', status: 'Accepted', processes: 'RT, MT, PT' }), row('r-b', { number: 'R00012', weldId: 'w6', type: 'NDT', status: 'Open', processes: 'RT, MT' })];
  const results = [['Initial', 'rt'], ['Remaining', 'mt'], ['Additional 1', 'pt']].map(([round, processId]) => result('w5a', 'Accepted', '2026-03-26', { round, processId, requestId: 'r-a', reportNo: `R-${round}` })).concat([result('w6', 'Rejected', '2026-03-27', { round: 'Initial', processId: 'rt', requestId: 'r-b', reportNo: 'RT-6' })]);
  const finished = managerResults(ndt, 'finished', welds, results, requests, processes);
  assert.equal(finished.filter(r => r.weldId === 'w5a').length, 3, 'weld 005A with three accepted processes gives three rows');
  assert.equal(finished.length, 4);
  assert.deepEqual(finished.filter(r => r.weldId === 'w5a').map(r => [r.roundIndex, r.processId]).sort(), [[1, 'rt'], [2, 'mt'], [3, 'pt']]);
  assert.equal(managerWelds(ndt, welds, results, { requests, processes }).length, 4, 'managerWelds on the archive tab returns the same rows');
  // Open NDT results: processes of a request without result (W006's MT); open NDT welds: required processes on no request (W007's RT, W008 without process).
  assert.deepEqual(managerResults(ndt, 'open-results', welds, results, requests, processes).map(r => [r.weldId, r.processId]), [['w6', 'mt']]);
  assert.deepEqual(managerResults(ndt, 'open-welds', welds, results, requests, processes).map(r => [r.weldId, r.processId]), [['w7', 'rt'], ['w8', '']]);
  assert.deepEqual(managerResults(ndt, 'finished', welds, results, requests, processes, { filter: { result: 'Rejected' } }).map(r => r.weldId), ['w6']);
  assert.deepEqual(managerColumns(ndt).slice(0, 18), ['Project', 'ISO No', 'WN', 'Type', 'Welder', 'Dia.(inch)', 'Date', 'NDT process', 'Result', 'Idx 1', 'Chg.No. 1', 'Material 1', 'Idx 2', 'Chg.No. 2', 'Material 2', 'WPS', 'Doc.', 'Rep. No']);
  assert.equal(managerColumns(MANAGER_TABS.find(tab => tab.key === 'pwht-archive')!)[7], 'PWHT process');
  assert.equal(archiveViewLabel(ndt, 'open-results'), 'Open NDT results'); assert.equal(archiveViewLabel(MANAGER_TABS[2], 'finished'), 'Finished NDT Pre');
});

test('request archives: one row per request with the number of welds, filters and the month as default range (weld-inspections-032)', () => {
  const tab = MANAGER_TABS.find(item => item.key === 'ndt-requests')!, pwht = MANAGER_TABS.find(item => item.key === 'pwht-requests')!;
  const requests = [row('l1', { number: 'R00005', weldId: 'a', type: 'NDT', date: '2026-11-03' }), row('l2', { number: 'R00005', weldId: 'b', type: 'NDT', date: '2026-11-03' }), row('l3', { number: 'R00006', weldId: 'a', type: 'NDT PRE', date: '2026-10-30' }), row('l4', { number: 'R00004', weldId: 'c', type: 'NDT', date: '2026-10-02' }), row('l5', { number: 'R00007', weldId: 'a', type: 'PWHT', date: '2026-11-05' })];
  const groups = groupRequests(tab, requests); assert.deepEqual(groups.map(g => [g.shown, g.welds]), [['00005', 2], ['00004', 1]]);
  assert.deepEqual(groupRequests(tab, requests, { pre: true }).map(g => g.number), ['R00006'], 'the NDT select shows NDT Pre');
  assert.deepEqual(monthRange('2026-11-16'), { from: '2026-11-01', to: '2026-11-30' }); assert.deepEqual(monthRange('2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(groupRequests(tab, requests, monthRange('2026-11-16')).map(g => g.number), ['R00005']);
  assert.deepEqual(groupRequests(tab, requests, { project: 'p2' }, id => id === 'c' ? 'p2' : 'p1').map(g => g.number), ['R00004']);
  assert.deepEqual(groupRequests(pwht, requests).map(g => g.number), ['R00007']);
  assert.deepEqual(managerColumns(tab), ['Date', 'Request number', 'Welds', 'Options']);
});

test('the NDT / NDT Pre manager selects only welds with a process on no request; removing a weld from a request frees it (weld-inspections-027, -024)', () => {
  const processes = [row('rt', { name: 'RT' }), row('mt', { name: 'MT' })];
  const w1 = weld('w1', { ndoReq: true, ndtProcess1Id: 'rt', ndtProcess2Id: 'mt' });
  const covering = row('r1', { number: 'R00011', weldId: 'w1', type: 'NDT', status: 'Open', processes: 'RT, MT' });
  assert.equal(requestSelectable(w1, 'NDT', [], [], processes), true);
  assert.equal(requestSelectable(w1, 'NDT', [covering], [], processes), false, 'all processes are on a request');
  assert.equal(requestSelectable(w1, 'NDT', [{ ...covering, processes: 'RT' }], [], processes), true, 'one process is still open');
  assert.equal(requestSelectable(w1, 'NDT', [{ ...covering, _archived: true }], [], processes), true, 'a removed request line frees the weld');
  assert.equal(requestSelectable(weld('w2', { ndoReq: true }), 'NDT', [], [], processes), false, 'a weld without NDT process has nothing to request');
  assert.equal(requestSelectable(weld('w2', { pwhtReq: true }), 'PWHT', [covering], [], processes), true, 'the PWHT manager selects every row');
});

test('mass request dialog: the weld list comes from the table, the messages are the reference ones (weld-inspections-021)', () => {
  const processes = [row('rt', { name: 'RT' }), row('mt', { name: 'MT' })];
  const w1 = weld('w1', { ndoReq: true, ndtProcess1Id: 'rt', ndtProcess2Id: 'mt' }), w2 = weld('w2', { ndoReq: true });
  assert.equal(massRequestPlan('NDT', [], [], [], processes).error, 'Select one or more welds in the table first.');
  assert.equal(massRequestPlan('NDT', [w2], [], [], processes).error, 'None of the selected welds has an open NDT process. Set the NDT location and NDT process on the welds first (Edit weld or Mass edit welds).');
  const full = row('r1', { number: 'R00011', weldId: 'w1', type: 'NDT', status: 'Open', processes: 'RT, MT' });
  assert.equal(massRequestPlan('NDT', [w1], [full], [], processes).error, 'All NDT requests have already been created for the selected welds.');
  const plan = massRequestPlan('NDT', [w1, w2], [{ ...full, processes: 'RT' }], [], processes);
  assert.equal(plan.error, ''); assert.deepEqual(plan.processIds, ['mt'], 'the checklist lists the open processes of the ticked welds'); assert.deepEqual(plan.open, [{ weldId: 'w1', processIds: ['mt'] }]);
  assert.equal(massRequestPlan('PWHT', [weld('h', { pwhtReq: true })], [], [], processes).error, '');
  assert.match(massRequestPlan('PWHT', [weld('h2')], [], [], processes).error, /needs a new/);
  assert.equal(MASS_REQUEST_TEXTS.alert, 'When you generate NDT Request you can not change request data. Please check that you entered correct data!');
});

test('the mass request is made only by the print dialog\'s Go: one button, no weld picker, no location or date', () => {
  const welds = [weld('w1', { ndoReq: true, ndtProcess1Id: 'rt' })];
  const form = (kind: 'NDT' | 'PWHT', plan: ReturnType<typeof massRequestPlan>, processes: { id: string; label: string }[]) => renderToStaticMarkup(createElement(MassRequestForm, { kind, type: kind, onType: () => {}, plan, processes, chosen: [], onChosen: () => {}, note: '', onNote: () => {}, include: false, onInclude: () => {}, error: '', busy: false, onClose: () => {}, onSubmit: () => {} }));
  const html = form('NDT', massRequestPlan('NDT', welds, [], [], [row('rt', { name: 'RT' })]), [{ id: 'rt', label: 'RT' }]);
  assert.match(html, />NDT Request</); assert.match(html, /NDT Process/); assert.match(html, /Include isometric drawing in PDF/); assert.match(html, />Note</);
  assert.match(html, /<button class="btn primary" disabled="">Go<\/button>/, 'Go stays disabled until a process is ticked');
  assert.doesNotMatch(html, /Create request|Request date|NDT location|PWHT location|PWHT process|All welds/);
  const pwht = form('PWHT', massRequestPlan('PWHT', [weld('h', { pwhtReq: true })], [], [], []), []);
  assert.match(pwht, />PWHT request</); assert.match(pwht, /Pre-WHT/); assert.doesNotMatch(pwht, />Note</);
  assert.match(pwht, /<button class="btn primary">Go<\/button>/);
});

test('changing Treatment or Examination keeps the ticked welds that are still offered (scn-SA-D4)', () => {
  assert.deepEqual(keepEligible(['w40', 'w41'], ['w40', 'w41', 'w42']), ['w40', 'w41']);
  assert.deepEqual(keepEligible(['w40', 'w41'], ['w41']), ['w41']);
  assert.deepEqual(keepEligible(['w40'], []), []);
});

test('Upload Pre-HT/PWHT: the reference labels, one PDF, PWHT 100%, no date (weld-inspections-020)', t => {
  const pwht = INSPECTION_ACTIONS.find(action => action.key === 'pwht-upload')!;
  assert.deepEqual(pwht.fields.filter(field => field.name !== 'date' && field.name !== 'weldIds').map(field => field.label), ['Pre-HT Rp/Nr.', 'PWHT Rp/Nr.', 'PWHT 100%']); assert.equal(pwht.submit, 'Upload');
  assert.equal(inspectionFileError(PWHT_DOCUMENT, 'chart.png'), 'Only PDFs are allowed.'); assert.equal(inspectionFileError(PWHT_DOCUMENT, 'chart.PDF'), '');
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  rules.run('pwht-upload', { weldIds: ['weld-2'], reportNo: 'PWHT-DATELESS' });
  assert.equal(store.list('inspection_results').find(r => r.reportNo === 'PWHT-DATELESS')!.date, today(), 'without a date the day of the upload is used');
});

test('undo: a weld or one process leaves its request, the result goes with it, nothing is deleted (weld-inspections-024)', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  for (const id of ['weld-22', 'weld-23']) store.update('welds', id, { ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ndtProcess2Id: 'ndt-1' }, store.get('welds', id)._version, SYSTEM);
  const made = rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'] }).records!;
  const number = String(made[0].number);
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', processId: 'ndt-0', reportNo: 'RT-1', result: 'Accepted' }, { round: 'Remaining', processId: 'ndt-1', reportNo: 'UT-1', result: 'Accepted' }] });
  const results = () => store.list('inspection_results').filter(r => r.weldId === 'weld-22');
  assert.equal(results().length, 2);
  // Restart one process: it leaves the request, its result is removed, the other process keeps its result.
  rules.run('ndt-restart', { weldId: 'weld-22', type: 'NDT', processIds: ['ndt-0'] });
  assert.deepEqual(results().map(r => r.processId), ['ndt-1']);
  const line = store.get('inspection_requests', made[0].id); assert.equal(line.processes, 'UT'); assert.equal(line.processId, 'ndt-1');
  const weld22 = store.get('welds', 'weld-22');
  assert.deepEqual(openProcessIds(weld22, 'NDT', store.list('inspection_requests'), store.list('inspection_results'), store.list('ndt_processes')), ['ndt-0'], 'the restarted process is open again');
  assert.throws(() => rules.run('ndt-restart', { weldId: 'weld-22', type: 'NDT', processIds: ['ndt-0'] }), /not on a request/);
  // Remove the weld from the request: its line is archived (kept), the result is archived, the weld is free for a new request.
  rules.run('inspection-request-undo', { type: 'NDT', requestNo: number, weldId: 'weld-22' });
  assert.equal(store.get('inspection_requests', made[0].id, true)._archived, true); assert.equal(results().length, 0);
  assert.equal(store.list('inspection_results', true).filter(r => r.weldId === 'weld-22').length, 2, 'archived, not deleted');
  assert.equal(store.get('inspection_requests', made[1].id)._archived, false, 'the other weld stays on the request');
  const again = rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22'], processIds: ['ndt-0', 'ndt-1'] }).records!;
  assert.equal(again.length, 1); assert.notEqual(again[0].number, number, 'a removed number is not reused'); assert.match(String(again[0].number), /^R\d{5}$/);
  assert.throws(() => rules.run('inspection-request-undo', { type: 'NDT', requestNo: 'R99999', weldId: 'weld-22' }), /not on that request/);
});

test('NDT dialog preselects what the request names: a mass request names only the weld\'s own processes (scn-SA-N6)', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  store.update('welds', 'weld-22', { ndtProcess1Id: 'ndt-0', ndtProcess3Id: 'ndt-1' }, store.get('welds', 'weld-22')._version, SYSTEM);
  const line = rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22'], processIds: ['ndt-0', 'ndt-1'] }).records![0];
  assert.equal(line.processes, 'RT, UT'); assert.equal(line.processId, 'ndt-0');
  assert.throws(() => rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22'], processIds: ['ndt-3'] }), /not open|All NDT requests/);
});

test('actions: NDT per weld writes rounds and the NA block, creates no repair weld and keeps the request status', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  const before = store.list('welds').length;
  const w = store.get('welds', 'weld-22'); store.update('welds', 'weld-22', { welder2Id: 'welder-4' }, w._version, SYSTEM);
  // NA on the Remaining round: the NA block is accepted there (weld-inspections-007) and stored on the NA result.
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', locationId: 'ndt-shop', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-1', reportNo: 'RT-7001', date: '2026-10-25', result: 'Accepted' }, { round: 'Remaining', processId: 'ndt-1', reportNo: 'UT-7001', date: '2026-10-26', result: 'Rejected' }], naLength: '9', defectType: 'Porosity', welderForErrorId: 'welder-4', reweld: true });
  const w22 = store.get('welds', 'weld-22');
  assert.equal(w22.ndtLocationId, 'ndt-shop'); assert.equal(w22.ndtProcess1Id, 'ndt-0'); assert.equal(w22.ndtProcess2Id, 'ndt-1');
  const request = store.list('inspection_requests').find(r => r.weldId === 'weld-22')!;
  assert.match(String(request.number), /^R\d{5}$/); assert.equal(request.status, 'Rejected');
  const na = store.list('inspection_results').find(r => r.weldId === 'weld-22' && r.round === 'Remaining')!;
  assert.deepEqual([na.naLength, na.defectType, na.welderForErrorId, na.reweld], [9, 'Porosity', 'welder-4', true]);
  assert.equal(store.list('inspection_results').find(r => r.weldId === 'weld-22' && r.round === 'Initial')!.naLength, null, 'the accepted round carries no NA values');
  // An NA result creates no repair weld (weld-inspections-009, scn-SA-N7): the repair is due and named 022R1.
  assert.equal(store.list('welds').length, before); assert.equal(store.list('welds').some(row => row.repairOfId === 'weld-22'), false);
  assert.equal(repairDue(w22, store.list('welds'), store.list('inspection_results')), true); assert.equal(nextRepairNumber(w22, store.list('welds')), 'W022R1');
  rules.run('inspection-upload', { type: 'NDT', weldIds: ['weld-23'], rounds: [{ round: 'Initial', reportNo: 'RT-7002', result: 'Rejected' }], date: '2026-10-27' });
  assert.equal(store.list('welds').length, before, 'nor does an upload with NA');
  // Locks of the dialog: request number never typed, NDT location fixed by the request, a column needs its process.
  // A typed request number is ignored: the number is generated (weld-inspections-023).
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', requestNo: 'R99', locationId: 'ndt-shop', rounds: [] });
  assert.equal(store.get('inspection_requests', request.id).number, request.number);
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', requestNo: request.number, locationId: 'ndt-shop', rounds: [] });
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', locationId: 'ndt-field', rounds: [] }), /location is locked/);
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Additional 2', reportNo: 'RT-X', result: 'Accepted' }] }), /NDT process of this column/);
  // The NA block needs an NA and the weld's own welder.
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', processId: 'ndt-0', reportNo: 'RT-7001', result: 'Accepted' }], defectType: 'Porosity' }), /with a result of NA/);
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', processId: 'ndt-0', reportNo: 'RT-7001', result: 'Rejected' }], welderForErrorId: 'welder-1' }), /one of the welders/);
  // NDT Pre: the Welder is required, no NA block.
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT PRE', rounds: [{ round: 'Initial', processId: 'ndt-3', reportNo: 'MT-1', result: 'Accepted' }] }), /Choose the welder/);
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT PRE', welderId: 'welder-3', rounds: [{ round: 'Initial', processId: 'ndt-3', reportNo: 'MT-1', result: 'Rejected' }], naLength: '4' }), /NDT Pre has no NA length/);
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT PRE', welderId: 'welder-3', rounds: [{ round: 'Initial', processId: 'ndt-3', reportNo: 'MT-1', result: 'Accepted' }] });
  assert.equal(currentPre(store, 'weld-22')?.welderId, 'welder-3');
  // Saving the same round again does not duplicate the result; "—" removes it; a film number without a result is refused.
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-1', reportNo: 'RT-7001', date: '2026-10-25', result: 'Accepted' }] });
  assert.equal(store.list('inspection_results').filter(r => r.weldId === 'weld-22' && r.type === 'NDT').length, 2);
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Additional 1', processId: 'ndt-0', filmNo: 'F-2' }] }), /saved with a result/);
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', result: '' }, { round: 'Remaining', result: '' }] });
  assert.equal(store.list('inspection_results').filter(r => r.weldId === 'weld-22' && r.type === 'NDT').length, 0); assert.equal(store.get('inspection_requests', request.id).status, 'Open');
});
const currentPre = (store: Store, weldId: string) => store.list('inspection_requests').find(r => r.weldId === weldId && r.type === 'NDT PRE');

test('tracers: the server proposes welds of the rejected weld\'s welder / WPS / ITP-KNR group, at most 2, locked once examined', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  // weld-5 (iso-5, ITP-02, welder-2, WPS wps-1) has an NA; W007 is its sample tracer and already has an NDT request.
  const add = (id: string, data: Record<string, unknown>) => store.create('welds', { weldNo: id.toUpperCase(), lengthMode: 'Diameter', diameterId: 'diameter-6', ndoReq: false, ...data }, SYSTEM, id);
  add('g1', { isoId: 'iso-4', welder1Id: 'welder-2', wpsId: 'wps-1', date: '2026-10-06' });
  add('g2', { isoId: 'iso-6', welder2Id: 'welder-2', wpsId: 'wps-1', date: '2026-10-30' });
  add('other-welder', { isoId: 'iso-4', welder1Id: 'welder-3', wpsId: 'wps-1' });
  add('other-wps', { isoId: 'iso-4', welder1Id: 'welder-2', wpsId: 'wps-2' });
  add('other-itp', { isoId: 'iso-1', welder1Id: 'welder-2', wpsId: 'wps-1' });
  add('examined', { isoId: 'iso-4', welder1Id: 'welder-2', wpsId: 'wps-1', ndoReq: true, ndtProcess1Id: 'ndt-0' });
  rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['examined'], processIds: ['ndt-0'] });
  const context = { requests: store.list('inspection_requests'), isometrics: store.list('isometrics'), itps: store.list('itps') };
  const proposal = tracerProposal(store.get('welds', 'weld-5'), store.list('welds'), store.list('inspection_results'), context);
  assert.deepEqual(proposal.group, { welderId: 'welder-2', wpsId: 'wps-1', itpCode: 'ITP-02' });
  const own = proposal.sources.find(entry => entry.source.id === 'weld-5')!;
  assert.deepEqual(own.candidates.map(c => c.id), ['g1', 'g2'], 'only welds of the group without request or result, nearest weld date first');
  assert.deepEqual(own.currentTracers.map(c => [c.id, c.locked]), [['weld-7', true]]);
  assert.equal(own.linked, 1); assert.equal(proposal.status.missingTracers >= 1, true);
  // A third tracer for one source is refused; removing a tracer with a request is refused; a weld outside the group is refused.
  assert.throws(() => rules.run('tracers', { weldId: 'weld-5', tracerIds: ['weld-7', 'g1', 'g2'] }), /at most 2/);
  assert.throws(() => rules.run('tracers', { weldId: 'weld-5', tracerIds: ['g1'] }), /W007 cannot be removed as a tracer/);
  assert.throws(() => rules.run('tracers', { weldId: 'weld-5', tracerIds: ['weld-7', 'other-welder'] }), /not in this welder/);
  assert.throws(() => rules.run('tracers', { weldId: 'weld-5', tracerIds: ['weld-7', 'examined'] }), /not in this welder|already has an NDT request/);
  rules.run('tracers', { assignments: { 'weld-5': ['weld-7', 'g1'] } });
  assert.equal(store.get('welds', 'g1').tracerOfId, 'weld-5'); assert.equal(store.get('welds', 'g1').ndoReq, true);
  // A tracer without request or result can be removed again.
  rules.run('tracers', { weldId: 'weld-5', tracerIds: ['weld-7'] }); assert.equal(store.get('welds', 'g1').tracerOfId, '');
  // "Welder for error" moves the group to that welder.
  assert.equal(tracerProposal(store.get('welds', 'weld-5'), store.list('welds'), store.list('inspection_results'), context, { welderId: 'welder-3' }).group.welderId, 'welder-3');
  // Tracers picked in the NDT dialog while the NA is entered are saved with Save.
  rules.run('ndt-weld', { weldId: 'g2', type: 'NDT', rounds: [{ round: 'Initial', processId: 'ndt-0', reportNo: 'RT-G2', result: 'Rejected' }], tracerIds: ['g1'] });
  assert.equal(store.get('welds', 'g1').tracerOfId, 'g2');
});

test('"Tracer details" is read only: source, linked tracers and their NDT results, Close only', () => {
  const source = weld('s', { weldNo: '010' }), linked = weld('t', { weldNo: '004', tracer: true, tracerOfId: 's' }), loose = weld('l', { weldNo: '012', tracer: true });
  const results = [result('s', 'Rejected', '2026-10-01', { processId: 'rt' }), result('t', 'Accepted', '2026-10-02', { processId: 'mt' })];
  const detail = tracerDetail(linked, [source, linked, loose], results);
  assert.equal(detail.source!.weld.id, 's'); assert.equal(detail.linked, 1); assert.equal(detail.tracers[0].clicked, true);
  assert.deepEqual(detail.tracers[0].results.map(r => r.label), ['Accepted']);
  const place = () => ({ project: '20240101', iso: '0001' });
  const html = renderToStaticMarkup(createElement(TracerDetailBody, { detail, place, processName: (id: string) => id.toUpperCase() }));
  assert.match(html, /Original rejected weld \| Weld: 010/); assert.match(html, /1 linked of 2 required\./); assert.match(html, /Tracer \| Weld: 004/); assert.match(html, /Selected tracer/); assert.match(html, /MT/);
  assert.doesNotMatch(html, /type="checkbox"|<button|<input/, 'no selection in Tracer details');
  const alone = renderToStaticMarkup(createElement(TracerDetailBody, { detail: tracerDetail(loose, [source, linked, loose], results), place, processName: (id: string) => id }));
  assert.match(alone, new RegExp(TRACER_DETAIL_TEXTS.noSource.replace('.', '\\.'))); assert.match(alone, /No NDT results recorded\./);
});

test('NDT dialog: the label column and five rounds fit the wide dialog body without horizontal scrolling', () => {
  const css = readFileSync(new URL('../client/inspections.css', import.meta.url), 'utf8');
  const rule = (selector: string) => { const match = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css); assert.ok(match, selector); return match![2]; };
  const table = rule('.ndt-rounds');
  assert.match(table, /table-layout: fixed/); assert.match(table, /width: 100%/);
  const min = Number(/min-width: (\d+)px/.exec(table)![1]); assert.ok(min <= 804, 'the table may shrink to the 804 px body of .modal.wide at 1440 × 900');
  assert.match(rule('.ndt-rounds input, .ndt-rounds select'), /min-width: 0/, 'controls do not force the columns wider');
  assert.match(rule('.ndt-tracer-candidate > span'), /overflow-wrap: anywhere/, 'tracer weld labels wrap instead of overlapping (scn-SA-D5)');
});

test('actions: mass requests, uploads, Pre-HT/PWHT, visual reports and tracers validate and write their records', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  // The processes come from the welds: a weld without NDT process has nothing to request (reference message).
  assert.throws(() => rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22'], processIds: ['ndt-0'] }), /None of the selected welds has an open NDT process/);
  for (const id of ['weld-22', 'weld-23']) store.update('welds', id, { ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ndtProcess2Id: 'ndt-1' }, store.get('welds', id)._version, SYSTEM);
  assert.throws(() => rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22'], processIds: [] }), /Select at least one NDT process before generating the request/);
  assert.throws(() => rules.run('mass-inspection-request', { type: 'PWHT', weldIds: ['weld-22'] }), /does not require PWHT/);
  // Location, PWHT inputs and the date are not asked: the location is the weld's and the date is the day of generation (weld-inspections-022).
  const made = rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'], note: 'Field closing welds', locationId: 'ndt-field', date: '2026-01-01' }).records!;
  assert.equal(made.length, 2); assert.equal(made[0].number, made[1].number); assert.match(String(made[0].number), /^R\d{5}$/); assert.equal(made[0].processes, 'RT, UT');
  assert.deepEqual(made.map(r => [r.locationId, r.date]), [['ndt-shop', today()], ['ndt-shop', today()]]);
  assert.throws(() => rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0'] }), /All NDT requests have already been created/);
  rules.run('inspection-upload', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], rounds: [{ round: 'Initial', reportNo: 'RT-8001', result: 'Accepted' }], date: '2026-10-26' });
  assert.equal(store.get('inspection_requests', made[0].id).status, 'Accepted', 'the upload records against the open mass request');
  assert.throws(() => rules.run('inspection-upload', { type: 'NDT', weldIds: ['weld-22'], rounds: [{ round: 'Initial', result: 'Accepted' }] }), /report number and a result/);
  assert.throws(() => rules.run('pwht-upload', { weldIds: ['weld-1'], reportNo: 'PWHT-9' }), /does not require PWHT/);
  rules.run('pwht-upload', { weldIds: ['weld-2'], reportNo: 'PWHT-2026-102', checked: true, date: '2026-10-26' });
  const pwht = store.list('inspection_results').find(r => r.reportNo === 'PWHT-2026-102')!; assert.equal(pwht.result, 'Accepted'); assert.equal(pwht.checked, true);
  assert.throws(() => rules.run('visual-inspection', { weldIds: ['weld-1', 'weld-10'], reportNo: 'VT-1', date: '2026-10-26' }), /at least one weld/);
  assert.throws(() => rules.run('visual-inspection', { weldIds: ['weld-1'], accepted: ['weld-1'], notApplicable: ['weld-1'], reportNo: 'VT-1', date: '2026-10-26' }), /one result per weld/);
  assert.throws(() => rules.run('visual-inspection', { weldIds: ['weld-1'], accepted: ['weld-10'], reportNo: 'VT-1', date: '2026-10-26' }), /not in the report/);
  rules.run('visual-inspection', { weldIds: ['weld-1', 'weld-10'], accepted: ['weld-1'], notApplicable: ['weld-10'], itp: 'ITP 2', activityNo: '5.1', engineerId: 'qa-1', customNo: 'C-1', reportNo: 'VT-1', date: '2026-10-26' });
  const vi = store.list('inspection_results').filter(r => r.reportNo === 'VT-1');
  assert.deepEqual(vi.map(r => r.result).sort(), ['Accepted', 'Not applicable']); assert.equal(vi[0].engineerId, 'qa-1'); assert.equal(vi[0].itp, 'ITP 2');
  // Tracers need a not-accepted weld (the group rules are covered by the tracer proposal test).
  assert.throws(() => rules.run('tracers', { weldId: 'weld-1', tracerIds: ['weld-13'] }), /not accepted/);
});

test('an NA from the record action creates no repair weld in any profile; the repair action still makes one where the flow is delivered', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const before = store.list('welds').length;
  const request = (id: string) => (runAction(store, 'inspection-request', { weldIds: [id], type: 'NDT' }, SYSTEM).records!)[0];
  runAction(store, 'inspection-result', { requestId: request('weld-22').id, result: 'Rejected', reportNo: 'RT-A', round: 'Initial' }, SYSTEM);
  runAction(store, 'inspection-result', { requestId: request('weld-23').id, result: 'Rejected', reportNo: 'RT-B', round: 'Initial' }, SYSTEM, { inspectionRules: true });
  assert.equal(store.list('welds').length, before, 'an NA records the result only');
  runAction(store, 'repair', { weldId: 'weld-23', note: 'Cut out and rewelded', date: '2026-10-28' }, SYSTEM, { inspectionRules: true });
  assert.equal(store.list('welds').find(w => w.repairOfId === 'weld-23')?.weldNo, 'W023R1');
});

test('the inspection sample seed builds repairs, tracers, NDT Pre, PWHT and a visual report once', t => {
  const store = new Store(':memory:'); seed(store); seedInspectionSamples(store); seedInspectionSamples(store); t.after(() => store.close());
  const welds = store.list('welds');
  assert.deepEqual(welds.filter(w => w.repairOfId).map(w => w.weldNo).sort(), ['W005R1', 'W011R1']);
  assert.equal(welds.filter(w => w.tracerOfId === 'weld-11').length, 2); assert.equal(welds.filter(w => w.tracerOfId === 'weld-5').length, 2, 'W005 has its two tracers (W013, W007)');
  const iso2 = store.get('isometrics', 'iso-2');
  const status = isoBlockers({ iso: iso2, welds, weldTypes: store.list('weld_types'), diameters: store.list('diameters'), results: store.list('inspection_results') });
  assert.ok(!status.groups.find(group => group.key === 'repair')?.items.some(item => item.weldId === 'weld-11'), 'W011 is closed by its accepted repair');
  assert.equal(store.list('inspection_results').filter(r => r.reportNo === 'VT-2026-014').length, 3);
  assert.equal(store.list('inspection_requests').filter(r => r.type === 'PWHT' && r.status === 'Open').length, 1);
});

test('delivery: hosted profile gets the flow and the Manager page; other profiles are unchanged', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const key of ['ndt-weld', 'tracers', 'mass-inspection-request', 'inspection-upload', 'pwht-upload', 'visual-inspection']) assert.ok(hosted.actions[key], key);
  assert.deepEqual([...hosted.inspectionTypes].sort(), ['NDT', 'NDT PRE', 'PRE-HT', 'PWHT', 'VI']);
  for (const name of ['ndtLocationId', 'ndtPreProcess1Id', 'pwhtProcessId', 'repairOfId', 'tracerOfId', 'tracer']) assert.ok(hosted.resources.welds.includes(name), name);
  for (const name of ['filmNo', 'reweld', 'itp', 'engineerId', 'preReportNo', 'checked']) assert.ok(hosted.resources.inspection_results.includes(name), name);
  assert.ok(pageAvailable(hosted, `/weld${MANAGER_PATH}`, RESOURCES));
  for (const profile of ['welding-demo', 'access-prototype'] as ReleaseProfile[]) {
    const other = availabilityFor(profile)!;
    assert.equal(other.actions['ndt-weld'], undefined, profile); assert.ok(!other.resources.welds.includes('repairOfId'), profile);
    assert.equal(pageAvailable(other, MANAGER_PATH, RESOURCES), false, profile);
  }
  const item = PILOT_MAP.weld.groups.find(group => group.title === 'Welding data')!.items.find(entry => entry.label === 'NDT/PWHT Manager')!;
  assert.equal(item.path, MANAGER_PATH);
});

test('permissions: inspection actions need write access to the matching area and stay inside Weld Pilot', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const user = (welding: number, materials = 0, capabilities?: User['capabilities']): User => ({ id: 'u', name: 'U', email: 'u@example.test', profileId: 'p', availability: hosted, permissions: { general: 2, materials, welding, tools: 0, settings: 0 }, ...(capabilities ? { capabilities } : {}) });
  assert.equal(canAction(user(2), 'ndt-weld', { type: 'NDT' }), true); assert.equal(canAction(user(1), 'ndt-weld', { type: 'NDT' }), false);
  assert.equal(canAction(user(0, 2), 'visual-inspection'), false);
  const matrix = user(0, 0, { '76': ['show', 'insert'] });
  assert.equal(canAction(matrix, 'ndt-weld', { type: 'NDT' }), true); assert.equal(canAction(matrix, 'ndt-weld', { type: 'NDT PRE' }), false);
  assert.equal(canAction(matrix, 'tracers'), false); assert.equal(canAction(user(0, 0, { '63': ['show', 'edit'] }), 'tracers'), true);
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-inspections-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, method = 'GET', pilot?: string, data?: unknown) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { request, login: async (email: string) => assert.equal((await request('/auth/login', 'POST', undefined, { email, password: PASSWORD })).status, 200) };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', 'POST', undefined, { name: 'Inspection admin', email: 'inspection-admin@example.test', password: PASSWORD })).status, 201);
  const account = (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name: `${name} profile`, settingsPermission: 'No access', toolsPermission: 'No access', generalPermission: 'Read & write', ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase()}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return String(user.email);
  };
  return { store, client, admin, account };
}

test('HTTP: an inspector saves NDT per weld in Weld Pilot; a reader, another pilot and other profiles are refused', async t => {
  const f = await hostedFixture(t);
  const inspector = f.client(); await inspector.login(f.account('Inspector', { weldingPermission: 'Read & write', materialsPermission: 'Read & write' }));
  const body = { weldId: 'weld-24', type: 'NDT', locationId: 'ndt-shop', rounds: [{ round: 'Initial', processId: 'ndt-0', reportNo: 'RT-9001', date: '2026-10-28', result: 'Rejected', naLength: 4, defectType: 'Lack of fusion' }] };
  assert.equal((await inspector.request('/actions/ndt-weld', 'POST', 'mto', body)).status, 403, 'MTO Pilot cannot write welding records');
  assert.equal((await inspector.request('/actions/ndt-weld', 'POST', undefined, body)).status, 403, 'a request without a pilot is refused');
  const saved = await inspector.request('/actions/ndt-weld', 'POST', 'weld', body); assert.equal(saved.status, 201);
  const record = (await saved.json()).records[0] as Row; assert.equal(record.defectType, 'Lack of fusion');
  assert.equal(f.store.list('welds').some(w => w.repairOfId === 'weld-24'), false, 'an NA creates no repair weld');
  // Files: NDT documents must be PDF.
  const request = f.store.list('inspection_requests').find(r => r.weldId === 'weld-24')!;
  const upload = (name: string) => { const form = new FormData(); form.set('entityType', 'inspection_requests'); form.set('entityId', request.id); form.set('documentType', 'NDT document'); form.set('file', new Blob(['%PDF-1.4']), name); return inspector.request('/files', 'POST', 'weld', form); };
  assert.equal((await upload('rt-9001.png')).status, 422); assert.equal((await upload('rt-9001.pdf')).status, 201);
  // Unknown inputs and invalid rounds are refused.
  assert.equal((await inspector.request('/actions/ndt-weld', 'POST', 'weld', { ...body, approvedBy: 'me' })).status, 404);
  assert.equal((await inspector.request('/actions/ndt-weld', 'POST', 'weld', { ...body, rounds: [{ round: 'Initial', result: 'Accepted' }] })).status, 422);
  // Tracers: the server proposal lists the group's welds (weld-24: welder-1, WPS wps-2, ITP-02); saving is for an editor only.
  f.store.create('welds', { weldNo: 'W950', isoId: 'iso-6', welder1Id: 'welder-1', wpsId: 'wps-2', lengthMode: 'Diameter', diameterId: 'diameter-6', date: '2026-10-20' }, SYSTEM, 'weld-950');
  const proposal = await inspector.request('/tracer-proposal?weldId=weld-24', 'GET', 'weld'); assert.equal(proposal.status, 200);
  assert.deepEqual((await proposal.json()).proposal.sources[0].candidates.map((c: Row) => c.id), ['weld-950']);
  assert.equal((await inspector.request('/tracer-proposal?weldId=weld-24&welderId=welder-9', 'GET', 'weld')).status, 422, 'Welder for error must be the weld\'s');
  assert.equal((await inspector.request('/tracer-proposal?weldId=weld-24', 'GET', 'mto')).status, 403, 'not from MTO Pilot');
  assert.equal((await inspector.request('/actions/tracers', 'POST', 'weld', { weldId: 'weld-24', tracerIds: ['weld-28'] })).status, 422, 'outside the group');
  assert.equal((await inspector.request('/actions/tracers', 'POST', 'weld', { assignments: { 'weld-24': ['weld-950'] } })).status, 201);
  const reader = f.client(); await reader.login(f.account('Reader', { weldingPermission: 'Read only', materialsPermission: 'Read only' }));
  assert.equal((await reader.request('/records/inspection_results', 'GET', 'weld')).status, 200);
  for (const [key, data] of [['ndt-weld', body], ['tracers', { weldId: 'weld-24', tracerIds: [] }], ['visual-inspection', { weldIds: ['weld-1'], accepted: ['weld-1'], reportNo: 'VT-X', date: '2026-10-28' }], ['mass-inspection-request', { type: 'NDT', weldIds: ['weld-25'], processIds: ['ndt-0'] }], ['pwht-upload', { weldIds: ['weld-2'], reportNo: 'P' }], ['inspection-upload', { type: 'NDT', weldIds: ['weld-25'], rounds: [{ round: 'Initial', reportNo: 'X', result: 'Accepted' }] }]] as const)
    assert.equal((await reader.request(`/actions/${key}`, 'POST', 'weld', data)).status, 403, key);
  assert.equal(f.store.list('inspection_results').filter(r => r.reportNo === 'VT-X').length, 0);
  // The visual report goes through for the inspector.
  assert.equal((await inspector.request('/actions/visual-inspection', 'POST', 'weld', { weldIds: ['weld-1'], accepted: ['weld-1'], reportNo: 'VT-X', date: '2026-10-28', engineerId: 'qa-1', itp: 'ITP 1' })).status, 201);
  // Only the weld given a result is written: weld-10 and weld-19 are listed without a choice and keep what they had.
  f.store.create('inspection_results', { requestId: '', weldId: 'weld-19', type: 'VI', round: 'Initial', result: 'Not applicable', reportNo: 'VT-EARLIER', date: '2026-10-20', note: '' });
  const before = f.store.list('inspection_results').filter(r => r.type === 'VI' && r.weldId === 'weld-19').map(r => ({ id: r.id, result: r.result, reportNo: r.reportNo, version: r._version }));
  const none = await inspector.request('/actions/visual-inspection', 'POST', 'weld', { weldIds: ['weld-1', 'weld-10', 'weld-19'], reportNo: 'VT-Y', date: '2026-10-29' });
  assert.equal(none.status, 422); assert.match((await none.json()).error, /at least one weld/);
  const one = await inspector.request('/actions/visual-inspection', 'POST', 'weld', { weldIds: ['weld-1', 'weld-10', 'weld-19'], notAccepted: ['weld-10'], reportNo: 'VT-Y', date: '2026-10-29' });
  assert.equal(one.status, 201); assert.equal((await one.json()).records.length, 1);
  const vtY = f.store.list('inspection_results').filter(r => r.reportNo === 'VT-Y');
  assert.deepEqual(vtY.map(r => [r.weldId, r.result]), [['weld-10', 'Rejected']], 'exactly one result, for the weld with a choice');
  assert.deepEqual(f.store.list('inspection_results').filter(r => r.type === 'VI' && r.weldId === 'weld-19').map(r => ({ id: r.id, result: r.result, reportNo: r.reportNo, version: r._version })), before, 'the earlier Not applicable on weld-19 is unchanged');
  // The QA/QC engineers the visual report offers are readable inside Weld Pilot.
  assert.equal((await inspector.request('/records/qa_engineers', 'GET', 'weld')).status, 200);
});

// ----- visual (VT) reports: the hub's New, Upload and archive tabs ---------------------------------------------------------------

import {
  VT_DELETE_CONFIRM, VT_DOCUMENT, VT_FILTERS, VT_ITPS, VT_NEW_LABELS, VT_PICKER_COLUMNS, VT_TABS, VT_UPLOAD_COLUMNS, nextVtSeq, vtEligibleWelds, vtGenerateError, vtMarks, vtOpenReports, vtOpenWeldIds, vtUploadReports,
  INSPECTION_ACTIONS,
} from '../shared/inspections.ts';

const vtStore = (t: { after: (fn: () => void) => void }, samples = false) => { const store = new Store(':memory:'); seed(store); if (samples) seedInspectionSamples(store); t.after(() => store.close()); return store; };
const isoWelds = (store: Store, isoId = 'iso-1') => store.list('welds').filter(w => w.isoId === isoId).map(w => w.id);

test('VT hub: three tabs and the reference labels, options and defaults of the New tab', () => {
  assert.deepEqual(Object.values(VT_TABS), ['New', 'Upload', 'Visual reports archive']);
  assert.deepEqual(Object.values(VT_NEW_LABELS), ['Filter', 'ITP', 'Activity No', 'QAQC Engineer', 'Custom Report No (If needed)']);
  assert.deepEqual(VT_FILTERS.map(option => option.label), ['Include all welds', 'Select specific weld(s)']);
  assert.deepEqual(VT_ITPS, ['ITP 1', 'ITP 2'], 'no empty choice, ITP 1 is the first and so the default');
  assert.deepEqual(VT_PICKER_COLUMNS, ['C', 'WN', 'Type', 'Wdr']); assert.deepEqual(VT_UPLOAD_COLUMNS, ['A', 'NA', 'WN', 'Type', 'Wdr']);
  assert.equal(VT_DELETE_CONFIRM, 'Delete selected VT report(s)?');
  const hub = INSPECTION_ACTIONS.find(action => action.key === 'visual-inspection')!;
  for (const name of ['op', 'isoId', 'reportId', 'reportIds', 'mode']) assert.ok(hub.fields.some(field => field.name === name), name);
});

test('VT picker: a weld without a welder is listed; welds on a report or with an earlier visual result are not', t => {
  const store = vtStore(t);
  const ids = isoWelds(store);
  store.update('welds', ids[0], { welder1Id: '', welder2Id: '', welder3Id: '', welder4Id: '' }, store.get('welds', ids[0])._version);
  const eligible = () => vtEligibleWelds(store.list('welds'), store.list('visual_reports'), store.list('inspection_results'), 'iso-1').map(weld => weld.id);
  assert.deepEqual(eligible().sort(), [...ids].sort(), 'every weld of the isometric, welder or not');
  const rules = inspectionRules(store, SYSTEM);
  rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [ids[0]] });
  assert.ok(!eligible().includes(ids[0]), 'on a report: not offered again');
  const request = store.create('inspection_requests', { weldId: ids[1], type: 'VI', status: 'Accepted', date: '2026-10-01' });
  store.create('inspection_results', { requestId: request.id, weldId: ids[1], type: 'VI', round: 'Initial', result: 'Accepted', reportNo: 'VT-OLD', date: '2026-10-01', note: '' });
  assert.ok(!eligible().includes(ids[1]), 'a visual result on an earlier report counts as being on a report');
  assert.deepEqual(eligible().sort(), ids.slice(2).sort());
  assert.match(vtGenerateError([ids[0]], store.list('welds'), store.list('visual_reports'), store.list('inspection_results'), 'iso-1'), /already on a visual report/);
  assert.equal(vtGenerateError([], store.list('welds'), [], [], 'iso-1'), 'Select at least one weld.');
});

test('VT generate: three welds get the next number of the main project and are linked to the report', t => {
  const store = vtStore(t);
  const rules = inspectionRules(store, SYSTEM);
  const ids = isoWelds(store);
  const first = rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(0, 3), activityNo: '4.2', customNo: 'C-9', mode: 'Go (PDF)' }).record!;
  assert.equal(first.number, '00001', 'new numbers are 5 digits'); assert.equal(first.itp, 'ITP 1', 'ITP defaults to ITP 1'); assert.equal(first.mode, 'Go (PDF)'); assert.equal(first.activityNo, '4.2'); assert.equal(first.customNo, 'C-9');
  assert.equal(String(first.weldIds).split(',').length, 3); assert.deepEqual(String(first.weldIds).split(','), ids.slice(0, 3));
  assert.ok(first.siteId, 'the number counts per main project');
  const second = rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [ids[3]], itp: 'ITP 2' }).record!;
  assert.equal(second.number, '00002'); assert.equal(second.itp, 'ITP 2');
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [ids[0], ids[3]] }), /already on a visual report/);
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ['weld-2'] }), /not on this isometric/);
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [] }), /at least one weld/);
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-2', weldIds: [isoWelds(store, 'iso-2')[1]], itp: 'ITP 3' }), /ITP/);
  // The next number comes from the existing maximum of the main project, archived reports included.
  const siteId = String(first.siteId);
  assert.equal(nextVtSeq(store.list('visual_reports', true), siteId), 3);
  assert.equal(nextVtSeq(store.list('visual_reports', true), 'another-site'), 1);
  store.update('visual_reports', second.id, { seq: 345, number: 'VT 345' }, store.get('visual_reports', second.id)._version);
  assert.equal(rules.run('visual-inspection', { op: 'generate', isoId: 'iso-2', weldIds: [isoWelds(store, 'iso-2')[0]] }).record!.number, '00346', 'the sequence continues after an older "VT 345"');
});

test('VT upload: A and NA are saved weld by weld, the PDF closes the report only when every weld is marked', t => {
  const store = vtStore(t);
  const rules = inspectionRules(store, SYSTEM);
  const ids = isoWelds(store).slice(0, 3);
  const report = rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ids }).record!;
  assert.throws(() => rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-30' }), /Tick at least one A or NA to save/);
  assert.throws(() => rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-30', accepted: [ids[0]], notAccepted: [ids[0]] }), /not both/);
  assert.throws(() => rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-30', accepted: ['weld-2'] }), /not on this report/);
  rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-30', accepted: [ids[0]], notAccepted: [ids[1]] });
  const results = () => store.list('inspection_results');
  // Results created in the same millisecond come back in either order, so the marks are compared by weld.
  assert.deepEqual([...vtMarks(report, results())].sort(), [[ids[0], 'Accepted'], [ids[1], 'Rejected']].sort(), 'NA is stored as Rejected');
  assert.deepEqual(vtOpenWeldIds(report, results()), [ids[2]]);
  assert.equal(vtOpenReports(store.list('visual_reports'), results(), 'iso-1').length, 1, 'the report still has an open weld');
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /Each weld must have A \(accepted\) or NA \(not accepted\) before upload\. Missing: W\d+/);
  rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-31', accepted: [ids[2]] });
  assert.equal(results().filter(row => row.type === 'VI' && row.reportNo === '00001').length, 3);
  assert.equal(vtOpenReports(store.list('visual_reports'), results(), 'iso-1').length, 0);
  assert.equal(vtUploadReports(store.list('visual_reports'), 'iso-1').length, 1, 'a fully marked report waits for its PDF');
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /at least one PDF/);
  store.create('attachments', { name: 'scan.png', entityType: 'visual_reports', entityId: report.id, documentType: VT_DOCUMENT, mime: 'image/png', size: 3 });
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /PDF/);
  store.create('attachments', { name: 'vt-1.pdf', entityType: 'visual_reports', entityId: report.id, documentType: VT_DOCUMENT, mime: 'application/pdf', size: 3 });
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /PDF/, 'every file must be a PDF');
});

test('VT reports follow the Visual inspection area 116: deleting needs its Delete right, without the area nothing is read', async t => {
  const f = await hostedFixture(t);
  const detailed = (rules: Record<string, string[]>) => ({ permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: 'No access', materialsPermission: 'No access', weldingPermission: 'No access' });
  const base = { '4': ['show'], '5': ['show'], '64': ['show'], '63': ['show'], '73': ['show'] };
  const noDelete = f.client(); await noDelete.login(f.account('VtNoDelete', detailed({ ...base, '116': ['show', 'insert', 'edit', 'print'] })));
  const withDelete = f.client(); await withDelete.login(f.account('VtWithDelete', detailed({ ...base, '116': ['show', 'insert', 'edit', 'delete', 'print'] })));
  const without = f.client(); await without.login(f.account('VtWithoutArea', detailed({ ...base, '76': ['show', 'insert', 'edit', 'delete', 'print'] })));
  const ids = isoWelds(f.store);
  const made = await noDelete.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(0, 2) });
  assert.equal(made.status, 201, await made.clone().text());
  const report = (await made.json()).record as Row;
  assert.equal((await noDelete.request(`/pdf/visual-report?reportNo=${encodeURIComponent(String(report.number))}`, 'GET', 'weld')).status, 200, 'Print on 116 prints the VT report');
  assert.equal((await noDelete.request('/actions/visual-inspection', 'POST', 'weld', { op: 'delete', reportIds: [report.id] })).status, 403, 'no Delete right on 116');
  assert.equal(f.store.list('visual_reports').length, 1);
  assert.equal((await without.request('/records/visual_reports', 'GET', 'weld')).status, 403, 'NDT rights do not open VT reports');
  assert.equal((await without.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(2, 3) })).status, 403);
  assert.equal((await without.request(`/pdf/visual-report?reportNo=${encodeURIComponent(String(report.number))}`, 'GET', 'weld')).status, 403);
  assert.equal((await withDelete.request('/actions/visual-inspection', 'POST', 'weld', { op: 'delete', reportIds: [report.id] })).status, 201, 'Delete on 116 deletes it');
  assert.equal(f.store.list('visual_reports').length, 0);
});

test('VT archive: deleting a generated report frees its welds and takes its results with it', t => {
  const store = vtStore(t);
  const rules = inspectionRules(store, SYSTEM);
  const ids = isoWelds(store).slice(0, 3);
  const eligible = () => vtEligibleWelds(store.list('welds'), store.list('visual_reports'), store.list('inspection_results'), 'iso-1').map(weld => weld.id);
  const report = rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ids }).record!;
  rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-30', accepted: [ids[0]] });
  assert.ok(!eligible().some(id => ids.includes(id)));
  assert.throws(() => rules.run('visual-inspection', { op: 'delete', reportIds: [] }), /at least one report/);
  rules.run('visual-inspection', { op: 'delete', reportIds: [report.id] });
  assert.deepEqual(store.list('visual_reports'), []); assert.equal(store.list('inspection_results').filter(row => row.type === 'VI').length, 0);
  assert.ok(ids.every(id => eligible().includes(id)), 'the welds are back in the New picker');
  assert.equal(rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ids }).record!.number, '00002', 'a deleted number is not used again');
  assert.throws(() => rules.run('visual-inspection', { op: 'delete', reportIds: ['missing'] }), /could not be found|not found/i);
});

test('VT delivery and access: the hosted profile delivers the report record and the operations; a reader is refused', async t => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.resources.visual_reports.includes('weldIds')); assert.ok(!hosted.navigation.includes('visual_reports'), 'records only, no table page');
  for (const name of ['op', 'reportId', 'reportIds', 'isoId', 'mode']) assert.ok(hosted.actions['visual-inspection'].includes(name), name);
  for (const profile of ['welding-demo', 'access-prototype'] as ReleaseProfile[]) assert.equal(availabilityFor(profile)!.resources.visual_reports, undefined, profile);
  const f = await hostedFixture(t);
  const inspector = f.client(); await inspector.login(f.account('Inspector', { weldingPermission: 'Read & write', materialsPermission: 'Read & write' }));
  const reader = f.client(); await reader.login(f.account('Reader', { weldingPermission: 'Read only', materialsPermission: 'Read only' }));
  const ids = isoWelds(f.store);
  assert.equal((await reader.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids })).status, 403);
  assert.equal((await inspector.request('/actions/visual-inspection', 'POST', 'mto', { op: 'generate', isoId: 'iso-1', weldIds: ids })).status, 403);
  const made = await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(0, 2), itp: 'ITP 2', engineerId: 'qa-1' });
  assert.equal(made.status, 201); assert.equal((await made.json()).record.number, '00001');
  assert.equal((await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(0, 1) })).status, 422, 'a weld cannot go on a second report');
  assert.equal((await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(2, 3), secret: 'x' })).status, 404, 'unknown inputs are refused');
  assert.equal((await reader.request('/records/visual_reports', 'GET', 'weld')).status, 200);
  const listed = (await (await inspector.request('/records/visual_reports', 'GET', 'weld')).json()) as { rows: Row[] };
  assert.equal(listed.rows.length, 1);
  const report = listed.rows[0];
  // The report's PDF lists its welds before any result is marked, and the PDF files are attached to the report.
  const pdf = await inspector.request(`/pdf/visual-report?reportNo=${encodeURIComponent('00001')}`, 'GET', 'weld');
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const form = new FormData(); form.set('entityType', 'visual_reports'); form.set('entityId', report.id); form.set('documentType', VT_DOCUMENT); form.set('file', new Blob(['%PDF-1.4']), 'vt-1.pdf');
  assert.equal((await inspector.request('/files', 'POST', 'weld', form)).status, 201);
  const deleted = await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'delete', reportIds: [report.id] });
  assert.equal(deleted.status, 201); assert.equal(f.store.list('visual_reports').length, 0);
  assert.equal((await reader.request('/actions/visual-inspection', 'POST', 'weld', { op: 'delete', reportIds: [report.id] })).status, 403);
});

test('NDT dialog defect type options show the defect name only, with the reference blank option', async () => {
  const { defectOptionLabel, DEFECT_EMPTY_OPTION } = await import('../shared/inspections.ts');
  assert.equal(defectOptionLabel({ code: '301', english: 'Slag inclusion' }), 'Slag inclusion');
  assert.equal(defectOptionLabel({ code: '999', english: '' }), '999', 'a code without a name shows the code');
  assert.equal(DEFECT_EMPTY_OPTION, '-----------------');
});

test('HTTP: the request archive needs its area (NDT request archive 66) and restart needs the add right (weld-inspections-024, areas 66 / 67)', async t => {
  const f = await hostedFixture(t);
  const NONE = 'No access';
  const detailed = (name: string, rules: Record<string, string[]>) => {
    const profile = f.store.create('profiles', { name: `${name} profile`, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE, toolsPermission: NONE, settingsPermission: NONE });
    const user = f.store.create('users', { name, email: `${name.toLowerCase()}@example.test`, profileId: profile.id, active: true });
    f.store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return String(user.email);
  };
  for (const id of ['weld-22', 'weld-23']) f.store.update('welds', id, { ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ndtProcess2Id: 'ndt-1' }, f.store.get('welds', id)._version, SYSTEM);
  const made = inspectionRules(f.store, SYSTEM).run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'] }).records!;
  const body = { type: 'NDT', requestNo: made[0].number, weldId: 'weld-22' };
  const basics = { '63': ['show', 'insert', 'edit'], '50': ['show', 'print'], '76': ['show', 'insert'] };
  const withArchive = f.client(); await withArchive.login(detailed('Archivist', { ...basics, '66': ['show'], '76': ['show', 'insert', 'delete'] })); // Undo and restart archive NDT results: Delete on 76 (sec2-002, sec2-008).
  const without = f.client(); await without.login(detailed('Plain', basics));
  const noInsert = f.client(); await noInsert.login(detailed('Viewer', { '63': ['show'], '50': ['show'], '66': ['show'], '76': ['show'] }));
  assert.equal((await without.request('/actions/inspection-request-undo', 'POST', 'weld', body)).status, 403, 'without the NDT request archive area');
  assert.equal((await noInsert.request('/actions/ndt-restart', 'POST', 'weld', { weldId: 'weld-22', type: 'NDT', processIds: ['ndt-0'] })).status, 403, 'restart needs the add right of NDT');
  assert.equal((await noInsert.request('/actions/inspection-request-undo', 'POST', 'mto', body)).status, 403, 'not from MTO Pilot');
  assert.equal((await withArchive.request('/actions/ndt-restart', 'POST', 'weld', { weldId: 'weld-22', type: 'NDT', processIds: ['ndt-0'] })).status, 201);
  assert.equal((await withArchive.request('/actions/inspection-request-undo', 'POST', 'weld', body)).status, 201);
  assert.equal(f.store.get('inspection_requests', made[0].id, true)._archived, true);
  // A mass request needs the print right of its area (50), not the archive.
  assert.equal((await without.request('/actions/mass-inspection-request', 'POST', 'weld', { type: 'NDT', weldIds: ['weld-23'], processIds: ['ndt-0'] })).status, 422, 'weld-23 is already on the request: the reference message');
});

// ----- wave 3 integration (E8): Restart NDT process in the weld's NDT dialog ------------------------------------------------
test('E8: the NDT dialog offers Restart NDT process under its documents, not on a locked weld, and the server refuses a restart on a locked weld', async t => {
  const source = readFileSync('client/inspections.tsx', 'utf8');
  const dialog = source.slice(source.indexOf('export function NdtWeldDialog'), source.indexOf('export function NdtRestartBox'));
  assert.match(dialog, /const lock = weldLock\(weld, lockContext\(rows\.weld_types, rows\.releases, rows\.isometrics\)\)/);
  assert.ok(dialog.indexOf('{!lock.locked && <NdtRestartBox weld={weld} type={type}/>}') > dialog.indexOf('<h3>NDT documents</h3>'), 'mounted after the NDT documents');
  assert.match(source, /if \(!canRun\('ndt-restart', \{ type \}\)\) return null;/, 'with the right of the action (the Add right of NDT / NDT Pre)');
  const f = await hostedFixture(t);
  // weld-3 is a shop weld of iso-3, whose Prefab is complete: it is locked, and the sample has it on an NDT request.
  assert.ok(f.store.list('inspection_requests').some(row => row.weldId === 'weld-3' && row.type === 'NDT'));
  const before = f.store.list('inspection_requests').filter(row => row.weldId === 'weld-3').map(row => [row.id, row._version]);
  const refused = await f.admin.request('/actions/ndt-restart', 'POST', 'weld', { weldId: 'weld-3', type: 'NDT', processIds: ['ndt-0'] });
  assert.equal(refused.status, 423);
  assert.deepEqual(f.store.list('inspection_requests').filter(row => row.weldId === 'weld-3').map(row => [row.id, row._version]), before, 'nothing changed');
});

// ----- the inspection cells of the weld table (weld-inspections-001 to -006, weld-iso-welds-005) ---------------------------------------

test('VI cell: "-" until the weld is on a VT report, "---" on one, then A or NA with the report document (weld-inspections-001, weld-iso-welds-005)', () => {
  const welded = weld('w1', { welder1Id: 'welder' }), other = weld('w2');
  const report = row('vt', { number: 'VT 7', seq: 7, weldIds: 'w1,w9' });
  const off = inspectionCellState(welded, 'VI', { reports: [report] });
  assert.equal(inspectionCellState(other, 'VI', { reports: [report] }).required, false);
  assert.equal(viCellText(inspectionCellState(other, 'VI', { reports: [report] })), '-', 'a weld on no report reads "-", with or without a welder');
  assert.equal(viCellText(inspectionCellState(welded, 'VI', {})), '-');
  assert.equal(off.status, 'on-report'); assert.equal(viCellText(off), '---'); assert.equal(off.visual!.reportNo, 'VT 7'); assert.equal(off.visual!.file, undefined);
  const pdf = row('f', { entityType: 'visual_reports', entityId: 'vt', documentType: 'VI document' });
  assert.equal(inspectionCellState(welded, 'VI', { reports: [report], attachments: [pdf] }).visual!.file!.id, 'f', 'the signed upload is what the icon opens');
  const marked = (value: string) => inspectionCellState(welded, 'VI', { reports: [report], results: [result('w1', value, '2026-10-02', { type: 'VI', reportNo: 'VT 7' })] });
  assert.equal(viCellText(marked('Accepted')), 'A'); assert.equal(viCellText(marked('Rejected')), 'NA'); assert.equal(viCellText(marked('Not applicable')), '---');
  assert.equal(marked('Accepted').visual!.reportNo, 'VT 7');
  assert.equal(inspectionCellState(welded, 'VI', { reports: [row('gone', { number: 'VT 8', weldIds: 'w1', _archived: true })] }).required, false, 'an archived report does not count');
});

test('NDT cell: ReWeld has its own state and tooltip; NA, In progress and Accepted keep theirs (weld-inspections-002)', () => {
  const w = weld('w1', { ndoReq: true });
  const na = result('w1', 'Rejected', '2026-10-02', { requestId: 'q' });
  const plain = inspectionCellState(w, 'NDT', { results: [na] });
  assert.equal(plain.status, 'rejected'); assert.equal(cellStatusTitle(plain.status), 'NA');
  const reweld = inspectionCellState(w, 'NDT', { results: [{ ...na, reweld: true }] });
  assert.equal(reweld.status, 'reweld'); assert.equal(cellStatusTitle(reweld.status), 'ReWeld');
  // Reference weld 002: Initial NA, Remaining Accepted, ReWeld? ticked: still ReWeld.
  const later = [{ ...na, reweld: true }, result('w1', 'Accepted', '2026-10-03', { requestId: 'q', round: 'Remaining' })];
  assert.equal(inspectionCellState(w, 'NDT', { results: later }).status, 'reweld');
  assert.equal(inspectionCellState(w, 'NDT', { results: [na, result('w1', 'Accepted', '2026-10-03', { requestId: 'q', round: 'Remaining' })] }).status, 'accepted', 'without ReWeld? the accepted round closes it');
  assert.equal(cellStatusTitle(inspectionCellState(w, 'NDT', { requests: [row('req', { weldId: 'w1', type: 'NDT', status: 'Open' })] }).status), 'In progress');
  assert.equal(cellStatusTitle('accepted'), 'Accepted');
});

test('the T button is offered only on tracer welds (weld-inspections-005)', () => {
  // Iso 0001 of the reference: NA on 002, 005 and 010, tracer flag on 004 and 010; T on exactly the tracers.
  const welds = [weld('002', { ndoReq: true }), weld('004', { ndoReq: true, tracer: true }), weld('005', { ndoReq: true }), weld('010', { ndoReq: true, tracer: true }), weld('011', { ndoReq: true, tracerOfId: '002' })];
  const results = ['002', '005', '010'].map(id => result(id, 'Rejected', '2026-10-02'));
  assert.deepEqual(welds.filter(item => inspectionCellState(item, 'NDT', { results }).tracer).map(item => item.id), ['004', '010', '011']);
  assert.equal(inspectionCellState(welds[0], 'NDT', { results }).tracer, false, 'a rejected weld that is no tracer has no T');
});

test('the Generate & Print icon: a weld that needs a request and still has an NDT process on none (weld-inspections-004)', () => {
  const processes = [row('p1', { name: 'RT' }), row('p2', { name: 'UT' })];
  const w = weld('w1', { ndoReq: true, ndtProcess1Id: 'p1' });
  const printable = (target: Row, kind: 'NDT' | 'NDT PRE' | 'PWHT', requests: Row[] = []) => inspectionCellState(target, kind, { requests, processes }).printable;
  assert.equal(printable(w, 'NDT'), true);
  assert.equal(printable(weld('w0', { ndtProcess1Id: 'p1' }), 'NDT'), false, 'a weld that does not need NDT');
  assert.equal(printable(weld('w5', { ndoReq: true }), 'NDT'), false, 'no NDT process to request');
  const request = row('r1', { weldId: 'w1', type: 'NDT', number: 'R00001', processes: 'RT', processId: 'p1', status: 'Open', date: '2026-10-01' });
  assert.equal(printable(w, 'NDT', [request]), false, 'every process is on a request');
  assert.equal(printable({ ...w, ndtProcess2Id: 'p2' } as Row, 'NDT', [request]), true, 'a new process leaves an Additional request open');
  assert.equal(printable(w, 'NDT PRE'), false, 'NDT Pre has its own requirement');
  const hot = weld('h', { pwhtReq: true });
  assert.equal(printable(hot, 'PWHT'), true);
  assert.equal(printable(hot, 'PWHT', [row('hr', { weldId: 'h', type: 'PWHT', number: 'R00002', status: 'Open' })]), false);
  assert.equal(printable(hot, 'PWHT', [row('hc', { weldId: 'h', type: 'PWHT', number: 'R00002', status: 'Cancelled' })]), true, 'a cancelled request frees the weld');
});

test('the per-weld archive lists one row per request, newest first, with the request PDF names; PWHT has no Details (weld-inspections-003)', () => {
  const w = weld('w1', { ndoReqPre: true, pwhtReq: true });
  const requests = [
    row('a', { weldId: 'w1', type: 'NDT PRE', number: 'R00001', date: '2026-03-01', status: 'Accepted', _createdAt: '2026-03-01T10:00:00.000Z' }),
    row('b', { weldId: 'w1', type: 'NDT PRE', number: 'R00002', date: '2026-03-21', status: 'Open', _createdAt: '2026-03-21T14:33:00.000Z' }),
    row('c', { weldId: 'w1', type: 'NDT PRE', number: 'R00002', date: '2026-03-21', status: 'Open', _createdAt: '2026-03-21T14:33:01.000Z' }),
    row('d', { weldId: 'w1', type: 'NDT PRE', number: 'R00003', date: '2026-03-22', status: 'Cancelled' }),
    row('e', { weldId: 'w1', type: 'NDT', number: 'R00004', date: '2026-03-23', status: 'Open' }),
    row('f', { weldId: 'w1', type: 'PWHT', number: 'R00005', date: '2024-10-11', status: 'Accepted', _createdAt: 'not a date' }),
  ];
  const pre = weldArchive(w, 'NDT PRE', { requests });
  assert.deepEqual(pre.map(item => item.shown), ['00002', '00001'], 'two requests, newest first, the cancelled one and the NDT one left out');
  assert.deepEqual(pre.map(item => item.document), ['20260321_R00002-NDT-RequestPre.pdf', '20260301_R00001-NDT-RequestPre.pdf']);
  assert.match(pre[0].date, /^\d{2}\.\d{2}\.\d{4}\. \d{2}:\d{2}$/, 'dd.mm.yyyy. hh:mm');
  assert.deepEqual(weldArchive(w, 'NDT', { requests }).map(item => item.document), ['20260323_R00004-NDT-Request.pdf']);
  const heat = weldArchive(w, 'PWHT', { requests });
  assert.deepEqual(heat.map(item => [item.document, item.date]), [['20241011_R00005-PWHT-Request.pdf', '11.10.2024.']]);
  const stored = row('doc', { entityType: 'inspection_requests', entityId: 'b', documentType: 'Request document' });
  assert.equal(weldArchive(w, 'NDT PRE', { requests, attachments: [stored] })[0].file!.id, 'doc');
  assert.deepEqual(weldArchive(w, 'VI', { requests }), []);
  assert.deepEqual([ARCHIVE_TITLES.NDT, ARCHIVE_TITLES['NDT PRE'], ARCHIVE_TITLES.PWHT], ['NDT archive', 'NDT Pre archive', 'PWHT archive']);
  assert.equal(inspectionCellState(w, 'NDT PRE', { requests }).archive.length, 2, 'the cell state carries the archive: its icon appears once the weld is on a request');
  assert.equal(inspectionCellState(weld('w9', { ndoReqPre: true }), 'NDT PRE', { requests }).archive.length, 0);
});

test('PWHT request dialog: sections follow what the weld requires, Save writes the weld, the result and the request (weld-inspections-006)', t => {
  assert.deepEqual(heatSections(weld('a', { pwhtReq: true })).map(item => item.label), ['PWHT']);
  assert.deepEqual(heatSections(weld('a', { pwhtReqPre: true, pwhtReq: true })).map(item => [item.label, item.hundred]), [['Pre-HT', false], ['PWHT', true]]);
  assert.deepEqual(heatSections(weld('a', {})), []);
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  const target = store.list('welds').find(item => item.pwhtReq === true)!; const id = target.id;
  assert.ok(INSPECTION_ACTIONS.find(action => action.key === 'pwht-weld'));
  const section = { type: 'PWHT', locationId: 'pwht-site', processId: 'pwht-2', reportNo: 'PWHT-SAVE-1', date: '2026-10-20', checked: true };
  const saved = rules.run('pwht-weld', { weldId: id, sections: [section] }).records!;
  assert.equal(saved.length, 1);
  const after = store.get('welds', id);
  assert.equal(after.pwhtLocationId, 'pwht-site'); assert.equal(after.pwhtProcessId, 'pwht-2');
  const stored = store.list('inspection_results').find(item => item.reportNo === 'PWHT-SAVE-1')!;
  assert.deepEqual([stored.type, stored.result, stored.date, stored.checked, stored.weldId], ['PWHT', 'Accepted', '2026-10-20', true, id]);
  assert.equal(store.get('inspection_requests', String(stored.requestId)).status, 'Accepted');
  // Saving again edits the same result (the request is kept) and can clear location and process.
  rules.run('pwht-weld', { weldId: id, sections: [{ ...section, locationId: '', processId: '', reportNo: 'PWHT-SAVE-2', checked: false }] });
  assert.equal(store.list('inspection_results').filter(item => item.weldId === id && item.type === 'PWHT' && item.requestId === stored.requestId).length, 1);
  assert.equal(store.get('inspection_results', stored.id).reportNo, 'PWHT-SAVE-2'); assert.equal(store.get('inspection_results', stored.id).checked, false);
  assert.equal(store.get('welds', id).pwhtLocationId, '');
  // The request chosen must be one of this weld's of that treatment; a date needs its Rp/Nr.; a treatment the weld does not need is refused.
  const foreign = store.list('inspection_requests').find(item => item.weldId !== id && item.type === 'PWHT');
  if (foreign) assert.throws(() => rules.run('pwht-weld', { weldId: id, sections: [{ ...section, requestId: foreign.id }] }), /not a request of this weld/);
  assert.throws(() => rules.run('pwht-weld', { weldId: id, sections: [{ type: 'PWHT', reportNo: '', date: '2026-10-20' }] }), /Enter the PWHT Rp\/Nr/);
  assert.throws(() => rules.run('pwht-weld', { weldId: id, sections: [{ type: 'PRE-HT', reportNo: 'X' }] }), /does not require Pre-HT/);
  assert.throws(() => rules.run('pwht-weld', { weldId: id, sections: [{ ...section, locationId: 'missing' }] }));
  assert.throws(() => rules.run('pwht-weld', { weldId: id, sections: [] }), /Enter the heat treatment/);
  // A document ticked for deletion is archived, never deleted; only this weld's heat treatment documents qualify.
  const file = store.create('attachments', { name: 'chart.pdf', entityType: 'inspection_results', entityId: stored.id, documentType: PWHT_DOCUMENT, mime: 'application/pdf', size: 12, note: '' }, SYSTEM);
  const other = store.create('attachments', { name: 'other.pdf', entityType: 'inspection_results', entityId: 'nothing', documentType: PWHT_DOCUMENT, mime: 'application/pdf', size: 12, note: '' }, SYSTEM);
  assert.throws(() => rules.run('pwht-weld', { weldId: id, sections: [section], deleteFileIds: [other.id] }), /does not belong/);
  rules.run('pwht-weld', { weldId: id, sections: [section], deleteFileIds: [file.id] });
  assert.equal(store.get('attachments', file.id, true)._archived, true);
  assert.equal(store.list('attachments').some(item => item.id === file.id), false);
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.actions['pwht-weld'], 'the hosted profile delivers the action');
});

test('SA2 N4, N6, N7: the mass request dialog says where to set the process, the PWHT warning names PWHT, the toast number reads as the archive', async () => {
  const I = await import('../shared/inspections.ts');
  // N4: no weld has an NDT process yet: the message says what to do.
  assert.match(I.massRequestPlan('NDT', [{ id: 'w', _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ndoReq: true } as Row], [], [], []).error, /Set the NDT location and NDT process on the welds first/);
  // N7: the PWHT dialog has the reference PWHT sentence; NDT and NDT-Pre keep theirs.
  assert.equal(I.massRequestAlert('PWHT'), 'When you generate PWHT Request you can not change request data. Please check that you entered correct data!');
  assert.equal(I.massRequestAlert('NDT'), I.MASS_REQUEST_TEXTS.alert); assert.equal(I.massRequestAlert('NDT PRE'), I.MASS_REQUEST_TEXTS.alert);
  // N6: the request archive (reference pwht-request-archive: "00007") and the toast show one number.
  assert.equal(I.requestCreatedText('R00001', 3), 'Request 00001 created for 3 welds.');
  assert.equal(I.requestCreatedText('R00005', 1), 'Request 00005 created for 1 weld.');
  assert.equal(I.requestNumberShown('R00001'), '00001');
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../client/pdf-documents.tsx', import.meta.url), 'utf8'), /subtitle=\{`Request \$\{requestNumberShown\(number\)\}`\}/, 'the Request PDF dialog of the archive shows the same number');
  const dialog = readFileSync(new URL('../client/inspections.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /made = requestCreatedText\(number, saved\.records\.length\)/); assert.match(dialog, /\{massRequestAlert\(kind\)\}/);
});
