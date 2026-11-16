import type { Availability, Row } from './types.ts';
import type { ProgressBudgets, QuantityKey, QuantityPhase } from './iso-status.ts';
import { materialIdentity, materialRecord, requirementExecution } from './materials.ts';
import { isoStatuses } from './mto-logistics.ts';

/**
 * MTO materials on an isometric: validation of the add-material forms, the Ord.? / Inv. / Picked columns, the
 * material status of an isometric and the MTO budgets of the progress drivers. Pure functions over plain rows
 * (collections keyed by resource, like `requirementExecution`), shared by the client and the server.
 */
type Rows = Record<string, Row[]>;
const live = (rows: Rows, key: string) => (rows[key] || []).filter(row => !row._archived);
const text = (value: unknown) => String(value ?? '').trim();
const round = (value: number) => Math.round(value * 1e6) / 1e6;

// ----- progress class and operation-phase location ----------------------------------------------------------------

export const PROGRESS_CLASSES = ['Pipe', 'Supports', 'Appendages'] as const;
export type ProgressClass = typeof PROGRESS_CLASSES[number];
/** The progress driver each class feeds. */
export const PROGRESS_CLASS_DRIVER: Record<ProgressClass, QuantityKey> = { Pipe: 'materialPipe', Supports: 'supports', Appendages: 'appendages' };

/** The class of a requirement line, taken from its material (catalog, custom or inline). Empty when the material has none. */
export function progressClassOf(rows: Rows, requirement: Row): ProgressClass | undefined {
  // A custom line carries its own class (its identity record in custom_materials only snapshots it).
  const source = requirement.customMaterial && !requirement.materialId ? requirement : materialRecord(rows, requirement);
  const value = text(source?.progressClass);
  return (PROGRESS_CLASSES as readonly string[]).includes(value) ? value as ProgressClass : undefined;
}

/**
 * Whether materials of an operation phase count toward the Shop or the Field budget. Inferred, because the
 * reference only shows phase names: an explicit "Progress location" on the phase wins; otherwise a phase whose
 * name contains the word Shop or Field (not both) is used accordingly ("Support Shop" is Shop, "Hydrotest field"
 * is Field). Any other phase ("Valves", "Support WS") belongs to neither budget.
 */
export function phaseLocation(phase?: Row): QuantityPhase | undefined {
  if (!phase) return undefined;
  const explicit = text(phase.progressLocation);
  if (explicit === 'Shop') return 'shop';
  if (explicit === 'Field') return 'field';
  const words = text(phase.name).toLowerCase().split(/[^a-z]+/);
  const shop = words.includes('shop'), field = words.includes('field');
  return shop === field ? undefined : shop ? 'shop' : 'field';
}

/**
 * Budgets of the progress drivers of an isometric: the quantity of its requirement lines whose material has a
 * progress class, split by the Shop / Field location of the line's operation phase. Quantities are summed as
 * entered (no unit conversion). Lines without a class, without a Shop / Field phase or without quantity count
 * for nothing. Undefined while no line produces a budget (the drivers then stay out of scope), and without rows.
 */
export function isoBudgets(isometric: Row, rows?: Rows): ProgressBudgets | undefined {
  if (!rows) return undefined;
  const phases = new Map(live(rows, 'operation_phases').map(phase => [phase.id, phase]));
  const budgets: ProgressBudgets = {};
  for (const line of live(rows, 'iso_materials').filter(line => line.isoId === isometric.id)) {
    const quantity = Number(line.quantity), cls = progressClassOf(rows, line), location = phaseLocation(phases.get(String(line.phaseId)));
    if (!cls || !location || !(quantity > 0)) continue;
    const driver = PROGRESS_CLASS_DRIVER[cls], phase = budgets[location] ||= {};
    phase[driver] = round((phase[driver] || 0) + quantity);
  }
  return Object.keys(budgets).length ? budgets : undefined;
}

// ----- coverage ---------------------------------------------------------------------------------------------------

/**
 * Ord.? / Inv. / Picked of one requirement line, derived with `requirementExecution()`. `hasOrder` is true while any
 * quantity is ordered for the line (the line cannot be deleted then); `orderId` / `orderNo` name the order it is on.
 */
