import type { Field, Row } from './types.ts';
import { COMPLETION_FIELDS, isoBlockers, newest, phaseCompleted, type BlockerKey } from './iso-status.ts';
import { RELEASE_DOC_DRAWINGS } from './site-settings.ts';
import { punchBlocking, punchKind } from './punch.ts';

/**
 * Prefab and Field release, Reopen, release documents and field work packages.
 * Pure functions over plain rows (no I/O), shared by the pages and by the server's validation.
 *
 * What the reference capture states: the two release pages and their columns, "Prefab ready / not ready",
 * "Field completed" with Reopen (asks for a reason) and "Create release doc", the Document settings of the main
 * project, and that field welds are locked while the isometric is Field completed. Everything that decides WHEN an
 * isometric may be released is INFERRED from the task description, not confirmed by the reference. Each inferred
 * rule is one named function below so it can be corrected in one place.
 */

export const RELEASE_PHASES = ['Prefab', 'Field'] as const;
export type ReleasePhase = typeof RELEASE_PHASES[number];
export type WeldPhase = 'shop' | 'field';
/** The weld location a release phase covers. */
export const PHASE_LOCATION: Record<ReleasePhase, WeldPhase> = { Prefab: 'shop', Field: 'field' };

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);

// ----- release records ------------------------------------------------------------------------------------------

export const RELEASE_STATES = ['Released', 'Reopened'];
const SIGNATURE_TITLES: [string, string][] = [['signSubQaqc', 'Subcontractor QA/QC'], ['signSubConstruction', 'Subcontractor Construction'], ['signPrincipalUi', 'Principal UI'], ['signContractorQaqc', 'Contractor QA/QC'], ['signContractorConstruction', 'Contractor Construction'], ['signNobo', 'NoBo']];
const releaseField = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', section: 'Release document', ...extra });
/** Fields added to the `releases` resource: who and when, the document numbering and signature block of the main project, and Reopen. */
export const RELEASE_EXTRA_FIELDS: Field[] = [
  releaseField('status', 'Release status', { type: 'select', options: RELEASE_STATES, default: RELEASE_STATES[0] }),
  releaseField('releasedBy', 'Released by'),
  releaseField('releasedAt', 'Released at'),
  releaseField('docNo', 'Release doc number'),
  releaseField('docPrefix', 'Document prefix'),
  releaseField('docDrawingRule', 'Release doc drawing no rule'),
  releaseField('signatureTitles', 'Signature block titles', { type: 'textarea' }),
  releaseField('reopenedAt', 'Reopened at', { section: 'Reopened' }),
  releaseField('reopenedBy', 'Reopened by', { section: 'Reopened' }),
  releaseField('reopenReason', 'Reason for reopening', { type: 'textarea', section: 'Reopened' }),
];
/** Fields the hosted profile delivers per action (see `availabilityFor`). */
export const RELEASE_ACTIONS: Record<string, string[]> = {
  release: ['type', 'isoIds', 'reportNo', 'engineerId', 'signatureId', 'date', 'note'],
  'complete-phase': ['isoId', 'type'],
  'reopen-release': ['isoId', 'type', 'reason', 'date'],
  'assign-fwp': ['isoIds', 'fieldPackageId'],
};

/** A release record counts while it is live and has not been reopened. Records stored before Reopen existed have no status and count. */
export const isReleased = (row: Row) => !row._archived && row.status !== 'Reopened';
/** The release that currently holds a phase of an isometric, or undefined. */
export const activeRelease = (releases: Row[] | null | undefined, isoId: string, type: string): Row | undefined =>
  (releases || []).filter(row => row.isoId === isoId && row.type === type && isReleased(row)).sort(newest)[0];

// ----- phase completion -----------------------------------------------------------------------------------------

/**
 * Two steps per phase, as in the reference: (1) "Prefab complete" / "Field complete" on the isometric, a confirmation
 * only, stored as `<phase>CompletedAt/By` on the isometric: it locks the phase's welds, lists the isometric on the
 * phase's release page, clears its "not released yet" blocker and ticks Pfb / Fld; Reopen undoes it. (2) The release
 * document (a `releases` record), made later for completed isometrics only. An active release from before the two
 * steps counts as completed (see `phaseCompleted`).
 */
