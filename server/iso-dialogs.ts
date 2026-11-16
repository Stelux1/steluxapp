import { AsyncResource } from 'node:async_hooks';
import { basename } from 'node:path';
import type { Application, Request, RequestHandler } from 'express';
import { AppError, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import type { releaseAccess } from './release-access.ts';
import { actorOf, checkResourcePermission, type AuthRequest } from './auth.ts';
import { canResource } from '../shared/permissions.ts';
import { attachmentDeleteIds, attachmentUploadError, isoAttachmentRows } from '../shared/iso-attachments.ts';
import { auditEntities } from '../shared/iso-audit.ts';
import type { Row } from '../shared/types.ts';

/**
 * The dialogs of the isometric page's Options menu (hosted profile): Attachments (several PDFs under one report type,
 * delete of the ticked ones) and the Audit trail of the isometric with its welds. Every route checks the account's
 * own rights on the records it touches; the audit trail never returns a record the account cannot read.
 */
type Documents = ReturnType<typeof documentStorage>;
interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess> }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

export function registerIsoDialogRoutes(app: Application, { store, documents, access }: Dependencies) {
  const user = (req: Request) => (req as unknown as AuthRequest).user;
  // The upload finishes on the request stream, outside the request's async context: continue in the context it was entered in.
  const many = documents.uploadMany.array('files', 20);
  const upload: RequestHandler = (req, res, next) => many(req, res, AsyncResource.bind(next));

  /** Audit trail: the isometric's own changes and its welds' (the ones this account may read), newest first; `weldId` narrows it to one weld. */
  app.get('/api/isometrics/:id/audit', (req, res) => {
    const iso = access.record('isometrics', String(req.params.id));
    checkResourcePermission(req, 'isometrics', 'show', iso);
    const account = user(req);
    // Welds count only inside the account's own read rights on them (profile right, project site, delivered scope).
    const readable = canResource(account, 'welds') ? store.list('welds', true).filter(weld => weld.isoId === iso.id && access.visible(account, 'welds', weld)) : [];
    const { entities, error } = auditEntities(iso.id, readable, text(req.query.weldId) === '0' ? '' : text(req.query.weldId));
    if (error) throw new AppError(404, error);
    const before = req.query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(req.query.before);
    const history = store.historyOfMany(entities, before);
    const events = history.events.map(event => access.audit(account, event)).filter((event): event is NonNullable<typeof event> => Boolean(event));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ events, nextCursor: history.nextCursor });
  });

  /** Upload: one or more PDFs, stored with the chosen attachment name (the report type) as their document type. */
  app.post('/api/isometrics/:id/attachments', upload, (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const iso = access.record('isometrics', String(req.params.id));
      checkResourcePermission(req, 'isometrics', 'import', iso);
      const names = store.list('attachment_names');
      const names2 = files.map(file => ({ name: basename(file.originalname).replace(/[\r\n]/g, '') }));
      const problem = attachmentUploadError(req.body?.reportNo, names, names2);
      if (problem) throw new AppError(422, problem, { reportNo: problem });
      const reportType = names.find(row => row.id === text(req.body.reportNo))!;
      const actor = actorOf(req);
      const records = store.transaction(() => files.map((file, index) => {
        const record = store.create('attachments', { name: names2[index].name, entityType: 'isometrics', entityId: iso.id, documentType: String(reportType.name), mime: file.mimetype, size: file.size, note: '' }, actor);
        documents.save(record.id, file);
        return record;
      }));
      res.status(201).json({ records, count: records.length });
    } catch (error) { files.forEach(file => documents.discard(file)); throw error; }
  });

  /** Delete the ticked attachments (archived, as every delete of the application); nothing ticked is refused with "Check for delete". */
  app.post('/api/isometrics/:id/attachments/delete', (req, res) => {
    const iso = access.record('isometrics', String(req.params.id));
    checkResourcePermission(req, 'isometrics', 'import', iso);
    const { ids, error } = attachmentDeleteIds(req.body?.ids);
    if (error) throw new AppError(422, error);
    const listed = new Map(isoAttachmentRows(store.list('attachments'), iso.id, store.list('attachment_names', true)).map(file => [file.id, file]));
    const files = ids.map(id => listed.get(id));
    if (files.some(file => !file)) throw new AppError(404, 'This resource could not be found.');
    const actor = actorOf(req);
    store.transaction(() => { for (const file of files as Row[]) store.archive('attachments', file.id, file._version, actor); });
    res.json({ deleted: ids.length });
  });
}
