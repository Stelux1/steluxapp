import { once } from 'node:events';
import type { Express, Request, Response } from 'express';
import type { Store } from '../store.ts';
import { AppError } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import type { AuthRequest } from '../auth.ts';
import { checkResourcePermission } from '../auth.ts';
import { allowedSites, isSiteRefusal, offProjects, scopeRows, SiteScope, singleSiteScope, withSiteScope } from '../site-scope.ts';
import type { releaseAccess } from '../release-access.ts';
import { canDocument, PDF_DOCUMENTS } from './documents.ts';
import { bookPlans, partState, type Rows } from './iso-book-parts.ts';
import { appendBook, Budget, collectChunks, createBook, type BookEnvironment, type Chunk, type SkippedFile } from './iso-book.ts';
import { RESOURCES } from '../../shared/resources.ts';
import { canResource, REPORT_RESOURCES } from '../../shared/permissions.ts';
import { bookRequestError, ISO_BOOK_LIMITS, type BookPartInfo, type BookPartsResponse, type BookRequest } from '../../shared/iso-book.ts';
import { projectInPilot } from '../../shared/project-scope.ts';
import { PILOT_KEYS } from '../../shared/release.ts';
import type { Availability, Row, User } from '../../shared/types.ts';

export interface IsoBookRouteDependencies {
  app: Express; store: Store; documents: ReturnType<typeof documentStorage>; availability?: Availability;
  access: ReturnType<typeof releaseAccess>;
  readableRows(req: Request, key: string, archived?: boolean): Row[];
  pilotIsometrics(isometrics: Row[], pilot: string): Row[];
  /** The configured public origin, used for absolute links in QR codes. */
  publicOrigin?: string;
}

const safe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const CHUNK = 64 * 1024;

/**
 * ISO Book (hosted profile with pilots, both pilots).
 *  - `GET /api/iso-book/parts?isoIds=a,b` lists every part with its availability for the isometrics.
 *  - `POST /api/iso-book` `{ isoIds, parts, grouping }` streams the merged PDF.
 * Nothing is read on behalf of the account that it could not get otherwise: generated parts follow the permission of
 * their document (`canDocument`: the report's export right, or the resource's read right for a project document), every uploaded file passes the checks of `GET /api/files/:id`, and the
 * isometrics must be readable in the pilot of the request.
 */
