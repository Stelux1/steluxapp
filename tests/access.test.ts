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
import { SAMPLE_PROFILES } from '../server/sample-profiles.ts';
import { BACKGROUND_SIZES, DEFAULT_BACKGROUND, accountListed, backgroundRect, defaultPilotProfileId, duplicateProfileData, hostedProfileAreas, nameOverlayPlacement, newUserProfileDefaults, pilotProfileErrors, HOSTED_VERB_LABELS, PROFILE_APP_FILTER } from '../shared/access-ui.ts';
import { hostedFieldOrder, HOSTED_COLUMN_LABELS, listDefaultSort } from '../shared/welder-data.ts';
import { PERMISSION_VERBS } from '../shared/permissions.ts';
import { documentStorage } from '../server/documents.ts';
import { currentSignature } from '../server/signatures.ts';
import { releaseAccess } from '../server/release-access.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { areaPilots, canChangeRights, canResource, canScope, isAdministrator, parsePermissionRules, PERMISSION_AREAS, pilotBoundary, usersProfilesRight, type CopyParts } from '../shared/permissions.ts';
import { SITE_SCOPE_SPECIFIC } from '../shared/site-scope.ts';
import { isoBlockers, isoProgress, isoQuality } from '../shared/iso-status.ts';
import type { IsoSummary } from '../shared/iso-summary.ts';
import { isoBudgets as mtoIsoBudgets, materialStatus } from '../shared/mto-materials.ts';
import { punchCounts } from '../shared/punch.ts';
import { hydrotestState } from '../shared/hydrotest.ts';
import { allowedPilots, pagePilots, PILOT_MAP, pilotItemState, type MenuRights } from '../shared/pilots.ts';
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
const newestIsoRevision = (store: Store, isoId: string) => { const revision = store.list('revisions').filter(row => row.type === 'ISO' && row.isoId === isoId).sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)))[0]; return revision ? { revisionId: revision.id } : {}; };
async function requestKinds(as: { request: (path: string, options?: Options) => Promise<Response> }, store: Store, pilot: string, kind: 'weld' | 'mto', fileId: string) {
  const iso = store.get('isometrics', 'iso-1');
  const weldKinds = {
    bootstrap: () => as.request('/bootstrap', { pilot }),
    read: () => as.request('/records/welds', { pilot }),
    write: () => { const weld = store.get('welds', 'weld-19'); /* weld-1 has an NDT request: locked for every account but an administrator */ return as.request(`/records/welds/${weld.id}`, { method: 'PUT', pilot, data: { description: `Edited in ${pilot}`, _version: weld._version } }); },
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
    // Material Core's Add material form always sends a Type (and the newest ISO revision while the isometric has one).
    action: () => as.request('/actions/add-iso-material', { method: 'POST', pilot, data: { isoId: iso.id, source: 'Custom', materialNo: `ACCESS-${pilot}`, description: 'Access test pipe', quantity: 1, uom: 'M', phaseId: store.list('operation_phases')[0]?.id, ...newestIsoRevision(store, iso.id) } }),
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
  assert.deepEqual(hostedUsers.columns, ['email', 'name', 'title', 'companyId', 'phone', 'mtoEnabled', 'weldEnabled'], 'reference order: Material Core before Weld Core, no Account active column');
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
  // Different profiles: Read & write in Weld Core, read only in Material Core.
  const both = f.account('Both cores', { profileId: viewer, weldEnabled: true, weldProfileId: writer, mtoEnabled: true, mtoProfileId: viewer });
  const as = f.client(); assert.deepEqual((await as.login(both.email)).pilots, ['weld', 'mto']);
  const weld = f.store.get('welds', 'weld-20');
  assert.equal(await status(await as.request(`/records/welds/${weld.id}`, { method: 'PUT', pilot: 'weld', data: { description: 'Edited weld', _version: weld._version } })), 200);
  let iso = f.store.get('isometrics', 'iso-3');
  assert.equal(await status(await as.request(`/records/isometrics/${iso.id}`, { method: 'PUT', pilot: 'weld', data: { priority: 'Prio 2', _version: iso._version } })), 200, 'header editable in Weld Core');
  iso = f.store.get('isometrics', 'iso-3');
  assert.equal(await status(await as.request(`/records/isometrics/${iso.id}`, { method: 'PUT', pilot: 'mto', data: { priority: 'Prio 1', _version: iso._version } })), 403, 'header read-only in Material Core');
  const requirement = f.store.list('iso_materials')[0];
  assert.equal(await status(await as.request('/records/iso_materials', { pilot: 'mto' })), 200);
  assert.equal(await status(await as.request(`/records/iso_materials/${requirement.id}`, { method: 'PUT', pilot: 'mto', data: { chargeNo: 'NO', _version: requirement._version } })), 403);
  assert.equal(await status(await as.request('/actions/add-iso-material', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-1', source: 'Custom', materialNo: 'NO', description: 'No', quantity: 1, uom: 'M' } })), 403);
  // Even where the MTO profile allows reading, Weld Core does not open MTO records (the pilot is the boundary).
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
  // Entering depends on the application being enabled only (access-users-profiles-020): a profile without welding
  // rights enters Weld Core, and every welding route refuses it.
  const blind = f.profile('No welding', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const next = f.store.get('users', user.id); f.store.update('users', user.id, { weldProfileId: blind }, next._version);
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'weld' })), 200);
  assert.deepEqual((await json<{ user: User }>(await as.request('/auth/status'))).user.pilots, ['weld']);
  assert.equal(await status(await as.request('/records/welds', { pilot: 'weld' })), 403);
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
  // Nobody switches its own applications off or changes its own pilot profiles (sec1-002), so no administrator locks itself out that way.
  // This account is the only administrator: switching both applications off would leave none, so that refusal is the last-administrator one (409).
  const self = f.store.list('users').find(row => row.email === 'access-admin@example.test')!;
  for (const [pilot, data, code] of [['weld', { weldEnabled: false, mtoEnabled: false }, 409], ['weld', { weldProfileId: reviewer }, 403], ['mto', { mtoProfileId: reviewer }, 403]] as const) {
    assert.equal(await status(await f.admin.request(`/records/users/${self.id}`, { method: 'PUT', pilot, data: { ...data, _version: self._version } })), code, JSON.stringify(data));
  }
  assert.equal(f.store.get('users', self.id)._version, self._version, 'nothing stored');
  // Last-administrator protection covers access per pilot: with Only review in Weld Core the account is still an
  // administrator in Material Core, and taking the administrator rights off its MTO profile is refused.
  f.store.update('users', self.id, { weldProfileId: reviewer }, self._version, { id: 'test', name: 'test' });
  assert.equal(await status(await f.admin.request('/records/users', { pilot: 'weld' })), 403, 'no administrator in Weld Core any more');
  assert.equal(await status(await f.admin.request('/records/users', { pilot: 'mto' })), 200, 'still an administrator in Material Core');
  const adminProfile = f.store.get('profiles', String(self.profileId));
  assert.equal(await status(await f.admin.request(`/records/profiles/${adminProfile.id}`, { method: 'PUT', pilot: 'mto', data: { settingsPermission: NONE, description: 'Administrator', _version: adminProfile._version } })), 409);
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
  // Signatures are a Weld Core page (area 96 belongs to Weld Core only).
  assert.equal(await status(await f.upload(a, 'mto', 'signatures', signature.id, JPEG, 'scan.jpeg', 'image/jpeg')), 403);
  const second = await f.upload(a, 'weld', 'signatures', signature.id, JPEG, 'scan.jpeg', 'image/jpeg'); assert.equal(second.status, 201);
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
  assert.ok((await json<{ rows: Record<string, Row[]> }>(await f.admin.request('/bootstrap', { pilot: 'weld' }))).rows.signatures.some(row => row.id === signature.id));
  assert.equal((await json<{ rows: Record<string, Row[]> }>(await f.admin.request('/bootstrap', { pilot: 'mto' }))).rows.signatures, undefined, 'Material Core has no signatures');
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
    assert.deepEqual(store.list('profiles').map(row => row.name).sort(), ['Administrator', 'External', 'Full rights', 'Project operator', 'QAQC 01', 'Viewer', 'WPM', 'Workpreparator 01'], 'the plain seed keeps its three base profiles; the reference profiles are added');
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

// ----- deliberate pilot-boundary crossings: the isometric summary and Copy isometrics ----------------------------

type Summaries = Record<string, IsoSummary>;
type BootstrapBody = { rows: Record<string, Row[]>; isoSummaries?: Summaries; copyParts?: CopyParts };
/** Only aggregates: numbers, booleans, null, the fixed keys of phases and blocker groups and the Pfb / Fld state 'ready'; no other text. */
function assertAggregates(value: unknown, path = 'summary') {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') { assert.ok(['shop', 'field', 'site', 'release', 'welds', 'ndt', 'repair', 'punch', 'ready'].includes(value), `${path} carries text "${value}"`); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => assertAggregates(item, `${path}[${index}]`)); return; }
  assert.equal(typeof value, 'object', path);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) assertAggregates(item, `${path}.${key}`);
}

test('one isometric summary for both pilots: the same numbers under Weld and MTO, aggregates only, scoped like the isometrics', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const both = f.account('Both cores', { profileId: writer }), mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false });
  const bootstrap = async (as: ReturnType<typeof f.client>, pilot: string) => json<BootstrapBody>(await as.request('/bootstrap', { pilot }));
  const a = f.client(); await a.login(both.email);
  const weld = await bootstrap(a, 'weld'), mto = await bootstrap(a, 'mto');
  // Every sample project is on in both pilots, so every isometric of Material Core has the same summary in Weld Core.
  const inMto = mto.rows.isometrics.map(iso => iso.id).sort();
  assert.ok(inMto.includes('iso-7'));
  assert.deepEqual(Object.keys(mto.isoSummaries!).sort(), inMto);
  assert.deepEqual(Object.keys(weld.isoSummaries!).sort(), weld.rows.isometrics.map(iso => iso.id).sort());
  for (const id of inMto) assert.deepEqual(mto.isoSummaries![id], weld.isoSummaries![id], id);
  // The numbers are the shared formulas over every record (here: what Weld Core reads for this account).
  const iso2 = weld.rows.isometrics.find(iso => iso.id === 'iso-2')!, site = weld.rows.sites.find(row => row.id === 'site-north');
  const input = { iso: iso2, site, welds: weld.rows.welds, weldTypes: weld.rows.weld_types, diameters: weld.rows.diameters, results: weld.rows.inspection_results, releases: weld.rows.releases, punch: weld.rows.punchlists, testSystems: weld.rows.test_systems, hydrotestRequests: weld.rows.hydrotest_requests };
  const summary = mto.isoSummaries!['iso-2'];
  assert.equal(summary.blockers.total, isoBlockers(input).total); assert.ok(summary.blockers.total > 0);
  assert.deepEqual(summary.blockers.groups, isoBlockers(input).groups.map(group => ({ key: group.key, count: group.count })));
  assert.equal(summary.quality.percent, isoQuality(input).percent); assert.equal(summary.progress.total, isoProgress(input).total);
  assert.equal(summary.progress.configured, true); assert.notEqual(summary.progress.total, null);
  assert.deepEqual([mto.isoSummaries!['iso-3'].flags.pfb, mto.isoSummaries!['iso-3'].flags.fld, mto.isoSummaries!['iso-3'].kpi.prefabComplete], [true, true, true], 'releases count in Material Core too');
  assert.equal(mto.rows.releases, undefined, 'while the release records stay in Weld Core');
  // The MTO-only account: the same numbers, no weld records in any response.
  const m = f.client(); await m.login(mtoOnly.email);
  const raw = await (await m.request('/bootstrap', { pilot: 'mto' })).text(), view = JSON.parse(raw) as BootstrapBody;
  assert.deepEqual(view.isoSummaries, mto.isoSummaries);
  for (const key of ['welds', 'inspection_results', 'inspection_requests', 'releases', 'punchlists', 'welders']) assert.equal(view.rows[key], undefined, key);
  const records = [...f.store.list('welds', true).flatMap(row => [row.id, String(row.weldNo)]), ...f.store.list('inspection_results', true).flatMap(row => [row.id, String(row.reportNo)]), ...f.store.list('releases', true).flatMap(row => [row.id, String(row.reportNo)]), ...f.store.list('punchlists', true).flatMap(row => [row.id, String(row.name)])];
  for (const text of records) assert.ok(!raw.includes(`"${text}"`), `MTO bootstrap carries ${text}`);
  const payload = JSON.stringify(view.isoSummaries);
  for (const text of [...records, ...f.store.list('welders', true).map(row => String(row.name)), 'H-1042', ...f.store.list('iso_materials', true).map(row => row.id)]) assert.ok(!payload.includes(text), `summary carries ${text}`);
  for (const [id, item] of Object.entries(view.isoSummaries!)) {
    // budgets is present only while the isometric has classified material lines; every other key always.
    // budgets and testSystemName are present only where they apply; every other key always.
    assert.deepEqual(Object.keys(item).filter(key => key !== 'budgets' && key !== 'testSystemName').sort(), ['blockers', 'flags', 'hydrotest', 'kpi', 'materialStatus', 'progress', 'punch', 'qa', 'quality'], id);
    // The one label: the isometric's own test system name, nothing else of the test system.
    const iso = f.store.get('isometrics', id), system = iso.testSystemId ? f.store.get('test_systems', String(iso.testSystemId)) : undefined;
    assert.equal(item.testSystemName, system ? String(system.name) : undefined, `${id} test system name`);
    const { testSystemName: _label, ...aggregates } = item;
    assertAggregates(aggregates, id);
  }
  // Material status %, the MTO budgets, punch counts and the hydrotest state are the shared formulas over every record,
  // and reach Weld Core too although it reads no material line, order, stock or pick list.
  const all = (key: string) => f.store.list(key);
  const rowsOf = { isometrics: all('isometrics'), projects: all('projects'), reservations: all('reservations'), iso_materials: all('iso_materials'), materials: all('materials'), custom_materials: all('custom_materials'), operation_phases: all('operation_phases'), orders: all('orders'), order_lines: all('order_lines'), stock: all('stock'), picklists: all('picklists') };
  for (const id of inMto) {
    const iso = f.store.get('isometrics', id);
    assert.equal(weld.isoSummaries![id].materialStatus.percent, materialStatus(iso, rowsOf).percent, `${id} material status`);
    assert.deepEqual(weld.isoSummaries![id].budgets, mtoIsoBudgets(iso, rowsOf), `${id} budgets`);
    assert.deepEqual(weld.isoSummaries![id].punch, punchCounts(all('punchlists').filter(row => row.isoId === id)), `${id} punch`);
    const hydro = hydrotestState(iso, { test_systems: all('test_systems'), hydrotest_requests: all('hydrotest_requests'), releases: all('releases') });
    assert.deepEqual(weld.isoSummaries![id].hydrotest, { inScope: hydro.inScope, completed: hydro.completed }, `${id} hydrotest`);
  }
  assert.ok(weld.isoSummaries!['iso-1'].budgets, 'the first isometric has pipe, supports and appendage budgets');
  assert.notEqual(weld.isoSummaries!['iso-1'].materialStatus.percent, null);
  assert.equal(weld.rows.iso_materials, undefined, 'while Weld Core reads no material lines');
  for (const path of ['/records/welds', '/records/inspection_results', '/records/releases', '/history/welds/weld-1', '/reports/lisl', '/export/welds']) assert.equal(await status(await m.request(path, { pilot: 'mto' })), 403, path);
  // The isometrics export gives the same rows in both pilots: the reference's columns, without the flag columns.
  const exportedIn = async (as: ReturnType<typeof f.client>, pilot: string) => (await (await as.request('/export/isometrics?format=csv&ids=iso-3', { pilot })).text()).trim();
  const exported = await exportedIn(m, 'mto');
  assert.equal(exported, await exportedIn(a, 'weld')); assert.equal(exported.split('\n')[0], 'Project,ISO No,IRN,ITP No,ITP No 2,P.Class,Prio.');
  // A change made in one pilot shows in the other's next bootstrap (what refresh() reloads).
  assert.equal(mto.isoSummaries!['iso-1'].kpi.documentation, false);
  assert.equal(await status(await m.request('/actions/phases', { method: 'POST', pilot: 'mto', data: { isoIds: ['iso-1'], prefab_doc: 'Complete', field_doc: 'Complete' } })), 201);
  assert.equal((await bootstrap(a, 'weld')).isoSummaries!['iso-1'].kpi.documentation, true); assert.equal((await bootstrap(m, 'mto')).isoSummaries!['iso-1'].kpi.documentation, true);
  // An account that cannot read isometrics gets no summaries.
  const blind = f.account('No isometrics', { profileId: f.profile('Materials without project data', { generalPermission: NONE, materialsPermission: RW, weldingPermission: RW }) });
  const b = f.client(); await b.login(blind.email);
  for (const pilot of ['weld', 'mto']) { const body = await bootstrap(b, pilot); assert.equal(body.rows.isometrics, undefined, pilot); assert.deepEqual(body.isoSummaries ?? {}, {}, pilot); }
  // The selector (no pilot) gets neither summaries nor copy rules.
  const selector = await json<BootstrapBody>(await a.request('/bootstrap')); assert.equal(selector.isoSummaries, undefined); assert.equal(selector.copyParts, undefined);
});

