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
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import type { BookPartsResponse } from '../shared/iso-book.ts';
import type { Row, User } from '../shared/types.ts';

/**
 * Regression tests of the independent security review 1 (sec1-001 … sec1-010): one test per finding, named with its id.
 * Sample data (server/seed.ts): North fabrication yard holds STX-2401 (iso-1..3) and STX-2403 (iso-7..10); Riverside
 * installation holds STX-2402 (iso-4..6).
 */
const PASSWORD = 'Security-Review-Password';
const RW = 'Read & write', NONE = 'No access', ADMIN = 'Administration';
const NORTH = 'site-north', RIVER = 'site-river';
type Options = { method?: string; pilot?: string; data?: unknown; site?: string; ip?: string };

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-security-review-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const app = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data, site, ip }: Options = {}) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(site ? { 'X-Stelux-Site': site } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, unknown>) => store.create('profiles', { name, toolsPermission: NONE, settingsPermission: NONE, ...levels }).id;
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
  return { store, app, client, admin, adminRow, profile, account };
}
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;
const adminLevels = { generalPermission: ADMIN, materialsPermission: ADMIN, weldingPermission: ADMIN, settingsPermission: ADMIN };

test('sec1-001: switching a pilot on and choosing its profile are access changes; a pilot the administrator is not enabled in is no reach', async t => {
  const f = await fixture(t);
  const adminProfile = f.profile('Site admin', adminLevels);
  // An administrator limited to North in Weld Pilot, with MTO Pilot switched off.
  const limited = f.account('North admin', { profileId: adminProfile, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoEnabled: false }, { weld: [NORTH] });
  await limited.login();
  const self = f.store.get('users', limited.user.id);
  const own = await limited.as.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'weld', data: { mtoEnabled: true, _version: self._version } });
  assert.equal(own.status, 403, 'switching MTO Pilot on for its own account');
  assert.equal(f.store.get('users', self.id).mtoEnabled, false, 'nothing stored');
  const users = f.store.list('users').length;
  const created = await limited.as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'MTO everywhere', email: 'mto-everywhere@example.test', profileId: adminProfile, active: true, weldEnabled: false, mtoEnabled: true, mtoProfileId: adminProfile, password: 'Mto-Everywhere-1' } });
  assert.equal(created.status, 403, 'an account with MTO Pilot on all project sites');
  assert.equal(f.store.list('users').length, users, 'no account was created');
  assert.equal((await limited.as.request('/bootstrap', { pilot: 'mto' })).status, 403, 'still no MTO Pilot');
  // Editing an account enabled in MTO Pilot (it reaches more there than this administrator) is refused too.
  const mtoUser = f.account('MTO planner', { profileId: adminProfile, weldEnabled: false, mtoEnabled: true });
  const row = f.store.get('users', mtoUser.user.id);
  assert.equal((await limited.as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Planner', _version: row._version } })).status, 403);
  // An administrator of every main project in both pilots still does all of this.
  assert.equal((await f.admin.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'weld', data: { mtoEnabled: true, _version: self._version } })).status, 200);
  assert.equal((await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'MTO everywhere', email: 'mto-everywhere@example.test', profileId: adminProfile, active: true, weldEnabled: false, mtoEnabled: true, password: 'Mto-Everywhere-1' } })).status, 201);
});

