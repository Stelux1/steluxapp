import { basename } from 'node:path';
import type { Application, Request } from 'express';
import { AppError, type Actor, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import type { releaseAccess } from './release-access.ts';
import { actorOf, checkResourcePermission, type AuthRequest } from './auth.ts';
import { checkItpLinkAccess } from './itp-dashboard.ts';
import { scopeRows } from './site-scope.ts';
import { ITP_REVISION_DOCUMENT, ITP_SCOPES, importFromIsometrics, isoWriteErrors, isoXRay, itpDeleteRefusal, itpIsometrics, itpLatest, itpRevisions, linkItp, revisionErrors, unlinkValues, type LinkSlot } from '../shared/itps.ts';
import type { Row } from '../shared/types.ts';
import { inOwnerSite, ownerRows, siteUniqueClash } from '../shared/welder-data.ts';

/**
 * ITPs page actions (Weld Pilot, hosted profile): Add ITP with its first revision PDF, Upload revision, Link ITP /
 * Unlink on the isometric, Import from isometrics; plus the write rules the record routes apply (X Ray % is read-only,
 * the ITP slots follow the scope, a linked ITP cannot be deleted, an edited X-Ray % reaches the linked isometrics).
 */
type Documents = ReturnType<typeof documentStorage>;
interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess>; upload: Documents['upload'] }
type Input = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
const fail = (errors: Record<string, string>) => { if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0], errors); };
const SLOTS: LinkSlot[] = ['any', 'primary', 'secondary'];

/** Isometric record writes (form, bulk edit): X Ray % is not typed, and links follow the slot rule. */
export function checkIsoWrite(store: Store, key: string, input: Input, existing?: Row) {
  if (key !== 'isometrics' || !input || typeof input !== 'object') return;
  const errors = isoWriteErrors(input, existing, store.list('itps', true));
  fail(errors);
  // A link written through the form also takes the ITP's X-Ray %, as Link ITP does.
  const changed = ['itpId', 'itp2Id'].some(name => input[name] !== undefined && str(input[name]) !== str(existing?.[name]));
  if (changed) { const xRay = isoXRay({ ...existing, ...input }, store.list('itps')); if (xRay !== null) input.xRay = xRay; }
}
/** Manual: "If isometrics are still linked, the ITP cannot be deleted." Restoring a deleted ITP is not judged. */
export function assertItpDeletable(store: Store, key: string, id: string) {
  if (key !== 'itps') return;
  const itp = store.get('itps', id, true);
  if (itp._archived) return;
  const refusal = itpDeleteRefusal(itp, store.list('isometrics'));
  if (refusal) throw new AppError(422, refusal);
}
/**
 * Manual: "When X-Ray % changes, linked isometrics are synchronised with the catalog value." Only the isometrics the
 * request reaches (sec1-008): one of another main project or of a project switched off for the pilot is neither read
 * nor changed, and follows at the next save of the ITP by an account that reaches it.
 */
export function syncItpXRay(store: Store, itp: Row, actor: Actor) {
  const itps = store.list('itps');
  for (const iso of itpIsometrics(itp.id, scopeRows('isometrics', store.list('isometrics')))) {
    const xRay = isoXRay(iso, itps);
    if (xRay !== null && xRay !== str(iso.xRay)) store.update('isometrics', iso.id, { xRay }, iso._version, actor);
  }
}

function linkIso(store: Store, iso: Row, itpId: string, slot: LinkSlot, actor: Actor) {
  const itps = store.list('itps', true), itp = itps.find(row => row.id === itpId);
  const result = linkItp(iso, itp, itps, store.list('itp_projects'), slot, itp ? itpLatest(itp, store.list('attachments')).revNo : '');
  if (result.error) throw new AppError(422, result.error, { itpId: result.error });
  const record = store.update('isometrics', iso.id, result.values, iso._version, actor);
  store.audit('isometrics', iso.id, 'updated', `Linked ITP ${str(itp!.number)} to isometric ${store.display('isometrics', record)}`, actor);
  return record;
}

