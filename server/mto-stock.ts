import type { Express } from 'express';
import { scopeRows } from './site-scope.ts';
import { AppError, SYSTEM, qty, today, validDate, type Actor, type Store } from './store.ts';
import { materialIdentity } from '../shared/materials.ts';
import { canResource, canScope } from '../shared/permissions.ts';
import { reportCsv, type Report } from '../shared/reports.ts';
import { reportWorkbook } from './report-export.ts';
import type { Availability, Row } from '../shared/types.ts';
import type { AuthRequest } from './auth.ts';
import { ADJUST_REASONS, CORRECTION_REASONS, MATERIALS_LIST_COLUMNS, MAX_LENGTHS, REMOVE_REASONS, TRANSFER_PRIORITIES, TRANSFER_TYPES, blocksRemoval, isSiteStock, isStorehouseLine, itemCertIds, lineCertificates, materialsList, reservedOnOpenOrders, siteStock, stockDetails, transferRoute, unmigratedHoldings, validQuantity } from '../shared/mto-stock.ts';
import { nextSiteIndexNumber } from '../shared/welder-data.ts';

type Input = Record<string, unknown>;
type Result = { resource: string; record?: Row; records?: Row[] };
type Refs = { materialId: string; customMaterialId: string };

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
const refsOf = (row: Row | Input): Refs => ({ materialId: String(row.materialId || ''), customMaterialId: String(row.customMaterialId || '') });
const identityOf = (refs: Refs) => materialIdentity(refs as unknown as Row);

// ---- Project site inventory (shared with take-in, picks and the hosted preparation) -----------------------------

/** The project site an isometric works in (through its project); '' when it has none. */
export function siteOfIso(store: Store, isoId: unknown): string {
  if (!isoId) return '';
  const iso = store.list('isometrics', true).find(row => row.id === isoId);
  return String(store.list('projects', true).find(row => row.id === iso?.projectId)?.siteId || '');
}
/**
 * The project site whose Material inventory a delivery line goes into: the site of the line's isometric, else the site
 * of the order's project. '' when the order belongs to no project site (a manual order without a project).
 */
export function receivingSiteId(store: Store, order: Row, line: Row): string {
  return siteOfIso(store, line.isoId) || String(store.list('projects', true).find(row => row.id === order.projectId)?.siteId || '');
}
/**
 * Change one charge of a material in a project site's inventory; the row is created when it does not exist yet. A
 * balance below zero is refused.
 */
export function changeSiteStock(store: Store, actor: Actor, siteId: string, refs: Refs, chargeNo: string, delta: number, wording: Input = {}): Row {
  const identity = identityOf(refs);
  const existing = store.list('stock').find(row => isSiteStock(row) && row.siteId === siteId && materialIdentity(row) === identity && String(row.chargeNo || '') === chargeNo);
  const next = qty(Number(existing?.quantity || 0) + delta);
  if (next < 0) throw new AppError(409, `Insufficient stock in the project site's inventory. Available: ${Number(existing?.quantity || 0)}.`);
  if (existing) return store.update('stock', existing.id, { quantity: next }, existing._version, actor);
  return store.create('stock', { ...refs, locationKind: 'site', siteId, warehouseId: '', chargeNo, quantity: next, ...wording }, actor);
}
/**
 * Take a quantity of one material out of a project site's inventory, charge by charge in charge order (the inventory
 * is kept per Material No). Refused, with nothing taken, when the site holds less. Returns what each charge gave.
 */
export function takeFromSite(store: Store, actor: Actor, siteId: string, refs: Refs, amount: number, label = 'material'): { row: Row; quantity: number }[] {
  const rows = siteStock({ stock: store.list('stock') }, siteId, identityOf(refs)).filter(row => Number(row.quantity) > 0);
  const onHand = qty(rows.reduce((sum, row) => sum + Number(row.quantity), 0));
  if (onHand + 1e-9 < amount) throw new AppError(409, `Insufficient stock of ${label} in the project site's inventory. Available: ${onHand}.`);
  let left = qty(amount); const parts: { row: Row; quantity: number }[] = [];
  for (const row of rows) {
    if (left <= 0) break;
    const take = qty(Math.min(left, Number(row.quantity)));
    store.update('stock', row.id, { quantity: qty(Number(row.quantity) - take) }, row._version, actor);
    parts.push({ row, quantity: take }); left = qty(left - take);
  }
  return parts;
}

