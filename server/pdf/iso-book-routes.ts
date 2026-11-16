import { once } from 'node:events';
import type { Express, Request, Response } from 'express';
import type { Store } from '../store.ts';
import { AppError } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import type { AuthRequest } from '../auth.ts';
import { checkResourcePermission } from '../auth.ts';
import type { releaseAccess } from '../release-access.ts';
import { PDF_DOCUMENTS } from './documents.ts';
import { bookPlans, partState, type Rows } from './iso-book-parts.ts';
import { appendBook, Budget, collectChunks, createBook, type BookEnvironment, type Chunk, type CoverModel, type SkippedFile } from './iso-book.ts';
import { RESOURCES } from '../../shared/resources.ts';
import { canResource, REPORT_RESOURCES } from '../../shared/permissions.ts';
import { bookRequestError, ISO_BOOK_LIMITS, type BookPartInfo, type BookPartsResponse, type BookRequest } from '../../shared/iso-book.ts';
import { currentRevision } from '../../shared/revisions.ts';
import type { Availability, Row } from '../../shared/types.ts';

export interface IsoBookRouteDependencies {
  app: Express; store: Store; documents: ReturnType<typeof documentStorage>; availability?: Availability;
  access: ReturnType<typeof releaseAccess>;
  readableRows(req: Request, key: string, archived?: boolean): Row[];
  pilotIsometrics(isometrics: Row[], pilot: string): Row[];
}

const safe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const CHUNK = 64 * 1024;

/**
 * ISO Book (hosted profile with pilots, both pilots).
 *  - `GET /api/iso-book/parts?isoIds=a,b` lists every part with its availability for the isometrics.
 *  - `POST /api/iso-book` `{ isoIds, parts, grouping }` streams the merged PDF.
 * Nothing is read on behalf of the account that it could not get otherwise: generated parts follow the permission of
 * their report (`canReport(…, 'export')`), every uploaded file passes the checks of `GET /api/files/:id`, and the
 * isometrics must be readable in the pilot of the request.
 */
export function registerIsoBookRoutes({ app, store, documents, availability, access, readableRows, pilotIsometrics }: IsoBookRouteDependencies) {
  const enabled = Boolean(availability?.features.includes('pilots'));

  function isometricsOf(req: Request, ids: string[]): Row[] {
    const user = (req as unknown as AuthRequest).user;
    const readable = user.pilot ? pilotIsometrics(readableRows(req, 'isometrics', false), user.pilot) : [];
    return [...new Set(ids)].map(id => { const iso = readable.find(row => row.id === id && !row._archived); if (!iso) throw new AppError(404, 'This isometric could not be found.'); return iso; });
  }

  function environmentFor(req: Request, now: Date): BookEnvironment {
    const user = (req as unknown as AuthRequest).user;
    // Documents are not a resource of their own: an attachment is readable when its record is (the rule of `access.visible`).
    const rows: Rows = Object.fromEntries(RESOURCES.filter(resource => resource.key === 'attachments' || canResource(user, resource.key)).map(resource => [resource.key, readableRows(req, resource.key, true)]));
    const reportRows = new Map<string, Rows>();
    const forReport = (report: string): Rows => {
      let value = reportRows.get(report);
      if (!value) {
        const primary = REPORT_RESOURCES[report] || [];
        value = Object.fromEntries(Object.entries(rows).filter(([key]) => key !== 'attachments' || canResource(user, 'attachments')).map(([key, list]) => [key, list.filter(row => !primary.includes(key) || canResource(user, key, 'export', row))]));
        reportRows.set(report, value);
      }
      return value;
    };
    return {
      user, rows, registry: PDF_DOCUMENTS, now,
      // The same two checks as the file download route.
      canFile(file) {
        try {
          const record = access.record('attachments', file.id), target = String(record.entityType);
          checkResourcePermission(req, target, 'show', access.record(target, record.entityId, true));
          return true;
        } catch { return false; }
      },
      site: id => { try { return store.get('sites', id); } catch { return undefined; } },
      certificateLinks: () => store.list('certificate_projects'),
      generate: (definition, iso, query) => definition.build({ store, documents, user, iso, rows: forReport(definition.report), query, now }),
      read: file => documents.read(file.id),
    };
  }

  const plansOf = (environment: BookEnvironment) => bookPlans(environment.registry, environment.rows.attachment_names || []);

  app.get('/api/iso-book/parts', (req, res) => {
    if (!enabled) throw new AppError(404, 'This resource could not be found.');
    const ids = typeof req.query.isoIds === 'string' ? req.query.isoIds.split(',').filter(Boolean) : [];
    if (!ids.length) throw new AppError(422, 'Choose at least one isometric.');
    if (ids.length > ISO_BOOK_LIMITS.isometrics) throw new AppError(422, `A book request may contain at most ${ISO_BOOK_LIMITS.isometrics} isometrics.`);
    const isometrics = isometricsOf(req, ids), environment = environmentFor(req, new Date());
    const parts: BookPartInfo[] = plansOf(environment).map(plan => {
      const states = isometrics.map(iso => partState(plan, environment, iso)), usable = states.some(state => state.available);
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
    const plans = plansOf(environment), chosen = new Set(request.parts);
    for (const key of chosen) if (!plans.some(plan => plan.key === key)) throw new AppError(422, 'One of the chosen parts does not exist.');
    const selected = plans.filter(plan => chosen.has(plan.key));
    // A part that no chosen isometric can supply is refused with its reason; a part some isometrics lack is listed on the "not included" page.
    for (const plan of selected) {
      const states = isometrics.map(iso => partState(plan, environment, iso));
      if (!states.some(state => state.available)) throw new AppError(422, `${plan.label}: ${states[0]?.reason || 'This part is not available.'}`, { parts: plan.label });
    }
    const budget = new Budget(), { out, font } = await createBook(isometrics.length === 1 ? `ISO Book ${String(isometrics[0].isoNo)}` : 'ISO Book');
    const withCover = chosen.has('task-sheet');
    const user = environment.user;
    const coverFor = (list: Row[]): CoverModel | null => {
      if (!withCover) return null;
      const project = (environment.rows.projects || []).find(row => row.id === list[0].projectId);
      const client = String((environment.rows.companies || []).find(row => row.id === project?.companyId)?.name ?? '');
      return { project, client, single: list.length === 1, preparedBy: user.name, now, isometrics: list.map(iso => ({ isoNo: String(iso.isoNo ?? ''), revision: currentRevision(environment.rows, iso.id, 'ISO'), drawingNo: String(iso.drawingNo ?? '') })) };
    };
    if (request.grouping === 'by-part' && isometrics.length > 1) {
      const skipped: SkippedFile[] = [], all: Chunk[] = [];
      for (const iso of isometrics) all.push(...await collectChunks(environment, selected, iso, budget, skipped));
      // The chunks were collected isometric by isometric; a stable sort by part keeps that order inside each part.
      const order = new Map(selected.map((plan, index) => [plan.key, index]));
      all.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
      await appendBook(out, font, { cover: coverFor(isometrics), chunks: all, skipped, now }, budget);
    } else {
      for (const iso of isometrics) {
        const skipped: SkippedFile[] = [], chunks = await collectChunks(environment, selected, iso, budget, skipped);
        await appendBook(out, font, { cover: coverFor([iso]), chunks, skipped, now }, budget);
      }
    }
    if (!out.getPageCount()) throw new AppError(422, 'None of the chosen parts could be included in the book.');
    const bytes = await out.save();
    const first = isometrics[0], project = (environment.rows.projects || []).find(row => row.id === first.projectId);
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
