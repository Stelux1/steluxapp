import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgresDatabase, postgresConfig } from '../server/postgres.ts';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { passwordHash } from '../server/auth.ts';
import { initializeDocumentStorage } from '../server/documents.ts';
import { backupPostgres } from '../server/postgres-backup.ts';
import { inspectHostedSchema, prepareHostedSchema, verifyHostedSchema } from '../server/hosted-schema.ts';
import { prepareWeldingTraceability, verifyWeldingTraceability } from '../server/welding-schema.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import type { Field, Resource } from '../shared/types.ts';

// Uses its own disposable database so it can run in parallel with tests/postgres.test.ts.
const base = process.env.STELUX_TEST_HOSTED_DATABASE_URL || process.env.STELUX_TEST_DATABASE_URL;
const testUrl = base && (() => { const url = new URL(base); url.pathname = '/stelux_hosted_test'; return url.toString(); })();

let db: PostgresDatabase;
const config = () => postgresConfig({ DATABASE_URL: testUrl });
function connect() {
  const url = new URL(testUrl!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use only a disposable local PostgreSQL database.');
  if (!process.env.STELUX_TEST_HOSTED_DATABASE_URL) {
    const admin = new PostgresDatabase(postgresConfig({ DATABASE_URL: base }));
    try { if (!admin.prepare("SELECT 1 AS found FROM pg_database WHERE datname='stelux_hosted_test'").get()) admin.exec('CREATE DATABASE stelux_hosted_test'); }
    finally { admin.close(); }
  }
  db = new PostgresDatabase(config());
}

/** A workspace created by the current code: schema, sample data, an account and document storage. */
function workspace() {
  db.exec('DROP SCHEMA IF EXISTS stelux CASCADE');
  const store = new Store(':memory:', db);
  seed(store);
  const user = store.create('users', { name: 'Hosted administrator', email: 'hosted@example.test', profileId: 'profile-admin', active: true });
  db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash('Hosted-Test-Password-123'));
  initializeDocumentStorage(store);
  db.prepare("INSERT INTO metadata VALUES ('cloud_storage_v1','1')").run();
  return store;
}
const count = (table: string) => Number(db.prepare(`SELECT count(*) AS total FROM stelux."${table}"`).get()!.total);
const exists = (table: string) => Boolean(db.prepare('SELECT to_regclass(?) AS name').get(`stelux.${table}`)?.name);
const hasColumn = (table: string, column: string) => Boolean(db.prepare("SELECT 1 AS found FROM information_schema.columns WHERE table_schema='stelux' AND table_name=? AND column_name=?").get(table, column));

/** An older hosted database: tables, references, foreign keys, indexes and security that a later release added. */
function makeOlder() {
  for (const table of ['calculation_norms', 'cut_list', 'revisions']) { assert.equal(count(table), 0, table); db.exec(`DROP TABLE stelux."${table}" CASCADE`); }
  for (const [table, column] of [['users', 'companyId'], ['users', 'weldProfileId'], ['signatures', 'userId'], ['welds', 'material1Id'], ['welds', 'certificate2Id']]) db.exec(`ALTER TABLE stelux."${table}" DROP COLUMN "${column}"`);
  db.exec('DROP INDEX stelux.sites_unique_0; DROP INDEX stelux.stock_identity; ALTER TABLE stelux.companies DISABLE ROW LEVEL SECURITY');
}

