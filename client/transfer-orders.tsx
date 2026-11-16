import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCheck, ChevronDown, Loader2, Plus, Printer, RotateCcw, Save, Truck, UserCheck, XCircle } from 'lucide-react';
import { apiUrl, formatDate, formatNumber, post } from './api.ts';
import { Badge, EmptyState, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { ActionDialog, Choice, Control, OrderDialog, Text } from './mto-stock.tsx';
import { LINE_STATUSES, TRANSFER_PRIORITIES, TRANSFER_STATUSES, canAssign, completePlan, isOpenOrder, lineStatus, nextStatus, orderItemsOf, orderPlaces, orderStatus, pickLine, qtyPicked, transferTypeLabel, type LineStatus } from '../shared/mto-stock.ts';
import type { Row } from '../shared/types.ts';

const today = () => new Date().toISOString().slice(0, 10);
const created = (order: Row) => String(order.date || String(order._createdAt || '').slice(0, 10));
const newest = (a: Row, b: Row) => created(b).localeCompare(created(a)) || String(b._createdAt).localeCompare(String(a._createdAt)) || String(b.number).localeCompare(String(a.number));

/**
 * Transfer Orders (MTO manual "Transfer Orders (STO) — full lifecycle"): opened from the Transfer Orders button on
 * Storehouses and from the bell. `?order=<id>` opens one order's detail.
 */
export function TransferOrders() {
  const { canRecord } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order') || '';
  if (!canRecord('transfer_orders')) return <EmptyState title="No access to transfer orders" description="Your permission profile does not include the material inventory."/>;
  return orderId ? <TransferOrderDetail orderId={orderId} onBack={() => setParams({})}/> : <TransferOrderList open={id => setParams({ order: id })}/>;
}

/** The list: Order No, Type, Priority, From, To, Status, Created date, Options; filters on status and priority and an instant search; newest first. */
function TransferOrderList({ open }: { open: (id: string) => void }) {
  const { rows, canRun, siteId } = useWorkspace();
  const [status, setStatus] = useState(''), [priority, setPriority] = useState(''), [query, setQuery] = useState(''), [creating, setCreating] = useState(false);
  const items = useMemo(() => activeRows(rows, 'transfer_order_items'), [rows]);
  const list = useMemo(() => {
    const text = query.trim().toLowerCase();
    return activeRows(rows, 'transfer_orders').map(order => ({ order, status: orderStatus(order), type: transferTypeLabel(order.type), ...orderPlaces(rows, order) }))
      .filter(entry => (!status || entry.status === status) && (!priority || entry.order.priority === priority))
      .filter(entry => !text || [entry.order.number, entry.type, entry.order.priority, entry.from, entry.to, entry.status, entry.order.notes, entry.order.assignedName, ...items.filter(item => item.orderId === entry.order.id).flatMap(item => [item.materialNo, item.description])].some(value => String(value ?? '').toLowerCase().includes(text)))
      .sort((a, b) => newest(a.order, b.order));
  }, [rows, items, status, priority, query]);
  const filtered = Boolean(status || priority || query.trim());
  return <div className="page mto-stock-page transfer-orders-page"><div className="page-heading"><div><div className="eyebrow">MATERIALS · STOREHOUSES</div><h1>Transfer Orders</h1><p>Moves between project site inventories and storehouses: assign, pick and complete them, or cancel and reverse.</p></div>
    <div className="heading-actions"><Link className="btn" to="/workspace/warehouses"><ArrowLeft size={16}/>Storehouses</Link>{canRun('transfer-order-create') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16}/>New Transfer Order</button>}</div></div>
    <section className="panel"><div className="inventory-filters">
      <Choice label="Status" value={status} onChange={setStatus} blank="All statuses" options={TRANSFER_STATUSES.map(value => ({ value, label: value }))}/>
      <Choice label="Priority" value={priority} onChange={setPriority} blank="All priorities" options={TRANSFER_PRIORITIES.map(value => ({ value, label: value }))}/>
      <SearchInput value={query} onChange={setQuery} placeholder="Search order, material or place…"/></div>
      {list.length ? <TableScroll><table className="data-table"><thead><tr><th>Order No</th><th>Type</th><th>Priority</th><th>From</th><th>To</th><th>Status</th><th>Created date</th><th>Options</th></tr></thead><tbody>{list.map(entry => <tr key={entry.order.id}>
        <td><button type="button" className="record-link" onClick={() => open(entry.order.id)}>{String(entry.order.number)}</button></td><td>{entry.type}</td><td><Badge color={entry.order.priority === 'Urgent' ? 'red' : undefined}>{String(entry.order.priority || 'Normal')}</Badge></td><td>{entry.from}</td><td>{entry.to}</td>
        <td><Badge>{entry.status}</Badge>{entry.order.reversedAt ? <> <Badge color="red">Reversed</Badge></> : null}</td><td>{formatDate(created(entry.order))}</td>
        <td><button type="button" className="btn small" aria-label={`Open transfer order ${entry.order.number}`} onClick={() => open(entry.order.id)}>Open</button></td></tr>)}</tbody></table></TableScroll>
        : <EmptyState title={filtered ? 'No transfer orders match' : 'No transfer orders yet'} description={filtered ? 'Change the status, the priority or the search.' : 'Create one here, or tick materials in the Material inventory or lines on the Storehouses page and choose New Transfer Order.'}/>}
      <div className="table-footer"><span>{list.length} transfer order{list.length === 1 ? '' : 's'}</span></div></section>
    {creating && <OrderDialog context="page" siteId={siteId} onClose={() => setCreating(false)}/>}
  </div>;
}

