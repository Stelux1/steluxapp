import type { Row } from './types.ts';
import { lineRequirementIds, materialIdentity, materialRecord, requirementExecution } from './materials.ts';
import { priorityLabel } from './priority.ts';
import { freePool as sitePools, pickClaims, pickIssued, poolKey, spoolLocation } from './mto-logistics.ts';
import { isoSiteId } from './mto-stock.ts';

/**
 * MTO Pilot dashboard (Start). Every number on the page comes from `mtoDashboard()` below: pure functions over the
 * workspace rows the pilot already loads (collections keyed by resource), so the client and the tests run the same code.
 *
 * The definitions were recomputed from the reference sandbox (mto__start__dashboard.txt, phase Shop, and
 * mto__start__dashboard__phase.txt, phase Field); tests/mto-dashboard.test.ts reproduces both captures. Rules the
 * captures do not settle are marked UNVERIFIED: `allocateCoverage` (order of sharing the pool), `exceptionScore`,
 * `logisticsSignalOf` (service-company wording), `serverFilterEntries` (spool and supplier).
 */
type Rows = Record<string, Row[]>;
const active = (rows: Rows, key: string) => (rows[key] || []).filter(row => !row._archived);
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const text = (value: unknown) => String(value ?? '').trim();
const day = (value: unknown) => text(value).slice(0, 10);
const byNumber = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const byIso = (a: Row, b: Row) => byNumber(String(a.isoNo ?? ''), String(b.isoNo ?? '')) || a.id.localeCompare(b.id);

/** Resources the dashboard reads; without all of them the page shows its no-access state. */
export const MTO_DASHBOARD_REQUIRED = ['isometrics', 'iso_materials', 'stock', 'reservations', 'picklists', 'orders', 'order_lines'];
/** Read when the account can see them; the dashboard still works (with less detail) without them. */
export const MTO_DASHBOARD_OPTIONAL = ['operation_phases', 'material_location_events', 'service_requests', 'spools', 'material_quantity_changes', 'projects'];

/**
 * The dashboard's page areas (reference profile areas, mto__system__profiles.txt): "Dashboard - Spools locations" 1,
 * "Dashboard - Pending materials" 2, "Dashboard - Pending orders" 3. Client answer 17.11.2026: the dashboard is the same for
 * everyone. An account that holds any of the three areas may open it and sees every panel (logistics: signal chart, aging chips,
 * the Logistics / aging column and views; materials: KPI cards, chips, Readiness focus, Operations board; orders: Ordered /
 * Received / Open ordered chips, the Backlog chart, the Open ordered view); the data stays limited to the records it may read.
 */
export const MTO_DASHBOARD_PANEL_AREAS = { logistics: '1', materials: '2', orders: '3' } as const;
export type DashboardPanel = keyof typeof MTO_DASHBOARD_PANEL_AREAS;
export function dashboardPanels(canArea: (key: string) => boolean): Record<DashboardPanel, boolean> {
  const open = Object.values(MTO_DASHBOARD_PANEL_AREAS).some(area => canArea(area));
  return Object.fromEntries(Object.keys(MTO_DASHBOARD_PANEL_AREAS).map(panel => [panel, open])) as Record<DashboardPanel, boolean>;
}

export const READINESS = ['STARTED', 'STARTABLE', 'PARTIAL', 'BLOCKED'] as const;
export type Readiness = typeof READINESS[number];
/** The readiness badge as the reference writes it (mto__start__dashboard.txt:182-184). */
export const READINESS_LABEL: Record<Readiness, string> = { STARTED: 'Started', STARTABLE: 'Startable', PARTIAL: 'Partial', BLOCKED: 'Blocked' };
export const SIGNALS = ['Not-sent', 'At service', 'At laydown', 'Started'] as const;
export type LogisticsSignal = typeof SIGNALS[number];
/** The signal word of the Logistics / aging cell: "Not-sent", "Laydown", "Started" (captured); "Service" is UNVERIFIED. */
export const SIGNAL_LABEL: Record<LogisticsSignal, string> = { 'Not-sent': 'Not-sent', 'At service': 'Service', 'At laydown': 'Laydown', Started: 'Started' };
export const AGING_BUCKETS = ['0-7 days', '8-14 days', '15+ days'] as const;
export type AgingBucket = typeof AGING_BUCKETS[number];

/** The quick filters of the Operations board, in the reference order and wording (mto__start__dashboard.txt:156-164). */
export const BOARD_TABS = ['All', 'Startable', 'Partial', 'Blocked', 'Open ordered', 'Not ordered', 'At service', 'At laydown', 'Aging'] as const;
export type BoardTab = typeof BOARD_TABS[number];
/** "Open ordered" shows material rows instead of isometrics (syncBoardLayout, mto__start__dashboard.txt:2709-2724). */
export const MATERIAL_VIEW_TAB: BoardTab = 'Open ordered';
export const MATERIAL_VIEW_COLUMNS = ['Material number', 'Description', 'Shortage', 'Open ordered', 'Not ordered'] as const;
export const BOARD_COLUMNS = ['Project / ISO', 'Readiness', 'Shortage', 'Blocking backorder', 'Not ordered', 'Logistics / aging', 'Action'] as const;
/** Show 4 / 25 / 50 / 100 entries, 4 first (mto__start__dashboard.txt:2778-2779). */
export const BOARD_PAGE_SIZES = [4, 25, 50, 100] as const;
export const BOARD_PAGE_SIZE = BOARD_PAGE_SIZES[0];
/** The board reloads every 45 seconds while the page is open (mto__start__dashboard.txt:2825-2830). */
export const BOARD_RELOAD_MS = 45000;
export const FOCUS_SIZE = 5;
/** The tab a KPI card opens (its data-filter, mto__start__dashboard.txt:130-135). */
export const KPI_FILTERS = { startable: 'Startable', partial: 'Partial', blocked: 'Blocked', backorder: 'Open ordered', notOrdered: 'Not ordered', freePool: 'All' } as const satisfies Record<string, BoardTab>;

