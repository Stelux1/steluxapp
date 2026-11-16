import type { ActionDefinition, ActionField, Availability, PermissionVerb, Row } from './types.ts';
import { materialIdentity, materialRecord, requirementExecution } from './materials.ts';
import { materialStatusPercent, type CoverageLine } from './mto-materials.ts';
import { claimSiteId, isoSiteId, picksFromSite, siteStock } from './mto-stock.ts';

/**
 * Isometric execution, pick lists and logistics (MTO Pilot).
 *
 * The reference rules behind Reserve, Start and the material status are not in the capture. Each guess is kept in
 * ONE named function below and listed in PARITY.md: `materialStatus`, `freePool`, `planReserve`, `planStart`,
 * `allocateStock`, `operationPhaseGroup`, `percentBand`, `spoolLocation`.
 */

/** Resources this flow adds (their tables are created by `npm run db:prepare:welding`, see shared/planning.ts). */
export const MTO_LOGISTICS_RESOURCES = ['reservations'];
/** Pages of this flow, delivered to the hosted profile (the two archives reuse their resource paths). */
export const MTO_LOGISTICS_PAGES = ['/materials/iso-execution', '/materials/service-spools', '/materials/service-materials', '/materials/picklists', '/materials/service_requests'];
export const MTO_PAGE_TITLES: Record<string, string> = {
  '/materials/iso-execution': 'Isometric execution', '/materials/service-spools': 'Service request', '/materials/service-materials': 'Service req. - Materials',
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const active = (rows: Record<string, Row[]>, key: string) => (rows[key] || []).filter(row => !row._archived);
const byCreation = (a: Row, b: Row) => String(a._createdAt).localeCompare(String(b._createdAt)) || a.id.localeCompare(b.id);

// ---- Actions -------------------------------------------------------------------------------------------------------

const ref = (name: string, label: string, resource: string, extra: Partial<ActionField> = {}): ActionField => ({ name, label, type: 'ref', ref: resource, required: true, ...extra });
const dateField: ActionField = { name: 'date', label: 'Date', type: 'date', required: true };
const noteField: ActionField = { name: 'note', label: 'Notes', type: 'textarea' };
export const MTO_ACTION_DEFS: ActionDefinition[] = [
  { key: 'reserve-iso', title: 'Reserve materials', module: 'materials', description: 'Set aside the isometric’s still-uncovered quantities from the free stock so other isometrics cannot take them.', fields: [ref('isoId', 'Isometric', 'isometrics'), dateField, noteField], submit: 'Reserve' },
  { key: 'release-reservation', title: 'Release reservation', module: 'materials', description: 'Give reserved quantities back to the free stock.', fields: [ref('reservationIds', 'Reservations', 'reservations', { multiple: true }), dateField, noteField], submit: 'Release' },
  { key: 'start-iso', title: 'Start isometric', module: 'materials', description: 'Create a pick list for the quantities that are available now and mark the isometric as started.', fields: [ref('isoId', 'Isometric', 'isometrics'), dateField, noteField], submit: 'Start' },
  { key: 'take-picklist', title: 'Mark pick list as taken', module: 'materials', description: 'Issue the pick list’s materials from stock. Stock cannot become negative.', fields: [{ name: 'reportNo', label: 'Report No.', type: 'text', required: true }, dateField, noteField], submit: 'Mark as taken' },
];
export const MTO_ACTION_KEYS = MTO_ACTION_DEFS.map(def => def.key);
/** Permission area and verb of each action: "ISO execution" (area 20) allows view and add. */
export const MTO_ACTION_SCOPES: Record<string, [string, PermissionVerb]> = Object.fromEntries(MTO_ACTION_KEYS.map(key => [key, ['20', 'insert'] as [string, PermissionVerb]]));

// ---- Delivery to the hosted profile --------------------------------------------------------------------------------

const names = (value: string) => value.split(' ');
/** Fields a resource shows in the hosted profile, merged with whatever another flow already delivered; no menu entry. */
function merge(availability: Availability, key: string, fields: string[]) { availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...fields])]; }
function mergeAction(availability: Availability, key: string, fields: string[]) { availability.actions[key] = [...new Set([...(availability.actions[key] || []), ...fields])]; }
export function deliverMtoLogistics(availability: Availability, deliver: (availability: Availability, key: string, names?: string[]) => void) {
  // Catalogs with a menu page.
  deliver(availability, 'service_companies', names('name address phone email'));
  deliver(availability, 'laydowns', names('name'));
  deliver(availability, 'material_laydowns', names('name'));
  // Records read by the pages below (the archives open on their resource paths, so they are pages as well).
  // Pick lists (the Pick List archive page) and stock are shared with the other MTO flows and delivered once in
  // `availabilityFor()` (shared/release.ts).
  deliver(availability, 'service_requests', names('number name spoolId requirementId companyId laydownId materialLaydownId date requestedAt addedBy completedAt status note includeDrawings contractorName contractorDate clientName clientDate noboName noboDate signedAt signedBy signedVia'));
  // Records without a page of their own.
  merge(availability, 'reservations', names('isoId requirementId materialId customMaterialId quantity date status note siteId'));
  merge(availability, 'material_locations', names('requirementId laydownId companyId date'));
  merge(availability, 'material_location_events', names('number requirementId type laydownId companyId requestId date note'));
  // A spool carries its location only: Paint spec., PWHT and Chemical clean are read from its isometric (the stored values stay).
  merge(availability, 'spools', names('laydownId serviceCompanyId'));
  merge(availability, 'isometrics', names('paintSpec chemicalClean pwht'));
  merge(availability, 'spool_moves', names('spoolId date type location laydownId requestId'));
  // Service request (Company, Note, Include isometric drawings, selected spools; the name and the date are set by the server) and Move to laydown (one field).
  mergeAction(availability, 'service', names('spoolIds companyId includeDrawings note'));
  mergeAction(availability, 'move-spools', names('spoolIds laydownId'));
  mergeAction(availability, 'move-materials', names('requirementIds laydownId'));
  mergeAction(availability, 'service-materials', names('requirementIds companyId name date note'));
  for (const def of MTO_ACTION_DEFS) mergeAction(availability, def.key, def.fields.map(field => field.name));
}

