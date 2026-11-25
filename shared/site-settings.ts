/**
 * Settings stored on a project site (hosted: "main project"). This module only stores, validates and exposes
 * them; the rules they drive (mandatory weld fields, WPS validation, certificate scoping, defect codes,
 * progress calculation) are enforced by later tasks through the accessors below.
 */
import { PROGRESS_MODEL, PROGRESS_MODEL_HELP } from './progress-model.ts';

type SiteLike = Record<string, unknown> | undefined | null;

export const FLANGE_STANDARDS = ['No catalog (free entry)', 'ASME B16.5 torque table (2012)', 'Gasunie CSW-43 table B'];
export const DEFECT_NORMS = ['No norm selected', 'ISO 6520-1', 'ASME B31.3', 'API 1104'];
export const NDT_MEASUREMENTS = ['Inch-weighted', 'Per weld'];
export const RELEASE_DOC_DRAWINGS = ['Drawing no + iso', 'Prefix + iso'];
/** The NDT standards a LISL [ISS] sheet can tick. */
export const ISS_NDT_STANDARDS = ['ASME', 'EN ISO'];
/** Edit project site, Document settings: where the VT column of LISL [ISS] reads its report number from (default: the VT NDT column). */
export const LISL_VT_SOURCES = ['VT from NDT column', 'VT from VT report'] as const;
/** The earlier stored name of the second choice (there was a VT 2 report then); it stays accepted and means 'VT from VT report'. */
export const LISL_VT_SOURCE_LEGACY = 'VT from VT2 report';
export const LISL_VT_SOURCE_LABEL = 'LISL ISS — VT source';
/** Used by the weld dashboard KPI when a site leaves the repair performance limit empty. */
export const DEFAULT_REPAIR_PERFORMANCE_LIMIT = 5;

/**
 * The progress model (phases, activities, fixed weights) lives in shared/progress-model.ts, the one place to change it.
 * What follows are the LEGACY weight fields a site still stores (`weightShop`, `shopWelds`, `fieldPunch`, …): they stay
 * defined so older saves and stored values are accepted, but nothing reads them any more.
 */
export { PROGRESS_MODEL } from './progress-model.ts';
export type PhaseKey = 'shop' | 'field' | 'site';
export interface ProgressActivity { key: string; field: string; label: string; }
export interface ProgressPhase { key: PhaseKey; field: string; label: string; activities: ProgressActivity[]; }
const activity = (phase: PhaseKey, key: string, label: string): ProgressActivity => ({ key, label, field: `${phase}${key[0].toUpperCase()}${key.slice(1)}` });
/** Legacy stored weight fields, in the order of the reference. Field names are `weightShop`, `shopWelds`, `fieldPunch`, … (ignored by the progress). */
export const PROGRESS_PHASES: ProgressPhase[] = [
  { key: 'shop', field: 'weightShop', label: 'Shop', activities: [activity('shop', 'welds', 'Welds'), activity('shop', 'ndt', 'NDT'), activity('shop', 'materialPipe', 'Material pipe'), activity('shop', 'supports', 'Supports'), activity('shop', 'appendages', 'Appendages')] },
  { key: 'field', field: 'weightField', label: 'Field', activities: [activity('field', 'materialPipe', 'Material pipe'), activity('field', 'welds', 'Welds'), activity('field', 'ndt', 'NDT'), activity('field', 'supports', 'Supports'), activity('field', 'appendages', 'Appendages'), activity('field', 'punch', 'Punch')] },
  { key: 'site', field: 'weightSite', label: 'Site', activities: [activity('site', 'hydrotest', 'Hydrotest'), activity('site', 'paintTracing', 'Paint/Tracing')] },
];
export const PROGRESS_FIELDS = PROGRESS_PHASES.flatMap(phase => [phase.field, ...phase.activities.map(a => a.field)]);

const flag = (site: SiteLike, name: string) => site?.[name] === true;
const text = (site: SiteLike, name: string) => typeof site?.[name] === 'string' ? String(site[name]).trim() : '';

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
// Settings removed from the main project form (client change list 22.11.2026, F6): the stored value stays in the
// database, but every rule reads the default. The parameter is kept so callers need not change.
/** Defect norm: none (the setting was removed; a stored norm is ignored). */
export const defectNorm = (_site: SiteLike): string | null => null;
/** Repair performance limit in percent: always 5 (the setting was removed; a stored value is ignored). */
export const repairPerformanceLimit = (_site: SiteLike) => DEFAULT_REPAIR_PERFORMANCE_LIMIT;
/** NDT measurement: always inch-weighted (the setting was removed; a stored 'Per weld' is ignored). */
export const ndtMeasurement = (_site: SiteLike): 'inch-weighted' | 'per-weld' => 'inch-weighted';

// ----- the main project form of the hosted profile (reference "Add project site") -------------------------------------
/** Label of a legacy weight field: "Distribution - Shop", "Welds - Shop", … and, for the Site phase, "Hydrotest" / "Paint/Tracing" (stored only). */
export const progressLabel = (phase: ProgressPhase, activityKey?: string) => {
  if (!activityKey) return `Distribution - ${phase.label}`;
  const found = phase.activities.find(a => a.key === activityKey)!;
  return phase.key === 'site' ? found.label : `${found.label} - ${phase.label}`;
};
/**
 * The explanation of Iso progress for the main project form: the fixed model of shared/progress-model.ts, one line per
 * activity ([term, text]), built from PROGRESS_MODEL so it never disagrees with the calculation.
 */
