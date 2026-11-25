import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { passwordHash } from '../server/auth.ts';
import { reportData } from '../shared/dashboard-reports.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { canAction } from '../shared/permissions.ts';
import { currentRevision } from '../shared/revisions.ts';
import {
  ISO_MENU_GROUPS, ISO_PAGE_MENU, dataLislUrl, menuGroups, currentRevisionFile, headerFields, headingHasOptions, highestIrnCounter, irnNumber, isometricDeleteNotice, nextIrnSeries, nextRevisionNumber,
  PHASE_LABELS, phaseBoxes, PROJECT_OPTIONS, PROJECT_PRINT_ENTRIES, PROJECT_ROW_ACTIONS, projectDeleteRefusal, REVISION_DIALOGS, revisionInputType,
} from '../shared/iso-pages.ts';
import { PDF_MENU, pdfEntries } from '../client/pdf-reports.tsx';
import { DUPLICATE_PARTS, duplicateFields } from '../shared/site-duplicate.ts';
import type { Row } from '../shared/types.ts';

// ----- pure rules ----------------------------------------------------------------------------------------------------

test('Projects: the Options menu and the row buttons are the reference lists in the reference order', () => {
  assert.deepEqual([...PROJECT_OPTIONS], ['Delete selected projects', 'Edit projects (Mass edit)', 'Generate multiple WP books', 'Show deleted work packages']);
  assert.deepEqual([...PROJECT_ROW_ACTIONS], ['Open', 'Print', 'Punch list', 'Edit', 'Delete']);
  assert.deepEqual([...PROJECT_PRINT_ENTRIES], ['Certification index', 'Project book']);
  // The print entries come from documents that exist; the punch-list button prints the punch items of the project.
  assert.deepEqual(pdfEntries('weld', 'certifications').map(entry => entry.label), ['Certification index']);
  assert.deepEqual(pdfEntries('weld', 'projects').map(entry => [entry.label, entry.key]), [['Punch list', 'punch-list']]);
  assert.deepEqual(pdfEntries('mto', 'projects'), [], 'MTO Pilot has no punch lists');
  assert.ok(PDF_MENU.every(entry => entry.page !== 'projects' || entry.options.includes('project')));
});

test('Set phase: the hosted labels are the reference names; one isometric puts Isometric formatted before Welds defined, the mass dialog after', () => {
  const availability = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const flags = projectResource(availability, RESOURCE_MAP.isometrics).fields.filter(field => field.section === 'Phases');
  const mass = ['Materials (MTOP)', 'Estimate (ESTP)', 'Welds defined (WP)', 'Isometric formatted', 'Field documentation', 'Test documentation', 'Release documentation', 'Work preparation 100%'];
  assert.deepEqual(phaseBoxes(flags, 2).map(field => field.label), mass);
  assert.deepEqual(phaseBoxes(flags, 1).map(field => field.label), ['Materials (MTOP)', 'Estimate (ESTP)', 'Isometric formatted', 'Welds defined (WP)', 'Field documentation', 'Test documentation', 'Release documentation', 'Work preparation 100%']);
  assert.deepEqual(Object.keys(PHASE_LABELS).sort(), flags.map(field => field.name).sort());
  // The other profile keeps its own labels.
  assert.equal(RESOURCE_MAP.isometrics.fields.find(field => field.name === 'prefab_welds')!.label, 'Welds complete');
});

