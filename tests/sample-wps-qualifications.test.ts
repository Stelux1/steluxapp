import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, SYSTEM } from '../server/store.ts';
import { seed, seedInspectionSamples } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { seedMtoDashboard } from '../server/mto-dashboard-seed.ts';
import { copyDemoProject, sampleSource } from '../server/demo-project.ts';
import { weldersForWps, welderWpsErrors } from '../shared/weld-entry.ts';
import { wpsValidation } from '../shared/site-settings.ts';
import { splitIds } from '../shared/welder-data.ts';
import type { Row } from '../shared/types.ts';

/**
 * SA2 N-D1: with "Validation on WPS" on, Add weld offers a welder for a WPS only when one of the welder's qualification
 * documents names that WPS. The sample documents named no WPS (or only the first), so no welder was offered for the
 * sample WPS. The rule stays; the sample documents now name the sample WPS their welder welds.
 */
const today = new Date().toISOString().slice(0, 10);
const welderFields = ['welder1Id', 'welder2Id', 'welder3Id', 'welder4Id'];
/** Every (welder, WPS) pair of the sample welds of a main project. */
function weldedPairs(store: Store, siteId: string) {
  const projects = new Set(store.list('projects').filter(p => p.siteId === siteId).map(p => p.id));
  const isos = new Set(store.list('isometrics').filter(i => projects.has(String(i.projectId))).map(i => i.id));
  const pairs = new Set<string>();
  for (const weld of store.list('welds')) if (isos.has(String(weld.isoId)) && weld.wpsId) for (const field of welderFields) if (weld[field]) pairs.add(`${weld[field]}|${weld.wpsId}`);
  return [...pairs].map(pair => pair.split('|'));
}

test('sample data: Add weld offers the sample welders for every sample WPS on a main project with Validation on WPS', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  seed(store, { hostedSample: true }); seedInspectionSamples(store); seedMtoLogistics(store, SYSTEM); seedMtoDashboard(store, SYSTEM);
  const site = store.get('sites', 'site-north'); assert.ok(wpsValidation(site), 'North has Validation on WPS on');
  const welders = store.list('welders'), certificates = store.list('welder_certificates');
  for (const wps of store.list('wps').filter(row => ['STX-WPS-141-01', 'STX-WPS-135-01'].includes(String(row.name)))) {
    const offered = weldersForWps(site, welders, certificates, wps, today).map(w => w.id);
    assert.ok(offered.length > 0, `a welder is offered for ${wps.name}`);
  }
  const offeredRobin = weldersForWps(site, welders, certificates, store.get('wps', 'wps-1'), today).map(w => String(w.name));
  assert.ok(offeredRobin.includes('Robin Lane'), 'the scenario: Robin Lane (WQ-2025-0310) is offered for STX-WPS-141-01');
  const pairs = weldedPairs(store, 'site-north'); assert.ok(pairs.length > 4);
  for (const [welderId, wpsId] of pairs) {
    const wps = store.get('wps', wpsId);
    assert.ok(weldersForWps(site, welders, certificates, wps, today).some(w => w.id === welderId), `${welderId} is offered for ${wps.name}`);
    assert.deepEqual(welderWpsErrors(site, { welder1Id: welderId, wpsId, date: today }, wps, id => certificates.filter(c => c.welderId === id), id => id, today), {}, `${welderId} may save a weld under ${wps.name}`);
  }
  // Only qualification documents name a WPS; a plain welder document does not.
  for (const document of certificates.filter(c => c.isDocument === true)) assert.equal(splitIds(document.wpsIds).length, 0);
});

test('demo project: the qualification documents keep naming the WPS, with the ids of the target workspace', t => {
  const source = sampleSource(); t.after(() => source.close());
  // A client workspace with welders and WPS of its own (other numbers): the sample welders, their documents and WPS are inserted as demo records.
  const target = new Store(':memory:'); t.after(() => target.close()); seed(target);
  for (const welder of target.list('welders')) target.update('welders', welder.id, { number: `CL-${welder.number}` }, welder._version, SYSTEM);
  for (const row of target.list('wps')) target.update('wps', row.id, { name: `CL-${row.name}` }, row._version, SYSTEM);
  const own = new Set(target.list('welder_certificates').map(row => row.id));
  const result = copyDemoProject(target, { dryRun: false, source });
  assert.equal(result.status, 'copied');
  const wps = new Map(target.list('wps').map(row => [row.id, row]));
  const documents = target.list('welder_certificates').filter((row: Row) => row.isDocument !== true && !own.has(row.id));
  assert.ok(documents.length > 0);
  for (const document of documents) {
    const ids = splitIds(document.wpsIds);
    assert.ok(ids.length > 0, `${document.name} names a WPS`);
    for (const id of ids) assert.ok(wps.has(id), `${document.name}: ${id} is a WPS of the target`);
  }
  const names = new Set(documents.flatMap(document => splitIds(document.wpsIds).map(id => String(wps.get(id)!.name))));
  assert.deepEqual([...names].sort(), ['STX-WPS-135-01', 'STX-WPS-141-01']);
  for (const document of documents) for (const id of splitIds(document.wpsIds)) assert.ok(id.startsWith('demo-'), `${document.name} names the demo copy ${id}, not the client's WPS`);
});
