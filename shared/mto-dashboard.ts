import type { Row } from './types.ts';
import { materialIdentity, materialRecord, requirementExecution } from './materials.ts';
import { priorityLabel } from './priority.ts';

/**
 * MTO Pilot dashboard (Start). Every number on the page comes from `mtoDashboard()` below: pure functions over the
 * workspace rows the pilot already loads (collections keyed by resource), so the client and the tests run the same code.
 *
 * The reference's formulas are not in the capture. Each definition is ONE named function and is listed as unverified
 * in PARITY.md: `freePoolByMaterial`, `allocateCoverage`, `readinessOf`, `maxStartable`, `allocateOpenOrders`,
 * `logisticsSignalOf`, `agingOf`, `agingBucket`, `hottestMaterials`.
 */
type Rows = Record<string, Row[]>;
const active = (rows: Rows, key: string) => (rows[key] || []).filter(row => !row._archived);
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const text = (value: unknown) => String(value ?? '').trim();
const day = (value: unknown) => text(value).slice(0, 10);
const byIso = (a: Row, b: Row) => String(a.isoNo ?? '').localeCompare(String(b.isoNo ?? ''), 'en', { numeric: true }) || a.id.localeCompare(b.id);

/** Resources the dashboard reads; without all of them the page shows its no-access state. */
export const MTO_DASHBOARD_REQUIRED = ['isometrics', 'iso_materials', 'stock', 'reservations', 'picklists', 'orders', 'order_lines'];
/** Read when the account can see them; the dashboard still works (with less detail) without them. */
export const MTO_DASHBOARD_OPTIONAL = ['operation_phases', 'material_location_events', 'service_requests', 'spools', 'material_quantity_changes', 'projects'];

export const READINESS = ['STARTED', 'STARTABLE', 'PARTIAL', 'BLOCKED'] as const;
export type Readiness = typeof READINESS[number];
export const SIGNALS = ['Not-sent', 'At service', 'At laydown', 'Started'] as const;
export type LogisticsSignal = typeof SIGNALS[number];
export const AGING_BUCKETS = ['0-7 days', '8-14 days', '15+ days'] as const;
export type AgingBucket = typeof AGING_BUCKETS[number];

export const BOARD_TABS = ['ALL', 'STARTABLE', 'PARTIAL', 'BLOCKED', 'OPEN ORDERED', 'NOT ORDERED', 'AT SERVICE', 'AT LAYDOWN', 'AGING'] as const;
export type BoardTab = typeof BOARD_TABS[number];
export const BOARD_PAGE_SIZE = 10;
export const FOCUS_SIZE = 5;

// ----- definitions (UNVERIFIED reference rules) -------------------------------------------------------------------

export interface FreePool { stock: number; reserved: number; free: number }
/**
 * UNVERIFIED. Free pool of a material = stock on hand − quantities reserved for isometrics (reservations still
 * "Reserved"), never below zero. Stock is already net of take-ins and issues (the balance moves with them).
 */
export function freePoolByMaterial(rows: Rows): Map<string, FreePool> {
  const pools = new Map<string, FreePool>();
  const pool = (identity: string) => { let value = pools.get(identity); if (!value) pools.set(identity, value = { stock: 0, reserved: 0, free: 0 }); return value; };
  for (const row of active(rows, 'stock')) { const value = pool(materialIdentity(row)); value.stock = round(value.stock + Number(row.quantity || 0)); }
  for (const row of active(rows, 'reservations').filter(row => row.status === 'Reserved')) { const value = pool(materialIdentity(row)); value.reserved = round(value.reserved + Number(row.quantity || 0)); }
  for (const value of pools.values()) value.free = round(Math.max(0, value.stock - value.reserved));
  return pools;
}

/** Priority rank of an isometric: "Prio 1" first … "Prio 5", "No priority" last. */
export function priorityRank(iso: Row): number {
  const match = /^Prio (\d+)$/.exec(priorityLabel(iso.priority));
  return match ? Number(match[1]) : 99;
}

/** Readiness of an isometric once its coverage is known. UNVERIFIED: STARTED (a pick list exists) wins over the coverage states. */
export function readinessOf(input: { required: number; covered: number; started: boolean }): Readiness {
  if (input.started) return 'STARTED';
  if (input.covered >= input.required) return 'STARTABLE';
  return input.covered > 0 ? 'PARTIAL' : 'BLOCKED';
}

