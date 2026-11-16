import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { columnsFor, commitProjectImport, importContext } from '../server/project-import.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, projectResource } from '../shared/release.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import {
  IMPORT_TABLE, IMPORT_TITLES, PREVIEW_COLUMNS, headerColumns, importColumns, importDate, importMenuLabel, neededRights, planImport, previewRows, readCell, round3, templateExamples,
  type ImportColumn, type ImportContext, type PreviewRow, type SheetRow,
} from '../shared/project-import.ts';
import type { Row } from '../shared/types.ts';

const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
const PASSWORD = 'Project-Import-Password';
const NONE = 'No access';
const actor = { id: 'test', name: 'Test' };
const forms = () => ({ projects: projectResource(hosted, RESOURCE_MAP.projects).fields, isometrics: projectResource(hosted, RESOURCE_MAP.isometrics).fields });
const header = (columns: ImportColumn[], key: string) => columns.find(column => column.key === key)!.header;

// ----- columns and cells (pure) -----------------------------------------------------------------------------------

test('the template headers are the labels of Edit project / Edit isometric, so a changed label changes the template', () => {
  const full = importColumns('full', forms());
  const labels = (key: 'projects' | 'isometrics') => forms()[key].filter(field => !field.hidden).map(field => field.label);
  for (const column of full.filter(column => column.part === 'projects')) assert.ok(labels('projects').includes(column.header), `${column.header} is an Edit project label`);
  for (const column of full.filter(column => column.part === 'isometrics')) assert.ok(labels('isometrics').includes(column.header), `${column.header} is an Edit isometric label`);
  // Required: Intern prj. no. and Iso number; weld ranges as Wt.Start / Wt.End; materials with Component code.
  assert.deepEqual(full.filter(column => column.required).map(column => column.key), ['projects.internnumber', 'isometrics.isoNo']);
  assert.deepEqual(full.filter(column => column.part === 'welds').map(column => column.header), ['Wt.Start', 'Wt.End']);
  assert.ok(full.some(column => column.part === 'iso_materials' && column.header === 'Component code'));
  // Not imported (manual): Test system, X Ray %, the isometric memo; the main project and the application visibility come from the page.
  for (const field of ['testSystemId', 'xRay', 'description', 'projectId']) assert.ok(!full.some(column => column.key === `isometrics.${field}`), field);
  for (const field of ['siteId', 'weldPilot', 'mtoPilot']) assert.ok(!full.some(column => column.key === `projects.${field}`), field);
  // Every header is unique, so each column is read back to its own field.
  assert.equal(new Set(full.map(column => column.header.toLowerCase())).size, full.length);
  // A renamed label (as the Edit project / Edit isometric labels of the reference) renames the column; the rules work on the field.
  const renamed = forms(); renamed.projects = renamed.projects.map(field => field.name === 'internnumber' ? { ...field, label: 'Intern prj. no.' } : field);
  assert.equal(header(importColumns('projects', renamed), 'projects.internnumber'), 'Intern prj. no.');
  // The header table: one place for other headers.
  assert.ok(IMPORT_TABLE.aliases.projects.internnumber.includes('Intern prj. no.'));
  assert.ok(IMPORT_TABLE.aliases.isometrics.isoNo.includes('Iso number'));
  const read = headerColumns(['Intern prj. no.', 'Iso number', 'Wt.Start', 'Wt.End', 'CC', 'Unknown'], full);
  assert.deepEqual([...read.values()], ['projects.internnumber', 'isometrics.isoNo', 'welds.start', 'welds.end', 'iso_materials.componentCode']);
  // Import projects holds the project columns only.
  assert.ok(importColumns('projects', forms()).every(column => column.part === 'projects'));
  assert.deepEqual([importMenuLabel('weld', 'full'), importMenuLabel('mto', 'full'), importMenuLabel('weld', 'projects')], ['Import all WP data', 'Import all project data', 'Import projects']);
  // The preview columns of the reference (without Fax, Dia2 and the weld Dia, which our records do not have).
  assert.deepEqual(PREVIEW_COLUMNS.projects.map(column => column.header), ['InternalNo', 'ExternalNo', 'Description', 'Customer', 'Contact', 'Phone', 'Authority']);
  assert.deepEqual(PREVIEW_COLUMNS.full.map(column => column.header), ['ProjectNo', 'Iso', 'Rev', 'Welds', 'MaterialNo', 'Description', 'LBS', 'Dia1', 'UOM', 'Qty']);
  assert.deepEqual(IMPORT_TITLES, { projects: 'Import projects', full: 'Import all project data' });
});

