import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowUpDown, ChevronDown, Download, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Row } from '../shared/types.ts';
import { materialRecord } from '../shared/materials.ts';
import { PROGRESS_CLASSES, isoMaterialInputErrors, materialLineStatuses, materialStatus } from '../shared/mto-materials.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { ApiError, api, apiUrl, formatNumber, post } from './api.ts';
import { DEFAULT_UOM, MASS_EDIT_BLANK, MASS_EDIT_FIELDS, MASS_EDIT_HELP, MATERIAL_DEFAULT_SORT, MATERIAL_FORM_FIELDS, MATERIAL_IMPORT_PATH, MATERIAL_PAGE_SIZE, MATERIAL_PAGE_SIZES, catalogOrder, massEditChanges, massEditRefusal, materialTypeLabel, phasesById, phasesByName, showingEntries, sortMaterials, uomByName } from '../shared/material-db.ts';
import { Badge, Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll, FormError, selectPrompt } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';
import { MaterialQuantityLogDialog } from './material-quantity-log.tsx';
import { MtoPrintButton } from './pdf-mto-print.tsx';

const text = (value: unknown) => String(value ?? '');
const byText = (a: unknown, b: unknown) => text(a).localeCompare(text(b), 'en', { numeric: true });

// ----- Material database (MTO Pilot) ----------------------------------------------------------------------------------

/** Column headings of the reference list where they are shorter than the form labels (the Add material form keeps those). */
const MATERIAL_HEADINGS: Record<string, string> = { componentCode: 'CC', materialGroup: 'Group', description: 'Description' };

/**
 * The Material database page of the pilots profile: reference columns (each sortable, UOM ascending to start with), a
 * search box under every column heading, "Show entries", Mass edit for the checked rows, Import material, Add material
 * and Delete. Other profiles keep the generic table page.
 */
