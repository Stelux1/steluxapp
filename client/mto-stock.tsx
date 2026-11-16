import { useCallback, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRightLeft, ChevronDown, Download, History, Loader2, MoreHorizontal, PackagePlus, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Truck, X } from 'lucide-react';
import { api, apiUrl, ApiError, formatDate, formatNumber, post } from './api.ts';
import { Badge, Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { TablePage } from './records.tsx';
import { CORRECTION_REASONS, MATERIALS_LIST_COLUMNS, TRANSFER_PRIORITIES, TRANSFER_TYPES, inventoryLog, inventoryRows, projectHoldings, stockDetails, transferRoute, validQuantity } from '../shared/mto-stock.ts';
import { materialIdentity } from '../shared/materials.ts';
import type { Row } from '../shared/types.ts';

const today = () => new Date().toISOString().slice(0, 10);
type FieldErrors = Record<string, string>;

/** A labelled native control; the label is tied to the control and errors are announced. */
function Control({ label, error, hint, required, children, wide }: { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, props: Record<string, unknown>) => ReactNode; wide?: boolean }) {
  const id = useId().replaceAll(':', '');
  const props = { id, required, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined };
  return <div className={`field ${wide ? 'full-width' : ''}`}><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>{children(id, props)}{hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
function Choice({ label, value, onChange, options, error, required, blank = 'Choose…', hint }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; error?: string; required?: boolean; blank?: string; hint?: string }) {
  return <Control label={label} error={error} required={required} hint={hint}>{(_, props) => <div className="select-wrap"><select {...props} value={value} onChange={event => onChange(event.target.value)}><option value="">{blank}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14}/></div>}</Control>;
}
function Text({ label, value, onChange, error, required, max, area, hint }: { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; max?: number; area?: boolean; hint?: string }) {
  return <Control label={label} error={error} required={required} hint={hint} wide={area}>{(_, props) => area ? <textarea {...props} rows={3} maxLength={max} value={value} onChange={event => onChange(event.target.value)}/> : <input {...props} type="text" maxLength={max} autoComplete="off" value={value} onChange={event => onChange(event.target.value)}/>}</Control>;
}
function QuantityInput({ label = 'Quantity', value, onChange, error, required = true, max, min = 0.01, disabled }: { label?: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; max?: number; min?: number; disabled?: boolean }) {
  return <Control label={label} error={error} required={required && !disabled} hint={`At least ${min}, in steps of 0.01.`}>{(_, props) => <input {...props} type="number" inputMode="decimal" min={min} max={max} step="0.01" disabled={disabled} value={value} onChange={event => onChange(event.target.value)}/>}</Control>;
}

/** A dialog around one server action: busy state, the server's message and field errors, success message. */
function ActionDialog({ title, subtitle, submit, onSubmit, onClose, children, wide = false }: { title: string; subtitle?: string; submit: string; onSubmit: () => Promise<string>; onClose: () => void; children: (errors: FieldErrors) => ReactNode; wide?: boolean }) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [errors, setErrors] = useState<FieldErrors>({});
  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setErrors({});
    try { const message = await onSubmit(); await refresh(); notify(message); onClose(); }
    catch (failure) { setError((failure as Error).message); setErrors((failure as ApiError).fields || {}); }
    finally { setBusy(false); }
  }
  return <Modal title={title} subtitle={subtitle} onClose={onClose} wide={wide}><form onSubmit={event => void send(event)}><div className="modal-body">{error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}<div className="form-grid">{children(errors)}</div></div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button></div></form></Modal>;
}

const sitesOf = (allRows: Record<string, Row[]>) => activeRows(allRows, 'sites').map(site => ({ value: site.id, label: String(site.name) }));
const warehousesOf = (rows: Record<string, Row[]>) => activeRows(rows, 'warehouses').filter(row => row.use !== 'Tools');
const describeLine = (rows: Record<string, Row[]>, line: Row) => { const details = stockDetails(rows, line); return `${details.materialNo}${line.chargeNo ? ` · ${line.chargeNo}` : ''}`; };

