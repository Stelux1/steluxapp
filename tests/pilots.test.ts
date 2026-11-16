import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, pageAvailable, pagePath, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { canResource, SHARED_PILOT_SCOPES, RESOURCE_SCOPES } from '../shared/permissions.ts';
import { PILOTS, PILOT_MAP, allowedPilots, legacyPilotPath, pagePilots, pilotItemPath, pilotItemResources, splitPilotPath } from '../shared/pilots.ts';
import type { Bootstrap, Module, Row, User } from '../shared/types.ts';
import * as catalog from '../client/catalog.ts';
import { resourcePath } from '../client/records.tsx';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
/** Routes of the client route table that are not resource pages (`client/App.tsx`). */
const EXPLICIT_ROUTES = ['/dashboard', '/workspace/main-projects', '/welding/lisl', '/welding/inspections', '/welding/reports', '/materials', '/materials/planning', '/materials/execution', '/materials/logistics', '/materials/reports', '/materials/order-materials', '/materials/pending-orders', '/materials/take-in', '/materials/order-archive', '/materials/materials-list', '/materials/iso-execution', '/materials/service-spools', '/materials/service-materials'];
// The Prefab release and Field release pages share the releases route and differ by ?view= (see client/releases.tsx).
EXPLICIT_ROUTES.push('/welding/releases', '/welding/field_packages');
const items = PILOTS.flatMap(pilot => pilot.groups.flatMap(group => group.items.map(item => ({ pilot, group, item }))));
const account = (permissions: Partial<Record<Module, number>>, availability = hosted): User => ({ id: 'u', name: 'Test', email: 't@example.test', profileId: 'p', availability, permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions } });

test('both pilots carry the reference titles, module colours and menu groups in order', () => {
  assert.deepEqual(PILOTS.map(pilot => [pilot.key, pilot.title, pilot.module]), [['weld', 'Weld Pilot', 'welding'], ['mto', 'MTO Pilot', 'materials']]);
  assert.equal(PILOT_MAP.weld.color, '#6d9a54'); assert.equal(PILOT_MAP.mto.color, '#de8d35');
  assert.deepEqual(PILOT_MAP.weld.groups.map(group => group.title), ['General data', 'Start', 'Welder data', 'Weld data', 'Material data', 'NDT data', 'Welding data', 'Releases', 'System']);
  assert.deepEqual(PILOT_MAP.mto.groups.map(group => group.title), ['General data', 'Start', 'Materials', 'Order / Take in', 'Projects data', 'Logistic', 'Calculations', 'System']);
  for (const { pilot } of items) assert.doesNotMatch(pilot.title, /®/);
  // Iso overview: Weld Pilot "Welding data" right after ITPs (the reference's ITP templates are not built) and before
  // NDT/PWHT Manager; MTO Pilot "Projects data" last, after Pick List archive. Both open the "Project search" dialog.
  const labels = (key: 'weld' | 'mto', title: string) => PILOT_MAP[key].groups.find(group => group.title === title)!.items.map(item => item.label);
  const weldData = labels('weld', 'Welding data');
  assert.equal(weldData[weldData.indexOf('ITPs') + 1], 'Iso overview'); assert.ok(weldData.indexOf('Iso overview') < weldData.indexOf('NDT/PWHT Manager'));
  assert.deepEqual(labels('mto', 'Projects data').slice(-2), ['Pick List archive', 'Iso overview']);
  for (const key of ['weld', 'mto'] as const) { const item = PILOT_MAP[key].groups.flatMap(group => group.items).find(entry => entry.label === 'Iso overview')!; assert.equal(item.action, 'iso-overview'); assert.deepEqual(pilotItemResources(item), ['projects', 'isometrics']); }
  // Reference items without a page in this application are not listed.
  for (const missing of ['ITP templates', 'WPS Designer', 'Form designer', 'My templates', 'Daily reporting', 'NDT Batch Import', 'ISO PDF Import', 'Change theme']) assert.ok(!items.some(({ item }) => item.label === missing), missing);
});

