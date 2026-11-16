import { AppError, type Store } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import { currentSignature } from '../signatures.ts';
import { companyForDocuments } from './company.ts';
import type { BookRun, PdfDocumentDefinition, PdfScopedDefinition } from './documents.ts';
import { requestPdf, visualPdf } from './operational-requests.ts';
import { hydrotestPdf, releasePdf } from './operational-release.ts';
import { blankPunchPdf, flangePdf, pickListPdf, punchPdf } from './operational-lists.ts';
import {
  REQUEST_DOCUMENTS, visualSignerId, hydrotestDocumentModel, pdfText as text, releaseDocumentModel, requestDocumentModel, requestDocumentOptions, visualReportModel, type RequestDocumentKind,
} from '../../shared/pdf-documents.ts';
import { flangeReportModel, flangeReportOptions, pickListModel, punchListModel, punchListOptions } from '../../shared/pdf-lists.ts';
import { REQUEST_DOCUMENT } from '../../shared/inspections.ts';
import { pickListReports } from '../../shared/mto-logistics.ts';
import type { Row } from '../../shared/types.ts';

/**
 * The operational documents of the Weld Pilot and the MTO Pilot, as entries of PDF_DOCUMENTS (`documents.ts` appends
 * OPERATIONAL_DOCUMENTS). Each entry names the access key of its family (`shared/pdf-report-keys.ts`); the route checks that
 * key, hands over only records the account may read, and the entry gates every record by the isometrics visible in the pilot.
 *
 *   GET /api/pdf/ndt-request?requestNo=R-00012[&processes=id,id][&note=…][&isometrics=1]
 *   GET /api/pdf/ndt-pre-request?requestNo=…        GET /api/pdf/pwht-request?requestNo=…
 *   GET /api/pdf/visual-report?reportNo=…
 *   GET /api/pdf/prefab-release?releaseId=…         GET /api/pdf/field-release?releaseId=…
 *   GET /api/pdf/hydrotest-request?requestId=…[&isometrics=0]
 *   GET /api/pdf/punch-list?[projectId|isoId|punchType|category|kpi|q|documents=0|1]
 *   GET /api/pdf/punch-list-blank?isoId=…
 *   GET /api/pdf/flange-report?isoId=… | projectId=…[&finished=Yes|No][&q=…]
 *   GET /api/pdf/pick-list?reportNo=…
 * The request documents also answer POST, which additionally attaches the file to the request records as a "Request document".
 */
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const safe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const notFound = (what: string) => new AppError(404, `${what} could not be found.`);
type Documents = ReturnType<typeof documentStorage>;
const projectNumber = (rows: Record<string, Row[]>, iso?: Row, project?: Row) => safe((project ?? rows.projects?.find(row => row.id === iso?.projectId))?.internnumber, 'project');

/** A user's signature image (full, else short) by user id; null when the user has none. Images are the user's own, printed on the documents they sign. */
function signatureOf(store: Store, documents: Documents, userId: string): { content: Buffer; name: string } | null {
  if (!userId) return null;
  try {
    const found = currentSignature(store, documents, userId, 'Full signature') ?? currentSignature(store, documents, userId, 'Short signature');
    return found ? { content: found.content, name: found.name } : null;
  } catch { return null; }
}