// ---- Material status -----------------------------------------------------------------------------------------------

export type StatusInput = CoverageLine;
/**
 * UNVERIFIED reference rule. Percentage of an isometric's requirements that are covered, rounded down. The rule
 * itself lives once in shared/mto-materials.ts (`materialCoverage`); here available = free stock plus the
 * isometric's own reservations, and picked includes untaken pick-list claims.
 */
export const materialStatus = (lines: StatusInput[]): number | null => materialStatusPercent(lines);
/** Pick-list lines are taken unless they say otherwise: lines issued directly before pick lists existed have no flag. */
export const isTaken = (line: Row) => line.taken !== false;

/** UNVERIFIED. The reference "Type" filter offers Shop / Field / Valves: an operation phase belongs to the group named in it. */
export function operationPhaseGroup(name: unknown): 'Shop' | 'Field' | 'Valves' | '' {
  const text = String(name || '').toLowerCase();
  return /valve/.test(text) ? 'Valves' : /field/.test(text) ? 'Field' : /shop/.test(text) ? 'Shop' : '';
}
export const PERCENT_BANDS = ['100 %', '80–99 %', '70–79 %', '< 70 %'] as const;
/** The reference bands: 100 %, 80–99 %, 70–79 % and below 70 %. A status of "nothing required" falls in no band. */
export function percentBand(percent: number | null): (typeof PERCENT_BANDS)[number] | '' {
  if (percent === null) return '';
  return percent >= 100 ? '100 %' : percent >= 80 ? '80–99 %' : percent >= 70 ? '70–79 %' : '< 70 %';
}

// ---- Free stock, reservations and pick-list claims -----------------------------------------------------------------

export interface Pool { stock: number; reserved: number; claimed: number; free: number }
/** The key of a pool: one material in one project site's Material inventory. */
export const poolKey = (siteId: string, identity: string) => `${siteId}|${identity}`;
const stockPools = (rows: Record<string, Row[]>) => {
  const pools = new Map<string, Pool>();
  const pool = (key: string) => { let value = pools.get(key); if (!value) pools.set(key, value = { stock: 0, reserved: 0, claimed: 0, free: 0 }); return value; };
  // Only a project site's own Material inventory counts; storehouse lines are not reachable for an isometric.
  for (const row of active(rows, 'stock').filter(row => row.locationKind === 'site' && row.siteId)) { const value = pool(poolKey(String(row.siteId), materialIdentity(row))); value.stock = round(value.stock + Number(row.quantity)); }
  for (const row of active(rows, 'reservations').filter(row => row.status === 'Reserved')) { const value = pool(poolKey(claimSiteId(rows, row), materialIdentity(row))); value.reserved = round(value.reserved + Number(row.quantity)); }
  // Pick lists written before the site inventory existed take from a storehouse and claim nothing here.
  for (const row of active(rows, 'picklists').filter(row => !isTaken(row) && picksFromSite(row))) { const value = pool(poolKey(claimSiteId(rows, row), materialIdentity(row))); value.claimed = round(value.claimed + Number(row.quantity)); }
  for (const value of pools.values()) value.free = round(value.stock - value.reserved - value.claimed);
  return pools;
};
/**
 * Free stock per material and project site = the site's Material inventory − quantities reserved for isometrics −
 * quantities on pick lists that have not been taken yet. Another isometric can only draw on this pool; a reservation
 * protects its owner.
 */
export const freePool = stockPools;

export interface StatusLine {
  requirement: Row; material: Row; identity: string; /** Pool of this line: its material in its isometric's site. */ pool: string; phase: string;
  required: number; picked: number; claimed: number; reserved: number; available: number; covered: number; shortage: number;
}
export interface IsoStatus { iso: Row; lines: StatusLine[]; percent: number | null }
/**
 * Material status of every isometric (THE one formula of MTO Pilot: the isometric header, its Materials panel and the
 * Isometric execution page all read it). Per requirement line:
 *   covered = min(Qty., picked + own untaken pick list + own reservations + free stock)
 * where free stock = the site's Material inventory − every untaken pick-list quantity − other isometrics' reservations,
 * handed to the isometric's lines of one material in creation order; percent = floor(Σ covered ÷ Σ Qty. × 100).
 * Open client questions (mto-iso-execution-R1): rounding, own pick-list credit, stock beyond the order, sharing.
 */
