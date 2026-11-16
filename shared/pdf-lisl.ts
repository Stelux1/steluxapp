import type { Row } from './types.ts';
import { lislValues } from './lisl.ts';
import { currentRevision } from './revisions.ts';

/**
 * Data side of the LISL documents (LISL Report A4 / A3 and the blank template): which welds are printed,
 * what each cell says, and the one mapping from inspection data to the NDT / PWHT cells (`lislNdtCells`).
 * Layout lives in `server/pdf/lisl.ts`.
 */

export const LISL_TYPES = ['All', 'Shop', 'Field'] as const;
export type LislType = typeof LISL_TYPES[number];
export interface LislOptions {
  /** Weld type location: All, Shop or Field (by the weld type's location). */
  type: LislType;
  /**
   * "Weld record" (our reading of the reference option, not confirmed by the capture): on prints what was
   * recorded for each weld (certificate / charge numbers, WPS, welder, date, NDT and PWHT); off prints the
   * identification columns only and leaves those cells empty, as a form to fill in.
   */
  weldRecord: boolean;
  /** "Signature on each page": the current user's short signature in the company signature line. */
  signaturePerPage: boolean;
}
export const DEFAULT_LISL_OPTIONS: LislOptions = { type: 'All', weldRecord: true, signaturePerPage: false };

// ----- inspection data → report cells ---------------------------------------------------------------------------
/** The five examination rounds of a weld, in column order. Result "NA" in the report is our "Rejected". */
export const NDT_ROUNDS = ['Initial', 'Remaining', 'Additional', 'Additional 2', 'Additional 3'] as const;
/** Earlier spellings of a round that still map to a column. */
const ROUND_ALIASES: Record<string, number> = { 'Additional 1': 2 };
export type ResultCode = 'A' | 'NA' | '---';
export interface NdtCell {
  /** Report number (empty while there is no result). */
  report: string;
  /** Process shown next to the code, e.g. "RT". */
  process: string;
  /** Empty when nothing was requested for this column. */
  result: ResultCode | '';
  /** The two printed lines: the report number, then `process (code)` or `process ---` (requested, no result). */
  lines: [string, string];
}
export interface LislNdtCells { ndt: NdtCell[]; pre: NdtCell[]; pwht: NdtCell }
/** Name of the process shown for a request (RT, MT, PT, a PWHT process…); the caller knows the catalogs. */
export type ProcessName = (request: Row) => string;

const EMPTY_CELL: NdtCell = { report: '', process: '', result: '', lines: ['', ''] };
/** Report code of a stored result: Accepted → A, Rejected (or already NA) → NA. */
export const resultCode = (value: unknown): ResultCode => value === 'Accepted' || value === 'A' ? 'A' : value === 'Rejected' || value === 'NA' ? 'NA' : '---';
const byDate = (a: Row, b: Row) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a._createdAt.localeCompare(b._createdAt) || a.id.localeCompare(b.id);
const roundIndex = (value: unknown) => { const name = String(value ?? ''); const index = NDT_ROUNDS.findIndex(round => round === name); return index >= 0 ? index : ROUND_ALIASES[name] ?? -1; };

function cellOf(request: Row, results: Row[], processName: ProcessName): NdtCell {
  const result = results.filter(row => row.requestId === request.id).sort((a, b) => byDate(b, a))[0];
  const process = processName(request), code = result ? resultCode(result.result) : '---';
  const report = result ? String(result.reportNo ?? '') : '';
  return { report, process, result: code, lines: [report, result ? `${process} (${code})`.trim() : `${process} ---`.trim()] };
}

/**
 * THE mapping from a weld's inspection data to the report's NDT / PWHT cells.
 * `requests` and `results` are any records; the function picks this weld's (not archived, request not
 * cancelled). Returns five NDT PRE cells (type "NDT PRE"), five NDT cells (type "NDT") and one PWHT cell
 * (the latest "PWHT" request). A request goes to the column of its result's round (Initial, Remaining,
 * Additional, Additional 2, Additional 3; the older "Additional 1" counts as Additional); requests without a
 * result, or whose round is taken, fill the first free column in request-date order.
 * The integrator adjusts only this function when the inspection model changes.
 */
