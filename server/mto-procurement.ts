import { orderRequestLines, orderStatus, receiptRemaining } from '../shared/mto-procurement.ts';
import { lineIsoIds } from '../shared/materials.ts';
import type { Row } from '../shared/types.ts';
import { AppError, positive, qty, type Actor, type Store } from './store.ts';
import { changeSiteStock, receivingSiteId } from './mto-stock.ts';

type Input = Record<string, unknown>;
/** What `runAction` hands to the procurement rules: its own transaction helpers, so a failure rolls everything back. */
export interface ProcurementContext {
  store: Store;
  actor: Actor;
  date: string;
  note: string;
  ensure: (resource: string, id: unknown) => Row;
  add: (resource: string, input: Input) => Row;
  patch: (resource: string, row: Row, input: Input) => Row;
  balance: (tool: boolean, itemId: string, warehouseId: string, chargeNo: string, delta: number, custom?: boolean) => Row;
  movement: (tool: boolean, type: string, itemId: string, warehouseId: string, amount: number, extra?: Input, custom?: boolean) => Row;
}

/** The storehouse of a take-in. When none is named it is the only storehouse that holds materials; otherwise it must be chosen. */
export function receivingWarehouseId(store: Store, value: unknown): string {
  if (typeof value === 'string' && value) return value;
  const candidates = store.list('warehouses').filter(row => row.use !== 'Tools');
  if (candidates.length === 1) return candidates[0].id;
  throw new AppError(422, 'Choose the receiving storehouse.', { warehouseId: 'Select a storehouse.' });
}

/** The log entry of one delivery line (or of one correction, with a negative quantity). `takenAt`: the moment of a take-in made now. */
export function recordReceipt(ctx: ProcurementContext, entry: { order: Row; line: Row; warehouseId: string; supplierId: string; chargeNo: string; quantity: number; correctsId?: string; note?: string; takenAt?: string }) {
  const { order, line } = entry;
  return ctx.add('receipts', {
    orderId: order.id, lineId: line.id, materialId: line.materialId || '', customMaterialId: line.customMaterialId || '', warehouseId: entry.warehouseId, supplierId: entry.supplierId,
    chargeNo: entry.chargeNo, quantity: entry.quantity, date: ctx.date, ...(entry.takenAt ? { takenAt: entry.takenAt } : {}), correction: entry.quantity < 0, correctsId: entry.correctsId || '', note: entry.note ?? ctx.note,
  });
}

const PLANNING_RESOURCES = ['isometrics', 'iso_materials', 'orders', 'order_lines', 'picklists', 'stock', 'warehouses', 'materials', 'custom_materials', 'projects'];
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/**
 * Order checked materials (pilots): one order for the checked requirement lines, one line per material with the quantity
 * Order materials shows (need − what open orders of that material still bring), the requirement ids kept on the line.
 * The number continues the order counter as five digits (00001, 00002, …); no supplier (it is assigned in Order archive).
 * `stamped`: the order is made now, so its time is kept for the archive ("06.11.2025. 07:42").
 */
export function orderCheckedMaterials(ctx: ProcurementContext, requirementIds: string[], stamped: boolean) {
  // Each requirement line is read through the record guard first (sec2-003): one of a main project outside the request's reach is refused before anything is written.
  for (const id of requirementIds) ctx.ensure('iso_materials', id);
  const rows = Object.fromEntries(PLANNING_RESOURCES.map(key => [key, ctx.store.list(key)]));
  const { lines, error } = orderRequestLines(rows, requirementIds);
  if (error) throw new AppError(error.status, error.message);
  const isos = new Map(rows.isometrics.map(iso => [iso.id, iso]));
  const projects = [...new Set(lines.flatMap(line => line.isoIds.map(id => String(isos.get(id)?.projectId || ''))).filter(Boolean))];
  const order = ctx.add('orders', { number: ctx.store.nextDigits('PO'), supplierId: '', projectId: projects.length === 1 ? projects[0] : '', date: ctx.date, status: 'Pending', note: ctx.note, ...(stamped ? { orderedAt: new Date().toISOString() } : {}) });
  for (const line of lines) {
    const first = rows.iso_materials.find(row => row.id === line.requirementIds[0])!;
    const custom = Boolean(first.customMaterialId) && !first.materialId;
    const record = ctx.ensure(custom ? 'custom_materials' : 'materials', custom ? first.customMaterialId : first.materialId);
    const snapshot = Object.fromEntries(['materialNo', 'description', 'uom', 'dia', 'lbs'].map(name => [name, record[name] || '']));
    ctx.add('order_lines', {
      ...snapshot, orderId: order.id, materialId: custom ? '' : record.id, customMaterialId: custom ? record.id : '',
      requirementId: line.requirementIds.length === 1 ? line.requirementIds[0] : '', requirementIds: line.requirementIds.join(','),
      isoId: line.isoIds.length === 1 ? line.isoIds[0] : '', quantity: positive(line.quantity), received: 0,
    });
  }
  return { resource: 'orders', record: ctx.store.get('orders', order.id) };
}

