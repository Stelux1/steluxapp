import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { buildWeldExport, parseIncludeCodes } from '../shared/reports.ts';
import { EXPORT_TABLES, INVENTORY_EXPORT_COLUMNS, ORDER_MATERIALS_EXPORT_COLUMNS, areaVerb, releaseExportTable, tableCsv } from '../shared/export-tables.ts';
import { LISL_VT_SOURCES, hostedSiteFields } from '../shared/site-settings.ts';
import { issModel, issVtSource } from '../shared/pdf-lisl-iss-wq.ts';
import { PDF_MENU, pdfQuery, weldRecordBox } from '../client/pdf-reports.tsx';
import { WELD_CODE_ROWS, exportWeldsQuery } from '../client/export-welds.tsx';
import type { Row } from '../shared/types.ts';

/** A record as the store returns it, for rows a test adds in memory. */
const row = (data: Record<string, unknown>) => ({ _version: 1, _archived: false, _createdAt: '2026-01-01T00:00:00.000Z', _updatedAt: '2026-01-01T00:00:00.000Z', ...data }) as unknown as Row;
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;

/** The hosted server (both pilots) with the sample data; accounts with detailed permissions sign in one after another. */
async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-exports-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  /** An account whose profile holds exactly these boxes (area key -> verbs). */
  const signIn = async (name: string, rules: Record<string, string[]>) => {
    const profile = store.create('profiles', { name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules) });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Pilot admin', email: 'pilot-admin@example.test', password })).status, 201) };
}
const sheetOf = async (response: Response) => {
  assert.match(String(response.headers.get('content-type')), /spreadsheetml/);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0]; return { sheet, header: (sheet.getRow(1).values as unknown[]).slice(1).map(String), lines: sheet.rowCount - 1 };
};
const post = (f: Awaited<ReturnType<typeof hostedFixture>>, table: string, format: string, columns: string[], rows: unknown[][]) => f.request('/api/export/table', 'POST', { table, format, columns, rows });

/** Row 1 of the client's Export weld data file of 17.11.2026 (Export-site2-user226-20261117-112325.xlsx). */
const CLIENT_EXPORT_HEADER = ['Project Site', 'Project', 'Iso No', 'ITP no', 'IRN', 'Asset Tag', 'Drawing No', 'xRay', 'X-axis', 'Y-axis', 'Piping Class', 'Test Pressure', 'Test System', 'Test Medium', 'PED', 'Nom Diameter', 'Paint Spec', 'Insulation', 'Eelevation', 'Chemical Clean', 'Tracing', 'Zone', 'Material', 'Weld no', 'Weld type', 'Joint Type', 'Welder', 'Welder 2', 'Welder 3', 'Welder 4', 'Wire 1', 'Wire 2', 'Date fit', 'Date', 'Spool', 'VT', 'VT no', 'VT doc', 'NDT', 'NDT 1 Process', 'NDT 1 result', 'NDT 1 Report', 'NDT 2 Process', 'NDT 2 result', 'NDT 1 Report', 'NDT 3 Process', 'NDT 3 result', 'NDT 3 Report', 'NDT 4 Process', 'NDT 4 result', 'NDT 4 Report', 'Defect', 'Defect type', 'PWHT Pre Location', 'PWHT Pre Process', 'PWHT Pre Date', 'PWHT Pre Request No', 'PWHT Pre Report No', 'PWHT Location', 'PWHT Process', 'PWHT Date', 'PWHT Request No', 'PWHT Report No', 'Index No 1', 'Pos 1', 'Charge No 1', 'Material 1', 'Article No 1', 'Index No 2', 'Pos 2', 'Charge no 2', 'Material 2', 'Article No 2', 'WT 1', 'WT 2', 'Schedule 1', 'S chedule 2', 'Welding Process', 'Wps No', 'Coating 1', 'Size inch', 'Outline', 'Diameter', 'Diameter mm', 'Tracer', 'Created', 'Last edit date'];

