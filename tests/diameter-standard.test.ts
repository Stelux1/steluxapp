import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { applyDefaultDiameters, diametersOnSite } from '../server/diameter-standard.ts';
import { duplicateSite } from '../server/site-duplicate.ts';
import { DIAMETER_CHART, DIAMETER_STANDARDS, chartNames, chartPosition, composeDiameter, diameterPrintLabel, diameterStandard, unitErrors, unitPrefill } from '../shared/diameter-standard.ts';
import { diameterOptions } from '../shared/weld-entry.ts';
import { weldLine } from '../shared/pdf-documents.ts';
import { CATALOG_SITES, NEW_RECORDS_OFF, SITE_ENABLED_RESOURCES, enabledOnSite } from '../shared/weld-catalogs.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import type { Row } from '../shared/types.ts';

const actor = { id: 'tester', name: 'Tester' };
const ASME = DIAMETER_STANDARDS[0], EN = DIAMETER_STANDARDS[1];
const textsOn = (store: Store, siteId: string) => diametersOnSite(store, siteId).map(row => String(row.diameter)).sort((a, b) => chartPosition(a) - chartPosition(b) || a.localeCompare(b, 'en', { numeric: true }));
const hostedStore = () => { const store = new Store(':memory:'); seed(store); store.hostedRules = true; return store; };
const newSite = (store: Store, name: string, diameterStandardValue?: string) => { const site = store.create('sites', { name, ...(diameterStandardValue ? { diameterStandard: diameterStandardValue } : {}) }, actor); applyDefaultDiameters(store, site.id, actor); return site; };

test('the chart holds the client\'s 36 sizes; both standards name them as the client writes them', () => {
  assert.equal(DIAMETER_CHART.length, 36);
  assert.deepEqual(chartNames(ASME).slice(0, 10), ['1/8"', '1/4"', '3/8"', '1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"', '2.1/2"']); assert.equal(chartNames(ASME)[35], '48"');
  assert.deepEqual(chartNames(EN).slice(0, 12), ['DN 6', 'DN 8', 'DN 10', 'DN 15', 'DN 20', 'DN 25', 'DN 32', 'DN 40', 'DN 50', 'DN 65', 'DN 80', 'DN 90']); assert.equal(chartNames(EN)[35], 'DN 1200');
  assert.equal(chartPosition('DN50'), 8); assert.equal(chartPosition('DN 50'), 8); assert.equal(chartPosition('2"'), 8); assert.equal(chartPosition('5 mm'), -1);
  assert.equal(diameterStandard({}), ASME, 'a main project saved before the setting reads as ASME (inch)'); assert.equal(diameterStandard({ diameterStandard: EN }), EN); assert.equal(diameterStandard({ diameterStandard: 'x' }), ASME);
  const field = RESOURCE_MAP.sites.fields.find(entry => entry.name === 'diameterStandard')!;
  assert.deepEqual([field.label, field.section, field.options, field.default], ['Diameter standard', 'Project settings', [ASME, EN], ASME]);
});

test('a new ASME main project lists exactly the 36 inch sizes in chart order; the existing main projects keep every diameter they saw', () => {
  const store = hostedStore(); const before = { north: textsOn(store, 'site-north'), river: textsOn(store, 'site-river') };
  assert.ok(!store.list('diameters').some(row => row.diameter === '1/8"'), 'the catalog holds no 1/8"');
  const site = newSite(store, 'Impala Tank Terminal');
  assert.deepEqual(textsOn(store, site.id), chartNames(ASME), 'the 36 inch records, in chart order, nothing else');
  assert.deepEqual(diameterOptions(diametersOnSite(store, site.id), false, true).map(option => option.label), chartNames(ASME), 'the weld form lists them in the same order, labelled with their text');
  const eighth = store.list('diameters').find(row => row.diameter === '1/8"')!;
  assert.deepEqual([eighth.size, eighth.sizeinch, eighth.outline, eighth.sorting], [10.3, 0.125, 32.4, 1], 'a missing size is created from its B36.10 outside diameter');
  const half = store.list('diameters').filter(row => row.diameter === '1/2"'); assert.equal(half.length, 1, 'an existing record is reused, not duplicated'); assert.equal(half[0]._version, 1, 'and not rewritten');
  assert.deepEqual(textsOn(store, 'site-north'), before.north, 'existing main projects see what they saw (the new records are off there)'); assert.deepEqual(textsOn(store, 'site-river'), before.river);
  assert.ok(store.list(CATALOG_SITES).every(link => link.siteId === site.id || link.enabled === false), 'only the new main project got links to switch on or off');
});

