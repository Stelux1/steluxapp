import { Store, SYSTEM } from './store.ts';
import { inspectionRules } from './inspections.ts';

/**
 * Sample NDT, repair, tracer, visual and Pre-HT / PWHT records for the local sample workspace of the hosted profile
 * (on top of `seed()`; never called for a connected database). Runs once and skips itself when the sample welds
 * it builds on are missing.
 */
export function seedInspectionSamples(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_inspections_v1'").get()) return;
  const has = (key: string, id: string) => { try { store.get(key, id); return true; } catch { return false; } };
  const needed: [string, string[]][] = [['welds', [1, 2, 5, 10, 11, 13, 15, 19, 20, 22, 23, 24].map(i => `weld-${i}`)], ['ndt_processes', ['ndt-0', 'ndt-1', 'ndt-3']], ['ndt_locations', ['ndt-shop']], ['pwht_processes', ['pwht-1']], ['pwht_locations', ['pwht-shop']], ['qa_engineers', ['qa-1']]];
  if (!needed.every(([key, list]) => list.every(id => has(key, id)))) return;
  store.transaction(() => {
    const rules = inspectionRules(store, SYSTEM);
    const set = (id: string, data: Record<string, unknown>) => store.update('welds', id, data, store.get('welds', id)._version, SYSTEM);
    if (!has('ndt_locations', 'ndt-field')) store.create('ndt_locations', { name: 'Field NDT cabin — Area 2' }, SYSTEM, 'ndt-field');
    // W005: RT not accepted with porosity over 14 mm; the repair weld W005R1 is welded but not examined yet.
    rules.run('ndt-weld', { weldId: 'weld-5', type: 'NDT', locationId: 'ndt-shop', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-005-01', reportNo: 'RT-2026-005', date: '2026-10-20', result: 'Rejected', naLength: 14, defectType: '201' }] });
    // An NA no longer creates the repair weld (weld-inspections-009): the sample adds it the way the repair action does.
    rules.ensureRepair(store.get('welds', 'weld-5'));
    const w005r1 = store.list('welds').find(row => row.repairOfId === 'weld-5');
    if (w005r1) set(w005r1.id, { welder1Id: 'welder-2', datefit: '2026-10-22', date: '2026-10-23', wire1Id: has('welding_wires', 'wire-3') ? 'wire-3' : 'wire-1' });
    // Sample tracers flagged by hand (outside the welder / WPS / ITP-KNR proposal, like the reference's tracers without source).
    const trace = (sourceId: string, ids: string[]) => { for (const id of ids) set(id, { tracer: true, tracerOfId: sourceId, ndoReq: true }); };
    trace('weld-5', ['weld-13', 'weld-7']);
    // W011: RT not accepted with slag; repair weld W011R1 re-examined and accepted, two tracers of the same welder.
    rules.run('ndt-weld', { weldId: 'weld-11', type: 'NDT', locationId: 'ndt-shop', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-011-01', reportNo: 'RT-2026-011', date: '2026-10-20', result: 'Rejected', naLength: 22, defectType: '301' }] });
    rules.ensureRepair(store.get('welds', 'weld-11'));
    const w011r1 = store.list('welds').find(row => row.repairOfId === 'weld-11');
    if (w011r1) {
      set(w011r1.id, { welder1Id: 'welder-4', datefit: '2026-10-21', date: '2026-10-22', wire1Id: 'wire-1' });
      rules.run('ndt-weld', { weldId: w011r1.id, type: 'NDT', locationId: 'ndt-shop', rounds: [{ round: 'Initial', processId: 'ndt-0', filmNo: 'F-011R1-01', reportNo: 'RT-2026-031', date: '2026-10-24', result: 'Accepted' }] });
    }
    trace('weld-11', ['weld-15', 'weld-23']);
    // NDT Pre (MT before the final pass) on three field welds of the steam network.
    for (const id of ['weld-20', 'weld-22', 'weld-24']) set(id, { ndoReqPre: true, ndtPreLocationId: 'ndt-field', ndtPreProcess1Id: 'ndt-3' });
    rules.run('ndt-weld', { weldId: 'weld-20', type: 'NDT PRE', locationId: 'ndt-field', welderId: 'welder-1', rounds: [{ round: 'Initial', processId: 'ndt-3', reportNo: 'MT-2026-020', date: '2026-10-18', result: 'Accepted' }] });
    rules.run('mass-inspection-request', { type: 'NDT PRE', weldIds: ['weld-22', 'weld-24'], processIds: ['ndt-3'], locationId: 'ndt-field', date: '2026-10-22', note: 'Magnetic particle test of the root and hot pass before capping.' });
    rules.run('mass-inspection-request', { type: 'NDT', weldIds: ['weld-22', 'weld-23', 'weld-24'], processIds: ['ndt-0', 'ndt-1'], locationId: 'ndt-field', date: '2026-10-23', note: 'Radiography of the field closing welds; UT where film access is limited.' });
    // Pre-HT and PWHT: W002 preheated and treated; W020 waits for its PWHT request.
    set('weld-2', { pwhtReqPre: true, pwhtPreLocationId: 'pwht-shop', pwhtPreProcessId: 'pwht-1' });
    rules.run('pwht-upload', { weldIds: ['weld-2'], preReportNo: 'PHT-2026-002', checked: true, date: '2026-10-18' });
    set('weld-20', { pwhtReq: true, pwhtLocationId: 'pwht-shop', pwhtProcessId: 'pwht-1' });
    rules.run('mass-inspection-request', { type: 'PWHT', weldIds: ['weld-20'], pwhtProcessId: 'pwht-1', pwhtLocationId: 'pwht-shop', date: '2026-10-24', note: 'Heat treatment cycle as specified in the WPS; chart recorder required.' });
    // One visual report on the first cooling-water isometric.
    rules.run('visual-inspection', { weldIds: ['weld-1', 'weld-10', 'weld-19'], accepted: ['weld-1', 'weld-10'], notApplicable: ['weld-19'], itp: 'ITP 1', activityNo: '4.2', engineerId: 'qa-1', customNo: 'NFY-VT-07', reportNo: 'VT-2026-014', date: '2026-10-21' });
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_inspections_v1','1')").run();
  });
}
