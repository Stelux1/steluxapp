import type { Row } from './types.ts';
import { lineIsoIds, materialIdentity, materialRecord, orderProjectIds, requirementExecution } from './materials.ts';

/**
 * MTO Pilot procurement: Order materials, Pending order, Material take in and Order archive.
 * Everything here is pure (rows in, rows out) so the same rules run in the browser and in the tests.
 */
type Rows = Record<string, Row[]>;
const active = (rows: Rows, key: string) => (rows[key] || []).filter(row => !row._archived);
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const text = (value: unknown) => String(value ?? '');

/** The four pages, their route, the permission area that opens them (reference areas 13, 14, 15, 17) and the records they read. */
export const PROCUREMENT_PAGES = [
  { key: 'order-materials', label: 'Order materials', path: '/materials/order-materials', scope: '13', resources: ['iso_materials', 'orders', 'order_lines'] },
  { key: 'pending-order', label: 'Pending order', path: '/materials/pending-orders', scope: '14', resources: ['orders', 'order_lines'] },
  { key: 'take-in', label: 'Material take in', path: '/materials/take-in', scope: '15', resources: ['receipts', 'orders', 'order_lines'] },
  { key: 'order-archive', label: 'Order archive', path: '/materials/order-archive', scope: '17', resources: ['orders', 'order_lines'] },
] as const;
export const PROCUREMENT_PATHS: string[] = PROCUREMENT_PAGES.map(page => page.path);

/**
 * Resources and actions the hosted profile delivers for these pages. Records only: no menu page of their own.
 * Orders, order lines and stock are shared with the other MTO flows and delivered once, with every field, in
 * `availabilityFor()` (shared/release.ts).
 */
export const PROCUREMENT_RESOURCE_FIELDS: Record<string, string[]> = {
  receipts: ['orderId', 'lineId', 'materialId', 'customMaterialId', 'warehouseId', 'supplierId', 'chargeNo', 'quantity', 'date', 'takenAt', 'correction', 'correctsId', 'note'],
  suppliers: ['name', 'address', 'zip', 'residence', 'phone', 'email', 'description'],
  // No storehouse: a take-in books into the Material inventory of the order's project site (shared/mto-stock.ts).
};
export const PROCUREMENT_ACTION_FIELDS: Record<string, string[]> = {
  'order-requirements': ['requirementIds', 'supplierId', 'date', 'note'],
  // Additional order (e.g. a pipe cut wrongly): one material on top of the project need, with a required reason.
  'order-additional': ['projectId', 'materialId', 'customMaterialId', 'quantity', 'supplierId', 'reason', 'date'],
  receive: ['orderId', 'supplierId', 'warehouseId', 'date', 'note', 'items'],
  'correct-receipt': ['receiptId', 'quantity', 'date', 'note'],
  // Order archive: link an order to a supplier (the take-in supplier stays on the receipts).
  'assign-order-supplier': ['orderId', 'supplierId'],
};

/** Order status from its lines: nothing received yet is Pending, everything received is Received. */
export function orderStatus(lines: Record<string, unknown>[]): 'Pending' | 'Partially received' | 'Received' {
  if (!lines.length || lines.every(line => Number(line.received) <= 0)) return 'Pending';
  return lines.every(line => Number(line.received) >= Number(line.quantity)) ? 'Received' : 'Partially received';
}

export interface ScopeFilter { projectId?: string; isoId?: string; from?: string; to?: string; query?: string }
const includes = (values: unknown[], query?: string) => !query || values.some(value => text(value).toLowerCase().includes(query.trim().toLowerCase()));

/** Orders on this screen are cross-project records: keep one when it (or one of its lines) belongs to a project in view. */
export function orderInScope(rows: Rows, order: Row, filter: ScopeFilter = {}) {
  const projects = orderProjectIds(rows, order.id);
  if (filter.projectId && !projects.includes(filter.projectId)) return false;
  if (filter.isoId && !(rows.order_lines || []).some(line => line.orderId === order.id && lineIsoIds(rows, line).includes(filter.isoId!))) return false;
  return true;
}

