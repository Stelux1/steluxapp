import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed, seedInspectionSamples } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { activateDefectNorm, setAvailability, siteOfRecord } from '../server/weld-catalogs.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { ATTACHMENT_POSITIONS, CATALOG_SITES, enablementKey, CATALOG_WORDING, DEFECT_CODE_NORMS, DEFECT_GROUPS, DELETE_WORDING_RESOURCES, EDIT_FIELD_OVERRIDES, FORM_ENABLEMENT, HOSTED_TITLES, NEW_RECORDS_OFF, OPTIONS_WORDING, SITE_ENABLED_RESOURCES, WELD_CATALOG_COLUMNS, WELD_CATALOG_RESOURCES, catalogFormLabels, editFields, enabledOnSite, enabledOptions, isLockedRecord, missingRequired, orderedAttachmentNames, pageSizes, pilotResource, qaEngineerCompany, rowDeleteLabel, deleteWording, selectableDefectCodes } from '../shared/weld-catalogs.ts';
import { STANDARD_DEFECT_CODES, isStandardDefectCode, standardDefectCodeId } from '../shared/defect-codes.ts';
import { upgradeWeldCatalogs } from '../server/catalog-upgrade.ts';
import { PROGRESS_DEFAULTS, PROGRESS_PHASES, progressSumsOk } from '../shared/site-settings.ts';
import { dedicatedEditor } from '../client/dialogs.tsx';
import { copyTargets } from '../client/wps.tsx';
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
  assert.deepEqual(SITE_ENABLED_RESOURCES.sort(), ['coatings', 'laydowns', 'material_laydowns', 'ndt_defect_codes', 'ndt_locations', 'ndt_processes', 'pwht_locations', 'pwht_processes', 'qa_engineers', 'service_companies', 'suppliers', 'weld_types', 'materials'].sort());
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

test('the NA defect list is the codes enabled on the main project, whatever their norm; a stored code is always listed', () => {
  const codes = [row('1', { code: '401', norm: 'ISO 6520-1' }), row('2', { code: 'B31-CR', norm: 'ASME B31.3' }), row('3', { code: 'PO', norm: 'Current list' }), row('4', { code: '100', norm: '' }), row('5', { code: '2011', norm: 'ISO 6520-1' }), row('6', { code: '999', norm: 'ISO 6520-1', _archived: true })];
  const rows = { ndt_defect_codes: codes, catalog_sites: [link('ndt_defect_codes', '5', 'north', false)] };
  const codeList = (site: Record<string, unknown> | null, id = 'north') => selectableDefectCodes(rows, site, id).map(c => c.code);
  assert.deepEqual(codeList({ id: 'north', defectNorm: 'ISO 6520-1' }), ['100', '401', 'B31-CR', 'PO'], 'the norm does not narrow the list: enablement decides');
  assert.deepEqual(codeList({ id: 'north', defectNorm: 'No norm selected' }), ['100', '401', 'B31-CR', 'PO'], 'no norm: the enabled list as it stands');
  assert.deepEqual(codeList({ id: 'river', defectNorm: 'ISO 6520-1' }, 'river'), ['100', '401', '2011', 'B31-CR', 'PO'], 'enablement is per site');
  // The Zandbak case: no norm and only the 11 "Current list" codes enabled -> exactly those 11.
  const current = ['GI', 'FMI', 'UW', 'CR', 'CS', 'LI', 'OW', 'LOF', 'PO', 'SI', 'RSC'];
  const every = STANDARD_DEFECT_CODES.map(code => row(`${code[4]}-${code[0]}`, { code: code[0], norm: code[4] }));
  const zandbak = { ndt_defect_codes: every, catalog_sites: every.filter(code => code.norm !== 'Current list').map(code => link('ndt_defect_codes', code.id, 'zandbak', false)) };
  assert.deepEqual(selectableDefectCodes(zandbak, { id: 'zandbak', defectNorm: 'No norm selected' }, 'zandbak').map(c => c.code).sort(), [...current].sort(), 'the 11 enabled codes and nothing else');
  // A disabled code stored on the weld is still listed for that weld (and only for it).
  assert.deepEqual(selectableDefectCodes(rows, null, 'north', '2011').map(c => c.code), ['100', '401', '2011', 'B31-CR', 'PO']);
  assert.ok(!selectableDefectCodes(rows, null, 'north').some(c => c.code === '2011'), 'not listed for another weld');
  assert.ok(!selectableDefectCodes(rows, null, 'north', '999').some(c => c.code === '999'), 'an archived code is not brought back');
  // One entry per code text even where two norms share it (IP of ASME B31.3 and of API 1104).
  assert.equal(selectableDefectCodes(zandbak, null, 'other').filter(c => c.code === 'IP').length, 1);
  assert.deepEqual(DEFECT_CODE_NORMS, ['Current list', 'ISO 6520-1', 'ASME B31.3', 'API 1104']);
});

test('attachment names are ordered before / after the isometric, then by manual order', () => {
  const names = [row('a', { name: 'Release', position: ATTACHMENT_POSITIONS[1], sort: 2 }), row('b', { name: 'Drawing', position: ATTACHMENT_POSITIONS[0], sort: 5 }), row('c', { name: 'Report', position: ATTACHMENT_POSITIONS[1], sort: 1 }), row('d', { name: 'Cover', position: ATTACHMENT_POSITIONS[0], sort: 1 }), row('e', { name: 'Old', position: ATTACHMENT_POSITIONS[0], sort: 0, _archived: true })];
  assert.deepEqual(orderedAttachmentNames(names).map(n => n.name), ['Cover', 'Drawing', 'Report', 'Release']);
});

