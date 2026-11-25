import type { Row } from './types.ts';
import { DEFAULT_NDT_PERCENT, itpNdtPercent, weldItpId } from './itp-dashboard.ts';
import { repairPerformanceLimit } from './site-settings.ts';
import { NDT_ROUNDS, TRACERS_REQUIRED, hasNdtActivity, inTracerGroup, isTracer, notAccepted, openRejection, processField, repairChain, repairRoot, tracerGroup, tracersOf, type TracerContext } from './inspections.ts';
import { isNonWeldCode } from './weld-codes.ts';

/**
 * Weld Pilot dashboard: KPI cards and Inspection compliance. Pure functions over plain rows (no I/O).
 *
 * Rules taken from the reference capture (weld__start__dashboard*.txt, its summary JSON and script):
 * - scope: every weld of a live isometric except weld numbers coded GAP, SP, E or B (shared/weld-codes.ts); the date
 *   filter keeps welds without a weld date (not welded yet);
 * - Welded = welds with at least one welder; Examined % = welded, non-tracer welds whose NDT is completed, as a share
 *   of the scope; Repair rate = repaired / welded (length view: repaired mm / examined mm); Scope = repaired / scope;
 * - compliance groups welds by welder + WPS + ITP/KNR, a weld counting under every one of its welders; required
 *   examination = ceil(welds x NDT %), 10 % when no ITP/KNR (or no NDT %) applies; examined counts completed NDT only;
 *   selected = NDT Req. and not completed; a group is COMPLIANT when nothing is still required
 *   (remaining = max(0, required - examined - selected) = 0); tracer welds are not part of the compliance.
 */

