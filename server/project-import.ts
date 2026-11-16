import type { Application, Request } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { projectResource } from '../shared/release.ts';
import { canResource } from '../shared/permissions.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { projectInPilot } from '../shared/project-scope.ts';
import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import { materialsOnSite } from '../shared/material-sites.ts';
import {
  IMPORT_MODES, IMPORT_PART_NAMES, headerColumns, importColumns, neededRights, planImport, templateExamples,
  type ImportColumn, type ImportContext, type ImportMode, type ImportPart, type ImportPlan, type SheetRow,
} from '../shared/project-import.ts';
import type { Availability, Row, User } from '../shared/types.ts';
import { AppError, type Actor, type Store } from './store.ts';
import { actorOf, type AuthRequest } from './auth.ts';
import type { releaseAccess } from './release-access.ts';
import { allowedSites, keepSiteScope } from './site-scope.ts';
import { assignIrn } from './iso-pages.ts';
import { runWeldEntryAction } from './weld-entry.ts';
import { commitIsoMaterialImport } from './mto-materials.ts';
import { checkIsoWrite } from './itps.ts';

/**
 * Projects → Import (shared/project-import.ts holds the columns and the rules): the Excel template, the preview (nothing
 * is written) and the commit, which checks the file again against the data as it is now and writes everything in one
 * transaction, in the open main project only. Each part (projects, isometrics, welds, material lines) needs its own
 * import right, and the add / edit right for what it creates or changes; a part the account may not import is refused
 * (403) before anything is written.
 */

type Access = ReturnType<typeof releaseAccess>;
const MAX_ROWS = 10000, MAX_TEXT = 2000;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();

/** The columns of a mode, from Edit project / Edit isometric as the profile delivers them. */
export const columnsFor = (availability: Availability | undefined, mode: ImportMode) => importColumns(mode, { projects: projectResource(availability, RESOURCE_MAP.projects).fields, isometrics: projectResource(availability, RESOURCE_MAP.isometrics).fields });

/** The text of a cell: dates as YYYY-MM-DD, formulas by their result, rich text joined. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text ?? '');
    if ('error' in value) return '';
  }
  return String(value);
}
/** The rows of the sheet. Row 2 holds the headers (row 1 the hints); a sheet with the headers on row 1 is read as well. */
export async function readImportSheet(buffer: Buffer, columns: ImportColumn[]): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new AppError(422, 'This Excel file could not be read. Use the template and save it as .xlsx.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError(422, 'The Excel file has no sheet.');
  const headersOf = (rowNo: number) => { const headers: string[] = []; sheet.getRow(rowNo).eachCell({ includeEmpty: true }, (cell, index) => { headers[index] = cellText(cell.value); }); return headers; };
  const required = columns.filter(column => column.required).map(column => column.key);
  let headerRow = 2, map = headerColumns(headersOf(2), columns);
  if (!required.every(key => [...map.values()].includes(key))) { const first = headerColumns(headersOf(1), columns); if (required.every(key => [...first.values()].includes(key))) { headerRow = 1; map = first; } }
  const missing = columns.filter(column => column.required && ![...map.values()].includes(column.key)).map(column => column.header);
  if (missing.length) throw new AppError(422, `Row 2 must hold the column headers of the template, including ${missing.join(' and ')}.`);
  const rows: SheetRow[] = [];
  for (let rowNo = headerRow + 1; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo), values: Record<string, string> = {};
    for (const [index, key] of map) { const value = cellText(row.getCell(index).value).trim(); if (value) values[key] = value.slice(0, MAX_TEXT); }
    if (Object.keys(values).length) rows.push({ rowNo, values });
    if (rows.length > MAX_ROWS) throw new AppError(422, `Import at most ${MAX_ROWS} rows at a time.`);
  }
  if (!rows.length) throw new AppError(422, `The Excel file has no rows to import. Enter one row per ${columns.some(column => column.part === 'isometrics') ? 'isometric' : 'project'}, starting on row ${headerRow + 1}.`);
  return rows;
}

