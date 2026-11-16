import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { RESOURCE_SCOPES } from '../shared/permissions.ts';
import { SITE_RULES } from '../shared/site-scope.ts';
import { editFields } from '../shared/weld-catalogs.ts';
import { DUPLICATE_PARTS, duplicateFields } from '../shared/site-duplicate.ts';
import { BUILTIN_MEMO_TEMPLATES, MEMO_TEMPLATES, MEMO_TEXTS, MemoInputError, effectiveMemoTemplates, insertMemoTemplate, memoEditorButtons, memoText, planMemoSave, type MemoTemplate } from '../shared/memo-templates.ts';
import { ISO_BOOK_OFF_REASON, ISO_BOOK_SECTION, ISO_BOOK_SWITCHES, isoBookPartOff, isoBookSwitchOn } from '../shared/iso-book-settings.ts';
import { bookPlans, partState, type BookContext } from '../server/pdf/iso-book-parts.ts';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-11-01T00:00:00.000Z', _updatedAt: '2026-11-01T00:00:00.000Z', ...data }) as Row;
const keys = (list: MemoTemplate[]) => list.map(item => item.key);

// ----- delta-I2b-001: the catalog and its rules ------------------------------------------------------------------------

test('delta-I2b-001: every site starts with the six global templates of the reference, in sort order, with their texts', () => {
  const list = effectiveMemoTemplates([], 'site-north');
  assert.deepEqual(keys(list), ['prefab', 'field', 'ndt', 'hydro', 'safety', 'finish']);
  assert.deepEqual(list.map(item => [item.label, item.sortOrder, item.scope]), [['Prefab', 10, 'global'], ['Field install', 20, 'global'], ['NDT / inspection', 30, 'global'], ['Pressure test', 40, 'global'], ['Safety', 50, 'global'], ['Finishing', 60, 'global']]);
  assert.equal(list[0].content, 'Prefab\n- Check material and fit-up before welding.\n- Perform shop welds per WPS.\n- Mark spools and line after completion.');
  assert.equal(list[3].content.split('\n')[0], 'Pressure / hydro test');
  assert.equal(BUILTIN_MEMO_TEMPLATES[2].html, '<p><strong>NDT / inspection</strong></p><ul><li>Visual inspection before NDT where applicable.</li><li>NDT only after release / fit-up OK.</li><li>Process results before next work.</li></ul>');
  assert.equal(memoText('<p>A &amp; B<br>C</p><script>x</script>'), 'A & B\nC\nx', 'tags are dropped, never kept');
  assert.equal(MEMO_TEXTS.intro, 'Customize standard texts for this project site or add new templates. Global templates apply everywhere; site templates override or extend them.');
  assert.deepEqual(MEMO_TEXTS.columns, ['Button label', 'Key', 'Sort order']);
  assert.equal(MEMO_TEXTS.help, 'Pick a template to add standard steps quickly. Then adjust for this isometric.');
});

