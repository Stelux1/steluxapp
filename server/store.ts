import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { MATERIAL_FIELDS } from '../shared/materials.ts';
import { RELATIONS, relationMatches } from '../shared/welding.ts';
import { SITE_REFUSED } from '../shared/site-scope.ts';
import { parsePermissionRules } from '../shared/permissions.ts';
import { validateProgressWeights } from '../shared/site-settings.ts';
import { isoBudgets, isoInputErrors } from '../shared/iso-status.ts';
import { hydrotestErrors, spoolsOfSystem } from '../shared/hydrotest.ts';
import { flangeInputErrors, flangeStoredValue } from '../shared/flanges.ts';
import { isoItpLinks, itpSlotRefresh } from '../shared/itp-dashboard.ts';
import { nextPunchNumber, normalizePunch, punchInputErrors } from '../shared/punch.ts';
import type { Row, RecordData, AuditEvent, Resource, Value } from '../shared/types.ts';
import type { Database } from './database.ts';
import { initializePostgres } from './postgres-schema.ts';
import { applyEnablement, defectNormSaved, enablementErrors } from './weld-catalogs.ts';
import { ENABLEMENT_INPUT } from '../shared/weld-catalogs.ts';
import { isStandardDefectCode } from '../shared/defect-codes.ts';
import { isWelderRole } from '../shared/welder-data.ts';
import { archiveWelderQualifications, prepareWelderData, restoreWelderQualifications } from './welder-data.ts';
import { HOSTED_OPTIONAL, hostedFreeValue } from '../shared/welder-data.ts';
import { pqrNumber } from '../shared/wps.ts';
import { UOM_IN_USE, nextPhaseNumber, resolveMaterialUom, uomOfMaterial } from '../shared/material-db.ts';

export class AppError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public code?: string) { super(message); }
  /** `conflict`: a version conflict or a blocked delete (hosted answers use the generic sentence); `duplicate`: a key that exists, the sentence names it. */
  kind?: 'conflict' | 'duplicate';
}
const conflict = (message: string) => Object.assign(new AppError(409, message), { kind: 'conflict' as const });
export interface Actor {
  id: string; name: string;
  /** Requests only: whether the account may add records to a resource. Asked where a write adds a record on the side (a new reusable value typed into a form field); system code has no limit. */
  canAdd?: (resource: string) => boolean;
}
export const SYSTEM: Actor = { id: 'system', name: 'Stelux' };
export const today = () => new Date().toISOString().slice(0, 10);
export const qty = (value: unknown) => Math.round(Number(value) * 1_000_000) / 1_000_000;
export const positive = (value: unknown, name = 'Quantity') => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new AppError(422, `${name} must be greater than zero.`);
  const rounded = qty(value);
  if (rounded <= 0) throw new AppError(422, `${name} is too small.`);
  return rounded;
};
export function validDate(value: unknown, label = 'Date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AppError(422, `${label} must be a valid date.`);
  return value;
}
const table = (key: string) => { if (!RESOURCE_MAP[key]) throw new AppError(404, 'This record type does not exist.'); return `"${key}"`; };
const unpack = (row: Record<string, unknown>): Row => ({ ...JSON.parse(String(row.data)), id: String(row.id), _version: Number(row.version), _archived: Boolean(row.archived), _createdAt: String(row.created_at), _updatedAt: String(row.updated_at) });
const unpackAudit=(r:Record<string,unknown>):AuditEvent=>({id:String(r.id),entityType:String(r.entity_type),entityId:String(r.entity_id),action:String(r.action),summary:String(r.summary),actorId:String(r.actor_id),actorName:String(r.actor_name),createdAt:String(r.created_at)});

