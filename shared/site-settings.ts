/**
 * Settings stored on a project site (hosted: "main project"). This module only stores, validates and exposes
 * them; the rules they drive (mandatory weld fields, WPS validation, certificate scoping, defect codes,
 * progress calculation) are enforced by later tasks through the accessors below.
 */
type SiteLike = Record<string, unknown> | undefined | null;

export const FLANGE_STANDARDS = ['No catalog (free entry)', 'ASME B16.5 torque table (2012)', 'Gasunie CSW-43 table B'];
export const MATERIAL_DISPLAYS = ['Materials added to isometrics', 'Pick-list status'];
export const DEFECT_NORMS = ['No norm selected', 'ISO 6520-1', 'ASME B31.3', 'API 1104'];
export const NDT_MEASUREMENTS = ['Inch-weighted', 'Per weld'];
export const RELEASE_DOC_DRAWINGS = ['Drawing no + iso', 'Prefix + iso'];
/** Used by the weld dashboard KPI when a site leaves the repair performance limit empty. */
export const DEFAULT_REPAIR_PERFORMANCE_LIMIT = 5;

export type PhaseKey = 'shop' | 'field' | 'site';
export interface ProgressActivity { key: string; field: string; label: string; }
export interface ProgressPhase { key: PhaseKey; field: string; label: string; activities: ProgressActivity[]; }
const activity = (phase: PhaseKey, key: string, label: string): ProgressActivity => ({ key, label, field: `${phase}${key[0].toUpperCase()}${key.slice(1)}` });
/** Phases and activities in the order of the reference. Field names are `weightShop`, `shopWelds`, `fieldPunch`, … */
export const PROGRESS_PHASES: ProgressPhase[] = [
  { key: 'shop', field: 'weightShop', label: 'Shop', activities: [activity('shop', 'welds', 'Welds'), activity('shop', 'ndt', 'NDT'), activity('shop', 'materialPipe', 'Material pipe'), activity('shop', 'supports', 'Supports'), activity('shop', 'appendages', 'Appendages')] },
  { key: 'field', field: 'weightField', label: 'Field', activities: [activity('field', 'materialPipe', 'Material pipe'), activity('field', 'welds', 'Welds'), activity('field', 'ndt', 'NDT'), activity('field', 'supports', 'Supports'), activity('field', 'appendages', 'Appendages'), activity('field', 'punch', 'Punch')] },
  { key: 'site', field: 'weightSite', label: 'Site', activities: [activity('site', 'hydrotest', 'Hydrotest'), activity('site', 'paintTracing', 'Paint/Tracing')] },
];
export const PROGRESS_FIELDS = PROGRESS_PHASES.flatMap(phase => [phase.field, ...phase.activities.map(a => a.field)]);

const flag = (site: SiteLike, name: string) => site?.[name] === true;
const text = (site: SiteLike, name: string) => typeof site?.[name] === 'string' ? String(site[name]).trim() : '';
/** A stored weight: null when the field is empty or not a number. */
const weight = (site: SiteLike, name: string): number | null => {
  const value = site?.[name];
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Project settings: "Mandatory fields". Weld and certificate forms require their reference fields when true. */
export const mandatoryFields = (site: SiteLike) => flag(site, 'mandatoryFields');
/** "Validation on WPS": a welder whose qualification does not match the weld's WPS cannot be assigned. */
export const wpsValidation = (site: SiteLike) => flag(site, 'wpsValidation');
/** "Project-specific Material Certificates": only certificates linked to the project are offered and printed. */
export const projectCertificates = (site: SiteLike) => flag(site, 'projectCertificates');
export const flangeStandard = (site: SiteLike) => FLANGE_STANDARDS.find(option => option === text(site, 'flangeStandard')) || FLANGE_STANDARDS[0];
export const materialDisplay = (site: SiteLike): 'isometric' | 'pick-list' => text(site, 'materialDisplay') === MATERIAL_DISPLAYS[1] ? 'pick-list' : 'isometric';
/** The chosen defect norm, or null when none is selected. */
export const defectNorm = (site: SiteLike): string | null => { const value = text(site, 'defectNorm'); return DEFECT_NORMS.slice(1).includes(value) ? value : null; };
/** Repair performance limit in percent; an empty value means 5. */
export const repairPerformanceLimit = (site: SiteLike) => weight(site, 'repairLimit') ?? DEFAULT_REPAIR_PERFORMANCE_LIMIT;
export const ndtMeasurement = (site: SiteLike): 'inch-weighted' | 'per-weld' => text(site, 'ndtMeasurement') === NDT_MEASUREMENTS[1] ? 'per-weld' : 'inch-weighted';

export interface ProgressWeights {
  /** False while no weight has been entered; progress is then not weighted yet. */
  configured: boolean;
  phases: Record<PhaseKey, number>;
  /** Activity weights inside each phase, in percent of that phase. */
  activities: Record<PhaseKey, Record<string, number>>;
}
export function progressWeights(site: SiteLike): ProgressWeights {
  const phases = {} as Record<PhaseKey, number>, activities = {} as Record<PhaseKey, Record<string, number>>;
  for (const phase of PROGRESS_PHASES) {
    phases[phase.key] = weight(site, phase.field) ?? 0;
    activities[phase.key] = Object.fromEntries(phase.activities.map(a => [a.key, weight(site, a.field) ?? 0]));
  }
  return { configured: PROGRESS_FIELDS.some(name => weight(site, name) !== null), phases, activities };
}

/** Running totals shown in the form and used by the validation. */
export function progressTotals(site: SiteLike) {
  const sum = (names: string[]) => names.reduce((total, name) => total + (weight(site, name) ?? 0), 0);
  return {
    phases: sum(PROGRESS_PHASES.map(phase => phase.field)),
    activities: Object.fromEntries(PROGRESS_PHASES.map(phase => [phase.key, sum(phase.activities.map(a => a.field))])) as Record<PhaseKey, number>,
  };
}

export interface ProgressValidation { valid: boolean; message: string; fields: Record<string, string>; }
/**
 * All-empty is valid (weights not configured yet). Once any weight is entered the three phases must total 100,
 * and every phase with a weight above 0 needs activity weights that total 100. Site activities therefore only
 * count when Site is above 0. Weights are whole percentages from 0 to 100.
 */
export function validateProgressWeights(site: SiteLike): ProgressValidation {
  const fields: Record<string, string> = {}, issues: string[] = [];
  for (const phase of PROGRESS_PHASES) for (const [name, label] of [[phase.field, `${phase.label} phase`], ...phase.activities.map(a => [a.field, `${phase.label} · ${a.label}`])]) {
    const value = weight(site, name);
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) fields[name] = `${label} must be a whole number from 0 to 100.`;
  }
  if (Object.keys(fields).length) return { valid: false, message: 'Progress weights must be whole numbers from 0 to 100.', fields };
  const weights = progressWeights(site);
  if (!weights.configured) return { valid: true, message: '', fields };
  const totals = progressTotals(site);
  if (totals.phases !== 100) {
    const message = `Shop, Field and Site must total 100% (now ${totals.phases}%).`;
    issues.push(message); for (const phase of PROGRESS_PHASES) fields[phase.field] = message;
  }
  for (const phase of PROGRESS_PHASES) {
    if (weights.phases[phase.key] <= 0 || totals.activities[phase.key] === 100) continue;
    const message = `${phase.label} activities must total 100% (now ${totals.activities[phase.key]}%).`;
    issues.push(message); for (const a of phase.activities) fields[a.field] = message;
  }
  return { valid: issues.length === 0, message: issues.join(' '), fields };
}
