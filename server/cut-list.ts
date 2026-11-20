import ExcelJS from 'exceljs';
import type { Express, Request } from 'express';
import { CUT_LIST_FITTINGS } from '../shared/cut-list-fittings-data.ts';
import { CUT_LIST_FITS, CUT_LIST_PRINT_COLUMNS, cutLength, fitField, fittingName, isCalculationLine, nextLineName, printCells, takeoffField, type FittingCatalogRow } from '../shared/cut-list.ts';
import { cutListEntries } from '../shared/planning.ts';
import { canReport, canResource } from '../shared/permissions.ts';
import type { Availability, Row } from '../shared/types.ts';
import type { AuthRequest } from './auth.ts';
import { AppError, SYSTEM, type Store } from './store.ts';

const filled = (value: unknown) => value !== undefined && value !== null && value !== '';

/**
 * A cut list line before the store validates it (Store.validate): a line with a total length gets the take-off of each chosen
 * fitting from the catalog and its cut length (PASTUK LENGTH) in `lengthMm`, one piece unless pieces are given; whatever the
 * request sent for these computed fields is replaced. A line without a line number gets the next one of its isometric.
 * A line without a total length (the earlier register) is left as it was sent.
 */
export function prepareCutListInput(store: Store, input: Record<string, unknown>, existing?: Row): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing, ...input }, next = { ...input };
  if (!filled(String(merged.name ?? '').trim()) && typeof merged.isoId === 'string' && merged.isoId) next.name = nextLineName(store.list('cut_list', true).filter(row => row.isoId === merged.isoId));
  if (!isCalculationLine(merged)) {
    // The take-offs are worked out, never typed: an earlier line has none.
    for (const slot of CUT_LIST_FITS) delete next[takeoffField(slot)];
    return next;
  }
  const numeric = ['totalLength', 'bevel', 'extraLength'].filter(name => filled(merged[name]) && (typeof merged[name] !== 'number' || !Number.isFinite(merged[name])));
  // Not numbers: the field validation answers them with its own sentence.
  if (numeric.length) return next;
  const takeoffs = CUT_LIST_FITS.map(slot => {
    const id = merged[fitField(slot)];
    if (!filled(id) || typeof id !== 'string') return 0;
    const fitting = store.list('cut_fittings', true).find(row => row.id === id);
    return fitting && Number.isFinite(Number(fitting.takeoff)) ? Number(fitting.takeoff) : 0;
  });
  const result = cutLength(merged, takeoffs);
  CUT_LIST_FITS.forEach((slot, index) => { next[takeoffField(slot)] = filled(merged[fitField(slot)]) ? takeoffs[index] : ''; });
  if (!(result.length > 0)) throw new AppError(422, `The cut length works out at ${result.length} mm. Check the total length, the bevel, the extra length and the fittings.`, { totalLength: 'The cut length must be more than 0 mm.' });
  next.lengthMm = result.length;
  if (!filled(merged.quantity)) next.quantity = 1;
  return next;
}

/** A fitting without a name gets its readable name (shared/cut-list.ts `fittingName`). */
export function prepareFittingInput(input: Record<string, unknown>, existing?: Row): Record<string, unknown> {
  const merged = { ...existing, ...input };
  return String(merged.name ?? '').trim() ? input : { ...input, name: fittingName({ code: merged.code, description: merged.description, diameter: merged.diameter }) };
}

// ── The shipped fitting catalog ──────────────────────────────────────────────

export const fittingCatalogId = (row: FittingCatalogRow) => `cut-fitting-${row[0]}`;
export const fittingRecord = ([, code, description, diameter, takeoff]: FittingCatalogRow) => ({ name: fittingName({ code, description, diameter }), code, description, diameter, takeoff });
/** Catalog fittings the workspace does not hold (active or archived, compared by code). Reads only. */
export function missingFittingCatalog(store: Store, catalog: FittingCatalogRow[] = CUT_LIST_FITTINGS) {
  const existing = store.list('cut_fittings', true), codes = new Set(existing.map(row => String(row.code ?? '').trim().toLowerCase())), ids = new Set(existing.map(row => row.id));
  return catalog.filter(row => !codes.has(row[1].trim().toLowerCase()) && !ids.has(fittingCatalogId(row)));
}
/**
 * Add the fittings of the client's catalog the workspace does not hold. A fitting that exists (same code, active or archived) is
 * never changed, so what the client edited stays; running it again adds nothing. Used by the sample workspace and the hosted
 * preparation step (server/hosted-data-steps.ts). Returns the number added.
 */
