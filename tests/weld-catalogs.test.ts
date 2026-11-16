import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { setAvailability, siteOfRecord } from '../server/weld-catalogs.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { ATTACHMENT_POSITIONS, DEFECT_CODE_NORMS, SITE_ENABLED_RESOURCES, WELD_CATALOG_COLUMNS, WELD_CATALOG_RESOURCES, defectCodeMatchesNorm, enabledOnSite, enabledOptions, missingRequired, orderedAttachmentNames, selectableDefectCodes } from '../shared/weld-catalogs.ts';
import type { Bootstrap, Row } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...extra }) as Row;
const link = (resourceKey: string, recordId: string, siteId: string, enabled: boolean, archived = false) => row(`${resourceKey}-${recordId}-${siteId}`, { resourceKey, recordId, siteId, enabled, _archived: archived });

test('a record without enablement information is enabled everywhere; a link switches it off for one site only', () => {
  const rows = { catalog_sites: [link('weld_types', 'a', 'north', false), link('weld_types', 'b', 'north', true), link('weld_types', 'c', 'north', false, true)] };
  assert.equal(enabledOnSite('weld_types', row('a'), 'north', rows), false);
  assert.equal(enabledOnSite('weld_types', row('a'), 'river', rows), true);
  assert.equal(enabledOnSite('weld_types', row('b'), 'north', rows), true);
  assert.equal(enabledOnSite('weld_types', row('z'), 'north', rows), true);
  assert.equal(enabledOnSite('weld_types', row('c'), 'north', rows), true, 'an archived link carries no information');
  assert.equal(enabledOnSite('weld_types', row('a'), '', rows), true, 'without an active site nothing is hidden');
  assert.equal(enabledOnSite('weld_types', row('a'), 'north', {}), true, 'a workspace that cannot read the links hides nothing');
  assert.equal(enabledOnSite('welds', row('a'), 'north', { catalog_sites: [link('welds', 'a', 'north', false)] }), true, 'resources without enablement are never hidden');
  assert.deepEqual(SITE_ENABLED_RESOURCES.sort(), ['coatings', 'laydowns', 'ndt_defect_codes', 'ndt_locations', 'ndt_processes', 'pwht_locations', 'pwht_processes', 'qa_engineers', 'service_companies', 'suppliers', 'weld_types'].sort());
});

test('a ref select offers the enabled records plus the value already stored', () => {
  const options = ['a', 'b', 'c'].map(id => row(id));
  const rows = { catalog_sites: [link('coatings', 'a', 'north', false), link('coatings', 'b', 'north', false)] };
  assert.deepEqual(enabledOptions('coatings', options, 'north', rows).map(o => o.id), ['c']);
  assert.deepEqual(enabledOptions('coatings', options, 'north', rows, 'a').map(o => o.id), ['a', 'c']);
  assert.deepEqual(enabledOptions('coatings', options, 'north', rows, ['b', 'a']).map(o => o.id), ['a', 'b', 'c']);
  assert.deepEqual(enabledOptions('coatings', options, 'river', rows).map(o => o.id), ['a', 'b', 'c']);
  assert.equal(enabledOptions('materials', options, 'north', rows).length, 3);
});

test('defect codes follow the defect norm of the site and the per-site enablement', () => {
  const codes = [row('1', { code: '401', norm: 'ISO 6520-1' }), row('2', { code: 'B31-CR', norm: 'ASME B31.3' }), row('3', { code: 'PO', norm: 'Current list' }), row('4', { code: '100', norm: '' }), row('5', { code: '2011', norm: 'ISO 6520-1' }), row('6', { code: '999', norm: 'ISO 6520-1', _archived: true })];
  const rows = { ndt_defect_codes: codes, catalog_sites: [link('ndt_defect_codes', '5', 'north', false)] };
  const codeList = (site: Record<string, unknown> | null, id = 'north') => selectableDefectCodes(rows, site, id).map(c => c.code);
  assert.deepEqual(codeList({ id: 'north', defectNorm: 'ISO 6520-1' }), ['100', '401', 'PO']);
  assert.deepEqual(codeList({ id: 'north', defectNorm: 'ASME B31.3' }), ['100', 'B31-CR', 'PO']);
  assert.deepEqual(codeList({ id: 'north', defectNorm: 'No norm selected' }), ['100', '401', 'B31-CR', 'PO'], 'no norm: every enabled code');
  assert.deepEqual(codeList({ id: 'river', defectNorm: 'ISO 6520-1' }, 'river'), ['100', '401', '2011', 'PO'], 'enablement is per site');
  assert.equal(defectCodeMatchesNorm({ norm: 'Current list' }, 'API 1104'), true);
  assert.deepEqual(DEFECT_CODE_NORMS, ['Current list', 'ISO 6520-1', 'ASME B31.3', 'API 1104']);
});

