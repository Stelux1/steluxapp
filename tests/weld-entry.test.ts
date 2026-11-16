import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, type ReleaseProfile } from '../shared/release.ts';
import { canAction } from '../shared/permissions.ts';
import {
  certificateErrors, certificateLinkedToProject, certificateMaterialText, certificatesForProject, chargeSelection, chargeValue, dropWeld, isSideValue, lockContext, missingMandatoryFields,
  moveWeld, neighbourOf, normalizedNdtPercent, orderedWelds, planWeldRange, readMassEdit, sideSummary, typeAbbreviation, weldDiameterText, weldLock, weldLocation, weldNumberStyle,
  welderQualifiedForWps, welderWpsErrors,
} from '../shared/weld-entry.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const actor = { id: 'tester', name: 'Tester' };

// ---------------------------------------------------------------------------------------------------- pure rules

test('table order follows the stored order, then the weld number as numbers; moving and dropping keep every weld', () => {
  const welds = [row('c', { weldNo: '010' }), row('b', { weldNo: '9' }), row('a', { weldNo: '005A', sortOrder: 2 }), row('d', { weldNo: '010R1', sortOrder: 1 })];
  assert.deepEqual(orderedWelds(welds).map(w => w.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveWeld(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(moveWeld(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
  assert.equal(moveWeld(['a', 'b', 'c'], 'a', 'up'), null); assert.equal(moveWeld(['a', 'b', 'c'], 'c', 'down'), null); assert.equal(moveWeld(['a'], 'x', 'up'), null);
  assert.deepEqual(dropWeld(['a', 'b', 'c'], 'a', 'c'), ['b', 'a', 'c']); assert.deepEqual(dropWeld(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a']);
  assert.equal(dropWeld(['a', 'b', 'c'], 'b', 'c'), null, 'dropping where it already is changes nothing'); assert.equal(dropWeld(['a', 'b'], 'a', 'a'), null);
  assert.equal(neighbourOf(['a', 'b', 'c'], 'b', 'prev'), 'a'); assert.equal(neighbourOf(['a', 'b', 'c'], 'b', 'next'), 'c'); assert.equal(neighbourOf(['a', 'b', 'c'], 'a', 'prev'), null);
});

test('rule (a): mandatory fields apply only with the setting on and a welder on the weld', () => {
  const complete = { welder1Id: 'w', typeId: 't', wpsId: 'p', date: '2026-10-01', lengthMode: 'Diameter', diameterId: 'd', chargeNo1: 'EXISTING', certificate2Id: 'c' };
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, complete), {});
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: false }, { welder1Id: 'w' }), {}, 'setting off');
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, { typeId: '' }), {}, 'no welder yet');
  assert.deepEqual(Object.keys(missingMandatoryFields({ mandatoryFields: true }, { welder3Id: 'w' })).sort(), ['chargeNo1', 'chargeNo2', 'date', 'diameterId', 'typeId', 'wpsId']);
  // An explicit length replaces the diameter; a charge field or a certificate fills a charge number.
  assert.deepEqual(Object.keys(missingMandatoryFields({ mandatoryFields: true }, { ...complete, lengthMode: 'Length in mm', diameterId: '', dialen: null })), ['dialen']);
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, { ...complete, lengthMode: 'Length in mm', dialen: 120 }), {});
});

test('rule (b): validation on WPS compares the welding process and the expiry on the weld date', () => {
  const wps = row('p', { name: 'WPS-141', processId: 'tig' });
  const certs: Record<string, Row[]> = { ok: [row('c1', { welderId: 'ok', processId: 'tig', expiresAt: '2027-01-01' })], old: [row('c2', { welderId: 'old', processId: 'tig', expiresAt: '2026-01-01' })], other: [row('c3', { welderId: 'other', processId: 'mma' })], none: [] };
  const ask = (site: Record<string, unknown>, weld: Record<string, unknown>, process: Row | undefined = wps) => welderWpsErrors(site, { wpsId: 'p', date: '2026-10-01', ...weld }, process, id => certs[id], id => id.toUpperCase(), '2026-11-16');
  assert.deepEqual(ask({ wpsValidation: true }, { welder1Id: 'ok', welder2Id: 'ok' }), {});
  assert.deepEqual(Object.keys(ask({ wpsValidation: true }, { welder1Id: 'ok', welder2Id: 'old', welder3Id: 'other', welder4Id: 'none' })), ['welder2Id', 'welder3Id', 'welder4Id']);
  assert.match(ask({ wpsValidation: true }, { welder1Id: 'old' }).welder1Id, /OLD has no valid qualification for WPS WPS-141 on 2026-10-01/);
  assert.deepEqual(ask({ wpsValidation: true }, { welder1Id: 'old', date: '2025-12-31' }), {}, 'the qualification was valid on the weld date');
  assert.deepEqual(Object.keys(ask({ wpsValidation: true }, { welder1Id: 'old', date: '' })), ['welder1Id'], 'without a date, today counts');
  assert.deepEqual(ask({ wpsValidation: false }, { welder1Id: 'none' }), {}, 'setting off');
  assert.deepEqual(ask({ wpsValidation: true }, { welder1Id: 'none' }, row('p', { name: 'WPS-X' })), {}, 'a WPS without a process reference cannot express a match: it passes');
  assert.deepEqual(ask({ wpsValidation: true }, { welder1Id: 'none', wpsId: '' }), {}, 'no WPS yet');
  assert.equal(welderQualifiedForWps(null, [], '2026-10-01'), true);
});

