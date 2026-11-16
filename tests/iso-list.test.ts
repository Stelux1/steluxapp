import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'csv-parse/sync';
import { Store, AppError } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { RESOURCES } from '../shared/resources.ts';
import { ACTIONS } from '../shared/actions.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { canAction } from '../shared/permissions.ts';
import { NO_ISO_FILTERS, flagRank, flagText, isoFilterCount, isoFlags, isoKpis, isoListContext, matchesIsoFilters, type IsoListFilters, type IsoListSource } from '../shared/iso-list.ts';
import type { Row, User } from '../shared/types.ts';

const actor = { id: 'test-actor', name: 'Test operator' };
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data }) as Row;
const fixture = (t: { after: (fn: () => void) => void }) => { const s = new Store(':memory:'); seed(s); t.after(() => s.close()); return s; };
const snapshot = (s: Store) => JSON.stringify({ rows: Object.fromEntries(RESOURCES.map(r => [r.key, s.list(r.key, true)])), audit: s.activity(10000), counters: s.db.prepare('SELECT * FROM counters ORDER BY key').all() });

// ----- flags ------------------------------------------------------------------------------------------------------

const types = [row('shop', { location: 'Shop' }), row('field', { location: 'Field' })];
const weld = (id: string, isoId: string, data: Record<string, unknown> = {}) => row(id, { isoId, typeId: 'shop', ...data });
const result = (weldId: string, outcome: string, date: string, type = 'NDT') => row(`${weldId}-${type}-${date}`, { weldId, type, result: outcome, date });
const context = (source: IsoListSource) => isoListContext({ weldTypes: types, planning: true, ...source });

test('Pfb is a tick with a Prefab release, a dash without shop welds and a cross otherwise; Fld follows the Field release', () => {
  const welds = [weld('a', 'with-release'), weld('b', 'open'), weld('c', 'field-only', { typeId: 'field' })];
  const ctx = context({ welds, releases: [row('r1', { isoId: 'with-release', type: 'Prefab' }), row('r2', { isoId: 'open', type: 'Field' }), row('r3', { isoId: 'field-only', type: 'Hydrotest' })] });
  const flags = (id: string) => isoFlags(row(id), ctx);
  assert.equal(flags('with-release').pfb, true);
  assert.equal(flags('open').pfb, false, 'shop welds and no Prefab release (a Field release does not count)');
  assert.equal(flags('field-only').pfb, null, 'no shop welds: dash');
  assert.equal(flags('no-welds-at-all').pfb, null);
  assert.deepEqual(['with-release', 'open', 'field-only'].map(id => flags(id).fld), [false, true, false]);
  // A Prefab release wins over the dash: released drawings are complete even if the welds were moved away.
  assert.equal(isoFlags(row('field-only'), context({ welds, releases: [row('r', { isoId: 'field-only', type: 'Prefab' })] })).pfb, true);
  // Unreadable releases: neither a tick nor a cross can be told.
  const hidden = context({ welds, releases: null });
  assert.deepEqual([flags('open'), isoFlags(row('open'), hidden)].map(f => [f.pfb, f.fld]), [[false, true], [null, null]]);
  // Archived releases do not count.
  assert.equal(isoFlags(row('open'), context({ welds, releases: [row('r', { isoId: 'open', type: 'Prefab', _archived: true })] })).pfb, false);
});

test('M, W, Doc., NoBo and PWHT read the isometric; E exists only where calculations are delivered', () => {
  const iso = row('i', { noBo: true, pwht: false, prefab_materials: true, prefab_est: true, prefab_welds: false, prefab_doc: true, field_doc: false });
  const flags = isoFlags(iso, context({}));
  assert.deepEqual([flags.noBo, flags.pwht, flags.m, flags.e, flags.w, flags.doc], [true, false, true, true, false, false]);
  assert.equal(isoFlags(row('i', { prefab_doc: true, field_doc: true }), context({})).doc, true);
  assert.equal(isoFlags(iso, context({ planning: false })).e, null, 'no calculation feature: dash (the column is not shown)');
  // A field that is not delivered is a dash, not a cross.
  assert.deepEqual([isoFlags(row('bare'), context({})).m, isoFlags(row('bare'), context({})).doc, isoFlags(row('bare'), context({})).noBo], [null, null, null]);
  assert.deepEqual([flagText(true), flagText(false), flagText(null)], ['Yes', 'No', 'n/a']);
  assert.ok(flagRank(null) < flagRank(false) && flagRank(false) < flagRank(true));
});

