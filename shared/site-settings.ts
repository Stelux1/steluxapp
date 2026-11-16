/**
 * Settings stored on a project site (hosted: "main project"). This module only stores, validates and exposes
 * them; the rules they drive (mandatory weld fields, WPS validation, certificate scoping, defect codes,
 * progress calculation) are enforced by later tasks through the accessors below.
 */
type SiteLike = Record<string, unknown> | undefined | null;

export const FLANGE_STANDARDS = ['No catalog (free entry)', 'ASME B16.5 torque table (2012)', 'Gasunie CSW-43 table B'];
export const DEFECT_NORMS = ['No norm selected', 'ISO 6520-1', 'ASME B31.3', 'API 1104'];
export const NDT_MEASUREMENTS = ['Inch-weighted', 'Per weld'];
export const RELEASE_DOC_DRAWINGS = ['Drawing no + iso', 'Prefix + iso'];
/** The NDT standards a LISL [ISS] sheet can tick. */
export const ISS_NDT_STANDARDS = ['ASME', 'EN ISO'];
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
/**
 * "Material Management Display Setting" (check box, unticked by default): ticked, the M indicator of the isometrics list
 * lights up once materials are added to an isometric; unticked, once a pick list exists (shared/iso-list.ts). Only the
 * check box `materialManagementDisplay` is read: a value of the earlier select (`materialDisplay`) reads as unticked.
 */
export const materialManagementDisplay = (site: SiteLike) => flag(site, 'materialManagementDisplay');
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

/**
 * Which running sums of the hosted form count as OK (green): the phases and the Shop and Field activities at exactly 100;
 * the Site activities also while the Site phase is 0 (reference paint(): a Site phase of 0 excuses them, as in the validation below).
 */
export function progressSumsOk(site: SiteLike) {
  const totals = progressTotals(site), weights = progressWeights(site);
  return { phases: totals.phases === 100, activities: Object.fromEntries(PROGRESS_PHASES.map(phase => [phase.key, totals.activities[phase.key] === 100 || (phase.key === 'site' && weights.phases.site <= 0)])) as Record<PhaseKey, boolean> };
}

export interface ProgressValidation { valid: boolean; message: string; fields: Record<string, string>; }
/**
 * All-empty is valid (weights never entered: records written before the weights existed, or without them). Once any
 * weight is entered the three phases must total 100, and the Shop and Field activities each total 100 whatever the
 * phase weight is. Only Site is excused: its activities count when the Site phase is above 0 (reference: "Site
 * activities are required only when the Site phase is greater than 0"). Weights are whole percentages from 0 to 100.
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
    if (phase.key === 'site' && weights.phases.site <= 0) continue;
    if (totals.activities[phase.key] === 100) continue;
    const message = `${phase.label} activities must total 100% (now ${totals.activities[phase.key]}%).`;
    issues.push(message); for (const a of phase.activities) fields[a.field] = message;
  }
  return { valid: issues.length === 0, message: issues.join(' '), fields };
}

// ----- the main project form of the hosted profile (reference "Add project site") -------------------------------------
/** Label of a weight field in the reference: "Distribution - Shop", "Welds - Shop", … and, for the Site phase, "Hydrotest" / "Paint/Tracing". */
export const progressLabel = (phase: ProgressPhase, activityKey?: string) => {
  if (!activityKey) return `Distribution - ${phase.label}`;
  const found = phase.activities.find(a => a.key === activityKey)!;
  return phase.key === 'site' ? found.label : `${found.label} - ${phase.label}`;
};
/** What a new main project starts with: Shop 50, Field 50, Site 0 and every activity 0. */
export const PROGRESS_DEFAULTS: Record<string, number> = Object.fromEntries(PROGRESS_PHASES.flatMap(phase => [[phase.field, phase.key === 'site' ? 0 : 50], ...phase.activities.map(a => [a.field, 0])]));
const SITE_FORM_SECTION = 'Project settings';
const SITE_CONTACT_LABELS: Record<string, string> = { name: 'Name', address: 'Address', zip: 'Zip code', residence: 'Residence', phone: 'Phone', email: 'Email address' };
export const NDT_MEASUREMENT_HINTS: Record<string, string> = {
  [NDT_MEASUREMENTS[0]]: 'A DN500 weld counts more than a DN15 weld.',
  [NDT_MEASUREMENTS[1]]: '10 welds with NDT required, 1 Accepted = 10% of the NDT weight.',
};
interface SiteFormField { name: string; label: string; section?: string; default?: unknown; options?: string[]; control?: 'radio'; optionHints?: Record<string, string>; intro?: string; hint?: string }
/**
 * Document settings of the hosted main project form in the order, grouping and wording of the reference ("Add project
 * site", tab Document settings). A group heading is the `intro` line above its first field. Our owner-specific LISL form
 * settings follow under their own heading.
 */
