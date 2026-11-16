import test from 'node:test';
import assert from 'node:assert/strict';
import { ISO_OVERVIEW_COLUMNS, ISO_OVERVIEW_DEFAULT_SORT, ISO_OVERVIEW_MENUS, ISO_OVERVIEW_PAGE, ISO_OVERVIEW_TITLE, ISO_ROW_ACTIONS, cellText, overviewValue, priorityNumber, qaBadges, qaCounts, sortOverview, startedFlags, startedRank, statusText } from '../shared/iso-overview.ts';
import { isoSummaries } from '../shared/iso-summary.ts';
import type { Row } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data } as Row);

test('the project Iso overview has the captured title, columns, menus and row options', () => {
  assert.equal(ISO_OVERVIEW_TITLE, 'Iso overview');
  // weld__welding__project-isometrics.txt:1097-1098 (the same in mto__projects__project-isometrics.txt:58): the check-all box is the selection column.
  assert.deepEqual(ISO_OVERVIEW_COLUMNS.map(column => column.label), ['ISO', 'IRN', 'Rev. no.', 'ITP No', 'Asset tag', 'Piping class', 'Drawing no. 1', 'NoBo', 'X Ray %', 'QA', 'PWHT', 'Priority', 'Status', 'Started', 'Options']);
  assert.deepEqual(ISO_OVERVIEW_COLUMNS.filter(column => !column.sortable).map(column => column.label), ['QA', 'Options']);
  assert.deepEqual(ISO_OVERVIEW_MENUS.Reports, ['Weld card', 'Weld labels']);
  assert.deepEqual(ISO_OVERVIEW_MENUS.Options, ['Delete all isometrics', 'Delete selected isometrics', 'Edit isometrics (Mass edit)', 'Set ITP', 'Set phase (Mass)', 'Generate Iso book', 'Generate grouped Iso book', "Show deleted ISO's", 'Copy selected isometrics']);
  assert.deepEqual(ISO_OVERVIEW_MENUS.Add, ['Add isometric', 'Import calculations from Isometric', "Undo last calculation's import"]);
  assert.deepEqual([...ISO_ROW_ACTIONS], ['Open', 'Print', 'Iso overview', 'Punch list', 'Edit isometric', 'Delete']);
});

const weld = (id: string, data: Record<string, unknown> = {}) => row(id, { isoId: 'iso', ...data });
const result = (weldId: string, type: string, outcome: string) => row(`${weldId}-${type}`, { weldId, type, result: outcome });
const latestOf = (results: Row[]) => (weldId: string, type: string) => results.find(item => item.weldId === weldId && item.type === type);

test('QA badges count the open VI / NDT / PWHT examinations of an isometric; "ok" when all are accepted, "n.v.t." when none applies', () => {
  const welds = [weld('w1', { ndoReq: true, pwhtReq: true }), weld('w2', { ndoReq: true }), weld('w3', { ndoReq: true, ndoReqPre: true, pwhtReqPre: true }), weld('w4', { _archived: true, ndoReq: true })];
  const results = [result('w1', 'VI', 'Accepted'), result('w2', 'VI', 'Rejected'), result('w1', 'NDT', 'Accepted'), result('w2', 'NDT', 'Rejected'), result('w3', 'NDT PRE', 'Accepted'), result('w1', 'PWHT', 'Accepted')];
  const badges = qaBadges(qaCounts(welds, latestOf(results)));
  assert.deepEqual(badges.map(badge => [badge.label, badge.state, badge.open, badge.title]), [
    ['VI', 'open', 2, 'VI: 2 open'],            // every weld needs a visual inspection: w2 was rejected, w3 has no result (the archived weld does not count)
    ['Pre', 'ok', 0, 'Pre: ok'],                // the one weld that requires NDT PRE is accepted
    ['NDT', 'open', 2, 'NDT: 2 open'],          // w2 rejected, w3 without a result
    ['PWHT', 'open', 1, 'PWHT: 1 open'],        // w1 accepted; w3's Pre-HT has no result
  ]);
  // Nothing applies to an isometric without welds, nor to one whose welds require nothing beyond a visual inspection.
  assert.deepEqual(qaBadges(qaCounts([], latestOf([]))).map(badge => badge.title), ['VI: n.v.t.', 'Pre: n.v.t.', 'NDT: n.v.t.', 'PWHT: n.v.t.']);
  assert.deepEqual(qaBadges(qaCounts([weld('w9')], latestOf([result('w9', 'VI', 'Accepted')]))).map(badge => badge.state), ['ok', 'na', 'na', 'na']);
  // A later result replaces an earlier one: the badge reads the latest result of each weld and type.
  assert.equal(qaBadges(qaCounts([weld('w1', { ndoReq: true })], latestOf([result('w1', 'NDT', 'Accepted')])))[2].state, 'ok');
  // The summary of the server (what both pilots read) carries the same counts.
  assert.deepEqual(qaBadges(null).map(badge => badge.state), ['na', 'na', 'na', 'na']);
  const summaries = isoSummaries({ isometrics: [row('iso', { projectId: 'p', isoNo: '0001' })], projects: [row('p', { siteId: 's' })], sites: [row('s')], welds, weldTypes: [], diameters: [], results, releases: null, punch: null, requirements: null, planning: false });
  assert.deepEqual(summaries.iso.qa, qaCounts(welds, latestOf(results)));
  const unreadable = isoSummaries({ isometrics: [row('iso', { projectId: 'p' })], projects: [], sites: [], welds: null, weldTypes: null, diameters: null, results: null, releases: null, punch: null, requirements: null, planning: false });
  assert.equal(unreadable.iso.qa, null);
});