test('NDT and PWHT approved need a requirement and an Accepted latest result for every requiring weld', () => {
  const welds = [
    weld('ok1', 'ok', { ndoReq: true }), weld('ok2', 'ok', { ndoReq: true }), weld('free', 'ok'),
    weld('re', 'repaired', { ndoReq: true }), weld('open', 'unexamined', { ndoReq: true }), weld('rej', 'rejected', { ndoReq: true }),
    weld('pre', 'pre', { ndoReqPre: true, ndoReq: true }), weld('hts', 'heat', { pwhtReq: true }), weld('hts2', 'heat-open', { pwhtReq: true }),
  ];
  const results = [
    result('ok1', 'Accepted', '2026-10-01'), result('ok2', 'Accepted', '2026-10-02'),
    result('re', 'Rejected', '2026-10-01'), result('re', 'Accepted', '2026-10-05'),
    result('rej', 'Accepted', '2026-10-01'), result('rej', 'Rejected', '2026-10-03'),
    result('pre', 'Accepted', '2026-10-01', 'NDT'),
    result('hts', 'Accepted', '2026-10-04', 'PWHT'), result('hts2', 'Rejected', '2026-10-04', 'PWHT'),
  ];
  const ctx = context({ welds, results });
  const approved = (id: string) => isoFlags(row(id), ctx);
  assert.equal(approved('ok').ndtApproved, true);
  assert.equal(approved('repaired').ndtApproved, true, 'a later Accepted result replaces a rejection');
  assert.equal(approved('rejected').ndtApproved, false, 'the latest result decides, not any result');
  assert.equal(approved('unexamined').ndtApproved, false);
  assert.equal(approved('pre').ndtApproved, false, 'NDT PRE is required as well and has no result');
  assert.equal(approved('no-welds').ndtApproved, false, 'at least one weld must require NDT');
  assert.equal(approved('ok').requiresNdt, true); assert.equal(approved('no-welds').requiresNdt, false);
  assert.deepEqual(['heat', 'heat-open', 'ok'].map(id => approved(id).pwhtApproved), [true, false, false]);
  assert.equal(isoFlags(row('ok'), context({ welds, results: null })).ndtApproved, false, 'unreadable results cannot approve');
});

test('KPI cards give the share and n / total of the listed isometrics, "Total" against the whole scope, and are zero-safe', () => {
  const welds = [weld('a', 'one', { ndoReq: true }), weld('b', 'two', { ndoReq: true })];
  const ctx = context({ welds, results: [result('a', 'Accepted', '2026-10-01')], releases: [row('r', { isoId: 'one', type: 'Prefab' })] });
  const listed = ['one', 'two', 'three'].map(id => isoFlags(row(id, { prefab_doc: id === 'one', field_doc: id === 'one' }), ctx));
  const cards = isoKpis(listed, 12);
  assert.deepEqual(cards.map(card => card.label), ['Total isometrics', 'NDT approved', 'PWHT approved', 'Prefab complete', 'Field complete', 'Documentation']);
  assert.deepEqual(cards.map(card => [card.count, card.total, card.percent]), [[3, 12, 25], [1, 3, 33.3], [0, 3, 0], [1, 3, 33.3], [0, 3, 0], [1, 3, 33.3]]);
  assert.deepEqual(isoKpis([], 0).map(card => [card.count, card.total, card.percent]), Array(6).fill([0, 0, 0]));
});

