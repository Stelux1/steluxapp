import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed, seedAccessSamples } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash, publicUser } from '../server/auth.ts';
import { documentStorage } from '../server/documents.ts';
import { currentSignature } from '../server/signatures.ts';
import { releaseAccess } from '../server/release-access.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { areaPilots, canResource, isAdministrator, pilotBoundary } from '../shared/permissions.ts';
import { allowedPilots } from '../shared/pilots.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { projectResource } from '../shared/release.ts';
import type { Row, User } from '../shared/types.ts';

const PASSWORD = 'Access-Test-Password';
const RW = 'Read & write', RO = 'Read only', NONE = 'No access', ADMIN = 'Administration';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);

type Options = { method?: string; pilot?: string; data?: unknown; headers?: Record<string, string> };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-access-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  /** One browser: its own session cookie. */
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data, headers = {} }: Options = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string, password = PASSWORD) => { const response = await request('/auth/login', { method: 'POST', data: { email, password } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, settingsPermission: NONE, toolsPermission: NONE, ...levels }).id;
  const account = (name: string, data: Record<string, unknown>) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return { ...user, email: String(user.email), name: String(user.name) };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Access admin', email: 'access-admin@example.test', password: PASSWORD } })).status, 201);
  const upload = async (as: ReturnType<typeof client>, pilot: string, entityType: string, entityId: string, content: Uint8Array | string, name: string, type: string) => {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); body.set('file', new Blob([content as BlobPart], { type }), name);
    return as.request('/files', { method: 'POST', pilot, data: body });
  };
  return { store, dir, client, admin, profile, account, upload };
}
const status = async (response: Response) => response.status;
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;

/** Every request kind of the task, for one pilot. `ok` is the status of an allowed request. */
async function requestKinds(as: { request: (path: string, options?: Options) => Promise<Response> }, store: Store, pilot: string, kind: 'weld' | 'mto', fileId: string) {
  const iso = store.get('isometrics', 'iso-1');
  const weldKinds = {
    bootstrap: () => as.request('/bootstrap', { pilot }),
    read: () => as.request('/records/welds', { pilot }),
    write: () => { const weld = store.get('welds', 'weld-1'); return as.request(`/records/welds/${weld.id}`, { method: 'PUT', pilot, data: { description: `Edited in ${pilot}`, _version: weld._version } }); },
    bulk: () => as.request('/bulk/isometrics', { method: 'POST', pilot, data: { ids: [iso.id], changes: { area: `Bulk ${pilot}` }, versions: { [iso.id]: store.get('isometrics', iso.id)._version } } }),
    action: () => as.request('/actions/phases', { method: 'POST', pilot, data: { isoIds: [iso.id], field_test: 'Complete' } }),
    report: () => as.request('/reports/lisl', { pilot }),
    export: () => as.request('/export/welds?format=csv', { pilot }),
    file: () => as.request(`/files/${fileId}`, { pilot }),
    history: () => as.request(`/history/welds/weld-1`, { pilot }),
  };
  const mtoKinds = {
    bootstrap: () => as.request('/bootstrap', { pilot }),
    read: () => as.request('/records/iso_materials', { pilot }),
    write: () => { const row = store.list('iso_materials')[0]; return as.request(`/records/iso_materials/${row.id}`, { method: 'PUT', pilot, data: { chargeNo: `CH-${pilot}`, _version: row._version } }); },
    bulk: () => as.request('/bulk/isometrics', { method: 'POST', pilot, data: { ids: [iso.id], changes: { area: `Bulk ${pilot}` }, versions: { [iso.id]: store.get('isometrics', iso.id)._version } } }),
    action: () => as.request('/actions/add-iso-material', { method: 'POST', pilot, data: { isoId: iso.id, source: 'Custom', materialNo: `ACCESS-${pilot}`, description: 'Access test pipe', quantity: 1, uom: 'M' } }),
    report: () => as.request('/reports/mto', { pilot }),
    export: () => as.request('/export/iso_materials?format=csv', { pilot }),
    file: () => as.request(`/files/${fileId}`, { pilot }),
    history: () => as.request(`/history/iso_materials/${store.list('iso_materials')[0].id}`, { pilot }),
  };
  return kind === 'weld' ? weldKinds : mtoKinds;
}

