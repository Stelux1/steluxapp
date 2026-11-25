import { FLANGE_STANDARDS, flangeStandard } from './site-settings.ts';
import type { Field, Resource, Row } from './types.ts';

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
/** Suggestions of Flange Size and Flange Rating in the reference form, in its order (weld__releases__flange-management__edit.txt). */
export const FLANGE_SIZE_SUGGESTIONS = ['1/2"', '3/4"', '1"', '1.1/2"', '2"', '3"', '4"', '6"', '8"', '10"', '12"', '14"', '16"', '18"', '20"', '24"', '30"', '36"', '42"', '48"'];
export const FLANGE_RATING_SUGGESTIONS = ['150#', '300#', '600#', '900#', '1500#', '2500#'];
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
  { name: 'highRisk', label: 'High risk', type: 'checkbox', default: false, section: SECTION.identification, hint: 'Requires enhanced control' },
  text('pid', 'P&ID', SECTION.identification),
  text('line_number', 'Asset tag', SECTION.identification),
  text('fluid_code', 'Fluid code', SECTION.identification),
  text('pipe_class', 'Pipe class', SECTION.identification),
  text('area_unit', 'Area/unit', SECTION.identification),
  text('location', 'Location', SECTION.identification),
  text('flange_type', 'Flange type', SECTION.flange, { hint: 'For example weld neck or slip-on.' }),
  // Suggestion lists of the reference form; any other text is still accepted (`free`).
  text('flange_size', 'Flange size', SECTION.flange, { options: FLANGE_SIZE_SUGGESTIONS, free: true }),
  text('flange_rating', 'Flange rating', SECTION.flange, { options: FLANGE_RATING_SUGGESTIONS, free: true }),
  text('flange_rate_size', 'Flange rate/size', SECTION.flange),
  text('gasket_type', 'Gasket type', SECTION.flange, { hint: 'For example spiral wound.' }),
  text('gasket_material', 'Gasket material', SECTION.flange),
  text('studbolt_afmeting', 'Stud bolt dimension', SECTION.bolting),
  text('stud_dia', 'Stud diameter', SECTION.bolting),
  { name: 'aantal_studbolts', label: 'Number of stud bolts', type: 'number', min: 0, step: 1, section: SECTION.bolting },
  text('lubricant_used', 'Lubricant used', SECTION.bolting),
  text('matl_studbolts', 'Stud bolt material', SECTION.bolting),
  text('materiaal_moer', 'Nut material', SECTION.bolting),
  // Chosen per flange (client change list 22.11.2026, image 3: it left the main project form). A new flange starts with the first
  // option; a flange saved before reads the standard of its main project (`flangeTighteningStandard`). Printed on the flange report.
  { name: 'tightening_standard', label: 'Tightening standard', type: 'select', options: FLANGE_STANDARDS, default: FLANGE_STANDARDS[0], section: SECTION.tightening, hint: 'The standard the torque values of this flange follow. It is printed on the flange report.' },
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
  // Last field of the reference Edit dialog ("Operating Pressure / Note"), a plain text area.
  { name: 'note', label: 'Note', type: 'textarea', section: SECTION.operating },
];
/**
 * The flange dialogs inside a pilot word themselves as the reference: "Add Flange" with Add, "Edit" with Update. The Edit
 * dialog has the Add field groups and Note and no Finished? box (weld__releases__flange-management__edit.txt); the stored
 * flag stays on the record. Other profiles keep their wording and fields.
 */
export const FLANGE_WORDING = { add: 'Add Flange', edit: 'Edit', remove: 'Delete Flange' };
export const flangeEditorResource = (resource: Resource, pilot: boolean): Resource => pilot && resource.key === 'flanges' ? { ...resource, wording: FLANGE_WORDING } : resource;
/** Fields of the pilot's Add and Edit dialogs: the same list (Note included, Finished? left out). */
export const flangeFieldInDialog = (name: string, pilot: boolean, editing: boolean) => !(name === 'finished' && (pilot || !editing));
export const flangeDialogFields = (pilot: boolean, editing: boolean) => FLANGE_FIELDS.filter(field => flangeFieldInDialog(field.name, pilot, editing));
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
export interface FlangeItem { row: Row; isoNo: string; projectId: string; projectName: string; status: FlangeStatus; /** The flange's tightening standard (its own, else its main project's). */ standard: string }
export interface FlangeFilters { projectId: string; finished: '' | 'No' | 'Yes'; isoId: string; query: string }
export const NO_FLANGE_FILTERS: FlangeFilters = { projectId: '', finished: '', isoId: '', query: '' };

/**
 * The tightening standard of one flange: its own choice, else (a flange saved before the field existed, or with a value
 * that is no option) the standard named on its main project, else the first option.
 */
