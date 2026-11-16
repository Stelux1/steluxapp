import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { isoSummariesFor } from '../server/iso-summary.ts';
import { copyDemoProject, sampleSource, DEMO_MARKER } from '../server/demo-project.ts';
import { RESOURCES } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor } from '../shared/release.ts';
import { materialsList } from '../shared/mto-stock.ts';
import type { Row } from '../shared/types.ts';

// The demo main project (server/demo-project.ts) is added to an existing hosted workspace insert-only. The target
// here is a workspace created from the sample data with one real account, like the hosted database.
const PASSWORD = 'Demo-Project-Password';
const availability = availabilityFor(HOSTED_RELEASE_PROFILE);

/** Every row of every table, keyed by table and id (counters are expected to advance and are compared separately). */
function digest(store: Store) {
  const rows = new Map<string, string>();
  const hash = (row: unknown) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
  for (const resource of RESOURCES) for (const row of store.db.prepare(`SELECT id,data,version,archived,created_at,updated_at FROM "${resource.key}"`).all()) rows.set(`${resource.key}/${String(row.id)}`, hash(row));
  for (const [table, key] of [['credentials', 'user_id'], ['sessions', 'token_hash'], ['metadata', 'key'], ['audit', 'id']]) for (const row of store.db.prepare(`SELECT * FROM ${table}`).all()) rows.set(`${table}/${String(row[key])}`, hash(row));
  return rows;
}
const counters = (store: Store) => Object.fromEntries((store.db.prepare('SELECT key,value FROM counters').all() as { key: string; value: number }[]).map(row => [row.key, Number(row.value)]));

function workspace(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-demo-project-'));
  const store = new Store(join(dir, 'hosted.sqlite')); seed(store);
  const admin = store.create('users', { name: 'Workspace administrator', email: 'admin@example.test', profileId: 'profile-admin', active: true });
  store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(admin.id, passwordHash(PASSWORD));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, dir };
}

test('the dry run performs the whole copy and changes nothing', t => {
  const { store } = workspace(t);
  const before = digest(store), counted = counters(store);
  const result = copyDemoProject(store, { dryRun: true });
  assert.equal(result.status, 'copied');
  assert.equal(result.dryRun, true);
  assert.ok(result.totals.inserted > 200 && result.totals.matched > 100, JSON.stringify(result.totals));
  assert.deepEqual(digest(store), before);
  assert.deepEqual(counters(store), counted);
  assert.equal(store.list('sites').some(site => site.id.startsWith('demo-')), false);
});

