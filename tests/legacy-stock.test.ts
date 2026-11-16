import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { SiteScope } from '../server/site-scope.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { SITE_SCOPE_SPECIFIC, USER_SITES } from '../shared/site-scope.ts';
import { mtoDashboard } from '../shared/mto-dashboard.ts';
import { materialLineStatuses, materialStatus } from '../shared/mto-materials.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { runHostedPreparation, type PreparationParts } from '../server/hosted-preparation.ts';
import type { PrepareResult } from '../server/hosted-schema.ts';
import { hostedDataSteps } from '../server/hosted-data-steps.ts';
import { RESOURCES } from '../shared/resources.ts';
import { requirementExecution } from '../shared/materials.ts';
import { executionBoard, freePool, isoStatuses, poolKey } from '../shared/mto-logistics.ts';
import { conservedTotals, countedSiteId, countedStock, inventoryRows, legacyInventorySiteId, materialsList, orderPlaces, reservedOnOpenOrders, storehouseRows } from '../shared/mto-stock.ts';
import type { Row } from '../shared/types.ts';

/**
 * Stock of the old model after the hosted upgrade (shared/mto-stock.ts, "Stock of the old model"): before the two location
 * kinds a storehouse belonged to one main project and its isometrics counted its stock. The upgrade only inserts, so those
 * rows keep no `locationKind`; they are read as inventory of their storehouse's main project.
 */
const actor = { id: 'legacy-test', name: 'Legacy stock test' };
const day = '2026-11-16';
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
const NORTH = 'site-north', RIVER = 'site-river';

/**
 * A workspace as the old model wrote it: the Main warehouse belongs to site-north, Field stores to site-river, the yard
 * store to no main project; stock rows without `locationKind`; an untaken pick list of the old rule (it names its
 * storehouse and charge) for iso-1; the orders of the sample data stay open. Written with plain SQL, as stored data.
 */
/**
 * `crossClaims`: two more untaken pick lists of the old rule, each for an isometric of one main project, taking from an old
 * row of the OTHER main project (PICK-OLD-2: iso-3 of site-north, 4 of material-3 from Field stores; PICK-OLD-3: iso-5 of
 * site-river, 5 of material-5 from the Main warehouse). `orders`: two open transfer orders of the old model of type
 * "Inventory - Project" (status Open, a storehouse, the target site, no source project site), whose items point at old rows
 * of site-north (TO-OLD-1: 2 of material-3 from old-n-3; TO-OLD-2: 4 of material-1 from old-n-1a), both to site-river.
 */