test('the Weld Pilot menu has no Weld process and no Request archive (hidden by design in the reference); the MTO Pilot keeps its service request archive', () => {
  const labels = PILOT_MAP.weld.groups.flatMap(group => group.items.map(item => item.label));
  for (const hidden of ['Weld process', 'Request archive']) assert.ok(!labels.includes(hidden), hidden);
  assert.deepEqual(PILOT_MAP.weld.groups.find(group => group.title === 'Weld data')!.items.map(item => item.label), ['PQR', 'WPS methods', 'Weld type', 'Coating', 'Spools']);
  assert.ok(PILOT_MAP.mto.groups.flatMap(group => group.items).some(item => item.label === 'Request archive' && item.resource === 'service_requests'));
});

test('the Assign Iso to FWP menu item opens the assign tab of the field work package page', () => {
  const item = PILOT_MAP.weld.groups.find(group => group.title === 'Releases')!.items.find(entry => entry.label === 'Assign Iso to FWP')!;
  assert.equal(pilotItemPath(item), '/welding/field_packages?tab=assign');
  assert.deepEqual(pilotItemResources(item), ['field_packages']);
});

test('every menu item resolves to a real page and resource items use resourcePath()', () => {
  catalog.configureCatalog();
  for (const { pilot, item } of items) {
    if (item.action) { assert.ok(['password', 'iso-overview'].includes(item.action), item.label); continue; }
    const path = pilotItemPath(item)!; const route = path.split('?')[0];
    for (const key of pilotItemResources(item)) assert.ok(RESOURCE_MAP[key], `${pilot.key} ${item.label}: ${key}`);
    if (item.resource && !item.path) assert.equal(path, resourcePath(item.resource), item.label);
    else assert.ok(EXPLICIT_ROUTES.includes(route), `${pilot.key} ${item.label}: ${route}`);
  }
  // A menu does not list the same page twice.
  for (const pilot of PILOTS) { const paths = pilot.groups.flatMap(group => group.items).map(pilotItemPath).filter(Boolean); assert.equal(new Set(paths).size, paths.length, pilot.key); }
  // Every page the hosted profile delivers today stays reachable from at least one menu.
  const listed = new Set(items.map(({ item }) => pilotItemPath(item)?.split('?')[0]));
  // Calculation lines and cut list open inside "MTO & calculations";
  // inspection requests open as the request archives of the NDT/PWHT Manager.
  // The reference hides Weld process (and the Request archive): the page stays reachable by its route, not by a menu item (shell-general-025).
  for (const key of hosted.navigation.filter(key => !['calculation_lines', 'cut_list', 'inspection_requests', 'weld_processes'].includes(key))) assert.ok(listed.has(resourcePath(key)), key);
  assert.ok(!listed.has(resourcePath('weld_processes')) && hosted.navigation.includes('weld_processes'), 'Weld process is delivered but has no menu item');
  assert.ok(!listed.has('/workspace/main-projects'), 'Project sites is the table, the card screen is the choice after sign-in'); assert.ok(listed.has('/workspace/sites')); assert.ok(listed.has('/welding/lisl')); assert.ok(listed.has('/materials/planning'));
});

test('pilot membership keeps shared pages in both pilots and pilot pages in their own', () => {
  for (const path of ['/', '/dashboard', '/workspace/projects', '/workspace/isometrics', '/workspace/isometrics/iso-1', '/workspace/projects/p/isometrics', '/workspace/spools', '/workspace/attachments', '/workspace/main-projects', '/settings/users', '/settings/profiles', '/materials/certifications', '/materials/material_parts', '/materials/material_types', '/materials/suppliers']) assert.deepEqual(pagePilots(path), ['weld', 'mto'], path);
  for (const path of ['/welding/welds', '/welding/lisl', '/welding/reports', '/welding/inspection_requests', '/welding/wps', '/welding/welding_wires']) assert.deepEqual(pagePilots(path), ['weld'], path);
  for (const path of ['/materials/planning', '/materials/iso_materials', '/materials/materials', '/materials/execution', '/materials/orders', '/materials/stock', '/materials/reports', '/materials/calculation_norms']) assert.deepEqual(pagePilots(path), ['mto'], path);
  assert.deepEqual(pagePilots('/materials/execution?view=order'), ['mto']);
});