export interface MaterialLineStatus { requirementId: string; required: number; ordered: number; /** Fully ordered (Ord.? = Yes). */ isOrdered: boolean; inventory: number; picked: number; hasOrder: boolean; orderId: string; orderNo: string; }
/** The order (not cancelled) a requirement is on: the one its own order line links to, else the first order of its material in its project. */
function orderOf(rows: Rows, entry: ReturnType<typeof requirementExecution>[number]): Row | undefined {
  const orders = new Map(live(rows, 'orders').filter(order => order.status !== 'Cancelled').map(order => [order.id, order]));
  const lines = live(rows, 'order_lines').filter(line => orders.has(String(line.orderId)));
  const linked = lines.filter(line => line.requirementId === entry.requirement.id && materialIdentity(line) === entry.identity);
  const own = linked.length ? linked : lines.filter(line => !line.requirementId && materialIdentity(line) === entry.identity && text(orders.get(String(line.orderId))?.projectId) === text(entry.iso.projectId));
  return own.map(line => orders.get(String(line.orderId))!).sort((a, b) => text(a.date).localeCompare(text(b.date)) || text(a._createdAt).localeCompare(text(b._createdAt)))[0];
}
export function materialLineStatuses(rows: Rows, isoId: string): Map<string, MaterialLineStatus> {
  return new Map(requirementExecution(rows, { isoId }).map(entry => {
    const order = entry.ordered > 0 ? orderOf(rows, entry) : undefined;
    return [entry.requirement.id, { requirementId: entry.requirement.id, required: entry.required, ordered: entry.ordered, isOrdered: entry.toOrder <= 0, inventory: entry.inventory, picked: entry.picked, hasOrder: entry.ordered > 0, orderId: order?.id ?? '', orderNo: text(order?.number) }];
  }));
}

// ----- display helpers of the Materials panel -------------------------------------------------------------------------

/** Material status as the reference shows it: a whole percent ("49%"), or the word "Empty" when the isometric has no material lines. */
export const formatMaterialStatus = (percent: number | null | undefined) => percent === null || percent === undefined ? 'Empty' : `${Math.floor(percent)}%`;
const figure = (value: number) => String(Math.round(value * 1000) / 1000);
/** Tooltip of the Inv. truck: "Ord. <ordered on this line> | Inv. <stock>" on an ordered line, "Need <Qty.> | Have <stock>" otherwise. */
export const inventoryTooltip = (line: Pick<MaterialLineStatus, 'hasOrder' | 'ordered' | 'inventory' | 'required'>) => line.hasOrder ? `Ord. ${figure(line.ordered)} | Inv. ${figure(line.inventory)}` : `Need ${figure(line.required)} | Have ${figure(line.inventory)}`;
/** Colour of the Inv. truck: green = ordered and fully in stock, orange = partly in stock, red = no stock or not ordered (vendor manual 3-22). */
export const inventoryLevel = (line: Pick<MaterialLineStatus, 'hasOrder' | 'inventory' | 'required'>): 'green' | 'orange' | 'red' => !line.hasOrder || !(line.inventory > 0) ? 'red' : line.inventory >= line.required ? 'green' : 'orange';
/** The refusal of Delete for a line that has an order (the reference shows its trash button disabled). */
export const ORDERED_LINE_REFUSAL = 'A material that is ordered cannot be deleted.';
export const isoMaterialDeleteRefusal = (line: Pick<MaterialLineStatus, 'hasOrder'> | undefined) => line?.hasOrder ? ORDERED_LINE_REFUSAL : '';

/** Wording of the Materials dialogs of the reference: Add material (button Add) and Set type (placeholder Type, button Update). */
export const ADD_MATERIAL_DIALOG = { title: 'Add material', submit: 'Add', quantityMin: 0.01 } as const;
export const SET_TYPE_DIALOG = { title: 'Set type', placeholder: 'Type', submit: 'Update' } as const;

/** ISO revisions of an isometric, newest first. */
export function isoRevisions(rows: Rows, isoId: string): Row[] {
  return live(rows, 'revisions').filter(row => row.type === 'ISO' && row.isoId === isoId).sort((a, b) => text(b._createdAt).localeCompare(text(a._createdAt)) || Number(b.revNo) - Number(a.revNo));
}
/** "Revision 2.00 comment" as the Revision selects of the reference read. */
export const revisionLabel = (revision: Row) => `Revision ${text(revision.revNo)}${text(revision.comment) ? ` ${text(revision.comment)}` : ''}`;

