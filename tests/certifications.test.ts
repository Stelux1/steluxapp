import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { SiteScope } from '../server/site-scope.ts';
import { zipArchive } from '../server/certifications.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { canResource, pilotBoundary } from '../shared/permissions.ts';
import { projectScope } from '../shared/project-scope.ts';
import { SITE_RULES, USER_SITES } from '../shared/site-scope.ts';
import { CERTIFICATE_FORM_FIELDS, certificateBasicMaterial, certificateMandatoryErrors, flagBulkChanges, certificateUses, diameterIdFor, inOwnerSite, nextSiteIndexNumber, ownerSites } from '../shared/welder-data.ts';
import { CERTIFICATE_IMPORT_COLUMNS, importRow } from '../shared/certifications.ts';
import type { Module, Row, User } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const account = (permissions: Partial<Record<Module, number>>, availability = hosted): User => ({ id: 'u', name: 'Test', email: 't@example.test', profileId: 'p', availability, permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...permissions } });

test('certificates and welding wires belong to one main project; older ones follow their linked projects', () => {
  const projects = [row('p-north', { siteId: 'site-north' }), row('p-north-2', { siteId: 'site-north' }), row('p-river', { siteId: 'site-river' })];
  const links = [row('l1', { certificateId: 'legacy-north', projectId: 'p-north' }), row('l2', { certificateId: 'legacy-both', projectId: 'p-north-2' }), row('l3', { certificateId: 'legacy-both', projectId: 'p-river' })];
  const rows = { links, projects };
  assert.deepEqual(ownerSites('certifications', row('own', { siteId: 'site-river', allProjects: true }), rows), ['site-river']);
  assert.deepEqual(ownerSites('certifications', row('legacy-north', { allProjects: false }), rows), ['site-north']);
  assert.deepEqual(ownerSites('certifications', row('legacy-both', { allProjects: false }), rows), ['site-north', 'site-river']);
  assert.equal(ownerSites('certifications', row('legacy-all', { allProjects: true }), rows), 'all', 'an older certificate for all projects stays shared');
  assert.equal(ownerSites('certifications', row('legacy-none', { allProjects: false }), rows), 'all');
  // The workspace of a main project keeps its own certificates and wires and the shared older ones.
  const certifications = [row('north', { siteId: 'site-north' }), row('river', { siteId: 'site-river' }), row('legacy-north', { allProjects: false }), row('legacy-all', { allProjects: true })];
  const scoped = projectScope({ sites: [row('site-north'), row('site-river')], projects, certifications, certificate_projects: links, welding_wires: [row('w-north', { siteId: 'site-north' }), row('w-river', { siteId: 'site-river' })], attachments: [row('a1', { entityType: 'certifications', entityId: 'river' }), row('a2', { entityType: 'certifications', entityId: 'north' })] }, 'site-north');
  assert.deepEqual(scoped.certifications.map(item => item.id), ['north', 'legacy-north', 'legacy-all']);
  assert.deepEqual(scoped.welding_wires.map(item => item.id), ['w-north']);
  assert.deepEqual(scoped.attachments.map(item => item.id), ['a2'], 'the file of another main project\'s certificate is left out');
  assert.ok(!inOwnerSite('certifications', certifications[1], 'site-north', rows));
  // Index numbers restart per main project.
  const records = [row('a', { siteId: 'site-north', indexNo: '0001' }), row('b', { siteId: 'site-north', indexNo: '0002' }), row('c', { siteId: 'site-river', indexNo: '0001' })];
  assert.equal(nextSiteIndexNumber('certifications', 'indexNo', 'site-river', records, rows), '0002');
  assert.equal(nextSiteIndexNumber('certifications', 'indexNo', 'site-north', records, rows), '0003');
  // The rule table: both resources follow their siteId, and an older record without one is shared.
  assert.deepEqual(SITE_RULES.certifications, { via: [['siteId', 'sites']], orphan: 'global' });
  assert.deepEqual(SITE_RULES.welding_wires, { via: [['siteId', 'sites']], orphan: 'global' });
});

test('mandatory fields follow the certificate\'s own main project', () => {
  const sites = [row('s-on', { mandatoryFields: true }), row('s-off', { mandatoryFields: false })];
  const projects = [row('p-on', { siteId: 's-on' }), row('p-off', { siteId: 's-off' })];
  // For all projects, but owned by a main project without the setting: nothing extra (the old rule refused it because s-on has it).
  assert.deepEqual(certificateMandatoryErrors({ siteId: 's-off', allProjects: true }, [], projects, sites), {});
  assert.deepEqual(Object.keys(certificateMandatoryErrors({ siteId: 's-on', allProjects: false }, ['p-off'], projects, sites)).length, 7);
});

