import type { Application, Request } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { ISO_IMPORT_COLUMNS, ISO_IMPORT_EXAMPLES, ORDERED_LINE_REFUSAL, PILOT_MATERIAL_RULES, isoImportField, isoImportPreview, isoMaterialInputErrors, isoRevisions, materialLineStatuses, type IsoImportRow } from '../shared/mto-materials.ts';
import type { Row } from '../shared/types.ts';
import { RESOURCES } from '../shared/resources.ts';
import { canAction, canResource } from '../shared/permissions.ts';
import {
  IMPORT_FIELDS, MATERIAL_IMPORT_COLUMNS, MATERIAL_IMPORT_EXAMPLES, importField, importable, importedMaterial, massEditChanges, massEditRefusal, materialImportPreview,
  materialImportSummary, materialUomId, missingCatalogMaterials, takeOverCounts, takeOverRows, type ImportContext, type ImportRow, type ImportRowInput,
} from '../shared/material-db.ts';
import { AppError, qty, type Actor, type Store } from './store.ts';
import { actorOf, type AuthRequest } from './auth.ts';
import type { releaseAccess } from './release-access.ts';

type Input = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const CUSTOM_FIELDS = ['materialNo', 'description', 'materialGroup', 'articleNo', 'legacyNo', 'dia', 'lbs', 'uom', 'price'] as const;
interface MtoResult { resource: string; record?: Row; records?: Row[] }
export const MTO_MATERIAL_ACTIONS = ['add-iso-material', 'set-material-type', 'archive-iso-materials', 'edit-iso-material'];

function requirementIds(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(id => typeof id !== 'string' || !id)) throw new AppError(422, 'Check at least one material.');
  return [...new Set(value)] as string[];
}

/**
 * Add a material to an isometric, from the catalog or as a custom material (optionally also saved to the
 * catalog). The group chosen in the form must match the catalog material; the revision must be one of the
 * isometric's ISO revisions.
 */
function addIsoMaterial(store: Store, input: Input, actor: Actor): MtoResult {
  const iso = store.get('isometrics', input.isoId);
  // Pilots (the reference form): Type and Revision are required (Revision while the isometric has ISO revisions), the quantity starts at 0.01, UOM starts at EA.
  const hosted = store.hostedRules, hasRevisions = hosted && store.list('revisions').some(row => row.type === 'ISO' && row.isoId === iso.id);
  const data: Input = hosted && input.source === 'Custom' && !str(input.uom) ? { ...input, uom: 'EA' } : input;
  const phase = data.phaseId ? store.get('operation_phases', data.phaseId) : undefined;
  const errors = isoMaterialInputErrors(data, { requireGroup: data.addToDB === true, ...(hosted ? { ...PILOT_MATERIAL_RULES, requireRevision: hasRevisions } : {}) });
  if (!errors.quantity && qty(data.quantity) <= 0) errors.quantity = 'The quantity is too small.';
  if (data.addToDB !== undefined && typeof data.addToDB !== 'boolean') errors.addToDB = 'Choose whether to add this material to the catalog.';
  if (Object.keys(errors).length) throw new AppError(422, 'Please check the highlighted fields.', errors);
  let revisionId = '';
  if (str(data.revisionId)) {
    const revision = store.get('revisions', data.revisionId);
    if (revision.type !== 'ISO' || revision.isoId !== iso.id) throw new AppError(422, 'Choose an ISO revision of this isometric.', { revisionId: 'Choose an ISO revision of this isometric.' });
    revisionId = revision.id;
  }
  const base = { isoId: iso.id, quantity: qty(data.quantity), phaseId: phase?.id || '', chargeNo: str(data.chargeNo), revisionId };
  if (data.source === 'Catalog') {
    const material = store.get('materials', data.materialId);
    if (str(data.materialGroup) && str(data.materialGroup) !== str(material.materialGroup)) throw new AppError(422, 'This material is not in the chosen group.', { materialId: 'Choose a material from the chosen group.' });
    return { resource: 'iso_materials', record: store.create('iso_materials', { ...base, materialId: material.id, customMaterial: false }, actor) };
  }
  const custom = Object.fromEntries(CUSTOM_FIELDS.map(name => [name, data[name] ?? '']));
  const classification = { componentCode: str(data.componentCode), progressClass: str(data.progressClass) };
  const material = data.addToDB ? store.create('materials', { ...custom, ...classification }, actor) : null;
  return { resource: 'iso_materials', record: store.create('iso_materials', { ...base, ...custom, ...classification, customMaterial: !material, materialId: material?.id || '' }, actor) };
}