test('the demo project is inserted without changing existing rows, renders in both pilots and is not inserted twice', async t => {
  const { store, dir } = workspace(t);
  const before = digest(store), counted = counters(store);
  const rows = (s: Store) => Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key, true)])) as Record<string, Row[]>;
  const quantities = (list: ReturnType<typeof materialsList>) => list.map(item => [item.values.iso, item.values.description, item.values.quantity, item.values.ordered, item.values.inventory, item.values.picked]);
  const ownIsos = store.list('isometrics');
  const ownBefore = { summaries: isoSummariesFor(store, availability, ownIsos), materials: ['project-cooling', 'project-steam'].map(projectId => quantities(materialsList(rows(store), { projectId }))) };
  const source = sampleSource(); t.after(() => source.close());
  const result = copyDemoProject(store, { dryRun: false, source });
  assert.equal(result.status, 'copied');

  // No existing row changed; every new record is a demo- record; accounts untouched.
  const after = digest(store);
  for (const [key, value] of before) assert.equal(after.get(key), value, `${key} changed`);
  const added = [...after.keys()].filter(key => !before.has(key));
  const records = added.filter(key => !/^(audit|metadata)\//.test(key));
  assert.ok(records.length > 200);
  assert.deepEqual(records.filter(key => !key.split('/')[1].startsWith('demo-')), []);
  assert.deepEqual(added.filter(key => key.startsWith('metadata/')), [`metadata/${DEMO_MARKER}`]);
  for (const key of ['users', 'profiles', 'user_sites', 'signatures', 'company_data']) assert.equal(added.some(item => item.startsWith(`${key}/`)), false, key);
  for (const [key, value] of Object.entries(counted)) assert.ok(counters(store)[key] >= value, `counter ${key} went back`);
  assert.equal(result.totals.inserted, records.length);

  // The two demo sites, told apart from the existing ones.
  assert.deepEqual(store.list('sites').filter(site => site.id.startsWith('demo-')).map(site => site.name).sort(), ['Demo – North fabrication yard', 'Demo – Riverside installation']);
  assert.equal(store.get('sites', 'site-north').name, 'North fabrication yard');
  assert.equal(store.get('projects', 'demo-project-cooling').siteId, 'demo-site-north');

  // The demo isometrics show the numbers of the local sample: progress, blockers, punch and Material status, and the MTO materials list (Inv., Ord.?, Picked).
  const sourceIsos = source.list('isometrics');
  const sourceSummaries = isoSummariesFor(source, availability, sourceIsos);
  const demoSummaries = isoSummariesFor(store, availability, store.list('isometrics').filter(iso => iso.id.startsWith('demo-')));
  assert.equal(Object.keys(demoSummaries).length, sourceIsos.length);
  for (const iso of sourceIsos) assert.deepEqual(demoSummaries[`demo-${iso.id}`], sourceSummaries[iso.id], `summary of ${String(iso.isoNo)}`);
  for (const project of ['project-cooling', 'project-steam']) assert.deepEqual(quantities(materialsList(rows(store), { projectId: `demo-${project}` })), quantities(materialsList(rows(source), { projectId: project })), project);
  assert.deepEqual(result.sampleParity, { isometrics: sourceIsos.length, summariesMatching: sourceIsos.length, summariesDiffering: [], projects: 3, materialsListsDiffering: [] });
  // The client's own isometrics keep their numbers (Inv. counts every storehouse, so shared stock would change them).
  assert.deepEqual(isoSummariesFor(store, availability, ownIsos), ownBefore.summaries);
  assert.deepEqual(['project-cooling', 'project-steam'].map(projectId => quantities(materialsList(rows(store), { projectId }))), ownBefore.materials);

  // A second run inserts nothing.
  const settled = digest(store);
  const again = copyDemoProject(store, { dryRun: false });
  assert.equal(again.status, 'already-present');
  assert.equal(again.totals.inserted, 0);
  assert.deepEqual(digest(store), settled);

  // The main read path of both pilots: bootstrap rows for an administrator with the isometric summaries.
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = '';
  const request = async (path: string, pilot?: string, body?: unknown) => {
    const response = await fetch(`${origin}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  assert.equal((await request('/auth/login', undefined, { email: 'admin@example.test', password: PASSWORD })).status, 200);
  const selector = await (await request('/bootstrap')).json() as { mainProjects: { id: string }[] };
  assert.ok(['demo-site-north', 'demo-site-river'].every(id => JSON.stringify(selector.mainProjects).includes(id)), 'demo main projects in the selector');
  for (const [pilot, projects] of [['weld', ['demo-project-cooling', 'demo-project-steam', 'demo-project-skid']], ['mto', ['demo-project-cooling', 'demo-project-steam']]] as const) {
    const response = await request('/bootstrap', pilot);
    assert.equal(response.status, 200, pilot);
    const body = await response.json() as { rows: Record<string, Row[]>; isoSummaries: Record<string, unknown> };
    for (const id of projects) assert.ok(body.rows.projects.some(project => project.id === id), `${pilot}: ${id}`);
    const isos = body.rows.isometrics.filter(iso => projects.includes(String(iso.projectId) as never));
    assert.ok(isos.length >= 6, pilot);
    for (const iso of isos) assert.ok(body.isoSummaries[iso.id], `${pilot}: summary of ${String(iso.isoNo)}`);
    const own = pilot === 'weld' ? 'welds' : 'iso_materials';
    assert.ok(body.rows[own].some(row => row.id.startsWith('demo-')), `${pilot}: demo ${own}`);
  }
});

test('the command refuses to run without a hosted PostgreSQL database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-demo-cli-'));
  try {
    // An empty working directory, so no local .env is loaded; the environment carries no database settings.
    const run = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), resolve('server/demo-project.ts')], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /never runs against SQLite/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