/**
 * Receive materials, step 2 (pilots): the "Today rec." quantity of each line of one order. More than ordered is accepted
 * (the line then reads received > ordered and leaves Pending order); a take-in is always a positive quantity (the client has no
 * need for a negative take-in; an entry taken in by mistake is taken back with Correct receipt). A delivery goes into the Material
 * inventory of the line's project site (shared/mto-stock.ts). Received orders can still be taken in; a cancelled one cannot. The supplier is stored on the receipt only. All lines are saved together or not at all.
 * `stamped`: the take-in is made now, so its time is kept for the log ("06.11.2025 07:43").
 */
export function receiveMaterials(ctx: ProcurementContext, data: Input, stamped: boolean) {
  const { store, actor } = ctx;
  const order = ctx.ensure('orders', data.orderId);
  if (order.status === 'Cancelled') throw new AppError(409, 'This order is cancelled.');
  const supplierId = str(data.supplierId) || String(order.supplierId || '');
  if (!supplierId) throw new AppError(422, 'Choose the delivery supplier.', { supplierId: 'Choose the delivery supplier.' });
  ctx.ensure('suppliers', supplierId);
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 500) throw new AppError(422, 'Enter at least one received quantity.');
  const rows = Object.fromEntries(['isometrics', 'iso_materials', 'projects'].map(key => [key, store.list(key)]));
  const takenAt = stamped ? new Date().toISOString() : '';
  const seen = new Set<string>();
  for (const raw of data.items) {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Input;
    const line = ctx.ensure('order_lines', item.lineId);
    if (line.orderId !== order.id || seen.has(line.id)) throw new AppError(422, 'Each delivery line must belong to this order and appear once.');
    seen.add(line.id);
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || qty(item.quantity) <= 0) throw new AppError(422, 'Enter a received quantity greater than zero.');
    const amount = qty(item.quantity), received = qty(Number(line.received) + amount);
    const refs = { materialId: String(line.materialId || ''), customMaterialId: String(line.customMaterialId || '') };
    if (Boolean(refs.materialId) === Boolean(refs.customMaterialId)) throw new AppError(422, 'This order line has no material.');
    const custom = Boolean(refs.customMaterialId), itemId = custom ? refs.customMaterialId : refs.materialId;
    const siteId = receivingSiteId(store, order, { ...line, isoId: lineIsoIds(rows, line)[0] || '' });
    let warehouseId = '';
    if (!siteId) { const wh = ctx.ensure('warehouses', receivingWarehouseId(store, data.warehouseId)); if (wh.use === 'Tools') throw new AppError(422, 'Choose a warehouse that holds materials.'); warehouseId = wh.id; }
    const chargeNo = str(item.chargeNo);
    const extra = { requirementId: String(line.requirementId || ''), isoId: String(line.isoId || '') };
    ctx.patch('order_lines', line, { received });
    const note = `${order.number}${ctx.note ? ' · ' + ctx.note : ''}`;
    if (siteId) {
      changeSiteStock(store, actor, siteId, refs, chargeNo, amount);
      ctx.add('movements', { number: store.next('MM'), ...refs, warehouseId: '', siteId, quantity: amount, type: 'Receipt', date: ctx.date, chargeNo, ...extra, note });
    } else {
      ctx.balance(false, itemId, warehouseId, chargeNo, amount, custom);
      ctx.movement(false, 'Receipt', itemId, warehouseId, amount, { chargeNo, ...extra, note }, custom);
    }
    recordReceipt(ctx, { order, line, warehouseId, supplierId, chargeNo, quantity: amount, takenAt });
  }
  return { resource: 'orders', record: refreshOrderStatus(ctx, order) };
}

/**
 * Additional order (client request 17.11.2026): one material ordered on top of the project need, e.g. a pipe cut wrongly. It uses the normal
 * order and order line records (five-digit number, taken in like any order); its line carries `additional` and the required reason, so it never
 * covers the regular need of Order materials and is shown apart in "Additional vs required". The project is required: the figures are per project.
 */
