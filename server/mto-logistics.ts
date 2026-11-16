import type { Express } from 'express';
import ExcelJS from 'exceljs';
import { AppError, qty, type Actor, type Store } from './store.ts';
import type { AuthRequest } from './auth.ts';
import { EXPORT_TABLES, areaRight } from '../shared/export-tables.ts';
import type { Availability, Row } from '../shared/types.ts';
import { PICKLIST_NOTE_MAX, START_FROM_PERCENT, allocateStock, canStartAt, isoStatuses, pickIssued, planReserve, planStart, startedPhases, undoRefusal } from '../shared/mto-logistics.ts';
import { materialIdentity, materialRecord } from '../shared/materials.ts';
import { isSiteStock } from '../shared/mto-stock.ts';
import { runAction } from './workflows.ts';
import { changeSiteStock, siteOfIso, takeFromSite } from './mto-stock.ts';

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
const RESOURCES = ['isometrics', 'projects', 'iso_materials', 'materials', 'custom_materials', 'operation_phases', 'orders', 'order_lines', 'stock', 'warehouses', 'picklists', 'reservations'];const rowsOf = (store: Store) => Object.fromEntries(RESOURCES.map(key => [key, store.list(key)])) as Record<string, Row[]>;
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
      return add('reservations', { isoId: iso.id, requirementId: requirement.id, ...refs(requirement), siteId: siteOfIso(store, iso.id), quantity, date, status: 'Reserved', note });
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
    const phaseId = text(data.phaseId);
    if (phaseId) ensure('operation_phases', phaseId);
    const pickNote = noteOf(data.note);
    const rows = rowsOf(store);
    // Start is offered from a Mat.status of 70 % (of the Type shown on the board, else of the whole isometric).
    const percent = isoStatuses(rows, phaseId ? { isoId: iso.id, phaseId } : { isoId: iso.id }).get(iso.id)?.percent ?? null;
    if (percent === null) throw new AppError(409, phaseId ? 'This isometric has no materials of this type.' : 'This isometric has no material requirements.');
    if (!canStartAt(percent)) throw new AppError(409, `Start is possible from a material status of ${START_FROM_PERCENT} %. This isometric is at ${percent} %.`);
    if (phaseId && startedPhases(rows, iso.id).has(phaseId)) throw new AppError(409, 'This isometric is already started for this type. Undo its execution in the Pick List archive to start it again.');
    const plan = planStart(rows, iso.id);
    if (!plan.length) throw new AppError(409, nothingBecause(rows, iso.id, 'start'));
    const siteId = siteOfIso(store, iso.id);
    if (!siteId) throw new AppError(422, 'The isometric’s project belongs to no project site, so there is no Material inventory to take from.');
    // Pick List No.: five digits, as the reference's Pick List archive ("00001"); one counter for the workspace.
    const reportNo = String(store.next('PL').split('-').pop()).padStart(5, '0'); const lines: Row[] = [];
    const logText = `Isometric execution ${iso.isoNo} | Pick List ${reportNo}`;
    for (const item of plan) {
      // The source is the isometric's project site's Material inventory; one pick line per requirement line. Older
      // pick lists that are not taken yet still hold their quantities, so this one may only use what is left.
      const { shortfall } = allocateStock(rowsOf(store), siteId, item.identity, item.quantity);
      if (shortfall > 0) throw new AppError(409, 'Other pick lists already claim this stock. Try again after they are taken.');
      const material = materialRecord(rows, item.requirement);
      // delta-I3-R1: Start books the issue at once, charge by charge in charge order (Material log "Isometric execution
      // <ISO> | Pick List <no>"); the pick list stays "Taken? No" until the take is confirmed.
      const parts = takeFromSite(store, context.actor, siteId, refs(item.requirement), item.quantity, String(material?.materialNo || 'material'), true);
      const charges = [...new Set(parts.map(part => String(part.row.chargeNo || '')))];
      lines.push(add('picklists', { number: store.next('PICK'), reportNo, isoId: iso.id, ...refs(item.requirement), requirementId: item.requirement.id, warehouseId: '', siteId, quantity: item.quantity, date, chargeNo: charges.length === 1 ? charges[0] : '', taken: false, issued: true, note: pickNote, phaseId }));
      for (const part of parts) add('movements', { number: store.next('MM'), ...refs(item.requirement), warehouseId: part.warehouseId, siteId, quantity: -part.quantity, type: 'Issue', date, chargeNo: String(part.row.chargeNo || ''), isoId: iso.id, requirementId: item.requirement.id, note: logText, pickListNo: reportNo });
      // The reservation is used up by what this pick list takes; a larger reservation keeps its remainder.
      const reservation = rows.reservations.find(row => row.requirementId === item.requirement.id && row.status === 'Reserved');
      if (reservation) { const left = qty(Number(reservation.quantity) - item.quantity); patch('reservations', reservation, left > 0 ? { quantity: left } : { status: 'Used', quantity: Math.min(Number(reservation.quantity), item.quantity) }); }
    }
    store.audit('isometrics', iso.id, 'started', `Started: Pick List ${reportNo}${pickNote ? ' · ' + pickNote : ''}`, context.actor);
    return { resource: 'picklists', records: lines };
  }
  if (key === 'take-picklist') {
    const lines = reportLines(store, data.reportNo);
    // In the order the lines were written (requirement order), so the charges are drawn the same way every time.
    const open = lines.filter(line => line.taken === false && line.returned !== true).sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)) || String(a.number).localeCompare(String(b.number)));
    if (!open.length) throw new AppError(409, 'This pick list is already taken.');
    const given = data.note === undefined ? undefined : noteOf(data.note);
    const records = open.map(line => {
      if (date < String(line.date)) throw new AppError(422, 'The taken date cannot be before the pick list date.');
      const confirmed = { taken: true, takenDate: date, ...(given === undefined ? {} : { note: given }) };
      // Booked out at Start: confirming the take is a sign-off, the stock does not move again.
      if (line.issued === true) return patch('picklists', line, confirmed);
      const custom = Boolean(line.customMaterialId); const item = String(custom ? line.customMaterialId : line.materialId);
      const extra = { isoId: String(line.isoId), requirementId: String(line.requirementId || ''), note: `${line.number}${note ? ' · ' + note : ''}`, pickListNo: String(line.reportNo || '') };
      if (line.warehouseId) {
        // A pick line written before the site inventories existed takes from its storehouse line.
        balance(false, item, String(line.warehouseId), String(line.chargeNo || ''), -Number(line.quantity), custom);
        movement(false, 'Issue', item, String(line.warehouseId), -Number(line.quantity), { ...extra, chargeNo: String(line.chargeNo || '') }, custom);
      } else {
        // A pick list written before Start issued stock: it issues now, as it always did.
        const siteId = String(line.siteId || '') || siteOfIso(store, line.isoId);
        const parts = takeFromSite(store, context.actor, siteId, refs(line), Number(line.quantity), 'material', true);
        for (const part of parts) add('movements', { number: store.next('MM'), ...refs(line), warehouseId: part.warehouseId, siteId, quantity: -part.quantity, type: 'Issue', date, chargeNo: String(part.row.chargeNo || ''), ...extra });
      }
      return patch('picklists', line, confirmed);
    });
    return { resource: 'picklists', records };
  }
  if (key === 'picklist-note') {
    // Edit of the Note (#materialTakeEdit): every line of the pick list carries it; no stock moves.
    const lines = reportLines(store, data.reportNo); const value = noteOf(data.note);
    const records = lines.map(line => String(line.note ?? '') === value ? line : patch('picklists', line, { note: value }));
    return { resource: 'picklists', records };
  }
  if (key === 'undo-iso-execution') {
    const lines = reportLines(store, data.reportNo); const reportNo = String(lines[0].reportNo || lines[0].number);
    const refusal = undoRefusal({ execution: lines.every(line => Boolean(line.reportNo)), lines });
    if (refusal) throw new AppError(409, refusal);
    const iso = store.get('isometrics', lines[0].isoId, true);
    const logText = `Undo execution ${iso.isoNo} | Pick List ${reportNo}`;
    // Return exactly what Start took, charge by charge: the Issue movements of this pick list, reversed.
    for (const move of store.list('movements').filter(row => row.pickListNo === reportNo && row.type === 'Issue' && row.siteId)) {
      const amount = qty(-Number(move.quantity)); if (amount <= 0) continue;
      const warehouseId = String(move.warehouseId || ''), chargeNo = String(move.chargeNo || '');
      // Taken from an old-model storehouse row (it names the storehouse and the site): the quantity goes back to that
      // line as it was, still counted for its main project; were the line gone, into the site inventory.
      const source = warehouseId ? store.list('stock').find(row => !isSiteStock(row) && row.warehouseId === warehouseId && materialIdentity(row) === materialIdentity(move) && String(row.chargeNo || '') === chargeNo) : undefined;
      if (source) store.update('stock', source.id, { quantity: qty(Number(source.quantity) + amount) }, source._version, context.actor);
      else changeSiteStock(store, context.actor, String(move.siteId), refs(move), chargeNo, amount);
      add('movements', { number: store.next('MM'), ...refs(move), warehouseId: source ? warehouseId : '', siteId: String(move.siteId), quantity: amount, type: 'Return to inventory', date, chargeNo, isoId: iso.id, requirementId: String(move.requirementId || ''), note: logText, pickListNo: reportNo });
    }
    // The pick list leaves the archive (archived, never deleted); the isometric's reservations are released.
    const archived = lines.map(line => store.archive('picklists', line.id, line._version, context.actor));
    for (const reservation of store.list('reservations').filter(row => row.isoId === iso.id && row.status === 'Reserved')) patch('reservations', reservation, { status: 'Released', note: [reservation.note, `Released by Undo execution of Pick List ${reportNo}`].filter(Boolean).join(' · ') });
    store.audit('isometrics', iso.id, 'execution undone', `Undo execution: Pick List ${reportNo}`, context.actor);
    return { resource: 'picklists', records: archived };
  }
  throw new AppError(404, 'This action does not exist.');
}

