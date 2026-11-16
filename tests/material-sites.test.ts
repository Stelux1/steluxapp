import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import {
  cleanImportPlan, changedSites, importFromSitePlan, linkOnAdd, materialOnSite, materialSiteIds, materialsOnSite, materialsUsedOnSite, siteLinkRows, takeOverLinks,
} from '../shared/material-sites.ts';
import { SITE_ENABLED_RESOURCES, UNFILTERED_OPTIONS, enabledOptions } from '../shared/weld-catalogs.ts';
import { SITE_RULES, SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import type { Row } from '../shared/types.ts';

// Sample data (server/seed.ts): North fabrication yard holds iso-1..3 and iso-7..10; Riverside installation holds iso-4..6.
const NORTH = 'site-north', RIVER = 'site-river';
const row = (id: string, data: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const link = (recordId: string, siteId: string, enabled = true) => row(`${recordId}-${siteId}`, { resourceKey: 'materials', recordId, siteId, enabled });
const SITES = [row(NORTH), row(RIVER)];

// ----- pure rules ---------------------------------------------------------------------------------------------------------

test('a material linked on A only is listed in A’s Material database and not in B’s; one without links is listed in both', () => {
  const materials = [row('only-north', { materialNo: 'N-1' }), row('legacy', { materialNo: 'L-1' }), row('off-river', { materialNo: 'O-1' }), row('gone', { materialNo: 'G-1', _archived: true })];
  const links = [link('only-north', NORTH), link('only-north', RIVER, false), link('off-river', RIVER, false), link('x', NORTH, false)];
  assert.deepEqual(materialsOnSite(materials, NORTH, links).map(m => m.id), ['only-north', 'legacy', 'off-river']);
  assert.deepEqual(materialsOnSite(materials, RIVER, links).map(m => m.id), ['legacy']);
  // A main project made later does not see a material that was linked to other main projects, only the older shared ones.
  assert.deepEqual(materialsOnSite(materials, 'site-new', links).map(m => m.id), ['legacy', 'off-river']);
  assert.equal(materialOnSite(materials[0], '', links), true, 'without a main project nothing is narrowed');
  assert.deepEqual(materialSiteIds(materials[0], SITES, links), [NORTH]);
  // Links of other catalogs and archived links do not count.
  assert.equal(materialOnSite(row('w'), RIVER, [row('l', { resourceKey: 'weld_types', recordId: 'w', siteId: RIVER, enabled: false }), { ...link('w', RIVER, false), _archived: true }]), true);
});

test('a change stores one explicit link per main project, so an older material keeps its other main projects', () => {
  const legacy = row('legacy');
  const next = changedSites(legacy, { [NORTH]: false }, SITES, []);
  assert.deepEqual([...next], [RIVER]);
  const { create, update } = siteLinkRows(legacy, next, SITES, []);
  assert.deepEqual([create, update], [[{ siteId: NORTH, enabled: false }, { siteId: RIVER, enabled: true }], []]);
  const links = [link('legacy', NORTH, false), link('legacy', RIVER)];
  assert.deepEqual(materialsOnSite([legacy], RIVER, links).length, 1);
  assert.deepEqual(siteLinkRows(legacy, new Set([NORTH, RIVER]), SITES, links).update.map(item => [item.link.siteId, item.enabled]), [[NORTH, true]]);
});

test('Add: a new Material No is created, one linked elsewhere is linked here (no copy), one already linked here is refused with its row', () => {
  const materials = [row('m1', { materialNo: 'M-1' }), row('m2', { materialNo: 'M-2' })];
  const links = [link('m1', NORTH), link('m1', RIVER, false)];
  assert.deepEqual(linkOnAdd('NEW-1', NORTH, materials, links), { kind: 'create' });
  assert.deepEqual(linkOnAdd(' M-1 ', RIVER, materials, links), { kind: 'link', material: materials[0] });
  assert.deepEqual(linkOnAdd('M-1', NORTH, materials, links), { kind: 'refused', material: materials[0] });
  assert.equal(linkOnAdd('M-2', RIVER, materials, links).kind, 'refused', 'an older material is on every main project');
  const takeOver = takeOverLinks(['M-1', 'M-2', 'NEW-1', 'NEW-1', ''], RIVER, materials, links);
  assert.deepEqual([takeOver.link.map(m => m.id), takeOver.create, takeOver.onSite.map(m => m.id)], [['m1'], ['NEW-1'], ['m2']]);
});

test('cleanImportPlan unlinks an unused material not in the file, keeps one used on an isometric of this site and lists it', () => {
  const rows = {
    projects: [row('p-north', { siteId: NORTH }), row('p-river', { siteId: RIVER })],
    isometrics: [row('iso-n', { projectId: 'p-north' }), row('iso-r', { projectId: 'p-river' })],
    iso_materials: [row('line-n', { isoId: 'iso-n', materialId: 'used-north' }), row('line-r', { isoId: 'iso-r', materialId: 'used-river' }), row('old', { isoId: 'iso-n', materialId: 'archived-line', _archived: true })],
    orders: [row('order-n', { projectId: 'p-north' })],
    order_lines: [row('ol', { orderId: 'order-n', materialId: 'ordered' })],
    warehouses: [row('wh-n', { siteId: NORTH })],
    stock: [row('st', { warehouseId: 'wh-n', materialId: 'stocked' }), row('st-r', { siteId: RIVER, materialId: 'used-river' })],
    certifications: [row('c', { siteId: NORTH, materialId: 'certified' })],
  };
  const used = materialsUsedOnSite(rows, NORTH);
  assert.deepEqual([...used].sort(), ['certified', 'ordered', 'stocked', 'used-north']);
  const materials = ['in-file', 'used-north', 'used-river', 'archived-line', 'ordered'].map((id, index) => row(id, { materialNo: `NO-${index}` }));
  const plan = cleanImportPlan(materials, ['NO-0', ' '], used);
  assert.deepEqual([plan.unlink.map(m => m.id), plan.kept.map(m => m.id)], [['used-river', 'archived-line'], ['used-north', 'ordered']]);
});

test('import-from-site links the source’s materials to the target and leaves the ones the target already has untouched', () => {
  const materials = [row('river-only'), row('both'), row('legacy'), row('north-only')];
  const links = [link('river-only', RIVER), link('river-only', NORTH, false), link('both', RIVER), link('both', NORTH), link('north-only', NORTH), link('north-only', RIVER, false)];
  assert.deepEqual(importFromSitePlan(materials, RIVER, NORTH, links).map(m => m.id), ['river-only']);
  assert.deepEqual(importFromSitePlan(materials, NORTH, NORTH, links), [], 'not from itself');
});

test('the material link narrows only the database: lines, orders and stock keep any material, so no reference is refused for its site', () => {
  assert.ok(SITE_ENABLED_RESOURCES.includes('materials') && UNFILTERED_OPTIONS.includes('materials'));
  assert.equal(SITE_RULES.materials, 'global', 'materials stay readable for the records that point at them');
  const options = [row('a'), row('b')];
  assert.deepEqual(enabledOptions('materials', options, RIVER, { catalog_sites: [link('a', RIVER, false)] }).map(m => m.id), ['a', 'b']);
});

// ----- the server ---------------------------------------------------------------------------------------------------------

const PASSWORD = 'Material-Sites-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-material-sites-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, method = 'GET', data?: unknown) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { request };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', 'POST', { name: 'Sites admin', email: 'sites-admin@example.test', password: PASSWORD })).status, 201);
  /** An MTO account limited to one main project, with full material rights there. */
  const limited = async (name: string, siteId: string) => {
    const profile = store.create('profiles', { name: `${name} profile`, generalPermission: 'Administration', materialsPermission: 'Administration', weldingPermission: 'No access', toolsPermission: 'No access', settingsPermission: 'No access' });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, profileId: profile.id, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC });
    store.create(USER_SITES, { userId: user.id, pilot: 'mto', siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client();
    assert.equal((await as.request('/auth/login', 'POST', { email: user.email, password: PASSWORD })).status, 200);
    return as;
  };
  const links = () => store.list('catalog_sites');
  const onSite = (siteId: string) => materialsOnSite(store.list('materials'), siteId, links()).map(m => String(m.materialNo)).sort();
  const add = (as: ReturnType<typeof client>, siteId: string, materialNo: string, extra: Record<string, unknown> = {}) => as.request('/records/materials', 'POST', { materialGroup: 'Pipe', materialNo, enabledOnSite: true, enabledSiteId: siteId, ...extra });
  return { store, admin, limited, onSite, add, links };
}
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;
type Listed = { rows: Row[] };

