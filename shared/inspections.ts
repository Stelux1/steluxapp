import type { ActionDefinition, ActionField, Availability, Field, Row } from './types.ts';

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
];
export const INSPECTION_REQUEST_FIELDS: Field[] = [text('processes', 'NDT processes')];
/** Added choices: visual inspection may record "Not applicable" per weld. */
export const EXTRA_RESULT_OPTION = 'Not applicable';

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
/** Latest outcome of one stored type. */
export const latestResult = (results: Row[] | null | undefined, weldId: string, type: string) => weldResults(results, weldId, [type])[0];
/** The weld's latest NDT or NDT Pre outcome is not accepted. */
export const notAccepted = (weld: Row, results: Row[] | null | undefined) => NDT_TYPES.some(type => latestResult(results, weld.id, type)?.result === 'Rejected');
const accepted = (weld: Row, results: Row[] | null | undefined) => NDT_TYPES.some(type => latestResult(results, weld.id, type)?.result === 'Accepted') && !notAccepted(weld, results);

// ----- requirement and cell state ------------------------------------------------------------------------------

/**
 * Whether a weld-table column applies to a weld. NDT Pre, NDT and Pre-HT/PWHT follow the weld's requirement
 * flags. The reference has no visible VI flag: VI is taken to apply once the weld has a welder (INFERRED).
 */
export function inspectionRequired(weld: Row, kind: InspectionKind): boolean {
  if (kind === 'VI') return hasWelder(weld);
  if (kind === 'NDT PRE') return weld.ndoReqPre === true;
  if (kind === 'NDT') return weld.ndoReq === true;
  return weld.pwhtReqPre === true || weld.pwhtReq === true;
}
/** Stored types a weld needs in a column (Pre-HT/PWHT: only the flagged ones). */
export const requiredTypes = (weld: Row, kind: InspectionKind) => kind === 'PWHT' ? [...(weld.pwhtReqPre === true ? ['PRE-HT'] : []), ...(weld.pwhtReq === true ? ['PWHT'] : [])] : inspectionRequired(weld, kind) ? KIND_TYPES[kind] : [];

export type CellStatus = 'not-required' | 'open' | 'requested' | 'accepted' | 'rejected' | 'not-applicable';
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
  /** NDT columns: the tracer button is shown (the weld needs tracers or is one). */
  tracer: boolean;
}
export interface CellRows { results?: Row[] | null; requests?: Row[] | null; attachments?: Row[] | null; welds?: Row[] | null; }
/** The cell rows out of the workspace rows (keyed by resource). Passing the workspace rows directly would leave every cell without results. */
export const workspaceCellRows = (rows: Record<string, Row[] | null | undefined>): CellRows => ({ results: rows.inspection_results, requests: rows.inspection_requests, attachments: rows.attachments, welds: rows.welds });
export const REQUEST_DOCUMENT = 'Request document';
export const NDT_DOCUMENT = 'NDT document';
export function inspectionCellState(weld: Row, kind: InspectionKind, rows: CellRows): CellState {
  const types = KIND_TYPES[kind];
  const results = weldResults(rows.results, weld.id, types), requests = weldRequests(rows.requests, weld.id, types);
  const required = inspectionRequired(weld, kind) || results.length > 0 || requests.length > 0;
  const attachments = live(rows.attachments);
  const reports = new Set(results.map(row => `${row.type}|${textOf(row.reportNo)}`).filter(key => !key.endsWith('|')));
  const sameReport = new Set(live(rows.results).filter(row => reports.has(`${row.type}|${textOf(row.reportNo)}`)).map(row => row.id));
  const requestIds = new Set(requests.map(row => row.id));
  const reportFiles = attachments.filter(file => file.entityType === 'inspection_results' && sameReport.has(String(file.entityId)) || file.entityType === 'inspection_requests' && requestIds.has(String(file.entityId)) && file.documentType !== REQUEST_DOCUMENT);
  const requestFiles = attachments.filter(file => file.entityType === 'inspection_requests' && requestIds.has(String(file.entityId)) && file.documentType === REQUEST_DOCUMENT);
  // A tracer weld shows the button in the NDT column it is examined in, not in a column that does not apply to it.
  const tracer = (kind === 'NDT' || kind === 'NDT PRE') && ((isTracer(weld) && required) || latestResult(rows.results, weld.id, kind)?.result === 'Rejected');
  let status: CellStatus = 'not-required';
  if (required) {
    const typesNeeded = kind === 'PWHT' ? (requiredTypes(weld, kind).length ? requiredTypes(weld, kind) : types) : types;
    const latest = typesNeeded.map(type => latestResult(rows.results, weld.id, type));
    if (latest.some(row => row?.result === 'Rejected')) status = 'rejected';
    else if (latest.every(row => row?.result === 'Accepted' || row?.result === EXTRA_RESULT_OPTION)) status = latest.every(row => row?.result === EXTRA_RESULT_OPTION) ? 'not-applicable' : 'accepted';
    else if (requests.some(row => row.status === 'Open')) status = 'requested';
    else status = 'open';
  }
  return { required, status, requests, results, reportFiles, requestFiles, tracer };
}

