import type { Row } from './types.ts';
import { PROGRESS_PHASES, type PhaseKey } from './site-settings.ts';
import { isoBlockers, isoBudgets, isoProgress, isoQuality, type BlockerKey, type IsoProgress } from './iso-status.ts';
import { isoFlags, isoKpiFacts, isoListContext, type IsoFlags, type IsoKpiFacts } from './iso-list.ts';

/**
 * The summary of one isometric: the numbers its header and the isometrics list show, as aggregates only.
 *
 * The hosted profile computes it on the server from every record of the isometric, whichever pilot asks, so
 * Weld Pilot and MTO Pilot show the same progress, quality, blocker total, flags and KPI cards. It must never
 * carry a record: no weld numbers, welder names, heat / charge numbers, result details or material lines.
 * Only counts, percentages and yes / no values belong here (see `tests/access.test.ts`).
 *
 * Adding a value: compute it in `isoSummary()` below from the grouped rows (extend `IsoSummarySource` and the
 * server's loader in `server/iso-summary.ts` if it needs another collection), keep it an aggregate, add it to
 * the payload test, and read it on the client from `useWorkspace().isoSummaries`.
 */
export interface IsoSummary {
  progress: {
    /** False while the site has no progress weights. */
    configured: boolean;
    /** Shop / Field / Site, one decimal; null while nothing of the phase is in scope. */
    phases: { key: PhaseKey; percent: number | null }[];
    /** The isometric's percentage, one decimal. */
    total: number | null;
  };
  /** Accepted NDT results / (accepted + rejected). */
  quality: { percent: number | null; accepted: number; rejected: number };
  /** "N open" and what each group adds to it, without the items. */
  blockers: { total: number; groups: { key: BlockerKey; count: number }[] };
  /** The list's flag columns and the Filter dialog's NDT choice. */
  flags: IsoFlags;
  /** What the isometric adds to the KPI cards. */
  kpi: IsoKpiFacts;
}

/** Every collection the summary reads. `null`: the collection is not delivered by the release profile. */
export interface IsoSummarySource {
  isometrics: Row[];
  projects: Row[];
  sites: Row[];
  welds: Row[] | null;
  weldTypes: Row[] | null;
  diameters: Row[] | null;
  results: Row[] | null;
  releases: Row[] | null;
  punch: Row[] | null;
  /** Test systems and hydrotest requests (the hydrotest driver, shared/hydrotest.ts); absent or null when unreadable. */
  testSystems?: Row[] | null;
  hydrotestRequests?: Row[] | null;
  /** Material requirements (the MTO budget of the progress drivers, once component codes exist). */
  requirements: Row[] | null;
  /** Catalog rows the budgets classify requirement lines with (see `isoBudgets()` in shared/mto-materials.ts). */
  materials?: Row[] | null;
  customMaterials?: Row[] | null;
  operationPhases?: Row[] | null;
  /** The calculation feature is delivered: the E flag exists. */
  planning: boolean;
}

const groupBy = (rows: Row[] | null, key: (row: Row) => string) => {
  const map = new Map<string, Row[]>();
  for (const row of rows || []) { const value = key(row); const list = map.get(value); if (list) list.push(row); else map.set(value, [row]); }
  return map;
};

/**
 * Summaries of the given isometrics in one pass: every collection is grouped once, then each isometric's
 * calculations read only its own rows. The formulas are those of `shared/iso-status.ts` and `shared/iso-list.ts`.
 */
export function isoSummaries(source: IsoSummarySource): Record<string, IsoSummary> {
  const welds = groupBy(source.welds, row => String(row.isoId));
  const weldIso = new Map((source.welds || []).map(row => [row.id, String(row.isoId)]));
  const results = groupBy(source.results, row => weldIso.get(String(row.weldId)) ?? '');
  const releases = groupBy(source.releases, row => String(row.isoId));
  const punch = groupBy(source.punch, row => String(row.isoId));
  const requirements = groupBy(source.requirements, row => String(row.isoId));
  const projects = new Map(source.projects.map(row => [row.id, row]));
  const sites = new Map(source.sites.map(row => [row.id, row]));
  const context = isoListContext({ welds: source.welds, weldTypes: source.weldTypes, results: source.results, releases: source.releases, planning: source.planning });
  const output: Record<string, IsoSummary> = {};
  for (const iso of source.isometrics) {
    const site = sites.get(String(projects.get(String(iso.projectId))?.siteId)) ?? null;
    const input = {
      iso, site, welds: welds.get(iso.id) || [], weldTypes: source.weldTypes || [], diameters: source.diameters || [], results: results.get(iso.id) || [],
      releases: source.releases ? releases.get(iso.id) || [] : null, punch: source.punch ? punch.get(iso.id) || [] : null,
      testSystems: source.testSystems ?? null, hydrotestRequests: source.hydrotestRequests ?? null,
      budgets: source.requirements ? isoBudgets(iso, { iso_materials: requirements.get(iso.id) || [], materials: source.materials || [], custom_materials: source.customMaterials || [], operation_phases: source.operationPhases || [] }) : undefined,
    };
    const blockers = isoBlockers(input), quality = isoQuality(input), progress = isoProgress(input), flags = isoFlags(iso, context);
    output[iso.id] = {
      progress: { configured: progress.configured, phases: progress.phases.map(phase => ({ key: phase.key, percent: phase.percent })), total: progress.total },
      quality: { percent: quality.percent, accepted: quality.accepted, rejected: quality.rejected },
      blockers: { total: blockers.total, groups: blockers.groups.map(group => ({ key: group.key, count: group.count })) },
      flags, kpi: isoKpiFacts(flags),
    };
  }
  return output;
}

/** The progress card's view of a summary (no driver detail: the summary does not carry it). */
export const summaryProgress = (summary: IsoSummary): IsoProgress => ({
  configured: summary.progress.configured, total: summary.progress.total,
  phases: PROGRESS_PHASES.map(phase => ({ key: phase.key, label: phase.label, weight: 0, percent: summary.progress.phases.find(item => item.key === phase.key)?.percent ?? null, drivers: [] })),
});

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
/** The line a blocker group shows when its items cannot be listed (the welds are not readable in this pilot). */
export function blockerCountText(key: BlockerKey, count: number): string {
  switch (key) {
    case 'release': return 'The shop welds have not been released for prefab yet.';
    case 'welds': return `${plural(count, 'weld')} with a welder ${count === 1 ? 'is' : 'are'} missing required fields.`;
    case 'ndt': return `${plural(count, 'required examination')} ${count === 1 ? 'has' : 'have'} no result yet.`;
    case 'repair': return `${plural(count, 'weld')} ${count === 1 ? 'was' : 'were'} rejected and ${count === 1 ? 'waits' : 'wait'} for an accepted re-examination.`;
    case 'punch': return `${plural(count, 'open punch item')}.`;
  }
}
