import type { Row } from './types.ts';
import { newest } from './iso-status.ts';
import { DEFAULT_NDT_PERCENT, isoItpId, itpNdtPercent } from './itp-dashboard.ts';
import { repairPerformanceLimit } from './site-settings.ts';

/**
 * Weld Pilot dashboard: KPI cards and Inspection compliance. Pure functions over plain rows (no I/O).
 *
 * Rules taken from the reference capture (weld-isometric.md, "Dashboard (Start)"):
 * - Examined % = welds with an NDT result and a welder, as a share of the scope;
 * - Repair rate = repaired / welded, welds without a welder excluded;
 * - Repair performance = the value against the main project's limit (empty limit = 5 %);
 * - compliance groups welds by welder + WPS + ITP/KNR; required examination = ceil(welds x NDT %), 10 % when
 *   no ITP/KNR is linked; examined counts completed NDT only; selected = NDT required and not completed;
 *   tracer welds are not part of the compliance.
 * Explicit simplifications are named below and listed as unverified in PARITY.md.
 */

export interface DashboardRows {
  welds: Row[]; isometrics: Row[]; projects: Row[]; weldTypes: Row[]; welders: Row[]; wps: Row[]; itps: Row[];
  ndtProcesses: Row[]; ndtGroups?: Row[]; requests: Row[]; results: Row[];
}
export interface DashboardFilters {
  from: string; to: string; companyId: string; location: '' | 'Shop' | 'Field'; projectId: string; welderId: string; itpId: string;
  pipingClass: string; irn: string; ped: string; material: string; ndtGroupId: string; ndtProcessId: string; wpsId: string;
}
export const NO_DASHBOARD_FILTERS: DashboardFilters = { from: '', to: '', companyId: '', location: '', projectId: '', welderId: '', itpId: '', pipingClass: '', irn: '', ped: '', material: '', ndtGroupId: '', ndtProcessId: '', wpsId: '' };
export const dashboardFilterCount = (filters: DashboardFilters) => (Object.keys(NO_DASHBOARD_FILTERS) as (keyof DashboardFilters)[]).filter(key => filters[key] !== '').length;

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const round1 = (value: number) => Math.round(value * 10) / 10;
/** One decimal; 0 when the denominator is 0, so an empty scope never shows NaN. */
export const share = (part: number, whole: number) => whole > 0 ? round1(part / whole * 100) : 0;

// ----- predicates on one weld ------------------------------------------------------------------------------------

/** Welder ids of a weld, in slot order. */
export const weldWelderIds = (weld: Row) => [1, 2, 3, 4].map(side => text(weld[`welder${side}Id`])).filter(Boolean);
/** The weld has been welded: at least one welder is recorded. */
export const isWelded = (weld: Row) => weldWelderIds(weld).length > 0;
/** The welder a compliance group is counted under: the first welder recorded on the weld. */
export const primaryWelder = (weld: Row) => weldWelderIds(weld)[0] ?? '';
/** Tracer welds. The inspections code has no predicate of its own, so the weld's tracer flag decides. */
export const isTracerWeld = (weld: Row) => weld.tracer === true;

const NDT = 'NDT';
/** NDT results of a weld, newest first. */
const ndtResults = (results: Row[], weldId: string) => live(results).filter(row => row.weldId === weldId && text(row.type) === NDT && ['Accepted', 'Rejected'].includes(text(row.result))).sort(newest);
/** The weld's NDT is completed: it has an accepted or rejected NDT result (simplest explicit rule; rounds are not tracked). */
export const isNdtCompleted = (results: Row[], weldId: string) => ndtResults(results, weldId).length > 0;
/** The latest NDT result of the weld is Rejected. */
export const isNdtRejected = (results: Row[], weldId: string) => ndtResults(results, weldId)[0]?.result === 'Rejected';

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
  weld: Row; iso: Row | undefined; projectId: string; welderIds: string[]; welderId: string; companyId: string; wpsId: string; itpId: string;
  location: string; processIds: Set<string>; groupIds: Set<string>;
}
function facts(rows: DashboardRows): Fact[] {
  const isos = new Map(live(rows.isometrics).map(row => [row.id, row]));
  const welders = new Map(live(rows.welders).map(row => [row.id, row]));
  const types = new Map(live(rows.weldTypes).map(row => [row.id, row]));
  const processes = new Map(live(rows.ndtProcesses).map(row => [row.id, row]));
  const requests = live(rows.requests).filter(row => text(row.type) === NDT);
  return live(rows.welds).filter(weld => isos.has(String(weld.isoId))).map(weld => {
    const iso = isos.get(String(weld.isoId));
    const welderId = primaryWelder(weld);
    const processIds = new Set(requests.filter(request => request.weldId === weld.id).map(request => text(request.processId)).filter(Boolean));
    return {
      weld, iso, projectId: text(iso?.projectId), welderIds: weldWelderIds(weld), welderId, companyId: text(welders.get(welderId)?.companyId), wpsId: text(weld.wpsId), itpId: isoItpId(iso),
      location: text(types.get(String(weld.typeId))?.location), processIds, groupIds: new Set([...processIds].map(id => text(processes.get(id)?.groupId)).filter(Boolean)),
    };
  });
}
function inScope(fact: Fact, f: DashboardFilters): boolean {
  const date = text(fact.weld.date);
  if ((f.from || f.to) && !date) return false;
  if (f.from && date < f.from) return false;
  if (f.to && date > f.to) return false;
  if (f.companyId && fact.companyId !== f.companyId) return false;
  if (f.location && fact.location !== f.location) return false;
  if (f.projectId && fact.projectId !== f.projectId) return false;
  if (f.welderId && !fact.welderIds.includes(f.welderId)) return false;
  if (f.itpId && fact.itpId !== f.itpId) return false;
  if (f.pipingClass && text(fact.iso?.pipingClass) !== f.pipingClass) return false;
  if (f.irn && text(fact.iso?.irn) !== f.irn) return false;
  if (f.ped && text(fact.iso?.ped) !== f.ped) return false;
  if (f.material && text(fact.iso?.material) !== f.material) return false;
  if (f.ndtProcessId && !fact.processIds.has(f.ndtProcessId)) return false;
  if (f.ndtGroupId && !fact.groupIds.has(f.ndtGroupId)) return false;
  if (f.wpsId && fact.wpsId !== f.wpsId) return false;
  return true;
}

