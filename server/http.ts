import { checkItpLinkAccess } from './itp-dashboard.ts';
import { assertItpDeletable, checkIsoWrite, registerItpRoutes, syncItpXRay } from './itps.ts';
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Store, AppError } from './store.ts';
import { runAction } from './workflows.ts';
import { inspectionRules } from './inspections.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { ACTIONS } from '../shared/actions.ts';
import { refusalBody } from '../shared/refusal.ts';
import { RELATIONS,relationFields } from '../shared/welding.ts';
import { REPORTS, buildReport, reportCsv, type ReportFilters } from '../shared/reports.ts';
import { canResource,canReport,canScope,REPORT_RESOURCES } from '../shared/permissions.ts';
import type { Row, Module } from '../shared/types.ts';
import { actorOf, authMiddleware, checkPermission,checkResourcePermission,checkActionPermission, ensureAdministrator, hashToken, newSession, passwordHash, passwordMatches, sessionCookie, type AuthRequest } from './auth.ts';

import { availabilityFor, pageAvailable, pagePath, projectReport, type ReleaseProfile } from '../shared/release.ts';
import { pilotRefused, releaseAccess } from './release-access.ts';
import { assertSignatureImage } from './signatures.ts';
import { assertPunchAddAllowed, assertPunchFileAllowed, registerPunchRoutes } from './punch.ts';
import { ISO_LIST_COLUMNS, flagText } from '../shared/iso-list.ts';
import { isoSummariesFor } from './iso-summary.ts';
import { dropCompletionInput } from './releases.ts';
import { projectInPilot } from '../shared/project-scope.ts';
import { documentStorage, type DocumentStorage } from './documents.ts';
import { ENABLEMENT_INPUT, enablementKey } from '../shared/weld-catalogs.ts';
import { FLAG_BULK_RESOURCES, flagBulkAllowed } from '../shared/welder-data.ts';
import { withLegacyValues } from './welder-data.ts';
import { addNotification, bellOf, markAllRead, markRead, type Viewer } from './notifications.ts';
import { siteOfRecord } from './weld-catalogs.ts';
import { companyForDocuments } from './pdf/company.ts';
import { duplicateParts, duplicateReadResources } from '../shared/site-duplicate.ts';
import { reportWorkbook } from './report-export.ts';
import { SPOOL_EXPORT_COLUMNS, spoolExportLines } from '../shared/mto-logistics.ts';
import { registerPdfRoutes } from './pdf/routes.ts';
import { registerIsoBookRoutes } from './pdf/iso-book-routes.ts';
import { registerIsoDialogRoutes } from './iso-dialogs.ts';
import { assignIrn } from './iso-pages.ts';
import { inspectionFileError } from '../shared/inspections.ts';
import { registerMtoStockRoutes } from './mto-stock.ts';
import { registerCertificationRoutes, requireOwnerSite } from './certifications.ts';
import { registerWpsRoutes } from './wps.ts';
import { deriveMaterialRows, materialMassEdit, registerMaterialDbRoutes } from './mto-materials.ts';
import { WELD_DATA_EXPORT_HIDDEN } from '../shared/wps.ts';
import { activeSite, assertAccountReach, assertCopyInScope, assertSiteAccessEdit, assertSiteProfiles, guardStore, inSiteScope, isSiteRefusal, keepSiteScope, runInSiteScope, siteRefused, type SiteScope } from './site-scope.ts';