/** The materials of a material group in the order of the material database, labelled "<Material No> <description>". */
export function materialsOfGroup(materials: Row[], group: string): { id: string; label: string }[] {
  return materials.filter(row => !row._archived && text(row.materialGroup) === group).map(row => ({ id: row.id, label: `${text(row.materialNo)} ${text(row.description)}`.trim() }));
}
/** Charge numbers that contain the typed Material No ("Auto fill" searches the list; everything stays listed for an empty term). */
export function chargeNumberOptions(chargeNumbers: string[], term: string): string[] {
  const query = term.trim().toLowerCase();
  return [...new Set(chargeNumbers.map(text).filter(Boolean))].filter(value => !query || value.toLowerCase().includes(query));
}

/** Page sizes and the first page size of the Materials table (reference: 10 / 25 / 50 / 100, 25). */
export const ISO_MATERIAL_PAGE_SIZES = [10, 25, 50, 100];
export const ISO_MATERIAL_PAGE_SIZE = 25;
/** Rows of the Materials table: by Type, searched over every shown column, Picked ascending first (then the material number). */
export function listIsoMaterials(lines: Row[], rows: Rows, statuses: Map<string, MaterialLineStatus>, options: { phaseId?: string; query?: string }): Row[] {
  const query = (options.query || '').trim().toLowerCase(), phases = new Map(live(rows, 'operation_phases').map(phase => [phase.id, text(phase.name)]));
  const shown = (line: Row) => { const material = materialRecord(rows, line) || line, state = statuses.get(line.id); return [material.materialGroup, material.materialNo, material.dia, material.lbs, material.description, phases.get(text(line.phaseId)), line.quantity, material.uom, state ? (state.hasOrder ? 'Yes' : 'No') : '', state?.picked].map(text).join('\n').toLowerCase(); };
  return lines.filter(line => (!options.phaseId || line.phaseId === options.phaseId) && (!query || shown(line).includes(query)))
    .sort((a, b) => (statuses.get(a.id)?.picked ?? 0) - (statuses.get(b.id)?.picked ?? 0) || text((materialRecord(rows, a) || a).materialNo).localeCompare(text((materialRecord(rows, b) || b).materialNo), 'en', { numeric: true }) || a.id.localeCompare(b.id));
}

/** The "Details" of the Inv. truck: the line's order and what arrived on it, with the receipts of that order. */
export interface OrderDetails {
  materialNo: string; description: string;
  /** '-' when the line has no order. */
  orderNo: string; orderId: string; orderDate: string;
  orderedOnIso: number; orderedInOrder: number; /** "Ordered in this order" is shown only when it differs from "Ordered on this ISO". */ showOrderedInOrder: boolean;
  receivedInOrder: number; inventory: number;
  history: { id: string; date: string; orderNo: string; quantity: number; supplierId: string; action: 'Receipt' | 'Correction' }[];
}
export function orderDetails(rows: Rows, requirementId: string): OrderDetails | undefined {
  const requirement = live(rows, 'iso_materials').find(line => line.id === requirementId);
  if (!requirement) return undefined;
  const entry = requirementExecution(rows, { isoId: text(requirement.isoId) }).find(item => item.requirement.id === requirementId);
  if (!entry) return undefined;
  const status = materialLineStatuses(rows, text(requirement.isoId)).get(requirementId)!;
  const order = status.orderId ? live(rows, 'orders').find(item => item.id === status.orderId) : undefined;
  const sameMaterial = (line: Row) => materialIdentity(line) === entry.identity;
  const orderedInOrder = order ? round(live(rows, 'order_lines').filter(line => line.orderId === order.id && sameMaterial(line)).reduce((sum, line) => sum + Number(line.quantity), 0)) : 0;
  const receipts = order ? live(rows, 'receipts').filter(receipt => receipt.orderId === order.id && sameMaterial(receipt)) : [];
  const material = entry.material;
  return {
    materialNo: text(material.materialNo), description: text(material.description), orderNo: order ? text(order.number) : '-', orderId: order?.id ?? '', orderDate: order ? text(order.date) : '',
    orderedOnIso: status.ordered, orderedInOrder, showOrderedInOrder: round(orderedInOrder) !== round(status.ordered),
    receivedInOrder: round(receipts.reduce((sum, receipt) => sum + Number(receipt.quantity), 0)), inventory: status.inventory,
    history: receipts.sort((a, b) => text(b.date).localeCompare(text(a.date)) || text(b._createdAt).localeCompare(text(a._createdAt))).map(receipt => ({ id: receipt.id, date: text(receipt.date), orderNo: text(order?.number), quantity: Number(receipt.quantity), supplierId: text(receipt.supplierId), action: Number(receipt.quantity) < 0 || receipt.correction ? 'Correction' as const : 'Receipt' as const })),
  };
}

