import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { seedMtoDashboard } from '../server/mto-dashboard-seed.ts';
import { RESOURCES } from '../shared/resources.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { PILOT_MAP, pilotItemPath } from '../shared/pilots.ts';
import {
  AGING_BUCKETS, BOARD_TABS, MTO_DASHBOARD_REQUIRED, agingBucket, agingOf, boardCounts, boardPage, boardTabMatches, daysBetween, freePoolByMaterial, logisticsSignalOf, materialRevisionRows, mtoDashboard, priorityRank, readinessOf,
} from '../shared/mto-dashboard.ts';
import type { Row } from '../shared/types.ts';

/**
 * Hand-computed sample (today = 2026-11-12). Materials: A-001 (mA), B-002 (mB), C-003 (mC).
 *   stock: mA 15, mB 5, mC none.  reservations: 2 x mB for requirement r4.  Free pool: mA 15, mB 3 (= 5 - 2), mC 0.
 *   Allocation order: iso-a (Prio 1), iso-b (Prio 2), iso-d (Prio 3), iso-c and iso-e (no priority, ISO number).
 */
const row = (id: string, data: Record<string, unknown>): Row => ({ id, _archived: false, _createdAt: `2026-09-01T00:00:${String(id.length).padStart(2, '0')}Z`, _version: 1, ...data }) as Row;
const iso = (id: string, isoNo: string, projectId: string, priority = '') => row(id, { isoNo, projectId, priority });
function sample(): Record<string, Row[]> {
  return {
    sites: [row('site-1', { name: 'Riverside' })],
    projects: [row('p1', { internnumber: 'P-100' }), row('p2', { internnumber: 'P-200' })],
    isometrics: [iso('iso-a', 'A-100', 'p1', 'Prio 1'), iso('iso-b', 'B-200', 'p1', 'Prio 2'), iso('iso-c', 'C-300', 'p1'), iso('iso-d', 'D-400', 'p2', 'Prio 3'), iso('iso-e', 'E-500', 'p1')],
    operation_phases: [row('ph-shop', { name: 'Shop', sort: 1 }), row('ph-field', { name: 'Field', sort: 2 })],
    materials: [row('mA', { materialNo: 'A-001', description: 'Pipe 4 in' }), row('mB', { materialNo: 'B-002', description: 'Elbow 4 in' }), row('mC', { materialNo: 'C-003', description: 'Gasket' })],
    iso_materials: [
      row('r1', { isoId: 'iso-a', materialId: 'mA', quantity: 10, phaseId: 'ph-shop' }), row('r2', { isoId: 'iso-a', materialId: 'mB', quantity: 3, phaseId: 'ph-shop' }),
      row('r3', { isoId: 'iso-b', materialId: 'mA', quantity: 10, phaseId: 'ph-shop' }), row('r4', { isoId: 'iso-c', materialId: 'mB', quantity: 6, phaseId: 'ph-field' }),
      row('r5', { isoId: 'iso-d', materialId: 'mA', quantity: 5, phaseId: 'ph-shop' }), row('r6', { isoId: 'iso-e', materialId: 'mC', quantity: 3, phaseId: 'ph-shop' }),
    ],
    stock: [row('s1', { materialId: 'mA', warehouseId: 'w1', quantity: 15 }), row('s2', { materialId: 'mB', warehouseId: 'w1', quantity: 5 })],
    reservations: [row('res1', { isoId: 'iso-c', requirementId: 'r4', materialId: 'mB', quantity: 2, status: 'Reserved' }), row('res2', { isoId: 'iso-a', requirementId: 'r1', materialId: 'mA', quantity: 4, status: 'Released' })],
    picklists: [row('pl1', { isoId: 'iso-d', requirementId: 'r5', materialId: 'mA', quantity: 5, taken: true, date: '2026-11-01', reportNo: 'PL-1' })],
    orders: [row('o1', { number: '00001', projectId: 'p1', date: '2026-10-01', status: 'Pending' }), row('o2', { number: '00002', projectId: 'p1', date: '2026-10-02', status: 'Cancelled' }), row('o3', { number: '00003', projectId: 'p1', date: '2026-10-10', status: 'Pending' })],
    order_lines: [
      row('l1', { orderId: 'o1', requirementId: 'r3', materialId: 'mA', quantity: 8, received: 3 }),
      row('l2', { orderId: 'o1', requirementId: 'r4', materialId: 'mB', quantity: 10, received: 10 }),
      row('l3', { orderId: 'o1', materialId: 'mB', quantity: 2, received: 0 }),
      row('l4', { orderId: 'o3', requirementId: 'r6', materialId: 'mC', quantity: 1, received: 0 }),
      row('l5', { orderId: 'o2', requirementId: 'r6', materialId: 'mC', quantity: 100, received: 0 }),
    ],
    material_location_events: [row('e1', { requirementId: 'r1', type: 'Move to laydown', date: '2026-10-20' }), row('e2', { requirementId: 'r3', type: 'Service request', date: '2026-10-25' })],
    service_requests: [], spools: [],
    revisions: [row('rev-1', { isoId: 'iso-b', type: 'ISO', revNo: '2' })],
    material_quantity_changes: [row('c1', { requirementId: 'r3', sequence: 1, type: 'Revision removal', revisionId: 'rev-1', previousQuantity: 12, quantity: -2, newQuantity: 10, date: '2026-10-05', note: 'Spool deleted' })],
  };
}
const TODAY = '2026-11-12';
const byIsoNo = (model: ReturnType<typeof mtoDashboard>) => Object.fromEntries(model.board.map(item => [item.isoNo, item]));

