import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Download, ExternalLink, FileText, Link2, List, Loader2, PackageCheck, PackagePlus, Printer, ShoppingCart } from 'lucide-react';
import { materialName, materialRecord } from '../shared/materials.ts';
import { PROCUREMENT_PAGES, additionalOverview, orderedMaterials, rfqArchive, archiveDefaultRange, archivedOrders, dateRangeError, momentOf, orderChoiceText, orderDetail, orderMoment, orderPlanning, pendingLines, printMoment, receiptItems, receiptLog, receiptMoment, receiptQuantityErrors, receivableOrders, supplierChoiceText, toCsv } from '../shared/mto-procurement.ts';
import type { Row } from '../shared/types.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { enabledOptions } from '../shared/weld-catalogs.ts';
import { ApiError, apiUrl, formatDate, formatNumber, post } from './api.ts';
import { Badge, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
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

/** A view computed from the rows the workspace already loaded: a failure shows as a message instead of breaking the page. */
function safely<T>(compute: () => T, fallback: T): { data: T; error: string } {
  try { return { data: compute(), error: '' }; } catch (problem) { return { data: fallback, error: (problem as Error).message || 'The figures could not be calculated.' }; }
}
const NO_OVERVIEW = { rows: [], totals: { required: 0, ordered: 0, additional: 0, percent: null } };
const percentText = (value: number | null) => value === null ? '—' : `${formatNumber(value, 1)} %`;
type OrderView = 'order' | 'ordered' | 'additional';

/** Order materials: one row per material, summed over the isometrics that still need it, less what open orders still bring. */
export function OrderMaterials() {
  const { rows, label, canRun, refresh, notify } = useWorkspace();
  const { canExport, canPrint, send } = useTableSender();
  const allowed = useProcurementAccess('order-materials');
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [created, setCreated] = useState<{ number: string; url: string } | null>(null);
  const [view, setView] = useState<OrderView>('order'); const [additionalOpen, setAdditionalOpen] = useState(false);
  const planning = useMemo(() => orderPlanning(rows, { projectId, isoId, query }), [rows, projectId, isoId, query]);
  // The same project / isometric filter feeds the three views: what is still to order, what is already ordered, and the additional orders against the project need.
  const ordered = useMemo(() => safely(() => orderedMaterials(rows, { projectId, isoId, query }), []), [rows, projectId, isoId, query]);
  const overview = useMemo(() => safely(() => additionalOverview(rows, { projectId, query }), NO_OVERVIEW), [rows, projectId, query]);
  const checked = planning.filter(group => selected.includes(group.identity));
  const requirementIds = checked.flatMap(group => group.requirementIds);
  if (!allowed) return <NoAccess title="Order materials"/>;
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
    {canExport('order-materials') && view === 'order' && <button className="btn" disabled={!exportRows.length} onClick={() => send('order-materials', 'xlsx', 'order-materials', [...ORDER_MATERIALS_EXPORT_COLUMNS], exportRows.map(g => { const c = materialCells(g.material); return [c[0], c[1], c[2], c[3], c[4], c[5], g.quantity, c[6]]; }))}><Download size={16}/>Export</button>}
    {canRun('order-additional') && <button className="btn" onClick={() => setAdditionalOpen(true)}><PackagePlus size={16}/>Additional order</button>}
    {canRun('order-requirements') && view === 'order' && <button className="btn primary" disabled={!requirementIds.length || busy} onClick={() => void orderChecked()}>{busy ? <Loader2 size={16} className="spin"/> : <ShoppingCart size={16}/>}Order checked materials{checked.length ? ` (${checked.length})` : ''}</button>}
  </Heading>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {created && <div className="alert success" role="status">Order {created.number} was created. <a className="text-link" href={created.url} target="_blank" rel="noreferrer">Open the order document<ExternalLink size={13} aria-hidden="true"/></a></div>}
    <section className="panel procurement-panel">
      <div className="procurement-filters"><ChoiceFilter id="order-materials-project" label="Project" empty="All projects" value={projectId} options={projects} onChange={value => { setProject(value); setIso(''); setSelected([]); }}/><ChoiceFilter id="order-materials-iso" label="Isometric" empty="All isometrics" value={isoId} options={isometrics} onChange={value => { setIso(value); setSelected([]); }}/></div>
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Order materials views">
        <button type="button" role="tab" aria-selected={view === 'order'} className={view === 'order' ? 'selected' : ''} onClick={() => setView('order')}>To order<span>{planning.length}</span></button>
        <button type="button" role="tab" aria-selected={view === 'ordered'} className={view === 'ordered' ? 'selected' : ''} onClick={() => setView('ordered')}>Ordered<span>{ordered.data.length}</span></button>
        <button type="button" role="tab" aria-selected={view === 'additional'} className={view === 'additional' ? 'selected' : ''} onClick={() => setView('additional')}>Additional vs required</button></div></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={v => { setQuery(v); setSelected([]); }} placeholder="Search"/></div>
      {view === 'ordered' && <OrderedView label={label} state={ordered} filtered={Boolean(projectId || isoId || query)}/>}
      {view === 'additional' && <AdditionalView label={label} state={overview} filtered={Boolean(projectId || query)} isoFiltered={Boolean(isoId)}/>}
      {view === 'order' && <>
      <PlanningTable planning={planning} checked={checked.length} selected={selected} setSelected={setSelected} empty={{ title: 'Nothing waiting to be ordered', description: projectId || isoId || query ? 'No material matches these filters.' : 'Every material requirement is already on an order.' }}/>
      <div className="table-footer"><span>{planning.length} material{planning.length === 1 ? '' : 's'}{checked.length ? ` · ${checked.length} checked` : ''}</span><span>Open orders of a material are subtracted. The supplier is assigned in Order archive.</span></div></>}
    </section>
    {additionalOpen && <AdditionalOrderDialog projectId={projectId} onClose={() => setAdditionalOpen(false)}/>}
  </div>;
}

/** The list of Order materials and of Request for Quotation: one row per material still to be ordered, with a check box per row. */
function PlanningTable({ planning, checked, selected, setSelected, empty }: { planning: ReturnType<typeof orderPlanning>; checked: number; selected: string[]; setSelected: (value: string[] | ((old: string[]) => string[])) => void; empty: { title: string; description: string } }) {
  const toggle = (identity: string, on: boolean) => setSelected(old => on ? [...new Set([...old, identity])] : old.filter(id => id !== identity));
  return <>
    <TableScroll><table className="data-table"><caption className="sr-only">Materials waiting to be ordered</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th className="select-cell"><input type="checkbox" aria-label="Check all" title="Check all" checked={planning.length > 0 && checked === planning.length} disabled={!planning.length} onChange={e => setSelected(e.target.checked ? planning.map(g => g.identity) : [])}/></th></tr></thead>
      <tbody>{planning.map(group => { const c = materialCells(group.material); return <tr key={group.identity}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(group.quantity, 3)}</td><td>{c[6]}</td><td className="select-cell"><input type="checkbox" aria-label={`Check ${c[2]}`} checked={selected.includes(group.identity)} onChange={e => toggle(group.identity, e.target.checked)}/></td></tr>; })}</tbody></table></TableScroll>
    {!planning.length && <EmptyState title={empty.title} description={empty.description}/>}
  </>;
}

