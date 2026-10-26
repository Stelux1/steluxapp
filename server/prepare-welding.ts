import './env.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runtimeConfig } from './runtime-config.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { cloudDatabase, workspaceCloudDatabase } from './cloud-database.ts';
import { backupPostgres } from './postgres-backup.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { prepareWeldingTraceability } from './welding-schema.ts';

const runtime = runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: HOSTED_RELEASE_PROFILE });
const config = postgresConfig(process.env, runtime.cloudDatabaseSource === 'evaluation');
const db = new PostgresDatabase(config);
try {
  if (runtime.cloudDatabaseSource === 'evaluation') cloudDatabase(db); else workspaceCloudDatabase(db);
  const destination = resolve('backups', `before-welding-live-${new Date().toISOString().replaceAll(':', '-')}`);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  backupPostgres(destination, config);
  const result = prepareWeldingTraceability(db);
  writeFileSync(join(destination, 'preparation.json'), JSON.stringify({ ...result, backup: 'stelux-postgres.sql' }, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ backup: destination, ...result }));
} finally { db.close(); }