test('rule (c): project certificates are those named by the project or already used by its welds', () => {
  const isometrics = [row('i1', { projectId: 'p1' }), row('i2', { projectId: 'p2' })];
  const welds = [row('w1', { isoId: 'i1', certificate1Id: 'used' }), row('w2', { isoId: 'i2', certificate2Id: 'elsewhere' }), row('w3', { isoId: 'i1', certificate1Id: 'gone', _archived: true })];
  const certificates = [row('used'), row('elsewhere'), row('named', { projectId: 'p1' }), row('listed', { projectIds: ['p1', 'p3'] }), row('csv', { projectIds: 'p2, p1' }), row('gone'), row('archived', { projectId: 'p1', _archived: true })];
  const context = { isometrics, welds };
  assert.deepEqual(certificatesForProject(certificates, 'p1', context).map(c => c.id), ['used', 'named', 'listed', 'csv']);
  assert.deepEqual(certificatesForProject(certificates, 'p2', context).map(c => c.id), ['elsewhere', 'csv']);
  assert.equal(certificateLinkedToProject(row('x'), 'p1', context), false);
  assert.deepEqual(certificateErrors({ projectCertificates: true }, { certificate1Id: 'elsewhere', certificate2Id: 'used' }, [1, 2], certificates, 'p1', context), { certificate1Id: 'This certificate is not linked to the project.' });
  assert.deepEqual(certificateErrors({ projectCertificates: false }, { certificate1Id: 'elsewhere' }, [1], certificates, 'p1', context), {});
});

test('rule (d): a weld is locked by the release of its own phase and unlocked when the release is archived', () => {
  const types = [row('shop', { name: 'Butt Weld - Shop', location: 'Shop' }), row('field', { name: 'Butt Weld - Field', location: 'Field' }), row('named', { name: 'Socket weld - Field' }), row('plain', { name: 'HOOK-UP' })];
  const releases = [row('r1', { isoId: 'i1', type: 'Field' }), row('r2', { isoId: 'i2', type: 'Prefab' }), row('r3', { isoId: 'i3', type: 'Hydrotest' }), row('r4', { isoId: 'i4', type: 'Field', _archived: true })];
  const context = lockContext(types, releases);
  const lock = (isoId: string, typeId: string) => weldLock({ isoId, typeId }, context);
  assert.equal(lock('i1', 'field').locked, true); assert.equal(lock('i1', 'field').release, 'Field'); assert.equal(lock('i1', 'named').locked, true, 'older types are read from their name');
  assert.equal(lock('i1', 'shop').locked, false, 'shop welds stay open with only a Field release');
  assert.equal(lock('i2', 'shop').locked, true); assert.equal(lock('i2', 'shop').release, 'Prefab'); assert.equal(lock('i2', 'field').locked, false);
  assert.equal(lock('i1', 'plain').locked, false, 'without a phase the weld is not locked'); assert.equal(weldLock({ isoId: 'i1' }, context).locked, false);
  assert.equal(lock('i3', 'field').locked, false, 'a hydrotest release does not lock welds'); assert.equal(lock('i4', 'field').locked, false, 'a reopened or removed release unlocks');
  assert.match(lock('i1', 'field').reason, /Reopen the release/);
  assert.equal(weldLocation(row('x', { name: 'HOOK-UP' })), null);
});