test('a new EN main project lists exactly DN 6 to DN 1200', () => {
  const store = hostedStore(); const north = textsOn(store, 'site-north');
  const site = newSite(store, 'Gasunie hub', EN);
  assert.deepEqual(textsOn(store, site.id), chartNames(EN));
  const dn6 = store.list('diameters').find(row => row.diameter === 'DN 6')!; assert.deepEqual([dn6.size, dn6.sizeinch, dn6.outline, dn6.sorting], [10.3, 0.125, 32.4, 1]);
  const dn50 = store.list('diameters').find(row => row.diameter === 'DN 50')!; assert.deepEqual([dn50.size, dn50.sizeinch, dn50.outline], [60.3, 2, 189.4], 'Outline = pi x outside diameter to 0.1');
  assert.ok(store.list('diameters').some(row => row.diameter === 'DN50'), 'the catalog\'s own DN50 stays, switched off for the new main project'); assert.ok(!textsOn(store, site.id).includes('DN50'));
  assert.deepEqual(textsOn(store, 'site-north'), north, 'a DN record created now is off on the other main projects');
});

test('changing the standard of a main project switches the other standard\'s 36 on as well and switches nothing off', () => {
  const store = hostedStore(); const site = newSite(store, 'Switcher');
  store.update('sites', site.id, { diameterStandard: EN }, store.get('sites', site.id)._version, actor);
  assert.deepEqual(textsOn(store, site.id), [...chartNames(ASME), ...chartNames(EN)].sort((a, b) => chartPosition(a) - chartPosition(b) || a.localeCompare(b, 'en', { numeric: true })), 'both lists are on, nothing else');
  const north = textsOn(store, 'site-north'); store.update('sites', 'site-north', { diameterStandard: EN }, store.get('sites', 'site-north')._version, actor);
  assert.ok(chartNames(EN).every(name => textsOn(store, 'site-north').includes(name)), 'an older main project gets the DN sizes too'); assert.ok(north.every(name => textsOn(store, 'site-north').includes(name)), 'and keeps everything it had');
});

test('Duplicate project site: the copy does not take over the diameter list; it starts with the 36 sizes of its standard', () => {
  const store = hostedStore(); store.update('sites', 'site-river', { diameterStandard: EN }, store.get('sites', 'site-river')._version, actor);
  const copied = duplicateSite(store, { siteId: 'site-river', parts: ['projectSettings'] }, actor).record!; assert.equal(copied.diameterStandard, EN);
  assert.deepEqual(textsOn(store, copied.id), chartNames(EN));
  const plain = duplicateSite(store, { siteId: 'site-river', parts: [] }, actor).record!; assert.deepEqual(textsOn(store, plain.id), chartNames(ASME));
});

