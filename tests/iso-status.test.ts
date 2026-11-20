import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { RESOURCES, RESOURCE_MAP } from '../shared/resources.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { isoBlockers, isoInputErrors, isoProgress, isoQuality, isoBudgets, noBudgetText, type IsoStatusInput } from '../shared/iso-status.ts';
import { isoBudgets as mtoBudgets } from '../shared/mto-materials.ts';
import { PROGRESS_CARD_TEXTS, finishSpecification, percentText, quantityBarText } from '../shared/iso-summary.ts';
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
  assert.equal(shopOnly.phases[1].percent, 0, 'a phase with nothing in scope shows 0 %');
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
  assert.equal(errors.shopPipeM, 'No Shop-typed material on this ISO.');
  assert.equal(isoInputErrors({ isoNo: 'ISO-1', fieldSupportsPcs: 2 }, row('iso', { isoNo: 'ISO-1' }), undefined).fieldSupportsPcs, 'No MTO budget — add materials with this component code in Material Core. (CC 2)');
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 0, fieldPipeM: null, fieldSupportsPcs: '' }, row('iso', { isoNo: 'ISO-1' }), undefined), {}, 'zero or empty never needs a budget');
  assert.match(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 120.5 }, row('iso', { isoNo: 'ISO-1' }), { shop: { materialPipe: 100 } }).shopPipeM, /above the MTO budget of 100 m/);
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 100 }, row('iso', { isoNo: 'ISO-1' }), { shop: { materialPipe: 100 } }), {}, 'the ceiling itself is allowed');
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 120 }, row('iso', { isoNo: 'ISO-1', shopPipeM: 120 }), { shop: { materialPipe: 100 } }), {}, 'an unchanged stored value does not block other saves');
});

/** The items without their click target (the targets are covered in tests/iso-page-dialogs.test.ts). */
const plain = <T extends { target?: unknown }>(items: T[]) => items.map(({ target: _target, ...rest }) => rest);
/** Both phases completed on the isometric, so a test sees only the group it is about. */
const done = { prefabCompletedAt: '2026-10-10T08:00:00.000Z', fieldCompletedAt: '2026-10-11T08:00:00.000Z' };

test('blockers: Release lists "Prefab is not released yet" and "Field is not released yet" until each phase is complete, with or without welds', () => {
  const release = (setup: Setup) => isoBlockers(base(setup)).groups.find(group => group.key === 'release')?.items.map(item => item.message) ?? [];
  // Reference 00022: no welds at all, "2 open".
  const empty = isoBlockers(base({}));
  assert.deepEqual(empty.groups.map(group => [group.key, group.title, group.items.map(item => item.message)]), [['release', 'Release', ['Prefab is not released yet', 'Field is not released yet']]]);
  assert.equal(empty.total, 2);
  assert.deepEqual(release({ welds: [weld('n1', { typeId: '' })] }), ['Prefab is not released yet', 'Field is not released yet'], 'untyped welds only');
  assert.deepEqual(release({ welds: [weld('s1')] }), ['Prefab is not released yet', 'Field is not released yet'], 'no field welds: the Field line stays');
  // Complete on the isometric removes the line, without a release document; reference 0001 (Field completed) shows only Prefab.
  assert.deepEqual(release({ iso: { fieldCompletedAt: '2026-10-11T08:00:00.000Z' } }), ['Prefab is not released yet']);
  assert.deepEqual(release({ iso: done }), [], 'reference 0003: both completed, no Release group');
  // An active release from before the two steps counts as completed; a reopened one or another isometric's does not.
  assert.deepEqual(release({ releases: [row('r', { isoId: 'iso', type: 'Prefab' })] }), ['Field is not released yet']);
  assert.deepEqual(release({ releases: [row('r', { isoId: 'iso', type: 'Prefab', status: 'Reopened' }), row('r2', { isoId: 'other', type: 'Field' })] }), ['Prefab is not released yet', 'Field is not released yet']);
  assert.equal(isoBlockers(base({ releases: null })).total, 0, 'unreadable releases skip the group');
});