test('Add welds (range): missing numbers only, written like the existing ones', () => {
  assert.deepEqual(planWeldRange(1, 4, ['W001', 'W003']), { numbers: ['W002', 'W004'], skipped: ['W001', 'W003'] });
  assert.deepEqual(planWeldRange(8, 11, ['W001', 'W010']), { numbers: ['W008', 'W009', 'W011'], skipped: ['W010'] });
  assert.deepEqual(planWeldRange(1, 3, ['005', '010', '010R1', '005A']).numbers, ['001', '002', '003']);
  assert.deepEqual(planWeldRange(10, 11, ['7', '8', '9']).numbers, ['10', '11'], 'unpadded numbers stay unpadded');
  assert.deepEqual(planWeldRange(1, 2, []).numbers, ['001', '002'], 'an empty isometric starts with three digits');
  assert.deepEqual(planWeldRange(5, 5, ['010']).numbers, ['005']);
  assert.deepEqual(planWeldRange(10, 10, ['W010']).numbers, [], 'a number written differently still counts as present');
  assert.deepEqual(planWeldRange('1', '2', ['A1', 'A2', 'A3', 'B1']).numbers, [], 'the most used prefix decides what exists');
  assert.deepEqual(weldNumberStyle(['W001', 'W002', 'X1']), { prefix: 'W', width: 3 });
  assert.throws(() => planWeldRange(5, 4, []), /End must not be lower/); assert.throws(() => planWeldRange(1.5, 4, []), /whole numbers/); assert.throws(() => planWeldRange(-1, 4, []), /whole numbers/); assert.throws(() => planWeldRange('', 4, []), /whole numbers/);
  assert.throws(() => planWeldRange(1, 501, []), /at most 500/); assert.equal(planWeldRange(1, 500, []).numbers.length, 500);
});

test('Mass edit: only changed fields are read, Clear date and a date exclude each other', () => {
  assert.deepEqual(readMassEdit({ kr: 'ignored', typeId: 'weld-type-1', ndoReq: true, repair: false, pos1: '' }).changes, { typeId: 'weld-type-1', ndoReq: true, repair: false });
  assert.deepEqual(readMassEdit({ clearDatefit: true }).changes, { datefit: '' }); assert.deepEqual(readMassEdit({ clearDate: true, date: '' }).changes, { date: '' });
  assert.match(readMassEdit({ clearDate: true, date: '2026-10-01' }).errors.date, /not both/);
  assert.deepEqual(readMassEdit({ diameterId: 'diameter-6' }).changes, { diameterId: 'diameter-6', lengthMode: 'Diameter' });
  assert.deepEqual(readMassEdit({ dialen: 80 }).changes, { dialen: 80, lengthMode: 'Length in mm' });
  assert.ok(readMassEdit({ dialen: 80, diameterId: 'd' }).errors.dialen); assert.ok(readMassEdit({ dialen: 0 }).errors.dialen); assert.ok(readMassEdit({ ndoReq: 'yes' }).errors.ndoReq);
  assert.ok(readMassEdit({}).errors._, 'nothing changed'); assert.ok(readMassEdit({ weldNo: '9', isoId: 'x' }).errors._, 'fields outside the list are not read');
});

test('table text: NDT percent, side summaries, material text and type abbreviations', () => {
  assert.equal(normalizedNdtPercent({ lengthMode: 'Length in mm', ndoReq: true, ndtpercent: 40 }), 40);
  assert.equal(normalizedNdtPercent({ lengthMode: 'Diameter', ndoReq: true, ndtpercent: 40 }), null); assert.equal(normalizedNdtPercent({ lengthMode: 'Length in mm', ndoReq: false, ndtpercent: 40 }), null);
  assert.equal(normalizedNdtPercent({ lengthMode: 'Length in mm', ndoReq: true, ndtpercent: '' }), null);
  const certificate = row('c', { indexNo: 'IX-1', chargeNo: 'H-1', diameter: '1/2"', schedule: '40', wallThickness: '7,2', materialCode: 'A106 Gr B' });
  assert.equal(certificateMaterialText({ certificate, materialPart: 'Pipe' }), '1/2"/40/7,2/A106 Gr B/Pipe');
  assert.equal(certificateMaterialText({ certificate: row('c2', { diameter: '2"' }), material: row('m', { lbs: 'SCH 40', materialGroup: 'Elbow' }) }), '2"/SCH 40/Elbow');
  assert.deepEqual(sideSummary({ chargeNo1: 'EXISTING' }, 1), { kind: 'existing', index: '', charge: 'EXISTING', material: 'EXISTING' });
  assert.equal(sideSummary({ chargeNo2: 'CONN ISO' }, 2).material, 'CONN ISO');
  assert.deepEqual(sideSummary({ chargeNo1: 'H-1' }, 1, { certificate }), { kind: 'certificate', index: 'IX-1', charge: 'H-1', material: '1/2"/40/7,2/A106 Gr B' });
  assert.equal(sideSummary({ chargeNo1: 'H-9' }, 1).kind, 'charge'); assert.equal(sideSummary({}, 2).kind, 'none');
  assert.equal(typeAbbreviation(row('t', { name: 'Butt Weld - Field', abbreviation: 'BWF' })), 'BWF'); assert.equal(typeAbbreviation(row('t', { name: 'Butt Weld - Field' })), 'BWF'); assert.equal(typeAbbreviation(null), '');
  assert.equal(weldDiameterText({ lengthMode: 'Length in mm', dialen: 95 }), '95 mm'); assert.equal(weldDiameterText({ lengthMode: 'Diameter' }, row('d', { diameter: '2"' })), '2"');
  const certificates = [certificate];
  assert.deepEqual(chargeSelection('EXISTING', 1, certificates), { chargeNo1: 'EXISTING', certificate1Id: '', material1Id: '' });
  assert.deepEqual(chargeSelection('c', 2, certificates), { chargeNo2: 'H-1', certificate2Id: 'c', material2Id: '' }); assert.deepEqual(chargeSelection('', 1, certificates), { chargeNo1: '', certificate1Id: '', material1Id: '' });
  assert.equal(chargeValue({ chargeNo1: 'CONN ISO', certificate1Id: '' }, 1), 'CONN ISO'); assert.equal(chargeValue({ chargeNo2: 'H-1', certificate2Id: 'c' }, 2), 'c'); assert.equal(isSideValue('existing'), false);
});

