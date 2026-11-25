import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_MODEL, emptyProgressUnits, progressFromUnits, type ProgressUnits } from '../shared/progress-model.ts';
import { mainProjectProgress, projectProgress } from '../shared/project-progress.ts';
import { isoProgress, type IsoStatusInput } from '../shared/iso-status.ts';
import { isoSummaries } from '../shared/iso-summary.ts';
import { summaryProgress } from '../shared/iso-summary.ts';
import type { Row } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data }) as Row;
/** Units with the given done / total per activity, every other activity 0 of 0. */
const units = (values: { shop?: Record<string, [number, number]>; field?: Record<string, [number, number]> }): ProgressUnits => {
  const result = emptyProgressUnits();
  for (const phase of ['shop', 'field'] as const) for (const [key, [done, total]] of Object.entries(values[phase] || {})) (result[phase] as Record<string, { done: number; total: number }>)[key] = { done, total };
  return result;
};

test('the model is the single source: weights of each phase add up to 100 and Shop + Field to 100', () => {
  assert.equal(PROGRESS_MODEL.phases.reduce((sum, phase) => sum + phase.weight, 0), 100);
  for (const phase of PROGRESS_MODEL.phases) assert.equal(phase.activities.reduce((sum, item) => sum + item.weight, 0), 100, phase.key);
  assert.deepEqual(PROGRESS_MODEL.phases.map(phase => phase.activities.map(item => item.key)), [['fitUp', 'welding', 'ndt', 'fabricationBook'], ['erection', 'supports', 'welding', 'ndt', 'pressureTests', 'reinstatement', 'finalDocumentation']]);
});

test('an empty project gives 0 everywhere, never NaN', () => {
  for (const progress of [projectProgress([]), projectProgress([null, undefined, {}]), mainProjectProgress([], {}), mainProjectProgress(undefined, undefined)]) {
    assert.equal(progress.total, 0); assert.equal(progress.isometrics, 0);
    for (const phase of [progress.shop, progress.field]) {
      assert.equal(phase.percent, 0); assert.equal(phase.contribution, 0);
      assert.ok(phase.activities.every(item => item.progress === null && item.contribution === 0 && item.done === 0 && item.total === 0));
    }
  }
  assert.ok(!JSON.stringify(projectProgress([])).includes('NaN'));
});

test('units are pooled across isometrics, so a large isometric weighs more than a small one', () => {
  // Isometric A: 90 of 100 inch welded; isometric B: 0 of 10 inch. Pooled: 90 / 110 = 81.8 %, not the 45 % of an average.
  const a = { units: units({ shop: { welding: [90, 100], fabricationBook: [1, 1] } }) }, b = { units: units({ shop: { welding: [0, 10], fabricationBook: [0, 1] } }) };
  const pooled = projectProgress([a, b]);
  const welding = pooled.shop.activities.find(item => item.key === 'welding')!;
  assert.deepEqual([welding.done, welding.total, welding.progress, welding.weight, welding.contribution], [90, 110, 81.8, 40, 32.7]);
  const book = pooled.shop.activities.find(item => item.key === 'fabricationBook')!;
  assert.deepEqual([book.done, book.total, book.progress, book.contribution], [1, 2, 50, 5]);
  // Shop: only Welding (40) and Fabrication Book (10) are measurable: (40 x 0.818 + 10 x 0.5) / 50 = 75.5 %.
  assert.equal(pooled.shop.percent, 75.5); assert.equal(pooled.shop.contribution, 37.7);
  // Field has nothing measurable: 0 % and it drops out, so the total is Shop's.
  assert.equal(pooled.field.percent, 0); assert.equal(pooled.total, 75.5); assert.equal(pooled.isometrics, 2);
});

test('with every activity measurable the phase percent is the sum of the contributions and the total is Shop 50 / Field 50', () => {
  const full = units({
    shop: { fitUp: [10, 10], welding: [5, 10], ndt: [0, 4], fabricationBook: [0, 1] },
    field: { erection: [10, 10], supports: [2, 4], welding: [10, 10], ndt: [4, 4], pressureTests: [1, 1], reinstatement: [1, 2], finalDocumentation: [0, 1] },
  });
  const result = progressFromUnits(full);
  const [shop, field] = result.phases;
  assert.deepEqual(shop.activities.map(item => item.contribution), [40, 20, 0, 0]); assert.equal(shop.percent, 60);
  assert.deepEqual(field.activities.map(item => item.contribution), [30, 5, 20, 10, 15, 2.5, 0]); assert.equal(field.percent, 82.5);
  assert.equal(result.total, 71.3); assert.deepEqual([shop.contribution, field.contribution], [30, 41.3]);
});

test('done is never counted above total, and broken values count nothing', () => {
  const pooled = projectProgress([{ units: units({ field: { supports: [12, 8] } }) }, { units: { shop: { welding: { done: Number.NaN, total: -3 } } } as unknown as ProgressUnits }]);
  assert.deepEqual([pooled.field.activities[1].done, pooled.field.activities[1].total, pooled.field.activities[1].progress], [8, 8, 100]);
  assert.equal(pooled.shop.activities[1].total, 0);
});

const weldTypes = [row('wt-shop', { location: 'Shop' }), row('wt-field', { location: 'Field' })];
const diameters = [row('d2', { sizeinch: 2 }), row('d8', { sizeinch: 8 })];
const weld = (id: string, isoId: string, data: Record<string, unknown> = {}) => row(id, { isoId, typeId: 'wt-shop', diameterId: 'd2', lengthMode: 'Diameter', ...data });

test('mainProjectProgress pools the server summaries of the non-archived isometrics, optionally of one subproject', () => {
  const isometrics = [row('big', { projectId: 'p1', prefabCompletedAt: '2026-11-01' }), row('small', { projectId: 'p2' }), row('old', { projectId: 'p1', _archived: true, prefabCompletedAt: '2026-11-01' })];
  const welds = [weld('w1', 'big', { diameterId: 'd8', welder1Id: 'x', date: '2026-11-01' }), weld('w2', 'small', {}), weld('w3', 'old', { diameterId: 'd8', welder1Id: 'x', date: '2026-11-01' })];
  const summaries = isoSummaries({ isometrics, projects: [row('p1'), row('p2')], sites: [], welds, weldTypes, diameters, results: [], releases: [], punch: [], requirements: null, planning: false });
  // The summary carries the units, and summaryProgress rebuilds exactly what isoProgress gives.
  const input = (iso: Row): IsoStatusInput => ({ iso, site: null, welds, weldTypes, diameters, results: [], releases: [], punch: [] });
  assert.deepEqual(summaryProgress(summaries.big), isoProgress(input(isometrics[0])));
  assert.equal(summaries.big.progress.total, isoProgress(input(isometrics[0])).total);
  const all = mainProjectProgress(isometrics, summaries);
  assert.equal(all.isometrics, 2, 'the archived isometric is left out');
  assert.deepEqual([all.shop.activities[1].done, all.shop.activities[1].total], [8, 10], 'welding: 8 of 8 + 2 inch');
  assert.deepEqual([all.shop.activities[3].done, all.shop.activities[3].total], [1, 2], 'Fabrication Book: one isometric of two');
  const p2 = mainProjectProgress(isometrics, summaries, { projectId: 'p2' });
  assert.equal(p2.isometrics, 1); assert.equal(p2.shop.activities[1].progress, 0);
  assert.equal(mainProjectProgress(isometrics, summaries, { isoIds: ['big'] }).shop.activities[1].progress, 100);
  // An isometric without a summary counts nothing.
  assert.equal(mainProjectProgress([row('none')], summaries).isometrics, 0);
});
