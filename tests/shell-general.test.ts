import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { NO_RIGHTS_TEXT, PILOTS, PILOT_MAP, pagePilots, pilotItemPath, pilotItemState, pilotPageState, type MenuRights } from '../shared/pilots.ts';
import { PROGRESS_DEFAULTS, PROGRESS_FIELDS, PROGRESS_MODEL } from '../shared/site-settings.ts';
import { isoProgress } from '../shared/iso-status.ts';
import { HOSTED_DEFAULT_SORT, listDefaultSort } from '../shared/welder-data.ts';
import { ATTACHMENT_POSITIONS, attachmentNamesInOrder, isStandardAttachmentName, moveEntry, orderedAttachmentNames, reorderedAttachmentIds, missingRequired } from '../shared/weld-catalogs.ts';
import { DUPLICATE_PARTS, copyName, duplicateParts } from '../shared/site-duplicate.ts';
import { SITE_DEFAULT_SORT, SITE_LIST_COLUMNS, SITE_PAGE_SIZES, siteListRows } from '../shared/site-list.ts';
import { EMPTY_TABLE_TEXT, NO_MATCH_TEXT, entriesText } from '../shared/ui-texts.ts';
import { passwordStrength } from '../shared/password-strength.ts';
import { companyFormLabels, logoSizing } from '../shared/pdf-company.ts';
import { NOTIFICATION_LIMIT, NO_NOTIFICATIONS, safeNotificationLink, unreadNotifications, visibleNotifications } from '../shared/notifications.ts';
import { canResource } from '../shared/permissions.ts';
import { SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import { PilotNoRights, PilotSelector, pilotHomePath } from '../client/pilot.tsx';
import { SITE_DELETE, SITE_DELETE_BLOCKED, siteHasProjects } from '../client/sites-page.tsx';
import { SITE_DELETE_REFUSED } from '../server/release-access.ts';
import { PasswordStrengthMeter } from '../client/shell-parts.tsx';
import type { Bootstrap, Row, User } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '2026-01-01T00:00:00.000Z', _updatedAt: '', ...extra }) as Row;
const site = projectResource(hosted, RESOURCE_MAP.sites);
const field = (name: string) => site.fields.find(item => item.name === name)!;

// ----- -001 Project sites: no menu entry, "Change site" leads to the same screen ------------------------------------------
test('Project sites has no menu entry in either Core (it duplicates Change site) but its page stays open to both; Change site offers add / edit / archive', () => {
  for (const pilot of PILOTS) {
    assert.ok(!pilot.groups.some(group => group.title === 'General data'), pilot.key);
    assert.ok(!pilot.groups.flatMap(group => group.items).some(item => item.label === 'Project sites' || item.resource === 'sites'), pilot.key);
  }
  assert.deepEqual(pagePilots('/workspace/sites'), ['weld', 'mto'], 'the Project sites page is still a shared workspace page, never No access');
  const picker = readFileSync(join(process.cwd(), 'client', 'project-workspace.tsx'), 'utf8');
  assert.match(picker, /Add main project/); assert.match(picker, /Edit main project/); assert.match(picker, /Archived projects/); assert.match(picker, /<RecordEditor resourceKey="sites"/);
  assert.deepEqual(site.columns, ['name', 'address', 'phone', 'email', 'irnCode']);
  assert.deepEqual([...SITE_LIST_COLUMNS], site.columns);
  assert.deepEqual(SITE_PAGE_SIZES, [5, 20, 50, 100, 500]);
  assert.deepEqual(['Name', 'Address', 'Phone', 'Email address'], ['name', 'address', 'phone', 'email'].map(name => field(name).label));
  assert.equal(HOSTED_DEFAULT_SORT.sites, 'irnCode'); assert.equal(listDefaultSort('sites', true, 'name'), 'irnCode'); assert.equal(listDefaultSort('sites', false, 'name'), 'name');
});
test('the list of project sites is sorted by IRN Code, archived sites are separate, search covers the shown columns', () => {
  const rows = [row('c', { name: 'Harbour', irnCode: 'IRN-20', address: '1 Quay' }), row('a', { name: 'Yard', irnCode: 'IRN-3', phone: '555' }), row('b', { name: 'Old', irnCode: 'IRN-1', _archived: true }), row('d', { name: 'Alpha', irnCode: 'IRN-3', email: 'x@example.test' })];
  assert.deepEqual(siteListRows(rows, { archived: false, query: '', sort: SITE_DEFAULT_SORT }).map(item => item.id), ['d', 'a', 'c'], 'IRN 3, IRN 3 (by name), IRN 20 (numeric order)');
  assert.deepEqual(siteListRows(rows, { archived: true, query: '', sort: SITE_DEFAULT_SORT }).map(item => item.id), ['b']);
  assert.deepEqual(siteListRows(rows, { archived: false, query: 'quay', sort: SITE_DEFAULT_SORT }).map(item => item.id), ['c']);
  assert.deepEqual(siteListRows(rows, { archived: false, query: '', sort: { field: 'name', direction: -1 } }).map(item => item.id), ['a', 'c', 'd']);
});
test('lists and pages use the reference texts', () => {
  assert.equal(EMPTY_TABLE_TEXT, 'No data available in table'); assert.equal(NO_MATCH_TEXT, 'No matching records found');
  assert.equal(entriesText(1, 20, 57), 'Showing 1 to 20 of 57 entries'); assert.equal(entriesText(0, 0, 0), 'Showing 0 to 0 of 0 entries');
  assert.equal(NO_RIGHTS_TEXT, 'You do not have rights to open this page.');
});