test('cells are read for their field: numbers rounded to three decimals, dates, Yes / No, options and names of the lists', () => {
  assert.equal(round3(2.34567), 2.346);
  const number = { key: 'x.n', part: 'isometrics', field: 'n', header: 'N', aliases: [], type: 'number', hint: '' } as ImportColumn;
  assert.deepEqual(readCell(number, '1,23456'), { value: 1.235 });
  assert.ok(readCell(number, 'abc').error);
  assert.equal(importDate('2026-09-01'), '2026-09-01'); assert.equal(importDate('01.09.2026'), '2026-09-01'); assert.equal(importDate('31-02-2026'), undefined);
  const flag = { ...number, type: 'checkbox' };
  assert.deepEqual([readCell(flag, 'Yes').value, readCell(flag, 'no').value], [true, false]); assert.ok(readCell(flag, 'maybe').error);
  const select = { ...number, type: 'select', options: ['Active', 'On hold'] };
  assert.deepEqual(readCell(select, 'on hold'), { value: 'On hold' }); assert.ok(readCell(select, 'Closed').error);
  const ref = { ...number, type: 'ref', ref: 'companies' };
  const refs = { companies: { rows: [{ id: 'c1', name: 'North Co', _archived: false } as unknown as Row], display: 'name', title: 'Companies' } };
  assert.deepEqual(readCell(ref, 'north co', refs), { value: 'c1' }); assert.match(readCell(ref, 'Other', refs).error!, /not in Companies/);
});

const columns = importColumns('full', forms());
const row = (rowNo: number, cells: Record<string, string>): SheetRow => ({ rowNo, values: cells });
const emptyContext = (extra: Partial<ImportContext> = {}): ImportContext => ({
  projects: [], isometrics: [], weldNumbers: {}, materialLines: {}, refs: {},
  materialRows: { materials: [], uoms: [{ id: 'uom-M', name: 'M' } as unknown as Row, { id: 'uom-EA', name: 'EA' } as unknown as Row], operation_phases: [{ id: 'phase-0', name: 'Shop', sort: 1 } as unknown as Row] }, ...extra,
});

