import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
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
  MANAGER_PATH, MANAGER_TABS, countsForCompliance, inspectionCellState, workspaceCellRows, isTracer, managerColumns, managerRequests, managerWelds, nextRepairNumber, repairChain, repairState,
  resultLabel, roundErrors, roundLabel, storedResult, tracerError, tracerSummary, requestNumberError, inspectionFileError,
} from '../shared/inspections.ts';
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

test('a round validates its result, report number, NA length, defect type and ReWeld?', () => {
  assert.deepEqual(roundErrors({ round: 'Initial', result: 'Accepted', reportNo: 'RT-1' }), {});
  assert.ok(roundErrors({ round: 'Initial', result: 'Accepted' }).reportNo);
  assert.ok(roundErrors({ round: 'Initial', filmNo: 'F-1' }).result, 'a film number needs a result');
  assert.ok(roundErrors({ round: 'Initial', result: 'Accepted', reportNo: 'RT', naLength: 5 }).naLength, 'NA length only with NA');
  assert.ok(roundErrors({ round: 'Remaining', result: 'Rejected', reportNo: 'RT', defectType: 'Porosity' }).naLength, 'defect type only on Initial');
  assert.deepEqual(roundErrors({ round: 'Initial', result: 'Rejected', reportNo: 'RT', naLength: 20, defectType: 'Porosity' }, 189.3), {});
  assert.ok(roundErrors({ round: 'Initial', result: 'Rejected', reportNo: 'RT', naLength: 200 }, 189.3).naLength);
  assert.ok(roundErrors({ round: 'Initial', reweld: true }).reweld); assert.deepEqual(roundErrors({ round: 'Remaining', reweld: true }), {});
  assert.ok(roundErrors({ round: 'Additional 4' }).round);
  assert.equal(requestNumberError(''), ''); assert.equal(requestNumberError('R-1042'), ''); assert.ok(requestNumberError('1042'));
  assert.ok(inspectionFileError('NDT document', 'report.png')); assert.equal(inspectionFileError('NDT document', 'report.PDF'), ''); assert.equal(inspectionFileError('Attachment', 'photo.png'), '');
});

