import type { ActionDefinition, ActionField, Availability, Field, Resource, Row } from './types.ts';
import { materialIdentity, materialRecord, requirementExecution } from './materials.ts';

/**
 * Material inventory, storehouses and transfer orders (MTO Pilot).
 *
 * Two kinds of stock location (reference: mto__order__material-inventory, the storehouse dialogs of
 * weld__start__dashboard, permissions-observed.json areas 16 and 75):
 * - the Material inventory of a project site: filled by Material take in and Add material from DB, shown on the
 *   Material inventory page once per Material No, counted by the isometric's Inv. and the source of every pick;
 * - storehouses: company records shared by every project site, whose lines only the storehouse dialogs (transfer to
 *   project, move, return to inventory, correction, adjust, remove) and transfer orders change.
 * Both live in the one `stock` table: a row with `locationKind: 'site'` belongs to the inventory of `siteId`; every
 * other row (all rows written before this distinction existed) is a line of storehouse `warehouseId`.
 *
 * Everything here is pure: the server (server/mto-stock.ts) applies the rules inside one transaction and the
 * client (client/mto-stock.tsx) uses the same functions to show what an action will do.
 */

export const MIN_QUANTITY = 0.01;
export const TRANSFER_TYPES = ['Inventory - Project', 'Inventory - Storehouse', 'Storehouse → Project', 'Storehouse → Storehouse', 'Return → Inventory'] as const;
export type TransferType = typeof TRANSFER_TYPES[number];
export const TRANSFER_PRIORITIES = ['Normal', 'Urgent'] as const;
/**
 * The statuses of a transfer order (MTO manual, Transfer Orders list): Requested when created, Assigned once a handler
 * takes it, In progress once pick results are saved, then Completed (every line picked in full), Partial (some lines
 * short or not found) or Cancelled. Orders written before these statuses existed store 'Open', which reads as Requested.
 */
export const TRANSFER_STATUSES = ['Requested', 'Assigned', 'In progress', 'Completed', 'Partial', 'Cancelled'] as const;
export type TransferStatus = typeof TRANSFER_STATUSES[number];
export const LEGACY_TRANSFER_STATUSES: Record<string, TransferStatus> = { Open: 'Requested' };
/** The statuses in which an order still waits for its material (it reserves its lines, it may be cancelled). */
export const OPEN_TRANSFER_STATUSES: readonly TransferStatus[] = ['Requested', 'Assigned', 'In progress'];
/** The status of an order as every reader shows it (a stored 'Open', or none, reads as Requested). */
export function orderStatus(order: Row): TransferStatus {
  const stored = String(order.status ?? '');
  if ((TRANSFER_STATUSES as readonly string[]).includes(stored)) return stored as TransferStatus;
  return LEGACY_TRANSFER_STATUSES[stored] ?? 'Requested';
}
export const isOpenOrder = (order: Row) => OPEN_TRANSFER_STATUSES.includes(orderStatus(order));
/** The line status of an order item (MTO manual, Transfer Order detail); an item without one is Pending. */
export const LINE_STATUSES = ['Pending', 'Picked', 'Not found', 'Partial'] as const;
export type LineStatus = typeof LINE_STATUSES[number];
export const lineStatus = (item: Row): LineStatus => (LINE_STATUSES as readonly string[]).includes(String(item.lineStatus)) ? item.lineStatus as LineStatus : 'Pending';
/** The picked quantity of an order item (0 until pick results are saved). */
export const qtyPicked = (item: Row) => { const value = Number(item.qtyPicked); return Number.isFinite(value) && value > 0 ? value : 0; };
/** How the list and the detail name a type: the manual writes all five with a dash (the New Transfer Order select keeps the captured labels). */
export const transferTypeLabel = (type: unknown) => String(type ?? '').replace(' → ', ' - ');

/** A refusal of a transfer-order step: the HTTP status and the message the user reads. */
export interface Refusal { status: 409 | 422; message: string }
export type Step<T> = { ok: true; value: T } | ({ ok: false } & Refusal);
const ok = <T>(value: T): Step<T> => ({ ok: true, value });
const no = (status: 409 | 422, message: string): Step<never> => ({ ok: false, status, message });
const closedText = (order: Row) => `This transfer order is already ${orderStatus(order).toLowerCase()}.`;

/** The steps of the lifecycle (Transfer Order detail): Assign to me, Save pick results, Complete transfer, Cancel, Reverse order. */
export type TransferEvent = 'assign' | 'pick' | 'complete' | 'cancel' | 'reverse';
/**
 * The status an order moves to on a step, or why the step is refused:
 * - assign: an open order; Requested becomes Assigned, an order already Assigned / In progress keeps its status (the new handler takes it over);
 * - pick: an order that a handler took (Assigned or In progress) becomes In progress;
 * - complete: an Assigned or In progress order becomes Completed or Partial (see completePlan);
 * - cancel: an open order becomes Cancelled;
 * - reverse: a Completed or Partial order that was not reversed yet keeps its status (reversedAt marks it).
 */
export function nextStatus(order: Row, event: TransferEvent, outcome?: 'Completed' | 'Partial'): Step<TransferStatus> {
  const status = orderStatus(order);
  if (event === 'reverse') {
    if (status !== 'Completed' && status !== 'Partial') return no(409, 'Only a completed transfer order can be reversed.');
    if (order.reversedAt) return no(409, 'This transfer order is already reversed.');
    return ok(status);
  }
  if (!isOpenOrder(order)) return no(409, closedText(order));
  if (event === 'assign') return ok(status === 'Requested' ? 'Assigned' : status);
  if (event === 'cancel') return ok('Cancelled');
  if (status === 'Requested') return no(409, 'Assign the transfer order to yourself first (Assign to me).');
  if (event === 'pick') return ok('In progress');
  return ok(outcome ?? 'Completed');
}
/** Assign to me: offered on an open order that is not already the account's own. */
export function canAssign(order: Row, userId: string): Step<TransferStatus> {
  if (isOpenOrder(order) && order.assignedTo === userId) return no(409, 'This transfer order is already assigned to you.');
  return nextStatus(order, 'assign');
}

const stepOf = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
/**
 * The pick result of one line (Qty picked and Line status), checked against the ordered quantity:
 * - Pending: nothing picked (an empty or zero quantity);
 * - Picked: the full ordered quantity (an empty quantity means the full one);
 * - Partial: more than 0 and less than the ordered quantity;
 * - Not found: nothing picked.
 * A quantity is at least 0 in steps of 0.01 and never above the ordered quantity.
 */
export function pickLine(item: Row, input: { qtyPicked?: unknown; lineStatus?: unknown }): Step<{ qtyPicked: number; lineStatus: LineStatus }> {
  const status = String(input.lineStatus ?? '');
  const label = String(item.materialNo || 'this line');
  if (!(LINE_STATUSES as readonly string[]).includes(status)) return no(422, `${label}: choose the line status.`);
  const ordered = Number(item.quantity);
  const empty = input.qtyPicked === undefined || input.qtyPicked === null || input.qtyPicked === '';
  if (!empty && (typeof input.qtyPicked !== 'number' || !Number.isFinite(input.qtyPicked) || input.qtyPicked < 0 || !stepOf(input.qtyPicked))) return no(422, `${label}: Qty picked must be zero or more, in steps of 0.01.`);
  const picked = empty ? (status === 'Picked' ? ordered : 0) : round6(input.qtyPicked as number);
  if (picked > ordered + 1e-9) return no(422, `${label}: Qty picked cannot exceed the ordered quantity (${ordered}).`);
  if (status === 'Picked' && Math.abs(picked - ordered) > 1e-9) return no(422, `${label}: Picked means the full quantity (${ordered}). Choose Partial for less.`);
  if (status === 'Partial' && !(picked > 0 && picked < ordered)) return no(422, `${label}: a partial line needs a quantity above 0 and below ${ordered}.`);
  if ((status === 'Pending' || status === 'Not found') && picked > 0) return no(422, `${label}: a ${status === 'Pending' ? 'pending' : 'not found'} line has no picked quantity. Choose Picked or Partial.`);
  return ok({ qtyPicked: picked, lineStatus: status as LineStatus });
}
/** Picked all: every line picked in full. */
export const pickedAll = (items: Row[]) => items.map(item => ({ itemId: item.id, qtyPicked: Number(item.quantity), lineStatus: 'Picked' as LineStatus }));
/**
 * What Complete transfer moves: the picked quantity of every line that has one, nothing else. Refused while a line is
 * still Pending or when nothing was picked at all. The order ends Completed when every line was picked in full, else Partial.
 */
