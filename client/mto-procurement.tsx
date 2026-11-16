import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Download, ExternalLink, Link2, List, Loader2, PackageCheck, Printer, ShoppingCart } from 'lucide-react';
import { materialName } from '../shared/materials.ts';
import { PROCUREMENT_PAGES, archiveDefaultRange, archivedOrders, dateRangeError, momentOf, orderChoiceText, orderDetail, orderMoment, orderPlanning, pendingLines, printMoment, receiptItems, receiptLog, receiptMoment, receiptQuantityErrors, receivableOrders, supplierChoiceText, toCsv } from '../shared/mto-procurement.ts';
import type { Row } from '../shared/types.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { enabledOptions } from '../shared/weld-catalogs.ts';
import { ApiError, apiUrl, formatDate, formatNumber, post } from './api.ts';
import { EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { exportTable, useTableRights } from './table-export.ts';
import { ORDER_MATERIALS_EXPORT_COLUMNS } from '../shared/export-tables.ts';

const pageOf = (key: string) => PROCUREMENT_PAGES.find(page => page.key === key)!;
const text = (value: unknown, fallback = '—') => String(value ?? '') || fallback;
/** Today in local time, as yyyy-mm-dd. */
const localToday = () => momentOf('', new Date().toISOString()).date;
const orderPdfPath = (orderId: string) => `/pdf/order-materials?orderId=${encodeURIComponent(orderId)}`;

/** A page of this flow opens only for an account with its permission area and the records it reads. */
function useProcurementAccess(key: string) {
  const { canArea, canRecord } = useWorkspace();
  const page = pageOf(key);
  return canArea(page.scope) && page.resources.every(resource => canRecord(resource));
}
/** The order document may be printed with the print right of Order materials (13) or Order archive (17). */
function useOrderPdf() {
  const { canArea, canReadReport, hasFeature } = useWorkspace();
  return hasFeature('pilots') && canReadReport('pdf-order', 'export') && (canArea('13', 'print') || canArea('17', 'print'));
}
function NoAccess({ title }: { title: string }) {
  return <div className="page mto-procurement-page"><div className="alert error" role="alert"><AlertCircle size={18}/><span>You do not have rights to open this page.</span></div><EmptyState title={title} description="Ask an administrator to add this page to your profile."/></div>;
}
/** CSV or Excel of a table of these pages: the server writes the file and checks the Export right of the table's area (shared/export-tables.ts). */
function useTableSender() {
  const { notify } = useWorkspace(); const rights = useTableRights();
  return { ...rights, send: (table: string, format: 'csv' | 'xlsx', name: string, headers: string[], lines: unknown[][]) => { void exportTable(table, format, headers, lines, name).catch(problem => notify((problem as Error).message || 'The file could not be created.')); } };
}
function Heading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">MTO PILOT · ORDER / TAKE IN</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;
}
const materialCells = (material: Record<string, unknown> | undefined, line?: Record<string, unknown>) => [text(material?.materialGroup), text(material?.articleNo), text(material?.materialNo ?? line?.materialNo), text(material?.dia ?? line?.dia), text(material?.lbs ?? line?.lbs), text(material?.description ?? line?.description), text(material?.uom ?? line?.uom, '')];

