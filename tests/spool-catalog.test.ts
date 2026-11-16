import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { runAction } from '../server/workflows.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { seedSpoolNames } from '../server/spool-catalog.ts';
import { hostedDataSteps } from '../server/hosted-data-steps.ts';
import { SPOOL_CHOICE_MESSAGES, SPOOL_NAMES, firstUseSpool, missingSpoolNames, spoolChoiceError, spoolOptionsForIso } from '../shared/spool-catalog.ts';
import { CATALOG_SITES, CATALOG_WORDING, ENABLED_COLUMN, FORM_ENABLEMENT, NEW_RECORDS_OFF, SITE_ENABLED_RESOURCES, catalogFormLabels, enabledOnSite, pageSizes, rowDeleteLabel } from '../shared/weld-catalogs.ts';
import { DUPLICATE_PARTS } from '../shared/site-duplicate.ts';
import { PILOT_MAP, resourcePagePath } from '../shared/pilots.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { SITE_RULES } from '../shared/site-scope.ts';
import { RESOURCE_SCOPES } from '../shared/permissions.ts';
import type { Row } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const actor = { id: 'tester', name: 'Tester' };
const link = (recordId: string, siteId: string, enabled: boolean) => row(`${recordId}-${siteId}`, { resourceKey: SPOOL_NAMES, recordId, siteId, enabled });

// ---------------------------------------------------------------------------------------------------- definitions

test('weld-catalogs-welder-weld-034: Spools is a name catalog (Spool name*, Abbreviation*) enabled per site, in both pilots\' menus', () => {
  const resource = RESOURCE_MAP[SPOOL_NAMES];
  assert.deepEqual(resource.fields.map(field => [field.name, field.label, Boolean(field.required)]), [['name', 'Spool name', true], ['abbreviation', 'Abbreviation', true]]);
  assert.equal(resource.unique, undefined, 'duplicates are allowed (the reference lists SP22 three times)');
  assert.ok(SITE_ENABLED_RESOURCES.includes(SPOOL_NAMES) && NEW_RECORDS_OFF.includes(SPOOL_NAMES));
  assert.equal(FORM_ENABLEMENT[SPOOL_NAMES], false, 'the Add form\'s box starts unticked');
  assert.deepEqual(catalogFormLabels(SPOOL_NAMES, resource.fields, 'Zandbak'), ['Spool name', 'Abbreviation', 'Enable on this site (Zandbak)']);
  assert.deepEqual(CATALOG_WORDING[SPOOL_NAMES], { title: 'Spools', add: 'Add spool', edit: 'Edit spool', remove: 'Delete spool' });
  assert.equal(rowDeleteLabel(SPOOL_NAMES, false, true), 'Delete'); assert.deepEqual(pageSizes(SPOOL_NAMES, true), { sizes: [5, 20, 50, 100, 500], initial: 20 });
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const page = projectResource(hosted, resource);
  assert.equal(page.title, 'Spools'); assert.deepEqual(page.columns, ['name'], 'list: Spool name, then Enabled on this site (appended by the list)'); assert.equal(ENABLED_COLUMN, 'Enabled on this site');
  assert.deepEqual(page.fields.filter(field => !field.hidden).map(field => field.label), ['Spool name', 'Abbreviation']);
  assert.ok(hosted.navigation.includes(SPOOL_NAMES)); assert.ok(hosted.actions['save-weld'].includes('spoolName'));
  for (const [pilot, group] of [['weld', 'Weld data'], ['mto', 'Materials']] as const) {
    const item = PILOT_MAP[pilot].groups.find(entry => entry.title === group)!.items.find(entry => entry.label === 'Spools')!;
    assert.equal(item.resource, SPOOL_NAMES, `${pilot}: ${group} → Spools opens the catalog`);
  }
  assert.equal(resourcePagePath(SPOOL_NAMES), '/workspace/spool_names');
  assert.ok(RESOURCE_MAP.spools, 'the isometric spools stay for logistics'); assert.ok(hosted.resources.spools);
  for (const profile of ['welding-demo', 'access-prototype'] as const) assert.equal(availabilityFor(profile)!.resources[SPOOL_NAMES], undefined, `${profile} keeps its spools`);
  assert.equal(SITE_RULES[SPOOL_NAMES], 'global'); assert.deepEqual(RESOURCE_SCOPES[SPOOL_NAMES], ['10']); assert.ok(RESOURCE_SCOPES[CATALOG_SITES].includes('10'));
  assert.ok(RESOURCES.some(entry => entry.key === SPOOL_NAMES));
});

