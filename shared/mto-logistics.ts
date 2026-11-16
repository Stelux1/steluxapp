import type { ActionDefinition, ActionField, Availability, PermissionVerb, Row } from './types.ts';
import { materialIdentity, materialRecord, requirementExecution } from './materials.ts';

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
  deliver(availability, 'picklists');
  deliver(availability, 'service_requests', names('number name spoolId requirementId companyId laydownId materialLaydownId date completedAt status note includeDrawings'));
  // Records without a page of their own. `stock` is read-only here: only what the material status needs.
  merge(availability, 'stock', names('materialId customMaterialId chargeNo quantity'));
  merge(availability, 'reservations', names('isoId requirementId materialId customMaterialId quantity date status note'));
  merge(availability, 'material_locations', names('requirementId laydownId companyId date'));
  merge(availability, 'material_location_events', names('number requirementId type laydownId companyId requestId date note'));
  merge(availability, 'spools', names('paintSpec chemicalClean pwht laydownId serviceCompanyId'));
  mergeAction(availability, 'service', names('spoolIds companyId name includeDrawings date note'));
  mergeAction(availability, 'complete-service', names('requestIds laydownId date note'));
  mergeAction(availability, 'move-spools', names('spoolIds laydownId date note'));
  mergeAction(availability, 'move-materials', names('requirementIds laydownId date note'));
  mergeAction(availability, 'service-materials', names('requirementIds companyId name materialLaydownId date note'));
  mergeAction(availability, 'complete-material-service', names('requestIds materialLaydownId date note'));
  for (const def of MTO_ACTION_DEFS) mergeAction(availability, def.key, def.fields.map(field => field.name));
}

// ---- Material status -----------------------------------------------------------------------------------------------

export interface StatusInput { required: number; picked: number; available: number }
/**
 * UNVERIFIED. Percentage of an isometric's requirements that are covered: covered = min(required, picked + available
 * inventory) summed over the lines, divided by the summed requirement, rounded DOWN so 100 % means complete.
 * Null when there is nothing required. Replace by the shared definition (shared/mto-materials.ts) when it exists.
 */
export function materialStatus(lines: StatusInput[]): number | null {
  const required = lines.reduce((sum, line) => sum + Math.max(0, line.required), 0);
  if (required <= 0) return null;
  const covered = lines.reduce((sum, line) => sum + Math.min(Math.max(0, line.required), Math.max(0, line.picked) + Math.max(0, line.available)), 0);
  return Math.min(100, Math.floor(round((covered / required) * 100)));
}
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
const stockPools = (rows: Record<string, Row[]>) => {
  const pools = new Map<string, Pool>();
  const pool = (identity: string) => { let value = pools.get(identity); if (!value) pools.set(identity, value = { stock: 0, reserved: 0, claimed: 0, free: 0 }); return value; };
  for (const row of active(rows, 'stock')) pool(materialIdentity(row)).stock = round(pool(materialIdentity(row)).stock + Number(row.quantity));
  for (const row of active(rows, 'reservations').filter(row => row.status === 'Reserved')) pool(materialIdentity(row)).reserved = round(pool(materialIdentity(row)).reserved + Number(row.quantity));
  for (const row of active(rows, 'picklists').filter(row => !isTaken(row))) pool(materialIdentity(row)).claimed = round(pool(materialIdentity(row)).claimed + Number(row.quantity));
  for (const value of pools.values()) value.free = round(value.stock - value.reserved - value.claimed);
  return pools;
};
/**
 * UNVERIFIED. Free stock per material = stock on hand − quantities reserved for isometrics − quantities on pick lists
 * that have not been taken yet. Another isometric can only draw on this pool; a reservation protects its owner.
 */
export const freePool = stockPools;

export interface StatusLine {
  requirement: Row; material: Row; identity: string; phase: string;
  required: number; picked: number; claimed: number; reserved: number; available: number; covered: number; shortage: number;
}
export interface IsoStatus { iso: Row; lines: StatusLine[]; percent: number | null }
/**
 * Material status of every isometric: what is picked (taken pick lists, as the material execution counts it), what is
 * claimed by pick lists not yet taken, what is reserved, and what the free stock can still cover for this isometric
 * (its own reservations count as available to it; other isometrics' reservations and all claims do not).
 */
