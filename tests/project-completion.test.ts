import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyProgressUnits, PROGRESS_MODEL } from '../shared/progress-model.ts';
import { projectProgress } from '../shared/project-progress.ts';
import { COMPLETION_TEXTS, RING_CIRCUMFERENCE, nextTabIndex, percentText, pointsText, projectCompletion, ringSegments, weightsChip } from '../shared/project-completion.ts';
import { ProjectCompletionPanel, ProjectCompletionView, completionLoading } from '../client/project-completion.tsx';

/** The client's prototype figures: Shop MTO 85 / Welding 60 / NDT 45 / Fab book 20 (-> 64.5 %), Field erection 70 ... final docs 5. */
function units() {
  const u = emptyProgressUnits();
  const set = (phase: 'shop' | 'field', key: string, done: number, total: number) => { (u[phase] as Record<string, { done: number; total: number }>)[key] = { done, total }; };
  set('shop', 'fitUp', 85, 100); set('shop', 'welding', 60, 100); set('shop', 'ndt', 45, 100); set('shop', 'fabricationBook', 20, 100);
  set('field', 'erection', 70, 100); set('field', 'supports', 60, 100); set('field', 'welding', 50, 100); set('field', 'ndt', 35, 100); set('field', 'pressureTests', 20, 100); set('field', 'reinstatement', 10, 100); set('field', 'finalDocumentation', 5, 100);
  return u;
}

test('ring segments run clockwise, never past the full circle, and survive bad input', () => {
  const [a, b, rest] = ringSegments([{ key: 'shop', value: 32.3 }, { key: 'field', value: 22.3 }, { key: 'remaining', value: 45.4 }]);
  assert.deepEqual([a.from, Math.round(a.to * 10) / 10, rest.value], [0, 116.3, 45.4]);
  assert.ok(Math.abs(b.from - a.to) < 1e-9 && Math.abs(rest.to - 360) < 1e-9);
  assert.equal(a.dashOffset, 0); assert.ok(b.dashOffset < 0);
  const cut = ringSegments([{ key: 'x', value: 80 }, { key: 'y', value: 80 }, { key: 'z', value: Number.NaN }, { key: 'w', value: -5 }]);
  assert.deepEqual(cut.map(segment => segment.value), [80, 20, 0, 0]);
  assert.equal(ringSegments([{ key: 'x', value: 100 }])[0].dashArray, `${RING_CIRCUMFERENCE.toFixed(3)} 0.000`);
  assert.deepEqual(ringSegments([]), []);
});

test('labels: one decimal, no trailing zero, points of the weight', () => {
  assert.deepEqual([percentText(64.5), percentText(40), percentText(0), percentText(120), percentText(-3), percentText(Number.NaN)], ['64.5 %', '40 %', '0 %', '100 %', '0 %', '0 %']);
  assert.equal(pointsText(34, 40), '34 / 40 pp'); assert.equal(pointsText(3.5, 10), '3.5 / 10 pp');
  assert.deepEqual([nextTabIndex('ArrowRight', 1, 2), nextTabIndex('ArrowLeft', 0, 2), nextTabIndex('Home', 1, 2), nextTabIndex('End', 0, 2), nextTabIndex('a', 0, 2), nextTabIndex('ArrowRight', 0, 0)], [0, 1, 0, 1, null, null]);
});

test('the view model comes from the aggregate: total, two phase shares, remainder, activities with weight and contribution', () => {
  const view = projectCompletion(projectProgress([{ units: units() }]));
  assert.equal(view.empty, false); assert.equal(view.isometrics, 1);
  assert.deepEqual(view.phases.map(phase => [phase.key, phase.percent, phase.ringValue, phase.weightsLabel]), [['shop', 64.5, 32.3, 'Weights total: 100 %'], ['field', 44.5, 22.3, 'Weights total: 100 %']]);
  assert.equal(view.total, 54.5); assert.equal(view.totalLabel, '54.5 %');
  assert.deepEqual(view.ring.map(segment => segment.key), ['shop', 'field', 'remaining']);
  assert.ok(Math.abs(view.ring.reduce((sum, segment) => sum + segment.value, 0) - 100) < 0.2);
  assert.equal(view.legend, 'Prefabrication (Shop) 64.5 % · Erection (Field) 44.5 %'); assert.equal(view.distribution, 'Prefabrication 50 % / Erection 50 %');
  const fit = view.phases[0].activities[0];
  assert.deepEqual([fit.label, fit.percentLabel, fit.weightLabel, fit.contributionLabel], ['MTO / Cut-Bev / Fit-up', '85 %', 'Weight in phase: 40 %', 'Contribution: 34 / 40 pp']);
  assert.equal(view.phases[1].activities.length, PROGRESS_MODEL.phases[1].activities.length);
  assert.match(view.ringLabel, /Project completion 54\.5 %.*Prefabrication \(Shop\) 64\.5 % complete.*Erection \(Field\) 44\.5 % complete/);
});

test('an activity that cannot be measured shows a dash and a reason, never 0 %; a phase that cannot be measured drops out of the ring', () => {
  const u = emptyProgressUnits(); u.shop.fitUp = { done: 5, total: 10 }; u.shop.welding = { done: 5, total: 10 }; u.shop.fabricationBook = { done: 1, total: 1 };
  const view = projectCompletion(projectProgress([{ units: u }]));
  const ndt = view.phases[0].activities.find(card => card.key === 'ndt')!;
  assert.deepEqual([ndt.measurable, ndt.percentLabel, ndt.reason, ndt.contributionLabel], [false, '—', 'No Shop weld needs NDT.', 'Contribution: — / 10 pp']);
  assert.ok(ndt.summary.includes('no figure yet'));
  // Field has nothing at all: it is 0 %, outside the total, and the Shop segment alone fills the share of the total.
  assert.deepEqual([view.phases[1].counted, view.phases[1].ringValue, view.phases[0].ringValue], [false, 0, view.total]);
  assert.ok(view.phases[1].activities.every(card => !card.measurable && card.percentLabel === '—'));
});

