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
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { isoBlockers, isoProgress, type IsoStatusInput } from '../shared/iso-status.ts';
import { pilotScope, projectScope } from '../shared/project-scope.ts';
import {
  PUNCH_CATEGORIES, canTransition, hasPunchProgress, isBlockingCategory, isOverdue, matchesPunchKpi, punchBlocking, punchCategory, punchCounts, punchDeadlineSoon, punchFinishErrors, punchInputErrors,
  punchKind, punchKpis, punchProgress, punchStatus, punchWriteError,
} from '../shared/punch.ts';
import type { Row, User } from '../shared/types.ts';

const TODAY = '2026-11-16';
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-11-01T00:00:00Z', _updatedAt: '2026-11-01T00:00:00Z', ...data }) as Row;
const [A, B, C, D] = PUNCH_CATEGORIES;

// ----- pure rules ------------------------------------------------------------------------------------------

test('categories keep the four reference labels and map earlier single letters; A and B block', () => {
  assert.deepEqual(PUNCH_CATEGORIES, ['A — Immediate fix (blocking)', 'B — ASAP fix (blocking)', 'C — Fix (non-blocking)', 'D — Fix in operation (non-blocking)']);
  assert.deepEqual([A, B, C, D, 'A', 'B', 'C', 'D', '', undefined].map(value => punchCategory(value)), ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'B', 'B']);
  assert.deepEqual([A, B, C, D, 'C'].map(isBlockingCategory), [true, true, false, false, false]);
});

test('status maps earlier values; kind defaults to Punch; blocking is open A and B items only', () => {
  assert.deepEqual(['Open', 'In progress', 'Completed', 'Finished', 'Passed', 'Removed', ''].map(status => punchStatus(row('x', { status }))), ['Open', 'Open', 'Finished', 'Finished', 'Passed', 'Removed', 'Open']);
  assert.equal(punchKind(row('x')), 'Punch'); assert.equal(punchKind(row('x', { punchType: 'Pre-punch' })), 'Pre-punch');
  const items = [row('a', { category: A }), row('b', { category: 'B', status: 'In progress' }), row('c', { category: C }), row('d', { category: D }), row('e', { category: A, status: 'Finished' }), row('f', { category: A, status: 'Passed' }), row('g', { category: B, status: 'Removed' }), row('h', { category: A, _archived: true })];
  assert.deepEqual(punchBlocking(items).map(item => item.id), ['a', 'b']);
});

test('overdue is derived from the due date of open items; the 7 day window starts today', () => {
  const open = (dueDate: string, extra: Record<string, unknown> = {}) => row('x', { dueDate, ...extra });
  assert.equal(isOverdue(open('2026-11-15'), TODAY), true); assert.equal(isOverdue(open('2026-11-16'), TODAY), false); assert.equal(isOverdue(open(''), TODAY), false);
  assert.equal(isOverdue(open('2026-11-01', { status: 'Finished' }), TODAY), false, 'a finished item waits for approval, not for the contractor');
  assert.deepEqual(['2026-11-15', '2026-11-16', '2026-11-23', '2026-11-24', ''].map(due => punchDeadlineSoon(open(due), TODAY)), [false, true, true, false, false]);
  assert.equal(punchDeadlineSoon(open('2026-11-20', { status: 'Passed' }), TODAY), false);
});

test('the eight key figures count and filter the same items', () => {
  const items = [
    row('1', { punchType: 'Pre-punch', dueDate: '2026-11-10' }), row('2', { punchType: 'Pre-punch', dueDate: '2026-11-20' }), row('3', { dueDate: '2026-11-18' }), row('4', { dueDate: '2027-01-01' }),
    row('5', { status: 'Finished' }), row('6', { status: 'Passed' }), row('7', { status: 'Removed' }), row('8', { status: 'Completed' }), row('9', { _archived: true }),
  ];
  const cards = Object.fromEntries(punchKpis(items, TODAY).map(card => [card.key, card.count]));
  assert.deepEqual(cards, { open: 4, prePunch: 2, punch: 2, overdue: 1, deadline: 2, finished: 2, passed: 1, removed: 1 });
  assert.deepEqual(punchKpis(items, TODAY).map(card => card.label), ['Open', 'Pre-punch (open)', 'Punch (open)', 'Overdue', 'Deadline 7 days', 'Finished', 'Passed', 'Removed']);
  for (const card of punchKpis(items, TODAY)) assert.equal(items.filter(item => !item._archived && matchesPunchKpi(item, card.key, TODAY)).length, card.count, card.key);
});

