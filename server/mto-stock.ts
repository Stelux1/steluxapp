import type { Express } from 'express';
import { scopeRows } from './site-scope.ts';
import { AppError, qty, today, validDate, type Actor, type Store } from './store.ts';
import { materialIdentity } from '../shared/materials.ts';
import { canResource, canScope } from '../shared/permissions.ts';
import { reportCsv, type Report } from '../shared/reports.ts';
import { reportWorkbook } from './report-export.ts';
import type { Availability, Row } from '../shared/types.ts';
import type { AuthRequest } from './auth.ts';
import { CORRECTION_REASONS, MATERIALS_LIST_COLUMNS, MAX_LENGTHS, TRANSFER_PRIORITIES, TRANSFER_TYPES, materialsList, projectHoldings, stockDetails, transferRoute, validQuantity } from '../shared/mto-stock.ts';

type Input = Record<string, unknown>;
type Result = { resource: string; record?: Row; records?: Row[] };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function limited(value: unknown, label: string, max: number, required = false, field?: string) {
  const output = text(value);
  if (required && !output) throw new AppError(422, `${label} is required.`, field ? { [field]: `${label} is required.` } : undefined);
  if (output.length > max) throw new AppError(422, `${label} is too long (at most ${max} characters).`, field ? { [field]: `Use at most ${max} characters.` } : undefined);
  return output;
}
const positiveQuantity = (value: unknown, label = 'Quantity') => {
  if (!validQuantity(value)) throw new AppError(422, `${label} must be at least 0.01, in steps of 0.01.`, { quantity: `Enter at least 0.01, in steps of 0.01.` });
  return qty(value);
};
const asBoolean = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value !== 'boolean') throw new AppError(422, `${label} must be checked or unchecked.`);
  return value;
};

