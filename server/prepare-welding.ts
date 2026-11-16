import './env.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runtimeConfig } from './runtime-config.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { cloudDatabase, workspaceCloudDatabase } from './cloud-database.ts';
import { backupPostgres } from './postgres-backup.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { inspectHostedSchema, prepareHostedSchema } from './hosted-schema.ts';
import { Store } from './store.ts';
import { upgradeWeldCatalogs } from './catalog-upgrade.ts';

// Hosted update: back up, then bring the schema to this release in one transaction (see server/hosted-schema.ts).
// `--dry-run` (or STELUX_PREPARE_DRY_RUN=1) performs the whole step and rolls it back; it writes no backup.
const dryRun = process.argv.includes('--dry-run') || process.env.STELUX_PREPARE_DRY_RUN === '1';
const runtime = runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: HOSTED_RELEASE_PROFILE });
const config = postgresConfig(process.env, runtime.cloudDatabaseSource === 'evaluation');
const db = new PostgresDatabase(config);
try {
  if (runtime.cloudDatabaseSource === 'evaluation') cloudDatabase(db); else workspaceCloudDatabase(db);
  // After the schema: the data this release ships (standard defect codes, QA/QC engineer companies), idempotent (server/catalog-upgrade.ts).
  const catalogs = (options: { dryRun?: boolean }) => upgradeWeldCatalogs(new Store('hosted-workspace', db, { initialize: false }), options);
  const catalogsPending = (c: ReturnType<typeof upgradeWeldCatalogs>) => Object.values(c).some(count => count > 0);
  if (dryRun) {
    const result = prepareHostedSchema(db, { dryRun: true });
    const data = inspectHostedSchema(db).upToDate ? catalogs({ dryRun: true }) : 'after the schema preparation';
    console.log(JSON.stringify({ ...result, catalogData: data, message: result.upToDate ? 'Dry run: the hosted schema is already prepared. Nothing to do.' : 'Dry run: the changes listed under "created" were applied and rolled back. Nothing was changed and no backup was written.' }, null, 2));
  } else if (inspectHostedSchema(db).upToDate && !catalogsPending(catalogs({ dryRun: true }))) {
    console.log(JSON.stringify({ upToDate: true, message: 'The hosted schema is already prepared. Nothing to do; nothing was changed and no backup was needed.' }));
  } else {
    const destination = resolve('backups', `before-welding-live-${new Date().toISOString().replaceAll(':', '-')}`);
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    const backup = backupPostgres(destination, config);
    const result = prepareHostedSchema(db);
    const data = catalogs({});
    writeFileSync(join(destination, 'preparation.json'), JSON.stringify({ ...result, catalogData: data, backup: 'stelux-postgres.sql', backupSkipped: backup.skipped }, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ backup: destination, ...result, catalogData: data }, null, 2));
  }
} catch (error) {
  console.error(`Hosted schema preparation failed${dryRun ? ' (dry run)' : ''}; every change was rolled back. ${(error as Error).message}`);
  process.exitCode = 1;
} finally { db.close(); }
