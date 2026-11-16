import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, projectResource } from '../shared/release.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { ITP_ADD_FIELDS, ITP_COLUMNS, ITP_EDIT_FIELDS, ITP_SCOPES, allowedScopes, importFromIsometrics, isoWriteErrors, itpDeleteRefusal, itpLatest, itpPickerLabel, itpPickerOptions, itpScope, itpSlots, linkItp } from '../shared/itps.ts';
import type { Row } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data } as Row);
const shop = row('shop', { number: 'S-1', scope: 'Shop', ndtPercent: 10 }), field = row('field', { number: 'F-1', scope: 'Field', ndtPercent: 30 });
const both = row('both', { number: 'B-1', scope: 'Shop+Field', ndtPercent: 14 }), legacy = row('legacy', { number: 'L-1' }), off = row('off', { number: 'O-1', scope: 'Shop', active: false });
const itps = [shop, field, both, legacy, off];
const iso = (data: Record<string, unknown> = {}) => row('iso', { projectId: 'p1', itpNo: '', itpNo2: '', xRay: '5', ...data });

// ----- rules (shared/itps.ts) -----------------------------------------------------------------------------------------

test('ITP register: scope Shop / Field / Shop+Field, an entry without a scope counts as Shop+Field, the page columns and dialogs follow the manual', () => {
  assert.deepEqual([...ITP_SCOPES], ['Shop', 'Field', 'Shop+Field']);
  assert.deepEqual([itpScope(shop), itpScope(field), itpScope(both), itpScope(legacy)], ['Shop', 'Field', 'Shop+Field', 'Shop+Field']);
  assert.deepEqual([...ITP_COLUMNS], ['ITP No', 'Title', 'Scope', 'X Ray %', 'Latest Rev', 'Isometrics', 'Active', 'Options']);
  const hosted = projectResource(availabilityFor(HOSTED_RELEASE_PROFILE), RESOURCE_MAP.itps);
  const label = (name: string) => hosted.fields.find(f => f.name === name)!.label;
  assert.deepEqual(ITP_ADD_FIELDS.map(label), ['ITP No', 'Title', 'Description', 'Scope', 'X-Ray %']);
  assert.deepEqual(ITP_EDIT_FIELDS.map(label), ['ITP No', 'Title', 'Description', 'Scope', 'X-Ray %', 'Sort order', 'Active']);
  assert.deepEqual(RESOURCE_MAP.itps.fields.find(f => f.name === 'scope')!.options, ['Shop', 'Field', 'Shop+Field']);
  assert.equal(itpPickerLabel(row('x', { number: '111111', title: 'Piping', scope: 'Field' }), '2'), '111111 — Piping [Field] (Rev 2)');
});

test('slot rule of the picker: an empty isometric takes any scope; Shop leaves Field for ITP No 2; Shop+Field fills both domains (1/1)', () => {
  assert.deepEqual(allowedScopes(iso(), itps, 'any'), ['Shop', 'Field', 'Shop+Field']);
  assert.deepEqual(allowedScopes(iso({ itpId: 'shop' }), itps, 'any'), ['Field']);
  assert.deepEqual(allowedScopes(iso({ itp2Id: 'field' }), itps, 'any'), ['Shop', 'Shop+Field']);
  assert.deepEqual(allowedScopes(iso({ itp2Id: 'field' }), itps, 'primary'), ['Shop']);
  assert.deepEqual(allowedScopes(iso({ itpId: 'both' }), itps, 'any'), []);
  assert.deepEqual(allowedScopes(iso({ itpId: 'both' }), itps, 'secondary'), []);
  assert.deepEqual(allowedScopes(iso({ itpId: 'shop', itp2Id: 'field' }), itps, 'any'), []);
  assert.deepEqual(itpSlots(iso(), itps), { count: 0, max: 2, counter: '0/2', showSecond: true, canLink: true });
  assert.deepEqual(itpSlots(iso({ itpId: 'both', itpNo: 'B-1' }), itps), { count: 1, max: 1, counter: '1/1', showSecond: false, canLink: false });
  assert.deepEqual(itpSlots(iso({ itpId: 'shop', itp2Id: 'field' }), itps).counter, '2/2');
  // Free-text numbers are not links (reference: 111111 / 222222 as text, counter 0/2).
  assert.equal(itpSlots(iso({ itpNo: '111111', itpNo2: '222222' }), itps).counter, '0/2');
});