export const HOSTED_DOCUMENT_SETTINGS: { name: string; label: string; intro?: string; hint?: string }[] = [
  { name: 'prefix', label: 'Prefix' }, { name: 'releaseDocDrawing', label: 'Release doc drawing no' },
  { name: 'hydrotestPlan', label: 'Hydrotest Execution Plan', hint: 'Printed on every Pressure Test Plan of this main project.' },
  { name: 'flangeProcedureNo', label: 'Flange procedure No.' },
  { name: 'signSubQaqc', label: 'Subcontractor QA/QC', intro: 'Signature titles of the Pressure Test Plan' },
  { name: 'signSubConstruction', label: 'Subcontractor Construction' }, { name: 'signPrincipalUi', label: 'Principal UI' },
  { name: 'signContractorQaqc', label: 'Contractor QA/QC' }, { name: 'signContractorConstruction', label: 'Contractor Construction' }, { name: 'signNobo', label: 'NoBo' },
  { name: 'vtDocNo', label: 'Doc.No. & Rev.No.', intro: 'Visual Inspection' }, { name: 'vtProcedureNo', label: 'Procedure No.' },
  { name: 'vt2Enabled', label: 'Visual Inspection Ver 2', intro: 'Visual Inspection V2' },
  { name: 'vtType2No', label: 'VT type 2 no:' }, { name: 'vtType2Rev', label: 'VT type 2 rev:' }, { name: 'vtType2Date', label: 'VT type 2 date:' }, { name: 'vtType2OrderNo', label: 'VT type 2 order No:' }, { name: 'vt2Prefix', label: 'VT 2 prefix:' },
  { name: 'lislField1', label: 'Field 1:', intro: 'LISL A3/A4', hint: 'First acceptance line, e.g. the company name.' }, { name: 'lislField2', label: 'Field 2:', hint: 'Second acceptance line, e.g. the client.' }, { name: 'lislField3', label: 'Field 3:', hint: 'Third acceptance line, e.g. NoBo.' },
  { name: 'lislGuField1', label: 'Field 1:', intro: 'LISL GU/MV', hint: 'First signature group, e.g. the contractor or supplier.' }, { name: 'lislGuField2', label: 'Field 2:', hint: 'Second signature group, e.g. the client.' }, { name: 'lislGuField3', label: 'Field 3:', hint: 'Third signature group, e.g. NoBo.' },
  { name: 'lislDocNo', label: 'Doc.No. & Rev.No.' }, { name: 'lislProcedureNo', label: 'Procedure No.' },
];
/** Heading above our own document settings (owner-specific LISL forms), placed after the reference ones. */
export const OWNER_SETTINGS_HEADING = 'Owner-specific LISL forms';
/**
 * The fields of the main project form as the hosted profile shows them (reference "Add project site"): name and address
 * data inside the first section "Project settings" with the reference labels, "Repair performance", NDT measurement as
 * two radio buttons, and the Iso progress weights phase by phase ("Distribution - Shop", its activities, "Distribution -
 * Field", …) starting at Shop 50 / Field 50 / Site 0. Other profiles keep the shared definitions.
 */
export function hostedSiteFields<T extends SiteFormField>(fields: T[]): T[] {
  const progress = new Set(PROGRESS_FIELDS);
  const documentSettings = new Map(HOSTED_DOCUMENT_SETTINGS.map(setting => [setting.name, setting]));
  let firstOwner = '';
  const adapted = fields.map(field => {
    if (SITE_CONTACT_LABELS[field.name]) return { ...field, label: SITE_CONTACT_LABELS[field.name], section: SITE_FORM_SECTION };
    if (field.name === 'repairLimit') return { ...field, label: 'Repair performance' };
    const document = documentSettings.get(field.name);
    if (document) return { ...field, label: document.label, ...(document.intro ? { intro: document.intro } : {}), ...(document.hint ? { hint: document.hint } : {}) };
    if (field.section === 'Document settings' && !firstOwner) { firstOwner = field.name; return { ...field, intro: OWNER_SETTINGS_HEADING }; }
    if (field.name === 'ndtMeasurement') return { ...field, control: 'radio' as const, optionHints: NDT_MEASUREMENT_HINTS, default: NDT_MEASUREMENTS[0] };
    if (progress.has(field.name)) {
      const phase = PROGRESS_PHASES.find(item => item.field === field.name || item.activities.some(a => a.field === field.name))!;
      const activityKey = phase.activities.find(a => a.field === field.name)?.key;
      return { ...field, label: progressLabel(phase, activityKey), default: PROGRESS_DEFAULTS[field.name] };
    }
    return field;
  });
  // Iso progress in the reference order: each phase's distribution, then its activities.
  const byName = new Map(adapted.map(field => [field.name, field]));
  const ordered = PROGRESS_PHASES.flatMap(phase => [phase.field, ...phase.activities.map(a => a.field)]).map(name => byName.get(name)).filter((field): field is T => Boolean(field));
  const slots = adapted.flatMap((field, index) => progress.has(field.name) ? [index] : []);
  const result = [...adapted]; slots.forEach((slot, i) => { result[slot] = ordered[i]; });
  return result;
}

