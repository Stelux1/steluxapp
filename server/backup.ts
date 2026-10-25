import './env.ts';
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupPostgres } from './postgres-backup.ts';
import { runtimeConfig } from './runtime-config.ts';
import { postgresConfig } from './postgres.ts';
const config = runtimeConfig(process.env);
const dataDir = config.dataDir;
if (!config.databaseUrl && !existsSync(join(dataDir, 'stelux.sqlite'))) throw new Error('Start the app once before creating a backup.');
const dest = resolve('backups', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(dest, { recursive: true, mode: 0o700 });
if (config.databaseUrl) backupPostgres(dest, postgresConfig(process.env, config.cloud));
else {
  const database = new DatabaseSync(join(dataDir, 'stelux.sqlite'),{readOnly:true});
  try{database.prepare('VACUUM INTO ?').run(join(dest,'stelux.sqlite'));}finally{database.close();}
}
if (existsSync(join(dataDir, 'uploads'))) cpSync(join(dataDir, 'uploads'), join(dest, 'uploads'), { recursive: true });
console.log(`Backup saved: ${dest}`);