function oldWorkspace(t: { after: (fn: () => void) => void }, options: { crossClaims?: boolean; orders?: boolean } = {}) {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  store.db.exec('DELETE FROM transfer_order_items; DELETE FROM transfer_orders; DELETE FROM reservations; DELETE FROM picklists; DELETE FROM stock; DELETE FROM movements');
  const json = (id: string, table: string, data: Record<string, unknown>, at: string) => store.db.prepare(`INSERT INTO "${table}"(id,data,created_at,updated_at) VALUES (?,?,?,?)`).run(id, JSON.stringify(data), at, at);
  for (const [id, siteId] of [['warehouse-main', NORTH], ['warehouse-field', RIVER]]) {
    const row = store.get('warehouses', id); const { id: _id, _version, _archived, _createdAt, _updatedAt, ...data } = row;
    store.db.prepare('UPDATE warehouses SET data=? WHERE id=?').run(JSON.stringify({ ...data, siteId }), id);
  }
  const stock: [string, string, string, string, number, string][] = [
    // id, storehouse, material, charge, quantity, written
    ['old-n-1a', 'warehouse-main', 'material-1', 'H-1001', 10, '2025-03-01T08:00:00.000Z'],
    ['old-n-1b', 'warehouse-main', 'material-1', 'H-1002', 5, '2025-04-01T08:00:00.000Z'],
    ['old-n-3', 'warehouse-main', 'material-3', 'H-1001', 6, '2025-03-01T08:00:00.000Z'],
    ['old-n-5', 'warehouse-main', 'material-5', 'H-1001', 40, '2025-03-01T08:00:00.000Z'],
    ['old-r-1', 'warehouse-field', 'material-1', 'H-1003', 20, '2025-03-01T08:00:00.000Z'],
    ['old-r-3', 'warehouse-field', 'material-3', 'H-1001', 50, '2025-03-01T08:00:00.000Z'],
    ['old-r-5', 'warehouse-field', 'material-5', 'H-1001', 6, '2025-03-01T08:00:00.000Z'],
    ['old-y-5', 'warehouse-yard', 'material-5', 'H-1001', 100, '2025-03-01T08:00:00.000Z'],
  ];
  for (const [id, warehouseId, materialId, chargeNo, quantity, at] of stock) json(id, 'stock', { materialId, warehouseId, chargeNo, quantity }, at);
  const claimFor = store.list('iso_materials').find(row => row.isoId === 'iso-1' && row.materialId === 'material-1')!;
  json('old-pick-1', 'picklists', { number: 'PICK-OLD-1', isoId: 'iso-1', warehouseId: 'warehouse-main', materialId: 'material-1', requirementId: claimFor.id, quantity: 3, date: '2025-05-01', chargeNo: 'H-1002', taken: false }, '2025-05-01T08:00:00.000Z');
  const requirement = (isoId: string, materialId: string) => store.list('iso_materials').find(row => row.isoId === isoId && row.materialId === materialId)!.id;
  if (options.crossClaims) {
    json('old-pick-2', 'picklists', { number: 'PICK-OLD-2', isoId: 'iso-3', warehouseId: 'warehouse-field', materialId: 'material-3', requirementId: requirement('iso-3', 'material-3'), quantity: 4, date: '2025-05-02', chargeNo: 'H-1001', taken: false }, '2025-05-02T08:00:00.000Z');
    json('old-pick-3', 'picklists', { number: 'PICK-OLD-3', isoId: 'iso-5', warehouseId: 'warehouse-main', materialId: 'material-5', requirementId: requirement('iso-5', 'material-5'), quantity: 5, date: '2025-05-02', chargeNo: 'H-1001', taken: false }, '2025-05-02T08:00:00.000Z');
  }
  if (options.orders) {
    for (const [id, number, stockId, materialNo, description, quantity] of [['to-old-1', 'TO-OLD-1', 'old-n-3', 'CS-F150', 'Flange class 150', 2], ['to-old-2', 'TO-OLD-2', 'old-n-1a', 'CS-P060', 'Pipe', 4]] as const) {
      json(id, 'transfer_orders', { number, type: 'Inventory - Project', priority: 'Normal', status: 'Open', fromWarehouseId: 'warehouse-main', siteId: RIVER, toWarehouseId: '', date: '2025-05-03', notes: '' }, '2025-05-03T08:00:00.000Z');
      json(`${id}-item`, 'transfer_order_items', { orderId: id, materialNo, description, quantity, uom: 'EA', stockId }, '2025-05-03T08:00:00.000Z');
    }
  }
  return store;
}
const snapshot = (store: Store) => new Map(RESOURCES.map(resource => [resource.key, new Map((store.db.prepare(`SELECT id, data, version, archived, created_at, updated_at FROM "${resource.key}"`).all() as { id: string }[]).map(row => [row.id, { ...row }]))]));
function prepare(store: Store) {
  const parts: PreparationParts = {
    schemaUpToDate: () => true,
    prepareSchema: ({ dryRun }) => ({ dryRun, upToDate: true, created: { tables: [], columns: [], foreignKeys: [], indexes: [], rowLevelSecurity: [] }, columns: [], counts: {}, recordsPreserved: true } as unknown as PrepareResult),
    dataSteps: hostedDataSteps(() => store), backup: () => 'backup',
  };
  return runHostedPreparation(parts, false);
}
const percent = (store: Store, isoId: string) => isoStatuses(rowsOf(store), { isoId }).get(isoId)?.percent ?? null;
const inv = (store: Store, isoId: string, materialId: string) => requirementExecution(rowsOf(store), { isoId }).find(entry => entry.requirement.materialId === materialId)!.inventory;
const pool = (store: Store, siteId: string, materialId: string) => freePool(rowsOf(store)).get(poolKey(siteId, `catalog:${materialId}`)) ?? { stock: 0, reserved: 0, claimed: 0, free: 0 };
const quantity = (store: Store, id: string) => Number(store.get('stock', id).quantity);

