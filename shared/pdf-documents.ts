import type { Row } from './types.ts';
import { lislValues } from './lisl.ts';
import { printDate, type LabelValueItem } from './pdf-lisl.ts';
import { currentRevision } from './revisions.ts';
import { inspectionCellState, latestResult, locationField, processField, NDT_ROUNDS, type CellStatus, type InspectionKind } from './inspections.ts';
import { PHASE_LOCATION, RELEASE_PHASES, releaseDocumentNumber, signatureTitlesOf, storedSignatureTitles, weldPhase, type ReleasePhase, type SignatureTitle } from './releases.ts';
import { punchCounts, punchStatus } from './punch.ts';
import { HYDROTEST_REQUEST_RESOURCE } from './hydrotest.ts';

/**
 * Data side of the operational PDF documents: NDT / NDT Pre / Pre-HT/PWHT requests, the visual inspection report, the
 * Prefab and Field release documents and the hydrotest request. Pure functions over the rows an account may read;
 * `isoIds` is always the set of isometrics visible in the current pilot, and nothing is returned that does not trace back
 * to one of them. Layout lives in `server/pdf/operational-requests.ts` and `operational-release.ts`.
 */
type Rows = Record<string, Row[]>;
export const pdfText = (value: unknown) => String(value ?? '').trim();
const text = pdfText;
const live = (rows: Row[] | undefined | null) => (rows || []).filter(row => !row._archived);
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const find = (rows: Rows, key: string, id: unknown) => id ? live(rows[key]).find(row => row.id === id) : undefined;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
export const engineerLine = (engineer: Row | undefined) => engineer ? [text(engineer.name), text(engineer.stamp) ? `stamp ${text(engineer.stamp)}` : ''].filter(Boolean).join(' - ') : '';

// ----- weld lines (shared by the request, visual and release documents) ------------------------------------------

export interface WeldLine {
  weld: Row; iso?: Row; weldNo: string; isoNo: string; type: string; diameter: string; wall: string; material: string; wps: string; welder: string; date: string;
}
/** One printed weld: the joined values of the LISL data, as one line of text per column. */
export function weldLine(weld: Row, rows: Rows): WeldLine {
  const values = lislValues(weld, rows), iso = find(rows, 'isometrics', weld.isoId);
  const both = (name: string) => unique([text(values[`${name} 1`]), text(values[`${name} 2`])]).join(' / ');
  const inch = text(values['Diameter (inch)']);
  const welder = [values.Welder, values['Welder 2'], values['Welder 3'], values['Welder 4']].map(value => text(value).split(' | ')[0].trim()).filter(Boolean).join('/');
  return {
    weld, iso, weldNo: text(weld.weldNo), isoNo: text(iso?.isoNo), type: text(values['Weld Type']),
    diameter: weld.lengthMode === 'Length in mm' && weld.dialen ? `${weld.dialen} mm` : inch ? `${inch}"` : '',
    wall: both('Wall thickness'), material: both('Material'), wps: text(values['WPS No']), welder, date: printDate(values['Weld date']),
  };
}
export const sortWeldLines = (lines: WeldLine[]) => lines.sort((a, b) => naturalCompare(a.isoNo, b.isoNo) || naturalCompare(a.weldNo, b.weldNo));

export interface ProjectContext { project?: Row; site?: Row; client: string; isometrics: Row[] }
/** The project, main project (site) and client of the first isometric, and the isometrics themselves in number order. */
export function projectContext(rows: Rows, isometrics: Row[]): ProjectContext {
  const sorted = [...isometrics].sort((a, b) => naturalCompare(text(a.isoNo), text(b.isoNo)));
  const project = find(rows, 'projects', sorted[0]?.projectId), site = find(rows, 'sites', project?.siteId);
  return { project, site, client: text(find(rows, 'companies', project?.companyId)?.name), isometrics: sorted };
}
/** Project block of a header: client, project numbers, description and the isometric(s). */
export function projectItems(context: ProjectContext, rows: Rows): LabelValueItem[] {
  const { project, client, isometrics } = context;
  const isoText = isometrics.length === 1 ? `${text(isometrics[0].isoNo)}${currentRevision(rows, isometrics[0].id) ? ` Rev. ${currentRevision(rows, isometrics[0].id)}` : ''}` : isometrics.length ? `${isometrics.length} isometrics` : '';
  return [
    { label: 'Client', value: client }, { label: 'Intern prj. no.', value: text(project?.internnumber) },
    { label: 'Extern prj. no.', value: text(project?.externnumber) }, { label: 'Project description', value: text(project?.description) },
    { label: isometrics.length > 1 ? 'Isometrics' : 'Iso number', value: isoText },
  ];
}

