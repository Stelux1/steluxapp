import type { Row } from './types.ts';
import { newest, phaseCompleted } from './iso-status.ts';
import { currentRevisionFile } from './iso-pages.ts';
import { currentRevision } from './revisions.ts';
import { materialManagementDisplay } from './site-settings.ts';

/**
 * Derivations behind the isometrics list (flag columns, KPI cards, filters). Pure functions over plain rows.
 *
 * M / E / W and Doc. follow the data, as the reference list shows them (weld__welding__isometrics-list.txt:436-442,
 * mto__projects__isometrics-list.txt:72-78): W = the isometric has a weld, M = a pick list exists (or, with the project
 * site's "Material Management Display Setting" ticked, a material line), E = a calculation line exists, Doc. = the
 * current ISO drawing has a file. Pfb / Fld are inferred from the sample. Each rule is one named function.
 */

/** A list flag: true is a tick, false a cross, null the dash ("not applicable" or not readable). */
export type Flag = boolean | null;
/**
 * Pfb / Fld: four states as in the reference list. true: the phase is completed (green tick); 'ready': not completed,
 * every weld of the phase has a welder ("ready, not signed off", orange minus); false: a weld of the phase has no
 * welder yet (red cross); null: Pfb of an isometric without shop welds, or not readable (empty).
 */
export type PhaseFlag = Flag | 'ready';

const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const textOf = (value: unknown) => String(value ?? '').trim();

