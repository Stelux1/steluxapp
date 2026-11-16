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
import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import {
  ALREADY_ON_SITE, LINK_NOTE, USED_ON_SITE_RESOURCES, changedSites, cleanImportPlan, importFromSitePlan, linkOnAdd, materialOnSite, materialSiteIds, materialsOnSite,
  materialsUsedOnSite, siteLinkRows, takeOverLinks,
} from '../shared/material-sites.ts';
import { AppError, qty, type Actor, type Store } from './store.ts';
import { actorOf, type AuthRequest } from './auth.ts';
import type { releaseAccess } from './release-access.ts';
import { SiteScope, currentSiteScope, keepSiteScope, siteRefused, withSiteScope } from './site-scope.ts';

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
  const material = data.addToDB ? createMaterialOnSite(store, { ...custom, ...classification }, siteOfIso(store, iso), actor) : null;
  return { resource: 'iso_materials', record: store.create('iso_materials', { ...base, ...custom, ...classification, customMaterial: !material, materialId: material?.id || '' }, actor) };
}

const siteOfIso = (store: Store, iso: Row) => { try { return str(store.get('projects', iso.projectId, true).siteId); } catch { return ''; } };

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
    return materialsInScope(store, rows).map(row => { const uomId = materialUomId(row, uoms); return uomId ? { ...row, uomId, uom: names.get(uomId) ?? row.uom } : row; });
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

// ----- Material sites ("Home location", shared/material-sites.ts) ------------------------------------------------------------

/**
 * Run `fn` with the record guard of the request widened to every main project. Used only for the link rows the material rules
 * themselves derive (a new material switched off on the other main projects, the other main projects keeping their state when
 * one is ticked or unticked), never for a change the user asked for on a main project outside the account's access.
 */
function unscoped<T>(store: Store, fn: () => T): T {
  const scope = currentSiteScope();
  return scope && scope.allowed !== 'all' ? withSiteScope(new SiteScope(store, scope.pilot, 'all', scope.off), fn) : fn();
}
const limitedScope = () => { const scope = currentSiteScope(); return scope && scope.allowed !== 'all' ? { scope, allowed: scope.allowed } : undefined; };
const referenced = new WeakMap<SiteScope, Set<string>>();
/** Materials the records of a limited request point at (its isometric lines, orders, stock, certificates, welds …): they keep resolving. */
function referencedInScope(store: Store, scope: SiteScope): Set<string> {
  let ids = referenced.get(scope);
  if (!ids) {
    ids = new Set();
    for (const resource of RESOURCES) {
      const fields = resource.fields.filter(field => field.ref === 'materials').map(field => field.name);
      if (!fields.length) continue;
      for (const row of store.list(resource.key, true)) if (fields.some(name => typeof row[name] === 'string' && row[name]) && scope.allows(resource.key, row)) for (const name of fields) if (row[name]) ids.add(String(row[name]));
    }
    referenced.set(scope, ids);
  }
  return ids;
}
/**
 * The materials a request may see. An account limited to specific main projects sees the materials of its main projects and the
 * ones its own records point at, never a material linked only to another main project. Every other account sees every material.
 */
export function materialsInScope(store: Store, rows: Row[]): Row[] {
  const limited = limitedScope();
  if (!limited) return rows;
  const links = store.list(CATALOG_SITES), used = referencedInScope(store, limited.scope);
  return rows.filter(row => [...limited.allowed].some(siteId => materialOnSite(row, siteId, links)) || used.has(row.id));
}
/** Refuse a material the request may not see (403, as a record of another main project). */
export function assertMaterialsInScope(store: Store, ids: unknown[]) {
  if (!limitedScope()) return;
  const rows = ids.map(id => { try { return store.get('materials', id, true); } catch { return null; } }).filter((row): row is Row => Boolean(row));
  const visible = new Set(materialsInScope(store, rows).map(row => row.id));
  if (rows.some(row => !visible.has(row.id))) throw siteRefused('This material belongs to the material database of a main project your account cannot access.');
}
/** Store the main projects of a material: one explicit link per main project, as `siteLinkRows` says. */
function writeMaterialSites(store: Store, material: Row, next: ReadonlySet<string>, actor: Actor) {
  const { create, update } = siteLinkRows(material, next, store.list('sites', true), store.list(CATALOG_SITES));
  for (const row of create) store.create(CATALOG_SITES, { resourceKey: 'materials', recordId: material.id, siteId: row.siteId, enabled: row.enabled }, actor);
  for (const row of update) store.update(CATALOG_SITES, row.link.id, { enabled: row.enabled }, row.link._version, actor);
}
/** Add `siteId` to the main projects of a material (the others stay as they are). */
const linkMaterial = (store: Store, material: Row, siteId: string, actor: Actor) => unscoped(store, () => writeMaterialSites(store, material, changedSites(material, { [siteId]: true }, store.list('sites', true), store.list(CATALOG_SITES)), actor));
/** A new catalog material, available on `siteId` only (a material a user adds in the pilots belongs to the main project it is added on). */
function createMaterialOnSite(store: Store, input: Record<string, unknown>, siteId: string, actor: Actor): Row {
  if (!siteId) throw new AppError(422, 'Choose a main project first.');
  return unscoped(store, () => {
    const material = store.create('materials', { ...input, enabledOnSite: true, enabledSiteId: siteId }, actor);
    writeMaterialSites(store, material, new Set([siteId]), actor);
    return material;
  });
}
/**
 * Add material (pilots): the new material belongs to the main project it is added on. A Material No that exists but is not linked
 * here is linked (no copy, the existing row is kept as it is); one already linked here is refused, and the page shows its row.
 */