/**
 * Hosted preparation data step: what the first version kept as an invisible project "holding" (storehouse Project
 * transfer / Project return movements with a site) is booked into that site's Material inventory, one site-side
 * Project transfer movement per site, material and charge. Idempotent: afterwards no holding is left, so a second run
 * changes nothing. A dry run only counts.
 */
export function migrateProjectHoldings(store: Store, options: { dryRun: boolean } = { dryRun: false }) {
  const holdings = unmigratedHoldings({ movements: store.list('movements', true) });
  const quantity = qty(holdings.reduce((sum, holding) => sum + holding.quantity, 0));
  if (options.dryRun || !holdings.length) return { holdings: holdings.length, quantity };
  store.transaction(() => {
    for (const holding of holdings) {
      const refs = { materialId: holding.materialId, customMaterialId: holding.customMaterialId };
      changeSiteStock(store, SYSTEM, holding.siteId, refs, holding.chargeNo, holding.quantity);
      store.create('movements', { number: store.next('MM'), ...refs, warehouseId: '', siteId: holding.siteId, type: 'Project transfer', quantity: holding.quantity, chargeNo: holding.chargeNo, date: today(), note: 'Material held by the project, booked into the project site inventory.' }, SYSTEM);
    }
  });
  return { holdings: holdings.length, quantity };
}