export class Store {
  db: Database;
  depth = 0;
  /** Hosted workspace rules (welder data, certificates): set by createApp when the release profile delivers pilots. */
  hostedRules = false;
  /** The pilots profile requires a material group on every catalog material it saves; other profiles and system code do not. */
  requireMaterialGroup = false;
  /** Access per project site (server/site-scope.ts): called with every record read through `get`, so a record of a main project the request may not reach is refused (written records are read back, so writes are covered too). */
  recordGuard?: (key: string, row: Row) => void;
  private guardAllows(key: string, row: Row) { try { this.recordGuard?.(key, row); return true; } catch { return false; } }
  /**
   * A test system, its hydrotest releases and its results decide the hydrotest of every isometric with a spool in the
   * system (shared/hydrotest.ts). A test system may hold spools of several projects and main projects: under access per
   * project site each of those isometrics is read, so a write that would change the hydrotest of an isometric the request
   * cannot reach is refused (server/site-scope.ts).
   */
  private guardTestSystem(key: string, row: Partial<Row>) {
    if (!this.recordGuard || (key !== 'test_systems' && key !== 'hydrotest_requests' && key !== 'hydrotest_results')) return;
    const systemId = key === 'test_systems' ? row.id : row.testSystemId;
    if (typeof systemId !== 'string' || !systemId) return;
    const isometrics = this.list('isometrics');
    const ids = new Set([...isometrics.filter(item => item.testSystemId === systemId).map(item => item.id), ...spoolsOfSystem(systemId, { spools: this.list('spools'), isometrics }).map(entry => String(entry.spool.isoId))]);
    for (const id of ids) this.get('isometrics', id);
  }
  constructor(public filename: string, database?: Database, options: { initialize?: boolean } = {}) {
    if (!database && filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = database || new DatabaseSync(filename);
    if (options.initialize === false) return;
    if (this.db.dialect === 'postgres') initializePostgres(this.db);
    else {
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    for (const resource of RESOURCES) {
      const refs = resource.fields.filter(f => f.ref).map(f => `"${f.name}" TEXT GENERATED ALWAYS AS (nullif(json_extract(data, '$.${f.name}'), '')) STORED REFERENCES "${f.ref}"(id)`).join(',');
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table(resource.key)} (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL${refs ? ',' + refs : ''});`);
      const columns = new Set((this.db.prepare(`PRAGMA table_xinfo(${table(resource.key)})`).all() as {name:string}[]).map(c => c.name));
      for (const f of resource.fields.filter(f => f.ref && !columns.has(f.name))) this.db.exec(`ALTER TABLE ${table(resource.key)} ADD COLUMN "${f.name}" TEXT GENERATED ALWAYS AS (nullif(json_extract(data, '$.${f.name}'), '')) VIRTUAL REFERENCES "${f.ref}"(id)`);
      for (const [i, keys] of (resource.unique || []).entries()) {
        this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "${resource.key}_unique_${i}" ON ${table(resource.key)} (${keys.map(k => `coalesce(json_extract(data, '$.${k}'), '')`).join(',')}) WHERE archived=0;`);
      }
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS stock_identity ON stock(materialId,warehouseId,coalesce(json_extract(data,'$.chargeNo'),'')) WHERE archived=0;
      CREATE UNIQUE INDEX IF NOT EXISTS custom_stock_identity ON stock(customMaterialId,warehouseId,coalesce(json_extract(data,'$.chargeNo'),'')) WHERE archived=0 AND customMaterialId IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tool_stock_identity ON tool_stock(articleId,warehouseId) WHERE archived=0;
      CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY REFERENCES users(id), hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity_type,entity_id);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    `);
    }
    for(const row of this.list('iso_materials'))if(row.customMaterial&&!row.materialId&&!row.customMaterialId)this.update('iso_materials',row.id,{},row._version,SYSTEM);
    if(!this.db.prepare("SELECT value FROM metadata WHERE key='welding_setup_v1'").get())this.transaction(()=>{
      for(const row of this.list('pqr'))this.update('pqr',row.id,{},row._version,SYSTEM);
      for(const row of this.list('wps'))this.update('wps',row.id,{method:row.method||'Not recorded',definition:row.definition||'Not recorded',allProjects:row.allProjects??true,pqrIds:row.pqrId?[row.pqrId]:[],siteIds:this.list('sites').map(s=>s.id)},row._version,SYSTEM);
      for(const row of this.list('welders'))this.update('welders',row.id,{globallyDeployable:row.globallyDeployable??true},row._version,SYSTEM);
      this.db.prepare("INSERT INTO metadata(key,value) VALUES('welding_setup_v1','1')").run();
    });
  }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T {
    if (this.depth) return fn();
    this.db.exec(this.db.dialect === 'postgres' ? 'BEGIN; SELECT pg_advisory_xact_lock(1937007980)' : 'BEGIN IMMEDIATE'); this.depth++;
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw this.translate(error); }
    finally { this.depth--; }
  }
  translate(error: unknown) {
    if (error instanceof AppError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;
    if (code === '23505') return new AppError(409, 'A record with these identifying fields already exists.');
    if (code === '23503') return conflict('A related record is missing or still in use.');
    if (message.includes('UNIQUE constraint failed')) return new AppError(409, 'A record with these identifying fields already exists.');
    if (message.includes('FOREIGN KEY constraint failed')) return conflict('A related record is missing or still in use.');
    return error;
  }
  /** A unique-key violation of a write becomes a sentence naming the field and the value the user typed; anything else is returned as it was. */
  duplicate(key: string, data: Record<string, unknown>, id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if ((error as { code?: string })?.code !== '23505' && !message.includes('UNIQUE constraint failed')) return error;
    const def = RESOURCE_MAP[key]; if (!def) return error;
    const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');
    const others = this.list(key).filter(row => row.id !== id);
    const keys = (def.unique || []).find(names => others.some(row => names.every(name => same(row[name], data[name]))));
    const field = keys && [...keys].reverse().map(name => def.fields.find(f => f.name === name)).find(f => f && !f.ref);
    const value = field && String(data[field.name] ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    if (!field || !value) return this.translate(error);
    return Object.assign(new AppError(409, `${field.label} ${value} already exists.`, { [field.name]: 'This value is already in use.' }), { kind: 'duplicate' as const });
  }
  resource(key: string): Resource { const def = RESOURCE_MAP[key]; if (!def) throw new AppError(404, 'This record type does not exist.'); return def; }
  list(key: string, includeArchived = false): Row[] {
    return (this.db.prepare(`SELECT * FROM ${table(key)} ${includeArchived ? '' : 'WHERE archived=0'} ORDER BY created_at DESC, id`).all() as Record<string, unknown>[]).map(unpack);
  }
  get(key: string, id: unknown, allowArchived = false): Row {
    if (typeof id !== 'string' || !id) throw new AppError(422, `${this.resource(key).singular} is required.`);
    const raw = this.db.prepare(`SELECT * FROM ${table(key)} WHERE id=? ${allowArchived ? '' : 'AND archived=0'}`).get(id) as Record<string, unknown> | undefined;
    if (!raw) throw new AppError(404, `The ${this.resource(key).singular} could not be found.`);
    const row = unpack(raw); this.recordGuard?.(key, row);
    return row;
  }
  /**
   * Standard defect codes (shipped with the product, `system`, or an older code with the same code + norm: isStandardDefectCode) cannot be edited or deleted by a user in the hosted profile;
   * switching them on or off per main project stays possible. The flag itself is never taken from a request.
   */
  private guardStandardCode(key: string, row: Row, actor: Actor, changes: boolean) {
    if (this.hostedRules && key === 'ndt_defect_codes' && isStandardDefectCode(row) && actor.id !== SYSTEM.id && changes) throw new AppError(403, 'This defect code cannot be changed.');
  }
  /** Depth of `keepingReferences` calls: while above zero, the "Enabled on this site" rule does not refuse references. */
  private keptReferences = 0;
  /**
   * Run writes that carry references over from existing records (copy isometrics): the rule refusing references to
   * catalog records switched off on the site applies to newly chosen references only, so a copy keeps what its source had.
   */
  keepingReferences<T>(fn: () => T): T { this.keptReferences++; try { return fn(); } finally { this.keptReferences--; } }
  validate(key: string, input: Record<string, unknown>, existing?: Row,actor:Actor=SYSTEM): RecordData {
    const resource = this.resource(key);
    const data: RecordData = {};
    const errors: Record<string, string> = {};
    const prepared = this.hostedRules ? prepareWelderData(this, key, input, existing) : { input, errors: {} as Record<string, string> };
    input = prepared.input;
    for (const field of resource.fields) {
      if (field.type === 'password') continue;
      let value: unknown = input[field.name] ?? existing?.[field.name] ?? field.default ?? (field.type === 'checkbox' ? false : '');
      if(key==='wps'&&field.name==='pqrId'&&Array.isArray(input.pqrIds))value=input.pqrIds[0]||'';
      if(key==='pqr'&&input[field.name]===undefined&&existing?.[field.name]===undefined){if(field.name==='attribute25Id')value=input.standard??existing?.standard??'';if(field.name==='attribute5Id')value=input.material??existing?.material??'';}
      if(key==='isometrics'&&field.name==='xRay'&&typeof value==='number')value=String(value);
      if(key==='flanges')value=flangeStoredValue(field,value);
      // The project of a flange follows its isometric; one the form sent (it only narrows the isometric list) is replaced.
      if(key==='flanges'&&field.name==='projectId'){const iso=this.list('isometrics',true).find(r=>r.id===(input.isoId??existing?.isoId));if(iso?.projectId)value=iso.projectId;}
      if(key==='material_parts'&&field.name==='custom'&&typeof value==='boolean')value=value?'Yes':'';
      if(key==='isometrics'&&existing&&['itpRevNo','itp2RevNo'].includes(field.name)&&input[field.name]===undefined&&existing[field.name]===undefined){const type=field.name==='itpRevNo'?'ITP':'ITP 2';value=this.list('revisions').find(r=>r.isoId===existing.id&&r.type===type)?.revNo??field.default??'0';}
      // The hosted profile leaves a few shared requirements out (an attest number is optional in the reference).
      const required = field.required && !(this.hostedRules && HOSTED_OPTIONAL[key]?.includes(field.name));
      if (required && (value === '' || value === null || value === undefined)) { errors[field.name] = `${field.label} is required.`; continue; }
      if (field.type === 'checkbox') {
        if (typeof value !== 'boolean') errors[field.name] = `${field.label} must be checked or unchecked.`;
      } else if (field.type === 'number') {
        if (value === '') value = null;
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) errors[field.name] = `${field.label} must be a number.`;
        if (typeof value === 'number' && ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) errors[field.name] = `${field.label} must be between ${field.min ?? '−∞'} and ${field.max ?? '∞'}.`;
      } else if (typeof value !== 'string') errors[field.name] = `${field.label} must be text.`;
      else {
        const text = value.trim(); value = text;
        if (required && !text) errors[field.name] = `${field.label} is required.`;
        if (text.length > 20_000) errors[field.name] = `${field.label} is too long.`;
        if (field.type === 'email' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[field.name] = 'Enter a valid email address.';
        if (field.type === 'date' && text) { try { validDate(text, field.label); } catch (e) { errors[field.name] = (e as Error).message; } }
        if (field.options && text && !field.options.includes(text) && !(field.legacy && Object.hasOwn(field.legacy, text)) && !(this.hostedRules && hostedFreeValue(key, field.name))) errors[field.name] = `Choose a valid ${field.label.toLowerCase()}.`;
        // A value removed from its dropdown (hosted) stays on the records that already store it.
        const keptRemoved=this.hostedRules&&field.creatable&&existing?.[field.name]===text;
        if(field.ref&&text&&field.creatable&&!keptRemoved){const identified=this.list(field.ref,true).find(r=>r.id===text);if(identified){if(identified._archived||identified.category!==field.refCategory)errors[field.name]=`Choose an active value for ${field.label}.`;else value=identified.id;}else{const found=this.list(field.ref).find(r=>r.name===text&&r.category===field.refCategory);
          // A text that names no existing value adds one to the catalog: that needs the add right there, not only the right to edit this record.
          if(!found&&actor.canAdd&&!actor.canAdd(field.ref))throw new AppError(403,`Your permission profile does not allow adding a new value for ${field.label}. Choose an existing value.`,{[field.name]:'Choose an existing value.'});
          value=(found||this.create(field.ref,{name:text,category:field.refCategory},actor)).id;}}
        if (field.ref && value && !keptRemoved) { try { this.get(field.ref, value); } catch (error) { if (error instanceof AppError && error.code === SITE_REFUSED) throw error; errors[field.name] = `Choose an active ${field.label.toLowerCase()}.`; } }
      }
      data[field.name] = value as Value;
    }
    for (const [name, message] of Object.entries(prepared.errors)) errors[name] ??= message;
    if (key === 'flanges') {
      for (const [name, message] of Object.entries(flangeInputErrors(data))) errors[name] ??= message;
      // The unique rule (isometric, Flange ID): a repeated filled Flange ID is answered by the duplicate sentence
      // ("Flange ID … already exists.", see `duplicate`); an empty one is refused here, at the field, as the index would refuse it.
      if (!String(data.flange_id ?? '').trim() && data.isoId && this.list('flanges').some(r => r.id !== existing?.id && r.isoId === data.isoId && !String(r.flange_id ?? '').trim())) errors.flange_id ??= 'This isometric already has a flange without a Flange ID. Enter a Flange ID.';
    }
    if (key === 'ndt_defect_codes' && actor.id !== SYSTEM.id) data.system = existing?.system === true;
    if (key === 'isometrics') { const iso = existing ?? data as unknown as Row; Object.assign(errors, isoInputErrors(data, existing, iso.id ? isoBudgets(iso, { iso_materials: this.list('iso_materials').filter(line => line.isoId === iso.id), materials: this.list('materials'), custom_materials: this.list('custom_materials'), operation_phases: this.list('operation_phases') }) : undefined)); }
    if (key === 'hydrotest_requests' || key === 'attachments') Object.assign(errors, hydrotestErrors(key, data));
    this.guardTestSystem(key, { ...existing, ...data } as Row); if (existing) this.guardTestSystem(key, existing);
    if (key === 'isometrics' && (data.itpId || data.itp2Id)) { const linked = isoItpLinks(data, this.list('itps'), this.list('itp_projects'), existing); Object.assign(errors, linked.errors); Object.assign(data, linked.values); }
    if (key === 'punchlists') { let iso: Row | undefined; try { iso = data.isoId ? this.get('isometrics', data.isoId) : undefined; } catch { /* reported with the field */ } Object.assign(errors, punchInputErrors(data, existing, iso, this.list('punchlists'))); if (!Object.keys(errors).length) { normalizePunch(data, iso); data.number = existing?.number || nextPunchNumber(this.list('punchlists', true)); } }
    if (!Object.keys(errors).length && !this.keptReferences) Object.assign(errors, enablementErrors(this, key, data, existing, input));
    if (key === 'materials' && this.requireMaterialGroup && !String(data.materialGroup ?? '').trim()) errors.materialGroup = 'Material group is required.';
    // Pilots: a material points at its UOMs record (EA when none is chosen); the code is kept with it (shared/material-db.ts).
    if (key === 'materials' && this.hostedRules) { const uom = resolveMaterialUom(input, existing, this.list('uoms')); if ('error' in uom) errors[uom.error[0]] ??= uom.error[1]; else Object.assign(data, uom); }
    // The ID of an operation phase is given on create, one above every ID so far (deleted phases included); it never changes.
    if (key === 'operation_phases') data.number = existing ? existing.number ?? null : Object.keys(errors).length ? null : this.phaseNumber();
    if (Object.keys(errors).length) throw new AppError(422, 'Please check the highlighted fields.', errors);
    if(key==='sites'){const progress=validateProgressWeights(data);if(!progress.valid)throw new AppError(422,progress.message,progress.fields);}
    if(key==='iso_materials')data.quantity=qty(data.quantity);
    if(key==='profiles'&&data.permissionMode==='Detailed permissions'){try{data.permissionRules=JSON.stringify(parsePermissionRules(data.permissionRules));}catch(e){throw new AppError(422,(e as Error).message,{permissionRules:(e as Error).message});}}
    if(key==='pqr'&&!data.name)data.name=this.next('PQR');
    if (key === 'users') data.email = String(data.email).toLowerCase();
    if (key === 'iso_materials' && !data.materialId && (!data.customMaterial || !data.materialNo || !data.description || !data.uom)) throw new AppError(422, 'Choose a catalog material or provide the custom material number, description, and unit.');
    if(key==='iso_materials'&&!existing&&Number(data.quantity)<=0)throw new AppError(422,'A new material requirement needs a positive quantity.');
    if(['iso_materials','order_lines','stock','movements','picklists'].includes(key)&&data.materialId&&data.customMaterialId)throw new AppError(422,'Choose either a catalog material or a custom material.');
    if(key==='iso_materials'&&data.customMaterial&&!data.materialId){const identity=data.customMaterialId?this.get('custom_materials',data.customMaterialId):null;if(!identity||MATERIAL_FIELDS.some(k=>String(identity[k]??'')!==String(data[k]??''))){const snapshot={...Object.fromEntries(MATERIAL_FIELDS.map(k=>[k,data[k]??''])),componentCode:data.componentCode??'',progressClass:data.progressClass??''};data.customMaterialId=this.create('custom_materials',snapshot,actor).id;}}
    if(['order_lines','stock','picklists'].includes(key)&&!data.materialId&&!data.customMaterialId)throw new AppError(422,'A catalog or custom material is required.');
    if(['order_lines','picklists'].includes(key)&&data.requirementId&&(!existing||['requirementId','isoId','materialId','customMaterialId'].some(k=>String(existing[k]||'')!==String(data[k]||'')))){const req=this.get('iso_materials',data.requirementId);if(req.isoId!==data.isoId||req.materialId!==data.materialId||String(req.customMaterialId||'')!==String(data.customMaterialId||''))throw new AppError(422,'The material requirement must match the isometric and material.');}
    if (key === 'certifications' && existing) for (const weld of this.list('welds')) for (const side of [1, 2]) {
      if (weld[`certificate${side}Id`] !== existing.id) continue;
      if (data.materialId && weld[`material${side}Id`] && data.materialId !== weld[`material${side}Id`] || data.chargeNo && weld[`chargeNo${side}`] && data.chargeNo !== weld[`chargeNo${side}`]) throw new AppError(422, 'This certificate is linked to a weld. Its material and charge / heat number must continue to match that weld.');
    }
    if (key === 'welds') for (const side of [1, 2]) {
      const certificateId = data[`certificate${side}Id`];
      if (!certificateId) continue;
      const certificate = this.get('certifications', certificateId);
      const materialField = `material${side}Id`, chargeField = `chargeNo${side}`;
      if (certificate.materialId && data[materialField] && certificate.materialId !== data[materialField]) throw new AppError(422, 'The certificate must match the selected material.', { [`certificate${side}Id`]: 'Select a certificate for this material.' });
      if (certificate.chargeNo && data[chargeField] && certificate.chargeNo !== data[chargeField]) throw new AppError(422, 'The charge / heat number must match the certificate.', { [chargeField]: 'Use the charge / heat number on the selected certificate.' });
      if (!data[materialField]) data[materialField] = certificate.materialId || '';
      if (!data[chargeField]) data[chargeField] = certificate.chargeNo || '';
    }
    if (key === 'welds' && data.spoolId) {
      const spool = this.get('spools', data.spoolId);
      if (spool.isoId !== data.isoId) throw new AppError(422, 'The spool must belong to the selected isometric.', { spoolId: 'Select a spool from this isometric.' });
    }
    if (key === 'cut_list' || key === 'calculation_lines') {
      const requirement = data.requirementId ? this.get('iso_materials', data.requirementId) : undefined;
      if (requirement && requirement.isoId !== data.isoId) throw new AppError(422, 'The MTO material must belong to the selected isometric.', { requirementId: 'Choose a material in this isometric.' });
      if (key === 'cut_list') {
        if (!Number.isSafeInteger(data.quantity)) throw new AppError(422, 'Number of pieces must be a whole number.', { quantity: 'Enter a whole number of pieces.' });
        if (data.spoolId && this.get('spools', data.spoolId).isoId !== data.isoId) throw new AppError(422, 'The spool must belong to the selected isometric.');
        if (!Number.isFinite(Number(data.quantity) * Number(data.lengthMm))) throw new AppError(422, 'The total cutting length is too large.');
      } else {
        const norm = this.get('calculation_norms', data.normId);
        if (!requirement && (data.quantity === null || Number(data.quantity) <= 0)) throw new AppError(422, 'Enter a positive manual quantity or select an MTO material.', { quantity: 'Enter a quantity in the norm’s unit.' });
        const material = requirement?.materialId ? this.get('materials', requirement.materialId) : requirement;
        if (requirement && String(material?.uom || '').trim().toLowerCase() !== String(norm.uom).trim().toLowerCase()) throw new AppError(422, 'The calculation norm and MTO material must use the same unit.', { normId: 'Choose a norm matching the material unit.' });
        if (!Number.isFinite(Number(requirement?.quantity ?? data.quantity) * Number(norm.hoursPerUnit))) throw new AppError(422, 'The planned hours are too large.');
      }
    }
    if (key === 'iso_materials' && existing && data.isoId !== existing.isoId && ['cut_list', 'calculation_lines'].some(resource => this.list(resource).some(row => row.requirementId === existing.id))) throw new AppError(422, 'This MTO material is used in planning. Remove its calculation and cut-list links before moving it to another isometric.');
    return data;
  }
  private phaseNumber() {
    const start = nextPhaseNumber(this.list('operation_phases', true));
    const highest = this.db.dialect === 'postgres' ? 'GREATEST' : 'MAX';
    return Number((this.db.prepare(`INSERT INTO counters(key,value) VALUES ('operation_phase_number',?) ON CONFLICT(key) DO UPDATE SET value=${highest}(counters.value+1,excluded.value) RETURNING value`).get(start) as { value: number }).value);
  }
  create(key: string, input: Record<string, unknown>, actor: Actor = SYSTEM, id: string = randomUUID()): Row {
    return this.transaction(() => {
      const data = this.validate(key, input,undefined,actor);
      const now = new Date().toISOString();
      try { this.db.prepare(`INSERT INTO ${table(key)}(id,data,created_at,updated_at) VALUES (?,?,?,?)`).run(id, JSON.stringify(data), now, now); } catch (error) { throw this.duplicate(key, data, id, error); }
      const result = this.get(key, id);
      this.audit(key, id, 'created', `Created ${this.resource(key).singular} ${this.display(key, result)}`, actor);
      this.syncRelations(key,id,input,actor);
      applyEnablement(this, key, id, input, actor, true);
      return result;
    });
  }
  update(key: string, id: string, input: Record<string, unknown>, expectedVersion: number, actor: Actor = SYSTEM,quantityChange?:{revisionId:string;date:string;note:string}): Row {
    return this.transaction(() => {
      const existing = this.get(key, id);
      if (existing._version !== expectedVersion) throw conflict('This record changed since you opened it. Refresh and try again.');
      this.guardStandardCode(key, existing, actor, Object.keys(input).some(name => name !== '_version' && !ENABLEMENT_INPUT.includes(name)));
      const data = this.validate(key, input, existing,actor);
      try { this.db.prepare(`UPDATE ${table(key)} SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?`).run(JSON.stringify(data), new Date().toISOString(), id, expectedVersion); } catch (error) { throw this.duplicate(key, data, id, error); }
      if(key==='iso_materials'&&Number(existing.quantity)!==Number(data.quantity)){
        const sequence=this.list('material_quantity_changes',true).filter(r=>r.requirementId===id).reduce((max,r)=>Math.max(max,Number(r.sequence)||0),0)+1;
        this.create('material_quantity_changes',{requirementId:id,sequence,type:quantityChange?'Revision removal':'Edit',revisionId:quantityChange?.revisionId||'',previousQuantity:existing.quantity,quantity:qty(Number(data.quantity)-Number(existing.quantity)),newQuantity:data.quantity,date:quantityChange?.date||today(),note:quantityChange?.note||''},actor);
      }
      this.audit(key, id, 'updated', `Updated ${this.resource(key).singular} ${this.display(key, existing)}`, actor);
      this.syncRelations(key,id,input,actor);
      if (key === 'itps') for (const change of itpSlotRefresh(this.get(key, id), this.list('isometrics'))) this.update('isometrics', change.id, change.values, this.get('isometrics', change.id)._version, actor);
      applyEnablement(this, key, id, input, actor);
      if (key === 'sites') defectNormSaved(this, existing, this.get(key, id), actor);
      // Pilots: renaming a UOM renames it on its materials (they point at the record; ones saved before by their code).
      if (key === 'uoms' && this.hostedRules && String(existing.name ?? '') !== String(data.name ?? '')) for (const material of this.list('materials', true).filter(row => uomOfMaterial(row, existing))) {
        const { id: materialId, _version, _archived, _createdAt, _updatedAt, ...stored } = material;
        this.db.prepare('UPDATE "materials" SET data=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify({ ...stored, uomId: id, uom: data.name }), new Date().toISOString(), materialId);
        this.audit('materials', materialId, 'updated', `Updated material ${this.display('materials', material)}: UOM ${existing.name} renamed to ${data.name}`, actor);
      }
      return this.get(key, id);
    });
  }
  archive(key: string, id: string, version: number, actor: Actor) {
    return this.transaction(() => {
      const row = this.get(key, id, true);
      if (row._version !== version) throw conflict('This record changed. Refresh and try again.');
      this.guardTestSystem(key, row);
      if (this.hostedRules && key === 'roles' && isWelderRole(row) && !row._archived) throw new AppError(422, 'The Welder role cannot be deleted.');
      if (key === 'users' && id === actor.id) throw new AppError(422, 'You cannot archive your own account.');
      if (key === 'uoms' && this.hostedRules && !row._archived && this.list('materials').some(material => uomOfMaterial(material, row))) throw new AppError(422, UOM_IN_USE);
      this.guardStandardCode(key, row, actor, true);
      if (!row._archived) {
        if (key === 'articles' && this.list('rentals').some(r => r.articleId === id && Number(r.quantity) > Number(r.returned) && r.status !== 'Consumed')) throw conflict('Return outstanding rentals before archiving this article.');
        if(this.hostedRules&&key==='welders')archiveWelderQualifications(this,id,actor);
        for(const relation of RELATIONS[key]||[])for(const link of this.list(relation.resource).filter(l=>l[relation.ownerKey]===id)){const marked=this.update(relation.resource,link.id,{ownerArchived:true},link._version,actor);this.archive(relation.resource,marked.id,marked._version,actor);}
        // Hosted: a PQR attribute value can be removed from its dropdown while PQRs keep showing it (shared/wps.ts).
        if (!(this.hostedRules && key === 'qualification_options')) for (const resource of RESOURCES) for (const f of resource.fields.filter(f => f.ref === key)) {
          const dependent = this.db.prepare(`SELECT id FROM ${table(resource.key)} WHERE "${f.name}"=? AND archived=0 LIMIT 1`).get(id);
          if (dependent) throw conflict(`This ${this.resource(key).singular} is used by active ${resource.title.toLowerCase()}. Archive those records first.`);
        }
      }
      try { this.db.prepare(`UPDATE ${table(key)} SET archived=?,version=version+1,updated_at=? WHERE id=?`).run(row._archived ? 0 : 1, new Date().toISOString(), id); } catch (error) { throw this.duplicate(key, row, id, error); }
      if(row._archived&&this.hostedRules&&key==='welders')restoreWelderQualifications(this,id,actor);
      if(row._archived)for(const relation of RELATIONS[key]||[])for(const link of this.list(relation.resource,true).filter(l=>l[relation.ownerKey]===id&&l._archived&&l.ownerArchived)){this.get(relation.target,link[relation.targetKey]);const restored=this.archive(relation.resource,link.id,link._version,actor);this.update(relation.resource,restored.id,{ownerArchived:false},restored._version,actor);}
      this.audit(key, id, row._archived ? 'restored' : 'archived', `${row._archived ? 'Restored' : 'Archived'} ${this.resource(key).singular} ${this.display(key, row)}`, actor);
      return this.get(key, id, true);
    });
  }
  display(key: string, row: Row): string {
    if(key==='welders'&&!row.name)return String(row.number||row.id);
    if(key==='pqr'&&this.hostedRules)return pqrNumber(row,this.list('qualification_options',true));
    if (key === 'iso_materials' && !row.materialId) return String(row.materialNo || row.id);
    if(['order_lines','stock','movements','picklists'].includes(key)&&row.customMaterialId)return this.display('custom_materials',this.get('custom_materials',row.customMaterialId,true));
    const def = this.resource(key); const f = def.fields.find(f => f.name === def.display);
    if (f?.ref && row[f.name]) { try { return this.display(f.ref, this.get(f.ref, row[f.name], true)); } catch { return 'Unavailable record'; } }
    // A certificate without an attest number is known by its index number.
    return String(row[def.display] || row.name || (key === 'certifications' ? row.indexNo : '') || row.id);
  }
  syncRelations(key:string,id:string,input:Record<string,unknown>,actor:Actor=SYSTEM){
    for(const relation of RELATIONS[key]||[]){
      if(relation.pilotsOnly&&!this.hostedRules)continue;
      let requested=input[relation.field];if(key==='wps'&&relation.field==='pqrIds'&&requested===undefined&&input.pqrId)requested=[input.pqrId];
      if(key==='wps'&&relation.field==='projectIds'&&this.get(key,id).allProjects&&(input.allProjects!==undefined||input.projectIds!==undefined))requested=[];
      if(requested===undefined)continue;
      if(!Array.isArray(requested)||requested.length>500||requested.some(v=>typeof v!=='string'||!v))throw new AppError(422,`Choose valid ${relation.label.toLowerCase()}.`,{[relation.field]:'Select active linked records.'});
      const desired=[...new Set(requested)] as string[];for(const target of desired)this.get(relation.target,target);
      // Links the request may not see (access per project site) are kept as they are.
      const current=this.list(relation.resource).filter(l=>l[relation.ownerKey]===id&&relationMatches(relation,l)&&this.guardAllows(relation.resource,l));
      for(const link of current)if(!desired.includes(String(link[relation.targetKey])))this.archive(relation.resource,link.id,link._version,actor);
      for(const target of desired)if(!current.some(l=>l[relation.targetKey]===target))this.create(relation.resource,{...relation.match,[relation.ownerKey]:id,[relation.targetKey]:target},actor);
    }
  }
  next(prefix: string) {
    const row = this.db.prepare('INSERT INTO counters(key,value) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET value=counters.value+1 RETURNING value').get(prefix) as { value: number };
    return `${prefix}-${new Date().getUTCFullYear()}-${String(row.value).padStart(4, '0')}`;
  }
  /** The next value of the same running counter as plain zero-padded digits, without prefix or year (order numbers 00001, 00002, …). */
  nextDigits(prefix: string, width = 5) {
    const row = this.db.prepare('INSERT INTO counters(key,value) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET value=counters.value+1 RETURNING value').get(prefix) as { value: number };
    return String(row.value).padStart(width, '0');
  }
  audit(key: string, id: string, action: string, summary: string, actor: Actor) {
    // Notifications are personal messages, not events of the workspace: they are not part of its audit trail.
    if (key === 'notifications') return;
    this.db.prepare('INSERT INTO audit(id,entity_type,entity_id,action,summary,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), key, id, action, summary, actor.id, actor.name, new Date().toISOString());
  }
  activity(limit = 100): AuditEvent[] {
    return (this.db.prepare(`SELECT * FROM audit ORDER BY created_at DESC,${this.db.dialect === 'postgres' ? 'sequence' : 'rowid'} DESC LIMIT ?`).all(limit) as Record<string, unknown>[]).map(unpackAudit);
  }
  /** The account of a record's latest create or update (from the audit trail), or '' when none is recorded. */
  recordedBy(key: string, id: string): string {
    const sequence = this.db.dialect === 'postgres' ? 'sequence' : 'rowid';
    const row = this.db.prepare(`SELECT actor_id FROM audit WHERE entity_type=? AND entity_id=? AND action IN ('created','updated') ORDER BY ${sequence} DESC LIMIT 1`).get(key, id) as { actor_id?: unknown } | undefined;
    return row?.actor_id ? String(row.actor_id) : '';
  }
  history(key:string,id:string,before=Number.MAX_SAFE_INTEGER){
    this.resource(key);
    if(!Number.isSafeInteger(before)||before<1)throw new AppError(422,'Invalid history cursor.');
    const sequence = this.db.dialect === 'postgres' ? 'sequence' : 'rowid';
    const result=this.db.prepare(`SELECT ${sequence} AS sequence,* FROM audit WHERE entity_type=? AND entity_id=? AND ${sequence}<? ORDER BY ${sequence} DESC LIMIT 51`).all(key,id,before) as Record<string,unknown>[];
    return {events:result.slice(0,50).map(unpackAudit),nextCursor:result.length>50?String(result[49].sequence):null};
  }
}
