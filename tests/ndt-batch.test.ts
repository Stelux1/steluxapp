import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, pageAvailable } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { PILOT_MAP, pilotItemState } from '../shared/pilots.ts';
import { PERMISSION_AREAS, PAGE_SCOPES, areaPilots, parsePermissionRules } from '../shared/permissions.ts';
import {
  NDT_BATCH_AREA, NDT_BATCH_COLUMNS, NDT_BATCH_PATH, NDT_BATCH_TEXTS, batchDate, batchDoneMessage, batchRequestNumber, batchResult, batchRowInput, batchRowState, batchStates, ndtBatchField, ndtBatchRows, requestBatch,
  type NdtBatchContext,
} from '../shared/ndt-batch.ts';
import type { Row } from '../shared/types.ts';

let sequence = 0;
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: `2026-11-01T00:00:${String(sequence++ % 60).padStart(2, '0')}Z`, _updatedAt: '', ...data } as Row);
/** One main project: project P1, isometric ISO-1 with three welds (2 inch, 4 inch, 2 inch without RT). */
const context = (): NdtBatchContext => ({
  projects: [row('p1', { internnumber: 'P1', siteId: 's1' })],
  isometrics: [row('i1', { isoNo: 'ISO-1', projectId: 'p1' })],
  welds: [
    row('w1', { weldNo: '001', isoId: 'i1', diameterId: 'd2', lengthMode: 'Diameter', welder1Id: 'wd1', ndtProcess1Id: 'rt', ndtProcess2Id: 'ut' }),
    row('w2', { weldNo: '002', isoId: 'i1', diameterId: 'd4', lengthMode: 'Diameter', welder1Id: 'wd1', ndtProcess1Id: 'rt' }),
    row('w3', { weldNo: '003', isoId: 'i1', diameterId: 'd2', lengthMode: 'Diameter', welder1Id: 'wd1', ndtProcess1Id: 'ut' }),
  ],
  processes: [row('rt', { name: 'RT' }), row('ut', { name: 'UT' })],
  welders: [row('wd1', { number: 'W-001', welderCode: 'W01-441', name: 'Alex Taylor' }), row('wd2', { number: 'W-002', welderCode: 'W01-518', name: 'Robin Lane' })],
  diameters: [row('d2', { diameter: '2"', sizeinch: 2 }), row('d4', { diameter: '4"', sizeinch: 4 })],
  defectCodes: [row('c100', { code: '100', english: 'Crack' })],
});
const values = (extra: Record<string, string>) => ({ isometric: 'ISO-1', weldNo: '001', process: 'RT', result: 'A', reportNo: 'RT-1', ...extra });

test('NDT Batch Import: the menu item sits after NDT/PWHT Manager, opens with area 121 (Show / Import) and is delivered in the hosted profile', () => {
  const items = PILOT_MAP.weld.groups.find(group => group.title === 'Welding data')!.items.map(item => item.label);
  assert.equal(items[items.indexOf('NDT/PWHT Manager') + 1], 'NDT Batch Import');
  assert.ok(items.indexOf('NDT Batch Import') < items.indexOf('QA/QC engineers'));
  assert.equal(PILOT_MAP.mto.groups.flatMap(group => group.items).some(item => item.label === 'NDT Batch Import'), false, 'Weld Pilot only');
  const area = PERMISSION_AREAS.find(item => item.key === NDT_BATCH_AREA)!;
  assert.deepEqual([area.name, area.verbs, area.module], ['NDT Batch Import', ['show', 'import'], 'welding']);
  assert.deepEqual(areaPilots(NDT_BATCH_AREA), ['weld']); assert.ok(PAGE_SCOPES.includes(NDT_BATCH_AREA));
  assert.deepEqual(parsePermissionRules(JSON.stringify({ '121': ['show', 'import'] })), { '121': ['show', 'import'] });
  assert.throws(() => parsePermissionRules(JSON.stringify({ '121': ['insert'] })), /invalid/, 'the area has Show and Import only');
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE);
  assert.equal(pageAvailable(hosted, `/weld${NDT_BATCH_PATH}`, RESOURCES), true);
  assert.equal(pageAvailable(availabilityFor('welding-demo'), NDT_BATCH_PATH, RESOURCES), false, 'not in the demo profile');
  const item = PILOT_MAP.weld.groups.flatMap(group => group.items).find(entry => entry.label === 'NDT Batch Import')!;
  const rights = (area: boolean) => ({ delivered: () => true, canRecord: () => true, canReadReport: () => true, canArea: (key: string) => key !== NDT_BATCH_AREA || area });
  assert.equal(pilotItemState(item, rights(true)), 'open'); assert.equal(pilotItemState(item, rights(false)), 'no-rights');
});