export interface ScopeLine {
  requirementId: string; isoId: string; identity: string; material: Row; phaseId: string;
  required: number; picked: number; reserved: number; fromFree: number; covered: number; shortage: number;
  blockingBackorder: number; notOrdered: number; openLinked: number; openExtra: number;
}
interface Entry { requirement: Row; iso: Row; material: Row; identity: string; required: number; picked: number }

/**
 * UNVERIFIED. Covered = min(required, picked + reserved for the line + share of the free pool). The free pool of a
 * material is handed out isometric by isometric in priority order, then ISO number (lines in creation order inside an
 * isometric); what one isometric takes is gone for the next. Reserved quantities belong to their own line only.
 */
export function allocateCoverage(entries: Entry[], reservedFor: (requirementId: string) => number, pools: Map<string, FreePool>): ScopeLine[] {
  const left = new Map([...pools].map(([identity, pool]) => [identity, pool.free]));
  const order = [...new Set(entries.map(entry => entry.iso))].sort((a, b) => priorityRank(a) - priorityRank(b) || byIso(a, b));
  const lines: ScopeLine[] = [];
  for (const iso of order) {
    for (const entry of entries.filter(item => item.iso.id === iso.id)) {
      const reserved = round(Math.max(0, reservedFor(entry.requirement.id)));
      const need = Math.max(0, round(entry.required - entry.picked - reserved));
      const fromFree = round(Math.min(need, left.get(entry.identity) ?? 0));
      left.set(entry.identity, round((left.get(entry.identity) ?? 0) - fromFree));
      const covered = round(Math.min(entry.required, entry.picked + reserved + fromFree));
      lines.push({ requirementId: entry.requirement.id, isoId: iso.id, identity: entry.identity, material: entry.material, phaseId: text(entry.requirement.phaseId), required: entry.required, picked: entry.picked, reserved, fromFree, covered, shortage: round(entry.required - covered), blockingBackorder: 0, notOrdered: 0, openLinked: 0, openExtra: 0 });
    }
  }
  return lines;
}

/**
 * UNVERIFIED. Max startable = isometrics (not started) whose every line could be covered from picked + its own
 * reservations + the WHOLE free pool, ignoring what other isometrics take. It is the ceiling of the startable count.
 */
export function maxStartable(entries: Entry[], reservedFor: (requirementId: string) => number, pools: Map<string, FreePool>, startedIsoIds: Set<string>): number {
  const ids = new Set(entries.map(entry => entry.iso.id));
  return [...ids].filter(isoId => !startedIsoIds.has(isoId) && entries.filter(entry => entry.iso.id === isoId).every(entry => {
    const own = Math.max(0, entry.picked) + Math.max(0, reservedFor(entry.requirement.id)) + (pools.get(entry.identity)?.free ?? 0);
    return own >= entry.required;
  })).length;
}

/**
 * UNVERIFIED. Splits every line's shortage: what sits on an open order line (ordered, not yet received) is the
 * blocking backorder, the rest is not ordered. An order line belongs to its requirement; one without a requirement
 * belongs to its isometric, and one without an isometric to the order's project, for the same material. Each open
 * quantity is used once, in the same isometric order as `allocateCoverage`.
 */
export function allocateOpenOrders(rows: Rows, lines: ScopeLine[], isoProject: (isoId: string) => string) {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const requirementPool = new Map<string, number>(), isoPool = new Map<string, number>(), projectPool = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, quantity: number) => map.set(key, round((map.get(key) || 0) + quantity));
  const requirementIdentity = new Map(lines.map(line => [line.requirementId, line.identity]));
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId)); if (!order) continue;
    const open = round(Number(line.quantity || 0) - Number(line.received || 0)); if (open <= 0) continue;
    const identity = materialIdentity(line);
    if (line.requirementId && requirementIdentity.get(text(line.requirementId)) === identity) add(requirementPool, text(line.requirementId), open);
    else if (!line.requirementId && line.isoId) add(isoPool, `${line.isoId}|${identity}`, open);
    else if (!line.requirementId) add(projectPool, `${text(order.projectId)}|${identity}`, open);
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