test('the pilot boundary and the pilot list follow the per-pilot flags; areas show their pilots', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual(areaPilots('63'), ['weld']); assert.deepEqual(areaPilots('70'), ['mto']); assert.deepEqual(areaPilots('64'), ['weld', 'mto']);
  assert.deepEqual(areaPilots('18'), ['weld', 'mto']); assert.deepEqual(areaPilots('26'), ['weld', 'mto']); assert.deepEqual(areaPilots('61'), []);
  const base: User = { id: 'u', name: 'U', email: 'u@example.test', profileId: 'p', availability: hosted, permissions: { general: 2, materials: 2, welding: 2, tools: 0, settings: 0 } };
  const weld = pilotBoundary(base, 'weld'), mto = pilotBoundary(base, 'mto');
  assert.equal(weld.permissions.materials, 0); assert.equal(weld.pilot, 'weld'); assert.ok(canResource(weld, 'welds')); assert.equal(canResource(weld, 'iso_materials'), false);
  assert.ok(canResource(weld, 'certifications', 'edit'), 'shared catalog follows the weld profile');
  assert.equal(mto.permissions.welding, 0); assert.equal(canResource(mto, 'welds'), false); assert.ok(canResource(mto, 'iso_materials', 'edit'));
  const detailed = pilotBoundary({ ...base, capabilities: { '63': ['show'], '70': ['show'], '18': ['show'], '64': ['show'] } }, 'weld');
  assert.deepEqual(Object.keys(detailed.capabilities!).sort(), ['18', '63', '64']);
  // The server's list decides; without it the module levels of the single profile decide (unchanged).
  assert.deepEqual(allowedPilots({ ...base, pilots: ['mto'] }).map(p => p.key), ['mto']);
  assert.deepEqual(allowedPilots(base).map(p => p.key), ['weld', 'mto']);
  // Hosted users and profiles: administrators only; non-pilot profiles keep the module rule.
  assert.equal(canResource({ ...base, permissions: { ...base.permissions, settings: 1 } }, 'users'), false);
  assert.ok(canResource({ ...base, permissions: { ...base.permissions, settings: 3 } }, 'users', 'edit'));
  assert.ok(isAdministrator({ ...base, capabilities: { '26': ['show', 'insert', 'edit'], '53': ['show', 'insert', 'edit'] } }));
  assert.equal(isAdministrator({ ...base, capabilities: { '26': ['show'], '53': ['show', 'insert', 'edit'] } }), false);
  const { availability: _, ...internal } = base;
  assert.ok(canResource({ ...internal, permissions: { ...base.permissions, settings: 1 } }, 'users'));
  // The user form shows the access section only where pilots are delivered.
  const hostedUsers = projectResource(hosted, RESOURCE_MAP.users);
  assert.deepEqual(hostedUsers.columns, ['email', 'name', 'title', 'companyId', 'phone', 'weldEnabled', 'mtoEnabled', 'active']);
  assert.ok(hostedUsers.fields.filter(f => ['weldEnabled', 'weldProfileId', 'mtoEnabled', 'mtoProfileId', 'title', 'companyId'].includes(f.name)).every(f => !f.hidden));
  assert.ok(RESOURCE_MAP.users.fields.filter(f => ['weldEnabled', 'weldProfileId', 'mtoEnabled', 'mtoProfileId', 'title', 'address', 'phone', 'companyId'].includes(f.name)).every(f => f.hidden), 'hidden outside pilots');
  assert.deepEqual(RESOURCE_MAP.users.columns, ['name', 'email', 'profileId', 'active']);
});