export function lislNdtCells(weld: Row, results: Row[], requests: Row[], processName: ProcessName = request => String(request.processId ?? request.pwhtProcessId ?? '')): LislNdtCells {
  const mine = requests.filter(row => !row._archived && row.weldId === weld.id && row.status !== 'Cancelled').sort(byDate);
  const own = results.filter(row => !row._archived && row.weldId === weld.id);
  const slots = (type: string): NdtCell[] => {
    const cells: NdtCell[] = Array.from({ length: NDT_ROUNDS.length }, () => EMPTY_CELL), taken = new Set<string>(), pending: Row[] = [];
    for (const request of mine.filter(row => row.type === type)) {
      const result = own.filter(row => row.requestId === request.id).sort((a, b) => byDate(b, a))[0], index = roundIndex(result?.round);
      if (index >= 0 && cells[index] === EMPTY_CELL) { cells[index] = cellOf(request, own, processName); taken.add(request.id); } else pending.push(request);
    }
    for (const request of pending) { const free = cells.indexOf(EMPTY_CELL); if (free >= 0) cells[free] = cellOf(request, own, processName); }
    return cells;
  };
  const pwhtRequest = mine.filter(row => row.type === 'PWHT').at(-1);
  return { ndt: slots('NDT'), pre: slots('NDT PRE'), pwht: pwhtRequest ? cellOf(pwhtRequest, own, processName) : EMPTY_CELL };
}

// ----- model ---------------------------------------------------------------------------------------------------
export interface LislEntry {
  weld: Row; values: Record<string, string>; weldType?: Row; ndt: LislNdtCells;
  /** Two printed lines (side 1, side 2) of material and certificate data. */
  attest: [string, string];
}
export interface LislModel {
  iso: Row; project?: Row; site?: Row;
  client: string; revision: string; testSystem: string;
  entries: LislEntry[];
}
const text = (value: unknown) => String(value ?? '').trim();
const yes = (value: unknown) => value === true ? 'Yes' : value === false ? 'No' : text(value);
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
/** Dates print as dd.mm.yyyy. */
export const printDate = (value: unknown) => { const raw = text(value).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split('-').reverse().join('.') : text(value); };

/**
 * Welds of one isometric as printed: filtered by the weld type's location, in weld-number order, each with the
 * joined values of `lislValues` and the NDT / PWHT cells. `rows` holds the records the account may read.
 */