/** Set the operation phase ("Type") of the checked requirements, all or nothing. */
function setMaterialType(store: Store, data: Input, actor: Actor): MtoResult {
  const phase = store.get('operation_phases', data.phaseId);
  const records: Row[] = requirementIds(data.requirementIds).map(id => {
    const row = store.get('iso_materials', id);
    return row.phaseId === phase.id ? row : store.update('iso_materials', row.id, { phaseId: phase.id }, row._version, actor);
  });
  return { resource: 'iso_materials', records };
}

/** Delete the checked requirements: they are archived and can be restored from the Isometric materials page. */
function archiveIsoMaterials(store: Store, data: Input, actor: Actor): MtoResult {
  const ids = requirementIds(data.requirementIds);
  // Pilots (the reference disables Delete on an ordered line): a line that has an order stays, and nothing is archived then.
  if (store.hostedRules) {
    const rows = executionRows(store), lines = ids.map(id => store.get('iso_materials', id));
    for (const line of lines) if (materialLineStatuses(rows, String(line.isoId)).get(line.id)?.hasOrder) throw new AppError(409, `${ORDERED_LINE_REFUSAL} Check the lines without an order and try again.`, { requirementIds: ORDERED_LINE_REFUSAL });
  }
  const records = ids.map(id => { const row = store.get('iso_materials', id); return store.archive('iso_materials', row.id, row._version, actor); });
  return { resource: 'iso_materials', records };
}
const executionRows = (store: Store) => Object.fromEntries(['isometrics', 'projects', 'iso_materials', 'orders', 'order_lines', 'picklists', 'stock', 'materials', 'custom_materials', 'material_quantity_changes'].map(key => [key, store.list(key)]));

const EDIT_FIELDS = ['requirementId', 'phaseId', 'componentCode', 'uom', 'chargeNo', 'expectedVersion'];
const PROGRESS_OF_CODE: Record<string, string> = { '1': 'Pipe', '2': 'Supports', '3': 'Appendages' };
/**
 * Edit material (row pencil): the reference changes the Type, Component code, UOM and Charge number of a line and shows
 * everything else read-only. Any other field, the quantity above all, is refused here. Each change is written to the
 * audit trail of the isometric (our addition).
 */
