import type { Store } from '../store.ts';
import { AppError } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import { currentSignature } from '../signatures.ts';
import { companyForDocuments } from './company.ts';
import { weldCardsDocument } from './weld-cards.ts';
import { weldLabelsDocument } from './weld-labels.ts';
import { mtoReportDocument } from './mto-report.ts';
import { certificationIndexDocument } from './certification-index.ts';
import { lislPdf, type LislVariant } from './lisl.ts';
import { lislGuPdf, ownerLislResult, type OwnerFormInput } from './lisl-gu.ts';
import { lislMvPdf } from './lisl-mv.ts';
import { lislGuRevPdf } from './lisl-gu-rev.ts';
import { issPdf } from './lisl-iss.ts';
import { wqPdf, type WqVersion } from './lisl-wq.ts';
import { issModel, wqModel } from '../../shared/pdf-lisl-iss-wq.ts';
import { OPERATIONAL_DOCUMENTS } from './operational-documents.ts';
import { DEFAULT_LISL_OPTIONS, LISL_TYPES, lislModel, type LislOptions, type LislType } from '../../shared/pdf-lisl.ts';
import type { Row, User } from '../../shared/types.ts';
import { canReport, canResource } from '../../shared/permissions.ts';
import { weldersSummaryDocument } from './welders-summary.ts';

/**
 * Everything a document definition may use. `rows` are the records the account may read (already checked
 * against its permissions and the current pilot); `iso` is a readable isometric of the current pilot.
 */
export interface PdfRequest {
  store: Store; documents: ReturnType<typeof documentStorage>;
  user: User; iso: Row; rows: Record<string, Row[]>;
  query: Record<string, string>; now: Date;
  /** Public origin of the app (for QR codes that point to a page of it). */
  origin?: string;
  /** The configured public origin (`STELUX_PUBLIC_URL`), when there is one; QR codes use it to make absolute links. */
  publicOrigin?: string;
}
/** Request of a document that is not about one isometric but about a project (or all of the main project). */
export interface PdfProjectRequest extends Omit<PdfRequest, 'iso'> {
  /** The chosen project, or null for all projects. */
  project: Row | null;
  /** The main project (site) of the chosen project, or the one given; null when none. Read without account permissions (settings only). */
  site: Row | null;
}
export interface PdfResult {
  bytes: Uint8Array; /** Without extension. */ fileName: string;
  /** Records the document can be attached to (see `attachable`): their type and ids, all readable by the account. */
  attachTo?: { entityType: string; ids: string[] };
}
/**
 * A downloadable document. `report` is the report key whose access rules apply (`canReport(user, report, 'export')`);
 * another agent adds a document by appending one entry to PDF_DOCUMENTS.
 */
export interface PdfDocumentDefinition {
  key: string; title: string; report: string;
  scope?: 'isometric';
  /** The ISO Book part this document fills (e.g. `pick-lists`); without it the book matches the document by its key. */
  bookPart?: string;
  build(request: PdfRequest): Promise<PdfResult>;
}
/**
 * What a document of its own record (a request, a release, a pick list, a filtered list) may use: the records the account
 * may read, the isometrics and projects enabled in the current pilot, and the query. Every record a document prints must
 * trace back to `isoIds` (or, for project-related records, `projectIds`).
 */
export interface PdfScopedRequest {
  store: Store; documents: ReturnType<typeof documentStorage>; user: User;
  rows: Record<string, Row[]>; query: Record<string, string>; now: Date;
  isometrics: Row[]; isoIds: Set<string>; projectIds: Set<string>;
  /** Public origin of the app (for QR codes), as in `PdfRequest`. */
  origin?: string; publicOrigin?: string;
}
/** A document that is not about one isometric from the query (`GET /api/pdf/:key?…` without `isoId`). `attachable`: `POST` also stores the file on `attachTo`. */
export interface PdfScopedDefinition {
  key: string; title: string; report: string; scope: 'scoped'; attachable?: { documentType: string };
  /** The ISO Book part this document fills; without it the book matches the document by its key. */
  bookPart?: string;
  /**
   * The documents of this kind that belong in one isometric's ISO Book: one query per record (a request number, a
   * release, a pick list), with a suffix for the contents. Without it the book builds the document once with `isoId`.
   */
  bookRuns?(rows: Record<string, Row[]>, iso: Row): BookRun[];
  build(request: PdfScopedRequest): Promise<PdfResult>;
}

const flag = (value: string | undefined, fallback: boolean) => value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const safe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

/** Options of the LISL dialog from the query: type=All|Shop|Field, weldRecord=1|0, signature=1|0. */
export function lislOptions(query: Record<string, string>): LislOptions {
  const type = query.type === undefined || query.type === '' ? DEFAULT_LISL_OPTIONS.type : query.type;
  if (!(LISL_TYPES as readonly string[]).includes(type)) throw new AppError(422, 'Choose All, Shop or Field.', { type: 'Choose All, Shop or Field.' });
  return { type: type as LislType, weldRecord: flag(query.weldRecord, DEFAULT_LISL_OPTIONS.weldRecord), signaturePerPage: flag(query.signature, DEFAULT_LISL_OPTIONS.signaturePerPage) };
}

