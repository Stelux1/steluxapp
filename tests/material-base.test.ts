import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { runAction } from '../server/workflows.ts';
import { applyBaseMaterials, articlePrefix, baseFileProblems } from '../server/material-base.ts';
import { MATERIAL_DB_BASE } from '../shared/data/material-db-base.ts';
import { ARTICLE_PREFIX_DEFAULT, ARTICLE_PREFIX_ERROR, articlePrefixError, articlePrefixOf, baseKey, baseMaterials, normalizeArticlePrefix } from '../shared/material-base.ts';
import { materialsOnSite } from '../shared/material-sites.ts';
import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import type { Row } from '../shared/types.ts';

const actor = { id: 'tester', name: 'Tester' };
const BASE = baseMaterials(MATERIAL_DB_BASE);
/** The materials a main project sees; `own` leaves out the older materials without any link, which every main project sees. */
const onSite = (store: Store, siteId: string) => materialsOnSite(store.list('materials'), siteId, store.list(CATALOG_SITES));
const baseOn = (store: Store, siteId: string) => onSite(store, siteId).filter(row => /^[A-Z0-9]{1,6}\d{6}$/.test(String(row.articleNo)) && MATERIAL_DB_BASE.rows.some(item => item[3] === row.materialNo));
const articles = (rows: Row[]) => rows.map(row => String(row.articleNo)).filter(Boolean).sort();

test('the base file holds the 7264 materials of the client Excel: unique Material No, six-digit article numbers, no empty group', () => {
  assert.equal(BASE.length, 7264);
  assert.deepEqual(baseFileProblems(), []);
  assert.equal(new Set(BASE.map(item => item.materialNo)).size, 7264);
  assert.equal(BASE[0].articleDigits, '000001'); assert.equal(BASE[0].materialNo, 'p8s20'); assert.equal(BASE.at(-1)!.articleDigits, '007264');
  assert.deepEqual([...new Set(BASE.map(item => item.uom))].sort(), ['EA', 'M']);
  const parts = new Set(BASE.map(item => baseKey(item.partMaterial)));
  assert.equal(parts.size, MATERIAL_DB_BASE.parts.length, 'no two parts that differ only in case or spacing');
  assert.ok(BASE.every(item => item.description === item.description.trim() && item.partMaterial === item.partMaterial.trim()), 'values are trimmed');
});

test('Article No prefix: default SC, upper case, letters and digits only, at most six characters', () => {
  assert.equal(ARTICLE_PREFIX_DEFAULT, 'SC'); assert.equal(articlePrefixOf(undefined), 'SC'); assert.equal(articlePrefixOf({ articlePrefix: ' ab1 ' }), 'AB1'); assert.equal(articlePrefixOf({ articlePrefix: '' }), 'SC');
  assert.equal(normalizeArticlePrefix(' sc '), 'SC');
  for (const good of ['SC', 'A', 'NLB', 'AB12CD']) assert.equal(articlePrefixError(good), '', good);
  for (const bad of ['', 'ABCDEFG', 'S C', 'SC-', 'SČ']) assert.equal(articlePrefixError(bad), ARTICLE_PREFIX_ERROR, bad);
  assert.ok(RESOURCE_MAP.company_data.fields.some(field => field.name === 'articlePrefix' && field.label === 'Article No prefix' && field.default === 'SC' && /afterwards/.test(field.hint ?? '')));
});

test('company data saves the prefix upper case and refuses an invalid one', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const record = store.create('company_data', { name: 'Stelux Construct', articlePrefix: ' sc ' }, actor);
  assert.equal(record.articlePrefix, 'SC'); assert.equal(articlePrefix(store), 'SC');
  assert.throws(() => store.update('company_data', record.id, { articlePrefix: 'TOO-LONG!' }, record._version, actor), error => (error as { fields?: Record<string, string> }).fields?.articlePrefix === ARTICLE_PREFIX_ERROR);
  assert.throws(() => store.update('company_data', record.id, { articlePrefix: '' }, record._version, actor), error => (error as { fields?: Record<string, string> }).fields?.articlePrefix === ARTICLE_PREFIX_ERROR);
  assert.equal(store.create('company_data', { name: 'No prefix given' }, actor, 'second').articlePrefix, 'SC', 'a record saved without a prefix gets the default');
});

test('a new main project gets all 7264 materials as SC000001 … SC007264 with part, type, group, diameter, LBS and UOM, in one fast transaction', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const beforeMaterials = store.list('materials').length, northBefore = onSite(store, 'site-north').map(row => row.id).sort(), riverBefore = onSite(store, 'site-river').map(row => row.id).sort();
  const parts = store.list('material_parts').length, types = store.list('material_types').length;
  const site = store.create('sites', { name: 'Impala Tank Terminal' }, actor);
  const started = Date.now(); const result = applyBaseMaterials(store, site.id, actor); const took = Date.now() - started;
  assert.ok(took < 15_000, `inserting the base took ${took} ms`);
  assert.equal(result.created, 7264); assert.equal(result.linked, 0); assert.equal(result.prefix, 'SC');
  assert.equal(store.list('materials').length, beforeMaterials + 7264);
  const here = baseOn(store, site.id);
  assert.equal(here.length, 7264, 'the new main project sees all base materials');
  assert.equal(onSite(store, site.id).length, 7264 + beforeMaterials, 'plus the older materials without a link, which every main project sees');
  assert.deepEqual(articles(here), BASE.map(item => `SC${item.articleDigits}`).sort());
  const first = here.find(row => row.articleNo === 'SC000001')!;
  assert.equal(first.materialNo, 'p8s20'); assert.equal(first.materialGroup, 'PIPE'); assert.equal(first.dia, '8in'); assert.equal(first.lbs, 'SCH 20'); assert.equal(first.uom, 'M'); assert.equal(first.description, 'Pipe SMLS 8in SCH 20');
  assert.equal(store.get('material_parts', first.partId).name, 'Pipe'); assert.equal(store.get('material_types', first.typeId).name, 'A106 Gr. B'); assert.equal(store.get('uoms', first.uomId).name, 'M');
  assert.equal(result.parts, store.list('material_parts').length - parts); assert.equal(result.types, store.list('material_types').length - types);
  assert.ok(result.parts > 0 && result.types > 0 && result.parts <= 41 && result.types <= 2);
  assert.ok(here.every(row => row.partId && row.uom && row.uomId), 'every base material has a part and a unit');
  // Existing main projects are untouched.
  assert.deepEqual(onSite(store, 'site-north').map(row => row.id).sort(), northBefore); assert.deepEqual(onSite(store, 'site-river').map(row => row.id).sort(), riverBefore);
  assert.ok(!here.some(row => northBefore.includes(row.id)), 'the base is not available on the existing main projects');
  console.log(`base materials: ${took} ms, +${result.parts} parts, +${result.types} types, +${result.uoms} uoms`);
});

