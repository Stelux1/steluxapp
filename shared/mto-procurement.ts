import type { Row } from './types.ts';
import { materialRecord, orderProjectIds, requirementExecution } from './materials.ts';

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

/** Resources and actions the hosted profile delivers for these pages. Records only: no menu page of their own. */
export const PROCUREMENT_RESOURCE_FIELDS: Record<string, string[]> = {
  orders: ['number', 'projectId', 'supplierId', 'date', 'status', 'note'],
  order_lines: ['orderId', 'materialId', 'customMaterialId', 'requirementId', 'isoId', 'materialNo', 'description', 'uom', 'dia', 'lbs', 'quantity', 'received'],
  receipts: ['orderId', 'lineId', 'materialId', 'customMaterialId', 'warehouseId', 'supplierId', 'chargeNo', 'quantity', 'date', 'correction', 'correctsId', 'note'],
  stock: ['materialId', 'customMaterialId', 'warehouseId', 'chargeNo', 'quantity'],
  suppliers: ['name', 'address', 'zip', 'residence', 'phone', 'email', 'description'],
  warehouses: ['name', 'siteId', 'use'],
};
export const PROCUREMENT_ACTION_FIELDS: Record<string, string[]> = {
  'order-requirements': ['requirementIds', 'supplierId', 'date', 'note'],
  receive: ['orderId', 'supplierId', 'warehouseId', 'date', 'note', 'items'],
  'correct-receipt': ['receiptId', 'quantity', 'date', 'note'],
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
  if (filter.isoId && !(rows.order_lines || []).some(line => line.orderId === order.id && line.isoId === filter.isoId)) return false;
  return true;
}

export interface PlannedMaterial { identity: string; material: Row; quantity: number; requirementIds: string[]; isoIds: string[] }
/** Order materials: one row per material, summed over the isometric requirements that are not fully ordered. */
export function orderPlanning(rows: Rows, filter: ScopeFilter = {}): PlannedMaterial[] {
  const groups = new Map<string, PlannedMaterial>();
  for (const entry of requirementExecution(rows, { projectId: filter.projectId, isoId: filter.isoId })) {
    if (entry.toOrder <= 0) continue;
    if (!includes([entry.material.materialNo, entry.material.description, entry.material.materialGroup, entry.material.articleNo], filter.query)) continue;
    const group = groups.get(entry.identity) || { identity: entry.identity, material: entry.material, quantity: 0, requirementIds: [], isoIds: [] };
    group.quantity = round(group.quantity + entry.toOrder);
    group.requirementIds.push(entry.requirement.id);
    if (!group.isoIds.includes(entry.iso.id)) group.isoIds.push(entry.iso.id);
    groups.set(entry.identity, group);
  }
  return [...groups.values()];
}

export interface PendingLine { line: Row; order: Row; material: Row | undefined; outstanding: number }
/** Pending order: every order line that has not been received in full, with ordered against received. */
export function pendingLines(rows: Rows, filter: ScopeFilter = {}): PendingLine[] {
  const orders = new Map(active(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  return active(rows, 'order_lines').flatMap(line => {
    const order = orders.get(text(line.orderId));
    const outstanding = round(Number(line.quantity) - Number(line.received));
    if (!order || outstanding <= 0 || !orderInScope(rows, order, filter) || (filter.isoId && line.isoId !== filter.isoId)) return [];
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
  }).sort((a, b) => text(b.receipt.date).localeCompare(text(a.receipt.date)) || text(b.receipt._createdAt).localeCompare(text(a.receipt._createdAt)) || b.receipt.id.localeCompare(a.receipt.id));
}

/** Quantity of a (positive) receipt that has not been corrected yet. */
export function receiptRemaining(rows: Rows, receipt: Row) {
  const corrected = (rows.receipts || []).filter(row => !row._archived && row.correctsId === receipt.id).reduce((sum, row) => sum + Number(row.quantity), 0);
  return round(Math.max(0, Number(receipt.quantity) + corrected));
}

/** Order archive: every order in the date and project range, newest first. */
export function archivedOrders(rows: Rows, filter: ScopeFilter = {}) {
  return active(rows, 'orders').filter(order => orderInScope(rows, order, filter) && (!filter.from || text(order.date) >= filter.from) && (!filter.to || text(order.date) <= filter.to) && includes([order.number, order.note], filter.query))
    .sort((a, b) => text(b.date).localeCompare(text(a.date)) || text(b.number).localeCompare(text(a.number)));
}
/** The range is valid when both ends are empty or From is not after To. */
export const dateRangeError = (from?: string, to?: string) => from && to && from > to ? 'From date must not be after To date.' : '';

/** Order-detail lines of one order, with ordered, received and what is still open. */
export function orderDetail(rows: Rows, orderId: string) {
  return active(rows, 'order_lines').filter(line => line.orderId === orderId).map(line => ({ line, material: materialRecord(rows, line), outstanding: round(Number(line.quantity) - Number(line.received)) }));
}

/** Client-side check of the quantities typed into "Receive materials". The server repeats it. */
export function receiptQuantityErrors(lines: { lineId: string; outstanding: number; quantity: unknown }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const line of lines) {
    if (line.quantity === '' || line.quantity === undefined || line.quantity === null) continue;
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) errors[line.lineId] = 'Enter a quantity of zero or more.';
    else if (round(quantity) > line.outstanding) errors[line.lineId] = `At most ${line.outstanding} can be received.`;
  }
  return errors;
}

/** One CSV cell. Text that a spreadsheet would read as a formula is prefixed so it stays text. */
export function csvCell(value: unknown) {
  let cell = text(value);
  if (/^[=+\-@\t\r]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
export const toCsv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