test('certificate form, list headers, derived values and the Controlled / Accepted changes', () => {
  const view = projectResource(hosted, RESOURCE_MAP.certifications);
  // The Add certification form of the reference (capture weld__material__certifications.txt:69-118), in its order.
  assert.deepEqual(CERTIFICATE_FORM_FIELDS, ['chargeNo', 'name', 'materialId', 'diameterId', 'materialPartId', 'materialTypeId', 'schedule', 'wallThickness', 'hotYield', 'impactStrength', 'certType', 'supplierId', 'allProjects', 'projectIds', 'controlled', 'accepted', 'description']);
  const label = (name: string) => view.fields.find(field => field.name === name)?.label;
  assert.deepEqual(['chargeNo', 'name', 'materialId', 'diameterId', 'certType', 'description'].map(label), ['Charge number', 'Attest number', 'Material', 'Diameter', 'Certificate-type', 'Note']);
  assert.equal(view.fields.find(field => field.name === 'name')?.required, false, 'Attest number is optional');
  assert.equal(RESOURCE_MAP.certifications.fields.find(field => field.name === 'name')?.required, true, 'the other profiles keep it required');
  for (const name of ['diameter', 'basicMaterial', 'date', 'standard', 'materialCode', 'materialDescription', 'siteId']) assert.equal(view.fields.find(field => field.name === name)?.hidden, true, `${name} is no input`);
  assert.equal(view.fields.find(field => field.name === 'diameterId')?.ref, 'diameters', 'the diameter is a Weld diameter');
  assert.deepEqual(['controlled', 'accepted', 'diameter', 'materialId'].map(name => view.columnLabels?.[name]), ['Ctrl.', 'Accp.', 'Dia.', 'Material No']);
  assert.equal(projectResource(availabilityFor('access-prototype'), RESOURCE_MAP.certifications).columnLabels, undefined, 'other profiles keep their headers');
  // An older certificate's text diameter opens on the Weld diameter of that name.
  const diameters = [row('d2', { diameter: '2"' }), row('d3', { diameter: '3"' }), row('dup-a', { diameter: '6"' }), row('dup-b', { diameter: '6"' })];
  assert.equal(diameterIdFor('2"', diameters), 'd2'); assert.equal(diameterIdFor(' 3" ', diameters), 'd3'); assert.equal(diameterIdFor('6"', diameters), '', 'ambiguous'); assert.equal(diameterIdFor('', diameters), '');
  // Basic material is the one of the Type of material.
  assert.equal(certificateBasicMaterial(row('c', { materialTypeId: 't', basicMaterial: 'typed' }), [row('t', { basicMaterial: 'C-Si' })]), 'C-Si');
  assert.equal(certificateBasicMaterial(row('c', { materialTypeId: 'none', basicMaterial: 'typed' }), []), 'typed');
  assert.deepEqual(flagBulkChanges('1', ''), { controlled: true }); assert.deepEqual(flagBulkChanges('0', '1'), { controlled: false, accepted: true }); assert.equal(flagBulkChanges('', ''), null);
  const uses = certificateUses('c1', { welds: [row('w1', { certificate2Id: 'c1', isoId: 'i1', weldNo: 'W002' }), row('w2', { certificate1Id: 'c1', isoId: 'i1', weldNo: 'W001' }), row('w3', { certificate1Id: 'other', isoId: 'i1' })], isometrics: [row('i1', { isoNo: 'ISO-1', projectId: 'p1' })], projects: [row('p1', { internnumber: 'STX-1' })] });
  assert.deepEqual(uses.map(use => [use.project, use.isometric, use.weld]), [['STX-1', 'ISO-1', 'W001'], ['STX-1', 'ISO-1', 'W002']]);
});