test('an empty project reads 0 % without errors or NaN and says so', () => {
  const view = projectCompletion(projectProgress([]));
  assert.deepEqual([view.empty, view.total, view.totalLabel, view.ring.map(segment => segment.value)], [true, 0, '0 %', [0, 0, 100]]);
  const html = renderToStaticMarkup(createElement(ProjectCompletionPanel, { progress: projectProgress([]) }));
  assert.ok(html.includes(COMPLETION_TEXTS.empty) && html.includes('0 %')); assert.ok(!/NaN|undefined/.test(html));
});

test('the section renders accessibly: eyebrow, one total ring with a label, tabs with a panel, weights chip, activity cards', () => {
  const html = renderToStaticMarkup(createElement(ProjectCompletionPanel, { progress: projectProgress([{ units: units() }]) }));
  assert.ok(html.includes('MAIN PROJECT · ALL SUB-PROJECTS') && html.includes('Project completion'));
  assert.match(html, /role="img" aria-label="Project completion 54\.5 %\./);
  assert.match(html, /role="tablist"[^>]*aria-label="Project completion by phase"/);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*tabindex="0"[^>]*>Prefabrication</); assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*tabindex="-1"[^>]*>Erection</);
  assert.match(html, /role="tabpanel"/); assert.ok(html.includes('Weights total: 100 %') && html.includes('Weight in phase: 40 %') && html.includes('Contribution: 34 / 40 pp'));
  assert.equal((html.match(/class="pc-activity /g) || []).length, 4);
  const field = renderToStaticMarkup(createElement(ProjectCompletionView, { view: projectCompletion(projectProgress([{ units: units() }])), initialPhase: 'field' }));
  assert.equal((field.match(/class="pc-activity /g) || []).length, 7); assert.ok(field.includes('Spools erection / Fit-up') && field.includes('Final documentation'));
});

test('loading and error states replace the figures', () => {
  const loading = renderToStaticMarkup(createElement(ProjectCompletionPanel, { progress: null, loading: true }));
  assert.ok(loading.includes(COMPLETION_TEXTS.loading) && loading.includes('role="status"') && loading.includes('aria-busy="true"') && !loading.includes('role="tablist"'));
  const failed = renderToStaticMarkup(createElement(ProjectCompletionPanel, { progress: null, error: 'Project progress could not be calculated.' }));
  assert.ok(failed.includes('role="alert"') && failed.includes('could not be calculated'));
  assert.ok(renderToStaticMarkup(createElement(ProjectCompletionPanel, { progress: null })).includes(COMPLETION_TEXTS.unavailable));
  // B3: isometrics present, summaries not yet: the pilots profile is loading (it always sends them), never "not available".
  assert.equal(completionLoading(false, true, true), true); assert.equal(completionLoading(false, false, true), true); assert.equal(completionLoading(true, true, true), false);
  assert.equal(completionLoading(false, true, false), false, 'other profiles without summaries: not available'); assert.equal(completionLoading(false, false, false), true);
});

test('B3: a card that cannot be measured says it is not counted, and the chip names the weights that count', () => {
  const u = units(); u.field.supports = { done: 0, total: 0 };
  const view = projectCompletion(projectProgress([{ units: u }])), field = view.phases[1], supports = field.activities.find(card => card.key === 'supports')!;
  assert.deepEqual([supports.measurable, supports.reason, supports.countNote], [false, 'No supports in the MTO.', 'Not counted — the other weights are scaled up.']);
  const weight = PROGRESS_MODEL.phases[1].activities.find(activity => activity.key === 'supports')!.weight;
  assert.equal(field.weightsLabel, `Weights counted: ${percentText(100 - weight)} of 100 %`);
  assert.equal(view.phases[0].weightsLabel, 'Weights total: 100 %', 'a phase with every activity measured keeps the plain total');
  assert.equal(view.phases[0].activities[0].countNote, '');
  // The contributions of the counted cards, scaled to the counted weights, give the phase %.
  const counted = field.activities.filter(card => card.measurable), points = counted.reduce((sum, card) => sum + card.percent * PROGRESS_MODEL.phases[1].activities.find(activity => activity.key === card.key)!.weight / 100, 0);
  assert.ok(Math.abs(points / (100 - weight) * 100 - field.percent) < 0.2);
  assert.equal(weightsChip([{ weight: 60, inScope: true }, { weight: 30, inScope: true }, { weight: 10, inScope: false }]), 'Weights counted: 90 % of 100 %');
  const html = renderToStaticMarkup(createElement(ProjectCompletionView, { view, initialPhase: 'field' }));
  assert.ok(html.includes('Not counted — the other weights are scaled up.') && html.includes('Weights counted: '));
  // A phase with nothing measurable leaves the total; its cards say so.
  const empty = emptyProgressUnits(); empty.shop.fitUp = { done: 1, total: 2 };
  assert.equal(projectCompletion(projectProgress([{ units: empty }])).phases[1].activities[0].countNote, COMPLETION_TEXTS.phaseOut);
});
