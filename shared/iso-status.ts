import type { Row } from './types.ts';
import { hydrotestState } from './hydrotest.ts';
import { punchBlocking, punchKind, punchListLink } from './punch.ts';
import { progressFromUnits, emptyProgressUnits, type ProgressResult, type ProgressUnit, type ProgressUnits } from './progress-model.ts';
import { flangeStatus } from './flanges.ts';
import { ndtAccepted, nextRepairNumber, notAccepted, openRejection, repairChain, repairParent } from './inspections.ts';
import { isoBudgets as mtoBudgets } from './mto-materials.ts';

/**
 * Status of one isometric: what blocks it, the quality of its NDT results and its weighted progress.
 * Pure functions over plain rows (no I/O), shared by the isometric page and by the server's validation.
 */

/** Rows the calculations read. Collections may hold other isometrics' rows; each function picks its own. */
export interface IsoStatusInput {
  iso: Row;
  /** The project site row (not read by the progress: its weights and NDT measurement are ignored, shared/progress-model.ts). */
  site?: Row | null;
  welds: Row[];
  weldTypes: Row[];
  diameters: Row[];
  /** Inspection results. */
  results: Row[];
  /** Release records; `null` or absent when the account cannot read them (that blocker group is then skipped). */
  releases?: Row[] | null;
  /** Test systems and hydrotest requests (see `hydrotestState`); absent or `null` when the account cannot read them. */
  testSystems?: Row[] | null;
  hydrotestRequests?: Row[] | null;
  /** Spools (their test systems) and hydrotest results; absent or `null`: the isometric's own test system decides, results are not read. */
  spools?: Row[] | null;
  hydrotestResults?: Row[] | null;
  /** Punch items; `null` or absent when the account cannot read them. */
  punch?: Row[] | null;
  /** Budgets of the pipe / supports / appendages drivers. Absent: those drivers are out of scope. */
  budgets?: ProgressBudgets;
  /** Punch progress 0..1; no longer a progress driver (kept so existing callers compile). */
  punchProgress?: number | null;
  /** Flanges (Reinstatement driver: share of the isometric's flanges that are Finished); null or absent: no flanges, Reinstatement follows Pressure tests. */
  flanges?: Row[] | null;
}

// ----- finish states and entered quantities -------------------------------------------------------------------

export const ISO_FINISH_STATES = ['Open', 'Done', 'N/A'];
export const ISO_FINISH_ITEMS = [{ field: 'paintState', label: 'Paint' }, { field: 'tracingState', label: 'Tracing' }, { field: 'insulationState', label: 'Insulation' }];

export type QuantityKey = 'materialPipe' | 'supports' | 'appendages';
export type QuantityPhase = 'shop' | 'field';
export const ISO_QUANTITIES: { phase: QuantityPhase; key: QuantityKey; field: string; label: string; unit: string }[] = [
  { phase: 'shop', key: 'materialPipe', field: 'shopPipeM', label: 'Pipe', unit: 'm' },
  { phase: 'shop', key: 'supports', field: 'shopSupportsPcs', label: 'Supports', unit: 'pcs' },
  { phase: 'shop', key: 'appendages', field: 'shopAppendagesPcs', label: 'Appendages', unit: 'pcs' },
  { phase: 'field', key: 'materialPipe', field: 'fieldPipeM', label: 'Pipe', unit: 'm' },
  { phase: 'field', key: 'supports', field: 'fieldSupportsPcs', label: 'Supports', unit: 'pcs' },
  { phase: 'field', key: 'appendages', field: 'fieldAppendagesPcs', label: 'Appendages', unit: 'pcs' },
];
export type QuantityBudget = Partial<Record<QuantityKey, number>>;
/**
 * Budget per phase and component; a missing or non-positive value means there is no budget. Shop: the Shop-typed MTO.
 * Field: the whole ISO (Shop- and Field-typed MTO), because shop prefab is installed again in the field
 * (weld__general__project-sites.txt:157-163). `issued`: the picked quantity, the ceiling of what counts (Shop: of the
 * Shop-typed lines; Field: of the whole ISO); absent when pick lists were not read, and then nothing caps the entry.
 */