test('the inspection cell shows No, Yes while open, requested, accepted and not accepted, with files and the tracer button', () => {
  const w = weld('w1', { ndoReq: true, welder1Id: 'welder' });
  assert.equal(inspectionCellState(weld('w0'), 'NDT', {}).status, 'not-required');
  assert.equal(inspectionCellState(weld('w0'), 'VI', {}).required, false, 'VI applies once welded');
  assert.equal(inspectionCellState(w, 'VI', {}).required, true);
  assert.equal(inspectionCellState(w, 'NDT', {}).status, 'open');
  const request = row('req', { weldId: 'w1', type: 'NDT', status: 'Open' });
  assert.equal(inspectionCellState(w, 'NDT', { requests: [request] }).status, 'requested');
  const rejected = result('w1', 'Rejected', '2026-10-02', { reportNo: 'RT-9' });
  const state = inspectionCellState(w, 'NDT', { requests: [request], results: [rejected], attachments: [row('a', { entityType: 'inspection_results', entityId: rejected.id }), row('b', { entityType: 'inspection_requests', entityId: 'req', documentType: 'Request document' })] });
  assert.equal(state.status, 'rejected'); assert.equal(state.tracer, true); assert.equal(state.reportFiles.length, 1); assert.equal(state.requestFiles.length, 1);
  assert.equal(inspectionCellState(w, 'NDT', { results: [rejected, result('w1', 'Accepted', '2026-10-05')] }).status, 'accepted');
  // Pre-HT/PWHT is accepted only when every flagged treatment is.
  const hot = weld('h', { pwhtReqPre: true, pwhtReq: true });
  assert.equal(inspectionCellState(hot, 'PWHT', { results: [result('h', 'Accepted', '2026-10-01', { type: 'PWHT' })] }).status, 'open');
  assert.equal(inspectionCellState(hot, 'PWHT', { results: [result('h', 'Accepted', '2026-10-01', { type: 'PWHT' }), result('h', 'Accepted', '2026-10-01', { type: 'PRE-HT' })] }).status, 'accepted');
  assert.equal(inspectionCellState(w, 'VI', { results: [result('w1', 'Not applicable', '2026-10-01', { type: 'VI' })] }).status, 'not-applicable');
  // The weld table passes the workspace rows, keyed by resource: the cell must still see the results and requests.
  const workspace = { inspection_results: [rejected], inspection_requests: [request], attachments: [], welds: [w] };
  const fromWorkspace = inspectionCellState(w, 'NDT', workspaceCellRows(workspace));
  assert.equal(fromWorkspace.status, 'rejected'); assert.equal(fromWorkspace.tracer, true);
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
  assert.deepEqual(repair.items, [{ weldId: 'o', message: 'Weld 010 was rejected; repair weld 010R2 has no accepted result yet.' }]);
  assert.equal(isoBlockers(input([...rejected, result('r2', 'Accepted', '2026-10-05')])).groups.find(group => group.key === 'repair'), undefined);
  // Without a repair weld the earlier messages stay.
  assert.equal(isoBlockers(input([result('o', 'Rejected', '2026-10-01')], [original])).groups.find(group => group.key === 'repair')!.items[0].message, 'Weld 010 was rejected; no repair is recorded yet.');
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

test('NDT/PWHT Manager: welds enter a tab by flag and move to the archive once a result is recorded', () => {
  assert.deepEqual(MANAGER_TABS.map(tab => tab.label), ['NDT Pre', 'NDT', 'NDT archive PRE', 'NDT archive', 'NDT request archive', 'PWHT request manager', 'PWHT archive', 'PWHT request archive']);
  assert.deepEqual(managerColumns(MANAGER_TABS[0]), ['Project', 'ISO', 'Weld no.', 'Type', 'Welder', 'NDT Pre', 'NDT R/Nr.', 'Idx. No.', 'Chg.No.', 'Material ①', 'Ind.No.', 'Chg.No.', 'Material ②', 'Proces', 'WPS']);
  const welds = [weld('p', { ndoReqPre: true }), weld('n', { ndoReq: true }), weld('done', { ndoReq: true }), weld('h', { pwhtReq: true }), weld('none')];
  const results = [result('done', 'Accepted', '2026-10-01'), result('p', 'Accepted', '2026-10-01', { type: 'NDT' })];
  const ids = (key: string) => managerWelds(MANAGER_TABS.find(tab => tab.key === key)!, welds, results).map(w => w.id);
  assert.deepEqual(ids('ndt-pre'), ['p']); assert.deepEqual(ids('ndt'), ['n']); assert.deepEqual(ids('ndt-archive'), ['p', 'done']);
  assert.deepEqual(ids('ndt-pre-archive'), []); assert.deepEqual(ids('pwht'), ['h']); assert.deepEqual(ids('pwht-archive'), []);
  const requests = [row('r1', { type: 'NDT' }), row('r2', { type: 'PWHT' }), row('r3', { type: 'VI' })];
  assert.deepEqual(managerRequests(MANAGER_TABS[4], requests).map(r => r.id), ['r1']); assert.deepEqual(managerRequests(MANAGER_TABS[7], requests).map(r => r.id), ['r2']);
});

test('actions: NDT per weld writes rounds, creates the repair weld once and keeps the request status', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', locationId: 'ndt-shop', requestNo: 'R-7001', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-1', reportNo: 'RT-7001', date: '2026-10-25', result: 'Rejected', naLength: 9, defectType: 'Porosity' }, { round: 'Remaining', processId: 'ndt-1' }] });
  const w22 = store.get('welds', 'weld-22');
  assert.equal(w22.ndtLocationId, 'ndt-shop'); assert.equal(w22.ndtProcess1Id, 'ndt-0'); assert.equal(w22.ndtProcess2Id, 'ndt-1');
  const request = store.list('inspection_requests').find(r => r.weldId === 'weld-22')!;
  assert.equal(request.number, 'R-7001'); assert.equal(request.status, 'Rejected');
  const repairs = store.list('welds').filter(w => w.repairOfId === 'weld-22');
  assert.equal(repairs.length, 1); assert.equal(repairs[0].weldNo, 'W022R1'); assert.equal(repairs[0].repair, true); assert.equal(repairs[0].ndoReq, true); assert.equal(repairs[0].welder1Id, '');
  // Saving the same round again neither duplicates the result nor the repair weld.
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-1', reportNo: 'RT-7001', date: '2026-10-25', result: 'Rejected', naLength: 9, defectType: 'Porosity' }] });
  assert.equal(store.list('inspection_results').filter(r => r.weldId === 'weld-22').length, 1);
  assert.equal(store.list('welds').filter(w => w.repairOfId === 'weld-22').length, 1);
  // A rejected repair gets the next suffix, linked to the repair.
  rules.run('inspection-upload', { type: 'NDT', weldIds: [repairs[0].id], rounds: [{ round: 'Initial', reportNo: 'RT-7002', result: 'Rejected' }], date: '2026-10-27' });
  const second = store.list('welds').find(w => w.repairOfId === repairs[0].id)!; assert.equal(second.weldNo, 'W022R2');
  // "—" removes a round's result; a film number without a result is refused.
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Additional 1', filmNo: 'F-2' }] }), /saved with a result/);
  assert.throws(() => rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', requestNo: '7001', rounds: [] }), /start with R/);
  rules.run('ndt-weld', { weldId: 'weld-22', type: 'NDT', rounds: [{ round: 'Initial', result: '' }] });
  assert.equal(store.list('inspection_results').filter(r => r.weldId === 'weld-22').length, 0); assert.equal(store.get('inspection_requests', request.id).status, 'Open');
});