test('blockers: Welds lists welds that have a welder and lack a mandatory field, in the reference wording', () => {
  const welds = [
    weld('w1', { typeId: '', wpsId: '', date: '', diameterId: '', chargeNo1: '', chargeNo2: '' }),
    weld('w2', { chargeNo2: '' }),
    weld('w3', { lengthMode: 'Length in mm', diameterId: '', dialen: 120 }),
    weld('w4', { lengthMode: 'Length in mm', diameterId: '', dialen: null }),
    weld('w5', { welder1Id: '', welder3Id: 'w9', wpsId: '' }),
    weld('w6', { welder1Id: '', typeId: '', date: '' }),
  ];
  const blockers = isoBlockers(base({ welds, iso: done }));
  assert.deepEqual(blockers.groups.map(group => group.key), ['welds']);
  assert.deepEqual(plain(blockers.groups[0].items), ['w1', 'w2', 'w4', 'w5'].map(id => ({ weldId: id, message: `Weld ${id.toUpperCase()} is missing required fields` })));
  assert.equal(blockers.total, 4);
});

test('blockers: NDT lists required examinations without a result; a rejection is a result', () => {
  const welds = [weld('n1', { ndoReq: true }), weld('n2', { ndoReq: true }), weld('n3', { ndoReqPre: true }), weld('n4', { ndoReqPre: true, ndoReq: true }), weld('n5', { ndoReq: true }), weld('n6')];
  const results = [result('n2', 'Accepted', '2026-10-06'), result('n4', 'Accepted', '2026-10-06', { type: 'NDT PRE' }), result('n5', 'Rejected', '2026-10-06'), result('n6', 'Accepted', '2026-10-06'), result('n1', 'Accepted', '2026-10-06', { type: 'VI' })];
  const ndt = isoBlockers(base({ welds, results, iso: done })).groups.find(group => group.key === 'ndt')!;
  assert.deepEqual(plain(ndt.items), [
    { weldId: 'n1', message: 'NDT on weld N1 has no result' },
    { weldId: 'n3', message: 'NDT PRE on weld N3 has no result' },
    { weldId: 'n4', message: 'NDT on weld N4 has no result' },
  ]);
});

test('blockers: items keep the order the welds were created in (reference: 010R1 after 012)', () => {
  const at = (minute: number) => `2026-10-01T08:${String(minute).padStart(2, '0')}:00.000Z`;
  const welds = [weld('012', { weldNo: '012', ndoReq: true, _createdAt: at(2) }), weld('010r1', { weldNo: '010R1', ndoReq: true, _createdAt: at(5) }), weld('003', { weldNo: '003', ndoReq: true, _createdAt: at(1) })];
  assert.deepEqual(isoBlockers(base({ welds, iso: done })).groups[0].items.map(item => item.message), ['NDT on weld 003 has no result', 'NDT on weld 012 has no result', 'NDT on weld 010R1 has no result']);
});

test('blockers: Repair lists one item per rejection and names the next repair number (reference 0007, 0001)', () => {
  const repair = (welds: Row[], results: Row[]) => isoBlockers(base({ welds, results, iso: done })).groups.find(group => group.key === 'repair')?.items ?? [];
  const plainRepair = (welds: Row[], results: Row[]) => plain(repair(welds, results));
  // 0007: 003 NA, 003R1 NA, 003R2 NA → three items, the last naming 003R3 which does not exist yet.
  const w003 = weld('a', { weldNo: '003', ndoReq: true, _createdAt: '2026-10-01T08:00:00.000Z' });
  const r1 = weld('b', { weldNo: '003R1', repairOfId: 'a', ndoReq: true, _createdAt: '2026-10-02T08:00:00.000Z' });
  const r2 = weld('c', { weldNo: '003R2', repairOfId: 'b', ndoReq: true, _createdAt: '2026-10-03T08:00:00.000Z' });
  const chain = [w003, r1, r2], rejected = [result('a', 'Rejected', '2026-10-04'), result('b', 'Rejected', '2026-10-05'), result('c', 'Rejected', '2026-10-06')];
  assert.deepEqual(plainRepair(chain, rejected), [
    { weldId: 'a', message: 'Rejection on weld 003, repair 003R1 is still open' },
    { weldId: 'b', message: 'Rejection on weld 003R1, repair 003R2 is still open' },
    { weldId: 'c', message: 'Rejection on weld 003R2, repair 003R3 is still open' },
  ]);
  // An accepted repair later in the chain closes every rejection before it.
  assert.deepEqual(repair(chain, [...rejected.slice(0, 2), result('c', 'Accepted', '2026-10-06')]), []);
  // 0001: weld 002, Initial NA then Remaining Accepted with ReWeld? ticked → a rejection, repair 002R1 (no such weld).
  const w002 = weld('d', { weldNo: '002', ndoReq: true });
  assert.deepEqual(plainRepair([w002], [result('d', 'Rejected', '2026-10-04', { round: 'Initial' }), result('d', 'Accepted', '2026-10-05', { round: 'Remaining', reweld: true })]), [{ weldId: 'd', message: 'Rejection on weld 002, repair 002R1 is still open' }]);
  assert.deepEqual(repair([w002], [result('d', 'Rejected', '2026-10-04'), result('d', 'Accepted', '2026-10-05')]), [], 'a later accepted result without ReWeld? is no rejection');
  // The NDT dialog writes ReWeld? on the NA round: ticked there, a later Accepted round of the same request is still a rejection (shared/inspections.ts notAccepted).
  assert.deepEqual(plainRepair([w002], [result('d', 'Rejected', '2026-10-04', { round: 'Initial', requestId: 'rq-d', reweld: true }), result('d', 'Accepted', '2026-10-05', { round: 'Remaining', requestId: 'rq-d' })]), [{ weldId: 'd', message: 'Rejection on weld 002, repair 002R1 is still open' }]);
  // A repair whose only accepted round carries ReWeld? does not close the rejection.
  const r002 = weld('g', { weldNo: '002R1', repairOfId: 'd', ndoReq: true });
  assert.equal(repair([w002, r002], [result('d', 'Rejected', '2026-10-04'), result('g', 'Accepted', '2026-10-06', { reweld: true })]).length, 2);
  // A letter suffix is not a repair link: 005A does not close 005.
  assert.deepEqual(repair([weld('e', { weldNo: '005', ndoReq: true }), weld('f', { weldNo: '005A', ndoReq: true })], [result('e', 'Rejected', '2026-10-04'), result('f', 'Accepted', '2026-10-05')]).map(item => item.message), ['Rejection on weld 005, repair 005R1 is still open']);
});