function editIsoMaterial(store: Store, data: Input, actor: Actor): MtoResult {
  const stray = Object.keys(data).filter(name => !EDIT_FIELDS.includes(name) && data[name] !== undefined);
  if (stray.length) throw new AppError(422, 'Only the type, component code, UOM and charge number can be changed here. The quantity changes in the quantity log.', Object.fromEntries(stray.map(name => [name, name === 'quantity' ? 'Change the quantity in the quantity log.' : 'This field cannot be changed here.'])));
  const line = store.get('iso_materials', data.requirementId);
  if (data.expectedVersion !== undefined && data.expectedVersion !== line._version) throw new AppError(409, 'This material changed since you opened it. Refresh and try again.');
  const changes: Record<string, unknown> = {}, notes: string[] = [];
  if (data.phaseId !== undefined && str(data.phaseId) !== str(line.phaseId)) {
    if (!str(data.phaseId)) throw new AppError(422, 'Choose the type.', { phaseId: 'Choose the type.' });
    const phase = store.get('operation_phases', data.phaseId), before = line.phaseId ? store.get('operation_phases', line.phaseId, true) : undefined;
    changes.phaseId = phase.id; notes.push(`type ${before?.name ?? '-'} → ${phase.name}`);
  }
  if (data.componentCode !== undefined && str(data.componentCode) !== str(line.componentCode)) {
    const code = str(data.componentCode);
    if (code && !PROGRESS_OF_CODE[code]) throw new AppError(422, 'Use 1 = pipe, 2 = supports, 3 = appendages.', { componentCode: 'Use 1 = pipe, 2 = supports, 3 = appendages.' });
    changes.componentCode = code; changes.progressClass = PROGRESS_OF_CODE[code] ?? ''; notes.push(`component code ${str(line.componentCode) || '-'} → ${code || '-'}`);
  }
  if (data.chargeNo !== undefined && str(data.chargeNo) !== str(line.chargeNo)) { changes.chargeNo = str(data.chargeNo); notes.push(`charge number ${str(line.chargeNo) || '-'} → ${str(data.chargeNo) || '-'}`); }
  const material = line.materialId ? store.get('materials', line.materialId, true) : line.customMaterialId ? store.get('custom_materials', line.customMaterialId, true) : line;
  if (data.uom !== undefined && str(data.uom) !== str(material.uom)) {
    const uom = store.list('uoms').find(row => row.name === str(data.uom));
    if (!uom) throw new AppError(422, 'Choose a unit that exists.', { uom: 'Choose a unit that exists.' });
    // A custom line shares its identity record with its orders and stock: that record carries the unit.
    if (!line.materialId && line.customMaterialId) store.update('custom_materials', String(line.customMaterialId), { uom: uom.name }, material._version, actor);
    changes.uom = uom.name; notes.push(`UOM ${str(material.uom) || '-'} → ${uom.name}`);
  }
  const record = notes.length ? store.update('iso_materials', line.id, changes, line._version, actor) : line;
  if (notes.length) store.audit('isometrics', String(line.isoId), 'material edited', `Edited material ${str(material.materialNo) || line.id}: ${notes.join(', ')}`, actor);
  return { resource: 'iso_materials', record };
}

/** Pilots: the generic record edit of an isometric material may not change the quantity (it changes in the quantity log only). */
export function assertIsoMaterialRecordEdit(body: Input, existing: Row): void {
  if (body.quantity !== undefined && Number(body.quantity) !== Number(existing.quantity)) throw new AppError(422, 'The quantity changes only in the quantity log, with Remove quantity by revision.', { quantity: 'Change the quantity in the quantity log.' });
}

/** Runs the MTO materials actions; undefined for any other action. Called from `runAction`, inside its transaction. */
export function runMtoMaterialAction(store: Store, key: string, data: Input, actor: Actor): MtoResult | undefined {
  if (key === 'add-iso-material') return addIsoMaterial(store, data, actor);
  if (key === 'set-material-type') return setMaterialType(store, data, actor);
  if (key === 'archive-iso-materials') return archiveIsoMaterials(store, data, actor);
  if (key === 'edit-iso-material') return editIsoMaterial(store, data, actor);
  return undefined;
}

// ----- Material database (MTO Pilot, pilots profile) ---------------------------------------------------------------------

/**
 * Values the pages read that older records do not store: a material saved before UOMs were referenced points at the
 * UOM of its code, and its code follows the UOM's current name; an operation phase saved before IDs were given shows
 * the number that was typed as its ID.
 */
export function deriveMaterialRows(store: Store, key: string, rows: Row[]): Row[] {
  if (key === 'materials' && store.hostedRules) {
    const uoms = store.list('uoms', true), names = new Map(uoms.map(uom => [uom.id, uom.name]));
    return rows.map(row => { const uomId = materialUomId(row, uoms); return uomId ? { ...row, uomId, uom: names.get(uomId) ?? row.uom } : row; });
  }
  if (key === 'operation_phases') return rows.map(row => row.number === undefined || row.number === null ? { ...row, number: typeof row.sort === 'number' ? row.sort : null } : row);
  return rows;
}

/** Mass edit of materials (pilots): only the filled fields are written; Material No is never one of them. */
export function materialMassEdit(changes: Record<string, unknown>): Record<string, string> {
  if (Object.hasOwn(changes, 'materialNo')) throw new AppError(422, massEditRefusal(changes), { materialNo: 'Material number cannot be changed.' });
  const filled = massEditChanges(changes), refusal = massEditRefusal(filled);
  if (refusal) throw new AppError(422, refusal);
  return filled;
}

