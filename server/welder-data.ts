/**
 * Server rules of the welder-data flow (hosted profile only, switched on through `store.hostedRules`):
 * generated index numbers, the ISO / ASME column, required values, qualification ranges, the mandatory
 * certificate fields of a main project, and the cascade from a welder to its qualifications.
 */
import type { Row } from '../shared/types.ts';
import { CUSTOM_RANGES, FLAG_BULK_FIELDS, FREE_VALUE_MAX, HOSTED_FREE_VALUES, QUALIFICATION_RANGES, SITE_OWNED, certificateMandatoryErrors, diameterIdFor, diameterNumbers, hostedRequiredErrors, inOwnerSite, isoAsmeLabel, nextSiteIndexNumber, rangeErrors } from '../shared/welder-data.ts';
import type { Actor, Store } from './store.ts';

export interface Prepared { input: Record<string, unknown>; errors: Record<string, string>; }
const blank = (value: unknown) => value === undefined || value === null || String(value).trim() === '';

/**
 * Fill generated values and collect the rule errors of a record about to be saved. `existing` is the stored
 * record on update; rules read the merged record so a partial update is judged as a whole.
 */
export function prepareWelderData(store: Store, key: string, input: Record<string, unknown>, existing?: Row): Prepared {
  const next = { ...input };
  let merged: Record<string, unknown> = { ...existing, ...next };
  const errors: Record<string, string> = { ...hostedRequiredErrors(key, merged) };
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
  if (key === 'welder_certificates') {
    Object.assign(errors, rangeErrors(merged, QUALIFICATION_RANGES));
    if (!blank(merged.issuedAt) && !blank(merged.expiresAt) && String(merged.expiresAt) < String(merged.issuedAt)) errors.expiresAt = 'The expiry date cannot be before the issue date.';
  }
  return { input: next, errors };
}

/** Certificate and wire fields of a weld, with the resource they name. */
const WELD_OWNED: [string, string][] = [['certificate1Id', 'certifications'], ['certificate2Id', 'certifications'], ['wire1Id', 'welding_wires'], ['wire2Id', 'welding_wires']];
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
    const owned = SITE_OWNED[key];
    if (!inOwnerSite(key, record, siteId, { links: store.list(owned.links, true), projects: store.list('projects', true) })) errors[name] = key === 'certifications' ? 'Choose a certificate of this main project.' : 'Choose a welding wire of this main project.';
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
  if (key === 'welding_wires' && blank(row.typeMaterial) && row.materialTypeId) {
    try { return { ...row, typeMaterial: String(store.get('material_types', row.materialTypeId, true).name ?? '') }; } catch { return row; }
  }
  return row;
}
