import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, deliverResource, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { pilotScope, projectInPilot, projectScope } from '../shared/project-scope.ts';
import { wdiProgress } from '../shared/wdi.ts';
import { PROGRESS_FIELDS, PROGRESS_HELP, PROGRESS_MODEL, PROGRESS_PHASES, defectNorm, flangeStandard, mandatoryFields, ndtMeasurement, projectCertificates, repairPerformanceLimit, wpsValidation } from '../shared/site-settings.ts';
import type { Availability, Bootstrap } from '../shared/types.ts';

const valid = { weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10, fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60 };
const allRows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));

test('Iso progress weights are fixed in code (client change list 22.11.2026): Shop and Field 50 / 50, each phase 100', () => {
  assert.deepEqual(PROGRESS_MODEL.phases.map(phase => [phase.key, phase.weight]), [['shop', 50], ['field', 50]]);
  assert.deepEqual(PROGRESS_MODEL.phases[0].activities.map(item => [item.label, item.weight]), [['MTO / Cut-Bev / Fit-up', 40], ['Welding', 40], ['NDT', 10], ['Fabrication Book', 10]]);
  assert.deepEqual(PROGRESS_MODEL.phases[1].activities.map(item => [item.label, item.weight]), [['Spools erection / Fit-up', 30], ['Supports erection', 10], ['Welding', 20], ['NDT', 10], ['Pressure tests', 15], ['Reinstatement', 5], ['Final documentation', 10]]);
  // The help text of the form is built from the model: one line per activity, no "Site" and no input to fill in.
  assert.equal(PROGRESS_HELP.lines.length, 11); assert.ok(PROGRESS_HELP.lines.every(([term]) => !/Site|Distribution/.test(term)));
  // The legacy weight fields stay defined so older saves are accepted (the server answers 404 for unknown fields).
  assert.equal(PROGRESS_FIELDS.length, 16);
});

test('removed settings read their defaults whatever is stored: NDT inch-weighted, repair performance 5 %, no defect norm', () => {
  assert.deepEqual([repairPerformanceLimit({}), repairPerformanceLimit({ repairLimit: null }), repairPerformanceLimit({ repairLimit: 0 }), repairPerformanceLimit({ repairLimit: 3.5 })], [5, 5, 5, 5]);
  assert.deepEqual([defectNorm({}), defectNorm({ defectNorm: 'API 1104' }), defectNorm({ defectNorm: 'ISO 6520-1' })], [null, null, null]);
  assert.deepEqual([ndtMeasurement({}), ndtMeasurement({ ndtMeasurement: 'Per weld' })], ['inch-weighted', 'inch-weighted']);
  // The flange standard is still read from the site (the fallback of a flange without its own standard).
  assert.equal(flangeStandard({ flangeStandard: 'Gasunie CSW-43 table B' }), 'Gasunie CSW-43 table B'); assert.equal(flangeStandard({}), 'No catalog (free entry)');
  assert.deepEqual([mandatoryFields({}), wpsValidation(undefined), projectCertificates(null)], [false, false, false]);
  assert.deepEqual([mandatoryFields({ mandatoryFields: true }), wpsValidation({ wpsValidation: true }), projectCertificates({ projectCertificates: true })], [true, true, true]);
});

