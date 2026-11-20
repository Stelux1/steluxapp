/**
 * Server rules of the welder-data flow (hosted profile only, switched on through `store.hostedRules`):
 * generated index numbers, the ISO / ASME column, required values, qualification ranges, the mandatory
 * certificate fields of a main project, and the cascade from a welder to its qualifications.
 */
import type { Row } from '../shared/types.ts';
import { composeDiameter, unitErrors, unitPrefill } from '../shared/diameter-standard.ts';
import { catalogMaterialType, materialTypeName, CUSTOM_RANGES, FLAG_BULK_FIELDS, WELDERCARD_LISTS, joinIds, joinWqNos, splitIds, splitWqNos, welderWqNumbers, FREE_VALUE_MAX, HOSTED_FREE_VALUES, isWelderRole, QUALIFICATION_RANGES, SITE_OWNED, certificateMandatoryErrors, diameterIdFor, diameterNumbers, hostedRequiredErrors, inOwnerSite, isoAsmeLabel, nextSiteIndexNumber, ownerRows, ownerSites, rangeErrors, sitesMeet } from '../shared/welder-data.ts';
import { WPS_RANGES } from '../shared/wps.ts';
import type { Actor, Store } from './store.ts';
import { qaEngineerCompany } from '../shared/weld-catalogs.ts';

export interface Prepared { input: Record<string, unknown>; errors: Record<string, string>; }
const blank = (value: unknown) => value === undefined || value === null || String(value).trim() === '';

/**
 * Fill generated values and collect the rule errors of a record about to be saved. `existing` is the stored
 * record on update; rules read the merged record so a partial update is judged as a whole.
 */
