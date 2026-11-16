import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { ACTIONS } from '../shared/actions.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { HYDROTEST_DOCUMENT_TYPES, hydrotestState, TS_NOT_APPLICABLE } from '../shared/hydrotest.ts';
import { isoProgress, type IsoStatusInput } from '../shared/iso-status.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import type { Row } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data }) as Row;
const SYSTEM = row('ts', { name: 'CW-01', accepted: '' });
const PASSED = row('req', { testSystemId: 'ts', result: 'Passed' });
const iso = (data: Record<string, unknown> = {}) => row('iso', { testSystemId: 'ts', ...data });

// ----- hydrotestState ----------------------------------------------------------------------------------------

test('hydrotestState: an isometric without a test system is out of scope', () => {
  assert.deepEqual(hydrotestState(iso({ testSystemId: '' }), { test_systems: [SYSTEM], hydrotest_requests: [PASSED], releases: [] }), { inScope: false, completed: false });
});

test('hydrotestState: "Testing not applicable" takes the isometric out of scope even with a passed request', () => {
  const na = row('ts', { accepted: TS_NOT_APPLICABLE });
  assert.deepEqual(hydrotestState(iso(), { test_systems: [na], hydrotest_requests: [PASSED], releases: [] }), { inScope: false, completed: false });
  // Approved and not set both stay in scope.
  assert.equal(hydrotestState(iso(), { test_systems: [row('ts', { accepted: 'Approved' })], hydrotest_requests: [] }).inScope, true);
  assert.equal(hydrotestState(iso(), { test_systems: [SYSTEM], hydrotest_requests: [] }).inScope, true);
});

test('hydrotestState: only a passed request of the isometric\'s own test system completes it', () => {
  const rows = (requests: Row[]) => ({ test_systems: [SYSTEM], hydrotest_requests: requests, releases: [] as Row[] });
  assert.deepEqual(hydrotestState(iso(), rows([PASSED])), { inScope: true, completed: true });
  assert.equal(hydrotestState(iso(), rows([row('open', { testSystemId: 'ts', result: '' })])).completed, false, 'no result recorded');
  assert.equal(hydrotestState(iso(), rows([row('failed', { testSystemId: 'ts', result: 'Failed' })])).completed, false, 'failed');
  assert.equal(hydrotestState(iso(), rows([row('other', { testSystemId: 'other', result: 'Passed' })])).completed, false, 'another test system');
  assert.equal(hydrotestState(iso(), rows([{ ...PASSED, _archived: true }])).completed, false, 'archived request');
  // Moving the isometric to another system changes the answer without touching any request.
  assert.equal(hydrotestState(iso({ testSystemId: 'ts-2' }), { test_systems: [SYSTEM, row('ts-2')], hydrotest_requests: [PASSED], releases: [] }).completed, false);
});

test('hydrotestState: a Hydrotest release of the isometric still counts, and unreadable rows cannot be judged', () => {
  const release = row('rel', { isoId: 'iso', type: 'Hydrotest' });
  assert.deepEqual(hydrotestState(iso(), { releases: [release] }), { inScope: true, completed: true });
  assert.equal(hydrotestState(iso(), { releases: [row('rel', { isoId: 'iso', type: 'Prefab' })] }).completed, false);
  assert.equal(hydrotestState(iso(), { releases: [row('rel', { isoId: 'other', type: 'Hydrotest' })] }).completed, false);
  assert.deepEqual(hydrotestState(iso(), { test_systems: [SYSTEM], hydrotest_requests: null, releases: null }), { inScope: false, completed: false });
  assert.deepEqual(hydrotestState(iso(), {}), { inScope: false, completed: false });
});

// ----- the progress driver ------------------------------------------------------------------------------------

const SITE = row('site', { weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10, fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60, ndtMeasurement: 'Inch-weighted' });
const input = (data: Partial<IsoStatusInput> = {}): IsoStatusInput => ({ site: SITE, welds: [], weldTypes: [], diameters: [], results: [], releases: [], punch: [], iso: iso({ paintState: 'Done', tracingState: 'Done', insulationState: 'Done' }), ...data });
const driver = (progress: ReturnType<typeof isoProgress>) => progress.phases[2].drivers.find(item => item.key === 'hydrotest')!;