test('copy isometrics across the boundary: each part follows the account in the pilot that owns it', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const viewer = f.profile('Copy viewer', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO });
  const norm = f.store.create('calculation_norms', { name: 'Fit-up per metre', uom: 'M', hoursPerUnit: 1.5 });
  /** A drawing in STX-2401 with two welds, one material requirement (pipe, metres) and one calculation line. */
  const source = (isoNo: string) => {
    const iso = f.store.create('isometrics', { isoNo, projectId: 'project-cooling' });
    for (const weldNo of ['S1', 'S2']) f.store.create('welds', { isoId: iso.id, weldNo, typeId: 'weld-type-1', diameterId: 'diameter-6', lengthMode: 'Diameter', ndoReq: true });
    const requirement = f.store.create('iso_materials', { isoId: iso.id, materialId: 'material-1', quantity: 6 });
    f.store.create('calculation_lines', { name: `Fit-up ${isoNo}`, isoId: iso.id, requirementId: requirement.id, normId: norm.id });
    return iso.id;
  };
  const ALL = { copyWelds: true, copyMaterials: true, copyCalculations: true };
  const copy = (as: ReturnType<typeof f.client>, pilot: string, isoId: string, parts: Record<string, unknown>, projectId = 'project-skid') => as.request('/actions/copy-isometrics', { method: 'POST', pilot, data: { isoIds: [isoId], projectId, ...parts } });
  /** Welds, material requirements and calculation lines on the copy in STX-2403, or null when there is no copy. */
  const copied = (isoNo: string) => { const iso = f.store.list('isometrics').find(row => row.isoNo === isoNo && row.projectId === 'project-skid'); return iso ? ['welds', 'iso_materials', 'calculation_lines'].map(key => f.store.list(key).filter(row => row.isoId === iso.id).length) : null; };
  const parts = async (as: ReturnType<typeof f.client>, pilot: string) => (await json<BootstrapBody>(await as.request('/bootstrap', { pilot }))).copyParts!;
  // An account enabled in both pilots copies all three from either pilot.
  const both = f.client(); await both.login(f.account('Both writer', { profileId: writer }).email);
  for (const pilot of ['weld', 'mto']) assert.deepEqual(Object.values(await parts(both, pilot)).map(rule => rule.allowed), [true, true, true], pilot);
  assert.equal(await status(await copy(both, 'weld', source('CP-WELD'), ALL)), 201); assert.deepEqual(copied('CP-WELD'), [2, 1, 1]);
  const fromMto = await copy(both, 'mto', source('CP-MTO'), ALL); assert.equal(fromMto.status, 201); assert.deepEqual(copied('CP-MTO'), [2, 1, 1]);
  assert.ok((await json<{ records: Row[] }>(fromMto)).records.every(row => row.isoNo === 'CP-MTO' && row.weldNo === undefined), 'the copy returns the isometric, not weld records');
  // A weld-only account: welds yes; materials and calculations refused, also when the request is forged.
  const weldOnly = f.client(); await weldOnly.login(f.account('Weld only writer', { profileId: writer, mtoEnabled: false }).email);
  const weldParts = await parts(weldOnly, 'weld');
  assert.deepEqual([weldParts.copyWelds.allowed, weldParts.copyMaterials.allowed, weldParts.copyCalculations.allowed], [true, false, false]);
  assert.equal(weldParts.copyMaterials.reason, 'You are not enabled in Material Core.');
  const weldSource = source('CP-WELD-ONLY'), isos = f.store.list('isometrics').length;
  for (const forged of [{ copyMaterials: true }, { copyMaterials: true, copyCalculations: true }, ALL]) {
    const refused = await copy(weldOnly, 'weld', weldSource, forged); assert.equal(refused.status, 403, JSON.stringify(forged));
    assert.equal((await json(refused)).error, 'You are not enabled in Material Core.');
  }
  assert.equal(f.store.list('isometrics').length, isos, 'nothing is written');
  assert.equal(await status(await copy(weldOnly, 'mto', weldSource, { copyMaterials: true })), 403, 'and Material Core stays closed');
  assert.equal(await status(await copy(weldOnly, 'weld', weldSource, { copyWelds: true })), 201); assert.deepEqual(copied('CP-WELD-ONLY'), [2, 0, 0]);
  // Read only in Material Core: materials refused from Weld Core; in Material Core the isometric itself is refused.
  const readOnly = f.client(); await readOnly.login(f.account('MTO reader', { profileId: writer, mtoProfileId: viewer }).email);
  const readParts = await parts(readOnly, 'weld');
  assert.deepEqual([readParts.copyWelds.allowed, readParts.copyMaterials.allowed], [true, false]); assert.equal(readParts.copyMaterials.reason, 'Your Material Core profile cannot add material requirements.');
  const readSource = source('CP-READER');
  const refused = await copy(readOnly, 'weld', readSource, { copyWelds: true, copyMaterials: true }); assert.equal(refused.status, 403);
  assert.equal((await json(refused)).error, 'Your Material Core profile cannot add material requirements.');
  assert.equal(await status(await copy(readOnly, 'mto', readSource, {})), 403, 'the MTO profile cannot add isometrics');
  assert.equal(copied('CP-READER'), null);
  assert.equal(await status(await copy(readOnly, 'weld', readSource, { copyWelds: true })), 201); assert.deepEqual(copied('CP-READER'), [2, 0, 0]);
  // An MTO-only account: welds refused (also forged), materials and calculations copied.
  const mtoOnly = f.client(); await mtoOnly.login(f.account('MTO only writer', { profileId: writer, weldEnabled: false }).email);
  assert.deepEqual((await parts(mtoOnly, 'mto')).copyWelds, { allowed: false, pilot: 'weld', reason: 'You are not enabled in Weld Core.' });
  const mtoSource = source('CP-MTO-ONLY');
  assert.equal(await status(await copy(mtoOnly, 'mto', mtoSource, { copyWelds: true })), 403);
  assert.equal(await status(await copy(mtoOnly, 'mto', mtoSource, { copyMaterials: true, copyCalculations: true })), 201); assert.deepEqual(copied('CP-MTO-ONLY'), [0, 1, 1]);
  // A legacy single-profile account: one profile in both pilots, so it copies all three from either pilot; the
  // duplicate and same-main-project rules still apply, and a part its single profile cannot add stays refused.
  const legacyRow = f.account('Legacy copier', { profileId: writer });
  const legacyReader = f.account('Legacy materials reader', { profileId: f.profile('Materials read only', { generalPermission: RW, materialsPermission: RO, weldingPermission: RW }) });
  for (const id of [legacyRow.id, legacyReader.id]) f.store.db.prepare(`UPDATE users SET data=json_remove(data,'$.weldEnabled','$.mtoEnabled','$.weldProfileId','$.mtoProfileId') WHERE id=?`).run(id);
  const legacy = f.client(); await legacy.login(legacyRow.email);
  assert.equal(await status(await copy(legacy, 'mto', 'iso-1', ALL, 'project-cooling')), 422, 'the ISO number exists in the target');
  assert.equal(await status(await copy(legacy, 'weld', 'iso-1', ALL, 'project-steam')), 422, 'another main project');
  for (const [pilot, isoNo] of [['weld', 'CP-LEGACY-W'], ['mto', 'CP-LEGACY-M']]) { assert.equal(await status(await copy(legacy, pilot, source(isoNo), ALL)), 201, pilot); assert.deepEqual(copied(isoNo), [2, 1, 1], pilot); }
  const lr = f.client(); await lr.login(legacyReader.email);
  const lrSource = source('CP-LEGACY-READER');
  for (const pilot of ['weld', 'mto']) assert.equal(await status(await copy(lr, pilot, lrSource, { copyMaterials: true })), 403, pilot);
  assert.equal(await status(await copy(lr, 'weld', lrSource, { copyWelds: true })), 201);
});

