import type { Database } from './database.ts';
import { RESOURCES } from '../shared/resources.ts';
import type { Resource } from '../shared/types.ts';
import { POSTGRES_SCHEMA, SCHEMA_LOCK, protectStatement, recordTableStatement, referenceColumnStatement, uniqueIndexes, uniqueIndexStatement, type UniqueIndex } from './postgres-schema.ts';

/**
 * Hosted schema preparation. The hosted server never migrates during a request; this backed-up, manual
 * step brings an existing workspace database to the shape `initializePostgres` produces for every resource
 * in `shared/resources.ts`: missing record tables, generated reference columns with their foreign keys,
 * unique indexes and row-level security. It never seeds, rewrites, nulls or drops anything.
 */
export const PREPARE_COMMAND = 'STELUX_CLOUD_DATABASE=workspace npm run db:prepare:welding';
const RECORD_COLUMNS: Record<string, string> = { id: 'text', data: 'text', version: 'integer', archived: 'integer', created_at: 'text', updated_at: 'text' };
/** Created by the initial migration (or `db:prepare:cloud`); the preparation requires but never changes them. */
const FIXED_TABLES = ['credentials', 'sessions', 'audit', 'metadata', 'counters'];
/** Session rows change with every sign-in, so they are not part of the record comparison. */
const UNCOMPARED_TABLES = ['sessions'];
const LIST_LIMIT = 20;

interface Column { generated: boolean; expression: string | null; type: string }
interface Catalog {
  tables: Map<string, { rls: boolean; publicAccess: boolean }>;
  columns: Map<string, Map<string, Column>>;
  /** Single-column foreign keys by `table.column`. */
  foreignKeys: Map<string, { target: string; schema: string; deferrable: boolean }>;
  indexes: Map<string, { table: string; unique: boolean; definition: string }>;
}
export interface Reference { table: string; field: string; target: string }
export interface HostedSchemaPlan {
  tables: string[];
  columns: Reference[];
  /** Generated reference columns that exist without their foreign key. */
  foreignKeys: Reference[];
  indexes: UniqueIndex[];
  protect: string[];
  /** Existing objects that differ from the release; the preparation never alters them automatically. */
  conflicts: string[];
  missingFixedTables: string[];
}

/** Four catalog queries; reads nothing but system catalogs. */
function readCatalog(db: Database): Catalog {
  const namespace = `to_regnamespace('${POSTGRES_SCHEMA}')`;
  const tables = new Map(db.prepare(`SELECT c.relname AS name, c.relrowsecurity AS rls,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl WHERE acl.grantee=0) AS public
    FROM pg_class c WHERE c.relnamespace=${namespace} AND c.relkind IN ('r','p')`).all()
    .map(row => [String(row.name), { rls: Boolean(row.rls), publicAccess: Boolean(row.public) }]));
  const columns = new Map<string, Map<string, Column>>();
  for (const row of db.prepare(`SELECT c.relname AS "table", a.attname AS name, a.attgenerated AS generated, format_type(a.atttypid, a.atttypmod) AS type,
      pg_get_expr(d.adbin, d.adrelid) AS expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE c.relnamespace=${namespace} AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped`).all()) {
    const table = String(row.table);
    if (!columns.has(table)) columns.set(table, new Map());
    columns.get(table)!.set(String(row.name), { generated: row.generated === 's', expression: row.expression == null ? null : String(row.expression), type: String(row.type) });
  }
  const foreignKeys = new Map(db.prepare(`SELECT s.relname AS "table", a.attname AS "column", t.relname AS target, n.nspname AS schema, con.condeferrable AS deferrable
    FROM pg_constraint con JOIN pg_class s ON s.oid=con.conrelid JOIN pg_class t ON t.oid=con.confrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1]
    WHERE con.contype='f' AND s.relnamespace=${namespace} AND cardinality(con.conkey)=1`).all()
    .map(row => [`${row.table}.${row.column}`, { target: String(row.target), schema: String(row.schema), deferrable: Boolean(row.deferrable) }]));
  const indexes = new Map(db.prepare(`SELECT i.relname AS name, t.relname AS "table", x.indisunique AS "unique", pg_get_indexdef(x.indexrelid) AS definition
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid WHERE t.relnamespace=${namespace}`).all()
    .map(row => [String(row.name), { table: String(row.table), unique: Boolean(row.unique), definition: String(row.definition) }]));
  return { tables, columns, foreignKeys, indexes };
}

