import ExcelJS from 'exceljs';
import type { Express, Request } from 'express';
import { AppError, type Store } from './store.ts';
import type { AuthRequest } from './auth.ts';
import { buildWeldExport, parseIncludeCodes, type Report } from '../shared/reports.ts';
import { RESOURCES } from '../shared/resources.ts';
import { REPORT_RESOURCES, canReport, canResource } from '../shared/permissions.ts';
import { EXPORT_TABLES, EXPORT_WELDS_AREA, PICKLIST_ARCHIVE_EXPORT_AREA, areaRight, tableCsv } from '../shared/export-tables.ts';
import { PICKLIST_ARCHIVE_COLUMNS, pickListReports } from '../shared/mto-logistics.ts';
import type { Availability, Row } from '../shared/types.ts';

export function reportWorkbook(report: Report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Blitzkrieg';
  const sheet = workbook.addWorksheet(report.definition.key === 'cut-list' ? 'MSPS_Cut_list' : report.definition.key === 'calculation' ? 'M25001_Project_cal_MSPS' : report.definition.title.slice(0, 31));
  sheet.columns = report.columns.map(column => ({ header: column.label, key: column.key, width: column.type === 'number' ? 18 : 26 }));
  for (const source of report.rows) {
    const row = sheet.addRow(source.values);
    const formula = (target: string, left: string, right: string) => {
      if (typeof source.values[target] !== 'number' || ![target,left,right].every(key => report.columns.some(column => column.key === key))) return;
      row.getCell(target).value = { formula: `${sheet.getColumn(left).letter}${row.number}*${sheet.getColumn(right).letter}${row.number}`, result: Number(source.values[target]) };
      row.getCell(target).numFmt = '0.000';
    };
    if (report.definition.key === 'cut-list') formula('totalMm', 'quantity', 'lengthMm');
    if (report.definition.key === 'calculation') formula('hours', 'quantity', 'hoursPerUnit');
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: report.columns.length } };
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}

/** Export weld data as the client's own file writes it: one sheet "Sheet1", a plain header row, every value as text. */
export function weldExportWorkbook(report: Report) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(report.columns.map(column => column.label));
  for (const source of report.rows) sheet.addRow(report.columns.map(column => String(source.values[column.key] ?? '')));
  return workbook;
}

/** A workbook of a table as a page lists it: the header row in the brand colour, the values as given. */
export function tableWorkbook(title: string, columns: readonly string[], lines: readonly (readonly unknown[])[]) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
  const sheet = workbook.addWorksheet(title.slice(0, 31));
  sheet.columns = columns.map(header => ({ header, width: 22 }));
  for (const line of lines) sheet.addRow(columns.map((_, index) => line[index] ?? ''));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
}

export interface ExportRouteDependencies {
  app: Express; store: Store; availability: Availability | undefined;
  readableRows(req: Request, key: string, archived?: boolean): Row[];
}
const query = (req: Request, name: string) => typeof req.query[name] === 'string' ? String(req.query[name]).slice(0, 150) : '';
const REFUSED = 'Your permission profile does not allow this export.';

/**
 * The exports that are decided here and not in the browser (Weld Pilot and MTO Pilot):
 * - `GET /api/export-welds`: Export weld data (Export on Export welds, 81); an Excel file of one project or of the whole site.
 * - `POST /api/export/table`: CSV or Excel of a table a page lists (`EXPORT_TABLES`); the Export right of its area.
 * - `GET /api/mto/picklist-archive-export`: the Pick list archive export (Export on Pick list archive, 21).
 */