export function isoStatuses(rows: Record<string, Row[]>, options: { group?: string; isoId?: string } = {}): Map<string, IsoStatus> {
  const taken = { ...rows, picklists: active(rows, 'picklists').filter(isTaken) };
  const pools = stockPools(rows);
  const phases = new Map(active(rows, 'operation_phases').map(row => [row.id, String(row.name)]));
  const reservations = active(rows, 'reservations').filter(row => row.status === 'Reserved');
  const claims = active(rows, 'picklists').filter(row => !isTaken(row));
  const result = new Map<string, IsoStatus>();
  const entries = requirementExecution(taken, options.isoId ? { isoId: options.isoId } : {});
  for (const entry of entries) {
    const phase = phases.get(String(entry.requirement.phaseId)) || '';
    if (options.group && operationPhaseGroup(phase) !== options.group) continue;
    const status = result.get(entry.iso.id) || { iso: entry.iso, lines: [], percent: null };
    const own = (key: Row[]) => key.filter(row => row.isoId === entry.iso.id && materialIdentity(row) === entry.identity).reduce((sum, row) => sum + Number(row.quantity), 0);
    const key = poolKey(isoSiteId(rows, entry.iso), entry.identity), pool = pools.get(key);
    // Reserved by others and every claim are out of reach; this isometric's own reservations stay available to it.
    const ownReserved = round(own(reservations));
    const reachable = pool ? round(pool.stock - (pool.reserved - ownReserved) - pool.claimed) : 0;
    const used = status.lines.filter(line => line.pool === key).reduce((sum, line) => sum + line.available, 0);
    const claimed = round(claims.filter(row => row.requirementId === entry.requirement.id).reduce((sum, row) => sum + Number(row.quantity), 0));
    const remaining = Math.max(0, round(entry.required - entry.picked - claimed));
    const available = round(Math.min(remaining, Math.max(0, reachable - used)));
    const line: StatusLine = { requirement: entry.requirement, material: entry.material, identity: entry.identity, pool: key, phase, required: entry.required, picked: entry.picked, claimed, reserved: round(reservations.filter(row => row.requirementId === entry.requirement.id).reduce((sum, row) => sum + Number(row.quantity), 0)), available,
      covered: round(Math.min(entry.required, entry.picked + claimed + available)), shortage: round(Math.max(0, remaining - available)) };
    status.lines.push(line); result.set(entry.iso.id, status);
  }
  for (const status of result.values()) status.percent = materialStatus(status.lines.map(line => ({ required: line.required, picked: line.picked + line.claimed, available: line.available })));
  return result;
}

/** UNVERIFIED. Reserve: per requirement, the still-uncovered quantity (not picked, not on a pick list, not yet reserved) up to the free pool. */
export function planReserve(rows: Record<string, Row[]>, isoId: string) {
  const pools = stockPools(rows);
  const status = isoStatuses(rows, { isoId }).get(isoId);
  const plan: { requirement: Row; quantity: number }[] = [];
  for (const line of status?.lines || []) {
    const uncovered = Math.max(0, round(line.required - line.picked - line.claimed - line.reserved));
    const pool = pools.get(line.pool);
    const quantity = round(Math.min(uncovered, Math.max(0, pool?.free ?? 0)));
    if (quantity > 0) { plan.push({ requirement: line.requirement, quantity }); pool!.free = round(pool!.free - quantity); }
  }
  return plan;
}
/** UNVERIFIED. Start: per requirement, the quantity available now (own reservations plus free stock), up to what is still needed. */
export function planStart(rows: Record<string, Row[]>, isoId: string) {
  return (isoStatuses(rows, { isoId }).get(isoId)?.lines || []).filter(line => line.available > 0).map(line => ({ requirement: line.requirement, identity: line.identity, quantity: line.available, reserved: line.reserved }));
}
/**
 * Whether a pick list can take a quantity of one material from a project site's Material inventory: the site's stock
 * of that Material No (every charge) less what other untaken pick lists of the site claim. A pick list has one line per
 * requirement (the inventory is kept per Material No); the charges are drawn in charge order when it is taken.
 */
export function allocateStock(rows: Record<string, Row[]>, siteId: string, identity: string, quantity: number) {
  const onHand = siteStock(rows, siteId, identity).reduce((sum, row) => sum + Number(row.quantity), 0);
  const claimed = active(rows, 'picklists').filter(line => !isTaken(line) && picksFromSite(line) && materialIdentity(line) === identity && claimSiteId(rows, line) === siteId).reduce((sum, line) => sum + Number(line.quantity), 0);
  const room = Math.max(0, round(onHand - claimed));
  const take = round(Math.min(room, quantity));
  return { quantity: take, shortfall: round(quantity - take) };
}

