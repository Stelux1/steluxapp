import { AppError, qty, type Actor, type Store } from './store.ts';
import type { Row } from '../shared/types.ts';
import { allocateStock, isoStatuses, planReserve, planStart } from '../shared/mto-logistics.ts';
import { runAction } from './workflows.ts';

type Input = Record<string, unknown>;
/** The helpers `runAction` hands to the actions of this flow: they share its transaction, date and note. */
export interface MtoActionContext {
  store: Store; actor: Actor; data: Input; date: string; note: string;
  ensure: (resource: string, id: unknown) => Row;
  add: (resource: string, input: Input) => Row;
  patch: (resource: string, row: Row, input: Input) => Row;
  balance: (tool: boolean, itemId: string, warehouseId: string, chargeNo: string, delta: number, custom?: boolean) => Row;
  movement: (tool: boolean, type: string, itemId: string, warehouseId: string, amount: number, extra?: Input, custom?: boolean) => Row;
}
const RESOURCES = ['isometrics', 'projects', 'iso_materials', 'materials', 'custom_materials', 'operation_phases', 'orders', 'order_lines', 'stock', 'picklists', 'reservations'];
const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(key => [key, store.list(key)])) as Record<string, Row[]>;
const refs = (requirement: Row) => ({ materialId: String(requirement.materialId || ''), customMaterialId: String(requirement.customMaterialId || '') });
const ids = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(item => typeof item !== 'string' || !item)) throw new AppError(422, `Select at least one ${label}.`);
  return [...new Set(value)] as string[];
};

/** Why an isometric has nothing to reserve or start (for the refusal message). */
function nothingBecause(rows: Record<string, Row[]>, isoId: string, verb: 'reserve' | 'start') {
  const status = isoStatuses(rows).get(isoId);
  if (!status?.lines.length) return 'This isometric has no material requirements.';
  if (status.lines.every(line => line.required - line.picked - line.claimed <= 0)) return 'Everything this isometric needs is already picked or on a pick list.';
  return verb === 'reserve' ? 'No free stock is available for the missing materials, or it is already reserved.' : 'None of the missing materials is in stock yet.';
}

