import type { Row } from './types.ts';
import { resultCode } from './pdf-lisl.ts';

/**
 * The one table that maps our inspection data to the method columns of the owner-specific LISL forms
 * ([ISS] Inspection Summary Sheet and [WQ] / [WQ ver 2] Line Inspection Status List).
 *
 * Step 1 (`ndtKindOf`): an NDT process (by its name, then by the name of its process group) belongs to one
 * technique "kind". Step 2: each form lists its columns and which kinds print in them (`ISS_METHOD_COLUMNS`,
 * `WQ_NDT_COLUMNS`). A kind that no column takes (PT on the [WQ] form) prints nowhere; a column no kind of
 * ours reaches (PMI, FN, HV before such processes exist) stays empty. The integrator merges this with the
 * similar table of the other form family by extending `KIND_ALIASES` and the column lists only.
 */
export const NDT_KINDS = ['vt', 'aut', 'tofd', 'rt', 'ut', 'pt', 'mt', 'pmi', 'fn', 'hv'] as const;
export type NdtKind = typeof NDT_KINDS[number];

/**
 * Words that identify a technique, in match order (the more specific techniques come first: "UT phased array"
 * is AUT, "UT ToFD" is ToFD, only then plain UT). A word of up to three letters must equal a whole word of the
 * process name; a longer word may start one ("RADIOGRAPH" matches "Radiography").
 */
const KIND_ALIASES: [NdtKind, string[]][] = [
  ['tofd', ['TOFD']],
  ['aut', ['AUT', 'PAUT', 'PHASED']],
  ['pmi', ['PMI']],
  ['fn', ['FN', 'FERRITE']],
  ['hv', ['HV', 'HARDNESS']],
  ['rt', ['RT', 'RADIOGRAPH', 'XRAY', 'GAMMA']],
  ['ut', ['UT', 'US', 'ULTRASON']],
  ['mt', ['MT', 'MPI', 'MAGNETIC']],
  ['pt', ['PT', 'DPI', 'PENETRANT']],
  ['vt', ['VT', 'VI', 'VISUAL']],
];
const words = (name: string) => name.toUpperCase().replace(/X-RAY/g, 'XRAY').split(/[^A-Z0-9]+/).filter(Boolean);
const kindOfName = (name: string): NdtKind | null => {
  const list = words(name);
  for (const [kind, aliases] of KIND_ALIASES) if (list.some(word => aliases.some(alias => alias.length <= 3 ? word === alias : word.startsWith(alias)))) return kind;
  return null;
};
/** The technique of an NDT process: by its own name, otherwise by the name of its process group; null when neither is recognised. */
export const ndtKindOf = (processName: string, groupName = ''): NdtKind | null => kindOfName(processName) ?? kindOfName(groupName);

export interface MethodColumn {
  key: string;
  /** Heading as printed (without the percentage). */
  label: string;
  /** Techniques that print in this column. */
  kinds: NdtKind[];
}
/** [ISS]: one column per method (a percentage follows the label on the sheet). All ultrasonic techniques share "UT". */
export const ISS_METHOD_COLUMNS: MethodColumn[] = [
  { key: 'vt', label: 'VT', kinds: ['vt'] },
  { key: 'rt', label: 'RT', kinds: ['rt'] },
  { key: 'ptmt', label: 'PT / MT', kinds: ['pt', 'mt'] },
  { key: 'ut', label: 'UT', kinds: ['ut', 'aut', 'tofd'] },
  { key: 'pmi', label: 'PMI', kinds: ['pmi'] },
  { key: 'fn', label: 'FN', kinds: ['fn'] },
  { key: 'hv', label: 'HV', kinds: ['hv'] },
];
/** [WQ] / [WQ ver 2]: the pairs `A / NA` + `Rep. No.`. "MT cap / MT bevel" is one pair; visual inspection has its own VT-no. column. */
export const WQ_NDT_COLUMNS: MethodColumn[] = [
  { key: 'aut', label: 'AUT / Phased Array', kinds: ['aut'] },
  { key: 'rt', label: 'Radiography', kinds: ['rt'] },
  { key: 'ut', label: 'US las', kinds: ['ut'] },
  { key: 'tofd', label: 'ToFD', kinds: ['tofd'] },
  { key: 'mt', label: 'MT cap / MT bevel', kinds: ['mt'] },
];

export interface MethodCell {
  result: 'A' | 'NA';
  report: string;
  /** ISO date (yyyy-mm-dd) of the examination, or ''. */
  date: string;
}
const text = (value: unknown) => String(value ?? '').trim();
const newest = (a: Row, b: Row) => text(b.date).localeCompare(text(a.date)) || b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id);

/**
 * The cell of every column for one weld, keyed by `MethodColumn.key`; a column without a result is absent.
 * Considered are this weld's results of type NDT, NDT PRE and VI (visual) whose request is not cancelled;
 * per column the newest result counts (a repeat examination replaces the earlier one). Result "Accepted" prints
 * `A`, "Rejected" prints `NA`. `processes` / `groups` are the NDT process and process group records.
 */
export function methodCells(columns: MethodColumn[], weld: Row, results: Row[], requests: Row[], processes: Row[], groups: Row[]): Record<string, MethodCell> {
  const process = new Map(processes.map(row => [row.id, row])), group = new Map(groups.map(row => [row.id, text(row.name)]));
  const request = new Map(requests.map(row => [row.id, row]));
  const kindOfResult = (result: Row): NdtKind | null => {
    const source = request.get(String(result.requestId));
    const record = source ? process.get(String(source.processId)) : undefined;
    if (record) return ndtKindOf(text(record.name), group.get(String(record.groupId)) ?? '');
    return result.type === 'VI' ? 'vt' : null;
  };
  const own = results.filter(row => !row._archived && row.weldId === weld.id && ['NDT', 'NDT PRE', 'VI'].includes(text(row.type)) && request.get(String(row.requestId))?.status !== 'Cancelled' && resultCode(row.result) !== '---').sort(newest);
  const cells: Record<string, MethodCell> = {};
  for (const column of columns) {
    const hit = own.find(row => { const kind = kindOfResult(row); return kind !== null && column.kinds.includes(kind); });
    if (hit) cells[column.key] = { result: resultCode(hit.result) as 'A' | 'NA', report: text(hit.reportNo), date: text(hit.date).slice(0, 10) };
  }
  return cells;
}