/** Independent of the code under test: every table's columns, constraints, indexes and security. */
function fingerprint() {
  return JSON.stringify({
    columns: db.prepare(`SELECT table_name, column_name, data_type, is_nullable, column_default, is_generated, generation_expression FROM information_schema.columns WHERE table_schema='stelux' ORDER BY table_name, column_name`).all(),
    constraints: db.prepare(`SELECT c.relname AS t, con.conname, pg_get_constraintdef(con.oid) AS def, con.condeferrable, con.condeferred FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid WHERE c.relnamespace='stelux'::regnamespace ORDER BY 1, 2`).all(),
    indexes: db.prepare(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='stelux' ORDER BY 1, 2`).all(),
    security: db.prepare(`SELECT relname, relrowsecurity, relacl::text AS acl FROM pg_class WHERE relnamespace='stelux'::regnamespace AND relkind='r' ORDER BY 1`).all(),
  });
}
/** Independent row digest of every table (generated columns excluded). */
function rows(tables?: string[]) {
  const names = (tables || db.prepare("SELECT tablename FROM pg_tables WHERE schemaname='stelux' AND tablename<>'sessions' ORDER BY 1").all().map(row => String(row.tablename)));
  return Object.fromEntries(names.map(name => {
    const columns = db.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema='stelux' AND table_name=? AND is_generated='NEVER' ORDER BY column_name").all(name).map(row => `"${row.column_name}"`).join(',');
    return [name, db.prepare(`SELECT count(*) AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS d FROM (SELECT ${columns} FROM stelux."${name}") t`).get()];
  }));
}

/** Registers resources and fields for one test only, as later releases would in shared/resources.ts. */
function register(t: { after: (fn: () => void) => void }, extra: { resources?: Resource[]; fields?: [string, Field][]; unique?: [string, string[]][] }) {
  for (const resource of extra.resources || []) { RESOURCES.push(resource); RESOURCE_MAP[resource.key] = resource; }
  for (const [key, field] of extra.fields || []) RESOURCE_MAP[key].fields.push(field);
  for (const [key, fields] of extra.unique || []) (RESOURCE_MAP[key].unique ||= []).push(fields);
  t.after(() => {
    for (const resource of extra.resources || []) { RESOURCES.splice(RESOURCES.indexOf(resource), 1); delete RESOURCE_MAP[resource.key]; }
    for (const [key, field] of extra.fields || []) RESOURCE_MAP[key].fields.splice(RESOURCE_MAP[key].fields.indexOf(field), 1);
    for (const [key] of extra.unique || []) RESOURCE_MAP[key].unique!.pop();
  });
}
const resource = (key: string, fields: Field[], unique?: string[][]): Resource => ({ key, title: key, singular: key, module: 'general', group: 'Rehearsal', description: 'Test only.', fields, columns: fields.map(field => field.name), display: fields[0].name, unique });
const text = (name: string, extra: Partial<Field> = {}): Field => ({ name, label: name, type: 'text', ...extra });
const ref = (name: string, target: string): Field => ({ name, label: name, type: 'ref', ref: target });

test('hosted preparation brings an older database to exactly the fresh schema, idempotently and without changing records', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  workspace();
  const fresh = fingerprint();
  workspace();
  makeOlder();
  const records = rows();
  assert.throws(() => verifyHostedSchema(db), (error: Error) => /npm run db:prepare:welding/.test(error.message) && /calculation_norms/.test(error.message) && /users\.companyId → companies/.test(error.message) && /sites_unique_0/.test(error.message) && /companies/.test(error.message));
  // Verification is catalog-only: it succeeds inside a read-only transaction.
  db.exec('BEGIN READ ONLY'); try { assert.throws(() => verifyWeldingTraceability(db), /Prepare welding traceability/); } finally { db.exec('ROLLBACK'); }

  const dry = prepareHostedSchema(db, { dryRun: true });
  assert.equal(dry.dryRun, true); assert.equal(dry.upToDate, false);
  assert.deepEqual(dry.created.tables, ['revisions', 'calculation_norms', 'cut_list'].sort((a, b) => RESOURCES.findIndex(r => r.key === a) - RESOURCES.findIndex(r => r.key === b)));
  assert.ok(dry.created.columns.includes('users.companyId → companies') && dry.created.columns.includes('welds.material1Id → materials') && dry.created.columns.includes('cut_list.requirementId → iso_materials'));
  assert.ok(dry.created.foreignKeys.includes('calculation_lines.normId → calculation_norms'), 'dropping a table removed the foreign key of a surviving column');
  assert.ok(dry.created.indexes.includes('sites_unique_0 on sites') && dry.created.indexes.includes('stock_identity on stock'));
  assert.ok(dry.created.rowLevelSecurity.includes('companies'));
  assert.equal(dry.counts.users, 1); assert.equal(dry.counts.calculation_norms, undefined);
  assert.equal(exists('calculation_norms'), false, 'a dry run rolls back');
  assert.equal(hasColumn('users', 'companyId'), false);
  assert.deepEqual(rows(), records);

  const prepared = prepareWeldingTraceability(db);
  assert.equal(prepared.dryRun, false); assert.equal(prepared.recordsPreserved, true);
  assert.deepEqual(prepared.created, dry.created);
  assert.equal(fingerprint(), fresh, 'the prepared schema matches what initializePostgres creates');
  assert.deepEqual(rows(Object.keys(records)), records);
  verifyHostedSchema(db);
  const again = prepareHostedSchema(db);
  assert.equal(again.upToDate, true);
  assert.deepEqual(Object.values(again.created).flat(), []);
  assert.equal(inspectHostedSchema(db).upToDate, true);
  assert.equal(fingerprint(), fresh);
});

test('backups skip tables an older hosted database does not have and restore into the prepared schema', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  workspace(); makeOlder();
  const records = rows();
  const dir = mkdtempSync(join(tmpdir(), 'stelux-hosted-backup-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(backupPostgres(dir, config()).skipped, ['revisions', 'calculation_norms', 'cut_list'].sort((a, b) => RESOURCES.findIndex(r => r.key === a) - RESOURCES.findIndex(r => r.key === b)));
  const sql = readFileSync(join(dir, 'stelux-postgres.sql'), 'utf8');
  assert.match(sql, /^-- Restore only into an empty Stelux schema/); assert.match(sql, /Not present in the source database[^\n]*calculation_norms/);
  prepareHostedSchema(db);
  const after = mkdtempSync(join(tmpdir(), 'stelux-hosted-backup-')); t.after(() => rmSync(after, { recursive: true, force: true }));
  assert.deepEqual(backupPostgres(after, config()).skipped, []);
  // The older backup restores into an empty schema created by this release.
  db.exec('DROP SCHEMA stelux CASCADE');
  const restored = new Store(':memory:', db); initializeDocumentStorage(restored);
  db.exec('DELETE FROM metadata');
  db.exec(sql);
  verifyHostedSchema(db);
  const restoredRows = rows(Object.keys(records));
  for (const [table, value] of Object.entries(records)) if (table !== 'audit') assert.deepEqual(restoredRows[table], value, table);
  assert.equal(count('audit'), (records.audit as { n: number }).n);
});

test('a resource added by a later release is created with its references and unique rule; older tables are unchanged', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  const store = workspace();
  const site = store.list('sites')[0];
  register(t, {
    // A new table referencing another table created in the same run, plus an existing table.
    resources: [
      resource('rehearsal_gauges', [text('name', { required: true }), ref('calibrationId', 'rehearsal_calibrations'), ref('siteId', 'sites')], [['name']]),
      resource('rehearsal_calibrations', [text('certificate', { required: true }), ref('isoId', 'isometrics')], [['certificate']]),
    ],
    // A new reference on an existing table pointing at a new table, and a new unique rule on an existing table.
    fields: [['sites', ref('gaugeId', 'rehearsal_gauges')]],
    unique: [['companies', ['name', 'email']]],
  });
  const records = rows();
  assert.throws(() => verifyHostedSchema(db), /rehearsal_gauges/);
  const result = prepareHostedSchema(db);
  assert.deepEqual(result.created.tables, ['rehearsal_gauges', 'rehearsal_calibrations']);
  assert.deepEqual(result.created.columns, ['sites.gaugeId → rehearsal_gauges', 'rehearsal_gauges.calibrationId → rehearsal_calibrations', 'rehearsal_gauges.siteId → sites', 'rehearsal_calibrations.isoId → isometrics']);
  assert.deepEqual(result.created.indexes, ['companies_unique_1 on companies', 'rehearsal_gauges_unique_0 on rehearsal_gauges', 'rehearsal_calibrations_unique_0 on rehearsal_calibrations']);
  assert.deepEqual(result.created.rowLevelSecurity, ['rehearsal_gauges', 'rehearsal_calibrations']);
  assert.equal(result.counts.rehearsal_gauges, undefined);
  verifyHostedSchema(db);
  assert.deepEqual(rows(Object.keys(records)), records);
  assert.deepEqual(store.get('sites', site.id), site);
  // The new tables behave like every other resource table.
  const calibration = store.create('rehearsal_calibrations', { certificate: 'CAL-1', isoId: 'iso-1' });
  const gauge = store.create('rehearsal_gauges', { name: 'Gauge 1', calibrationId: calibration.id, siteId: site.id });
  assert.throws(() => store.create('rehearsal_gauges', { name: 'Gauge 1' }), error => (error as { status?: number }).status === 409);
  assert.throws(() => db.prepare("INSERT INTO rehearsal_gauges VALUES ('g-x', '{\"name\":\"Gauge X\",\"calibrationId\":\"missing\"}', 1, 0, 'now', 'now')").run(), /foreign key/);
  store.update('sites', site.id, { gaugeId: gauge.id }, site._version);
  assert.equal(db.prepare('SELECT "gaugeId" FROM sites WHERE id=?').get(site.id)?.gaugeId, gauge.id);
  assert.equal(prepareHostedSchema(db).upToDate, true);
});

test('preparation refuses references that existing records would violate, naming table, field and ids', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  const store = workspace();
  const [first, second] = store.list('sites');
  db.prepare(`UPDATE sites SET data=jsonb_set(data::jsonb, '{ownerCompanyId}', '"company-gone"')::text WHERE id=?`).run(first.id);
  db.prepare(`UPDATE sites SET data=jsonb_set(data::jsonb, '{gaugeId}', '"gauge-unknown"')::text WHERE id=?`).run(second.id);
  register(t, { resources: [resource('rehearsal_gauges', [text('name')])], fields: [['sites', ref('ownerCompanyId', 'companies')], ['sites', ref('gaugeId', 'rehearsal_gauges')]] });
  const records = rows(), schema = fingerprint();
  for (const dryRun of [true, false]) assert.throws(() => prepareHostedSchema(db, { dryRun }), (error: Error) =>
    error.message.includes('sites.ownerCompanyId → companies') && error.message.includes(`${first.id} (ownerCompanyId=company-gone)`)
    && error.message.includes('sites.gaugeId → rehearsal_gauges') && error.message.includes(`${second.id} (gaugeId=gauge-unknown)`) && /Nothing was changed/.test(error.message));
  assert.equal(fingerprint(), schema); assert.deepEqual(rows(), records);
  assert.equal(exists('rehearsal_gauges'), false); assert.equal(hasColumn('sites', 'ownerCompanyId'), false);
  assert.equal(JSON.parse(String(db.prepare('SELECT data FROM sites WHERE id=?').get(first.id)!.data)).ownerCompanyId, 'company-gone', 'the offending value is kept');
});

test('preparation refuses a unique rule that existing active records violate', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  const store = workspace();
  store.create('companies', { name: 'Archived duplicate company' });
  const [first, second, third] = store.list('companies');
  for (const row of [first, second]) db.prepare(`UPDATE companies SET data=jsonb_set(data::jsonb, '{taxNo}', '"NL-1"')::text WHERE id=?`).run(row.id);
  db.prepare(`UPDATE companies SET data=jsonb_set(data::jsonb, '{taxNo}', '"NL-2"')::text, archived=1 WHERE id=?`).run(third.id);
  register(t, { unique: [['companies', ['taxNo']]] });
  const others = store.list('companies', true).filter(row => ![first.id, second.id, third.id].includes(row.id));
  for (const row of others) db.prepare(`UPDATE companies SET data=jsonb_set(data::jsonb, '{taxNo}', to_jsonb(id))::text WHERE id=?`).run(row.id);
  const records = rows(), schema = fingerprint();
  assert.throws(() => prepareHostedSchema(db), (error: Error) => error.message.includes('companies (taxNo) must be unique') && error.message.includes(`[${[first.id, second.id].sort().join(', ')}]`) && !error.message.includes(third.id));
  assert.equal(fingerprint(), schema); assert.deepEqual(rows(), records);
});

test('preparation rolls back when a pre-existing record changes and refuses conflicting existing objects', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  const store = workspace(); makeOlder();
  const site = store.list('sites')[0];
  const records = rows(), schema = fingerprint();
  assert.throws(() => prepareHostedSchema(db, { afterChanges: database => database.prepare(`UPDATE sites SET data=jsonb_set(data::jsonb, '{name}', '"Changed"')::text WHERE id=?`).run(site.id) }), /changed an existing record \(sites\)\. The update was rolled back/);
  assert.equal(fingerprint(), schema); assert.deepEqual(rows(), records);
  assert.equal(store.get('sites', site.id).name, site.name);

  db.exec(`ALTER TABLE users ADD COLUMN "companyId" TEXT`);
  db.exec(`CREATE UNIQUE INDEX sites_unique_0 ON sites ((coalesce(data::jsonb->>'residence', ''))) WHERE archived=0`);
  const conflicted = fingerprint();
  assert.throws(() => prepareHostedSchema(db), (error: Error) => /Nothing was changed/.test(error.message) && error.message.includes('users.companyId exists but is not the generated reference') && error.message.includes('Index sites_unique_0 on sites enforces (residence)'));
  assert.throws(() => verifyHostedSchema(db), /Resolve manually first/);
  assert.equal(fingerprint(), conflicted); assert.deepEqual(rows(), { ...records, users: rows(['users']).users });
});

test('the visual reports resource (VT reports) is part of the hosted schema: references and one number per main project', () => {
  const reports = RESOURCE_MAP.visual_reports;
  assert.ok(reports, 'visual_reports is a record type');
  assert.deepEqual(reports.fields.filter(field => field.type === 'ref').map(field => `${field.name} → ${field.ref}`), ['siteId → sites', 'isoId → isometrics', 'engineerId → qa_engineers']);
  for (const name of ['number', 'seq', 'date', 'mode', 'weldIds', 'uploaded']) assert.ok(reports.fields.some(field => field.name === name), name);
  assert.deepEqual(reports.unique, [['siteId', 'number']]);
});

test('an older hosted database gets the visual reports table from the preparation step, once, without touching records', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  const store = workspace();
  assert.equal(count('visual_reports'), 0);
  db.exec('DROP TABLE stelux."visual_reports" CASCADE');
  const records = rows();
  assert.throws(() => verifyHostedSchema(db), /visual_reports/);
  const result = prepareHostedSchema(db);
  assert.ok(result.created.tables.includes('visual_reports')); assert.ok(result.created.rowLevelSecurity.includes('visual_reports'));
  verifyHostedSchema(db);
  assert.deepEqual(rows(Object.keys(records)), records);
  assert.equal(prepareHostedSchema(db).upToDate, true, 'a second run changes nothing');
  const report = store.create('visual_reports', { number: 'VT 1', seq: 1, siteId: store.list('sites')[0].id, isoId: 'iso-1', weldIds: 'weld-1,weld-10', mode: 'Go (PDF)' });
  assert.equal(count('visual_reports'), 1);
  assert.throws(() => store.create('visual_reports', { number: 'VT 1', seq: 1, siteId: report.siteId, isoId: 'iso-1' }), error => (error as { status?: number }).status === 409);
});

test('the record types of wave 2 (VT reports, spool history, hydrotest results) each have a table with its references, a site rule and a permission area', async () => {
  const { planHostedSchema } = await import('../server/hosted-schema.ts');
  const { SITE_RULES } = await import('../shared/site-scope.ts');
  const { RESOURCE_SCOPES } = await import('../shared/permissions.ts');
  const plan = planHostedSchema({ tables: new Map(), columns: new Map(), foreignKeys: new Map(), indexes: new Map() });
  const expected: Record<string, string[]> = { visual_reports: ['116'], spool_moves: ['24'], hydrotest_results: ['74'] };
  for (const [key, areas] of Object.entries(expected)) {
    const resource = RESOURCE_MAP[key];
    assert.ok(resource, key); assert.ok(plan.tables.includes(key), `${key}: the preparation creates its table`);
    for (const field of resource.fields.filter(item => item.type === 'ref')) assert.ok(plan.columns.some(column => column.table === key && column.field === field.name && column.target === field.ref), `${key}.${field.name} → ${field.ref}`);
    assert.ok(SITE_RULES[key], `${key}: a site-scope rule`);
    assert.deepEqual(RESOURCE_SCOPES[key], areas, `${key}: its permission area`);
  }
});

test('the welder card record types (Weldercard settings values and welder card lines) each have a table with its references, a site rule and a permission area', async () => {
  const { planHostedSchema } = await import('../server/hosted-schema.ts');
  const { SITE_RULES } = await import('../shared/site-scope.ts');
  const { RESOURCE_SCOPES } = await import('../shared/permissions.ts');
  const plan = planHostedSchema({ tables: new Map(), columns: new Map(), foreignKeys: new Map(), indexes: new Map() });
  for (const key of ['weldercard_options', 'welder_card_lines']) {
    const resource = RESOURCE_MAP[key];
    assert.ok(resource, key); assert.ok(plan.tables.includes(key), `${key}: the preparation creates its table`);
    for (const field of resource.fields.filter(item => item.type === 'ref')) assert.ok(plan.columns.some(column => column.table === key && column.field === field.name && column.target === field.ref), `${key}.${field.name} → ${field.ref}`);
    assert.ok(SITE_RULES[key], `${key}: a site-scope rule`); assert.deepEqual(RESOURCE_SCOPES[key], ['68'], `${key}: the welders permission area`);
  }
  assert.deepEqual(RESOURCE_MAP.weldercard_options.unique, [['list', 'name']], 'a value is unique within its list');
});

test('an older hosted database gets the weldercard tables from the preparation step, once, without touching records', { skip: !testUrl }, t => {
  connect(); t.after(() => db.close());
  workspace();
  db.exec('DROP TABLE stelux."welder_card_lines" CASCADE'); db.exec('DROP TABLE stelux."weldercard_options" CASCADE');
  const records = rows();
  assert.throws(() => verifyHostedSchema(db), /weldercard_options|welder_card_lines/);
  const result = prepareHostedSchema(db);
  assert.ok(result.created.tables.includes('weldercard_options') && result.created.tables.includes('welder_card_lines'));
  verifyHostedSchema(db);
  assert.deepEqual(rows(Object.keys(records)), records);
  assert.equal(prepareHostedSchema(db).upToDate, true, 'a second run changes nothing');
});