export function completePlan(items: Row[]): Step<{ moves: { item: Row; quantity: number }[]; outcome: 'Completed' | 'Partial' }> {
  if (!items.length) return no(409, 'This transfer order has no items.');
  const pending = items.filter(item => lineStatus(item) === 'Pending');
  if (pending.length) return no(409, `Set the line status of every line first (${pending.map(item => item.materialNo).join(', ')} still pending), then save the pick results.`);
  const moves = items.filter(item => qtyPicked(item) > 0).map(item => ({ item, quantity: round6(Math.min(qtyPicked(item), Number(item.quantity))) }));
  if (!moves.length) return no(409, 'Nothing was picked. Cancel the transfer order instead.');
  const full = items.every(item => lineStatus(item) === 'Picked' && Math.abs(qtyPicked(item) - Number(item.quantity)) < 1e-9);
  return ok({ moves, outcome: full ? 'Completed' : 'Partial' });
}
/** One compensating booking of Reverse order: the place a movement of the order changed and the opposite quantity. */
export interface ReverseEntry { move: Row; place: { warehouseId: string } | { siteId: string }; quantity: number }
/**
 * Reverse order: one compensating booking per movement the completion wrote (the originals stay), the opposite quantity on
 * the same place. What arrived is taken back first, then what left is given back, so a destination that no longer holds the
 * material refuses the reversal before anything is returned. Per material and charge the entries sum to zero.
 */
export function reversePlan(order: Row, movements: Row[]): Step<ReverseEntry[]> {
  const own = movements.filter(move => !move._archived && move.transferOrder === order.number && move.type !== 'Reversal');
  if (!own.length) return no(409, 'This transfer order moved no stock, so there is nothing to reverse.');
  const entries = own.map(move => ({ move, place: move.warehouseId ? { warehouseId: String(move.warehouseId) } : { siteId: String(move.siteId) }, quantity: round6(-Number(move.quantity)) }));
  return ok([...entries.filter(entry => entry.quantity < 0), ...entries.filter(entry => entry.quantity > 0)]);
}
/** Return to inventory on a storehouse line: the quantity to return (more than 0, at most the line's balance; Return all = the balance). */
export function returnToInventoryPlan(line: Row, input: { quantity?: unknown; all?: unknown }): Step<number> {
  const balance = round6(Number(line.quantity) || 0);
  if (input.all === true) return balance > 0 ? ok(balance) : no(422, 'There is nothing to return.');
  if (!validQuantity(input.quantity)) return no(422, 'Quantity to return must be at least 0.01, in steps of 0.01.');
  if (input.quantity > balance + 1e-9) return no(409, `Quantity exceeds available balance (${balance}).`);
  return ok(round6(input.quantity));
}
/** The bell notifications of transfer orders (MTO manual 2.5: sto_new / sto_completed / sto_reversed), by the action that causes them. */
export const TRANSFER_NOTIFICATIONS = { new: 'New Transfer Order', completed: 'Transfer Order Completed', reversed: 'Transfer Order Reversed' } as const;
export type TransferNotification = keyof typeof TRANSFER_NOTIFICATIONS;
export const TRANSFER_ORDER_EVENTS: Record<string, TransferNotification> = { 'transfer-order-create': 'new', 'transfer-order-complete': 'completed', 'stock-return': 'completed', 'transfer-order-reverse': 'reversed' };
/** The page of one transfer order (the bell's notifications open it). */
export const transferOrderPath = (id: string) => `/materials/transfer_orders?order=${encodeURIComponent(id)}`;
/** Where a transfer order takes material from and delivers it to, as the list and the detail name them. */
export function orderPlaces(rows: Record<string, Row[]>, order: Row): { from: string; to: string } {
  const name = (key: string, id: unknown) => String((rows[key] || []).find(row => row.id === id)?.name ?? '');
  const route = transferRoute(String(order.type));
  const from = route?.from === 'inventory' ? (order.fromSiteId ? `Inventory · ${name('sites', order.fromSiteId)}` : '—') : order.fromWarehouseId ? name('warehouses', order.fromWarehouseId) : 'Storehouse of each item';
  const to = route?.to === 'storehouse' ? name('warehouses', order.toWarehouseId) || '—' : order.siteId ? `${route?.to === 'site' ? '' : 'Inventory · '}${name('sites', order.siteId)}` : '—';
  return { from, to };
}
/** The items of a transfer order, in the order they were added. */
export const orderItemsOf = (rows: Record<string, Row[]>, orderId: string) => live(rows, 'transfer_order_items').filter(item => item.orderId === orderId).sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)) || a.id.localeCompare(b.id));
export const PICK_SHEET_COLUMNS = ['#', 'Material No', 'Description', 'Qty', 'UOM', 'Storehouse / charge', 'Qty picked', 'Line status'];
/** Print pick sheet: the order's header and one line per item, with the place to take it from and the pick result saved so far. */
export function pickSheetModel(rows: Record<string, Row[]>, orderId: string) {
  const order = live(rows, 'transfer_orders').find(row => row.id === orderId);
  if (!order) return null;
  const places = orderPlaces(rows, order), stock = new Map((rows.stock || []).map(row => [row.id, row]));
  const lines = orderItemsOf(rows, order.id).map((item, index) => {
    const source = item.stockId ? stock.get(String(item.stockId)) : undefined;
    const where = source ? [isSiteStock(source) ? 'Inventory' : String((rows.warehouses || []).find(row => row.id === source.warehouseId)?.name ?? ''), String(source.chargeNo || '')].filter(Boolean).join(' · ') : '';
    const status = lineStatus(item);
    return [String(index + 1), String(item.materialNo ?? ''), String(item.description ?? ''), String(Number(item.quantity)), String(item.uom ?? ''), where, status === 'Pending' ? '' : String(qtyPicked(item)), status === 'Pending' ? '' : status];
  });
  return { order, status: orderStatus(order), type: transferTypeLabel(order.type), ...places, lines };
}
/** Adjust quantity on a storehouse line saves only for an administrator or a storehouse manager (MTO manual, Adjust quantity). */
export const ADJUST_REFUSED = 'Only an administrator or a storehouse manager can adjust a quantity.';
export const mayAdjustQuantity = (administrator: boolean, account: Row | undefined) => administrator || account?.storehouseManager === true;
/** Who a transfer-order notification goes to: of the accounts that may open the order, those ticked as Storehouse manager. */
export const storehouseManagers = (accounts: Row[], candidates: string[]) => { const ticked = new Set(accounts.filter(account => account.storehouseManager === true).map(account => account.id)); return candidates.filter(id => ticked.has(id)); };
export const CORRECTION_REASONS = ['Import error', 'Name correction', 'Other'] as const;
/** Reasons of Adjust quantity and of Remove material (reference #adjustLagerQuantity, #removeLagerItem). */
export const ADJUST_REASONS = ['Loss', 'Damage', 'Found', 'Count correction', 'Other'] as const;
export const REMOVE_REASONS = ['Imported by mistake', 'No longer held', 'Other'] as const;
/** Every reason a stock movement may carry. */
export const MOVEMENT_REASONS = [...new Set<string>([...CORRECTION_REASONS, ...ADJUST_REASONS, ...REMOVE_REASONS])];
/** Movement types this flow adds to the existing receipt / issue / transfer / adjustment types. */
export const MOVEMENT_TYPES = ['Project transfer', 'Project return', 'Correction', 'Removal', 'Return to inventory', 'Reversal'] as const;
export const MAX_LENGTHS = { materialGroup: 100, articleNo: 100, uom: 20, description: 2000, dia: 20, lbs: 20, reasonText: 500, chargeNo: 100, materialNo: 100, comment: 500 } as const;
export const LOCATION_KINDS = ['site', 'storehouse'] as const;
export type LocationKind = typeof LOCATION_KINDS[number];

