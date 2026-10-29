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
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { ACTIONS } from '../shared/actions.ts';
import { RELATIONS,relationFields } from '../shared/welding.ts';
import { REPORTS, buildReport, reportCsv, type ReportFilters } from '../shared/reports.ts';
import { canResource,canReport,REPORT_RESOURCES } from '../shared/permissions.ts';
import type { Row, Module } from '../shared/types.ts';
import { actorOf, authMiddleware, checkPermission,checkResourcePermission,checkActionPermission, ensureAdministrator, hashToken, newSession, passwordHash, passwordMatches, publicUser, sessionCookie, type AuthRequest } from './auth.ts';

import { availabilityFor, pageAvailable, projectReport, type ReleaseProfile } from '../shared/release.ts';
import { releaseAccess } from './release-access.ts';
import { documentStorage, type DocumentStorage } from './documents.ts';
import { reportWorkbook } from './report-export.ts';

export function createApp(store: Store, dataDir: string, options: { releaseProfile?: ReleaseProfile; distDir?: string; serveClient?: boolean; publicOrigin?: string; documentStorage?: DocumentStorage; initializeStorage?: boolean; secureCookies?: boolean; sampleWorkspace?: boolean } = {}) {
  const app = express(); app.disable('x-powered-by');
  const availability = availabilityFor(options.releaseProfile || 'full');
  const cookieName = options.releaseProfile === 'access-prototype' ? 'blitzkrieg_prototype_session' : availability ? 'blitzkrieg_session' : 'stelux_session';
  const access = releaseAccess(store, availability);
  const presentUser = (id: string) => access.user(publicUser(store, id));
  const readableRows = (req: Request, key: string, archived = false) => store.list(key, archived).filter(row => access.visible((req as AuthRequest).user, key, row)).map(row => access.project(key, row));
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
    const requiresSetup = store.list('users').length === 0;
    const session = store.db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(sessionCookie(req, cookieName)), new Date().toISOString()) as { user_id: string } | undefined;
    let user; try { if (session) user = presentUser(session.user_id); } catch { /* expired or deactivated */ }
    res.setHeader('Cache-Control', 'no-store'); res.json({ requiresSetup, user: user || null, sampleWorkspace: options.sampleWorkspace !== false, ...(availability ? { availability } : {}) });
  });
  app.post('/api/auth/setup', (req, res) => {
    const user = store.transaction(() => {
      if (store.list('users').length) throw new AppError(409, 'This workspace already has an administrator. Sign in instead.');
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
  app.use('/api', (req, _res, next) => {
    (req as AuthRequest).user = access.user((req as AuthRequest).user);
    const projectBulk = availability?.features.includes('project-bulk-edit') && /^\/bulk\/(?:projects|isometrics)$/.test(req.path);
    if (availability && (/^\/import(?:\/|$)/.test(req.path) || /^\/bulk(?:\/|$)/.test(req.path) && !projectBulk || req.path === '/revisions')) return next(new AppError(404, 'This resource could not be found.'));
    next();
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
    const rows = Object.fromEntries(RESOURCES.filter(r =>r.key==='attachments'||canResource(user,r.key)).map(r => [r.key, readableRows(req, r.key, true)]));
    const activity = visibleAudit(req, store.activity(100));
    res.setHeader('Cache-Control', 'no-store'); res.json({ user, rows, activity });
  });
  app.get('/api/records/:resource', (req, res) => { const resource = access.resource(String(req.params.resource));if(resource.key!=='attachments')checkResourcePermission(req,resource.key); res.json({ rows: readableRows(req, resource.key, req.query.archived === 'true') }); });
  app.get('/api/history/:resource/:id',(req,res)=>{
    const resource=access.resource(String(req.params.resource));const record=access.record(resource.key,String(req.params.id),true);if(resource.key!=='attachments')checkResourcePermission(req,resource.key,'show',record);
    if(resource.key==='attachments')checkResourcePermission(req,String(record.entityType),'show',store.get(String(record.entityType),record.entityId,true));
    const before=req.query.before===undefined?Number.MAX_SAFE_INTEGER:Number(req.query.before);
    const history=store.history(resource.key,record.id,before);res.setHeader('Cache-Control','no-store');res.json({...history,events:visibleAudit(req,history.events)});
  });
  app.get('/api/reports/:key', async (req,res)=>{
    const definition=REPORTS.find(r=>r.key===req.params.key);if(!definition||(availability&&!Object.hasOwn(availability.reports,definition.key)))throw new AppError(404,'This report does not exist.');
    const user=(req as unknown as AuthRequest).user;if(!canReport(user,definition.key,'export'))throw new AppError(403,'Your permission profile does not allow this report export.');
    const primary=REPORT_RESOURCES[definition.key]||[];const rows=Object.fromEntries(RESOURCES.filter(r=>canResource(user,r.key)).map(r=>[r.key,readableRows(req,r.key,true).filter(row=>!primary.includes(r.key)||canResource(user,r.key,'export',row))]));
    const filters=Object.fromEntries(['siteId','ndtRequired','projectId','isoId','welderId','clientId','warehouseId','type','from','to'].map(k=>[k,typeof req.query[k]==='string'?String(req.query[k]).slice(0,150):''])) as ReportFilters;
    if(availability&&filters.type&&!availability.inspectionTypes.includes(filters.type))throw new AppError(404,'This resource could not be found.');
    const report=projectReport(availability,buildReport(definition.key,rows,filters));const query=typeof req.query.q==='string'?req.query.q.toLowerCase().slice(0,500):'';
    if(query)report.rows=report.rows.filter(r=>Object.values(r.values).some(v=>String(v??'').toLowerCase().includes(query)));
    if (req.query.format === 'xlsx') { res.attachment(`blitzkrieg-${definition.key}.xlsx`); await reportWorkbook(report).xlsx.write(res); res.end(); return; }
    res.setHeader('Cache-Control','no-store');res.attachment(`blitzkrieg-${definition.key}-${new Date().toISOString().slice(0,10)}.csv`).type('text/csv').send(reportCsv(report));
  });
  app.post('/api/records/:resource', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'insert');
    access.input(resource.key, req.body);
    if (resource.readonly) throw new AppError(405, 'Use the workflow action to create this record.');
    const row = store.transaction(() => { const row = store.create(resource.key, req.body, actorOf(req)); if (resource.key === 'users') store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(row.id, passwordHash(req.body.password)); return row; });
    res.status(201).json({ record: access.project(resource.key, row) });
  });
  app.put('/api/records/:resource/:id', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'edit',access.record(resource.key,String(req.params.id)));
    if (resource.readonly) throw new AppError(405, 'Use the workflow action to change this record.');
    access.input(resource.key, req.body, false, access.record(resource.key,String(req.params.id)));
    if (typeof req.body._version !== 'number') throw new AppError(422, 'A record version is required. Refresh and try again.');
    const row = store.transaction(() => {
      const row = store.update(resource.key, String(req.params.id), req.body, req.body._version, actorOf(req));
      if (resource.key === 'users' && req.body.password) { store.db.prepare('INSERT INTO credentials VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash').run(row.id, passwordHash(req.body.password)); store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id); }
      if (resource.key === 'users' || resource.key === 'profiles') ensureAdministrator(store);
      return row;
    }); res.json({ record: access.project(resource.key, row) });
  });
  app.post('/api/records/:resource/:id/archive', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'delete',access.record(resource.key,String(req.params.id),true));
    if (resource.readonly) throw new AppError(405, 'Transaction history cannot be archived.');
    const row = store.transaction(() => { const row = store.archive(resource.key, String(req.params.id), req.body._version, actorOf(req)); if (['users', 'profiles'].includes(resource.key)) ensureAdministrator(store); return row; });
    res.json({ record: access.project(resource.key, row) });
  });
  app.post('/api/actions/:key', (req, res) => {
    const action = ACTIONS[String(req.params.key)]; if (!action || (availability && !availability.actions[action.key])) throw new AppError(404, 'This action does not exist.');
    access.input(action.key, req.body, true);
    const permissionData={...req.body};if(action.key==='inspection-result')permissionData.type=access.record('inspection_requests',req.body.requestId).type;checkActionPermission(req,action.key,permissionData);
    res.status(201).json(access.result(runAction(store, action.key, req.body, actorOf(req))));
  });
  app.post('/api/bulk/:resource', (req, res) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'edit');
    if (resource.readonly || resource.key === 'users') throw new AppError(405, 'Bulk editing is unavailable for this record type.');
    if (!Array.isArray(req.body.ids) || !req.body.ids.length || req.body.ids.length > 500 || new Set(req.body.ids).size !== req.body.ids.length) throw new AppError(422, 'Select between 1 and 500 unique records.');
    if (!req.body.changes || typeof req.body.changes !== 'object' || Array.isArray(req.body.changes) || !Object.keys(req.body.changes).length) throw new AppError(422, 'Choose fields to update.');
    access.input(resource.key, req.body.changes);
    if (Object.keys(req.body.changes).some(k => !resource.fields.some(f => f.name === k && f.type !== 'password'))) throw new AppError(422, 'An update field is invalid.');
    const records = store.transaction(() => { const result = req.body.ids.map((id: string) => (checkResourcePermission(req,resource.key,'edit',store.get(resource.key,id)),store.update(resource.key, id, req.body.changes, req.body.versions?.[id], actorOf(req)))); if (resource.key === 'profiles') ensureAdministrator(store); return result; }); res.json({ count: records.length });
  });
  const exportRows = (req: Request) => {
    const resource = access.resource(String(req.params.resource)); checkResourcePermission(req,resource.key,'export');
    const selected = typeof req.query.ids === 'string' ? new Set(req.query.ids.split(',')) : null;
    const rows = readableRows(req, resource.key, req.query.archived === 'true').filter(r => (!selected || selected.has(r.id))&&canResource((req as AuthRequest).user,resource.key,'export',r));
    const fields = [...resource.fields.filter(f => f.type !== 'password'&&!f.hidden),...relationFields(resource.key)].filter(f => access.field(resource.key, f.name));
    const visibleLabel=(target:string,id:unknown)=>{try{const record=store.get(target,id,true);if(!access.visible((req as AuthRequest).user,target,record))return 'Unavailable record';return store.display(target,record);}catch{return 'Archived record';}};
    const output = rows.map(row => Object.fromEntries(fields.map(f => {const relation=(RELATIONS[resource.key]||[]).find(r=>r.field===f.name);if(relation)return [f.label,JSON.stringify(store.list(relation.resource).filter(l=>l[relation.ownerKey]===row.id).map(l=>visibleLabel(relation.target,l[relation.targetKey])))];let value = row[f.name]; if (f.ref && value)value=visibleLabel(f.ref,value);if (typeof value === 'boolean') value = value ? 'Yes' : 'No'; return [f.label, value ?? '']; })));
    return { resource, output, fields };
  };
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
      let value: unknown = row[f.name] ?? row[f.label] ?? f.default??'';
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
  const disk = documents.upload;
  app.post('/api/revisions',disk.single('file'),(req,res)=>{
    try{
      checkActionPermission(req,'revision',req.body);if(req.file)checkResourcePermission(req,'revisions','import');
      const name=req.file?basename(req.file.originalname).replace(/[\r\n]/g,''):'';
      if(req.file&&!/\.(pdf|png|jpe?g|webp|csv|xlsx|docx|txt)$/i.test(name))throw new AppError(422,'Choose a PDF, image, CSV, Excel, Word, or text file.');
      const result=store.transaction(()=>{
        const revision=runAction(store,'revision',req.body,actorOf(req));
        const record=revision.record!;
        if(req.file){
          const attachment=store.create('attachments',{name,entityType:'revisions',entityId:record.id,documentType:`${record.type} revision ${record.revNo}`,mime:req.file.mimetype,size:req.file.size,note:record.comment||''},actorOf(req));
          documents.save(attachment.id,req.file);
        }
        return revision;
      });
      res.status(201).json(result);
    }catch(error){documents.discard(req.file);throw error;}
  });
  app.post('/api/files', disk.single('file'), (req, res) => {
    try {
      const key = String(req.body.entityType); access.resource(key); const target=access.record(key,req.body.entityId); if(key==='attachments')throw new AppError(404,'This resource could not be found.'); checkResourcePermission(req,key,'import',target);
      if (!req.file) throw new AppError(422, 'Choose a file.');
      const name = basename(req.file.originalname).replace(/[\r\n]/g, '');
      if (!/\.(pdf|png|jpe?g|webp|csv|xlsx|docx|txt)$/i.test(name)) throw new AppError(422, 'Choose a PDF, image, CSV, Excel, Word, or text file.');
      const record = store.transaction(() => { const row = store.create('attachments', { name, entityType: key, entityId: req.body.entityId, documentType: req.body.documentType || 'Attachment', mime: req.file!.mimetype, size: req.file!.size, note: req.body.note || '' }, actorOf(req)); documents.save(row.id, req.file!); return row; });
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
      if (!pageAvailable(availability, req.path, RESOURCES) || (availability && req.path === '/welding/reports' && req.query.report && !Object.hasOwn(availability.reports,String(req.query.report)))) res.status(404);
      res.sendFile(join(dist, 'index.html'));
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const translated = store.translate(error);
    if (translated instanceof AppError) {
      const key=String(_req.params.resource||'');
      const fields=translated.fields?Object.fromEntries(Object.entries(translated.fields).filter(([name])=>access.field(key,name))):undefined;
      const message=availability&&translated.status===409?'This record is in use or has changed. Refresh and check its linked records.':availability&&translated.fields&&!Object.keys(fields||{}).length?'Please check the record and try again.':translated.message;
      res.status(translated.status).json({ error: message, ...(fields&&Object.keys(fields).length?{fields}:{}) });
    }
    else if (translated instanceof multer.MulterError) res.status(422).json({ error: 'The file is too large or could not be uploaded.' });
    else if (translated instanceof SyntaxError) res.status(400).json({ error: 'The request contains invalid JSON.' });
    else { console.error(translated); res.status(500).json({ error: 'Something went wrong. Your changes were not saved.' }); }
  });
  return app;
}
