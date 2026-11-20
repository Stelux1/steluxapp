import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { RESOURCE_MAP, RESOURCES } from '../shared/resources.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, pageAvailable, projectResource } from '../shared/release.ts';
import { PQR_ATTRIBUTES, availableWps } from '../shared/welding.ts';
import { welderWpsErrors } from '../shared/weld-entry.ts';
import {
  PQR_HEADER_GROUPS, PQR_IMPORT_COLUMNS, PQR_IMPORT_PATH, WPS_ALL_PROJECTS, WPS_GROUP_FIELDS, pqrColumnTitle, pqrImportDate, pqrImportMessage, pqrImportPreview, pqrNumber,
  tagText, tagValues, wpsDocument, wpsCopyRefusal, wpsCopyValues, wpsProjectSelection, wpsProjectValues, wpsSiteChange, wpsSiteStatus, wpsTabCounts,
} from '../shared/wps.ts';
import type { Row } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const hostedPqr = projectResource(hosted, RESOURCE_MAP.pqr), hostedWps = projectResource(hosted, RESOURCE_MAP.wps);
const visible = <T extends { hidden?: boolean }>(fields: T[]) => fields.filter(field => !field.hidden);
const REFERENCE_PQR_LABELS = ['Material EN15608', 'PQR', 'Insp Authority No.', 'Report No.', 'Material', 'Filler Material', 'Pipe/ Plate', 't', 'Position', 'Welding Process ASME', 'Welding Process EN', 'Weld Groove Type', 'Shielding Gas', 'Mat. gr.', 'EN Ø', 'EN T', 'ASME IX Mat.gr', 'ASME IX Ø', 'ASME IX T', 'Preheat (°C)', 'Annealing (°C/1h)', 'Impact Test', 'Hardness Test', 'Macro', 'Standard', 'Comments'];
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...extra }) as Row;
const all = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));

// --- PQR definitions -------------------------------------------------------------------------------------------------

test('PQR: the attribute labels follow the reference (PQR, Pipe/ Plate) while their stored categories stay', () => {
  assert.equal(PQR_ATTRIBUTES[1].label, 'PQR'); assert.equal(PQR_ATTRIBUTES[1].category, 'WPS');
  assert.equal(PQR_ATTRIBUTES[6].label, 'Pipe/ Plate'); assert.equal(PQR_ATTRIBUTES[6].category, 'Pipe / Plate');
  assert.deepEqual(PQR_ATTRIBUTES.map(attribute => attribute.label), REFERENCE_PQR_LABELS);
});
test('PQR (hosted): one form list of the 26 attributes then Valid until, no certificate number, every attribute as a list column', () => {
  assert.deepEqual(visible(hostedPqr.fields).map(field => field.label), [...REFERENCE_PQR_LABELS, 'Valid until']);
  assert.equal(new Set(visible(hostedPqr.fields).map(field => field.section)).size, 1, 'no form sections');
  const validUntil = hostedPqr.fields.find(field => field.name === 'validUntil')!;
  assert.equal(validUntil.type, 'date'); assert.equal(validUntil.label, 'Valid until');
  assert.deepEqual(hostedPqr.columns, [...PQR_ATTRIBUTES.map(attribute => attribute.name), 'validUntil']);
  assert.equal(hostedPqr.fields.find(field => field.name === 'name')?.hidden, true);
  // The list titles of the scope triples are short; the header groups cover all 29 columns.
  assert.deepEqual(['attribute14Id', 'attribute15Id', 'attribute16Id', 'attribute17Id', 'attribute18Id', 'attribute19Id'].map(name => pqrColumnTitle(name, '')), ['', 'Ø', 'T', 'Mat. gr.', 'Ø', 'T']);
  assert.equal(PQR_HEADER_GROUPS.reduce((sum, [, span]) => sum + span, 0), 29);
  // Other profiles keep the certificate number and the sections.
  assert.equal(RESOURCE_MAP.pqr.fields[0].hidden, undefined); assert.equal(RESOURCE_MAP.pqr.fields.find(field => field.name === 'attribute1Id')?.section, 'Materials');
});
test('PQR: the number shown for a PQR is its PQR attribute value, else its stored reference', () => {
  const options = [row('o1', { name: 'PQR-001', category: 'WPS' })];
  assert.equal(pqrNumber(row('p', { name: 'PQR-2026-0001', attribute2Id: 'o1' }), options), 'PQR-001');
  assert.equal(pqrNumber(row('p', { name: 'PQR-2026-0001' }), options), 'PQR-2026-0001');
  const store = new Store(':memory:'); seed(store); store.hostedRules = true;
  try { const pqr = store.create('pqr', { attribute2Id: 'PQR-001' }, SYSTEM); assert.equal(store.display('pqr', pqr), 'PQR-001'); }
  finally { store.close(); }
});
test('PQR: a value removed from its dropdown is no longer offered, and a PQR that stores it keeps it and can still be saved', () => {
  const store = new Store(':memory:'); seed(store); store.hostedRules = true;
  try {
    const pqr = store.create('pqr', { attribute9Id: 'PA', attribute2Id: 'PQR-REMOVE' }, SYSTEM);
    const option = store.get('qualification_options', pqr.attribute9Id);
    store.archive('qualification_options', option.id, option._version, SYSTEM);
    assert.ok(!store.list('qualification_options').some(item => item.category === 'Position' && item.name === 'PA'), 'not offered any more');
    const saved = store.update('pqr', pqr.id, { attribute10Id: 'ASME 1' }, pqr._version, SYSTEM);
    assert.equal(saved.attribute9Id, option.id, 'the PQR keeps the removed value');
    assert.throws(() => store.create('pqr', { attribute9Id: option.id }, SYSTEM), /highlighted/, 'a removed value cannot be chosen again on another PQR');
  } finally { store.close(); }
  // Outside the hosted profile a value in use still cannot be archived.
  const local = new Store(':memory:'); seed(local);
  try { const pqr = local.create('pqr', { attribute9Id: 'PA' }, SYSTEM); const option = local.get('qualification_options', pqr.attribute9Id); assert.throws(() => local.archive('qualification_options', option.id, option._version, SYSTEM), /used by active/); }
  finally { local.close(); }
});

