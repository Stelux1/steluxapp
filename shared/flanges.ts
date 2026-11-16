import { FLANGE_STANDARDS, flangeStandard } from './site-settings.ts';
import type { Field, Row } from './types.ts';

/**
 * Flange management: the fields of the flange record, the derived status, the torque comparison and the list
 * helpers. The module imports types and site settings only, so `shared/resources.ts` can use the field list.
 */
const SECTION = {
  identification: 'Identification and location',
  flange: 'Flange and gasket',
  bolting: 'Bolting',
  tightening: 'Tightening',
  inspection: 'Inspection and commissioning',
  operating: 'Operating data',
} as const;
const text = (name: string, label: string, section: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', section, ...extra });
/** No `min`: a negative torque gets the plain message of `flangeInputErrors`, not the generic range text. */
const torque = (name: string, label: string, hint: string): Field => ({ name, label, type: 'number', section: SECTION.tightening, step: 0.1, hint });

/**
 * Field names keep the spelling of records saved before this module (`tightning_date`, `commisioning_date`,
 * `studbolt_afmeting`, ...) so older databases open unchanged. New fields: projectId, highRisk, testPressure. The reference's "Asset tag" is stored in `line_number`; older records may still carry the retired `assetTag` value (see `flangeAssetTag`).
 */
export const FLANGE_FIELDS: Field[] = [
  { name: 'projectId', label: 'Project', type: 'ref', ref: 'projects', section: SECTION.identification, hint: 'Narrows the isometrics. The project always follows the chosen isometric.' },
  { name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics', required: true, section: SECTION.identification },
  text('flange_id', 'Flange ID', SECTION.identification),
  text('from_equipment', 'From equipment', SECTION.identification),
  text('to_equipment', 'To equipment', SECTION.identification),
  text('eq_con', 'Equipment connection', SECTION.identification),
  text('irnno', 'IRN no', SECTION.identification),
  text('criticality', 'Criticality', SECTION.identification),
  { name: 'highRisk', label: 'High risk', type: 'checkbox', default: false, section: SECTION.identification },
  text('pid', 'P&ID', SECTION.identification),
  text('line_number', 'Asset tag', SECTION.identification),
  text('fluid_code', 'Fluid code', SECTION.identification),
  text('pipe_class', 'Pipe class', SECTION.identification),
  text('area_unit', 'Area/unit', SECTION.identification),
  text('location', 'Location', SECTION.identification),
  text('flange_type', 'Flange type', SECTION.flange, { hint: 'For example weld neck or slip-on.' }),
  text('flange_size', 'Flange size', SECTION.flange, { hint: 'For example DN150 (NPS 6).' }),
  text('flange_rating', 'Flange rating', SECTION.flange, { hint: 'For example class 150 or PN 16.' }),
  text('flange_rate_size', 'Flange rate/size', SECTION.flange),
  text('gasket_type', 'Gasket type', SECTION.flange, { hint: 'For example spiral wound.' }),
  text('gasket_material', 'Gasket material', SECTION.flange),
  text('studbolt_afmeting', 'Stud bolt dimension', SECTION.bolting),
  text('stud_dia', 'Stud diameter', SECTION.bolting),
  { name: 'aantal_studbolts', label: 'Number of stud bolts', type: 'number', min: 0, step: 1, section: SECTION.bolting },
  text('lubricant_used', 'Lubricant used', SECTION.bolting),
  text('matl_studbolts', 'Stud bolt material', SECTION.bolting),
  text('materiaal_moer', 'Nut material', SECTION.bolting),
  text('torque_wrench_type', 'Torque wrench type', SECTION.tightening),
  text('torque_wrench_id', 'Torque wrench ID', SECTION.tightening),
  torque('first_pass_nm', 'First pass (Nm)', 'Entered by hand; it must not exceed the second pass.'),
  torque('second_pass_nm', 'Second pass (Nm)', 'Entered by hand; it must not exceed the target moment plus the max deviation.'),
  torque('target_moment_nm', 'Target moment (Nm)', 'Entered by hand. The site standard does not fill it in.'),
  text('target_stress', 'Target stress', SECTION.tightening),
  torque('max_dev', 'Max deviation', 'How far above the target moment a pass may go, in Nm.'),
  { name: 'tightning_date', label: 'Tightening date', type: 'date', section: SECTION.tightening },
  text('report_nr', 'Report no.', SECTION.tightening),
  text('operator', 'Operator', SECTION.tightening),
  text('cqi', 'CQI', SECTION.inspection),
  { name: 'commisioning_date', label: 'Commissioning date', type: 'date', section: SECTION.inspection },
  text('rejection_type', 'Rejection type', SECTION.inspection),
  text('insp_result', 'Inspection result', SECTION.inspection),
  { name: 'finished', label: 'Finished', type: 'checkbox', default: false, section: SECTION.inspection, hint: 'Mark the flange finished once everything is closed out.' },
  text('operatingPressure', 'Operating pressure', SECTION.operating),
  text('operatingTemp', 'Operating temperature', SECTION.operating),
  text('testPressure', 'Test pressure', SECTION.operating),
];
/** Columns of the generic table (profiles without the dedicated page). */
export const FLANGE_COLUMNS = ['flange_id', 'isoId', 'line_number', 'flange_size', 'gasket_type', 'target_moment_nm', 'finished'];

export const FLANGE_STATUSES = ['Planned', 'Tightened', 'Inspected', 'Finished'] as const;
export type FlangeStatus = typeof FLANGE_STATUSES[number];
const filled = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
const numeric = (value: unknown): number | null => {
  if (!filled(value)) return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

/**
 * Status of a flange, derived from what is recorded (inferred, not confirmed by the reference):
 * Finished when the finished box is ticked, or an inspection result and a commissioning date exist;
 * Inspected when an inspection result exists; Tightened when a tightening date and both passes are
 * recorded; Planned otherwise.
 */
export function flangeStatus(row: Partial<Row> | Record<string, unknown>): FlangeStatus {
  const has = (name: string) => filled(row[name]);
  const inspected = has('insp_result');
  if (row.finished === true || (inspected && has('commisioning_date'))) return 'Finished';
  if (inspected) return 'Inspected';
  if (has('tightning_date') && has('first_pass_nm') && has('second_pass_nm')) return 'Tightened';
  return 'Planned';
}

/** Server-side coercion of an older record that stored a torque value as text. */
export function flangeStoredValue(field: Field, value: unknown): unknown {
  if (field.type !== 'number' || typeof value !== 'string') return value;
  const number = numeric(value);
  return value.trim() === '' || number === null ? value : number;
}

/**
 * Compare the entered torque values: first pass <= second pass <= target moment + max deviation. Only values
 * the user entered take part; a missing value skips the comparisons that need it. Returns field errors.
 */
export function flangeTorqueErrors(values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const first = numeric(values.first_pass_nm), second = numeric(values.second_pass_nm), target = numeric(values.target_moment_nm), deviation = numeric(values.max_dev) ?? 0;
  if (first !== null && second !== null && first > second) errors.first_pass_nm = 'The first pass cannot be higher than the second pass.';
  if (target !== null) {
    const limit = target + deviation;
    const over = (value: number | null) => value !== null && value > limit;
    if (over(second)) errors.second_pass_nm = deviation ? 'The second pass is above the target moment plus the max deviation.' : 'The second pass is above the target moment.';
    else if (over(first)) errors.first_pass_nm = 'The first pass is above the target moment plus the max deviation.';
  }
  return errors;
}

/**
 * Everything the server and the form check before master data is saved. The reference does not compare the passes
 * on save (that belongs to recorded passes: `flangeTorqueErrors`); only a negative torque is refused, in plain words.
 */
export const FLANGE_TORQUE_FIELDS = ['first_pass_nm', 'second_pass_nm', 'target_moment_nm', 'max_dev'] as const;
export function flangeInputErrors(values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const name of FLANGE_TORQUE_FIELDS) { const value = numeric(values[name]); if (value !== null && value < 0) errors[name] = 'Torque must be 0 or more.'; }
  return errors;
}

/** The asset tag of a flange: `line_number` is the reference field; older records may still hold it in `assetTag`. */
export const flangeAssetTag = (row: Partial<Row> | Record<string, unknown>) => String((filled(row.line_number) ? row.line_number : row.assetTag) ?? '');

/**
 * What choosing an isometric fills in on the flange form: only the fields that are still empty. Asset tag, IRN, pipe
 * class and test pressure come from the isometric's own fields. P&ID, area/unit and location have no source on our
 * isometric and are left alone.
 */
export function flangeIsoPrefill(iso: Partial<Row> | Record<string, unknown> | undefined, current: Record<string, unknown>): Record<string, string> {
  const patch: Record<string, string> = {};
  if (!iso) return patch;
  for (const [target, source] of [['line_number', 'assetTag'], ['irnno', 'irn'], ['pipe_class', 'pipingClass'], ['testPressure', 'testPressure']] as const) {
    if (!filled(current[target]) && filled(iso[source])) patch[target] = String(iso[source]).trim();
  }
  return patch;
}

/**
 * EXTENSION POINT for a real torque catalog. The reference pre-fills the passes and the target moment from the
 * tightening standard named on the main project. We do not hold those tables and do not invent them, so every
 * standard is free entry. A catalog registers here, keyed by one of FLANGE_STANDARDS, and returns suggestions
 * from the flange's own size, rating and bolting; the form may offer them but must never overwrite entered values.
 */
export interface TorqueSuggestion { firstPassNm: number; secondPassNm: number; targetMomentNm: number }
export type TorqueCatalog = (flange: Record<string, unknown>) => TorqueSuggestion | null;
export const FLANGE_TORQUE_CATALOGS: Partial<Record<typeof FLANGE_STANDARDS[number], TorqueCatalog>> = {};
export const flangeTorqueSuggestion = (standard: string, flange: Record<string, unknown>): TorqueSuggestion | null =>
  FLANGE_TORQUE_CATALOGS[standard as typeof FLANGE_STANDARDS[number]]?.(flange) ?? null;

/** What the form and page tell the user about the site's standard. */
export function flangeStandardNotice(site: Record<string, unknown> | undefined | null) {
  const standard = flangeStandard(site);
  const catalog = Boolean(FLANGE_TORQUE_CATALOGS[standard as typeof FLANGE_STANDARDS[number]]);
  return { standard, catalog, message: catalog ? `${standard}: torque values are suggested from the catalog and can be changed.` : standard === FLANGE_STANDARDS[0] ? 'This main project names no torque catalog. Enter the torque values by hand.' : `This main project names ${standard}, but its torque table is not installed here. Enter the torque values by hand; they are only compared with each other.` };
}

/* ---------------------------------------------------------------- list */
export interface FlangeItem { row: Row; isoNo: string; projectId: string; projectName: string; status: FlangeStatus }
export interface FlangeFilters { projectId: string; finished: '' | 'No' | 'Yes'; isoId: string; query: string }
export const NO_FLANGE_FILTERS: FlangeFilters = { projectId: '', finished: '', isoId: '', query: '' };

/** The list rows with the isometric number, the project and the derived status. */
export function flangeItems(flanges: Row[], isometrics: Row[], projects: Row[]): FlangeItem[] {
  const isoById = new Map(isometrics.map(row => [row.id, row])), projectById = new Map(projects.map(row => [row.id, row]));
  return flanges.map(row => {
    const iso = isoById.get(String(row.isoId)), projectId = String(iso?.projectId || row.projectId || ''), project = projectById.get(projectId);
    return { row, isoNo: String(iso?.isoNo ?? ''), projectId, projectName: project ? String(project.internnumber || project.description || '') : '', status: flangeStatus(row) };
  });
}
export function filterFlanges(items: FlangeItem[], filters: FlangeFilters): FlangeItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter(item => (!filters.projectId || item.projectId === filters.projectId)
    && (!filters.isoId || item.row.isoId === filters.isoId)
    && (!filters.finished || (filters.finished === 'Yes') === (item.row.finished === true))
    && (!query || [item.projectName, item.isoNo, item.row.flange_id, flangeAssetTag(item.row), item.row.flange_size, item.row.gasket_type, item.status].some(value => String(value ?? '').toLowerCase().includes(query))));
}
/** The flanges of one isometric, for the count on the isometric. */
export const isoFlangeCount = (flanges: Row[], isoId: string) => flanges.filter(row => !row._archived && row.isoId === isoId).length;

/** Columns of the list as captured; a hidden one is offered in the column chooser (Criticality). The row selection and Options follow them. */
export const FLANGE_LIST_COLUMNS: { key: string; label: string; hidden?: boolean; value: (item: FlangeItem) => string | number }[] = [
  { key: 'project', label: 'Project', value: item => item.projectName },
  { key: 'iso', label: 'Iso number', value: item => item.isoNo },
  { key: 'flange_id', label: 'Flange ID', value: item => String(item.row.flange_id ?? '') },
  { key: 'assetTag', label: 'Asset tag', value: item => flangeAssetTag(item.row) },
  { key: 'flange_size', label: 'Flange Size', value: item => [item.row.flange_size, item.row.flange_rating].map(value => String(value ?? '').trim()).filter(Boolean).join(' / ') },
  { key: 'gasket_type', label: 'Gasket Type', value: item => String(item.row.gasket_type ?? '') },
  { key: 'target_moment_nm', label: 'Target Moment (Nm)', value: item => numeric(item.row.target_moment_nm) ?? '' },
  { key: 'criticality', label: 'Criticality', hidden: true, value: item => String(item.row.criticality ?? '') },
  { key: 'status', label: 'Status', value: item => item.status },
];

/** The listed flanges whose id is ticked, in list order. */
export const selectedFlanges = (items: FlangeItem[], ids: Iterable<string>) => { const chosen = new Set(ids); return items.filter(item => chosen.has(item.row.id)); };

/** Where the QR code of a flange label leads (the flange page of the app). */
export const flangePath = (id: string) => `/weld/workspace/flanges/${encodeURIComponent(id)}`;
/** CSV of the listed flanges; cells that a spreadsheet would read as a formula are prefixed with a quote. */
export function flangesCsv(items: FlangeItem[]): string {
  const cell = (value: unknown) => { let out = String(value ?? ''); if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`; return /[",\n\r]/.test(out) ? `"${out.replaceAll('"', '""')}"` : out; };
  return [FLANGE_LIST_COLUMNS.map(column => cell(column.label)).join(','), ...items.map(item => FLANGE_LIST_COLUMNS.map(column => cell(column.value(item))).join(','))].join('\r\n') + '\r\n';
}