export function MaterialDatabase() {
  const { rows, canRecord } = useWorkspace();
  const def = RESOURCE_MAP.materials;
  const [search, setSearch] = useState<Record<string, string>>({}), [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0), [size, setSize] = useState(MATERIAL_PAGE_SIZE);
  const [sort, setSort] = useState(MATERIAL_DEFAULT_SORT);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [bulk, setBulk] = useState(false), [deleting, setDeleting] = useState<Row | null>(null);
  const columns = def.columns.map(key => def.fields.find(field => field.name === key)!).filter(Boolean).map(field => ({ ...field, label: MATERIAL_HEADINGS[field.name] || field.label }));
  const all = activeRows(rows, 'materials');
  const filtered = useMemo(() => sortMaterials(all.filter(row => columns.every(column => { const query = (search[column.name] || '').trim().toLowerCase(); return !query || text(row[column.name]).toLowerCase().includes(query); })), sort.column, sort.direction), [all, columns, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages - 1), shown = filtered.slice(current * size, (current + 1) * size);
  const checked = all.filter(row => selected.includes(row.id));
  const filterCount = Object.values(search).filter(value => value.trim()).length;
  if (!canRecord('materials')) return <EmptyState title="This area is restricted" description="Your profile does not include the Material database."/>;
  const canEdit = canRecord('materials', 'edit'), canAdd = canRecord('materials', 'insert'), canImport = canAdd && canRecord('materials', 'import');
  const toggleSort = (column: string) => { setSort(old => ({ column, direction: old.column === column && old.direction === 'asc' ? 'desc' : 'asc' })); setPage(0); };
  return <div className="page records-page mto-page">
    <div className="page-heading"><div><div className="eyebrow">MATERIALS</div><h1>{def.title}<span className="heading-count">{all.length}</span></h1><p>{def.description}</p></div>
      <div className="heading-actions">
        {canEdit && <button className="btn" disabled={!checked.length} onClick={() => setBulk(true)}><Pencil size={15}/>Mass edit materials{checked.length ? ` (${checked.length})` : ''}</button>}
        {canImport && <Link className="btn" to={MATERIAL_IMPORT_PATH}><Upload size={15}/>Import material</Link>}
        {canAdd && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={15}/>Add material</button>}
      </div></div>
    <div className="table-card">
      <div className="table-toolbar mto-catalog-toolbar"><label className="page-size">Show <select aria-label="Entries per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{MATERIAL_PAGE_SIZES.map(option => <option key={option} value={option}>{option}</option>)}</select> entries</label></div>
      {filterCount > 0 && <div className="mto-filter-note" role="status">{filtered.length} of {all.length} materials match <button className="btn small" onClick={() => { setSearch({}); setPage(0); }}>Clear searches</button></div>}
      <TableScroll><table className="data-table mto-catalog-table">
        <thead>
          <tr><th className="select-cell"><input type="checkbox" aria-label="Select all materials on this page" checked={shown.length > 0 && shown.every(row => selected.includes(row.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...shown.map(row => row.id)])] : old.filter(id => !shown.some(row => row.id === id)))}/></th>{columns.map(column => <th key={column.name} aria-sort={sort.column === column.name ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => toggleSort(column.name)}>{column.label}<ArrowUpDown size={12} className={sort.column === column.name ? 'sort-active' : ''}/></button></th>)}<th className="actions-cell">Options</th></tr>
          <tr className="column-filters"><td className="select-cell"/>{columns.map(column => <td key={column.name}><input type="search" aria-label={`Search ${column.label}`} placeholder="Search" value={search[column.name] || ''} onChange={event => { setSearch(old => ({ ...old, [column.name]: event.target.value })); setPage(0); }}/></td>)}<td className="actions-cell"/></tr>
        </thead>
        <tbody>{shown.map(row => <tr key={row.id} className={selected.includes(row.id) ? 'selected' : undefined}>
          <td className="select-cell"><input type="checkbox" aria-label={`Select ${row.materialNo}`} checked={selected.includes(row.id)} onChange={event => setSelected(old => event.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))}/></td>
          {columns.map(column => <td key={column.name}>{column.name === 'materialNo' ? <strong>{text(row.materialNo)}</strong> : text(row[column.name]) || '—'}</td>)}
          <td className="actions-cell">{canRecord('materials', 'edit', row) && <button className="icon-btn" aria-label={`Edit material ${row.materialNo}`} onClick={() => setEditor(row)}><Pencil size={16}/></button>}{canRecord('materials', 'delete', row) && <button className="icon-btn" aria-label={`Delete material ${row.materialNo}`} onClick={() => setDeleting(row)}><Trash2 size={16}/></button>}</td>
        </tr>)}</tbody>
      </table></TableScroll>
      {!filtered.length && <EmptyState title={all.length ? 'No material matches your searches' : 'No materials yet'} description={all.length ? 'Change or clear the searches under the column headings.' : 'Add the first material or import them from Excel. They can then be added to isometrics.'}/>}
      <div className="table-footer"><span>{showingEntries(current * size + 1, current * size + shown.length, filtered.length)}{checked.length ? ` · ${checked.length} checked` : ''}</span><div><button className="btn small" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button className="btn small" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </div>
    {editor && <MaterialForm record={typeof editor === 'object' ? editor : undefined} onClose={() => setEditor(null)}/>}
    {bulk && <MassEditMaterials records={checked} onClose={done => { setBulk(false); if (done) setSelected([]); }}/>}
    {deleting && <DeleteMaterial record={deleting} onClose={done => { setDeleting(null); if (done) setSelected(old => old.filter(id => id !== deleting.id)); }}/>}
  </div>;
}

/** Options of the UOM, Material part and Type of material selects of the material forms (reference order and wording). */
function useMaterialOptions() {
  const { rows } = useWorkspace();
  return useMemo(() => ({
    uomId: catalogOrder(rows.uoms).map(row => ({ value: row.id, label: text(row.name) })),
    partId: catalogOrder(rows.material_parts).map(row => ({ value: row.id, label: text(row.name) })),
    typeId: catalogOrder(rows.material_types).map(row => ({ value: row.id, label: materialTypeLabel(row) })),
  }), [rows]) as Record<string, { value: string; label: string }[]>;
}

