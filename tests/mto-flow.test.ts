import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import { materialLineStatuses } from '../shared/mto-materials.ts';
import type { Row } from '../shared/types.ts';

/**
 * The MTO Pilot end to end through HTTP, in the hosted profile: order → take in → transfer to a project → reserve →
 * start → pick list taken. After every step the isometric's material row (Ord.? / Inv. / Picked, computed by
 * `materialLineStatuses()` from what the bootstrap delivers) is checked, and each step's record is visible on the
 * page of the flow that owns it (take-in log, inventory, pick-list archive).
 */

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-flow-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Pilot admin', email: 'pilot-admin@example.test', password })).status, 201);
  const profile = store.create('profiles', { name: 'Work preparator', generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  const user = store.create('users', { name: 'Work preparator', email: 'work-preparator@example.test', profileId: profile.id, active: true });
  store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
  assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  return { store, request };
}

const json = async <T>(response: Response, status = 201): Promise<T> => { const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body as T; };

test('MTO Pilot end to end: order, take in, transfer, reserve, start and take a pick list move Ord.? / Inv. / Picked on the isometric row', async t => {
  const f = await hostedFixture(t);
  // A catalog material nothing else in the sample uses, so the row's numbers come from this walk alone.
  const material = f.store.create('materials', { materialNo: 'SS-E114-90', description: '90° long radius elbow, stainless steel 316L', materialGroup: 'Elbow', articleNo: 'ART-2114', dia: '4', lbs: 'SCH 10S', uom: 'EA', price: 54.2 }, SYSTEM, 'material-e2e-elbow');
  const isoId = 'iso-4', date = '2026-11-02';
  const added = await json<{ record: Row }>(await f.request('/api/actions/add-iso-material', 'POST', { isoId, source: 'Catalog', materialGroup: 'Elbow', materialId: material.id, quantity: 8, phaseId: 'phase-0' }));
  const requirementId = added.record.id;
  const row = async () => {
    const { rows } = await json<{ rows: Record<string, Row[]> }>(await f.request('/api/bootstrap'), 200);
    const status = materialLineStatuses(rows, isoId).get(requirementId); assert.ok(status, 'the requirement is on the isometric');
    return { ordered: status.isOrdered, inventory: status.inventory, picked: status.picked, rows };
  };
  assert.deepEqual((({ ordered, inventory, picked }) => ({ ordered, inventory, picked }))(await row()), { ordered: false, inventory: 0, picked: 0 });

  // 1. Order materials: one order for the requirement.
  const order = (await json<{ record: Row }>(await f.request('/api/actions/order-requirements', 'POST', { requirementIds: [requirementId], supplierId: 'supplier-steel', date }))).record;
  let state = await row();
  assert.deepEqual([state.ordered, state.inventory, state.picked], [true, 0, 0], 'ordered: Ord.? Yes');
  const line = state.rows.order_lines.find(item => item.orderId === order.id && item.requirementId === requirementId); assert.ok(line);

  // 2. Material take in: the delivery lands in the take-in log and in the storehouse inventory.
  await json(await f.request('/api/actions/receive', 'POST', { orderId: order.id, supplierId: 'supplier-steel', warehouseId: 'warehouse-main', date, items: [{ lineId: line.id, quantity: 8, chargeNo: 'H-5120' }] }));
  state = await row();
  assert.deepEqual([state.ordered, state.inventory, state.picked], [true, 8, 0], 'received: Inv. 8');
  assert.ok(state.rows.receipts.some(receipt => receipt.lineId === line.id && Number(receipt.quantity) === 8 && receipt.chargeNo === 'H-5120'), 'the receipt is in the take-in log');
  const stock = (await json<Row[] | { rows: Row[] }>(await f.request('/api/records/stock'), 200));
  const inventoryLine = (Array.isArray(stock) ? stock : stock.rows).find(item => item.materialId === material.id && item.warehouseId === 'warehouse-main' && item.chargeNo === 'H-5120');
  assert.ok(inventoryLine, 'the receipt is in the Material inventory of the storehouse'); assert.equal(Number(inventoryLine.quantity), 8);

  // 3. Transfer to project: two elbows leave the storehouse for the Riverside site, so they are no longer inventory.
  await json(await f.request('/api/actions/stock-to-project', 'POST', { siteId: 'site-river', date, items: [{ stockId: inventoryLine.id, quantity: 2 }] }));
  state = await row();
  assert.deepEqual([state.ordered, state.inventory, state.picked], [true, 6, 0], 'transferred: Inv. 6');
  assert.ok(state.rows.movements.some(move => move.type === 'Project transfer' && move.materialId === material.id && Number(move.quantity) === -2 && move.siteId === 'site-river'));

  // 4. Reserve: the six in the storehouse are set aside for the isometric; nothing is issued yet.
  await json(await f.request('/api/actions/reserve-iso', 'POST', { isoId, date }));
  state = await row();
  assert.deepEqual([state.ordered, state.inventory, state.picked], [true, 6, 0], 'reserved: stock unchanged');
  assert.ok(state.rows.reservations.some(item => item.requirementId === requirementId && Number(item.quantity) === 6));

  // 5. Start: one pick list, visible in the Pick List archive, not taken yet, so Picked stays 0.
  const started = await json<{ records: Row[] }>(await f.request('/api/actions/start-iso', 'POST', { isoId, date }));
  const pick = started.records.find(item => item.requirementId === requirementId); assert.ok(pick, 'the pick list carries the requirement');
  const reportNo = String(pick.reportNo); assert.match(reportNo, /^PL-\d{4}-\d{4}$/); assert.equal(pick.taken, false); assert.equal(Number(pick.quantity), 6);
  state = await row();
  assert.deepEqual([state.ordered, state.inventory, state.picked], [true, 6, 0], 'started: claimed, not issued');
  const archive = await json<Row[] | { rows: Row[] }>(await f.request('/api/records/picklists'), 200);
  assert.ok((Array.isArray(archive) ? archive : archive.rows).some(item => item.reportNo === reportNo && item.taken === false), 'the pick list is in the archive');

  // 6. Taken: the pick list issues the stock.
  await json(await f.request('/api/actions/take-picklist', 'POST', { reportNo, date }));
  state = await row();
  assert.deepEqual([state.ordered, state.inventory, state.picked], [true, 0, 6], 'taken: Picked 6, Inv. 0');
  assert.ok(state.rows.picklists.some(item => item.reportNo === reportNo && item.taken === true));
});

test('the MTO Pilot menu has one item per page, in the reference group order', () => {
  const mto = PILOT_MAP.mto;
  assert.deepEqual(mto.groups.map(group => group.title), ['General data', 'Start', 'Materials', 'Order / Take in', 'Projects data', 'Logistic', 'Calculations', 'System']);
  const items = mto.groups.flatMap(group => group.items);
  const paths = items.filter(item => !item.action).map(item => pilotItemPath(item)); // controls (Change password, Iso overview) have no page
  assert.equal(new Set(paths).size, paths.length, `duplicate menu paths: ${paths.filter((path, i) => paths.indexOf(path) !== i).join(', ')}`);
  const labels = Object.fromEntries(items.map(item => [item.label, pilotItemPath(item)]));
  assert.deepEqual({
    'Order materials': labels['Order materials'], 'Pending order': labels['Pending order'], 'Material take in': labels['Material take in'], 'Order archive': labels['Order archive'],
    'Material inventory': labels['Material inventory'], Storehouses: labels.Storehouses, 'Transfer orders': labels['Transfer orders'], 'Materials list': labels['Materials list'],
    'Isometric materials': labels['Isometric materials'], 'Isometric execution': labels['Isometric execution'], 'Pick List archive': labels['Pick List archive'],
    'Service request': labels['Service request'], 'Service req. - Materials': labels['Service req. - Materials'], 'Request archive': labels['Request archive'],
  }, {
    'Order materials': '/materials/order-materials', 'Pending order': '/materials/pending-orders', 'Material take in': '/materials/take-in', 'Order archive': '/materials/order-archive',
    'Material inventory': '/materials/stock', Storehouses: '/workspace/warehouses', 'Transfer orders': '/materials/transfer_orders', 'Materials list': '/materials/materials-list',
    'Isometric materials': '/materials/iso_materials', 'Isometric execution': '/materials/iso-execution', 'Pick List archive': '/materials/picklists',
    'Service request': '/materials/service-spools', 'Service req. - Materials': '/materials/service-materials', 'Request archive': '/materials/service_requests',
  });
});
