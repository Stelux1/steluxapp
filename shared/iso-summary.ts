import type { Row } from './types.ts';
import { PROGRESS_PHASES, type PhaseKey } from './site-settings.ts';
import { isoBlockers, isoBudgets, isoProgress, isoQuality, type BlockerKey, type IsoProgress, type ProgressBudgets } from './iso-status.ts';
import { materialStatus } from './mto-materials.ts';
import { punchCounts, type PunchCounts } from './punch.ts';
import { hydrotestState } from './hydrotest.ts';
import { isoFlags, isoKpiFacts, isoListContext, type IsoFlags, type IsoKpiFacts } from './iso-list.ts';
import { wdiProgress } from './wdi.ts';
import { qaCounts, type QaCounts } from './iso-overview.ts';

/**
 * The summary of one isometric: the numbers its header and the isometrics list show, as aggregates only.
 *
 * The hosted profile computes it on the server from every record of the isometric, whichever pilot asks, so
 * Weld Pilot and MTO Pilot show the same progress, quality, blocker total, flags and KPI cards. It must never
 * carry a record: no weld numbers, welder names, heat / charge numbers, result details or material lines.
 * Only counts, percentages and yes / no values belong here (see `tests/access.test.ts`), with ONE label as the
 * exception: `testSystemName`, the name of the isometric's own test system, so the MTO Pilot header can show it
 * (MTO Pilot reads no test systems). No other field of the test system and no other text may be added.
 *
 * Adding a value: compute it in `isoSummary()` below from the grouped rows (extend `IsoSummarySource` and the
 * server's loader in `server/iso-summary.ts` if it needs another collection), keep it an aggregate, add it to
 * the payload test, and read it on the client from `useWorkspace().isoSummaries`.
 */
