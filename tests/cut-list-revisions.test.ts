import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { documentStorage } from '../server/documents.ts';
import { amendCompletedCutList, completeCutList, createCutListRevision } from '../server/cut-list-revisions.ts';
import { runAction } from '../server/workflows.ts';
import { CUT_LIST_FITTINGS } from '../shared/cut-list-fittings-data.ts';
import { FITTING_TYPES, fittingType, lineLengths } from '../shared/cut-list.ts';
import { currentRevision, isoRevisions, lineRevisionId, revisionDocumentType, revisionLabel, revisionSnapshot } from '../shared/cut-list-revisions.ts';
import { canEditCompletedCutList } from '../shared/cut-list-rights.ts';
import { COMPLETED_CUT_LIST_AREA, PAGE_SCOPES, PERMISSION_AREAS, areaPilots, parsePermissionRules } from '../shared/permissions.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, pageAvailable } from '../shared/release.ts';
import { cutListEntries } from '../shared/planning.ts';
import { RESOURCES } from '../shared/resources.ts';
import type { Row, User } from '../shared/types.ts';

const admin = { id: 'cut-admin', name: 'Cut admin', administrator: true };
const editor = { id: 'cut-editor', name: 'Cut editor' };
const rows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)])) as Record<string, Row[]>;
const fittingId = (store: Store, code: string) => store.list('cut_fittings').find(row => row.code === code)!.id;

function fixture(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-cut-revisions-'));
  const store = new Store(':memory:'); seed(store);
  const documents = documentStorage(store, dir, 'database');
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const elbow = fittingId(store, 'e45-1in-');
  const line = (values: Record<string, unknown> = {}) => store.create('cut_list', { isoId: 'iso-1', sheet: '1', dia: '1"', material: 'A106B', schedule: 'STD', totalLength: 1000, bevel: 2, fit1Id: elbow, fit2Id: elbow, ...values }, editor);
  const lines = (revisionId: string) => store.list('cut_list').filter(row => row.isoId === 'iso-1' && lineRevisionId(row, store.list('cut_list_revisions')) === revisionId).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  return { store, documents, elbow, line, lines };
}

test('Complete Cut List: the PDF goes to the Attachments of the isometric, the revision is completed with a snapshot, the lines are locked', async t => {
  const { store, documents, elbow, line, lines } = fixture(t);
  const first = line(), second = line({ totalLength: 500 });
  assert.deepEqual([first.name, second.name, first.revisionId, first.takeoffsFixed], ['1', '2', '', false], 'lines saved before any revision form the draft Rev. 00');
  const { revision, attachment } = await completeCutList(store, documents, 'iso-1', editor, '', new Date('2026-11-20T10:00:00Z'));
  assert.deepEqual([revision.name, revision.revNo, revision.status, revision.completedByName, revision.completedAt, revision.attachmentId], ['Rev. 00', 0, 'Completed', 'Cut editor', '2026-11-20T10:00:00.000Z', attachment.id]);
  assert.deepEqual([attachment.entityType, attachment.entityId, attachment.documentType, attachment.mime, attachment.name], ['isometrics', 'iso-1', 'Cut list Rev 00', 'application/pdf', `Cut-list-${store.get('isometrics', 'iso-1').isoNo}-Rev-00.pdf`.replace(/[^A-Za-z0-9._-]+/g, '-')]);
  assert.equal(documents.read(attachment.id)!.subarray(0, 5).toString('latin1'), '%PDF-');
  // The snapshot keeps the norms used and the calculated lines.
  const snapshot = revisionSnapshot(revision)!;
  assert.deepEqual(snapshot.fittings[elbow], { code: 'e45-1in-', name: '45° Elbow 1"', description: store.get('cut_fittings', elbow).description, diameter: store.get('cut_fittings', elbow).diameter, takeoff: 22.23 });
  assert.deepEqual(snapshot.lines.map(item => [item.name, item.lengthMm, item.fits.map(fit => fit.takeoff)]), [['1', 951.54, [22.23, 22.23]], ['2', 451.54, [22.23, 22.23]]]);
  assert.equal(snapshot.totalMm, 1403.08); assert.equal(snapshot.completedBy, 'Cut editor'); assert.equal(snapshot.revision, 'Rev. 00');
  // The lines now carry the revision and fixed take-offs.
  for (const item of lines(revision.id)) assert.deepEqual([item.revisionId, item.takeoffsFixed, item.takeoff1], [revision.id, true, 22.23]);
  // Locked: no edit, delete, restore or new line for anyone outside the logged correction, administrators included.
  const stored = store.get('cut_list', first.id);
  for (const actor of [editor, admin]) {
    assert.throws(() => store.update('cut_list', first.id, { bevel: 0 }, stored._version, actor), (error: { status?: number; message: string }) => error.status === 423 && /Rev\. 00 of this cut list is completed and locked/.test(error.message));
    assert.throws(() => store.archive('cut_list', first.id, stored._version, actor), (error: { status?: number }) => error.status === 423);
    assert.throws(() => store.create('cut_list', { isoId: 'iso-1', totalLength: 100 }, actor), (error: { status?: number }) => error.status === 423);
  }
  // Completing twice, or completing an empty cut list, is refused.
  await assert.rejects(completeCutList(store, documents, 'iso-1', editor), /already completed/);
  await assert.rejects(completeCutList(store, documents, 'iso-2', editor), /at least one line/);
  assert.deepEqual(store.history('cut_list_revisions', revision.id).events.map(event => event.action).filter(action => action === 'completed'), ['completed']);
});