/** JSON keys a unique index enforces, in order (`coalesce((data)::jsonb ->> 'name'::text), ...)`). */
const jsonKeys = (definition: string) => [...definition.matchAll(/->> '((?:[^']|'')*)'::text/g)].map(match => match[1]);
const expectedJsonKeys = (index: UniqueIndex) => index.expressions.flatMap(expression => [...expression.matchAll(/->>'((?:[^']|'')*)'/g)].map(match => match[1]));

/** What the preparation would create for `resources`; purely derived from the catalog and the definitions. */
export function planHostedSchema(catalog: Catalog, resources: Resource[] = RESOURCES): HostedSchemaPlan {
  const plan: HostedSchemaPlan = { tables: [], columns: [], foreignKeys: [], indexes: [], protect: [], conflicts: [], missingFixedTables: FIXED_TABLES.filter(name => !catalog.tables.has(name)) };
  for (const resource of resources) {
    const table = catalog.tables.get(resource.key);
    if (!table) { plan.tables.push(resource.key); plan.protect.push(resource.key); continue; }
    if (!table.rls || table.publicAccess) plan.protect.push(resource.key);
    const columns = catalog.columns.get(resource.key) || new Map<string, Column>();
    for (const [name, type] of Object.entries(RECORD_COLUMNS)) {
      const column = columns.get(name);
      if (!column) plan.conflicts.push(`Table ${resource.key} has no ${name} column.`);
      else if (column.type !== type || column.generated) plan.conflicts.push(`Column ${resource.key}.${name} is ${column.generated ? 'generated ' : ''}${column.type}; the release expects ${type}.`);
    }
  }
  for (const resource of resources) for (const field of resource.fields.filter(field => field.ref)) {
    const reference = { table: resource.key, field: field.name, target: field.ref! };
    const column = catalog.columns.get(resource.key)?.get(field.name);
    if (!catalog.tables.has(resource.key) || !column) { plan.columns.push(reference); continue; }
    if (!column.generated || column.type !== 'text' || !column.expression?.includes(`->> '${field.name.replaceAll("'", "''")}'::text`)) {
      plan.conflicts.push(`Column ${resource.key}.${field.name} exists but is not the generated reference to ${field.ref} this release expects.`);
      continue;
    }
    const key = catalog.foreignKeys.get(`${resource.key}.${field.name}`);
    if (!key) plan.foreignKeys.push(reference);
    else if (key.target !== field.ref || key.schema !== POSTGRES_SCHEMA) plan.conflicts.push(`Column ${resource.key}.${field.name} references ${key.schema}.${key.target}; the release expects ${field.ref}.`);
    else if (!key.deferrable) plan.conflicts.push(`The foreign key on ${resource.key}.${field.name} is not deferrable; backups cannot be restored into it.`);
  }
  for (const index of uniqueIndexes(resources)) {
    const existing = catalog.indexes.get(index.name);
    if (!existing) { plan.indexes.push(index); continue; }
    const expected = expectedJsonKeys(index), actual = jsonKeys(existing.definition);
    if (existing.table !== index.table || !existing.unique || (expected.length === index.expressions.length && JSON.stringify(actual) !== JSON.stringify(expected))) {
      plan.conflicts.push(`Index ${index.name} on ${existing.table} enforces (${actual.join(', ') || existing.definition}); the release expects a unique rule on ${index.table} (${expected.join(', ') || index.expressions.join(', ')}). Unique rules may only be appended to a resource, never reordered.`);
    }
  }
  return plan;
}

const pending = (plan: HostedSchemaPlan) => plan.tables.length + plan.columns.length + plan.foreignKeys.length + plan.indexes.length + plan.protect.length;
const cut = (items: string[]) => items.length > LIST_LIMIT ? [...items.slice(0, LIST_LIMIT), `… ${items.length - LIST_LIMIT} more`] : items;
export function describePlan(plan: HostedSchemaPlan) {
  return {
    tables: plan.tables,
    columns: plan.columns.map(({ table, field, target }) => `${table}.${field} → ${target}`),
    foreignKeys: plan.foreignKeys.map(({ table, field, target }) => `${table}.${field} → ${target}`),
    indexes: plan.indexes.map(index => `${index.name} on ${index.table}`),
    rowLevelSecurity: plan.protect,
  };
}

