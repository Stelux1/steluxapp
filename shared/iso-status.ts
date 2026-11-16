import type { Row } from './types.ts';
import { hasPunchProgress, punchBlocking, punchProgress } from './punch.ts';
import { PROGRESS_PHASES, ndtMeasurement, progressWeights, type PhaseKey } from './site-settings.ts';

/**
 * Status of one isometric: what blocks it, the quality of its NDT results and its weighted progress.
 * Pure functions over plain rows (no I/O), shared by the isometric page and by the server's validation.
 */

/** Rows the calculations read. Collections may hold other isometrics' rows; each function picks its own. */
export interface IsoStatusInput {
  iso: Row;
  /** The project site row carrying the progress weights and the NDT measurement. */
  site?: Row | null;
  welds: Row[];
  weldTypes: Row[];
  diameters: Row[];
  /** Inspection results. */
  results: Row[];
  /** Release records; `null` or absent when the account cannot read them (that blocker group is then skipped). */
  releases?: Row[] | null;
  /** Punch items; `null` or absent when the account cannot read them. */
  punch?: Row[] | null;
  /** Budgets of the pipe / supports / appendages drivers. Absent: those drivers are out of scope. */
  budgets?: ProgressBudgets;
  /** Punch driver progress 0..1 (overrides the isometric's own). Absent until punch progress is entered: the driver is out of scope. */
  punchProgress?: number | null;
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
/** Budget per phase and component; a missing or non-positive value means there is no budget. */
export type ProgressBudgets = Partial<Record<QuantityPhase, Partial<Record<QuantityKey, number>>>>;

/**
 * The MTO budget of an isometric: its quantity of materials whose component code classifies them as pipe,
 * support or appendage, per Shop / Field operation phase. Component codes do not exist in the material
 * database yet, so there is no budget and the quantity drivers stay out of scope. A later task fills this in;
 * nothing is invented here.
 */
export function isoBudgets(_iso: Row, _requirements?: Row[]): ProgressBudgets | undefined { return undefined; }

const budgetOf = (budgets: ProgressBudgets | undefined, phase: QuantityPhase, key: QuantityKey) => {
  const value = Number(budgets?.[phase]?.[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const quantityOf = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// ----- input checks used by the forms and by the server -------------------------------------------------------

/** ISO numbers: letters, digits, `.`, `_` and `-`. */
export const ISO_NUMBER_PATTERN = /^[A-Za-z0-9._-]+$/;
export const ISO_NUMBER_MESSAGE = 'Use only letters, digits, ".", "_" and "-" in the ISO number.';
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
    if (!budget) errors[quantity.field] = `${quantity.label} has no MTO budget yet, so progress cannot be entered. Add materials with a matching component code in MTO first.`;
    else if (value > budget) errors[quantity.field] = `${quantity.label} (${value} ${quantity.unit}) is above the MTO budget of ${budget} ${quantity.unit}.`;
  }
  return errors;
}

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
const round1 = (value: number) => Math.round(value * 10) / 10;

// ----- blockers ------------------------------------------------------------------------------------------------

export type BlockerKey = 'release' | 'welds' | 'ndt' | 'repair' | 'punch';
export interface BlockerItem { message: string; /** The weld to open, where the item concerns one. */ weldId?: string; }
export interface BlockerGroup { key: BlockerKey; title: string; /** What the group adds to the total ("N open"). */ count: number; items: BlockerItem[]; }
export interface IsoBlockers { groups: BlockerGroup[]; total: number; }
export const BLOCKER_TITLES: Record<BlockerKey, string> = { release: 'Release', welds: 'Welds', ndt: 'NDT', repair: 'Repair', punch: 'Punch' };

/** Fields a weld that has a welder needs ("Mandatory fields" of the reference; blockers always apply them). */
function missingWeldFields(weld: Row): string[] {
  const missing: string[] = [];
  if (!text(weld.typeId)) missing.push('weld type');
  if (!text(weld.wpsId)) missing.push('WPS');
  if (!text(weld.date)) missing.push('weld date');
  if (weld.lengthMode === 'Length in mm' ? !(Number(weld.dialen) > 0) : !text(weld.diameterId)) missing.push(weld.lengthMode === 'Length in mm' ? 'length' : 'diameter');
  if (!text(weld.chargeNo1)) missing.push('charge number 1');
  if (!text(weld.chargeNo2)) missing.push('charge number 2');
  return missing;
}
const list = (items: string[]) => items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export function isoBlockers(input: IsoStatusInput): IsoBlockers {
  const welds = isoWelds(input).sort((a, b) => text(a.weldNo).localeCompare(text(b.weldNo), 'en', { numeric: true }));
  const groups: BlockerGroup[] = [];
  const add = (key: BlockerKey, items: BlockerItem[], count = items.length) => { if (items.length) groups.push({ key, title: BLOCKER_TITLES[key], count, items }); };
  // Release: shop welds exist and no Prefab release record yet. Skipped when releases cannot be read.
  if (input.releases) {
    const shopWelds = welds.some(weld => locationOf(weld, input.weldTypes) === 'shop');
    const released = live(input.releases).some(row => row.isoId === input.iso.id && row.type === 'Prefab');
    if (shopWelds && !released) add('release', [{ message: 'The shop welds have not been released for prefab yet.' }]);
  }
  add('welds', welds.filter(hasWelder).flatMap(weld => { const missing = missingWeldFields(weld); return missing.length ? [{ weldId: weld.id, message: `Weld ${weld.weldNo} is missing ${list(missing)}.` }] : []; }));
  // NDT: a required examination without any result. Rejected results are handled under Repair.
  add('ndt', welds.flatMap(weld => [['ndoReqPre', 'NDT PRE'], ['ndoReq', 'NDT']].flatMap(([flag, type]) => weld[flag] === true && !resultsOf(input.results, weld.id, [type]).length ? [{ weldId: weld.id, message: `${type} on weld ${weld.weldNo} has no result yet.` }] : [])));
  // Repair: the latest NDT result is Rejected, so the repair is not closed (a later accepted result closes it).
  // The existing repair model is the weld's `repair` flag set by the repair action, nothing more.
  add('repair', welds.flatMap(weld => resultsOf(input.results, weld.id, NDT_TYPES)[0]?.result === 'Rejected'
    ? [{ weldId: weld.id, message: weld.repair ? `Weld ${weld.weldNo} was rejected; the repair is recorded and waits for an accepted re-examination.` : `Weld ${weld.weldNo} was rejected; no repair is recorded yet.` }] : []));
  if (input.punch) {
    // Open items of the blocking categories A and B hold the isometric back (see shared/punch.ts).
    const open = punchBlocking(live(input.punch).filter(row => row.isoId === input.iso.id)).length;
    if (open) add('punch', [{ message: `${open} open punch item${open === 1 ? '' : 's'} in category A or B.` }], open);
  }
  return { groups, total: groups.reduce((sum, group) => sum + group.count, 0) };
}

// ----- quality -------------------------------------------------------------------------------------------------

export interface IsoQuality { accepted: number; rejected: number; /** One decimal; null when nothing was examined. */ percent: number | null; }
/** Accepted NDT results / (accepted + rejected). Not part of the progress. */
export function isoQuality(input: Pick<IsoStatusInput, 'iso' | 'welds' | 'results'>): IsoQuality {
  const ids = new Set(live(input.welds).filter(weld => weld.isoId === input.iso.id).map(weld => weld.id));
  const examined = live(input.results).filter(row => ids.has(String(row.weldId)) && NDT_TYPES.includes(text(row.type)) && ['Accepted', 'Rejected'].includes(text(row.result)));
  const accepted = examined.filter(row => row.result === 'Accepted').length, rejected = examined.length - accepted;
  return { accepted, rejected, percent: examined.length ? percent1(accepted / examined.length) : null };
}

// ----- progress ------------------------------------------------------------------------------------------------

export interface DriverProgress {
  key: string; label: string;
  /** Weight inside the phase, percent. */
  weight: number;
  /** Counts toward the phase: in scope and weighted above 0. */
  inScope: boolean;
  /** 0..1 while in scope. */
  progress: number | null;
  /** Points of the isometric's 100 % this driver has earned (unrounded). */
  earned: number | null;
}
export interface PhaseProgress {
  key: PhaseKey; label: string; weight: number;
  /** One decimal; null while no driver of the phase is in scope. */
  percent: number | null;
  drivers: DriverProgress[];
}
export interface IsoProgress {
  /** False while the site has no progress weights: no percentages are produced. */
  configured: boolean;
  phases: PhaseProgress[];
  /** The isometric's percentage, one decimal; null when not configured or nothing is in scope. */
  total: number | null;
}

/**
 * Weighted progress of an isometric, following the reference's driver model:
 * phase % = Σ(weight × progress) over the drivers that are in scope and weighted above 0 ÷ Σ of those weights;
 * isometric % = Σ(phase weight × phase %) ÷ 100.
 * A phase without any such driver drops out like a driver does, and the remaining phases renormalise
 * (with every phase in scope this is exactly the formula above).
 */
export function isoProgress(input: IsoStatusInput): IsoProgress {
  const weights = progressWeights(input.site);
  if (!weights.configured) return { configured: false, phases: PROGRESS_PHASES.map(phase => ({ key: phase.key, label: phase.label, weight: 0, percent: null, drivers: [] })), total: null };
  const welds = isoWelds(input), inch = ndtMeasurement(input.site) === 'inch-weighted';
  const finish = ISO_FINISH_ITEMS.map((item): number | null => { const state = text(input.iso[item.field]) || 'Open'; return state === 'Done' ? 1 : state === 'Open' ? 0 : null; }).filter((value): value is number => value !== null);
  const hydrotest = input.releases ? live(input.releases).some(row => row.isoId === input.iso.id && row.type === 'Hydrotest') : null;

  /** Progress 0..1 of one driver, or null when it is out of scope. */
  const progressOf = (phase: PhaseKey, key: string): number | null => {
    if (phase === 'site') {
      if (key === 'hydrotest') return text(input.iso.testSystemId) && hydrotest !== null ? (hydrotest ? 1 : 0) : null;
      return finish.length ? finish.reduce((sum, value) => sum + value, 0) / finish.length : null;
    }
    const inPhase = welds.filter(weld => locationOf(weld, input.weldTypes) === phase);
    if (key === 'welds') {
      let total = 0, done = 0;
      for (const weld of inPhase) { const size = inchesOf(weld, input.diameters); total += size; if (hasWelder(weld)) done += size; }
      return total > 0 ? done / total : null;
    }
    if (key === 'ndt') {
      let total = 0, done = 0;
      for (const weld of inPhase.filter(weld => weld.ndoReq === true)) {
        const size = inch ? inchesOf(weld, input.diameters) : 1;
        total += size;
        if (resultsOf(input.results, weld.id, ['NDT'])[0]?.result === 'Accepted') done += size;
      }
      return total > 0 ? done / total : null;
    }
    if (key === 'punch') {
      if (phase !== 'field') return null;
      // The progress entered on the isometric counts once there is one; a caller may still pass its own value.
      if (typeof input.punchProgress === 'number') return Math.min(1, Math.max(0, input.punchProgress));
      return hasPunchProgress(input.iso) ? punchProgress(input.iso) : null;
    }
    const quantity = ISO_QUANTITIES.find(item => item.phase === phase && item.key === key);
    const budget = quantity ? budgetOf(input.budgets, phase, quantity.key) : 0;
    if (!quantity || !budget) return null;
    return Math.min(1, Math.max(0, (quantityOf(input.iso[quantity.field]) ?? 0) / budget));
  };

  const phases = PROGRESS_PHASES.map(phase => {
    const drivers: DriverProgress[] = phase.activities.map(activity => {
      const weight = weights.activities[phase.key][activity.key] ?? 0, progress = progressOf(phase.key, activity.key);
      return { key: activity.key, label: activity.label, weight, inScope: progress !== null && weight > 0, progress: progress !== null && weight > 0 ? progress : null, earned: null };
    });
    const scope = drivers.filter(driver => driver.inScope), sum = scope.reduce((total, driver) => total + driver.weight, 0);
    const fraction = sum > 0 ? scope.reduce((total, driver) => total + driver.weight * driver.progress!, 0) / sum : null;
    return { phase, drivers, sum, fraction, weight: weights.phases[phase.key] };
  });
  // Phases with a weight and something in scope share the isometric's 100 %.
  const active = phases.filter(entry => entry.weight > 0 && entry.fraction !== null);
  const activeWeight = active.reduce((total, entry) => total + entry.weight, 0);
  let total = 0;
  for (const entry of active) {
    for (const driver of entry.drivers.filter(driver => driver.inScope)) driver.earned = entry.weight / activeWeight * (driver.weight / entry.sum) * driver.progress! * 100;
    total += entry.weight / activeWeight * entry.fraction! * 100;
  }
  return {
    configured: true,
    phases: phases.map(entry => ({ key: entry.phase.key, label: entry.phase.label, weight: entry.weight, percent: entry.fraction === null ? null : percent1(entry.fraction), drivers: entry.drivers })),
    total: active.length ? round1(total) : null,
  };
}
