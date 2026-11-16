import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, pageAvailable, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { PILOTS, pilotItemPath } from '../shared/pilots.ts';
import { planHostedSchema } from '../server/hosted-schema.ts';
import { isoStatuses, materialStatus, operationPhaseGroup, percentBand, pickListReports, planReserve, planStart, requestArchive, spoolLocation, spoolRows, startedReports } from '../shared/mto-logistics.ts';
import type { Row } from '../shared/types.ts';

const actor = { id: 'mto-test', name: 'MTO test operator' };
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
const stockOf = (store: Store, materialId: string) => store.list('stock').filter(row => row.materialId === materialId).reduce((sum, row) => sum + Number(row.quantity), 0);
function sample(t: { after: (fn: () => void) => void }) { const store = new Store(':memory:'); seed(store); pinFlanges(store); seedMtoLogistics(store, SYSTEM); t.after(() => store.close()); return store; }
/** The base sample receives twelve units of one of two materials by chance of row order: pin the class 150 flanges (material-3) to the three in stock. */
function pinFlanges(store: Store) { for (const row of store.list('stock').filter(row => row.materialId === 'material-3' && row.chargeNo !== 'H-1042')) store.update('stock', row.id, { quantity: 0 }, row._version, actor); }
/** The three flanges lie in the Main warehouse: hand them to the North fabrication yard, whose isometrics count and pick from its Material inventory. */
function flangesToNorth(store: Store) { const line = store.list('stock').find(row => row.locationKind !== 'site' && row.materialId === 'material-3' && row.warehouseId === 'warehouse-main')!; runAction(store, 'stock-to-project', { siteId: 'site-north', items: [{ stockId: line.id, quantity: 3 }], date: '2026-10-19' }, actor); }
const bare = (t: { after: (fn: () => void) => void }) => { const store = new Store(':memory:'); seed(store); pinFlanges(store); flangesToNorth(store); t.after(() => store.close()); return store; };
const PAYLOADS: Record<string, Record<string, unknown>> = {
  'reserve-iso': { isoId: 'iso-3', date: '2026-10-27' }, 'start-iso': { isoId: 'iso-3', date: '2026-10-27' }, 'take-picklist': { reportNo: 'PL-2026-0002', date: '2026-10-27' },
  service: { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-10-27' }, 'move-spools': { spoolIds: ['spool-1'], laydownId: 'laydown-a', date: '2026-10-27' },
  'move-materials': { requirementIds: ['requirement-1'], laydownId: 'mlaydown-rack-1', date: '2026-10-27' },
};

test('material status is the covered share of the requirement, rounded down, and empty without requirements', () => {
  assert.equal(materialStatus([]), null);
  assert.equal(materialStatus([{ required: 0, picked: 0, available: 5 }]), null);
  assert.equal(materialStatus([{ required: 10, picked: 4, available: 3 }]), 70);
  assert.equal(materialStatus([{ required: 10, picked: 8, available: 5 }]), 100);
  assert.equal(materialStatus([{ required: 3, picked: 0, available: 2 }]), 66);
  assert.equal(materialStatus([{ required: 200, picked: 199, available: 0 }]), 99);
  assert.equal(materialStatus([{ required: 10, picked: 10, available: 0 }, { required: 10, picked: 0, available: 0 }]), 50);
  assert.deepEqual([100, 99, 80, 79, 70, 69, 0, null].map(percentBand), ['100 %', '80–99 %', '80–99 %', '70–79 %', '70–79 %', '< 70 %', '< 70 %', '']);
  assert.deepEqual(['Shop', 'Field', 'Hydrotest field', 'Support Field', 'Valves', 'Support Shop', 'Revision mat', ''].map(operationPhaseGroup), ['Shop', 'Field', 'Field', 'Field', 'Valves', 'Shop', '', '']);
});

test('the local sample spreads isometrics over every percentage band and the type filter narrows the lines', t => {
  const store = sample(t); const rows = rowsOf(store); const statuses = isoStatuses(rows);
  const bands = new Set([...statuses.values()].map(status => percentBand(status.percent)));
  for (const band of ['100 %', '80–99 %', '70–79 %', '< 70 %']) assert.ok(bands.has(band as never), band);
  assert.equal(statuses.get('iso-1')!.percent, 100);
  const valves = isoStatuses(rows, { group: 'Valves' });
  assert.deepEqual([...valves.keys()], ['iso-1']); assert.equal(valves.get('iso-1')!.lines.length, 1);
  assert.ok([...isoStatuses(rows, { group: 'Field' }).keys()].includes('iso-6'));
});

test('reserve sets the uncovered quantity aside from free stock so another isometric cannot take it', t => {
  const store = bare(t);
  // Three class 150 flanges are in stock; iso-3 needs twelve, iso-9 gets its own requirement of two.
  store.create('iso_materials', { isoId: 'iso-9', materialId: 'material-3', quantity: 2, phaseId: 'phase-1' }, actor, 'req-flange-9');
  const before = isoStatuses(rowsOf(store));
  assert.equal(before.get('iso-3')!.lines[0].available, 3); assert.equal(before.get('iso-9')!.lines.find(line => line.requirement.id === 'req-flange-9')!.available, 2);
  const result = runAction(store, 'reserve-iso', { isoId: 'iso-9', date: '2026-10-22' }, actor);
  assert.ok(result.records!.every(row => row.status === 'Reserved'));
  assert.equal(store.list('reservations').find(row => row.requirementId === 'req-flange-9')!.quantity, 2);
  const after = isoStatuses(rowsOf(store));
  assert.equal(after.get('iso-3')!.lines[0].available, 1, 'the other isometric only sees what is left');
  assert.equal(after.get('iso-9')!.lines.find(line => line.requirement.id === 'req-flange-9')!.available, 2, 'the owner keeps its reservation');
  assert.throws(() => runAction(store, 'reserve-iso', { isoId: 'iso-9', date: '2026-10-22' }, actor), /already picked|No free stock/);
  // iso-3 can reserve the rest, and nothing more.
  runAction(store, 'reserve-iso', { isoId: 'iso-3', date: '2026-10-23' }, actor);
  assert.equal(store.list('reservations').find(row => row.isoId === 'iso-3')!.quantity, 1);
  assert.throws(() => runAction(store, 'reserve-iso', { isoId: 'iso-3', date: '2026-10-23' }, actor), /No free stock/);
  // Releasing returns the quantity to the free pool.
  const reservation = store.list('reservations').find(row => row.requirementId === 'req-flange-9')!;
  runAction(store, 'release-reservation', { reservationIds: [reservation.id] }, actor);
  assert.equal(store.get('reservations', reservation.id).status, 'Released');
  assert.throws(() => runAction(store, 'release-reservation', { reservationIds: [reservation.id] }, actor), /already used or released/);
  assert.equal(isoStatuses(rowsOf(store)).get('iso-3')!.lines[0].available, 3, 'its own reserved flange plus the two released ones');
  assert.equal(planReserve(rowsOf(store), 'iso-9').length > 0, true);
  assert.throws(() => runAction(store, 'reserve-iso', { isoId: 'missing-iso' }, actor), /could not be found/);
});

test('start creates one pick list for the available quantities, claims stock and marks the isometric as started', t => {
  const store = bare(t); const flange = stockOf(store, 'material-3');
  assert.deepEqual(startedReports(rowsOf(store), 'iso-3'), []);
  const plan = planStart(rowsOf(store), 'iso-3'); assert.equal(plan[0].quantity, 3);
  const result = runAction(store, 'start-iso', { isoId: 'iso-3', date: '2026-10-24' }, actor);
  assert.equal(result.records!.length, 1);
  const [line] = result.records!;
  assert.equal(line.quantity, 3); assert.equal(line.taken, false); assert.equal(line.warehouseId, '', 'taken from the project site inventory'); assert.equal(line.siteId, 'site-north'); assert.match(String(line.reportNo), /^\d{5}$/, 'five-digit Pick List No.');
  assert.equal(stockOf(store, 'material-3'), flange, 'starting does not issue stock yet');
  assert.deepEqual(startedReports(rowsOf(store), 'iso-3'), [line.reportNo]);
  const status = isoStatuses(rowsOf(store)).get('iso-3')!;
  assert.equal(status.lines[0].claimed, 3); assert.equal(status.lines[0].available, 0); assert.equal(status.percent, 25);
  // The claimed flanges are gone for everyone else.
  store.create('iso_materials', { isoId: 'iso-9', materialId: 'material-3', quantity: 2, phaseId: 'phase-1' }, actor, 'req-flange-9');
  assert.equal(isoStatuses(rowsOf(store)).get('iso-9')!.lines.find(entry => entry.requirement.id === 'req-flange-9')!.available, 0);
  // Nothing more can be started until stock arrives.
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-3', date: '2026-10-24' }, actor), /None of the missing materials is in stock/);
});

test('start uses up the isometric’s own reservation and keeps what it does not use', t => {
  const store = bare(t);
  runAction(store, 'reserve-iso', { isoId: 'iso-4', date: '2026-10-20' }, actor);
  const reserved = Number(store.list('reservations').find(row => row.isoId === 'iso-4')!.quantity);
  assert.equal(reserved, 4);
  runAction(store, 'start-iso', { isoId: 'iso-4', date: '2026-10-21' }, actor);
  const reservation = store.list('reservations').find(row => row.isoId === 'iso-4')!;
  assert.equal(reservation.status, 'Used');
  // A pick list that cannot start (stock too low for the reserved part) leaves nothing half-written.
  const picks = store.list('picklists').length;
  assert.throws(() => runAction(store, 'start-iso', { isoId: 'iso-4', date: '2026-10-21' }, actor), /None of the missing|already picked/);
  assert.equal(store.list('picklists').length, picks);
});

test('marking a pick list as taken issues stock once and never below zero', t => {
  const store = bare(t);
  const started = runAction(store, 'start-iso', { isoId: 'iso-2', date: '2026-10-22' }, actor);
  const reportNo = String(started.records![0].reportNo); const elbows = stockOf(store, 'material-2');
  assert.throws(() => runAction(store, 'take-picklist', { reportNo: 'PL-NOPE', date: '2026-10-23' }, actor), /could not be found/);
  assert.throws(() => runAction(store, 'take-picklist', { reportNo, date: '2026-10-21' }, actor), /before the pick list date/);
  assert.equal(stockOf(store, 'material-2'), elbows);
  runAction(store, 'take-picklist', { reportNo, date: '2026-10-23', note: 'Collected at the main warehouse' }, actor);
  assert.equal(stockOf(store, 'material-2'), elbows - 4);
  assert.ok(store.list('picklists').filter(row => row.reportNo === reportNo).every(row => row.taken === true && row.takenDate === '2026-10-23'));
  assert.ok(store.list('movements').some(row => row.type === 'Issue' && String(row.note).includes('Collected at the main warehouse')));
  assert.throws(() => runAction(store, 'take-picklist', { reportNo, date: '2026-10-23' }, actor), /already taken/);
  // Picked now counts the taken lines: the isometric's material status is unchanged.
  assert.equal(isoStatuses(rowsOf(store)).get('iso-2')!.lines[0].picked, 4);
  // Stock that disappears between Start and taking stops the whole pick list and changes nothing.
  const second = runAction(store, 'start-iso', { isoId: 'iso-5', date: '2026-10-24' }, actor);
  const tees = store.list('stock').filter(row => row.locationKind === 'site' && row.siteId === 'site-river' && row.materialId === 'material-5').reduce((sum, row) => sum + Number(row.quantity), 0);
  runAction(store, 'inventory-remove', { siteId: 'site-river', materialId: 'material-5', quantity: tees - 1, comment: 'Stock count correction' }, actor);
  const snapshot = JSON.stringify([store.list('stock'), store.list('picklists'), store.list('movements')]);
  assert.throws(() => runAction(store, 'take-picklist', { reportNo: String(second.records![0].reportNo), date: '2026-10-25' }, actor), /Insufficient stock/);
  assert.equal(JSON.stringify([store.list('stock'), store.list('picklists'), store.list('movements')]), snapshot);
});

test('pick lists issued directly count as taken and the archive groups lines per report with date and project filters', t => {
  const store = sample(t); const rows = rowsOf(store);
  const reports = pickListReports(rows);
  assert.ok(reports.some(report => report.reportNo.startsWith('PICK-') && report.taken), 'a line issued directly stands alone and is taken');
  assert.equal(reports.filter(report => /^\d{5}$/.test(report.reportNo)).length, 2);
  assert.deepEqual(reports.map(report => report.date), [...reports.map(report => report.date)].sort().reverse());
  const open = reports.find(report => !report.taken)!; assert.equal(open.lines.length, 2); assert.ok(open.lines.every(line => line.taken === false));
  assert.ok(pickListReports(rows, { from: '2026-10-25' }).every(report => report.date >= '2026-10-25'));
  assert.ok(pickListReports(rows, { to: '2026-10-19' }).every(report => report.date <= '2026-10-19'));
  assert.deepEqual(pickListReports(rows, { projectId: 'project-skid' }).map(report => report.isoId), ['iso-7']);
  assert.deepEqual(pickListReports(rows, { projectId: 'project-steam' }).map(report => report.isoId), ['iso-5']);
  assert.deepEqual(pickListReports(rows, { projectId: 'project-cooling' }).map(report => report.isoId), ['iso-1']);
});

test('spool locations show the service company, the laydown or Transport, and requests group by number in the archive', t => {
  const store = sample(t); const rows = rowsOf(store);
  assert.deepEqual(spoolLocation({ serviceCompanyId: 'c', laydownId: 'l' } as unknown as Row), { type: 'Service', id: 'c' });
  assert.deepEqual(spoolLocation({ laydownId: 'l' } as unknown as Row), { type: 'Laydown', id: 'l' });
  assert.deepEqual(spoolLocation({} as unknown as Row), { type: 'Transport', id: '' });
  const spools = spoolRows(rows);
  assert.equal(spools.find(entry => entry.spool.id === 'spool-2')!.location.type, 'Service');
  assert.equal(spools.find(entry => entry.spool.id === 'spool-3')!.location.id, 'laydown-c');
  assert.equal(spools.find(entry => entry.spool.id === 'spool-2')!.openRequest!.includeDrawings, true);
  assert.deepEqual(spoolRows(rows, { projectId: 'project-skid' }).map(entry => entry.iso.projectId), ['project-skid', 'project-skid', 'project-skid']);
  // One request for two spools is one archive line.
  const created = runAction(store, 'service', { spoolIds: ['spool-1', 'spool-5'], companyId: 'service-pwht', name: 'Batch 2', includeDrawings: false, date: '2026-10-27' }, actor);
  assert.equal(created.records!.length, 2); assert.ok(created.records!.every(row => row.includeDrawings === false));
  const archive = requestArchive(rowsOf(store));
  const batch = archive.find(request => request.name === 'Batch 2')!; assert.equal(batch.items.length, 2); assert.equal(batch.kind, 'Spool'); assert.equal(batch.status, 'Requested'); assert.equal(batch.openIds.length, 2);
  assert.ok(archive.some(request => request.kind === 'Material' && request.status === 'Requested'));
  assert.ok(archive.some(request => request.status === 'Completed' && request.completedAt === '2026-10-22'));
  assert.deepEqual(requestArchive(rowsOf(store), { from: '2026-10-27' }).map(request => request.name), ['Batch 2']);
  assert.deepEqual(archive.map(request => request.date), [...archive.map(request => request.date)].sort().reverse());
  // Completing the request without a destination leaves the spool in transport.
  runAction(store, 'complete-service', { requestIds: batch.openIds, date: '2026-10-28' }, actor);
  assert.equal(spoolRows(rowsOf(store)).find(entry => entry.spool.id === 'spool-1')!.location.type, 'Transport');
});

test('service companies need an address and the logistics resources carry the new fields', () => {
  assert.equal(RESOURCE_MAP.service_companies.fields.find(field => field.name === 'address')!.required, true);
  const store = new Store(':memory:'); try {
    assert.throws(() => store.create('service_companies', { name: 'No address' }, actor), (error: { fields?: Record<string, string> }) => error.fields?.address === 'Address is required.');
    assert.equal(store.create('service_companies', { name: 'Complete', address: '1 Dock Road', phone: '+31 10 555 0100', email: 'a@example.com' }, actor).address, '1 Dock Road');
    assert.throws(() => store.create('reservations', { isoId: 'x', requirementId: 'y', quantity: 1 }, actor), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.isoId));
  } finally { store.close(); }
  assert.ok(RESOURCE_MAP.picklists.fields.some(field => field.name === 'reportNo') && RESOURCE_MAP.picklists.fields.some(field => field.name === 'taken'));
  // The general hosted preparation (server/hosted-schema.ts) derives every table from RESOURCES: on an empty database it
  // creates reservations with its reference columns and its unique rule on requirementId.
  const plan = planHostedSchema({ tables: new Map(), columns: new Map(), foreignKeys: new Map(), indexes: new Map() });
  assert.ok(plan.tables.includes('reservations'), 'the hosted database prepares the new table');
  assert.ok(['isoId', 'requirementId', 'materialId', 'customMaterialId'].every(field => plan.columns.some(column => column.table === 'reservations' && column.field === field)));
  assert.ok(plan.indexes.some(index => index.table === 'reservations'));
});

