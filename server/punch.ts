import { closeSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import type { Application, Request } from 'express';
import { AppError, validDate, today, type Actor, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import { assertSignatureImage } from './signatures.ts';
import { actorOf, checkActionPermission, type AuthRequest } from './auth.ts';
import type { releaseAccess } from './release-access.ts';
import { isSiteRefusal } from './site-scope.ts';
import { isAdministrator } from '../shared/permissions.ts';
import { SIGNATURE_KINDS } from '../shared/signatures.ts';
import {
  PASSED_REFUSAL, PUNCH_FILE_LIMIT, PUNCH_FILE_TYPES, PUNCH_MESSAGES, PUNCH_SIGN_OFF_DOCUMENT, TRANSITION_REFUSALS, canTransition, punchAddRefusal, punchApproved, punchFinishErrors,
  punchPhaseStatus, type PunchTransition,
} from '../shared/punch.ts';
import type { Row, User } from '../shared/types.ts';

type Input = Record<string, unknown>;
type Documents = ReturnType<typeof documentStorage>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** The item as the pages show it: Passed is derived over the items of its isometric (shared/punch.ts). */
export const punchView = (store: Store, row: Row): Row => ({ ...row, status: punchPhaseStatus(row, store.list('punchlists')) });
function refuse(row: Row, transition: PunchTransition): never {
  throw new AppError(422, row.status === 'Passed' ? PASSED_REFUSAL : TRANSITION_REFUSALS[transition]);
}
function allowed(store: Store, row: Row, transition: PunchTransition) {
  const view = punchView(store, row);
  if (!canTransition(view, transition)) refuse(view, transition);
}
const dateOf = (data: Input) => data.date ? validDate(data.date) : today();

/** The finish fields written on every signed-off item: Finished, the sign-off, and the client approval (manual §24). */
function finishChanges(store: Store, data: Input, actor: Actor, attachmentId: string, row: Row): Input {
  const date = dateOf(data), type = str(data.signerType), client = type === 'Client';
  const inspector = type === 'Inspection' && str(data.inspectorId) ? store.get('welders', data.inspectorId) : undefined;
  const approved = punchApproved(row);
  return {
    status: 'Finished', finishedAt: date, finishedBy: actor.name, signerType: type,
    signName: client ? str(data.clientName) : type === 'User' ? actor.name : '', signCompany: client ? str(data.company) : '', signFunction: client ? str(data.function) : '',
    signInspector: inspector ? store.display('welders', inspector) : '', signInspectorId: inspector?.id ?? '', signRemarks: str(data.note), signMethod: str(data.signMethod), signAttachmentId: attachmentId,
    clientApproved: true, approvedAt: approved ? row.approvedAt ?? date : date, approvedBy: approved ? row.approvedBy ?? actor.name : actor.name,
  };
}
function audited(store: Store, row: Row, changes: Input, event: string, summary: string, actor: Actor) {
  const record = store.update('punchlists', row.id, changes, row._version, actor);
  store.audit('punchlists', row.id, event, `${summary} ${store.display('punchlists', record)}`, actor);
  return record;
}

/**
 * The actions of a punch item, each in the caller's transaction: Open -> Finished with the sign-off (and the client
 * approval), Mark as Client approved, Promote to Punch (open pre-punch items) and Remove. Every change is one audited
 * update of the item. Approval and promotion are audited as updates: the hosted activity log shows the known events only
 * (server/release-access.ts).
 */
export function runPunchAction(store: Store, key: string, data: Input, actor: Actor): { resource: string; record: Row; records?: undefined } {
  const row = store.get('punchlists', data.punchId);
  if (key === 'punch-finish') {
    allowed(store, row, 'finish');
    const attachment = str(data.attachmentId) ? store.get('attachments', data.attachmentId) : undefined;
    const valid = attachment && attachment.entityType === 'punchlists' && attachment.entityId === row.id && attachment.documentType === PUNCH_SIGN_OFF_DOCUMENT;
    const errors = punchFinishErrors({ ...data, date: dateOf(data), signMethod: data.signMethod === 'Saved signature' ? 'Drawn' : data.signMethod }, Boolean(valid));
    if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0]);
    return { resource: 'punchlists', record: audited(store, row, finishChanges(store, data, actor, attachment!.id, row), 'finished', 'Finished punch item', actor) };
  }
  if (key === 'punch-approve') {
    allowed(store, row, 'approve');
    return { resource: 'punchlists', record: audited(store, row, { clientApproved: true, approvedAt: today(), approvedBy: actor.name }, 'updated', 'Client approved punch item', actor) };
  }
  if (key === 'punch-promote') {
    allowed(store, row, 'promote');
    return { resource: 'punchlists', record: audited(store, row, { punchType: 'Punch' }, 'updated', 'Promoted to Punch punch item', actor) };
  }
  if (key === 'punch-remove') {
    allowed(store, row, 'remove');
    return { resource: 'punchlists', record: audited(store, row, { status: 'Removed', removedAt: dateOf(data), removedBy: actor.name, removeReason: str(data.note) }, 'removed', 'Removed punch item', actor) };
  }
  throw new AppError(404, 'This action does not exist.');
}

/** First bytes of an uploaded file, from memory (database storage) or from its temporary file (disk storage). */
function head(file: Express.Multer.File, length = 8): Uint8Array {
  if (file.buffer) return file.buffer.subarray(0, length);
  const fd = openSync(file.path, 'r');
  try { const bytes = Buffer.alloc(length); const read = readSync(fd, bytes, 0, length, 0); return bytes.subarray(0, read); }
  finally { closeSync(fd); }
}
/** The sign-off file: a drawn signature (PNG) or a signed PDF, whose declared type, name and first bytes agree. */
export function assertSignOffFile(file: Express.Multer.File, method: string) {
  if (method === 'Drawn') return assertSignatureImage(file);
  const name = basename(file.originalname);
  if (file.size > 10 * 1024 * 1024) throw new AppError(422, 'The signed PDF can be at most 10 MB.');
  const bytes = head(file, 5);
  if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(name) || Buffer.from(bytes).toString('latin1') !== '%PDF-') throw new AppError(422, 'Choose a PDF file for the signed sign-off.');
}