// ----- NDT / NDT Pre / Pre-HT/PWHT request ---------------------------------------------------------------------------

export type RequestDocumentKind = 'ndt-request' | 'ndt-pre-request' | 'pwht-request';
export const REQUEST_DOCUMENTS: Record<RequestDocumentKind, { title: string; types: string[]; pre: boolean; pwht: boolean }> = {
  'ndt-request': { title: 'NDT request', types: ['NDT'], pre: false, pwht: false },
  'ndt-pre-request': { title: 'NDT Pre request', types: ['NDT PRE'], pre: true, pwht: false },
  'pwht-request': { title: 'Pre-HT / PWHT request', types: ['PRE-HT', 'PWHT'], pre: false, pwht: true },
};
export const REQUEST_NOTE_LIMIT = 2000;
export interface RequestDocumentOptions {
  /** NDT process ids to include; null keeps every requested process. */
  processIds: string[] | null;
  /** A note given for this print; null keeps the notes stored with the requests. */
  note: string | null;
  /** Add the list of the isometrics the request covers. */
  isometrics: boolean;
}
const flag = (value: string | undefined, fallback: boolean) => value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
/** Options from the query: `processes` (comma separated ids), `note`, `isometrics=1|0`. Returns the first problem as `error`. */
export function requestDocumentOptions(query: Record<string, string>): { options: RequestDocumentOptions; error?: string } {
  const note = query.note === undefined ? null : text(query.note);
  const processIds = query.processes === undefined ? null : unique(query.processes.split(',').map(text));
  return { options: { processIds, note: note === '' ? null : note, isometrics: flag(query.isometrics, false) }, ...(note !== null && note.length > REQUEST_NOTE_LIMIT ? { error: `The note can have at most ${REQUEST_NOTE_LIMIT} characters.` } : {}) };
}

export interface RequestDocumentModel {
  kind: RequestDocumentKind; title: string; requestNo: string; date: string; location: string;
  /** The processes printed (after the process option). */
  processes: string[]; note: string;
  requests: Row[]; lines: WeldLine[]; context: ProjectContext; options: RequestDocumentOptions;
}
/**
 * A request document: all requests of the document's types that share the request number (one per weld; a mass request
 * is one number over several welds), limited to welds of visible isometrics. Null when there is none.
 * Processes: the request's own process and process list, plus the weld's process of every round (NDT), or the PWHT process.
 */
