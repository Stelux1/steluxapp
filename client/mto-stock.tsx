import { useCallback, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRightLeft, ChevronDown, Download, FileText, History, Loader2, MoreHorizontal, PackagePlus, Pencil, Plus, QrCode, RefreshCw, RotateCcw, Search, Trash2, Truck, X } from 'lucide-react';
import { api, apiUrl, ApiError, formatDate, formatNumber, post } from './api.ts';
import { Badge, Dropdown, EmptyState, FieldInput, FormError, Modal, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import type { AuditEvent } from '../shared/types.ts';
import { TablePage } from './records.tsx';
import { ADJUST_REASONS, CORRECTION_REASONS, MATERIALS_LIST_COLUMNS, REMOVE_REASONS, SEARCH_LIMIT, TRANSFER_PRIORITIES, INVENTORY_ROW_OPTIONS, defaultTransferType, inventoryLog, inventoryRows, lineCertificates, materialLogRows, prefilledOrderItems, reservedOnOpenOrders, searchHasTerm, searchLocations, searchStock, siteMaterialLog, stockDetails, storehouseRows, storehouseTransactions, transferAmountDefault, transferOrderFields, transferRoute, transferTypesFor, validQuantity, type InventoryRow, type MaterialLogRow, type SearchFilters, type Transaction, type TransferContext } from '../shared/mto-stock.ts';
import { certificateFile } from './certifications.tsx';
import { TableExportButtons } from './table-buttons.tsx';
import { INVENTORY_EXPORT_COLUMNS } from '../shared/export-tables.ts';
import type { Row } from '../shared/types.ts';

const today = () => new Date().toISOString().slice(0, 10);
const two = (value: number) => String(value).padStart(2, '0');
/** dd.mm.yyyy. hh:mm, the form of the reference's logs; the day alone when the time is not known. */
const stamp = (date: string, at: string) => { const when = at ? new Date(at) : null; return when && !Number.isNaN(when.getTime()) ? `${two(when.getDate())}.${two(when.getMonth() + 1)}.${when.getFullYear()}. ${two(when.getHours())}:${two(when.getMinutes())}` : formatDate(date); };
const signed = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`;
/** A link that opens the QR labels of some Material Nos (one label each) as a PDF. */
const labelsHref = (materialNos: string[]) => apiUrl(`/pdf/material-labels?materialno=${encodeURIComponent([...new Set(materialNos)].join(','))}`);
type FieldErrors = Record<string, string>;

/** A labelled native control; the label is tied to the control and errors are announced. */
function Control({ label, error, hint, required, children, wide }: { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, props: Record<string, unknown>) => ReactNode; wide?: boolean }) {
  const id = useId().replaceAll(':', '');
  const props = { id, required, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined };
  return <div className={`field ${wide ? 'full-width' : ''}`}><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>{children(id, props)}{hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
function Choice({ label, value, onChange, options, error, required, blank = 'Choose…', hint, noBlank }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; error?: string; required?: boolean; blank?: string; hint?: string; noBlank?: boolean }) {
  return <Control label={label} error={error} required={required} hint={hint}>{(_, props) => <div className="select-wrap"><select {...props} value={value} onChange={event => onChange(event.target.value)}>{!noBlank && <option value="">{blank}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14}/></div>}</Control>;
}
function Text({ label, value, onChange, error, required, max, area, hint, placeholder }: { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; max?: number; area?: boolean; hint?: string; placeholder?: string }) {
  return <Control label={label} error={error} required={required} hint={hint} wide={area}>{(_, props) => area ? <textarea {...props} rows={3} maxLength={max} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}/> : <input {...props} type="text" maxLength={max} placeholder={placeholder} autoComplete="off" value={value} onChange={event => onChange(event.target.value)}/>}</Control>;
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
  return <Modal title={title} subtitle={subtitle} onClose={onClose} wide={wide}><form onSubmit={event => void send(event)}><div className="modal-body"><FormError message={error} fields={errors}/><div className="form-grid">{children(errors)}</div></div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button></div></form></Modal>;
}

const sitesOf = (allRows: Record<string, Row[]>) => activeRows(allRows, 'sites').map(site => ({ value: site.id, label: String(site.name) }));
const warehousesOf = (rows: Record<string, Row[]>) => activeRows(rows, 'warehouses').filter(row => row.use !== 'Tools');
const describeLine = (rows: Record<string, Row[]>, line: Row) => { const details = stockDetails(rows, line); return `${details.materialNo}${line.chargeNo ? ` · ${line.chargeNo}` : ''}`; };
const storehouseName = (rows: Record<string, Row[]>, line: Row) => String(rows.warehouses?.find(w => w.id === line.warehouseId)?.name || '');

/**
 * The project site whose Material inventory the page works on: the active project site, or (when the workspace shows
 * every site) the one chosen here.
 */
function useInventorySite() {
  const { siteId, allRows } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const sites = sitesOf(allRows);
  const requested = params.get('site') || '';
  const chosen = siteId || (sites.some(site => site.value === requested) ? requested : sites[0]?.value || '');
  return { siteId: chosen, fixed: Boolean(siteId), sites, choose: (value: string) => setParams({ site: value }) };
}

/** "Transfer material from storehouse to project" (one line) / "Bulk transfer materials to project" (checked lines): quantity, destination, certificates; the time is the moment of sending. */
function TransferToProject({ lines, defaultSite, onClose }: { lines: Row[]; defaultSite: string; onClose: () => void }) {
  const { rows, allRows } = useWorkspace();
  const [siteId, setSite] = useState(defaultSite);
  const single = lines.length === 1;
  // One line starts empty (the reference clears the field); the bulk dialog starts every line at its full balance.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(line => [line.id, transferAmountDefault(lines, line)])));
  const certificates = useMemo(() => Object.fromEntries(lines.map(line => [line.id, lineCertificates(rows, line)])), [rows, lines]);
  const [ticked, setTicked] = useState<Record<string, string[]>>(() => Object.fromEntries(lines.map(line => [line.id, lineCertificates(rows, line).map(cert => cert.id)])));
  return <ActionDialog title={single ? 'Transfer material from storehouse to project' : 'Bulk transfer materials to project'} subtitle="The material moves into the Material inventory of the destination project site." submit={single ? 'Transfer' : 'Transfer all'} onClose={onClose} wide
    onSubmit={async () => {
      const items = lines.map(line => ({ stockId: line.id, quantity: amounts[line.id] === '' ? NaN : Number(amounts[line.id]), certIds: ticked[line.id] || [] }));
      if (!siteId) throw new Error('Choose the destination project site.');
      const over = items.findIndex((item, index) => item.quantity > Number(lines[index].quantity)); if (over >= 0) throw new Error(`Quantity exceeds available balance (${Number(lines[over].quantity)}).`);
      const bad = items.findIndex(item => !validQuantity(item.quantity)); if (bad >= 0) throw new Error(`Quantity of ${describeLine(rows, lines[bad])} must be at least 0.01, in steps of 0.01.`);
      await post('/actions/stock-to-project', { siteId, items }); return `Transferred ${lines.length} line${single ? '' : 's'} to ${String(allRows.sites?.find(site => site.id === siteId)?.name || 'the project site')}.`;
    }}>{errors => <>
    <Choice label="Destination project site" required value={siteId} onChange={setSite} options={sitesOf(allRows)} error={errors.siteId}/>
    <div className="field full-width"><span className="field-title">{single ? 'Material' : 'Selected materials:'}</span><ul className="stock-lines">{lines.map(line => { const details = stockDetails(rows, line); const certs = certificates[line.id] || []; return <li key={line.id}><span><strong>{details.materialNo}</strong><small>{details.description}{line.chargeNo ? ` · ${line.chargeNo}` : ''} · {storehouseName(rows, line)} · Available: {formatNumber(line.quantity, 3)} {details.uom}</small></span><QuantityInput label={`Quantity of ${details.materialNo}`} value={amounts[line.id]} max={Number(line.quantity)} onChange={value => setAmounts(current => ({ ...current, [line.id]: value }))}/>
      <fieldset className="field full-width"><legend className="field-title">Certificates to transfer (will be copied to destination project)</legend>{certs.length ? certs.map(cert => <label key={cert.id} className="checkbox-field"><input type="checkbox" checked={(ticked[line.id] || []).includes(cert.id)} onChange={event => setTicked(current => ({ ...current, [line.id]: event.target.checked ? [...(current[line.id] || []), cert.id] : (current[line.id] || []).filter(id => id !== cert.id) }))}/><span>{String(cert.name)}{cert.indexNo ? ` · index ${cert.indexNo}` : ''}</span></label>) : <small className="muted">No certificates for this material and charge.</small>}</fieldset></li>; })}</ul></div></>}</ActionDialog>;
}

/** Move to other storehouse (reference #moveLagerToLager): Material / From / Available, Quantity, Move all, Destination storehouse (the source is left out, the first other one is preselected). */
function MoveDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const others = warehousesOf(rows).filter(w => w.id !== line.warehouseId);
  const [to, setTo] = useState(String(others[0]?.id || '')), [amount, setAmount] = useState(''), [all, setAll] = useState(false);
  const balance = Number(line.quantity);
  return <ActionDialog title="Move to other storehouse" subtitle={`Material: ${details.materialNo} · From: ${storehouseName(rows, line)} · Available: ${formatNumber(balance, 3)} ${details.uom}`} submit="Move" onClose={onClose}
    onSubmit={async () => {
      if (!all && Number(amount) > balance) throw new Error(`Quantity exceeds available balance (${balance}).`);
      if (!all && !validQuantity(Number(amount))) throw new Error('Enter a quantity of at least 0.01, in steps of 0.01.');
      await post('/actions/stock-move', { stockId: line.id, toWarehouseId: to, ...(all ? { all: true } : { quantity: Number(amount) }) }); return 'Material moved.';
    }}>{errors => <>
    <QuantityInput value={all ? String(balance) : amount} onChange={setAmount} max={balance} disabled={all} error={errors.quantity}/>
    <div className="field checkbox-field"><label><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)}/><span>Move all</span></label></div>
    <Choice label="Destination storehouse" required noBlank value={to} onChange={setTo} options={others.map(w => ({ value: w.id, label: String(w.name) }))} error={errors.toWarehouseId}/></>}</ActionDialog>;
}

/** Return to inventory: from a storehouse line into the Material inventory of the project site (the dialog names no destination). */
function ReturnDialog({ line, siteId, onClose }: { line: Row; siteId: string; onClose: () => void }) {
  const { rows, allRows } = useWorkspace(); const details = stockDetails(rows, line);
  const [target, setTarget] = useState(siteId), [amount, setAmount] = useState(''), [all, setAll] = useState(false), [date, setDate] = useState(today()), [note, setNote] = useState('');
  return <ActionDialog title="Return to inventory" subtitle={`${details.materialNo}${line.chargeNo ? ` · ${line.chargeNo}` : ''} · Storehouse: ${storehouseName(rows, line)} · Available: ${formatNumber(line.quantity, 3)} ${details.uom}`} submit="Return" onClose={onClose}
    onSubmit={async () => { if (!target) throw new Error('Choose the project site whose inventory receives the material.'); if (!all && !validQuantity(Number(amount))) throw new Error('Enter a quantity of at least 0.01, in steps of 0.01.'); await post('/actions/stock-return', { stockId: line.id, siteId: target, ...(all ? { all: true } : { quantity: Number(amount) }), date, note }); return 'Material returned to the inventory.'; }}>{errors => <>
    {!siteId && <Choice label="Project site" required value={target} onChange={setTarget} options={sitesOf(allRows)} error={errors.siteId} hint="The workspace shows every project site: choose whose inventory receives the material."/>}
    <QuantityInput label="Quantity to return" value={amount} onChange={setAmount} max={Number(line.quantity)} disabled={all} error={errors.quantity}/>
    <div className="field checkbox-field"><label><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)}/><span>Return all ({formatNumber(line.quantity, 3)} {details.uom})</span></label></div>
    <Control label="Date" required>{(_, props) => <input {...props} type="date" value={date} onChange={event => setDate(event.target.value)}/>}</Control>
    <Text label="Notes" area value={note} onChange={setNote} max={2000}/></>}</ActionDialog>;
}

/** Correction (reference #correctLagerEntry): remove a quantity from a storehouse line, with a reason. */
function CorrectionDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const balance = Number(line.quantity);
  return <ActionDialog title="Correction" subtitle={`Material: ${details.materialNo} · Storehouse: ${storehouseName(rows, line)} · Available: ${formatNumber(balance, 3)} ${details.uom}`} submit="Apply correction" onClose={onClose}
    onSubmit={async () => { if (Number(amount) > balance) throw new Error(`Quantity exceeds available balance (${balance}).`); await post('/actions/stock-correction', { stockId: line.id, quantity: Number(amount), reasonText: reason }); return 'Correction applied.'; }}>{errors => <>
    <QuantityInput label="Quantity to remove" value={amount} onChange={setAmount} max={balance} error={errors.quantity}/>
    <Text label="Reason" required max={500} value={reason} onChange={setReason} placeholder="Reason for correction" error={errors.reasonText}/></>}</ActionDialog>;
}

/** Edit storehouse item (reference #editLagerItem): the wording of one line; the Material No stays. */
function EditItemDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [values, setValues] = useState({ materialGroup: details.group, articleNo: details.articleNo, uom: details.uom, description: details.description, dia: details.dia, lbs: details.lbs, reason: CORRECTION_REASONS[0] as string, reasonText: '' });
  const set = (name: keyof typeof values) => (value: string) => setValues(current => ({ ...current, [name]: value }));
  const uoms = [...new Set([...activeRows(rows, 'uoms').map(row => String(row.name)), details.uom].filter(Boolean))];
  // The material number is also used by other records (orders, isometric materials, other storehouse lines): those keep their wording.
  const used = ['order_lines', 'iso_materials', 'picklists'].some(key => (rows[key] || []).some(row => !row._archived && materialIdentityOf(row) === materialIdentityOf(line))) || (rows.stock || []).some(row => !row._archived && row.id !== line.id && materialIdentityOf(row) === materialIdentityOf(line));
  return <ActionDialog title="Edit storehouse item" subtitle={`Material No: ${details.materialNo}. The material number stays unchanged; it is the key used by inventory, orders, certificates and transactions.`} submit="Save" onClose={onClose} wide
    onSubmit={async () => { if (values.reason === 'Other' && !values.reasonText.trim()) throw new Error('Explanation is required when the reason is Other.'); await post('/actions/stock-correct', { stockId: line.id, ...values }); return 'Storehouse item saved.'; }}>{errors => <>
    {used && <div className="alert warning full-width" role="status"><AlertCircle size={16}/><span>This material number is already used elsewhere. Those records keep their original names. Only this storehouse line is corrected.</span></div>}
    <Text label="Material group" max={100} value={values.materialGroup} onChange={set('materialGroup')} error={errors.materialGroup}/>
    <Text label="Article No" max={100} value={values.articleNo} onChange={set('articleNo')} error={errors.articleNo}/>
    <Choice label="UOM" value={values.uom} blank="—" onChange={set('uom')} options={uoms.map(name => ({ value: name, label: name }))} error={errors.uom}/>
    <Text label="Description" max={2000} value={values.description} onChange={set('description')} error={errors.description}/>
    <Text label="DIA" max={20} value={values.dia} onChange={set('dia')} error={errors.dia}/>
    <Text label="LBS/SCH" max={20} value={values.lbs} onChange={set('lbs')} error={errors.lbs}/>
    <Choice label="Reason" required noBlank value={values.reason} onChange={set('reason')} options={CORRECTION_REASONS.map(reason => ({ value: reason, label: reason }))} error={errors.reason}/>
    <Text label="Explanation" max={500} required={values.reason === 'Other'} value={values.reasonText} onChange={set('reasonText')} error={errors.reasonText}/></>}</ActionDialog>;
}
const materialIdentityOf = (row: Row) => row.materialId ? `catalog:${row.materialId}` : row.customMaterialId ? `custom:${row.customMaterialId}` : `row:${row.id}`;

/** Adjust quantity (reference #adjustLagerQuantity): the new quantity may not go below what open transfer orders hold. */
function AdjustDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const reserved = reservedOnOpenOrders(rows, line);
  const [amount, setAmount] = useState(String(line.quantity)), [reason, setReason] = useState(ADJUST_REASONS[0] as string), [explanation, setExplanation] = useState('');
  return <ActionDialog title="Adjust quantity" subtitle={`Material No: ${details.materialNo} · Current quantity: ${formatNumber(line.quantity, 3)} ${details.uom}${reserved > 0 ? ` · Reserved on open orders: ${formatNumber(reserved, 3)}` : ''}`} submit="Save" onClose={onClose}
    onSubmit={async () => { if (Number(amount) < reserved) throw new Error(`The new quantity cannot be below ${reserved}, the quantity reserved on open orders.`); await post('/actions/stock-adjust', { stockId: line.id, quantity: Number(amount), reason, reasonText: explanation }); return 'Quantity adjusted.'; }}>{errors => <>
    <QuantityInput label="New quantity" min={reserved} value={amount} onChange={setAmount} error={errors.quantity}/>
    <Choice label="Reason" required noBlank value={reason} onChange={setReason} options={ADJUST_REASONS.map(value => ({ value, label: value }))} error={errors.reason}/>
    <Text label="Explanation" max={500} value={explanation} onChange={setExplanation} error={errors.reasonText}/></>}</ActionDialog>;
}

/** Remove material (reference #removeLagerItem): the line leaves the storehouse; an open transfer order blocks it. */
function RemoveDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [reason, setReason] = useState(REMOVE_REASONS[0] as string), [explanation, setExplanation] = useState('');
  return <ActionDialog title="Remove material" subtitle={`Material No: ${details.materialNo}. The line leaves this storehouse; the material number, certificates and earlier movements stay in the history. An open transfer order blocks removal.`} submit="Remove material" onClose={onClose}
    onSubmit={async () => { await post('/actions/stock-remove', { stockId: line.id, reason, reasonText: explanation }); return 'Material removed from the storehouse.'; }}>{errors => <>
    <Choice label="Reason" required noBlank value={reason} onChange={setReason} options={REMOVE_REASONS.map(value => ({ value, label: value }))} error={errors.reason}/>
    <Text label="Explanation" max={500} value={explanation} onChange={setExplanation} error={errors.reasonText}/></>}</ActionDialog>;
}

/** Remove material from inventory (reference #removeMaterialFromInventory): Quantity and Comment. */
function InventoryRemoveDialog({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const [amount, setAmount] = useState(''), [comment, setComment] = useState('');
  return <ActionDialog title="Remove material from inventory" subtitle={`${row.details.materialNo} · ${formatNumber(row.quantity, 3)} ${row.details.uom} in the inventory`} submit="Remove"  onClose={onClose}
    onSubmit={async () => { if (!validQuantity(Number(amount)) || Number(amount) > row.quantity) throw new Error(`Enter a quantity from 0.01 to ${formatNumber(row.quantity, 3)}, in steps of 0.01.`); await post('/actions/inventory-remove', { siteId: row.siteId, ...(row.materialId ? { materialId: row.materialId } : { customMaterialId: row.customMaterialId }), quantity: Number(amount), comment, date: today() }); return 'Removed from the inventory.'; }}>{errors => <>
    <QuantityInput value={amount} onChange={setAmount} max={row.quantity} error={errors.quantity}/>
    <Text label="Comment" required max={500} value={comment} onChange={setComment} error={errors.comment}/></>}</ActionDialog>;
}

/** Add material (reference #addMaterialIso on the inventory): Material group, then a Material of that group, and the Quantity; no charge. */
function AddFromDatabase({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const { rows, label } = useWorkspace();
  const [group, setGroup] = useState(''), [materialId, setMaterial] = useState(''), [amount, setAmount] = useState('');
  const materials = activeRows(rows, 'materials'), groups = [...new Set(materials.map(row => String(row.materialGroup || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const inGroup = materials.filter(row => String(row.materialGroup || '') === group).sort((a, b) => String(a.materialNo).localeCompare(String(b.materialNo)));
  return <ActionDialog title="Add material" subtitle={`Put a catalog material into the inventory of ${label('sites', siteId)}.`} submit="Add" onClose={onClose}
    onSubmit={async () => { if (!validQuantity(Number(amount))) throw new Error('Enter a quantity of at least 0.01, in steps of 0.01.'); await post('/actions/stock-add', { siteId, materialId, quantity: Number(amount), date: today() }); return 'Material added to the inventory.'; }}>{errors => <>
    <Choice label="Material group" required value={group} onChange={value => { setGroup(value); setMaterial(''); }} blank="Choose group" options={groups.map(value => ({ value, label: value }))} hint={groups.length ? undefined : 'The database has no material groups yet.'}/>
    <Choice label="Material" required value={materialId} onChange={setMaterial} blank={group ? 'Choose material' : 'Choose a group first'} options={inGroup.map(row => ({ value: row.id, label: `${row.materialNo} · ${row.description}${row.dia ? ` · ${row.dia}` : ''}${row.lbs ? ` · ${row.lbs}` : ''}` }))} error={errors.materialId}/>
    <QuantityInput value={amount} onChange={setAmount} error={errors.quantity}/></>}</ActionDialog>;
}

/** Material log (reference showMaterialInventoryLog): Material No and Quantity above a table Date | Action | - | User | Quantity, oldest first. */
function LogDialog({ line, row, onClose }: { line?: Row; row?: InventoryRow; onClose: () => void }) {
  const { rows, label } = useWorkspace();
  const log: MaterialLogRow[] = row ? siteMaterialLog(rows, row.siteId, row.identity) : materialLogRows(rows, inventoryLog(rows, line!));
  const materialNo = row ? row.details.materialNo : stockDetails(rows, line!).materialNo, balance = row ? row.quantity : Number(line!.quantity);
  const where = row ? label('sites', row.siteId) : `${line!.chargeNo ? `${line!.chargeNo} · ` : ''}${label('warehouses', line!.warehouseId)}`;
  return <Modal title="Material log" subtitle={where} onClose={onClose} wide><div className="modal-body">
    <div className="log-heading"><strong>Material No: {materialNo}</strong><strong>Quantity: {formatNumber(balance, 2)}</strong></div>
    {!log.length ? <EmptyState title="No movements yet" description="Receipts, transfers, picks, corrections and removals are listed here."/> : <TableScroll><table className="data-table"><thead><tr><th>Date</th><th>Action</th><th>-</th><th>User</th><th className="numeric">Quantity</th></tr></thead><tbody>{log.map(entry => <tr key={entry.id}><td>{stamp(entry.date, entry.at)}</td><td>{entry.action}</td><td>{entry.reference}</td><td>{entry.user}</td><td className={`numeric ${entry.quantity < 0 ? 'log-out' : 'log-in'}`}>{signed(entry.quantity)}</td></tr>)}</tbody></table></TableScroll>}
  </div><div className="modal-footer"><button className="btn primary" onClick={onClose}>Close</button></div></Modal>;
}

/** Audit trail of one storehouse line (reference #showStorehouseAuditTrail). */
function AuditTrailDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const details = stockDetails(rows, line);
  const [events, setEvents] = useState<AuditEvent[] | null>(null), [error, setError] = useState('');
  useEffect(() => { let current = true; api<{ events: AuditEvent[] }>(`/history/stock/${line.id}`).then(result => { if (current) setEvents(result.events); }).catch(failure => { if (current) setError((failure as Error).message); }); return () => { current = false; }; }, [line.id]);
  return <Modal title="Audit trail" subtitle={`${details.materialNo}${line.chargeNo ? ` · ${line.chargeNo}` : ''} · ${storehouseName(rows, line)}`} onClose={onClose} wide><div className="modal-body">
    {error ? <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div> : !events ? <p role="status" className="muted loading-note"><Loader2 size={15} className="spin"/> Loading…</p>
      : !events.length ? <EmptyState title="No audit entries for this storehouse yet." description="Transfers, corrections, adjustments and removals of this line are listed here."/>
        : <TableScroll><table className="data-table"><thead><tr><th>Date</th><th>User</th><th>Action</th></tr></thead><tbody>{events.map(event => <tr key={event.id}><td>{stamp('', event.createdAt)}</td><td>{event.actorName}</td><td>{event.summary}</td></tr>)}</tbody></table></TableScroll>}
  </div><div className="modal-footer"><button className="btn primary" onClick={onClose}>Close</button></div></Modal>;
}

/** Certificates of one stock row (reference #viewLagerCerts): Charge No, Index, Type, File. */
function CertificatesDialog({ certificates, title, onClose }: { certificates: Row[]; title: string; onClose: () => void }) {
  const { rows } = useWorkspace();
  return <Modal title={`Certificates - ${title}`} onClose={onClose} wide><div className="modal-body">
    {!certificates.length ? <p className="muted">No certificates found for this material in this storehouse.</p> : <TableScroll><table className="data-table"><thead><tr><th>Charge No</th><th>Index</th><th>Type</th><th>File</th></tr></thead><tbody>{certificates.map(cert => { const file = certificateFile(rows, cert.id); return <tr key={cert.id}><td><strong>{String(cert.chargeNo || '-')}</strong></td><td>{String(cert.indexNo || '-')}</td><td>{String(cert.certType || '-')}</td><td>{file ? <a className="btn small" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer"><FileText size={14}/>Open</a> : '-'}</td></tr>; })}</tbody></table></TableScroll>}
  </div><div className="modal-footer"><button className="btn primary" onClick={onClose}>Close</button></div></Modal>;
}

/** One item of a New Transfer Order: a prefilled item keeps its balance as the maximum and carries the certificates of its material (all ticked). */
interface ItemDraft { materialNo: string; description: string; quantity: string; uom: string; stockId: string; locked: boolean; balance: number | undefined; certs: Row[]; ticked: string[] }
const blankItem = (): ItemDraft => ({ materialNo: '', description: '', quantity: '', uom: '', stockId: '', locked: false, balance: undefined, certs: [], ticked: [] });
/**
 * New Transfer Order. Opened from inventory rows (context inventory: items prefilled with the full balance, the source is
 * the project site's inventory), from storehouse lines (context store: each item carries its own line) or on the
 * Transfer orders page. The types offered and the location fields follow the context and the type exactly as the reference
 * handler (transferTypesFor, transferOrderFields); every prefilled quantity is capped at its balance.
 */
function OrderDialog({ context, inventory = [], lines = [], siteId, onClose }: { context: TransferContext; inventory?: InventoryRow[]; lines?: Row[]; siteId: string; onClose: () => void }) {
  const { rows, allRows, label } = useWorkspace();
  const [type, setType] = useState<string>(defaultTransferType(context)), [priority, setPriority] = useState('Normal');
  const [from, setFrom] = useState(''), [toSite, setToSite] = useState(''), [to, setTo] = useState(''), [notes, setNotes] = useState(''), [site, setSite] = useState(siteId);
  const [items, setItems] = useState<ItemDraft[]>(() => { const prefilled = prefilledOrderItems(rows, context, inventory, lines).map(item => ({ materialNo: item.materialNo, description: item.description, quantity: String(item.quantity), uom: item.uom, stockId: item.stockId, locked: true, balance: item.balance as number | undefined, certs: item.certificates, ticked: item.certificates.map(cert => cert.id) })); return prefilled.length ? prefilled : [blankItem()]; });
  const route = transferRoute(type);
  const carried = items.every(item => item.stockId);
  const show = transferOrderFields(type, context, carried);
  const needsSite = route?.from === 'inventory' || route?.to === 'inventory';
  const update = (index: number, patch: Partial<ItemDraft>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const warehouses = warehousesOf(rows).map(w => ({ value: w.id, label: String(w.name) }));
  return <ActionDialog title="New Transfer Order" subtitle="Plan the move now; nothing moves until the order is completed." submit="New Transfer Order" onClose={onClose} wide
    onSubmit={async () => {
      if (!route) throw new Error('Choose the type of transfer order.');
      if (needsSite && !site) throw new Error('Choose the project site whose inventory the order uses.');
      const bad = items.findIndex(item => !item.materialNo.trim() || !validQuantity(Number(item.quantity)));
      if (bad >= 0) throw new Error(`Item ${bad + 1} needs a material number and a quantity of at least 0.01, in steps of 0.01.`);
      if (items.some(item => item.balance !== undefined && Number(item.quantity) > item.balance)) throw new Error('Quantity exceeds available balance');
      await post('/actions/transfer-order-create', { type, priority, fromWarehouseId: show.fromStorehouse ? from : '', fromSiteId: route.from === 'inventory' ? site : '', siteId: show.toSite ? toSite : route.to === 'inventory' ? site : '', toWarehouseId: show.toStorehouse ? to : '', notes, date: today(),
        items: items.map(item => ({ materialNo: item.materialNo, description: item.description, quantity: Number(item.quantity), uom: item.uom, ...(item.certs.length ? { certIds: item.ticked } : {}), ...(item.stockId && route.from === 'storehouse' ? { stockId: item.stockId } : {}) })) });
      return 'Transfer order created.';
    }}>{errors => <>
    <Choice label="Type" required noBlank value={type} onChange={value => setType(value || defaultTransferType(context))} options={transferTypesFor(context).map(value => ({ value, label: value }))} error={errors.type}/>
    <Choice label="Priority" noBlank value={priority} onChange={setPriority} options={TRANSFER_PRIORITIES.map(value => ({ value, label: value }))} error={errors.priority}/>
    {needsSite && !siteId && <Choice label={route?.from === 'inventory' ? 'From project site' : 'Project site'} required value={site} onChange={setSite} options={sitesOf(allRows)} error={errors.fromSiteId || errors.siteId} hint="The workspace shows every project site: choose whose inventory the order uses."/>}
    {needsSite && siteId && <p className="field full-width muted">{route?.from === 'inventory' ? 'From' : 'Into'} the inventory of {label('sites', siteId)}.</p>}
    {show.fromStorehouse && <Choice label="From storehouse" required value={from} onChange={setFrom} blank="- Select -" options={warehouses} error={errors.fromWarehouseId}/>}
    {show.toSite && <Choice label="To project site" required value={toSite} onChange={setToSite} blank="- Select -" options={sitesOf(allRows).filter(option => route?.from !== 'inventory' || option.value !== site)} error={errors.siteId}/>}
    {show.toStorehouse && <Choice label="To storehouse" required value={to} onChange={setTo} blank="- Select -" options={warehouses.filter(w => w.value !== from)} error={errors.toWarehouseId}/>}
    <Text label="Notes (optional)" area value={notes} onChange={setNotes} max={2000} placeholder="Notes & actions"/>
    <div className="field full-width"><span className="field-title">Order items</span><ul className="order-items">{items.map((item, index) => <li key={index}>
      <Control label={`Material No (item ${index + 1})`} required>{(_, props) => <input {...props} type="text" maxLength={100} autoComplete="off" readOnly={item.locked} value={item.materialNo} onChange={event => update(index, { materialNo: event.target.value })}/>}</Control>
      <Text label={`Description (item ${index + 1})`} max={2000} value={item.description} onChange={value => update(index, { description: value })}/>
      <QuantityInput label={`Qty (item ${index + 1})`} value={item.quantity} max={item.balance} onChange={value => update(index, { quantity: value })}/>
      <Text label={`UOM (item ${index + 1})`} max={20} value={item.uom} onChange={value => update(index, { uom: value })}/>
      <button type="button" className="icon-btn" aria-label={`Remove item ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}><Trash2 size={16}/></button>
      {item.certs.length > 0 && <fieldset className="item-certs"><legend className="field-title">Certificates:</legend>{item.certs.map(cert => <label key={cert.id} className="checkbox-field"><input type="checkbox" checked={item.ticked.includes(cert.id)} onChange={event => update(index, { ticked: event.target.checked ? [...item.ticked, cert.id] : item.ticked.filter(id => id !== cert.id) })}/><span><strong>{String(cert.chargeNo || cert.name)}</strong>{cert.indexNo ? ` #${cert.indexNo}` : ''}</span></label>)}</fieldset>}</li>)}</ul>
      <button type="button" className="btn subtle small" onClick={() => setItems(current => [...current, blankItem()])}><Plus size={15}/>Add item</button></div></>}</ActionDialog>;
}