test('Export weld data: the columns and value formats of the client file', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rows = rowsOf(store);
  assert.equal(CLIENT_EXPORT_HEADER.length, 87);
  const report = buildWeldExport(rows, {});
  assert.deepEqual(report.columns.map(column => column.label), CLIENT_EXPORT_HEADER);
  assert.equal(new Set(report.columns.map(column => column.key)).size, 87, 'keys stay unique although two labels repeat');
  for (const line of report.rows) {
    const values = line.values;
    for (const name of ['Welder', 'Welder 2', 'Welder 3', 'Welder 4', 'Wire 1', 'Wire 2']) assert.ok(String(values[name]).length > 0, `${name} is never empty ("------" when not set)`);
    for (const i of [1, 2, 3, 4]) assert.ok(['', 'YES', 'NO'].includes(String(values[`NDT ${i} result`])), 'NDT results are YES / NO');
    assert.ok(['', 'Yes'].includes(String(values.Tracer)));
    assert.match(String(values['Material 1']), /^[^/]*\/[^/]*\/[^/]*\/[^/]*\/.+$/, 'size/schedule/wall/type/part');
  }
  const weld = rows.welds.find(row => row.welder1Id && !row.welder2Id)!;
  const values = report.rows.find(line => line.source?.id === weld.id)!.values;
  assert.match(String(values.Welder), / \| /); assert.equal(values['Welder 2'], '------');
  assert.match(String(values['Last edit date']), /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
});

// ---- weld-dashboard-reports-022 / -023: Export weld data ---------------------------------------------------------------

test('weld-dashboard-reports-023: weld numbers coded GAP, SP, E or B are left out of the export unless their code is ticked', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const base = store.list('welds').find(weld => weld.isoId === 'iso-1')!;
  for (const weldNo of ['E01', '12GAP', '1SP2', 'B12']) store.create('welds', { weldNo, isoId: base.isoId, typeId: base.typeId, diameterId: base.diameterId, lengthMode: 'Diameter' }, SYSTEM);
  const rows = rowsOf(store);
  const numbersOf = (includeCodes: string[]) => buildWeldExport(rows, { includeCodes }).rows.map(row => String(rows.welds.find(weld => weld.id === row.source?.id)!.weldNo));
  const plain = numbersOf([]);
  assert.ok(plain.includes(String(base.weldNo)), 'ordinary welds stay');
  for (const left of ['E01', '12GAP', '1SP2', 'B12']) assert.equal(plain.includes(left), false, `${left} is left out by default`);
  assert.deepEqual(numbersOf(['E']).filter(no => !plain.includes(no)), ['E01'], 'ticking E keeps E01 only');
  assert.deepEqual(numbersOf(['GAP', 'SP', 'E', 'B']).filter(no => !plain.includes(no)).sort(), ['12GAP', '1SP2', 'B12', 'E01']);
  assert.deepEqual(parseIncludeCodes('e, gap,XX,E'), ['GAP', 'E'], 'only the four codes, each once');
  assert.deepEqual(parseIncludeCodes(undefined), []);
});

test('weld-dashboard-reports-022: the export of one project holds only its welds; all projects hold the whole site', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rows = rowsOf(store); const isos = new Map(rows.isometrics.map(iso => [iso.id, iso]));
  const projectsWithWelds = [...new Set(rows.welds.map(weld => String(isos.get(String(weld.isoId))?.projectId)))].filter(Boolean);
  assert.ok(projectsWithWelds.length >= 2, 'the sample has welds in more than one project');
  const all = buildWeldExport(rows, {}).rows.length;
  for (const projectId of projectsWithWelds) {
    const one = buildWeldExport(rows, { projectId });
    assert.ok(one.rows.length > 0 && one.rows.length < all);
    assert.ok(one.rows.every(row => String(isos.get(String(rows.welds.find(weld => weld.id === row.source?.id)!.isoId))?.projectId) === projectId));
  }
  assert.deepEqual(exportWeldsQuery({ siteId: 's1', projectId: '', full: false, includeCodes: ['E', 'GAP'] }).toString(), 'siteId=s1&projectId=all&includeCodes=GAP%2CE');
  assert.deepEqual(exportWeldsQuery({ siteId: 's1', projectId: 'p1', full: true, includeCodes: [] }).toString(), 'full=ok');
  assert.deepEqual(WELD_CODE_ROWS.map(row => [row.code, row.example]), [['GAP', '12GAP'], ['SP', '1SP2'], ['E', 'E12, 09E'], ['B', 'B12, 07B']]);
});