export function requestDocumentModel(kind: RequestDocumentKind, rows: Rows, requestNo: string, isoIds: Set<string>, options: RequestDocumentOptions): RequestDocumentModel | null {
  const definition = REQUEST_DOCUMENTS[kind], number = text(requestNo);
  if (!number) return null;
  const welds = new Map(live(rows.welds).filter(weld => isoIds.has(text(weld.isoId))).map(weld => [weld.id, weld]));
  const requests = live(rows.inspection_requests).filter(row => definition.types.includes(text(row.type)) && text(row.number) === number && row.status !== 'Cancelled' && welds.has(text(row.weldId)));
  if (!requests.length) return null;
  const lines = sortWeldLines(requests.map(row => weldLine(welds.get(text(row.weldId))!, rows)).filter((line, index, all) => all.findIndex(other => other.weld.id === line.weld.id) === index));
  const names = (key: string) => new Map(live(rows[key]).map(row => [row.id, text(row.name)]));
  const ndtProcesses = names('ndt_processes'), pwhtProcesses = names('pwht_processes');
  const idByName = new Map(live(rows.ndt_processes).map(row => [text(row.name).toLowerCase(), row.id]));
  let processes: { id: string; name: string }[];
  if (definition.pwht) processes = unique(requests.map(row => text(row.pwhtProcessId))).map(id => ({ id, name: pwhtProcesses.get(id) || '' })).filter(item => item.name);
  else {
    const ids = unique(requests.flatMap(row => [text(row.processId), ...text(row.processes).split(',').map(name => text(idByName.get(text(name).toLowerCase()) ?? ''))]).concat(lines.flatMap(line => NDT_ROUNDS.map(round => text(line.weld[processField(definition.pre, round.index)])))));
    processes = ids.map(id => ({ id, name: ndtProcesses.get(id) || '' })).filter(item => item.name);
    // A process named only in the request's text list (no catalog id) still prints.
    for (const name of unique(requests.flatMap(row => text(row.processes).split(',').map(text)))) if (!idByName.has(name.toLowerCase()) && !processes.some(item => item.name === name)) processes.push({ id: '', name });
  }
  if (options.processIds) processes = processes.filter(item => options.processIds!.includes(item.id));
  const locations = definition.pwht ? names('pwht_locations') : names('ndt_locations');
  const location = unique(requests.map(row => text(definition.pwht ? row.pwhtLocationId : row.locationId)).concat(definition.pwht ? [] : lines.map(line => text(line.weld[locationField(definition.pre)])))).map(id => locations.get(id) || '').filter(Boolean).join(', ');
  const date = requests.map(row => text(row.date).slice(0, 10)).filter(Boolean).sort()[0] || '';
  const note = options.note ?? unique(requests.map(row => text(row.note))).join('\n');
  const isometrics = unique(lines.map(line => text(line.iso?.id))).map(id => find(rows, 'isometrics', id)!).filter(Boolean);
  return { kind, title: definition.title, requestNo: number, date, location, processes: processes.map(item => item.name), note, requests, lines, context: projectContext(rows, isometrics), options };
}
/** Header box of a request document, in row order for three columns. */
export function requestBoxItems(model: RequestDocumentModel): LabelValueItem[] {
  const pwht = REQUEST_DOCUMENTS[model.kind].pwht;
  return [
    { label: 'Request no.', value: model.requestNo }, { label: 'Request date', value: printDate(model.date) }, { label: 'Welds', value: String(model.lines.length) },
    { label: pwht ? 'PWHT location' : 'NDT location', value: model.location }, { label: pwht ? 'PWHT process' : 'Processes', value: model.processes.join(', ') },
    { label: 'Types', value: unique(model.requests.map(row => text(row.type))).join(', ') },
  ];
}
export const REQUEST_COLUMNS = ['Weld no.', 'Type', 'Dia.', 'Wall thk.', 'Material', 'WPS', 'Welder', 'Weld date'];
/** Table cells of a request: the isometric number leads when the request covers several isometrics. */
export const requestRowCells = (line: WeldLine, withIso: boolean) => [...(withIso ? [line.isoNo] : []), line.weldNo, line.type, line.diameter, line.wall, line.material, line.wps, line.welder, line.date];

// ----- visual inspection report ------------------------------------------------------------------------------------------