test('delta-I2b-001: saving a global for a site writes that site\'s copy under the same key; the other site keeps the global; a site template extends the list', () => {
  const rows: Row[] = [];
  const plan = planMemoSave(rows, 'site-north', { recordId: 'memo-global-ndt', label: 'NDT', key: 'changed', sortOrder: 30, content: 'NDT\n- Our own NDT steps.' });
  assert.equal(plan.kind, 'create');
  assert.deepEqual(plan.values, { scope: 'site', siteId: 'site-north', key: 'ndt', label: 'NDT', sortOrder: 30, content: 'NDT\n- Our own NDT steps.' }, 'the key of a global cannot change');
  rows.push(row('copy', plan.values));
  const north = effectiveMemoTemplates(rows, 'site-north'), river = effectiveMemoTemplates(rows, 'site-river');
  assert.deepEqual(keys(north), keys(river), 'the copy replaces the global in place');
  assert.deepEqual([north[2].id, north[2].scope, north[2].content, north[2].overridesGlobal], ['copy', 'site', 'NDT\n- Our own NDT steps.', true]);
  assert.deepEqual([river[2].id, river[2].scope], ['memo-global-ndt', 'global'], 'another site still sees the global');
  // Saving the global again updates the existing copy.
  assert.deepEqual(planMemoSave(rows, 'site-north', { recordId: 'memo-global-ndt', label: 'NDT 2', content: 'x' }).id, 'copy');
  // A new template of the site's own, between the globals by its sort order.
  rows.push(row('own', planMemoSave(rows, 'site-north', { label: 'Painting', key: 'paint', sortOrder: 45, content: 'Paint' }).values));
  assert.deepEqual(keys(effectiveMemoTemplates(rows, 'site-north')), ['prefab', 'field', 'ndt', 'hydro', 'paint', 'safety', 'finish']);
  assert.deepEqual(keys(effectiveMemoTemplates(rows, 'site-river')), ['prefab', 'field', 'ndt', 'hydro', 'safety', 'finish']);
  // Refusals: empty content, no label, a key used twice on the site, a record of another site.
  assert.throws(() => planMemoSave(rows, 'site-north', { label: 'X', content: '  ' }), (error: MemoInputError) => error.status === 422 && error.message === 'Content is required.');
  assert.throws(() => planMemoSave(rows, 'site-north', { label: '', content: 'x' }), (error: MemoInputError) => Boolean(error.fields.label));
  assert.throws(() => planMemoSave(rows, 'site-north', { label: 'Again', key: 'PAINT', content: 'x' }), (error: MemoInputError) => Boolean(error.fields.key));
  assert.throws(() => planMemoSave(rows, 'site-river', { recordId: 'own', label: 'X', content: 'x' }), (error: MemoInputError) => error.status === 404);
});

test('delta-I2b-001: editor buttons as the reference script; Append adds after a blank line, Replace puts the template in place', () => {
  assert.deepEqual(memoEditorButtons({ id: 'memo-global-ndt', scope: 'global', key: 'ndt' }), { remove: false, restore: false, saveForSite: true, keyReadonly: true });
  assert.deepEqual(memoEditorButtons({ id: 'copy', scope: 'site', key: 'ndt' }), { remove: true, restore: true, saveForSite: false, keyReadonly: false });
  assert.deepEqual(memoEditorButtons({ id: 'own', scope: 'site', key: '' }), { remove: true, restore: false, saveForSite: false, keyReadonly: false });
  assert.deepEqual(memoEditorButtons({ scope: 'site', key: '' }), { remove: false, restore: false, saveForSite: false, keyReadonly: false }, 'New template: Save and Cancel only');
  assert.equal(insertMemoTemplate('', 'A'), 'A');
  assert.equal(insertMemoTemplate('Existing\n', 'A'), 'Existing\n\nA');
  assert.equal(insertMemoTemplate('Existing', 'A', 'replace'), 'A');
});

test('delta-I2b-001: the record type has a table, a site rule, the project-site permission area and no unique rule; the generic records API cannot write it', async () => {
  const { planHostedSchema } = await import('../server/hosted-schema.ts');
  const empty = () => ({ tables: new Map(), columns: new Map(), foreignKeys: new Map(), indexes: new Map() });
  const plan = planHostedSchema(empty()), before = planHostedSchema(empty(), RESOURCES.filter(resource => resource.key !== MEMO_TEMPLATES));
  assert.deepEqual(plan.tables.filter(table => !before.tables.includes(table)), [MEMO_TEMPLATES], 'one new table');
  assert.ok(plan.columns.some(column => column.table === MEMO_TEMPLATES && column.field === 'siteId' && column.target === 'sites'));
  assert.deepEqual(plan.indexes, before.indexes, 'no index changes');
  assert.deepEqual(RESOURCE_SCOPES[MEMO_TEMPLATES], ['4']);
  assert.deepEqual(SITE_RULES[MEMO_TEMPLATES], { via: [['siteId', 'sites']], orphan: 'global' });
  assert.equal(RESOURCE_MAP[MEMO_TEMPLATES].readonly, true);
});

