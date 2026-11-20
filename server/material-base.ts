import { randomUUID } from 'node:crypto';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import { MATERIAL_LINKS, materialOnSite } from '../shared/material-sites.ts';
import { articlePrefixOf, baseKey, baseMaterials, type MaterialBaseFile } from '../shared/material-base.ts';
import { MATERIAL_DB_BASE } from '../shared/data/material-db-base.ts';
import { SYSTEM, type Actor, type Store } from './store.ts';

/**
 * Server side of the default Material database (shared/material-base.ts). A new main project (Add project site, Duplicate project
 * site) starts with every material of the client's MaterialDB.xlsx, Article No = the Article No prefix of Company data + the six
 * digits of the Excel number.
 *
 * Materials are one catalog (Material No is unique) that each main project sees through its `catalog_sites` links
 * (shared/material-sites.ts). A base material that does not exist yet is created and linked to the new main project only (one "on"
 * link: a material with an "on" link is available exactly where it has one); one that exists already (the base of an earlier main
 * project, or a material of the same Material No the workspace holds) is not copied: it is linked to the new main project, as
 * "Add material" does, and keeps its Article No. Existing main projects and their materials are never changed. Rows are written
 * with multi-row inserts in the caller's transaction, since 7264 single creates (validation, audit trail each) would take minutes.
 */

const CHUNK = 400;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** The Article No prefix of Company data (the default while no record or no value is saved). */
export const articlePrefix = (store: Store) => articlePrefixOf(store.list('company_data')[0] as { articlePrefix?: unknown } | undefined);

/** Insert `rows` (record data by id) into a resource table with as few statements as possible; the data is complete (no validation). */
function insertRows(store: Store, key: string, rows: { id: string; data: Record<string, unknown> }[]) {
  if (!RESOURCE_MAP[key]) throw new Error(`Unknown resource ${key}.`);
  const now = new Date().toISOString();
  for (let start = 0; start < rows.length; start += CHUNK) {
    const part = rows.slice(start, start + CHUNK);
    store.db.prepare(`INSERT INTO "${key}"(id,data,created_at,updated_at) VALUES ${part.map(() => '(?,?,?,?)').join(',')}`).run(...part.flatMap(row => [row.id, JSON.stringify(row.data), now, now]));
  }
}

/** The complete data of a record as the store keeps it (every field of the resource, defaults for the rest). */
function fullData(key: string, values: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of RESOURCE_MAP[key].fields) data[field.name] = values[field.name] ?? (field.type === 'number' ? null : field.type === 'checkbox' ? false : field.default ?? '');
  return data;
}

/**
 * The record of each name (case and spacing do not matter), created with just its name when missing (written directly: the hosted form
 * of a type of material asks for more than a name, the base only knows the name). Returns name key → id.
 */
function catalogIds(store: Store, key: 'material_parts' | 'material_types' | 'uoms', names: readonly string[]): { ids: Map<string, string>; created: number } {
  const ids = new Map<string, string>(), missing: { id: string; data: Record<string, unknown> }[] = [];
  for (const row of store.list(key)) { const name = baseKey(str(row.name)); if (name && !ids.has(name)) ids.set(name, row.id); }
  let created = 0;
  for (const name of names) {
    const found = baseKey(name);
    if (!found || ids.has(found)) continue;
    const id = randomUUID(); ids.set(found, id); created++;
    missing.push({ id, data: fullData(key, { name: name.replace(/\s+/g, ' ').trim() }) });
  }
  insertRows(store, key, missing);
  return { ids, created };
}

export interface BaseMaterialsResult { created: number; linked: number; alreadyAvailable: number; parts: number; types: number; uoms: number; prefix: string }

/**
 * Give a new main project the base materials. Runs inside the caller's transaction (it opens one when there is none). `file` is the
 * base file (tests pass a small one); the Article No prefix is read from Company data now, so a change applies to the next main project.
 */
export function applyBaseMaterials(store: Store, siteId: string, actor: Actor = SYSTEM, file: MaterialBaseFile = MATERIAL_DB_BASE): BaseMaterialsResult {
  return store.transaction(() => {
    const prefix = articlePrefix(store), base = baseMaterials(file);
    const parts = catalogIds(store, 'material_parts', file.parts), types = catalogIds(store, 'material_types', file.types), uoms = catalogIds(store, 'uoms', file.uoms);
    const existing = new Map(store.list('materials').map(row => [str(row.materialNo), row] as const)), links = store.list(CATALOG_SITES);
    const created: { id: string; data: Record<string, unknown> }[] = [], link: string[] = [];
    let alreadyAvailable = 0;
    for (const item of base) {
      const found = existing.get(item.materialNo);
      if (found) { if (materialOnSite(found, siteId, links)) alreadyAvailable++; else link.push(found.id); continue; }
      const id = randomUUID();
      created.push({ id, data: fullData('materials', {
        materialGroup: item.materialGroup, articleNo: `${prefix}${item.articleDigits}`, legacyNo: item.legacyNo, materialNo: item.materialNo, dia: item.dia, lbs: item.lbs, description: item.description,
        uom: item.uom, uomId: uoms.ids.get(baseKey(item.uom)) ?? '', partId: item.partMaterial ? parts.ids.get(baseKey(item.partMaterial)) ?? '' : '', typeId: item.materialType ? types.ids.get(baseKey(item.materialType)) ?? '' : '',
      }) });
    }
    insertRows(store, 'materials', created);
    // A link row of this main project that exists already (an "off" one) is switched on; every other material gets one new "on" row.
    const own = new Map(links.filter(row => !row._archived && row.resourceKey === MATERIAL_LINKS && row.siteId === siteId).map(row => [str(row.recordId), row] as const));
    const fresh = [...created.map(row => row.id), ...link.filter(id => !own.has(id))];
    for (const id of link) { const old = own.get(id); if (old) store.update(CATALOG_SITES, old.id, { enabled: true }, old._version, SYSTEM); }
    insertRows(store, CATALOG_SITES, fresh.map(id => ({ id: randomUUID(), data: { resourceKey: MATERIAL_LINKS, recordId: id, siteId, enabled: true } })));
    if (base.length) store.audit('sites', siteId, 'base materials', `Added the base Material database: ${created.length} new, ${link.length + alreadyAvailable} existing, Article No prefix ${prefix}`, actor);
    return { created: created.length, linked: link.length, alreadyAvailable, parts: parts.created, types: types.created, uoms: uoms.created, prefix };
  });
}

/** Whether the base file is usable (every row has a Material No and a group): checked by the tests. */
export const baseFileProblems = (file: MaterialBaseFile = MATERIAL_DB_BASE): string[] => baseMaterials(file).flatMap((item, index) => [item.materialNo ? '' : `row ${index}: no Material No`, item.materialGroup ? '' : `row ${index}: no group`, /^\d{6}$/.test(item.articleDigits) ? '' : `row ${index}: article digits`].filter(Boolean));