// ----- -002 / -005 / -006 the main project form ------------------------------------------------------------------------
test('main project form: reference labels, address required, everything first in Project settings', () => {
  assert.deepEqual(['name', 'address', 'zip', 'residence', 'phone', 'email'].map(name => [field(name).label, field(name).section]), [['Name', 'Project settings'], ['Address', 'Project settings'], ['Zip code', 'Project settings'], ['Residence', 'Project settings'], ['Phone', 'Project settings'], ['Email address', 'Project settings']]);
  assert.equal(field('name').required, true); assert.equal(field('address').required, true);
  // ISO Book is a tab of Edit project site only (shell-general-012): its switches are hidden in Add.
  assert.deepEqual([...new Set(site.fields.map(item => item.section || 'Details'))], ['Project settings', 'Document settings', 'Iso progress', 'ISO Book']);
  assert.deepEqual([...new Set(site.fields.filter(item => !item.hidden).map(item => item.section || 'Details'))], ['Project settings', 'Document settings', 'Iso progress']);
  assert.deepEqual(Object.keys(missingRequired('sites', { name: 'Site' })), ['address']);
  // The other profiles keep the shared definitions.
  const demo = projectResource(availabilityFor('welding-demo'), RESOURCE_MAP.sites);
  assert.equal(demo.fields.find(item => item.name === 'zip')?.label, 'Postcode'); assert.equal(demo.fields.find(item => item.name === 'address')?.required, undefined);
});
test('NDT measurement is two radio buttons with their explanations and Repair performance has its reference label', () => {
  const ndt = field('ndtMeasurement');
  assert.equal(ndt.control, 'radio'); assert.deepEqual(ndt.options, ['Inch-weighted', 'Per weld']); assert.equal(ndt.default, 'Inch-weighted');
  assert.equal(ndt.optionHints?.['Inch-weighted'], 'A DN500 weld counts more than a DN15 weld.');
  assert.equal(ndt.optionHints?.['Per weld'], '10 welds with NDT required, 1 Accepted = 10% of the NDT weight.');
  assert.equal(field('repairLimit').label, 'Repair performance');
  assert.equal(projectResource(availabilityFor('welding-demo'), RESOURCE_MAP.sites).fields.find(item => item.name === 'ndtMeasurement')?.control, undefined);
});
test('Iso progress weights come phase by phase with the reference labels, and a new main project starts at 50 / 50 / 0', () => {
  const progress = site.fields.filter(item => item.section === 'Iso progress');
  assert.deepEqual(progress.map(item => item.label), ['Distribution - Shop', 'Welds - Shop', 'NDT - Shop', 'Material pipe - Shop', 'Supports - Shop', 'Appendages - Shop', 'Distribution - Field', 'Material pipe - Field', 'Welds - Field', 'NDT - Field', 'Supports - Field', 'Appendages - Field', 'Punch - Field', 'Distribution - Site', 'Hydrotest', 'Paint/Tracing']);
  assert.deepEqual(progress.map(item => item.name).sort(), [...PROGRESS_FIELDS].sort());
  assert.deepEqual([field('weightShop').default, field('weightField').default, field('weightSite').default], [50, 50, 0]);
  assert.ok(progress.filter(item => !item.name.startsWith('weight')).every(item => item.default === 0));
  assert.equal(Object.keys(PROGRESS_DEFAULTS).length, PROGRESS_FIELDS.length);
  assert.equal(RESOURCE_MAP.sites.fields.find(item => item.name === 'weightShop')?.default, undefined, 'the shared definition keeps an empty start');
});
test('no weight check any more: the stored weights are ignored and progress uses the fixed Shop 50 / Field 50 model', () => {
  assert.equal(PROGRESS_MODEL.phases.length, 2, 'Shop and Field; the Site phase is gone');
  for (const phase of PROGRESS_MODEL.phases) assert.equal(phase.activities.reduce((sum, item) => sum + item.weight, 0), 100, phase.key);
  const iso = { id: 'iso', _version: 1, _archived: false, _createdAt: '', _updatedAt: '', prefabCompletedAt: '2026-11-01' };
  const progress = (site: Record<string, unknown> | null) => isoProgress({ iso, site: site as never, welds: [], weldTypes: [], diameters: [], results: [] }).total;
  assert.equal(progress(null), 50);
  assert.equal(progress({ weightShop: 0, weightField: 100, weightSite: 0, fieldWelds: 100 }), 50, 'weights that would have been refused change nothing');
});