test('filters combine: column text, NDT, PWHT and the ready flags narrow the list together and the KPIs follow', () => {
  const welds = [weld('a', 'i1', { ndoReq: true }), weld('b', 'i2')];
  const ctx = context({ welds });
  const isos = [
    row('i1', { isoNo: 'STX-CW-001', projectId: 'p1', pwht: true, prefab_materials: true, prefab_welds: false, prefab_est: false }),
    row('i2', { isoNo: 'STX-CW-002', projectId: 'p1', pwht: false, prefab_materials: true, prefab_welds: true, prefab_est: false }),
    row('i3', { isoNo: 'STX-ST-003', projectId: 'p2', pwht: true, prefab_materials: false, prefab_welds: true, prefab_est: true }),
  ];
  const shown = (iso: Row) => (column: string) => String(column === 'projectId' ? (iso.projectId === 'p1' ? 'STX-2401' : 'STX-2402') : iso[column] ?? '');
  const list = (filters: Partial<IsoListFilters>) => isos.filter(iso => matchesIsoFilters(isoFlags(iso, ctx), shown(iso), { ...NO_ISO_FILTERS, ...filters })).map(iso => iso.id);
  assert.deepEqual(list({}), ['i1', 'i2', 'i3']);
  assert.deepEqual(list({ text: { isoNo: 'cw' } }), ['i1', 'i2'], 'case-insensitive text');
  assert.deepEqual(list({ text: { projectId: '2402' } }), ['i3']);
  assert.deepEqual(list({ pwht: 'yes' }), ['i1', 'i3']); assert.deepEqual(list({ pwht: 'no' }), ['i2']);
  assert.deepEqual(list({ ndt: 'yes' }), ['i1']); assert.deepEqual(list({ ndt: 'no' }), ['i2', 'i3']);
  assert.deepEqual(list({ mto: 'yes', weld: 'yes' }), ['i2']);
  assert.deepEqual(list({ mto: 'yes', weld: 'yes', text: { isoNo: 'st-0' } }), [], 'filters are ANDed');
  assert.deepEqual(list({ est: 'yes' }), ['i3']);
  assert.deepEqual(list({ text: { isoNo: '   ' } }), ['i1', 'i2', 'i3'], 'blank text is no filter');
  assert.equal(isoFilterCount({ ...NO_ISO_FILTERS, pwht: 'yes', text: { isoNo: 'x', irn: ' ' } }), 2);
  const kpis = isoKpis(isos.filter(iso => matchesIsoFilters(isoFlags(iso, ctx), shown(iso), { ...NO_ISO_FILTERS, pwht: 'yes' })).map(iso => isoFlags(iso, ctx)), isos.length);
  assert.deepEqual([kpis[0].count, kpis[0].total], [2, 3]);
});

test('the sample data shows a tick, a cross and a dash in the flag columns and non-zero key figures', t => {
  const s = fixture(t);
  const ctx = isoListContext({ welds: s.list('welds'), weldTypes: s.list('weld_types'), results: s.list('inspection_results'), releases: s.list('releases'), planning: true });
  const flags = s.list('isometrics').map(iso => isoFlags(iso, ctx));
  for (const key of ['noBo', 'pwht', 'm', 'e', 'w', 'pfb', 'fld', 'doc'] as const) assert.ok(flags.some(f => f[key] === true), `${key} has a tick`);
  for (const key of ['noBo', 'pwht', 'm', 'e', 'w', 'pfb', 'fld', 'doc'] as const) assert.ok(flags.some(f => f[key] === false), `${key} has a cross`);
  assert.ok(flags.some(f => f.pfb === null), 'Pfb has a dash');
  for (const card of isoKpis(flags, flags.length)) assert.ok(card.count > 0 && card.percent > 0, card.label);
});

// ----- Set phase -------------------------------------------------------------------------------------------------------