export function prepareWelderData(store: Store, key: string, input: Record<string, unknown>, existing?: Row): Prepared {
  const next = { ...input };
  let merged: Record<string, unknown> = { ...existing, ...next };
  // Custom diameter (Weld diameters, Add): Unit + Value compose the Diameter text and prefill the sizes the unit allows (a size typed in the same request is kept).
  const unitErrorsOf: Record<string, string> = {};
  if (key === 'diameters' && (next.unit !== undefined || next.unitValue !== undefined)) {
    Object.assign(unitErrorsOf, unitErrors(merged.unit, merged.unitValue));
    if (!Object.keys(unitErrorsOf).length && !blank(merged.unit)) {
      next.diameter = composeDiameter(merged.unit, merged.unitValue);
      for (const [name, value] of Object.entries(unitPrefill(merged.unit, merged.unitValue))) if (blank(input[name]) && (blank(existing?.[name]) || input.unit !== undefined || input.unitValue !== undefined)) next[name] = value;
      merged = { ...existing, ...next };
    }
  }
  // Type of material (catalog columns): the name is the specification and grade, kept up to date when either changes.
  if (key === 'material_types' && catalogMaterialType(merged) && (!existing || ['materialSpec', 'materialGrade', 'standardSystem'].some(name => name in input) || blank(merged.name))) { next.name = materialTypeName(merged); merged = { ...merged, name: next.name }; }
  const errors: Record<string, string> = { ...hostedRequiredErrors(key, merged), ...unitErrorsOf };
  // Add storehouse (MTO Pilot, reference #addLager type=1): a new storehouse holds materials; the form does not show Used for.
  if (key === 'warehouses' && !existing && next.use === undefined) next.use = 'Materials';
  if (key === 'certifications' || key === 'welding_wires') {
    const owned = SITE_OWNED[key], siteId = String(merged.siteId ?? '').trim();
    const ownership = () => ({ links: store.list(owned.links, true), projects: store.list('projects', true) });
    // The main project of a certificate or wire is set when it is created and never moves (records of other main projects would follow it).
    if (existing && next.siteId !== undefined && String(next.siteId ?? '').trim() !== String(existing.siteId ?? '').trim()) errors.siteId = 'The main project of this record cannot be changed.';
    // Linked projects must be projects of that main project.
    if (siteId && Array.isArray(next.projectIds)) {
      const projects = new Map(store.list('projects', true).map(row => [row.id, row]));
      if (next.projectIds.some(id => projects.has(String(id)) && projects.get(String(id))!.siteId !== siteId)) errors.projectIds = 'Choose projects of this main project.';
    }
    // Index number: the next free four-digit number of the main project unless one was typed.
    const field = key === 'certifications' ? 'indexNo' : 'name';
    // A wire's index number is its name, unique over all active wires (shared/resources.ts): a number another main project holds is skipped.
    const taken = key === 'welding_wires' ? new Set(store.list(key).filter(row => row.id !== existing?.id).map(row => String(row.name ?? '').trim())) : undefined;
    if (blank(merged[field])) { next[field] = nextSiteIndexNumber(key, field, siteId, store.list(key, true).filter(row => row.id !== existing?.id), ownership(), taken); merged = { ...merged, [field]: next[field] }; }
  }
  if (key === 'itps' || key === 'wps' || key === 'pqr') Object.assign(errors, ownedRecordErrors(store, key, next, merged, existing));
  if (key === 'certifications') {
    // The diameter is a Weld diameter; its text is kept on the record for the documents that print it. A typed text
    // (an import, an older certificate) is matched to the Weld diameter of that name.
    const diameters = store.list('diameters', true);
    if (next.diameterId !== undefined) { const chosen = diameters.find(row => row.id === next.diameterId); next.diameter = chosen ? String(chosen.diameter ?? '') : ''; }
    else if (next.diameter !== undefined && blank(merged.diameterId)) next.diameterId = diameterIdFor(next.diameter, diameters);
    merged = { ...merged, diameter: next.diameter ?? merged.diameter, diameterId: next.diameterId ?? merged.diameterId };
  }
  if (key === 'welds') Object.assign(errors, weldOwnerErrors(store, input, merged));
  // Setting Controlled / Accepted alone (the bulk bar) is not a save of the certificate's data: the mandatory-field rule does not apply to it.
  if (key === 'certifications' && !(existing && Object.keys(next).length && Object.keys(next).every(name => FLAG_BULK_FIELDS.includes(name)))) {
    const projectIds = Array.isArray(next.projectIds) ? next.projectIds.map(String) : existing ? store.list('certificate_projects').filter(link => link.certificateId === existing.id).map(link => String(link.projectId)) : [];
    for (const [name, message] of Object.entries(certificateMandatoryErrors(merged, projectIds, store.list('projects'), store.list('sites')))) errors[name] ??= message;
  }
  if (key === 'welders') {
    // Every welder has the Welder role (the form has no Role field); Welder 1 / Welder 2 only exist for a combination.
    if (!existing && blank(merged.roleId)) { const role = store.list('roles').find(isWelderRole); if (role) next.roleId = role.id; }
    if (merged.combination !== true && ['combination', 'welder1Id', 'welder2Id'].some(name => name in input)) { next.welder1Id = ''; next.welder2Id = ''; }
  }
  if (key === 'material_types') next.isoAsme = isoAsmeLabel(merged);
  // Selects that also take a typed value (group, P-Number, certificate type): any short text.
  for (const name of HOSTED_FREE_VALUES[key] || []) if (typeof merged[name] === 'string' && merged[name].trim().length > FREE_VALUE_MAX) errors[name] = `The value is too long (at most ${FREE_VALUE_MAX} characters).`;
  // Diameter catalog: Size in mm, inches and outline accept a decimal comma; what is not a number is refused with the reference message.
  if (key === 'diameters') {
    const numbers = diameterNumbers(next);
    for (const name of Object.keys(numbers.errors)) delete next[name];
    Object.assign(next, numbers.values); Object.assign(errors, numbers.errors);
  }
  if (key === 'welder_customs_catalog') Object.assign(errors, rangeErrors(merged, CUSTOM_RANGES));
  // The diameter range a WPS covers (inches), entered by hand: numbers, and "to" not below "from".
  if (key === 'wps') Object.assign(errors, rangeErrors(merged, WPS_RANGES));
  if (key === 'welder_certificates') {
    Object.assign(errors, rangeErrors(merged, QUALIFICATION_RANGES));
    if (!blank(merged.issuedAt) && !blank(merged.expiresAt) && String(merged.expiresAt) < String(merged.issuedAt)) errors.expiresAt = 'The expiry date cannot be before the issue date.';
    // A document links to several WPS (stored as one text of ids): each must be a WPS of the workspace.
    if (next.wpsIds !== undefined) {
      const ids = splitIds(next.wpsIds);
      if (ids.some(id => { try { store.get('wps', id); return false; } catch { return true; } })) errors.wpsIds = 'Choose WPS of this workspace.';
      next.wpsIds = joinIds(ids);
    }
  }
  // One line of a welder's card: every list has a value of its own list; the WQ numbers are ones on the welder's documents.
  if (key === 'welder_card_lines') {
    for (const list of WELDERCARD_LISTS) {
      if (blank(merged[list.field])) continue;
      let option: Row | undefined; try { option = store.get('weldercard_options', merged[list.field], true); } catch { option = undefined; }
      if (!option || option.list !== list.key) errors[list.field] = `Choose a value of the ${list.label} list.`;
    }
    if (next.wqNos !== undefined) {
      next.wqNos = joinWqNos(Array.isArray(next.wqNos) ? next.wqNos : [next.wqNos]);
      const own = new Set(welderWqNumbers(store.list('welder_certificates'), String(merged.welderId ?? '')));
      if (splitWqNos(next.wqNos).some(number => !own.has(number))) errors.wqNos = 'Choose WQ numbers of this welder.';
    }
  }
  return { input: next, errors };
}