test('old-model stock counts for its storehouse\'s main project only, after a preparation that changes no stored row', t => {
  const store = oldWorkspace(t);
  const before = snapshot(store);
  prepare(store);
  const after = snapshot(store);
  for (const [key, rows] of before) for (const [id, stored] of rows) assert.deepEqual(after.get(key)!.get(id), stored, `${key} ${id} is unchanged`);
  assert.equal(store.get('stock', 'old-n-1a').locationKind, undefined, 'the row still has no location kind');
  const rows = rowsOf(store);
  assert.deepEqual(['old-n-1a', 'old-r-1', 'old-y-5'].map(id => legacyInventorySiteId(rows, store.get('stock', id))), [NORTH, RIVER, '']);

  // iso-3 (site-north) needs 12 of material-3: north's old row gives 6, river's 50 do not count → floor(6 / 12 × 100) = 50 %.
  assert.equal(inv(store, 'iso-3', 'material-3'), 6); assert.equal(percent(store, 'iso-3'), 50);
  // iso-5 (site-river) needs 12 of material-5: river's 6 count; north's 40 and the yard's 100 (no main project) do not → 50 %.
  assert.equal(inv(store, 'iso-5', 'material-5'), 6); assert.equal(percent(store, 'iso-5'), 50);
  // material-1 in the north: 10 + 5 on hand, 3 claimed by the old pick list of iso-1 → Inv. 12; iso-9 needs 12 → 100 %.
  assert.deepEqual(pool(store, NORTH, 'material-1'), { stock: 15, reserved: 0, claimed: 3, free: 12 });
  assert.equal(inv(store, 'iso-9', 'material-1'), 12); assert.equal(percent(store, 'iso-9'), 100);
  assert.deepEqual(pool(store, RIVER, 'material-1'), { stock: 20, reserved: 0, claimed: 0, free: 20 });
  // The Materials list (Inv.) reads the same rule.
  assert.equal(materialsList(rows, { isoId: 'iso-3' })[0].values.inventory, 6);
  // The rows stay listed where they are: storehouse lines, not rows of the Material inventory page.
  assert.ok(storehouseRows(rows, { warehouseId: 'warehouse-main', onlyWithQuantity: false }).some(entry => entry.stock.id === 'old-n-1a'));
  assert.equal(inventoryRows(rows, { siteId: NORTH, onlyWithQuantity: false }).some(row => row.lines.some(line => line.id === 'old-n-1a')), false);

  // A second derivation counts nothing twice: same figures, and every row counts for at most one main project.
  assert.deepEqual([...freePool(rowsOf(store))], [...freePool(rows)]);
  const total = rows.stock.reduce((sum, row) => sum + Number(row.quantity), 0);
  const counted = [...freePool(rows).values()].reduce((sum, value) => sum + value.stock, 0);
  const uncounted = rows.stock.filter(row => !countedSiteId(rows, row)).reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal(counted + uncounted, total); assert.equal(uncounted, 100, 'only the yard store, which names no main project');
  // A second preparation adds nothing.
  const settled = snapshot(store); prepare(store); assert.deepEqual(snapshot(store), settled);
});

test('Start takes old-model stock of its own main project, charge by charge, leaving what an old pick list claims; Undo puts it back', t => {
  const store = oldWorkspace(t); prepare(store);
  const started = runAction(store, 'start-iso', { isoId: 'iso-9', date: day }, actor);
  const reportNo = String(started.records![0].reportNo);
  // 12 needed: H-1001 gives its 10, H-1002 gives 2 and keeps the 3 the old pick list of iso-1 claims; river's row is untouched.
  assert.deepEqual([quantity(store, 'old-n-1a'), quantity(store, 'old-n-1b'), quantity(store, 'old-r-1')], [0, 3, 20]);
  assert.deepEqual(store.list('movements').filter(move => move.pickListNo === reportNo).map(move => [move.warehouseId, move.siteId, move.chargeNo, move.quantity]).sort(),
    [['warehouse-main', NORTH, 'H-1001', -10], ['warehouse-main', NORTH, 'H-1002', -2]]);
  assert.equal(percent(store, 'iso-9'), 100, 'picked now');
  const rows = rowsOf(store);
  assert.equal(countedSiteId(rows, store.get('stock', 'old-n-1b')), NORTH, 'what is left still counts for site-north');
  assert.deepEqual(pool(store, NORTH, 'material-1'), { stock: 3, reserved: 0, claimed: 3, free: 0 });
  // The old pick list can still be taken from its own line.
  const taken = runAction(store, 'take-picklist', { reportNo: 'PICK-OLD-1', date: day }, actor);
  assert.equal(taken.records!.length, 1); assert.equal(quantity(store, 'old-n-1b'), 0);

  // Undo execution of the Start gives each charge back to the line it came from, still counted for site-north.
  runAction(store, 'undo-iso-execution', { reportNo }, actor);
  assert.deepEqual([quantity(store, 'old-n-1a'), quantity(store, 'old-n-1b')], [10, 2]);
  assert.deepEqual(countedStock(rowsOf(store), NORTH, 'catalog:material-1').map(entry => [entry.row.id, entry.free]), [['old-n-1a', 10], ['old-n-1b', 2]]);
});