test('Weld diameters is a per-main-project list with a Unit + Value Add form', () => {
  assert.ok(SITE_ENABLED_RESOURCES.includes('diameters') && NEW_RECORDS_OFF.includes('diameters'));
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!, page = projectResource(hosted, RESOURCE_MAP.diameters);
  assert.deepEqual(page.fields.filter(field => !field.hidden).map(field => field.label), ['Unit', 'Value', 'Diameter', 'Size in mm', 'Size in inches', 'Outline in mm', 'Sorting']);
  assert.ok(projectResource(hosted, RESOURCE_MAP.sites).fields.some(field => field.name === 'diameterStandard' && field.label === 'Diameter standard'), 'the main project form carries the setting');
  const unit = page.fields.find(field => field.name === 'unit')!; assert.deepEqual([unit.free, unit.blank, unit.options], [true, 'Choose or type', ['inch', 'DN', 'mm']]);
  assert.deepEqual(page.columns, ['diameter', 'size', 'sizeinch', 'outline', 'sorting'], 'Unit and Value are not list columns');
  assert.ok(RESOURCES.some(entry => entry.key === 'diameters'));
});

test('Unit + Value compose the Diameter text and prefill the sizes the unit allows', () => {
  assert.deepEqual([['inch', '2'], ['in', '5.5'], ['DN', '50'], ['dn', '65'], ['mm', '12,5'], ['bar', '3'], ['', '3'], ['mm', '']].map(([unit, value]) => composeDiameter(unit, value)), ['2"', '5.5"', 'DN 50', 'DN 65', '12.5 mm', '3 bar', '', '']);
  assert.deepEqual(unitPrefill('DN', '50'), { size: 60.3, sizeinch: 2, outline: 189.4 }); assert.deepEqual(unitPrefill('inch', '1.1/4'), { size: 42.2, sizeinch: 1.25, outline: 132.6 });
  assert.deepEqual(unitPrefill('mm', '12'), { size: 12, outline: 12 }); assert.deepEqual(unitPrefill('inch', '5.5'), { sizeinch: 5.5 }); assert.deepEqual(unitPrefill('DN', '55'), {}); assert.deepEqual(unitPrefill('bar', '3'), {});
  assert.deepEqual(unitErrors('', ''), {}); assert.deepEqual(unitErrors('DN', ''), { unitValue: 'Enter the value.' }); assert.deepEqual(unitErrors('', '50'), { unit: 'Choose or type the unit.' }); assert.ok(unitErrors('mm', 'abc').unitValue && unitErrors('DN', '1/2').unitValue && !unitErrors('inch', '1/2').unitValue);
});

async function appFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-diameters-')); const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const json = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await json('/api/auth/setup', 'POST', { name: 'Diameter admin', email: 'diameter-admin@example.test', password: 'Diameter-Test-Password' })).status, 201);
  return { store, json };
}

test('Add project site through the app gives the new main project the 36 sizes of its standard; a custom diameter is composed and enabled only on its main project', async t => {
  const f = await appFixture(t); const north = textsOn(f.store, 'site-north');
  const created = await f.json('/api/records/sites', 'POST', { name: 'Impala Tank Terminal', address: '1 Quay Road', diameterStandard: EN }); assert.equal(created.status, 201, await created.clone().text());
  const siteId = ((await created.json()) as { record: Row }).record.id; assert.deepEqual(textsOn(f.store, siteId), chartNames(EN)); assert.deepEqual(textsOn(f.store, 'site-north'), north);
  const add = async (data: Record<string, unknown>, site = siteId) => f.json('/api/records/diameters', 'POST', { enabledOnSite: true, enabledSiteId: site, ...data });
  const dn = await add({ unit: 'DN', unitValue: '55', size: 66 }); assert.equal(dn.status, 201, await dn.clone().text()); const record = ((await dn.json()) as { record: Row }).record;
  assert.equal(record.diameter, 'DN 55'); assert.equal(record.unit, 'DN');
  const rows = { [CATALOG_SITES]: f.store.list(CATALOG_SITES) };
  assert.ok(enabledOnSite('diameters', record, siteId, rows), 'enabled on the main project it was added on'); assert.ok(!enabledOnSite('diameters', record, 'site-north', rows) && !enabledOnSite('diameters', record, 'site-river', rows), 'and off on every other');
  assert.equal((await add({ unit: 'DN', unitValue: '65' })).status, 409, 'DN 65 is a chart record already: the composed text must be unique');
  const mm = await add({ unit: 'mm', unitValue: '777' }); const twelve = ((await mm.json()) as { record: Row }).record; assert.deepEqual([twelve.diameter, twelve.size], ['777 mm', 777]);
  const other = await add({ unit: 'bar', unitValue: '3', size: 4 }); const bar = ((await other.json()) as { record: Row }).record; assert.deepEqual([bar.diameter, bar.size], ['3 bar', 4], 'another unit is typed; the sizes typed stay');
  const refused = await add({ unit: 'mm', unitValue: '' }); assert.equal(refused.status, 422); assert.ok(((await refused.json()) as { fields?: Record<string, string> }).fields?.unitValue);
  assert.ok(textsOn(f.store, siteId).includes('DN 55') && !textsOn(f.store, 'site-north').includes('DN 55'));
  const plain = await f.json('/api/records/diameters', 'POST', { diameter: 'Old style', size: 20 }); assert.equal(plain.status, 201, 'a record without a unit still saves as before');
  const edit = await f.json(`/api/records/diameters/${record.id}`, 'PUT', { diameter: 'DN 55', size: 67, sizeinch: 2.2, _version: record._version }); assert.equal(edit.status, 200, await edit.clone().text() + 'existing records edit normally');
});

