import type { Row } from './types.ts';
import { resultCode } from './pdf-lisl.ts';
import { NDT_ROUNDS } from './inspections.ts';

/**
 * THE mapping from inspection data to the method columns of every owner-specific LISL form ([GU], [MV],
 * [GU Rev 2 / Rev 3], [ISS], [WQ], [WQ ver 2]). Two steps, both in this file:
 *  1. `ndtMethodOf`: the technique of an examination, read from the NDT process name, then from the name of its
 *     process group (one alias table, `ALIASES`).
 *  2. each form lists its columns, and each column says which request types (`NDT`, `NDT PRE`, `VI`, `PWHT`) and
 *     which techniques print in it (`match`). A technique no column takes prints nowhere; a column no technique
 *     of ours reaches stays empty.
 * The inspections model is read as the inspections flow stores it: a weld has one request per type and every
 * examination round (Initial, Remaining, Additional, Additional 2, Additional 3) is a result row with its own
 * NDT process, report number and date; the stored result "Rejected" prints as "NA", "Accepted" as "A".
 */
export const NDT_METHODS = ['VT', 'PA', 'RT', 'UT', 'TOFD', 'MT', 'PT', 'PMI', 'FN', 'HV'] as const;
export type NdtMethod = typeof NDT_METHODS[number];

/**
 * Words that identify a technique, in match order (the more specific techniques first: "UT phased array" is PA,
 * "UT ToFD" is ToFD, only then plain UT). A word of up to three letters must equal a whole word of the process
 * name; a longer word may start one ("RADIOGRAPH" matches "Radiography"); `joined` strings are searched in the
 * name without separators.
 */
const ALIASES: { method: NdtMethod; words: string[]; joined?: string[] }[] = [
  { method: 'TOFD', words: ['TOFD'], joined: ['TIMEOFFLIGHT'] },
  { method: 'PA', words: ['PA', 'AUT', 'PAUT', 'PHASED'] },
  { method: 'PMI', words: ['PMI'] },
  { method: 'FN', words: ['FN', 'FERRITE'] },
  { method: 'HV', words: ['HV', 'HARDNESS'] },
  { method: 'RT', words: ['RT', 'RADIOGRAPH', 'XRAY', 'GAMMA'] },
  { method: 'UT', words: ['UT', 'US', 'ULTRASON'] },
  { method: 'MT', words: ['MT', 'MPI', 'MAGNETIC'] },
  { method: 'PT', words: ['PT', 'LPI', 'DPI', 'PENETRANT'] },
  { method: 'VT', words: ['VT', 'VI', 'VISUAL'] },
];
const wordsOf = (name: string) => name.toUpperCase().replace(/X-RAY/g, 'XRAY').split(/[^A-Z0-9]+/).filter(Boolean);
const methodOfName = (name: string): NdtMethod | null => {
  const list = wordsOf(name), joined = list.join('');
  return ALIASES.find(entry => list.some(word => entry.words.some(alias => alias.length <= 3 ? word === alias : word.startsWith(alias))) || entry.joined?.some(part => joined.includes(part)))?.method ?? null;
};
/** The technique of an NDT process: by its own name, otherwise by the name of its process group; null when neither says. */
export const ndtMethodOf = (processName: string, groupName = ''): NdtMethod | null => methodOfName(processName) ?? methodOfName(groupName);

// ----- columns -------------------------------------------------------------------------------------------------------
export type NdtRequestType = 'NDT' | 'NDT PRE' | 'VI' | 'PWHT';
/** Per request type the techniques that print in the column, or `'any'` for every examination of that type. */
export type NdtMatch = Partial<Record<NdtRequestType, NdtMethod[] | 'any'>>;
export interface NdtFormColumn { id: string; label: string; match: NdtMatch }
const column = (id: string, label: string, match: NdtMatch): NdtFormColumn => ({ id, label, match });
const both = (...methods: NdtMethod[]): NdtMatch => ({ NDT: methods, 'NDT PRE': methods });