test('a transfer of part of an old-model row to another main project moves exactly that quantity; totals are conserved', t => {
  const store = oldWorkspace(t); prepare(store);
  const totals = conservedTotals(rowsOf(store));
  runAction(store, 'stock-to-project', { siteId: RIVER, items: [{ stockId: 'old-n-3', quantity: 2 }], date: day }, actor);
  assert.equal(quantity(store, 'old-n-3'), 4);
  assert.deepEqual([pool(store, NORTH, 'material-3').stock, pool(store, RIVER, 'material-3').stock], [4, 52], 'north 6 − 2, river 50 + 2');
  assert.equal(inv(store, 'iso-3', 'material-3'), 4); assert.equal(percent(store, 'iso-3'), 33);
  assert.deepEqual(conservedTotals(rowsOf(store)), totals);
  // Material moved INTO an old-model row makes it an ordinary storehouse line: moved-in stock never becomes a main project's inventory.
  runAction(store, 'stock-move', { stockId: 'old-y-5', toWarehouseId: 'warehouse-main', quantity: 10, date: day }, actor);
  assert.equal(store.get('stock', 'old-n-5').locationKind, 'storehouse'); assert.equal(quantity(store, 'old-n-5'), 50);
  assert.equal(pool(store, NORTH, 'material-5').stock, 0);
  assert.deepEqual(conservedTotals(rowsOf(store)), totals);
});

test('rows written after the upgrade always carry a location kind and are never derived', t => {
  const store = oldWorkspace(t); prepare(store);
  runAction(store, 'adjust-material', { materialId: 'material-7', warehouseId: 'warehouse-main', chargeNo: 'H-9001', quantity: 9, date: day, note: 'Found at the count' }, actor);
  const added = store.list('stock').find(row => row.materialId === 'material-7' && row.chargeNo === 'H-9001')!;
  assert.equal(added.locationKind, 'storehouse');
  assert.equal(countedSiteId(rowsOf(store), added), '');
});

// ---- The hosted path ---------------------------------------------------------------------------------------------
//
// The hosted profile delivers rows projected to its fields: a storehouse's main project (warehouses.siteId) is not one of
// them, and an account limited to one main project receives only that main project's records. The isometric summaries,
// the bootstrap the browser computes from (Materials panel, MTO dashboard, execution board, Reserve / Start checks) and
// the Materials list must still count the old stock of each isometric's own main project. Figures checked by hand.

const PASSWORD = 'Legacy-Stock-Password';
const RW = 'Read & write', NONE = 'No access', ADMIN = 'Administration';
type Boot = { rows: Record<string, Row[]>; isoSummaries?: Record<string, { materialStatus: { percent: number | null } }> };

