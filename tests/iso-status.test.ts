import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { isoBlockers, isoInputErrors, isoProgress, isoQuality, isoBudgets, type IsoStatusInput } from '../shared/iso-status.ts';
import { LEGACY_PRIORITY, PRIORITY_OPTIONS, priorityLabel, priorityStored } from '../shared/priority.ts';
import type { Row } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data }) as Row;
const SITE = row('site', { weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10, fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60, ndtMeasurement: 'Inch-weighted' });
const weldTypes = [row('wt-shop', { location: 'Shop' }), row('wt-field', { location: 'Field' })];
const diameters = [row('d2', { sizeinch: 2 }), row('d4', { sizeinch: 4 }), row('d6', { sizeinch: 6 })];
/** A weld with everything the blockers require, so a test breaks only the field it is about. */
const weld = (id: string, data: Record<string, unknown> = {}) => row(id, { weldNo: id.toUpperCase(), isoId: 'iso', typeId: 'wt-shop', welder1Id: 'w1', wpsId: 'wps', date: '2026-10-05', lengthMode: 'Diameter', diameterId: 'd4', chargeNo1: 'H1', chargeNo2: 'H2', ndoReq: false, ...data });
const result = (weldId: string, outcome: string, date: string, extra: Record<string, unknown> = {}) => row(`${weldId}-${date}-${outcome}`, { weldId, type: 'NDT', result: outcome, date, ...extra });
type Setup = Omit<Partial<IsoStatusInput>, 'iso'> & { iso?: Record<string, unknown> };
const base = (data: Setup = {}): IsoStatusInput => ({ site: SITE, welds: [], weldTypes, diameters, results: [], releases: [], punch: [], ...data, iso: row('iso', { testSystemId: '', ...data.iso }) });
const close = (actual: number | null | undefined, expected: number) => assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-9, `${actual} !~ ${expected}`);

// A worked isometric. Shop welds: s1 4" welded, NDT accepted; s2 2" not welded, NDT open. Field welds: f1 6" welded, NDT rejected;
// f2 2" welded, no NDT; f3 6" not welded, NDT open. Test system with a Hydrotest release; paint Done, tracing Open, insulation N/A.
const worked = (extra: Setup = {}) => base({
  iso: { testSystemId: 'ts', paintState: 'Done', tracingState: 'Open', insulationState: 'N/A' },
  welds: [weld('s1', { diameterId: 'd4', ndoReq: true }), weld('s2', { diameterId: 'd2', welder1Id: '', ndoReq: true }), weld('f1', { typeId: 'wt-field', diameterId: 'd6', ndoReq: true }), weld('f2', { typeId: 'wt-field', diameterId: 'd2' }), weld('f3', { typeId: 'wt-field', diameterId: 'd6', welder1Id: '', ndoReq: true })],
  results: [result('s1', 'Accepted', '2026-10-06'), result('f1', 'Rejected', '2026-10-07')],
  releases: [row('r1', { isoId: 'iso', type: 'Hydrotest' })],
  ...extra,
});

test('progress follows the driver model: Shop 66.7 / Field 40 / Site 70 gives 52.5 and hydrotest is worth 3.2 points', () => {
  const progress = isoProgress(worked());
  assert.equal(progress.configured, true);
  const [shop, field, site] = progress.phases;
  // Shop: welds 4 of 6 inch, NDT 4 of 6 inch, pipe / supports / appendages without a budget are out of scope.
  assert.deepEqual(shop.drivers.filter(driver => driver.inScope).map(driver => driver.key), ['welds', 'ndt']);
  assert.equal(shop.percent, 66.7);
  // Field: welds 8 of 14 inch (weight 35 -> 20 points of 50), NDT: the only accepted-free weld set is rejected / open -> 0 of 12 inch.
  assert.deepEqual(field.drivers.filter(driver => driver.inScope).map(driver => driver.key), ['welds', 'ndt']);
  assert.equal(field.percent, 40);
  // Site: hydrotest released (40) + finish 1 of 2 (paint done, tracing open, insulation N/A drops out) -> (40 + 30) / 100.
  assert.equal(site.percent, 70);
  // 38 x 66.667 / 100 + 54 x 40 / 100 + 8 x 70 / 100 = 25.333 + 21.6 + 5.6 = 52.533
  assert.equal(progress.total, 52.5);
  close(site.drivers.find(driver => driver.key === 'hydrotest')!.earned, 3.2);
  close(site.drivers.find(driver => driver.key === 'paintTracing')!.earned, 2.4);
});