export function addMaterialOnSite(store: Store, input: Record<string, unknown>, actor: Actor): { record: Row; linked: boolean } {
  const siteId = str(input.enabledSiteId);
  if (!siteId || input.enabledOnSite !== true) throw new AppError(422, 'Choose a main project first.');
  store.get('sites', siteId);
  return store.transaction(() => {
    const plan = linkOnAdd(input.materialNo, siteId, store.list('materials'), store.list(CATALOG_SITES));
    if (plan.kind === 'refused') throw new AppError(422, ALREADY_ON_SITE, { materialNo: ALREADY_ON_SITE }, 'material-on-site');
    if (plan.kind === 'link') { linkMaterial(store, plan.material, siteId, actor); return { record: store.get('materials', plan.material.id), linked: true }; }
    const { enabledOnSite: _on, enabledSiteId: _site, ...fields } = input;
    return { record: createMaterialOnSite(store, fields, siteId, actor), linked: false };
  });
}
/**
 * Tick or untick main projects of the checked materials (Edit material "Home location", Mass edit "Project site checkboxes").
 * Only the boxes that are sent change; each must be a main project the account reaches.
 */
export function setMaterialSites(store: Store, ids: unknown, sites: unknown, actor: Actor, mayEdit: (row: Row) => boolean): number {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !id)) throw new AppError(422, 'Select between 1 and 500 materials.');
  if (!sites || typeof sites !== 'object' || Array.isArray(sites) || !Object.keys(sites).length || Object.values(sites).some(value => typeof value !== 'boolean')) throw new AppError(422, 'Tick or untick at least one project site.');
  const changes = sites as Record<string, boolean>, scope = currentSiteScope();
  for (const siteId of Object.keys(changes)) { store.get('sites', siteId, true); if (scope && !scope.allowsSite(siteId)) throw siteRefused(); }
  assertMaterialsInScope(store, ids);
  return store.transaction(() => {
    let changed = 0;
    for (const id of new Set(ids as string[])) {
      const material = store.get('materials', id);
      if (!mayEdit(material)) throw new AppError(403, 'Your permission profile does not allow this action.');
      const allSites = store.list('sites', true), links = store.list(CATALOG_SITES);
      const before = new Set(materialSiteIds(material, allSites, links)), next = changedSites(material, changes, allSites, links);
      if (before.size === next.size && [...next].every(site => before.has(site))) continue;
      // Only the sent boxes change; the rows of the other main projects are written only so that they keep their state.
      unscoped(store, () => writeMaterialSites(store, material, next, actor)); changed++;
    }
    return changed;
  });
}
/** Import Materials DB from another project site: every material of the source becomes available on the target (no copies). */
export function importMaterialsFromSite(store: Store, targetId: string, sourceId: string, actor: Actor): { linked: number } {
  if (!targetId || !sourceId) throw new AppError(422, 'Choose the project site to import the material database from.');
  if (targetId === sourceId) throw new AppError(422, 'Choose another project site than this one.');
  store.get('sites', targetId); store.get('sites', sourceId);
  return store.transaction(() => {
    const materials = importFromSitePlan(store.list('materials'), sourceId, targetId, store.list(CATALOG_SITES));
    for (const material of materials) linkMaterial(store, material, targetId, actor);
    return { linked: materials.length };
  });
}