test('bulk Set phase changes only the flags that were chosen and leaves every other flag of every isometric alone', t => {
  const s = fixture(t);
  const phaseNames = ['prefab_materials', 'prefab_est', 'prefab_welds', 'prefab_doc', 'field_doc', 'field_test', 'field_release', 'prep_finished'];
  const before = Object.fromEntries(['iso-1', 'iso-4', 'iso-9'].map(id => [id, s.get('isometrics', id)]));
  runAction(s, 'phases', { isoIds: ['iso-1', 'iso-4', 'iso-9'], field_test: 'Complete', prefab_doc: 'Incomplete', prep_finished: 'Keep current' }, actor);
  for (const [id, original] of Object.entries(before)) {
    const now = s.get('isometrics', id);
    assert.equal(now.field_test, true, `${id} field tests set`); assert.equal(now.prefab_doc, false, `${id} prefab docs cleared`);
    for (const name of phaseNames.filter(name => !['field_test', 'prefab_doc'].includes(name))) assert.equal(now[name], original[name], `${id}.${name} untouched`);
    assert.equal(now.isoNo, original.isoNo);
  }
  assert.throws(() => runAction(s, 'phases', { isoIds: ['iso-1'], prefab_doc: 'Keep current' }, actor), /at least one phase/);
  assert.throws(() => runAction(s, 'phases', { isoIds: ['iso-1'], prefab_doc: 'Maybe' }, actor), /valid phase/);
});

// ----- Copy isometrics ----------------------------------------------------------------------------------------------------

/** iso-9 (STX-SK-009, project STX-2403) has welds on spool-9, a requirement, phase flags and a Prefab release; copied to STX-2401. */
function planningFixture(s: Store) {
  const norm = s.create('calculation_norms', { name: 'Pipe fit-up', uom: 'M', hoursPerUnit: 0.5 }, actor);
  const requirement = s.list('iso_materials').find(r => r.isoId === 'iso-9')!;
  s.create('calculation_lines', { name: 'Fit-up pipe', isoId: 'iso-9', requirementId: requirement.id, normId: norm.id }, actor);
  s.create('calculation_lines', { name: 'Manual allowance', isoId: 'iso-9', normId: norm.id, quantity: 3 }, actor);
  s.create('cut_list', { name: 'C1', isoId: 'iso-9', requirementId: requirement.id, spoolId: 'spool-9', quantity: 2, lengthMm: 1200 }, actor);
  return { requirement };
}
const copyOf = (s: Store, isoNo: string, projectId: string) => s.list('isometrics').find(r => r.isoNo === isoNo && r.projectId === projectId)!;

test('copy isometrics: without any box only the isometric is copied, with its fields and revision numbers but no progress, phases or records', t => {
  const s = fixture(t); const source = s.get('isometrics', 'iso-9');
  const counts = () => Object.fromEntries(['welds', 'spools', 'iso_materials', 'releases', 'inspection_requests', 'attachments', 'picklists', 'movements', 'order_lines'].map(key => [key, s.list(key, true).length]));
  const before = counts();
  const result = runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling' }, actor);
  assert.ok('records' in result && result.records?.length === 1);
  const copy = copyOf(s, 'STX-SK-009', 'project-cooling'); assert.ok(copy); assert.notEqual(copy.id, source.id);
  for (const name of ['irn', 'revNo', 'itpNo', 'pipingClass', 'material', 'priority', 'drawingNo', 'assetTag', 'paintSpec', 'testPressure', 'ped', 'xRay', 'noBo', 'pwht', 'date']) assert.equal(copy[name], source[name], name);
  assert.equal(copy.revNo, source.revNo, 'the current revision carries over');
  for (const name of ['prefab_materials', 'prefab_est', 'prefab_welds', 'prefab_doc', 'field_doc', 'field_test', 'field_release', 'prep_finished']) assert.equal(copy[name], false, name);
  assert.equal(copy.testSystemId, ''); assert.equal(copy.shopPipeM ?? null, null);
  assert.deepEqual(counts(), before, 'no welds, spools, requirements, releases, documents or stock links');
  assert.equal(s.list('revisions').filter(r => r.isoId === copy.id).length, 0, 'no revision history is carried over');
  // The source is untouched.
  assert.equal(JSON.stringify(s.get('isometrics', 'iso-9')), JSON.stringify(source));
});

