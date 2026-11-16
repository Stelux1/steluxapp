import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { isoBlockers } from '../shared/iso-status.ts';
import { punchBlocking, punchCounts, punchKind } from '../shared/punch.ts';
import { isoListContext, prefabFlag, fieldFlag } from '../shared/iso-list.ts';
import { canAction } from '../shared/permissions.ts';
import { ACTIONS } from '../shared/actions.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import {
  activeRelease, csvCell, fwpAccepts, fwpListRows, phaseState, punchBlocksRelease, releaseArchiveRows, releaseCheck, releaseDocumentData, releaseDocumentNumber, releaseListRows,
  signatureTitlesOf, storedSignatureTitles, toCsv, weldLocked, weldLockReason, weldPhase,
} from '../shared/releases.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data }) as Row;
const weldTypes = [row('wt-shop', { location: 'Shop' }), row('wt-field', { location: 'Field' }), row('wt-none', {})];
const iso = row('iso', { isoNo: 'CW-001', projectId: 'p1', drawingNo: 'DWG-1', itpNo: 'ITP-01', itpNo2: 'ITP-NDT-01' });
/** A weld with everything the release needs, so a test breaks only the field it is about. */
const weld = (id: string, data: Record<string, unknown> = {}) => row(id, { weldNo: id.toUpperCase(), isoId: 'iso', typeId: 'wt-shop', welder1Id: 'w1', wpsId: 'wps', date: '2026-10-05', lengthMode: 'Diameter', diameterId: 'd4', chargeNo1: 'H1', chargeNo2: 'H2', ndoReq: false, ...data });
const result = (weldId: string, outcome: string, date = '2026-10-06') => row(`${weldId}-${date}-${outcome}`, { weldId, type: 'NDT', result: outcome, date });
const input = (extra: Record<string, unknown> = {}) => ({ iso, welds: [weld('s1', { ndoReq: true }), weld('f1', { typeId: 'wt-field' })], weldTypes, results: [result('s1', 'Accepted')], releases: [] as Row[], punch: [] as Row[], ...extra });

// ----- weld locking ----------------------------------------------------------------------------------------------

test('weldLocked: shop welds lock with Prefab complete, field welds with Field complete; an active release from before counts; Reopen and other isometrics unlock', () => {
  const shop = weld('s1'), field = weld('f1', { typeId: 'wt-field' });
  const prefab = row('r1', { isoId: 'iso', type: 'Prefab' }), fieldRelease = row('r2', { isoId: 'iso', type: 'Field' });
  const completed = (data: Record<string, unknown>) => ({ ...iso, ...data }) as Row;
  assert.equal(weldLocked(shop, iso, [], weldTypes), false);
  // Complete on the isometric locks without any release record (reference 0003: locked while "Release not available").
  assert.equal(weldLocked(shop, completed({ prefabCompletedAt: '2026-11-02T08:00:00.000Z' }), [], weldTypes), true);
  assert.equal(weldLocked(field, completed({ prefabCompletedAt: '2026-11-02T08:00:00.000Z' }), [], weldTypes), false, 'Prefab complete does not lock field welds');
  assert.equal(weldLocked(field, completed({ fieldCompletedAt: '2026-11-02T08:00:00.000Z' }), [], weldTypes), true);
  assert.equal(weldLockReason(shop, completed({ prefabCompletedAt: '2026-11-02T08:00:00.000Z' }), [], weldTypes), 'Locked after Prefab complete');
  assert.equal(weldLockReason(field, completed({ fieldCompletedAt: '2026-11-02T08:00:00.000Z' }), [], weldTypes), 'Locked after Field complete');
  // Releases from before the two steps.
  assert.equal(weldLocked(shop, iso, [prefab], weldTypes), true);
  assert.equal(weldLocked(field, iso, [prefab], weldTypes), false, 'a Prefab release does not lock field welds');
  assert.equal(weldLocked(field, iso, [fieldRelease], weldTypes), true);
  assert.equal(weldLocked(shop, iso, [fieldRelease], weldTypes), false, 'a Field release does not lock shop welds');
  assert.equal(weldLocked(field, iso, [{ ...fieldRelease, status: 'Reopened' }], weldTypes), false, 'Reopen unlocks the phase');
  assert.equal(weldLocked(field, iso, [{ ...fieldRelease, _archived: true }], weldTypes), false);
  assert.equal(weldLocked(field, iso, [{ ...fieldRelease, isoId: 'other' }], weldTypes), false);
  assert.equal(weldLocked(field, row('other'), [fieldRelease], weldTypes), false, 'the weld belongs to another isometric');
  assert.equal(weldLocked(field, undefined, [fieldRelease], weldTypes), true, 'the isometric is taken from the weld when not given');
  assert.equal(weldLocked(weld('n1', { typeId: 'wt-none' }), completed({ prefabCompletedAt: 'x', fieldCompletedAt: 'x' }), [prefab, fieldRelease], weldTypes), false, 'a weld without a location is in no phase');
  assert.equal(weldLocked(field, iso, [fieldRelease]), false, 'without weld types no weld can be placed in a phase');
  assert.equal(weldLocked(field, iso, null, weldTypes), false);
  assert.equal(weldPhase(shop, weldTypes), 'shop');
  assert.equal(weldLockReason(field, iso, [fieldRelease], weldTypes), 'Locked after Field complete');
  assert.equal(weldLockReason(shop, iso, [prefab], weldTypes), 'Locked after Prefab complete');
  assert.equal(weldLockReason(shop, iso, [], weldTypes), '');
  assert.equal(activeRelease([{ ...prefab, status: 'Reopened' }, row('r3', { isoId: 'iso', type: 'Prefab', status: 'Released' })], 'iso', 'Prefab')?.id, 'r3');
});

// ----- what blocks a release -------------------------------------------------------------------------------------

test('Prefab complete becomes available when every weld has a shop / field type, the shop welds are welded, required NDT has a result and no repair is open (manual rules)', () => {
  assert.equal(releaseCheck('Prefab', input()).ready, true);
  // Field welds never hold Prefab, whatever their state.
  assert.equal(releaseCheck('Prefab', input({ welds: [weld('s1'), weld('f1', { typeId: 'wt-field', welder1Id: '', ndoReq: true })] })).ready, true);
  const reasons = (extra: Record<string, unknown>) => releaseCheck('Prefab', input(extra)).reasons;
  assert.deepEqual(reasons({ welds: [weld('s1', { welder1Id: '' })] }).map(reason => [reason.group, reason.message]), [['welds', 'Weld S1 has not been welded yet.']]);
  assert.deepEqual(reasons({ welds: [weld('s1', { date: '', chargeNo2: '' })] }), [], 'missing optional weld fields do not hold the phase (they stay in the blockers list)');
  assert.deepEqual(reasons({ results: [] }).map(reason => reason.group), ['ndt']);
  assert.deepEqual(reasons({ results: [result('s1', 'Rejected')] }).map(reason => reason.group), ['repair']);
  assert.deepEqual(reasons({ results: [result('s1', 'Rejected', '2026-10-06'), result('s1', 'Accepted', '2026-10-09')] }), [], 'a later accepted result closes the repair');
  assert.deepEqual(reasons({ welds: [weld('s1', { ndoReqPre: true, ndoReq: false })], results: [] }).map(reason => reason.message), ['NDT PRE on weld S1 has no result']);
  // No shop welds: available (vacuous); a weld without a shop / field type holds Prefab (reference tooltip of 0001).
  assert.deepEqual(reasons({ welds: [] }), []);
  assert.deepEqual(reasons({ welds: [weld('f1', { typeId: 'wt-field' })] }), []);
  assert.deepEqual(reasons({ welds: [weld('n1', { typeId: 'wt-none' }), weld('n2', { typeId: '' })] }).map(reason => [reason.group, reason.message, reason.weldId]), [['welds', 'Weld N1 has no type — assign shop or field.', 'n1'], ['welds', 'Weld N2 has no type — assign shop or field.', 'n2']]);
  assert.equal(reasons({ welds: [weld('s1', { _archived: true })] }).length, 0, 'a deleted weld does not count');
  // Reasons carry the weld so the page can open it, and come in the order of the blockers list; punch is not one of them.
  const many = reasons({ welds: [weld('s1', { welder1Id: '', ndoReq: true }), weld('s2', { date: '', ndoReq: true })], results: [], punch: [row('p1', { isoId: 'iso', category: 'A', status: 'Open', punchType: 'Pre-punch' })] });
  assert.deepEqual(many.map(reason => reason.group), ['welds', 'ndt', 'ndt']);
  assert.equal(many[0].weldId, 's1');
});

