import type { Express, Request, Response } from 'express';
import type { Store } from '../store.ts';
import { AppError } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import { actorOf, type AuthRequest } from '../auth.ts';
import { PDF_DOCUMENTS, type PdfResult } from './documents.ts';
import { RESOURCES } from '../../shared/resources.ts';
import { canReport, canResource, REPORT_RESOURCES } from '../../shared/permissions.ts';
import { projectInPilot } from '../../shared/project-scope.ts';
import type { Availability, Row } from '../../shared/types.ts';

export interface PdfRouteDependencies {
  app: Express; store: Store; documents: ReturnType<typeof documentStorage>; availability?: Availability;
  /** The records of a resource the request's account may read (the same function the report exports use). */
  readableRows(req: Request, key: string, archived?: boolean): Row[];
  /** Isometrics of projects enabled in the pilot. */
  pilotIsometrics(isometrics: Row[], pilot: string): Row[];
  /** The configured public origin, used for absolute links in QR codes. */
  publicOrigin?: string;
}

/**
 * `GET /api/pdf/:document?isoId=…` — a printable document of one isometric as `application/pdf`.
 * Hosted profile with pilots only. Access follows the corresponding report (`canReport(user, report, 'export')`)
 * inside the pilot of the request and the isometric must be readable by the account in that pilot.
 * `?download=1` sends it as an attachment instead of inline.
 *
 * Documents of their own record (`scope: 'scoped'`, see operational-documents.ts) name that record in the query instead of an
 * isometric; the document gets the readable records and the isometrics / projects enabled in the pilot and may print only
 * records that trace back to them. `POST /api/pdf/:document` is the same for documents that can be `attachable`: the file is
 * also stored as a document of each record in `attachTo` (the account needs the import right on that record, as for a file upload).
 */
export function registerPdfRoutes({ app, store, documents, availability, readableRows, pilotIsometrics, publicOrigin }: PdfRouteDependencies) {
  async function generate(req: Request, attach: boolean): Promise<{ result: PdfResult; query: Record<string, string>; attached: number }> {
    const definition = availability?.features.includes('pilots') ? PDF_DOCUMENTS.find(item => item.key === req.params.document) : undefined;
    if (!definition || attach && !(definition.scope === 'scoped' && definition.attachable)) throw new AppError(404, 'This document does not exist.');
    const user = (req as unknown as AuthRequest).user;
    if (definition.scope === 'project' ? !canResource(user, definition.resource, 'show') : !canReport(user, definition.report, 'export')) throw new AppError(403, 'Your permission profile does not allow this document.');
    // Query values are short, except the list of chosen welds and the note of a request document.
    const query = Object.fromEntries(Object.entries(req.query).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => [key, value.slice(0, key === 'welds' ? 8000 : 2100)]));
    const readable = (primary: string[]) => Object.fromEntries(RESOURCES.filter(resource => canResource(user, resource.key)).map(resource => [resource.key, readableRows(req, resource.key, true).filter(row => !primary.includes(resource.key) || canResource(user, resource.key, 'export', row))]));
    const now = new Date(), origin = publicOrigin || `${req.protocol}://${req.get('host')}`;
    let result: PdfResult;
    if (definition.scope === 'project') {
      const projects = readableRows(req, 'projects', false).filter(row => !row._archived && (!user.pilot || projectInPilot(row, user.pilot)));
      const chosen = query.projectId ? projects.find(row => row.id === query.projectId) : null;
      if (query.projectId && !chosen) throw new AppError(404, 'This project could not be found.');
      const siteId = String(chosen?.siteId ?? query.siteId ?? '');
      const site = siteId ? store.list('sites').find(row => row.id === siteId) ?? null : null;
      if (query.siteId && !site) throw new AppError(404, 'This main project could not be found.');
      result = await definition.build({ store, documents, user, rows: readable([]), query, now, publicOrigin, origin, project: chosen ?? null, site });
    } else {
      const isometrics = user.pilot ? pilotIsometrics(readableRows(req, 'isometrics', false), user.pilot).filter(row => !row._archived) : [];
      const rows = readable(REPORT_RESOURCES[definition.report] || []);
      if (definition.scope === 'scoped') {
        const projectIds = new Set((rows.projects || []).filter(project => !project._archived && projectInPilot(project, user.pilot)).map(project => project.id));
        result = await definition.build({ store, documents, user, rows, query, now, isometrics, isoIds: new Set(isometrics.map(row => row.id)), projectIds });
      } else {
        const iso = isometrics.find(row => row.id === query.isoId);
        if (!iso) throw new AppError(404, 'This isometric could not be found.');
        result = await definition.build({ store, documents, user, iso, rows, query, now, publicOrigin, origin });
      }
    }
    let attached = 0;
    if (attach && definition.scope === 'scoped' && definition.attachable && result.attachTo) {
      const { entityType, ids } = result.attachTo, name = `${result.fileName.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`, documentType = definition.attachable.documentType;
      const targets = ids.map(id => store.get(entityType, id));
      if (targets.some(target => !canResource(user, entityType, 'import', target))) throw new AppError(403, 'Your permission profile does not allow this action.');
      store.transaction(() => { for (const target of targets) { const file = store.create('attachments', { name, entityType, entityId: target.id, documentType, mime: 'application/pdf', size: result.bytes.length, note: '' }, actorOf(req)); documents.saveBytes(file.id, result.bytes); attached++; } });
    }
    return { result, query, attached };
  }
  function send(res: Response, result: PdfResult, download: boolean, attached?: number) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${result.fileName.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf"`);
    res.setHeader('Content-Length', String(result.bytes.length));
    if (attached !== undefined) res.setHeader('X-Attached', String(attached));
    res.end(Buffer.from(result.bytes));
  }
  app.get('/api/pdf/:document', async (req, res) => { const { result, query } = await generate(req, false); send(res, result, query.download === '1'); });
  app.post('/api/pdf/:document', async (req, res) => { const { result, query, attached } = await generate(req, true); send(res, result, query.download === '1', attached); });
}