test('Status shows one decimal, Started links carry the reference tooltips, Priority is its number', () => {
  assert.deepEqual([statusText(0), statusText(72.66), statusText(100), statusText(null), statusText(undefined)], ['0.0%', '72.7%', '100.0%', '—', '—']);
  assert.deepEqual(startedFlags({ m: true, e: false, w: true }).map(flag => [flag.letter, flag.title]), [['M', 'ISO has been started'], ['E', 'ISO has not calculations'], ['W', 'ISO has welds']]);
  assert.deepEqual(startedFlags({ m: false, e: true, w: false }).map(flag => flag.title), ['ISO has not been started', 'ISO has calculations', 'ISO has no welds']);
  assert.deepEqual(startedFlags({ m: true, e: null, w: null }, false).map(flag => flag.letter), ['M', 'W']);     // no calculations delivered: no E
  assert.deepEqual([startedRank(null), startedRank({ m: true, e: false, w: false }), startedRank({ m: true, e: true, w: true })], [0, 1, 7]);
  assert.deepEqual(['Prio 1', 'Prio 5', 'No priority', '', 'Critical', 'Low'].map(priorityNumber), [1, 5, 0, 0, 1, 4]);
  assert.deepEqual([cellText('A11011'), cellText(''), cellText(undefined)], ['A11011', '-', '-']);
});

test('the list is ordered by Started with 20 rows a page, and every column sorts by what it shows', () => {
  assert.deepEqual(ISO_OVERVIEW_DEFAULT_SORT, { field: 'started', direction: 1 });
  assert.equal(ISO_OVERVIEW_PAGE.initial, 20);
  assert.deepEqual(ISO_OVERVIEW_PAGE.sizes, [10, 20, 50, 100, 500]);
  const flags = (m: boolean, e: boolean, w: boolean) => ({ progress: { total: 0 }, flags: { m, e, w } });
  const isos = [row('a', { isoNo: '0010' }), row('b', { isoNo: '0002' }), row('c', { isoNo: '0001' }), row('d', { isoNo: '0003' })];
  const summaries: Record<string, ReturnType<typeof flags>> = { a: flags(true, true, true), b: flags(false, false, false), c: flags(false, false, true), d: flags(false, false, false) };
  const value = (iso: Row, key: string) => overviewValue(iso, key, summaries[iso.id]);
  // Nothing started first; isometrics that tie come in ISO order (numbers by value, so 0002 before 0010).
  assert.deepEqual(sortOverview(isos, value, 'started', 1).map(iso => iso.id), ['b', 'd', 'c', 'a']);
  assert.deepEqual(sortOverview(isos, value, 'started', -1).map(iso => iso.id), ['a', 'c', 'b', 'd']);
  assert.deepEqual(sortOverview(isos, value, 'isoNo', 1).map(iso => iso.id), ['c', 'b', 'd', 'a']);
  // 45 isometrics: the first page holds 20.
  const many = Array.from({ length: 45 }, (_, index) => row(`i${index}`, { isoNo: String(index) }));
  assert.equal(sortOverview(many, value, ISO_OVERVIEW_DEFAULT_SORT.field, ISO_OVERVIEW_DEFAULT_SORT.direction).slice(0, ISO_OVERVIEW_PAGE.initial).length, 20);
  assert.deepEqual([overviewValue(row('x', { noBo: true, pwht: false, xRay: '14%', priority: 'Prio 2' }), 'noBo'), overviewValue(row('x', { xRay: '14%' }), 'xRay'), overviewValue(row('x', { priority: 'Prio 2' }), 'priority'), overviewValue(row('x'), 'status', { progress: { total: 12.34 }, flags: { m: null, e: null, w: null } })], [1, 14, 2, 12.34]);
});