test('open punch never holds Complete or the release; it stays in the blockers list (punch flow rules)', () => {
  const items: Row[] = [];
  for (const status of ['Open', 'In progress', 'Finished', 'Completed', 'Passed', 'Removed']) for (const category of ['A — Immediate fix (blocking)', 'B', '', 'C — Fix (non-blocking)', 'D']) for (const punchType of ['Pre-punch', 'Punch', '']) items.push(row(`p${items.length}`, { isoId: 'iso', status, category, punchType }));
  for (const item of items) assert.equal(punchBlocksRelease(item), punchKind(item) === 'Pre-punch' && punchBlocking([item]).length === 1, JSON.stringify(item));
  assert.equal(items.filter(punchBlocksRelease).length, punchCounts(items.filter(item => punchKind(item) === 'Pre-punch')).blocking, 'the open blocking pre-punch items the punch flow counts');
  const blocker = isoBlockers({ iso, welds: [], weldTypes, diameters: [], results: [], releases: [], punch: items }).groups.find(group => group.key === 'punch');
  assert.equal(blocker?.count, punchBlocking(items).length, 'the isometric blocker counts the open A/B items of both types');
  assert.equal(releaseCheck('Prefab', input({ punch: items })).ready, true);
  assert.equal(releaseCheck('Field', input({ punch: items, iso: { ...iso, prefabCompletedAt: '2026-11-02T08:00:00.000Z' } })).ready, true);
});

test('pre-punch: open A and B items are the warning, C, closed and other isometrics are not; items without a type are punch items', () => {
  const item = (data: Record<string, unknown>) => row('p', { isoId: 'iso', category: 'A', status: 'Open', punchType: 'Pre-punch', ...data });
  assert.equal(punchBlocksRelease(item({})), true);
  assert.equal(punchBlocksRelease(item({ category: 'B', status: 'In progress' })), true);
  assert.equal(punchBlocksRelease(item({ category: 'C' })), false);
  assert.equal(punchBlocksRelease(item({ status: 'Completed' })), false);
  assert.equal(punchBlocksRelease(item({ status: 'Finished' })), false);
  assert.equal(punchBlocksRelease(item({ status: 'Passed' })), false);
  assert.equal(punchBlocksRelease(item({ status: 'Removed' })), false);
  assert.equal(punchBlocksRelease(item({ punchType: '' })), false, 'items saved before the type existed are Punch items (shared/punch.ts punchKind)');
  assert.equal(punchBlocksRelease(item({ category: '' })), true, 'a missing category reads as B');
  assert.equal(punchBlocksRelease(item({ punchType: 'Punch' })), false, 'a punch item (after the field work) is not a pre-punch item');
  assert.equal(punchBlocksRelease(item({ _archived: true })), false);
  // weld-releases-004 / weld-punch-flanges-007: an open pre-punch A item does not hold Complete.
  const check = releaseCheck('Prefab', input({ punch: [item({}), item({ category: 'B' })] }));
  assert.deepEqual([check.ready, check.reasons.filter(reason => reason.group === 'punch').length], [true, 0]);
  assert.ok(isoBlockers({ iso, welds: [], weldTypes, diameters: [], results: [], releases: [], punch: [item({})] }).groups.some(group => group.key === 'punch'), 'the blockers list keeps the punch group');
});

test('Field complete needs Prefab complete first, then the field welds as for prefab; no field welds is vacuous', () => {
  const field = weld('f1', { typeId: 'wt-field' });
  const prefabDone = { ...iso, prefabCompletedAt: '2026-11-02T08:00:00.000Z' };
  const withShop = (extra: Record<string, unknown> = {}) => input({ welds: [weld('s1'), field], results: [], ...extra });
  assert.deepEqual(releaseCheck('Field', withShop()).reasons.map(reason => [reason.group, reason.message]), [['release', 'Prefab complete is required first']]);
  assert.equal(releaseCheck('Field', withShop({ iso: prefabDone })).ready, true);
  assert.equal(releaseCheck('Field', withShop({ releases: [row('r1', { isoId: 'iso', type: 'Prefab' })] })).ready, true, 'an active Prefab release from before counts as complete');
  assert.equal(releaseCheck('Field', withShop({ releases: [row('r1', { isoId: 'iso', type: 'Prefab', status: 'Reopened' })] })).ready, false);
  assert.equal(releaseCheck('Field', withShop({ releases: [row('r', { isoId: 'iso', type: 'Hydrotest' })] })).ready, false);
  // Also without shop welds: Prefab complete comes first (manual: "Field complete becomes available only after Prefab complete").
  assert.deepEqual(releaseCheck('Field', input({ welds: [field], results: [] })).reasons.map(reason => reason.message), ['Prefab complete is required first']);
  assert.equal(releaseCheck('Field', input({ welds: [field], results: [], iso: prefabDone })).ready, true);
  assert.equal(releaseCheck('Field', input({ welds: [], iso: prefabDone })).ready, true, 'no field welds: vacuous');
  // The same weld rules as prefab, on the field welds only.
  const open = releaseCheck('Field', input({ iso: prefabDone, welds: [weld('f1', { typeId: 'wt-field', ndoReq: true }), weld('s1', { welder1Id: '' })], results: [] }));
  assert.deepEqual(open.reasons.map(reason => reason.group), ['ndt']);
});

