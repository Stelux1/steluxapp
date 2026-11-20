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
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { HYDROTEST_DOCUMENT_TYPES, SPOOL_COLUMNS, hydrotestState, spoolColour, spoolFacts, spoolTestSystemId, testSystemColour, TS_NOT_APPLICABLE } from '../shared/hydrotest.ts';
import { spoolsOfSystem } from '../shared/hydrotest.ts';
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

test('a hydrotest release needs only its test system; the times are checked and nothing else is required', () => {
  const s = store();
  fails(() => s.create('hydrotest_requests', { recordNo: 'X-1' }), /Test system is required/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-1', testStart: '9:30' }), /Test start must be a time/);
  fails(() => s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-1', testEnd: '24:10' }), /Test end must be a time/);
  const created = s.create('hydrotest_requests', { testSystemId: 'test-cw', recordNo: 'X-1', testStart: '09:30', testEnd: '10:45' });
  assert.equal(created.includeIsometrics, false, 'Include isometric(s) starts unchecked'); assert.equal(created.result, '');
});

const actor = { id: 'u', name: 'Tester' };
const spoolOf = (s: Store, isoId: string) => s.list('spools').find(spool => spool.isoId === isoId)!;
const stateOf = (s: Store, isoId: string) => hydrotestState(s.get('isometrics', isoId), { test_systems: s.list('test_systems'), spools: s.list('spools'), hydrotest_requests: s.list('hydrotest_requests'), hydrotest_results: s.list('hydrotest_results'), releases: s.list('releases') });

test('hydrotest-move: spools of two isometrics of different projects go into one system; "----" clears it; the isometric follows its spools', () => {
  const s = store();
  const system = s.create('test_systems', { name: 'PTC 01' });
  const a = spoolOf(s, 'iso-1'), b = spoolOf(s, 'iso-4');
  assert.notEqual(s.get('isometrics', 'iso-1').projectId, s.get('isometrics', 'iso-4').projectId, 'two projects');
  const moved = runAction(s, 'hydrotest-move', { spoolIds: [a.id, b.id], testSystemId: system.id }, actor);
  assert.equal(moved.records!.length, 2);
  assert.equal(s.get('spools', a.id).testSystemId, system.id); assert.equal(s.get('spools', b.id).testSystemId, system.id);
  assert.equal(s.get('isometrics', 'iso-1').testSystemId, system.id, 'the isometric names the test system of its spools');
  // A follows its spools: PTC 01 is not set yet, so A is open (it left CW-01, which is approved).
  assert.deepEqual(stateOf(s, 'iso-1'), { inScope: true, completed: false });
  runAction(s, 'hydrotest-move', { spoolIds: [a.id], testSystemId: '' }, actor);
  assert.equal(s.get('spools', a.id).testSystemId, ''); assert.equal(s.get('isometrics', 'iso-1').testSystemId, '');
  assert.deepEqual(stateOf(s, 'iso-1'), { inScope: false, completed: false }, 'without a test system the isometric is out of scope');
  fails(() => runAction(s, 'hydrotest-move', { spoolIds: [], testSystemId: system.id }, actor), /at least one spool/);
  fails(() => runAction(s, 'hydrotest-move', { spoolIds: [b.id], testSystemId: 'nope' }, actor), /could not be found/);
});

test('hydrotestState follows every spool: two spools in two systems complete only when both systems are done', () => {
  const s = store();
  const extra = s.create('spools', { name: 'SP-001B', isoId: 'iso-1' });
  const open = s.create('test_systems', { name: 'PTC 02' });
  runAction(s, 'hydrotest-move', { spoolIds: [extra.id], testSystemId: open.id }, actor);
  assert.deepEqual(stateOf(s, 'iso-1'), { inScope: true, completed: false }, 'CW-01 is approved, PTC 02 is not');
  const draft = runAction(s, 'hydrotest-result', { testSystemId: open.id, accepted: false }, actor).record!;
  s.create('attachments', { name: 'signed.pdf', entityType: 'hydrotest_results', entityId: draft.id, documentType: 'Hydrotest result' });
  runAction(s, 'hydrotest-result', { testSystemId: open.id, accepted: true, resultId: draft.id }, actor);
  assert.deepEqual(stateOf(s, 'iso-1'), { inScope: true, completed: true });
});

test('a spool saved before spool level follows its isometric when read; nothing writes the value onto it', () => {
  const iso1 = row('iso', { testSystemId: 'ts' });
  assert.equal(spoolTestSystemId(row('sp', { isoId: 'iso' }), iso1), 'ts', 'no own value: the isometric decides');
  assert.equal(spoolTestSystemId(row('sp', { isoId: 'iso', testSystemId: '' }), iso1), '', 'an own empty value is kept');
  const s = store();
  // Two spools of iso-1 as an older workspace stored them: no test system of their own.
  const strip = (id: string) => { const { testSystemId: _removed, ...data } = s.get('spools', id); s.db.prepare('UPDATE "spools" SET data=? WHERE id=?').run(JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith('_') && key !== 'id'))), id); };
  const spool = spoolOf(s, 'iso-1'); strip(spool.id);
  const second = s.create('spools', { name: 'SP-001B', isoId: 'iso-1', diameter: '2' }); strip(second.id);
  const raw = () => s.db.prepare('SELECT id, data, version, updated_at FROM "spools" ORDER BY id').all();
  const stored = raw();
  seed(s);
  assert.deepEqual(raw(), stored, 'a local start writes nothing onto the spools');
  assert.equal(s.get('spools', spool.id).testSystemId, undefined);
  assert.deepEqual(spoolsOfSystem('test-cw', { spools: s.list('spools'), isometrics: s.list('isometrics') }).map(entry => entry.spool.id).filter(id => [spool.id, second.id].includes(id)).sort(), [spool.id, second.id].sort(), 'the Spools tab filter and the release take them in their isometric\'s system');
  assert.deepEqual(stateOf(s, 'iso-1').inScope, true);
  // Moving one of them leaves the other in the system it shows, although the isometric's own field follows the moved one.
  runAction(s, 'hydrotest-move', { spoolIds: [spool.id], testSystemId: 'test-st' }, actor);
  assert.equal(s.get('spools', spool.id).testSystemId, 'test-st');
  assert.equal(spoolTestSystemId(s.get('spools', second.id), s.get('isometrics', 'iso-1')), 'test-cw', 'the other spool stays in CW-01');
});