test('an import row maps names to records and marks unknown ones per cell', () => {
  assert.deepEqual(CERTIFICATE_IMPORT_COLUMNS.map(column => column.header), ['Index number', 'Charge number', 'Attest number', 'Material', 'Diameter', 'Material part', 'Type of material', 'Schedule', 'Wall thickness', 'Hot yield', 'Impact strength', 'Certificate-type', 'Supplier', 'Project', 'Controlled', 'Accepted', 'Note']);
  const lookups = { materials: [row('m1', { materialNo: '7633186631' })], diameters: [row('d2', { diameter: '2"' })], material_parts: [row('pipe', { name: 'Pipe' })], material_types: [row('t1', { name: 'A106 Gr B', typeOfSteel: 'CS', materialDescription: 'Pipe', basicMaterial: '' })], suppliers: [row('s1', { name: 'PFF BV Klundert' })], projects: [row('p1', { internnumber: '20240101' })] };
  const good = importRow(2, { 'Charge number': '11111', 'Attest number': '22222', Material: '7633186631', Diameter: '2"', 'Material part': 'pipe', 'Type of material': 'A106 Gr B/CS/Pipe/', Supplier: 'PFF BV Klundert', Project: '20240101', Controlled: 'Yes', Accepted: '0', 'Certificate-type': '3.1' }, lookups);
  assert.deepEqual(good.errors, {});
  assert.deepEqual([good.values.materialId, good.values.diameterId, good.values.materialPartId, good.values.materialTypeId, good.values.supplierId, good.values.allProjects, good.values.projectIds, good.values.controlled, good.values.accepted], ['m1', 'd2', 'pipe', 't1', 's1', false, ['p1'], true, false]);
  const bad = importRow(3, { 'Type of material': 'A999', Project: 'ALL', Controlled: 'maybe', Diameter: '9"' }, lookups);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['controlled', 'diameterId', 'materialTypeId']);
  assert.match(bad.errors.materialTypeId, /No type of material "A999"/);
  assert.equal(bad.values.allProjects, true, 'ALL is every project of the main project');
  assert.ok(importRow(4, { Project: 'STX-OTHER' }, lookups).errors.projectIds, 'a project of another main project is unknown');
});

test('Weld Pilot reads the Material database and nothing else of MTO Pilot; it never writes it', () => {
  const weld = pilotBoundary(account({ general: 1, welding: 2 }), 'weld'), mto = pilotBoundary(account({ general: 1, materials: 2, welding: 2 }), 'mto');
  assert.equal(canResource(weld, 'materials', 'show'), true);
  for (const verb of ['insert', 'edit', 'delete', 'export', 'import', 'print'] as const) assert.equal(canResource(weld, 'materials', verb), false, verb);
  for (const key of ['iso_materials', 'custom_materials', 'uoms', 'operation_phases', 'orders', 'order_lines', 'receipts', 'stock', 'movements', 'picklists', 'reservations', 'calculation_lines', 'service_requests']) assert.equal(canResource(weld, key), false, key);
  // Only with a right to certificates or welds, and only inside a pilot (the selector account sees nothing).
  assert.equal(canResource(pilotBoundary(account({ general: 1 }), 'weld'), 'materials'), false);
  assert.equal(canResource(account({ general: 1, welding: 2 }), 'materials'), false);
  assert.equal(canResource(mto, 'materials', 'edit'), true, 'MTO Pilot keeps its own rights');
  // Detailed permissions: the matrix of the Weld Pilot profile decides through certificates / welds.
  const matrix = (capabilities: User['capabilities']) => pilotBoundary({ ...account({ general: 1, welding: 1 }), capabilities }, 'weld');
  assert.equal(canResource(matrix({ '63': ['show'] }), 'materials'), true);
  assert.equal(canResource(matrix({ '6': ['show', 'insert', 'edit'], '37': ['show'] }), 'materials'), false, 'an MTO grant does not cross into Weld Pilot');
  assert.equal(canResource(matrix({ '6': ['show', 'insert', 'edit'], '63': ['show'] }), 'materials', 'edit'), false);
});