test('free pool is stock minus open reservations per material, never negative', () => {
  const pools = freePoolByMaterial(sample());
  assert.deepEqual([...pools].map(([identity, pool]) => [identity, pool.stock, pool.reserved, pool.free]), [['catalog:mA', 15, 0, 15], ['catalog:mB', 5, 2, 3]]);
  const over = sample(); over.reservations.push(row('res3', { isoId: 'iso-a', requirementId: 'r2', materialId: 'mB', quantity: 9, status: 'Reserved' }));
  assert.equal(freePoolByMaterial(over).get('catalog:mB')!.free, 0);
});

test('coverage is handed out in priority then ISO order and drives the readiness of each isometric', () => {
  const model = mtoDashboard(sample(), { today: TODAY }), board = byIsoNo(model);
  assert.deepEqual(model.board.map(item => item.isoNo), ['A-100', 'B-200', 'D-400', 'C-300', 'E-500'], 'priority first, then ISO number');
  assert.deepEqual([board['A-100'].required, board['A-100'].covered, board['A-100'].readiness], [13, 13, 'STARTABLE']);
  assert.deepEqual([board['B-200'].covered, board['B-200'].shortage, board['B-200'].readiness], [5, 5, 'PARTIAL'], 'only 15 - 10 = 5 of mA is left for the second isometric');
  assert.deepEqual([board['D-400'].covered, board['D-400'].shortage, board['D-400'].readiness], [5, 0, 'STARTED'], 'a pick list exists');
  assert.deepEqual([board['C-300'].covered, board['C-300'].shortage, board['C-300'].readiness], [2, 4, 'PARTIAL'], 'its own 2 reserved, the free mB was taken by iso-a');
  assert.deepEqual([board['E-500'].covered, board['E-500'].shortage, board['E-500'].readiness], [0, 3, 'BLOCKED']);
  assert.deepEqual([board['A-100'].coveredLines, board['A-100'].totalLines, board['B-200'].coveredLines, board['B-200'].totalLines], [2, 2, 0, 1]);
  assert.deepEqual(board['B-200'].shortageMaterials, [{ materialNo: 'A-001', description: 'Pipe 4 in', quantity: 5 }]);
});

test('shortage splits into blocking backorder (open order lines) and not ordered; cancelled orders and received lines do not count', () => {
  const model = mtoDashboard(sample(), { today: TODAY }), board = byIsoNo(model);
  assert.deepEqual([board['B-200'].blockingBackorder, board['B-200'].notOrdered, board['B-200'].openOrdered], [5, 0, 5], 'line l1: 8 ordered - 3 received = 5 open');
  assert.deepEqual([board['C-300'].blockingBackorder, board['C-300'].notOrdered, board['C-300'].openOrdered], [2, 2, 2], 'l2 is received in full; l3 has no requirement and is matched by project and material');
  assert.deepEqual([board['E-500'].blockingBackorder, board['E-500'].notOrdered, board['E-500'].openOrdered], [1, 2, 1], 'l4 open 1; the cancelled order l5 is ignored');
  assert.deepEqual([board['A-100'].blockingBackorder, board['A-100'].notOrdered], [0, 0]);
  for (const item of model.board) assert.equal(round(item.blockingBackorder + item.notOrdered), item.shortage, item.isoNo);
});