// ---------------------------------------------------------------------------------------------------- through HTTP

async function fixture(t: { after: (fn: () => Promise<void>) => void }, profile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-weld-entry-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: profile, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', ...(profile === HOSTED_RELEASE_PROFILE ? { 'X-Stelux-Pilot': pilot } : {}), Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Weld-Entry-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profileRow = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profileRow.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Weld admin', email: 'weld-admin@example.test', password })).status, 201);
  const act = async (key: string, data: unknown) => { const response = await request(`/api/actions/${key}`, 'POST', data); return { status: response.status, body: await response.json() as Record<string, any> }; };
  return { store, request, act, signIn, usePilot: (key: string) => { pilot = key; } };
}
const complete = { isoId: 'iso-1', typeId: 'weld-type-1', wpsId: 'wps-1', date: '2026-10-22', welder1Id: 'welder-1', diameterId: 'diameter-6', chargeNo1: 'EXISTING', chargeNo2: 'CONN ISO' };
const orderOf = (store: Store, isoId: string) => orderedWelds(store.list('welds').filter(w => w.isoId === isoId)).map(w => w.id);
const archiveRelease = (store: Store, isoId: string, type: string) => { const release = store.list('releases').find(r => r.isoId === isoId && r.type === type)!; store.archive('releases', release.id, release._version, actor); };

test('the hosted profile delivers the weld entry fields and actions; other profiles keep their weld fields and actions', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const field of ['processId', 'coating2Id', 'coatingWeldId', 'sleeve', 'kr', 'fp', 'insLength', 'insLength2', 'sortOrder', 'chargeNo1', 'welder4Id']) assert.ok(hosted.resources.welds.includes(field), field);
  for (const key of ['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']) assert.ok(hosted.actions[key], key);
  for (const profile of ['welding-demo', 'access-prototype'] as const) {
    const other = availabilityFor(profile)!;
    for (const key of ['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']) assert.equal(other.actions[key], undefined, `${profile} ${key}`);
    for (const field of ['processId', 'coatingWeldId', 'sortOrder']) assert.ok(!other.resources.welds.includes(field), `${profile} ${field}`);
  }
  assert.equal(availabilityFor('full'), undefined);
});

