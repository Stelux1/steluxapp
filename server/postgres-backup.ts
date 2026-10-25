import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { RESOURCES } from '../shared/resources.ts';
import type { ClientConfig } from 'pg';

export function backupPostgres(destination: string, config: ClientConfig = postgresConfig()) {
  const database = new PostgresDatabase(config);
  const quote = (value: unknown) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  const tables = [
    ...RESOURCES.map(resource => ({ name: resource.key, columns: ['id', 'data', 'version', 'archived', 'created_at', 'updated_at'] })),
    { name: 'credentials', columns: ['user_id', 'hash'] },
    { name: 'metadata', columns: ['key', 'value'] },
    { name: 'counters', columns: ['key', 'value'] },
    { name: 'upload_paths', columns: ['attachment_id', 'filename'] },
    { name: 'audit', columns: ['id', 'entity_type', 'entity_id', 'action', 'summary', 'actor_id', 'actor_name', 'created_at'] },
  ];
  const sql = ['-- Restore only into an empty Stelux schema initialized by the app.', 'BEGIN;', 'SET LOCAL standard_conforming_strings=on;', 'SET search_path TO stelux,pg_catalog;', 'SET CONSTRAINTS ALL DEFERRED;'];
  try {
    database.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET search_path TO stelux,pg_catalog');
    for (const { name, columns } of tables) {
      const names = columns.map(column => `"${column}"`).join(',');
      const rows = database.prepare(`SELECT ${names} FROM "${name}"${name === 'audit' ? ' ORDER BY sequence' : ''}`).all();
      for (const row of rows) sql.push(`INSERT INTO "${name}" (${names}) VALUES (${columns.map(column => quote(row[column])).join(',')})${name === 'metadata' ? ' ON CONFLICT(key) DO UPDATE SET value=excluded.value' : ''};`);
    }
    if (database.prepare("SELECT to_regclass('stelux.upload_blobs') AS name").get()?.name) {
      // Fetch documents separately so several 20 MB files cannot overflow the
      // worker's bounded response buffer in a single database result.
      for (const row of database.prepare('SELECT attachment_id FROM upload_blobs ORDER BY attachment_id').all()) {
        const blob = database.prepare('SELECT content FROM upload_blobs WHERE attachment_id=?').get(String(row.attachment_id))!;
        sql.push(`INSERT INTO upload_blobs (attachment_id,content) VALUES (${quote(row.attachment_id)},${quote(blob.content)});`);
      }
    }
    database.exec('COMMIT');
    sql.push('COMMIT;');
    writeFileSync(join(destination, 'stelux-postgres.sql'), sql.join('\n') + '\n', { mode: 0o600 });
  } finally { database.close(); }
}
