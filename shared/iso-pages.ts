/**
 * Rules of the Projects and Isometric pages that the server enforces and the browser mirrors (pure, so tests need no browser):
 * the project Options menu and row buttons, the IRN series, the revision number of the Add rev dialog, the order of the
 * Set phase boxes, the refusals of Delete for projects and isometrics, and where the one Options menu of the isometric page sits.
 */
import type { Field, Row } from './types.ts';
import { currentRevision } from './revisions.ts';

// ----- Projects page (reference weld__welding__projects.txt:393-433) -----------------------------------------------------

/** The Options menu of the Projects page, in the reference order. */
export const PROJECT_OPTIONS = ['Delete selected projects', 'Edit projects (Mass edit)', 'Generate multiple WP books', 'Show deleted work packages'] as const;
/** The buttons of a project row, in the reference order: open, print (with its entries), punch list, edit, delete. */
export const PROJECT_ROW_ACTIONS = ['Open', 'Print', 'Punch list', 'Edit', 'Delete'] as const;
export const PROJECT_PRINT_ENTRIES = ['Certification index', 'Project book'] as const;
/** The sentence of the "Delete selected projects" dialog (dashboard capture). */
export const PROJECT_DELETE_TEXT = { intro: 'You are going to delete selected projects from this project', confirm: 'Are you sure?', note: 'Please note that only unused (blank) projects can be deleted' };

// ----- Delete ------------------------------------------------------------------------------------------------------------

/** What still hangs on an isometric (counts of live records). */
export interface IsometricUse { welds: number; materials: number; reserved: number; calculations: number; started: number }
/**
 * An isometric may be deleted at any time (client answer of 17.11.2026); the Delete right on isometrics is the only gate.
 * Its welds, materials, reservations, calculations, spools and the rest that hang on it are deleted with it, so every
 * figure (WDI, welder percentages, dashboards, MTO) follows the state without it. This is the sentence the dialog shows.
 */
export function isometricDeleteNotice(use: IsometricUse): string {
  const parts = ([[use.welds, 'weld'], [use.materials, 'material line'], [use.reserved, 'reservation'], [use.calculations, 'calculation line']] as [number, string][]).filter(([count]) => count > 0).map(([count, noun]) => `${count} ${noun}${count === 1 ? '' : 's'}`);
  return `The isometric's welds and materials leave all figures (weld lists, WDI, welder statistics, dashboards and MTO)${parts.length ? `: this deletes ${parts.join(', ')} with it` : ''}.${use.started ? ' A pick list or release already exists; it is deleted with the isometric.' : ''}`;
}
/** A project is deleted only while it is blank: no isometric of it is left. */
export function projectDeleteRefusal(isometrics: number): string {
  return isometrics ? `Only unused (blank) projects can be deleted. This project still has ${isometrics} isometric${isometrics === 1 ? '' : 's'}; delete them first.` : '';
}
/** The use of an isometric as the rows the browser holds show it (the server counts everything). */
export function isometricUseOf(rows: Record<string, Row[]>, isoId: string): IsometricUse {
  const live = (key: string) => (rows[key] || []).filter(row => !row._archived && row.isoId === isoId).length;
  return { welds: live('welds'), materials: live('iso_materials'), reserved: (rows.reservations || []).filter(row => !row._archived && row.isoId === isoId && row.status === 'Reserved').length, calculations: live('calculation_lines') + live('cut_list'), started: live('picklists') + live('releases') };
}

// ----- Automatic IRN numbers (vendor knowledge base 5-27-1) ------------------------------------------------------------

/** Next unique series of four letters (AAAA, AAAB, ...) that no other main project uses. */
export function nextIrnSeries(taken: Iterable<string>): string {
  const used = new Set([...taken].map(code => code.trim().toUpperCase()));
  for (let n = 0; n < 26 ** 4; n++) {
    let code = '', rest = n;
    for (let i = 0; i < 4; i++) { code = String.fromCharCode(65 + rest % 26) + code; rest = Math.floor(rest / 26); }
    if (!used.has(code)) return code;
  }
  return '';
}
/** An IRN: the series and a counter of four digits (AABC0001). */
export const irnNumber = (series: string, counter: number) => `${series}${String(counter).padStart(4, '0')}`;
/** The highest counter among the IRNs that start with the series (0 when there is none): where an absent counter starts. */
export function highestIrnCounter(series: string, irns: Iterable<unknown>): number {
  let highest = 0;
  for (const value of irns) {
    const text = String(value ?? '').trim();
    if (!text.startsWith(series)) continue;
    const tail = text.slice(series.length);
    if (/^\d{1,}$/.test(tail)) highest = Math.max(highest, Number(tail));
  }
  return highest;
}
export const IRN_AUTO_MESSAGE = 'The IRN of this main project is filled in automatically; it cannot be typed.';

