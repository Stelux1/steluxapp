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
/** The reference's statuses are not known: an order is open until it is completed (movements applied) or cancelled. */
export const TRANSFER_STATUSES = ['Open', 'Completed', 'Cancelled'] as const;
export const CORRECTION_REASONS = ['Import error', 'Name correction', 'Other'] as const;
/** Movement types this flow adds to the existing receipt / issue / transfer / adjustment types. */
export const MOVEMENT_TYPES = ['Project transfer', 'Project return', 'Correction', 'Removal', 'Return to inventory'] as const;
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
export interface MaterialsListFilters { siteId?: string; projectId?: string; isoId?: string; query?: string; }
/**
 * Ord.? says whether the requirement is covered by orders (Yes / Partly / No); Inv. is what the isometric's project
 * site holds in its Material inventory and no pick list claims yet; Picked is the quantity issued to the isometric.
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
  // Add storehouse (reference #addLager): Name, Location, Description.
  warehouses.fields.splice(1, 0, t('location', 'Location'));
  warehouses.fields.push(t('description', 'Description', { type: 'textarea', section: 'Notes' }));
  warehouses.columns = ['name', 'location', 'address', 'residence', 'phone', 'description', 'siteId', 'use'];
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
  movements.fields.push(ref('siteId', 'Project site', 'sites'), sel('reason', 'Reason', CORRECTION_REASONS), t('reasonText', 'Reason text'), t('transferOrder', 'Transfer order'));
  // Pick-list lines and reservations name the project site whose inventory they draw on.
  find('picklists').fields.push(ref('siteId', 'Project site', 'sites', { hidden: true }));
  find('reservations').fields.push(ref('siteId', 'Project site', 'sites', { hidden: true }));
  resources.push({
    key: 'transfer_orders', title: 'Transfer orders', singular: 'transfer order', module: 'materials', group: 'Order & inventory', readonly: true, display: 'number',
    description: 'Planned moves of material between project site inventories and storehouses. Completing an order applies its movements.',
    fields: [t('number', 'Transfer order'), sel('type', 'Type', TRANSFER_TYPES, { required: true }), sel('priority', 'Priority', TRANSFER_PRIORITIES, { default: 'Normal' }), sel('status', 'Status', TRANSFER_STATUSES, { default: 'Open' }),
      ref('fromWarehouseId', 'From storehouse', 'warehouses'), ref('fromSiteId', 'From project site', 'sites', { hint: 'The project site whose inventory the order takes from.' }), ref('siteId', 'Project site', 'sites', { hint: 'The project site whose inventory receives the material.' }), ref('toWarehouseId', 'To storehouse', 'warehouses'),
      t('date', 'Date', { type: 'date' }), t('completedDate', 'Completed on', { type: 'date' }), t('notes', 'Notes', { type: 'textarea', section: 'Notes' })],
    columns: ['number', 'type', 'priority', 'status', 'fromWarehouseId', 'fromSiteId', 'siteId', 'toWarehouseId', 'date'],
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
const stockField = field('stockId', 'Storehouse line', 'ref', { ref: 'stock', required: true });
const siteField = (label: string, extra: Partial<ActionField> = {}) => field('siteId', label, 'ref', { ref: 'sites', required: true, ...extra });
const itemsField = (label: string) => field('items', label, 'text', { hidden: true });
const allField = (label: string) => field('all', label, 'checkbox', { default: false, hint: 'Take the whole quantity.' });
const reasonText = (required: boolean) => field('reasonText', 'Reason text', 'textarea', { required });

const defs: ActionDefinition[] = [];
const add = (key: string, title: string, description: string, fields: ActionField[], submit = title) => defs.push({ key, title, module: 'materials', description, fields, submit });
// Material inventory of the active project site (area 16).
add('stock-add', 'Add material from DB', 'Put a catalog material into the Material inventory of the project site.', [siteField('Project site', { hidden: true }), field('materialId', 'Material', 'ref', { ref: 'materials', required: true }), field('chargeNo', 'Charge / heat number', 'text'), quantity(), dateField, noteField], 'Add to inventory');
add('inventory-remove', 'Remove material from inventory', 'Take a quantity of one Material No out of the project site’s inventory. The comment is logged.', [siteField('Project site', { hidden: true }), field('materialId', 'Material', 'ref', { ref: 'materials' }), field('customMaterialId', 'Custom material', 'ref', { ref: 'custom_materials', hidden: true }), quantity(), field('comment', 'Comment', 'text', { required: true }), dateField], 'Remove');
// Storehouse lines (area 75).
add('stock-to-project', 'Transfer material from storehouse to project', 'Move storehouse material into the Material inventory of a project site, with the chosen certificates.', [siteField('Destination project site'), itemsField('Materials'), dateField, noteField], 'Transfer');
add('stock-move', 'Move to other storehouse', 'Move a quantity (or all of it) to another storehouse. Both balances change together.', [stockField, field('toWarehouseId', 'Destination storehouse', 'ref', { ref: 'warehouses', required: true }), quantity({ required: false }), allField('Move all'), dateField, noteField], 'Move');
add('stock-return', 'Return to inventory', 'Move storehouse material back into the Material inventory of the project site.', [stockField, siteField('Project site', { hidden: true }), quantity({ label: 'Quantity to return', required: false }), allField('Return all'), dateField, noteField], 'Return');
add('stock-correct', 'Correct entry', 'Fix the wording of a storehouse line. A reason is required and the change is logged.', [stockField,
  field('materialGroup', 'Material group', 'text', { required: true }), field('articleNo', 'Article no', 'text'), field('uom', 'UOM', 'text', { required: true }), field('description', 'Description', 'textarea', { required: true }), field('dia', 'DIA', 'text'), field('lbs', 'LBS / SCH', 'text'),
  field('reason', 'Reason', 'select', { options: [...CORRECTION_REASONS], required: true }), reasonText(false), field('chargeNo', 'Certificate charge', 'text'), dateField], 'Save correction');
add('stock-adjust', 'Adjust quantity', 'Set the counted quantity of a storehouse line. The difference is logged with your reason.', [stockField, field('quantity', 'New quantity', 'number', { min: 0, step: 0.01, required: true }), reasonText(true), dateField], 'Adjust');
add('stock-remove', 'Remove from storehouse', 'Take the line out of the storehouse, for example because it was imported by mistake. Any remaining quantity is written off.', [stockField, reasonText(true), noteField, dateField], 'Remove');
// Transfer orders (area 16).
add('transfer-order-create', 'New Transfer Order', 'Plan a move between project site inventories and storehouses. Nothing moves until the order is completed.', [field('type', 'Type', 'select', { options: [...TRANSFER_TYPES], required: true }), field('priority', 'Priority', 'select', { options: [...TRANSFER_PRIORITIES], default: 'Normal' }),
  field('fromWarehouseId', 'From storehouse', 'ref', { ref: 'warehouses' }), field('fromSiteId', 'From project site', 'ref', { ref: 'sites', hidden: true }), field('siteId', 'To project site', 'ref', { ref: 'sites' }), field('toWarehouseId', 'To storehouse', 'ref', { ref: 'warehouses' }), field('notes', 'Notes (optional)', 'textarea'), itemsField('Order items'), dateField], 'New Transfer Order');
add('transfer-order-complete', 'Complete transfer order', 'Apply the movements of the order. If any item is short the whole order stays open.', [field('orderId', 'Transfer order', 'ref', { ref: 'transfer_orders', required: true }), dateField, noteField], 'Complete');
add('transfer-order-cancel', 'Cancel transfer order', 'Cancel an open order. No stock moves.', [field('orderId', 'Transfer order', 'ref', { ref: 'transfer_orders', required: true }), noteField], 'Cancel order');
export const MTO_STOCK_ACTIONS = defs;
export const isMtoStockAction = (key: string) => defs.some(def => def.key === key);
/** The actions on storehouse lines: they are run from the Storehouses page of MTO Pilot. */
export const STOREHOUSE_ACTIONS = ['stock-to-project', 'stock-move', 'stock-return', 'stock-correct', 'stock-adjust', 'stock-remove'];
/**
 * Permission area and verb of each action. Inventory operations sit with "Material inventory" (16: show, insert,
 * delete, export, import), the storehouse-line operations with "Storehouses" (75: show, insert, edit, delete, …).
 * Transfer orders are requested from the inventory (16 insert); which right confirms one is not known (finding
 * mto-procurement-stock-009), so completing and cancelling keep the inventory's add right.
 */
export const MTO_STOCK_ACTION_SCOPES: Record<string, [string, 'insert' | 'edit' | 'delete']> = {
  'stock-add': ['16', 'insert'], 'inventory-remove': ['16', 'delete'],
  'stock-to-project': ['75', 'insert'], 'stock-move': ['75', 'insert'], 'stock-return': ['75', 'insert'], 'stock-correct': ['75', 'edit'], 'stock-adjust': ['75', 'edit'], 'stock-remove': ['75', 'delete'],
  'transfer-order-create': ['16', 'insert'], 'transfer-order-complete': ['16', 'insert'], 'transfer-order-cancel': ['16', 'insert'],
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