export function flangeTighteningStandard(flange: Record<string, unknown>, site?: Record<string, unknown> | null): string {
  const own = String(flange.tightening_standard ?? '').trim();
  return FLANGE_STANDARDS.includes(own) ? own : flangeStandard(site);
}
/** The list rows with the isometric number, the project, the derived status and the tightening standard (`sites` gives the fallback of older flanges). */
export function flangeItems(flanges: Row[], isometrics: Row[], projects: Row[], sites: Row[] = []): FlangeItem[] {
  const isoById = new Map(isometrics.map(row => [row.id, row])), projectById = new Map(projects.map(row => [row.id, row])), siteById = new Map(sites.map(row => [row.id, row]));
  return flanges.map(row => {
    const iso = isoById.get(String(row.isoId)), projectId = String(iso?.projectId || row.projectId || ''), project = projectById.get(projectId);
    return { row, isoNo: String(iso?.isoNo ?? ''), projectId, projectName: project ? String(project.internnumber || project.description || '') : '', status: flangeStatus(row), standard: flangeTighteningStandard(row, siteById.get(String(project?.siteId ?? ''))) };
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

/** The flange detail page inside Weld Pilot (route-table path, without the pilot prefix). */
export const flangeDetailPath = (id: string) => `/welding/flanges/${encodeURIComponent(id)}`;
/** Where the QR code of a flange label leads: the flange detail page in Weld Pilot. */
export const flangePath = (id: string) => `/weld${flangeDetailPath(id)}`;

/** Rows per page of the list (reference: Show 10 / 20 / 50 / 100 / 500, 100 by default). */
export const FLANGE_PAGE_SIZES = [10, 20, 50, 100, 500];
export const FLANGE_DEFAULT_PAGE_SIZE = 100;
/** The list opens sorted by Target Moment (Nm), ascending (reference order [[6, 'asc']]). */
export const FLANGE_DEFAULT_SORT: { key: string; dir: 'asc' | 'desc' } = { key: 'target_moment_nm', dir: 'asc' };
/**
 * The list sorted by one of its columns: numbers as numbers, text naturally (2 before 10), empty values last in either
 * direction; equal values keep their stored order.
 */
export function sortFlanges(items: FlangeItem[], key: string, dir: 'asc' | 'desc' = 'asc'): FlangeItem[] {
  const column = FLANGE_LIST_COLUMNS.find(entry => entry.key === key);
  if (!column) return items;
  const factor = dir === 'asc' ? 1 : -1;
  return items.map((item, index) => ({ item, index, value: column.value(item) })).sort((a, b) => {
    const emptyA = a.value === '' || a.value === null, emptyB = b.value === '' || b.value === null;
    if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1;
    const order = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : String(a.value).localeCompare(String(b.value), 'en', { numeric: true, sensitivity: 'base' });
    return order ? order * factor : a.index - b.index;
  }).map(entry => entry.item);
}
/** CSV of the listed flanges; cells that a spreadsheet would read as a formula are prefixed with a quote. */
export function flangesCsv(items: FlangeItem[]): string {
  const cell = (value: unknown) => { let out = String(value ?? ''); if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`; return /[",\n\r]/.test(out) ? `"${out.replaceAll('"', '""')}"` : out; };
  return [FLANGE_LIST_COLUMNS.map(column => cell(column.label)).join(','), ...items.map(item => FLANGE_LIST_COLUMNS.map(column => cell(column.value(item))).join(','))].join('\r\n') + '\r\n';
}

/* ======================================================================================= flange joint assembly record */
/*
 * The flange detail page (reference weld__releases__flange__detail.txt, manual "Flange joint assembly record"). Everything
 * here is append-only: a saved record, a pass, a bolt measurement, a leak test, a label, a deviation event, a signature and
 * a workflow event are new rows; nothing is updated and the flange master record is never written. The latest saved record
 * of a flange is the one that counts; signatures and the registered PDF belong to the record they were made for.
 */

/** "Preparation and inspection controls" (8), in the reference order and wording. */
export const FLANGE_PREPARATION_CONTROLS: [key: string, label: string][] = [
  ['parameters_available', 'Prescribed bolting / torque parameters available'], ['faces_checked', 'Flange and gasket faces checked'],
  ['gasket_condition', 'Gasket type and condition checked'], ['bolts_condition', 'Condition of bolts/studs checked'], ['thread_compound', 'Thread compound applied'],
  ['alignment_checked', 'Flange alignment checked'], ['stress_free_installed', 'Stress-free installed'], ['leak_tested', 'Pressure / Leak; medium'],
];
/** "Assembly checklist" (5). */
export const FLANGE_ASSEMBLY_CHECKLIST: [key: string, label: string][] = [
  ['flange_faces_clean', 'Flange faces clean'], ['gasket_verified', 'Gasket verified'], ['studs_lubricated', 'Studs lubricated'], ['alignment_ok', 'Alignment acceptable'], ['tool_calibrated', 'Tool calibration verified'],
];
/** "Completion checks": each a date and a time. */
export const FLANGE_COMPLETION_CHECKS: [key: string, label: string][] = [
  ['initial_alignment', 'Initial flange alignment checked'], ['fourth_pass', '4th pass torque completed'], ['fifth_pass', '5th pass torque completed'], ['final_gap', 'Final flange gap checked'],
];
export const TIGHTENING_METHODS = ['Torque', 'Hydraulic torque', 'Bolt tensioning'] as const;
/** Fields of the method block per tightening method (reference: only the relevant machine, pressure or kN fields show). */
export const METHOD_FIELDS: Record<string, string[]> = {
  Torque: ['method_equipment_id'], 'Hydraulic torque': ['method_equipment_id', 'method_pressure_a', 'method_pressure_b'], 'Bolt tensioning': ['method_equipment_id', 'method_tension_kn'],
};
export const RECORD_PASS_ROWS = [1, 2, 3];
export const PASS_RESULTS = ['OK', 'NOK'];
export const ALIGNMENT_POINTS = [1, 2, 3, 4];
/** Largest accepted alignment difference |after − before| in mm (reference "Max. deviation: 2 mm"). */
export const ALIGNMENT_MAX_MM = 2;
/** Tolerance of a validated pass or bolt against the master Target Moment and Target Stress (reference "tolerance ±5%"). */
export const FLANGE_TOLERANCE = 0.05;
export const PASS_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const LEAK_RESULTS = ['Passed', 'Failed'];
export const SIGNATURE_ROLES = ['Technician', 'QA/QC'] as const;
export type SignatureRole = typeof SIGNATURE_ROLES[number];
export const SIGNATURE_METHODS = ['Saved signature', 'Drawn signature', 'Signed hard-copy'] as const;
export const DEVIATION_EVENTS = ['Opened', 'Restored'];
export const WORKFLOW_ACTIONS = ['Assembled', 'Rejected', 'Released'] as const;
/** Document types of the flange's own files. A general attachment is the only kind the generic upload may add. */
export const FLANGE_GENERAL_DOCUMENT = 'General attachment';
export const FLANGE_HARDCOPY_DOCUMENT = 'Signed hard-copy protocol';
export const FLANGE_PROTOCOL_DOCUMENT = 'Flange protocol PDF';
export const FLANGE_SIGNATURE_DOCUMENT = 'Protocol signature';
export const FLANGE_HARDCOPY_TYPES = /\.(pdf|jpe?g|png|webp)$/i;

const recordField = (name: string, label: string, type: Field['type'] = 'text', extra: Partial<Field> = {}): Field => ({ name, label, type, ...extra });
const flangeRef = recordField('flangeId', 'Flange', 'ref', { ref: 'flanges', required: true });
const RECORD_FIELDS: Field[] = [
  flangeRef,
  ...FLANGE_PREPARATION_CONTROLS.map(([key, label]) => recordField(`check_${key}`, label, 'checkbox', { default: false })),
  recordField('assembly_date', 'Assembly date', 'date'),
  recordField('tightening_method', 'Tightening method', 'select', { options: [...TIGHTENING_METHODS], blank: '-' }),
  recordField('tool_id', 'Tool ID'), recordField('operator_name', 'Operator'),
  recordField('method_equipment_id', 'Machine / tool ID'), recordField('method_pressure_a', 'Hydraulic pressure A (bar)'), recordField('method_pressure_b', 'Hydraulic pressure B (bar)'), recordField('method_tension_kn', 'Bolt tension (kN)'),
  recordField('torque_wrench_manufacturer', 'Torque wrench manufacturer'), recordField('torque_wrench_model', 'Torque wrench model'), recordField('calibration_certificate', 'Calibration certificate no.'),
  recordField('new_bolts_used', 'New bolts used', 'select', { options: ['Yes', 'No'], blank: '-' }), recordField('washers_used', 'Washers used', 'select', { options: ['Yes', 'No'], blank: '-' }),
  recordField('lmra_confirmed', 'LMRA completed before assembly.', 'checkbox', { default: false }),
  ...RECORD_PASS_ROWS.flatMap(n => [recordField(`pass${n}_target`, `Pass ${n} target (Nm)`), recordField(`pass${n}_actual`, `Pass ${n} actual (Nm)`), recordField(`pass${n}_result`, `Pass ${n} result`, 'select', { options: PASS_RESULTS, blank: '-' })]),
  ...FLANGE_COMPLETION_CHECKS.flatMap(([key, label]) => [recordField(`${key}_date`, `${label} (date)`, 'date'), recordField(`${key}_time`, `${label} (time)`)]),
  ...FLANGE_ASSEMBLY_CHECKLIST.map(([key, label]) => recordField(`checklist_${key}`, label, 'checkbox', { default: false })),
  recordField('installer_name', 'Installer name'), recordField('installer_initials', 'Installer initials'),
  ...ALIGNMENT_POINTS.flatMap(n => [recordField(`alignment_before_${n}`, `Point ${n} before (mm)`), recordField(`alignment_after_${n}`, `Point ${n} after (mm)`)]),
  recordField('deviation_reference', 'Deviation reference'), recordField('non_conformity_notes', 'Non-conformities / remarks', 'textarea'),
  recordField('test_result', 'Test result'), recordField('notes', 'Note', 'textarea'),
];
/** Longest text per record field, as the reference inputs allow (maxlength). */
export const RECORD_MAX_LENGTH: Record<string, number> = {
  tool_id: 100, operator_name: 150, method_equipment_id: 100, method_pressure_a: 30, method_pressure_b: 30, method_tension_kn: 30, torque_wrench_manufacturer: 100, torque_wrench_model: 100,
  calibration_certificate: 100, installer_name: 150, installer_initials: 20, deviation_reference: 100, non_conformity_notes: 5000, test_result: 40, notes: 5000,
  ...Object.fromEntries(RECORD_PASS_ROWS.flatMap(n => [[`pass${n}_target`, 30], [`pass${n}_actual`, 30]])),
  ...Object.fromEntries(ALIGNMENT_POINTS.flatMap(n => [[`alignment_before_${n}`, 30], [`alignment_after_${n}`, 30]])),
};
/** Names of the record fields a save may send (everything but the flange). */
export const RECORD_INPUT_FIELDS = RECORD_FIELDS.filter(field => field.name !== 'flangeId').map(field => field.name);

const resource = (key: string, title: string, singular: string, description: string, fields: Field[], columns: string[], extra: Partial<Resource> = {}): Resource =>
  ({ key, title, singular, module: 'welding', group: 'Releases', description, fields, columns, display: columns[0], readonly: true, ...extra });
/** The record types of the assembly record. Read only through the generic routes: only the record actions write them. */
export const FLANGE_RECORD_RESOURCES: Resource[] = [
  resource('flange_records', 'Flange joint assembly records', 'flange joint assembly record', 'Saved assembly records of a flange; the latest one counts.', RECORD_FIELDS, ['flangeId', 'assembly_date', 'tightening_method', 'installer_name']),
  resource('flange_passes', 'Flange tightening passes', 'tightening pass', 'Validated tightening passes of a flange, kept also when out of tolerance.', [
    flangeRef, recordField('recordId', 'Assembly record', 'ref', { ref: 'flange_records' }), recordField('pass_number', 'Pass', 'number', { min: 1, max: 9, step: 1, required: true }),
    recordField('torque_nm', 'Measured torque (Nm)', 'number', { required: true }), recordField('stress_value', 'Measured stress', 'number'),
    recordField('tool_id', 'Tool ID', 'text', { required: true }), recordField('operator_name', 'Operator', 'text', { required: true }), recordField('performed_at', 'Performed at', 'text', { required: true }),
    recordField('target_nm', 'Target Moment (Nm)', 'number'), recordField('target_stress', 'Target Stress', 'number'), recordField('result', 'Result', 'select', { options: PASS_RESULTS, required: true }),
  ], ['pass_number', 'torque_nm', 'stress_value', 'performed_at', 'result']),
  resource('flange_bolts', 'Flange bolt measurements', 'bolt measurement', 'Optional bolt measurements of a recorded tightening pass.', [
    flangeRef, recordField('passId', 'Pass', 'ref', { ref: 'flange_passes', required: true }), recordField('bolt_no', 'Bolt no.', 'number', { min: 1, step: 1, required: true }),
    recordField('torque_nm', 'Measured torque (Nm)', 'number', { required: true }), recordField('stress_value', 'Measured stress', 'number', { required: true }),
    recordField('result', 'Result', 'select', { options: PASS_RESULTS, required: true }), recordField('deviation_reference', 'Deviation reference'), recordField('deviation_reason', 'Deviation reason', 'textarea'),
  ], ['bolt_no', 'torque_nm', 'stress_value', 'result']),
  resource('flange_leak_tests', 'Flange leak tests', 'leak test', 'Leak tests of a flange; the latest result counts for release.', [
    flangeRef, recordField('test_type', 'Type', 'text', { required: true }), recordField('pressure_value', 'Pressure'), recordField('pressure_unit', 'Unit'),
    recordField('result', 'Result', 'select', { options: LEAK_RESULTS, required: true }), recordField('tested_at', 'Tested at', 'text', { required: true }),
  ], ['test_type', 'result', 'tested_at']),
  resource('flange_labels', 'Flange labels', 'flange label', 'Physical labels and QR tokens registered on a flange.', [
    flangeRef, recordField('label_number', 'Label number', 'text', { required: true }), recordField('qr_token', 'QR token', 'text', { required: true }), recordField('scan_reference', 'Scan reference'),
  ], ['label_number', 'qr_token'], { unique: [['qr_token']] }),
  resource('flange_deviations', 'Flange deviations', 'deviation event', 'Deviations opened on a flange and their restorations.', [
    flangeRef, recordField('reference', 'Reference', 'text', { required: true }), recordField('reason', 'Reason', 'textarea', { required: true }),
    recordField('event', 'Event', 'select', { options: DEVIATION_EVENTS, required: true }), recordField('boltId', 'Bolt measurement', 'ref', { ref: 'flange_bolts' }),
  ], ['reference', 'event', 'reason']),
  resource('flange_signatures', 'Flange protocol signatures', 'protocol signature', 'Technician and QA/QC signatures of an assembly record, with their signature snapshot.', [
    flangeRef, recordField('recordId', 'Assembly record', 'ref', { ref: 'flange_records' }), recordField('role', 'Role', 'select', { options: [...SIGNATURE_ROLES], required: true }),
    recordField('method', 'Method', 'select', { options: [...SIGNATURE_METHODS], required: true }), recordField('userId', 'Signed by', 'ref', { ref: 'users' }), recordField('signer_name', 'Signer name', 'text', { required: true }),
    recordField('statement', 'Statement'), recordField('qc_note', 'QC note'), recordField('signed_date', 'Signing date', 'date'), recordField('reference', 'Document reference'),
    recordField('attachmentId', 'Signature file', 'ref', { ref: 'attachments' }),
  ], ['role', 'signer_name', 'method']),
  resource('flange_events', 'Flange workflow events', 'workflow event', 'Workflow actions on a flange (Assembled, Rejected, Released).', [
    flangeRef, recordField('to_status', 'Action', 'select', { options: [...WORKFLOW_ACTIONS], required: true }), recordField('reason', 'Reason', 'textarea'),
  ], ['to_status', 'reason']),
];
/** Permission area of the record types: the reference's Flanges area (100). */
export const FLANGE_RECORD_SCOPES: Record<string, string[]> = Object.fromEntries(FLANGE_RECORD_RESOURCES.map(item => [item.key, ['100']]));
/** Fields the protocol PDF attachment carries besides the generic ones: its SHA-256 and the record it was made for. */
export const FLANGE_ATTACHMENT_FIELDS: Field[] = [recordField('sha256', 'SHA-256', 'text', { hidden: true }), recordField('recordId', 'Assembly record', 'text', { hidden: true })];

/* ----------------------------------------------------------------------------------------------------------- rules */
const ofFlange = (rows: Row[] | undefined, flangeId: string) => (rows || []).filter(row => !row._archived && row.flangeId === flangeId);
/** Newest first by creation time, then id (rows created in one millisecond keep a stable order). */
const newest = (a: Row, b: Row) => String(b._createdAt).localeCompare(String(a._createdAt)) || String(b.id).localeCompare(String(a.id));
export const isDateTime = (value: unknown) => /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(value ?? '').trim()) && !Number.isNaN(Date.parse(String(value).trim()));
export const isTimeOfDay = (value: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim());
export const flangeNumber = numeric;

/** |measured − target| ≤ tolerance × target. A missing or non-positive target cannot be validated against. */
export function withinTolerance(measured: unknown, target: unknown, tolerance = FLANGE_TOLERANCE): boolean {
  const m = numeric(measured), t = numeric(target);
  return m !== null && t !== null && t > 0 && Math.abs(m - t) <= tolerance * t + 1e-9;
}
/** The master targets a pass or bolt is compared with: Target Moment (required) and Target Stress (when it is a number). */
export function flangeTargets(flange: Partial<Row> | Record<string, unknown>): { torque: number | null; stress: number | null } {
  const torque = numeric(flange.target_moment_nm), stress = numeric(flange.target_stress);
  return { torque: torque !== null && torque > 0 ? torque : null, stress: stress !== null && stress > 0 ? stress : null };
}
/** Whether a measured torque (and stress, when the master has a Target Stress) lies within ±5% of the master targets. */
export function passWithinTolerance(measurement: { torque_nm?: unknown; stress_value?: unknown }, flange: Partial<Row> | Record<string, unknown>): boolean {
  const target = flangeTargets(flange);
  if (target.torque === null || !withinTolerance(measurement.torque_nm, target.torque)) return false;
  return target.stress === null || withinTolerance(measurement.stress_value, target.stress);
}
export const boltWithinTolerance = passWithinTolerance;
/** A bolt number is a whole number from 1 to the master No of Studbolts. */
export function boltNumberValid(boltNo: unknown, flange: Partial<Row> | Record<string, unknown>): boolean {
  const n = numeric(boltNo), count = numeric(flange.aantal_studbolts);
  return n !== null && count !== null && Number.isInteger(n) && n >= 1 && n <= count;
}
const positiveNumber = (value: unknown) => { const n = numeric(value); return n !== null && n > 0; };
const filledText = (value: unknown) => String(value ?? '').trim() !== '';
const tooLong = (value: unknown, max: number) => String(value ?? '').trim().length > max;
const NO_TARGET = 'The flange has no Target Moment (Nm). Use Edit to complete the master data first.';

/** Measured stress is asked for only when the flange has a Target Stress to compare it with (SB2 N9-4). */
export const passStressRequired = (flange: Partial<Row> | Record<string, unknown>) => flangeTargets(flange).stress !== null;
/** "Validated tightening-pass registration": every input is required (reference), Measured stress only against a Target Stress. Returns field errors. */
export function passInputErrors(input: Record<string, unknown>, flange: Partial<Row> | Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const pass = numeric(input.pass_number);
  if (pass === null || !PASS_NUMBERS.includes(pass)) errors.pass_number = 'Choose Pass 1 to Pass 9.';
  if (!positiveNumber(input.torque_nm)) errors.torque_nm = 'Enter the measured torque (Nm), above 0.';
  if (passStressRequired(flange) || filledText(input.stress_value)) { if (!positiveNumber(input.stress_value)) errors.stress_value = 'Enter the measured stress, above 0.'; }
  if (!filledText(input.tool_id)) errors.tool_id = 'Tool ID is required.'; else if (tooLong(input.tool_id, 100)) errors.tool_id = 'Tool ID can be at most 100 characters.';
  if (!filledText(input.operator_name)) errors.operator_name = 'Operator is required.'; else if (tooLong(input.operator_name, 150)) errors.operator_name = 'Operator can be at most 150 characters.';
  if (!isDateTime(input.performed_at)) errors.performed_at = 'Enter the date and time the pass was performed.';
  if (flangeTargets(flange).torque === null) errors.torque_nm ??= NO_TARGET;
  return errors;
}
/** "Optional per-bolt registration": a recorded pass, a bolt number within the studbolt count and both measurements; a failed bolt needs a deviation. */
export function boltInputErrors(input: Record<string, unknown>, flange: Partial<Row> | Record<string, unknown>, passes: Row[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!passes.some(pass => pass.id === input.passId)) errors.passId = 'Choose a recorded tightening pass of this flange.';
  if (numeric(flange.aantal_studbolts) === null) errors.bolt_no = 'The flange has no No of Studbolts. Use Edit to complete the master data first.';
  else if (!boltNumberValid(input.bolt_no, flange)) errors.bolt_no = `Enter a bolt number from 1 to ${numeric(flange.aantal_studbolts)}.`;
  if (!positiveNumber(input.torque_nm)) errors.torque_nm = 'Enter the measured torque (Nm), above 0.';
  if (!positiveNumber(input.stress_value)) errors.stress_value = 'Enter the measured stress, above 0.';
  if (flangeTargets(flange).torque === null) errors.torque_nm ??= NO_TARGET;
  if (!Object.keys(errors).length && !passWithinTolerance(input, flange)) {
    if (!filledText(input.deviation_reference)) errors.deviation_reference = 'A failed bolt measurement needs a deviation reference.';
    if (!filledText(input.deviation_reason)) errors.deviation_reason = 'A failed bolt measurement needs a deviation reason.';
  }
  if (tooLong(input.deviation_reference, 100)) errors.deviation_reference = 'Deviation reference can be at most 100 characters.';
  if (tooLong(input.deviation_reason, 5000)) errors.deviation_reason = 'Deviation reason can be at most 5000 characters.';
  return errors;
}
export function leakTestInputErrors(input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!filledText(input.test_type)) errors.test_type = 'Type is required.'; else if (tooLong(input.test_type, 50)) errors.test_type = 'Type can be at most 50 characters.';
  if (tooLong(input.pressure_value, 50)) errors.pressure_value = 'Pressure can be at most 50 characters.';
  if (tooLong(input.pressure_unit, 20)) errors.pressure_unit = 'Unit can be at most 20 characters.';
  if (!LEAK_RESULTS.includes(String(input.result ?? ''))) errors.result = 'Choose Passed or Failed.';
  if (!isDateTime(input.tested_at)) errors.tested_at = 'Enter the date and time of the test.';
  return errors;
}
export function labelInputErrors(input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!filledText(input.label_number)) errors.label_number = 'Label number is required.'; else if (tooLong(input.label_number, 100)) errors.label_number = 'Label number can be at most 100 characters.';
  if (!filledText(input.qr_token)) errors.qr_token = 'QR token is required.'; else if (tooLong(input.qr_token, 128)) errors.qr_token = 'QR token can be at most 128 characters.';
  if (tooLong(input.scan_reference, 255)) errors.scan_reference = 'Scan reference can be at most 255 characters.';
  return errors;
}
export function deviationInputErrors(input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!filledText(input.reference)) errors.reference = 'Reference is required.'; else if (tooLong(input.reference, 100)) errors.reference = 'Reference can be at most 100 characters.';
  if (!filledText(input.reason)) errors.reason = 'Reason is required.'; else if (tooLong(input.reason, 5000)) errors.reason = 'Reason can be at most 5000 characters.';
  return errors;
}
/** Errors of a record save: lengths, numbers of the passes and alignment, times as HH:MM. */
export function recordInputErrors(input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, max] of Object.entries(RECORD_MAX_LENGTH)) if (tooLong(input[name], max)) errors[name] = `At most ${max} characters.`;
  for (const n of RECORD_PASS_ROWS) for (const name of [`pass${n}_target`, `pass${n}_actual`]) if (filledText(input[name]) && numeric(input[name]) === null) errors[name] = 'Enter a number.';
  for (const n of ALIGNMENT_POINTS) for (const name of [`alignment_before_${n}`, `alignment_after_${n}`]) if (filledText(input[name]) && numeric(input[name]) === null) errors[name] = 'Enter a number in mm.';
  for (const [key] of FLANGE_COMPLETION_CHECKS) if (filledText(input[`${key}_time`]) && !isTimeOfDay(input[`${key}_time`])) errors[`${key}_time`] = 'Enter the time as HH:MM.';
  return errors;
}
/** |after − before| in mm to 3 decimals, or null when a value is missing (reference "Difference (mm)"). */
export function alignmentDifference(before: unknown, after: unknown): number | null {
  const b = numeric(before), a = numeric(after);
  return b === null || a === null ? null : Math.round(Math.abs(a - b) * 1000) / 1000;
}
/** The four completion checks each have a date and a time. */
export const completionChecksDone = (record: Partial<Row> | Record<string, unknown> | undefined) => Boolean(record) && FLANGE_COMPLETION_CHECKS.every(([key]) => filledText(record![`${key}_date`]) && isTimeOfDay(record![`${key}_time`]));