test('Export weld data: the server writes the workbook for Export on Export welds (81) and refuses a profile without it', async t => {
  const f = await hostedFixture(t); await f.setup(); f.usePilot('weld');
  const iso = f.store.list('isometrics').find(row => row.id === 'iso-1')!;
  f.store.create('welds', { weldNo: 'E01', isoId: iso.id, lengthMode: 'Diameter' }, SYSTEM);
  const rules = (exportBox: boolean) => ({ '81': exportBox ? ['show', 'export'] : ['show'], '63': ['show', 'export'], '64': ['show'], '5': ['show'] });
  await f.signIn('Welds viewer', rules(false));
  assert.equal((await f.request('/api/export-welds?projectId=all')).status, 403, 'Show on 81 is not Export');
  await f.signIn('Welds exporter', rules(true));
  const plain = await sheetOf(await f.request(`/api/export-welds?projectId=all&siteId=${encodeURIComponent(String(f.store.get('projects', String(iso.projectId)).siteId))}`));
  assert.ok(plain.lines > 0); assert.equal(plain.sheet.name, 'Sheet1');
  assert.deepEqual(plain.header, CLIENT_EXPORT_HEADER, 'the 87 headers of the client file, in its order');
  const firstWeld = (plain.sheet.getRow(2).values as unknown[]).slice(1).map(String);
  const cell = (label: string) => firstWeld[CLIENT_EXPORT_HEADER.indexOf(label)];
  assert.ok(['Yes', 'No'].includes(cell('VT')) && ['Yes', 'No'].includes(cell('NDT')) && ['Yes', 'No'].includes(cell('VT doc')), 'flags are Yes / No');
  const textOf = (sheet: ExcelJS.Worksheet) => JSON.stringify(sheet.getSheetValues());
  assert.equal(textOf(plain.sheet).includes('E01'), false, 'E01 is left out without includeCodes');
  const withE = await sheetOf(await f.request('/api/export-welds?projectId=all&includeCodes=E'));
  assert.ok(textOf(withE.sheet).includes('E01'), 'includeCodes=E keeps it');
  const empty = await f.request('/api/export-welds?projectId=no-such-project');
  assert.equal(empty.status, 404); assert.equal(((await empty.json()) as { error?: string }).error ?? '', 'No welds found for this export.');
});

// ---- access-users-profiles-019: exports are decided on the server ---------------------------------------------------------------

test('access-users-profiles-019: a profile with Show on the Pick list archive (21) but no Export gets 403 from every pick-list export', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Archive viewer', { '21': ['show', 'print'], '5': ['show'], '64': ['show'] });
  assert.equal((await f.request('/api/records/picklists')).status, 200, 'the archive itself opens');
  assert.equal((await post(f, 'picklist-archive', 'xlsx', ['Date'], [['2026-11-16']])).status, 403);
  assert.equal((await post(f, 'picklist-archive', 'csv', ['Date'], [['2026-11-16']])).status, 403);
  assert.equal((await post(f, 'picklist', 'xlsx', ['Item'], [['x']])).status, 403);
  assert.equal((await f.request('/api/mto/picklist-archive-export')).status, 403);
  assert.equal((await f.request('/api/mto/table-export', 'POST', { table: 'picklist-archive', columns: ['Date'], rows: [] })).status, 403, 'the older Excel route asks the same area');
  await f.signIn('Archive exporter', { '21': ['show', 'export', 'print'], '5': ['show'], '64': ['show'] });
  const excel = await sheetOf(await f.request('/api/mto/picklist-archive-export')); assert.deepEqual(excel.header, ['Date', 'Report No.', 'Project', 'ISO No', 'Taken?']);
  assert.equal((await post(f, 'picklist-archive', 'xlsx', ['Date'], [['2026-11-16']])).status, 200);
  const csv = await post(f, 'picklist-archive', 'csv', ['Date', 'Note'], [['2026-11-16', '=1+1']]); assert.equal(csv.status, 200); assert.match(String(csv.headers.get('content-type')), /csv/);
  assert.deepEqual([...new Uint8Array(await csv.clone().arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], 'a byte order mark for Excel');
  assert.equal(await csv.text(), '"Date","Note"\r\n"2026-11-16","\'=1+1"', 'a cell that would start a formula is quoted as text');
});