test('w1-left-13: Duplicate Project site offers Spools after Welders, copying the spool catalog\'s enablement', () => {
  const lists = DUPLICATE_PARTS.filter(part => part.group === 'Activated lists').map(part => part.label);
  assert.deepEqual(lists, ['NDT process', 'Weld types', 'WPS methods', 'Welders', 'Spools', 'Material supplier', 'NDT locations', 'PWHT process', 'PWHT locations', 'QA/QC engineers']);
  assert.equal(DUPLICATE_PARTS.find(part => part.key === 'spools')!.catalog, SPOOL_NAMES);
});

// ---------------------------------------------------------------------------------------------------- pure rules

test('weld-iso-welds-037: the Spool list = catalog names enabled on the main project minus names used on another isometric of the project', () => {
  const catalog = [row('n1', { name: 'Spool J' }), row('n2', { name: 'SP14' }), row('n3', { name: 'SP01' }), row('n4', { name: 'SP22' }), row('n5', { name: 'SP22' }), row('n6', { name: 'Old', _archived: true })];
  const rows = { catalog_sites: [link('n2', 'site-b', false), link('n1', 'site-b', false)] };
  const on = (siteId: string) => (entry: Row) => enabledOnSite(SPOOL_NAMES, entry, siteId, rows);
  // Project P: iso A uses Spool J, iso B uses SP01 and its own legacy spool "B-OWN"; project Q (other) uses SP14.
  const spools = [row('s1', { isoId: 'A', name: 'Spool J' }), row('s2', { isoId: 'B', name: 'SP01' }), row('s3', { isoId: 'B', name: 'B-OWN' }), row('s4', { isoId: 'A', name: 'SP22', _archived: true })];
  const names = (siteId: string, isoId: string, list = spools) => spoolOptionsForIso(catalog, on(siteId), list, isoId).map(option => option.name);
  assert.deepEqual(names('site-a', 'A'), ['Spool J', 'SP14', 'SP22'], 'iso A: SP01 is used on iso B of the project; one SP22 for the duplicates; archived names and spools do not count');
  assert.deepEqual(names('site-a', 'B'), ['SP14', 'SP01', 'SP22', 'B-OWN'], 'iso B: Spool J is used on iso A; its own spools stay offered, catalog or not');
  assert.deepEqual(names('site-a', 'C'), ['SP14', 'SP22'], 'a new isometric of the project');
  assert.deepEqual(names('site-a', 'Q1', []), ['Spool J', 'SP14', 'SP01', 'SP22'], 'an isometric of another project: every enabled name');
  assert.deepEqual(names('site-b', 'Q1', []), ['SP01', 'SP22'], 'a name switched off on site B is not offered there');
  assert.deepEqual(names('site-b', 'A'), ['SP22', 'Spool J'], 'a name used on this isometric stays offered even when switched off (after the enabled names)');
  assert.deepEqual(spoolOptionsForIso(catalog, on('site-a'), spools, 'B').find(option => option.name === 'SP01'), { name: 'SP01', spoolId: 's2' }, 'the isometric\'s own spool record');
  // The refusals behind the list (server side).
  assert.equal(spoolChoiceError('SP14', catalog, on('site-a'), spools, 'A'), '');
  assert.equal(spoolChoiceError('SP01', catalog, on('site-a'), spools, 'A'), SPOOL_CHOICE_MESSAGES.usedElsewhere);
  assert.equal(spoolChoiceError('SP14', catalog, on('site-b'), [], 'Q1'), SPOOL_CHOICE_MESSAGES.notEnabled);
  assert.equal(spoolChoiceError('Unknown', catalog, on('site-a'), spools, 'A'), SPOOL_CHOICE_MESSAGES.notEnabled);
  assert.equal(spoolChoiceError(7, catalog, on('site-a'), spools, 'A'), SPOOL_CHOICE_MESSAGES.text);
  assert.equal(spoolChoiceError('', catalog, on('site-a'), spools, 'A'), '', 'empty clears the spool');
  // First use: the isometric's spool of that name, else the record to create.
  assert.equal((firstUseSpool('B', 'SP01', spools) as { spool: Row }).spool.id, 's2');
  assert.deepEqual(firstUseSpool('A', ' SP14 ', spools), { create: { name: 'SP14', isoId: 'A' } });
  assert.deepEqual(firstUseSpool('A', 'SP22', spools), { create: { name: 'SP22', isoId: 'A' } }, 'an archived spool is not reused');
  assert.deepEqual(missingSpoolNames([row('a', { name: 'X' }), row('b', { name: 'Y' }), row('c', { name: 'X' }), row('d', { name: ' ' })], [row('k', { name: 'Y', _archived: true })]), [{ name: 'X', abbreviation: 'X' }]);
});