export interface IsoListSource {
  /** Weld register; null / absent when the account cannot read it. */
  welds?: Row[] | null;
  weldTypes?: Row[] | null;
  /** Inspection results. */
  results?: Row[] | null;
  /** Release records. */
  releases?: Row[] | null;
  /** The calculation feature (`project-planning`) is delivered: the E flag exists. */
  planning?: boolean;
  /** Pick lists (M, "MTO Started"); null / absent when they cannot be read. */
  picklists?: Row[] | null;
  /** Material requirement lines (M with the display setting ticked, "Materials Linked"); null / absent when unreadable. */
  requirements?: Row[] | null;
  /** Calculation lines (E); null / absent when unreadable. */
  calculations?: Row[] | null;
  /** Documents and drawing revisions (Doc.); null / absent when unreadable. */
  attachments?: Row[] | null;
  revisions?: Row[] | null;
  /** Projects and project sites: the site's "Material Management Display Setting" decides what M shows. */
  projects?: Row[] | null;
  sites?: Row[] | null;
}
/** Rows grouped once, so a list of many isometrics does not rescan every collection per row. */
export interface IsoListContext {
  planning: boolean;
  /** Isometrics with a live pick list ("started"); null when pick lists cannot be read. */
  started: Set<string> | null;
  /** Isometrics with a live material line; null when material lines cannot be read. */
  materialsLinked: Set<string> | null;
  /** Isometrics with a live calculation line; null when calculation lines cannot be read. */
  calculated: Set<string> | null;
  /** The rows the Doc. rule reads; null when documents cannot be read. */
  documents: { attachments: Row[]; revisions: Row[] } | null;
  /** Whether an isometric's project site has the "Material Management Display Setting" ticked. */
  materialDisplay: (iso: Row) => boolean;
  weldsByIso: Map<string, Row[]> | null;
  /** Isometrics with at least one shop weld; null when that cannot be told. */
  shopIsos: Set<string> | null;
  /** Isometrics with a shop / field weld that has no welder yet; null when that cannot be told. */
  unweldedShop: Set<string> | null;
  unweldedField: Set<string> | null;
  /** Latest inspection result of a weld and type, keyed `weldId|type`; null when results are unreadable. */
  latest: Map<string, Row> | null;
  prefab: Set<string> | null;
  field: Set<string> | null;
}
export function isoListContext(source: IsoListSource): IsoListContext {
  const welds = source.welds ? live(source.welds) : null;
  const weldsByIso = welds ? new Map<string, Row[]>() : null;
  for (const weld of welds || []) { const key = String(weld.isoId); weldsByIso!.set(key, [...(weldsByIso!.get(key) || []), weld]); }
  const locations = new Map((source.weldTypes || []).map(type => [type.id, type.location]));
  const typed = (location: string) => welds && source.weldTypes ? welds.filter(weld => locations.get(String(weld.typeId)) === location) : null;
  const isoSet = (rows: Row[] | null) => rows ? new Set(rows.map(weld => String(weld.isoId))) : null;
  const welded = (weld: Row) => [1, 2, 3, 4].some(side => textOf(weld[`welder${side}Id`]) !== '');
  const shop = typed('Shop'), field = typed('Field');
  const shopIsos = isoSet(shop), unweldedShop = isoSet(shop && shop.filter(weld => !welded(weld))), unweldedField = isoSet(field && field.filter(weld => !welded(weld)));
  let latest: Map<string, Row> | null = null;
  if (source.results) {
    latest = new Map();
    // Oldest first, so the newest result of a weld and type is the one left in the map.
    for (const result of live(source.results).sort(newest).reverse()) latest.set(`${result.weldId}|${textOf(result.type)}`, result);
  }
  const releases = source.releases ? live(source.releases) : null;
  const released = (type: string) => releases ? new Set(releases.filter(row => row.type === type && row.status !== 'Reopened').map(row => String(row.isoId))) : null;
  const projectSite = new Map((source.projects || []).map(project => [project.id, String(project.siteId ?? '')]));
  const sites = new Map((source.sites || []).map(site => [site.id, site]));
  return {
    planning: source.planning === true, started: startedIsoIds(source.picklists), materialsLinked: isoIdsOf(source.requirements), calculated: isoIdsOf(source.calculations),
    documents: source.attachments ? { attachments: live(source.attachments), revisions: live(source.revisions) } : null,
    materialDisplay: iso => materialManagementDisplay(sites.get(projectSite.get(String(iso.projectId)) ?? '')),
    weldsByIso, shopIsos, unweldedShop, unweldedField, latest, prefab: released('Prefab'), field: released('Field'),
  };
}
const isoIdsOf = (rows?: Row[] | null) => rows ? new Set(live(rows).map(row => String(row.isoId ?? '')).filter(Boolean)) : null;
/**
 * The isometrics that are started: at least one live pick list exists for them (the notion of STARTED on the MTO
 * dashboard, shared/mto-dashboard.ts, and of the '[▶ Started]' tag in the header). Null when pick lists are unreadable.
 */
export const startedIsoIds = (picklists?: Row[] | null): Set<string> | null => isoIdsOf(picklists);

// ----- the flags, one function each ---------------------------------------------------------------------------

/** A stored yes/no field; null when the field is not delivered. */
const stored = (iso: Row, field: string): Flag => typeof iso[field] === 'boolean' ? iso[field] as boolean : iso[field] === undefined ? null : false;
/** NoBo = the isometric's NoBo flag. */
export const noBoFlag = (iso: Row): Flag => stored(iso, 'noBo');
/** PWHT = the isometric requires PWHT. */
export const pwhtFlag = (iso: Row): Flag => stored(iso, 'pwht');
const has = (set: Set<string> | null, iso: Row): Flag => set ? set.has(iso.id) : null;
/**
 * M (MTOPilot ready): with the project site's "Material Management Display Setting" not ticked (the default), a pick list
 * exists for the isometric; ticked, a material line exists. Dash when that collection cannot be read.
 */
