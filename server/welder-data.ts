/**
 * Server rules of the welder-data flow (hosted profile only, switched on through `store.hostedRules`):
 * generated index numbers, the ISO / ASME column, required values, qualification ranges, the mandatory
 * certificate fields of a main project, and the cascade from a welder to its qualifications.
 */
import type { Row } from '../shared/types.ts';
import { CUSTOM_RANGES, isWelderRole, QUALIFICATION_RANGES, certificateMandatoryErrors, hostedRequiredErrors, isoAsmeLabel, nextIndexNumber, rangeErrors } from '../shared/welder-data.ts';
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
    // Index number: the next free four-digit number unless one was typed.
    const field = key === 'certifications' ? 'indexNo' : 'name';
    if (blank(merged[field])) { next[field] = nextIndexNumber(store.list(key, true).map(row => row[field])); merged = { ...merged, [field]: next[field] }; }
  }
  if (key === 'certifications') {
    const projectIds = Array.isArray(next.projectIds) ? next.projectIds.map(String) : existing ? store.list('certificate_projects').filter(link => link.certificateId === existing.id).map(link => String(link.projectId)) : [];
    for (const [name, message] of Object.entries(certificateMandatoryErrors(merged, projectIds, store.list('projects'), store.list('sites')))) errors[name] ??= message;
  }
  if (key === 'welders') {
    // Every welder has the Welder role (the form has no Role field); Welder 1 / Welder 2 only exist for a combination.
    if (!existing && blank(merged.roleId)) { const role = store.list('roles').find(isWelderRole); if (role) next.roleId = role.id; }
    if (merged.combination !== true && ['combination', 'welder1Id', 'welder2Id'].some(name => name in input)) { next.welder1Id = ''; next.welder2Id = ''; }
  }
  if (key === 'material_types') next.isoAsme = isoAsmeLabel(merged);
  if (key === 'welder_customs_catalog') Object.assign(errors, rangeErrors(merged, CUSTOM_RANGES));
  if (key === 'welder_certificates') {
    Object.assign(errors, rangeErrors(merged, QUALIFICATION_RANGES));
    if (!blank(merged.issuedAt) && !blank(merged.expiresAt) && String(merged.expiresAt) < String(merged.issuedAt)) errors.expiresAt = 'The expiry date cannot be before the issue date.';
  }
  return { input: next, errors };
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