test('other release profiles: no summaries or copy rules are delivered and Copy isometrics follows the single profile', async t => {
  for (const profile of ['full', 'welding-demo'] as const) {
    const f = await fixture(t, profile);
    const body = await json<BootstrapBody>(await f.admin.request('/bootstrap'));
    assert.equal(body.isoSummaries, undefined, profile); assert.equal(body.copyParts, undefined, profile);
  }
  const f = await fixture(t, 'full');
  const copied = await f.admin.request('/actions/copy-isometrics', { method: 'POST', data: { isoIds: ['iso-1'], projectId: 'project-skid', copyWelds: true, copyMaterials: true, copyCalculations: true } });
  assert.equal(copied.status, 201);
  const weldsOnly = f.account('Welding writer', { profileId: f.profile('Welding writer', { generalPermission: RW, materialsPermission: RO, weldingPermission: RW }) });
  const as = f.client(); await as.login(weldsOnly.email);
  assert.equal(await status(await as.request('/actions/copy-isometrics', { method: 'POST', data: { isoIds: ['iso-2'], projectId: 'project-skid', copyMaterials: true } })), 403, 'single profile without the materials add right');
  assert.equal(await status(await as.request('/actions/copy-isometrics', { method: 'POST', data: { isoIds: ['iso-2'], projectId: 'project-skid', copyWelds: true } })), 201);
});