type InventoryDialog = { kind: 'log' | 'remove'; row: InventoryRow } | { kind: 'order'; rows: InventoryRow[] } | { kind: 'add' } | null;

/** Material inventory: the project site's own inventory, one row per Material No (reference "Materials in inventory"). */
export function MaterialInventory() {
  const { rows, canRecord, canRun, canReadReport, label } = useWorkspace();
  const place = useInventorySite();
  const [onlyWithQuantity, setOnly] = useState(true), [query, setQuery] = useState(''), [checked, setChecked] = useState<string[]>([]), [dialog, setDialog] = useState<InventoryDialog>(null);
  const list = useMemo(() => place.siteId ? inventoryRows(rows, { siteId: place.siteId, onlyWithQuantity, query }) : [], [rows, place.siteId, onlyWithQuantity, query]);
  if (!canRecord('stock')) return <EmptyState title="No access to the material inventory" description="Your permission profile does not include the material inventory."/>;
  const selected = list.filter(entry => checked.includes(entry.key));
  const close = () => { setDialog(null); setChecked([]); };
  return <div className="page mto-stock-page"><div className="page-heading"><div><div className="eyebrow">MATERIALS · ORDER / TAKE IN</div><h1>Material inventory</h1><p>{place.siteId ? `What ${label('sites', place.siteId)} holds: take-ins and transfers in, picks and transfers out.` : 'Choose a project site.'}</p></div>
    <div className="heading-actions">
      {canRun('transfer-order-create') && <button className="btn primary" disabled={!place.siteId} onClick={() => setDialog({ kind: 'order', rows: selected })}><ArrowRightLeft size={16}/>New Transfer Order ({selected.length})</button>}
      {canRun('stock-add') && place.siteId && <Dropdown label="Add" className="add-menu" trigger={<span className="btn">Add<ChevronDown size={14}/></span>}><button type="button" onClick={() => setDialog({ kind: 'add' })}><PackagePlus size={15}/>Add material from DB</button></Dropdown>}
    </div></div>
    {!place.sites.length ? <EmptyState title="No project sites yet" description="Add a project site first; each site keeps its own Material inventory."/> : <section className="panel">
      <div className="panel-title-row"><h2>Materials in inventory</h2></div>
      <div className="inventory-filters">{!place.fixed && <Choice label="Project site" value={place.siteId} onChange={value => { place.choose(value); setChecked([]); }} options={place.sites} blank="Choose a project site"/>}
        <Control label="Show">{(_, props) => <div className="select-wrap"><select {...props} value={onlyWithQuantity ? 'qty' : 'all'} onChange={event => { setOnly(event.target.value === 'qty'); setChecked([]); }}><option value="qty">Only with quantity</option><option value="all">All materials</option></select><ChevronDown size={14}/></div>}</Control>
        <SearchInput value={query} onChange={value => { setQuery(value); setChecked([]); }} placeholder="Search material or description…"/><TableExportButtons table="material-inventory" name="material-inventory" header={INVENTORY_EXPORT_COLUMNS} lines={list.map(entry => [entry.details.group, entry.details.articleNo, entry.details.materialNo, entry.details.dia, entry.details.lbs, entry.details.description, entry.quantity, entry.details.uom])}/></div>
      {selected.length > 0 && <div className="selection-bar"><strong>{selected.length} selected</strong><button className="clear-selection" onClick={() => setChecked([])}><X size={14}/>Clear selection</button></div>}
      {list.length ? <TableScroll><table className="data-table inventory-table"><thead><tr><th>Material group</th><th>Article No</th><th>Material No</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th className="numeric">Quantity</th><th>UOM</th><th>Options</th><th className="select-cell"><input type="checkbox" aria-label="Check all materials" checked={list.every(entry => checked.includes(entry.key))} onChange={event => setChecked(event.target.checked ? list.map(entry => entry.key) : [])}/></th></tr></thead>
        <tbody>{list.map(entry => <tr key={entry.key}>
          <td>{entry.details.group || '—'}</td><td>{entry.details.articleNo || '—'}</td><td><strong>{entry.details.materialNo}</strong></td><td>{entry.details.dia || '—'}</td><td>{entry.details.lbs || '—'}</td><td>{entry.details.description || '—'}</td><td className="numeric">{formatNumber(entry.quantity, 3)}</td><td>{entry.details.uom || '—'}</td>
          <td><span className="row-buttons"><button type="button" className="icon-btn" aria-label={`Material log of ${entry.details.materialNo}`} title={INVENTORY_ROW_OPTIONS.log} onClick={() => setDialog({ kind: 'log', row: entry })}><History size={16}/></button>
            {canReadReport('pdf-material-label', 'export') && <a className="icon-btn" aria-label={`Print QR label of ${entry.details.materialNo}`} title={INVENTORY_ROW_OPTIONS.label} href={labelsHref([entry.details.materialNo])} target="_blank" rel="noreferrer"><QrCode size={16}/></a>}
            {canRun('transfer-order-create') && <button type="button" className="icon-btn" aria-label={`Request transfer of ${entry.details.materialNo} (Transfer Order)`} title={INVENTORY_ROW_OPTIONS.transfer} disabled={entry.quantity <= 0} onClick={() => setDialog({ kind: 'order', rows: [entry] })}><ArrowRightLeft size={16}/></button>}
            {canRun('inventory-remove') && <button type="button" className="icon-btn" aria-label={`Remove ${entry.details.materialNo} from inventory`} title={INVENTORY_ROW_OPTIONS.remove} disabled={entry.quantity <= 0} onClick={() => setDialog({ kind: 'remove', row: entry })}><Trash2 size={16}/></button>}</span></td>
          <td className="select-cell"><input type="checkbox" aria-label={`Check ${entry.details.materialNo}`} checked={checked.includes(entry.key)} onChange={event => setChecked(current => event.target.checked ? [...current, entry.key] : current.filter(id => id !== entry.key))}/></td></tr>)}</tbody></table></TableScroll>
        : <EmptyState title={onlyWithQuantity ? 'No material in the inventory' : 'No materials in this inventory'} description={query ? 'No material matches your search.' : 'Take in an order, add material from the database or transfer material from a storehouse to this project site.'}/>}
      <div className="table-footer"><span>{list.length} material{list.length === 1 ? '' : 's'}{place.siteId ? ` · ${label('sites', place.siteId)}` : ''}</span></div></section>}
    {dialog?.kind === 'log' && <LogDialog row={dialog.row} onClose={close}/>}{dialog?.kind === 'remove' && <InventoryRemoveDialog row={dialog.row} onClose={close}/>}
    {dialog?.kind === 'order' && <OrderDialog context="inventory" inventory={dialog.rows} siteId={place.siteId} onClose={close}/>}{dialog?.kind === 'add' && <AddFromDatabase siteId={place.siteId} onClose={close}/>}
  </div>;
}

