import './env.ts';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { Store, SYSTEM, AppError, type Actor } from './store.ts';
import { seed, seedInspectionSamples } from './seed.ts';
import { seedMtoLogistics } from './mto-logistics.ts';
import { seedMtoDashboard } from './mto-dashboard-seed.ts';
import { runtimeConfig } from './runtime-config.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { workspaceCloudDatabase } from './cloud-database.ts';
import { inspectHostedSchema } from './hosted-schema.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { RELATIONS } from '../shared/welding.ts';
import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import { USER_SITES } from '../shared/site-scope.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor } from '../shared/release.ts';
import { materialsList } from '../shared/mto-stock.ts';
import { isoSummariesFor } from './iso-summary.ts';
import type { Row } from '../shared/types.ts';

/**
 * One-off, insert-only demo main project for an existing hosted workspace (`npm run db:demo:hosted`).
 *
 * The content is the QA-verified local sample data: an in-memory SQLite store runs the same sample chain that
 * server/index.ts runs for the hosted profile on a fresh local database, without the account samples
 * (seedAccessSamples, seedSiteScopeSamples) and without the client's own company data (seedCompanySample).
 * That graph is copied into the target through the Store API (Store.create: the validation, unique indexes and
 * foreign keys of the application), in one transaction, references first.
 *
 * New or matched, per record:
 * - Scoped records (the sites themselves, everything that reaches a site, project or isometric through its
 *   references, and the stock side listed in ALWAYS_SCOPED) are always inserted as `demo-<source id>` with their
 *   references remapped. Sites are renamed "Demo – …", storehouses likewise, projects get a DEMO- number; any other
 *   unique rule an inserted record would break gets the same marker (see `mark`). Numbers drawn from `counters`
 *   (PO-, NDT-, PICK-, MM-, …) are drawn again from the target's counters, so numbering stays consistent.
 * - Global catalog records (no path to a site) are matched by the resource's unique rule (NATURAL_KEYS for the
 *   few without one) against the target's live rows: a match is referenced and nothing is written; otherwise the
 *   source row is inserted as `demo-<source id>`. A missing child of a matched catalog record (a PQR link of an
 *   existing WPS, a qualification of an existing welder) is skipped: inserting it would change that record.
 *
 * Storehouses, stock and catalog materials: Inv. (shared/mto-stock.ts materialsList) is the quantity of a catalog
 * material in every storehouse, and reservations, pick lists and Material status read the same totals. Sharing a
 * storehouse is impossible without changing it (the stock identity material + storehouse + charge would collide
 * with the existing balances), and sharing a material that carries quantities would add the demo stock to the
 * client's own isometrics and the client's stock to the demo. So storehouses and all stock-side records are
 * demo-only, and a catalog material that the sample uses for quantities (requirements, stock, orders, receipts,
 * movements, pick lists, reservations) is a demo-only copy too, marked DEMO- when its number already exists.
 * Materials the sample does not stock or require are ordinary catalog records and are matched.
 *
 * Never updated, archived or deleted: any existing row; never touched: users, profiles, credentials, sessions.
 */

export const DEMO_MARKER = 'demo_project_v1';
export const DEMO_ID_PREFIX = 'demo-';
const DEMO_ACTOR: Actor = { id: SYSTEM.id, name: 'Demo project' };

/** Accounts and the client's own records, never taken from the sample. Tools are not part of Weld / MTO Pilot (not delivered by the hosted profile). */
const SKIPPED = new Set(['users', 'profiles', 'signatures', USER_SITES, 'company_data', 'attachments', 'articles', 'clients', 'tool_stock', 'rentals', 'tool_movements']);
/** Demo-only even where no reference leads to a site (storehouses, stock side, shared test systems, orders without a project). */
const ALWAYS_SCOPED = new Set(['sites', 'warehouses', 'stock', 'movements', 'receipts', 'picklists', 'reservations', 'transfer_orders', 'transfer_order_items',
  'orders', 'order_lines', 'custom_materials', 'test_systems', 'hydrotest_requests', 'hydrotest_results', 'field_packages', 'service_requests', 'material_locations', 'material_location_events', CATALOG_SITES]);
