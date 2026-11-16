import type { Express, Request } from 'express';
import type { Store } from '../store.ts';
import { AppError } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import type { AuthRequest } from '../auth.ts';
import { PDF_DOCUMENTS } from './documents.ts';
import { RESOURCES } from '../../shared/resources.ts';
import { projectInPilot } from '../../shared/project-scope.ts';
import { canReport, canResource, REPORT_RESOURCES } from '../../shared/permissions.ts';
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
 * Hosted profile with pilots only. Access follows the corresponding report (`canReport(user, report, 'export')`
 * inside the pilot of the request) and the isometric must be readable by the account in that pilot.
 * `?download=1` sends it as an attachment instead of inline.
 */
export function registerPdfRoutes({ app, store, documents, availability, readableRows, pilotIsometrics, publicOrigin }: PdfRouteDependencies) {
  app.get('/api/pdf/:document', async (req, res) => {
    const definition = availability?.features.includes('pilots') ? PDF_DOCUMENTS.find(item => item.key === req.params.document) : undefined;
    if (!definition) throw new AppError(404, 'This document does not exist.');
    const user = (req as unknown as AuthRequest).user;
    if (definition.scope === 'project' ? !canResource(user, definition.resource, 'show') : !canReport(user, definition.report, 'export')) throw new AppError(403, 'Your permission profile does not allow this document.');
    // Query values are short, except the list of chosen welds.
    const query = Object.fromEntries(Object.entries(req.query).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => [key, value.slice(0, key === 'welds' ? 8000 : 150)]));
    const readable = (primary: string[]) => Object.fromEntries(RESOURCES.filter(resource => canResource(user, resource.key)).map(resource => [resource.key, readableRows(req, resource.key, true).filter(row => !primary.includes(resource.key) || canResource(user, resource.key, 'export', row))]));
    let result: Awaited<ReturnType<typeof definition.build>>;
    if (definition.scope === 'project') {
      const projects = readableRows(req, 'projects', false).filter(row => !row._archived && (!user.pilot || projectInPilot(row, user.pilot)));
      const chosen = query.projectId ? projects.find(row => row.id === query.projectId) : null;
      if (query.projectId && !chosen) throw new AppError(404, 'This project could not be found.');
      const siteId = String(chosen?.siteId ?? query.siteId ?? '');
      const site = siteId ? store.list('sites').find(row => row.id === siteId) ?? null : null;
      if (query.siteId && !site) throw new AppError(404, 'This main project could not be found.');
      result = await definition.build({ store, documents, user, rows: readable([]), query, now: new Date(), publicOrigin, project: chosen ?? null, site });
    } else {
      const isometrics = user.pilot ? pilotIsometrics(readableRows(req, 'isometrics', false), user.pilot) : [];
      const iso = isometrics.find(row => row.id === query.isoId && !row._archived);
      if (!iso) throw new AppError(404, 'This isometric could not be found.');
      result = await definition.build({ store, documents, user, iso, rows: readable(REPORT_RESOURCES[definition.report] || []), query, now: new Date(), publicOrigin });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${query.download === '1' ? 'attachment' : 'inline'}; filename="${result.fileName.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf"`);
    res.setHeader('Content-Length', String(result.bytes.length));
    res.end(Buffer.from(result.bytes));
  });
}
