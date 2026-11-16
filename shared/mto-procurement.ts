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
    if (!order || open <= 0) continue;
    const key = `${orderLineSiteId(rows, line, order)}|${materialIdentity(line)}`;
    result.set(key, round((result.get(key) || 0) + open));
  }
  return result;
}
type Entry = ReturnType<typeof requirementExecution>[number];
/** One row per material: the need of the given requirement lines, less what open orders of that material on their project sites still bring (mto-procurement-stock-016). */
function planMaterials(rows: Rows, entries: Entry[]): PlannedMaterial[] {
  const sites = projectSites(rows), outstanding = openOrderOutstanding(rows);
  const groups = new Map<string, PlannedMaterial & { sites: Set<string> }>();
  for (const entry of entries) {
    const group = groups.get(entry.identity) || { identity: entry.identity, material: entry.material, requirementIds: [], isoIds: [], need: 0, outstanding: 0, quantity: 0, sites: new Set<string>() };
    group.need = round(group.need + entry.toOrder);
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
    .filter(entry => entry.toOrder > 0 && includes([entry.material.materialNo, entry.material.description, entry.material.materialGroup, entry.material.articleNo], filter.query));
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
    if (!(entry.toOrder > 0)) return { lines: [], error: { status: 409, message: 'A selected requirement is already fully ordered.' } };
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
/** Material take in: the log of receipts, newest first. Negative quantities are corrections. */
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
 * accepted; a negative value corrects an earlier receipt and can take back at most what the line has received.
 */
export function receiptQuantityErrors(lines: { lineId: string; received: number; quantity: unknown }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const line of lines) {
    if (line.quantity === '' || line.quantity === undefined || line.quantity === null) continue;
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity)) errors[line.lineId] = 'Enter a number.';
    else if (round(line.received + quantity) < 0) errors[line.lineId] = `At most ${round(line.received)} can be taken back.`;
  }
  return errors;
}
/** The lines of a receipt that carry a quantity (empty and zero are left out). */
export const receiptItems = (quantities: Record<string, unknown>) => Object.entries(quantities).filter(([, value]) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && round(Number(value)) !== 0).map(([lineId, value]) => ({ lineId, quantity: round(Number(value)) }));

/** One CSV cell. Text that a spreadsheet would read as a formula is prefixed so it stays text. */
export function csvCell(value: unknown) {
  let cell = text(value);
  if (/^[=+\-@\t\r]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
export const toCsv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