test('counts of an isometric: open and finished pre-punch and punch, overdue and blocking', () => {
  const items = [row('1', { punchType: 'Pre-punch', category: A, dueDate: '2026-11-01' }), row('2', { punchType: 'Pre-punch', category: C, status: 'Finished' }), row('3', { category: B }), row('4', { category: D, status: 'Finished' }), row('5', { category: C, status: 'Passed' }), row('6', { status: 'Removed' })];
  assert.deepEqual(punchCounts(items, TODAY), { prePunchOpen: 1, prePunchFinished: 1, punchOpen: 1, punchFinished: 1, overdue: 1, blocking: 2 });
});

test('punch progress reads the stored percentage as 0..1 and is unset until entered', () => {
  assert.deepEqual(['0 %', '25 %', '50 %', '75 %', '100 %'].map(value => punchProgress(row('i', { punchProgress: value }))), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(['', undefined, '30 %', 'x'].map(value => punchProgress(row('i', { punchProgress: value }))), [0, 0, 0, 0]);
  assert.deepEqual(['0 %', '100 %', '', '30 %'].map(value => hasPunchProgress(row('i', { punchProgress: value }))), [true, true, false, false]);
});

test('the isometric blockers and the punch driver of the progress read these functions', () => {
  const site = row('site', { weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10, fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60 });
  const input = (punch: Row[] | null, iso: Row = row('iso')): IsoStatusInput => ({ iso, site, welds: [], weldTypes: [], diameters: [], results: [], releases: null, punch });
  const punch = [row('1', { isoId: 'iso', category: A }), row('2', { isoId: 'iso', category: C }), row('3', { isoId: 'iso', category: B, status: 'Finished' }), row('4', { isoId: 'other', category: A })];
  const blockers = isoBlockers(input(punch));
  assert.equal(blockers.total, 1); assert.equal(blockers.groups[0].key, 'punch'); assert.equal(blockers.groups[0].items[0].message, '1 open punch item in category A or B.');
  assert.equal(isoBlockers(input([row('c', { isoId: 'iso', category: D })])).total, 0, 'non-blocking categories do not block');
  const driver = (iso: Row, extra: Partial<IsoStatusInput> = {}) => isoProgress({ ...input([], iso), ...extra }).phases[1].drivers.find(item => item.key === 'punch')!;
  assert.equal(driver(row('iso')).inScope, false, 'out of scope until a punch progress is entered');
  assert.equal(driver(row('iso', { punchProgress: '75 %' })).progress, 0.75);
  assert.equal(driver(row('iso', { punchProgress: '0 %' })).inScope, true);
  assert.equal(driver(row('iso', { punchProgress: '75 %' }), { punchProgress: 1 }).progress, 1, 'a value passed by the caller wins');
});

test('input and sign-off rules', () => {
  assert.deepEqual(Object.keys(punchInputErrors({ description: 'x' })), ['projectId']);
  assert.deepEqual(punchInputErrors({ projectId: 'p' }), {});
  assert.ok(punchInputErrors({ isoId: 'i', projectId: 'p2' }, undefined, row('i', { projectId: 'p1' })).projectId);
  assert.ok(punchInputErrors({ projectId: 'p', dueDate: '2026-11-01', reportedDate: '2026-11-02' }).dueDate);
  assert.equal(punchWriteError({ description: 'x' }, row('p', { status: 'Open' })), null);
  assert.ok(punchWriteError({ description: 'x' }, row('p', { status: 'Passed' })));
  assert.ok(punchWriteError({ status: 'Passed' }, row('p', { status: 'Open' })));
  assert.equal(punchWriteError({ status: 'Open' }, undefined), null); assert.ok(punchWriteError({ status: 'Finished' }, undefined)); assert.ok(punchWriteError({ number: '99' }, undefined));
  const client = { signerType: 'Client', clientName: 'Jan de Vries', company: 'Riverside Utilities', date: TODAY, signMethod: 'Drawn' };
  assert.deepEqual(punchFinishErrors(client, true), {});
  assert.deepEqual(Object.keys(punchFinishErrors({ ...client, clientName: '', company: '' }, true)).sort(), ['clientName', 'company']);
  assert.deepEqual(Object.keys(punchFinishErrors({ signerType: 'Own inspector', date: TODAY, signMethod: 'Uploaded PDF' }, true)), ['inspector']);
  assert.deepEqual(Object.keys(punchFinishErrors(client, false)), ['signMethod']);
  assert.deepEqual(Object.keys(punchFinishErrors({ ...client, signerType: 'Contractor' }, true)), ['signerType']);
  assert.deepEqual(['Open', 'Finished', 'Passed', 'Removed'].map(status => (['finish', 'pass', 'remove'] as const).map(transition => canTransition(row('p', { status }), transition))), [[true, false, true], [false, true, true], [false, false, false], [false, false, false]]);
});

// ----- the store ---------------------------------------------------------------------------------------------

test('items are numbered, take the isometric’s project and a title from the description; earlier records stay valid', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const one = store.create('punchlists', { isoId: 'iso-5', description: 'Gasket type does not match the line list.', category: A });
    const two = store.create('punchlists', { projectId: 'project-steam', description: 'Fence off the laydown area during the hydrotest.' });
    assert.equal(Number(two.number), Number(one.number) + 1);
    assert.equal(one.projectId, store.get('isometrics', 'iso-5').projectId); assert.equal(one.name, 'Gasket type does not match the line list.'); assert.equal(one.punchType, 'Punch'); assert.equal(one.status, 'Open');
    assert.throws(() => store.create('punchlists', { description: 'No project and no isometric.' }), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.projectId));
    assert.throws(() => store.create('punchlists', { isoId: 'iso-1', description: '' }), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.description));
    assert.throws(() => store.create('punchlists', { isoId: 'iso-5', projectId: 'project-cooling', description: 'x' }), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.projectId));
    assert.equal(store.update('punchlists', one.id, { description: 'Changed.' }, one._version).number, one.number, 'the number never changes');
    // A record saved before the new fields: single-letter category and the old status words still validate and read as the new values.
    store.db.prepare("INSERT INTO punchlists(id,data,created_at,updated_at) VALUES ('legacy',?,?,?)").run(JSON.stringify({ name: 'Old item', isoId: 'iso-2', category: 'A', status: 'Completed', assignedTo: 'Site team', dueDate: '2026-10-27' }), '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
    const legacy = store.get('punchlists', 'legacy');
    assert.equal(punchCategory(legacy.category), 'A'); assert.equal(punchStatus(legacy), 'Finished');
    const edited = store.update('punchlists', 'legacy', { description: 'Now with a description.' }, legacy._version);
    assert.equal(edited.category, 'A'); assert.equal(edited.status, 'Completed'); assert.ok(edited.number);
  } finally { store.close(); }
});