test('the six KPI cards and the chips of the sample', () => {
  const model = mtoDashboard(sample(), { today: TODAY });
  assert.deepEqual(model.kpis, { startable: 1, started: 1, inScope: 5, partial: 2, blocked: 1, blockingQuantity: 8, blockingIsometrics: 3, notOrderedMaterials: 2, notOrderedIsometrics: 2, freePoolMaterials: 2 });
  assert.deepEqual(model.chips, { maxStartable: 2, freePoolMaterials: 2, ordered: 21, received: 13, openOrdered: 8, blockingBackorder: 8, notOrdered: 4, aging: { '0-7 days': 0, '8-14 days': 1, '15+ days': 3 }, noLogisticsUpdate: 2 });
  assert.deepEqual(model.backlog.map(item => [item.projectId, item.openOrdered, item.blockingBackorder, item.notOrdered]), [['p1', 8, 8, 4], ['p2', 0, 0, 0]]);
});

test('max startable ignores competition for the free pool: iso-b could start alone but not together with iso-a', () => {
  const model = mtoDashboard(sample(), { today: TODAY });
  assert.equal(model.kpis.startable, 1); assert.equal(model.chips.maxStartable, 2);
});

test('logistics signal follows the latest event; the same day ranks Started over At laydown over At service', () => {
  const rows = sample(), model = mtoDashboard(rows, { today: TODAY }), board = byIsoNo(model);
  assert.deepEqual([board['A-100'].signal, board['A-100'].lastEvent, board['A-100'].ageDays, board['A-100'].aging], ['At laydown', '2026-10-20', 23, '15+ days']);
  assert.deepEqual([board['B-200'].signal, board['B-200'].ageDays], ['At service', 18]);
  assert.deepEqual([board['D-400'].signal, board['D-400'].ageDays, board['D-400'].aging], ['Started', 11, '8-14 days']);
  assert.deepEqual([board['C-300'].signal, board['C-300'].ageDays, board['C-300'].aging], ['Not-sent', null, ''], 'no event and no open order line of its own');
  assert.deepEqual([board['E-500'].signal, board['E-500'].lastEvent, board['E-500'].ageDays], ['Not-sent', '', 33], 'no logistics event: aging counts from the oldest open order (2026-10-10)');
  assert.deepEqual(model.signals, { 'Not-sent': 2, 'At service': 1, 'At laydown': 1, Started: 1 });
  // A completed spool service request counts as At laydown on its completion date; a later pick list overrides it on the same day.
  const more = sample(); more.spools = [row('sp1', { isoId: 'iso-c', name: 'S1' })];
  more.service_requests = [row('sr1', { spoolId: 'sp1', status: 'In progress', date: '2026-11-03' }), row('sr2', { spoolId: 'sp1', status: 'Completed', date: '2026-11-01', completedAt: '2026-11-05' })];
  assert.deepEqual(logisticsSignalOf(more, 'iso-c'), { signal: 'At laydown', date: '2026-11-05' }, 'completion on the 5th is later than the open request of the 3rd');
  assert.deepEqual(logisticsSignalOf({ ...more, service_requests: [more.service_requests[0]] }, 'iso-c'), { signal: 'At service', date: '2026-11-03' });
  more.picklists.push(row('pl2', { isoId: 'iso-c', quantity: 1, taken: false, date: '2026-11-05' }));
  assert.deepEqual(logisticsSignalOf(more, 'iso-c'), { signal: 'Started', date: '2026-11-05' }, 'same day: Started beats At laydown');
  more.picklists = [];
  assert.deepEqual(logisticsSignalOf(more, 'iso-c'), { signal: 'At laydown', date: '2026-11-05' });
});

