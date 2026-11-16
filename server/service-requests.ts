import { closeSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import type { Application, Request, Response } from 'express';
import { AppError, type Actor, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import type { releaseAccess } from './release-access.ts';
import { actorOf, checkResourcePermission, type AuthRequest } from './auth.ts';
import { currentSignature } from './signatures.ts';
import { companyForDocuments } from './pdf/company.ts';
import { currentDrawingFile } from './pdf/iso-book-parts.ts';
import { coatingReleasePdf, serviceRequestPdf, type ReleaseSignatures } from './pdf/service-request.ts';
import { RESOURCES } from '../shared/resources.ts';
import { RESERVED_REQUEST_FILES, SERVICE_REQUEST_FILES, SIGN_ONLINE_FIELDS, drawnSignature, requestOf, serviceRequestDocumentData, serviceRequestFileBase, signOffComplete, siteNumber, type ArchiveRequest } from '../shared/mto-logistics.ts';
import type { Row } from '../shared/types.ts';

/**
 * Documents and signing of spool service requests (MTO Pilot → Logistic → Request archive), hosted profile:
 *  - on Confirm of a Service request the ServiceRequest and CoatingRelease PDFs are stored as attachments of the request's
 *    first record (`storeServiceRequestDocuments`, called by the action route after its transaction);
 *  - GET  /api/service-requests/:id/document/:kind   Print (service-request), Print (Coating release) (coating-release) and
 *    Download / Signed PDF (signed): the stored file, or for the two generated ones a fresh build when none is stored;
 *  - GET  /api/service-requests/saved-signature/:kind the signed-in account's OWN saved signature or initials (Sign online);
 *  - POST /api/service-requests/:id/sign             Sign & save PDF: the three signatures go into the Release note footer;
 *  - POST /api/service-requests/:id/upload           Upload signed doc (a scanned signed PDF).
 * A signed request (either way) is read-only: signing or uploading again is refused, and its files cannot be replaced or archived.
 * The server decides every signature image: the Contractor / Supplier's saved signature or initials are read from the
 * signed-in account itself, never from the request; drawn ones must be PNG images. Signing never moves a spool.
 */
type Documents = ReturnType<typeof documentStorage>;
interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess>; upload: Documents['upload']; publicOrigin?: string }

const KINDS: Record<string, 'serviceRequest' | 'coatingRelease' | 'signed'> = { 'service-request': 'serviceRequest', 'coating-release': 'coatingRelease', signed: 'signed' };
const SUFFIX = { serviceRequest: 'ServiceRequest', coatingRelease: 'CoatingRelease', signed: 'CoatingRelease-signed', uploaded: 'Signed' } as const;
/** Every record a request document reads, archived ones included (the server builds the documents itself). */
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.filter(resource => ['service_requests', 'spools', 'isometrics', 'projects', 'sites', 'service_companies', 'iso_materials', 'attachments', 'revisions'].includes(resource.key)).map(resource => [resource.key, store.list(resource.key, true)])) as Record<string, Row[]>;
/** What the QR code of a request holds: a link to it in the Request archive, or its id when the public address is unknown. */
export const requestQr = (origin: string | undefined, id: string) => origin ? `${origin.replace(/\/$/, '')}/mto/materials/service_requests?request_id=${encodeURIComponent(id)}` : `request_id=${id}`;

function spoolRequest(store: Store, id: string): { rows: Record<string, Row[]>; request: ArchiveRequest } {
  const rows = rowsOf(store); const request = requestOf(rows, id);
  if (!request || request.kind !== 'Spool') throw new AppError(404, 'This service request could not be found.');
  return { rows, request };
}
const fileBase = (rows: Record<string, Row[]>, request: ArchiveRequest) => serviceRequestFileBase(request.date, siteNumber(rows.sites || [], request.siteId), request.number);

/** Both documents of a request (unsigned). The isometric drawings are appended to the Service request when they were asked for. */
export async function buildServiceRequestDocuments(store: Store, documents: Documents, rows: Record<string, Row[]>, request: ArchiveRequest, now: Date, origin?: string) {
  const model = serviceRequestDocumentData(rows, request); const company = companyForDocuments(store, documents); const qr = requestQr(origin, request.headId);
  const drawings = model.includeDrawings ? model.groups.flatMap(group => group.isoIds).flatMap(isoId => {
    const iso = (rows.isometrics || []).find(row => row.id === isoId); const file = iso && currentDrawingFile(rows, iso, 'ISO'); const bytes = file && documents.read(file.id);
    return file && bytes ? [{ name: String(file.name), bytes }] : [];
  }) : [];
  const base = fileBase(rows, request);
  return {
    serviceRequest: { bytes: (await serviceRequestPdf({ model, company, generatedAt: now, qr, drawings })).bytes, name: `${base}-${SUFFIX.serviceRequest}.pdf` },
    coatingRelease: { bytes: (await coatingReleasePdf({ model, company, generatedAt: now, qr })).bytes, name: `${base}-${SUFFIX.coatingRelease}.pdf` },
  };
}

