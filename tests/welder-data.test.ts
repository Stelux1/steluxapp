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
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { PILOT_MAP, pilotItemResources } from '../shared/pilots.ts';
import { ASME_P_NUMBERS, CERTIFICATE_MANDATORY, ISO_15608_GROUPS, NO_WELDER_FILTER, certificateMandatoryErrors, certificatesForProject, expiringQualifications, filterWelders, isoAsmeLabel, linkedToProject, nextIndexNumber, rangeErrors, welderTab, welderTabCounts } from '../shared/welder-data.ts';
import type { Bootstrap, Row } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const TODAY = '2026-11-16';

test('expire warnings list expired and soon-expiring qualifications, earliest first, with the reference wording', () => {
  const rows = {
    welders: [row('w1', { number: 'W-001', name: 'Alex Taylor', status: 'Active' }), row('w2', { number: 'W-002', name: 'Robin Lane', status: 'Active' }), row('w3', { number: 'W-003', status: 'Inactive' }), row('w4', { number: 'W-004', status: 'Active', _archived: true })],
    welder_customs_catalog: [row('c1', { name: 'W01 Custom', abbreviation: 'W01' })],
    weld_processes: [row('p1', { name: '141 — TIG' })],
    welder_certificates: [
      row('q-expired', { name: 'WQ-1', welderId: 'w1', customId: 'c1', processId: 'p1', standard: 'ISO 9606-1', expiresAt: '2026-11-10' }),
      row('q-soon', { name: 'WQ-2', welderId: 'w2', expiresAt: '2026-11-17' }),
      row('q-today', { name: 'WQ-3', welderId: 'w2', expiresAt: '2026-11-16' }),
      row('q-edge', { name: 'WQ-4', welderId: 'w1', expiresAt: '2026-12-16' }),
      row('q-far', { name: 'WQ-5', welderId: 'w1', expiresAt: '2026-12-17' }),
      row('q-none', { name: 'WQ-6', welderId: 'w1' }),
      row('q-archived', { name: 'WQ-7', welderId: 'w1', expiresAt: '2026-01-01', _archived: true }),
      row('q-inactive', { name: 'WQ-8', welderId: 'w3', expiresAt: '2026-01-01' }),
      row('q-deleted-welder', { name: 'WQ-9', welderId: 'w4', expiresAt: '2026-01-01' }),
    ],
  };
  const list = expiringQualifications(rows, TODAY, 30);
  assert.deepEqual(list.map(item => item.id), ['q-expired', 'q-today', 'q-soon', 'q-edge']);
  assert.deepEqual(list.map(item => item.message), ['Expired', 'Expires today', 'Expires in 1 day', 'Expires in 30 days']);
  assert.deepEqual(list.map(item => item.status), ['expired', 'expiring', 'expiring', 'expiring']);
  assert.equal(list[0].welder, 'W-001 | Alex Taylor'); assert.equal(list[0].welderId, 'w1');
  assert.equal(list[0].qualification, 'WQ-1 | W01 | 141 — TIG | ISO 9606-1');
  // The window is configurable: a wider one adds the far entry, 0 days keeps only what is due or past due.
  assert.deepEqual(expiringQualifications(rows, TODAY, 31).map(item => item.id), ['q-expired', 'q-today', 'q-soon', 'q-edge', 'q-far']);
  assert.deepEqual(expiringQualifications(rows, TODAY, 0).map(item => item.id), ['q-expired', 'q-today']);
});