export const mtoReadyFlag = (iso: Row, ctx: IsoListContext): Flag => has(ctx.materialDisplay(iso) ? ctx.materialsLinked : ctx.started, iso);
/** E (ESTPilot ready): at least one calculation line exists for the isometric (the vendor definition). */
export const estReadyFlag = (iso: Row, ctx: IsoListContext): Flag => has(ctx.calculated, iso);
/** W (WeldPilot ready): the isometric has at least one live weld. */
export const weldReadyFlag = (iso: Row, ctx: IsoListContext): Flag => ctx.weldsByIso ? (ctx.weldsByIso.get(iso.id)?.length ?? 0) > 0 : null;
/** Completed: marked complete on the isometric, or an active release of the phase (when releases are readable). */
const completedFlag = (iso: Row, ctx: IsoListContext, phase: 'Prefab' | 'Field'): boolean | null => {
  if (phaseCompleted(iso, phase)) return true;
  const released = phase === 'Prefab' ? ctx.prefab : ctx.field;
  return released ? released.has(iso.id) : null;
};
/**
 * Pfb: tick when Prefab is completed; empty without shop welds; cross when a shop weld has no welder; otherwise the
 * orange minus. The cross / minus split follows the reference sample (a shop weld without welder → cross).
 */
export function prefabFlag(iso: Row, ctx: IsoListContext): PhaseFlag {
  const completed = completedFlag(iso, ctx, 'Prefab');
  if (completed) return true;
  if (completed === null || !ctx.shopIsos || !ctx.unweldedShop) return null;
  if (!ctx.shopIsos.has(iso.id)) return null;
  return ctx.unweldedShop.has(iso.id) ? false : 'ready';
}
/** Fld: tick when Field is completed; cross when a field weld has no welder (by symmetry); otherwise the orange minus, also without field welds. */
export function fieldFlag(iso: Row, ctx: IsoListContext): PhaseFlag {
  const completed = completedFlag(iso, ctx, 'Field');
  if (completed) return true;
  if (completed === null || !ctx.unweldedField) return null;
  return ctx.unweldedField.has(iso.id) ? false : 'ready';
}
/** Doc. = tick when the isometric's current ISO drawing has a file (its own upload or the file of that ISO revision). */
export function documentationFlag(iso: Row, ctx: IsoListContext): Flag {
  if (!ctx.documents) return null;
  const rows = { isometrics: [iso], attachments: ctx.documents.attachments, revisions: ctx.documents.revisions };
  return Boolean(currentRevisionFile(rows, iso.id, 'ISO', currentRevision(rows, iso.id, 'ISO')));
}
/** Both documentation phase flags (prefab and field) are set: what the "Documentation" KPI card counts (see isoKpis). */
const documentationPhases = (iso: Row) => stored(iso, 'prefab_doc') === true && stored(iso, 'field_doc') === true;
/** The examinations a weld requires: NDT (and NDT PRE) or PWHT (and Pre-HT), each judged by its own latest result. */
const NDT_REQUIREMENTS: [string, string][] = [['ndoReq', 'NDT'], ['ndoReqPre', 'NDT PRE']];
const PWHT_REQUIREMENTS: [string, string][] = [['pwhtReq', 'PWHT'], ['pwhtReqPre', 'PRE-HT']];
function approved(iso: Row, ctx: IsoListContext, pairs: [string, string][]) {
  const required = (ctx.weldsByIso?.get(iso.id) || []).flatMap(weld => pairs.filter(([flag]) => weld[flag] === true).map(([, type]) => ({ weld, type })));
  return { required: required.length > 0, approved: required.length > 0 && ctx.latest !== null && required.every(({ weld, type }) => ctx.latest!.get(`${weld.id}|${type}`)?.result === 'Accepted') };
}
/** NDT approved = at least one weld requires NDT and every such weld's latest result is Accepted. */
export const ndtApproved = (iso: Row, ctx: IsoListContext) => approved(iso, ctx, NDT_REQUIREMENTS);
/** PWHT approved = the same rule for PWHT. */
export const pwhtApproved = (iso: Row, ctx: IsoListContext) => approved(iso, ctx, PWHT_REQUIREMENTS);