// ----- -010 duplicate project site -------------------------------------------------------------------------------------
test('Duplicate Project site copies the ticked settings and lists, names the copy "(Copy)" and copies no projects, isometrics or welds', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const source = store.get('sites', 'site-north');
  const counts = () => ['projects', 'isometrics', 'welds', 'spools'].map(key => store.list(key, true).length);
  const before = counts(); const links = store.list('catalog_sites').filter(link => link.siteId === 'site-north');
  const weldTypeLinks = links.filter(link => link.resourceKey === 'weld_types').length, otherLinks = links.length - weldTypeLinks;
  store.create('catalog_sites', { resourceKey: 'weld_types', recordId: 'weld-type-1', siteId: 'site-north', enabled: false }, SYSTEM);
  const result = runAction(store, 'duplicate-site', { siteId: source.id, parts: ['projectSettings', 'weldTypes'] }, SYSTEM);
  const copy = result.record!;
  assert.equal(copy.name, `${source.name} (Copy)`); assert.equal(copy.address, source.address); assert.equal(copy.flangeStandard, source.flangeStandard);
  assert.equal(copy.irnCode ?? '', '', 'the IRN Code identifies one site and is not copied');
  assert.equal(copy.weightShop ?? null, null, 'Iso progress was not ticked'); assert.equal(copy.hydrotestPlan ?? '', '', 'Document settings were not ticked');
  assert.deepEqual(counts(), before, 'no project, isometric, weld or spool is copied');
  const copied = store.list('catalog_sites').filter(link => link.siteId === copy.id && link.resourceKey !== 'spool_names' && link.resourceKey !== 'diameters' && link.resourceKey !== 'materials'); // Spools not ticked: the copy gets the default names A to Z (tests/spool-catalog.test.ts)
  assert.ok(copied.length > 0 && copied.every(link => link.resourceKey === 'weld_types'), 'only the ticked list');
  assert.ok(copied.some(link => link.recordId === 'weld-type-1' && link.enabled === false), 'a record switched off on the source stays off');
  assert.equal(copied.length, weldTypeLinks + 1); assert.ok(otherLinks >= 0);
  // A second copy is numbered; Iso progress and Document settings travel when ticked; unknown options are refused.
  const second = runAction(store, 'duplicate-site', { siteId: source.id, parts: ['isoProgress', 'documentSettings'] }, SYSTEM).record!;
  assert.equal(second.name, `${source.name} (Copy 2)`); assert.equal(second.weightShop, source.weightShop); assert.equal(second.hydrotestPlan ?? '', source.hydrotestPlan ?? '');
  assert.throws(() => runAction(store, 'duplicate-site', { siteId: source.id, parts: ['projects'] }, SYSTEM), /listed options/);
  assert.equal(duplicateParts(['welders'])!.length, 1); assert.equal(duplicateParts(['welders', 'welders']), null);
  assert.equal(copyName('A', ['a (copy)']), 'A (Copy 2)'); assert.ok(DUPLICATE_PARTS.every(part => part.label));
});
test('Duplicate Project site copies the WPS and welder enablement links of the source site only', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const wps = store.list('wps')[0], welder = store.list('welders')[0], other = store.list('wps')[1];
  store.update('wps', wps.id, { siteIds: ['site-north'] }, wps._version, SYSTEM); store.update('wps', other.id, { siteIds: ['site-river'] }, other._version, SYSTEM); store.update('welders', welder.id, { siteIds: ['site-north', 'site-river'] }, welder._version, SYSTEM);
  const linked = (resource: string, key: string, siteId: string) => store.list(resource).filter(link => link.siteId === siteId).map(link => String(link[key])).sort();
  const wpsNorth = linked('wps_sites', 'wpsId', 'site-north'), weldersNorth = linked('welder_sites', 'welderId', 'site-north'), wpsRiver = linked('wps_sites', 'wpsId', 'site-river');
  assert.ok(wpsNorth.includes(wps.id) && !wpsNorth.includes(other.id) && wpsRiver.includes(other.id));
  const copy = runAction(store, 'duplicate-site', { siteId: 'site-north', parts: ['wpsMethods', 'welders'] }, SYSTEM).record!;
  assert.deepEqual(linked('wps_sites', 'wpsId', copy.id), wpsNorth); assert.deepEqual(linked('welder_sites', 'welderId', copy.id), weldersNorth);
  assert.deepEqual(linked('wps_sites', 'wpsId', 'site-river'), wpsRiver, 'the other site keeps its own links');
  assert.equal(store.list('welder_sites').filter(link => link.siteId === 'site-river' && link.welderId === welder.id).length, 1, 'the other site is untouched');
});