interface PickDraft { qty: string; status: LineStatus }
const draftOf = (item: Row): PickDraft => ({ qty: lineStatus(item) === 'Pending' ? '' : String(qtyPicked(item)), status: lineStatus(item) });
/** Typing a quantity sets the matching line status (the full quantity: Picked; less: Partial); choosing a status fills the quantity it implies. */
function changeQty(item: Row, draft: PickDraft, qty: string): PickDraft {
  const value = Number(qty), ordered = Number(item.quantity);
  if (qty === '' || !Number.isFinite(value)) return { ...draft, qty };
  return { qty, status: value <= 0 ? (draft.status === 'Not found' ? 'Not found' : 'Pending') : Math.abs(value - ordered) < 1e-9 ? 'Picked' : value < ordered ? 'Partial' : draft.status };
}
function changeStatus(item: Row, draft: PickDraft, status: LineStatus): PickDraft {
  if (status === 'Picked') return { status, qty: String(Number(item.quantity)) };
  if (status === 'Not found' || status === 'Pending') return { status, qty: '' };
  return { status, qty: draft.qty && Number(draft.qty) < Number(item.quantity) ? draft.qty : '' };
}
type DetailDialog = 'complete' | 'cancel' | 'reverse' | null;

/** The Transfer Order detail: Assign to me, Qty picked and Line status per line, Picked all, Save pick results, Complete transfer, Print pick sheet, Cancel, Reverse order. */
function TransferOrderDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { rows, user, canRun, canReadReport, refresh, notify } = useWorkspace();
  const order = activeRows(rows, 'transfer_orders').find(row => row.id === orderId);
  const items = useMemo(() => orderItemsOf(rows, orderId), [rows, orderId]);
  const saved = useMemo(() => Object.fromEntries(items.map(item => [item.id, draftOf(item)])), [items]);
  const [drafts, setDrafts] = useState<Record<string, PickDraft>>({}), [busy, setBusy] = useState(''), [error, setError] = useState(''), [dialog, setDialog] = useState<DetailDialog>(null);
  if (!order) return <div className="page mto-stock-page"><EmptyState title="Transfer order not found" description="It may have been removed, or it belongs to a main project your account cannot open."/><p><button className="btn" onClick={onBack}><ArrowLeft size={16}/>Transfer Orders</button></p></div>;
  const status = orderStatus(order), places = orderPlaces(rows, order);
  const current = (item: Row) => drafts[item.id] ?? saved[item.id];
  const dirty = items.some(item => drafts[item.id] && (drafts[item.id].qty !== saved[item.id].qty || drafts[item.id].status !== saved[item.id].status));
  const picking = nextStatus(order, 'pick').ok && canRun('transfer-order-pick');
  const assign = canAssign(order, user.id);
  const plan = completePlan(items);
  const completable = nextStatus(order, 'complete').ok && canRun('transfer-order-complete');
  async function run(key: string, label: string, body: Record<string, unknown>, done: string) {
    setBusy(label); setError('');
    try { await post(`/actions/${key}`, { orderId: order!.id, ...body }); await refresh(); setDrafts({}); notify(done); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(''); }
  }
  function savePicks() {
    const results = items.map(item => { const draft = current(item); return { item, input: { itemId: item.id, qtyPicked: draft.qty === '' ? null : Number(draft.qty), lineStatus: draft.status } }; });
    const refused = results.map(entry => pickLine(entry.item, entry.input)).find(step => !step.ok);
    if (refused && !refused.ok) { setError(refused.message); return; }
    void run('transfer-order-pick', 'pick', { items: results.map(entry => entry.input) }, 'Pick results saved.');
  }
  return <div className="page mto-stock-page transfer-order-detail"><div className="page-heading"><div><div className="eyebrow">MATERIALS · TRANSFER ORDERS</div><h1>Transfer order {String(order.number)}</h1>
    <p><Badge>{status}</Badge>{order.reversedAt ? <> <Badge color="red">Reversed</Badge></> : null} {transferTypeLabel(order.type)} · <Badge color={order.priority === 'Urgent' ? 'red' : undefined}>{String(order.priority || 'Normal')}</Badge></p></div>
    <div className="heading-actions">
      <button className="btn" onClick={onBack}><ArrowLeft size={16}/>Transfer Orders</button>
      {assign.ok && canRun('transfer-order-assign') && <button className="btn primary" disabled={Boolean(busy)} onClick={() => void run('transfer-order-assign', 'assign', {}, 'The transfer order is assigned to you.')}>{busy === 'assign' ? <Loader2 size={16} className="spin"/> : <UserCheck size={16}/>}Assign to me</button>}
      {canReadReport('pdf-pick-sheet', 'export') && <a className="btn" href={apiUrl(`/pdf/pick-sheet?orderId=${encodeURIComponent(order.id)}`)} target="_blank" rel="noreferrer"><Printer size={16}/>Print pick sheet</a>}
      {isOpenOrder(order) && canRun('transfer-order-cancel') && <button className="btn" disabled={Boolean(busy)} onClick={() => setDialog('cancel')}><XCircle size={16}/>Cancel</button>}
      {nextStatus(order, 'reverse').ok && canRun('transfer-order-reverse') && <button className="btn" disabled={Boolean(busy)} onClick={() => setDialog('reverse')}><RotateCcw size={16}/>Reverse order</button>}
    </div></div>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <section className="panel order-facts" aria-label="Transfer order"><dl>
      <div><dt>From</dt><dd>{places.from}</dd></div><div><dt>To</dt><dd>{places.to}</dd></div>
      <div><dt>Created date</dt><dd>{formatDate(created(order))}{order.createdByName ? ` · ${order.createdByName}` : ''}</dd></div>
      <div><dt>Handler</dt><dd>{order.assignedName ? `${order.assignedName}${order.assignedAt ? ` · ${formatDate(String(order.assignedAt))}` : ''}` : 'Not assigned'}</dd></div>
      {order.completedDate && <div><dt>Completed</dt><dd>{formatDate(String(order.completedDate))}</dd></div>}
      {order.reversedAt && <div><dt>Reversed</dt><dd>{formatDate(String(order.reversedAt))}{order.reversedBy ? ` · ${order.reversedBy}` : ''}</dd></div>}
      {order.cancelReason && <div className="wide"><dt>Cancel reason</dt><dd>{String(order.cancelReason)}</dd></div>}
      {order.notes && <div className="wide"><dt>Notes</dt><dd>{String(order.notes)}</dd></div>}
    </dl></section>
    <section className="panel"><div className="panel-title-row"><h2>Order items</h2>
      {picking && <div className="heading-actions"><button className="btn" disabled={Boolean(busy) || !items.length} onClick={() => setDrafts(Object.fromEntries(items.map(item => [item.id, { qty: String(Number(item.quantity)), status: 'Picked' as LineStatus }])))}><CheckCheck size={16}/>Picked all</button>
        <button className="btn primary" disabled={Boolean(busy) || !items.length} onClick={savePicks}>{busy === 'pick' ? <Loader2 size={16} className="spin"/> : <Save size={16}/>}Save pick results</button></div>}</div>
      {status === 'Requested' && canRun('transfer-order-pick') && <p className="muted loading-note">Assign the order to yourself to enter the pick results.</p>}
      {items.length ? <TableScroll><table className="data-table pick-table"><thead><tr><th>Material No</th><th>Description</th><th className="numeric">Qty</th><th>UOM</th><th className="numeric">Qty picked</th><th>Line status</th></tr></thead>
        <tbody>{items.map(item => { const draft = current(item); return <tr key={item.id}><td><strong>{String(item.materialNo)}</strong></td><td>{String(item.description || '—')}</td><td className="numeric">{formatNumber(item.quantity, 2)}</td><td>{String(item.uom || '—')}</td>
          <td className="numeric">{picking ? <input type="number" inputMode="decimal" min={0} max={Number(item.quantity)} step="0.01" aria-label={`Qty picked of ${item.materialNo}`} value={draft.qty} onChange={event => setDrafts(all => ({ ...all, [item.id]: changeQty(item, current(item), event.target.value) }))}/> : lineStatus(item) === 'Pending' ? '—' : formatNumber(qtyPicked(item), 2)}</td>
          <td>{picking ? <div className="select-wrap"><select aria-label={`Line status of ${item.materialNo}`} value={draft.status} onChange={event => setDrafts(all => ({ ...all, [item.id]: changeStatus(item, current(item), event.target.value as LineStatus) }))}>{LINE_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14}/></div> : <Badge color={lineStatus(item) === 'Picked' ? 'green' : lineStatus(item) === 'Pending' ? undefined : 'amber'}>{lineStatus(item)}</Badge>}</td></tr>; })}</tbody></table></TableScroll>
        : <EmptyState title="No items" description="This transfer order has no order items."/>}
      {completable && <div className="table-footer"><span>{dirty ? 'Save the pick results before completing the transfer.' : plan.ok ? `${plan.value.outcome === 'Completed' ? 'Every line is picked.' : 'Some lines are short or not found: the order ends Partial.'} Only the picked quantities move.` : plan.message}</span>
        <button className="btn primary" disabled={Boolean(busy) || dirty || !plan.ok} onClick={() => setDialog('complete')}><Truck size={16}/>Complete transfer</button></div>}
    </section>
    {dialog === 'complete' && plan.ok && <CompleteDialog order={order} moves={plan.value.moves} outcome={plan.value.outcome} onClose={() => setDialog(null)}/>}
    {dialog === 'cancel' && <CancelDialog order={order} onClose={() => setDialog(null)}/>}
    {dialog === 'reverse' && <ReverseDialog order={order} onClose={() => setDialog(null)}/>}
  </div>;
}