test('Add material belongs to the current main project; the same Material No is linked to another one, and refused where it already is', async t => {
  const f = await fixture(t);
  const legacyNorth = f.onSite(NORTH);
  assert.deepEqual(legacyNorth, f.onSite(RIVER), 'the sample materials have no links: every main project lists them');
  let response = await f.add(f.admin, NORTH, 'SITE-N-1');
  assert.equal(response.status, 201, await response.clone().text());
  const created = (await json<{ record: Row }>(response)).record;
  assert.ok(f.onSite(NORTH).includes('SITE-N-1') && !f.onSite(RIVER).includes('SITE-N-1'));
  assert.deepEqual(f.links().filter(l => l.recordId === created.id).map(l => [l.siteId, l.enabled]).sort(), [[NORTH, true], [RIVER, false]]);
  // Already in this project site's database: refused, and the page shows that row.
  response = await f.add(f.admin, NORTH, 'SITE-N-1', { description: 'Second try' });
  assert.equal(response.status, 422);
  const refused = await json<{ error: string; code?: string; fields?: Record<string, string> }>(response);
  assert.deepEqual([refused.code, Boolean(refused.fields?.materialNo)], ['material-on-site', true]);
  // In another project site's database: linked here, no second material, the existing row unchanged.
  const count = f.store.list('materials').length;
  response = await f.add(f.admin, RIVER, 'SITE-N-1', { description: 'Would overwrite' });
  assert.equal(response.status, 200);
  const linked = await json<{ record: Row; linked: boolean }>(response);
  assert.deepEqual([linked.linked, linked.record.id, f.store.list('materials').length, f.store.get('materials', created.id).description], [true, created.id, count, '']);
  assert.ok(f.onSite(RIVER).includes('SITE-N-1') && f.onSite(NORTH).includes('SITE-N-1'));
  // Without a main project nothing is added.
  assert.equal((await f.admin.request('/records/materials', 'POST', { materialGroup: 'Pipe', materialNo: 'NO-SITE' })).status, 422);
  assert.equal((await f.admin.request(`/records/materials/${created.id}`, 'PUT', { enabledOnSite: false, enabledSiteId: RIVER, _version: f.store.get('materials', created.id)._version })).status, 422, 'the sites change through Home location only');
});