// ----- the permissions core: area list, pilot mapping, page areas, signatures, entering a pilot ------------------------

/** A profile with the reference matrix (Detailed permissions): `rules` is {area: verbs}. */
// A hosted profile needs a description when it is saved (access-users-profiles-009), so the test profiles carry one.
const detailed = (store: Store, name: string, rules: Record<string, string[]>) => store.create('profiles', { name, description: name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE, toolsPermission: NONE, settingsPermission: NONE }).id;

test('the area list has Visual inspection 116 and ITPs 120; stored local rules are read through an alias; pilots follow the App column', () => {
  const area = (key: string) => PERMISSION_AREAS.find(item => item.key === key);
  assert.deepEqual([area('116')?.name, area('116')?.verbs], ['Visual inspection', ['show', 'insert', 'edit', 'delete', 'print']]);
  assert.deepEqual([area('120')?.name, area('120')?.verbs], ['ITPs', ['show', 'insert', 'edit', 'delete']]);
  assert.equal(area('local-visual-results'), undefined); assert.equal(area('local-itps'), undefined);
  // A profile saved with the earlier local keys reads as the reference areas, with the verbs those areas have.
  assert.deepEqual(parsePermissionRules(JSON.stringify({ 'local-visual-results': ['show', 'insert', 'export', 'import'], 'local-itps': ['show', 'print'], '63': ['show'] })), { '116': ['show', 'insert'], '120': ['show'], '63': ['show'] });
  assert.throws(() => parsePermissionRules(JSON.stringify({ '120': ['print'] })), /invalid/, 'ITPs has no Print');
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const viewer: User = { id: 'u', name: 'U', email: 'u@example.test', profileId: 'p', availability: hosted, pilot: 'weld', permissions: { general: 0, materials: 0, welding: 1, tools: 0, settings: 0 }, capabilities: parsePermissionRules(JSON.stringify({ 'local-visual-results': ['show'] })) };
  assert.ok(canResource(viewer, 'inspection_results', 'show', { id: 'r', type: 'VI' } as unknown as Row), 'Show on 116 reads visual inspection results');
  assert.equal(canResource(viewer, 'inspection_results', 'show', { id: 'r', type: 'NDT' } as unknown as Row), false);
  assert.equal(canResource(viewer, 'inspection_results', 'insert', { id: 'r', type: 'VI' } as unknown as Row), false);
  assert.ok(canResource({ ...viewer, capabilities: { '120': ['show'] } }, 'itps'), 'ITPs 120 opens the ITP register');
  // Pilots of the areas (weld__system__profiles.txt data-apps).
  for (const key of ['85', '86', '89', '99', '37']) assert.deepEqual(areaPilots(key), ['weld', 'mto'], key);
  assert.deepEqual(areaPilots('96'), ['weld']); assert.deepEqual(areaPilots('93'), []); assert.deepEqual(areaPilots('71'), ['mto']);
  assert.deepEqual(areaPilots('116'), ['weld']); assert.deepEqual(areaPilots('120'), ['weld']); assert.deepEqual(areaPilots('local-itps'), ['weld']);
  // Release prefab / field now cross into Material Core; Signatures do not.
  const both: User = { ...viewer, capabilities: { '86': ['show'], '89': ['show'], '96': ['show', 'insert'] } };
  assert.ok(canResource(pilotBoundary(both, 'mto'), 'releases', 'show', { id: 'r', type: 'Prefab' } as unknown as Row));
  assert.equal(canResource(pilotBoundary(both, 'mto'), 'signatures', 'insert'), false);
  assert.ok(canResource(pilotBoundary(both, 'weld'), 'signatures', 'insert'));
  assert.deepEqual(pagePilots('/settings/signatures'), ['weld']); assert.deepEqual(pagePilots('/settings/users'), ['weld', 'mto']);
});

test('page areas gate their page: the Weld dashboard (35), Export welds (81) and the Materials list (78), in the menu and on the server', async t => {
  const f = await fixture(t);
  const base = { '4': ['show'], '5': ['show'], '64': ['show'], '63': ['show', 'export'], '70': ['show'], '16': ['show', 'export'], '68': ['show'], '76': ['show'], '50': ['show'] };
  const without = f.account('No page areas', { profileId: detailed(f.store, 'Welds without dashboard', base) });
  const withAreas = f.account('Page areas', { profileId: detailed(f.store, 'Welds with dashboard', { ...base, '35': ['show'], '78': ['show'], '81': ['show', 'export'] }) });
  const a = f.client(), b = f.client(); await a.login(without.email); await b.login(withAreas.email);
  const rights = (user: User): MenuRights => ({ delivered: () => true, canRecord: key => canResource(user, key), canReadReport: () => true, canArea: key => canScope(user, key) });
  const item = (pilot: 'weld' | 'mto', label: string) => PILOT_MAP[pilot].groups.flatMap(group => group.items).find(entry => entry.label === label)!;
  const weldA = (await json<{ user: User }>(await a.request('/bootstrap', { pilot: 'weld' }))).user, weldB = (await json<{ user: User }>(await b.request('/bootstrap', { pilot: 'weld' }))).user;
  assert.ok(weldB.capabilities?.['35']?.includes('show'), 'the page area survives into the bootstrap capabilities');
  assert.equal(weldA.capabilities?.['35'], undefined);
  assert.equal(pilotItemState(item('weld', 'Dashboard'), rights(weldA)), 'no-rights', 'welds show without 35: no Dashboard');
  assert.equal(pilotItemState(item('weld', 'Dashboard'), rights(weldB)), 'open');
  assert.equal(pilotItemState(item('weld', 'Export weld data'), rights(weldA)), 'no-rights');
  assert.equal(pilotItemState(item('weld', 'Export weld data'), rights(weldB)), 'open');
  assert.equal(pilotItemState(item('weld', 'Iso overview'), rights(weldA)), 'no-rights', 'Iso overview needs 92');
  // Export weld data downloads need Export on 81; LISL stays the Data LISL export as well.
  assert.equal(await status(await a.request('/reports/wdi', { pilot: 'weld' })), 403);
  assert.equal(await status(await b.request('/reports/wdi', { pilot: 'weld' })), 200);
  assert.equal(await status(await a.request('/reports/lisl', { pilot: 'weld' })), 200);
  // Materials list: area 78.
  const mtoA = (await json<{ user: User }>(await a.request('/bootstrap', { pilot: 'mto' }))).user, mtoB = (await json<{ user: User }>(await b.request('/bootstrap', { pilot: 'mto' }))).user;
  assert.equal(pilotItemState(item('mto', 'Materials list'), rights(mtoA)), 'no-rights');
  assert.equal(pilotItemState(item('mto', 'Materials list'), rights(mtoB)), 'open');
  const refused = await a.request('/mto/materials-list', { pilot: 'mto' }); assert.equal(refused.status, 403);
  assert.ok(!(await refused.text()).includes('Ord'), 'no order state for an account without 78');
  assert.equal(await status(await b.request('/mto/materials-list', { pilot: 'mto' })), 200);
  // Module-level profiles keep every page: a welding reader reads the dashboard area.
  const reader = f.account('Module reader', { profileId: f.profile('Module reader', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO }) });
  const c = f.client(); await c.login(reader.email);
  const weldC = (await json<{ user: User }>(await c.request('/bootstrap', { pilot: 'weld' }))).user;
  assert.equal(pilotItemState(item('weld', 'Dashboard'), rights(weldC)), 'open');
  assert.equal(await status(await c.request('/mto/materials-list', { pilot: 'mto' })), 200);
});