// ----- -027 companies, -028 / -029 attachment names --------------------------------------------------------------------
test('Companies: only name, address, phone and email in the form, sorted by email address', () => {
  const companies = projectResource(hosted, RESOURCE_MAP.companies);
  assert.deepEqual(companies.fields.map(item => item.name), ['name', 'address', 'phone', 'email']);
  assert.deepEqual(hosted.resources.companies, ['name', 'address', 'phone', 'email']);
  assert.equal(HOSTED_DEFAULT_SORT.companies, 'email');
  assert.deepEqual(projectResource(availabilityFor('welding-demo'), RESOURCE_MAP.companies).fields.map(item => item.name), ['name', 'address', 'zip', 'residence', 'phone', 'email', 'description'].filter(name => availabilityFor('welding-demo')!.resources.companies.includes(name)));
});
test('Attachment names: "Add Attachment name", ISO Book ticked and Before Isometric to start, no Sort order, reference columns', () => {
  const names = projectResource(hosted, RESOURCE_MAP.attachment_names);
  assert.equal(names.singular, 'Attachment name');
  const visible = names.fields.filter(item => !item.hidden);
  assert.deepEqual(visible.map(item => [item.name, item.label]), [['name', 'Name'], ['isoBook', 'ISO Book'], ['hydrotest', 'Hydrotest'], ['position', 'Position']]);
  assert.equal(names.fields.find(item => item.name === 'isoBook')?.default, true);
  assert.equal(names.fields.find(item => item.name === 'hydrotest')?.default, false);
  assert.equal(names.fields.find(item => item.name === 'position')?.default, 'Before Isometric');
  assert.deepEqual(names.columns, ['name', 'isoBook', 'hydrotest']);
  assert.equal(RESOURCE_MAP.attachment_names.singular, 'attachment type', 'other profiles keep their wording');
});
test('Attachment names: two independent orders, a saved order wins, standard documents are recognised', () => {
  const a = row('a', { name: 'A', isoBook: true, hydrotest: true, position: ATTACHMENT_POSITIONS[1], sort: 1 }), b = row('b', { name: 'B', isoBook: true, hydrotest: true, position: ATTACHMENT_POSITIONS[1], sort: 2 }), c = row('c', { name: 'C', isoBook: false, hydrotest: true, sort: 3 });
  assert.deepEqual(attachmentNamesInOrder([a, b, c], 'iso-book').map(item => item.id), ['a', 'b']);
  assert.deepEqual(attachmentNamesInOrder([a, b, c], 'hydrotest').map(item => item.id), ['a', 'b', 'c']);
  const sorted = [{ ...a, isoBookOrder: 2 }, { ...b, isoBookOrder: 1 }, c] as Row[];
  assert.deepEqual(orderedAttachmentNames(sorted).map(item => item.id), ['c', 'b', 'a'], 'before the isometric first, then each place by the saved ISO book order');
  assert.deepEqual(attachmentNamesInOrder(sorted, 'iso-book').map(item => item.id), ['b', 'a']);
  assert.deepEqual(attachmentNamesInOrder(sorted, 'hydrotest').map(item => item.id), ['a', 'b', 'c'], 'the hydrotest order is not moved by sorting the ISO book');
  assert.deepEqual(reorderedAttachmentIds([a, b, c], 'iso-book', ['b']), ['b', 'a']); assert.equal(reorderedAttachmentIds([a, b, c], 'iso-book', ['c']), null); assert.equal(reorderedAttachmentIds([a, b, c], 'iso-book', ['a', 'a']), null); assert.equal(reorderedAttachmentIds([a, b, c], 'iso-book', []), null);
  assert.ok(isStandardAttachmentName(row('x', { name: 'Task sheet' }))); assert.ok(isStandardAttachmentName(row('y', { name: 'ITP documents' }))); assert.ok(isStandardAttachmentName(row('z', { name: 'Own', standard: true }))); assert.ok(!isStandardAttachmentName(row('w', { name: 'Own' })));
  assert.deepEqual(moveEntry(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']); const same = ['a', 'b']; assert.equal(moveEntry(same, 0, 0), same);
});

// ----- the server side of the above and of the bell ---------------------------------------------------------------------
const PASSWORD = 'Shell-General-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-shell-general-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, method = 'GET', data?: unknown, pilot: string | null = 'weld') => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { request, login: async (email: string) => { const response = await request('/auth/login', 'POST', { email, password: PASSWORD }, null); assert.equal(response.status, 200, email); } };
  };
  const profile = (name: string, levels: Record<string, unknown>) => store.create('profiles', { name, toolsPermission: 'No access', settingsPermission: 'No access', ...levels }).id;
  const account = async (name: string, data: Record<string, unknown>, sites: Partial<Record<'weld' | 'mto', string[]>> = {}) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    for (const [pilot, ids] of Object.entries(sites)) for (const siteId of ids!) store.create(USER_SITES, { userId: user.id, pilot, siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client(); await as.login(String(user.email)); return { user, as };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', 'POST', { name: 'Shell admin', email: 'shell-admin@example.test', password: PASSWORD }, null)).status, 201);
  return { store, admin, account, profile };
}
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;
type Bell = { unread: number; notifications: { id: string; title: string; read: boolean; link: string }[] };
const NORTH = 'site-north', RIVER = 'site-river';
const order = (siteId: string) => ({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId, items: [{ materialNo: 'CS-P060', quantity: 1, uom: 'M' }] });

test('hosted: a duplicate is refused for an account limited to other main projects, and the new site follows the account scope', async t => {
  const f = await fixture(t);
  const writer = f.profile('Site writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const limited = await f.account('North writer', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  const refused = await limited.as.request('/actions/duplicate-site', 'POST', { siteId: NORTH, parts: ['projectSettings'] });
  assert.equal(refused.status, 403, 'a copy would be a new main project outside the account\'s access');
  const before = f.store.list('sites').length;
  const done = await f.admin.request('/actions/duplicate-site', 'POST', { siteId: NORTH, parts: ['projectSettings', 'qaqcEngineers'] });
  assert.equal(done.status, 201); assert.equal(f.store.list('sites').length, before + 1);
  assert.equal((await f.admin.request('/actions/duplicate-site', 'POST', { siteId: NORTH, parts: ['everything'] })).status, 422);
});
test('hosted: a site needs an address; old progress weights in a save are accepted and ignored', async t => {
  const f = await fixture(t);
  let response = await f.admin.request('/records/sites', 'POST', { name: 'No address' }); assert.equal(response.status, 422); assert.ok((await json<{ fields: Record<string, string> }>(response)).fields.address);
  response = await f.admin.request('/records/sites', 'POST', { name: 'Complete', address: '1 Dock Road', weightShop: 0, weightField: 100, weightSite: 0, fieldWelds: 100 }); assert.equal(response.status, 201, 'weights that do not add up no longer block a save');
  response = await f.admin.request('/records/sites', 'POST', { name: 'Complete 2', address: '1 Dock Road' }); assert.equal(response.status, 201);
});
test('hosted: Attachment names are sorted per mode, saved by the server, and a standard document cannot be archived', async t => {
  const f = await fixture(t);
  const names = f.store.list('attachment_names'); const flagged = (key: string) => names.filter(item => item[key] === true).map(item => item.id);
  const isoBook = attachmentNamesInOrder(names, 'iso-book').map(item => item.id), hydro = attachmentNamesInOrder(names, 'hydrotest').map(item => item.id);
  assert.ok(isoBook.length >= 3 && flagged('isoBook').length === isoBook.length);
  const reversed = [...isoBook].reverse();
  let response = await f.admin.request('/actions/reorder-attachment-names', 'POST', { mode: 'iso-book', order: reversed }); assert.equal(response.status, 201);
  const after = f.store.list('attachment_names');
  assert.deepEqual(attachmentNamesInOrder(after, 'iso-book').map(item => item.id), reversed);
  assert.deepEqual(attachmentNamesInOrder(after, 'hydrotest').map(item => item.id), hydro, 'the hydrotest order did not move');
  response = await f.admin.request('/actions/reorder-attachment-names', 'POST', { mode: 'hydrotest', order: [hydro[0], hydro[0]] }); assert.equal(response.status, 422);
  response = await f.admin.request('/actions/reorder-attachment-names', 'POST', { mode: 'iso-book', order: [hydro.find(id => !isoBook.includes(id))] }); assert.equal(response.status, 422, 'a document of the other mode is refused');
  response = await f.admin.request('/actions/reorder-attachment-names', 'POST', { mode: 'sideways', order: reversed }); assert.equal(response.status, 422);
  // The ISO book follows the saved order: the plans list the custom parts in it.
  const standard = f.store.list('attachment_names').find(item => item.standard === true)!;
  response = await f.admin.request(`/records/attachment_names/${standard.id}/archive`, 'POST', { _version: standard._version }); assert.equal(response.status, 422);
  assert.equal((await json<{ error: string }>(response)).error, 'Standard documents cannot be deleted.');
  const plain = f.store.list('attachment_names').find(item => item.standard !== true)!;
  assert.equal((await f.admin.request(`/records/attachment_names/${plain.id}/archive`, 'POST', { _version: plain._version })).status, 200);
});

// ----- -023 menu items without rights ----------------------------------------------------------------------------------
test('a menu item the profile may not open stays in the menu, marked no-rights; undelivered pages stay hidden; the server still refuses the data', async t => {
  const f = await fixture(t);
  const limited = await f.account('Readonly detailed', { profileId: f.profile('Detailed small', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '4': ['show'], '5': ['show'], '63': ['show'] }) }) });
  const boot = await json<Bootstrap>(await limited.as.request('/bootstrap')); const user = boot.user as User;
  assert.equal(boot.rows.welders, undefined, 'the data of a page without rights is not delivered');
  assert.equal((await limited.as.request('/records/welders')).status, 403);
  const rights: MenuRights = { delivered: path => path !== '/welding/nothing' && true, canRecord: key => canResource(user, key), canReadReport: () => false };
  const weld = PILOT_MAP.weld, items = weld.groups.flatMap(group => group.items), byLabel = (label: string) => items.find(item => item.label === label)!;
  assert.equal(pilotItemState(byLabel('Welders'), rights), 'no-rights'); assert.equal(pilotItemState(byLabel('Dashboard'), rights), 'open');
  assert.equal(pilotItemState(byLabel('Welders'), { ...rights, delivered: () => false }), 'hidden', 'a page that is not delivered is not listed');
  assert.equal(pilotItemState(byLabel('Iso overview'), rights), 'no-rights');
  assert.equal(pilotPageState(weld, '/welding/nothing', rights), 'unlisted'); assert.equal(pilotPageState(weld, pilotItemPath(byLabel('Welders'))!, rights), 'no-rights'); assert.equal(pilotPageState(weld, '/workspace/sites', rights), 'unlisted');
  assert.equal(pilotPageState(weld, '/workspace/isometrics/x', rights), 'unlisted');
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PilotNoRights)));
  assert.match(html, /You do not have rights to open this page\./);
});