test('a completed cut list changes only through the logged correction of an authorised account, with a reason; earlier documents stay', async t => {
  const { store, documents, line, lines } = fixture(t);
  const first = line(); line({ totalLength: 500 });
  const { revision, attachment } = await completeCutList(store, documents, 'iso-1', editor);
  const original = Buffer.from(documents.read(attachment.id)!);
  const stored = store.get('cut_list', first.id);
  await assert.rejects(amendCompletedCutList(store, documents, { revisionId: revision.id, action: 'edit', lineId: first.id, version: stored._version, changes: { totalLength: 1100 }, reason: '  ' }, admin), /Enter the reason/);
  await assert.rejects(amendCompletedCutList(store, documents, { revisionId: revision.id, action: 'edit', lineId: first.id, version: stored._version, changes: { lengthMm: 5 }, reason: 'x' }, admin), /cannot be changed/);
  const amended = await amendCompletedCutList(store, documents, { revisionId: revision.id, action: 'edit', lineId: first.id, version: stored._version, changes: { totalLength: 1100 }, reason: 'Drawing corrected on site' }, admin, new Date('2026-11-21T08:00:00Z'));
  assert.equal(store.get('cut_list', first.id).lengthMm, 1051.54, 'worked out with the snapshot take-offs');
  assert.deepEqual([amended.attachment.documentType, amended.revision.amendments, amended.revision.attachmentId], [revisionDocumentType(0, 1), 1, amended.attachment.id]);
  assert.equal(amended.attachment.documentType, 'Cut list Rev 00 (amendment 1)');
  // The first document is kept, byte for byte, next to the amendment.
  assert.ok(store.get('attachments', attachment.id) && !store.get('attachments', attachment.id)._archived);
  assert.ok(Buffer.from(documents.read(attachment.id)!).equals(original));
  const snapshot = revisionSnapshot(amended.revision)!;
  assert.deepEqual(snapshot.amendments.map(item => [item.byName, item.reason, item.action, item.line, item.attachmentId]), [['Cut admin', 'Drawing corrected on site', 'edit', '1', amended.attachment.id]]);
  assert.equal(snapshot.lines[0].lengthMm, 1051.54); assert.equal(snapshot.completedBy, 'Cut editor', 'who completed it stays');
  // Logged on the line and on the revision, with the user and the reason.
  for (const [key, id] of [['cut_list', first.id], ['cut_list_revisions', revision.id]]) {
    const event = store.history(key, id).events.find(item => item.action === 'amended')!;
    assert.equal(event.actorName, 'Cut admin'); assert.match(event.summary, /Reason: Drawing corrected on site/);
  }
  // A deleted line leaves the snapshot; the revision stays completed and locked.
  const second = lines(revision.id)[1];
  await amendCompletedCutList(store, documents, { revisionId: revision.id, action: 'delete', lineId: second.id, version: second._version, reason: 'Duplicate piece' }, admin);
  const after = store.get('cut_list_revisions', revision.id);
  assert.deepEqual([after.status, after.amendments, revisionSnapshot(after)!.lines.length], ['Completed', 2, 1]);
  assert.equal(store.list('attachments').filter(row => row.entityId === 'iso-1' && String(row.documentType).startsWith('Cut list Rev 00')).length, 3);
});

