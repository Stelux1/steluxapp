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
import { hydrotestState } from '../shared/hydrotest.ts';
import type { Row } from '../shared/types.ts';

// Release review regressions (QA-FINDINGS.md "Release review"): access per project site must bound administrators
// and actions whose effect reaches records through a shared (projectless) record.
const PASSWORD = 'Release-Review-Password';
const NORTH = 'site-north', RIVER = 'site-river';
type Options = { method?: string; pilot?: string; data?: unknown };

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-release-review-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data }: Options = {}) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string, password = PASSWORD) => request('/auth/login', { method: 'POST', data: { email, password } });
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, toolsPermission: 'No access', settingsPermission: 'No access', ...levels }).id;
  const account = (name: string, data: Record<string, unknown>, sites: Partial<Record<'weld' | 'mto', string[]>> = {}) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    for (const [pilot, ids] of Object.entries(sites)) for (const siteId of ids!) store.create(USER_SITES, { userId: user.id, pilot, siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client();
    return { user, as, login: async () => { const response = await as.login(String(user.email)); assert.equal(response.status, 200); } };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Review admin', email: 'review-admin@example.test', password: PASSWORD } })).status, 201);
  return { store, admin, client, profile, account };
}

test('a limited administrator cannot reach main projects beyond its own through accounts (new accounts, passwords, site links)', async t => {
  const f = await fixture(t);
  const ADMIN = 'Administration';
  const adminProfile = f.profile('Site admin', { generalPermission: ADMIN, materialsPermission: ADMIN, weldingPermission: ADMIN, settingsPermission: ADMIN });
  const limited = f.account('North admin', { profileId: adminProfile, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await limited.login();
  const before = f.store.list('users').length;
  // 1. A new account without scope fields would reach every main project.
  const created = await limited.as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Shadow admin', email: 'shadow@example.test', profileId: adminProfile, active: true, password: 'Shadow-Password-1' } });
  assert.equal(created.status, 403, 'new unlimited account');
  assert.equal(f.store.list('users').length, before);
  // 2. Resetting the password of the unlimited administrator would hand over its access.
  const top = f.store.list('users').find(user => user.email === 'review-admin@example.test')!;
  const reset = await limited.as.request(`/records/users/${top.id}`, { method: 'PUT', pilot: 'weld', data: { password: 'Taken-Over-Password-1', _version: top._version } });
  assert.equal(reset.status, 403, 'password of an account that reaches more main projects');
  assert.equal((await f.client().login('review-admin@example.test', 'Taken-Over-Password-1')).status, 401);
  // 3. Site links written directly would widen access (own MTO access here) without the user form's rule.
  const link = await limited.as.request(`/records/${USER_SITES}`, { method: 'POST', pilot: 'weld', data: { userId: limited.user.id, pilot: 'mto', siteId: NORTH } });
  assert.equal(link.status, 405, 'direct site link');
  const own = f.store.list(USER_SITES).find(row => row.userId === limited.user.id)!;
  const flipped = await limited.as.request(`/records/${USER_SITES}/${own.id}`, { method: 'PUT', pilot: 'weld', data: { pilot: 'mto', _version: own._version } });
  assert.equal(flipped.status, 405, 'moving a site link to the other pilot');
  assert.deepEqual(f.store.list(USER_SITES).filter(row => row.userId === limited.user.id).map(row => `${row.pilot}:${row.siteId}`), [`weld:${NORTH}`]);
  // Still allowed: an account limited within the administrator's own main projects.
  const reviewer = f.profile('Reviewer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const inside = f.account('North fitter', { profileId: reviewer, weldSiteScope: SITE_SCOPE_SPECIFIC, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  const row = f.store.get('users', inside.user.id);
  assert.equal((await limited.as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Lead fitter', password: 'Fitter-Password-22', _version: row._version } })).status, 200);
  // The unlimited administrator keeps managing every account.
  const fitter = f.store.get('users', inside.user.id);
  assert.equal((await f.admin.request(`/records/users/${fitter.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Supervisor', _version: fitter._version } })).status, 200);
});

test('hydrotest result of a shared test system cannot complete isometrics of a main project outside the account\'s access', async t => {
  const f = await fixture(t);
  const writer = f.profile('Test writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const north = f.account('North tester', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  // A test system without a project (shared), holding one isometric of each main project.
  const system = f.store.create('test_systems', { name: 'SHARED-01', medium: 'Water', pressure: '10 bar' }, SYSTEM);
  for (const id of ['iso-1', 'iso-4']) { const iso = f.store.get('isometrics', id); f.store.update('isometrics', id, { testSystemId: system.id }, iso._version, SYSTEM); }
  const request = f.store.create('hydrotest_requests', { testSystemId: system.id, recordNo: 'HTR-SHARED-01', date: '2026-11-10', includeIsometrics: true }, SYSTEM);
  await north.login();
  const response = await north.as.request('/actions/hydrotest-result', { method: 'POST', pilot: 'weld', data: { requestId: request.id, result: 'Passed', actualPressure: '10.2 bar', date: '2026-11-12' } });
  assert.equal(response.status, 403, await response.clone().text());
  const rows = { test_systems: f.store.list('test_systems'), hydrotest_requests: f.store.list('hydrotest_requests'), releases: f.store.list('releases') } as Record<string, Row[]>;
  assert.equal(hydrotestState(f.store.get('isometrics', 'iso-4'), rows).completed, false, 'Riverside isometric stays open');
  // The record routes are covered the same way: a passed request created directly, the system's acceptance, archiving.
  const created = await north.as.request('/records/hydrotest_requests', { method: 'POST', pilot: 'weld', data: { testSystemId: system.id, recordNo: 'HTR-SHARED-02', date: '2026-11-12', result: 'Passed', actualPressure: '10 bar' } });
  assert.equal(created.status, 403, await created.clone().text());
  const shared = f.store.get('test_systems', system.id);
  assert.equal((await north.as.request(`/records/test_systems/${system.id}`, { method: 'PUT', pilot: 'weld', data: { accepted: 'Testing not applicable', _version: shared._version } })).status, 403);
  assert.equal((await north.as.request(`/records/hydrotest_requests/${request.id}/archive`, { method: 'POST', pilot: 'weld', data: { _version: f.store.get('hydrotest_requests', request.id)._version } })).status, 403);
  assert.equal(f.store.get('test_systems', system.id)._version, shared._version);
  // A shared test system holding only the account's own isometrics still takes its result.
  const iso4 = f.store.get('isometrics', 'iso-4'); f.store.update('isometrics', 'iso-4', { testSystemId: '' }, iso4._version, SYSTEM);
  const fresh = f.store.get('hydrotest_requests', request.id);
  assert.equal(fresh.result, '', 'the refused result changed nothing');
  const own = await north.as.request('/actions/hydrotest-result', { method: 'POST', pilot: 'weld', data: { requestId: request.id, result: 'Passed', actualPressure: '10.2 bar', date: '2026-11-12' } });
  assert.equal(own.status, 201, await own.clone().text());
});

test('a release can only carry the releasing account\'s own signature (its image is printed on the release document)', async t => {
  const f = await fixture(t);
  const writer = f.profile('Release writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const releaser = f.account('Releasing engineer', { profileId: writer });
  const other = f.account('Signing manager', { profileId: writer });
  const foreign = f.store.create('signatures', { name: 'Manager', userId: other.user.id, kind: 'Full signature' }, SYSTEM);
  const own = f.store.create('signatures', { name: 'Engineer', userId: releaser.user.id, kind: 'Full signature' }, SYSTEM);
  await releaser.login();
  const before = f.store.list('releases').length;
  const forged = await releaser.as.request('/actions/release', { method: 'POST', pilot: 'weld', data: { type: 'Hydrotest', isoIds: ['iso-1'], reportNo: 'HT-REVIEW-1', signatureId: foreign.id } });
  assert.equal(forged.status, 403, await forged.clone().text());
  assert.equal(f.store.list('releases').length, before, 'nothing was released');
  const signed = await releaser.as.request('/actions/release', { method: 'POST', pilot: 'weld', data: { type: 'Hydrotest', isoIds: ['iso-1'], reportNo: 'HT-REVIEW-2', signatureId: own.id } });
  assert.equal(signed.status, 201, await signed.clone().text());
});