test('Link ITP: Shop+Field sets ITP No and clears ITP No 2; Field sets ITP No 2 only; X Ray % follows the NDT %', () => {
  const full = linkItp(iso({ itp2Id: '', itpNo2: 'OLD-2' }), both, itps, [], 'any', '3');
  assert.deepEqual(full, { values: { itpId: 'both', itpNo: 'B-1', itpRevNo: '3', itp2Id: '', itpNo2: '', xRay: '14' } });
  const second = linkItp(iso({ itpId: 'shop', itpNo: 'S-1' }), field, itps, [], 'any', '0');
  assert.deepEqual(second, { values: { itp2Id: 'field', itpNo2: 'F-1', itp2RevNo: '0', xRay: '10' } }); // slot 1's NDT % stays the X Ray %
  assert.deepEqual(linkItp(iso(), field, itps, [], 'primary', '').values, { itp2Id: 'field', itpNo2: 'F-1', xRay: '30' }); // the scope decides the slot
  assert.match(linkItp(iso({ itpId: 'both' }), field, itps, [], 'any', '').error!, /Both ITP slots are covered/);
  assert.match(linkItp(iso({ itpId: 'shop' }), both, itps, [], 'any', '').error!, /Shop\+Field ITP cannot be linked here/);
  assert.match(linkItp(iso(), off, itps, [], 'any', '').error!, /inactive/);
  assert.match(linkItp(iso({ projectId: 'p2' }), shop, itps, [row('l', { itpId: 'shop', projectId: 'p1' })], 'any', '').error!, /not linked to this isometric's project/);
  assert.equal(linkItp(iso(), undefined, itps, [], 'any', '').error, 'Choose an ITP from the list.');
  // An ITP without NDT % keeps the X Ray % the isometric already has.
  assert.equal(linkItp(iso(), legacy, itps, [], 'any', '').values.xRay, undefined);
});

test('scn-SB-N5: the picker offers active ITPs of the allowed scopes; an ITP needs no project to be offered unless it is limited to projects', () => {
  const ids = (data: Record<string, unknown>, slot: 'any' | 'primary' | 'secondary', links: Row[] = []) => itpPickerOptions(iso(data), itps, links, slot).map(itp => itp.id);
  assert.deepEqual(ids({}, 'any'), ['both', 'field', 'legacy', 'shop']);            // the inactive O-1 is not offered
  assert.deepEqual(ids({ itpId: 'shop' }, 'secondary'), ['field']);
  assert.deepEqual(ids({ itpId: 'both' }, 'any'), []);
  assert.deepEqual(ids({}, 'any', [row('l', { itpId: 'field', projectId: 'p9' })]), ['both', 'legacy', 'shop']);
});

test('X Ray % and the slots are not written through the isometric form: X Ray % is refused, a Field ITP cannot sit in ITP No', () => {
  const stored = iso({ itpId: 'shop' });
  assert.deepEqual(Object.keys(isoWriteErrors({ xRay: '20' }, stored, itps)), ['xRay']);
  assert.deepEqual(isoWriteErrors({ xRay: '5', description: 'x' }, stored, itps), {});     // unchanged value from the form
  assert.deepEqual(Object.keys(isoWriteErrors({ xRay: '7' }, undefined, itps)), ['xRay']);
  assert.deepEqual(Object.keys(isoWriteErrors({ itpId: 'field' }, iso(), itps)), ['itpId']);
  assert.deepEqual(Object.keys(isoWriteErrors({ itp2Id: 'shop' }, iso(), itps)), ['itp2Id']);
  assert.deepEqual(Object.keys(isoWriteErrors({ itpId: 'both' }, iso({ itp2Id: 'field' }), itps)), ['itp2Id']);
  assert.deepEqual(isoWriteErrors({ itp2Id: 'field' }, stored, itps), {});
  const hosted = projectResource(availabilityFor(HOSTED_RELEASE_PROFILE), RESOURCE_MAP.isometrics);
  const xRay = hosted.fields.find(f => f.name === 'xRay')!;
  assert.deepEqual([xRay.label, xRay.readonly], ['X Ray %', true]);
  assert.equal(hosted.fields.find(f => f.name === 'ndtPercentage')?.hidden, true);       // one X Ray field only
  // The other profiles keep their editable text field.
  assert.notEqual(projectResource(availabilityFor('access-prototype'), RESOURCE_MAP.isometrics).fields.find(f => f.name === 'xRay')!.readonly, true);
});

test('delete refusal, latest revision and the import plan', () => {
  assert.match(itpDeleteRefusal(shop, [row('i1', { itpId: 'shop' }), row('i2', { itp2Id: 'shop' }), row('i3', { itpId: 'shop', _archived: true })]), /linked to 2 isometrics\. Unlink it from those isometrics first, or set the ITP to inactive\./);
  assert.equal(itpDeleteRefusal(shop, [row('i1', { itpId: 'field' })]), '');
  const files = [row('a1', { entityType: 'itps', entityId: 'shop', documentType: 'ITP revision', revNo: '0', _createdAt: '2026-10-01T00:00:00.000Z' }), row('a2', { entityType: 'itps', entityId: 'shop', documentType: 'ITP revision', revNo: '1', _createdAt: '2026-10-02T00:00:00.000Z' }), row('a3', { entityType: 'itps', entityId: 'shop', documentType: 'Attachment', _createdAt: '2026-10-03T00:00:00.000Z' })];
  assert.deepEqual([itpLatest(shop, files).revNo, itpLatest(shop, files).file?.id], ['1', 'a2']);
  assert.equal(itpLatest(row('x', { revision: '4' }), files).revNo, '4');
  const plan = importFromIsometrics([
    row('i1', { itpNo: '111111', itpRevNo: '2', itpNo2: '222222', xRay: '14' }), row('i2', { itpNo: '111111', itpRevNo: '2', xRay: '14 %' }),
    row('i3', { itpNo2: '222222', xRay: '20' }), row('i4', { itpNo: 'S-1' }), row('i5', { itpNo: '333', itpNo2: '333' }),
  ], itps);
  assert.deepEqual(plan.create, [{ number: '333', scope: 'Shop', ndtPercent: null, revision: '' }, { number: '111111', scope: 'Shop', ndtPercent: 14, revision: '2' }, { number: '222222', scope: 'Field', ndtPercent: null, revision: '' }]);
  assert.deepEqual(plan.link.map(link => `${link.isoId}.${link.field}`), ['i1.itpId', 'i1.itp2Id', 'i2.itpId', 'i3.itp2Id', 'i5.itpId']);
});

// ----- HTTP (hosted profile) ----------------------------------------------------------------------------------------

const PASSWORD = 'Itps-Test-Password';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-itps-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  let cookie = '';
  const request = async (path: string, { method = 'GET', pilot = 'weld', data }: { method?: string; pilot?: string; data?: unknown } = {}) => {
    const form = data instanceof FormData;
    const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, 'X-Stelux-Pilot': pilot, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  assert.equal((await request('/auth/setup', { method: 'POST', data: { name: 'Itps admin', email: 'itps-admin@example.test', password: PASSWORD } })).status, 201);
  const reader = async () => {
    const profile = store.create('profiles', { name: 'Itps reader profile', settingsPermission: 'No access', toolsPermission: 'No access', generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read only' });
    const user = store.create('users', { name: 'Itps reader', email: 'itps-reader@example.test', active: true, profileId: profile.id });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    cookie = ''; assert.equal((await request('/auth/login', { method: 'POST', data: { email: 'itps-reader@example.test', password: PASSWORD } })).status, 200);
  };
  return { store, request, reader };
}
const json = async <T = Record<string, any>>(response: Response) => await response.json() as T;
const pdf = (data: Record<string, string>, name = 'itp.pdf') => { const form = new FormData(); for (const [key, value] of Object.entries(data)) form.set(key, value); form.set('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), name); return form; };

test('Add ITP with its first revision and PDF; uploading a revision makes it the latest and reaches the linked isometrics', async t => {
  const f = await fixture(t);
  const noFile = new FormData(); noFile.set('number', 'ITP-20'); noFile.set('revNo', '0');
  assert.equal((await f.request('/itps', { method: 'POST', data: noFile })).status, 422);
  assert.equal((await f.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-20', revNo: '' }) })).status, 422);
  assert.equal((await f.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-20', revNo: '0' }, 'itp.txt') })).status, 422);
  assert.equal((await f.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-01', revNo: '0' }) })).status, 422);       // number exists
  const created = await f.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-20', title: 'Hydrotest piping', scope: 'Shop', ndtPercent: '14', revNo: '0', comment: 'First issue' }) });
  assert.equal(created.status, 201);
  const itp = (await json(created)).record as Row;
  assert.deepEqual([itp.number, itp.title, itp.scope, itp.ndtPercent, itp.revision, itp.active], ['ITP-20', 'Hydrotest piping', 'Shop', 14, '0', true]);
  const files = () => f.store.list('attachments').filter(file => file.entityType === 'itps' && file.entityId === itp.id);
  assert.deepEqual(files().map(file => [file.documentType, file.revNo, file.note]), [['ITP revision', '0', 'First issue']]);
  // Link it to iso-7 (free text, no link yet): slot 1, X Ray % 14.
  const linked = await f.request('/itps/link', { method: 'POST', data: { isoId: 'iso-7', itpId: itp.id, slot: 'any' } });
  assert.equal(linked.status, 200);
  assert.deepEqual((({ itpId, itpNo, itpRevNo, xRay }) => ({ itpId, itpNo, itpRevNo, xRay }))((await json(linked)).record as Row), { itpId: itp.id, itpNo: 'ITP-20', itpRevNo: '0', xRay: '14' });
  // Revision upload: the same number is refused, a new one becomes the latest and is copied into the linked isometric.
  assert.equal((await f.request(`/itps/${itp.id}/revisions`, { method: 'POST', data: pdf({ revNo: '0' }) })).status, 422);
  const uploaded = await f.request(`/itps/${itp.id}/revisions`, { method: 'POST', data: pdf({ revNo: '1', comment: 'Hold points added' }, 'itp-rev1.pdf') });
  assert.equal(uploaded.status, 201);
  assert.equal(((await json(uploaded)).record as Row).revision, '1');
  assert.equal(itpLatest(f.store.get('itps', itp.id), f.store.list('attachments')).revNo, '1');
  assert.equal(files().length, 2);
  assert.equal(f.store.get('isometrics', 'iso-7').itpRevNo, '1');
  // Edit: a changed X-Ray % is synchronised with the linked isometric.
  const stored = f.store.get('itps', itp.id);
  assert.equal((await f.request(`/records/itps/${itp.id}`, { method: 'PUT', data: { ndtPercent: 25, _version: stored._version } })).status, 200);
  assert.equal(f.store.get('isometrics', 'iso-7').xRay, '25');
});

test('Link ITP on the server: Shop+Field sets ITP No and clears ITP No 2, Field sets ITP No 2 only; a PATCH of X Ray % is refused', async t => {
  const f = await fixture(t);
  const add = async (number: string, scope: string, ndtPercent: string) => (await json(await f.request('/itps', { method: 'POST', data: pdf({ number, scope, ndtPercent, revNo: '1' }) }))).record as Row;
  const combined = await add('ITP-SF', 'Shop+Field', '14'), fieldOnly = await add('ITP-F', 'Field', '30'), shopOnly = await add('ITP-S', 'Shop', '10');
  const link = (isoId: string, itpId: string, slot = 'any') => f.request('/itps/link', { method: 'POST', data: { isoId, itpId, slot } });
  // iso-8 has free text in both slots: Shop+Field fills ITP No and clears ITP No 2.
  f.store.update('isometrics', 'iso-8', { itpNo2: 'FREE-2' }, f.store.get('isometrics', 'iso-8')._version);
  const full = (await json(await link('iso-8', combined.id))).record as Row;
  assert.deepEqual([full.itpId, full.itpNo, full.itp2Id, full.itpNo2, full.xRay], [combined.id, 'ITP-SF', '', '', '14']);
  assert.equal((await link('iso-8', fieldOnly.id)).status, 422);                                   // 1/1: nothing more to link
  // iso-9: Field fills ITP No 2 only, then Shop fills ITP No.
  const before = f.store.get('isometrics', 'iso-9');
  const second = (await json(await link('iso-9', fieldOnly.id))).record as Row;
  assert.deepEqual([second.itp2Id, second.itpNo2, second.itpId, second.itpNo, second.xRay], [fieldOnly.id, 'ITP-F', before.itpId, before.itpNo, '30']);
  const first = (await json(await link('iso-9', shopOnly.id))).record as Row;
  assert.deepEqual([first.itpId, first.itpNo, first.itp2Id, first.xRay], [shopOnly.id, 'ITP-S', fieldOnly.id, '10']);
  // An inactive ITP is not linked.
  const inactive = await add('ITP-OFF', 'Shop', '5');
  assert.equal((await f.request(`/records/itps/${inactive.id}`, { method: 'PUT', data: { active: false, _version: f.store.get('itps', inactive.id)._version } })).status, 200);
  assert.equal((await link('iso-10', inactive.id)).status, 422);
  // X Ray % is read-only: a PATCH with another value is refused, the same value passes, bulk edit is refused.
  const iso = f.store.get('isometrics', 'iso-9');
  const patch = await f.request('/records/isometrics/iso-9', { method: 'PUT', data: { xRay: '50', _version: iso._version } });
  assert.equal(patch.status, 422); assert.match((await json(patch)).error, /X Ray % is taken from the linked ITP/);
  assert.equal((await f.request('/records/isometrics/iso-9', { method: 'PUT', data: { xRay: '10', description: 'Line 9', _version: iso._version } })).status, 200);
  assert.equal((await f.request('/bulk/isometrics', { method: 'POST', data: { ids: ['iso-9'], changes: { xRay: '50' }, versions: { 'iso-9': f.store.get('isometrics', 'iso-9')._version } } })).status, 422);
  assert.equal(f.store.get('isometrics', 'iso-9').xRay, '10');
  // Unlink keeps the number and the X Ray %.
  const unlinked = (await json(await f.request('/itps/unlink', { method: 'POST', data: { isoId: 'iso-9', slot: 1 } }))).record as Row;
  assert.deepEqual([unlinked.itpId, unlinked.itpNo, unlinked.xRay], ['', 'ITP-S', '10']);
  // The record form cannot put a Field ITP into ITP No.
  const stale = f.store.get('isometrics', 'iso-10');
  assert.equal((await f.request('/records/isometrics/iso-10', { method: 'PUT', data: { itpId: fieldOnly.id, _version: stale._version } })).status, 422);
});

test('deleting an ITP linked to an isometric is refused; unlinked it can be deleted; Import from isometrics creates and links; a reader cannot write', async t => {
  const f = await fixture(t);
  const itp = f.store.get('itps', 'itp-01');
  const refused = await f.request('/records/itps/itp-01/archive', { method: 'POST', data: { _version: itp._version } });
  assert.equal(refused.status, 422); assert.match((await json(refused)).error, /ITP ITP-01 is linked to 3 isometrics\. Unlink it from those isometrics first, or set the ITP to inactive\./);
  assert.equal(f.store.get('itps', 'itp-01')._archived, false);
  const spare = (await json(await f.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-SPARE', revNo: '0' }) }))).record as Row;
  assert.equal((await f.request(`/records/itps/${spare.id}/archive`, { method: 'POST', data: { _version: spare._version } })).status, 200);
  // Import: iso-10 carries ITP-04 as free text, which the register does not hold.
  assert.equal(f.store.get('isometrics', 'iso-10').itpNo, 'ITP-04');
  const imported = await f.request('/itps/import-from-isometrics', { method: 'POST', data: {} });
  assert.equal(imported.status, 201);
  const result = await json(imported);
  assert.ok(result.created >= 1, JSON.stringify(result));
  const created = f.store.list('itps').find(row => row.number === 'ITP-04')!;
  assert.deepEqual([created.scope, f.store.get('isometrics', 'iso-10').itpId], ['Shop', created.id]);
  assert.deepEqual(await json(await f.request('/itps/import-from-isometrics', { method: 'POST', data: {} })), { created: 0, linked: 0 });   // safe to repeat
  // A reader of the register cannot add, upload, link or import.
  await f.reader();
  assert.equal((await f.request('/itps', { method: 'POST', data: pdf({ number: 'ITP-R', revNo: '0' }) })).status, 403);
  assert.equal((await f.request('/itps/itp-01/revisions', { method: 'POST', data: pdf({ revNo: '9' }) })).status, 403);
  assert.equal((await f.request('/itps/import-from-isometrics', { method: 'POST', data: {} })).status, 403);
  // MTO Pilot does not reach the register.
  assert.equal((await f.request('/itps/link', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-10', itpId: 'itp-03' } })).status, 403);
});

test('sample data: the ITPs carry a scope and title, and the linked isometrics show the ITP\'s X-Ray %', () => {
  const store = new Store(':memory:'); seed(store);
  assert.deepEqual(store.list('itps').map(itp => [itp.number, itp.scope]).sort(), [['ITP-01', 'Shop'], ['ITP-02', 'Shop+Field'], ['ITP-03', 'Shop'], ['ITP-NDT-01', 'Field']]);
  assert.ok(store.list('itps').every(itp => String(itp.title).length > 0));
  assert.deepEqual(['iso-1', 'iso-4'].map(id => store.get('isometrics', id).xRay), ['10', '20']);
  assert.equal(availabilityFor(HOSTED_RELEASE_PROFILE)!.resources.attachments.includes('revNo'), true);
  assert.equal(availabilityFor('welding-demo')!.resources.attachments.includes('revNo'), false);
});