test('Enter results: every result stays in the history; Accepted ticked marks the system accepted and completes its spools', () => {
  const s = store();
  assert.deepEqual(['iso-4', 'iso-5', 'iso-6'].map(id => stateOf(s, id).completed), [false, false, false]);
  const first = runAction(s, 'hydrotest-result', { testSystemId: 'test-st', accepted: false }, actor).record!;
  assert.equal(first.accepted, false); assert.equal(s.get('test_systems', 'test-st').accepted, '', 'not accepted: the system stays as it was');
  assert.deepEqual(['iso-4', 'iso-5', 'iso-6'].map(id => stateOf(s, id).completed), [false, false, false]);
  // Approving needs the signed document first: refused without one, also on the test system's own form and for custom documents.
  fails(() => runAction(s, 'hydrotest-result', { testSystemId: 'test-st', accepted: true }, actor), /Upload the signed document/);
  fails(() => s.update('test_systems', 'test-st', { accepted: 'Approved' }, s.get('test_systems', 'test-st')._version, actor), /Upload the signed document/);
  s.create('attachments', { name: 'blinds.pdf', entityType: 'test_systems', entityId: 'test-st', documentType: 'Blind list' });
  fails(() => runAction(s, 'hydrotest-result', { testSystemId: 'test-st', accepted: true }, actor), /Upload the signed document/);
  assert.equal(s.get('test_systems', 'test-st').accepted, '', 'a refused approval changes nothing');
  assert.equal(s.list('hydrotest_results').filter(result => result.testSystemId === 'test-st').length, 1, 'and adds no result');
  s.create('attachments', { name: 'signed.pdf', entityType: 'hydrotest_results', entityId: first.id, documentType: 'Hydrotest result' });
  assert.deepEqual(['iso-4', 'iso-5', 'iso-6'].map(id => stateOf(s, id).completed), [false, false, false], 'a document alone does not finish it');
  const second = runAction(s, 'hydrotest-result', { testSystemId: 'test-st', accepted: true }, actor).record!;
  assert.equal(s.get('test_systems', 'test-st').accepted, 'Approved', 'Accepted? marks the system accepted by client');
  assert.deepEqual(['iso-4', 'iso-5', 'iso-6'].map(id => stateOf(s, id).completed), [true, true, true]);
  // The earlier, not accepted result is not overwritten by the later one (scenario SB S8).
  assert.deepEqual(s.list('hydrotest_results').filter(result => result.testSystemId === 'test-st').map(result => [result.id, result.accepted]).sort(), [[first.id, false], [second.id, true]].sort());
  fails(() => runAction(s, 'hydrotest-result', { testSystemId: 'test-st', accepted: 'yes' }, actor), /checked or unchecked/);
  fails(() => runAction(s, 'hydrotest-result', { testSystemId: 'missing', accepted: true }, actor), /could not be found/);
  // Taking the approval off reopens the system and takes the acceptance off its results.
  s.update('test_systems', 'test-st', { accepted: '' }, s.get('test_systems', 'test-st')._version, actor);
  assert.deepEqual(['iso-4', 'iso-5', 'iso-6'].map(id => stateOf(s, id).completed), [false, false, false]);
  assert.equal(s.get('hydrotest_results', second.id).accepted, false);
  // Files of a result are PDFs only; deleting a result archives its files.
  const file = s.list('attachments').find(item => item.entityId === first.id)!;
  fails(() => s.create('attachments', { name: 'signed.png', entityType: 'hydrotest_results', entityId: first.id, documentType: 'Hydrotest result' }), /Only PDFs/);
  runAction(s, 'hydrotest-result-delete', { resultId: first.id }, actor);
  assert.equal(s.get('hydrotest_results', first.id, true)._archived, true); assert.equal(s.get('attachments', file.id, true)._archived, true);
});