test('the pilot prefix is accepted only where the profile delivers pilots and never widens the delivered pages', () => {
  assert.ok(hosted.features.includes('pilots'));
  assert.deepEqual(splitPilotPath('/weld/welding/welds'), { pilot: 'weld', path: '/welding/welds' });
  assert.deepEqual(splitPilotPath('/mto'), { pilot: 'mto', path: '/' });
  assert.deepEqual(splitPilotPath('/weldx/welding/welds'), { path: '/weldx/welding/welds' });
  for (const path of ['/', '/weld', '/mto/', '/weld/dashboard', '/weld/welding/welds', '/weld/welding/lisl', '/mto/materials/planning', '/mto/workspace/isometrics/iso-1', '/mto/materials/certifications', '/weld/materials/planning', '/welding/welds', '/materials/planning']) assert.ok(pageAvailable(hosted, path, RESOURCES), path);
  for (const path of ['/weld/settings/users', '/mto/settings/profiles', '/weld/settings/signatures', '/weld/welding/pqr']) assert.ok(pageAvailable(hosted, path, RESOURCES), path);
  for (const path of ['/mto/materials/orders', '/weld/tools', '/weld/settings/companies', '/weld/weld/welding/welds', '/mto/mto/materials/planning', '/weldx/welding/welds', '/materials/orders']) assert.equal(pageAvailable(hosted, path, RESOURCES), false, path);
  assert.equal(pagePath(hosted, '/weld/welding/reports'), '/welding/reports');
  for (const profile of ['welding-demo', 'access-prototype'] as const) {
    const availability = availabilityFor(profile)!;
    assert.ok(!availability.features.includes('pilots'), profile);
    assert.equal(pageAvailable(availability, '/weld/welding/welds', RESOURCES), false, profile);
    assert.equal(pagePath(availability, '/weld/welding/reports'), '/weld/welding/reports');
  }
});

test('old URLs move into the pilot that owns them', () => {
  assert.equal(legacyPilotPath('/materials/planning'), '/mto/materials/planning');
  assert.equal(legacyPilotPath('/materials'), '/mto/materials');
  assert.equal(legacyPilotPath('/welding/lisl'), '/weld/welding/lisl');
  assert.equal(legacyPilotPath('/workspace/isometrics/iso-1'), '/weld/workspace/isometrics/iso-1');
  assert.equal(legacyPilotPath('/dashboard'), '/weld/dashboard');
  // A shared page opens in the only pilot the account may enter; a pilot page keeps its owner.
  assert.equal(legacyPilotPath('/workspace/isometrics/iso-1', ['mto']), '/mto/workspace/isometrics/iso-1');
  assert.equal(legacyPilotPath('/welding/lisl', ['mto']), '/weld/welding/lisl');
});

test('selector eligibility follows the projected module levels', () => {
  assert.deepEqual(allowedPilots(account({ general: 2, welding: 2, materials: 2 })).map(p => p.key), ['weld', 'mto']);
  assert.deepEqual(allowedPilots(account({ general: 2, welding: 1 })).map(p => p.key), ['weld']);
  assert.deepEqual(allowedPilots(account({ general: 2, materials: 3 })).map(p => p.key), ['mto']);
  assert.deepEqual(allowedPilots(account({ general: 3, settings: 3 })).map(p => p.key), []);
});

test('shared catalogs take the higher materials or welding level, only in module-level mode and only with pilots', () => {
  assert.deepEqual(SHARED_PILOT_SCOPES.map(scope => Object.entries(RESOURCE_SCOPES).filter(([, scopes]) => scopes.includes(scope)).map(([key]) => key)).flat().sort(), ['certificate_projects', 'certifications', 'material_parts', 'material_types', 'spools', 'suppliers']);
  const widened = { ...structuredClone(hosted), resources: { ...hosted.resources, ...Object.fromEntries(['material_parts', 'material_types', 'suppliers', 'orders', 'stock', 'movements', 'picklists'].map(key => [key, ['name']])) } };
  const weld = account({ general: 1, welding: 2 }, widened), mto = account({ general: 1, materials: 2 }, widened);
  for (const key of ['material_parts', 'material_types', 'suppliers', 'certifications', 'spools']) {
    assert.ok(canResource(weld, key, 'show'), key); assert.ok(canResource(weld, key, 'edit'), key);
    assert.ok(canResource(mto, key, 'edit'), key);
  }
  for (const key of ['orders', 'stock', 'movements', 'picklists', 'iso_materials', 'materials', 'calculation_lines']) assert.equal(canResource(weld, key), false, key);
  for (const key of ['welds', 'inspection_requests', 'inspection_results', 'welders', 'wps', 'diameters']) assert.equal(canResource(mto, key), false, key);
  // A read-only welding level never grants writes on a shared catalog.
  assert.equal(canResource(account({ general: 1, welding: 1 }, widened), 'certifications', 'edit'), false);
  // Detailed permissions are unchanged: the matrix alone decides.
  assert.equal(canResource({ ...weld, capabilities: { '63': ['show'] } }, 'certifications'), false);
  // Without pilots the module of the resource alone decides.
  const { availability: _, ...internal } = account({ general: 1, welding: 2 }); assert.equal(canResource(internal, 'certifications'), false); assert.ok(canResource(internal, 'welds'));
  assert.equal(canResource(account({ general: 1, welding: 2 }, availabilityFor('access-prototype')), 'certifications'), false);
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-pilots-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  /** `account`: fields of the account itself, e.g. the applications it is enabled for (entering a pilot depends on those alone). */
  const signIn = async (name: string, levels: Record<string, string>, account: Record<string, unknown> = {}) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true, ...account });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    const response = await request('/api/auth/login', 'POST', { email: user.email, password }); assert.equal(response.status, 200);
    return (await response.json()).user as User;
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Pilot admin', email: 'pilot-admin@example.test', password })).status, 201) };
}