/** ISO Book: the welds of one isometric, and one run per distinct value (sorted), each named after it. */
const isoWeldIds = (rows: Record<string, Row[]>, iso: Row) => new Set((rows.welds || []).filter(weld => !weld._archived && weld.isoId === iso.id).map(weld => weld.id));
const runsOf = (values: unknown[], name: string): BookRun[] => [...new Set(values.map(value => text(value)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(value => ({ suffix: ` ${value}`, query: { [name]: value } }));
/** The ISO Book part of each request document (the part also takes the uploaded report files). */
const REQUEST_BOOK_PART: Record<RequestDocumentKind, string> = { 'ndt-request': 'ndt', 'ndt-pre-request': 'ndt-pre', 'pwht-request': 'pwht' };

const requestDefinition = (key: RequestDocumentKind): PdfScopedDefinition => ({
  key, title: REQUEST_DOCUMENTS[key].title, report: 'pdf-ndt-request', scope: 'scoped', attachable: { documentType: REQUEST_DOCUMENT },
  bookPart: REQUEST_BOOK_PART[key],
  bookRuns(rows, iso) {
    const welds = isoWeldIds(rows, iso), types = REQUEST_DOCUMENTS[key].types;
    return runsOf((rows.inspection_requests || []).filter(row => !row._archived && types.includes(text(row.type)) && row.status !== 'Cancelled' && welds.has(text(row.weldId))).map(row => row.number), 'requestNo');
  },
  async build({ store, documents, rows, isoIds, query, now }) {
    const { options, error } = requestDocumentOptions(query);
    if (error) throw new AppError(422, error, { note: error });
    const model = requestDocumentModel(key, rows, query.requestNo ?? '', isoIds, options);
    if (!model) throw notFound('This request');
    const { bytes } = await requestPdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, model.context.isometrics[0], model.context.project)}-${safe(REQUEST_DOCUMENTS[key].title, key)}-${safe(model.requestNo, 'request')}`, attachTo: { entityType: 'inspection_requests', ids: model.requests.map(row => row.id) } };
  },
});

const visualReport: PdfScopedDefinition = {
  key: 'visual-report', title: 'Visual inspection report', report: 'pdf-visual-report', scope: 'scoped', bookPart: 'visual-reports',
  bookRuns(rows, iso) {
    const welds = isoWeldIds(rows, iso);
    return runsOf((rows.inspection_results || []).filter(row => !row._archived && row.type === 'VI' && welds.has(text(row.weldId))).map(row => row.reportNo), 'reportNo');
  },
  async build({ store, documents, rows, isoIds, query, now }) {
    const model = visualReportModel(rows, query.reportNo ?? '', isoIds);
    if (!model) throw notFound('This visual inspection report');
    const signature = signatureOf(store, documents, visualSignerId(model.engineer, store.list('users'), model.resultIds, id => store.recordedBy('inspection_results', id)));
    const { bytes } = await visualPdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows, signature });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, model.context.isometrics[0], model.context.project)}-VI-${safe(model.reportNo, 'report')}` };
  },
};

const releaseDefinition = (type: 'Prefab' | 'Field'): PdfScopedDefinition => ({
  key: `${type.toLowerCase()}-release`, title: `${type} release`, report: 'pdf-release', scope: 'scoped', bookPart: type === 'Prefab' ? 'prefab-release' : 'field-release',
  bookRuns: (rows, iso) => (rows.releases || []).filter(row => !row._archived && row.isoId === iso.id && row.type === type)
    .map(row => ({ suffix: text(row.docNo) ? ` ${text(row.docNo)}` : '', query: { releaseId: row.id } })),
  async build({ store, documents, rows, isoIds, query, now }) {
    const model = releaseDocumentModel(rows, query.releaseId ?? '', isoIds, isoDate(now));
    if (!model) throw notFound('This release');
    if (model.type !== type) throw new AppError(422, `This is a ${model.type.toLowerCase()} release. Use the ${model.type} release document.`);
    const signer = store.list('signatures').find(row => row.id === model.release.signatureId);
    const signature = signer ? signatureOf(store, documents, text(signer.userId)) : null;
    const { bytes } = await releasePdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows, signature });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, model.iso, model.context.project)}-${type}-release-${safe(model.docNo, 'document')}` };
  },
});

const hydrotestRequest: PdfScopedDefinition = {
  key: 'hydrotest-request', title: 'Hydrotest request', report: 'pdf-hydrotest', scope: 'scoped',
  async build({ store, documents, rows, isoIds, projectIds, query, now }) {
    const include = query.isometrics === undefined || query.isometrics === '' ? null : ['1', 'true', 'yes', 'on'].includes(query.isometrics.toLowerCase());
    const model = hydrotestDocumentModel(rows, query.requestId ?? '', isoIds, include, projectIds);
    if (!model) throw notFound('This hydrotest request');
    const { bytes } = await hydrotestPdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, undefined, model.context.project)}-Hydrotest-request-${safe(model.request.recordNo, 'request')}` };
  },
};