// ----- scope ---------------------------------------------------------------------------------------------------------

/** The Operation phase the dashboard opens on: the phase named Shop, else the first phase of the list; '' without phases. */
export function defaultDashboardPhase(phases: Row[]): string {
  const list = phases.filter(row => !row._archived);
  return (list.find(row => text(row.name).toLowerCase() === 'shop') || list[0])?.id ?? '';
}

/**
 * Server-side filters of the dashboard (deep links, reference `serverFilters`): project, spool, supplier and the operation
 * phase (`type`; '0' = all operation phases). Read from the URL; absent values stay empty.
 */
export interface DashboardFilters { phaseId: string; projectId: string; spoolId: string; supplierId: string }
export const DASHBOARD_FILTER_PARAMS = { projectId: 'project', spoolId: 'spool', supplierId: 'supplier', phaseId: 'type' } as const;
export const ALL_PHASES = '0';
export function dashboardFilters(params: URLSearchParams, defaultPhase: string): DashboardFilters {
  const type = params.get(DASHBOARD_FILTER_PARAMS.phaseId);
  return {
    phaseId: type === null ? defaultPhase : type === ALL_PHASES ? '' : type,
    projectId: text(params.get(DASHBOARD_FILTER_PARAMS.projectId)), spoolId: text(params.get(DASHBOARD_FILTER_PARAMS.spoolId)), supplierId: text(params.get(DASHBOARD_FILTER_PARAMS.supplierId)),
  };
}

// ----- definitions ---------------------------------------------------------------------------------------------------

export interface FreePool { stock: number; reserved: number; claimed: number; free: number }
/**
 * Free pool per material and project site (the one rule of shared/mto-logistics.ts `freePool`): the site's Material
 * inventory − quantities reserved for isometrics − quantities on pick lists not taken yet, never below zero. Stock is
 * already net of take-ins and issues. Storehouse lines are not in it.
 */
export function freePoolByMaterial(rows: Rows): Map<string, FreePool> {
  return new Map([...sitePools(rows)].map(([key, pool]) => [key, { ...pool, free: round(Math.max(0, pool.free)) }]));
}

/** Priority rank of an isometric: "Prio 1" first … "Prio 5", "No priority" last. */
export function priorityRank(iso: Row): number {
  const match = /^Prio (\d+)$/.exec(priorityLabel(iso.priority));
  return match ? Number(match[1]) : 99;
}

/** Readiness of an isometric once its coverage is known: STARTED (a pick list exists) wins over the coverage states. */
export function readinessOf(input: { required: number; covered: number; started: boolean }): Readiness {
  if (input.started) return 'STARTED';
  if (input.covered >= input.required) return 'STARTABLE';
  return input.covered > 0 ? 'PARTIAL' : 'BLOCKED';
}

export interface ScopeLine {
  requirementId: string; isoId: string; identity: string; pool: string; material: Row; phaseId: string;
  required: number; picked: number; claimed: number; reserved: number; fromFree: number; covered: number; shortage: number;
  blockingBackorder: number; notOrdered: number; openLinked: number; openExtra: number;
}
interface Entry { requirement: Row; iso: Row; material: Row; identity: string; pool: string; required: number; picked: number }
type Own = (requirementId: string) => number;

/**
 * Covered = min(required, picked + own untaken pick list + own reservations + share of the free pool). A quantity on
 * the isometric's own pick list that is not taken yet counts as covered for its line and is not in the free pool for
 * anyone (reference 00022 "Covered 2 / 2" with stock 0). UNVERIFIED: the free pool of a material is handed out isometric
 * by isometric in priority order, then ISO number (lines in creation order); what one isometric takes is gone for the next.
 */