export interface ProgressBudgets { shop?: QuantityBudget; field?: QuantityBudget; issued?: { shop?: QuantityBudget; field?: QuantityBudget } }

/**
 * The MTO budget of an isometric: its quantity of materials whose component code (CC 1 = pipe, 2 = supports,
 * 3 = appendages) classifies them, per Shop / Field operation phase, with the picked quantity of each; see
 * `isoBudgets()` in shared/mto-materials.ts. Without `rows` there is no budget and the quantity drivers stay out of scope.
 */
export function isoBudgets(iso: Row, rows?: Record<string, Row[]>): ProgressBudgets | undefined { return mtoBudgets(iso, rows); }

const positive = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };
const budgetOf = (budgets: ProgressBudgets | undefined, phase: QuantityPhase, key: QuantityKey) => positive(budgets?.[phase]?.[key]);
/** The picked quantity that caps an entry; Infinity while pick lists were not read. */
const issuedOf = (budgets: ProgressBudgets | undefined, phase: QuantityPhase, key: QuantityKey) => budgets?.issued ? positive(budgets.issued[phase]?.[key]) : Infinity;
/**
 * Progress 0..1 of a quantity driver: min(entered, picked) ÷ budget, capped at 1; null without a budget. Shop: the
 * entered shop quantity over the Shop-typed MTO, counted up to the Shop-typed picked quantity. Field: the installed
 * quantity over the whole ISO, counted up to the picked quantity of the whole ISO.
 */
export function quantityProgress(entered: unknown, budgets: ProgressBudgets | undefined, phase: QuantityPhase, key: QuantityKey): number | null {
  const units = quantityUnits(entered, budgets, phase, key);
  return units.total ? units.done / units.total : null;
}
/** The same as units: done = min(entered, picked, budget), total = the budget (0 without one). Pools across isometrics. */
export function quantityUnits(entered: unknown, budgets: ProgressBudgets | undefined, phase: QuantityPhase, key: QuantityKey): ProgressUnit {
  const budget = budgetOf(budgets, phase, key);
  if (!budget) return { done: 0, total: 0 };
  return { done: Math.min(budget, Math.max(0, quantityOf(entered) ?? 0), issuedOf(budgets, phase, key)), total: budget };
}
const quantityOf = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// ----- input checks used by the forms and by the server -------------------------------------------------------

/**
 * ISO numbers: letters, digits, `.`, `_`, `-` and single spaces between them ("KH-034708-SHEET 5"; the client's own
 * export of 17.11.2026 has 72 of 7621 ISO numbers with a space and no other character, client request of 20.11.2026).
 */
export const ISO_NUMBER_PATTERN = /^[A-Za-z0-9._-]+(?: [A-Za-z0-9._-]+)*$/;
/** The field message and the field's help text, as in the reference (weld__iso__0001__edit-isometric.txt:17-18). */
export const ISO_NUMBER_MESSAGE = 'Special characters are not allowed in the ISO number';
export const ISO_NUMBER_HINT = 'Special characters are not allowed in the ISO number. Only letters, numbers, dots, -, _ and spaces are allowed.';
export const isoNumberError = (value: unknown) => { const text = typeof value === 'string' ? value.trim() : ''; return !text || ISO_NUMBER_PATTERN.test(text) ? '' : ISO_NUMBER_MESSAGE; };

/**
 * Errors of an isometric being saved, by field name. The number is checked only when it is new or changed, so
 * existing records that break the pattern still open and save other fields. A quantity is checked only when it
 * is new or changed: it needs a budget and may not exceed it.
 */