test('hosted pages are served under both prefixes and undelivered pages stay 404', async t => {
  const f = await hostedFixture(t);
  for (const path of ['/', '/weld', '/mto', '/weld/dashboard', '/weld/welding/welds', '/weld/welding/lisl', '/mto/materials/planning', '/mto/workspace/isometrics/iso-1', '/weld/workspace/isometrics/iso-1', '/weld/materials/planning', '/welding/welds', '/materials/planning', '/weld/welding/reports?report=wdi']) assert.equal((await f.request(path)).status, 200, path);
  for (const path of ['/mto/materials/orders', '/weld/tools', '/weld/weld/welding/welds', '/weld/welding/reports?report=releases', '/mto/welding/reports?report=releases']) assert.equal((await f.request(path)).status, 404, path);
});

test('a weld-only account sees shared catalogs through the API but stays out of MTO records', async t => {
  const f = await hostedFixture(t); await f.setup();
  const user = await f.signIn('Weld only', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' }, { mtoEnabled: false });
  assert.deepEqual(allowedPilots(user).map(p => p.key), ['weld']);
  const status = await (await f.request('/api/auth/status')).json(); assert.deepEqual(allowedPilots(status.user).map((p: { key: string }) => p.key), ['weld']);
  for (const key of ['certifications', 'spools', 'welds']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  for (const key of ['iso_materials', 'operation_phases', 'calculation_lines', 'custom_materials', 'uoms', 'orders', 'order_lines', 'receipts', 'stock', 'movements', 'transfer_orders', 'reservations', 'picklists']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  // The Material database is read-only in Weld Pilot (the material of certificates and welds); see tests/certifications.test.ts.
  assert.equal((await f.request('/api/records/materials')).status, 200);
  // Material part, type of material and supplier are shared catalogs of both pilots.
  for (const key of ['material_parts', 'material_types', 'suppliers']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  assert.equal((await f.request('/api/reports/mto')).status, 403);
  assert.equal((await f.request('/api/actions/add-iso-material', 'POST', { isoId: 'iso-1', source: 'Custom', materialNo: 'DENIED', quantity: 1 })).status, 403);
  const created = await f.request('/api/records/certifications', 'POST', { siteId: 'site-north', name: 'Weld pilot cert', chargeNo: 'W-001', certType: '3.1', diameter: '1/2"', materialPartId: 'part-0', materialTypeId: 'material-type-0', schedule: '40', wallThickness: '2.77' }); assert.equal(created.status, 201);
  const data = await (await f.request('/api/bootstrap')).json() as Bootstrap;
  assert.ok(data.rows.certifications.some(row => row.name === 'Weld pilot cert')); assert.ok(data.rows.spools.length);
  for (const key of ['iso_materials', 'orders', 'stock']) assert.equal(data.rows[key], undefined, key);
  assert.ok(data.rows.materials.length, 'the Material database is read in Weld Pilot');
});

test('an MTO-only account sees shared catalogs through the API but stays out of weld and inspection records', async t => {
  const f = await hostedFixture(t); await f.setup();
  const user = await f.signIn('MTO only', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' }, { weldEnabled: false });
  assert.deepEqual(allowedPilots(user).map(p => p.key), ['mto']);
  assert.equal((await f.request('/api/records/certifications')).status, 403, 'not enabled for Weld Pilot');
  f.usePilot('mto');
  for (const key of ['certifications', 'spools', 'iso_materials', 'materials']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  for (const key of ['welds', 'inspection_requests', 'inspection_results', 'welders', 'wps', 'diameters', 'test_systems']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  for (const key of ['lisl', 'wdi', 'inspection-results']) assert.equal((await f.request(`/api/reports/${key}`)).status, 403, key);
  assert.equal((await f.request('/api/actions/inspection-request', 'POST', { type: 'NDT', weldIds: ['weld-1'], date: '2026-10-01' })).status, 403);
  assert.equal((await f.request('/api/records/welds', 'POST', { weldNo: 'DENIED', isoId: 'iso-1' })).status, 403);
  const data = await (await f.request('/api/bootstrap')).json() as Bootstrap;
  for (const key of ['welds', 'inspection_requests', 'inspection_results', 'welders']) assert.equal(data.rows[key], undefined, key);
  assert.ok(data.rows.certifications); assert.ok(data.rows.spools);
});

test('PQR is a Weld Pilot page of the hosted profile: an administrator reads and creates PQRs, an MTO-only account cannot', async t => {
  const f = await hostedFixture(t); await f.setup();
  const weld = (await (await f.request('/api/auth/status')).json()).user as User;
  assert.ok(weld.availability!.navigation.includes('pqr'), 'the PQR page is delivered in Weld Pilot');
  assert.ok(pageAvailable(weld.availability, '/weld/welding/pqr', RESOURCES));
  assert.equal((await f.request('/weld/welding/pqr')).status, 200);
  assert.equal((await f.request('/api/records/pqr')).status, 200);
  assert.equal((await f.request('/api/records/qualification_options')).status, 200, 'the reusable attribute values');
  const created = await f.request('/api/records/pqr', 'POST', { name: 'STX-PQR-HOSTED' }); assert.equal(created.status, 201, await created.clone().text());
  const pqr = (await created.json()).record as Row;
  const wps = await f.request('/api/records/wps', 'POST', { name: 'STX-WPS-HOSTED', method: '141', definition: 'Hosted PQR link', allProjects: true, pqrIds: [pqr.id] }); assert.equal(wps.status, 201, await wps.clone().text());
  const wpsId = (await wps.json()).record.id as string;
  assert.deepEqual(f.store.list('wps_pqr').filter(row => row.wpsId === wpsId).map(row => row.pqrId), [pqr.id], 'the WPS keeps its PQR link');
  assert.ok(((await (await f.request('/api/bootstrap')).json()) as Bootstrap).rows.wps_pqr.some(row => row.wpsId === wpsId), 'the links reach Weld Pilot');
  f.usePilot('mto');
  const menuKeys = (key: 'weld' | 'mto') => PILOT_MAP[key].groups.flatMap(group => group.items.map(item => item.resource));
  assert.ok(menuKeys('weld').includes('pqr')); assert.ok(!menuKeys('mto').includes('pqr'), 'MTO Pilot has no PQR menu entry');
  assert.equal((await f.request('/api/records/pqr')).status, 403, 'MTO Pilot does not read PQRs');
  f.usePilot('weld');
  await f.signIn('MTO only PQR', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/records/pqr')).status, 403, 'not enabled for Weld Pilot');
  f.usePilot('mto');
  assert.equal((await f.request('/api/records/pqr')).status, 403);
  assert.equal((await f.request('/api/records/pqr', 'POST', { name: 'DENIED' })).status, 403);
  assert.equal(f.store.list('pqr').filter(row => row.name === 'DENIED').length, 0);
});

test('read-only welding never writes a shared catalog and detailed permission profiles are unchanged', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Weld viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await f.request('/api/records/certifications')).status, 200);
  assert.equal((await f.request('/api/records/certifications', 'POST', { name: 'Denied cert' })).status, 403);
  await f.signIn('Detailed weld', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '64': ['show'], '63': ['show', 'insert', 'edit'] }) });
  assert.equal((await f.request('/api/records/welds')).status, 200);
  assert.equal((await f.request('/api/records/certifications')).status, 403);
  assert.equal((await f.request('/api/records/spools')).status, 403);
});
