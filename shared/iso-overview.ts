import type { Row } from './types.ts';
import { priorityLabel } from './priority.ts';

/**
 * The project's own isometrics page, "Iso overview" (captures weld__welding__project-isometrics.txt and
 * mto__projects__project-isometrics.txt, which are the same in both pilots): its columns, page length, order, menus and
 * row options, the QA badges of an isometric, the Status and Started cells. Pure functions over plain rows, so the server
 * summary and the browser read the same rules and tests need no browser.
 */

export const ISO_OVERVIEW_TITLE = 'Iso overview';

export interface IsoOverviewColumn {
  key: string; label: string; sortable: boolean;
  /** The column is a mark (tick / cross) or a cell with its own content, not plain text. */
  kind?: 'text' | 'mark' | 'qa' | 'status' | 'started' | 'options';
}
/** The columns of the reference list, in order (the check-all box of the last column is the selection column). */
export const ISO_OVERVIEW_COLUMNS: IsoOverviewColumn[] = [
  { key: 'isoNo', label: 'ISO', sortable: true }, { key: 'irn', label: 'IRN', sortable: true }, { key: 'revNo', label: 'Rev. no.', sortable: true },
  { key: 'itpNo', label: 'ITP No', sortable: true }, { key: 'assetTag', label: 'Asset tag', sortable: true }, { key: 'pipingClass', label: 'Piping class', sortable: true },
  { key: 'drawingNo', label: 'Drawing no. 1', sortable: true }, { key: 'noBo', label: 'NoBo', sortable: true, kind: 'mark' }, { key: 'xRay', label: 'X Ray %', sortable: true },
  { key: 'qa', label: 'QA', sortable: false, kind: 'qa' }, { key: 'pwht', label: 'PWHT', sortable: true, kind: 'mark' }, { key: 'priority', label: 'Priority', sortable: true },
  { key: 'status', label: 'Status', sortable: true, kind: 'status' }, { key: 'started', label: 'Started', sortable: true, kind: 'started' },
  { key: 'options', label: 'Options', sortable: false, kind: 'options' },
];
/** The column of the all-isometrics page: the sub-project an isometric belongs to, right after the ISO number. */
export const ISO_OVERVIEW_PROJECT_COLUMN: IsoOverviewColumn = { key: 'projectId', label: 'Sub-project', sortable: true };
/** The columns of the page: those of one sub-project, or (all-isometrics page) with the Sub-project column after ISO. */
export const overviewColumns = (all: boolean): IsoOverviewColumn[] => all ? [ISO_OVERVIEW_COLUMNS[0], ISO_OVERVIEW_PROJECT_COLUMN, ...ISO_OVERVIEW_COLUMNS.slice(1)] : ISO_OVERVIEW_COLUMNS;

// ----- Filters of the all-isometrics page ---------------------------------------------------------------------------------