test('blockers: Punch counts open items of this isometric; groups come in the fixed order with the total', () => {
  const punch = [row('p1', { isoId: 'iso', status: 'Open' }), row('p2', { isoId: 'iso', status: 'In progress' }), row('p3', { isoId: 'iso', status: 'Completed' }), row('p4', { isoId: 'other', status: 'Open' }), row('p5', { isoId: 'iso', status: 'Open', _archived: true })];
  const everything = base({
    welds: [weld('s1', { chargeNo2: '', ndoReq: true }), weld('s2', { ndoReq: true }), weld('s3', { ndoReq: true })],
    results: [result('s2', 'Rejected', '2026-10-06'), result('s3', 'Accepted', '2026-10-06')], releases: [], punch,
  });
  const blockers = isoBlockers(everything);
  assert.deepEqual(blockers.groups.map(group => group.key), ['release', 'welds', 'ndt', 'repair', 'punch']);
  assert.deepEqual(blockers.groups.map(group => group.count), [2, 1, 1, 1, 2]);
  assert.equal(blockers.groups[4].items[0].message, '2 open punch');
  assert.equal(blockers.total, 7);
  assert.equal(isoBlockers(base({ punch, iso: done })).total, 2);
  assert.equal(isoBlockers(base({ punch: null, iso: done })).total, 0);
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

test('ISO numbers: letters, digits . _ - and single spaces only, checked when created or changed, never on stored records', () => {
  for (const good of ['STX-CW-001', 'A.B_c-9', '1', 'iso.2026_01']) assert.deepEqual(isoInputErrors({ isoNo: good }, undefined), {}, good);
  for (const good of ['KH-034708-SHEET 5', 'SE-2406 SHEET 03 OF 45', '  STX CW 001  ']) assert.equal(isoInputErrors({ isoNo: good }, undefined).isoNo, undefined, `${good}: single spaces between the parts are allowed`);
  for (const bad of ['STX  CW', 'ISO/1', 'ISO#1', 'ISÖ-1', 'A,B']) assert.equal(isoInputErrors({ isoNo: bad }, undefined).isoNo, 'Special characters are not allowed in the ISO number', bad);
  const store = new Store(':memory:'); seed(store);
  try {
    const project = store.list('projects')[0];
    assert.throws(() => store.create('isometrics', { isoNo: 'BAD/NUMBER', projectId: project.id }), (error: unknown) => error instanceof AppError && error.status === 422 && Boolean(error.fields?.isoNo));
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
    // The server reads the isometric's own MTO budget (Store.validate passes the material rows to isoBudgets).
    const budgetRows = { iso_materials: store.list('iso_materials'), materials: store.list('materials'), custom_materials: store.list('custom_materials'), operation_phases: store.list('operation_phases') };
    const iso = store.list('isometrics').find(row => !isoBudgets(row, budgetRows)?.shop?.materialPipe)!;
    assert.throws(() => store.update('isometrics', iso.id, { shopPipeM: 5 }, iso._version), (error: unknown) => error instanceof AppError && error.status === 422 && Boolean(error.fields?.shopPipeM));
    const budgeted = store.get('isometrics', 'iso-1'), shopPipe = Number(isoBudgets(budgeted, budgetRows)?.shop?.materialPipe);
    assert.ok(shopPipe > 0, 'the sample gives iso-1 a shop pipe budget');
    assert.throws(() => store.update('isometrics', budgeted.id, { shopPipeM: shopPipe + 1 }, budgeted._version), (error: unknown) => error instanceof AppError && /above the MTO budget/.test(error.fields?.shopPipeM || ''));
    assert.equal(store.update('isometrics', budgeted.id, { shopPipeM: shopPipe }, budgeted._version).shopPipeM, shopPipe);
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
  // Releases and punch lists have their own pages (Weld Core → Releases); revisions have none.
  for (const key of ['revisions']) assert.ok(!hosted.navigation.includes(key), key);
  assert.ok(hosted.navigation.includes('punchlists'));
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
    assert.equal(everything.total, 7, 'both phases are not complete: two release items');
    assert.equal(isoBlockers(input(byNumber('STX-CW-003'))).total, 0, 'released for prefab and field before the two steps: both count as completed');
    assert.equal(isoProgress(input(byNumber('STX-CW-003'))).total, 100);
    assert.equal(isoProgress(input(byNumber('STX-ST-004'))).configured, false, 'the second main project has no weights');
    assert.equal(isoProgress(input(byNumber('STX-CW-001'))).configured, true);
    assert.equal(isoQuality(input(byNumber('STX-CW-002'))).percent, 50);
  } finally { store.close(); }
});

// ----- wave 3: the reference figures -------------------------------------------------------------------------------

/** Every weight entered as 0, as on the reference sandbox (weld__iso__0005.txt:1574: every driver weight 0). */
const ZERO_SITE = row('site-zero', Object.fromEntries(['weightShop', 'weightField', 'weightSite', 'shopWelds', 'shopNdt', 'shopMaterialPipe', 'shopSupports', 'shopAppendages', 'fieldMaterialPipe', 'fieldWelds', 'fieldNdt', 'fieldSupports', 'fieldAppendages', 'fieldPunch', 'siteHydrotest', 'sitePaintTracing'].map(name => [name, 0])));

test('with every weight 0 the phases and the isometric show 0 %, not a dash (reference Shop prefab 0%, Field 0%, Site 0%, Status 0%)', () => {
  const progress = isoProgress(base({ site: ZERO_SITE, welds: [weld('a', { ndoReq: true })], results: [result('a', 'Accepted', '2026-10-06')] }));
  assert.equal(progress.configured, true);
  assert.deepEqual(progress.phases.map(phase => phase.percent), [0, 0, 0]);
  assert.equal(progress.total, 0);
  assert.deepEqual([percentText(0), percentText(72.7), percentText(66.66), percentText(100)], ['0%', '72.7%', '66.7%', '100%'], 'no space before the sign, one decimal at most');
});

/** Reference 0003 (weld__iso__0003.txt): 001_1 and 001_2 rejected (NA), each repaired by a weld whose NDT is Accepted. */
const repaired0003 = () => {
  const welds = [weld('o1', { weldNo: '001_1', ndoReq: true }), weld('r1', { weldNo: '001_1R1', ndoReq: true, repairOfId: 'o1', _createdAt: '2026-10-02T00:00:00.000Z' }), weld('o2', { weldNo: '001_2', ndoReq: true }), weld('r2', { weldNo: '001_2 R1', ndoReq: true, _createdAt: '2026-10-02T00:00:00.000Z' })];
  const results = [result('o1', 'Rejected', '2026-10-06'), result('r1', 'Accepted', '2026-10-08'), result('o2', 'Rejected', '2026-10-06'), result('r2', 'Accepted', '2026-10-08')];
  return { welds, results };
};
const NDT_ONLY = row('site-ndt', { weightShop: 100, weightField: 0, weightSite: 0, shopNdt: 100, shopWelds: 0, ndtMeasurement: 'Per weld' });

test('repairs: a rejected weld counts as done once its repair is accepted, and repair welds add no units of their own', () => {
  // 0003: units 001_1 and 001_2 (the repairs, one linked by repairOfId and one numbered "001_2 R1", add none); both done by their repairs → 2 / 2.
  const { welds, results } = repaired0003();
  const ndt = (input: IsoStatusInput) => isoProgress(input).phases[0].drivers.find(driver => driver.key === 'ndt')!.progress;
  assert.equal(ndt(base({ site: NDT_ONLY, welds, results })), 1);
  assert.equal(isoProgress(base({ site: NDT_ONLY, welds, results })).total, 100);
  // The repair still waiting for its result: that unit is not done (1 / 2).
  assert.equal(ndt(base({ site: NDT_ONLY, welds, results: results.filter(item => item.weldId !== 'r2') })), 0.5);
  // A rejected repair is not done either; a later accepted repair of the repair is (001_1 → R1 rejected → R2 accepted).
  const chain = [...welds, weld('r1b', { weldNo: '001_1R2', ndoReq: true, repairOfId: 'r1', _createdAt: '2026-10-03T00:00:00.000Z' })];
  const rejectedRepair = [...results.filter(item => item.weldId !== 'r1'), result('r1', 'Rejected', '2026-10-08')];
  assert.equal(ndt(base({ site: NDT_ONLY, welds: chain, results: rejectedRepair })), 0.5);
  assert.equal(ndt(base({ site: NDT_ONLY, welds: chain, results: [...rejectedRepair, result('r1b', 'Accepted', '2026-10-09')] })), 1);
  // 0005: a lower-case "003r1" is not linked as a repair in the reference, so it is a unit of its own: 3 of 4 accepted = 0.75.
  const welds0005 = [weld('a', { weldNo: '001', ndoReq: true }), weld('b', { weldNo: '002', ndoReq: true }), weld('c', { weldNo: '003', ndoReq: true }), weld('d', { weldNo: '003r1', ndoReq: true, _createdAt: '2026-10-02T00:00:00.000Z' })];
  const results0005 = [result('a', 'Accepted', '2026-10-06'), result('b', 'Accepted', '2026-10-06'), result('c', 'Rejected', '2026-10-06'), result('d', 'Accepted', '2026-10-08')];
  assert.equal(ndt(base({ site: NDT_ONLY, welds: welds0005, results: results0005 })), 0.75);
});

test('quality leaves repair welds out: reference 0003 0 %, 0005 75 %, 0007 0 %', () => {
  // 0003: the examined rounds of 001_1 and 001_2 are both NA → 0 of 2 = 0 % (the accepted repairs do not count).
  const { welds, results } = repaired0003();
  assert.deepEqual(isoQuality({ iso: row('iso'), welds, results }), { accepted: 0, rejected: 2, percent: 0 });
  // 0005: 001, 002 and 003r1 Accepted, 003 NA → 3 of 4 = 75 %.
  const welds0005 = [weld('a', { weldNo: '001' }), weld('b', { weldNo: '002' }), weld('c', { weldNo: '003' }), weld('d', { weldNo: '003r1' })];
  assert.equal(isoQuality({ iso: row('iso'), welds: welds0005, results: [result('a', 'Accepted', '2026-10-06'), result('b', 'Accepted', '2026-10-06'), result('c', 'Rejected', '2026-10-06'), result('d', 'Accepted', '2026-10-08')] }).percent, 75);
  // 0007: one weld, NA → 0 %. Nothing examined → no figure (the reference shows no Quality text).
  assert.equal(isoQuality({ iso: row('iso'), welds: [weld('a')], results: [result('a', 'Rejected', '2026-10-06')] }).percent, 0);
  assert.equal(isoQuality({ iso: row('iso'), welds, results: [] }).percent, null);
});

/** 30 m pipe on a Shop-typed line and 70 m on a Field-typed line (CC 1), with `picked` metres taken from pick lists. */
function fieldPipe(picked: { shop: number; field: number }, installed: number) {
  const rows = {
    isometrics: [row('iso')], operation_phases: [row('ph-shop', { name: 'Shop' }), row('ph-field', { name: 'Field' })],
    materials: [row('pipe', { componentCode: '1' })], custom_materials: [] as Row[],
    iso_materials: [row('l-shop', { isoId: 'iso', materialId: 'pipe', quantity: 30, phaseId: 'ph-shop' }), row('l-field', { isoId: 'iso', materialId: 'pipe', quantity: 70, phaseId: 'ph-field' })],
    picklists: [row('p-shop', { isoId: 'iso', requirementId: 'l-shop', materialId: 'pipe', quantity: picked.shop }), row('p-field', { isoId: 'iso', requirementId: 'l-field', materialId: 'pipe', quantity: picked.field })],
  } as Record<string, Row[]>;
  const budgets = mtoBudgets(rows.isometrics[0], rows);
  const site = row('site-field', { weightShop: 0, weightField: 100, weightSite: 0, fieldMaterialPipe: 100 });
  return { budgets, progress: isoProgress(base({ site, budgets, iso: { fieldPipeM: installed } })) };
}

test('Field pipe is measured against the whole ISO and capped by the picked quantity (30 m Shop + 70 m Field)', () => {
  // Budget 30 + 70 = 100 m. 70 m installed, 100 m picked: min(70, 100) / 100 = 70 %.
  const full = fieldPipe({ shop: 30, field: 70 }, 70);
  assert.deepEqual([full.budgets?.shop?.materialPipe, full.budgets?.field?.materialPipe, full.budgets?.issued?.field?.materialPipe], [30, 100, 100]);
  assert.equal(full.progress.phases[1].percent, 70); assert.equal(full.progress.total, 70);
  // 70 m installed but only 40 m picked (30 + 10): min(70, 40) / 100 = 40 %.
  assert.equal(fieldPipe({ shop: 30, field: 10 }, 70).progress.total, 40);
  // Entry is allowed up to the whole ISO for Field (100 m), not beyond; Shop up to the Shop-typed MTO (30 m).
  assert.deepEqual(isoInputErrors({ isoNo: 'ISO-1', fieldPipeM: 100 }, row('iso', { isoNo: 'ISO-1' }), full.budgets), {});
  assert.match(isoInputErrors({ isoNo: 'ISO-1', fieldPipeM: 101 }, row('iso', { isoNo: 'ISO-1' }), full.budgets).fieldPipeM, /above the MTO budget of 100 m/);
  assert.match(isoInputErrors({ isoNo: 'ISO-1', shopPipeM: 31 }, row('iso', { isoNo: 'ISO-1' }), full.budgets).shopPipeM, /above the MTO budget of 30 m/);
  // Shop: 20 m handled with 30 m Shop-typed picked → 20 / 30; with only 10 m picked → 10 / 30.
  const shopSite = row('site-shop', { weightShop: 100, weightField: 0, weightSite: 0, shopMaterialPipe: 100 });
  assert.equal(isoProgress(base({ site: shopSite, budgets: full.budgets, iso: { shopPipeM: 20 } })).total, 66.7);
  assert.equal(isoProgress(base({ site: shopSite, budgets: fieldPipe({ shop: 10, field: 70 }, 0).budgets, iso: { shopPipeM: 20 } })).total, 33.3);
  // Without pick lists (no `issued`) nothing caps the entry.
  assert.equal(isoProgress(base({ site: row('s', { weightField: 100, fieldMaterialPipe: 100 }), budgets: { field: { materialPipe: 100 } }, iso: { fieldPipeM: 70 } })).total, 70);
});

test('Progress card texts follow the reference', () => {
  assert.equal(noBudgetText('field', 'supports'), 'No MTO budget — add materials with this component code in Material Core. (CC 2)');
  assert.equal(noBudgetText('field', 'materialPipe'), 'No MTO budget — add materials with this component code in Material Core. (CC 1)');
  assert.equal(noBudgetText('field', 'appendages'), 'No MTO budget — add materials with this component code in Material Core. (CC 3)');
  assert.equal(noBudgetText('shop', 'materialPipe'), 'No Shop-typed material on this ISO.');
  assert.deepEqual([quantityBarText('shop', 0, null), quantityBarText('field', 0, null), quantityBarText('field', 100, 0.7)], ['N/A', '0%', '70%']);
  assert.deepEqual(PROGRESS_CARD_TEXTS.budgetColumn, { shop: 'Ceiling: Shop issued / Shop MTO', field: 'Budget (MTO)' });
  assert.equal(PROGRESS_CARD_TEXTS.save, 'Save shop, field and site values.');
  assert.equal(PROGRESS_CARD_TEXTS.phase.shop, 'Shop prefab phase (welds, NDT, shop-typed material).');
  // Reference 0001: Paint A10, Tracing —, Insulation A15.
  const iso = row('iso', { paintSpec: 'A10', tracing: '', insulation: 'A15' });
  assert.deepEqual(['paintState', 'tracingState', 'insulationState'].map(field => finishSpecification(iso, field)), ['A10', '—', 'A15']);
});
