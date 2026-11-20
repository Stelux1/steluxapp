import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE, pageAvailable, availabilityFor } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { orderPlanning, rfqArchive } from '../shared/mto-procurement.ts';
import { rfqDocumentModel } from '../shared/pdf-documents.ts';
import type { Row } from '../shared/types.ts';

/** Request for Quotation (client request 20.11.2026): asks suppliers for offers; it never touches orders, receipts, stock or the ordering status. */
const actor = { id: 'rfq-test', name: 'RFQ test' };
const rows = (s: Store) => Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key, true)])) as Record<string, Row[]>;
const fixture = (t: { after: (fn: () => void) => void }) => { const s = new Store(':memory:'); seed(s); t.after(() => s.close()); return s; };
const rfq = (s: Store, requirementIds: string[], extra: Record<string, unknown> = {}) => { const result = runAction(s, 'request-for-quotation', { requirementIds, date: '2026-11-20', ...extra }, actor, { hosted: true }); assert.ok('record' in result && result.record); return result.record!; };
/** Everything an order, a take-in or a reservation would write; none of it may change. */
const orderState = (s: Store) => JSON.stringify(['orders', 'order_lines', 'receipts', 'reservations', 'stock', 'movements', 'picklists', 'iso_materials'].map(key => s.list(key, true)));
const catalogRequirement = (s: Store, isoId: string, quantity: number, no: string) => {
  const material = s.create('materials', { materialNo: no, description: `RFQ test ${no}`, materialGroup: 'Pipe', articleNo: `ART-${no}`, dia: '6', lbs: 'SCH 40', uom: 'M' }, actor);
  return { material, requirement: s.create('iso_materials', { isoId, materialId: material.id, quantity }, actor) };
};

test('a request for quotation writes no order, receipt, stock or reservation and leaves the ordering status of the materials as it was', t => {
  const s = fixture(t);
  const a = catalogRequirement(s, 'iso-1', 5, 'RFQ-PIPE-A'), b = catalogRequirement(s, 'iso-2', 3, 'RFQ-PIPE-B');
  const before = orderState(s), planBefore = JSON.stringify(orderPlanning(rows(s)));
  const request = rfq(s, [a.requirement.id], { supplierId: 'supplier-steel', requiredBy: '2026-12-01', note: 'Prices for the pipe spools' });
  assert.equal(orderState(s), before, 'nothing of an order, take-in, reservation or stock changed');
  assert.equal(JSON.stringify(orderPlanning(rows(s))), planBefore, 'Order materials still lists the same materials with the same quantities');
  const lines = s.list('rfq_lines').filter(line => line.rfqId === request.id);
  assert.equal(lines.length, 1); assert.equal(lines[0].materialId, a.material.id); assert.equal(Number(lines[0].quantity), 5);
  assert.equal(request.supplierId, 'supplier-steel'); assert.equal(request.requiredBy, '2026-12-01'); assert.equal(request.note, 'Prices for the pipe spools');
  // The same materials can be on another request, and can still be ordered afterwards (the order covers the full need).
  const second = rfq(s, [a.requirement.id, b.requirement.id]);
  assert.equal(s.list('rfq_lines').filter(line => line.rfqId === second.id).length, 2);
  assert.equal(orderState(s), before);
  const order = runAction(s, 'order-requirements', { requirementIds: [a.requirement.id], date: '2026-11-21' }, actor, { hosted: true });
  assert.ok('record' in order && order.record);
  assert.equal(Number(s.list('order_lines').find(line => line.orderId === order.record!.id)!.quantity), 5, 'ordering is not reduced by the requests');
  // After the order the material leaves the request list too (same quantities as Order materials), the requests stay as records.
  assert.equal(orderPlanning(rows(s)).some(g => g.material.id === a.material.id), false);
  assert.equal(rfqArchive(rows(s)).length, 2);
});