/** Records whose catalog material carries quantities (see the comment above). */
const QUANTITY_RESOURCES = ['iso_materials', 'stock', 'order_lines', 'receipts', 'movements', 'picklists', 'reservations'];
/** Matching key of global resources without a unique rule. */
const NATURAL_KEYS: Record<string, string[]> = { certifications: ['name', 'chargeNo'], welder_certificates: ['welderId', 'name'], welder_card_lines: ['welderId', 'wireId', 'processId', 'diameterId', 'thicknessId', 'bwId', 'posId', 'asmeId'], qa_engineers: ['name'], spool_names: ['name'] };
/** Children of a catalog record: skipped when their owner is an existing record and the target lacks them. */
const OWNER_FIELD: Record<string, string> = { welder_certificates: 'welderId', welder_card_lines: 'welderId' };
for (const [owner, relations] of Object.entries(RELATIONS)) if (owner !== 'users') for (const relation of relations) OWNER_FIELD[relation.resource] = relation.ownerKey;
/** Text fields that hold a record id (not declared as references). */
const HIDDEN_REFS: Record<string, { field: string; target: (row: Row) => string }[]> = {
  [CATALOG_SITES]: [{ field: 'recordId', target: row => String(row.resourceKey) }, { field: 'siteId', target: () => 'sites' }],
  transfer_order_items: [{ field: 'stockId', target: () => 'stock' }],
  iso_materials: [{ field: 'revisionId', target: () => 'revisions' }],
  punchlists: [{ field: 'signAttachmentId', target: () => 'attachments' }],
};
/** Text fields that hold a comma separated list of record ids: the qualification documents' WPS (Validation on WPS). */
const HIDDEN_LIST_REFS: Record<string, { field: string; target: string }[]> = { welder_certificates: [{ field: 'wpsIds', target: 'wps' }] };
/** Always marked so the copies are told apart in pickers that list every main project. */
const ALWAYS_MARKED: Record<string, string[]> = { sites: ['name'], warehouses: ['name'], projects: ['internnumber'] };
/** Catalog-material snapshots that repeat the material number as text. */
const MATERIAL_NUMBER_COPIES = new Set(['order_lines', 'transfer_order_items']);
/**
 * Fields the application turns into link records when they are written (a WPS's primary PQR creates its wps_pqr
 * link with a generated id). They are left empty on create and written by an update of the new record once its
 * copied links exist, so every link keeps its demo- id and none is created twice.
 */
const DEFERRED_FIELDS: Record<string, string[]> = { wps: ['pqrId'] };
/** Resources inserted after everything else: switching a catalog record off on a demo site must not refuse the demo records that use it. */
const LAST = [CATALOG_SITES];

const NAME_FIELDS = new Set(['name', 'title', 'description']);
/** "Demo – North fabrication yard" for names, "DEMO-STX-2401" for numbers and codes. */
export function mark(field: string, value: string) {
  if (/^demo\b/i.test(value)) return value;
  return NAME_FIELDS.has(field) ? `Demo – ${value}` : `DEMO-${value}`;
}

export interface ResourceCount { inserted: number; matched: number; skipped: number }
export interface DemoCopyResult {
  status: 'copied' | 'already-present';
  dryRun: boolean;
  message: string;
  resources: Record<string, ResourceCount>;
  totals: ResourceCount;
  /** Fields given the demo marker (or cleared for renumbering), per resource.field. */
  markers: Record<string, number>;
  /** Numbers drawn again from the target's counters, per prefix. */
  renumbered: Record<string, number>;
  /** Fields the application's validation set differently from the source on create (for example punch numbers), per resource.field. */
  normalized: Record<string, number>;
  /** The demo isometrics compared with the sample they were copied from (see `sampleParity`). */
  sampleParity?: { isometrics: number; summariesMatching: number; summariesDiffering: string[]; projects: number; materialsListsDiffering: string[] };
  /** Every source record and what happened to it (not printed by the CLI). */
  rows: { key: string; sourceId: string; targetId: string | null; action: 'inserted' | 'matched' | 'skipped' }[];
}

/** The local hosted sample chain of server/index.ts, without accounts and company data. */
export function sampleSource(): Store {
  const store = new Store(':memory:');
  seed(store); seedInspectionSamples(store); seedMtoLogistics(store, SYSTEM); seedMtoDashboard(store, SYSTEM);
  return store;
}