test('project-related items stay in the project and pilot scope; the sample shows every key figure', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const rows = Object.fromEntries(['sites', 'projects', 'isometrics', 'punchlists', 'welds', 'attachments'].map(key => [key, store.list(key)]));
    const sample = Object.fromEntries(punchKpis(rows.punchlists).map(card => [card.key, card.count]));
    for (const key of Object.keys(sample)) assert.ok(sample[key] > 0, `the sample has ${key} items`);
    const related = rows.punchlists.find(item => !item.isoId)!;
    assert.equal(related.projectId, 'project-cooling');
    assert.ok(projectScope(rows, 'site-north').punchlists.some(item => item.id === related.id));
    assert.ok(!projectScope(rows, 'site-river').punchlists.some(item => item.id === related.id));
    assert.ok(pilotScope(rows, 'mto').punchlists.some(item => item.id === related.id));
    const skid = pilotScope(rows, 'mto'); assert.ok(!skid.projects.some(project => project.id === 'project-skid'));
  } finally { store.close(); }
});

test('the hosted profile delivers the page and its actions; other profiles keep their behaviour', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.navigation.includes('punchlists'));
  for (const name of ['number', 'punchType', 'category', 'projectId', 'isoId', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedBy', 'status', 'signAttachmentId']) assert.ok(hosted.resources.punchlists.includes(name), name);
  assert.ok(hosted.resources.isometrics.includes('punchProgress'));
  for (const key of ['punch-finish', 'punch-pass', 'punch-remove']) assert.ok(hosted.actions[key], key);
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; assert.ok(!other.navigation.includes('punchlists'), profile); assert.ok(!other.actions['punch-finish'], profile); assert.ok(!other.resources.punchlists, profile); }
  assert.equal(availabilityFor('full'), undefined);
});