/**
 * Startup check of the complete prepared schema (every resource table, reference, foreign key, unique index
 * and row-level security). Catalog queries only; never writes.
 */
export function verifyHostedSchema(db: Database, resources: Resource[] = RESOURCES) {
  const plan = planHostedSchema(readCatalog(db), resources);
  if (plan.missingFixedTables.length) throw new Error(`This database was not initialized by Blitzkrieg (missing ${plan.missingFixedTables.join(', ')}). Use an initialized workspace database.`);
  if (!pending(plan) && !plan.conflicts.length) return;
  const missing = Object.entries(describePlan(plan)).filter(([, items]) => items.length).map(([kind, items]) => `${kind}: ${cut(items).join(', ')}`);
  throw new Error([
    `Prepare welding traceability and the hosted schema with ${PREPARE_COMMAND} before deploying (back up, then run it with --dry-run first).`,
    ...(missing.length ? [`Missing ${missing.join('; ')}.`] : []),
    ...(plan.conflicts.length ? [`Resolve manually first: ${cut(plan.conflicts).join(' ')}`] : []),
  ].join(' '));
}

interface TableSnapshot { columns: string[]; order: string }
/** Column lists of every pre-existing table, fixed before any change so the comparison is like for like. */
function snapshotSpec(catalog: Catalog) {
  const spec = new Map<string, TableSnapshot>();
  for (const [table, columns] of catalog.columns) {
    if (UNCOMPARED_TABLES.includes(table) || !catalog.tables.has(table)) continue;
    const names = [...columns.entries()].filter(([, column]) => !column.generated).map(([name]) => name).sort();
    const first = ['id', 'key', 'user_id', 'attachment_id'].find(name => names.includes(name)) || names[0];
    if (first) spec.set(table, { columns: names, order: first });
  }
  return spec;
}
/** Row count and digest (an md5 over per-row md5s, so large documents stay bounded) of each table. */
function snapshot(db: Database, spec: Map<string, TableSnapshot>) {
  return Object.fromEntries([...spec].sort(([a], [b]) => a.localeCompare(b)).map(([name, { columns, order }]) => {
    const row = db.prepare(`SELECT count(*) AS count, md5(coalesce(string_agg(md5(j), '' ORDER BY k, j), '')) AS digest
      FROM (SELECT row_to_json(t)::text AS j, t."${order}"::text AS k FROM (SELECT ${columns.map(column => `"${column}"`).join(',')} FROM "${name}") t) rows`).get()!;
    return [name, { count: Number(row.count), digest: String(row.digest) }];
  }));
}

function referenceViolations(db: Database, references: Reference[]) {
  const problems: string[] = [];
  for (const { table, field, target } of references) {
    const value = `nullif(source.data::jsonb->>'${field}', '')`;
    const rows = db.prepare(`SELECT count(*) OVER () AS total, source.id, ${value} AS value FROM "${table}" source
      WHERE ${value} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${target}" target WHERE target.id=${value}) ORDER BY source.id LIMIT ${LIST_LIMIT}`).all();
    if (rows.length) problems.push(`${table}.${field} → ${target}: ${rows[0].total} record(s) hold ids that do not exist in ${target}: ${rows.map(row => `${row.id} (${field}=${row.value})`).join(', ')}${Number(rows[0].total) > rows.length ? ', …' : ''}.`);
  }
  return problems;
}
function uniqueViolations(db: Database, indexes: UniqueIndex[]) {
  const problems: string[] = [];
  for (const index of indexes) {
    // NULLs never conflict in a unique index, so only complete keys are compared.
    const rows = db.prepare(`SELECT count(*) AS total, array_agg(id ORDER BY id) AS ids FROM "${index.table}" WHERE ${index.where}
      AND ${index.expressions.map(expression => `${expression} IS NOT NULL`).join(' AND ')} GROUP BY ${index.expressions.join(', ')} HAVING count(*) > 1 ORDER BY min(id) LIMIT ${LIST_LIMIT}`).all();
    const keys = expectedJsonKeys(index);
    if (rows.length) problems.push(`${index.table} (${(keys.length === index.expressions.length ? keys : index.expressions).join(', ')}) must be unique among active records, but these records share a value: ${rows.map(row => `[${(row.ids as string[]).join(', ')}]`).join(', ')}.`);
  }
  return problems;
}