/** A plain select whose empty choice reads like the reference ("All projects", "All isometrics"). */
function ChoiceFilter({ id, label, empty, value, options, onChange }: { id: string; label: string; empty: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={event => onChange(event.target.value)}><option value="">{empty}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

/** Order materials: one row per material, summed over the isometrics that still need it, less what open orders still bring. */
export function OrderMaterials() {
  const { rows, label, canRun, refresh, notify } = useWorkspace();
  const { canExport, canPrint, send } = useTableSender();
  const allowed = useProcurementAccess('order-materials');
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [created, setCreated] = useState<{ number: string; url: string } | null>(null);
  const planning = useMemo(() => orderPlanning(rows, { projectId, isoId, query }), [rows, projectId, isoId, query]);
  const checked = planning.filter(group => selected.includes(group.identity));
  const requirementIds = checked.flatMap(group => group.requirementIds);
  if (!allowed) return <NoAccess title="Order materials"/>;
  const toggle = (identity: string, on: boolean) => setSelected(old => on ? [...new Set([...old, identity])] : old.filter(id => id !== identity));
  const exportRows = (checked.length ? checked : planning);
  const projects = activeRows(rows, 'projects').map(project => ({ value: project.id, label: label('projects', project.id) }));
  const isometrics = projectId ? activeRows(rows, 'isometrics').filter(iso => iso.projectId === projectId).map(iso => ({ value: iso.id, label: String(iso.isoNo ?? '') })) : [];
  // One click: the order is created for the checked rows and its PDF opens in a new tab (opened before the request so it is not blocked).
  async function orderChecked() {
    setError(''); setCreated(null); setBusy(true);
    const tab = window.open('', '_blank');
    try {
      const { record } = await post<{ record: Row }>('/actions/order-requirements', { requirementIds });
      const url = apiUrl(orderPdfPath(record.id));
      if (tab) tab.location.href = url;
      setCreated({ number: String(record.number), url }); setSelected([]);
      await refresh(); notify(`Order ${String(record.number)} created.`);
    } catch (problem) { tab?.close(); setError(problem instanceof ApiError || problem instanceof Error ? problem.message : 'The order could not be created.'); } finally { setBusy(false); }
  }
  return <div className="page mto-procurement-page"><Heading title="Order materials" description="Materials still to be ordered, added up over the isometrics that need them. Check the rows and order them: the order document opens in a new tab.">
    {canExport('order-materials') && <button className="btn" disabled={!exportRows.length} onClick={() => send('order-materials', 'xlsx', 'order-materials', [...ORDER_MATERIALS_EXPORT_COLUMNS], exportRows.map(g => { const c = materialCells(g.material); return [c[0], c[1], c[2], c[3], c[4], c[5], g.quantity, c[6]]; }))}><Download size={16}/>Export</button>}
    {canRun('order-requirements') && <button className="btn primary" disabled={!requirementIds.length || busy} onClick={() => void orderChecked()}>{busy ? <Loader2 size={16} className="spin"/> : <ShoppingCart size={16}/>}Order checked materials{checked.length ? ` (${checked.length})` : ''}</button>}
  </Heading>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {created && <div className="alert success" role="status">Order {created.number} was created. <a className="text-link" href={created.url} target="_blank" rel="noreferrer">Open the order document<ExternalLink size={13} aria-hidden="true"/></a></div>}
    <section className="panel procurement-panel">
      <div className="procurement-filters"><ChoiceFilter id="order-materials-project" label="Project" empty="All projects" value={projectId} options={projects} onChange={value => { setProject(value); setIso(''); setSelected([]); }}/><ChoiceFilter id="order-materials-iso" label="Isometric" empty="All isometrics" value={isoId} options={isometrics} onChange={value => { setIso(value); setSelected([]); }}/></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={v => { setQuery(v); setSelected([]); }} placeholder="Search"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Materials waiting to be ordered</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th className="select-cell"><input type="checkbox" aria-label="Check all" title="Check all" checked={planning.length > 0 && checked.length === planning.length} disabled={!planning.length} onChange={e => setSelected(e.target.checked ? planning.map(g => g.identity) : [])}/></th></tr></thead>
        <tbody>{planning.map(group => { const c = materialCells(group.material); return <tr key={group.identity}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(group.quantity, 3)}</td><td>{c[6]}</td><td className="select-cell"><input type="checkbox" aria-label={`Check ${c[2]}`} checked={selected.includes(group.identity)} onChange={e => toggle(group.identity, e.target.checked)}/></td></tr>; })}</tbody></table></TableScroll>
      {!planning.length && <EmptyState title="Nothing waiting to be ordered" description={projectId || isoId || query ? 'No material matches these filters.' : 'Every material requirement is already on an order.'}/>}
      <div className="table-footer"><span>{planning.length} material{planning.length === 1 ? '' : 's'}{checked.length ? ` · ${checked.length} checked` : ''}</span><span>Open orders of a material are subtracted. The supplier is assigned in Order archive.</span></div>
    </section>
  </div>;
}

/** Pending order: ordered against received for every order line that is still open. */
export function PendingOrders() {
  const { rows, label, canRun } = useWorkspace();
  const { canExport, canPrint, send } = useTableSender();
  const allowed = useProcurementAccess('pending-order');
  const [projectId, setProject] = useState(''); const [query, setQuery] = useState(''); const [takeIn, setTakeIn] = useState('');
  const lines = useMemo(() => pendingLines(rows, { projectId, query }), [rows, projectId, query]);
  if (!allowed) return <NoAccess title="Pending order"/>;
  return <div className="page mto-procurement-page"><Heading title="Pending order" description="What was ordered and what has arrived so far, for every order that is still open.">
    {canExport('pending-order') && <><button className="btn" disabled={!lines.length} onClick={() => send('pending-order', 'csv', 'pending-order', ['Group', 'Material No', 'Description', 'Ordered', 'Ord. No.', 'Date', 'Received'], lines.map(l => [text(l.material?.materialGroup, ''), materialName(rows, l.line), text(l.line.description ?? l.material?.description, ''), l.line.quantity, l.order.number, l.order.date, l.line.received]))}><Download size={16}/>CSV</button><button className="btn" disabled={!lines.length} onClick={() => send('pending-order', 'xlsx', 'pending-order', ['Group', 'Material No', 'Description', 'Ordered', 'Ord. No.', 'Date', 'Received'], lines.map(l => [text(l.material?.materialGroup, ''), materialName(rows, l.line), text(l.line.description ?? l.material?.description, ''), l.line.quantity, l.order.number, l.order.date, l.line.received]))}><Download size={16}/>Excel</button></>}
    {canPrint('pending-order') && <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>}
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

/** Material take in: the log of receipts and the Receive materials button; with an order chosen, its take-in page (step 2). */
export function MaterialTakeIn() {
  const { rows, label, canRun } = useWorkspace();
  const { canExport, canPrint, send } = useTableSender();
  const allowed = useProcurementAccess('take-in');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(''); const [receiving, setReceiving] = useState(false);
  const log = useMemo(() => receiptLog(rows, { query }), [rows, query]);
  if (!allowed) return <NoAccess title="Material take in"/>;
  const orderId = params.get('order') || '';
  if (orderId) return <TakeInOrder orderId={orderId} supplierId={params.get('supplier') || ''} onDone={() => setParams({})}/>;
  return <div className="page mto-procurement-page"><Heading title="Material take in" description="Every delivery taken in against an order. Negative quantities correct an earlier receipt.">
    {canExport('take-in') && <><button className="btn" disabled={!log.length} onClick={() => send('take-in', 'csv', 'material-take-in', ['Date', 'Order No.', 'Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM', 'Supplier'], log.map(e => { const c = materialCells(e.material, e.receipt); return [printMoment(receiptMoment(e.receipt)), e.order?.number ?? '', c[0], c[1], c[2], c[3], c[4], c[5], e.receipt.quantity, c[6], e.supplierId ? label('suppliers', e.supplierId) : '']; }))}><Download size={16}/>CSV</button><button className="btn" disabled={!log.length} onClick={() => send('take-in', 'xlsx', 'material-take-in', ['Date', 'Order No.', 'Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM', 'Supplier'], log.map(e => { const c = materialCells(e.material, e.receipt); return [printMoment(receiptMoment(e.receipt)), e.order?.number ?? '', c[0], c[1], c[2], c[3], c[4], c[5], e.receipt.quantity, c[6], e.supplierId ? label('suppliers', e.supplierId) : '']; }))}><Download size={16}/>Excel</button></>}
    {canPrint('take-in') && <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>}
    {canRun('receive') && <button className="btn primary" onClick={() => setReceiving(true)}><PackageCheck size={16}/>Receive materials</button>}
  </Heading>
    <section className="panel procurement-panel">
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Log of material receipts</caption><thead><tr><th>Date</th><th>Order No.</th><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th>Supplier</th></tr></thead>
        <tbody>{log.map(({ receipt, order, material, supplierId }) => { const c = materialCells(material, receipt); const negative = Number(receipt.quantity) < 0; return <tr key={receipt.id} className={negative ? 'correction-row' : undefined}><td>{printMoment(receiptMoment(receipt))}</td><td>{order ? String(order.number) : '—'}</td><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(receipt.quantity, 3)}</td><td>{c[6]}</td><td>{supplierId ? label('suppliers', supplierId) : '—'}</td></tr>; })}</tbody></table></TableScroll>
      {!log.length && <EmptyState title="No receipts" description={query ? 'No receipt matches this search.' : 'Deliveries appear here once they are taken in against an order.'}/>}
      <div className="table-footer"><span>{log.length} entr{log.length === 1 ? 'y' : 'ies'}</span><span>A correction is entered as a negative Today rec. quantity and can take back at most what was received.</span></div>
    </section>
    {receiving && <ReceiveDialog onClose={() => setReceiving(false)}/>}
  </div>;
}

/** Receive materials, step 1: the order (every order, newest first and preselected) and the supplier (first preselected). Add opens the order's take-in page. */
export function ReceiveDialog({ orderId = '', onClose }: { orderId?: string; onClose: () => void }) {
  const { rows, siteId } = useWorkspace(); const [, setParams] = useSearchParams();
  const orders = receivableOrders(rows);
  // Suppliers switched off on the active main project are not offered ("Enabled on this site").
  const suppliers = enabledOptions('suppliers', activeRows(rows, 'suppliers'), siteId, rows);
  const [order, setOrder] = useState(orderId || orders[0]?.id || ''); const [supplierId, setSupplier] = useState(suppliers[0]?.id || '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!order) return setError('Choose the order that was delivered.');
    if (!supplierId) return setError('Choose the delivery supplier.');
    onClose(); setParams({ order, supplier: supplierId });
  }
  return <Modal title="Receive materials" onClose={onClose}>
    <form onSubmit={submit} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        <div className="field wide-field"><label htmlFor="receive-order">Order No.</label><select id="receive-order" required value={order} onChange={e => setOrder(e.target.value)}>{orders.map(o => <option key={o.id} value={o.id}>{orderChoiceText(o)}</option>)}</select>{!orders.length && <small>There are no orders to take in.</small>}</div>
        <div className="field wide-field"><label htmlFor="receive-supplier">Supplier</label><select id="receive-supplier" required value={supplierId} onChange={e => setSupplier(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{String(s.name)}</option>)}</select>{!suppliers.length && <small>No suppliers are available to your account.</small>}</div>
      </div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!order || !supplierId}>Add</button></div></form></Modal>;
}