function CompleteDialog({ order, moves, outcome, onClose }: { order: Row; moves: { item: Row; quantity: number }[]; outcome: 'Completed' | 'Partial'; onClose: () => void }) {
  const [date, setDate] = useState(today()), [note, setNote] = useState('');
  return <ActionDialog title={`Complete transfer ${order.number}`} subtitle={`Moves ${moves.map(move => `${formatNumber(move.quantity, 2)} ${move.item.uom || ''} ${move.item.materialNo}`.replace(/\s+/g, ' ')).join(', ')}. The order becomes ${outcome}. If a quantity exceeds the balance or the destination is no longer valid, nothing moves.`} submit="Complete transfer" onClose={onClose}
    onSubmit={async () => { await post('/actions/transfer-order-complete', { orderId: order.id, date, note }); return `Transfer order ${outcome === 'Completed' ? 'completed' : 'partly completed'}.`; }}>{() => <>
    <Control label="Date" required>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control>
    <Text label="Notes" area value={note} onChange={setNote} max={2000}/></>}</ActionDialog>;
}
function CancelDialog({ order, onClose }: { order: Row; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return <ActionDialog title={`Cancel transfer order ${order.number}`} subtitle="Are you sure you want to cancel this order? No stock moves." submit="Cancel order" onClose={onClose}
    onSubmit={async () => { if (!reason.trim()) throw new Error('Enter the reason for cancelling.'); await post('/actions/transfer-order-cancel', { orderId: order.id, reason }); return 'Transfer order cancelled.'; }}>{errors => <>
    <Text label="Reason" area required value={reason} onChange={setReason} max={500} error={errors.reason}/></>}</ActionDialog>;
}
function ReverseDialog({ order, onClose }: { order: Row; onClose: () => void }) {
  const [date, setDate] = useState(today());
  return <ActionDialog title={`Reverse order ${order.number}`} subtitle="Every quantity this order moved goes back where it came from. The original movements stay in the log. If the destination no longer holds the material, nothing is reversed." submit="Reverse order" onClose={onClose}
    onSubmit={async () => { await post('/actions/transfer-order-reverse', { orderId: order.id, date }); return 'Transfer order reversed.'; }}>{() => <>
    <Control label="Date" required>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control></>}</ActionDialog>;
}