test('the hydrotest driver follows hydrotestState: passed request completes it, N/A drops it out and the finish driver carries the phase', () => {
  const completed = isoProgress(input({ testSystems: [SYSTEM], hydrotestRequests: [PASSED] }));
  assert.equal(driver(completed).inScope, true); assert.equal(driver(completed).progress, 1); assert.equal(completed.phases[2].percent, 100);
  const open = isoProgress(input({ testSystems: [SYSTEM], hydrotestRequests: [row('r', { testSystemId: 'ts', result: '' })] }));
  assert.equal(driver(open).progress, 0); assert.equal(open.phases[2].percent, 60, 'finish 60 of 100 weight, hydrotest 0 of 40');
  const na = isoProgress(input({ testSystems: [row('ts', { accepted: TS_NOT_APPLICABLE })], hydrotestRequests: [PASSED] }));
  assert.equal(driver(na).inScope, false); assert.equal(na.phases[2].percent, 100, 'renormalised on the finish driver');
});

test('the driver behaves as before for callers that pass only releases', () => {
  assert.equal(driver(isoProgress(input({ releases: [row('r1', { isoId: 'iso', type: 'Hydrotest' })] }))).progress, 1);
  assert.equal(driver(isoProgress(input({ releases: [] }))).progress, 0);
  assert.equal(driver(isoProgress(input({ releases: null }))).inScope, false);
  assert.equal(driver(isoProgress(input({ iso: iso({ testSystemId: '' }) }))).inScope, false);
});

// ----- records and actions on the store -----------------------------------------------------------------------

const store = () => { const s = new Store(':memory:'); seed(s); return s; };
const fails = (fn: () => unknown, pattern: RegExp) => assert.throws(fn, (error: unknown) => error instanceof AppError && pattern.test(error.message + JSON.stringify(error.fields || {})));

test('the sample seed carries approved, applicable and not applicable test systems', () => {
  const s = store();
  assert.equal(s.get('test_systems', 'test-cw').accepted, 'Approved');
  assert.equal(s.get('test_systems', 'test-sk').accepted, TS_NOT_APPLICABLE);
  const rows = { test_systems: s.list('test_systems'), hydrotest_requests: s.list('hydrotest_requests'), releases: s.list('releases') };
  for (const id of ['iso-1', 'iso-2', 'iso-3']) assert.deepEqual(hydrotestState(s.get('isometrics', id), rows), { inScope: true, completed: true }, id);
  for (const id of ['iso-4', 'iso-5']) assert.deepEqual(hydrotestState(s.get('isometrics', id), rows), { inScope: true, completed: false }, id);
  assert.equal(hydrotestState(s.get('isometrics', 'iso-7'), rows).inScope, false);
});

test('a test system accepts only the listed acceptance values', () => {
  const s = store();
  const system = s.get('test_systems', 'test-st');
  assert.equal(s.update('test_systems', system.id, { accepted: 'Approved' }, system._version).accepted, 'Approved');
  fails(() => s.update('test_systems', system.id, { accepted: 'Maybe' }, s.get('test_systems', system.id)._version), /Choose a valid/);
  assert.equal(s.create('test_systems', { name: 'NEW-01' }).accepted, '', 'empty is "-- Not set --"');
});

test('a hydrotest request needs a test system and a record number, and checks its times', () => {
  const s = store();
  fails(() => s.create('hydrotest_requests', { recordNo: 'X-1' }), /Test system is required/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw' }), /Test record no\. is required/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-1', testStart: '9:30' }), /Test start must be a time/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-1', testEnd: '24:10' }), /Test end must be a time/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'HTR-CW-01' }), /already exists/);
  const created = s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-1', testStart: '09:30', testEnd: '10:45' });
  assert.equal(created.includeIsometrics, true); assert.equal(created.result, '');
});

test('a passed result needs the actual pressure and the date, whichever way it is saved', () => {
  const s = store();
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-2', result: 'Passed', date: '2026-11-01' }), /actual test pressure/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-2', result: 'Passed', actualPressure: '15 bar' }), /test date/);
  assert.equal(s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-2', result: 'Failed' }).result, 'Failed');
});