test('Via file: headings, results, dates and request numbers are read as the manual names them', () => {
  assert.deepEqual(NDT_BATCH_COLUMNS.map(column => column.header), ['Project', 'Isometric', 'WeldNo', 'NdtProcess', 'Result', 'NdtDate', 'ReportNo', 'FilmNo', 'NaLength', 'DefectType', 'Welder', 'ReWeld']);
  assert.equal(ndtBatchField('Na Length'), 'naLength'); assert.equal(ndtBatchField('weld no'), 'weldNo'); assert.equal(ndtBatchField('ISO'), 'isometric'); assert.equal(ndtBatchField('Remarks'), undefined);
  assert.equal(batchResult('A'), 'Accepted'); assert.equal(batchResult('na'), 'Rejected'); assert.equal(batchResult('Not accepted'), 'Rejected'); assert.equal(batchResult('maybe'), '');
  assert.equal(batchDate('28-10-2026'), '2026-10-28'); assert.equal(batchDate('2026-10-28'), '2026-10-28'); assert.equal(batchDate('31-02-2026'), null); assert.equal(batchDate(''), '');
  assert.equal(batchRequestNumber('29'), 'R00029'); assert.equal(batchRequestNumber('r00161'), 'R00161'); assert.equal(batchRequestNumber('R-2026-0003'), 'R-2026-0003');
  const parsed = ndtBatchRows([['Isometric', 'Weld No', 'NdtProcess', 'Result'], ['ISO-1', '001', 'RT', 'A'], [], ['ISO-1', '002', 'RT', 'NA']]);
  assert.deepEqual(parsed.rows.map(item => item.rowNo), [2, 4], 'empty lines are skipped, rows keep their sheet number');
  assert.match(ndtBatchRows([['Isometric', 'Result'], ['ISO-1', 'A']]).error!, /Missing: WeldNo, NdtProcess/);
});

test('Via file: an NA row needs NaLength, DefectType and Welder; ReWeld is ticked automatically only at 3 inch or smaller', () => {
  const ctx = context();
  const red = batchRowState({ rowNo: 2, values: values({ result: 'NA', naLength: '12' }) }, ctx);
  assert.equal(red.state, 'error'); assert.ok(red.errors.includes(NDT_BATCH_TEXTS.naFields));
  const small = batchRowState({ rowNo: 3, values: values({ result: 'NA', naLength: '12', defectType: 'Crack', welder: 'W01-441' }) }, ctx);
  assert.equal(small.state, 'ready'); assert.equal(small.reweld, true, '2 inch: ticked');
  const input = batchRowInput(small, ctx);
  assert.deepEqual([input.defectType, input.welderForErrorId, input.naLength, input.reweld, input.rounds[0].round, input.rounds[0].result], ['100', 'wd1', '12', true, 'Initial', 'Rejected'], 'stored as the NDT cell stores it');
  const large = batchRowState({ rowNo: 4, values: values({ weldNo: '002', result: 'NA', naLength: '12', defectType: '100', welder: 'Alex Taylor' }) }, ctx);
  assert.equal(large.reweld, false, '4 inch: not ticked');
  assert.equal(batchRowState({ rowNo: 5, values: values({ weldNo: '002', result: 'NA', naLength: '12', defectType: '100', welder: 'W-001', reweld: 'yes' }) }, ctx).reweld, true, 'a ticked ReWeld in the file is kept');
  assert.equal(batchRowState({ rowNo: 6, values: values({ result: 'NA', naLength: '12', defectType: '100', welder: 'W01-441', reweld: 'no' }) }, ctx).reweld, false);
  // Other problems: a welder not on the weld, an NA field on an A row, a process the weld does not have, a second row on the same process.
  assert.match(batchRowState({ rowNo: 7, values: values({ result: 'NA', naLength: '3', defectType: '100', welder: 'W01-518' }) }, ctx).errors.join(' '), /not a welder of weld 001/);
  assert.equal(batchRowState({ rowNo: 8, values: values({ naLength: '3' }) }, ctx).state, 'error');
  assert.match(batchRowState({ rowNo: 9, values: values({ weldNo: '003' }) }, ctx).errors.join(' '), /has no NDT process RT/);
  assert.equal(batchRowState({ rowNo: 10, values: values({ process: 'UT' }) }, ctx).round, 'Remaining', 'the column of the weld\'s UT');
  assert.deepEqual(batchStates([{ rowNo: 2, values: values({}) }, { rowNo: 3, values: values({ result: 'NA', naLength: '1', defectType: '100', welder: 'W01-441' }) }], ctx).map(item => [item.state, item.errors[0] ?? '']), [['ready', ''], ['error', NDT_BATCH_TEXTS.duplicate]]);
});

