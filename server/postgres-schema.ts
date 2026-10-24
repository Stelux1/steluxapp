import type { Database } from './database.ts';
import { RESOURCES } from '../shared/resources.ts';

export const POSTGRES_SCHEMA = 'stelux';

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
  db.exec('BEGIN; SELECT pg_advisory_xact_lock(1937007980)');
  try {
    for (const resource of RESOURCES) statements.push(`CREATE TABLE IF NOT EXISTS "${resource.key}" (
      id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(jsonb_typeof(data::jsonb)='object'),
      version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    for (const resource of RESOURCES) {
      for (const field of resource.fields.filter(f => f.ref)) statements.push(`ALTER TABLE "${resource.key}"
        ADD COLUMN IF NOT EXISTS "${field.name}" TEXT GENERATED ALWAYS AS (nullif(data::jsonb->>'${field.name}', '')) STORED
        REFERENCES "${field.ref}"(id) DEFERRABLE INITIALLY IMMEDIATE;`);
      for (const [i, keys] of (resource.unique || []).entries()) statements.push(`CREATE UNIQUE INDEX IF NOT EXISTS "${resource.key}_unique_${i}"
        ON "${resource.key}" (${keys.map(key => `(coalesce(data::jsonb->>'${key}', ''))`).join(',')}) WHERE archived=0;`);
    }
    statements.push(`
      CREATE UNIQUE INDEX IF NOT EXISTS stock_identity ON stock("materialId","warehouseId",(coalesce(data::jsonb->>'chargeNo',''))) WHERE archived=0;
      CREATE UNIQUE INDEX IF NOT EXISTS custom_stock_identity ON stock("customMaterialId","warehouseId",(coalesce(data::jsonb->>'chargeNo',''))) WHERE archived=0 AND "customMaterialId" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tool_stock_identity ON tool_stock("articleId","warehouseId") WHERE archived=0;
      CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY REFERENCES users(id) DEFERRABLE, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) DEFERRABLE, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL, sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE);
      CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity_type,entity_id);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS upload_paths(attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) DEFERRABLE, filename TEXT NOT NULL);
    `);
    for (const name of [...RESOURCES.map(r => r.key), 'credentials', 'sessions', 'audit', 'metadata', 'counters', 'upload_paths']) {
      statements.push(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON "${name}" FROM PUBLIC;`);
    }
    db.exec(statements.join('\n'));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