/**
 * Delete material, as the reference shows it. A material that any record points at (an isometric, an order, the
 * inventory, a certificate, a weld, earlier records included) or that has documents is refused, so nothing loses it.
 * Underneath the record is archived, as in every other catalog; its Material No can be used again by a new material.
 */
export function deleteMaterial(store: Store, id: string, version: unknown, actor: Actor): void {
  store.transaction(() => {
    const material = store.get('materials', id, true);
    if (material._archived) throw new AppError(404, 'This material no longer exists.');
    if (material._version !== version) throw new AppError(409, 'This record changed. Refresh and try again.');
    for (const resource of RESOURCES) for (const field of resource.fields.filter(item => item.ref === 'materials')) {
      if (store.db.prepare(`SELECT id FROM "${resource.key}" WHERE "${field.name}"=? LIMIT 1`).get(id)) throw new AppError(422, `This material is used by ${resource.title.toLowerCase()} and cannot be deleted.`);
    }
    if (store.list('attachments', true).some(file => file.entityType === 'materials' && file.entityId === id)) throw new AppError(422, 'This material has documents and cannot be deleted.');
    store.archive('materials', id, material._version, actor);
  });
}

const MAX_ROWS = 5000, MAX_TEXT = 2000;
const importContext = (store: Store): ImportContext => ({ materials: store.list('materials'), uoms: store.list('uoms'), parts: store.list('material_parts'), types: store.list('material_types') });
/** The sheet's rows by material field (row 1 holds the headings; columns the import does not know are left out). */
async function readSheet(buffer: Buffer): Promise<ImportRowInput[]> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new AppError(422, 'This Excel file could not be read. Use the template and save it as .xlsx.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError(422, 'The Excel file has no sheet.');
  const columns = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, index) => { const field = importField(cell.text); if (field && ![...columns.values()].includes(field)) columns.set(index, field); });
  if (![...columns.values()].includes('materialNo')) throw new AppError(422, 'Row 1 must hold the column headings of the template, including Material No.');
  const rows: ImportRowInput[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo), values: Record<string, string> = {};
    for (const [index, field] of columns) { const value = (row.getCell(index).text || '').trim(); if (value) values[field] = value.slice(0, MAX_TEXT); }
    if (Object.keys(values).length) rows.push({ rowNo, values });
  }
  if (!rows.length) throw new AppError(422, 'The Excel file has no material rows. Enter one material per row, starting on row 2.');
  if (rows.length > MAX_ROWS) throw new AppError(422, `Import at most ${MAX_ROWS} rows at a time.`);
  return rows;
}
/** Rows sent back by the page (preview edits and commit): only the import's own fields, as text. */
function sentRows(value: unknown): ImportRowInput[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ROWS) throw new AppError(422, 'Upload the Excel file again and check the preview.');
  return value.map((row: Record<string, unknown>, index) => {
    const values = row && typeof row.values === 'object' && !Array.isArray(row.values) ? row.values as Record<string, unknown> : null;
    if (!values || Object.entries(values).some(([name, item]) => !IMPORT_FIELDS.includes(name) || typeof item !== 'string' || item.length > MAX_TEXT)) throw new AppError(422, 'Upload the Excel file again and check the preview.');
    return { rowNo: Number.isSafeInteger(row.rowNo) ? Number(row.rowNo) : index + 2, values: values as Record<string, string>, action: row.action, source: row.source, origin: typeof row.origin === 'string' ? row.origin : undefined };
  });
}
const respond = (rows: ImportRow[]) => ({ rows, summary: materialImportSummary(rows) });

/** Requirement lines of a take-over that may point at the new catalog material: custom lines of the site with nothing ordered, picked, reserved or moved yet. */
function linkableLines(store: Store, siteId: string, materialNo: string): Row[] {
  const projects = new Set(store.list('projects').filter(project => project.siteId === siteId).map(project => project.id));
  const isos = new Set(store.list('isometrics').filter(iso => projects.has(String(iso.projectId))).map(iso => iso.id));
  const used = new Set(['order_lines', 'picklists', 'reservations', 'material_locations', 'service_requests', 'movements'].flatMap(key => store.list(key, true).map(row => String(row.requirementId || ''))));
  const held = new Set(['stock', 'movements', 'order_lines', 'picklists'].flatMap(key => store.list(key, true).map(row => String(row.customMaterialId || ''))));
  return store.list('iso_materials').filter(line => !line.materialId && line.customMaterial && String(line.materialNo ?? '').trim() === materialNo && isos.has(String(line.isoId)) && !used.has(line.id) && !held.has(String(line.customMaterialId || '')));
}