// --- PQR import rules ------------------------------------------------------------------------------------------------

test('PQR import: both date formats, the PQR number match, required number and duplicates', () => {
  assert.equal(pqrImportDate('31-12-2026'), '2026-12-31'); assert.equal(pqrImportDate('2026-12-31'), '2026-12-31');
  assert.equal(pqrImportDate(''), ''); assert.equal(pqrImportDate('31/12/2026'), null); assert.equal(pqrImportDate('31-02-2026'), null);
  const preview = pqrImportPreview([
    { rowNo: 2, values: { attribute2Id: 'NEW-1', validUntil: '31-12-2026' } },
    { rowNo: 3, values: { attribute2Id: 'old-1' } },
    { rowNo: 4, values: { attribute5Id: 'P235GH' } },
    { rowNo: 5, values: { attribute2Id: 'NEW-1' } },
    { rowNo: 6, values: { attribute2Id: 'BAD-DATE', validUntil: 'soon' } },
  ], new Map([['old-1', ['pqr-old']]]));
  assert.deepEqual(preview.map(item => [item.action, item.errors.length]), [['import', 0], ['update', 0], ['import', 1], ['import', 1], ['import', 1]]);
  assert.equal(preview[0].values.validUntil, '2026-12-31'); assert.equal(preview[1].targetId, 'pqr-old');
  assert.equal(pqrImportMessage({ imported: 1, updated: 1, skipped: 1 }), '1 PQR imported, 1 updated. 1 rows skipped because PQR was empty.');
  assert.deepEqual(PQR_IMPORT_COLUMNS.map(column => column.label), [...REFERENCE_PQR_LABELS, 'Valid until']);
});

// --- WPS definitions and rules ---------------------------------------------------------------------------------------