// ----- -016 notifications ----------------------------------------------------------------------------------------------
test('notifications: pure rules — own account and pilot only, newest first, unread count', () => {
  const rows = [row('1', { userId: 'u1', pilot: 'mto', title: 'old', _createdAt: '2026-01-01T10:00:00Z' }), row('2', { userId: 'u1', pilot: 'mto', title: 'new', read: true, _createdAt: '2026-01-02T10:00:00Z' }), row('3', { userId: 'u2', pilot: 'mto', title: 'other user' }), row('4', { userId: 'u1', pilot: 'weld', title: 'other pilot' }), row('5', { userId: 'u1', pilot: 'mto', title: 'archived', _archived: true }), row('6', { userId: 'u1', pilot: 'mto', title: 'out of reach', siteId: 'x' })];
  const seen = visibleNotifications(rows, { userId: 'u1', pilot: 'mto', canSee: item => item.siteId !== 'x' });
  assert.deepEqual(seen.map(item => item.title), ['new', 'old']); assert.equal(unreadNotifications(seen), 1);
  assert.equal(NOTIFICATION_LIMIT, 15); assert.equal(NO_NOTIFICATIONS, 'No notifications');
  assert.equal(safeNotificationLink('/materials/transfer_orders'), '/materials/transfer_orders'); assert.equal(safeNotificationLink('//evil.example'), ''); assert.equal(safeNotificationLink('https://evil.example'), ''); assert.equal(safeNotificationLink('/a b'), '');
});
test('notifications: a new transfer order notifies the other storehouse managers that may open it — never another account, never a main project outside the account', async t => {
  const f = await fixture(t);
  const planner = f.profile('MTO planner', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  const north = await f.account('North planner', { profileId: planner, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC, storehouseManager: true }, { mto: [NORTH] });
  const river = await f.account('River planner', { profileId: planner, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC, storehouseManager: true }, { mto: [RIVER] });
  const free = await f.account('Free planner', { profileId: planner, weldEnabled: false, storehouseManager: true });
  const bell = async (who: { as: { request: (path: string, method?: string, data?: unknown, pilot?: string | null) => Promise<Response> } }, pilot = 'mto') => json<Bell>(await who.as.request('/notifications', 'GET', undefined, pilot));
  assert.equal((await f.admin.request('/actions/transfer-order-create', 'POST', order(RIVER), 'mto')).status, 201);
  const mine = await bell(river), theirs = await bell(north), open = await bell(free);
  assert.equal(mine.unread, 1); assert.match(mine.notifications[0].title, /^New Transfer Order TO-/);
  assert.equal(theirs.unread, 0, 'a main project outside the account never reaches it'); assert.deepEqual(theirs.notifications, []);
  assert.equal(open.unread, 1, 'an account with every main project sees it');
  assert.equal((await json<Bell>(await f.admin.request('/notifications', 'GET', undefined, 'mto'))).unread, 0, 'the account that made the order is not told about it');
  assert.deepEqual(f.store.list('notifications').map(item => item.userId).sort(), [river.user.id, free.user.id].sort());
  // Another pilot never shows it; the generic record routes do not deliver notifications at all.
  assert.equal((await river.as.request('/notifications', 'GET', undefined, 'weld')).status, 403, 'River planner is not enabled in Weld Core');
  assert.equal((await f.admin.request('/records/notifications', 'GET', undefined, 'mto')).status, 404);
  const boot = await json<Bootstrap>(await river.as.request('/bootstrap', 'GET', undefined, 'mto')); assert.equal(boot.rows.notifications, undefined);
  // Reading: one account can neither mark nor read another account's notification.
  const id = mine.notifications[0].id;
  assert.equal((await north.as.request(`/notifications/${id}/read`, 'POST', {}, 'mto')).status, 404);
  assert.equal((await free.as.request(`/notifications/${id}/read`, 'POST', {}, 'mto')).status, 404);
  assert.equal(f.store.get('notifications', id).read, false);
  // A stray row of a main project outside the account (even addressed to it) is not shown, counted or changed.
  const stray = f.store.create('notifications', { userId: north.user.id, pilot: 'mto', kind: 'general', title: 'Stray', siteId: RIVER, read: false }, SYSTEM);
  const afterStray = await bell(north); assert.equal(afterStray.unread, 0); assert.deepEqual(afterStray.notifications, []);
  assert.equal((await north.as.request(`/notifications/${stray.id}/read`, 'POST', {}, 'mto')).status, 404);
  assert.equal((await north.as.request('/notifications/read-all', 'POST', {}, 'mto')).status, 200); assert.equal(f.store.get('notifications', stray.id).read, false, 'read-all leaves what the account cannot see untouched');
  // Own notification: mark read, then "Mark all read".
  assert.equal((await json<Bell>(await river.as.request(`/notifications/${id}/read`, 'POST', {}, 'mto'))).unread, 0);
  assert.equal(f.store.get('notifications', id).read, true); assert.equal((await bell(free)).unread, 1, 'the other account keeps its own unread state');
  assert.equal((await json<Bell>(await free.as.request('/notifications/read-all', 'POST', {}, 'mto'))).unread, 0);
  // A notification is not part of the audit trail.
  assert.equal(f.store.list('notifications').length, 3); assert.equal(f.store.activity(1000).some(event => event.entityType === 'notifications'), false);
});
test('notifications: the bell lists at most 15, newest first, and is empty without notifications', async t => {
  const f = await fixture(t);
  const empty = await json<Bell>(await f.admin.request('/notifications', 'GET', undefined, 'mto')); assert.deepEqual(empty, { unread: 0, notifications: [] });
  const admin = f.store.list('users').find(user => user.email === 'shell-admin@example.test')!;
  for (let i = 1; i <= 17; i++) f.store.create('notifications', { userId: admin.id, pilot: 'mto', kind: 'general', title: `Message ${i}`, link: '/materials/transfer_orders' }, SYSTEM);
  const full = await json<Bell>(await f.admin.request('/notifications', 'GET', undefined, 'mto'));
  assert.equal(full.unread, 17); assert.equal(full.notifications.length, 15);
  assert.equal((await f.admin.request('/notifications', 'GET', undefined, null)).status, 403, 'the selector has no bell');
});

// ----- -031 company logo on the selector, -021 password ----------------------------------------------------------------
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64');
test('the company logo of Company data is served to a signed-in account on the selector, and the selector shows it above the title', async t => {
  const f = await fixture(t);
  assert.equal((await f.admin.request('/company-logo', 'GET', undefined, null)).status, 404, 'no logo saved yet');
  const company = await f.admin.request('/records/company_data', 'POST', { name: 'Harbour Welding BV' }); assert.equal(company.status, 201);
  const form = new FormData(); form.set('entityType', 'company_data'); form.set('entityId', (await json<{ record: Row }>(company)).record.id); form.set('documentType', 'Company logo'); form.set('file', new Blob([PNG], { type: 'image/png' }), 'logo.png');
  assert.equal((await f.admin.request('/files', 'POST', form)).status, 201);
  const logo = await f.admin.request('/company-logo', 'GET', undefined, null);
  assert.equal(logo.status, 200); assert.equal(logo.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await logo.arrayBuffer()), PNG);
  const user = { id: 'u', name: 'Test', email: 't@example.test', profileId: 'p', permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 } } as User;
  const render = (logoUrl: string) => renderToStaticMarkup(createElement(PilotSelector, { user, pilots: PILOTS, onOpen: () => undefined, onLogout: () => undefined, logo: logoUrl }));
  const withLogo = render('/logo.png');
  assert.match(withLogo, /<img[^>]+src="\/logo\.png"/); assert.ok(withLogo.indexOf('<img') < withLogo.indexOf('Select your application workspace'), 'the logo sits above the title');
  assert.doesNotMatch(render(''), /<img/); assert.doesNotMatch(withLogo, /Privacy Policy|Theme/);
});
test('password strength grows with length and variety; the strength meter shows it', () => {
  assert.equal(passwordStrength('').label, ''); assert.equal(passwordStrength('abcdefgh').label, 'Weak'); assert.equal(passwordStrength('Abcdefgh12').label, 'Fair'); assert.equal(passwordStrength('Tr0ub4dor&3-horse-staple').label, 'Strong');
  assert.ok(passwordStrength('a').level < passwordStrength('Abcdefgh12').level && passwordStrength('Abcdefgh12').level < passwordStrength('Tr0ub4dor&3-horse-staple').level);
  assert.match(renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: 'abc' })), /Password strength[\s\S]*Password too weak/); assert.match(renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: 'Tr0ub4dor&3-horse-staple' })), /level-4[\s\S]*Very strong/);
});