export function runMtoLogisticsAction(key: string, context: MtoActionContext): { resource: string; record?: Row; records?: Row[] } {
  const { store, data, date, note, ensure, add, patch, balance, movement } = context;
  if (key === 'reserve-iso') {
    const iso = ensure('isometrics', data.isoId);
    const rows = rowsOf(store); const plan = planReserve(rows, iso.id);
    if (!plan.length) throw new AppError(409, nothingBecause(rows, iso.id, 'reserve'));
    const records = plan.map(({ requirement, quantity }) => {
      const current = rows.reservations.find(row => row.requirementId === requirement.id);
      if (current) return patch('reservations', current, { quantity: qty((current.status === 'Reserved' ? Number(current.quantity) : 0) + quantity), status: 'Reserved', date, note });
      return add('reservations', { isoId: iso.id, requirementId: requirement.id, ...refs(requirement), quantity, date, status: 'Reserved', note });
    });
    return { resource: 'reservations', records };
  }
  if (key === 'release-reservation') {
    const records = ids(data.reservationIds, 'reservation').map(id => {
      const row = ensure('reservations', id);
      if (row.status !== 'Reserved') throw new AppError(409, 'This reservation is already used or released.');
      return patch('reservations', row, { status: 'Released', note: [row.note, note].filter(Boolean).join(' · ') });
    });
    return { resource: 'reservations', records };
  }
  if (key === 'start-iso') {
    const iso = ensure('isometrics', data.isoId);
    const rows = rowsOf(store); const plan = planStart(rows, iso.id);
    if (!plan.length) throw new AppError(409, nothingBecause(rows, iso.id, 'start'));
    const reportNo = store.next('PL'); const lines: Row[] = [];
    for (const item of plan) {
      // Earlier lines of this pick list already claim stock: allocate from what the store holds now.
      const { parts, shortfall } = allocateStock(rowsOf(store), item.identity, item.quantity);
      if (shortfall > 0) throw new AppError(409, 'The available stock is spread over rows that other pick lists already claim. Try again after they are taken.');
      for (const part of parts) lines.push(add('picklists', { number: store.next('PICK'), reportNo, isoId: iso.id, ...refs(item.requirement), requirementId: item.requirement.id, warehouseId: part.stock.warehouseId, quantity: part.quantity, date, chargeNo: String(part.stock.chargeNo || ''), taken: false }));
      // The reservation is used up by what this pick list takes; a larger reservation keeps its remainder.
      const reservation = rows.reservations.find(row => row.requirementId === item.requirement.id && row.status === 'Reserved');
      if (reservation) { const left = qty(Number(reservation.quantity) - item.quantity); patch('reservations', reservation, left > 0 ? { quantity: left } : { status: 'Used', quantity: Math.min(Number(reservation.quantity), item.quantity) }); }
    }
    return { resource: 'picklists', records: lines };
  }
  if (key === 'take-picklist') {
    const reportNo = typeof data.reportNo === 'string' ? data.reportNo.trim() : '';
    const lines = store.list('picklists').filter(line => String(line.reportNo || line.number) === reportNo);
    if (!lines.length) throw new AppError(404, 'This pick list could not be found.');
    const open = lines.filter(line => line.taken === false);
    if (!open.length) throw new AppError(409, 'This pick list is already taken.');
    const records = open.map(line => {
      if (date < String(line.date)) throw new AppError(422, 'The taken date cannot be before the pick list date.');
      const custom = Boolean(line.customMaterialId); const item = String(custom ? line.customMaterialId : line.materialId);
      balance(false, item, String(line.warehouseId), String(line.chargeNo || ''), -Number(line.quantity), custom);
      movement(false, 'Issue', item, String(line.warehouseId), -Number(line.quantity), { isoId: String(line.isoId), requirementId: String(line.requirementId || ''), chargeNo: String(line.chargeNo || ''), note: `${line.number}${note ? ' · ' + note : ''}` }, custom);
      return patch('picklists', line, { taken: true, takenDate: date });
    });
    return { resource: 'picklists', records };
  }
  throw new AppError(404, 'This action does not exist.');
}


/**
 * Sample data for the local workspace: a Valves phase, field requirements that make the isometrics' material status
 * differ, a reservation, a pick list that is taken and one that is not, spool and material logistics. Runs once.
 */