// ----- KPI cards -----------------------------------------------------------------------------------------------------

export interface WeldTypeCount { key: string; label: string; count: number; }
export interface RepairPerformance { value: number; limit: number; aboveLimit: boolean; scope: string; }
export interface DashboardKpis {
  projects: number; isometrics: number; totalWelds: number; weldsByType: WeldTypeCount[];
  welded: number; examined: number; examinedPercent: number; repaired: number; repairRate: number; repairPerformance: RepairPerformance;
}
/** Short label of a weld type: its abbreviation, else its name. */
export const weldTypeLabel = (type: Row | undefined) => text(type?.abbreviation) || text(type?.name) || 'No type';

export interface DashboardResult { kpis: DashboardKpis; compliance: ComplianceGroup[]; scopeWelds: number; }

/**
 * Everything the dashboard shows for the filters. `site` is the main project (project site) carrying the repair
 * performance limit. Projects and isometrics count the whole workspace while no filter is set, otherwise the
 * distinct ones among the filtered welds.
 */
export function weldDashboard(rows: DashboardRows, filters: DashboardFilters, site?: Row | null): DashboardResult {
  const all = facts(rows), scope = all.filter(fact => inScope(fact, filters));
  const results = rows.results;
  const welded = scope.filter(fact => isWelded(fact.weld));
  const examined = welded.filter(fact => isNdtCompleted(results, fact.weld.id));
  const repaired = welded.filter(fact => fact.weld.repair === true);
  const types = new Map(live(rows.weldTypes).map(row => [row.id, row]));
  const byType = new Map<string, WeldTypeCount>();
  for (const fact of scope) {
    // Shop and Field types of one kind share an abbreviation (BW, BR, ...) and are counted together.
    const type = types.get(String(fact.weld.typeId)), label = weldTypeLabel(type), key = label;
    const entry = byType.get(key) ?? { key, label, count: 0 };
    entry.count++; byType.set(key, entry);
  }
  const active = dashboardFilterCount(filters) > 0;
  const repairRate = share(repaired.length, welded.length);
  const limit = repairPerformanceLimit(site);
  return {
    scopeWelds: scope.length,
    kpis: {
      projects: active ? new Set(scope.map(fact => fact.projectId).filter(Boolean)).size : live(rows.projects).length,
      isometrics: active ? new Set(scope.map(fact => fact.weld.isoId)).size : live(rows.isometrics).length,
      totalWelds: scope.length, weldsByType: [...byType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      welded: welded.length, examined: examined.length, examinedPercent: share(examined.length, scope.length),
      repaired: repaired.length, repairRate,
      repairPerformance: { value: repairRate, limit, aboveLimit: repairRate > limit, scope: `${repaired.length} of ${welded.length} welded welds` },
    },
    compliance: inspectionCompliance(rows, scope),
  };
}

// ----- inspection compliance -----------------------------------------------------------------------------------------

export interface DefectBlock {
  /** Welds of the welder and WPS, tracers not counted. */ welds: number;
  examined: number; examinedPercent: number; rejected: number; rejectedPercent: number; tracers: number;
}
export interface ComplianceGroup {
  key: string; welderId: string; welderName: string; wpsId: string; wpsName: string; itpId: string; itpNumber: string;
  /** NDT % of the linked ITP / KNR, or null while none is linked (the default percent is then used). */
  itpPercent: number | null; usedPercent: number;
  total: number; required: number; examined: number; selected: number;
  /** Required examinations that are neither done nor selected yet. */ remaining: number;
  compliant: boolean;
  /** Segments of the Tested / Selected / Remaining bar, in whole welds; they add up to `required`. */
  bar: { tested: number; selected: number; remaining: number };
  defects: DefectBlock;
}
const personName = (row: Row | undefined) => text(row?.name) || text(row?.number) || 'Unknown welder';

/**
 * Compliance groups for the welds in `scope` (facts of the dashboard). Welds without a welder are not welded yet
 * and tracer welds are outside the compliance; both are left out. The defect block works per welder + WPS over
 * every ITP/KNR of that pair and reports the tracers separately.
 */
export function inspectionCompliance(rows: DashboardRows, scope: Fact[]): ComplianceGroup[] {
  const welders = new Map(live(rows.welders).map(row => [row.id, row]));
  const wps = new Map(live(rows.wps).map(row => [row.id, row]));
  const itps = new Map(live(rows.itps).map(row => [row.id, row]));
  const groups = new Map<string, Fact[]>(), pairs = new Map<string, Fact[]>();
  for (const fact of scope.filter(fact => isWelded(fact.weld))) {
    const pair = `${fact.welderId}|${fact.wpsId}`;
    pairs.set(pair, [...(pairs.get(pair) ?? []), fact]);
    if (isTracerWeld(fact.weld)) continue;
    const key = `${pair}|${fact.itpId}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  const defects = new Map([...pairs].map(([pair, members]) => {
    const plain = members.filter(fact => !isTracerWeld(fact.weld));
    const examined = plain.filter(fact => isNdtCompleted(rows.results, fact.weld.id)).length;
    const rejected = plain.filter(fact => isNdtRejected(rows.results, fact.weld.id)).length;
    return [pair, { welds: plain.length, examined, examinedPercent: share(examined, plain.length), rejected, rejectedPercent: share(rejected, examined), tracers: members.length - plain.length } satisfies DefectBlock];
  }));
  const output = [...groups].map(([key, members]): ComplianceGroup => {
    const first = members[0], itp = itps.get(first.itpId);
    const itpPercent = itpNdtPercent(itp), usedPercent = itpPercent ?? DEFAULT_NDT_PERCENT;
    const total = members.length, required = requiredExaminations(total, usedPercent);
    const examined = members.filter(fact => isNdtCompleted(rows.results, fact.weld.id)).length;
    const selected = members.filter(fact => fact.weld.ndoReq === true && !isNdtCompleted(rows.results, fact.weld.id)).length;
    const tested = Math.min(examined, required), chosen = Math.min(selected, required - tested);
    return {
      key, welderId: first.welderId, welderName: personName(welders.get(first.welderId)), wpsId: first.wpsId, wpsName: text(wps.get(first.wpsId)?.name) || 'No WPS',
      itpId: first.itpId, itpNumber: itp ? text(itp.number) : 'No ITP/KNR', itpPercent, usedPercent, total, required, examined, selected,
      remaining: Math.max(0, required - examined - selected), compliant: examined >= required,
      bar: { tested, selected: chosen, remaining: required - tested - chosen },
      defects: defects.get(`${first.welderId}|${first.wpsId}`)!,
    };
  });
  return output.sort((a, b) => Number(a.compliant) - Number(b.compliant) || a.welderName.localeCompare(b.welderName, 'en', { numeric: true }) || a.wpsName.localeCompare(b.wpsName, 'en', { numeric: true }) || a.itpNumber.localeCompare(b.itpNumber, 'en', { numeric: true }));
}

// ----- group list: filter, search, paging -----------------------------------------------------------------------------

export const GROUP_FILTERS = ['Not compliant', 'Compliant', 'All groups'] as const;
export type GroupFilter = typeof GROUP_FILTERS[number];
export const COMPLIANCE_PAGE_SIZE = 10;

export function filterGroups(groups: ComplianceGroup[], mode: GroupFilter, query: string): ComplianceGroup[] {
  const needle = query.trim().toLowerCase();
  return groups.filter(group => (mode === 'All groups' || group.compliant === (mode === 'Compliant'))
    && (!needle || [group.welderName, group.wpsName, group.itpNumber].some(value => value.toLowerCase().includes(needle))));
}
/** One page (0-based) of `items`; the page is clamped into range. */
export function pageOf<T>(items: T[], page: number, size = COMPLIANCE_PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size)), at = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1);
  return { items: items.slice(at * size, at * size + size), page: at, pages };
}