test('NDT driver counts accepted results only, per weld or inch-weighted, and a later accepted result replaces a rejection', () => {
  const rejectedFirst = worked({ results: [result('s1', 'Rejected', '2026-10-06'), result('f1', 'Rejected', '2026-10-07')] });
  assert.equal(isoProgress(rejectedFirst).phases[0].drivers.find(driver => driver.key === 'ndt')!.progress, 0, 'a rejected result is not done');
  const repaired = worked({ results: [result('s1', 'Rejected', '2026-10-06'), result('s1', 'Accepted', '2026-10-09'), result('f1', 'Rejected', '2026-10-07')] });
  close(isoProgress(repaired).phases[0].drivers.find(driver => driver.key === 'ndt')!.progress, 4 / 6);
  // Per weld: s1 accepted of two welds requiring NDT = 50 %, so Shop = (40 x 2/3 + 15 x 1/2) / 55.
  const perWeld = isoProgress(worked({ site: row('site-pw', { ...SITE, ndtMeasurement: 'Per weld' }) }));
  close(perWeld.phases[0].drivers.find(driver => driver.key === 'ndt')!.progress, 0.5);
  assert.equal(perWeld.phases[0].percent, 62.1);
});

test('a driver without scope drops out and the rest renormalise; quantity drivers need a budget', () => {
  // No NDT required in Shop: its NDT driver leaves, welds alone carry the phase.
  const noNdt = isoProgress(worked({ welds: worked().welds.map(item => item.id === 's1' || item.id === 's2' ? { ...item, ndoReq: false } : item) }));
  assert.deepEqual(noNdt.phases[0].drivers.filter(driver => driver.inScope).map(driver => driver.key), ['welds']);
  assert.equal(noNdt.phases[0].percent, 66.7);
  // A pipe budget of 100 m with 50 m entered adds a driver at 50 %: (40 x 2/3 + 15 x 2/3 + 25 x 1/2) / 80 = 61.46 -> 61.5.
  const withBudget = isoProgress(worked({ iso: { testSystemId: 'ts', shopPipeM: 50 }, budgets: { shop: { materialPipe: 100 } } }));
  assert.equal(withBudget.phases[0].percent, 61.5);
  // Entered quantity above the budget is capped at 100 %; a zero budget is no budget.
  assert.equal(isoProgress(worked({ iso: { testSystemId: 'ts', shopPipeM: 500 }, budgets: { shop: { materialPipe: 100 } } })).phases[0].drivers.find(driver => driver.key === 'materialPipe')!.progress, 1);
  assert.equal(isoProgress(worked({ budgets: { shop: { materialPipe: 0 } } })).phases[0].drivers.find(driver => driver.key === 'materialPipe')!.inScope, false);
  // Punch is out of scope until punch data supplies it, then counts in Field: (35 x 8/14 + 15 x 0 + 10 x 1) / 60 = 50 %.
  assert.equal(isoProgress(worked()).phases[1].drivers.find(driver => driver.key === 'punch')!.inScope, false);
  assert.equal(isoProgress(worked({ punchProgress: 1 })).phases[1].percent, 50);
  // A phase with nothing in scope drops out of the isometric total as well: no field welds, no hydrotest, finish open -> Shop and Site only.
  const shopOnly = isoProgress(worked({ welds: worked().welds.filter(item => item.typeId === 'wt-shop') }));
  assert.equal(shopOnly.phases[1].percent, null);
  // Shop 66.67 % and Site 70 % share the total by their weights: (38 x 66.667 + 8 x 70) / 46 = 67.2.
  assert.equal(shopOnly.total, 67.2);
});

test('hydrotest needs a test system; finish items that are all N/A leave the finish driver; missing finish states count as open', () => {
  const noSystem = isoProgress(worked({ iso: { paintState: 'Done', tracingState: 'Open', insulationState: 'N/A' } }));
  assert.equal(noSystem.phases[2].drivers.find(driver => driver.key === 'hydrotest')!.inScope, false);
  assert.equal(noSystem.phases[2].percent, 50, 'only the finish driver remains: paint done, tracing open');
  const allNa = isoProgress(worked({ iso: { testSystemId: 'ts', paintState: 'N/A', tracingState: 'N/A', insulationState: 'N/A' } }));
  assert.equal(allNa.phases[2].percent, 100, 'hydrotest alone carries the phase: released');
  const noRelease = isoProgress(worked({ iso: { testSystemId: 'ts' }, releases: [] }));
  assert.equal(noRelease.phases[2].percent, 0, 'states missing on old records read as Open');
  // Unreadable releases: hydrotest cannot be judged, so it is out of scope instead of 0 %.
  assert.equal(isoProgress(worked({ releases: null })).phases[2].drivers.find(driver => driver.key === 'hydrotest')!.inScope, false);
});

