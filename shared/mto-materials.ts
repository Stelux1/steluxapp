import type { Availability, Row } from './types.ts';
import type { ProgressBudgets, QuantityKey, QuantityPhase } from './iso-status.ts';
import { materialRecord, requirementExecution } from './materials.ts';
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

/** Component code (CC) → the class it feeds (reference "Component code (ISO progress) (1=pipe, 2=supports, 3=appendages)"). */
export const COMPONENT_CODE_CLASS: Record<string, ProgressClass> = { '1': 'Pipe', '2': 'Supports', '3': 'Appendages' };
/**
 * The component code in effect on a requirement line: the line's own CC once the line carries one (a custom line, or a
 * line whose CC was set on the line, also when set to empty); otherwise its catalog material's CC, as if Add had copied it.
 */
export function componentCodeOf(rows: Rows, requirement: Row): string {
  if (requirement.componentCode !== undefined && requirement.componentCode !== null) return text(requirement.componentCode);
  return text(materialRecord(rows, requirement)?.componentCode);
}
/**
 * The class of a requirement line: CC 1 / 2 / 3 of the line (see `componentCodeOf`). Older records whose CC is not
 * 1 / 2 / 3 read the earlier "Progress class" (of the custom line or of its material) instead, so nothing needs a write.
 * Undefined when neither classifies the line.
 */
export function progressClassOf(rows: Rows, requirement: Row): ProgressClass | undefined {
  const byCode = COMPONENT_CODE_CLASS[componentCodeOf(rows, requirement)];
  if (byCode) return byCode;
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
 * Budgets of the progress drivers of an isometric (weld__general__project-sites.txt:157-163): the quantity of its
 * requirement lines classified by component code (`progressClassOf`), by the Shop / Field location of the line's
 * operation phase. `shop` is the Shop-typed MTO; `field` is the whole ISO (Shop- plus Field-typed lines), since shop
 * prefab is installed again in the field. `issued` is the picked quantity of the same lines (`requirementExecution`),
 * the ceiling of what counts: present only when `rows` holds pick lists. Quantities are summed as entered (no unit
 * conversion). Lines without a class, without a Shop / Field phase or without quantity count for nothing. Undefined
 * while no line produces a budget (the drivers then stay out of scope), and without rows.
 */
export function isoBudgets(isometric: Row, rows?: Rows): ProgressBudgets | undefined {
  if (!rows) return undefined;
  const phases = new Map(live(rows, 'operation_phases').map(phase => [phase.id, phase]));
  const pickedOf = Array.isArray(rows.picklists) ? new Map(requirementExecution({ ...rows, isometrics: [isometric] }, { isoId: isometric.id }).map(entry => [entry.requirement.id, entry.picked])) : null;
  const budgets: ProgressBudgets = {}, issued: NonNullable<ProgressBudgets['issued']> = {};
  const bump = (target: Partial<Record<QuantityKey, number>>, driver: QuantityKey, value: number) => { target[driver] = round((target[driver] || 0) + value); };
  for (const line of live(rows, 'iso_materials').filter(line => line.isoId === isometric.id)) {
    const quantity = Number(line.quantity), cls = progressClassOf(rows, line), location = phaseLocation(phases.get(String(line.phaseId)));
    if (!cls || !location || !(quantity > 0)) continue;
    const driver = PROGRESS_CLASS_DRIVER[cls], picked = Math.max(0, pickedOf?.get(line.id) ?? 0);
    // Shop counts the Shop-typed lines; Field counts every line (the whole ISO).
    for (const phase of location === 'shop' ? ['shop', 'field'] as const : ['field'] as const) {
      bump(budgets[phase] ||= {}, driver, quantity);
      if (pickedOf) bump(issued[phase] ||= {}, driver, picked);
    }
  }
  if (!Object.keys(budgets).length) return undefined;
  return pickedOf ? { ...budgets, issued } : budgets;
}

// ----- coverage ---------------------------------------------------------------------------------------------------

/** Ord.? / Inv. / Picked of one requirement line, derived with `requirementExecution()`. */
export interface MaterialLineStatus { requirementId: string; required: number; ordered: number; /** Fully ordered (Ord.? = Yes). */ isOrdered: boolean; inventory: number; picked: number; }
export function materialLineStatuses(rows: Rows, isoId: string): Map<string, MaterialLineStatus> {
  return new Map(requirementExecution(rows, { isoId }).map(entry => [entry.requirement.id, { requirementId: entry.requirement.id, required: entry.required, ordered: entry.ordered, isOrdered: entry.toOrder <= 0, inventory: entry.inventory, picked: entry.picked }]));
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
}
/**
 * Errors of an isometric material being added, by field name: a catalog material needs a material and a
 * quantity above zero; a custom material needs its number, description, UOM and (when asked) group.
 */
export function isoMaterialInputErrors(input: Record<string, unknown>, options: MaterialInputOptions = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  const quantity = input.quantity;
  if (quantity === '' || quantity === null || quantity === undefined) errors.quantity = 'Enter the quantity.';
  else if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) errors.quantity = 'The quantity must be a number above zero.';
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
  availability.actions['archive-iso-materials'] = ['requirementIds', 'note'];
  availability.actions['remove-material-quantity'] = ['requirementId', 'revisionId', 'quantity', 'date', 'note', 'expectedVersion'];
}