/**
 * What is still missing for "Complete protocol and checklist", as the sentence the gate shows, or '' when complete:
 * a saved record with every preparation control and checklist item ticked, LMRA confirmed, the assembly data and the fields
 * of the chosen tightening method, the four completion checks, the installer, and all four alignment points (a difference
 * above 2 mm needs a deviation reference).
 */
export function protocolMissing(record: Partial<Row> | Record<string, unknown> | undefined): string {
  if (!record) return 'No assembly record has been saved yet.';
  if (!FLANGE_PREPARATION_CONTROLS.every(([key]) => record[`check_${key}`] === true)) return 'Tick every preparation and inspection control.';
  if (!filledText(record.assembly_date) || !filledText(record.tightening_method) || !filledText(record.tool_id) || !filledText(record.operator_name)) return 'Enter Assembly date, Tightening method, Tool ID and Operator.';
  if (!(METHOD_FIELDS[String(record.tightening_method)] || []).every(name => filledText(record[name]))) return 'Enter the fields of the chosen tightening method.';
  if (record.lmra_confirmed !== true) return 'Confirm that the LMRA was completed before assembly.';
  if (!completionChecksDone(record)) return 'Enter the date and time of every completion check.';
  if (!FLANGE_ASSEMBLY_CHECKLIST.every(([key]) => record[`checklist_${key}`] === true)) return 'Tick every item of the assembly checklist.';
  if (!filledText(record.installer_name) || !filledText(record.installer_initials)) return 'Enter Installer name and Installer initials.';
  const differences = ALIGNMENT_POINTS.map(n => alignmentDifference(record[`alignment_before_${n}`], record[`alignment_after_${n}`]));
  if (differences.some(value => value === null)) return 'Enter the alignment before and after for all four points.';
  if (differences.some(value => value! > ALIGNMENT_MAX_MM) && !filledText(record.deviation_reference)) return `An alignment difference is above ${ALIGNMENT_MAX_MM} mm: enter a deviation reference.`;
  return '';
}