/** Add material / Edit material: the reference fields in the reference order; UOM starts at EA, part and type at their first option. */
function MaterialForm({ record, onClose }: { record?: Row; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const def = RESOURCE_MAP.materials, options = useMaterialOptions();
  const fields = [...MATERIAL_FORM_FIELDS.map(name => def.fields.find(field => field.name === name)), ...def.fields.filter(field => !field.hidden && !MATERIAL_FORM_FIELDS.includes(field.name) && field.name !== 'uom')].filter((field): field is NonNullable<typeof field> => Boolean(field));
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map(field => [field.name, record ? record[field.name] ?? '' : field.name === 'uomId' ? uomByName(activeRows(rows, 'uoms'), DEFAULT_UOM)?.id ?? '' : field.name in options ? options[field.name][0]?.value ?? '' : field.default ?? ''])));
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    const missing = Object.fromEntries(fields.filter(field => field.required && text(values[field.name]) === '').map(field => [field.name, `${field.label} is required.`]));
    if (Object.keys(missing).length) { setError('Please check the highlighted fields.'); setProblems(missing); return; }
    const payload = record ? Object.fromEntries(Object.entries(values).filter(([name, value]) => JSON.stringify(value ?? '') !== JSON.stringify(record[name] ?? ''))) : values;
    setBusy(true);
    try { await api(`/records/materials${record ? `/${record.id}` : ''}`, { method: record ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, ...(record ? { _version: record._version } : {}) }) }); await refresh(); notify(record ? 'Material updated.' : 'Material created.'); onClose(); }
    catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Form title={record ? 'Edit material' : 'Add material'} subtitle={record ? text(record.materialNo) : def.description} onClose={onClose} onSubmit={event => void submit(event)} busy={busy} error={error} fields={problems} submit={record ? 'Update' : 'Add'}>
    {fields.map(field => field.name in options
      ? <Choice key={field.name} label={field.label} value={text(values[field.name])} onChange={value => setValues(old => ({ ...old, [field.name]: value }))} options={options[field.name]} required={field.required} error={problems[field.name]}/>
      : <div key={field.name} className={field.name === 'description' ? 'full-width' : undefined}><FieldInput field={field} value={values[field.name]} onChange={value => setValues(old => ({ ...old, [field.name]: value }))} error={problems[field.name]}/></div>)}
  </Form>;
}