test('filter welders matches one valid qualification against every chosen value', () => {
  const welders = [row('w1'), row('w2'), row('w3')];
  const rows = {
    diameters: [row('d-2', { size: 60.3 }), row('d-8', { size: 219.1 })],
    welder_customs_catalog: [row('c1', { diameterFrom: '21.3', diameterTo: '168.3', wtFrom: '2', wtTo: '12' })],
    welder_certificates: [
      row('a', { welderId: 'w1', customId: 'c1', processId: 'p-tig', wireId: 'wire-1', position: 'PF', weldKind: 'BW', system: 'EN', expiresAt: '2027-05-01' }),
      row('b', { welderId: 'w2', processId: 'p-tig', position: 'PA', weldKind: 'FW', system: 'EN', thicknessFrom: 3, thicknessTo: 20, diameterFrom: 100, expiresAt: '2027-05-01' }),
      row('c', { welderId: 'w3', customId: 'c1', processId: 'p-tig', position: 'PF', weldKind: 'BW', system: 'EN', expiresAt: '2026-01-01' }),
    ],
  };
  const ids = (filter: Partial<typeof NO_WELDER_FILTER>) => filterWelders(welders, rows, { ...NO_WELDER_FILTER, ...filter }, TODAY).map(item => item.id);
  assert.deepEqual(ids({}), ['w1', 'w2', 'w3']);
  assert.deepEqual(ids({ processId: 'p-tig' }), ['w1', 'w2'], 'an expired qualification does not count');
  assert.deepEqual(ids({ position: 'PF' }), ['w1']);
  assert.deepEqual(ids({ weldKind: 'FW', system: 'EN' }), ['w2']);
  assert.deepEqual(ids({ wireId: 'wire-1' }), ['w1']);
  // Diameter 60.3 is inside the custom's range for w1; w2 only states "from 100".
  assert.deepEqual(ids({ diameterId: 'd-2' }), ['w1']);
  assert.deepEqual(ids({ diameterId: 'd-8' }), ['w2']);
  assert.deepEqual(ids({ thickness: '10' }), ['w1', 'w2']);
  assert.deepEqual(ids({ thickness: '25' }), []);
  // All values must hold on the same qualification.
  assert.deepEqual(ids({ position: 'PF', weldKind: 'FW' }), []);
  assert.deepEqual(ids({ diameterId: 'missing' }), []);
});

test('welder tabs follow status and deletion', () => {
  const list = [row('a', { status: 'Active' }), row('b', { status: 'Inactive' }), row('c', { status: 'Active', _archived: true }), row('d', { status: 'Inactive', _archived: true }), row('e')];
  assert.deepEqual(list.map(welderTab), ['active', 'inactive', 'deleted', 'deleted', 'active']);
  assert.deepEqual(welderTabCounts(list), { active: 2, inactive: 1, deleted: 2 });
});

test('certificates for a project: everything unless the main project asks for project-specific certificates', () => {
  const certificates = [row('all', { allProjects: true }), row('legacy', {}), row('one', { allProjects: false }), row('other', { allProjects: false }), row('gone', { allProjects: true, _archived: true })];
  const links = [row('l1', { certificateId: 'one', projectId: 'p1' }), row('l2', { certificateId: 'other', projectId: 'p2' }), row('l3', { certificateId: 'other', projectId: 'p1', _archived: true })];
  const ids = (site: Record<string, unknown> | undefined, projectId = 'p1') => certificatesForProject({ certificates, links, projectId, site }).map(item => item.id);
  assert.deepEqual(ids({ projectCertificates: false }), ['all', 'legacy', 'one', 'other']);
  assert.deepEqual(ids(undefined), ['all', 'legacy', 'one', 'other']);
  assert.deepEqual(ids({ projectCertificates: true }), ['all', 'legacy', 'one']);
  assert.deepEqual(ids({ projectCertificates: true }, 'p2'), ['all', 'legacy', 'other']);
  assert.deepEqual(ids({ projectCertificates: true }, 'p3'), ['all', 'legacy']);
  assert.ok(linkedToProject(certificates[2], links, 'certificateId', 'p1'));
  assert.ok(!linkedToProject(certificates[2], links, 'certificateId', 'p2'));
  assert.ok(linkedToProject(certificates[0], links, 'certificateId', 'p9'));
});

test('mandatory certificate fields apply when a main project the certificate reaches has them on', () => {
  const sites = [row('s-on', { mandatoryFields: true }), row('s-off', { mandatoryFields: false })];
  const projects = [row('p-on', { siteId: 's-on' }), row('p-off', { siteId: 's-off' })];
  const empty = { name: 'ATT-1' };
  const names = (merged: Record<string, unknown>, ids: string[]) => Object.keys(certificateMandatoryErrors(merged, ids, projects, sites));
  assert.deepEqual(names({ ...empty, allProjects: false }, ['p-off']), []);
  assert.deepEqual(names({ ...empty, allProjects: false }, []), []);
  assert.deepEqual(names({ ...empty, allProjects: false }, ['p-on']), CERTIFICATE_MANDATORY.map(([name]) => name));
  assert.deepEqual(names({ ...empty, allProjects: true }, []), CERTIFICATE_MANDATORY.map(([name]) => name), 'all projects reaches the main project with mandatory fields');
  assert.deepEqual(names({ allProjects: true, chargeNo: 'H-1', diameter: '2"', materialPartId: 'part-0', materialTypeId: 'type-0', schedule: '40', wallThickness: '3.91', certType: '3.1' }, []), []);
  assert.match(certificateMandatoryErrors({ allProjects: false }, ['p-on'], projects, sites).chargeNo, /Charge number is required/);
});

