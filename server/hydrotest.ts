import { HYDROTEST_RESULTS } from '../shared/hydrotest.ts';
import type { Row } from '../shared/types.ts';
import { AppError, validDate, type Actor, type Store } from './store.ts';

type Input = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
type Result = { resource: string; record?: Row; records?: Row[] };

/**
 * Transactional actions of the hydrotest release (`hydrotest-move`, `hydrotest-result`). The permission check
 * happens before this runs (`canAction`); this validates the records the action touches.
 */
export function runHydrotestAction(store: Store, key: string, data: Input, actor: Actor): Result {
  return store.transaction((): Result => {
    if (key === 'hydrotest-move') return moveIsometrics(store, data, actor);
    if (key === 'hydrotest-result') return recordResult(store, data, actor);
    throw new AppError(404, 'This action does not exist.');
  });
}

/** Assign isometrics to a test system. All or nothing; a test system of one project takes only that project's isometrics. */
function moveIsometrics(store: Store, data: Input, actor: Actor): Result {
  const ids = data.isoIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !id)) throw new AppError(422, 'Select at least one isometric.');
  const system = store.get('test_systems', data.testSystemId);
  const isometrics = [...new Set(ids as string[])].map(id => store.get('isometrics', id));
  const wrong = isometrics.filter(iso => system.projectId && iso.projectId !== system.projectId);
  if (wrong.length) throw new AppError(422, `${String(system.name)} belongs to another project than ${wrong.map(iso => String(iso.isoNo)).join(', ')}. Choose a test system of the same project.`, { testSystemId: 'Choose a test system of the isometrics’ project.' });
  const records = isometrics.map(iso => iso.testSystemId === system.id ? iso : store.update('isometrics', iso.id, { testSystemId: system.id }, iso._version, actor));
  return { resource: 'isometrics', records };
}

/**
 * Record the outcome of a hydrotest request. "Passed" completes the hydrotest of every isometric of the request's
 * test system (see `hydrotestState`); "Failed" is kept on the request and completes nothing.
 */
function recordResult(store: Store, data: Input, actor: Actor): Result {
  const request = store.get('hydrotest_requests', data.requestId);
  // The result completes every isometric of the test system; the store refuses it when one of them lies outside the
  // request's project site access (Store.guardTestSystem).
  const result = str(data.result);
  if (!HYDROTEST_RESULTS.includes(result)) throw new AppError(422, 'Choose Passed or Failed.', { result: 'Choose a result.' });
  const actualPressure = str(data.actualPressure);
  if (!actualPressure) throw new AppError(422, 'Enter the actual test pressure.', { actualPressure: 'Actual test pressure is required.' });
  if (!data.date) throw new AppError(422, 'Enter the test date.', { date: 'Date is required.' });
  const changes: Input = { result, actualPressure, date: validDate(data.date) };
  for (const name of ['testStart', 'testEnd', 'note']) if (str(data[name])) changes[name] = str(data[name]);
  const record = store.update('hydrotest_requests', request.id, changes, request._version, actor);
  return { resource: 'hydrotest_requests', record };
}

/**
 * Sample hydrotest data for the local workspace: acceptance per test system, a second and third test system with
 * their isometrics, and one passed request. Runs once; skips anything that is not in the sample seed.
 */
export function seedHydrotest(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_hydrotest_v1'").get()) return;
  const has = (key: string, id: string) => { try { store.get(key, id); return true; } catch { return false; } };
  store.transaction(() => {
    const system = store.get('test_systems', 'test-cw');
    store.update('test_systems', system.id, { accepted: 'Approved', description: 'Cooling water loop, hydrostatic test with potable water.' }, system._version);
    store.create('test_systems', { name: 'ST-01', projectId: 'project-steam', medium: 'Water', pressure: '24 bar', description: 'Steam condensate loop, tested before insulation.' }, undefined, 'test-st');
    store.create('test_systems', { name: 'SK-01', projectId: 'project-skid', medium: 'Water', pressure: '24 bar', accepted: 'Testing not applicable', description: 'Skid piping is pressure tested at the skid vendor.' }, undefined, 'test-sk');
    const assign = (isoId: string, testSystemId: string) => { if (has('isometrics', isoId)) { const iso = store.get('isometrics', isoId); store.update('isometrics', iso.id, { testSystemId }, iso._version); } };
    for (const id of ['iso-4', 'iso-5', 'iso-6']) assign(id, 'test-st');
    for (const id of ['iso-7', 'iso-8', 'iso-9', 'iso-10']) assign(id, 'test-sk');
    const qa = has('qa_engineers', 'qa-1') ? 'qa-1' : '';
    store.create('hydrotest_requests', {
      testSystemId: 'test-cw', recordNo: 'HTR-CW-01', engineerId: qa, date: '2026-10-26', pumpType: 'Electric hydrotest pump, 0–250 bar', hoseType: 'High-pressure hose, 350 bar rated', manifold: 'MF-02',
      gaugeNo: 'PG-1187', recorderNo: 'REC-044', calibrationCert: 'CAL-2026-0312', pipingClass: 'CS150', designCode: 'ASME B31.3', testMedium: 'Water',
      requiredPressure: '15 bar', actualPressure: '15.2 bar', testStart: '09:30', testEnd: '10:45', areaTemp: '14 °C', testDuration: '60 min',
      requiredLeakPressure: '5 bar', leakDuration: '30 min', includeIsometrics: true, result: 'Passed', note: 'No visible leaks, pressure held for the full duration.',
    }, undefined, 'hydrotest-cw-1');
    store.create('hydrotest_requests', { testSystemId: 'test-st', recordNo: 'HTR-ST-01', engineerId: qa, date: '2026-11-20', pipingClass: 'SS300', designCode: 'ASME B31.3', testMedium: 'Water', requiredPressure: '24 bar', includeIsometrics: true, note: 'Planned after the field welds are accepted.' }, undefined, 'hydrotest-st-1');
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_hydrotest_v1','1')").run();
  });
}