/** Every state-changing operation of the inventories, the storehouses and the transfer orders; one transaction each (the caller opens it). */
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
  /** A storehouse line; a row of a project site's inventory is refused (its own operations live on Material inventory). */
  const line = (id: unknown) => {
    const row = store.get('stock', id);
    if (!isStorehouseLine(row)) throw new AppError(422, 'This material is in the project site’s inventory, not in a storehouse.');
    return row;
  };
  const nameOf = (row: Row, rows = catalog()) => stockDetails(rows, row).materialNo || 'material';
  const copyWording = (row: Row) => row.corrected === true ? Object.fromEntries(['materialGroup', 'articleNo', 'uom', 'description', 'dia', 'lbs', 'corrected'].map(name => [name, row[name]])) : {};

  /** Change a line's quantity; a balance below zero is refused. */
  const change = (row: Row, delta: number, extra: Input = {}) => {
    const current = store.get('stock', row.id), next = qty(Number(current.quantity) + delta);
    if (next < 0) throw new AppError(409, `Insufficient stock of ${nameOf(current)}. Available: ${Number(current.quantity)}.`);
    return store.update('stock', current.id, { quantity: next, ...extra }, current._version, actor);
  };
  /** The storehouse line of a material and charge, created when it does not exist yet. */
  const receiving = (from: Row | Input, warehouseId: string, delta: number, chargeNo = String(from.chargeNo || '')) => {
    const identity = identityOf(refsOf(from));
    const existing = store.list('stock').find(row => isStorehouseLine(row) && row.warehouseId === warehouseId && materialIdentity(row) === identity && String(row.chargeNo || '') === chargeNo);
    if (existing) return change(existing, delta);
    return store.create('stock', { ...refsOf(from), locationKind: 'storehouse', warehouseId, chargeNo, quantity: qty(delta), ...copyWording(from as Row) }, actor);
  };
  /** The report number of this operation: five digits, taken when the first movement is written, shared by all of them (one transfer = one report). */
  let reportNo = '';
  const report = () => reportNo ||= String(store.next('TR').split('-').pop()).padStart(5, '0');
  /** A movement of a storehouse line (`warehouseId`) or of a project site's inventory (`siteId`, no storehouse). */
  const movement = (type: string, row: Row | Input, place: { warehouseId: string; siteId?: string } | { siteId: string }, signed: number, extra: Input = {}) =>
    store.create('movements', { number: store.next('MM'), ...refsOf(row), warehouseId: 'warehouseId' in place ? place.warehouseId : '', siteId: place.siteId || '', type, quantity: qty(signed), chargeNo: String(row.chargeNo || ''), date, note, reportNo: report(), byName: actor.name, ...extra }, actor);
  const audit = (row: Row, action: string, summary: string) => store.audit('stock', row.id, action, summary, actor);
  const describe = (amount: number, row: Row) => `${amount} ${stockDetails(catalog(), row).uom}`.trim();
  /** Copy the ticked certificates of a storehouse line to the destination project site, each with its next index number. */
  const copyCertificates = (row: Row, ids: unknown, siteId: string, strict = true) => {
    if (ids === undefined || ids === null) return [] as Row[];
    if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string')) throw new AppError(422, 'Choose the certificates to transfer from the list.');
    const offered = new Map(lineCertificates({ certifications: store.list('certifications') }, row).map(cert => [cert.id, cert]));
    const copies: Row[] = [];
    for (const id of new Set(ids as string[])) {
      const cert = offered.get(id);
      if (!cert) { if (strict) throw new AppError(422, 'A chosen certificate does not belong to this storehouse line.'); continue; }
      const all = store.list('certifications', true);
      if (all.some(other => !other._archived && other.siteId === siteId && other.name === cert.name && String(other.chargeNo || '') === String(cert.chargeNo || '') && other.materialId === cert.materialId)) continue;
      const { id: _id, _version, _archived, _createdAt, _updatedAt, indexNo: _index, siteId: _site, projectIds: _projects, ...values } = cert as Row & { projectIds?: unknown };
      const indexNo = nextSiteIndexNumber('certifications', 'indexNo', siteId, all, { links: store.list('certificate_projects', true), projects: store.list('projects', true) });
      copies.push(store.create('certifications', { ...values, siteId, indexNo, allProjects: true }, actor));
    }
    return copies;
  };

  if (key === 'stock-add') {
    const target = site(data.siteId), material = store.get('materials', data.materialId);
    const amount = positiveQuantity(data.quantity), chargeNo = limited(data.chargeNo, 'Charge / heat number', MAX_LENGTHS.chargeNo);
    const refs = { materialId: material.id, customMaterialId: '' };
    const row = changeSiteStock(store, actor, target.id, refs, chargeNo, amount);
    movement('Adjustment', row, { siteId: target.id }, amount, { note: note || 'Added from the material database' });
    audit(row, 'adjusted', `Added ${describe(amount, row)} of ${nameOf(row)} to the inventory of ${target.name}`);
    return { resource: 'stock', record: row };
  }

  if (key === 'inventory-remove') {
    const target = site(data.siteId);
    const refs = refsOf(data);
    if (Boolean(refs.materialId) === Boolean(refs.customMaterialId)) throw new AppError(422, 'Choose the material to remove.');
    if (refs.materialId) store.get('materials', refs.materialId); else store.get('custom_materials', refs.customMaterialId);
    const amount = positiveQuantity(data.quantity), comment = limited(data.comment, 'Comment', MAX_LENGTHS.comment, true, 'comment');
    const label = nameOf(refs as unknown as Row);
    const parts = takeFromSite(store, actor, target.id, refs, amount, label);
    for (const part of parts) movement('Removal', part.row, { siteId: target.id }, -part.quantity, { reasonText: comment, note: comment });
    const updated = parts.map(part => store.get('stock', part.row.id));
    if (updated[0]) audit(updated[0], 'removed', `Removed ${amount} of ${label} from the inventory of ${target.name} (${comment})`);
    return { resource: 'stock', records: updated };
  }

  if (key === 'stock-to-project') {
    const target = site(data.siteId);
    const items = Array.isArray(data.items) ? data.items as Input[] : [];
    if (!items.length || items.length > 200) throw new AppError(422, 'Choose at least one storehouse line to transfer.');
    const seen = new Set<string>();
    const records: Row[] = [];
    for (const item of items) {
      const row = line(item?.stockId);
      if (seen.has(row.id)) throw new AppError(422, 'Each storehouse line can appear only once.');
      seen.add(row.id);
      const amount = positiveQuantity(item.quantity, `Quantity of ${nameOf(row)}`);
      const updated = change(row, -amount);
      const arrived = changeSiteStock(store, actor, target.id, refsOf(row), String(row.chargeNo || ''), amount, copyWording(row));
      const copies = copyCertificates(row, item.certIds, target.id);
      const certificates = copies.length ? ` · certificates ${copies.map(cert => `${cert.name} (index ${cert.indexNo})`).join(', ')}` : '';
      movement('Project transfer', row, { warehouseId: String(row.warehouseId), siteId: target.id }, -amount, { note: note || `To ${target.name}` });
      movement('Project transfer', row, { siteId: target.id }, amount, { note: `${note || `From ${store.get('warehouses', row.warehouseId).name}`}${certificates}` });
      audit(row, 'transferred', `Transferred ${describe(amount, row)} of ${nameOf(row)} to the inventory of ${target.name}${certificates}`);
      records.push(updated, arrived);
    }
    return { resource: 'stock', records };
  }

  if (key === 'stock-move') {
    const row = line(data.stockId), to = storehouse(data.toWarehouseId);
    if (to.id === row.warehouseId) throw new AppError(422, 'Choose a different storehouse.', { toWarehouseId: 'Choose a different storehouse.' });
    const all = asBoolean(data.all, 'Move all');
    const amount = all ? qty(row.quantity) : positiveQuantity(data.quantity);
    if (amount <= 0) throw new AppError(422, 'There is nothing to move.');
    const from = String(row.warehouseId);
    const source = change(row, -amount);
    receiving(row, to.id, amount);
    movement('Transfer out', row, { warehouseId: from }, -amount, { note: note || `To ${to.name}` });
    movement('Transfer in', row, { warehouseId: to.id }, amount, { note: note || `From ${store.get('warehouses', from).name}` });
    audit(row, 'transferred', `Moved ${describe(amount, row)} of ${nameOf(row)} to ${to.name}`);
    return { resource: 'stock', record: source };
  }

  if (key === 'stock-return') {
    const row = line(data.stockId), target = site(data.siteId);
    const all = asBoolean(data.all, 'Return all');
    const amount = all ? qty(row.quantity) : positiveQuantity(data.quantity, 'Quantity to return');
    if (amount <= 0) throw new AppError(422, 'There is nothing to return.');
    const updated = change(row, -amount);
    changeSiteStock(store, actor, target.id, refsOf(row), String(row.chargeNo || ''), amount, copyWording(row));
    const from = store.get('warehouses', row.warehouseId).name;
    movement('Return to inventory', row, { warehouseId: String(row.warehouseId), siteId: target.id }, -amount, { note: note || `To the inventory of ${target.name}` });
    movement('Return to inventory', row, { siteId: target.id }, amount, { note: note || `From ${from}` });
    audit(row, 'returned', `Returned ${describe(amount, row)} of ${nameOf(row)} from ${from} to the inventory of ${target.name}`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-correction') {
    const row = line(data.stockId), reasonText = limited(data.reasonText, 'Reason', MAX_LENGTHS.reasonText, true, 'reasonText');
    const amount = positiveQuantity(data.quantity, 'Quantity to remove');
    const updated = change(row, -amount);
    movement('Correction', row, { warehouseId: String(row.warehouseId) }, -amount, { reasonText, note: note || reasonText });
    audit(row, 'corrected', `Correction: removed ${describe(amount, row)} of ${nameOf(row)} (${reasonText})`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-correct') {
    const row = line(data.stockId), before = stockDetails(catalog(), row);
    const next = {
      materialGroup: limited(data.materialGroup, 'Material group', MAX_LENGTHS.materialGroup, false, 'materialGroup'), articleNo: limited(data.articleNo, 'Article No', MAX_LENGTHS.articleNo),
      uom: limited(data.uom, 'UOM', MAX_LENGTHS.uom, false, 'uom'), description: limited(data.description, 'Description', MAX_LENGTHS.description, false, 'description'),
      dia: limited(data.dia, 'DIA', MAX_LENGTHS.dia), lbs: limited(data.lbs, 'LBS/SCH', MAX_LENGTHS.lbs),
    };
    const reason = text(data.reason);
    if (!(CORRECTION_REASONS as readonly string[]).includes(reason)) throw new AppError(422, 'Choose the reason for this correction.', { reason: 'Choose a reason.' });
    const reasonText = limited(data.reasonText, 'Explanation', MAX_LENGTHS.reasonText, reason === 'Other', 'reasonText');
    const chargeNo = data.chargeNo === undefined ? String(row.chargeNo || '') : limited(data.chargeNo, 'Charge', MAX_LENGTHS.chargeNo);
    const shown: Record<string, string> = { 'Material group': before.group, 'Article No': before.articleNo, UOM: before.uom, Description: before.description, DIA: before.dia, 'LBS/SCH': before.lbs };
    const wanted: Record<string, string> = { 'Material group': next.materialGroup, 'Article No': next.articleNo, UOM: next.uom, Description: next.description, DIA: next.dia, 'LBS/SCH': next.lbs };
    const changes = Object.keys(wanted).filter(name => wanted[name] !== shown[name]).map(name => `${name}: "${shown[name]}" → "${wanted[name]}"`);
    if (chargeNo !== String(row.chargeNo || '')) {
      changes.push(`Charge: "${row.chargeNo || ''}" → "${chargeNo}"`);
      const identity = materialIdentity(row);
      if (store.list('stock').some(other => other.id !== row.id && isStorehouseLine(other) && other.warehouseId === row.warehouseId && materialIdentity(other) === identity && String(other.chargeNo || '') === chargeNo)) throw new AppError(409, 'This storehouse already holds the material with that charge. Move the quantity there instead.', { chargeNo: 'This charge already exists for the material.' });
    }
    if (!changes.length) throw new AppError(422, 'Change at least one value before saving a correction.');
    const updated = store.update('stock', row.id, { ...next, chargeNo, corrected: true }, row._version, actor);
    movement('Correction', row, { warehouseId: String(row.warehouseId) }, 0, { chargeNo, reason, reasonText, note: changes.join('; ') });
    audit(row, 'corrected', `Edited ${nameOf(updated)} (${reason}${reasonText ? `: ${reasonText}` : ''}) · ${changes.join('; ')}`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-adjust') {
    const row = line(data.stockId), reason = text(data.reason);
    if (!(ADJUST_REASONS as readonly string[]).includes(reason)) throw new AppError(422, 'Choose the reason for this adjustment.', { reason: 'Choose a reason.' });
    const reasonText = limited(data.reasonText, 'Explanation', MAX_LENGTHS.reasonText, false, 'reasonText');
    if (typeof data.quantity !== 'number' || !Number.isFinite(data.quantity) || data.quantity < 0 || Math.abs(data.quantity * 100 - Math.round(data.quantity * 100)) > 1e-6) throw new AppError(422, 'The new quantity must be zero or more, in steps of 0.01.', { quantity: 'Enter zero or more, in steps of 0.01.' });
    const target = qty(data.quantity), delta = qty(target - Number(row.quantity));
    const reserved = reservedOnOpenOrders({ transfer_orders: store.list('transfer_orders'), transfer_order_items: store.list('transfer_order_items') }, row);
    if (target < reserved) throw new AppError(422, `The new quantity cannot be below ${reserved}, the quantity reserved on open orders.`, { quantity: `Enter at least ${reserved}, the quantity reserved on open orders.` });
    if (delta === 0) throw new AppError(422, 'The new quantity equals the current quantity.', { quantity: 'Enter a different quantity.' });
    const updated = change(row, delta);
    movement('Adjustment', row, { warehouseId: String(row.warehouseId) }, delta, { reason, reasonText, note: note || reasonText || reason });
    audit(row, 'adjusted', `Adjusted ${nameOf(row)} from ${row.quantity} to ${target} (${reason}${reasonText ? `: ${reasonText}` : ''})`);
    return { resource: 'stock', record: updated };
  }

  if (key === 'stock-remove') {
    const row = line(data.stockId), reason = text(data.reason);
    if (!(REMOVE_REASONS as readonly string[]).includes(reason)) throw new AppError(422, 'Choose the reason for removing this material.', { reason: 'Choose a reason.' });
    const reasonText = limited(data.reasonText, 'Explanation', MAX_LENGTHS.reasonText, false, 'reasonText');
    if (blocksRemoval({ transfer_orders: store.list('transfer_orders'), transfer_order_items: store.list('transfer_order_items') }, row)) throw new AppError(409, 'An open transfer order blocks removal. Complete or cancel it first.');
    const remaining = qty(row.quantity);
    if (remaining > 0) movement('Removal', row, { warehouseId: String(row.warehouseId) }, -remaining, { reason, reasonText, note: note || reasonText || reason });
    const archived = store.archive('stock', row.id, row._version, actor);
    audit(row, 'removed', `Removed ${nameOf(row)} from the storehouse (${reason}${reasonText ? `: ${reasonText}` : ''}); ${remaining} written off`);
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
    const items = Array.isArray(data.items) ? data.items as Input[] : [];
    if (!items.length || items.length > 200) throw new AppError(422, 'Add at least one item to the transfer order.');
    const sources = items.map(item => text(item?.stockId) ? store.get('stock', text(item?.stockId)) : undefined);
    // From the inventory: the active project site. From a storehouse: the chosen one, unless every item carries its own line.
    const fromSiteId = route.from === 'inventory' ? (text(data.fromSiteId) ? site(data.fromSiteId).id : '') : '';
    if (route.from === 'inventory' && !fromSiteId) throw new AppError(422, 'Open the transfer order from the project site whose inventory gives the material.', { fromSiteId: 'Choose a project site.' });
    const carried = route.from === 'storehouse' && sources.every(source => source && isStorehouseLine(source));
    const fromId = route.from === 'storehouse' && text(data.fromWarehouseId) ? storehouse(data.fromWarehouseId).id : '';
    if (route.from === 'storehouse' && !fromId && !carried) throw new AppError(422, 'Choose the storehouse to take material from.', { fromWarehouseId: 'Choose a storehouse.' });
    const siteId = route.to === 'site' || route.to === 'inventory' ? (text(data.siteId) ? site(data.siteId).id : '') : '';
    if (route.to === 'site' && !siteId) throw new AppError(422, 'Choose the project site to transfer to.', { siteId: 'Choose a project site.' });
    if (route.to === 'inventory' && !siteId) throw new AppError(422, 'Open the transfer order from the project site whose inventory receives the material.', { siteId: 'Choose a project site.' });
    if (route.from === 'inventory' && route.to === 'site' && siteId === fromSiteId) throw new AppError(422, 'Choose a different project site.', { siteId: 'Choose a different project site.' });
    const toId = route.to === 'storehouse' ? storehouse(data.toWarehouseId).id : '';
    if (route.to === 'storehouse' && fromId && fromId === toId) throw new AppError(422, 'Choose two different storehouses.', { toWarehouseId: 'Choose a different storehouse.' });
    const rows = catalog();
    /** The certificates ticked on an item: existing certifications of the item's material, each once. */
    const certificateIds = (value: unknown, materialNo: string, number: string) => {
      if (value === undefined || value === null) return '';
      if (!Array.isArray(value) || value.length > 200 || value.some(id => typeof id !== 'string')) throw new AppError(422, `${number}: Choose the certificates from the list.`);
      const known = store.list('certifications');
      for (const id of new Set(value as string[])) {
        const cert = known.find(row => row.id === id), material = cert?.materialId ? store.list('materials').find(row => row.id === cert.materialId) : undefined;
        if (!cert || !material || String(material.materialNo).trim().toLowerCase() !== materialNo.trim().toLowerCase()) throw new AppError(422, `${number}: A chosen certificate does not belong to this material.`);
      }
      return [...new Set(value as string[])].join(',');
    };
    const prepared = items.map((item, index) => {
      const number = `Item ${index + 1}`;
      const source = sources[index];
      if (source && route.from === 'storehouse' && (!isStorehouseLine(source) || (fromId && source.warehouseId !== fromId))) throw new AppError(422, `${number} is not in the chosen storehouse.`);
      if (source && route.from === 'inventory' && (!isSiteStock(source) || source.siteId !== fromSiteId)) throw new AppError(422, `${number} is not in the inventory of this project site.`);
      if (source && route.to === 'storehouse' && source.warehouseId === toId) throw new AppError(422, `${number} is already in that storehouse.`);
      const details = source ? stockDetails(rows, source) : undefined;
      const materialNo = limited(item?.materialNo ?? details?.materialNo, `${number}: Material no.`, MAX_LENGTHS.materialNo, true), amount = positiveQuantity(item?.quantity, `${number}: Quantity`);
      // The quantity may not exceed what the source holds (reference: max = balance); a material the source does not hold at all is left to the completion.
      const same = (row: Row) => stockDetails(rows, row).materialNo.trim().toLowerCase() === materialNo.trim().toLowerCase();
      const held = source ? [source] : route.from === 'inventory' ? siteStock({ stock: store.list('stock') }, fromSiteId).filter(same) : store.list('stock').filter(row => isStorehouseLine(row) && (!fromId || row.warehouseId === fromId) && same(row));
      if (held.length) { const balance = qty(held.reduce((sum, row) => sum + Number(row.quantity), 0)); if (amount > balance + 1e-9) throw new AppError(422, `${number}: Quantity exceeds available balance (${balance}).`, { items: 'Quantity exceeds available balance.' }); }
      return {
        materialNo, description: limited(item?.description ?? details?.description, `${number}: Description`, MAX_LENGTHS.description),
        quantity: amount, uom: limited(item?.uom ?? details?.uom, `${number}: UOM`, MAX_LENGTHS.uom), stockId: source?.id || '', certIds: certificateIds(item?.certIds, materialNo, number),
      };
    });
    const order = store.create('transfer_orders', { number: store.next('TO'), type, priority, status: 'Open', fromWarehouseId: fromId, fromSiteId, siteId, toWarehouseId: toId, date, notes: limited(data.notes, 'Notes', 2000) }, actor);
    for (const item of prepared) store.create('transfer_order_items', { orderId: order.id, ...item }, actor);
    return { resource: 'transfer_orders', record: order };
  }

  function completeOrder(): Result {
    const order = store.get('transfer_orders', data.orderId);
    if (order.status !== 'Open') throw new AppError(409, `This transfer order is already ${String(order.status).toLowerCase()}.`);
    const route = transferRoute(String(order.type))!;
    const items = store.list('transfer_order_items').filter(item => item.orderId === order.id).sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)));
    const replan = () => new AppError(409, 'This transfer order was planned before project site inventories existed. Cancel it and create it again.');
    if (route.from === 'inventory' && !order.fromSiteId) throw replan();
    if (route.from === 'storehouse' && !order.fromWarehouseId && items.some(item => !item.stockId)) throw replan();
    if ((route.to === 'site' || route.to === 'inventory') && !order.siteId) throw replan();
    const rows = catalog();
    const sameNo = (row: Row, materialNo: string) => stockDetails(rows, row).materialNo.trim().toLowerCase() === materialNo.trim().toLowerCase();
    const label = (id: unknown) => String(store.get('warehouses', id).name);
    const siteName = (id: unknown) => String(store.get('sites', id).name);
    const orderFields = { transferOrder: String(order.number) };
    const deliveredTo = route.to === 'storehouse' ? label(order.toWarehouseId) : `the inventory of ${siteName(order.siteId)}`;
    /** Deliver one taken part to the order's destination with the movement of the receiving side. */
    const deliver = (source: Row, take: number, type: string, certIds: string[] = []) => {
      if (route.to === 'storehouse') { receiving(source, String(order.toWarehouseId), take); movement(type, source, { warehouseId: String(order.toWarehouseId) }, take, { ...orderFields, note: `${order.number}` }); }
      else {
        changeSiteStock(store, actor, String(order.siteId), refsOf(source), String(source.chargeNo || ''), take, copyWording(source));
        // The certificates ticked on the item travel with the material to the destination project site.
        const copies = certIds.length ? copyCertificates(source, certIds, String(order.siteId), false) : [];
        movement(type, source, { siteId: String(order.siteId) }, take, { ...orderFields, note: `${order.number}${copies.length ? ` · certificates ${copies.map(cert => `${cert.name} (index ${cert.indexNo})`).join(', ')}` : ''}` });
      }
    };
    for (const item of items) {
      let remaining = qty(item.quantity);
      if (route.from === 'inventory') {
        const from = String(order.fromSiteId);
        const candidates = item.stockId ? [store.get('stock', item.stockId)] : siteStock({ stock: store.list('stock'), ...rows }, from).filter(row => sameNo(row, String(item.materialNo)) && Number(row.quantity) > 0);
        if (item.stockId && (!isSiteStock(candidates[0]) || candidates[0].siteId !== from)) throw new AppError(409, `${item.materialNo} is no longer in the inventory of ${siteName(from)}.`);
        for (const source of candidates) {
          if (remaining <= 0) break;
          const current = store.get('stock', source.id);
          const take = qty(Math.min(remaining, Number(current.quantity)));
          if (take <= 0) continue;
          change(current, -take);
          movement('Transfer out', current, { siteId: from }, -take, { ...orderFields, note: `${order.number} · To ${deliveredTo}` });
          deliver(current, take, 'Transfer in', itemCertIds(item));
          remaining = qty(remaining - take);
        }
        if (remaining > 0) throw new AppError(409, `Not enough ${item.materialNo} in the inventory of ${siteName(from)}. Missing: ${remaining}.`);
      } else {
        const from = String(order.fromWarehouseId || '');
        // A line named by the order is taken first; otherwise the charges of the material number are used in charge order.
        const sources = item.stockId ? [store.get('stock', item.stockId)] : store.list('stock').filter(row => isStorehouseLine(row) && row.warehouseId === from && sameNo(row, String(item.materialNo)) && Number(row.quantity) > 0).sort((a, b) => String(a.chargeNo || '').localeCompare(String(b.chargeNo || '')));
        if (item.stockId && (!isStorehouseLine(sources[0]) || (from && sources[0].warehouseId !== from))) throw new AppError(409, `${item.materialNo} is no longer in ${from ? label(from) : 'its storehouse'}.`);
        const type = route.to === 'site' ? 'Project transfer' : route.to === 'inventory' ? 'Return to inventory' : '';
        for (const source of sources) {
          if (remaining <= 0) break;
          const take = qty(Math.min(remaining, Number(source.quantity)));
          if (take <= 0) continue;
          change(source, -take);
          movement(type || 'Transfer out', source, { warehouseId: String(source.warehouseId), ...(order.siteId ? { siteId: String(order.siteId) } : {}) }, -take, { ...orderFields, note: `${order.number} · To ${deliveredTo}` });
          deliver(source, take, type || 'Transfer in', itemCertIds(item));
          remaining = qty(remaining - take);
        }
        if (remaining > 0) throw new AppError(409, `Not enough ${item.materialNo} in ${from ? label(from) : 'its storehouse'}. Missing: ${remaining}.`);
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
    const filters = { siteId: param('siteId'), projectId: param('projectId'), isoId: param('isoId'), query: param('q').slice(0, 500), ordered: ['Yes', 'No'].includes(param('ordered')) ? param('ordered') : '' };
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