const lisl = (key: string, title: string, variant: LislVariant, suffix: string): PdfDocumentDefinition => ({
  key, title, report: 'lisl',
  async build({ store, documents, user, iso, rows, query, now }) {
    const options = lislOptions(query);
    const model = lislModel(rows, iso.id, variant === 'blank' ? 'All' : options.type);
    if (!model) throw new AppError(404, 'This isometric could not be found.');
    const signature = options.signaturePerPage ? currentSignature(store, documents, user.id, 'Short signature') : null;
    const { bytes } = await lislPdf({ model, options, variant, company: companyForDocuments(store, documents), signature: signature && { content: signature.content, name: signature.name, nameUnder: signature.nameUnder }, generatedAt: now });
    return { bytes, fileName: `${isoDate(now)}-${safe(model.project?.internnumber, 'project')}-LISL${suffix}` };
  },
});

/** The owner-specific LISL forms: same access and dialog options as the base LISL, built by `ownerLislResult`. */
const ownerLisl = (key: string, title: string, suffix: string, render: (input: OwnerFormInput) => Promise<{ bytes: Uint8Array }>): PdfDocumentDefinition => ({
  key, title, report: 'lisl', build: request => ownerLislResult(request, lislOptions(request.query), suffix, render),
});

/** Owner-specific LISL forms: no dialog options; the owner texts come from the main project's Document settings. */
const lislIss: PdfDocumentDefinition = {
  key: 'lisl-iss', title: 'LISL Report [ISS]', report: 'lisl',
  async build({ store, documents, iso, rows, now }) {
    const company = companyForDocuments(store, documents), model = issModel(rows, iso.id, company?.company.name ?? '');
    if (!model) throw new AppError(404, 'This isometric could not be found.');
    const { bytes } = await issPdf({ model, company, generatedAt: now });
    return { bytes, fileName: `${isoDate(now)}-${safe(model.base.project?.internnumber, 'project')}-LISL-ISS` };
  },
};
const lislWq = (key: string, title: string, version: WqVersion, suffix: string): PdfDocumentDefinition => ({
  key, title, report: 'lisl',
  async build({ store, documents, iso, rows, now }) {
    const model = wqModel(rows, iso.id);
    if (!model) throw new AppError(404, 'This isometric could not be found.');
    const { bytes } = await wqPdf({ model, version, company: companyForDocuments(store, documents), generatedAt: now });
    return { bytes, fileName: `${isoDate(now)}-${safe(model.base.project?.internnumber, 'project')}-LISL-${suffix}` };
  },
});

/**
 * A downloadable document of a project: `GET /api/pdf/<key>?projectId=…&siteId=…` (both optional). `resource` is the
 * resource whose read permission gives access, inside the pilot of the request.
 */
export interface PdfProjectDocumentDefinition {
  key: string; title: string; scope: 'project'; resource: string;
  /** The ISO Book part this document fills; the book builds it for the isometric's project. */
  bookPart?: string;
  build(request: PdfProjectRequest): Promise<PdfResult>;
}

export type AnyPdfDefinition = PdfDocumentDefinition | PdfScopedDefinition | PdfProjectDocumentDefinition;
/** One build of a document inside an ISO Book. */
export interface BookRun { suffix: string; query: Record<string, string> }

/** The access rule of a document: the read right of its resource (project documents), else its report's export right. */
export const canDocument = (user: User, definition: AnyPdfDefinition) =>
  definition.scope === 'project' ? canResource(user, definition.resource, 'show') : canReport(user, definition.report, 'export');

export const PDF_DOCUMENTS: AnyPdfDefinition[] = [
  lisl('lisl', 'LISL Report', 'a4', ''),
  lisl('lisl-a3', 'LISL Report (A3)', 'a3', '-A3'),
  lisl('lisl-blank', 'Blank LISL template', 'blank', '-template'),
  ownerLisl('lisl-gu', 'LISL Report [GU]', '-GU', lislGuPdf),
  ownerLisl('lisl-mv', 'LISL Report [MV]', '-MV', lislMvPdf),
  ownerLisl('lisl-gu-rev2', 'LISL Report [GU Rev 2]', '-GU-Rev2', input => lislGuRevPdf(input, 2)),
  ownerLisl('lisl-gu-rev3', 'LISL Report [GU Rev 3]', '-GU-Rev3', input => lislGuRevPdf(input, 3)),
  lislIss,
  lislWq('lisl-wq', 'LISL Report [WQ]', 'v1', 'WQ'),
  lislWq('lisl-wq2', 'LISL Report [WQ ver 2]', 'v2', 'WQ-ver2'),
  weldCardsDocument, weldLabelsDocument, mtoReportDocument, certificationIndexDocument,
  ...OPERATIONAL_DOCUMENTS,
  weldersSummaryDocument,
];