/** Receive materials, step 2: the order's lines with Alr. rec. and a Today rec. quantity each; a negative quantity corrects a receipt. */
function TakeInOrder({ orderId, supplierId, onDone }: { orderId: string; supplierId: string; onDone: () => void }) {
  const { rows, label, canRun, refresh, notify } = useWorkspace();
  const order = activeRows(rows, 'orders').find(row => row.id === orderId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const lines = orderDetail(rows, orderId).sort((a, b) => text(a.material?.materialGroup, '').localeCompare(text(b.material?.materialGroup, ''), 'en', { numeric: true }));
  const errors = receiptQuantityErrors(lines.map(({ line }) => ({ lineId: line.id, received: Number(line.received) || 0, quantity: quantities[line.id] })));
  const back = <button type="button" className="btn" onClick={onDone}><ArrowLeft size={16}/>Back to Material take in</button>;
  if (!order) return <div className="page mto-procurement-page"><Heading title="Material take in" description="Take in the materials of one order.">{back}</Heading><EmptyState title="This order could not be found" description="It may have been archived, or it belongs to another main project. Choose the order again."/></div>;
  if (!canRun('receive')) return <div className="page mto-procurement-page"><Heading title={`Material take in / ${String(order.number)}`} description="Take in the materials of one order.">{back}</Heading><div className="alert error" role="alert"><AlertCircle size={18}/><span>Your permission profile does not allow taking in materials.</span></div></div>;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (Object.keys(errors).length) return setError('Fix the quantities marked below.');
    const items = receiptItems(quantities);
    if (!items.length) return setError('Enter a Today rec. quantity for at least one line.');
    setBusy(true);
    try { await post('/actions/receive', { orderId, supplierId, items }); setQuantities({}); await refresh(); notify('Materials taken in.'); onDone(); }
    catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <div className="page mto-procurement-page"><Heading title={`Material take in / ${String(order.number)}`} description={`Supplier: ${supplierId ? label('suppliers', supplierId) : '—'}. Enter what arrived today; a negative value corrects an earlier receipt. All lines are saved together.`}>{back}</Heading>
    <section className="panel procurement-panel"><form onSubmit={event => void submit(event)} noValidate>
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <TableScroll><table className="data-table"><caption className="sr-only">Lines of order {String(order.number)}</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th className="number-cell">Alr. rec.</th><th>Today rec.</th></tr></thead>
        <tbody>{lines.map(({ line, material }) => { const c = materialCells(material, line); return <tr key={line.id}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(line.quantity, 3)}</td><td>{c[6]}</td><td className="number-cell">{formatNumber(line.received, 3)}</td>
          <td><input type="number" inputMode="decimal" step="0.01" placeholder="+/-" title="Use a negative value to correct a receipt." aria-label={`Today received ${c[2]}`} aria-invalid={Boolean(errors[line.id])} value={quantities[line.id] ?? ''} disabled={busy} onChange={e => setQuantities(old => ({ ...old, [line.id]: e.target.value }))}/>{errors[line.id] && <small className="field-error" role="alert">{errors[line.id]}</small>}</td></tr>; })}</tbody></table></TableScroll>
      {!lines.length && <EmptyState title="No lines" description="This order has no material lines."/>}
      <div className="table-footer"><span>{lines.length} line{lines.length === 1 ? '' : 's'}</span><button className="btn primary" disabled={busy || !lines.length}>{busy ? <Loader2 size={15} className="spin"/> : <PackageCheck size={15}/>}Receive materials</button></div>
    </form></section>
  </div>;
}