export function createApp(store: Store, dataDir: string, options: { releaseProfile?: ReleaseProfile; distDir?: string; serveClient?: boolean; publicOrigin?: string; documentStorage?: DocumentStorage; initializeStorage?: boolean; secureCookies?: boolean; sampleWorkspace?: boolean } = {}) {
  const app = express(); app.disable('x-powered-by');
  const availability = availabilityFor(options.releaseProfile || 'full');
  const cookieName = options.releaseProfile === 'access-prototype' ? 'blitzkrieg_prototype_session' : availability ? 'blitzkrieg_session' : 'stelux_session';
  const access = releaseAccess(store, availability);
  const pilots = Boolean(availability?.features.includes('pilots'));
  store.hostedRules = pilots;
  store.requireMaterialGroup = pilots;
  // Access per project site: records outside a limited request's main projects are refused on every read and write.
  if (pilots) guardStore(store);
  const presentUser = (id: string) => access.present(id);
  const ensureAdmin = () => ensureAdministrator(store, access.administrators);
  // Accounts are created together with their credential; sample accounts seeded without a password do not count.
  const needsSetup = () => !store.db.prepare('SELECT user_id FROM credentials LIMIT 1').get();
  const readableRows = (req: Request, key: string, archived = false) => deriveMaterialRows(store, key, store.list(key, archived)).filter(row => access.visible((req as AuthRequest).user, key, row)).map(row => access.project(key, withLegacyValues(store, key, row)));
  const visibleAudit = (req: Request, events: ReturnType<Store['activity']>) => events.map(event => access.audit((req as AuthRequest).user, event)).filter((event): event is NonNullable<typeof event> => Boolean(event));
  const documents = documentStorage(store, dataDir, options.documentStorage || 'disk', options.initializeStorage !== false);
  if (options.secureCookies) app.set('secure cookies', true);
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); if (req.path === '/api' || req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['x-stelux-request'] !== '1') return next(new AppError(403, 'This request must come from the Blitzkrieg application.'));
      if (req.headers.origin) {
        try { const origin = new URL(req.headers.origin); const local = !options.publicOrigin && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && ['3000', '3001', '5173', String(req.socket.localPort)].includes(origin.port); if (options.publicOrigin ? origin.origin !== options.publicOrigin : !local) throw new Error(); }
        catch { return next(new AppError(403, 'This origin is not allowed.')); }
      }
    }
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  const attempts = new Map<string, { count: number; until: number }>();
  app.get('/api/health', (_req, res) => {
    store.db.prepare('SELECT 1 AS connected').get();
    res.json({ ok: true, name: 'Blitzkrieg', database: store.db.dialect === 'postgres' ? 'postgres' : 'sqlite' });
  });
  app.get('/api/auth/status', (req, res) => {
    const requiresSetup = needsSetup();
    const session = store.db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(sessionCookie(req, cookieName)), new Date().toISOString()) as { user_id: string } | undefined;
    let user; try { if (session) user = presentUser(session.user_id); } catch { /* expired or deactivated */ }
    res.setHeader('Cache-Control', 'no-store'); res.json({ requiresSetup, user: user || null, sampleWorkspace: options.sampleWorkspace !== false, ...(availability ? { availability } : {}) });
  });
  app.post('/api/auth/setup', (req, res) => {
    const user = store.transaction(() => {
      if (!needsSetup()) throw new AppError(409, 'This workspace already has an administrator. Sign in instead.');
      const hash = passwordHash(req.body.password);
      const user = store.create('users', { name: req.body.name, email: req.body.email, profileId: 'profile-admin', active: true });
      store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, hash);
      return user;
    });
    newSession(store, user.id, res, cookieName); res.status(201).json({ user: presentUser(user.id) });
  });
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'local'; let state = attempts.get(ip);
    if (state && state.until < Date.now()) { attempts.delete(ip); state = undefined; }
    if (state && state.count >= 8) throw new AppError(429, 'Too many sign-in attempts. Try again in a few minutes.');
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = store.list('users').find(u => u.email === email && u.active);
    const credential = user ? store.db.prepare('SELECT hash FROM credentials WHERE user_id=?').get(user.id) as { hash: string } | undefined : undefined;
    if (!credential || !passwordMatches(req.body.password, credential.hash)) { attempts.set(ip, { count: (state?.count || 0) + 1, until: state?.until || Date.now() + 5 * 60_000 }); throw new AppError(401, 'Email or password is incorrect.'); }
    attempts.delete(ip); newSession(store, user!.id, res, cookieName); res.json({ user: presentUser(user!.id) });
  });
  app.use('/api', authMiddleware(store, cookieName));
  /** Requests that never need a pilot: sign-out and password change work from the selector and from any pilot. */
  const ACCOUNT_ROUTES = new Set(['POST /auth/logout', 'POST /auth/password']);
  /** Requests a limited account may make in a pilot before it chose one of its main projects. */
  const CHOICE_ROUTES = new Set(['GET /bootstrap', 'GET /notifications', 'GET /company-logo']);
  app.use('/api', (req, _res, next) => {
    let scope: SiteScope | undefined;
    if (pilots) {
      // The current pilot comes from the X-Stelux-Pilot header; plain download links (GET) may carry ?pilot= instead.
      // It decides which profile applies; a pilot the account may not enter, or a mismatch, is refused.
      const id = (req as AuthRequest).user.id, route = `${req.method} ${req.path}`;
      const header = req.headers['x-stelux-pilot'], query = ['GET', 'HEAD'].includes(req.method) ? req.query.pilot : undefined;
      try {
        if (ACCOUNT_ROUTES.has(route)) (req as AuthRequest).user = access.present(id);
        else if (header !== undefined && query !== undefined && header !== query) throw pilotRefused();
        else if ((header ?? query) === undefined) {
          // Selector requests see identity, the pilots and the main projects (bootstrap only); everything else needs a pilot.
          if (route !== 'GET /bootstrap' && route !== 'GET /company-logo') throw pilotRefused('Open Weld Pilot or MTO Pilot to continue.');
          (req as AuthRequest).user = access.present(id);
        } else {
          // The main project the request works in (server/site-scope.ts `activeSite`): a limited account works with that
          // main project's profile and reaches that main project only.
          const pilot = access.pilotOf(id, header ?? query);
          const active = activeSite(store, req, store.get('users', id), pilot);
          if (active.choose) {
            // Several main projects and none chosen: only the choice (and the bell) may be loaded.
            if (!CHOICE_ROUTES.has(route)) throw siteRefused('Choose a main project to continue.');
            (req as AuthRequest).user = access.chooser(id, pilot);
          } else (req as AuthRequest).user = access.pilotAccount(id, pilot, active.siteId);
          scope = active.scope;
        }
      } catch (error) { return next(error); }
    } else (req as AuthRequest).user = access.user((req as AuthRequest).user);
    const projectBulk = availability?.features.includes('project-bulk-edit') && /^\/bulk\/(?:projects|isometrics)$/.test(req.path);
    // The Options menu of a catalog with "Enabled on this site" switches the checked records on or off (nothing else is bulk-editable there).
    const catalogBulk = availability?.features.includes('pilots') && enablementKey(/^\/bulk\/([^/]+)$/.exec(req.path)?.[1] || '');
    // Mass edit of the Material database (MTO Pilot catalogs); other hosted bulk routes stay closed.
    const materialBulk = pilots && req.path === '/bulk/materials';
    // Controlled / Accepted of the ticked welding wires and certificates (nothing else is bulk-editable there, see the route).
    const flagBulk = pilots && FLAG_BULK_RESOURCES.some(key => req.path === `/bulk/${key}`);
    if (availability && (/^\/import(?:\/|$)/.test(req.path) || /^\/bulk(?:\/|$)/.test(req.path) && !projectBulk && !catalogBulk && !materialBulk && !flagBulk || req.path === '/revisions' && !pilots)) return next(new AppError(404, 'This resource could not be found.'));
    // The rest of the request runs inside the account's project site scope (derived once, see server/site-scope.ts).
    runInSiteScope(scope, next);
  });
  app.param('resource', (_req, _res, next, key) => { try { access.resource(key); next(); } catch (error) { next(error); } });
  app.post('/api/auth/logout', (req, res) => { store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(sessionCookie(req, cookieName))); res.clearCookie(cookieName, { path: '/' }); res.json({ ok: true }); });
  app.post('/api/auth/password', (req, res) => {
    const user = (req as AuthRequest).user;
    const old = store.db.prepare('SELECT hash FROM credentials WHERE user_id=?').get(user.id) as { hash: string };
    if (!passwordMatches(req.body.currentPassword, old.hash)) throw new AppError(422, 'Current password is incorrect.');
    const hash = passwordHash(req.body.password);
    store.transaction(() => { store.db.prepare('UPDATE credentials SET hash=? WHERE user_id=?').run(hash, user.id); store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); });
    newSession(store, user.id, res, cookieName); res.json({ ok: true });
  });
  app.get('/api/bootstrap', (req, res) => {
    const user = (req as AuthRequest).user;
    if (pilots && !user.pilot) { res.setHeader('Cache-Control', 'no-store'); res.json({ user, rows: {}, activity: [], mainProjects: access.mainProjects(user.id) }); return; }
    // A limited account with several main projects: the choice of its main projects (each read with its own profile).
    const choice = pilots && user.pilot && user.siteLimited && (user.siteRequired || user.siteId) ? access.choiceRows(user.id, user.pilot) : undefined;
    const siteRows = choice && (choice.sites || []).length > 1 ? { siteRows: choice } : {};
    if (user.siteRequired) { res.setHeader('Cache-Control', 'no-store'); res.json({ user, rows: choice || {}, activity: [], ...siteRows }); return; }
    const rows = Object.fromEntries(RESOURCES.filter(r =>r.key==='attachments'||canResource(user,r.key)).map(r => [r.key, readableRows(req, r.key, true)]));
    const activity = visibleAudit(req, store.activity(100));
    // Pilots: one summary per visible isometric (the same numbers in both pilots) and what Copy isometrics may carry.
    const extra = pilots && user.pilot ? { isoSummaries: rows.isometrics ? isoSummariesFor(store, availability, pilotIsometrics(rows.isometrics, user.pilot)) : {}, copyParts: access.copyParts(user.id, user.siteId) } : {};
    res.setHeader('Cache-Control', 'no-store'); res.json({ user, rows, activity, ...extra, ...siteRows });
  });
  // The company logo of Company data, for the application selector (any signed-in account: it is the workspace's own branding).
  app.get('/api/company-logo', (_req, res) => {
    const logo = pilots ? companyForDocuments(store, documents)?.logo : null;
    if (!logo) throw new AppError(404, 'No company logo is saved.');
    res.setHeader('Content-Type', logo.subarray(0, 4).toString('latin1') === '\x89PNG' ? 'image/png' : 'image/jpeg'); res.setHeader('Cache-Control', 'no-store'); res.send(logo);
  });
  // The bell (hosted profile): the signed-in account's own notifications in the current pilot, nothing else. Each route sees
  // only what `visibleNotifications` lets this account and this main project scope see.
  const viewer = (req: Request): Viewer => {
    const user = (req as unknown as AuthRequest).user;
    if (!pilots || !user.pilot) throw new AppError(404, 'This API endpoint does not exist.');
    const reachable = (row: Row) => { if (!row.resource || !row.recordId) return true; try { return access.visible(user, String(row.resource), store.get(String(row.resource), row.recordId, true)); } catch { return false; } };
    return { id: user.id, pilot: user.pilot, canSee: row => inSiteScope('notifications', row) && reachable(row) };
  };
  app.get('/api/notifications', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(bellOf(store, viewer(req))); });
  app.post('/api/notifications/read-all', (req, res) => { res.json(markAllRead(store, viewer(req))); });
  app.post('/api/notifications/:id/read', (req, res) => { res.json(markRead(store, viewer(req), String(req.params.id))); });
  /** Tell the other accounts that may open a new record about it. A notification never fails the action that caused it. */
  function announce(actorId: string, key: string, result: ReturnType<typeof runAction>) {
    try {
      const order = key === 'transfer-order-create' ? result.record : undefined;
      if (order) {
        const site = String(order.siteId || '') || [order.toWarehouseId, order.fromWarehouseId].map(id => id ? String(store.get('warehouses', id, true).siteId || '') : '').find(Boolean) || '';
        for (const userId of access.recipients('transfer_orders', order, 'mto', actorId)) addNotification(store, { userId, pilot: 'mto', kind: 'transfer-order', title: `New transfer order ${order.number}`, message: `${order.type} · ${order.priority} priority`, link: '/materials/transfer_orders', siteId: site, resource: 'transfer_orders', recordId: order.id });
      }
      const releases = key === 'release' ? result.records : undefined;
      if (releases?.length) {
        const first = releases[0], type = String(first.type);
        const reached = releases.map(row => new Set(access.recipients('releases', row, 'weld', actorId))), everyone = [...reached[0]].filter(id => reached.every(set => set.has(id)));
        for (const userId of everyone) addNotification(store, { userId, pilot: 'weld', kind: 'release', title: `${type} release ${first.number}`, message: `${releases.length} ${releases.length === 1 ? 'isometric' : 'isometrics'} · report ${first.reportNo}`, link: type === 'Hydrotest' ? '/welding/test_systems' : `/welding/releases?view=${type.toLowerCase()}`, siteId: siteOfRecord(store, 'releases', first), resource: 'releases', recordId: first.id });
      }
    } catch { /* the release or the order is saved either way */ }
  }
  /** Isometrics of projects enabled in the pilot (default-deny: an isometric whose project is unknown is left out). */
  const pilotIsometrics = (isos: Row[], pilot: string) => { const projects = new Map(store.list('projects', true).map(row => [row.id, row])); return isos.filter(iso => { const project = projects.get(String(iso.projectId)); return Boolean(project) && projectInPilot(project!, pilot); }); };
  app.get('/api/records/:resource', (req, res) => { const resource = access.resource(String(req.params.resource));if(resource.key!=='attachments')checkResourcePermission(req,resource.key); res.json({ rows: readableRows(req, resource.key, req.query.archived === 'true') }); });
  app.get('/api/history/:resource/:id',(req,res)=>{
    const resource=access.resource(String(req.params.resource));const record=access.record(resource.key,String(req.params.id),true);if(resource.key!=='attachments')checkResourcePermission(req,resource.key,'show',record);
    if(resource.key==='attachments')checkResourcePermission(req,String(record.entityType),'show',store.get(String(record.entityType),record.entityId,true));
    const before=req.query.before===undefined?Number.MAX_SAFE_INTEGER:Number(req.query.before);
    const history=store.history(resource.key,record.id,before);res.setHeader('Cache-Control','no-store');res.json({...history,events:visibleAudit(req,history.events)});
  });
  /** Reports only the Export weld data page downloads (shared/pilots.ts); LISL is left out, Data LISL exports it too. */
  const EXPORT_WELD_DATA_REPORTS = ['wdi', 'inspection-results', 'weld-cards', 'tracer', 'welder', 'open-welds'];
  app.get('/api/reports/:key', async (req,res)=>{
    const definition=REPORTS.find(r=>r.key===req.params.key);if(!definition||(availability&&!Object.hasOwn(availability.reports,definition.key)))throw new AppError(404,'This report does not exist.');
    const user=(req as unknown as AuthRequest).user;if(!canReport(user,definition.key,'export'))throw new AppError(403,'Your permission profile does not allow this report export.');
    // Weld Pilot → Export weld data: its downloads need Export on Export welds (81); LISL is also the Data LISL page's export.
    if(pilots&&user.pilot==='weld'&&EXPORT_WELD_DATA_REPORTS.includes(definition.key)&&!canScope(user,'81','export'))throw new AppError(403,'Your permission profile does not allow this report export.');
    const primary=REPORT_RESOURCES[definition.key]||[];const rows=Object.fromEntries(RESOURCES.filter(r=>canResource(user,r.key)).map(r=>[r.key,readableRows(req,r.key,true).filter(row=>!primary.includes(r.key)||canResource(user,r.key,'export',row))]));
    const filters=Object.fromEntries(['siteId','ndtRequired','projectId','isoId','welderId','clientId','warehouseId','type','from','to'].map(k=>[k,typeof req.query[k]==='string'?String(req.query[k]).slice(0,150):''])) as ReportFilters;
    if(availability&&filters.type&&!availability.inspectionTypes.includes(filters.type))throw new AppError(404,'This resource could not be found.');
    const report=projectReport(availability,buildReport(definition.key,rows,filters));const query=typeof req.query.q==='string'?req.query.q.toLowerCase().slice(0,500):'';
    if(query)report.rows=report.rows.filter(r=>Object.values(r.values).some(v=>String(v??'').toLowerCase().includes(query)));
    if (req.query.format === 'xlsx') { res.attachment(`blitzkrieg-${definition.key}.xlsx`); await reportWorkbook(report).xlsx.write(res); res.end(); return; }
    res.setHeader('Cache-Control','no-store');res.attachment(`blitzkrieg-${definition.key}-${new Date().toISOString().slice(0,10)}.csv`).type('text/csv').send(reportCsv(report));
  });
  registerPdfRoutes({ app, store, documents, availability, readableRows, pilotIsometrics, publicOrigin: options.publicOrigin });
  registerIsoBookRoutes({ app, store, documents, availability, access, readableRows, pilotIsometrics, publicOrigin: options.publicOrigin });
  registerMtoStockRoutes(app, store, availability, access);
  if (pilots) registerCertificationRoutes({ app, store, documents, access, readableRows });
  app.post('/api/records/:resource', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'insert');
    dropCompletionInput(resource.key, req.body);
    access.input(resource.key, req.body); access.owner((req as unknown as AuthRequest).user, resource.key, req.body); access.complete(resource.key, req.body); access.weldRecord(resource.key, req.body);
    if (pilots) requireOwnerSite(resource.key, req.body);
    if (pilots && resource.key === 'punchlists') assertPunchAddAllowed(store, req.body, (req as unknown as AuthRequest).user);
    if (pilots && resource.key === 'users') { assertSiteAccessEdit(store, (req as unknown as AuthRequest).user.id, req.body); assertSiteProfiles(store, req.body); }
    checkItpLinkAccess((req as unknown as AuthRequest).user, resource.key, req.body); access.links((req as unknown as AuthRequest).user, resource.key, req.body);
    if (pilots) checkIsoWrite(store, resource.key, req.body);
    if (resource.readonly) throw new AppError(405, 'Use the workflow action to create this record.');
    const row = store.transaction(() => { if (pilots && resource.key === 'isometrics') assignIrn(store, req.body, actorOf(req)); const row = store.create(resource.key, req.body, actorOf(req)); if (resource.key === 'users') { if (pilots) assertAccountReach(store, (req as unknown as AuthRequest).user.id, store.get('users', row.id)); store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(row.id, passwordHash(req.body.password)); } return row; });
    res.status(201).json({ record: access.project(resource.key, row) });
  });
  app.put('/api/records/:resource/:id', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'edit',access.record(resource.key,String(req.params.id)));
    if (resource.readonly) throw new AppError(405, 'Use the workflow action to change this record.');
    dropCompletionInput(resource.key, req.body);
    access.input(resource.key, req.body, false, access.record(resource.key,String(req.params.id))); access.complete(resource.key, req.body, access.record(resource.key,String(req.params.id))); access.owner((req as unknown as AuthRequest).user, resource.key, req.body, access.record(resource.key,String(req.params.id))); access.weldRecord(resource.key, req.body, access.record(resource.key,String(req.params.id)));
    checkItpLinkAccess((req as unknown as AuthRequest).user, resource.key, req.body, access.record(resource.key,String(req.params.id))); access.links((req as unknown as AuthRequest).user, resource.key, req.body, access.record(resource.key,String(req.params.id)));
    if (pilots) checkIsoWrite(store, resource.key, req.body, access.record(resource.key, String(req.params.id)));
    if (typeof req.body._version !== 'number') throw new AppError(422, 'A record version is required. Refresh and try again.');
    if (pilots && resource.key === 'users') { assertSiteAccessEdit(store, (req as unknown as AuthRequest).user.id, req.body, access.record(resource.key, String(req.params.id))); assertAccountReach(store, (req as unknown as AuthRequest).user.id, access.record(resource.key, String(req.params.id))); assertSiteProfiles(store, req.body); }
    const row = store.transaction(() => {
      const row = store.update(resource.key, String(req.params.id), req.body, req.body._version, actorOf(req));
      if (pilots && resource.key === 'itps') syncItpXRay(store, row, actorOf(req));
      if (pilots && resource.key === 'users') assertAccountReach(store, (req as unknown as AuthRequest).user.id, row);
      if (resource.key === 'users' && req.body.password) { store.db.prepare('INSERT INTO credentials VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash').run(row.id, passwordHash(req.body.password)); store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id); }
      if (resource.key === 'users' || resource.key === 'profiles') ensureAdmin();
      return row;
    }); res.json({ record: access.project(resource.key, row) });
  });
  app.post('/api/records/:resource/:id/archive', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'delete',access.record(resource.key,String(req.params.id),true));
    if (resource.readonly) throw new AppError(405, 'Transaction history cannot be archived.');
    access.archive(resource.key, access.record(resource.key,String(req.params.id),true));
    if (pilots) assertItpDeletable(store, resource.key, String(req.params.id));
    if (pilots && resource.key === 'users') assertAccountReach(store, (req as unknown as AuthRequest).user.id, access.record(resource.key, String(req.params.id), true));
    const row = store.transaction(() => { const row = store.archive(resource.key, String(req.params.id), req.body._version, actorOf(req)); if (['users', 'profiles'].includes(resource.key)) ensureAdmin(); return row; });
    res.json({ record: access.project(resource.key, row) });
  });
  // Tracer proposal of the NDT dialog (reference ajax-weld-dashboard-tracers.php action=list); saving goes through the tracers action.
  app.get('/api/tracer-proposal', (req, res) => {
    if (!ACTIONS.tracers || (availability && !availability.actions.tracers)) throw new AppError(404, 'This resource could not be found.');
    checkResourcePermission(req, 'welds'); checkResourcePermission(req, 'inspection_results');
    const query = { weldId: typeof req.query.weldId === 'string' ? req.query.weldId.slice(0, 80) : '', welderId: typeof req.query.welderId === 'string' ? req.query.welderId.slice(0, 80) : '', pending: req.query.pending === '1' };
    checkResourcePermission(req, 'welds', 'show', access.record('welds', query.weldId));
    res.json({ proposal: inspectionRules(store, actorOf(req)).proposal(query) });
  });
  app.post('/api/actions/:key', (req, res) => {
    const action = ACTIONS[String(req.params.key)]; if (!action || (availability && !availability.actions[action.key])) throw new AppError(404, 'This action does not exist.');
    access.input(action.key, req.body, true);
    const permissionData={...req.body};if(action.key==='inspection-result')permissionData.type=access.record('inspection_requests',req.body.requestId).type;
    // Pilots: the current pilot decides the isometric copy; each ticked part follows its own pilot (see copyParts).
    const copyAcross=pilots&&(action.key==='copy-isometrics'||action.key==='add-new-isometric');
    if(copyAcross)for(const part of ['copyWelds','copyMaterials','copyCalculations'] as const)delete permissionData[part];
    checkActionPermission(req,action.key,permissionData);
    if(copyAcross)assertCopyInScope(store,store.get('users',(req as unknown as AuthRequest).user.id),req.body);
    if(copyAcross){const parts=access.copyParts((req as unknown as AuthRequest).user.id);for(const [part,rule] of Object.entries(parts))if(req.body[part]===true&&!rule.allowed)throw new AppError(403,rule.reason||'Your permission profile does not allow this action.');}
    if (pilots && action.key === 'duplicate-site') { const parts = duplicateParts(req.body.parts ?? []); if (parts) for (const resource of duplicateReadResources(parts)) checkResourcePermission(req, resource); }
    const done = runAction(store, action.key, req.body, actorOf(req), { inspectionRules: Boolean(availability?.features.includes('inspections')), hosted: Boolean(availability?.features.includes('pilots')) });
    if (pilots) announce((req as unknown as AuthRequest).user.id, action.key, done);
    res.status(201).json(access.result(done));
  });
  app.post('/api/bulk/:resource', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'edit');
    if (resource.readonly || resource.key === 'users') throw new AppError(405, 'Bulk editing is unavailable for this record type.');
    if (!Array.isArray(req.body.ids) || !req.body.ids.length || req.body.ids.length > 500 || new Set(req.body.ids).size !== req.body.ids.length) throw new AppError(422, 'Select between 1 and 500 unique records.');
    if (!req.body.changes || typeof req.body.changes !== 'object' || Array.isArray(req.body.changes) || !Object.keys(req.body.changes).length) throw new AppError(422, 'Choose fields to update.');
    // Mass edit materials (pilots): every filled field at once, never Material No.
    if (pilots && resource.key === 'materials') req.body.changes = materialMassEdit(req.body.changes);
    dropCompletionInput(resource.key, req.body.changes);
    access.input(resource.key, req.body.changes);
    if (pilots && resource.key === 'isometrics' && ['xRay', 'itpId', 'itp2Id'].some(name => Object.hasOwn(req.body.changes, name))) throw new AppError(422, 'X Ray % and the ITP links cannot be bulk edited. Use Link ITP on the isometric.');
    // Welding wires and certificates (hosted): only Controlled / Accepted, each Yes or No (true / false).
    if (pilots && FLAG_BULK_RESOURCES.includes(resource.key) && !flagBulkAllowed(req.body.changes)) throw new AppError(404, 'This resource could not be found.');
    if (availability?.features.includes('pilots') && enablementKey(resource.key) && Object.keys(req.body.changes).some(k => !ENABLEMENT_INPUT.includes(k))) throw new AppError(404, 'This resource could not be found.');
    if (Object.keys(req.body.changes).some(k => !resource.fields.some(f => f.name === k && f.type !== 'password') && !(enablementKey(resource.key) && ENABLEMENT_INPUT.includes(k)))) throw new AppError(422, 'An update field is invalid.');
    const records = store.transaction(() => { const result = req.body.ids.map((id: string) => (checkResourcePermission(req,resource.key,'edit',store.get(resource.key,id)),access.complete(resource.key, req.body.changes, store.get(resource.key,id)),access.links((req as unknown as AuthRequest).user, resource.key, req.body.changes, store.get(resource.key,id)),store.update(resource.key, id, req.body.changes, req.body.versions?.[id], actorOf(req)))); if (resource.key === 'profiles') ensureAdmin(); return result; }); res.json({ count: records.length });
  });
  /** Flag columns of the isometrics list for an export: the server summary of each exported (readable) isometric, as in both pilots' list. */
  const isoFlagExport = (isos: Row[]) => {
    const planning = Boolean(availability?.features.includes('project-planning'));
    const columns = ISO_LIST_COLUMNS.filter(column => column.flag && (column.flag !== 'e' || planning)).map(column => ({ name: column.key, label: column.label, type: 'text' as const }));
    const summaries = isoSummariesFor(store, availability, isos);
    return { columns, value: (row: Row, name: string) => { const column = ISO_LIST_COLUMNS.find(item => item.key === name && item.flag); return column ? flagText(summaries[row.id]?.flags[column.flag!] ?? null) : undefined; } };
  };
  const exportRows = (req: Request) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'export');
    const selected = typeof req.query.ids === 'string' ? new Set(req.query.ids.split(',')) : null;
    const rows = readableRows(req, resource.key, req.query.archived === 'true').filter(r => (!selected || selected.has(r.id))&&canResource((req as AuthRequest).user,resource.key,'export',r));
    const fields = [...resource.fields.filter(f => f.type !== 'password'&&!f.hidden&&!(pilots&&WELD_DATA_EXPORT_HIDDEN[resource.key]?.includes(f.name))),...relationFields(resource.key)].filter(f => access.field(resource.key, f.name));
    // The isometrics list of the hosted profile also exports its flag columns as Yes / No / n/a (n/a: not applicable).
    const flagExport = resource.key === 'isometrics' && availability?.features.includes('pilots') ? isoFlagExport(rows) : undefined;
    if (flagExport) fields.push(...flagExport.columns);
    const visibleLabel=(target:string,id:unknown)=>{try{const record=store.get(target,id,true);if(!access.visible((req as AuthRequest).user,target,record))return 'Unavailable record';return store.display(target,record);}catch(error){return isSiteRefusal(error)?'Unavailable record':'Archived record';}};
    const output = rows.map(row => Object.fromEntries(fields.map(f => {const flagValue=flagExport?.value(row,f.name);if(flagValue!==undefined)return [f.label,flagValue];const relation=(RELATIONS[resource.key]||[]).find(r=>r.field===f.name);if(relation)return [f.label,JSON.stringify(store.list(relation.resource).filter(l=>l[relation.ownerKey]===row.id&&inSiteScope(relation.resource,l)).map(l=>visibleLabel(relation.target,l[relation.targetKey])))];let value = row[f.name]; if (f.ref && value)value=visibleLabel(f.ref,value);if (typeof value === 'boolean') value = value ? 'Yes' : 'No'; return [f.label, value ?? '']; })));
    return { resource, output, fields };
  };
  // MTO Pilot, Service request -> Export: the spool list as an Excel file, in the order of the page (Last request ascending) and after its filters.
  app.get('/api/export-spools', async (req, res) => {
    if (!availability?.features.includes('pilots')) throw new AppError(404, 'This resource could not be found.');
    checkResourcePermission(req, 'spools', 'export'); checkResourcePermission(req, 'service_requests', 'show');
    const rows = Object.fromEntries(['projects', 'isometrics', 'spools', 'service_requests', 'laydowns', 'service_companies'].map(key => [key, readableRows(req, key)])) as Record<string, Row[]>;
    const query = (name: string) => typeof req.query[name] === 'string' ? String(req.query[name]).slice(0, 150) : '';
    const filters = { projectId: query('projectId'), spoolName: query('spoolName'), show: query('show'), paintSpec: query('paintSpec'), diameter: query('diameter'), chemicalClean: query('chemicalClean'), currently: query('currently'), lastReport: query('lastReport') };
    const names = (resource: string, id: string) => { const row = rows[resource]?.find(item => item.id === id); return row ? store.display(resource, row) : ''; };
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('Service request'); sheet.columns = SPOOL_EXPORT_COLUMNS.map(header => ({ header, key: header, width: 20 }));
    sheet.addRows(spoolExportLines(rows, filters, names));
    sheet.getRow(1).font = { name: 'Outfit', bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment('blitzkrieg-spools.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  app.get('/api/export/:resource', async (req, res) => {
    const { resource, output, fields } = exportRows(req);
    if (req.query.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
      const sheet = workbook.addWorksheet(resource.title.slice(0, 31)); sheet.columns = fields.map(f => ({ header: f.label, key: f.label, width: 24 })); sheet.addRows(output);
      sheet.getRow(1).font = { name: 'Outfit', bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
      res.attachment(`blitzkrieg-${resource.key}.xlsx`); await workbook.xlsx.write(res); res.end();
    } else { res.attachment(`blitzkrieg-${resource.key}.csv`); res.type('text/csv'); res.send(stringify(output, { header: true, columns: fields.map(f => f.label), escape_formulas: true })); }
  });
  const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.post('/api/import/:resource/preview', memory.single('file'), (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'import');
    if (resource.readonly || resource.module === 'settings') throw new AppError(405, 'CSV import is not available for this record type.');
    if (!req.file) throw new AppError(422, 'Choose a CSV file.');
    let raw: Record<string, string>[]; try { raw = parse(req.file.buffer, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 100_000 }); } catch { throw new AppError(422, 'This CSV could not be read. Check its headers and delimiters.'); }
    if (!raw.length || raw.length > 1000) throw new AppError(422, 'Import between 1 and 1,000 rows at a time.');
    const converted = raw.map(row =>{const result:Record<string,unknown>= Object.fromEntries(resource.fields.filter(f => f.type !== 'password').map(f => {
      let value: unknown = row[f.name] ?? row[f.label] ?? f.aliases?.map(alias => row[alias]).find(item => item !== undefined) ?? f.default??'';
      if (f.type === 'number') value = value === '' ? null : Number(String(value).replace(',', '.'));
      if (f.type === 'checkbox') value = ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
      if (f.ref && value) { const choices = store.list(f.ref).filter(r => (r.id === value || store.display(f.ref!, r) === value)&&(!f.refCategory||r.category===f.refCategory)); value = choices.length === 1 ? choices[0].id : value; }
      return [f.name, value];
    }));for(const relation of RELATIONS[resource.key]||[]){const rawValue=row[relation.field]??row[relation.label];if(rawValue===undefined)continue;let values:unknown;try{values=JSON.parse(rawValue||'[]');}catch{values=rawValue.split('|').map(v=>v.trim()).filter(Boolean);}result[relation.field]=Array.isArray(values)?values.map(value=>{const choices=store.list(relation.target).filter(r=>r.id===value||store.display(relation.target,r)===value);return choices.length===1?choices[0].id:value;}):values;}return result;});
    const errors: { row: number; message: string; fields?: Record<string, string> }[] = [];
    store.transaction(() => {
      store.db.exec('SAVEPOINT import_preview');
      try { converted.forEach((row, i) => {
        store.db.exec('SAVEPOINT import_row');
        try { store.create(resource.key, row, actorOf(req)); store.db.exec('RELEASE import_row'); }
        catch (error) { store.db.exec('ROLLBACK TO import_row; RELEASE import_row'); const e = store.translate(error) as AppError; errors.push({ row: i + 2, message: e.message, fields: e.fields }); }
      }); }
      finally { store.db.exec('ROLLBACK TO import_preview; RELEASE import_preview'); }
    });
    res.json({ rows: converted, errors, count: converted.length });
  });
  app.post('/api/import/:resource', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'import');
    if (resource.readonly || resource.module === 'settings') throw new AppError(405, 'CSV import is not available for this record type.');
    if (!Array.isArray(req.body.rows) || !req.body.rows.length || req.body.rows.length > 1000) throw new AppError(422, 'Import between 1 and 1,000 rows.');
    const records = store.transaction(() => req.body.rows.map((row: Record<string, unknown>) => store.create(resource.key, row, actorOf(req)))); res.status(201).json({ count: records.length });
  });
  app.get('/api/import/:resource/template', (req, res) => { const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'import'); res.attachment(`blitzkrieg-${resource.key}-template.csv`); res.type('text/csv').send(stringify([], { header: true, columns: [...resource.fields.filter(f => f.type !== 'password'&&!f.hidden),...relationFields(resource.key)].map(f => f.label) })); });
  const disk = keepSiteScope(documents.upload);
  app.post('/api/revisions',disk.single('file'),(req,res)=>{
    try{
      access.input('revision',req.body,true);checkActionPermission(req,'revision',req.body);if(req.file)checkResourcePermission(req,'revisions','import');
      const name=req.file?basename(req.file.originalname).replace(/[\r\n]/g,''):'';
      if(req.file&&!/\.(pdf|png|jpe?g|webp|csv|xlsx|docx|txt)$/i.test(name))throw new AppError(422,'Choose a PDF, image, CSV, Excel, Word, or text file.');if(pilots&&req.file&&!/\.pdf$/i.test(name))throw new AppError(422,'Choose a PDF file for the revision.');
      const result=store.transaction(()=>{
        const revision=runAction(store,'revision',req.body,actorOf(req));
        const record=revision.record!;
        if(req.file){
          const attachment=store.create('attachments',{name,entityType:'revisions',entityId:record.id,documentType:`${record.type} revision ${record.revNo}`,mime:req.file.mimetype,size:req.file.size,note:record.comment||''},actorOf(req));
          documents.save(attachment.id,req.file);
        }
        return revision;
      });
      res.status(201).json(access.result(result));
    }catch(error){documents.discard(req.file);throw error;}
  });
  if (pilots) registerPunchRoutes(app, { store, documents, access, upload: disk });
  // ITPs page: Add ITP with its PDF, Upload revision, Link ITP / Unlink, Import from isometrics (server/itps.ts).
  if (pilots) registerItpRoutes(app, { store, documents, access, upload: disk });
  // Options of the isometric page: Attachments (several PDFs, delete) and the Audit trail of the isometric with its welds (server/iso-dialogs.ts).
  if (pilots) registerIsoDialogRoutes(app, { store, documents, access });
  // WPS per project site, copies, PQR attribute values and Import PQR (server/wps.ts).
  if (pilots) registerWpsRoutes(app, { store, access });
  if (pilots) registerMaterialDbRoutes(app, { store, access });
  app.post('/api/files', disk.single('file'), (req, res) => {
    try {
      const key = String(req.body.entityType); access.resource(key); const target=access.record(key,req.body.entityId); if(key==='attachments')throw new AppError(404,'This resource could not be found.'); checkResourcePermission(req,key,'import',target);
      if (!req.file) throw new AppError(422, 'Choose a file.');
      if (pilots && key === 'punchlists') assertPunchFileAllowed(store, target, req.body.documentType);
      const name = basename(req.file.originalname).replace(/[\r\n]/g, '');
      if (!/\.(pdf|png|jpe?g|webp|csv|xlsx|docx|txt)$/i.test(name)) throw new AppError(422, 'Choose a PDF, image, CSV, Excel, Word, or text file.');
      const inspectionFile = inspectionFileError(req.body.documentType, name); if (inspectionFile) throw new AppError(422, inspectionFile);
      if (pilots && key === 'wps' && !/\.pdf$/i.test(name)) throw new AppError(422, 'Choose a PDF file for the WPS document.');
      // A new signature image replaces the current one; earlier images stay as attachments (history).
      const signature = pilots && key === 'signatures';
      if (signature || pilots && key === 'company_data') assertSignatureImage(req.file);
      const record = store.transaction(() => { const row = store.create('attachments', { name, entityType: key, entityId: req.body.entityId, documentType: signature ? String(target.kind) : req.body.documentType || 'Attachment', mime: req.file!.mimetype, size: req.file!.size, note: req.body.note || '' }, actorOf(req)); documents.save(row.id, req.file!); return row; });
      res.status(201).json({ record });
    } catch (error) { documents.discard(req.file); throw error; }
  });
  app.get('/api/files/:id', (req, res) => {
    const file = access.record('attachments', String(req.params.id)); checkResourcePermission(req,String(file.entityType),'show',access.record(String(file.entityType),file.entityId,true));
    documents.download(file.id, String(file.name), res);
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'This API endpoint does not exist.')));
  const dist = resolve(options.distDir || (options.releaseProfile === 'access-prototype' ? 'dist-access-prototype' : availability ? 'dist-welding-demo' : 'dist'));
  if (options.serveClient !== false && existsSync(join(dist, 'index.html'))) {
    app.use((req, res, next) => {
      if (availability && (/\.map$/i.test(req.path) || /^\/(?:README\.md|PARITY\.md|reference|server|shared|client|tests|\.env)(?:\/|$)/i.test(req.path))) return res.status(404).type('text').send('Page not found.');
      next();
    });
    app.use(express.static(dist, { dotfiles: 'deny' }));
    app.get('/{*path}', (req, res) => {
      if (!pageAvailable(availability, req.path, RESOURCES) || (availability && pagePath(availability, req.path) === '/welding/reports' && req.query.report && !Object.hasOwn(availability.reports,String(req.query.report)))) res.status(404);
      // Relative to the client folder: `send` refuses an absolute path with a dot segment (a checkout under `.claude/`, for example).
      res.sendFile('index.html', { root: dist });
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const translated = store.translate(error);
    if (translated instanceof AppError) {
      // Error handlers see no route params. Record routes name their resource in the path and may only name delivered fields; action routes name the fields of their own dialog.
      const recordKey=/^\/api\/(?:records|bulk)\/([^/?]+)/.exec(_req.path)?.[1]||(/^\/api\/actions\/(?:save-weld|add-welds|mass-edit-welds|reorder-welds)$/.test(_req.path)?'welds':'');
      const key=String(_req.params.resource||recordKey);
      const answer=refusalBody(translated,{hosted:Boolean(availability),deliver:key?name=>access.field(key,name):undefined});
      res.status(answer.status).json(answer.body);
    }
    else if (translated instanceof multer.MulterError) res.status(422).json({ error: 'The file is too large or could not be uploaded.' });
    else if (translated instanceof SyntaxError) res.status(400).json({ error: 'The request contains invalid JSON.' });
    else { console.error(translated); res.status(500).json({ error: 'Something went wrong. Your changes were not saved.' }); }
  });
  return app;
}