test('an account limited to one main project never learns of materials linked only to another; lines, orders and stock keep resolving theirs', async t => {
  const f = await fixture(t);
  const north = (await json<{ record: Row }>(await f.add(f.admin, NORTH, 'NORTH-ONLY-1'))).record;
  const usedOnRiver = (await json<{ record: Row }>(await f.add(f.admin, NORTH, 'NORTH-USED-ON-RIVER'))).record;
  // A Riverside line, order line and inventory row point at a material of the North database only.
  const line = f.store.create('iso_materials', { isoId: 'iso-4', materialId: usedOnRiver.id, quantity: 2, phaseId: 'phase-0' }, SYSTEM);
  f.store.create('stock', { siteId: RIVER, materialId: usedOnRiver.id, quantity: 1 }, SYSTEM);
  const river = await f.limited('River materials', RIVER);
  const listed = (await json<Listed>(await river.request('/records/materials'))).rows.map(m => String(m.materialNo));
  assert.ok(!listed.includes('NORTH-ONLY-1'), 'not in the list');
  assert.ok(listed.includes('NORTH-USED-ON-RIVER'), 'a material its own isometric line points at keeps resolving');
  assert.ok(listed.includes(String(f.store.get('materials', 'material-4').materialNo)), 'older shared materials stay');
  const boot = await json<{ rows: Record<string, Row[]> }>(await river.request('/bootstrap'));
  assert.ok(!boot.rows.materials.some(m => m.id === north.id), 'not in the bootstrap either');
  assert.ok(boot.rows.iso_materials.some(item => item.id === line.id && item.materialId === usedOnRiver.id));
  assert.ok(boot.rows.stock.some(item => item.materialId === usedOnRiver.id));
  assert.ok(!(boot.rows.catalog_sites || []).some(item => item.siteId === NORTH), 'and no links of the other main project');
  // Opening, changing or deleting it by its id is refused like a record of another main project.
  assert.equal((await river.request(`/records/materials/${north.id}`, 'PUT', { description: 'x', _version: north._version })).status, 403);
  assert.equal((await river.request('/bulk/materials', 'POST', { ids: [north.id], changes: { dia: '4' }, versions: { [north.id]: north._version } })).status, 403);
  assert.equal((await river.request(`/materials/${north.id}/delete`, 'POST', { _version: north._version })).status, 403);
  assert.equal((await river.request('/material-sites', 'POST', { ids: [north.id], sites: { [RIVER]: true } })).status, 403);
  // Its own Add belongs to its own main project; the other main project's box is not its to tick.
  const own = await f.add(river, RIVER, 'RIVER-OWN-1');
  assert.equal(own.status, 201, await own.clone().text());
  assert.ok(f.onSite(RIVER).includes('RIVER-OWN-1') && !f.onSite(NORTH).includes('RIVER-OWN-1'));
  assert.equal((await river.request('/material-sites', 'POST', { ids: [(await json<{ record: Row }>(own)).record.id], sites: { [NORTH]: true } })).status, 403);
  assert.equal((await f.add(river, NORTH, 'RIVER-ON-NORTH')).status, 403);
});