export const PROGRESS_HELP = {
  intro: PROGRESS_MODEL_HELP.intro,
  lines: PROGRESS_MODEL.phases.flatMap(phase => phase.activities.map(activity => [`${activity.label} (${phase.label}, ${activity.weight}%)`, (PROGRESS_MODEL_HELP.lines[phase.key] as Record<string, string>)[activity.key]] as [string, string])),
  rule: PROGRESS_MODEL_HELP.rule,
};
/** The one-line note of the Iso progress section of the main project form. */
export const PROGRESS_FIXED_NOTE = 'Fixed for all projects';
/** Defaults of the legacy weight fields on a new main project (Shop 50, Field 50, Site 0, activities 0); stored and ignored. */
export const PROGRESS_DEFAULTS: Record<string, number> = Object.fromEntries(PROGRESS_PHASES.flatMap(phase => [[phase.field, phase.key === 'site' ? 0 : 50], ...phase.activities.map(a => [a.field, 0])]));
const SITE_FORM_SECTION = 'Project settings';
/** The first block of the form, in this order and wording (client change list 22.11.2026, images 1 and 2). */
export const SITE_ADDRESS_FIELDS = ['name', 'address', 'zip', 'residence'] as const;
const SITE_CONTACT_LABELS: Record<string, string> = { name: 'Name', address: 'Address', zip: 'Zip code', residence: 'City', phone: 'Phone', email: 'Email address' };
/**
 * Fields the hosted main project form no longer shows (client change list 22.11.2026, images 2–4): Phone, Email address,
 * Flange tightening standard (chosen per flange now), Defect norm, Repair performance, NDT measurement, IRN Code and
 * Archived (archiving is a list action of Project sites). They stay defined, so a site that stores them still opens and
 * saves (the server answers 404 for an unknown field); their values stay in the database and are never sent unchanged.
 */
export const HOSTED_HIDDEN_SITE_FIELDS = ['phone', 'email', 'flangeStandard', 'defectNorm', 'repairLimit', 'ndtMeasurement', 'irnCode', 'archived'];
interface SiteFormField { name: string; label: string; section?: string; default?: unknown; hidden?: boolean; control?: 'radio'; intro?: string; hint?: string }
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
  { name: 'lislField1', label: 'Field 1:', intro: 'LISL A3/A4', hint: 'First acceptance line, e.g. the company name.' }, { name: 'lislField2', label: 'Field 2:', hint: 'Second acceptance line, e.g. the client.' }, { name: 'lislField3', label: 'Field 3:', hint: 'Third acceptance line, e.g. NoBo.' },
  { name: 'lislGuField1', label: 'Field 1:', intro: 'LISL GU/MV', hint: 'First signature group, e.g. the contractor or supplier.' }, { name: 'lislGuField2', label: 'Field 2:', hint: 'Second signature group, e.g. the client.' }, { name: 'lislGuField3', label: 'Field 3:', hint: 'Third signature group, e.g. NoBo.' },
  { name: 'lislDocNo', label: 'Doc.No. & Rev.No.' }, { name: 'lislProcedureNo', label: 'Procedure No.' },
];
/** Heading above our own document settings (owner-specific LISL forms), placed after the reference ones. */
export const OWNER_SETTINGS_HEADING = 'Owner-specific LISL forms';
/**
 * The fields of the main project form as the hosted profile shows them: "Project settings" starts with Name, Address,
 * Zip code and City (a 2 × 2 block, image 1), then the settings that stay (Mandatory fields, Validation on WPS,
 * Project-specific Material Certificates, Material Management Display Setting, Diameter standard); Document settings
 * follow in the reference wording. The legacy Iso progress weights are hidden: the form shows the fixed model
 * (shared/progress-model.ts) read-only instead, and a new site still stores their defaults. Other profiles keep the
 * shared definitions.
 */
export function hostedSiteFields<T extends SiteFormField>(fields: T[]): T[] {
  const progress = new Set(PROGRESS_FIELDS), hidden = new Set(HOSTED_HIDDEN_SITE_FIELDS);
  const documentSettings = new Map(HOSTED_DOCUMENT_SETTINGS.map(setting => [setting.name, setting]));
  let firstOwner = '';
  const adapted = fields.map(field => {
    if (hidden.has(field.name)) return { ...field, hidden: true, ...(SITE_CONTACT_LABELS[field.name] ? { label: SITE_CONTACT_LABELS[field.name], section: SITE_FORM_SECTION } : {}) };
    if (SITE_CONTACT_LABELS[field.name]) return { ...field, label: SITE_CONTACT_LABELS[field.name], section: SITE_FORM_SECTION };
    if (field.name === 'lislVtSource') return { ...field, label: LISL_VT_SOURCE_LABEL, control: 'radio' as const, default: LISL_VT_SOURCES[0] };
    const document = documentSettings.get(field.name);
    if (document) return { ...field, label: document.label, ...(document.intro ? { intro: document.intro } : {}), ...(document.hint ? { hint: document.hint } : {}) };
    if (field.section === 'Document settings' && !field.hidden && !firstOwner) { firstOwner = field.name; return { ...field, intro: OWNER_SETTINGS_HEADING }; }
    if (progress.has(field.name)) {
      const phase = PROGRESS_PHASES.find(item => item.field === field.name || item.activities.some(a => a.field === field.name))!;
      const activityKey = phase.activities.find(a => a.field === field.name)?.key;
      return { ...field, label: progressLabel(phase, activityKey), default: PROGRESS_DEFAULTS[field.name], hidden: true };
    }
    return field;
  });
  // Name, Address, Zip code, City lead the form (the stable sort keeps every other field in its place).
  const rank = (name: string) => { const index = (SITE_ADDRESS_FIELDS as readonly string[]).indexOf(name); return index < 0 ? SITE_ADDRESS_FIELDS.length : index; };
  return [...adapted].sort((a, b) => rank(a.name) - rank(b.name));
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