test('hydrotest-result: passed completes the hydrotest of every isometric of the system, failed completes nothing', () => {
  const s = store(); const actor = { id: 'u', name: 'Tester' };
  const state = () => ['iso-4', 'iso-5', 'iso-6'].map(id => hydrotestState(s.get('isometrics', id), { test_systems: s.list('test_systems'), hydrotest_requests: s.list('hydrotest_requests'), releases: s.list('releases') }).completed);
  assert.deepEqual(state(), [false, false, false]);
  const failed = runAction(s, 'hydrotest-result', { requestId: 'hydrotest-st-1', result: 'Failed', actualPressure: '18 bar', date: '2026-11-20' }, actor);
  assert.equal(failed.record!.result, 'Failed'); assert.deepEqual(state(), [false, false, false]);
  const passed = runAction(s, 'hydrotest-result', { requestId: 'hydrotest-st-1', result: 'Passed', actualPressure: '24.3 bar', date: '2026-11-22', testStart: '08:00', testEnd: '09:30', note: 'Held for 60 minutes.' }, actor);
  assert.equal(passed.record!.result, 'Passed'); assert.equal(passed.record!.actualPressure, '24.3 bar'); assert.equal(passed.record!.testEnd, '09:30');
  assert.deepEqual(state(), [true, true, true]);
  assert.equal(s.get('hydrotest_requests', 'hydrotest-st-1').recordNo, 'HTR-ST-01', 'other fields are kept');
});

test('hydrotest-result rejects a missing result, pressure, date or time and leaves the request untouched', () => {
  const s = store(); const before = s.get('hydrotest_requests', 'hydrotest-st-1');
  const run = (data: Record<string, unknown>) => runAction(s, 'hydrotest-result', { requestId: 'hydrotest-st-1', result: 'Passed', actualPressure: '24 bar', date: '2026-11-22', ...data }, { id: 'u', name: 'T' });
  fails(() => run({ result: 'Done' }), /Choose Passed or Failed/);
  fails(() => run({ actualPressure: ' ' }), /actual test pressure/);
  fails(() => run({ date: '' }), /test date/);
  fails(() => run({ date: '2026-02-31' }), /valid date/);
  fails(() => run({ testStart: 'noon' }), /Test start must be a time/);
  fails(() => run({ requestId: 'missing' }), /could not be found/);
  assert.equal(s.get('hydrotest_requests', 'hydrotest-st-1')._version, before._version);
});

test('hydrotest-move assigns the checked isometrics, all or nothing, and keeps a project system to its own project', () => {
  const s = store(); const actor = { id: 'u', name: 'Tester' };
  const moved = runAction(s, 'hydrotest-move', { isoIds: ['iso-6', 'iso-5'], testSystemId: 'test-st' }, actor);
  assert.equal(moved.records!.length, 2);
  // An isometric of another project stops the whole move.
  const before = s.get('isometrics', 'iso-1')._version;
  fails(() => runAction(s, 'hydrotest-move', { isoIds: ['iso-6', 'iso-1'], testSystemId: 'test-st' }, actor), /another project than STX-CW-001/);
  assert.equal(s.get('isometrics', 'iso-1')._version, before); assert.equal(s.get('isometrics', 'iso-1').testSystemId, 'test-cw');
  // A test system without a project takes any isometric.
  const free = s.create('test_systems', { name: 'ANY-01' });
  runAction(s, 'hydrotest-move', { isoIds: ['iso-1'], testSystemId: free.id }, actor);
  assert.equal(s.get('isometrics', 'iso-1').testSystemId, free.id);
  // Moving changes the answer of hydrotestState: iso-1 left CW-01, which has the passed request.
  assert.equal(hydrotestState(s.get('isometrics', 'iso-1'), { test_systems: s.list('test_systems'), hydrotest_requests: s.list('hydrotest_requests'), releases: [] }).completed, false);
  fails(() => runAction(s, 'hydrotest-move', { isoIds: [], testSystemId: 'test-st' }, actor), /at least one isometric/);
  fails(() => runAction(s, 'hydrotest-move', { isoIds: ['iso-6'], testSystemId: 'nope' }, actor), /could not be found/);
});

test('documents of a hydrotest request carry one of the six document types', () => {
  const s = store();
  assert.equal(HYDROTEST_DOCUMENT_TYPES.length, 6);
  for (const type of HYDROTEST_DOCUMENT_TYPES) s.create('attachments', { name: `${type}.pdf`, entityType: 'hydrotest_requests', entityId: 'hydrotest-cw-1', documentType: type });
  fails(() => s.create('attachments', { name: 'x.pdf', entityType: 'hydrotest_requests', entityId: 'hydrotest-cw-1', documentType: 'Menu' }), /Choose one of/);
  // The generic Documents tab and other records are unaffected.
  s.create('attachments', { name: 'x.pdf', entityType: 'hydrotest_requests', entityId: 'hydrotest-cw-1', documentType: 'Attachment' });
  s.create('attachments', { name: 'y.pdf', entityType: 'isometrics', entityId: 'iso-1', documentType: 'Anything' });
});

// ----- delivery ------------------------------------------------------------------------------------------------

