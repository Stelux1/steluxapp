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
import { PROGRESS_FIELDS, PROGRESS_PHASES, defectNorm, mandatoryFields, ndtMeasurement, progressTotals, progressWeights, projectCertificates, repairPerformanceLimit, validateProgressWeights, wpsValidation } from '../shared/site-settings.ts';
import type { Availability, Bootstrap } from '../shared/types.ts';

const valid = { weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10, fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60 };
const allRows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));

test('progress weights: a complete 38 / 54 / 8 split is valid and all-empty means not configured', () => {
  assert.deepEqual(validateProgressWeights(valid), { valid: true, message: '', fields: {} });
  for (const empty of [{}, undefined, null, Object.fromEntries(PROGRESS_FIELDS.map(name => [name, null])), Object.fromEntries(PROGRESS_FIELDS.map(name => [name, '']))]) assert.equal(validateProgressWeights(empty).valid, true);
  assert.equal(progressWeights({}).configured, false);
  assert.equal(progressWeights(valid).configured, true);
});

test('progress weights: phases must total 100 and every phase with a weight needs activities totalling 100', () => {
  const phases = validateProgressWeights({ ...valid, weightSite: 10 });
  assert.equal(phases.valid, false); assert.match(phases.message, /Shop, Field and Site must total 100% \(now 102%\)/);
  assert.deepEqual(['weightShop', 'weightField', 'weightSite'].filter(name => phases.fields[name]), ['weightShop', 'weightField', 'weightSite']);
  const activities = validateProgressWeights({ ...valid, fieldPunch: 5 });
  assert.equal(activities.valid, false); assert.match(activities.message, /Field activities must total 100% \(now 95%\)/);
  assert.ok(activities.fields.fieldPunch && activities.fields.fieldWelds && !activities.fields.shopWelds);
  assert.match(validateProgressWeights({ ...valid, shopWelds: 41, siteHydrotest: 30 }).message, /Shop activities.*Site activities/);
  // Entering a single weight is enough to require a complete configuration.
  assert.equal(validateProgressWeights({ shopWelds: 100 }).valid, false);
  assert.equal(validateProgressWeights({ weightShop: 100, shopWelds: 100 }).valid, false, 'Field activities are needed even at weight 0 (only Site is excused)');
  assert.equal(validateProgressWeights({ weightShop: 100, weightField: 0, weightSite: 0, shopWelds: 100, fieldWelds: 100 }).valid, true, 'every phase with activities of 100 is complete');
  assert.equal(validateProgressWeights({ weightShop: 100 }).valid, false, 'a phase with a weight needs its activities');
});

test('progress weights: Site activities are optional while Site is 0, and weights are whole numbers from 0 to 100', () => {
  const noSite = { ...valid, weightShop: 40, weightField: 60, weightSite: 0, siteHydrotest: null, sitePaintTracing: null };
  assert.equal(validateProgressWeights(noSite).valid, true);
  assert.equal(validateProgressWeights({ ...noSite, weightSite: null }).valid, true);
  assert.equal(validateProgressWeights({ weightShop: 100, weightField: 0, weightSite: 0, shopWelds: 60, shopNdt: 40 }).valid, false, 'Field activities must total 100 at weight 0');
  assert.equal(validateProgressWeights({ weightShop: 100, weightField: 0, weightSite: 0, shopWelds: 60, shopNdt: 40, fieldWelds: 100 }).valid, true);
  assert.equal(validateProgressWeights({ ...valid, weightSite: 8.5 }).valid, false);
  assert.equal(validateProgressWeights({ ...valid, shopWelds: -1 }).valid, false);
  assert.equal(validateProgressWeights({ ...valid, shopWelds: 101 }).valid, false);
  assert.deepEqual(progressTotals(valid), { phases: 100, activities: { shop: 100, field: 100, site: 100 } });
});