test('access-users-profiles-019: the Request archive and the Service request rows have no export table; unknown tables are refused', async t => {
  assert.deepEqual(Object.keys(EXPORT_TABLES).filter(key => /request|service/i.test(key)), [], 'no export table for areas 23 and 24');
  assert.deepEqual([...new Set(Object.values(EXPORT_TABLES).map(table => table.area))].filter(area => ['23', '24'].includes(area)), []);
  const source = readFileSync(new URL('../client/mto-logistics.tsx', import.meta.url), 'utf8');
  const archive = source.slice(source.indexOf('export function RequestArchive'), source.indexOf('export function RequestArchive') + 6000);
  assert.ok(archive.length > 1000); assert.equal(/Export|TableButtons|downloadCsv/.test(archive.slice(0, archive.indexOf('\n}\n'))), false, 'the Request archive page offers no export');
  const f = await hostedFixture(t); await f.setup();
  assert.equal((await post(f, 'request-archive', 'xlsx', ['A'], [])).status, 404);
  assert.equal((await post(f, '__proto__', 'xlsx', ['A'], [])).status, 404);
  assert.equal((await post(f, 'picklist-archive', 'xlsx', [], [])).status, 422);
});

test('access-users-profiles-019: release lists export with the Export box of their own area (Prefab 86, Field 89, Hydrotest 74)', async t => {
  assert.deepEqual(['Prefab', 'Field', 'Hydrotest'].map(type => EXPORT_TABLES[releaseExportTable(type)].area), ['86', '89', '74']);
  const f = await hostedFixture(t); await f.setup(); f.usePilot('weld');
  await f.signIn('Prefab only', { '86': ['show', 'export', 'print'], '89': ['show'], '74': ['show', 'export'], '91': ['show'] });
  assert.equal((await post(f, 'release-prefab', 'xlsx', ['ISO'], [['A']])).status, 200);
  assert.equal((await post(f, 'release-field', 'xlsx', ['ISO'], [['A']])).status, 403, 'Show on 89 is not Export');
  assert.equal((await post(f, 'release-hydrotest', 'csv', ['ISO'], [['A']])).status, 200);
  assert.equal((await post(f, 'assign-fwp', 'xlsx', ['ISO'], [['A']])).status, 403, '91 Export is its own box');
  assert.equal(areaVerb('86'), 'export'); assert.equal(areaVerb('86', 'print'), 'print');
});

// ---- mto-procurement-stock-024 / -025 ---------------------------------------------------------------------------------------------

test('mto-procurement-stock-024: Material inventory exports an Excel file with the Export box of area 16, columns Material group to UOM', async t => {
  assert.deepEqual([...INVENTORY_EXPORT_COLUMNS], ['Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM']);
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Inventory viewer', { '16': ['show'] });
  assert.equal((await post(f, 'material-inventory', 'xlsx', [...INVENTORY_EXPORT_COLUMNS], [['PIPE', '1', '7436330731', '', '', 'PIPE', 4, 'M']])).status, 403);
  await f.signIn('Inventory exporter', { '16': ['show', 'export'] });
  const book = await post(f, 'material-inventory', 'xlsx', [...INVENTORY_EXPORT_COLUMNS], [['PIPE', '1', '7436330731', '', '', 'PIPE 316L', 4, 'M']]);
  assert.equal(book.status, 200); const { header, lines, sheet } = await sheetOf(book);
  assert.deepEqual(header, [...INVENTORY_EXPORT_COLUMNS]); assert.equal(lines, 1); assert.equal(sheet.getRow(2).getCell(7).value, 4);
  assert.equal((await post(f, 'material-inventory', 'csv', [...INVENTORY_EXPORT_COLUMNS], [])).status, 200);
});

