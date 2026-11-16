import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { inspectionRules } from '../server/inspections.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import type { User } from '../shared/types.ts';

/**
 * Regression tests of the independent security review 2 (sec2-001 … sec2-013): one test per finding, named with its id.
 * Sample data (server/seed.ts): North fabrication yard holds STX-2401 (iso-1..3) and STX-2403 (iso-7..10); Riverside
 * installation holds STX-2402 (iso-4..6).
 */
const PASSWORD = 'Security-Review-Password';
const RW = 'Read & write', NONE = 'No access', ADMIN = 'Administration', READ = 'Read only';
const NORTH = 'site-north', RIVER = 'site-river';
type Options = { method?: string; pilot?: string; data?: unknown; site?: string };

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-security-review-2-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const app = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data, site }: Options = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(site ? { 'X-Stelux-Site': site } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, unknown>) => store.create('profiles', { name, description: name, toolsPermission: NONE, settingsPermission: NONE, ...levels }).id;
  const matrix = (name: string, rules: Record<string, string[]>) => profile(name, { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE });
  /** An account; `sites` gives the chosen main projects per limited pilot (stored as user_sites links). */
  const account = (name: string, data: Record<string, unknown>, sites: Partial<Record<'weld' | 'mto', string[]>> = {}) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    for (const [pilot, ids] of Object.entries(sites)) for (const siteId of ids!) store.create(USER_SITES, { userId: user.id, pilot, siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client();
    return { user, as, login: () => as.login(String(user.email)) };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Review admin', email: 'review-admin@example.test', password: PASSWORD } })).status, 201);
  const adminRow = store.list('users').find(row => row.email === 'review-admin@example.test')!;
  return { store, app, client, admin, adminRow, profile, matrix, account };
}
const adminLevels = { generalPermission: ADMIN, materialsPermission: ADMIN, weldingPermission: ADMIN, settingsPermission: ADMIN };
const levelsOf = (row: Record<string, unknown>) => ['generalPermission', 'materialsPermission', 'weldingPermission', 'toolsPermission', 'settingsPermission', 'permissionMode', 'permissionRules'].map(name => row[name] ?? '');

test('sec2-001: an administrator limited to some main projects does not change the rights of a profile used by accounts outside its reach', async t => {
  const f = await fixture(t);
  const adminProfile = f.profile('Site admin', adminLevels);
  const shared = f.profile('Shared review', { generalPermission: READ, materialsPermission: READ, weldingPermission: READ });
  const limited = f.account('North admin', { profileId: adminProfile, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH], mto: [NORTH] });
  await limited.login();
  // The shared profile is the profile of a Riverside-only account.
  f.account('River reviewer', { profileId: shared, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [RIVER], mto: [RIVER] });
  const before = f.store.get('profiles', shared);
  const widen = (as: ReturnType<typeof f.client>) => as.request(`/records/profiles/${shared}`, { method: 'PUT', pilot: 'weld', data: { ...adminLevels, _version: f.store.get('profiles', shared)._version } });
  const refused = await widen(limited.as);
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.deepEqual(levelsOf(f.store.get('profiles', shared)), levelsOf(before), 'the stored levels are unchanged');
  // Archiving that profile is refused as well.
  assert.equal((await limited.as.request(`/records/profiles/${shared}/archive`, { method: 'POST', pilot: 'weld', data: { _version: before._version } })).status, 403, 'archive');
  assert.equal(f.store.get('profiles', shared, true)._archived, false);
  // A profile used only by accounts within its reach stays editable for the limited administrator.
  const northOnly = f.profile('North review', { generalPermission: READ, materialsPermission: READ, weldingPermission: READ });
  f.account('North reviewer', { profileId: northOnly, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH], mto: [NORTH] });
  const own = await limited.as.request(`/records/profiles/${northOnly}`, { method: 'PUT', pilot: 'weld', data: { weldingPermission: RW, _version: f.store.get('profiles', northOnly)._version } });
  assert.equal(own.status, 200, await own.clone().text());
  // The administrator of every main project changes the shared profile.
  const allowed = await widen(f.admin);
  assert.equal(allowed.status, 200, await allowed.clone().text());
  assert.equal(f.store.get('profiles', shared).settingsPermission, ADMIN);
});

test('sec2-002: Undo on an NDT request needs the Delete right of the NDT area, not only Show on the request archive', async t => {
  const f = await fixture(t);
  for (const id of ['weld-22', 'weld-23']) f.store.update('welds', id, { ndtLocationId: 'ndt-shop', ndtProcess1Id: 'ndt-0', ndtProcess2Id: 'ndt-1' }, f.store.get('welds', id)._version, SYSTEM);
  const made = inspectionRules(f.store, SYSTEM).run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23'], processIds: ['ndt-0', 'ndt-1'] }).records!;
  const line = made.find(row => row.weldId === 'weld-22')!;
  const result = f.store.create('inspection_results', { requestId: line.id, weldId: 'weld-22', type: 'NDT', round: 'Initial', result: 'Accepted', reportNo: 'RT-SEC2-002', processId: 'ndt-0' }, SYSTEM);
  const body = { type: 'NDT', requestNo: line.number, weldId: 'weld-22' };
  const viewer = f.account('Archive viewer', { profileId: f.matrix('Archive viewer', { '63': ['show'], '66': ['show'], '76': ['show'] }) });
  await viewer.login();
  assert.equal((await viewer.as.request('/actions/inspection-request-undo', { method: 'POST', pilot: 'weld', data: body })).status, 403);
  assert.equal(f.store.get('inspection_requests', line.id, true)._archived, false, 'the request line stays');
  assert.equal(f.store.get('inspection_results', result.id, true)._archived, false, 'its result stays');
  // NDT Pre: the Delete right of NDT (76) is no right on NDT Pre (94).
  const ndtDelete = f.account('NDT archivist', { profileId: f.matrix('NDT archivist', { '63': ['show'], '66': ['show'], '76': ['show', 'delete'], '94': ['show'] }) });
  await ndtDelete.login();
  assert.equal((await ndtDelete.as.request('/actions/inspection-request-undo', { method: 'POST', pilot: 'weld', data: { ...body, type: 'NDT PRE' } })).status, 403, 'NDT Pre without Delete on 94');
  const done = await ndtDelete.as.request('/actions/inspection-request-undo', { method: 'POST', pilot: 'weld', data: body });
  assert.equal(done.status, 201, await done.clone().text());
  assert.equal(f.store.get('inspection_requests', line.id, true)._archived, true);
});