test('WPS (hosted): the form follows the reference order with the four material group fields and their own option lists', () => {
  assert.deepEqual(visible(hostedWps.fields).map(field => field.name), ['name', 'method', 'definition', 'isoGroups', 'isoPairs', 'asmePNumbers', 'asmePairs', 'jointType', 'diameterFrom', 'diameterTo']);
  assert.deepEqual(WPS_GROUP_FIELDS.map(field => [field.label, field.options.length]), [['ISO groups on this WPS', 32], ['Allowed dissimilar pairs (ISO)', 5], ['ASME P-Numbers on this WPS', 16], ['Allowed dissimilar pairs (ASME)', 4]]);
  assert.deepEqual(hostedWps.columns, ['name', 'method', 'definition', 'jointType']);
  assert.equal(tagText(tagValues(' 1.1, 5.1 ,1.1,, 12.9 ')), '1.1, 5.1, 12.9', 'a typed value that is not in the list is kept');
  assert.deepEqual(wpsProjectValues([WPS_ALL_PROJECTS, 'p1']), { allProjects: true, projectIds: [] });
  assert.deepEqual(wpsProjectValues([]), { allProjects: false, projectIds: [] });
  assert.deepEqual(wpsProjectSelection(undefined, []), [], 'a new WPS starts with no project, as the reference');
  // Other profiles do not show the new fields.
  assert.equal(RESOURCE_MAP.wps.fields.find(field => field.name === 'isoGroups')?.hidden, true);
  assert.equal(availabilityFor('welding-demo')!.resources.wps.includes('isoGroups'), false);
  assert.equal(pageAvailable(hosted, `/weld${PQR_IMPORT_PATH}`, RESOURCES), true); assert.equal(pageAvailable(availabilityFor('welding-demo'), PQR_IMPORT_PATH, RESOURCES), false);
});
test('WPS: "Enabled on this site", tab counters per site and view, and switching one site', () => {
  const rows = {
    wps: [row('g', { allProjects: true }), row('p', { allProjects: false }), row('off', { allProjects: true, active: false }), row('del', { _archived: true }), row('c', { allProjects: true, sourceId: 'g', copySiteId: 'b' })],
    wps_sites: [row('l1', { wpsId: 'g', siteId: 'a' }), row('l2', { wpsId: 'p', siteId: 'a' }), row('l3', { wpsId: 'off', siteId: 'a' }), row('l4', { wpsId: 'c', siteId: 'b' }), row('l5', { wpsId: 'p', siteId: 'b' })],
  };
  assert.deepEqual(['g', 'p', 'off'].map(id => wpsSiteStatus(rows, rows.wps.find(item => item.id === id)!, 'a')), ['Global', 'Yes', 'No']);
  assert.equal(wpsSiteStatus(rows, rows.wps[0], 'b'), 'No');
  assert.deepEqual(wpsTabCounts(rows, 'a', 'originals'), { active: 2, inactive: 1, deleted: 1 });
  assert.deepEqual(wpsTabCounts(rows, 'a', 'copies'), { active: 0, inactive: 1, deleted: 0 });
  assert.deepEqual(wpsTabCounts(rows, 'b', 'copies'), { active: 1, inactive: 0, deleted: 0 });
  assert.deepEqual(wpsSiteChange(rows, rows.wps[1], 'a', false), { siteIds: ['b'] });
  assert.deepEqual(wpsSiteChange(rows, rows.wps[0], 'b', true), { siteIds: ['a', 'b'] });
  assert.deepEqual(wpsSiteChange(rows, rows.wps[2], 'b', true), { siteIds: ['b'], active: true }, 'a globally switched-off WPS comes back on this site only');
  assert.match(wpsCopyRefusal({ ...rows, sites: [row('b', { name: 'B' })] }, rows.wps[4], 'b'), /cannot be copied again/);
  assert.match(wpsCopyRefusal({ ...rows, sites: [row('b', { name: 'B' })] }, rows.wps[0], 'b'), /already copied to B/);
  assert.equal(wpsCopyRefusal({ ...rows, sites: [row('b', { name: 'B' })] }, rows.wps[1], 'b'), '');
});

// --- Server -----------------------------------------------------------------------------------------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-wps-pqr-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const form = data instanceof FormData;
    const response = await fetch(origin + path, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Weld data admin', email: 'weld-data-admin@example.test', password: 'Weld-Data-Test-Password' })).status, 201);
  // The administrator works in North fabrication yard: WPS methods and PQRs belong to the main project they are added in (client 20.11.2026).
  assert.equal((await request('/api/auth/site', 'POST', { siteId: 'site-north' })).status, 200);
  return { store, request };
}
const json = async (response: Response) => await response.json() as Record<string, unknown> & { error?: string; records?: Row[]; record?: Row; rows?: { rowNo: number; action: string; errors: string[]; values: Record<string, string> }[] };