export interface ImportOptions {
  actor: Actor;
  /** Main project of a take-over: its isometric lines of the taken-over Material No are linked to the new catalog rows. */
  siteId?: string;
  /** Whether the account may change a requirement line (a line it may not change keeps its custom material). */
  mayLink?: (line: Row) => boolean;
  /** Reserved for "Clean import" (mto-catalogs-002); refused until that flow builds it. */
  clean?: boolean;
}
/**
 * Commit an import: the rows are checked again against the data as it is now, and each row chosen for import without an
 * error or warning becomes a catalog material. Rows of a take-over also link their isometric lines to the new material.
 */
export function commitMaterialImport(store: Store, input: ImportRowInput[], options: ImportOptions) {
  if (options.clean) throw new AppError(422, 'Clean import is not available yet.');
  const result = { committed: 0, skipped: 0, failed: 0, linked: 0 };
  store.transaction(() => {
    const context = importContext(store);
    for (const row of materialImportPreview(input, context)) {
      if (!importable(row)) { result[row.action === 'skip' ? 'skipped' : 'failed']++; continue; }
      store.db.exec('SAVEPOINT material_import_row');
      try {
        const material = store.create('materials', importedMaterial(row, context), options.actor);
        context.materials.push(material);
        if (row.source !== 'file' && row.origin && options.siteId) for (const line of linkableLines(store, options.siteId, row.origin)) {
          if (options.mayLink && !options.mayLink(line)) continue;
          store.update('iso_materials', line.id, { materialId: material.id, customMaterial: false, customMaterialId: '' }, line._version, options.actor); result.linked++;
        }
        store.db.exec('RELEASE material_import_row'); result.committed++;
      } catch (error) { store.db.exec('ROLLBACK TO material_import_row; RELEASE material_import_row'); if ((error as AppError).status === 403) throw error; result.failed++; }
    }
  });
  return result;
}