test('revisions are numbered Rev. 00, Rev. 01, …; a copy keeps or recalculates the norms, a new one starts empty; completed revisions never change', async t => {
  const { store, documents, elbow, line, lines } = fixture(t);
  line(); line({ totalLength: 500 });
  assert.throws(() => createCutListRevision(store, 'iso-1', { mode: 'new' }, editor), /Rev\. 00 is still a draft/);
  const rev0 = (await completeCutList(store, documents, 'iso-1', editor)).revision;
  // The norm changes after Rev. 00 was completed.
  const fitting = store.get('cut_fittings', elbow); store.update('cut_fittings', elbow, { takeoff: 30 }, fitting._version, admin);
  const keep = createCutListRevision(store, 'iso-1', { mode: 'copy', standards: 'keep' }, editor);
  assert.deepEqual([keep.name, keep.revNo, keep.status, keep.source, keep.sourceRevisionId, keep.standardsMode, keep.createdByName], ['Rev. 01', 1, 'Draft', 'Copy', rev0.id, 'Keep', 'Cut editor']);
  assert.deepEqual(lines(keep.id).map(row => [row.name, row.takeoff1, row.lengthMm, row.takeoffsFixed]), [['1', 22.23, 951.54, true], ['2', 22.23, 451.54, true]], 'Keep Previous Standards: the take-offs of Rev. 00');
  // The draft is edited as usual; its take-offs still come from the kept standards.
  const draftLine = lines(keep.id)[0];
  assert.equal(store.update('cut_list', draftLine.id, { bevel: 0 }, draftLine._version, editor).lengthMm, 955.54);
  assert.throws(() => createCutListRevision(store, 'iso-1', { mode: 'new' }, editor), /Rev\. 01 is still a draft/);
  // Rev. 00 has not moved: its lines, lengths and snapshot are as completed, whatever the catalog says now.
  const catalog = new Map(store.list('cut_fittings').map(row => [row.id, row]));
  assert.deepEqual(lines(rev0.id).map(row => [row.lengthMm, row.takeoff1, lineLengths(row, catalog).length]), [[951.54, 22.23, 951.54], [451.54, 22.23, 451.54]]);
  assert.equal(revisionSnapshot(store.get('cut_list_revisions', rev0.id))!.fittings[elbow].takeoff, 22.23);
  const rev1 = (await completeCutList(store, documents, 'iso-1', editor, keep.id)).revision;
  assert.equal(revisionSnapshot(rev1)!.fittings[elbow].takeoff, 22.23, 'a revision that keeps the standards is completed with them');
  // Apply Latest Standards: the current catalog, worked out again.
  const latest = createCutListRevision(store, 'iso-1', { mode: 'copy', standards: 'latest' }, editor);
  assert.deepEqual([latest.name, latest.standardsMode, latest.sourceRevisionId], ['Rev. 02', 'Latest', rev1.id]);
  assert.deepEqual(lines(latest.id).map(row => [row.takeoff1, row.lengthMm, row.takeoffsFixed]), [[30, 940, false], [30, 436, false]]);
  // Reports and the export read the current revision only.
  assert.deepEqual(cutListEntries(rows(store), new Set(['iso-1'])).map(entry => entry.length), [940, 436]);
  assert.deepEqual(lines(rev1.id).map(row => row.lengthMm), [955.54, 451.54], 'Rev. 01 unchanged');
  const rev2 = (await completeCutList(store, documents, 'iso-1', editor)).revision;
  // Create New Cut List: empty, the same isometric.
  const fresh = createCutListRevision(store, 'iso-1', { mode: 'new' }, editor);
  assert.deepEqual([fresh.name, fresh.source, fresh.sourceRevisionId, lines(fresh.id).length], ['Rev. 03', 'New', '', 0]);
  const added = store.create('cut_list', { isoId: 'iso-1', totalLength: 700, fit1Id: elbow }, editor);
  assert.deepEqual([added.revisionId, added.name, added.lengthMm], [fresh.id, '1', 670], 'a new line goes to the current revision and numbers from 1 there');
  assert.throws(() => store.create('cut_list', { isoId: 'iso-1', revisionId: rev2.id, totalLength: 700 }, editor), (error: { status?: number }) => error.status === 423, 'not into an earlier revision');
  assert.deepEqual(isoRevisions(store.list('cut_list_revisions'), 'iso-1').map(row => [revisionLabel(row.revNo), row.status]), [['Rev. 00', 'Completed'], ['Rev. 01', 'Completed'], ['Rev. 02', 'Completed'], ['Rev. 03', 'Draft']]);
  assert.equal(currentRevision(store.list('cut_list_revisions'), 'iso-1')!.id, fresh.id);
  // Every completed revision keeps its own document; none was replaced.
  assert.deepEqual(store.list('attachments').filter(row => row.entityId === 'iso-1' && String(row.documentType).startsWith('Cut list')).map(row => row.documentType).sort(), ['Cut list Rev 00', 'Cut list Rev 01', 'Cut list Rev 02']);
  // Copy isometrics takes the current revision only, as the copy's draft Rev. 00.
  const copied = runAction(store, 'copy-isometrics', { isoIds: ['iso-1'], projectId: 'project-skid', copyMaterials: true, copyCalculations: true }, SYSTEM);
  const copy = (copied.records ?? [])[0];
  assert.deepEqual(store.list('cut_list').filter(row => row.isoId === copy.id).map(row => [row.name, row.revisionId]), [['1', '']]);
});

