import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupPostgres } from './postgres-backup.ts';
const dataDir = resolve(process.env.STELUX_DATA_DIR || '.data');
if (!process.env.DATABASE_URL && !existsSync(join(dataDir, 'stelux.sqlite'))) throw new Error('Start the app once before creating a backup.');
const dest = resolve('backups', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(dest, { recursive: true, mode: 0o700 });
if (process.env.DATABASE_URL) backupPostgres(dest);
else {
  const database = new DatabaseSync(join(dataDir, 'stelux.sqlite'),{readOnly:true});
  try{database.prepare('VACUUM INTO ?').run(join(dest,'stelux.sqlite'));}finally{database.close();}
}
if (existsSync(join(dataDir, 'uploads'))) cpSync(join(dataDir, 'uploads'), join(dest, 'uploads'), { recursive: true });
console.log(`Backup saved: ${dest}`);
import './env.ts';