test('an operation phase narrows the lines, the order totals and the free-pool shares', () => {
  const model = mtoDashboard(sample(), { phaseId: 'ph-field', today: TODAY }), board = byIsoNo(model);
  assert.deepEqual(model.board.map(item => item.isoNo), ['C-300']);
  // Only r4 competes for mB now: 2 reserved + 3 free = 5 of 6.
  assert.deepEqual([board['C-300'].covered, board['C-300'].shortage, board['C-300'].blockingBackorder, board['C-300'].notOrdered], [5, 1, 1, 0]);
  assert.deepEqual([model.chips.ordered, model.chips.received, model.chips.openOrdered], [12, 10, 2]);
  assert.deepEqual([model.kpis.startable, model.kpis.partial, model.kpis.blocked, model.kpis.freePoolMaterials], [0, 1, 0, 2], 'the free pool is not phase-scoped');
  assert.equal(mtoDashboard(sample(), { phaseId: 'no-such-phase', today: TODAY }).board.length, 0);
});

test('focus lists: startable by priority, blocked by shortage, hottest materials by isometrics waiting then shortage', () => {
  const model = mtoDashboard(sample(), { today: TODAY });
  assert.deepEqual(model.focus.startable.map(item => item.isoNo), ['A-100']);
  assert.deepEqual(model.focus.blocked.map(item => item.isoNo), ['E-500']);
  assert.deepEqual(model.focus.materials.map(item => [item.materialNo, item.isometrics, item.shortage, item.blockingBackorder, item.notOrdered]), [['A-001', 1, 5, 5, 0], ['B-002', 1, 4, 2, 2], ['C-003', 1, 3, 1, 2]]);
});

test('operations board tabs, counts and paging', () => {
  const model = mtoDashboard(sample(), { today: TODAY }), counts = boardCounts(model.board);
  assert.deepEqual(BOARD_TABS, ['ALL', 'STARTABLE', 'PARTIAL', 'BLOCKED', 'OPEN ORDERED', 'NOT ORDERED', 'AT SERVICE', 'AT LAYDOWN', 'AGING']);
  assert.deepEqual(counts, { ALL: 5, STARTABLE: 1, PARTIAL: 2, BLOCKED: 1, 'OPEN ORDERED': 3, 'NOT ORDERED': 2, 'AT SERVICE': 1, 'AT LAYDOWN': 1, AGING: 3 });
  assert.deepEqual(model.board.filter(item => boardTabMatches(item, 'AGING')).map(item => item.isoNo), ['A-100', 'B-200', 'E-500']);
  const page = boardPage(model.board, 1, 2); assert.deepEqual([page.items.map(item => item.isoNo), page.page, page.pages, page.total], [['D-400', 'C-300'], 1, 3, 5]);
  assert.equal(boardPage(model.board, 99, 2).page, 2, 'the page stays in range'); assert.equal(boardPage([], 3).pages, 1);
});

test('single rules: readiness, priority rank, days and aging buckets', () => {
  assert.deepEqual([{ required: 4, covered: 4, started: false }, { required: 4, covered: 4, started: true }, { required: 4, covered: 1, started: false }, { required: 4, covered: 0, started: false }, { required: 4, covered: 1, started: true }].map(readinessOf), ['STARTABLE', 'STARTED', 'PARTIAL', 'BLOCKED', 'STARTED']);
  assert.deepEqual([{ priority: 'Prio 1' }, { priority: 'Critical' }, { priority: 'Prio 5' }, { priority: '' }, { priority: 'Normal' }].map(item => priorityRank(item as unknown as Row)), [1, 1, 5, 99, 3]);
  assert.deepEqual([daysBetween('2026-11-01', '2026-11-12'), daysBetween('2026-11-12', '2026-11-12'), daysBetween('2026-11-20', '2026-11-12'), daysBetween('', '2026-11-12'), daysBetween('2026-10-31', '2026-11-01')], [11, 0, 0, null, 1]);
  assert.deepEqual([0, 7, 8, 14, 15, 40].map(days => agingBucket(days)), ['0-7 days', '0-7 days', '8-14 days', '8-14 days', '15+ days', '15+ days']); assert.equal(agingBucket(null), '');
  assert.deepEqual([agingOf('2026-11-10', '2026-10-01', TODAY), agingOf('', '2026-11-02', TODAY), agingOf('', '', TODAY)], [2, 10, null]);
  assert.deepEqual([...AGING_BUCKETS], ['0-7 days', '8-14 days', '15+ days']);
});

