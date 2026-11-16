import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, Download, History, Loader2, PackageCheck, Printer, ShoppingCart, Undo2 } from 'lucide-react';
import { materialName } from '../shared/materials.ts';
import { PROCUREMENT_PAGES, archivedOrders, dateRangeError, orderDetail, orderPlanning, pendingLines, receiptLog, receiptQuantityErrors, receiptRemaining, toCsv } from '../shared/mto-procurement.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { enabledOptions } from '../shared/weld-catalogs.ts';
import { ApiError, formatDate, formatNumber, post } from './api.ts';
import { Badge, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { WorkflowDialog } from './dialogs.tsx';
import { RecordHistory } from './records.tsx';

const pageOf = (key: string) => PROCUREMENT_PAGES.find(page => page.key === key)!;
const text = (value: unknown, fallback = '—') => String(value ?? '') || fallback;

/** A page of this flow opens only for an account with its permission area and the records it reads. */
function useProcurementAccess(key: string) {
  const { canArea, canRecord } = useWorkspace();
  const page = pageOf(key);
  return canArea(page.scope) && page.resources.every(resource => canRecord(resource));
}
function NoAccess({ title }: { title: string }) {
  return <div className="page mto-procurement-page"><div className="alert error" role="alert"><AlertCircle size={18}/><span>You do not have rights to open this page.</span></div><EmptyState title={title} description="Ask an administrator to add this page to your profile."/></div>;
}
function download(name: string, headers: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function Heading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">MTO PILOT · ORDER / TAKE IN</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;
}
const materialCells = (material: Record<string, unknown> | undefined, line?: Record<string, unknown>) => [text(material?.materialGroup), text(material?.articleNo), text(material?.materialNo ?? line?.materialNo), text(material?.dia ?? line?.dia), text(material?.lbs ?? line?.lbs), text(material?.description ?? line?.description), text(material?.uom ?? line?.uom, '')];

function DateFilters({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const error = dateRangeError(from, to);
  return <><div className="field"><label htmlFor="procurement-from">From date</label><input id="procurement-from" type="date" value={from} max={to || undefined} onChange={e => onFrom(e.target.value)} aria-invalid={Boolean(error)}/></div>
    <div className="field"><label htmlFor="procurement-to">To date</label><input id="procurement-to" type="date" value={to} min={from || undefined} onChange={e => onTo(e.target.value)} aria-invalid={Boolean(error)}/>{error && <small className="field-error" role="alert">{error}</small>}</div></>;
}

/** Order materials: one row per material, summed over the isometrics that still need it. */
export function OrderMaterials() {
  const { rows, canRun } = useWorkspace();
  const allowed = useProcurementAccess('order-materials');
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [ordering, setOrdering] = useState(false);
  const planning = useMemo(() => orderPlanning(rows, { projectId, isoId, query }), [rows, projectId, isoId, query]);
  const checked = planning.filter(group => selected.includes(group.identity));
  const requirementIds = checked.flatMap(group => group.requirementIds);
  if (!allowed) return <NoAccess title="Order materials"/>;
  const toggle = (identity: string, on: boolean) => setSelected(old => on ? [...new Set([...old, identity])] : old.filter(id => id !== identity));
  const exportRows = (checked.length ? checked : planning);
  return <div className="page mto-procurement-page"><Heading title="Order materials" description="Materials still to be ordered, added up over the isometrics that need them. Check the rows to order and create one order.">
    <button className="btn" disabled={!exportRows.length} onClick={() => download('order-materials.csv', ['Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM'], exportRows.map(g => { const c = materialCells(g.material); return [c[0], c[1], c[2], c[3], c[4], c[5], g.quantity, c[6]]; }))}><Download size={16}/>Export</button>
    {canRun('order-requirements') && <button className="btn primary" disabled={!requirementIds.length} onClick={() => setOrdering(true)}><ShoppingCart size={16}/>Order checked materials{checked.length ? ` (${checked.length})` : ''}</button>}
  </Heading>
    <section className="panel procurement-panel">
      <div className="procurement-filters"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={v => { setProject(String(v)); setIso(''); setSelected([]); }}/><FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={v => { setIso(String(v)); setSelected([]); }}/><button className="text-link" onClick={() => { setProject(''); setIso(''); setQuery(''); setSelected([]); }}>Clear filters</button></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={v => { setQuery(v); setSelected([]); }} placeholder="Search material, group or article…"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Materials waiting to be ordered</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th className="select-cell"><input type="checkbox" aria-label="Check all materials in this list" checked={planning.length > 0 && checked.length === planning.length} disabled={!planning.length} onChange={e => setSelected(e.target.checked ? planning.map(g => g.identity) : [])}/></th></tr></thead>
        <tbody>{planning.map(group => { const c = materialCells(group.material); return <tr key={group.identity}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(group.quantity, 3)}<small className="execution-subvalue">{group.isoIds.length} isometric{group.isoIds.length === 1 ? '' : 's'}</small></td><td>{c[6]}</td><td className="select-cell"><input type="checkbox" aria-label={`Check ${c[2]}`} checked={selected.includes(group.identity)} onChange={e => toggle(group.identity, e.target.checked)}/></td></tr>; })}</tbody></table></TableScroll>
      {!planning.length && <EmptyState title="Nothing waiting to be ordered" description={projectId || isoId || query ? 'No material matches these filters. Clear them to see everything.' : 'Every material requirement is already on an order.'}/>}
      <div className="table-footer"><span>{planning.length} material{planning.length === 1 ? '' : 's'}{checked.length ? ` · ${checked.length} checked` : ''}</span><span>Only the quantity not yet ordered is ordered. The supplier is assigned when the delivery is taken in.</span></div>
    </section>
    {ordering && <WorkflowDialog actionKey="order-requirements" defaults={{ requirementIds }} copy={{ title: 'Order checked materials', description: 'Create one order for the quantities of the checked materials that are not ordered yet.', submit: 'Create order' }} onClose={() => { setOrdering(false); setSelected([]); }}/>}
  </div>;
}

/** Pending order: ordered against received for every order line that is still open. */
export function PendingOrders() {
  const { rows, label, canRun } = useWorkspace();
  const allowed = useProcurementAccess('pending-order');
  const [projectId, setProject] = useState(''); const [query, setQuery] = useState(''); const [takeIn, setTakeIn] = useState('');
  const lines = useMemo(() => pendingLines(rows, { projectId, query }), [rows, projectId, query]);
  if (!allowed) return <NoAccess title="Pending order"/>;
  return <div className="page mto-procurement-page"><Heading title="Pending order" description="What was ordered and what has arrived so far, for every order that is still open.">
    <button className="btn" disabled={!lines.length} onClick={() => download('pending-order.csv', ['Group', 'Material No', 'Description', 'Ordered', 'Ord. No.', 'Date', 'Received'], lines.map(l => [text(l.material?.materialGroup, ''), materialName(rows, l.line), text(l.line.description ?? l.material?.description, ''), l.line.quantity, l.order.number, l.order.date, l.line.received]))}><Download size={16}/>CSV</button>
    <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>
  </Heading>
    <section className="panel procurement-panel">
      <div className="procurement-filters"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={v => setProject(String(v))}/></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search material or order number…"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Order lines that are not received in full</caption><thead><tr><th>Group</th><th>Material No</th><th>Description</th><th className="number-cell">Ordered</th><th>Ord. No.</th><th>Date</th><th className="number-cell">Received</th>{canRun('receive') && <th className="actions-cell"><span className="sr-only">Options</span></th>}</tr></thead>
        <tbody>{lines.map(({ line, order, material, outstanding }) => <tr key={line.id}><td>{text(material?.materialGroup)}</td><td>{materialName(rows, line)}</td><td className="description-cell">{text(line.description ?? material?.description)}</td><td className="number-cell">{formatNumber(line.quantity, 3)} {text(line.uom ?? material?.uom, '')}</td><td>{String(order.number)}</td><td>{formatDate(order.date)}</td><td className="number-cell">{formatNumber(line.received, 3)}<small className="execution-subvalue">{formatNumber(outstanding, 3)} open</small></td>{canRun('receive') && <td className="actions-cell"><button className="btn small" onClick={() => setTakeIn(order.id)}><PackageCheck size={14}/>Take in</button></td>}</tr>)}</tbody></table></TableScroll>
      {!lines.length && <EmptyState title="No pending orders" description={projectId || query ? 'No open order line matches these filters.' : 'Everything ordered has been received.'}/>}
      <div className="table-footer"><span>{lines.length} open line{lines.length === 1 ? '' : 's'}</span><span>{projectId ? label('projects', projectId) : 'All projects in view'}</span></div>
    </section>
    {takeIn && <ReceiveDialog orderId={takeIn} onClose={() => setTakeIn('')}/>}
  </div>;
}

/** Material take in: the log of receipts, with the Receive materials dialog and corrections. */
export function MaterialTakeIn() {
  const { rows, label, canRun } = useWorkspace();
  const allowed = useProcurementAccess('take-in');
  const [projectId, setProject] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [query, setQuery] = useState('');
  const [receiving, setReceiving] = useState(false); const [correcting, setCorrecting] = useState('');
  const rangeError = dateRangeError(from, to);
  const log = useMemo(() => rangeError ? [] : receiptLog(rows, { projectId, from, to, query }), [rows, projectId, from, to, query, rangeError]);
  if (!allowed) return <NoAccess title="Material take in"/>;
  return <div className="page mto-procurement-page"><Heading title="Material take in" description="Every delivery taken in against an order. Corrections are shown as negative quantities.">
    <button className="btn" disabled={!log.length} onClick={() => download('material-take-in.csv', ['Date', 'Order No.', 'Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM', 'Supplier'], log.map(e => { const c = materialCells(e.material, e.receipt); return [e.receipt.date, e.order?.number ?? '', c[0], c[1], c[2], c[3], c[4], c[5], e.receipt.quantity, c[6], e.supplierId ? label('suppliers', e.supplierId) : '']; }))}><Download size={16}/>CSV</button>
    {canRun('receive') && <button className="btn primary" onClick={() => setReceiving(true)}><PackageCheck size={16}/>Receive materials</button>}
  </Heading>
    <section className="panel procurement-panel">
      <div className="procurement-filters"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={v => setProject(String(v))}/><DateFilters from={from} to={to} onFrom={setFrom} onTo={setTo}/></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search order, material or charge number…"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Log of material receipts</caption><thead><tr><th>Date</th><th>Order No.</th><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th>Supplier</th>{canRun('correct-receipt') && <th className="actions-cell"><span className="sr-only">Options</span></th>}</tr></thead>
        <tbody>{log.map(({ receipt, order, material, supplierId }) => { const c = materialCells(material, receipt); const left = receiptRemaining(rows, receipt); const negative = Number(receipt.quantity) < 0; return <tr key={receipt.id} className={negative ? 'correction-row' : undefined}><td>{formatDate(receipt.date)}</td><td>{order ? String(order.number) : '—'}</td><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}{receipt.chargeNo ? <small className="execution-subvalue">Charge {String(receipt.chargeNo)}</small> : null}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}{receipt.note && negative ? <small className="execution-subvalue">{String(receipt.note)}</small> : null}</td><td className="number-cell">{negative ? <Badge color="red">{formatNumber(receipt.quantity, 3)}</Badge> : formatNumber(receipt.quantity, 3)}</td><td>{c[6]}</td><td>{supplierId ? label('suppliers', supplierId) : '—'}</td>{canRun('correct-receipt') && <td className="actions-cell">{!negative && left > 0 && <button className="btn small" onClick={() => setCorrecting(receipt.id)}><Undo2 size={14}/>Correct</button>}</td>}</tr>; })}</tbody></table></TableScroll>
      {!log.length && <EmptyState title="No receipts" description={rangeError || (projectId || from || to || query ? 'No receipt matches these filters.' : 'Deliveries appear here once they are taken in against an order.')}/>}
      <div className="table-footer"><span>{log.length} entr{log.length === 1 ? 'y' : 'ies'}</span><span>A correction needs the edit right on receipts and a reason. Stock never goes below zero.</span></div>
    </section>
    {receiving && <ReceiveDialog onClose={() => setReceiving(false)}/>}
    {correcting && <CorrectionDialog receiptId={correcting} onClose={() => setCorrecting('')}/>}
  </div>;
}