test('welds without an inch diameter are left out of the inch-weighted drivers; archived welds never count', () => {
  const mixed = base({ welds: [weld('a', { diameterId: 'd4' }), weld('b', { lengthMode: 'Length in mm', diameterId: '', dialen: 150, welder1Id: '' }), weld('c', { welder1Id: '', _archived: true })] });
  assert.equal(isoProgress(mixed).phases[0].drivers.find(driver => driver.key === 'welds')!.progress, 1);
});

test('without weights nothing is calculated and no default is invented', () => {
  for (const site of [undefined, null, row('empty'), row('blank', { weightShop: '', shopWelds: null })]) {
    const progress = isoProgress(worked({ site }));
    assert.equal(progress.configured, false); assert.equal(progress.total, null); assert.ok(progress.phases.every(phase => phase.percent === null));
  }
});

test('quantity budgets do not exist yet: isoBudgets returns none and entered quantities need a budget', () => {
  assert.equal(isoBudgets(row('iso')), undefined);
  const errors = isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 5 }, row('iso', { isoNo: 'ISO-1' }), undefined);
  assert.match(errors.shopPipeM, /no MTO budget/i);
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 0, fieldPipeM: null, fieldSupportsPcs: '' }, row('iso', { isoNo: 'ISO-1' }), undefined), {}, 'zero or empty never needs a budget');
  assert.match(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 120.5 }, row('iso', { isoNo: 'ISO-1' }), { shop: { materialPipe: 100 } }).shopPipeM, /above the MTO budget of 100 m/);
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 100 }, row('iso', { isoNo: 'ISO-1' }), { shop: { materialPipe: 100 } }), {}, 'the ceiling itself is allowed');
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 120 }, row('iso', { isoNo: 'ISO-1', shopPipeM: 120 }), { shop: { materialPipe: 100 } }), {}, 'an unchanged stored value does not block other saves');
});

test('blockers: Release appears while shop welds have no Prefab release', () => {
  const welds = [weld('s1')];
  const none = isoBlockers(base({ welds }));
  assert.deepEqual(none.groups.map(group => [group.key, group.title, group.items.length]), [['release', 'Release', 1]]);
  assert.equal(none.total, 1);
  assert.equal(isoBlockers(base({ welds, releases: [row('r', { isoId: 'iso', type: 'Prefab' })] })).total, 0);
  assert.equal(isoBlockers(base({ welds, releases: [row('r', { isoId: 'iso', type: 'Field' }), row('r2', { isoId: 'other', type: 'Prefab' })] })).total, 1, 'only a Prefab release of this isometric counts');
  assert.equal(isoBlockers(base({ welds: [weld('f1', { typeId: 'wt-field' })] })).total, 0, 'field welds alone need no prefab release');
  assert.equal(isoBlockers(base({ welds, releases: null })).total, 0, 'unreadable releases skip the group');
});

test('blockers: Welds lists welds that have a welder and lack a mandatory field', () => {
  const welds = [
    weld('w1', { typeId: '', wpsId: '', date: '', diameterId: '', chargeNo1: '', chargeNo2: '' }),
    weld('w2', { chargeNo2: '' }),
    weld('w3', { lengthMode: 'Length in mm', diameterId: '', dialen: 120 }),
    weld('w4', { lengthMode: 'Length in mm', diameterId: '', dialen: null }),
    weld('w5', { welder1Id: '', welder3Id: 'w9', wpsId: '' }),
    weld('w6', { welder1Id: '', typeId: '', date: '' }),
  ];
  const blockers = isoBlockers(base({ welds, releases: [row('r', { isoId: 'iso', type: 'Prefab' })] }));
  assert.deepEqual(blockers.groups.map(group => group.key), ['welds']);
  assert.deepEqual(blockers.groups[0].items, [
    { weldId: 'w1', message: 'Weld W1 is missing weld type, WPS, weld date, diameter, charge number 1 and charge number 2.' },
    { weldId: 'w2', message: 'Weld W2 is missing charge number 2.' },
    { weldId: 'w4', message: 'Weld W4 is missing length.' },
    { weldId: 'w5', message: 'Weld W5 is missing WPS.' },
  ]);
  assert.equal(blockers.total, 4);
});