export interface LogisticsFact { signal: LogisticsSignal; date: string }
const SIGNAL_RANK: Record<LogisticsSignal, number> = { 'Not-sent': 0, 'At service': 1, 'At laydown': 2, Started: 3 };
/**
 * UNVERIFIED. Logistics signal of an isometric from its latest service or laydown movement (material location
 * history, spool service requests) or pick list: Move to laydown → At laydown, Service request → At service, Service
 * completed → At laydown, a pick list → Started. The latest date wins; on the same date Started beats At laydown beats
 * At service. Without any event: Not-sent with no date.
 */
export function logisticsSignalOf(rows: Rows, isoId: string): LogisticsFact {
  const requirements = new Set(active(rows, 'iso_materials').filter(row => row.isoId === isoId).map(row => row.id));
  const spools = new Set(active(rows, 'spools').filter(row => row.isoId === isoId).map(row => row.id));
  const events: LogisticsFact[] = [];
  for (const event of active(rows, 'material_location_events').filter(row => requirements.has(text(row.requirementId)))) {
    events.push({ signal: event.type === 'Service request' ? 'At service' : 'At laydown', date: day(event.date) });
  }
  for (const request of active(rows, 'service_requests').filter(row => row.spoolId && spools.has(text(row.spoolId)))) {
    events.push(request.status === 'Completed' ? { signal: 'At laydown', date: day(request.completedAt || request.date) } : { signal: 'At service', date: day(request.date) });
  }
  for (const pick of active(rows, 'picklists').filter(row => row.isoId === isoId)) events.push({ signal: 'Started', date: day(pick.date) });
  events.sort((a, b) => b.date.localeCompare(a.date) || SIGNAL_RANK[b.signal] - SIGNAL_RANK[a.signal]);
  return events[0] || { signal: 'Not-sent', date: '' };
}

/** Whole days between two dates (YYYY-MM-DD), never negative; null when either is missing or invalid. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${day(from)}T00:00:00Z`), b = Date.parse(`${day(to)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : null;
}
/** UNVERIFIED. Aging = days since the latest logistics event, else since the oldest open order date; null with neither. */
export function agingOf(eventDate: string, oldestOpenOrder: string, today: string): number | null {
  const from = eventDate || oldestOpenOrder;
  return from ? daysBetween(from, today) : null;
}
/** The three aging chips: 0-7, 8-14 and 15+ days. */
export const agingBucket = (days: number | null): AgingBucket | '' => days === null ? '' : days <= 7 ? '0-7 days' : days <= 14 ? '8-14 days' : '15+ days';

// ----- the model ---------------------------------------------------------------------------------------------------

export interface ShortageMaterial { materialNo: string; description: string; quantity: number }
export interface BoardRow {
  isoId: string; isoNo: string; projectId: string; priority: string;
  readiness: Readiness; coveredLines: number; totalLines: number; required: number; covered: number; shortage: number;
  shortageMaterials: ShortageMaterial[]; blockingBackorder: number; notOrdered: number; openOrdered: number;
  signal: LogisticsSignal; lastEvent: string; ageDays: number | null; aging: AgingBucket | '';
  lines: ScopeLine[];
}
export interface HotMaterial { identity: string; materialNo: string; description: string; isometrics: number; shortage: number; blockingBackorder: number; notOrdered: number }
export interface BacklogRow { projectId: string; openOrdered: number; blockingBackorder: number; notOrdered: number }
export interface MtoDashboard {
  phaseId: string; today: string;
  board: BoardRow[];
  kpis: { startable: number; started: number; inScope: number; partial: number; blocked: number; blockingQuantity: number; blockingIsometrics: number; notOrderedMaterials: number; notOrderedIsometrics: number; freePoolMaterials: number };
  chips: { maxStartable: number; freePoolMaterials: number; ordered: number; received: number; openOrdered: number; blockingBackorder: number; notOrdered: number; aging: Record<AgingBucket, number>; noLogisticsUpdate: number };
  signals: Record<LogisticsSignal, number>;
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
  return [...groups.values()].map(({ isos, ...group }) => ({ ...group, isometrics: isos.size })).sort((a, b) => b.isometrics - a.isometrics || b.shortage - a.shortage || a.materialNo.localeCompare(b.materialNo, 'en', { numeric: true })).slice(0, size);
}