export function orderAdditionalMaterial(ctx: ProcurementContext, data: Input, stamped: boolean) {
  const projectId = str(data.projectId);
  if (!projectId) throw new AppError(422, 'Choose the project.', { projectId: 'Choose the project.' });
  ctx.ensure('projects', projectId);
  const reason = str(data.reason);
  if (!reason) throw new AppError(422, 'Enter the reason for this additional order.', { reason: 'A reason is required.' });
  if (Boolean(data.materialId) === Boolean(data.customMaterialId)) throw new AppError(422, 'Choose one material.', { materialId: 'Choose a material.' });
  const custom = Boolean(data.customMaterialId);
  const record = ctx.ensure(custom ? 'custom_materials' : 'materials', custom ? data.customMaterialId : data.materialId);
  const quantity = positive(data.quantity);
  const supplierId = str(data.supplierId); if (supplierId) ctx.ensure('suppliers', supplierId);
  const order = ctx.add('orders', { number: ctx.store.nextDigits('PO'), supplierId, projectId, date: ctx.date, status: 'Pending', note: `Additional order: ${reason}`, ...(stamped ? { orderedAt: new Date().toISOString() } : {}) });
  const snapshot = Object.fromEntries(['materialNo', 'description', 'uom', 'dia', 'lbs'].map(name => [name, record[name] || '']));
  ctx.add('order_lines', { ...snapshot, orderId: order.id, materialId: custom ? '' : record.id, customMaterialId: custom ? record.id : '', requirementId: '', requirementIds: '', isoId: '', quantity, received: 0, additional: true, additionalReason: reason });
  return { resource: 'orders', record: ctx.store.get('orders', order.id) };
}

/** Recompute the order status from its lines after a receipt or a correction. */
export function refreshOrderStatus(ctx: ProcurementContext, order: Row, extra: Input = {}) {
  const current = ctx.store.get('orders', order.id);
  return ctx.patch('orders', current, { status: orderStatus(ctx.store.list('order_lines').filter(line => line.orderId === order.id)), ...extra });
}

/**
 * Correction of a receipt: a negative entry for part or all of one delivery line.
 * Rules (the reference's own rule is not known, see PARITY.md): the account needs the receipt right and the add
 * right on material inventory (enforced where the action is authorised), a reason is required, only a delivery can be corrected, never more
 * than what is left of it, and stock of that storehouse and charge can never go below zero.
 */
export function correctReceipt(ctx: ProcurementContext, data: Input) {
  const original = ctx.ensure('receipts', data.receiptId);
  if (Number(original.quantity) <= 0 || original.correction) throw new AppError(422, 'Only a delivery can be corrected, not another correction.', { receiptId: 'Choose a delivery entry.' });
  if (!ctx.note) throw new AppError(422, 'Enter the reason for this correction.', { note: 'A reason is required.' });
  const amount = positive(data.quantity, 'Correction quantity');
  const remaining = receiptRemaining({ receipts: ctx.store.list('receipts') }, original);
  if (amount > remaining) throw new AppError(409, `Only ${remaining} of this delivery can still be corrected.`, { quantity: `At most ${remaining}.` });
  const order = ctx.ensure('orders', original.orderId);
  const line = ctx.ensure('order_lines', original.lineId);
  const custom = Boolean(line.customMaterialId);
  const itemId = String(custom ? line.customMaterialId : line.materialId);
  const chargeNo = String(original.chargeNo || '');
  // Fails with "Insufficient stock" (409) and rolls the whole correction back when the stock was already used.
  // A delivery into a project site's inventory (no storehouse on the receipt) is taken back from that inventory.
  const siteId = original.warehouseId ? '' : receivingSiteId(ctx.store, order, line);
  if (!original.warehouseId && !siteId) throw new AppError(409, 'The project site that received this delivery can no longer be found.');
  const extra = { chargeNo, isoId: line.isoId || '', requirementId: line.requirementId || '', note: `Correction of ${order.number} · ${ctx.note}` };
  if (siteId) {
    changeSiteStock(ctx.store, ctx.actor, siteId, { materialId: String(line.materialId || ''), customMaterialId: String(line.customMaterialId || '') }, chargeNo, -amount);
    ctx.add('movements', { number: ctx.store.next('MM'), materialId: String(line.materialId || ''), customMaterialId: String(line.customMaterialId || ''), warehouseId: '', siteId, quantity: -amount, type: 'Adjustment', date: ctx.date, ...extra });
  } else {
    ctx.balance(false, itemId, String(original.warehouseId), chargeNo, -amount, custom);
    ctx.movement(false, 'Adjustment', itemId, String(original.warehouseId), -amount, extra, custom);
  }
  ctx.patch('order_lines', line, { received: qty(Number(line.received) - amount) });
  const receipt = recordReceipt(ctx, { order, line, warehouseId: String(original.warehouseId), supplierId: String(original.supplierId || order.supplierId || ''), chargeNo, quantity: -amount, correctsId: original.id, note: ctx.note });
  refreshOrderStatus(ctx, order);
  return { resource: 'receipts', record: receipt };
}