/**
 * Excel of the tables of this flow, as the screen shows them (the reference's DataTables "Excel" button): the page sends
 * the columns and rows it lists, the server writes the workbook. Each table needs the export right of its records.
 */
export const TABLE_EXPORTS: Record<string, { resource: string; title: string }> = {
  'iso-execution': { resource: 'iso_materials', title: 'Isometric execution' },
  'picklist-archive': { resource: 'picklists', title: 'Pick List archive' },
  picklist: { resource: 'picklists', title: 'Pick List' },
};
export function registerMtoLogisticsRoutes(app: Express, availability: Availability | undefined) {
  app.post('/api/mto/table-export', async (req, res) => {
    if (!availability?.features.includes('pilots')) throw new AppError(404, 'This resource could not be found.');
    const body = (req.body ?? {}) as Input; const table = TABLE_EXPORTS[text(body.table)];
    if (!table) throw new AppError(404, 'This table cannot be exported.');
    const user = (req as unknown as AuthRequest).user;
    // The Export box of the table's own area (shared/export-tables.ts), not of a record type that happens to feed it.
    if (!areaRight(user, EXPORT_TABLES[text(body.table)].area)) throw new AppError(403, 'Your permission profile does not allow this export.');
    const cell = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : String(value ?? '').slice(0, 2000);
    const columns = Array.isArray(body.columns) ? body.columns.slice(0, 30).map(value => String(value ?? '').slice(0, 100)) : [];
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 10000) : [];
    if (!columns.length || rows.some(row => !Array.isArray(row))) throw new AppError(422, 'Send the columns and the rows of the table.');
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet(table.title.slice(0, 31)); sheet.columns = columns.map(header => ({ header, width: 22 }));
    for (const row of rows as unknown[][]) sheet.addRow(columns.map((_, index) => cell(row[index])));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment(`blitzkrieg-${text(body.table)}.xlsx`); await workbook.xlsx.write(res); res.end();
  });
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
/** The Note of a pick list: plain text up to PICKLIST_NOTE_MAX characters. */
function noteOf(value: unknown) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new AppError(422, 'The note must be text.', { note: 'Enter text.' });
  const note = text(value);
  if (note.length > PICKLIST_NOTE_MAX) throw new AppError(422, `The note is too long (at most ${PICKLIST_NOTE_MAX} characters).`, { note: `Use at most ${PICKLIST_NOTE_MAX} characters.` });
  return note;
}
/** The active lines of one pick list (by its report number; a line issued directly stands under its own number). */
function reportLines(store: Store, value: unknown) {
  const reportNo = text(value);
  const lines = reportNo ? store.list('picklists').filter(line => String(line.reportNo || line.number) === reportNo) : [];
  if (!lines.length) throw new AppError(404, 'This pick list could not be found.');
  return lines;
}