test('index numbers, ISO / ASME label, ranges and option lists', () => {
  assert.equal(nextIndexNumber([]), '0001'); assert.equal(nextIndexNumber(['0001', '0009', 'WIRE-316L-01', '']), '0010'); assert.equal(nextIndexNumber(['12345']), '12346');
  assert.equal(isoAsmeLabel({ iso15608: '1.1', asmePNumber: 'P-1', asmeGroup: '1' }), '1.1 / P-1 Gr 1'); assert.equal(isoAsmeLabel({ iso15608: '8.1' }), '8.1'); assert.equal(isoAsmeLabel({}), '');
  assert.deepEqual(rangeErrors({ diameterFrom: '10', diameterTo: '5' }, [['diameterFrom', 'diameterTo', 'Diameter']]), { diameterTo: 'Diameter to must not be smaller than diameter from.' });
  assert.deepEqual(rangeErrors({ diameterFrom: '10', diameterTo: '' }, [['diameterFrom', 'diameterTo', 'Diameter']]), {});
  assert.deepEqual(Object.keys(rangeErrors({ diameterFrom: 'abc' }, [['diameterFrom', 'diameterTo', 'Diameter']])), ['diameterFrom']);
  assert.equal(ISO_15608_GROUPS[0], '1.1'); assert.ok(ISO_15608_GROUPS.includes('11.1')); assert.ok(ASME_P_NUMBERS.includes('P-1') && ASME_P_NUMBERS.includes('P-8'));
  assert.equal(new Set(ISO_15608_GROUPS).size, ISO_15608_GROUPS.length);
});

test('the hosted profile delivers the welder and material data pages with the reference labels and columns', () => {
  for (const key of ['welders', 'roles', 'certificate_types', 'welder_customs_catalog', 'diameters', 'material_parts', 'material_types', 'welding_wires', 'certifications']) assert.ok(hosted.navigation.includes(key), key);
  for (const key of ['welder_certificates', 'welder_sites', 'welder_customs', 'certificate_projects', 'wire_projects']) assert.ok(hosted.resources[key], key);
  // Every menu item of these flows opens a delivered page.
  const items = PILOT_MAP.weld.groups.filter(group => ['Welder data', 'Material data'].includes(group.title)).flatMap(group => group.items);
  for (const item of items.filter(item => item.label !== 'Material supplier')) for (const key of pilotItemResources(item)) assert.ok(hosted.navigation.includes(key), `${item.label}: ${key}`);
  const view = (key: string) => projectResource(hosted, RESOURCE_MAP[key]);
  const labels = (key: string) => view(key).columns.map(name => view(key).fields.find(field => field.name === name)?.label);
  assert.deepEqual(labels('roles'), ['Role', 'Abbreviation', 'Max amount tasks', 'Lead role?']);
  assert.deepEqual(labels('diameters'), ['Diameter', 'Size in mm', 'Size in inches', 'Outline in mm', 'Sorting']);
  assert.deepEqual(labels('material_parts'), ['Part', 'Custom']);
  assert.deepEqual(labels('material_types'), ['Type of material', 'Type of steel', 'Material description', 'Basic material', 'Material group', 'ISO / ASME']);
  assert.deepEqual(labels('welding_wires'), ['Index number', 'Charge number', 'Rod type', 'Type of material', 'mm', 'Certificate-type', 'Attest number', 'Supplier', 'Controlled', 'Accepted']);
  // The certificate list headers of the reference are shorter than the form labels (Material No, Dia., Ctrl., Accp.).
  const headers = (key: string) => view(key).columns.map(name => view(key).columnLabels?.[name] ?? view(key).fields.find(field => field.name === name)?.label);
  assert.deepEqual(headers('certifications'), ['Index number', 'Charge number', 'Certificate-type', 'Attest number', 'Material No', 'Type of material', 'Material part', 'Basic material', 'Dia.', 'Schedule', 'Wall thickness', 'Supplier', 'Ctrl.', 'Accp.']);
  assert.deepEqual(labels('certifications').slice(-2), ['Controlled', 'Accepted'], 'the form keeps Controlled / Accepted');
  const requiredOf = (key: string) => view(key).fields.filter(field => field.required).map(field => field.label);
  assert.deepEqual(requiredOf('roles'), ['Role', 'Abbreviation']); assert.deepEqual(requiredOf('diameters'), ['Diameter', 'Size in mm']); assert.deepEqual(requiredOf('material_types'), ['Type of material', 'Type of steel']);
  assert.deepEqual(view('welders').fields.filter(field => field.required).map(field => field.label), ['ID nr.']);
  // The shared definitions (other profiles) keep their old requirements.
  assert.deepEqual(RESOURCE_MAP.roles.fields.filter(field => field.required).map(field => field.name), ['name']);
  assert.ok(!RESOURCES.find(resource => resource.key === 'diameters')!.fields.find(field => field.name === 'size')!.required);
});

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-welder-data-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Welder-Data-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Welder admin', email: 'welder-admin@example.test', password })).status, 201) };
}
const json = async (response: Response) => response.json() as Promise<Record<string, any>>;