export function isoStatuses(rows: Record<string, Row[]>, options: { group?: string } = {}): Map<string, IsoStatus> {
  const taken = { ...rows, picklists: active(rows, 'picklists').filter(isTaken) };
  const pools = stockPools(rows);
  const phases = new Map(active(rows, 'operation_phases').map(row => [row.id, String(row.name)]));
  const reservations = active(rows, 'reservations').filter(row => row.status === 'Reserved');
  const claims = active(rows, 'picklists').filter(row => !isTaken(row));
  const result = new Map<string, IsoStatus>();
  const entries = requirementExecution(taken);
  for (const entry of entries) {
    const phase = phases.get(String(entry.requirement.phaseId)) || '';
    if (options.group && operationPhaseGroup(phase) !== options.group) continue;
    const status = result.get(entry.iso.id) || { iso: entry.iso, lines: [], percent: null };
    const own = (key: Row[]) => key.filter(row => row.isoId === entry.iso.id && materialIdentity(row) === entry.identity).reduce((sum, row) => sum + Number(row.quantity), 0);
    const pool = pools.get(entry.identity);
    // Reserved by others and every claim are out of reach; this isometric's own reservations stay available to it.
    const ownReserved = round(own(reservations));
    const reachable = pool ? round(pool.stock - (pool.reserved - ownReserved) - pool.claimed) : 0;
    const used = status.lines.filter(line => line.identity === entry.identity).reduce((sum, line) => sum + line.available, 0);
    const claimed = round(claims.filter(row => row.requirementId === entry.requirement.id).reduce((sum, row) => sum + Number(row.quantity), 0));
    const remaining = Math.max(0, round(entry.required - entry.picked - claimed));
    const available = round(Math.min(remaining, Math.max(0, reachable - used)));
    const line: StatusLine = { requirement: entry.requirement, material: entry.material, identity: entry.identity, phase, required: entry.required, picked: entry.picked, claimed, reserved: round(reservations.filter(row => row.requirementId === entry.requirement.id).reduce((sum, row) => sum + Number(row.quantity), 0)), available,
      covered: round(Math.min(entry.required, entry.picked + claimed + available)), shortage: round(Math.max(0, remaining - available)) };
    status.lines.push(line); result.set(entry.iso.id, status);
  }
  for (const status of result.values()) status.percent = materialStatus(status.lines.map(line => ({ required: line.required, picked: line.picked + line.claimed, available: line.available })));
  return result;
}

/** UNVERIFIED. Reserve: per requirement, the still-uncovered quantity (not picked, not on a pick list, not yet reserved) up to the free pool. */
export function planReserve(rows: Record<string, Row[]>, isoId: string) {
  const pools = stockPools(rows);
  const status = isoStatuses(rows).get(isoId);
  const plan: { requirement: Row; quantity: number }[] = [];
  for (const line of status?.lines || []) {
    const uncovered = Math.max(0, round(line.required - line.picked - line.claimed - line.reserved));
    const pool = pools.get(line.identity);
    const quantity = round(Math.min(uncovered, Math.max(0, pool?.free ?? 0)));
    if (quantity > 0) { plan.push({ requirement: line.requirement, quantity }); pool!.free = round(pool!.free - quantity); }
  }
  return plan;
}
/** UNVERIFIED. Start: per requirement, the quantity available now (own reservations plus free stock), up to what is still needed. */
export function planStart(rows: Record<string, Row[]>, isoId: string) {
  return (isoStatuses(rows).get(isoId)?.lines || []).filter(line => line.available > 0).map(line => ({ requirement: line.requirement, identity: line.identity, quantity: line.available, reserved: line.reserved }));
}
/**
 * Where a pick list takes its quantity from: stock rows of the material, by charge number then warehouse, each row
 * limited to what is not already on another pick list. Returns what could be allocated per row and the shortfall.
 */