test('signatures follow the Signatures area 96 and exist in Weld Core only', async t => {
  const f = await fixture(t);
  const none = f.account('No signatures', { profileId: detailed(f.store, 'Without 96', { '63': ['show'] }) });
  const view = f.account('Sees signatures', { profileId: detailed(f.store, 'Show 96', { '63': ['show'], '96': ['show'] }) });
  const own = f.account('Signs', { profileId: detailed(f.store, 'Show and insert 96', { '63': ['show'], '96': ['show', 'insert'] }) });
  const signature = (user: { id: string; name: string }) => ({ name: user.name, userId: user.id, kind: 'Full signature' });
  for (const [user, read, write] of [[none, 403, 403], [view, 200, 403], [own, 200, 201]] as const) {
    const as = f.client(); await as.login(user.email);
    assert.equal(await status(await as.request('/records/signatures', { pilot: 'weld' })), read, `${user.name} list`);
    assert.equal(await status(await as.request('/records/signatures', { method: 'POST', pilot: 'weld', data: signature(user) })), write, `${user.name} save`);
    assert.equal(await status(await as.request('/records/signatures', { pilot: 'mto' })), 403, `${user.name} in Material Core`);
    assert.equal(await status(await as.request('/records/signatures', { method: 'POST', pilot: 'mto', data: { ...signature(user), kind: 'Short signature' } })), 403, `${user.name} save in Material Core`);
  }
  // Module levels (hosted): Signatures follow the Weld Core level; Read only views, Read & write saves.
  const reader = f.account('Weld reader signs', { profileId: f.profile('Weld read only', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO }) });
  const r = f.client(); await r.login(reader.email);
  assert.equal(await status(await r.request('/records/signatures', { pilot: 'weld' })), 200);
  assert.equal(await status(await r.request('/records/signatures', { method: 'POST', pilot: 'weld', data: signature(reader) })), 403);
});

test('entering a pilot depends on the application being enabled; with no area right the account gets no record, list, export or action', async t => {
  const f = await fixture(t);
  const isoFile = (await json<{ record: Row }>(await f.upload(f.admin, 'weld', 'isometrics', 'iso-1', 'Isometric note', 'iso-note.txt', 'text/plain'))).record;
  // A profile with page areas only: it enters both pilots, and nothing is delivered or allowed.
  const empty = f.account('Enabled without rights', { profileId: detailed(f.store, 'Page areas only', { '35': ['show'], '78': ['show'], '93': ['show'] }) });
  const as = f.client(); const entry = await as.login(empty.email);
  assert.deepEqual(entry.pilots, ['weld', 'mto']);
  for (const pilot of ['weld', 'mto']) {
    const body = await json<{ user: User; rows: Record<string, Row[]>; activity: unknown[] }>(await as.request('/bootstrap', { pilot }));
    assert.deepEqual(Object.entries(body.rows).filter(([, rows]) => rows.length).map(([key]) => key), [], `${pilot}: no records`);
    assert.deepEqual(body.activity, [], `${pilot}: no activity`);
  }
  const iso = f.store.get('isometrics', 'iso-1'), weld = f.store.get('welds', 'weld-1');
  const requests: [string, string, Options][] = [
    ['weld', '/records/welds', {}], ['weld', '/records/isometrics', {}], ['weld', '/records/projects', {}], ['weld', '/records/sites', {}], ['weld', '/records/welders', {}], ['weld', '/records/certifications', {}],
    ['weld', '/history/welds/weld-1', {}], ['weld', `/files/${isoFile.id}`, {}], ['weld', '/export/welds?format=csv', {}], ['weld', '/export/isometrics?format=csv', {}], ['weld', '/reports/lisl', {}],
    ['weld', '/pdf/lisl?isoId=iso-1', {}], ['weld', '/iso-book/parts?isoIds=iso-1', {}],
    ['weld', `/records/welds/${weld.id}`, { method: 'PUT', data: { description: 'No', _version: weld._version } }],
    ['weld', `/records/isometrics/${iso.id}`, { method: 'PUT', data: { area: 'No', _version: iso._version } }],
    ['weld', '/actions/save-weld', { method: 'POST', data: { isoId: 'iso-1', weldNo: 'W099' } }],
    ['weld', '/actions/phases', { method: 'POST', data: { isoIds: ['iso-1'], field_test: 'Complete' } }],
    ['weld', '/records/signatures', { method: 'POST', data: { name: 'No', userId: empty.id, kind: 'Full signature' } }],
    ['mto', '/records/iso_materials', {}], ['mto', '/records/stock', {}], ['mto', '/mto/materials-list', {}], ['mto', '/reports/mto', {}], ['mto', '/export/iso_materials?format=csv', {}],
    ['mto', '/actions/add-iso-material', { method: 'POST', data: { isoId: 'iso-1', source: 'Custom', materialNo: 'NO', description: 'No', quantity: 1, uom: 'M' } }],
  ];
  for (const [pilot, path, options] of requests) {
    const response = await as.request(path, { pilot, ...options });
    assert.ok([403, 404].includes(response.status), `${pilot} ${options.method || 'GET'} ${path}: ${response.status}`);
    assert.notEqual(response.status, 200);
  }
  // The application switched off: refused at the door.
  const row = f.store.get('users', empty.id); f.store.update('users', empty.id, { weldEnabled: false }, row._version);
  const refused = await as.request('/bootstrap', { pilot: 'weld' }); assert.equal(refused.status, 403); assert.equal((await json(refused)).code, 'pilot');
  assert.equal(await status(await as.request('/bootstrap', { pilot: 'mto' })), 200);
});

// ---- access-users-profiles-004 / 005 / 006 / 008 / 009 / 007 / 015 / 016 / 023 / delta-I2b-004 (w3-access-ui) ----
const hostedView = (key: string) => projectResource(availabilityFor(HOSTED_RELEASE_PROFILE)!, RESOURCE_MAP[key]);

test('new user form of the hosted pilots: no application ticked, one profile always chosen, Full rights first, Material Core block before Weld Core', () => {
  const users = hostedView('users');
  const field = (name: string) => users.fields.find(f => f.name === name)!;
  assert.deepEqual([field('weldEnabled').default, field('mtoEnabled').default], [false, false]);
  for (const name of ['weldProfileId', 'mtoProfileId']) assert.ok(field(name).required && field(name).noBlank, `${name} is required and has no empty option`);
  assert.equal(RESOURCE_MAP.users.fields.find(f => f.name === 'weldEnabled')!.default, true, 'other profiles keep their definition');
  const order = hostedFieldOrder('users', users.fields).map(f => f.name);
  assert.ok(order.indexOf('mtoEnabled') < order.indexOf('weldEnabled') && order.indexOf('mtoProfileId') < order.indexOf('weldProfileId') && order.indexOf('mtoSiteScope') < order.indexOf('weldSiteScope'));
  assert.deepEqual(order.slice(0, 5), ['name', 'email', 'profileId', 'active', 'password'], 'the other fields keep their order');
  const profiles = [{ id: 'p1', name: 'WPM' }, { id: 'p2', name: 'Full rights' }, { id: 'p3', name: 'External' }];
  assert.equal(defaultPilotProfileId(profiles), 'p2');
  assert.equal(defaultPilotProfileId([{ id: 'p3', name: 'External' }, { id: 'p1', name: 'WPM' }]), 'p3', 'without Full rights the first profile by name');
  assert.deepEqual(newUserProfileDefaults(profiles), { profileId: 'p2', weldProfileId: 'p2', mtoProfileId: 'p2' });
  assert.deepEqual(newUserProfileDefaults([]), {});
});

