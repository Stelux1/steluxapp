import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { runAction } from '../server/workflows.ts';
import { passwordHash } from '../server/auth.ts';
import { planHostedSchema, describePlan } from '../server/hosted-schema.ts';
import { REPLACED_UNIQUE_RULES, uniqueIndexes } from '../server/postgres-schema.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { SITE_RULES, SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import { projectScope } from '../shared/project-scope.ts';
import { SITE_OWNED, SITE_UNIQUE, inOwnerSite, ownerRows, ownerSites, siteUniqueClash } from '../shared/welder-data.ts';
import { itpPickerOptions } from '../shared/itps.ts';
import { availableWps } from '../shared/welding.ts';
import { wpsCopyValues } from '../shared/wps.ts';
import type { Row } from '../shared/types.ts';

// Client 20.11.2026: "ITP, WPS, WPQR are filled in anew for every main project". Each ITP, WPS method and PQR belongs to
// one main project, is listed and offered only there, and its number / name is unique per main project.
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const NORTH = 'site-north', RIVER = 'site-river';

test('ITPs, WPS methods and PQRs belong to one main project; older ones are placed from their links, derived on read', () => {
  assert.deepEqual(Object.keys(SITE_UNIQUE), ['itps', 'wps', 'pqr']);
  for (const key of ['itps', 'wps', 'pqr']) {
    assert.ok(SITE_OWNED[key], key);
    assert.deepEqual(SITE_RULES[key], { via: [['siteId', 'sites']], orphan: 'global' }, `${key}: the server scope follows its siteId, an unplaced older one is shared`);
    assert.equal(RESOURCE_MAP[key].fields.find(field => field.name === 'siteId')?.ref, 'sites');
    assert.deepEqual(RESOURCE_MAP[key].unique, [['siteId', SITE_UNIQUE[key]]], `${key}: the index holds the main project and the number`);
  }
  const projects = [row('p-north', { siteId: NORTH }), row('p-river', { siteId: RIVER })];
  const rows = {
    projects,
    isometrics: [row('iso-n', { projectId: 'p-north', itpId: 'itp-iso' }), row('iso-r', { projectId: 'p-river', itp2Id: 'itp-both' }), row('iso-gone', { projectId: 'p-river', itpId: 'itp-iso', _archived: true })],
    itp_projects: [row('ip1', { itpId: 'itp-linked', projectId: 'p-river' }), row('ip2', { itpId: 'itp-both', projectId: 'p-north' })],
    wps_sites: [row('ws1', { wpsId: 'wps-north', siteId: NORTH }), row('ws2', { wpsId: 'wps-off', siteId: RIVER, _archived: true }), row('ws3', { wpsId: 'wps-both', siteId: NORTH }), row('ws4', { wpsId: 'wps-both', siteId: RIVER })],
    wps_projects: [row('wp1', { wpsId: 'wps-project', projectId: 'p-river' })],
    wps: [row('wps-north'), row('wps-off'), row('wps-both'), row('wps-project'), row('wps-none'), row('wps-own', { siteId: RIVER })],
    wps_pqr: [row('l1', { wpsId: 'wps-north', pqrId: 'pqr-north' }), row('l2', { wpsId: 'wps-own', pqrId: 'pqr-two' }), row('l3', { wpsId: 'wps-north', pqrId: 'pqr-two' }), row('l4', { wpsId: 'wps-none', pqrId: 'pqr-shared' })],
  };
  const of = (key: string, record: Row) => ownerSites(key, record, ownerRows(key, name => rows[name as keyof typeof rows]));
  // Own siteId first: a record saved in a main project belongs there whatever it links.
  assert.deepEqual(of('itps', row('itp-iso', { siteId: RIVER })), [RIVER]);
  // ITP: the main projects of its linked projects and of the (active) isometrics that link it.
  assert.deepEqual(of('itps', row('itp-iso')), [NORTH], 'an archived isometric of Riverside does not count');
  assert.deepEqual(of('itps', row('itp-linked')), [RIVER]);
  assert.deepEqual(of('itps', row('itp-both')), [NORTH, RIVER]);
  assert.equal(of('itps', row('itp-free')), 'all', 'an ITP linked nowhere cannot be placed: it stays shared');
  // WPS: the main projects it is or was enabled on, and those of its chosen projects.
  assert.deepEqual(of('wps', row('wps-north')), [NORTH]);
  assert.deepEqual(of('wps', row('wps-off')), [RIVER], 'deactivated on Riverside, it stays in Riverside\'s list');
  assert.deepEqual(of('wps', row('wps-both')), [NORTH, RIVER]);
  assert.deepEqual(of('wps', row('wps-project')), [RIVER]);
  assert.equal(of('wps', row('wps-none')), 'all');
  // PQR: the main projects of its WPS methods; shared when one of them is shared.
  assert.deepEqual(of('pqr', row('pqr-north')), [NORTH]);
  assert.deepEqual(of('pqr', row('pqr-two')), [NORTH, RIVER]);
  assert.equal(of('pqr', row('pqr-shared')), 'all');
  assert.equal(of('pqr', row('pqr-unlinked')), 'all');
  // Nothing is rewritten: the derivation reads the rows only.
  assert.equal(rows.wps.find(item => item.id === 'wps-north')!.siteId, undefined);
});

