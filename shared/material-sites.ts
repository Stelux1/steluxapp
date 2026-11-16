import type { Field, Row } from './types.ts';

/**
 * Which main projects (project sites, the reference's "Home location") see which materials of the MTO Material database.
 *
 * One catalog: a material exists once (one Material No) and is linked to the main projects where it is available, by the
 * `catalog_sites` rows of resource 'materials' (siteId, enabled). The link only decides what the Material database, its import
 * and take-over and the add lists offer: isometric lines, orders, stock and certificates keep resolving their material
 * whatever is linked (materials stay 'global' in shared/site-scope.ts).
 *
 * The rule, readable from existing data without any write:
 * - a material without any link (every material saved before this rule) is available on every main project;
 * - a material with an 'on' link somewhere is available exactly where it has an 'on' link (a main project added later does not
 *   see it until it is linked there);
 * - a material with 'off' links only is available everywhere except there.
 * Writes (`siteLinkRows`) always store an explicit row for every main project, so a changed material reads the same under all three.
 */
export const MATERIAL_LINKS = 'materials';
type Links = Row[] | undefined;
const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const live = (rows: Row[] | undefined) => (rows || []).filter(row => !row._archived);

const indexes = new WeakMap<Row[], Map<string, Map<string, boolean>>>();
/** The links of every material: material id → (site id → enabled). One pass per links array. */
function index(links: Row[]) {
  let map = indexes.get(links);
  if (!map) {
    map = new Map();
    for (const link of links) {
      if (link._archived || link.resourceKey !== MATERIAL_LINKS) continue;
      const id = text(link.recordId), site = text(link.siteId);
      if (!id || !site) continue;
      if (!map.has(id)) map.set(id, new Map());
      map.get(id)!.set(site, link.enabled !== false);
    }
    indexes.set(links, map);
  }
  return map;
}
const linksOf = (material: Pick<Row, 'id'>, links: Links) => links ? index(links).get(material.id) : undefined;

/** Is the material available on the main project? True without a main project (nothing to narrow). */
export function materialOnSite(material: Pick<Row, 'id'>, siteId: string | null | undefined, links: Links): boolean {
  if (!siteId) return true;
  const own = linksOf(material, links);
  if (!own || !own.size) return true;
  const here = own.get(siteId);
  if (here !== undefined) return here;
  return ![...own.values()].some(Boolean);
}
/** The active materials of one main project's Material database. */
export const materialsOnSite = (materials: Row[] | undefined, siteId: string | null | undefined, links: Links) => live(materials).filter(material => materialOnSite(material, siteId, links));
/** The main projects (of `sites`) where the material is available: the ticked "Home location" boxes. */
export const materialSiteIds = (material: Pick<Row, 'id'>, sites: Pick<Row, 'id'>[], links: Links) => sites.filter(site => materialOnSite(material, site.id, links)).map(site => site.id);
/** Whether the material has no link at all (an older material, available on every main project). */
export const unlinkedMaterial = (material: Pick<Row, 'id'>, links: Links) => !linksOf(material, links)?.size;

/**
 * The link rows a change writes: one explicit row per main project, `enabled` = whether the site is in `next`. Rows that already
 * say so are left alone (`update` names an existing link whose value changes, `create` a missing one).
 */
export function siteLinkRows(material: Pick<Row, 'id'>, next: ReadonlySet<string>, sites: Pick<Row, 'id'>[], links: Row[]): { create: { siteId: string; enabled: boolean }[]; update: { link: Row; enabled: boolean }[] } {
  const create: { siteId: string; enabled: boolean }[] = [], update: { link: Row; enabled: boolean }[] = [];
  for (const site of sites) {
    const enabled = next.has(site.id);
    const link = links.find(row => !row._archived && row.resourceKey === MATERIAL_LINKS && row.recordId === material.id && row.siteId === site.id);
    if (!link) create.push({ siteId: site.id, enabled });
    else if ((link.enabled !== false) !== enabled) update.push({ link, enabled });
  }
  return { create, update };
}
/** The sites where the material is available after ticking (true) or unticking (false) some; the others keep their state. */
export function changedSites(material: Pick<Row, 'id'>, changes: Record<string, boolean>, sites: Pick<Row, 'id'>[], links: Links): Set<string> {
  const next = new Set(materialSiteIds(material, sites, links));
  for (const [siteId, on] of Object.entries(changes)) if (on) next.add(siteId); else next.delete(siteId);
  return next;
}

// ----- Add material ---------------------------------------------------------------------------------------------------

/** A catalog material that is not in the Material database of the isometric's main project cannot be added to it. */
export const NOT_ON_SITE = 'This material is not in the material database of this project site.';
export const ALREADY_ON_SITE = 'This Material No is already in the material database of this project site.';
export const LINKED_TO_SITE = (materialNo: string) => `Material No ${materialNo} already existed in the material database; it is now available on this project site.`;
/**
 * Add material on a main project (reference: "The material is added to the material database that is open … If the same
 * Material No already exists in this database, the add is blocked and the existing row is shown"). The same Material No
 * exists once: one that exists but is not linked here is linked (no copy); one already linked here is refused.
 */
export function linkOnAdd(materialNo: unknown, siteId: string, materials: Row[] | undefined, links: Links): { kind: 'create' } | { kind: 'link' | 'refused'; material: Row } {
  const wanted = text(materialNo);
  const material = wanted ? live(materials).find(row => text(row.materialNo) === wanted) : undefined;
  if (!material) return { kind: 'create' };
  return { kind: materialOnSite(material, siteId, links) ? 'refused' : 'link', material };
}