test('the hosted profile delivers every site setting and both pilot switches, other profiles stay as they were', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual(hosted.resources.sites, RESOURCE_MAP.sites.fields.map(field => field.name));
  assert.ok(['weldPilot', 'mtoPilot'].every(name => hosted.resources.projects.includes(name)));
  assert.ok(!hosted.resources.projects.includes('workingdays'), 'only the two pilot switches are added to projects');
  for (const profile of ['welding-demo', 'access-prototype'] as const) {
    const availability = availabilityFor(profile)!;
    assert.deepEqual(availability.resources.sites, ['name', 'address', 'zip', 'residence', 'phone', 'email'], profile);
    assert.ok(!availability.resources.projects.some(name => ['weldPilot', 'mtoPilot'].includes(name)), profile);
    assert.deepEqual(projectResource(availability, RESOURCE_MAP.sites).columns, ['name', 'residence', 'phone', 'email'].filter(name => availability.resources.sites.includes(name)), profile);
  }
  const site = projectResource(hosted, RESOURCE_MAP.sites);
  assert.deepEqual(site.columns, ['name', 'address', 'phone', 'email', 'irnCode']);
  const sections = [...new Set(site.fields.map(field => field.section || 'Details'))];
  // ISO Book follows Iso progress; it is a tab of Edit project site only (shell-general-012).
  assert.deepEqual(sections.slice(-4), ['Project settings', 'Document settings', 'Iso progress', 'ISO Book']);
  assert.deepEqual(site.fields.filter(field => field.section === 'Iso progress').map(field => field.name), PROGRESS_PHASES.flatMap(phase => [phase.field, ...phase.activities.map(activity => activity.field)]));
  const project = projectResource(hosted, RESOURCE_MAP.projects);
  assert.deepEqual(project.fields.filter(field => field.name === 'weldPilot' || field.name === 'mtoPilot').map(field => [field.name, field.label, field.default]), [['weldPilot', 'Weld Core', true], ['mtoPilot', 'Material Core', true]]);
  assert.deepEqual(availabilityFor('full'), undefined);
});

test('deliverResource adds a whole resource or only the named fields, keeps existing ones and registers the menu entry', () => {
  const availability: Availability = { resources: { sites: ['name'] }, actions: {}, reports: {}, inspectionTypes: [], navigation: [], features: [] };
  deliverResource(availability, 'sites', ['phone']);
  assert.deepEqual(availability.resources.sites, ['name', 'phone']); assert.deepEqual(availability.navigation, ['sites']);
  deliverResource(availability, 'companies'); deliverResource(availability, 'companies');
  assert.deepEqual(availability.resources.companies, RESOURCE_MAP.companies.fields.map(field => field.name)); assert.deepEqual(availability.navigation, ['sites', 'companies']);
  assert.throws(() => deliverResource(availability, 'nothing'), /Unknown resource/);
});

test('the store never rejects a site because of progress weights; old weight values are stored as they come', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const created = store.create('sites', { name: 'Old weights', ...valid, weightSite: 12 });
  assert.equal(created.weightSite, 12); assert.equal(created.sitePaintTracing, 60);
  assert.equal(store.create('sites', { name: 'No weights' }).weightShop, null);
  assert.equal(store.update('sites', created.id, { weightShop: 90 }, created._version).weightShop, 90);
});

test('sample data keeps its stored settings, read as the defaults; every sample project is enabled for both pilots', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const north = store.get('sites', 'site-north');
  assert.equal(north.weightShop, 38, 'stored values are left alone');
  assert.equal(repairPerformanceLimit(north), 5); assert.equal(defectNorm(north), null); assert.equal(mandatoryFields(north), true);
  const projects = store.list('projects');
  // STX-2403 carries the sample MTO requirements, orders and reservations, so it is on for Material Core too.
  assert.deepEqual(projects.filter(project => !projectInPilot(project, 'mto')).map(project => project.id), []);
  assert.ok(projects.every(project => projectInPilot(project, 'weld')));
});