test('hydrotest-release stores the dialog values, the spools of the system and the ticked document types', () => {
  const s = store();
  s.create('attachments', { name: 'blinds.pdf', entityType: 'test_systems', entityId: 'test-st', documentType: 'Blind list' });
  const record = runAction(s, 'hydrotest-release', { testSystemId: 'test-st', pumpType: 'Hand pump', requiredPressure: '24 barg', includeIsometrics: false, includeDocuments: ['Blind list'] }, actor).record!;
  assert.match(String(record.recordNo), /^HTR-\d{4}-\d{4}$/, 'an empty test record no. gets the next number');
  assert.equal(record.pumpType, 'Hand pump'); assert.equal(record.includeIsometrics, false);
  assert.deepEqual(JSON.parse(String(record.includeDocuments)), ['Blind list']);
  assert.deepEqual(JSON.parse(String(record.spoolIds)).sort(), s.list('spools').filter(spool => ['iso-4', 'iso-5', 'iso-6'].includes(String(spool.isoId))).map(spool => spool.id).sort());
  fails(() => runAction(s, 'hydrotest-release', { testSystemId: 'test-st', includeDocuments: ['Lunch menu'] }, actor), /Choose documents of these types/);
  fails(() => runAction(s, 'hydrotest-release', { testSystemId: 'test-st', testStart: 'noon' }, actor), /Test start must be a time/);
});

test('custom documents belong to the test system: one of the six types, PDF only; Check for delete removes them', () => {
  const s = store();
  assert.deepEqual(HYDROTEST_DOCUMENT_TYPES, ['Punchlist', 'Pressure test ITP', 'Blind list', 'Pressure gauge/recorder calibration cert.', 'Piping and instrumentation diagram (P&ID)', '3D snippet']);
  const files = HYDROTEST_DOCUMENT_TYPES.map(type => s.create('attachments', { name: `${type.slice(0, 5)}.pdf`, entityType: 'test_systems', entityId: 'test-cw', documentType: type }));
  fails(() => s.create('attachments', { name: 'x.pdf', entityType: 'test_systems', entityId: 'test-cw', documentType: 'Menu' }), /Choose one of/);
  fails(() => s.create('attachments', { name: 'x.docx', entityType: 'test_systems', entityId: 'test-cw', documentType: 'Punchlist' }), /Only PDFs/);
  // Documents attached to a request before keep their earlier types; other records are unaffected.
  s.create('attachments', { name: 'x.pdf', entityType: 'hydrotest_requests', entityId: 'hydrotest-cw-1', documentType: 'Other' });
  s.create('attachments', { name: 'y.png', entityType: 'isometrics', entityId: 'iso-1', documentType: 'Anything' });
  runAction(s, 'hydrotest-documents', { testSystemId: 'test-cw', deleteIds: [files[0].id, files[2].id] }, actor);
  assert.deepEqual(files.map(file => s.get('attachments', file.id, true)._archived), [true, false, true, false, false, false]);
  const other = s.create('attachments', { name: 'z.pdf', entityType: 'test_systems', entityId: 'test-st', documentType: 'Punchlist' });
  fails(() => runAction(s, 'hydrotest-documents', { testSystemId: 'test-cw', deleteIds: [other.id] }, actor), /Only documents of this test system/);
});