test('save-weld creates a weld at the end of the table and enforces mandatory fields, validation on WPS and project certificates', async t => {
  const f = await fixture(t);
  // (a) mandatory fields on the North main project: a welder without the rest is refused with a message per field.
  let result = await f.act('save-weld', { isoId: 'iso-1', weldNo: 'W040', welder1Id: 'welder-1' });
  assert.equal(result.status, 422); assert.deepEqual(Object.keys(result.body.fields).sort(), ['chargeNo1', 'chargeNo2', 'date', 'diameterId', 'typeId', 'wpsId']);
  assert.equal(f.store.list('welds').some(w => w.weldNo === 'W040'), false);
  result = await f.act('save-weld', { ...complete, weldNo: 'W040' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const created = f.store.get('welds', result.body.record.id);
  assert.equal(created.sortOrder, 5, 'after the four welds of the isometric'); assert.equal(orderOf(f.store, 'iso-1').at(-1), created.id);
  assert.equal(created.chargeNo1, 'EXISTING'); assert.equal(created.chargeNo2, 'CONN ISO');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W040' })).status, 409, 'weld numbers are unique on an isometric');
  // The same incomplete weld is fine where the setting is off (Riverside).
  assert.equal((await f.act('save-weld', { isoId: 'iso-5', weldNo: 'W090', welder1Id: 'welder-1' })).status, 201);
  // (b) validation on WPS: a welder without a qualification for the WPS process, then one whose certificate has expired.
  const outsider = f.store.create('welders', { number: 'W-009', name: 'Pat Quinn', status: 'Active', globallyDeployable: true });
  result = await f.act('save-weld', { ...complete, weldNo: 'W041', welder1Id: outsider.id });
  assert.equal(result.status, 422); assert.match(result.body.fields.welder1Id, /Pat Quinn has no valid qualification for WPS STX-WPS-141-01/);
  const expiring = f.store.create('welder_certificates', { name: 'WQ-OLD', welderId: outsider.id, processId: 'process-0', expiresAt: '2026-06-30' });
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W041', welder1Id: outsider.id })).status, 422, 'expired before the weld date');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W041', welder1Id: outsider.id, date: '2026-06-01' })).status, 201, 'valid on the weld date');
  f.store.update('welder_certificates', expiring.id, { expiresAt: '2027-06-30' }, expiring._version);
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W042', welder1Id: outsider.id })).status, 201);
  // (c) project certificates: a certificate of the Riverside project is refused on North and accepted on Riverside.
  const foreign = { chargeNo1: 'H-2210', certificate1Id: 'cert-h2210' };
  result = await f.act('save-weld', { ...complete, weldNo: 'W043', ...foreign });
  assert.equal(result.status, 422); assert.equal(result.body.fields.certificate1Id, 'This certificate is not linked to the project.');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W043', chargeNo1: 'H-1043', certificate1Id: 'cert-h1043' })).status, 201, 'a certificate already used on the project');
  assert.equal((await f.act('save-weld', { ...complete, isoId: 'iso-5', weldNo: 'W091', ...foreign })).status, 201, 'the setting is off on Riverside');
});

test('save-weld edits send only changed fields, clears the NDT percent when it stops applying and refuses the tracer flag', async t => {
  const f = await fixture(t);
  const weld = f.store.get('welds', 'weld-5');
  let result = await f.act('save-weld', { weldId: weld.id, expectedVersion: weld._version, lengthMode: 'Length in mm', dialen: 95, ndoReq: true, ndtpercent: 40 });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(f.store.get('welds', weld.id).ndtpercent, 40);
  result = await f.act('save-weld', { weldId: weld.id, ndoReq: false });
  assert.equal(result.status, 201); assert.equal(f.store.get('welds', weld.id).ndtpercent, null, 'NDT percent only exists with NDT required');
  assert.equal(f.store.get('welds', weld.id).dialen, 95, 'untouched fields keep their value');
  assert.equal((await f.act('save-weld', { weldId: weld.id, expectedVersion: 1, kr: 'x' })).status, 409, 'stale form');
  assert.equal((await f.act('save-weld', { weldId: weld.id, isoId: 'iso-1', kr: 'x' })).status, 422, 'a weld stays on its isometric');
  assert.equal((await f.act('save-weld', { weldId: weld.id, tracer: true })).status, 404, 'the form cannot send the tracer flag');
  const refused = await f.request(`/api/records/welds/${weld.id}`, 'PUT', { tracer: true, _version: f.store.get('welds', weld.id)._version });
  assert.equal(refused.status, 422); assert.equal(f.store.get('welds', weld.id).tracer, false);
});

test('Upd. prev. weld and Upd. next weld copy the charge to the adjoining side of the neighbour in table order', async t => {
  const f = await fixture(t);
  assert.deepEqual(orderOf(f.store, 'iso-1'), ['weld-1', 'weld-10', 'weld-19', 'weld-28']);
  const weld = f.store.get('welds', 'weld-10');
  const result = await f.act('save-weld', { weldId: weld.id, expectedVersion: weld._version, chargeNo1: 'H-1043', certificate1Id: 'cert-h1043', material1Id: 'material-2', chargeNo2: 'EXISTING', certificate2Id: '', material2Id: '', updatePrev: true, updateNext: true });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const previous = f.store.get('welds', 'weld-1'), next = f.store.get('welds', 'weld-19');
  assert.deepEqual([previous.chargeNo2, previous.certificate2Id, previous.material2Id], ['H-1043', 'cert-h1043', 'material-2'], 'charge 1 goes to side 2 of the previous weld');
  assert.deepEqual([next.chargeNo1, next.certificate1Id, next.material1Id], ['EXISTING', '', ''], 'charge 2 goes to side 1 of the next weld');
  assert.equal(previous.chargeNo1, 'H-1042', 'the other side of the neighbour is untouched');
  assert.equal(result.body.records.length, 3);
  // No neighbour on that side is not an error; a locked neighbour refuses the whole save and nothing changes.
  const first = f.store.get('welds', 'weld-1');
  assert.equal((await f.act('save-weld', { weldId: first.id, expectedVersion: first._version, chargeNo1: 'EXISTING', certificate1Id: '', material1Id: '', updatePrev: true })).status, 201);
  assert.deepEqual(orderOf(f.store, 'iso-9'), ['weld-9', 'weld-18', 'weld-27']);
  const open = f.store.get('welds', 'weld-18');
  const locked = await f.act('save-weld', { weldId: open.id, expectedVersion: open._version, chargeNo1: 'EXISTING', updatePrev: true });
  assert.equal(locked.status, 423); assert.equal(f.store.get('welds', 'weld-18')._version, open._version); assert.equal(f.store.get('welds', 'weld-9').chargeNo2, 'H-1042');
});