/** The canonical columns of the [GU] family (`NDT PRE` examinations are the bevel / pre-weld ones, i.e. the `_PRE` columns). */
const GU_COLUMNS = {
  VT: column('VT', 'VT', { VI: 'any', NDT: ['VT'] }), PA: column('PA', 'PA', { NDT: ['PA'] }), RT: column('RT', 'RT', { NDT: ['RT'] }), PWHT: column('PWHT', 'PWHT', { PWHT: 'any' }),
  US: column('US', 'US weld', { NDT: ['UT'] }), US_PRE: column('US_PRE', 'US dubb.', { 'NDT PRE': ['UT'] }), TOFD: column('TOFD', 'ToFD', { NDT: ['TOFD'] }),
  MTPT: column('MTPT', 'MT/PT', { NDT: ['MT', 'PT'] }), MTPT_PRE: column('MTPT_PRE', 'MT/PT bevel', { 'NDT PRE': ['MT', 'PT'] }), PMI: column('PMI', 'PMI', { NDT: ['PMI'] }),
};
export type NdtColumnId = keyof typeof GU_COLUMNS;
/** Every column of the [GU] family, once (the cells of [GU], [MV] and [GU Rev] are read for all of them). */
export const GU_FAMILY_COLUMNS: NdtFormColumn[] = Object.values(GU_COLUMNS);
const relabel = (base: NdtFormColumn, label: string): NdtFormColumn => ({ ...base, label });
export type NdtForm = 'gu' | 'mv' | 'rev' | 'iss' | 'wq';
/** Columns of each form in print order, with the heading the form uses. */
export const NDT_FORM_COLUMNS: Record<NdtForm, NdtFormColumn[]> = {
  gu: [GU_COLUMNS.VT, GU_COLUMNS.PA, GU_COLUMNS.RT, GU_COLUMNS.PWHT, GU_COLUMNS.US, GU_COLUMNS.TOFD, GU_COLUMNS.MTPT_PRE, GU_COLUMNS.MTPT],
  mv: [GU_COLUMNS.VT, GU_COLUMNS.PA, GU_COLUMNS.RT, GU_COLUMNS.PWHT, GU_COLUMNS.US, GU_COLUMNS.TOFD, GU_COLUMNS.MTPT_PRE, GU_COLUMNS.MTPT, GU_COLUMNS.PMI],
  rev: [relabel(GU_COLUMNS.PA, 'AUT/Phased Array'), relabel(GU_COLUMNS.RT, 'Radiography'), GU_COLUMNS.US_PRE, relabel(GU_COLUMNS.US, 'US las'), GU_COLUMNS.TOFD, relabel(GU_COLUMNS.MTPT_PRE, 'MT bevel'), relabel(GU_COLUMNS.MTPT, 'MT cap')],
  /** [ISS]: one column per method (a percentage follows the label on the sheet). All ultrasonic techniques share "UT". */
  iss: [
    column('vt', 'VT', { VI: 'any', ...both('VT') }), column('rt', 'RT', both('RT')), column('ptmt', 'PT / MT', both('PT', 'MT')),
    column('ut', 'UT', both('UT', 'PA', 'TOFD')), column('pmi', 'PMI', both('PMI')), column('fn', 'FN', both('FN')), column('hv', 'HV', both('HV')),
  ],
  /** [WQ] / [WQ ver 2]: the pairs `A / NA` + `Rep. No.`. "MT cap / MT bevel" is one pair; visual inspection has its own VT-no. column. */
  wq: [column('aut', 'AUT / Phased Array', both('PA')), column('rt', 'Radiography', both('RT')), column('ut', 'US las', both('UT')), column('tofd', 'ToFD', both('TOFD')), column('mt', 'MT cap / MT bevel', both('MT'))],
};
/** The visual-inspection column on its own (the VT report numbers of [WQ] and [WQ ver 2]). */
export const VT_COLUMN: NdtFormColumn = GU_COLUMNS.VT;

const fits = (match: NdtMatch, type: string, method: NdtMethod | null) => {
  const rule = match[type as NdtRequestType];
  return rule === 'any' || (rule !== undefined && method !== null && rule.includes(method));
};