export interface IsoFlags {
  noBo: Flag; pwht: Flag; m: Flag; e: Flag; w: Flag; pfb: PhaseFlag; fld: PhaseFlag; doc: Flag;
  ndtApproved: boolean; pwhtApproved: boolean;
  /** At least one weld requires NDT (the NDT filter of the Filter dialog). */
  requiresNdt: boolean;
  /** A pick list exists ("MTO Started" card, '[▶ Started]' in the header), whatever the display setting. */
  mtoStarted: boolean;
  /** At least one material line exists ("Materials Linked" card). */
  materialsLinked: boolean;
  /** Both documentation phase flags are set ("Documentation" card). */
  documentationPhases: boolean;
}
export function isoFlags(iso: Row, ctx: IsoListContext): IsoFlags {
  const ndt = ndtApproved(iso, ctx), pwht = pwhtApproved(iso, ctx);
  return {
    noBo: noBoFlag(iso), pwht: pwhtFlag(iso), m: mtoReadyFlag(iso, ctx), e: ctx.planning ? estReadyFlag(iso, ctx) : null, w: weldReadyFlag(iso, ctx), pfb: prefabFlag(iso, ctx), fld: fieldFlag(iso, ctx), doc: documentationFlag(iso, ctx),
    ndtApproved: ndt.approved, pwhtApproved: pwht.approved, requiresNdt: ndt.required,
    mtoStarted: has(ctx.started, iso) === true, materialsLinked: has(ctx.materialsLinked, iso) === true, documentationPhases: documentationPhases(iso),
  };
}

/** Export text of a flag. */
export const flagText = (flag: PhaseFlag) => flag === 'ready' ? 'Ready' : flag === null ? 'n/a' : flag ? 'Yes' : 'No';
/** Sort rank of a flag: dashes first, then crosses, orange minus, ticks last. */
export const flagRank = (flag: PhaseFlag) => flag === null ? 0 : flag === 'ready' ? 2 : flag ? 3 : 1;

/** The flag columns a row's colour counts, in list order (E only where calculations are delivered). */
export const ROW_STATE_FLAGS: IsoFlagKey[] = ['noBo', 'pwht', 'm', 'e', 'w', 'pfb', 'fld', 'doc'];
export type IsoRowState = 'complete' | 'critical' | '';
/**
 * Row colour of the reference list (weld__start__dashboard.txt:9782-9794): over the flag columns that show a mark
 * (a dash does not count), "complete" when every mark is a tick, otherwise "critical" with four or more crosses.
 * The orange minus counts as a mark but neither as a tick nor as a cross.
 */
export function isoRowState(flags: Record<IsoFlagKey, PhaseFlag>): IsoRowState {
  const marks = ROW_STATE_FLAGS.map(key => flags[key]).filter(flag => flag !== null);
  if (marks.length && marks.every(flag => flag === true)) return 'complete';
  return marks.filter(flag => flag === false).length >= 4 ? 'critical' : '';
}

// ----- KPI cards ------------------------------------------------------------------------------------------------

export type KpiKey = 'total' | 'ndt' | 'pwht' | 'prefab' | 'field' | 'documentation' | 'mtoStarted' | 'materialsLinked';
export interface IsoKpi { key: KpiKey; label: string; count: number; total: number; /** One decimal. */ percent: number }
const share = (count: number, total: number) => total > 0 ? Math.round(count / total * 1000) / 10 : 0;
/** What one isometric adds to each KPI card (the server summary carries these; the cards count them). */
export interface IsoKpiFacts { ndtApproved: boolean; pwhtApproved: boolean; prefabComplete: boolean; fieldComplete: boolean; documentation: boolean; mtoStarted: boolean; materialsLinked: boolean }
export const isoKpiFacts = (flags: IsoFlags): IsoKpiFacts => ({
  ndtApproved: flags.ndtApproved, pwhtApproved: flags.pwhtApproved, prefabComplete: flags.pfb === true, fieldComplete: flags.fld === true,
  documentation: flags.documentationPhases === true, mtoStarted: flags.mtoStarted === true, materialsLinked: flags.materialsLinked === true,
});
export type IsoListPilot = 'weld' | 'mto';
/**
 * The six cards of the pilot, in the reference order (weld__welding__isometrics-list.txt:407, mto__projects__isometrics-list.txt:43).
 * `listed` are the flags of the isometrics currently shown (scope and filters applied). "Total Isometrics" is their
 * number; every other card is its count, n / total and the share of the total (one decimal, `__kpct` of the reference).
 * The "Documentation" card counts isometrics with both documentation phase flags set; the reference's rule for it is
 * not known yet (it is not the Doc. column: 1 / 7 against two Doc. ticks on the reference sample).
 */