test('rule (d) through HTTP: locked welds cannot be edited, deleted or restored; reopening the release unlocks them; shop and field are separate', async t => {
  const f = await fixture(t);
  // iso-3 has a Prefab and a Field release: weld-3 is a shop weld, weld-12 a field weld.
  assert.equal(f.store.get('weld_types', f.store.get('welds', 'weld-3').typeId as string).location, 'Shop'); assert.equal(f.store.get('weld_types', f.store.get('welds', 'weld-12').typeId as string).location, 'Field');
  for (const id of ['weld-3', 'weld-12']) {
    const weld = f.store.get('welds', id);
    assert.equal((await f.request(`/api/records/welds/${id}`, 'PUT', { description: 'Changed', _version: weld._version })).status, 423, `PUT ${id}`);
    assert.equal((await f.act('save-weld', { weldId: id, kr: 'K9' })).status, 423, `save ${id}`);
    assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: weld._version })).status, 423, `delete ${id}`);
    assert.equal(f.store.get('welds', id)._archived, false);
  }
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-1', 'weld-3'], changes: { pos2: '2G' } })).status, 423, 'one locked weld stops the whole mass edit');
  assert.equal(f.store.get('welds', 'weld-1').pos2 ?? '', '', 'and nothing is written');
  // New welds of a completed phase are refused as well; a weld cannot be typed into a locked phase.
  assert.equal((await f.act('save-weld', { isoId: 'iso-3', weldNo: 'W900', typeId: 'weld-type-0' })).status, 423);
  assert.equal((await f.act('save-weld', { isoId: 'iso-3', weldNo: 'W901' })).status, 201, 'no type, no phase yet');
  // iso-9 only has a Prefab release: its shop weld is locked, its field weld is not.
  assert.equal((await f.act('save-weld', { weldId: 'weld-9', kr: 'K9' })).status, 423);
  assert.equal((await f.act('save-weld', { weldId: 'weld-18', kr: 'K9' })).status, 201);
  assert.equal((await f.act('save-weld', { weldId: 'weld-18', typeId: 'weld-type-1' })).status, 423, 'typing it as a shop weld would lock it');
  // Removing the Field release unlocks weld-12 at once; the Prefab release still holds weld-3.
  archiveRelease(f.store, 'iso-3', 'Field');
  assert.equal((await f.act('save-weld', { weldId: 'weld-12', kr: 'K9' })).status, 201); assert.equal((await f.act('save-weld', { weldId: 'weld-3', kr: 'K9' })).status, 423);
  // Delete, show deleted and bring back; a new Field release locks the deleted field weld against coming back.
  const added = await f.act('save-weld', { isoId: 'iso-3', weldNo: 'W902', typeId: 'weld-type-0' }); assert.equal(added.status, 201);
  const id = added.body.record.id as string;
  assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: f.store.get('welds', id)._version })).status, 200);
  const deleted = (await (await f.request('/api/bootstrap')).json()).rows.welds.find((item: Row) => item.id === id); assert.equal(deleted._archived, true);
  const reinstated = f.store.create('releases', { isoId: 'iso-3', type: 'Field', number: 'FLR-002', reportNo: 'FLR-002', date: '2026-11-01' });
  assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: deleted._version })).status, 423);
  f.store.archive('releases', reinstated.id, reinstated._version, actor);
  assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: deleted._version })).status, 200);
  assert.equal(f.store.get('welds', id)._archived, false);
});

test('the other profiles keep their behaviour: no lock and no entry rules on the plain record routes', async t => {
  const f = await fixture(t, 'access-prototype');
  const weld = f.store.get('welds', 'weld-3');
  assert.equal((await f.request('/api/records/welds/weld-3', 'PUT', { description: 'Changed', _version: weld._version })).status, 200);
  assert.equal((await f.act('save-weld', { isoId: 'iso-1', weldNo: 'W040' })).status, 404);
});