test('Via file: a weld is matched on the open main project only; Lookup can choose only a weld of it', () => {
  const ctx = context();
  assert.equal(batchRowState({ rowNo: 2, values: values({ weldNo: '009' }) }, ctx).state, 'unmatched');
  assert.equal(batchRowState({ rowNo: 2, values: values({ project: 'P2' }) }, ctx).state, 'unmatched', 'the named project is not on the open main project');
  const other = batchRowState({ rowNo: 2, values: values({ weldNo: '009' }), weldId: 'weld-of-another-site' }, ctx);
  assert.deepEqual([other.state, other.errors[0]], ['unmatched', NDT_BATCH_TEXTS.otherSite]);
  const looked = batchRowState({ rowNo: 2, values: values({ weldNo: '009' }), weldId: 'w1' }, ctx);
  assert.deepEqual([looked.state, looked.weldNo], ['ready', '001']);
  assert.equal(batchDoneMessage(3, 1), 'Import committed: 3 A and 1 NA.');
});

test('Via request number: only the welds and processes of that request on the open main project are listed, grouped per isometric', () => {
  const ctx = context();
  const line = (id: string, weldId: string, extra: Record<string, unknown> = {}) => row(id, { number: 'R00029', type: 'NDT', weldId, status: 'Open', processes: 'RT', processId: 'rt', ...extra });
  const requests = [line('r1', 'w1'), line('r2', 'w2'), line('r3', 'weld-of-another-site'), line('r4', 'w3', { type: 'NDT PRE' }), line('r5', 'w2', { number: 'R00030' })];
  const isos = requestBatch('R00029', 'NDT', { ...ctx, requests: requests.slice(0, 4), results: [] });
  assert.deepEqual(isos.map(iso => [iso.isoNo, iso.welds.map(weld => [weld.weldNo, weld.tests.map(item => item.processName), Boolean(weld.superseded)])]), [['ISO-1', [['001', ['RT'], false], ['002', ['RT'], false]]]], 'not UT of weld 001, not the other site\'s weld, not NDT Pre');
  const later = requestBatch('R00029', 'NDT', { ...ctx, requests, results: [] });
  assert.equal(later[0].welds.find(weld => weld.weldNo === '002')!.superseded, true, 'R00030 is later: the results of 002 go there');
});