/** The latest saved assembly record of a flange. */
export const latestRecord = (records: Row[] | undefined, flangeId: string): Row | undefined => ofFlange(records, flangeId).sort(newest)[0];
/** Leak tests newest first: by Tested at, then by when they were recorded. */
export const leakTestsNewestFirst = (tests: Row[] | undefined, flangeId: string) => ofFlange(tests, flangeId).sort((a, b) => String(b.tested_at).localeCompare(String(a.tested_at)) || newest(a, b));
/** Only a latest result of Passed passes the release gate (manual). */
export const latestLeakTestPassed = (tests: Row[] | undefined, flangeId: string) => leakTestsNewestFirst(tests, flangeId)[0]?.result === 'Passed';
/** References of the deviations that are open: opened, and not restored after their latest opening. */
export function openDeviations(events: Row[] | undefined, flangeId: string): string[] {
  const state = new Map<string, boolean>();
  for (const event of ofFlange(events, flangeId).sort((a, b) => newest(b, a))) state.set(String(event.reference).trim(), event.event === 'Opened');
  return [...state].filter(([, open]) => open).map(([reference]) => reference);
}
/** The deciding pass: the highest pass number recorded, and of it the latest registration. */
export const finalPass = (passes: Row[] | undefined, flangeId: string): Row | undefined =>
  ofFlange(passes, flangeId).sort((a, b) => (numeric(b.pass_number) ?? 0) - (numeric(a.pass_number) ?? 0) || String(b.performed_at).localeCompare(String(a.performed_at)) || newest(a, b))[0];
