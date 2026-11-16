import type { Field, Row } from './types.ts';
import { isoBlockers, newest, type BlockerKey } from './iso-status.ts';
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
  'reopen-release': ['isoId', 'type', 'reason', 'date'],
  'assign-fwp': ['isoIds', 'fieldPackageId'],
};

/** A release record counts while it is live and has not been reopened. Records stored before Reopen existed have no status and count. */
export const isReleased = (row: Row) => !row._archived && row.status !== 'Reopened';
/** The release that currently holds a phase of an isometric, or undefined. */
export const activeRelease = (releases: Row[] | null | undefined, isoId: string, type: string): Row | undefined =>
  (releases || []).filter(row => row.isoId === isoId && row.type === type && isReleased(row)).sort(newest)[0];

// ----- weld locking ---------------------------------------------------------------------------------------------

/** Shop or field, from the weld type's location; undefined when the weld has no type or the type no location. */
export function weldPhase(weld: Row, weldTypes: Row[] = []): WeldPhase | undefined {
  const location = weldTypes.find(type => type.id === weld.typeId)?.location;
  return location === 'Shop' ? 'shop' : location === 'Field' ? 'field' : undefined;
}
/**
 * Whether a weld is locked: field welds after the Field release, shop welds after the Prefab release of its
 * isometric. Reopen makes the release inactive, so the weld unlocks again. `weldTypes` supplies the weld's location
 * (shop / field); without it no weld can be placed in a phase and none is locked.
 * INFERRED from one sample of the reference (field welds locked while the isometric is Field completed); the shop side mirrors it.
 */
export function weldLocked(weld: Row, isometric: Row | undefined | null, releases: Row[] | null | undefined, weldTypes: Row[] = []): boolean {
  const phase = weldPhase(weld, weldTypes);
  if (!phase) return false;
  const isoId = text(isometric?.id ?? weld.isoId);
  if (isometric && weld.isoId !== undefined && weld.isoId !== isometric.id) return false;
  return Boolean(activeRelease(releases, isoId, phase === 'shop' ? 'Prefab' : 'Field'));
}
/** The sentence a locked weld shows, or '' when it is not locked. */
export function weldLockReason(weld: Row, isometric: Row | undefined | null, releases: Row[] | null | undefined, weldTypes: Row[] = []): string {
  if (!weldLocked(weld, isometric, releases, weldTypes)) return '';
  return weldPhase(weld, weldTypes) === 'shop' ? 'Locked: the isometric is released for prefab. Reopen the Prefab release to change it.' : 'Locked: the field release is complete. Reopen the Field release to change it.';
}

// ----- what blocks a release -----------------------------------------------------------------------------------

export interface ReleaseReason { group: BlockerKey; /** Group title as the blockers list prints it. */ title: string; message: string; weldId?: string; }
export interface ReleaseCheckInput {
  iso: Row; welds: Row[]; weldTypes: Row[]; results: Row[];
  /** Release records; null / absent when unreadable (the Prefab prerequisite of a Field release is then not checked). */
  releases?: Row[] | null;
  /** Punch items; null / absent when unreadable (no punch reason is produced). */
  punch?: Row[] | null;
}
export interface ReleaseCheck { type: ReleasePhase; reasons: ReleaseReason[]; ready: boolean; /** Live welds of the phase. */ welds: number; }

/**
 * INFERRED: an open pre-punch item of category A or B blocks the release (the reference warns "Pre-punch: 1 A/B still
 * need Finished + approval"). Status, category and type are read by the punch flow's rules (shared/punch.ts), so the
 * release agrees with the isometric's Punch blocker: only Open items block (legacy In progress reads as Open, Completed
 * as Finished), a missing category reads as B, and items saved before the type existed are Punch items.
 */
export const punchBlocksRelease = (item: Row) => !item._archived && punchKind(item) === 'Pre-punch' && punchBlocking([item]).length > 0;

const ORDER: BlockerKey[] = ['release', 'welds', 'ndt', 'repair', 'punch'];
const TITLES: Record<BlockerKey, string> = { release: 'Release', welds: 'Welds', ndt: 'NDT', repair: 'Repair', punch: 'Punch' };
const hasWelder = (weld: Row) => [1, 2, 3, 4].some(side => text(weld[`welder${side}Id`]) !== '');
const byWeldNo = (a: Row, b: Row) => text(a.weldNo).localeCompare(text(b.weldNo), 'en', { numeric: true });