export function registerIsoBookRoutes({ app, store, documents, availability, access, readableRows, pilotIsometrics, publicOrigin }: IsoBookRouteDependencies) {
  const enabled = Boolean(availability?.features.includes('pilots'));

  function isometricsOf(req: Request, ids: string[]): Row[] {
    const user = (req as unknown as AuthRequest).user;
    const readable = user.pilot ? pilotIsometrics(readableRows(req, 'isometrics', false), user.pilot) : [];
    // An isometric of a main project out of reach is refused like on the record routes (403 `site`), not reported missing.
    return [...new Set(ids)].map(id => { const iso = readable.find(row => row.id === id && !row._archived); if (!iso && typeof id === 'string' && id) { try { store.get('isometrics', id, true); } catch (error) { if (isSiteRefusal(error)) throw error; } } if (!iso) throw new AppError(404, 'This isometric could not be found.'); return iso; });
  }

  /**
   * The same account in its other pilot for one isometric (when it may enter that pilot): a document it may print there
   * is offered and delivered here too, but only what it could read in that pilot itself (sec1-003). The isometric's
   * project must be switched on for that pilot and its main project within the account's reach there; the account works
   * under the profile of that main project, and its rows are read inside that pilot's scope. Null otherwise.
   */
  function otherPilotFor(user: User, iso: Row, resolver: () => SiteScope): { key: string; account: User; scope: SiteScope } | null {
    const other = user.pilot ? PILOT_KEYS.find(pilot => pilot !== user.pilot) : undefined;
    if (!other) return null;
    try {
      const project = store.get('projects', iso.projectId, true);
      if (!projectInPilot(project, other)) return null;
      const allowed = allowedSites(store, store.get('users', user.id), other);
      const siteId = resolver().siteOf('isometrics', iso);
      if (allowed !== 'all' && !allowed.has(siteId)) return null;
      const account = access.pilotAccount(user.id, other, allowed === 'all' ? undefined : siteId);
      const scope = allowed === 'all' ? new SiteScope(store, other, 'all', offProjects(store, other)) : singleSiteScope(store, other, siteId);
      return { key: allowed === 'all' ? 'all' : siteId, account, scope };
    } catch { return null; }
  }

  /** The book environment of each isometric: one per way the other pilot is reached, so isometrics of one main project share it. */
  function environmentFor(req: Request, now: Date): (iso: Row) => BookEnvironment {
    const user = (req as unknown as AuthRequest).user;
    const memo = new Map<string, BookEnvironment>();
    let own: Rows | undefined, resolver: SiteScope | undefined;
    const resolve = () => resolver ??= new SiteScope(store, user.pilot === 'weld' ? 'mto' : 'weld', 'all');
    const byIso = new Map<string, BookEnvironment>();
    return (iso: Row) => {
      const known = byIso.get(iso.id);
      if (known) return known;
      const other = otherPilotFor(user, iso, resolve), key = other?.key ?? '';
      let environment = memo.get(key);
      if (!environment) { own ??= rowsOf(req, user); environment = buildEnvironment(req, now, user, own, other); memo.set(key, environment); }
      byIso.set(iso.id, environment);
      return environment;
    };
  }

  /** Documents are not a resource of their own: an attachment is readable when its record is (the rule of `access.visible`). */
  function rowsOf(req: Request, account: User): Rows {
    return Object.fromEntries(RESOURCES.filter(resource => resource.key === 'attachments' || canResource(account, resource.key)).map(resource => [resource.key, readableRows(req, resource.key, true)]));
  }

  function buildEnvironment(req: Request, now: Date, user: User, ownRows: Rows, other: { account: User; scope: SiteScope } | null): BookEnvironment {
    const otherUser = other?.account ?? null;
    const accounts = otherUser ? [user, otherUser] : [user];
    // Only the account's own rights decide: the other pilot's account reads inside that pilot's scope, and of that only
    // what this request's scope reaches too.
    const inScope = <T>(account: User, fn: () => T): T => other && account === otherUser ? withSiteScope(other.scope, fn) : fn();
    const otherRows = (): Rows => {
      const read = inScope(otherUser!, () => rowsOf({ user: otherUser } as unknown as Request, otherUser!));
      return Object.fromEntries(Object.entries(read).map(([key, list]) => [key, scopeRows(key, list)]));
    };
    const accountRows = new Map<User, Rows>([[user, ownRows], ...(otherUser ? [[otherUser, otherRows()] as [User, Rows]] : [])]);
    const rows: Rows = { ...(otherUser ? accountRows.get(otherUser)! : {}), ...accountRows.get(user)! };
    const reportRows = new Map<string, Rows>();
    const forReport = (account: User, report: string): Rows => {
      const memo = `${account.pilot}:${report}`;
      let value = reportRows.get(memo);
      if (!value) {
        const primary = REPORT_RESOURCES[report] || [];
        value = Object.fromEntries(Object.entries(accountRows.get(account)!).filter(([key]) => key !== 'attachments' || canResource(account, 'attachments')).map(([key, list]) => [key, list.filter(row => !primary.includes(key) || canResource(account, key, 'export', row))]));
        reportRows.set(memo, value);
      }
      return value;
    };
    const environment: BookEnvironment = {
      user, ...(otherUser ? { alsoUsers: [otherUser] } : {}), rows, registry: PDF_DOCUMENTS, now,
      // The same two checks as the file download route.
      canFile(file) {
        try {
          const record = access.record('attachments', file.id), target = String(record.entityType);
          checkResourcePermission(req, target, 'show', access.record(target, record.entityId, true));
          return true;
        } catch { return false; }
      },
      site: id => { try { return store.get('sites', id); } catch { return undefined; } },
      certificateLinks: () => scopeRows('certificate_projects', store.list('certificate_projects')),
      generate(definition, iso, query) {
        const origin = publicOrigin || `${req.protocol}://${req.get('host')}`;
        // The account (in this pilot, else in the other one) whose rights allow the document builds it from what that account reads.
        const account = accounts.find(candidate => canDocument(candidate, definition)) ?? user, own = accountRows.get(account)!;
        // The isometric's project, when the account may read it in its pilot (the isometric itself is readable).
        const project = (own.projects || []).find(row => row.id === iso.projectId && !row._archived && (!account.pilot || projectInPilot(row, account.pilot))) ?? null;
        return inScope(account, () => {
          if (definition.scope === 'project') {
            if (!project) throw new AppError(404, 'This project could not be found.');
            return definition.build({ store, documents, user: account, rows: forReport(account, ''), query, now, publicOrigin, origin, project, site: environment.site(project.siteId) ?? null });
          }
          // A document of its own record prints only what traces back to this isometric (and its project).
          if (definition.scope === 'scoped') return definition.build({ store, documents, user: account, rows: forReport(account, definition.report), query, now, isometrics: [iso], isoIds: new Set([iso.id]), projectIds: new Set(project ? [project.id] : []) });
          return definition.build({ store, documents, user: account, iso, rows: forReport(account, definition.report), query, now, publicOrigin, origin });
        });
      },
      read: file => documents.read(file.id),
    };
    return environment;
  }

  /** The parts of the book; the custom parts come from the attachment names any of the isometrics' environments reads. */
  const plansOf = (environments: BookEnvironment[]) => {
    const names = new Map<string, Row>();
    for (const environment of environments) for (const row of environment.rows.attachment_names || []) if (!names.has(row.id)) names.set(row.id, row);
    return bookPlans(PDF_DOCUMENTS, [...names.values()]);
  };

  app.get('/api/iso-book/parts', (req, res) => {
    if (!enabled) throw new AppError(404, 'This resource could not be found.');
    const ids = typeof req.query.isoIds === 'string' ? req.query.isoIds.split(',').filter(Boolean) : [];
    if (!ids.length) throw new AppError(422, 'Choose at least one isometric.');
    if (ids.length > ISO_BOOK_LIMITS.isometrics) throw new AppError(422, `A book request may contain at most ${ISO_BOOK_LIMITS.isometrics} isometrics.`);
    const isometrics = isometricsOf(req, ids), environment = environmentFor(req, new Date());
    const parts: BookPartInfo[] = plansOf(isometrics.map(environment)).map(plan => {
      const states = isometrics.map(iso => partState(plan, environment(iso), iso)), usable = states.some(state => state.available);
      return { key: plan.key, label: plan.label, source: plan.source, available: usable, ...(usable ? {} : { reason: states[0]?.reason }), ...(plan.position ? { position: plan.position } : {}) };
    });
    const body: BookPartsResponse = { isometrics: isometrics.map(iso => ({ id: iso.id, isoNo: String(iso.isoNo ?? '') })), parts, limits: ISO_BOOK_LIMITS };
    res.setHeader('Cache-Control', 'no-store'); res.json(body);
  });

  app.post('/api/iso-book', async (req, res) => {
    if (!enabled) throw new AppError(404, 'This resource could not be found.');
    const refusal = bookRequestError(req.body);
    if (refusal) throw new AppError(422, refusal);
    const request = { grouping: 'by-isometric', ...req.body } as BookRequest;
    const isometrics = isometricsOf(req, request.isoIds), now = new Date(), environment = environmentFor(req, now);
    const plans = plansOf(isometrics.map(environment)), chosen = new Set(request.parts);
    for (const key of chosen) if (!plans.some(plan => plan.key === key)) throw new AppError(422, 'One of the chosen parts does not exist.');
    const selected = plans.filter(plan => chosen.has(plan.key));
    // A part that no chosen isometric can supply is refused with its reason; a part some isometrics lack is listed on the "not included" page.
    for (const plan of selected) {
      const states = isometrics.map(iso => partState(plan, environment(iso), iso));
      if (!states.some(state => state.available)) throw new AppError(422, `${plan.label}: ${states[0]?.reason || 'This part is not available.'}`, { parts: plan.label });
    }
    const budget = new Budget(), { out, font } = await createBook(isometrics.length === 1 ? `ISO Book ${String(isometrics[0].isoNo)}` : 'ISO Book');
    // Task sheet (the cover page with the contents) is no part of the book any more (shared/iso-book.ts REMOVED_BOOK_PARTS): no cover.
    if (request.grouping === 'by-part' && isometrics.length > 1) {
      const skipped: SkippedFile[] = [], all: Chunk[] = [];
      for (const iso of isometrics) all.push(...await collectChunks(environment(iso), selected, iso, budget, skipped));
      // The chunks were collected isometric by isometric; a stable sort by part keeps that order inside each part.
      const order = new Map(selected.map((plan, index) => [plan.key, index]));
      all.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
      await appendBook(out, font, { cover: null, chunks: all, skipped, now }, budget);
    } else {
      for (const iso of isometrics) {
        const skipped: SkippedFile[] = [], chunks = await collectChunks(environment(iso), selected, iso, budget, skipped);
        await appendBook(out, font, { cover: null, chunks, skipped, now }, budget);
      }
    }
    if (!out.getPageCount()) throw new AppError(422, 'None of the chosen parts could be included in the book.');
    const bytes = await out.save();
    const first = isometrics[0], project = (environment(first).rows.projects || []).find(row => row.id === first.projectId);
    const fileName = `${now.toISOString().slice(0, 10)}-${safe(project?.internnumber, 'project')}-ISO-Book-${isometrics.length === 1 ? safe(first.isoNo, 'iso') : `${isometrics.length}-isometrics`}.pdf`;
    await stream(res, bytes, fileName, out.getPageCount());
  });
}

/** Writes the PDF in chunks, waiting for the socket whenever it is full. */
async function stream(res: Response, bytes: Uint8Array, fileName: string, pages: number) {
  res.status(200);
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '-')}"`);
  res.setHeader('Content-Length', String(bytes.length)); res.setHeader('X-Iso-Book-Pages', String(pages));
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    if (!res.write(Buffer.from(bytes.subarray(offset, offset + CHUNK)))) await once(res, 'drain');
  }
  res.end();
}
