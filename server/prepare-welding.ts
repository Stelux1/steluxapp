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
import { loadDiameterCatalog, missingDiameterCatalog } from './diameter-catalog.ts';
import { runHostedPreparation } from './hosted-preparation.ts';
import { backfillSpoolTestSystems } from './hydrotest.ts';

// Hosted update, one sequence (server/hosted-preparation.ts): decide what is pending, take ONE backup before the first
// change, bring the schema to this release in one transaction (server/hosted-schema.ts), then run the data steps.
// `--dry-run` (or STELUX_PREPARE_DRY_RUN=1) runs the schema step and rolls it back, counts the data steps; it writes no backup.
const dryRun = process.argv.includes('--dry-run') || process.env.STELUX_PREPARE_DRY_RUN === '1';
const runtime = runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: HOSTED_RELEASE_PROFILE });
const config = postgresConfig(process.env, runtime.cloudDatabaseSource === 'evaluation');
const db = new PostgresDatabase(config);
try {
  if (runtime.cloudDatabaseSource === 'evaluation') cloudDatabase(db); else workspaceCloudDatabase(db);
  const store = () => new Store('hosted-workspace', db, { initialize: false });
  let backupSkipped: unknown;
  const outcome = runHostedPreparation({
    schemaUpToDate: () => inspectHostedSchema(db).upToDate,
    prepareSchema: options => prepareHostedSchema(db, options),
    dataSteps: [
      // The data this release ships: standard defect codes, QA/QC engineer companies (server/catalog-upgrade.ts).
      { name: 'catalogData', run: options => upgradeWeldCatalogs(store(), options) },
      // The reference diameter catalog: adds the diameters the workspace does not hold and never changes one that exists.
      { name: 'diameterCatalog', run: ({ dryRun: counting }) => ({ added: counting ? missingDiameterCatalog(store()).length : loadDiameterCatalog(store()) }) },
      // Test systems at spool level: a spool without a test system of its own takes its isometric's, once (server/hydrotest.ts).
      { name: 'spoolTestSystems', run: options => backfillSpoolTestSystems(store(), options) },
    ],
    backup: () => {
      const destination = resolve('backups', `before-welding-live-${new Date().toISOString().replaceAll(':', '-')}`);
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      backupSkipped = backupPostgres(destination, config).skipped;
      return destination;
    },
    record: (destination, result) => writeFileSync(join(destination, 'preparation.json'), JSON.stringify({ ...result, backup: 'stelux-postgres.sql', backupSkipped }, null, 2) + '\n', { mode: 0o600 }),
  }, dryRun);
  console.log(JSON.stringify(outcome, null, 2));
} catch (error) {
  console.error(`Hosted preparation failed${dryRun ? ' (dry run)' : ''}; the step that failed was rolled back (each step runs in its own transaction, after the one backup). ${(error as Error).message}`);
  process.exitCode = 1;
} finally { db.close(); }