/** What the "Material status per revision" dialog says while no quantity change is linked to an ISO revision. */
export const NO_REVISION_CHANGES = 'No revision-linked material changes yet.';
/**
 * Material status per revision of an isometric: for each ISO revision (newest first) the quantity changes booked against it.
 * Empty while none exists. The reference shows only the empty state (the filled layout is our default, see PARITY.md).
 */
export interface RevisionChange { requirementId: string; materialNo: string; description: string; /** Quantity taken off the line (positive). */ removed: number; date: string }
export function materialStatusByRevision(rows: Rows, isoId: string): { revisionId: string; revNo: string; comment: string; changes: RevisionChange[] }[] {
  const lines = new Map(live(rows, 'iso_materials').filter(line => line.isoId === isoId).map(line => [line.id, line]));
  const result = new Map<string, { revisionId: string; revNo: string; comment: string; changes: RevisionChange[] }>();
  for (const change of live(rows, 'material_quantity_changes').sort((a, b) => Number(a.sequence) - Number(b.sequence))) {
    const line = lines.get(text(change.requirementId)), revision = change.revisionId ? live(rows, 'revisions').find(item => item.id === change.revisionId) : undefined;
    if (!line || !revision) continue;
    const material = materialRecord(rows, line) || line;
    const group = result.get(revision.id) || { revisionId: revision.id, revNo: text(revision.revNo), comment: text(revision.comment), changes: [] };
    group.changes.push({ requirementId: line.id, materialNo: text(material.materialNo), description: text(material.description), removed: round(-Number(change.quantity)), date: text(change.date) });
    result.set(revision.id, group);
  }
  const order = isoRevisions(rows, isoId).map(revision => revision.id);
  return [...result.values()].sort((a, b) => order.indexOf(a.revisionId) - order.indexOf(b.revisionId));
}

export interface MaterialStatus {
  required: number; covered: number;
  /** Covered ÷ required in whole percent, rounded down (49.9 → 49); null while the isometric requires nothing. */
  percent: number | null;
  lines: { requirementId: string; required: number; covered: number }[];
}
/**
 * Material status of an isometric: the one figure of the isometric header, its Materials panel and the Isometric
 * execution page. It is `isoStatuses()` of shared/mto-logistics.ts for this isometric (formula there): a line is
 * covered by min(Qty., picked + own untaken pick list + own reservations + free stock of its project site's Material
 * inventory), and the percentage is Σ covered ÷ Σ Qty., rounded down.
 */
export function materialStatus(isometric: Row, rows: Rows): MaterialStatus {
  const status = isoStatuses(rows, { isoId: text(isometric.id) }).get(text(isometric.id));
  const lines = (status?.lines || []).map(line => ({ requirementId: line.requirement.id, required: line.required, covered: line.covered }));
  const { required, covered } = materialCoverage((status?.lines || []).map(line => ({ required: line.required, picked: line.picked + line.claimed, available: line.available })));
  return { required, covered, percent: status ? status.percent : null, lines };
}

/** One requirement line as the coverage rule sees it: what is required, what was picked, and what is available for it. */
export interface CoverageLine { required: number; picked: number; available: number }
/** The covered quantity of one line: min(required, picked + available), never below zero. */
export const coveredQuantity = (line: CoverageLine) => round(Math.min(Math.max(0, line.required), Math.max(0, line.picked) + Math.max(0, line.available)));
/**
 * The single material-coverage rule of the MTO Pilot: covered and required summed over the lines. `isoStatuses()`
 * (shared/mto-logistics.ts) feeds it for the isometric header, its Materials panel and the Isometric execution page.
 */
export function materialCoverage(lines: CoverageLine[]): { required: number; covered: number } {
  return { required: round(lines.reduce((sum, line) => sum + Math.max(0, line.required), 0)), covered: round(lines.reduce((sum, line) => sum + coveredQuantity(line), 0)) };
}
/** Coverage in whole percent, rounded DOWN so 100 % means complete (the Isometric execution bands). Null when nothing is required. */
export function materialStatusPercent(lines: CoverageLine[]): number | null {
  const { required, covered } = materialCoverage(lines);
  return required > 0 ? Math.min(100, Math.floor(round(covered / required * 100))) : null;
}