test('phaseState: "Prefab not ready", the "Prefab complete" button, "Prefab completed" (also with a release document); the same for Field', () => {
  assert.deepEqual([phaseState('Prefab', input()).state, phaseState('Prefab', input()).label], ['ready', 'Prefab complete']);
  assert.deepEqual([phaseState('Prefab', input({ results: [] })).state, phaseState('Prefab', input({ results: [] })).label], ['not-ready', 'Prefab not ready']);
  assert.equal(phaseState('Prefab', input({ welds: [weld('f1', { typeId: 'wt-field' })] })).state, 'ready', 'no shop welds: available');
  assert.deepEqual([phaseState('Field', input()).state, phaseState('Field', input()).label], ['not-ready', 'Field not ready']);
  const done = phaseState('Prefab', input({ iso: { ...iso, prefabCompletedAt: '2026-11-02T08:00:00.000Z', prefabCompletedBy: 'Mila Kovač' } }));
  assert.deepEqual([done.state, done.label, done.completion, done.release], ['completed', 'Prefab completed', { at: '2026-11-02T08:00:00.000Z', by: 'Mila Kovač' }, undefined]);
  const released = phaseState('Prefab', input({ releases: [row('r', { isoId: 'iso', type: 'Prefab', number: 'REL-1', releasedBy: 'Sara Jansen', releasedAt: '2026-11-03T08:00:00.000Z' })] }));
  assert.deepEqual([released.state, released.label, released.release?.number, released.completion?.by], ['released', 'Prefab completed', 'REL-1', 'Sara Jansen']);
  assert.equal(phaseState('Field', input({ iso: { ...iso, fieldCompletedAt: '2026-11-02T08:00:00.000Z' } })).label, 'Field completed');
  assert.equal(phaseState('Field', input({ releases: [row('r', { isoId: 'iso', type: 'Field', status: 'Reopened' })] })).state, 'not-ready', 'reopened: back to the checks');
});

test('a reopened release no longer counts for the isometric blockers or the list flags', () => {
  const welds = [weld('s1')];
  const released = row('r', { isoId: 'iso', type: 'Prefab' });
  const status = (releases: Row[]) => isoBlockers({ iso, welds, weldTypes, diameters: [], results: [], releases }).groups.find(group => group.key === 'release')?.items.map(item => item.message);
  assert.deepEqual(status([released]), ['Field is not released yet']);
  assert.deepEqual(status([{ ...released, status: 'Reopened' }]), ['Prefab is not released yet', 'Field is not released yet'], 'the Release blocker returns');
  const flags = (releases: Row[]) => { const ctx = isoListContext({ welds, weldTypes, releases }); return [prefabFlag(iso, ctx), fieldFlag(iso, ctx)]; };
  assert.deepEqual(flags([released]), [true, 'ready']);
  assert.deepEqual(flags([{ ...released, status: 'Reopened' }]), ['ready', 'ready']);
});

// ----- the release pages -----------------------------------------------------------------------------------------

test('release list: only isometrics whose phase is completed; released ones only with Show released; filters by project and ITP', () => {
  const done = { prefabCompletedAt: '2026-11-02T08:00:00.000Z' };
  const isometrics = [row('a', { isoNo: 'CW-010', projectId: 'p1', itpNo: 'ITP-01', ...done }), row('b', { isoNo: 'CW-002', projectId: 'p2', itpNo2: 'ITP-NDT-07', ...done }), row('c', { isoNo: 'CW-003', projectId: 'p1', itpNo: 'itp-02' }), row('d', { isoNo: 'CW-004', projectId: 'p1' })];
  const source = { isometrics, projects: [row('p1', { internnumber: 'STX-1' }), row('p2')], spools: [row('s1', { isoId: 'a', name: 'SP-10' }), row('s2', { isoId: 'a', name: 'SP-2' }), row('s3', { isoId: 'a', name: 'SP-X', _archived: true })],
    welds: [weld('wa', { isoId: 'a' }), weld('wb', { isoId: 'b' }), weld('wc', { isoId: 'c' }), weld('wd', { isoId: 'd' })], weldTypes, results: [], releases: [row('r', { isoId: 'c', type: 'Prefab' }), row('r2', { isoId: 'b', type: 'Field' })] };
  const list = (filters = {}) => releaseListRows('Prefab', source, filters);
  // d is ready but not completed: never listed (reference: 1 of 235 isometrics, the one 'Prefab completed').
  assert.deepEqual(list().map(entry => entry.iso.isoNo), ['CW-002', 'CW-010'], 'natural order, released CW-003 hidden');
  assert.deepEqual(list({ show: 'show' }).map(entry => entry.iso.isoNo), ['CW-002', 'CW-003', 'CW-010'], 'CW-004 is not completed, also with Show released');
  assert.equal(list({ show: 'show' }).find(entry => entry.iso.id === 'c')?.release?.id, 'r');
  assert.deepEqual(list({ projectId: 'p1', show: 'show' }).map(entry => entry.iso.isoNo), ['CW-003', 'CW-010']);
  assert.deepEqual(list({ itpNo: 'ITP-NDT' }).map(entry => entry.iso.isoNo), ['CW-002'], 'ITP No 2 is searched too');
  assert.deepEqual(list({ itpNo: 'itp-02', show: 'show' }).map(entry => entry.iso.isoNo), ['CW-003'], 'case-insensitive');
  const a = list().find(entry => entry.iso.id === 'a')!;
  assert.equal(a.spools, 'SP-2, SP-10'); assert.equal(a.project?.internnumber, 'STX-1');
  // The Field page lists the Field completed ones: b by its release from before the two steps (hidden), nothing else.
  assert.deepEqual(releaseListRows('Field', source).map(entry => entry.iso.isoNo), []);
  assert.deepEqual(releaseListRows('Field', source, { show: 'show' }).map(entry => entry.iso.isoNo), ['CW-002']);
});

test('request archive: inclusive date range, type, newest first, archived records left out', () => {
  const releases = [row('a', { date: '2026-10-01', type: 'Prefab' }), row('b', { date: '2026-10-15', type: 'Field', _createdAt: '2026-10-15T09:00:00.000Z' }), row('c', { date: '2026-10-31', type: 'Prefab' }), row('d', { date: '2026-10-20', _archived: true }), row('e', { date: '', type: 'Hydrotest', _createdAt: '2026-10-16T08:00:00.000Z' })];
  assert.deepEqual(releaseArchiveRows(releases).map(entry => entry.id), ['c', 'e', 'b', 'a']);
  assert.deepEqual(releaseArchiveRows(releases, { from: '2026-10-15', to: '2026-10-31' }).map(entry => entry.id), ['c', 'e', 'b'], 'both ends are included; the creation day stands in for a missing date');
  assert.deepEqual(releaseArchiveRows(releases, { to: '2026-10-14' }).map(entry => entry.id), ['a']);
  assert.deepEqual(releaseArchiveRows(releases, { type: 'Field' }).map(entry => entry.id), ['b']);
  assert.deepEqual(releaseArchiveRows(releases, { from: '2026-11-01' }), []);
});

// ----- the release document --------------------------------------------------------------------------------------