const punchList: PdfScopedDefinition = {
  key: 'punch-list', title: 'Punch list', report: 'pdf-punch', scope: 'scoped', bookPart: 'punch-list',
  bookRuns: (rows, iso) => (rows.punchlists || []).some(row => !row._archived && row.isoId === iso.id) ? [{ suffix: '', query: { isoId: iso.id } }] : [],
  async build({ store, documents, rows, isoIds, projectIds, query, now }) {
    const { options, error } = punchListOptions(query);
    if (error) throw new AppError(422, error);
    if (options.isoId && !isoIds.has(options.isoId)) throw notFound('This isometric');
    if (options.projectId && !projectIds.has(options.projectId)) throw notFound('This project');
    const model = punchListModel(rows, options, isoIds, projectIds, isoDate(now));
    const { bytes } = await punchPdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, model.context.isometrics[0], model.context.project)}-Punch-list` };
  },
};

/** Punch list - blank belongs to one isometric, so it uses the isometric path of the route. */
const punchListBlank: PdfDocumentDefinition = {
  key: 'punch-list-blank', title: 'Punch list - blank', report: 'pdf-punch', bookPart: 'punch-list-blank',
  async build({ store, documents, iso, rows, now }) {
    const { bytes } = await blankPunchPdf({ iso, company: companyForDocuments(store, documents), generatedAt: now, rows });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, iso)}-Punch-list-blank-${safe(iso.isoNo, 'iso')}` };
  },
};

const flangeReport: PdfScopedDefinition = {
  key: 'flange-report', title: 'Flange report', report: 'pdf-flanges', scope: 'scoped', bookPart: 'flange-report',
  bookRuns: (rows, iso) => (rows.flanges || []).some(row => !row._archived && row.isoId === iso.id) ? [{ suffix: '', query: { isoId: iso.id } }] : [],
  async build({ store, documents, rows, isoIds, projectIds, query, now }) {
    const { options, error } = flangeReportOptions(query);
    if (error) throw new AppError(422, error);
    if (options.isoId && !isoIds.has(options.isoId)) throw notFound('This isometric');
    if (options.projectId && !projectIds.has(options.projectId)) throw notFound('This project');
    const model = flangeReportModel(rows, options, isoIds);
    const { bytes } = await flangePdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, model.context.isometrics[0], model.context.project)}-Flange-report${model.context.isometrics.length === 1 ? `-${safe(model.context.isometrics[0].isoNo, 'iso')}` : ''}` };
  },
};

const pickList: PdfScopedDefinition = {
  key: 'pick-list', title: 'Pick list', report: 'pdf-picklist', scope: 'scoped', bookPart: 'pick-lists',
  bookRuns: (rows, iso) => runsOf(pickListReports({ ...rows, isometrics: (rows.isometrics || []).filter(row => row.id === iso.id) }).filter(report => report.isoId === iso.id).map(report => report.reportNo), 'reportNo'),
  async build({ store, documents, rows, isoIds, query, now }) {
    const model = pickListModel(rows, query.reportNo ?? '', isoIds);
    if (!model) throw notFound('This pick list');
    const { bytes } = await pickListPdf({ model, company: companyForDocuments(store, documents), generatedAt: now, rows });
    return { bytes, fileName: `${isoDate(now)}-${projectNumber(rows, model.iso, model.context.project)}-Pick-list-${safe(model.report.reportNo, 'report')}` };
  },
};

export const OPERATIONAL_DOCUMENTS: (PdfDocumentDefinition | PdfScopedDefinition)[] = [
  requestDefinition('ndt-request'), requestDefinition('ndt-pre-request'), requestDefinition('pwht-request'), visualReport,
  releaseDefinition('Prefab'), releaseDefinition('Field'), hydrotestRequest, punchList, punchListBlank, flangeReport, pickList,
];