// ----- the server ---------------------------------------------------------------------------------------------------------

const PASSWORD = 'Memo-Templates-Test-Password';
const NONE = 'No access';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-memo-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, data?: unknown) => {
      const response = await fetch(`${origin}/api${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, 'X-Stelux-Pilot': 'weld', ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { request, login: async (email: string) => { assert.equal((await request('/auth/login', { email, password: PASSWORD })).status, 200, email); } };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { name: 'Memo admin', email: 'memo-admin@example.test', password: PASSWORD })).status, 201);
  const account = async (name: string, rules: Record<string, string[]>) => {
    const profile = store.create('profiles', { name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE, toolsPermission: NONE, settingsPermission: NONE });
    const email = `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, user = store.create('users', { name, email, active: true, profileId: profile.id });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const own = client(); await own.login(email); return own;
  };
  return { store, admin, account };
}
const listing = async (response: Response) => { assert.equal(response.status, 200, await response.clone().text()); return await response.json() as { templates: MemoTemplate[]; canEdit: boolean }; };

test('delta-I2b-001 (server): a site override replaces the global for that site only; the isometric buttons list the templates of the open main project; Restore and Delete archive', async t => {
  const f = await fixture(t);
  const north = 'site-north', river = 'site-river';
  const riverProject = f.store.create('projects', { internnumber: 'MEMO-RIVER', siteId: river, weldPilot: true, mtoPilot: true });
  const northProject = f.store.list('projects').find(project => project.siteId === north)!;
  assert.deepEqual(keys((await listing(await f.admin.request(`/memo-templates?siteId=${north}`))).templates), ['prefab', 'field', 'ndt', 'hydro', 'safety', 'finish'], 'a site sees the global templates');

  // "Save for this site" on the global NDT template.
  const saved = await listing(await f.admin.request('/memo-templates/save', { siteId: north, recordId: 'memo-global-ndt', label: 'NDT / inspection', sortOrder: 30, content: 'NDT\n- North yard steps.' }));
  const copy = saved.templates.find(item => item.key === 'ndt')!;
  assert.deepEqual([copy.scope, copy.content], ['site', 'NDT\n- North yard steps.']);
  assert.equal(f.store.list(MEMO_TEMPLATES).length, 1, 'one site row; the global is not a stored row and stays unchanged');
  assert.equal((await listing(await f.admin.request(`/memo-templates?siteId=${river}`))).templates.find(item => item.key === 'ndt')!.scope, 'global', 'another site still sees the global');
  // The isometric's buttons: exactly the templates of its main project.
  assert.deepEqual((await listing(await f.admin.request(`/memo-templates?projectId=${northProject.id}`))).templates, saved.templates);
  assert.deepEqual((await listing(await f.admin.request(`/memo-templates?projectId=${riverProject.id}`))).templates, effectiveMemoTemplates([], river));

  // Refusals: empty content, Delete of a global.
  const empty = await f.admin.request('/memo-templates/save', { siteId: north, label: 'Empty', content: '' });
  assert.equal(empty.status, 422); assert.equal((await empty.json() as { error?: string; message?: string }).error ?? '', 'Content is required.');
  assert.equal((await f.admin.request('/memo-templates/delete', { siteId: north, recordId: 'memo-global-prefab' })).status, 422);
  // Restore default archives the copy; the global applies again.
  const restored = await listing(await f.admin.request('/memo-templates/restore', { siteId: north, key: 'ndt' }));
  assert.equal(restored.templates.find(item => item.key === 'ndt')!.scope, 'global');
  assert.equal(f.store.list(MEMO_TEMPLATES).length, 0); assert.equal(f.store.list(MEMO_TEMPLATES, true).length, 1, 'archived, not removed');
  // A template of the site's own; Delete archives it.
  const own = (await listing(await f.admin.request('/memo-templates/save', { siteId: north, label: 'Painting', key: 'paint', sortOrder: 45, content: 'Paint' }))).templates.find(item => item.key === 'paint')!;
  assert.deepEqual(keys((await listing(await f.admin.request('/memo-templates/delete', { siteId: north, recordId: own.id }))).templates), ['prefab', 'field', 'ndt', 'hydro', 'safety', 'finish']);
});