test('hosted rules: required abbreviations, ranges, index numbers and the ISO / ASME column; other profiles are unchanged', async t => {
  const f = await fixture(t); await f.setup();
  let response = await f.request('/api/records/roles', 'POST', { name: 'Welding inspector' });
  assert.equal(response.status, 422); assert.match((await json(response)).fields.abbreviation, /required/);
  response = await f.request('/api/records/roles', 'POST', { name: 'Welding inspector', abbreviation: 'WIN', maxTasks: 3, leadRole: true }); assert.equal(response.status, 201);
  assert.equal((await f.request('/api/records/certificate_types', 'POST', { name: 'Welder test' })).status, 422);
  assert.equal((await f.request('/api/records/welder_customs_catalog', 'POST', { name: 'W10 Custom', abbreviation: 'W10', diameterFrom: '100', diameterTo: '50' })).status, 422);
  assert.equal((await f.request('/api/records/welder_customs_catalog', 'POST', { name: 'W10 Custom', abbreviation: 'W10', diameterFrom: '50', diameterTo: '100', wtFrom: '3', wtTo: '12' })).status, 201);
  assert.equal((await f.request('/api/records/diameters', 'POST', { diameter: '10"' })).status, 422);
  assert.equal((await f.request('/api/records/diameters', 'POST', { diameter: '10"', size: 273.1, sizeinch: 10, outline: 858 })).status, 201);
  // Type of material: type of steel is required and the list column is derived.
  assert.equal((await f.request('/api/records/material_types', 'POST', { name: 'A105' })).status, 422);
  response = await f.request('/api/records/material_types', 'POST', { name: 'A105', typeOfSteel: 'Carbon steel', iso15608: '1.2', asmePNumber: 'P-1', asmeGroup: '2', isoAsme: 'client value' });
  assert.equal(response.status, 201); assert.equal((await json(response)).record.isoAsme, '1.2 / P-1 Gr 2');
  assert.equal((await f.request('/api/records/material_types', 'POST', { name: 'Bad', typeOfSteel: 'Carbon steel', iso15608: '99.9' })).status, 422);
  // Welding wire index numbers are generated when left empty.
  response = await f.request('/api/records/welding_wires', 'POST', { siteId: 'site-north', classification: 'ER70S-6', diameter: 1.6, chargeNo: 'C-1', certType: '3.1', controlled: true, allProjects: true });
  assert.equal(response.status, 201); const first = (await json(response)).record.name; assert.match(first, /^\d{4}$/);
  assert.equal((await json(await f.request('/api/records/welding_wires', 'POST', { siteId: 'site-north', classification: 'ER316LSi', allProjects: true }))).record.name, String(Number(first) + 1).padStart(4, '0'));
  // The full profile keeps its old behaviour: no abbreviation needed, no generated number.
  const full = new Store(':memory:'); assert.equal(full.hostedRules, false);
  assert.ok(full.create('roles', { name: 'Welder' })); assert.equal(full.create('welding_wires', { name: 'FULL-1' }).name, 'FULL-1');
  full.close();
});