test('release document data follows the Document settings of the main project', () => {
  const site = row('site', { prefix: 'NFY', releaseDocDrawing: 'Drawing no + iso', signSubQaqc: 'QA/QC Manager', signNobo: ' Notified body inspector ', signPrincipalUi: '' });
  assert.equal(releaseDocumentNumber(site, iso), 'DWG-1-CW-001');
  assert.equal(releaseDocumentNumber({ ...site, releaseDocDrawing: 'Prefix + iso' }, iso), 'NFY-CW-001');
  assert.equal(releaseDocumentNumber({ ...site, releaseDocDrawing: '' }, iso), 'DWG-1-CW-001', 'the first option is the default');
  assert.equal(releaseDocumentNumber({ ...site, prefix: '', releaseDocDrawing: 'Prefix + iso' }, iso), 'CW-001', 'a missing prefix leaves the ISO number');
  assert.equal(releaseDocumentNumber(undefined, row('x', { isoNo: 'X-1' })), 'X-1');
  assert.deepEqual(signatureTitlesOf(site), [{ label: 'Subcontractor QA/QC', title: 'QA/QC Manager' }, { label: 'NoBo', title: 'Notified body inspector' }]);
  const data = releaseDocumentData(site, iso);
  assert.deepEqual([data.docNo, data.docPrefix, data.docDrawingRule], ['DWG-1-CW-001', 'NFY', 'Drawing no + iso']);
  // The titles label the Pressure Test Plan; a new release stores none (shared/pdf-documents.ts hydrotestDocumentModel).
  assert.deepEqual(storedSignatureTitles({ signatureTitles: data.signatureTitles } as unknown as Row), []);
  assert.deepEqual(storedSignatureTitles({ signatureTitles: JSON.stringify(signatureTitlesOf(site)) } as unknown as Row), signatureTitlesOf(site), 'an older release keeps what it stored');
  assert.deepEqual(storedSignatureTitles({ signatureTitles: 'not json' } as unknown as Row), []);
  assert.deepEqual(storedSignatureTitles({} as unknown as Row), []);
  assert.deepEqual(releaseDocumentData(undefined, iso).signatureTitles, '[]');
});

// ----- field work packages ---------------------------------------------------------------------------------------

test('Assign Iso to FWP rows filter by project, package, assignment and text; a package of one project takes only its isometrics', () => {
  const packages = [row('f1', { name: 'Cooling loop — Area 1', projectId: 'p1' }), row('f2', { name: 'Open package' })];
  const isometrics = [row('a', { isoNo: 'CW-001', projectId: 'p1', fieldPackageId: 'f1', testSystemId: 't1', paintSpec: 'PS-02', assetTag: 'AT-1' }), row('b', { isoNo: 'CW-002', projectId: 'p1' }), row('c', { isoNo: 'ST-001', projectId: 'p2', fieldPackageId: 'f2' })];
  const source = { isometrics, projects: [row('p1'), row('p2')], testSystems: [row('t1', { name: 'CW-01' })], fieldPackages: packages };
  assert.deepEqual(fwpListRows(source).map(entry => entry.iso.isoNo), ['CW-001', 'CW-002', 'ST-001']);
  assert.equal(fwpListRows(source)[0].testSystem?.name, 'CW-01');
  assert.deepEqual(fwpListRows(source, { projectId: 'p1' }).map(entry => entry.iso.isoNo), ['CW-001', 'CW-002']);
  assert.deepEqual(fwpListRows(source, { fieldPackageId: 'f2' }).map(entry => entry.iso.isoNo), ['ST-001']);
  assert.deepEqual(fwpListRows(source, { assignment: 'unassigned' }).map(entry => entry.iso.isoNo), ['CW-002']);
  assert.deepEqual(fwpListRows(source, { assignment: 'assigned' }).map(entry => entry.iso.isoNo), ['CW-001', 'ST-001']);
  assert.deepEqual(fwpListRows(source, { query: 'ps-02' }).map(entry => entry.iso.isoNo), ['CW-001']);
  assert.deepEqual(fwpListRows(source, { query: 'area 1' }).map(entry => entry.iso.isoNo), ['CW-001'], 'the package name is searched');
  assert.equal(fwpAccepts(packages[0], isometrics[0]), true);
  assert.equal(fwpAccepts(packages[0], isometrics[2]), false);
  assert.equal(fwpAccepts(packages[1], isometrics[2]), true, 'a package without a project takes any isometric');
  assert.equal(fwpAccepts(undefined, isometrics[2]), true, 'clearing is always allowed');
});

test('CSV export quotes cells and neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(15), '15');
  assert.equal(toCsv(['ISO', 'FWP'], [['CW-001', 'Area 1'], ['CW-002', '']]), 'ISO,FWP\r\nCW-001,Area 1\r\nCW-002,');
});

// ----- menu, resource and action definitions ------------------------------------------------------------------

test('the Weld Pilot Releases menu lists Prefab release, Field release, FWP, hydrotest, request archive, punch and flanges; MTO has none of the release pages', () => {
  const group = PILOT_MAP.weld.groups.find(entry => entry.title === 'Releases')!;
  assert.deepEqual(group.items.map(item => item.label), ['Prefab release', 'Field release', 'Assign Iso to FWP', 'Hydrotest release', 'Request archive', 'Punch lists', 'Flange Management']);
  assert.deepEqual(group.items.slice(0, 2).map(item => item.path), ['/welding/releases?view=prefab', '/welding/releases?view=field']);
  assert.equal(group.items.find(item => item.label === 'Request archive')?.path, '/welding/releases?view=archive');
  assert.ok(!PILOT_MAP.mto.groups.some(entry => entry.items.some(item => item.path?.includes('/welding/releases'))));
});

test('the hosted profile delivers the release pages, records and actions with exactly the fields they use', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.features.includes('releases'));
  for (const name of ['status', 'releasedBy', 'releasedAt', 'docNo', 'docPrefix', 'docDrawingRule', 'signatureTitles', 'reopenedAt', 'reopenedBy', 'reopenReason', 'isoId', 'type']) assert.ok(hosted.resources.releases.includes(name), name);
  assert.ok(hosted.resources.field_packages.includes('name') && hosted.navigation.includes('releases') && hosted.navigation.includes('field_packages'));
  assert.deepEqual(hosted.actions.release, ['type', 'isoIds', 'reportNo', 'engineerId', 'signatureId', 'date', 'note']);
  assert.deepEqual(hosted.actions['reopen-release'], ['isoId', 'type', 'reason', 'date']);
  assert.deepEqual(hosted.actions['complete-phase'], ['isoId', 'type']);
  for (const name of ['prefabCompletedAt', 'prefabCompletedBy', 'fieldCompletedAt', 'fieldCompletedBy']) assert.ok(hosted.resources.isometrics.includes(name) && RESOURCE_MAP.isometrics.fields.find(field => field.name === name)?.hidden, name);
  assert.deepEqual(hosted.actions['assign-fwp'], ['isoIds', 'fieldPackageId']);
  // The other profiles keep behaving as before: no release pages and no Reopen.
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; assert.ok(!other.features.includes('releases') && !other.actions.release && !other.actions['reopen-release'] && !other.actions['complete-phase'] && !other.actions['assign-fwp'], profile); }
  assert.equal(availabilityFor('full'), undefined);
  // Release records are written by the actions only.
  assert.equal(RESOURCE_MAP.releases.readonly, true);
  assert.ok(ACTIONS['reopen-release'].fields.find(field => field.name === 'reason')?.required);
});

