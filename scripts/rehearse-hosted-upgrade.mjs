// Rehearse the hosted database update end to end on a DISPOSABLE local PostgreSQL database before touching
// the live one: build the old schema with the code at --old-ref (default origin/main), optionally load a SQL
// backup made by backupPostgres, then run this release's dry run, preparation, idempotency check and startup
// verification, boot the hosted server against the database and exercise it. Prints PASS/FAIL per step and
// exits non-zero on any failure. It never prints passwords, connection strings or the backup's rows.
//
//   STELUX_REHEARSAL_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/stelux_rehearsal \
//   STELUX_REHEARSAL_DATABASE_PASSWORD=… npm run rehearse:hosted -- [--backup path/to/stelux-postgres.sql]
//     [--old-ref origin/main] [--simulate-missing table,table] [--compiled] [--port 5319] [--keep]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { RESOURCE_MAP } from '../shared/resources.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes(`--${name}`);
const oldRef = option('old-ref') || 'origin/main';
const backupFile = option('backup') && resolve(option('backup'));
const simulateMissing = (option('simulate-missing') || '').split(',').map(name => name.trim()).filter(Boolean);
const port = Number(option('port') || 5319);
const results = [];
let failed = false;
const report = (status, step, detail = '') => { results.push({ status, step, detail }); console.log(`${status.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`); if (status === 'FAIL') failed = true; };

// ---- Guard: only a disposable loopback database whose name marks it as a rehearsal target.
const rawUrl = option('database-url') || process.env.STELUX_REHEARSAL_DATABASE_URL;
if (!rawUrl) { console.error('Set STELUX_REHEARSAL_DATABASE_URL (or --database-url) to a disposable local database named stelux_rehearsal….'); process.exit(2); }
const target = new URL(rawUrl);
const password = process.env.STELUX_REHEARSAL_DATABASE_PASSWORD || decodeURIComponent(target.password);
const databaseName = decodeURIComponent(target.pathname.slice(1));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !/^stelux_rehearsal/.test(databaseName) || !password) {
  console.error('Refusing to run: the rehearsal needs a loopback PostgreSQL database whose name starts with stelux_rehearsal, and its password. It resets that database\'s stelux schema.');
  process.exit(2);
}
if (backupFile && !existsSync(backupFile)) { console.error('The --backup file does not exist.'); process.exit(2); }
target.password = '';
const databaseUrl = target.toString();
const secrets = [password, encodeURIComponent(password)];
const scrub = text => secrets.reduce((value, secret) => value.split(secret).join('***'), String(text || ''));

// Children get an explicit environment: nothing inherited can point them at another database.
const baseEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TERM'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
const publicUrl = `http://127.0.0.1:${port}`;
const accountEmail = `rehearsal-${randomBytes(4).toString('hex')}@example.test`;
const accountPassword = `R-${randomBytes(18).toString('base64url')}`;
secrets.push(accountPassword);
const dbEnv = { DATABASE_URL: databaseUrl, STELUX_DATABASE_PASSWORD: password, STELUX_DATABASE_CA: '', STELUX_CLOUD_DATABASE: 'workspace', STELUX_PUBLIC_URL: publicUrl, NODE_ENV: 'production' };

const work = join(root, '.rehearsal', new Date().toISOString().replaceAll(':', '-'));
const oldDir = join(work, 'old'), runDir = join(work, 'run');
const nodeModules = realpathSync(join(root, 'node_modules'));
const pgConfig = { host: target.hostname.replace(/^\[|\]$/g, ''), port: Number(target.port || 5432), user: decodeURIComponent(target.username || 'postgres'), database: databaseName, password, ssl: false };