/**
 * What blocks releasing an isometric for a phase. Prefab looks at the shop welds, Field at the field welds; for both:
 * every weld is welded and carries its required fields, every required NDT has an accepted result, no rejection is
 * waiting for its repair, and no pre-punch item blocks. Field also needs the Prefab release when the isometric has shop welds.
 * INFERRED from the task description; the blockers list on the isometric (`isoBlockers`) is the same rule over every phase.
 */
export function releaseCheck(type: ReleasePhase, input: ReleaseCheckInput): ReleaseCheck {
  const phase = PHASE_LOCATION[type];
  const all = live(input.welds).filter(weld => weld.isoId === input.iso.id);
  const welds = all.filter(weld => weldPhase(weld, input.weldTypes) === phase).sort(byWeldNo);
  const reasons: ReleaseReason[] = [];
  const add = (group: BlockerKey, message: string, weldId?: string) => reasons.push({ group, title: TITLES[group], message, ...(weldId ? { weldId } : {}) });
  if (!welds.length) add('welds', `This isometric has no ${phase} welds, so there is nothing to release for ${type === 'Prefab' ? 'prefab' : 'the field'}.`);
  for (const weld of welds.filter(weld => !hasWelder(weld))) add('welds', `Weld ${weld.weldNo} has not been welded yet.`, weld.id);
  const status = isoBlockers({ iso: input.iso, welds, weldTypes: input.weldTypes, diameters: [], results: input.results, releases: null, punch: null });
  for (const group of status.groups) for (const item of group.items) add(group.key, item.message, item.weldId);
  if (type === 'Field' && input.releases && all.some(weld => weldPhase(weld, input.weldTypes) === 'shop') && !activeRelease(input.releases, input.iso.id, 'Prefab')) add('release', 'The prefab has not been released yet. Release the shop welds first.');
  if (input.punch) {
    const open = live(input.punch).filter(item => item.isoId === input.iso.id && punchBlocksRelease(item)).length;
    if (open) add('punch', `${open} open pre-punch item${open === 1 ? '' : 's'} of category A or B ${open === 1 ? 'needs' : 'need'} to be finished.`);
  }
  reasons.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
  return { type, reasons, ready: reasons.length === 0, welds: welds.length };
}

export type PhaseStateKey = 'released' | 'ready' | 'not-ready' | 'none';
export interface PhaseState { state: PhaseStateKey; label: string; release?: Row; check: ReleaseCheck; }
/** "Prefab not ready / ready / released" and "Field open / ready / completed" for the status card. `none`: the isometric has no welds in the phase. */
export function phaseState(type: ReleasePhase, input: ReleaseCheckInput): PhaseState {
  const check = releaseCheck(type, input);
  const release = activeRelease(input.releases, String(input.iso.id), type);
  const noun = type === 'Prefab' ? 'Prefab' : 'Field';
  if (release) return { state: 'released', label: type === 'Prefab' ? 'Prefab released' : 'Field completed', release, check };
  if (!check.welds) return { state: 'none', label: `${noun}: no ${PHASE_LOCATION[type]} welds`, check };
  return check.ready ? { state: 'ready', label: `${noun} ready`, check } : { state: 'not-ready', label: `${noun} not ready`, check };
}

// ----- the release pages ---------------------------------------------------------------------------------------

export interface ReleaseListRow { iso: Row; project?: Row; spools: string; release?: Row; check: ReleaseCheck; }
export interface ReleaseListFilters { /** 'hide' (default): only isometrics that are not released; 'show': released ones too. */ show?: 'hide' | 'show'; projectId?: string; itpNo?: string; }
export interface ReleaseListSource { isometrics: Row[]; projects: Row[]; spools?: Row[]; welds: Row[]; weldTypes: Row[]; results: Row[]; releases?: Row[] | null; punch?: Row[] | null; }
const isoOrder = (a: ReleaseListRow, b: ReleaseListRow) => text(a.iso.isoNo).localeCompare(text(b.iso.isoNo), 'en', { numeric: true });

/** The rows of the Prefab or Field release page for the isometrics given (the pages pass those of the active main project). */
export function releaseListRows(type: ReleasePhase, source: ReleaseListSource, filters: ReleaseListFilters = {}): ReleaseListRow[] {
  const projects = new Map(source.projects.map(project => [project.id, project]));
  const itp = text(filters.itpNo).toLowerCase();
  return live(source.isometrics).filter(iso => (!filters.projectId || iso.projectId === filters.projectId) && (!itp || [iso.itpNo, iso.itpNo2].some(value => text(value).toLowerCase().includes(itp)))).map(iso => {
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