test('blockers: NDT lists required examinations without a result; a rejection is a result', () => {
  const welds = [weld('n1', { ndoReq: true }), weld('n2', { ndoReq: true }), weld('n3', { ndoReqPre: true }), weld('n4', { ndoReqPre: true, ndoReq: true }), weld('n5', { ndoReq: true }), weld('n6')];
  const results = [result('n2', 'Accepted', '2026-10-06'), result('n4', 'Accepted', '2026-10-06', { type: 'NDT PRE' }), result('n5', 'Rejected', '2026-10-06'), result('n6', 'Accepted', '2026-10-06'), result('n1', 'Accepted', '2026-10-06', { type: 'VI' })];
  const blockers = isoBlockers(base({ welds, results, releases: [row('r', { isoId: 'iso', type: 'Prefab' })] }));
  const ndt = blockers.groups.find(group => group.key === 'ndt')!;
  assert.deepEqual(ndt.items, [
    { weldId: 'n1', message: 'NDT on weld N1 has no result yet.' },
    { weldId: 'n3', message: 'NDT PRE on weld N3 has no result yet.' },
    { weldId: 'n4', message: 'NDT on weld N4 has no result yet.' },
  ]);
});

test('blockers: Repair lists welds whose latest NDT result is rejected until an accepted result follows', () => {
  const welds = [weld('r1', { ndoReq: true }), weld('r2', { ndoReq: true, repair: true }), weld('r3', { ndoReq: true, repair: true }), weld('r4', { ndoReq: true })];
  const results = [result('r1', 'Rejected', '2026-10-06'), result('r2', 'Rejected', '2026-10-06'), result('r3', 'Rejected', '2026-10-06'), result('r3', 'Accepted', '2026-10-12'), result('r4', 'Accepted', '2026-10-06'), result('r4', 'Rejected', '2026-10-13')];
  const blockers = isoBlockers(base({ welds, results, releases: [row('r', { isoId: 'iso', type: 'Prefab' })] }));
  assert.deepEqual(blockers.groups.map(group => group.key), ['repair']);
  assert.deepEqual(blockers.groups[0].items, [
    { weldId: 'r1', message: 'Weld R1 was rejected; no repair is recorded yet.' },
    { weldId: 'r2', message: 'Weld R2 was rejected; the repair is recorded and waits for an accepted re-examination.' },
    { weldId: 'r4', message: 'Weld R4 was rejected; no repair is recorded yet.' },
  ]);
});

test('blockers: Punch counts open items of this isometric; groups come in the fixed order with the total', () => {
  const punch = [row('p1', { isoId: 'iso', status: 'Open' }), row('p2', { isoId: 'iso', status: 'In progress' }), row('p3', { isoId: 'iso', status: 'Completed' }), row('p4', { isoId: 'other', status: 'Open' }), row('p5', { isoId: 'iso', status: 'Open', _archived: true })];
  const everything = base({
    welds: [weld('s1', { chargeNo2: '', ndoReq: true }), weld('s2', { ndoReq: true }), weld('s3', { ndoReq: true })],
    results: [result('s2', 'Rejected', '2026-10-06'), result('s3', 'Accepted', '2026-10-06')], releases: [], punch,
  });
  const blockers = isoBlockers(everything);
  assert.deepEqual(blockers.groups.map(group => group.key), ['release', 'welds', 'ndt', 'repair', 'punch']);
  assert.deepEqual(blockers.groups.map(group => group.count), [1, 1, 1, 1, 2]);
  assert.equal(blockers.groups[4].items[0].message, '2 open punch items.');
  assert.equal(blockers.total, 6);
  assert.equal(isoBlockers(base({ punch })).total, 2);
  assert.equal(isoBlockers(base({ punch: null })).total, 0);
});