// ----- HTTP ------------------------------------------------------------------------------------------------------
const PASSWORD = 'Ndt-Batch-Test-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-ndt-batch-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, method = 'GET', pilot: string | undefined = 'weld', data?: unknown) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { assert.equal((await request('/auth/login', 'POST', undefined, { email, password: PASSWORD })).status, 200); assert.equal((await request('/auth/site', 'POST', undefined, { siteId: 'site-north' })).status, 200); };
    return { request, login };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', 'POST', undefined, { name: 'Batch admin', email: 'batch-admin@example.test', password: PASSWORD })).status, 201);
  assert.equal((await admin.request('/auth/site', 'POST', undefined, { siteId: 'site-north' })).status, 200);
  const account = (name: string, profile: Record<string, unknown>) => {
    const created = store.create('profiles', { name: `${name} profile`, settingsPermission: 'No access', toolsPermission: 'No access', generalPermission: 'Read & write', materialsPermission: 'No access', ...profile });
    const user = store.create('users', { name, email: `${name.toLowerCase()}@example.test`, profileId: created.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return String(user.email);
  };
  // North (the open main project): isometric NB-100 of STX-2401. River: an isometric with the same number and weld numbers.
  store.create('isometrics', { isoNo: 'NB-100', projectId: 'project-cooling' }, SYSTEM, 'iso-nb');
  store.create('isometrics', { isoNo: 'NB-100', projectId: 'project-steam' }, SYSTEM, 'iso-nb-river');
  const weld = (id: string, weldNo: string, isoId: string, diameterId: string, extra: Record<string, unknown> = {}) => store.create('welds', { weldNo, isoId, diameterId, lengthMode: 'Diameter', welder1Id: 'welder-1', wpsId: 'wps-1', date: '2026-10-30', ndoReq: true, ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ...extra }, SYSTEM, id);
  weld('weld-nb1', 'NB01', 'iso-nb', 'diameter-6'); weld('weld-nb2', 'NB02', 'iso-nb', 'diameter-9'); weld('weld-nb4', 'NB04', 'iso-nb', 'diameter-6'); weld('weld-nb5', 'NB05', 'iso-nb', 'diameter-6'); weld('weld-nb6', 'NB06-X', 'iso-nb', 'diameter-6');
  weld('weld-nb7', 'NB07', 'iso-nb', 'diameter-6', { ndtProcess2Id: 'ndt-1' }); weld('weld-nb8', 'NB08', 'iso-nb', 'diameter-6', { ndtProcess2Id: 'ndt-1' });
  weld('weld-river-1', 'NB01', 'iso-nb-river', 'diameter-6'); weld('weld-river-9', 'NB09', 'iso-nb-river', 'diameter-6');
  // W003 of STX-CW-003 is a shop weld of a Prefab complete isometric: locked.
  const w3 = store.get('welds', 'weld-3'); store.update('welds', w3.id, { ndtProcess1Id: 'ndt-0', ndtLocationId: 'ndt-shop' }, w3._version, SYSTEM);
  return { store, client, admin, account };
}
const csv = (lines: string[]) => { const form = new FormData(); form.set('file', new Blob([lines.join('\n')], { type: 'text/csv' }), 'results.csv'); return form; };
const HEAD = 'Isometric,WeldNo,NdtProcess,Result,NdtDate,ReportNo,NaLength,DefectType,Welder,ReWeld';
const batchResults = (store: Store, prefix: string) => store.list('inspection_results').filter(item => String(item.reportNo).startsWith(prefix));

test('HTTP Via file: preview is a dry run with a state per row; commit writes the ready rows through the NDT cell, all or nothing', async t => {
  const f = await fixture(t);
  const file = csv([HEAD,
    'NB-100,NB01,RT,A,2026-11-02,BT-501,,,,',
    'NB-100,NB02,RT,NA,02-11-2026,BT-502,12,100,W01-441,',
    'NB-100,NB04,RT,NA,2026-11-02,BT-503,12,,,',
    'NB-100,NB09,RT,A,2026-11-02,BT-504,,,,',
    'STX-CW-003,W003,RT,A,2026-11-02,BT-505,,,,',
    'NB-100,NB05,RT,NA,2026-11-02,BT-506,7,101,Alex Taylor,']);
  const preview = await f.admin.request('/ndt-batch/preview', 'POST', 'weld', file); assert.equal(preview.status, 200);
  const checked = await preview.json() as { rows: (Row & { state: string; errors: string[]; reweld: boolean })[]; summary: Record<string, number> };
  assert.deepEqual(checked.rows.map(item => item.state), ['ready', 'ready', 'error', 'unmatched', 'error', 'ready']);
  assert.ok(checked.rows[2].errors.includes(NDT_BATCH_TEXTS.naFields), 'the NA row without its fields stays red');
  assert.match(checked.rows[4].errors[0], /Weld W003: Locked after Prefab complete/, 'the lock message of the NDT cell');
  assert.deepEqual(checked.rows.filter(item => item.state === 'ready').map(item => item.reweld), [false, false, true], 'ReWeld only on the 2 inch NA (NB05), not on NB02 (4 inch)');
  assert.deepEqual([checked.summary.ready, checked.summary.accepted, checked.summary.rejected], [3, 1, 2]);
  assert.equal(batchResults(f.store, 'BT-').length, 0, 'the preview saved nothing');
  // An unmatched weld: Lookup does not offer the other main project's NB09, and choosing it is refused; a weld of this one is taken.
  assert.deepEqual((await (await f.admin.request('/ndt-batch/welds?q=NB09')).json()).welds, []);
  const found = (await (await f.admin.request('/ndt-batch/welds?q=NB06')).json()).welds as { id: string }[];
  assert.deepEqual(found.map(item => item.id), ['weld-nb6']);
  const rows = checked.rows.map(item => ({ rowNo: item.rowNo, values: item.values }));
  const foreign = await (await f.admin.request('/ndt-batch/check', 'POST', 'weld', { rows: rows.map(item => item.rowNo === 5 ? { ...item, weldId: 'weld-river-9' } : item) })).json();
  assert.deepEqual([foreign.rows[3].state, foreign.rows[3].errors[0]], ['unmatched', NDT_BATCH_TEXTS.otherSite]);
  const looked = rows.map(item => item.rowNo === 5 ? { ...item, weldId: 'weld-nb6' } : item);
  assert.equal((await (await f.admin.request('/ndt-batch/check', 'POST', 'weld', { rows: looked })).json()).rows[3].state, 'ready');
  // All or nothing: the locked W003 is a ready row by its values but its write is refused, so nothing of the batch is saved.
  const all = await f.admin.request('/ndt-batch/commit', 'POST', 'weld', { rows: [rows[0], { rowNo: 9, values: { isometric: 'STX-CW-003', weldNo: 'W003', process: 'RT', result: 'A', reportNo: 'BT-505' } }], ready: [2, 9] });
  assert.equal(all.status, 422); assert.match((await all.json()).error, /^Row 9: Weld W003: Locked after Prefab complete.*Nothing was saved\.$/);
  assert.equal(batchResults(f.store, 'BT-').length, 0);
  // Commit: the ready rows are written, the red and unmatched ones are not.
  const ready = checked.rows.filter(item => item.state === 'ready').map(item => item.rowNo);
  assert.equal((await f.admin.request('/ndt-batch/commit', 'POST', 'weld', { rows, ready: [...ready, 4] })).status, 422, 'a red row cannot be committed');
  const committed = await f.admin.request('/ndt-batch/commit', 'POST', 'weld', { rows, ready }); assert.equal(committed.status, 201);
  const done = await committed.json();
  assert.equal(done.message, 'Import committed: 1 A and 2 NA.'); assert.equal(done.skipped, 3);
  const written = batchResults(f.store, 'BT-').map(item => [item.weldId, item.reportNo, item.result, item.round, item.date, item.naLength ?? null, item.defectType || '', item.welderForErrorId || '', item.reweld === true]).sort();
  assert.deepEqual(written, [
    ['weld-nb1', 'BT-501', 'Accepted', 'Initial', '2026-11-02', null, '', '', false],
    ['weld-nb2', 'BT-502', 'Rejected', 'Initial', '2026-11-02', 12, '100', 'welder-1', false],
    ['weld-nb5', 'BT-506', 'Rejected', 'Initial', '2026-11-02', 7, '101', 'welder-1', true],
  ]);
  // Written as by the NDT cell: on an NDT request of the weld, the weld keeps its NDT location, no repair weld is created.
  const request = f.store.list('inspection_requests').find(item => item.weldId === 'weld-nb2' && item.type === 'NDT')!;
  assert.deepEqual([request.status, request.locationId, f.store.get('welds', 'weld-nb2').ndtLocationId], ['Rejected', 'ndt-shop', 'ndt-shop']);
  assert.equal(f.store.list('welds').some(item => item.repairOfId === 'weld-nb2'), false);
  assert.equal(f.store.list('inspection_results').some(item => item.weldId === 'weld-river-1' || item.weldId === 'weld-river-9'), false, 'nothing on the other main project');
  assert.ok(f.store.activity(20).some(event => event.summary === 'NDT Batch Import via file: 1 A, 2 NA'), 'the batch is noted in the audit trail');
  // A second commit of the same file updates the same results; with a repair added by hand the message offers it.
  f.store.create('welds', { weldNo: 'NB02R1', isoId: 'iso-nb', diameterId: 'diameter-9', lengthMode: 'Diameter', repair: true, repairOfId: 'weld-nb2' }, SYSTEM, 'weld-nb2r1');
  const again = await (await f.admin.request('/ndt-batch/commit', 'POST', 'weld', { rows, ready })).json();
  assert.equal(batchResults(f.store, 'BT-').length, 3); assert.deepEqual(again.repairs.map((item: Row) => [item.weldNo, item.repairNo]), [['NB02', 'NB02R1']]);
  assert.equal(f.store.list('welds').filter(item => item.repairOfId === 'weld-nb2').length, 1, 'a second commit creates no other repair');
  // Template and a file of another kind.
  const template = await f.admin.request('/ndt-batch/template'); assert.equal(template.status, 200); assert.match(template.headers.get('content-disposition') || '', /ndt-batch-import-template\.xlsx/);
  const wrong = new FormData(); wrong.set('file', new Blob(['x']), 'results.pdf');
  assert.equal((await f.admin.request('/ndt-batch/preview', 'POST', 'weld', wrong)).status, 422);
});

test('HTTP: an account without the right is refused (403), in Weld Pilot and from MTO Pilot; the page area alone is not enough', async t => {
  const f = await fixture(t);
  const body = { rows: [{ rowNo: 2, values: { isometric: 'NB-100', weldNo: 'NB01', process: 'RT', result: 'A', reportNo: 'BT-900' } }], ready: [2] };
  const reader = f.client(); await reader.login(f.account('Reader', { weldingPermission: 'Read only' }));
  for (const [path, method, data] of [['/ndt-batch/preview', 'POST', csv([HEAD, 'NB-100,NB01,RT,A,,BT-900,,,,'])], ['/ndt-batch/check', 'POST', body], ['/ndt-batch/commit', 'POST', body], ['/ndt-batch/template', 'GET', undefined], ['/ndt-batch/welds?q=NB', 'GET', undefined]] as const)
    assert.equal((await reader.request(path, method, 'weld', data)).status, 403, path);
  // Detailed profiles: NDT results (76) without area 121, area 121 to show only, and both.
  const detailed = (name: string, rules: Record<string, string[]>) => f.account(name, { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '63': ['show'], '64': ['show'], '50': ['show'], '5': ['show'], '4': ['show'], ...rules }), generalPermission: 'No access', weldingPermission: 'No access' });
  const noArea = f.client(); await noArea.login(detailed('NoArea', { '76': ['show', 'insert'] }));
  assert.equal((await noArea.request('/ndt-batch/commit', 'POST', 'weld', body)).status, 403);
  const showOnly = f.client(); await showOnly.login(detailed('ShowOnly', { '76': ['show', 'insert'], '121': ['show'] }));
  assert.equal((await showOnly.request('/ndt-batch/commit', 'POST', 'weld', body)).status, 403, 'Import = Upload / Commit');
  const noNdt = f.client(); await noNdt.login(detailed('NoNdt', { '76': ['show'], '121': ['show', 'import'] }));
  assert.equal((await noNdt.request('/ndt-batch/commit', 'POST', 'weld', body)).status, 403, 'the NDT cell\'s Add right is needed too');
  const importer = f.client(); await importer.login(detailed('Importer', { '76': ['show', 'insert'], '121': ['show', 'import'] }));
  assert.equal((await importer.request('/ndt-batch/commit', 'POST', 'mto', body)).status, 403, 'not from MTO Pilot');
  assert.equal(batchResults(f.store, 'BT-900').length, 0);
  assert.equal((await importer.request('/ndt-batch/commit', 'POST', 'weld', body)).status, 201);
  assert.equal(batchResults(f.store, 'BT-900').length, 1);
});