test('permissions: prefab and field releases and their Reopen need the matching area, Assign Iso to FWP its own', () => {
  const account = (permissions: Partial<User['permissions']>, capabilities?: User['capabilities']): User => ({ id: 'u', name: 'T', email: 't@example.test', profileId: 'p', availability: availabilityFor(HOSTED_RELEASE_PROFILE), permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions }, ...(capabilities ? { capabilities } : {}) });
  assert.equal(canAction(account({ welding: 2 }), 'reopen-release', { type: 'Field' }), true);
  assert.equal(canAction(account({ welding: 1 }), 'reopen-release', { type: 'Field' }), false, 'read only');
  assert.equal(canAction(account({ welding: 1 }), 'assign-fwp'), false);
  assert.equal(canAction(account({ welding: 2 }), 'assign-fwp'), true);
  assert.equal(canAction(account({ materials: 3, general: 3 }), 'reopen-release', { type: 'Prefab' }), false, 'no welding access');
  // Matrix profiles: area 86 prefab, 89 field, 91 assign.
  assert.equal(canAction(account({ welding: 2 }, { '86': ['show', 'insert'] }), 'reopen-release', { type: 'Prefab' }), true);
  assert.equal(canAction(account({ welding: 2 }, { '86': ['show', 'insert'] }), 'reopen-release', { type: 'Field' }), false, 'prefab right does not reopen the field release');
  // Prefab / Field complete use the area of their release.
  assert.equal(canAction(account({ welding: 2 }, { '86': ['show', 'insert'] }), 'complete-phase', { type: 'Prefab' }), true);
  assert.equal(canAction(account({ welding: 2 }, { '86': ['show', 'insert'] }), 'complete-phase', { type: 'Field' }), false);
  assert.equal(canAction(account({ welding: 2 }, { '89': ['show', 'insert'] }), 'complete-phase', { type: 'Field' }), true);
  assert.equal(canAction(account({ welding: 1 }), 'complete-phase', { type: 'Prefab' }), false, 'read only');
  assert.equal(canAction(account({ welding: 2 }, { '89': ['show', 'insert'] }), 'release', { type: 'Field' }), true);
  assert.equal(canAction(account({ welding: 2 }, { '89': ['show', 'insert'] }), 'release', { type: 'Prefab' }), false);
  assert.equal(canAction(account({ welding: 2 }, { '91': ['show', 'edit'] }), 'assign-fwp'), true);
  assert.equal(canAction(account({ welding: 2 }, { '91': ['show'] }), 'assign-fwp'), false);
  assert.equal(canAction(account({ welding: 2 }, { '90': ['show', 'insert', 'edit'] }), 'assign-fwp'), false, 'managing packages is not assigning isometrics');
});

// ----- the actions on a database -------------------------------------------------------------------------------------

