import type { Application, Request } from 'express';
import { AppError, type Actor, type Store } from './store.ts';
import type { releaseAccess } from './release-access.ts';
import { actorOf, checkResourcePermission, type AuthRequest } from './auth.ts';
import { canResource } from '../shared/permissions.ts';
import { MEMO_TEMPLATES, MemoInputError, effectiveMemoTemplates, memoDeleteTarget, memoRestoreTargets, planMemoSave, siteMemoRows, MEMO_TEXTS } from '../shared/memo-templates.ts';
import type { Row } from '../shared/types.ts';

/**
 * Memo templates of a project site (hosted profile; rules in shared/memo-templates.ts). Reading needs the right to view
 * the project site (its Edit dialog) or the isometrics of one of its projects (the template buttons); every change needs
 * the right to edit the project site, as the reference's Edit project site dialog. Delete and Restore default archive the
 * site's row; nothing is removed.
 */
interface Dependencies { store: Store; access: ReturnType<typeof releaseAccess> }
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 200) : '';
const fail = (error: unknown): never => { if (error instanceof MemoInputError) throw new AppError(error.status, error.message, error.fields); throw error; };

export function registerMemoTemplateRoutes(app: Application, { store, access }: Dependencies) {
  const user = (req: Request) => (req as unknown as AuthRequest).user;
  const list = (site: Row, req: Request) => ({ siteId: site.id, templates: effectiveMemoTemplates(store.list(MEMO_TEMPLATES), site.id), canEdit: canResource(user(req), 'sites', 'edit', site) });
  /** The project site of a change: one the account may edit. */
  const editable = (req: Request) => {
    const siteId = text(req.body?.siteId);
    if (!siteId) throw new AppError(422, 'Choose a project site.');
    const site = access.record('sites', siteId);
    checkResourcePermission(req, 'sites', 'edit', site);
    return site;
  };

  /** `?siteId=` (the site tab) or `?projectId=` (the isometric memo of that project: its main project's templates). */
  app.get('/api/memo-templates', (req, res) => {
    const projectId = text(req.query.projectId), siteId = text(req.query.siteId);
    let site: Row;
    if (projectId) {
      const project = access.record('projects', projectId);
      if (!access.visible(user(req), 'projects', project)) throw new AppError(404, 'This resource could not be found.');
      checkResourcePermission(req, 'isometrics', 'show');
      site = access.record('sites', project.siteId);
    } else if (siteId) {
      site = access.record('sites', siteId);
      checkResourcePermission(req, 'sites', 'show', site);
    } else throw new AppError(422, 'Choose a project site.');
    res.setHeader('Cache-Control', 'no-store');
    res.json(list(site, req));
  });

  app.post('/api/memo-templates/save', (req, res) => {
    const site = editable(req), actor = actorOf(req);
    store.transaction(() => {
      let plan; try { plan = planMemoSave(store.list(MEMO_TEMPLATES), site.id, req.body ?? {}); } catch (error) { fail(error); }
      if (plan!.kind === 'update') store.update(MEMO_TEMPLATES, plan!.id!, plan!.values, store.get(MEMO_TEMPLATES, plan!.id)._version, actor);
      else store.create(MEMO_TEMPLATES, plan!.values, actor);
    });
    res.json({ ...list(site, req), message: MEMO_TEXTS.saved });
  });

  app.post('/api/memo-templates/delete', (req, res) => {
    const site = editable(req), actor = actorOf(req);
    store.transaction(() => {
      let row: Row | undefined; try { row = memoDeleteTarget(store.list(MEMO_TEMPLATES), site.id, req.body?.recordId); } catch (error) { fail(error); }
      store.archive(MEMO_TEMPLATES, row!.id, row!._version, actor);
    });
    res.json({ ...list(site, req), message: MEMO_TEXTS.deleted });
  });

  app.post('/api/memo-templates/restore', (req, res) => {
    const site = editable(req), actor = actorOf(req);
    store.transaction(() => {
      let rows: Row[] = []; try { rows = memoRestoreTargets(store.list(MEMO_TEMPLATES), site.id, req.body?.key); } catch (error) { fail(error); }
      for (const row of rows) store.archive(MEMO_TEMPLATES, row.id, row._version, actor);
    });
    res.json({ ...list(site, req), message: MEMO_TEXTS.restored });
  });
}

/** Duplicate Project site → "Memo templates": the source site's own templates are copied to the new site (inside the action's transaction). */
export function copyMemoTemplates(store: Store, fromSiteId: string, toSiteId: string, actor: Actor) {
  for (const row of siteMemoRows(store.list(MEMO_TEMPLATES), fromSiteId)) store.create(MEMO_TEMPLATES, { scope: 'site', siteId: toSiteId, key: row.key ?? '', label: row.label, sortOrder: row.sortOrder, content: row.content }, actor);
}