/** The data of the open main project the import is checked against (see ImportContext). */
export function importContext(store: Store, siteId: string, columns: ImportColumn[], options: { pilot?: string; visible?: (key: string, row: Row) => boolean; title?: (key: string) => string } = {}): ImportContext {
  const projects = store.list('projects', true).filter(project => project.siteId === siteId);
  const projectIds = new Set(projects.map(project => project.id));
  const isometrics = store.list('isometrics', true).filter(iso => projectIds.has(String(iso.projectId)));
  const isoIds = new Set(isometrics.map(iso => iso.id));
  const weldNumbers: ImportContext['weldNumbers'] = {}, materialLines: ImportContext['materialLines'] = {};
  for (const weld of store.list('welds')) if (isoIds.has(String(weld.isoId))) (weldNumbers[String(weld.isoId)] ??= []).push(text(weld.weldNo));
  const materialNo = new Map(store.list('materials', true).map(material => [material.id, text(material.materialNo)]));
  for (const line of store.list('iso_materials')) if (isoIds.has(String(line.isoId))) (materialLines[String(line.isoId)] ??= []).push({ materialNo: line.materialId ? materialNo.get(String(line.materialId)) || text(line.materialNo) : text(line.materialNo), phaseId: text(line.phaseId) });
  const refs: ImportContext['refs'] = {};
  for (const column of columns) {
    if (!column.ref || refs[column.ref]) continue;
    let rows: Row[] = []; try { rows = store.list(column.ref).filter(row => !options.visible || options.visible(column.ref!, row)); } catch { rows = []; }
    refs[column.ref] = { rows, display: RESOURCE_MAP[column.ref]?.display || 'name', title: options.title?.(column.ref) || RESOURCE_MAP[column.ref]?.title || column.ref };
  }
  return {
    projects, isometrics, weldNumbers, materialLines, refs,
    materialRows: { materials: store.hostedRules ? materialsOnSite(store.list('materials'), siteId, store.list(CATALOG_SITES)) : store.list('materials'), uoms: store.list('uoms'), operation_phases: store.list('operation_phases') },
    hiddenProjects: new Set(projects.filter(project => !projectInPilot(project, options.pilot)).map(project => project.id)),
  };
}

export interface CommitOptions {
  mode: ImportMode; withWelds?: boolean; siteId: string; actor: Actor;
  /** Throws (403) when a part of the plan may not be imported by the account. */
  allow?: (plan: ImportPlan) => void;
  /** Checks of a project / isometric write the record routes make as well (fields of the profile, required fields, ITP links). */
  checkWrite?: (key: 'projects' | 'isometrics', value: Record<string, unknown>, existing?: Row) => void;
  /** Import projects: projects of the main project that are not in the file are deleted (archived), except those with isometrics. */
  clean?: boolean;
  context: () => ImportContext;
}
export interface CommitResult {
  projects: { created: number; updated: number; deleted?: number; kept?: string[] };
  isometrics: { created: number; updated: number }; welds: number; materials: number; skipped: number;
}

/** The weld ranges and material lines of one isometric (existing welds are never changed). */
function addIsoParts(store: Store, isoId: string, iso: ImportPlan['isometrics'][number], actor: Actor): { welds: number; materials: number } {
  let welds = 0;
  for (const range of iso.ranges) {
    if (!range.numbers.length) continue;
    const done = runWeldEntryAction(store, 'add-welds', { isoId, start: range.start, end: range.end }, actor) as { records?: Row[] };
    welds += done.records?.length ?? 0;
  }
  let materials = 0;
  if (iso.materials.length) {
    const result = commitIsoMaterialImport(store, isoId, iso.materials, actor);
    if (result.failed) throw new AppError(422, `Isometric ${iso.isoNo}: ${result.failed} material ${result.failed === 1 ? 'line' : 'lines'} could not be added. Upload the file again and check the preview.`);
    materials = result.committed;
  }
  return { welds, materials };
}

/**
 * Commit an import: the plan is made again inside the transaction from the data as it is now, every part is checked,
 * then projects, isometrics, welds and material lines are written. Any failure rolls the whole import back.
 */