test('the hosted profile delivers the hydrotest release and the other profiles do not change', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.resources.test_systems.includes('accepted'));
  assert.ok(RESOURCE_MAP.hydrotest_requests.fields.every(field => hosted.resources.hydrotest_requests.includes(field.name)));
  assert.ok(!hosted.navigation.includes('hydrotest_requests'), 'requests open from the test system, not from the menu');
  for (const key of ['hydrotest-move', 'hydrotest-result']) { assert.ok(ACTIONS[key]); assert.ok(hosted.actions[key]); }
  for (const profile of ['welding-demo', 'access-prototype'] as const) {
    const other = availabilityFor(profile)!;
    assert.equal(other.resources.hydrotest_requests, undefined, profile); assert.equal(other.actions['hydrotest-move'], undefined, profile);
    assert.ok(!other.resources.test_systems?.includes('accepted'), profile);
  }
  assert.equal(availabilityFor('full'), undefined);
  const item = PILOT_MAP.weld.groups.find(group => group.title === 'Releases')!.items.find(entry => entry.label === 'Hydrotest release')!;
  assert.equal(pilotItemPath(item), '/welding/test_systems');
  assert.ok(!PILOT_MAP.mto.groups.some(group => group.items.some(entry => entry.label === 'Hydrotest release')));
});

test('the reference labels are used for the test system and request fields', () => {
  assert.equal(RESOURCE_MAP.test_systems.fields.find(field => field.name === 'accepted')!.label, 'Test system accepted by client');
  assert.deepEqual(RESOURCE_MAP.hydrotest_requests.fields.filter(field => !field.hidden).map(field => field.label), ['Test system', 'Test record no.', 'QA/QC engineer', 'Date', 'Pump type', 'Hose type', 'Manifold', 'Pressure gauge no.', 'Recorder No', 'Calibration cert', 'Piping class', 'Design code', 'Test medium', 'Required test pressure', 'Actual test pressure', 'Test start', 'Test end', 'Area temp', 'Test duration', 'Required leak test pressure', 'Leak test duration', 'Include isometrics', 'Note']);
});