export interface IsoSummary {
  progress: {
    /** False while the site has no progress weights. */
    configured: boolean;
    /** Shop / Field / Site, one decimal (0 while nothing weighted of the phase is in scope); null only while not configured. */
    phases: { key: PhaseKey; percent: number | null }[];
    /** The isometric's percentage, one decimal; null only while not configured. */
    total: number | null;
  };
  /** Accepted NDT / NDT PRE results ÷ (accepted + NA) over the welds that are not repair welds (`isoQuality`). */
  quality: { percent: number | null; accepted: number; rejected: number };
  /** "N open" and what each group adds to it, without the items. */
  blockers: { total: number; groups: { key: BlockerKey; count: number }[] };
  /** The list's flag columns and the Filter dialog's NDT choice. */
  flags: IsoFlags;
  /** What the isometric adds to the KPI cards. */
  kpi: IsoKpiFacts;
  /** The open examinations behind the QA badges of the project's Iso overview (counts per examination); null when welds or results are not delivered. */
  qa: QaCounts | null;
  /** MTO quantity budgets of the progress drivers (pipe m, supports and appendages pcs per Shop / Field); absent without classified lines. */
  budgets?: ProgressBudgets;
  /** Material status % (shared/mto-materials.ts `materialStatus`): covered ÷ required, one decimal; null while nothing is required or the material records are not delivered. */
  materialStatus: { percent: number | null };
  /** Punch counts of the isometric's own items (shared/punch.ts `punchCounts`); null when punch items are not delivered. */
  punch: PunchCounts | null;
  /** Hydrotest state (shared/hydrotest.ts `hydrotestState`). */
  hydrotest: { inScope: boolean; completed: boolean };
  /** The only label: the name of the isometric's test system; absent without one (or while test systems are not delivered). */
  testSystemName?: string;
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
  /** Spools and hydrotest results: the hydrotest follows the test systems of an isometric's spools (shared/hydrotest.ts). */
  spools?: Row[] | null;
  hydrotestResults?: Row[] | null;
  /** Material requirements (the MTO budget of the progress drivers, once component codes exist). */
  requirements: Row[] | null;
  /** Catalog rows the budgets classify requirement lines with (see `isoBudgets()` in shared/mto-materials.ts). */
  materials?: Row[] | null;
  customMaterials?: Row[] | null;
  operationPhases?: Row[] | null;
  /** Orders, order lines, stock and pick lists: what Material status % covers a requirement line with. */
  orders?: Row[] | null;
  orderLines?: Row[] | null;
  stock?: Row[] | null;
  /** Storehouses: an old-model stock row counts for the main project its storehouse names (shared/mto-stock.ts). */
  warehouses?: Row[] | null;
  picklists?: Row[] | null;
  /** Reservations and every isometric of the workspace: the free stock of Material status % leaves out what others reserved or claim. */
  reservations?: Row[] | null;
  allIsometrics?: Row[] | null;
  /** Calculation lines (E), documents and drawing revisions (Doc.); absent or null when not delivered. */
  calculations?: Row[] | null;
  attachments?: Row[] | null;
  revisions?: Row[] | null;
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
  const spools = groupBy(source.spools ?? null, row => String(row.isoId));
  const requirements = groupBy(source.requirements, row => String(row.isoId));
  const projects = new Map(source.projects.map(row => [row.id, row]));
  const sites = new Map(source.sites.map(row => [row.id, row]));
  const namedTestSystems = new Map((source.testSystems || []).filter(row => !row._archived && String(row.name ?? '').trim()).map(row => [row.id, row]));
  // The one label of a summary. Only a test system of the isometric's own project, or of no project (shared), is named:
  // the isometric is one the caller may read, so such a test system lies within the caller's main projects too. A link
  // to another project's test system (possible in older data) never shows that project's name.
  const testSystemName = (iso: Row) => {
    const system = namedTestSystems.get(String(iso.testSystemId ?? ''));
    return system && (!system.projectId || system.projectId === iso.projectId) ? String(system.name).trim() : undefined;
  };
  const context = isoListContext({
    welds: source.welds, weldTypes: source.weldTypes, results: source.results, releases: source.releases, planning: source.planning,
    picklists: source.picklists ?? null, requirements: source.requirements, calculations: source.planning ? source.calculations ?? null : null,
    attachments: source.attachments ?? null, revisions: source.revisions ?? null, projects: source.projects, sites: source.sites,
  });
  const output: Record<string, IsoSummary> = {};
  for (const iso of source.isometrics) {
    const site = sites.get(String(projects.get(String(iso.projectId))?.siteId)) ?? null;
    const input = {
      iso, site, welds: welds.get(iso.id) || [], weldTypes: source.weldTypes || [], diameters: source.diameters || [], results: results.get(iso.id) || [],
      releases: source.releases ? releases.get(iso.id) || [] : null, punch: source.punch ? punch.get(iso.id) || [] : null,
      testSystems: source.testSystems ?? null, hydrotestRequests: source.hydrotestRequests ?? null, spools: source.spools ? spools.get(iso.id) || [] : null, hydrotestResults: source.hydrotestResults ?? null,
      budgets: source.requirements ? isoBudgets(iso, { iso_materials: requirements.get(iso.id) || [], materials: source.materials || [], custom_materials: source.customMaterials || [], operation_phases: source.operationPhases || [], ...(source.picklists ? { picklists: source.picklists } : {}) }) : undefined,
    };
    const blockers = isoBlockers(input), quality = isoQuality(input), progress = isoProgress(input), flags = isoFlags(iso, context);
    const material = source.requirements && source.materials ? materialStatus(iso, materialRows(source, iso, requirements.get(iso.id) || [])).percent : null;
    const hydrotest = hydrotestState(iso, { test_systems: source.testSystems ?? null, hydrotest_requests: source.hydrotestRequests ?? null, releases: source.releases ? releases.get(iso.id) || [] : null, spools: input.spools, hydrotest_results: source.hydrotestResults ?? null });
    output[iso.id] = {
      progress: { configured: progress.configured, phases: progress.phases.map(phase => ({ key: phase.key, percent: phase.percent })), total: progress.total },
      quality: { percent: quality.percent, accepted: quality.accepted, rejected: quality.rejected },
      blockers: { total: blockers.total, groups: blockers.groups.map(group => ({ key: group.key, count: group.count })) },
      flags, kpi: isoKpiFacts(flags),
      qa: context.weldsByIso && context.latest ? qaCounts(welds.get(iso.id) || [], (weldId, type) => context.latest!.get(`${weldId}|${type}`)) : null,
      ...(input.budgets ? { budgets: input.budgets } : {}),
      materialStatus: { percent: material },
      punch: source.punch ? punchCounts(punch.get(iso.id) || []) : null,
      hydrotest: { inScope: hydrotest.inScope, completed: hydrotest.completed },
      ...(testSystemName(iso) ? { testSystemName: testSystemName(iso)! } : {}),
    };
  }
  return output;
}