test('the plan: a row without Intern prj. no. or Iso number is reported and plans nothing; quantities are rounded to three decimals; preview shows errors plus 100 rows', () => {
  const plan = planImport([
    row(3, { 'projects.internnumber': 'P-1', 'isometrics.isoNo': 'ISO-1', 'welds.start': '1', 'welds.end': '3', 'iso_materials.materialNo': 'CUST-1', 'iso_materials.description': 'Custom pipe', 'iso_materials.uom': 'M', 'iso_materials.quantity': '2.34567' }),
    row(4, { 'isometrics.isoNo': 'ISO-2' }),
    row(5, { 'projects.internnumber': 'P-2' }),
  ], columns, emptyContext(), { mode: 'full', withWelds: true });
  assert.deepEqual(plan.rows.map(item => item.action), ['New', 'Error', 'Error']);
  // The message names the column by its header, the Edit project label ("Sub Projects" since w4-project-iso-pages).
  assert.equal(header(columns, 'projects.internnumber'), 'Sub Projects');
  assert.match(plan.rows[1].errors.join(' '), /Sub Projects: Required/);
  assert.equal(header(columns, 'isometrics.isoNo'), 'Iso number');
  assert.match(plan.rows[2].errors.join(' '), /Iso number: Required/);
  assert.deepEqual(plan.projects.map(item => item.internnumber), ['P-1'], 'the error rows plan no project');
  assert.equal(plan.isometrics[0].ranges[0].numbers.length, 3);
  assert.equal(plan.rows[0].qty, '2.346');
  assert.deepEqual(plan.summary, { rows: 3, errors: 2, importable: 1, projects: { created: 1, updated: 0 }, isometrics: { created: 1, updated: 0 }, welds: 3, materials: 1 });
  // Without With welds the weld cells are left out.
  assert.equal(planImport([row(3, { 'projects.internnumber': 'P-1', 'isometrics.isoNo': 'ISO-1', 'welds.start': '1', 'welds.end': '3' })], columns, emptyContext(), { mode: 'full', withWelds: false }).summary.welds, 0);
  // Each part with writes needs its own rights.
  assert.deepEqual(neededRights(plan, 'full'), [['projects', ['import', 'insert']], ['isometrics', ['import', 'insert']], ['welds', ['import', 'insert']], ['iso_materials', ['import', 'insert']]]);
  // The preview: every error row plus 100 importable rows unless Show all rows is ticked.
  const many = [...Array.from({ length: 150 }, (_, index) => ({ action: 'New', rowNo: index }) as PreviewRow), { action: 'Error', rowNo: 999 } as PreviewRow];
  assert.equal(previewRows(many, false).length, 101); assert.ok(previewRows(many, false).some(item => item.rowNo === 999)); assert.equal(previewRows(many, true).length, 151);
});

test('the plan: an existing isometric keeps its header values where the cells are empty, existing welds are never changed, a deleted project is refused', () => {
  const project = { id: 'p1', internnumber: 'P-1', description: 'Old', siteId: 's', _archived: false } as unknown as Row;
  const iso = { id: 'i1', projectId: 'p1', isoNo: 'ISO-1', pipingClass: 'CS150', drawingNo: 'D-1', _archived: false } as unknown as Row;
  const context = emptyContext({ projects: [project, { id: 'p9', internnumber: 'P-9', siteId: 's', _archived: true } as unknown as Row], isometrics: [iso], weldNumbers: { i1: ['001', '002'] }, materialLines: { i1: [{ materialNo: 'CUST-1', phaseId: 'phase-0' }] } });
  const plan = planImport([
    row(3, { 'projects.internnumber': 'P-1', 'isometrics.isoNo': 'ISO-1', [`isometrics.pipingClass`]: 'SS300', 'welds.start': '1', 'welds.end': '4', 'iso_materials.materialNo': 'CUST-1', 'iso_materials.description': 'Custom pipe', 'iso_materials.quantity': '5' }),
    row(4, { 'projects.internnumber': 'P-9', 'isometrics.isoNo': 'ISO-9' }),
  ], columns, context, { mode: 'full', withWelds: true });
  assert.deepEqual(plan.rows.map(item => item.action), ['Update', 'Error']);
  assert.match(plan.rows[1].errors.join(' '), /deleted/);
  const planned = plan.isometrics[0];
  assert.deepEqual(planned.values, { pipingClass: 'SS300' }, 'only the filled cell that differs changes; Drawing number stays');
  assert.deepEqual(planned.ranges[0].numbers, ['003', '004'], 'the numbers there are skipped and written like them');
  assert.equal(planned.materials.length, 0, 'the line with this Material No and Type is already on the isometric');
  assert.ok(plan.rows[0].materialExists);
  assert.deepEqual(plan.projects[0].values, {}, 'the project is unchanged');
});

// ----- the routes -------------------------------------------------------------------------------------------------

