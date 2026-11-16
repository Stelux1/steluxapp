import { runAction } from './workflows.ts';
import type { Actor, Store } from './store.ts';

/**
 * Sample data for the MTO Pilot dashboard (local sample workspace, runs once with the sample seed): an isometric
 * that is BLOCKED, one of its materials ordered but not yet delivered (blocking backorder) and one not ordered at all.
 * Stock is left untouched, so the other sample isometrics keep their status.
 */
export function seedMtoDashboard(store: Store, actor: Actor) {
  if (!store.list('isometrics', true).some(row => row.id === 'iso-10') || store.list('materials', true).some(row => row.id === 'material-dash-1')) return;
  const material = (id: string, data: Record<string, unknown>) => store.create('materials', { materialGroup: 'Valve', uom: 'EA', ...data }, actor, id);
  material('material-dash-1', { materialNo: 'SS-V300-2', description: 'Gate valve 2 in class 300, stainless steel 316L', dia: '2', lbs: 'CL300', articleNo: 'ART-3101', price: 412 });
  material('material-dash-2', { materialNo: 'SS-G300-2', description: 'Spiral wound gasket 2 in class 300, 316L / graphite', materialGroup: 'Gasket', dia: '2', lbs: 'CL300', articleNo: 'ART-3102', price: 9.6 });
  store.create('iso_materials', { isoId: 'iso-10', materialId: 'material-dash-1', quantity: 2, phaseId: 'phase-5' }, actor, 'requirement-dash-1');
  store.create('iso_materials', { isoId: 'iso-10', materialId: 'material-dash-2', quantity: 8, phaseId: 'phase-0' }, actor, 'requirement-dash-2');
  runAction(store, 'order-requirements', { requirementIds: ['requirement-dash-2'], supplierId: 'supplier-pipe', date: '2026-10-27', note: 'Gaskets for the skid manifold.' }, actor);
}