test('a new main project lists none of the other main projects\' ITPs, WPS methods and PQRs; its ITP and WPS selects offer its own only', () => {
  const store = new Store(':memory:'); seed(store);
  const site = store.create('sites', { name: 'New main project' }), project = store.create('projects', { internnumber: 'NEW-01', siteId: site.id });
  const own = { itp: store.create('itps', { siteId: site.id, number: 'ITP-01', scope: 'Shop', active: true }), pqr: store.create('pqr', { siteId: site.id, name: 'STX-PQR-001' }) };
  const wps = store.create('wps', { siteId: site.id, name: 'STX-WPS-141-01', method: '141', definition: 'New main project', allProjects: true, siteIds: [site.id], pqrIds: [own.pqr.id] });
  const iso = store.create('isometrics', { isoNo: 'NEW-ISO-1', projectId: project.id });
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
  const fresh = projectScope(rows, site.id);
  assert.deepEqual(fresh.itps.map(item => item.id), [own.itp.id], 'only the ITP added in the new main project');
  assert.deepEqual(fresh.wps.map(item => item.id), [wps.id]);
  assert.deepEqual(fresh.pqr.map(item => item.id), [own.pqr.id]);
  assert.deepEqual(projectScope(rows, NORTH).itps.map(item => item.number).sort(), ['ITP-01', 'ITP-03', 'ITP-NDT-01'], 'North keeps its sample ITPs, not the new main project\'s');
  assert.ok(!projectScope(rows, NORTH).wps.some(item => item.id === wps.id));
  // The Add / Edit isometric ITP No select and the ITP picker offer the workspace rows of the open main project.
  assert.deepEqual(itpPickerOptions(iso, fresh.itps, fresh.itp_projects, 'any').map(item => item.id), [own.itp.id]);
  // The weld form's WPS select: WPS methods of this main project available for the project.
  assert.deepEqual(fresh.wps.filter(item => availableWps(fresh, item, project.id)).map(item => item.id), [wps.id]);
  assert.deepEqual(projectScope(rows, NORTH).wps.filter(item => availableWps(rows, item, 'project-cooling')).map(item => item.id).sort(), ['wps-1', 'wps-2']);
  // The attachments of another main project's ITP stay out too.
  assert.ok(fresh.attachments.every(file => !['itps', 'wps', 'pqr'].includes(String(file.entityType)) || [own.itp.id, wps.id, own.pqr.id].includes(String(file.entityId))));
  store.close();
});