test('Add rev: the next number is the current one plus one; the three dialogs carry the reference titles and input types', () => {
  assert.equal(nextRevisionNumber('2'), '3');
  assert.equal(nextRevisionNumber('0'), '1');
  assert.equal(nextRevisionNumber('2.5'), '3.5');
  assert.equal(nextRevisionNumber('B'), '');
  assert.deepEqual(Object.values(REVISION_DIALOGS).map(dialog => dialog.title), ['Add rev', 'Add ITP revision', 'Add ITP revision 2']);
  assert.deepEqual(['ISO', 'ITP', 'ITP 2'].map(revisionInputType), ['text', 'number', 'number']);
  const rows = { isometrics: [{ id: 'i', revNo: '2' }], revisions: [{ id: 'r2', isoId: 'i', type: 'ISO', revNo: '2', _createdAt: '2026-01-02' }], attachments: [{ id: 'f', entityType: 'revisions', entityId: 'r2', name: 'x.pdf' }] } as unknown as Record<string, Row[]>;
  assert.equal(nextRevisionNumber(currentRevision(rows, 'i')), '3');
  assert.equal(currentRevisionFile(rows, 'i', 'ISO', '2')?.id, 'f', 'the slot finds the file saved with the revision');
});

test('Automatic IRN numbers: unique four-letter series, four-digit counter, counter derived from the highest existing IRN', () => {
  assert.equal(nextIrnSeries([]), 'AAAA');
  assert.equal(nextIrnSeries(['AAAA', 'aaab']), 'AAAC');
  assert.equal(irnNumber('AABC', 1), 'AABC0001');
  assert.equal(highestIrnCounter('AABC', ['AABC0007', 'AABC0002', 'XYZ0100', '', 'AABCX1', null]), 7);
  assert.equal(highestIrnCounter('AABC', []), 0);
  // The flags belong to one main project: a duplicate never copies them.
  for (const part of DUPLICATE_PARTS) for (const name of ['irnCode', 'irnAuto', 'irnCounter']) assert.ok(!duplicateFields(part).includes(name), `${part.key} ${name}`);
});

test('Delete: an isometric is never refused by what hangs on it (the notice names it); projects only while blank', () => {
  const none = { welds: 0, materials: 0, reserved: 0, calculations: 0, started: 0 };
  assert.match(isometricDeleteNotice(none), /welds and materials leave all figures/);
  assert.match(isometricDeleteNotice({ ...none, welds: 2, materials: 1, started: 1 }), /deletes 2 welds, 1 material line with it.*pick list or release/);
  assert.equal(projectDeleteRefusal(0), '');
  assert.match(projectDeleteRefusal(3), /Only unused \(blank\) projects can be deleted/);
});

test('Edit isometric: Add new takes the header fields, not the assignments, progress or phases; the right follows Copy isometrics', () => {
  const names = headerFields(RESOURCE_MAP.isometrics.fields);
  assert.ok(names.includes('isoNo') && names.includes('irn') && names.includes('pipingClass'));
  for (const name of ['projectId', 'testSystemId', 'fieldPackageId', 'prefab_doc', 'field_release']) assert.ok(!names.includes(name), name);
});

test('one Options menu on the isometric page: Attachments, Audit trail and Set phase are in it everywhere but beside Material Core\'s Materials tab', () => {
  assert.equal(headingHasOptions(true, 'welds'), true, 'Weld Core: the LISL entries join the page menu, so these three are there');
  assert.equal(headingHasOptions(true, 'mto'), false, 'the Materials tab keeps its own Options menu with them');
  assert.equal(headingHasOptions(true, 'documents'), true);
  assert.equal(headingHasOptions(true, 'cut-list'), true);
  assert.equal(headingHasOptions(false, 'documents'), false, 'no Core: not offered');
});

test('D11: the page part of the Options menu keeps every entry point of the old heading, tab strip and Progress card; destructive last', () => {
  assert.deepEqual(ISO_PAGE_MENU.map(entry => entry.key), ['edit-isometric', 'edit-quantities', 'spools', 'documents', 'attachments', 'audit-trail', 'set-phase', 'data-lisl', 'other-core', 'archive']);
  assert.deepEqual(ISO_PAGE_MENU.filter(entry => entry.group === 'danger').map(entry => entry.label), ['Delete isometric']);
  assert.deepEqual(ISO_MENU_GROUPS, ['welds', 'isometric', 'danger']);
  const shown = menuGroups(ISO_PAGE_MENU, entry => ['edit-isometric', 'archive'].includes(entry.key) ? entry.label : null);
  assert.deepEqual(shown.map(group => [group.group, group.items.map(item => item.node)]), [['isometric', ['Edit isometric']], ['danger', ['Delete isometric']]]);
  assert.deepEqual(menuGroups(ISO_PAGE_MENU, () => null), [], 'nothing offered: no menu');
  assert.equal(dataLislUrl({ id: 'iso-7', projectId: 'project-3' } as unknown as Parameters<typeof dataLislUrl>[0]), '/welding/lisl?project_id=project-3&iso_id=iso-7', 'Open Data LISL lands filtered on the isometric');
});