// ---- Locations ----------------------------------------------------------------------------------------------

/** The kind of a stock row: rows without the field (everything written before) are storehouse lines. */
export const locationKind = (row: Row): LocationKind => row.locationKind === 'site' ? 'site' : 'storehouse';
export const isSiteStock = (row: Row) => locationKind(row) === 'site';
export const isStorehouseLine = (row: Row) => locationKind(row) === 'storehouse';
/** A movement of a project site's inventory: it names the site and no storehouse. */
export const isSiteMovement = (move: Row) => !move.warehouseId && Boolean(move.siteId);

/** The project site an isometric belongs to (through its project), '' when it cannot be found. */
export function isoSiteId(rows: Record<string, Row[]>, iso: Row | undefined): string {
  if (!iso) return '';
  return String((rows.projects || []).find(project => project.id === iso.projectId)?.siteId || '');
}
/**
 * The project site of a pick-list line or a reservation: its own `siteId` (written since the two location kinds
 * exist), else the site of its isometric.
 */
export function claimSiteId(rows: Record<string, Row[]>, row: Row): string {
  if (row.siteId) return String(row.siteId);
  return isoSiteId(rows, (rows.isometrics || []).find(iso => iso.id === row.isoId));
}
/** A pick-list line that takes from a project site's inventory (one written before names a storehouse). */
export const picksFromSite = (line: Row) => !line.warehouseId;

// ---- Transfer orders ----------------------------------------------------------------------------------------

/**
 * Where a transfer order type takes material from and delivers it to (reference handler of #stoType):
 * - 'inventory' as source: the Material inventory of the active project site;
 * - 'site' as target: the inventory of the chosen project site ("To project site");
 * - 'inventory' as target: the inventory of the active project site (Return → Inventory names no destination).
 */
export type TransferRoute = { from: 'inventory' | 'storehouse'; to: 'site' | 'storehouse' | 'inventory' };
export function transferRoute(type: string): TransferRoute | null {
  if (type === 'Inventory - Project') return { from: 'inventory', to: 'site' };
  if (type === 'Inventory - Storehouse') return { from: 'inventory', to: 'storehouse' };
  if (type === 'Storehouse → Project') return { from: 'storehouse', to: 'site' };
  if (type === 'Storehouse → Storehouse') return { from: 'storehouse', to: 'storehouse' };
  if (type === 'Return → Inventory') return { from: 'storehouse', to: 'inventory' };
  return null;
}
/** Where the New Transfer Order dialog was opened: from inventory rows, from storehouse lines, or on its own page. */
export type TransferContext = 'inventory' | 'store' | 'page';
/**
 * The types the dialog offers. The reference decides this with option attributes that the capture does not hold
 * (data-sto-context); the default built: the inventory offers the two types that take from the inventory, storehouse
 * lines the three that take from a storehouse, the Transfer orders page all five.
 */
export function transferTypesFor(context: TransferContext): TransferType[] {
  if (context === 'inventory') return TRANSFER_TYPES.filter(type => transferRoute(type)!.from === 'inventory');
  if (context === 'store') return TRANSFER_TYPES.filter(type => transferRoute(type)!.from === 'storehouse');
  return [...TRANSFER_TYPES];
}
/** The type preselected (reference: an empty type falls back to 5 in the inventory context and to 2 otherwise). */
export const defaultTransferType = (context: TransferContext): TransferType => context === 'inventory' ? 'Inventory - Project' : 'Storehouse → Project';
/**
 * The location fields the dialog shows for a type (reference #stoType change handler): From storehouse only when the
 * source is a storehouse and the items do not carry their own storehouse (and, for types 2 and 3, not in the
 * inventory context); To project site for 5 and 2; To storehouse for 1 and 3; nothing more for 4.
 */
export function transferOrderFields(type: string, context: TransferContext, itemsCarryStorehouse = false) {
  const route = transferRoute(type);
  if (!route) return { fromStorehouse: false, toSite: false, toStorehouse: false };
  const fromStorehouse = route.from === 'storehouse' && !itemsCarryStorehouse && (route.to === 'inventory' || context !== 'inventory');
  return { fromStorehouse, toSite: route.to === 'site', toStorehouse: route.to === 'storehouse' };
}

/** A quantity of at least 0.01 in steps of 0.01 (the reference's rule for transfers and orders). */
export function validQuantity(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_QUANTITY - 1e-9) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export interface StockDetails { group: string; articleNo: string; materialNo: string; dia: string; lbs: string; description: string; uom: string; }
/**
 * What a stock row shows. A corrected row carries its own wording (so an import error can be fixed without
 * touching the catalog); every other row shows its catalog or custom material.
 */
export function stockDetails(rows: Record<string, Row[]>, stock: Row): StockDetails {
  const material = materialRecord(rows, { ...stock, customMaterial: false } as Row);
  const own = stock.corrected === true;
  const pick = (own_: string, catalog: string) => String((own ? stock[own_] : material?.[catalog]) ?? '');
  return { group: pick('materialGroup', 'materialGroup'), articleNo: pick('articleNo', 'articleNo'), materialNo: String(material?.materialNo ?? ''), dia: pick('dia', 'dia'), lbs: pick('lbs', 'lbs'), description: pick('description', 'description'), uom: pick('uom', 'uom') };
}
export const stockLabel = (rows: Record<string, Row[]>, stock: Row) => stockDetails(rows, stock).materialNo || 'Unavailable material';

const live = (rows: Record<string, Row[]>, key: string) => (rows[key] || []).filter(row => !row._archived);
const byCharge = (a: Row, b: Row) => String(a.chargeNo || '').localeCompare(String(b.chargeNo || '')) || String(a._createdAt || '').localeCompare(String(b._createdAt || '')) || a.id.localeCompare(b.id);

/** The stock rows of one project site's inventory (every charge, in charge order), optionally of one material. */
export function siteStock(rows: Record<string, Row[]>, siteId: string, identity?: string): Row[] {
  return live(rows, 'stock').filter(stock => isSiteStock(stock) && stock.siteId === siteId && (!identity || materialIdentity(stock) === identity)).sort(byCharge);
}