test('the right "Edit completed cut lists": a box of its own in MTO Pilot; administrators have it, a materials level does not', () => {
  const area = PERMISSION_AREAS.find(item => item.key === COMPLETED_CUT_LIST_AREA)!;
  assert.deepEqual([area.name, area.module, area.verbs], ['Edit completed cut lists', 'materials', ['edit']]);
  assert.deepEqual(areaPilots(COMPLETED_CUT_LIST_AREA), ['mto']); assert.ok(PAGE_SCOPES.includes(COMPLETED_CUT_LIST_AREA));
  assert.deepEqual(parsePermissionRules(JSON.stringify({ [COMPLETED_CUT_LIST_AREA]: ['edit'] })), { [COMPLETED_CUT_LIST_AREA]: ['edit'] });
  assert.throws(() => parsePermissionRules(JSON.stringify({ [COMPLETED_CUT_LIST_AREA]: ['show'] })));
  const levels = (permissions: Partial<User['permissions']>) => ({ id: 'u', name: 'U', permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions } }) as unknown as User;
  assert.equal(canEditCompletedCutList(levels({ materials: 3, general: 2 })), false);
  assert.equal(canEditCompletedCutList(levels({ settings: 3 })), true);
  const matrix = (capabilities: Record<string, string[]>) => ({ ...levels({}), capabilities }) as unknown as User;
  assert.equal(canEditCompletedCutList(matrix({ '71': ['show', 'edit'] })), false);
  assert.equal(canEditCompletedCutList(matrix({ '71': ['show', 'edit'], [COMPLETED_CUT_LIST_AREA]: ['edit'] })), true);
});

test('Sidebar → Cut List → Cut list standards: the catalog page, its element types and the hosted delivery', () => {
  const group = PILOT_MAP.mto.groups.find(item => item.title === 'Cut List')!;
  assert.deepEqual([group.icon, group.items.map(item => [item.label, pilotItemPath(item)])], ['calculations', [['Cut list standards', '/materials/cut_fittings']]]);
  const titles = PILOT_MAP.mto.groups.map(item => item.title); assert.equal(titles.indexOf('Cut List'), titles.indexOf('Projects data') + 1);
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(pageAvailable(hosted, '/mto/materials/cut_fittings', RESOURCES));
  assert.ok(!hosted.navigation.includes('cut_list_revisions') && hosted.resources.cut_list_revisions.includes('status'));
  assert.ok(!hosted.resources.cut_list_revisions.includes('snapshot') && !hosted.resources.cut_list_revisions.includes('standards'), 'the stored norms stay on the server');
  assert.ok(hosted.resources.cut_list.includes('revisionId') && hosted.resources.cut_list.includes('takeoffsFixed'));
  // Every fitting of the client's catalog has an element type for the filter.
  const types = new Set(CUT_LIST_FITTINGS.map(([, code]) => fittingType({ code })));
  assert.ok(!types.has('Other')); assert.ok([...types].every(type => FITTING_TYPES.includes(type)));
  assert.equal(fittingType({ code: 'WN-2in-150' }), 'Weld neck flange'); assert.equal(fittingType({ code: 'e57-8in-' }), 'Elbow cutback'); assert.equal(fittingType({ code: 'XYZ' }), 'Other');
});