async function fixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: 'full' | typeof HOSTED_RELEASE_PROFILE = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-project-import-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
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
    return { request, login: async (email: string) => { assert.equal((await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } })).status, 200, email); } };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Import admin', email: 'import-admin@example.test', password: PASSWORD } })).status, 201);
  if (releaseProfile !== 'full') assert.equal((await admin.request('/auth/site', { method: 'POST', data: { siteId: 'site-north' } })).status, 200);
  /** An account with a detailed permission profile ({area: verbs}) working in the North main project. */
  const account = async (name: string, rules: Record<string, string[]>) => {
    const profile = store.create('profiles', { name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE, toolsPermission: NONE, settingsPermission: NONE });
    const email = `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, user = store.create('users', { name, email, active: true, profileId: profile.id, weldEnabled: true, mtoEnabled: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const own = client(); await own.login(email);
    assert.equal((await own.request('/auth/site', { method: 'POST', data: { siteId: 'site-north' } })).status, 200);
    return own;
  };
  return { store, admin, account };
}
type Client = Awaited<ReturnType<typeof fixture>>['admin'];
const allColumns = columnsFor(hosted, 'full');
/** An .xlsx as the template has it: row 1 hints, row 2 headers, data from row 3. */
async function sheet(mode: 'full' | 'projects', lines: Record<string, string>[], options: { withWelds?: boolean; clean?: boolean } = {}) {
  const list = columnsFor(hosted, mode);
  const book = new ExcelJS.Workbook(); const page = book.addWorksheet('Import');
  page.addRow(list.map(column => column.hint)); page.addRow(list.map(column => column.header));
  for (const line of lines) page.addRow(list.map(column => line[column.key] ?? ''));
  const form = new FormData(); form.set('mode', mode); form.set('file', new Blob([await book.xlsx.writeBuffer()]), 'import.xlsx');
  if (options.withWelds !== undefined) form.set('withWelds', String(options.withWelds));
  if (options.clean !== undefined) form.set('clean', String(options.clean));
  return form;
}
const FILE: Record<string, string>[] = [
  { 'projects.internnumber': 'IMP-001', 'projects.description': 'Imported project', 'isometrics.isoNo': 'IMP-ISO-1', 'isometrics.pipingClass': 'CS150', 'welds.start': '1', 'welds.end': '3', 'iso_materials.componentCode': '1', 'iso_materials.materialNo': 'IMP-PIPE-1', 'iso_materials.description': 'Imported pipe', 'iso_materials.uom': 'M', 'iso_materials.quantity': '6.12345', 'iso_materials.phase': 'Shop' },
  { 'projects.internnumber': 'IMP-001', 'isometrics.isoNo': 'IMP-ISO-1', 'iso_materials.componentCode': '2', 'iso_materials.materialNo': 'IMP-SUP-1', 'iso_materials.description': 'Imported support', 'iso_materials.uom': 'EA', 'iso_materials.quantity': '2', 'iso_materials.phase': 'Shop' },
  { 'projects.internnumber': 'IMP-001', 'isometrics.isoNo': 'IMP-ISO-2', 'welds.start': '10', 'welds.end': '11' },
  // A project number of the River main project: imported into the open main project (North) as a project of its own.
  { 'projects.internnumber': 'STX-2402', 'isometrics.isoNo': 'IMP-ISO-3' },
];
const counts = (store: Store) => ({ projects: store.list('projects').length, isometrics: store.list('isometrics').length, welds: store.list('welds').length, lines: store.list('iso_materials').length });
const json = async <T = Record<string, any>>(response: Response) => await response.json() as T;
async function commit(client: Client, form: FormData, pilot = 'weld') { return client.request('/project-import/commit', { method: 'POST', pilot, data: form }); }

test('Import all project data: a valid file creates the project, its isometrics, the weld range and the material lines in the open main project only', async t => {
  const f = await fixture(t);
  const before = counts(f.store);
  const river = f.store.get('projects', 'project-steam');
  // The preview writes nothing.
  const preview = await f.admin.request('/project-import/preview', { method: 'POST', data: await sheet('full', FILE, { withWelds: true }) });
  assert.equal(preview.status, 200, await preview.clone().text());
  const body = await json<{ rows: PreviewRow[]; summary: Record<string, unknown> }>(preview);
  assert.deepEqual(body.rows.map(item => item.action), ['New', 'Update', 'New', 'New']);
  assert.deepEqual(body.summary, { rows: 4, errors: 0, importable: 4, projects: { created: 2, updated: 0 }, isometrics: { created: 3, updated: 0 }, welds: 5, materials: 2 });
  assert.deepEqual(counts(f.store), before, 'the preview writes nothing');
  const response = await commit(f.admin, await sheet('full', FILE, { withWelds: true }));
  assert.equal(response.status, 201, await response.clone().text());
  assert.deepEqual(await json(response), { projects: { created: 2, updated: 0 }, isometrics: { created: 3, updated: 0 }, welds: 5, materials: 2, skipped: 0 });
  const projects = f.store.list('projects').filter(project => ['IMP-001', 'STX-2402'].includes(String(project.internnumber)) && project.id !== 'project-steam');
  assert.deepEqual(projects.map(project => project.siteId), ['site-north', 'site-north'], 'every project belongs to the open main project');
  assert.deepEqual(f.store.get('projects', 'project-steam'), river, 'the project of the other main project is untouched');
  const imp = projects.find(project => project.internnumber === 'IMP-001')!;
  const isos = f.store.list('isometrics').filter(iso => iso.projectId === imp.id);
  assert.deepEqual(isos.map(iso => iso.isoNo).sort(), ['IMP-ISO-1', 'IMP-ISO-2']);
  const first = isos.find(iso => iso.isoNo === 'IMP-ISO-1')!;
  assert.equal(first.pipingClass, 'CS150');
  assert.deepEqual(f.store.list('welds').filter(weld => weld.isoId === first.id).map(weld => String(weld.weldNo)).sort(), ['001', '002', '003']);
  const lines = f.store.list('iso_materials').filter(line => line.isoId === first.id).sort((a, b) => String(a.materialNo).localeCompare(String(b.materialNo)));
  assert.deepEqual(lines.map(line => [line.materialNo, line.quantity, line.uom, line.componentCode]), [['IMP-PIPE-1', 6.123, 'M', '1'], ['IMP-SUP-1', 2, 'EA', '2']], 'quantities rounded to three decimals');
  // A second import of the same file adds nothing.
  const again = await f.admin.request('/project-import/preview', { method: 'POST', data: await sheet('full', FILE, { withWelds: true }) });
  assert.deepEqual((await json<{ rows: PreviewRow[] }>(again)).rows.map(item => item.action), ['No change', 'No change', 'No change', 'No change']);
  const after = counts(f.store);
  const second = await commit(f.admin, await sheet('full', FILE, { withWelds: true }));
  assert.equal(second.status, 201);
  assert.deepEqual(await json(second), { projects: { created: 0, updated: 0 }, isometrics: { created: 0, updated: 0 }, welds: 0, materials: 0, skipped: 0 });
  assert.deepEqual(counts(f.store), after, 'no duplicates');
});

test('a row without Intern prj. no. or Iso number is reported and nothing of it is written; a file of such rows writes nothing at all', async t => {
  const f = await fixture(t);
  const before = counts(f.store);
  const bad: Record<string, string>[] = [{ 'isometrics.isoNo': 'BAD-ISO', 'welds.start': '1', 'welds.end': '2' }, { 'projects.internnumber': 'BAD-PRJ' }];
  const preview = await json<{ rows: PreviewRow[] }>(await f.admin.request('/project-import/preview', { method: 'POST', data: await sheet('full', bad) }));
  assert.deepEqual(preview.rows.map(item => [item.rowNo, item.action]), [[3, 'Error'], [4, 'Error']]);
  assert.match(preview.rows[0].errors.join(' '), new RegExp(`${header(allColumns, 'projects.internnumber')}: Required`));
  assert.match(preview.rows[1].errors.join(' '), new RegExp(`${header(allColumns, 'isometrics.isoNo')}: Required`));
  const response = await commit(f.admin, await sheet('full', bad));
  assert.equal(response.status, 201);
  assert.equal((await json(response)).skipped, 2);
  assert.deepEqual(counts(f.store), before, 'nothing is written');
  assert.ok(!f.store.list('projects').some(project => project.internnumber === 'BAD-PRJ'));
});

test('an existing project and isometric are updated from the filled cells and keep the empty ones; Auto IRN numbers a new isometric; Import projects with a clean import', async t => {
  const f = await fixture(t);
  const site = f.store.get('sites', 'site-north');
  f.store.update('sites', site.id, { irnAuto: true, irnCode: 'NFY' }, site._version, actor);
  const iso = f.store.get('isometrics', 'iso-1');
  const response = await commit(f.admin, await sheet('full', [
    { 'projects.internnumber': 'STX-2401', 'projects.contact': 'New contact', 'isometrics.isoNo': String(iso.isoNo), 'isometrics.drawingNo': 'DWG-NEW' },
    { 'projects.internnumber': 'STX-2401', 'isometrics.isoNo': 'STX-CW-NEW' },
    { 'projects.internnumber': 'STX-2401', 'isometrics.isoNo': 'STX-CW-OWN', 'isometrics.irn': 'OWN-IRN-1' },
  ]));
  assert.equal(response.status, 201, await response.clone().text());
  const project = f.store.get('projects', 'project-cooling');
  assert.deepEqual([project.contact, project.description], ['New contact', 'Cooling water expansion'], 'the empty Description cell keeps the value');
  const updated = f.store.get('isometrics', 'iso-1');
  assert.deepEqual([updated.drawingNo, updated.pipingClass, updated.irn], ['DWG-NEW', iso.pipingClass, iso.irn]);
  const created = f.store.list('isometrics').filter(row => row.projectId === 'project-cooling');
  assert.match(String(created.find(row => row.isoNo === 'STX-CW-NEW')!.irn), /^NFY\d{4}$/, 'the next IRN of the main project');
  assert.equal(created.find(row => row.isoNo === 'STX-CW-OWN')!.irn, 'OWN-IRN-1', 'an IRN filled in the file stays');
  // Import projects: a project of the file is updated; with a clean import, the blank projects not in the file are deleted (archived), a project with isometrics stays.
  const blank = f.store.create('projects', { internnumber: 'BLANK-1', siteId: 'site-north' }, actor);
  const clean = await commit(f.admin, await sheet('projects', [{ 'projects.internnumber': 'STX-2401', 'projects.authority': 'Inspector' }], { clean: true }));
  assert.equal(clean.status, 201, await clean.clone().text());
  const result = await json(clean);
  assert.equal(result.projects.updated, 1); assert.equal(result.projects.deleted, 1); assert.deepEqual(result.projects.kept, ['STX-2403']);
  assert.equal(f.store.get('projects', blank.id, true)._archived, true);
  assert.equal(f.store.get('projects', 'project-cooling').authority, 'Inspector');
  assert.equal(f.store.get('projects', 'project-steam')._archived, false, 'the other main project is untouched');
});

test('each part needs its own import right: an account without it is refused (403) for that part, the rest of the file still imports', async t => {
  const f = await fixture(t);
  const before = counts(f.store);
  const base = { '4': ['show'], '5': ['show', 'insert', 'edit', 'import', 'export'], '64': ['show', 'insert', 'edit', 'import', 'export'] };
  // Welds without the import right.
  const noWelds = await f.account('No weld import', { ...base, '63': ['show', 'insert'], '70': ['show', 'insert', 'import'] });
  const withRange = [{ 'projects.internnumber': 'R-001', 'isometrics.isoNo': 'R-ISO-1', 'welds.start': '1', 'welds.end': '2' }];
  let response = await noWelds.request('/project-import/preview', { method: 'POST', data: await sheet('full', withRange, { withWelds: true }) });
  assert.equal(response.status, 403); assert.match((await json(response)).error, /importing welds/);
  response = await commit(noWelds, await sheet('full', withRange, { withWelds: true }));
  assert.equal(response.status, 403);
  assert.deepEqual(counts(f.store), before, 'nothing is written');
  // The same file without With welds imports the project and the isometric.
  response = await commit(noWelds, await sheet('full', withRange, { withWelds: false }));
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal(counts(f.store).welds, before.welds);
  // Material lines belong to MTO Pilot: in Weld Pilot they follow the account's MTO Pilot profile.
  const noMaterials = await f.account('No material import', { ...base, '63': ['show', 'insert', 'import'], '70': ['show', 'insert'] });
  const withLine = [{ 'projects.internnumber': 'R-002', 'isometrics.isoNo': 'R-ISO-2', 'iso_materials.materialNo': 'R-LINE', 'iso_materials.description': 'Line', 'iso_materials.quantity': '1' }];
  response = await commit(noMaterials, await sheet('full', withLine));
  assert.equal(response.status, 403); assert.match((await json(response)).error, /MTO Pilot profile does not allow importing materials in isometrics/);
  assert.ok(!f.store.list('projects').some(project => project.internnumber === 'R-002'), 'the refused import wrote nothing');
  // Without the import right on projects the project part is refused, even for a file of isometrics.
  const noProjects = await f.account('No project import', { ...base, '5': ['show', 'insert', 'edit'], '63': ['show', 'insert', 'import'], '70': ['show', 'insert', 'import'] });
  response = await commit(noProjects, await sheet('full', [{ 'projects.internnumber': 'R-003', 'isometrics.isoNo': 'R-ISO-3' }]));
  assert.equal(response.status, 403); assert.match((await json(response)).error, /importing projects/);
  // Without the isometric import right the page itself is refused.
  const noIsos = await f.account('No iso import', { ...base, '64': ['show', 'insert', 'edit'] });
  assert.equal((await noIsos.request('/project-import/template?mode=full')).status, 403);
  assert.equal((await noIsos.request('/project-import/template?mode=projects')).status, 200);
});

test('the commit is one transaction: a failure of a later part leaves nothing of the import', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const before = counts(store);
    const input = FILE.map((values, index) => row(index + 3, values));
    assert.throws(() => commitProjectImport(store, input, allColumns, {
      mode: 'full', withWelds: true, siteId: 'site-north', actor, context: () => importContext(store, 'site-north', allColumns),
      checkWrite: (key, value) => { if (key === 'isometrics' && value.isoNo === 'IMP-ISO-3') throw new Error('refused'); },
    }), /refused/);
    assert.deepEqual(counts(store), before, 'the projects, isometrics, welds and lines written before the failure are rolled back');
  } finally { store.close(); }
});

test('the template: row 1 hints, row 2 the headers, example rows from row 3; the routes exist in the hosted profile only', async t => {
  const f = await fixture(t);
  const response = await f.admin.request('/project-import/template?mode=full');
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await response.arrayBuffer());
  const page = book.worksheets[0];
  const rowValues = (rowNo: number) => (page.getRow(rowNo).values as unknown[]).slice(1).map(value => String(value ?? ''));
  assert.deepEqual(rowValues(2), allColumns.map(column => column.header));
  assert.match(rowValues(1)[0], /^Required\./);
  assert.equal(rowValues(3)[0], 'PROJECT 001');
  assert.deepEqual(templateExamples('full', allColumns).map(line => line[0]), ['PROJECT 001', 'PROJECT 001', 'PROJECT 002']);
  // The current data: this main project's projects and isometrics in the same columns (weld columns empty).
  const current = await f.admin.request('/project-import/current');
  assert.equal(current.status, 200);
  const data = new ExcelJS.Workbook(); await data.xlsx.load(await current.arrayBuffer());
  const numbers = new Set<string>(); data.worksheets[0].eachRow((line, rowNo) => { if (rowNo > 2) numbers.add(String(line.getCell(1).value)); });
  assert.deepEqual([...numbers].sort(), ['STX-2401', 'STX-2403']);
  assert.equal((await f.admin.request('/project-import/template?mode=other')).status, 422);
  const plain = await fixture(t, 'full');
  assert.equal((await plain.admin.request('/project-import/template?mode=full')).status, 404);
});