test('hosted rules: mandatory certificate fields of the main project, project links and numbering per main project', async t => {
  const f = await fixture(t); await f.setup();
  const complete = { name: 'ATT-900', chargeNo: 'H-900', certType: '3.1', diameterId: 'diameter-6', materialPartId: 'part-0', materialTypeId: 'material-type-a106b', schedule: '40', wallThickness: '3.91' };
  // A certificate is created in a main project.
  let response = await f.request('/api/records/certifications', 'POST', { name: 'ATT-900' });
  assert.equal(response.status, 422); assert.ok((await json(response)).fields.siteId);
  // site-north has "Mandatory fields" on.
  response = await f.request('/api/records/certifications', 'POST', { name: 'ATT-900', siteId: 'site-north' });
  assert.equal(response.status, 422); const fields = (await json(response)).fields; assert.deepEqual(Object.keys(fields).sort(), ['certType', 'chargeNo', 'diameter', 'materialPartId', 'materialTypeId', 'schedule', 'wallThickness']);
  // site-river has it off: nothing extra is required, even for all projects (judged by the certificate's own main project).
  response = await f.request('/api/records/certifications', 'POST', { name: 'ATT-903', siteId: 'site-river', allProjects: true }); assert.equal(response.status, 201);
  response = await f.request('/api/records/certifications', 'POST', { name: 'ATT-901', siteId: 'site-river', allProjects: false, projectIds: ['project-steam'] }); assert.equal(response.status, 201);
  const loose = (await json(response)).record;
  // Index numbers count per main project: the riverside installation holds 0002 and 0005 (and ATT-903 took 0006).
  assert.equal(loose.indexNo, '0007');
  // Projects of another main project cannot be linked, and the main project of a certificate never moves.
  response = await f.request(`/api/records/certifications/${loose.id}`, 'PUT', { projectIds: ['project-cooling'], _version: loose._version });
  assert.equal(response.status, 422); assert.ok((await json(response)).fields.projectIds);
  assert.equal((await f.request(`/api/records/certifications/${loose.id}`, 'PUT', { siteId: 'site-north', _version: loose._version })).status, 422);
  response = await f.request('/api/records/certifications', 'POST', { ...complete, siteId: 'site-north', allProjects: false, projectIds: ['project-cooling'] }); assert.equal(response.status, 201);
  const created = (await json(response)).record;
  assert.equal(created.indexNo, '0007', 'north holds 0001, 0003, 0004 and 0006'); assert.equal(created.diameter, '2"', 'the diameter text follows the Weld diameter');
  assert.equal((await f.request('/api/records/certifications', 'POST', { ...complete, siteId: 'site-north', name: 'ATT-902', indexNo: created.indexNo })).status, 201, 'a typed index number is kept');
  // An attest number is optional in the hosted profile.
  response = await f.request('/api/records/certifications', 'POST', { ...complete, siteId: 'site-north', name: '' }); assert.equal(response.status, 201);
  const data = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  assert.deepEqual(data.rows.certificate_projects.filter(link => link.certificateId === created.id).map(link => link.projectId), ['project-cooling']);
  // A partial update is judged on the stored record: clearing a mandatory value is refused, other edits pass.
  assert.equal((await f.request(`/api/records/certifications/${created.id}`, 'PUT', { schedule: '', _version: created._version })).status, 422);
  assert.equal((await f.request(`/api/records/certifications/${created.id}`, 'PUT', { controlled: true, accepted: true, _version: created._version })).status, 200);
  // The seed links certificate 3 to the cooling project only: with project-specific certificates on it is not offered for the skid project.
  const site = data.rows.sites.find(item => item.id === 'site-north');
  const offered = certificatesForProject({ certificates: data.rows.certifications, links: data.rows.certificate_projects, projectId: 'project-skid', site }).map(item => item.id);
  assert.ok(offered.includes('certificate-1') && offered.includes('cert-h3305') && !offered.includes('certificate-3'));
});