export interface VisualReportModel {
  reportNo: string; itp: string; activityNo: string; customNo: string; date: string; engineer?: Row; lines: (WeldLine & { accepted: boolean; notApplicable: boolean; result: string })[];
  context: ProjectContext; /** VT document fields of the main project that are filled in. */ vtFields: LabelValueItem[];
}
export const VT_SETTINGS: [string, string][] = [['vtDocNo', 'VT Doc.No. & Rev.No.'], ['vtProcedureNo', 'VT Procedure No.'], ['vtType2No', 'VT type 2 no'], ['vtType2Rev', 'VT type 2 rev'], ['vtType2Date', 'VT type 2 date'], ['vtType2OrderNo', 'VT type 2 order No']];
/** The visual inspection report of one report number: its results on welds of visible isometrics, newest result per weld. */
export function visualReportModel(rows: Rows, reportNo: string, isoIds: Set<string>): VisualReportModel | null {
  const number = text(reportNo);
  if (!number) return null;
  const welds = new Map(live(rows.welds).filter(weld => isoIds.has(text(weld.isoId))).map(weld => [weld.id, weld]));
  const results = live(rows.inspection_results).filter(row => row.type === 'VI' && text(row.reportNo) === number && welds.has(text(row.weldId)));
  if (!results.length) return null;
  const oldest = [...results].sort((a, b) => text(a.date).localeCompare(text(b.date)) || a._createdAt.localeCompare(b._createdAt) || a.id.localeCompare(b.id))[0];
  const newest = (weldId: string) => results.filter(row => row.weldId === weldId).sort((a, b) => text(b.date).localeCompare(text(a.date)) || b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id))[0];
  const lines = sortWeldLines(unique(results.map(row => text(row.weldId))).map(id => ({ ...weldLine(welds.get(id)!, rows), result: text(newest(id).result) })).map(line => ({ ...line, accepted: line.result === 'Accepted', notApplicable: line.result === 'Not applicable' }))) as VisualReportModel['lines'];
  const context = projectContext(rows, unique(lines.map(line => text(line.iso?.id))).map(id => find(rows, 'isometrics', id)!).filter(Boolean));
  const vtFields = VT_SETTINGS.map(([name, label]) => ({ label, value: name === 'vtType2Date' ? printDate(context.site?.[name]) : text(context.site?.[name]) })).filter(item => item.value);
  return { reportNo: number, itp: text(oldest.itp), activityNo: text(oldest.activityNo), customNo: text(oldest.customNo), date: text(oldest.date).slice(0, 10), engineer: find(rows, 'qa_engineers', oldest.engineerId), lines, context, vtFields };
}
export const VISUAL_COLUMNS: (string | string[])[] = ['Weld no.', 'Type', 'Dia.', 'Wall thk.', 'Material', 'WPS', 'Welder', 'Weld date', 'Accepted', ['Not', 'applicable']];
export const visualRowCells = (line: VisualReportModel['lines'][number], withIso: boolean) => [...(withIso ? [line.isoNo] : []), line.weldNo, line.type, line.diameter, line.wall, line.material, line.wps, line.welder, line.date, line.accepted ? 'X' : '', line.notApplicable ? 'X' : ''];

/**
 * UNVERIFIED. The QA/QC engineer record has no link to a user account, so the engineer's signature is found by the
 * user whose e-mail address matches (else whose name matches). Returns that user's id, or '' when there is none.
 */
export function engineerSignerId(engineer: Row | undefined, users: Row[]): string {
  if (!engineer) return '';
  const email = text(engineer.email).toLowerCase(), name = text(engineer.name).toLowerCase();
  const match = (email && users.find(user => text(user.email).toLowerCase() === email)) || (name && users.find(user => text(user.name).toLowerCase() === name));
  return match ? match.id : '';
}

// ----- Prefab / Field release document ------------------------------------------------------------------------------------

