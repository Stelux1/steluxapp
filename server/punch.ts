import { closeSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import type { Application, Request } from 'express';
import { AppError, validDate, today, type Actor, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import { assertSignatureImage } from './signatures.ts';
import { actorOf, checkActionPermission } from './auth.ts';
import type { releaseAccess } from './release-access.ts';
import { PUNCH_FILE_LIMIT, PUNCH_FILE_TYPES, PUNCH_SIGN_OFF_DOCUMENT, TRANSITION_REFUSALS, canTransition, punchFinishErrors, punchStatus, type PunchTransition } from '../shared/punch.ts';
import type { Row } from '../shared/types.ts';

type Input = Record<string, unknown>;
type Documents = ReturnType<typeof documentStorage>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function refuse(row: Row, transition: PunchTransition): never {
  throw new AppError(422, punchStatus(row) === 'Passed' ? 'A passed punch item cannot be changed.' : TRANSITION_REFUSALS[transition]);
}
const dateOf = (data: Input) => data.date ? validDate(data.date) : today();

/**
 * The status changes of a punch item, each in the caller's transaction: Open -> Finished (with the sign-off),
 * Finished -> Passed, and Open / Finished -> Removed. Every change is one audited update of the item.
 */
export function runPunchAction(store: Store, key: string, data: Input, actor: Actor): { resource: string; record: Row; records?: undefined } {
  const row = store.get('punchlists', data.punchId), date = dateOf(data), note = str(data.note);
  const update = (changes: Input, event: 'finished' | 'passed' | 'removed') => {
    const record = store.update('punchlists', row.id, changes, row._version, actor);
    store.audit('punchlists', row.id, event, `${event[0].toUpperCase()}${event.slice(1)} punch item ${store.display('punchlists', record)}`, actor);
    return { resource: 'punchlists', record };
  };
  if (key === 'punch-finish') {
    if (!canTransition(row, 'finish')) refuse(row, 'finish');
    const attachment = str(data.attachmentId) ? store.get('attachments', data.attachmentId) : undefined;
    const valid = attachment && attachment.entityType === 'punchlists' && attachment.entityId === row.id && attachment.documentType === PUNCH_SIGN_OFF_DOCUMENT;
    const errors = punchFinishErrors({ signerType: data.signerType, clientName: data.clientName, company: data.company, function: data.function, inspector: data.inspector, date, note, signMethod: data.signMethod }, Boolean(valid));
    if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0]);
    const client = data.signerType === 'Client';
    return update({ status: 'Finished', finishedAt: date, finishedBy: actor.name, signerType: data.signerType, signName: client ? str(data.clientName) : '', signCompany: client ? str(data.company) : '', signFunction: str(data.function), signInspector: client ? '' : str(data.inspector), signRemarks: note, signMethod: data.signMethod, signAttachmentId: attachment!.id }, 'finished');
  }
  if (key === 'punch-pass') {
    if (!canTransition(row, 'pass')) refuse(row, 'pass');
    if (row.finishedAt && date < String(row.finishedAt)) throw new AppError(422, 'The passed date cannot be before the finished date.');
    return update({ status: 'Passed', passedAt: date, passedBy: actor.name, passRemarks: note }, 'passed');
  }
  if (key === 'punch-remove') {
    if (!canTransition(row, 'remove')) refuse(row, 'remove');
    return update({ status: 'Removed', removedAt: date, removedBy: actor.name, removeReason: note }, 'removed');
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
  if (punchStatus(item) === 'Passed') throw new AppError(422, 'A passed punch item cannot be edited.');
  const kind = str(documentType) || PUNCH_FILE_TYPES[1];
  if (!PUNCH_FILE_TYPES.includes(kind)) throw new AppError(422, 'Choose a punch photo or a punch document.');
  const held = store.list('attachments').filter(row => row.entityType === 'punchlists' && row.entityId === item.id && row.documentType !== PUNCH_SIGN_OFF_DOCUMENT).length;
  if (held >= PUNCH_FILE_LIMIT) throw new AppError(422, `A punch item holds up to ${PUNCH_FILE_LIMIT} photos or documents.`);
}

interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess>; upload: Documents['upload'] }
/** POST /api/punch/:id/finish: the finish action together with its sign-off file, in one transaction. */
export function registerPunchRoutes(app: Application, { store, documents, access, upload }: Dependencies) {
  app.post('/api/punch/:id/finish', upload.single('file'), (req: Request, res) => {
    try {
      const body = { ...req.body, punchId: String(req.params.id) } as Input;
      access.input('punch-finish', body, true);
      checkActionPermission(req, 'punch-finish', body);
      const item = access.record('punchlists', req.params.id);
      if (!canTransition(item, 'finish')) refuse(item, 'finish');
      const errors = punchFinishErrors({ ...body, note: body.note }, Boolean(req.file));
      if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0]);
      assertSignOffFile(req.file!, String(body.signMethod));
      const actor = actorOf(req);
      const result = store.transaction(() => {
        const name = basename(req.file!.originalname).replace(/[\r\n]/g, '');
        const attachment = store.create('attachments', { name, entityType: 'punchlists', entityId: item.id, documentType: PUNCH_SIGN_OFF_DOCUMENT, mime: req.file!.mimetype, size: req.file!.size, note: '' }, actor);
        documents.save(attachment.id, req.file!);
        return runPunchAction(store, 'punch-finish', { ...body, attachmentId: attachment.id }, actor);
      });
      res.status(201).json(access.result(result));
    } catch (error) { documents.discard(req.file); throw error; }
  });
}