// ----- hosted API ----------------------------------------------------------------------------------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-isopages-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const form = data instanceof FormData;
    const response = await fetch(origin + path, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Pages admin', email: 'pages-admin@example.test', password: 'Iso-Pages-Test-Password' })).status, 201);
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profileRow = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profileRow.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash('Iso-Pages-Test-Password'));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password: 'Iso-Pages-Test-Password' })).status, 200);
  };
  return { store, request, signIn };
}
const message = async (response: Response) => String((await response.json()).error);

test('hosted: an isometric is deleted at any time by users with the Delete right (welds, materials, started work go with it); a project with isometrics stays', async t => {
  const f = await hostedFixture(t);
  const withWelds = f.store.get('isometrics', 'iso-1');
  const count = (key: string, isoId = 'iso-1') => f.store.list(key).filter(row => row.isoId === isoId).length;
  const figures = () => reportData(Object.fromEntries(['welds', 'isometrics', 'projects', 'welders', 'weld_types', 'inspection_requests', 'itps', 'sites'].map(key => [key, f.store.list(key)])), {}).welds.filter(item => item.weld.isoId === 'iso-1').length;
  // Started work: a pick list of the isometric (the old refusal "work has already started").
  const picklist = f.store.create('picklists', { isoId: 'iso-1', materialId: f.store.list('materials')[0].id, quantity: 1 });
  assert.ok(picklist.id && count('picklists') > 0 && count('welds') > 0 && count('iso_materials') > 0 && figures() > 0, 'welds, materials and a pick list hang on it and the weld figures count it');
  const others = f.store.list('welds').filter(weld => weld.isoId !== 'iso-1').length;
  // Without the Delete right on isometrics nothing is deleted.
  const reader = await hostedFixture(t); reader.store.create('picklists', { isoId: 'iso-1', materialId: reader.store.list('materials')[0].id, quantity: 1 });
  await reader.signIn('Iso reader', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  assert.equal((await reader.request('/api/records/isometrics/iso-1/archive', 'POST', { _version: reader.store.get('isometrics', 'iso-1')._version })).status, 403);
  assert.equal(reader.store.get('isometrics', 'iso-1')._archived, false);
  // The admin deletes it although it has welds, materials and started work.
  const deleted = await f.request('/api/records/isometrics/iso-1/archive', 'POST', { _version: withWelds._version });
  assert.equal(deleted.status, 200, await deleted.clone().text());
  assert.equal(f.store.get('isometrics', 'iso-1', true)._archived, true);
  assert.deepEqual(['welds', 'iso_materials', 'picklists', 'spools'].map(key => count(key)), [0, 0, 0, 0], 'what hangs on it is deleted with it');
  assert.equal(f.store.list('welds').length, others, 'no other isometric is touched');
  assert.equal(figures(), 0, 'the weld figures (WDI, welder statistics) no longer count it');
  // A project that still has isometrics is not blank.
  const project = f.store.get('projects', String(withWelds.projectId));
  const kept = await f.request(`/api/records/projects/${project.id}/archive`, 'POST', { _version: project._version });
  assert.equal(kept.status, 422); assert.match(await message(kept), /Only unused \(blank\) projects can be deleted/);
  // A blank isometric can be deleted (archived), and a blank project after it.
  const blank = await f.request('/api/records/isometrics', 'POST', { isoNo: 'BLANK-1', projectId: project.id });
  assert.equal(blank.status, 201); const created = (await blank.json()).record as Row;
  assert.equal((await f.request(`/api/records/isometrics/${created.id}/archive`, 'POST', { _version: created._version })).status, 200);
});

test('hosted: Automatically add IRN numbers numbers the isometrics without IRN in creation order, then new ones follow and a typed IRN is refused', async t => {
  const f = await hostedFixture(t);
  const site = f.store.create('sites', { name: 'IRN site' });
  const project = f.store.create('projects', { internnumber: 'IRN-1', siteId: site.id });
  const first = f.store.create('isometrics', { isoNo: 'A-1', projectId: project.id });
  const second = f.store.create('isometrics', { isoNo: 'A-2', projectId: project.id });
  const manual = f.store.create('isometrics', { isoNo: 'A-3', projectId: project.id, irn: 'KEEP-9' });
  const third = f.store.create('isometrics', { isoNo: 'A-4', projectId: project.id });
  // Without the action the flags cannot be written by hand.
  const forged = await f.request(`/api/records/sites/${site.id}`, 'PUT', { irnAuto: true, _version: site._version });
  assert.equal(forged.status, 422);
  const done = await f.request('/api/actions/fill-irn', 'POST', { siteId: site.id });
  assert.equal(done.status, 201, await done.clone().text());
  const series = String(f.store.get('sites', site.id).irnCode);
  assert.match(series, /^[A-Z]{4}$/);
  assert.deepEqual([first, second, manual, third].map(row => f.store.get('isometrics', row.id).irn), [`${series}0001`, `${series}0002`, 'KEEP-9', `${series}0003`]);
  // A new isometric is numbered by the server; typing an IRN is refused, and so is changing one.
  const added = await f.request('/api/records/isometrics', 'POST', { isoNo: 'A-5', projectId: project.id });
  assert.equal(added.status, 201); assert.equal(((await added.json()).record as Row).irn, `${series}0004`);
  const typed = await f.request('/api/records/isometrics', 'POST', { isoNo: 'A-6', projectId: project.id, irn: 'MINE-1' });
  assert.equal(typed.status, 422); assert.match(await message(typed), /filled in automatically/);
  const edit = await f.request(`/api/records/isometrics/${first.id}`, 'PUT', { irn: 'MINE-2', _version: f.store.get('isometrics', first.id)._version });
  assert.equal(edit.status, 422);
  // Running it again numbers nothing new and keeps every number.
  assert.equal((await f.request('/api/actions/fill-irn', 'POST', { siteId: site.id })).status, 201);
  assert.equal(f.store.get('isometrics', first.id).irn, `${series}0001`);
  // The series is unique per main project.
  const other = f.store.create('sites', { name: 'Other', irnCode: series });
  const clash = await f.request('/api/actions/fill-irn', 'POST', { siteId: other.id });
  assert.equal(clash.status, 422);
  // The message names the series and the other main project and says who resolves it (the form has no IRN Code field any more).
  const body = await clash.json() as { error: string; fields?: Record<string, string> };
  assert.equal(body.fields?.siteId, `IRN series ${series} is also stored on main project "${String(site.name)}", so no IRN numbers were added. Ask an administrator to give one of the two main projects another IRN series, then try again.`);
  assert.doesNotMatch(JSON.stringify(body), /own IRN code/);
});

test('hosted: Add new saves the edited header as a new isometric of the same project and copies welds, materials and calculations when ticked', async t => {
  const f = await hostedFixture(t);
  const source = f.store.get('isometrics', 'iso-1');
  const weldCount = f.store.list('welds').filter(weld => weld.isoId === source.id).length;
  assert.ok(weldCount > 0);
  const before = f.store.list('isometrics').length;
  const plain = await f.request('/api/actions/add-new-isometric', 'POST', { isoId: source.id, projectId: source.projectId, values: { isoNo: 'STX-CW-001-N' } });
  assert.equal(plain.status, 201, await plain.clone().text());
  const bare = ((await plain.json()).records as Row[])[0];
  assert.equal(bare.isoNo, 'STX-CW-001-N'); assert.equal(bare.projectId, source.projectId);
  assert.equal(f.store.list('welds').filter(weld => weld.isoId === bare.id).length, 0, 'nothing copied unless ticked');
  const withWelds = await f.request('/api/actions/add-new-isometric', 'POST', { isoId: source.id, projectId: source.projectId, values: { isoNo: 'STX-CW-001-W', pipingClass: 'X1' }, copyWelds: true });
  assert.equal(withWelds.status, 201, await withWelds.clone().text());
  const copy = ((await withWelds.json()).records as Row[])[0];
  assert.equal(copy.pipingClass, 'X1', 'the edited value is used');
  assert.equal(f.store.list('welds').filter(weld => weld.isoId === copy.id).length, weldCount, 'the welds are copies');
  assert.equal(f.store.get('isometrics', source.id).pipingClass, source.pipingClass, 'the source keeps its values');
  assert.equal(f.store.list('isometrics').length, before + 2);
  // The ISO number must be new in the project; a field that is not part of the header is refused.
  const clash = await f.request('/api/actions/add-new-isometric', 'POST', { isoId: source.id, projectId: source.projectId, values: { isoNo: String(source.isoNo) } });
  assert.equal(clash.status, 422); assert.match(await message(clash), /already exists/);
  const forged = await f.request('/api/actions/add-new-isometric', 'POST', { isoId: source.id, projectId: source.projectId, values: { isoNo: 'F-1', prefab_doc: true } });
  assert.equal(forged.status, 422);
  assert.ok(canAction({ id: 'u', name: 'u', email: 'u', profileId: 'p', permissions: { general: 2, materials: 2, welding: 2, tools: 0, settings: 0 } } as never, 'add-new-isometric', { copyWelds: true }));
  assert.equal(availabilityFor('welding-demo')!.actions['add-new-isometric'], undefined, 'other profiles do not deliver it');
});

test('hosted: Add rev saves the file, the next number and the comment in one request, and the current revision follows', async t => {
  const f = await hostedFixture(t);
  const iso = f.store.get('isometrics', 'iso-2');
  const rows = { isometrics: [iso], revisions: f.store.list('revisions') } as unknown as Record<string, Row[]>;
  const next = nextRevisionNumber(currentRevision(rows, iso.id));
  assert.notEqual(next, '');
  const form = new FormData();
  for (const [name, value] of Object.entries({ isoId: iso.id, type: 'ISO', revNo: next, date: '2026-11-01', comment: 'Studs changed' })) form.set(name, value);
  form.set('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'drawing.pdf');
  const saved = await f.request('/api/revisions', 'POST', form);
  assert.equal(saved.status, 201, await saved.clone().text());
  const revision = (await saved.json()).record as Row;
  assert.equal(revision.revNo, next); assert.equal(revision.comment, 'Studs changed');
  const file = f.store.list('attachments').find(item => item.entityType === 'revisions' && item.entityId === revision.id)!;
  assert.ok(file && file.name === 'drawing.pdf');
  assert.equal(f.store.get('isometrics', iso.id).revNo, next);
  // The same number again is refused; a file that is not a PDF is refused; a forged field name is refused.
  const again = new FormData(); again.set('isoId', iso.id); again.set('type', 'ISO'); again.set('revNo', next);
  assert.equal((await f.request('/api/revisions', 'POST', again)).status, 409);
  const image = new FormData(); image.set('isoId', iso.id); image.set('type', 'ISO'); image.set('revNo', '99'); image.set('file', new Blob(['x'], { type: 'image/png' }), 'x.png');
  assert.equal((await f.request('/api/revisions', 'POST', image)).status, 422);
  const forged = new FormData(); forged.set('isoId', iso.id); forged.set('type', 'ISO'); forged.set('revNo', '98'); forged.set('previousRev', 'x');
  assert.equal((await f.request('/api/revisions', 'POST', forged)).status, 404);
});