test('Home location and Mass edit tick or untick main projects; only the sent boxes change', async t => {
  const f = await fixture(t);
  const [a, b] = ['material-2', 'material-3'];
  let response = await f.admin.request('/material-sites', 'POST', { ids: [a, b], sites: { [RIVER]: false } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await json<{ changed: number }>(response)).changed, 2);
  for (const id of [a, b]) assert.deepEqual(materialSiteIds({ id }, [{ id: NORTH }, { id: RIVER }], f.links()), [NORTH]);
  response = await f.admin.request('/material-sites', 'POST', { ids: [a], sites: { [RIVER]: true } });
  assert.equal((await json<{ changed: number }>(response)).changed, 1);
  assert.deepEqual(materialSiteIds({ id: a }, [{ id: NORTH }, { id: RIVER }], f.links()), [NORTH, RIVER]);
  assert.equal((await f.admin.request('/material-sites', 'POST', { ids: [a], sites: {} })).status, 422);
  assert.equal((await f.admin.request('/material-sites', 'POST', { ids: [a], sites: { [RIVER]: 'yes' } })).status, 422);
  // Mass edit of the fields still works next to it.
  const versions = Object.fromEntries([a, b].map(id => [id, f.store.get('materials', id)._version]));
  assert.equal((await f.admin.request('/bulk/materials', 'POST', { ids: [a, b], changes: { lbs: 'SCH 80' }, versions })).status, 200);
});

test('take-over links an existing Material No of another main project to this one without a duplicate, and points the line at it', async t => {
  const f = await fixture(t);
  const north = (await json<{ record: Row }>(await f.add(f.admin, NORTH, 'TAKE-N-1'))).record;
  const custom = f.store.create('iso_materials', { isoId: 'iso-4', customMaterial: true, materialNo: 'TAKE-N-1', description: 'Site-measured', materialGroup: 'Pipe', uom: 'EA', quantity: 3 }, SYSTEM);
  const preview = await json<{ rows: (Row & { values: Record<string, string>; error: object; warning: object; note?: string })[] }>(await f.admin.request('/material-import/take-over', 'POST', { siteId: RIVER, source: 'iso' }));
  const takeOver = preview.rows.find(item => item.values.materialNo === 'TAKE-N-1')!;
  assert.ok(takeOver, 'missing from the Riverside database although it exists for North');
  assert.deepEqual([Object.keys(takeOver.error), Object.keys(takeOver.warning), Boolean(takeOver.note)], [[], [], true]);
  const count = f.store.list('materials').length;
  const result = await json<Record<string, number>>(await f.admin.request('/material-import/commit', 'POST', { siteId: RIVER, rows: [takeOver] }));
  assert.deepEqual([result.committed, result.attached, result.linked, f.store.list('materials').length], [1, 1, 1, count]);
  assert.equal(f.store.get('iso_materials', custom.id).materialId, north.id);
  assert.ok(f.onSite(RIVER).includes('TAKE-N-1') && f.onSite(NORTH).includes('TAKE-N-1'));
});

