/**
 * THE progress model of an isometric and of a main project (client change list of 22.11.2026, images 6 and 7).
 *
 * This constant is the single place where the phases, their activities and the weights are defined. A developer
 * changes a weight here; the UI never does (weights stored on a project site are ignored). Rules a change must keep:
 * the activity weights of each phase add up to 100, and so do the phase weights (tests/project-progress.test.ts).
 * What each activity measures is coded in `isoProgressUnits()` (shared/iso-status.ts).
 */
export const PROGRESS_MODEL = {
  phases: [
    { key: 'shop', label: 'Shop', weight: 50, activities: [
      { key: 'fitUp', label: 'MTO / Cut-Bev / Fit-up', weight: 40 },
      { key: 'welding', label: 'Welding', weight: 40 },
      { key: 'ndt', label: 'NDT', weight: 10 },
      { key: 'fabricationBook', label: 'Fabrication Book', weight: 10 },
    ] },
    { key: 'field', label: 'Field', weight: 50, activities: [
      { key: 'erection', label: 'Spools erection / Fit-up', weight: 30 },
      { key: 'supports', label: 'Supports erection', weight: 10 },
      { key: 'welding', label: 'Welding', weight: 20 },
      { key: 'ndt', label: 'NDT', weight: 10 },
      { key: 'pressureTests', label: 'Pressure tests', weight: 15 },
      { key: 'reinstatement', label: 'Reinstatement', weight: 5 },
      { key: 'finalDocumentation', label: 'Final documentation', weight: 10 },
    ] },
  ],
} as const;

export type ProgressPhaseKey = typeof PROGRESS_MODEL.phases[number]['key'];
export type ShopActivityKey = typeof PROGRESS_MODEL.phases[0]['activities'][number]['key'];
export type FieldActivityKey = typeof PROGRESS_MODEL.phases[1]['activities'][number]['key'];

/** What one activity has done of what there is to do (dia-inch, pieces, or isometrics / flanges counted 0 or 1). `total` 0: nothing to measure. */
export interface ProgressUnit { done: number; total: number }
/** The measured units of every activity, by phase and activity key. Sums of units pool across isometrics. */
export interface ProgressUnits { shop: Record<ShopActivityKey, ProgressUnit>; field: Record<FieldActivityKey, ProgressUnit> }

export interface ActivityProgress {
  key: string; label: string;
  /** Fixed weight inside its phase, percent (PROGRESS_MODEL). */
  weight: number;
  /** 0–100, one decimal; null when there is nothing to measure (`total` 0). */
  progress: number | null;
  /** Percentage points of the phase this activity has earned: weight × progress / 100 (0 while progress is null), one decimal. */
  contribution: number;
  /** progress !== null: the activity counts toward its phase. */
  inScope: boolean;
  done: number; total: number;
}
export interface PhaseProgress {
  key: ProgressPhaseKey; label: string;
  /** Fixed share of the phase in the total, percent (50 / 50). */
  weight: number;
  /** 0–100, one decimal: Σ(weight × progress) ÷ Σ weight over the activities in scope; 0 when none is in scope. */
  percent: number;
  /** Percentage points of the total this phase has earned (weight × percent / 100), one decimal. */
  contribution: number;
  activities: ActivityProgress[];
}
export interface ProgressResult { phases: PhaseProgress[]; /** 0–100, one decimal. */ total: number }

const round1 = (value: number) => Math.round(value * 10) / 10;
const finite = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };

/** Units with nothing measured (every activity 0 of 0). */
export function emptyProgressUnits(): ProgressUnits {
  return Object.fromEntries(PROGRESS_MODEL.phases.map(phase => [phase.key, Object.fromEntries(phase.activities.map(activity => [activity.key, { done: 0, total: 0 }]))])) as unknown as ProgressUnits;
}

/** Adds `units` into `into` activity by activity (pooling numerators and denominators); missing or broken values count 0. */
export function addProgressUnits(into: ProgressUnits, units: Partial<Record<ProgressPhaseKey, Partial<Record<string, Partial<ProgressUnit>>>>> | null | undefined): ProgressUnits {
  for (const phase of PROGRESS_MODEL.phases) for (const activity of phase.activities) {
    const unit = units?.[phase.key]?.[activity.key], target = (into[phase.key] as Record<string, ProgressUnit>)[activity.key];
    if (!unit) continue;
    const total = finite(unit.total);
    target.total += total; target.done += Math.min(finite(unit.done), total);
  }
  return into;
}