test('the same ITP No, WPS number and PQR name are unique per main project in the store; an older record counts for its main projects', () => {
  const store = new Store(':memory:'); seed(store);
  const site = store.create('sites', { name: 'Second yard' });
  // The sample ITP-01 belongs to North (linked from its isometrics): Second yard may use the number, North may not.
  assert.equal(store.create('itps', { siteId: site.id, number: 'ITP-01' }).number, 'ITP-01');
  assert.throws(() => store.create('itps', { siteId: site.id, number: 'itp-01 ' }), (error: Error & { status?: number; fields?: Record<string, string> }) => error.status === 409 && /ITP \/ KNR number itp-01 already exists in this main project\./.test(error.message) && Boolean(error.fields?.number));
  assert.throws(() => store.create('itps', { siteId: NORTH, number: 'ITP-01' }), /already exists in this main project/);
  assert.equal(store.create('itps', { siteId: RIVER, number: 'ITP-01' }).siteId, RIVER, 'Riverside has no ITP-01 of its own');
  // The sample WPS and PQR are shared by North and Riverside: a new main project may take the same number.
  const wps = store.create('wps', { siteId: site.id, name: 'STX-WPS-141-01', method: '141', definition: 'x', siteIds: [site.id] });
  assert.throws(() => store.create('wps', { siteId: NORTH, name: 'STX-WPS-141-01', method: '141', definition: 'x' }), /WPS number STX-WPS-141-01 already exists in this main project/);
  const pqr = store.create('pqr', { siteId: site.id, name: 'STX-PQR-001' });
  assert.throws(() => store.create('pqr', { siteId: site.id, name: 'STX-PQR-001' }), /already exists in this main project/);
  // Renaming into a number of the same main project is refused; an unrelated edit of the record is not judged again.
  const other = store.create('wps', { siteId: site.id, name: 'WPS-OTHER', method: '141', definition: 'x' });
  assert.throws(() => store.update('wps', other.id, { name: 'STX-WPS-141-01' }, other._version), /already exists in this main project/);
  assert.equal(store.update('wps', wps.id, { definition: 'edited' }, wps._version).definition, 'edited');
  // Restoring a deleted record into a taken number is refused.
  const archived = store.archive('pqr', pqr.id, pqr._version, SYSTEM);
  store.create('pqr', { siteId: site.id, name: 'STX-PQR-001' });
  assert.throws(() => store.archive('pqr', archived.id, archived._version, SYSTEM), /already exists in this main project/);
  // The rule as a function.
  const lists = ownerRows('itps', name => store.list(name, true));
  assert.ok(siteUniqueClash('itps', { siteId: NORTH, number: 'ITP-03' }, store.list('itps'), lists));
  assert.equal(siteUniqueClash('itps', { siteId: site.id, number: 'ITP-03' }, store.list('itps'), lists), undefined);
  store.close();
});

test('Duplicate Project site switches on the older shared WPS methods only; a WPS of the source main project stays its own', () => {
  const store = new Store(':memory:'); seed(store);
  const own = store.create('wps', { siteId: NORTH, name: 'WPS-NORTH-OWN', method: '141', definition: 'x', siteIds: [NORTH] });
  const copy = runAction(store, 'duplicate-site', { siteId: NORTH, parts: ['wpsMethods'] }, SYSTEM).record!;
  const enabled = store.list('wps_sites').filter(link => link.siteId === copy.id).map(link => link.wpsId).sort();
  assert.deepEqual(enabled, ['wps-1', 'wps-2']);
  assert.ok(!enabled.includes(own.id));
  store.close();
});