// ---- Through HTTP: hosted profile, both pilots ------------------------------------------------------------------------

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-mto-logistics-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store); pinFlanges(store); seedMtoLogistics(store, SYSTEM);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'mto';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Pilot-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    const response = await request('/api/auth/login', 'POST', { email: user.email, password }); assert.equal(response.status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Pilot admin', email: 'pilot-admin@example.test', password })).status, 201) };
}
const FULL = { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' };

test('the hosted profile delivers the pages, resources and actions of this flow and the menu points at them', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const path of ['/mto/materials/iso-execution', '/mto/materials/service-spools', '/mto/materials/service-materials', '/mto/materials/picklists', '/mto/materials/service_requests', '/mto/materials/service_companies', '/mto/materials/laydowns', '/mto/materials/material_laydowns']) assert.ok(pageAvailable(hosted, path, RESOURCES), path);
  // Material inventory (/mto/materials/stock) is the stock flow's page, so stock is no longer data only.
  for (const path of ['/mto/materials/reservations', '/mto/materials/material_locations']) assert.equal(pageAvailable(hosted, path, RESOURCES), false, path);
  for (const key of ['reserve-iso', 'release-reservation', 'start-iso', 'take-picklist', 'service', 'complete-service', 'move-spools', 'move-materials', 'service-materials', 'complete-material-service']) assert.ok(hosted.actions[key], key);
  assert.deepEqual(hosted.actions.service.sort(), ['companyId', 'date', 'includeDrawings', 'name', 'note', 'spoolIds']);
  assert.ok(!hosted.navigation.includes('reservations'));
  const mto = PILOTS.find(pilot => pilot.key === 'mto')!; const labels = Object.fromEntries(mto.groups.flatMap(group => group.items).map(item => [item.label, pilotItemPath(item)]));
  assert.equal(labels['Isometric execution'], '/materials/iso-execution'); assert.equal(labels['Pick List archive'], '/materials/picklists'); assert.equal(labels['Service request'], '/materials/service-spools');
  assert.equal(labels['Service req. - Materials'], '/materials/service-materials'); assert.equal(labels['Request archive'], '/materials/service_requests');
  assert.equal(labels['Laydown areas'], '/materials/laydowns'); assert.equal(labels['Laydown materials'], '/materials/material_laydowns'); assert.equal(labels['Service companies'], '/materials/service_companies');
});

