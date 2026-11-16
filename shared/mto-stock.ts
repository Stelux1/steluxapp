import type { ActionDefinition, ActionField, Availability, Field, Resource, Row } from './types.ts';
import { materialIdentity, materialRecord, requirementExecution } from './materials.ts';

/**
 * Storehouses, material inventory and transfer orders (MTO Pilot).
 *
 * Everything here is pure: the server (server/mto-stock.ts) applies the rules inside one transaction and the
 * client (client/mto-stock.tsx) uses the same functions to show what an action will do.
 */

export const MIN_QUANTITY = 0.01;
export const TRANSFER_TYPES = ['Inventory - Project', 'Inventory - Storehouse', 'Storehouse → Project', 'Storehouse → Storehouse', 'Return → Inventory'] as const;
export type TransferType = typeof TRANSFER_TYPES[number];
export const TRANSFER_PRIORITIES = ['Normal', 'Urgent'] as const;
/** The reference's statuses are not known: an order is open until it is completed (movements applied) or cancelled. */
export const TRANSFER_STATUSES = ['Open', 'Completed', 'Cancelled'] as const;
export const CORRECTION_REASONS = ['Import error', 'Name correction', 'Other'] as const;
/** Movement types this flow adds to the existing receipt / issue / transfer / adjustment types. */
export const MOVEMENT_TYPES = ['Project transfer', 'Project return', 'Correction', 'Removal'] as const;
export const MAX_LENGTHS = { materialGroup: 100, articleNo: 100, uom: 20, description: 2000, dia: 20, lbs: 20, reasonText: 500, chargeNo: 100, materialNo: 100 } as const;

/** Where a transfer order type takes material from and delivers it to. */
export function transferRoute(type: string): { from: 'storehouse' | 'project'; to: 'storehouse' | 'project' } | null {
  if (type === 'Inventory - Project' || type === 'Storehouse → Project') return { from: 'storehouse', to: 'project' };
  if (type === 'Inventory - Storehouse' || type === 'Storehouse → Storehouse') return { from: 'storehouse', to: 'storehouse' };
  if (type === 'Return → Inventory') return { from: 'project', to: 'storehouse' };
  return null;
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

export interface InventoryFilters { warehouseId: string; onlyWithQuantity: boolean; query?: string; }
/** The inventory of one storehouse, in material number order. */
export function inventoryRows(rows: Record<string, Row[]>, filters: InventoryFilters) {
  const query = (filters.query || '').trim().toLowerCase();
  return live(rows, 'stock').filter(stock => stock.warehouseId === filters.warehouseId && (!filters.onlyWithQuantity || Number(stock.quantity) > 0))
    .map(stock => ({ stock, details: stockDetails(rows, stock) }))
    .filter(({ stock, details }) => !query || [...Object.values(details), stock.chargeNo].some(value => String(value ?? '').toLowerCase().includes(query)))
    .sort((a, b) => a.details.materialNo.localeCompare(b.details.materialNo) || String(a.stock.chargeNo || '').localeCompare(String(b.stock.chargeNo || '')));
}

/** The movements of one inventory line: the same material and charge in the same storehouse. */
export function inventoryLog(rows: Record<string, Row[]>, stock: Row) {
  const identity = materialIdentity(stock);
  return (rows.movements || []).filter(move => move.warehouseId === stock.warehouseId && materialIdentity(move) === identity && String(move.chargeNo || '') === String(stock.chargeNo || ''))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b._createdAt).localeCompare(String(a._createdAt)));
}

export interface Holding { siteId: string; identity: string; materialId: string; customMaterialId: string; chargeNo: string; quantity: number; }
/**
 * Material a storehouse has handed to a main project and that was not returned. Derived from the movements
 * (the warehouse side is signed: a project transfer is negative, a return positive), so there is one source of truth.
 */
