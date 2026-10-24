import './env.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { migrateSqlite } from './migrate-data.ts';

const dataDir = resolve(process.env.STELUX_DATA_DIR || '.data');
const sourceFile = join(dataDir, 'stelux.sqlite');
if (!existsSync(sourceFile)) throw new Error('The local SQLite database does not exist. Nothing was migrated.');
const config = postgresConfig();
const backupDir = resolve('backups', `before-supabase-${new Date().toISOString().replaceAll(':', '-')}`);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const snapshot = join(backupDir, 'stelux.sqlite');
const sqlite = new DatabaseSync(sourceFile, { readOnly: true });
try { sqlite.prepare('VACUUM INTO ?').run(snapshot); } finally { sqlite.close(); }
if (existsSync(join(dataDir, 'uploads'))) cpSync(join(dataDir, 'uploads'), join(backupDir, 'uploads'), { recursive: true });
console.log(`Local backup saved: ${backupDir}`);
const database = new PostgresDatabase(config);
try {
  const counts = migrateSqlite(snapshot, database);
  console.log(`Migrated ${Object.values(counts).reduce((sum, count) => sum + count, 0)} rows across ${Object.keys(counts).length} tables to PostgreSQL. Row counts and references verified.`);
  console.log('Accounts and password hashes are preserved. Sign in again. Attachments remain in the local uploads directory.');
} finally { database.close(); }
