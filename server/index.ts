import './env.ts';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Store } from './store.ts';
import { seed } from './seed.ts';
import { createApp } from './http.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { runtimeConfig } from './runtime-config.ts';
import { cloudDatabase, rejectEvaluationDatabase, workspaceCloudDatabase } from './cloud-database.ts';
const config = runtimeConfig(process.env);
if (config.cloud && !existsSync(resolve(config.distDir, 'index.html'))) throw new Error('Run npm run build:cloud before starting the cloud server.');
const { dataDir } = config;
const database = config.databaseUrl ? new PostgresDatabase(postgresConfig(process.env, config.cloud && config.cloudDatabaseSource === 'evaluation')) : undefined;
if (database) { try { if (config.cloud) { if (config.cloudDatabaseSource === 'evaluation') cloudDatabase(database); else workspaceCloudDatabase(database); } else rejectEvaluationDatabase(database); } catch (error) { database.close(); throw error; } }
const store = new Store(resolve(dataDir, 'stelux.sqlite'), database, { initialize: !config.cloud });
if (!config.cloud) seed(store);
const port = config.port;
const server = createApp(store, dataDir, { releaseProfile: config.profile, distDir: config.distDir, publicOrigin: config.publicOrigin, secureCookies: config.secureCookies, documentStorage: config.documentStorage, initializeStorage: !config.cloud, sampleWorkspace: !config.cloud || config.cloudDatabaseSource === 'evaluation' }).listen(port, config.host, () => console.log(`Blitzkrieg API ready on port ${port} (${database ? 'PostgreSQL' : 'SQLite'})`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
