import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed, seedInspectionSamples, seedSiteScopeSamples } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { seedMtoDashboard } from '../server/mto-dashboard-seed.ts';
import { MTO_DASHBOARD_OPTIONAL, MTO_DASHBOARD_REQUIRED, mtoDashboard } from '../shared/mto-dashboard.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { SiteScope, allowedSites, siteAccessChanges } from '../server/site-scope.ts';
import { projectScope } from '../shared/project-scope.ts';
import { siteOfRecord } from '../server/weld-catalogs.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource, type ReleaseProfile } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { RELATIONS, relationFields } from '../shared/welding.ts';
import { SITE_RULES, SITE_SCOPE_ALL, SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import type { Row, User } from '../shared/types.ts';

const PASSWORD = 'Site-Scope-Password';
const RW = 'Read & write', NONE = 'No access', ADMIN = 'Administration';
// Sample data (server/seed.ts): North fabrication yard holds STX-2401 (iso-1..3) and STX-2403 (iso-7..10);
// Riverside installation holds STX-2402 (iso-4..6, ISO numbers STX-ST-…).
const NORTH = 'site-north', RIVER = 'site-river';
const RIVER_ISOS = ['iso-4', 'iso-5', 'iso-6'];
const RIVER_TEXT = 'STX-ST-';
type Options = { method?: string; pilot?: string; data?: unknown; site?: string };

async function fixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-scope-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data, site }: Options = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(site ? { 'X-Stelux-Site': site } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, toolsPermission: NONE, settingsPermission: NONE, ...levels }).id;
  /** An account; `sites` gives the chosen main projects per limited pilot (stored as user_sites links). */
  const account = (name: string, data: Record<string, unknown>, sites: Partial<Record<'weld' | 'mto', string[]>> = {}) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    for (const [pilot, ids] of Object.entries(sites)) for (const siteId of ids!) store.create(USER_SITES, { userId: user.id, pilot, siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client();
    return { user, as, login: () => as.login(String(user.email)) };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Scope admin', email: 'scope-admin@example.test', password: PASSWORD } })).status, 201);
  const upload = (as: ReturnType<typeof client>, pilot: string, entityType: string, entityId: string, name = 'note.txt') => {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); body.set('file', new Blob(['Site scope test file'], { type: 'text/plain' }), name);
    return as.request('/files', { method: 'POST', pilot, data: body });
  };
  return { store, client, admin, profile, account, upload };
}
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;
type Bootstrap = { user: User; rows: Record<string, Row[]>; activity: { entityType: string; entityId: string }[]; isoSummaries?: Record<string, unknown>; mainProjects?: { id: string; pilots: string[] }[] };
const snapshot = (store: Store) => JSON.stringify(Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)])));
/** The resolved main project of every row: one SiteScope over the whole workspace. */
const resolver = (store: Store) => new SiteScope(store, 'weld', new Set());

