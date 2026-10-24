import './env.ts';
import { PostgresDatabase, postgresConfig } from './postgres.ts';

const config = postgresConfig();
const database = new PostgresDatabase(config);
try {
  const result = database.prepare('SELECT current_database() AS database, version() AS version').get();
  console.log(JSON.stringify({ connected: true, database: result?.database, engine: 'PostgreSQL', tls: Boolean(config.ssl) }));
} finally { database.close(); }