/**
 * Service req. - Materials → Move to inventory: the material that was issued to the checked lines goes back into the
 * isometric's project site inventory, charge by charge as it left (an issue without a known charge comes back without
 * one). Its pick-list lines no longer count as Picked; the line's location is cleared and an open service request of it
 * closes with the date. A line with nothing issued is refused, and nothing is written.
 */
export function moveMaterialsToInventory(store: Store, actor: Actor, requirementIds: string[], date: string, note: string) {
  const records: Row[] = [];
  for (const id of requirementIds) {
    const requirement = store.get('iso_materials', id); const iso = store.get('isometrics', requirement.isoId);
    const lines = store.list('picklists').filter(line => line.requirementId === requirement.id && pickIssued(line));
    const material = materialRecord(rowsOf(store), requirement);
    if (!lines.length) throw new AppError(409, `Nothing of ${material?.materialNo || 'this material'} on ${iso.isoNo} was issued from the inventory, so there is nothing to move back.`);
    for (const line of lines) {
      const siteId = String(line.siteId || '') || siteOfIso(store, iso.id);
      if (!siteId) throw new AppError(422, 'The isometric’s project belongs to no project site, so there is no Material inventory to move back to.');
      const issues = store.list('movements').filter(move => move.type === 'Issue' && move.requirementId === requirement.id && (line.reportNo ? move.pickListNo === line.reportNo : String(move.note || '').startsWith(String(line.number))));
      const issuedTotal = qty(issues.reduce((sum, move) => sum - Number(move.quantity), 0));
      // The charges as they left; when the issue movements do not add up to the line (old data), the line's quantity returns on its own charge.
      const parts = issuedTotal === qty(line.quantity) ? issues.map(move => ({ chargeNo: String(move.chargeNo || ''), quantity: qty(-Number(move.quantity)) })) : [{ chargeNo: String(line.chargeNo || ''), quantity: qty(line.quantity) }];
      for (const part of parts.filter(part => part.quantity > 0)) {
        changeSiteStock(store, actor, siteId, refs(line), part.chargeNo, part.quantity);
        store.create('movements', { number: store.next('MM'), ...refs(line), warehouseId: '', siteId, quantity: part.quantity, type: 'Return to inventory', date, chargeNo: part.chargeNo, isoId: iso.id, requirementId: requirement.id, note: `Moved back to inventory | ${iso.isoNo}${line.reportNo ? ` | Pick List ${line.reportNo}` : ''}${note ? ' · ' + note : ''}`, pickListNo: String(line.reportNo || '') }, actor);
      }
      records.push(store.update('picklists', line.id, { returned: true, returnedDate: date }, line._version, actor));
    }
    const location = store.list('material_locations').find(row => row.requirementId === requirement.id);
    if (location && (location.laydownId || location.companyId)) store.update('material_locations', location.id, { laydownId: '', companyId: '', date }, location._version, actor);
    for (const request of store.list('service_requests').filter(row => row.requirementId === requirement.id && row.status !== 'Completed')) {
      if (date < String(request.date)) throw new AppError(422, 'The move date cannot be before the request date.');
      store.update('service_requests', request.id, { status: 'Completed', completedAt: date }, request._version, actor);
    }
    store.create('material_location_events', { number: store.next('MLOC'), requirementId: requirement.id, type: 'Move to inventory', laydownId: '', companyId: '', date, note }, actor);
    store.audit('iso_materials', requirement.id, 'moved', `Move to inventory · ${date}${note ? ' · ' + note : ''}`, actor);
  }
  return records;
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
    // Reuse the Valves phase when the materials sample already created one (phase names are unique).
    const valves = store.list('operation_phases', true).find(row => String(row.name).trim().toLowerCase() === 'valves')?.id ?? (add('operation_phases', 'phase-valves', { name: 'Valves', sort: 4 }), 'phase-valves');
    add('warehouses', 'warehouse-yard', { name: 'Yard container 3', siteId: 'site-north', companyId: 'company-stelux', use: 'Materials', residence: 'Rotterdam' });
    add('service_companies', 'service-pwht', { name: 'Thermotech Heat Treatment', address: '22 Ketelweg', residence: 'Vlaardingen', phone: '+31 10 555 0187', email: 'planning@thermotech.example.com' });
    add('service_companies', 'service-blast', { name: 'Delta Blast & Paint', address: '3 Dokstraat', residence: 'Rotterdam', phone: '+31 10 555 0134', email: 'orders@deltablast.example.com' });
    add('laydowns', 'laydown-c', { name: 'Laydown C — Painted spools', siteId: 'site-north' });
    add('material_laydowns', 'mlaydown-rack-1', { name: 'Pipe rack 1' });
    add('material_laydowns', 'mlaydown-valves', { name: 'Valve cage' });
    // Gate valves, class 150 flanges, stud bolt sets and 316L pipe and elbows on top of the base requirements.
    add('iso_materials', 'requirement-field-1', { isoId: 'iso-1', materialId: 'material-6', quantity: 2, phaseId: valves });
    add('iso_materials', 'requirement-field-2', { isoId: 'iso-2', materialId: 'material-3', quantity: 6, phaseId: 'phase-1' });
    add('iso_materials', 'requirement-field-3', { isoId: 'iso-2', materialId: 'material-8', quantity: 24, phaseId: 'phase-1' });
    add('iso_materials', 'requirement-field-4', { isoId: 'iso-4', materialId: 'material-4', quantity: 30, phaseId: 'phase-0' });
    add('iso_materials', 'requirement-field-5', { isoId: 'iso-5', materialId: 'material-7', quantity: 10, phaseId: 'phase-0' });
    // Large field quantities that stock cannot fully cover: these isometrics fall in the 80–99 %, 70–79 % and below 70 % bands.
    add('iso_materials', 'requirement-field-6', { isoId: 'iso-4', materialId: 'material-4', quantity: 40, phaseId: 'phase-0' });
    add('iso_materials', 'requirement-field-7', { isoId: 'iso-6', materialId: 'material-5', quantity: 70, phaseId: 'phase-1' });
    add('iso_materials', 'requirement-field-8', { isoId: 'iso-8', materialId: 'material-3', quantity: 40, phaseId: 'phase-1' });
    // Opening balances of the project sites' Material inventories (north: cooling water; river: steam network).
    for (const [siteId, materialId, quantity, chargeNo] of [['site-north', 'material-6', 3, 'H-2204'], ['site-north', 'material-8', 60, 'H-3310'], ['site-river', 'material-4', 42, 'H-1042'], ['site-river', 'material-5', 46, 'H-2208'], ['site-river', 'material-7', 40, 'H-2951'], ['site-north', 'material-9', 10, 'H-4410'], ['site-north', 'material-12', 2, 'H-4512']] as const) run('stock-add', { siteId, materialId, chargeNo, quantity, date: '2026-10-05', note: 'Sample opening balance' });
    // iso-2 reserves what it can (the three class 150 flanges in stock), iso-1 starts and is taken, iso-5 starts and waits to be taken.
    run('reserve-iso', { isoId: 'iso-2', date: '2026-10-22' });
    const first = run('start-iso', { isoId: 'iso-1', date: '2026-10-23' });
    const report = String('records' in first ? first.records?.[0]?.reportNo || '' : '');
    if (report) run('take-picklist', { reportNo: report, date: '2026-10-24' });
    run('start-iso', { isoId: 'iso-5', date: '2026-10-26' });
    // Treatments shown by the service request page, and requests in different states.
    // The treatments belong to the isometric (the service request page reads them there); the spool keeps its copy.
    const spool = (id: string, data: Input) => {
      const row = store.list('spools').find(item => item.id === id); if (!row) return;
      store.update('spools', id, data, row._version, actor);
      const iso = store.list('isometrics').find(item => item.id === row.isoId); if (iso) store.update('isometrics', iso.id, data, iso._version, actor);
    };
    spool('spool-1', { chemicalClean: 'Acid pickling', pwht: false });
    spool('spool-2', { chemicalClean: 'Acid pickling', pwht: true, paintSpec: 'PS-04 epoxy 2 × 120 µm' });
    spool('spool-3', { chemicalClean: 'Degreasing', paintSpec: 'PS-02 zinc primer' });
    spool('spool-5', { chemicalClean: 'Passivation', pwht: false });
    run('service', { spoolIds: ['spool-2'], companyId: 'service-pwht', name: 'Stress relief batch 1', includeDrawings: true, date: '2026-10-21', note: 'Heat treatment per the procedure on the drawing.' });
    const blast = run('service', { spoolIds: ['spool-3'], companyId: 'service-blast', name: 'Blast and prime, week 43', date: '2026-10-17' });
    if ('records' in blast && blast.records?.[0]) run('move-spools', { spoolIds: ['spool-3'], laydownId: 'laydown-c', date: '2026-10-22', note: 'Received, coating inspected.' });
    run('move-materials', { requirementIds: ['requirement-field-1'], laydownId: 'mlaydown-valves', date: '2026-10-22' });
    run('service-materials', { requirementIds: ['requirement-field-1'], companyId: 'service-blast', name: 'Valve body coating', date: '2026-10-25' });
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_mto_logistics_v1','1')").run();
  });
}