export function isoInputErrors(input: Record<string, unknown>, existing?: Row, budgets?: ProgressBudgets): Record<string, string> {
  const errors: Record<string, string> = {};
  const number = typeof input.isoNo === 'string' ? input.isoNo.trim() : '';
  if ((!existing || number !== String(existing.isoNo ?? '').trim()) && isoNumberError(number)) errors.isoNo = ISO_NUMBER_MESSAGE;
  for (const quantity of ISO_QUANTITIES) {
    const value = quantityOf(input[quantity.field]);
    if (value === null || value <= 0 || (existing && quantityOf(existing[quantity.field]) === value)) continue;
    const budget = budgetOf(budgets, quantity.phase, quantity.key);
    if (!budget) errors[quantity.field] = noBudgetText(quantity.phase, quantity.key);
    else if (value > budget) errors[quantity.field] = `${quantity.label} (${value} ${quantity.unit}) is above the MTO budget of ${budget} ${quantity.unit}.`;
  }
  return errors;
}
/** The component code (CC) that feeds each quantity driver: 1 = pipe, 2 = supports, 3 = appendages. */
export const DRIVER_COMPONENT_CODE: Record<QuantityKey, '1' | '2' | '3'> = { materialPipe: '1', supports: '2', appendages: '3' };
/** Why a quantity row cannot be entered (reference progress card tooltips, weld__iso__0001__progress-card.txt:11-19). */
export const noBudgetText = (phase: QuantityPhase, key: QuantityKey) => phase === 'shop' ? 'No Shop-typed material on this ISO.' : `No MTO budget — add materials with this component code in Material Core. (CC ${DRIVER_COMPONENT_CODE[key]})`;

// ----- shared row helpers --------------------------------------------------------------------------------------

const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const text = (value: unknown) => String(value ?? '').trim();
const hasWelder = (weld: Row) => [1, 2, 3, 4].some(side => text(weld[`welder${side}Id`]) !== '');
const NDT_TYPES = ['NDT', 'NDT PRE'];

/** Newest first, the order the weld register (LISL) uses. */
export const newest = (a: Row, b: Row) => text(b.date).localeCompare(text(a.date)) || text(b._createdAt).localeCompare(text(a._createdAt)) || text(b.id).localeCompare(text(a.id));
const resultsOf = (results: Row[], weldId: string, types: string[]) => live(results).filter(row => row.weldId === weldId && types.includes(text(row.type))).sort(newest);
const isoWelds = (input: IsoStatusInput) => live(input.welds).filter(weld => weld.isoId === input.iso.id);
const locationOf = (weld: Row, weldTypes: Row[]): QuantityPhase | undefined => {
  const location = weldTypes.find(type => type.id === weld.typeId)?.location;
  return location === 'Shop' ? 'shop' : location === 'Field' ? 'field' : undefined;
};
/** Diameter in inches (`diameters.sizeinch`), or 0 when the weld has none (explicit length or no diameter). */
const inchesOf = (weld: Row, diameters: Row[]) => {
  const size = Number(diameters.find(row => row.id === weld.diameterId)?.sizeinch);
  return Number.isFinite(size) && size > 0 ? size : 0;
};
const percent1 = (fraction: number) => Math.round(fraction * 1000) / 10;

// ----- blockers ------------------------------------------------------------------------------------------------

export type BlockerKey = 'release' | 'welds' | 'ndt' | 'repair' | 'punch';
/** What a click on a blocker item opens (shared/iso-blocker-targets.ts maps it to the dialog): the dialog that fixes the item. */
export interface BlockerTarget { kind: 'release' | 'edit-weld' | 'ndt' | 'ndt-pre' | 'punch'; /** The weld whose dialog opens (for a repair that exists, the repair weld). */ weldId?: string; /** Punch lines: the phase the filtered Punch lists page opens on. */ punchType?: 'Pre-punch' | 'Punch'; }
export interface BlockerItem { message: string; /** The weld to open, where the item concerns one. */ weldId?: string; /** The page the line links to (the filtered Punch lists page for the punch lines). */ href?: string; /** The dialog that fixes the item; absent on the count lines of a group the server counted alone. */ target?: BlockerTarget; }
export interface BlockerGroup { key: BlockerKey; title: string; /** What the group adds to the total ("N open"). */ count: number; items: BlockerItem[]; }
export interface IsoBlockers { groups: BlockerGroup[]; total: number; }
export const BLOCKER_TITLES: Record<BlockerKey, string> = { release: 'Release', welds: 'Welds', ndt: 'NDT', repair: 'Repair', punch: 'Punch' };