test('a project switched off for a pilot disappears from that pilot together with its isometrics, welds and counts', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const skid = store.get('projects', 'project-skid'); store.update('projects', skid.id, { mtoPilot: false }, skid._version);
  const rows = allRows(store);
  assert.equal(pilotScope(rows), rows); assert.equal(pilotScope(rows, undefined), rows);
  assert.equal(pilotScope(rows, 'weld'), rows, 'everything is enabled for Weld Core');
  const mto = pilotScope(rows, 'mto');
  assert.ok(!mto.projects.some(project => project.id === 'project-skid') && mto.projects.length === rows.projects.length - 1);
  const skidIsos = rows.isometrics.filter(iso => iso.projectId === 'project-skid').map(iso => iso.id);
  assert.ok(skidIsos.length > 0);
  assert.ok(mto.isometrics.length === rows.isometrics.length - skidIsos.length && mto.isometrics.every(iso => iso.projectId !== 'project-skid'));
  const skidWelds = rows.welds.filter(weld => skidIsos.includes(String(weld.isoId)));
  assert.ok(skidWelds.length > 0 && mto.welds.length === rows.welds.length - skidWelds.length);
  assert.ok(mto.spools.every(spool => !skidIsos.includes(String(spool.isoId))) && mto.iso_materials.every(row => !skidIsos.includes(String(row.isoId))));
  assert.ok(mto.inspection_requests.every(row => mto.welds.some(weld => weld.id === row.weldId)));
  assert.ok(mto.attachments.every(file => !mto[String(file.entityType)] || mto[String(file.entityType)].some(row => row.id === file.entityId)));
  assert.equal(mto.sites, rows.sites); assert.equal(mto.materials, rows.materials);
  // Counts shown on the dashboard and the Main projects cards follow the visible rows.
  const siteProjects = (set: typeof rows, siteId: string) => set.projects.filter(project => project.siteId === siteId && !project._archived);
  assert.equal(siteProjects(rows, 'site-north').length - siteProjects(mto, 'site-north').length, 1);
  assert.ok(wdiProgress(mto.welds, mto.diameters).welds < wdiProgress(rows.welds, rows.diameters).welds);
  // The main-project filter composes with the pilot filter.
  const scoped = projectScope(mto, 'site-north');
  assert.ok(scoped.projects.every(project => project.id !== 'project-skid') && scoped.isometrics.every(iso => !skidIsos.includes(iso.id)));
  assert.equal(projectScope(rows, 'site-north').projects.length, scoped.projects.length + 1);
  // Records created before the switches existed carry no flag and stay visible in both pilots.
  const legacy = rows.projects.map(({ weldPilot: _w, mtoPilot: _m, ...rest }) => rest as typeof rows.projects[number]);
  assert.equal(pilotScope({ ...rows, projects: legacy }, 'mto').projects.length, legacy.length);
});

test('hosted editing: invalid weights are rejected with a message, valid settings save and reopen intact, pilot switches round-trip', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-settings-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Settings admin', email: 'settings-admin@example.test', password: 'Settings-Test-Password' })).status, 201);
  const site = store.get('sites', 'site-river');
  // Weights that no longer add up are accepted and stored (they are ignored by the progress).
  const accepted = await request(`/api/records/sites/${site.id}`, 'PUT', { ...valid, weightField: 50, _version: site._version });
  assert.equal(accepted.status, 200);
  const current = (await accepted.json() as { record: { _version: number } }).record;
  const saved = await request(`/api/records/sites/${site.id}`, 'PUT', { ...valid, irnCode: 'RIV-IRN', ndtMeasurement: 'Per weld', defectNorm: 'API 1104', repairLimit: 2.5, mandatoryFields: true, hydrotestPlan: 'HEP-RIV-007', _version: current._version });
  assert.equal(saved.status, 200);
  const data = await (await request('/api/bootstrap')).json() as Bootstrap;
  const reopened = data.rows.sites.find(row => row.id === site.id)!;
  assert.deepEqual([reopened.weightShop, reopened.weightField, reopened.weightSite, reopened.sitePaintTracing, reopened.irnCode, reopened.ndtMeasurement, reopened.defectNorm, reopened.repairLimit, reopened.mandatoryFields, reopened.hydrotestPlan], [38, 54, 8, 60, 'RIV-IRN', 'Per weld', 'API 1104', 2.5, true, 'HEP-RIV-007']);
  const invalidOption = await request(`/api/records/sites/${site.id}`, 'PUT', { defectNorm: 'Made up', _version: reopened._version });
  assert.equal(invalidOption.status, 422);
  const project = data.rows.projects.find(row => row.id === 'project-cooling')!;
  assert.equal((await request(`/api/records/projects/${project.id}`, 'PUT', { mtoPilot: false, _version: project._version })).status, 200);
  const after = (await (await request('/api/bootstrap')).json() as Bootstrap).rows.projects.find(row => row.id === project.id)!;
  assert.deepEqual([after.weldPilot ?? true, after.mtoPilot], [true, false]);
});