/** One filter: `text` = contains (case-insensitive); `select` = one of the distinct values in the rows; `flag` = Yes / No. */
export interface IsoFilterDef { key: string; label: string; kind: 'text' | 'select' | 'flag' }
/** The filters, from the fields of the isometric input form, in the order of the form. */
export const ISO_OVERVIEW_FILTERS: IsoFilterDef[] = [
  { key: 'isoNo', label: 'ISO number', kind: 'text' }, { key: 'projectId', label: 'Sub-project', kind: 'select' }, { key: 'area', label: 'Area', kind: 'select' },
  { key: 'irn', label: 'IRN', kind: 'select' }, { key: 'pipingClass', label: 'Piping class', kind: 'select' }, { key: 'itpNo', label: 'ITP', kind: 'select' },
  { key: 'revNo', label: 'Revision', kind: 'select' }, { key: 'priority', label: 'Priority', kind: 'select' }, { key: 'testSystemId', label: 'Test system', kind: 'select' },
  { key: 'fieldPackageId', label: 'Field work package', kind: 'select' }, { key: 'ped', label: 'PED category / module', kind: 'select' }, { key: 'xRay', label: 'X-ray requirement', kind: 'select' },
  { key: 'material', label: 'Material', kind: 'select' }, { key: 'nomDiameter', label: 'Nominal diameter', kind: 'select' }, { key: 'zone', label: 'Zone / Area', kind: 'select' },
  { key: 'noBo', label: 'NoBo', kind: 'flag' }, { key: 'pwht', label: 'PWHT', kind: 'flag' },
];
export type IsoOverviewFilters = Record<string, string>;
export const NO_OVERVIEW_FILTERS: IsoOverviewFilters = {};
/** The value of an empty field in a select filter ("(empty)"): it matches the isometrics that have nothing there. */
export const FILTER_EMPTY = '__empty__';
/** What a filter compares: Yes / No for a flag, else the trimmed text of the field. */
export function filterValue(iso: Row, def: IsoFilterDef): string {
  return def.kind === 'flag' ? (iso[def.key] === true ? 'yes' : 'no') : String(iso[def.key] ?? '').trim();
}
export function matchesOverviewFilters(iso: Row, filters: IsoOverviewFilters, defs: IsoFilterDef[] = ISO_OVERVIEW_FILTERS): boolean {
  return defs.every(def => {
    const wanted = (filters[def.key] ?? '').trim();
    if (!wanted) return true;
    const value = filterValue(iso, def);
    if (def.kind === 'text') return value.toLowerCase().includes(wanted.toLowerCase());
    return wanted === FILTER_EMPTY ? value === '' : value === wanted;
  });
}
export const overviewFilterCount = (filters: IsoOverviewFilters, defs: IsoFilterDef[] = ISO_OVERVIEW_FILTERS) => defs.filter(def => (filters[def.key] ?? '').trim() !== '').length;
/** The choices of a select filter: the distinct values of the rows (naturally sorted, `label` names a stored value) and "(empty)" when some row has none. */
export function filterOptions(rows: Row[], def: IsoFilterDef, label: (value: string) => string = value => value): { value: string; label: string }[] {
  const values = new Set<string>(); let empty = false;
  for (const iso of rows) { const value = filterValue(iso, def); if (value) values.add(value); else empty = true; }
  const options = [...values].map(value => ({ value, label: label(value) })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
  return empty ? [...options, { value: FILTER_EMPTY, label: '(empty)' }] : options;
}

/** Rows per page of the list (reference lengthMenu), 20 by default, ordered by Started ascending. */
export const ISO_OVERVIEW_PAGE = { sizes: [10, 20, 50, 100, 500], initial: 20 };
export const ISO_OVERVIEW_DEFAULT_SORT = { field: 'started', direction: 1 as 1 | -1 };

/** The menus of the top bar, in the reference order (Reports: Weld Pilot only). */
export const ISO_OVERVIEW_MENUS = {
  Reports: ['Weld card', 'Weld labels'],
  Options: ['Delete all isometrics', 'Delete selected isometrics', 'Edit isometrics (Mass edit)', 'Set ITP', 'Set phase (Mass)', 'Generate Iso book', 'Generate grouped Iso book', "Show deleted ISO's", 'Copy selected isometrics'],
  Add: ['Add isometric', 'Import calculations from Isometric', "Undo last calculation's import"],
} as const;
/** The buttons of a row: open (folder), print (Certification index, ISO Book), Iso overview (eye), punch list (book), edit (pencil), delete (trash). */
export const ISO_ROW_ACTIONS = ['Open', 'Print', 'Iso overview', 'Punch list', 'Edit isometric', 'Delete'] as const;
export const ISO_ROW_PRINT_ENTRIES = ['Certification index', 'ISO Book'] as const;
export const ISO_OVERVIEW_EMPTY = 'No data available in table';
export const ISO_OVERVIEW_NO_MATCH = 'No matching records found';

// ----- QA badges ---------------------------------------------------------------------------------------------------------

export type QaKey = 'vi' | 'pre' | 'ndt' | 'pwht';
/** What one badge needs: whether the examination applies to the isometric at all, and how many welds still wait for an accepted result. */
export interface QaCount { applies: boolean; open: number }
export type QaCounts = Record<QaKey, QaCount>;
export const QA_BADGES: { key: QaKey; label: string }[] = [{ key: 'vi', label: 'VI' }, { key: 'pre', label: 'Pre' }, { key: 'ndt', label: 'NDT' }, { key: 'pwht', label: 'PWHT' }];
/** Which welds an examination applies to and the result types judged: a weld flag (VI: every weld) and the types whose latest result must be Accepted. */
const QA_RULES: Record<QaKey, { flags: string[] | null; types: string[] }> = {
  vi: { flags: null, types: ['VI'] },
  pre: { flags: ['ndoReqPre'], types: ['NDT PRE'] },
  ndt: { flags: ['ndoReq'], types: ['NDT'] },
  pwht: { flags: ['pwhtReq', 'pwhtReqPre'], types: ['PWHT', 'PRE-HT'] },
};
/**
 * The open examinations of one isometric's welds. VI applies to every weld; Pre to welds that require NDT PRE; NDT to welds that
 * require NDT; PWHT to welds that require PWHT or Pre-HT. A requirement is open until its latest result is Accepted
 * (no result, a rejected or an NA result count as open). `latest` gives the newest result of a weld and type.
 */
export function qaCounts(welds: Row[], latest: (weldId: string, type: string) => Row | undefined): QaCounts {
  const live = welds.filter(weld => !weld._archived);
  const count = (key: QaKey): QaCount => {
    const rule = QA_RULES[key];
    let applies = false, open = 0;
    for (const weld of live) {
      const flagged = rule.flags ? rule.flags.filter(flag => weld[flag] === true) : [''];
      if (rule.flags && !flagged.length) continue;
      applies = true;
      // With two requirement flags (PWHT and Pre-HT) every flagged requirement is judged by the result type it stands for.
      const types = rule.flags && rule.flags.length > 1 ? flagged.map(flag => rule.types[rule.flags!.indexOf(flag)]) : rule.types;
      for (const type of types) if (latest(weld.id, type)?.result !== 'Accepted') open++;
    }
    return { applies, open };
  };
  return { vi: count('vi'), pre: count('pre'), ndt: count('ndt'), pwht: count('pwht') };
}
export interface QaBadge { key: string; label: string; state: 'open' | 'ok' | 'na'; open: number; title: string }
/** The four badges of an isometric: "n open" (red), "ok" (green) or "n.v.t." (not applicable), with the tooltip text of the reference. */
export function qaBadges(counts: QaCounts | null | undefined): QaBadge[] {
  return QA_BADGES.map(({ key, label }) => {
    const count = counts?.[key];
    const state = !count?.applies ? 'na' : count.open > 0 ? 'open' : 'ok';
    const open = state === 'open' ? count!.open : 0;
    return { key, label, state, open, title: `${label}: ${state === 'open' ? `${open} open` : state === 'ok' ? 'ok' : 'n.v.t.'}` };
  });
}

// ----- Status and Started -------------------------------------------------------------------------------------------------

/** Status as the reference writes it: the isometric's percentage with one decimal ('0.0%', '72.7%'); a dash while it is not known. */
export const statusText = (total: number | null | undefined) => typeof total === 'number' && Number.isFinite(total) ? `${(Math.round(total * 10) / 10).toFixed(1)}%` : '—';

export type StartedKey = 'm' | 'e' | 'w';
export interface StartedFlag { key: StartedKey; letter: 'M' | 'E' | 'W'; on: boolean; title: string }
/** The M / E / W links of the Started column with their tooltips (the reference's own wording, including "has not calculations"). */
export function startedFlags(flags: { m: boolean | null; e: boolean | null; w: boolean | null } | null | undefined, estimates = true): StartedFlag[] {
  const on = (value: boolean | null | undefined) => value === true;
  const list: StartedFlag[] = [
    { key: 'm', letter: 'M', on: on(flags?.m), title: on(flags?.m) ? 'ISO has been started' : 'ISO has not been started' },
    { key: 'e', letter: 'E', on: on(flags?.e), title: on(flags?.e) ? 'ISO has calculations' : 'ISO has not calculations' },
    { key: 'w', letter: 'W', on: on(flags?.w), title: on(flags?.w) ? 'ISO has welds' : 'ISO has no welds' },
  ];
  return estimates ? list : list.filter(flag => flag.key !== 'e');
}
/** Sort value of the Started column: how many of M / E / W are on, then which (M counts least, W most), so isometrics nothing has started on come first. */
export const startedRank = (flags: { m: boolean | null; e: boolean | null; w: boolean | null } | null | undefined) => (flags?.m === true ? 1 : 0) + (flags?.e === true ? 2 : 0) + (flags?.w === true ? 4 : 0);
/** The priority as the overview shows it: the number of Prio n, 0 for none. */
export const priorityNumber = (value: unknown) => { const match = /^Prio (\d+)$/.exec(priorityLabel(value)); return match ? Number(match[1]) : 0; };

// ----- Rows ---------------------------------------------------------------------------------------------------------------

/** The value a column sorts and searches by. `summary` is the isometric's server summary (status and flags). */
export function overviewValue(iso: Row, key: string, summary?: { progress: { total: number | null }; flags: { m: boolean | null; e: boolean | null; w: boolean | null } } | null): string | number {
  switch (key) {
    case 'noBo': return iso.noBo === true ? 1 : 0;
    case 'pwht': return iso.pwht === true ? 1 : 0;
    case 'priority': return priorityNumber(iso.priority);
    case 'status': return summary?.progress.total ?? 0;
    case 'started': return startedRank(summary?.flags);
    case 'xRay': return Number(String(iso.xRay ?? '').replace(',', '.').replace(/%$/, '')) || 0;
    case 'revNo': return String(iso.revNo ?? '');
    default: return String(iso[key] ?? '');
  }
}
/** What a text cell shows: the value, or a dash when it is empty (the reference writes '-'). */
export const cellText = (value: unknown) => { const text = String(value ?? '').trim(); return text || '-'; };
/** Order of the rows: by the chosen column, ties by the ISO number so the order is stable; numbers by value, text naturally. */
export function sortOverview<T>(rows: T[], value: (row: T, key: string) => string | number, field: string, direction: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const left = value(a, field), right = value(b, field);
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'en', { numeric: true });
    return (order || String(value(a, 'isoNo')).localeCompare(String(value(b, 'isoNo')), 'en', { numeric: true })) * (order ? direction : 1);
  });
}
