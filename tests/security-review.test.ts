import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash, signInLimiter, SIGN_IN_ADDRESS_LIMIT, SIGN_IN_WINDOW_MS } from '../server/auth.ts';
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

test('sec1-004: the tracer proposal lists only welds of the account\'s main project, even where another main project has the same welder, WPS and ITP', async t => {
  const f = await fixture(t);
  const writer = f.profile('Weld writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const north = f.account('North inspector', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await north.login();
  // The same ITP code on a North and a Riverside isometric; welds of one welder and WPS on both.
  for (const id of ['iso-1', 'iso-4']) { const iso = f.store.get('isometrics', id); f.store.update('isometrics', id, { itpId: '', itp2Id: '', itpNo: 'ITP-SHARED' }, iso._version, SYSTEM); }
  const template = f.store.get('welds', 'weld-1');
  const welder = String(template.welder1Id || f.store.list('welders')[0].id);
  const weld = (isoId: string, weldNo: string) => f.store.create('welds', { isoId, weldNo, typeId: template.typeId, diameterId: template.diameterId, lengthMode: template.lengthMode, wpsId: template.wpsId, welder1Id: welder, date: '2026-03-02' }, SYSTEM);
  const source = weld('iso-1', 'TR-N1'); weld('iso-1', 'TR-N2');
  const riverIds = [weld('iso-4', 'TR-R1').id, weld('iso-4', 'TR-R2').id];
  type Proposal = { proposal: { sources: { source: { id: string; isoId: string }; candidates: { id: string; isoId: string }[] }[] } };
  const ask = (as: ReturnType<typeof f.client>) => as.request(`/tracer-proposal?weldId=${source.id}&pending=1`, { pilot: 'weld' });
  const all = await json<Proposal>(await ask(f.admin));
  assert.ok(all.proposal.sources.some(entry => entry.candidates.some(candidate => riverIds.includes(candidate.id))), 'the administrator of every main project gets the Riverside welds');
  const response = await ask(north.as); assert.equal(response.status, 200);
  const raw = await response.text(), limited = JSON.parse(raw) as Proposal;
  assert.ok(limited.proposal.sources.length > 0);
  for (const entry of limited.proposal.sources) {
    assert.ok(!['iso-4', 'iso-5', 'iso-6'].includes(entry.source.isoId), 'source weld of Riverside');
    for (const candidate of entry.candidates) assert.ok(!['iso-4', 'iso-5', 'iso-6'].includes(candidate.isoId), `candidate ${candidate.id} of Riverside`);
  }
  assert.ok(riverIds.every(id => !raw.includes(id)) && !raw.includes('TR-R1'));
});

test('sec1-005: Copy isometrics checks the add right of the copied parts with the profile of the main project', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const noWeldAdd = f.profile('North without weld add', { generalPermission: RW, materialsPermission: RW, weldingPermission: 'Read only' });
  // Weld Pilot limited to North, whose profile has no weld add right; the pilot profile has it.
  const limited = f.account('North copier', { profileId: writer, weldProfileId: writer, mtoProfileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteProfiles: JSON.stringify({ [NORTH]: noWeldAdd }) }, { weld: [NORTH] });
  await limited.login();
  const welds = f.store.list('welds').length, isos = f.store.list('isometrics').length;
  const projectId = f.store.get('isometrics', 'iso-1').projectId;
  const addNew = (pilot: string, isoNo: string, copyWelds = true) => limited.as.request('/actions/add-new-isometric', { method: 'POST', pilot, data: { isoId: 'iso-1', projectId, values: { isoNo }, copyWelds } });
  const bootstrap = await json<{ copyParts: { copyWelds: { allowed: boolean } } }>(await limited.as.request('/bootstrap', { pilot: 'weld' }));
  assert.equal(bootstrap.copyParts.copyWelds.allowed, false, 'the bootstrap says it cannot copy welds');
  assert.equal((await addNew('weld', 'SEC-005-W')).status, 403, 'from Weld Pilot');
  assert.equal((await addNew('mto', 'SEC-005-M')).status, 403, 'from MTO Pilot, where the account reaches every main project');
  assert.equal((await limited.as.request('/actions/copy-isometrics', { method: 'POST', pilot: 'weld', data: { isoIds: ['iso-1'], projectId: 'project-skid', copyWelds: true } })).status, 403, 'copy-isometrics');
  assert.deepEqual([f.store.list('welds').length, f.store.list('isometrics').length], [welds, isos], 'nothing was copied');
  // Without welds the isometric itself is copied.
  const plain = await addNew('weld', 'SEC-005-PLAIN', false);
  assert.equal(plain.status, 201, await plain.clone().text());
});