function TransferToProject({ lines, onClose }: { lines: Row[]; onClose: () => void }) {
  const { rows, allRows } = useWorkspace();
  const [siteId, setSite] = useState(''), [date, setDate] = useState(today()), [note, setNote] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(line => [line.id, lines.length === 1 ? '' : String(Math.min(Number(line.quantity), 1))])));
  return <ActionDialog title="Transfer to project" subtitle="The storehouse balance decreases by exactly what the project receives." submit="Transfer" onClose={onClose} wide
    onSubmit={async () => {
      const items = lines.map(line => ({ stockId: line.id, quantity: amounts[line.id] === '' ? NaN : Number(amounts[line.id]) }));
      if (!siteId) throw new Error('Choose the project to transfer to.');
      const bad = items.findIndex(item => !validQuantity(item.quantity)); if (bad >= 0) throw new Error(`Quantity of ${describeLine(rows, lines[bad])} must be at least 0.01, in steps of 0.01.`);
      await post('/actions/stock-to-project', { siteId, items, date, note }); return `Transferred ${lines.length} line${lines.length === 1 ? '' : 's'} to the project.`;
    }}>{errors => <>
    <Choice label="To project site" required value={siteId} onChange={setSite} options={sitesOf(allRows)} error={errors.siteId}/>
    <Control label="Date" required error={errors.date}>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control>
    <div className="field full-width"><span className="field-title">Quantities</span><ul className="stock-lines">{lines.map(line => { const details = stockDetails(rows, line); return <li key={line.id}><span><strong>{details.materialNo}</strong><small>{details.description}{line.chargeNo ? ` · ${line.chargeNo}` : ''} · {formatNumber(line.quantity, 3)} {details.uom} available</small></span><QuantityInput label={`Quantity of ${details.materialNo}`} value={amounts[line.id]} max={Number(line.quantity)} onChange={value => setAmounts(current => ({ ...current, [line.id]: value }))}/></li>; })}</ul></div>
    <Text label="Notes" area value={note} onChange={setNote} max={2000}/></>}</ActionDialog>;
}

function MoveDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [to, setTo] = useState(''), [amount, setAmount] = useState(''), [all, setAll] = useState(false), [date, setDate] = useState(today()), [note, setNote] = useState('');
  return <ActionDialog title="Move to storehouse" subtitle={`${details.materialNo} · ${formatNumber(line.quantity, 3)} ${details.uom} in ${String(rows.warehouses?.find(w => w.id === line.warehouseId)?.name || '')}`} submit="Move" onClose={onClose}
    onSubmit={async () => { if (!all && !validQuantity(Number(amount))) throw new Error('Enter a quantity of at least 0.01, in steps of 0.01.'); await post('/actions/stock-move', { stockId: line.id, toWarehouseId: to, ...(all ? { all: true } : { quantity: Number(amount) }), date, note }); return 'Material moved.'; }}>{errors => <>
    <Choice label="To storehouse" required value={to} onChange={setTo} options={warehousesOf(rows).filter(w => w.id !== line.warehouseId).map(w => ({ value: w.id, label: String(w.name) }))} error={errors.toWarehouseId}/>
    <QuantityInput value={amount} onChange={setAmount} max={Number(line.quantity)} disabled={all} error={errors.quantity}/>
    <div className="field checkbox-field"><label><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)}/><span>All ({formatNumber(line.quantity, 3)} {details.uom})</span></label></div>
    <Control label="Date" required>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control>
    <Text label="Notes" area value={note} onChange={setNote} max={2000}/></>}</ActionDialog>;
}

function ReturnDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows, allRows } = useWorkspace(); const details = stockDetails(rows, line);
  const holders = projectHoldings({ movements: rows.movements || [] }).filter(entry => entry.identity === materialIdentity(line) && entry.chargeNo === String(line.chargeNo || ''));
  const [siteId, setSite] = useState(holders.length === 1 ? holders[0].siteId : ''), [amount, setAmount] = useState(''), [all, setAll] = useState(false), [date, setDate] = useState(today()), [note, setNote] = useState('');
  const held = holders.find(entry => entry.siteId === siteId)?.quantity ?? 0;
  return <ActionDialog title="Return to inventory" subtitle={`${details.materialNo}${line.chargeNo ? ` · ${line.chargeNo}` : ''}: bring material back from a project into this inventory line.`} submit="Return" onClose={onClose}
    onSubmit={async () => { if (!holders.length) throw new Error('No project holds this material from this charge.'); if (!all && !validQuantity(Number(amount))) throw new Error('Enter a quantity of at least 0.01, in steps of 0.01.'); await post('/actions/stock-return', { stockId: line.id, siteId, ...(all ? { all: true } : { quantity: Number(amount) }), date, note }); return 'Material returned to the inventory.'; }}>{errors => <>
    {!holders.length && <p className="field full-width muted" role="status">No project holds this material from this charge, so there is nothing to return.</p>}
    <Choice label="From project site" required value={siteId} onChange={setSite} options={holders.map(entry => ({ value: entry.siteId, label: `${String(allRows.sites?.find(site => site.id === entry.siteId)?.name || 'Project')} · holds ${formatNumber(entry.quantity, 3)} ${details.uom}` }))} error={errors.siteId}/>
    <QuantityInput value={amount} onChange={setAmount} max={held || undefined} disabled={all} error={errors.quantity}/>
    <div className="field checkbox-field"><label><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)}/><span>All{held ? ` (${formatNumber(held, 3)} ${details.uom})` : ''}</span></label></div>
    <Control label="Date" required>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control>
    <Text label="Notes" area value={note} onChange={setNote} max={2000}/></>}</ActionDialog>;
}

function CorrectDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [values, setValues] = useState({ materialGroup: details.group, articleNo: details.articleNo, uom: details.uom, description: details.description, dia: details.dia, lbs: details.lbs, reason: '', reasonText: '', chargeNo: String(line.chargeNo || '') });
  const set = (name: keyof typeof values) => (value: string) => setValues(current => ({ ...current, [name]: value }));
  const uoms = [...new Set([...activeRows(rows, 'uoms').map(row => String(row.name)), details.uom].filter(Boolean))];
  const charges = [...new Set(activeRows(rows, 'certifications').filter(row => !row.materialId || row.materialId === line.materialId).map(row => String(row.chargeNo || '')).filter(Boolean))];
  const listId = useId().replaceAll(':', '');
  return <ActionDialog title="Correct entry" subtitle={`${details.materialNo}: fix the wording of this inventory line. The change is logged with your reason.`} submit="Save correction" onClose={onClose} wide
    onSubmit={async () => { await post('/actions/stock-correct', { stockId: line.id, ...values, date: today() }); return 'Entry corrected.'; }}>{errors => <>
    <Text label="Material group" required max={100} value={values.materialGroup} onChange={set('materialGroup')} error={errors.materialGroup}/>
    <Text label="Article no" max={100} value={values.articleNo} onChange={set('articleNo')} error={errors.articleNo}/>
    <Choice label="UOM" required value={values.uom} onChange={set('uom')} options={uoms.map(name => ({ value: name, label: name }))} error={errors.uom}/>
    <Text label="DIA" max={20} value={values.dia} onChange={set('dia')} error={errors.dia}/>
    <Text label="LBS / SCH" max={20} value={values.lbs} onChange={set('lbs')} error={errors.lbs}/>
    <Text label="Description" required area max={2000} value={values.description} onChange={set('description')} error={errors.description}/>
    <Choice label="Reason" required value={values.reason} onChange={set('reason')} options={CORRECTION_REASONS.map(reason => ({ value: reason, label: reason }))} error={errors.reason}/>
    <Control label="Certificate charge" hint="Choose a charge from the certificates, or type a new one." error={errors.chargeNo}>{(_, props) => <><input {...props} type="text" list={listId} maxLength={100} autoComplete="off" value={values.chargeNo} onChange={event => set('chargeNo')(event.target.value)}/><datalist id={listId}>{charges.map(charge => <option key={charge} value={charge}/>)}</datalist></>}</Control>
    <Text label="Reason text" area max={500} required={values.reason === 'Other'} value={values.reasonText} onChange={set('reasonText')} error={errors.reasonText}/></>}</ActionDialog>;
}

function AdjustDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [amount, setAmount] = useState(String(line.quantity)), [reason, setReason] = useState('');
  return <ActionDialog title="Adjust quantity" subtitle={`${details.materialNo}: enter the counted quantity. The difference is logged.`} submit="Adjust" onClose={onClose}
    onSubmit={async () => { await post('/actions/stock-adjust', { stockId: line.id, quantity: Number(amount), reasonText: reason, date: today() }); return 'Quantity adjusted.'; }}>{errors => <>
    <Control label="Current quantity">{(_, props) => <input {...props} readOnly value={`${formatNumber(line.quantity, 3)} ${details.uom}`}/>}</Control>
    <QuantityInput label="New quantity" min={0} value={amount} onChange={setAmount} error={errors.quantity}/>
    <Text label="Reason text" area required max={500} value={reason} onChange={setReason} error={errors.reasonText}/></>}</ActionDialog>;
}

function RemoveDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [reason, setReason] = useState(''), [note, setNote] = useState('');
  return <ActionDialog title="Remove from inventory" subtitle={`${details.materialNo}${Number(line.quantity) > 0 ? `: the remaining ${formatNumber(line.quantity, 3)} ${details.uom} is written off.` : ''}`} submit="Remove" onClose={onClose}
    onSubmit={async () => { await post('/actions/stock-remove', { stockId: line.id, reasonText: reason, note, date: today() }); return 'Removed from the inventory.'; }}>{errors => <>
    <Text label="Reason" required max={500} value={reason} onChange={setReason} error={errors.reasonText} hint="For example: imported by mistake."/>
    <Text label="Notes" area max={2000} value={note} onChange={setNote}/></>}</ActionDialog>;
}