const STATE_LABELS: Record<CellStatus, string> = { 'not-required': 'Not required', open: 'Open', requested: 'Requested', accepted: 'Accepted', rejected: 'Not accepted', 'not-applicable': 'Not applicable' };
/** Final state of a weld for one inspection column: the state word, and the report number of the newest result. */
export function weldInspectionState(weld: Row, kind: InspectionKind, rows: Rows): [string, string] {
  const state = inspectionCellState(weld, kind, { results: rows.inspection_results, requests: rows.inspection_requests, attachments: rows.attachments, welds: rows.welds });
  const types = kind === 'PWHT' ? ['PWHT', 'PRE-HT'] : [kind];
  const report = types.map(type => latestResult(rows.inspection_results, weld.id, type)).filter(Boolean).map(result => text(result!.reportNo)).filter(Boolean).join(', ');
  return [STATE_LABELS[state.status], report];
}
export interface ReleaseWeldLine { line: WeldLine; ndtPre: [string, string]; ndt: [string, string]; pwht: [string, string] }
export interface PunchSummaryLine { label: string; open: number; finished: number }
export interface PunchSummary { lines: PunchSummaryLine[]; overdue: number; blocking: number; passed: number; removed: number }
/** Punch summary of one isometric: open and finished by type, overdue, blocking (open A / B), passed and removed. */
export function punchSummary(items: Row[], today?: string): PunchSummary {
  const counts = punchCounts(items, today), mine = live(items);
  return {
    lines: [{ label: 'Pre-punch', open: counts.prePunchOpen, finished: counts.prePunchFinished }, { label: 'Punch', open: counts.punchOpen, finished: counts.punchFinished }],
    overdue: counts.overdue, blocking: counts.blocking, passed: mine.filter(row => punchStatus(row) === 'Passed').length, removed: mine.filter(row => punchStatus(row) === 'Removed').length,
  };
}
export interface ReleaseDocumentModel {
  release: Row; type: ReleasePhase; iso: Row; context: ProjectContext; docNo: string; revision: string; engineer?: Row;
  welds: ReleaseWeldLine[]; /** Null while the account cannot read punch items. */ punch: PunchSummary | null; signatureTitles: SignatureTitle[]; reopened: boolean;
}
/**
 * The release document of one release record: the welds of the phase (Prefab: shop welds, Field: field welds) with their
 * final NDT state, and the punch summary of the isometric. The document number and the signature block titles are those
 * stored on the release when it was made (main project's prefix and drawing-number rule); an older release without them
 * takes the current Document settings. Null when the release is unknown, not Prefab or Field, or its isometric is not visible.
 */
export function releaseDocumentModel(rows: Rows, releaseId: string, isoIds: Set<string>, today?: string): ReleaseDocumentModel | null {
  const release = live(rows.releases).find(row => row.id === releaseId);
  if (!release || !(RELEASE_PHASES as readonly string[]).includes(text(release.type)) || !isoIds.has(text(release.isoId))) return null;
  const iso = find(rows, 'isometrics', release.isoId);
  if (!iso) return null;
  const type = release.type as ReleasePhase, context = projectContext(rows, [iso]);
  const weldTypes = live(rows.weld_types);
  const welds = sortWeldLines(live(rows.welds).filter(weld => weld.isoId === iso.id && weldPhase(weld, weldTypes) === PHASE_LOCATION[type]).map(weld => weldLine(weld, rows)))
    .map((line): ReleaseWeldLine => ({ line, ndtPre: weldInspectionState(line.weld, 'NDT PRE', rows), ndt: weldInspectionState(line.weld, 'NDT', rows), pwht: weldInspectionState(line.weld, 'PWHT', rows) }));
  const stored = storedSignatureTitles(release);
  return {
    release, type, iso, context, docNo: text(release.docNo) || releaseDocumentNumber(context.site, iso), revision: currentRevision(rows, iso.id),
    engineer: find(rows, 'qa_engineers', release.engineerId), welds, punch: rows.punchlists ? punchSummary(live(rows.punchlists).filter(row => row.isoId === iso.id), today) : null,
    signatureTitles: stored.length ? stored : signatureTitlesOf(context.site), reopened: release.status === 'Reopened',
  };
}
/**
 * UNVERIFIED. The release records one signature (the releasing QA/QC person's) but the document has six signature blocks and
 * the reference does not say which block it belongs to. It is placed in the "Subcontractor QA/QC" block (the party that
 * did the work), or in the first filled block when that title is not set. Returns the block index, or -1 without blocks.
 */
export function releaseSignatureBlock(titles: SignatureTitle[]): number {
  const index = titles.findIndex(entry => entry.label === 'Subcontractor QA/QC');
  return index >= 0 ? index : titles.length ? 0 : -1;
}
export const RELEASE_COLUMNS = ['Weld no.', 'Type', 'Dia.', 'Welder', 'Weld date', 'NDT (Pre)', 'NDT', 'Pre-HT/PWHT'];
export const releaseRowCells = (entry: ReleaseWeldLine) => [entry.line.weldNo, entry.line.type, entry.line.diameter, entry.line.welder, entry.line.date, entry.ndtPre, entry.ndt, entry.pwht];