// ----- shell-general-022 Company data: the reference's fields, and the logo sizing on the selector ------------------------------
test('Company data: the form fields equal the reference list (Name* to Padding bottom) with the Logo after Fax', () => {
  const company = projectResource(hosted, RESOURCE_MAP.company_data);
  assert.deepEqual(companyFormLabels(company.fields), ['Name', 'Address', 'Zip code', 'Residence', 'Mailbox number', 'MN-Zip code', 'MN-Residence', 'Phone', 'Fax', 'Logo', 'Article No prefix', 'Logo max height (px)', 'Logo padding top (px)', 'Logo padding bottom (px)']);
  assert.equal(company.fields.find(item => item.name === 'name')!.required, true);
  const sizing = (name: string) => company.fields.find(item => item.name === name)!;
  assert.deepEqual([sizing('logoMaxHeight').min, sizing('logoMaxHeight').max, sizing('logoMaxHeight').default], [32, 400, 286]);
  assert.deepEqual([sizing('logoPaddingTop').min, sizing('logoPaddingTop').max, sizing('logoPaddingTop').default, sizing('logoPaddingBottom').default], [0, 200, 16, 16]);
  assert.ok(company.fields.find(item => item.name === 'logoHeight')!.hidden && company.fields.find(item => item.name === 'address2')!.hidden, 'the stored document values stay, off the form');
});
test('the logo sizing: older records read the reference defaults, values are clamped, and the selector applies them', async t => {
  assert.deepEqual(logoSizing(undefined), { maxHeight: 286, paddingTop: 16, paddingBottom: 16 });
  assert.deepEqual(logoSizing({ name: 'Old record', logoHeight: 18 }), { maxHeight: 286, paddingTop: 16, paddingBottom: 16 }, 'a record saved before the fields existed');
  assert.deepEqual(logoSizing({ logoMaxHeight: 9999, logoPaddingTop: -5, logoPaddingBottom: '40' }), { maxHeight: 400, paddingTop: 0, paddingBottom: 40 });
  const f = await fixture(t);
  const company = await f.admin.request('/records/company_data', 'POST', { name: 'Harbour Welding BV', mailbox: '12', mnZip: '3000', mnResidence: 'Rotterdam', fax: '010 555 0100', logoMaxHeight: 120, logoPaddingTop: 8, logoPaddingBottom: 24 });
  assert.equal(company.status, 201); const record = (await json<{ record: Row }>(company)).record;
  assert.deepEqual([record.mailbox, record.mnZip, record.mnResidence, record.fax], ['12', '3000', 'Rotterdam', '010 555 0100']);
  assert.equal((await f.admin.request('/records/company_data', 'POST', { name: 'Too big', logoMaxHeight: 9999 })).status, 409, 'one company record');
  assert.equal((await f.admin.request(`/records/company_data/${record.id}`, 'PUT', { logoMaxHeight: 9999, _version: record._version })).status, 422, 'the range is enforced on the server');
  const form = new FormData(); form.set('entityType', 'company_data'); form.set('entityId', record.id); form.set('documentType', 'Company logo'); form.set('file', new Blob([PNG], { type: 'image/png' }), 'logo.png');
  assert.equal((await f.admin.request('/files', 'POST', form)).status, 201);
  const answer = await f.admin.request('/company-logo?sizing=1', 'GET', undefined, null);
  assert.equal(answer.status, 200); assert.deepEqual(await answer.json(), { maxHeight: 120, paddingTop: 8, paddingBottom: 24 });
  const user = { id: 'u', name: 'Test', email: 't@example.test', profileId: 'p', permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 } } as User;
  const render = (sizing?: { maxHeight: number; paddingTop: number; paddingBottom: number }) => renderToStaticMarkup(createElement(PilotSelector, { user, pilots: PILOTS, onOpen: () => undefined, onLogout: () => undefined, logo: '/logo.png', sizing }));
  assert.match(render({ maxHeight: 120, paddingTop: 8, paddingBottom: 24 }), /<img[^>]+style="max-height:120px;padding-top:8px;padding-bottom:24px"/);
  assert.doesNotMatch(render(), /<img[^>]+style=/, 'without saved sizing the stylesheet keeps its size');
});