/** Whether a board row belongs on a tab. AGING lists isometrics aged 15 days or more. */
export function boardTabMatches(row: BoardRow, tab: BoardTab): boolean {
  switch (tab) {
    case 'ALL': return true;
    case 'STARTABLE': case 'PARTIAL': case 'BLOCKED': return row.readiness === tab;
    case 'OPEN ORDERED': return row.openOrdered > 0;
    case 'NOT ORDERED': return row.notOrdered > 0;
    case 'AT SERVICE': return row.signal === 'At service';
    case 'AT LAYDOWN': return row.signal === 'At laydown';
    case 'AGING': return row.aging === '15+ days';
  }
}
export const boardCounts = (board: BoardRow[]) => Object.fromEntries(BOARD_TABS.map(tab => [tab, board.filter(row => boardTabMatches(row, tab)).length])) as Record<BoardTab, number>;
/** A page of the board: its rows and the page number kept inside the range. */
export function boardPage(board: BoardRow[], page: number, size = BOARD_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(board.length / size)), current = Math.min(Math.max(0, page), pages - 1);
  return { items: board.slice(current * size, current * size + size), page: current, pages, total: board.length };
}

/**
 * The whole dashboard for the rows in view. `phaseId` narrows the requirement lines to one operation phase (empty =
 * all); `today` (YYYY-MM-DD) is the day aging is measured to. Isometrics without a requirement in scope are not listed.
 */