test('attachment names are ordered before / after the isometric, then by manual order', () => {
  const names = [row('a', { name: 'Release', position: ATTACHMENT_POSITIONS[1], sort: 2 }), row('b', { name: 'Drawing', position: ATTACHMENT_POSITIONS[0], sort: 5 }), row('c', { name: 'Report', position: ATTACHMENT_POSITIONS[1], sort: 1 }), row('d', { name: 'Cover', position: ATTACHMENT_POSITIONS[0], sort: 1 }), row('e', { name: 'Old', position: ATTACHMENT_POSITIONS[0], sort: 0, _archived: true })];
  assert.deepEqual(orderedAttachmentNames(names).map(n => n.name), ['Cover', 'Drawing', 'Report', 'Release']);
});

test('the hosted profile requires the reference fields; the shared resource keeps them optional', () => {
  assert.deepEqual(missingRequired('weld_types', { name: 'Butt' }), { location: 'Shop/Field is required.', abbreviation: 'Abbreviation is required.' });
  assert.deepEqual(missingRequired('weld_types', { name: 'Butt', location: 'Shop', abbreviation: 'BW' }), {});
  assert.deepEqual(missingRequired('weld_types', { description: 'x' }, row('w', { location: 'Shop', abbreviation: 'BW' })), {}, 'stored values count on an edit');
  assert.deepEqual(missingRequired('weld_types', { abbreviation: ' ' }, row('w', { location: 'Shop', abbreviation: 'BW' })), { abbreviation: 'Abbreviation is required.' });
  assert.deepEqual(Object.keys(missingRequired('qa_engineers', { name: 'Ana' })), ['companyId']);
  assert.deepEqual(Object.keys(missingRequired('companies', { name: 'Co' })), ['address']);
  for (const key of ['weld_types', 'coatings', 'ndt_processes', 'pwht_processes', 'qa_engineers', 'companies']) {
    const resource = projectResource(hosted, RESOURCE_MAP[key]);
    assert.ok(resource.fields.filter(f => ['location', 'abbreviation', 'description', 'companyId', 'address'].includes(f.name) && missingRequired(key, {})[f.name]).every(f => f.required), key);
    assert.ok(RESOURCE_MAP[key].fields.filter(f => missingRequired(key, {})[f.name]).every(f => !f.required), `${key} stays optional outside the hosted profile`);
  }
});

