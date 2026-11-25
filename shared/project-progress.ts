import type { Row } from './types.ts';
import { addProgressUnits, emptyProgressUnits, progressFromUnits, type PhaseProgress, type ProgressUnits } from './progress-model.ts';

/**
 * Progress of a whole main project (client change list 22.11.2026, F4): every activity's units (done / total) are
 * pooled over the isometrics before the percentages are taken, so a large isometric weighs more than a small one
 * (dia-inch for the weld activities, pieces for supports, flanges for reinstatement; the 0/1 activities count each
 * isometric once). The weights and the rule for an activity without anything to measure are those of
 * `progressFromUnits()` (shared/progress-model.ts). An empty project gives 0 everywhere, never NaN.
 */
export interface ProjectProgress {
  /** 0–100, one decimal. */
  total: number;
  shop: PhaseProgress;
  field: PhaseProgress;
  /** The isometrics pooled. */
  isometrics: number;
}

/** Pools the units of the given isometric progresses (summary.progress or isoProgress results; absent entries count nothing). */
export function projectProgress(progresses: Iterable<{ units?: ProgressUnits | null } | null | undefined>): ProjectProgress {
  const units = emptyProgressUnits();
  let isometrics = 0;
  for (const progress of progresses) { if (!progress?.units) continue; addProgressUnits(units, progress.units); isometrics += 1; }
  const result = progressFromUnits(units);
  return { total: result.total, shop: result.phases.find(phase => phase.key === 'shop')!, field: result.phases.find(phase => phase.key === 'field')!, isometrics };
}

/**
 * The main project's progress on the client, from what the workspace already holds: the non-archived `isometrics`
 * (optionally of one subproject, `projectId`) and their server summaries (`useWorkspace().isoSummaries`). An
 * isometric without a summary counts nothing.
 */
export function mainProjectProgress(isometrics: Row[] | null | undefined, summaries: Record<string, { progress: { units: ProgressUnits } }> | null | undefined, filter: { projectId?: string; isoIds?: Iterable<string> } = {}): ProjectProgress {
  const only = filter.isoIds ? new Set(filter.isoIds) : null;
  const chosen = (isometrics || []).filter(iso => !iso._archived && (!filter.projectId || String(iso.projectId) === filter.projectId) && (!only || only.has(iso.id)));
  return projectProgress(chosen.map(iso => summaries?.[iso.id]?.progress));
}