function AddFromDatabase({ warehouseId, onClose }: { warehouseId: string; onClose: () => void }) {
  const { rows } = useWorkspace();
  const [materialId, setMaterial] = useState(''), [charge, setCharge] = useState(''), [amount, setAmount] = useState('');
  return <ActionDialog title="Add material from DB" subtitle="Put a catalog material into this storehouse." submit="Add to inventory" onClose={onClose}
    onSubmit={async () => { if (!validQuantity(Number(amount))) throw new Error('Enter a quantity of at least 0.01, in steps of 0.01.'); await post('/actions/stock-add', { warehouseId, materialId, chargeNo: charge, quantity: Number(amount), date: today() }); return 'Material added to the inventory.'; }}>{errors => <>
    <Choice label="Material" required value={materialId} onChange={setMaterial} options={activeRows(rows, 'materials').map(row => ({ value: row.id, label: `${row.materialNo} · ${row.description}${row.dia ? ` · ${row.dia}` : ''}` }))} error={errors.materialId}/>
    <Text label="Charge / heat number" max={100} value={charge} onChange={setCharge} error={errors.chargeNo}/>
    <QuantityInput value={amount} onChange={setAmount} error={errors.quantity}/></>}</ActionDialog>;
}

function LogDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows, label } = useWorkspace(); const details = stockDetails(rows, line);
  const log = inventoryLog(rows, line);
  return <Modal title="Inventory log" subtitle={`${details.materialNo}${line.chargeNo ? ` · ${line.chargeNo}` : ''} in ${label('warehouses', line.warehouseId)}`} onClose={onClose} wide><div className="modal-body">
    {!log.length ? <EmptyState title="No movements yet" description="Receipts, transfers, corrections and adjustments of this line are listed here."/> : <TableScroll><table className="data-table"><thead><tr><th>Date</th><th>Reference</th><th>Movement</th><th className="numeric">Quantity</th><th>Notes</th></tr></thead><tbody>{log.map(move => <tr key={move.id}><td>{formatDate(move.date)}</td><td>{String(move.number || '—')}</td><td>{String(move.type)}{move.reason ? ` · ${move.reason}` : ''}</td><td className="numeric">{formatNumber(move.quantity, 3)}</td><td>{String(move.reasonText || move.note || '—')}</td></tr>)}</tbody></table></TableScroll>}
  </div><div className="modal-footer"><button className="btn primary" onClick={onClose}>Close</button></div></Modal>;
}