export function registerExportRoutes({ app, store, availability, readableRows }: ExportRouteDependencies) {
  const pilots = Boolean(availability?.features.includes('pilots'));
  const userOf = (req: Request) => (req as unknown as AuthRequest).user;
  app.get('/api/export-welds', async (req, res) => {
    if (!pilots) throw new AppError(404, 'This resource could not be found.');
    const user = userOf(req);
    if (!areaRight(user, EXPORT_WELDS_AREA) || !canReport(user, 'lisl', 'export')) throw new AppError(403, REFUSED);
    const primary = REPORT_RESOURCES.lisl || [];
    const rows = Object.fromEntries(RESOURCES.filter(resource => canResource(user, resource.key)).map(resource => [resource.key, readableRows(req, resource.key, true).filter(row => !primary.includes(resource.key) || canResource(user, resource.key, 'export', row))]));
    // "Export all data" (full=ok) is every project site the account may see; otherwise one project, or All projects of the chosen site.
    const full = query(req, 'full') === 'ok'; const projectId = query(req, 'projectId');
    // The export has its own 87 columns (shared/weld-export.ts); the release profile only decides whether the LISL data is offered at all.
    if (availability && !(availability.reports.lisl || []).length) throw new AppError(404, 'This resource could not be found.');
    const report = (buildWeldExport(rows, { siteId: full ? '' : query(req, 'siteId'), projectId: full || projectId === 'all' ? '' : projectId, includeCodes: parseIncludeCodes(req.query.includeCodes) }));
    if (!report.rows.length) throw new AppError(404, 'No welds found for this export.');
    res.setHeader('Cache-Control', 'no-store'); res.attachment('blitzkrieg-export-welds.xlsx');
    await weldExportWorkbook(report).xlsx.write(res); res.end();
  });
  app.post('/api/export/table', async (req, res) => {
    if (!pilots) throw new AppError(404, 'This resource could not be found.');
    const body = (req.body ?? {}) as Record<string, unknown>; const key = typeof body.table === 'string' ? body.table : '';
    const table = Object.hasOwn(EXPORT_TABLES, key) ? EXPORT_TABLES[key] : undefined;
    if (!table) throw new AppError(404, 'This table cannot be exported.');
    if (!areaRight(userOf(req), table.area)) throw new AppError(403, REFUSED);
    const format = body.format === 'csv' ? 'csv' : 'xlsx';
    const cell = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : String(value ?? '').slice(0, 2000);
    const columns = Array.isArray(body.columns) ? body.columns.slice(0, 40).map(value => String(value ?? '').slice(0, 100)) : [];
    const lines = Array.isArray(body.rows) ? body.rows.slice(0, 20000) : [];
    if (!columns.length || lines.some(line => !Array.isArray(line))) throw new AppError(422, 'Send the columns and the rows of the table.');
    const cells = (lines as unknown[][]).map(line => columns.map((_, index) => cell(line[index])));
    res.setHeader('Cache-Control', 'no-store');
    if (format === 'csv') { res.attachment(`blitzkrieg-${key}.csv`).type('text/csv').send(tableCsv(columns, cells)); return; }
    res.attachment(`blitzkrieg-${key}.xlsx`); await tableWorkbook(table.title, columns, cells).xlsx.write(res); res.end();
  });
  app.get('/api/mto/picklist-archive-export', async (req, res) => {
    if (!pilots) throw new AppError(404, 'This resource could not be found.');
    if (!areaRight(userOf(req), PICKLIST_ARCHIVE_EXPORT_AREA)) throw new AppError(403, REFUSED);
    if (!canResource(userOf(req), 'picklists')) throw new AppError(403, REFUSED);
    const rows = Object.fromEntries(['projects', 'isometrics', 'picklists'].map(key => [key, readableRows(req, key)])) as Record<string, Row[]>;
    const isoNo = new Map(rows.isometrics.map(row => [row.id, String(row.isoNo ?? '')]));
    const reports = pickListReports(rows, { projectId: query(req, 'projectId'), from: query(req, 'from'), to: query(req, 'to') });
    const project = (id: string) => { const row = rows.projects.find(item => item.id === id); return row ? store.display('projects', row) : ''; };
    const lines = reports.map(report => [report.date, report.reportNo, project(report.projectId), isoNo.get(report.isoId) ?? '', report.taken ? 'Yes' : 'No']);
    res.setHeader('Cache-Control', 'no-store'); res.attachment('blitzkrieg-pick-list-archive.xlsx');
    await tableWorkbook('Pick List archive', PICKLIST_ARCHIVE_COLUMNS, lines).xlsx.write(res); res.end();
  });
}
