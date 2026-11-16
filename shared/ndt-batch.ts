import type { Row } from './types.ts';
import { NDT_ROUNDS, autoReweld, currentRequest, processField, requestProcessIds, weldWelderIds } from './inspections.ts';

/**
 * Welding data → NDT Batch Import (reference page `ndt-batch-import`, user manual §21). Two tabs: "Via file" (template,
 * CSV / Excel upload, preview with a state per row, Lookup of an unmatched weld, Commit) and "Via request number"
 * (NDT-Pre / NDT, NDT Request No., Search welds, results per test, Report No. and PDF per isometric, Commit import).
 * Every result is written by the action of the NDT cell (`ndt-weld`, server/inspections.ts), so its rules, locks and
 * rights apply to each row. This module holds the pure part: columns, parsing, matching and the state of a row.
 * The reference account had no right on the page, so labels beyond the manual's own words are ours (see the report).
 */
export const NDT_BATCH_PATH = '/welding/ndt-batch-import';
export const NDT_BATCH_TITLE = 'NDT Batch Import';
/** Reference permission area "NDT Batch Import" (weld__system__profiles.txt :126): Show opens the page, Import = Upload / Commit. */
export const NDT_BATCH_AREA = '121';
export const NDT_BATCH_TABS = [{ key: 'file', label: 'Via file' }, { key: 'request', label: 'Via request number' }] as const;
export type NdtBatchTab = typeof NDT_BATCH_TABS[number]['key'];
export const NDT_BATCH_MAX_ROWS = 1000;
const MAX_TEXT = 200;

// ----- Via file: columns and parsing -------------------------------------------------------------------------------