export interface PlannedMaterial {
  identity: string; material: Row; requirementIds: string[]; isoIds: string[];
  /** What the requirements still need (Σ required − ordered), what open order lines of the material still bring (Σ ordered − received), and the quantity to order: need − outstanding, never below 0. */
  need: number; outstanding: number; quantity: number;
}
const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const projectSites = (rows: Rows) => new Map(active(rows, 'projects').map(project => [project.id, text(project.siteId)]));
/** The project site an order line belongs to: that of its isometric (or of the requirements it was merged from), else of the order's project. */
export function orderLineSiteId(rows: Rows, line: Row, order?: Row): string {
  const sites = projectSites(rows), isos = new Map(active(rows, 'isometrics').map(iso => [iso.id, iso]));
  for (const isoId of lineIsoIds(rows, line)) { const site = sites.get(text(isos.get(isoId)?.projectId)); if (site) return site; }
  return sites.get(text((order ?? active(rows, 'orders').find(row => row.id === line.orderId))?.projectId)) || '';
}
/** Per project site and material (`site|identity`): what open order lines still bring, Σ max(0, ordered − received). A fully received line counts nothing. */
export function openOrderOutstanding(rows: Rows): Map<string, number> {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const result = new Map<string, number>();
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId)); const open = round(Math.max(0, Number(line.quantity) - Number(line.received)));
    // An additional order is on top of the project need: what it still brings never covers the regular need.
    if (!order || open <= 0 || line.additional) continue;
    const key = `${orderLineSiteId(rows, line, order)}|${materialIdentity(line)}`;
    result.set(key, round((result.get(key) || 0) + open));
  }
  return result;
}
type Entry = ReturnType<typeof requirementExecution>[number];
/**
 * One row per material: the need of the given requirement lines, less what open orders of that material on their project sites still bring (mto-procurement-stock-016).
 * The need is what the lines' own orders do not cover (`notOrdered`): an order line that names no requirement is netted once, as outstanding, never also as ordered.
 */
function planMaterials(rows: Rows, entries: Entry[]): PlannedMaterial[] {
  const sites = projectSites(rows), outstanding = openOrderOutstanding(rows);
  const groups = new Map<string, PlannedMaterial & { sites: Set<string> }>();
  for (const entry of entries) {
    const group = groups.get(entry.identity) || { identity: entry.identity, material: entry.material, requirementIds: [], isoIds: [], need: 0, outstanding: 0, quantity: 0, sites: new Set<string>() };
    group.need = round(group.need + entry.notOrdered);
    group.requirementIds.push(entry.requirement.id);
    if (!group.isoIds.includes(entry.iso.id)) group.isoIds.push(entry.iso.id);
    group.sites.add(sites.get(text(entry.iso.projectId)) || '');
    groups.set(entry.identity, group);
  }
  return [...groups.values()].map(({ sites: of, ...group }) => {
    const open = round([...of].reduce((sum, site) => sum + (outstanding.get(`${site}|${group.identity}`) || 0), 0));
    return { ...group, outstanding: open, quantity: round(Math.max(0, group.need - open)) };
  });
}
/** Order materials: one row per material over the requirement lines not (fully) ordered, its quantity netted by open orders, sorted by Material group. */
export function orderPlanning(rows: Rows, filter: ScopeFilter = {}): PlannedMaterial[] {
  const entries = requirementExecution(rows, { projectId: filter.projectId, isoId: filter.isoId })
    .filter(entry => entry.notOrdered > 0 && includes([entry.material.materialNo, entry.material.description, entry.material.materialGroup, entry.material.articleNo], filter.query));
  return planMaterials(rows, entries).filter(group => group.quantity > 0)
    .sort((a, b) => naturalCompare(text(a.material.materialGroup), text(b.material.materialGroup)) || naturalCompare(text(a.material.materialNo), text(b.material.materialNo)) || a.identity.localeCompare(b.identity));
}
/**
 * What "Order checked materials" orders for the checked requirement ids: one line per material with the planned quantity.
 * `error` names the first problem (an id that is unknown or already fully ordered, or a material open orders already cover).
 */