type Access = ReturnType<typeof releaseAccess>;
export function registerMaterialDbRoutes(app: Application, { store, access }: { store: Store; access: Access }) {
  const user = (req: Request) => (req as AuthRequest).user;
  const allow = (req: Request, verb: Parameters<typeof canResource>[2]) => { access.resource('materials'); if (!canResource(user(req), 'materials', verb)) throw new AppError(403, 'Your permission profile does not allow this action.'); };
  const importAllowed = (req: Request) => { allow(req, 'import'); allow(req, 'insert'); };
  const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  const site = (value: unknown) => { if (typeof value !== 'string' || !value) throw new AppError(422, 'Choose a main project first.'); return store.get('sites', value).id; };
  const visible = (req: Request, key: string) => store.list(key).filter(row => access.visible(user(req), key, row));
  const missing = (req: Request, siteId: string) => missingCatalogMaterials(Object.fromEntries(['materials', 'projects', 'isometrics', 'iso_materials', 'orders', 'order_lines', 'picklists', 'stock', 'custom_materials'].map(key => [key, visible(req, key)])), siteId);

  app.get('/api/material-import/template', async (req, res) => {
    importAllowed(req);
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('Materials');
    sheet.columns = MATERIAL_IMPORT_COLUMNS.map(column => ({ header: column.header, key: column.field, width: Math.max(12, column.header.length + 6) }));
    sheet.addRows(MATERIAL_IMPORT_EXAMPLES);
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment('blitzkrieg-material-import-template.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  app.post('/api/material-import/preview', memory.single('file'), async (req, res) => {
    importAllowed(req);
    if (!req.file) throw new AppError(422, 'Choose an Excel file.');
    if (!/\.xlsx$/i.test(req.file.originalname)) throw new AppError(422, 'Choose an Excel file (.xlsx).');
    res.json(respond(materialImportPreview(await readSheet(req.file.buffer), importContext(store))));
  });
  // The preview again after a Material No or an action was changed on the page (nothing is saved).
  app.post('/api/material-import/check', (req, res) => { importAllowed(req); res.json(respond(materialImportPreview(sentRows(req.body?.rows), importContext(store)))); });
  app.get('/api/material-import/take-over', (req, res) => { importAllowed(req); res.setHeader('Cache-Control', 'no-store'); res.json(takeOverCounts(missing(req, site(req.query.siteId)))); });
  app.post('/api/material-import/take-over', (req, res) => {
    importAllowed(req);
    const source = req.body?.source;
    if (source !== 'iso' && source !== 'order') throw new AppError(422, 'Choose isometrics or order materials.');
    const rows = takeOverRows(missing(req, site(req.body?.siteId)), source);
    res.json(rows.length ? respond(materialImportPreview(rows, importContext(store))) : { empty: true, rows: [], summary: materialImportSummary([]) });
  });
  app.post('/api/material-import/commit', (req, res) => {
    importAllowed(req);
    const rows = sentRows(req.body?.rows);
    const siteId = rows.some(row => row.source === 'iso' || row.source === 'order') ? site(req.body?.siteId) : undefined;
    const options = req.body?.options && typeof req.body.options === 'object' ? req.body.options as Record<string, unknown> : {};
    res.status(201).json(commitMaterialImport(store, rows, { actor: actorOf(req), siteId, clean: options.clean === true, mayLink: line => canResource(user(req), 'iso_materials', 'edit', line) }));
  });
  app.post('/api/materials/:id/delete', (req, res) => {
    access.resource('materials');
    const material = access.record('materials', String(req.params.id), true);
    if (!canResource(user(req), 'materials', 'delete', material)) throw new AppError(403, 'Your permission profile does not allow this action.');
    deleteMaterial(store, material.id, req.body?._version, actorOf(req));
    res.json({ deleted: material.id });
  });
}

// ----- Import in ISO (MTO Pilot, pilots profile) -------------------------------------------------------------------------

/** The sheet's rows by import field (row 1 holds the headings; unknown columns are left out). */
async function readIsoSheet(buffer: Buffer): Promise<{ rowNo: number; values: Record<string, string> }[]> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new AppError(422, 'This Excel file could not be read. Use the template and save it as .xlsx.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError(422, 'The Excel file has no sheet.');
  const columns = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, index) => { const field = isoImportField(cell.text); if (field && ![...columns.values()].includes(field)) columns.set(index, field); });
  if (![...columns.values()].includes('materialNo') || ![...columns.values()].includes('quantity')) throw new AppError(422, 'Row 1 must hold the column headings of the template, including Material No and Qty.');
  const rows: { rowNo: number; values: Record<string, string> }[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo), values: Record<string, string> = {};
    for (const [index, field] of columns) { const value = (row.getCell(index).text || '').trim(); if (value) values[field] = value.slice(0, MAX_TEXT); }
    if (Object.keys(values).length) rows.push({ rowNo, values });
  }
  if (!rows.length) throw new AppError(422, 'The Excel file has no material rows. Enter one material per row, starting on row 2.');
  if (rows.length > MAX_ROWS) throw new AppError(422, `Import at most ${MAX_ROWS} rows at a time.`);
  return rows;
}
const isoImportRows = (store: Store, input: { rowNo: number; values: Record<string, string> }[]) => isoImportPreview(input, Object.fromEntries(['materials', 'uoms', 'operation_phases'].map(key => [key, store.list(key)])));
const isoImportSummary = (rows: IsoImportRow[]) => ({ total: rows.length, valid: rows.filter(row => !Object.keys(row.error).length).length, errors: rows.filter(row => Object.keys(row.error).length).length });

/**
 * Commit an import into one isometric: every row without an error becomes a requirement line of that isometric (a catalog
 * line for a Material No of the database, else a custom line) on the newest ISO revision, in the row's Type. Other rows are counted as failed.
 */