/** The old workspace after the hosted preparation, served with the hosted profile over HTTP (MTO Pilot). */
async function hosted(t: { after: (fn: () => Promise<void> | void) => void }, options: { crossClaims?: boolean; orders?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-legacy-stock-'));
  const store = oldWorkspace(t, options); prepare(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, method = 'GET', data?: unknown) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const action = async (key: string, data: Record<string, unknown>) => { const response = await request(`/actions/${key}`, 'POST', data); return { status: response.status, body: await response.json() as Record<string, unknown> }; };
    const boot = async () => { const response = await request('/bootstrap'); assert.equal(response.status, 200); return await response.json() as Boot; };
    return { request, action, boot };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', 'POST', { name: 'Legacy admin', email: 'legacy-admin@example.test', password: PASSWORD })).status, 201);
  const writer = store.create('profiles', { name: 'MTO writer', toolsPermission: NONE, settingsPermission: NONE, generalPermission: RW, materialsPermission: ADMIN, weldingPermission: RW }).id;
  /** An account limited in MTO Pilot to one main project, signed in. */
  const limited = async (name: string, siteId: string) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, profileId: writer, mtoSiteScope: SITE_SCOPE_SPECIFIC });
    store.create(USER_SITES, { userId: user.id, pilot: 'mto', siteId }, SYSTEM);
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const as = client();
    assert.equal((await as.request('/auth/login', 'POST', { email: user.email, password: PASSWORD })).status, 200);
    return as;
  };
  return { store, admin, limited };
}
const percents = (rows: Record<string, Row[]>) => Object.fromEntries([...isoStatuses(rows)].map(([id, status]) => [id, status.percent]));
const lineInv = (rows: Record<string, Row[]>, isoId: string, materialId: string) => {
  const requirement = rows.iso_materials.find(row => row.isoId === isoId && row.materialId === materialId)!;
  return materialLineStatuses(rows, isoId).get(requirement.id)?.inventory;
};
const listInv = async (as: { request: (path: string) => Promise<Response> }, isoId: string) => (await (await as.request(`/mto/materials-list?isoId=${isoId}`)).json() as { rows: { values: { materialNo: string; inventory: number } }[] }).rows.map(row => [row.values.materialNo, row.values.inventory]);
const sorted = <T>(entries: Iterable<T>) => [...entries].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('hosted: the bootstrap, the isometric summaries, the Materials panel and the Materials list count the old stock of the isometric\'s own main project', async t => {
  const f = await hosted(t);
  const before = snapshot(f.store);
  const data = await f.admin.boot();
  const rows = data.rows;
  // The hosted projection drops the storehouse's main project …
  assert.ok(rows.warehouses.length && rows.warehouses.every(row => !Object.hasOwn(row, 'siteId')));
  // … and the server attaches what it derives from every stored row, to old rows only.
  const byId = new Map(rows.stock.map(row => [row.id, row]));
  assert.deepEqual(['old-n-1a', 'old-n-1b', 'old-r-1', 'old-y-5'].map(id => [byId.get(id)!.legacySiteId, byId.get(id)!.legacyClaimed]), [[NORTH, 0], [NORTH, 3], [RIVER, 0], ['', 0]]);
  assert.ok(rows.stock.filter(row => row.locationKind).every(row => !Object.hasOwn(row, 'legacySiteId') && !Object.hasOwn(row, 'legacyClaimed')));

  // Isometric summaries (header and list): iso-3 6 of 12 → 50 %; iso-5 6 of 12 → 50 %; iso-9 12 of 12 → 100 % (see the first test).
  assert.deepEqual(['iso-3', 'iso-5', 'iso-9'].map(id => data.isoSummaries![id].materialStatus.percent), [50, 50, 100]);
  // The browser's own computations from the bootstrap give the figures of the full stored rows: Material status of every
  // isometric (header, Materials panel, execution board), free stock (Reserve, Start), Inv. and the MTO dashboard.
  const full = rowsOf(f.store);
  assert.deepEqual(percents(rows), percents(full));
  assert.deepEqual(sorted(freePool(rows)), sorted(freePool(full)));
  assert.deepEqual(freePool(rows).get(poolKey(NORTH, 'catalog:material-1')), { stock: 15, reserved: 0, claimed: 3, free: 12 });
  assert.deepEqual(freePool(rows).get(poolKey(RIVER, 'catalog:material-5')), { stock: 6, reserved: 0, claimed: 0, free: 6 });
  assert.equal(freePool(rows).get(poolKey(NORTH, 'catalog:material-5'))?.stock, 40);
  assert.deepEqual([lineInv(rows, 'iso-3', 'material-3'), lineInv(rows, 'iso-5', 'material-5'), lineInv(rows, 'iso-9', 'material-1')], [6, 6, 12]);
  assert.deepEqual(['iso-3', 'iso-5', 'iso-9'].map(id => materialStatus(rows.isometrics.find(iso => iso.id === id)!, rows).percent), [50, 50, 100]);
  const figures = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === 'material' ? undefined : item));
  assert.deepEqual(figures(mtoDashboard(rows, { today: day })), figures(mtoDashboard(full, { today: day })));
  const board = (source: Record<string, Row[]>) => source.operation_phases.flatMap(phase => executionBoard(source, { phaseId: phase.id, from: 0, to: 100 }).map(row => [phase.id, row.iso.id, row.percent]));
  assert.ok(board(full).some(([, isoId, value]) => isoId === 'iso-9' && value === 100), 'iso-9 is on the board at 100 %');
  assert.deepEqual(board(rows), board(full));
  // The Materials list route: Inv. 6 (iso-3, CS-F150), 6 (iso-5, SS-T114), 12 (iso-9, CS-P060).
  assert.deepEqual([await listInv(f.admin, 'iso-3'), await listInv(f.admin, 'iso-5'), await listInv(f.admin, 'iso-9')], [[['CS-F150', 6]], [['SS-T114', 6]], [['CS-P060', 12]]]);
  // Reading changes nothing stored.
  assert.deepEqual(snapshot(f.store), before);
});