test('a second main project shares the catalog rows (Material No is unique); the prefix applies to materials created after the change; the first project is untouched', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const small = { ...MATERIAL_DB_BASE, rows: MATERIAL_DB_BASE.rows.slice(0, 3) };
  store.create('company_data', { name: 'Stelux Construct' }, actor);
  const first = store.create('sites', { name: 'First' }, actor); applyBaseMaterials(store, first.id, actor, small);
  assert.deepEqual(articles(onSite(store, first.id)), ['SC000001', 'SC000002', 'SC000003']);
  const company = store.list('company_data')[0]; store.update('company_data', company.id, { articlePrefix: 'ab' }, company._version, actor);
  const second = store.create('sites', { name: 'Second' }, actor); const result = applyBaseMaterials(store, second.id, actor, small);
  assert.deepEqual([result.created, result.linked, result.prefix], [0, 3, 'AB']);
  assert.equal(store.list('materials').length, 3, 'no copy: the materials exist once');
  assert.deepEqual(onSite(store, second.id).map(row => row.id).sort(), onSite(store, first.id).map(row => row.id).sort());
  assert.deepEqual(articles(onSite(store, first.id)), ['SC000001', 'SC000002', 'SC000003'], 'existing Article Nos are not rewritten');
  // A third file with new Material Nos is created with the changed prefix.
  const extra = { ...small, rows: MATERIAL_DB_BASE.rows.slice(3, 5) };
  const third = store.create('sites', { name: 'Third' }, actor); assert.equal(applyBaseMaterials(store, third.id, actor, extra).created, 2);
  assert.deepEqual(articles(onSite(store, third.id)), ['AB000004', 'AB000005']);
  assert.equal(onSite(store, first.id).length, 3, 'the first main project does not see the later materials');
  // Running it again for the same project adds nothing.
  assert.deepEqual([applyBaseMaterials(store, third.id, actor, extra).created, store.list('materials').length], [0, 5]);
});

test('a material of the workspace with the same Material No is linked, not replaced', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const mine = store.create('materials', { materialNo: 'p8s20', description: 'My own pipe', uom: 'M', articleNo: 'X1' }, actor);
  const site = store.create('sites', { name: 'S' }, actor);
  const result = applyBaseMaterials(store, site.id, actor, { ...MATERIAL_DB_BASE, rows: MATERIAL_DB_BASE.rows.slice(0, 2) });
  assert.deepEqual([result.created, result.alreadyAvailable], [1, 1], 'an unlinked material is available everywhere already');
  assert.equal(store.get('materials', mine.id).articleNo, 'X1'); assert.equal(store.get('materials', mine.id).description, 'My own pipe');
});

test('Duplicate project site starts the copy with the base materials, like any new main project', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const northBefore = onSite(store, 'site-north').length;
  const copy = runAction(store, 'duplicate-site', { siteId: 'site-north', parts: ['projectSettings', 'spools'] }, SYSTEM).record!;
  assert.equal(baseOn(store, copy.id).length, 7264); assert.ok(articles(baseOn(store, copy.id)).every(value => /^SC\d{6}$/.test(value)));
  assert.equal(onSite(store, 'site-north').length, northBefore, 'the source main project keeps its own materials');
});

test('hosted: Add project site gives the base materials; Company data refuses a bad prefix', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-material-base-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Base admin', email: 'base-admin@example.test', password: 'Material-Base-Test-Password' })).status, 201);
  const company = await request('/api/records/company_data', 'POST', { name: 'Stelux Construct', address: 'Havenstraat 1', articlePrefix: 'sc' });
  assert.equal(company.status, 201, await company.clone().text()); const saved = ((await company.json()) as { record: Row }).record;
  assert.equal(saved.articlePrefix, 'SC');
  const bad = await request(`/api/records/company_data/${saved.id}`, 'PUT', { name: 'Stelux Construct', address: 'Havenstraat 1', articlePrefix: 'NOT VALID', _version: saved._version });
  assert.equal(bad.status, 422); assert.equal(((await bad.json()) as { fields?: Record<string, string> }).fields?.articlePrefix, ARTICLE_PREFIX_ERROR);
  const added = await request('/api/records/sites', 'POST', { name: 'Impala Tank Terminal', address: 'Kade 5', zip: '3089 KB', residence: 'Rotterdam', phone: '+31 10 555 0100', email: 'impala@example.test' });
  assert.equal(added.status, 201, await added.clone().text());
  const site = ((await added.json()) as { record: Row }).record;
  assert.equal(baseOn(store, site.id).length, 7264); assert.ok(onSite(store, site.id).some(row => row.articleNo === 'SC007264'));
});