test('Add welds (range) creates the missing numbers all or nothing, after the existing welds', async t => {
  const f = await fixture(t);
  const before = f.store.list('welds').length;
  let result = await f.act('add-welds', { isoId: 'iso-1', start: 8, end: 11, diameterId: 'diameter-6' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.body.records.map((r: Row) => r.weldNo), ['W008', 'W009', 'W011'], 'W010 exists');
  const added = result.body.records.map((r: Row) => f.store.get('welds', r.id));
  assert.ok(added.every((w: Row) => w.diameterId === 'diameter-6' && w.lengthMode === 'Diameter' && !w.date));
  assert.deepEqual(orderOf(f.store, 'iso-1').slice(-3), added.map((w: Row) => w.id), 'new welds follow the existing ones');
  assert.equal(f.store.list('welds').length, before + 3);
  for (const data of [{ isoId: 'iso-1', start: 5, end: 4 }, { isoId: 'iso-1', start: 1, end: 800 }, { isoId: 'iso-1', start: 9.5, end: 12 }, { isoId: 'iso-1', start: 20, end: 22, diameterId: 'nope' }, { isoId: 'nope', start: 1, end: 2 }]) {
    result = await f.act('add-welds', data); assert.ok([404, 422].includes(result.status), JSON.stringify(data)); assert.equal(f.store.list('welds').length, before + 3);
  }
  result = await f.act('add-welds', { isoId: 'iso-1', start: 8, end: 11 }); assert.equal(result.status, 422); assert.match(result.body.error, /already exists/);
  assert.equal((await f.act('add-welds', { isoId: 'iso-1', start: 12, end: 12, kr: 'x' })).status, 404, 'only the range fields are accepted');
});

test('Mass edit welds writes only the fields that change, clears dates on request and is all or nothing', async t => {
  const f = await fixture(t);
  const before = Object.fromEntries(['weld-5', 'weld-6'].map(id => [id, f.store.get('welds', id)]));
  const versions = Object.fromEntries(Object.entries(before).map(([id, weld]) => [id, weld._version]));
  let result = await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions, changes: { kr: 'ignored' } });
  assert.equal(result.status, 422, 'fields outside the capture list are refused');
  result = await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions, changes: { coating1Id: 'coating-none', pos1: '1G', ndoReqPre: true, clearDatefit: true } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  for (const id of ['weld-5', 'weld-6']) {
    const weld = f.store.get('welds', id);
    assert.equal(weld.pos1, '1G'); assert.equal(weld.ndoReqPre, true); assert.equal(weld.datefit, ''); assert.equal(weld.coating1Id, 'coating-none');
    for (const name of ['weldNo', 'date', 'welder1Id', 'wpsId', 'typeId', 'chargeNo1', 'ndoReq', 'repair', 'description']) assert.equal(weld[name] ?? '', before[id][name] ?? '', `${id}.${name} is untouched`);
  }
  // Diameter and length are exclusive; a stale version, an unknown weld and an empty change refuse everything.
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: { diameterId: 'diameter-6', dialen: 90 } })).status, 422);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions: { 'weld-5': 1 }, changes: { pos2: '2G' } })).status, 409);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5', 'nope'], changes: { pos2: '2G' } })).status, 404);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: {} })).status, 422);
  assert.equal(f.store.get('welds', 'weld-5').pos2 ?? '', '');
  // A WPS that is not available to the project refuses the whole batch, and mandatory fields apply to each weld.
  const foreign = f.store.create('wps', { name: 'STX-WPS-RIVER', method: '111', definition: 'Sample', allProjects: true, siteIds: ['site-river'], processId: 'process-1' });
  result = await f.act('mass-edit-welds', { weldIds: ['weld-1', 'weld-10'], changes: { wpsId: foreign.id, pos2: '2G' } });
  assert.equal(result.status, 422); assert.equal(f.store.get('welds', 'weld-1').pos2 ?? '', '');
  result = await f.act('mass-edit-welds', { weldIds: ['weld-1', 'weld-10'], changes: { clearDate: true } });
  assert.equal(result.status, 422); assert.match(result.body.error, /Weld date is required once a welder is assigned/); assert.ok(f.store.get('welds', 'weld-1').date);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], changes: { clearDate: true } })).status, 201, 'Riverside has no mandatory fields');
  assert.equal(f.store.get('welds', 'weld-5').date, '');
});