/** Every state-changing operation of the storehouse inventory and the transfer orders; one transaction each (the caller opens it). */
export function runMtoStock(store: Store, key: string, data: Input, actor: Actor): Result {
  const date = data.date ? validDate(data.date) : today();
  const note = limited(data.note, 'Notes', 2000);
  const catalog = () => ({ materials: store.list('materials'), custom_materials: store.list('custom_materials') });
  const storehouse = (id: unknown) => {
    const row = store.get('warehouses', id);
    if (row.use === 'Tools') throw new AppError(422, 'Choose a storehouse that holds materials.');
    return row;
  };
  const site = (id: unknown) => store.get('sites', id);
  const line = (id: unknown) => store.get('stock', id);
  const nameOf = (row: Row, rows = catalog()) => stockDetails(rows, row).materialNo || 'material';
  const refsOf = (row: Row) => ({ materialId: String(row.materialId || ''), customMaterialId: String(row.customMaterialId || '') });
  const copyWording = (row: Row) => row.corrected === true ? Object.fromEntries(['materialGroup', 'articleNo', 'uom', 'description', 'dia', 'lbs', 'corrected'].map(name => [name, row[name]])) : {};

  /** Change a line's quantity; a balance below zero is refused. */
  const change = (row: Row, delta: number, extra: Input = {}) => {
    const current = store.get('stock', row.id), next = qty(Number(current.quantity) + delta);
    if (next < 0) throw new AppError(409, `Insufficient stock of ${nameOf(current)}. Available: ${Number(current.quantity)}.`);
    return store.update('stock', current.id, { quantity: next, ...extra }, current._version, actor);
  };
  /** The inventory line of a material and charge in a storehouse, created when it does not exist yet. */
  const receiving = (from: Row, warehouseId: string, delta: number, chargeNo = String(from.chargeNo || '')) => {
    const identity = materialIdentity(from);
    const existing = store.list('stock').find(row => row.warehouseId === warehouseId && materialIdentity(row) === identity && String(row.chargeNo || '') === chargeNo);
    if (existing) return change(existing, delta);
    return store.create('stock', { ...refsOf(from), warehouseId, chargeNo, quantity: qty(delta), ...copyWording(from) }, actor);
  };
  const movement = (type: string, row: Row, warehouseId: string, signed: number, extra: Input = {}) => store.create('movements', { number: store.next('MM'), ...refsOf(row), warehouseId, type, quantity: qty(signed), chargeNo: String(row.chargeNo || ''), date, note, ...extra }, actor);
  const audit = (row: Row, action: string, summary: string) => store.audit('stock', row.id, action, summary, actor);
  const describe = (amount: number, row: Row) => `${amount} ${stockDetails(catalog(), row).uom}`.trim();

  if (key === 'stock-add') {
    const warehouse = storehouse(data.warehouseId), material = store.get('materials', data.materialId);
    const amount = positiveQuantity(data.quantity), chargeNo = limited(data.chargeNo, 'Charge / heat number', MAX_LENGTHS.chargeNo);
    const target = receiving({ materialId: material.id, customMaterialId: '', chargeNo } as unknown as Row, warehouse.id, amount, chargeNo);
    movement('Adjustment', target, warehouse.id, amount, { note: note || 'Added from the material database' });
    audit(target, 'adjusted', `Added ${describe(amount, target)} of ${nameOf(target)} to ${warehouse.name}`);
    return { resource: 'stock', record: target };
  }

  if (key === 'stock-to-project') {
    const target = site(data.siteId);
    const items = Array.isArray(data.items) ? data.items as Input[] : [];
    if (!items.length || items.length > 200) throw new AppError(422, 'Choose at least one inventory line to transfer.');
    const seen = new Set<string>();
    const records: Row[] = [];
    for (const item of items) {
      const row = line(item?.stockId);
      if (seen.has(row.id)) throw new AppError(422, 'Each inventory line can appear only once.');
      seen.add(row.id);
      const amount = positiveQuantity(item.quantity, `Quantity of ${nameOf(row)}`);
      const updated = change(row, -amount);
      movement('Project transfer', row, String(row.warehouseId), -amount, { siteId: target.id, note: note || `To ${target.name}` });
      audit(row, 'transferred', `Transferred ${describe(amount, row)} of ${nameOf(row)} to ${target.name}`);
      records.push(updated);
    }
    return { resource: 'stock', records };
  }

  if (key === 'stock-move') {
    const row = line(data.stockId), to = storehouse(data.toWarehouseId);
    if (to.id === row.warehouseId) throw new AppError(422, 'Choose a different storehouse.', { toWarehouseId: 'Choose a different storehouse.' });
    const all = asBoolean(data.all, 'All');
    const amount = all ? qty(row.quantity) : positiveQuantity(data.quantity);
    if (amount <= 0) throw new AppError(422, 'There is nothing to move.');
    const from = String(row.warehouseId);
    const source = change(row, -amount);
    receiving(row, to.id, amount);
    movement('Transfer out', row, from, -amount, { note: note || `To ${to.name}` });
    movement('Transfer in', row, to.id, amount, { note: note || `From ${store.get('warehouses', from).name}` });
    audit(row, 'transferred', `Moved ${describe(amount, row)} of ${nameOf(row)} to ${to.name}`);
    return { resource: 'stock', record: source };
  }

  if (key === 'stock-return') {
    const row = line(data.stockId), from = site(data.siteId);
    const identity = materialIdentity(row), chargeNo = String(row.chargeNo || '');
    const held = projectHoldings({ movements: store.list('movements') }).find(entry => entry.siteId === from.id && entry.identity === identity && entry.chargeNo === chargeNo)?.quantity || 0;
    const all = asBoolean(data.all, 'All');
    const amount = all ? qty(held) : positiveQuantity(data.quantity);
    if (amount <= 0 || amount > held + 1e-9) throw new AppError(409, `${from.name} holds ${held} of ${nameOf(row)} from this charge.`, { quantity: `At most ${held} can be returned.` });
    const updated = change(row, amount);
    movement('Project return', row, String(row.warehouseId), amount, { siteId: from.id, note: note || `From ${from.name}` });
    audit(row, 'returned', `Returned ${describe(amount, row)} of ${nameOf(row)} from ${from.name}`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-correct') {
    const row = line(data.stockId), before = stockDetails(catalog(), row);
    const next = {
      materialGroup: limited(data.materialGroup, 'Material group', MAX_LENGTHS.materialGroup, true, 'materialGroup'), articleNo: limited(data.articleNo, 'Article no', MAX_LENGTHS.articleNo),
      uom: limited(data.uom, 'UOM', MAX_LENGTHS.uom, true, 'uom'), description: limited(data.description, 'Description', MAX_LENGTHS.description, true, 'description'),
      dia: limited(data.dia, 'DIA', MAX_LENGTHS.dia), lbs: limited(data.lbs, 'LBS / SCH', MAX_LENGTHS.lbs),
    };
    const reason = text(data.reason);
    if (!(CORRECTION_REASONS as readonly string[]).includes(reason)) throw new AppError(422, 'Choose the reason for this correction.', { reason: 'Choose a reason.' });
    const reasonText = limited(data.reasonText, 'Reason text', MAX_LENGTHS.reasonText, reason === 'Other', 'reasonText');
    const chargeNo = data.chargeNo === undefined ? String(row.chargeNo || '') : limited(data.chargeNo, 'Certificate charge', MAX_LENGTHS.chargeNo);
    const shown: Record<string, string> = { 'Material group': before.group, 'Article no': before.articleNo, UOM: before.uom, Description: before.description, DIA: before.dia, 'LBS / SCH': before.lbs };
    const wanted: Record<string, string> = { 'Material group': next.materialGroup, 'Article no': next.articleNo, UOM: next.uom, Description: next.description, DIA: next.dia, 'LBS / SCH': next.lbs };
    const changes = Object.keys(wanted).filter(name => wanted[name] !== shown[name]).map(name => `${name}: "${shown[name]}" → "${wanted[name]}"`);
    if (chargeNo !== String(row.chargeNo || '')) {
      changes.push(`Charge: "${row.chargeNo || ''}" → "${chargeNo}"`);
      const identity = materialIdentity(row);
      if (store.list('stock').some(other => other.id !== row.id && other.warehouseId === row.warehouseId && materialIdentity(other) === identity && String(other.chargeNo || '') === chargeNo)) throw new AppError(409, 'This storehouse already holds the material with that charge. Move the quantity there instead.', { chargeNo: 'This charge already exists for the material.' });
    }
    if (!changes.length) throw new AppError(422, 'Change at least one value before saving a correction.');
    const updated = store.update('stock', row.id, { ...next, chargeNo, corrected: true }, row._version, actor);
    movement('Correction', row, String(row.warehouseId), 0, { chargeNo, reason, reasonText, note: changes.join('; ') });
    audit(row, 'corrected', `Corrected ${nameOf(updated)} (${reason}${reasonText ? `: ${reasonText}` : ''}) · ${changes.join('; ')}`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-adjust') {
    const row = line(data.stockId), reasonText = limited(data.reasonText, 'Reason text', MAX_LENGTHS.reasonText, true, 'reasonText');
    if (typeof data.quantity !== 'number' || !Number.isFinite(data.quantity) || data.quantity < 0 || Math.abs(data.quantity * 100 - Math.round(data.quantity * 100)) > 1e-6) throw new AppError(422, 'The new quantity must be zero or more, in steps of 0.01.', { quantity: 'Enter zero or more, in steps of 0.01.' });
    const target = qty(data.quantity), delta = qty(target - Number(row.quantity));
    if (delta === 0) throw new AppError(422, 'The new quantity equals the current quantity.', { quantity: 'Enter a different quantity.' });
    const updated = change(row, delta);
    movement('Adjustment', row, String(row.warehouseId), delta, { reasonText, note: note || reasonText });
    audit(row, 'adjusted', `Adjusted ${nameOf(row)} from ${row.quantity} to ${target} (${reasonText})`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-remove') {
    const row = line(data.stockId), reasonText = limited(data.reasonText, 'Reason text', MAX_LENGTHS.reasonText, true, 'reasonText');
    const remaining = qty(row.quantity);
    if (remaining > 0) movement('Removal', row, String(row.warehouseId), -remaining, { reasonText, note: note || reasonText });
    const archived = store.archive('stock', row.id, row._version, actor);
    audit(row, 'removed', `Removed ${nameOf(row)} from the inventory (${reasonText}); ${remaining} written off`);
    return { resource: 'stock', record: archived };
  }

  if (key === 'transfer-order-create') return createOrder();
  if (key === 'transfer-order-complete') return completeOrder();
  if (key === 'transfer-order-cancel') {
    const order = store.get('transfer_orders', data.orderId);
    if (order.status !== 'Open') throw new AppError(409, `This transfer order is already ${String(order.status).toLowerCase()}.`);
    const updated = store.update('transfer_orders', order.id, { status: 'Cancelled', notes: [order.notes, note && `Cancelled: ${note}`].filter(Boolean).join('\n') }, order._version, actor);
    store.audit('transfer_orders', order.id, 'cancelled', `Cancelled transfer order ${order.number}`, actor);
    return { resource: 'transfer_orders', record: updated };
  }
  throw new AppError(404, 'This action does not exist.');

  function createOrder(): Result {
    const type = text(data.type), priority = text(data.priority) || 'Normal';
    if (!(TRANSFER_TYPES as readonly string[]).includes(type)) throw new AppError(422, 'Choose the type of transfer order.', { type: 'Choose a type.' });
    if (!(TRANSFER_PRIORITIES as readonly string[]).includes(priority)) throw new AppError(422, 'Choose Normal or Urgent.', { priority: 'Choose a priority.' });
    const route = transferRoute(type)!;
    const fromId = route.from === 'storehouse' ? storehouse(data.fromWarehouseId).id : '';
    if (route.from === 'storehouse' && !fromId) throw new AppError(422, 'Choose the storehouse to take material from.', { fromWarehouseId: 'Choose a storehouse.' });
    const siteId = route.to === 'project' || route.from === 'project' ? site(data.siteId).id : '';
    const toId = route.to === 'storehouse' ? storehouse(data.toWarehouseId).id : '';
    if (route.to === 'storehouse' && fromId && fromId === toId) throw new AppError(422, 'Choose two different storehouses.', { toWarehouseId: 'Choose a different storehouse.' });
    const items = Array.isArray(data.items) ? data.items as Input[] : [];
    if (!items.length || items.length > 200) throw new AppError(422, 'Add at least one item to the transfer order.');
    const rows = catalog();
    const prepared = items.map((item, index) => {
      const number = `Item ${index + 1}`;
      const stockId = text(item?.stockId);
      const source = stockId ? line(stockId) : undefined;
      if (source && fromId && source.warehouseId !== fromId) throw new AppError(422, `${number} is not in the chosen storehouse.`);
      const details = source ? stockDetails(rows, source) : undefined;
      return {
        materialNo: limited(item?.materialNo ?? details?.materialNo, `${number}: Material no.`, MAX_LENGTHS.materialNo, true), description: limited(item?.description ?? details?.description, `${number}: Description`, MAX_LENGTHS.description),
        quantity: positiveQuantity(item?.quantity, `${number}: Quantity`), uom: limited(item?.uom ?? details?.uom, `${number}: UOM`, MAX_LENGTHS.uom), stockId,
      };
    });
    const order = store.create('transfer_orders', { number: store.next('TO'), type, priority, status: 'Open', fromWarehouseId: fromId, siteId, toWarehouseId: toId, date, notes: limited(data.notes, 'Notes', 2000) }, actor);
    for (const item of prepared) store.create('transfer_order_items', { orderId: order.id, ...item }, actor);
    return { resource: 'transfer_orders', record: order };
  }

  function completeOrder(): Result {
    const order = store.get('transfer_orders', data.orderId);
    if (order.status !== 'Open') throw new AppError(409, `This transfer order is already ${String(order.status).toLowerCase()}.`);
    const route = transferRoute(String(order.type))!;
    const items = store.list('transfer_order_items').filter(item => item.orderId === order.id).sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)));
    const rows = catalog();
    const sameNo = (row: Row, materialNo: string) => stockDetails(rows, row).materialNo.trim().toLowerCase() === materialNo.trim().toLowerCase();
    const label = (id: unknown) => String(store.get('warehouses', id).name);
    const orderFields = { transferOrder: String(order.number) };
    for (const item of items) {
      let remaining = qty(item.quantity);
      if (route.from === 'storehouse') {
        const from = String(order.fromWarehouseId);
        // The unverified rule: a line named by the order is taken first; otherwise the charges of the material number are used in charge order.
        const sources = item.stockId ? [line(item.stockId)] : store.list('stock').filter(row => row.warehouseId === from && sameNo(row, String(item.materialNo)) && Number(row.quantity) > 0).sort((a, b) => String(a.chargeNo || '').localeCompare(String(b.chargeNo || '')));
        if (item.stockId && sources[0].warehouseId !== from) throw new AppError(409, `${item.materialNo} is no longer in ${label(from)}.`);
        for (const source of sources) {
          if (remaining <= 0) break;
          const take = qty(Math.min(remaining, Number(source.quantity)));
          if (take <= 0) continue;
          change(source, -take);
          if (route.to === 'project') movement('Project transfer', source, from, -take, { ...orderFields, siteId: String(order.siteId), note: `${order.number}` });
          else {
            const to = String(order.toWarehouseId);
            receiving(source, to, take);
            movement('Transfer out', source, from, -take, { ...orderFields, note: `${order.number} · To ${label(to)}` });
            movement('Transfer in', source, to, take, { ...orderFields, note: `${order.number} · From ${label(from)}` });
          }
          remaining = qty(remaining - take);
        }
        if (remaining > 0) throw new AppError(409, `Not enough ${item.materialNo} in ${label(from)}. Missing: ${remaining}.`);
      } else {
        const to = String(order.toWarehouseId);
        const holdings = projectHoldings({ movements: store.list('movements') }).filter(entry => entry.siteId === order.siteId).filter(entry => {
          const record = entry.materialId ? rows.materials.find(m => m.id === entry.materialId) : rows.custom_materials.find(m => m.id === entry.customMaterialId);
          return String(record?.materialNo || '').trim().toLowerCase() === String(item.materialNo).trim().toLowerCase();
        }).sort((a, b) => a.chargeNo.localeCompare(b.chargeNo));
        for (const held of holdings) {
          if (remaining <= 0) break;
          const take = qty(Math.min(remaining, held.quantity));
          const basis = { materialId: held.materialId, customMaterialId: held.customMaterialId, chargeNo: held.chargeNo } as unknown as Row;
          receiving(basis, to, take);
          movement('Project return', basis, to, take, { ...orderFields, siteId: String(order.siteId), note: `${order.number}` });
          remaining = qty(remaining - take);
        }
        if (remaining > 0) throw new AppError(409, `The project holds too little ${item.materialNo}. Missing: ${remaining}.`);
      }
    }
    const updated = store.update('transfer_orders', order.id, { status: 'Completed', completedDate: date, notes: [order.notes, note && `Completed: ${note}`].filter(Boolean).join('\n') }, order._version, actor);
    store.audit('transfer_orders', order.id, 'completed', `Completed transfer order ${order.number}`, actor);
    return { resource: 'transfer_orders', record: updated };
  }
}