test('Material revisions report lists the quantity-by-revision log, newest first, with the phase filter', () => {
  const rows = sample(); rows.material_quantity_changes.push(row('c2', { requirementId: 'r4', sequence: 1, type: 'Edit', previousQuantity: 8, quantity: -2, newQuantity: 6, date: '2026-10-30' }), row('c3', { requirementId: 'r4', sequence: 2, type: 'Edit', previousQuantity: 6, quantity: 0, newQuantity: 6, date: '2026-10-30', _archived: true }));
  assert.deepEqual(materialRevisionRows(rows).map(line => [line.isoNo, line.materialNo, line.type, line.revision, line.date, line.previous, line.change, line.quantity, line.note]),
    [['C-300', 'B-002', 'Edit', '', '2026-10-30', 8, -2, 6, ''], ['B-200', 'A-001', 'Revision removal', '2', '2026-10-05', 12, -2, 10, 'Spool deleted']]);
  assert.deepEqual(materialRevisionRows(rows, 'ph-shop').map(line => line.isoNo), ['B-200']);
});

test('an empty or partial workspace gives an empty dashboard instead of an error', () => {
  const model = mtoDashboard({}, { today: TODAY });
  assert.deepEqual([model.board.length, model.kpis.inScope, model.kpis.freePoolMaterials, model.chips.maxStartable, model.backlog.length], [0, 0, 0, 0, 0]);
  const noIso = sample(); noIso.iso_materials = []; assert.equal(mtoDashboard(noIso, { today: TODAY }).board.length, 0);
});

const round = (value: number) => Math.round(value * 1e6) / 1e6;

test('the local sample shows every readiness state, a blocking backorder and a not-ordered material', t => {
  const store = new Store(':memory:'); seed(store); seedMtoLogistics(store, SYSTEM); seedMtoDashboard(store, SYSTEM); seedMtoDashboard(store, SYSTEM); t.after(() => store.close());
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
  const model = mtoDashboard(rows, { today: '2026-11-16' }), board = byIsoNo(model);
  assert.deepEqual(new Set(model.board.map(item => item.readiness)), new Set(['STARTED', 'STARTABLE', 'PARTIAL', 'BLOCKED']));
  assert.deepEqual([board['STX-SK-010'].readiness, board['STX-SK-010'].required, board['STX-SK-010'].covered, board['STX-SK-010'].blockingBackorder, board['STX-SK-010'].notOrdered], ['BLOCKED', 10, 0, 8, 2]);
  assert.equal(rows.materials.filter(item => item.id === 'material-dash-1').length, 1, 'the sample runs once');
  assert.ok(new Set(model.board.map(item => item.signal)).size >= 3, 'logistics signals vary');
});

// ----- through HTTP: the data the dashboard computes from, and the pilot boundary ----------------------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-dashboard-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const password = 'Pilot-Test-Password';
  const client = () => {
    let cookie = '';
    const request = async (path: string, pilot = 'mto', method = 'GET', data?: unknown) => {
      const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
    };
    return { request, login: async (email: string) => assert.equal((await request('/api/auth/login', 'mto', 'POST', { email, password })).status, 200, email) };
  };
  const admin = client();
  assert.equal((await admin.request('/api/auth/setup', 'mto', 'POST', { name: 'Pilot admin', email: 'dashboard-admin@example.test', password })).status, 201);
  const account = (name: string, data: Record<string, unknown>) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password)); return { email: String(user.email) };
  };
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, settingsPermission: 'No access', toolsPermission: 'No access', ...levels }).id;
  return { store, client, account, profile };
}
const rowsOf = async (response: Response) => { const body = await response.json() as { rows: Record<string, Row[]> }; assert.equal(response.status, 200); return body.rows; };