test('the project site scope refuses a certificate or wire of another main project, older ones follow their links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-cert-scope-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  try {
    const scope = new SiteScope(store, 'weld', new Set(['site-north']));
    assert.equal(scope.allows('certifications', store.get('certifications', 'certificate-1')), true);
    assert.equal(scope.allows('certifications', store.get('certifications', 'certificate-2')), false, 'riverside certificate');
    assert.equal(scope.allows('welding_wires', store.get('welding_wires', 'wire-3')), false, 'riverside wire');
    const legacyRiver = store.create('certifications', { name: 'OLD-RIVER', allProjects: false, projectIds: ['project-steam'] }, SYSTEM);
    const legacyBoth = store.create('certifications', { name: 'OLD-BOTH', allProjects: false, projectIds: ['project-steam', 'project-cooling'] }, SYSTEM);
    const legacyAll = store.create('certifications', { name: 'OLD-ALL', allProjects: true }, SYSTEM);
    assert.equal(scope.allows('certifications', legacyRiver), false);
    assert.equal(scope.allows('certifications', legacyBoth), true, 'linked to one of the account\'s main projects');
    assert.equal(scope.allows('certifications', legacyAll), true, 'shared as before');
    assert.equal(new SiteScope(store, 'weld', new Set(['site-river'])).allows('certifications', legacyBoth), true);
    // A file of a certificate follows the certificate.
    assert.equal(scope.allows('attachments', { entityType: 'certifications', entityId: 'certificate-2' }), false);
    assert.equal(scope.allows('attachments', { entityType: 'certifications', entityId: legacyRiver.id }), false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a ZIP archive stores every entry with its name and CRC', () => {
  const zip = zipArchive([{ name: 'index.csv', data: Buffer.from('a,b\n') }, { name: '0001.pdf', data: Buffer.from('%PDF-1.4 test') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const end = zip.length - 22; assert.equal(zip.readUInt32LE(end), 0x06054b50); assert.equal(zip.readUInt16LE(end + 10), 2);
  assert.deepEqual(zipEntries(zip).map(entry => entry.name), ['index.csv', '0001.pdf']);
  assert.equal(zipEntries(zip)[1].data.toString(), '%PDF-1.4 test');
});
/** Entries of a ZIP (stored or deflated), read from the central directory. */
function zipEntries(zip: Buffer) {
  const end = zip.length - 22, count = zip.readUInt16LE(end + 10); let at = zip.readUInt32LE(end + 16);
  const entries: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20), nameLength = zip.readUInt16LE(at + 28), extra = zip.readUInt16LE(at + 30), comment = zip.readUInt16LE(at + 32), offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28), raw = zip.subarray(start, start + size);
    entries.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

const PASSWORD = 'Certifications-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-certifications-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot = 'weld', data }: { method?: string; pilot?: string; data?: unknown } = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, 'X-Stelux-Pilot': pilot, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { request };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Cert admin', email: 'cert-admin@example.test', password: PASSWORD } })).status, 201);
  const signIn = async (name: string, levels: Record<string, string>, sites?: Partial<Record<'weld' | 'mto', string[]>>) => {
    const profile = store.create('profiles', { name, toolsPermission: 'No access', settingsPermission: 'No access', ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true, ...(sites?.weld ? { weldSiteScope: 'Specific project site(s)' } : {}), ...(sites?.mto ? { mtoSiteScope: 'Specific project site(s)' } : {}) });
    for (const [pilot, ids] of Object.entries(sites || {})) for (const siteId of ids!) store.create(USER_SITES, { userId: user.id, pilot, siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client(); assert.equal((await as.request('/auth/login', { method: 'POST', data: { email: user.email, password: PASSWORD } })).status, 200);
    return as;
  };
  const upload = (as: ReturnType<typeof client>, entityId: string, name = 'cert.pdf', content = '%PDF-1.4 certificate') => {
    const body = new FormData(); body.set('entityType', 'certifications'); body.set('entityId', entityId); body.set('documentType', 'Certificate'); body.set('file', new Blob([content], { type: 'application/pdf' }), name);
    return as.request('/files', { method: 'POST', data: body });
  };
  return { store, admin, signIn, upload };
}
const json = async (response: Response) => await response.json() as Record<string, any>;
const sheet = async (rows: (string | number)[][]) => {
  const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('Certifications');
  worksheet.addRow(CERTIFICATE_IMPORT_COLUMNS.map(column => column.header)); for (const line of rows) worksheet.addRow(line);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
const cells = (values: Record<string, string>) => CERTIFICATE_IMPORT_COLUMNS.map(column => values[column.header] ?? '');

test('Weld Pilot through the API: the Material database is read-only and the rest of MTO Pilot stays closed', async t => {
  const f = await fixture(t);
  const weld = await f.signIn('Weld writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const data = await json(await weld.request('/bootstrap'));
  assert.ok(data.rows.materials.length, 'certificates and welds can show their material');
  for (const key of ['iso_materials', 'custom_materials', 'stock', 'orders', 'order_lines', 'receipts', 'movements', 'picklists', 'reservations', 'uoms', 'operation_phases']) assert.equal(data.rows[key], undefined, key);
  assert.equal((await weld.request('/records/materials')).status, 200);
  assert.equal((await weld.request('/records/materials', { method: 'POST', data: { materialNo: 'WELD-DENIED', description: 'x', uom: 'EA', materialGroup: 'G' } })).status, 403);
  const material = f.store.get('materials', 'material-1');
  assert.equal((await weld.request('/records/materials/material-1', { method: 'PUT', data: { description: 'changed', _version: material._version } })).status, 403);
  assert.equal((await weld.request('/records/materials/material-1/archive', { method: 'POST', data: { _version: material._version } })).status, 403);
  assert.equal((await weld.request('/bulk/materials', { method: 'POST', data: { ids: ['material-1'], changes: { description: 'x' }, versions: { 'material-1': material._version } } })).status, 403);
  assert.equal((await weld.request('/export/materials')).status, 403, 'reading is all: no export');
  const refused = (status: number) => status === 403 || status === 404;
  assert.ok(refused((await weld.request('/actions/adjust-material', { method: 'POST', data: { materialId: 'material-1', warehouseId: 'warehouse-main', quantity: 1 } })).status), 'MTO actions stay refused');
  assert.equal(f.store.get('materials', 'material-1').description, material.description);
  // The same account keeps full rights in MTO Pilot.
  assert.equal((await weld.request('/records/materials/material-1', { method: 'PUT', pilot: 'mto', data: { price: 12, _version: material._version } })).status, 200);
});

test('Controlled / Accepted on the checked certificates: only those two fields, per record rights', async t => {
  const f = await fixture(t);
  const versions = (ids: string[]) => Object.fromEntries(ids.map(id => [id, f.store.get('certifications', id)._version]));
  let response = await f.admin.request('/bulk/certifications', { method: 'POST', data: { ids: ['certificate-3', 'cert-h3305'], changes: { controlled: false, accepted: true }, versions: versions(['certificate-3', 'cert-h3305']) } });
  assert.equal(response.status, 200); assert.equal((await json(response)).count, 2);
  assert.deepEqual(['certificate-3', 'cert-h3305'].map(id => [f.store.get('certifications', id).controlled, f.store.get('certifications', id).accepted]), [[false, true], [false, true]]);
  for (const changes of [{ name: 'Renamed' }, { controlled: 'yes' }, { controlled: true, chargeNo: 'X' }]) assert.equal((await f.admin.request('/bulk/certifications', { method: 'POST', data: { ids: ['certificate-3'], changes, versions: versions(['certificate-3']) } })).status, 404, JSON.stringify(changes));
  // Other hosted bulk routes stay closed; a read-only account and an account limited to the other main project are refused.
  assert.equal((await f.admin.request('/bulk/welds', { method: 'POST', data: { ids: ['weld-1'], changes: { kr: 'x' } } })).status, 404);
  const reader = await f.signIn('Cert reader', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  assert.equal((await reader.request('/bulk/certifications', { method: 'POST', data: { ids: ['certificate-3'], changes: { controlled: true }, versions: versions(['certificate-3']) } })).status, 403);
  const river = await f.signIn('River writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' }, { weld: ['site-river'] });
  assert.equal((await river.request('/bulk/certifications', { method: 'POST', data: { ids: ['certificate-3'], changes: { controlled: true }, versions: versions(['certificate-3']) } })).status, 403);
  assert.equal(f.store.get('certifications', 'certificate-3').controlled, false);
  // The same one path for welding wires: Yes / No of the two flags only, inside the account's main projects.
  const wireVersions = (ids: string[]) => Object.fromEntries(ids.map(id => [id, f.store.get('welding_wires', id)._version]));
  response = await f.admin.request('/bulk/welding_wires', { method: 'POST', data: { ids: ['wire-1', 'wire-3'], changes: { controlled: true, accepted: false }, versions: wireVersions(['wire-1', 'wire-3']) } });
  assert.equal(response.status, 200); assert.deepEqual(['wire-1', 'wire-3'].map(id => [f.store.get('welding_wires', id).controlled, f.store.get('welding_wires', id).accepted]), [[true, false], [true, false]]);
  for (const changes of [{ norm: 'x' }, { accepted: 1 }, { controlled: 'yes' }, { controlled: true, siteId: 'site-river' }]) assert.equal((await f.admin.request('/bulk/welding_wires', { method: 'POST', data: { ids: ['wire-1'], changes, versions: wireVersions(['wire-1']) } })).status, 404, JSON.stringify(changes));
  assert.equal((await reader.request('/bulk/welding_wires', { method: 'POST', data: { ids: ['wire-1'], changes: { controlled: false }, versions: wireVersions(['wire-1']) } })).status, 403);
  assert.equal((await river.request('/bulk/welding_wires', { method: 'POST', data: { ids: ['wire-1'], changes: { controlled: false }, versions: wireVersions(['wire-1']) } })).status, 403);
  assert.equal(f.store.get('welding_wires', 'wire-1').controlled, true);
  assert.equal(f.store.get('welding_wires', 'wire-1').siteId, 'site-north');
});

test('a welding wire saved from the hosted form keeps the main-project rule: open main project, its own index numbers, ALL within it', async t => {
  const f = await fixture(t);
  // The fields of the hosted wire form (shared/welder-data.ts → HOSTED_FIELD_ORDER); the form adds the open main project on create (client/dialogs.tsx).
  const form = (extra: Record<string, unknown>) => ({ chargeNo: 'C-1', attestNo: 'A-1', diameter: 1.2, classification: 'ER70S-6', typeMaterial: 'A106 Gr B', norm: 'EN ISO 14341', certType: '152516', controlled: false, accepted: false, description: '', allProjects: false, projectIds: [], ...extra });
  let response = await f.admin.request('/records/welding_wires', { method: 'POST', data: form({ allProjects: true }) });
  assert.equal(response.status, 422, 'no main project open'); assert.ok((await json(response)).fields.siteId);
  // Index numbers count per main project: the north site's numbers do not raise the riverside count, but a wire's number is its
  // unique name, so the 0001 the north site holds is skipped (the riverside site has no numbered wire yet).
  assert.equal(nextSiteIndexNumber('welding_wires', 'name', 'site-river', f.store.list('welding_wires'), { links: f.store.list('wire_projects'), projects: f.store.list('projects') }), '0001');
  response = await f.admin.request('/records/welding_wires', { method: 'POST', data: form({ siteId: 'site-river', allProjects: true }) });
  assert.equal(response.status, 201); const river = (await json(response)).record; assert.deepEqual([river.name, river.siteId], ['0002', 'site-river']);
  response = await f.admin.request('/records/welding_wires', { method: 'POST', data: form({ siteId: 'site-river', allProjects: true, chargeNo: 'C-2' }) });
  assert.equal(response.status, 201); assert.equal((await json(response)).record.name, '0003', 'counted on from the riverside wires');
  response = await f.admin.request('/records/welding_wires', { method: 'POST', data: form({ siteId: 'site-north', projectIds: ['project-cooling'] }) });
  assert.equal(response.status, 201); const linked = (await json(response)).record; assert.deepEqual([linked.name, linked.siteId], ['0004', 'site-north'], 'north counts from its own 0001; 0002 and 0003 are riverside names');
  assert.deepEqual(f.store.list('wire_projects').filter(link => link.wireId === linked.id).map(link => link.projectId), ['project-cooling']);
  // Projects of another main project are refused; the main project never moves.
  response = await f.admin.request('/records/welding_wires', { method: 'POST', data: form({ siteId: 'site-north', projectIds: ['project-steam'] }) });
  assert.equal(response.status, 422); assert.ok((await json(response)).fields.projectIds);
  assert.equal((await f.admin.request(`/records/welding_wires/${linked.id}`, { method: 'PUT', data: { siteId: 'site-river', _version: linked._version } })).status, 422);
  // "ALL" is all projects of the wire's main project: an account of the other main project does not get the wire.
  response = await f.admin.request('/records/welding_wires', { method: 'POST', data: form({ siteId: 'site-north', allProjects: true }) });
  assert.equal(response.status, 201); const all = (await json(response)).record; assert.equal(all.name, '0005');
  const north = await f.signIn('North wires', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' }, { weld: ['site-north'] });
  const riverside = await f.signIn('River wires', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' }, { weld: ['site-river'] });
  const wires = async (as: typeof north) => ((await json(await as.request('/bootstrap'))).rows.welding_wires as Row[]).map(item => item.id);
  assert.ok((await wires(north)).includes(all.id)); assert.equal((await wires(riverside)).includes(all.id), false);
  assert.ok((await wires(riverside)).includes(river.id)); assert.equal((await wires(north)).includes(river.id), false);
});

test('main project of certificates and wires over the API: lists, records, welds and links stay within it', async t => {
  const f = await fixture(t);
  const north = await f.signIn('North writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' }, { weld: ['site-north'], mto: ['site-north'] });
  const data = await json(await north.request('/bootstrap'));
  const ids = (key: string) => (data.rows[key] as Row[]).map(item => item.id).sort();
  assert.deepEqual(ids('certifications'), ['cert-h1043', 'cert-h3305', 'certificate-1', 'certificate-3']);
  assert.deepEqual(ids('welding_wires'), ['wire-1', 'wire-2']);
  for (const path of ['/history/certifications/certificate-2', '/history/welding_wires/wire-3']) assert.equal((await north.request(path)).status, 403, path);
  assert.equal((await north.request('/pdf/certification-index?siteId=site-river')).status, 404);
  assert.equal((await north.request('/certifications/zip?siteId=site-river')).status, 404);
  // Creating in, or moving to, the other main project is refused; links to its projects too.
  assert.equal((await north.request('/records/certifications', { method: 'POST', data: { siteId: 'site-river', name: 'X', allProjects: true } })).status, 403);
  const own = await json(await north.request('/records/certifications', { method: 'POST', data: { siteId: 'site-north', name: 'N-1', chargeNo: 'H-1', certType: '3.1', diameterId: 'diameter-6', materialPartId: 'part-0', materialTypeId: 'material-type-a106b', schedule: '40', wallThickness: '3.91', allProjects: true } }));
  assert.equal(own.record.siteId, 'site-north');
  // Moving it is refused: here already because the account cannot reach the other main project (tests/welder-data.test.ts: 422 for any account).
  assert.equal((await north.request(`/records/certifications/${own.record.id}`, { method: 'PUT', data: { siteId: 'site-river', _version: own.record._version } })).status, 403);
  assert.equal(f.store.get('certifications', own.record.id).siteId, 'site-north');
  // A weld takes a certificate and a wire of its own main project only (also for an account that reaches both).
  const weld = f.store.get('welds', 'weld-1');
  let response = await f.admin.request('/records/welds/weld-1', { method: 'PUT', data: { certificate2Id: 'certificate-2', _version: weld._version } });
  assert.equal(response.status, 422); assert.ok((await json(response)).fields.certificate2Id);
  response = await f.admin.request('/records/welds/weld-1', { method: 'PUT', data: { wire2Id: 'wire-3', _version: weld._version } });
  assert.equal(response.status, 422); assert.ok((await json(response)).fields.wire2Id);
  assert.equal((await f.admin.request('/records/welds/weld-1', { method: 'PUT', data: { wire2Id: 'wire-2', _version: weld._version } })).status, 200);
});

test('Import certifications: preview with per-cell errors, then commit with the next index numbers of the main project', async t => {
  const f = await fixture(t);
  const body = async (rows: (string | number)[][], siteId = 'site-north') => { const form = new FormData(); form.set('siteId', siteId); form.set('file', new Blob([await sheet(rows)]), 'certificates.xlsx'); return form; };
  const good = cells({ 'Charge number': 'IMP-1', 'Attest number': 'ATT-IMP-1', Material: String(f.store.get('materials', 'material-1').materialNo), Diameter: '2"', 'Material part': String(f.store.get('material_parts', 'part-0').name), 'Type of material': String(f.store.get('material_types', 'material-type-a106b').name), Schedule: '40', 'Wall thickness': '3.91', 'Certificate-type': '3.1', Supplier: String(f.store.get('suppliers', 'supplier-steel').name), Project: 'STX-2401', Controlled: 'Yes', Accepted: 'No' });
  const unknownType = cells({ 'Charge number': 'IMP-2', 'Type of material': 'NO SUCH TYPE', Diameter: '2"', 'Material part': String(f.store.get('material_parts', 'part-0').name), Schedule: '40', 'Wall thickness': '3.91', 'Certificate-type': '3.1' });
  const otherSite = cells({ 'Charge number': 'IMP-3', Project: 'STX-2402' });
  let response = await f.admin.request('/certifications/import/preview', { method: 'POST', data: await body([good, unknownType, otherSite]) });
  assert.equal(response.status, 200);
  const preview = (await json(response)).rows as { row: number; values: Record<string, unknown>; errors: Record<string, string>; action: string }[];
  assert.deepEqual(preview.map(line => line.row), [2, 3, 4]);
  assert.deepEqual(preview[0].errors, {}); assert.equal(preview[0].action, 'import');
  assert.match(preview[1].errors.materialTypeId, /No type of material/); assert.equal(preview[1].action, 'skip');
  assert.ok(preview[2].errors.projectIds, 'a project of another main project is unknown here');
  assert.equal(f.store.list('certifications').filter(item => String(item.chargeNo).startsWith('IMP-')).length, 0, 'the preview writes nothing');
  // The user maps the unknown type in the preview, then commits: rows with errors and skipped rows are not imported.
  const corrected = { ...preview[1], values: { ...preview[1].values, materialTypeId: 'material-type-a106b' }, action: 'import' };
  response = await f.admin.request('/certifications/import', { method: 'POST', data: { siteId: 'site-north', rows: [preview[0], corrected, { ...preview[2], action: 'skip' }] } });
  assert.equal(response.status, 201); const result = await json(response);
  assert.deepEqual([result.inserted, result.skipped], [2, 1]);
  const imported = f.store.list('certifications').filter(item => String(item.chargeNo).startsWith('IMP-')).sort((a, b) => String(a.indexNo).localeCompare(String(b.indexNo)));
  assert.deepEqual(imported.map(item => [item.chargeNo, item.indexNo, item.siteId]), [['IMP-1', '0007', 'site-north'], ['IMP-2', '0008', 'site-north']]);
  assert.equal(imported[0].diameter, '2"'); assert.equal(imported[0].controlled, true);
  assert.deepEqual(f.store.list('certificate_projects').filter(link => link.certificateId === imported[0].id).map(link => link.projectId), ['project-cooling']);
  // A row naming the main project of another site is put in the import's main project; a forged field is refused.
  assert.equal((await f.admin.request('/certifications/import', { method: 'POST', data: { siteId: 'site-north', rows: [{ row: 2, action: 'import', values: { ...preview[0].values, siteId: 'site-river', chargeNo: 'IMP-4' } }] } })).status, 201);
  assert.equal(f.store.list('certifications').find(item => item.chargeNo === 'IMP-4')?.siteId, 'site-north');
  assert.equal((await f.admin.request('/certifications/import', { method: 'POST', data: { siteId: 'site-north', rows: [{ row: 2, action: 'import', values: { ...preview[0].values, materialCodeX: 'x' } }] } })).status, 404);
  // Template and permissions.
  response = await f.admin.request('/certifications/import/template');
  assert.equal(response.status, 200); const template = new ExcelJS.Workbook(); await template.xlsx.load(await response.arrayBuffer());
  assert.deepEqual((template.worksheets[0].getRow(1).values as unknown[]).slice(1), CERTIFICATE_IMPORT_COLUMNS.map(column => column.header));
  const reader = await f.signIn('Import reader', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  assert.equal((await reader.request('/certifications/import/preview', { method: 'POST', data: await body([good]) })).status, 403);
  const river = await f.signIn('River importer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' }, { weld: ['site-river'] });
  assert.equal((await river.request('/certifications/import', { method: 'POST', data: { siteId: 'site-north', rows: [preview[0]] } })).status, 404, 'the main project of another site is unknown');
});

test('Export to ZIP and Duplicate certificate', async t => {
  const f = await fixture(t);
  assert.equal((await f.upload(f.admin, 'certificate-1', 'mill-certificate.pdf', '%PDF-1.4 north')).status, 201);
  assert.equal((await f.upload(f.admin, 'certificate-2', 'river.pdf', '%PDF-1.4 river')).status, 201);
  let response = await f.admin.request('/certifications/zip?siteId=site-north');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type') || '', /zip/);
  const entries = zipEntries(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(entries.map(entry => entry.name), ['index.csv', '0001.pdf']);
  assert.equal(entries[1].data.toString(), '%PDF-1.4 north');
  const index = entries[0].data.toString();
  assert.match(index.split('\n')[0], /^Index number,Charge number,Certificate-type,Attest number,Material No/);
  for (const number of ['0001', '0003', '0004', '0006']) assert.ok(index.includes(number), number);
  assert.ok(!index.includes('ATT-26-1190'), 'certificates of another main project are not in the ZIP');
  response = await f.admin.request('/certifications/zip?siteId=site-north&projectId=project-skid');
  const skid = zipEntries(Buffer.from(await response.arrayBuffer()))[0].data.toString();
  assert.ok(skid.includes('ATT-26-1215') && !skid.includes('ATT-26-1207'), 'the project filter applies');
  assert.equal((await f.admin.request('/certifications/zip?siteId=site-north&projectId=project-steam')).status, 404);
  const reader = await f.signIn('No export', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await reader.request('/certifications/zip?siteId=site-north')).status, 200, 'Read only includes export at module level');
  // Duplicate certificate: the edited values, a new index number of the main project, and the file when Copy file is ticked.
  const original = f.store.get('certifications', 'certificate-1');
  const form = Object.fromEntries(['chargeNo', 'name', 'materialId', 'diameterId', 'materialPartId', 'materialTypeId', 'schedule', 'wallThickness', 'certType', 'supplierId', 'allProjects', 'controlled', 'accepted'].map(name => [name, original[name]]));
  response = await f.admin.request('/certifications/certificate-1/duplicate', { method: 'POST', data: { values: { ...form, chargeNo: 'H-1042-B', name: 'ATT-COPY', controlled: false, accepted: false }, copyFile: true } });
  assert.equal(response.status, 201); const copy = (await json(response)).record;
  assert.deepEqual([copy.chargeNo, copy.indexNo, copy.siteId], ['H-1042-B', '0007', 'site-north']);
  const files = f.store.list('attachments').filter(file => file.entityType === 'certifications' && file.entityId === copy.id);
  assert.deepEqual(files.map(file => file.name), ['mill-certificate.pdf']);
  assert.equal(f.store.get('certifications', 'certificate-1')._version, original._version, 'the original is unchanged');
  response = await f.admin.request('/certifications/certificate-1/duplicate', { method: 'POST', data: { values: { ...form, chargeNo: 'H-1042-C' }, copyFile: false } });
  const plain = (await json(response)).record; assert.equal(f.store.list('attachments').filter(file => file.entityId === plain.id).length, 0, 'without Copy file');
  assert.equal((await reader.request('/certifications/certificate-1/duplicate', { method: 'POST', data: { values: { chargeNo: 'X' } } })).status, 403);
  const river = await f.signIn('River dup', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' }, { weld: ['site-river'] });
  assert.equal((await river.request('/certifications/certificate-1/duplicate', { method: 'POST', data: { values: { chargeNo: 'X' } } })).status, 403);
});