/** The Materials list: every material of the active main project with ordered, inventory and picked quantities, computed on each request. */
export function registerMtoStockRoutes(app: Express, store: Store, availability: Availability | undefined, access: { resource: (key: string) => unknown }) {
  app.get('/api/mto/materials-list', async (req, res) => {
    access.resource('stock'); // 404 where the profile does not deliver the inventory
    const user = (req as unknown as AuthRequest).user;
    // The page needs Show on its own area, Material list (78), besides the records it reads.
    if (!canResource(user, 'iso_materials') || !canResource(user, 'stock') || !canScope(user, '78')) throw new AppError(403, 'Your permission profile does not allow this action.');
    const param = (name: string) => typeof req.query[name] === 'string' ? String(req.query[name]).slice(0, 150) : '';
    const filters = { siteId: param('siteId'), projectId: param('projectId'), isoId: param('isoId'), query: param('q').slice(0, 500) };
    // Access per project site: a limited request lists only its main projects' records (server/site-scope.ts).
    const rows = Object.fromEntries(['projects', 'isometrics', 'iso_materials', 'materials', 'custom_materials', 'orders', 'order_lines', 'picklists', 'stock'].map(key => [key, scopeRows(key, store.list(key))]));
    const list = materialsList(rows, filters);
    const format = param('format');
    if (format === 'csv' || format === 'xlsx') {
      if (!canResource(user, 'stock', 'export')) throw new AppError(403, 'Your permission profile does not allow this report export.');
      const report: Report = { definition: { key: 'materials-list', title: 'Materials list', description: 'Materials of the main project with ordered, inventory and picked quantities.', module: 'materials' }, columns: MATERIALS_LIST_COLUMNS, rows: list };
      if (format === 'xlsx') { res.attachment('blitzkrieg-materials-list.xlsx'); await reportWorkbook(report).xlsx.write(res); res.end(); return; }
      res.attachment(`blitzkrieg-materials-list-${today()}.csv`).type('text/csv').send(reportCsv(report));
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ columns: MATERIALS_LIST_COLUMNS, rows: list, generatedAt: new Date().toISOString(), availability: Boolean(availability) });
  });
}
