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
  const created = await limited.as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Shadow admin', email: 'shadow@example.test', profileId: adminProfile, active: true, weldEnabled: true, weldProfileId: adminProfile, mtoEnabled: true, mtoProfileId: adminProfile, password: 'Shadow-Password-1' } });
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

test('hydrotest result of a test system cannot complete isometrics of a main project outside the account\'s access', async t => {
  const f = await fixture(t);
  const writer = f.profile('Test writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const north = f.account('North tester', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  // A test system holding one spool of each main project (spools of several projects may share a system).
  const system = f.store.create('test_systems', { name: 'SHARED-01' }, SYSTEM);
  for (const id of ['spool-1', 'spool-4']) { const spool = f.store.get('spools', id); f.store.update('spools', id, { testSystemId: system.id }, spool._version, SYSTEM); }
  await north.login();
  const rows = () => ({ test_systems: f.store.list('test_systems'), spools: f.store.list('spools'), hydrotest_results: f.store.list('hydrotest_results'), hydrotest_requests: f.store.list('hydrotest_requests'), releases: f.store.list('releases') }) as Record<string, Row[]>;
  const response = await north.as.request('/actions/hydrotest-result', { method: 'POST', pilot: 'weld', data: { testSystemId: system.id, accepted: true } });
  assert.equal(response.status, 403, await response.clone().text());
  assert.equal(hydrotestState(f.store.get('isometrics', 'iso-4'), rows()).completed, false, 'Riverside isometric stays open');
  assert.equal(f.store.list('hydrotest_results').filter(row => row.testSystemId === system.id).length, 0, 'the refused result changed nothing');
  const shared = f.store.get('test_systems', system.id);
  assert.equal((await north.as.request(`/records/test_systems/${system.id}`, { method: 'PUT', pilot: 'weld', data: { accepted: 'Approved', _version: shared._version } })).status, 403);
  assert.equal((await north.as.request('/actions/hydrotest-release', { method: 'POST', pilot: 'weld', data: { testSystemId: system.id } })).status, 403);
  assert.equal(f.store.get('test_systems', system.id)._version, shared._version);
  // A test system holding only the account's own spools still takes its result.
  const spool4 = f.store.get('spools', 'spool-4'); f.store.update('spools', 'spool-4', { testSystemId: '' }, spool4._version, SYSTEM);
  // The approval needs the signed document first (a result without Accepted? carries it).
  const draft = f.store.create('hydrotest_results', { testSystemId: system.id, accepted: false }, SYSTEM);
  f.store.create('attachments', { name: 'signed.pdf', entityType: 'hydrotest_results', entityId: draft.id, documentType: 'Hydrotest result' }, SYSTEM);
  const own = await north.as.request('/actions/hydrotest-result', { method: 'POST', pilot: 'weld', data: { testSystemId: system.id, accepted: true } });
  assert.equal(own.status, 201, await own.clone().text());
  assert.equal(hydrotestState(f.store.get('isometrics', 'iso-1'), rows()).completed, true);
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

// Follow-up of the review of 2026-11-16 (QA-FINDINGS.md, findings 1–3).
const detailed = (rules: Record<string, string[]>) => ({ permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules) });
type Summaries = { isoSummaries: Record<string, { testSystemName?: string }> };

test('the summary never names another project\'s test system (test systems may hold spools of several projects)', async t => {
  const f = await fixture(t);
  const river = f.store.create('test_systems', { name: 'RIVER-TS-07', projectId: 'project-steam', medium: 'Water', pressure: '10 bar' }, SYSTEM);
  const shared = f.store.create('test_systems', { name: 'SHARED-TS-01', medium: 'Water', pressure: '10 bar' }, SYSTEM);
  // The Hydrotest release assigns an isometric's test system; the record form no longer takes it (iso-shared-031), so the test assigns it as that release does.
  const put = async (id: string, data: Record<string, unknown>) => { f.store.update('isometrics', id, data, f.store.get('isometrics', id)._version, SYSTEM); return { status: 200 }; };
  // 1. Test systems are composed at spool level and mix projects (reference PTC 01 holds spools of two projects): no
  //    same-project rule on isometrics or on the test system any more (lead decision, weld-releases-027).
  assert.equal((await put('iso-1', { testSystemId: shared.id })).status, 200);
  assert.equal((await put('iso-1', { testSystemId: 'test-cw', pipingClass: 'CS300' })).status, 200);
  assert.equal((await put('iso-4', { testSystemId: river.id })).status, 200);
  const system = f.store.get('test_systems', 'test-cw');
  assert.equal((await f.admin.request('/records/test_systems/test-cw', { method: 'PUT', pilot: 'weld', data: { description: 'Edited', _version: system._version } })).status, 200);
  // 3. Older data may still hold such a link (written here below the rules): its name is not shown to anyone.
  f.store.db.prepare("UPDATE isometrics SET data=json_set(data,'$.testSystemId',?) WHERE id='iso-2'").run(river.id);
  const reader = f.profile('MTO reader', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  const north = f.account('North MTO reader', { profileId: reader, weldEnabled: false, mtoSiteScope: SITE_SCOPE_SPECIFIC }, { mto: [NORTH] });
  await north.login();
  const raw = await (await north.as.request('/bootstrap', { pilot: 'mto' })).text(), body = JSON.parse(raw) as Summaries;
  assert.equal(body.isoSummaries['iso-1'].testSystemName, 'CW-01', 'a test system of the isometric\'s own project is named');
  assert.equal(body.isoSummaries['iso-2'].testSystemName, undefined, 'a test system of another project is not');
  assert.ok(!raw.includes('RIVER-TS-07'), 'the other main project\'s test system name never appears');
  const all = await (await f.admin.request('/bootstrap', { pilot: 'mto' })).json() as Summaries;
  assert.equal(all.isoSummaries['iso-2'].testSystemName, undefined);
  assert.equal(all.isoSummaries['iso-4'].testSystemName, 'RIVER-TS-07', 'its own isometric still carries the name');
  // A shared test system is named on every isometric in it.
  assert.equal((await put('iso-3', { testSystemId: shared.id })).status, 200);
  assert.equal((await (await north.as.request('/bootstrap', { pilot: 'mto' })).json() as Summaries).isoSummaries['iso-3'].testSystemName, 'SHARED-TS-01');
});

test('a link can only be added to a record the account may read: a WPS editor without PQR rights cannot link a PQR by id', async t => {
  const f = await fixture(t);
  const pqr = f.store.create('pqr', { name: 'PQR-LINK-REVIEW' }, SYSTEM);
  const wps = f.store.create('wps', { name: 'WPS-LINK-REVIEW', method: '141', definition: 'Link review', allProjects: true, siteIds: [NORTH, RIVER] }, SYSTEM);
  const links = (id: string) => f.store.list('wps_pqr').filter(row => row.wpsId === id).map(row => row.pqrId);
  const WPS_ONLY = { '4': ['show'], '5': ['show'], '42': ['show', 'insert', 'edit'] };
  const editor = f.account('WPS editor', { profileId: f.profile('WPS only', detailed(WPS_ONLY)) });
  await editor.login();
  assert.equal((await editor.as.request('/records/pqr', { pilot: 'weld' })).status, 403, 'the profile does not read PQRs');
  const put = (who: typeof editor, data: Record<string, unknown>) => who.as.request(`/records/wps/${wps.id}`, { method: 'PUT', pilot: 'weld', data: { ...data, _version: f.store.get('wps', wps.id)._version } });
  // New link by id on a new WPS, on an existing one, and through the primary PQR field.
  const before = f.store.list('wps').length;
  const created = await editor.as.request('/records/wps', { method: 'POST', pilot: 'weld', data: { name: 'WPS-FORGED', siteId: NORTH, method: '141', definition: 'Forged link', allProjects: true, pqrIds: [pqr.id] } });
  assert.equal(created.status, 403, await created.clone().text());
  assert.equal(f.store.list('wps').length, before, 'nothing was created');
  assert.equal((await put(editor, { pqrIds: [pqr.id] })).status, 403);
  assert.equal((await put(editor, { pqrId: pqr.id })).status, 403);
  assert.deepEqual(links(wps.id), []);
  // The WPS itself stays editable, with or without an empty list.
  assert.equal((await put(editor, { definition: 'Edited without links', pqrIds: [] })).status, 200);
  // A link that is already there may stay (the form sends the list back) or be removed.
  const current = f.store.get('wps', wps.id); f.store.update('wps', wps.id, { pqrIds: [pqr.id] }, current._version, SYSTEM);
  assert.equal((await put(editor, { jointType: 'BW', pqrIds: [pqr.id] })).status, 200);
  assert.deepEqual(links(wps.id), [pqr.id]);
  assert.equal((await put(editor, { pqrIds: [] })).status, 200);
  assert.deepEqual(links(wps.id), []);
  // With view access to PQRs the same request links it.
  const reader = f.account('WPS and PQR', { profileId: f.profile('WPS with PQR view', detailed({ ...WPS_ONLY, '98': ['show'] })) });
  await reader.login();
  const linked = await put(reader, { pqrIds: [pqr.id] });
  assert.equal(linked.status, 200, await linked.clone().text());
  assert.deepEqual(links(wps.id), [pqr.id]);
});

test('typing a new attribute value while editing a PQR needs the add right on PQR, not only edit', async t => {
  const f = await fixture(t);
  const options = () => f.store.list('qualification_options').length;
  const known = f.store.create('qualification_options', { name: 'Known position', category: 'Position' }, SYSTEM);
  const pqr = f.store.create('pqr', { name: 'PQR-VALUE-REVIEW' }, SYSTEM);
  const put = (who: { as: ReturnType<typeof f.client> }, data: Record<string, unknown>) => who.as.request(`/records/pqr/${pqr.id}`, { method: 'PUT', pilot: 'weld', data: { ...data, _version: f.store.get('pqr', pqr.id)._version } });
  const editor = f.account('PQR editor', { profileId: f.profile('PQR edit only', detailed({ '4': ['show'], '5': ['show'], '98': ['show', 'edit'] })) });
  await editor.login();
  const before = options();
  const refused = await put(editor, { attribute9Id: 'Brand new position' });
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.ok((await refused.json()).fields.attribute9Id, 'the refusal names the field');
  assert.equal(options(), before, 'no value was added');
  assert.equal(f.store.get('pqr', pqr.id).attribute9Id, '');
  // Existing values, by name or by id, are still chosen with the edit right alone.
  assert.equal((await put(editor, { attribute9Id: 'Known position' })).status, 200);
  assert.equal(f.store.get('pqr', pqr.id).attribute9Id, known.id);
  assert.equal((await put(editor, { attribute9Id: known.id, attribute4Id: '' })).status, 200);
  assert.equal(options(), before);
  // With the add right the new value is created and stored.
  const adder = f.account('PQR adder', { profileId: f.profile('PQR edit and add', detailed({ '4': ['show'], '5': ['show'], '98': ['show', 'insert', 'edit'] })) });
  await adder.login();
  const added = await put(adder, { attribute9Id: 'Brand new position' });
  assert.equal(added.status, 200, await added.clone().text());
  assert.equal(options(), before + 1);
  // Module-level profiles (Read & write) keep adding values as before.
  const writer = f.account('Weld writer', { profileId: f.profile('Weld writer', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' }) });
  await writer.login();
  assert.equal((await put(writer, { attribute12Id: 'V-groove 60°' })).status, 200);
  assert.equal(options(), before + 2);
});