// ----- repairs -------------------------------------------------------------------------------------------------

/** Repair welds made for a weld (`repairOfId`), oldest first. */
export const repairsOf = (weld: Row, welds: Row[]) => live(welds).filter(row => row.repairOfId === weld.id).sort((a, b) => textOf(a._createdAt).localeCompare(textOf(b._createdAt)) || textOf(a.weldNo).localeCompare(textOf(b.weldNo)));
/** The original weld of a repair chain (`010R2` → `010`). */
export function repairRoot(weld: Row, welds: Row[]): Row {
  let current = weld; const seen = new Set<string>([weld.id]);
  for (;;) {
    const parent = live(welds).find(row => row.id === current.repairOfId);
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
  let depth = 0; for (let current = weld; current.id !== root.id; current = live(welds).find(row => row.id === current.repairOfId)!) depth++;
  const used = new Set(live(welds).filter(row => row.isoId === weld.isoId).map(row => textOf(row.weldNo).toLowerCase()));
  let n = depth + 1; while (used.has(`${textOf(root.weldNo)}R${n}`.toLowerCase())) n++;
  return `${textOf(root.weldNo)}R${n}`;
}
/** A repair weld is due: the latest NDT / NDT Pre result is not accepted and no repair weld exists for it yet. */
export const repairDue = (weld: Row, welds: Row[], results: Row[] | null | undefined) => notAccepted(weld, results) && repairsOf(weld, welds).length === 0;
/** Fields a repair weld takes over from its original: the weld definition, not its execution. */
export const REPAIR_COPY_FIELDS = ['typeId', 'spoolId', 'wpsId', 'lengthMode', 'diameterId', 'dialen', 'ndtpercent', 'ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'jointType', 'material1Id', 'material2Id', 'certificate1Id', 'certificate2Id', 'chargeNo1', 'chargeNo2', ...INSPECTION_MASS_EDIT_FIELDS];
export interface RepairState { open: boolean; original: Row; repair?: Row; }
/**
 * The repair of a not-accepted weld stays open until a repair weld in its chain has an accepted NDT result.
 * Returns null when the weld's latest NDT result is not "not accepted", or when the weld is itself an open repair
 * of a not-accepted parent (the parent's entry names it).
 */
export function repairState(weld: Row, welds: Row[], results: Row[] | null | undefined): RepairState | null {
  if (!notAccepted(weld, results)) return null;
  const parent = live(welds).find(row => row.id === weld.repairOfId);
  if (parent && notAccepted(parent, results)) return null;
  const chain = repairChain(weld, welds);
  return { open: !chain.some(row => accepted(row, results)), original: weld, repair: chain.at(-1) };
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
/** Why a set of tracer welds cannot be linked to `weld`, or '' when it can. An empty set unlinks all tracers. */
export function tracerError(weld: Row, tracerIds: string[], welds: Row[], results: Row[] | null | undefined): string {
  if (!tracerIds.length) return '';
  if (new Set(tracerIds).size !== tracerIds.length) return 'Choose each tracer weld once.';
  if (tracerIds.length > TRACERS_REQUIRED) return `Link at most ${TRACERS_REQUIRED} tracer welds.`;
  if (!notAccepted(weld, results)) return 'Tracer welds are linked to a weld whose latest NDT result is not accepted.';
  if (isTracer(weld)) return 'A tracer weld cannot have tracers of its own.';
  const chain = new Set([repairRoot(weld, welds).id, ...repairChain(repairRoot(weld, welds), welds).map(row => row.id)]);
  for (const id of tracerIds) {
    const tracer = live(welds).find(row => row.id === id);
    if (!tracer) return 'A selected tracer weld is unavailable.';
    if (chain.has(tracer.id)) return `Weld ${tracer.weldNo} is the weld itself or one of its repairs.`;
    if (textOf(tracer.tracerOfId) && tracer.tracerOfId !== weld.id) return `Weld ${tracer.weldNo} is already a tracer for another weld.`;
    if (tracersOf(tracer, welds).length) return `Weld ${tracer.weldNo} has tracers of its own.`;
  }
  return '';
}

// ----- NDT/PWHT Manager ----------------------------------------------------------------------------------------

export type ManagerTabKey = 'ndt-pre' | 'ndt' | 'ndt-pre-archive' | 'ndt-archive' | 'ndt-requests' | 'pwht' | 'pwht-archive' | 'pwht-requests';
export interface ManagerTab { key: ManagerTabKey; label: string; /** Lists requests instead of welds. */ requests?: boolean; archive?: boolean; types: string[]; kind: InspectionKind; }
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
/**
 * Welds of a Manager tab. A weld enters the open tab when its requirement flag is set (NDT Req. Pre, NDT Req.,
 * Pre-HT or PWHT Req.) and leaves it for the archive once a result is recorded for that requirement.
 */
export function managerWelds(tab: ManagerTab, welds: Row[], results: Row[] | null | undefined): Row[] {
  if (tab.requests) return [];
  const open = (weld: Row) => requiredTypes(weld, tab.kind).some(type => tab.types.includes(type) && !latestResult(results, weld.id, type));
  const recorded = (weld: Row) => tab.types.some(type => latestResult(results, weld.id, type));
  return live(welds).filter(weld => tab.archive ? recorded(weld) : open(weld));
}
export const managerRequests = (tab: ManagerTab, requests: Row[] | null | undefined) => tab.requests ? live(requests).filter(row => tab.types.includes(textOf(row.type))).sort(newest) : [];
/** Columns of the Manager's weld tabs, in the reference order and wording ("NDT Pre (or NDT)" follows the tab). */
export const managerColumns = (tab: ManagerTab) => ['Project', 'ISO', 'Weld no.', 'Type', 'Welder', tab.kind === 'NDT PRE' ? 'NDT Pre' : tab.kind === 'PWHT' ? 'Pre-HT/PWHT' : 'NDT', 'NDT R/Nr.', 'Idx. No.', 'Chg.No.', 'Material ①', 'Ind.No.', 'Chg.No.', 'Material ②', 'Proces', 'WPS'];

// ----- validation shared by the dialogs and the server -----------------------------------------------------------

export const REQUEST_PREFIX = 'R';
/** "Request number" carries the prefix R; empty means "generate one". */
export const requestNumberError = (value: unknown) => { const number = textOf(value); return !number || (number.startsWith(REQUEST_PREFIX) && number.length <= 40) ? '' : 'Request numbers start with R and have at most 40 characters.'; };
export interface RoundInput { round: string; processId?: string; filmNo?: string; reportNo?: string; date?: string; result?: string; naLength?: number | string | null; defectType?: string; reweld?: boolean; }
/** Problems of one round of the NDT dialog by field, given the weld's length in mm (0 when unknown). */
export function roundErrors(input: RoundInput, length = 0): Record<string, string> {
  const errors: Record<string, string> = {};
  const result = textOf(input.result), round = NDT_ROUNDS.find(item => item.key === input.round);
  if (!round) return { round: 'Choose an examination round.' };
  if (result && !['Accepted', 'Rejected'].includes(result)) errors.result = 'Choose —, NA or Accepted.';
  if (result && !textOf(input.reportNo)) errors.reportNo = 'Enter the NDT Rp/Nr. for this result.';
  if (!result && (textOf(input.filmNo) || textOf(input.reportNo) || textOf(input.date))) errors.result = 'Film Nr., NDT Rp/Nr. and NDT date are saved with a result. Choose a result or clear them.';
  const na = input.naLength === undefined || input.naLength === null || input.naLength === '' ? null : Number(input.naLength);
  if (na !== null || textOf(input.defectType)) {
    if (round.key !== 'Initial' || result !== 'Rejected') errors.naLength = 'NA length and defect type belong to an Initial result of NA.';
    else if (na !== null && (!Number.isFinite(na) || na < 0 || (length > 0 && na > length))) errors.naLength = length > 0 ? `NA length must be between 0 and ${length} mm.` : 'NA length must be zero or greater.';
  }
  if (input.reweld === true && round.key !== 'Remaining') errors.reweld = 'ReWeld? belongs to the Remaining round.';
  if (textOf(input.date) && !/^\d{4}-\d{2}-\d{2}$/.test(textOf(input.date))) errors.date = 'Enter a valid NDT date.';
  return errors;
}
/** PDF only for NDT documents. */
export const inspectionFileError = (documentType: unknown, name: string) => documentType === NDT_DOCUMENT && !/\.pdf$/i.test(name) ? 'NDT documents must be PDF files.' : '';
/** Distinct defect types already recorded, for the Initial round's suggestions (no site defect-code list exists yet). */
export const defectTypeOptions = (results: Row[] | null | undefined) => [...new Set(live(results).map(row => textOf(row.defectType)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// ----- actions ------------------------------------------------------------------------------------------------

const field = (name: string, label: string, extra: Partial<ActionField> = {}): ActionField => ({ name, label, type: 'text', ...extra });
const welds = field('weldIds', 'Welds', { type: 'ref', ref: 'welds', multiple: true, required: true });
const date = field('date', 'Date', { type: 'date' });
/** Actions of this flow; their dialogs live in `client/inspections.tsx`. Array inputs (`rounds`) are hidden here. */
export const INSPECTION_ACTIONS: ActionDefinition[] = [
  { key: 'ndt-weld', title: 'Create/Update NDT Request', module: 'welding', submit: 'Save', description: 'NDT location, request number and the five examination rounds of one weld.', fields: [field('weldId', 'Weld', { type: 'ref', ref: 'welds', required: true }), field('type', 'Inspection type', { type: 'select', options: NDT_TYPES, required: true }), field('locationId', 'NDT location', { type: 'ref', ref: 'ndt_locations' }), field('requestNo', 'Request number'), field('rounds', 'Rounds', { hidden: true })] },
  { key: 'tracers', title: 'Tracer details', module: 'welding', submit: 'Save tracers', description: 'Link the tracer welds of a weld whose NDT result is not accepted.', fields: [field('weldId', 'Weld', { type: 'ref', ref: 'welds', required: true }), field('tracerIds', 'Tracer welds', { type: 'ref', ref: 'welds', multiple: true })] },
  { key: 'mass-inspection-request', title: 'Generate mass request', module: 'welding', submit: 'Create request', description: 'One request number for the selected welds, with the processes to include and a note.', fields: [field('type', 'Inspection type', { type: 'select', options: ['NDT PRE', 'NDT', 'PRE-HT', 'PWHT'], required: true }), welds, field('processIds', 'NDT processes', { type: 'ref', ref: 'ndt_processes', multiple: true }), field('locationId', 'NDT location', { type: 'ref', ref: 'ndt_locations' }), field('pwhtProcessId', 'PWHT process', { type: 'ref', ref: 'pwht_processes' }), field('pwhtLocationId', 'PWHT location', { type: 'ref', ref: 'pwht_locations' }), date, field('note', 'Note', { type: 'textarea' })] },
  { key: 'inspection-upload', title: 'Upload NDT on multiple welds', module: 'welding', submit: 'Save results', description: 'One report number and result per round for every selected weld.', fields: [field('type', 'Inspection type', { type: 'select', options: NDT_TYPES, required: true }), welds, field('rounds', 'Rounds', { hidden: true }), date] },
  { key: 'pwht-upload', title: 'Upload Pre-HT/PWHT on multiple welds', module: 'welding', submit: 'Save', description: 'Pre-HT and PWHT report numbers for every selected weld.', fields: [welds, field('preReportNo', 'Pre report number'), field('reportNo', 'Report number'), field('checked', 'Check', { type: 'checkbox' }), date] },
  { key: 'visual-inspection', title: 'Visual inspection', module: 'welding', submit: 'Save visual report', description: 'Write one visual inspection report to several welds.', fields: [welds, field('itp', 'ITP', { type: 'select', options: ['ITP 1', 'ITP 2'] }), field('activityNo', 'Activity No.'), field('engineerId', 'QA/QC engineer', { type: 'ref', ref: 'qa_engineers' }), field('customNo', 'Custom No.'), field('reportNo', 'Report No.', { required: true }), field('date', 'Inspection date', { type: 'date', required: true }), field('accepted', 'Accepted', { type: 'ref', ref: 'welds', multiple: true }), field('notApplicable', 'Not applicable', { type: 'ref', ref: 'welds', multiple: true })] },
];
export const INSPECTION_ACTION_KEYS = INSPECTION_ACTIONS.map(action => action.key);
/** Actions whose permission depends on the inspection type in the request. */
export const TYPED_INSPECTION_ACTIONS = ['ndt-weld', 'mass-inspection-request', 'inspection-upload'];
/** Permission area and operation of an action of this flow (see `actionScope` in `shared/permissions.ts`). */
export function inspectionActionScope(key: string, data: Record<string, unknown> = {}): [string, 'insert' | 'edit' | 'print'] | undefined {
  if (key === 'ndt-weld' || key === 'inspection-upload') return [data.type === 'NDT PRE' ? '94' : '76', 'insert'];
  if (key === 'mass-inspection-request') return [data.type === 'PWHT' || data.type === 'PRE-HT' ? '65' : '50', 'print'];
  if (key === 'pwht-upload') return ['97', 'insert'];
  if (key === 'visual-inspection') return ['local-visual-results', 'insert'];
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
export function deliverInspections(availability: Availability, deliver: (availability: Availability, key: string, names?: string[]) => void) {
  deliver(availability, 'welds', [...INSPECTION_WELD_FIELDS.map(item => item.name), 'tracer', 'ndoReqPre', 'pwhtReqPre', 'pwhtReq']);
  deliver(availability, 'inspection_results', ['processId', 'naLength', 'defectType', ...INSPECTION_RESULT_FIELDS.map(item => item.name)]);
  deliver(availability, 'inspection_requests', ['pwhtProcessId', 'pwhtLocationId', ...INSPECTION_REQUEST_FIELDS.map(item => item.name)]);
  deliver(availability, 'qa_engineers');
  for (const type of ['NDT', 'NDT PRE', 'VI', 'PWHT', 'PRE-HT']) if (!availability.inspectionTypes.includes(type)) availability.inspectionTypes.push(type);
  Object.assign(availability.actions, INSPECTION_ACTION_INPUTS);
  if (!availability.features.includes('inspections')) availability.features.push('inspections');
}
/** The NDT/PWHT Manager page (route-table path, inside Weld Pilot). */
export const MANAGER_PATH = '/welding/inspections';