test('the table order is stored per isometric; a stale order is refused', async t => {
  const f = await fixture(t);
  const order = orderOf(f.store, 'iso-1'); assert.deepEqual(order, ['weld-1', 'weld-10', 'weld-19', 'weld-28']);
  const next = moveWeld(order, 'weld-19', 'up')!;
  const result = await f.act('reorder-welds', { isoId: 'iso-1', weldIds: next });
  assert.equal(result.status, 201, JSON.stringify(result.body)); assert.equal(result.body.records.length, 2, 'only welds whose place changed are written');
  assert.deepEqual(orderOf(f.store, 'iso-1'), next);
  assert.equal(orderOf(f.store, 'iso-2').length, 4); assert.deepEqual(orderOf(f.store, 'iso-9'), ['weld-9', 'weld-18', 'weld-27'], 'other isometrics keep their order');
  for (const weldIds of [next.slice(1), [...next, 'weld-2'], [...next.slice(1), next[1]], 'weld-1']) assert.equal((await f.act('reorder-welds', { isoId: 'iso-1', weldIds })).status, 409);
  assert.deepEqual(orderOf(f.store, 'iso-1'), next);
  // A weld added later still comes last, even where an older weld had no stored order yet.
  f.store.create('welds', { weldNo: 'W000', isoId: 'iso-2' });
  const created = await f.act('save-weld', { isoId: 'iso-2', weldNo: 'W050' }); assert.equal(created.status, 201);
  assert.equal(orderOf(f.store, 'iso-2').at(-1), created.body.record.id);
});

test('access: only accounts that may edit welds in Weld Pilot can use the actions, in both directions and across the pilot boundary', async t => {
  const f = await fixture(t);
  const payload = { ...complete, weldNo: 'W060' };
  const attempts = () => [['save-weld', payload], ['add-welds', { isoId: 'iso-1', start: 20, end: 21 }], ['mass-edit-welds', { weldIds: ['weld-5'], changes: { pos2: '2G' } }], ['reorder-welds', { isoId: 'iso-1', weldIds: orderOf(f.store, 'iso-1') }]] as const;
  // The administrator in the other pilot is refused: the pilot is the boundary.
  f.usePilot('mto');
  for (const [key, data] of attempts()) assert.equal((await f.act(key, data)).status, 403, `mto ${key}`);
  f.usePilot('weld');
  await f.signIn('Weld viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  for (const [key, data] of attempts()) assert.equal((await f.act(key, data)).status, 403, `viewer ${key}`);
  assert.equal((await f.request('/api/records/welds/weld-5', 'PUT', { pos2: '2G', _version: f.store.get('welds', 'weld-5')._version })).status, 403);
  await f.signIn('MTO planner', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  assert.equal((await f.act('save-weld', payload)).status, 403);
  await f.signIn('Weld operator', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' });
  for (const key of ['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']) assert.equal((await f.act(key, attempts().find(([name]) => name === key)![1])).status, 201, `operator ${key}`);
  // Detailed permissions: add and edit are separate rights on the weld area (63).
  await f.signIn('Insert only', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '63': ['show', 'insert'], '64': ['show'] }) });
  assert.equal((await f.act('save-weld', { ...payload, weldNo: 'W061' })).status, 201);
  assert.equal((await f.act('save-weld', { weldId: 'weld-5', pos2: '3G' })).status, 403, 'editing needs the edit right');
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: { pos2: '2G' } })).status, 403);
  // The check the form uses to show its buttons.
  const user = (await (await f.request('/api/auth/status')).json()).user as User;
  const as = (welding: number) => ({ ...user, availability: availabilityFor(HOSTED_RELEASE_PROFILE), permissions: { general: 2, materials: 0, welding, tools: 0, settings: 0 }, capabilities: undefined }) as User;
  assert.equal(canAction(as(2), 'save-weld', { weldId: 'x' }), true); assert.equal(canAction(as(2), 'save-weld', {}), true); assert.equal(canAction(as(1), 'mass-edit-welds'), false); assert.equal(canAction(as(1), 'save-weld', {}), false);
});

test('the sample seed carries realistic entry data: qualifications, certificates with index numbers, abbreviations and a stored order', () => {
  const s = new Store(':memory:'); seed(s);
  assert.ok(s.list('welder_certificates').length >= 6); assert.ok(s.list('certifications').every(c => c.indexNo && c.chargeNo && c.materialId));
  assert.equal(s.get('weld_types', 'weld-type-0').abbreviation, 'BWF');
  const first = s.get('welds', 'weld-1');
  assert.equal(first.certificate1Id, 'cert-h1042'); assert.equal(first.material1Id, 'material-1'); assert.equal(s.get('welds', 'weld-4').chargeNo1, 'EXISTING');
  assert.ok(s.list('welds').every(w => typeof w.sortOrder === 'number'));
  s.close();
});
