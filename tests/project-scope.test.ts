import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { RESOURCES } from '../shared/resources.ts';
import { projectScope } from '../shared/project-scope.ts';
import { buildReport } from '../shared/reports.ts';

test('main-project scope follows subprojects through welds, inspections, and documents', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
  const siteId = String(rows.projects[0].siteId);
  const scoped = projectScope(rows, siteId);
  assert.ok(scoped.projects.length > 0);
  assert.ok(scoped.projects.every(project => project.siteId === siteId));
  assert.ok(scoped.isometrics.every(iso => scoped.projects.some(project => project.id === iso.projectId)));
  assert.ok(scoped.welds.every(weld => scoped.isometrics.some(iso => iso.id === weld.isoId)));
  assert.ok(scoped.inspection_results.every(result => scoped.welds.some(weld => weld.id === result.weldId)));
  assert.ok(scoped.attachments.every(file => scoped[String(file.entityType)]?.some(row => row.id === file.entityId)));
  assert.equal(scoped.materials, rows.materials);
  assert.equal(scoped.wps, rows.wps);
  assert.equal(projectScope(rows, ''), rows);
  assert.equal(projectScope(rows, 'missing-project').welds.length, 0);
  assert.ok(rows.projects.length > scoped.projects.length, 'fixture includes another main project');
});

test('LISL and WDI exports match main-project scope and NDT requirement filters', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
  const siteId = String(rows.projects[0].siteId);
  const scoped = projectScope(rows, siteId);
  for (const key of ['lisl', 'wdi', 'inspection-results']) {
    assert.deepEqual(buildReport(key, rows, { siteId }).rows, buildReport(key, scoped).rows);
  }
  for (const ndtRequired of ['yes', 'no']) {
    const report = buildReport('lisl', rows, { siteId, ndtRequired });
    assert.ok(report.rows.every(row => row.values['NDT Req#'] === (ndtRequired === 'yes' ? 'Yes' : 'No')));
    assert.equal(report.rows.length, scoped.welds.filter(weld => !weld._archived && Boolean(weld.ndoReq) === (ndtRequired === 'yes')).length);
  }
  assert.equal(buildReport('lisl', rows, { siteId: 'missing-project' }).rows.length, 0);
});