// ----- input checks used by the add-material forms and by the server -------------------------------------------------

export interface MaterialInputOptions {
  /** The material group is required (always in the form; on the server only for a material that enters the catalog). */
  requireGroup?: boolean;
  /** Pilots: a revision of the isometric is required (the form's default is the newest). Set it only while the isometric has ISO revisions. */
  requireRevision?: boolean;
  /** Pilots: the Type (operation phase) is required. */
  requirePhase?: boolean;
  /** Smallest quantity (the reference form: 0.01); above zero when left out. */
  minQuantity?: number;
}
/** The pilots' rules of the Add material forms: Type required, quantity from 0.01 (Revision is required while the isometric has revisions). */
export const PILOT_MATERIAL_RULES = { requirePhase: true, minQuantity: 0.01 } as const;
/**
 * Errors of an isometric material being added, by field name: a catalog material needs a material and a
 * quantity above zero; a custom material needs its number, description, UOM and (when asked) group.
 */
export function isoMaterialInputErrors(input: Record<string, unknown>, options: MaterialInputOptions = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  const quantity = input.quantity, min = options.minQuantity ?? 0;
  if (quantity === '' || quantity === null || quantity === undefined) errors.quantity = 'Enter the quantity.';
  else if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) errors.quantity = 'The quantity must be a number above zero.';
  else if (quantity < min) errors.quantity = `The quantity must be at least ${min}.`;
  if (options.requireRevision && !text(input.revisionId)) errors.revisionId = 'Choose the revision.';
  if (options.requirePhase && !text(input.phaseId)) errors.phaseId = 'Choose the type.';
  if (input.source === 'Catalog') { if (!text(input.materialId)) errors.materialId = 'Choose a material.'; }
  else if (input.source === 'Custom') {
    if (!text(input.materialNo)) errors.materialNo = 'Enter the material number.';
    if (!text(input.description)) errors.description = 'Enter the description.';
    if (!text(input.uom)) errors.uom = 'Choose the unit of measure.';
    if (options.requireGroup && !text(input.materialGroup)) errors.materialGroup = 'Enter the material group.';
    const price = input.price;
    if (price !== '' && price !== null && price !== undefined && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) errors.price = 'The price must be zero or more.';
  } else errors.source = 'Choose a material source.';
  if (text(input.progressClass) && !(PROGRESS_CLASSES as readonly string[]).includes(text(input.progressClass))) errors.progressClass = 'Choose Pipe, Supports or Appendages.';
  return errors;
}

// ----- Import in ISO ------------------------------------------------------------------------------------------------------

/**
 * Columns of the "Import in ISO" Excel template (the reference does not document them: the material import columns plus
 * the line fields, see PARITY.md). `field` is the key of a sheet row after reading.
 */
export const ISO_IMPORT_COLUMNS: { header: string; field: string; aliases?: string[] }[] = [
  { header: 'CC', field: 'componentCode', aliases: ['component code'] },
  { header: 'Group', field: 'materialGroup', aliases: ['material group'] },
  { header: 'Article No', field: 'articleNo' },
  { header: 'Material No', field: 'materialNo' },
  { header: 'Description', field: 'description', aliases: ['material description'] },
  { header: 'DIA', field: 'dia' },
  { header: 'LBS/SCH', field: 'lbs' },
  { header: 'UOM', field: 'uom' },
  { header: 'Qty', field: 'quantity', aliases: ['quantity'] },
  { header: 'Operation phase', field: 'phase', aliases: ['type'] },
  { header: 'Spool', field: 'spool' },
];
export const ISO_IMPORT_EXAMPLES = [['1', 'PIPE CS', '', '7430050581', 'PIPE MET GR.B 80 DN40', 'DN40', '80', 'M', '6', 'Shop', '']];
const heading = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** The import field of a column heading of the sheet (headings are matched without case and punctuation); undefined for an unknown column. */
export const isoImportField = (header: string) => ISO_IMPORT_COLUMNS.find(column => [column.header, ...(column.aliases || [])].some(name => heading(name) === heading(header)))?.field;

export interface IsoImportRow { rowNo: number; values: Record<string, string>; /** The line it becomes: a catalog material of the database, or a custom material. */ source?: 'Catalog' | 'Custom'; materialId?: string; phaseId?: string; uom?: string; quantity?: number; error: Record<string, string> }
/**
 * Check the rows of an import into one isometric against the material database, the UOMs and the operation phases as
 * they are now. A row is valid without errors; the first Type (Shop) and the unit EA stand in for an empty cell.
 */