/** The rows `materialStatus()` reads for one isometric: its own requirement lines plus the shared order, stock, pick-list and reservation rows. */
function materialRows(source: IsoSummarySource, iso: Row, requirements: Row[]): Record<string, Row[]> {
  return { isometrics: source.allIsometrics || source.isometrics, projects: source.projects, iso_materials: requirements, materials: source.materials || [], custom_materials: source.customMaterials || [],
    orders: source.orders || [], order_lines: source.orderLines || [], stock: source.stock || [], warehouses: source.warehouses || [], picklists: source.picklists || [], reservations: source.reservations || [] };
}

/**
 * Status (%) of each project in the Projects list: the weld completion of its isometrics (`wdiProgress`, shared/wdi.ts,
 * the figure Weld Pilot has always shown). Computed on the server from every weld, so MTO Pilot, which reads no welds,
 * shows the same figure. Only a number per project leaves.
 */
export function projectStatuses(source: { projects: Row[]; isometrics: Row[]; welds: Row[] | null; diameters: Row[] | null }): Record<string, number> {
  const isoProject = new Map(source.isometrics.filter(iso => !iso._archived).map(iso => [iso.id, String(iso.projectId)]));
  const byProject = groupBy((source.welds || []).filter(weld => isoProject.has(String(weld.isoId))), weld => isoProject.get(String(weld.isoId))!);
  return Object.fromEntries(source.projects.map(project => [project.id, wdiProgress(byProject.get(project.id) || [], source.diameters || []).percent]));
}

/** A percentage as the reference writes it: one decimal at most and no space before the sign ('0%', '72.7%'). */
export const percentText = (value: number) => `${Math.round((Number(value) || 0) * 10) / 10}%`;

/** Texts of the Progress card (reference weld__iso__0001__progress-card.txt; Field and Site tips from _interactive/I1). */
export const PROGRESS_CARD_TEXTS = {
  phase: {
    shop: 'Shop prefab phase (welds, NDT, shop-typed material).',
    field: 'Field erection phase (pipe, welds, NDT, supports, appendages, punch).',
    site: 'Site is its own share of the total (Shop + Field + Site = 100%). Hydrotest and Paint/Tracing split the Site phase.',
  } as Record<PhaseKey, string>,
  percent: 'Weighted completion of this phase. Same source as Status and BBE.',
  budgetColumn: { shop: 'Ceiling: Shop issued / Shop MTO', field: 'Budget (MTO)' },
  specification: 'Specification',
  finish: 'Mark as done, or N/A when paint, tracing or insulation is not required on this ISO.',
  save: 'Save shop, field and site values.',
};
/** The bar text of a quantity row: its share in whole percent, or without a budget 'N/A' (Shop) / '0%' (Field) as in the reference. */
export function quantityBarText(phase: 'shop' | 'field', budget: number, progress: number | null): string {
  if (!budget) return phase === 'shop' ? 'N/A' : '0%';
  return `${Math.round((progress ?? 0) * 100)}%`;
}
/** The Specification of each Site row: Paint spec., Tracing Spec and Insulation of the isometric ('—' when empty). */
export const FINISH_SPECIFICATION_FIELDS: Record<string, string> = { paintState: 'paintSpec', tracingState: 'tracing', insulationState: 'insulation' };
export const finishSpecification = (iso: Row, finishField: string) => String(iso[FINISH_SPECIFICATION_FIELDS[finishField]] ?? '').trim() || '—';

/** The progress card's view of a summary (no driver detail: the summary does not carry it). */
export const summaryProgress = (summary: IsoSummary): IsoProgress => ({
  configured: summary.progress.configured, total: summary.progress.total,
  phases: PROGRESS_PHASES.map(phase => ({ key: phase.key, label: phase.label, weight: 0, percent: summary.progress.phases.find(item => item.key === phase.key)?.percent ?? null, drivers: [] })),
});

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
/** The line a blocker group shows when its items cannot be listed (the welds are not readable in this pilot). */
export function blockerCountText(key: BlockerKey, count: number): string {
  switch (key) {
    case 'release': return count === 1 ? 'One phase is not released yet' : 'Prefab and Field are not released yet';
    case 'welds': return `${plural(count, 'weld')} with a welder ${count === 1 ? 'is' : 'are'} missing required fields.`;
    case 'ndt': return `${plural(count, 'required examination')} ${count === 1 ? 'has' : 'have'} no result yet.`;
    case 'repair': return `${plural(count, 'weld')} ${count === 1 ? 'was' : 'were'} rejected and ${count === 1 ? 'waits' : 'wait'} for an accepted re-examination.`;
    case 'punch': return `${plural(count, 'open punch item')}.`;
  }
}