// ----- through the HTTP layer ---------------------------------------------------------------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }, profile: typeof HOSTED_RELEASE_PROFILE | 'welding-demo' = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-hydrotest-'));
  const db = new Store(join(dir, 'test.sqlite')); seed(db);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(db, dir, { releaseProfile: profile, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const send = async (path: string, method: string, body?: BodyInit, json = true) => {
    const response = await fetch(origin + path, { method, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const request = (path: string, method = 'GET', data?: unknown) => send(path, method, data === undefined ? undefined : JSON.stringify(data));
  const password = 'Hydrotest-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profileRow = db.create('profiles', { name, ...levels });
    const user = db.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profileRow.id, active: true });
    db.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { db, request, send, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Hydro admin', email: 'hydro-admin@example.test', password })).status, 201) };
}

const rw = { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' };

test('Weld Pilot account: lists, records a request, moves isometrics and sees the new status through the API', async t => {
  const f = await hostedFixture(t); await f.setup();
  const data = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  assert.ok(data.rows.test_systems.some(system => system.accepted === 'Approved')); assert.ok(data.rows.hydrotest_requests.length >= 2);
  const created = await f.request('/api/records/hydrotest_requests', 'POST', { testSystemId: 'test-st', recordNo: 'HTR-ST-02', pumpType: 'Hand pump', requiredPressure: '24 bar', testStart: '08:15', includeIsometrics: true });
  assert.equal(created.status, 201);
  const request = (await created.json()).record as Row;
  const bad = await f.request('/api/records/hydrotest_requests', 'POST', { testSystemId: 'test-st', recordNo: 'HTR-ST-03', testStart: '8am' });
  assert.equal(bad.status, 422); assert.match((await bad.json()).fields.testStart, /time/);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { requestId: request.id, result: 'Passed', actualPressure: '24.2 bar', date: '2026-11-23' })).status, 201);
  const moved = await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-6'], testSystemId: 'test-st' }); assert.equal(moved.status, 201);
  const after = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  const iso4 = after.rows.isometrics.find(item => item.id === 'iso-4')!;
  assert.deepEqual(hydrotestState(iso4, after.rows), { inScope: true, completed: true });
  const wrongProject = await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-1'], testSystemId: 'test-st' });
  assert.equal(wrongProject.status, 422);
  const approved = await f.request(`/api/records/test_systems/test-sk`, 'PUT', { accepted: 'Approved', _version: after.rows.test_systems.find(item => item.id === 'test-sk')!._version }); assert.equal(approved.status, 200);
});

test('a document is attached to a request with one of the six types; others are refused', async t => {
  const f = await hostedFixture(t); await f.setup();
  const upload = (documentType: string) => { const body = new FormData(); body.set('file', new Blob(['%PDF-1.4 sample'], { type: 'application/pdf' }), 'blind-list.pdf'); body.set('entityType', 'hydrotest_requests'); body.set('entityId', 'hydrotest-cw-1'); body.set('documentType', documentType); return f.send('/api/files', 'POST', body, false); };
  const ok = await upload('Blind list'); assert.equal(ok.status, 201);
  const file = (await ok.json()).record as Row; assert.equal(file.documentType, 'Blind list');
  assert.equal((await upload('Lunch menu')).status, 422);
  assert.equal((await f.request(`/api/files/${file.id}`)).status, 200);
  const viewer = await hostedFixture(t); await viewer.setup(); await viewer.signIn('Hydro viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await viewer.send('/api/files', 'POST', (() => { const body = new FormData(); body.set('file', new Blob(['x']), 'a.txt'); body.set('entityType', 'hydrotest_requests'); body.set('entityId', 'hydrotest-cw-1'); body.set('documentType', 'Other'); return body; })(), false)).status, 403);
});

test('read-only welding sees test systems and requests but cannot write, record or move', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Hydro read only', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  for (const key of ['test_systems', 'hydrotest_requests']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  assert.equal((await f.request('/api/records/test_systems', 'POST', { name: 'DENIED-01' })).status, 403);
  assert.equal((await f.request('/api/records/hydrotest_requests', 'POST', { testSystemId: 'test-st', recordNo: 'DENIED-1' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { requestId: 'hydrotest-st-1', result: 'Passed', actualPressure: '24 bar', date: '2026-11-22' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-6'], testSystemId: 'test-st' })).status, 403);
  assert.equal(f.db.get('hydrotest_requests', 'hydrotest-st-1').result, ''); assert.equal(f.db.get('isometrics', 'iso-6').testSystemId, 'test-st');
});

test('moving isometrics needs the right on test systems and on isometrics; recording needs the hydrotest request right', async t => {
  const f = await hostedFixture(t); await f.setup();
  // Welding writes, but the shared isometrics are read only: the move would edit an isometric.
  await f.signIn('Hydro no iso edit', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read & write' });
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-6'], testSystemId: 'test-st' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { requestId: 'hydrotest-st-1', result: 'Passed', actualPressure: '24 bar', date: '2026-11-22' })).status, 201);
  // A detailed profile: test systems and isometrics editable, requests only readable.
  await f.signIn('Hydro detailed', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '64': ['show', 'edit'], '87': ['show', 'edit'], '74': ['show'] }) });
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-6'], testSystemId: 'test-st' })).status, 201);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { requestId: 'hydrotest-st-1', result: 'Passed', actualPressure: '24 bar', date: '2026-11-22' })).status, 403);
  assert.equal((await f.request('/api/records/hydrotest_requests', 'POST', { testSystemId: 'test-st', recordNo: 'DENIED-2' })).status, 403);
  await f.signIn('Hydro no requests', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '64': ['show'], '87': ['show'] }) });
  assert.equal((await f.request('/api/records/test_systems')).status, 200);
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 403);
});

test('inside MTO Pilot the hydrotest records and actions are refused in both directions', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Hydro both pilots', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 200);
  f.usePilot('mto');
  for (const key of ['test_systems', 'hydrotest_requests']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  assert.equal((await f.request('/api/records/hydrotest_requests', 'POST', { testSystemId: 'test-st', recordNo: 'MTO-1' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { requestId: 'hydrotest-st-1', result: 'Passed', actualPressure: '24 bar', date: '2026-11-22' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-6'], testSystemId: 'test-st' })).status, 403);
  const data = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  assert.equal(data.rows.hydrotest_requests, undefined); assert.equal(data.rows.test_systems, undefined);
  // An MTO-only account cannot enter Weld Pilot to reach them either.
  await f.signIn('Hydro mto only', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 403);
  f.usePilot('weld');
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 403, 'not enabled for Weld Pilot');
});

test('the welding demo profile does not deliver the hydrotest records or actions', async t => {
  const f = await hostedFixture(t, 'welding-demo'); await f.setup();
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 404);
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { isoIds: ['iso-6'], testSystemId: 'test-st' })).status, 404);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', {})).status, 404);
});