// ----- through HTTP ------------------------------------------------------------------------------------------

const PASSWORD = 'Punch-Test-Password';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64)]);
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-punch-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot = 'weld', data }: { method?: string; pilot?: string; data?: unknown } = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, 'X-Stelux-Pilot': pilot, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return request;
  };
  const account = async (name: string, profile: Record<string, unknown>) => {
    const profileId = store.create('profiles', { name, settingsPermission: 'No access', toolsPermission: 'No access', ...profile }).id;
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const request = client();
    assert.equal((await request('/auth/login', { method: 'POST', data: { email: user.email, password: PASSWORD } })).status, 200);
    return request;
  };
  /** Full rights in both pilots, a read-only reviewer, and detailed profiles for the verbs of area 77. */
  const worker = await account('Punch worker', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const viewer = await account('Punch viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  const detailed = (name: string, verbs: string[]) => account(name, { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '77': verbs, '5': ['show'], '64': ['show'] }) });
  const form = (fields: Record<string, string>, file?: { name: string; type: string; bytes: Buffer }) => {
    const body = new FormData(); for (const [name, value] of Object.entries(fields)) body.set(name, value);
    if (file) body.set('file', new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
    return body;
  };
  return { store, worker, viewer, detailed, form };
}
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;
const newItem = { punchType: 'Pre-punch', category: B, isoId: 'iso-5', description: 'Weld cap not removed on spool SP-005 branch connection.', dueDate: '2026-12-20', contractorId: 'company-stelux', reportedDate: '2026-11-16', reportedBy: 'Morgan Lee' };
const clientSignOff = { signerType: 'Client', clientName: 'Jan de Vries', company: 'Riverside Utilities', function: 'Site engineer', date: '2026-11-16', note: 'Accepted on site.', signMethod: 'Drawn' };

test('items are added and edited in the Weld Pilot; the MTO Pilot refuses them; a read-only account cannot write', async t => {
  const f = await fixture(t);
  const created = await f.worker('/records/punchlists', { method: 'POST', data: newItem }); assert.equal(created.status, 201);
  const item = (await json<{ record: Row }>(created)).record;
  assert.equal(item.status, 'Open'); assert.ok(item.number); assert.equal(item.projectId, f.store.get('isometrics', 'iso-5').projectId);
  const list = await json<{ rows: Row[] }>(await f.worker('/records/punchlists')); assert.ok(list.rows.some(row => row.id === item.id));
  const edited = await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'Weld cap removed? Check again.', category: C, _version: item._version } }); assert.equal(edited.status, 200);
  assert.equal((await json<{ record: Row }>(edited)).record.category, C);
  // The pilot boundary: the item is neither readable nor writable from the MTO Pilot.
  for (const [path, options] of [['/records/punchlists', {}], ['/records/punchlists', { method: 'POST', data: newItem }], [`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'Other pilot', _version: item._version + 1 } }], [`/history/punchlists/${item.id}`, {}], ['/actions/punch-pass', { method: 'POST', data: { punchId: item.id } }]] as const) {
    assert.equal((await f.worker(path, { ...options, pilot: 'mto' })).status, 403, path);
  }
  assert.equal(Object.hasOwn((await json<{ rows: Record<string, Row[]> }>(await f.worker('/bootstrap', { pilot: 'mto' }))).rows, 'punchlists'), false);
  // Read-only: sees the items, changes nothing.
  assert.equal((await f.viewer('/records/punchlists')).status, 200);
  assert.equal((await f.viewer('/records/punchlists', { method: 'POST', data: newItem })).status, 403);
  assert.equal((await f.viewer(`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'No', _version: edited.status && item._version + 1 } })).status, 403);
  // Invalid input is refused with the field named.
  const noTarget = await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: '', projectId: '' } }); assert.equal(noTarget.status, 422);
  const backwards = await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, dueDate: '2026-11-01' } }); assert.equal(backwards.status, 422);
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, category: 'E — Whatever' } })).status, 422);
});

