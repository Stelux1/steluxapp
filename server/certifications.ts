/**
 * Material certificates of the hosted profile (Weld Pilot → Material data → Certifications): Import certifications,
 * Export to ZIP and Duplicate certificate, and the rule that a certificate or welding wire is created in a main project.
 *
 * Every route checks the account's right on certifications inside the request's pilot and works on the records the
 * account may read (project site access included, server/site-scope.ts); writes go through the store, so the record
 * guard, the hosted rules (server/welder-data.ts) and the field list of the profile apply as on the record routes.
 */
import type { Express, Request } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { crc32 } from 'node:zlib';
import { extname } from 'node:path';
import { canResource } from '../shared/permissions.ts';
import { CERTIFICATE_IMPORT_COLUMNS, IMPORT_ROW_LIMIT, importRow, type ImportLookup, type ImportedRow } from '../shared/certifications.ts';
import { SITE_OWNED, SITE_UNIQUE, certificateBasicMaterial, inOwnerSite, linkedToProject } from '../shared/welder-data.ts';
import type { Row } from '../shared/types.ts';
import { actorOf, checkResourcePermission, type AuthRequest } from './auth.ts';
import type { documentStorage } from './documents.ts';
import type { releaseAccess } from './release-access.ts';
import { inSiteScope, keepSiteScope, scopeRows, siteRefused } from './site-scope.ts';
import { AppError, type Store } from './store.ts';

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();

/**
 * Hosted profile: a record of SITE_OWNED is created in a main project. The client sends the open one for a certificate or
 * welding wire; an ITP, WPS or PQR created without one takes the request's main project (`activeSiteId`).
 */
export function requireOwnerSite(key: string, input: Record<string, unknown>, activeSiteId = '') {
  if (SITE_UNIQUE[key] && !text(input.siteId) && activeSiteId) input.siteId = activeSiteId;
  if (SITE_OWNED[key] && !text(input.siteId)) throw new AppError(422, 'Open a main project before adding this record.', { siteId: 'Open a main project first.' });
}

/** A ZIP archive of stored (uncompressed) entries; names are UTF-8. */
export function zipArchive(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  const stamp = new Date(), time = (stamp.getHours() << 11) | (stamp.getMinutes() << 5) | Math.floor(stamp.getSeconds() / 2), day = ((stamp.getFullYear() - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate();
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8'), crc = crc32(entry.data) >>> 0, size = entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(day, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, entry.data); centrals.push(central, name);
    offset += local.length + name.length + size;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** The sheet of an upload (XLSX, or CSV) as cells by header; rows without any value are left out. */
export async function readSheet(file: Express.Multer.File): Promise<{ row: number; cells: Record<string, string> }[]> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv')) {
    let raw: Record<string, string>[];
    try { raw = parse(file.buffer, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 100_000 }); } catch { throw new AppError(422, 'This file could not be read. Use the Excel template.'); }
    return raw.map((cells, index) => ({ row: index + 2, cells }));
  }
  if (!name.endsWith('.xlsx')) throw new AppError(422, 'Choose an Excel (.xlsx) file.');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer); } catch { throw new AppError(422, 'This file could not be read. Use the Excel template.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError(422, 'The Excel file has no sheet.');
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column] = text(cell.text); });
  const rows: { row: number; cells: Record<string, string> }[] = [];
  sheet.eachRow({ includeEmpty: false }, (line, number) => {
    if (number === 1) return;
    const cells: Record<string, string> = {};
    line.eachCell({ includeEmpty: true }, (cell, column) => { if (headers[column]) cells[headers[column]] = text(cell.text); });
    if (Object.values(cells).some(Boolean)) rows.push({ row: number, cells });
  });
  return rows;
}