test('a legacy account keeps one profile in both pilots; within each pilot the other pilot\'s records stay refused', async t => {
  const f = await fixture(t);
  const legacy = f.account('Legacy writer', { profileId: f.profile('Legacy profile', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }) });
  // A record saved before access per pilot: none of the new fields stored.
  f.store.db.prepare(`UPDATE users SET data=json_remove(data,'$.weldEnabled','$.mtoEnabled','$.weldProfileId','$.mtoProfileId') WHERE id=?`).run(legacy.id);
  const as = f.client(); const user = await as.login(legacy.email);
  assert.deepEqual(user.pilots, ['weld', 'mto']); assert.deepEqual(allowedPilots(user).map(p => p.key), ['weld', 'mto']);
  const weld = await json<{ user: User; rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot: 'weld' }));
  const mto = await json<{ user: User; rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot: 'mto' }));
  assert.equal(weld.user.pilot, 'weld'); assert.equal(mto.user.pilot, 'mto');
  assert.deepEqual([weld.user.permissions.general, weld.user.permissions.welding, mto.user.permissions.general, mto.user.permissions.materials], [2, 2, 2, 2]);
  assert.ok(weld.rows.welds.length && weld.rows.isometrics.length && !weld.rows.iso_materials);
  assert.ok(mto.rows.iso_materials.length && mto.rows.isometrics.length && !mto.rows.welds);
  for (const pilot of ['weld', 'mto']) { const iso = f.store.get('isometrics', 'iso-2'); assert.equal(await status(await as.request(`/records/isometrics/${iso.id}`, { method: 'PUT', pilot, data: { description: `Legacy ${pilot}`, _version: iso._version } })), 200, pilot); }
  assert.equal(await status(await as.request('/records/iso_materials', { pilot: 'weld' })), 403);
  assert.equal(await status(await as.request('/records/welds', { pilot: 'mto' })), 403);
  // Saving the account in the user editor stores the defaults and keeps it the same.
  const row = f.store.get('users', legacy.id); assert.equal(row.weldEnabled, undefined);
  const saved = await f.admin.request(`/records/users/${legacy.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Welding coordinator', _version: row._version } });
  assert.equal(saved.status, 200); const record = (await json<{ record: Row }>(saved)).record;
  assert.deepEqual([record.weldEnabled, record.mtoEnabled, record.weldProfileId, record.mtoProfileId], [true, true, '', '']);
  assert.deepEqual((await as.login(legacy.email)).pilots, ['weld', 'mto']);
});

test('weld-only, MTO-only and different-profile accounts: every request kind is allowed in the right pilot and refused in the other', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const viewer = f.profile('Viewer read only', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO });
  const weldOnly = f.account('Weld only', { profileId: viewer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: viewer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const isoFile = await f.upload(f.admin, 'weld', 'isometrics', 'iso-1', 'Isometric note', 'iso-note.txt', 'text/plain'); assert.equal(isoFile.status, 201);
  const fileId = (await json<{ record: Row }>(isoFile)).record.id;
  for (const [user, own, other] of [[weldOnly, 'weld', 'mto'], [mtoOnly, 'mto', 'weld']] as const) {
    const as = f.client(); const entry = await as.login(user.email);
    assert.deepEqual(entry.pilots, [own], user.name);
    for (const [name, run] of Object.entries(await requestKinds(as, f.store, other, own, fileId))) {
      const response = await run(); assert.equal(response.status, 403, `${user.name} ${name} in ${other}`); assert.equal((await json(response)).code, 'pilot');
    }
    for (const [name, run] of Object.entries(await requestKinds(as, f.store, own, own, fileId))) assert.ok([200, 201].includes(await status(await run())), `${user.name} ${name} in ${own}`);
  }
  // Different profiles: Read & write in Weld Pilot, read only in MTO Pilot.
  const both = f.account('Both pilots', { profileId: viewer, weldEnabled: true, weldProfileId: writer, mtoEnabled: true, mtoProfileId: viewer });
  const as = f.client(); assert.deepEqual((await as.login(both.email)).pilots, ['weld', 'mto']);
  const weld = f.store.get('welds', 'weld-2');
  assert.equal(await status(await as.request(`/records/welds/${weld.id}`, { method: 'PUT', pilot: 'weld', data: { description: 'Edited weld', _version: weld._version } })), 200);
  let iso = f.store.get('isometrics', 'iso-3');
  assert.equal(await status(await as.request(`/records/isometrics/${iso.id}`, { method: 'PUT', pilot: 'weld', data: { priority: 'Prio 2', _version: iso._version } })), 200, 'header editable in Weld Pilot');
  iso = f.store.get('isometrics', 'iso-3');
  assert.equal(await status(await as.request(`/records/isometrics/${iso.id}`, { method: 'PUT', pilot: 'mto', data: { priority: 'Prio 1', _version: iso._version } })), 403, 'header read-only in MTO Pilot');
  const requirement = f.store.list('iso_materials')[0];
  assert.equal(await status(await as.request('/records/iso_materials', { pilot: 'mto' })), 200);
  assert.equal(await status(await as.request(`/records/iso_materials/${requirement.id}`, { method: 'PUT', pilot: 'mto', data: { chargeNo: 'NO', _version: requirement._version } })), 403);
  assert.equal(await status(await as.request('/actions/add-iso-material', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-1', source: 'Custom', materialNo: 'NO', description: 'No', quantity: 1, uom: 'M' } })), 403);
  // Even where the MTO profile allows reading, Weld Pilot does not open MTO records (the pilot is the boundary).
  assert.equal(await status(await as.request('/records/iso_materials', { pilot: 'weld' })), 403);
  assert.equal(await status(await as.request('/reports/mto', { pilot: 'weld' })), 403);
  const weldView = await json<{ user: User }>(await as.request('/bootstrap', { pilot: 'weld' })), mtoView = await json<{ user: User }>(await as.request('/bootstrap', { pilot: 'mto' }));
  assert.deepEqual([weldView.user.permissions.general, mtoView.user.permissions.general], [2, 1]);
});

test('missing, forged and unknown pilots; selector requests return identity, pilots and main projects only', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const weldOnly = f.account('Weld only', { profileId: writer, mtoEnabled: false });
  const as = f.client(); const entry = await as.login(weldOnly.email);
  assert.deepEqual(entry.pilots, ['weld']); assert.deepEqual(entry.permissions, { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 }); assert.equal(entry.capabilities, undefined);
  const statusBody = await json<{ user: User }>(await as.request('/auth/status')); assert.deepEqual(statusBody.user.pilots, ['weld']);
  const selector = await json<{ user: User; rows: Record<string, Row[]>; activity: unknown[]; mainProjects: { id: string; name: string; pilots: string[] }[] }>(await as.request('/bootstrap'));
  assert.deepEqual(selector.rows, {}); assert.deepEqual(selector.activity, []); assert.equal(selector.user.pilot, undefined);
  assert.deepEqual(selector.mainProjects.map(site => [site.id, site.pilots]).sort(), [['site-north', ['weld']], ['site-river', ['weld']]]);
  for (const path of ['/records/projects', '/records/welds', '/reports/lisl', '/export/welds', '/history/welds/weld-1']) {
    const response = await as.request(path); assert.equal(response.status, 403, path); assert.equal((await json(response)).code, 'pilot');
  }
  assert.equal(await status(await as.request('/records/sites', { method: 'POST', data: { name: 'No pilot' } })), 403);
  for (const pilot of ['tools', 'WELD', 'weld,mto', 'mto']) assert.equal(await status(await as.request('/records/welds', { pilot })), 403, pilot);
  // Downloads may name the pilot in the query; it must agree with a header and never stands in for one on writes.
  assert.equal(await status(await as.request('/records/welds?pilot=weld')), 200);
  assert.equal(await status(await as.request('/records/welds?pilot=mto')), 403);
  assert.equal(await status(await as.request('/records/welds?pilot=mto', { pilot: 'weld' })), 403);
  assert.equal(await status(await as.request('/records/sites?pilot=weld', { method: 'POST', data: { name: 'Query pilot' } })), 403);
  // Password change and sign-out work with or without a pilot (even a refused one).
  assert.equal(await status(await as.request('/auth/password', { method: 'POST', pilot: 'mto', data: { currentPassword: PASSWORD, password: 'Access-Test-Password-2' } })), 200);
  assert.equal(await status(await as.request('/auth/logout', { method: 'POST', data: {} })), 200);
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'weld' })), 401);
  await as.login(weldOnly.email, 'Access-Test-Password-2');
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'weld' })), 200);
});

test('an account disabled for a pilot mid-session is refused on its next request', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const user = f.account('Switching', { profileId: writer });
  const as = f.client(); await as.login(user.email);
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'mto' })), 200);
  const row = f.store.get('users', user.id);
  assert.equal(await status(await f.admin.request(`/records/users/${user.id}`, { method: 'PUT', pilot: 'weld', data: { mtoEnabled: false, _version: row._version } })), 200);
  const refused = await as.request('/records/iso_materials', { pilot: 'mto' }); assert.equal(refused.status, 403); assert.equal((await json(refused)).code, 'pilot');
  assert.deepEqual((await json<{ user: User }>(await as.request('/auth/status'))).user.pilots, ['weld']);
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'weld' })), 200);
  // A pilot whose profile does not open the pilot's module is not enterable either.
  const blind = f.profile('No welding', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const next = f.store.get('users', user.id); f.store.update('users', user.id, { weldProfileId: blind }, next._version);
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'weld' })), 403);
  assert.deepEqual((await json<{ user: User }>(await as.request('/auth/status'))).user.pilots, []);
  // Deactivation ends the session everywhere.
  const last = f.store.get('users', user.id); f.store.update('users', user.id, { active: false }, last._version);
  assert.equal(await status(await as.request('/auth/password', { method: 'POST', data: { currentPassword: PASSWORD, password: 'Whatever-Password-1' } })), 401);
});

test('only administrators manage users and profiles; an administrator creates a weld-only read-only account', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer with settings', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW, settingsPermission: RW });
  const nonAdmin = f.account('Not admin', { profileId: writer });
  const as = f.client(); await as.login(nonAdmin.email);
  for (const pilot of ['weld', 'mto']) {
    for (const key of ['users', 'profiles']) assert.equal(await status(await as.request(`/records/${key}`, { pilot })), 403, `${key} ${pilot}`);
    const data = await json<{ rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot })); assert.equal(data.rows.users, undefined); assert.equal(data.rows.profiles, undefined);
  }
  assert.equal(await status(await as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Escalation', email: 'escalation@example.test', profileId: 'profile-admin', active: true, password: 'Escalation-Password' } })), 403);
  assert.equal(await status(await as.request(`/records/users/${nonAdmin.id}`, { method: 'PUT', pilot: 'weld', data: { profileId: 'profile-admin', _version: f.store.get('users', nonAdmin.id)._version } })), 403);
  assert.equal(await status(await as.request('/records/profiles', { method: 'POST', pilot: 'weld', data: { name: 'Escalated', settingsPermission: ADMIN } })), 403);
  // The administrator: user list with the access columns, never a password.
  const list = await f.admin.request('/records/users', { pilot: 'weld' }); assert.equal(list.status, 200);
  const rows = (await json<{ rows: Row[] }>(list)).rows; assert.ok(rows.every(row => row.password === undefined && typeof row.weldEnabled === 'boolean'));
  const reviewer = f.profile('Only review', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO });
  const created = await f.admin.request('/records/users', { method: 'POST', pilot: 'mto', data: { name: 'Weld reviewer', email: 'weld-reviewer@example.test', title: 'External reviewer', phone: '+31 10 555 0100', companyId: 'company-north', address: '1 Quay', profileId: reviewer, active: true, weldEnabled: true, weldProfileId: reviewer, mtoEnabled: false, password: 'Weld-Reviewer-Password' } });
  assert.equal(created.status, 201); const record = (await json<{ record: Row }>(created)).record; assert.equal(record.password, undefined);
  assert.ok(!JSON.stringify(f.store.get('users', record.id)).includes('Weld-Reviewer-Password'));
  const reviewerClient = f.client(); const entry = await reviewerClient.login('weld-reviewer@example.test', 'Weld-Reviewer-Password');
  assert.deepEqual(entry.pilots, ['weld']);
  const view = await json<{ user: User }>(await reviewerClient.request('/bootstrap', { pilot: 'weld' }));
  assert.deepEqual(view.user.permissions, { general: 1, materials: 0, welding: 1, tools: 0, settings: 0 });
  const weld = f.store.get('welds', 'weld-1');
  assert.equal(await status(await reviewerClient.request(`/records/welds/${weld.id}`, { method: 'PUT', pilot: 'weld', data: { description: 'No', _version: weld._version } })), 403);
  for (const path of ['/bootstrap', '/records/iso_materials', '/records/isometrics', '/reports/mto', '/export/isometrics']) assert.equal(await status(await reviewerClient.request(path, { pilot: 'mto' })), 403, path);
  // Last-administrator protection covers access per pilot.
  const self = f.store.list('users').find(row => row.email === 'access-admin@example.test')!;
  const locked = await f.admin.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'weld', data: { weldEnabled: false, mtoEnabled: false, _version: self._version } });
  assert.equal(locked.status, 409);
  assert.equal(await status(await f.admin.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'weld', data: { weldProfileId: reviewer, _version: self._version } })), 200, 'still an administrator in MTO Pilot');
  const again = f.store.get('users', self.id);
  assert.equal(await status(await f.admin.request(`/records/users/${self.id}`, { method: 'PUT', pilot: 'mto', data: { mtoProfileId: reviewer, _version: again._version } })), 409);
});

test('signatures: own records only, administrators view but never write; images are validated and replaced with history', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const alice = f.account('Alice signer', { profileId: writer }), bob = f.account('Bob signer', { profileId: writer });
  const a = f.client(), b = f.client(); await a.login(alice.email); await b.login(bob.email);
  const mine = await a.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Alice signer', userId: alice.id, kind: 'Full signature', nameUnder: true } });
  assert.equal(mine.status, 201); const signature = (await json<{ record: Row }>(mine)).record;
  assert.equal(await status(await a.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Alice signer', userId: alice.id, kind: 'Full signature' } })), 409, 'one record per type');
  assert.equal(await status(await a.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Alice signer', userId: alice.id, kind: 'Stamp' } })), 422);
  assert.equal(await status(await b.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Forged', userId: alice.id, kind: 'Short signature' } })), 403, 'no record on behalf of another user');
  // Invalid images are rejected by declared type, name and content.
  for (const [content, name, type] of [['not an image', 'fake.png', 'image/png'], [PNG, 'mismatch.jpg', 'image/jpeg'], [JPEG, 'mismatch.png', 'image/png'], [Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'sign.gif', 'image/gif'], [new Uint8Array(1024 * 1024 + 1).fill(1).map((v, i) => i < PNG.length ? PNG[i] : v), 'large.png', 'image/png']] as const) {
    assert.equal(await status(await f.upload(a, 'weld', 'signatures', signature.id, content, name, type)), 422, name);
  }
  const first = await f.upload(a, 'weld', 'signatures', signature.id, PNG, 'full-signature.png', 'image/png'); assert.equal(first.status, 201);
  const firstFile = (await json<{ record: Row }>(first)).record; assert.equal(firstFile.documentType, 'Full signature');
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await f.upload(a, 'mto', 'signatures', signature.id, JPEG, 'scan.jpeg', 'image/jpeg'); assert.equal(second.status, 201);
  const secondFile = (await json<{ record: Row }>(second)).record;
  const documents = documentStorage(f.store, f.dir, 'disk');
  const current = currentSignature(f.store, documents, alice.id, 'Full signature')!;
  assert.equal(current.file.id, secondFile.id); assert.deepEqual([...current.content], [...JPEG]); assert.equal(current.nameUnder, true); assert.equal(current.name, 'Alice signer');
  assert.ok(f.store.get('attachments', firstFile.id), 'the earlier image stays in history');
  assert.equal(currentSignature(f.store, documents, alice.id, 'Short signature'), null);
  // Reading: the owner yes, another user no, the administrator yes.
  assert.equal(await status(await a.request(`/files/${secondFile.id}`, { pilot: 'weld' })), 200);
  assert.equal(await status(await b.request(`/files/${secondFile.id}`, { pilot: 'weld' })), 403);
  assert.equal(await status(await b.request(`/history/signatures/${signature.id}`, { pilot: 'weld' })), 403);
  const bobView = await json<{ rows: Record<string, Row[]> }>(await b.request('/bootstrap', { pilot: 'weld' }));
  assert.equal(bobView.rows.signatures.length, 0); assert.ok(!bobView.rows.attachments.some(row => row.entityType === 'signatures'));
  assert.equal(await status(await f.admin.request(`/files/${secondFile.id}`, { pilot: 'weld' })), 200);
  assert.ok((await json<{ rows: Record<string, Row[]> }>(await f.admin.request('/bootstrap', { pilot: 'mto' }))).rows.signatures.some(row => row.id === signature.id));
  // Writing on behalf of another user: refused for that user and for the administrator.
  for (const as of [b, f.admin]) {
    assert.equal(await status(await f.upload(as, 'weld', 'signatures', signature.id, PNG, 'forged.png', 'image/png')), 403);
    const row = f.store.get('signatures', signature.id);
    assert.equal(await status(await as.request(`/records/signatures/${signature.id}`, { method: 'PUT', pilot: 'weld', data: { nameUnder: false, _version: row._version } })), 403);
    assert.equal(await status(await as.request(`/records/signatures/${signature.id}/archive`, { method: 'POST', pilot: 'weld', data: { _version: row._version } })), 403);
  }
  const row = f.store.get('signatures', signature.id);
  assert.equal(await status(await a.request(`/records/signatures/${signature.id}`, { method: 'PUT', pilot: 'weld', data: { userId: bob.id, _version: row._version } })), 403, 'no transfer to another user');
  assert.equal(await status(await a.request(`/records/signatures/${signature.id}`, { method: 'PUT', pilot: 'weld', data: { nameUnder: false, _version: row._version } })), 200);
});

test('other release profiles keep a single profile and need no pilot', async t => {
  for (const profile of ['full', 'welding-demo'] as const) {
    const f = await fixture(t, profile);
    const data = await json<{ user: User; rows: Record<string, Row[]> }>(await f.admin.request('/bootstrap'));
    assert.equal(data.user.pilots, undefined, profile); assert.equal(data.user.pilot, undefined, profile); assert.ok(data.rows.welds.length, profile);
    // A pilot header is ignored there.
    assert.equal(await status(await f.admin.request('/records/welds', { pilot: 'mto' })), 200, profile);
    assert.equal(await status(await f.admin.request('/records/users')), profile === 'full' ? 200 : 404, profile);
    assert.equal(await status(await f.admin.request('/records/signatures')), profile === 'full' ? 200 : 404, profile);
  }
  // In the full profile, settings Read only still reads users (unchanged), and per-pilot fields do not change access.
  const f = await fixture(t, 'full');
  const reader = f.account('Settings reader', { profileId: f.profile('Settings read', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO, settingsPermission: RO }), weldEnabled: false, mtoEnabled: false });
  const as = f.client(); const user = await as.login(reader.email);
  assert.equal(user.pilots, undefined); assert.equal(user.permissions.welding, 1);
  assert.equal(await status(await as.request('/records/users')), 200);
  assert.equal(await status(await as.request('/records/welds')), 200);
  const access = releaseAccess(f.store, availabilityFor('full'));
  assert.deepEqual(access.present(reader.id).permissions, publicUser(f.store, reader.id).permissions);
});

test('access samples seed realistic profiles and accounts without passwords, once', t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-access-seed-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new Store(join(dir, 'test.sqlite')); seed(store); seedAccessSamples(store); seedAccessSamples(store);
  try {
    const users = store.list('users');
    assert.deepEqual(users.map(row => row.email).sort(), ['daan.visser@example.com', 'mila.kovac@example.com', 'reviewer@example.com', 'sara.jansen@example.com']);
    assert.equal(store.db.prepare('SELECT count(*) AS total FROM credentials').get()!.total, 0, 'no seeded password');
    const access = releaseAccess(store, availabilityFor(HOSTED_RELEASE_PROFILE));
    const pilotsOf = (email: string) => access.present(users.find(row => row.email === email)!.id).pilots;
    assert.deepEqual([pilotsOf('mila.kovac@example.com'), pilotsOf('daan.visser@example.com'), pilotsOf('sara.jansen@example.com'), pilotsOf('reviewer@example.com')], [['weld'], ['mto'], ['weld', 'mto'], ['weld', 'mto']]);
    const sara = users.find(row => row.email === 'sara.jansen@example.com')!;
    assert.deepEqual([access.pilotAccount(sara.id, 'weld').permissions.general, access.pilotAccount(sara.id, 'mto').permissions.general], [2, 1]);
    assert.ok(['Highest rights for QAQC', 'Standard profile for workpreparator', 'Only review'].every(name => store.list('profiles').some(row => row.name === name)));
  } finally { store.close(); }
});

test('a fresh sample workspace with seeded accounts still asks for its administrator first', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-access-setup-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store); seedAccessSamples(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  assert.equal((await (await fetch(`${base}/auth/status`)).json()).requiresSetup, true);
  const headers = { 'Content-Type': 'application/json', 'X-Stelux-Request': '1' };
  assert.equal((await fetch(`${base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email: 'mila.kovac@example.com', password: '' }) })).status, 401, 'no password, no sign-in');
  assert.equal((await fetch(`${base}/auth/setup`, { method: 'POST', headers, body: JSON.stringify({ name: 'Sample admin', email: 'sample-admin@example.test', password: PASSWORD }) })).status, 201);
  assert.equal((await fetch(`${base}/auth/setup`, { method: 'POST', headers, body: JSON.stringify({ name: 'Second', email: 'second@example.test', password: PASSWORD }) })).status, 409);
  assert.equal((await (await fetch(`${base}/auth/status`)).json()).requiresSetup, false);
});