export function orderRequestLines(rows: Rows, requirementIds: string[]): { lines: PlannedMaterial[]; error?: { status: number; message: string } } {
  const execution = requirementExecution(rows); const entries: Entry[] = [];
  for (const id of requirementIds) {
    const entry = execution.find(item => item.requirement.id === id);
    if (!entry) return { lines: [], error: { status: 404, message: 'A selected material requirement is unavailable.' } };
    if (!(entry.notOrdered > 0)) return { lines: [], error: { status: 409, message: 'A selected requirement is already fully ordered.' } };
    entries.push(entry);
  }
  const lines = planMaterials(rows, entries);
  if (lines.some(line => line.quantity <= 0)) return { lines: [], error: { status: 409, message: 'Open orders already cover a selected material.' } };
  return { lines };
}

export interface PendingLine { line: Row; order: Row; material: Row | undefined; outstanding: number }
/** Pending order: every order line that has not been received in full, with ordered against received. */
export function pendingLines(rows: Rows, filter: ScopeFilter = {}): PendingLine[] {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  return active(rows, 'order_lines').flatMap(line => {
    const order = orders.get(text(line.orderId));
    const outstanding = round(Number(line.quantity) - Number(line.received));
    if (!order || outstanding <= 0 || !orderInScope(rows, order, filter) || (filter.isoId && !lineIsoIds(rows, line).includes(filter.isoId))) return [];
    const material = materialRecord(rows, line);
    if (!includes([order.number, line.materialNo, line.description, material?.materialNo, material?.materialGroup], filter.query)) return [];
    return [{ line, order, material, outstanding }];
  }).sort((a, b) => text(b.order.date).localeCompare(text(a.order.date)) || text(b.order.number).localeCompare(text(a.order.number)) || a.line.id.localeCompare(b.line.id));
}

export interface ReceiptEntry { receipt: Row; order: Row | undefined; material: Row | undefined; supplierId: string }
/** Material take in: the log of receipts, newest first. A take-in is always positive; older entries with a negative quantity are corrections. */
export function receiptLog(rows: Rows, filter: ScopeFilter = {}): ReceiptEntry[] {
  const orders = new Map(active(rows, 'orders').map(order => [order.id, order]));
  return active(rows, 'receipts').flatMap(receipt => {
    const order = orders.get(text(receipt.orderId));
    if (order && !orderInScope(rows, order, filter)) return [];
    if (!order && filter.projectId) return [];
    if (filter.from && text(receipt.date) < filter.from || filter.to && text(receipt.date) > filter.to) return [];
    const material = materialRecord(rows, receipt);
    if (!includes([order?.number, material?.materialNo, material?.description, material?.materialGroup, receipt.chargeNo], filter.query)) return [];
    return [{ receipt, order, material, supplierId: text(receipt.supplierId || order?.supplierId) }];
  }).sort((a, b) => text(b.receipt.date).localeCompare(text(a.receipt.date)) || text(b.receipt.takenAt || b.receipt._createdAt).localeCompare(text(a.receipt.takenAt || a.receipt._createdAt)) || b.receipt.id.localeCompare(a.receipt.id));
}

/** Quantity of a (positive) receipt that has not been corrected yet. */
export function receiptRemaining(rows: Rows, receipt: Row) {
  const corrected = (rows.receipts || []).filter(row => !row._archived && row.correctsId === receipt.id).reduce((sum, row) => sum + Number(row.quantity), 0);
  return round(Math.max(0, Number(receipt.quantity) + corrected));
}

/** Order archive: every order in the date and project range, by date ("Order by date desc." / "Order by date asc."). */
export function archivedOrders(rows: Rows, filter: ScopeFilter = {}, sort: 'desc' | 'asc' = 'desc') {
  const key = (order: Row) => { const moment = orderMoment(order); return `${moment.date} ${moment.time}`; };
  return active(rows, 'orders').filter(order => orderInScope(rows, order, filter) && (!filter.from || text(order.date) >= filter.from) && (!filter.to || text(order.date) <= filter.to) && includes([order.number, order.note], filter.query))
    .sort((a, b) => (sort === 'asc' ? -1 : 1) * (key(b).localeCompare(key(a)) || naturalCompare(text(b.number), text(a.number))));
}
/** Default range of Order archive, as the reference menu link sets it: From = today − 30 days, To = the last day of the current month. */
export function archiveDefaultRange(today: string): { from: string; to: string } {
  const [year, month, day] = today.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, day - 30)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/** Date and time of an order or a take-in: from its timestamp (local time), else the stored date alone (records made before the time was kept). */