export function allocateStock(rows: Record<string, Row[]>, identity: string, quantity: number) {
  const claims = active(rows, 'picklists').filter(line => !isTaken(line) && materialIdentity(line) === identity);
  const candidates = active(rows, 'stock').filter(row => materialIdentity(row) === identity && Number(row.quantity) > 0)
    .sort((a, b) => String(a.chargeNo || '').localeCompare(String(b.chargeNo || '')) || String(a.warehouseId).localeCompare(String(b.warehouseId)) || a.id.localeCompare(b.id));
  let left = round(quantity); const parts: { stock: Row; quantity: number }[] = [];
  for (const stock of candidates) {
    if (left <= 0) break;
    const claimed = claims.filter(line => line.warehouseId === stock.warehouseId && String(line.chargeNo || '') === String(stock.chargeNo || '')).reduce((sum, line) => sum + Number(line.quantity), 0);
    const room = round(Number(stock.quantity) - claimed); if (room <= 0) continue;
    const take = round(Math.min(room, left)); parts.push({ stock, quantity: take }); left = round(left - take);
  }
  return { parts, shortfall: left };
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

export interface SpoolRow { spool: Row; iso: Row; projectId: string; location: { type: 'Service' | 'Laydown' | 'Transport'; id: string }; lastRequest?: Row; openRequest?: Row }
/**
 * UNVERIFIED. "Currently on" shows the service company, the laydown, or "Transport" for a spool that is on neither
 * (for example one returned from service without a destination laydown).
 */
export function spoolLocation(spool: Row): SpoolRow['location'] {
  return spool.serviceCompanyId ? { type: 'Service', id: String(spool.serviceCompanyId) } : spool.laydownId ? { type: 'Laydown', id: String(spool.laydownId) } : { type: 'Transport', id: '' };
}
export function spoolRows(rows: Record<string, Row[]>, filters: { projectId?: string; isoId?: string } = {}): SpoolRow[] {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  const requests = active(rows, 'service_requests').filter(row => row.spoolId);
  return active(rows, 'spools').flatMap(spool => {
    const iso = isos.get(String(spool.isoId)); if (!iso || filters.projectId && iso.projectId !== filters.projectId || filters.isoId && iso.id !== filters.isoId) return [];
    const history = requests.filter(row => row.spoolId === spool.id).sort((a, b) => String(b.date).localeCompare(String(a.date)) || byCreation(b, a));
    return [{ spool, iso, projectId: String(iso.projectId), location: spoolLocation(spool), lastRequest: history[0], openRequest: history.find(row => row.status !== 'Completed') }];
  }).sort((a, b) => String(a.iso.isoNo).localeCompare(String(b.iso.isoNo)) || String(a.spool.name).localeCompare(String(b.spool.name)));
}
/** What a request carries, for the archive: spool names or material numbers. */
export function requestItem(rows: Record<string, Row[]>, request: Row): string {
  if (request.spoolId) return String(active(rows, 'spools').find(row => row.id === request.spoolId)?.name || 'Unavailable spool');
  const requirement = active(rows, 'iso_materials').find(row => row.id === request.requirementId);
  return requirement ? String(materialRecord(rows, requirement)?.materialNo || requirement.materialNo || 'Unavailable material') : 'Unavailable material';
}

export interface ArchiveRequest { number: string; date: string; name: string; companyId: string; kind: 'Spool' | 'Material'; items: string[]; status: string; completedAt: string; includeDrawings: boolean; openIds: string[] }
/** Service requests grouped by request number (one request can carry several spools or materials), newest first. */
export function requestArchive(rows: Record<string, Row[]>, filters: { from?: string; to?: string } = {}): ArchiveRequest[] {
  const groups = new Map<string, Row[]>();
  for (const request of active(rows, 'service_requests')) groups.set(String(request.number), [...(groups.get(String(request.number)) || []), request]);
  return [...groups].flatMap(([number, requests]) => {
    const date = requests.map(request => String(request.date || '').slice(0, 10)).sort()[0] || '';
    if (filters.from && date < filters.from || filters.to && date > filters.to) return [];
    const open = requests.filter(request => request.status !== 'Completed');
    const status = !open.length ? 'Completed' : open.some(request => request.status === 'In progress') ? 'In progress' : 'Requested';
    const completed = requests.map(request => String(request.completedAt || '')).sort();
    return [{ number, date, name: String(requests[0].name || ''), companyId: String(requests[0].companyId || ''), kind: requests[0].spoolId ? 'Spool' as const : 'Material' as const, items: requests.map(request => requestItem(rows, request)), status,
      completedAt: open.length ? '' : completed[completed.length - 1] || '', includeDrawings: requests.some(request => request.includeDrawings === true), openIds: open.map(request => request.id) }];
  }).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}