test('hosted: Reserve and Start take the old stock of the isometric\'s own main project; the derived values cannot be written', async t => {
  const f = await hosted(t);
  // Reserve iso-3: 12 needed, north holds 6 of material-3 (river's 50 do not count) → 6 reserved for site-north.
  const reserved = await f.admin.action('reserve-iso', { isoId: 'iso-3', date: day });
  assert.ok(reserved.status < 300, JSON.stringify(reserved.body));
  assert.deepEqual(f.store.list('reservations').filter(row => row.isoId === 'iso-3' && row.status === 'Reserved').map(row => [row.siteId, row.quantity]), [[NORTH, 6]]);
  let rows = (await f.admin.boot()).rows;
  assert.deepEqual(freePool(rows).get(poolKey(NORTH, 'catalog:material-3')), { stock: 6, reserved: 6, claimed: 0, free: 0 });
  assert.deepEqual(freePool(rows).get(poolKey(RIVER, 'catalog:material-3')), { stock: 50, reserved: 0, claimed: 0, free: 50 });
  // Start iso-9 (100 %): H-1001 gives 10, H-1002 2 of its 5 (3 stay for PICK-OLD-1); river's 20 stay.
  const started = await f.admin.action('start-iso', { isoId: 'iso-9', date: day });
  assert.ok(started.status < 300, JSON.stringify(started.body));
  assert.deepEqual([quantity(f.store, 'old-n-1a'), quantity(f.store, 'old-n-1b'), quantity(f.store, 'old-r-1')], [0, 3, 20]);
  rows = (await f.admin.boot()).rows;
  assert.deepEqual(freePool(rows).get(poolKey(NORTH, 'catalog:material-1')), { stock: 3, reserved: 0, claimed: 3, free: 0 });
  assert.equal(percents(rows)['iso-9'], 100);
  // Start iso-5 is refused: 50 %, river's 6 of 12 only; north's 40 never count for it.
  const refused = await f.admin.action('start-iso', { isoId: 'iso-5', date: day });
  assert.equal(refused.status, 409); assert.match(JSON.stringify(refused.body), /at 50 %/);
  // A request cannot write the derived values: they are no field of the hosted profile, and the store keeps none.
  const row = f.store.get('stock', 'old-r-1');
  assert.ok([404, 405].includes((await f.admin.request('/records/stock/old-r-1', 'PUT', { legacySiteId: NORTH, _version: row._version })).status));
  for (const extra of [{ legacySiteId: NORTH }, { legacyClaimed: 0 }]) assert.equal((await f.admin.action('stock-correct', { stockId: 'old-r-1', reason: 'Other', reasonText: 'Test', ...extra })).status, 404);
  assert.deepEqual(f.store.get('stock', 'old-r-1'), row);
  // The same body without them is accepted, and the stored row still carries neither.
  assert.ok((await f.admin.action('stock-correct', { stockId: 'old-r-1', reason: 'Other', reasonText: 'Test' })).status < 300);
  assert.ok(['legacySiteId', 'legacyClaimed'].every(name => !Object.hasOwn(f.store.get('stock', 'old-r-1'), name)));
});

test('hosted: an account limited to Riverside never receives North\'s old stock, and its isometrics do not count it', async t => {
  const f = await hosted(t);
  const river = await f.limited('River preparator', RIVER);
  const data = await river.boot();
  const rows = data.rows;
  // Only river's old rows (and the yard's, which belong to no main project); each names its own main project only.
  assert.deepEqual(rows.stock.filter(row => !row.locationKind).map(row => [row.id, row.legacySiteId]).sort(), [['old-r-1', RIVER], ['old-r-3', RIVER], ['old-r-5', RIVER], ['old-y-5', '']]);
  assert.ok(rows.stock.every(row => row.legacySiteId !== NORTH && countedSiteId(rows, row) !== NORTH));
  assert.ok([...freePool(rows).keys()].every(key => key.startsWith(`${RIVER}|`)), 'no pool of site-north');
  // The derivation and the access per project site agree: an old row is filed under exactly the main project it counts for.
  const scope = new SiteScope(f.store, 'mto', new Set()), full = rowsOf(f.store);
  for (const stock of full.stock.filter(row => !row.locationKind)) assert.equal(scope.siteOf('stock', stock), legacyInventorySiteId(full, stock), stock.id);
  // Its isometrics: iso-5 6 of 12 → 50 % (north's 40 and the yard's 100 do not count); no summary of a north isometric.
  assert.deepEqual(Object.keys(data.isoSummaries!).sort(), ['iso-4', 'iso-5', 'iso-6']);
  assert.equal(data.isoSummaries!['iso-5'].materialStatus.percent, 50);
  assert.equal(percents(rows)['iso-5'], 50); assert.equal(lineInv(rows, 'iso-5', 'material-5'), 6);
  assert.deepEqual(await listInv(river, 'iso-5'), [['SS-T114', 6]]);
  // Reserve: iso-5 gets river's 6; a north isometric is out of reach.
  assert.equal((await river.action('reserve-iso', { isoId: 'iso-3', date: day })).status, 403);
  const reserved = await river.action('reserve-iso', { isoId: 'iso-5', date: day });
  assert.ok(reserved.status < 300, JSON.stringify(reserved.body));
  assert.deepEqual(f.store.list('reservations').filter(row => row.isoId === 'iso-5').map(row => [row.siteId, row.quantity]), [[RIVER, 6]]);
  // A North-limited account gets north's figures: iso-3 50 %, iso-9 100 %, never river's rows.
  const north = await (await f.limited('North preparator', NORTH)).boot();
  assert.ok(north.rows.stock.every(row => row.legacySiteId !== RIVER));
  assert.deepEqual(['iso-3', 'iso-9'].map(id => north.isoSummaries![id].materialStatus.percent), [50, 100]);
  assert.deepEqual(['iso-3', 'iso-9'].map(id => percents(north.rows)[id]), [50, 100]);
});