test('a fresh local SQLite database gets the per-main-project index; an older one has its global index replaced on open', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-unique-'));
  try {
    const file = join(dir, 'old.sqlite');
    const index = (db: DatabaseSync, name: string) => String((db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(name) as { sql: string }).sql);
    let store = new Store(file); seed(store);
    assert.match(index(store.db as unknown as DatabaseSync, 'itps_unique_0'), /'\$\.siteId'.*'\$\.number'/);
    // As an earlier release left it: one global rule per number / name.
    for (const [name, [key]] of Object.entries(REPLACED_UNIQUE_RULES)) {
      const table = name.replace(/_unique_0$/, '');
      store.db.exec(`DROP INDEX "${name}"; CREATE UNIQUE INDEX "${name}" ON "${table}" (coalesce(json_extract(data, '$.${key}'), '')) WHERE archived=0;`);
    }
    const before = store.list('itps').map(item => JSON.stringify(item));
    store.close();
    store = new Store(file);
    for (const name of Object.keys(REPLACED_UNIQUE_RULES)) assert.match(index(store.db as unknown as DatabaseSync, name), /'\$\.siteId'/, name);
    assert.deepEqual(store.list('itps').map(item => JSON.stringify(item)), before, 'no record changed');
    store.create('itps', { siteId: RIVER, number: 'ITP-03' });
    assert.throws(() => store.db.prepare("INSERT INTO itps(id,data,created_at,updated_at) VALUES ('raw','{\"siteId\":\"site-river\",\"number\":\"ITP-03\"}','x','x')").run(), /UNIQUE/, 'the index itself refuses a second ITP-03 of Riverside');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the hosted preparation plans the replacement of exactly the previous global index; any other differing index stays a conflict', () => {
  const tables = new Map(RESOURCES.map(resource => [resource.key, { rls: true, publicAccess: false }]));
  for (const name of ['credentials', 'sessions', 'audit', 'metadata', 'counters']) tables.set(name, { rls: true, publicAccess: false });
  const columns = new Map<string, Map<string, { generated: boolean; expression: string | null; type: string }>>();
  const foreignKeys = new Map<string, { target: string; schema: string; deferrable: boolean }>();
  for (const resource of RESOURCES) {
    const map = new Map(Object.entries({ id: 'text', data: 'text', version: 'integer', archived: 'integer', created_at: 'text', updated_at: 'text' }).map(([name, type]) => [name, { generated: false, expression: null as string | null, type }]));
    for (const field of resource.fields.filter(item => item.ref)) { map.set(field.name, { generated: true, expression: `NULLIF(((data)::jsonb ->> '${field.name}'::text), ''::text)`, type: 'text' }); foreignKeys.set(`${resource.key}.${field.name}`, { target: field.ref!, schema: 'stelux', deferrable: true }); }
    columns.set(resource.key, map);
  }
  const definition = (table: string, keys: string[], where = 'WHERE (archived = 0)') => `CREATE UNIQUE INDEX x ON stelux.${table} USING btree (${keys.map(key => `COALESCE(((data)::jsonb ->> '${key}'::text), ''::text)`).join(', ')}) ${where}`;
  const current = () => new Map(uniqueIndexes().map(index => [index.name, { table: index.table, unique: true, definition: definition(index.table, [...index.expressions.join(' ').matchAll(/->>'([^']+)'/g)].map(match => match[1])) }]));
  assert.deepEqual(planHostedSchema({ tables, columns, foreignKeys, indexes: current() }).replace, [], 'a prepared database has nothing to replace');
  const older = current();
  for (const [name, keys] of Object.entries(REPLACED_UNIQUE_RULES)) older.set(name, { table: name.replace(/_unique_0$/, ''), unique: true, definition: definition(name.replace(/_unique_0$/, ''), keys) });
  const plan = planHostedSchema({ tables, columns, foreignKeys, indexes: older });
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.replace.map(index => index.name).sort(), ['itps_unique_0', 'pqr_unique_0', 'wps_unique_0']);
  assert.deepEqual(describePlan(plan).indexes.sort(), ['itps_unique_0 on itps (siteId, number) replaces the unique rule on (number)', 'pqr_unique_0 on pqr (siteId, name) replaces the unique rule on (name)', 'wps_unique_0 on wps (siteId, name) replaces the unique rule on (name)'], 'the dry run names each replacement');
  // Another rule under that name, or the previous keys under another condition, are reported and left alone.
  const odd = current();
  odd.set('itps_unique_0', { table: 'itps', unique: true, definition: definition('itps', ['title']) });
  odd.set('wps_unique_0', { table: 'wps', unique: true, definition: definition('wps', ['name'], 'WHERE (archived = 1)') });
  const refused = planHostedSchema({ tables, columns, foreignKeys, indexes: odd });
  assert.deepEqual(refused.replace, []);
  assert.equal(refused.conflicts.length, 2); assert.match(refused.conflicts.join(' '), /Index itps_unique_0 on itps enforces \(title\)/);
});

test('WPS Copy creates a WPS of the target main project with the same number and only its PQRs', () => {
  const rows = {
    sites: [row('a', { name: 'A' }), row('b', { name: 'B' })], projects: [row('pa', { siteId: 'a' })],
    wps: [row('w', { name: 'CS-T2 r5', method: '141', siteId: 'a', allProjects: true }), row('taken', { name: 'TAKEN', siteId: 'b' }), row('t2', { name: 'TAKEN', siteId: 'a' }), row('unplaced')],
    wps_sites: [row('s1', { wpsId: 'w', siteId: 'a' })], wps_projects: [],
    pqr: [row('qa', { siteId: 'a' }), row('qb', { siteId: 'b' }), row('qs')],
    wps_pqr: [row('l1', { wpsId: 'w', pqrId: 'qa' }), row('l2', { wpsId: 'w', pqrId: 'qb' }), row('l3', { wpsId: 'w', pqrId: 'qs' }), row('l4', { wpsId: 'unplaced', pqrId: 'qs' })],
  };
  const values = wpsCopyValues(rows, rows.wps[0], 'b');
  assert.deepEqual([values.name, values.siteId, values.siteIds, values.copySiteId, values.pqrIds], ['CS-T2 r5', 'b', ['b'], 'b', ['qb', 'qs']]);
  assert.equal(wpsCopyValues(rows, rows.wps[2], 'b').name, 'TAKEN (B)', 'only a number B already holds gets the main project\'s name, as before');
  assert.ok(inOwnerSite('pqr', rows.pqr[2], 'b', ownerRows('pqr', name => rows[name as keyof typeof rows])), 'a PQR of a shared older WPS is shared');
});

// ----- HTTP (hosted profile) ----------------------------------------------------------------------------------------
const PASSWORD = 'Site-Owned-Test-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-site-owned-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', data }: { method?: string; data?: unknown } = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, 'X-Stelux-Pilot': 'weld', ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const site = async (siteId: string) => assert.equal((await request('/auth/site', { method: 'POST', data: { siteId } })).status, 200);
    return { request, site };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Owner admin', email: 'owner-admin@example.test', password: PASSWORD } })).status, 201);
  const site = store.create('sites', { name: 'New main project' });
  const project = store.create('projects', { internnumber: 'NEW-01', siteId: site.id });
  const iso = store.create('isometrics', { isoNo: 'NEW-ISO-1', projectId: project.id });
  return { store, admin, client, site, project, iso };
}
const body = async (response: Response) => await response.json() as { record?: Row; records?: Row[]; rows?: Row[]; error?: string; fields?: Record<string, string> };
const pdf = (data: Record<string, string>) => { const form = new FormData(); for (const [key, value] of Object.entries(data)) form.set(key, value); form.set('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'itp.pdf'); return form; };

test('server: the same ITP No, WPS number and PQR saved in two main projects succeed, twice in one main project is refused; new records take the open main project', async t => {
  const f = await fixture(t);
  await f.admin.site(f.site.id);
  // Add ITP (page action) and the record routes: the number of another main project is free here.
  const itp = await f.admin.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-01', scope: 'Shop', revNo: '0' }) });
  assert.equal(itp.status, 201); assert.equal((await body(itp)).record!.siteId, f.site.id);
  const again = await f.admin.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-01', revNo: '0' }) });
  assert.equal(again.status, 422); assert.match((await body(again)).error!, /ITP No ITP-01 already exists in this main project/);
  const record = await f.admin.request('/records/itps', { method: 'POST', data: { number: 'ITP-01' } });
  assert.equal(record.status, 409); assert.equal((await body(record)).fields!.number, 'This value is already in use in this main project.');
  const wps = await f.admin.request('/records/wps', { method: 'POST', data: { name: 'CS-T2 r5', method: '141', definition: 'x', allProjects: true, siteIds: [f.site.id] } });
  assert.equal(wps.status, 201); const created = (await body(wps)).record!; assert.equal(created.siteId, f.site.id, 'the open main project when the form sends none');
  assert.equal((await f.admin.request('/records/wps', { method: 'POST', data: { name: 'CS-T2 r5', method: '141', definition: 'x' } })).status, 409);
  const pqr = await f.admin.request('/records/pqr', { method: 'POST', data: { name: 'WPQR-7' } });
  assert.equal(pqr.status, 201);
  assert.equal((await f.admin.request('/records/pqr', { method: 'POST', data: { name: 'WPQR-7' } })).status, 409);
  // North: the same WPS number and PQR are accepted, once.
  await f.admin.site(NORTH);
  assert.equal((await f.admin.request('/records/wps', { method: 'POST', data: { name: 'CS-T2 r5', method: '141', definition: 'x', siteIds: [NORTH] } })).status, 201);
  assert.equal((await f.admin.request('/records/wps', { method: 'POST', data: { name: 'CS-T2 r5', method: '141', definition: 'x' } })).status, 409);
  assert.equal((await f.admin.request('/records/pqr', { method: 'POST', data: { name: 'WPQR-7' } })).status, 201);
  assert.equal((await f.admin.request('/records/itps', { method: 'POST', data: { number: 'ITP-01' } })).status, 409, 'North already holds the sample ITP-01');
  assert.equal(f.store.list('wps').filter(item => item.name === 'CS-T2 r5').length, 2);
  // The main project of a record never moves, and a WPS is enabled on its own main project only.
  assert.equal((await f.admin.request(`/records/wps/${created.id}`, { method: 'PUT', data: { siteId: NORTH, _version: created._version } })).status, 422);
  const enable = await f.admin.request(`/records/wps/${created.id}`, { method: 'PUT', data: { siteIds: [f.site.id, NORTH], _version: created._version } });
  assert.equal(enable.status, 422); assert.ok((await body(enable)).fields!.siteIds);
  const toggled = await f.admin.request('/wps/site', { method: 'POST', data: { ids: [created.id], siteId: NORTH, enabled: true } });
  assert.equal(toggled.status, 422); assert.match((await body(toggled)).error!, /belongs to another main project/);
  // Without an open main project nothing is created.
  const none = f.client(); assert.equal((await none.request('/auth/login', { method: 'POST', data: { email: 'owner-admin@example.test', password: PASSWORD } })).status, 200);
  assert.equal((await none.request('/records/itps', { method: 'POST', data: { number: 'ITP-NONE' } })).status, 422);
});

test('server: an isometric takes ITPs and a weld WPS methods of its own main project only; a limited account does not read another main project\'s', async t => {
  const f = await fixture(t);
  await f.admin.site(f.site.id);
  const itp = (await body(await f.admin.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-NEW', scope: 'Shop', revNo: '0' }) }))).record!;
  const wps = (await body(await f.admin.request('/records/wps', { method: 'POST', data: { name: 'WPS-NEW', method: '141', definition: 'x', allProjects: true, siteIds: [f.site.id] } }))).record!;
  const pqr = (await body(await f.admin.request('/records/pqr', { method: 'POST', data: { name: 'PQR-NEW' } }))).record!;
  // Its own isometric takes it.
  const linked = await f.admin.request('/itps/link', { method: 'POST', data: { isoId: f.iso.id, itpId: itp.id } });
  assert.equal(linked.status, 200);
  // A North isometric does not: neither Link ITP, nor the isometric form.
  await f.admin.site(NORTH);
  const refused = await f.admin.request('/itps/link', { method: 'POST', data: { isoId: 'iso-7', itpId: itp.id } });
  assert.equal(refused.status, 422); assert.equal((await body(refused)).fields!.itpId, 'Choose an ITP / KNR of this main project.');
  const iso7 = f.store.get('isometrics', 'iso-7');
  const form = await f.admin.request('/records/isometrics/iso-7', { method: 'PUT', data: { itpId: itp.id, _version: iso7._version } });
  assert.equal(form.status, 422); assert.equal(f.store.get('isometrics', 'iso-7').itpId, iso7.itpId ?? '');
  // A North weld does not take the new main project's WPS; a North WPS does not take its PQR.
  const weld = await f.admin.request('/records/welds', { method: 'POST', data: { weldNo: 'W-OTHER', isoId: 'iso-1', wpsId: wps.id } });
  assert.equal(weld.status, 422); assert.ok((await body(weld)).fields!.wpsId);
  const north = (await body(await f.admin.request('/records/wps', { method: 'POST', data: { name: 'WPS-NORTH', method: '141', definition: 'x', siteIds: [NORTH] } }))).record!;
  const link = await f.admin.request(`/records/wps/${north.id}`, { method: 'PUT', data: { pqrIds: [pqr.id], _version: north._version } });
  assert.equal(link.status, 422); assert.equal((await body(link)).fields!.pqrIds, 'Choose PQRs of this main project.');
  // A North-only account reads none of the new main project's records (the server's site scope).
  const profile = f.store.create('profiles', { name: 'North reader', settingsPermission: 'No access', toolsPermission: 'No access', generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  const user = f.store.create('users', { name: 'North reader', email: 'north-reader@example.test', active: true, profileId: profile.id, weldSiteScope: SITE_SCOPE_SPECIFIC });
  f.store.create(USER_SITES, { userId: user.id, pilot: 'weld', siteId: NORTH }, SYSTEM);
  f.store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
  const reader = f.client(); assert.equal((await reader.request('/auth/login', { method: 'POST', data: { email: 'north-reader@example.test', password: PASSWORD } })).status, 200);
  for (const [key, id] of [['itps', itp.id], ['wps', wps.id], ['pqr', pqr.id]] as const) {
    const list = (await body(await reader.request(`/records/${key}`))).rows!;
    assert.ok(!list.some(item => item.id === id), `${key}: another main project's record is not listed`);
    assert.ok(list.length > 0, `${key}: North's own and the shared older records are`);
    assert.ok([403, 404].includes((await reader.request(`/records/${key}/${id}`)).status), `${key}: not readable by id`);
  }
});

test('server: Import from isometrics and WPS Copy create records of the main project they are made for', async t => {
  const f = await fixture(t);
  await f.admin.site(f.site.id);
  // The new main project's isometric carries ITP-03 as text: North's ITP-03 is not matched, a new one is created here.
  f.store.update('isometrics', f.iso.id, { itpNo: 'ITP-03' }, f.store.get('isometrics', f.iso.id)._version);
  const imported = await f.admin.request('/itps/import-from-isometrics', { method: 'POST', data: {} });
  assert.equal(imported.status, 201); assert.deepEqual(await imported.json(), { created: 1, linked: 1 });
  const created = f.store.list('itps').find(item => item.number === 'ITP-03' && item.siteId === f.site.id)!;
  assert.equal(f.store.get('isometrics', f.iso.id).itpId, created.id);
  assert.equal(f.store.get('itps', 'itp-03').siteId ?? '', '', 'North\'s ITP-03 is not touched');
  assert.equal(f.store.list('isometrics').filter(iso => iso.itpId === created.id).length, 1, 'no isometric of another main project is linked');
  // WPS Copy to the new main project: its own WPS with the same number; no " (<site>)" when the number is free there.
  await f.admin.site(NORTH);
  const north = (await body(await f.admin.request('/records/wps', { method: 'POST', data: { name: 'CS-T2 r5', method: '141', definition: 'x', allProjects: true, siteIds: [NORTH] } }))).record!;
  const copied = await f.admin.request('/wps/copy', { method: 'POST', data: { ids: [north.id], siteId: f.site.id } });
  assert.equal(copied.status, 201); const copy = (await body(copied)).records![0];
  assert.deepEqual([copy.name, copy.siteId, copy.copySiteId, copy.sourceId], ['CS-T2 r5', f.site.id, f.site.id, north.id]);
  assert.ok(availableWps(Object.fromEntries(['projects', 'wps_projects', 'wps_sites'].map(key => [key, f.store.list(key)])), f.store.get('wps', copy.id), f.project.id));
});