test('one table decides the main project of every resource; it agrees with siteOfRecord and refuses unknown resources', () => {
  const missing = RESOURCES.map(resource => resource.key).filter(key => !Object.hasOwn(SITE_RULES, key));
  assert.deepEqual(missing, [], 'every resource needs an entry in SITE_RULES (shared/site-scope.ts)');
  assert.deepEqual(Object.keys(SITE_RULES).filter(key => !RESOURCE_MAP[key]), [], 'no rule for a resource that does not exist');
  for (const [key, rule] of Object.entries(SITE_RULES)) {
    if (typeof rule === 'string') continue;
    for (const [field, target] of rule.via) {
      assert.ok(RESOURCE_MAP[key].fields.some(f => f.name === field), `${key}.${field} exists`);
      assert.ok(Object.hasOwn(SITE_RULES, target), `${key}.${field} leads to ${target}, which has a rule`);
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-rules-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  try {
    const scope = resolver(store);
    let compared = 0;
    for (const resource of RESOURCES) for (const row of store.list(resource.key, true)) {
      const expected = siteOfRecord(store, resource.key, row);
      if (!expected) continue;
      assert.equal(scope.siteOf(resource.key, row), expected, `${resource.key} ${row.id}`); compared++;
    }
    assert.ok(compared > 100, `compared ${compared} records`);
    // Every attachment follows its record; a record of an unknown type is refused, never treated as global.
    assert.equal(scope.siteOf('attachments', { entityType: 'welds', entityId: 'weld-4' }), RIVER);
    assert.equal(scope.allows('attachments', { entityType: 'no_such_resource', entityId: 'x' }), false);
    assert.equal(scope.allows('no_such_resource', { id: 'x' }), false);
    assert.equal(scope.allows('welds', { id: 'w', isoId: '' }), false, 'a weld without isometric cannot be told: refused');
    assert.equal(scope.allows('warehouses', { id: 'w', siteId: '' }), true, 'a storehouse of no main project is shared');
    assert.equal(scope.allows('materials', { id: 'm' }), true, 'catalogs are global');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the scope resolves records from one read per collection, not one query per row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-perf-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  try {
    const welds = store.list('welds', true), results = store.list('inspection_results', true);
    const reads: string[] = []; let gets = 0;
    const list = store.list.bind(store), get = store.get.bind(store);
    store.list = (key, archived) => { reads.push(key); return list(key, archived); };
    store.get = (key, id, archived) => { gets++; return get(key, id, archived); };
    const scope = new SiteScope(store, 'weld', new Set([NORTH]));
    const visible = [...welds.filter(row => scope.allows('welds', row)), ...results.filter(row => scope.allows('inspection_results', row))];
    assert.ok(visible.length > 0 && visible.length < welds.length + results.length);
    assert.deepEqual([...new Set(reads)].sort(), reads.slice().sort(), 'each collection is read once');
    assert.ok(reads.length <= 4, `collections read: ${reads.join(', ')}`);
    assert.equal(gets, 0, 'no per-row queries');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the isometric summary names the test system for an MTO-only account, only for isometrics of its own main projects', async t => {
  const f = await fixture(t);
  // A test system on a Riverside isometric, so the other main project has a name that must not leak.
  const river = f.store.create('test_systems', { name: 'RIVER-TS-07', projectId: String(f.store.get('isometrics', 'iso-4').projectId), medium: 'Water', pressure: '10 bar' }, SYSTEM);
  const iso4 = f.store.get('isometrics', 'iso-4'); f.store.update('isometrics', 'iso-4', { testSystemId: river.id }, iso4._version, SYSTEM);
  // A North isometric without a test system (the sample puts every isometric in one).
  const iso7 = f.store.get('isometrics', 'iso-7'); f.store.update('isometrics', 'iso-7', { testSystemId: '' }, iso7._version, SYSTEM);
  const reader = f.profile('MTO reader', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const mtoOnly = f.account('North MTO only', { profileId: reader, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  await mtoOnly.login();
  const raw = await (await mtoOnly.as.request('/bootstrap', { pilot: 'mto' })).text(), body = JSON.parse(raw) as Bootstrap & { isoSummaries: Record<string, { testSystemName?: string }> };
  assert.equal(body.rows.test_systems, undefined, 'MTO Pilot reads no test systems');
  assert.equal(body.isoSummaries['iso-1'].testSystemName, 'CW-01', 'its own isometric carries the name');
  assert.equal(body.isoSummaries['iso-7']?.testSystemName, undefined, 'an isometric without a test system has none');
  assert.equal(body.isoSummaries['iso-4'], undefined, 'no summary for an isometric outside its main projects');
  assert.ok(!raw.includes('RIVER-TS-07'), 'the other main project\'s test system name never appears');
  // The administrator sees the Riverside name in either pilot.
  assert.equal((await json<{ isoSummaries: Record<string, { testSystemName?: string }> }>(await f.admin.request('/bootstrap', { pilot: 'mto' }))).isoSummaries['iso-4'].testSystemName, 'RIVER-TS-07');
});

test('Weld Pilot limited to one main project: every read path returns nothing of the other one; MTO Pilot (all sites) returns everything', async t => {
  const f = await fixture(t);
  const writer = f.profile('Site writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const scoped = f.account('North welder', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_ALL }, { weld: [NORTH] });
  // Documents on both main projects, uploaded by the administrator.
  const riverIsoFile = (await json<{ record: Row }>(await f.upload(f.admin, 'mto', 'isometrics', 'iso-4', 'river-iso.txt'))).record;
  const riverWeldFile = (await json<{ record: Row }>(await f.upload(f.admin, 'weld', 'welds', 'weld-4', 'river-weld.txt'))).record;
  const northWeldFile = (await json<{ record: Row }>(await f.upload(f.admin, 'weld', 'welds', 'weld-1', 'north-weld.txt'))).record;
  const entry = await scoped.login();
  assert.deepEqual(entry.pilots, ['weld', 'mto']);
  const scope = resolver(f.store);
  const riverRecord = (key: string, row: Row) => scope.siteOf(key, row) === RIVER;

  // Selector: the main projects per pilot.
  const selector = await json<Bootstrap>(await scoped.as.request('/bootstrap'));
  assert.deepEqual(selector.mainProjects!.map(site => [site.id, site.pilots]).sort(), [[NORTH, ['weld', 'mto']], [RIVER, ['mto']]]);

  // Bootstrap (lists, search, iso summaries, activity).
  const weld = await json<Bootstrap>(await scoped.as.request('/bootstrap', { pilot: 'weld' }));
  assert.equal(weld.user.siteLimited, true);
  assert.deepEqual(weld.rows.sites.map(row => row.id), [NORTH]);
  for (const [key, rows] of Object.entries(weld.rows)) for (const row of rows) assert.ok(!riverRecord(key, row), `weld bootstrap leaks ${key} ${row.id}`);
  assert.ok(weld.rows.welds.length > 0 && weld.rows.isometrics.length > 0);
  assert.ok(!weld.rows.isometrics.some(row => RIVER_ISOS.includes(row.id)));
  assert.ok(!weld.rows.attachments.some(row => [riverIsoFile.id, riverWeldFile.id].includes(row.id)));
  assert.ok(weld.rows.attachments.some(row => row.id === northWeldFile.id));
  assert.ok(Object.keys(weld.isoSummaries || {}).every(id => !RIVER_ISOS.includes(id)));
  assert.ok(weld.activity.every(event => { try { return !riverRecord(event.entityType, f.store.get(event.entityType, event.entityId, true)); } catch { return true; } }), 'activity');
  assert.ok(weld.rows.wps_sites.every(row => row.siteId === NORTH), 'links to the other main project are hidden');
  assert.ok(weld.rows.weld_types.length > 0 && weld.rows.wps.length > 0, 'global catalogs stay');
  const mto = await json<Bootstrap>(await scoped.as.request('/bootstrap', { pilot: 'mto' }));
  assert.equal(mto.user.siteLimited, undefined);
  assert.deepEqual(mto.rows.sites.map(row => row.id).sort(), [NORTH, RIVER]);
  assert.ok(RIVER_ISOS.every(id => mto.rows.isometrics.some(row => row.id === id)));
  assert.ok(mto.rows.iso_materials.some(row => RIVER_ISOS.includes(String(row.isoId))));
  assert.ok(mto.rows.attachments.some(row => row.id === riverIsoFile.id));
  assert.ok(RIVER_ISOS.every(id => Object.hasOwn(mto.isoSummaries || {}, id)));

  // Lists, single records, history, files.
  const welds = (await json<{ rows: Row[] }>(await scoped.as.request('/records/welds', { pilot: 'weld' }))).rows;
  assert.ok(welds.length && welds.every(row => !RIVER_ISOS.includes(String(row.isoId))));
  assert.deepEqual((await json<{ rows: Row[] }>(await scoped.as.request('/records/projects', { pilot: 'weld' }))).rows.map(row => row.siteId).filter(id => id !== NORTH), []);
  assert.ok((await json<{ rows: Row[] }>(await scoped.as.request('/records/isometrics', { pilot: 'mto' }))).rows.some(row => row.id === 'iso-4'));
  for (const path of ['/history/welds/weld-4', '/history/isometrics/iso-4', `/history/attachments/${riverWeldFile.id}`, `/files/${riverWeldFile.id}`, `/files/${riverIsoFile.id}`, '/history/sites/site-river']) {
    const response = await scoped.as.request(path, { pilot: 'weld' }); assert.equal(response.status, 403, path); assert.equal((await json(response)).code, 'site', path);
  }
  for (const path of ['/history/welds/weld-1', `/files/${northWeldFile.id}`, `/files/${northWeldFile.id}?pilot=weld`]) assert.equal((await scoped.as.request(path, { pilot: path.includes('?') ? undefined : 'weld' })).status, 200, path);
  for (const path of ['/history/isometrics/iso-4', `/files/${riverIsoFile.id}`, '/history/iso_materials/requirement-4']) assert.equal((await scoped.as.request(path, { pilot: 'mto' })).status, 200, `mto ${path}`);

  // Reports, CSV / XLSX exports and PDF documents.
  for (const path of ['/reports/lisl', '/reports/wdi', '/export/welds?format=csv', '/export/isometrics?format=csv', '/export/attachments?format=csv']) {
    const response = await scoped.as.request(path, { pilot: 'weld' }); assert.equal(response.status, 200, path);
    const text = await response.text(); assert.ok(!text.includes(RIVER_TEXT) && !text.includes('river-'), `${path} leaks the other main project`);
  }
  const workbook = await scoped.as.request('/export/isometrics?format=xlsx', { pilot: 'weld' }); assert.equal(workbook.status, 200);
  const exported = await scoped.as.request('/export/wps?format=csv', { pilot: 'weld' }); assert.ok(!(await exported.text()).includes('Riverside installation'), 'relation labels of hidden sites are left out');
  for (const path of ['/reports/mto', '/export/isometrics?format=csv']) assert.ok((await (await scoped.as.request(path, { pilot: 'mto' })).text()).includes(RIVER_TEXT), `mto ${path}`);
  // The same refusal as the record routes (scn-SC-D9): 403 `site`, not "not found".
  const outside = await scoped.as.request('/pdf/lisl?isoId=iso-4', { pilot: 'weld' }); assert.equal(outside.status, 403); assert.equal((await json(outside)).code, 'site');
  const pdf = await scoped.as.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' }); assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
});

test('Weld Pilot limited to one main project: every write path naming the other one is refused with 403 and changes nothing', async t => {
  const f = await fixture(t);
  const writer = f.profile('Site writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: ADMIN });
  const scoped = f.account('North welder', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  const riverFile = (await json<{ record: Row }>(await f.upload(f.admin, 'weld', 'welds', 'weld-4', 'river-weld.txt'))).record;
  await scoped.login();
  const version = (key: string, id: string) => f.store.get(key, id, true)._version;
  const before = snapshot(f.store);
  const refused: [string, string, unknown?][] = [
    // Record id of the other main project in the URL.
    ['PUT', '/records/welds/weld-4', { description: 'Forged', _version: version('welds', 'weld-4') }],
    ['PUT', '/records/isometrics/iso-4', { description: 'Forged', _version: version('isometrics', 'iso-4') }],
    ['PUT', '/records/sites/site-river', { phone: '+31 10 555 0000', _version: version('sites', RIVER) }],
    ['POST', '/records/welds/weld-4/archive', { _version: version('welds', 'weld-4') }],
    ['POST', '/records/spools/spool-4/archive', { _version: version('spools', 'spool-4') }],
    // Parent id of the other main project in the body (create and move).
    ['POST', '/records/isometrics', { isoNo: 'FORGED-1', projectId: 'project-steam' }],
    ['POST', '/records/spools', { name: 'FORGED-SP', isoId: 'iso-4' }],
    ['POST', '/records/punchlists', { name: 'Forged punch', isoId: 'iso-4', category: 'A' }],
    ['PUT', '/records/isometrics/iso-1', { projectId: 'project-steam', _version: version('isometrics', 'iso-1') }],
    ['PUT', '/records/projects/project-cooling', { siteId: RIVER, _version: version('projects', 'project-cooling') }],
    ['POST', '/records/sites', { name: 'New yard outside my scope', address: '1 Outside Road' }],
    // Bulk edits naming a record of the other main project, alone or mixed with an allowed one.
    ['POST', '/bulk/isometrics', { ids: ['iso-4'], changes: { area: 'Forged' }, versions: { 'iso-4': version('isometrics', 'iso-4') } }],
    ['POST', '/bulk/isometrics', { ids: ['iso-1', 'iso-4'], changes: { area: 'Forged' }, versions: { 'iso-1': version('isometrics', 'iso-1'), 'iso-4': version('isometrics', 'iso-4') } }],
    ['POST', '/bulk/weld_types', { ids: ['weld-type-1'], changes: { enabledOnSite: false, enabledSiteId: RIVER }, versions: { 'weld-type-1': version('weld_types', 'weld-type-1') } }],
    // Actions whose payload names a record of the other main project.
    ['POST', '/actions/phases', { isoIds: ['iso-1', 'iso-4'], field_test: 'Complete' }],
    ['POST', '/actions/inspection-request', { type: 'NDT', weldIds: ['weld-4'], date: '2026-11-16' }],
    ['POST', '/actions/repair', { weldId: 'weld-4', date: '2026-11-16', note: 'Forged repair' }],
    ['POST', '/actions/save-weld', { weldId: 'weld-4', isoId: 'iso-4', expectedVersion: version('welds', 'weld-4'), weldNo: 'W004' }],
    ['POST', '/actions/add-welds', { isoId: 'iso-4', start: 90, end: 91 }],
    ['POST', '/actions/mass-edit-welds', { weldIds: ['weld-1', 'weld-4'], changes: { ndoReq: true } }],
    ['POST', '/actions/reorder-welds', { isoId: 'iso-4', weldIds: ['weld-4', 'weld-13'] }],
    ['POST', '/actions/ndt-weld', { weldId: 'weld-4', type: 'NDT' }],
    ['POST', '/actions/revision', { isoId: 'iso-4', type: 'ISO', revNo: '9', date: '2026-11-16' }],
    ['POST', '/actions/release', { isoIds: ['iso-4'], type: 'Prefab', reportNo: 'R-1', date: '2026-11-16' }],
    ['POST', '/actions/copy-isometrics', { isoIds: ['iso-4'], projectId: 'project-steam' }],
    ['POST', '/actions/copy-isometrics', { isoIds: ['iso-1'], projectId: 'project-steam' }],
    ['POST', '/actions/hydrotest-move', { testSystemId: 'test-cw', spoolIds: ['spool-4'] }],
    // Relations: links to a main project outside the scope cannot be added.
    ['PUT', '/records/wps/wps-1', { siteIds: [NORTH, RIVER, 'site-none'], _version: version('wps', 'wps-1') }],
  ];
  for (const [method, path, data] of refused) {
    const response = await scoped.as.request(path, { method, pilot: 'weld', data });
    assert.equal(response.status, 403, `${method} ${path} ${JSON.stringify(data)} → ${response.status} ${JSON.stringify(await response.clone().json().catch(() => ({})))}`);
  }
  // Uploads: attached to a record of the other main project, in either form.
  assert.equal((await f.upload(scoped.as, 'weld', 'welds', 'weld-4')).status, 403);
  assert.equal((await f.upload(scoped.as, 'weld', 'isometrics', 'iso-4')).status, 403);
  assert.equal((await f.upload(scoped.as, 'weld', 'attachments', riverFile.id)).status, 403);
  const finish = new FormData(); finish.set('signerType', 'Inspector'); finish.set('file', new Blob(['x'], { type: 'text/plain' }), 'sign.txt');
  const riverPunch = f.store.create('punchlists', { name: 'River punch', isoId: 'iso-4', category: 'A', description: 'Support missing at the pipe rack' }, SYSTEM);
  const afterPunch = snapshot(f.store);
  assert.equal((await scoped.as.request(`/punch/${riverPunch.id}/finish`, { method: 'POST', pilot: 'weld', data: finish })).status, 403);
  assert.equal(afterPunch, snapshot(f.store), 'refused uploads change nothing');
  assert.equal(JSON.parse(before).welds.length, f.store.list('welds', true).length);
  f.store.archive('punchlists', riverPunch.id, riverPunch._version, SYSTEM);

  // The same kinds of writes inside the allowed main project still work.
  const north = await scoped.as.request('/records/welds/weld-1', { method: 'PUT', pilot: 'weld', data: { description: 'North edit', _version: version('welds', 'weld-1') } });
  assert.equal(north.status, 200);
  assert.equal((await scoped.as.request('/actions/phases', { method: 'POST', pilot: 'weld', data: { isoIds: ['iso-1'], field_test: 'Complete' } })).status, 201);
  assert.equal((await f.upload(scoped.as, 'weld', 'welds', 'weld-1')).status, 201);
  assert.equal((await scoped.as.request('/records/spools', { method: 'POST', pilot: 'weld', data: { name: 'North spool X', isoId: 'iso-1' } })).status, 201);
  // Saving a WPS keeps its hidden link to the other main project instead of removing it.
  const wps = await scoped.as.request('/records/wps/wps-1', { method: 'PUT', pilot: 'weld', data: { siteIds: [NORTH], description: 'North only edit', _version: version('wps', 'wps-1') } });
  assert.equal(wps.status, 200);
  assert.deepEqual(f.store.list('wps_sites').filter(row => row.wpsId === 'wps-1').map(row => row.siteId).sort(), [NORTH, RIVER]);
  // MTO Pilot has no limit for this account: the other main project's records are writable there.
  const requirement = f.store.get('iso_materials', 'requirement-4');
  assert.equal((await scoped.as.request('/records/iso_materials/requirement-4', { method: 'PUT', pilot: 'mto', data: { chargeNo: 'CH-RIVER', _version: requirement._version } })).status, 200);
  assert.equal((await f.upload(scoped.as, 'mto', 'isometrics', 'iso-4')).status, 201);
  // … but Copy isometrics from MTO Pilot may not carry welds into a main project outside the Weld Pilot scope.
  const copy = await scoped.as.request('/actions/copy-isometrics', { method: 'POST', pilot: 'mto', data: { isoIds: ['iso-4'], projectId: 'project-steam', copyWelds: true } });
  assert.equal(copy.status, 403); assert.match((await json<{ error: string }>(copy)).error, /Weld Pilot access/);
  // None of the refused requests left a trace in the other main project.
  for (const id of RIVER_ISOS) assert.notEqual(f.store.get('isometrics', id).area, 'Forged');
  assert.equal(f.store.get('welds', 'weld-4').description, JSON.parse(before).welds.find((row: Row) => row.id === 'weld-4').description);
  assert.ok(!f.store.list('isometrics', true).some(row => String(row.isoNo).startsWith('FORGED')));
  assert.ok(!f.store.list('sites', true).some(row => row.name === 'New yard outside my scope'));
  assert.equal(f.store.get('isometrics', 'iso-1').projectId, 'project-cooling');
});

test('MTO Pilot limited to the other main project: materials list, inventory and MTO actions follow the scope', async t => {
  const f = await fixture(t);
  const writer = f.profile('MTO writer', { generalPermission: RW, materialsPermission: ADMIN, weldingPermission: RW });
  const river = f.account('River preparator', { profileId: writer, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [RIVER] });
  await river.login();
  const list = await json<{ rows: { id: string; values: Record<string, unknown> }[] }>(await river.as.request('/mto/materials-list', { pilot: 'mto' }));
  const requirements = new Map(f.store.list('iso_materials').map(row => [row.id, row]));
  assert.ok(list.rows.length > 0 && list.rows.every(row => RIVER_ISOS.includes(String(requirements.get(row.id)?.isoId))));
  const data = await json<Bootstrap>(await river.as.request('/bootstrap', { pilot: 'mto' }));
  // Storehouses are company records shared by every project site; a project site's inventory stays with its site.
  assert.deepEqual(data.rows.warehouses.map(row => row.id).sort(), ['warehouse-field', 'warehouse-main', 'warehouse-yard']);
  assert.ok(data.rows.stock.some(row => row.locationKind === 'site' && row.siteId === RIVER));
  assert.ok(data.rows.stock.every(row => row.locationKind === 'site' ? row.siteId === RIVER : Boolean(row.warehouseId)), 'no row of the North inventory');
  assert.ok(data.rows.laydowns.length && data.rows.laydowns.every(row => row.siteId !== NORTH));
  const open = f.store.create('iso_materials', { isoId: 'iso-1', materialId: 'material-1', quantity: 5000, phaseId: 'phase-0' }, SYSTEM);
  const before = snapshot(f.store);
  for (const [path, body] of [
    ['/actions/add-iso-material', { isoId: 'iso-1', source: 'Custom', materialNo: 'FORGED-MTO', description: 'Forged pipe', quantity: 1, uom: 'M' }],
    ['/actions/order-requirements', { requirementIds: [open.id] }],
    ['/actions/archive-iso-materials', { requirementIds: ['requirement-1'] }],
    ['/actions/move-materials', { requirementIds: ['requirement-1'], laydownId: 'material-laydown-1' }],
    ['/actions/reserve-iso', { isoId: 'iso-1' }],
  ] as [string, unknown][]) {
    const response = await river.as.request(path, { method: 'POST', pilot: 'mto', data: body });
    assert.ok([403].includes(response.status), `${path} → ${response.status} ${JSON.stringify(await response.json())}`);
  }
  assert.equal(snapshot(f.store), before);
  // Weld Pilot has no limit for this account.
  assert.ok((await json<Bootstrap>(await river.as.request('/bootstrap', { pilot: 'weld' }))).rows.isometrics.some(row => row.id === 'iso-1'));
});

test('an account limited to no main project sees an explanatory empty state; legacy accounts and other profiles are unchanged', async t => {
  const f = await fixture(t);
  const writer = f.profile('Site writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const none = f.account('Nowhere', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC });
  await none.login();
  const empty = await json<Bootstrap>(await none.as.request('/bootstrap', { pilot: 'weld' }));
  assert.equal(empty.user.siteLimited, true);
  for (const key of ['sites', 'projects', 'isometrics', 'welds', 'spools', 'attachments']) assert.deepEqual(empty.rows[key], [], key);
  assert.ok(empty.rows.weld_types.length > 0, 'global catalogs stay readable');
  assert.deepEqual((await json<Bootstrap>(await none.as.request('/bootstrap'))).mainProjects!.map(site => site.pilots), [['mto'], ['mto']]);
  assert.equal((await none.as.request('/records/welds', { pilot: 'weld' })).status, 200);

  // Legacy account: saved before access per project site existed (no scope fields at all).
  const legacy = f.account('Legacy', { profileId: writer });
  f.store.db.prepare(`UPDATE users SET data=json_remove(data,'$.weldSiteScope','$.mtoSiteScope') WHERE id=?`).run(legacy.user.id);
  assert.equal(f.store.get('users', legacy.user.id).weldSiteScope, undefined);
  await legacy.login();
  for (const pilot of ['weld', 'mto'] as const) {
    const view = await json<Bootstrap>(await legacy.as.request('/bootstrap', { pilot }));
    assert.equal(view.user.siteLimited, undefined); assert.deepEqual(view.rows.sites.map(row => row.id).sort(), [NORTH, RIVER]);
    assert.equal(allowedSites(f.store, f.store.get('users', legacy.user.id), pilot), 'all');
  }
  assert.equal((await legacy.as.request('/history/welds/weld-4', { pilot: 'weld' })).status, 200);
  const legacyWeld = f.store.get('welds', 'weld-4');
  assert.equal((await legacy.as.request('/records/welds/weld-4', { method: 'PUT', pilot: 'weld', data: { description: 'Legacy edit', _version: legacyWeld._version } })).status, 200);
  // Links without the Specific scope do not limit anyone.
  const links = f.account('Links only', { profileId: writer, weldSiteScope: SITE_SCOPE_ALL }, { weld: [NORTH] });
  await links.login(); assert.equal((await json<Bootstrap>(await links.as.request('/bootstrap', { pilot: 'weld' }))).rows.sites.length, 2);
});

test('other release profiles ignore project site access and do not show its fields', async t => {
  for (const profile of ['full', 'welding-demo'] as const) {
    const f = await fixture(t, profile);
    const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW, settingsPermission: ADMIN });
    const limited = f.account('Would be limited', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC });
    await limited.login();
    const data = await json<Bootstrap>(await limited.as.request('/bootstrap'));
    assert.deepEqual(data.rows.sites.map(row => row.id).sort(), [NORTH, RIVER], profile);
    assert.equal(data.user.siteLimited, undefined, profile);
    assert.equal((await limited.as.request('/history/welds/weld-4')).status, 200, profile);
    if (profile === 'full') {
      const csv = await (await limited.as.request('/export/users?format=csv')).text();
      assert.ok(!csv.includes('project site'), 'no site access columns outside pilots');
    }
  }
  assert.ok(RESOURCE_MAP.users.fields.filter(f => ['weldSiteScope', 'mtoSiteScope'].includes(f.name)).every(f => f.hidden), 'hidden outside pilots');
  assert.deepEqual(relationFields('users'), [], 'the site lists are pilots-only relations');
  const hosted = projectResource(availabilityFor(HOSTED_RELEASE_PROFILE), RESOURCE_MAP.users);
  for (const name of ['weldSiteScope', 'mtoSiteScope']) { const field = hosted.fields.find(f => f.name === name)!; assert.equal(field.hidden, false); assert.equal(field.section, 'Applications'); assert.deepEqual(field.options, [SITE_SCOPE_ALL, SITE_SCOPE_SPECIFIC]); }
  assert.deepEqual(RELATIONS.users.map(r => [r.field, r.section, r.match]), [['weldSiteIds', 'Applications', { pilot: 'weld' }], ['mtoSiteIds', 'Applications', { pilot: 'mto' }]]);
  assert.equal(availabilityFor('welding-demo')!.resources.user_sites, undefined);
});

test('administrators set project site access per pilot in the user form; it cannot be widened by a limited account', async t => {
  const f = await fixture(t);
  const reviewer = f.profile('Reviewer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const target = f.account('Field engineer', { profileId: reviewer });
  // An unlimited administrator limits Weld Pilot to North and leaves MTO Pilot on all sites.
  const row = f.store.get('users', target.user.id);
  const saved = await f.admin.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteIds: [NORTH], _version: row._version } });
  assert.equal(saved.status, 200);
  assert.deepEqual(f.store.list(USER_SITES).filter(link => link.userId === row.id).map(link => [link.pilot, link.siteId]), [['weld', NORTH]]);
  const users = await json<Bootstrap>(await f.admin.request('/bootstrap', { pilot: 'weld' }));
  assert.ok(users.rows.user_sites.some(link => link.userId === row.id && link.pilot === 'weld'));
  await target.login();
  assert.deepEqual((await json<Bootstrap>(await target.as.request('/bootstrap', { pilot: 'weld' }))).rows.sites.map(site => site.id), [NORTH]);
  // MTO links are kept apart from Weld links.
  const next = f.store.get('users', row.id);
  assert.equal((await f.admin.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'mto', data: { mtoSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteIds: [RIVER], _version: next._version } })).status, 200);
  assert.deepEqual(f.store.list(USER_SITES).filter(link => link.userId === row.id).map(link => `${link.pilot}:${link.siteId}`).sort(), [`mto:${RIVER}`, `weld:${NORTH}`]);
  assert.equal((await f.admin.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteScope: 'Some sites', _version: f.store.get('users', row.id)._version } })).status, 422);
  // Users and their site links are for administrators only.
  assert.equal((await target.as.request('/records/user_sites', { pilot: 'weld' })).status, 403);
  // A new account is created with its access in one request.
  const created = await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'New coordinator', email: 'new-coordinator@example.test', profileId: reviewer, active: true, weldEnabled: true, weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteIds: [RIVER], mtoEnabled: true, mtoProfileId: reviewer, password: 'New-Coordinator-1' } });
  assert.equal(created.status, 201);
  const createdId = (await json<{ record: Row }>(created)).record.id;
  assert.deepEqual(f.store.list(USER_SITES).filter(link => link.userId === createdId).map(link => [link.pilot, link.siteId]), [['weld', RIVER]]);
  // A limited administrator may edit accounts, but not change anyone's project site access, nor its own.
  const adminProfile = f.profile('Site admin', { generalPermission: ADMIN, materialsPermission: ADMIN, weldingPermission: ADMIN, settingsPermission: ADMIN });
  const limitedAdmin = f.account('North admin', { profileId: adminProfile, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await limitedAdmin.login();
  const victim = f.store.get('users', target.user.id);
  for (const data of [{ weldSiteScope: SITE_SCOPE_ALL }, { weldSiteIds: [NORTH, RIVER] }]) {
    const response = await limitedAdmin.as.request(`/records/users/${victim.id}`, { method: 'PUT', pilot: 'weld', data: { ...data, _version: victim._version } });
    assert.equal(response.status, 403, JSON.stringify(data));
  }
  assert.equal((await limitedAdmin.as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Escalated', email: 'escalated@example.test', profileId: adminProfile, active: true, weldSiteScope: SITE_SCOPE_ALL, weldSiteIds: [RIVER], password: 'Escalated-Password-1' } })).status, 403);
  const self = f.store.get('users', limitedAdmin.user.id);
  assert.equal((await limitedAdmin.as.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteScope: SITE_SCOPE_ALL, _version: self._version } })).status, 403);
  assert.equal((await limitedAdmin.as.request(`/records/users/${victim.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Senior engineer', weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteIds: [NORTH], _version: victim._version } })).status, 200, 'unchanged access with other edits is fine');
  // A limited administrator sees only its own main projects' links of other accounts.
  const view = await json<Bootstrap>(await limitedAdmin.as.request('/bootstrap', { pilot: 'weld' }));
  assert.ok(view.rows.user_sites.every(link => link.siteId === NORTH));
  // Unlimited administrators cannot change their own access either (no self-lockout).
  const me = f.store.list('users').find(user => user.email === 'scope-admin@example.test')!;
  assert.equal((await f.admin.request(`/records/users/${me.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteScope: SITE_SCOPE_SPECIFIC, _version: me._version } })).status, 403);
  // Change detection.
  assert.deepEqual(siteAccessChanges(f.store, { weldSiteScope: SITE_SCOPE_ALL, weldSiteIds: [] }), []);
  assert.deepEqual(siteAccessChanges(f.store, { mtoSiteIds: [RIVER] }, f.store.get('users', row.id)), []);
  assert.deepEqual(siteAccessChanges(f.store, { mtoSiteIds: [NORTH] }, f.store.get('users', row.id)), ['mto']);
});