test('a new hosted account has no application ticked; a ticked application needs a profile; the first administrator has both', async t => {
  const f = await fixture(t);
  const full = f.profile('Everything', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const body = { name: 'New person', email: 'new-person@example.test', profileId: full, active: true, password: PASSWORD };
  const created = await json<{ record: Row }>(await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: body }));
  assert.deepEqual([created.record.weldEnabled, created.record.mtoEnabled], [false, false]);
  // A ticked application needs a profile: its own, or the account's permission profile, which the server works under where no pilot profile is chosen
  // (security-review sec1-001 ticks Material Core with the permission profile only). Without either it is refused.
  const { profileId: _general, ...withoutProfile } = body;
  const refused = await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: { ...withoutProfile, email: 'two@example.test', weldEnabled: true } });
  assert.equal(refused.status, 422); assert.ok((await json<{ fields?: Record<string, string> }>(refused)).fields?.weldProfileId);
  assert.equal(await status(await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: { ...body, email: 'two@example.test', weldEnabled: true } })), 201, 'the permission profile counts');
  assert.equal(await status(await f.admin.request('/records/users', { method: 'POST', pilot: 'weld', data: { ...body, email: 'three@example.test', weldEnabled: true, weldProfileId: full } })), 201);
  // Editing: ticking an application without any profile is refused; an older account (no flag, no pilot profile) can still be edited for other fields.
  const row = f.store.get('users', created.record.id);
  assert.equal(await status(await f.admin.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { mtoEnabled: true, profileId: '', _version: row._version } })), 422);
  assert.equal(await status(await f.admin.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Planner', _version: row._version } })), 200);
  const legacy = f.account('Legacy', { profileId: full });
  assert.equal(await status(await f.admin.request(`/records/users/${legacy.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Fitter', _version: legacy._version } })), 200);
  assert.equal(f.store.get('users', legacy.id).weldEnabled, true, 'an account saved before keeps both applications');
  const admin = f.store.list('users').find(u => u.email === 'access-admin@example.test')!;
  assert.deepEqual([admin.weldEnabled, admin.mtoEnabled], [true, true]);
  // The pure rule: the per-site profile table replaces the pilot's profile.
  assert.deepEqual(pilotProfileErrors({ weldEnabled: true, weldSiteScope: 'Specific project site(s)', mtoEnabled: false }), {});
});

test('user list columns, inactive switch, profiles page title and columns, and the Add / Update wording of the hosted profile', () => {
  const users = hostedView('users');
  assert.deepEqual(users.columns, ['email', 'name', 'title', 'companyId', 'phone', 'mtoEnabled', 'weldEnabled']);
  assert.deepEqual(HOSTED_COLUMN_LABELS.users, { mtoEnabled: 'Material Core', weldEnabled: 'Weld Core' });
  assert.ok(accountListed({ active: true }, false) && accountListed({}, false) && !accountListed({ active: false }, false) && accountListed({ active: false }, true) && !accountListed({ active: true }, true));
  const profiles = hostedView('profiles');
  assert.equal(profiles.title, 'Profiles'); assert.deepEqual(profiles.columns, ['name', 'description']);
  assert.deepEqual(profiles.columnLabels, { name: 'Name' });
  assert.equal(listDefaultSort('profiles', true, profiles.display), 'description');
  assert.ok(profiles.fields.find(f => f.name === 'description')!.required, 'Description is required');
  assert.equal(RESOURCE_MAP.profiles.title, 'Permission profiles', 'other profiles keep their page');
  for (const [key, add, edit] of [['sites', 'Add project site', 'Edit project site'], ['users', 'Add user', 'Edit user'], ['profiles', 'Add profile', 'Edit profile']]) assert.deepEqual([hostedView(key).wording?.add, hostedView(key).wording?.edit], [add, edit], key);
  assert.equal(RESOURCE_MAP.users.wording, undefined);
});

test('profile description is required on save only; existing profiles without one stay valid; duplicate copies the rights under a new name', async t => {
  const f = await fixture(t);
  const rules = JSON.stringify({ '63': ['show', 'edit'], '4': ['show'] });
  const source = f.store.create('profiles', { name: 'Source', permissionMode: 'Detailed permissions', permissionRules: rules });
  assert.ok(f.store.list('profiles').some(row => row.id === source.id && row.description === ''), 'an older profile has no description and is still valid');
  const send = (data: Record<string, unknown>, id = '') => f.admin.request(`/records/profiles${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', pilot: 'weld', data });
  assert.equal(await status(await send({ name: 'No description', permissionMode: 'Detailed permissions', permissionRules: '{}' })), 422);
  assert.equal(await status(await send({ name: 'Source', description: 'Now described', permissionMode: 'Detailed permissions', permissionRules: rules, _version: source._version }, source.id)), 200);
  const stored = f.store.get('profiles', source.id);
  const copy = await send(duplicateProfileData(stored, 'Source copy'));
  assert.equal(copy.status, 201);
  const made = (await json<{ record: Row }>(copy)).record;
  assert.deepEqual([made.name, made.description, made.permissionRules, made.permissionMode], ['Source copy', 'Now described', stored.permissionRules, 'Detailed permissions']);
  assert.notEqual(made.id, source.id);
  assert.deepEqual(parsePermissionRules(made.permissionRules), parsePermissionRules(stored.permissionRules), 'the copy has the same rights');
  const again = await send(duplicateProfileData(stored, 'Source copy'));
  assert.ok([409, 422].includes(again.status), 'an existing name is refused');
  assert.equal(duplicateProfileData({ ...stored, description: '' } as Row, 'X').description, 'X', 'a profile without a description is copied with the new name as its description');
  // The server decides who may copy: a profile may only be added by an account with the insert right on Profiles.
  const reader = f.account('Reader', { profileId: f.profile('Reads', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }) });
  const as = f.client(); await as.login(reader.email);
  assert.equal(await status(await as.request('/records/profiles', { method: 'POST', pilot: 'weld', data: duplicateProfileData(stored, 'Stolen copy') })), 403);
});

test('profile table of the hosted pilots: one alphabetical list of both applications, filter app, Show..Print labels', () => {
  const all = hostedProfileAreas(PERMISSION_AREAS, areaPilots, '');
  assert.ok(all.length > 60 && all.every(a => areaPilots(a.key).length > 0));
  assert.deepEqual(all.map(a => a.name), [...all.map(a => a.name)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  assert.ok(all.some(a => areaPilots(a.key).includes('weld')) && all.some(a => areaPilots(a.key).includes('mto')));
  const weld = hostedProfileAreas(PERMISSION_AREAS, areaPilots, 'weld'), mto = hostedProfileAreas(PERMISSION_AREAS, areaPilots, 'mto');
  assert.ok(weld.every(a => areaPilots(a.key).includes('weld')) && mto.every(a => areaPilots(a.key).includes('mto')) && weld.length < all.length && mto.length < all.length);
  assert.deepEqual(PROFILE_APP_FILTER.map(o => o.label), ['All apps', 'Material Core', 'Weld Core']);
  assert.deepEqual(PERMISSION_VERBS.map(v => HOSTED_VERB_LABELS[v]), ['Show', 'Insert', 'Edit', 'Delete', 'Export', 'Import', 'Print']);
});

test('the hosted sample workspace has the reference profiles with their rights; a plain seed and an existing workspace keep theirs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-access-profiles-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store, { hostedSample: true }); seedAccessSamples(store);
  try {
    const profiles = store.list('profiles');
    assert.deepEqual(profiles.map(p => p.name).sort(), ['Admin', 'External', 'Full rights', 'QAQC 01', 'WPM', 'Workpreparator 01']);
    assert.deepEqual(Object.fromEntries(profiles.map(p => [p.name, p.description])), { Admin: 'Admin', External: 'Only review', 'Full rights': 'This profile has full rights (Almost as admin)', 'QAQC 01': 'Highest rights for QAQC', WPM: 'Work Preparation Manager', 'Workpreparator 01': 'Standard profile for workpreparator' });
    const area = (name: string) => PERMISSION_AREAS.find(a => a.name === name)!.key;
    const rules = (name: string) => parsePermissionRules(profiles.find(p => p.name === name)!.permissionRules);
    const external = rules('External');
    assert.ok(external[area('Welds')].includes('show') && !external[area('Welds')].some(v => ['insert', 'edit', 'delete'].includes(v)));
    // The reference's 'Prefab/Field release' area (125) is not one of this workspace's permission areas (86 / 89 are), so its ticks are not part of the sample rules.
    assert.deepEqual(external[area('Release prefab')], ['show']);
    assert.equal(rules('Full rights')[area('Storehouses')], undefined, 'Full rights has no right on Storehouses');
    assert.ok(rules('WPM')[area('Welds')].includes('show'));
    assert.equal(profiles.find(p => p.name === 'Full rights')!.permissionMode, 'Detailed permissions');
    assert.equal(SAMPLE_PROFILES.length, 5);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('signatures: the background image is placed by size and alignment, the name sits centred at the bottom of the picture', () => {
  const canvas = { width: 800, height: 200 };
  assert.deepEqual(BACKGROUND_SIZES.map(o => o.value), [25, 50, 75, 100]);
  assert.deepEqual(DEFAULT_BACKGROUND, { size: 50, horizontal: 'center', vertical: 'center' });
  const centre = backgroundRect(canvas, { width: 400, height: 400 }, DEFAULT_BACKGROUND);
  assert.deepEqual(centre, { x: 350, y: 50, width: 100, height: 100 }, 'half of the height, centred');
  assert.deepEqual(backgroundRect(canvas, { width: 400, height: 400 }, { size: 100, horizontal: 'left', vertical: 'top' }), { x: 0, y: 0, width: 200, height: 200 });
  const corner = backgroundRect(canvas, { width: 1600, height: 200 }, { size: 25, horizontal: 'right', vertical: 'bottom' });
  assert.deepEqual([corner.width, corner.height, corner.x + corner.width, corner.y + corner.height], [200, 25, 800, 200]);
  assert.deepEqual(nameOverlayPlacement(canvas), { x: 400, y: 194 });
});

// ----- access-users-profiles-013: Users accounts (26) and Profiles (53) box by box -------------------------------------
const ALL_26 = ['show', 'insert', 'edit', 'delete', 'export'], ALL_53 = ['show', 'insert', 'edit', 'delete', 'export'];
test('Users accounts and Profiles follow their own boxes: Show + Export lists and exports accounts, nothing more', async t => {
  const f = await fixture(t);
  // The pure rule: matrix boxes one by one; module levels keep the administrator rule; links are read only.
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const matrix = (rules: Record<string, string[]>): User => ({ id: 'u', name: 'U', email: 'u@example.test', profileId: 'p', availability: hosted, permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 1 }, capabilities: rules as User['capabilities'] });
  const viewer = matrix({ '26': ['show', 'export'] });
  assert.deepEqual(['show', 'export', 'insert', 'edit', 'delete'].map(verb => usersProfilesRight(viewer, 'users', verb as 'show')), [true, true, false, false, false]);
  assert.equal(usersProfilesRight(viewer, 'profiles', 'show'), false);
  assert.equal(usersProfilesRight(matrix({ '26': ALL_26 }), 'user_sites', 'insert'), false, 'project-site links are written through the user form only');
  assert.equal(canChangeRights(matrix({ '26': ALL_26, '53': ['show', 'insert'] })), false);
  assert.ok(canChangeRights(matrix({ '26': ['edit'], '53': ['edit'] })));
  const levels: User = { ...viewer, capabilities: undefined };
  assert.equal(usersProfilesRight({ ...levels, permissions: { ...levels.permissions, settings: 2 } }, 'users', 'show'), false, 'module levels: administrators only, as before');
  assert.ok(usersProfilesRight({ ...levels, permissions: { ...levels.permissions, settings: 3 } }, 'users', 'edit'));
  // Over the API.
  const reader = f.account('Account reader', { profileId: detailed(f.store, 'Accounts show and export', { '26': ['show', 'export'], '63': ['show'] }) });
  const as = f.client(); await as.login(reader.email);
  for (const pilot of ['weld', 'mto']) {
    const list = await as.request('/records/users', { pilot }); assert.equal(list.status, 200, pilot);
    assert.ok((await json<{ rows: Row[] }>(list)).rows.every(row => row.password === undefined), 'passwords stay write-only');
    const exported = await as.request('/export/users?format=csv', { pilot }); assert.equal(exported.status, 200, `${pilot} export`);
    assert.ok(!(await exported.text()).includes('password'), 'the export has no password column');
    const boot = await json<{ rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot }));
    assert.ok(boot.rows.users.length > 0); assert.equal(boot.rows.profiles, undefined, 'no Profiles box, no profiles');
    assert.equal(await status(await as.request('/records/profiles', { pilot })), 403);
  }
  assert.equal(await status(await as.request(`/history/users/${reader.id}`, { pilot: 'weld' })), 200);
  const other = f.store.list('users').find(row => row.email === 'access-admin@example.test')!;
  assert.equal(await status(await as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'New account', email: 'new-account@example.test', profileId: 'profile-admin', active: true, password: 'New-Account-Password' } })), 403, 'no Insert box');
  assert.equal(await status(await as.request(`/records/users/${other.id}`, { method: 'PUT', pilot: 'weld', data: { name: 'Renamed', _version: other._version } })), 403, 'no Edit box');
  assert.equal(await status(await as.request(`/records/users/${other.id}/archive`, { method: 'POST', pilot: 'weld', data: { _version: other._version } })), 403, 'no Delete box');
  assert.equal(f.store.get('users', other.id).name, 'Access admin');
});

test('a profile editor without Edit on User accounts edits profiles but not rights or accounts; Edit on accounts alone cannot change a profile or a password', async t => {
  const f = await fixture(t);
  const keyUser = f.account('Profile editor', { profileId: detailed(f.store, 'Profiles insert and edit', { '26': ['show'], '53': ['show', 'insert', 'edit'] }) });
  const as = f.client(); await as.login(keyUser.email);
  const reviewer = detailed(f.store, 'Reviewer matrix', { '63': ['show'] });
  // Profiles: add (without rights: a new profile with rights needs Edit on both 26 and 53, sec2-013), rename and describe.
  const withRights = await as.request('/records/profiles', { method: 'POST', pilot: 'weld', data: { name: 'Key user profile', description: 'Key user', permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '63': ['show', 'edit'] }) } });
  assert.equal(withRights.status, 403); assert.match((await json<{ error: string }>(withRights)).error, /Edit right on both User accounts and Profiles/);
  const created = await as.request('/records/profiles', { method: 'POST', pilot: 'weld', data: { name: 'Key user profile', description: 'Key user', permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({}) } });
  assert.equal(created.status, 201);
  let target = f.store.get('profiles', reviewer);
  assert.equal(await status(await as.request(`/records/profiles/${reviewer}`, { method: 'PUT', pilot: 'weld', data: { name: 'Reviewer (renamed)', _version: target._version } })), 200);
  // Rights of a profile: Edit on both 26 and 53.
  target = f.store.get('profiles', reviewer);
  const rights = await as.request(`/records/profiles/${reviewer}`, { method: 'PUT', pilot: 'weld', data: { permissionRules: JSON.stringify({ '63': ['show', 'insert', 'edit'] }), _version: target._version } });
  assert.equal(rights.status, 403); assert.match((await json<{ error: string }>(rights)).error, /Edit right on both User accounts and Profiles/);
  assert.deepEqual(JSON.parse(String(f.store.get('profiles', reviewer).permissionRules)), { '63': ['show'] });
  // An account's profile: refused (no Edit on 26).
  const someone = f.account('Someone', { profileId: reviewer });
  assert.equal(await status(await as.request(`/records/users/${someone.id}`, { method: 'PUT', pilot: 'weld', data: { profileId: 'profile-admin', _version: f.store.get('users', someone.id)._version } })), 403);
  // Edit on User accounts without Edit on Profiles: the account's details yes, its profile or password no.
  const manager = f.account('Account editor', { profileId: detailed(f.store, 'Accounts edit only', { '26': ['show', 'insert', 'edit'], '53': ['show'] }) });
  const m = f.client(); await m.login(manager.email);
  let row = f.store.get('users', someone.id);
  assert.equal(await status(await m.request(`/records/users/${someone.id}`, { method: 'PUT', pilot: 'weld', data: { title: 'Inspector', _version: row._version } })), 200);
  row = f.store.get('users', someone.id);
  for (const change of [{ profileId: 'profile-admin' }, { weldProfileId: 'profile-admin' }, { mtoProfileId: reviewer }]) {
    const refused = await m.request(`/records/users/${someone.id}`, { method: 'PUT', pilot: 'weld', data: { ...change, _version: row._version } });
    assert.equal(refused.status, 403, JSON.stringify(change)); assert.match((await json<{ error: string }>(refused)).error, /Edit right on both/);
  }
  assert.equal(f.store.get('users', someone.id).profileId, reviewer, 'rolled back');
  const admin = f.store.list('users').find(item => item.email === 'access-admin@example.test')!;
  const takeover = await m.request(`/records/users/${admin.id}`, { method: 'PUT', pilot: 'weld', data: { password: 'Taken-Over-Password', _version: admin._version } });
  assert.equal(takeover.status, 403, 'no password of another account');
  assert.equal((await f.client().request('/auth/login', { method: 'POST', data: { email: 'access-admin@example.test', password: 'Taken-Over-Password' } })).status, 401);
  // A new account always gets a profile, so adding one needs the same rights.
  assert.equal(await status(await m.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Added', email: 'added@example.test', profileId: reviewer, active: true, password: 'Added-Account-Password' } })), 403);
  assert.equal(f.store.list('users').some(item => item.email === 'added@example.test'), false);
});

test('an account cannot widen its own profile, its own applications or its own site list; the last administrator stays', async t => {
  const f = await fixture(t);
  const managerProfile = detailed(f.store, 'User administration', { '26': ALL_26, '53': ALL_53, '63': ['show'] });
  const narrower = detailed(f.store, 'User administration light', { '26': ['show'], '53': ['show'] });
  const manager = f.account('User administrator', { profileId: managerProfile, mtoEnabled: false });
  const as = f.client(); await as.login(manager.email);
  const own = () => f.store.get('users', manager.id);
  // Own profile: never wider; narrower is allowed.
  for (const change of [{ profileId: 'profile-admin' }, { weldProfileId: 'profile-admin' }, { mtoEnabled: true }]) {
    const refused = await as.request(`/records/users/${manager.id}`, { method: 'PUT', pilot: 'weld', data: { ...change, _version: own()._version } });
    assert.equal(refused.status, 403, JSON.stringify(change)); assert.match((await json<{ error: string }>(refused)).error, /cannot widen your own access/);
  }
  assert.deepEqual([own().profileId, own().mtoEnabled], [managerProfile, false]);
  // Own site list (w2-access-core rule, still in place).
  assert.equal(await status(await as.request(`/records/users/${manager.id}`, { method: 'PUT', pilot: 'weld', data: { weldSiteScope: SITE_SCOPE_SPECIFIC, weldSiteIds: ['site-north'], _version: own()._version } })), 403);
  // The rights of the profile its own account uses: never wider.
  let profile = f.store.get('profiles', managerProfile);
  const wider = await as.request(`/records/profiles/${managerProfile}`, { method: 'PUT', pilot: 'weld', data: { permissionRules: JSON.stringify({ '26': ALL_26, '53': ALL_53, '63': ['show', 'insert', 'edit', 'delete'] }), _version: profile._version } });
  assert.equal(wider.status, 403); assert.match((await json<{ error: string }>(wider)).error, /cannot widen your own access/);
  // Another profile's rights: allowed with Edit on both.
  const reviewer = detailed(f.store, 'Reviewer for edit', { '63': ['show'] }), reviewerRow = f.store.get('profiles', reviewer);
  assert.equal(await status(await as.request(`/records/profiles/${reviewer}`, { method: 'PUT', pilot: 'weld', data: { permissionRules: JSON.stringify({ '63': ['show', 'edit'] }), _version: reviewerRow._version } })), 200);
  // Narrowing its own profile is allowed.
  profile = f.store.get('profiles', managerProfile);
  assert.equal(await status(await as.request(`/records/profiles/${managerProfile}`, { method: 'PUT', pilot: 'weld', data: { permissionRules: JSON.stringify({ '26': ALL_26, '53': ALL_53 }), _version: profile._version } })), 200);
  // The last administrator: once the manager is the only one, it cannot narrow itself away.
  const admin = f.store.list('users').find(item => item.email === 'access-admin@example.test')!;
  // The manager is not enabled in Material Core, so it may not archive an account that reaches Material Core (security-review sec1-001); the sample administrator is archived directly.
  assert.equal(await status(await as.request(`/records/users/${admin.id}/archive`, { method: 'POST', pilot: 'weld', data: { _version: admin._version } })), 403, 'an account reaching more than the manager');
  f.store.archive('users', admin.id, admin._version, { id: 'test', name: 'test' });
  const last = await as.request(`/records/users/${manager.id}`, { method: 'PUT', pilot: 'weld', data: { profileId: narrower, _version: own()._version } });
  assert.equal(last.status, 409, 'the last administrator cannot be removed');
  assert.equal(own().profileId, managerProfile);
});

// ----- wave 3 integration (E1): the rules of w3-security-fixes, w3-access-session-sites and w3-access-ui hold together ------
test('E1: an own narrowing is refused like an own widening, a manager without Material Core creates no MTO account, and a new account starts with both applications off', async t => {
  const f = await fixture(t);
  const managerProfile = detailed(f.store, 'Account manager', { '26': ALL_26, '53': ALL_53, '63': ['show'] });
  const narrower = detailed(f.store, 'Account viewer', { '26': ['show'], '53': ['show'] });
  const manager = f.account('Account manager', { profileId: managerProfile, weldProfileId: managerProfile, mtoEnabled: false });
  const as = f.client(); await as.login(manager.email);
  const own = () => f.store.get('users', manager.id);
  // Narrowing its own Weld profile passes the widening check (w3-access-session-sites) but no account changes its own profiles (sec1-002).
  const narrow = await as.request(`/records/users/${manager.id}`, { method: 'PUT', pilot: 'weld', data: { weldProfileId: narrower, _version: own()._version } });
  assert.equal(narrow.status, 403); assert.match((await json<{ error: string }>(narrow)).error, /cannot change your own applications or permission profiles/);
  // Widening says so.
  const widen = await as.request(`/records/users/${manager.id}`, { method: 'PUT', pilot: 'weld', data: { weldProfileId: 'profile-admin', _version: own()._version } });
  assert.equal(widen.status, 403); assert.match((await json<{ error: string }>(widen)).error, /cannot widen your own access/);
  assert.deepEqual([own().weldProfileId, own().mtoEnabled], [managerProfile, false], 'nothing stored');
  // Not enabled in Material Core: no account that reaches Material Core (sec1-001), even with Edit on User accounts and Profiles.
  const users = f.store.list('users').length;
  assert.equal(await status(await as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'MTO planner', email: 'mto-planner@example.test', profileId: narrower, active: true, mtoEnabled: true, mtoProfileId: narrower, password: PASSWORD } })), 403);
  assert.equal(f.store.list('users').length, users, 'no account was created');
  // A new account starts with both applications off (w3-access-ui); ticking Weld Core needs a profile, the permission profile counts.
  const created = await json<{ record: Row }>(await as.request('/records/users', { method: 'POST', pilot: 'weld', data: { name: 'Weld viewer', email: 'weld-viewer@example.test', profileId: narrower, active: true, password: PASSWORD } }));
  assert.deepEqual([created.record.weldEnabled, created.record.mtoEnabled], [false, false]);
  const row = f.store.get('users', created.record.id);
  assert.equal(await status(await as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { weldEnabled: true, profileId: '', _version: row._version } })), 422, 'no profile at all');
  assert.equal(await status(await as.request(`/records/users/${row.id}`, { method: 'PUT', pilot: 'weld', data: { weldEnabled: true, weldProfileId: narrower, _version: row._version } })), 200);
});