test('sec1-002: an account never changes its own pilot profile; only an administrator of every main project in that pilot changes another\'s', async t => {
  const f = await fixture(t);
  const adminProfile = f.profile('Site admin', adminLevels);
  const review = f.profile('Only review', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  // Limited to North in Weld Pilot, all main projects in MTO Pilot.
  const limited = f.account('North admin', { profileId: adminProfile, weldProfileId: adminProfile, mtoProfileId: adminProfile, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await limited.login();
  const self = f.store.get('users', limited.user.id);
  for (const data of [{ weldProfileId: review }, { mtoProfileId: review }, { profileId: review }]) {
    const response = await limited.as.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'weld', data: { ...data, _version: self._version } });
    assert.equal(response.status, 403, `own ${JSON.stringify(data)}`);
  }
  const stored = f.store.get('users', self.id);
  assert.deepEqual([stored.weldProfileId, stored.mtoProfileId, stored.profileId, stored._version], [adminProfile, adminProfile, adminProfile, self._version], 'nothing stored');
  // Not even an administrator of every main project changes its own pilot profile.
  assert.equal((await f.admin.request(`/records/users/${f.adminRow.id}`, { method: 'PUT', pilot: 'weld', data: { weldProfileId: review, _version: f.store.get('users', f.adminRow.id)._version } })).status, 403);
  // Another account limited to North in Weld Pilot: the limited administrator may edit it, but not its Weld profile.
  const other = f.account('North welder', { profileId: review, weldProfileId: review, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoEnabled: false }, { weld: [NORTH] });
  const row = f.store.get('users', other.user.id);
  assert.equal((await limited.as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { weldProfileId: adminProfile, _version: row._version } })).status, 403, 'limited in Weld Pilot');
  assert.equal((await limited.as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { profileId: adminProfile, _version: row._version } })).status, 403, 'the profile behind every pilot');
  assert.equal(f.store.get('users', row.id).weldProfileId, review);
  // Unchanged values sent along with an ordinary edit are no change.
  assert.equal((await limited.as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Welder', weldProfileId: review, profileId: review, weldEnabled: true, mtoEnabled: false, _version: row._version } })).status, 200);
  // The administrator of every main project in Weld Pilot may.
  const next = f.store.get('users', row.id);
  assert.equal((await f.admin.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { weldProfileId: adminProfile, _version: next._version } })).status, 200);
  assert.equal(f.store.get('users', row.id).weldProfileId, adminProfile);
  // An administrator limited in Weld Pilot but reaching every main project in MTO Pilot may change an MTO profile there.
  const planner = f.account('MTO planner', { profileId: review, weldEnabled: false, mtoProfileId: review });
  const plannerRow = f.store.get('users', planner.user.id);
  assert.equal((await limited.as.request(`/records/users/${plannerRow.id}`, { method: 'PUT', pilot: 'weld', data: { mtoProfileId: adminProfile, _version: plannerRow._version } })).status, 200);
});

test('sec1-003: the ISO Book offers a part through the other pilot only for isometrics the account reads there, under that main project\'s profile', async t => {
  const f = await fixture(t);
  // Welding rights only in Weld Pilot (no certifications, no MTO report), all main projects; the full profile in MTO Pilot, North only.
  const base = { '4': ['show'], '5': ['show'], '63': ['show'], '64': ['show'], '37': ['show'], '42': ['show'], '44': ['show'], '68': ['show'], '85': ['show'], '87': ['show'], '76': ['show'], '86': ['show'] };
  const weldOnly = f.profile('Welding only', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(base) });
  const full = String(f.adminRow.profileId);
  const reader = f.account('Book reader', { profileId: weldOnly, weldProfileId: weldOnly, mtoProfileId: full, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  await reader.login();
  const parts = async (isoId: string) => { const response = await reader.as.request(`/iso-book/parts?isoIds=${isoId}`, { pilot: 'weld' }); assert.equal(response.status, 200, await response.clone().text()); return await json<BookPartsResponse>(response); };
  const available = (listing: BookPartsResponse, key: string) => listing.parts.find(part => part.key === key)!.available;
  const book = (isoId: string, part: string) => reader.as.request('/iso-book', { method: 'POST', pilot: 'weld', data: { isoIds: [isoId], parts: [part] } });
  // North: MTO Pilot reaches it, so the MTO documents are offered and delivered from Weld Pilot.
  const north = await parts('iso-1');
  assert.equal(available(north, 'certificate-index'), true); assert.equal(available(north, 'mto-report'), true);
  assert.equal((await book('iso-1', 'mto-report')).status, 200);
  // Riverside: outside the account's MTO Pilot access.
  const river = await parts('iso-4');
  assert.equal(available(river, 'certificate-index'), false, 'certificate index of a Riverside isometric');
  assert.equal(available(river, 'mto-report'), false, 'MTO report of a Riverside isometric');
  for (const part of ['certificate-index', 'mto-report']) assert.equal((await book('iso-4', part)).status, 422, part);
  // A project switched off for MTO Pilot: its isometrics are not read through MTO Pilot either.
  const project = f.store.get('projects', String(f.store.get('isometrics', 'iso-1').projectId));
  f.store.update('projects', project.id, { mtoPilot: false }, project._version, SYSTEM);
  const off = await parts('iso-1');
  assert.equal(available(off, 'certificate-index'), false); assert.equal(available(off, 'mto-report'), false);
  for (const part of ['certificate-index', 'mto-report']) assert.equal((await book('iso-1', part)).status, 422, part);
  // A profile per main project in MTO Pilot: North read with a profile without these documents is no way in either.
  f.store.update('projects', project.id, { mtoPilot: true }, f.store.get('projects', project.id)._version, SYSTEM);
  const user = f.store.get('users', reader.user.id);
  f.store.update('users', user.id, { mtoSiteProfiles: JSON.stringify({ [NORTH]: weldOnly }) }, user._version, SYSTEM);
  const perSite = await parts('iso-1');
  assert.equal(available(perSite, 'certificate-index'), false); assert.equal(available(perSite, 'mto-report'), false);
});