export function projectHoldings(rows: Record<string, Row[]>): Holding[] {
  const holdings = new Map<string, Holding>();
  for (const move of rows.movements || []) {
    if (!['Project transfer', 'Project return'].includes(String(move.type)) || !move.siteId) continue;
    const identity = materialIdentity(move), chargeNo = String(move.chargeNo || '');
    const key = `${move.siteId}|${identity}|${chargeNo}`;
    const entry = holdings.get(key) || { siteId: String(move.siteId), identity, materialId: String(move.materialId || ''), customMaterialId: String(move.customMaterialId || ''), chargeNo, quantity: 0 };
    entry.quantity = round6(entry.quantity - Number(move.quantity));
    holdings.set(key, entry);
  }
  return [...holdings.values()].filter(entry => entry.quantity > 0);
}

/**
 * Per material identity (and charge): quantity on hand in every storehouse plus quantity held by projects.
 * Transfers, moves, returns and transfer orders never change these totals; only receipts, issues, adjustments
 * and removals do.
 */
export function conservedTotals(rows: Record<string, Row[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  const add = (key: string, quantity: number) => { totals[key] = round6((totals[key] || 0) + quantity); };
  for (const stock of live(rows, 'stock')) add(`${materialIdentity(stock)}|${stock.chargeNo || ''}`, Number(stock.quantity));
  for (const holding of projectHoldings(rows)) add(`${holding.identity}|${holding.chargeNo}`, holding.quantity);
  return totals;
}

export const MATERIALS_LIST_COLUMNS = [
  { key: 'project', label: 'Project' }, { key: 'iso', label: 'Iso number' }, { key: 'chemicalClean', label: 'Ch.clean' }, { key: 'group', label: 'Group' },
  { key: 'materialNo', label: 'Mat.no.' }, { key: 'description', label: 'Description' }, { key: 'quantity', label: 'Qty.', type: 'number' as const },
  { key: 'ordered', label: 'Ord.?' }, { key: 'inventory', label: 'Inv.', type: 'number' as const }, { key: 'picked', label: 'Picked', type: 'number' as const },
];
export interface MaterialsListFilters { siteId?: string; projectId?: string; isoId?: string; query?: string; }
/**
 * Ord.? says whether the requirement is covered by orders (Yes / Partly / No); Inv. is the quantity in every
 * storehouse (the stock is not reserved per isometric); Picked is the quantity issued to the isometric.
 */
export const orderedState = (required: number, ordered: number) => ordered >= required && required > 0 ? 'Yes' : ordered > 0 ? 'Partly' : 'No';
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
    .filter(row => !query || Object.values(row.values).some(value => String(value).toLowerCase().includes(query)))
    .sort((a, b) => String(a.values.project).localeCompare(String(b.values.project)) || String(a.values.iso).localeCompare(String(b.values.iso)) || String(a.values.materialNo).localeCompare(String(b.values.materialNo)));
}

// ---- Resources ----------------------------------------------------------------------------------------------

const t = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', ...extra });
const ref = (name: string, label: string, target: string, extra: Partial<Field> = {}): Field => t(name, label, { type: 'ref', ref: target, ...extra });
const sel = (name: string, label: string, options: readonly string[], extra: Partial<Field> = {}): Field => t(name, label, { type: 'select', options: [...options], ...extra });

