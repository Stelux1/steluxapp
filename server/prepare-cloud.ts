import './env.ts';
import { runtimeConfig } from './runtime-config.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { cloudDatabase } from './cloud-database.ts';
import { Store } from './store.ts';
import { seed } from './seed.ts';
import { initializeDocumentStorage } from './documents.ts';

runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: 'welding-demo' });
const db = new PostgresDatabase(postgresConfig(process.env, true));
try {
  cloudDatabase(db, true);
  const store = new Store(':memory:', db);
  seed(store);
  initializeDocumentStorage(store);
  store.db.prepare("INSERT INTO metadata(key,value) VALUES ('cloud_storage_v1','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  console.log('Evaluation database prepared. Existing records and accounts were preserved.');
} finally { db.close(); }