test('actions: mass requests, uploads, Pre-HT/PWHT, visual reports and tracers validate and write their records', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rules = inspectionRules(store, SYSTEM);
  assert.throws(() => rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22'], processIds: [] }), /processes/);
  assert.throws(() => rules.run('mass-inspection-request', { type: 'PWHT', weldIds: ['weld-22'] }), /does not require PWHT/);
  const made = rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'], note: 'Field closing welds', date: '2026-10-25' }).records!;
  assert.equal(made.length, 2); assert.equal(made[0].number, made[1].number); assert.match(String(made[0].number), /^R-/); assert.equal(made[0].processes, 'RT, UT');
  assert.throws(() => rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-23'], processIds: ['ndt-0'] }), /open NDT request/);
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
  // weld-5 has a rejected sample result: tracers link and unlink.
  assert.throws(() => rules.run('tracers', { weldId: 'weld-1', tracerIds: ['weld-13'] }), /not accepted/);
  rules.run('tracers', { weldId: 'weld-5', tracerIds: ['weld-13', 'weld-17'] });
  assert.equal(store.get('welds', 'weld-13').tracerOfId, 'weld-5'); assert.equal(store.get('welds', 'weld-13').tracer, true);
  rules.run('tracers', { weldId: 'weld-5', tracerIds: ['weld-17'] });
  assert.equal(store.get('welds', 'weld-13').tracer, false); assert.equal(store.get('welds', 'weld-13').tracerOfId, '');
});

test('existing actions create repair welds only where the inspections flow is delivered', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const before = store.list('welds').length;
  const request = (id: string) => (runAction(store, 'inspection-request', { weldIds: [id], type: 'NDT' }, SYSTEM).records!)[0];
  runAction(store, 'inspection-result', { requestId: request('weld-22').id, result: 'Rejected', reportNo: 'RT-A', round: 'Initial' }, SYSTEM);
  assert.equal(store.list('welds').length, before, 'other profiles behave as before');
  runAction(store, 'inspection-result', { requestId: request('weld-23').id, result: 'Rejected', reportNo: 'RT-B', round: 'Initial' }, SYSTEM, { inspectionRules: true });
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
  assert.equal(f.store.list('welds').find(w => w.repairOfId === 'weld-24')?.weldNo, 'W024R1');
  // Files: NDT documents must be PDF.
  const request = f.store.list('inspection_requests').find(r => r.weldId === 'weld-24')!;
  const upload = (name: string) => { const form = new FormData(); form.set('entityType', 'inspection_requests'); form.set('entityId', request.id); form.set('documentType', 'NDT document'); form.set('file', new Blob(['%PDF-1.4']), name); return inspector.request('/files', 'POST', 'weld', form); };
  assert.equal((await upload('rt-9001.png')).status, 422); assert.equal((await upload('rt-9001.pdf')).status, 201);
  // Unknown inputs and invalid rounds are refused.
  assert.equal((await inspector.request('/actions/ndt-weld', 'POST', 'weld', { ...body, approvedBy: 'me' })).status, 404);
  assert.equal((await inspector.request('/actions/ndt-weld', 'POST', 'weld', { ...body, rounds: [{ round: 'Initial', result: 'Accepted' }] })).status, 422);
  // Tracers: allowed for an editor, refused for a reader.
  assert.equal((await inspector.request('/actions/tracers', 'POST', 'weld', { weldId: 'weld-24', tracerIds: ['weld-28'] })).status, 201);
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
  assert.equal(first.number, 'VT 1'); assert.equal(first.itp, 'ITP 1', 'ITP defaults to ITP 1'); assert.equal(first.mode, 'Go (PDF)'); assert.equal(first.activityNo, '4.2'); assert.equal(first.customNo, 'C-9');
  assert.equal(String(first.weldIds).split(',').length, 3); assert.deepEqual(String(first.weldIds).split(','), ids.slice(0, 3));
  assert.ok(first.siteId, 'the number counts per main project');
  const second = rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [ids[3]], itp: 'ITP 2' }).record!;
  assert.equal(second.number, 'VT 2'); assert.equal(second.itp, 'ITP 2');
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [ids[0], ids[3]] }), /already on a visual report/);
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ['weld-2'] }), /not on this isometric/);
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [] }), /at least one weld/);
  assert.throws(() => rules.run('visual-inspection', { op: 'generate', isoId: 'iso-2', weldIds: [isoWelds(store, 'iso-2')[1]], itp: 'ITP 3' }), /ITP/);
  // The next number comes from the existing maximum of the main project, archived reports included.
  const siteId = String(first.siteId);
  assert.equal(nextVtSeq(store.list('visual_reports', true), siteId), 3);
  assert.equal(nextVtSeq(store.list('visual_reports', true), 'another-site'), 1);
  store.update('visual_reports', second.id, { seq: 345, number: 'VT 345' }, store.get('visual_reports', second.id)._version);
  assert.equal(rules.run('visual-inspection', { op: 'generate', isoId: 'iso-2', weldIds: [isoWelds(store, 'iso-2')[0]] }).record!.number, 'VT 346');
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
  assert.deepEqual([...vtMarks(report, results())], [[ids[0], 'Accepted'], [ids[1], 'Rejected']], 'NA is stored as Rejected');
  assert.deepEqual(vtOpenWeldIds(report, results()), [ids[2]]);
  assert.equal(vtOpenReports(store.list('visual_reports'), results(), 'iso-1').length, 1, 'the report still has an open weld');
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /Each weld must have A \(accepted\) or NA \(not accepted\) before upload\. Missing: W\d+/);
  rules.run('visual-inspection', { op: 'marks', reportId: report.id, date: '2026-10-31', accepted: [ids[2]] });
  assert.equal(results().filter(row => row.type === 'VI' && row.reportNo === 'VT 1').length, 3);
  assert.equal(vtOpenReports(store.list('visual_reports'), results(), 'iso-1').length, 0);
  assert.equal(vtUploadReports(store.list('visual_reports'), 'iso-1').length, 1, 'a fully marked report waits for its PDF');
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /at least one PDF/);
  store.create('attachments', { name: 'scan.png', entityType: 'visual_reports', entityId: report.id, documentType: VT_DOCUMENT, mime: 'image/png', size: 3 });
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /PDF/);
  store.create('attachments', { name: 'vt-1.pdf', entityType: 'visual_reports', entityId: report.id, documentType: VT_DOCUMENT, mime: 'application/pdf', size: 3 });
  assert.throws(() => rules.run('visual-inspection', { op: 'upload', reportId: report.id }), /PDF/, 'every file must be a PDF');
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
  assert.equal(rules.run('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: ids }).record!.number, 'VT 2', 'a deleted number is not used again');
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
  assert.equal(made.status, 201); assert.equal((await made.json()).record.number, 'VT 1');
  assert.equal((await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(0, 1) })).status, 422, 'a weld cannot go on a second report');
  assert.equal((await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'generate', isoId: 'iso-1', weldIds: ids.slice(2, 3), secret: 'x' })).status, 404, 'unknown inputs are refused');
  assert.equal((await reader.request('/records/visual_reports', 'GET', 'weld')).status, 200);
  const listed = (await (await inspector.request('/records/visual_reports', 'GET', 'weld')).json()) as { rows: Row[] };
  assert.equal(listed.rows.length, 1);
  const report = listed.rows[0];
  // The report's PDF lists its welds before any result is marked, and the PDF files are attached to the report.
  const pdf = await inspector.request(`/pdf/visual-report?reportNo=${encodeURIComponent('VT 1')}`, 'GET', 'weld');
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const form = new FormData(); form.set('entityType', 'visual_reports'); form.set('entityId', report.id); form.set('documentType', VT_DOCUMENT); form.set('file', new Blob(['%PDF-1.4']), 'vt-1.pdf');
  assert.equal((await inspector.request('/files', 'POST', 'weld', form)).status, 201);
  const deleted = await inspector.request('/actions/visual-inspection', 'POST', 'weld', { op: 'delete', reportIds: [report.id] });
  assert.equal(deleted.status, 201); assert.equal(f.store.list('visual_reports').length, 0);
  assert.equal((await reader.request('/actions/visual-inspection', 'POST', 'weld', { op: 'delete', reportIds: [report.id] })).status, 403);
});
