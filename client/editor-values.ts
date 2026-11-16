import type { Row } from '../shared/types.ts';
import { flangeIsoPrefill } from '../shared/flanges.ts';

/**
 * The values of the generic record editor (Add / Edit dialogs), kept apart from the React component so a test can
 * build exactly what the form sends. The form uses these functions; it does not keep a second copy of the rules.
 */
type FieldLike = { name: string; type?: string; default?: unknown };
interface ChangeContext { fields: readonly FieldLike[]; hosted: boolean; isometrics?: Row[]; certifications?: Row[] }

/** The field values a new or opened form starts with (one entry per field of the resource). */
export const editorFieldValues = (fields: readonly FieldLike[], record?: Row, defaults: Record<string, unknown> = {}) =>
  Object.fromEntries(fields.map(f => [f.name, f.type === 'password' ? '' : record?.[f.name] ?? defaults[f.name] ?? f.default ?? (f.type === 'checkbox' ? false : '')]));

/** Flange form on opening: the project follows the isometric (or the only project), and the isometric's own values fill what is still empty. */
export function flangeOpenValues(start: Record<string, unknown>, record: Row | undefined, isometrics: Row[] = [], projects: Row[] = []): Record<string, unknown> {
  const current = record?.assetTag && !String(start.line_number ?? '').trim() ? { ...start, line_number: record.assetTag } : start, iso = isometrics.find(row => row.id === current.isoId), live = projects.filter(row => !row._archived);
  return { ...current, projectId: iso?.projectId || current.projectId || (live.length === 1 ? live[0].id : ''), ...flangeIsoPrefill(iso, current) };
}

/**
 * One field changed in the form: the value and the fields that depend on it. A dependent field is only cleared
 * when the resource has it — the server refuses a field that is not part of the resource.
 */
export function editorChange(resourceKey: string, current: Record<string, unknown>, name: string, value: unknown, context: ChangeContext) {
  const next: Record<string, unknown> = { ...current, [name]: value };
  const has = (field: string) => context.fields.some(f => f.name === field);
  if (resourceKey === 'flanges' && name === 'isoId') { const iso = context.isometrics?.find(row => row.id === value); if (iso?.projectId) next.projectId = iso.projectId; Object.assign(next, flangeIsoPrefill(iso, next)); }
  if (resourceKey === 'flanges' && name === 'projectId' && context.isometrics?.find(row => row.id === next.isoId)?.projectId !== value) next.isoId = '';
  if (name === 'isoId') { if (has('spoolId')) next.spoolId = ''; if (context.hosted && has('wpsId')) next.wpsId = ''; }
  if (name === 'isoId' && ['cut_list', 'calculation_lines'].includes(resourceKey)) next.requirementId = '';
  if (name === 'materialId' && value) { next.customMaterialId = ''; next.customMaterial = false; }
  const side = /^[a-z]+([12])Id$/.exec(name)?.[1];
  if (resourceKey === 'welds' && side && name.startsWith('material')) { next[`certificate${side}Id`] = ''; next[`chargeNo${side}`] = ''; }
  if (resourceKey === 'welds' && side && name.startsWith('certificate') && value) {
    const certificate = context.certifications?.find(row => row.id === value);
    if (certificate?.materialId) next[`material${side}Id`] = certificate.materialId;
    if (certificate?.chargeNo) next[`chargeNo${side}`] = certificate.chargeNo;
  }
  if (resourceKey === 'welders' && name === 'combination' && !value) { next.welder1Id = ''; next.welder2Id = ''; }
  return next;
}

/**
 * What Save sends: a new record sends every value; an edit on the hosted profile sends only what changed
 * (`previous` gives the stored value of a field, `always` keeps a field that must travel with others).
 */
export function editorPayload(values: Record<string, unknown>, record: Row | undefined, hosted: boolean, previous: (name: string) => unknown, always: (name: string) => boolean = () => false) {
  if (!record || !hosted) return values;
  return Object.fromEntries(Object.entries(values).filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(previous(name)) || always(name)));
}
