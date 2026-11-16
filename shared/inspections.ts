import type { ActionDefinition, ActionField, Availability, Field, Row } from './types.ts';
import { weldItpId } from './itp-dashboard.ts';

/**
 * NDT, NDT Pre, visual inspection and Pre-HT / PWHT of welds (Weld Pilot). Pure functions over plain rows, shared by
 * the dialogs, the NDT/PWHT Manager, the isometric blockers and the server actions in `server/inspections.ts`.
 *
 * Stored values stay as before: the reference result "NA" (not accepted) is stored as "Rejected", the round
 * "Additional" as "Additional 1". Only the labels follow the reference.
 */

// ----- kinds, rounds and results -------------------------------------------------------------------------------

export type InspectionKind = 'VI' | 'NDT PRE' | 'NDT' | 'PWHT';
export const INSPECTION_KINDS: InspectionKind[] = ['VI', 'NDT PRE', 'NDT', 'PWHT'];
/** Column headers of the weld table. */
export const KIND_LABELS: Record<InspectionKind, string> = { VI: 'VI', 'NDT PRE': 'NDT (Pre)', NDT: 'NDT', PWHT: 'Pre-HT/PWHT' };
/** Stored inspection types behind one weld-table column. */
export const KIND_TYPES: Record<InspectionKind, string[]> = { VI: ['VI'], 'NDT PRE': ['NDT PRE'], NDT: ['NDT'], PWHT: ['PRE-HT', 'PWHT'] };
export const NDT_TYPES = ['NDT', 'NDT PRE'];
export const PWHT_TYPES = ['PRE-HT', 'PWHT'];

export interface NdtRound { key: string; label: string; index: number; }
/** The five examination rounds; `key` is the stored `round` value. */
export const NDT_ROUNDS: NdtRound[] = [
  { key: 'Initial', label: 'Initial', index: 1 },
  { key: 'Remaining', label: 'Remaining', index: 2 },
  { key: 'Additional 1', label: 'Additional', index: 3 },
  { key: 'Additional 2', label: 'Additional 2', index: 4 },
  { key: 'Additional 3', label: 'Additional 3', index: 5 },
];
export const roundLabel = (stored: unknown) => NDT_ROUNDS.find(round => round.key === stored)?.label ?? String(stored ?? '');
/** Choices of "NDT res." in the reference order. */
export const NDT_RESULT_CHOICES = [{ value: '', label: '—' }, { value: 'Rejected', label: 'NA' }, { value: 'Accepted', label: 'Accepted' }];
/** Label of a stored result: "Rejected" reads "NA" (not accepted) as in the reference. */
export const resultLabel = (stored: unknown) => stored === 'Rejected' ? 'NA' : stored === 'Not applicable' ? 'Not applicable' : stored === 'Accepted' ? 'Accepted' : '—';
/** Stored value of a result label ("NA" → "Rejected"); unknown labels give an empty result. */
export const storedResult = (label: unknown) => label === 'NA' || label === 'Rejected' ? 'Rejected' : label === 'Accepted' ? 'Accepted' : label === 'Not applicable' ? 'Not applicable' : '';

// ----- weld fields owned by this flow --------------------------------------------------------------------------

const ref = (name: string, label: string, target: string): Field => ({ name, label, type: 'ref', ref: target, hidden: true, section: 'NDT & PWHT' });
const text = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', hidden: true, ...extra });
/** Name of a weld's NDT process field for a round (1–5) of NDT (`pre` false) or NDT Pre. */
export const processField = (pre: boolean, index: number) => `${pre ? 'ndtPreProcess' : 'ndtProcess'}${index}Id`;
export const locationField = (pre: boolean) => pre ? 'ndtPreLocationId' : 'ndtLocationId';
/**
 * Weld fields of the mass edit's inspection part: NDT location (Pre) and NDT process (Pre) per round, PWHT location
 * (Pre) and PWHT process (Pre). Hidden in the generic weld form; the NDT dialog and the mass edit write them.
 */
export const INSPECTION_WELD_FIELDS: Field[] = [
  ref('ndtPreLocationId', 'NDT location Pre', 'ndt_locations'),
  ...NDT_ROUNDS.map(round => ref(processField(true, round.index), `NDT process Pre ${round.label}`, 'ndt_processes')),
  ref('ndtLocationId', 'NDT location', 'ndt_locations'),
  ...NDT_ROUNDS.map(round => ref(processField(false, round.index), `NDT process ${round.label}`, 'ndt_processes')),
  ref('pwhtPreLocationId', 'PWHT location Pre', 'pwht_locations'), ref('pwhtPreProcessId', 'PWHT process Pre', 'pwht_processes'),
  ref('pwhtLocationId', 'PWHT location', 'pwht_locations'), ref('pwhtProcessId', 'PWHT process', 'pwht_processes'),
  // Links written by the repair and tracer workflows.
  { ...ref('repairOfId', 'Repair of weld', 'welds'), section: undefined },
  { ...ref('tracerOfId', 'Tracer for weld', 'welds'), section: undefined },
];
/** Names of the inspection inputs of "Mass edit welds" (the weld-table flow renders them). */
export const INSPECTION_MASS_EDIT_FIELDS = INSPECTION_WELD_FIELDS.filter(field => !['repairOfId', 'tracerOfId'].includes(field.name)).map(field => field.name);
export const INSPECTION_RESULT_FIELDS: Field[] = [
  { name: 'processId', label: 'NDT process', type: 'ref', ref: 'ndt_processes', hidden: true },
  text('filmNo', 'Film Nr.'), { name: 'reweld', label: 'ReWeld?', type: 'checkbox', default: false, hidden: true },
  { name: 'itp', label: 'ITP', type: 'select', options: ['ITP 1', 'ITP 2'], hidden: true }, text('activityNo', 'Activity No.'),
  { name: 'engineerId', label: 'QA/QC engineer', type: 'ref', ref: 'qa_engineers', hidden: true }, text('customNo', 'Custom No.'),
  text('preReportNo', 'Pre report number'), { name: 'checked', label: 'Check', type: 'checkbox', default: false, hidden: true },
  // The NA block of the NDT dialog (one per weld): stored on the request's NA results together with NA length and defect type.
  { name: 'welderForErrorId', label: 'Welder for error', type: 'ref', ref: 'welders', hidden: true },
];
/** `welderId`: the welder chosen in the NDT Pre dialog (reference "Welder", required there). */
export const INSPECTION_REQUEST_FIELDS: Field[] = [text('processes', 'NDT processes'), { name: 'welderId', label: 'Welder', type: 'ref', ref: 'welders', hidden: true }];
/** Added choices: visual inspection may record "Not applicable" per weld. */
export const EXTRA_RESULT_OPTION = 'Not applicable';
/** Visual report saved without a result for any weld (client and server). */
export const VISUAL_NO_CHOICE = 'Choose Accepted, Not accepted or Not applicable for at least one weld.';

// ----- shared row helpers --------------------------------------------------------------------------------------

const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const textOf = (value: unknown) => String(value ?? '').trim();
const newest = (a: Row, b: Row) => textOf(b.date).localeCompare(textOf(a.date)) || textOf(b._createdAt).localeCompare(textOf(a._createdAt)) || textOf(b.id).localeCompare(textOf(a.id));
export const hasWelder = (weld: Row) => [1, 2, 3, 4].some(side => textOf(weld[`welder${side}Id`]) !== '');
/** Results with an outcome (Accepted, Rejected or Not applicable) of a weld and types, newest first. */
export const weldResults = (results: Row[] | null | undefined, weldId: string, types: string[]) => live(results).filter(row => row.weldId === weldId && types.includes(textOf(row.type)) && textOf(row.result) !== '').sort(newest);
export const weldRequests = (requests: Row[] | null | undefined, weldId: string, types: string[]) => live(requests).filter(row => row.weldId === weldId && types.includes(textOf(row.type))).sort(newest);
/** The request a weld's NDT dialog edits: its newest request of that type that is not cancelled. */
export const currentRequest = (requests: Row[] | null | undefined, weldId: string, type: string) => weldRequests(requests, weldId, [type]).find(row => row.status !== 'Cancelled');
/** The weld has NDT (Pre) or Pre-HT / PWHT in progress: one of those requests is still Open (Edit weld then asks for a reason). */
export const ndtOrPwhtInProgress = (requests: Row[] | null | undefined, weldId: string) => weldRequests(requests, weldId, [...NDT_TYPES, ...PWHT_TYPES]).some(row => row.status === 'Open');
/** Latest outcome of one stored type. */
export const latestResult = (results: Row[] | null | undefined, weldId: string, type: string) => weldResults(results, weldId, [type])[0];
/** ReWeld? is ticked on the results of the request the latest result belongs to (the dialog stores it with the NA). */
const rewelded = (results: Row[] | null | undefined, latest: Row) => live(results).some(row => row.weldId === latest.weldId && row.type === latest.type && textOf(row.requestId) === textOf(latest.requestId) && row.reweld === true);
/**
 * The weld's latest NDT or NDT Pre outcome is not accepted: its latest result is NA, or ReWeld? is ticked on that
 * request (reference weld 002: Initial NA, Remaining Accepted, ReWeld? ticked counts as rejected and expects a repair).
 */
export const notAccepted = (weld: Row, results: Row[] | null | undefined) => NDT_TYPES.some(type => { const latest = latestResult(results, weld.id, type); return Boolean(latest) && (latest!.result === 'Rejected' || rewelded(results, latest!)); });
/** The weld's latest NDT or NDT Pre outcome is Accepted and nothing makes it not accepted (`notAccepted`). */
export const ndtAccepted = (weld: Row, results: Row[] | null | undefined) => NDT_TYPES.some(type => latestResult(results, weld.id, type)?.result === 'Accepted') && !notAccepted(weld, results);

// ----- requirement and cell state ------------------------------------------------------------------------------

/**
 * Whether a weld-table column applies to a weld. NDT Pre, NDT and Pre-HT/PWHT follow the weld's requirement
 * flags. VI has no flag: the VI cell follows the VT reports (`inspectionCellState`), so VI never "applies" by itself here.
 */