// ----- w1-left-6: storehouses are Material Core records -----------------------------------------------------------------------
test('a Weld Core session gets no storehouses, even for an account with MTO rights; Material Core keeps them', async t => {
  const f = await fixture(t);
  const both = f.account('Both cores writer', { profileId: f.profile('All rights writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }) });
  const as = f.client(); await as.login(both.email);
  const weld = await json<{ rows: Record<string, Row[]>; activity: { entityType: string }[] }>(await as.request('/bootstrap', { pilot: 'weld' }));
  assert.deepEqual(weld.rows.warehouses ?? [], [], 'no storehouse rows in the Weld Core bootstrap');
  assert.ok(!weld.activity.some(event => event.entityType === 'warehouses'));
  const warehouse = f.store.list('warehouses')[0]; assert.ok(warehouse, 'sample storehouse');
  for (const path of ['/records/warehouses', `/history/warehouses/${warehouse.id}`, '/export/warehouses?format=csv']) assert.equal(await status(await as.request(path, { pilot: 'weld' })), 403, path);
  assert.equal(await status(await as.request(`/records/warehouses/${warehouse.id}`, { method: 'PUT', pilot: 'weld', data: { phone: '1', _version: warehouse._version } })), 403);
  const mto = await json<{ rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot: 'mto' }));
  assert.ok(mto.rows.warehouses.length > 0, 'Material Core unchanged');
  assert.equal(await status(await as.request('/records/warehouses', { pilot: 'mto' })), 200);
});