/**
 * An ITP, WPS or PQR belongs to the main project it was created in (shared/welder-data.ts → SITE_OWNED; client 20.11.2026):
 * that main project never changes, its linked projects are projects of it, a WPS is enabled there only and takes PQRs of
 * its own main project (or shared older ones). An older record without a main project is judged by the ones it belongs to.
 */
function ownedRecordErrors(store: Store, key: string, next: Record<string, unknown>, merged: Record<string, unknown>, existing?: Row): Record<string, string> {
  const errors: Record<string, string> = {}, siteId = String(merged.siteId ?? '').trim();
  if (existing && next.siteId !== undefined && String(next.siteId ?? '').trim() !== String(existing.siteId ?? '').trim()) errors.siteId = 'The main project of this record cannot be changed.';
  if (!siteId) { if (key === 'wps' && Array.isArray(next.pqrIds)) Object.assign(errors, wpsPqrErrors(store, next.pqrIds, ownerSites('wps', { ...merged, id: existing?.id }, ownerRows('wps', name => store.list(name, true))))); return errors; }
  if ((key === 'itps' || key === 'wps') && Array.isArray(next.projectIds)) {
    const projects = new Map(store.list('projects', true).map(row => [row.id, row]));
    if (next.projectIds.some(id => projects.has(String(id)) && projects.get(String(id))!.siteId !== siteId)) errors.projectIds = 'Choose projects of this main project.';
  }
  if (key === 'wps' && Array.isArray(next.siteIds) && next.siteIds.some(id => String(id) !== siteId)) errors.siteIds = 'A WPS method is enabled on its own main project only. Copy it to use it on another main project.';
  if (key === 'wps' && Array.isArray(next.pqrIds)) Object.assign(errors, wpsPqrErrors(store, next.pqrIds, [siteId]));
  return errors;
}
/** The PQRs a WPS links must belong to one of the WPS's main projects (a shared PQR or WPS meets every one). */
function wpsPqrErrors(store: Store, pqrIds: unknown[], sites: string[] | 'all'): Record<string, string> {
  const pqrs = new Map(store.list('pqr', true).map(row => [row.id, row])), lists = ownerRows('pqr', name => store.list(name, true));
  return pqrIds.some(id => { const pqr = pqrs.get(String(id)); return pqr && !sitesMeet(sites, ownerSites('pqr', pqr, lists)); }) ? { pqrIds: 'Choose PQRs of this main project.' } : {};
}