/** Confirm of a Service request: the ServiceRequest and CoatingRelease PDFs are stored on the request (once). */
export async function storeServiceRequestDocuments(store: Store, documents: Documents, records: Row[], actor: Actor, origin?: string) {
  const id = records[0]?.id; if (!id) return;
  const { rows, request } = spoolRequest(store, id);
  if (request.files.serviceRequest && request.files.coatingRelease) return;
  const built = await buildServiceRequestDocuments(store, documents, rows, request, new Date(), origin);
  store.transaction(() => {
    for (const kind of ['serviceRequest', 'coatingRelease'] as const) {
      if (request.files[kind]) continue;
      const file = built[kind];
      const row = store.create('attachments', { name: file.name, entityType: 'service_requests', entityId: request.headId, documentType: SERVICE_REQUEST_FILES[kind], mime: 'application/pdf', size: file.bytes.length, note: '' }, actor);
      documents.saveBytes(row.id, file.bytes);
    }
  });
}

/** The generic file route may not write the files only the server makes (the generated and the signed documents). */
export function assertRequestFileUpload(entityType: string, documentType: unknown) {
  if (entityType === 'service_requests' && RESERVED_REQUEST_FILES.includes(String(documentType ?? ''))) throw new AppError(422, 'Use Upload in the Request archive to attach a signed document.');
}
/** The documents of a service request stay: they cannot be archived. */
export function assertRequestFileKept(store: Store, key: string, id: string) {
  if (key !== 'attachments') return;
  const file = store.get('attachments', id, true);
  if (file.entityType === 'service_requests' && RESERVED_REQUEST_FILES.includes(String(file.documentType))) throw new AppError(422, 'The documents of a service request cannot be deleted.');
}

function sendPdf(res: Response, name: string, bytes: Uint8Array) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name.replace(/[^A-Za-z0-9._-]/g, '-')}"`); res.setHeader('Content-Length', String(bytes.length));
  res.end(Buffer.from(bytes));
}
const head = (file: Express.Multer.File, length = 5) => {
  if (file.buffer) return file.buffer.subarray(0, length);
  const fd = openSync(file.path, 'r'); try { const bytes = Buffer.alloc(length); return bytes.subarray(0, readSync(fd, bytes, 0, length, 0)); } finally { closeSync(fd); }
};
/** Upload signed doc: a PDF up to 20 MB whose type, name and first bytes agree. */
export function assertSignedPdf(file: Express.Multer.File | undefined) {
  if (!file) throw new AppError(422, 'Choose the signed PDF.', { file: 'Choose the signed PDF.' });
  if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(basename(file.originalname)) || Buffer.from(head(file)).toString('latin1') !== '%PDF-') throw new AppError(422, 'Choose a PDF file for the signed document.', { file: 'Choose a PDF file.' });
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const SAVED_KIND = { Signature: 'Full signature', Initials: 'Short signature' } as const;