export interface Moment { date: string; time: string }
const pad = (value: number) => String(value).padStart(2, '0');
export function momentOf(date: unknown, stamp: unknown): Moment {
  const at = text(stamp) ? new Date(text(stamp)) : null;
  if (at && !Number.isNaN(at.getTime())) return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
  return { date: text(date).slice(0, 10), time: '' };
}
export const orderMoment = (order: Row) => momentOf(order.date, order.orderedAt);
export const receiptMoment = (receipt: Row) => momentOf(receipt.date, receipt.takenAt);
/** "06.11.2025 07:43" (take-in log), or with `dot` "06.11.2025. 07:42" (Order archive, Order No. choice); the date alone when no time is known. */
export function printMoment(moment: Moment, dot = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moment.date)) return moment.date;
  const [year, month, day] = moment.date.split('-');
  const date = `${day}.${month}.${year}`;
  return moment.time ? `${date}${dot ? '.' : ''} ${moment.time}` : date;
}
/** One choice of the Order No. list of Receive materials: "00007 | 06.11.2025. 07:42". */
export const orderChoiceText = (order: Row) => `${text(order.number)} | ${printMoment(orderMoment(order), true)}`;
/** Receive materials, step 1: every order that is not cancelled (received ones too), newest first; the first is preselected. */
export function receivableOrders(rows: Rows) { return archivedOrders(rows).filter(order => order.status !== 'Cancelled'); }
/** "<name> <town>" of a supplier, as the Assign order to supplier list shows it. */
export const supplierChoiceText = (supplier: Row) => [text(supplier.name), text(supplier.residence)].filter(Boolean).join(' ');
/** The range is valid when both ends are empty or From is not after To. */
export const dateRangeError = (from?: string, to?: string) => from && to && from > to ? 'From date must not be after To date.' : '';

/** Order-detail lines of one order, with ordered, received and what is still open. */
export function orderDetail(rows: Rows, orderId: string) {
  return active(rows, 'order_lines').filter(line => line.orderId === orderId).map(line => ({ line, material: materialRecord(rows, line), outstanding: round(Number(line.quantity) - Number(line.received)) }));
}

/**
 * Client-side check of the "Today rec." quantities of Receive materials. The server repeats it. More than ordered is
 * accepted; a take-in is always a positive quantity (nothing is taken back here; Correct receipt does that).
 */
export function receiptQuantityErrors(lines: { lineId: string; received?: number; quantity: unknown }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const line of lines) {
    if (line.quantity === '' || line.quantity === undefined || line.quantity === null) continue;
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity)) errors[line.lineId] = 'Enter a number.';
    else if (quantity < 0) errors[line.lineId] = 'Enter a positive quantity.';
  }
  return errors;
}
/** The lines of a receipt that carry a quantity (empty and zero are left out; a negative value is never taken in). */
export const receiptItems = (quantities: Record<string, unknown>) => Object.entries(quantities).filter(([, value]) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && round(Number(value)) > 0).map(([lineId, value]) => ({ lineId, quantity: round(Number(value)) }));