interface Dependencies {
  app: Express; store: Store; documents: ReturnType<typeof documentStorage>; access: ReturnType<typeof releaseAccess>;
  readableRows(req: Request, key: string, archived?: boolean): Row[];
}
export function registerCertificationRoutes({ app, store, documents, access, readableRows }: Dependencies) {
  const user = (req: Request) => (req as unknown as AuthRequest).user;
  /** A main project the request may reach (unknown otherwise), from the body or the query. */
  function siteOf(req: Request, value: unknown): Row {
    // A main project out of the account's reach gets the same answer as on the record routes (403 `site`).
    const named = typeof value === 'string' && value ? store.list('sites').find(row => row.id === value) : undefined;
    if (named && !inSiteScope('sites', named)) throw siteRefused();
    const site = named && scopeRows('sites', [named]).length && access.visible(user(req), 'sites', named) ? named : undefined;
    if (!site) throw new AppError(404, 'This main project could not be found.');
    return site;
  }
  const lookupsFor = (req: Request, siteId: string): Record<ImportLookup, Row[]> => ({
    materials: canResource(user(req), 'materials') ? readableRows(req, 'materials') : [],
    diameters: readableRows(req, 'diameters'), material_parts: readableRows(req, 'material_parts'), material_types: readableRows(req, 'material_types'),
    suppliers: readableRows(req, 'suppliers'), projects: readableRows(req, 'projects').filter(row => row.siteId === siteId),
  });
  /** Each row checked as the record route would save it, inside a savepoint that is rolled back (the CSV import's preview). */
  function dryRun(req: Request, rows: ImportedRow[]) {
    store.transaction(() => {
      store.db.exec('SAVEPOINT certificate_import_preview');
      try {
        for (const row of rows) {
          store.db.exec('SAVEPOINT certificate_import_row');
          try { store.create('certifications', row.values, actorOf(req)); }
          catch (error) { const failure = store.translate(error) as AppError; if (failure instanceof AppError) { for (const [name, message] of Object.entries(failure.fields || { _row: failure.message })) row.errors[name] ??= message; } else row.errors._row ??= 'This row could not be checked.'; }
          finally { store.db.exec('ROLLBACK TO certificate_import_row; RELEASE certificate_import_row'); }
        }
      } finally { store.db.exec('ROLLBACK TO certificate_import_preview; RELEASE certificate_import_preview'); }
    });
  }
  const permitImport = (req: Request) => { checkResourcePermission(req, 'certifications', 'insert'); checkResourcePermission(req, 'certifications', 'import'); };

  app.get('/api/certifications/import/template', async (req, res) => {
    permitImport(req);
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('Certifications');
    sheet.columns = CERTIFICATE_IMPORT_COLUMNS.map(column => ({ header: column.header, key: column.field, width: 20 }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment('certifications-import-template.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  // The upload finishes outside the request's async context: keep the account's project site scope (server/site-scope.ts).
  const memory = keepSiteScope(multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }));
  app.post('/api/certifications/import/preview', memory.single('file'), async (req, res) => {
    permitImport(req);
    const site = siteOf(req, req.body?.siteId);
    if (!req.file) throw new AppError(422, 'Choose an Excel (.xlsx) file.');
    const sheet = await readSheet(req.file);
    if (!sheet.length || sheet.length > IMPORT_ROW_LIMIT) throw new AppError(422, 'Import between 1 and 1,000 rows at a time.');
    const lookups = lookupsFor(req, site.id);
    const rows = sheet.map(line => importRow(line.row, line.cells, lookups)).map(row => ({ ...row, values: { ...row.values, siteId: site.id } }));
    dryRun(req, rows);
    res.json({ rows: rows.map(row => ({ ...row, action: Object.keys(row.errors).length ? 'skip' : 'import' })), lookups: Object.fromEntries(Object.entries(lookups).map(([key, list]) => [key, list.map(row => row.id)])) });
  });
  app.post('/api/certifications/import', (req, res) => {
    permitImport(req);
    const site = siteOf(req, req.body?.siteId);
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_ROW_LIMIT) throw new AppError(422, 'Import between 1 and 1,000 rows at a time.');
    let inserted = 0; const skipped: { row: number; message: string }[] = [];
    store.transaction(() => {
      for (const [index, entry] of rows.entries()) {
        const number = Number.isSafeInteger(entry?.row) ? entry.row : index + 2;
        if (entry?.action !== 'import') { skipped.push({ row: number, message: 'Skipped.' }); continue; }
        const values = entry?.values;
        if (!values || typeof values !== 'object' || Array.isArray(values)) { skipped.push({ row: number, message: 'This row is invalid.' }); continue; }
        // The main project of the import, whatever the row says; the fields of the profile only.
        const input = { ...values, siteId: site.id };
        access.input('certifications', input); access.complete('certifications', input); access.links(user(req), 'certifications', input);
        store.db.exec('SAVEPOINT certificate_import_row');
        try { store.create('certifications', input, actorOf(req)); store.db.exec('RELEASE certificate_import_row'); inserted++; }
        catch (error) { store.db.exec('ROLLBACK TO certificate_import_row; RELEASE certificate_import_row'); const failure = store.translate(error); if (failure instanceof AppError && failure.status === 403) throw failure; skipped.push({ row: number, message: failure instanceof AppError ? failure.fields ? Object.values(failure.fields).join(' ') : failure.message : 'This row could not be imported.' }); }
      }
    });
    res.status(201).json({ inserted, skipped: skipped.length, problems: skipped.filter(item => item.message !== 'Skipped.') });
  });

  app.get('/api/certifications/zip', (req, res) => {
    checkResourcePermission(req, 'certifications', 'export');
    const site = siteOf(req, req.query.siteId);
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (projectId && !readableRows(req, 'projects').some(row => row.id === projectId && row.siteId === site.id)) throw new AppError(404, 'This project could not be found.');
    const owned = { links: store.list('certificate_projects', true), projects: store.list('projects', true) };
    const certificates = readableRows(req, 'certifications').filter(row => inOwnerSite('certifications', row, site.id, owned) && (!projectId || linkedToProject(row, owned.links, 'certificateId', projectId)) && canResource(user(req), 'certifications', 'export', row))
      .sort((a, b) => text(a.indexNo).localeCompare(text(b.indexNo), 'en', { numeric: true }));
    const lists = new Map<string, Map<string, Row>>();
    const label = (key: string, id: unknown, field: string) => { if (!canResource(user(req), key)) return ''; let list = lists.get(key); if (!list) { list = new Map(readableRows(req, key, true).map(row => [row.id, row])); lists.set(key, list); } return text(list.get(String(id))?.[field]); };
    const types = readableRows(req, 'material_types'), files = readableRows(req, 'attachments');
    const entries: { name: string; data: Buffer }[] = [], index: string[][] = [], used = new Set<string>();
    for (const certificate of certificates) {
      const names: string[] = [];
      for (const file of files.filter(item => item.entityType === 'certifications' && item.entityId === certificate.id && !item._archived)) {
        const bytes = documents.read(file.id); if (!bytes) continue;
        const base = (text(certificate.indexNo) || certificate.id).replace(/[^A-Za-z0-9._-]/g, '-'), extension = extname(text(file.name)).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.pdf';
        let name = `${base}${extension}`; for (let n = 2; used.has(name); n++) name = `${base}-${n}${extension}`;
        used.add(name); names.push(name); entries.push({ name, data: bytes });
      }
      index.push([text(certificate.indexNo), text(certificate.chargeNo), text(certificate.certType), text(certificate.name), label('materials', certificate.materialId, 'materialNo'), label('material_types', certificate.materialTypeId, 'name'), label('material_parts', certificate.materialPartId, 'name'), certificateBasicMaterial(certificate, types), text(certificate.diameter), text(certificate.schedule), text(certificate.wallThickness), label('suppliers', certificate.supplierId, 'name'), certificate.controlled ? 'Yes' : 'No', certificate.accepted ? 'Yes' : 'No', names.join(' ')]);
    }
    const header = ['Index number', 'Charge number', 'Certificate-type', 'Attest number', 'Material No', 'Type of material', 'Material part', 'Basic material', 'Dia.', 'Schedule', 'Wall thickness', 'Supplier', 'Ctrl.', 'Accp.', 'File'];
    entries.unshift({ name: 'index.csv', data: Buffer.from(stringify(index, { header: true, columns: header, escape_formulas: true }), 'utf8') });
    const archive = zipArchive(entries);
    res.setHeader('Cache-Control', 'no-store');
    res.attachment(`certifications-${text(site.name).replace(/[^A-Za-z0-9._-]+/g, '-') || 'main-project'}.zip`).type('application/zip').send(archive);
  });

  app.post('/api/certifications/:id/duplicate', (req, res) => {
    checkResourcePermission(req, 'certifications', 'insert');
    const original = access.record('certifications', String(req.params.id)); checkResourcePermission(req, 'certifications', 'show', original);
    const values = req.body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new AppError(422, 'Choose the values of the copy.');
    // The copy belongs to the main project of the original (an older one without it: the open main project).
    const siteId = text(original.siteId) || siteOf(req, req.body?.siteId).id;
    const input = { ...values, indexNo: '', siteId };
    access.input('certifications', input); access.complete('certifications', input); access.links(user(req), 'certifications', input);
    const copyFile = req.body?.copyFile === true;
    const record = store.transaction(() => {
      const created = store.create('certifications', input, actorOf(req));
      if (copyFile) {
        checkResourcePermission(req, 'certifications', 'import', created);
        for (const file of store.list('attachments').filter(item => item.entityType === 'certifications' && item.entityId === original.id)) {
          const bytes = documents.read(file.id); if (!bytes) continue;
          const copy = store.create('attachments', { name: file.name, entityType: 'certifications', entityId: created.id, documentType: file.documentType || 'Attachment', mime: file.mime, size: bytes.length, note: file.note || '' }, actorOf(req));
          documents.saveBytes(copy.id, bytes);
        }
      }
      return created;
    });
    res.status(201).json({ record: access.project('certifications', record) });
  });
}