export { COMPLETION_FIELDS, phaseCompleted } from './iso-status.ts';
/** Who completed a phase and when: the isometric's fields, else the active release that stands for it. */
export function phaseCompletion(iso: Row, type: ReleasePhase, releases?: Row[] | null): { at: string; by: string } | null {
  const fields = COMPLETION_FIELDS[type];
  if (text(iso[fields.at])) return { at: text(iso[fields.at]), by: text(iso[fields.by]) };
  const release = activeRelease(releases, iso.id, type);
  return release ? { at: text(release.releasedAt || release.date || release._createdAt), by: text(release.releasedBy) } : null;
}
/** The confirmations of the reference's Prefab complete / Field complete dialogs. */
export const COMPLETE_CONFIRM: Record<ReleasePhase, string> = {
  Prefab: 'Are you sure you want to mark this isometric as Prefab complete? The isometric will appear in the release overview. Shop welds are locked immediately.',
  Field: 'Are you sure you want to mark this isometric as Field complete? The isometric will appear in the field release overview. Hydrotest and handover follow.',
};

// ----- weld locking ---------------------------------------------------------------------------------------------

/** Shop or field, from the weld type's location; undefined when the weld has no type or the type no location. */
export function weldPhase(weld: Row, weldTypes: Row[] = []): WeldPhase | undefined {
  const location = weldTypes.find(type => type.id === weld.typeId)?.location;
  return location === 'Shop' ? 'shop' : location === 'Field' ? 'field' : undefined;
}
/**
 * Whether a weld is locked: shop welds once the isometric is Prefab complete, field welds once it is Field complete
 * (reference: "Shop welds are locked immediately."; rows locked while "Release not available"). Reopen unlocks.
 * `isometric` is the weld's isometric; without it only an active release can tell the completion. `weldTypes`
 * supplies the weld's location; a weld without one is in no phase and never locked.
 */
export function weldLocked(weld: Row, isometric: Row | undefined | null, releases: Row[] | null | undefined, weldTypes: Row[] = []): boolean {
  const phase = weldPhase(weld, weldTypes);
  if (!phase) return false;
  if (isometric && weld.isoId !== undefined && weld.isoId !== isometric.id) return false;
  const iso = isometric ?? ({ id: text(weld.isoId) } as Row);
  return phaseCompleted(iso, phase === 'shop' ? 'Prefab' : 'Field', releases);
}
/** The padlock / disabled-checkbox text of a locked weld (reference wording), or '' when it is not locked. */
export function weldLockReason(weld: Row, isometric: Row | undefined | null, releases: Row[] | null | undefined, weldTypes: Row[] = []): string {
  if (!weldLocked(weld, isometric, releases, weldTypes)) return '';
  return weldPhase(weld, weldTypes) === 'shop' ? 'Locked after Prefab complete' : 'Locked after Field complete';
}

// ----- when a phase may be completed ----------------------------------------------------------------------------

export interface ReleaseReason { group: BlockerKey; /** Group title as the blockers list prints it. */ title: string; message: string; weldId?: string; }
export interface ReleaseCheckInput {
  iso: Row; welds: Row[]; weldTypes: Row[]; results: Row[];
  /** Release records (an active one stands for a completed phase); null / absent when unreadable. */
  releases?: Row[] | null;
  /** Punch items. Read by the status card's warning only: open punch never holds a phase (see `releaseCheck`). */
  punch?: Row[] | null;
}
export interface ReleaseCheck { type: ReleasePhase; reasons: ReleaseReason[]; ready: boolean; /** Live welds of the phase. */ welds: number; }

/**
 * An open pre-punch item of category A or B (shared/punch.ts rules). The reference only warns about it ("Pre-punch:
 * N A/B still need Finished + approval") and lists it in the blockers; it never holds Complete or the release.
 */
export const punchBlocksRelease = (item: Row) => !item._archived && punchKind(item) === 'Pre-punch' && punchBlocking([item]).length > 0;

const ORDER: BlockerKey[] = ['release', 'welds', 'ndt', 'repair', 'punch'];
const TITLES: Record<BlockerKey, string> = { release: 'Release', welds: 'Welds', ndt: 'NDT', repair: 'Repair', punch: 'Punch' };
const hasWelder = (weld: Row) => [1, 2, 3, 4].some(side => text(weld[`welder${side}Id`]) !== '');
const byWeldNo = (a: Row, b: Row) => text(a.weldNo).localeCompare(text(b.weldNo), 'en', { numeric: true });

/**
 * When "Prefab complete" / "Field complete" becomes available (manual, "Prefab complete / Field complete"):
 * Prefab: every weld of the isometric has a type with a shop / field location, every shop weld is welded, every
 * required NDT of a shop weld has a result and no rejection waits for its repair. No shop welds: available (vacuous).
 * Field: Prefab complete first ("Prefab complete is required first"), then the same for the field welds; no field
 * welds: available once Prefab is complete. Open punch and missing optional weld fields do not hold a phase.
 */