interface ItemDraft { materialNo: string; description: string; quantity: string; uom: string; stockId: string }
function OrderDialog({ lines, defaultFrom, onClose }: { lines: Row[]; defaultFrom: string; onClose: () => void }) {
  const { rows, allRows } = useWorkspace();
  const [type, setType] = useState(lines.length ? TRANSFER_TYPES[0] : ''), [priority, setPriority] = useState('Normal');
  const [from, setFrom] = useState(defaultFrom), [siteId, setSite] = useState(''), [to, setTo] = useState(''), [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>(() => lines.length ? lines.map(line => { const details = stockDetails(rows, line); return { materialNo: details.materialNo, description: details.description, quantity: String(Math.min(Number(line.quantity), 1) || ''), uom: details.uom, stockId: line.id }; }) : [{ materialNo: '', description: '', quantity: '', uom: '', stockId: '' }]);
  const route = transferRoute(type);
  const update = (index: number, patch: Partial<ItemDraft>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const warehouses = warehousesOf(rows).map(w => ({ value: w.id, label: String(w.name) }));
  return <ActionDialog title="New transfer order" subtitle="Plan the move now; nothing moves until the order is completed." submit="Create transfer order" onClose={onClose} wide
    onSubmit={async () => {
      if (!route) throw new Error('Choose the type of transfer order.');
      const bad = items.findIndex(item => !item.materialNo.trim() || !validQuantity(Number(item.quantity)));
      if (bad >= 0) throw new Error(`Item ${bad + 1} needs a material number and a quantity of at least 0.01, in steps of 0.01.`);
      await post('/actions/transfer-order-create', { type, priority, fromWarehouseId: route.from === 'storehouse' ? from : '', siteId: route.from === 'project' || route.to === 'project' ? siteId : '', toWarehouseId: route.to === 'storehouse' ? to : '', notes, date: today(), items: items.map(item => ({ ...item, quantity: Number(item.quantity) })) });
      return 'Transfer order created.';
    }}>{errors => <>
    <Choice label="Type" required value={type} onChange={setType} options={TRANSFER_TYPES.map(value => ({ value, label: value }))} error={errors.type}/>
    <Choice label="Priority" value={priority} onChange={setPriority} blank="Normal" options={TRANSFER_PRIORITIES.map(value => ({ value, label: value }))} error={errors.priority}/>
    {route?.from === 'storehouse' && <Choice label="From storehouse" required value={from} onChange={setFrom} options={warehouses} error={errors.fromWarehouseId}/>}
    {route && (route.from === 'project' || route.to === 'project') && <Choice label={route.from === 'project' ? 'From project site' : 'To project site'} required value={siteId} onChange={setSite} options={sitesOf(allRows)} error={errors.siteId}/>}
    {route?.to === 'storehouse' && <Choice label="To storehouse" required value={to} onChange={setTo} options={warehouses.filter(w => w.value !== from)} error={errors.toWarehouseId}/>}
    <Text label="Notes" area value={notes} onChange={setNotes} max={2000}/>
    <div className="field full-width"><span className="field-title">Items</span><ul className="order-items">{items.map((item, index) => <li key={index}>
      <Text label={`Material no. (item ${index + 1})`} required max={100} value={item.materialNo} onChange={value => update(index, { materialNo: value })}/>
      <Text label={`Description (item ${index + 1})`} max={2000} value={item.description} onChange={value => update(index, { description: value })}/>
      <QuantityInput label={`Quantity (item ${index + 1})`} value={item.quantity} onChange={value => update(index, { quantity: value })}/>
      <Text label={`UOM (item ${index + 1})`} max={20} value={item.uom} onChange={value => update(index, { uom: value })}/>
      <button type="button" className="icon-btn" aria-label={`Remove item ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}><Trash2 size={16}/></button></li>)}</ul>
      <button type="button" className="btn subtle small" onClick={() => setItems(current => [...current, { materialNo: '', description: '', quantity: '', uom: '', stockId: '' }])}><Plus size={15}/>Add item</button></div></>}</ActionDialog>;
}

type Dialog = { kind: 'log' | 'move' | 'return' | 'correct' | 'adjust' | 'remove'; line: Row } | { kind: 'project' | 'order'; lines: Row[] } | { kind: 'add' } | null;

/** Material inventory: the stock of one storehouse with its operations. */
export function MaterialInventory() {
  const { rows, canRecord, canRun, label } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const warehouses = warehousesOf(rows);
  const requested = params.get('storehouse') || '';
  const warehouseId = warehouses.some(w => w.id === requested) ? requested : warehouses[0]?.id || '';
  const [onlyWithQuantity, setOnly] = useState(true), [query, setQuery] = useState(''), [checked, setChecked] = useState<string[]>([]), [dialog, setDialog] = useState<Dialog>(null);
  const list = useMemo(() => inventoryRows(rows, { warehouseId, onlyWithQuantity, query }), [rows, warehouseId, onlyWithQuantity, query]);
  if (!canRecord('stock')) return <EmptyState title="No access to the material inventory" description="Your permission profile does not include the material inventory."/>;
  const selected = list.filter(entry => checked.includes(entry.stock.id)).map(entry => entry.stock);
  const allowed = (key: string) => canRun(key);
  const close = () => { setDialog(null); setChecked([]); };
  const lineAction = (kind: 'log' | 'move' | 'return' | 'correct' | 'adjust' | 'remove', line: Row) => setDialog({ kind, line });
  return <div className="page mto-stock-page"><div className="page-heading"><div><div className="eyebrow">MATERIALS · ORDER / TAKE IN</div><h1>Material inventory</h1><p>What every storehouse holds, with its transfers, corrections and log.</p></div>
    <div className="heading-actions">
      {allowed('stock-add') && warehouseId && <Dropdown label="Add" className="add-menu" trigger={<span className="btn">Add<ChevronDown size={14}/></span>}><button type="button" onClick={() => setDialog({ kind: 'add' })}><PackagePlus size={15}/>Add material from DB</button></Dropdown>}
      {allowed('stock-to-project') && <button className="btn" disabled={!selected.length} onClick={() => setDialog({ kind: 'project', lines: selected })}><Truck size={16}/>Transfer to project ({selected.length})</button>}
      {allowed('transfer-order-create') && <button className="btn primary" disabled={!selected.length} onClick={() => setDialog({ kind: 'order', lines: selected })}>New Transfer Order ({selected.length})</button>}
    </div></div>
    {!warehouses.length ? <EmptyState title="No storehouses yet" description="Add a storehouse first, then put material into it." action={canRecord('warehouses') ? <Link className="btn primary" to="/workspace/warehouses">Open Storehouses</Link> : undefined}/> : <section className="panel">
      <div className="inventory-filters"><Choice label="Storehouse" value={warehouseId} onChange={value => { setParams({ storehouse: value }); setChecked([]); }} options={warehouses.map(w => ({ value: w.id, label: String(w.name) }))} blank="Choose a storehouse"/>
        <Control label="Show">{(_, props) => <div className="select-wrap"><select {...props} value={onlyWithQuantity ? 'qty' : 'all'} onChange={event => { setOnly(event.target.value === 'qty'); setChecked([]); }}><option value="qty">Only with quantity</option><option value="all">All materials</option></select><ChevronDown size={14}/></div>}</Control>
        <SearchInput value={query} onChange={value => { setQuery(value); setChecked([]); }} placeholder="Search material, description or charge…"/></div>
      {selected.length > 0 && <div className="selection-bar"><strong>{selected.length} selected</strong><button className="clear-selection" onClick={() => setChecked([])}><X size={14}/>Clear selection</button></div>}
      {list.length ? <TableScroll><table className="data-table inventory-table"><thead><tr><th className="select-cell"><input type="checkbox" aria-label="Check all inventory lines" checked={list.every(entry => checked.includes(entry.stock.id))} onChange={event => setChecked(event.target.checked ? list.map(entry => entry.stock.id) : [])}/></th><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="numeric">Quantity</th><th>UOM</th><th>Options</th></tr></thead>
        <tbody>{list.map(({ stock, details }) => <tr key={stock.id}><td className="select-cell"><input type="checkbox" aria-label={`Check ${details.materialNo}`} checked={checked.includes(stock.id)} onChange={event => setChecked(current => event.target.checked ? [...current, stock.id] : current.filter(id => id !== stock.id))}/></td>
          <td>{details.group || '—'}</td><td>{details.articleNo || '—'}</td><td><strong>{details.materialNo}</strong>{stock.chargeNo ? <small className="execution-subvalue">{String(stock.chargeNo)}</small> : null}{stock.corrected === true && <Badge color="amber">Corrected</Badge>}</td><td>{details.dia || '—'}</td><td>{details.lbs || '—'}</td><td>{details.description || '—'}</td><td className="numeric">{formatNumber(stock.quantity, 3)}</td><td>{details.uom || '—'}</td>
          <td><Dropdown label={`Options for ${details.materialNo}`} trigger={<span className="icon-btn"><MoreHorizontal size={17}/></span>}>
            <button type="button" onClick={() => lineAction('log', stock)}><History size={15}/>Inventory log</button>
            {allowed('stock-to-project') && <button type="button" disabled={Number(stock.quantity) <= 0} onClick={() => setDialog({ kind: 'project', lines: [stock] })}><Truck size={15}/>Transfer to project</button>}
            {allowed('stock-move') && <button type="button" disabled={Number(stock.quantity) <= 0 || warehouses.length < 2} onClick={() => lineAction('move', stock)}><ArrowRightLeft size={15}/>Move to storehouse</button>}
            {allowed('stock-return') && <button type="button" onClick={() => lineAction('return', stock)}><RotateCcw size={15}/>Return to inventory</button>}
            {allowed('stock-correct') && <button type="button" onClick={() => lineAction('correct', stock)}><Pencil size={15}/>Correct entry</button>}
            {allowed('stock-adjust') && <button type="button" onClick={() => lineAction('adjust', stock)}><RefreshCw size={15}/>Adjust quantity</button>}
            {allowed('stock-remove') && <button type="button" onClick={() => lineAction('remove', stock)}><Trash2 size={15}/>Remove from inventory</button>}
          </Dropdown></td></tr>)}</tbody></table></TableScroll> : <EmptyState title={onlyWithQuantity ? 'No material in stock' : 'No materials in this storehouse'} description={query ? 'No inventory line matches your search.' : onlyWithQuantity ? 'Choose All materials to include lines without quantity, or add material from the database.' : 'Add material from the database or receive an order.'}/>}
      <div className="table-footer"><span>{list.length} inventory line{list.length === 1 ? '' : 's'} · {label('warehouses', warehouseId)}</span></div></section>}
    {dialog?.kind === 'log' && <LogDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'move' && <MoveDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'return' && <ReturnDialog line={dialog.line} onClose={close}/>}
    {dialog?.kind === 'correct' && <CorrectDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'adjust' && <AdjustDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'remove' && <RemoveDialog line={dialog.line} onClose={close}/>}
    {dialog?.kind === 'project' && <TransferToProject lines={dialog.lines} onClose={close}/>}{dialog?.kind === 'order' && <OrderDialog lines={dialog.lines} defaultFrom={warehouseId} onClose={close}/>}{dialog?.kind === 'add' && <AddFromDatabase warehouseId={warehouseId} onClose={close}/>}
  </div>;
}

/** Storehouses: the generic record page, plus a shortcut to each storehouse's inventory. */
export function Storehouses() {
  const { rows, canRecord } = useWorkspace();
  const warehouses = warehousesOf(rows);
  return <><TablePage resourceKey="warehouses"/>{canRecord('stock') && warehouses.length > 0 && <section className="panel storehouse-shortcuts" aria-label="Storehouse inventories"><h2>Inventory per storehouse</h2><ul>{warehouses.map(w => { const lines = activeRows(rows, 'stock').filter(s => s.warehouseId === w.id && Number(s.quantity) > 0).length; return <li key={w.id}><span><strong>{String(w.name)}</strong><small>{lines} line{lines === 1 ? '' : 's'} with quantity</small></span><Link className="btn small" to={`/materials/stock?storehouse=${w.id}`}>Open inventory</Link></li>; })}</ul></section>}</>;
}

/** Transfer orders: planned moves, completed or cancelled here. */
export function TransferOrders() {
  const { rows, label, canRecord, canRun } = useWorkspace();
  const [status, setStatus] = useState('Open'), [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'items' | 'complete' | 'cancel'; order: Row } | null>(null);
  if (!canRecord('transfer_orders')) return <EmptyState title="No access to transfer orders" description="Your permission profile does not include the material inventory."/>;
  const orders = activeRows(rows, 'transfer_orders').filter(order => !status || order.status === status).sort((a, b) => String(b.number).localeCompare(String(a.number)));
  const items = (order: Row) => activeRows(rows, 'transfer_order_items').filter(item => item.orderId === order.id);
  const destination = (order: Row) => { const route = transferRoute(String(order.type)); return route?.to === 'project' ? label('sites', order.siteId) : label('warehouses', order.toWarehouseId); };
  const origin = (order: Row) => { const route = transferRoute(String(order.type)); return route?.from === 'project' ? label('sites', order.siteId) : label('warehouses', order.fromWarehouseId); };
  return <div className="page mto-stock-page"><div className="page-heading"><div><div className="eyebrow">MATERIALS · ORDER / TAKE IN</div><h1>Transfer orders</h1><p>Plan moves between storehouses and projects, then complete them to apply the movements.</p></div>
    <div className="heading-actions">{canRun('transfer-order-create') && <button className="btn primary" onClick={() => setDialog({ kind: 'new' })}><Plus size={16}/>New transfer order</button>}</div></div>
    <section className="panel"><div className="inventory-filters"><Choice label="Status" value={status} onChange={setStatus} blank="All statuses" options={['Open', 'Completed', 'Cancelled'].map(value => ({ value, label: value }))}/></div>
      {orders.length ? <TableScroll><table className="data-table"><thead><tr><th>Transfer order</th><th>Type</th><th>Priority</th><th>Status</th><th>From</th><th>To</th><th>Date</th><th className="numeric">Items</th><th>Options</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}>
        <td><button className="record-link" onClick={() => setDialog({ kind: 'items', order })}>{String(order.number)}</button></td><td>{String(order.type)}</td><td><Badge color={order.priority === 'Urgent' ? 'red' : undefined}>{String(order.priority)}</Badge></td><td><Badge>{String(order.status)}</Badge></td><td>{origin(order)}</td><td>{destination(order)}</td><td>{formatDate(order.date)}</td><td className="numeric">{items(order).length}</td>
        <td>{order.status === 'Open' ? <span className="row-buttons">{canRun('transfer-order-complete') && <button className="btn small primary" onClick={() => setDialog({ kind: 'complete', order })}>Complete</button>}{canRun('transfer-order-cancel') && <button className="btn small" onClick={() => setDialog({ kind: 'cancel', order })}>Cancel</button>}</span> : <span className="muted">—</span>}</td></tr>)}</tbody></table></TableScroll>
        : <EmptyState title={status ? `No ${status.toLowerCase()} transfer orders` : 'No transfer orders yet'} description="Check lines in the Material inventory and choose New Transfer Order, or create an order here."/>}
      <div className="table-footer"><span>{orders.length} transfer order{orders.length === 1 ? '' : 's'}</span></div></section>
    {dialog?.kind === 'new' && <OrderDialog lines={[]} defaultFrom={warehousesOf(rows)[0]?.id || ''} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'items' && <Modal title={`Transfer order ${dialog.order.number}`} subtitle={`${dialog.order.type} · ${dialog.order.priority}${dialog.order.notes ? ` · ${dialog.order.notes}` : ''}`} onClose={() => setDialog(null)} wide><div className="modal-body"><TableScroll><table className="data-table"><thead><tr><th>Material no.</th><th>Description</th><th className="numeric">Quantity</th><th>UOM</th></tr></thead><tbody>{items(dialog.order).map(item => <tr key={item.id}><td>{String(item.materialNo)}</td><td>{String(item.description || '—')}</td><td className="numeric">{formatNumber(item.quantity, 2)}</td><td>{String(item.uom || '—')}</td></tr>)}</tbody></table></TableScroll></div><div className="modal-footer"><button className="btn primary" onClick={() => setDialog(null)}>Close</button></div></Modal>}
    {dialog?.kind === 'complete' && <OrderStatusDialog order={dialog.order} complete onClose={() => setDialog(null)}/>}{dialog?.kind === 'cancel' && <OrderStatusDialog order={dialog.order} onClose={() => setDialog(null)}/>}
  </div>;
}
function OrderStatusDialog({ order, complete = false, onClose }: { order: Row; complete?: boolean; onClose: () => void }) {
  const [date, setDate] = useState(today()), [note, setNote] = useState('');
  return <ActionDialog title={`${complete ? 'Complete' : 'Cancel'} transfer order ${order.number}`} subtitle={complete ? 'The movements of every item are applied now. If any item is short, nothing moves.' : 'No stock moves. The order stays in the list as cancelled.'} submit={complete ? 'Complete' : 'Cancel order'} onClose={onClose}
    onSubmit={async () => { await post(`/actions/transfer-order-${complete ? 'complete' : 'cancel'}`, { orderId: order.id, date, note }); return complete ? 'Transfer order completed.' : 'Transfer order cancelled.'; }}>{() => <>
    {complete && <Control label="Date" required>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control>}<Text label="Notes" area value={note} onChange={setNote} max={2000}/></>}</ActionDialog>;
}

interface ListData { rows: { id: string; values: Record<string, string | number> }[]; generatedAt: string }
/** Materials list: every material of the active main project with ordered, inventory and picked quantities, computed on each load. */
export function MaterialsList() {
  const { siteId, canRecord, label } = useWorkspace();
  const [projectId, setProject] = useState(''), [isoId, setIso] = useState(''), [query, setQuery] = useState(''), [reload, setReload] = useState(0);
  const [data, setData] = useState<ListData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const scope = new URLSearchParams({ ...(siteId ? { siteId } : {}), ...(projectId ? { projectId } : {}), ...(isoId ? { isoId } : {}) }).toString();
  const allowed = canRecord('stock') && canRecord('iso_materials');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api<ListData>(`/mto/materials-list?${scope}`)); } catch (failure) { setError((failure as Error).message); } finally { setLoading(false); }
  }, [scope]);
  useEffect(() => { if (allowed) void load(); }, [allowed, load, reload]);
  if (!allowed) return <EmptyState title="No access to the materials list" description="Your permission profile does not include the material inventory and isometric materials."/>;
  const shown = (data?.rows || []).filter(row => !query || Object.values(row.values).some(value => String(value).toLowerCase().includes(query.toLowerCase())));
  const exportUrl = (format: string) => apiUrl(`/mto/materials-list?${new URLSearchParams({ format, q: query, ...Object.fromEntries(new URLSearchParams(scope)) }).toString()}`);
  return <div className="page mto-stock-page"><div className="page-heading"><div><div className="eyebrow">MATERIALS · ORDER / TAKE IN</div><h1>Materials list</h1><p>{siteId ? `Materials of ${label('sites', siteId)}` : 'Materials of every main project'}, with what is ordered, in stock and picked.</p></div>
    <div className="heading-actions"><button className="btn" onClick={() => setReload(value => value + 1)} disabled={loading}><RefreshCw size={16}/>Refresh</button>{canRecord('stock', 'export') && <><a className="btn" href={exportUrl('csv')}><Download size={16}/>CSV</a><a className="btn" href={exportUrl('xlsx')}><Download size={16}/>Excel</a></>}</div></div>
    <section className="panel"><div className="inventory-filters"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => { setProject(String(value)); setIso(''); }}/><FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={value => setIso(String(value))}/><SearchInput value={query} onChange={setQuery} placeholder="Filter by material, description or iso…"/></div>
      {error ? <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="btn small" onClick={() => setReload(value => value + 1)}>Try again</button></div>
        : loading && !data ? <p role="status" className="muted loading-note"><Loader2 size={15} className="spin"/> Loading the materials list…</p>
        : shown.length ? <TableScroll><table className="data-table materials-list-table" aria-busy={loading}><thead><tr>{MATERIALS_LIST_COLUMNS.map(column => <th key={column.key} className={column.type === 'number' ? 'numeric' : undefined}>{column.label}</th>)}</tr></thead><tbody>{shown.map(row => <tr key={row.id}>{MATERIALS_LIST_COLUMNS.map(column => <td key={column.key} className={column.type === 'number' ? 'numeric' : undefined}>{column.type === 'number' ? formatNumber(row.values[column.key], 3) : column.key === 'ordered' ? <Badge>{String(row.values.ordered)}</Badge> : String(row.values[column.key] || '—')}</td>)}</tr>)}</tbody></table></TableScroll>
        : <EmptyState title="No materials to list" description={query || projectId || isoId ? 'No material matches your filters.' : 'Add materials to an isometric of this main project to see them here.'}/>}
      <div className="table-footer"><span>{shown.length} line{shown.length === 1 ? '' : 's'}{data ? ` · computed ${new Date(data.generatedAt).toLocaleTimeString('en-GB')}` : ''}</span><span>Inv. counts every storehouse.</span></div></section></div>;
}