export function seedMtoLogistics(store: Store, actor: Actor) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_mto_logistics_v1'").get()) return;
  const has = (key: string, id: string) => store.list(key, true).some(row => row.id === id);
  if (!has('isometrics', 'iso-1') || !has('warehouses', 'warehouse-main')) return;
  store.transaction(() => {
    const add = (key: string, id: string, data: Input) => { if (!has(key, id)) store.create(key, data, actor, id); };
    const run = (key: string, data: Input) => runAction(store, key, data, actor);
    add('operation_phases', 'phase-valves', { name: 'Valves', sort: 4 });
    add('warehouses', 'warehouse-yard', { name: 'Yard container 3', siteId: 'site-north', companyId: 'company-stelux', use: 'Materials', residence: 'Rotterdam' });
    add('service_companies', 'service-pwht', { name: 'Thermotech Heat Treatment', address: '22 Ketelweg', residence: 'Vlaardingen', phone: '+31 10 555 0187', email: 'planning@thermotech.example.com' });
    add('service_companies', 'service-blast', { name: 'Delta Blast & Paint', address: '3 Dokstraat', residence: 'Rotterdam', phone: '+31 10 555 0134', email: 'orders@deltablast.example.com' });
    add('laydowns', 'laydown-c', { name: 'Laydown C — Painted spools', siteId: 'site-north' });
    add('material_laydowns', 'mlaydown-rack-1', { name: 'Pipe rack 1' });
    add('material_laydowns', 'mlaydown-valves', { name: 'Valve cage' });
    // Gate valves, class 150 flanges, stud bolt sets and 316L pipe and elbows on top of the base requirements.
    add('iso_materials', 'requirement-field-1', { isoId: 'iso-1', materialId: 'material-6', quantity: 2, phaseId: 'phase-valves' });
    add('iso_materials', 'requirement-field-2', { isoId: 'iso-2', materialId: 'material-3', quantity: 6, phaseId: 'phase-1' });
    add('iso_materials', 'requirement-field-3', { isoId: 'iso-2', materialId: 'material-8', quantity: 24, phaseId: 'phase-1' });
    add('iso_materials', 'requirement-field-4', { isoId: 'iso-4', materialId: 'material-4', quantity: 30, phaseId: 'phase-0' });
    add('iso_materials', 'requirement-field-5', { isoId: 'iso-5', materialId: 'material-7', quantity: 10, phaseId: 'phase-0' });
    // Large field quantities that stock cannot fully cover: these isometrics fall in the 80–99 %, 70–79 % and below 70 % bands.
    add('iso_materials', 'requirement-field-6', { isoId: 'iso-4', materialId: 'material-4', quantity: 40, phaseId: 'phase-0' });
    add('iso_materials', 'requirement-field-7', { isoId: 'iso-6', materialId: 'material-5', quantity: 70, phaseId: 'phase-1' });
    add('iso_materials', 'requirement-field-8', { isoId: 'iso-8', materialId: 'material-3', quantity: 40, phaseId: 'phase-1' });
    for (const [materialId, quantity, chargeNo] of [['material-6', 3, 'H-2204'], ['material-8', 60, 'H-3310'], ['material-4', 18, 'H-1042'], ['material-7', 40, 'H-2951']] as const) run('adjust-material', { materialId, warehouseId: 'warehouse-yard', chargeNo, quantity, date: '2026-10-05', note: 'Sample opening balance' });
    // iso-2 reserves what it can (the three class 150 flanges in stock), iso-1 starts and is taken, iso-5 starts and waits to be taken.
    run('reserve-iso', { isoId: 'iso-2', date: '2026-10-22' });
    const first = run('start-iso', { isoId: 'iso-1', date: '2026-10-23' });
    const report = String('records' in first ? first.records?.[0]?.reportNo || '' : '');
    if (report) run('take-picklist', { reportNo: report, date: '2026-10-24' });
    run('start-iso', { isoId: 'iso-5', date: '2026-10-26' });
    // Treatments shown by the service request page, and requests in different states.
    const spool = (id: string, data: Input) => { const row = store.list('spools').find(item => item.id === id); if (row) store.update('spools', id, data, row._version, actor); };
    spool('spool-1', { chemicalClean: 'Acid pickling', pwht: false });
    spool('spool-2', { chemicalClean: 'Acid pickling', pwht: true, paintSpec: 'PS-04 epoxy 2 × 120 µm' });
    spool('spool-3', { chemicalClean: 'Degreasing', paintSpec: 'PS-02 zinc primer' });
    spool('spool-5', { chemicalClean: 'Passivation', pwht: false });
    run('service', { spoolIds: ['spool-2'], companyId: 'service-pwht', name: 'Stress relief batch 1', includeDrawings: true, date: '2026-10-21', note: 'Heat treatment per the procedure on the drawing.' });
    const blast = run('service', { spoolIds: ['spool-3'], companyId: 'service-blast', name: 'Blast and prime, week 43', date: '2026-10-17' });
    if ('records' in blast && blast.records?.[0]) run('complete-service', { requestIds: [blast.records[0].id], laydownId: 'laydown-c', date: '2026-10-22', note: 'Received, coating inspected.' });
    run('move-materials', { requirementIds: ['requirement-field-1'], laydownId: 'mlaydown-valves', date: '2026-10-22' });
    run('service-materials', { requirementIds: ['requirement-field-1'], companyId: 'service-blast', name: 'Valve body coating', date: '2026-10-25' });
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_mto_logistics_v1','1')").run();
  });
}