export function isoKpis(listed: IsoFlags[], pilot: IsoListPilot = 'weld'): IsoKpi[] {
  const facts = listed.map(isoKpiFacts), n = facts.length, count = (key: keyof IsoKpiFacts) => facts.filter(item => item[key]).length;
  const card = (key: KpiKey, label: string, value: number): IsoKpi => ({ key, label, count: value, total: n, percent: share(value, n) });
  const total = card('total', 'Total Isometrics', n);
  if (pilot === 'mto') return [total, card('mtoStarted', 'MTO Started', count('mtoStarted')), card('materialsLinked', 'Materials Linked', count('materialsLinked')), card('documentation', 'Documentation', count('documentation')), card('prefab', 'Prefab Complete', count('prefabComplete')), card('field', 'Field Complete', count('fieldComplete'))];
  return [total, card('ndt', 'NDT Approved', count('ndtApproved')), card('pwht', 'PWHT Approved', count('pwhtApproved')), card('prefab', 'Prefab Complete', count('prefabComplete')), card('field', 'Field Complete', count('fieldComplete')), card('documentation', 'Documentation', count('documentation'))];
}
/** The text a card shows as its figure: the plain number for "Total Isometrics", the share with "%" for every other card. */
export const kpiFigure = (card: IsoKpi) => card.key === 'total' ? card.count.toLocaleString('en-GB') : `${card.percent}%`;

// ----- filters --------------------------------------------------------------------------------------------------

export const ISO_TEXT_COLUMNS = ['projectId', 'isoNo', 'irn', 'itpNo', 'itpNo2', 'pipingClass', 'priority'] as const;
export type IsoTextColumn = typeof ISO_TEXT_COLUMNS[number];
/** '' is "All". */
export type Tri = '' | 'yes' | 'no';
export interface IsoListFilters { ndt: Tri; pwht: Tri; mto: Tri; est: Tri; weld: Tri; text: Partial<Record<IsoTextColumn, string>> }
export const NO_ISO_FILTERS: IsoListFilters = { ndt: '', pwht: '', mto: '', est: '', weld: '', text: {} };
/** What M / E / W mean: the column tooltips and the Filter dialog hints. */
export const FLAG_HINTS = { m: 'MTOPilot: started (pick list issued)', e: 'ESTPilot: calculation present', w: 'WeldPilot: welds present' } as const;
/** The yes / no choices of the Filter dialog, labelled as in the reference (filterIsoList), in its order. */
export const ISO_FILTER_CHOICES: { key: 'ndt' | 'pwht' | 'mto' | 'est' | 'weld'; label: string; hint: string }[] = [
  { key: 'ndt', label: 'NDT', hint: 'Has welds that require NDT' },
  { key: 'pwht', label: 'PWHT', hint: 'Isometric requires PWHT' },
  { key: 'mto', label: 'MTOPilot ready', hint: FLAG_HINTS.m },
  { key: 'est', label: 'ESTPilot ready', hint: FLAG_HINTS.e },
  { key: 'weld', label: 'WeldPilot ready', hint: FLAG_HINTS.w },
];
/** How many filters are active (each column text and each dialog choice counts once). */
export const isoFilterCount = (filters: IsoListFilters) => (['ndt', 'pwht', 'mto', 'est', 'weld'] as const).filter(key => filters[key]).length + Object.values(filters.text).filter(value => value?.trim()).length;
const triMatches = (tri: Tri, flag: Flag) => !tri || (tri === 'yes' ? flag === true : flag === false);
/**
 * Filters combine (AND). NDT asks whether the isometric has welds requiring NDT; PWHT whether it requires PWHT;
 * MTO / EST / Weld ready are the M / E / W flags. `shown` gives the text a column displays.
 */
