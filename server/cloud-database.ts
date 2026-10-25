import type { Database } from './database.ts';

// This guard runs before Store migrations or sample-data initialization. An
// existing internal database without an evaluation marker is never adopted.
export function cloudDatabase(db: Database, prepare = false) {
  db.exec('BEGIN; SELECT pg_advisory_xact_lock(1937007980)');
  try {
    const exists = db.prepare("SELECT to_regclass('stelux.metadata') AS name").get()?.name;
    if (exists) {
      const marker = db.prepare("SELECT value FROM stelux.metadata WHERE key='release_profile'").get()?.value;
      if (marker !== 'welding-demo') throw new Error('This is not an evaluation database. Use a separate empty PostgreSQL database.');
    } else {
      if (!prepare) throw new Error('Initialize the evaluation database with npm run db:prepare:cloud before starting the server.');
      // A partially populated schema may belong to another installation.
      const tables = db.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema='stelux'").all();
      if (tables.length) throw new Error('The evaluation schema must be empty.');
      db.exec("CREATE SCHEMA IF NOT EXISTS stelux; REVOKE ALL ON SCHEMA stelux FROM PUBLIC; CREATE TABLE stelux.metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); ALTER TABLE stelux.metadata ENABLE ROW LEVEL SECURITY; REVOKE ALL ON stelux.metadata FROM PUBLIC; INSERT INTO stelux.metadata VALUES ('release_profile','welding-demo')");
    }
    db.exec('SET search_path TO stelux,pg_catalog');
    if (!prepare) {
      const ready = db.prepare("SELECT key FROM metadata WHERE (key='seed_version' AND value='1') OR (key='welding_setup_v1' AND value='1') OR (key='cloud_storage_v1' AND value='1')").all();
      if (ready.length !== 3) throw new Error('Finish npm run db:prepare:cloud before starting the server.');
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function rejectEvaluationDatabase(db: Database) {
  const exists = db.prepare("SELECT to_regclass('stelux.metadata') AS name").get()?.name;
  if (exists && db.prepare("SELECT value FROM stelux.metadata WHERE key='release_profile'").get()?.value === 'welding-demo') throw new Error('The full workspace cannot use an evaluation database.');
}