async function workbook(lines: string[][]) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Materials'); sheet.addRow(['CC', 'Group', 'Article No', 'Material No', 'Description', 'DIA', 'LBS/SCH', 'UOM']); for (const line of lines) sheet.addRow(line);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('Clean import on one main project keeps the file and the used materials there, lists the used ones, and leaves the other main project unchanged', async t => {
  const f = await fixture(t);
  const riverBefore = f.onSite(RIVER);
  const material1 = String(f.store.get('materials', 'material-1').materialNo);
  const unusedNo = String(f.store.get('materials', 'material-10').materialNo);
  assert.ok(!f.store.list('iso_materials').some(line => line.materialId === 'material-10'), 'the sample material is not on any line');
  const form = new FormData(); form.set('siteId', NORTH); form.set('file', new Blob([await workbook([['1', 'PIPE', '', 'CLEAN-NEW-1', 'Pipe', '6', 'SCH 40', 'M'], ['', 'PIPE', '', material1, 'In the file', '', '', 'EA']])]), 'clean.xlsx');
  const preview = await json<{ rows: Row[] }>(await f.admin.request('/material-import/preview', 'POST', form));
  let response = await f.admin.request('/material-import/commit', 'POST', { siteId: NORTH, rows: preview.rows, options: { clean: true } });
  assert.equal(response.status, 201, await response.clone().text());
  const result = await json<{ committed: number; removed: number; kept: { materialNo: string }[] }>(response);
  const north = f.onSite(NORTH);
  assert.ok(north.includes('CLEAN-NEW-1') && north.includes(material1));
  assert.ok(!north.includes(unusedNo), 'an unused material not in the file is no longer on North');
  assert.ok(f.store.list('materials').some(m => m.id === 'material-10'), 'it still exists: only the link changed');
  const keptNos = result.kept.map(item => item.materialNo);
  assert.ok(keptNos.includes(String(f.store.get('materials', 'material-2').materialNo)), 'a material on a North isometric stays and is listed');
  assert.ok(!keptNos.includes(material1), 'a material of the file is not listed as kept');
  assert.ok(result.removed > 0 && keptNos.every(no => north.includes(no)));
  assert.deepEqual(f.onSite(RIVER), riverBefore, 'Riverside sees exactly what it saw before');
  // Existing lines keep their material whatever is linked.
  const line = f.store.list('iso_materials').find(item => item.materialId === 'material-4')!;
  assert.equal(f.store.get('materials', line.materialId).id, 'material-4');
  // A clean import needs the delete right and an uploaded file.
  assert.equal((await f.admin.request('/material-import/commit', 'POST', { siteId: NORTH, rows: [{ ...preview.rows[0], source: 'iso' }], options: { clean: true } })).status, 422);
  response = await f.admin.request('/material-import/commit', 'POST', { siteId: NORTH, rows: preview.rows, options: { clean: 'yes' } });
  assert.equal(response.status, 422);
});

test('Import Materials DB from another project site links the source’s materials to this one, without copies', async t => {
  const f = await fixture(t);
  const river = (await json<{ record: Row }>(await f.add(f.admin, RIVER, 'RIV-ONLY-1'))).record;
  const before = f.store.list('materials').length, legacyLinks = f.links().filter(l => l.recordId === 'material-5').length;
  let response = await f.admin.request('/material-sites/import', 'POST', { siteId: NORTH, sourceSiteId: RIVER });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await json<{ linked: number }>(response)).linked, 1);
  assert.equal(f.store.list('materials').length, before, 'no copies');
  assert.deepEqual(materialSiteIds(river, [{ id: NORTH }, { id: RIVER }], f.links()), [NORTH, RIVER]);
  assert.equal(f.links().filter(l => l.recordId === 'material-5').length, legacyLinks, 'materials both have already are untouched');
  response = await f.admin.request('/material-sites/import', 'POST', { siteId: NORTH, sourceSiteId: RIVER });
  assert.equal((await json<{ linked: number }>(response)).linked, 0);
  assert.equal((await f.admin.request('/material-sites/import', 'POST', { siteId: NORTH, sourceSiteId: NORTH })).status, 422);
  const limited = await f.limited('River importer', RIVER);
  assert.equal((await limited.request('/material-sites/import', 'POST', { siteId: RIVER, sourceSiteId: NORTH })).status, 403, 'not from a main project outside its access');
});