export function releaseCheck(type: ReleasePhase, input: ReleaseCheckInput): ReleaseCheck {
  const phase = PHASE_LOCATION[type];
  const all = live(input.welds).filter(weld => weld.isoId === input.iso.id).sort(byWeldNo);
  const welds = all.filter(weld => weldPhase(weld, input.weldTypes) === phase);
  const reasons: ReleaseReason[] = [];
  const add = (group: BlockerKey, message: string, weldId?: string) => reasons.push({ group, title: TITLES[group], message, ...(weldId ? { weldId } : {}) });
  if (type === 'Field' && !phaseCompleted(input.iso, 'Prefab', input.releases)) add('release', 'Prefab complete is required first');
  if (type === 'Prefab') for (const weld of all.filter(weld => !weldPhase(weld, input.weldTypes))) add('welds', `Weld ${weld.weldNo} has no type — assign shop or field.`, weld.id);
  for (const weld of welds.filter(weld => !hasWelder(weld))) add('welds', `Weld ${weld.weldNo} has not been welded yet.`, weld.id);
  const status = isoBlockers({ iso: input.iso, welds, weldTypes: input.weldTypes, diameters: [], results: input.results, releases: null, punch: null });
  for (const group of status.groups.filter(group => group.key === 'ndt' || group.key === 'repair')) for (const item of group.items) add(group.key, item.message, item.weldId);
  reasons.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
  return { type, reasons, ready: reasons.length === 0, welds: welds.length };
}

export type PhaseStateKey = 'released' | 'completed' | 'ready' | 'not-ready';
export interface PhaseState {
  state: PhaseStateKey;
  /** "Prefab not ready" / "Prefab complete" (the button) / "Prefab completed", the same for Field. */
  label: string;
  /** The release document that holds the phase, once one is made. */
  release?: Row;
  completion: { at: string; by: string } | null;
  check: ReleaseCheck;
}
/** The state of a phase on the isometric's Status card. */
export function phaseState(type: ReleasePhase, input: ReleaseCheckInput): PhaseState {
  const check = releaseCheck(type, input);
  const release = activeRelease(input.releases, String(input.iso.id), type);
  const completion = phaseCompletion(input.iso, type, input.releases);
  if (completion) return { state: release ? 'released' : 'completed', label: `${type} completed`, release, completion, check };
  return check.ready ? { state: 'ready', label: `${type} complete`, completion, check } : { state: 'not-ready', label: `${type} not ready`, completion, check };
}

// ----- the release pages ---------------------------------------------------------------------------------------

export interface ReleaseListRow { iso: Row; project?: Row; spools: string; release?: Row; check: ReleaseCheck; }
export interface ReleaseListFilters { /** 'hide' (default): only isometrics that are not released; 'show': released ones too. */ show?: 'hide' | 'show'; projectId?: string; itpNo?: string; }
export interface ReleaseListSource { isometrics: Row[]; projects: Row[]; spools?: Row[]; welds: Row[]; weldTypes: Row[]; results: Row[]; releases?: Row[] | null; punch?: Row[] | null; }
const isoOrder = (a: ReleaseListRow, b: ReleaseListRow) => text(a.iso.isoNo).localeCompare(text(b.iso.isoNo), 'en', { numeric: true });

/**
 * The rows of the Prefab or Field release page for the isometrics given (the pages pass those of the active main
 * project): only isometrics whose phase is completed; "Hide released" (default) also leaves out those that already
 * have their release document.
 */
