import type { Application, Request } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { AppError, type Store } from './store.ts';
import { actorOf, type AuthRequest } from './auth.ts';
import type { releaseAccess } from './release-access.ts';
import type { documentStorage } from './documents.ts';
import { canResource } from '../shared/permissions.ts';
import type { Row } from '../shared/types.ts';
import { inOwnerSite, ownerRows } from '../shared/welder-data.ts';
import {
  PQR_IMPORT_COLUMNS, PQR_NUMBER, pqrImportActionError, pqrImportColumn, pqrImportPreview, pqrImportSummary, wpsCopyRefusal, wpsCopyValues,
  wpsGlobalDeactivation, wpsSiteChange, type PqrImportRow,
} from '../shared/wps.ts';

/**
 * Weld data actions of the hosted profile (shared/wps.ts): WPS per project site (activate / deactivate, copy, mass copy,
 * global deactivate), removing a PQR attribute value from its dropdown, and the Excel import of PQRs. Every rule and
 * permission is checked here; the pages only mirror them.
 */
type Access = ReturnType<typeof releaseAccess>;
type Documents = ReturnType<typeof documentStorage>;
const user = (req: Request) => (req as AuthRequest).user;
const allow = (req: Request, key: string, verb: Parameters<typeof canResource>[2], row?: Row) => { if (!canResource(user(req), key, verb, row)) throw new AppError(403, 'Your permission profile does not allow this action.'); };
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(id => typeof id !== 'string' || !id) || new Set(value).size !== value.length) throw new AppError(422, 'Select between 1 and 500 WPS methods.');
  return value as string[];
}
function siteOf(store: Store, value: unknown): Row {
  if (typeof value !== 'string' || !value) throw new AppError(422, 'Choose a project site.', { siteId: 'Choose a project site.' });
  try { return store.get('sites', value); } catch (error) { if ((error as AppError).status === 404) throw new AppError(422, 'Choose an active project site.', { siteId: 'Choose an active project site.' }); throw error; }
}
// Archived rows included: the rules read the live ones (shared/wps.ts), the main projects of an older WPS also its deactivated site links.
const wpsRows = (store: Store) => Object.fromEntries(['wps', 'wps_sites', 'wps_projects', 'wps_pqr', 'sites', 'projects', 'pqr'].map(key => [key, store.list(key, true)]));
/** Every list `ownerSites` reads, archived rows included (shared/welder-data.ts). */
const owners = (store: Store, key: string) => ownerRows(key, resource => store.list(resource, true));
/** The main project the request works in (PQR import adds PQRs there). */
const activeSite = (req: Request) => { const siteId = String(user(req).siteId || ''); if (!siteId) throw new AppError(422, 'Open a main project before importing PQRs.'); return siteId; };

const MAX_ROWS = 1000, MAX_TEXT = 2000;
/** The sheet's rows as text by column name (row 1 is the header). */
async function readSheet(buffer: Buffer): Promise<{ rowNo: number; values: Record<string, string> }[]> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new AppError(422, 'This Excel file could not be read. Use the template and save it as .xlsx.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError(422, 'The Excel file has no sheet.');
  const columns = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, index) => { const name = pqrImportColumn(cell.text || ''); if (name) columns.set(index, name); });
  if (![...columns.values()].includes(PQR_NUMBER.name)) throw new AppError(422, 'Row 1 must hold the column headings of the template, including PQR.');
  const rows: { rowNo: number; values: Record<string, string> }[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo); const values: Record<string, string> = {};
    for (const [index, name] of columns) {
      const cell = row.getCell(index);
      const raw = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : (cell.text || '').trim();
      if (raw) values[name] = raw.slice(0, MAX_TEXT);
    }
    if (Object.keys(values).length) rows.push({ rowNo, values });
  }
  if (!rows.length) throw new AppError(422, 'The Excel file has no PQR rows. Enter one PQR per row, starting on row 2.');
  if (rows.length > MAX_ROWS) throw new AppError(422, `Import at most ${MAX_ROWS} rows at a time.`);
  return rows;
}
/** PQR number → ids of the active PQRs that carry it (case and outer spaces do not matter). */
function existingNumbers(store: Store, siteId: string): Map<string, string[]> {
  const options = new Map(store.list('qualification_options', true).map(option => [option.id, String(option.name || '').trim()]));
  const map = new Map<string, string[]>(), lists = owners(store, 'pqr');
  // Only the PQRs of the main project are matched: another main project's PQR with the same number is not updated.
  for (const pqr of store.list('pqr').filter(row => inOwnerSite('pqr', row, siteId, lists))) {
    const number = options.get(String(pqr[PQR_NUMBER.name] || ''));
    if (number) map.set(number.toLowerCase(), [...(map.get(number.toLowerCase()) || []), pqr.id]);
  }
  return map;
}
/** What one row writes: the filled cells (an empty cell keeps the stored value of an existing PQR). */
const rowData = (row: PqrImportRow) => Object.fromEntries(Object.entries(row.values).filter(([name, value]) => value !== '' && PQR_IMPORT_COLUMNS.some(column => column.name === name)));