// ---------------------------------------------------------------------------------------------------- server

/** Every stored row of the record types the spool change touches, as stored (raw data, version, archived flag). */
const raw = (store: Store, keys = ['spools', 'welds', 'service_requests', 'spool_moves', 'test_systems', 'cut_list']) =>
  new Map(keys.map(key => [key, new Map((store.db.prepare(`SELECT id, data, version, archived FROM "${key}"`).all() as { id: string }[]).map(entry => [entry.id, JSON.stringify(entry)]))]));
const unchanged = (before: ReturnType<typeof raw>, after: ReturnType<typeof raw>) => {
  for (const [key, rows] of before) for (const [id, stored] of rows) assert.equal(after.get(key)!.get(id), stored, `${key} ${id} stays as stored`);
};

test('saving a weld with a new catalog name creates the isometric spool once; a second weld reuses it; another isometric of the project is refused', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const before = raw(store);
  const spools = () => store.list('spools').length;
  const count = spools();
  const save = (data: Record<string, unknown>) => runAction(store, 'save-weld', data, actor);
  // iso-1 and iso-2 belong to STX-2401 (North), iso-4 to STX-2402 (Riverside).
  const first = save({ isoId: 'iso-1', weldNo: 'S901', spoolName: 'SP-010' }).record!;
  assert.equal(spools(), count + 1, 'the isometric spool is created on first use');
  const spool = store.get('spools', first.spoolId);
  assert.deepEqual([spool.name, spool.isoId], ['SP-010', 'iso-1']);
  const second = save({ isoId: 'iso-1', weldNo: 'S902', spoolName: 'SP-010' }).record!;
  assert.equal(second.spoolId, spool.id, 'a second weld reuses it'); assert.equal(spools(), count + 1);
  // The name is now used on iso-1: refused on iso-2 of the same project (nothing created), allowed on a project of the other site.
  assert.throws(() => save({ isoId: 'iso-2', weldNo: 'S903', spoolName: 'SP-010' }), (error: { status?: number; message?: string; fields?: Record<string, string> }) => error.status === 422 && error.message === SPOOL_CHOICE_MESSAGES.usedElsewhere && Boolean(error.fields?.spoolId));
  assert.equal(store.list('welds').some(weld => weld.weldNo === 'S903'), false); assert.equal(spools(), count + 1);
  const river = save({ isoId: 'iso-4', weldNo: 'S904', spoolName: 'SP-010' }).record!;
  assert.equal(store.get('spools', river.spoolId).isoId, 'iso-4');
  // An existing spool of the isometric is picked by its name (SP-001 of iso-1); a name switched off on North is refused there.
  assert.equal(save({ isoId: 'iso-1', weldNo: 'S905', spoolName: 'SP-001' }).record!.spoolId, 'spool-1');
  store.create(CATALOG_SITES, { resourceKey: SPOOL_NAMES, recordId: 'spool-name-sp-011', siteId: 'site-north', enabled: false }, SYSTEM);
  assert.throws(() => save({ isoId: 'iso-1', weldNo: 'S906', spoolName: 'SP-011' }), /enabled on this main project/);
  assert.ok(save({ isoId: 'iso-4', weldNo: 'S906', spoolName: 'SP-011' }).record!.spoolId, 'still on for Riverside');
  // Edit weld: another name, then '' clears the spool; a special number that hides the spool ignores the name.
  const edited = save({ weldId: first.id, isoId: 'iso-1', spoolName: 'SP-012', expectedVersion: first._version }).record!;
  assert.equal(store.get('spools', edited.spoolId).name, 'SP-012');
  const cleared = save({ weldId: first.id, isoId: 'iso-1', spoolName: '', expectedVersion: edited._version }).record!;
  assert.equal(cleared.spoolId, '');
  const gap = save({ isoId: 'iso-1', weldNo: 'GAP1', spoolName: 'SP-009' }).record!;
  assert.ok(!gap.spoolId, 'a GAP number has no spool'); assert.ok(!store.list('spools').some(entry => entry.isoId === 'iso-1' && entry.name === 'SP-009'));
  // Old rows: every spool, weld, service request, move and test system stored before is exactly as it was.
  unchanged(before, raw(store));
});

