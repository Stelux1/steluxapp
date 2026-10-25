import { resolve } from 'node:path';
import { Store } from './store.ts';
import { createApp } from './http.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { cloudDatabase, workspaceCloudDatabase } from './cloud-database.ts';
import { runtimeConfig } from './runtime-config.ts';

// Both the container and the Next.js function use the same domain API. Creating
// this runtime never listens on a port, migrates a database or seeds records.
export function createCloudApp(env: NodeJS.ProcessEnv, serveClient = false) {
  const config = runtimeConfig({ ...env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: 'welding-demo' });
  const evaluation = config.cloudDatabaseSource === 'evaluation';
  const database = new PostgresDatabase(postgresConfig(env, evaluation));
  try {
    if (evaluation) cloudDatabase(database); else workspaceCloudDatabase(database);
    const store = new Store(resolve(config.dataDir, 'stelux.sqlite'), database, { initialize: false });
    const app = createApp(store, config.dataDir, {
      releaseProfile: config.profile, distDir: config.distDir, serveClient,
      publicOrigin: config.publicOrigin, secureCookies: config.secureCookies,
      documentStorage: 'database', initializeStorage: false,
      sampleWorkspace: evaluation,
    });
    return { app, store, database, config };
  } catch (error) { database.close(); throw error; }
}
