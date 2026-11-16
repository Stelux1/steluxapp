import './env.ts';
import { runtimeConfig } from './runtime-config.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { inspectHostedSchema, verifyHostedSchema } from './hosted-schema.ts';
import { rejectEvaluationDatabase } from './cloud-database.ts';

// Read-only: the same schema check the hosted server performs at startup (catalog queries only).
const runtime = runtimeConfig({ ...process.env, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: HOSTED_RELEASE_PROFILE });
const db = new PostgresDatabase(postgresConfig(process.env, runtime.cloudDatabaseSource === 'evaluation'));
try {
  if (runtime.cloudDatabaseSource === 'workspace') rejectEvaluationDatabase(db);
  verifyHostedSchema(db);
  console.log(JSON.stringify({ prepared: true, ...inspectHostedSchema(db) }));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally { db.close(); }