// ---- Pick list archive ---------------------------------------------------------------------------------------------

export interface PickListReport { reportNo: string; date: string; isoId: string; projectId: string; taken: boolean; lines: Row[] }
/** One report per report number (a line issued directly stands alone under its own number); newest first. */
export function pickListReports(rows: Record<string, Row[]>, filters: { projectId?: string; from?: string; to?: string } = {}): PickListReport[] {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  const groups = new Map<string, Row[]>();
  for (const line of active(rows, 'picklists')) { const key = String(line.reportNo || line.number); groups.set(key, [...(groups.get(key) || []), line]); }
  return [...groups].flatMap(([reportNo, lines]) => {
    const iso = isos.get(String(lines[0].isoId)); if (!iso) return [];
    const date = lines.map(line => String(line.date || '').slice(0, 10)).sort()[0] || '';
    if (filters.projectId && iso.projectId !== filters.projectId || filters.from && date < filters.from || filters.to && date > filters.to) return [];
    return [{ reportNo, date, isoId: iso.id, projectId: String(iso.projectId), taken: lines.every(isTaken), lines: lines.sort(byCreation) }];
  }).sort((a, b) => b.date.localeCompare(a.date) || b.reportNo.localeCompare(a.reportNo));
}
/** An isometric counts as started once a pick list was created for it by Start (such lines carry a report number). */
export const startedReports = (rows: Record<string, Row[]>, isoId: string) => [...new Set(active(rows, 'picklists').filter(line => line.isoId === isoId && line.reportNo).map(line => String(line.reportNo)))];

// ---- Logistics -----------------------------------------------------------------------------------------------------

export type LocationType = 'Service' | 'Laydown' | '';
export interface SpoolRow {
  spool: Row; iso: Row; projectId: string; location: { type: LocationType; id: string };
  /** Paint spec., Chemical clean and PWHT are the isometric's: the spool record keeps only its name, diameter and location. */
  paintSpec: string; chemicalClean: string; pwht: boolean; lastRequest?: Row; openRequest?: Row;
}
/** "Currently on" is the service company, the laydown, or nothing (an empty cell that still opens the Spool history). */
export function spoolLocation(spool: Row): SpoolRow['location'] {
  return spool.serviceCompanyId ? { type: 'Service', id: String(spool.serviceCompanyId) } : spool.laydownId ? { type: 'Laydown', id: String(spool.laydownId) } : { type: '', id: '' };
}
/** The treatments of a spool, read from its isometric. */
export const spoolTreatments = (iso: Row) => ({ paintSpec: String(iso.paintSpec ?? ''), chemicalClean: String(iso.chemicalClean ?? ''), pwht: iso.pwht === true });
/** UNVERIFIED (the capture shows the same rows for "All" and "Hide finished"): a spool is finished when its isometric's preparation is complete. */
export const spoolFinished = (iso: Row) => iso.prep_finished === true;
export interface SpoolFilters { projectId?: string; isoId?: string; spoolName?: string; show?: 'all' | 'hideFinished' | string; paintSpec?: string; diameter?: string; chemicalClean?: string; currently?: string; lastReport?: string }
const contains = (value: unknown, query?: string) => !query || String(value ?? '').toLowerCase().includes(query.trim().toLowerCase());
/** The number of a request, compared as a number where it is one ("00002" before "00010"). */
const requestRank = (row?: Row) => row ? String(row.number) : '';
export function spoolRows(rows: Record<string, Row[]>, filters: SpoolFilters = {}): SpoolRow[] {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  const requests = active(rows, 'service_requests').filter(row => row.spoolId);
  return active(rows, 'spools').flatMap(spool => {
    const iso = isos.get(String(spool.isoId)); if (!iso || filters.projectId && iso.projectId !== filters.projectId || filters.isoId && iso.id !== filters.isoId) return [];
    const history = requests.filter(row => row.spoolId === spool.id).sort((a, b) => String(b.date).localeCompare(String(a.date)) || byCreation(b, a));
    const entry: SpoolRow = { spool, iso, projectId: String(iso.projectId), location: spoolLocation(spool), ...spoolTreatments(iso), lastRequest: history[0], openRequest: history.find(row => row.status !== 'Completed') };
    if (filters.spoolName && spool.name !== filters.spoolName || filters.show === 'hideFinished' && spoolFinished(iso)) return [];
    if (!contains(entry.paintSpec, filters.paintSpec) || !contains(spool.diameter, filters.diameter) || !contains(entry.chemicalClean, filters.chemicalClean)) return [];
    if (filters.currently && `${entry.location.type}:${entry.location.id}` !== filters.currently) return [];
    if (filters.lastReport && requestRank(entry.lastRequest) !== filters.lastReport) return [];
    return [entry];
  }).sort(bySpoolList);
}
/** The default order of the Service request list: Last request ascending (spools without a request first), then ISO and spool. */
const bySpoolList = (a: SpoolRow, b: SpoolRow) => requestRank(a.lastRequest).localeCompare(requestRank(b.lastRequest), 'en', { numeric: true })
  || String(a.iso.isoNo).localeCompare(String(b.iso.isoNo), 'en', { numeric: true }) || String(a.spool.name).localeCompare(String(b.spool.name), 'en', { numeric: true });