/** Mass edit materials: every field at once for the checked rows; an empty field keeps the stored values. */
function MassEditMaterials({ records, onClose }: { records: Row[]; onClose: (done: boolean) => void }) {
  const { refresh, notify } = useWorkspace();
  const def = RESOURCE_MAP.materials, options = useMaterialOptions();
  const [values, setValues] = useState<Record<string, unknown>>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const changes = massEditChanges(values), refusal = massEditRefusal(changes);
    if (refusal) { setError(refusal); return; }
    setBusy(true);
    try { await post('/bulk/materials', { ids: records.map(row => row.id), changes, versions: Object.fromEntries(records.map(row => [row.id, row._version])) }); await refresh(); notify(`${records.length} ${records.length === 1 ? 'material' : 'materials'} updated.`); onClose(true); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Form title="Mass edit materials" subtitle={`${records.length} selected ${records.length === 1 ? 'material' : 'materials'}`} onClose={() => onClose(false)} onSubmit={event => void submit(event)} busy={busy} error={error} submit="Update">
    <p className="field-hint full-width">{MASS_EDIT_HELP}</p>
    {MASS_EDIT_FIELDS.map(name => { const field = def.fields.find(item => item.name === name)!; const set = (value: unknown) => setValues(old => ({ ...old, [name]: value }));
      return name in options ? <Choice key={name} label={field.label} value={text(values[name])} onChange={set} options={options[name]} empty={MASS_EDIT_BLANK}/>
        : <div key={name} className={name === 'description' ? 'full-width' : undefined}><FieldInput field={{ ...field, required: false, default: undefined }} value={values[name] ?? ''} onChange={set}/></div>; })}
  </Form>;
}

/** Delete material: "Are you sure?" as the reference; the server refuses it while anything uses the material, and archives the record underneath. */
function DeleteMaterial({ record, onClose }: { record: Row; onClose: (done: boolean) => void }) {
  const { refresh, notify } = useWorkspace();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError('');
    try { await post(`/materials/${record.id}/delete`, { _version: record._version }); await refresh(); notify('Material deleted.'); onClose(true); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Delete material" subtitle={text(record.materialNo)} onClose={() => onClose(false)}>
    <div className="modal-body">{error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}<p>Are you sure?</p></div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={() => onClose(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 size={15} className="spin"/> : <Trash2 size={15}/>}Delete</button></div>
  </Modal>;
}

// ----- Materials tab of the isometric (MTO Pilot) --------------------------------------------------------------------------

interface PanelProps { iso: Row; onAttachments?: () => void; onAudit?: () => void; onPhase?: () => void; }

/** The Materials panel of an isometric: the requirement lines with their order, inventory and pick state. */
export function IsoMaterialsPanel({ iso, onAttachments, onAudit, onPhase }: PanelProps) {
  const { rows, siteId, canRecord, canRun, canReadReport, label } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]), [typeFilter, setTypeFilter] = useState(''), [dialog, setDialog] = useState<'catalog' | 'custom' | 'type' | 'delete' | ''>('');
  const [log, setLog] = useState(''), [editing, setEditing] = useState<Row | null>(null), [archiving, setArchiving] = useState<Row | null>(null);
  const phases = phasesById(rows.operation_phases);
  const lines = activeRows(rows, 'iso_materials').filter(line => line.isoId === iso.id);
  // Ord.? / Inv. / Picked need the orders, stock and pick lists the account may read; otherwise the columns show a dash.
  const executionVisible = ['orders', 'order_lines', 'stock', 'picklists'].every(key => canRecord(key));
  const statuses = useMemo(() => executionVisible ? materialLineStatuses(rows, iso.id) : new Map(), [rows, iso.id, executionVisible]);
  const status = useMemo(() => executionVisible ? materialStatus(iso, rows) : null, [rows, iso, executionVisible]);
  const listed = lines.filter(line => !typeFilter || (typeFilter === 'none' ? !line.phaseId : line.phaseId === typeFilter)).sort((a, b) => byText(materialRecord(rows, a)?.materialGroup ?? a.materialGroup, materialRecord(rows, b)?.materialGroup ?? b.materialGroup) || byText(materialRecord(rows, a)?.materialNo ?? a.materialNo, materialRecord(rows, b)?.materialNo ?? b.materialNo));
  const checked = lines.filter(line => selected.includes(line.id));
  const canAdd = canRun('add-iso-material', { isoId: iso.id }), canType = canRun('set-material-type'), canDelete = canRun('archive-iso-materials');
  const reportUrl = apiUrl(`/reports/mto?${new URLSearchParams({ siteId, projectId: text(iso.projectId), isoId: iso.id })}`);
  if (!canRecord('iso_materials')) return <EmptyState title="Materials restricted" description="Your permission profile does not include isometric materials."/>;
  const toggle = (id: string, on: boolean) => setSelected(old => on ? [...old, id] : old.filter(item => item !== id));
  return <section className="panel iso-materials-panel" aria-label="Isometric materials">
    <div className="panel-heading"><div><h2>Materials</h2>{status && <p className="mto-status" role="status">Material status {status.percent === null ? 'n/a' : `${formatNumber(status.percent)} %`}<span>{status.required > 0 ? ` · ${formatNumber(status.covered, 3)} of ${formatNumber(status.required, 3)} covered by pick and inventory` : ' · nothing required yet'}</span></p>}</div>
      <div className="heading-actions">
        <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}><button disabled={!onAttachments} onClick={onAttachments}>Attachments</button><button disabled={!onAudit} onClick={onAudit}>Audit trail</button><button disabled={!onPhase || !canRun('phases', { isoIds: [iso.id] })} onClick={onPhase}>Set phase</button></Dropdown>
        <button className="btn" disabled={!checked.length || !canType} onClick={() => setDialog('type')}>Set type</button>
        <button className="btn" disabled={!checked.length || !canDelete} onClick={() => setDialog('delete')}><Trash2 size={15}/>Delete selected</button>
        {canAdd && <Dropdown label="Add" trigger={<span className="btn primary"><Plus size={15}/>Add<ChevronDown size={15}/></span>}><button onClick={() => setDialog('catalog')}>Add material from DB</button><button onClick={() => setDialog('custom')}>Add custom material</button></Dropdown>}
      </div></div>
    <div className="mto-toolbar">
      <div className="field"><label htmlFor={`type-filter-${iso.id}`}>Type</label><div className="select-wrap"><select id={`type-filter-${iso.id}`} value={typeFilter} onChange={event => { setTypeFilter(event.target.value); setSelected([]); }}><option value="">All types</option>{phases.map(phase => <option key={phase.id} value={phase.id}>{text(phase.name)}</option>)}<option value="none">No type</option></select><ChevronDown size={14}/></div></div>
      <div className="heading-actions">{canReadReport('mto', 'export') && <><a className="btn" href={reportUrl}><Download size={15}/>CSV</a><a className="btn" href={`${reportUrl}&format=xlsx`}><Download size={15}/>Excel</a></>}{canReadReport('mto', 'print') && <MtoPrintButton iso={iso}/>}</div>
    </div>
    <TableScroll><table className="data-table mto-lines-table">
      <thead><tr><th>Group</th><th>Mat.no.</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th>Type</th><th className="number-cell">Qty.</th><th>UOM</th><th>Ord.?</th><th className="number-cell">Inv.</th><th className="number-cell">Picked</th><th className="actions-cell">Options</th><th className="select-cell"><input type="checkbox" aria-label="Select all listed materials" checked={listed.length > 0 && listed.every(line => selected.includes(line.id))} onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...listed.map(line => line.id)])] : selected.filter(id => !listed.some(line => line.id === id)))}/></th></tr></thead>
      <tbody>{listed.map(line => {
        const material = materialRecord(rows, line) || line, state = statuses.get(line.id);
        return <tr key={line.id} className={selected.includes(line.id) ? 'selected' : undefined}>
          <td>{text(material.materialGroup) || '—'}</td><td><strong>{text(material.materialNo) || 'Unavailable material'}</strong>{line.customMaterial && !line.materialId ? <span className="custom-material-tag"> custom</span> : null}</td><td>{text(material.dia) || '—'}</td><td>{text(material.lbs) || '—'}</td><td className="description-cell">{text(material.description) || '—'}</td>
          <td>{line.phaseId ? label('operation_phases', line.phaseId) : '—'}</td>
          <td className="number-cell"><button className="record-link" aria-label={`Quantity log of ${text(material.materialNo)}`} onClick={() => setLog(line.id)}>{formatNumber(line.quantity, 3)}</button></td><td>{text(material.uom) || '—'}</td>
          <td>{state ? <Badge color={state.isOrdered ? 'green' : 'amber'}>{state.isOrdered ? 'Yes' : 'No'}</Badge> : '—'}</td><td className="number-cell">{state ? formatNumber(state.inventory, 3) : '—'}</td><td className="number-cell">{state ? formatNumber(state.picked, 3) : '—'}</td>
          <td className="actions-cell"><Dropdown label={`Options for ${text(material.materialNo)}`} trigger={<span className="icon-btn"><MoreHorizontal size={16}/></span>}><button onClick={() => setLog(line.id)}>Quantity log</button><button disabled={!canRecord('iso_materials', 'edit', line)} onClick={() => setEditing(line)}>Edit</button><button disabled={!canRecord('iso_materials', 'delete', line)} onClick={() => setArchiving(line)}>Delete</button></Dropdown></td>
          <td className="select-cell"><input type="checkbox" aria-label={`Select ${text(material.materialNo)}`} checked={selected.includes(line.id)} onChange={event => toggle(line.id, event.target.checked)}/></td>
        </tr>;
      })}</tbody>
    </table></TableScroll>
    {!listed.length && <EmptyState title={lines.length ? 'No materials of this type' : 'No materials on this isometric'} description={lines.length ? 'Choose another type or All types.' : canAdd ? 'Use Add to take a material from the database or enter a custom one.' : 'Materials are added by team members who may edit the take-off.'}/>}
    <div className="table-footer"><span>{listed.length} {listed.length === 1 ? 'line' : 'lines'}{checked.length ? ` · ${checked.length} checked` : ''}{!executionVisible ? ' · order, inventory and pick data are not available to your profile' : ''}</span></div>
    {dialog === 'catalog' && <AddCatalogMaterial iso={iso} onClose={() => setDialog('')}/>}
    {dialog === 'custom' && <AddCustomMaterial iso={iso} onClose={() => setDialog('')}/>}
    {dialog === 'type' && <SetTypeDialog lines={checked} onClose={done => { setDialog(''); if (done) setSelected([]); }}/>}
    {dialog === 'delete' && <DeleteLinesDialog lines={checked} onClose={done => { setDialog(''); if (done) setSelected([]); }}/>}
    {log && <MaterialQuantityLogDialog requirementId={log} onClose={() => setLog('')}/>}
    {editing && <RecordEditor resourceKey="iso_materials" record={editing} onClose={() => setEditing(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="iso_materials" record={archiving} onClose={() => setArchiving(null)}/>}
  </section>;
}

// ----- dialogs -------------------------------------------------------------------------------------------------------

/** A labelled select used by the dialogs below. */
function Choice({ label, value, onChange, options, error, required, hint, empty }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; error?: string; required?: boolean; hint?: string; empty?: string }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label><div className="select-wrap"><select id={id} value={value} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)}><option value="">{empty ?? selectPrompt(label)}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14}/></div>{hint && <small className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}

