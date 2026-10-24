import { DatabaseSync } from 'node:sqlite';
import type { Database, DatabaseValue } from './database.ts';
import { initializePostgres } from './postgres-schema.ts';
import { RESOURCES } from '../shared/resources.ts';

const recordColumns = ['id', 'data', 'version', 'archived', 'created_at', 'updated_at'];
const auditColumns = ['id', 'entity_type', 'entity_id', 'action', 'summary', 'actor_id', 'actor_name', 'created_at'];
const extraTables = [
  { name: 'credentials', columns: ['user_id', 'hash'] },
  { name: 'metadata', columns: ['key', 'value'] },
  { name: 'counters', columns: ['key', 'value'] },
  { name: 'upload_paths', columns: ['attachment_id', 'filename'] },
  { name: 'audit', columns: auditColumns },
];

/** Copies a consistent SQLite snapshot into an empty private PostgreSQL schema. */
export function migrateSqlite(sourceFilename: string, target: Database) {
  initializePostgres(target);
  const source = new DatabaseSync(sourceFilename, { readOnly: true });
  const counts: Record<string, number> = {};
  try {
    source.exec('BEGIN');
    const violations = source.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) throw new Error('The SQLite source contains broken references. Migration stopped.');
    const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => String(row.name)));
    if (!sourceTables.has('metadata') || !sourceTables.has('users')) throw new Error('The source is not a Stelux database.');
    target.exec('BEGIN; SELECT pg_advisory_xact_lock(1937007980); SET CONSTRAINTS ALL DEFERRED');
    try {
      const tables = [...RESOURCES.map(resource => ({ name: resource.key, columns: recordColumns })), ...extraTables];
      for (const { name } of [...tables, { name: 'sessions' }]) {
        if (target.prepare(`SELECT 1 FROM "${name}" LIMIT 1`).get()) throw new Error('The PostgreSQL workspace is not empty. Migration will not overwrite existing data.');
      }
      for (const { name, columns } of tables) {
        const quoted = columns.map(column => `"${column}"`).join(',');
        const rows = sourceTables.has(name) ? source.prepare(`SELECT ${quoted} FROM "${name}"${name === 'audit' ? ' ORDER BY rowid' : ''}`).all() : [];
        counts[name] = rows.length;
        for (let start = 0; start < rows.length; start += 100) {
          const batch = rows.slice(start, start + 100);
          const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
          const values = batch.flatMap(row => columns.map(column => row[column] as DatabaseValue));
          target.prepare(`INSERT INTO "${name}" (${quoted}) VALUES ${placeholders}`).run(...values);
        }
        const check = target.prepare(`SELECT count(*) AS count FROM "${name}"`).get();
        if (Number(check?.count) !== rows.length) throw new Error(`Migration count mismatch for ${name}.`);
      }
      target.prepare("INSERT INTO metadata(key,value) VALUES ('sqlite_migration_v1',?)").run(new Date().toISOString());
      // Force validation before reporting success, including forward references.
      target.exec('SET CONSTRAINTS ALL IMMEDIATE; COMMIT');
    } catch (error) { target.exec('ROLLBACK'); throw error; }
    source.exec('COMMIT');
    return counts;
  } finally { source.close(); }
}
