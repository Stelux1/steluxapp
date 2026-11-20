import type { Database } from './database.ts';
import { RESOURCES } from '../shared/resources.ts';
import type { Resource } from '../shared/types.ts';

export const POSTGRES_SCHEMA = 'stelux';
/** Serialises schema changes and domain writes (see Store.transaction and the hosted preparation). */
export const SCHEMA_LOCK = 1937007980;

// The statement builders below are shared by the local initialization and the
// hosted preparation (server/hosted-schema.ts), so both produce the same shape.
export const recordTableStatement = (key: string) => `CREATE TABLE IF NOT EXISTS "${key}" (
      id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(jsonb_typeof(data::jsonb)='object'),
      version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`;
/** The JSON value a generated reference column stores. */
export const referenceExpression = (field: string) => `nullif(data::jsonb->>'${field}', '')`;
export const referenceColumnStatement = (key: string, field: string, target: string) => `ALTER TABLE "${key}"
        ADD COLUMN IF NOT EXISTS "${field}" TEXT GENERATED ALWAYS AS (${referenceExpression(field)}) STORED
        REFERENCES "${target}"(id) DEFERRABLE INITIALLY IMMEDIATE;`;

export interface UniqueIndex { name: string; table: string; expressions: string[]; where: string }
/** Unique rules of every resource plus the fixed stock identities, in creation order. */
export function uniqueIndexes(resources: Resource[] = RESOURCES): UniqueIndex[] {
  const indexes = resources.flatMap(resource => (resource.unique || []).map((keys, i) => ({
    name: `${resource.key}_unique_${i}`, table: resource.key, expressions: keys.map(key => `(coalesce(data::jsonb->>'${key}', ''))`), where: 'archived=0',
  })));
  const keys = new Set(resources.map(resource => resource.key));
  if (keys.has('stock')) indexes.push(
    { name: 'stock_identity', table: 'stock', expressions: ['"materialId"', '"warehouseId"', "(coalesce(data::jsonb->>'chargeNo',''))"], where: 'archived=0' },
    { name: 'custom_stock_identity', table: 'stock', expressions: ['"customMaterialId"', '"warehouseId"', "(coalesce(data::jsonb->>'chargeNo',''))"], where: 'archived=0 AND "customMaterialId" IS NOT NULL' },
  );
  if (keys.has('tool_stock')) indexes.push({ name: 'tool_stock_identity', table: 'tool_stock', expressions: ['"articleId"', '"warehouseId"'], where: 'archived=0' });
  return indexes;
}
/**
 * Unique rules a release REPLACED by a looser one under the same index name: index name → the JSON keys the previous
 * release's index enforced. Client 20.11.2026: an ITP No, WPS number and PQR are unique per main project, no longer over
 * all main projects. A unique index holds no data, and every existing set of rows that met the old rule meets the new
 * one, so the preparation drops exactly this previous index and creates its replacement in its one transaction
 * (server/hosted-schema.ts); any other differing index is still reported and left alone.
 */
export const REPLACED_UNIQUE_RULES: Record<string, string[]> = { pqr_unique_0: ['name'], wps_unique_0: ['name'], itps_unique_0: ['number'] };
export const uniqueIndexStatement = (index: UniqueIndex) => `CREATE UNIQUE INDEX IF NOT EXISTS "${index.name}"
        ON "${index.table}" (${index.expressions.join(',')}) WHERE ${index.where};`;
/** Drops the previous index of a replaced unique rule (REPLACED_UNIQUE_RULES) when it does not enforce the new keys yet. */
export function replacedIndexDrop(index: UniqueIndex) {
  const added = index.expressions.flatMap(expression => [...expression.matchAll(/->>'((?:[^']|'')*)'/g)].map(match => match[1])).filter(key => !REPLACED_UNIQUE_RULES[index.name].includes(key));
  return `DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='${POSTGRES_SCHEMA}' AND indexname='${index.name}' AND NOT (${added.map(key => `indexdef LIKE '%''${key}''%'`).join(' AND ') || 'true'})) THEN DROP INDEX ${POSTGRES_SCHEMA}."${index.name}"; END IF; END $$;`;
}
export const protectStatement = (table: string) => `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON "${table}" FROM PUBLIC;`;

export function initializePostgres(db: Database) {
  const statements: string[] = [];
  statements.push(`CREATE SCHEMA IF NOT EXISTS ${POSTGRES_SCHEMA};
    REVOKE ALL ON SCHEMA ${POSTGRES_SCHEMA} FROM PUBLIC;
    SET search_path TO ${POSTGRES_SCHEMA}, pg_catalog;`);
  // This private schema is not exposed by the Supabase Data API.
  statements.push(`DO $$ BEGIN
    IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON SCHEMA ${POSTGRES_SCHEMA} FROM anon; END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON SCHEMA ${POSTGRES_SCHEMA} FROM authenticated; END IF;
  END $$;`);
  db.exec(`BEGIN; SELECT pg_advisory_xact_lock(${SCHEMA_LOCK})`);
  try {
    for (const resource of RESOURCES) statements.push(recordTableStatement(resource.key));
    for (const resource of RESOURCES) {
      for (const field of resource.fields.filter(f => f.ref)) statements.push(referenceColumnStatement(resource.key, field.name, field.ref!));
    }
    // A database initialized by an earlier release keeps the previous index of a replaced unique rule: it goes first.
    for (const index of uniqueIndexes().filter(item => REPLACED_UNIQUE_RULES[item.name])) statements.push(replacedIndexDrop(index));
    for (const index of uniqueIndexes()) statements.push(uniqueIndexStatement(index));
    statements.push(`
      CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY REFERENCES users(id) DEFERRABLE, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) DEFERRABLE, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL, sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE);
      CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity_type,entity_id);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS upload_paths(attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) DEFERRABLE, filename TEXT NOT NULL);
    `);
    for (const name of [...RESOURCES.map(r => r.key), 'credentials', 'sessions', 'audit', 'metadata', 'counters', 'upload_paths']) {
      statements.push(protectStatement(name));
    }
    db.exec(statements.join('\n'));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