test('Reserve, Start and taking a pick list work through the API for MTO accounts and are refused elsewhere', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Work preparator', FULL);
  // Reads: only what the pages need.
  for (const key of ['picklists', 'reservations', 'stock', 'service_requests', 'service_companies', 'laydowns', 'material_laydowns', 'material_locations', 'spools']) assert.equal((await f.request(`/api/records/${key}`)).status, 200, key);
  const stock = await (await f.request('/api/records/stock')).json() as { rows?: Row[] } | Row[];
  const first = (Array.isArray(stock) ? stock : stock.rows || [])[0]; assert.ok(first); assert.ok(first.warehouseId || first.siteId, 'the storehouse of a line, or the project site of an inventory row, is delivered');
  // Weld Pilot: the pilot boundary refuses every record and action of this flow.
  f.usePilot('weld');
  for (const key of ['picklists', 'reservations', 'stock', 'service_requests', 'service_companies', 'laydowns']) assert.equal((await f.request(`/api/records/${key}`)).status, 403, key);
  for (const key of Object.keys(PAYLOADS)) assert.equal((await f.request(`/api/actions/${key}`, 'POST', PAYLOADS[key])).status, 403, key);
  f.usePilot('mto');
  // Undelivered fields are refused.
  assert.equal((await f.request('/api/actions/start-iso', 'POST', { isoId: 'iso-3', warehouseId: 'warehouse-main' })).status, 404);
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', services: 'Anything' })).status, 404);
  assert.equal((await f.request('/api/records/reservations', 'POST', { isoId: 'iso-3', requirementId: 'requirement-3', quantity: 1 })).status, 405);
  assert.equal((await f.request('/api/records/picklists', 'POST', { isoId: 'iso-3' })).status, 405);
  // Reserve, Start, take.
  const reserved = await f.request('/api/actions/reserve-iso', 'POST', { isoId: 'iso-8', date: '2026-10-27' }); assert.equal(reserved.status, 201);
  assert.ok(f.store.list('reservations').some(row => row.isoId === 'iso-8'));
  assert.equal((await f.request('/api/actions/reserve-iso', 'POST', { isoId: 'iso-8', date: '2026-10-27' })).status, 409);
  const started = await f.request('/api/actions/start-iso', 'POST', { isoId: 'iso-6', date: '2026-10-27' }); assert.equal(started.status, 201);
  const body = await started.json() as { records: Row[] }; const reportNo = String(body.records[0].reportNo); assert.equal(body.records[0].taken, false);
  const before = f.store.list('stock').reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal((await f.request('/api/actions/take-picklist', 'POST', { reportNo, date: '2026-10-27' })).status, 201);
  assert.ok(f.store.list('stock').reduce((sum, row) => sum + Number(row.quantity), 0) < before);
  assert.equal((await f.request('/api/actions/take-picklist', 'POST', { reportNo, date: '2026-10-27' })).status, 409);
  const archive = await (await f.request('/api/bootstrap')).json() as { rows: Record<string, Row[]> };
  assert.ok(archive.rows.picklists.some(row => row.reportNo === reportNo && row.taken === true));
  assert.ok(archive.rows.reservations.some(row => row.isoId === 'iso-8'));
});

