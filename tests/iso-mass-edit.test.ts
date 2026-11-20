import test from 'node:test';
import assert from 'node:assert/strict';
import { ISO_OVERVIEW_FILTERS, ISO_OVERVIEW_PROJECT_COLUMN, FILTER_EMPTY, NO_OVERVIEW_FILTERS, filterOptions, matchesOverviewFilters, overviewColumns, overviewFilterCount } from '../shared/iso-overview.ts';
import { ISO_MASS_EDIT_EXCLUDED, isoMassEditChanges, isoMassEditFields, isoMassEditSubtitle } from '../shared/iso-mass-edit.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import type { Row } from '../shared/types.ts';

const iso = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data } as Row);

test('the all-isometrics page adds a Sub-project column after ISO; a single sub-project keeps the captured columns', () => {
  const all = overviewColumns(true), one = overviewColumns(false);
  assert.deepEqual(all.slice(0, 3).map(column => column.label), ['ISO', 'Sub-project', 'IRN']);
  assert.equal(all.length, one.length + 1);
  assert.ok(!one.some(column => column.key === ISO_OVERVIEW_PROJECT_COLUMN.key));
});

test('filters: ISO number contains, selects match exactly, flags are Yes / No, (empty) matches a missing value, filters combine', () => {
  const rows = [
    iso('a', { isoNo: 'L-100-A', projectId: 'p1', area: 'A1', pipingClass: 'B1', noBo: true, priority: 'Prio 1' }),
    iso('b', { isoNo: 'L-200-B', projectId: 'p2', area: '', pipingClass: 'B1', pwht: true }),
    iso('c', { isoNo: 'X-300', projectId: 'p1', area: 'A1', pipingClass: 'C2' }),
  ];
  const hit = (filters: Record<string, string>) => rows.filter(row => matchesOverviewFilters(row, filters)).map(row => row.id);
  assert.deepEqual(hit(NO_OVERVIEW_FILTERS), ['a', 'b', 'c']);
  assert.deepEqual(hit({ isoNo: 'l-' }), ['a', 'b']);
  assert.deepEqual(hit({ projectId: 'p1' }), ['a', 'c']);
  assert.deepEqual(hit({ projectId: 'p1', pipingClass: 'B1' }), ['a']);
  assert.deepEqual(hit({ area: FILTER_EMPTY }), ['b']);
  assert.deepEqual(hit({ noBo: 'yes' }), ['a']); assert.deepEqual(hit({ noBo: 'no' }), ['b', 'c']);
  assert.deepEqual(hit({ pwht: 'yes' }), ['b']);
  assert.deepEqual(hit({ priority: 'Prio 1' }), ['a']);
  assert.equal(overviewFilterCount({ isoNo: 'x', area: '', pwht: 'yes' }), 2);
});

test('select filters offer the distinct values of the rows, naturally sorted, plus (empty) when some row has none', () => {
  const rows = [iso('a', { revNo: '10' }), iso('b', { revNo: '2' }), iso('c', { revNo: '2' }), iso('d', {})];
  const def = ISO_OVERVIEW_FILTERS.find(item => item.key === 'revNo')!;
  assert.deepEqual(filterOptions(rows, def).map(option => option.label), ['2', '10', '(empty)']);
  assert.equal(filterOptions(rows, def).at(-1)!.value, FILTER_EMPTY);
  assert.deepEqual(filterOptions([iso('a', { projectId: 'p1' })], ISO_OVERVIEW_FILTERS.find(item => item.key === 'projectId')!, id => `Project ${id}`), [{ value: 'p1', label: 'Project p1' }]);
});

test('every filter is a field of the isometric input form', () => {
  const names = new Set(RESOURCE_MAP.isometrics.fields.map(field => field.name));
  for (const def of ISO_OVERVIEW_FILTERS) assert.ok(names.has(def.key), def.key);
  for (const key of ['isoNo', 'projectId', 'area', 'irn', 'pipingClass', 'itpNo', 'revNo', 'priority', 'testSystemId', 'ped', 'noBo', 'pwht']) assert.ok(ISO_OVERVIEW_FILTERS.some(def => def.key === key), key);
});

test('mass edit offers the editable input fields, never the ones the server refuses or hidden / read-only ones', () => {
  const fields = isoMassEditFields(RESOURCE_MAP.isometrics.fields), names = fields.map(field => field.name);
  for (const name of ISO_MASS_EDIT_EXCLUDED) assert.ok(!names.includes(name), name);
  assert.deepEqual(ISO_MASS_EDIT_EXCLUDED.filter(name => ['xRay', 'itpId', 'itp2Id', 'testSystemId'].includes(name)).sort(), ['itp2Id', 'itpId', 'testSystemId', 'xRay']);
  for (const name of ['irn', 'revNo', 'itpNo', 'pipingClass', 'priority', 'noBo', 'pwht', 'area', 'zone', 'description']) assert.ok(names.includes(name), name);
  assert.ok(fields.every(field => !field.hidden && !field.readonly && field.section !== 'Phases'));
});

test('mass edit sends only the filled fields: empty keeps, flags are three-state, numbers are numbers', () => {
  const fields = RESOURCE_MAP.isometrics.fields;
  assert.deepEqual(isoMassEditChanges(fields, {}), {});
  assert.deepEqual(isoMassEditChanges(fields, { irn: '  ', area: '', revNo: '' }), {});
  assert.deepEqual(isoMassEditChanges(fields, { area: ' A7 ', noBo: 'yes', pwht: 'no', ndtPercentage: '12,5', priority: 'Prio 2' }), { area: 'A7', noBo: true, pwht: false, ndtPercentage: 12.5, priority: 'Prio 2' });
  assert.deepEqual(isoMassEditChanges(fields, { priority: 'No priority' }), { priority: '' });
  // A field the server refuses is never sent, even when somebody supplies it.
  assert.deepEqual(isoMassEditChanges(fields, { xRay: '10', testSystemId: 'x', itpId: 'y', projectId: 'p', area: 'A1' }), { area: 'A1' });
});

test('the mass edit subtitle names the checked isometrics', () => {
  assert.equal(isoMassEditSubtitle(3), 'Only filled fields are changed on the 3 checked isometrics. Empty fields keep their current values.');
  assert.match(isoMassEditSubtitle(1), /1 checked isometric\./);
});