// ----- phase completion ----------------------------------------------------------------------------------------

export type CompletionPhase = 'Prefab' | 'Field';
/** The isometric's fields that hold "Prefab complete" / "Field complete" (written only by the complete and reopen actions). */
export const COMPLETION_FIELDS: Record<CompletionPhase, { at: string; by: string }> = { Prefab: { at: 'prefabCompletedAt', by: 'prefabCompletedBy' }, Field: { at: 'fieldCompletedAt', by: 'fieldCompletedBy' } };
/**
 * Whether a phase of an isometric is completed: marked complete on the isometric, or (records from before the two
 * steps existed) released by a live Prefab / Field release that was not reopened, so existing rows need no write.
 * `releases` null / absent: only the isometric's own fields are read.
 */
export function phaseCompleted(iso: Row, phase: CompletionPhase, releases?: Row[] | null): boolean {
  if (text(iso[COMPLETION_FIELDS[phase].at]) !== '') return true;
  return live(releases).some(row => row.isoId === iso.id && row.type === phase && row.status !== 'Reopened');
}

/** Fields a weld that has a welder needs ("Mandatory fields" of the reference; blockers always apply them). */
function missingWeldFields(weld: Row): string[] {
  const missing: string[] = [];
  if (!text(weld.typeId)) missing.push('weld type');
  if (!text(weld.wpsId)) missing.push('WPS');
  if (!text(weld.date)) missing.push('weld date');
  if (weld.lengthMode === 'Length in mm' ? !(Number(weld.dialen) > 0) : !text(weld.diameterId)) missing.push(weld.lengthMode === 'Length in mm' ? 'length' : 'diameter');
  if (!text(weld.chargeNo1) && !text(weld.certificate1Id)) missing.push('charge number 1');
  if (!text(weld.chargeNo2) && !text(weld.certificate2Id)) missing.push('charge number 2');
  return missing;
}

/** The fields "Prefab complete" / "Field complete" requires on a welded weld besides the type: WPS, weld date and both charge numbers (client answer 17.11.2026: they are mandatory, not optional). */
export const missingCompleteFields = (weld: Row): string[] => missingWeldFields(weld).filter(name => name === 'WPS' || name === 'weld date' || name.startsWith('charge number'));

/** Order of creation, as the reference lists blockers (a repair 010R1 follows weld 012); equal times by weld number. */
const byCreation = (a: Row, b: Row) => text(a._createdAt).localeCompare(text(b._createdAt)) || text(a.weldNo).localeCompare(text(b.weldNo), 'en', { numeric: true });