/** Certificate, wire and WPS fields of a weld, with the resource they name. */
const WELD_OWNED: [string, string][] = [['certificate1Id', 'certifications'], ['certificate2Id', 'certifications'], ['wire1Id', 'welding_wires'], ['wire2Id', 'welding_wires'], ['wpsId', 'wps']];
const WELD_OWNED_MESSAGES: Record<string, string> = { certifications: 'Choose a certificate of this main project.', welding_wires: 'Choose a welding wire of this main project.', wps: 'Choose a WPS of this main project.' };
/**
 * A weld takes certificates and welding wires of its own main project only (or shared older ones). Checked for the
 * values a write sets, and for all of them when the weld moves to another isometric.
 */
function weldOwnerErrors(store: Store, input: Record<string, unknown>, merged: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const checked = WELD_OWNED.filter(([name]) => (input[name] !== undefined || input.isoId !== undefined) && !blank(merged[name]));
  if (!checked.length) return errors;
  let siteId = '';
  try { const iso = store.get('isometrics', merged.isoId, true); siteId = String(store.get('projects', iso.projectId, true).siteId ?? ''); } catch { return errors; /* the isometric is reported with its own field */ }
  for (const [name, key] of checked) {
    let record: Row; try { record = store.get(key, merged[name], true); } catch { continue; }
    if (!inOwnerSite(key, record, siteId, ownerRows(key, resource => store.list(resource, true)))) errors[name] = WELD_OWNED_MESSAGES[key];
  }
  return errors;
}

/**
 * A welder moved to Deleted takes its qualifications with it; restoring the welder brings back exactly those.
 * Qualifications archived on their own stay archived.
 */
export function archiveWelderQualifications(store: Store, welderId: string, actor: Actor) {
  for (const row of store.list('welder_certificates').filter(item => item.welderId === welderId)) {
    const marked = store.update('welder_certificates', row.id, { ownerArchived: true }, row._version, actor);
    store.archive('welder_certificates', marked.id, marked._version, actor);
  }
}
export function restoreWelderQualifications(store: Store, welderId: string, actor: Actor) {
  for (const row of store.list('welder_certificates', true).filter(item => item.welderId === welderId && item._archived && item.ownerArchived)) {
    const restored = store.archive('welder_certificates', row.id, row._version, actor);
    store.update('welder_certificates', restored.id, { ownerArchived: false }, restored._version, actor);
  }
}

/**
 * Values the hosted lists derive for records written before a field changed: the Custom of a material part was a
 * Yes/No box (now text), and a welding wire named its type of material through a catalog link (now free text).
 * Nothing is stored; the record keeps its old value until it is saved again.
 */
export function withLegacyValues(store: Store, key: string, row: Row): Row {
  if (!store.hostedRules) return row;
  if (key === 'material_parts' && typeof row.custom === 'boolean') return { ...row, custom: row.custom ? 'Yes' : '' };
  // An older QA/QC engineer saved with a company record and no Company text shows that company's name (nothing is written).
  if (key === 'qa_engineers' && blank(row.company) && row.companyId) return { ...row, company: qaEngineerCompany(row, id => { try { return String(store.get('companies', id, true).name ?? ''); } catch { return undefined; } }) };
  if (key === 'welding_wires' && blank(row.typeMaterial) && row.materialTypeId) {
    try { return { ...row, typeMaterial: String(store.get('material_types', row.materialTypeId, true).name ?? '') }; } catch { return row; }
  }
  return row;
}