const rfqPdfPath = (rfqId: string) => `/pdf/request-for-quotation?rfqId=${encodeURIComponent(rfqId)}`;
type RfqView = 'request' | 'sent';

/**
 * Request for Quotation (client request 20.11.2026): the same list as Order materials, but "Request for Quotation" only asks suppliers for prices,
 * availability and delivery times. Nothing is ordered or booked: the materials stay on this list and on Order materials. "Sent requests" re-opens the documents.
 */
export function RequestForQuotation() {
  const { rows, label, canRun } = useWorkspace();
  const allowed = useProcurementAccess('request-for-quotation');
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [view, setView] = useState<RfqView>('request');
  const [dialog, setDialog] = useState(false); const [created, setCreated] = useState<{ number: string; url: string } | null>(null);
  const planning = useMemo(() => orderPlanning(rows, { projectId, isoId, query }), [rows, projectId, isoId, query]);
  const sent = useMemo(() => rfqArchive(rows, { projectId, query }), [rows, projectId, query]);
  const checked = planning.filter(group => selected.includes(group.identity));
  const requirementIds = checked.flatMap(group => group.requirementIds);
  if (!allowed) return <NoAccess title="Request for Quotation"/>;
  const projects = activeRows(rows, 'projects').map(project => ({ value: project.id, label: label('projects', project.id) }));
  const isometrics = projectId ? activeRows(rows, 'isometrics').filter(iso => iso.projectId === projectId).map(iso => ({ value: iso.id, label: String(iso.isoNo ?? '') })) : [];
  return <div className="page mto-procurement-page"><Heading title="Request for Quotation" description="Ask suppliers for prices, availability and delivery times before the purchase order. Check the rows and request a quotation: the document opens in a new tab. Nothing is ordered, so the materials stay available for Order materials.">
    {canRun('request-for-quotation') && view === 'request' && <button className="btn primary" disabled={!requirementIds.length} onClick={() => setDialog(true)}><FileText size={16}/>Request for Quotation{checked.length ? ` (${checked.length})` : ''}</button>}
  </Heading>
    {created && <div className="alert success" role="status">Request for quotation {created.number} was created. <a className="text-link" href={created.url} target="_blank" rel="noreferrer">Open the document<ExternalLink size={13} aria-hidden="true"/></a></div>}
    <section className="panel procurement-panel">
      <div className="procurement-filters"><ChoiceFilter id="rfq-project" label="Project" empty="All projects" value={projectId} options={projects} onChange={value => { setProject(value); setIso(''); setSelected([]); }}/><ChoiceFilter id="rfq-iso" label="Isometric" empty="All isometrics" value={isoId} options={isometrics} onChange={value => { setIso(value); setSelected([]); }}/></div>
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Request for Quotation views">
        <button type="button" role="tab" aria-selected={view === 'request'} className={view === 'request' ? 'selected' : ''} onClick={() => setView('request')}>To request<span>{planning.length}</span></button>
        <button type="button" role="tab" aria-selected={view === 'sent'} className={view === 'sent' ? 'selected' : ''} onClick={() => setView('sent')}>Sent requests<span>{sent.length}</span></button></div></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={v => { setQuery(v); setSelected([]); }} placeholder="Search"/></div>
      {view === 'request' && <>
        <PlanningTable planning={planning} checked={checked.length} selected={selected} setSelected={setSelected} empty={{ title: 'Nothing waiting to be ordered', description: projectId || isoId || query ? 'No material matches these filters.' : 'Every material requirement is already on an order.' }}/>
        <div className="table-footer"><span>{planning.length} material{planning.length === 1 ? '' : 's'}{checked.length ? ` · ${checked.length} checked` : ''}</span><span>Same quantities as Order materials. A quotation request does not reserve, order or reduce anything.</span></div></>}
      {view === 'sent' && <>
        <TableScroll><table className="data-table"><caption className="sr-only">Requests for quotation that were created</caption><thead><tr><th>RFQ No.</th><th>Date</th><th>Project</th><th>Supplier</th><th>Quote needed by</th><th className="number-cell">Materials</th><th>Note</th><th className="actions-cell"><span className="sr-only">Document</span></th></tr></thead>
          <tbody>{sent.map(({ rfq, count }) => <tr key={rfq.id}><td>{String(rfq.number)}</td><td>{formatDate(rfq.date)}</td><td>{rfq.projectId ? label('projects', rfq.projectId) : rfq.siteId ? label('sites', rfq.siteId) : '—'}</td><td>{rfq.supplierId ? label('suppliers', rfq.supplierId) : '—'}</td><td>{rfq.requiredBy ? formatDate(rfq.requiredBy) : '—'}</td><td className="number-cell">{count}</td><td className="description-cell">{text(rfq.note)}</td><td className="actions-cell"><a className="text-link" href={apiUrl(rfqPdfPath(rfq.id))} target="_blank" rel="noreferrer">Open document<ExternalLink size={13} aria-hidden="true"/></a></td></tr>)}</tbody></table></TableScroll>
        {!sent.length && <EmptyState title="No requests for quotation yet" description={projectId || query ? 'No request matches these filters.' : 'Requests appear here once they are created, so the document can be opened again.'}/>}
        <div className="table-footer"><span>{sent.length} request{sent.length === 1 ? '' : 's'}</span><span>Requests are records only: they are not orders.</span></div></>}
    </section>
    {dialog && <RfqDialog requirementIds={requirementIds} count={checked.length} onClose={() => setDialog(false)} onCreated={result => { setCreated(result); setSelected([]); setDialog(false); }}/>}
  </div>;
}