export function inspectionRequired(weld: Row, kind: InspectionKind): boolean {
  if (kind === 'VI') return false;
  if (kind === 'NDT PRE') return weld.ndoReqPre === true;
  if (kind === 'NDT') return weld.ndoReq === true;
  return weld.pwhtReqPre === true || weld.pwhtReq === true;
}
/** Stored types a weld needs in a column (Pre-HT/PWHT: only the flagged ones). */
export const requiredTypes = (weld: Row, kind: InspectionKind) => kind === 'PWHT' ? [...(weld.pwhtReqPre === true ? ['PRE-HT'] : []), ...(weld.pwhtReq === true ? ['PWHT'] : [])] : inspectionRequired(weld, kind) ? KIND_TYPES[kind] : [];

export type CellStatus = 'not-required' | 'open' | 'requested' | 'accepted' | 'rejected' | 'reweld' | 'not-applicable' | 'on-report';
export interface CellState {
  /** "Yes" when required or anything was recorded; "No" otherwise. */
  required: boolean;
  status: CellStatus;
  requests: Row[];
  results: Row[];
  /** Report files: documents on the results, on results of the same report, and NDT documents on the requests. */
  reportFiles: Row[];
  /** Printable request documents attached to the requests. */
  requestFiles: Row[];
  /** NDT columns: the tracer button is shown (the weld is a tracer weld). */
  tracer: boolean;
  /** NDT (Pre) and Pre-HT/PWHT columns: the weld still needs a request, so the "Generate & Print … Request" icon is offered. */
  printable: boolean;
  /** NDT (Pre) and Pre-HT/PWHT columns: one row per request the weld is on, newest first (the archive icon and its dialog). */
  archive: WeldArchiveRow[];
  /** VI column: the VT report the weld is on (the report number and its stored document, when there is one). */
  visual?: { reportNo: string; report?: Row; file?: Row };
}
export interface CellRows { results?: Row[] | null; requests?: Row[] | null; attachments?: Row[] | null; welds?: Row[] | null; /** VT reports (`visual_reports`). */ reports?: Row[] | null; /** NDT processes, to tell which of a weld's processes are on a request. */ processes?: Row[] | null; }
/** The cell rows out of the workspace rows (keyed by resource). Passing the workspace rows directly would leave every cell without results. */
export const workspaceCellRows = (rows: Record<string, Row[] | null | undefined>): CellRows => ({ results: rows.inspection_results, requests: rows.inspection_requests, attachments: rows.attachments, welds: rows.welds, reports: rows.visual_reports, processes: rows.ndt_processes });
export const REQUEST_DOCUMENT = 'Request document';
export const NDT_DOCUMENT = 'NDT document';
/** Tooltip of the status icon of a cell, as the reference words it ("ReWeld" for a ticked ReWeld?, "NA" for a plain NA, "In progress" for an open request). */
export const CELL_STATUS_TITLES: Partial<Record<CellStatus, string>> = { accepted: 'Accepted', rejected: 'NA', reweld: 'ReWeld', requested: 'In progress', 'not-applicable': 'Not applicable' };
export const cellStatusTitle = (status: CellStatus) => CELL_STATUS_TITLES[status] ?? '';
/** Text of the VI cell: "-" off every VT report, "---" on a report without a mark, then "A" or "NA" (a weld marked not applicable keeps "---"). */
export const viCellText = (state: Pick<CellState, 'status' | 'required'>) => !state.required ? '-' : state.status === 'accepted' ? 'A' : state.status === 'rejected' ? 'NA' : '---';

/** One request a weld is on, as the per-weld archive dialogs list it (NDT archive, NDT Pre archive, PWHT archive). */
export interface WeldArchiveRow { key: string; number: string; shown: string; type: string; requestId: string; /** `20240321_R00011-NDT-Request.pdf` */ document: string; /** "21.03.2024. 15:33" */ date: string; /** The stored request PDF, when it was made. */ file?: Row; }
export const ARCHIVE_TITLES: Record<InspectionKind, string> = { VI: '', 'NDT PRE': 'NDT Pre archive', NDT: 'NDT archive', PWHT: 'PWHT archive' };
const pad = (value: number) => String(value).padStart(2, '0');
/** "dd.mm.yyyy. hh:mm" of the moment a request was made (its creation time); the request date alone when that is missing. */
export function archiveStamp(request: Row): string {
  const created = new Date(textOf(request._createdAt));
  if (!Number.isNaN(created.getTime())) return `${pad(created.getDate())}.${pad(created.getMonth() + 1)}.${created.getFullYear()}. ${pad(created.getHours())}:${pad(created.getMinutes())}`;
  const [year, month, day] = textOf(request.date).split('-');
  return year && month && day ? `${day}.${month}.${year}.` : '';
}
/** File name of a request's PDF: `<yyyymmdd>_<number>-NDT-Request.pdf`, `-NDT-RequestPre.pdf` for NDT Pre, `-PWHT-Request.pdf` for Pre-HT / PWHT. */
export const requestDocumentName = (request: Row) => `${textOf(request.date).replace(/-/g, '')}_${textOf(request.number)}-${request.type === 'NDT PRE' ? 'NDT-RequestPre' : request.type === 'NDT' ? 'NDT-Request' : 'PWHT-Request'}.pdf`;
/** The requests a weld is on in a column (cancelled and numberless ones leave out), one row per request number, newest first. */
export function weldArchive(weld: Row, kind: InspectionKind, rows: Pick<CellRows, 'requests' | 'attachments'>): WeldArchiveRow[] {
  if (kind === 'VI') return [];
  const seen = new Set<string>(), out: WeldArchiveRow[] = [];
  for (const request of weldRequests(rows.requests, weld.id, KIND_TYPES[kind])) {
    if (request.status === 'Cancelled' || !textOf(request.number)) continue;
    const key = `${request.type}|${textOf(request.number)}`; if (seen.has(key)) continue; seen.add(key);
    // The request PDF is stored on one line of the request (it covers every weld that shares the number).
    const lines = new Set(live(rows.requests).filter(item => item.type === request.type && textOf(item.number) === textOf(request.number)).map(item => item.id));
    const file = live(rows.attachments).find(item => item.entityType === 'inspection_requests' && lines.has(String(item.entityId)) && item.documentType === REQUEST_DOCUMENT);
    out.push({ key, number: textOf(request.number), shown: requestNumberShown(request.number), type: textOf(request.type), requestId: request.id, document: requestDocumentName(request), date: archiveStamp(request), file });
  }
  return out;
}
/** The weld still needs a request: an NDT process on no request (NDT, NDT Pre), or a required Pre-HT / PWHT with no request yet. */
export function requestPrintable(weld: Row, kind: InspectionKind, rows: Pick<CellRows, 'requests' | 'results' | 'processes'>): boolean {
  if (kind === 'VI') return false;
  if (kind === 'PWHT') return requiredTypes(weld, kind).some(type => weldRequests(rows.requests, weld.id, [type]).every(row => row.status === 'Cancelled'));
  return inspectionRequired(weld, kind) && openProcessIds(weld, kind, rows.requests, rows.results, rows.processes).length > 0;
}

/** The sections of a weld's "PWHT request" dialog: Pre-HT when Pre-HT is required, PWHT when PWHT is required (labels as the reference words them). */
export interface HeatSection { type: 'PRE-HT' | 'PWHT'; label: string; /** Weld fields that hold the location and process. */ locationField: string; processField: string; /** "PWHT 100%" exists for PWHT only. */ hundred: boolean; }
export function heatSections(weld: Row): HeatSection[] {
  return [...(weld.pwhtReqPre === true ? [{ type: 'PRE-HT' as const, label: 'Pre-HT', locationField: 'pwhtPreLocationId', processField: 'pwhtPreProcessId', hundred: false }] : []), ...(weld.pwhtReq === true ? [{ type: 'PWHT' as const, label: 'PWHT', locationField: 'pwhtLocationId', processField: 'pwhtProcessId', hundred: true }] : [])];
}

export function inspectionCellState(weld: Row, kind: InspectionKind, rows: CellRows): CellState {
  const types = KIND_TYPES[kind];
  const results = weldResults(rows.results, weld.id, types), requests = weldRequests(rows.requests, weld.id, types);
  const attachments = live(rows.attachments);
  const report = kind === 'VI' ? live(rows.reports).filter(item => vtWeldIds(item).includes(weld.id)).sort((a, b) => vtSeq(b) - vtSeq(a))[0] : undefined;
  // VI has no requirement flag: the cell follows the VT reports. A weld on no report reads "-"; on one it reads "---" until it is marked.
  const required = kind === 'VI' ? Boolean(report) || results.length > 0 : inspectionRequired(weld, kind) || results.length > 0 || requests.length > 0;
  const reports = new Set(results.map(row => `${row.type}|${textOf(row.reportNo)}`).filter(key => !key.endsWith('|')));
  const sameReport = new Set(live(rows.results).filter(row => reports.has(`${row.type}|${textOf(row.reportNo)}`)).map(row => row.id));
  const requestIds = new Set(requests.map(row => row.id));
  const reportFiles = attachments.filter(file => file.entityType === 'inspection_results' && sameReport.has(String(file.entityId)) || file.entityType === 'inspection_requests' && requestIds.has(String(file.entityId)) && file.documentType !== REQUEST_DOCUMENT);
  const requestFiles = attachments.filter(file => file.entityType === 'inspection_requests' && requestIds.has(String(file.entityId)) && file.documentType === REQUEST_DOCUMENT);
  // The T button belongs to tracer welds only (flagged or linked to a rejected weld), in the NDT column they are examined in.
  const tracer = (kind === 'NDT' || kind === 'NDT PRE') && isTracer(weld) && required;
  let status: CellStatus = 'not-required';
  let visual: CellState['visual'];
  if (kind === 'VI') {
    if (required) {
      const latest = latestResult(rows.results, weld.id, 'VI');
      const reportNo = textOf(report?.number) || textOf(latest?.reportNo);
      const file = (report ? attachments.find(item => item.entityType === 'visual_reports' && item.entityId === report.id) : undefined) ?? attachments.find(item => item.entityType === 'inspection_results' && latest && item.entityId === latest.id);
      visual = { reportNo, report, file };
      status = latest?.result === 'Accepted' ? 'accepted' : latest?.result === 'Rejected' ? 'rejected' : latest?.result === EXTRA_RESULT_OPTION ? 'not-applicable' : 'on-report';
    }
  } else if (required) {
    const typesNeeded = kind === 'PWHT' ? (requiredTypes(weld, kind).length ? requiredTypes(weld, kind) : types) : types;
    const latest = typesNeeded.map(type => latestResult(rows.results, weld.id, type));
    // A ticked ReWeld? on the latest NDT result counts as not accepted whatever the result says (reference weld 002).
    if (kind !== 'PWHT' && latest.some(row => row && rewelded(rows.results, row))) status = 'reweld';
    else if (latest.some(row => row?.result === 'Rejected')) status = 'rejected';
    else if (latest.every(row => row?.result === 'Accepted' || row?.result === EXTRA_RESULT_OPTION)) status = latest.every(row => row?.result === EXTRA_RESULT_OPTION) ? 'not-applicable' : 'accepted';
    else if (requests.some(row => row.status === 'Open')) status = 'requested';
    else status = 'open';
  }
  return { required, status, requests, results, reportFiles, requestFiles, tracer, printable: requestPrintable(weld, kind, { requests: rows.requests, results: rows.results, processes: rows.processes }), archive: weldArchive(weld, kind, rows), visual };
}