// ----- Add rev (reference weld__iso__0001.txt:1291-1330) -----------------------------------------------------------------

/** The number the Add rev dialog offers: the current revision plus one (numbers with decimals keep two places), empty when it is not a number. */
export function nextRevisionNumber(current: unknown): string {
  const text = String(current ?? '').trim();
  if (/^\d+$/.test(text)) return String(Number(text) + 1);
  if (/^\d+\.\d+$/.test(text)) return String(Math.round((Number(text) + 1) * 100) / 100);
  return '';
}
/** The titles of the three dialogs and the document each is for. */
export const REVISION_DIALOGS: Record<string, { title: string }> = { ISO: { title: 'Add rev' }, ITP: { title: 'Add ITP revision' }, 'ITP 2': { title: 'Add ITP revision 2' } };
/** The ITP dialogs take a number with two decimals; the isometric dialog takes text. */
export const revisionInputType = (kind: string) => kind === 'ISO' ? 'text' : 'number';
/** The file of a document's current revision: the file of the isometric itself, else the file attached to its current revision record. */
export function currentRevisionFile(rows: Record<string, Row[]>, isoId: string, kind: string, current: string): Row | undefined {
  const files = (rows.attachments || []).filter(file => !file._archived);
  const own = files.find(file => file.entityType === 'isometrics' && file.entityId === isoId && (file.documentType === `${kind} revision ${current}` || file.documentType === kind));
  if (own) return own;
  const revision = (rows.revisions || []).filter(row => !row._archived && row.isoId === isoId && row.type === kind && String(row.revNo) === current).sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)))[0];
  return revision ? files.find(file => file.entityType === 'revisions' && file.entityId === revision.id) : undefined;
}

/**
 * The newest file of a drawing kind (ISO, ITP, ITP 2): what a click on the isometric name opens in a new tab. The
 * attached documents (newest first) win, then the file of the current revision record; undefined when nothing is uploaded.
 */
export function latestIsoFile(rows: Record<string, Row[]>, documents: Row[], isoId: string, kind = 'ISO'): { file?: Row; revision: string } {
  const revision = currentRevision(rows, isoId, kind);
  const file = documents.find(row => row.documentType === `${kind} revision ${revision}` || row.documentType === kind) ?? currentRevisionFile(rows, isoId, kind, revision);
  return { file, revision };
}
/** Tooltip of the isometric name: what the link opens, or why it is plain text. */
export const isoDrawingTitle = (file: Row | undefined, revision: string) => file ? `Open the latest drawing revision (Rev ${revision}) in a new tab` : 'No drawing file uploaded yet';
/** Tooltip of an ITP number in the ITPs card. */
export const itpDrawingTitle = (file: Row | undefined, revision: string) => file ? `Open the latest ITP PDF${revision ? ` (Rev ${revision})` : ''} in a new tab` : 'No ITP file uploaded yet';

// ----- Set phase (reference weld__iso__0001.txt:1185-1213, weld__start__dashboard.txt:1039) -------------------------------

/** One isometric: "Isometric formatted" comes before "Welds defined (WP)"; the mass dialog has them the other way round. */
export const SINGLE_PHASE_ORDER = ['prefab_materials', 'prefab_est', 'prefab_doc', 'prefab_welds', 'field_doc', 'field_test', 'field_release', 'prep_finished'];
export function phaseBoxes<T extends { name: string }>(flags: T[], count: number): T[] {
  if (count !== 1) return flags;
  return [...flags].sort((a, b) => SINGLE_PHASE_ORDER.indexOf(a.name) - SINGLE_PHASE_ORDER.indexOf(b.name));
}
/** The labels of the Set phase boxes of the reference, by field. */
export const PHASE_LABELS: Record<string, string> = {
  prefab_materials: 'Materials (MTOP)', prefab_est: 'Estimate (ESTP)', prefab_doc: 'Isometric formatted', prefab_welds: 'Welds defined (WP)',
  field_doc: 'Field documentation', field_test: 'Test documentation', field_release: 'Release documentation', prep_finished: 'Work preparation 100%',
};