test('an RFQ asks for the same quantity as Order materials, less what open orders still bring', t => {
  const s = fixture(t);
  const a = catalogRequirement(s, 'iso-1', 10, 'RFQ-NET');
  runAction(s, 'order-requirements', { requirementIds: [a.requirement.id], date: '2026-11-19' }, actor, { hosted: true });
  const more = s.create('iso_materials', { isoId: 'iso-2', materialId: a.material.id, quantity: 14 }, actor);
  const planned = orderPlanning(rows(s)).find(g => g.material.id === a.material.id)!;
  assert.equal(planned.quantity, 4);
  const request = rfq(s, planned.requirementIds);
  assert.equal(Number(s.list('rfq_lines').find(line => line.rfqId === request.id)!.quantity), 4);
  assert.equal(s.list('rfq_lines').find(line => line.rfqId === request.id)!.requirementIds, more.id);
  // A requirement that is already fully ordered cannot be requested.
  assert.throws(() => rfq(s, [a.requirement.id]), /already fully ordered/);
});

test('RFQ numbers run per main project: RFQ-00001, RFQ-00002, and a second main project starts again at RFQ-00001', t => {
  const s = fixture(t);
  const projects = s.list('projects'), isos = s.list('isometrics');
  const siteOf = (isoId: string) => String(projects.find(p => p.id === isos.find(i => i.id === isoId)!.projectId)!.siteId);
  const sites = new Set(isos.map(iso => siteOf(iso.id)));
  const first = catalogRequirement(s, 'iso-1', 1, 'RFQ-N1'), second = catalogRequirement(s, 'iso-1', 1, 'RFQ-N2');
  const one = rfq(s, [first.requirement.id]), two = rfq(s, [second.requirement.id]);
  assert.equal(one.number, 'RFQ-00001'); assert.equal(two.number, 'RFQ-00002');
  assert.equal(one.siteId, siteOf('iso-1'));
  // The order counter is not used, and orders keep their own numbers.
  assert.equal(s.list('orders').some(o => String(o.number).startsWith('RFQ')), false);
  const other = isos.find(iso => siteOf(iso.id) !== siteOf('iso-1'));
  if (other) {
    const third = catalogRequirement(s, other.id, 1, 'RFQ-N3');
    assert.equal(rfq(s, [third.requirement.id]).number, 'RFQ-00001', 'each main project counts its own requests');
    // One request covers one main project.
    const mixedA = catalogRequirement(s, 'iso-1', 1, 'RFQ-N4'), mixedB = catalogRequirement(s, other.id, 1, 'RFQ-N5');
    assert.throws(() => rfq(s, [mixedA.requirement.id, mixedB.requirement.id]), /one main project/);
  } else assert.ok(sites.size >= 1);
});

test('the request is validated: the supplier must exist, the date must be valid, requirements are required', t => {
  const s = fixture(t);
  const a = catalogRequirement(s, 'iso-1', 2, 'RFQ-VAL');
  assert.throws(() => rfq(s, [a.requirement.id], { supplierId: 'no-such-supplier' }));
  assert.throws(() => rfq(s, [a.requirement.id], { requiredBy: '01/12/2026' }), /needed by/);
  assert.throws(() => rfq(s, []), /Select at least one/);
  assert.throws(() => rfq(s, ['no-such-requirement']));
  assert.equal(s.list('rfqs').length, 0, 'a refused request leaves no record');
  assert.equal(s.list('rfq_lines').length, 0);
});

test('the RFQ document lists the lines with empty supplier columns and only opens for a main project of the pilot', t => {
  const s = fixture(t);
  const a = catalogRequirement(s, 'iso-1', 5, 'RFQ-DOC');
  const request = rfq(s, [a.requirement.id], { supplierId: 'supplier-steel', requiredBy: '2026-12-01' });
  const all = rows(s), projectIds = new Set(all.projects.map(p => p.id));
  const model = rfqDocumentModel(all, request.id, projectIds)!;
  assert.ok(model); assert.equal(model.number, 'RFQ-00001'); assert.equal(model.lines.length, 1);
  assert.equal(model.lines[0][2], 'RFQ-DOC'); assert.equal(model.lines[0][7], '5'); assert.deepEqual(model.lines[0].slice(9), ['', '', ''], 'unit price, availability and delivery time are for the supplier');
  assert.ok(model.items.some(item => item.label === 'Quote needed by' && item.value === '01.12.2026'));
  assert.equal(rfqDocumentModel(all, request.id, new Set()), null);
  assert.equal(rfqDocumentModel(all, 'missing', projectIds), null);
});

