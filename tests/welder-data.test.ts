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
import { availabilityFor, HOSTED_RELEASE_PROFILE, pageAvailable, projectResource } from '../shared/release.ts';
import { PILOT_MAP, pilotItemResources } from '../shared/pilots.ts';
import { ASME_P_NUMBERS, WELDER_PAGE_SIZES, DEFAULT_WELDER_PAGE_SIZE, activeText, defaultWelderSite, isWelderRole, hostedFieldOrder, roleText, welderOnSite, welderOptionLabel, CERTIFICATE_MANDATORY, ISO_15608_GROUPS, NO_WELDER_FILTER, certificateMandatoryErrors, certificatesForProject, expiringQualifications, filterWelders, welderFilterCount, type WelderCardFilter, isoAsmeLabel, linkedToProject, nextIndexNumber, rangeErrors, welderTab, welderTabCounts } from '../shared/welder-data.ts';
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
  const list = expiringQualifications(rows, TODAY);
  assert.deepEqual(list.map(item => item.id), ['q-expired', 'q-today', 'q-soon', 'q-edge']);
  assert.deepEqual(list.map(item => item.message), ['Expired', 'Expires today', 'Expires in 1 day', 'Expires in 30 days']);
  assert.deepEqual(list.map(item => item.status), ['expired', 'expiring', 'expiring', 'expiring']);
  assert.equal(list[0].welder, 'W-001 | Alex Taylor'); assert.equal(list[0].welderId, 'w1');
  assert.equal(list[0].qualification, 'WQ-1 | W01 | 141 — TIG | ISO 9606-1');
  // Nothing is listed outside its own notify days, and nothing with notifications off.
  const own = (extra: Record<string, unknown>) => expiringQualifications({ ...rows, welder_certificates: [row('x', { name: 'WQ-X', welderId: 'w1', expiresAt: '2026-12-06', ...extra })] }, TODAY).map(item => item.id);
  assert.deepEqual(own({ notifyDays: 10 }), [], 'expires in 20 days, notify 10');
  assert.deepEqual(own({ notifyDays: 30 }), ['x']);
  assert.deepEqual(own({ notifyDays: 30, notify: false }), []);
  assert.deepEqual(own({ notifyDays: 10, expiresAt: '2025-01-01' }), ['x'], 'expired entries are always listed');
  assert.deepEqual(own({ expiresAt: '2026-12-16' }), ['x'], 'no notify days of its own: 30');
});