export interface PrepareOptions {
  dryRun?: boolean;
  resources?: Resource[];
  /** Tests only: runs inside the transaction after the schema changes, before verification. */
  afterChanges?: (db: Database) => void;
}
export interface PrepareResult {
  dryRun: boolean;
  upToDate: boolean;
  created: ReturnType<typeof describePlan>;
  /** Added reference columns as `table.field` (kept for the earlier welding preparation output). */
  columns: string[];
  /** Row counts of the tables that existed before the preparation. */
  counts: Record<string, number>;
  recordsPreserved: true;
}

/**
 * One transaction under the schema lock: create what is missing, refuse anything that would require
 * changing a record, verify the result and compare every pre-existing table row by row. A dry run
 * performs the same work and rolls it back. Any error rolls everything back.
 */
export function prepareHostedSchema(db: Database, options: PrepareOptions = {}): PrepareResult {
  const resources = options.resources || RESOURCES;
  db.exec(`BEGIN; SELECT pg_advisory_xact_lock(${SCHEMA_LOCK}); SET LOCAL search_path TO ${POSTGRES_SCHEMA},pg_catalog`);
  try {
    const catalog = readCatalog(db);
    const plan = planHostedSchema(catalog, resources);
    if (plan.missingFixedTables.length) throw new Error(`This database was not initialized by Blitzkrieg (missing ${plan.missingFixedTables.join(', ')}). Nothing was changed.`);
    if (plan.conflicts.length) throw new Error(`The hosted schema differs from this release in ways the preparation never changes automatically. Nothing was changed. ${plan.conflicts.join(' ')}`);
    const spec = snapshotSpec(catalog);
    const before = snapshot(db, spec);
    for (const table of plan.tables) db.exec(recordTableStatement(table));
    // New tables are empty, so only references stored in pre-existing records can be invalid.
    const references = referenceViolations(db, [...plan.columns, ...plan.foreignKeys].filter(({ table }) => catalog.tables.has(table)));
    if (references.length) throw new Error(`Cannot add the foreign keys this release requires: existing records point at records that do not exist. Nothing was changed; correct or clear these values in the application, then run the preparation again. ${references.join(' ')}`);
    for (const { table, field, target } of plan.columns) db.exec(referenceColumnStatement(table, field, target));
    for (const { table, field, target } of plan.foreignKeys) db.exec(`ALTER TABLE "${table}" ADD FOREIGN KEY ("${field}") REFERENCES "${target}"(id) DEFERRABLE INITIALLY IMMEDIATE`);
    const duplicates = uniqueViolations(db, plan.indexes.filter(({ table }) => catalog.tables.has(table)));
    if (duplicates.length) throw new Error(`Cannot add the unique rules this release requires: existing active records violate them. Nothing was changed; resolve the duplicates in the application, then run the preparation again. ${duplicates.join(' ')}`);
    for (const index of plan.indexes) db.exec(uniqueIndexStatement(index));
    for (const table of plan.protect) db.exec(protectStatement(table));
    options.afterChanges?.(db);
    verifyHostedSchema(db, resources);
    const after = snapshot(db, spec);
    const changed = Object.keys(before).filter(name => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
    if (changed.length) throw new Error(`Welding preparation changed an existing record (${changed.join(', ')}). The update was rolled back.`);
    db.exec(options.dryRun ? 'ROLLBACK' : 'COMMIT');
    const created = describePlan(plan);
    return { dryRun: Boolean(options.dryRun), upToDate: !pending(plan), created, columns: [...plan.columns, ...plan.foreignKeys].map(({ table, field }) => `${table}.${field}`), counts: Object.fromEntries(Object.entries(before).map(([name, value]) => [name, value.count])), recordsPreserved: true };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** Read-only: what a preparation would do now (no transaction, no lock). */
export function inspectHostedSchema(db: Database, resources: Resource[] = RESOURCES) {
  const plan = planHostedSchema(readCatalog(db), resources);
  return { upToDate: !pending(plan) && !plan.conflicts.length && !plan.missingFixedTables.length, pending: describePlan(plan), conflicts: plan.conflicts, missingFixedTables: plan.missingFixedTables };
}