export function allocateCoverage(entries: Entry[], reservedFor: Own, claimedFor: Own, pools: Map<string, FreePool>): ScopeLine[] {
  const left = new Map([...pools].map(([key, pool]) => [key, pool.free]));
  const order = [...new Set(entries.map(entry => entry.iso))].sort((a, b) => priorityRank(a) - priorityRank(b) || byIso(a, b));
  const lines: ScopeLine[] = [];
  for (const iso of order) {
    for (const entry of entries.filter(item => item.iso.id === iso.id)) {
      const reserved = round(Math.max(0, reservedFor(entry.requirement.id))), claimed = round(Math.max(0, claimedFor(entry.requirement.id)));
      const need = Math.max(0, round(entry.required - entry.picked - claimed - reserved));
      const fromFree = round(Math.min(need, left.get(entry.pool) ?? 0));
      left.set(entry.pool, round((left.get(entry.pool) ?? 0) - fromFree));
      const covered = round(Math.min(entry.required, entry.picked + claimed + reserved + fromFree));
      lines.push({ requirementId: entry.requirement.id, isoId: iso.id, identity: entry.identity, pool: entry.pool, material: entry.material, phaseId: text(entry.requirement.phaseId), required: entry.required, picked: entry.picked, claimed, reserved, fromFree, covered, shortage: round(entry.required - covered), blockingBackorder: 0, notOrdered: 0, openLinked: 0, openExtra: 0 });
    }
  }
  return lines;
}

/**
 * Max startable = isometrics in scope, started ones included, whose every line could be covered from picked + own
 * pick list + own reservations + the WHOLE free pool, ignoring what other isometrics take (reference Shop: 1 = the
 * started 00022; Field: 2).
 */
export function maxStartable(entries: Entry[], reservedFor: Own, claimedFor: Own, pools: Map<string, FreePool>): number {
  const ids = new Set(entries.map(entry => entry.iso.id));
  return [...ids].filter(isoId => entries.filter(entry => entry.iso.id === isoId).every(entry =>
    Math.max(0, entry.picked) + Math.max(0, claimedFor(entry.requirement.id)) + Math.max(0, reservedFor(entry.requirement.id)) + (pools.get(entry.pool)?.free ?? 0) >= entry.required)).length;
}

/**
 * Splits every line's shortage: what sits on an open order line (ordered, not yet received) is the blocking backorder,
 * the rest is not ordered. An order line belongs to its requirement; one without a requirement belongs to its
 * isometric, and one without an isometric to the order's project, for the same material. Each open quantity is used
 * once, in the same isometric order as `allocateCoverage`.
 */
export function allocateOpenOrders(rows: Rows, lines: ScopeLine[], isoProject: (isoId: string) => string) {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const requirementPool = new Map<string, number>(), isoPool = new Map<string, number>(), projectPool = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, quantity: number) => map.set(key, round((map.get(key) || 0) + quantity));
  const inScope = new Map(lines.map(line => [line.requirementId, line]));
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId)); if (!order || line.additional) continue;
    const open = round(Number(line.quantity || 0) - Number(line.received || 0)); if (open <= 0) continue;
    const identity = materialIdentity(line), ids = lineRequirementIds(line);
    if (ids.length) {
      // Its own requirement, or the requirements a line merged per material was ordered for: in requirement order, each up to its
      // shortage, the rest on the last one (shared/materials.ts gives an ordered quantity out the same way).
      const own = ids.map(id => inScope.get(id)).filter((item): item is ScopeLine => Boolean(item) && item!.identity === identity);
      let left = open;
      own.forEach((item, index) => { const share = index === own.length - 1 ? left : round(Math.min(left, Math.max(0, item.shortage))); if (share > 0) add(requirementPool, item.requirementId, share); left = round(left - share); });
    } else if (line.isoId) add(isoPool, `${line.isoId}|${identity}`, open);
    else add(projectPool, `${text(order.projectId)}|${identity}`, open);
  }
  const take = (map: Map<string, number>, key: string, wanted: number) => { const taken = round(Math.min(wanted, map.get(key) || 0)); if (taken > 0) map.set(key, round((map.get(key) || 0) - taken)); return taken; };
  for (const line of lines) {
    line.openLinked = round(requirementPool.get(line.requirementId) || 0);
    if (line.shortage <= 0) continue;
    let wanted = line.shortage, blocking = take(requirementPool, line.requirementId, wanted);
    wanted = round(wanted - blocking); const viaIso = take(isoPool, `${line.isoId}|${line.identity}`, wanted);
    wanted = round(wanted - viaIso); const viaProject = take(projectPool, `${isoProject(line.isoId)}|${line.identity}`, wanted);
    blocking = round(blocking + viaIso + viaProject); line.openExtra = round(viaIso + viaProject);
    line.blockingBackorder = blocking; line.notOrdered = round(line.shortage - blocking);
  }
}

export interface ScopeOrderLine { identity: string; ordered: number; received: number; open: number }
/**
 * The order lines (of orders not cancelled) of every material in scope, whatever requirement or phase they were ordered
 * for: reference Shop "Ordered 62 Received 45" counts the 10 of 8138268881 ordered for 00022's Field line. Open =
 * ordered − received, never below 0. A project or supplier filter keeps the lines of orders of that project / supplier.
 */
export function orderLinesInScope(rows: Rows, identities: Set<string>, filters: { projectId?: string; supplierId?: string } = {}): ScopeOrderLine[] {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const isoProject = new Map(active(rows, 'isometrics').map(iso => [iso.id, text(iso.projectId)]));
  return active(rows, 'order_lines').flatMap(line => {
    const order = orders.get(text(line.orderId)), identity = materialIdentity(line);
    if (!order || line.additional || !identities.has(identity)) return [];
    if (filters.supplierId && text(order.supplierId) !== filters.supplierId) return [];
    if (filters.projectId && (text(order.projectId) || isoProject.get(text(line.isoId)) || '') !== filters.projectId) return [];
    const ordered = Number(line.quantity || 0), received = Number(line.received || 0);
    return [{ identity, ordered, received, open: round(Math.max(0, ordered - received)) }];
  });
}