test('colours: Approved green, Testing not applicable red, Not set blue; a spool without a system red', () => {
  assert.equal(testSystemColour(row('a', { accepted: 'Approved' })), 'green');
  assert.equal(testSystemColour(row('b', { accepted: TS_NOT_APPLICABLE })), 'red');
  assert.equal(testSystemColour(row('c', { accepted: '' })), 'blue');
  assert.equal(spoolColour(undefined), 'red'); assert.equal(spoolColour(row('a', { accepted: 'Approved' })), 'green');
});

// ----- delivery ------------------------------------------------------------------------------------------------

test('the hosted profile delivers the hydrotest release and the other profiles do not change', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual(hosted.resources.test_systems, ['name', 'description', 'accepted'], 'the reference form: no Project, Test medium or Test pressure');
  assert.ok(hosted.resources.spools.includes('testSystemId'));
  for (const key of ['hydrotest_requests', 'hydrotest_results']) { assert.ok(RESOURCE_MAP[key].fields.every(field => hosted.resources[key].includes(field.name)), key); assert.ok(!hosted.navigation.includes(key), key); }
  for (const key of ['hydrotest-move', 'hydrotest-release', 'hydrotest-result', 'hydrotest-result-delete', 'hydrotest-documents']) { assert.ok(ACTIONS[key], key); assert.ok(hosted.actions[key], key); }
  for (const profile of ['welding-demo', 'access-prototype'] as const) {
    const other = availabilityFor(profile)!;
    assert.equal(other.resources.hydrotest_requests, undefined, profile); assert.equal(other.actions['hydrotest-move'], undefined, profile);
    assert.ok(!other.resources.test_systems?.includes('accepted'), profile);
    assert.ok(!other.resources.spools?.includes('testSystemId'), profile);
  }
  assert.deepEqual(availabilityFor('access-prototype')!.resources.test_systems, ['name', 'projectId', 'medium', 'pressure', 'description']);
  assert.equal(availabilityFor('full'), undefined);
  const item = PILOT_MAP.weld.groups.find(group => group.title === 'Releases')!.items.find(entry => entry.label === 'Hydrotest release')!;
  assert.equal(pilotItemPath(item), '/welding/test_systems');
  assert.ok(!PILOT_MAP.mto.groups.some(group => group.items.some(entry => entry.label === 'Hydrotest release')));
});

test('the reference labels and order are used for the test system form and the hydrotest release dialog', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const form = projectResource(hosted, RESOURCE_MAP.test_systems).fields;
  assert.deepEqual(form.map(field => [field.label, field.required === true]), [['Test system', true], ['Description', false], ['Test system accepted by client', false]]);
  assert.equal(form.find(field => field.name === 'description')!.type, 'textarea', 'plain multi-line description');
  assert.deepEqual(form[2].options, [TS_NOT_APPLICABLE, 'Approved']); assert.equal(form[2].blank, '-- Not set --');
  assert.deepEqual(new Set(form.map(field => field.section || 'Details')).size, 1, 'one form, no sections');
  const dialog = ACTIONS['hydrotest-release'].fields.filter(field => !field.hidden);
  assert.deepEqual(dialog.map(field => field.label), ['QA/QC engineer', 'Test record no.', 'Pump type', 'Hose type', 'Manifold', 'Pressure gauge no.', 'Recorder No', 'Calibration cert', 'Piping class', 'Design code', 'Test medium', 'Required Test pressure', 'Actual Test pressure', 'Date', 'Test start', 'Test end', 'Area temp', 'Test duration', 'Required Leak Test Pressure', 'Leak Test duration', 'Note', 'Include isometric(s)', 'Include files in hydrotest release']);
  assert.ok(dialog.every(field => !field.required), 'no field is required');
  assert.equal(dialog.find(field => field.name === 'includeIsometrics')!.default, false, 'Include isometric(s) unchecked');
  assert.deepEqual(SPOOL_COLUMNS, ['Project', 'ISO', 'Spool', 'Diameter', 'Paint spec.', 'Asset tag', 'Test pressure', 'Test system', 'Check']);
  assert.deepEqual(ACTIONS['hydrotest-move'].fields.map(field => [field.label, field.required === true]), [['Spools', true], ['Test system', false]]);
  assert.equal(ACTIONS['hydrotest-move'].fields[1].blank, '----');
  assert.deepEqual(ACTIONS['hydrotest-result'].fields.map(field => field.label), ['Test system', 'Accepted?', 'Result']);
});