const MAX_ROWS = 5000, MAX_TEXT = 2000;
/** The import's view of the catalog: on a main project only its own materials count as "already in the Material database". */
const importContext = (store: Store, siteId?: string): ImportContext => ({ materials: siteId ? materialsOnSite(store.list('materials'), siteId, store.list(CATALOG_SITES)) : store.list('materials'), uoms: store.list('uoms'), parts: store.list('material_parts'), types: store.list('material_types') });
/** Preview rows of a main project: a Material No that exists for another main project is linked here on commit (shown with a note). */
function withSiteNotes(store: Store, rows: ImportRow[], siteId?: string): (ImportRow & { note?: string })[] {
  if (!siteId) return rows;
  const linkable = new Set(takeOverLinks(rows.map(row => row.values.materialNo), siteId, store.list('materials'), store.list(CATALOG_SITES)).link.map(material => str(material.materialNo)));
  return rows.map(row => linkable.has(row.values.materialNo) && !Object.keys(row.error).length ? { ...row, note: LINK_NOTE } : row);
}
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
  /**
   * "Clean import (remove the existing materials of this project site)": after the rows are committed, every material of the
   * main project whose Material No is not in the file is removed from that main project (other main projects keep it), except
   * the materials used there, which stay and are listed.
   */
  clean?: boolean;
}
export interface ImportResult { committed: number; skipped: number; failed: number; linked: number; attached: number; removed?: number; kept?: { id: string; materialNo: string; description: string }[] }
/**
 * Commit an import: the rows are checked again against the data as it is now, and each row chosen for import without an
 * error or warning becomes a catalog material of the main project, or (its Material No exists for another main project) links
 * that material to this one (`attached`). Rows of a take-over also link their isometric lines to the catalog material.
 */
export function commitMaterialImport(store: Store, input: ImportRowInput[], options: ImportOptions): ImportResult {
  const { siteId } = options;
  if (options.clean && !siteId) throw new AppError(422, 'Choose a main project first.');
  if (options.clean && input.some(row => row.source === 'iso' || row.source === 'order')) throw new AppError(422, 'Clean import works with an uploaded Excel file only.');
  const result: ImportResult = { committed: 0, skipped: 0, failed: 0, linked: 0, attached: 0 };
  store.transaction(() => {
    const context = importContext(store, siteId);
    for (const row of materialImportPreview(input, context)) {
      if (!importable(row)) { result[row.action === 'skip' ? 'skipped' : 'failed']++; continue; }
      store.db.exec('SAVEPOINT material_import_row');
      try {
        const existing = siteId ? store.list('materials').find(item => str(item.materialNo) === row.values.materialNo) : undefined;
        const material = existing ?? (siteId ? createMaterialOnSite(store, importedMaterial(row, context), siteId, options.actor) : store.create('materials', importedMaterial(row, context), options.actor));
        if (existing) { linkMaterial(store, existing, siteId!, options.actor); result.attached++; }
        context.materials.push(material);
        if (row.source !== 'file' && row.origin && options.siteId) for (const line of linkableLines(store, options.siteId, row.origin)) {
          if (options.mayLink && !options.mayLink(line)) continue;
          store.update('iso_materials', line.id, { materialId: material.id, customMaterial: false, customMaterialId: '' }, line._version, options.actor); result.linked++;
        }
        store.db.exec('RELEASE material_import_row'); result.committed++;
      } catch (error) { store.db.exec('ROLLBACK TO material_import_row; RELEASE material_import_row'); if ((error as AppError).status === 403) throw error; result.failed++; }
    }
    if (options.clean && siteId) Object.assign(result, cleanSite(store, siteId, input.map(row => row.values.materialNo), options.actor));
  });
  return result;
}
/** The clean part of a clean import on one main project (see ImportOptions.clean). */
function cleanSite(store: Store, siteId: string, fileNos: unknown[], actor: Actor) {
  const links = store.list(CATALOG_SITES), sites = store.list('sites', true);
  const used = materialsUsedOnSite(Object.fromEntries(USED_ON_SITE_RESOURCES.map(key => [key, store.list(key)])), siteId);
  const plan = cleanImportPlan(materialsOnSite(store.list('materials'), siteId, links), fileNos, used);
  // Other main projects keep each removed material: an older material without links gets an explicit row for each of them.
  for (const material of plan.unlink) unscoped(store, () => writeMaterialSites(store, material, changedSites(material, { [siteId]: false }, sites, links), actor));
  return { removed: plan.unlink.length, kept: plan.kept.map(material => ({ id: material.id, materialNo: str(material.materialNo), description: str(material.description) })) };
}