test('mto-procurement-stock-024: take-in and pending order offer CSV and Excel (areas 15 and 14) and Print follows the area', async t => {
  const f = await hostedFixture(t); await f.setup();
  // 15 Material receive has Export; 14 Pending order has only Show, so its export follows Show.
  await f.signIn('Take-in only show', { '15': ['show'], '14': ['show'] });
  assert.equal((await post(f, 'take-in', 'xlsx', ['Date'], [])).status, 403);
  assert.equal((await post(f, 'pending-order', 'xlsx', ['Group'], [])).status, 200);
  assert.equal((await post(f, 'pending-order', 'csv', ['Group'], [])).status, 200);
  await f.signIn('Take-in exporter', { '15': ['show', 'export'] });
  assert.equal((await post(f, 'take-in', 'xlsx', ['Date'], [])).status, 200);
  assert.equal((await post(f, 'pending-order', 'xlsx', ['Group'], [])).status, 403, 'no Show on 14');
  const source = readFileSync(new URL('../client/mto-procurement.tsx', import.meta.url), 'utf8');
  for (const table of ['pending-order', 'take-in']) for (const needle of [`canExport('${table}')`, `canPrint('${table}')`, `'csv', '`, `'xlsx', '`]) assert.ok(source.includes(needle), `${table}: ${needle}`);
  const stock = readFileSync(new URL('../client/mto-stock.tsx', import.meta.url), 'utf8');
  assert.ok(stock.includes('<TableExportButtons table="material-inventory"'), 'the Material inventory page has the table buttons');
});