test('filter welders: a welder matches when one of his card lines carries the chosen value (exact name)', () => {
  const welders = [row('w1'), row('w2'), row('w3')];
  const options = [row('o-fm1', { list: 'wire', name: 'FM1' }), row('o-fm2', { list: 'wire', name: 'FM2' }), row('o-141', { list: 'process', name: '141' }), row('o-bw', { list: 'bw', name: 'BW' }), row('o-fw', { list: 'bw', name: 'FW' }), row('o-en', { list: 'asme', name: 'EN' })];
  const line = (id: string, welderId: string, wireId: string, bwId: string, extra: Record<string, unknown> = {}) => row(id, { welderId, wireId, processId: 'o-141', bwId, asmeId: 'o-en', ...extra });
  const rows = { weldercard_options: options, welder_card_lines: [line('a', 'w1', 'o-fm2', 'o-bw'), line('b', 'w2', 'o-fm1', 'o-fw'), line('c', 'w3', 'o-fm2', 'o-fw', { _archived: true })] };
  const ids = (filter: Partial<WelderCardFilter>) => filterWelders(welders, rows, { ...NO_WELDER_FILTER, ...filter }).map(item => item.id);
  assert.deepEqual(ids({}), ['w1', 'w2', 'w3'], 'no value chosen: nobody is filtered out');
  assert.deepEqual(ids({ wire: 'FM2' }), ['w1'], 'only welders with a card line FM2 (an archived line does not count)');
  assert.deepEqual(ids({ wire: 'FM1' }), ['w2']);
  assert.deepEqual(ids({ wire: 'FM' }), [], 'exact, not a prefix');
  assert.deepEqual(ids({ bw: 'FW', process: '141', asme: 'EN' }), ['w2']);
  assert.deepEqual(ids({ wire: 'FM2', bw: 'FW' }), [], 'every chosen value must hold on the same line');
  assert.equal(welderFilterCount({ ...NO_WELDER_FILTER, wire: 'FM2', bw: 'BW' }), 2);
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
  // Customs describe welding process groups: they sit under Weld data (after Spools), not under Welder data.
  const groupItems = (title: string) => PILOT_MAP.weld.groups.find(group => group.title === title)!.items.map(item => item.label);
  assert.deepEqual(groupItems('Welder data'), ['Welders', 'Roles', 'Certificates']); assert.deepEqual(groupItems('Weld data').slice(-2), ['Spools', 'Customs']);
  assert.equal(PILOT_MAP.weld.groups.find(group => group.title === 'Weld data')!.items.find(item => item.label === 'Customs')!.resource, 'welder_customs_catalog'); assert.equal(RESOURCE_MAP.welder_customs_catalog.group, 'Weld data');
  for (const item of items.filter(item => item.label !== 'Material supplier')) for (const key of pilotItemResources(item)) assert.ok(hosted.navigation.includes(key), `${item.label}: ${key}`);
  const view = (key: string) => projectResource(hosted, RESOURCE_MAP[key]);
  const labels = (key: string) => view(key).columns.map(name => view(key).fields.find(field => field.name === name)?.label);
  assert.deepEqual(labels('roles'), ['Role', 'Abbreviation', 'Max amount tasks', 'Lead role?']);
  // The Roles page words its title and dialogs as the reference does (capture weld__welder__roles.txt); the full profile keeps its own.
  assert.deepEqual([view('roles').title, view('roles').wording], ['Roles', { add: 'Add Role', edit: 'Edit role', remove: 'Delete role' }]);
  assert.equal(RESOURCE_MAP.roles.title, 'Welder roles');
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
  return { store, request, origin, cookie: () => cookie, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Welder admin', email: 'welder-admin@example.test', password })).status, 201) };
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
  assert.equal((await f.request('/api/records/diameters', 'POST', { diameter: '99"' })).status, 422);
  assert.equal((await f.request('/api/records/diameters', 'POST', { diameter: '99"', size: 273.1, sizeinch: 99, outline: 858 })).status, 201);
  // Type of material: type of steel is required and the list column is derived.
  assert.equal((await f.request('/api/records/material_types', 'POST', { name: 'A105' })).status, 422);
  response = await f.request('/api/records/material_types', 'POST', { name: 'A105', typeOfSteel: 'Carbon steel', iso15608: '1.2', asmePNumber: 'P-1', asmeGroup: '2', isoAsme: 'client value' });
  assert.equal(response.status, 201); assert.equal((await json(response)).record.isoAsme, '1.2 / P-1 Gr 2');
  // The group is choose-or-type: a value that is not in the list is accepted (see tests/material-data.test.ts).
  assert.equal((await f.request('/api/records/material_types', 'POST', { name: 'Bad', typeOfSteel: 'Carbon steel', iso15608: '99.9' })).status, 201);
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

test('expire warning lines read like the reference: one line, welder number, "Custom - <custom>", dd.mm.yyyy, status', () => {
  const rows = {
    welders: [row('w1', { number: 'W01', name: 'Alex Taylor', status: 'Active' })],
    welder_customs_catalog: [row('c1', { name: '141|FM1-FM2|ISO9606-1', abbreviation: '141|FM1-FM2|ISO9606-1' })],
    welder_certificates: [
      row('q1', { name: 'WQ-1', welderId: 'w1', customId: 'c1', expiresAt: '2024-04-04' }),
      row('q2', { name: 'Summary list', welderId: 'w1', isDocument: true, expiresAt: '2026-01-07' }),
      row('q3', { name: 'WQ-1', welderId: 'w1', customId: 'c1', expiresAt: '2024-04-04' }),
    ],
  };
  const list = expiringQualifications(rows, TODAY);
  assert.equal(list[0].text, 'W01 Custom - 141|FM1-FM2|ISO9606-1 · 04.04.2024 Expired');
  assert.equal(list.length, 3, 'duplicates are listed as they are');
  assert.ok(list.some(item => item.text === 'W01 Summary list · 07.01.2026 Expired'), 'an expired document is warned about like a qualification');
});

test('welders list helpers: Yes / No, role abbreviation, page sizes, project scope and option text', () => {
  assert.equal(activeText(row('a', { status: 'Active' })), 'Yes'); assert.equal(activeText(row('b', { status: 'Inactive' })), 'No');
  assert.deepEqual(WELDER_PAGE_SIZES, [10, 25, 50, 100]); assert.equal(DEFAULT_WELDER_PAGE_SIZE, 25);
  assert.equal(roleText(row('r', { name: 'Welder', abbreviation: 'WE' })), 'WE'); assert.equal(roleText(row('r', { name: 'Welder' })), 'Welder'); assert.equal(roleText(undefined), '');
  assert.equal(defaultWelderSite('site-north'), 'site-north'); assert.equal(defaultWelderSite(''), '');
  const welder = row('w', { globallyDeployable: false }), global = row('g', { globallyDeployable: true });
  assert.equal(welderOnSite(welder, ['site-river'], 'site-north'), false, 'a welder of another project is not listed');
  assert.equal(welderOnSite(welder, ['site-north'], 'site-north'), true); assert.equal(welderOnSite(global, [], 'site-north'), true); assert.equal(welderOnSite(welder, [], ''), true, 'All');
  assert.equal(welderOptionLabel(row('w', { number: 'W-001', name: 'Alex Taylor' })), 'W-001 Alex Taylor'); assert.equal(welderOptionLabel(row('w', { number: 'W-002', name: '' })), 'W-002');
  assert.equal(isWelderRole(row('r', { name: 'Welder' })), true); assert.equal(isWelderRole(row('r', { name: 'Welding foreman' })), false);
});

test('hosted Add welder form: reference order, Welder 1 / 2 only for a combination, no Role, placeholders', () => {
  const view = projectResource(hosted, RESOURCE_MAP.welders);
  const names = view.fields.filter(field => !field.hidden).map(field => field.name);
  const wanted = ['number', 'name', 'welderCode', 'address', 'zip', 'residence', 'phone', 'email', 'status', 'companyId', 'welder1Id', 'welder2Id', 'dob', 'currentlyOn', 'globallyDeployable', 'combination'];
  assert.deepEqual(names.filter(name => wanted.includes(name)), wanted);
  assert.ok(!names.includes('roleId'), 'no Role field');
  for (const name of ['welder1Id', 'welder2Id']) assert.deepEqual(view.fields.find(field => field.name === name)?.showIf, ['combination', true]);
  assert.equal(view.fields.find(field => field.name === 'welder1Id')?.blank, '--------'); assert.equal(view.fields.find(field => field.name === 'companyId')?.blank, '---- Without company ----');
  assert.ok(view.fields.every(field => !field.section), 'one flat list');
  // Relation fields join the same order: Active on projects sits before Globally deployable and Combination.
  const order = hostedFieldOrder('welders', [{ name: 'globallyDeployable' }, { name: 'combination' }, { name: 'siteIds' }, { name: 'currentlyOn' }, { name: 'description' }, { name: 'customIds' }]).map(field => field.name);
  assert.deepEqual(order, ['currentlyOn', 'siteIds', 'globallyDeployable', 'combination', 'description', 'customIds']);
  // Other profiles keep the shared form.
  assert.equal(RESOURCE_MAP.welders.fields.find(field => field.name === 'roleId')?.hidden, undefined);
});

test('Add welder custom opens with 0.00 ranges (0.00 to 0.00 is a valid range)', () => {
  const view = projectResource(hosted, RESOURCE_MAP.welder_customs_catalog);
  for (const name of ['diameterFrom', 'diameterTo', 'wtFrom', 'wtTo']) assert.equal(view.fields.find(field => field.name === name)?.default, '0.00', name);
  assert.equal(RESOURCE_MAP.welder_customs_catalog.fields.find(field => field.name === 'diameterFrom')?.default, undefined, 'other profiles unchanged');
  assert.deepEqual(rangeErrors({ diameterFrom: '0.00', diameterTo: '0.00' }, [['diameterFrom', 'diameterTo', 'Diameter']]), {});
});

test('hosted welders: new welder gets the Welder role, Welder role cannot be deleted, deactivate by status, sample data', async t => {
  const f = await fixture(t); await f.setup();
  const data = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  const welderRole = data.rows.roles.find(role => role.name === 'Welder')!;
  assert.equal(welderRole.abbreviation, 'WE');
  // Sample customs are named like the reference's: no welder code, no "Custom -", abbreviation equals name.
  for (const custom of data.rows.welder_customs_catalog) { assert.doesNotMatch(String(custom.name), /^W\d|Custom -/); assert.equal(custom.abbreviation, custom.name); }
  let response = await f.request('/api/records/welders', 'POST', { number: 'W-200', name: 'No Role' }); assert.equal(response.status, 201);
  const created = (await json(response)).record; assert.equal(created.roleId, welderRole.id);
  // Welder 1 / Welder 2 belong to a combination only.
  response = await f.request('/api/records/welders', 'POST', { number: 'W-201', name: 'Single', combination: false, welder1Id: created.id }); assert.equal(response.status, 201);
  assert.equal((await json(response)).record.welder1Id, '');
  response = await f.request('/api/records/welders', 'POST', { number: 'W-202', name: 'Pair', combination: true, welder1Id: created.id }); assert.equal(response.status, 201);
  assert.equal((await json(response)).record.welder1Id, created.id);
  // Deactivate / Activate is an ordinary update of the status.
  response = await f.request(`/api/records/welders/${created.id}`, 'PUT', { status: 'Inactive', _version: created._version }); assert.equal(response.status, 200);
  const inactive = (await json(response)).record; assert.equal(welderTab(inactive), 'inactive');
  response = await f.request(`/api/records/welders/${created.id}`, 'PUT', { status: 'Active', _version: inactive._version }); assert.equal(welderTab((await json(response)).record), 'active');
  // The Welder role is not deletable; another role is.
  response = await f.request(`/api/records/roles/${welderRole.id}/archive`, 'POST', { _version: welderRole._version }); assert.equal(response.status, 422); assert.match((await json(response)).error || (await json(response)).message || '', /Welder role/);
  const other = (await json(await f.request('/api/records/roles', 'POST', { name: 'Inspector', abbreviation: 'INS' }))).record;
  assert.equal((await f.request(`/api/records/roles/${other.id}/archive`, 'POST', { _version: other._version })).status, 200);
});

test('qualifications and documents carry their own Notify (days) and notification switch; photo is stored as a welder file', async t => {
  const f = await fixture(t); await f.setup();
  const view = projectResource(hosted, RESOURCE_MAP.welder_certificates);
  for (const name of ['notifyDays', 'notify']) assert.ok(view.fields.find(field => field.name === name && !field.hidden), name);
  assert.equal(view.fields.find(field => field.name === 'notifyDays')?.label, 'Notify (days)');
  assert.deepEqual(view.fields.find(field => field.name === 'customId')?.showIf, ['isDocument', false], 'a document has no qualification fields');
  const data = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  assert.ok(data.rows.welder_certificates.some(item => item.isDocument === true && item.name === 'Summary list'), 'sample document');
  const response = await f.request('/api/records/welder_certificates', 'POST', { name: 'Medical certificate', welderId: 'welder-1', isDocument: true, expiresAt: '2030-01-01', notifyDays: 10 });
  assert.equal(response.status, 201); const record = (await json(response)).record; assert.equal(record.notify, true); assert.equal(record.notifyDays, 10);
  assert.equal((await f.request(`/api/records/welder_certificates/${record.id}`, 'PUT', { notify: false, _version: record._version })).status, 200);
  // Photo: stored through /files with documentType 'Photo' on the welder.
  const body = new FormData(); body.set('file', new Blob(['png'], { type: 'image/png' }), 'photo.png'); body.set('entityType', 'welders'); body.set('entityId', 'welder-1'); body.set('documentType', 'Photo');
  const upload = await fetch(f.origin + '/api/files', { method: 'POST', body, headers: { 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: f.origin, Cookie: f.cookie() } });
  assert.equal(upload.status, 201);
  const after = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  assert.equal(after.rows.attachments.filter(file => file.entityType === 'welders' && file.entityId === 'welder-1' && file.documentType === 'Photo').length, 1);
});

// ---------------------------------------------------------------------------------------------------------
// Wave 3: Weldercard settings, welder card, documents, Personnel data, wording of the welder dialogs
// ---------------------------------------------------------------------------------------------------------
import { CUSTOM_PREFIX, SUMMARY_LIST, WELDERCARD_LISTS, WELDERCARD_PATH, cardLineCells, cardOptions, customsOfWelder, documentNameOptions, documentWps, joinIds, joinWqNos, splitIds, splitWqNos, summaryListOf, welderCardLines, welderCardModel, welderDocuments, welderWqNumbers, wqNoOf } from '../shared/welder-data.ts';
import { welderCardPdf } from '../server/pdf/welder-card.ts';

test('weld-catalogs-welder-weld-004: the seven weldercard lists exist in the reference order with a required name and a description', async t => {
  assert.deepEqual(WELDERCARD_LISTS.map(list => list.label), ['Welding wire', 'Weld process', 'Diameter', 'Pos', 'BW/FW', 'Thickness', 'ASME/EN']);
  assert.deepEqual(RESOURCE_MAP.weldercard_options.fields.filter(field => field.required).map(field => field.name).sort(), ['list', 'name']);
  assert.ok(RESOURCE_MAP.weldercard_options.fields.some(field => field.name === 'description'));
  assert.ok(Object.hasOwn(hosted.resources, 'weldercard_options') && Object.hasOwn(hosted.resources, 'welder_card_lines'), 'the hosted profile delivers both');
  assert.ok(pageAvailable(hosted, `/weld${WELDERCARD_PATH}`, RESOURCES), 'the settings page is delivered to the hosted profile');
  const f = await fixture(t); await f.setup();
  const data = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  const wires = cardOptions(data.rows.weldercard_options, 'wire');
  assert.deepEqual(wires.map(option => option.name), ['FM1', 'FM2', 'FM3', 'FM4', 'FM5', 'FM6'], 'the sample values of the reference');
  assert.equal(wires.find(option => option.name === 'FM2')?.description, 'CS (dekt ook FM1)');
  let response = await f.request('/api/records/weldercard_options', 'POST', { list: 'wire', name: '' }); assert.equal(response.status, 422); assert.match((await json(response)).fields.name, /required/i);
  response = await f.request('/api/records/weldercard_options', 'POST', { list: 'nonsense', name: 'X' }); assert.equal(response.status, 422);
  response = await f.request('/api/records/weldercard_options', 'POST', { list: 'wire', name: 'FM7', description: 'Duplex' }); assert.equal(response.status, 201);
  const created = (await json(response)).record;
  assert.equal((await f.request('/api/records/weldercard_options', 'POST', { list: 'wire', name: 'FM7' })).status, 409, 'a name is unique within its list');
  assert.equal((await f.request('/api/records/weldercard_options', 'POST', { list: 'process', name: 'FM7' })).status, 201, 'the same name may exist in another list');
  response = await f.request(`/api/records/weldercard_options/${created.id}`, 'PUT', { description: 'Duplex steel', _version: created._version }); assert.equal(response.status, 200);
  // Delete = archive underneath, also while a card line still uses the value (the line keeps showing it).
  const line = await f.request('/api/records/welder_card_lines', 'POST', { welderId: 'welder-2', wireId: created.id, processId: 'weldercard-process-1', diameterId: 'weldercard-dia-1', thicknessId: 'weldercard-dikte-1', bwId: 'weldercard-bw-1', posId: 'weldercard-pos-1', asmeId: 'weldercard-asme-1' });
  assert.equal(line.status, 201);
  assert.equal((await f.request(`/api/records/weldercard_options/${created.id}/archive`, 'POST', { _version: 2 })).status, 200);
  const after = await json(await f.request('/api/bootstrap')) as unknown as Bootstrap;
  assert.equal(cardLineCells(after.rows.welder_card_lines.find(item => item.welderId === 'welder-2')!, after.rows.weldercard_options)[0], 'FM7');
  assert.ok(!cardOptions(after.rows.weldercard_options, 'wire').some(option => option.name === 'FM7'), 'the deleted value is no longer offered');
});

test('weld-catalogs-welder-weld-003: adding a card line FM2 / 141 / BW stores it on the welder and the welder card PDF lists it', async t => {
  const f = await fixture(t); await f.setup();
  const id = (list: string, name: string) => f.store.list('weldercard_options').find(option => option.list === list && option.name === name)!.id;
  const input = { welderId: 'welder-2', wireId: id('wire', 'FM2'), processId: id('process', '141'), diameterId: id('dia', '21,30-42,60'), thicknessId: id('dikte', '3,00-22,00'), bwId: id('bw', 'BW'), posId: id('pos', 'PA,PC,PE,PF'), asmeId: id('asme', 'EN') };
  let response = await f.request('/api/records/welder_card_lines', 'POST', { ...input, wireId: id('process', '141') });
  assert.equal(response.status, 422); assert.match((await json(response)).fields.wireId, /Welding wire/, 'a value of another list is refused');
  response = await f.request('/api/records/welder_card_lines', 'POST', { ...input, bwId: '' }); assert.equal(response.status, 422, 'every list needs a value');
  response = await f.request('/api/records/welder_card_lines', 'POST', { ...input, wqNos: 'NOT-HIS-NUMBER' }); assert.equal(response.status, 422); assert.match((await json(response)).fields.wqNos, /this welder/);
  const own = welderWqNumbers(f.store.list('welder_certificates'), 'welder-2');
  assert.ok(own.length > 0, 'the sample welder has WQ numbers');
  response = await f.request('/api/records/welder_card_lines', 'POST', { ...input, wqNos: own.join('\n') }); assert.equal(response.status, 201);
  const line = (await json(response)).record;
  assert.equal(line.welderId, 'welder-2'); assert.equal(line.wqNos, own.join('\n'));
  const rows = { welders: f.store.list('welders'), welder_card_lines: f.store.list('welder_card_lines'), weldercard_options: f.store.list('weldercard_options') };
  const model = welderCardModel(rows, 'welder-2')!;
  assert.deepEqual(model.columns, ['#', 'Welding wire', 'Weld process', 'Diameter', 'Thickness', 'BW/FW', 'POS', 'ASME/EN', 'WQ No']);
  assert.deepEqual(model.lines[0].cells.slice(0, 7), ['1', 'FM2', '141', '21,30-42,60', '3,00-22,00', 'BW', 'PA,PC,PE,PF']);
  assert.match(model.heading, /^Welder ID Nr\.: .+ Name: Robin Lane$/);
  const { bytes } = await welderCardPdf(rows, 'welder-2', new Date('2026-11-16T10:00:00Z'));
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  // The PDF is served to an account that may print welders, and only for a welder it can read.
  const pdf = await f.request('/api/pdf/welder-card?welderId=welder-2'); assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal((await f.request('/api/pdf/welder-card?welderId=missing')).status, 404);
  // The line goes away with a delete (archive underneath).
  assert.equal((await f.request(`/api/records/welder_card_lines/${line.id}/archive`, 'POST', { _version: line._version })).status, 200);
  assert.deepEqual(welderCardLines(f.store.list('welder_card_lines'), 'welder-2'), []);
  // A read-only account neither adds nor deletes lines.
  await f.signIn('Weld viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await f.request('/api/records/welder_card_lines', 'POST', { ...input, wqNos: own.join('\n') })).status, 403);
  assert.equal((await f.request('/api/records/weldercard_options', 'POST', { list: 'wire', name: 'FM8' })).status, 403);
  // Mto Pilot does not reach the welder card records.
  f.usePilot('mto'); assert.equal((await f.request('/api/records/welder_card_lines')).status, 403); assert.equal((await f.request('/api/pdf/welder-card?welderId=welder-2')).status, 403);
});

test('welder card helpers: WQ numbers and ids are stored as one text each and read back without empties or repeats', () => {
  assert.deepEqual(splitWqNos('A 1\n\n B 2 \nA 1'), ['A 1', 'B 2']); assert.equal(joinWqNos(['A 1', ' ', 'B 2', 'A 1']), 'A 1\nB 2');
  assert.deepEqual(splitIds('w1, w2,,w1'), ['w1', 'w2']); assert.equal(joinIds(['w2', 'w1', 'w2']), 'w2,w1'); assert.deepEqual(splitIds(undefined), []);
  const lines = [row('l2', { welderId: 'w1', _createdAt: '2026-02-01' }), row('l1', { welderId: 'w1', _createdAt: '2026-01-01' }), row('x', { welderId: 'w2' }), row('g', { welderId: 'w1', _archived: true })];
  assert.deepEqual(welderCardLines(lines, 'w1').map(line => line.id), ['l1', 'l2'], 'oldest first, archived and other welders left out');
});

test('weld-catalogs-welder-weld-009: the document Name options are Summary list, then Custom - …, then Certificate - … in creation order', () => {
  const customs = [row('c2', { name: 'GTAW|ASME', _createdAt: '2026-02-01' }), row('c1', { name: '141|FM1-FM2|ISO9606-1', _createdAt: '2026-01-01' }), row('c3', { name: 'gone', _archived: true })];
  const certificates = [row('t1', { name: 'Ademlucht', _createdAt: '2026-01-01' }), row('t2', { name: 'Medical', _createdAt: '2026-03-01' })];
  assert.deepEqual(documentNameOptions(customs, certificates), [SUMMARY_LIST, 'Custom - 141|FM1-FM2|ISO9606-1', 'Custom - GTAW|ASME', 'Certificate - Ademlucht', 'Certificate - Medical']);
  assert.deepEqual(documentNameOptions([], []), ['Summary list']);
});

test('weld-catalogs-welder-weld-009: a document with WPS [A, B], expiring in 10 days with Notify 14 shows in Expire warnings; its bell off hides it', async t => {
  const wps = [row('wps-a', { name: '11.015' }), row('wps-b', { name: '11.016 rv.1' })];
  const welder = row('w1', { number: 'W01', name: 'Alex Taylor', status: 'Active' });
  const document = row('d1', { name: 'Summary list', welderId: 'w1', isDocument: true, wpsIds: 'wps-b,wps-a', wqNo: 'ROT 2023.95697', expiresAt: '2026-11-26', notifyDays: 14, notify: true });
  const warnings = (certificate: Row) => expiringQualifications({ welders: [welder], welder_certificates: [certificate] }, TODAY);
  assert.deepEqual(warnings(document).map(item => item.id), ['d1']); assert.equal(warnings(document)[0].message, 'Expires in 10 days');
  assert.deepEqual(warnings({ ...document, notify: false }).map(item => item.id), [], 'the bell off hides it');
  assert.deepEqual(warnings({ ...document, notifyDays: 5 }).map(item => item.id), [], 'outside its own Notify days');
  assert.deepEqual(warnings({ ...document, notifyDays: null, expiresAt: '2026-12-10' }).map(item => item.id), ['d1'], 'Notify (days) left empty counts as 30');
  assert.deepEqual(documentWps(document, wps), ['11.015', '11.016 rv.1'], 'the WPS numbers read back sorted');
  // The same through the server: both WPS are stored on the document, a WPS that does not exist is refused, and the bell is one update.
  const f = await fixture(t); await f.setup();
  const second = f.store.create('wps', { name: '11.016 rv.1', method: '141', definition: 'Second sample procedure', jointType: 'BW', allProjects: true, processId: 'process-0', standard: 'ISO 15609-1' });
  const ids = joinIds(['wps-1', second.id]);
  let response = await f.request('/api/records/welder_certificates', 'POST', { name: SUMMARY_LIST, welderId: 'welder-1', isDocument: true, wpsIds: ids, wqNo: 'ROT 1', note: 'checked', expiresAt: '2030-01-01', notifyDays: 14 });
  assert.equal(response.status, 201); const stored = (await json(response)).record;
  assert.equal(stored.wpsIds, ids); assert.equal(stored.wqNo, 'ROT 1'); assert.equal(stored.note, 'checked'); assert.equal(stored.notify, true);
  response = await f.request('/api/records/welder_certificates', 'POST', { name: SUMMARY_LIST, welderId: 'welder-1', isDocument: true, wpsIds: 'no-such-wps' }); assert.equal(response.status, 422); assert.match((await json(response)).fields.wpsIds, /WPS/);
  response = await f.request('/api/records/welder_certificates', 'POST', { name: SUMMARY_LIST, welderId: 'welder-1', isDocument: true, notifyDays: '' }); assert.equal(response.status, 201, 'Notify (days) may stay empty');
  response = await f.request(`/api/records/welder_certificates/${stored.id}`, 'PUT', { notify: false, _version: stored._version }); assert.equal(response.status, 200); assert.equal((await json(response)).record.notify, false);
});

test('weld-catalogs-welder-weld-003: Personnel data lists the documents by expire date and links the Summary list only when there is one', () => {
  const documents = [row('late', { name: 'Custom - B', welderId: 'w1', expiresAt: '2026-04-24', wqNo: 'ROT 2' }), row('none', { name: 'Certificate - X', welderId: 'w1', isDocument: true }), row('summary', { name: SUMMARY_LIST, welderId: 'w1', isDocument: true, expiresAt: '2026-01-07', wqNo: 'ROT 1' }), row('early', { name: 'Custom - A', welderId: 'w1', expiresAt: '2024-04-04' }), row('other', { name: 'Custom - Z', welderId: 'w2' }), row('gone', { name: 'Custom - Y', welderId: 'w1', _archived: true })];
  const listed = welderDocuments(documents, 'w1');
  assert.deepEqual(listed.map(item => item.id), ['early', 'summary', 'late', 'none'], 'by expire date ascending, without a date last; other welders and archived ones are left out');
  assert.equal(summaryListOf(listed)?.id, 'summary');
  assert.equal(summaryListOf(listed.filter(item => item.id !== 'summary')), undefined, 'no Summary list document: no link');
  assert.deepEqual(welderWqNumbers(documents, 'w1'), ['ROT 1', 'ROT 2'], 'the WQ numbers sorted, each once');
  assert.equal(wqNoOf(row('q', { name: 'WQ-2024-0412', welderId: 'w1' })), 'WQ-2024-0412', 'a qualification saved before has its certificate number as WQ number');
  assert.equal(wqNoOf(row('d', { name: SUMMARY_LIST, isDocument: true })), '');
});

test('w1-left-8: the Customs column lists the customs named on the welder\'s documents, each once', () => {
  const customs = [row('c1', { name: '141|FM1-FM2|ISO9606-1' })];
  const certificates = [row('a', { welderId: 'w1', name: `${CUSTOM_PREFIX}141|FM1-FM2|ISO9606-1/NEN3650`, expiresAt: '2024-04-04' }), row('b', { welderId: 'w1', name: `${CUSTOM_PREFIX}GTAW|ASME`, expiresAt: '2026-01-27' }), row('c', { welderId: 'w1', name: `${CUSTOM_PREFIX}141|FM1-FM2|ISO9606-1/NEN3650`, expiresAt: '2026-04-04' }), row('d', { welderId: 'w1', name: SUMMARY_LIST, isDocument: true }), row('e', { welderId: 'w2', name: `${CUSTOM_PREFIX}Other` })];
  assert.deepEqual(customsOfWelder(certificates, 'w1', customs), ['141|FM1-FM2|ISO9606-1/NEN3650', 'GTAW|ASME']);
  assert.deepEqual(customsOfWelder(certificates, 'w3', customs), []);
  // A qualification of before documents carried the name (a Custom link, a plain number) names its custom; the customIds links no longer decide.
  assert.deepEqual(customsOfWelder([row('old', { welderId: 'w1', name: 'WQ-2024-0412', customId: 'c1' })], 'w1', customs), ['141|FM1-FM2|ISO9606-1']);
});

test('delta-I2a-001: Add Welder (Add / Cancel) and Edit personnel info (Update / Close) are the wording of the hosted welders resource', () => {
  const view = projectResource(hosted, RESOURCE_MAP.welders);
  assert.deepEqual(view.wording, { add: 'Add Welder', edit: 'Edit personnel info', remove: 'Delete', cancelEdit: 'Close' });
  assert.equal(RESOURCE_MAP.welders.wording, undefined, 'other profiles keep their wording');
  assert.equal(projectResource(undefined, RESOURCE_MAP.welders).wording, undefined);
});

test('delta-I2a-002: Edit personnel info has no Combination box (Welder 1 / 2 only for a combination welder); Active lists Inactive first in Add and Edit', () => {
  const view = projectResource(hosted, RESOURCE_MAP.welders);
  const names = (fields: { name: string; hidden?: boolean }[]) => fields.filter(field => !field.hidden).map(field => field.name);
  assert.ok(names(hostedFieldOrder('welders', view.fields)).includes('combination'), 'Add keeps Combination');
  const single = names(hostedFieldOrder('welders', view.fields, { combination: false }));
  for (const name of ['combination', 'welder1Id', 'welder2Id']) assert.ok(!single.includes(name), `edit of a single welder: no ${name}`);
  const pair = names(hostedFieldOrder('welders', view.fields, { combination: true }));
  assert.ok(pair.includes('welder1Id') && pair.includes('welder2Id') && !pair.includes('combination'), 'a combination welder keeps Welder 1 / Welder 2 (read-only fallback)');
  assert.deepEqual(names(hostedFieldOrder('welders', view.fields, {})).filter(name => ['status', 'companyId'].includes(name)), ['status', 'companyId'], 'the rest of the order is unchanged');
  const status = view.fields.find(field => field.name === 'status')!;
  assert.deepEqual(status.options, ['Inactive', 'Active']); assert.equal(status.default, 'Active');
  assert.deepEqual(RESOURCE_MAP.welders.fields.find(field => field.name === 'status')!.options, ['Active', 'Inactive'], 'the stored values stay valid for the other profiles');
});

test('w1-left-7: Roles words its title and Add Role as the reference does; the Welder role has no delete (server refusal stays)', async t => {
  const view = projectResource(hosted, RESOURCE_MAP.roles);
  assert.equal(view.title, 'Roles'); assert.equal(view.wording?.add, 'Add Role');
  const f = await fixture(t); await f.setup();
  const welderRole = f.store.list('roles').find(role => isWelderRole(role))!;
  const response = await f.request(`/api/records/roles/${welderRole.id}/archive`, 'POST', { _version: welderRole._version });
  assert.equal(response.status, 422); assert.match((await json(response)).error || '', /Welder role cannot be deleted/);
  // The list hides the delete action for exactly the rows the server refuses (client/records.tsx uses isWelderRole).
  assert.equal(isWelderRole(welderRole), true); assert.equal(isWelderRole(row('r', { name: 'Welding inspector' })), false);
});

// ----- wave 3 integration (E10): the Deactivate confirmation of the Welders list ------------------------------------------
test('E10: Deactivate asks "Set this welder inactive?" before the welder moves to the inactive tab; Activate asks nothing', async () => {
  const { WELDER_DEACTIVATE_CONFIRM } = await import('../shared/welder-data.ts');
  const { readFileSync } = await import('node:fs');
  assert.equal(WELDER_DEACTIVATE_CONFIRM, 'Set this welder inactive?');
  const source = readFileSync('client/welder-data.tsx', 'utf8');
  assert.match(source, /welder\.status === 'Inactive' \? void setActive\(welder, true\) : setDeactivating\(welder\)/, 'Activate at once, Deactivate through the question');
  assert.match(source, /<p>\{WELDER_DEACTIVATE_CONFIRM\}<\/p>[\s\S]{0,400}void setActive\(welder, false\)/, 'OK deactivates');
});