test('copy isometrics: Copy welds copies definitions and spools only, never welders, dates, charges, inspections, repairs or releases', t => {
  const s = fixture(t);
  s.update('welds', 'weld-9', { repair: true, tracer: true, kr: 'K1', sleeve: 'S1', jointType: 'BW', pwhtReq: true, ndoReqPre: true, certificate1Id: '' }, s.get('welds', 'weld-9')._version, actor);
  const originals = s.list('welds').filter(w => w.isoId === 'iso-9'); assert.equal(originals.length, 3);
  const releases = s.list('releases').length, requests = s.list('inspection_requests', true).length, results = s.list('inspection_results', true).length;
  runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling', copyWelds: true }, actor);
  const copy = copyOf(s, 'STX-SK-009', 'project-cooling'); const welds = s.list('welds').filter(w => w.isoId === copy.id);
  assert.deepEqual(welds.map(w => w.weldNo).sort(), originals.map(w => w.weldNo).sort());
  for (const original of originals) {
    const made = welds.find(w => w.weldNo === original.weldNo)!;
    for (const name of ['typeId', 'wpsId', 'lengthMode', 'diameterId', 'ndoReq', 'ndoReqPre', 'pwhtReq', 'pwhtReqPre']) assert.equal(made[name] || false, original[name] || false, `${original.weldNo}.${name}`);
    for (const name of ['welder1Id', 'welder2Id', 'date', 'datefit', 'chargeNo1', 'chargeNo2', 'wire1Id', 'coating1Id', 'certificate1Id', 'kr', 'sleeve']) assert.ok(!made[name], `${original.weldNo}.${name} is not copied`);
    assert.equal(made.repair, false); assert.equal(made.tracer, false);
  }
  assert.equal(welds.find(w => w.weldNo === 'W009')!.jointType, 'BW');
  // The spool is created by name on the copy; the originals keep theirs.
  const spools = s.list('spools').filter(sp => sp.isoId === copy.id); assert.deepEqual(spools.map(sp => sp.name), ['SP-009']);
  assert.ok(welds.every(w => w.spoolId === spools[0].id)); assert.equal(spools[0].laydownId || '', '');
  assert.equal(s.list('welds').filter(w => w.isoId === 'iso-9').length, 3);
  assert.deepEqual([s.list('releases').length, s.list('inspection_requests', true).length, s.list('inspection_results', true).length], [releases, requests, results]);
  assert.equal(s.list('iso_materials').filter(m => m.isoId === copy.id).length, 0);
});

test('copy isometrics: Copy materials copies requirements with quantity and phase but no order, stock or pick links; calculations need materials', t => {
  const s = fixture(t); const { requirement } = planningFixture(s);
  const stock = JSON.stringify(s.list('stock')), movements = s.list('movements', true).length, picks = s.list('picklists', true).length, lines = s.list('order_lines', true).length;
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling', copyCalculations: true }, actor), /Copy materials/);
  assert.equal(s.list('isometrics').filter(i => i.projectId === 'project-cooling').length, 3, 'nothing was copied');
  runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling', copyMaterials: true }, actor);
  const copy = copyOf(s, 'STX-SK-009', 'project-cooling'); const made = s.list('iso_materials').filter(m => m.isoId === copy.id);
  assert.equal(made.length, 1); assert.equal(made[0].materialId, requirement.materialId); assert.equal(made[0].quantity, requirement.quantity); assert.equal(made[0].phaseId, requirement.phaseId); assert.ok(!made[0].chargeNo);
  assert.equal(s.list('calculation_lines').filter(l => l.isoId === copy.id).length, 0); assert.equal(s.list('welds').filter(w => w.isoId === copy.id).length, 0);
  assert.deepEqual([JSON.stringify(s.list('stock')), s.list('movements', true).length, s.list('picklists', true).length, s.list('order_lines', true).length], [stock, movements, picks, lines]);
});