/** The [GU] family's table, derived from its columns: request type, then technique (or `any`), to the column id. */
export const COLUMN_TABLE: Record<string, Partial<Record<NdtMethod | 'any', NdtColumnId>>> = {};
for (const [id, item] of Object.entries(GU_COLUMNS) as [NdtColumnId, NdtFormColumn][]) for (const [type, rule] of Object.entries(item.match) as [string, NdtMethod[] | 'any'][]) for (const method of rule === 'any' ? ['any' as const] : rule) (COLUMN_TABLE[type] ??= {})[method] = id;

export interface NdtNames { process: string; group: string }
/** The [GU]-family column of an examination of this request type and process, or null. */
export function ndtColumnOf(request: Row, names: NdtNames): NdtColumnId | null {
  const method = ndtMethodOf(names.process, names.group);
  return (GU_FAMILY_COLUMNS.find(item => fits(item.match, String(request.type ?? ''), method))?.id as NdtColumnId | undefined) ?? null;
}

// ----- cells ----------------------------------------------------------------------------------------------------------
/** One printed pair of a form: `result` is "A" (accepted) or "NA" (not accepted), empty without a result; `report` the report number; `date` the examination date (ISO). */
export interface NdtCell { result: 'A' | 'NA' | ''; report: string; date: string }
export const EMPTY_NDT_CELL: NdtCell = { result: '', report: '', date: '' };
export type NdtCells = Record<string, NdtCell>;
export type NdtColumnCells = Record<string, NdtCell>;
/** Records the cells are read from (the account's readable rows). */
export interface NdtLookups { results: Row[]; requests: Row[]; processes: Row[]; groups: Row[] }
export const ndtLookups = (rows: Record<string, Row[]>): NdtLookups => ({ results: rows.inspection_results || [], requests: rows.inspection_requests || [], processes: rows.ndt_processes || [], groups: rows.ndt_groups || [] });

const text = (value: unknown) => String(value ?? '').trim();
const roundIndex = (value: unknown) => NDT_ROUNDS.findIndex(round => round.key === value);
/** Newest examination first: by date, then by round, then by creation. */
const newest = (a: Row, b: Row) => text(b.date).localeCompare(text(a.date)) || roundIndex(b.round) - roundIndex(a.round) || text(b._createdAt).localeCompare(text(a._createdAt)) || b.id.localeCompare(a.id);

/**
 * The cell of every column of a form for one weld, keyed by column id. Considered are this weld's results that
 * are not archived and carry a result (not "Not applicable"), whose request is not cancelled; the process of an
 * examination is the result's own (each round has one), else its request's. Per column the newest result
 * counts (an accepted additional round replaces an earlier rejected one). Columns without a result are empty.
 */
export function ndtFormCells(columns: NdtFormColumn[], weld: Row, lookups: NdtLookups): NdtCells {
  const process = new Map(lookups.processes.map(row => [row.id, row])), group = new Map(lookups.groups.map(row => [row.id, text(row.name)]));
  const request = new Map(lookups.requests.map(row => [row.id, row]));
  const own = lookups.results.filter(row => !row._archived && row.weldId === weld.id && resultCode(row.result) !== '---' && request.get(String(row.requestId))?.status !== 'Cancelled' && !request.get(String(row.requestId))?._archived && (request.get(String(row.requestId))?.weldId ?? weld.id) === weld.id).sort(newest);
  const prepared = own.map(result => {
    const source = request.get(String(result.requestId)), record = process.get(String(result.processId || source?.processId));
    return { result, type: text(result.type) || text(source?.type), method: record ? ndtMethodOf(text(record.name), group.get(String(record.groupId)) ?? '') : null };
  });
  return Object.fromEntries(columns.map(item => {
    const hit = prepared.find(entry => fits(item.match, entry.type, entry.method));
    return [item.id, hit ? { result: resultCode(hit.result.result) as 'A' | 'NA', report: text(hit.result.reportNo), date: text(hit.result.date).slice(0, 10) } : EMPTY_NDT_CELL];
  }));
}
