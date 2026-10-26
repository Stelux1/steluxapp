import { RESOURCES } from '../shared/resources.ts';
import type { Database } from './database.ts';

const references = [
  ['material1Id', 'materials'], ['material2Id', 'materials'],
  ['certificate1Id', 'certifications'], ['certificate2Id', 'certifications'],
] as const;

export function verifyWeldingTraceability(db: Database) {
  const columns = db.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema='stelux' AND table_name='welds' AND is_generated='ALWAYS'").all();
  const foreignKeys = db.prepare("SELECT a.attname AS name FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid=to_regclass('stelux.welds') AND c.contype='f'").all();
  if (references.some(([name]) => !columns.some(column => column.column_name === name) || !foreignKeys.some(key => key.name === name))) throw new Error('Prepare welding traceability with npm run db:prepare:welding before deploying the connected welding workspace.');
}

function snapshot(db: Database) {
  const tables = RESOURCES.map(resource => ({ name: resource.key, columns: 'id,data,version,archived,created_at,updated_at', order: 'id' }));
  for (const [name, order] of [['credentials', 'user_id'], ['audit', 'id'], ['metadata', 'key'], ['counters', 'key'], ['upload_paths', 'attachment_id'], ['upload_blobs', 'attachment_id']]) {
    if (db.prepare('SELECT to_regclass(?) AS name').get(`stelux.${name}`)?.name) tables.push({ name, columns: '*', order });
  }
  return Object.fromEntries(tables.map(({ name, columns, order }) => {
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
    verifyWeldingTraceability(db);
    const after = snapshot(db);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Welding preparation changed an existing record. The update was rolled back.');
    db.exec('COMMIT');
    return { columns: references.map(([name]) => name), counts: Object.fromEntries(Object.entries(after).map(([name, value]) => [name, value.count])), recordsPreserved: true };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