test('every catalog carries the capture\'s labels, columns and options and is delivered with a menu item', () => {
  const resource = (key: string) => projectResource(hosted, RESOURCE_MAP[key]);
  const labels = (key: string) => WELD_CATALOG_COLUMNS[key].map(name => resource(key).fields.find(f => f.name === name)?.label);
  assert.deepEqual(labels('weld_processes'), ['Weld process']);
  assert.deepEqual(labels('weld_types'), ['Weld type', 'Shop/Field', 'Abbreviation', 'Joint type', 'Groove type']);
  assert.deepEqual(labels('coatings'), ['Coating', 'Abbreviation']);
  assert.deepEqual(labels('ndt_groups'), ['NDT process group', 'Description']);
  assert.deepEqual(labels('ndt_processes'), ['NDT process', 'Description', 'Group', 'WPR']);
  assert.deepEqual(labels('ndt_defect_codes'), ['Code', 'English', 'Dutch', 'Group', 'Norm', 'ISO 6520-1 reference']);
  assert.deepEqual(labels('ndt_locations'), ['Location']);
  assert.deepEqual(labels('pwht_processes'), ['PWHT process Nr.', 'Description']);
  assert.deepEqual(labels('pwht_locations'), ['Location']);
  assert.deepEqual(labels('qa_engineers'), ['Name', 'Company', 'Phone', 'Email address', 'Stamp']);
  assert.deepEqual(labels('companies'), ['Name', 'Address', 'Phone', 'Email address']);
  assert.deepEqual(labels('attachment_names').slice(0, 3), ['Name', 'ISO Book', 'Hydrotest']);
  assert.deepEqual(resource('qa_engineers').fields.slice(0, 8).map(f => f.label), ['Name', 'Company', 'Phone', 'Email address', 'Stamp', 'Level', 'Certificate 1', 'Certificate 2']);
  assert.deepEqual(resource('weld_types').fields.find(f => f.name === 'location')?.options, ['Shop', 'Field']);
  assert.deepEqual(resource('attachment_names').fields.find(f => f.name === 'position')?.options, ['Before Isometric', 'After Isometric']);
  assert.equal(resource('ndt_defect_codes').fields.find(f => f.name === 'group')?.options?.length, 6);
  for (const key of WELD_CATALOG_RESOURCES) {
    assert.ok(hosted.navigation.includes(key), key); assert.ok(resource(key).columns.length, key);
    assert.ok(PILOT_MAP.weld.groups.some(group => group.items.some(item => item.resource === key)), `menu item for ${key}`);
  }
  assert.deepEqual(PILOT_MAP.weld.groups.find(g => g.title === 'NDT data')!.items.map(i => i.label), ['NDT process groups', 'NDT process', 'Defect codes', 'NDT locations', 'PWHT process', 'PWHT locations']);
  assert.ok(!hosted.navigation.includes('catalog_sites') && hosted.resources.catalog_sites, 'availability links are data, not a page');
});

test('the site of a record follows its isometric, weld or request; references to switched-off catalog records are refused', () => {
  const store = new Store(':memory:'); seed(store);
  const river = store.list('isometrics').find(iso => iso.id === 'iso-4')!, north = store.get('isometrics', 'iso-1');
  assert.equal(siteOfRecord(store, 'welds', { isoId: river.id }), 'site-river');
  assert.equal(siteOfRecord(store, 'welds', { isoId: north.id }), 'site-north');
  assert.equal(siteOfRecord(store, 'inspection_requests', { weldId: 'weld-1' }), 'site-north');
  assert.equal(siteOfRecord(store, 'weld_types', {}), '');
  // weld-type-11 and weld-type-12 (Victaulic) are switched off on the river site in the sample data only.
  assert.throws(() => store.create('welds', { weldNo: 'W900', isoId: river.id, typeId: 'weld-type-11' }, SYSTEM), (error: Error & { fields?: Record<string, string> }) => /highlighted/.test(error.message) && /not enabled/.test(error.fields?.typeId || ''));
  const ok = store.create('welds', { weldNo: 'W900', isoId: north.id, typeId: 'weld-type-11' }, SYSTEM);
  assert.equal(ok.typeId, 'weld-type-11', 'enabled on the north site');
  const kept = store.create('welds', { weldNo: 'W901', isoId: river.id, typeId: 'weld-type-1' }, SYSTEM);
  setAvailability(store, 'weld_types', 'weld-type-1', 'site-river', false, SYSTEM);
  assert.equal(store.update('welds', kept.id, { description: 'edited' }, kept._version, SYSTEM).typeId, 'weld-type-1', 'a value already stored is kept');
  const moved = store.update('welds', kept.id, { typeId: 'weld-type-0' }, store.get('welds', kept.id)._version, SYSTEM); assert.equal(moved.typeId, 'weld-type-0');
  assert.throws(() => store.update('welds', kept.id, { typeId: 'weld-type-1' }, moved._version, SYSTEM), /highlighted/, 'changing back to a switched-off record is refused');
  setAvailability(store, 'weld_types', 'weld-type-1', 'site-river', true, SYSTEM);
  assert.equal(store.update('welds', kept.id, { typeId: 'weld-type-1' }, moved._version + 0, SYSTEM)._version >= 1, true);
  store.close();
});