export function registerWpsRoutes(app: Application, { store, documents, access }: { store: Store; documents: Documents; access: Access }) {
  // --- WPS per project site -------------------------------------------------------------------------------------------
  app.post('/api/wps/site', (req, res) => {
    access.resource('wps');
    const list = ids(req.body?.ids), site = siteOf(store, req.body?.siteId);
    if (typeof req.body?.enabled !== 'boolean') throw new AppError(422, 'Choose activate or deactivate.');
    const actor = actorOf(req);
    const records = store.transaction(() => list.map(id => {
      const wps = access.record('wps', id); allow(req, 'wps', 'edit', wps);
      if (wps._archived) throw new AppError(422, `WPS ${wps.name} is deleted. Restore it first.`);
      // A WPS belongs to one main project (client 20.11.2026): it is switched on there only; another main project copies it.
      if (req.body.enabled && !inOwnerSite('wps', wps, site.id, owners(store, 'wps'))) throw new AppError(422, `WPS ${wps.name} belongs to another main project. Copy it to use it on ${site.name}.`);
      return store.update('wps', id, wpsSiteChange(wpsRows(store), wps, site.id, req.body.enabled), wps._version, actor);
    }));
    res.json({ records: records.map(row => access.project('wps', row)) });
  });
  app.post('/api/wps/global-deactivate', (req, res) => {
    access.resource('wps');
    const list = ids(req.body?.ids);
    // Global deactivate changes every project site, so an account limited to some of them cannot use it.
    if (user(req).siteLimited) throw new AppError(403, 'Global deactivate needs access to every project site.');
    const actor = actorOf(req);
    const records = store.transaction(() => list.map(id => {
      const wps = access.record('wps', id); allow(req, 'wps', 'edit', wps);
      return wps._archived ? wps : store.update('wps', id, wpsGlobalDeactivation(), wps._version, actor);
    }));
    res.json({ records: records.map(row => access.project('wps', row)) });
  });
  /** The copy carries the original's attached documents: its own attachment rows, each with its own copy of the stored file. A file whose bytes are unavailable is left out. */
  function copyDocuments(original: Row, copy: Row, actor: ReturnType<typeof actorOf>) {
    const files = store.list('attachments').filter(file => file.entityType === 'wps' && file.entityId === original.id).sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)));
    for (const file of files) {
      const row = store.create('attachments', { name: file.name, entityType: 'wps', entityId: copy.id, documentType: file.documentType, mime: file.mime, size: file.size, note: file.note || '' }, actor);
      if (!documents.copy(file.id, row.id)) store.archive('attachments', row.id, row._version, actor);
    }
  }
  app.post('/api/wps/copy', (req, res) => {
    access.resource('wps');
    const list = ids(req.body?.ids), site = siteOf(store, req.body?.siteId);
    allow(req, 'wps', 'insert');
    const actor = actorOf(req);
    const records = store.transaction(() => list.map(id => {
      const wps = access.record('wps', id, true); allow(req, 'wps', 'show', wps);
      const rows = wpsRows(store);
      const refusal = wpsCopyRefusal(rows, wps, site.id);
      if (refusal) throw new AppError(422, refusal);
      const copy = store.create('wps', wpsCopyValues(rows, wps, site.id), actor);
      copyDocuments(wps, copy, actor);
      return copy;
    }));
    res.status(201).json({ records: records.map(row => access.project('wps', row)) });
  });

  // --- PQR attribute values -------------------------------------------------------------------------------------------
  app.post('/api/pqr/options/:id/remove', (req, res) => {
    access.resource('pqr');
    const option = access.record('qualification_options', String(req.params.id)); allow(req, 'qualification_options', 'delete', option);
    const row = store.archive('qualification_options', option.id, option._version, actorOf(req));
    res.json({ record: access.project('qualification_options', row) });
  });

  // --- Import PQR -----------------------------------------------------------------------------------------------------
  const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const importAllowed = (req: Request) => { access.resource('pqr'); allow(req, 'pqr', 'import'); };
  /** Each row checked as it would be saved (nothing is kept). */
  function dryRun(req: Request, rows: PqrImportRow[]) {
    const actor = actorOf(req);
    store.transaction(() => {
      store.db.exec('SAVEPOINT pqr_import_preview');
      try {
        for (const row of rows) {
          if (row.errors.length) continue;
          store.db.exec('SAVEPOINT pqr_import_row');
          try { save(req, row, row.action as 'import' | 'update', actor); store.db.exec('RELEASE pqr_import_row'); }
          catch (error) { store.db.exec('ROLLBACK TO pqr_import_row; RELEASE pqr_import_row'); row.errors.push(...messages(store.translate(error))); }
        }
      } finally { store.db.exec('ROLLBACK TO pqr_import_preview; RELEASE pqr_import_preview'); }
    });
  }
  const messages = (error: unknown) => { const e = error as AppError; return e.fields && Object.keys(e.fields).length ? Object.values(e.fields) : [e.message || 'This row could not be saved.']; };
  function save(req: Request, row: PqrImportRow, action: 'import' | 'update', actor: ReturnType<typeof actorOf>) {
    if (action === 'import') { allow(req, 'pqr', 'insert'); return store.create('pqr', { ...rowData(row), siteId: activeSite(req) }, actor); }
    const target = access.record('pqr', row.targetId); allow(req, 'pqr', 'edit', target);
    if (!inOwnerSite('pqr', target, activeSite(req), owners(store, 'pqr'))) throw new AppError(422, 'This PQR belongs to another main project.');
    return store.update('pqr', target.id, rowData(row), target._version, actor);
  }
  const respond = (rows: PqrImportRow[]) => ({ rows: rows.map(row => ({ rowNo: row.rowNo, action: row.action, values: row.values, errors: row.errors })), ...pqrImportSummary(rows) });
  app.post('/api/pqr-import/preview', memory.single('file'), async (req, res) => {
    importAllowed(req);
    if (!req.file) throw new AppError(422, 'Choose an Excel file.');
    if (!/\.xlsx$/i.test(req.file.originalname)) throw new AppError(422, 'Choose an Excel file (.xlsx).');
    const rows = pqrImportPreview(await readSheet(req.file.buffer), existingNumbers(store, activeSite(req)));
    dryRun(req, rows);
    res.json(respond(rows));
  });
  app.post('/api/pqr-import/commit', (req, res) => {
    importAllowed(req);
    const input = req.body?.rows;
    if (!Array.isArray(input) || !input.length || input.length > MAX_ROWS) throw new AppError(422, 'Upload the Excel file again and check the preview.');
    const parsed = input.map((row: Record<string, unknown>, index) => {
      const values = row && typeof row.values === 'object' && !Array.isArray(row.values) ? row.values as Record<string, unknown> : null;
      if (!values || Object.entries(values).some(([name, value]) => !PQR_IMPORT_COLUMNS.some(column => column.name === name) || typeof value !== 'string' || value.length > MAX_TEXT)) throw new AppError(422, 'Upload the Excel file again and check the preview.');
      return { rowNo: Number.isSafeInteger(row.rowNo) ? Number(row.rowNo) : index + 2, values: values as Record<string, string>, chosen: row.action };
    });
    // The rows are checked again: matching and every rule follow the data as it is now, not as it was at the preview.
    const rows = pqrImportPreview(parsed, existingNumbers(store, activeSite(req)));
    const actor = actorOf(req); const result = { imported: 0, updated: 0, skipped: 0, failed: 0 };
    store.transaction(() => rows.forEach((row, index) => {
      const chosen = parsed[index].chosen;
      if (!String(row.values[PQR_NUMBER.name] || '').trim()) { result.skipped++; return; }
      if (chosen === 'skip') return;
      const refusal = row.errors.length ? row.errors[0] : pqrImportActionError(row, chosen);
      if (refusal) { result.failed++; return; }
      store.db.exec('SAVEPOINT pqr_import_row');
      try { save(req, row, row.action as 'import' | 'update', actor); store.db.exec('RELEASE pqr_import_row'); result[row.action === 'import' ? 'imported' : 'updated']++; }
      catch (error) { store.db.exec('ROLLBACK TO pqr_import_row; RELEASE pqr_import_row'); if ((error as AppError).status === 403) throw error; result.failed++; }
    }));
    res.status(201).json(result);
  });
  app.get('/api/pqr-import/template', async (req, res) => {
    importAllowed(req);
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('PQR');
    sheet.columns = PQR_IMPORT_COLUMNS.map(column => ({ header: column.label, key: column.name, width: Math.max(14, column.label.length + 4) }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment('blitzkrieg-pqr-import-template.xlsx'); await workbook.xlsx.write(res); res.end();
  });
}