test('hosted: untaken old pick lists that take from the other main project\'s old rows read, count and are taken under the same derivation', async t => {
  const f = await hosted(t, { crossClaims: true });
  const full = rowsOf(f.store);
  // PICK-OLD-2 (iso-3, north) claims 4 of river's old-r-3; PICK-OLD-3 (iso-5, river) claims 5 of north's old-n-5.
  // River material-3: 50 − 4 = 46 free; north material-5: 40 − 5 = 35 free.
  assert.deepEqual(freePool(full).get(poolKey(RIVER, 'catalog:material-3')), { stock: 50, reserved: 0, claimed: 4, free: 46 });
  assert.deepEqual(freePool(full).get(poolKey(NORTH, 'catalog:material-5')), { stock: 40, reserved: 0, claimed: 5, free: 35 });
  // An isometric's own untaken pick list covers it: iso-3 = 4 claimed + north's 6 = 10 of 12 → 83 %; iso-5 = 5 + river's 6 = 11 of 12 → 91 %.
  assert.deepEqual([percent(f.store, 'iso-3'), percent(f.store, 'iso-5')], [83, 91]);
  const admin = await f.admin.boot();
  assert.deepEqual(percents(admin.rows), percents(full));
  assert.deepEqual(sorted(freePool(admin.rows)), sorted(freePool(full)));
  // Riverside receives PICK-OLD-3 (its isometric) but not PICK-OLD-2; old-r-3 itself carries the 4 claimed of it.
  const river = await f.limited('River preparator', RIVER);
  const riverData = await river.boot();
  assert.deepEqual(riverData.rows.picklists.filter(row => row.taken === false).map(row => row.number).sort(), ['PICK-OLD-3']);
  assert.equal(riverData.rows.stock.find(row => row.id === 'old-r-3')!.legacyClaimed, 4);
  assert.deepEqual(freePool(riverData.rows).get(poolKey(RIVER, 'catalog:material-3')), { stock: 50, reserved: 0, claimed: 4, free: 46 });
  assert.equal(percents(riverData.rows)['iso-5'], 91); assert.equal(Math.floor(riverData.isoSummaries!['iso-5'].materialStatus.percent!), 91);
  // North receives PICK-OLD-2 and not old-r-3: iso-3 still reads 83 %.
  const north = await f.limited('North preparator', NORTH);
  const northData = await north.boot();
  assert.ok(northData.rows.stock.every(row => row.id !== 'old-r-3'));
  assert.equal(percents(northData.rows)['iso-3'], 83); assert.equal(Math.floor(northData.isoSummaries!['iso-3'].materialStatus.percent!), 83);
  // Taking PICK-OLD-2 moves river's stock: the north-limited account is refused and nothing changes; an account that reaches both takes it.
  const before = snapshot(f.store);
  assert.equal((await north.action('take-picklist', { reportNo: 'PICK-OLD-2', date: day })).status, 403);
  assert.deepEqual(snapshot(f.store), before);
  const totals = conservedTotals(rowsOf(f.store));
  for (const reportNo of ['PICK-OLD-2', 'PICK-OLD-3']) { const taken = await f.admin.action('take-picklist', { reportNo, date: day }); assert.ok(taken.status < 300, JSON.stringify(taken.body)); }
  // Each left the line it named (old-r-3 50 → 46, old-n-5 40 → 35) and was issued to its own isometric (Picked 4 and 5).
  assert.deepEqual([quantity(f.store, 'old-r-3'), quantity(f.store, 'old-n-5')], [46, 35]);
  assert.deepEqual(f.store.list('movements').filter(move => move.type === 'Issue' && ['iso-3', 'iso-5'].includes(String(move.isoId))).map(move => [move.isoId, move.warehouseId, move.quantity]).sort(), [['iso-3', 'warehouse-field', -4], ['iso-5', 'warehouse-main', -5]]);
  const after = rowsOf(f.store);
  assert.deepEqual([requirementExecution(after, { isoId: 'iso-3' })[0].picked, requirementExecution(after, { isoId: 'iso-5' })[0].picked], [4, 5]);
  // Quantities are conserved: what left the stock (9) is exactly what was issued (4 + 5).
  const remaining = conservedTotals(after);
  assert.equal(Object.entries(totals).reduce((sum, [key, value]) => sum + value - (remaining[key] ?? 0), 0), 9);
  // The free stock did not change (the claims became issues); the isometrics keep their figures.
  assert.deepEqual(freePool(after).get(poolKey(RIVER, 'catalog:material-3')), { stock: 46, reserved: 0, claimed: 0, free: 46 });
  assert.deepEqual(freePool(after).get(poolKey(NORTH, 'catalog:material-5')), { stock: 35, reserved: 0, claimed: 0, free: 35 });
  assert.deepEqual([percent(f.store, 'iso-3'), percent(f.store, 'iso-5')], [83, 91]);
});