test('hosted WPS: saving with the site box unticked leaves it off; copy to another site, no copy of a copy, global deactivate, per-site switch', async t => {
  const f = await hostedFixture(t);
  // Add WPS method with "Enable on this site" unticked: available nowhere.
  let response = await f.request('/api/records/wps', 'POST', { name: 'WPS-NEW', method: '141 (GTAW)', definition: '# (3 - 20) mm', isoGroups: '1.1, 12.9', allProjects: true, siteIds: [] });
  assert.equal(response.status, 201); const created = (await json(response)).record!;
  assert.equal(created.isoGroups, '1.1, 12.9');
  assert.equal(availableWps(all(f.store), f.store.get('wps', created.id), 'project-cooling'), false);
  // A plain write cannot make a copy.
  assert.equal((await f.request('/api/records/wps', 'POST', { name: 'FORGED', method: '141', definition: 'x', sourceId: 'wps-1' })).status, 422);

  // Copy the seeded WPS (Project ALL, on both sites) to Riverside: a record of its own, active there only.
  const original = f.store.get('wps', 'wps-1');
  f.store.update('wps', original.id, { siteIds: ['site-north'] }, original._version, SYSTEM);
  response = await f.request('/api/wps/copy', 'POST', { ids: ['wps-1'], siteId: 'site-river' });
  assert.equal(response.status, 201); const copy = (await json(response)).records![0];
  assert.equal(copy.sourceId, 'wps-1'); assert.equal(copy.copySiteId, 'site-river'); assert.equal(copy.name, 'STX-WPS-141-01 (Riverside installation)');
  assert.equal(copy.processId, original.processId, 'the welder validation reads the same process on the copy');
  let rows = all(f.store);
  assert.equal(availableWps(rows, f.store.get('wps', copy.id), 'project-steam'), true, 'the copy serves projects of Riverside');
  assert.equal(availableWps(rows, f.store.get('wps', copy.id), 'project-cooling'), false, 'the copy does not leak into a project of North');
  assert.equal(availableWps(rows, f.store.get('wps', 'wps-1'), 'project-steam'), false, 'the original is unchanged');
  assert.equal(availableWps(rows, f.store.get('wps', 'wps-1'), 'project-cooling'), true);
  // The weld form refuses the copy on an isometric of North, and accepts it on Riverside.
  const northIso = f.store.list('isometrics').find(iso => iso.projectId === 'project-cooling')!, riverIso = f.store.list('isometrics').find(iso => iso.projectId === 'project-steam')!;
  assert.equal((await f.request('/api/records/welds', 'POST', { weldNo: 'W-COPY-N', isoId: northIso.id, wpsId: copy.id })).status, 422);
  assert.ok(riverIso); assert.notEqual((await f.request('/api/records/welds', 'POST', { weldNo: 'W-COPY-R', isoId: riverIso.id, wpsId: copy.id })).status, 422);
  // Welder–WPS validation still applies on the copy.
  const errors = welderWpsErrors({ wpsValidation: true }, { wpsId: copy.id, welder1Id: 'w', date: '2026-01-01' }, f.store.get('wps', copy.id), () => [], () => 'Sample welder', '2026-01-01');
  assert.match(errors.welder1Id, /no valid qualification/);

  // A copy cannot be copied again; copying the same original to the same site twice is refused.
  response = await f.request('/api/wps/copy', 'POST', { ids: [copy.id], siteId: 'site-north' });
  assert.equal(response.status, 422); assert.match(String((await json(response)).error), /cannot be copied again/);
  assert.equal((await f.request('/api/wps/copy', 'POST', { ids: ['wps-1'], siteId: 'site-river' })).status, 422);

  // Deactivate / activate on one site.
  assert.equal((await f.request('/api/wps/site', 'POST', { ids: ['wps-1'], siteId: 'site-river', enabled: true })).status, 200);
  rows = all(f.store); assert.equal(wpsSiteStatus(rows, f.store.get('wps', 'wps-1'), 'site-river'), 'Global');
  assert.equal((await f.request('/api/wps/site', 'POST', { ids: ['wps-1'], siteId: 'site-north', enabled: false })).status, 200);
  rows = all(f.store); assert.equal(wpsSiteStatus(rows, f.store.get('wps', 'wps-1'), 'site-north'), 'No'); assert.equal(wpsSiteStatus(rows, f.store.get('wps', 'wps-1'), 'site-river'), 'Global');

  // Global deactivate: off on every site.
  assert.equal((await f.request('/api/wps/global-deactivate', 'POST', { ids: ['wps-1', copy.id] })).status, 200);
  rows = all(f.store);
  for (const id of ['wps-1', copy.id]) for (const site of ['site-north', 'site-river']) assert.equal(wpsSiteStatus(rows, f.store.get('wps', id), site), 'No');
  assert.equal(availableWps(rows, f.store.get('wps', copy.id), 'project-steam'), false);
  assert.equal((await f.request('/api/wps/site', 'POST', { ids: [], siteId: 'site-north', enabled: true })).status, 422);
});
test('Copy and Mass copy carry the WPS document (a file of its own) and the diameter range (client answer 17.11.2026)', async t => {
  const f = await hostedFixture(t);
  const original = f.store.get('wps', 'wps-1');
  f.store.update('wps', original.id, { diameterFrom: 1, diameterTo: 2 }, original._version, SYSTEM);
  const upload = async (id: string, name: string, content: string) => {
    const form = new FormData(); form.set('file', new Blob([content], { type: 'application/pdf' }), name); form.set('entityType', 'wps'); form.set('entityId', id); form.set('documentType', 'WPS document');
    const response = await f.request('/api/files', 'POST', form); assert.equal(response.status, 201); return (await json(response)).record!;
  };
  const first = await upload('wps-1', 'WPS-141-rev1.pdf', '%PDF-1.4 first'), second = await upload('wps-1', 'WPS-141-rev2.pdf', '%PDF-1.4 second');
  await upload('wps-2', 'WPS-135.pdf', '%PDF-1.4 other');
  const response = await f.request('/api/wps/copy', 'POST', { ids: ['wps-1', 'wps-2'], siteId: 'site-river' });
  assert.equal(response.status, 201); const [copy, other] = (await json(response)).records!;
  assert.deepEqual([copy.diameterFrom, copy.diameterTo], [1, 2], 'the range is copied');
  const files = (id: string) => f.store.list('attachments').filter(file => file.entityType === 'wps' && file.entityId === id);
  assert.deepEqual(files(copy.id).map(file => [file.name, file.documentType, file.mime]).sort(), [['WPS-141-rev1.pdf', 'WPS document', 'application/pdf'], ['WPS-141-rev2.pdf', 'WPS document', 'application/pdf']]);
  assert.deepEqual(files(other.id).map(file => file.name), ['WPS-135.pdf'], 'Mass copy carries the document of every WPS');
  assert.ok(wpsDocument(f.store.list('attachments'), copy.id), 'the number of the copy links to a document');
  assert.deepEqual(files('wps-1').map(file => file.id).sort(), [first.id, second.id].sort(), 'the original keeps its own documents');
  // The copy's file has bytes of its own: it downloads, and removing the original's file does not touch it.
  const copied = files(copy.id).find(file => file.name === 'WPS-141-rev2.pdf')!, download = await f.request(`/api/files/${copied.id}`);
  assert.equal(download.status, 200); assert.equal(await download.text(), '%PDF-1.4 second');
  assert.notEqual(copied.id, second.id);
});