export function commitProjectImport(store: Store, input: SheetRow[], columns: ImportColumn[], options: CommitOptions): CommitResult {
  return store.transaction(() => {
    const plan = planImport(input, columns, options.context(), options);
    options.allow?.(plan);
    const result: CommitResult = { projects: { created: 0, updated: 0 }, isometrics: { created: 0, updated: 0 }, welds: 0, materials: 0, skipped: plan.summary.errors };
    const projectIds = new Map<string, string>();
    for (const project of plan.projects) {
      const label = `Project ${project.internnumber}`;
      try {
        if (project.existing) {
          projectIds.set(project.internnumber, project.existing.id);
          if (!Object.keys(project.values).length) continue;
          options.checkWrite?.('projects', project.values, project.existing);
          store.update('projects', project.existing.id, project.values, store.get('projects', project.existing.id)._version, options.actor); result.projects.updated++;
        } else {
          const value = { ...project.values, siteId: options.siteId };
          options.checkWrite?.('projects', value);
          projectIds.set(project.internnumber, store.create('projects', value, options.actor).id); result.projects.created++;
        }
      } catch (error) { throw prefixed(error, label); }
    }
    for (const iso of plan.isometrics) {
      const label = `Isometric ${iso.isoNo}`;
      try {
        let isoId: string;
        if (iso.existing) {
          isoId = iso.existing.id;
          const value = { ...iso.values };
          // Auto IRN: an isometric without IRN gets the next one of the main project when the file leaves it empty.
          if (!text(value.irn) && !text(iso.existing.irn)) { const probe: Record<string, unknown> = { projectId: iso.existing.projectId }; assignIrn(store, probe, options.actor); if (probe.irn) value.irn = probe.irn; }
          if (Object.keys(value).length) { options.checkWrite?.('isometrics', value, iso.existing); store.update('isometrics', isoId, value, store.get('isometrics', isoId)._version, options.actor); result.isometrics.updated++; }
        } else {
          const value: Record<string, unknown> = { ...iso.values, projectId: projectIds.get(iso.internnumber) };
          options.checkWrite?.('isometrics', value);
          if (!text(value.irn)) assignIrn(store, value, options.actor);
          isoId = store.create('isometrics', value, options.actor).id; result.isometrics.created++;
        }
        const added = addIsoParts(store, isoId, iso, options.actor);
        result.welds += added.welds; result.materials += added.materials;
      } catch (error) { throw prefixed(error, label); }
    }
    if (options.clean && options.mode === 'projects') {
      const inFile = new Set(input.map(row => text(row.values['projects.internnumber'])).filter(Boolean));
      const used = new Set(store.list('isometrics').map(iso => String(iso.projectId)));
      const kept: string[] = []; let deleted = 0;
      for (const project of store.list('projects').filter(row => row.siteId === options.siteId && !inFile.has(text(row.internnumber)))) {
        if (used.has(project.id)) { kept.push(text(project.internnumber)); continue; }
        store.archive('projects', project.id, project._version, options.actor); deleted++;
      }
      Object.assign(result.projects, { deleted, kept });
    }
    return result;
  });
}
/** The IRN of an import is the file's (manual :492): the typed-IRN refusal of the forms does not apply to it. */
export const withoutIrn = (value: Record<string, unknown>) => { const { irn: _irn, ...rest } = value; return rest; };
function prefixed(error: unknown, label: string) {
  if (error instanceof AppError && error.status !== 403 && !error.message.startsWith(label)) return new AppError(error.status, `${label}: ${error.message}`, error.fields);
  return error;
}

/** The owning pilot of a part that belongs to one pilot only (welds: Weld Pilot, material lines: MTO Pilot). */
const PART_PILOT: Partial<Record<ImportPart, 'weld' | 'mto'>> = { welds: 'weld', iso_materials: 'mto' };