// ----- hydrotest request ------------------------------------------------------------------------------------------------------

export interface HydrotestSection { title: string; items: LabelValueItem[] }
export interface HydrotestDocumentModel {
  request: Row; testSystem?: Row; context: ProjectContext; engineer?: Row; sections: HydrotestSection[]; /** The test system's isometrics (empty unless included). */ isometrics: Row[]; includeIsometrics: boolean; plan: string;
}
/**
 * The hydrotest request document: every field of the request in the order and wording of the request form, and the
 * test system's visible isometrics unless the request (or `isometrics=0`) leaves them out. `requestKey` is an id or a record number.
 * Null when the request is unknown, or when its test system has isometrics and none of them is visible in this pilot (or,
 * without isometrics, when its project is not enabled in the pilot: `projectIds`).
 */
export function hydrotestDocumentModel(rows: Rows, requestKey: string, isoIds: Set<string>, include: boolean | null = null, projectIds: Set<string> | null = null): HydrotestDocumentModel | null {
  const request = live(rows.hydrotest_requests).find(row => row.id === requestKey || (text(requestKey) && text(row.recordNo) === text(requestKey)));
  if (!request) return null;
  const testSystem = find(rows, 'test_systems', request.testSystemId);
  const systemIsos = live(rows.isometrics).filter(iso => iso.testSystemId === request.testSystemId && text(iso.testSystemId));
  const visible = systemIsos.filter(iso => isoIds.has(iso.id));
  if (systemIsos.length && !visible.length) return null;
  // A test system without isometrics belongs to a project; that project must be enabled in the pilot.
  if (!systemIsos.length && projectIds && testSystem?.projectId && !projectIds.has(text(testSystem.projectId))) return null;
  const engineer = find(rows, 'qa_engineers', request.engineerId);
  const includeIsometrics = include ?? request.includeIsometrics !== false;
  const context = projectContext(rows, visible.length ? visible : []);
  const project = context.project ?? find(rows, 'projects', testSystem?.projectId);
  const site = context.site ?? find(rows, 'sites', project?.siteId);
  const value = (name: string): string => {
    const field = HYDROTEST_REQUEST_RESOURCE.fields.find(item => item.name === name)!, raw = request[name];
    if (name === 'testSystemId') return text(testSystem?.name);
    if (name === 'engineerId') return engineerLine(engineer);
    if (field.type === 'date') return printDate(raw);
    if (field.type === 'checkbox') return raw === false ? 'No' : 'Yes';
    return text(raw);
  };
  const order: [string, string[]][] = [['Test request', ['testSystemId', 'recordNo', 'engineerId', 'date']]];
  for (const section of ['Equipment', 'Test conditions', 'Result', 'Notes']) order.push([section, HYDROTEST_REQUEST_RESOURCE.fields.filter(field => field.section === section).map(field => field.name)]);
  const sections = order.map(([title, names]) => ({ title, items: names.map(name => ({ label: HYDROTEST_REQUEST_RESOURCE.fields.find(field => field.name === name)!.label, value: value(name) })) })).filter(section => section.items.length);
  return { request, testSystem, context: { ...context, project, site, client: context.client || text(find(rows, 'companies', project?.companyId)?.name) }, engineer, sections, isometrics: includeIsometrics ? visible.sort((a, b) => naturalCompare(text(a.isoNo), text(b.isoNo))) : [], includeIsometrics, plan: text(site?.hydrotestPlan) };
}
export const HYDROTEST_ISO_COLUMNS = ['ISO number', 'Rev.', 'Drawing no.', 'Piping class', 'Test pressure', 'Test medium'];
export const hydrotestIsoCells = (iso: Row, rows: Rows) => [text(iso.isoNo), currentRevision(rows, iso.id), text(iso.drawingNo), text(iso.pipingClass), text(iso.testPressure), text(iso.testMedium)];