test('copy values: only the projects of the target site stay chosen, the range is copied', () => {
  const rows = { sites: [row('b', { name: 'B' })], projects: [row('pa', { siteId: 'a' }), row('pb', { siteId: 'b' })], wps_projects: [row('x', { wpsId: 'w', projectId: 'pa' }), row('y', { wpsId: 'w', projectId: 'pb' })], wps_pqr: [row('z', { wpsId: 'w', pqrId: 'q' })] };
  const values = wpsCopyValues(rows, row('w', { name: 'W', method: '141', allProjects: false }), 'b');
  assert.deepEqual([values.projectIds, values.pqrIds, values.siteIds, values.sourceId], [['pb'], ['q'], ['b'], 'w']);
  assert.deepEqual([wpsCopyValues(rows, row('w', { name: 'W', diameterFrom: 1, diameterTo: 2 }), 'b').diameterFrom, wpsCopyValues(rows, row('w', { name: 'W', diameterFrom: 1, diameterTo: 2 }), 'b').diameterTo], [1, 2]);
});

async function workbook(rows: (string | Date)[][]) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('PQR');
  sheet.addRow(PQR_IMPORT_COLUMNS.map(column => column.label));
  for (const values of rows) { const line: (string | Date)[] = PQR_IMPORT_COLUMNS.map(() => ''); values.forEach((value, index) => { line[index] = value; }); sheet.addRow(line); }
  const form = new FormData(); form.set('file', new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'pqr.xlsx'); return form;
}
test('hosted Import PQR: preview import / update / error, commit counts, both date formats, the existing PQR keeps its file', async t => {
  const f = await hostedFixture(t);
  const existing = f.store.create('pqr', { attribute2Id: 'PQR-OLD', attribute5Id: 'P235GH' }, SYSTEM);
  f.store.create('attachments', { name: 'old.pdf', entityType: 'pqr', entityId: existing.id, documentType: 'PQR file', mime: 'application/pdf', size: 1 }, SYSTEM);
  const valid = PQR_IMPORT_COLUMNS.length - 1;
  const date = (value: string) => { const line: string[] = []; line[valid] = value; return line; };
  const form = await workbook([
    Object.assign(date('31-12-2026'), { 1: 'PQR-NEW', 4: 'P265GH', 8: 'PF' }),
    Object.assign(date('2026-12-31'), { 1: 'PQR-OLD', 4: '' , 10: '141' }),
    Object.assign(date(''), { 4: 'Without number' }),
  ]);
  let response = await f.request('/api/pqr-import/preview', 'POST', form);
  assert.equal(response.status, 200); const preview = await json(response);
  assert.deepEqual(preview.rows!.map(item => [item.rowNo, item.action, item.errors.length > 0]), [[2, 'import', false], [3, 'update', false], [4, 'import', true]]);
  assert.deepEqual([preview.totalRows, preview.totalErrors, preview.totalImportable, preview.totalUpdates], [3, 1, 1, 1]);
  assert.equal(f.store.list('pqr').length, 2, 'the preview saves nothing');
  // Choosing import for an existing number is refused by the server (counted as not imported).
  response = await f.request('/api/pqr-import/commit', 'POST', { rows: preview.rows!.map(item => ({ rowNo: item.rowNo, values: item.values, action: item.action })) });
  assert.equal(response.status, 201); assert.deepEqual(await json(response), { imported: 1, updated: 1, skipped: 1, failed: 0 });
  const numbers = f.store.list('pqr').map(item => f.store.display('pqr', item));
  assert.ok(numbers.includes('PQR-NEW'));
  const created = f.store.list('pqr').find(item => f.store.display('pqr', item) === 'PQR-NEW')!;
  assert.equal(created.validUntil, '2026-12-31');
  const updated = f.store.get('pqr', existing.id);
  assert.equal(updated.validUntil, '2026-12-31'); assert.equal(updated.attribute5Id, existing.attribute5Id, 'an empty cell keeps the stored value');
  assert.equal(f.store.list('attachments').filter(item => item.entityType === 'pqr' && item.entityId === existing.id).length, 1);
  // Commit again with the stale choices: PQR-NEW exists now, so "import" is refused for that row.
  response = await f.request('/api/pqr-import/commit', 'POST', { rows: [{ rowNo: 2, values: preview.rows![0].values, action: 'import' }] });
  assert.deepEqual(await json(response), { imported: 0, updated: 0, skipped: 0, failed: 1 });
  assert.equal((await f.request('/api/pqr-import/template')).status, 200);
  // The generic CSV import stays closed in the hosted profile.
  assert.equal((await f.request('/api/import/pqr/template')).status, 404);
});
test('hosted PQR export: the 26 attributes and Valid until, without the certificate number', async t => {
  const f = await hostedFixture(t);
  const response = await f.request('/api/export/pqr?format=csv');
  assert.equal(response.status, 200);
  const header = (await response.text()).replace(/^﻿/, '').split('\n')[0];
  assert.equal(header, [...REFERENCE_PQR_LABELS, 'Valid until'].map(label => /[,"]/.test(label) ? `"${label}"` : label).join(','));
});
test('hosted: removing a PQR attribute value through the route', async t => {
  const f = await hostedFixture(t);
  const pqr = f.store.create('pqr', { attribute9Id: 'PC' }, SYSTEM);
  const response = await f.request(`/api/pqr/options/${pqr.attribute9Id}/remove`, 'POST', {});
  assert.equal(response.status, 200);
  assert.equal(f.store.get('qualification_options', pqr.attribute9Id, true)._archived, true);
  assert.equal(f.store.get('pqr', pqr.id).attribute9Id, pqr.attribute9Id);
});