/** One CSV cell. Text that a spreadsheet would read as a formula is prefixed so it stays text. */
export function csvCell(value: unknown) {
  let cell = text(value);
  if (/^[=+\-@\t\r]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
export const toCsv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');

export interface OrderedMaterial {
  identity: string; material: Row; ordered: number; received: number; outstanding: number;
  /** The orders the material is on (an additional order is marked) and the suppliers assigned to them. */
  orderNumbers: string[]; supplierIds: string[]; additional: boolean;
}
/**
 * Order materials, "Ordered" view: the materials already on an order (not cancelled) for the same project / isometric filter, one row per
 * material with ordered, received and what is still outstanding. Kept apart from `orderPlanning`, which lists what is still to be ordered.
 */
export function orderedMaterials(rows: Rows, filter: ScopeFilter = {}): OrderedMaterial[] {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const groups = new Map<string, OrderedMaterial>();
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId));
    if (!order || !orderInScope(rows, order, filter) || (filter.isoId && !lineIsoIds(rows, line).includes(filter.isoId))) continue;
    const material = materialRecord(rows, line);
    if (!includes([line.materialNo, line.description, material?.materialNo, material?.description, material?.materialGroup, material?.articleNo], filter.query)) continue;
    const identity = materialIdentity(line);
    const group = groups.get(identity) || { identity, material: (material || line) as Row, ordered: 0, received: 0, outstanding: 0, orderNumbers: [], supplierIds: [], additional: false };
    group.ordered = round(group.ordered + Number(line.quantity || 0)); group.received = round(group.received + Number(line.received || 0));
    group.outstanding = round(group.outstanding + Math.max(0, Number(line.quantity || 0) - Number(line.received || 0)));
    const number = text(order.number) + (line.additional ? ' (additional)' : '');
    if (!group.orderNumbers.includes(number)) group.orderNumbers.push(number);
    if (order.supplierId && !group.supplierIds.includes(text(order.supplierId))) group.supplierIds.push(text(order.supplierId));
    if (line.additional) group.additional = true;
    groups.set(identity, group);
  }
  return [...groups.values()].map(group => ({ ...group, orderNumbers: group.orderNumbers.sort(naturalCompare) }))
    .sort((a, b) => naturalCompare(text(a.material.materialGroup), text(b.material.materialGroup)) || naturalCompare(text(a.material.materialNo), text(b.material.materialNo)) || a.identity.localeCompare(b.identity));
}

export interface AdditionalRow { projectId: string; identity: string; material: Row; required: number; ordered: number; additional: number; percent: number | null }
export interface AdditionalOverview { rows: AdditionalRow[]; totals: { required: number; ordered: number; additional: number; percent: number | null } }
const percentOf = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null;
/**
 * "Additional vs required": per project and material, the quantity the isometric requirements ask for, what the regular orders cover, what was
 * ordered additionally, and the additional as a share of the required quantity (null when nothing is required). Rows are limited to the project
 * filter; an additional line belongs to the project of its order.
 */
export function additionalOverview(rows: Rows, filter: { projectId?: string; query?: string } = {}): AdditionalOverview {
  const map = new Map<string, AdditionalRow>();
  const entryOf = (projectId: string, identity: string, material: Row) => { const key = `${projectId}|${identity}`; const row = map.get(key) || { projectId, identity, material, required: 0, ordered: 0, additional: 0, percent: null }; map.set(key, row); return row; };
  for (const entry of requirementExecution(rows, { projectId: filter.projectId })) {
    const row = entryOf(text(entry.iso.projectId), entry.identity, entry.material);
    row.required = round(row.required + entry.required); row.ordered = round(row.ordered + Math.min(entry.ordered, entry.required));
  }
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  for (const line of active(rows, 'order_lines')) {
    const order = orders.get(text(line.orderId));
    if (!line.additional || !order || (filter.projectId && text(order.projectId) !== filter.projectId)) continue;
    const row = entryOf(text(order.projectId), materialIdentity(line), (materialRecord(rows, line) || line) as Row);
    row.additional = round(row.additional + Number(line.quantity || 0));
  }
  const list = [...map.values()].filter(row => includes([row.material.materialNo, row.material.description, row.material.materialGroup], filter.query))
    .map(row => ({ ...row, percent: percentOf(row.additional, row.required) }))
    .sort((a, b) => naturalCompare(a.projectId, b.projectId) || naturalCompare(text(a.material.materialNo), text(b.material.materialNo)) || a.identity.localeCompare(b.identity));
  const sum = (pick: (row: AdditionalRow) => number) => round(list.reduce((total, row) => total + pick(row), 0));
  const totals = { required: sum(row => row.required), ordered: sum(row => row.ordered), additional: sum(row => row.additional), percent: null as number | null };
  totals.percent = percentOf(totals.additional, totals.required);
  return { rows: list, totals };
}