type StoreDialog = { kind: 'log' | 'move' | 'return' | 'correction' | 'edit' | 'adjust' | 'remove' | 'audit' | 'certificates'; line: Row } | { kind: 'project' | 'order'; lines: Row[] } | null;

/**
 * Material search over storehouses and project site inventories (reference #datatableStorehouseSearch): Storehouse /
 * project site (several), Group, Dia, Sch and a description of at least 3 characters; Search / Clear; at most 200 rows,
 * zero balances hidden. The check boxes feed "Transfer selected" (storehouse lines) and "Print labels".
 */
function MaterialSearch({ onTransfer }: { onTransfer: (lines: Row[]) => void }) {
  const { allRows, canRun, canReadReport } = useWorkspace();
  const empty: SearchFilters = { locations: [], group: '', dia: '', schedule: '', text: '' };
  const [draft, setDraft] = useState<SearchFilters>(empty), [applied, setApplied] = useState<SearchFilters | null>(null), [checked, setChecked] = useState<string[]>([]), [certificates, setCertificates] = useState<{ title: string; certs: Row[] } | null>(null);
  const locations = useMemo(() => searchLocations(allRows), [allRows]);
  const result = useMemo(() => applied ? searchStock(allRows, applied) : { rows: [], state: 'need' as const }, [allRows, applied]);
  const set = (name: keyof SearchFilters) => (value: string) => setDraft(current => ({ ...current, [name]: value }));
  const picked = result.rows.filter(entry => checked.includes(entry.key));
  const lines = picked.filter(entry => entry.kind === 'storehouse').map(entry => entry.stock);
  const notice = !applied ? 'Choose a location or enter at least 3 characters, then click Search.' : result.state === 'need' ? 'Choose a location or enter at least 3 characters (a description is searched inside the chosen location).' : result.state === 'capped' ? `More than ${SEARCH_LIMIT} rows match. Only the first ${SEARCH_LIMIT} are shown: narrow the search.` : result.state === 'empty' ? 'No material matches this search.' : '';
  const search = (event: FormEvent) => { event.preventDefault(); setChecked([]); setApplied({ ...draft }); };
  return <section className="panel material-search" aria-label="Search material"><div className="panel-title-row"><h2>Search material</h2>
    <div className="heading-actions">
      {canRun('stock-to-project') && <button className="btn" disabled={!lines.length} onClick={() => onTransfer(lines)}><Truck size={16}/>Transfer selected ({lines.length})</button>}
      {canReadReport('pdf-material-label', 'export') && (picked.length ? <a className="btn" href={labelsHref(picked.map(entry => entry.details.materialNo))} target="_blank" rel="noreferrer"><QrCode size={16}/>Print labels ({picked.length})</a> : <button className="btn" disabled><QrCode size={16}/>Print labels (0)</button>)}
    </div></div>
    <form className="inventory-filters" onSubmit={search}>
      <Control label="Storehouse / project site">{(_, props) => <select {...props} multiple size={Math.min(4, Math.max(2, locations.length))} value={draft.locations} onChange={event => setDraft(current => ({ ...current, locations: [...event.target.selectedOptions].map(option => option.value) }))}>{locations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</Control>
      <Text label="Group" value={draft.group} onChange={set('group')} max={100}/><Text label="Dia" value={draft.dia} onChange={set('dia')} max={20}/><Text label="Sch" value={draft.schedule} onChange={set('schedule')} max={20}/>
      <Text label="Description" value={draft.text} onChange={set('text')} max={200} hint={draft.text.trim() && !searchHasTerm(draft.text) ? 'Enter at least 3 characters.' : undefined}/>
      <div className="field"><span className="field-title">&nbsp;</span><span className="row-buttons"><button className="btn primary"><Search size={16}/>Search</button><button type="button" className="btn" onClick={() => { setDraft(empty); setApplied(null); setChecked([]); }}>Clear</button></span></div></form>
    {notice && <p role="status" className="muted loading-note">{notice}</p>}
    {result.rows.length > 0 && <TableScroll><table className="data-table inventory-table"><thead><tr><th className="select-cell"><input type="checkbox" aria-label="Check all found material" checked={result.rows.every(entry => checked.includes(entry.key))} onChange={event => setChecked(event.target.checked ? result.rows.map(entry => entry.key) : [])}/></th><th>Storehouse / project site</th><th>Group</th><th>Article</th><th>Material No</th><th>Dia</th><th>Sch</th><th>Description</th><th className="numeric">Balance</th><th>UOM</th><th>Charge No</th><th>Certificates</th><th>Opts</th></tr></thead>
      <tbody>{result.rows.map(entry => <tr key={entry.key}><td className="select-cell"><input type="checkbox" aria-label={`Check ${entry.details.materialNo} in ${entry.place}`} checked={checked.includes(entry.key)} onChange={event => setChecked(current => event.target.checked ? [...current, entry.key] : current.filter(id => id !== entry.key))}/></td>
        <td>{entry.place}{entry.kind === 'site' && <small className="muted"> · inventory</small>}</td><td>{entry.details.group || '—'}</td><td>{entry.details.articleNo || '—'}</td><td><strong>{entry.details.materialNo}</strong></td><td>{entry.details.dia || '—'}</td><td>{entry.details.lbs || '—'}</td><td>{entry.details.description || '—'}</td><td className="numeric">{formatNumber(entry.stock.quantity, 3)}</td><td>{entry.details.uom || '—'}</td><td>{String(entry.stock.chargeNo || '—')}</td>
        <td>{entry.certificates ? <button type="button" className="btn small" onClick={() => setCertificates({ title: entry.details.materialNo, certs: lineCertificates(allRows, entry.stock) })}><FileText size={14}/>{entry.certificates}</button> : '—'}</td>
        <td>{canReadReport('pdf-material-label', 'export') && <a className="icon-btn" aria-label={`Print QR label of ${entry.details.materialNo}`} title="Print QR label" href={labelsHref([entry.details.materialNo])} target="_blank" rel="noreferrer"><QrCode size={16}/></a>}</td></tr>)}</tbody></table></TableScroll>}
    {result.rows.length > 0 && <div className="table-footer"><span>{result.rows.length} row{result.rows.length === 1 ? '' : 's'}</span></div>}
    {certificates && <CertificatesDialog title={certificates.title} certificates={certificates.certs} onClose={() => setCertificates(null)}/>}
  </section>;
}

/** Storehouse transactions (reference #datatableStorehouseTransactions): one row per operation with its report number, newest first, 20 per page. */
function StorehouseTransactions() {
  const { allRows } = useWorkspace();
  const [page, setPage] = useState(0), [detail, setDetail] = useState<Transaction | null>(null);
  const list = useMemo(() => storehouseTransactions(allRows), [allRows]);
  const pages = Math.max(1, Math.ceil(list.length / 20)), shown = list.slice(page * 20, page * 20 + 20);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);
  return <section className="panel storehouse-transactions" aria-label="Storehouse transactions"><div className="panel-title-row"><h2>Transactions</h2></div>
    {list.length ? <TableScroll><table className="data-table"><thead><tr><th>Date</th><th>Report No</th><th>Type</th><th>From</th><th>To</th><th>User</th><th className="numeric">Items</th><th>Opts</th></tr></thead>
      <tbody>{shown.map(entry => <tr key={entry.key}><td>{stamp(entry.date, entry.at)}</td><td>{entry.reportNo || '—'}</td><td>{entry.type}</td><td>{entry.from}</td><td>{entry.to}</td><td>{entry.user}</td><td className="numeric">{entry.items}</td><td><button type="button" className="icon-btn" aria-label={`Items of transaction ${entry.reportNo || entry.date}`} title="Items" onClick={() => setDetail(entry)}><History size={16}/></button></td></tr>)}</tbody></table></TableScroll>
      : <EmptyState title="No transactions yet" description="Transfers, moves, returns, corrections and removals of storehouse material are listed here with their report number."/>}
    <div className="table-footer"><span>{list.length} transaction{list.length === 1 ? '' : 's'}</span>{pages > 1 && <span className="row-buttons"><button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></span>}</div>
    {detail && <Modal title={`Transaction ${detail.reportNo || ''}`.trim()} subtitle={`${detail.type} · ${detail.from} → ${detail.to}`} onClose={() => setDetail(null)} wide><div className="modal-body"><TableScroll><table className="data-table"><thead><tr><th>Material No</th><th>Charge No</th><th>Action</th><th className="numeric">Quantity</th></tr></thead><tbody>{materialLogRows(allRows, detail.moves).map((entry, index) => { const move = detail.moves.find(item => item.id === entry.id)!; return <tr key={index}><td>{stockDetails(allRows, move).materialNo || '—'}</td><td>{String(move.chargeNo || '—')}</td><td>{entry.action}</td><td className={`numeric ${entry.quantity < 0 ? 'log-out' : 'log-in'}`}>{signed(entry.quantity)}</td></tr>; })}</tbody></table></TableScroll></div><div className="modal-footer"><button className="btn primary" onClick={() => setDetail(null)}>Close</button></div></Modal>}
  </section>;
}

/** Storehouses: the company's storehouses (shared by every project site), a material search, their lines with the storehouse dialogs and the transactions. */
export function Storehouses() {
  const { rows, canRecord, canRun, canReadReport, siteId } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const warehouses = warehousesOf(rows);
  const requested = params.get('storehouse') || '';
  const warehouseId = warehouses.some(w => w.id === requested) ? requested : '';
  const [onlyWithQuantity, setOnly] = useState(true), [query, setQuery] = useState(''), [checked, setChecked] = useState<string[]>([]), [dialog, setDialog] = useState<StoreDialog>(null);
  const list = useMemo(() => storehouseRows(rows, { warehouseId: warehouseId || undefined, onlyWithQuantity, query }), [rows, warehouseId, onlyWithQuantity, query]);
  const selected = list.filter(entry => checked.includes(entry.stock.id)).map(entry => entry.stock);
  const close = () => { setDialog(null); setChecked([]); };
  const lineAction = (kind: 'log' | 'move' | 'return' | 'correction' | 'edit' | 'adjust' | 'remove' | 'audit' | 'certificates', line: Row) => setDialog({ kind, line });
  const labels = canReadReport('pdf-material-label', 'export');
  return <><TablePage resourceKey="warehouses"/>{canRecord('stock') && warehouses.length > 0 && <div className="mto-stock-page storehouse-sections">
    <MaterialSearch onTransfer={lines => setDialog({ kind: 'project', lines })}/>
    <section className="panel storehouse-lines" aria-label="Storehouse lines">
    <div className="page-heading"><div><h2>Storehouse lines</h2><p>Material held in the storehouses. Transfer it to a project site's inventory, move it, or correct a line.</p></div>
      <div className="heading-actions">
        {/* Mount point of the Transfer Orders button (wave 4, w4-transfer-orders). */}
        <span data-mount="transfer-orders-button"/>
        {canRun('stock-to-project') && <button className="btn" disabled={!selected.length} onClick={() => setDialog({ kind: 'project', lines: selected })}><Truck size={16}/>Transfer to project ({selected.length})</button>}
        {canRun('transfer-order-create') && <button className="btn primary" disabled={!selected.length} onClick={() => setDialog({ kind: 'order', lines: selected })}>New Transfer Order ({selected.length})</button>}
        {labels && (selected.length ? <a className="btn" href={labelsHref(selected.map(line => stockDetails(rows, line).materialNo))} target="_blank" rel="noreferrer"><QrCode size={16}/>Print labels ({selected.length})</a> : <button className="btn" disabled><QrCode size={16}/>Print labels (0)</button>)}
      </div></div>
    <div className="inventory-filters"><Choice label="Storehouse" value={warehouseId} onChange={value => { setParams(value ? { storehouse: value } : {}); setChecked([]); }} options={warehouses.map(w => ({ value: w.id, label: String(w.name) }))} blank="All storehouses"/>
      <Control label="Show">{(_, props) => <div className="select-wrap"><select {...props} value={onlyWithQuantity ? 'qty' : 'all'} onChange={event => { setOnly(event.target.value === 'qty'); setChecked([]); }}><option value="qty">Only with quantity</option><option value="all">All lines</option></select><ChevronDown size={14}/></div>}</Control>
      <SearchInput value={query} onChange={value => { setQuery(value); setChecked([]); }} placeholder="Search material, description or charge…"/></div>
    {selected.length > 0 && <div className="selection-bar"><strong>{selected.length} selected</strong><button className="clear-selection" onClick={() => setChecked([])}><X size={14}/>Clear selection</button></div>}
    {list.length ? <TableScroll><table className="data-table inventory-table"><thead><tr><th className="select-cell"><input type="checkbox" aria-label="Check all storehouse lines" checked={list.every(entry => checked.includes(entry.stock.id))} onChange={event => setChecked(event.target.checked ? list.map(entry => entry.stock.id) : [])}/></th><th>Storehouse</th><th>Material group</th><th>Material No</th><th>Charge No</th><th>Description</th><th className="numeric">Quantity</th><th>UOM</th><th>Options</th></tr></thead>
      <tbody>{list.map(({ stock, details }) => <tr key={stock.id}><td className="select-cell"><input type="checkbox" aria-label={`Check ${describeLine(rows, stock)}`} checked={checked.includes(stock.id)} onChange={event => setChecked(current => event.target.checked ? [...current, stock.id] : current.filter(id => id !== stock.id))}/></td>
        <td>{storehouseName(rows, stock)}</td><td>{details.group || '—'}</td><td><strong>{details.materialNo}</strong>{stock.corrected === true && <Badge color="amber">Corrected</Badge>}</td><td>{String(stock.chargeNo || '—')}</td><td>{details.description || '—'}</td><td className="numeric">{formatNumber(stock.quantity, 3)}</td><td>{details.uom || '—'}</td>
        <td><Dropdown label={`Options for ${details.materialNo}`} trigger={<span className="icon-btn"><MoreHorizontal size={17}/></span>}>
          <button type="button" onClick={() => lineAction('log', stock)}><History size={15}/>Material log</button>
          {canRun('stock-to-project') && <button type="button" disabled={Number(stock.quantity) <= 0} onClick={() => setDialog({ kind: 'project', lines: [stock] })}><Truck size={15}/>Transfer to project</button>}
          {canRun('stock-move') && <button type="button" disabled={Number(stock.quantity) <= 0 || warehouses.length < 2} onClick={() => lineAction('move', stock)}><ArrowRightLeft size={15}/>Move to other storehouse</button>}
          {canRun('stock-return') && <button type="button" disabled={Number(stock.quantity) <= 0} onClick={() => lineAction('return', stock)}><RotateCcw size={15}/>Return to inventory</button>}
          {canRun('stock-correction') && <button type="button" disabled={Number(stock.quantity) <= 0} onClick={() => lineAction('correction', stock)}><RefreshCw size={15}/>Correction</button>}
          {canRun('stock-correct') && <button type="button" onClick={() => lineAction('edit', stock)}><Pencil size={15}/>Edit storehouse item</button>}
          {canRun('stock-adjust') && <button type="button" onClick={() => lineAction('adjust', stock)}><RefreshCw size={15}/>Adjust quantity</button>}
          {canRun('stock-remove') && <button type="button" onClick={() => lineAction('remove', stock)}><Trash2 size={15}/>Remove material</button>}
          <button type="button" onClick={() => lineAction('audit', stock)}><History size={15}/>Audit trail</button>
          <button type="button" onClick={() => lineAction('certificates', stock)}><FileText size={15}/>View certificates</button>
          {labels && <a href={labelsHref([details.materialNo])} target="_blank" rel="noreferrer"><QrCode size={15}/>Print QR label</a>}
        </Dropdown></td></tr>)}</tbody></table></TableScroll> : <EmptyState title={onlyWithQuantity ? 'No material in the storehouses' : 'No storehouse lines'} description={query ? 'No storehouse line matches your search.' : 'Storehouse lines arrive through transfer orders from a project site’s inventory.'}/>}
    <div className="table-footer"><span>{list.length} storehouse line{list.length === 1 ? '' : 's'}</span></div></section>
    <StorehouseTransactions/>
  </div>}
    {dialog?.kind === 'log' && <LogDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'move' && <MoveDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'return' && <ReturnDialog line={dialog.line} siteId={siteId} onClose={close}/>}
    {dialog?.kind === 'correction' && <CorrectionDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'edit' && <EditItemDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'adjust' && <AdjustDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'remove' && <RemoveDialog line={dialog.line} onClose={close}/>}
    {dialog?.kind === 'audit' && <AuditTrailDialog line={dialog.line} onClose={close}/>}{dialog?.kind === 'certificates' && <CertificatesDialog title={describeLine(rows, dialog.line)} certificates={lineCertificates(rows, dialog.line)} onClose={close}/>}
    {dialog?.kind === 'project' && <TransferToProject lines={dialog.lines} defaultSite={siteId} onClose={close}/>}{dialog?.kind === 'order' && <OrderDialog context="store" lines={dialog.lines} siteId={siteId} onClose={close}/>}
  </>;
}

/** Transfer orders: planned moves, completed or cancelled here. */
export function TransferOrders() {
  const { rows, label, canRecord, canRun, siteId } = useWorkspace();
  const [status, setStatus] = useState('Open'), [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'items' | 'complete' | 'cancel'; order: Row } | null>(null);
  if (!canRecord('transfer_orders')) return <EmptyState title="No access to transfer orders" description="Your permission profile does not include the material inventory."/>;
  const orders = activeRows(rows, 'transfer_orders').filter(order => !status || order.status === status).sort((a, b) => String(b.number).localeCompare(String(a.number)));
  const items = (order: Row) => activeRows(rows, 'transfer_order_items').filter(item => item.orderId === order.id);
  const destination = (order: Row) => { const route = transferRoute(String(order.type)); return route?.to === 'storehouse' ? label('warehouses', order.toWarehouseId) : order.siteId ? `Inventory · ${label('sites', order.siteId)}` : '—'; };
  const origin = (order: Row) => { const route = transferRoute(String(order.type)); return route?.from === 'inventory' ? (order.fromSiteId ? `Inventory · ${label('sites', order.fromSiteId)}` : '—') : order.fromWarehouseId ? label('warehouses', order.fromWarehouseId) : 'Storehouse of each item'; };
  return <div className="page mto-stock-page"><div className="page-heading"><div><div className="eyebrow">MATERIALS · ORDER / TAKE IN</div><h1>Transfer orders</h1><p>Plan moves between project site inventories and storehouses, then complete them to apply the movements.</p></div>
    <div className="heading-actions">{canRun('transfer-order-create') && <button className="btn primary" onClick={() => setDialog({ kind: 'new' })}><Plus size={16}/>New transfer order</button>}</div></div>
    <section className="panel"><div className="inventory-filters"><Choice label="Status" value={status} onChange={setStatus} blank="All statuses" options={['Open', 'Completed', 'Cancelled'].map(value => ({ value, label: value }))}/></div>
      {orders.length ? <TableScroll><table className="data-table"><thead><tr><th>Transfer order</th><th>Type</th><th>Priority</th><th>Status</th><th>From</th><th>To</th><th>Date</th><th className="numeric">Items</th><th>Options</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}>
        <td><button className="record-link" onClick={() => setDialog({ kind: 'items', order })}>{String(order.number)}</button></td><td>{String(order.type)}</td><td><Badge color={order.priority === 'Urgent' ? 'red' : undefined}>{String(order.priority)}</Badge></td><td><Badge>{String(order.status)}</Badge></td><td>{origin(order)}</td><td>{destination(order)}</td><td>{formatDate(order.date)}</td><td className="numeric">{items(order).length}</td>
        <td>{order.status === 'Open' ? <span className="row-buttons">{canRun('transfer-order-complete') && <button className="btn small primary" onClick={() => setDialog({ kind: 'complete', order })}>Complete</button>}{canRun('transfer-order-cancel') && <button className="btn small" onClick={() => setDialog({ kind: 'cancel', order })}>Cancel</button>}</span> : <span className="muted">—</span>}</td></tr>)}</tbody></table></TableScroll>
        : <EmptyState title={status ? `No ${status.toLowerCase()} transfer orders` : 'No transfer orders yet'} description="Check materials in the Material inventory or lines on the Storehouses page and choose New Transfer Order, or create an order here."/>}
      <div className="table-footer"><span>{orders.length} transfer order{orders.length === 1 ? '' : 's'}</span></div></section>
    {dialog?.kind === 'new' && <OrderDialog context="page" siteId={siteId} onClose={() => setDialog(null)}/>}
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
  const [projectId, setProject] = useState(''), [ordered, setOrdered] = useState(''), [query, setQuery] = useState(''), [reload, setReload] = useState(0);
  const [data, setData] = useState<ListData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const scope = new URLSearchParams({ ...(siteId ? { siteId } : {}), ...(projectId ? { projectId } : {}), ...(ordered ? { ordered } : {}) }).toString();
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
    <section className="panel"><div className="inventory-filters"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => setProject(String(value))}/><Choice label="Ordered" value={ordered} onChange={setOrdered} blank="------" options={['No', 'Yes'].map(value => ({ value, label: value }))}/><SearchInput value={query} onChange={setQuery} placeholder="Filter by material, description or iso…"/></div>
      {error ? <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="btn small" onClick={() => setReload(value => value + 1)}>Try again</button></div>
        : loading && !data ? <p role="status" className="muted loading-note"><Loader2 size={15} className="spin"/> Loading the materials list…</p>
        : shown.length ? <TableScroll><table className="data-table materials-list-table" aria-busy={loading}><thead><tr>{MATERIALS_LIST_COLUMNS.map(column => <th key={column.key} className={column.type === 'number' ? 'numeric' : undefined}>{column.label}</th>)}</tr></thead><tbody>{shown.map(row => <tr key={row.id}>{MATERIALS_LIST_COLUMNS.map(column => <td key={column.key} className={column.type === 'number' ? 'numeric' : undefined}>{column.type === 'number' ? formatNumber(row.values[column.key], 3) : column.key === 'ordered' ? <Badge>{String(row.values.ordered)}</Badge> : String(row.values[column.key] || '—')}</td>)}</tr>)}</tbody></table></TableScroll>
        : <EmptyState title="No materials to list" description={query || projectId || ordered ? 'No material matches your filters.' : 'Add materials to an isometric of this main project to see them here.'}/>}
      <div className="table-footer"><span>{shown.length} line{shown.length === 1 ? '' : 's'}{data ? ` · computed ${new Date(data.generatedAt).toLocaleTimeString('en-GB')}` : ''}</span><span>Inv. counts the project site’s Material inventory, less what pick lists claim.</span></div></section></div>;
}
