import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['node_modules/typescript/bin/tsc', '--noEmit']);
run(['scripts/build-server.mjs']);

// Never copy a developer's .env or an internal DATABASE_URL into an artifact.
// Only the hosted build's evaluation variables are bound to its SSR function.
if (process.env.AWS_APP_ID) {
  const keys = ['STELUX_DEMO_DATABASE_URL', 'STELUX_DEMO_DATABASE_PASSWORD', 'STELUX_PUBLIC_URL'];
  const missing = ['STELUX_DEMO_DATABASE_URL', 'STELUX_PUBLIC_URL'].filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Configure Shipvela's private server environment: ${missing.join(', ')}`);
  let database;
  try { database = new URL(process.env.STELUX_DEMO_DATABASE_URL); } catch { throw new Error('STELUX_DEMO_DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('STELUX_DEMO_DATABASE_URL must use PostgreSQL.');
  if (!process.env.STELUX_DEMO_DATABASE_PASSWORD && !database.password) throw new Error('Configure STELUX_DEMO_DATABASE_PASSWORD.');
  const values = Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
  if (process.env.STELUX_DEMO_DATABASE_CA) {
    if (!existsSync(process.env.STELUX_DEMO_DATABASE_CA)) throw new Error('STELUX_DEMO_DATABASE_CA must point to a certificate included in the build.');
    copyFileSync(process.env.STELUX_DEMO_DATABASE_CA, 'dist-server/server/runtime-ca.crt');
    values.STELUX_DEMO_DATABASE_CA = 'dist-server/server/runtime-ca.crt';
  }
  const { runtimeConfig } = await import('../dist-server/server/runtime-config.js');
  try { runtimeConfig({ ...values, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: 'welding-demo' }); }
  catch { throw new Error('Check the evaluation database URL and exact HTTPS STELUX_PUBLIC_URL in Shipvela.'); }
  writeFileSync('dist-server/server/runtime-env.json', JSON.stringify(values) + '\n', { mode: 0o600 });
}
// Trace the unbundled API and worker, including their production dependencies.
// Merely copying server files would leave pg/Express dependencies out of SSR.
const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
const { fileList } = await nodeFileTrace(['dist-server/server/serverless.js', 'dist-server/server/postgres-worker.mjs'], { base: process.cwd() });
// The generic SQLite adapter's dynamic filename can make NFT discover local
// databases. The hosted API uses PostgreSQL, so only compiled code and package
// dependencies are eligible for the runtime artifact.
const runtimeFiles = [...fileList].filter(file => /^(?:dist-server\/|node_modules\/|package\.json$)/.test(file)).sort();
writeFileSync('dist-server/runtime-trace.json', JSON.stringify(runtimeFiles) + '\n');
run(['node_modules/next/dist/bin/next', 'build', '--webpack']);

// Fail a build that would omit any dependency needed by the API at runtime.
const apiTrace = '.next/server/pages/api/[[...path]].js.nft.json';
const shipped = new Set(JSON.parse(readFileSync(apiTrace, 'utf8')).files.map(file => resolve(dirname(apiTrace), file)));
for (const file of runtimeFiles) {
  if (!shipped.has(resolve(file))) throw new Error(`The SSR bundle is missing a runtime dependency: ${file}`);
}
for (const file of shipped) {
  const local = file.slice(process.cwd().length + 1);
  if (/^(?:\.data\/|backups\/|\.env(?:\.|$)|reference\/|test-results\/|output\/|tests\/)/.test(local)) {
    throw new Error('The SSR bundle contains a local-only file.');
  }
}
if (existsSync('dist-server/server/runtime-env.json') && !shipped.has(resolve('dist-server/server/runtime-env.json'))) {
  throw new Error('The SSR bundle is missing its private runtime configuration.');
}