export function matchesIsoFilters(flags: IsoFlags, shown: (column: IsoTextColumn) => string, filters: IsoListFilters): boolean {
  if (filters.ndt && (filters.ndt === 'yes') !== flags.requiresNdt) return false;
  if (!triMatches(filters.pwht, flags.pwht) || !triMatches(filters.mto, flags.m) || !triMatches(filters.est, flags.e) || !triMatches(filters.weld, flags.w)) return false;
  return Object.entries(filters.text).every(([column, query]) => !query?.trim() || shown(column as IsoTextColumn).toLowerCase().includes(query.trim().toLowerCase()));
}

// ----- columns -----------------------------------------------------------------------------------------------------

export type IsoFlagKey = 'noBo' | 'pwht' | 'm' | 'e' | 'w' | 'pfb' | 'fld' | 'doc';
export interface IsoListColumn { key: string; label: string; /** Flag columns: which flag, and what it means (the tooltip). */ flag?: IsoFlagKey; title?: string }
export const ISO_LIST_COLUMNS: IsoListColumn[] = [
  { key: 'projectId', label: 'Project' }, { key: 'isoNo', label: 'ISO No' }, { key: 'irn', label: 'IRN' }, { key: 'itpNo', label: 'ITP No' }, { key: 'itpNo2', label: 'ITP No 2' }, { key: 'pipingClass', label: 'P.Class' },
  { key: '_noBo', label: 'NoBo', flag: 'noBo', title: 'Notified body required' }, { key: '_pwht', label: 'PWHT', flag: 'pwht', title: 'PWHT required' },
  { key: '_m', label: 'M', flag: 'm', title: FLAG_HINTS.m }, { key: '_e', label: 'E', flag: 'e', title: FLAG_HINTS.e }, { key: '_w', label: 'W', flag: 'w', title: FLAG_HINTS.w },
  { key: '_pfb', label: 'Pfb', flag: 'pfb', title: 'Prefab complete' }, { key: '_fld', label: 'Fld', flag: 'fld', title: 'Field complete' }, { key: '_doc', label: 'Doc.', flag: 'doc', title: 'ISO drawing present' },
  { key: 'priority', label: 'Prio.' },
];
/** Title of the page (reference TITLE "Isometrics list") and of the last column, which holds the "Open" link. */
export const ISO_LIST_TITLE = 'Isometrics list';
export const ISO_LIST_OPTIONS_COLUMN = 'Opts';
/** Rows per page of the list (reference DT lengthMenu), 20 by default. */
export const ISO_LIST_PAGE_SIZES = { sizes: [10, 20, 50, 100, 500], initial: 20 };
/**
 * The columns CSV and Excel export, in this order (reference exportOptions columns [0,1,2,3,4,5,14]): the flag columns
 * are not exported. Prio. is written as the list shows it (P1 … P5, '-').
 */
export const ISO_EXPORT_COLUMNS: { key: IsoTextColumn; label: string }[] = [
  { key: 'projectId', label: 'Project' }, { key: 'isoNo', label: 'ISO No' }, { key: 'irn', label: 'IRN' }, { key: 'itpNo', label: 'ITP No' }, { key: 'itpNo2', label: 'ITP No 2' }, { key: 'pipingClass', label: 'P.Class' }, { key: 'priority', label: 'Prio.' },
];