/**
 * Percentages from measured units with the fixed weights of PROGRESS_MODEL.
 * Activity: done ÷ total; total 0 → not measurable (null), and it is left out of its phase: the other activities of
 * the phase share its weight (phase % = Σ(weight × progress) ÷ Σ weight of the measurable ones). This is the rule the
 * earlier model had for a driver without a denominator. A phase with nothing measurable is 0 % and drops out of the
 * total the same way; total = Σ(phase weight × phase %) ÷ Σ weight of the phases that count; 0 when none does.
 */
export function progressFromUnits(units: ProgressUnits | null | undefined): ProgressResult {
  const pooled = addProgressUnits(emptyProgressUnits(), units);
  const phases = PROGRESS_MODEL.phases.map(phase => {
    const measured = phase.activities.map(activity => { const unit = (pooled[phase.key] as Record<string, ProgressUnit>)[activity.key]; return { activity, unit, fraction: unit.total > 0 ? Math.min(1, unit.done / unit.total) : null }; });
    const scope = measured.filter(entry => entry.fraction !== null), sum = scope.reduce((total, entry) => total + entry.activity.weight, 0);
    const fraction = sum > 0 ? scope.reduce((total, entry) => total + entry.activity.weight * entry.fraction!, 0) / sum : null;
    const activities: ActivityProgress[] = measured.map(({ activity, unit, fraction: part }) => ({ key: activity.key, label: activity.label, weight: activity.weight, progress: part === null ? null : round1(part * 100), contribution: part === null ? 0 : round1(activity.weight * part), inScope: part !== null, done: unit.done, total: unit.total }));
    return { phase, fraction, activities };
  });
  const counted = phases.filter(entry => entry.fraction !== null && entry.phase.weight > 0), weightSum = counted.reduce((total, entry) => total + entry.phase.weight, 0);
  const total = weightSum > 0 ? counted.reduce((sum, entry) => sum + entry.phase.weight * entry.fraction!, 0) / weightSum * 100 : 0;
  return {
    phases: phases.map(entry => ({ key: entry.phase.key, label: entry.phase.label, weight: entry.phase.weight, percent: entry.fraction === null ? 0 : round1(entry.fraction * 100), contribution: entry.fraction === null ? 0 : round1(entry.phase.weight * entry.fraction), activities: entry.activities })),
    total: round1(total),
  };
}

/** The explanation of the model, for the main project form and the dashboard (one line per activity). */
export const PROGRESS_MODEL_HELP = {
  intro: 'The progress of an isometric is Shop 50% and Field 50%. Each phase is built from fixed activity weights.',
  lines: {
    shop: {
      fitUp: 'Dia-inch of the Shop welds with a fit-up date (a welded weld counts as fitted).',
      welding: 'Dia-inch of the Shop welds with a welder and a weld date.',
      ndt: 'Dia-inch of the Shop welds that need NDT and whose latest NDT result (after any repair) is Accepted.',
      fabricationBook: 'The Prefab release is completed.',
    },
    field: {
      erection: 'Dia-inch of the Field welds with a fit-up date (a welded weld counts as fitted).',
      supports: 'Supports installed in the field, against the supports of the MTO.',
      welding: 'Dia-inch of the Field welds with a welder and a weld date.',
      ndt: 'Dia-inch of the Field welds that need NDT and whose latest NDT result (after any repair) is Accepted.',
      pressureTests: 'The hydrotest of the isometric is completed.',
      reinstatement: 'Flanges of the isometric that are Finished (an isometric without flanges follows Pressure tests).',
      finalDocumentation: 'The Field release is completed.',
    },
  } as { shop: Record<ShopActivityKey, string>; field: Record<FieldActivityKey, string> },
  rule: 'An activity with nothing to measure on an isometric (for example no Field welds) is left out, and the other activities of its phase share its weight.',
};