/** One row of the Material inventory: one Material No of the site with the quantity of all its charges. */
export interface InventoryRow { key: string; identity: string; siteId: string; materialId: string; customMaterialId: string; quantity: number; details: StockDetails; lines: Row[] }
export interface InventoryFilters { siteId: string; onlyWithQuantity: boolean; query?: string; }
/** The Material inventory of one project site: one row per Material No (charges summed), in material number order. */
export function inventoryRows(rows: Record<string, Row[]>, filters: InventoryFilters): InventoryRow[] {
  const query = (filters.query || '').trim().toLowerCase();
  const groups = new Map<string, Row[]>();
  for (const stock of siteStock(rows, filters.siteId)) { const identity = materialIdentity(stock); groups.set(identity, [...(groups.get(identity) || []), stock]); }
  return [...groups].map(([identity, lines]) => ({
    key: `${filters.siteId}|${identity}`, identity, siteId: filters.siteId, materialId: String(lines[0].materialId || ''), customMaterialId: String(lines[0].customMaterialId || ''),
    quantity: round6(lines.reduce((sum, line) => sum + Number(line.quantity), 0)), details: stockDetails(rows, lines[0]), lines,
  }))
    .filter(row => !filters.onlyWithQuantity || row.quantity > 0)
    .filter(row => !query || Object.values(row.details).some(value => String(value ?? '').toLowerCase().includes(query)))
    .sort((a, b) => a.details.materialNo.localeCompare(b.details.materialNo));
}

export interface StorehouseFilters { warehouseId?: string; onlyWithQuantity: boolean; query?: string; }
/** Storehouse lines (one per material and charge), of one storehouse or of all, in storehouse and material number order. */
export function storehouseRows(rows: Record<string, Row[]>, filters: StorehouseFilters) {
  const query = (filters.query || '').trim().toLowerCase();
  const names = new Map(live(rows, 'warehouses').map(row => [row.id, String(row.name || '')]));
  return live(rows, 'stock').filter(stock => isStorehouseLine(stock) && (!filters.warehouseId || stock.warehouseId === filters.warehouseId) && (!filters.onlyWithQuantity || Number(stock.quantity) > 0))
    .map(stock => ({ stock, details: stockDetails(rows, stock) }))
    .filter(({ stock, details }) => !query || [...Object.values(details), stock.chargeNo].some(value => String(value ?? '').toLowerCase().includes(query)))
    .sort((a, b) => String(names.get(String(a.stock.warehouseId)) || '').localeCompare(String(names.get(String(b.stock.warehouseId)) || '')) || a.details.materialNo.localeCompare(b.details.materialNo) || String(a.stock.chargeNo || '').localeCompare(String(b.stock.chargeNo || '')));
}

const newestFirst = (a: Row, b: Row) => String(b.date).localeCompare(String(a.date)) || String(b._createdAt).localeCompare(String(a._createdAt));
/** The movements of one stock row: a storehouse line's own material and charge, or a site inventory's Material No. */
export function inventoryLog(rows: Record<string, Row[]>, stock: Row) {
  const identity = materialIdentity(stock);
  if (isSiteStock(stock)) return siteInventoryLog(rows, String(stock.siteId), identity);
  return (rows.movements || []).filter(move => move.warehouseId === stock.warehouseId && materialIdentity(move) === identity && String(move.chargeNo || '') === String(stock.chargeNo || '')).sort(newestFirst);
}
/** The Material log of one Material No in a project site's inventory (every charge). */
export function siteInventoryLog(rows: Record<string, Row[]>, siteId: string, identity: string) {
  return (rows.movements || []).filter(move => isSiteMovement(move) && move.siteId === siteId && materialIdentity(move) === identity).sort(newestFirst);
}

/**
 * The certificates of a storehouse line: certifications of the same catalog material and charge number. They are
 * what "Transfer to project" offers to copy to the destination project site.
 */
export function lineCertificates(rows: Record<string, Row[]>, stock: Row): Row[] {
  if (!stock.materialId || !String(stock.chargeNo || '')) return [];
  return live(rows, 'certifications').filter(cert => cert.materialId === stock.materialId && String(cert.chargeNo || '') === String(stock.chargeNo || ''));
}

export interface Holding { siteId: string; identity: string; materialId: string; customMaterialId: string; chargeNo: string; quantity: number; }
/**
 * Material that the first version handed to a project as an invisible "holding" (a storehouse movement of type
 * Project transfer / Project return with a site) and that is not yet in that site's inventory. Since the two location
 * kinds exist, every Project transfer writes both sides (storehouse −Q, site inventory +Q), and the hosted preparation
 * (`migrateProjectHoldings`, server/mto-stock.ts) books what was left into the site inventories with the same type,
 * so this list becomes empty and stays empty.
 */
export function unmigratedHoldings(rows: Record<string, Row[]>): Holding[] {
  const holdings = new Map<string, Holding>();
  for (const move of rows.movements || []) {
    if (!['Project transfer', 'Project return'].includes(String(move.type)) || !move.siteId) continue;
    const identity = materialIdentity(move), chargeNo = String(move.chargeNo || '');
    const key = `${move.siteId}|${identity}|${chargeNo}`;
    const entry = holdings.get(key) || { siteId: String(move.siteId), identity, materialId: String(move.materialId || ''), customMaterialId: String(move.customMaterialId || ''), chargeNo, quantity: 0 };
    entry.quantity = round6(entry.quantity - Number(move.quantity));
    holdings.set(key, entry);
  }
  return [...holdings.values()].filter(entry => entry.quantity > 1e-9);
}

/**
 * Per material identity (and charge): quantity in every site inventory and every storehouse, plus any holding the
 * first version left. Transfers, moves, returns and transfer orders never change these totals; only receipts,
 * picks, adjustments and removals do.
 */