// ----- repairs -------------------------------------------------------------------------------------------------

/** `010R2` → { base: '010', n: 2 }; the reference also writes `001_2 R1` (with a space). */
export function repairNumberParts(weldNo: unknown): { base: string; n: number } | null {
  const match = /^(.+?)\s*R(\d+)$/i.exec(textOf(weldNo));
  return match && Number(match[2]) > 0 ? { base: match[1].trim(), n: Number(match[2]) } : null;
}
const sameNumber = (a: unknown, b: unknown) => textOf(a).replace(/\s+/g, '').toLowerCase() === textOf(b).replace(/\s+/g, '').toLowerCase();
/**
 * The weld a repair weld repairs: `repairOfId` (repair welds made by the repair action), otherwise by number on the
 * same isometric — a weld added by hand as `<no>R1` repairs `<no>`, `<no>R2` repairs `<no>R1` (or `<no>` when there is
 * no R1). The reference never creates the repair weld itself (weld-inspections-009).
 */
export function repairParent(weld: Row, welds: Row[]): Row | undefined {
  const rows = live(welds);
  if (textOf(weld.repairOfId)) return rows.find(row => row.id === weld.repairOfId);
  const parts = repairNumberParts(weld.weldNo); if (!parts) return undefined;
  const onIso = rows.filter(row => row.id !== weld.id && row.isoId === weld.isoId);
  for (let n = parts.n - 1; n >= 1; n--) { const previous = onIso.find(row => sameNumber(row.weldNo, `${parts.base}R${n}`)); if (previous) return previous; }
  return onIso.find(row => sameNumber(row.weldNo, parts.base));
}
/** Repair welds made for a weld (`repairOfId` or numbered `<no>R<n>`), oldest first. */
export const repairsOf = (weld: Row, welds: Row[]) => live(welds).filter(row => row.id !== weld.id && repairParent(row, welds)?.id === weld.id).sort((a, b) => textOf(a._createdAt).localeCompare(textOf(b._createdAt)) || textOf(a.weldNo).localeCompare(textOf(b.weldNo)));
/** The original weld of a repair chain (`010R2` → `010`). */
export function repairRoot(weld: Row, welds: Row[]): Row {
  let current = weld; const seen = new Set<string>([weld.id]);
  for (;;) {
    const parent = repairParent(current, welds);
    if (!parent || seen.has(parent.id)) return current;
    seen.add(parent.id); current = parent;
  }
}
/** Every repair weld after `weld`, following the newest repair of each step (`010` → `010R1`, `010R2`). */
export function repairChain(weld: Row, welds: Row[]): Row[] {
  const chain: Row[] = []; const seen = new Set<string>([weld.id]); let current = weld;
  for (;;) {
    const next = repairsOf(current, welds).at(-1);
    if (!next || seen.has(next.id)) return chain;
    chain.push(next); seen.add(next.id); current = next;
  }
}
/**
 * Weld number of the next repair: the original number with the suffix R1, R2, … counted along the chain
 * (`010` → `010R1`, a not-accepted `010R1` → `010R2`). A number already used on the isometric is skipped.
 */
export function nextRepairNumber(weld: Row, welds: Row[]): string {
  const root = repairRoot(weld, welds);
  let depth = 0; for (let current = weld; current.id !== root.id; current = repairParent(current, welds)!) depth++;
  const used = new Set(live(welds).filter(row => row.isoId === weld.isoId).map(row => textOf(row.weldNo).toLowerCase()));
  let n = depth + 1; while (used.has(`${textOf(root.weldNo)}R${n}`.toLowerCase())) n++;
  return `${textOf(root.weldNo)}R${n}`;
}
/**
 * A repair weld is due: the latest NDT / NDT Pre result is not accepted (NA, or ReWeld? ticked) and no repair weld
 * exists for it yet. Nothing creates it automatically: the user adds `<no>R1` (see `nextRepairNumber`).
 */