export function isoBlockers(input: IsoStatusInput): IsoBlockers {
  const welds = isoWelds(input).sort(byCreation);
  const groups: BlockerGroup[] = [];
  const add = (key: BlockerKey, items: BlockerItem[], count = items.length) => { if (items.length) groups.push({ key, title: BLOCKER_TITLES[key], count, items }); };
  // Release: one item per phase that is not completed, whatever welds the isometric has. Skipped when releases cannot be read.
  if (input.releases) {
    add('release', (['Prefab', 'Field'] as const).filter(phase => !phaseCompleted(input.iso, phase, input.releases)).map(phase => ({ message: `${phase} is not released yet`, target: { kind: 'release' } as BlockerTarget })));
  }
  add('welds', welds.filter(hasWelder).flatMap(weld => missingWeldFields(weld).length ? [{ weldId: weld.id, message: `Weld ${weld.weldNo} is missing required fields`, target: { kind: 'edit-weld', weldId: weld.id } as BlockerTarget }] : []));
  // NDT: a required examination without any result. Rejected results are handled under Repair.
  add('ndt', welds.flatMap(weld => [['ndoReqPre', 'NDT PRE'], ['ndoReq', 'NDT']].flatMap(([flag, type]) => weld[flag] === true && !resultsOf(input.results, weld.id, [type]).length ? [{ weldId: weld.id, message: `${type} on weld ${weld.weldNo} has no result`, target: { kind: type === 'NDT PRE' ? 'ndt-pre' : 'ndt', weldId: weld.id } as BlockerTarget }] : [])));
  // Repair: one item per rejection (latest NDT outcome NA, or ReWeld? ticked), naming the repair that follows it
  // (`003` → `003R1`, a rejected `003R1` → `003R2`; the next number when no repair weld exists yet, shared/inspections.ts).
  // A rejection is closed once a repair later in its chain (`repairOfId`) has an accepted result.
  const all = live(input.welds), results = live(input.results);
  add('repair', welds.flatMap(weld => {
    if (!openRejection(weld, all, results)) return [];
    const chain = repairChain(weld, all);
    // The repair weld once it exists (Edit weld of it, read-only when locked); until then the NDT dialog of the rejected weld.
    const target: BlockerTarget = chain[0] ? { kind: 'edit-weld', weldId: chain[0].id } : { kind: notAccepted(weld, results.filter(row => row.type === 'NDT')) ? 'ndt' : 'ndt-pre', weldId: weld.id };
    return [{ weldId: weld.id, message: `Rejection on weld ${weld.weldNo}, repair ${chain[0] ? text(chain[0].weldNo) : nextRepairNumber(weld, all)} is still open`, target }];
  }));
  if (input.punch) {
    // Open items of the blocking categories A and B hold the isometric back (see shared/punch.ts).
    // One line per phase ("1 open pre-punch", "2 open punch"), each linking to the Punch lists page filtered to this isometric and phase.
    const blocking = punchBlocking(live(input.punch).filter(row => row.isoId === input.iso.id));
    const phase = (kind: 'Pre-punch' | 'Punch'): BlockerItem[] => { const count = blocking.filter(row => punchKind(row) === kind).length; return count ? [{ message: `${count} open ${kind.toLowerCase()}`, href: punchListLink({ isoId: input.iso.id, projectId: text(input.iso.projectId), punchType: kind }), target: { kind: 'punch', punchType: kind } }] : []; };
    add('punch', [...phase('Pre-punch'), ...phase('Punch')], blocking.length);
  }
  return { groups, total: groups.reduce((sum, group) => sum + group.count, 0) };
}

// ----- quality -------------------------------------------------------------------------------------------------

export interface IsoQuality { accepted: number; rejected: number; /** One decimal; null when nothing was examined. */ percent: number | null; }
/**
 * A repair weld as the reference links one: made by the repair action (`repairOfId`), or added by hand as `<no>R<n>`
 * with a capital R and an original on the isometric. The reference does not link a lower-case `003r1` (weld__iso__0005:
 * its NDT and Quality figures count 003r1 as a weld of its own), so neither does this rule.
 */
export function isRepairWeld(weld: Row, welds: Row[]): boolean {
  if (text(weld.repairOfId)) return Boolean(repairParent(weld, welds));
  return /R\d+$/.test(text(weld.weldNo)) && Boolean(repairParent(weld, welds));
}
/**
 * Accepted NDT / NDT PRE result rows ÷ (accepted + NA) over the isometric's welds that are not repair welds, one decimal.
 * Not part of the progress. Reference 0003: 001_1 NA → 001_1R1 Accepted, 001_2 NA → 001_2R1 Accepted gives 0 %.
 */
export function isoQuality(input: Pick<IsoStatusInput, 'iso' | 'welds' | 'results'>): IsoQuality {
  const all = live(input.welds);
  const ids = new Set(all.filter(weld => weld.isoId === input.iso.id && !isRepairWeld(weld, all)).map(weld => weld.id));
  const examined = live(input.results).filter(row => ids.has(String(row.weldId)) && NDT_TYPES.includes(text(row.type)) && ['Accepted', 'Rejected'].includes(text(row.result)));
  const accepted = examined.filter(row => row.result === 'Accepted').length, rejected = examined.length - accepted;
  return { accepted, rejected, percent: examined.length ? percent1(accepted / examined.length) : null };
}

// ----- progress ------------------------------------------------------------------------------------------------

/** Progress of an isometric: the fixed model of shared/progress-model.ts (always configured) and the measured units behind it. */
export interface IsoProgress extends ProgressResult {
  /** Always true: the weights are fixed in code. Kept for callers that still read it. */
  configured: true;
  units: ProgressUnits;
}