test('the Spools tab row: Paint spec., Asset tag and Test pressure of the isometric', () => {
  const iso1 = row('i', { isoNo: '0001', assetTag: 'N011-HV10001-0001', testPressure: '29', paintSpec: 'A10' });
  assert.deepEqual(spoolFacts(row('s', { name: 'SP01', diameter: 'ND250' }), iso1, row('p', { internnumber: '20240101' })), ['20240101', '0001', 'SP01', 'ND250', 'A10', 'N011-HV10001-0001', '29']);
  assert.equal(spoolFacts(row('s', { name: 'SP01', paintSpec: 'PS-02' }), iso1, undefined)[4], 'A10', 'a stored copy on the spool does not win (mto-catalogs-022)');
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

const pdf = () => new Blob(['%PDF-1.4 sample'], { type: 'application/pdf' });
const upload = (f: Awaited<ReturnType<typeof hostedFixture>>, entityType: string, entityId: string, documentType: string, name = 'signed.pdf') => { const body = new FormData(); body.set('file', pdf(), name); body.set('entityType', entityType); body.set('entityId', entityId); body.set('documentType', documentType); return f.send('/api/files', 'POST', body, false); };

test('Weld Pilot account: moves spools, makes a hydrotest release, enters a result and sees the new status through the API', async t => {
  const f = await hostedFixture(t); await f.setup();
  const data = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  assert.ok(data.rows.test_systems.some(system => system.accepted === 'Approved'));
  assert.ok(data.rows.test_systems.every(system => system.projectId === undefined && system.medium === undefined), 'Project and Test medium are not delivered');
  assert.ok(data.rows.spools.every(spool => 'testSystemId' in spool));
  const spool4 = data.rows.spools.find(spool => spool.isoId === 'iso-4')!, spool1 = data.rows.spools.find(spool => spool.isoId === 'iso-1')!;
  // Spools of two projects in one system: no same-project rule.
  const moved = await f.request('/api/actions/hydrotest-move', 'POST', { spoolIds: [spool1.id, spool4.id], testSystemId: 'test-st' }); assert.equal(moved.status, 201, await moved.clone().text());
  const release = await f.request('/api/actions/hydrotest-release', 'POST', { testSystemId: 'test-st', recordNo: 'HTR-ST-02', pumpType: 'Hand pump', requiredPressure: '24 bar', testStart: '08:15', includeIsometrics: true, includeDocuments: [] });
  assert.equal(release.status, 201, await release.clone().text());
  const record = (await release.json()).record as Row;
  const book = await f.request(`/api/pdf/hydrotest-request?requestId=${record.id}`); assert.equal(book.status, 200);
  const refused = await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: true }); assert.equal(refused.status, 422, 'no signed document yet: no approval');
  const result = await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: false }); assert.equal(result.status, 201, await result.clone().text());
  const entered = (await result.json()).record as Row;
  assert.equal((await upload(f, 'hydrotest_results', entered.id, 'Hydrotest result')).status, 201);
  assert.equal((await upload(f, 'hydrotest_results', entered.id, 'Hydrotest result', 'photo.png')).status, 422, 'only PDFs');
  const approve = await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: true, resultId: entered.id }); assert.equal(approve.status, 201, await approve.clone().text());
  const after = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]>; isoSummaries?: Record<string, { hydrotest: { completed: boolean } }> };
  for (const id of ['iso-1', 'iso-4']) assert.deepEqual(hydrotestState(after.rows.isometrics.find(item => item.id === id)!, after.rows), { inScope: true, completed: true }, id);
  assert.equal(after.isoSummaries?.['iso-4']?.hydrotest.completed, true, 'the server summary follows the spools too');
  assert.equal(after.rows.test_systems.find(item => item.id === 'test-st')!.accepted, 'Approved');
});