test('the hosted profile requires the reference fields; the shared resource keeps them optional', () => {
  assert.deepEqual(missingRequired('weld_types', { name: 'Butt' }), { location: 'Shop/Field is required.', abbreviation: 'Abbreviation is required.' });
  assert.deepEqual(missingRequired('weld_types', { name: 'Butt', location: 'Shop', abbreviation: 'BW' }), {});
  assert.deepEqual(missingRequired('weld_types', { description: 'x' }, row('w', { location: 'Shop', abbreviation: 'BW', jointType: 'BW' })), {}, 'stored values count on an edit');
  assert.deepEqual(missingRequired('weld_types', { abbreviation: ' ' }, row('w', { location: 'Shop', abbreviation: 'BW', jointType: 'BW' })), { abbreviation: 'Abbreviation is required.' });
  assert.deepEqual(Object.keys(missingRequired('qa_engineers', { name: 'Ana' })), ['company']);
  assert.deepEqual(Object.keys(missingRequired('companies', { name: 'Co' })), ['address']);
  for (const key of ['weld_types', 'coatings', 'ndt_processes', 'pwht_processes', 'qa_engineers', 'companies']) {
    const resource = projectResource(hosted, RESOURCE_MAP[key]);
    assert.ok(resource.fields.filter(f => ['location', 'abbreviation', 'description', 'company', 'address'].includes(f.name) && missingRequired(key, {})[f.name]).every(f => f.required), key);
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
  assert.deepEqual(labels('ndt_processes'), ['NDT process', 'Description', 'Method', 'Welder Performance Report (WPR)']);
  assert.deepEqual(labels('ndt_defect_codes'), ['Code', 'English', 'Dutch', 'Group', 'Norm', 'ISO 6520-1']);
  assert.deepEqual(labels('ndt_locations'), ['NDT location']);
  assert.deepEqual(labels('pwht_processes'), ['PWHT process Nr.', 'Description']);
  assert.deepEqual(labels('pwht_locations'), ['PWHT location']);
  assert.deepEqual(labels('qa_engineers'), ['Name', 'Company', 'Phone', 'Email address', 'Stamp']);
  assert.deepEqual(labels('companies'), ['Name', 'Address', 'Phone', 'Email address']);
  assert.deepEqual(labels('attachment_names').slice(0, 3), ['Name', 'ISO Book', 'Hydrotest']);
  assert.deepEqual(resource('qa_engineers').fields.filter(f => !f.hidden).slice(0, 8).map(f => f.label), ['Name', 'Company', 'Phone', 'Email address', 'Stamp', 'Level', 'Certificate 1', 'Certificate 2']);
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
  assert.equal((await f.request('/api/records/qa_engineers', 'POST', { name: 'Ana Ruiz', company: 'Site Lillo', stamp: 'AR-01', certificate1: 'ISO 9712 MT-2' })).status, 201);
  assert.equal((await f.request('/api/records/companies', 'POST', { name: 'Harbour Welding BV' })).status, 422);
  assert.equal((await f.request('/api/records/companies', 'POST', { name: 'Harbour Welding BV', address: '5 Dockside', phone: '+31 10 555 0199' })).status, 201);
  response = await f.request('/api/records/ndt_defect_codes', 'POST', { code: 'X1' });
  assert.equal(response.status, 422); assert.deepEqual(Object.keys((await body(response)).fields!), ['english']);
  assert.equal((await f.request('/api/records/ndt_defect_codes', 'POST', { code: '9012', english: 'Uniform porosity', dutch: 'Gelijkmatige porositeit', group: 'Cavity', norm: 'ISO 6520-1', isoRef: '2012' })).status, 201);
  assert.equal((await f.request('/api/records/ndt_defect_codes', 'POST', { code: '9012', english: 'Duplicate', group: 'Cavity', norm: 'ISO 6520-1' })).status, 409);
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
  assert.deepEqual(links.map(l => [l.resourceKey, l.siteId, l.enabled]).sort(), [['coatings', 'site-north', false], ['coatings', 'site-river', false]], 'a new coating is off on every main project unless its box is ticked');
  assert.equal(coating.enabledOnSite, undefined, 'the instruction is not stored on the record');
  response = await f.request(`/api/records/coatings/${coating.id}`, 'PUT', { enabledOnSite: true, enabledSiteId: 'site-river', _version: coating._version });
  assert.equal(response.status, 200);
  links = (await f.rows('catalog_sites')).filter(l => l.recordId === coating.id); assert.deepEqual(links.map(l => [l.siteId, l.enabled]).sort(), [['site-north', false], ['site-river', true]]);
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
  let response = await create('iso-5', 'weld-type-11', 'W910'); // Riverside (iso-4 of the same site is Prefab complete in the sample, so its shop welds are locked)
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

test('copy isometrics keeps weld references to catalog records since switched off on the site; new references are still refused', () => {
  const store = new Store(':memory:'); seed(store);
  const originals = store.list('welds').filter(weld => weld.isoId === 'iso-9');
  const types = [...new Set(originals.map(weld => String(weld.typeId || '')).filter(Boolean))];
  assert.ok(types.length, 'the sample isometric has typed welds');
  for (const id of types) setAvailability(store, 'weld_types', id, 'site-north', false, SYSTEM);
  runAction(store, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling', copyWelds: true }, SYSTEM);
  const copy = store.list('isometrics').find(iso => iso.projectId === 'project-cooling' && iso.isoNo === store.get('isometrics', 'iso-9').isoNo)!;
  const copied = store.list('welds').filter(weld => weld.isoId === copy.id);
  assert.equal(copied.length, originals.length);
  for (const original of originals) assert.equal(copied.find(weld => weld.weldNo === original.weldNo)?.typeId || '', original.typeId || '', `${original.weldNo} keeps its weld type`);
  assert.throws(() => store.create('welds', { weldNo: 'W950', isoId: copy.id, typeId: types[0] }, SYSTEM), /highlighted/, 'a newly chosen switched-off weld type is still refused');
  store.close();
});

test('the NDT sample records only defect codes the weld\'s main project may select', () => {
  const store = new Store(':memory:'); seed(store); seedInspectionSamples(store);
  const rows = { ndt_defect_codes: store.list('ndt_defect_codes'), [CATALOG_SITES]: store.list(CATALOG_SITES) };
  const recorded = store.list('inspection_results').filter(result => result.defectType);
  assert.ok(recorded.length >= 2, 'the sample has rejected results with a defect type');
  for (const result of recorded) {
    const siteId = siteOfRecord(store, 'inspection_results', result), site = store.get('sites', siteId);
    assert.ok(selectableDefectCodes(rows, site, siteId).some(code => code.code === result.defectType), `${String(result.defectType)} is selectable on ${siteId}`);
  }
  store.close();
});

test('mto-logistics-016 / -017 / -018: service companies, laydown areas and laydown materials have the reference headings, no enablement box in the form, and Activate / Deactivate in Options', async t => {
  for (const key of ['service_companies', 'laydowns', 'material_laydowns']) { assert.ok(enablementKey(key), key); assert.equal(Object.hasOwn(FORM_ENABLEMENT, key), false, `${key}: no Enable box in the Add / Edit form`); }
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual([...hosted.resources.service_companies].sort(), ['address', 'email', 'name', 'phone']);
  assert.deepEqual(hosted.resources.laydowns, ['name']); assert.deepEqual(hosted.resources.material_laydowns, ['name']);
  const f = await hostedFixture(t); await f.setup(); f.usePilot('mto');
  const material = (await body(await f.request('/api/records/material_laydowns', 'POST', { name: 'Plava Hala' }))).record!;
  for (const [enabled, expected] of [[false, false], [true, true]] as const) {
    const response = await f.request('/api/bulk/material_laydowns', 'POST', { ids: [material.id], versions: { [material.id]: material._version }, changes: { enabledOnSite: enabled, enabledSiteId: 'site-north' } });
    assert.equal(response.status, 200, 'Activate / Deactivate selected works on laydown materials');
    assert.equal(enabledOnSite('material_laydowns', material, 'site-north', { catalog_sites: await f.rows('catalog_sites') }), expected);
    const fresh = (await f.rows('material_laydowns')).find(row => row.id === material.id)!; material._version = fresh._version;
  }
});

test('hosted: suppliers, service companies and laydowns (delivered by the MTO flows) get "Enabled on this site" end to end', async t => {
  const f = await hostedFixture(t); await f.setup();
  f.usePilot('mto');
  // Form checkbox: a new service company switched off on the north site at creation.
  let response = await f.request('/api/records/service_companies', 'POST', { name: 'Harbour Coating BV', address: '7 Quay Road', enabledOnSite: false, enabledSiteId: 'site-north' });
  assert.equal(response.status, 201); const company = (await body(response)).record!;
  // Options menu: Deactivate on this site for checked suppliers and laydowns.
  const north = f.store.list('spools').find(spool => f.store.get('isometrics', String(spool.isoId)).projectId === 'project-cooling')!;
  const river = f.store.list('spools').find(spool => f.store.get('isometrics', String(spool.isoId)).projectId === 'project-steam')!;
  // A laydown neither sample spool already lies on (an unchanged reference is never judged).
  const supplier = (await f.rows('suppliers'))[0], laydown = (await f.rows('laydowns')).find(row => row.id !== north.laydownId && row.id !== river.laydownId)!;
  assert.ok(supplier && laydown, 'sample suppliers and laydowns exist');
  for (const [key, row] of [['suppliers', supplier], ['laydowns', laydown]] as const) {
    response = await f.request(`/api/bulk/${key}`, 'POST', { ids: [row.id], versions: { [row.id]: row._version }, changes: { enabledOnSite: false, enabledSiteId: 'site-north' } });
    assert.equal(response.status, 200, key);
  }
  const links = await f.rows('catalog_sites');
  for (const [key, id] of [['service_companies', company.id], ['suppliers', supplier.id], ['laydowns', laydown.id]]) {
    assert.equal(enabledOnSite(key, { id }, 'site-north', { catalog_sites: links }), false, key);
    assert.equal(enabledOnSite(key, { id }, 'site-river', { catalog_sites: links }), true, `${key} stays enabled on the other site`);
  }
  // Ref selects (FieldInput and the take-in dialog) offer only enabled records, plus the stored value.
  const rows = { catalog_sites: links };
  assert.ok(!enabledOptions('suppliers', [supplier], 'site-north', rows).length);
  assert.equal(enabledOptions('suppliers', [supplier], 'site-north', rows, supplier.id).length, 1);
  // Server refusal: a new reference from a record of the north site is refused; the river site still accepts it.
  for (const [field, id] of [['serviceCompanyId', company.id], ['laydownId', laydown.id]]) {
    assert.throws(() => f.store.update('spools', north.id, { [field]: id }, f.store.get('spools', north.id)._version), (error: { fields?: Record<string, string> }) => /not enabled/.test(error.fields?.[field] || ''), field);
    assert.equal(f.store.update('spools', river.id, { [field]: id }, f.store.get('spools', river.id)._version)[field], id, field);
  }
  assert.throws(() => f.store.create('orders', { number: 'PO-TEST-1', projectId: 'project-cooling', supplierId: supplier.id, date: '2026-11-02' }), (error: { fields?: Record<string, string> }) => /not enabled/.test(error.fields?.supplierId || ''));
});

// ---------------------------------------------------------------------------------------------------------
// Flow C1: generic behaviour of the catalog pages and the NDT data catalogs
// ---------------------------------------------------------------------------------------------------------
const catalog = (key: string) => projectResource(hosted, RESOURCE_MAP[key]);
const visible = (key: string) => catalog(key).fields.filter(f => !f.hidden);

test('catalog pages carry the reference titles, add buttons and dialog headings (hosted only)', () => {
  const expected: Record<string, [string, string, string, string]> = {
    weld_processes: ['Weld process', 'Add welding process', 'Edit welding process', 'Delete welding process'],
    weld_types: ['Weld type', 'Add weld type', 'Edit weld type', 'Delete weld type'],
    coatings: ['Coating', 'Add coating', 'Edit coating', 'Delete coating'],
    // The groups page reuses the process wording for its add button and dialog (weld__ndt__process-groups.txt:47,187,193).
    ndt_groups: ['NDT process groups', 'Add NDT process', 'Edit NDT process group', 'Delete NDT process group'],
    ndt_processes: ['NDT process', 'Add NDT process', 'Edit NDT process', 'Delete NDT process'],
    ndt_defect_codes: ['Defect codes', 'Add', 'Edit', 'Delete'],
    ndt_locations: ['NDT locations', 'Add NDT location', 'Edit NDT location', 'Delete NDT location'],
    pwht_processes: ['PWHT process', 'Add PWHT process', 'Edit PWHT process', 'Delete PWHT process'],
    pwht_locations: ['PWHT locations', 'Add PWHT location', 'Edit PWHT location', 'Delete PWHT location'],
    qa_engineers: ['QA/QC engineers', 'Add QA/QC engineer', 'Edit QA/QC engineer', 'Delete QA/QC engineer'],
    roles: ['Roles', 'Add Role', 'Edit role', 'Delete role'],
    // MTO Pilot -> Logistic (mto-logistics-016, -017, -018, -022).
    service_companies: ['Service companies', 'Add company', 'Edit company', 'Delete company'],
    laydowns: ['Laydown areas', 'Add laydown', 'Edit laydown', 'Delete laydown'],
    material_laydowns: ['Laydown areas - Materials', 'Add laydown', 'Edit laydown material', 'Delete laydown'],
  };
  for (const [key, [title, add, edit, remove]] of Object.entries(expected)) {
    const resource = catalog(key);
    assert.deepEqual([resource.title, resource.wording?.add, resource.wording?.edit, resource.wording?.remove], [title, add, edit, remove], key);
    assert.equal(deleteWording(key, resource.singular).title, remove, key);
    assert.equal(projectResource(undefined, RESOURCE_MAP[key]).wording, undefined, `${key}: the full profile keeps its own wording`);
  }
  assert.deepEqual(Object.keys(CATALOG_WORDING).sort(), Object.keys(expected).sort());
  assert.equal(deleteWording('ndt_groups', 'NDT process group').title, 'Delete NDT process group');
  assert.equal(deleteWording('ndt_locations', 'NDT location').text, 'Are you sure?');
});

test('the row action of a hosted catalog reads Delete, the record is archived underneath and can be restored', async t => {
  assert.equal(rowDeleteLabel('ndt_locations', false, true), 'Delete');
  assert.equal(rowDeleteLabel('ndt_locations', true, true), 'Restore record');
  assert.equal(rowDeleteLabel('ndt_locations', false, false), 'Archive record', 'other profiles keep the archive wording');
  assert.equal(rowDeleteLabel('welds', false, true), 'Archive record', 'pages outside the catalogs are untouched');
  for (const key of ['ndt_groups', 'ndt_processes', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'qa_engineers', 'weld_processes', 'weld_types', 'coatings']) assert.ok(DELETE_WORDING_RESOURCES.includes(key), key);
  const f = await hostedFixture(t); await f.setup();
  const created = (await body(await f.request('/api/records/ndt_locations', 'POST', { name: 'Gate lab' }))).record!;
  const response = await f.request(`/api/records/ndt_locations/${created.id}/archive`, 'POST', { _version: created._version });
  assert.equal(response.status, 200);
  assert.equal(f.store.get('ndt_locations', created.id, true)._archived, true, 'archived, not erased');
  assert.ok(!(await f.rows('ndt_locations')).some(row => row.id === created.id && !row._archived), 'gone from the active list');
});

test('catalog lists offer the reference page sizes: 5/20/50/100/500, and 25/50/100/500 for welding wire and certifications', () => {
  assert.deepEqual(pageSizes('diameters', true), { sizes: [5, 20, 50, 100, 500], initial: 20 });
  assert.deepEqual(pageSizes('ndt_defect_codes', true), { sizes: [5, 20, 50, 100, 500], initial: 20 });
  assert.deepEqual(pageSizes('welding_wires', true), { sizes: [25, 50, 100, 500], initial: 25 });
  assert.deepEqual(pageSizes('certifications', true), { sizes: [25, 50, 100, 500], initial: 25 });
  assert.deepEqual(pageSizes('diameters', false), { sizes: [20, 50, 100], initial: 20 }, 'other profiles keep their sizes');
  assert.deepEqual(pageSizes('welds', true), { sizes: [20, 50, 100], initial: 20 }, 'lists outside the catalogs keep their sizes');
});

test('the Options menu asks for a Confirm before anything is written', () => {
  assert.equal(OPTIONS_WORDING.activate.item, 'Activate selected');
  assert.equal(OPTIONS_WORDING.deactivate.item, 'Deactivate selected');
  assert.equal(OPTIONS_WORDING.activate.text, 'By clicking ‘Confirm,’ you will activate the selected options.');
  assert.equal(OPTIONS_WORDING.deactivate.text, 'By clicking ‘Confirm,’ you will deactivate the selected options.');
  assert.deepEqual([OPTIONS_WORDING.confirm, OPTIONS_WORDING.cancel], ['Confirm', 'Cancel']);
  // The menu component sends the bulk request only from the Confirm button (client/weld-catalogs.tsx): the items open the dialog.
  const source = readFileSync(new URL('../client/weld-catalogs.tsx', import.meta.url), 'utf8');
  assert.ok(!/onClick=\{\(\) => void apply\((true|false)\)\}/.test(source), 'no menu item applies at once');
  assert.match(source, /onClick=\{\(\) => void apply\(confirming\)\}/);
});

test('the Add form carries "Enable on this site" on NDT process, QA/QC engineers and Coating only, unticked', () => {
  assert.deepEqual(Object.keys(FORM_ENABLEMENT).filter(key => FORM_ENABLEMENT[key] === false).sort(), ['coatings', 'ndt_processes', 'qa_engineers']);
  for (const key of ['suppliers', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'ndt_defect_codes', 'weld_types', 'weld_processes']) assert.equal(Object.hasOwn(FORM_ENABLEMENT, key), false, key);
  assert.ok(NEW_RECORDS_OFF.includes('ndt_locations') && NEW_RECORDS_OFF.includes('ndt_processes') && !NEW_RECORDS_OFF.includes('weld_types'));
});

test('hosted: a catalog record a user adds is off on every main project unless the box is ticked; the sample data keeps "enabled"', async t => {
  const f = await hostedFixture(t); await f.setup();
  const links = async (id: string) => (await f.rows('catalog_sites')).filter(l => l.recordId === id).map(l => [l.siteId, l.enabled]).sort();
  const location = (await body(await f.request('/api/records/ndt_locations', 'POST', { name: 'Gate lab' }))).record!;
  assert.deepEqual(await links(location.id), [['site-north', false], ['site-river', false]]);
  const rows = { catalog_sites: await f.rows('catalog_sites') };
  assert.equal(enabledOnSite('ndt_locations', location, 'site-north', rows), false); assert.equal(enabledOnSite('ndt_locations', location, 'site-river', rows), false);
  const ticked = (await body(await f.request('/api/records/ndt_processes', 'POST', { name: 'ECT', description: 'Eddy current', enabledOnSite: true, enabledSiteId: 'site-north' }))).record!;
  assert.deepEqual(await links(ticked.id), [['site-river', false]], 'enabled needs no row on the current site; the other main project is off');
  const unticked = (await body(await f.request('/api/records/ndt_processes', 'POST', { name: 'ECT-2', description: 'Eddy current 2', enabledOnSite: false, enabledSiteId: 'site-north' }))).record!;
  assert.deepEqual(await links(unticked.id), [['site-north', false], ['site-river', false]]);
  const refreshed = { catalog_sites: await f.rows('catalog_sites') };
  assert.equal(enabledOnSite('ndt_processes', ticked, 'site-north', refreshed), true); assert.equal(enabledOnSite('ndt_processes', ticked, 'site-river', refreshed), false);
  // A weld type has no box and no switch-off: it stays enabled everywhere, as its list shows every type.
  const type = (await body(await f.request('/api/records/weld_types', 'POST', { name: 'Test weld', location: 'Shop', abbreviation: 'TW' }))).record!;
  assert.deepEqual(await links(type.id), []);
  // Existing records keep their state; records written by the system (sample data, demo copy) keep "enabled everywhere".
  assert.deepEqual(await links('ndt-shop'), []);
  assert.equal(f.store.list(CATALOG_SITES).filter(l => l.recordId === 'ndt-lab').length, 1);
  const system = f.store.create('ndt_locations', { name: 'Seeded later' }, SYSTEM);
  assert.deepEqual(f.store.list(CATALOG_SITES).filter(l => l.recordId === system.id), []);
  // Switched on later through Options (Activate selected).
  const current = (await f.rows('ndt_locations')).find(r => r.id === location.id)!;
  assert.equal((await f.request('/api/bulk/ndt_locations', 'POST', { ids: [location.id], versions: { [location.id]: current._version }, changes: { enabledOnSite: true, enabledSiteId: 'site-north' } })).status, 200);
  assert.deepEqual(await links(location.id), [['site-north', true], ['site-river', false]]);
});

test('PWHT selects offer every PWHT record whatever its availability; NDT selects and server checks still follow it', () => {
  const options = ['a', 'b'].map(id => row(id));
  const rows = { catalog_sites: [link('pwht_locations', 'a', 'north', false), link('pwht_processes', 'a', 'north', false), link('ndt_locations', 'a', 'north', false)] };
  assert.deepEqual(enabledOptions('pwht_locations', options, 'north', rows).map(o => o.id), ['a', 'b']);
  assert.deepEqual(enabledOptions('pwht_processes', options, 'north', rows).map(o => o.id), ['a', 'b']);
  assert.deepEqual(enabledOptions('ndt_locations', options, 'north', rows).map(o => o.id), ['b']);
  assert.deepEqual(enabledOptions('ndt_locations', options, 'north', { catalog_sites: [] }).map(o => o.id), ['a', 'b']);
  const store = new Store(':memory:'); seed(store);
  setAvailability(store, 'pwht_locations', 'pwht-shop', 'site-north', false, SYSTEM); setAvailability(store, 'pwht_processes', 'pwht-1', 'site-north', false, SYSTEM);
  const request = (extra: Record<string, unknown>) => store.create('inspection_requests', { number: `T-${Math.random()}`, weldId: 'weld-1', type: 'PWHT', date: '2026-10-20', status: 'Open', ...extra }, SYSTEM);
  assert.ok(request({ pwhtLocationId: 'pwht-shop', pwhtProcessId: 'pwht-1' }).id, 'a switched-off PWHT location and process may be used');
  assert.throws(() => request({ locationId: 'ndt-lab' }), /highlighted/, 'a switched-off NDT location is still refused');
  store.close();
});

test('Group and Method: the NDT process form says Method and Welder Performance Report (WPR), without hints; the column stays Group', () => {
  const process = catalog('ndt_processes');
  const group = process.fields.find(f => f.name === 'groupId')!, wpr = process.fields.find(f => f.name === 'wpr')!;
  assert.deepEqual([group.label, group.columnLabel, group.hint], ['Method', 'Group', undefined]);
  assert.deepEqual([wpr.label, wpr.columnLabel, wpr.hint], ['Welder Performance Report (WPR)', 'WPR', undefined]);
  assert.deepEqual(process.fields.map(f => f.name), ['name', 'description', 'groupId', 'wpr']);
  assert.equal(RESOURCE_MAP.ndt_processes.fields.find(f => f.name === 'groupId')!.label, 'Group', 'the full profile keeps its form');
});

test('Defect codes: the reference groups with Crack first, and the NDT / PWHT location columns read NDT location / PWHT location', () => {
  assert.deepEqual(DEFECT_GROUPS, ['Crack', 'Cavity', 'Inclusion', 'Fusion', 'Shape', 'Miscellaneous']);
  const group = catalog('ndt_defect_codes').fields.find(f => f.name === 'group')!;
  assert.equal(group.default, 'Crack'); assert.deepEqual(group.options, DEFECT_GROUPS);
  assert.equal(catalog('ndt_defect_codes').fields.find(f => f.name === 'norm')!.default, 'Current list');
  assert.equal(group.legacy?.['Lack of fusion'], 'Fusion'); assert.equal(group.legacy?.['Imperfect shape'], 'Shape');
  assert.equal(catalog('ndt_locations').fields.find(f => f.name === 'name')!.label, 'NDT location');
  assert.equal(catalog('pwht_locations').fields.find(f => f.name === 'name')!.label, 'PWHT location');
  assert.equal(catalog('ndt_defect_codes').fields.find(f => f.name === 'system')!.hidden, true, 'the lock flag is never a form field');
});

test('Weld process, Weld type and Coating forms carry the reference fields only', () => {
  assert.deepEqual(visible('weld_processes').map(f => f.name), ['name']);
  assert.deepEqual(visible('weld_types').map(f => f.name), ['name', 'location', 'abbreviation', 'jointType', 'grooveType']);
  assert.equal(visible('weld_types').find(f => f.name === 'location')!.default, 'Shop');
  assert.deepEqual(visible('coatings').map(f => f.name), ['name', 'abbreviation']);
  assert.deepEqual(catalog('weld_types').columns, ['name', 'location', 'abbreviation', 'jointType', 'grooveType']);
});

test('QA/QC engineers: Company is required free text in the hosted profile', async t => {
  const company = catalog('qa_engineers').fields.find(f => f.name === 'company')!;
  assert.deepEqual([company.label, company.type, company.required, company.hidden], ['Company', 'text', true, false]);
  assert.equal(catalog('qa_engineers').fields.find(f => f.name === 'companyId')!.hidden, true);
  assert.deepEqual(catalog('qa_engineers').columns, ['name', 'company', 'phone', 'email', 'stamp']);
  const f = await hostedFixture(t); await f.setup();
  let response = await f.request('/api/records/qa_engineers', 'POST', { name: 'Ana Ruiz' });
  assert.equal(response.status, 422); assert.equal((await body(response)).fields!.company, 'Company is required.');
  response = await f.request('/api/records/qa_engineers', 'POST', { name: 'Ana Ruiz', company: 'Site Lillo' });
  assert.equal(response.status, 201); assert.equal((await body(response)).record!.company, 'Site Lillo');
});

test('the standard defect codes: ISO 6520-1, ASME B31.3 and API 1104, locked, and none of the invented ones', () => {
  const norm = (name: string) => STANDARD_DEFECT_CODES.filter(code => code[4] === name).map(code => code[0]);
  // All 98 rows of the reference list: 63 + 9 + 15 + the 11 "Current list" codes (weld__ndt__defect-codes.txt).
  assert.equal(STANDARD_DEFECT_CODES.length, 98);
  assert.deepEqual(['ISO 6520-1', 'ASME B31.3', 'API 1104', 'Current list'].map(name => norm(name).length), [63, 9, 15, 11]);
  assert.deepEqual(norm('ISO 6520-1').slice(0, 26), ['100', '101', '102', '103', '104', '105', '106', '201', '202', '301', '302', '303', '304', '401', '402', '501', '502', '503', '504', '505', '506', '507', '508', '509', '510', '511']);
  assert.deepEqual(norm('ASME B31.3').slice(0, 7), ['CRACK', 'LOF', 'IP', 'ROUND', 'ELONG', 'UC', 'REINF']);
  assert.deepEqual(norm('API 1104').slice(0, 7), ['C', 'IP', 'IPD', 'ICP', 'IF', 'BT', 'P']);
  assert.deepEqual(norm('Current list'), ['GI', 'FMI', 'UW', 'CR', 'CS', 'LI', 'OW', 'LOF', 'PO', 'SI', 'RSC']);
  const one = (code: string, normName: string) => STANDARD_DEFECT_CODES.find(c => c[0] === code && c[4] === normName)!;
  assert.deepEqual(one('5213', 'ISO 6520-1'), ['5213', 'Insufficient throat thickness', 'Te kleine a-hoogte', 'Shape', 'ISO 6520-1', '5213']);
  assert.deepEqual(one('RSC', 'Current list'), ['RSC', 'Root surface concavity', 'Wortelinkeping', '', 'Current list', ''], 'the reference shows - as group and ISO reference of the Current list codes');
  assert.equal(new Set(STANDARD_DEFECT_CODES.map(code => standardDefectCodeId(code[0], code[4]))).size, STANDARD_DEFECT_CODES.length, 'ids are unique');
  assert.ok(STANDARD_DEFECT_CODES.every(code => (DEFECT_GROUPS.includes(code[3]) || (code[3] === '' && code[4] === 'Current list')) && code[2] && code[1]), 'every code has its texts and a known group');
  const dutch = (code: string, normName: string) => STANDARD_DEFECT_CODES.find(c => c[0] === code && c[4] === normName)![2];
  assert.deepEqual([dutch('102', 'ISO 6520-1'), dutch('401', 'ISO 6520-1'), dutch('402', 'ISO 6520-1'), dutch('501', 'ISO 6520-1'), dutch('502', 'ISO 6520-1'), dutch('507', 'ISO 6520-1')], ['Dwarscheur', 'Bindingsfout', 'Onvolledige doorlassing', 'Inkarteling', 'Te hoge sluitlaag', 'Lineaire hoog-laag']);
  const store = new Store(':memory:'); seed(store);
  const codes = store.list('ndt_defect_codes');
  assert.equal(codes.length, STANDARD_DEFECT_CODES.length); assert.ok(codes.every(code => code.system === true));
  for (const invented of ['B31-CR', 'B31-IP', 'B31-CV', 'SL', 'LF']) assert.ok(!codes.some(code => code.code === invented), invented);
  assert.equal(codes.filter(code => code.code === 'IP').length, 2); assert.deepEqual(codes.filter(code => code.code === 'IP').map(code => code.norm).sort(), ['API 1104', 'ASME B31.3']);
  assert.equal(isLockedRecord('ndt_defect_codes', codes[0], true), true); assert.equal(isLockedRecord('ndt_defect_codes', codes[0], false), false);
  assert.equal(isLockedRecord('ndt_defect_codes', row('x', { system: false }), true), false);
  store.close();
});

test('hosted: a standard defect code cannot be edited or deleted (403), switching it per site still works, a client code stays editable', async t => {
  const f = await hostedFixture(t); await f.setup();
  const standard = (await f.rows('ndt_defect_codes')).find(code => code.code === '401')!;
  let response = await f.request(`/api/records/ndt_defect_codes/${standard.id}`, 'PUT', { dutch: 'Anders', _version: standard._version });
  assert.equal(response.status, 403); assert.equal(f.store.get('ndt_defect_codes', standard.id).dutch, 'Bindingsfout');
  response = await f.request(`/api/records/ndt_defect_codes/${standard.id}/archive`, 'POST', { _version: standard._version });
  assert.equal(response.status, 403); assert.equal(f.store.get('ndt_defect_codes', standard.id).code, '401', 'still active');
  response = await f.request('/api/bulk/ndt_defect_codes', 'POST', { ids: [standard.id], versions: { [standard.id]: standard._version }, changes: { enabledOnSite: false, enabledSiteId: 'site-river' } });
  assert.equal(response.status, 200, 'activation per site stays possible');
  response = await f.request('/api/bulk/ndt_defect_codes', 'POST', { ids: [standard.id], versions: { [standard.id]: f.store.get('ndt_defect_codes', standard.id)._version }, changes: { system: false } });
  assert.ok([403, 404].includes(response.status), 'the flag is not bulk-editable');
  // A client's own code: editable and deletable, and a request can never make it (or unmake a standard code) a standard code.
  response = await f.request('/api/records/ndt_defect_codes', 'POST', { code: 'X-1', english: 'Client defect', group: 'Crack', norm: 'Current list', system: true });
  assert.equal(response.status, 201); const own = (await body(response)).record!; assert.equal(own.system, false);
  response = await f.request(`/api/records/ndt_defect_codes/${own.id}`, 'PUT', { english: 'Client defect 2', _version: own._version });
  assert.equal(response.status, 200);
  const edited = f.store.get('ndt_defect_codes', own.id);
  assert.equal((await f.request(`/api/records/ndt_defect_codes/${own.id}/archive`, 'POST', { _version: edited._version })).status, 200);
});

test('activating a norm switches every code of that norm on for the main project and leaves the others as they were', () => {
  const store = new Store(':memory:'); seed(store);
  const api = store.list('ndt_defect_codes').filter(code => code.norm === 'API 1104'), asme = store.list('ndt_defect_codes').filter(code => code.norm === 'ASME B31.3');
  for (const code of [...api, ...asme]) setAvailability(store, 'ndt_defect_codes', code.id, 'site-river', false, SYSTEM);
  assert.equal(activateDefectNorm(store, 'site-river', 'API 1104', SYSTEM), api.length);
  const rows = { catalog_sites: store.list(CATALOG_SITES) };
  assert.ok(api.every(code => enabledOnSite('ndt_defect_codes', code, 'site-river', rows)));
  assert.ok(asme.every(code => !enabledOnSite('ndt_defect_codes', code, 'site-river', rows)), 'other norms unchanged');
  assert.ok(api.every(code => enabledOnSite('ndt_defect_codes', code, 'site-north', rows)), 'other sites unchanged');
  store.close();
});

test('saving a new Defect norm on a project site turns that norm\'s codes on for the site', () => {
  const store = new Store(':memory:'); seed(store); store.hostedRules = true;
  const iso = store.list('ndt_defect_codes').filter(code => code.norm === 'ISO 6520-1');
  for (const code of iso) setAvailability(store, 'ndt_defect_codes', code.id, 'site-river', false, SYSTEM);
  const river = store.get('sites', 'site-river');
  store.update('sites', river.id, { defectNorm: 'ISO 6520-1' }, river._version, SYSTEM);
  const rows = { catalog_sites: store.list(CATALOG_SITES) };
  assert.ok(iso.every(code => enabledOnSite('ndt_defect_codes', code, 'site-river', rows)));
  // Another save with the same norm changes nothing; a name change alone does not touch availability.
  for (const code of iso.slice(0, 2)) setAvailability(store, 'ndt_defect_codes', code.id, 'site-river', false, SYSTEM);
  const saved = store.get('sites', 'site-river'); store.update('sites', saved.id, { phone: '+32 3 555 0100' }, saved._version, SYSTEM);
  assert.equal(enabledOnSite('ndt_defect_codes', iso[0], 'site-river', { catalog_sites: store.list(CATALOG_SITES) }), false);
  store.close();
});

test('the sample weld types carry the reference values: Shop / Field abbreviations, joint and groove types', () => {
  const store = new Store(':memory:'); seed(store);
  const byName = (name: string) => store.list('weld_types').find(type => type.name === name)!;
  const pick = (type: Row) => [type.location, type.abbreviation, type.jointType, type.grooveType];
  assert.deepEqual(pick(byName('Butt Weld - Shop')), ['Shop', 'WS', 'BW', 'L']);
  assert.deepEqual(pick(byName('Butt Weld - Field')), ['Field', 'FW', 'BW', 'V']);
  assert.deepEqual(pick(byName('HOOK-UP')), ['Field', 'YTI', 'BW', '-']);
  assert.deepEqual(pick(byName('Branch welds - Field')), ['Field', 'FW', 'BR', '1']);
  assert.equal(store.list('weld_types').length, 17);
  assert.ok(store.list('weld_types').every(type => ['WS', 'FW', 'YTI'].includes(String(type.abbreviation))));
  assert.deepEqual(new Set(store.list('weld_types').map(type => type.jointType)), new Set(['BR', 'BW', 'FL', 'LG', 'RP', 'RP-GW', 'SW', 'VJ']));
  assert.deepEqual(store.list('weld_processes').map(process => process.name).sort(), ['111', '135', '136', '141'], 'bare names, no suffix');
  assert.ok(store.list('weld_processes').every(process => /^[0-9A-Z/-]+$/.test(String(process.name))));
  store.close();
});

test('the upgrade step only adds the missing standard defect codes; a matching old code and an engineer stay as stored, once', () => {
  const store = new Store(':memory:'); seed(store);
  // An older workspace: the invented sample codes, no lock, an engineer with a company record only.
  store.db.exec('DELETE FROM ndt_defect_codes');
  const old = [['401', 'Lack of fusion', 'Bindfout', 'Lack of fusion', 'ISO 6520-1'], ['B31-CR', 'Cracks', 'Scheuren', 'Crack', 'ASME B31.3'], ['PO', 'Porosity', 'Porositeit', 'Cavity', 'Current list']];
  for (const [code, english, dutch, group, norm] of old) store.create('ndt_defect_codes', { code, english, dutch, group, norm, system: false }, SYSTEM);
  const engineer = store.get('qa_engineers', 'qa-1'); store.update('qa_engineers', engineer.id, { company: '' }, engineer._version, SYSTEM);
  const before = ['ndt_defect_codes', 'qa_engineers'].map(key => store.list(key, true));
  assert.deepEqual(upgradeWeldCatalogs(store, { dryRun: true }), { defectCodesAdded: STANDARD_DEFECT_CODES.length - 2 }, 'the dry run counts what it would add');
  assert.equal(store.list('ndt_defect_codes').length, 3, 'and adds nothing');
  assert.deepEqual(upgradeWeldCatalogs(store), { defectCodesAdded: STANDARD_DEFECT_CODES.length - 2 });
  const active = store.list('ndt_defect_codes');
  assert.equal(active.length, STANDARD_DEFECT_CODES.length + 1, 'the old code that is not standard stays; 401 and PO are standard codes the client already holds');
  for (const row of before.flat()) assert.deepEqual(store.get(row.code !== undefined ? 'ndt_defect_codes' : 'qa_engineers', row.id, true), row, 'every stored record stays byte for byte');
  const fusion = active.find(code => code.code === '401' && code.norm === 'ISO 6520-1')!;
  assert.deepEqual([fusion.system, fusion.dutch, fusion.group], [false, 'Bindfout', 'Lack of fusion'], 'the client\'s own texts stay');
  assert.equal(isStandardDefectCode(fusion), true, 'and it counts as the standard code'); assert.equal(isLockedRecord('ndt_defect_codes', fusion, true), true);
  assert.ok(!active.some(code => code.id === standardDefectCodeId('401', 'ISO 6520-1')), 'no second 401 of ISO 6520-1');
  assert.ok(active.some(code => code.code === 'B31-CR') && active.filter(code => code.code === 'PO').length === 1, 'nothing is removed, no second PO');
  assert.equal(active.filter(code => code.code === 'IP').length, 2);
  assert.equal(store.get('qa_engineers', 'qa-1').company, '', 'the engineer is not written');
  const second = upgradeWeldCatalogs(store);
  assert.deepEqual(second, { defectCodesAdded: 0 }, 'a rerun adds nothing');
  assert.deepEqual(upgradeWeldCatalogs(store, { dryRun: true }), second);
  store.close();
});

test('a defect code counts as standard by its stored flag or by code + norm; other codes do not', () => {
  assert.equal(isStandardDefectCode({ system: true, code: 'X-1', norm: 'Current list' }), true);
  assert.equal(isStandardDefectCode({ system: false, code: '401', norm: 'ISO 6520-1' }), true);
  assert.equal(isStandardDefectCode({ code: 'IP', norm: 'API 1104' }), true);
  assert.equal(isStandardDefectCode({ system: false, code: '401', norm: 'Current list' }), false, 'same code, another norm');
  assert.equal(isStandardDefectCode({ system: false, code: 'B31-CR', norm: 'ASME B31.3' }), false);
  assert.equal(isStandardDefectCode({ system: false, code: '401 ', norm: 'ISO 6520-1' }), false, 'an exact match only');
  assert.equal(isLockedRecord('ndt_defect_codes', row('old', { system: false, code: '401', norm: 'ISO 6520-1' }), false), false, 'only the hosted profile locks');
  assert.equal(isLockedRecord('ndt_locations', row('old', { code: '401', norm: 'ISO 6520-1' }), true), false);
});

test('hosted: an older code matching a standard code is refused for edit and delete (403) and still switches per site', async t => {
  const f = await hostedFixture(t); await f.setup();
  const seeded = f.store.list('ndt_defect_codes').find(code => code.code === '401' && code.norm === 'ISO 6520-1')!;
  f.store.db.prepare('DELETE FROM ndt_defect_codes WHERE id=?').run(seeded.id);
  const old = f.store.create('ndt_defect_codes', { code: '401', english: 'Lack of fusion', dutch: 'Bindfout', group: 'Crack', norm: 'ISO 6520-1', system: false }, SYSTEM);
  const listed = (await f.rows('ndt_defect_codes')).find(code => code.id === old.id)!;
  assert.equal(listed.system, false); assert.equal(isLockedRecord('ndt_defect_codes', listed, true), true, 'the list shows it locked');
  let response = await f.request(`/api/records/ndt_defect_codes/${old.id}`, 'PUT', { dutch: 'Anders', _version: old._version });
  assert.equal(response.status, 403);
  response = await f.request(`/api/records/ndt_defect_codes/${old.id}/archive`, 'POST', { _version: old._version });
  assert.equal(response.status, 403);
  response = await f.request('/api/bulk/ndt_defect_codes', 'POST', { ids: [old.id], versions: { [old.id]: old._version }, changes: { english: 'Other' } });
  assert.ok([403, 404].includes(response.status), 'no bulk edit of its texts either');
  response = await f.request('/api/bulk/ndt_defect_codes', 'POST', { ids: [old.id], versions: { [old.id]: old._version }, changes: { enabledOnSite: false, enabledSiteId: 'site-river' } });
  assert.equal(response.status, 200, 'switching it per main project stays possible');
  const stored = f.store.get('ndt_defect_codes', old.id);
  assert.deepEqual([stored.english, stored.dutch, stored.group, stored.system], ['Lack of fusion', 'Bindfout', 'Crack', false], 'its texts stay the client\'s own');
});

test('hosted: a QA/QC engineer with a linked company and no Company text shows the company name in the list, the form and the export', async t => {
  const f = await hostedFixture(t); await f.setup();
  const engineer = f.store.get('qa_engineers', 'qa-1'); f.store.update('qa_engineers', engineer.id, { company: '' }, engineer._version, SYSTEM);
  const stored = f.store.get('qa_engineers', 'qa-1');
  assert.equal(stored.company, ''); assert.equal(stored.companyId, 'company-stelux');
  const listed = (await f.rows('qa_engineers')).find(row => row.id === 'qa-1')!;
  assert.equal(listed.company, 'Stelux Engineering', 'list and form start from the linked company name');
  assert.equal(((await (await f.request('/api/records/qa_engineers')).json()) as { rows: Row[] }).rows.find(row => row.id === 'qa-1')!.company, 'Stelux Engineering');
  const csv = await (await f.request('/api/export/qa_engineers')).text();
  assert.match(csv.split('\n').find(line => line.includes('Morgan Lee'))!, /Stelux Engineering/, 'the export prints it');
  assert.deepEqual(f.store.get('qa_engineers', 'qa-1'), stored, 'reading writes nothing');
  // An edit that leaves Company out keeps the derived value acceptable; an explicit empty Company is still refused.
  let response = await f.request('/api/records/qa_engineers/qa-1', 'PUT', { phone: '+31 10 555 0199', _version: stored._version });
  assert.equal(response.status, 200);
  response = await f.request('/api/records/qa_engineers/qa-1', 'PUT', { company: '', _version: f.store.get('qa_engineers', 'qa-1')._version });
  assert.equal(response.status, 422);
  // The stored text wins over the linked record.
  response = await f.request('/api/records/qa_engineers/qa-1', 'PUT', { company: 'Site Lillo', _version: f.store.get('qa_engineers', 'qa-1')._version });
  assert.equal(response.status, 200); assert.equal((await f.rows('qa_engineers')).find(row => row.id === 'qa-1')!.company, 'Site Lillo');
  assert.equal(qaEngineerCompany({ company: '', companyId: 'gone' }, () => undefined), '');
  assert.equal(qaEngineerCompany({ company: ' ', companyId: 'c' }, () => 'Linked'), 'Linked');
  assert.equal(qaEngineerCompany({ company: 'Own', companyId: 'c' }, () => 'Linked'), 'Own');
});

test('Weld Pilot shows no laydown or service-company fields on the spools page; MTO Pilot keeps them', () => {
  const spools = catalog('spools');
  assert.ok(spools.fields.some(f => f.name === 'laydownId') && spools.columns.includes('laydownId'), 'the shared resource carries the logistics fields');
  const weld = pilotResource(spools, 'weld');
  for (const name of ['laydownId', 'serviceCompanyId']) {
    assert.ok(weld.fields.find(f => f.name === name)!.hidden, `${name} is not a form field in Weld Pilot`);
    assert.ok(!weld.columns.includes(name), `${name} is not a column in Weld Pilot`);
  }
  assert.equal(pilotResource(spools, 'mto'), spools); assert.equal(pilotResource(spools, undefined), spools);
  const types = catalog('weld_types'); assert.equal(pilotResource(types, 'weld'), types, 'other resources are returned as they are');
});

// ---------------------------------------------------------------------------------------------------------
// Wave 3: labels and small forms of the catalogs that wave 1 left
// ---------------------------------------------------------------------------------------------------------
test('NDT process form: NDT process, Description, Method, File, Welder Performance Report (WPR), Enable on this site; the groups page adds "Add NDT process"', () => {
  const process = catalog('ndt_processes');
  assert.deepEqual(catalogFormLabels('ndt_processes', process.fields, 'Zandbak'), ['NDT process', 'Description', 'Method', 'File', 'Welder Performance Report (WPR)', 'Enable on this site (Zandbak)']);
  assert.deepEqual(catalogFormLabels('ndt_groups', catalog('ndt_groups').fields, 'Zandbak'), ['NDT process group', 'Description'], 'no file input on other forms');
  assert.equal(catalog('ndt_groups').wording?.add, 'Add NDT process');
  assert.equal(catalog('ndt_groups').title, 'NDT process groups', 'the page title stays the groups title');
  assert.equal(RESOURCE_MAP.ndt_groups.wording, undefined, 'the full profile keeps its own add label');
});

test('NDT locations form has the one field and no Notes section; PQR page title reads PQR', () => {
  assert.deepEqual(visible('ndt_locations').map(f => [f.name, f.section]), [['name', undefined]]);
  assert.ok(!catalog('ndt_locations').fields.some(f => f.section === 'Notes'));
  assert.equal(catalog('pqr').title, 'PQR'); assert.equal(HOSTED_TITLES.pqr, 'PQR');
  assert.equal(RESOURCE_MAP.pqr.title, 'Procedure qualifications', 'the other profiles keep their title');
});

test('the Edit dialogs differ from the Add dialogs as in the reference; Add is unchanged', () => {
  const edit = (key: string) => editFields(key, catalog(key).fields), add = (key: string) => catalog(key).fields;
  const field = (list: ReturnType<typeof add>, name: string) => list.find(f => f.name === name)!;
  assert.deepEqual([field(add('roles'), 'name').label, field(edit('roles'), 'name').label], ['Role', 'Function']);
  assert.deepEqual([field(add('weld_types'), 'jointType').required ?? false, field(edit('weld_types'), 'jointType').required, field(add('weld_types'), 'grooveType').label, field(edit('weld_types'), 'grooveType').label], [false, true, 'Groove type', 'Groove shape']);
  assert.deepEqual([field(add('ndt_groups'), 'description').required ?? false, field(edit('ndt_groups'), 'description').required], [false, true]);
  assert.deepEqual([field(add('diameters'), 'sizeinch').required ?? false, field(edit('diameters'), 'sizeinch').required, field(add('diameters'), 'sizeinch').decimal, field(edit('diameters'), 'sizeinch').decimal, field(edit('diameters'), 'outline').decimal, field(edit('diameters'), 'size').decimal], [false, true, true, false, false, true]);
  const names = (list: ReturnType<typeof add>) => list.map(f => f.name);
  const wire = names(add('welding_wires'));
  assert.ok(wire.indexOf('controlled') < wire.indexOf('accepted'), 'Add: Controlled, Accepted');
  assert.ok(names(edit('welding_wires')).indexOf('accepted') < names(edit('welding_wires')).indexOf('controlled'), 'Edit: Accepted before Controlled');
  assert.deepEqual([...names(edit('welding_wires'))].sort(), [...wire].sort(), 'nothing is added or lost');
  assert.deepEqual(Object.keys(EDIT_FIELD_OVERRIDES).sort(), ['diameters', 'ndt_groups', 'roles', 'weld_types']);
  const coatings = add('coatings');
  assert.equal(editFields('coatings', coatings), coatings, 'a resource without overrides is returned as it is');
});

test('hosted: the edit-only required fields are refused on an update and accepted on a create; the WPS weld process is optional on an update only', async t => {
  const f = await hostedFixture(t); await f.setup();
  // Weld type: Joint type is required when editing.
  const created = (await body(await f.request('/api/records/weld_types', 'POST', { name: 'Test fillet', location: 'Shop', abbreviation: 'TF' }))).record!;
  let response = await f.request(`/api/records/weld_types/${created.id}`, 'PUT', { abbreviation: 'TF2', _version: created._version });
  assert.equal(response.status, 422); assert.equal((await body(response)).fields!.jointType, 'Joint type is required.');
  response = await f.request(`/api/records/weld_types/${created.id}`, 'PUT', { abbreviation: 'TF2', jointType: 'FW', _version: created._version });
  assert.equal(response.status, 200);
  // NDT process group: Description is optional on a create, required on an update.
  const group = (await body(await f.request('/api/records/ndt_groups', 'POST', { name: 'ECT' }))).record!;
  response = await f.request(`/api/records/ndt_groups/${group.id}`, 'PUT', { name: 'ECT-2', _version: group._version });
  assert.equal(response.status, 422); assert.equal((await body(response)).fields!.description, 'Description is required.');
  response = await f.request(`/api/records/ndt_groups/${group.id}`, 'PUT', { description: '', _version: group._version });
  assert.equal(response.status, 422);
  response = await f.request(`/api/records/ndt_groups/${group.id}`, 'PUT', { description: 'Eddy current', _version: group._version });
  assert.equal(response.status, 200);
  // Weld diameter: Size in inches is required on an update.
  const diameter = (await body(await f.request('/api/records/diameters', 'POST', { diameter: 'DN9999', size: '219,1' }))).record!;
  response = await f.request(`/api/records/diameters/${diameter.id}`, 'PUT', { outline: 5, _version: diameter._version });
  assert.equal(response.status, 422); assert.equal((await body(response)).fields!.sizeinch, 'Size in inches is required.');
  response = await f.request(`/api/records/diameters/${diameter.id}`, 'PUT', { sizeinch: 4.5, _version: diameter._version });
  assert.equal(response.status, 200);
  // WPS method: Weld process is required on a create and optional on an update.
  const wps = f.store.get('wps', 'wps-1');
  response = await f.request(`/api/records/wps/${wps.id}`, 'PUT', { method: '', _version: wps._version });
  assert.equal(response.status, 200, 'optional when editing');
  response = await f.request('/api/records/wps', 'POST', { name: 'NEW-WPS', definition: 'Sample definition' });
  assert.equal(response.status, 422); assert.ok((await body(response)).fields!.method, 'required when adding');
});

test('Edit from the record detail of a WPS or PQR opens the dedicated editor (hosted); other resources and profiles keep the generic one', () => {
  assert.equal(dedicatedEditor('wps', true), 'wps'); assert.equal(dedicatedEditor('pqr', true), 'pqr');
  assert.equal(dedicatedEditor('wps', false), undefined, 'the other profiles have no dedicated editor');
  for (const key of ['welds', 'weld_types', 'certifications', 'ndt_processes']) assert.equal(dedicatedEditor(key, true), undefined, key);
});

test('the Copy WPS dialogs list every project site in creation order with the current main project chosen', () => {
  const sites = [row('site-b', { name: 'Beta', _createdAt: '2026-02-01T00:00:00.000Z' }), row('site-a', { name: 'Alpha', _createdAt: '2026-01-01T00:00:00.000Z' }), row('site-c', { name: 'Gamma', _createdAt: '2026-03-01T00:00:00.000Z' }), row('site-x', { name: 'Archived', _archived: true, _createdAt: '2025-01-01T00:00:00.000Z' })];
  assert.deepEqual(copyTargets(sites, 'site-b').sites.map(site => site.id), ['site-a', 'site-b', 'site-c'], 'creation order, not by name, the current one included, archived left out');
  assert.equal(copyTargets(sites, 'site-b').selected, 'site-b', 'the current main project is chosen');
  assert.equal(copyTargets(sites, 'unknown').selected, 'site-a', 'else the first one');
  assert.deepEqual(copyTargets([], 'site-a'), { sites: [], selected: '' });
  // Equal creation times fall back to the id order (the reference lists 1, 2, 10).
  const same = ['site-10', 'site-2', 'site-1'].map(id => row(id, { _createdAt: '2026-01-01T00:00:00.000Z' }));
  assert.deepEqual(copyTargets(same, 'site-2').sites.map(site => site.id), ['site-1', 'site-2', 'site-10']);
});

test('the Site activities sum is green when the Site phase is 0; Shop, Field and the phase total only at exactly 100', () => {
  const site = (extra: Record<string, unknown>) => ({ ...PROGRESS_DEFAULTS, ...extra });
  assert.equal(progressSumsOk(site({})).activities.site, true, 'Site phase 0 and Site activities 0');
  assert.equal(progressSumsOk(site({ [PROGRESS_PHASES[0].field]: 40, [PROGRESS_PHASES[1].field]: 40, [PROGRESS_PHASES[2].field]: 20 })).activities.site, false, 'Site phase 20 and Site activities 0');
  const siteFields = PROGRESS_PHASES[2].activities.map(activity => activity.field);
  const filled = site({ [PROGRESS_PHASES[0].field]: 40, [PROGRESS_PHASES[1].field]: 40, [PROGRESS_PHASES[2].field]: 20, [siteFields[0]]: 60, [siteFields[1]]: 40 });
  assert.equal(progressSumsOk(filled).activities.site, true, 'Site activities 60 + 40');
  assert.deepEqual([progressSumsOk(site({})).activities.shop, progressSumsOk(site({})).activities.field, progressSumsOk(site({})).phases], [false, false, true], 'Shop and Field activities need 100 whatever the phase; the phases total 50 + 50 + 0');
});