test('mto-procurement-stock-025: Order materials Export is an Excel file of the list with its eight columns, written by a server that checks the right', async t => {
  assert.deepEqual([...ORDER_MATERIALS_EXPORT_COLUMNS], ['Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM']);
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('No order rights', { '16': ['show'] });
  assert.equal((await post(f, 'order-materials', 'xlsx', [...ORDER_MATERIALS_EXPORT_COLUMNS], [])).status, 403);
  await f.signIn('Order materials', { '13': ['show', 'print'] });
  const book = await post(f, 'order-materials', 'xlsx', [...ORDER_MATERIALS_EXPORT_COLUMNS], [['BOLTS B16', '100019874', '8138965891', '', '', 'BLT/N A193-B16 8UN 170MM 1.1/4IN', 2, 'EA']]);
  assert.equal(book.status, 200); assert.match(String(book.headers.get('content-disposition')), /order-materials\.xlsx/);
  assert.deepEqual((await sheetOf(book)).header, [...ORDER_MATERIALS_EXPORT_COLUMNS]);
  const source = readFileSync(new URL('../client/mto-procurement.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("send('order-materials', 'xlsx', 'order-materials', [...ORDER_MATERIALS_EXPORT_COLUMNS]"), 'the Export button asks for xlsx, not csv');
  assert.equal(tableCsv(['A'], [[1]]), '﻿"A"\r\n"1"');
});

// ---- scn-SB-N7: the LISL dialog ------------------------------------------------------------------------------------------------

test('scn-SB-N7: the Weld record box is the reference blank option (ticked = a form to fill in); A3 and the blank template have no such box', () => {
  assert.equal(weldRecordBox.checked(true), false, 'by default the record is printed and the box is not ticked');
  assert.equal(weldRecordBox.value(true), false, 'ticking the box prints the form without the record');
  const lisl = PDF_MENU.find(item => item.key === 'lisl')!;
  assert.equal(pdfQuery(lisl, 'iso-1', { type: 'All', weldRecord: weldRecordBox.value(false), signature: false }).get('weldRecord'), '1');
  assert.equal(pdfQuery(lisl, 'iso-1', { type: 'All', weldRecord: weldRecordBox.value(true), signature: false }).get('weldRecord'), '0');
  assert.deepEqual(lisl.options, ['type', 'weldRecord', 'signature'], 'LISL Report: Type, Weld record, Signature on each page');
  assert.deepEqual(PDF_MENU.find(item => item.key === 'lisl-a3')!.options, ['type', 'signature'], 'LISL Report (A3): Type and Signature on each page');
  const blank = PDF_MENU.find(item => item.key === 'lisl-blank')!;
  assert.deepEqual(blank.options, [], 'the blank template has no signature option that it would ignore');
  assert.equal(pdfQuery(blank, 'iso-1', { type: 'All', weldRecord: true, signature: true }).has('signature'), false);
});

// ---- delta-I2b-002: LISL [ISS] VT source ---------------------------------------------------------------------------------------

test('delta-I2b-002: the site has the LISL ISS - VT source setting; [ISS] prints the NDT column report by default and the VI report on request', t => {
  const field = RESOURCE_MAP.sites.fields.find(item => item.name === 'lislVtSource')!;
  assert.equal(field.label, 'LISL ISS — VT source'); assert.deepEqual(field.options, [...LISL_VT_SOURCES]); assert.equal(field.default, 'VT from NDT column'); assert.equal(field.section, 'Document settings');
  const hosted = hostedSiteFields(RESOURCE_MAP.sites.fields as never[]).find((item: { name: string }) => item.name === 'lislVtSource') as unknown as { control?: string; label: string };
  assert.equal(hosted.control, 'radio'); assert.equal(hosted.label, 'LISL ISS — VT source');
  const names = RESOURCE_MAP.sites.fields.map(item => item.name); assert.ok(names.indexOf('lislVtSource') > names.indexOf('vt2Prefix'), 'after the VT 2 fields');
  assert.equal(issVtSource(undefined), 'ndt'); assert.equal(issVtSource(row({ id: 's' })), 'ndt', 'a site saved before the setting existed prints as before');
  assert.equal(issVtSource(row({ lislVtSource: 'VT from VT2 report' })), 'vt2');

  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rows = rowsOf(store); const weld = rows.welds.find(item => item.isoId === 'iso-1')!;
  rows.ndt_processes = [...rows.ndt_processes, row({ id: 'p-vt', name: 'VT', groupId: '' })];
  rows.inspection_requests = [...rows.inspection_requests, row({ id: 'req-ndt-vt', weldId: weld.id, type: 'NDT', processId: 'p-vt', status: 'Open' }), row({ id: 'req-vi', weldId: weld.id, type: 'VI', processId: '', status: 'Open' })];
  rows.inspection_results = [...rows.inspection_results, row({ id: 'res-ndt-vt', requestId: 'req-ndt-vt', weldId: weld.id, type: 'NDT', processId: 'p-vt', result: 'Accepted', reportNo: 'N-7', date: '2026-03-02' }), row({ id: 'res-vi', requestId: 'req-vi', weldId: weld.id, type: 'VI', result: 'Accepted', reportNo: '345', date: '2026-03-01' })];
  const vtOf = (source?: string) => {
    const withSource = { ...rows, sites: rows.sites.map(site => ({ ...site, ...(source ? { lislVtSource: source } : {}) })) };
    return issModel(withSource, 'iso-1')!.welds.find(row => row.weldNo === String(weld.weldNo))!.methods.vt;
  };
  assert.ok(vtOf().join(' ').includes('N-7'), 'by default the VT column reads the NDT result'); assert.equal(vtOf().join(' ').includes('345'), false);
  assert.ok(vtOf('VT from NDT column').join(' ').includes('N-7'));
  assert.ok(vtOf('VT from VT2 report').join(' ').includes('345')); assert.equal(vtOf('VT from VT2 report').join(' ').includes('N-7'), false, 'the VI report replaces it');
  // A weld on no visual inspection report prints nothing in the VT2 mode.
  const noVi = { ...rows, inspection_results: rows.inspection_results.filter(item => item.id !== 'res-vi'), sites: rows.sites.map(site => ({ ...site, lislVtSource: 'VT from VT2 report' })) };
  assert.deepEqual(issModel(noVi, 'iso-1')!.welds.find(row => row.weldNo === String(weld.weldNo))!.methods.vt, []);
});