function useAddMaterial(iso: Row, onClose: () => void) {
  const { refresh, notify } = useWorkspace();
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function submit(payload: Record<string, unknown>, options: { requireGroup: boolean }) {
    const problems = isoMaterialInputErrors(payload, options);
    setError(''); setFields(problems);
    if (Object.keys(problems).length) { setError('Please check the highlighted fields.'); return; }
    setBusy(true);
    try { await post('/actions/add-iso-material', { isoId: iso.id, ...payload }); await refresh(); notify('Material added.'); onClose(); }
    catch (failure) { setError((failure as Error).message); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return { error, fields, busy, submit };
}
const Form = ({ title, subtitle, onClose, onSubmit, busy, error, fields, submit, children }: { title: string; subtitle: string; onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean; error: string; fields?: Record<string, string>; submit: string; children: ReactNode }) =>
  <Modal title={title} subtitle={subtitle} onClose={onClose} wide><form noValidate onSubmit={onSubmit}><div className="modal-body"><FormError message={error} fields={fields}/><div className="form-grid">{children}</div></div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button></div></form></Modal>;

const quantityOf = (value: unknown) => value === '' || value === undefined ? '' : Number(value);
const revisionOptions = (rows: Record<string, Row[]>, iso: Row) => activeRows(rows, 'revisions').filter(row => row.type === 'ISO' && row.isoId === iso.id).sort((a, b) => text(b._createdAt).localeCompare(text(a._createdAt))).map(row => ({ value: row.id, label: `Revision ${text(row.revNo)}${row.date ? ` · ${text(row.date)}` : ''}` }));
/** Operation phases in ID order (the Add material Type select opens on the first, as the reference does); Set type lists them A-Z. */
const phaseOptions = (rows: Record<string, Row[]>, order = phasesById) => order(rows.operation_phases).map(phase => ({ value: phase.id, label: text(phase.name) }));

/** Add material from DB: choose the material group, then a material of that group, quantity, revision and type. */
function AddCatalogMaterial({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const { error, fields, busy, submit } = useAddMaterial(iso, onClose);
  const [group, setGroup] = useState(''), [materialId, setMaterialId] = useState(''), [quantity, setQuantity] = useState<number | ''>(''), [revisionId, setRevision] = useState(''), [phaseId, setPhase] = useState(() => phaseOptions(rows)[0]?.value ?? '');
  const materials = activeRows(rows, 'materials'), groups = [...new Set(materials.map(row => text(row.materialGroup)).filter(Boolean))].sort(byText);
  const inGroup = materials.filter(row => text(row.materialGroup) === group).sort((a, b) => byText(a.materialNo, b.materialNo));
  return <Form title="Add material from DB" subtitle={`Take a material from the database for ${text(iso.isoNo)}.`} onClose={onClose} busy={busy} error={error} fields={fields} submit="Add material" onSubmit={event => { event.preventDefault(); void submit({ source: 'Catalog', materialGroup: group, materialId, quantity: quantityOf(quantity), revisionId, phaseId }, { requireGroup: false }); }}>
    <Choice label="Material group" value={group} onChange={value => { setGroup(value); setMaterialId(''); }} options={groups.map(value => ({ value, label: value }))} empty="Choose group" required error={fields.materialGroup} hint={groups.length ? undefined : 'The database has no material groups yet.'}/>
    <Choice label="Material" value={materialId} onChange={setMaterialId} options={inGroup.map(row => ({ value: row.id, label: `${text(row.materialNo)} · ${text(row.description)}${row.dia ? ` · ${text(row.dia)}` : ''}${row.lbs ? ` · ${text(row.lbs)}` : ''}` }))} empty={group ? 'Choose material' : 'Choose a group first'} required error={fields.materialId}/>
    <FieldInput field={{ name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 0 }} value={quantity} onChange={value => setQuantity(value as number | '')} error={fields.quantity}/>
    <Choice label="Revision" value={revisionId} onChange={setRevision} options={revisionOptions(rows, iso)} empty="No revision" error={fields.revisionId}/>
    <Choice label="Type" value={phaseId} onChange={setPhase} options={phaseOptions(rows)} empty="No type"/>
  </Form>;
}

/** Add custom material: the reference fields, optionally also saved to the Material database. */
function AddCustomMaterial({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const { error, fields, busy, submit } = useAddMaterial(iso, onClose);
  const [values, setValues] = useState<Record<string, unknown>>({ materialGroup: '', articleNo: '', legacyNo: '', materialNo: '', dia: '', lbs: '', quantity: '', phaseId: phaseOptions(rows)[0]?.value ?? '', price: '', uom: '', revisionId: '', chargeNo: '', description: '', componentCode: '', progressClass: '', addToDB: false });
  const set = (name: string) => (value: unknown) => setValues(old => ({ ...old, [name]: value }));
  const str = (name: string) => text(values[name]);
  const uoms = activeRows(rows, 'uoms').map(row => text(row.name)).sort(byText), groups = [...new Set(activeRows(rows, 'materials').map(row => text(row.materialGroup)).filter(Boolean))].sort(byText);
  const charges = [...new Set(activeRows(rows, 'certifications').map(row => text(row.chargeNo)).filter(Boolean))].sort(byText);
  const input = (name: string, label: string, extra: Partial<{ required: boolean; type: 'text' | 'number'; hint: string }> = {}) => <FieldInput field={{ name, label, type: extra.type || 'text', required: extra.required, hint: extra.hint, min: extra.type === 'number' ? 0 : undefined }} value={values[name]} onChange={set(name)} error={fields[name]}/>;
  return <Form title="Add custom material" subtitle={`Enter a material that is not in the database for ${text(iso.isoNo)}.`} onClose={onClose} busy={busy} error={error} fields={fields} submit="Add material"
    onSubmit={event => { event.preventDefault(); void submit({ source: 'Custom', ...values, quantity: quantityOf(values.quantity), price: quantityOf(values.price), addToDB: Boolean(values.addToDB) }, { requireGroup: true }); }}>
    <div className="field"><label htmlFor="custom-group">Material group<span className="required"> *</span></label><input id="custom-group" list="custom-group-options" required autoComplete="off" value={str('materialGroup')} aria-invalid={Boolean(fields.materialGroup)} onChange={event => set('materialGroup')(event.target.value)}/><datalist id="custom-group-options">{groups.map(group => <option key={group} value={group}/>)}</datalist>{fields.materialGroup && <small className="field-error">{fields.materialGroup}</small>}</div>
    {input('articleNo', 'Article No')}{input('legacyNo', 'Legacy No')}{input('materialNo', 'Material No', { required: true })}{input('dia', 'DIA')}{input('lbs', 'LBS/SCH')}
    {input('quantity', 'Quantity', { required: true, type: 'number' })}
    <Choice label="Type" value={str('phaseId')} onChange={set('phaseId')} options={phaseOptions(rows)} empty="No type"/>
    {input('price', 'Price', { type: 'number' })}
    {uoms.length ? <Choice label="UOM" value={str('uom')} onChange={set('uom')} options={uoms.map(value => ({ value, label: value }))} required error={fields.uom}/> : input('uom', 'UOM', { required: true })}
    <Choice label="Revision" value={str('revisionId')} onChange={set('revisionId')} options={revisionOptions(rows, iso)} empty="No revision" error={fields.revisionId}/>
    {charges.length ? <Choice label="Charge number" value={str('chargeNo')} onChange={set('chargeNo')} options={charges.map(value => ({ value, label: value }))} empty="No charge number"/> : input('chargeNo', 'Charge number')}
    <div className="full-width">{input('description', 'Material description', { required: true })}</div>
    {input('componentCode', 'Component code')}
    <Choice label="Progress class" value={str('progressClass')} onChange={set('progressClass')} options={PROGRESS_CLASSES.map(value => ({ value, label: value }))} empty="Not classified" hint="Pipe, supports and appendages feed the progress budget of the isometric." error={fields.progressClass}/>
    <div className="full-width"><FieldInput field={{ name: 'addToDB', label: 'add to DB', type: 'checkbox', hint: 'Also saves this material in the Material database for later use.' }} value={values.addToDB} onChange={set('addToDB')} error={fields.addToDB}/></div>
  </Form>;
}

/** Set type for the checked rows. */
function SetTypeDialog({ lines, onClose }: { lines: Row[]; onClose: (done: boolean) => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const [phaseId, setPhase] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!phaseId) { setError('Choose a type.'); return; }
    setBusy(true); setError('');
    try { await post('/actions/set-material-type', { requirementIds: lines.map(line => line.id), phaseId }); await refresh(); notify(`Type set for ${lines.length} ${lines.length === 1 ? 'material' : 'materials'}.`); onClose(true); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Form title="Set type" subtitle={`Change the operation phase of ${lines.length} checked ${lines.length === 1 ? 'material' : 'materials'}.`} onClose={() => onClose(false)} onSubmit={event => void submit(event)} busy={busy} error={error} submit="Set type">
    <Choice label="Type" value={phaseId} onChange={setPhase} options={phaseOptions(rows, phasesByName)} required error={error && !phaseId ? error : undefined}/>
  </Form>;
}

/** Delete selected: the lines are archived and can be restored from the Materials list. */
function DeleteLinesDialog({ lines, onClose }: { lines: Row[]; onClose: (done: boolean) => void }) {
  const { refresh, notify } = useWorkspace();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError('');
    try { await post('/actions/archive-iso-materials', { requirementIds: lines.map(line => line.id) }); await refresh(); notify(`${lines.length} ${lines.length === 1 ? 'material' : 'materials'} deleted.`); onClose(true); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Delete selected materials?" subtitle={`${lines.length} checked ${lines.length === 1 ? 'material' : 'materials'}`} onClose={() => onClose(false)}>
    <div className="modal-body">{error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}<p>The checked materials leave this isometric. Their history stays, and they can be restored from the Materials list. Materials that are already ordered or picked must be removed there first.</p></div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={() => onClose(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy && <Loader2 size={15} className="spin"/>}Delete selected</button></div>
  </Modal>;
}