export function registerItpRoutes(app: Application, { store, documents, access, upload }: Dependencies) {
  const user = (req: Request) => (req as unknown as AuthRequest).user;
  const pdfName = (file?: Express.Multer.File) => file ? basename(file.originalname).replace(/[\r\n]/g, '') : '';
  const saveRevision = (itp: Row, revNo: string, comment: string, file: Express.Multer.File, actor: Actor) => {
    const attachment = store.create('attachments', { name: pdfName(file), entityType: 'itps', entityId: itp.id, documentType: ITP_REVISION_DOCUMENT, revNo, mime: file.mimetype, size: file.size, note: comment }, actor);
    documents.save(attachment.id, file);
    return attachment;
  };

  /** Add ITP: the entry with its first revision and PDF, in one transaction. */
  app.post('/api/itps', upload.single('file'), (req, res) => {
    try {
      checkResourcePermission(req, 'itps', 'insert'); checkResourcePermission(req, 'itps', 'import');
      const body = req.body as Input, revNo = str(body.revNo), file = req.file;
      const errors: Record<string, string> = {};
      if (!str(body.number)) errors.number = 'ITP No is required.';
      if (str(body.scope) && !(ITP_SCOPES as readonly string[]).includes(str(body.scope))) errors.scope = 'Choose Shop, Field or Shop+Field.';
      const percent = str(body.ndtPercent) === '' ? null : Number(str(body.ndtPercent).replace(',', '.'));
      if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) errors.ndtPercent = 'X-Ray % must be between 0 and 100.';
      Object.assign(errors, revisionErrors(revNo, file ? { name: pdfName(file) } : undefined));
      fail(errors);
      // The ITP belongs to the main project it is added in; its ITP No is unique there (shared/welder-data.ts → SITE_UNIQUE).
      const siteId = activeSite(req);
      if (siteUniqueClash('itps', { number: str(body.number), siteId }, store.list('itps'), ownerRows('itps', key => store.list(key, true)))) throw new AppError(422, `ITP No ${str(body.number)} already exists in this main project.`, { number: 'This ITP No already exists in this main project.' });
      const actor = actorOf(req);
      const record = store.transaction(() => {
        const itp = store.create('itps', { siteId, number: str(body.number), title: str(body.title), description: str(body.description), scope: str(body.scope) || 'Shop+Field', ndtPercent: percent, revision: revNo, active: true }, actor);
        saveRevision(itp, revNo, str(body.comment), file!, actor);
        return itp;
      });
      res.status(201).json({ record: access.project('itps', record) });
    } catch (error) { documents.discard(req.file); throw error; }
  });

  /** Upload revision: the previous revision stays in the history; the latest becomes active and reaches the linked isometrics. */
  app.post('/api/itps/:id/revisions', upload.single('file'), (req, res) => {
    try {
      const itp = access.record('itps', String(req.params.id));
      checkResourcePermission(req, 'itps', 'edit', itp); checkResourcePermission(req, 'itps', 'import', itp);
      const body = req.body as Input, revNo = str(body.revNo), file = req.file;
      fail(revisionErrors(revNo, file ? { name: pdfName(file) } : undefined, itpRevisions(itp, store.list('attachments'))));
      const actor = actorOf(req);
      const record = store.transaction(() => {
        saveRevision(itp, revNo, str(body.comment), file!, actor);
        // The stored revision follows the latest upload; the store copies it into every linked isometric slot.
        return store.update('itps', itp.id, { revision: revNo }, itp._version, actor);
      });
      res.status(201).json({ record: access.project('itps', record) });
    } catch (error) { documents.discard(req.file); throw error; }
  });

  /** Link ITP on the isometric header: the scope of the chosen ITP decides the slot. */
  app.post('/api/itps/link', (req, res) => {
    const body = (req.body || {}) as Input;
    const iso = access.record('isometrics', str(body.isoId));
    checkResourcePermission(req, 'isometrics', 'edit', iso); checkItpLinkAccess(user(req), 'isometrics', { itpId: str(body.itpId) });
    const slot = SLOTS.includes(str(body.slot) as LinkSlot) ? str(body.slot) as LinkSlot : 'any';
    if (typeof body._version === 'number' && body._version !== iso._version) throw new AppError(409, 'This record changed since you opened it. Refresh and try again.');
    const record = store.transaction(() => linkIso(store, iso, str(body.itpId), slot, actorOf(req)));
    res.json({ record: access.project('isometrics', record) });
  });
  app.post('/api/itps/unlink', (req, res) => {
    const body = (req.body || {}) as Input;
    const iso = access.record('isometrics', str(body.isoId));
    checkResourcePermission(req, 'isometrics', 'edit', iso);
    const slot = Number(body.slot);
    if (slot !== 1 && slot !== 2) throw new AppError(422, 'Choose the ITP slot to unlink.');
    const record = store.update('isometrics', iso.id, unlinkValues(slot), iso._version, actorOf(req));
    res.json({ record: access.project('isometrics', record) });
  });

  /**
   * Import from isometrics: one entry per distinct ITP number found on the isometrics of the open main project, which are
   * then linked to it. The new ITPs belong to that main project; ITPs of other main projects are neither matched nor linked.
   */
  app.post('/api/itps/import-from-isometrics', (req, res) => {
    checkResourcePermission(req, 'itps', 'insert'); checkResourcePermission(req, 'isometrics', 'edit');
    const actor = actorOf(req), siteId = activeSite(req);
    const result = store.transaction(() => {
      // Only the isometrics the request reaches are read and linked (sec1-008), and only those of the open main project.
      const projects = new Set(store.list('projects', true).filter(project => project.siteId === siteId).map(project => project.id));
      const lists = ownerRows('itps', key => store.list(key, true));
      const plan = importFromIsometrics(scopeRows('isometrics', store.list('isometrics')).filter(iso => projects.has(String(iso.projectId))), store.list('itps').filter(itp => inOwnerSite('itps', itp, siteId, lists)));
      const ids = new Map<string, string>();
      for (const entry of plan.create) ids.set(entry.number.toLowerCase(), store.create('itps', { siteId, number: entry.number, scope: entry.scope, ndtPercent: entry.ndtPercent, revision: entry.revision, active: true }, actor).id);
      let linked = 0;
      for (const link of plan.link) {
        const iso = store.get('isometrics', link.isoId);
        if (!canIsoEdit(req, iso)) continue;
        store.update('isometrics', iso.id, { [link.field]: ids.get(link.number.toLowerCase())! }, iso._version, actor); linked++;
      }
      return { created: plan.create.length, linked };
    });
    res.status(201).json(result);
  });
}
/** The main project the request works in: ITPs are added there (an account without one chooses a main project first). */
const activeSite = (req: Request) => { const siteId = str((req as unknown as AuthRequest).user.siteId); if (!siteId) throw new AppError(422, 'Open a main project before adding this record.', { siteId: 'Open a main project first.' }); return siteId; };
const canIsoEdit = (req: Request, iso: Row) => { try { checkResourcePermission(req, 'isometrics', 'edit', iso); return true; } catch { return false; } };