test('copy isometrics: Copy calculations copies the lines that refer to copied materials and maps their spools', t => {
  const s = fixture(t); planningFixture(s);
  runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling', copyMaterials: true, copyCalculations: true }, actor);
  const copy = copyOf(s, 'STX-SK-009', 'project-cooling'); const requirement = s.list('iso_materials').find(m => m.isoId === copy.id)!;
  const calculations = s.list('calculation_lines').filter(l => l.isoId === copy.id), cuts = s.list('cut_list').filter(l => l.isoId === copy.id);
  assert.deepEqual(calculations.map(l => [l.name, l.requirementId]), [['Fit-up pipe', requirement.id]], 'the manual line without a material is not copied');
  assert.equal(cuts.length, 1); assert.equal(cuts[0].requirementId, requirement.id); assert.equal(cuts[0].quantity, 2); assert.equal(cuts[0].lengthMm, 1200);
  const spool = s.get('spools', cuts[0].spoolId); assert.equal(spool.name, 'SP-009'); assert.equal(spool.isoId, copy.id);
  // Every box together works for an isometric without calculations too.
  assert.equal(runAction(s, 'copy-isometrics', { isoIds: ['iso-8'], projectId: 'project-cooling', copyWelds: true, copyMaterials: true, copyCalculations: true }, actor).records?.length, 1);
});

test('copy isometrics: one audit entry per copied isometric, and several isometrics copy together', t => {
  const s = fixture(t);
  const result = runAction(s, 'copy-isometrics', { isoIds: ['iso-7', 'iso-8', 'iso-9'], projectId: 'project-cooling', copyMaterials: true }, actor);
  const copies = result.records!; assert.equal(copies.length, 3);
  for (const copy of copies) {
    const copied = s.history('isometrics', copy.id).events.filter(e => e.action === 'copied');
    assert.equal(copied.length, 1, copy.isoNo as string); assert.match(copied[0].summary, new RegExp(`Copied from ${copy.isoNo} .*STX-2403.*1 material`));
  }
});

test('copy isometrics: an ISO number that exists in the target rejects everything and changes nothing', t => {
  const s = fixture(t);
  // iso-9 is itself in the target, so the number is taken; iso-1 alone would have been fine.
  const before = snapshot(s);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: ['iso-1', 'iso-9'], projectId: 'project-skid', copyWelds: true, copyMaterials: true }, actor), (error: unknown) => error instanceof AppError && error.status === 422 && /STX-SK-009 already exists in project STX-2403\. Nothing was copied\./.test(error.message));
  assert.equal(snapshot(s), before, 'no isometric, spool, weld, audit entry or counter was written');
  // Two sources with the same number cannot land in one project either.
  runAction(s, 'copy-isometrics', { isoIds: ['iso-1'], projectId: 'project-skid' }, actor);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: ['iso-1'], projectId: 'project-skid' }, actor), /STX-CW-001 already exists/);
  const extra = s.create('projects', { internnumber: 'STX-2404', siteId: 'site-north', status: 'Active' }, actor);
  const a = s.create('isometrics', { isoNo: 'DUP-1', projectId: 'project-skid' }, actor), b = s.create('isometrics', { isoNo: 'DUP-1', projectId: 'project-cooling' }, actor);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: [a.id, b.id], projectId: extra.id }, actor), /DUP-1 already exists in project STX-2404/);
  assert.equal(s.list('isometrics').filter(i => i.projectId === extra.id).length, 0);
});

test('copy isometrics: only within the same main project, and bad input is refused', t => {
  const s = fixture(t); const before = snapshot(s);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-steam' }, actor), /same main project/);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'missing' }, actor), /could not be found/);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: [], projectId: 'project-cooling' }, actor), /Select at least one isometric/);
  assert.throws(() => runAction(s, 'copy-isometrics', { isoIds: ['iso-9'], projectId: 'project-cooling', copyWelds: 'yes' }, actor), /Choose whether/);
  assert.equal(snapshot(s), before);
});