test('delta-I2b-001 (server): an account without the right to edit the project site cannot change templates (403); one with it can', async t => {
  const f = await fixture(t);
  const viewer = await f.account('Memo viewer', { '4': ['show'], '5': ['show'], '64': ['show'] });
  const editor = await f.account('Memo editor', { '4': ['show', 'edit'] });
  const outsider = await f.account('Memo outsider', { '5': ['show'] });
  const body = { siteId: 'site-north', recordId: 'memo-global-safety', label: 'Safety', content: 'Safety first.' };
  const read = await listing(await viewer.request('/memo-templates?siteId=site-north'));
  assert.equal(read.canEdit, false);
  assert.equal((await viewer.request('/memo-templates/save', body)).status, 403);
  assert.equal((await viewer.request('/memo-templates/restore', { siteId: 'site-north', key: 'safety' })).status, 403);
  assert.equal((await viewer.request('/memo-templates/delete', { siteId: 'site-north', recordId: 'x' })).status, 403);
  assert.equal(f.store.list(MEMO_TEMPLATES).length, 0, 'nothing stored');
  assert.equal((await outsider.request('/memo-templates?siteId=site-north')).status, 403, 'reading needs the project site view right');
  assert.equal((await editor.request('/memo-templates/save', body)).status, 200);
  assert.equal(f.store.list(MEMO_TEMPLATES)[0].siteId, 'site-north');
  // The isometric buttons need the isometric view right (not the project site right).
  const project = f.store.list('projects').find(item => item.siteId === 'site-north')!;
  assert.equal((await viewer.request(`/memo-templates?projectId=${project.id}`)).status, 200);
  assert.equal((await editor.request(`/memo-templates?projectId=${project.id}`)).status, 404, 'a project the account cannot read is not found');
});

test('delta-I2b-001 / shell-general-012 (server): Duplicate Project site offers ISO Book and Memo templates and copies the switches and the site\'s templates', async t => {
  const f = await fixture(t);
  assert.deepEqual(DUPLICATE_PARTS.filter(part => part.group === 'Site settings').map(part => part.label), ['Project settings', 'Document settings', 'Iso progress', 'ISO Book']);
  assert.deepEqual(DUPLICATE_PARTS.filter(part => part.group === 'Activated lists').map(part => part.label).slice(0, 5), ['NDT process', 'Weld types', 'WPS methods', 'Welders', 'Memo templates']);
  assert.deepEqual(duplicateFields(DUPLICATE_PARTS.find(part => part.key === 'isobook')!), ISO_BOOK_SWITCHES.map(item => item.name));
  const site = f.store.get('sites', 'site-north');
  f.store.update('sites', site.id, { isoBookFlangeReport: false, isoBookLislMv: false }, site._version);
  assert.equal((await f.admin.request('/memo-templates/save', { siteId: 'site-north', recordId: 'memo-global-hydro', label: 'Pressure test', content: 'Hydro of North' })).status, 200);
  const response = await f.admin.request('/actions/duplicate-site', { siteId: 'site-north', parts: ['isobook', 'memoTemplates'] });
  assert.equal(response.status, 201, await response.clone().text());
  const copy = (await response.json() as { record: Row }).record;
  assert.equal(copy.isoBookFlangeReport, false); assert.equal(copy.isoBookLislMv, false); assert.equal(copy.isoBookTask, true);
  const templates = effectiveMemoTemplates(f.store.list(MEMO_TEMPLATES), copy.id);
  assert.deepEqual([templates.find(item => item.key === 'hydro')!.scope, templates.find(item => item.key === 'hydro')!.content], ['site', 'Hydro of North']);
  assert.equal(effectiveMemoTemplates(f.store.list(MEMO_TEMPLATES), 'site-north').find(item => item.key === 'hydro')!.content, 'Hydro of North', 'the source keeps its own');
});

