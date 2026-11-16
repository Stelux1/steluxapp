import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { REFUSAL_TEXTS, internalText, refusalBody } from '../shared/refusal.ts';
import { RESOURCES } from '../shared/resources.ts';
import type { Row } from '../shared/types.ts';

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(t: { after: (fn: () => Promise<void>) => void }, profile: string = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-refusal-'));
  const db = new Store(join(dir, 'test.sqlite')); seed(db);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(db, dir, { releaseProfile: profile as typeof HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', ...(profile === HOSTED_RELEASE_PROFILE ? { 'X-Stelux-Pilot': pilot } : {}), Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const setup = async () => assert.equal((await request('/auth/setup', 'POST', { name: 'Refusal admin', email: 'refusal-admin@example.test', password: 'Refusal-Test-Password' })).status, 201);
  return { db, request, setup, usePilot: (key: string) => { pilot = key; } };
}
const refused = async (response: Response, status: number) => { const body = await response.json() as { error: string; fields?: Record<string, string> }; assert.equal(response.status, status, JSON.stringify(body)); return body; };
const NOT_GENERIC: string[] = [REFUSAL_TEXTS.conflict, REFUSAL_TEXTS.check, REFUSAL_TEXTS.neutral];

test('scn-SB-D2: a duplicate Flange ID names the field and the value, at the field', async t => {
  const f = await fixture(t); await f.setup();
  const flange = { isoId: 'iso-3', flange_id: 'FL-DUP-1', line_number: 'AT-DUP-1', first_pass_nm: 50, second_pass_nm: 100, target_moment_nm: 150, max_dev: 5 };
  assert.equal((await f.request('/records/flanges', 'POST', flange)).status, 201);
  const body = await refused(await f.request('/records/flanges', 'POST', flange), 409);
  assert.equal(body.error, 'Flange ID FL-DUP-1 already exists.'); assert.ok(body.fields?.flange_id);
  assert.equal(f.db.list('flanges').filter(row => row.flange_id === 'FL-DUP-1').length, 1);
});

test('scn-SB-D2: a duplicate ITP number names the field and the value; editing into a duplicate does too', async t => {
  const f = await fixture(t); await f.setup();
  const make = (number: string) => f.request('/records/itps', 'POST', { number, description: 'Piping', ndtPercent: 15, revision: '1' });
  const first = await make('ITP-DUP-1'); assert.equal(first.status, 201);
  const body = await refused(await make('ITP-DUP-1'), 409);
  assert.match(body.error, /ITP.* ITP-DUP-1 already exists\.$/); assert.ok(!NOT_GENERIC.includes(body.error));
  const second = (await (await make('ITP-DUP-2')).json()).record as Row;
  const edit = await refused(await f.request(`/records/itps/${second.id}`, 'PUT', { number: 'ITP-DUP-1', _version: second._version }), 409);
  assert.match(edit.error, /ITP-DUP-1 already exists\.$/);
});

test('scn-SC-N1: a custom material with "add to DB" and an existing number names the material number', async t => {
  const f = await fixture(t); await f.setup(); f.usePilot('mto');
  const custom = { isoId: 'iso-1', source: 'Custom', materialNo: 'CUS-DUP-77', description: 'Custom pipe shoe', quantity: 5, uom: 'EA', materialGroup: 'Support', addToDB: true };
  const first = await f.request('/actions/add-iso-material', 'POST', custom); assert.equal(first.status, 201, JSON.stringify(await first.clone().json()));
  const body = await refused(await f.request('/actions/add-iso-material', 'POST', custom), 409);
  assert.equal(body.error, 'Material No CUS-DUP-77 already exists.');
});

test('scn-SB-D3: refusals of action routes keep their own sentence and their field hints', async t => {
  const f = await fixture(t); await f.setup();
  let body = await refused(await f.request('/actions/reopen-release', 'POST', { isoId: 'iso-1', type: 'Field', reason: '', date: '2026-11-20' }), 422);
  assert.ok(!NOT_GENERIC.includes(body.error), body.error); assert.ok(body.fields?.reason, JSON.stringify(body));
  body = await refused(await f.request('/actions/hydrotest-move', 'POST', { spoolIds: [], testSystemId: 'test-st' }), 422);
  assert.ok(!NOT_GENERIC.includes(body.error), body.error);
  body = await refused(await f.request('/actions/hydrotest-result', 'POST', { testSystemId: 'test-st', accepted: 'yes' }), 422);
  assert.ok(!NOT_GENERIC.includes(body.error), body.error); assert.ok(body.fields && Object.keys(body.fields).length);
  const fwp = f.db.list('field_packages').find(row => row.projectId !== f.db.get('isometrics', 'iso-1').projectId);
  if (fwp) { body = await refused(await f.request('/actions/assign-fwp', 'POST', { isoIds: ['iso-1'], fieldPackageId: fwp.id }), 422); assert.ok(!NOT_GENERIC.includes(body.error), body.error); }
});

test('scn-SC-D1: a 409 raised by a rule carries the rule sentence, with no record names', async t => {
  const f = await fixture(t); await f.setup(); f.usePilot('mto');
  const order = f.db.list('orders').find(o => !['Received', 'Cancelled'].includes(String(o.status)))!;
  const line = f.db.list('order_lines').find(l => l.orderId === order.id)!;
  // MTO Pilot accepts more than ordered (as the reference); taking back more than the line received is the rule's 409.
  const over = await refused(await f.request('/actions/receive', 'POST', { orderId: order.id, supplierId: order.supplierId || 'supplier-steel', items: [{ lineId: line.id, quantity: -(Number(line.received) + 1000) }] }), 409);
  assert.equal(over.error, `Only ${Number(line.received)} of this line can be taken back.`);
  const stock = f.db.list('stock')[0];
  const short = await f.request('/actions/adjust-material', 'POST', { warehouseId: stock.warehouseId, materialId: stock.materialId, customMaterialId: stock.customMaterialId, chargeNo: stock.chargeNo, quantity: -(Number(stock.quantity) + 1000), reason: 'Count' });
  if (short.status === 409) assert.match((await short.json()).error, /^Insufficient stock/);
});

test('a version conflict and a blocked delete keep the generic sentence', async t => {
  const f = await fixture(t); await f.setup();
  const company = f.db.list('companies')[0];
  const stale = await refused(await f.request(`/records/companies/${company.id}`, 'PUT', { name: 'Renamed', _version: Number(company._version) + 5 }), 409);
  assert.equal(stale.error, REFUSAL_TEXTS.conflict);
  const used = RESOURCES.flatMap(resource => resource.fields.filter(field => field.ref).map(field => ({ resource, field }))).find(({ resource, field }) => !resource.readonly && f.db.list(resource.key).some(row => row[field.name]) && ['companies', 'projects', 'suppliers', 'warehouses', 'sites', 'laydowns', 'material_types', 'materials'].includes(field.ref!));
  assert.ok(used);
  const target = f.db.list(used.resource.key).find(row => row[used.field.name])!; const owner = f.db.get(used.field.ref!, target[used.field.name]);
  const blocked = await refused(await f.request(`/records/${used.field.ref}/${owner.id}/archive`, 'POST', { _version: owner._version }), 409);
  assert.equal(blocked.error, REFUSAL_TEXTS.conflict);
});

test('other profiles keep their sentences for a version conflict', async t => {
  const f = await fixture(t, 'full'); await f.setup();
  const company = f.db.list('companies')[0];
  const stale = await refused(await f.request(`/records/companies/${company.id}`, 'PUT', { name: 'Renamed', _version: Number(company._version) + 5 }), 409);
  assert.match(stale.error, /changed since you opened it/);
});

test('an unexpected error or an error with internal text never reaches the user', () => {
  const hosted = { hosted: true };
  const sql = new AppError(409, 'UNIQUE constraint failed: index \'flanges_unique_0\'');
  for (const text of ["UNIQUE constraint failed: index 'flanges_unique_0'", 'duplicate key value violates unique constraint "x_unique_1"', 'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed', 'SELECT * FROM iso WHERE id=1', 'Error at Object.run (/app/server/store.ts:120:11)', 'no such column: data', 'Unexpected token < in JSON at position 0']) {
    assert.ok(internalText(text), text);
    const answer = refusalBody(new AppError(422, text), hosted); assert.equal(answer.body.error, REFUSAL_TEXTS.neutral); assert.ok(!internalText(answer.body.error));
  }
  assert.equal(refusalBody(sql, hosted).body.error, REFUSAL_TEXTS.neutral);
  assert.deepEqual(refusalBody(new AppError(422, 'Enter a reason.', { reason: 'SQLITE_ERROR near "x"', other: 'Enter the reason for reopening.' }), hosted).body.fields, { other: 'Enter the reason for reopening.' });
  assert.equal(refusalBody(new AppError(500, 'SELECT secret FROM users'), hosted).body.error, REFUSAL_TEXTS.failed);
  assert.ok(!internalText('Received quantity exceeds the outstanding quantity.') && !internalText('Flange ID FL-001 already exists.') && !internalText('Insufficient stock of Elbow 90. Available: 4.'));
});

test('record routes may only name delivered fields; action routes keep their hints', () => {
  const error = new AppError(422, 'Select a spool.', { spoolId: 'Pick one.' });
  assert.equal(refusalBody(error, { hosted: true, deliver: () => false }).body.error, REFUSAL_TEXTS.check);
  assert.equal(refusalBody(error, { hosted: true }).body.error, 'Select a spool.');
  assert.deepEqual(refusalBody(error, { hosted: true }).body.fields, { spoolId: 'Pick one.' });
  assert.equal(refusalBody(Object.assign(new AppError(409, 'x'), { kind: 'duplicate' as const }), { hosted: true }).body.error, 'x');
});

test('an error from the store never carries the name or id of a record outside the answer', async t => {
  const f = await fixture(t); await f.setup();
  const flange = { isoId: 'iso-3', flange_id: 'FL-SCOPE-1', line_number: 'AT-S', first_pass_nm: 50, second_pass_nm: 100, target_moment_nm: 150, max_dev: 5 };
  await f.request('/records/flanges', 'POST', flange);
  const body = await refused(await f.request('/records/flanges', 'POST', flange), 409);
  const other = f.db.list('flanges').find(row => row.flange_id === 'FL-SCOPE-1')!;
  assert.ok(!JSON.stringify(body).includes(other.id) && !JSON.stringify(body).includes('iso-3') && !JSON.stringify(body).includes('unique'));
});

test('client: a non-JSON answer, a network failure and a lost session get plain sentences', async () => {
  const { api, SESSION_ENDED } = await import('../client/api.ts');
  const events: string[] = [];
  Object.assign(globalThis, { window: { location: { pathname: '/' }, dispatchEvent: (event: Event) => { events.push(event.type); return true; } } });
  const realFetch = globalThis.fetch;
  try {
    const answer = (body: string, status: number) => { globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch; };
    answer('<html>Bad Gateway</html>', 502);
    await assert.rejects(api('/records/welds'), (e: Error) => e.message === REFUSAL_TEXTS.unreachable && !/token|JSON/i.test(e.message));
    answer('<html>OK</html>', 200);
    await assert.rejects(api('/records/welds'), (e: Error) => e.message === REFUSAL_TEXTS.unreachable);
    globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await assert.rejects(api('/records/welds'), (e: Error) => e.message === REFUSAL_TEXTS.unreachable);
    answer(JSON.stringify({ error: 'Sign in to your workspace.' }), 401);
    await assert.rejects(api('/bootstrap'), (e: Error & { status?: number }) => e.message === REFUSAL_TEXTS.sessionEnded && e.status === 401);
    assert.deepEqual(events, [SESSION_ENDED]);
    answer(JSON.stringify({ error: 'Email or password is not correct.' }), 401);
    await assert.rejects(api('/auth/login', { method: 'POST', body: '{}' }), (e: Error) => e.message === 'Email or password is not correct.');
    assert.equal(events.length, 1);
    answer(JSON.stringify({ error: 'Enter a reason.', fields: { reason: 'Required.' } }), 422);
    await assert.rejects(api('/actions/x'), (e: Error & { fields?: Record<string, string> }) => e.message === 'Enter a reason.' && e.fields?.reason === 'Required.');
    answer(JSON.stringify({ error: 'UNIQUE constraint failed: index x' }), 409);
    await assert.rejects(api('/records/x'), (e: Error) => !internalText(e.message));
  } finally { globalThis.fetch = realFetch; delete (globalThis as { window?: unknown }).window; }
});