test('setting accessors apply the reference defaults', () => {
  assert.equal(repairPerformanceLimit({}), 5); assert.equal(repairPerformanceLimit({ repairLimit: null }), 5); assert.equal(repairPerformanceLimit({ repairLimit: '' }), 5);
  assert.equal(repairPerformanceLimit({ repairLimit: 0 }), 0); assert.equal(repairPerformanceLimit({ repairLimit: 3.5 }), 3.5);
  assert.deepEqual([mandatoryFields({}), wpsValidation(undefined), projectCertificates(null)], [false, false, false]);
  assert.deepEqual([mandatoryFields({ mandatoryFields: true }), wpsValidation({ wpsValidation: true }), projectCertificates({ projectCertificates: true })], [true, true, true]);
  assert.equal(defectNorm({}), null); assert.equal(defectNorm({ defectNorm: 'No norm selected' }), null); assert.equal(defectNorm({ defectNorm: 'API 1104' }), 'API 1104'); assert.equal(defectNorm({ defectNorm: 'unknown' }), null);
  assert.equal(ndtMeasurement({}), 'inch-weighted'); assert.equal(ndtMeasurement({ ndtMeasurement: 'Per weld' }), 'per-weld');
  const weights = progressWeights({ weightShop: 38, weightField: 54, weightSite: 8, siteHydrotest: 40 });
  assert.deepEqual(weights.phases, { shop: 38, field: 54, site: 8 }); assert.equal(weights.activities.site.hydrotest, 40); assert.equal(weights.activities.site.paintTracing, 0);
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
  assert.deepEqual(project.fields.filter(field => field.name === 'weldPilot' || field.name === 'mtoPilot').map(field => [field.name, field.label, field.default]), [['weldPilot', 'Weld Pilot', true], ['mtoPilot', 'MTO Pilot', true]]);
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

test('the store rejects inconsistent progress weights with a clear message and stores valid ones', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  assert.throws(() => store.create('sites', { name: 'Bad weights', ...valid, weightSite: 12 }), (error: unknown) => error instanceof AppError && error.status === 422 && /must total 100% \(now 104%\)/.test(error.message) && Boolean(error.fields?.weightSite));
  const created = store.create('sites', { name: 'Good weights', ...valid });
  assert.equal(created.weightShop, 38); assert.equal(created.sitePaintTracing, 60);
  assert.equal(store.create('sites', { name: 'Not configured yet' }).weightShop, null);
  assert.throws(() => store.update('sites', created.id, { weightShop: 90 }, created._version), /Shop, Field and Site must total 100%/);
  assert.equal(store.update('sites', created.id, { weightSite: 0, weightShop: 46, siteHydrotest: null, sitePaintTracing: null }, created._version).weightShop, 46);
});

test('sample data carries a configured site; every sample project is enabled for both pilots', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const north = store.get('sites', 'site-north');
  assert.deepEqual(progressWeights(north).phases, { shop: 38, field: 54, site: 8 }); assert.equal(validateProgressWeights(north).valid, true);
  assert.equal(repairPerformanceLimit(north), 4); assert.equal(defectNorm(north), 'ISO 6520-1'); assert.equal(mandatoryFields(north), true);
  assert.equal(repairPerformanceLimit(store.get('sites', 'site-river')), 5);
  const projects = store.list('projects');
  // STX-2403 carries the sample MTO requirements, orders and reservations, so it is on for MTO Pilot too.
  assert.deepEqual(projects.filter(project => !projectInPilot(project, 'mto')).map(project => project.id), []);
  assert.ok(projects.every(project => projectInPilot(project, 'weld')));
});

test('a project switched off for a pilot disappears from that pilot together with its isometrics, welds and counts', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const skid = store.get('projects', 'project-skid'); store.update('projects', skid.id, { mtoPilot: false }, skid._version);
  const rows = allRows(store);
  assert.equal(pilotScope(rows), rows); assert.equal(pilotScope(rows, undefined), rows);
  assert.equal(pilotScope(rows, 'weld'), rows, 'everything is enabled for Weld Pilot');
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
  const rejected = await request(`/api/records/sites/${site.id}`, 'PUT', { ...valid, weightField: 50, _version: site._version });
  assert.equal(rejected.status, 422);
  const body = await rejected.json() as { error?: string; message?: string; fields?: Record<string, string> };
  assert.match(String(body.error ?? body.message), /must total 100% \(now 96%\)/); assert.ok(body.fields?.weightField);
  const saved = await request(`/api/records/sites/${site.id}`, 'PUT', { ...valid, irnCode: 'RIV-IRN', ndtMeasurement: 'Per weld', defectNorm: 'API 1104', repairLimit: 2.5, mandatoryFields: true, hydrotestPlan: 'HEP-RIV-007', _version: site._version });
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
  const documents = site.fields.filter(field => field.section === 'Document settings');
  assert.deepEqual(documents.slice(0, 27).map(field => field.label), [
    'Prefix', 'Release doc drawing no', 'Hydrotest Execution Plan', 'Flange procedure No.',
    'Subcontractor QA/QC', 'Subcontractor Construction', 'Principal UI', 'Contractor QA/QC', 'Contractor Construction', 'NoBo',
    'Doc.No. & Rev.No.', 'Procedure No.', 'Visual Inspection Ver 2', 'VT type 2 no:', 'VT type 2 rev:', 'VT type 2 date:', 'VT type 2 order No:', 'VT 2 prefix:', 'LISL ISS — VT source',
    'Field 1:', 'Field 2:', 'Field 3:', 'Field 1:', 'Field 2:', 'Field 3:', 'Doc.No. & Rev.No.', 'Procedure No.',
  ]);
  const heading = (name: string) => documents.find(field => field.name === name)!.intro;
  assert.deepEqual(['signSubQaqc', 'vtDocNo', 'vt2Enabled', 'lislField1', 'lislGuField1'].map(heading), ['Signature titles of the Pressure Test Plan', 'Visual Inspection', 'Visual Inspection V2', 'LISL A3/A4', 'LISL GU/MV']);
  assert.equal(documents.find(field => field.name === 'vt2Enabled')!.type, 'checkbox', 'the version switch is a checkbox');
  assert.equal(documents.find(field => field.name === 'vt2Prefix')!.type, 'text');
  assert.equal(documents.find(field => field.name === 'vtType2Date')!.type, 'text', 'VT type 2 date is free text as in the reference');
  assert.ok(documents.slice(27).length > 0 && documents[27].intro === 'Owner-specific LISL forms', 'the extras come after the reference fields');
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
