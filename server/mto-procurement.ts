import { orderStatus, receiptRemaining } from '../shared/mto-procurement.ts';
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

/** The log entry of one delivery line (or of one correction, with a negative quantity). */
export function recordReceipt(ctx: ProcurementContext, entry: { order: Row; line: Row; warehouseId: string; supplierId: string; chargeNo: string; quantity: number; correctsId?: string; note?: string }) {
  const { order, line } = entry;
  return ctx.add('receipts', {
    orderId: order.id, lineId: line.id, materialId: line.materialId || '', customMaterialId: line.customMaterialId || '', warehouseId: entry.warehouseId, supplierId: entry.supplierId,
    chargeNo: entry.chargeNo, quantity: entry.quantity, date: ctx.date, correction: entry.quantity < 0, correctsId: entry.correctsId || '', note: entry.note ?? ctx.note,
  });
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