export function conservedTotals(rows: Record<string, Row[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  const add = (key: string, quantity: number) => { totals[key] = round6((totals[key] || 0) + quantity); };
  for (const stock of live(rows, 'stock')) add(`${materialIdentity(stock)}|${stock.chargeNo || ''}`, Number(stock.quantity));
  for (const holding of unmigratedHoldings(rows)) add(`${holding.identity}|${holding.chargeNo}`, holding.quantity);
  return totals;
}

export const MATERIALS_LIST_COLUMNS = [
  { key: 'project', label: 'Project' }, { key: 'iso', label: 'Iso number' }, { key: 'chemicalClean', label: 'Ch.clean' }, { key: 'group', label: 'Group' },
  { key: 'materialNo', label: 'Mat.no.' }, { key: 'description', label: 'Description' }, { key: 'quantity', label: 'Qty.', type: 'number' as const },
  { key: 'ordered', label: 'Ord.?' }, { key: 'inventory', label: 'Inv.', type: 'number' as const }, { key: 'picked', label: 'Picked', type: 'number' as const },
];
export interface MaterialsListFilters { siteId?: string; projectId?: string; isoId?: string; query?: string; /** Filter materials: Ordered Yes / No (reference #filterMaterialList). */ ordered?: string; }
/**
 * Ord.? says whether the requirement is fully covered by orders (Yes) or not (No), exactly as the isometric's Materials
 * tab; Inv. is what the isometric's project site holds in its Material inventory and no pick list claims yet; Picked is
 * the quantity issued to the isometric.
 */
export const orderedState = (required: number, ordered: number): 'Yes' | 'No' => Math.max(0, required - ordered) <= 1e-9 ? 'Yes' : 'No';
/** The materials of the active main project (or of one project / isometric), computed from the current records. */
export function materialsList(rows: Record<string, Row[]>, filters: MaterialsListFilters = {}) {
  const projects = new Map(live(rows, 'projects').map(project => [project.id, project]));
  const query = (filters.query || '').trim().toLowerCase();
  return requirementExecution(rows, { projectId: filters.projectId || undefined, isoId: filters.isoId || undefined })
    .filter(entry => !filters.siteId || projects.get(String(entry.iso.projectId))?.siteId === filters.siteId)
    .map(entry => {
      const project = projects.get(String(entry.iso.projectId)), material = entry.material as Row;
      const values = {
        project: String(project?.internnumber || project?.description || ''), iso: String(entry.iso.isoNo || ''), chemicalClean: String(entry.iso.chemicalClean || ''),
        group: String(material.materialGroup || ''), materialNo: String(material.materialNo || ''), description: String(material.description || ''), quantity: entry.required,
        ordered: orderedState(entry.required, entry.ordered), inventory: entry.inventory, picked: entry.picked,
      };
      return { id: entry.requirement.id, values };
    })
    .filter(row => !filters.ordered || row.values.ordered === filters.ordered)
    .filter(row => !query || Object.values(row.values).some(value => String(value).toLowerCase().includes(query)))
    .sort((a, b) => String(a.values.project).localeCompare(String(b.values.project)) || String(a.values.iso).localeCompare(String(b.values.iso)) || String(a.values.materialNo).localeCompare(String(b.values.materialNo)));
}

// ---- Reserved quantity, certificates of inventory rows -------------------------------------------------------

/** What open transfer orders already hold of one storehouse line (reference "Reserved on open orders"). */
export function reservedOnOpenOrders(rows: Record<string, Row[]>, stock: Row): number {
  const open = new Set(live(rows, 'transfer_orders').filter(isOpenOrder).map(order => order.id));
  return round6(live(rows, 'transfer_order_items').filter(item => open.has(String(item.orderId)) && item.stockId === stock.id).reduce((sum, item) => sum + Number(item.quantity), 0));
}
/** An open transfer order that holds a storehouse line blocks its removal. */
export const blocksRemoval = (rows: Record<string, Row[]>, stock: Row) => reservedOnOpenOrders(rows, stock) > 0;

/** The certificates of a Material No in a project site's inventory: those of the catalog material for each charge the site holds. */
export function inventoryCertificates(rows: Record<string, Row[]>, inventory: { lines: Row[] }): Row[] {
  const seen = new Set<string>(), found: Row[] = [];
  for (const line of inventory.lines) for (const cert of lineCertificates(rows, line)) if (!seen.has(cert.id)) { seen.add(cert.id); found.push(cert); }
  return found;
}
/** The certificate ids of a transfer order item (stored as one comma-separated text). */
export const itemCertIds = (item: Row) => String(item.certIds || '').split(',').map(id => id.trim()).filter(Boolean);

// ---- Screens: what each menu and dialog offers ------------------------------------------------------------------

/** The Options of a Material inventory row, in the reference's order (mto__order__material-inventory); storehouse operations are not among them. */
export const INVENTORY_ROW_OPTIONS = { log: 'Material log', label: 'Print QR label', transfer: 'Request transfer to storehouse (Transfer Order)', remove: 'Remove material from inventory' } as const;
/** The buttons of the Material inventory toolbar: a direct transfer to a project exists only on storehouse lines. */
export const INVENTORY_TOOLBAR = ['New Transfer Order', 'Add'] as const;
/** The Options of a storehouse line (dialog titles of the reference; the menu labels themselves are not captured). */
export const STOREHOUSE_LINE_OPTIONS = ['Material log', 'Transfer to project', 'Move to other storehouse', 'Return to inventory', 'Correction', 'Edit storehouse item', 'Adjust quantity', 'Remove material', 'Audit trail', 'View certificates', 'Print QR label'] as const;

export interface OrderItemDraft { materialNo: string; description: string; /** The quantity the item starts with: the full balance. */ quantity: number; uom: string; stockId: string; /** The most the item may take. */ balance: number; certificates: Row[] }
/**
 * The items a New Transfer Order opens with (reference _buildStoItemRow): one per checked inventory row or storehouse
 * line, Material No fixed, quantity = maximum = the balance, every certificate of the material offered (all ticked by the dialog).
 */
export function prefilledOrderItems(rows: Record<string, Row[]>, context: TransferContext, inventory: InventoryRow[] = [], lines: Row[] = []): OrderItemDraft[] {
  if (context === 'inventory') return inventory.map(row => ({ materialNo: row.details.materialNo, description: row.details.description, quantity: row.quantity, uom: row.details.uom, stockId: '', balance: row.quantity, certificates: inventoryCertificates(rows, row) }));
  if (context === 'store') return lines.map(line => { const details = stockDetails(rows, line); return { materialNo: details.materialNo, description: details.description, quantity: Number(line.quantity), uom: details.uom, stockId: line.id, balance: Number(line.quantity), certificates: lineCertificates(rows, line) }; });
  return [];
}
/** The quantity a transfer to a project starts with: one line starts empty, the bulk dialog starts every line at its full balance. */
export const transferAmountDefault = (lines: Row[], line: Row) => lines.length > 1 ? String(Number(line.quantity)) : '';

// ---- Material log ---------------------------------------------------------------------------------------------

export interface MaterialLogRow { id: string; /** When it was booked (ISO), for the time of day. */ at: string; date: string; action: string; reference: string; user: string; /** Signed: plus = into the place, minus = out of it. */ quantity: number; }
/**
 * What the Material log shows for a movement: Date | Action | reference ('-' column) | User | Quantity (reference
 * showMaterialInventoryLog). Texts captured in the reference: 'Received from <supplier>' / 'Ord. No. <no>', 'Sent to
 * storehouse <name>' / '-', 'Isometric execution <ISO No>' / 'Pick List <no>'. The other movements have no captured text;
 * they read as the plain sentence below (unverified).
 */
export function movementAction(rows: Record<string, Row[]>, move: Row): { action: string; reference: string } {
  const named = (key: string, id: unknown, field = 'name') => String(live(rows, key).find(row => row.id === id)?.[field] ?? '');
  const quantity = Number(move.quantity), type = String(move.type), site = Boolean(move.siteId) && !move.warehouseId;
  const first = String(move.note || '').split(' · ')[0].trim();
  const order = move.transferOrder ? live(rows, 'transfer_orders').find(row => row.number === move.transferOrder) : undefined;
  if (type === 'Receipt' && quantity > 0) {
    const purchase = live(rows, 'orders').find(row => row.number === first);
    return purchase ? { action: `Received from ${named('suppliers', purchase.supplierId) || 'the supplier'}`, reference: `Ord. No. ${purchase.number}` } : { action: 'Received', reference: '-' };
  }
  if (type === 'Issue') {
    const iso = named('isometrics', move.isoId, 'isoNo');
    return { action: iso ? `Isometric execution ${iso}` : 'Issued', reference: first ? `Pick List ${first}` : '-' };
  }
  if (type === 'Removal') return { action: site ? 'Removed from inventory' : 'Removed from storehouse', reference: String(move.reasonText || move.note || '-') };
  if (type === 'Correction') return { action: 'Correction', reference: String(move.reasonText || move.note || '-') };
  if (type === 'Reversal') return { action: `Reversal of transfer order ${move.transferOrder || ''}`.trim(), reference: String(move.transferOrder || '-') };
  if (type === 'Adjustment') {
    if (site && quantity > 0) return { action: 'Added to inventory', reference: '-' };
    return { action: 'Adjustment', reference: String(move.reasonText || move.note || '-') };
  }
  if (order) {
    const toStorehouse = named('warehouses', order.toWarehouseId), fromStorehouse = named('warehouses', order.fromWarehouseId || move.warehouseId);
    if (quantity < 0 && toStorehouse) return { action: `Sent to storehouse ${toStorehouse}`, reference: '-' };
    if (quantity < 0 && order.siteId) return { action: `Sent to project site ${named('sites', order.siteId)}`, reference: '-' };
    if (quantity > 0 && order.fromSiteId && site) return { action: `Received from project site ${named('sites', order.fromSiteId)}`, reference: String(order.number) };
    if (quantity > 0 && fromStorehouse && site) return { action: `Received from storehouse ${fromStorehouse}`, reference: String(order.number) };
    return { action: quantity < 0 ? 'Sent out' : 'Received', reference: String(order.number) };
  }
  if (type === 'Project transfer' || type === 'Return to inventory') return quantity > 0 && site ? { action: type === 'Project transfer' ? 'Received from a storehouse' : 'Returned from a storehouse', reference: '-' } : { action: `Sent to ${named('sites', move.siteId) || 'the project site'}`, reference: '-' };
  return { action: type, reference: String(move.number || '-') };
}
/** The log rows of some movements, oldest first. */
export function materialLogRows(rows: Record<string, Row[]>, moves: Row[]): MaterialLogRow[] {
  return [...moves].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a._createdAt).localeCompare(String(b._createdAt)))
    .map(move => ({ id: move.id, at: String(move._createdAt || ''), date: String(move.date || ''), ...movementAction(rows, move), user: String(move.byName || '-'), quantity: Number(move.quantity) }));
}
/** The Material log of one Material No in a project site's inventory. */
export const siteMaterialLog = (rows: Record<string, Row[]>, siteId: string, identity: string) => materialLogRows(rows, siteInventoryLog(rows, siteId, identity));