test('quality is accepted over accepted plus rejected NDT results of this isometric', () => {
  const welds = [weld('a'), weld('b'), weld('c', { isoId: 'other' }), weld('d', { _archived: true })];
  const results = [result('a', 'Accepted', '2026-10-01'), result('a', 'Accepted', '2026-10-02', { type: 'NDT PRE' }), result('b', 'Accepted', '2026-10-03'), result('b', 'Rejected', '2026-10-04'), result('b', 'Accepted', '2026-10-05', { type: 'VI' }), result('c', 'Rejected', '2026-10-05'), result('d', 'Rejected', '2026-10-05')];
  assert.deepEqual(isoQuality({ iso: row('iso'), welds, results }), { accepted: 3, rejected: 1, percent: 75 });
  assert.deepEqual(isoQuality({ iso: row('iso'), welds, results: [] }), { accepted: 0, rejected: 0, percent: null });
  assert.equal(isoQuality({ iso: row('iso'), welds, results: [result('a', 'Accepted', '2026-10-01'), result('a', 'Rejected', '2026-10-02'), result('b', 'Accepted', '2026-10-02')] }).percent, 66.7);
});

test('priority: old values map to the reference list, nothing is rewritten, and the mapping can be reversed', () => {
  assert.deepEqual(PRIORITY_OPTIONS, ['No priority', 'Prio 1', 'Prio 2', 'Prio 3', 'Prio 4', 'Prio 5']);
  assert.deepEqual(['Critical', 'High', 'Normal', 'Low', '', undefined, null].map(priorityLabel), ['Prio 1', 'Prio 2', 'Prio 3', 'Prio 4', 'No priority', 'No priority', 'No priority']);
  assert.deepEqual(['Prio 1', 'Prio 5', 'No priority'].map(priorityLabel), ['Prio 1', 'Prio 5', 'No priority'], 'new values pass through');
  assert.equal(priorityStored('No priority'), ''); assert.equal(priorityStored('Prio 2'), 'Prio 2');
  // One-to-one on the old values: every old value maps to its own option, so the mapping can be inverted.
  const old = Object.keys(LEGACY_PRIORITY).filter(Boolean);
  assert.equal(new Set(old.map(value => LEGACY_PRIORITY[value])).size, old.length);
  const field = RESOURCE_MAP.isometrics.fields.find(item => item.name === 'priority')!;
  assert.deepEqual(field.options, PRIORITY_OPTIONS); assert.equal(field.legacy, LEGACY_PRIORITY);

  // A stored old value stays as it is when other fields are saved, and the new value is written only when the field is saved.
  const store = new Store(':memory:'); seed(store);
  try {
    const project = store.list('projects')[0];
    const iso = store.create('isometrics', { isoNo: 'LEGACY-1', projectId: project.id, priority: 'Prio 4' });
    store.db.prepare('UPDATE "isometrics" SET data=json_set(data, \'$.priority\', \'Critical\') WHERE id=?').run(iso.id);
    const stored = store.get('isometrics', iso.id);
    assert.equal(stored.priority, 'Critical');
    const edited = store.update('isometrics', iso.id, { description: 'edited' }, stored._version);
    assert.equal(edited.priority, 'Critical', 'saving another field keeps the old value');
    const full = store.update('isometrics', iso.id, { ...edited, description: 'edited again' }, edited._version);
    assert.equal(full.priority, 'Critical', 'a whole-record save that sends the old value keeps it too');
    assert.equal(store.update('isometrics', iso.id, { priority: 'Prio 2' }, full._version).priority, 'Prio 2', 'the new value is written when the field is saved');
    assert.throws(() => store.update('isometrics', iso.id, { priority: 'Urgent' }, store.get('isometrics', iso.id)._version), (error: unknown) => error instanceof AppError && Boolean(error.fields?.priority));
    assert.equal(store.create('isometrics', { isoNo: 'LEGACY-2', projectId: project.id }).priority, '', 'new records default to No priority');
  } finally { store.close(); }
});

