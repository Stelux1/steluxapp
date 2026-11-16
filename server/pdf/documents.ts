import type { Store } from '../store.ts';
import { AppError } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import { currentSignature } from '../signatures.ts';
import { companyForDocuments } from './company.ts';
import { lislPdf, type LislVariant } from './lisl.ts';
import { OPERATIONAL_DOCUMENTS } from './operational-documents.ts';
import { DEFAULT_LISL_OPTIONS, LISL_TYPES, lislModel, type LislOptions, type LislType } from '../../shared/pdf-lisl.ts';
import type { Row, User } from '../../shared/types.ts';

/**
 * Everything a document definition may use. `rows` are the records the account may read (already checked
 * against its permissions and the current pilot); `iso` is a readable isometric of the current pilot.
 */
export interface PdfRequest {
  store: Store; documents: ReturnType<typeof documentStorage>;
  user: User; iso: Row; rows: Record<string, Row[]>;
  query: Record<string, string>; now: Date;
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
  key: string; title: string; report: string; scope?: 'isometric';
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
}
/** A document that is not about one isometric from the query (`GET /api/pdf/:key?…` without `isoId`). `attachable`: `POST` also stores the file on `attachTo`. */
export interface PdfScopedDefinition {
  key: string; title: string; report: string; scope: 'scoped'; attachable?: { documentType: string };
  build(request: PdfScopedRequest): Promise<PdfResult>;
}
export type AnyPdfDefinition = PdfDocumentDefinition | PdfScopedDefinition;

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

export const PDF_DOCUMENTS: AnyPdfDefinition[] = [
  lisl('lisl', 'LISL Report', 'a4', ''),
  lisl('lisl-a3', 'LISL Report (A3)', 'a3', '-A3'),
  lisl('lisl-blank', 'Blank LISL template', 'blank', '-template'),
  ...OPERATIONAL_DOCUMENTS,
];