/** The signatures that apply: those made for the given (latest) record, the newest per role, digital ones only (a hard copy is evidence, not a signature, until QA/QC validates it). */
export function recordSignatures(signatures: Row[] | undefined, recordId: string | undefined): Partial<Record<SignatureRole, Row>> {
  const out: Partial<Record<SignatureRole, Row>> = {};
  if (!recordId) return out;
  for (const row of (signatures || []).filter(item => !item._archived && item.recordId === recordId && item.method !== 'Signed hard-copy').sort(newest)) out[row.role as SignatureRole] ??= row;
  return out;
}
/** The registered protocol PDF of a record: the flange's protocol attachment made for that record with a stored hash. */
/**
 * A moment of the flange record as "YYYY-MM-DD HH:MM" in local time (SB2 N9-3): a stored instant (`_createdAt`, ISO with a
 * zone) is converted to the local clock, as the PDF footer (server time) and the typed date-times (Performed at, Tested at)
 * already are; a typed local date-time is shown as typed.
 */
export function flangeMoment(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(raw)) return raw.replace('T', ' ').slice(0, 16);
  const date = new Date(raw); if (Number.isNaN(date.getTime())) return raw.replace('T', ' ').slice(0, 16);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
export const registeredPdf = (attachments: Row[] | undefined, flangeId: string, recordId: string | undefined): Row | undefined =>
  recordId ? (attachments || []).filter(file => !file._archived && file.entityType === 'flanges' && file.entityId === flangeId && file.documentType === FLANGE_PROTOCOL_DOCUMENT && file.recordId === recordId && /^[0-9a-f]{64}$/.test(String(file.sha256 ?? ''))).sort(newest)[0] : undefined;