// ----- The isometric page ------------------------------------------------------------------------------------------------

/**
 * Attachments, Audit trail and Set phase in the page's Options menu (client change list 22.11.2026, image 20): the isometric
 * page has one Options menu in its top line. In Weld Core the LISL's entries join it, so they are there on the LISL as well;
 * only Material Core's Materials tab keeps its own Options menu with these three. Without a Core they are not offered.
 */
export const headingHasOptions = (pilotActive: boolean, tab: string) => pilotActive && tab !== 'mto';

export type IsoMenuGroup = 'welds' | 'isometric' | 'danger';
export interface IsoMenuEntry { key: string; label: string; group: IsoMenuGroup }
/**
 * The page entries of the isometric page's Options menu, in order: what the old page heading, the tab strip and the
 * Progress card offered (D11: nothing loses its only entry point). A page renders only the entries it can act on; the
 * destructive entry comes last. `other-core` is labelled "Open in <Core>" by the page.
 */
export const ISO_PAGE_MENU: IsoMenuEntry[] = [
  { key: 'edit-isometric', label: 'Edit isometric', group: 'isometric' },
  { key: 'edit-quantities', label: 'Progress quantities', group: 'isometric' },
  { key: 'spools', label: 'Spools', group: 'isometric' },
  { key: 'documents', label: 'Drawing documents', group: 'isometric' },
  { key: 'attachments', label: 'Attachments', group: 'isometric' },
  { key: 'audit-trail', label: 'Audit trail', group: 'isometric' },
  { key: 'set-phase', label: 'Set phase', group: 'isometric' },
  { key: 'data-lisl', label: 'Open Data LISL', group: 'isometric' },
  { key: 'other-core', label: 'Open in other Core', group: 'isometric' },
  { key: 'archive', label: 'Archive isometric', group: 'danger' },
];
export const ISO_MENU_GROUPS: IsoMenuGroup[] = ['welds', 'isometric', 'danger'];
/** The rendered entries per group in menu order; a group with nothing rendered drops out, so a divider only ever sits between two groups. */
export function menuGroups<T>(entries: IsoMenuEntry[], render: (entry: IsoMenuEntry) => T | null | undefined | false): { group: IsoMenuGroup; items: { key: string; node: T }[] }[] {
  return ISO_MENU_GROUPS.map(group => ({ group, items: entries.filter(entry => entry.group === group).flatMap(entry => { const node = render(entry); return node ? [{ key: entry.key, node }] : []; }) })).filter(entry => entry.items.length > 0);
}
/** "Open Data LISL" opens the full-field register filtered on the isometric (the LISL page reads these parameters). */
export const dataLislUrl = (iso: Row) => `/welding/lisl?${new URLSearchParams({ project_id: String(iso.projectId ?? ''), iso_id: String(iso.id) }).toString()}`;

// ----- Add new (Edit isometric) -----------------------------------------------------------------------------------------

/** What Add new takes from the form: the header fields (the project-bound assignments, progress and phases start empty, as in a copy). */
export const HEADER_LEFT_OUT = ['projectId', 'testSystemId', 'fieldPackageId', 'itpId', 'itp2Id'];
/**
 * Fields only the server sets, never Add new or a copy (sec1-006): Prefab / Field completion (complete-phase and release,
 * `COMPLETION_FIELDS` of shared/iso-status.ts), X Ray % (from the linked ITP) and the punch progress.
 */
export const ISO_SERVER_OWNED = ['prefabCompletedAt', 'prefabCompletedBy', 'fieldCompletedAt', 'fieldCompletedBy', 'xRay', 'punchProgress'];
export const headerFields = (fields: Field[]) => fields.filter(field => !HEADER_LEFT_OUT.includes(field.name) && !ISO_SERVER_OWNED.includes(field.name) && field.section !== 'Phases' && field.section !== 'Progress').map(field => field.name);
/** The three boxes next to Add new, as the reference names them. */
export const ADD_NEW_COPY_OPTIONS = [['copyWelds', 'Copy Welds'], ['copyMaterials', 'Copy Materials'], ['copyCalculations', 'Copy Calculations']] as const;