export function registerServiceRequestRoutes(app: Application, { store, documents, access, upload, publicOrigin }: Dependencies) {
  /** The request of a record the account may see, after the right asked for (print, edit = sign, import = upload). */
  const reach = (req: Request, verb: 'print' | 'edit' | 'import') => {
    const record = access.record('service_requests', String(req.params.id));
    checkResourcePermission(req, 'service_requests', verb, record);
    return spoolRequest(store, record.id);
  };
  const origin = (req: Request) => publicOrigin || `${req.protocol}://${req.get('host')}`;

  app.get('/api/service-requests/saved-signature/:kind', (req, res) => {
    const kind = SAVED_KIND[String(req.params.kind) as keyof typeof SAVED_KIND]; if (!kind) throw new AppError(404, 'This signature does not exist.');
    checkResourcePermission(req, 'service_requests', 'edit');
    const saved = currentSignature(store, documents, (req as unknown as AuthRequest).user.id, kind);
    if (!saved) throw new AppError(404, 'You have no saved signature of this kind.');
    res.setHeader('Cache-Control', 'no-store'); res.type(String(saved.file.mime || 'image/png')).send(saved.content);
  });

  app.get('/api/service-requests/:id/document/:kind', async (req, res) => {
    const kind = KINDS[String(req.params.kind)]; if (!kind) throw new AppError(404, 'This document does not exist.');
    const { rows, request } = reach(req, 'print');
    const stored = request.files[kind]; const bytes = stored && documents.read(stored.id);
    if (stored && bytes) return sendPdf(res, String(stored.name), bytes);
    if (kind === 'signed') throw new AppError(404, 'No signed document is stored for this request.');
    // A request made before its documents were stored (sample data, another profile) prints a fresh build.
    const built = await buildServiceRequestDocuments(store, documents, rows, request, new Date(), origin(req));
    sendPdf(res, built[kind].name, built[kind].bytes);
  });

  app.post('/api/service-requests/:id/sign', async (req, res) => {
    const { rows, request } = reach(req, 'edit');
    const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>;
    if (Object.keys(body).some(name => !SIGN_ONLINE_FIELDS.includes(name))) throw new AppError(404, 'This resource could not be found.');
    if (request.signOff) throw new AppError(409, 'This service request is already signed.');
    const user = (req as unknown as AuthRequest).user; const method = text(body.contractorMethod) || 'Draw';
    const saved = { Signature: currentSignature(store, documents, user.id, SAVED_KIND.Signature), Initials: currentSignature(store, documents, user.id, SAVED_KIND.Initials) };
    const errors = signOffComplete(body, { Signature: Boolean(saved.Signature), Initials: Boolean(saved.Initials) });
    const images = { contractor: method === 'Draw' ? drawnSignature(body.contractorSignature) : saved[method as keyof typeof saved]?.content ?? null, client: drawnSignature(body.clientSignature), nobo: drawnSignature(body.noboSignature) };
    for (const [key, image] of Object.entries(images)) if (!image && !errors[`${key}Signature`] && (key !== 'contractor' || method === 'Draw')) errors[`${key}Signature`] = 'Draw the signature again.';
    if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0], errors);
    const values = { contractorName: text(body.contractorName), contractorDate: text(body.contractorDate), clientName: text(body.clientName), clientDate: text(body.clientDate), noboName: text(body.noboName), noboDate: text(body.noboDate) };
    const note = body.note === undefined ? request.note : text(body.note);
    const signatures: ReleaseSignatures = { contractor: { name: values.contractorName, date: values.contractorDate, image: images.contractor }, client: { name: values.clientName, date: values.clientDate, image: images.client }, nobo: { name: values.noboName, date: values.noboDate, image: images.nobo } };
    const model = serviceRequestDocumentData(rows, { ...request, note });
    const { bytes } = await coatingReleasePdf({ model, company: companyForDocuments(store, documents), generatedAt: new Date(), qr: requestQr(origin(req), request.headId), signatures });
    const actor = actorOf(req); const signedAt = new Date().toISOString();
    store.transaction(() => {
      // Read again inside the transaction: a second Sign & save sent at the same time is refused, not stored twice.
      if (spoolRequest(store, request.headId).request.signOff) throw new AppError(409, 'This service request is already signed.');
      for (const id of request.ids) { const row = store.get('service_requests', id); store.update('service_requests', id, { ...values, note, signedAt, signedBy: actor.name, signedVia: 'Online' }, row._version, actor); }
      const file = store.create('attachments', { name: `${fileBase(rows, request)}-${SUFFIX.signed}.pdf`, entityType: 'service_requests', entityId: request.headId, documentType: SERVICE_REQUEST_FILES.signed, mime: 'application/pdf', size: bytes.length, note: '' }, actor);
      documents.saveBytes(file.id, bytes);
    });
    res.status(201).json({ request: spoolRequest(store, request.headId).request });
  });

  app.post('/api/service-requests/:id/upload', upload.single('file'), (req, res) => {
    try {
      const { rows, request } = reach(req, 'import');
      if (request.signOff) throw new AppError(409, 'This service request is already signed.');
      assertSignedPdf(req.file);
      const actor = actorOf(req); const signedAt = new Date().toISOString();
      store.transaction(() => {
        if (spoolRequest(store, request.headId).request.signOff) throw new AppError(409, 'This service request is already signed.');
        const file = store.create('attachments', { name: `${fileBase(rows, request)}-${SUFFIX.uploaded}.pdf`, entityType: 'service_requests', entityId: request.headId, documentType: SERVICE_REQUEST_FILES.uploaded, mime: 'application/pdf', size: req.file!.size, note: '' }, actor);
        documents.save(file.id, req.file!);
        for (const id of request.ids) { const row = store.get('service_requests', id); store.update('service_requests', id, { signedAt, signedBy: actor.name, signedVia: 'Upload' }, row._version, actor); }
      });
      res.status(201).json({ request: spoolRequest(store, request.headId).request });
    } catch (error) { documents.discard(req.file); throw error; }
  });
}