/** Order archive: every order in a date range, sorted by date; Options: assign the supplier, print the order, list its contents. */
export function OrderArchive() {
  const { rows, label, canRun } = useWorkspace();
  const { canExport, canPrint, send } = useTableSender();
  const allowed = useProcurementAccess('order-archive'); const printable = useOrderPdf();
  const [range] = useState(() => archiveDefaultRange(localToday()));
  const [projectId, setProject] = useState(''); const [from, setFrom] = useState(range.from); const [to, setTo] = useState(range.to); const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  // A link from the Ord.? column of an isometric (?order=<id>) opens that order.
  const [detail, setDetail] = useState(() => new URLSearchParams(window.location.search).get('order') || ''); const [assigning, setAssigning] = useState('');
  const rangeError = dateRangeError(from, to);
  const orders = useMemo(() => rangeError ? [] : archivedOrders(rows, { projectId, from, to }, sort), [rows, projectId, from, to, sort, rangeError]);
  if (!allowed) return <NoAccess title="Order archive"/>;
  const projects = activeRows(rows, 'projects').map(project => ({ value: project.id, label: label('projects', project.id) }));
  return <div className="page mto-procurement-page"><Heading title="Order archive" description="All orders by date. Assign the supplier, print the order or list its contents.">
    {canExport('order-archive') && <><button className="btn" disabled={!orders.length} onClick={() => send('order-archive', 'csv', 'order-archive', ['Date', 'Request number', 'Assigned supplier'], orders.map(o => [printMoment(orderMoment(o), true), o.number, o.supplierId ? label('suppliers', o.supplierId) : 'NA']))}><Download size={16}/>CSV</button></>}
  </Heading>
    <section className="panel procurement-panel">
      <div className="procurement-filters">
        <ChoiceFilter id="archive-project" label="Project" empty="All projects" value={projectId} options={projects} onChange={setProject}/>
        <div className="field"><label htmlFor="archive-from">From Date</label><input id="archive-from" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-invalid={Boolean(rangeError)}/></div>
        <div className="field"><label htmlFor="archive-to">To Date</label><input id="archive-to" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-invalid={Boolean(rangeError)}/>{rangeError && <small className="field-error" role="alert">{rangeError}</small>}</div>
        <div className="field"><label htmlFor="archive-sort">Sort</label><select id="archive-sort" value={sort} onChange={e => setSort(e.target.value === 'asc' ? 'asc' : 'desc')}><option value="desc">Order by date desc.</option><option value="asc">Order by date asc.</option></select></div>
      </div>
      <TableScroll><table className="data-table"><caption className="sr-only">Archive of material orders</caption><thead><tr><th>Date</th><th>Request number</th><th>Assigned supplier</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{orders.map(order => <tr key={order.id}><td>{printMoment(orderMoment(order), true)}</td><td>{String(order.number)}</td><td>{order.supplierId ? label('suppliers', order.supplierId) : 'NA'}</td><td className="actions-cell">
          {canRun('assign-order-supplier') && <button className="btn small" aria-label={`Assign order ${String(order.number)} to supplier`} title="Assign order to supplier" onClick={() => setAssigning(order.id)}><Link2 size={14}/></button>}
          {printable && <a className="btn small" href={apiUrl(orderPdfPath(order.id))} target="_blank" rel="noreferrer" aria-label={`Print order ${String(order.number)}`} title="Print order"><Printer size={14}/></a>}
          <button className="btn small" aria-label={`Contents of order ${String(order.number)}`} title="Order contents" onClick={() => setDetail(order.id)}><List size={14}/></button>
        </td></tr>)}</tbody></table></TableScroll>
      {!orders.length && <EmptyState title="No orders" description={rangeError || 'No order falls in this range. Widen the dates or choose all projects.'}/>}
      <div className="table-footer"><span>{orders.length} order{orders.length === 1 ? '' : 's'}</span><span>{sort === 'asc' ? 'Oldest first' : 'Newest first'}</span></div>
    </section>
    {detail && <OrderDetailDialog orderId={detail} onClose={() => setDetail('')}/>}
    {assigning && <AssignSupplierDialog orderId={assigning} onClose={() => setAssigning('')}/>}
  </div>;
}