// ---- Material search over storehouses and project site inventories --------------------------------------------

export const SEARCH_LIMIT = 200;
export interface SearchFilters { locations: string[]; group: string; dia: string; schedule: string; text: string }
export interface SearchRow { key: string; kind: LocationKind; place: string; stock: Row; details: StockDetails; certificates: number }
/** A text counts as a search term when one of its words has at least three characters (reference _storehouseSearchHasTerm). */
export const searchHasTerm = (value: string) => value.replace(/[+\-<>()~*"@]+/g, ' ').split(/\s+/).some(part => part.length >= 3);
/** The places the search can look in: every storehouse and every project site (a location value is `warehouse:<id>` or `site:<id>`). */
export function searchLocations(rows: Record<string, Row[]>) {
  return [...live(rows, 'warehouses').filter(row => row.use !== 'Tools').map(row => ({ value: `warehouse:${row.id}`, label: String(row.name) })), ...live(rows, 'sites').map(row => ({ value: `site:${row.id}`, label: String(row.name) }))];
}
/**
 * Search material across storehouses and project site inventories (reference #datatableStorehouseSearch): at least one
 * location or a search term; zero balances are hidden; at most 200 rows. `state` tells the page which notice to show.
 */
export function searchStock(rows: Record<string, Row[]>, filters: SearchFilters): { rows: SearchRow[]; state: 'need' | 'empty' | 'capped' | 'ok' } {
  const text = filters.text.trim().toLowerCase();
  if (!filters.locations.length && !searchHasTerm(text)) return { rows: [], state: 'need' };
  const places = new Map<string, string>([...live(rows, 'warehouses').map(row => [`warehouse:${row.id}`, String(row.name)] as const), ...live(rows, 'sites').map(row => [`site:${row.id}`, String(row.name)] as const)]);
  const contains = (value: string, wanted: string) => !wanted.trim() || value.toLowerCase().includes(wanted.trim().toLowerCase());
  const found = live(rows, 'stock').filter(stock => Number(stock.quantity) > 0).map(stock => {
    const kind = locationKind(stock), id = kind === 'site' ? `site:${stock.siteId}` : `warehouse:${stock.warehouseId}`;
    return { stock, kind, id, details: stockDetails(rows, stock) };
  })
    .filter(entry => places.has(entry.id) && (!filters.locations.length || filters.locations.includes(entry.id)))
    .filter(entry => contains(entry.details.group, filters.group) && contains(entry.details.dia, filters.dia) && contains(entry.details.lbs, filters.schedule))
    .filter(entry => !text || entry.details.description.toLowerCase().includes(text) || entry.details.materialNo.toLowerCase().includes(text))
    .sort((a, b) => places.get(a.id)!.localeCompare(places.get(b.id)!) || a.details.materialNo.localeCompare(b.details.materialNo) || String(a.stock.chargeNo || '').localeCompare(String(b.stock.chargeNo || '')))
    .map(entry => ({ key: entry.stock.id, kind: entry.kind, place: places.get(entry.id)!, stock: entry.stock, details: entry.details, certificates: lineCertificates(rows, entry.stock).length }));
  if (!found.length) return { rows: [], state: 'empty' };
  return found.length > SEARCH_LIMIT ? { rows: found.slice(0, SEARCH_LIMIT), state: 'capped' } : { rows: found, state: 'ok' };
}

// ---- Storehouse transactions ----------------------------------------------------------------------------------

export interface Transaction { key: string; /** The five-digit report number; '' on movements written before report numbers existed. */ reportNo: string; at: string; date: string; type: string; from: string; to: string; user: string; items: number; moves: Row[] }
/**
 * The storehouse transactions: movements that touch a storehouse, grouped by the report number of the operation that
 * wrote them (one transfer, however many lines, is one transaction). A movement without a report number (written before
 * they existed) is listed alone and without one. Newest first (reference #datatableStorehouseTransactions).
 */
export function storehouseTransactions(rows: Record<string, Row[]>): Transaction[] {
  const groups = new Map<string, Row[]>();
  for (const move of live(rows, 'movements')) {
    const key = move.reportNo ? `report:${move.reportNo}` : `single:${move.id}`;
    groups.set(key, [...(groups.get(key) || []), move]);
  }
  const placeName = (move: Row) => move.warehouseId ? String((live(rows, 'warehouses').find(row => row.id === move.warehouseId)?.name) ?? '') : move.siteId ? `Inventory · ${String(live(rows, 'sites').find(row => row.id === move.siteId)?.name ?? '')}` : '';
  return [...groups].filter(([, moves]) => moves.some(move => move.warehouseId)).map(([key, moves]) => {
    const ordered = [...moves].sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)));
    const out = ordered.find(move => Number(move.quantity) < 0), into = ordered.find(move => Number(move.quantity) > 0);
    const order = ordered.map(move => move.transferOrder ? live(rows, 'transfer_orders').find(row => row.number === move.transferOrder) : undefined).find(Boolean);
    const types = new Set(ordered.map(move => String(move.type)));
    const type = types.has('Reversal') ? 'Reversal' : order ? String(order.type) : types.has('Project transfer') ? 'Storehouse → Project' : types.has('Return to inventory') ? 'Return → Inventory' : types.has('Transfer in') || types.has('Transfer out') ? 'Storehouse → Storehouse' : String(ordered[0].type);
    const lone = !into && !out ? ordered[0] : undefined;
    return {
      key, reportNo: String(ordered[0].reportNo || ''), at: String(ordered[0]._createdAt || ''), date: String(ordered[0].date || ''), type,
      from: out ? placeName(out) : lone ? placeName(lone) : '-', to: into ? placeName(into) : '-', user: String(ordered[0].byName || '-'),
      items: new Set(ordered.map(move => `${materialIdentity(move)}|${move.chargeNo || ''}`)).size, moves: ordered,
    };
  }).sort((a, b) => b.at.localeCompare(a.at) || b.reportNo.localeCompare(a.reportNo));
}

// ---- QR labels ----------------------------------------------------------------------------------------------------

export interface MaterialLabel { materialNo: string; description: string; dia: string; lbs: string; uom: string; /** What the QR code encodes: the Material No. */ payload: string }
/** The labels of some Material Nos, each number once (reference material-label.php, one label per Material No); a number the catalogs do not hold is reported in `missing`. */
export function materialLabels(rows: Record<string, Row[]>, materialNos: string[]): { labels: MaterialLabel[]; missing: string[] } {
  const labels: MaterialLabel[] = [], missing: string[] = [];
  for (const wanted of [...new Set(materialNos.map(no => no.trim()).filter(Boolean))]) {
    const material = live(rows, 'materials').find(row => row.materialNo === wanted) ?? live(rows, 'custom_materials').find(row => row.materialNo === wanted);
    if (!material) { missing.push(wanted); continue; }
    labels.push({ materialNo: wanted, description: String(material.description || ''), dia: String(material.dia || ''), lbs: String(material.lbs || ''), uom: String(material.uom || ''), payload: wanted });
  }
  return { labels, missing };
}