test('ISO numbers: letters, digits . _ - only, checked when created or changed, never on stored records', () => {
  for (const good of ['STX-CW-001', 'A.B_c-9', '1', 'iso.2026_01']) assert.deepEqual(isoInputErrors({ isoNo: good }, undefined), {}, good);
  for (const bad of ['STX CW 001', 'ISO/1', 'ISO#1', 'ISÖ-1', 'A,B']) assert.match(isoInputErrors({ isoNo: bad }, undefined).isoNo, /letters, digits/, bad);
  const store = new Store(':memory:'); seed(store);
  try {
    const project = store.list('projects')[0];
    assert.throws(() => store.create('isometrics', { isoNo: 'BAD NUMBER', projectId: project.id }), (error: unknown) => error instanceof AppError && error.status === 422 && Boolean(error.fields?.isoNo));
    assert.throws(() => store.create('isometrics', { isoNo: '', projectId: project.id }), (error: unknown) => error instanceof AppError && Boolean(error.fields?.isoNo));
    const iso = store.create('isometrics', { isoNo: 'OLD-1', projectId: project.id });
    store.db.prepare('UPDATE "isometrics" SET data=json_set(data, \'$.isoNo\', \'OLD NO/1\') WHERE id=?').run(iso.id);
    const stored = store.get('isometrics', iso.id);
    assert.equal(store.update('isometrics', iso.id, { description: 'still opens and saves' }, stored._version).isoNo, 'OLD NO/1');
    assert.throws(() => store.update('isometrics', iso.id, { isoNo: 'NEW NO/2' }, store.get('isometrics', iso.id)._version), (error: unknown) => error instanceof AppError && Boolean(error.fields?.isoNo));
    assert.equal(store.update('isometrics', iso.id, { isoNo: 'FIXED-1' }, store.get('isometrics', iso.id)._version).isoNo, 'FIXED-1');
  } finally { store.close(); }
});

test('the server rejects progress quantities without a budget and keeps old records saveable', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const iso = store.list('isometrics')[0];
    assert.throws(() => store.update('isometrics', iso.id, { shopPipeM: 5 }, iso._version), (error: unknown) => error instanceof AppError && error.status === 422 && Boolean(error.fields?.shopPipeM));
    const saved = store.update('isometrics', iso.id, { paintState: 'Done', tracingState: 'N/A', shopPipeM: 0 }, iso._version);
    assert.equal(saved.paintState, 'Done'); assert.equal(saved.tracingState, 'N/A');
    assert.throws(() => store.update('isometrics', iso.id, { paintState: 'Finished' }, saved._version), (error: unknown) => error instanceof AppError && Boolean(error.fields?.paintState));
  } finally { store.close(); }
});

test('the hosted profile delivers every isometric field and the records the header reads', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  const delivered = new Set(hosted.resources.isometrics);
  for (const field of RESOURCE_MAP.isometrics.fields) assert.ok(delivered.has(field.name), field.name);
  for (const name of ['normNo', 'norm', 'noBoReg', 'noBoSerial', 'shopPipeM', 'fieldAppendagesPcs', 'paintState', 'tracingState', 'insulationState', 'itp2RevNo']) assert.ok(delivered.has(name), name);
  for (const key of ['releases', 'punchlists', 'revisions']) assert.ok(hosted.resources[key], key);
  assert.ok(hosted.actions.revision);
  // They are delivered as data for the header only: no menu entry is added for them.
  for (const key of ['releases', 'punchlists', 'revisions']) assert.ok(!hosted.navigation.includes(key), key);
  // Other profiles are unchanged: the ordinary profile has no progress fields in its delivered list.
  assert.equal(availabilityFor('welding-demo')!.resources.isometrics.includes('shopPipeM'), false);
  assert.ok(RESOURCES.find(resource => resource.key === 'isometrics')!.fields.some(field => field.name === 'shopPipeM'), 'the full profile carries the additional fields');
});

test('the sample data shows a meaningful picture: one isometric with every blocker group, one clean, weights missing on another site', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const byNumber = (isoNo: string) => store.list('isometrics').find(iso => iso.isoNo === isoNo)!;
    const input = (iso: Row): IsoStatusInput => ({ iso, site: store.get('sites', store.get('projects', iso.projectId).siteId), welds: store.list('welds'), weldTypes: store.list('weld_types'), diameters: store.list('diameters'), results: store.list('inspection_results'), releases: store.list('releases'), punch: store.list('punchlists') });
    const everything = isoBlockers(input(byNumber('STX-CW-002')));
    assert.deepEqual(everything.groups.map(group => group.key), ['release', 'welds', 'ndt', 'repair', 'punch']);
    assert.equal(everything.total, 6);
    assert.equal(isoBlockers(input(byNumber('STX-CW-003'))).total, 0);
    assert.equal(isoProgress(input(byNumber('STX-CW-003'))).total, 100);
    assert.equal(isoProgress(input(byNumber('STX-ST-004'))).configured, false, 'the second main project has no weights');
    assert.equal(isoProgress(input(byNumber('STX-CW-001'))).configured, true);
    assert.equal(isoQuality(input(byNumber('STX-CW-002'))).percent, 50);
  } finally { store.close(); }
});