/** The supplier (optional), the date the quote is needed by (optional) and a note; creating the request opens its document in a new tab. */
function RfqDialog({ requirementIds, count, onClose, onCreated }: { requirementIds: string[]; count: number; onClose: () => void; onCreated: (created: { number: string; url: string }) => void }) {
  const { rows, siteId, refresh, notify } = useWorkspace();
  const suppliers = enabledOptions('suppliers', activeRows(rows, 'suppliers'), siteId, rows);
  const [supplierId, setSupplier] = useState(''); const [requiredBy, setRequiredBy] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    // The document tab is opened before the request so that it is not blocked.
    const tab = window.open('', '_blank');
    try {
      const { record } = await post<{ record: Row }>('/actions/request-for-quotation', { requirementIds, ...(supplierId ? { supplierId } : {}), ...(requiredBy ? { requiredBy } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      const url = apiUrl(rfqPdfPath(record.id));
      if (tab) tab.location.href = url;
      await refresh(); notify(`Request for quotation ${String(record.number)} created.`);
      onCreated({ number: String(record.number), url });
    } catch (problem) { tab?.close(); setError(problem instanceof ApiError || problem instanceof Error ? problem.message : 'The request for quotation could not be created.'); } finally { setBusy(false); }
  }
  return <Modal title="Request for Quotation" subtitle={`${count} material${count === 1 ? '' : 's'} checked`} onClose={onClose}>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        <div className="field wide-field"><label htmlFor="rfq-supplier">Supplier</label><select id="rfq-supplier" value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">No supplier chosen</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplierChoiceText(supplier)}</option>)}</select></div>
        <div className="field"><label htmlFor="rfq-required-by">Quote needed by</label><input id="rfq-required-by" type="date" value={requiredBy} onChange={e => setRequiredBy(e.target.value)}/></div>
        <div className="field wide-field"><label htmlFor="rfq-note">Note</label><textarea id="rfq-note" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note for the supplier"/></div>
      </div>
      <p className="muted">This only asks for an offer. Nothing is ordered, taken in or reserved, and the materials stay available for Order materials.</p>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Request for Quotation</button></div></form></Modal>;
}

/** Order materials, "Ordered": the materials already on an order for the same filter, apart from what is still to be ordered. */
function OrderedView({ label, state, filtered }: { label: (resource: string, id: unknown) => string; state: { data: ReturnType<typeof orderedMaterials>; error: string }; filtered: boolean }) {
  if (state.error) return <div className="alert error" role="alert"><AlertCircle size={18}/><span>{state.error}</span></div>;
  return <>
    <TableScroll><table className="data-table"><caption className="sr-only">Materials that are already ordered</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th>UOM</th><th className="number-cell">Ordered</th><th className="number-cell">Received</th><th className="number-cell">Outstanding</th><th>Order No.</th><th>Supplier</th></tr></thead>
      <tbody>{state.data.map(item => { const c = materialCells(item.material); return <tr key={item.identity}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td>{c[6]}</td><td className="number-cell">{formatNumber(item.ordered, 3)}</td><td className="number-cell">{formatNumber(item.received, 3)}</td><td className="number-cell">{formatNumber(item.outstanding, 3)}</td><td>{item.orderNumbers.join(', ')}</td><td>{item.supplierIds.length ? item.supplierIds.map(id => label('suppliers', id)).join(', ') : '—'}</td></tr>; })}</tbody></table></TableScroll>
    {!state.data.length && <EmptyState title="Nothing is ordered yet" description={filtered ? 'No ordered material matches these filters.' : 'Materials appear here once they are on an order.'}/>}
    <div className="table-footer"><span>{state.data.length} material{state.data.length === 1 ? '' : 's'}</span><span>Cancelled orders are left out.</span></div>
  </>;
}

/** Order materials, "Additional vs required": per project and material, what the isometrics require against what was ordered additionally. */
function AdditionalView({ label, state, filtered, isoFiltered }: { label: (resource: string, id: unknown) => string; state: { data: ReturnType<typeof additionalOverview>; error: string }; filtered: boolean; isoFiltered: boolean }) {
  if (state.error) return <div className="alert error" role="alert"><AlertCircle size={18}/><span>{state.error}</span></div>;
  const { rows: lines, totals } = state.data;
  return <>
    <TableScroll><table className="data-table"><caption className="sr-only">Additional orders against the quantity the projects require</caption><thead><tr><th>Project</th><th>Material No</th><th>Description</th><th>UOM</th><th className="number-cell">Required</th><th className="number-cell">Ordered</th><th className="number-cell">Additional</th><th className="number-cell">Additional % of required</th></tr></thead>
      <tbody>{lines.map(line => { const c = materialCells(line.material); return <tr key={`${line.projectId}|${line.identity}`}><td>{line.projectId ? label('projects', line.projectId) : '—'}</td><td>{c[2]}</td><td className="description-cell">{c[5]}</td><td>{c[6]}</td><td className="number-cell">{formatNumber(line.required, 3)}</td><td className="number-cell">{formatNumber(line.ordered, 3)}</td><td className="number-cell">{formatNumber(line.additional, 3)}</td><td className="number-cell">{percentText(line.percent)}</td></tr>; })}</tbody>
      {lines.length > 0 && <tfoot><tr><th colSpan={4}>Total</th><td className="number-cell">{formatNumber(totals.required, 3)}</td><td className="number-cell">{formatNumber(totals.ordered, 3)}</td><td className="number-cell">{formatNumber(totals.additional, 3)}</td><td className="number-cell">{percentText(totals.percent)}</td></tr></tfoot>}</table></TableScroll>
    {!lines.length && <EmptyState title="No requirements or additional orders" description={filtered ? 'No material matches these filters.' : 'Isometric requirements and additional orders appear here.'}/>}
    <div className="table-footer"><span>{lines.length} row{lines.length === 1 ? '' : 's'}</span><span>{isoFiltered ? 'The isometric filter does not apply here: the figures are per project. ' : ''}Additional orders are on top of the project need and never reduce what is to be ordered.</span></div>
  </>;
}

/** Additional order: one material on top of the project need (a pipe cut wrongly, for example); the reason is required. */
function AdditionalOrderDialog({ projectId: preset, onClose }: { projectId: string; onClose: () => void }) {
  const { rows, siteId, label, refresh, notify } = useWorkspace();
  const projects = activeRows(rows, 'projects');
  const [projectId, setProject] = useState(preset || (projects.length === 1 ? projects[0].id : '')); const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState(''); const [supplierId, setSupplier] = useState(''); const [reason, setReason] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const suppliers = enabledOptions('suppliers', activeRows(rows, 'suppliers'), siteId, rows);
  // The materials of the project's own requirements come first, then the rest of the catalog.
  const choices = useMemo(() => {
    const isos = new Set(activeRows(rows, 'isometrics').filter(iso => iso.projectId === projectId).map(iso => iso.id)); const seen = new Set<string>();
    const required = activeRows(rows, 'iso_materials').filter(line => isos.has(String(line.isoId))).flatMap(line => { const key = line.materialId ? `catalog:${line.materialId}` : line.customMaterialId ? `custom:${line.customMaterialId}` : ''; if (!key || seen.has(key)) return []; seen.add(key); return [{ key, record: materialRecord(rows, line) }]; });
    const rest = activeRows(rows, 'materials').filter(record => !seen.has(`catalog:${record.id}`)).map(record => ({ key: `catalog:${record.id}`, record }));
    const name = (item: { record: Row | undefined }) => `${text(item.record?.materialNo, 'Unavailable material')} · ${text(item.record?.description, '')}`;
    return { required: required.map(item => ({ key: item.key, name: name(item) })), rest: rest.map(item => ({ key: item.key, name: name(item) })) };
  }, [rows, projectId]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!projectId) return setError('Choose the project.');
    if (!material) return setError('Choose the material.');
    const amount = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(amount) || amount <= 0) return setError('Enter a quantity greater than zero.');
    if (!reason.trim()) return setError('Enter the reason for this additional order.');
    const [kind, id] = [material.slice(0, material.indexOf(':')), material.slice(material.indexOf(':') + 1)];
    setBusy(true);
    try {
      const { record } = await post<{ record: Row }>('/actions/order-additional', { projectId, ...(kind === 'custom' ? { customMaterialId: id } : { materialId: id }), quantity: amount, reason: reason.trim(), ...(supplierId ? { supplierId } : {}) });
      await refresh(); notify(`Additional order ${String(record.number)} created.`); onClose();
    } catch (problem) { setError((problem as Error).message || 'The order could not be created.'); } finally { setBusy(false); }
  }
  return <Modal title="Additional order" subtitle="On top of the project need" onClose={onClose}>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        <div className="field wide-field"><label htmlFor="additional-project">Project</label><select id="additional-project" required value={projectId} onChange={e => { setProject(e.target.value); setMaterial(''); }}><option value="">Choose a project</option>{projects.map(project => <option key={project.id} value={project.id}>{label('projects', project.id)}</option>)}</select></div>
        <div className="field wide-field"><label htmlFor="additional-material">Material</label><select id="additional-material" required value={material} onChange={e => setMaterial(e.target.value)}><option value="">Choose a material</option>
          {choices.required.length > 0 && <optgroup label="Required by this project">{choices.required.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</optgroup>}
          {choices.rest.length > 0 && <optgroup label="Material catalog">{choices.rest.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</optgroup>}</select></div>
        <div className="field"><label htmlFor="additional-quantity">Quantity</label><input id="additional-quantity" type="number" inputMode="decimal" min="0" step="any" required value={quantity} onChange={e => setQuantity(e.target.value)}/></div>
        <div className="field"><label htmlFor="additional-supplier">Supplier</label><select id="additional-supplier" value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">Assign later in Order archive</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplierChoiceText(supplier)}</option>)}</select></div>
        <div className="field wide-field"><label htmlFor="additional-reason">Reason</label><textarea id="additional-reason" required rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: pipe cut wrongly on the shop floor"/></div>
      </div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Create additional order</button></div></form></Modal>;
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
        <tbody>{lines.map(({ line, order, material, outstanding }) => <tr key={line.id}><td>{text(material?.materialGroup)}</td><td>{materialName(rows, line)}</td><td className="description-cell">{text(line.description ?? material?.description)}</td><td className="number-cell">{formatNumber(line.quantity, 3)} {text(line.uom ?? material?.uom, '')}</td><td>{String(order.number)}{Boolean(line.additional) && <> <Badge color="amber">Additional</Badge></>}</td><td>{formatDate(order.date)}</td><td className="number-cell">{formatNumber(line.received, 3)}<small className="execution-subvalue">{formatNumber(outstanding, 3)} open</small></td>{canRun('receive') && <td className="actions-cell"><button className="btn small" onClick={() => setTakeIn(order.id)}><PackageCheck size={14}/>Take in</button></td>}</tr>)}</tbody></table></TableScroll>
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
  return <div className="page mto-procurement-page"><Heading title="Material take in" description="Every delivery taken in against an order. An entry taken in by mistake is taken back with a correction.">
    {canExport('take-in') && <><button className="btn" disabled={!log.length} onClick={() => send('take-in', 'csv', 'material-take-in', ['Date', 'Order No.', 'Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM', 'Supplier'], log.map(e => { const c = materialCells(e.material, e.receipt); return [printMoment(receiptMoment(e.receipt)), e.order?.number ?? '', c[0], c[1], c[2], c[3], c[4], c[5], e.receipt.quantity, c[6], e.supplierId ? label('suppliers', e.supplierId) : '']; }))}><Download size={16}/>CSV</button><button className="btn" disabled={!log.length} onClick={() => send('take-in', 'xlsx', 'material-take-in', ['Date', 'Order No.', 'Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM', 'Supplier'], log.map(e => { const c = materialCells(e.material, e.receipt); return [printMoment(receiptMoment(e.receipt)), e.order?.number ?? '', c[0], c[1], c[2], c[3], c[4], c[5], e.receipt.quantity, c[6], e.supplierId ? label('suppliers', e.supplierId) : '']; }))}><Download size={16}/>Excel</button></>}
    {canPrint('take-in') && <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>}
    {canRun('receive') && <button className="btn primary" onClick={() => setReceiving(true)}><PackageCheck size={16}/>Receive materials</button>}
  </Heading>
    <section className="panel procurement-panel">
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">Log of material receipts</caption><thead><tr><th>Date</th><th>Order No.</th><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th>Supplier</th></tr></thead>
        <tbody>{log.map(({ receipt, order, material, supplierId }) => { const c = materialCells(material, receipt); const negative = Number(receipt.quantity) < 0; return <tr key={receipt.id} className={negative ? 'correction-row' : undefined}><td>{printMoment(receiptMoment(receipt))}</td><td>{order ? String(order.number) : '—'}</td><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(receipt.quantity, 3)}</td><td>{c[6]}</td><td>{supplierId ? label('suppliers', supplierId) : '—'}</td></tr>; })}</tbody></table></TableScroll>
      {!log.length && <EmptyState title="No receipts" description={query ? 'No receipt matches this search.' : 'Deliveries appear here once they are taken in against an order.'}/>}
      <div className="table-footer"><span>{log.length} entr{log.length === 1 ? 'y' : 'ies'}</span><span>Today rec. takes in positive quantities only; corrections are shown as negative entries.</span></div>
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

/** Receive materials, step 2: the order's lines with Alr. rec. and a Today rec. quantity each (positive quantities only). */
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
  return <div className="page mto-procurement-page"><Heading title={`Material take in / ${String(order.number)}`} description={`Supplier: ${supplierId ? label('suppliers', supplierId) : '—'}. Enter what arrived today. All lines are saved together.`}>{back}</Heading>
    <section className="panel procurement-panel"><form onSubmit={event => void submit(event)} noValidate>
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <TableScroll><table className="data-table"><caption className="sr-only">Lines of order {String(order.number)}</caption><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>Description</th><th className="number-cell">Quantity</th><th>UOM</th><th className="number-cell">Alr. rec.</th><th>Today rec.</th></tr></thead>
        <tbody>{lines.map(({ line, material }) => { const c = materialCells(material, line); return <tr key={line.id}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td className="description-cell">{c[5]}</td><td className="number-cell">{formatNumber(line.quantity, 3)}</td><td>{c[6]}</td><td className="number-cell">{formatNumber(line.received, 3)}</td>
          <td><input type="number" inputMode="decimal" min="0" step="0.01" aria-label={`Today received ${c[2]}`} aria-invalid={Boolean(errors[line.id])} value={quantities[line.id] ?? ''} disabled={busy} onChange={e => setQuantities(old => ({ ...old, [line.id]: e.target.value }))}/>{errors[line.id] && <small className="field-error" role="alert">{errors[line.id]}</small>}</td></tr>; })}</tbody></table></TableScroll>
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
  const additionalOrders = useMemo(() => new Set((rows.order_lines || []).filter(line => line.additional && !line._archived).map(line => String(line.orderId))), [rows]);
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
        <tbody>{orders.map(order => <tr key={order.id}><td>{printMoment(orderMoment(order), true)}</td><td>{String(order.number)}{additionalOrders.has(order.id) && <> <Badge color="amber">Additional</Badge></>}</td><td>{order.supplierId ? label('suppliers', order.supplierId) : 'NA'}</td><td className="actions-cell">
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
      <tbody>{lines.map(({ line, material, outstanding }) => { const c = materialCells(material, line); return <tr key={line.id}><td>{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td className="description-cell">{c[5]}{Boolean(line.additional) && <><br/><Badge color="amber">Additional</Badge><small className="execution-subvalue">{text(line.additionalReason)}</small></>}</td><td>{c[6]}</td><td className="number-cell">{formatNumber(line.quantity, 3)}</td><td className="number-cell">{formatNumber(line.received, 3)}</td><td className="number-cell">{formatNumber(Math.max(0, outstanding), 3)}</td></tr>; })}</tbody></table></TableScroll>
    {!lines.length && <EmptyState title="No lines" description="This order has no material lines."/>}
  </div></Modal>;
}