test('old rows work unchanged: an older weld keeps its isometric spool, is edited without touching it, and its name is offered on its isometric', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  // An older workspace: no catalog at all, welds pointing at the isometric spools of the first version.
  store.db.exec(`DELETE FROM "${SPOOL_NAMES}"`);
  const before = raw(store);
  const old = store.get('welds', 'weld-1');
  assert.equal(old.spoolId, 'spool-1');
  const edited = runAction(store, 'save-weld', { weldId: old.id, isoId: old.isoId, description: 'Checked', expectedVersion: old._version }, actor).record!;
  assert.equal(edited.spoolId, 'spool-1', 'an edit that does not touch the spool keeps it');
  // Its own spool stays offered on its isometric although the catalog is empty; the same name is not offered on another isometric of the project.
  const projectIsos = new Set(store.list('isometrics').filter(iso => iso.projectId === store.get('isometrics', 'iso-1').projectId).map(iso => iso.id));
  const projectSpools = store.list('spools').filter(spool => projectIsos.has(String(spool.isoId)));
  assert.deepEqual(spoolOptionsForIso([], () => true, projectSpools, 'iso-1').map(option => [option.name, option.spoolId]), [['SP-001', 'spool-1']]);
  assert.equal(runAction(store, 'save-weld', { isoId: 'iso-1', weldNo: 'S910', spoolName: 'SP-001' }, actor).record!.spoolId, 'spool-1');
  assert.throws(() => runAction(store, 'save-weld', { isoId: 'iso-2', weldNo: 'S911', spoolName: 'SP-001' }, actor), (error: { status?: number; fields?: Record<string, string> }) => error.status === 422 && Boolean(error.fields?.spoolId), 'not in the catalog and not a spool of iso-2');
  // The plain spoolId of the first version still works (other profiles, older clients).
  assert.equal(runAction(store, 'save-weld', { isoId: 'iso-2', weldNo: 'S912', spoolId: 'spool-2' }, actor).record!.spoolId, 'spool-2');
  // Service requests, moves and test systems of the old spools stay readable and unchanged.
  assert.ok(store.list('service_requests').some(request => request.spoolId === 'spool-4'));
  const after = raw(store);
  for (const key of ['spools', 'service_requests', 'spool_moves', 'test_systems', 'cut_list']) assert.deepEqual(after.get(key), before.get(key), `${key}: nothing added, nothing changed`);
  for (const [id, stored] of before.get('welds')!) if (id !== old.id) assert.equal(after.get('welds')!.get(id), stored, `weld ${id} stays as stored`);
});

test('the upgrade step seeds the catalog from the distinct spool names once: dry run counts, a rerun adds nothing, spools and welds stay', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  store.db.exec(`DELETE FROM "${SPOOL_NAMES}"`);
  store.create('spools', { name: 'SP-001', isoId: 'iso-4' }, SYSTEM); // the same name on another isometric: one catalog entry
  const before = raw(store), distinct = new Set(store.list('spools').map(spool => String(spool.name))).size;
  assert.deepEqual(seedSpoolNames(store, { dryRun: true }), { spoolNamesAdded: distinct }, 'the dry run counts');
  assert.equal(store.list(SPOOL_NAMES).length, 0, 'and adds nothing');
  const step = hostedDataSteps(() => store).find(entry => entry.name === 'spoolNames')!;
  assert.deepEqual(step.run({ dryRun: false }), { spoolNamesAdded: distinct });
  const names = store.list(SPOOL_NAMES);
  assert.equal(names.length, distinct); assert.ok(names.every(entry => entry.abbreviation === entry.name));
  assert.deepEqual(store.list(CATALOG_SITES).filter(entry => entry.resourceKey === SPOOL_NAMES), [], 'no site links: enabled on every main project');
  assert.deepEqual(step.run({ dryRun: false }), { spoolNamesAdded: 0 }, 'a second run adds nothing'); assert.deepEqual(step.run({ dryRun: true }), { spoolNamesAdded: 0 });
  // A name deleted from the catalog (archived) is not brought back.
  const removed = names[0]; store.archive(SPOOL_NAMES, removed.id, removed._version, SYSTEM);
  assert.deepEqual(seedSpoolNames(store), { spoolNamesAdded: 0 });
  unchanged(before, raw(store));
  // A seeded sample workspace already holds every name.
  const sample = new Store(':memory:'); seed(sample);
  try { assert.deepEqual(seedSpoolNames(sample, { dryRun: true }), { spoolNamesAdded: 0 }); assert.ok(sample.list(SPOOL_NAMES).some(entry => entry.name === 'SP-010')); } finally { sample.close(); }
});