test('the MTO-only account loads every record the dashboard reads and the figures are consistent; the weld-only account is refused in the MTO pilot', async t => {
  const f = await hostedFixture(t);
  const writer = f.profile('Writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const as = f.client(); await as.login(mtoOnly.email);
  const rows = await rowsOf(await as.request('/api/bootstrap', 'mto'));
  assert.ok(!rows.welds, 'MTO-only: no weld register');
  for (const key of MTO_DASHBOARD_REQUIRED) assert.ok(Array.isArray(rows[key]), `the bootstrap delivers ${key}`);
  const model = mtoDashboard(rows, { today: '2026-11-12' });
  assert.ok(model.board.length > 0, 'the sample has isometrics with requirements');
  for (const item of model.board) {
    assert.equal(round(item.covered + item.shortage), item.required, `${item.isoNo}: covered + shortage = required`);
    assert.equal(round(item.blockingBackorder + item.notOrdered), item.shortage, `${item.isoNo}: blocking + not ordered = shortage`);
    assert.ok(item.covered >= 0 && item.shortage >= 0);
  }
  const { kpis } = model; assert.equal(kpis.startable + kpis.started + kpis.partial + kpis.blocked, kpis.inScope);
  assert.equal(model.chips.blockingBackorder, kpis.blockingQuantity);
  assert.equal(Object.values(model.signals).reduce((a, b) => a + b, 0), kpis.inScope);
  assert.equal(boardCounts(model.board).ALL, kpis.inScope);
  // The same account's pilot menu offers the dashboard as its Start page.
  assert.ok(PILOT_MAP.mto.groups.some(group => group.title === 'Start' && group.items.some(item => pilotItemPath(item) === '/dashboard')));

  const weld = f.client(); await weld.login(weldOnly.email);
  const refused = await weld.request('/api/bootstrap', 'mto'); assert.equal(refused.status, 403); assert.equal((await refused.json() as { code: string }).code, 'pilot');
  assert.equal((await weld.request('/api/records/iso_materials', 'mto')).status, 403);
  assert.equal((await weld.request('/api/records/stock', 'mto')).status, 403);
});

test('an MTO profile without materials rights receives none of the dashboard records, so the page shows its no-access state', async t => {
  const f = await hostedFixture(t);
  const narrow = f.profile('General only', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'No access' });
  const account = f.account('No materials', { profileId: narrow, weldEnabled: false, mtoEnabled: true, mtoProfileId: narrow });
  const as = f.client(); await as.login(account.email);
  const response = await as.request('/api/bootstrap', 'mto');
  if (response.status === 200) {
    const rows = (await response.json() as { rows: Record<string, Row[]> }).rows;
    assert.ok(MTO_DASHBOARD_REQUIRED.some(key => !rows[key]), 'at least one required collection is missing, which the client reads as no access');
    for (const key of ['iso_materials', 'stock', 'reservations', 'picklists', 'orders', 'order_lines']) assert.ok(!rows[key]?.length, `${key} is not delivered`);
  } else assert.equal(response.status, 403);
  assert.equal((await as.request('/api/records/stock', 'mto')).status, 403);
  assert.equal((await as.request('/api/records/order_lines', 'mto')).status, 403);
});

test('the "Open ordered" chip equals the sum of the Backlog table\'s open ordered column on the local sample', t => {
  const store = new Store(':memory:'); seed(store); seedMtoLogistics(store, SYSTEM); seedMtoDashboard(store, SYSTEM); t.after(() => store.close());
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
  for (const phaseId of ['', ...rows.operation_phases.map(phase => phase.id)]) {
    const model = mtoDashboard(rows, { today: '2026-11-16', phaseId });
    assert.equal(model.chips.openOrdered, round(model.backlog.reduce((sum, item) => sum + item.openOrdered, 0)), `phase ${phaseId || 'all'}`);
  }
  const all = mtoDashboard(rows, { today: '2026-11-16' });
  assert.ok(all.chips.openOrdered > 0, 'the sample has open ordered quantity');
  // Per main project, as the dashboard shows it: the scoped rows give the same agreement.
  for (const site of rows.sites) {
    const projects = new Set(rows.projects.filter(project => project.siteId === site.id).map(project => project.id));
    const isos = rows.isometrics.filter(iso => projects.has(String(iso.projectId)));
    const model = mtoDashboard({ ...rows, projects: rows.projects.filter(project => projects.has(project.id)), isometrics: isos }, { today: '2026-11-16' });
    assert.equal(model.chips.openOrdered, round(model.backlog.reduce((sum, item) => sum + item.openOrdered, 0)), site.id);
  }
});