export const repairDue = (weld: Row, welds: Row[], results: Row[] | null | undefined) => notAccepted(weld, results) && repairsOf(weld, welds).length === 0;
/** Fields a repair weld made by the explicit repair action takes over from its original: the weld definition, not its execution. */
export const REPAIR_COPY_FIELDS = ['typeId', 'spoolId', 'wpsId', 'lengthMode', 'diameterId', 'dialen', 'ndtpercent', 'ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'jointType', 'material1Id', 'material2Id', 'certificate1Id', 'certificate2Id', 'chargeNo1', 'chargeNo2', ...INSPECTION_MASS_EDIT_FIELDS];
export interface RepairState { open: boolean; original: Row; repair?: Row; }
/**
 * The repair of a not-accepted weld stays open until a repair weld in its chain has an accepted NDT result.
 * Returns null when the weld's latest NDT result is not "not accepted", or when the weld is itself an open repair
 * of a not-accepted parent (the parent's entry names it).
 */
export function repairState(weld: Row, welds: Row[], results: Row[] | null | undefined): RepairState | null {
  if (!notAccepted(weld, results)) return null;
  const parent = repairParent(weld, welds);
  if (parent && notAccepted(parent, results)) return null;
  const chain = repairChain(weld, welds);
  return { open: !chain.some(row => ndtAccepted(row, results)), original: weld, repair: chain.at(-1) };
}

// ----- tracers -------------------------------------------------------------------------------------------------

export const TRACERS_REQUIRED = 2;
/** A tracer weld: flagged by the tracer workflow or linked to a not-accepted weld. */
export const isTracer = (weld: Row) => weld.tracer === true || textOf(weld.tracerOfId) !== '';
/** Inspection-compliance counts leave tracer welds out (dashboard). */
export const countsForCompliance = (weld: Row) => !isTracer(weld);
export const tracersOf = (weld: Row, welds: Row[]) => live(welds).filter(row => row.tracerOfId === weld.id).sort((a, b) => textOf(a.weldNo).localeCompare(textOf(b.weldNo), 'en', { numeric: true }));
export interface TracerSummary { source?: Row; tracers: Row[]; required: number; needed: boolean; text: string; }
/** For a tracer: its source weld. For a not-accepted weld: its linked tracers and how many are still needed. */
export function tracerSummary(weld: Row, welds: Row[], results: Row[] | null | undefined): TracerSummary {
  const source = textOf(weld.tracerOfId) ? live(welds).find(row => row.id === weld.tracerOfId) : notAccepted(weld, results) ? weld : undefined;
  const tracers = source ? tracersOf(source, welds) : [];
  return { source, tracers, required: TRACERS_REQUIRED, needed: Boolean(source) && tracers.length < TRACERS_REQUIRED, text: `${tracers.length} linked of ${TRACERS_REQUIRED} required` };
}
/** Rows the tracer group rule needs besides the welds and results. */
export interface TracerContext { requests?: Row[] | null; isometrics?: Row[] | null; itps?: Row[] | null; weldTypes?: Row[] | null; }
/**
 * The weld's ITP / KNR. With `weldTypes` (the server passes them): the register entry the dashboard counts the weld under
 * (`weldItpId`: a Field weld takes ITP No 2), '' when none is linked — the reference proposes tracers per dashboard group
 * (itpCode "Unassigned"). Without them (older callers): the slot-1 entry, else its free-text ITP number.
 */
export function weldItpCode(weld: Row, context: TracerContext): string {
  const iso = live(context.isometrics).find(row => row.id === weld.isoId);
  if (!iso) return '';
  if (context.weldTypes) {
    const id = weldItpId(iso, live(context.weldTypes).find(row => row.id === weld.typeId)?.location, live(context.itps));
    return id ? textOf(live(context.itps).find(row => row.id === id)?.number) || id : '';
  }
  const linked = textOf(iso.itpId) ? live(context.itps).find(row => row.id === iso.itpId) : undefined;
  return textOf(linked?.number) || textOf(iso.itpNo);
}
const welderIdsOf = (weld: Row) => [1, 2, 3, 4].map(side => textOf(weld[`welder${side}Id`])).filter(Boolean);
/** The weld's own welders, the choices of "Welder for error". */
export const weldWelderIds = welderIdsOf;
/** "Welder for error" stored with the weld's latest NA result, if any. */
export const welderForErrorOf = (weld: Row, results: Row[] | null | undefined) => textOf(live(results).filter(row => row.weldId === weld.id && NDT_TYPES.includes(textOf(row.type)) && textOf(row.welderForErrorId)).sort(newest)[0]?.welderForErrorId);
/** A rejected weld's tracer group: welder ("Welder for error" when chosen, else the weld's first welder), WPS and ITP / KNR. */
export interface TracerGroup { welderId: string; wpsId: string; itpCode: string; }
export function tracerGroup(weld: Row, results: Row[] | null | undefined, context: TracerContext, welderId?: string): TracerGroup {
  return { welderId: textOf(welderId) || welderForErrorOf(weld, results) || welderIdsOf(weld)[0] || '', wpsId: textOf(weld.wpsId), itpCode: weldItpCode(weld, context) };
}
/** A weld belongs to a group when the group's welder welded it and its WPS and ITP / KNR are the group's. */
export const inTracerGroup = (weld: Row, group: TracerGroup, context: TracerContext) => Boolean(group.welderId) && welderIdsOf(weld).includes(group.welderId) && textOf(weld.wpsId) === group.wpsId && weldItpCode(weld, context) === group.itpCode;
/** A weld has an NDT or NDT Pre request (not cancelled) or result: as a tracer it is locked, as a candidate it is not offered. */
export const hasNdtActivity = (weld: Row, context: TracerContext, results: Row[] | null | undefined) => live(context.requests).some(row => row.weldId === weld.id && NDT_TYPES.includes(textOf(row.type)) && row.status !== 'Cancelled') || live(results).some(row => row.weldId === weld.id && NDT_TYPES.includes(textOf(row.type)) && textOf(row.result) !== '');
export const TRACER_LOCKED_HINT = 'Current tracer is locked because a request or result already exists.';
export const TRACER_REMOVABLE_HINT = 'Current tracer. You can deselect it because no request/result exists yet.';
export const TRACER_MAX_TEXT = `You can select at most ${TRACERS_REQUIRED} tracers per rejected weld.`;
export const TRACER_PANEL_NOTE = `Assign up to ${TRACERS_REQUIRED} tracer welds per rejected weld in this welder / WPS / ITP-KNR group.`;
export const TRACER_SELECT_TEXT = `Select up to ${TRACERS_REQUIRED} tracers for this rejected weld.`;
export const TRACER_NO_CANDIDATES = 'No candidate welds are currently available for this group.';

/**
 * Why a set of tracer welds cannot be linked to `weld`, or '' when it can. An empty set unlinks all tracers.
 * With `context` (the server and the NDT dialog always pass it) the reference rules apply as well: a current tracer
 * with a request or result cannot be removed, and a newly linked tracer must belong to the weld's welder / WPS /
 * ITP-KNR group and have no NDT request or result yet. `pending`: the weld's NA is saved in the same transaction.
 */
export function tracerError(weld: Row, tracerIds: string[], welds: Row[], results: Row[] | null | undefined, context?: TracerContext & { welderId?: string; pending?: boolean }): string {
  const current = tracersOf(weld, welds);
  if (context) {
    const locked = current.find(tracer => !tracerIds.includes(tracer.id) && hasNdtActivity(tracer, context, results));
    if (locked) return `Weld ${locked.weldNo} cannot be removed as a tracer because a request or result already exists.`;
  }
  if (!tracerIds.length) return '';
  if (new Set(tracerIds).size !== tracerIds.length) return 'Choose each tracer weld once.';
  if (tracerIds.length > TRACERS_REQUIRED) return TRACER_MAX_TEXT;
  if (!context?.pending && !notAccepted(weld, results)) return 'Tracer welds are linked to a weld whose latest NDT result is not accepted.';
  if (isTracer(weld)) return 'A tracer weld cannot have tracers of its own.';
  const chain = new Set([repairRoot(weld, welds).id, ...repairChain(repairRoot(weld, welds), welds).map(row => row.id)]);
  const group = context ? tracerGroup(weld, results, context, context.welderId) : undefined;
  for (const id of tracerIds) {
    const tracer = live(welds).find(row => row.id === id);
    if (!tracer) return 'A selected tracer weld is unavailable.';
    if (chain.has(tracer.id)) return `Weld ${tracer.weldNo} is the weld itself or one of its repairs.`;
    if (textOf(tracer.tracerOfId) && tracer.tracerOfId !== weld.id) return `Weld ${tracer.weldNo} is already a tracer for another weld.`;
    if (tracersOf(tracer, welds).length) return `Weld ${tracer.weldNo} has tracers of its own.`;
    if (context && group && !current.some(row => row.id === id)) {
      if (!inTracerGroup(tracer, group, context)) return `Weld ${tracer.weldNo} is not in this welder / WPS / ITP-KNR group.`;
      if (hasNdtActivity(tracer, context, results)) return `Weld ${tracer.weldNo} already has an NDT request or result.`;
    }
  }
  return '';
}

export interface TracerProposalWeld { id: string; weldNo: string; isoId: string; typeId: string; date: string; statusLabel: string; locked?: boolean; }
export interface TracerProposalSource { source: TracerProposalWeld; pending: boolean; linked: number; expected: number; currentTracers: TracerProposalWeld[]; candidates: TracerProposalWeld[]; }
export interface TracerProposal { group: TracerGroup; status: { rejectedWelds: number; expectedTracers: number; existingTracers: number; missingTracers: number }; sources: TracerProposalSource[]; }
const proposalWeld = (weld: Row, extra: Partial<TracerProposalWeld> = {}): TracerProposalWeld => ({ id: weld.id, weldNo: textOf(weld.weldNo), isoId: textOf(weld.isoId), typeId: textOf(weld.typeId), date: textOf(weld.date), statusLabel: 'Open', ...extra });
const dayNumber = (value: unknown) => { const time = Date.parse(textOf(value)); return Number.isFinite(time) ? time / 86400000 : Number.POSITIVE_INFINITY; };
/**
 * Server proposal of tracer welds for a rejected weld's group (reference ajax-weld-dashboard-tracers.php action=list):
 * every not-accepted weld of the group is a source (the asked weld also while its NA is only entered, `pending`);
 * per source its current tracers (locked once a request or result exists) and the candidates — welds of the group
 * that are no source, not in the source's repair chain, not a tracer of another weld and have no NDT request or
 * result yet — nearest weld date first (our default until the client answers which pool and order the reference uses).
 */
export function tracerProposal(weld: Row, welds: Row[], results: Row[] | null | undefined, context: TracerContext, options: { welderId?: string; pending?: boolean } = {}): TracerProposal {
  const group = tracerGroup(weld, results, context, options.welderId);
  const rows = live(welds);
  const pending = Boolean(options.pending) && !notAccepted(weld, results);
  const sourceRows = rows.filter(row => !isTracer(row) && (row.id === weld.id ? (pending || notAccepted(row, results)) : notAccepted(row, results) && inTracerGroup(row, group, context) && tracerGroup(row, results, context).welderId === group.welderId))
    .sort((a, b) => Number(b.id === weld.id) - Number(a.id === weld.id) || textOf(a.weldNo).localeCompare(textOf(b.weldNo), 'en', { numeric: true }));
  const sourceIds = new Set(sourceRows.map(row => row.id));
  const sources = sourceRows.map(source => {
    const chain = new Set([repairRoot(source, rows).id, ...repairChain(repairRoot(source, rows), rows).map(row => row.id)]);
    const currentTracers = tracersOf(source, rows).map(tracer => proposalWeld(tracer, { locked: hasNdtActivity(tracer, context, results), statusLabel: hasNdtActivity(tracer, context, results) ? 'Requested' : 'Open' }));
    const candidates = rows.filter(row => !sourceIds.has(row.id) && !chain.has(row.id) && !textOf(row.tracerOfId) && !tracersOf(row, rows).length && inTracerGroup(row, group, context) && !hasNdtActivity(row, context, results))
      .sort((a, b) => Math.abs(dayNumber(a.date) - dayNumber(source.date)) - Math.abs(dayNumber(b.date) - dayNumber(source.date)) || textOf(a.weldNo).localeCompare(textOf(b.weldNo), 'en', { numeric: true }))
      .map(row => proposalWeld(row));
    return { source: proposalWeld(source), pending: source.id === weld.id && pending, linked: currentTracers.length, expected: TRACERS_REQUIRED, currentTracers, candidates };
  });
  const existing = sources.reduce((sum, entry) => sum + entry.linked, 0);
  return { group, status: { rejectedWelds: sources.length, expectedTracers: sources.length * TRACERS_REQUIRED, existingTracers: existing, missingTracers: sources.reduce((sum, entry) => sum + Math.max(0, entry.expected - entry.linked), 0) }, sources };
}

/** Lines of the read-only "Tracer details" dialog (reference getWeldTracerDetail.php). */
export interface TracerDetailWeld { weld: Row; clicked: boolean; results: { id: string; processId: string; label: string }[]; }
export interface TracerDetail { source?: TracerDetailWeld; tracers: TracerDetailWeld[]; linked: number; expected: number; }
export const TRACER_DETAIL_TEXTS = { title: 'Tracer details', original: 'Original rejected weld', linked: 'Linked tracer welds', noSource: 'No source weld link found for this tracer.', noTracers: 'No tracer welds linked to this source.', noNdt: 'No NDT results recorded.', clicked: 'Selected tracer', tracer: 'Tracer', ndtResults: 'NDT results' };
export function tracerDetail(weld: Row, welds: Row[], results: Row[] | null | undefined): TracerDetail {
  const summary = tracerSummary(weld, welds, results);
  const lines = (row: Row, clicked: boolean): TracerDetailWeld => ({ weld: row, clicked, results: live(results).filter(item => item.weldId === row.id && item.type === 'NDT' && ['Accepted', 'Rejected'].includes(textOf(item.result))).sort((a, b) => (NDT_ROUNDS.find(r => r.key === a.round)?.index ?? 9) - (NDT_ROUNDS.find(r => r.key === b.round)?.index ?? 9)).map(item => ({ id: item.id, processId: textOf(item.processId), label: resultLabel(item.result) })) });
  // A tracer without a source link (flagged by hand) is shown alone, as the reference does.
  const tracers = summary.source ? summary.tracers : isTracer(weld) ? [weld] : [];
  return { source: summary.source ? lines(summary.source, summary.source.id === weld.id) : undefined, tracers: tracers.map(row => lines(row, row.id === weld.id)), linked: tracers.length, expected: TRACERS_REQUIRED };
}

// ----- NDT/PWHT Manager ----------------------------------------------------------------------------------------

export type ManagerTabKey = 'ndt-pre' | 'ndt' | 'ndt-pre-archive' | 'ndt-archive' | 'ndt-requests' | 'pwht' | 'pwht-archive' | 'pwht-requests';
export interface ManagerTab { key: ManagerTabKey; label: string; /** Lists requests (one row per request) instead of welds. */ requests?: boolean; /** Lists examined process results (one row per result). */ archive?: boolean; types: string[]; kind: InspectionKind; }
export const MANAGER_TABS: ManagerTab[] = [
  { key: 'ndt-pre', label: 'NDT Pre', types: ['NDT PRE'], kind: 'NDT PRE' },
  { key: 'ndt', label: 'NDT', types: ['NDT'], kind: 'NDT' },
  { key: 'ndt-pre-archive', label: 'NDT archive PRE', archive: true, types: ['NDT PRE'], kind: 'NDT PRE' },
  { key: 'ndt-archive', label: 'NDT archive', archive: true, types: ['NDT'], kind: 'NDT' },
  { key: 'ndt-requests', label: 'NDT request archive', requests: true, types: NDT_TYPES, kind: 'NDT' },
  { key: 'pwht', label: 'PWHT request manager', types: PWHT_TYPES, kind: 'PWHT' },
  { key: 'pwht-archive', label: 'PWHT archive', archive: true, types: PWHT_TYPES, kind: 'PWHT' },
  { key: 'pwht-requests', label: 'PWHT request archive', requests: true, types: PWHT_TYPES, kind: 'PWHT' },
];
/** Rows per page: the request managers (10 / 25 / 50 / 100, default 10) and the archives (10 / 20 / 50 / 100 / 500, default 20). */
export const MANAGER_PAGE_SIZES = [10, 25, 50, 100];
export const ARCHIVE_PAGE_SIZES = [10, 20, 50, 100, 500];
/** Area that shows a request archive tab (NDT request archive 66, PWHT request archive 67). */
export const requestArchiveArea = (tab: Pick<ManagerTab, 'kind'>) => tab.kind === 'PWHT' ? '67' : '66';

// ----- request numbers ------------------------------------------------------------------------------------------

/** Request numbers are generated, never typed: R + five digits ("R00029"), counted on from the highest one that exists. */
export const REQUEST_PREFIX = 'R';
const REQUEST_NUMBER = /^R(\d{5,})$/;
/** The next request number after the highest R-number in `requests` (archived rows included, so a number is never reused). Older numbers such as R-2026-0001 do not take part. */
export function nextRequestNumber(requests: Row[] | null | undefined): string {
  let highest = 0;
  for (const row of requests || []) { const match = REQUEST_NUMBER.exec(textOf(row.number)); if (match) highest = Math.max(highest, Number(match[1])); }
  return `${REQUEST_PREFIX}${String(highest + 1).padStart(5, '0')}`;
}
/** A request number as the request archives show it: "R00029" reads "00029"; an older number is shown as stored. */
export const requestNumberShown = (number: unknown) => REQUEST_NUMBER.test(textOf(number)) ? textOf(number).slice(1) : textOf(number);

// ----- processes of a request ---------------------------------------------------------------------------------

/** NDT process ids set on a weld (the five rounds), in round order. */
export const weldProcessIds = (weld: Row, pre: boolean) => [...new Set(NDT_ROUNDS.map(round => textOf(weld[processField(pre, round.index)])).filter(Boolean))];
const liveRequestsOf = (requests: Row[] | null | undefined, weldId: string, type: string) => weldRequests(requests, weldId, [type]).filter(row => row.status !== 'Cancelled');
/** NDT processes a request line (one weld on a request) covers: named in its process list, its first process, and the processes of its results. */
export function requestProcessIds(request: Row, results: Row[] | null | undefined, processes: Row[] | null | undefined): string[] {
  const byName = new Map<string, string>();
  for (const process of live(processes)) if (!byName.has(textOf(process.name))) byName.set(textOf(process.name), process.id);
  const ids = new Set<string>();
  for (const name of textOf(request.processes).split(',').map(textOf).filter(Boolean)) { const id = byName.get(name); if (id) ids.add(id); }
  if (textOf(request.processId)) ids.add(textOf(request.processId));
  for (const row of live(results)) if (row.requestId === request.id && textOf(row.processId)) ids.add(textOf(row.processId));
  return [...ids];
}
/** The weld's NDT processes (of NDT or NDT Pre) that are on no request yet: the ones a new request can take. */
export function openProcessIds(weld: Row, type: string, requests: Row[] | null | undefined, results: Row[] | null | undefined, processes: Row[] | null | undefined): string[] {
  const taken = new Set(liveRequestsOf(requests, weld.id, type).flatMap(request => requestProcessIds(request, results, processes)));
  return weldProcessIds(weld, type === 'NDT PRE').filter(id => !taken.has(id));
}
/** Whether a weld's row in the NDT / NDT Pre manager has a selection box: it has an NDT process that is on no request yet. The PWHT manager selects every row. */
export const requestSelectable = (weld: Row, kind: InspectionKind, requests: Row[] | null | undefined, results: Row[] | null | undefined, processes: Row[] | null | undefined) => kind === 'PWHT' || openProcessIds(weld, kind, requests, results, processes).length > 0;

export const MASS_REQUEST_TEXTS = {
  alert: 'When you generate NDT Request you can not change request data. Please check that you entered correct data!',
  selectWelds: 'Select one or more welds in the table first.',
  noProcess: 'None of the selected welds has an open NDT process.',
  selectProcess: 'Select at least one NDT process before generating the request.',
  allDone: 'All NDT requests have already been created for the selected welds.',
  noPwht: 'None of the selected welds needs a new Pre-HT/PWHT request.',
  includeIsometrics: 'Include isometric drawing in PDF (request + iso)',
};
const REQUEST_FLAG: Record<string, string> = { 'NDT PRE': 'ndoReqPre', NDT: 'ndoReq', 'PRE-HT': 'pwhtReqPre', PWHT: 'pwhtReq' };
/** The weld field that says a weld requires an inspection type. */
export const requestFlag = (type: string) => REQUEST_FLAG[type];
export interface MassRequestPlan {
  /** Why no request can be generated for these welds ('' when one can). */
  error: string;
  /** The process checklist: open processes of the selected welds (NDT), in the order they are met. */
  processIds: string[];
  /** Per weld the processes it still has open (NDT); the welds that may be requested (PWHT). */
  open: { weldId: string; processIds: string[] }[];
}
/**
 * What "Generate Mass … request" offers for the ticked welds (reference pdfNdtRequestLanguageISO): NDT and NDT Pre list
 * the open (unrequested) processes of the welds; Pre-HT / PWHT need a weld that requires it and has no open request of it.
 */
export function massRequestPlan(type: string, welds: Row[], requests: Row[] | null | undefined, results: Row[] | null | undefined, processes: Row[] | null | undefined): MassRequestPlan {
  if (!welds.length) return { error: MASS_REQUEST_TEXTS.selectWelds, processIds: [], open: [] };
  const flagged = welds.filter(weld => weld[REQUEST_FLAG[type]] === true);
  if (!NDT_TYPES.includes(type)) {
    const open = flagged.filter(weld => !liveRequestsOf(requests, weld.id, type).some(row => row.status === 'Open')).map(weld => ({ weldId: weld.id, processIds: [] as string[] }));
    return { error: open.length ? '' : MASS_REQUEST_TEXTS.noPwht, processIds: [], open };
  }
  if (!flagged.some(weld => weldProcessIds(weld, type === 'NDT PRE').length)) return { error: MASS_REQUEST_TEXTS.noProcess, processIds: [], open: [] };
  const open = flagged.map(weld => ({ weldId: weld.id, processIds: openProcessIds(weld, type, requests, results, processes) })).filter(line => line.processIds.length);
  if (!open.length) return { error: MASS_REQUEST_TEXTS.allDone, processIds: [], open: [] };
  return { error: '', processIds: [...new Set(open.flatMap(line => line.processIds))], open };
}
/** The welds ticked in a dialog that are still offered after the dialog's select changed (Treatment / Examination): they stay ticked. */
export const keepEligible = (selected: string[], pool: string[]) => selected.filter(id => pool.includes(id));

/** Welds of a Manager weld tab: NDT Pre / NDT welds with their requirement flag and no result yet; the PWHT manager lists every weld with Pre-HT or PWHT required (accepted ones too). Archive tabs: one row per examined process result (see `managerResults`). */
export function managerWelds(tab: ManagerTab, welds: Row[], results: Row[] | null | undefined, options: ArchiveOptions = {}): Row[] {
  if (tab.requests) return [];
  if (tab.archive) return managerResults(tab, options.view ?? 'finished', welds, results, options.requests, options.processes, options);
  if (tab.kind === 'PWHT') return live(welds).filter(weld => requiredTypes(weld, 'PWHT').length > 0);
  return live(welds).filter(weld => requiredTypes(weld, tab.kind).some(type => tab.types.includes(type) && !latestResult(results, weld.id, type)));
}

// ----- archive tabs: one row per examined process result ------------------------------------------------------------

export type ArchiveView = 'finished' | 'open-results' | 'open-welds';
export const ARCHIVE_VIEWS: ArchiveView[] = ['finished', 'open-results', 'open-welds'];
const ARCHIVE_VIEW_LABELS: Record<'NDT PRE' | 'NDT' | 'PWHT', Record<ArchiveView, string>> = {
  'NDT PRE': { finished: 'Finished NDT Pre', 'open-results': 'Open NDT results Pre', 'open-welds': 'Open NDT welds Pre' },
  NDT: { finished: 'Finished NDT', 'open-results': 'Open NDT results', 'open-welds': 'Open NDT welds' },
  PWHT: { finished: 'Finished PWHT', 'open-results': 'Open PWHT results', 'open-welds': 'Open PWHT welds' },
};
export const archiveViewLabel = (tab: Pick<ManagerTab, 'kind'>, view: ArchiveView) => ARCHIVE_VIEW_LABELS[tab.kind as 'NDT'][view];
export interface ArchiveFilter { project?: string; processId?: string; /** Stored result: Accepted or Rejected (shown NA). */ result?: string; }
export interface ArchiveOptions { view?: ArchiveView; requests?: Row[] | null; processes?: Row[] | null; filter?: ArchiveFilter; projectOf?: (weld: Row) => string; }
/** One examined process of a weld: a row of the archive tabs. */
export interface ArchiveRow extends Row { weldId: string; /** Round of the process (1–5; PWHT: 1). */ roundIndex: number; processId: string; resultValue: string; resultDate: string; reportNo: string; requestNo: string; requestId: string; resultId: string; }
const archiveRow = (weld: Row, key: string, extra: Partial<ArchiveRow>): ArchiveRow => ({ ...weld, id: key, weldId: weld.id, roundIndex: 1, processId: '', resultValue: '', resultDate: '', reportNo: '', requestNo: '', requestId: '', resultId: '', ...extra });
const roundOfProcess = (weld: Row, pre: boolean, processId: string) => NDT_ROUNDS.find(round => textOf(weld[processField(pre, round.index)]) === processId)?.index ?? 1;
const pwhtProcessOf = (weld: Row, type: unknown) => textOf(weld[type === 'PRE-HT' ? 'pwhtPreProcessId' : 'pwhtProcessId']);
/**
 * Rows of an archive tab (reference ajax-table-open-welds-ndt.php): "finished" lists each process result recorded, "open
 * results" each process of a request that has no result yet, "open welds" each required process that is on no request.
 */
export function managerResults(tab: ManagerTab, view: ArchiveView, welds: Row[], results: Row[] | null | undefined, requests: Row[] | null | undefined, processes: Row[] | null | undefined, options: ArchiveOptions = {}): ArchiveRow[] {
  const pwht = tab.kind === 'PWHT', pre = tab.kind === 'NDT PRE';
  const weldRows = live(welds), byId = new Map(weldRows.map(weld => [weld.id, weld]));
  const rows: ArchiveRow[] = [];
  if (view === 'finished') {
    for (const row of live(results).filter(item => tab.types.includes(textOf(item.type)) && textOf(item.result) !== '' && byId.has(textOf(item.weldId))).sort(newest)) {
      const weld = byId.get(textOf(row.weldId))!, request = live(requests).find(item => item.id === row.requestId);
      rows.push(archiveRow(weld, row.id, { roundIndex: NDT_ROUNDS.find(round => round.key === row.round)?.index ?? 1, processId: pwht ? pwhtProcessOf(weld, row.type) : textOf(row.processId), resultValue: textOf(row.result), resultDate: textOf(row.date), reportNo: textOf(row.reportNo), requestNo: textOf(request?.number), requestId: textOf(row.requestId), resultId: row.id }));
    }
  } else if (view === 'open-results') {
    for (const request of live(requests).filter(item => tab.types.includes(textOf(item.type)) && item.status !== 'Cancelled' && byId.has(textOf(item.weldId))).sort(newest)) {
      const weld = byId.get(textOf(request.weldId))!;
      const recorded = live(results).filter(row => row.requestId === request.id && textOf(row.result) !== '');
      if (pwht) { if (!recorded.length) rows.push(archiveRow(weld, request.id, { processId: pwhtProcessOf(weld, request.type), resultDate: textOf(request.date), requestNo: textOf(request.number), requestId: request.id })); continue; }
      const ids = requestProcessIds(request, results, processes);
      for (const processId of ids.length ? ids : ['']) {
        if (recorded.some(row => textOf(row.processId) === processId)) continue;
        rows.push(archiveRow(weld, `${request.id}:${processId}`, { roundIndex: roundOfProcess(weld, pre, processId), processId, resultDate: textOf(request.date), requestNo: textOf(request.number), requestId: request.id }));
      }
    }
  } else {
    for (const weld of weldRows) {
      for (const type of requiredTypes(weld, tab.kind).filter(item => tab.types.includes(item))) {
        if (pwht) { if (!liveRequestsOf(requests, weld.id, type).length && !latestResult(results, weld.id, type)) rows.push(archiveRow(weld, `${weld.id}:${type}`, { processId: pwhtProcessOf(weld, type), resultDate: textOf(weld.date) })); continue; }
        const open = openProcessIds(weld, type, requests, results, processes);
        if (open.length) for (const processId of open) rows.push(archiveRow(weld, `${weld.id}:${type}:${processId}`, { roundIndex: roundOfProcess(weld, pre, processId), processId, resultDate: textOf(weld.date) }));
        else if (!weldProcessIds(weld, pre).length && !liveRequestsOf(requests, weld.id, type).length && !latestResult(results, weld.id, type)) rows.push(archiveRow(weld, `${weld.id}:${type}`, { resultDate: textOf(weld.date) }));
      }
    }
  }
  const filter = options.filter || {};
  return rows.filter(row => (!filter.project || options.projectOf?.(row) === filter.project) && (!filter.processId || row.processId === filter.processId) && (!filter.result || row.resultValue === filter.result));
}

// ----- request archives: one row per request ------------------------------------------------------------------------

export interface RequestFilter { project?: string; /** NDT request archive: show NDT Pre requests instead of NDT. */ pre?: boolean; from?: string; to?: string; }
/** The first and last day of the month of `day` (YYYY-MM-DD): the date range the archive tab opens with. */
export function monthRange(day: string): { from: string; to: string } {
  const [year, month] = day.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}` };
}
export interface RequestGroup { key: string; number: string; shown: string; type: string; date: string; /** Distinct welds on the request. */ welds: number; lines: Row[]; }
/** Request lines (one per weld) of an archive tab, newest first. */
export const managerRequests = (tab: ManagerTab, requests: Row[] | null | undefined) => tab.requests ? live(requests).filter(row => tab.types.includes(textOf(row.type))).sort(newest) : [];
/** One row per request (type and number), with the filters of the archive tab; `projectOf` gives the project of a weld. */
export function groupRequests(tab: ManagerTab, requests: Row[] | null | undefined, filter: RequestFilter = {}, projectOf: (weldId: string) => string = () => ''): RequestGroup[] {
  const lines = managerRequests(tab, requests).filter(row => (tab.kind === 'PWHT' || (row.type === 'NDT PRE') === Boolean(filter.pre)) && (!filter.project || projectOf(textOf(row.weldId)) === filter.project) && (!filter.from || textOf(row.date) >= filter.from) && (!filter.to || textOf(row.date) <= filter.to));
  const groups = new Map<string, RequestGroup>();
  for (const line of lines) {
    const key = `${textOf(line.type)}|${textOf(line.number)}`, group = groups.get(key);
    if (group) { group.lines.push(line); group.welds = new Set(group.lines.map(item => item.weldId)).size; if (textOf(line.date) > group.date) group.date = textOf(line.date); }
    else groups.set(key, { key, number: textOf(line.number), shown: requestNumberShown(line.number), type: textOf(line.type), date: textOf(line.date), welds: 1, lines: [line] });
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}
/** A row of a request's detail page: one process of one weld on the request (PWHT lines have no process). */
export interface RequestDetailLine { weldId: string; request: Row; processId: string; /** The process has a result, which an undo removes. */ hasResult: boolean; /** The weld's only process on this request: undoing it removes the weld from the request. */ last: boolean; }
export function requestDetail(lines: Row[], results: Row[] | null | undefined, processes: Row[] | null | undefined): RequestDetailLine[] {
  return lines.flatMap(request => {
    const ids = requestProcessIds(request, results, processes);
    return (ids.length ? ids : ['']).map(processId => ({ weldId: textOf(request.weldId), request, processId, hasResult: live(results).some(row => row.requestId === request.id && textOf(row.result) !== '' && (!processId || textOf(row.processId) === processId)), last: ids.length <= 1 }));
  });
}
/** Filter of the request manager tabs (Project, Welder, Type). */
export interface ManagerFilter { project?: string; welder?: string; weldType?: string; }
export const filterManagerWelds = (welds: Row[], filter: ManagerFilter, projectOf: (weld: Row) => string) => welds.filter(weld => (!filter.project || projectOf(weld) === filter.project) && (!filter.welder || [1, 2, 3, 4].some(side => weld[`welder${side}Id`] === filter.welder)) && (!filter.weldType || weld.typeId === filter.weldType));

/**
 * Columns of a Manager tab in the reference order and wording. Weld tabs: "NDT Pre (or NDT)" follows the tab; the PWHT
 * request manager has no NDT R/Nr. and names the isometric "Isometric". Archive tabs: one examined process per row;
 * request archives: one request per row.
 */
export function managerColumns(tab: ManagerTab): string[] {
  if (tab.archive) return ['Project', 'ISO No', 'WN', 'Type', 'Welder', 'Dia.(inch)', 'Date', tab.kind === 'PWHT' ? 'PWHT process' : 'NDT process', 'Result', 'Idx 1', 'Chg.No. 1', 'Material 1', 'Idx 2', 'Chg.No. 2', 'Material 2', 'WPS', 'Doc.', 'Rep. No', ''];
  if (tab.requests) return ['Date', 'Request number', 'Welds', 'Options'];
  if (tab.kind === 'PWHT') return ['Project', 'Isometric', 'Weld no.', 'Type', 'Welder', 'PWHT', 'Ind.No.', 'Chg.No.', 'Material ①', 'Ind.No.', 'Chg.No.', 'Material ②', 'Proces', 'WPS'];
  return ['Project', 'ISO', 'Weld no.', 'Type', 'Welder', tab.kind === 'NDT PRE' ? 'NDT Pre' : 'NDT', 'NDT R/Nr.', 'Idx. No.', 'Chg.No.', 'Material ①', 'Ind.No.', 'Chg.No.', 'Material ②', 'Proces', 'WPS'];
}

// ----- validation shared by the dialogs and the server -----------------------------------------------------------

export interface RoundInput { round: string; processId?: string; filmNo?: string; reportNo?: string; date?: string; result?: string; naLength?: number | string | null; defectType?: string; reweld?: boolean; }
/**
 * Problems of one round (column) of the NDT dialog by field. NA length, Defect type, Welder for error and ReWeld? are
 * one set per weld, not per round: see `naBlockErrors`.
 */
export function roundErrors(input: RoundInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const result = textOf(input.result), round = NDT_ROUNDS.find(item => item.key === input.round);
  if (!round) return { round: 'Choose an examination round.' };
  if (result && !['Accepted', 'Rejected'].includes(result)) errors.result = 'Choose —, NA or Accepted.';
  if (result && !textOf(input.reportNo)) errors.reportNo = 'Enter the NDT Rp/Nr. for this result.';
  if (!result && (textOf(input.filmNo) || textOf(input.reportNo) || textOf(input.date))) errors.result = 'Film Nr., NDT Rp/Nr. and NDT date are saved with a result. Choose a result or clear them.';
  if (textOf(input.date) && !/^\d{4}-\d{2}-\d{2}$/.test(textOf(input.date))) errors.date = 'Enter a valid NDT date.';
  return errors;
}
/**
 * The NDT dialog's column lock (reference showNDO: Film Nr., NDT Rp/Nr. and NDT date read-only and NDT res. disabled
 * in a column without an NDT process): a column takes values only once its NDT process is chosen.
 */
export const roundOpen = (input: Pick<RoundInput, 'processId'>) => textOf(input.processId) !== '';
export const roundLockedError = (input: RoundInput) => !roundOpen(input) && (textOf(input.result) || textOf(input.filmNo) || textOf(input.reportNo) || textOf(input.date)) ? 'Choose the NDT process of this column before entering its values.' : '';
/** At least one of the five NDT res. is NA (reference __wsappsNdoHasNaResult). */
export const roundsHaveNa = (rounds: Pick<RoundInput, 'result'>[]) => rounds.some(round => textOf(round.result) === 'Rejected');
export interface NaBlockInput { naLength?: number | string | null; defectType?: string; welderForErrorId?: string; reweld?: boolean; }
const blank = (value: unknown) => value === undefined || value === null || textOf(value) === '';
/**
 * Problems of the NA block of the NDT dialog. NDT: NA length (mm, digits only), Defect type, Welder for error (one
 * of the weld's own welders) and ReWeld? are entered only while at least one round is NA. NDT Pre: no NA block
 * (its NA length is always disabled, reference __ndoShowNAPreUpdate).
 */
export function naBlockErrors(input: NaBlockInput, options: { pre: boolean; hasNa: boolean; length?: number; welderIds?: string[] }): Record<string, string> {
  const errors: Record<string, string> = {};
  const given = !blank(input.naLength) || !blank(input.defectType) || !blank(input.welderForErrorId) || input.reweld === true;
  if (options.pre) { if (given) errors.naLength = 'NDT Pre has no NA length, defect type, welder for error or ReWeld?.'; return errors; }
  if (!options.hasNa) { if (given) errors.naLength = 'NA length, Defect type, Welder for error and ReWeld? are entered with a result of NA.'; return errors; }
  if (!blank(input.naLength)) {
    const value = textOf(input.naLength), length = options.length || 0;
    if (!/^\d+$/.test(value)) errors.naLength = 'NA length is a whole number of millimetres.';
    else if (length > 0 && Number(value) > length) errors.naLength = `NA length must be between 0 and ${Math.round(length * 10) / 10} mm.`;
  }
  if (!blank(input.welderForErrorId) && !(options.welderIds || []).includes(textOf(input.welderForErrorId))) errors.welderForErrorId = 'Welder for error must be one of the welders of this weld.';
  return errors;
}
/** ReWeld? is ticked automatically when an NA is chosen on a weld of at most 3 inch (reference data-ndt-diameter-inches). */
export function autoReweld(weld: Row, diameters: Row[] | null | undefined): boolean {
  if (weld.lengthMode === 'Length in mm' || !textOf(weld.diameterId)) return false;
  const inches = Number(live(diameters).find(row => row.id === weld.diameterId)?.sizeinch);
  return Number.isFinite(inches) && inches > 0 && inches <= 3;
}
/** The document of an Upload Pre-HT/PWHT report (one PDF). */
export const PWHT_DOCUMENT = 'Heat treatment report';
/** PDF only for NDT documents and heat treatment reports. */
export const inspectionFileError = (documentType: unknown, name: string) => documentType === NDT_DOCUMENT && !/\.pdf$/i.test(name) ? 'NDT documents must be PDF files.' : documentType === PWHT_DOCUMENT && !/\.pdf$/i.test(name) ? 'Only PDFs are allowed.' : '';
/** Distinct defect types already recorded, for the Initial round's suggestions (no site defect-code list exists yet). */
/** Option text of a defect code in the NDT dialog: the defect's English name only (reference), the code when it has no name. */
export const defectOptionLabel = (code: Row | { code?: unknown; english?: unknown }) => textOf(code.english) || textOf(code.code);
export const DEFECT_EMPTY_OPTION = '-----------------';
export const defectTypeOptions = (results: Row[] | null | undefined) => [...new Set(live(results).map(row => textOf(row.defectType)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// ----- visual (VT) reports -------------------------------------------------------------------------------------

/**
 * The Visual inspection hub: "New" generates a numbered VT report for chosen welds, "Upload" marks A / NA on a report and
 * closes it with the PDF, the archive lists the reports. A weld belongs to one report (reference manual). Results are
 * stored as before: A is "Accepted", NA is "Rejected" (read "NA"); earlier "Not applicable" results stay valid.
 */
export const VT_TABS = { new: 'New', upload: 'Upload', archive: 'Visual reports archive' } as const;
export const VT_MODES = ['Digital fill-in', 'Go (PDF)'] as const;
export const VT_FILTERS = [{ value: 'all', label: 'Include all welds' }, { value: 'select', label: 'Select specific weld(s)' }];
export const VT_ITPS = ['ITP 1', 'ITP 2'];
/** Labels of the New tab, in the reference order. */
export const VT_NEW_LABELS = { filter: 'Filter', itp: 'ITP', activityNo: 'Activity No', engineer: 'QAQC Engineer', customNo: 'Custom Report No (If needed)' };
export const VT_PICKER_COLUMNS = ['C', 'WN', 'Type', 'Wdr'];
export const VT_UPLOAD_COLUMNS = ['A', 'NA', 'WN', 'Type', 'Wdr'];
export const VT_UPLOAD_HELP = 'Tick A or NA per weld and click Save A/NA. That can be done weld by weld. Only when every weld on the report is marked do you upload the PDF, or finish via New → Digital fill-in. Digital fill-in and Go (PDF) use the same report; a weld is not placed on a second report.';
export const VT_DOCUMENT = 'VI document';
export const VT_NO_WELDS = 'Select at least one weld.';
export const VT_NO_OPEN_REPORT = 'There is no open report to fill in. Use Go (PDF) to create one first.';
export const VT_CHOOSE_REPORT = 'Choose the open report you want to fill in.';
export const VT_TICK_ONE = 'Tick at least one A or NA to save.';
export const VT_DELETE_CONFIRM = 'Delete selected VT report(s)?';
export const VT_NOTHING_TO_DELETE = 'Check at least one report to delete.';
export const vtMissingMessage = (weldNos: string[]) => `Each weld must have A (accepted) or NA (not accepted) before upload. Missing: ${weldNos.join(', ')}`;
export const vtNumber = (seq: number) => `VT ${seq}`;
export const vtSeq = (report: Row) => Number(report.seq) || Number(/(\d+)\s*$/.exec(textOf(report.number))?.[1]) || 0;
/** Next report number of a main project: one more than its highest number, archived reports included so a number is never reused. */
export const nextVtSeq = (reports: Row[] | null | undefined, siteId: string) => Math.max(0, ...(reports || []).filter(report => textOf(report.siteId) === siteId).map(vtSeq)) + 1;
/** Weld ids of a report (stored as one comma separated text). */
export const vtWeldIds = (report: Row) => textOf(report.weldIds).split(',').map(id => id.trim()).filter(Boolean);
export const vtResultRows = (report: Row, results: Row[] | null | undefined) => live(results).filter(row => row.type === 'VI' && textOf(row.reportNo) === textOf(report.number) && vtWeldIds(report).includes(textOf(row.weldId)) && textOf(row.result) !== '');
/** Latest outcome of each marked weld of a report. */
export function vtMarks(report: Row, results: Row[] | null | undefined): Map<string, string> {
  const marks = new Map<string, string>();
  for (const row of vtResultRows(report, results).sort((a, b) => newest(b, a))) marks.set(textOf(row.weldId), textOf(row.result));
  return marks;
}
/** Welds of a report that have neither A nor NA yet. */
export const vtOpenWeldIds = (report: Row, results: Row[] | null | undefined) => { const marks = vtMarks(report, results); return vtWeldIds(report).filter(id => !marks.has(id)); };
/** Reports of an isometric that still have welds without a mark (the choices of "Select report" and "Digital fill-in"). */
export const vtOpenReports = (reports: Row[] | null | undefined, results: Row[] | null | undefined, isoId?: string) => live(reports).filter(report => (!isoId || report.isoId === isoId) && vtOpenWeldIds(report, results).length > 0).sort((a, b) => vtSeq(b) - vtSeq(a));
/** Reports of an isometric the Upload tab offers: every report whose PDF is not uploaded yet (a fully marked report waits here for its PDF). */
export const vtUploadReports = (reports: Row[] | null | undefined, isoId?: string) => live(reports).filter(report => (!isoId || report.isoId === isoId) && report.uploaded !== true).sort((a, b) => vtSeq(b) - vtSeq(a));
/** Weld ids already placed on a report: on a generated report, or with a visual result of an earlier report. */
export function vtUsedWeldIds(reports: Row[] | null | undefined, results: Row[] | null | undefined): Set<string> {
  const used = new Set<string>();
  for (const report of live(reports)) for (const id of vtWeldIds(report)) used.add(id);
  for (const row of live(results)) if (row.type === 'VI' && textOf(row.reportNo) && textOf(row.result) !== '') used.add(textOf(row.weldId));
  return used;
}
/** Welds a new VT report may take: every live weld of the isometric not yet on a report, with or without a welder. */
export const vtEligibleWelds = (welds: Row[] | null | undefined, reports: Row[] | null | undefined, results: Row[] | null | undefined, isoId?: string) => {
  const used = vtUsedWeldIds(reports, results);
  return live(welds).filter(weld => (!isoId || weld.isoId === isoId) && !used.has(weld.id)).sort((a, b) => textOf(a.weldNo).localeCompare(textOf(b.weldNo), 'en', { numeric: true }));
};
/** Why a set of welds cannot go on a new report, or '' when it can. */
export function vtGenerateError(weldIds: string[], welds: Row[], reports: Row[] | null | undefined, results: Row[] | null | undefined, isoId: string): string {
  if (!weldIds.length) return VT_NO_WELDS;
  const onIso = live(welds).filter(weld => weld.isoId === isoId);
  if (weldIds.some(id => !onIso.some(weld => weld.id === id))) return 'A selected weld is not on this isometric.';
  const eligible = new Set(vtEligibleWelds(welds, reports, results, isoId).map(weld => weld.id));
  const refused = onIso.filter(weld => weldIds.includes(weld.id) && !eligible.has(weld.id)).map(weld => textOf(weld.weldNo));
  return refused.length ? `Weld ${refused.join(', ')} ${refused.length > 1 ? 'are' : 'is'} already on a visual report.` : '';
}

// ----- actions ------------------------------------------------------------------------------------------------

const field = (name: string, label: string, extra: Partial<ActionField> = {}): ActionField => ({ name, label, type: 'text', ...extra });
const welds = field('weldIds', 'Welds', { type: 'ref', ref: 'welds', multiple: true, required: true });
const date = field('date', 'Date', { type: 'date' });
/** Inputs of the VT report operations, which run under the existing "visual-inspection" action (`op`: generate, marks, upload, delete). */
const VT_ACTION_FIELDS: ActionField[] = [field('op', 'Operation', { type: 'select', options: ['generate', 'marks', 'upload', 'delete'], hidden: true }), field('isoId', 'Isometric', { type: 'ref', ref: 'isometrics', hidden: true }), field('mode', 'Created with', { type: 'select', options: [...VT_MODES], hidden: true }), field('reportId', 'Report', { type: 'ref', ref: 'visual_reports', hidden: true }), field('reportIds', 'Reports', { type: 'ref', ref: 'visual_reports', multiple: true, hidden: true })];
/** Actions of this flow; their dialogs live in `client/inspections.tsx`. Array inputs (`rounds`) are hidden here. */
export const INSPECTION_ACTIONS: ActionDefinition[] = [
  { key: 'ndt-weld', title: 'Create/Update NDT Request', module: 'welding', submit: 'Save', description: 'NDT location, the five examination rounds and the NA block of one weld.', fields: [field('weldId', 'Weld', { type: 'ref', ref: 'welds', required: true }), field('type', 'Inspection type', { type: 'select', options: NDT_TYPES, required: true }), field('locationId', 'NDT location', { type: 'ref', ref: 'ndt_locations' }), field('requestNo', 'Request number'), field('rounds', 'Rounds', { hidden: true }), field('welderId', 'Welder', { type: 'ref', ref: 'welders' }), field('naLength', 'NA length', { hidden: true }), field('defectType', 'Defect type', { hidden: true }), field('welderForErrorId', 'Welder for error', { type: 'ref', ref: 'welders', hidden: true }), field('reweld', 'ReWeld?', { type: 'checkbox', hidden: true }), field('tracerIds', 'Tracer welds', { type: 'ref', ref: 'welds', multiple: true, hidden: true })] },
  { key: 'tracers', title: 'Save tracers', module: 'welding', submit: 'Save tracers', description: 'Link the tracer welds of the rejected welds of a welder / WPS / ITP-KNR group.', fields: [field('weldId', 'Weld', { type: 'ref', ref: 'welds' }), field('tracerIds', 'Tracer welds', { type: 'ref', ref: 'welds', multiple: true }), field('assignments', 'Tracer assignments', { hidden: true }), field('welderId', 'Welder', { hidden: true })] },
  { key: 'mass-inspection-request', title: 'Generate mass request', module: 'welding', submit: 'Go', description: 'One request number for the selected welds and the open processes ticked. The request is created when its PDF is generated.', fields: [field('type', 'Inspection type', { type: 'select', options: ['NDT PRE', 'NDT', 'PRE-HT', 'PWHT'], required: true }), welds, field('processIds', 'NDT processes', { type: 'ref', ref: 'ndt_processes', multiple: true }), field('note', 'Note', { type: 'textarea' })] },
  { key: 'inspection-upload', title: 'Upload NDT on multiple welds', module: 'welding', submit: 'Save results', description: 'One report number and result per round for every selected weld.', fields: [field('type', 'Inspection type', { type: 'select', options: NDT_TYPES, required: true }), welds, field('rounds', 'Rounds', { hidden: true }), date] },
  { key: 'pwht-upload', title: 'Upload Pre-HT/PWHT on multiple welds', module: 'welding', submit: 'Upload', description: 'Pre-HT and PWHT report numbers for every selected weld.', fields: [welds, field('preReportNo', 'Pre-HT Rp/Nr.'), field('reportNo', 'PWHT Rp/Nr.'), field('checked', 'PWHT 100%', { type: 'checkbox' }), date] },
  { key: 'pwht-weld', title: 'PWHT request', module: 'welding', submit: 'Save', description: 'Location, process, request, date, report number and 100% of the Pre-HT and PWHT of one weld, and its documents.', fields: [field('weldId', 'Weld', { type: 'ref', ref: 'welds', required: true }), field('sections', 'Heat treatments', { hidden: true }), field('deleteFileIds', 'Documents to delete', { hidden: true })] },
  { key: 'ndt-restart', title: 'Restart NDT process', module: 'welding', submit: 'Yes', description: 'Start NDT processes of one weld again: they leave their request and their results are removed; the weld\'s other processes stay.', fields: [field('weldId', 'Weld', { type: 'ref', ref: 'welds', required: true }), field('type', 'Inspection type', { type: 'select', options: NDT_TYPES, required: true }), field('processIds', 'NDT processes', { type: 'ref', ref: 'ndt_processes', multiple: true, required: true })] },
  { key: 'inspection-request-undo', title: 'Undo request', module: 'welding', submit: 'Undo', description: 'Take a weld, or some of its processes, off an NDT request. The request line stays in the records as removed.', fields: [field('requestNo', 'Request number', { required: true }), field('type', 'Inspection type', { type: 'select', options: NDT_TYPES, required: true }), field('weldId', 'Weld', { type: 'ref', ref: 'welds', required: true }), field('processIds', 'NDT processes', { type: 'ref', ref: 'ndt_processes', multiple: true })] },
  { key: 'visual-inspection', title: 'Visual inspection', module: 'welding', submit: 'Save visual report', description: 'Write one visual inspection report to several welds.', fields: [welds, field('itp', 'ITP', { type: 'select', options: ['ITP 1', 'ITP 2'] }), field('activityNo', 'Activity No.'), field('engineerId', 'QA/QC engineer', { type: 'ref', ref: 'qa_engineers' }), field('customNo', 'Custom No.'), field('reportNo', 'Report No.', { required: true }), field('date', 'Inspection date', { type: 'date', required: true }), field('accepted', 'Accepted', { type: 'ref', ref: 'welds', multiple: true }), field('notAccepted', 'Not accepted', { type: 'ref', ref: 'welds', multiple: true }), field('notApplicable', 'Not applicable', { type: 'ref', ref: 'welds', multiple: true }), ...VT_ACTION_FIELDS] },
];
export const INSPECTION_ACTION_KEYS = INSPECTION_ACTIONS.map(action => action.key);
/** Actions whose permission depends on the inspection type in the request. */
export const TYPED_INSPECTION_ACTIONS = ['ndt-weld', 'mass-inspection-request', 'inspection-upload', 'ndt-restart', 'inspection-request-undo'];
/** Permission area and operation of an action of this flow (see `actionScope` in `shared/permissions.ts`). */
export function inspectionActionScope(key: string, data: Record<string, unknown> = {}): [string, 'insert' | 'edit' | 'delete' | 'print' | 'show'] | undefined {
  // Undoing a request is done in the request archive (NDT request archive 66; it has no NDT Pre area of its own).
  if (key === 'inspection-request-undo') return ['66', 'show'];
  if (key === 'ndt-weld' || key === 'inspection-upload' || key === 'ndt-restart') return [data.type === 'NDT PRE' ? '94' : '76', 'insert'];
  if (key === 'mass-inspection-request') return [data.type === 'PWHT' || data.type === 'PRE-HT' ? '65' : '50', 'print'];
  if (key === 'pwht-upload' || key === 'pwht-weld') return ['97', 'insert'];
  // Visual inspection 116: deleting a VT report needs its Delete right, every other operation its Add right.
  if (key === 'visual-inspection') return ['116', data.op === 'delete' ? 'delete' : 'insert'];
  if (key === 'tracers') return ['63', 'edit'];
  return undefined;
}

// ----- delivery to the hosted profile ---------------------------------------------------------------------------

/** Action inputs the hosted profile accepts for this flow. */
export const INSPECTION_ACTION_INPUTS: Record<string, string[]> = Object.fromEntries(INSPECTION_ACTIONS.map(action => [action.key, action.fields.map(item => item.name)]));
/**
 * Delivers this flow to a profile (hosted `welding-workspace`, see `availabilityFor`): the weld, request and result
 * fields, QA/QC engineers for the visual report, the five inspection types, the actions and the Manager page.
 * `deliver` is `deliverResource` of `shared/release.ts` (passed in to keep this module free of imports).
 */
export function deliverInspections(availability: Availability, deliver: (availability: Availability, key: string, names?: string[], options?: { page?: boolean }) => void) {
  deliver(availability, 'welds', [...INSPECTION_WELD_FIELDS.map(item => item.name), 'tracer', 'ndoReqPre', 'pwhtReqPre', 'pwhtReq']);
  deliver(availability, 'inspection_results', ['processId', 'naLength', 'defectType', ...INSPECTION_RESULT_FIELDS.map(item => item.name)]);
  deliver(availability, 'inspection_requests', ['pwhtProcessId', 'pwhtLocationId', ...INSPECTION_REQUEST_FIELDS.map(item => item.name)]);
  deliver(availability, 'qa_engineers');
  deliver(availability, 'visual_reports', undefined, { page: false });
  for (const type of ['NDT', 'NDT PRE', 'VI', 'PWHT', 'PRE-HT']) if (!availability.inspectionTypes.includes(type)) availability.inspectionTypes.push(type);
  Object.assign(availability.actions, INSPECTION_ACTION_INPUTS);
  if (!availability.features.includes('inspections')) availability.features.push('inspections');
}
/** The NDT/PWHT Manager page (route-table path, inside Weld Pilot). */
export const MANAGER_PATH = '/welding/inspections';
