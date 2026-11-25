import type { ProjectProgress } from './project-progress.ts';
import type { PhaseProgress, ProgressPhaseKey } from './progress-model.ts';

/**
 * Pure helpers of the "Project completion" section of the Weld Core dashboard (client change list 22.11.2026, B1-B3):
 * chart geometry (ring segments), the labels and the view model. The numbers come from `mainProjectProgress()`
 * (shared/project-progress.ts); nothing is recomputed here except how they are drawn and worded.
 */

/** Phase names as the dashboard shows them: Prefabrication = Shop, Erection = Field. */
export const COMPLETION_PHASES: Record<ProgressPhaseKey, { tab: string; title: string; long: string }> = {
  shop: { tab: 'Prefabrication', title: 'Prefabrication (Shop)', long: 'Prefabrication' },
  field: { tab: 'Erection', title: 'Erection (Field)', long: 'Erection' },
};
export const COMPLETION_TEXTS = {
  eyebrow: 'MAIN PROJECT · ALL SUB-PROJECTS', title: 'Project completion', subtitle: 'Prefabrication and erection, weighted progress per phase',
  remaining: 'Remaining', loading: 'Loading project progress…', unavailable: 'Project progress is not available for this workspace yet.',
  empty: 'No isometrics in this main project yet, so there is nothing to measure. Progress starts at 0 % and follows as isometrics are added.',
  notMeasurable: 'Nothing to measure yet', noValue: '—',
} as const;
/** Why an activity cannot be measured yet (its denominator is 0), by phase and activity key. */
export const NOT_MEASURABLE_REASON: Record<ProgressPhaseKey, Record<string, string>> = {
  shop: { fitUp: 'No Shop welds yet.', welding: 'No Shop welds yet.', ndt: 'No Shop weld needs NDT.', fabricationBook: 'No isometrics yet.' },
  field: { erection: 'No Field welds yet.', supports: 'No supports in the MTO.', welding: 'No Field welds yet.', ndt: 'No Field weld needs NDT.', pressureTests: 'No hydrotest in scope.', reinstatement: 'No flanges or hydrotest in scope.', finalDocumentation: 'No isometrics yet.' },
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
/** "64.5 %": one decimal, a trailing ".0" dropped ("40 %"). */
export const percentText = (value: number) => `${String(round1(clamp(value, 0, 100)))} %`;
/** "34 / 40 pp" (points earned of the points the weight allows). */
export const pointsText = (earned: number, of: number) => `${round1(earned)} / ${round1(of)} pp`;

// ----- ring geometry ---------------------------------------------------------------------------------------------------

export interface RingSegment { key: string; /** Points of the whole ring (0-100) this segment covers. */ value: number; /** SVG stroke-dasharray "<length> <rest>". */ dashArray: string; /** SVG stroke-dashoffset. */ dashOffset: number; /** Start and end angle in degrees, 0 = 12 o'clock, clockwise. */ from: number; to: number; }
export const RING_RADIUS = 42;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Splits a ring into consecutive segments, in order. `values` are points of a ring of `whole` (default 100); a value
 * below 0 or not finite counts 0 and the segments never run past the full circle (the surplus is cut).
 */
export function ringSegments(values: { key: string; value: number }[], whole = 100, circumference = RING_CIRCUMFERENCE): RingSegment[] {
  let used = 0;
  return values.map(({ key, value }) => {
    const points = Math.min(Math.max(0, Number.isFinite(value) ? value : 0), Math.max(0, whole - used)), start = used;
    used += points;
    const length = whole > 0 ? points / whole * circumference : 0;
    return { key, value: round1(points), dashArray: `${length.toFixed(3)} ${(circumference - length).toFixed(3)}`, dashOffset: whole > 0 && start > 0 ? -(start / whole * circumference) : 0, from: whole > 0 ? start / whole * 360 : 0, to: whole > 0 ? used / whole * 360 : 0 };
  });
}

// ----- view model ------------------------------------------------------------------------------------------------------

export interface ActivityCard {
  key: string; label: string; measurable: boolean; percent: number;
  /** "64 %", or "—" while nothing can be measured. */ percentLabel: string;
  weightLabel: string; contributionLabel: string; /** Why there is no figure ('' when measurable). */ reason: string;
  /** Text for screen readers / the donut's aria-label. */ summary: string;
}
export interface PhaseCompletion {
  key: ProgressPhaseKey; tab: string; title: string; percent: number; weight: number; contribution: number; counted: boolean;
  /** Points of the ring this phase covers (see `projectCompletion`). */ ringValue: number;
  activities: ActivityCard[]; weightsTotal: number; weightsLabel: string;
}
export interface ProjectCompletion {
  total: number; totalLabel: string; isometrics: number; empty: boolean; phases: PhaseCompletion[]; ring: RingSegment[];
  /** "Prefabrication (Shop) 64.5 % · Erection (Field) 44.5 %". */ legend: string; distribution: string; ringLabel: string;
}

function activityCard(phase: PhaseProgress, activity: PhaseProgress['activities'][number]): ActivityCard {
  const measurable = activity.inScope && activity.progress !== null, percent = measurable ? activity.progress! : 0;
  const reason = measurable ? '' : NOT_MEASURABLE_REASON[phase.key]?.[activity.key] ?? COMPLETION_TEXTS.notMeasurable;
  const weightLabel = `Weight in phase: ${percentText(activity.weight)}`;
  const contributionLabel = measurable ? `Contribution: ${pointsText(activity.contribution, activity.weight)}` : `Contribution: ${COMPLETION_TEXTS.noValue} / ${round1(activity.weight)} pp`;
  const percentLabel = measurable ? percentText(percent) : COMPLETION_TEXTS.noValue;
  return { key: activity.key, label: activity.label, measurable, percent, percentLabel, weightLabel, contributionLabel, reason,
    summary: measurable ? `${activity.label}: ${percentLabel} complete. ${weightLabel}. ${contributionLabel}.` : `${activity.label}: no figure yet. ${reason} ${weightLabel}.` };
}

/** Everything the section draws, from the main-project aggregate. An empty project gives 0 % and a flag, never NaN. */
export function projectCompletion(progress: Pick<ProjectProgress, 'total' | 'shop' | 'field' | 'isometrics'>): ProjectCompletion {
  const source = [progress.shop, progress.field];
  const counted = source.map(phase => phase.activities.some(activity => activity.inScope));
  const weightSum = source.reduce((sum, phase, index) => sum + (counted[index] ? phase.weight : 0), 0);
  const phases = source.map((phase, index): PhaseCompletion => {
    const names = COMPLETION_PHASES[phase.key], weightsTotal = phase.activities.reduce((sum, activity) => sum + activity.weight, 0);
    // The ring shows each phase's share of the total: its contribution, rescaled when a phase without anything to measure drops out of the total.
    const ringValue = counted[index] && weightSum > 0 ? round1(phase.weight * phase.percent / weightSum) : 0;
    return { key: phase.key, tab: names.tab, title: names.title, percent: phase.percent, weight: phase.weight, contribution: phase.contribution, counted: counted[index], ringValue, activities: phase.activities.map(activity => activityCard(phase, activity)), weightsTotal, weightsLabel: `Weights total: ${percentText(weightsTotal)}` };
  });
  const total = clamp(progress.total, 0, 100), remaining = Math.max(0, round1(100 - phases.reduce((sum, phase) => sum + phase.ringValue, 0)));
  const ring = ringSegments([...phases.map(phase => ({ key: phase.key, value: phase.ringValue })), { key: 'remaining', value: remaining }]);
  const legend = phases.map(phase => `${phase.title} ${percentText(phase.percent)}`).join(' · ');
  const distribution = phases.map(phase => `${phase.tab} ${percentText(phase.weight)}`).join(' / ');
  return { total, totalLabel: percentText(total), isometrics: progress.isometrics, empty: progress.isometrics === 0, phases, ring, legend, distribution,
    ringLabel: `Project completion ${percentText(total)}. ${phases.map(phase => `${phase.title} ${percentText(phase.percent)} complete, ${round1(phase.ringValue)} of ${round1(phase.weight)} points`).join('. ')}.` };
}

/** Arrow-key navigation of the phase tabs (ARIA tabs pattern): next / previous wrap around, Home / End jump. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