export interface LogisticsFact { signal: LogisticsSignal; location: string; date: string }
const nameOf = (rows: Rows, key: string, id: unknown) => text(active(rows, key).find(row => row.id === text(id))?.name);
/**
 * Logistics signal of an isometric from where its things are now. A pick list (the isometric was started) → Started,
 * "Materials issued". Otherwise the current location of its spools (Move to laydown → At laydown with the laydown name,
 * a service request → At service with the company name) and of its requirement lines (material laydown / service
 * company), the latest one winning; its date is the latest Spool history entry of that place (else the location date).
 * Without any: Not-sent, "Not sent".
 */
export function logisticsSignalOf(rows: Rows, isoId: string, started = active(rows, 'picklists').some(row => row.isoId === isoId)): LogisticsFact {
  if (started) return { signal: 'Started', location: 'Materials issued', date: '' };
  const facts: LogisticsFact[] = [];
  const moves = active(rows, 'spool_moves');
  for (const spool of active(rows, 'spools').filter(row => row.isoId === isoId)) {
    const place = spoolLocation(spool); if (!place.id) continue;
    const kind = place.type === 'Service' ? 'Service' : 'Laydown';
    const history = moves.filter(move => move.spoolId === spool.id && move.type === kind).sort((a, b) => text(b.date).localeCompare(text(a.date)));
    const request = place.type === 'Service' ? active(rows, 'service_requests').filter(row => row.spoolId === spool.id && row.status !== 'Completed').sort((a, b) => text(b.date).localeCompare(text(a.date)))[0] : undefined;
    const location = place.type === 'Service' ? nameOf(rows, 'service_companies', place.id) : nameOf(rows, 'laydowns', place.id) || text(history[0]?.location);
    facts.push({ signal: place.type === 'Service' ? 'At service' : 'At laydown', location: location || (place.type === 'Service' ? 'Service' : 'Laydown'), date: day(history[0]?.date || request?.date) });
  }
  const requirements = new Set(active(rows, 'iso_materials').filter(row => row.isoId === isoId).map(row => row.id));
  for (const place of active(rows, 'material_locations').filter(row => requirements.has(text(row.requirementId)) && (row.laydownId || row.companyId))) {
    facts.push(place.companyId ? { signal: 'At service', location: nameOf(rows, 'service_companies', place.companyId) || 'Service', date: day(place.date) }
      : { signal: 'At laydown', location: nameOf(rows, 'material_laydowns', place.laydownId) || 'Laydown', date: day(place.date) });
  }
  facts.sort((a, b) => b.date.localeCompare(a.date));
  return facts[0] || { signal: 'Not-sent', location: 'Not sent', date: '' };
}