/** Columns of the template, in its order. NaLength, DefectType, Welder and ReWeld are the manual's own names. */
export const NDT_BATCH_COLUMNS = [
  { field: 'project', header: 'Project' },
  { field: 'isometric', header: 'Isometric' },
  { field: 'weldNo', header: 'WeldNo' },
  { field: 'process', header: 'NdtProcess' },
  { field: 'result', header: 'Result' },
  { field: 'date', header: 'NdtDate' },
  { field: 'reportNo', header: 'ReportNo' },
  { field: 'filmNo', header: 'FilmNo' },
  { field: 'naLength', header: 'NaLength' },
  { field: 'defectType', header: 'DefectType' },
  { field: 'welder', header: 'Welder' },
  { field: 'reweld', header: 'ReWeld' },
] as const;
export type NdtBatchField = typeof NDT_BATCH_COLUMNS[number]['field'];
export type NdtBatchValues = Partial<Record<NdtBatchField, string>>;
const squash = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, NdtBatchField> = { iso: 'isometric', isono: 'isometric', isometricno: 'isometric', weld: 'weldNo', weldnumber: 'weldNo', process: 'process', ndt: 'process', ndtprocess: 'process', date: 'date', reportnumber: 'reportNo', ndtrpnr: 'reportNo', ndtreportno: 'reportNo', filmnr: 'filmNo', length: 'naLength', defect: 'defectType', defectcode: 'defectType', welderid: 'welder', welderforerror: 'welder', reweld: 'reweld' };
/** The column a heading of the file stands for (case, spaces and punctuation do not matter), or undefined. */
export function ndtBatchField(header: unknown): NdtBatchField | undefined {
  const key = squash(header); if (!key) return undefined;
  return NDT_BATCH_COLUMNS.find(column => squash(column.header) === key || squash(column.field) === key)?.field ?? ALIASES[key];
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
/** The rows of a sheet: the first row holds the headings, every later row with a value is one row (rowNo = sheet row). */
export function ndtBatchRows(table: unknown[][]): { rows: { rowNo: number; values: NdtBatchValues }[]; error?: string } {
  const [head = [], ...body] = table;
  const columns = new Map<number, NdtBatchField>();
  head.forEach((cell, index) => { const field = ndtBatchField(cell); if (field && ![...columns.values()].includes(field)) columns.set(index, field); });
  const missing = (['isometric', 'weldNo', 'process', 'result'] as NdtBatchField[]).filter(field => ![...columns.values()].includes(field));
  if (missing.length) return { rows: [], error: `Row 1 must hold the column headings of the template. Missing: ${missing.map(field => NDT_BATCH_COLUMNS.find(column => column.field === field)!.header).join(', ')}.` };
  const rows: { rowNo: number; values: NdtBatchValues }[] = [];
  body.forEach((line, index) => {
    const values: NdtBatchValues = {};
    for (const [column, field] of columns) { const value = text(line?.[column]); if (value) values[field] = value.slice(0, MAX_TEXT); }
    if (Object.keys(values).length) rows.push({ rowNo: index + 2, values });
  });
  if (!rows.length) return { rows, error: 'The file has no result rows. Enter one NDT result per row, starting on row 2.' };
  if (rows.length > NDT_BATCH_MAX_ROWS) return { rows: [], error: `Import at most ${NDT_BATCH_MAX_ROWS} rows at a time.` };
  return { rows };
}
/** A file's result: A / Accepted is stored Accepted, NA / Not accepted / Rejected is stored Rejected (shown NA). */
export function batchResult(value: unknown): 'Accepted' | 'Rejected' | '' {
  const key = squash(value);
  if (['a', 'accepted', 'ok'].includes(key)) return 'Accepted';
  if (['na', 'notaccepted', 'rejected', 'nok'].includes(key)) return 'Rejected';
  return '';
}
/** ReWeld: ticked (yes, y, x, 1, true), not ticked (no, n, 0, false) or left to the rule (empty). */
export function batchFlag(value: unknown): boolean | undefined | null {
  const key = squash(value); if (!key) return undefined;
  if (['yes', 'y', 'x', '1', 'true', 'ja', 'j'].includes(key)) return true;
  if (['no', 'n', '0', 'false', 'nee'].includes(key)) return false;
  return null;
}
/** NdtDate as YYYY-MM-DD: 2026-10-28, 28-10-2026, 28.10.2026 or 28/10/2026; '' when empty, null when it is no date. */
export function batchDate(value: unknown): string | null {
  const raw = text(value); if (!raw) return '';
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(raw); let year: number, month: number, day: number;
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(raw))) [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// ----- Via file: matching and the state of a row ---------------------------------------------------------------

export const NDT_BATCH_TEXTS = {
  naFields: 'An NA row needs NaLength, DefectType and Welder. This row is not saved.',
  unmatched: 'No weld of the open main project has this isometric and weld number. Use Lookup to choose the weld.',
  ambiguous: 'Several welds of the open main project match. Use Lookup to choose the weld.',
  otherSite: 'This weld is not on the open main project.',
  duplicate: 'This weld and NDT process appear on an earlier row of the file.',
  nothing: 'No row can be saved. Correct the red rows or use Lookup, then commit again.',
  chooseSite: 'Choose a main project first.',
};
export type NdtBatchState = 'ready' | 'unmatched' | 'error';
export const NDT_BATCH_STATE_LABELS: Record<NdtBatchState, string> = { ready: 'Ready', unmatched: 'Not matched', error: 'Not saved' };
/** The records of the open main project the rows are matched against (the server reads them; nothing of another main project). */
export interface NdtBatchContext {
  projects: Row[]; isometrics: Row[]; welds: Row[]; processes: Row[]; welders: Row[]; diameters: Row[]; defectCodes: Row[];
}
export interface NdtBatchRow {
  rowNo: number; values: NdtBatchValues; weldId: string; state: NdtBatchState; errors: string[];
  /** Filled for a matched row: what the row shows and writes. */
  weldNo?: string; isoNo?: string; result?: 'Accepted' | 'Rejected'; round?: string; processId?: string; reweld?: boolean;
}
/** The input of the NDT cell's action (`ndt-weld`) for one row; locationId is added by the server (the weld's own location). */
export interface NdtWeldInput { weldId: string; type: 'NDT' | 'NDT PRE'; rounds: { round: string; processId: string; reportNo: string; filmNo?: string; date?: string; result: string }[]; naLength?: string; defectType?: string; welderForErrorId?: string; reweld?: boolean; welderId?: string; date?: string }

const same = (a: unknown, b: unknown) => text(a).toLowerCase() === text(b).toLowerCase() && text(a) !== '';
/** Welds of the context with this isometric and weld number (and project, when the row names one). */
export function batchCandidates(values: NdtBatchValues, context: NdtBatchContext): Row[] {
  const projects = context.projects.filter(project => !values.project || same(project.internnumber, values.project) || same(project.externnumber, values.project));
  const isos = context.isometrics.filter(iso => projects.some(project => project.id === iso.projectId) && same(iso.isoNo, values.isometric));
  return context.welds.filter(weld => isos.some(iso => iso.id === weld.isoId) && same(weld.weldNo, values.weldNo));
}
/** The round (column of the NDT dialog) of the weld whose NDT process is `processId`; '' when the weld has none. */
export const weldRoundOf = (weld: Row, processId: string, pre = false) => NDT_ROUNDS.find(round => text(weld[processField(pre, round.index)]) === processId)?.key ?? '';
/** A welder named in the file: one of the weld's own welders, by Welder ID number, ID number or name. */
export function weldWelderNamed(weld: Row, named: unknown, welders: Row[]): string {
  return weldWelderIds(weld).find(id => { const welder = welders.find(row => row.id === id); return Boolean(welder) && [welder!.welderCode, welder!.number, welder!.name].some(value => same(value, named)); }) ?? '';
}
/** A defect type named in the file: a code offered on the main project (by code or its English text); the stored value is the code. */
export function defectCodeNamed(named: unknown, codes: Row[]): string {
  const code = codes.find(row => same(row.code, named)) ?? codes.find(row => same(row.english, named));
  return code ? text(code.code) : '';
}
/**
 * The state of one file row against the open main project. `weldId` is the weld chosen with Lookup (it must be one of
 * the context's welds); without it the row is matched by its isometric and weld number. A row is `ready` when it can be
 * written; `unmatched` until its weld is known; `error` (red) when a value is missing or wrong. An NA row needs NaLength,
 * DefectType and Welder (manual §21); ReWeld is ticked automatically only at 3 inch or smaller.
 */
export function batchRowState(row: { rowNo: number; values: NdtBatchValues; weldId?: string }, context: NdtBatchContext): NdtBatchRow {
  const values = row.values, errors: string[] = [];
  const base = { rowNo: row.rowNo, values, weldId: '' };
  const result = batchResult(values.result);
  if (!text(values.result)) errors.push('Enter the Result (A or NA).'); else if (!result) errors.push('Result must be A or NA.');
  if (!text(values.reportNo)) errors.push('Enter the ReportNo.');
  const date = batchDate(values.date); if (date === null) errors.push('NdtDate must be a date such as 2026-10-28 or 28-10-2026.');
  const process = context.processes.find(item => same(item.name, values.process));
  if (!text(values.process)) errors.push('Enter the NdtProcess.'); else if (!process) errors.push(`NDT process ${values.process} does not exist.`);
  const reweld = batchFlag(values.reweld); if (reweld === null) errors.push('ReWeld must be yes or no.');
  const na = result === 'Rejected', naGiven = [values.naLength, values.defectType, values.welder].some(value => text(value));
  if (na && ![values.naLength, values.defectType, values.welder].every(value => text(value))) errors.push(NDT_BATCH_TEXTS.naFields);
  if (result === 'Accepted' && (naGiven || reweld === true)) errors.push('NaLength, DefectType, Welder and ReWeld are filled only on an NA row.');
  if (text(values.naLength) && !/^\d+$/.test(text(values.naLength))) errors.push('NaLength is a whole number of millimetres.');
  let weld: Row | undefined;
  if (row.weldId) { weld = context.welds.find(item => item.id === row.weldId); if (!weld) return { ...base, state: 'unmatched', errors: [NDT_BATCH_TEXTS.otherSite, ...errors] }; }
  else {
    if (!text(values.isometric) || !text(values.weldNo)) errors.push('Enter the Isometric and the WeldNo.');
    const found = text(values.isometric) && text(values.weldNo) ? batchCandidates(values, context) : [];
    if (found.length !== 1) return { ...base, state: errors.length ? 'error' : 'unmatched', errors: [...errors, ...(text(values.isometric) && text(values.weldNo) ? [found.length ? NDT_BATCH_TEXTS.ambiguous : NDT_BATCH_TEXTS.unmatched] : [])] };
    weld = found[0];
  }
  const iso = context.isometrics.find(item => item.id === weld!.isoId);
  const matched = { ...base, weldId: weld.id, weldNo: text(weld.weldNo), isoNo: text(iso?.isoNo) };
  const round = process ? weldRoundOf(weld, process.id) : '';
  if (process && !round) errors.push(`Weld ${text(weld.weldNo)} has no NDT process ${text(process.name)}.`);
  if (na && text(values.welder) && !weldWelderNamed(weld, values.welder, context.welders)) errors.push(`Welder ${values.welder} is not a welder of weld ${text(weld.weldNo)}.`);
  if (na && text(values.defectType) && !defectCodeNamed(values.defectType, context.defectCodes)) errors.push(`Defect type ${values.defectType} is not offered on this main project.`);
  if (errors.length) return { ...matched, state: 'error', errors };
  return { ...matched, state: 'ready', errors: [], result: result as 'Accepted' | 'Rejected', round, processId: process!.id, reweld: na ? reweld ?? autoReweld(weld, context.diameters) : false };
}
/** The NDT cell's input for a ready row (always NDT: the NA fields of the file do not exist on NDT Pre). */
export function batchRowInput(row: NdtBatchRow, context: NdtBatchContext): NdtWeldInput {
  const weld = context.welds.find(item => item.id === row.weldId)!;
  const na = row.result === 'Rejected', date = batchDate(row.values.date) || '';
  return {
    weldId: row.weldId, type: 'NDT',
    rounds: [{ round: row.round!, processId: row.processId!, reportNo: text(row.values.reportNo), filmNo: text(row.values.filmNo), date, result: row.result! }],
    ...(na ? { naLength: text(row.values.naLength), defectType: defectCodeNamed(row.values.defectType, context.defectCodes), welderForErrorId: weldWelderNamed(weld, row.values.welder, context.welders), reweld: row.reweld === true } : {}),
    ...(date ? { date } : {}),
  };
}
/** States of all rows: a later row on the same weld and NDT process as a ready earlier one is red (one result per process). */
export function batchStates(rows: { rowNo: number; values: NdtBatchValues; weldId?: string }[], context: NdtBatchContext): NdtBatchRow[] {
  const seen = new Set<string>();
  return rows.map(input => {
    const row = batchRowState(input, context);
    if (row.state !== 'ready') return row;
    const key = `${row.weldId}|${row.processId}`;
    if (seen.has(key)) return { ...row, state: 'error' as const, errors: [NDT_BATCH_TEXTS.duplicate] };
    seen.add(key); return row;
  });
}
export interface NdtBatchSummary { total: number; ready: number; unmatched: number; error: number; accepted: number; rejected: number }
export function batchSummary(rows: NdtBatchRow[]): NdtBatchSummary {
  const ready = rows.filter(row => row.state === 'ready');
  return { total: rows.length, ready: ready.length, unmatched: rows.filter(row => row.state === 'unmatched').length, error: rows.filter(row => row.state === 'error').length, accepted: ready.filter(row => row.result === 'Accepted').length, rejected: ready.filter(row => row.result === 'Rejected').length };
}
/** The success message: the number of A and the number of NA (manual §21). */
export const batchDoneMessage = (accepted: number, rejected: number) => `Import committed: ${accepted} A and ${rejected} NA.`;
/** Lookup of an unmatched weld: welds of the open main project whose isometric or weld number contains every word typed. */
export function batchLookup(query: unknown, context: NdtBatchContext, limit = 50): { id: string; weldNo: string; isoNo: string; project: string }[] {
  const words = text(query).toLowerCase().split(/\s+/).filter(Boolean);
  const out: { id: string; weldNo: string; isoNo: string; project: string }[] = [];
  for (const weld of context.welds) {
    const iso = context.isometrics.find(item => item.id === weld.isoId), project = context.projects.find(item => item.id === iso?.projectId);
    const entry = { id: weld.id, weldNo: text(weld.weldNo), isoNo: text(iso?.isoNo), project: text(project?.internnumber) };
    const haystack = `${entry.weldNo} ${entry.isoNo} ${entry.project}`.toLowerCase();
    if (words.every(word => haystack.includes(word))) out.push(entry);
  }
  return out.sort((a, b) => a.isoNo.localeCompare(b.isoNo, 'en', { numeric: true }) || a.weldNo.localeCompare(b.weldNo, 'en', { numeric: true })).slice(0, limit);
}

// ----- Via request number ----------------------------------------------------------------------------------------

/** The toggle of the tab: NDT-Pre (pre-weld) or NDT (post-weld); the stored types. */
export const NDT_BATCH_REQUEST_TYPES = [{ value: 'NDT PRE', label: 'NDT-Pre' }, { value: 'NDT', label: 'NDT' }] as const;
/** The request number typed: R00029, 00029 or 29 all name R00029; an older number (R-2026-0003) is taken as typed. */
export function batchRequestNumber(value: unknown): string {
  const raw = text(value).toUpperCase(); if (!raw) return '';
  const digits = /^R?(\d{1,5})$/.exec(raw);
  return digits ? `R${digits[1].padStart(5, '0')}` : raw;
}
export interface NdtBatchTest { processId: string; processName: string; round: string; result: string; date: string; reportNo: string; naLength: string; defectType: string; welderForErrorId: string; reweld: boolean }
export interface NdtBatchRequestWeld { weldId: string; weldNo: string; requestId: string; welderIds: string[]; autoReweld: boolean; tests: NdtBatchTest[]; /** The weld has a later request of this type: results go there, so this line cannot be written here. */ superseded?: boolean }
export interface NdtBatchRequestIso { isoId: string; isoNo: string; project: string; welds: NdtBatchRequestWeld[] }
/**
 * Search welds: the lines of request `number` of `type` whose weld is one of the context's welds (the open main project),
 * grouped per isometric; per weld only the NDT processes requested on this number, with what is already recorded.
 */
export function requestBatch(number: string, type: string, context: NdtBatchContext & { requests: Row[]; results: Row[] }): NdtBatchRequestIso[] {
  const pre = type === 'NDT PRE';
  const lines = context.requests.filter(line => !line._archived && line.number === number && line.type === type && line.status !== 'Cancelled');
  const groups = new Map<string, NdtBatchRequestIso>();
  for (const line of lines) {
    const weld = context.welds.find(item => item.id === line.weldId); if (!weld) continue;
    const iso = context.isometrics.find(item => item.id === weld.isoId); if (!iso) continue;
    const project = context.projects.find(item => item.id === iso.projectId);
    const tests = requestProcessIds(line, context.results, context.processes).map(processId => {
      const round = weldRoundOf(weld, processId, pre);
      const stored = context.results.find(item => !item._archived && item.requestId === line.id && (round ? item.round === round : item.processId === processId) && text(item.result));
      return { processId, processName: text(context.processes.find(item => item.id === processId)?.name), round, result: text(stored?.result), date: text(stored?.date), reportNo: text(stored?.reportNo), naLength: stored?.naLength === null || stored?.naLength === undefined ? '' : text(stored.naLength), defectType: text(stored?.defectType), welderForErrorId: text(stored?.welderForErrorId), reweld: stored?.reweld === true };
    });
    if (!tests.length) continue;
    const group = groups.get(iso.id) ?? { isoId: iso.id, isoNo: text(iso.isoNo), project: text(project?.internnumber), welds: [] };
    const latest = currentRequest(context.requests, weld.id, type);
    group.welds.push({ weldId: weld.id, weldNo: text(weld.weldNo), requestId: line.id, welderIds: weldWelderIds(weld), autoReweld: autoReweld(weld, context.diameters), tests, ...(latest && latest.id !== line.id ? { superseded: true } : {}) });
    groups.set(iso.id, group);
  }
  const order = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  return [...groups.values()].map(group => ({ ...group, welds: group.welds.sort((a, b) => order(a.weldNo, b.weldNo)) })).sort((a, b) => order(a.isoNo, b.isoNo));
}
/** One test of the request tab as the page sends it. */
export interface NdtBatchRequestTest { weldId: string; processId: string; result: string; date?: string; naLength?: string; defectType?: string; welderId?: string; reweld?: boolean }
/** Problems of one isometric of the request tab before anything is written (the NDT cell's own rules run after). */
export function requestIsoErrors(iso: { reportNo?: unknown; tests: NdtBatchRequestTest[] }, isoNo: string): string[] {
  const errors: string[] = [];
  if (!text(iso.reportNo)) errors.push(`Enter the Report No. of ISO ${isoNo}.`);
  for (const test of iso.tests) {
    if (!['Accepted', 'Rejected'].includes(test.result)) errors.push(`ISO ${isoNo}: choose A or NA for every selected test.`);
    if (test.date && batchDate(test.date) === null) errors.push(`ISO ${isoNo}: enter a valid NDT date.`);
  }
  return [...new Set(errors)];
}
/** The NDT cell's input for one test of the request tab. NDT Pre takes the welder (required there) and no NA block. */
export function requestTestInput(test: NdtBatchRequestTest, weld: Row, type: 'NDT' | 'NDT PRE', reportNo: string): NdtWeldInput {
  const pre = type === 'NDT PRE', na = test.result === 'Rejected', date = batchDate(test.date) || '';
  return {
    weldId: weld.id, type,
    rounds: [{ round: weldRoundOf(weld, test.processId, pre), processId: test.processId, reportNo, date, result: test.result }],
    ...(pre ? { welderId: text(test.welderId) } : na ? { naLength: text(test.naLength), defectType: text(test.defectType), welderForErrorId: text(test.welderId), reweld: test.reweld === true } : {}),
    ...(date ? { date } : {}),
  };
}