class DryRunRollback extends Error { constructor(public result: DemoCopyResult) { super('Dry run rolled back.'); } }
const META = new Set(['id', '_version', '_archived', '_createdAt', '_updatedAt']);
const text = (value: unknown) => value === null || value === undefined ? '' : String(value);
const same = (a: unknown, b: unknown) => isDeepStrictEqual(a ?? '', b ?? '');

/**
 * Copy the sample graph into `target` as new records (see the module comment). Dry run: everything is performed
 * and rolled back. Idempotent: does nothing when the marker or a demo site already exists.
 */
export function copyDemoProject(target: Store, options: { dryRun?: boolean; source?: Store } = {}): DemoCopyResult {
  const dryRun = options.dryRun !== false;
  const source = options.source ?? sampleSource();
  const hostedRules = target.hostedRules, requireMaterialGroup = target.requireMaterialGroup;
  // The hosted application's create rules (welder data, material group) apply to every inserted record.
  target.hostedRules = true; target.requireMaterialGroup = true;
  try {
    return target.transaction(() => {
      const result = plan(target, source, dryRun);
      if (dryRun && result.status === 'copied') throw new DryRunRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    throw error;
  } finally {
    target.hostedRules = hostedRules; target.requireMaterialGroup = requireMaterialGroup;
    if (!options.source) source.close();
  }
}

function plan(target: Store, source: Store, dryRun: boolean): DemoCopyResult {
  const empty = (): DemoCopyResult => ({ status: 'copied', dryRun, message: '', resources: {}, totals: { inserted: 0, matched: 0, skipped: 0 }, markers: {}, renumbered: {}, normalized: {}, rows: [] });
  const result = empty();
  const marker = target.db.prepare('SELECT value FROM metadata WHERE key=?').get(DEMO_MARKER);
  const demoSite = target.db.prepare('SELECT id FROM sites WHERE id LIKE ? LIMIT 1').get(`${DEMO_ID_PREFIX}%`);
  if (marker || demoSite) return { ...result, status: 'already-present', message: `The demo project is already present (${marker ? `metadata ${DEMO_MARKER}` : `site ${String(demoSite!.id)}`}). Nothing was changed.` };

  // ---- Source graph --------------------------------------------------------------------------------------
  const rowsOf = new Map<string, Map<string, Row>>();
  const order = new Map<string, string[]>();
  for (const resource of RESOURCES) {
    const rows = new Map(source.list(resource.key, true).map(row => [row.id, row]));
    rowsOf.set(resource.key, rows);
    order.set(resource.key, (source.db.prepare(`SELECT id FROM "${resource.key}" ORDER BY rowid`).all() as { id: string }[]).map(row => String(row.id)).filter(id => !rows.get(id)!._archived));
  }
  const sourceRow = (key: string, id: string) => {
    const row = rowsOf.get(key)?.get(id);
    if (!row) throw new AppError(500, `Sample record ${key}/${id} is missing.`);
    if (row._archived) throw new AppError(500, `Sample record ${key}/${id} is archived but referenced by a live sample record.`);
    return row;
  };
  const deps = (key: string, row: Row) => [
    ...RESOURCE_MAP[key].fields.filter(f => f.ref && text(row[f.name])).map(f => ({ field: f.name, key: f.ref!, id: text(row[f.name]) })),
    ...(HIDDEN_REFS[key] || []).filter(h => text(row[h.field])).map(h => ({ field: h.field, key: h.target(row), id: text(row[h.field]) })),
  ];
  const quantityMaterials = new Set(QUANTITY_RESOURCES.flatMap(key => [...rowsOf.get(key)!.values()].filter(row => !row._archived).map(row => text(row.materialId)).filter(Boolean)));
  const scopedMemo = new Map<string, boolean>();
  const scoped = (key: string, id: string): boolean => {
    const memoKey = `${key}/${id}`;
    if (scopedMemo.has(memoKey)) return scopedMemo.get(memoKey)!;
    scopedMemo.set(memoKey, false); // a reference cycle (repair of a weld) does not make a record scoped by itself
    const row = sourceRow(key, id);
    const value = ALWAYS_SCOPED.has(key) || (key === 'materials' && quantityMaterials.has(id)) || deps(key, row).some(dep => !SKIPPED.has(dep.key) && scoped(dep.key, dep.id));
    scopedMemo.set(memoKey, value);
    return value;
  };

  // ---- Target state ---------------------------------------------------------------------------------------
  const live = new Map<string, Row[]>();
  const targetRows = (key: string) => { if (!live.has(key)) live.set(key, target.list(key)); return live.get(key)!; };
  const counters = new Set((source.db.prepare('SELECT key FROM counters').all() as { key: string }[]).map(row => String(row.key)));
  const numbers = new Map<string, string>();
  const renumber = (key: string, field: string, value: string) => {
    const match = /^([A-Z][A-Z0-9]*)-(\d{4})-(\d{4,})$/.exec(value);
    if (!match || !counters.has(match[1])) return value;
    if (!numbers.has(value)) {
      let next: string;
      do next = target.next(match[1]); while (target.list(key, true).some(row => text(row[field]) === next));
      numbers.set(value, next);
      result.renumbered[match[1]] = (result.renumbered[match[1]] || 0) + 1;
    }
    return numbers.get(value)!;
  };
  const materialNumbers = new Map<string, string>();
  const count = (key: string, action: keyof ResourceCount) => { (result.resources[key] ??= { inserted: 0, matched: 0, skipped: 0 })[action]++; result.totals[action]++; };
  const note = (bucket: Record<string, number>, name: string) => { bucket[name] = (bucket[name] || 0) + 1; };
  const uniqueRules = (key: string) => RESOURCE_MAP[key].unique || [];
  const findMatch = (key: string, data: Record<string, unknown>) => {
    const rules = uniqueRules(key).length ? uniqueRules(key) : NATURAL_KEYS[key] ? [NATURAL_KEYS[key]] : [];
    if (!rules.length) throw new AppError(500, `No matching rule for the global resource ${key}; decide whether it is scoped or how it is matched.`);
    for (const rule of rules) { const found = targetRows(key).find(row => rule.every(field => text(row[field]) === text(data[field]))); if (found) return found; }
    return undefined;
  };
  const collides = (key: string, data: Record<string, unknown>) => uniqueRules(key).find(rule => targetRows(key).some(row => rule.every(field => text(row[field]) === text(data[field]))));

  // ---- Copy -----------------------------------------------------------------------------------------------
  const mapped = new Map<string, string | null>();
  const active = new Set<string>();
  const copy = (key: string, id: string): string | null => {
    const memoKey = `${key}/${id}`;
    if (mapped.has(memoKey)) return mapped.get(memoKey)!;
    if (SKIPPED.has(key)) { mapped.set(memoKey, null); return null; }
    if (active.has(memoKey)) throw new AppError(500, `Reference cycle at ${memoKey}.`);
    active.add(memoKey);
    const row = sourceRow(key, id);
    const data: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([name]) => !META.has(name)));
    for (const dep of deps(key, row)) {
      const targetId = copy(dep.key, dep.id);
      const field = RESOURCE_MAP[key].fields.find(f => f.name === dep.field);
      if (targetId === null && field?.required) throw new AppError(500, `${memoKey} requires ${dep.key}/${dep.id}, which is not copied.`);
      data[dep.field] = targetId ?? '';
    }
    for (const list of HIDDEN_LIST_REFS[key] || []) if (text(row[list.field])) data[list.field] = text(row[list.field]).split(',').map(part => part.trim()).filter(Boolean).map(ref => copy(list.target, ref)).filter(Boolean).join(',');
    let targetId: string | null;
    if (!scoped(key, id)) {
      const found = findMatch(key, data);
      const owner = OWNER_FIELD[key];
      if (found) { targetId = found.id; count(key, 'matched'); }
      else if (owner && !text(data[owner]).startsWith(DEMO_ID_PREFIX)) { targetId = null; count(key, 'skipped'); }
      else targetId = insert(key, id, data);
      result.rows.push({ key, sourceId: id, targetId, action: found ? 'matched' : targetId ? 'inserted' : 'skipped' });
    } else {
      for (const field of RESOURCE_MAP[key].fields) {
        const value = data[field.name];
        if (typeof value !== 'string' || field.ref) continue;
        const next = renumber(key, field.name, value);
        if (next !== value) data[field.name] = next;
      }
      if (MATERIAL_NUMBER_COPIES.has(key) && materialNumbers.has(text(data.materialNo))) data.materialNo = materialNumbers.get(text(data.materialNo));
      for (const field of ALWAYS_MARKED[key] || []) if (text(data[field])) { data[field] = mark(field, text(data[field])); note(result.markers, `${key}.${field}`); }
      for (let attempt = 0, rule = collides(key, data); rule; rule = collides(key, data), attempt++) {
        if (attempt) throw new AppError(409, `The demo ${RESOURCE_MAP[key].singular} ${memoKey} still collides with an existing record on ${rule.join(', ')}.`);
        for (const field of rule) {
          if (RESOURCE_MAP[key].fields.find(f => f.name === field)?.ref || !text(data[field])) continue;
          const before = text(data[field]);
          data[field] = mark(field, before);
          note(result.markers, `${key}.${field}`);
          if (key === 'materials' && field === 'materialNo') materialNumbers.set(before, text(data[field]));
        }
      }
      // The index number of a certificate is the next free one in the hosted workspace; a used one is assigned again.
      if (key === 'certifications' && text(data.indexNo) && targetRows(key).some(other => text(other.indexNo) === text(data.indexNo))) { data.indexNo = ''; note(result.markers, 'certifications.indexNo'); }
      targetId = insert(key, id, data);
      result.rows.push({ key, sourceId: id, targetId, action: 'inserted' });
    }
    active.delete(memoKey);
    mapped.set(memoKey, targetId);
    return targetId;
  };
  const deferred: { key: string; id: string; values: Record<string, unknown> }[] = [];
  const insert = (key: string, id: string, intended: Record<string, unknown>) => {
    const later = Object.fromEntries((DEFERRED_FIELDS[key] || []).filter(field => text(intended[field])).map(field => [field, intended[field]]));
    const data = { ...intended, ...Object.fromEntries(Object.keys(later).map(field => [field, ''])) };
    if (Object.keys(later).length) deferred.push({ key, id: `${DEMO_ID_PREFIX}${id}`, values: later });
    let created: Row;
    try { created = target.create(key, data, DEMO_ACTOR, `${DEMO_ID_PREFIX}${id}`); }
    catch (error) {
      const failure = target.translate(error) as Error & { status?: number; fields?: Record<string, string> };
      throw new AppError(failure.status || 500, `${RESOURCE_MAP[key].title} (sample record ${id}): ${failure.message}${failure.fields ? ` ${JSON.stringify(failure.fields)}` : ''}`, failure.fields);
    }
    for (const field of RESOURCE_MAP[key].fields) if (!same(created[field.name], data[field.name] ?? field.default ?? (field.type === 'checkbox' ? false : ''))) note(result.normalized, `${key}.${field.name}`);
    targetRows(key).push(created);
    count(key, 'inserted');
    return created.id;
  };

  // Sites first, then the link records (an isometric's ITP must already be linked to its project), then the rest
  // in registry order; references are always copied before the record that uses them.
  const links = new Set(Object.keys(OWNER_FIELD).filter(key => key !== 'welder_certificates' && key !== 'welder_card_lines'));
  const sequence = ['sites', ...RESOURCES.map(r => r.key).filter(key => links.has(key)), ...RESOURCES.map(r => r.key).filter(key => key !== 'sites' && !links.has(key) && !LAST.includes(key)), ...LAST];
  for (const key of sequence) for (const id of order.get(key) || []) {
    if (SKIPPED.has(key)) { count(key, 'skipped'); result.rows.push({ key, sourceId: id, targetId: null, action: 'skipped' }); continue; }
    copy(key, id);
  }
  // Only records inserted above are updated here (see DEFERRED_FIELDS).
  for (const item of deferred) {
    const updated = target.update(item.key, item.id, item.values, target.get(item.key, item.id)._version, DEMO_ACTOR);
    for (const [field, value] of Object.entries(item.values)) if (!same(updated[field], value)) note(result.normalized, `${item.key}.${field}`);
  }
  result.sampleParity = sampleParity(target, source);
  target.db.prepare('INSERT INTO metadata(key,value) VALUES (?,?)').run(DEMO_MARKER, '1');
  result.message = dryRun
    ? `Dry run: ${result.totals.inserted} records would be inserted and ${result.totals.matched} existing records referenced; everything was rolled back. Run with --apply to commit.`
    : `Demo project inserted: ${result.totals.inserted} records, ${result.totals.matched} existing records referenced, marker ${DEMO_MARKER} written.`;
  return result;
}