export interface DashboardRows {
  welds: Row[]; isometrics: Row[]; projects: Row[]; weldTypes: Row[]; welders: Row[]; wps: Row[]; itps: Row[];
  ndtProcesses: Row[]; ndtGroups?: Row[]; requests: Row[]; results: Row[]; diameters?: Row[];
  /** Every weld the reader may see (tracers can sit on isometrics of another main project); default `welds`. */ tracerWelds?: Row[];
}
/** Filters of the dashboard; the four multi-selects of the reference hold lists (empty = all). */
export interface DashboardFilters {
  from: string; to: string; companyId: string; location: '' | 'Shop' | 'Field'; projectIds: string[]; welderIds: string[]; itpId: string;
  pipingClass: string; /** The "Custom field" of the isometric (stored as `irn`). */ irn: string; ped: string; material: string; wpsIds: string[];
}
export const NO_DASHBOARD_FILTERS: DashboardFilters = { from: '', to: '', companyId: '', location: '', projectIds: [], welderIds: [], itpId: '', pipingClass: '', irn: '', ped: '', material: '', wpsIds: [] };
/** The filters a dashboard opens with, and Reset returns to: To Date = today, everything else empty (reference). */
export const defaultDashboardFilters = (today: string): DashboardFilters => ({ ...NO_DASHBOARD_FILTERS, to: today });
/** Today as yyyy-mm-dd in local time. */
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const empty = (value: string | string[]) => Array.isArray(value) ? value.length === 0 : value === '';
const same = (a: string | string[], b: string | string[]) => Array.isArray(a) || Array.isArray(b) ? [...(a as string[])].sort().join('\u0000') === [...(b as string[])].sort().join('\u0000') : a === b;
/** Filters that differ from `base` (default: no filter at all). */
export const dashboardFilterCount = (filters: DashboardFilters, base: DashboardFilters = NO_DASHBOARD_FILTERS) =>
  (Object.keys(NO_DASHBOARD_FILTERS) as (keyof DashboardFilters)[]).filter(key => !same(filters[key], base[key]) && !(empty(filters[key]) && empty(base[key]))).length;

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const round1 = (value: number) => Math.round(value * 10) / 10;
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
/** One decimal; 0 when the denominator is 0, so an empty scope never shows NaN. */
export const share = (part: number, whole: number) => whole > 0 ? round1(part / whole * 100) : 0;
/** Bar fill: value / whole x 100 capped to 0..100 (reference clampPercentage). */
export const barPercent = (value: number, whole: number) => whole > 0 ? Math.max(0, Math.min(100, round1(value / whole * 100))) : 0;
/** A percentage as the reference prints it: one decimal and " %" ("9.1 %", "14.0 %", "0.0 %"). */
export const percentLabel = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(1)} %`;
/** Header date of the reference ("Monday 16 November 2026"). */
export function headerDate(date = new Date()): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ----- predicates on one weld ------------------------------------------------------------------------------------

/** Welder ids of a weld, in slot order. */
export const weldWelderIds = (weld: Row) => [1, 2, 3, 4].map(side => text(weld[`welder${side}Id`])).filter(Boolean);
/** The weld has been welded: at least one welder is recorded (the weld date does not matter). */
export const isWelded = (weld: Row) => weldWelderIds(weld).length > 0;
/** Tracer welds: the inspections flow's predicate (tracer flag or a tracer link, shared/inspections.ts). */
export const isTracerWeld = (weld: Row) => isTracer(weld);
/** Repaired (KPI): the weld's repair flag. Which welds the reference counts is still open (weld-dashboard-reports-R3). */
export const isRepairedWeld = (weld: Row) => weld.repair === true;
/** Weld length in mm (the reports' rule): the length of a "Length in mm" weld, else the outline of its diameter. */
export function weldLength(weld: Row, diameters: Row[] = []): number {
  if (weld.lengthMode === 'Length in mm') return Number(weld.dialen) || 0;
  return Number(diameters.find(row => row.id === weld.diameterId)?.outline) || 0;
}

const NDT = 'NDT';
const OUTCOMES = ['Accepted', 'Rejected'];
/**
 * The weld's NDT is completed: it has an NDT result (Accepted or NA, ReWeld? included) and every NDT process
 * requested on its columns (rounds) has one. Examined welds, Exam % and "Fully completed NDT only" use it.
 */
export function isNdtCompleted(results: Row[], weld: Row): boolean {
  const own = live(results).filter(row => row.weldId === weld.id && text(row.type) === NDT && OUTCOMES.includes(text(row.result)));
  if (!own.length) return false;
  const done = new Set(own.map(row => text(row.round) || 'Initial'));
  return NDT_ROUNDS.filter(round => text(weld[processField(false, round.index)])).every(round => done.has(round.key));
}

/**
 * Required examinations for `welds` welds at `percent` %: the next whole number up. The product is rounded to 9
 * decimals first so that 3 welds at 10 % need 1, not 1 plus floating-point dust.
 */
export function requiredExaminations(welds: number, percent: number): number {
  if (!(welds > 0) || !(percent > 0)) return 0;
  return Math.ceil(Math.round(welds * percent / 100 * 1e9) / 1e9);
}

// ----- scope (filters) ---------------------------------------------------------------------------------------------

export interface Fact {
  weld: Row; iso: Row | undefined; projectId: string; welderIds: string[]; companyIds: string[]; wpsId: string; itpId: string;
  location: string; typeLabel: string; length: number;
}
/** Short label of a weld type: its abbreviation, else its name; "UNK" for a weld without type (reference). */
export const weldTypeLabel = (type: Row | undefined) => text(type?.abbreviation) || text(type?.name) || 'UNK';

function facts(rows: DashboardRows): Fact[] {
  const isos = new Map(live(rows.isometrics).map(row => [row.id, row]));
  const welders = new Map(live(rows.welders).map(row => [row.id, row]));
  const types = new Map(live(rows.weldTypes).map(row => [row.id, row]));
  const itps = live(rows.itps), diameters = live(rows.diameters);
  return live(rows.welds).filter(weld => isos.has(String(weld.isoId)) && !isNonWeldCode(weld.weldNo)).map(weld => {
    const iso = isos.get(String(weld.isoId)), type = types.get(String(weld.typeId)), location = text(type?.location);
    const welderIds = weldWelderIds(weld);
    return {
      weld, iso, projectId: text(iso?.projectId), welderIds, companyIds: welderIds.map(id => text(welders.get(id)?.companyId)).filter(Boolean),
      wpsId: text(weld.wpsId), itpId: weldItpId(iso, location, itps), location, typeLabel: type ? weldTypeLabel(type) : 'UNK', length: weldLength(weld, diameters),
    };
  });
}
const anyOf = (chosen: string[], value: string | string[]) => !chosen.length || (Array.isArray(value) ? value.some(item => chosen.includes(item)) : chosen.includes(value));
function inScope(fact: Fact, f: DashboardFilters): boolean {
  const date = text(fact.weld.date);
  // A weld without a weld date is not welded yet; the reference keeps it under a date filter (its 77 include them).
  if (date && f.from && date < f.from) return false;
  if (date && f.to && date.slice(0, 10) > f.to) return false;
  if (f.companyId && !fact.companyIds.includes(f.companyId)) return false;
  if (f.location && fact.location !== f.location) return false;
  if (!anyOf(f.projectIds, fact.projectId)) return false;
  if (!anyOf(f.welderIds, fact.welderIds)) return false;
  if (f.itpId && fact.itpId !== f.itpId) return false;
  if (f.pipingClass && text(fact.iso?.pipingClass) !== f.pipingClass) return false;
  if (f.irn && text(fact.iso?.irn) !== f.irn) return false;
  if (f.ped && text(fact.iso?.ped) !== f.ped) return false;
  if (f.material && text(fact.iso?.material) !== f.material) return false;
  if (!anyOf(f.wpsIds, fact.wpsId)) return false;
  return true;
}

// ----- KPI cards -----------------------------------------------------------------------------------------------------

/** Number of welds (default) or summed weld length in mm; the dashboard no longer offers the switch, the default is used. */
export type WeldView = 'welds' | 'length';

export interface WeldTypeCount { key: string; label: string; count: number; }
export interface RepairPerformance { value: number; limit: number; aboveLimit: boolean; /** Repaired as a share of every weld in scope. */ scopePercent: number; }
export interface DashboardKpis {
  view: WeldView; projects: number; isometrics: number;
  /** Count, or summed mm in the length view. */ totalWelds: number; weldsByType: WeldTypeCount[];
  welded: number; weldedByType: WeldTypeCount[]; examined: number; examinedPercent: number;
  /** Count, or summed mm in the length view. */ repaired: number; repairRate: number; repairPerformance: RepairPerformance;
}
/** Breakdown by weld type, most first (reference "UNK 42, WS 22, FW 13"). */
export function typeBreakdown(items: Fact[]): WeldTypeCount[] {
  const byType = new Map<string, WeldTypeCount>();
  for (const fact of items) { const entry = byType.get(fact.typeLabel) ?? { key: fact.typeLabel, label: fact.typeLabel, count: 0 }; entry.count++; byType.set(fact.typeLabel, entry); }
  return [...byType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export const breakdownText = (items: WeldTypeCount[]) => items.filter(item => item.count > 0).map(item => `${item.label} ${item.count}`).join(', ');

export interface DashboardResult { kpis: DashboardKpis; compliance: ComplianceGroup[]; summary: ComplianceSummary; warnings: string[]; scopeWelds: number; }

/**
 * Everything the dashboard shows for the filters. `site` is the main project (project site) carrying the repair
 * performance limit. Projects and isometrics are always the distinct ones among the welds in scope.
 */
export function weldDashboard(rows: DashboardRows, filters: DashboardFilters, site?: Row | null, view: WeldView = 'welds'): DashboardResult {
  const scope = facts(rows).filter(fact => inScope(fact, filters));
  const results = rows.results;
  const welded = scope.filter(fact => isWelded(fact.weld));
  const examined = welded.filter(fact => !isTracerWeld(fact.weld) && isNdtCompleted(results, fact.weld));
  const repaired = welded.filter(fact => isRepairedWeld(fact.weld));
  const measure = (items: Fact[]) => view === 'length' ? items.reduce((sum, fact) => sum + fact.length, 0) : items.length;
  const repairRate = view === 'length' ? share(measure(repaired), measure(examined)) : share(repaired.length, welded.length);
  const limit = repairPerformanceLimit(site);
  const compliance = inspectionCompliance(rows, scope, filters.welderIds);
  return {
    scopeWelds: scope.length,
    kpis: {
      view, projects: new Set(scope.map(fact => fact.projectId).filter(Boolean)).size, isometrics: new Set(scope.map(fact => String(fact.weld.isoId))).size,
      totalWelds: measure(scope), weldsByType: typeBreakdown(scope), welded: welded.length, weldedByType: typeBreakdown(welded),
      examined: examined.length, examinedPercent: share(measure(examined), measure(scope)),
      repaired: measure(repaired), repairRate,
      repairPerformance: { value: repairRate, limit, aboveLimit: repairRate > limit, scopePercent: share(measure(repaired), measure(scope)) },
    },
    compliance, summary: complianceSummary(compliance), warnings: complianceWarnings(rows, scope),
  };
}

// ----- inspection compliance -----------------------------------------------------------------------------------------

export type DefectFlag = 'ok' | 'warn' | 'bad';
export interface TracerStatus { value: string; hint: string; }
export interface DefectBlock {
  /** The group's welds (tracers not counted). */ welds: number;
  examined: number; examinedPercent: number;
  /** Welds of the group whose latest NDT outcome is not accepted (NA or ReWeld?) and that no accepted repair has closed yet (`openRejection`). */ rejected: number; rejectedPercent: number;
  /** Tracer welds linked to the group's rejected welds, and how many of them are examined / rejected. */ tracerWelds: number; tracerExamined: number; tracerRejected: number;
  /** Two per rejected weld. */ expectedTracers: number; missingTracers: number;
  flag: DefectFlag; flagReason: string; tracerStatus: TracerStatus;
  /** The Tracers metric opens the Tracer proposal (tracers missing or a weld rejected); its hint. */ tracerAction: boolean; tracerHint: string;
}
export interface ComplianceGroup {
  key: string; welderId: string; welderNumber: string; welderName: string; /** "ML396 - Aleksandar Djuric"; the code alone without a name. */ welderLabel: string;
  wpsId: string; wpsName: string; itpId: string; itpNumber: string;
  /** NDT % of the linked ITP / KNR, or null while none (or none with a %) applies; the 10 % fallback is then used. */
  itpPercent: number | null; usedPercent: number; usesFallback: boolean; percentLabel: string;
  /** "No central ITP/KNR linked for this weld." / "Central ITP/KNR percentage missing. Using 10% fallback." or ''. */ issue: string;
  total: number; weldsByType: WeldTypeCount[]; required: number; examined: number; selected: number;
  /** Required examinations that are neither done nor selected yet. */ remaining: number;
  compliant: boolean;
  /** Fill of the Tested / Selected / Remaining bars: count / required, capped at 100. */
  testedPercent: number; selectedPercent: number; remainingPercent: number;
  defects: DefectBlock;
  /** Ids of the group's welds (tracer proposal). */ weldIds: string[];
}
export const UNASSIGNED = 'Unassigned';
export const ISSUE_NO_LINK = 'No central ITP/KNR linked for this weld.';
export const ISSUE_NO_PERCENT = 'Central ITP/KNR percentage missing. Using 10% fallback.';
export const COMPLIANCE_TEXTS = {
  title: 'Inspection compliance', meta: 'Grouped by welder, WPS and ITP/KNR. Required examination uses the central ITP/KNR NDT % with a 10% fallback. Tracers are excluded.',
  dataQuality: 'Data quality', totalWelds: 'Total welds', requiredExam: 'Required examination', examinedWelds: 'Examined welds', selectedExam: 'Selected for examination',
  remainingRequired: 'Remaining required', complianceStatus: 'Compliance status', metaFallback: (n: number) => `Central ITP/KNR % with 10% fallback for ${n} groups.`,
  metaExaminedOnly: 'Fully completed NDT only.', metaSelected: 'Marked with NDT Req. and not yet completed.', metaRemaining: 'Extra inspections still needed.',
  metaGroups: (ok: number, all: number) => `${ok} of ${all} groups compliant.`, metaTotalEmpty: 'Across active welder / WPS / ITP-KNR groups.',
  defectTitle: 'Weld defect % per welder / WPS', noWps: 'No WPS', unknownWelder: 'Unknown welder', search: 'Search welder, WPS or ITP/KNR',
  noGroups: 'No compliance groups found inside the current selection.', noPageGroups: 'No groups in this view.',
} as const;
/** Welder of a group: "<number> - <name>", the number alone when the welder has no name (reference W01). */
export function welderLabel(welder: Row | undefined): string {
  const number = text(welder?.number), name = text(welder?.name);
  return number && name ? `${number} - ${name}` : number || name || COMPLIANCE_TEXTS.unknownWelder;
}
/** Tracer status of a group (reference buildTracerStatus). */
export function tracerStatus(block: Pick<DefectBlock, 'expectedTracers' | 'tracerWelds' | 'tracerExamined' | 'tracerRejected' | 'missingTracers'>): TracerStatus {
  const { expectedTracers: expected, tracerWelds: existing, tracerExamined: examined, tracerRejected: rejected, missingTracers: missing } = block;
  if (expected <= 0) return { value: 'Not needed', hint: 'No tracer action required for this group.' };
  if (rejected > 0) return { value: 'Rejected', hint: `${Math.max(0, examined - rejected)} accepted / ${rejected} rejected${missing > 0 ? ` | ${missing} additional tracer(s) still required.` : ''}` };
  if (missing > 0) return { value: 'Missing', hint: `${missing} of ${expected} tracer(s) still required.` };
  if (existing > 0) return { value: 'Selected', hint: `${existing} of ${expected} tracer(s) selected.` };
  return { value: 'Open', hint: 'Tracer workflow is open for this group.' };
}
/** Defect flag: BAD when a weld is rejected and tracers are missing, WARN when nothing is examined, otherwise OK. */
export function defectFlag(block: Pick<DefectBlock, 'examined' | 'rejected' | 'missingTracers'>): { flag: DefectFlag; reason: string } {
  if (block.rejected > 0 && block.missingTracers > 0) return { flag: 'bad', reason: 'Rejected but tracers missing' };
  if (block.examined === 0) return { flag: 'warn', reason: 'Not examined' };
  return { flag: 'ok', reason: '' };
}

interface Entry { welderId: string; fact: Fact; }
const groupKey = (welderId: string, wpsId: string, itpId: string) => `${welderId}|${wpsId}|${itpId}`;
/** Compliance entries: every welded, non-tracer weld once per welder (limited to the chosen welders when that filter is set). */
function entries(scope: Fact[], welderIds: string[] = []): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const fact of scope) {
    if (!isWelded(fact.weld) || isTracerWeld(fact.weld)) continue;
    for (const welderId of fact.welderIds) {
      if (welderIds.length && !welderIds.includes(welderId)) continue;
      const key = groupKey(welderId, fact.wpsId, fact.itpId);
      groups.set(key, [...(groups.get(key) ?? []), { welderId, fact }]);
    }
  }
  return groups;
}

/**
 * Compliance groups for the welds in `scope` (facts of the dashboard). Welds without a welder are not welded yet and
 * tracer welds are outside the compliance; both are left out. Order: welder number, not-compliant groups first inside
 * one welder, then total welds and ITP/KNR ascending.
 */
export function inspectionCompliance(rows: DashboardRows, scope: Fact[], welderFilter: string[] = []): ComplianceGroup[] {
  const welders = new Map(live(rows.welders).map(row => [row.id, row]));
  const wps = new Map(live(rows.wps).map(row => [row.id, row]));
  const itps = new Map(live(rows.itps).map(row => [row.id, row]));
  const allWelds = live(rows.tracerWelds ?? rows.welds), results = rows.results;
  const output = [...entries(scope, welderFilter)].map(([key, members]): ComplianceGroup => {
    const { welderId, fact: first } = members[0], itp = itps.get(first.itpId), welder = welders.get(welderId);
    const itpPercent = itpNdtPercent(itp), usedPercent = itpPercent ?? DEFAULT_NDT_PERCENT;
    const welds = members.map(member => member.fact.weld);
    const total = welds.length, required = requiredExaminations(total, usedPercent);
    const examined = welds.filter(weld => isNdtCompleted(results, weld)).length;
    const selected = welds.filter(weld => weld.ndoReq === true && !isNdtCompleted(results, weld)).length;
    const remaining = Math.max(0, required - examined - selected);
    const rejectedWelds = welds.filter(weld => openRejection(weld, allWelds, results));
    const tracers = rejectedWelds.flatMap(weld => tracersOf(weld, allWelds));
    const missingTracers = rejectedWelds.reduce((sum, weld) => sum + Math.max(0, TRACERS_REQUIRED - tracersOf(weld, allWelds).length), 0);
    const counts = {
      welds: total, examined, examinedPercent: share(examined, total), rejected: rejectedWelds.length, rejectedPercent: share(rejectedWelds.length, examined),
      tracerWelds: tracers.length, tracerExamined: tracers.filter(weld => isNdtCompleted(results, weld)).length, tracerRejected: tracers.filter(weld => notAccepted(weld, results)).length,
      expectedTracers: rejectedWelds.length * TRACERS_REQUIRED, missingTracers,
    };
    const flag = defectFlag(counts);
    return {
      key, welderId, welderNumber: text(welder?.number), welderName: text(welder?.name), welderLabel: welderLabel(welder),
      wpsId: first.wpsId, wpsName: text(wps.get(first.wpsId)?.name) || COMPLIANCE_TEXTS.noWps,
      itpId: first.itpId, itpNumber: itp ? text(itp.number) : UNASSIGNED, itpPercent, usedPercent, usesFallback: itpPercent === null,
      percentLabel: itpPercent === null ? 'Fallback 10%' : percentLabel(itpPercent), issue: !itp ? ISSUE_NO_LINK : itpPercent === null ? ISSUE_NO_PERCENT : '',
      total, weldsByType: typeBreakdown(members.map(member => member.fact)), required, examined, selected, remaining, compliant: remaining === 0,
      testedPercent: barPercent(examined, required), selectedPercent: barPercent(selected, required), remainingPercent: barPercent(remaining, required),
      defects: { ...counts, flag: flag.flag, flagReason: flag.reason, tracerStatus: tracerStatus(counts), tracerAction: missingTracers > 0 || rejectedWelds.length > 0, tracerHint: missingTracers > 0 ? `Missing ${missingTracers}` : 'Open details' },
      weldIds: welds.map(weld => weld.id),
    };
  });
  const welderKey = (group: ComplianceGroup) => group.welderNumber || group.welderName || group.welderId;
  return output.sort((a, b) => natural(welderKey(a), welderKey(b)) || natural(a.welderId, b.welderId) || Number(a.compliant) - Number(b.compliant) || a.total - b.total || natural(a.itpNumber, b.itpNumber) || natural(a.wpsName, b.wpsName));
}

export interface ComplianceSummary {
  totalWelds: number; weldsByType: WeldTypeCount[]; required: number; examined: number; selected: number; remaining: number;
  fallbackGroups: number; totalGroups: number; compliantGroups: number; notCompliantGroups: number; status: 'COMPLIANT' | 'NOT COMPLIANT';
}
/** The six tiles above the group list; they always cover every group, not only the page shown. */
export function complianceSummary(groups: ComplianceGroup[]): ComplianceSummary {
  const sum = (pick: (group: ComplianceGroup) => number) => groups.reduce((total, group) => total + pick(group), 0);
  const byType = new Map<string, WeldTypeCount>();
  for (const item of groups.flatMap(group => group.weldsByType)) { const entry = byType.get(item.key) ?? { ...item, count: 0 }; entry.count += item.count; byType.set(item.key, entry); }
  const compliantGroups = groups.filter(group => group.compliant).length;
  return {
    totalWelds: sum(group => group.total), weldsByType: [...byType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    required: sum(group => group.required), examined: sum(group => group.examined), selected: sum(group => group.selected), remaining: sum(group => group.remaining),
    fallbackGroups: groups.filter(group => group.usesFallback).length, totalGroups: groups.length, compliantGroups, notCompliantGroups: groups.length - compliantGroups,
    status: compliantGroups === groups.length ? 'COMPLIANT' : 'NOT COMPLIANT',
  };
}
/**
 * Data quality lines of the compliance block (reference inspection_compliance_warnings): isometrics in scope whose ITP
 * number is free text only (not linked to the register), and linked ITP/KNR entries without an NDT %.
 */
export function complianceWarnings(rows: DashboardRows, scope: Fact[]): string[] {
  const isos = new Map(scope.filter(fact => fact.iso).map(fact => [fact.iso!.id, fact.iso!]));
  const unmapped = [...isos.values()].filter(iso => (text(iso.itpNo) && !text(iso.itpId)) || (text(iso.itpNo2) && !text(iso.itp2Id))).length;
  const used = new Set(scope.map(fact => fact.itpId).filter(Boolean));
  const missing = live(rows.itps).filter(itp => used.has(itp.id) && itpNdtPercent(itp) === null).map(itp => text(itp.number)).filter(Boolean).sort(natural);
  return [
    ...(unmapped ? [`${unmapped} isometrics still miss a central ITP/KNR link.`] : []),
    ...(missing.length ? [`Missing central percentage for: ${missing.slice(0, 6).join(', ')}.`] : []),
  ];
}

// ----- filter labels, summary line and refresh ----------------------------------------------------------------------

/** Option texts of the reference filters. */
export const welderOptionLabel = (welder: Row) => `${text(welder.number)} | ${text(welder.name)}`;
const percentText = (value: number) => String(Math.round(value * 100) / 100);
export const itpOptionLabel = (itp: Row) => `${text(itp.number)} | ${percentText(itpNdtPercent(itp) ?? DEFAULT_NDT_PERCENT)}%`;
export const FILTER_PLACEHOLDERS = { projects: 'All sub-projects', welders: 'All welders', wps: 'All wps methods', itp: 'All ITPs', customField: 'All custom fields', any: 'All' } as const;
/** Filter labels of the dashboard form (client change list 22.11.2026: Intern prj. no. -> Sub-project, ITP/KNR -> ITP, IRN -> Custom field). */
export const FILTER_LABELS = { project: 'Sub-project', itp: 'ITP', customField: 'Custom field' } as const;
/** The dashboard reloads its data every 3 minutes while it is open (reference setInterval 180000). */
export const DASHBOARD_REFRESH_MS = 180_000;
export function scheduleDashboardRefresh(run: () => void, timers: { setInterval: typeof setInterval; clearInterval: typeof clearInterval } = globalThis): () => void {
  const handle = timers.setInterval(run, DASHBOARD_REFRESH_MS);
  return () => timers.clearInterval(handle);
}

// ----- tracer proposal of a compliance group ------------------------------------------------------------------------

export interface GroupTracerWeld { id: string; weldNo: string; isoNo: string; projectNo: string; typeLabel: string; date: string; statusLabel: string; locked: boolean; }
export interface GroupTracerSource { source: GroupTracerWeld; linked: number; expected: number; missing: number; locked: number; removable: number; currentTracers: GroupTracerWeld[]; candidates: GroupTracerWeld[]; }
export interface GroupTracerProposal {
  group: { welderId: string; welderLabel: string; wpsId: string; wpsLabel: string; itpId: string; itpLabel: string; ndtPercent: number };
  status: { defectFlag: DefectFlag; defectFlagReason: string; rejectedWelds: number; expectedTracers: number; existingTracers: number; missingTracers: number; lockedTracers: number; removableTracers: number; candidateCount: number };
  sources: GroupTracerSource[]; warnings: string[];
}
export const NO_TRACER_CANDIDATES = 'No eligible tracer candidates found inside this welder / WPS / ITP-KNR group.';
export interface GroupKey { welderId: string; wpsId: string; itpId: string; }
/**
 * Tracer proposal opened from a compliance group (reference ajax-weld-dashboard-tracers.php action=list): every
 * rejected weld of the group is a source; its candidates are welds of the same group that are not examined yet (no
 * NDT request or result), not a source, not in the source's repair chain and not a tracer elsewhere, and that the
 * server's tracer rule accepts for this welder (`inTracerGroup`). Built over the whole main project, no filter.
 */
export function groupTracerProposal(rows: DashboardRows, key: GroupKey, context: TracerContext): GroupTracerProposal | null {
  const scope = facts(rows);
  const group = inspectionCompliance(rows, scope, [key.welderId]).find(item => item.welderId === key.welderId && item.wpsId === key.wpsId && item.itpId === key.itpId);
  if (!group) return null;
  const allWelds = live(rows.tracerWelds ?? rows.welds), results = rows.results;
  const isos = new Map(live(rows.isometrics).map(row => [row.id, row])), projects = new Map(live(rows.projects).map(row => [row.id, row]));
  const types = new Map(live(rows.weldTypes).map(row => [row.id, row]));
  const members = group.weldIds.map(id => allWelds.find(weld => weld.id === id)!).filter(Boolean);
  const view = (weld: Row, statusLabel: string, locked = false): GroupTracerWeld => {
    const iso = isos.get(String(weld.isoId));
    return { id: weld.id, weldNo: text(weld.weldNo), isoNo: text(iso?.isoNo), projectNo: text(projects.get(String(iso?.projectId))?.internnumber), typeLabel: text(types.get(String(weld.typeId))?.location), date: text(weld.date), statusLabel, locked };
  };
  const sourceRows = members.filter(weld => openRejection(weld, allWelds, results)).sort((a, b) => natural(text(a.weldNo), text(b.weldNo)));
  const sourceIds = new Set(sourceRows.map(weld => weld.id));
  const sources = sourceRows.map((source): GroupTracerSource => {
    const chain = new Set([repairRoot(source, allWelds).id, ...repairChain(repairRoot(source, allWelds), allWelds).map(weld => weld.id)]);
    const rule = tracerGroup(source, results, context, key.welderId);
    const current = tracersOf(source, allWelds).map(tracer => { const locked = hasNdtActivity(tracer, context, results); return view(tracer, locked ? 'Requested' : 'Open', locked); });
    const candidates = members.filter(weld => !sourceIds.has(weld.id) && !chain.has(weld.id) && !text(weld.tracerOfId) && !tracersOf(weld, allWelds).length && !hasNdtActivity(weld, context, results) && inTracerGroup(weld, rule, context))
      .sort((a, b) => natural(text(a.date), text(b.date)) || natural(text(a.weldNo), text(b.weldNo))).map(weld => view(weld, 'Open'));
    const locked = current.filter(item => item.locked).length;
    return { source: view(source, 'Rejected weld'), linked: current.length, expected: TRACERS_REQUIRED, missing: Math.max(0, TRACERS_REQUIRED - current.length), locked, removable: current.length - locked, currentTracers: current, candidates };
  });
  const candidateCount = new Set(sources.flatMap(source => source.candidates.map(item => item.id))).size;
  return {
    group: { welderId: key.welderId, welderLabel: group.welderLabel, wpsId: group.wpsId, wpsLabel: group.wpsName, itpId: group.itpId, itpLabel: group.itpNumber, ndtPercent: group.usedPercent },
    status: {
      defectFlag: group.defects.flag, defectFlagReason: group.defects.flagReason, rejectedWelds: sources.length, expectedTracers: sources.length * TRACERS_REQUIRED,
      existingTracers: sources.reduce((sum, item) => sum + item.linked, 0), missingTracers: sources.reduce((sum, item) => sum + item.missing, 0),
      lockedTracers: sources.reduce((sum, item) => sum + item.locked, 0), removableTracers: sources.reduce((sum, item) => sum + item.removable, 0), candidateCount,
    },
    sources, warnings: sources.length && !candidateCount ? [NO_TRACER_CANDIDATES] : [],
  };
}