test('duplicating a site with Spools copies the spool catalog\'s enablement of the source site only', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  store.create(CATALOG_SITES, { resourceKey: SPOOL_NAMES, recordId: 'spool-name-sp-010', siteId: 'site-north', enabled: false }, SYSTEM);
  store.create(CATALOG_SITES, { resourceKey: SPOOL_NAMES, recordId: 'spool-name-sp-011', siteId: 'site-river', enabled: false }, SYSTEM);
  const copy = runAction(store, 'duplicate-site', { siteId: 'site-north', parts: ['spools'] }, SYSTEM).record!;
  const links = store.list(CATALOG_SITES).filter(entry => entry.siteId === copy.id);
  assert.deepEqual(links.map(entry => [entry.resourceKey, entry.recordId, entry.enabled]), [[SPOOL_NAMES, 'spool-name-sp-010', false]]);
  const rows = { [CATALOG_SITES]: store.list(CATALOG_SITES) };
  assert.equal(enabledOnSite(SPOOL_NAMES, { id: 'spool-name-sp-010' }, copy.id, rows), false); assert.equal(enabledOnSite(SPOOL_NAMES, { id: 'spool-name-sp-011' }, copy.id, rows), true);
  const without = runAction(store, 'duplicate-site', { siteId: 'site-north', parts: ['weldTypes'] }, SYSTEM).record!;
  assert.ok(!store.list(CATALOG_SITES).some(entry => entry.siteId === without.id && entry.resourceKey === SPOOL_NAMES), 'not ticked: nothing copied');
});

// ---------------------------------------------------------------------------------------------------- through HTTP

test('hosted: a new spool name starts off on other main projects, the weld form saves a catalog name, and a refused name stores nothing', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-spool-catalog-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Spool-Catalog-Test-Password';
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Spool admin', email: 'spool-admin@example.test', password })).status, 201);
  // Add spool with "Enable on this site (North)" ticked: on for North, off for every other main project.
  const added = await request(`/api/records/${SPOOL_NAMES}`, 'POST', { name: 'SP-020', abbreviation: 'S20', enabledOnSite: true, enabledSiteId: 'site-north' });
  assert.equal(added.status, 201, await added.clone().text());
  const name = ((await added.json()) as { record: Row }).record;
  const rows = { [CATALOG_SITES]: store.list(CATALOG_SITES) };
  assert.equal(enabledOnSite(SPOOL_NAMES, name, 'site-north', rows), true); assert.equal(enabledOnSite(SPOOL_NAMES, name, 'site-river', rows), false);
  assert.equal((await request(`/api/records/${SPOOL_NAMES}`, 'POST', { name: 'SP-021' })).status, 422, 'Abbreviation is required');
  const duplicate = await request(`/api/records/${SPOOL_NAMES}`, 'POST', { name: 'SP-020', abbreviation: 'S20' });
  assert.equal(duplicate.status, 201, 'duplicates are allowed');
  // The weld form sends the name; the server creates the isometric's spool and stores its id on the weld.
  const saved = await request('/api/actions/save-weld', 'POST', { isoId: 'iso-1', weldNo: 'H901', spoolName: 'SP-020' });
  assert.equal(saved.status, 201, await saved.clone().text());
  const weld = store.get('welds', ((await saved.json()) as { record: Row }).record.id);
  assert.equal(store.get('spools', weld.spoolId).name, 'SP-020');
  const spools = store.list('spools').length;
  const refused = await request('/api/actions/save-weld', 'POST', { isoId: 'iso-4', weldNo: 'H902', spoolName: 'SP-020' });
  assert.equal(refused.status, 422); assert.equal(((await refused.json()) as { error: string }).error, SPOOL_CHOICE_MESSAGES.notEnabled, 'off on Riverside');
  assert.equal(store.list('spools').length, spools); assert.ok(!store.list('welds').some(entry => entry.weldNo === 'H902'));
});