test('HTTP Via request number: Search welds lists the request on the open main project only; Commit import writes the results, the report number and the PDF per isometric', async t => {
  const f = await fixture(t);
  const made = await f.admin.request('/actions/mass-inspection-request', 'POST', 'weld', { type: 'NDT', weldIds: ['weld-nb7', 'weld-nb8'], processIds: ['ndt-0'] }); assert.equal(made.status, 201);
  const number = String((await made.json()).records[0].number);
  // The same number on a weld of the other main project (not reachable from here) is left out.
  f.store.create('inspection_requests', { number, weldId: 'weld-river-1', type: 'NDT', processId: 'ndt-0', processes: 'RT', status: 'Open', date: '2026-11-01' }, SYSTEM);
  const search = await f.admin.request(`/ndt-batch/request?type=NDT&number=${number.slice(1)}`); assert.equal(search.status, 200);
  const found = await search.json();
  assert.equal(found.number, number);
  assert.deepEqual(found.isos.map((iso: { isoId: string; welds: { weldNo: string; tests: { processName: string }[] }[] }) => [iso.isoId, iso.welds.map(weld => [weld.weldNo, weld.tests.map(item => item.processName)])]), [['iso-nb', [['NB07', ['RT']], ['NB08', ['RT']]]]], 'only RT (the request), not the UT of the welds');
  assert.equal(found.welders.find((item: { id: string }) => item.id === 'welder-1').code, 'W01-441');
  assert.equal((await (await f.admin.request(`/ndt-batch/request?type=NDT%20PRE&number=${number}`)).json()).isos.length, 0, 'NDT-Pre lists the NDT-Pre requests only');
  const payload = { type: 'NDT', number, isos: [{ isoId: 'iso-nb', reportNo: 'RQ-77', tests: [{ weldId: 'weld-nb7', processId: 'ndt-0', result: 'Accepted', date: '2026-11-03' }, { weldId: 'weld-nb8', processId: 'ndt-0', result: 'Rejected', date: '2026-11-03', naLength: '5', defectType: '100', welderId: 'welder-1', reweld: true }] }] };
  const form = (data: unknown, file?: [string, string]) => { const body = new FormData(); body.set('payload', JSON.stringify(data)); if (file) body.set('pdf-iso-nb', new Blob(['%PDF-1.4']), file[1]); return body; };
  assert.equal((await f.admin.request('/ndt-batch/request/commit', 'POST', 'weld', form(payload, ['pdf', 'rq-77.png']))).status, 422, 'NDT documents must be PDF files');
  assert.equal((await f.admin.request('/ndt-batch/request/commit', 'POST', 'weld', form({ ...payload, isos: [{ ...payload.isos[0], reportNo: '' }] }))).status, 422, 'the Report No. per ISO');
  assert.equal((await f.admin.request('/ndt-batch/request/commit', 'POST', 'weld', form({ ...payload, isos: [{ ...payload.isos[0], tests: [{ weldId: 'weld-nb7', processId: 'ndt-1', result: 'Accepted' }] }] }))).status, 422, 'UT is not on the request');
  assert.equal((await f.admin.request('/ndt-batch/request/commit', 'POST', 'weld', form({ ...payload, isos: [{ isoId: 'iso-nb-river', reportNo: 'X', tests: [{ weldId: 'weld-river-1', processId: 'ndt-0', result: 'Accepted' }] }] }))).status, 422, 'the other main project\'s line');
  assert.equal(batchResults(f.store, 'RQ-').length, 0);
  const committed = await f.admin.request('/ndt-batch/request/commit', 'POST', 'weld', form(payload, ['pdf', 'rq-77.pdf'])); assert.equal(committed.status, 201);
  const done = await committed.json(); assert.equal(done.message, 'Import committed: 1 A and 1 NA.'); assert.equal(done.documents, 1);
  const lines = f.store.list('inspection_requests').filter(item => item.number === number);
  const written = batchResults(f.store, 'RQ-');
  assert.deepEqual(written.map(item => [item.weldId, item.reportNo, item.result, item.date, item.requestId === lines.find(line => line.weldId === item.weldId)!.id]).sort(), [['weld-nb7', 'RQ-77', 'Accepted', '2026-11-03', true], ['weld-nb8', 'RQ-77', 'Rejected', '2026-11-03', true]]);
  assert.deepEqual(written.filter(item => item.weldId === 'weld-nb8').map(item => [item.naLength, item.defectType, item.welderForErrorId, item.reweld]), [[5, '100', 'welder-1', true]]);
  assert.deepEqual(lines.filter(line => line.weldId !== 'weld-river-1').map(line => line.status).sort(), ['Accepted', 'Rejected'], 'the request is updated');
  const pdf = f.store.list('attachments').filter(item => item.documentType === 'NDT document' && written.some(result => result.id === item.entityId));
  assert.deepEqual(pdf.map(item => [item.entityType, item.name]), [['inspection_results', 'rq-77.pdf']], 'one PDF for the isometric, on its report');
  assert.equal(f.store.list('inspection_results').some(item => item.weldId === 'weld-river-1'), false);
});