test('status, sign-off and numbering change only through the transitions', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  for (const data of [{ status: 'Passed' }, { status: 'Finished' }, { number: '999' }, { passedAt: '2026-11-16' }, { signAttachmentId: 'attachment' }]) {
    const response = await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { ...data, _version: item._version } });
    assert.equal(response.status, 422, JSON.stringify(data));
  }
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, status: 'Passed' } })).status, 422);
  assert.equal(f.store.get('punchlists', item.id).status, 'Open');
});

test('Mark as finished takes the sign-off with its file in one request and audits it', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const finish = (fields: Record<string, string>, file?: { name: string; type: string; bytes: Buffer }, as = f.worker) => as(`/punch/${item.id}/finish`, { method: 'POST', data: f.form(fields, file) });
  const drawn = { name: 'punch-signature.png', type: 'image/png', bytes: PNG };
  // Refusals leave the item open and create no attachment.
  const missing = await finish(clientSignOff); assert.equal(missing.status, 422); assert.match((await json<{ error: string }>(missing)).error, /signature|signed/i);
  const noName = await finish({ ...clientSignOff, clientName: '' }, drawn); assert.equal(noName.status, 422); assert.match((await json<{ error: string }>(noName)).error, /client/i);
  assert.equal((await finish({ ...clientSignOff, signerType: 'Own inspector' }, drawn)).status, 422, 'an own inspector needs the inspector’s name');
  assert.equal((await finish(clientSignOff, { name: 'sign.png', type: 'image/png', bytes: PDF })).status, 422, 'the content must be what the name says');
  assert.equal((await finish({ ...clientSignOff, signMethod: 'Uploaded PDF' }, { name: 'sign.pdf', type: 'application/pdf', bytes: PNG })).status, 422, 'a PNG is not a signed PDF');
  assert.equal((await finish({ ...clientSignOff, signMethod: 'Uploaded PDF' }, drawn)).status, 422);
  assert.equal((await finish({ ...clientSignOff, extra: 'x' }, drawn)).status, 404, 'unknown fields are not accepted');
  assert.equal((await finish(clientSignOff, drawn, f.viewer)).status, 403);
  assert.equal((await finish(clientSignOff, drawn, (path, options) => f.worker(path, { ...options, pilot: 'mto' }))).status, 403);
  assert.equal(f.store.get('punchlists', item.id).status, 'Open');
  assert.equal(f.store.list('attachments').filter(row => row.entityType === 'punchlists').length, 0);
  // A drawn client sign-off.
  const done = await finish(clientSignOff, drawn); assert.equal(done.status, 201);
  const finished = f.store.get('punchlists', item.id);
  assert.equal(finished.status, 'Finished'); assert.equal(finished.finishedAt, '2026-11-16'); assert.equal(finished.signerType, 'Client'); assert.equal(finished.signName, 'Jan de Vries'); assert.equal(finished.signCompany, 'Riverside Utilities'); assert.equal(finished.signFunction, 'Site engineer'); assert.equal(finished.signRemarks, 'Accepted on site.'); assert.equal(finished.signMethod, 'Drawn');
  const attachment = f.store.get('attachments', finished.signAttachmentId); assert.equal(attachment.entityId, item.id); assert.equal(attachment.documentType, 'Punch sign-off');
  assert.equal((await f.worker(`/files/${attachment.id}`)).status, 200);
  assert.equal((await f.worker(`/files/${attachment.id}`, { pilot: 'mto' })).status, 403);
  // Not twice.
  assert.equal((await finish(clientSignOff, drawn)).status, 422);
  assert.equal((await f.worker('/actions/punch-finish', { method: 'POST', data: { punchId: item.id, ...clientSignOff, attachmentId: attachment.id } })).status, 422);
  // The history names the step.
  const history = await json<{ events: { summary: string; action: string }[] }>(await f.worker(`/history/punchlists/${item.id}`));
  assert.ok(history.events.some(event => event.summary === 'Finished punch item'), JSON.stringify(history.events));
  // A signed PDF by an own inspector on another item.
  const other = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, projectId: '', isoId: 'iso-6' } }))).record;
  const pdf = await f.worker(`/punch/${other.id}/finish`, { method: 'POST', data: f.form({ signerType: 'Own inspector', inspector: 'Morgan Lee', date: '2026-11-17', signMethod: 'Uploaded PDF' }, { name: 'signed.pdf', type: 'application/pdf', bytes: PDF }) });
  assert.equal(pdf.status, 201); assert.equal(f.store.get('punchlists', other.id).signInspector, 'Morgan Lee'); assert.equal(f.store.get('punchlists', other.id).signMethod, 'Uploaded PDF');
});