test('read-only and partial permission profiles cannot reserve, start or take, and logistics keep their rules', async t => {
  const f = await hostedFixture(t); await f.setup();
  await f.signIn('Material viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'No access' });
  assert.equal((await f.request('/api/records/picklists')).status, 200);
  for (const key of Object.keys(PAYLOADS)) assert.equal((await f.request(`/api/actions/${key}`, 'POST', PAYLOADS[key])).status, 403, key);
  // Detailed permissions: pick list archive alone ("21") is view, export and print only.
  await f.signIn('Archive only', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '21': ['show', 'export', 'print'], '5': ['show'], '64': ['show'] }) });
  assert.equal((await f.request('/api/records/picklists')).status, 200);
  assert.equal((await f.request('/api/records/reservations')).status, 403);
  assert.equal((await f.request('/api/actions/take-picklist', 'POST', { reportNo: 'PL-2026-0002', date: '2026-10-27' })).status, 403);
  // ISO execution ("20") may reserve and start, but does not manage service requests.
  await f.signIn('Iso execution', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '20': ['show', 'insert'], '5': ['show'], '64': ['show'], '70': ['show'], '16': ['show'], '21': ['show'] }) });
  assert.equal((await f.request('/api/actions/reserve-iso', 'POST', { isoId: 'iso-6', date: '2026-10-27' })).status, 201);
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-10-27' })).status, 403);
  // Full MTO rights: the existing service rules still hold and the new drawings flag is stored.
  await f.signIn('Logistics', FULL);
  const service = await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', name: 'Hosted batch', includeDrawings: true, date: '2026-10-27' }); assert.equal(service.status, 201);
  assert.equal(f.store.list('service_requests').find(row => row.name === 'Hosted batch')!.includeDrawings, true);
  assert.equal((await f.request('/api/actions/service', 'POST', { spoolIds: ['spool-1'], companyId: 'service-pwht', date: '2026-10-27' })).status, 409, 'an open request blocks a second one');
  assert.equal((await f.request('/api/actions/move-spools', 'POST', { spoolIds: ['spool-1'], laydownId: 'laydown-a', date: '2026-10-27' })).status, 409, 'a spool at service cannot move');
  const open = f.store.list('service_requests').find(row => row.name === 'Hosted batch')!;
  assert.equal((await f.request('/api/actions/complete-service', 'POST', { requestIds: [open.id], laydownId: 'laydown-c', date: '2026-10-28' })).status, 201);
  assert.equal(f.store.get('spools', 'spool-1').laydownId, 'laydown-c');
  // Catalogs: Address is required, Name is unique.
  assert.equal((await f.request('/api/records/service_companies', 'POST', { name: 'No address' })).status, 422);
  assert.equal((await f.request('/api/records/service_companies', 'POST', { name: 'Harbour Coatings', address: '5 Quay Street', phone: '+31 10 555 0110' })).status, 201);
  assert.equal((await f.request('/api/records/service_companies', 'POST', { name: 'Harbour Coatings', address: '5 Quay Street' })).status, 409);
  assert.equal((await f.request('/api/records/laydowns', 'POST', { name: 'Laydown D — Hydrotest' })).status, 201);
  assert.equal((await f.request('/api/records/material_laydowns', 'POST', { name: 'Flange shelf' })).status, 201);
});
