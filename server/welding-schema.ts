import { RESOURCES } from '../shared/resources.ts';
import type { Database } from './database.ts';
import { PLANNING_RESOURCES } from '../shared/planning.ts';

const references = [
  ['material1Id', 'materials'], ['material2Id', 'materials'],
  ['certificate1Id', 'certifications'], ['certificate2Id', 'certifications'],
] as const;

export function verifyWeldingTraceability(db: Database) {
  const columns = db.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema='stelux' AND table_name='welds' AND is_generated='ALWAYS'").all();
  const foreignKeys = db.prepare("SELECT a.attname AS name FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid=to_regclass('stelux.welds') AND c.contype='f'").all();
  if (references.some(([name]) => !columns.some(column => column.column_name === name) || !foreignKeys.some(key => key.name === name))) throw new Error('Prepare welding traceability with npm run db:prepare:welding before deploying the connected welding workspace.');
  for (const resource of RESOURCES.filter(resource => PLANNING_RESOURCES.includes(resource.key))) {
    if (!db.prepare('SELECT to_regclass(?) AS name').get(`stelux.${resource.key}`)?.name) throw new Error('Prepare welding traceability and project planning with npm run db:prepare:welding before deploying.');
    const columns = db.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema='stelux' AND table_name=? AND is_generated='ALWAYS'").all(resource.key);
    const keys = db.prepare("SELECT a.attname AS name FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid=to_regclass(?) AND c.contype='f'").all(`stelux.${resource.key}`);
    if (resource.fields.some(field => field.ref && (!columns.some(column => column.column_name === field.name) || !keys.some(key => key.name === field.name)))) throw new Error('Prepare welding traceability and project planning with npm run db:prepare:welding before deploying.');
  }
}

function snapshot(db: Database, only?: string[]) {
  const tables = RESOURCES.filter(resource => !PLANNING_RESOURCES.includes(resource.key) || db.prepare('SELECT to_regclass(?) AS name').get(`stelux.${resource.key}`)?.name).map(resource => ({ name: resource.key, columns: 'id,data,version,archived,created_at,updated_at', order: 'id' }));
  for (const [name, order] of [['credentials', 'user_id'], ['audit', 'id'], ['metadata', 'key'], ['counters', 'key'], ['upload_paths', 'attachment_id'], ['upload_blobs', 'attachment_id']]) {
    if (db.prepare('SELECT to_regclass(?) AS name').get(`stelux.${name}`)?.name) tables.push({ name, columns: '*', order });
  }
  return Object.fromEntries(tables.filter(table => !only || only.includes(table.name)).map(({ name, columns, order }) => {
    const row = db.prepare(`SELECT count(*) AS count, md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY "${order}"),'')) AS digest FROM (SELECT ${columns} FROM "${name}") t`).get()!;
    return [name, { count: Number(row.count), digest: String(row.digest) }];
  }));
}

/** Add nullable generated references atomically; never seed or rewrite records. */
export function prepareWeldingTraceability(db: Database) {
  db.exec('BEGIN; SELECT pg_advisory_xact_lock(1937007980); SET LOCAL search_path TO stelux,pg_catalog');
  try {
    const before = snapshot(db);
    for (const [field, target] of references) db.exec(`ALTER TABLE welds ADD COLUMN IF NOT EXISTS "${field}" TEXT GENERATED ALWAYS AS (nullif(data::jsonb->>'${field}', '')) STORED REFERENCES "${target}"(id) DEFERRABLE INITIALLY IMMEDIATE`);
    const planning = RESOURCES.filter(resource => PLANNING_RESOURCES.includes(resource.key));
    for (const resource of planning) db.exec(`CREATE TABLE IF NOT EXISTS "${resource.key}" (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(jsonb_typeof(data::jsonb)='object'), version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    for (const resource of planning) {
      for (const field of resource.fields.filter(field => field.ref)) db.exec(`ALTER TABLE "${resource.key}" ADD COLUMN IF NOT EXISTS "${field.name}" TEXT GENERATED ALWAYS AS (nullif(data::jsonb->>'${field.name}', '')) STORED REFERENCES "${field.ref}"(id) DEFERRABLE INITIALLY IMMEDIATE`);
      for (const [index, fields] of (resource.unique || []).entries()) db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "${resource.key}_unique_${index}" ON "${resource.key}" (${fields.map(field => `(coalesce(data::jsonb->>'${field}', ''))`).join(',')}) WHERE archived=0`);
      db.exec(`ALTER TABLE "${resource.key}" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON "${resource.key}" FROM PUBLIC`);
    }
    verifyWeldingTraceability(db);
    const after = snapshot(db, Object.keys(before));
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Welding preparation changed an existing record. The update was rolled back.');
    db.exec('COMMIT');
    return { columns: references.map(([name]) => name), counts: Object.fromEntries(Object.entries(after).map(([name, value]) => [name, value.count])), recordsPreserved: true };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