type Access = ReturnType<typeof releaseAccess>;
export function registerMaterialDbRoutes(app: Application, { store, access }: { store: Store; access: Access }) {
  const user = (req: Request) => (req as AuthRequest).user;
  const allow = (req: Request, verb: Parameters<typeof canResource>[2]) => { access.resource('materials'); if (!canResource(user(req), 'materials', verb)) throw new AppError(403, 'Your permission profile does not allow this action.'); };
  const importAllowed = (req: Request) => { allow(req, 'import'); allow(req, 'insert'); };
  const memory = keepSiteScope(multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }));
  const site = (value: unknown) => { if (typeof value !== 'string' || !value) throw new AppError(422, 'Choose a main project first.'); return store.get('sites', value).id; };
  /** The main project of a preview: optional (without one every material counts as already in the database, as before). */
  const previewSite = (value: unknown) => value === undefined || value === '' ? undefined : site(value);
  const visible = (req: Request, key: string) => store.list(key).filter(row => access.visible(user(req), key, row));
  // Only the site's own materials count as "in the catalog": a Material No of another main project is missing here and is linked on commit.
  const missing = (req: Request, siteId: string) => missingCatalogMaterials({ ...Object.fromEntries(['projects', 'isometrics', 'iso_materials', 'orders', 'order_lines', 'picklists', 'stock', 'custom_materials'].map(key => [key, visible(req, key)])), materials: materialsOnSite(visible(req, 'materials'), siteId, store.list(CATALOG_SITES)) }, siteId);
  const preview = (rows: ImportRowInput[], siteId?: string) => { const checked = materialImportPreview(rows, importContext(store, siteId)); return { rows: withSiteNotes(store, checked, siteId), summary: materialImportSummary(checked) }; };

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
    const siteId = previewSite(req.body?.siteId);
    res.json(preview(await readSheet(req.file.buffer), siteId));
  });
  // The preview again after a Material No or an action was changed on the page (nothing is saved).
  app.post('/api/material-import/check', (req, res) => { importAllowed(req); res.json(preview(sentRows(req.body?.rows), previewSite(req.body?.siteId))); });
  app.get('/api/material-import/take-over', (req, res) => { importAllowed(req); res.setHeader('Cache-Control', 'no-store'); res.json(takeOverCounts(missing(req, site(req.query.siteId)))); });
  app.post('/api/material-import/take-over', (req, res) => {
    importAllowed(req);
    const source = req.body?.source;
    if (source !== 'iso' && source !== 'order') throw new AppError(422, 'Choose isometrics or order materials.');
    const siteId = site(req.body?.siteId);
    const rows = takeOverRows(missing(req, siteId), source);
    res.json(rows.length ? preview(rows, siteId) : { empty: true, rows: [], summary: materialImportSummary([]) });
  });
  app.post('/api/material-import/commit', (req, res) => {
    importAllowed(req);
    const rows = sentRows(req.body?.rows);
    // Every committed material belongs to the main project of the page (shared/material-sites.ts).
    const siteId = site(req.body?.siteId);
    const options = req.body?.options && typeof req.body.options === 'object' ? req.body.options as Record<string, unknown> : {};
    if (options.clean !== undefined && typeof options.clean !== 'boolean') throw new AppError(422, 'Choose whether the import is a clean import.');
    // A clean import removes materials from the main project: it needs the right to delete materials as well.
    if (options.clean === true) allow(req, 'delete');
    res.status(201).json(commitMaterialImport(store, rows, { actor: actorOf(req), siteId, clean: options.clean === true, mayLink: line => canResource(user(req), 'iso_materials', 'edit', line) }));
  });
  app.post('/api/materials/:id/delete', (req, res) => {
    access.resource('materials');
    const material = access.record('materials', String(req.params.id), true);
    assertMaterialsInScope(store, [material.id]);
    if (!canResource(user(req), 'materials', 'delete', material)) throw new AppError(403, 'Your permission profile does not allow this action.');
    deleteMaterial(store, material.id, req.body?._version, actorOf(req));
    res.json({ deleted: material.id });
  });
  // Edit material "Home location" / Mass edit "Project site checkboxes": {ids, sites: {siteId: ticked}}.
  app.post('/api/material-sites', (req, res) => {
    allow(req, 'edit');
    res.json({ changed: setMaterialSites(store, req.body?.ids, req.body?.sites, actorOf(req), row => canResource(user(req), 'materials', 'edit', row)) });
  });
  // MTO Pilot -> Project sites -> "Import Materials DB from another project site": {siteId (this one), sourceSiteId}.
  app.post('/api/material-sites/import', (req, res) => {
    importAllowed(req);
    res.status(201).json(importMaterialsFromSite(store, site(req.body?.siteId), site(req.body?.sourceSiteId), actorOf(req)));
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