export function registerProjectImportRoutes(app: Application, { store, access, availability }: { store: Store; access: Access; availability: Availability | undefined }) {
  const user = (req: Request) => (req as AuthRequest).user;
  const memory = keepSiteScope(multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }));
  const modeOf = (value: unknown): ImportMode => { if (!IMPORT_MODES.includes(value as ImportMode)) throw new AppError(422, 'Choose Import projects or Import all project data.'); return value as ImportMode; };
  const siteOf = (req: Request) => { const siteId = user(req).siteId; if (!siteId) throw new AppError(422, 'Choose a main project first.'); return siteId; };
  const flag = (value: unknown, name: string) => { if (value === undefined || value === '' ) return false; if (value === 'true' || value === '1' || value === true) return true; if (value === 'false' || value === '0' || value === false) return false; throw new AppError(422, `Choose whether to import ${name}.`); };
  /** The page itself: the record types of the mode must be delivered and the account must have the import right of the mode's main part. */
  const opened = (req: Request, mode: ImportMode) => {
    access.resource('projects'); if (mode === 'full') { access.resource('isometrics'); access.resource('welds'); access.resource('iso_materials'); }
    const main = mode === 'projects' ? 'projects' : 'isometrics';
    if (!canResource(user(req), main, 'import')) throw new AppError(403, `Your permission profile does not allow importing ${IMPORT_PART_NAMES[main]}.`);
  };
  /**
   * The right of one part. Projects and isometrics follow the current pilot. Welds belong to Weld Pilot and material lines
   * to MTO Pilot: as in Copy isometrics (server/release-access.ts `copyParts`), such a part is judged by the account's
   * profile in the pilot that owns it, for this main project, and only when the account is enabled there.
   */
  const partRefusal = (req: Request, siteId: string, part: ImportPart, verbs: string[]): string => {
    const current = user(req), owner = PART_PILOT[part];
    let account: User = current;
    if (owner && current.pilot !== owner) {
      const title = PILOT_MAP[owner].title;
      const reach = allowedSites(store, store.get('users', current.id), owner);
      if (reach !== 'all' && !reach.has(siteId)) return `Your ${title} access does not include this main project.`;
      try { account = access.pilotAccount(current.id, owner, reach !== 'all' ? siteId : undefined); } catch { return `You are not enabled in ${title}.`; }
    }
    const verb = verbs.find(item => !canResource(account, part, item as 'import'));
    if (!verb) return '';
    const where = owner && current.pilot !== owner ? `Your ${PILOT_MAP[owner].title} profile` : 'Your permission profile';
    return verb === 'import' ? `${where} does not allow importing ${IMPORT_PART_NAMES[part]}.` : `${where} does not allow ${verb === 'insert' ? 'adding' : 'changing'} ${IMPORT_PART_NAMES[part]}.`;
  };
  const allow = (req: Request, siteId: string, mode: ImportMode) => (plan: ImportPlan) => {
    for (const [part, verbs] of neededRights(plan, mode)) { const refusal = partRefusal(req, siteId, part, verbs); if (refusal) throw new AppError(403, refusal); }
  };
  const contextOf = (req: Request, siteId: string, columns: ImportColumn[]) => () => importContext(store, siteId, columns, {
    pilot: user(req).pilot, visible: (key, row) => access.visible(user(req), key, row), title: key => projectResource(availability, RESOURCE_MAP[key]).title,
  });
  const upload = async (req: Request) => {
    const mode = modeOf(req.body?.mode); opened(req, mode);
    const siteId = siteOf(req);
    if (!req.file) throw new AppError(422, 'Choose an Excel file.');
    if (!/\.xlsx$/i.test(req.file.originalname)) throw new AppError(422, 'Choose an Excel file (.xlsx).');
    const columns = columnsFor(availability, mode);
    return { mode, siteId, columns, rows: await readImportSheet(req.file.buffer, columns), withWelds: mode === 'full' && flag(req.body?.withWelds, 'welds') };
  };

  app.get('/api/project-import/template', async (req, res) => {
    const mode = modeOf(req.query.mode); opened(req, mode);
    const columns = columnsFor(availability, mode);
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet(mode === 'full' ? 'Project data' : 'Projects');
    sheet.columns = columns.map(column => ({ key: column.key, width: Math.min(40, Math.max(14, column.header.length + 4)) }));
    sheet.addRow(columns.map(column => column.hint)); sheet.addRow(columns.map(column => column.header));
    sheet.addRows(templateExamples(mode, columns));
    sheet.getRow(1).font = { italic: true, color: { argb: 'FF6B7280' } }; sheet.getRow(1).alignment = { wrapText: true, vertical: 'top' }; sheet.getRow(2).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    res.attachment(mode === 'full' ? 'blitzkrieg-project-data-import-template.xlsx' : 'blitzkrieg-projects-import-template.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  // Excel (current data): the projects and isometrics of this main project in the template's columns; weld columns stay empty.
  app.get('/api/project-import/current', async (req, res) => {
    opened(req, 'full');
    const siteId = siteOf(req), account = user(req);
    if (!canResource(account, 'projects', 'export') || !canResource(account, 'isometrics', 'export')) throw new AppError(403, 'Your permission profile does not allow exporting projects and isometrics.');
    const withMaterials = flag(req.query.materials, 'materials');
    if (withMaterials && !canResource(account, 'iso_materials', 'export')) throw new AppError(403, 'Your permission profile does not allow exporting materials in isometrics.');
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    const visible = (key: string) => store.list(key).filter(row => access.visible(account, key, row));
    const projects = visible('projects').filter(project => project.siteId === siteId && (!projectId || project.id === projectId));
    const columns = columnsFor(availability, 'full');
    const refName = new Map<string, Map<string, string>>();
    const refText = (resource: string, id: unknown) => { if (!refName.has(resource)) { let rows: Row[] = []; try { rows = store.list(resource, true); } catch { rows = []; } refName.set(resource, new Map(rows.map(row => [row.id, text(row[RESOURCE_MAP[resource]?.display || 'name'])]))); } return refName.get(resource)!.get(text(id)) || ''; };
    const value = (column: ImportColumn, row: Row) => { const raw = row[column.field]; if (raw === undefined || raw === null || raw === '') return ''; if (column.type === 'checkbox') return raw === true ? 'Yes' : 'No'; if (column.ref) return refText(column.ref, raw); return text(raw); };
    const isometrics = visible('isometrics'), lines = withMaterials ? visible('iso_materials') : [], materials = new Map(store.list('materials', true).map(row => [row.id, row]));
    const phases = new Map(store.list('operation_phases', true).map(row => [row.id, text(row.name)]));
    const lineCells = (line: Row): Record<string, string> => { const material = line.materialId ? materials.get(String(line.materialId)) : undefined; const source = material ?? line; return { componentCode: text(line.componentCode || source.componentCode), materialGroup: text(source.materialGroup), articleNo: text(source.articleNo), materialNo: text(source.materialNo), description: text(source.description), dia: text(source.dia), lbs: text(source.lbs), uom: text(material ? material.uom : line.uom), quantity: text(line.quantity), phase: phases.get(String(line.phaseId)) || '' }; };
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('Project data');
    sheet.columns = columns.map(column => ({ key: column.key, width: Math.min(40, Math.max(14, column.header.length + 4)) }));
    sheet.addRow(columns.map(column => column.hint)); sheet.addRow(columns.map(column => column.header));
    for (const project of projects) {
      const isos = isometrics.filter(iso => iso.projectId === project.id);
      for (const iso of isos.length ? isos : [undefined]) {
        const own = iso ? lines.filter(line => line.isoId === iso.id) : [];
        for (const line of own.length ? own : [undefined]) {
          const cells = line ? lineCells(line) : {};
          sheet.addRow(columns.map(column => column.part === 'projects' ? value(column, project) : column.part === 'isometrics' ? (iso ? value(column, iso) : '') : column.part === 'iso_materials' ? cells[column.field] ?? '' : ''));
        }
      }
    }
    sheet.getRow(1).font = { italic: true, color: { argb: 'FF6B7280' } }; sheet.getRow(2).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 2 }];
    res.setHeader('Cache-Control', 'no-store'); res.attachment('blitzkrieg-project-data-current.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  app.post('/api/project-import/preview', memory.single('file'), async (req, res) => {
    const { mode, siteId, columns, rows, withWelds } = await upload(req);
    const plan = planImport(rows, columns, contextOf(req, siteId, columns)(), { mode, withWelds });
    allow(req, siteId, mode)(plan);
    res.setHeader('Cache-Control', 'no-store'); res.json({ rows: plan.rows, summary: plan.summary });
  });
  app.post('/api/project-import/commit', memory.single('file'), async (req, res) => {
    const { mode, siteId, columns, rows, withWelds } = await upload(req);
    const clean = mode === 'projects' && flag(req.body?.clean, 'a clean import');
    // A clean import deletes projects: it needs the delete right on projects as well.
    if (clean && !canResource(user(req), 'projects', 'delete')) throw new AppError(403, 'Your permission profile does not allow deleting projects.');
    res.status(201).json(commitProjectImport(store, rows, columns, {
      mode, withWelds, siteId, clean, actor: actorOf(req), allow: allow(req, siteId, mode), context: contextOf(req, siteId, columns),
      checkWrite: (key, value, existing) => { access.input(key, key === 'isometrics' ? withoutIrn(value) : value, false, existing); access.complete(key, value, existing); access.links(user(req), key, value, existing); checkIsoWrite(store, key, value, existing); },
    }));
  });
}
