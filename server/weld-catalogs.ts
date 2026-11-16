import { RESOURCE_MAP } from '../shared/resources.ts';
import { CATALOG_SITES, ENABLEMENT_INPUT, enablementKey, enabledOnSite } from '../shared/weld-catalogs.ts';
import type { Row } from '../shared/types.ts';
import { SITE_REFUSED } from '../shared/site-scope.ts';
import type { Actor, Store } from './store.ts';

/**
 * Server side of "Enabled on this site" (shared/weld-catalogs.ts): writing the availability of a catalog record
 * on a site, and refusing a reference to a record that is switched off on the site the referencing record
 * belongs to. This module returns messages instead of throwing so it does not depend on the store's error class.
 */

/** Fields that lead from a record towards its main project, in the order they are followed. */
const PATH = [['siteId', 'sites'], ['projectId', 'projects'], ['isoId', 'isometrics'], ['weldId', 'welds'], ['requestId', 'inspection_requests'], ['spoolId', 'spools']] as const;
/** The main project (site) a record belongs to, followed through its project / isometric / weld references; '' when it belongs to none. */
export function siteOfRecord(store: Store, key: string, data: Record<string, unknown>, depth = 0): string {
  if (key === 'sites') return String(data.id || '');
  if (depth > 6) return '';
  for (const [field, target] of PATH) {
    const value = data[field];
    if (typeof value !== 'string' || !value || !RESOURCE_MAP[key]?.fields.some(f => f.name === field)) continue;
    if (target === 'sites') return value;
    try { return siteOfRecord(store, target, store.get(target, value, true), depth + 1); } catch { return ''; }
  }
  return '';
}

/** The request's availability instruction: `enabledOnSite` (boolean) with `enabledSiteId`. null when the request carries none. */
export function enablementInput(store: Store, key: string, input: Record<string, unknown>): { enabled: boolean; siteId: string } | null | { error: string; field: string } {
  if (!enablementKey(key) || ENABLEMENT_INPUT.every(name => input[name] === undefined)) return null;
  if (typeof input.enabledOnSite !== 'boolean') return { field: 'enabledOnSite', error: 'Choose whether the record is enabled on this site.' };
  const siteId = input.enabledSiteId;
  if (typeof siteId !== 'string' || !siteId) return { field: 'enabledSiteId', error: 'Choose the main project to enable the record on.' };
  try { store.get('sites', siteId); } catch (error) { if ((error as { code?: unknown }).code === SITE_REFUSED) throw error; return { field: 'enabledSiteId', error: 'Choose an active main project.' }; }
  return { enabled: input.enabledOnSite, siteId };
}

/** Field errors of one write: a malformed availability instruction, and references to records switched off on the record's site. */
export function enablementErrors(store: Store, key: string, data: Record<string, unknown>, existing: Row | undefined, input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const instruction = enablementInput(store, key, input);
  if (instruction && 'error' in instruction) errors[instruction.field] = instruction.error;
  const fields = RESOURCE_MAP[key]?.fields.filter(f => f.ref && enablementKey(f.ref)) || [];
  if (!fields.length || !store.list(CATALOG_SITES).length) return errors;
  const siteId = siteOfRecord(store, key, { ...existing, ...data });
  if (!siteId) return errors;
  const rows = { [CATALOG_SITES]: store.list(CATALOG_SITES) };
  for (const field of fields) {
    const value = data[field.name];
    if (typeof value !== 'string' || !value || existing?.[field.name] === value) continue;
    let target: Row; try { target = store.get(field.ref!, value, true); } catch { continue; }
    if (!enabledOnSite(field.ref!, target, siteId, rows)) errors[field.name] = `This ${RESOURCE_MAP[field.ref!].singular} is not enabled on this main project.`;
  }
  return errors;
}

/** Write one availability: switching on a record with no explicit row needs no row; a row is kept once it exists. */
export function setAvailability(store: Store, key: string, id: string, siteId: string, enabled: boolean, actor: Actor) {
  const link = store.list(CATALOG_SITES).find(row => row.resourceKey === key && row.recordId === id && row.siteId === siteId);
  if (link) { if ((link.enabled !== false) !== enabled) store.update(CATALOG_SITES, link.id, { enabled }, link._version, actor); }
  else if (!enabled) store.create(CATALOG_SITES, { resourceKey: key, recordId: id, siteId, enabled: false }, actor);
}

/** Apply the availability instruction of a create / update / bulk request after the record is written. */
export function applyEnablement(store: Store, key: string, id: string, input: Record<string, unknown>, actor: Actor) {
  const instruction = enablementInput(store, key, input);
  if (instruction && !('error' in instruction)) setAvailability(store, key, id, instruction.siteId, instruction.enabled, actor);
}