// ---- Resources ----------------------------------------------------------------------------------------------

const t = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', ...extra });
const ref = (name: string, label: string, target: string, extra: Partial<Field> = {}): Field => t(name, label, { type: 'ref', ref: target, ...extra });
const sel = (name: string, label: string, options: readonly string[], extra: Partial<Field> = {}): Field => t(name, label, { type: 'select', options: [...options], ...extra });

/** Adds the fields and the two resources of this flow to the registry (called once from shared/resources.ts). */
export function applyMtoStock(resources: Resource[]) {
  const find = (key: string) => resources.find(resource => resource.key === key)!;
  const warehouses = find('warehouses');
  // Add storehouse (reference #addLager): Name, Location, Description.
  warehouses.fields.splice(1, 0, t('location', 'Location'));
  warehouses.fields.push(t('description', 'Description', { type: 'textarea', section: 'Notes' }));
  warehouses.columns = ['name', 'location', 'address', 'residence', 'phone', 'description', 'siteId', 'use'];
  warehouses.description = 'The company’s storehouses, shared by every project site. Search their material, transfer it to a project site and follow every transaction.';
  const stock = find('stock');
  // A site inventory row has no storehouse: the field stays (older rows and every storehouse line carry it) but is optional.
  stock.fields.find(field => field.name === 'warehouseId')!.required = false;
  stock.fields.push(
    sel('locationKind', 'Location kind', LOCATION_KINDS, { hidden: true }), ref('siteId', 'Project site', 'sites', { hidden: true }),
    t('materialGroup', 'Material group'), t('articleNo', 'Article number'), t('uom', 'Unit of measure'), t('description', 'Description'), t('dia', 'Diameter'), t('lbs', 'LBS / schedule'),
    t('corrected', 'Corrected entry', { type: 'checkbox', default: false, hint: 'The wording above was corrected and replaces the catalog wording.' }),
  );
  const movements = find('movements');
  movements.fields.find(field => field.name === 'type')!.options!.push(...MOVEMENT_TYPES);
  movements.fields.push(ref('siteId', 'Project site', 'sites'), sel('reason', 'Reason', MOVEMENT_REASONS), t('reasonText', 'Reason text'), t('transferOrder', 'Transfer order'), t('reportNo', 'Report No.'), t('byName', 'User'));
  // Pick-list lines and reservations name the project site whose inventory they draw on.
  find('picklists').fields.push(ref('siteId', 'Project site', 'sites', { hidden: true }));
  find('reservations').fields.push(ref('siteId', 'Project site', 'sites', { hidden: true }));
  resources.push({
    key: 'transfer_orders', title: 'Transfer orders', singular: 'transfer order', module: 'materials', group: 'Order & inventory', readonly: true, display: 'number',
    description: 'Planned moves of material between project site inventories and storehouses. Completing an order applies its movements.',
    fields: [t('number', 'Transfer order'), sel('type', 'Type', TRANSFER_TYPES, { required: true }), sel('priority', 'Priority', TRANSFER_PRIORITIES, { default: 'Normal' }), sel('status', 'Status', TRANSFER_STATUSES, { default: 'Requested', legacy: LEGACY_TRANSFER_STATUSES }),
      ref('fromWarehouseId', 'From storehouse', 'warehouses'), ref('fromSiteId', 'From project site', 'sites', { hint: 'The project site whose inventory the order takes from.' }), ref('siteId', 'Project site', 'sites', { hint: 'The project site whose inventory receives the material.' }), ref('toWarehouseId', 'To storehouse', 'warehouses'),
      t('date', 'Date', { type: 'date' }), t('completedDate', 'Completed on', { type: 'date' }), t('notes', 'Notes', { type: 'textarea', section: 'Notes' }),
      // The lifecycle (Assign to me, Cancel, Reverse order): who handles the order and when each step happened; absent on older orders.
      t('assignedTo', 'Assigned to', { hidden: true }), t('assignedName', 'Handler', { hidden: true }), t('assignedAt', 'Assigned at', { hidden: true }), t('createdByName', 'Created by', { hidden: true }),
      t('cancelReason', 'Cancel reason', { hidden: true }), t('completedAt', 'Completed at', { hidden: true }), t('reversedAt', 'Reversed at', { hidden: true }), t('reversedBy', 'Reversed by', { hidden: true })],
    columns: ['number', 'type', 'priority', 'status', 'fromWarehouseId', 'fromSiteId', 'siteId', 'toWarehouseId', 'date'],
  });
  resources.push({
    key: 'transfer_order_items', title: 'Transfer order items', singular: 'transfer order item', module: 'materials', group: 'Order & inventory', readonly: true, display: 'materialNo',
    description: 'The materials and quantities of a transfer order.',
    fields: [ref('orderId', 'Transfer order', 'transfer_orders', { required: true }), t('materialNo', 'Material no.', { required: true }), t('description', 'Description'),
      t('quantity', 'Quantity', { type: 'number', min: MIN_QUANTITY, step: 0.01, required: true }), t('uom', 'UOM'), t('stockId', 'Inventory line', { hidden: true }), t('certIds', 'Certificates', { hidden: true }),
      // Pick results (Transfer Order detail): absent on older items, which read as Pending with nothing picked.
      t('qtyPicked', 'Qty picked', { type: 'number', min: 0, step: 0.01, hidden: true }), sel('lineStatus', 'Line status', LINE_STATUSES, { hidden: true })],
    columns: ['orderId', 'materialNo', 'description', 'quantity', 'uom'],
  });
}
/** Access areas of the new resources: both belong to the "Material inventory" area (16). */
export const MTO_STOCK_SCOPES: Record<string, string[]> = { transfer_orders: ['16'], transfer_order_items: ['16'] };

// ---- Actions ------------------------------------------------------------------------------------------------

const field = (name: string, label: string, type: ActionField['type'], extra: Partial<ActionField> = {}): ActionField => ({ name, label, type, ...extra });
const dateField = field('date', 'Date', 'date', { required: true });
const noteField = field('note', 'Notes', 'textarea');
const quantity = (extra: Partial<ActionField> = {}) => field('quantity', 'Quantity', 'number', { min: MIN_QUANTITY, step: 0.01, required: true, ...extra });
const stockField = field('stockId', 'Storehouse line', 'ref', { ref: 'stock', required: true });
const siteField = (label: string, extra: Partial<ActionField> = {}) => field('siteId', label, 'ref', { ref: 'sites', required: true, ...extra });
const itemsField = (label: string) => field('items', label, 'text', { hidden: true });
const allField = (label: string) => field('all', label, 'checkbox', { default: false, hint: 'Take the whole quantity.' });
const reasonText = (required: boolean) => field('reasonText', 'Reason text', 'textarea', { required });

