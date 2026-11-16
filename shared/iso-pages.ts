/**
 * Rules of the Projects and Isometric pages that the server enforces and the browser mirrors (pure, so tests need no browser):
 * the project Options menu and row buttons, the IRN series, the revision number of the Add rev dialog, the order of the
 * Set phase boxes, the refusals of Delete for projects and isometrics, and where the one Options menu of the isometric page sits.
 */
import type { Field, Row } from './types.ts';

// ----- Projects page (reference weld__welding__projects.txt:393-433) -----------------------------------------------------

/** The Options menu of the Projects page, in the reference order. */
export const PROJECT_OPTIONS = ['Delete selected projects', 'Edit projects (Mass edit)', 'Generate multiple WP books', 'Show deleted work packages'] as const;
/** The buttons of a project row, in the reference order: open, print (with its entries), punch list, edit, delete. */
export const PROJECT_ROW_ACTIONS = ['Open', 'Print', 'Punch list', 'Edit', 'Delete'] as const;
export const PROJECT_PRINT_ENTRIES = ['Certification index', 'Project book'] as const;
/** The sentence of the "Delete selected projects" dialog (dashboard capture). */
export const PROJECT_DELETE_TEXT = { intro: 'You are going to delete selected projects from this project', confirm: 'Are you sure?', note: 'Please note that only unused (blank) projects can be deleted' };

// ----- Delete refusals ---------------------------------------------------------------------------------------------------

/** What still hangs on an isometric (counts of live records). */
export interface IsometricUse { welds: number; materials: number; reserved: number; calculations: number; started: number }
/**
 * The first reason an isometric cannot be deleted, in the order of the manual: welds (the reference sentence, word for word),
 * materials, reserved materials, calculations, work that has already started. Empty when it can go.
 */
export function isometricDeleteRefusal(use: IsometricUse): string {
  if (use.welds) return 'Deletion is not possible while this isometric still has welds. Delete the welds first.';
  if (use.materials) return 'Deletion is not possible while this isometric still has materials. Remove its materials in MTO Pilot first.';
  if (use.reserved) return 'Deletion is not possible while this isometric still has reserved materials. Release the reservations first.';
  if (use.calculations) return 'Deletion is not possible while this isometric still has calculations. Remove its calculations first.';
  if (use.started) return 'Deletion is not possible because work on this isometric has already started (a pick list or a release exists).';
  return '';
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

/** The Options menu of the page heading is shown only where the open tab has no Options menu of its own (Welds, Materials). */
export const headingHasOptions = (pilotActive: boolean, tab: string) => pilotActive && !['welds', 'mto'].includes(tab);

// ----- Add new (Edit isometric) -----------------------------------------------------------------------------------------

/** What Add new takes from the form: the header fields (the project-bound assignments, progress and phases start empty, as in a copy). */
export const HEADER_LEFT_OUT = ['projectId', 'testSystemId', 'fieldPackageId', 'itpId', 'itp2Id'];
export const headerFields = (fields: Field[]) => fields.filter(field => !HEADER_LEFT_OUT.includes(field.name) && field.section !== 'Phases' && field.section !== 'Progress').map(field => field.name);
/** The three boxes next to Add new, as the reference names them. */
export const ADD_NEW_COPY_OPTIONS = [['copyWelds', 'Copy Welds'], ['copyMaterials', 'Copy Materials'], ['copyCalculations', 'Copy Calculations']] as const;