test('setting availability keeps one link per record and site and never needs a row to switch on', () => {
  const store = new Store(':memory:'); seed(store);
  const count = () => store.list('catalog_sites').filter(l => l.recordId === 'coating-epoxy').length;
  setAvailability(store, 'coatings', 'coating-epoxy', 'site-north', true, SYSTEM); assert.equal(count(), 0);
  setAvailability(store, 'coatings', 'coating-epoxy', 'site-north', false, SYSTEM); assert.equal(count(), 1);
  setAvailability(store, 'coatings', 'coating-epoxy', 'site-north', false, SYSTEM); assert.equal(count(), 1);
  setAvailability(store, 'coatings', 'coating-epoxy', 'site-north', true, SYSTEM); assert.equal(count(), 1);
  const rows = { catalog_sites: store.list('catalog_sites') };
  assert.equal(enabledOnSite('coatings', store.get('coatings', 'coating-epoxy'), 'site-north', rows), true);
  assert.equal(enabledOnSite('coatings', store.get('coatings', 'coating-pu'), 'site-river', rows), false);
  assert.ok(store.list('ndt_defect_codes').length >= 20 && store.list('ndt_groups').length === 11 && store.list('weld_types').length === 17);
  store.close();
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-weld-catalogs-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Catalog-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  const rows = async (key: string) => ((await (await request('/api/bootstrap')).json()) as Bootstrap).rows[key] || [];
  return { store, request, signIn, rows, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Catalog admin', email: 'catalog-admin@example.test', password })).status, 201) };
}
const body = async (response: Response) => await response.json() as { record?: Row; error?: string; fields?: Record<string, string>; count?: number };

test('hosted: reference-required fields are enforced on create and edit, in both directions', async t => {
  const f = await hostedFixture(t); await f.setup();
  let response = await f.request('/api/records/weld_types', 'POST', { name: 'Test branch' });
  assert.equal(response.status, 422); assert.deepEqual(Object.keys((await body(response)).fields!).sort(), ['abbreviation', 'location']);
  response = await f.request('/api/records/weld_types', 'POST', { name: 'Offset branch', location: 'Field', abbreviation: 'OB-F', jointType: 'Branch connection', grooveType: 'Single bevel' });
  assert.equal(response.status, 201); const type = (await body(response)).record!;
  assert.equal(type.grooveType, 'Single bevel');
  response = await f.request(`/api/records/weld_types/${type.id}`, 'PUT', { abbreviation: '', _version: type._version });
  assert.equal(response.status, 422); assert.ok((await body(response)).fields!.abbreviation);
  assert.equal((await f.request('/api/records/coatings', 'POST', { name: 'Epoxy topcoat' })).status, 422);
  assert.equal((await f.request('/api/records/coatings', 'POST', { name: 'Epoxy topcoat', abbreviation: 'ET' })).status, 201);
  assert.equal((await f.request('/api/records/ndt_processes', 'POST', { name: 'ECT' })).status, 422);
  assert.equal((await f.request('/api/records/ndt_processes', 'POST', { name: 'ECT', description: 'Eddy current testing', groupId: 'ndt-group-ut', wpr: true })).status, 201);
  assert.equal((await f.request('/api/records/pwht_processes', 'POST', { name: 'PWHT-03' })).status, 422);
  assert.equal((await f.request('/api/records/qa_engineers', 'POST', { name: 'No company' })).status, 422);
  assert.equal((await f.request('/api/records/qa_engineers', 'POST', { name: 'Ana Ruiz', companyId: 'company-north', stamp: 'AR-01', certificate1: 'ISO 9712 MT-2' })).status, 201);
  assert.equal((await f.request('/api/records/companies', 'POST', { name: 'Harbour Welding BV' })).status, 422);
  assert.equal((await f.request('/api/records/companies', 'POST', { name: 'Harbour Welding BV', address: '5 Dockside', phone: '+31 10 555 0199' })).status, 201);
  response = await f.request('/api/records/ndt_defect_codes', 'POST', { code: 'X1' });
  assert.equal(response.status, 422); assert.deepEqual(Object.keys((await body(response)).fields!), ['english']);
  assert.equal((await f.request('/api/records/ndt_defect_codes', 'POST', { code: '2012', english: 'Uniform porosity', dutch: 'Gelijkmatige porositeit', group: 'Cavity', norm: 'ISO 6520-1', isoRef: '2012' })).status, 201);
  assert.equal((await f.request('/api/records/ndt_defect_codes', 'POST', { code: '2012', english: 'Duplicate', group: 'Cavity', norm: 'ISO 6520-1' })).status, 409);
  assert.equal((await f.request('/api/records/ndt_defect_codes', 'POST', { code: 'Q', english: 'Odd', group: 'Other' })).status, 422);
  response = await f.request('/api/records/attachment_names', 'POST', { name: 'Welder certificates', isoBook: true, hydrotest: false, position: 'Before Isometric', sort: 3 });
  assert.equal(response.status, 201); assert.equal((await body(response)).record!.isoBook, true);
  assert.equal((await f.request('/api/records/attachment_names', 'POST', { name: 'Wrong place', position: 'Underneath' })).status, 422);
});

test('hosted: enablement through the form, the bulk Options and refusal of malformed instructions', async t => {
  const f = await hostedFixture(t); await f.setup();
  let response = await f.request('/api/records/coatings', 'POST', { name: 'Epoxy topcoat', abbreviation: 'ET', enabledOnSite: false, enabledSiteId: 'site-river' });
  assert.equal(response.status, 201); const coating = (await body(response)).record!;
  let links = (await f.rows('catalog_sites')).filter(l => l.recordId === coating.id);
  assert.deepEqual(links.map(l => [l.resourceKey, l.siteId, l.enabled]), [['coatings', 'site-river', false]]);
  assert.equal(coating.enabledOnSite, undefined, 'the instruction is not stored on the record');
  // The catalog stays global: the other main project still has it.
  assert.equal(enabledOnSite('coatings', coating, 'site-north', { catalog_sites: await f.rows('catalog_sites') }), true);
  response = await f.request(`/api/records/coatings/${coating.id}`, 'PUT', { enabledOnSite: true, enabledSiteId: 'site-river', _version: coating._version });
  assert.equal(response.status, 200);
  links = (await f.rows('catalog_sites')).filter(l => l.recordId === coating.id); assert.deepEqual(links.map(l => l.enabled), [true]);
  // Bulk "Deactivate on this site" for checked rows, and "Activate" again.
  const types = (await f.rows('weld_types')).slice(0, 3);
  const bulk = (enabled: boolean, siteId = 'site-north') => f.request('/api/bulk/weld_types', 'POST', { ids: types.map(r => r.id), versions: Object.fromEntries(types.map(r => [r.id, r._version])), changes: { enabledOnSite: enabled, enabledSiteId: siteId } });
  response = await bulk(false); assert.equal(response.status, 200); assert.equal((await body(response)).count, 3);
  let off = (await f.rows('catalog_sites')).filter(l => l.resourceKey === 'weld_types' && l.siteId === 'site-north' && types.some(r => r.id === l.recordId));
  assert.equal(off.length, 3); assert.ok(off.every(l => l.enabled === false));
  const fresh = (await f.rows('weld_types')).filter(r => types.some(x => x.id === r.id));
  response = await f.request('/api/bulk/weld_types', 'POST', { ids: fresh.map(r => r.id), versions: Object.fromEntries(fresh.map(r => [r.id, r._version])), changes: { enabledOnSite: true, enabledSiteId: 'site-north' } });
  assert.equal(response.status, 200);
  off = (await f.rows('catalog_sites')).filter(l => l.resourceKey === 'weld_types' && l.siteId === 'site-north' && types.some(r => r.id === l.recordId));
  assert.ok(off.every(l => l.enabled === true), 'activating keeps one link per record and site'); assert.equal(off.length, 3);
  // Malformed instructions.
  const current = (await f.rows('coatings')).find(r => r.id === coating.id)!;
  for (const changes of [{ enabledOnSite: 'yes', enabledSiteId: 'site-north' }, { enabledOnSite: false }, { enabledOnSite: false, enabledSiteId: 'nowhere' }, { enabledSiteId: 'site-north' }]) {
    response = await f.request(`/api/records/coatings/${coating.id}`, 'PUT', { ...changes, _version: current._version });
    assert.equal(response.status, 422, JSON.stringify(changes));
  }
  // Not an enablement catalog: the instruction is refused.
  assert.equal((await f.request('/api/records/weld_processes', 'POST', { name: 'Plasma', enabledOnSite: false, enabledSiteId: 'site-north' })).status, 404);
  // Availability rows are written only through their catalog.
  assert.equal((await f.request('/api/records/catalog_sites', 'POST', { resourceKey: 'coatings', recordId: 'x', siteId: 'site-north', enabled: false })).status, 405);
});

test('hosted: a reference to a record switched off on the weld\'s main project is refused by the server', async t => {
  const f = await hostedFixture(t); await f.setup();
  const create = (isoId: string, typeId: string, weldNo: string) => f.request('/api/records/welds', 'POST', { weldNo, isoId, typeId });
  let response = await create('iso-4', 'weld-type-11', 'W910');
  assert.equal(response.status, 422); assert.match((await body(response)).fields!.typeId, /not enabled/);
  assert.equal((await create('iso-1', 'weld-type-11', 'W911')).status, 201, 'the north site still has the type');
  // An inspection request names an NDT process: switch it off for the north site, then try again.
  const weld = (await f.rows('welds')).find(r => r.isoId === 'iso-1')!;
  const rejected = await f.request('/api/records/ndt_locations', 'GET'); assert.equal(rejected.status, 200);
  const lab = (await f.rows('ndt_locations')).find(r => r.id === 'ndt-lab')!;
  assert.equal(enabledOnSite('ndt_locations', lab, 'site-north', { catalog_sites: await f.rows('catalog_sites') }), false, 'sample data');
  response = await f.request('/api/actions/inspection-request', 'POST', { type: 'NDT', weldIds: [weld.id], processId: 'ndt-0', locationId: 'ndt-lab', date: '2026-10-19' });
  assert.equal(response.status, 422);
  response = await f.request('/api/actions/inspection-request', 'POST', { type: 'NDT', weldIds: [weld.id], processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-19' });
  assert.equal(response.status, 201);
});

test('hosted: availability rows follow the catalog\'s permission and the pilot boundary', async t => {
  const f = await hostedFixture(t); await f.setup();
  const visibleKeys = async () => [...new Set((await f.rows('catalog_sites')).map(l => String(l.resourceKey)))].sort();
  assert.deepEqual(await visibleKeys(), ['coatings', 'ndt_defect_codes', 'ndt_locations', 'qa_engineers', 'weld_types']);
  // A reviewer reads the links but cannot change availability.
  await f.signIn('Weld reader', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.ok((await visibleKeys()).includes('weld_types'));
  const type = (await f.rows('weld_types'))[0];
  assert.equal((await f.request(`/api/records/weld_types/${type.id}`, 'PUT', { enabledOnSite: false, enabledSiteId: 'site-north', _version: type._version })).status, 403);
  assert.equal((await f.request('/api/bulk/weld_types', 'POST', { ids: [type.id], versions: { [type.id]: type._version }, changes: { enabledOnSite: false, enabledSiteId: 'site-north' } })).status, 403);
  assert.equal((await f.request('/api/records/weld_types', 'POST', { name: 'Denied', location: 'Shop', abbreviation: 'DN' })).status, 403);
  // A materials-only account in MTO Pilot sees no weld catalog links and cannot reach weld catalogs.
  await f.signIn('Material planner', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  f.usePilot('mto');
  assert.deepEqual(await visibleKeys(), [], 'weld catalog links stay in Weld Pilot');
  for (const key of ['weld_types', 'coatings', 'ndt_defect_codes', 'qa_engineers']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  assert.equal((await f.request(`/api/records/weld_types/${type.id}`, 'PUT', { enabledOnSite: false, enabledSiteId: 'site-north', _version: type._version })).status, 403);
  // A weld-only account in MTO Pilot is refused altogether; in Weld Pilot it works.
  await f.signIn('Weld writer', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' });
  f.usePilot('mto'); assert.equal((await f.request('/api/records/weld_types')).status, 403);
  f.usePilot('weld');
  assert.equal((await f.request(`/api/records/weld_types/${type.id}`, 'PUT', { enabledOnSite: false, enabledSiteId: 'site-river', _version: type._version })).status, 200);
});

test('the full release profile still creates catalog records without the hosted rules', () => {
  const store = new Store(':memory:'); seed(store);
  assert.ok(store.create('weld_types', { name: 'Plain', location: '' }, SYSTEM).id);
  assert.ok(store.create('coatings', { name: 'Plain coating' }, SYSTEM).id);
  assert.ok(store.create('qa_engineers', { name: 'Plain engineer' }, SYSTEM).id);
  assert.ok(store.create('ndt_processes', { name: 'Plain NDT' }, SYSTEM).id);
  store.close();
});