/** Receive materials: choose the order and supplier, then the quantity per line. Over-receipt is refused. */
export function ReceiveDialog({ orderId = '', onClose }: { orderId?: string; onClose: () => void }) {
  const { rows, refresh, notify, siteId } = useWorkspace();
  const orders = activeRows(rows, 'orders').filter(order => ['Pending', 'Partially received'].includes(String(order.status))).sort((a, b) => String(b.number).localeCompare(String(a.number)));
  const warehouses = activeRows(rows, 'warehouses').filter(row => row.use !== 'Tools');
  const [order, setOrder] = useState(orderId); const [supplierId, setSupplier] = useState(() => String(rows.orders?.find(o => o.id === orderId)?.supplierId || ''));
  const [warehouseId, setWarehouse] = useState(warehouses.length === 1 ? warehouses[0].id : ''); const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({}); const [charges, setCharges] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const lines = activeRows(rows, 'order_lines').filter(line => line.orderId === order && Number(line.received) < Number(line.quantity));
  const errors = receiptQuantityErrors(lines.map(line => ({ lineId: line.id, outstanding: Math.round((Number(line.quantity) - Number(line.received)) * 1e6) / 1e6, quantity: quantities[line.id] })));
  const items = lines.filter(line => Number(quantities[line.id]) > 0).map(line => ({ lineId: line.id, quantity: Number(quantities[line.id]), chargeNo: charges[line.id] || '' }));
  // A take-in goes into the Material inventory of the order's project site; only an order of no project site needs a storehouse.
  const siteOfProject = (projectId: unknown) => String(rows.projects?.find(project => project.id === projectId)?.siteId || '');
  const needsStorehouse = Boolean(order) && lines.some(line => !siteOfProject(rows.isometrics?.find(iso => iso.id === line.isoId)?.projectId) && !siteOfProject(rows.orders?.find(o => o.id === order)?.projectId));
  // Suppliers switched off on the active main project are not offered ("Enabled on this site"); the order's supplier stays.
  const suppliers = enabledOptions('suppliers', activeRows(rows, 'suppliers'), siteId, rows, supplierId);
  function choose(id: string) { setOrder(id); setQuantities({}); setCharges({}); setSupplier(String(rows.orders?.find(o => o.id === id)?.supplierId || '')); setError(''); setFields({}); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setFields({});
    if (!order) return setError('Choose the order that was delivered.');
    if (!supplierId) return setFields({ supplierId: 'Choose the delivery supplier.' });
    if (needsStorehouse && warehouses.length > 1 && !warehouseId) return setFields({ warehouseId: 'Choose the receiving storehouse.' });
    if (Object.keys(errors).length) return setError('Fix the quantities marked below.');
    if (!items.length) return setError('Enter a received quantity for at least one line.');
    setBusy(true);
    try { await post('/actions/receive', { orderId: order, supplierId, ...(needsStorehouse ? { warehouseId } : {}), date, note, items }); await refresh(); notify('Materials taken in.'); onClose(); }
    catch (e) { setError((e as Error).message); setFields((e as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title="Receive materials" subtitle="Choose the order and supplier, then enter what arrived. The whole delivery is saved together or not at all." onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        <div className="field"><label htmlFor="receive-order">Order No.</label><select id="receive-order" required value={order} onChange={e => choose(e.target.value)}><option value="">Choose an order</option>{orders.map(o => <option key={o.id} value={o.id}>{String(o.number)} | {formatDate(o.date)}</option>)}</select>{!orders.length && <small>No open orders to take in.</small>}</div>
        <div className="field"><label htmlFor="receive-supplier">Supplier</label><select id="receive-supplier" required aria-invalid={Boolean(fields.supplierId)} value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">Choose a supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{String(s.name)}</option>)}</select>{fields.supplierId && <small className="field-error" role="alert">{fields.supplierId}</small>}{!suppliers.length && <small>No suppliers are available to your account.</small>}</div>
        {needsStorehouse && warehouses.length > 1 && <div className="field"><label htmlFor="receive-warehouse">Receiving storehouse</label><select id="receive-warehouse" required aria-invalid={Boolean(fields.warehouseId)} value={warehouseId} onChange={e => setWarehouse(e.target.value)}><option value="">Choose a storehouse</option>{warehouses.map(w => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</select>{fields.warehouseId && <small className="field-error" role="alert">{fields.warehouseId}</small>}</div>}
        <div className="field"><label htmlFor="receive-date">Date</label><input id="receive-date" type="date" required value={date} onChange={e => setDate(e.target.value)}/></div>
        <div className="field wide-field"><label htmlFor="receive-note">Notes</label><textarea id="receive-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)}/></div>
      </div>
      {order && <section className="line-items"><h3>Outstanding materials <span className="count-pill">{lines.length}</span></h3>{lines.length ? lines.map(line => { const outstanding = Math.round((Number(line.quantity) - Number(line.received)) * 1e6) / 1e6; const name = materialName(rows, line); return <div className="receipt-line" key={line.id}><div><strong>{name}</strong><small>{text(line.description, '')}</small><small>{formatNumber(outstanding, 3)} outstanding of {formatNumber(line.quantity, 3)} {text(line.uom, '')}</small></div>
        <label>Receive now<input type="number" inputMode="decimal" min="0" max={outstanding} step="any" aria-label={`Receive ${name}`} aria-invalid={Boolean(errors[line.id])} value={quantities[line.id] ?? ''} placeholder="0" onChange={e => setQuantities(old => ({ ...old, [line.id]: e.target.value }))}/>{errors[line.id] && <small className="field-error" role="alert">{errors[line.id]}</small>}</label>
        <label>Charge / heat number<input aria-label={`Charge number ${name}`} maxLength={100} value={charges[line.id] ?? ''} onChange={e => setCharges(old => ({ ...old, [line.id]: e.target.value }))}/></label></div>; }) : <p className="muted">Everything on this order has been received.</p>}</section>}
      {order && !needsStorehouse && <p className="muted">The materials go into the Material inventory of the order’s project site.</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy || !order}>{busy && <Loader2 size={15} className="spin"/>}Record receipt</button></div></form></Modal>;
}

/** Correction of a receipt: a negative entry with a reason; stock may not go below zero (the server decides). */
export function CorrectionDialog({ receiptId, onClose }: { receiptId: string; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const receipt = rows.receipts?.find(r => r.id === receiptId); const remaining = receipt ? receiptRemaining(rows, receipt) : 0;
  const [quantity, setQuantity] = useState(''); const [reason, setReason] = useState(''); const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  if (!receipt) return null;
  const amount = Number(quantity); const quantityError = quantity !== '' && (!(amount > 0) || amount > remaining) ? `Enter a quantity between 0 and ${remaining}.` : '';
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setFields({});
    if (!quantity || quantityError) return setFields({ quantity: quantityError || 'Enter the quantity to take back.' });
    if (!reason.trim()) return setFields({ note: 'A reason is required.' });
    setBusy(true);
    try { await post('/actions/correct-receipt', { receiptId, quantity: amount, date, note: reason.trim() }); await refresh(); notify('Correction recorded.'); onClose(); }
    catch (e) { setError((e as Error).message); setFields((e as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title="Correct receipt" subtitle={`${materialName(rows, receipt)} · received ${formatNumber(receipt.quantity, 3)} · ${formatNumber(remaining, 3)} can still be corrected`} onClose={onClose}>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        <div className="field"><label htmlFor="correct-quantity">Quantity to take back</label><input id="correct-quantity" type="number" inputMode="decimal" min="0" max={remaining} step="any" required aria-invalid={Boolean(fields.quantity || quantityError)} value={quantity} onChange={e => setQuantity(e.target.value)}/>{(fields.quantity || quantityError) && <small className="field-error" role="alert">{fields.quantity || quantityError}</small>}</div>
        <div className="field"><label htmlFor="correct-date">Date</label><input id="correct-date" type="date" required value={date} onChange={e => setDate(e.target.value)}/></div>
        <div className="field wide-field"><label htmlFor="correct-reason">Reason</label><textarea id="correct-reason" required maxLength={500} aria-invalid={Boolean(fields.note)} value={reason} onChange={e => setReason(e.target.value)}/>{fields.note && <small className="field-error" role="alert">{fields.note}</small>}</div>
      </div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Record correction</button></div></form></Modal>;
}

/** Order archive: every order in a date range with its detail and audit trail. */
export function OrderArchive() {
  const { rows, label } = useWorkspace();
  const allowed = useProcurementAccess('order-archive');
  const [projectId, setProject] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  // A link from the Ord.? column of an isometric (?order=<id>) opens that order.
  const [detail, setDetail] = useState(() => new URLSearchParams(window.location.search).get('order') || ''); const [trail, setTrail] = useState('');
  const rangeError = dateRangeError(from, to);
  const orders = useMemo(() => rangeError ? [] : archivedOrders(rows, { projectId, from, to }), [rows, projectId, from, to, rangeError]);
  if (!allowed) return <NoAccess title="Order archive"/>;
  const open = orders.find(o => o.id === detail);
  return <div className="page mto-procurement-page"><Heading title="Order archive" description="All orders by date. Open an order to see its lines or its audit trail.">
    <button className="btn" disabled={!orders.length} onClick={() => download('order-archive.csv', ['Date', 'Request number', 'Assigned supplier', 'Status'], orders.map(o => [o.date, o.number, o.supplierId ? label('suppliers', o.supplierId) : '', o.status]))}><Download size={16}/>CSV</button>
  </Heading>
    <section className="panel procurement-panel">
      <div className="procurement-filters"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={v => setProject(String(v))}/><DateFilters from={from} to={to} onFrom={setFrom} onTo={setTo}/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Archive of material orders</caption><thead><tr><th>Date</th><th>Request number</th><th>Assigned supplier</th><th>Status</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{orders.map(order => <tr key={order.id}><td>{formatDate(order.date)}</td><td>{String(order.number)}</td><td>{order.supplierId ? label('suppliers', order.supplierId) : <span className="muted">Assigned at take-in</span>}</td><td><Badge>{String(order.status)}</Badge></td><td className="actions-cell"><button className="btn small" onClick={() => setDetail(order.id)}>Order detail</button><button className="btn small" onClick={() => setTrail(order.id)}><History size={14}/>Audit trail</button></td></tr>)}</tbody></table></TableScroll>
      {!orders.length && <EmptyState title="No orders" description={rangeError || (projectId || from || to ? 'No order falls in this range. Widen the dates or clear the project.' : 'Orders appear here once materials are ordered.')}/>}
      <div className="table-footer"><span>{orders.length} order{orders.length === 1 ? '' : 's'}</span><span>Newest first</span></div>
    </section>
    {open && <OrderDetailDialog orderId={open.id} onClose={() => setDetail('')}/>}
    {trail && <Modal title="Audit trail" subtitle={`Order ${String(rows.orders?.find(o => o.id === trail)?.number || '')}`} onClose={() => setTrail('')}><div className="modal-body"><RecordHistory resource="orders" id={trail}/></div></Modal>}
  </div>;
}

function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { rows, label } = useWorkspace();
  const order = rows.orders?.find(o => o.id === orderId); const lines = orderDetail(rows, orderId);
  if (!order) return null;
  return <Modal title={`Order ${String(order.number)}`} subtitle={`${formatDate(order.date)} · ${order.supplierId ? label('suppliers', order.supplierId) : 'Supplier assigned at take-in'} · ${String(order.status)}`} onClose={onClose} wide><div className="modal-body">
    {order.note ? <p>{String(order.note)}</p> : null}
    <TableScroll><table className="data-table"><caption className="sr-only">Lines of this order</caption><thead><tr><th>Material No</th><th>Description</th><th>Isometric</th><th className="number-cell">Ordered</th><th className="number-cell">Received</th><th className="number-cell">Open</th><th>UOM</th></tr></thead>
      <tbody>{lines.map(({ line, material, outstanding }) => <tr key={line.id}><td>{materialName(rows, line)}</td><td className="description-cell">{text(line.description ?? material?.description)}</td><td>{line.isoId ? label('isometrics', line.isoId) : '—'}</td><td className="number-cell">{formatNumber(line.quantity, 3)}</td><td className="number-cell">{formatNumber(line.received, 3)}</td><td className="number-cell">{formatNumber(outstanding, 3)}</td><td>{text(line.uom ?? material?.uom, '')}</td></tr>)}</tbody></table></TableScroll>
    {!lines.length && <EmptyState title="No lines" description="This order has no material lines."/>}
  </div></Modal>;
}