export function lislModel(rows: Record<string, Row[]>, isoId: string, type: LislType = 'All'): LislModel | null {
  const find = (key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
  const iso = (rows.isometrics || []).find(row => row.id === isoId && !row._archived);
  if (!iso) return null;
  const project = find('projects', iso.projectId), site = find('sites', project?.siteId);
  const processes = new Map((rows.ndt_processes || []).map(row => [row.id, text(row.name)]));
  const pwhtProcesses = new Map((rows.pwht_processes || []).map(row => [row.id, text(row.name)]));
  const processName: ProcessName = request => processes.get(String(request.processId)) || pwhtProcesses.get(String(request.pwhtProcessId)) || '';
  const entries = (rows.welds || []).filter(weld => !weld._archived && weld.isoId === iso.id).filter(weld => {
    const location = text(find('weld_types', weld.typeId)?.location);
    return type === 'All' || location === type;
  }).sort((a, b) => natural(text(a.weldNo), text(b.weldNo))).map((weld): LislEntry => {
    const values = Object.fromEntries(Object.entries(lislValues(weld, rows)).map(([key, value]) => [key, text(value)]));
    const attest = [1, 2].map(side => text(find('certifications', weld[`certificate${side}Id`])?.name)) as [string, string];
    return { weld, values, weldType: find('weld_types', weld.typeId), ndt: lislNdtCells(weld, rows.inspection_results || [], rows.inspection_requests || [], processName), attest };
  });
  return { iso, project, site, client: text(find('companies', project?.companyId)?.name), revision: currentRevision(rows, iso.id, 'ISO'), testSystem: text(find('test_systems', iso.testSystemId)?.name), entries };
}

// ----- header data -----------------------------------------------------------------------------------------------
export interface LabelValueItem { label: string; value: string }
/** Client / project block (left of the header). */
export const lislClientBlock = (model: LislModel): LabelValueItem[] => [
  { label: 'Client', value: model.client }, { label: 'Intern prj. no.', value: text(model.project?.internnumber) },
  { label: 'Extern prj. no.', value: text(model.project?.externnumber) }, { label: 'Project description', value: text(model.project?.description) },
];
/** The grey isometric box in row order for three columns (column 1: isometric, 2: compliance, 3: technical). */
export function lislIsoBox(model: LislModel): LabelValueItem[] {
  const iso = model.iso;
  const columns = [
    [{ label: 'Iso number', value: `${text(iso.isoNo)}${model.revision ? ` Rev. ${model.revision}` : ''}` }, { label: 'ITP No', value: text(iso.itpNo) }, { label: 'Asset tag', value: text(iso.assetTag) }, { label: 'Drawing no.', value: text(iso.drawingNo) }],
    [{ label: 'NoBo', value: yes(iso.noBo) }, { label: 'NoBo Reg. no.', value: text(iso.noBoReg) }, { label: 'PED Cat.-Mod', value: text(iso.ped) }, { label: 'X Ray %', value: text(iso.xRay) }],
    [{ label: 'PWHT', value: yes(iso.pwht) }, { label: 'Piping class', value: text(iso.pipingClass) }, { label: 'Test pressure', value: text(iso.testPressure) }, { label: 'Test system', value: model.testSystem }],
  ];
  return columns[0].flatMap((_, row) => columns.map(column => column[row]));
}

// ----- columns -------------------------------------------------------------------------------------------------
export interface LislColumn {
  key: string; header: string[]; width: number;
  /** Cells that show what was recorded for the weld; they stay empty when "Weld record" is off. */
  record?: boolean;
  cell(entry: LislEntry): [string, string];
}
const side = (entry: LislEntry, key: string): [string, string] => [entry.values[`${key} 1`] ?? '', entry.values[`${key} 2`] ?? ''];
const welderCodes = (entry: LislEntry) => [entry.values.Welder, entry.values['Welder 2'], entry.values['Welder 3'], entry.values['Welder 4']].map(value => (value ?? '').split(' | ')[0].trim()).filter(Boolean).join('/');
const ndtCell = (cell: NdtCell): [string, string] => cell.lines;
/** Type abbreviation and joint ("WS/", "FW/BW"); a tracer welder adds "-Tr". */
const typeLine = (entry: LislEntry) => {
  const abbreviation = text(entry.weldType?.abbreviation || entry.weldType?.name), joint = entry.values['Joint type'] ?? '';
  return `${abbreviation || joint ? `${abbreviation}/${joint}` : ''}${entry.weld.tracer === true ? '-Tr' : ''}`;
};
const baseColumns = (a3: boolean): LislColumn[] => [
  { key: 'wn', header: ['WN', 'Type'], width: 6.5, cell: entry => [text(entry.weld.weldNo), typeLine(entry)] },
  { key: 'ind', header: ['Ind. no.'], width: 6, cell: entry => side(entry, 'Index No') },
  { key: 'pos', header: ['Pos /', 'Material'], width: 9.5, cell: entry => [1, 2].map(i => [entry.values[`Pos ${i}`], entry.values[`Material ${i}`]].filter(Boolean).join(' ')) as [string, string] },
  { key: 'dia', header: ['Dia./', 'Length'], width: 6, cell: entry => [entry.values['Diameter (inch)'] ? `${entry.values['Diameter (inch)']}"` : '', entry.weld.lengthMode === 'Length in mm' && entry.weld.dialen ? `${entry.weld.dialen} mm` : ''] },
  { key: 'wt', header: ['WT'], width: 4.5, cell: entry => side(entry, 'Wall thickness') },
  { key: 'sch', header: ['Sch.'], width: 4.5, cell: entry => side(entry, 'Schedule') },
  { key: 'chg', header: ['Chg.No.'], width: 7, record: true, cell: entry => side(entry, 'Charge No') },
  ...(a3 ? [{ key: 'attest', header: ['Attest number'], width: 8, record: true, cell: (entry: LislEntry) => entry.attest } satisfies LislColumn] : []),
  { key: 'wps', header: ['WPS'], width: 6.5, record: true, cell: entry => [entry.values['WPS No'], entry.values['Welding Process']] },
  { key: 'welder', header: ['Welder', 'Date'], width: 7.5, record: true, cell: entry => [welderCodes(entry), printDate(entry.values['Weld date'])] },
];
const ndtColumns = (kind: 'ndt' | 'pre', label: string, a3: boolean): LislColumn[] => NDT_ROUNDS.map((_, i) => ({ key: `${kind}${i + 1}`, header: [...(a3 ? ['NDT Rp/Nr.'] : ['NDT', 'Rp/Nr.']), `${label}${i + 1}`], width: 8.5, record: true, cell: (entry: LislEntry) => ndtCell(entry.ndt[kind][i]) }));
const pwhtColumn: LislColumn = { key: 'pwht', header: ['PWHT', 'Rp/Nr.'], width: 8.5, record: true, cell: entry => ndtCell(entry.ndt.pwht) };
/** Column set of the A4 report (NDT 1 to 5, PWHT) and of the A3 report (attest number, NDT PRE 1 to 5 before NDT 1 to 5). */
export const lislColumns = (a3: boolean): LislColumn[] => [...baseColumns(a3), ...(a3 ? ndtColumns('pre', 'PRE ', a3) : []), ...ndtColumns('ndt', '', a3), pwhtColumn];
/** The printed cells of one weld row for the column set; record columns are empty without "Weld record". */
export const lislRowCells = (entry: LislEntry, columns: LislColumn[], weldRecord: boolean): string[][] => columns.map(column => !weldRecord && column.record ? ['', ''] : column.cell(entry));