/**
 * What each activity of PROGRESS_MODEL has done on one isometric (client change list 22.11.2026, F3):
 * Shop MTO / Cut-Bev / Fit-up and Field Spools erection / Fit-up: dia-inch of the phase's welds with a fit-up date
 * (`datefit`; a welded weld counts as fitted). Welding: dia-inch of the phase's welds with a welder and the weld date.
 * NDT: dia-inch of the phase's welds that need NDT (`ndoReq`, repair welds add nothing), done once the latest weld of
 * the repair chain has an Accepted NDT result; always inch-weighted. Fabrication Book / Final documentation: the
 * Prefab / Field phase is completed (1 of 1). Supports erection: the field supports quantity against the MTO budget
 * (`quantityUnits`). Pressure tests: the hydrotest, 1 of 1 while in scope, 0 of 0 otherwise. Reinstatement: Finished
 * flanges of the isometric of all its flanges; without flanges the Pressure tests units.
 * Phase of a weld: the location of its weld type (Shop / Field); a weld without one counts in neither phase.
 */
export function isoProgressUnits(input: IsoStatusInput): ProgressUnits {
  const units = emptyProgressUnits(), welds = isoWelds(input), allWelds = live(input.welds);
  const inPhase = (phase: QuantityPhase) => welds.filter(weld => locationOf(weld, input.weldTypes) === phase);
  const welded = (weld: Row) => hasWelder(weld) && text(weld.date) !== '';
  const inches = (rows: Row[], done: (weld: Row) => boolean): ProgressUnit => rows.reduce((unit, weld) => { const size = inchesOf(weld, input.diameters); return { total: unit.total + size, done: unit.done + (done(weld) ? size : 0) }; }, { done: 0, total: 0 });
  // Repair welds add no units; an original counts as done once the latest weld of its repair chain is Accepted
  // ("Reject does not count as done. Repair welds add no extra earned units.", weld__general__project-sites.txt:162).
  const ndt = (rows: Row[]) => inches(rows.filter(weld => weld.ndoReq === true && !isRepairWeld(weld, allWelds)), weld => {
    const last = [weld, ...repairChain(weld, allWelds).filter(repair => isRepairWeld(repair, allWelds))].at(-1)!;
    return resultsOf(input.results, last.id, ['NDT'])[0]?.result === 'Accepted';
  });
  const shop = inPhase('shop'), field = inPhase('field');
  const once = (done: boolean): ProgressUnit => ({ done: done ? 1 : 0, total: 1 });
  units.shop = { fitUp: inches(shop, weld => text(weld.datefit) !== '' || welded(weld)), welding: inches(shop, welded), ndt: ndt(shop), fabricationBook: once(phaseCompleted(input.iso, 'Prefab', input.releases)) };
  const hydrotest = hydrotestState(input.iso, { test_systems: input.testSystems, hydrotest_requests: input.hydrotestRequests, releases: input.releases, spools: input.spools, hydrotest_results: input.hydrotestResults });
  const pressureTests: ProgressUnit = hydrotest.inScope ? once(hydrotest.completed) : { done: 0, total: 0 };
  const flanges = live(input.flanges).filter(row => row.isoId === input.iso.id);
  units.field = {
    erection: inches(field, weld => text(weld.datefit) !== '' || welded(weld)), supports: quantityUnits(input.iso.fieldSupportsPcs, input.budgets, 'field', 'supports'),
    welding: inches(field, welded), ndt: ndt(field), pressureTests,
    reinstatement: flanges.length ? { done: flanges.filter(row => flangeStatus(row) === 'Finished').length, total: flanges.length } : { ...pressureTests },
    finalDocumentation: once(phaseCompleted(input.iso, 'Field', input.releases)),
  };
  return units;
}

/** Weighted progress of an isometric with the fixed weights of PROGRESS_MODEL (see `progressFromUnits` for the rule). */
export function isoProgress(input: IsoStatusInput): IsoProgress {
  const units = isoProgressUnits(input);
  return { configured: true, units, ...progressFromUnits(units) };
}
