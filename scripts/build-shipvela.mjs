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

// Bind only the explicitly selected database's hosted environment to the server
// artifact. Never copy a developer's .env or both databases' credentials.
if (process.env.AWS_APP_ID) {
  const source = process.env.STELUX_CLOUD_DATABASE || 'evaluation';
  if (!['evaluation', 'workspace'].includes(source)) throw new Error('STELUX_CLOUD_DATABASE must be evaluation or workspace.');
  const urlKey = source === 'workspace' ? 'DATABASE_URL' : 'STELUX_DEMO_DATABASE_URL';
  const passwordKey = source === 'workspace' ? 'STELUX_DATABASE_PASSWORD' : 'STELUX_DEMO_DATABASE_PASSWORD';
  const caKey = source === 'workspace' ? 'STELUX_DATABASE_CA' : 'STELUX_DEMO_DATABASE_CA';
  const keys = [urlKey, passwordKey, 'STELUX_PUBLIC_URL'];
  const missing = [urlKey, 'STELUX_PUBLIC_URL'].filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Configure Shipvela's private server environment: ${missing.join(', ')}`);
  let database;
  try { database = new URL(process.env[urlKey]); } catch { throw new Error(`${urlKey} must be a valid PostgreSQL URL.`); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error(`${urlKey} must use PostgreSQL.`);
  if (!process.env[passwordKey] && !database.password) throw new Error(`Configure ${passwordKey}.`);
  const values = { STELUX_CLOUD_DATABASE: source, ...Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]])) };
  if (process.env[caKey]) {
    if (!existsSync(process.env[caKey])) throw new Error(`${caKey} must point to a certificate included in the build.`);
    copyFileSync(process.env[caKey], 'dist-server/server/runtime-ca.crt');
    values[caKey] = 'dist-server/server/runtime-ca.crt';
  }
  const { runtimeConfig } = await import('../dist-server/server/runtime-config.js');
  const { HOSTED_RELEASE_PROFILE } = await import('../dist-server/shared/release.js');
  try { runtimeConfig({ ...values, STELUX_RUNTIME: 'cloud', STELUX_RELEASE_PROFILE: HOSTED_RELEASE_PROFILE }); }
  catch { throw new Error('Check the selected database URL and exact HTTPS STELUX_PUBLIC_URL in Shipvela.'); }
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