test('Report passed follows Finished, and a passed item cannot be edited, extended or removed', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const pass = (data: Record<string, unknown> = {}, as = f.worker) => as('/actions/punch-pass', { method: 'POST', data: { punchId: item.id, date: '2026-11-18', note: 'Inspected on site.', ...data } });
  assert.equal((await pass()).status, 422, 'an open item is not passed');
  assert.equal((await f.worker(`/punch/${item.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 'sign.png', type: 'image/png', bytes: PNG }) })).status, 201);
  assert.equal((await pass({}, f.viewer)).status, 403);
  assert.equal((await pass({ date: '2026-11-15' })).status, 422, 'not before it was finished');
  assert.equal((await pass({ date: 'tomorrow' })).status, 422);
  assert.equal((await pass()).status, 201);
  const passed = f.store.get('punchlists', item.id); assert.equal(passed.status, 'Passed'); assert.equal(passed.passedAt, '2026-11-18'); assert.equal(passed.passRemarks, 'Inspected on site.');
  assert.equal((await pass()).status, 422);
  const edit = await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'Changed after passing.', _version: passed._version } });
  assert.equal(edit.status, 422); assert.match((await json<{ error: string }>(edit)).error, /passed/i);
  assert.equal((await f.worker('/actions/punch-remove', { method: 'POST', data: { punchId: item.id, note: 'No' } })).status, 422);
  const photo = await f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: item.id, documentType: 'Punch photo' }, { name: 'late.png', type: 'image/png', bytes: PNG }) });
  assert.equal(photo.status, 422);
  assert.equal(f.store.get('punchlists', item.id).description, newItem.description);
});

test('Mark as removed asks for the delete right, works from Open and Finished only and is final', async t => {
  const f = await fixture(t);
  const maker = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const editor = await f.detailed('Punch editor', ['show', 'insert', 'edit', 'import']);
  const remover = await f.detailed('Punch remover', ['show', 'edit', 'delete']);
  // Both directions: the editor may finish and pass but not remove; the remover may remove.
  assert.equal((await editor('/actions/punch-remove', { method: 'POST', data: { punchId: maker.id } })).status, 403);
  assert.equal((await remover('/actions/punch-remove', { method: 'POST', data: { punchId: maker.id, date: '2026-11-17', note: 'Superseded by design change DC-051.' } })).status, 201);
  const removed = f.store.get('punchlists', maker.id); assert.equal(removed.status, 'Removed'); assert.equal(removed.removedAt, '2026-11-17'); assert.equal(removed.removeReason, 'Superseded by design change DC-051.');
  assert.equal((await remover('/actions/punch-remove', { method: 'POST', data: { punchId: maker.id } })).status, 422);
  assert.equal((await remover(`/punch/${maker.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 422);
  assert.equal((await remover('/actions/punch-pass', { method: 'POST', data: { punchId: maker.id } })).status, 422);
  const second = (await json<{ record: Row }>(await editor('/records/punchlists', { method: 'POST', data: newItem }))).record;
  assert.equal((await editor(`/punch/${second.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 201);
  assert.equal((await editor('/actions/punch-pass', { method: 'POST', data: { punchId: second.id } })).status, 201);
  assert.equal((await remover('/records/punchlists', { method: 'POST', data: newItem })).status, 403, 'the remover cannot add items');
  // A profile that only reads cannot run any transition.
  const reader = await f.detailed('Punch reader', ['show']);
  const third = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  assert.equal((await reader('/actions/punch-remove', { method: 'POST', data: { punchId: third.id } })).status, 403);
  assert.equal((await reader('/actions/punch-pass', { method: 'POST', data: { punchId: third.id } })).status, 403);
  assert.equal((await reader(`/punch/${third.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 403);
  assert.equal(f.store.get('punchlists', third.id).status, 'Open');
});

test('an item holds up to two photos or documents; the sign-off type cannot be attached by hand', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const attach = (documentType: string, name = 'photo.png') => f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: item.id, documentType }, { name, type: 'image/png', bytes: PNG }) });
  assert.equal((await attach('Punch sign-off')).status, 422);
  assert.equal((await attach('Anything else')).status, 422);
  assert.equal((await attach('Punch photo', 'one.png')).status, 201);
  assert.equal((await attach('Punch document', 'two.png')).status, 201);
  const third = await attach('Punch photo', 'three.png'); assert.equal(third.status, 422); assert.match((await json<{ error: string }>(third)).error, /up to 2/);
  assert.equal(f.store.list('attachments').filter(row => row.entityType === 'punchlists' && row.entityId === item.id).length, 2);
  // The sign-off file does not use up the two places.
  const other = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6' } }))).record;
  assert.equal((await f.worker(`/punch/${other.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 201);
  for (const name of ['a.png', 'b.png']) assert.equal((await f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: other.id, documentType: 'Punch photo' }, { name, type: 'image/png', bytes: PNG }) })).status, 201);
  // Export carries the visible columns only.
  const csv = await (await f.worker('/export/punchlists?format=csv')).text(); assert.match(csv.split('\n')[0], /Punch type/); assert.doesNotMatch(csv.split('\n')[0], /Sign-off document/);
  assert.equal((await f.viewer('/export/punchlists?format=csv')).status, 200);
  assert.equal((await f.worker('/export/punchlists?format=csv', { pilot: 'mto' })).status, 403);
});

test('the punch progress is stored on the isometric and drives the field progress', async t => {
  const f = await fixture(t);
  const iso = f.store.get('isometrics', 'iso-6');
  assert.equal((await f.worker(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '60 %', _version: iso._version } })).status, 422);
  const saved = await f.worker(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '75 %', _version: iso._version } }); assert.equal(saved.status, 200);
  assert.equal(punchProgress(f.store.get('isometrics', 'iso-6')), 0.75);
  assert.equal((await f.viewer(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '100 %', _version: iso._version + 1 } })).status, 403);
  assert.ok(punchKind(row('x')) && punchKpis([]).length === 8);
});

test('hosted Add item labels follow the capture: the category is "Type" and the isometric "ISO"; other profiles keep theirs', async () => {
  const { projectResource } = await import('../shared/release.ts');
  const { RESOURCES } = await import('../shared/resources.ts');
  const punch = RESOURCES.find(resource => resource.key === 'punchlists')!;
  const label = (profile: Parameters<typeof availabilityFor>[0], name: string) => projectResource(availabilityFor(profile), punch).fields.find(field => field.name === name)?.label;
  assert.equal(label(HOSTED_RELEASE_PROFILE, 'category'), 'Type');
  assert.equal(label(HOSTED_RELEASE_PROFILE, 'isoId'), 'ISO');
  assert.equal(label('full', 'category'), 'Category');
  assert.equal(label('full', 'isoId'), 'Isometric');
});