/** Whether stored bytes still match their registered SHA-256 (hex). */
export const recordPdfHashMatches = (stored: unknown, actual: string) => /^[0-9a-f]{64}$/.test(String(stored ?? '')) && String(stored) === actual;

export const GATE_LABELS = ['Passed mandatory leak test', 'Complete protocol and checklist', 'QC sign-off', 'Registered protocol PDF', 'Validated tightening pass within tolerance', 'No open deviations'] as const;
export interface GateCheck { label: typeof GATE_LABELS[number]; ok: boolean; reason: string }
export interface FlangeRecordRows { flange_records?: Row[]; flange_passes?: Row[]; flange_leak_tests?: Row[]; flange_deviations?: Row[]; flange_signatures?: Row[]; attachments?: Row[] }
/**
 * The release gate in the reference order. `pdfIntact` is the server's hash check of the registered PDF (the page, which
 * cannot read the file, passes true). "QC sign-off" needs both signatures of the latest record (QA/QC signs after the
 * technician). Every check says why it is not met.
 */
export function releaseGate(rows: FlangeRecordRows, flangeId: string, pdfIntact = true): GateCheck[] {
  const record = latestRecord(rows.flange_records, flangeId);
  const leak = leakTestsNewestFirst(rows.flange_leak_tests, flangeId)[0];
  const signed = recordSignatures(rows.flange_signatures, record?.id);
  const pdf = registeredPdf(rows.attachments, flangeId, record?.id);
  const pass = finalPass(rows.flange_passes, flangeId);
  const open = openDeviations(rows.flange_deviations, flangeId);
  const missing = protocolMissing(record);
  return [
    { label: GATE_LABELS[0], ok: leak?.result === 'Passed', reason: !leak ? 'No leak test has been recorded.' : leak.result === 'Passed' ? '' : 'The latest leak test failed.' },
    { label: GATE_LABELS[1], ok: !missing, reason: missing },
    { label: GATE_LABELS[2], ok: Boolean(signed.Technician && signed['QA/QC']), reason: !record ? 'Save the assembly record first.' : !signed.Technician ? 'The technician has not signed the latest record.' : !signed['QA/QC'] ? 'QA/QC has not signed the latest record.' : '' },
    { label: GATE_LABELS[3], ok: Boolean(pdf) && pdfIntact, reason: !pdf ? 'Generate the immutable protocol PDF after the QA/QC sign-off.' : pdfIntact ? '' : 'The registered protocol PDF does not match its stored hash.' },
    { label: GATE_LABELS[4], ok: pass?.result === 'OK', reason: !pass ? 'No tightening pass has been recorded.' : pass.result === 'OK' ? '' : `Pass ${pass.pass_number} is outside the ±5% tolerance.` },
    { label: GATE_LABELS[5], ok: !open.length, reason: open.length ? `Open deviation${open.length === 1 ? '' : 's'}: ${open.join(', ')}.` : '' },
  ];
}
export const gateOpen = (checks: GateCheck[]) => checks.every(check => check.ok);
/** The sentence a refused release answers with: the first check that is not met. */
export const gateRefusal = (checks: GateCheck[]) => { const failed = checks.find(check => !check.ok); return failed ? `Release is not possible yet: ${failed.label}. ${failed.reason}`.trim() : ''; };