// ----- permissions, profiles, HTTP --------------------------------------------------------------------------------------

const account = (levels: Partial<Record<string, number>>, extra: Partial<User> = {}): User => ({ id: 'u', name: 'u', email: 'u@example.test', profileId: 'p', permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0, ...levels }, availability: availabilityFor(HOSTED_RELEASE_PROFILE), ...extra });

test('copy isometrics needs the add right on isometrics and on each thing it copies', () => {
  const writer = account({ general: 2, materials: 2, welding: 2 });
  assert.ok(canAction(writer, 'copy-isometrics', { copyWelds: true, copyMaterials: true, copyCalculations: true }));
  assert.equal(canAction(account({ general: 1, materials: 2, welding: 2 }), 'copy-isometrics'), false, 'read-only isometrics');
  assert.equal(canAction(account({ general: 2, materials: 2, welding: 1 }), 'copy-isometrics', { copyWelds: true }), false);
  assert.equal(canAction(account({ general: 2, materials: 2, welding: 1 }), 'copy-isometrics', { copyMaterials: true }), true);
  assert.equal(canAction(account({ general: 2, materials: 1, welding: 2 }), 'copy-isometrics', { copyMaterials: true }), false);
  assert.equal(canAction(account({ general: 2, materials: 1, welding: 2 }), 'copy-isometrics', { copyCalculations: true }), false);
  // Detailed permissions: the matrix alone decides.
  const detailed = (rules: Record<string, string[]>) => account({}, { capabilities: rules as never });
  assert.equal(canAction(detailed({ '64': ['show', 'insert'], '63': ['show'] }), 'copy-isometrics', { copyWelds: true }), false);
  assert.equal(canAction(detailed({ '64': ['show', 'insert'], '63': ['show', 'insert'] }), 'copy-isometrics', { copyWelds: true }), true);
  assert.equal(canAction(detailed({ '64': ['show', 'edit'] }), 'copy-isometrics'), false, 'edit is not add');
});

test('the other release profiles are unchanged: only the full workspace and the hosted profile know Copy isometrics', () => {
  assert.ok(ACTIONS['copy-isometrics']); assert.equal(availabilityFor('full'), undefined);
  assert.equal(availabilityFor('welding-demo')!.actions['copy-isometrics'], undefined); assert.equal(availabilityFor('access-prototype')!.actions['copy-isometrics'], undefined);
  assert.equal(availabilityFor('welding-demo')!.actions.phases, undefined); assert.equal(availabilityFor('access-prototype')!.actions.phases, undefined);
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.deepEqual(hosted.actions['copy-isometrics'], ['isoIds', 'projectId', 'copyWelds', 'copyMaterials', 'copyCalculations']);
  assert.ok(hosted.actions.phases.includes('prefab_est') && hosted.actions.phases.length === 9);
  for (const profile of ['welding-demo', 'access-prototype'] as const) assert.ok(!availabilityFor(profile)!.features.includes('pilots'), profile);
});

async function hostedFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-isolist-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': pilot, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Iso-List-Test-Password';
  /** `account`: fields of the account itself, e.g. the applications it is enabled for (entering a pilot depends on those alone). */
  const signIn = async (name: string, levels: Record<string, string>, account: Record<string, unknown> = {}) => {
    const profile = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profile.id, active: true, ...account });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  return { store, request, signIn, usePilot: (key: string) => { pilot = key; }, setup: async () => assert.equal((await request('/api/auth/setup', 'POST', { name: 'Iso admin', email: 'iso-admin@example.test', password })).status, 201) };
}