test('the sample workspace has an account limited to North fabrication yard in Weld Pilot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-seed-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  try {
    store.create('profiles', { name: 'Highest rights for QAQC', generalPermission: RW }, SYSTEM, 'profile-qaqc');
    store.create('profiles', { name: 'Only review', generalPermission: RW }, SYSTEM, 'profile-review');
    seedSiteScopeSamples(store); seedSiteScopeSamples(store);
    const user = store.get('users', 'user-sample-north');
    assert.equal(allowedSites(store, user, 'mto'), 'all');
    assert.deepEqual([...allowedSites(store, user, 'weld') as Set<string>], [NORTH]);
    assert.equal(store.list(USER_SITES).length, 1, 'runs once');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('documents, the ISO Book and the MTO dashboard inputs follow project site access (forged ids of the other main project)', async t => {
  const f = await fixture(t);
  seedInspectionSamples(f.store); seedMtoLogistics(f.store, SYSTEM); seedMtoDashboard(f.store, SYSTEM);
  const writer = f.profile('Document writer', { generalPermission: RW, materialsPermission: ADMIN, weldingPermission: RW });
  const north = f.account('North documents', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  const river = f.account('River documents', { profileId: writer, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [RIVER] });
  await north.login(); await river.login();
  const status = async (as: typeof north.as, path: string, pilot: string, options: Options = {}) => (await as.request(path, { pilot, ...options })).status;

  // Isometric-, project- and record-scoped PDF documents: a record of the other main project named by id is refused like on
  // the record routes (403, scn-SC-D9); a document named by its number is unknown (404); the own one prints.
  for (const path of ['/pdf/lisl-gu?isoId=iso-4', '/pdf/weld-cards?isoId=iso-4', '/pdf/punch-list-blank?isoId=iso-4', '/pdf/welders-summary?isoId=iso-4',
    '/pdf/punch-list?isoId=iso-4', '/pdf/flange-report?isoId=iso-4', '/pdf/certification-index?siteId=site-river', '/pdf/certification-index?projectId=project-steam']) assert.equal(await status(north.as, path, 'weld'), 403, path);
  for (const path of ['/pdf/ndt-request?requestNo=R00004', '/pdf/ndt-pre-request?requestNo=R00003']) assert.equal(await status(north.as, path, 'weld'), 404, path);
  for (const path of ['/pdf/lisl-gu?isoId=iso-1', '/pdf/ndt-request?requestNo=NDT-2026-0001', '/pdf/punch-list?isoId=iso-1', '/pdf/flange-report?isoId=iso-1', '/pdf/certification-index?siteId=site-north']) assert.equal(await status(north.as, path, 'weld'), 200, path);
  const files = f.store.list('attachments').length;
  assert.equal(await status(north.as, '/pdf/ndt-request?requestNo=R00004', 'weld', { method: 'POST' }), 404, 'attach to a request of the other main project');
  assert.equal(f.store.list('attachments').length, files, 'nothing was attached');
  // Sample pick lists are 00001 (North) and 00002 (Riverside): five digits (w2-mto-stock-core), and punch items have a counter of their own.
  assert.equal(await status(river.as, '/pdf/pick-list?reportNo=00001', 'mto'), 404, 'pick list of North');
  assert.equal(await status(river.as, '/pdf/pick-list?reportNo=00002', 'mto'), 200, 'pick list of Riverside');
  assert.equal(await status(river.as, '/pdf/mto-report?isoId=iso-1', 'mto'), 403);

  // ISO Book: the isometrics of the other main project are refused (403), also next to an allowed one.
  assert.equal(await status(north.as, '/iso-book/parts?isoIds=iso-4', 'weld'), 403);
  assert.equal(await status(north.as, '/iso-book/parts?isoIds=iso-1', 'weld'), 200);
  assert.equal(await status(north.as, '/iso-book', 'weld', { method: 'POST', data: { isoIds: ['iso-1', 'iso-4'], parts: ['task-sheet'] } }), 403);
  assert.equal(await status(river.as, '/iso-book', 'mto', { method: 'POST', data: { isoIds: ['iso-1'], parts: ['task-sheet'] } }), 403);
  const riverFile = (await json<{ record: Row }>(await f.upload(f.admin, 'mto', 'isometrics', 'iso-4', 'river-book.txt'))).record;
  const book = await north.as.request('/iso-book', { pilot: 'weld', method: 'POST', data: { isoIds: ['iso-1'], parts: ['task-sheet', 'punch-list', 'flange-report', 'ndt'] } });
  assert.equal(book.status, 200, await book.clone().text());
  assert.ok(!Buffer.from(await book.arrayBuffer()).includes(String(riverFile.name)), 'no file of the other main project');

  // MTO dashboard: every collection it reads holds only records of the account's main project (or global ones).
  const scope = resolver(f.store);
  const data = await json<Bootstrap>(await river.as.request('/bootstrap', { pilot: 'mto' }));
  for (const key of [...MTO_DASHBOARD_REQUIRED, ...MTO_DASHBOARD_OPTIONAL]) {
    assert.ok(Array.isArray(data.rows[key]), `${key} is delivered`);
    for (const row of data.rows[key]) assert.notEqual(scope.siteOf(key, row), NORTH, `${key} ${row.id} belongs to North`);
  }
  const board = mtoDashboard(data.rows).board;
  assert.ok(board.length > 0 && board.every(row => RIVER_ISOS.includes(row.isoId)), 'the operations board lists Riverside isometrics only');
});

// ----- a profile per project site, the active main project, welders per main project, projects switched off for a pilot ----

test('a profile per project site: the active main project decides the profile, and its rights never act on another main project', async t => {
  const f = await fixture(t);
  const review = f.profile('Only review', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  const writer = f.profile('Weld writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const both = f.account('Two sites', { profileId: review, weldProfileId: review, weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteProfiles: JSON.stringify({ [NORTH]: review, [RIVER]: writer }) }, { weld: [NORTH, RIVER] });
  await both.login();
  const save = (isoId: string, weldNo: string, site?: string) => both.as.request('/actions/save-weld', { method: 'POST', pilot: 'weld', site, data: { isoId, weldNo } });
  // North: 'Only review'. Riverside: welds insert.
  assert.equal((await save('iso-1', 'PS-N1', NORTH)).status, 403, 'Only review on North');
  const created = await save('iso-4', 'PS-R1', RIVER); assert.equal(created.status, 201, await created.clone().text());
  // The Riverside profile does not reach North within the same request: the scope is the active main project only.
  const crossed = await save('iso-1', 'PS-N2', RIVER); assert.equal(crossed.status, 403); assert.equal((await json(crossed)).code, 'site');
  assert.equal((await both.as.request('/history/isometrics/iso-1', { pilot: 'weld', site: RIVER })).status, 403);
  // Without the main project the request is refused; a main project outside the account's list too (forged header).
  const missing = await both.as.request('/records/welds', { pilot: 'weld' }); assert.equal(missing.status, 403); assert.equal((await json(missing)).code, 'site');
  assert.equal((await save('iso-4', 'PS-R2')).status, 403);
  const other = f.store.create('sites', { name: 'Harbour yard' }, SYSTEM);
  const forged = await both.as.request('/records/welds', { pilot: 'weld', site: other.id }); assert.equal(forged.status, 403); assert.equal((await json(forged)).code, 'site');
  // Download links name the main project in the query; it must agree with a header.
  assert.equal((await both.as.request(`/records/welds?site=${RIVER}`, { pilot: 'weld' })).status, 200);
  assert.equal((await both.as.request(`/records/welds?site=${NORTH}`, { pilot: 'weld', site: RIVER })).status, 403);
  // Bootstrap: without a main project only the choice (no rights, every main project read with its own profile).
  const choice = await json<Bootstrap & { siteRows?: Record<string, Row[]> }>(await both.as.request('/bootstrap', { pilot: 'weld' }));
  assert.equal(choice.user.siteRequired, true); assert.deepEqual(choice.user.capabilities, {}); assert.deepEqual(choice.user.permissions, { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 });
  assert.deepEqual(choice.rows.sites.map(row => row.id).sort(), [NORTH, RIVER]);
  assert.ok(choice.rows.isometrics.length > 0 && !choice.rows.iso_materials);
  // With a main project: that main project's profile and rows; the choice comes along for switching.
  const river = await json<Bootstrap & { siteRows?: Record<string, Row[]> }>(await both.as.request('/bootstrap', { pilot: 'weld', site: RIVER }));
  assert.equal(river.user.siteId, RIVER); assert.equal(river.user.permissions.welding, 2);
  assert.deepEqual(river.rows.sites.map(row => row.id), [RIVER]);
  assert.ok(river.rows.isometrics.every(row => RIVER_ISOS.includes(row.id)));
  assert.deepEqual(river.siteRows!.sites.map(row => row.id).sort(), [NORTH, RIVER]);
  const north = await json<Bootstrap>(await both.as.request('/bootstrap', { pilot: 'weld', site: NORTH }));
  assert.equal(north.user.permissions.welding, 1, 'North reads with Only review');
  // The selector lists both main projects; the account enters Weld Pilot only once one is chosen.
  assert.deepEqual((await json<Bootstrap>(await both.as.request('/bootstrap'))).mainProjects!.filter(site => site.pilots.includes('weld')).map(site => site.id).sort(), [NORTH, RIVER]);
  // An account with one main project needs no header: its only main project applies.
  const single = f.account('One site', { profileId: review, weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteProfiles: JSON.stringify({ [RIVER]: writer }) }, { weld: [RIVER] });
  await single.login();
  assert.equal((await single.as.request('/actions/save-weld', { method: 'POST', pilot: 'weld', data: { isoId: 'iso-5', weldNo: 'PS-R3' } })).status, 201);
  assert.equal((await single.as.request('/records/welds', { pilot: 'weld', site: NORTH })).status, 403);
  // 'All project sites': the profiles per site are not read, the pilot's profile applies everywhere.
  const all = f.account('All sites', { profileId: review, weldSiteScope: SITE_SCOPE_ALL, weldSiteProfiles: JSON.stringify({ [NORTH]: writer }) });
  await all.login();
  assert.equal((await all.as.request('/actions/save-weld', { method: 'POST', pilot: 'weld', site: NORTH, data: { isoId: 'iso-1', weldNo: 'PS-N3' } })).status, 403);
});

test('the user form stores a profile per ticked project site; only an administrator of every project site sets them, with valid profiles', async t => {
  const f = await fixture(t);
  const review = f.profile('Only review', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  const writer = f.profile('Weld writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const created = await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Per site', email: 'per-site@example.test', profileId: review, active: true, weldEnabled: true, mtoEnabled: false, weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteIds: [NORTH, RIVER], weldSiteProfiles: JSON.stringify({ [RIVER]: writer, [NORTH]: review }), password: PASSWORD } });
  assert.equal(created.status, 201, await created.clone().text());
  const record = (await json<{ record: Row }>(created)).record;
  assert.equal(record.weldSiteProfiles, JSON.stringify({ [NORTH]: review, [RIVER]: writer }), 'stored sorted, as delivered to the form');
  for (const value of ['{"site-north":"no-such-profile"}', '{"no-such-site":"' + review + '"}', 'not json', '["a"]']) {
    const row = f.store.get('users', record.id);
    const refused = await f.admin.request(`/records/users/${record.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteProfiles: value, _version: row._version } });
    assert.equal(refused.status, 422, value);
  }
  // An administrator limited to one main project may not change profiles per project site (that widens access).
  const admin = f.store.list('profiles').find(row => row.id === 'profile-admin')!.id;
  const limitedAdmin = f.account('Limited admin', { profileId: admin, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoEnabled: false }, { weld: [NORTH] });
  await limitedAdmin.login();
  const row = f.store.get('users', record.id);
  assert.equal((await limitedAdmin.as.request(`/records/users/${record.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteProfiles: JSON.stringify({ [NORTH]: writer }), _version: row._version } })).status, 403);
  assert.equal(f.store.get('users', record.id).weldSiteProfiles, row.weldSiteProfiles);
  // The account itself cannot change its own profiles per site either.
  const self = f.client(); await self.login('per-site@example.test');
  assert.equal((await self.request(`/records/users/${record.id}`, { method: 'PUT', pilot: 'weld', site: RIVER, data: { weldSiteProfiles: JSON.stringify({ [NORTH]: writer, [RIVER]: writer }), _version: row._version } })).status, 403);
});

test('welders, their qualifications and certificates follow the main project for a limited account (scn-SC-D7)', async t => {
  const f = await fixture(t);
  const writer = f.profile('Site writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const north = f.account('North reader', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoEnabled: false }, { weld: [NORTH] });
  await north.login();
  const ids = async (key: string) => (await json<{ rows: Row[] }>(await north.as.request(`/records/${key}`, { pilot: 'weld' }))).rows.map(row => String(row.number ?? row.name)).sort();
  // W-001 / W-002 work on North (and are globally deployable), W-005 is linked to no main project; W-003 / W-004 only on Riverside.
  assert.deepEqual(await ids('welders'), ['W-001', 'W-002', 'W-005']);
  const riverOnly = ['welder-3', 'welder-4'];
  assert.equal((await north.as.request('/history/welders/welder-3', { pilot: 'weld' })).status, 403);
  const qualifications = (await json<{ rows: Row[] }>(await north.as.request('/records/welder_certificates', { pilot: 'weld' }))).rows;
  assert.ok(qualifications.every(row => !riverOnly.includes(String(row.welderId))), 'no qualification of a Riverside welder');
  const certificates = (await json<{ rows: Row[] }>(await north.as.request('/records/certifications', { pilot: 'weld' }))).rows;
  assert.ok(certificates.length > 0 && certificates.every(row => !row.siteId || row.siteId === NORTH), 'certificates of North only');
  assert.ok(!certificates.some(row => row.name === 'ATT-26-1190'), 'the Riverside certificate stays out');
  const weld = await json<Bootstrap>(await north.as.request('/bootstrap', { pilot: 'weld' }));
  assert.ok(!weld.rows.welders.some(row => riverOnly.includes(row.id)));
  // An account of every main project still reads all of them.
  assert.ok((await json<{ rows: Row[] }>(await f.admin.request('/records/welders', { pilot: 'weld' }))).rows.some(row => row.id === 'welder-3'));
});

test('a project switched off for a pilot is not delivered or changed there (scn-SC-N9); the Request archive follows the open main project (scn-SC-D6)', async t => {
  const f = await fixture(t);
  seedMtoLogistics(f.store, SYSTEM);
  // Switch STX-2403 (iso-7 … iso-10) off for MTO Pilot (the sample data has it on in both pilots).
  const skidProject = f.store.get('projects', 'project-skid'); f.store.update('projects', skidProject.id, { mtoPilot: false }, skidProject._version, SYSTEM);
  const skid = ['iso-7', 'iso-8', 'iso-9', 'iso-10'];
  const mto = await json<Bootstrap>(await f.admin.request('/bootstrap', { pilot: 'mto' }));
  assert.ok(!mto.rows.projects.some(row => row.id === 'project-skid'), 'MTO bootstrap: no switched-off project');
  assert.ok(!mto.rows.isometrics.some(row => skid.includes(row.id)), 'MTO bootstrap: none of its isometrics');
  assert.ok(!mto.rows.iso_materials.some(row => skid.includes(String(row.isoId))), 'MTO bootstrap: none of its requirements');
  assert.ok(!Object.keys((mto as Bootstrap & { isoSummaries: Record<string, unknown> }).isoSummaries).some(id => skid.includes(id)));
  assert.equal((await f.admin.request('/history/isometrics/iso-8', { pilot: 'mto' })).status, 404);
  assert.equal((await f.admin.request('/actions/add-iso-material', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-8', source: 'Custom', materialNo: 'OFF', description: 'Off', quantity: 1, uom: 'M' } })).status, 404);
  assert.ok(!(await (await f.admin.request('/export/isometrics?format=csv', { pilot: 'mto' })).text()).includes('STX-SK-'));
  // Weld Pilot still delivers it.
  const weld = await json<Bootstrap>(await f.admin.request('/bootstrap', { pilot: 'weld' }));
  assert.ok(skid.every(id => weld.rows.isometrics.some(row => row.id === id)));
  // Switching the project off in the pilot itself still saves (the project leaves that pilot's lists afterwards).
  const cooling = f.store.get('projects', 'project-cooling');
  assert.equal((await f.admin.request('/records/projects/project-cooling', { method: 'PUT', pilot: 'mto', data: { mtoPilot: false, _version: cooling._version } })).status, 200);
  const after = await json<Bootstrap>(await f.admin.request('/bootstrap', { pilot: 'mto' }));
  assert.ok(!after.rows.projects.some(row => row.id === 'project-cooling'));
  const back = f.store.get('projects', 'project-cooling'); f.store.update('projects', back.id, { mtoPilot: true }, back._version, SYSTEM);
  // Request archive: the open main project shows only its own requests (view), a limited account gets only its own (server).
  const rows = (await json<Bootstrap>(await f.admin.request('/bootstrap', { pilot: 'mto' }))).rows;
  const siteOfRequest = (request: Row) => resolver(f.store).siteOf('service_requests', request);
  assert.ok(rows.service_requests.some(row => siteOfRequest(row) === NORTH) && rows.service_requests.some(row => siteOfRequest(row) === RIVER), 'sample requests on both main projects');
  assert.ok(projectScope(rows, RIVER).service_requests.every(row => siteOfRequest(row) === RIVER), 'Riverside lists Riverside requests only');
  const writer = f.profile('MTO writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const river = f.account('River logistics', { profileId: writer, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [RIVER] });
  await river.login();
  const own = (await json<{ rows: Row[] }>(await river.as.request('/records/service_requests', { pilot: 'mto' }))).rows;
  assert.ok(own.length > 0 && own.every(row => siteOfRequest(row) === RIVER));
  const northOpen = rows.service_requests.find(row => siteOfRequest(row) === NORTH && row.status !== 'Completed');
  assert.ok(northOpen, 'an open request of North');
  // The Complete step is gone (w2-mto-spool-logistics); the North request is refused on its record routes.
  assert.equal((await river.as.request(`/history/service_requests/${northOpen!.id}`, { pilot: 'mto' })).status, 403);
  assert.equal((await river.as.request(`/records/service_requests/${northOpen!.id}`, { method: 'PUT', pilot: 'mto', data: { note: 'River edit', _version: northOpen!._version } })).status, 403);
});

test('an out-of-scope isometric gets the same answer on its PDF as on its record routes (scn-SC-D9)', async t => {
  const f = await fixture(t);
  const writer = f.profile('Site writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const north = f.account('North PDF', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoEnabled: false }, { weld: [NORTH] });
  await north.login();
  const history = await north.as.request('/history/isometrics/iso-4', { pilot: 'weld' }), pdf = await north.as.request('/pdf/lisl?isoId=iso-4', { pilot: 'weld' });
  assert.deepEqual([pdf.status, await pdf.json()], [history.status, await history.json()]);
  assert.equal(history.status, 403);
  // A missing isometric stays "not found".
  assert.equal((await north.as.request('/pdf/lisl?isoId=iso-missing', { pilot: 'weld' })).status, 404);
});

test('the flange assembly record follows its flange: an account limited to one main project neither reads nor writes the record of another', async t => {
  const f = await fixture(t);
  const river = f.store.create('flanges', { isoId: 'iso-4', flange_id: 'FL-RIVER' }, SYSTEM), north = f.store.create('flanges', { isoId: 'iso-1', flange_id: 'FL-NORTH' }, SYSTEM);
  for (const flange of [river, north]) f.store.create('flange_leak_tests', { flangeId: flange.id, test_type: 'Hydrostatic', result: 'Passed', tested_at: '2026-11-16T10:00' }, SYSTEM);
  assert.deepEqual([river, north].map(flange => resolver(f.store).siteOf('flange_leak_tests', f.store.list('flange_leak_tests').find(row => row.flangeId === flange.id)!)), [RIVER, NORTH]);
  const writer = f.profile('Flange site writer', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const scoped = f.account('North fitter', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await scoped.login();
  const data = await json<Bootstrap>(await scoped.as.request('/bootstrap', { pilot: 'weld' }));
  assert.deepEqual(data.rows.flange_leak_tests.map(row => row.flangeId), [north.id], 'only the record of the own main project is delivered');
  const refused = await scoped.as.request(`/flanges/${river.id}/leak-tests`, { method: 'POST', pilot: 'weld', data: { test_type: 'Hydrostatic', result: 'Passed', tested_at: '2026-11-16T11:00' } });
  assert.equal(refused.status, 403); assert.equal((await json(refused)).code, 'site');
  assert.equal((await scoped.as.request(`/flanges/${north.id}/leak-tests`, { method: 'POST', pilot: 'weld', data: { test_type: 'Hydrostatic', result: 'Passed', tested_at: '2026-11-16T11:00' } })).status, 201);
  assert.equal((await scoped.as.request(`/flanges/${river.id}/protocol-preview`, { pilot: 'weld' })).status, 403);
});

test('the Request archive of an account that reaches every main project follows the session\'s main project on the server (scn-SC-D6)', async t => {
  const f = await fixture(t);
  seedMtoLogistics(f.store, SYSTEM);
  const writer = f.profile('All sites logistics', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const all = f.account('All sites logistics', { profileId: writer, weldEnabled: false });
  await all.login();
  const siteOfRequest = (request: Row) => resolver(f.store).siteOf('service_requests', request);
  const requests = f.store.list('service_requests');
  const north = requests.find(row => siteOfRequest(row) === NORTH)!, river = requests.find(row => siteOfRequest(row) === RIVER)!;
  assert.ok(north && river, 'sample requests on both main projects');
  // No main project chosen yet: as before, every request.
  const before = (await json<{ rows: Row[] }>(await all.as.request('/records/service_requests', { pilot: 'mto' }))).rows;
  assert.ok(before.some(row => row.id === north.id) && before.some(row => row.id === river.id));
  // Riverside chosen for the session: lists, records and their routes follow it; the rest of the workspace does not narrow.
  assert.equal((await all.as.request('/auth/site', { method: 'POST', data: { siteId: RIVER } })).status, 200);
  const listed = (await json<{ rows: Row[] }>(await all.as.request('/records/service_requests', { pilot: 'mto' }))).rows;
  assert.ok(listed.length > 0 && listed.every(row => siteOfRequest(row) === RIVER), 'Riverside requests only');
  const boot = await json<Bootstrap>(await all.as.request('/bootstrap', { pilot: 'mto' }));
  assert.ok(boot.rows.service_requests.every(row => siteOfRequest(row) === RIVER));
  assert.ok(boot.rows.isometrics.some(row => row.id === 'iso-1'), 'other records of every main project stay');
  assert.equal(boot.user.siteId, RIVER); assert.equal(boot.user.siteLimited, undefined);
  const refused = await all.as.request(`/history/service_requests/${north.id}`, { pilot: 'mto' });
  assert.equal(refused.status, 403); assert.equal((await json(refused)).code, 'site');
  assert.equal((await all.as.request(`/records/service_requests/${north.id}`, { method: 'PUT', pilot: 'mto', data: { note: 'Other site', _version: north._version } })).status, 403);
  assert.equal((await all.as.request(`/records/service_requests/${north.id}/archive`, { method: 'POST', pilot: 'mto', data: { _version: north._version } })).status, 403);
  assert.equal((await all.as.request(`/history/service_requests/${river.id}`, { pilot: 'mto' })).status, 200);
  assert.equal(f.store.get('service_requests', north.id).note, north.note, 'nothing changed');
});
