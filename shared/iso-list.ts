import type { Row } from './types.ts';
import { newest } from './iso-status.ts';

/**
 * Derivations behind the isometrics list (flag columns, KPI cards, filters). Pure functions over plain rows.
 *
 * Every definition below is INFERRED from the visible sample of the reference (labels M / E / W / Pfb / Fld / Doc.
 * and their ticks), not confirmed. Each one is a single named function so it can be corrected in one place.
 */

/** A list flag: true is a tick, false a cross, null the dash ("not applicable" or not readable). */
export type Flag = boolean | null;

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
}
/** Rows grouped once, so a list of many isometrics does not rescan every collection per row. */
export interface IsoListContext {
  planning: boolean;
  weldsByIso: Map<string, Row[]> | null;
  /** Isometrics with at least one shop weld; null when that cannot be told. */
  shopIsos: Set<string> | null;
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
  const shopIsos = welds && source.weldTypes ? new Set(welds.filter(weld => locations.get(String(weld.typeId)) === 'Shop').map(weld => String(weld.isoId))) : null;
  let latest: Map<string, Row> | null = null;
  if (source.results) {
    latest = new Map();
    // Oldest first, so the newest result of a weld and type is the one left in the map.
    for (const result of live(source.results).sort(newest).reverse()) latest.set(`${result.weldId}|${textOf(result.type)}`, result);
  }
  const releases = source.releases ? live(source.releases) : null;
  const released = (type: string) => releases ? new Set(releases.filter(row => row.type === type).map(row => String(row.isoId))) : null;
  return { planning: source.planning === true, weldsByIso, shopIsos, latest, prefab: released('Prefab'), field: released('Field') };
}

// ----- the flags, one function each ---------------------------------------------------------------------------

/** A stored yes/no field; null when the field is not delivered. */
const stored = (iso: Row, field: string): Flag => typeof iso[field] === 'boolean' ? iso[field] as boolean : iso[field] === undefined ? null : false;
/** NoBo = the isometric's NoBo flag. */
export const noBoFlag = (iso: Row): Flag => stored(iso, 'noBo');
/** PWHT = the isometric requires PWHT. */
export const pwhtFlag = (iso: Row): Flag => stored(iso, 'pwht');
/** M / E / W = the phase flags "materials complete" / "calculation complete" / "welds complete" (MTO / EST / Weld ready). */
export const mtoReadyFlag = (iso: Row): Flag => stored(iso, 'prefab_materials');
export const estReadyFlag = (iso: Row): Flag => stored(iso, 'prefab_est');
export const weldReadyFlag = (iso: Row): Flag => stored(iso, 'prefab_welds');
/** Pfb = tick when a Prefab release exists; dash when the isometric has no shop welds; otherwise a cross. */
export function prefabFlag(iso: Row, ctx: IsoListContext): Flag {
  if (!ctx.prefab) return null;
  if (ctx.prefab.has(iso.id)) return true;
  if (!ctx.shopIsos) return null;
  return ctx.shopIsos.has(iso.id) ? false : null;
}
/** Fld = tick when a Field release exists, otherwise a cross. */
export function fieldFlag(iso: Row, ctx: IsoListContext): Flag {
  if (!ctx.field) return null;
  return ctx.field.has(iso.id);
}
/** Doc. = tick when both documentation phase flags (prefab and field) are set. */
export function documentationFlag(iso: Row): Flag {
  const prefab = stored(iso, 'prefab_doc'), field = stored(iso, 'field_doc');
  return prefab === null || field === null ? null : prefab && field;
}
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
  noBo: Flag; pwht: Flag; m: Flag; e: Flag; w: Flag; pfb: Flag; fld: Flag; doc: Flag;
  ndtApproved: boolean; pwhtApproved: boolean;
  /** At least one weld requires NDT (the NDT filter of the Filter dialog). */
  requiresNdt: boolean;
}
export function isoFlags(iso: Row, ctx: IsoListContext): IsoFlags {
  const ndt = ndtApproved(iso, ctx), pwht = pwhtApproved(iso, ctx);
  return { noBo: noBoFlag(iso), pwht: pwhtFlag(iso), m: mtoReadyFlag(iso), e: ctx.planning ? estReadyFlag(iso) : null, w: weldReadyFlag(iso), pfb: prefabFlag(iso, ctx), fld: fieldFlag(iso, ctx), doc: documentationFlag(iso), ndtApproved: ndt.approved, pwhtApproved: pwht.approved, requiresNdt: ndt.required };
}

/** Export text of a flag. */
export const flagText = (flag: Flag) => flag === null ? 'n/a' : flag ? 'Yes' : 'No';
/** Sort rank of a flag: dashes first, ticks last. */
export const flagRank = (flag: Flag) => flag === null ? 0 : flag ? 2 : 1;

// ----- KPI cards ------------------------------------------------------------------------------------------------

export type KpiKey = 'total' | 'ndt' | 'pwht' | 'prefab' | 'field' | 'documentation';
export interface IsoKpi { key: KpiKey; label: string; count: number; total: number; /** One decimal. */ percent: number }
const share = (count: number, total: number) => total > 0 ? Math.round(count / total * 1000) / 10 : 0;
/**
 * The six cards. `listed` are the flags of the isometrics currently shown (scope and filters applied); `inScope`
 * is how many isometrics the scope holds before the filters, so "Total isometrics" reads shown / all.
 */
export function isoKpis(listed: IsoFlags[], inScope: number): IsoKpi[] {
  const n = listed.length, count = (test: (flags: IsoFlags) => boolean) => listed.filter(test).length;
  const card = (key: KpiKey, label: string, value: number, total: number): IsoKpi => ({ key, label, count: value, total, percent: share(value, total) });
  return [
    card('total', 'Total isometrics', n, inScope),
    card('ndt', 'NDT approved', count(flags => flags.ndtApproved), n),
    card('pwht', 'PWHT approved', count(flags => flags.pwhtApproved), n),
    card('prefab', 'Prefab complete', count(flags => flags.pfb === true), n),
    card('field', 'Field complete', count(flags => flags.fld === true), n),
    card('documentation', 'Documentation', count(flags => flags.doc === true), n),
  ];
}

// ----- filters --------------------------------------------------------------------------------------------------

export const ISO_TEXT_COLUMNS = ['projectId', 'isoNo', 'irn', 'itpNo', 'itpNo2', 'pipingClass', 'priority'] as const;
export type IsoTextColumn = typeof ISO_TEXT_COLUMNS[number];
/** '' is "All". */
export type Tri = '' | 'yes' | 'no';
export interface IsoListFilters { ndt: Tri; pwht: Tri; mto: Tri; est: Tri; weld: Tri; text: Partial<Record<IsoTextColumn, string>> }
export const NO_ISO_FILTERS: IsoListFilters = { ndt: '', pwht: '', mto: '', est: '', weld: '', text: {} };
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
  { key: '_m', label: 'M', flag: 'm', title: 'MTO ready: materials complete' }, { key: '_e', label: 'E', flag: 'e', title: 'EST ready: calculation complete' }, { key: '_w', label: 'W', flag: 'w', title: 'Weld ready: welds complete' },
  { key: '_pfb', label: 'Pfb', flag: 'pfb', title: 'Prefab released' }, { key: '_fld', label: 'Fld', flag: 'fld', title: 'Field released' }, { key: '_doc', label: 'Doc.', flag: 'doc', title: 'Prefab and field documents complete' },
  { key: 'priority', label: 'Prio.' },
];