/** Read-only cards of the detail page, in the reference order and wording. */
export const FLANGE_DETAIL_CARDS: { title: string; rows: [label: string, value: (item: FlangeItem) => string][] }[] = [
  { title: 'Overview', rows: [['Project', item => item.projectName], ['Iso number', item => item.isoNo], ['Flange ID', item => String(item.row.flange_id ?? '')], ['IRN', item => String(item.row.irnno ?? '')], ['Criticality', item => String(item.row.criticality ?? '')], ['Status', item => item.status]] },
  { title: 'Piping', rows: [['P&ID', item => String(item.row.pid ?? '')], ['Asset tag', item => flangeAssetTag(item.row)], ['Fluid Code', item => String(item.row.fluid_code ?? '')], ['Area/Unit', item => String(item.row.area_unit ?? '')], ['Pipe Class', item => String(item.row.pipe_class ?? '')], ['Location', item => String(item.row.location ?? '')]] },
  { title: 'Flange Size', rows: [['Flange Size', item => String(item.row.flange_size ?? '')], ['Flange Rating', item => String(item.row.flange_rating ?? '')], ['Flange Type', item => String(item.row.flange_type ?? '')], ['Flange Rate & Size', item => String(item.row.flange_rate_size ?? '')], ['Gasket Type', item => String(item.row.gasket_type ?? '')], ['Gasket Material', item => String(item.row.gasket_material ?? '')]] },
  { title: 'Bolting & torque', rows: [['Studbolt Size', item => String(item.row.studbolt_afmeting ?? '')], ['Studbolt Diameter', item => String(item.row.stud_dia ?? '')], ['No of Studbolts', item => String(item.row.aantal_studbolts ?? '')], ['Material of Studbolts', item => String(item.row.matl_studbolts ?? '')], ['Material of Nut', item => String(item.row.materiaal_moer ?? '')], ['Target Moment (Nm)', item => String(item.row.target_moment_nm ?? '')], ['Target Stress', item => String(item.row.target_stress ?? '')], ['Lubricant Used', item => String(item.row.lubricant_used ?? '')], ['Tightening standard', item => item.standard]] },
  { title: 'Operating conditions', rows: [['Operating Pressure', item => String(item.row.operatingPressure ?? '')], ['Operating Temperature', item => String(item.row.operatingTemp ?? '')], ['Test pressure', item => String(item.row.testPressure ?? '')], ['Note', item => String(item.row.note ?? '')]] },
];
/** Whether a master field shown on the cards is empty (the page then shows the missing master data bar). */
export const flangeMissingMasterData = (item: FlangeItem) => FLANGE_DETAIL_CARDS.some(card => card.rows.some(([, value]) => !value(item).trim()));