test('custom documents are attached to the test system with one of the six types, PDF only; others are refused', async t => {
  const f = await hostedFixture(t); await f.setup();
  const ok = await upload(f, 'test_systems', 'test-cw', 'Blind list', 'blind-list.pdf'); assert.equal(ok.status, 201);
  const file = (await ok.json()).record as Row; assert.equal(file.documentType, 'Blind list');
  assert.equal((await upload(f, 'test_systems', 'test-cw', 'Lunch menu')).status, 422);
  assert.equal((await upload(f, 'test_systems', 'test-cw', 'Punchlist', 'list.xlsx')).status, 422);
  assert.equal((await f.request(`/api/files/${file.id}`)).status, 200);
  const deleted = await f.request('/api/actions/hydrotest-documents', 'POST', { testSystemId: 'test-cw', deleteIds: [file.id] }); assert.equal(deleted.status, 201, await deleted.clone().text());
  assert.equal(f.db.get('attachments', file.id, true)._archived, true);
  const viewer = await hostedFixture(t); await viewer.setup(); await viewer.signIn('Hydro viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await upload(viewer, 'test_systems', 'test-cw', 'Punchlist')).status, 403);
});

test('read-only welding sees test systems, releases and results but cannot write, enter or move', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Hydro read only', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  for (const key of ['test_systems', 'hydrotest_requests', 'hydrotest_results']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  assert.equal((await f.request('/api/records/test_systems', 'POST', { name: 'DENIED-01' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-release', 'POST', { testSystemId: 'test-st' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: true })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { spoolIds: ['spool-6'], testSystemId: 'test-cw' })).status, 403);
  assert.equal(f.db.get('test_systems', 'test-st').accepted, ''); assert.equal(f.db.get('spools', 'spool-6').testSystemId, 'test-st');
});

test('moving spools needs the right on test systems and on isometrics; results need the hydrotest request right', async t => {
  const f = await hostedFixture(t); await f.setup();
  // Welding writes, but the shared isometrics are read only: the move would edit an isometric.
  await f.signIn('Hydro no iso edit', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read & write' });
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { spoolIds: ['spool-6'], testSystemId: 'test-cw' })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: false })).status, 201);
  // A detailed profile: test systems and isometrics editable, hydrotest requests only readable.
  await f.signIn('Hydro detailed', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '10': ['show', 'edit'], '64': ['show', 'edit'], '87': ['show', 'edit'], '74': ['show'] }) });
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { spoolIds: ['spool-6'], testSystemId: 'test-cw' })).status, 201);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: true })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-release', 'POST', { testSystemId: 'test-st' })).status, 403);
  await f.signIn('Hydro no requests', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '64': ['show'], '87': ['show'] }) });
  assert.equal((await f.request('/api/records/test_systems')).status, 200);
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 403);
  assert.equal((await f.request('/api/records/hydrotest_results')).status, 403);
});

test('inside MTO Pilot the hydrotest records and actions are refused in both directions', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Hydro both pilots', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  assert.equal((await f.request('/api/records/hydrotest_requests')).status, 200);
  f.usePilot('mto');
  for (const key of ['test_systems', 'hydrotest_requests', 'hydrotest_results']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: true })).status, 403);
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { spoolIds: ['spool-6'], testSystemId: 'test-cw' })).status, 403);
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
  assert.equal((await f.request('/api/actions/hydrotest-move', 'POST', { spoolIds: ['spool-6'], testSystemId: 'test-st' })).status, 404);
  assert.equal((await f.request('/api/actions/hydrotest-result', 'POST', {})).status, 404);
});

test('the Shop Welds driver counts a weld as welded with a welder and the weld date (client, 17.11.2026)', () => {
  const types = [row('ws', { location: 'Shop' })], diameters = [row('d2', { sizeinch: 2 })];
  const weld = (id: string, data: Record<string, unknown>) => row(id, { isoId: 'iso', typeId: 'ws', diameterId: 'd2', lengthMode: 'Diameter', ...data });
  const welds = (progress: ReturnType<typeof isoProgress>) => progress.phases[0].drivers.find(item => item.key === 'welds')!.progress;
  assert.equal(welds(isoProgress(input({ weldTypes: types, diameters, welds: [weld('a', { welder1Id: 'w', date: '2026-11-01' }), weld('b', { welder1Id: 'w', date: '' })] }))), 0.5, 'the weld without a date is not welded yet');
});