/** Adds the fields and the two resources of this flow to the registry (called once from shared/resources.ts). */
export function applyMtoStock(resources: Resource[]) {
  const find = (key: string) => resources.find(resource => resource.key === key)!;
  const warehouses = find('warehouses');
  warehouses.fields.push(t('description', 'Description', { type: 'textarea', section: 'Notes' }));
  warehouses.columns = ['name', 'address', 'residence', 'phone', 'description', 'siteId', 'use'];
  find('stock').fields.push(
    t('materialGroup', 'Material group'), t('articleNo', 'Article number'), t('uom', 'Unit of measure'), t('description', 'Description'), t('dia', 'Diameter'), t('lbs', 'LBS / schedule'),
    t('corrected', 'Corrected entry', { type: 'checkbox', default: false, hint: 'The wording above was corrected and replaces the catalog wording.' }),
  );
  const movements = find('movements');
  movements.fields.find(field => field.name === 'type')!.options!.push(...MOVEMENT_TYPES);
  movements.fields.push(ref('siteId', 'Project site', 'sites'), sel('reason', 'Reason', CORRECTION_REASONS), t('reasonText', 'Reason text'), t('transferOrder', 'Transfer order'));
  resources.push({
    key: 'transfer_orders', title: 'Transfer orders', singular: 'transfer order', module: 'materials', group: 'Order & inventory', readonly: true, display: 'number',
    description: 'Planned moves of material between storehouses and projects. Completing an order applies its movements.',
    fields: [t('number', 'Transfer order'), sel('type', 'Type', TRANSFER_TYPES, { required: true }), sel('priority', 'Priority', TRANSFER_PRIORITIES, { default: 'Normal' }), sel('status', 'Status', TRANSFER_STATUSES, { default: 'Open' }),
      ref('fromWarehouseId', 'From storehouse', 'warehouses'), ref('siteId', 'Project site', 'sites', { hint: 'Target project of a transfer; source project of a return.' }), ref('toWarehouseId', 'To storehouse', 'warehouses'),
      t('date', 'Date', { type: 'date' }), t('completedDate', 'Completed on', { type: 'date' }), t('notes', 'Notes', { type: 'textarea', section: 'Notes' })],
    columns: ['number', 'type', 'priority', 'status', 'fromWarehouseId', 'siteId', 'toWarehouseId', 'date'],
  });
  resources.push({
    key: 'transfer_order_items', title: 'Transfer order items', singular: 'transfer order item', module: 'materials', group: 'Order & inventory', readonly: true, display: 'materialNo',
    description: 'The materials and quantities of a transfer order.',
    fields: [ref('orderId', 'Transfer order', 'transfer_orders', { required: true }), t('materialNo', 'Material no.', { required: true }), t('description', 'Description'),
      t('quantity', 'Quantity', { type: 'number', min: MIN_QUANTITY, step: 0.01, required: true }), t('uom', 'UOM'), t('stockId', 'Inventory line', { hidden: true })],
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
const stockField = field('stockId', 'Inventory line', 'ref', { ref: 'stock', required: true });
const itemsField = (label: string) => field('items', label, 'text', { hidden: true });
const allField = field('all', 'All', 'checkbox', { default: false, hint: 'Take the whole quantity.' });
const reasonText = (required: boolean) => field('reasonText', 'Reason text', 'textarea', { required });

const defs: ActionDefinition[] = [];
const add = (key: string, title: string, description: string, fields: ActionField[], submit = title) => defs.push({ key, title, module: 'materials', description, fields, submit });
add('stock-add', 'Add material from DB', 'Put a catalog material into a storehouse, with its charge number and starting quantity.', [field('warehouseId', 'Storehouse', 'ref', { ref: 'warehouses', required: true }), field('materialId', 'Material', 'ref', { ref: 'materials', required: true }), field('chargeNo', 'Charge / heat number', 'text'), quantity(), dateField, noteField], 'Add to inventory');
add('stock-to-project', 'Transfer to project', 'Hand the quantities to a main project. The storehouse balance decreases by the same amount the project receives.', [field('siteId', 'To project site', 'ref', { ref: 'sites', required: true }), itemsField('Materials'), dateField, noteField], 'Transfer');
add('stock-move', 'Move to storehouse', 'Move a quantity (or all of it) to another storehouse. Both balances change together.', [stockField, field('toWarehouseId', 'To storehouse', 'ref', { ref: 'warehouses', required: true }), quantity({ required: false }), allField, dateField, noteField], 'Move');
add('stock-return', 'Return to inventory', 'Take material that a project holds back into this inventory line.', [stockField, field('siteId', 'From project site', 'ref', { ref: 'sites', required: true }), quantity({ required: false }), allField, dateField, noteField], 'Return');
add('stock-correct', 'Correct entry', 'Fix the wording of an inventory line. A reason is required and the change is logged.', [stockField,
  field('materialGroup', 'Material group', 'text', { required: true }), field('articleNo', 'Article no', 'text'), field('uom', 'UOM', 'text', { required: true }), field('description', 'Description', 'textarea', { required: true }), field('dia', 'DIA', 'text'), field('lbs', 'LBS / SCH', 'text'),
  field('reason', 'Reason', 'select', { options: [...CORRECTION_REASONS], required: true }), reasonText(false), field('chargeNo', 'Certificate charge', 'text'), dateField], 'Save correction');
add('stock-adjust', 'Adjust quantity', 'Set the counted quantity of an inventory line. The difference is logged with your reason.', [stockField, field('quantity', 'New quantity', 'number', { min: 0, step: 0.01, required: true }), reasonText(true), dateField], 'Adjust');
add('stock-remove', 'Remove from inventory', 'Take the line out of the inventory, for example because it was imported by mistake. Any remaining quantity is written off.', [stockField, reasonText(true), noteField, dateField], 'Remove');
add('transfer-order-create', 'New transfer order', 'Plan a move between storehouses and projects. Nothing moves until the order is completed.', [field('type', 'Type', 'select', { options: [...TRANSFER_TYPES], required: true }), field('priority', 'Priority', 'select', { options: [...TRANSFER_PRIORITIES], default: 'Normal' }),
  field('fromWarehouseId', 'From storehouse', 'ref', { ref: 'warehouses' }), field('siteId', 'To project site', 'ref', { ref: 'sites' }), field('toWarehouseId', 'To storehouse', 'ref', { ref: 'warehouses' }), field('notes', 'Notes', 'textarea'), itemsField('Items'), dateField], 'Create transfer order');
add('transfer-order-complete', 'Complete transfer order', 'Apply the movements of the order. If any item is short the whole order stays open.', [field('orderId', 'Transfer order', 'ref', { ref: 'transfer_orders', required: true }), dateField, noteField], 'Complete');
add('transfer-order-cancel', 'Cancel transfer order', 'Cancel an open order. No stock moves.', [field('orderId', 'Transfer order', 'ref', { ref: 'transfer_orders', required: true }), noteField], 'Cancel order');
export const MTO_STOCK_ACTIONS = defs;
export const isMtoStockAction = (key: string) => defs.some(def => def.key === key);
/** Permission area and verb of each action (area 16 "Material inventory": view, add, archive). */
export const MTO_STOCK_ACTION_SCOPES: Record<string, [string, 'insert' | 'edit' | 'delete']> = {
  'stock-add': ['16', 'insert'], 'stock-to-project': ['16', 'insert'], 'stock-move': ['16', 'insert'], 'stock-return': ['16', 'insert'], 'stock-correct': ['16', 'insert'], 'stock-adjust': ['16', 'insert'],
  'stock-remove': ['16', 'delete'], 'transfer-order-create': ['16', 'insert'], 'transfer-order-complete': ['16', 'insert'], 'transfer-order-cancel': ['16', 'insert'],
};

// ---- Delivery to the hosted profile -------------------------------------------------------------------------

const names = (key: string, resources: Resource[]) => resources.find(resource => resource.key === key)!.fields.map(f => f.name);
/**
 * Delivers storehouses, inventory and transfer orders to a profile. Movements and transfer order items have no
 * page of their own (the inventory log and the order dialog read them), so they are delivered as data only.
 */
export function deliverMtoStock(availability: Availability, resources: Resource[], deliver: (availability: Availability, key: string, names?: string[]) => void) {
  deliver(availability, 'warehouses', ['name', 'address', 'zip', 'residence', 'phone', 'email', 'description']);
  deliver(availability, 'stock');
  deliver(availability, 'transfer_orders');
  for (const key of ['movements', 'transfer_order_items']) availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...names(key, resources)])];
  for (const def of defs) availability.actions[def.key] = def.fields.map(f => f.name);
}