test('hosted API: complete, revisions and corrections; a cut list editor is refused on locked lines, an authorised account corrects with a reason', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-cut-revisions-http-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Cut-Revision-Password';
  const signIn = async (name: string, rules: Record<string, string[]>) => {
    const profile = store.create('profiles', { name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules) });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    cookie = ''; assert.equal((await request('/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  const BASE = { '4': ['show'], '5': ['show'], '10': ['show'], '64': ['show'], '71': ['show', 'insert', 'edit', 'delete', 'export', 'print'] };
  await signIn('Cut list editor', BASE);
  const elbow = fittingId(store, 'e45-1in-');
  let response = await request('/records/cut_list', 'POST', { isoId: 'iso-1', totalLength: 1000, bevel: 2, fit1Id: elbow, fit2Id: elbow });
  assert.equal(response.status, 201); const created = (await response.json()).record;
  assert.equal((await request('/cut-list/revisions', 'POST', { isoId: 'iso-1', mode: 'new' })).status, 409, 'Rev. 00 is a draft');
  response = await request('/cut-list/complete', 'POST', { isoId: 'iso-1', revisionId: '' });
  assert.equal(response.status, 201, await response.clone().text()); const completed = await response.json();
  const revision = store.get('cut_list_revisions', completed.revisionId);
  assert.equal(revision.status, 'Completed'); assert.equal(revision.completedByName, 'Cut list editor');
  // The browser receives the revision without its stored norms; the PDF opens from the Attachments.
  const listed = (await (await request('/records/cut_list_revisions')).json()).rows as Row[];
  assert.equal(listed.find(row => row.id === revision.id)!.snapshot, undefined);
  response = await request(`/files/${completed.attachmentId}`); assert.equal(response.status, 200); assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString('latin1'), '%PDF-');
  // Locked for the editor: edit, delete, add, and the correction route.
  const line = store.get('cut_list', created.id);
  assert.equal((await request(`/records/cut_list/${line.id}`, 'PUT', { bevel: 0, _version: line._version })).status, 423);
  assert.equal((await request(`/records/cut_list/${line.id}/archive`, 'POST', { _version: line._version })).status, 423);
  assert.equal((await request('/records/cut_list', 'POST', { isoId: 'iso-1', totalLength: 300 })).status, 423);
  assert.equal((await request('/cut-list/amend', 'POST', { revisionId: revision.id, action: 'edit', lineId: line.id, _version: line._version, changes: { bevel: 0 }, reason: 'Mistake' })).status, 403);
  assert.equal(store.get('cut_list', line.id)._version, line._version, 'nothing changed');
  // A new revision from the existing one.
  response = await request('/cut-list/revisions', 'POST', { isoId: 'iso-1', mode: 'copy', standards: 'keep' });
  assert.equal(response.status, 201); const next = store.get('cut_list_revisions', (await response.json()).revisionId);
  assert.equal(next.name, 'Rev. 01');
  assert.equal((await request('/cut-list/revisions', 'POST', { isoId: 'iso-1', mode: 'copy' })).status, 422, 'the standards are chosen');
  assert.equal((await request('/cut-list/revisions', 'POST', { isoId: 'iso-1', mode: 'copy', standards: 'latest' })).status, 409, 'Rev. 01 is a draft');
  // An account with the right corrects Rev. 00, with a reason; without one it is refused.
  await signIn('Cut list corrector', { ...BASE, [COMPLETED_CUT_LIST_AREA]: ['edit'] });
  assert.equal((await request('/cut-list/amend', 'POST', { revisionId: revision.id, action: 'edit', lineId: line.id, _version: line._version, changes: { bevel: 0 }, reason: '' })).status, 422);
  response = await request('/cut-list/amend', 'POST', { revisionId: revision.id, action: 'edit', lineId: line.id, _version: line._version, changes: { bevel: 0 }, reason: 'Bevel not needed' });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(store.get('cut_list', line.id).lengthMm, 955.54);
  assert.match(store.history('cut_list', line.id).events.find(event => event.action === 'amended')!.summary, /Bevel not needed/);
  // Weld Pilot has none of it.
  const weld = await fetch(`${origin}/api/cut-list/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, Cookie: cookie }, body: JSON.stringify({ isoId: 'iso-1' }) });
  assert.ok([403, 404].includes(weld.status), String(weld.status));
});