export function isoImportPreview(input: { rowNo: number; values: Record<string, string> }[], rows: Rows): IsoImportRow[] {
  const materials = live(rows, 'materials'), uoms = live(rows, 'uoms'), phases = live(rows, 'operation_phases');
  const firstPhase = [...phases].sort((a, b) => Number(a.number ?? a.sort ?? 0) - Number(b.number ?? b.sort ?? 0))[0];
  const find = (list: Row[], key: string, value: string) => list.find(item => text(item[key]).toLowerCase() === value.toLowerCase());
  return input.map(({ rowNo, values }) => {
    const error: Record<string, string> = {}, result: IsoImportRow = { rowNo, values, error };
    const materialNo = text(values.materialNo);
    if (!materialNo) error.materialNo = 'Enter the Material No.';
    const quantity = Number(text(values.quantity).replace(',', '.'));
    if (!text(values.quantity)) error.quantity = 'Enter the quantity.';
    else if (!Number.isFinite(quantity) || quantity < 0.01) error.quantity = 'The quantity must be a number of at least 0.01.';
    else result.quantity = Math.round(quantity * 1000) / 1000;
    const uom = text(values.uom) ? find(uoms, 'name', text(values.uom)) : find(uoms, 'name', 'EA');
    if (text(values.uom) && !uom) error.uom = `The unit ${text(values.uom)} does not exist.`;
    else result.uom = uom ? text(uom.name) : text(values.uom) || 'EA';
    const phase = text(values.phase) ? find(phases, 'name', text(values.phase)) : firstPhase;
    if (text(values.phase) && !phase) error.phase = `The type ${text(values.phase)} does not exist.`;
    else if (phase) result.phaseId = phase.id;
    else error.phase = 'The database has no types.';
    if (text(values.componentCode) && !['1', '2', '3'].includes(text(values.componentCode))) error.componentCode = 'Use 1 = pipe, 2 = supports, 3 = appendages.';
    const material = materialNo ? find(materials, 'materialNo', materialNo) : undefined;
    if (material) { result.source = 'Catalog'; result.materialId = material.id; }
    else if (materialNo) { result.source = 'Custom'; if (!text(values.description)) error.description = 'A material that is not in the database needs a description.'; }
    return result;
  });
}

// ----- delivery to the hosted profile -------------------------------------------------------------------------------

/**
 * Resources delivered as data only by this flow. Orders, order lines, stock, movements and pick lists, which the
 * Ord.? / Inv. / Picked columns also read, are delivered once for every MTO flow in `availabilityFor()` (shared/release.ts).
 */
export const MTO_DATA_RESOURCES = ['custom_materials', 'material_quantity_changes'];
/** Resources with a page in the MTO menu that this flow owns or needs as reference lists. */
export const MTO_PAGE_RESOURCES = ['materials', 'material_parts', 'material_types', 'suppliers', 'operation_phases'];

/**
 * Deliver the MTO materials flow to a profile. `deliver` is `deliverResource` (passed in to avoid an import
 * cycle) and `fields` lists a resource's field names.
 */
export function deliverMtoMaterials(availability: Availability, deliver: (availability: Availability, key: string, names?: string[]) => void, fields: (key: string) => string[]) {
  for (const key of MTO_PAGE_RESOURCES) deliver(availability, key);
  deliver(availability, 'uoms', ['name']);
  deliver(availability, 'iso_materials', fields('iso_materials'));
  for (const key of MTO_DATA_RESOURCES) availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...fields(key)])];
  availability.actions['add-iso-material'] = [...new Set([...(availability.actions['add-iso-material'] || []), ...'isoId source materialId materialGroup phaseId quantity revisionId materialNo description articleNo legacyNo dia lbs uom price chargeNo componentCode progressClass addToDB'.split(' ')])];
  availability.actions['set-material-type'] = ['requirementIds', 'phaseId'];
  availability.actions['edit-iso-material'] = ['requirementId', 'phaseId', 'componentCode', 'uom', 'chargeNo', 'expectedVersion'];
  availability.actions['archive-iso-materials'] = ['requirementIds', 'note'];
  availability.actions['remove-material-quantity'] = ['requirementId', 'revisionId', 'quantity', 'date', 'note', 'expectedVersion'];
}