test('welders: relations, Deleted tab cascade, expire warnings from the seed and validation', async t => {
  const f = await fixture(t); await f.setup();
  const data = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  assert.deepEqual(welderTabCounts(data.rows.welders), { active: 4, inactive: 1, deleted: 1 });
  const warnings = expiringQualifications(data.rows);
  assert.ok(warnings.some(item => item.status === 'expired') && warnings.some(item => item.status === 'expiring'));
  assert.ok(!warnings.some(item => item.welderId === 'welder-5'), 'inactive welders are not warned about');
  let response = await f.request('/api/records/welders', 'POST', { number: 'W-100', name: 'Lee Vos', status: 'Active', siteIds: ['site-north', 'site-river'], customIds: ['welder-custom-1'], combination: true, globallyDeployable: false });
  assert.equal(response.status, 201); const welder = (await json(response)).record;
  let rows = (await json(await f.request('/api/bootstrap')) as unknown as Bootstrap).rows;
  assert.deepEqual(rows.welder_sites.filter(link => link.welderId === welder.id).map(link => link.siteId).sort(), ['site-north', 'site-river']);
  assert.deepEqual(rows.welder_customs.filter(link => link.welderId === welder.id).map(link => link.customId), ['welder-custom-1']);
  assert.equal((await f.request('/api/records/welders', 'POST', { number: 'W-100', name: 'Duplicate' })).status, 409);
  assert.equal((await f.request('/api/records/welders', 'POST', { name: 'No number' })).status, 422);
  // A qualification needs a consistent expiry date.
  assert.equal((await f.request('/api/records/welder_certificates', 'POST', { name: 'WQ-X', welderId: welder.id, issuedAt: '2026-05-01', expiresAt: '2026-04-01' })).status, 422);
  response = await f.request('/api/records/welder_certificates', 'POST', { name: 'WQ-X', welderId: welder.id, issuedAt: '2026-05-01', expiresAt: '2027-05-01', position: 'PF', weldKind: 'BW', system: 'EN', diameterFrom: 21.3, diameterTo: 60.3 }); assert.equal(response.status, 201);
  const qualification = (await json(response)).record;
  // Deleting the welder takes the qualification along; restoring brings it back.
  assert.equal((await f.request(`/api/records/welders/${welder.id}/archive`, 'POST', { _version: welder._version })).status, 200);
  rows = (await json(await f.request('/api/bootstrap')) as unknown as Bootstrap).rows;
  assert.equal(rows.welders.find(row => row.id === welder.id)?._archived, true);
  assert.equal(rows.welder_certificates.find(row => row.id === qualification.id)?._archived, true);
  const archived = rows.welders.find(row => row.id === welder.id)!;
  assert.equal((await f.request(`/api/records/welders/${welder.id}/archive`, 'POST', { _version: archived._version })).status, 200);
  rows = (await json(await f.request('/api/bootstrap')) as unknown as Bootstrap).rows;
  assert.equal(rows.welder_certificates.find(row => row.id === qualification.id)?._archived, false);
});

test('pilot boundary: welder data stays in Weld Pilot, shared catalogs open in both, read-only never writes', async t => {
  const f = await fixture(t); await f.setup();
  await f.signIn('Both pilots', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  for (const key of ['welders', 'roles', 'certificate_types', 'welder_customs_catalog', 'welder_certificates', 'welding_wires', 'diameters', 'welder_sites']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, `weld ${key}`);
  for (const key of ['material_parts', 'material_types', 'certifications', 'certificate_projects']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, `weld ${key}`);
  f.usePilot('mto');
  for (const key of ['welders', 'roles', 'certificate_types', 'welder_customs_catalog', 'welder_certificates', 'welding_wires', 'diameters', 'welder_sites', 'wire_projects']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, `mto ${key}`);
  assert.equal((await f.request('/api/records/roles', 'POST', { name: 'Denied', abbreviation: 'DEN' })).status, 403);
  assert.equal((await f.request('/api/records/welders', 'POST', { number: 'W-DENIED' })).status, 403);
  for (const key of ['material_parts', 'material_types', 'certifications', 'certificate_projects']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, `mto ${key}`);
  const bootstrap = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  for (const key of ['welders', 'welder_certificates', 'welding_wires', 'roles']) assert.equal(bootstrap.rows[key], undefined, key);
  assert.equal((await f.request('/api/records/material_types', 'POST', { name: 'A234 WPB', typeOfSteel: 'Carbon steel', iso15608: '1.1' })).status, 201, 'material data is shared');
  f.usePilot('weld');
  await f.signIn('Weld viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await f.request('/api/records/welders')).status, 200);
  assert.equal((await f.request('/api/records/roles', 'POST', { name: 'Denied', abbreviation: 'DEN' })).status, 403);
  assert.equal((await f.request('/api/records/welder_certificates', 'POST', { name: 'Denied', welderId: 'welder-1' })).status, 403);
  assert.equal((await f.request('/api/records/material_parts', 'POST', { name: 'Denied' })).status, 403);
  assert.equal((await f.request('/api/records/welders/welder-1/archive', 'POST', { _version: 1 })).status, 403);
  await f.signIn('Materials only', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/records/welders')).status, 403, 'not enabled for Weld Pilot');
});