// ----- shell-general-003: Delete project site and the Archived checkbox ----------------------------------------------------
test('Project settings end with the Archived checkbox (hosted only); Delete project site reads "Are you sure?"', () => {
  const settings = site.fields.filter(item => item.section === 'Project settings' && !item.hidden);
  assert.equal(settings.at(-1)?.name, 'archived', 'the last field of Project settings');
  assert.deepEqual([field('archived').label, field('archived').type], ['Archived', 'checkbox']);
  assert.ok(field('archived').hint && field('archived').hint!.length < 120, 'a short help text of our own');
  assert.equal(RESOURCE_MAP.sites.fields.find(item => item.name === 'archived')?.hidden, true, 'other profiles do not show it');
  assert.equal(projectResource(availabilityFor('welding-demo'), RESOURCE_MAP.sites).fields.some(item => item.name === 'archived'), false);
  assert.deepEqual(SITE_DELETE, { title: 'Delete project site', text: 'Are you sure?', button: 'Delete', cancel: 'Cancel' });
  assert.equal(SITE_DELETE_BLOCKED, SITE_DELETE_REFUSED, 'the dialog and the server say the same');
  assert.equal(siteHasProjects([row('p1', { siteId: 'a' }), row('p2', { siteId: 'b', _archived: true })], 'a'), true);
  assert.equal(siteHasProjects([row('p2', { siteId: 'b', _archived: true })], 'b'), false, 'a deleted (archived) project does not count');
});
test('hosted: deleting an empty project site succeeds, a site with projects gets 409; ticking Archived moves a site to the archived list', async t => {
  const f = await fixture(t);
  const created = await f.admin.request('/records/sites', 'POST', { name: 'Empty yard', address: '9 Empty Road' }); assert.equal(created.status, 201);
  const empty = (await json<{ record: Row }>(created)).record;
  assert.equal(empty._archived, false); assert.notEqual(empty.archived, true, 'the archive state lives in the record itself, not in the field');
  const deleted = await f.admin.request(`/records/sites/${empty.id}/archive`, 'POST', { _version: empty._version });
  assert.equal(deleted.status, 200); assert.equal((await json<{ record: Row }>(deleted)).record._archived, true);
  assert.ok(!f.store.list('sites').some(item => item.id === empty.id), 'gone from the active list');
  const north = f.store.get('sites', NORTH);
  const refused = await f.admin.request(`/records/sites/${NORTH}/archive`, 'POST', { _version: north._version });
  assert.equal(refused.status, 409); assert.equal((await json<{ error: string }>(refused)).error, SITE_DELETE_REFUSED);
  assert.ok(f.store.list('sites').some(item => item.id === NORTH));
  // The Archived checkbox: on save, the site moves to the archived list (Show archived sites).
  const other = (await json<{ record: Row }>(await f.admin.request('/records/sites', 'POST', { name: 'Old yard', address: '3 Old Road' }))).record;
  const ticked = await f.admin.request(`/records/sites/${other.id}`, 'PUT', { name: 'Old yard', archived: true, _version: other._version });
  assert.equal(ticked.status, 200); const saved = (await json<{ record: Row }>(ticked)).record;
  assert.equal(saved._archived, true); assert.notEqual(f.store.get('sites', other.id, true).archived, true);
  assert.deepEqual(siteListRows(f.store.list('sites', true), { archived: true, query: '', sort: SITE_DEFAULT_SORT }).filter(item => item.id === other.id).map(item => item.name), ['Old yard']);
  assert.ok(!siteListRows(f.store.list('sites', true), { archived: false, query: '', sort: SITE_DEFAULT_SORT }).some(item => item.id === other.id));
  // Ticked in Add project site: saved straight into the archived list. Unticked: nothing changes.
  const addArchived = await f.admin.request('/records/sites', 'POST', { name: 'Archived at once', address: '4 Old Road', archived: true }); assert.equal(addArchived.status, 201);
  assert.equal((await json<{ record: Row }>(addArchived)).record._archived, true);
  const kept = (await json<{ record: Row }>(await f.admin.request('/records/sites', 'POST', { name: 'Kept yard', address: '5 Road', archived: false }))).record;
  assert.equal(kept._archived, false);
  // Archiving needs the Delete right on Project sites, as the delete icon does.
  const editor = await f.account('Site editor', { profileId: f.profile('Sites edit, no delete', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '4': ['show', 'insert', 'edit'] }) }) });
  const keptRow = f.store.get('sites', kept.id);
  assert.equal((await editor.as.request(`/records/sites/${kept.id}`, 'PUT', { archived: true, _version: keptRow._version })).status, 403);
  assert.equal(f.store.get('sites', kept.id)._archived, false, 'the save is rolled back');
  assert.equal((await editor.as.request(`/records/sites/${kept.id}/archive`, 'POST', { _version: keptRow._version })).status, 403);
});