/** Photos and documents of a punch item: at most two, none on a passed item, and never a forged sign-off. */
export function assertPunchFileAllowed(store: Store, item: Row, documentType: unknown) {
  if (punchView(store, item).status === 'Passed') throw new AppError(422, 'A passed punch item cannot be edited.');
  const kind = str(documentType) || PUNCH_FILE_TYPES[1];
  if (!PUNCH_FILE_TYPES.includes(kind)) throw new AppError(422, 'Choose a punch photo or a punch document.');
  const held = store.list('attachments').filter(row => row.entityType === 'punchlists' && row.entityId === item.id && row.documentType !== PUNCH_SIGN_OFF_DOCUMENT).length;
  if (held >= PUNCH_FILE_LIMIT) throw new AppError(422, `A punch item holds up to ${PUNCH_FILE_LIMIT} photos or documents.`);
}

/** A new item on an isometric whose Punch phase is Passed is refused (manual §24); a full access account may still add a Punch item. */
export function assertPunchAddAllowed(store: Store, data: Input, user: User) {
  // The isometric is read first, so an isometric outside the account's project sites is refused as such (403).
  if (str(data.isoId)) try { store.get('isometrics', data.isoId); } catch (error) { if (isSiteRefusal(error)) throw error; return; /* missing: reported with the field */ }
  const refusal = punchAddRefusal(data, store.list('punchlists'), isAdministrator(user));
  if (refusal) throw new AppError(422, refusal, { punchType: refusal });
}

/** The newest image of the account's saved full signature (Signatures page), or undefined. */
export function savedSignatureOf(store: Store, userId: string): Row | undefined {
  const record = store.list('signatures').find(row => row.userId === userId && row.kind === SIGNATURE_KINDS[0].kind);
  return record ? store.list('attachments').filter(row => row.entityType === 'signatures' && row.entityId === record.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt))[0] : undefined;
}
/** Ids of a bulk sign-off: `punchIds` as a list or a comma separated text, or the single `punchId`. */
function idsOf(body: Input): string[] {
  const raw = body.punchIds ?? body.punchId;
  const ids = (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map(id => String(id).trim()).filter(Boolean);
  if (!ids.length) throw new AppError(422, PUNCH_MESSAGES.select);
  if (ids.length > 500) throw new AppError(422, 'Sign off at most 500 items at once.');
  return [...new Set(ids)];
}

interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess>; upload: Documents['upload'] }
/**
 * POST /api/punch/:id/finish and POST /api/punch/finish (bulk, `punchIds`): Mark as finished (Sign-off) together with
 * its sign-off file, in one transaction. Every item gets its own copy of the sign-off file; a refused item leaves all
 * items unchanged.
 */
export function registerPunchRoutes(app: Application, { store, documents, access, upload }: Dependencies) {
  const finish = (req: Request, single?: string) => {
    const body = { ...req.body } as Input;
    if (single) { body.punchId = single; delete body.punchIds; }
    access.input('punch-finish', body, true);
    const ids = idsOf(body);
    for (const id of ids) checkActionPermission(req, 'punch-finish', { punchId: id });
    const items = ids.map(id => access.record('punchlists', id));
    for (const item of items) allowed(store, item, 'finish');
    const user = (req as unknown as AuthRequest).user;
    const saved = str(body.signerType) === 'User' ? savedSignatureOf(store, user.id) : undefined;
    const savedBytes = saved ? documents.read(saved.id) : null;
    const method = str(body.signMethod);
    const errors = punchFinishErrors(body, Boolean(req.file), Boolean(savedBytes));
    if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0]);
    if (str(body.inspectorId)) access.record('welders', body.inspectorId);
    if (method !== 'Saved signature') assertSignOffFile(req.file!, method);
    const actor = actorOf(req);
    return store.transaction(() => {
      let first = '';
      const records = items.map(item => {
        const name = method === 'Saved signature' ? str(saved!.name) || 'signature.png' : basename(req.file!.originalname).replace(/[\r\n]/g, '');
        const mime = method === 'Saved signature' ? str(saved!.mime) || 'image/png' : req.file!.mimetype;
        const size = method === 'Saved signature' ? savedBytes!.length : req.file!.size;
        const attachment = store.create('attachments', { name, entityType: 'punchlists', entityId: item.id, documentType: PUNCH_SIGN_OFF_DOCUMENT, mime, size, note: '' }, actor);
        if (method === 'Saved signature') documents.saveBytes(attachment.id, savedBytes!);
        else if (!first) documents.save(attachment.id, req.file!);
        else { const bytes = documents.read(first); if (!bytes) throw new AppError(500, 'The sign-off file could not be copied.'); documents.saveBytes(attachment.id, bytes); }
        if (!first) first = attachment.id;
        return runPunchAction(store, 'punch-finish', { ...body, punchId: item.id, attachmentId: attachment.id }, actor).record;
      });
      return { resource: 'punchlists', record: records[0], records };
    });
  };
  const handle = (single: boolean) => (req: Request, res: import('express').Response) => {
    try { res.status(201).json(access.result(finish(req, single ? String(req.params.id) : undefined))); }
    catch (error) { documents.discard(req.file); throw error; }
  };
  app.post('/api/punch/finish', upload.single('file'), handle(false));
  app.post('/api/punch/:id/finish', upload.single('file'), handle(true));
}