test('sec1-006: Add new and Copy isometrics never set completion, X Ray % or punch progress; a copy starts not completed', async t => {
  const f = await fixture(t);
  const source = f.store.get('isometrics', 'iso-1');
  f.store.update('isometrics', source.id, { prefabCompletedAt: '2026-02-01T10:00:00.000Z', prefabCompletedBy: 'Inspector A', fieldCompletedAt: '2026-02-02T10:00:00.000Z', fieldCompletedBy: 'Inspector B' }, source._version, SYSTEM);
  const completion = { prefabCompletedAt: '2026-01-01T00:00:00.000Z', prefabCompletedBy: 'Forged', fieldCompletedAt: '2026-01-01T00:00:00.000Z', fieldCompletedBy: 'Forged' };
  const addNew = (values: Record<string, unknown>) => f.admin.request('/actions/add-new-isometric', { method: 'POST', pilot: 'weld', data: { isoId: source.id, projectId: source.projectId, values } });
  const created = await addNew({ isoNo: 'SEC-006-A', ...completion });
  assert.equal(created.status, 201, await created.clone().text());
  const row = f.store.get('isometrics', (await json<{ records: Row[] }>(created)).records[0].id);
  for (const name of Object.keys(completion)) assert.equal(row[name] ?? '', '', `Add new stores no ${name}`);
  for (const values of [{ isoNo: 'SEC-006-X', xRay: '100' }, { isoNo: 'SEC-006-P', punchProgress: 'Finished' }]) {
    const count = f.store.list('isometrics').length;
    assert.equal((await addNew(values)).status, 422, JSON.stringify(values));
    assert.equal(f.store.list('isometrics').length, count, 'nothing stored');
  }
  const copied = await f.admin.request('/actions/copy-isometrics', { method: 'POST', pilot: 'weld', data: { isoIds: [source.id], projectId: 'project-skid' } });
  assert.equal(copied.status, 201, await copied.clone().text());
  const copy = f.store.get('isometrics', (await json<{ records: Row[] }>(copied)).records[0].id);
  for (const name of Object.keys(completion)) assert.equal(copy[name] ?? '', '', `the copy carries no ${name}`);
  assert.equal(copy.xRay ?? '', '', 'the copy has no linked ITP, so no X Ray %');
});

test('sec1-007: no typed IRN through bulk edit or a move into a main project with automatic IRN numbers', async t => {
  const f = await fixture(t);
  const filled = await f.admin.request('/actions/fill-irn', { method: 'POST', pilot: 'weld', data: { siteId: NORTH } });
  assert.equal(filled.status, 201, await filled.clone().text());
  const before = ['iso-1', 'iso-2'].map(id => f.store.get('isometrics', id).irn);
  const versions = (ids: string[]) => Object.fromEntries(ids.map(id => [id, f.store.get('isometrics', id)._version]));
  const bulk = await f.admin.request('/bulk/isometrics', { method: 'POST', pilot: 'weld', data: { ids: ['iso-1', 'iso-2'], changes: { irn: 'TYPED-0001' }, versions: versions(['iso-1', 'iso-2']) } });
  assert.equal(bulk.status, 422, `bulk IRN on isometrics of a main project with automatic numbers: ${await bulk.clone().text()}`);
  assert.deepEqual(['iso-1', 'iso-2'].map(id => f.store.get('isometrics', id).irn), before);
  const river = f.store.get('isometrics', 'iso-4');
  const moved = await f.admin.request('/records/isometrics/iso-4', { method: 'PUT', pilot: 'weld', data: { projectId: f.store.get('isometrics', 'iso-1').projectId, irn: 'TYPED-0002', _version: river._version } });
  assert.equal(moved.status, 422, 'a move into that main project with a typed IRN');
  assert.equal(f.store.get('isometrics', 'iso-4').projectId, river.projectId);
  // Riverside numbers by hand: a typed IRN there stays fine.
  const typed = await f.admin.request('/bulk/isometrics', { method: 'POST', pilot: 'weld', data: { ids: ['iso-5'], changes: { irn: 'RIV-TYPED-1' }, versions: versions(['iso-5']) } });
  assert.equal(typed.status, 200, await typed.clone().text());
});