/**
 * Import and take-over rows of one main project: Material Nos already linked there are the import's "already in the Material
 * database" warning; those that exist but are linked elsewhere are linked here on commit instead of created.
 */
export function takeOverLinks(materialNos: unknown[], siteId: string, materials: Row[] | undefined, links: Links): { link: Row[]; create: string[]; onSite: Row[] } {
  const byNo = new Map(live(materials).map(row => [text(row.materialNo), row]));
  const result = { link: [] as Row[], create: [] as string[], onSite: [] as Row[] };
  for (const no of new Set(materialNos.map(text).filter(Boolean))) {
    const material = byNo.get(no);
    if (!material) result.create.push(no);
    else if (materialOnSite(material, siteId, links)) result.onSite.push(material);
    else result.link.push(material);
  }
  return result;
}
export const LINK_NOTE = 'This Material No is already in the material database; commit makes it available on this project site.';

// ----- Clean import -------------------------------------------------------------------------------------------------------

export const CLEAN_IMPORT_LABEL = 'Clean import (remove the existing materials of this project site)';
export const CLEAN_IMPORT_HINT = 'Materials of this project site that are not in the file are removed from it; other project sites keep them. Materials used on an isometric, order, inventory line or certificate of this project site stay and are listed.';
/**
 * The plan of a clean import on one main project: every material of the site whose Material No is not in the file is unlinked
 * from the site, except those used there (`usedOnSite`), which stay and are listed.
 */
export function cleanImportPlan(materials: Row[], fileNos: Iterable<unknown>, usedOnSite: ReadonlySet<string>): { unlink: Row[]; kept: Row[] } {
  const inFile = new Set([...fileNos].map(text).filter(Boolean));
  const plan = { unlink: [] as Row[], kept: [] as Row[] };
  for (const material of live(materials)) {
    if (inFile.has(text(material.materialNo))) continue;
    plan[usedOnSite.has(material.id) ? 'kept' : 'unlink'].push(material);
  }
  return plan;
}

type Rows = Record<string, Row[] | undefined>;
/**
 * Materials used on one main project: on an isometric line, an order line, an inventory line, a pick list or a certificate of
 * that site. A material on such a record is never removed from the site by a clean import.
 */
export function materialsUsedOnSite(rows: Rows, siteId: string): Set<string> {
  const byId = (key: string) => new Map(live(rows[key]).map(row => [row.id, row]));
  const projects = byId('projects'), isos = byId('isometrics'), orders = byId('orders'), warehouses = byId('warehouses');
  const projectSite = (id: unknown) => text(projects.get(text(id))?.siteId);
  const isoSite = (id: unknown) => projectSite(isos.get(text(id))?.projectId);
  const warehouseSite = (id: unknown) => text(warehouses.get(text(id))?.siteId);
  const used = new Set<string>();
  const add = (row: Row, site: string, ...fields: string[]) => { if (site === siteId) for (const field of fields) if (text(row[field])) used.add(text(row[field])); };
  for (const line of live(rows.iso_materials)) add(line, isoSite(line.isoId), 'materialId');
  for (const line of live(rows.order_lines)) add(line, line.isoId ? isoSite(line.isoId) : projectSite(orders.get(text(line.orderId))?.projectId), 'materialId');
  for (const line of live(rows.stock)) add(line, text(line.siteId) || warehouseSite(line.warehouseId), 'materialId');
  for (const line of live(rows.picklists)) add(line, line.isoId ? isoSite(line.isoId) : warehouseSite(line.warehouseId), 'materialId');
  for (const certificate of live(rows.certifications)) add(certificate, text(certificate.siteId), 'materialId');
  return used;
}
export const USED_ON_SITE_RESOURCES = ['projects', 'isometrics', 'iso_materials', 'orders', 'order_lines', 'stock', 'warehouses', 'picklists', 'certifications'];

// ----- Import Materials DB from another project site --------------------------------------------------------------------

export const IMPORT_FROM_SITE_TITLE = 'Import Materials DB from another project site';
/** The materials an import from `sourceId` links to `targetId`: those of the source that the target does not have yet (no copies). */
export function importFromSitePlan(materials: Row[] | undefined, sourceId: string, targetId: string, links: Links): Row[] {
  if (!sourceId || !targetId || sourceId === targetId) return [];
  return materialsOnSite(materials, sourceId, links).filter(material => !materialOnSite(material, targetId, links));
}

// ----- Add / Edit material form -------------------------------------------------------------------------------------------

/** Add material of the reference (capture mto__materials__material-database.txt:137-171): UOM before Material part and Type. */
export const ADD_MATERIAL_FIELDS = ['componentCode', 'materialGroup', 'articleNo', 'legacyNo', 'materialNo', 'dia', 'lbs', 'uomId', 'partId', 'typeId', 'description'];
/** Edit material of the reference (capture mto__materials__material-database__edit.txt): Home location first, UOM after Type of material. */
export const EDIT_MATERIAL_FIELDS = ['componentCode', 'materialGroup', 'articleNo', 'legacyNo', 'materialNo', 'dia', 'lbs', 'partId', 'typeId', 'uomId', 'description'];
export const HOME_LOCATION = 'Home location';
/**
 * The fields of the Add / Edit material form, in the reference order, from the delivered resource definition. Stored values the
 * reference form does not have (Progress class, Unit price, Wall thickness) stay in the records and are never on the form.
 */
export const materialFormFields = (fields: Field[], mode: 'add' | 'edit') => (mode === 'add' ? ADD_MATERIAL_FIELDS : EDIT_MATERIAL_FIELDS).map(name => fields.find(field => field.name === name)).filter((field): field is Field => Boolean(field));