/** The options of the Spool filter: every spool name once. */
export const spoolNames = (rows: Record<string, Row[]>) => [...new Set(active(rows, 'spools').map(row => String(row.name)))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
/** The options of the Request filter: the numbers of the spool requests. */
export const spoolRequestNumbers = (rows: Record<string, Row[]>) => [...new Set(active(rows, 'service_requests').filter(row => row.spoolId).map(row => String(row.number)))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

// ---- Spool history ------------------------------------------------------------------------------------------------

export interface SpoolMoveEntry { id: string; date: string; type: string; location: string }
/** The Spool history of a spool: every laydown move and service request, newest first (Date / Type / Location). */
export function spoolHistory(rows: Record<string, Row[]>, spoolId: string): SpoolMoveEntry[] {
  return active(rows, 'spool_moves').filter(row => row.spoolId === spoolId).sort((a, b) => String(b.date).localeCompare(String(a.date)) || byCreation(b, a))
    .map(row => ({ id: row.id, date: String(row.date), type: String(row.type), location: String(row.location || '') }));
}
/** What a service entry of the history says about its place: the request number and the company ("Ord. No. 00069 Farbara"). */
export const serviceLocationText = (number: string, company: string) => `Ord. No. ${number} ${company}`.trim();

// ---- Laydown content -----------------------------------------------------------------------------------------------

export interface LaydownLine { key: string; spool: Row; iso: Row; projectId: string; treatments: ReturnType<typeof spoolTreatments>; services: number; date?: string }
const servicesOf = (rows: Record<string, Row[]>, spoolId: string) => new Set(active(rows, 'service_requests').filter(row => row.spoolId === spoolId).map(row => String(row.number))).size;
/** The spools that are on a laydown now, with the number of service requests each had. */
export function laydownContent(rows: Record<string, Row[]>, laydownId: string): LaydownLine[] {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  return active(rows, 'spools').filter(spool => spool.laydownId === laydownId && !spool.serviceCompanyId).flatMap(spool => {
    const iso = isos.get(String(spool.isoId)); if (!iso) return [];
    return [{ key: spool.id, spool, iso, projectId: String(iso.projectId), treatments: spoolTreatments(iso), services: servicesOf(rows, spool.id) }];
  }).sort((a, b) => String(a.iso.isoNo).localeCompare(String(b.iso.isoNo), 'en', { numeric: true }) || String(a.spool.name).localeCompare(String(b.spool.name), 'en', { numeric: true }));
}
/** The History of a laydown: one line for each time a spool was moved onto it, newest first. */
export function laydownHistory(rows: Record<string, Row[]>, laydownId: string): LaydownLine[] {
  const spools = new Map(active(rows, 'spools').map(row => [row.id, row])); const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  return active(rows, 'spool_moves').filter(row => row.type === 'Laydown' && row.laydownId === laydownId).sort((a, b) => String(b.date).localeCompare(String(a.date)) || byCreation(b, a)).flatMap(move => {
    const spool = spools.get(String(move.spoolId)); const iso = spool && isos.get(String(spool.isoId)); if (!spool || !iso) return [];
    return [{ key: move.id, spool, iso, projectId: String(iso.projectId), treatments: spoolTreatments(iso), services: servicesOf(rows, spool.id), date: String(move.date) }];
  });
}

// ---- Requests ------------------------------------------------------------------------------------------------------

/** What a request carries, for the archive: spool names or material numbers. */
export function requestItem(rows: Record<string, Row[]>, request: Row): string {
  if (request.spoolId) return String(active(rows, 'spools').find(row => row.id === request.spoolId)?.name || 'Unavailable spool');
  const requirement = active(rows, 'iso_materials').find(row => row.id === request.requirementId);
  return requirement ? String(materialRecord(rows, requirement)?.materialNo || requirement.materialNo || 'Unavailable material') : 'Unavailable material';
}
/** Request numbers are five digits (00001, 00002, ...); the next one follows the highest five-digit number in use. Older numbers (SR-2026-0004) are shown as stored and never counted. */
export function nextRequestNumber(numbers: unknown[]): string {
  const highest = Math.max(0, ...numbers.map(number => /^\d{5}$/.test(String(number)) ? Number(number) : 0));
  return String(highest + 1).padStart(5, '0');
}
/** The Request archive opens on the last 30 days up to the end of the current month ("2026-11-16" gives 2026-10-17 to 2026-11-30). */
export function archiveDefaultRange(today: string): { from: string; to: string } {
  const [year, month, day] = today.split('-').map(Number);
  const text = (date: Date) => date.toISOString().slice(0, 10);
  return { from: text(new Date(Date.UTC(year, month - 1, day - 30))), to: text(new Date(Date.UTC(year, month, 0))) };
}

/** A spool request (Service request) or a material request (Service request - Materials). */
export const requestKind = (request: Row): 'Spool' | 'Material' => request.requirementId && !request.spoolId ? 'Material' : 'Spool';
/** The main project (project site) of a request: through its spool or its material line, the isometric and the project. */
export function requestSiteId(rows: Record<string, Row[]>, request: Row): string {
  const isoId = request.spoolId ? (rows.spools || []).find(row => row.id === request.spoolId)?.isoId : (rows.iso_materials || []).find(row => row.id === request.requirementId)?.isoId;
  return isoSiteId(rows, (rows.isometrics || []).find(row => row.id === isoId));
}
/** The next spool request number: one five-digit sequence of the spool requests (material requests count apart). */
export const spoolRequestNumber = (requests: Row[]) => nextRequestNumber(requests.filter(row => requestKind(row) === 'Spool').map(row => row.number));
/**
 * The next material request number (mto-logistics-023, default of the owner): a five-digit sequence of its own per main
 * project, after the highest five-digit number of that main project's material requests. Older numbers stay as stored.
 * `rows` must hold every material request, archived ones included, so that a number is never handed out twice.
 */
export function materialRequestNumber(rows: Record<string, Row[]>, siteId: string): string {
  return nextRequestNumber((rows.service_requests || []).filter(row => requestKind(row) === 'Material' && requestSiteId(rows, row) === siteId).map(row => row.number));
}

/** Document types of the files a service request holds (attachments of its first record). */
export const SERVICE_REQUEST_FILES = { serviceRequest: 'ServiceRequest', coatingRelease: 'CoatingRelease', signed: 'Signed release note', uploaded: 'Uploaded signed document' } as const;
/** Files only the server writes: the generic file route refuses them, and they cannot be archived. */
export const RESERVED_REQUEST_FILES: string[] = Object.values(SERVICE_REQUEST_FILES);
/** The name of the documents of a request: <yyyymmdd>_S<main project>_R<number> ("20240628_S1_R00002"). */
export const serviceRequestFileBase = (date: string, siteNumber: number | string, number: string) => `${String(date).slice(0, 10).replaceAll('-', '')}_S${siteNumber || 0}_R${number}`;
/**
 * The number of a main project in file names. The reference prints its numeric site id; ours is the main project's place
 * in creation order (archived ones count, so a number never changes), 0 when unknown.
 */
export function siteNumber(sites: Row[], siteId: string): number {
  const index = [...sites].sort(byCreation).findIndex(row => row.id === siteId);
  return index + 1;
}

export interface SignOff { at: string; by: string; via: 'Online' | 'Upload' }
/** Whether (and how) a request is signed: Sign & save PDF or an uploaded signed scan. A signed request is read-only. */
export function requestSignOff(requests: Row[]): SignOff | null {
  const signed = requests.find(request => request.signedAt);
  return signed ? { at: String(signed.signedAt), by: String(signed.signedBy || ''), via: signed.signedVia === 'Upload' ? 'Upload' : 'Online' } : null;
}

export interface ArchiveRequest {
  /** Kind, main project (material requests) and number: what makes a request unique now that the two kinds count apart. */
  key: string; headId: string; siteId: string;
  number: string; date: string; dateTime: string; name: string; companyId: string; kind: 'Spool' | 'Material'; items: string[]; status: string; completedAt: string; includeDrawings: boolean; openIds: string[];
  /** Records of the request (one per spool or material) and the person who made it. */
  ids: string[]; addedBy: string; note: string;
  /** Other files attached to the request (downloads). */
  documents: Row[];
  /** The two generated documents and the signed one (online or uploaded), when stored. */
  files: { serviceRequest?: Row; coatingRelease?: Row; signed?: Row };
  signOff: SignOff | null;
  /** What was entered on Sign online (shown read-only once signed). */
  signature: { contractorName: string; contractorDate: string; clientName: string; clientDate: string; noboName: string; noboDate: string };
}
export interface ArchiveFilters { from?: string; to?: string; kind?: 'Spool' | 'Material'; sort?: 'asc' | 'desc' }
/**
 * Service requests grouped by request number (one request can carry several spools or materials). The archive lists one
 * type at a time (default: spools), by date and time, newest first unless `sort` says ascending.
 */
export function requestArchive(rows: Record<string, Row[]>, filters: ArchiveFilters = {}): ArchiveRequest[] {
  const groups = new Map<string, Row[]>();
  for (const request of active(rows, 'service_requests')) {
    const kind = requestKind(request); const key = `${kind}|${kind === 'Material' ? requestSiteId(rows, request) : ''}|${request.number}`;
    groups.set(key, [...(groups.get(key) || []), request]);
  }
  const attachments = active(rows, 'attachments').filter(row => row.entityType === 'service_requests');
  const list = [...groups].flatMap(([key, unsorted]) => {
    const requests = unsorted.sort(byCreation); const head = requests[0]; const number = String(head.number);
    const kind = requestKind(head);
    const dateTime = requests.map(request => String(request.requestedAt || request.date || '')).sort()[0] || '';
    const date = requests.map(request => String(request.date || '').slice(0, 10)).sort()[0] || dateTime.slice(0, 10);
    if (filters.kind && kind !== filters.kind || filters.from && date < filters.from || filters.to && date > filters.to) return [];
    const open = requests.filter(request => request.status !== 'Completed');
    const status = !open.length ? 'Completed' : open.some(request => request.status === 'In progress') ? 'In progress' : 'Requested';
    const completed = requests.map(request => String(request.completedAt || '')).sort();
    const ids = requests.map(request => request.id);
    const own = attachments.filter(row => ids.includes(String(row.entityId))).sort(byCreation);
    const newest = (...types: string[]) => own.filter(row => types.includes(String(row.documentType))).at(-1);
    const signed = head.signedAt ? head : requests.find(request => request.signedAt) || head;
    const text = (name: string) => String(signed[name] ?? '');
    return [{ key, headId: head.id, siteId: requestSiteId(rows, head), number, date, dateTime, name: String(head.name || ''), companyId: String(head.companyId || ''), kind, items: requests.map(request => requestItem(rows, request)), status,
      completedAt: open.length ? '' : completed[completed.length - 1] || '', includeDrawings: requests.some(request => request.includeDrawings === true), openIds: open.map(request => request.id),
      ids, addedBy: String(requests.find(request => request.addedBy)?.addedBy || ''), note: String(head.note || ''),
      documents: own.filter(row => !RESERVED_REQUEST_FILES.includes(String(row.documentType))),
      files: { serviceRequest: newest(SERVICE_REQUEST_FILES.serviceRequest), coatingRelease: newest(SERVICE_REQUEST_FILES.coatingRelease), signed: newest(SERVICE_REQUEST_FILES.signed, SERVICE_REQUEST_FILES.uploaded) },
      signOff: requestSignOff(requests),
      signature: { contractorName: text('contractorName'), contractorDate: text('contractorDate'), clientName: text('clientName'), clientDate: text('clientDate'), noboName: text('noboName'), noboDate: text('noboDate') } }];
  });
  const order = (a: ArchiveRequest, b: ArchiveRequest) => (a.dateTime || a.date).localeCompare(b.dateTime || b.date) || a.number.localeCompare(b.number);
  return list.sort(filters.sort === 'asc' ? order : (a, b) => order(b, a));
}
/** The request a record belongs to (any of its records), whatever its date. */
export const requestOf = (rows: Record<string, Row[]>, id: string) => requestArchive(rows).find(request => request.ids.includes(id));

// ---- Service request documents -------------------------------------------------------------------------------------

/** The table of both documents, per project group (MTO manual 15.4). */
export const SERVICE_REQUEST_COLUMNS = ['Project', 'ISO no', 'Asset tag', 'Drawing no', 'Spool', 'Diameter', 'Paint spec', 'PWHT', 'Chemical clean', 'Tracing'];
/**
 * UNVERIFIED (the reference prints YES/NO; the isometric keeps a Tracing Spec text): tracing is YES when the isometric
 * names a tracing spec, NO when it is empty or says there is none.
 */
export const tracingFlag = (value: unknown) => { const text = String(value ?? '').trim().toLowerCase(); return text && !['-', 'no', 'n/a', 'na', 'none', '0', 'nee'].includes(text) ? 'YES' : 'NO'; };
export interface ServiceRequestGroup { projectId: string; project: string; lines: string[][]; isoIds: string[] }
export interface ServiceRequestDocument {
  reportNo: string; company: string; addedBy: string; dateTime: string; date: string; note: string; requestId: string;
  includeDrawings: boolean; siteId: string; groups: ServiceRequestGroup[];
}
const natural = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true });
/** What the Service request and the Release note print: the header of the request and one table per project. */
export function serviceRequestDocumentData(rows: Record<string, Row[]>, request: ArchiveRequest): ServiceRequestDocument {
  const records = (rows.service_requests || []).filter(row => request.ids.includes(row.id));
  const spools = new Map((rows.spools || []).map(row => [row.id, row])); const isos = new Map((rows.isometrics || []).map(row => [row.id, row])); const projects = new Map((rows.projects || []).map(row => [row.id, row]));
  const groups = new Map<string, ServiceRequestGroup>();
  /** A project is named by its internal project number, as everywhere in the pilots. */
  const projectName = (id: unknown) => String(projects.get(String(id))?.internnumber ?? '');
  const entries = records.flatMap(record => { const spool = spools.get(String(record.spoolId)); const iso = spool && isos.get(String(spool.isoId)); return spool && iso ? [{ spool, iso }] : []; })
    .sort((a, b) => natural(projectName(a.iso.projectId), projectName(b.iso.projectId)) || natural(a.iso.isoNo, b.iso.isoNo) || natural(a.spool.name, b.spool.name));
  for (const { spool, iso } of entries) {
    const projectId = String(iso.projectId); const project = projectName(projectId);
    const group = groups.get(projectId) || { projectId, project, lines: [], isoIds: [] };
    const treatments = spoolTreatments(iso);
    group.lines.push([project, String(iso.isoNo ?? ''), String(iso.assetTag ?? ''), String(iso.drawingNo ?? ''), String(spool.name ?? ''), String(spool.diameter ?? ''), treatments.paintSpec, treatments.pwht ? 'YES' : 'NO', treatments.chemicalClean, tracingFlag(iso.tracing)]);
    if (!group.isoIds.includes(iso.id)) group.isoIds.push(iso.id);
    groups.set(projectId, group);
  }
  const company = (rows.service_companies || []).find(row => row.id === request.companyId);
  return { reportNo: request.number, company: String(company?.name ?? ''), addedBy: request.addedBy, dateTime: request.dateTime, date: request.date, note: request.note, requestId: request.headId, includeDrawings: request.includeDrawings, siteId: request.siteId, groups: [...groups.values()] };
}