// ----- owner-specific LISL forms ([GU], [MV], [GU Rev 2 / Rev 3]) -----------------------------------------------------
/**
 * Texts of the owner-specific LISL forms that name a third party, a specification or a form number. They are never
 * hard-coded: a line is printed only when its setting (section "Document settings" of the main project) is filled in.
 * [GU] and [MV] print the reference "LISL GU/MV" settings (signature groups, Doc.No. & Rev.No., Procedure No.); every other setting is listed here.
 */
export type OwnerFormFamily = 'gu' | 'mv' | 'rev';
export interface OwnerFormSetting { name: string; label: string; hint: string; type?: 'date' }
export const OWNER_FORM_SETTINGS: OwnerFormSetting[] = [
  { name: 'lislGuSpec1', label: 'LISL [GU] specification line 1', hint: 'Left of the second frame of the LISL [GU] report, e.g. the specification the welds were made to.' },
  { name: 'lislGuSpec2', label: 'LISL [GU] specification line 2', hint: 'Second free line of the LISL [GU] report, e.g. a marking statement.' },
  { name: 'lislMvDocNo', label: 'LISL [MV] Doc.No.', hint: 'Printed as Doc. on the LISL [MV] report.' },
  { name: 'lislMvVersion', label: 'LISL [MV] Version', hint: 'Printed as Version on the LISL [MV] report.' },
  { name: 'lislMvDate', label: 'LISL [MV] Date', hint: 'Printed as Date on the LISL [MV] report.', type: 'date' },
  { name: 'lislMvSpec1', label: 'LISL [MV] specification line 1', hint: 'Left of the second frame of the LISL [MV] report.' },
  { name: 'lislMvSpec2', label: 'LISL [MV] specification line 2', hint: 'Second free line of the LISL [MV] report.' },
  { name: 'lislRevOwnerLine', label: 'LISL [GU Rev 2 / Rev 3] standard line', hint: 'The owner standard line at the top left of the LISL [GU Rev 2] and [GU Rev 3] reports.' },
  { name: 'lislRevDocNo', label: 'LISL [GU Rev 2 / Rev 3] Doc.No.', hint: 'Printed as Doc. on the LISL [GU Rev 2] and [GU Rev 3] reports.' },
  { name: 'lislRevVersion', label: 'LISL [GU Rev 2 / Rev 3] Version', hint: 'Printed as Version on the LISL [GU Rev 2] and [GU Rev 3] reports.' },
  { name: 'lislRevDate', label: 'LISL [GU Rev 2 / Rev 3] Date', hint: 'Printed as Date on the LISL [GU Rev 2] and [GU Rev 3] reports.', type: 'date' },
];
export interface OwnerFormTexts {
  ownerLine: string; docNo: string; version: string; date: string; specLines: string[];
  /** "Procedure No." of LISL GU/MV ([GU] and [MV] only). */
  procedureNo: string;
  /** Titles of the three signature groups from "LISL GU/MV" Field 1 to 3; empty where not set (the form then uses its own). */
  parties: [string, string, string];
}
const FORM_FIELDS: Record<OwnerFormFamily, { ownerLine?: string; docNo: string[]; version?: string; date?: string; specLines: string[]; guMv: boolean }> = {
  // Reference "LISL GU/MV": Field 1 to 3 are the signature groups, Doc.No. & Rev.No. and Procedure No. the document lines.
  gu: { docNo: ['lislDocNo'], specLines: ['lislGuSpec1', 'lislGuSpec2'], guMv: true },
  // [MV] keeps its own Doc./Version/Date settings; without its own Doc.No. it prints the LISL GU/MV one.
  mv: { docNo: ['lislMvDocNo', 'lislDocNo'], version: 'lislMvVersion', date: 'lislMvDate', specLines: ['lislMvSpec1', 'lislMvSpec2'], guMv: true },
  rev: { ownerLine: 'lislRevOwnerLine', docNo: ['lislRevDocNo'], version: 'lislRevVersion', date: 'lislRevDate', specLines: [], guMv: false },
};
/** The settings of one form family; every value is an empty string (or the line is dropped) when it is not set. */
export function ownerFormTexts(site: SiteLike, family: OwnerFormFamily): OwnerFormTexts {
  const fields = FORM_FIELDS[family];
  return {
    ownerLine: fields.ownerLine ? text(site, fields.ownerLine) : '', docNo: fields.docNo.map(name => text(site, name)).find(Boolean) ?? '',
    version: fields.version ? text(site, fields.version) : '', date: fields.date ? text(site, fields.date) : '', specLines: fields.specLines.map(name => text(site, name)).filter(Boolean),
    procedureNo: fields.guMv ? text(site, 'lislProcedureNo') : '',
    parties: fields.guMv ? [text(site, 'lislGuField1'), text(site, 'lislGuField2'), text(site, 'lislGuField3')] : ['', '', ''],
  };
}