/**
 * "BOM/isometric validation" preview: for each empty flange field the linked isometric can fill, a proposal with its source.
 * Preview only: nothing is written. Our isometric holds pipe class and test pressure; the BOM holds no gasket or bolting data.
 */
export function flangeValidationProposals(flange: Partial<Row> | Record<string, unknown>, iso: Partial<Row> | Record<string, unknown> | undefined): { field: string; label: string; proposal: string; source: string }[] {
  if (!iso) return [];
  const source = `Isometric ${String(iso.isoNo ?? '').trim()}`.trim();
  return ([['pipe_class', 'Pipe class', 'pipingClass'], ['testPressure', 'Test pressure', 'testPressure']] as const)
    .filter(([field, , from]) => !filledText(flange[field]) && filledText(iso[from]))
    .map(([field, label, from]) => ({ field, label, proposal: String(iso[from]).trim(), source }));
}
/** Workflow actions offered in the select: Assembled and Rejected; Released only once the gate is open. */
export const workflowOptions = (gate: GateCheck[]): string[] => gateOpen(gate) ? [...WORKFLOW_ACTIONS] : WORKFLOW_ACTIONS.filter(action => action !== 'Released');
export function workflowInputErrors(input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(WORKFLOW_ACTIONS as readonly string[]).includes(String(input.to_status ?? ''))) errors.to_status = 'Choose an action.';
  if (tooLong(input.reason, 5000)) errors.reason = 'Reason can be at most 5000 characters.';
  else if (input.to_status === 'Rejected' && !filledText(input.reason)) errors.reason = 'Enter the reason for the rejection.';
  return errors;
}
/** Hard-copy evidence of a signed paper protocol (Documents): role, signer, date, reference and a PDF or image. */
export function hardcopyInputErrors(input: Record<string, unknown>, fileName: string | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(SIGNATURE_ROLES as readonly string[]).includes(String(input.signer_role ?? ''))) errors.signer_role = 'Choose Technician or QA/QC.';
  if (!filledText(input.signer_name)) errors.signer_name = 'Signer name is required.'; else if (tooLong(input.signer_name, 150)) errors.signer_name = 'Signer name can be at most 150 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.signed_date ?? '').trim())) errors.signed_date = 'Signing date is required.';
  if (!filledText(input.reference)) errors.reference = 'Document reference is required.'; else if (tooLong(input.reference, 100)) errors.reference = 'Document reference can be at most 100 characters.';
  if (!fileName) errors.hard_copy_file = 'Choose the signed protocol file.'; else if (!FLANGE_HARDCOPY_TYPES.test(fileName)) errors.hard_copy_file = 'Choose a PDF, JPEG, PNG or WebP file.';
  return errors;
}
/** The files the Documents dialog lists: the flange's attachments, oldest first (signature snapshots belong to the signatures). */
export const flangeDocuments = (attachments: Row[] | undefined, flangeId: string) => (attachments || []).filter(file => !file._archived && file.entityType === 'flanges' && file.entityId === flangeId && file.documentType !== FLANGE_SIGNATURE_DOCUMENT).sort((a, b) => newest(b, a));
/** Why a file of the Documents dialog cannot be deleted, or '' (the registered PDF and signed evidence are kept). */
export const flangeDocumentDeleteRefusal = (file: Row) => file.documentType === FLANGE_PROTOCOL_DOCUMENT ? 'The registered protocol PDF cannot be deleted.' : file.documentType === FLANGE_HARDCOPY_DOCUMENT ? 'Signed hard-copy evidence cannot be deleted.' : '';