function run(step, script, { cwd, env = {}, args: extra = [], json = false } = {}) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...extra], { cwd, env: { ...baseEnv, ...dbEnv, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${step} exited with ${result.status}: ${scrub((result.stderr || result.stdout).trim().split('\n').slice(-6).join(' | '))}`);
  return json ? JSON.parse(result.stdout) : result.stdout;
}
async function query(sql, values) {
  const client = new pg.Client(pgConfig);
  await client.connect();
  try { return await client.query(sql, values); } finally { await client.end(); }
}
/**
 * Independent row snapshot of every table except sessions (generated columns excluded): per table, a map from each row's
 * primary key (counters by their key; the whole row for a table without one) to an md5 of the row as PostgreSQL prints it.
 * It reads the database directly and shares nothing with the application's own comparison.
 */
async function snapshot() {
  const tables = (await query("SELECT tablename FROM pg_tables WHERE schemaname='stelux' AND tablename<>'sessions' ORDER BY 1")).rows.map(row => row.tablename);
  const output = {};
  for (const table of tables) {
    const columns = (await query("SELECT column_name FROM information_schema.columns WHERE table_schema='stelux' AND table_name=$1 AND is_generated='NEVER' ORDER BY column_name", [table])).rows.map(row => `"${row.column_name}"`).join(',');
    const keys = (await query("SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=format('stelux.%I',$1::text)::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[], a.attnum)", [table])).rows.map(row => `t."${row.attname}"`);
    const key = keys.length ? `json_build_array(${keys.join(',')})::text` : 'md5(t::text)';
    const rows = (await query(`SELECT ${key} AS k, md5(t::text) AS d FROM (SELECT ${columns} FROM stelux."${table}") t`)).rows;
    output[table] = new Map(rows.map(row => [row.k, row.d]));
  }
  return output;
}
/**
 * The owner's rule for an upgrade: every row that existed before is present and byte-identical after, in every table;
 * new rows only in `allowed` tables. Returns the problems (table and first differing keys) and the rows added per table.
 */
function compareSnapshots(before, after, allowed) {
  const problems = [], added = {};
  const first = keys => `${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ` (+${keys.length - 5} more)` : ''}`;
  for (const [table, rows] of Object.entries(before)) {
    const now = after[table];
    if (!now) { problems.push(`${table}: the table is gone`); continue; }
    const missing = [...rows.keys()].filter(key => !now.has(key)), changed = [...rows].filter(([key, digest]) => now.has(key) && now.get(key) !== digest).map(([key]) => key);
    if (missing.length) problems.push(`${table}: ${missing.length} pre-existing row(s) missing, first ${first(missing)}`);
    if (changed.length) problems.push(`${table}: ${changed.length} pre-existing row(s) changed, first ${first(changed)}`);
  }
  for (const [table, rows] of Object.entries(after)) {
    const fresh = [...rows.keys()].filter(key => !before[table]?.has(key));
    if (!fresh.length) continue;
    added[table] = fresh.length;
    if (!allowed.has(table)) problems.push(`${table}: ${fresh.length} row(s) added to a table no data step names, first ${first(fresh)}`);
  }
  return { problems, added };
}
async function step(name, action) {
  if (failed) { report('SKIP', name, 'an earlier step failed'); return; }
  try { const detail = await action(); if (detail?.skip) report('SKIP', name, detail.skip); else report('PASS', name, detail || ''); }
  catch (error) { report('FAIL', name, scrub(error.message)); }
}
const helper = join(work, 'old-helper.mjs');
const oldModule = path => pathToFileURL(join(oldDir, path)).href;

let server;
let before, dry, prepared;
try {
  await step('Target is a disposable loopback database', async () => `${target.hostname}:${pgConfig.port}/${databaseName}`);
  await step(`Export old code (${oldRef})`, async () => {
    mkdirSync(oldDir, { recursive: true, mode: 0o700 }); mkdirSync(runDir, { recursive: true, mode: 0o700 });
    const sha = execFileSync('git', ['rev-parse', '--short', `${oldRef}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
    execFileSync('git', ['archive', '--format=tar', '-o', join(work, 'old.tar'), sha], { cwd: root });
    execFileSync('tar', ['-xf', join(work, 'old.tar'), '-C', oldDir]);
    rmSync(join(work, 'old.tar'));
    for (const dir of [oldDir, runDir]) symlinkSync(nodeModules, join(dir, 'node_modules'));
    for (const dir of [oldDir, runDir]) if (existsSync(join(dir, '.env'))) throw new Error(`${dir} contains a .env file.`);
    return sha;
  });
  await step('Reset the rehearsal database', async () => { await query('DROP SCHEMA IF EXISTS stelux CASCADE'); return 'stelux schema dropped'; });
  writeFileSync(helper, `
    const [{ Store }, { seed }, { passwordHash }, { PostgresDatabase, postgresConfig }, { initializeDocumentStorage }] = await Promise.all([
      import(${JSON.stringify(oldModule('server/store.ts'))}), import(${JSON.stringify(oldModule('server/seed.ts'))}), import(${JSON.stringify(oldModule('server/auth.ts'))}),
      import(${JSON.stringify(oldModule('server/postgres.ts'))}), import(${JSON.stringify(oldModule('server/documents.ts'))})]);
    const mode = process.argv[2];
    if (mode === 'sqlite') { const store = new Store(process.env.REHEARSAL_SQLITE); seed(store); store.close(); }
    else {
      const db = new PostgresDatabase(postgresConfig());
      try {
        if (mode === 'restore-schema') { initializeDocumentStorage(new Store(':memory:', db)); db.exec('DELETE FROM metadata'); }
        if (mode === 'account') {
          const store = new Store(':memory:', db, { initialize: false }); db.exec('SET search_path TO stelux,pg_catalog');
          const profile = store.list('profiles').find(row => row.id === 'profile-admin') || store.list('profiles').find(row => row.generalPermission === 'Administration');
          if (!profile) throw new Error('No administration profile exists for the rehearsal account.');
          store.transaction(() => { const user = store.create('users', { name: 'Rehearsal administrator', email: process.env.REHEARSAL_EMAIL, profileId: profile.id, active: true }); db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(process.env.REHEARSAL_PASSWORD)); });
        }
      } finally { db.close(); }
    }
  `, { mode: 0o600 });
  const accountEnv = { REHEARSAL_EMAIL: accountEmail, REHEARSAL_PASSWORD: accountPassword };
  if (backupFile) {
    await step('Old code: create an empty schema', async () => { run('old schema', helper, { cwd: oldDir, args: ['restore-schema'] }); return 'Store + document storage'; });
    await step('Load the SQL backup', async () => {
      try { await query(readFileSync(backupFile, 'utf8')); } catch (error) { throw new Error(`The backup could not be restored (${error.code || 'error'}): ${error.message}`); }
      return `${(await query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='stelux'")).rows[0].n} tables`;
    });
    await step('Old code: create the rehearsal account', async () => { run('old account', helper, { cwd: oldDir, args: ['account'], env: accountEnv }); return 'administrator with a generated password'; });
  } else {
    await step('Old code: seed sample data (SQLite) and migrate it (db:migrate)', async () => {
      const dataDir = join(oldDir, '.data');
      run('old seed', helper, { cwd: oldDir, args: ['sqlite'], env: { REHEARSAL_SQLITE: join(dataDir, 'stelux.sqlite') } });
      return run('old db:migrate', 'server/migrate-postgres.ts', { cwd: oldDir, env: { STELUX_DATA_DIR: dataDir } }).trim().split('\n').at(-2);
    });
    await step('Old code: create the rehearsal account', async () => { run('old account', helper, { cwd: oldDir, args: ['account'], env: accountEnv }); return 'administrator with a generated password'; });
    await step('Old code: db:prepare:cloud (workspace)', async () => run('old db:prepare:cloud', 'server/prepare-cloud.ts', { cwd: oldDir }).trim());
    await step('Old code: db:prepare:welding', async () => { run('old db:prepare:welding', 'server/prepare-welding.ts', { cwd: oldDir }); return 'old preparation applied'; });
  }
  if (simulateMissing.length) await step(`Simulate an older database without ${simulateMissing.join(', ')}`, async () => {
    for (const table of simulateMissing) {
      if (!RESOURCE_MAP[table]) throw new Error(`${table} is not a resource.`);
      const rows = (await query(`SELECT count(*)::int AS n FROM stelux."${table}"`)).rows[0].n;
      if (rows) throw new Error(`${table} holds ${rows} record(s); only empty tables can be removed.`);
      await query(`DROP TABLE stelux."${table}" CASCADE`);
    }
    return 'empty tables dropped (their incoming foreign keys go with them)';
  });
  await step('Record a row snapshot of the old database', async () => { before = await snapshot(); return `${Object.keys(before).length} tables, ${Object.values(before).reduce((sum, rows) => sum + rows.size, 0)} rows`; });
  await step('New code: dry run', async () => {
    dry = run('dry run', join(root, 'server/prepare-welding.ts'), { cwd: runDir, args: ['--dry-run'], json: true });
    if (!dry.dryRun) throw new Error('The dry run did not report as a dry run.');
    // A release that adds no table, column or data step finds nothing to prepare; --allow-up-to-date accepts that (the database must stay unchanged).
    if (dry.upToDate && !flag('allow-up-to-date')) throw new Error('The dry run found nothing to prepare (pass --allow-up-to-date for a release without schema changes).');
    if (existsSync(join(runDir, 'backups'))) throw new Error('The dry run wrote a backup.');
    const { problems, added } = compareSnapshots(before, await snapshot(), new Set());
    if (problems.length || Object.keys(added).length) throw new Error(`The dry run changed the database: ${problems.join('; ')}`);
    dry.created ??= { tables: [], columns: [], foreignKeys: [], indexes: [], rowLevelSecurity: [] };
    const created = dry.created;
    return `would create ${created.tables.length} table(s) [${created.tables.join(', ')}], ${created.columns.length} reference column(s), ${created.foreignKeys.length} foreign key(s), ${created.indexes.length} index(es), RLS on ${created.rowLevelSecurity.length}; pre-existing: ${Object.entries(dry.counts).map(([name, count]) => `${name}=${count}`).join(' ')}`;
  });
  await step('New code: preparation (backup first)', async () => {
    if (dry.upToDate) { prepared = { dataStepTables: {} }; return { skip: 'nothing to prepare: the release adds no schema' }; }
    const result = prepared = run('preparation', join(root, 'server/prepare-welding.ts'), { cwd: runDir, json: true });
    if (!existsSync(join(result.backup, 'stelux-postgres.sql')) || !existsSync(join(result.backup, 'preparation.json'))) throw new Error('The backup or its preparation record is missing.');
    if (JSON.stringify(result.created) !== JSON.stringify(dry.created)) throw new Error('The preparation differs from its dry run.');
    return `created ${result.created.tables.length} table(s), ${result.created.columns.length} column(s), ${result.created.foreignKeys.length} foreign key(s), ${result.created.indexes.length} index(es); backup written`;
  });
  await step('Every pre-existing row is unchanged; new rows only where the data steps insert (independent row comparison)', async () => {
    const tables = prepared.dataStepTables;
    if (!tables || typeof tables !== 'object') throw new Error('The preparation report does not name the tables its data steps insert into (dataStepTables).');
    const stepTables = new Set(Object.values(tables).flat());
    // The audit trail receives one entry per inserted row, and only for rows the data steps inserted.
    const { problems, added } = compareSnapshots(before, await snapshot(), new Set([...stepTables, 'audit']));
    const inserted = Object.entries(added).filter(([table]) => stepTables.has(table)).reduce((sum, [, count]) => sum + count, 0);
    if ((added.audit || 0) > inserted) problems.push(`audit: ${added.audit} entries added for ${inserted} inserted row(s)`);
    for (const [table, count] of Object.entries(added).sort()) console.log(`       added ${String(count).padStart(6)} row(s) to ${table}`);
    if (problems.length) throw new Error(problems.join('; '));
    return `${Object.keys(before).length} tables, every pre-existing row identical (counters included); added: ${Object.entries(added).sort().map(([table, count]) => `${table}=${count}`).join(' ') || 'nothing'}`;
  });
  await step('Idempotency: a second run has nothing to do', async () => {
    const again = run('second preparation', join(root, 'server/prepare-welding.ts'), { cwd: runDir, json: true });
    const dryAgain = run('second dry run', join(root, 'server/prepare-welding.ts'), { cwd: runDir, args: ['--dry-run'], json: true });
    if (!again.upToDate || !dryAgain.upToDate || Object.values(dryAgain.created).flat().length) throw new Error('A second run still found changes.');
    return 'up to date';
  });
  await step('Startup verification (db:verify:hosted)', async () => { run('verification', join(root, 'server/verify-hosted.ts'), { cwd: runDir }); return 'schema complete'; });
  await step(`Boot the hosted server (${flag('compiled') ? 'compiled' : 'tsx'})`, async () => {
    const dist = join(root, 'dist-welding-demo');
    if (!existsSync(join(dist, 'index.html'))) throw new Error('Build the client first: STELUX_RELEASE_PROFILE=welding-workspace npx vite build');
    symlinkSync(dist, join(runDir, 'dist-welding-demo'));
    const entry = flag('compiled') ? join(root, 'dist-server/server/cloud.js') : join(root, 'server/cloud.ts');
    if (!existsSync(entry)) throw new Error(`${entry} does not exist (npm run build:server).`);
    const output = [];
    server = spawn(process.execPath, [...(flag('compiled') ? [] : ['--import', 'tsx']), entry], { cwd: runDir, env: { ...baseEnv, ...dbEnv, PORT: String(port), STELUX_HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => output.push(String(chunk))); server.stderr.on('data', chunk => output.push(String(chunk)));
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error(`The server exited: ${scrub(output.join('').trim().split('\n').slice(-4).join(' | '))}`);
      try { if ((await fetch(`${publicUrl}/api/health`)).ok) return publicUrl; } catch { /* starting */ }
      await delay(250);
    }
    throw new Error('The server did not become healthy within 30 seconds.');
  });
  let cookie = '', status;
  const request = (path, { method = 'GET', body, pilot } = {}) => fetch(publicUrl + path, { method, headers: { Origin: publicUrl, 'X-Stelux-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  await step('Smoke: health', async () => { const health = await (await request('/api/health')).json(); if (health.database !== 'postgres') throw new Error(JSON.stringify(health)); return 'database postgres'; });
  await step('Smoke: auth status', async () => {
    status = await (await request('/api/auth/status')).json();
    if (status.requiresSetup !== false || status.sampleWorkspace !== false || !status.availability?.features.includes('pilots')) throw new Error(`unexpected status (requiresSetup=${status.requiresSetup}, sampleWorkspace=${status.sampleWorkspace})`);
    return `${Object.keys(status.availability.resources).length} delivered resources`;
  });
  await step('Smoke: login with the rehearsal account', async () => {
    const login = await request('/api/auth/login', { method: 'POST', body: { email: accountEmail, password: accountPassword } });
    if (login.status !== 200) throw new Error(`status ${login.status}`);
    cookie = login.headers.get('set-cookie').split(';')[0];
    return 'signed in';
  });
  const bootstraps = {};
  for (const pilot of ['weld', 'mto']) await step(`Smoke: bootstrap in the ${pilot} pilot`, async () => {
    const response = await request('/api/bootstrap', { pilot });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    bootstraps[pilot] = await response.json();
    return `${Object.keys(bootstraps[pilot].rows).length} resources readable`;
  });
  await step('Smoke: create and read a record in a newly created table', async () => {
    const candidates = dry.created.tables.filter(key => Object.hasOwn(status.availability.resources, key) && !RESOURCE_MAP[key].readonly && key !== 'users');
    if (!candidates.length) return { skip: 'the preparation created no table this profile delivers (nothing new to exercise)' };
    const today = new Date().toISOString().slice(0, 10);
    const tried = [];
    for (const key of candidates) for (const pilot of ['weld', 'mto']) {
      const delivered = status.availability.resources[key];
      const body = {}, chosen = [];
      const fields = RESOURCE_MAP[key].fields.filter(field => field.required && delivered.includes(field.name));
      for (const field of fields) {
        const row = field.type === 'ref' ? bootstraps[pilot]?.rows[field.ref]?.find(row => !row._archived) : undefined;
        if (row) chosen.push(row);
        body[field.name] = field.type === 'number' ? Math.max(1, field.min || 0) : field.type === 'date' ? today : field.type === 'checkbox' ? false : field.type === 'select' ? field.options[0] : field.type === 'email' ? 'rehearsal@example.test'
          : field.type === 'ref' ? row?.id : `Rehearsal ${key} ${randomBytes(3).toString('hex')}`;
      }
      // Keep references consistent: a chosen record that itself names one of the references decides it (e.g. its isometric).
      for (const field of fields.filter(field => field.type === 'ref')) { const owner = chosen.find(row => typeof row[field.name] === 'string' && row[field.name]); if (owner) body[field.name] = owner[field.name]; }
      const created = await request(`/api/records/${key}`, { method: 'POST', body, pilot });
      if (created.status !== 201) { const error = await created.json().catch(() => ({})); tried.push(`${key}@${pilot}: ${created.status} ${error.error || ''} ${Object.entries(error.fields || {}).map(([name, message]) => `${name}: ${message}`).join('; ')}`.trim()); continue; }
      const { record } = await created.json();
      const list = await request(`/api/records/${key}`, { pilot });
      if (list.status !== 200 || !(await list.json()).rows.some(row => row.id === record.id)) throw new Error(`${key}: the created record could not be read back.`);
      return `${key} (${pilot} pilot): created and read ${record.id}`;
    }
    throw new Error(`no newly created table accepted a record (${tried.join(', ')})`);
  });
  await step('Startup verification still passes after the smoke requests', async () => { run('verification', join(root, 'server/verify-hosted.ts'), { cwd: runDir }); return 'schema complete'; });
} finally {
  if (server && server.exitCode === null) { const exited = new Promise(done => server.once('exit', done)); server.kill('SIGTERM'); await Promise.race([exited, delay(5000)]); if (server.exitCode === null) server.kill('SIGKILL'); }
  // The working copies and backups may hold the loaded backup's data: remove them unless asked to keep them.
  if (!flag('keep')) rmSync(work, { recursive: true, force: true });
}
const counts = ['PASS', 'FAIL', 'SKIP'].map(status => `${results.filter(result => result.status === status).length} ${status.toLowerCase()}`).join(', ');
console.log(`\nREHEARSAL ${failed ? 'FAIL' : 'PASS'} (${counts})${flag('keep') ? ` — working files kept in ${work}` : ''}`);
process.exitCode = failed ? 1 : 0;