// ----- Document settings (reference "Add project site" → Document settings) ------------------------------------------------------

test('Document settings: labels, grouping and order of the reference; our owner-specific settings follow under their own heading', () => {
  const site = projectResource(availabilityFor(HOSTED_RELEASE_PROFILE)!, RESOURCE_MAP.sites);
  const documents = site.fields.filter(field => field.section === 'Document settings' && !field.hidden);
  const hiddenVt = site.fields.filter(field => ['vt2Enabled', 'vtType2No', 'vtType2Rev', 'vtType2Date', 'vtType2OrderNo', 'vt2Prefix'].includes(field.name));
  assert.equal(hiddenVt.length, 6); assert.ok(hiddenVt.every(field => field.hidden), 'the Ver 2 switch and the VT type 2 fields are not offered; their stored values stay');
  assert.deepEqual(documents.slice(0, 21).map(field => field.label), [
    'Prefix', 'Release doc drawing no', 'Hydrotest Execution Plan', 'Flange procedure No.',
    'Subcontractor QA/QC', 'Subcontractor Construction', 'Principal UI', 'Contractor QA/QC', 'Contractor Construction', 'NoBo',
    'Doc.No. & Rev.No.', 'Procedure No.', 'LISL ISS — VT source',
    'Field 1:', 'Field 2:', 'Field 3:', 'Field 1:', 'Field 2:', 'Field 3:', 'Doc.No. & Rev.No.', 'Procedure No.',
  ]);
  const heading = (name: string) => documents.find(field => field.name === name)!.intro;
  assert.deepEqual(['signSubQaqc', 'vtDocNo', 'lislField1', 'lislGuField1'].map(heading), ['Signature titles of the Pressure Test Plan', 'Visual Inspection', 'LISL A3/A4', 'LISL GU/MV']);
  assert.ok(documents.slice(21).length > 0 && documents[21].intro === 'Owner-specific LISL forms', 'the extras come after the reference fields');
  assert.ok(!documents.some(field => field.label.startsWith('Signature title:')));
});

test('a LISL A3/A4 model of a site with LISL A3/A4 Field 1 "ACME" prints "ACME" in its title block; GU/MV prints its own fields', async () => {
  const { lislAcceptanceLabels } = await import('../shared/pdf-lisl.ts');
  const { ownerFormTexts } = await import('../shared/site-settings.ts');
  const stamp = { _version: 1, _archived: false, _createdAt: '', _updatedAt: '' };
  const model = { iso: { id: 'i', ...stamp }, client: 'Client BV', revision: '', testSystem: '', entries: [], site: { id: 's', lislField1: 'ACME', lislField3: 'TÜV', ...stamp } } as unknown as Parameters<typeof lislAcceptanceLabels>[0];
  assert.deepEqual(lislAcceptanceLabels(model, 'Stelux'), ['ACME', 'Client BV', 'TÜV']);
  assert.deepEqual(lislAcceptanceLabels({ ...model, site: undefined }, 'Stelux'), ['Stelux', 'Client BV', 'NoBo'], 'without the settings: company, client, NoBo');
  const gu = ownerFormTexts({ lislGuField1: 'Contractor X', lislGuField2: 'Client Y', lislGuField3: 'NoBo Z', lislDocNo: 'EN10002121 Rev.05', lislProcedureNo: 'CSW-01-N' }, 'gu');
  assert.deepEqual([gu.parties, gu.docNo, gu.procedureNo, gu.version, gu.date], [['Contractor X', 'Client Y', 'NoBo Z'], 'EN10002121 Rev.05', 'CSW-01-N', '', '']);
  const mv = ownerFormTexts({ lislDocNo: 'D-1', lislProcedureNo: 'P-1', lislGuField1: 'C' }, 'mv');
  assert.deepEqual([mv.docNo, mv.procedureNo, mv.parties[0]], ['D-1', 'P-1', 'C'], '[MV] without its own Doc.No. prints the LISL GU/MV one');
});