test('sec1-008: ITP X-Ray sync and Import from isometrics touch only isometrics the request reaches', async t => {
  const f = await fixture(t);
  const writer = f.profile('Weld writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const north = f.account('North planner', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await north.login();
  // itp-01 is linked in North (sample) and, here, on a Riverside isometric too.
  const river = f.store.get('isometrics', 'iso-4');
  if (f.store.list('itp_projects').some(link => link.itpId === 'itp-01')) f.store.create('itp_projects', { itpId: 'itp-01', projectId: river.projectId }, SYSTEM);
  f.store.update('isometrics', river.id, { itpId: 'itp-01', xRay: '10' }, river._version, SYSTEM);
  const itp = f.store.get('itps', 'itp-01');
  const edited = await north.as.request('/records/itps/itp-01', { method: 'PUT', pilot: 'weld', data: { ndtPercent: 35, _version: itp._version } });
  assert.equal(edited.status, 200, await edited.clone().text());
  assert.ok(!(await edited.text()).includes('iso-4'), 'no Riverside isometric in the answer');
  assert.equal(f.store.get('isometrics', 'iso-1').xRay, '35', 'its own isometric follows');
  assert.equal(f.store.get('isometrics', 'iso-4').xRay, '10', 'the Riverside isometric is left for a later sync');
  // Import: an unregistered number on a Riverside isometric neither fails the import nor becomes an ITP.
  for (const [id, number] of [['iso-4', 'ITP-RIVER-9'], ['iso-2', 'ITP-NORTH-9']]) { const iso = f.store.get('isometrics', id); f.store.update('isometrics', id, { itpId: '', itpNo: number }, iso._version, SYSTEM); }
  const imported = await north.as.request('/itps/import-from-isometrics', { method: 'POST', pilot: 'weld', data: {} });
  assert.equal(imported.status, 201, await imported.clone().text());
  const numbers = f.store.list('itps').map(row => row.number);
  assert.ok(numbers.includes('ITP-NORTH-9') && !numbers.includes('ITP-RIVER-9'), numbers.join(', '));
  assert.equal(f.store.get('isometrics', 'iso-4').itpId ?? '', '');
});

test('sec1-009: a duplicate name of a record of another main project is refused without repeating the value', async t => {
  const f = await fixture(t);
  const writer = f.profile('Weld writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const north = f.account('North welder data', { profileId: writer, weldSiteScope: SITE_SCOPE_SPECIFIC }, { weld: [NORTH] });
  await north.login();
  f.store.create('welding_wires', { name: 'RIVER-WIRE-77', siteId: RIVER }, SYSTEM);
  const response = await north.as.request('/records/welding_wires', { method: 'POST', pilot: 'weld', data: { name: 'RIVER-WIRE-77', siteId: NORTH } });
  const body = await json<{ error: string; fields?: Record<string, string> }>(response);
  assert.equal(response.status, 409, body.error);
  assert.ok(!body.error.includes('RIVER-WIRE-77') && !/exists/.test(body.error), body.error);
  assert.match(body.error, /already in use/);
  assert.ok(body.fields?.name);
  assert.equal(f.store.list('welding_wires').filter(row => row.name === 'RIVER-WIRE-77').length, 1);
});

test('sec1-010: the sign-in limit counts per account; another account\'s sign-in neither clears nor shares it', async t => {
  const f = await fixture(t);
  const x = f.account('Account X', { profileId: String(f.adminRow.profileId) }), y = f.account('Account Y', { profileId: String(f.adminRow.profileId) });
  const attacker = f.client();
  const signIn = (email: unknown, password: string) => attacker.request('/auth/login', { method: 'POST', data: { email, password } });
  for (let i = 0; i < 8; i++) assert.equal((await signIn(x.user.email, 'Wrong-Password-1')).status, 401, `attempt ${i + 1}`);
  // Y signs in from the same address: not blocked by X's failures, and its sign-in does not clear X's count.
  assert.equal((await signIn(y.user.email, PASSWORD)).status, 200);
  const blocked = await signIn(String(x.user.email).toUpperCase(), 'Wrong-Password-1');
  assert.equal(blocked.status, 429);
  assert.equal((await json(blocked)).error, 'Too many sign-in attempts. Try again in a few minutes.');
  assert.equal((await signIn(x.user.email, PASSWORD)).status, 429, 'even with the right password while the limit holds');
  assert.equal((await f.client().request('/auth/login', { method: 'POST', data: { email: y.user.email, password: PASSWORD } })).status, 200);
  // The address count: spraying many accounts from one address holds that address only, and expires.
  let clock = 0; const limiter = signInLimiter(() => clock);
  for (let i = 0; i < SIGN_IN_ADDRESS_LIMIT; i++) limiter.failed('10.0.0.1', `user-${i}@example.test`);
  assert.throws(() => limiter.check('10.0.0.1', 'fresh@example.test'), /Too many sign-in attempts/);
  assert.doesNotThrow(() => limiter.check('10.0.0.2', 'fresh@example.test'));
  limiter.succeeded('user-1@example.test');
  assert.throws(() => limiter.check('10.0.0.1', 'fresh@example.test'), 'a sign-in does not clear the address');
  clock += SIGN_IN_WINDOW_MS + 1;
  assert.doesNotThrow(() => limiter.check('10.0.0.1', 'fresh@example.test'));
});
