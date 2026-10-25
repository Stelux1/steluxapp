import './env.ts';
import { runtimeConfig } from './runtime-config.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { cloudDatabase, workspaceCloudDatabase } from './cloud-database.ts';
import { Store } from './store.ts';
import { seed } from './seed.ts';
import { initializeDocumentStorage } from './documents.ts';

const config = runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: 'welding-demo' });
const evaluation = config.cloudDatabaseSource === 'evaluation';
const db = new PostgresDatabase(postgresConfig(process.env, evaluation));
try {
  if (evaluation) cloudDatabase(db, true); else workspaceCloudDatabase(db, true);
  const store = new Store(':memory:', db, { initialize: evaluation });
  if (evaluation) seed(store);
  store.transaction(() => {
    initializeDocumentStorage(store);
    if (!evaluation && db.prepare('SELECT a.id FROM attachments a LEFT JOIN upload_blobs b ON b.attachment_id=a.id WHERE b.attachment_id IS NULL LIMIT 1').get()) {
      throw new Error('Import the existing attachment files into cloud document storage before deployment.');
    }
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('cloud_storage_v1','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  });
  console.log(`${evaluation ? 'Evaluation database' : 'Existing workspace cloud storage'} prepared. Existing records and accounts were preserved.`);
} finally { db.close(); }