/** Whole days between two dates (YYYY-MM-DD), never negative; null when either is missing or invalid. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${day(from)}T00:00:00Z`), b = Date.parse(`${day(to)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : null;
}
/** A date as the board writes it: 20-03-2024. */
export const boardDate = (value: string) => { const date = day(value); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}` : date; };

export interface Aging { ageDays: number | null; text: string }
/**
 * The second part of the Logistics / aging cell (reference :182-184 and the Field capture :104-105):
 *   Started                           → "Materials issued / No log" (no aging);
 *   an open order for its lines        → "Ordered <oldest open order date> / N days", N counted from that date;
 *   else a location with a date        → "<location> / N days", N counted from the date it got there;
 *   else                               → "<location or Not sent> / No log".
 */
export function agingOf(fact: LogisticsFact, oldestOpenOrder: string, today: string): Aging {
  if (fact.signal === 'Started') return { ageDays: null, text: `${fact.location} / No log` };
  const since = oldestOpenOrder ? daysBetween(oldestOpenOrder, today) : null;
  if (since !== null) return { ageDays: since, text: `Ordered ${boardDate(oldestOpenOrder)} / ${since} days` };
  const there = fact.date ? daysBetween(fact.date, today) : null;
  return there !== null ? { ageDays: there, text: `${fact.location} / ${there} days` } : { ageDays: null, text: `${fact.location} / No log` };
}
/** The three aging chips: 0-7, 8-14 and 15+ days. */
export const agingBucket = (days: number | null): AgingBucket | '' => days === null ? '' : days <= 7 ? '0-7 days' : days <= 14 ? '8-14 days' : '15+ days';
/** A chart label as the reference shortens it: names longer than 10 characters become their first 9 and a dot ("Farbara o.", "Materials."). */
export const chartLabel = (name: string) => name.length > 10 ? `${name.slice(0, 9)}.` : name;

// ----- the model ---------------------------------------------------------------------------------------------------

export interface MaterialQuantity { materialNo: string; description: string; quantity: number }
export interface BoardRow {
  isoId: string; isoNo: string; projectId: string; priority: string;
  readiness: Readiness; required: number; covered: number; shortage: number;
  /** Materials short, most first (the cell shows two); materials on a blocking backorder, by material number. */
  shortageMaterials: MaterialQuantity[]; backorderMaterials: MaterialQuantity[];
  blockingBackorder: number; notOrdered: number; openOrdered: number;
  signal: LogisticsSignal; location: string; lastEvent: string; ageDays: number | null; aging: AgingBucket | ''; logistics: string;
  exceptionScore: number; lines: ScopeLine[];
}
export interface MaterialRow { identity: string; materialNo: string; description: string; shortage: number; openOrdered: number; notOrdered: number }
export interface HotMaterial { identity: string; materialNo: string; description: string; isometrics: number; shortage: number; blockingBackorder: number; notOrdered: number }
export interface BacklogRow { scope: 'Site'; openOrdered: number; blockingBackorder: number; notOrdered: number }
export interface LocationBar { location: string; label: string; isometrics: number }
/**
 * Progress cards (client answer 17.11.2026), over the requirement lines and isometrics the dashboard's filters keep. Additional orders are not
 * counted. `ordered` is the covered part of each requirement (never above what it requires); `received` is the part of that which the order
 * lines it is ordered on have received (each line capped at its quantity). The percentages are null when nothing is required / no isometric is in scope.
 */
export interface DashboardProgress { required: number; ordered: number; received: number; orderedPercent: number | null; receivedPercent: number | null; isometrics: number; started: number; startedPercent: number | null }
const percent = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null;
export interface MtoDashboard {
  phaseId: string; today: string; filters: DashboardFilters;
  progress: DashboardProgress;
  board: BoardRow[]; materials: MaterialRow[];
  kpis: { startable: number; started: number; inScope: number; partial: number; blocked: number; reserved: number; blockingQuantity: number; blockingIsometrics: number; notOrderedMaterials: number; notOrderedIsometrics: number; freePoolMaterials: number; openOrdered: number };
  chips: { maxStartable: number; freePoolMaterials: number; ordered: number; received: number; openOrdered: number; blockingBackorder: number; notOrdered: number; aging: Record<AgingBucket, number>; noLogisticsUpdate: number };
  signals: Record<LogisticsSignal, number>;
  locations: LocationBar[];
  backlog: BacklogRow[];
  focus: { startable: BoardRow[]; blocked: BoardRow[]; materials: HotMaterial[] };
}

/** The most-short materials: ordered by isometrics waiting, then shortage quantity. UNVERIFIED ranking. */
export function hottestMaterials(board: BoardRow[], size = FOCUS_SIZE): HotMaterial[] {
  const groups = new Map<string, HotMaterial & { isos: Set<string> }>();
  for (const row of board) for (const line of row.lines.filter(item => item.shortage > 0)) {
    const group = groups.get(line.identity) || { identity: line.identity, materialNo: text(line.material.materialNo) || 'Unavailable material', description: text(line.material.description), isometrics: 0, shortage: 0, blockingBackorder: 0, notOrdered: 0, isos: new Set<string>() };
    group.isos.add(row.isoId); group.shortage = round(group.shortage + line.shortage); group.blockingBackorder = round(group.blockingBackorder + line.blockingBackorder); group.notOrdered = round(group.notOrdered + line.notOrdered);
    groups.set(line.identity, group);
  }
  return [...groups.values()].map(({ isos, ...group }) => ({ ...group, isometrics: isos.size })).sort((a, b) => b.isometrics - a.isometrics || b.shortage - a.shortage || byNumber(a.materialNo, b.materialNo)).slice(0, size);
}

/** Counted as blocked: not started and short of something (reference "Blocked isometrics 2": 0001 Partial and 00032). */
export const isBlocked = (row: BoardRow) => row.readiness !== 'STARTED' && row.shortage > 0;
/** Whether a board row belongs on a quick filter. The Blocked filter shows the isometrics the Blocked card counts; Aging lists 15+ days. */
export function boardTabMatches(row: BoardRow, tab: BoardTab): boolean {
  switch (tab) {
    case 'All': return true;
    case 'Startable': return row.readiness === 'STARTABLE';
    case 'Partial': return row.readiness === 'PARTIAL';
    case 'Blocked': return isBlocked(row);
    case 'Open ordered': return row.openOrdered > 0;
    case 'Not ordered': return row.notOrdered > 0;
    case 'At service': return row.signal === 'At service';
    case 'At laydown': return row.signal === 'At laydown';
    case 'Aging': return row.aging === '15+ days';
  }
}
export const boardCounts = (board: BoardRow[]) => Object.fromEntries(BOARD_TABS.map(tab => [tab, board.filter(row => boardTabMatches(row, tab)).length])) as Record<BoardTab, number>;
/** A page of the board: its rows and the page number kept inside the range. */
export function boardPage<T>(board: T[], page: number, size: number = BOARD_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(board.length / size)), current = Math.min(Math.max(0, page), pages - 1);
  return { items: board.slice(current * size, current * size + size), page: current, pages, total: board.length };
}
/** "8138678259 (16), 7430052832 (12)": a material cell of the board. */
export const materialList = (items: MaterialQuantity[], limit = items.length) => items.slice(0, limit).map(item => `${item.materialNo} (${item.quantity})`).join(', ');

/**
 * UNVERIFIED (the reference's hidden "Exception score" column is not in the capture): the board's first order, highest
 * first. Score = not ordered × 2 + blocking backorder + 1 when aged 15 days or more; ties by ISO number.
 */
export const exceptionScore = (row: Pick<BoardRow, 'notOrdered' | 'blockingBackorder' | 'aging'>) => round(row.notOrdered * 2 + row.blockingBackorder + (row.aging === '15+ days' ? 1 : 0));

/**
 * UNVERIFIED for spool and supplier (the reference names the parameters, not their rule): which requirement lines a
 * server-side filter keeps. Project: lines of isometrics of that project. Spool: lines of the spool's isometric.
 * Supplier: lines with an order line on an order of that supplier (by requirement, else by isometric and material).
 */
function serverFilterEntries(rows: Rows, entries: Entry[], filters: DashboardFilters): Entry[] {
  let kept = entries;
  if (filters.projectId) kept = kept.filter(entry => text(entry.iso.projectId) === filters.projectId);
  if (filters.spoolId) { const isoId = text(active(rows, 'spools').find(row => row.id === filters.spoolId)?.isoId); kept = kept.filter(entry => entry.iso.id === isoId); }
  if (filters.supplierId) {
    const orders = new Set(active(rows, 'orders').filter(order => order.status !== 'Cancelled' && text(order.supplierId) === filters.supplierId).map(order => order.id));
    const lines = active(rows, 'order_lines').filter(line => orders.has(text(line.orderId)) && !line.additional);
    kept = kept.filter(entry => lines.some(line => lineRequirementIds(line).length ? lineRequirementIds(line).includes(entry.requirement.id) : line.isoId === entry.iso.id && materialIdentity(line) === entry.identity));
  }
  return kept;
}

/**
 * The whole dashboard for the rows in view. `phaseId` narrows the requirement lines to one operation phase (empty =
 * all); project / spool / supplier are the deep-link filters; `today` (YYYY-MM-DD) is the day aging is measured to.
 * Isometrics without a requirement in scope are not listed.
 */
export function mtoDashboard(rows: Rows, options: Partial<DashboardFilters> & { today?: string } = {}): MtoDashboard {
  const filters: DashboardFilters = { phaseId: text(options.phaseId), projectId: text(options.projectId), spoolId: text(options.spoolId), supplierId: text(options.supplierId) };
  const phaseId = filters.phaseId, today = day(options.today) || new Date().toISOString().slice(0, 10);
  const isos = new Map(active(rows, 'isometrics').map(iso => [iso.id, iso]));
  // Picked = the pick-list lines whose stock has left the inventory (taken, or issued at Start: w3-mto-execution's rule,
  // shared/materials.ts pickIssued); a line written before Start and not taken yet is the line's own claim (below).
  const taken = { ...rows, picklists: active(rows, 'picklists').filter(pickIssued) };
  const execution = requirementExecution(taken), orderedOf = new Map(execution.map(entry => [entry.requirement.id, entry.ordered]));
  const entries = serverFilterEntries(rows, execution.filter(entry => entry.required > 0 && isos.has(entry.iso.id) && (!phaseId || text(entry.requirement.phaseId) === phaseId))
    .map(entry => ({ requirement: entry.requirement, iso: entry.iso, material: entry.material, identity: entry.identity, pool: poolKey(isoSiteId(rows, entry.iso), entry.identity), required: entry.required, picked: entry.picked })), filters);
  const reservations = active(rows, 'reservations').filter(row => row.status === 'Reserved');
  const claims = active(rows, 'picklists').filter(pickClaims);
  const sumFor = (list: Row[]) => (requirementId: string) => list.filter(row => row.requirementId === requirementId).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const reservedFor = sumFor(reservations), claimedFor = sumFor(claims);
  const pools = freePoolByMaterial(rows);
  const started = new Set(active(rows, 'picklists').map(row => text(row.isoId)));
  const projectOf = (isoId: string) => text(isos.get(isoId)?.projectId);
  const lines = allocateCoverage(entries, reservedFor, claimedFor, pools);
  allocateOpenOrders(rows, lines, projectOf);

  // Oldest open order date per isometric, from order lines for its lines in scope (by requirement, or by isometric and material).
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const scopeRequirements = new Map(entries.map(entry => [entry.requirement.id, entry.iso.id]));
  const scopeIsoMaterials = new Set(entries.map(entry => `${entry.iso.id}|${entry.identity}`));
  const oldestOpen = new Map<string, string>();
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId)); if (!order || line.additional || Number(line.quantity || 0) - Number(line.received || 0) <= 0) continue;
    if (filters.supplierId && text(order.supplierId) !== filters.supplierId) continue;
    const ids = lineRequirementIds(line);
    const isoIds = ids.length ? [...new Set(ids.map(id => scopeRequirements.get(id) || '').filter(Boolean))] : scopeIsoMaterials.has(`${text(line.isoId)}|${materialIdentity(line)}`) ? [text(line.isoId)] : [];
    const date = day(order.date); if (!date) continue;
    for (const isoId of isoIds) if (!oldestOpen.get(isoId) || date < oldestOpen.get(isoId)!) oldestOpen.set(isoId, date);
  }

  const materialsOf = (own: ScopeLine[], pick: (line: ScopeLine) => number) => {
    const byMaterial = new Map<string, MaterialQuantity>();
    for (const line of own.filter(item => pick(item) > 0)) { const item = byMaterial.get(line.identity) || { materialNo: text(line.material.materialNo) || 'Unavailable material', description: text(line.material.description), quantity: 0 }; item.quantity = round(item.quantity + pick(line)); byMaterial.set(line.identity, item); }
    return [...byMaterial.values()];
  };
  // Ordered and received against what the requirements ask for (regular orders only).
  const regular = active(rows, 'order_lines').filter(line => orders.has(text(line.orderId)) && !line.additional);
  let requiredTotal = 0, orderedTotal = 0, receivedTotal = 0;
  for (const entry of entries) {
    const ordered = Math.min(orderedOf.get(entry.requirement.id) || 0, entry.required);
    const linked = regular.filter(line => materialIdentity(line) === entry.identity && (line.requirementId === entry.requirement.id || lineRequirementIds(line).includes(entry.requirement.id)));
    const own = linked.length ? linked : regular.filter(line => materialIdentity(line) === entry.identity && !line.requirementId && !lineRequirementIds(line).length && text(orders.get(text(line.orderId))?.projectId) === text(entry.iso.projectId));
    const quantity = own.reduce((sum, line) => sum + Number(line.quantity || 0), 0), got = own.reduce((sum, line) => sum + Math.min(Number(line.received || 0), Number(line.quantity || 0)), 0);
    requiredTotal += entry.required; orderedTotal += ordered; receivedTotal += quantity > 0 ? ordered * Math.min(1, got / quantity) : 0;
  }
  const board: BoardRow[] = [...new Set(entries.map(entry => entry.iso))].map(iso => {
    const own = lines.filter(line => line.isoId === iso.id);
    const required = round(own.reduce((sum, line) => sum + line.required, 0)), covered = round(own.reduce((sum, line) => sum + line.covered, 0));
    const fact = logisticsSignalOf(rows, iso.id, started.has(iso.id)), aging = agingOf(fact, oldestOpen.get(iso.id) || '', today);
    const blockingBackorder = round(own.reduce((sum, line) => sum + line.blockingBackorder, 0)), notOrdered = round(own.reduce((sum, line) => sum + line.notOrdered, 0));
    const bucket = agingBucket(aging.ageDays);
    return {
      isoId: iso.id, isoNo: text(iso.isoNo), projectId: text(iso.projectId), priority: priorityLabel(iso.priority),
      readiness: readinessOf({ required, covered, started: started.has(iso.id) }), required, covered, shortage: round(required - covered),
      shortageMaterials: materialsOf(own, line => line.shortage).sort((a, b) => b.quantity - a.quantity || byNumber(a.materialNo, b.materialNo)),
      backorderMaterials: materialsOf(own, line => line.blockingBackorder).sort((a, b) => byNumber(a.materialNo, b.materialNo)),
      blockingBackorder, notOrdered, openOrdered: round(own.reduce((sum, line) => sum + line.openLinked + line.openExtra, 0)),
      signal: fact.signal, location: fact.location, lastEvent: fact.date, ageDays: aging.ageDays, aging: bucket, logistics: aging.text,
      exceptionScore: exceptionScore({ notOrdered, blockingBackorder, aging: bucket }), lines: own,
    };
  }).sort((a, b) => b.exceptionScore - a.exceptionScore || byIso(isos.get(a.isoId)!, isos.get(b.isoId)!));

  const count = (readiness: Readiness) => board.filter(row => row.readiness === readiness).length;
  const sum = (pick: (row: BoardRow) => number) => round(board.reduce((total, row) => total + pick(row), 0));
  const notOrderedMaterials = new Set(lines.filter(line => line.notOrdered > 0).map(line => line.identity));
  // Free pool materials: distinct materials of the lines in scope with a positive free pool (reference Shop 5 of 7 in stock).
  const freePoolMaterials = new Set(lines.filter(line => (pools.get(line.pool)?.free ?? 0) > 0).map(line => line.pool)).size;

  // Order totals per material in scope, over all its order lines.
  const identities = new Set(lines.map(line => line.identity));
  const scopeOrders = orderLinesInScope(rows, identities, filters);
  const ordered = round(scopeOrders.reduce((total, line) => total + line.ordered, 0)), received = round(scopeOrders.reduce((total, line) => total + line.received, 0));
  const openOrdered = round(scopeOrders.reduce((total, line) => total + line.open, 0));
  const aging = Object.fromEntries(AGING_BUCKETS.map(bucket => [bucket, board.filter(row => row.aging === bucket).length])) as Record<AgingBucket, number>;
  const signals = Object.fromEntries(SIGNALS.map(signal => [signal, board.filter(row => row.signal === signal).length])) as Record<LogisticsSignal, number>;

  // Isometrics by logistics signal: one bar per current location, then Not sent, then Materials issued.
  const placeRank = (row: BoardRow) => row.signal === 'Started' ? 2 : row.signal === 'Not-sent' ? 1 : 0;
  const locations: LocationBar[] = [];
  for (const row of [...board].sort((a, b) => placeRank(a) - placeRank(b) || a.location.localeCompare(b.location))) {
    const bar = locations.find(item => item.location === row.location);
    if (bar) bar.isometrics += 1; else locations.push({ location: row.location, label: chartLabel(row.location), isometrics: 1 });
  }

  // The Open ordered view: one row per material in scope with an open order quantity.
  const openByMaterial = new Map<string, number>();
  for (const line of scopeOrders) if (line.open > 0) openByMaterial.set(line.identity, round((openByMaterial.get(line.identity) || 0) + line.open));
  const materials: MaterialRow[] = [...openByMaterial].map(([identity, open]) => {
    const own = lines.filter(line => line.identity === identity), material = own[0]?.material;
    return { identity, materialNo: text(material?.materialNo) || 'Unavailable material', description: text(material?.description), shortage: round(own.reduce((s, line) => s + line.shortage, 0)), openOrdered: open, notOrdered: round(own.reduce((s, line) => s + line.notOrdered, 0)) };
  }).sort((a, b) => byNumber(a.materialNo, b.materialNo));

  const blockingQuantity = sum(row => row.blockingBackorder), notOrderedTotal = sum(row => row.notOrdered);
  const progress: DashboardProgress = { required: round(requiredTotal), ordered: round(orderedTotal), received: round(receivedTotal), orderedPercent: percent(orderedTotal, requiredTotal), receivedPercent: percent(receivedTotal, requiredTotal), isometrics: board.length, started: count('STARTED'), startedPercent: percent(count('STARTED'), board.length) };
  return {
    phaseId, today, filters, board, materials, progress,
    kpis: { startable: count('STARTABLE'), started: count('STARTED'), inScope: board.length, partial: count('PARTIAL'), blocked: board.filter(isBlocked).length, reserved: round(lines.reduce((total, line) => total + line.reserved, 0)), blockingQuantity, blockingIsometrics: board.filter(row => row.blockingBackorder > 0).length, notOrderedMaterials: notOrderedMaterials.size, notOrderedIsometrics: board.filter(row => row.notOrdered > 0).length, freePoolMaterials, openOrdered },
    chips: { maxStartable: maxStartable(entries, reservedFor, claimedFor, pools), freePoolMaterials, ordered, received, openOrdered, blockingBackorder: blockingQuantity, notOrdered: notOrderedTotal, aging, noLogisticsUpdate: board.filter(row => row.ageDays === null).length },
    signals, locations,
    backlog: board.length || openOrdered ? [{ scope: 'Site', openOrdered, blockingBackorder: blockingQuantity, notOrdered: notOrderedTotal }] : [],
    focus: {
      startable: board.filter(row => row.readiness === 'STARTABLE').sort((a, b) => priorityRank(isos.get(a.isoId)!) - priorityRank(isos.get(b.isoId)!) || byIso(isos.get(a.isoId)!, isos.get(b.isoId)!)).slice(0, FOCUS_SIZE),
      blocked: board.filter(isBlocked).sort((a, b) => b.shortage - a.shortage).slice(0, FOCUS_SIZE),
      materials: hottestMaterials(board),
    },
  };
}

/** Search text of a board row: project name is added by the caller (it lives in another collection). */
export const boardSearchText = (row: BoardRow) => [row.isoNo, READINESS_LABEL[row.readiness], SIGNAL_LABEL[row.signal], row.logistics, row.priority, ...row.shortageMaterials.map(item => `${item.materialNo} ${item.description}`)].join(' ').toLowerCase();
export const materialSearchText = (row: MaterialRow) => `${row.materialNo} ${row.description}`.toLowerCase();

// ----- Material revisions report ------------------------------------------------------------------------------------

export interface RevisionReportRow { id: string; isoId: string; isoNo: string; projectId: string; materialNo: string; description: string; type: string; revision: string; date: string; previous: number; change: number; quantity: number; note: string }
/**
 * Material revisions report: the quantity-by-revision log of every requirement in view (the data of the "Quantity by
 * revision" dialog), newest first, optionally limited to one operation phase.
 */
export function materialRevisionRows(rows: Rows, phaseId = ''): RevisionReportRow[] {
  const isos = new Map(active(rows, 'isometrics').map(iso => [iso.id, iso]));
  const requirements = new Map(active(rows, 'iso_materials').map(row => [row.id, row]));
  const revisions = new Map((rows.revisions || []).map(row => [row.id, row]));
  return active(rows, 'material_quantity_changes').flatMap(change => {
    const requirement = requirements.get(text(change.requirementId)); const iso = requirement && isos.get(text(requirement.isoId));
    if (!requirement || !iso || phaseId && text(requirement.phaseId) !== phaseId) return [];
    const material = materialRecord(rows, requirement);
    return [{ id: change.id, isoId: iso.id, isoNo: text(iso.isoNo), projectId: text(iso.projectId), materialNo: text(material?.materialNo || requirement.materialNo) || 'Unavailable material', description: text(material?.description || requirement.description), type: text(change.type), revision: text(revisions.get(text(change.revisionId))?.revNo), date: day(change.date), previous: Number(change.previousQuantity ?? 0), change: Number(change.quantity ?? 0), quantity: Number(change.newQuantity ?? 0), note: text(change.note) }];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.isoNo.localeCompare(b.isoNo, 'en', { numeric: true }) || b.id.localeCompare(a.id));
}