test('hosted API: copy and phases work for a writer, a missing right is a 403 and the server refuses forged fields', async t => {
  const f = await hostedFixture(t); await f.setup();
  const copy = (data: Record<string, unknown>) => f.request('/api/actions/copy-isometrics', 'POST', { isoIds: ['iso-9'], projectId: 'project-cooling', ...data });
  await f.signIn('Welding read only', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read only' });
  assert.equal((await copy({ copyWelds: true })).status, 403, 'no add right on welds');
  // Material requirements belong to MTO Pilot: from Weld Pilot they follow the account's MTO profile (here the same one, Read & write).
  assert.equal((await copy({ copyMaterials: true, copyWelds: false })).status, 201, 'materials are copied from Weld Pilot with the MTO right');
  assert.equal(f.store.list('welds').filter(w => copyOfProject(f.store, w.isoId as string)).length, 0);
  await f.signIn('General read only', { generalPermission: 'Read only', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  assert.equal((await copy({ projectId: 'project-skid', isoIds: ['iso-1'] })).status, 403);
  assert.equal((await f.request('/api/actions/phases', 'POST', { isoIds: ['iso-1'], prefab_doc: 'Complete' })).status, 403);
  await f.signIn('Full writer', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  assert.equal((await copy({ isoIds: ['iso-1'], projectId: 'project-skid', copyWelds: true, copyMaterials: true, copyCalculations: true })).status, 201, 'all three parts from one pilot (each follows its own pilot)');
  const clash = await copy({ isoIds: ['iso-1'], projectId: 'project-skid' }); assert.equal(clash.status, 422); assert.match((await clash.json()).error, /STX-CW-001 already exists in project STX-2403\. Nothing was copied\./);
  assert.equal((await copy({ isoIds: ['iso-2'], projectId: 'project-skid', _version: 3 })).status, 404, 'undelivered field names are refused');
  const phases = await f.request('/api/actions/phases', 'POST', { isoIds: ['iso-1', 'iso-2'], field_test: 'Complete' }); assert.equal(phases.status, 201);
  assert.deepEqual(['iso-1', 'iso-2'].map(id => f.store.get('isometrics', id).field_test), [true, true]);
  // The audit trail the isometric page shows includes the copy.
  const copied = f.store.list('isometrics').find(i => i.isoNo === 'STX-CW-001' && i.projectId === 'project-skid')!;
  const history = await (await f.request(`/api/history/isometrics/${copied.id}`)).json(); assert.ok(history.events.some((e: { summary: string }) => e.summary === 'Copied isometric'));
});
const copyOfProject = (s: Store, isoId: string) => s.get('isometrics', isoId).projectId === 'project-cooling' && s.get('isometrics', isoId).isoNo === 'STX-SK-009';

test('hosted export gives the flag columns as Yes / No / n/a, the same in both pilots (from the server summary)', async t => {
  const f = await hostedFixture(t); await f.setup();
  const table = async (ids: string) => parse(await (await f.request(`/api/export/isometrics?format=csv&archived=true&ids=${ids}`)).text(), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const rows = await table('iso-3,iso-10,iso-1');
  const by = (isoNo: string) => rows.find(r => r['ISO number'] === isoNo)!;
  for (const column of ['NoBo', 'PWHT', 'M', 'E', 'W', 'Pfb', 'Fld', 'Doc.']) assert.ok(column in rows[0], column);
  assert.deepEqual(['NoBo', 'M', 'E', 'W', 'Pfb', 'Fld', 'Doc.'].map(c => by('STX-CW-003')[c]), ['Yes', 'No', 'No', 'No', 'Yes', 'Yes', 'No']);
  assert.deepEqual([by('STX-SK-010').Pfb, by('STX-SK-010').Fld, by('STX-CW-001').Pfb], ['n/a', 'No', 'No']);
  await f.signIn('Materials only', { generalPermission: 'Read only', materialsPermission: 'Read & write', weldingPermission: 'No access' }, { weldEnabled: false });
  assert.equal((await f.request('/api/export/isometrics?format=csv&ids=iso-3')).status, 403, 'not enabled for Weld Pilot');
  f.usePilot('mto');
  const limited = (await table('iso-3')).at(0)!;
  assert.deepEqual([limited.Pfb, limited.Fld, limited.M], ['Yes', 'Yes', 'No'], 'the MTO-only account sees the releases\' effect, not the releases');
});