const defs: ActionDefinition[] = [];
const add = (key: string, title: string, description: string, fields: ActionField[], submit = title) => defs.push({ key, title, module: 'materials', description, fields, submit });
// Material inventory of the active project site (area 16).
add('stock-add', 'Add material', 'Put a catalog material into the Material inventory of the project site.', [siteField('Project site', { hidden: true }), field('materialId', 'Material', 'ref', { ref: 'materials', required: true }), field('chargeNo', 'Charge / heat number', 'text', { hidden: true }), quantity(), dateField, noteField], 'Add');
add('inventory-remove', 'Remove material from inventory', 'Take a quantity of one Material No out of the project site’s inventory. The comment is logged.', [siteField('Project site', { hidden: true }), field('materialId', 'Material', 'ref', { ref: 'materials' }), field('customMaterialId', 'Custom material', 'ref', { ref: 'custom_materials', hidden: true }), quantity(), field('comment', 'Comment', 'text', { required: true }), dateField], 'Remove');
// Storehouse lines (area 75).
add('stock-to-project', 'Transfer material from storehouse to project', 'Move storehouse material into the Material inventory of a project site, with the chosen certificates.', [siteField('Destination project site'), itemsField('Materials'), dateField, noteField], 'Transfer');
add('stock-move', 'Move to other storehouse', 'Move a quantity (or all of it) to another storehouse. Both balances change together.', [stockField, field('toWarehouseId', 'Destination storehouse', 'ref', { ref: 'warehouses', required: true }), quantity({ required: false }), allField('Move all'), dateField, noteField], 'Move');
// Return to inventory (reference #returnFromLager): no destination field; the server books into the main project the user works in.
add('stock-return', 'Return to inventory', 'Return storehouse material to the Material inventory of the main project you work in.', [stockField, siteField('Project site', { hidden: true, required: false }), quantity({ label: 'Quantity to return', required: false }), allField('Return all')], 'Return');
add('stock-correction', 'Correction', 'Remove a quantity from a storehouse line, with the reason. The quantity is written off and logged.', [stockField, quantity({ label: 'Quantity to remove' }), field('reasonText', 'Reason', 'text', { required: true }), dateField], 'Apply correction');
add('stock-correct', 'Edit storehouse item', 'Fix the wording of a storehouse line. A reason is required and the change is logged.', [stockField,
  field('materialGroup', 'Material group', 'text'), field('articleNo', 'Article No', 'text'), field('uom', 'UOM', 'text'), field('description', 'Description', 'text'), field('dia', 'DIA', 'text'), field('lbs', 'LBS/SCH', 'text'),
  field('reason', 'Reason', 'select', { options: [...CORRECTION_REASONS], required: true }), field('reasonText', 'Explanation', 'text'), field('chargeNo', 'Charge', 'text', { hidden: true }), dateField], 'Save');
add('stock-adjust', 'Adjust quantity', 'Set the counted quantity of a storehouse line. The difference is logged with your reason.', [stockField, field('quantity', 'New quantity', 'number', { min: 0, step: 0.01, required: true }), field('reason', 'Reason', 'select', { options: [...ADJUST_REASONS], required: true }), field('reasonText', 'Explanation', 'text'), dateField], 'Save');
add('stock-remove', 'Remove material', 'Take the line out of the storehouse. Any remaining quantity is written off. An open transfer order blocks removal.', [stockField, field('reason', 'Reason', 'select', { options: [...REMOVE_REASONS], required: true }), field('reasonText', 'Explanation', 'text'), dateField], 'Remove material');
// Transfer orders (area 16).
add('transfer-order-create', 'New Transfer Order', 'Plan a move between project site inventories and storehouses. Nothing moves until the order is completed.', [field('type', 'Type', 'select', { options: [...TRANSFER_TYPES], required: true }), field('priority', 'Priority', 'select', { options: [...TRANSFER_PRIORITIES], default: 'Normal' }),
  field('fromWarehouseId', 'From storehouse', 'ref', { ref: 'warehouses' }), field('fromSiteId', 'From project site', 'ref', { ref: 'sites', hidden: true }), field('siteId', 'To project site', 'ref', { ref: 'sites' }), field('toWarehouseId', 'To storehouse', 'ref', { ref: 'warehouses' }), field('notes', 'Notes (optional)', 'textarea'), itemsField('Order items'), dateField], 'New Transfer Order');
const orderField = field('orderId', 'Transfer order', 'ref', { ref: 'transfer_orders', required: true });
add('transfer-order-assign', 'Assign to me', 'Take ownership of the transfer order.', [orderField], 'Assign to me');
add('transfer-order-pick', 'Save pick results', 'Save the picked quantity and the line status of every line.', [orderField, itemsField('Pick results')], 'Save pick results');
add('transfer-order-complete', 'Complete transfer', 'Move the picked quantities. If a quantity exceeds the balance or the destination is no longer valid, nothing moves.', [orderField, dateField, noteField], 'Complete transfer');
add('transfer-order-cancel', 'Cancel transfer order', 'Cancel an open order. No stock moves.', [orderField, field('reason', 'Reason', 'textarea', { required: true })], 'Cancel order');
add('transfer-order-reverse', 'Reverse order', 'Undo the stock movements of a completed order. The original movements stay in the log.', [orderField, dateField], 'Reverse order');
export const MTO_STOCK_ACTIONS = defs;
export const isMtoStockAction = (key: string) => defs.some(def => def.key === key);
/** The actions on storehouse lines: they are run from the Storehouses page of MTO Pilot. */
export const STOREHOUSE_ACTIONS = ['stock-to-project', 'stock-move', 'stock-return', 'stock-correction', 'stock-correct', 'stock-adjust', 'stock-remove'];
/**
 * Permission area and verb of each action. Inventory operations sit with "Material inventory" (16: show, insert,
 * delete, export, import), the storehouse-line operations with "Storehouses" (75: show, insert, edit, delete, …).
 * Transfer orders are requested from the inventory (16 insert); which right confirms one is not known (finding
 * mto-procurement-stock-009), so completing and cancelling keep the inventory's add right.
 */
export const MTO_STOCK_ACTION_SCOPES: Record<string, [string, 'insert' | 'edit' | 'delete']> = {
  'stock-add': ['16', 'insert'], 'inventory-remove': ['16', 'delete'],
  'stock-to-project': ['75', 'insert'], 'stock-move': ['75', 'insert'], 'stock-return': ['75', 'insert'], 'stock-correction': ['75', 'edit'], 'stock-correct': ['75', 'edit'], 'stock-adjust': ['75', 'edit'], 'stock-remove': ['75', 'delete'],
  'transfer-order-create': ['16', 'insert'], 'transfer-order-complete': ['16', 'insert'], 'transfer-order-cancel': ['16', 'insert'],
  // The other lifecycle steps keep the same gate (areas 111-113 of the matrix are not mapped: mto-procurement-stock-031).
  'transfer-order-assign': ['16', 'insert'], 'transfer-order-pick': ['16', 'insert'], 'transfer-order-reverse': ['16', 'insert'],
};

// ---- Delivery to the hosted profile -------------------------------------------------------------------------

const names = (key: string, resources: Resource[]) => resources.find(resource => resource.key === key)!.fields.map(f => f.name);
/** What Add storehouse / Edit storehouse show in the pilots profile (reference #addLager); Used for is set by the server. */
export const STOREHOUSE_FIELDS = ['name', 'location', 'description'];
/**
 * Delivers storehouses and transfer orders to a profile. Transfer order items have no page of their own (the order
 * dialog reads them), so they are delivered as data only. Stock (the Material inventory page) and movements (the
 * inventory log) are shared with the other MTO flows and delivered once in `availabilityFor()` (shared/release.ts).
 */
export function deliverMtoStock(availability: Availability, resources: Resource[], deliver: (availability: Availability, key: string, names?: string[]) => void) {
  deliver(availability, 'warehouses', STOREHOUSE_FIELDS);
  deliver(availability, 'transfer_orders');
  for (const key of ['transfer_order_items']) availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...names(key, resources)])];
  for (const def of defs) availability.actions[def.key] = def.fields.map(f => f.name);
}