test('the menu has Request for Quotation directly before Order materials and the page is delivered', () => {
  const items = PILOT_MAP.mto.groups.find(g => g.title === 'Order / Take in')!.items;
  const index = items.findIndex(item => item.label === 'Request for Quotation');
  assert.ok(index >= 0); assert.equal(items[index + 1].label, 'Order materials');
  assert.equal(pageAvailable(availabilityFor(HOSTED_RELEASE_PROFILE), '/materials/request-for-quotation', RESOURCES), true);
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-rfq-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  const signIn = async (name: string, profileFields: Record<string, unknown>) => {
    const profile = store.create('profiles', { name, ...profileFields });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    cookie = ''; assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'RFQ admin', email: 'rfq-admin@example.test', password })).status, 201) };
}
const detailed = (rules: Record<string, string[]>) => ({ permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules) });
const BASE_RULES = { '4': ['show'], '5': ['show'], '6': ['show'], '12': ['show'], '64': ['show'], '70': ['show'], '75': ['show'], '13': ['show', 'print'], '14': ['show'], '17': ['show', 'print'] };

test('through the hosted API: creating and printing a request needs the print right of Order materials, and no order is created', async t => {
  const f = await hostedFixture(t); await f.setup();
  const orders = () => JSON.stringify([f.store.list('orders', true), f.store.list('order_lines', true), f.store.list('receipts', true), f.store.list('stock', true), f.store.list('movements', true)]);
  const before = orders();
  const made = await f.request('/api/actions/request-for-quotation', 'POST', { requirementIds: ['requirement-2', 'requirement-8'], supplierId: 'supplier-steel', requiredBy: '2026-12-05' });
  assert.equal(made.status, 201, JSON.stringify(await made.json().catch(() => ({}))));
  const created = (await f.store.list('rfqs'))[0]; assert.match(String(created.number), /^RFQ-\d{5}$/);
  assert.equal(orders(), before);
  const pdf = await f.request(`/api/pdf/request-for-quotation?rfqId=${created.id}`);
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal((await f.request('/api/pdf/request-for-quotation?rfqId=missing')).status, 404);
  // Requirement 2 can still be ordered: the request did not touch its status.
  assert.equal((await f.request('/api/actions/order-requirements', 'POST', { requirementIds: ['requirement-2'], date: '2026-11-21' })).status, 201);
  // Show without print: the page's records are readable, but neither creating nor printing is allowed.
  await f.signIn('RFQ Viewer', detailed({ ...BASE_RULES, '13': ['show'], '17': [] }));
  assert.equal((await f.request('/api/records/rfqs')).status, 200);
  const refused = await f.request('/api/actions/request-for-quotation', 'POST', { requirementIds: ['requirement-8'] });
  assert.equal(refused.status, 403); assert.equal(f.store.list('rfqs').length, 1);
  assert.equal((await f.request(`/api/pdf/request-for-quotation?rfqId=${created.id}`)).status, 403);
  // Someone without Order materials sees neither the records nor the document.
  await f.signIn('RFQ Pending only', detailed({ ...BASE_RULES, '13': [], '17': [], '14': ['show'] }));
  assert.equal((await f.request('/api/records/rfqs')).status, 403);
  assert.equal((await f.request('/api/actions/request-for-quotation', 'POST', { requirementIds: ['requirement-8'] })).status, 403);
  assert.equal((await f.request(`/api/pdf/request-for-quotation?rfqId=${created.id}`)).status, 403);
  // Records are read only: the generic record routes cannot write them.
  await f.signIn('RFQ Printer', detailed({ ...BASE_RULES }));
  assert.notEqual((await f.request('/api/records/rfqs', 'POST', { number: 'RFQ-99999', siteId: created.siteId, date: '2026-11-20' })).status, 201);
  // Weld Pilot has none of it.
  f.usePilot('weld');
  assert.equal((await f.request('/api/records/rfqs')).status, 403);
  assert.equal((await f.request('/api/actions/request-for-quotation', 'POST', { requirementIds: ['requirement-8'] })).status, 403);
  assert.equal((await f.request(`/api/pdf/request-for-quotation?rfqId=${created.id}`)).status, 403);
});