export function releaseListRows(type: ReleasePhase, source: ReleaseListSource, filters: ReleaseListFilters = {}): ReleaseListRow[] {
  const projects = new Map(source.projects.map(project => [project.id, project]));
  const itp = text(filters.itpNo).toLowerCase();
  return live(source.isometrics).filter(iso => phaseCompleted(iso, type, source.releases) && (!filters.projectId || iso.projectId === filters.projectId) && (!itp || [iso.itpNo, iso.itpNo2].some(value => text(value).toLowerCase().includes(itp)))).map(iso => {
    const release = activeRelease(source.releases, iso.id, type);
    const spools = live(source.spools).filter(spool => spool.isoId === iso.id).map(spool => text(spool.name)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(', ');
    return { iso, project: projects.get(String(iso.projectId)), spools, release, check: releaseCheck(type, { iso, welds: source.welds, weldTypes: source.weldTypes, results: source.results, releases: source.releases, punch: source.punch }) };
  }).filter(row => filters.show === 'show' || !row.release).sort(isoOrder);
}

export interface ArchiveFilters { from?: string; to?: string; type?: string; }
/** Releases of the Request archive, newest first, optionally limited by an inclusive date range (YYYY-MM-DD) and a release type. */
export function releaseArchiveRows(releases: Row[], filters: ArchiveFilters = {}): Row[] {
  const day = (row: Row) => text(row.date || row._createdAt).slice(0, 10);
  return live(releases).filter(row => (!filters.from || day(row) >= filters.from) && (!filters.to || day(row) <= filters.to) && (!filters.type || row.type === filters.type)).sort((a, b) => day(b).localeCompare(day(a)) || text(b._createdAt).localeCompare(text(a._createdAt)) || text(b.id).localeCompare(text(a.id)));
}

// ----- release documents ---------------------------------------------------------------------------------------

/**
 * INFERRED: the reference only names the setting "Release doc drawing no" with the options "Drawing no + iso" and
 * "Prefix + iso". The number joins the chosen first part (the isometric's drawing number or the main project's prefix)
 * and the ISO number with a hyphen; a missing first part leaves the ISO number alone.
 */
export function releaseDocumentNumber(site: Row | undefined | null, iso: Row): string {
  const byPrefix = text(site?.releaseDocDrawing) === RELEASE_DOC_DRAWINGS[1];
  return [byPrefix ? text(site?.prefix) : text(iso.drawingNo), text(iso.isoNo)].filter(Boolean).join('-');
}
export interface SignatureTitle { label: string; title: string; }
/** The six signature block titles of the main project's Document settings that are filled in. */
export const signatureTitlesOf = (site: Row | undefined | null): SignatureTitle[] => SIGNATURE_TITLES.map(([name, label]) => ({ label, title: text(site?.[name]) })).filter(entry => entry.title);
/** What a new release record stores of the document settings. */
export function releaseDocumentData(site: Row | undefined | null, iso: Row) {
  return {
    docNo: releaseDocumentNumber(site, iso),
    docPrefix: text(site?.prefix),
    docDrawingRule: RELEASE_DOC_DRAWINGS.includes(text(site?.releaseDocDrawing)) ? text(site?.releaseDocDrawing) : RELEASE_DOC_DRAWINGS[0],
    signatureTitles: JSON.stringify(signatureTitlesOf(site)),
  };
}
/** The stored signature titles of a release record; an unreadable value gives an empty list. */
export function storedSignatureTitles(release: Row): SignatureTitle[] {
  try {
    const value = JSON.parse(text(release.signatureTitles) || '[]');
    return Array.isArray(value) ? value.filter(entry => entry && typeof entry.label === 'string' && typeof entry.title === 'string') : [];
  } catch { return []; }
}

// ----- field work packages -------------------------------------------------------------------------------------

export interface FwpListRow { iso: Row; project?: Row; testSystem?: Row; fieldPackage?: Row; }
export interface FwpFilters { projectId?: string; fieldPackageId?: string; /** 'assigned' | 'unassigned' */ assignment?: string; query?: string; }
/** The rows of "Assign Iso to FWP": the isometrics given with their project, test system and package. */
export function fwpListRows(source: { isometrics: Row[]; projects: Row[]; testSystems?: Row[]; fieldPackages: Row[] }, filters: FwpFilters = {}): FwpListRow[] {
  const projects = new Map(source.projects.map(row => [row.id, row])), systems = new Map(live(source.testSystems).map(row => [row.id, row])), packages = new Map(source.fieldPackages.map(row => [row.id, row]));
  const query = text(filters.query).toLowerCase();
  return live(source.isometrics).map(iso => ({ iso, project: projects.get(String(iso.projectId)), testSystem: systems.get(String(iso.testSystemId)), fieldPackage: packages.get(String(iso.fieldPackageId)) }))
    .filter(row => (!filters.projectId || row.iso.projectId === filters.projectId) && (!filters.fieldPackageId || row.iso.fieldPackageId === filters.fieldPackageId)
      && (filters.assignment !== 'assigned' || row.fieldPackage) && (filters.assignment !== 'unassigned' || !row.fieldPackage)
      && (!query || [row.iso.isoNo, row.iso.assetTag, row.iso.paintSpec, row.iso.testMedium, row.fieldPackage?.name, row.testSystem?.name].some(value => text(value).toLowerCase().includes(query))))
    .sort((a, b) => text(a.iso.isoNo).localeCompare(text(b.iso.isoNo), 'en', { numeric: true }));
}
/** A package that belongs to a project only takes isometrics of that project. */
export const fwpAccepts = (fieldPackage: Row | undefined | null, iso: Row) => !fieldPackage || !text(fieldPackage.projectId) || fieldPackage.projectId === iso.projectId;

/** Quote one CSV cell; cells that start like a formula are prefixed so a spreadsheet does not run them. */
export const csvCell = (value: unknown) => { let cell = String(value ?? ''); if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`; return /[",\n\r;]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell; };
export const toCsv = (header: string[], lines: unknown[][]) => [header, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n');