// ---- Sign online ---------------------------------------------------------------------------------------------------

/** How the Contractor / Supplier signs: the account's saved full signature, its saved initials (short signature), or a drawing. */
export const CONTRACTOR_SIGN_METHODS = ['Signature', 'Initials', 'Draw'] as const;
export interface SignOnlineInput {
  note?: unknown; contractorName?: unknown; contractorDate?: unknown; contractorMethod?: unknown; contractorSignature?: unknown;
  clientName?: unknown; clientDate?: unknown; clientSignature?: unknown; noboName?: unknown; noboDate?: unknown; noboSignature?: unknown;
}
export const SIGN_ONLINE_FIELDS = ['note', 'contractorName', 'contractorDate', 'contractorMethod', 'contractorSignature', 'clientName', 'clientDate', 'clientSignature', 'noboName', 'noboDate', 'noboSignature'];
const filled = (value: unknown) => typeof value === 'string' && value.trim() !== '';
/**
 * The refusals of Sign & save PDF, per field (empty when the form is complete): every Name and Signature is required
 * (MTO manual, Sign online window); a Date is optional but must be a date. `saved` says whether the account has the
 * saved signature its chosen method needs.
 */
export function signOffComplete(input: SignOnlineInput, saved: { Signature: boolean; Initials: boolean } = { Signature: false, Initials: false }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!filled(input.contractorName)) errors.contractorName = 'Contractor / Supplier name is required.';
  const method = String(input.contractorMethod || 'Draw');
  if (!(CONTRACTOR_SIGN_METHODS as readonly string[]).includes(method)) errors.contractorSignature = 'Choose Signature, Initials or Draw.';
  else if (method === 'Draw' ? !filled(input.contractorSignature) : !saved[method as 'Signature' | 'Initials']) errors.contractorSignature = method === 'Draw' ? 'The Contractor / Supplier signature is required.' : `You have no saved ${method === 'Signature' ? 'signature' : 'initials'}. Save one under System → Signatures, or draw.`;
  if (!filled(input.clientName)) errors.clientName = 'Client name is required.';
  if (!filled(input.clientSignature)) errors.clientSignature = 'The client signature is required.';
  if (!filled(input.noboName)) errors.noboName = 'NoBo name is required.';
  if (!filled(input.noboSignature)) errors.noboSignature = 'The NoBo signature is required.';
  for (const name of ['contractorDate', 'clientDate', 'noboDate'] as const) { const value = input[name]; if (value !== undefined && value !== '' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) errors[name] = 'Enter a valid date.'; }
  for (const name of ['contractorName', 'clientName', 'noboName', 'note'] as const) { const value = input[name]; if (value !== undefined && typeof value !== 'string') errors[name] = 'Enter text.'; else if (typeof value === 'string' && value.length > (name === 'note' ? 2000 : 200)) errors[name] = 'This text is too long.'; }
  return errors;
}
/** A drawn signature as the dialog sends it: a PNG data URL of at most 1 MB. Null when it is anything else. */
export function drawnSignature(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value); if (!match) return null;
  const bytes = Uint8Array.from(atob(match[1]), char => char.charCodeAt(0));
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length <= 1024 * 1024 && png.every((byte, index) => bytes[index] === byte) ? bytes : null;
}

// ---- Spool export ---------------------------------------------------------------------------------------------------

/** The columns of the Excel spool export (Service request -> Export), as on screen. */
export const SPOOL_EXPORT_COLUMNS = ['Project', 'ISO', 'Spool', 'Diameter', 'Paint spec.', 'PWHT', 'Chemical clean', 'Currently on', 'Last request'];
/** The rows of the spool export: the list in its default order (Last request ascending), after the same filters as the screen. */
export function spoolExportLines(rows: Record<string, Row[]>, filters: SpoolFilters, label: (resource: string, id: string) => string): string[][] {
  return spoolRows(rows, filters).map(entry => [label('projects', entry.projectId), String(entry.iso.isoNo), String(entry.spool.name), String(entry.spool.diameter ?? ''), entry.paintSpec, entry.pwht ? 'Yes' : 'No', entry.chemicalClean,
    entry.location.id ? label(entry.location.type === 'Service' ? 'service_companies' : 'laydowns', entry.location.id) : '', entry.lastRequest ? String(entry.lastRequest.number) : '']);
}