export function commitIsoMaterialImport(store: Store, isoId: string, input: { rowNo: number; values: Record<string, string> }[], actor: Actor) {
  const iso = store.get('isometrics', isoId), result = { committed: 0, failed: 0 };
  store.transaction(() => {
    const revision = isoRevisions({ revisions: store.list('revisions') }, iso.id)[0];
    for (const row of isoImportRows(store, input)) {
      if (Object.keys(row.error).length) { result.failed++; continue; }
      store.db.exec('SAVEPOINT iso_material_import_row');
      try {
        const values = row.values;
        const common = { isoId: iso.id, source: row.source, quantity: row.quantity, phaseId: row.phaseId, revisionId: revision?.id ?? '' };
        addIsoMaterial(store, row.source === 'Catalog' ? { ...common, materialId: row.materialId } : { ...common, materialNo: values.materialNo, description: values.description, materialGroup: values.materialGroup ?? '', articleNo: values.articleNo ?? '', legacyNo: '', dia: values.dia ?? '', lbs: values.lbs ?? '', uom: row.uom, componentCode: values.componentCode ?? '', progressClass: PROGRESS_OF_CODE[values.componentCode ?? ''] ?? '' }, actor);
        store.db.exec('RELEASE iso_material_import_row'); result.committed++;
      } catch (error) { store.db.exec('ROLLBACK TO iso_material_import_row; RELEASE iso_material_import_row'); if ((error as AppError).status === 403) throw error; result.failed++; }
    }
    if (result.committed) store.audit('isometrics', iso.id, 'materials imported', `Imported ${result.committed} material ${result.committed === 1 ? 'line' : 'lines'} from Excel`, actor);
  });
  return result;
}

export function registerIsoMaterialImportRoutes(app: Application, { store, access }: { store: Store; access: Access }) {
  const user = (req: Request) => (req as AuthRequest).user;
  const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  const allowed = (req: Request, isoId: unknown) => {
    access.resource('iso_materials');
    if (typeof isoId !== 'string' || !isoId) throw new AppError(422, 'Choose an isometric first.');
    const iso = access.record('isometrics', isoId);
    if (!canAction(user(req), 'add-iso-material', { isoId: iso.id })) throw new AppError(403, 'Your permission profile does not allow this action.');
    return iso;
  };
  const sent = (value: unknown) => {
    if (!Array.isArray(value) || !value.length || value.length > MAX_ROWS) throw new AppError(422, 'Upload the Excel file again and check the preview.');
    return value.map((row: Record<string, unknown>, index) => {
      const values = row && typeof row.values === 'object' && row.values && !Array.isArray(row.values) ? row.values as Record<string, unknown> : null;
      if (!values || Object.entries(values).some(([name, item]) => !ISO_IMPORT_COLUMNS.some(column => column.field === name) || typeof item !== 'string' || item.length > MAX_TEXT)) throw new AppError(422, 'Upload the Excel file again and check the preview.');
      return { rowNo: Number.isSafeInteger(row.rowNo) ? Number(row.rowNo) : index + 2, values: values as Record<string, string> };
    });
  };
  app.get('/api/iso-material-import/template', async (req, res) => {
    allowed(req, req.query.isoId);
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('Materials');
    sheet.columns = ISO_IMPORT_COLUMNS.map(column => ({ header: column.header, key: column.field, width: Math.max(12, column.header.length + 6) }));
    sheet.addRows(ISO_IMPORT_EXAMPLES);
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment('blitzkrieg-iso-materials-import-template.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  app.post('/api/iso-material-import/preview', memory.single('file'), async (req, res) => {
    allowed(req, req.body?.isoId);
    if (!req.file) throw new AppError(422, 'Choose an Excel file.');
    if (!/\.xlsx$/i.test(req.file.originalname)) throw new AppError(422, 'Choose an Excel file (.xlsx).');
    const rows = isoImportRows(store, await readIsoSheet(req.file.buffer));
    res.json({ rows, summary: isoImportSummary(rows) });
  });
  app.post('/api/iso-material-import/commit', (req, res) => {
    const iso = allowed(req, req.body?.isoId);
    res.status(201).json(commitIsoMaterialImport(store, iso.id, sent(req.body?.rows), actorOf(req)));
  });
}
