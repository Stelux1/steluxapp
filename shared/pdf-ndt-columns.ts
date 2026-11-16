import type { Row } from './types.ts';
import { resultCode } from './pdf-lisl.ts';

/**
 * Data side of the owner-specific LISL forms ([GU], [MV], [GU Rev 2 / Rev 3]): which NDT column of those forms
 * a weld's inspection request belongs to. ONE small table (`COLUMN_TABLE`) maps (request type, method) to a column;
 * the method of a request is read from its NDT process name (code or words) and, when the name says nothing,
 * from its process group's name (`NDT_METHODS`). Columns we have no data for stay empty.
 */

/** The canonical NDT columns. The `_PRE` ones are the bevel (pre-weld) examinations, i.e. requests of type "NDT PRE". */
export const NDT_COLUMN_IDS = ['VT', 'PA', 'RT', 'PWHT', 'US', 'US_PRE', 'TOFD', 'MTPT', 'MTPT_PRE', 'PMI'] as const;
export type NdtColumnId = typeof NDT_COLUMN_IDS[number];
export type NdtMethod = 'VT' | 'PA' | 'RT' | 'UT' | 'TOFD' | 'MT' | 'PT' | 'PMI';

/** Method names. `codes` must equal a word of the process name; `words` may appear anywhere in it (letters and digits only, upper case). Order matters: the first match wins. */
export const NDT_METHODS: { method: NdtMethod; codes: string[]; words: string[] }[] = [
  { method: 'TOFD', codes: ['TOFD'], words: ['TIMEOFFLIGHT'] },
  { method: 'PA', codes: ['PA', 'PAUT', 'AUT'], words: ['PHASEDARRAY'] },
  { method: 'PMI', codes: ['PMI'], words: ['POSITIVEMATERIAL'] },
  { method: 'RT', codes: ['RT', 'XRAY'], words: ['RADIOGRAPH'] },
  { method: 'UT', codes: ['UT', 'US'], words: ['ULTRASON'] },
  { method: 'MT', codes: ['MT', 'MPI'], words: ['MAGNETIC'] },
  { method: 'PT', codes: ['PT', 'LPI', 'DPI'], words: ['PENETRANT'] },
  { method: 'VT', codes: ['VT', 'VI'], words: ['VISUAL'] },
];
const alnum = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '');
/** The method a process (or process group) name stands for, or null. */
export function ndtMethodOf(name: string): NdtMethod | null {
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean), joined = alnum(name);
  return NDT_METHODS.find(entry => entry.codes.some(code => words.includes(code)) || entry.words.some(word => joined.includes(word)))?.method ?? null;
}

/**
 * THE table: request type + method → column. A request type or method that is not listed has no column
 * (for example "Pre-HT" requests, or an examination method none of the forms shows).
 */
export const COLUMN_TABLE: Record<string, Partial<Record<NdtMethod | 'any', NdtColumnId>>> = {
  NDT: { VT: 'VT', PA: 'PA', RT: 'RT', UT: 'US', TOFD: 'TOFD', MT: 'MTPT', PT: 'MTPT', PMI: 'PMI' },
  'NDT PRE': { UT: 'US_PRE', MT: 'MTPT_PRE', PT: 'MTPT_PRE' },
  VI: { any: 'VT' },
  PWHT: { any: 'PWHT' },
};
export interface NdtNames { process: string; group: string }
/** The column of an inspection request, or null. `names` returns the process and process-group names of the request. */
export function ndtColumnOf(request: Row, names: NdtNames): NdtColumnId | null {
  const table = COLUMN_TABLE[String(request.type ?? '')];
  if (!table) return null;
  if (table.any) return table.any;
  const method = ndtMethodOf(names.process) ?? ndtMethodOf(names.group);
  return method ? table[method] ?? null : null;
}

/** One printed pair of a form: `result` is "A" (accepted) or "NA" (not accepted), empty without a result; `report` the report number. */
export interface NdtColumnCell { result: 'A' | 'NA' | ''; report: string }
export type NdtColumnCells = Record<NdtColumnId, NdtColumnCell>;
export const EMPTY_NDT_CELL: NdtColumnCell = { result: '', report: '' };

const byDate = (a: Row, b: Row) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a._createdAt.localeCompare(b._createdAt) || a.id.localeCompare(b.id);
/**
 * The pair of every column for one weld. `requests` and `results` are any records; the function picks this
 * weld's (not archived, request not cancelled). Of the results of a column the latest one counts (an accepted
 * additional examination replaces an earlier rejected one); a request without a result prints nothing.
 */
export function ndtColumnCells(weld: Row, results: Row[], requests: Row[], names: (request: Row) => NdtNames): NdtColumnCells {
  const cells = Object.fromEntries(NDT_COLUMN_IDS.map(id => [id, EMPTY_NDT_CELL])) as NdtColumnCells;
  const latest = new Map<NdtColumnId, Row>();
  for (const request of requests) {
    if (request._archived || request.weldId !== weld.id || request.status === 'Cancelled') continue;
    const column = ndtColumnOf(request, names(request));
    if (!column) continue;
    for (const result of results) {
      if (result._archived || result.weldId !== weld.id || result.requestId !== request.id) continue;
      const code = resultCode(result.result);
      if (code === '---') continue;
      const current = latest.get(column);
      if (!current || byDate(current, result) < 0) { latest.set(column, result); cells[column] = { result: code, report: String(result.reportNo ?? '').trim() }; }
    }
  }
  return cells;
}

// ----- the forms' column sets ----------------------------------------------------------------------------------------
export interface NdtFormColumn { id: NdtColumnId; label: string }
export type NdtForm = 'gu' | 'mv' | 'rev';
const c = (id: NdtColumnId, label: string): NdtFormColumn => ({ id, label });
/** Columns of each form in print order, with the heading the form uses. */
export const NDT_FORM_COLUMNS: Record<NdtForm, NdtFormColumn[]> = {
  gu: [c('VT', 'VT'), c('PA', 'PA'), c('RT', 'RT'), c('PWHT', 'PWHT'), c('US', 'US weld'), c('TOFD', 'ToFD'), c('MTPT_PRE', 'MT/PT bevel'), c('MTPT', 'MT/PT')],
  mv: [c('VT', 'VT'), c('PA', 'PA'), c('RT', 'RT'), c('PWHT', 'PWHT'), c('US', 'US weld'), c('TOFD', 'ToFD'), c('MTPT_PRE', 'MT/PT bevel'), c('MTPT', 'MT/PT'), c('PMI', 'PMI')],
  rev: [c('PA', 'AUT/Phased Array'), c('RT', 'Radiography'), c('US_PRE', 'US dubb.'), c('US', 'US las'), c('TOFD', 'ToFD'), c('MTPT_PRE', 'MT bevel'), c('MTPT', 'MT cap')],
};