const actor = { id: 'user-1', name: 'Mila Kovač' };
function fixture(t: { after: (fn: () => void) => void }) {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  return store;
}
/** An isometric of project-cooling whose shop welds are welded and accepted, and a field weld that is still open. */
function readyIso(store: Store, id = 'iso-ready', isoNo = 'STX-CW-901') {
  store.create('isometrics', { isoNo, projectId: 'project-cooling', drawingNo: 'DWG-2499', pipingClass: 'CS150' }, SYSTEM, id);
  const make = (weldNo: string, typeId: string, extra: Record<string, unknown> = {}) => store.create('welds', { weldNo, isoId: id, typeId, welder1Id: 'welder-1', wpsId: 'wps-1', diameterId: 'diameter-9', lengthMode: 'Diameter', date: '2026-10-20', datefit: '2026-10-19', chargeNo1: 'H-1042', chargeNo2: 'H-1042', ...extra }, SYSTEM);
  const shop = make('W901', 'weld-type-1', { ndoReq: true }), field = make('W902', 'weld-type-0');
  const request = runAction(store, 'inspection-request', { weldIds: [shop.id], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-21' }, SYSTEM).records![0];
  runAction(store, 'inspection-result', { requestId: request.id, reportNo: 'RT-900', result: 'Accepted', date: '2026-10-22' }, SYSTEM);
  return { id, shop, field, fieldId: field.id };
}
const releaseData = (isoIds: string[], type = 'Prefab', extra: Record<string, unknown> = {}) => ({ isoIds, type, reportNo: 'PFR-900', engineerId: 'qa-1', date: '2026-11-02', ...extra });
const refusal = (fn: () => unknown) => { try { fn(); } catch (error) { return error as AppError; } assert.fail('expected a refusal'); };
const complete = (store: Store, isoId: string, type = 'Prefab', who = actor) => runAction(store, 'complete-phase', { isoId, type }, who);

test('Prefab complete: a confirmation only; it stores who and when, creates no release record, locks the shop welds and lists the isometric for release', t => {
  const store = fixture(t); const { id, shop, field } = readyIso(store);
  const types = store.list('weld_types');
  const before = store.list('releases').length;
  const { record } = complete(store, id);
  assert.match(String(record!.prefabCompletedAt), /^\d{4}-\d{2}-\d{2}T/); assert.equal(record!.prefabCompletedBy, 'Mila Kovač');
  assert.equal(store.list('releases').length, before, 'no release record and no number');
  assert.equal(weldLockReason(shop, store.get('isometrics', id), store.list('releases'), types), 'Locked after Prefab complete');
  assert.equal(weldLocked(field, store.get('isometrics', id), store.list('releases'), types), false);
  const source = { isometrics: store.list('isometrics'), projects: store.list('projects'), welds: store.list('welds'), weldTypes: types, results: store.list('inspection_results'), releases: store.list('releases') };
  assert.ok(releaseListRows('Prefab', source).some(entry => entry.iso.id === id), 'listed on the Prefab release page');
  assert.ok(!releaseListRows('Field', source).some(entry => entry.iso.id === id));
  assert.ok(store.activity(20).some(event => event.entityType === 'isometrics' && event.entityId === id && event.action === 'completed' && event.summary === 'Prefab complete'), 'the audit trail records Prefab complete');
  // Twice, or an unknown phase: refused.
  assert.match(refusal(() => complete(store, id)).message, /already Prefab complete/);
  assert.equal(refusal(() => complete(store, id, 'Hydrotest')).status, 422);
  assert.equal(refusal(() => complete(store, 'nope')).status, 404);
});

test('Complete is refused while the phase is not ready; open pre-punch A does not hold it; Field needs Prefab complete first', t => {
  const store = fixture(t); const { id, shop, field } = readyIso(store);
  store.update('welds', shop.id, { welder1Id: '' }, shop._version, SYSTEM);
  let error = refusal(() => complete(store, id));
  assert.equal(error.status, 422); assert.match(error.message, /Prefab complete is not available for STX-CW-901\. Weld W901 has not been welded yet/);
  store.update('welds', shop.id, { welder1Id: 'welder-1' }, store.get('welds', shop.id)._version, SYSTEM);
  // weld-releases-004 / weld-punch-flanges-007: an open pre-punch item of category A is a warning, not a gate.
  store.create('punchlists', { name: 'Support missing', description: 'Pipe support PS-12 missing at the shop spool', punchType: 'Pre-punch', isoId: id, category: 'A', status: 'Open' }, SYSTEM, 'punch-block');
  assert.match(refusal(() => complete(store, id, 'Field')).message, /Prefab complete is required first/);
  complete(store, id);
  store.update('welds', field.id, { welder1Id: '' }, field._version, SYSTEM);
  assert.match(refusal(() => complete(store, id, 'Field')).message, /Weld W902 has not been welded yet/);
  store.update('welds', field.id, { welder1Id: 'welder-2' }, store.get('welds', field.id)._version, SYSTEM);
  assert.ok(complete(store, id, 'Field').record!.fieldCompletedAt);
  // The system actor (sample data) is not checked.
  assert.ok(complete(store, 'iso-1', 'Prefab', SYSTEM).record!.prefabCompletedAt);
});

test('releasing: only completed isometrics, with who, when, the document numbering of their main project', t => {
  const store = fixture(t); const { id } = readyIso(store);
  // Not completed yet: refused, and nothing of the batch is released.
  const other = readyIso(store, 'iso-ready-2', 'STX-CW-902'); complete(store, other.id);
  let error = refusal(() => runAction(store, 'release', releaseData([id, other.id]), actor));
  assert.equal(error.status, 422); assert.match(error.message, /Nothing was released\. STX-CW-901: Prefab is not complete yet/);
  assert.equal(store.list('releases').filter(row => row.reportNo === 'PFR-900').length, 0);
  complete(store, id);
  const { records } = runAction(store, 'release', releaseData([id], 'Prefab', { note: 'Shop welds complete' }), actor);
  const release = records![0];
  assert.deepEqual([release.type, release.status, release.releasedBy, release.reportNo, release.date, release.isoId, release.note], ['Prefab', 'Released', 'Mila Kovač', 'PFR-900', '2026-11-02', id, 'Shop welds complete']);
  assert.match(String(release.releasedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(release.docNo, 'DWG-2499-STX-CW-901', 'North fabrication yard numbers by drawing number + ISO');
  assert.equal(release.docPrefix, 'NFY'); assert.equal(release.docDrawingRule, 'Drawing no + iso');
  assert.deepEqual(storedSignatureTitles(release), [], 'the signature titles belong to the Pressure Test Plan, not to the release');
  // Later changes of the Document settings do not rewrite the document that was released.
  const site = store.get('sites', 'site-north'); store.update('sites', site.id, { prefix: 'ZZZ', releaseDocDrawing: 'Prefix + iso', signSubQaqc: 'Someone else' }, site._version, SYSTEM);
  assert.equal(store.get('releases', release.id).docNo, 'DWG-2499-STX-CW-901');
  assert.equal(runAction(store, 'release', releaseData([other.id]), actor).records![0].docNo, 'ZZZ-STX-CW-902', 'the next release uses the new settings');
  assert.ok(store.activity(10).some(event => event.entityType === 'releases' && event.action === 'released'));
  // Already released; the old validation stays.
  error = refusal(() => runAction(store, 'release', releaseData([id]), actor));
  assert.equal(error.status, 422); assert.match(error.message, /Prefab is already released/);
  assert.equal(refusal(() => runAction(store, 'release', releaseData([id], 'Bogus'), actor)).status, 422);
  assert.equal(refusal(() => runAction(store, 'release', releaseData([id], 'Prefab', { reportNo: ' ' }), actor)).status, 422);
  assert.equal(refusal(() => runAction(store, 'release', releaseData([], 'Prefab'), actor)).status, 422);
  assert.equal(refusal(() => runAction(store, 'release', releaseData(['nope']), actor)).status, 404);
  // Field release needs Field complete; Hydrotest keeps its earlier behaviour; the system actor is not checked.
  assert.match(refusal(() => runAction(store, 'release', releaseData([id], 'Field', { reportNo: 'FLR-900' }), actor)).message, /Field is not complete yet/);
  complete(store, id, 'Field');
  assert.equal(runAction(store, 'release', releaseData([id], 'Field', { reportNo: 'FLR-900' }), actor).records![0].type, 'Field');
  assert.equal(runAction(store, 'release', releaseData([id], 'Hydrotest', { reportNo: 'HTR-900' }), actor).records![0].type, 'Hydrotest');
  assert.equal(runAction(store, 'release', releaseData(['iso-1']), SYSTEM).records!.length, 1);
});

test('a rejected weld holds Prefab complete until its repair has an accepted result', t => {
  const store = fixture(t); const { id, shop } = readyIso(store);
  const request = runAction(store, 'inspection-request', { weldIds: [shop.id], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-23' }, SYSTEM).records![0];
  runAction(store, 'inspection-result', { requestId: request.id, reportNo: 'RT-901', result: 'Rejected', date: '2026-10-24' }, SYSTEM);
  assert.match(refusal(() => complete(store, id)).message, /Rejection on weld W901, repair W901R1 is still open/);
  const again = runAction(store, 'inspection-request', { weldIds: [shop.id], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-25' }, SYSTEM).records![0];
  runAction(store, 'inspection-result', { requestId: again.id, reportNo: 'RT-902', result: 'Accepted', date: '2026-10-26' }, SYSTEM);
  assert.ok(complete(store, id).record!.prefabCompletedAt);
});

test('hosted repair model: a rejected weld with its repair weld R1 (added by hand) holds Prefab complete until R1 is welded and accepted', t => {
  const store = fixture(t); const { id, shop } = readyIso(store); const hosted = { inspectionRules: true };
  const request = runAction(store, 'inspection-request', { weldIds: [shop.id], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-23' }, SYSTEM, hosted).records![0];
  runAction(store, 'inspection-result', { requestId: request.id, reportNo: 'RT-901', result: 'Rejected', date: '2026-10-24' }, SYSTEM, hosted);
  // The NA records the result only; the user adds the repair weld W901R1 by hand (linked by its number).
  assert.equal(store.list('welds').some(weld => weld.repairOfId === shop.id), false);
  const repair = store.create('welds', { weldNo: 'W901R1', isoId: shop.isoId, typeId: shop.typeId, wpsId: shop.wpsId, diameterId: shop.diameterId, lengthMode: shop.lengthMode, chargeNo1: shop.chargeNo1, chargeNo2: shop.chargeNo2, ndoReq: true, repair: true }, SYSTEM);
  assert.equal(refusal(() => complete(store, id)).status, 422);
  const check = () => releaseCheck('Prefab', { iso: store.get('isometrics', id), welds: store.list('welds'), weldTypes: store.list('weld_types'), results: store.list('inspection_results'), releases: store.list('releases'), punch: store.list('punchlists') });
  assert.ok(check().reasons.some(reason => reason.group === 'repair' && reason.message === 'Rejection on weld W901, repair W901R1 is still open'), 'the repair chain of the inspections flow holds the phase');
  assert.ok(check().reasons.some(reason => reason.group === 'welds' && /W901R1 has not been welded/.test(reason.message)), 'the repair weld itself must be welded');
  store.update('welds', repair.id, { welder1Id: 'welder-1', date: '2026-10-25', datefit: '2026-10-25' }, repair._version, SYSTEM);
  const again = runAction(store, 'inspection-request', { weldIds: [repair.id], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-25' }, SYSTEM, hosted).records![0];
  runAction(store, 'inspection-result', { requestId: again.id, reportNo: 'RT-902', result: 'Accepted', date: '2026-10-26' }, SYSTEM, hosted);
  assert.equal(isoBlockers({ iso: store.get('isometrics', id), welds: store.list('welds'), weldTypes: store.list('weld_types'), diameters: store.list('diameters'), results: store.list('inspection_results'), releases: [], punch: [] }).groups.some(group => group.key === 'repair'), false, 'the isometric blocker agrees');
  assert.ok(complete(store, id).record!.prefabCompletedAt);
});

test('Reopen: needs a reason, unlocks the phase, keeps who, when and why; Prefab reopens while Field stays completed; a release document becomes Reopened', t => {
  const store = fixture(t); const { id, shop, field } = readyIso(store);
  const releases = () => store.list('releases').filter(row => row.isoId === id);
  const types = store.list('weld_types'); const isoNow = () => store.get('isometrics', id);
  complete(store, id); complete(store, id, 'Field');
  const fieldRelease = runAction(store, 'release', releaseData([id], 'Field', { reportNo: 'FLR-900' }), actor).records![0];
  assert.equal(weldLocked(shop, isoNow(), releases(), types), true);
  assert.equal(weldLocked(field, isoNow(), releases(), types), true);
  // A reason is required and bounded.
  assert.equal(refusal(() => runAction(store, 'reopen-release', { isoId: id, type: 'Field', reason: '  ' }, actor)).status, 422);
  assert.equal(refusal(() => runAction(store, 'reopen-release', { isoId: id, type: 'Field', reason: 'x'.repeat(501) }, actor)).status, 422);
  assert.equal(refusal(() => runAction(store, 'reopen-release', { isoId: id, type: 'Hydrotest', reason: 'Wrong type' }, actor)).status, 422);
  // weld-releases-006: Prefab reopens while Field is completed (and released); Field stays completed.
  const prefabReopen = runAction(store, 'reopen-release', { isoId: id, type: 'Prefab', reason: 'Re-weld spool' }, actor);
  assert.equal(prefabReopen.resource, 'isometrics', 'no release document of the Prefab phase: only the completion is undone');
  assert.deepEqual([isoNow().prefabCompletedAt, isoNow().prefabCompletedBy], ['', '']);
  assert.ok(isoNow().fieldCompletedAt, 'Field stays completed');
  assert.equal(weldLocked(shop, isoNow(), releases(), types), false, 'shop welds are unlocked');
  assert.equal(weldLocked(field, isoNow(), releases(), types), true, 'field welds stay locked');
  // Reopen Field: completion cleared and its release document Reopened with the reason.
  const reopened = runAction(store, 'reopen-release', { isoId: id, type: 'Field', reason: ' Flange face damaged during hydrotest prep ' }, { id: 'user-2', name: 'Sara Jansen' }).record!;
  assert.equal(reopened.id, fieldRelease.id);
  assert.deepEqual([reopened.status, reopened.reopenedBy, reopened.reopenReason], ['Reopened', 'Sara Jansen', 'Flange face damaged during hydrotest prep']);
  assert.match(String(reopened.reopenedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(reopened.releasedBy, 'Mila Kovač', 'the original release data stays');
  assert.equal(isoNow().fieldCompletedAt, '');
  assert.equal(weldLocked(field, isoNow(), releases(), types), false, 'field welds are unlocked');
  // The audit trail names the reason, on the release and on the isometric.
  for (const [entity, entityId] of [['releases', fieldRelease.id], ['isometrics', id]]) assert.ok(store.activity(50).some(event => event.entityType === entity && event.entityId === entityId && event.action === 'reopened' && event.summary.includes('Flange face damaged')), entity);
  // Nothing to reopen twice.
  assert.match(refusal(() => runAction(store, 'reopen-release', { isoId: id, type: 'Field', reason: 'Again' }, actor)).message, /is not Field complete/);
  // Complete and release again: a new record, the earlier one kept as history.
  complete(store, id); complete(store, id, 'Field');
  const again = runAction(store, 'release', releaseData([id], 'Field', { reportNo: 'FLR-901' }), actor).records![0];
  assert.notEqual(again.id, fieldRelease.id); assert.equal(releases().length, 2);
  assert.equal(activeRelease(store.list('releases'), id, 'Field')?.id, again.id);
  assert.equal(store.get('releases', fieldRelease.id).status, 'Reopened', 'the earlier record is kept as history');
  // An active release from before the two steps (no completion fields) reopens too.
  const legacy = runAction(store, 'reopen-release', { isoId: 'iso-9', type: 'Prefab', reason: 'Legacy release reopened' }, actor).record!;
  assert.equal(legacy.status, 'Reopened');
});

test('assign-fwp sets and clears the package of all checked isometrics, or none', t => {
  const store = fixture(t);
  const assign = (isoIds: string[], fieldPackageId = 'fwp-1') => runAction(store, 'assign-fwp', { isoIds, fieldPackageId }, actor);
  assert.equal(assign(['iso-1', 'iso-2']).records!.length, 2);
  assert.deepEqual(['iso-1', 'iso-2', 'iso-3'].map(id => store.get('isometrics', id).fieldPackageId || ''), ['fwp-1', 'fwp-1', '']);
  // iso-4 belongs to project-steam: fwp-1 is a package of project-cooling. Nothing changes, not even iso-3.
  const error = refusal(() => assign(['iso-3', 'iso-4']));
  assert.equal(error.status, 422); assert.match(error.message, /belongs to another project/);
  assert.equal(store.get('isometrics', 'iso-3').fieldPackageId || '', '');
  assert.equal(refusal(() => assign([])).status, 422);
  assert.equal(refusal(() => assign(['iso-1'], 'nope')).status, 404);
  assert.equal(assign(['iso-1', 'iso-2'], '').records!.length, 2, 'an empty package clears');
  assert.equal(store.get('isometrics', 'iso-1').fieldPackageId || '', '');
  // Assigning what is already assigned changes nothing.
  assign(['iso-1']); const version = store.get('isometrics', 'iso-1')._version; assign(['iso-1']);
  assert.equal(store.get('isometrics', 'iso-1')._version, version);
});

// ----- over HTTP, with the pilot boundary --------------------------------------------------------------------------

const PASSWORD = 'Release-Test-Password';
async function http(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-releases-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, settingsPermission: 'No access', toolsPermission: 'No access', ...levels }).id;
  const client = (email: string, name = email) => {
    let cookie = '';
    const user = store.create('users', { name, email, active: true, profileId: 'profile-viewer', ...({} as object) });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const request = async (path: string, method = 'GET', data?: unknown, pilot?: string) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { user, request, login: async () => { assert.equal((await request('/auth/login', 'POST', { email, password: PASSWORD })).status, 200); } };
  };
  return { store, client, profile };
}

test('over HTTP: releasing, reopening and assigning are allowed with the right pilot and area, refused otherwise, and cannot forge records', async t => {
  const f = await http(t); const { id } = readyIso(f.store); complete(f.store, id);
  const full = f.profile('Release full', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Administration' });
  const weldReadOnly = f.profile('Release read only', { generalPermission: 'Read only', materialsPermission: 'Read & write', weldingPermission: 'Read only' });
  const owner = f.client('qa@example.test', 'Mila Kovač'); const reviewer = f.client('review@example.test'); const planner = f.client('planner@example.test');
  f.store.update('users', owner.user.id, { weldEnabled: true, weldProfileId: full, mtoEnabled: true, mtoProfileId: full }, owner.user._version, SYSTEM);
  f.store.update('users', reviewer.user.id, { weldEnabled: true, weldProfileId: weldReadOnly, mtoEnabled: false }, reviewer.user._version, SYSTEM);
  f.store.update('users', planner.user.id, { weldEnabled: false, mtoEnabled: true, mtoProfileId: full }, planner.user._version, SYSTEM);
  await Promise.all([owner, reviewer, planner].map(account => account.login()));
  const body = releaseData([id]);
  // Read-only welding profile: refused, in both directions of the boundary.
  assert.equal((await reviewer.request('/actions/release', 'POST', body, 'weld')).status, 403);
  assert.equal((await reviewer.request('/actions/reopen-release', 'POST', { isoId: id, type: 'Prefab', reason: 'Nope' }, 'weld')).status, 403);
  assert.equal((await reviewer.request('/actions/assign-fwp', 'POST', { isoIds: [id], fieldPackageId: 'fwp-1' }, 'weld')).status, 403);
  assert.equal((await reviewer.request('/actions/release', 'POST', body, 'mto')).status, 403, 'not enabled for MTO Pilot');
  // Inside MTO Pilot the welding side is off, even for a profile that has it.
  assert.equal((await owner.request('/actions/release', 'POST', body, 'mto')).status, 403, 'the pilot boundary removes the welding module');
  assert.equal((await owner.request('/actions/assign-fwp', 'POST', { isoIds: [id], fieldPackageId: 'fwp-1' }, 'mto')).status, 403);
  assert.equal((await planner.request('/actions/release', 'POST', body, 'weld')).status, 403, 'not enabled for Weld Pilot');
  assert.equal((await owner.request('/actions/release', 'POST', body)).status, 403, 'a workspace request needs a pilot');
  // Forged fields are not part of the action.
  assert.equal((await owner.request('/actions/release', 'POST', { ...body, status: 'Reopened' }, 'weld')).status, 404);
  assert.equal((await owner.request('/actions/release', 'POST', { ...body, releasedBy: 'Someone else' }, 'weld')).status, 404);
  assert.equal((await owner.request('/records/releases', 'POST', { isoId: id, type: 'Prefab', reportNo: 'X' }, 'weld')).status, 405, 'records are written by the actions only');
  assert.equal(f.store.list('releases').filter(row => row.isoId === id).length, 0);
  // The right pilot with the right profile: released, with the actor as the releaser.
  const released = await owner.request('/actions/release', 'POST', body, 'weld'); assert.equal(released.status, 201);
  const record = (await released.json()).records[0];
  assert.deepEqual([record.releasedBy, record.status, record.docNo], ['Mila Kovač', 'Released', 'DWG-2499-STX-CW-901']);
  assert.equal((await owner.request('/actions/release', 'POST', body, 'weld')).status, 422, 'released twice');
  // A blocked isometric answers 422 with its reason, for Complete; Release refuses what is not completed.
  const blocked = await owner.request('/actions/complete-phase', 'POST', { isoId: 'iso-6', type: 'Prefab' }, 'weld'); assert.equal(blocked.status, 422);
  assert.match((await blocked.json()).error, /Prefab complete is not available for STX-ST-006\. NDT on weld W015 has no result/);
  const notCompleted = await owner.request('/actions/release', 'POST', releaseData(['iso-6']), 'weld'); assert.equal(notCompleted.status, 422);
  assert.match((await notCompleted.json()).error, /Nothing was released\. STX-ST-006: Prefab is not complete yet/);
  assert.equal((await reviewer.request('/actions/complete-phase', 'POST', { isoId: 'iso-6', type: 'Prefab' }, 'weld')).status, 403, 'read only: no Complete');
  assert.equal((await owner.request('/actions/complete-phase', 'POST', { isoId: 'iso-6', type: 'Prefab', prefabCompletedBy: 'Someone else' }, 'weld')).status, 404, 'forged fields are not part of the action');
  // Reading: the Weld Pilot sees the records with their new fields, the MTO pilot none of them.
  const weld = await (await owner.request('/bootstrap', 'GET', undefined, 'weld')).json();
  assert.equal(weld.rows.releases.find((row: Row) => row.id === record.id).status, 'Released');
  assert.ok(weld.rows.field_packages.length >= 1);
  const mto = await (await owner.request('/bootstrap', 'GET', undefined, 'mto')).json();
  assert.equal(mto.rows.releases, undefined); assert.equal(mto.rows.field_packages, undefined);
  assert.equal((await owner.request('/records/releases', 'GET', undefined, 'mto')).status, 403, 'the other pilot refuses the read');
  // Reopen: the reason is required; the audit trail keeps it.
  assert.equal((await owner.request('/actions/reopen-release', 'POST', { isoId: id, type: 'Prefab' }, 'weld')).status, 422);
  const reopened = await owner.request('/actions/reopen-release', 'POST', { isoId: id, type: 'Prefab', reason: 'Spool replaced after drawing revision' }, 'weld'); assert.equal(reopened.status, 201);
  assert.equal((await reopened.json()).record.status, 'Reopened');
  const history = await (await owner.request(`/history/isometrics/${id}`, 'GET', undefined, 'weld')).json();
  assert.ok(history.events.some((event: { action: string; summary: string }) => event.action === 'reopened' && event.summary.includes('Spool replaced after drawing revision')), 'the reason reaches the audit trail of the isometric');
  // Assigning to a field work package, with the same boundaries.
  const assign = await owner.request('/actions/assign-fwp', 'POST', { isoIds: [id], fieldPackageId: 'fwp-1' }, 'weld'); assert.equal(assign.status, 201);
  assert.equal(f.store.get('isometrics', id).fieldPackageId, 'fwp-1');
  assert.equal((await owner.request('/actions/assign-fwp', 'POST', { isoIds: [id], fieldPackageId: 'fwp-1', name: 'x' }, 'weld')).status, 404);
});

test('over HTTP: the matrix areas decide who may release prefab, release field or assign to a work package', async t => {
  const f = await http(t); const { id } = readyIso(f.store);
  const matrix = (rules: Record<string, string[]>) => f.profile(`Matrix ${Object.keys(rules).join('-')}`, { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  const prefabOnly = matrix({ '86': ['show', 'insert'], '4': ['show'], '5': ['show'], '64': ['show'], '63': ['show'] });
  const assignOnly = matrix({ '91': ['show', 'edit'], '4': ['show'], '5': ['show'], '64': ['show'] });
  const a = f.client('prefab@example.test'), b = f.client('assign@example.test');
  f.store.update('users', a.user.id, { weldEnabled: true, weldProfileId: prefabOnly, mtoEnabled: false }, a.user._version, SYSTEM);
  f.store.update('users', b.user.id, { weldEnabled: true, weldProfileId: assignOnly, mtoEnabled: false }, b.user._version, SYSTEM);
  await a.login(); await b.login();
  assert.equal((await a.request('/actions/release', 'POST', releaseData([id], 'Field', { reportNo: 'FLR-1' }), 'weld')).status, 403, 'no right on the field release area');
  assert.equal((await a.request('/actions/assign-fwp', 'POST', { isoIds: [id], fieldPackageId: 'fwp-1' }, 'weld')).status, 403);
  assert.equal((await b.request('/actions/release', 'POST', releaseData([id]), 'weld')).status, 403);
  assert.equal((await b.request('/actions/assign-fwp', 'POST', { isoIds: [id], fieldPackageId: 'fwp-1' }, 'weld')).status, 201);
  assert.equal((await b.request('/actions/complete-phase', 'POST', { isoId: id, type: 'Prefab' }, 'weld')).status, 403);
  assert.equal((await a.request('/actions/complete-phase', 'POST', { isoId: id, type: 'Field' }, 'weld')).status, 403, 'no right on the field release area');
  assert.equal((await a.request('/actions/complete-phase', 'POST', { isoId: id, type: 'Prefab' }, 'weld')).status, 201);
  assert.equal((await a.request('/actions/release', 'POST', releaseData([id]), 'weld')).status, 201);
  assert.equal((await a.request('/actions/reopen-release', 'POST', { isoId: id, type: 'Field', reason: 'No field release exists' }, 'weld')).status, 403);
  assert.equal((await a.request('/actions/reopen-release', 'POST', { isoId: id, type: 'Prefab', reason: 'Re-check' }, 'weld')).status, 201);
});