test('the date filter is gone from Weld diameters and stays on the other lists', () => {
  const source = readFileSync(new URL('../client/records.tsx', import.meta.url), 'utf8');
  const pieces = source.split("{resourceKey !== 'diameters' && ");
  assert.equal(pieces.length, 3, 'the Filters button and the From / To date inputs are both skipped for diameters');
  assert.ok(pieces[1].startsWith('<button className={`btn small ${filtersOpen'), 'Filters button'); assert.ok(pieces[2].startsWith("<><FieldInput field={{name:'_from',label:'From date'"), 'date inputs');
  assert.ok(source.includes("name:'_to',label:'To date'"), 'the other lists keep their date range');
});

test('a weld prints its diameter as the record names it, and an EN main project prints DN <n>', () => {
  const store = hostedStore(); const rowsOf = () => Object.fromEntries(RESOURCES.map(entry => [entry.key, store.list(entry.key)])) as Record<string, Row[]>;
  const weld = store.list('welds').find(row => row.id === 'weld-31')!, iso = store.get('isometrics', String(weld.isoId)), project = store.get('projects', String(iso.projectId));
  const two = store.list('diameters').find(row => row.diameter === '2"')!; store.update('welds', weld.id, { diameterId: two.id }, weld._version, SYSTEM);
  assert.equal(weldLine(store.get('welds', weld.id), rowsOf()).diameter, '2"', 'ASME (inch): as before');
  const site = store.get('sites', String(project.siteId)); store.update('sites', site.id, { diameterStandard: EN }, site._version, SYSTEM);
  assert.equal(weldLine(store.get('welds', weld.id), rowsOf()).diameter, 'DN 50', 'EN (DN): the inch size prints as its DN');
  newSite(store, 'x', EN); const dn = store.list('diameters').find(row => row.diameter === 'DN 50')!; store.update('welds', weld.id, { diameterId: dn.id }, store.get('welds', weld.id)._version, SYSTEM);
  assert.equal(weldLine(store.get('welds', weld.id), rowsOf()).diameter, 'DN 50', 'a DN record prints its own text');
  assert.equal(diameterPrintLabel({ diameter: 'DN50', sizeinch: 2 }, {}), 'DN 50'); assert.equal(diameterPrintLabel({ diameter: '2"', sizeinch: 2 }, {}), ''); assert.equal(diameterPrintLabel({ diameter: '7"', sizeinch: 7 }, { diameterStandard: EN }), '');
});