/** A summary without its one label: the demo test systems are renamed on purpose ("Demo – …"), the numbers must match. */
export const summaryNumbers = <T extends object>(summary: T | undefined): Omit<T, 'testSystemName'> | undefined => {
  if (!summary) return summary;
  const { testSystemName: _renamed, ...numbers } = summary as T & { testSystemName?: unknown };
  return numbers as Omit<T, 'testSystemName'>;
};
/**
 * Whether the demo isometrics show what the local sample shows: the isometric summaries of both pilots (progress,
 * blockers, punch, Material status) and the MTO materials list (Qty., Ord.?, Inv., Picked). A difference is
 * reported, not refused: matched catalog records (weld types, diameters, phases) are the client's and may differ.
 */
function sampleParity(target: Store, source: Store): NonNullable<DemoCopyResult['sampleParity']> {
  const availability = availabilityFor(HOSTED_RELEASE_PROFILE);
  const sourceIsos = source.list('isometrics');
  const before = isoSummariesFor(source, availability, sourceIsos);
  const after = isoSummariesFor(target, availability, target.list('isometrics').filter(iso => iso.id.startsWith(DEMO_ID_PREFIX)));
  const differing = sourceIsos.filter(iso => !same(summaryNumbers(after[`${DEMO_ID_PREFIX}${iso.id}`]), summaryNumbers(before[iso.id]))).map(iso => text(iso.isoNo));
  const keys = ['projects', 'isometrics', 'iso_materials', 'materials', 'custom_materials', 'orders', 'order_lines', 'picklists', 'stock', 'warehouses'];
  const rows = (store: Store) => Object.fromEntries(keys.map(key => [key, store.list(key, true)])) as Record<string, Row[]>;
  const quantities = (store: Store, projectId: string) => materialsList(rows(store), { projectId }).map(item => [item.values.iso, item.values.description, item.values.quantity, item.values.ordered, item.values.inventory, item.values.picked]);
  const projects = source.list('projects');
  const materialsDiffering = projects.filter(project => !same(quantities(target, `${DEMO_ID_PREFIX}${project.id}`), quantities(source, project.id))).map(project => text(project.internnumber));
  return { isometrics: sourceIsos.length, summariesMatching: sourceIsos.length - differing.length, summariesDiffering: differing, projects: projects.length, materialsListsDiffering: materialsDiffering };
}