// ----- w1-left-12 and the selector / no-rights texts ------------------------------------------------------------------------
test('pilots say Logout and Change site; the selector no longer mentions profiles; Go to dashboard never leads to another no-rights page', () => {
  const user = { id: 'u', name: 'Uma', email: 'uma@example.test', profileId: 'p', permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 } } as User;
  const selector = renderToStaticMarkup(createElement(PilotSelector, { user, pilots: [], onOpen: () => undefined, onLogout: () => undefined, logo: '' }));
  assert.match(selector, />Logout</); assert.doesNotMatch(selector, /Sign out/);
  assert.match(selector, /Your account is not enabled for Weld Core or Material Core\. Ask your administrator/); assert.doesNotMatch(selector, /welding or materials access/);
  const source = (file: string) => readFileSync(join(process.cwd(), 'client', file), 'utf8');
  assert.match(source('shell-parts.tsx'), /user-menu-heading">Change site</);
  assert.match(source('App.tsx'), /pilot \? 'Change site' : 'Change project'/); assert.match(source('App.tsx'), /pilot \? 'Logout' : 'Sign out'/);
  const weld = PILOT_MAP.weld;
  const base: MenuRights = { delivered: () => true, canRecord: () => false, canReadReport: () => false, canArea: () => false };
  assert.equal(pilotHomePath(weld, base), null, 'nothing open: no button');
  assert.deepEqual(pilotHomePath(weld, { ...base, canRecord: key => key === 'welders' }), { path: '/welding/welders', label: 'Go to Welders' }, 'no dashboard area 35: the first open page');
  assert.deepEqual(pilotHomePath(weld, { ...base, canArea: key => key === '35' }), { path: '/dashboard', label: 'Go to dashboard' });
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PilotNoRights)));
  assert.match(html, /Go to dashboard/, 'outside a workspace the button stays');
});