// ----- shell-general-012: the ISO Book tab --------------------------------------------------------------------------------

test('shell-general-012: Edit project site has the ISO Book tab with 12 LISL variants and 25 document types in the captured order, all on; Add has no such tab', () => {
  assert.deepEqual(ISO_BOOK_SWITCHES.filter(item => item.group === 'LISL').map(item => item.label), ['LISL', 'LISL V2', 'LISL A3', 'Weld record', 'LISL [GU]', 'LISL [MV]', 'LISL [WQ]', 'LISL [GU Rev 2]', 'Blank LISL', 'LISL [ISS]', 'LISL [GU Rev 3]', 'LISL [WQ ver 2]']);
  assert.deepEqual(ISO_BOOK_SWITCHES.filter(item => item.group === 'Documents').map(item => item.label), ['Task sheet', 'ITP documents', 'ITP 2 documents', 'Isometric', 'NDT Pre', 'NDT', 'Pre-HT/PWHT', 'Pick Lists', 'PQR', 'WPS', 'WPS (Group)', "Welder's summary lists", "Welders' certifications", 'Visual reports', 'Welding wires', 'Certificate Index', 'Material certificates', 'Material certificates (Group)', 'Prefab release document', 'Field release document', 'Punch list (blank)', 'Punch list', 'NDT Process documents', 'Flange report', 'Flange labels']);
  const sites = projectResource(availabilityFor(HOSTED_RELEASE_PROFILE), RESOURCE_MAP.sites);
  const book = sites.fields.filter(field => field.section === ISO_BOOK_SECTION);
  assert.equal(book.length, 37);
  assert.ok(book.every(field => field.type === 'checkbox' && field.default === true && field.hidden === true), 'Add project site: not shown, every switch on for a new site');
  const sections = [...new Set(editFields('sites', sites.fields).filter(field => !field.hidden).map(field => field.section))];
  assert.deepEqual(sections.slice(-2), ['Iso progress', ISO_BOOK_SECTION], 'Edit project site: the ISO Book tab after Iso progress');
  assert.equal(isoBookSwitchOn({}, 'isoBookTask'), true, 'a site saved before the tab existed has every switch on');
  assert.equal(isoBookSwitchOn({ isoBookTask: false }, 'isoBookTask'), false);
});

test('shell-general-012: the ISO Book of an isometric offers only the parts its main project switches on', () => {
  const plans = bookPlans(PDF_DOCUMENTS, []);
  const plan = (key: string) => plans.find(item => item.key === key)!;
  const off = { id: 'site-a', isoBookFlangeReport: false, isoBookLislMv: false };
  const context = (site: Record<string, unknown>): BookContext => ({ user: { id: 'u', permissions: { general: 3, materials: 3, welding: 3, tools: 3, settings: 3 } } as unknown as User, rows: { projects: [row('p1', { siteId: 'site-a' })] }, registry: PDF_DOCUMENTS, canFile: () => true, site: () => site as Row, certificateLinks: () => [] });
  const iso = row('iso-a', { projectId: 'p1' });
  for (const key of ['flange-report', 'lisl:lisl-mv']) {
    assert.ok(plan(key), key);
    assert.deepEqual(partState(plan(key), context(off), iso), { available: false, reason: ISO_BOOK_OFF_REASON, generators: [], files: [] }, key);
    assert.notEqual(partState(plan(key), context({ id: 'site-a' }), iso).reason, ISO_BOOK_OFF_REASON, `${key} is offered while switched on`);
  }
  assert.equal(partState(plan('task-sheet'), context(off), iso).available, true, 'other parts stay');
  assert.equal(isoBookPartOff(off, 'mto-report'), false, 'a part without a switch is never off');
  // Every part key a switch names exists in the book.
  for (const item of ISO_BOOK_SWITCHES.filter(entry => entry.part)) assert.ok(plans.some(candidate => candidate.key === item.part), item.part);
});