/** Assign order to supplier: one list of the suppliers enabled on the site ("<name> <town>"), the current one or the first preselected. */
function AssignSupplierDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { rows, siteId, refresh, notify } = useWorkspace();
  const order = rows.orders?.find(o => o.id === orderId);
  const suppliers = enabledOptions('suppliers', activeRows(rows, 'suppliers'), siteId, rows, order?.supplierId);
  const [supplierId, setSupplier] = useState(() => String(order?.supplierId || '') || suppliers[0]?.id || '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!order) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!supplierId) return setError('Choose a supplier.');
    setBusy(true);
    try { await post('/actions/assign-order-supplier', { orderId, supplierId }); await refresh(); notify(`Order ${String(order!.number)} assigned.`); onClose(); }
    catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Assign order to supplier" subtitle={`Order ${String(order.number)}`} onClose={onClose}>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="field"><label htmlFor="assign-supplier">Supplier</label><select id="assign-supplier" value={supplierId} onChange={e => setSupplier(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{supplierChoiceText(s)}</option>)}</select>{!suppliers.length && <small>No suppliers are available to your account.</small>}</div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy || !supplierId}>{busy && <Loader2 size={15} className="spin"/>}Assign</button></div></form></Modal>;
}

/** The contents of one order (the list option of Order archive): ordered, received and what is left per line. */
function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { rows, label } = useWorkspace();
  const order = rows.orders?.find(o => o.id === orderId); const lines = orderDetail(rows, orderId);
  if (!order) return null;
  return <Modal title={`Order ${String(order.number)}`} subtitle={`${printMoment(orderMoment(order), true)} · ${order.supplierId ? label('suppliers', order.supplierId) : 'NA'}`} onClose={onClose} wide><div className="modal-body">
    <TableScroll><table className="data-table"><caption className="sr-only">Lines of this order</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th>UOM</th><th className="number-cell">Ordered</th><th className="number-cell">Received</th><th className="number-cell">Left</th></tr></thead>
      <tbody>{lines.map(({ line, material, outstanding }) => { const c = materialCells(material, line); return <tr key={line.id}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td>{c[6]}</td><td className="number-cell">{formatNumber(line.quantity, 3)}</td><td className="number-cell">{formatNumber(line.received, 3)}</td><td className="number-cell">{formatNumber(Math.max(0, outstanding), 3)}</td></tr>; })}</tbody></table></TableScroll>
    {!lines.length && <EmptyState title="No lines" description="This order has no material lines."/>}
  </div></Modal>;
}