export function loadFittingCatalog(store: Store, catalog: FittingCatalogRow[] = CUT_LIST_FITTINGS): number {
  const missing = missingFittingCatalog(store, catalog);
  if (!missing.length) return 0;
  store.transaction(() => { for (const row of missing) store.create('cut_fittings', fittingRecord(row), SYSTEM, fittingCatalogId(row)); });
  return missing.length;
}

// ── Export as the Excel sheet Print ──────────────────────────────────────────

export interface CutListSheet { project: string; projectNo: string; createdBy: string; date: Date; lines: (string | number)[][] }
/** The printed cut list of the client's workbook: title, Project / Project no / Created by / Date, then the lines. */
export function cutListWorkbook(sheet: CutListSheet) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
  const ws = workbook.addWorksheet('Cut list', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [24, 8, 12, 10, 12, 14, 9, 16, 14, 10].map(width => ({ width }));
  ws.getCell('A1').value = 'Cut List'; ws.getCell('A1').font = { bold: true, size: 16 };
  ws.getCell('A3').value = 'Project:'; ws.getCell('B3').value = sheet.project;
  ws.getCell('A4').value = 'Project no:'; ws.getCell('B4').value = sheet.projectNo;
  ws.getCell('G3').value = 'Created by:'; ws.getCell('H3').value = sheet.createdBy;
  ws.getCell('G4').value = 'Date:'; ws.getCell('H4').value = sheet.date; ws.getCell('H4').numFmt = 'dd.mm.yyyy';
  for (const cell of ['A3', 'A4', 'G3', 'G4']) ws.getCell(cell).font = { bold: true };
  const header = ws.getRow(7); header.values = [...CUT_LIST_PRINT_COLUMNS]; header.font = { bold: true }; header.alignment = { wrapText: true, vertical: 'middle' };
  const border = { style: 'thin' as const };
  for (const line of sheet.lines) ws.addRow(line);
  for (let number = 7; number <= ws.rowCount; number++) for (let column = 1; column <= CUT_LIST_PRINT_COLUMNS.length; column++) {
    const cell = ws.getRow(number).getCell(column); cell.border = { top: border, left: border, bottom: border, right: border };
    if (number > 7 && column === 6) cell.numFmt = '0.00';
  }
  ws.views = [{ state: 'frozen', ySplit: 7 }];
  return workbook;
}

export interface CutListRouteDependencies { app: Express; store: Store; availability: Availability | undefined; readableRows(req: Request, key: string, archived?: boolean): Row[] }
/** `GET /api/cut-list/export?isoId=…`: the cut list of one isometric as the client's sheet Print (Excel), with the account as Created by. */
export function registerCutListRoutes({ app, availability, readableRows }: CutListRouteDependencies) {
  app.get('/api/cut-list/export', async (req, res) => {
    if (availability && !Object.hasOwn(availability.reports, 'cut-list')) throw new AppError(404, 'This resource could not be found.');
    const user = (req as unknown as AuthRequest).user;
    if (!canReport(user, 'cut-list', 'export')) throw new AppError(403, 'Your permission profile does not allow this export.');
    const isoId = typeof req.query.isoId === 'string' ? req.query.isoId.slice(0, 150) : '';
    const rows: Record<string, Row[]> = Object.fromEntries(['sites', 'projects', 'isometrics', 'spools', 'cut_list', 'cut_fittings', 'iso_materials'].filter(key => canResource(user, key)).map(key => [key, readableRows(req, key)]));
    const iso = (rows.isometrics || []).find(row => row.id === isoId);
    if (!iso) throw new AppError(404, 'The isometric could not be found.');
    const project = (rows.projects || []).find(row => row.id === iso.projectId), site = (rows.sites || []).find(row => row.id === project?.siteId);
    const spools = new Map((rows.spools || []).map(row => [row.id, String(row.name ?? '')]));
    const lines = cutListEntries(rows, new Set([iso.id])).filter(entry => canResource(user, 'cut_list', 'export', entry.line)).map(entry => printCells({ ...entry.line, material: entry.line.material || entry.material?.materialNo || '' }, String(iso.isoNo ?? ''), spools.get(String(entry.line.spoolId ?? '')) ?? '', entry.length));
    res.setHeader('Cache-Control', 'no-store'); res.attachment(`cut-list-${String(iso.isoNo ?? 'isometric').replace(/[^\w.-]+/g, '_')}.xlsx`);
    await cutListWorkbook({ project: String(site?.name ?? ''), projectNo: String(project?.internnumber ?? ''), createdBy: user.name, date: new Date(), lines }).xlsx.write(res); res.end();
  });
}