// ---- CLI ------------------------------------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const unknown = args.filter(arg => arg !== '--apply' && arg !== '--dry-run');
  let db: PostgresDatabase | undefined;
  try {
    if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(' ')}. Use --apply to commit; the default is a dry run.`);
    if (apply && args.includes('--dry-run')) throw new Error('Choose either --dry-run or --apply.');
    // Same configuration and checks as server/prepare-welding.ts: an explicit existing workspace database, never SQLite.
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the hosted PostgreSQL database. This command never runs against SQLite.');
    if (process.env.STELUX_CLOUD_DATABASE !== 'workspace') throw new Error('Set STELUX_CLOUD_DATABASE=workspace: the demo project is added to an existing workspace database only.');
    const runtime = runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: HOSTED_RELEASE_PROFILE });
    if (runtime.cloudDatabaseSource !== 'workspace') throw new Error('The demo project is added to an existing workspace database only.');
    db = new PostgresDatabase(postgresConfig(process.env, false));
    if (db.dialect !== 'postgres') throw new Error('This command runs against PostgreSQL only.');
    workspaceCloudDatabase(db);
    const schema = inspectHostedSchema(db);
    if (!schema.upToDate) throw new Error('The hosted schema is not prepared for this release. Run npm run db:prepare:welding first (see README, Updating the hosted database).');
    const store = new Store('hosted-workspace', db, { initialize: false });
    const { rows: _rows, ...summary } = copyDemoProject(store, { dryRun: !apply });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(`Demo project ${apply ? '' : 'dry run '}failed; nothing was changed. ${(error as Error).message}`);
    process.exitCode = 1;
  } finally { db?.close(); }
}

const entry = process.argv[1] ? (() => { try { return realpathSync(resolve(process.argv[1])); } catch { return ''; } })() : '';
if (entry && entry === realpathSync(fileURLToPath(import.meta.url))) main();