export function mtoDashboard(rows: Rows, options: { phaseId?: string; today?: string } = {}): MtoDashboard {
  const phaseId = text(options.phaseId), today = day(options.today) || new Date().toISOString().slice(0, 10);
  const isos = new Map(active(rows, 'isometrics').map(iso => [iso.id, iso]));
  const entries: Entry[] = requirementExecution(rows).filter(entry => entry.required > 0 && isos.has(entry.iso.id) && (!phaseId || text(entry.requirement.phaseId) === phaseId))
    .map(entry => ({ requirement: entry.requirement, iso: entry.iso, material: entry.material, identity: entry.identity, required: entry.required, picked: entry.picked }));
  const reservations = active(rows, 'reservations').filter(row => row.status === 'Reserved');
  const reservedFor = (requirementId: string) => reservations.filter(row => row.requirementId === requirementId).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const pools = freePoolByMaterial(rows);
  const started = new Set(active(rows, 'picklists').map(row => text(row.isoId)));
  const projectOf = (isoId: string) => text(isos.get(isoId)?.projectId);
  const lines = allocateCoverage(entries, reservedFor, pools);
  allocateOpenOrders(rows, lines, projectOf);

  // Oldest open order date per isometric, from order lines that name the requirement or the isometric.
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const requirementIso = new Map(entries.map(entry => [entry.requirement.id, entry.iso.id]));
  const oldestOpen = new Map<string, string>();
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId)); if (!order || Number(line.quantity || 0) - Number(line.received || 0) <= 0) continue;
    const isoId = text(line.isoId) || requirementIso.get(text(line.requirementId)) || ''; if (!isoId) continue;
    const date = day(order.date); if (date && (!oldestOpen.get(isoId) || date < oldestOpen.get(isoId)!)) oldestOpen.set(isoId, date);
  }

  const board: BoardRow[] = [...new Set(entries.map(entry => entry.iso))].map(iso => {
    const own = lines.filter(line => line.isoId === iso.id);
    const required = round(own.reduce((sum, line) => sum + line.required, 0)), covered = round(own.reduce((sum, line) => sum + line.covered, 0));
    const shortageLines = own.filter(line => line.shortage > 0);
    const logistics = logisticsSignalOf(rows, iso.id), ageDays = agingOf(logistics.date, oldestOpen.get(iso.id) || '', today);
    const byMaterial = new Map<string, ShortageMaterial>();
    for (const line of shortageLines) { const item = byMaterial.get(line.identity) || { materialNo: text(line.material.materialNo) || 'Unavailable material', description: text(line.material.description), quantity: 0 }; item.quantity = round(item.quantity + line.shortage); byMaterial.set(line.identity, item); }
    const blocking = round(own.reduce((sum, line) => sum + line.blockingBackorder, 0));
    return {
      isoId: iso.id, isoNo: text(iso.isoNo), projectId: text(iso.projectId), priority: priorityLabel(iso.priority),
      readiness: readinessOf({ required, covered, started: started.has(iso.id) }), coveredLines: own.filter(line => line.covered >= line.required).length, totalLines: own.length, required, covered,
      shortage: round(required - covered), shortageMaterials: [...byMaterial.values()].sort((a, b) => b.quantity - a.quantity || a.materialNo.localeCompare(b.materialNo, 'en', { numeric: true })),
      blockingBackorder: blocking, notOrdered: round(own.reduce((sum, line) => sum + line.notOrdered, 0)),
      openOrdered: round(own.reduce((sum, line) => sum + line.openLinked + line.openExtra, 0)),
      signal: logistics.signal, lastEvent: logistics.date, ageDays, aging: agingBucket(ageDays), lines: own,
    };
  }).sort((a, b) => priorityRank(isos.get(a.isoId)!) - priorityRank(isos.get(b.isoId)!) || byIso(isos.get(a.isoId)!, isos.get(b.isoId)!));

  const count = (readiness: Readiness) => board.filter(row => row.readiness === readiness).length;
  const sum = (pick: (row: BoardRow) => number) => round(board.reduce((total, row) => total + pick(row), 0));
  const notOrderedMaterials = new Set(board.flatMap(row => row.lines.filter(line => line.notOrdered > 0).map(line => line.identity)));
  const freePoolMaterials = [...pools.values()].filter(pool => pool.free > 0).length;

  // Order totals over the lines of the isometrics (and, in a phase scope, the materials) in view.
  const scopeKeys = new Set(entries.map(entry => `${entry.iso.id}|${entry.identity}`)), scopeProjects = new Set(entries.map(entry => `${projectOf(entry.iso.id)}|${entry.identity}`));
  let ordered = 0, received = 0, open = 0;
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId)); if (!order) continue;
    const identity = materialIdentity(line);
    const inScope = line.requirementId ? requirementIso.has(text(line.requirementId)) : line.isoId ? scopeKeys.has(`${line.isoId}|${identity}`) : scopeProjects.has(`${text(order.projectId)}|${identity}`);
    if (!inScope) continue;
    ordered += Number(line.quantity || 0); received += Number(line.received || 0); open += Math.max(0, Number(line.quantity || 0) - Number(line.received || 0));
  }
  const aging = Object.fromEntries(AGING_BUCKETS.map(bucket => [bucket, board.filter(row => row.aging === bucket).length])) as Record<AgingBucket, number>;
  const signals = Object.fromEntries(SIGNALS.map(signal => [signal, board.filter(row => row.signal === signal).length])) as Record<LogisticsSignal, number>;

  const projects = [...new Set(board.map(row => row.projectId))];
  const backlog = projects.map(projectId => { const own = board.filter(row => row.projectId === projectId); return { projectId, openOrdered: round(own.reduce((s, r) => s + r.openOrdered, 0)), blockingBackorder: round(own.reduce((s, r) => s + r.blockingBackorder, 0)), notOrdered: round(own.reduce((s, r) => s + r.notOrdered, 0)) }; });

  return {
    phaseId, today, board,
    kpis: { startable: count('STARTABLE'), started: count('STARTED'), inScope: board.length, partial: count('PARTIAL'), blocked: count('BLOCKED'), blockingQuantity: sum(row => row.blockingBackorder), blockingIsometrics: board.filter(row => row.blockingBackorder > 0).length, notOrderedMaterials: notOrderedMaterials.size, notOrderedIsometrics: board.filter(row => row.notOrdered > 0).length, freePoolMaterials },
    chips: { maxStartable: maxStartable(entries, reservedFor, pools, started), freePoolMaterials, ordered: round(ordered), received: round(received), openOrdered: round(open), blockingBackorder: sum(row => row.blockingBackorder), notOrdered: sum(row => row.notOrdered), aging, noLogisticsUpdate: board.filter(row => row.signal === 'Not-sent').length },
    signals, backlog,
    focus: {
      startable: board.filter(row => row.readiness === 'STARTABLE').slice(0, FOCUS_SIZE),
      blocked: board.filter(row => row.readiness === 'BLOCKED').sort((a, b) => b.shortage - a.shortage).slice(0, FOCUS_SIZE),
      materials: hottestMaterials(board),
    },
  };
}

/** Search text of a board row: project name is added by the caller (it lives in another collection). */
export const boardSearchText = (row: BoardRow) => [row.isoNo, row.readiness, row.signal, row.priority, ...row.shortageMaterials.map(item => `${item.materialNo} ${item.description}`)].join(' ').toLowerCase();

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