test('hosted: an open transfer order of the old model reads its source, completes from the old row and reverses; another one cancels', async t => {
  const f = await hosted(t, { orders: true });
  const data = await f.admin.boot();
  const order = data.rows.transfer_orders.find(row => row.number === 'TO-OLD-1')!;
  // The source is the inventory of the main project its old row counts for, not "—".
  assert.deepEqual(orderPlaces(data.rows, order), { from: 'Inventory · North fabrication yard', to: 'Riverside installation' });
  assert.equal(reservedOnOpenOrders(rowsOf(f.store), f.store.get('stock', 'old-n-3')), 2);
  // Riverside reads the order (its target) but does not act on north's material.
  const river = await f.limited('River preparator', RIVER);
  assert.ok((await river.boot()).rows.transfer_orders.some(row => row.number === 'TO-OLD-1'));
  assert.equal((await river.action('transfer-order-assign', { orderId: 'to-old-1' })).status, 403);

  const totals = conservedTotals(rowsOf(f.store));
  for (const [key, body] of [['transfer-order-assign', { orderId: 'to-old-1' }], ['transfer-order-pick', { orderId: 'to-old-1', items: [{ itemId: 'to-old-1-item', qtyPicked: 2, lineStatus: 'Picked' }] }], ['transfer-order-complete', { orderId: 'to-old-1', date: day }]] as const) {
    const result = await f.admin.action(key, body); assert.ok(result.status < 300, `${key} ${JSON.stringify(result.body)}`);
  }
  // 2 of material-3 left old-n-3 (6 → 4, still an old row counted for north) into river's inventory.
  assert.equal(quantity(f.store, 'old-n-3'), 4); assert.ok(!f.store.get('stock', 'old-n-3').locationKind);
  assert.deepEqual(f.store.list('stock').filter(row => row.locationKind === 'site' && row.siteId === RIVER && row.materialId === 'material-3').map(row => [row.chargeNo, row.quantity]), [['H-1001', 2]]);
  assert.deepEqual(f.store.list('movements').filter(move => move.transferOrder === 'TO-OLD-1').map(move => [move.type, move.warehouseId, move.siteId, move.quantity]).sort(), [['Transfer in', '', RIVER, 2], ['Transfer out', 'warehouse-main', NORTH, -2]]);
  assert.equal(f.store.get('transfer_orders', 'to-old-1').status, 'Completed');
  assert.deepEqual(conservedTotals(rowsOf(f.store)), totals);
  // north 6 − 2 = 4 (iso-3: 4 of 12 → 33 %), river 50 + 2 = 52, in the hosted bootstrap too.
  const rows = (await f.admin.boot()).rows;
  assert.deepEqual([freePool(rows).get(poolKey(NORTH, 'catalog:material-3'))?.stock, freePool(rows).get(poolKey(RIVER, 'catalog:material-3'))?.stock], [4, 52]);
  assert.equal(percents(rows)['iso-3'], 33);
  // Reverse: the 2 go back to old-n-3, which stays an old row of north.
  const reversed = await f.admin.action('transfer-order-reverse', { orderId: 'to-old-1', date: day });
  assert.ok(reversed.status < 300, JSON.stringify(reversed.body));
  assert.equal(quantity(f.store, 'old-n-3'), 6); assert.ok(!f.store.get('stock', 'old-n-3').locationKind);
  assert.equal(percent(f.store, 'iso-3'), 50);
  assert.deepEqual(conservedTotals(rowsOf(f.store)), totals);

  // TO-OLD-2 is cancelled: nothing moves, old-n-1a is no longer held by it.
  const stock = JSON.stringify(f.store.list('stock'));
  const cancelled = await f.admin.action('transfer-order-cancel', { orderId: 'to-old-2', reason: 'Planned before the upgrade' });
  assert.ok(cancelled.status < 300, JSON.stringify(cancelled.body));
  assert.equal(f.store.get('transfer_orders', 'to-old-2').status, 'Cancelled');
  assert.equal(JSON.stringify(f.store.list('stock')), stock);
  assert.equal(reservedOnOpenOrders(rowsOf(f.store), f.store.get('stock', 'old-n-1a')), 0);
});
