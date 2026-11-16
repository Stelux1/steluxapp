import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowUpDown, ChevronDown, Download, History, Loader2, Pencil, Plus, Trash2, Truck, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Row } from '../shared/types.ts';
import { materialRecord } from '../shared/materials.ts';
import { ADD_MATERIAL_DIALOG, ISO_IMPORT_COLUMNS, ISO_MATERIAL_PAGE_SIZE, ISO_MATERIAL_PAGE_SIZES, NO_REVISION_CHANGES, PILOT_MATERIAL_RULES, SET_TYPE_DIALOG, chargeNumberOptions, formatMaterialStatus, inventoryLevel, inventoryTooltip, isoMaterialDeleteRefusal, isoMaterialInputErrors, isoRevisions, listIsoMaterials, materialLineStatuses, materialStatus, materialStatusByRevision, materialsOfGroup, orderDetails, revisionLabel, type IsoImportRow, type MaterialInputOptions, type MaterialLineStatus } from '../shared/mto-materials.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { ApiError, api, apiUrl, formatDate, formatNumber, post } from './api.ts';
import { HOME_LOCATION, LINKED_TO_SITE, materialFormFields, materialSiteIds, materialsOnSite } from '../shared/material-sites.ts';
import { DEFAULT_UOM, MASS_EDIT_BLANK, MASS_EDIT_FIELDS, MASS_EDIT_HELP, MATERIAL_DEFAULT_SORT, MATERIAL_IMPORT_PATH, MATERIAL_PAGE_SIZE, MATERIAL_PAGE_SIZES, catalogOrder, massEditChanges, massEditRefusal, materialTypeLabel, phasesById, phasesByName, showingEntries, sortMaterials, uomByName } from '../shared/material-db.ts';
import { Badge, Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll, FormError, selectPrompt } from './components.tsx';
import { AttachmentCountBadge } from './iso-dialogs.tsx';
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
  const { rows, allRows, siteId, canRecord } = useWorkspace();
  const def = RESOURCE_MAP.materials;
  const [search, setSearch] = useState<Record<string, string>>({}), [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0), [size, setSize] = useState(MATERIAL_PAGE_SIZE);
  const [sort, setSort] = useState(MATERIAL_DEFAULT_SORT);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [bulk, setBulk] = useState(false), [deleting, setDeleting] = useState<Row | null>(null);
  const columns = def.columns.map(key => def.fields.find(field => field.name === key)!).filter(Boolean).map(field => ({ ...field, label: MATERIAL_HEADINGS[field.name] || field.label }));
  // The Material database of the current main project: the materials linked to it (older materials without links are on every one).
  const all = useMemo(() => materialsOnSite(activeRows(rows, 'materials'), siteId, allRows.catalog_sites), [rows, allRows.catalog_sites, siteId]);
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
    {editor && <MaterialForm record={typeof editor === 'object' ? editor : undefined} onClose={() => setEditor(null)} onShow={materialNo => { setEditor(null); setSearch({ materialNo }); setPage(0); }}/>}
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

/**
 * "Home location": one checkbox per main project the account can open; ticked where the material(s) are available. With several
 * materials a box is half ticked when only some of them are there; only the boxes that are changed are sent.
 */
function HomeLocation({ records, changes, onChange }: { records: Row[]; changes: Record<string, boolean>; onChange: (changes: Record<string, boolean>) => void }) {
  const { allRows } = useWorkspace();
  const sites = activeRows(allRows, 'sites').sort((a, b) => byText(a.name, b.name));
  const ticked = (siteId: string) => records.filter(row => materialSiteIds(row, [{ id: siteId }], allRows.catalog_sites).length).length;
  if (!sites.length) return null;
  return <fieldset className="full-width material-home-location"><legend>{HOME_LOCATION}</legend><div className="material-home-sites">{sites.map(site => {
    const count = ticked(site.id), changed = Object.hasOwn(changes, site.id), checked = changed ? changes[site.id] : count === records.length;
    return <label key={site.id}><input type="checkbox" checked={checked} ref={element => { if (element) element.indeterminate = !changed && count > 0 && count < records.length; }} onChange={event => {
      // Back to what every checked material already has: nothing to send for this box.
      const next = { ...changes, [site.id]: event.target.checked };
      if (event.target.checked ? count === records.length : count === 0) delete next[site.id];
      onChange(next);
    }}/><span>{text(site.name)}</span></label>;
  })}</div></fieldset>;
}

/** Add material / Edit material: the reference fields in the reference order; UOM starts at EA, part and type at their first option. */
function MaterialForm({ record, onClose, onShow }: { record?: Row; onClose: () => void; onShow: (materialNo: string) => void }) {
  const { rows, siteId, refresh, notify } = useWorkspace();
  const def = RESOURCE_MAP.materials, options = useMaterialOptions();
  const fields = materialFormFields(def.fields, record ? 'edit' : 'add');
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map(field => [field.name, record ? record[field.name] ?? '' : field.name === 'uomId' ? uomByName(activeRows(rows, 'uoms'), DEFAULT_UOM)?.id ?? '' : field.name in options ? options[field.name][0]?.value ?? '' : field.default ?? ''])));
  const [sites, setSites] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    const missing = Object.fromEntries(fields.filter(field => field.required && text(values[field.name]) === '').map(field => [field.name, `${field.label} is required.`]));
    if (Object.keys(missing).length) { setError('Please check the highlighted fields.'); setProblems(missing); return; }
    if (!record && !siteId) { setError('Choose a main project first.'); return; }
    const payload = record ? Object.fromEntries(Object.entries(values).filter(([name, value]) => JSON.stringify(value ?? '') !== JSON.stringify(record[name] ?? ''))) : { ...values, enabledOnSite: true, enabledSiteId: siteId };
    setBusy(true);
    try {
      if (!record) {
        const result = await api<{ record: Row; linked?: boolean }>('/records/materials', { method: 'POST', body: JSON.stringify(payload) });
        await refresh(); notify(result.linked ? LINKED_TO_SITE(text(result.record.materialNo)) : 'Material created.'); onClose(); return;
      }
      if (Object.keys(payload).length) await api(`/records/materials/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, _version: record._version }) });
      if (Object.keys(sites).length) await post('/material-sites', { ids: [record.id], sites });
      await refresh(); notify('Material updated.'); onClose();
    }
    catch (failure) {
      // The same Material No is already in this project site's database: the add is refused and that row is shown.
      if ((failure as ApiError).code === 'material-on-site') { notify((failure as Error).message); onShow(text(values.materialNo)); return; }
      setError((failure as Error).message); setProblems((failure as ApiError).fields || {});
    } finally { setBusy(false); }
  }
  return <Form title={record ? 'Edit material' : 'Add material'} subtitle={record ? text(record.materialNo) : def.description} onClose={onClose} onSubmit={event => void submit(event)} busy={busy} error={error} fields={problems} submit={record ? 'Update' : 'Add'}>
    {record && <HomeLocation records={[record]} changes={sites} onChange={setSites}/>}
    {fields.map(field => field.name in options
      ? <Choice key={field.name} label={field.label} value={text(values[field.name])} onChange={value => setValues(old => ({ ...old, [field.name]: value }))} options={options[field.name]} required={field.required} error={problems[field.name]}/>
      : <div key={field.name} className={field.name === 'description' ? 'full-width' : undefined}><FieldInput field={field} value={values[field.name]} onChange={value => setValues(old => ({ ...old, [field.name]: value }))} error={problems[field.name]}/></div>)}
  </Form>;
}

/** Mass edit materials: every field at once for the checked rows; an empty field keeps the stored values. */
function MassEditMaterials({ records, onClose }: { records: Row[]; onClose: (done: boolean) => void }) {
  const { refresh, notify } = useWorkspace();
  const def = RESOURCE_MAP.materials, options = useMaterialOptions();
  const [values, setValues] = useState<Record<string, unknown>>({}), [sites, setSites] = useState<Record<string, boolean>>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const changes = massEditChanges(values), refusal = massEditRefusal(changes), sitesChanged = Object.keys(sites).length > 0;
    // The project site boxes may change on their own; filled fields follow the mass edit rule.
    if (refusal && (Object.keys(changes).length || !sitesChanged)) { setError(refusal); return; }
    setBusy(true);
    try {
      if (Object.keys(changes).length) await post('/bulk/materials', { ids: records.map(row => row.id), changes, versions: Object.fromEntries(records.map(row => [row.id, row._version])) });
      if (sitesChanged) await post('/material-sites', { ids: records.map(row => row.id), sites });
      await refresh(); notify(`${records.length} ${records.length === 1 ? 'material' : 'materials'} updated.`); onClose(true);
    }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Form title="Mass edit materials" subtitle={`${records.length} selected ${records.length === 1 ? 'material' : 'materials'}`} onClose={() => onClose(false)} onSubmit={event => void submit(event)} busy={busy} error={error} submit="Update">
    <p className="field-hint full-width">{MASS_EDIT_HELP}</p>
    <HomeLocation records={records} changes={sites} onChange={setSites}/>
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

/** The Inv. truck of a line: red, orange or green by the stock against the line, with the reference tooltip; it opens the stock detail. */
function InventoryTruck({ state, name, onOpen }: { state: MaterialLineStatus; name: string; onOpen: () => void }) {
  const tip = inventoryTooltip(state);
  return <button type="button" className={`record-link mto-truck mto-truck-${inventoryLevel(state)}`} title={tip} aria-label={`${tip}, stock detail of ${name}`} aria-haspopup="dialog" onClick={onOpen}><Truck size={17} aria-hidden="true"/></button>;
}

/** The Materials panel of an isometric: the requirement lines with their order, inventory and pick state. */
export function IsoMaterialsPanel({ iso, onAttachments, onAudit, onPhase }: PanelProps) {
  const { rows, canRecord, canRun, label } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]), [typeFilter, setTypeFilter] = useState(''), [query, setQuery] = useState(''), [size, setSize] = useState(ISO_MATERIAL_PAGE_SIZE), [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<'catalog' | 'custom' | 'type' | 'delete' | 'import' | 'revisions' | ''>('');
  const [log, setLog] = useState(''), [editing, setEditing] = useState<Row | null>(null), [deleting, setDeleting] = useState<Row | null>(null), [details, setDetails] = useState('');
  const phases = phasesById(rows.operation_phases);
  const lines = activeRows(rows, 'iso_materials').filter(line => line.isoId === iso.id);
  // Ord.? / Inv. / Picked need the orders, stock and pick lists the account may read; otherwise the columns show a dash.
  const executionVisible = ['orders', 'order_lines', 'stock', 'picklists'].every(key => canRecord(key));
  const statuses = useMemo(() => executionVisible ? materialLineStatuses(rows, iso.id) : new Map<string, MaterialLineStatus>(), [rows, iso.id, executionVisible]);
  const status = useMemo(() => executionVisible ? materialStatus(iso, rows) : null, [rows, iso, executionVisible]);
  const listed = useMemo(() => listIsoMaterials(lines, rows, statuses, { phaseId: typeFilter, query }), [lines, rows, statuses, typeFilter, query]);
  const pages = Math.max(1, Math.ceil(listed.length / size)), current = Math.min(page, pages - 1), shown = listed.slice(current * size, (current + 1) * size);
  const checked = lines.filter(line => selected.includes(line.id));
  const canAdd = canRun('add-iso-material', { isoId: iso.id }), canType = canRun('set-material-type'), canDelete = canRun('archive-iso-materials');
  if (!canRecord('iso_materials')) return <EmptyState title="Materials restricted" description="Your permission profile does not include isometric materials."/>;
  const toggle = (id: string, on: boolean) => setSelected(old => on ? [...old, id] : old.filter(item => item !== id));
  return <section className="panel iso-materials-panel" aria-label="Isometric materials">
    <div className="panel-heading"><div><h2>Materials</h2>{status && <p className="mto-status" role="status" title={status.required > 0 ? `${formatNumber(status.covered, 3)} of ${formatNumber(status.required, 3)} covered by pick and inventory` : 'The isometric has no material lines yet.'}>Material status <strong>{formatMaterialStatus(status.percent)}</strong><button type="button" className="icon-btn" title="Material status per revision" aria-label="Material status per revision" onClick={() => setDialog('revisions')}><History size={16}/></button></p>}</div>
      <div className="heading-actions">
        <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}><button disabled={!onAttachments} onClick={onAttachments}>Attachments<AttachmentCountBadge isoId={iso.id}/></button><button disabled={!onAudit} onClick={onAudit}>Audit trail</button><button disabled={!onPhase || !canRun('phases', { isoIds: [iso.id] })} onClick={onPhase}>Set phase</button></Dropdown>
        <button className="btn" disabled={!checked.length || !canType} onClick={() => setDialog('type')}>Set type</button>
        <button className="btn" disabled={!checked.length || !canDelete} onClick={() => setDialog('delete')}><Trash2 size={15}/>Delete selected</button>
        {canAdd && <button className="btn" onClick={() => setDialog('import')}><Upload size={15}/>Import in ISO</button>}
        {canAdd && <Dropdown label="Add" trigger={<span className="btn primary"><Plus size={15}/>Add<ChevronDown size={15}/></span>}><button onClick={() => setDialog('catalog')}>Add material from DB</button><button onClick={() => setDialog('custom')}>Add custom material</button></Dropdown>}
      </div></div>
    <div className="mto-toolbar">
      <div className="field"><label htmlFor={`type-filter-${iso.id}`}>Type</label><div className="select-wrap"><select id={`type-filter-${iso.id}`} value={typeFilter} onChange={event => { setTypeFilter(event.target.value); setSelected([]); setPage(0); }}><option value="">All types</option>{phases.map(phase => <option key={phase.id} value={phase.id}>{text(phase.name)}</option>)}</select><ChevronDown size={14}/></div></div>
      <label className="page-size">Show <select aria-label="Entries per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{ISO_MATERIAL_PAGE_SIZES.map(option => <option key={option} value={option}>{option}</option>)}</select> entries</label>
      <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search"/>
      <div className="heading-actions"><MtoPrintButton iso={iso} phaseId={typeFilter}/></div>
    </div>
    <TableScroll><table className="data-table mto-lines-table">
      <thead><tr><th>Group</th><th>Mat.no.</th><th>DIA</th><th>LBS/SCH</th><th>Description</th><th>Type</th><th className="number-cell">Qty.</th><th>UOM</th><th>Ord.?</th><th className="number-cell">Inv.</th><th className="number-cell">Picked</th><th className="actions-cell">Options</th><th className="select-cell"><input type="checkbox" aria-label="Select all listed materials" checked={shown.length > 0 && shown.every(line => selected.includes(line.id))} onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...shown.map(line => line.id)])] : selected.filter(id => !shown.some(line => line.id === id)))}/></th></tr></thead>
      <tbody>{shown.map(line => {
        const material = materialRecord(rows, line) || line, state = statuses.get(line.id), name = text(material.materialNo), refusal = isoMaterialDeleteRefusal(state);
        return <tr key={line.id} className={selected.includes(line.id) ? 'selected' : undefined}>
          <td>{text(material.materialGroup) || '—'}</td><td><strong>{name || 'Unavailable material'}</strong>{line.customMaterial && !line.materialId ? <span className="custom-material-tag"> custom</span> : null}</td><td>{text(material.dia) || '—'}</td><td>{text(material.lbs) || '—'}</td><td className="description-cell">{text(material.description) || '—'}</td>
          <td>{line.phaseId ? label('operation_phases', line.phaseId) : '—'}</td>
          <td className="number-cell"><button className="record-link" aria-label={`Quantity log of ${name}`} onClick={() => setLog(line.id)}>{formatNumber(line.quantity, 3)}</button></td><td>{text(line.uom) || text(material.uom) || '—'}</td>
          <td>{!state ? '—' : state.hasOrder && state.orderId ? <Link className="text-link" to={`/materials/order-archive?order=${encodeURIComponent(state.orderId)}`} target="_blank" rel="noopener" title={`Ord. No.: ${state.orderNo}`}>Yes</Link> : <Badge color={state.hasOrder ? 'green' : 'amber'}>{state.hasOrder ? 'Yes' : 'No'}</Badge>}</td>
          <td className="number-cell">{state ? <InventoryTruck state={state} name={name} onOpen={() => setDetails(line.id)}/> : '—'}</td><td className="number-cell">{state ? formatNumber(state.picked, 3) : '—'}</td>
          <td className="actions-cell"><button className="icon-btn" aria-label={`Edit ${name}`} title="Edit" disabled={!canRecord('iso_materials', 'edit', line) || !canRun('edit-iso-material')} onClick={() => setEditing(line)}><Pencil size={16}/></button><button className="icon-btn" aria-label={`Delete ${name}`} title={refusal || 'Delete'} disabled={Boolean(refusal) || !canRecord('iso_materials', 'delete', line) || !canDelete} onClick={() => setDeleting(line)}><Trash2 size={16}/></button></td>
          <td className="select-cell"><input type="checkbox" aria-label={`Select ${name}`} checked={selected.includes(line.id)} onChange={event => toggle(line.id, event.target.checked)}/></td>
        </tr>;
      })}</tbody>
    </table></TableScroll>
    {!listed.length && <EmptyState title={lines.length ? 'No materials match' : 'No materials on this isometric'} description={lines.length ? 'Choose another type or All types, or clear the search.' : canAdd ? 'Use Add to take a material from the database or enter a custom one.' : 'Materials are added by team members who may edit the take-off.'}/>}
    <div className="table-footer"><span>{showingEntries(current * size + 1, current * size + shown.length, listed.length)}{checked.length ? ` · ${checked.length} checked` : ''}{!executionVisible ? ' · order, inventory and pick data are not available to your profile' : ''}</span><div><button className="btn small" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button className="btn small" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
    {dialog === 'catalog' && <AddCatalogMaterial iso={iso} onClose={() => setDialog('')}/>}
    {dialog === 'custom' && <AddCustomMaterial iso={iso} onClose={() => setDialog('')}/>}
    {dialog === 'type' && <SetTypeDialog lines={checked} onClose={done => { setDialog(''); if (done) setSelected([]); }}/>}
    {dialog === 'delete' && <DeleteLinesDialog lines={checked} onClose={done => { setDialog(''); if (done) setSelected([]); }}/>}
    {dialog === 'import' && <ImportInIsoDialog iso={iso} onClose={() => setDialog('')}/>}
    {dialog === 'revisions' && <MaterialStatusByRevisionDialog iso={iso} onClose={() => setDialog('')}/>}
    {log && <MaterialQuantityLogDialog requirementId={log} onClose={() => setLog('')}/>}
    {details && <OrderDetailsDialog requirementId={details} onClose={() => setDetails('')}/>}
    {editing && <EditIsoMaterialDialog line={editing} onClose={() => setEditing(null)}/>}
    {deleting && <DeleteLinesDialog lines={[deleting]} onClose={() => setDeleting(null)}/>}
  </section>;
}

// ----- dialogs -------------------------------------------------------------------------------------------------------

/** A labelled select used by the dialogs below. */
function Choice({ label, value, onChange, options, error, required, hint, empty }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; error?: string; required?: boolean; hint?: string; empty?: string | null }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label><div className="select-wrap"><select id={id} value={value} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)}>{empty !== null && <option value="">{empty ?? selectPrompt(label)}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14}/></div>{hint && <small className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
/** A read-only line of the Edit material dialog. */
function ReadOnly({ label, value }: { label: string; value: string }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} readOnly value={value}/></div>;
}
/** A search box over a list of choices (the reference's group and material lists): type to narrow, click one to choose it. */
function SearchChoice({ label, placeholder, empty, options, value, onChange, error, required }: { label: string; placeholder: string; empty: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; error?: string; required?: boolean }) {
  const id = useId(), [query, setQuery] = useState('');
  const matching = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="field full-width"><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>
    <input id={id} type="search" autoComplete="off" placeholder={placeholder} value={query} onChange={event => setQuery(event.target.value)} aria-describedby={error ? `${id}-error` : undefined}/>
    <div className="mto-choice-list" role="listbox" aria-label={label}>{matching.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} className={option.value === value ? 'is-active' : undefined} onClick={() => onChange(option.value)}>{option.label}</button>)}{!matching.length && <p className="muted">{empty}</p>}</div>
    {error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}

function useAddMaterial(iso: Row, onClose: () => void) {
  const { refresh, notify } = useWorkspace();
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function submit(payload: Record<string, unknown>, options: MaterialInputOptions) {
    const problems = isoMaterialInputErrors(payload, options);
    setError(''); setFields(problems);
    if (Object.keys(problems).length) { setError('Please check the highlighted fields.'); return; }
    setBusy(true);
    try { await post('/actions/add-iso-material', { isoId: iso.id, ...payload }); await refresh(); notify('Material added.'); onClose(); }
    catch (failure) { setError((failure as Error).message); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return { error, fields, busy, submit };
}
const Form = ({ title, subtitle, onClose, onSubmit, busy, error, fields, submit, children }: { title: string; subtitle?: string; onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean; error: string; fields?: Record<string, string>; submit: string; children: ReactNode }) =>
  <Modal title={title} subtitle={subtitle} onClose={onClose} wide><form noValidate onSubmit={onSubmit}><div className="modal-body"><FormError message={error} fields={fields}/><div className="form-grid">{children}</div></div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button></div></form></Modal>;

const quantityOf = (value: unknown) => value === '' || value === undefined ? '' : Number(value);
/** ISO revisions of the isometric as select options, newest first (the form opens on the newest). */
const revisionOptions = (rows: Record<string, Row[]>, iso: Row) => isoRevisions(rows, iso.id).map(row => ({ value: row.id, label: revisionLabel(row) }));
/** Operation phases in ID order (the Add material Type select opens on the first, as the reference does); Set type lists them A-Z. */
const phaseOptions = (rows: Record<string, Row[]>, order = phasesById) => order(rows.operation_phases).map(phase => ({ value: phase.id, label: text(phase.name) }));

/** Group, Type and quantity of the last material added, kept in this browser for the next time (a per-viewer convenience). */
const SAVED_KEY = 'blitzkrieg-mto-add-material';
const readSaved = (): { group?: string; phaseId?: string; quantity?: string } => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}') || {}; } catch { return {}; } };
const writeSaved = (value: { group?: string; phaseId?: string; quantity?: string }) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(value)); } catch { /* storage may be blocked */ } };

/** The input rules of the add forms: the pilots' reference rules (Type, Revision, 0.01), the other profiles as before. */
function useInputRules(iso: Row): MaterialInputOptions {
  const { rows, hasFeature } = useWorkspace();
  return hasFeature('pilots') ? { ...PILOT_MATERIAL_RULES, requireRevision: isoRevisions(rows, iso.id).length > 0 } : {};
}

/** Add material from DB (reference "Add material"): Quantity, Revision (newest), Type, then a material group and a material of it. */
function AddCatalogMaterial({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const { error, fields, busy, submit } = useAddMaterial(iso, onClose); const rules = useInputRules(iso);
  const saved = useMemo(readSaved, []);
  const materials = activeRows(rows, 'materials'), groups = [...new Set(materials.map(row => text(row.materialGroup)).filter(Boolean))].sort(byText);
  const revisions = revisionOptions(rows, iso), phases = phaseOptions(rows);
  const firstOf = (group: string) => materialsOfGroup(materials, group)[0]?.id ?? '';
  const startGroup = saved.group && groups.includes(saved.group) ? saved.group : '';
  const [group, setGroup] = useState(startGroup), [materialId, setMaterialId] = useState(() => firstOf(startGroup)), [quantity, setQuantity] = useState<number | ''>(() => saved.quantity ? Number(saved.quantity) : '');
  const [revisionId, setRevision] = useState(revisions[0]?.value ?? ''), [phaseId, setPhase] = useState(() => phases.some(phase => phase.value === saved.phaseId) ? saved.phaseId! : phases[0]?.value ?? '');
  const inGroup = materialsOfGroup(materials, group), chosen = inGroup.find(item => item.id === materialId), phase = phases.find(item => item.value === phaseId);
  return <Form title={ADD_MATERIAL_DIALOG.title} subtitle={`Take a material from the database for ${text(iso.isoNo)}.`} onClose={onClose} busy={busy} error={error} fields={fields} submit={ADD_MATERIAL_DIALOG.submit} onSubmit={event => { event.preventDefault(); writeSaved({ group, phaseId, quantity: String(quantity) }); void submit({ source: 'Catalog', materialGroup: group, materialId, quantity: quantityOf(quantity), revisionId, phaseId }, rules); }}>
    <div className="full-width mto-selected" role="status">{group ? <>Selected Material Group: <strong>{group}</strong> · Material: <strong>{chosen?.label ?? '—'}</strong> · Type: <strong>{phase?.label ?? '—'}</strong></> : 'Nothing selected yet'}</div>
    <FieldInput field={{ name: 'quantity', label: 'Quantity', type: 'number', required: true, min: ADD_MATERIAL_DIALOG.quantityMin, step: 0.01 }} value={quantity} onChange={value => setQuantity(value as number | '')} error={fields.quantity}/>
    <Choice label="Revision" value={revisionId} onChange={setRevision} options={revisions} empty={revisions.length ? null : 'No revision'} required={revisions.length > 0} error={fields.revisionId}/>
    <Choice label="Type" value={phaseId} onChange={setPhase} options={phases} empty={null} required error={fields.phaseId}/>
    <SearchChoice label="Material group" placeholder="Search material group" empty="No material groups found." options={groups.map(value => ({ value, label: value }))} value={group} onChange={value => { setGroup(value); setMaterialId(firstOf(value)); }} error={fields.materialGroup} required/>
    <SearchChoice label="Material" placeholder="Search material" empty={group ? 'No materials found.' : 'Choose a material group first.'} options={inGroup.map(item => ({ value: item.id, label: item.label }))} value={materialId} onChange={setMaterialId} error={fields.materialId} required/>
  </Form>;
}

/** Add custom material (reference "Add material"): the reference fields in the reference order, optionally also saved to the Material database. */
function AddCustomMaterial({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows } = useWorkspace(); const { error, fields, busy, submit } = useAddMaterial(iso, onClose); const rules = useInputRules(iso);
  const uoms = activeRows(rows, 'uoms').map(row => text(row.name)), revisions = revisionOptions(rows, iso);
  const [values, setValues] = useState<Record<string, unknown>>({ materialGroup: '', articleNo: '', legacyNo: '', materialNo: '', dia: '', lbs: '', phaseId: phaseOptions(rows)[0]?.value ?? '', price: '', quantity: '', uom: uoms.includes(DEFAULT_UOM) || !uoms.length ? DEFAULT_UOM : uoms[0], revisionId: revisions[0]?.value ?? '', chargeNo: '', description: '', addToDB: false });
  const [chargeTerm, setChargeTerm] = useState('');
  const set = (name: string) => (value: unknown) => setValues(old => ({ ...old, [name]: value }));
  const str = (name: string) => text(values[name]);
  const groups = [...new Set(activeRows(rows, 'materials').map(row => text(row.materialGroup)).filter(Boolean))].sort(byText);
  const charges = chargeNumberOptions(activeRows(rows, 'certifications').map(row => text(row.chargeNo)), chargeTerm);
  const input = (name: string, label: string, extra: Partial<{ required: boolean; type: 'text' | 'number'; step: number }> = {}) => <FieldInput field={{ name, label, type: extra.type || 'text', required: extra.required, step: extra.step, min: undefined }} value={values[name]} onChange={set(name)} error={fields[name]}/>;
  return <Form title={ADD_MATERIAL_DIALOG.title} subtitle={`Enter a material that is not in the database for ${text(iso.isoNo)}.`} onClose={onClose} busy={busy} error={error} fields={fields} submit={ADD_MATERIAL_DIALOG.submit}
    onSubmit={event => { event.preventDefault(); void submit({ source: 'Custom', ...values, quantity: quantityOf(values.quantity), price: quantityOf(values.price), addToDB: Boolean(values.addToDB) }, { ...rules, requireGroup: true }); }}>
    <div className="field"><label htmlFor="custom-group">Material group<span className="required"> *</span></label><input id="custom-group" list="custom-group-options" required autoComplete="off" value={str('materialGroup')} aria-invalid={Boolean(fields.materialGroup)} onChange={event => set('materialGroup')(event.target.value)}/><datalist id="custom-group-options">{groups.map(group => <option key={group} value={group}/>)}</datalist>{fields.materialGroup && <small className="field-error">{fields.materialGroup}</small>}</div>
    {input('articleNo', 'Article No')}{input('legacyNo', 'Legacy No')}{input('materialNo', 'Material No', { required: true })}{input('dia', 'DIA')}{input('lbs', 'LBS/SCH')}
    <Choice label="Type" value={str('phaseId')} onChange={set('phaseId')} options={phaseOptions(rows)} empty={null} required error={fields.phaseId}/>
    {input('price', 'Price', { type: 'number' })}
    {input('quantity', 'Quantity', { required: true, type: 'number', step: 0.01 })}
    {uoms.length ? <Choice label="UOM" value={str('uom')} onChange={set('uom')} options={uoms.map(value => ({ value, label: value }))} empty={null} error={fields.uom}/> : input('uom', 'UOM')}
    <Choice label="Revision" value={str('revisionId')} onChange={set('revisionId')} options={revisions} empty={revisions.length ? null : 'No revision'} required={revisions.length > 0} error={fields.revisionId}/>
    <ChargeNumber value={str('chargeNo')} onChange={set('chargeNo')} options={charges} term={chargeTerm} onAutoFill={() => setChargeTerm(str('materialNo'))}/>
    <div className="full-width">{input('description', 'Material description', { required: true })}</div>
    <div className="full-width"><FieldInput field={{ name: 'addToDB', label: 'Also add material to Material DB', type: 'checkbox' }} value={values.addToDB} onChange={set('addToDB')} error={fields.addToDB}/></div>
  </Form>;
}

/** Charge number select with "Auto fill": the button narrows the list to the charge numbers that contain the typed Material No (nothing is looked up or filled in). */
function ChargeNumber({ value, onChange, options, term, onAutoFill }: { value: string; onChange: (value: string) => void; options: string[]; term: string; onAutoFill: () => void }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>Charge number</label><div className="mto-charge-row"><div className="select-wrap"><select id={id} value={value} onChange={event => onChange(event.target.value)}><option value="">-----</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={14}/></div><button type="button" className="btn" onClick={onAutoFill}>Auto fill</button></div>{term && <small className="field-hint">{options.length ? `Charge numbers containing ${term}.` : 'No results found.'}</small>}</div>;
}

/** Edit material (row pencil): the reference's fields; only Type, Component code, UOM and Charge number can be changed, the rest is shown read-only. */
function EditIsoMaterialDialog({ line, onClose }: { line: Row; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const material = materialRecord(rows, line) || line;
  const uoms = activeRows(rows, 'uoms').map(row => text(row.name)), currentUom = text(line.uom) || text(material.uom), code = text(line.componentCode) || text(material.componentCode);
  const [phaseId, setPhase] = useState(text(line.phaseId)), [componentCode, setCode] = useState(['1', '2', '3'].includes(code) ? code : ''), [uom, setUom] = useState(currentUom), [chargeNo, setCharge] = useState(text(line.chargeNo)), [chargeTerm, setChargeTerm] = useState('');
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const charges = chargeNumberOptions([...activeRows(rows, 'certifications').map(row => text(row.chargeNo)), chargeNo], chargeTerm);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    const changes: Record<string, string> = {};
    if (phaseId !== text(line.phaseId)) changes.phaseId = phaseId;
    if (componentCode !== (['1', '2', '3'].includes(code) ? code : '')) changes.componentCode = componentCode;
    if (uom !== currentUom) changes.uom = uom;
    if (chargeNo !== text(line.chargeNo)) changes.chargeNo = chargeNo;
    if (!Object.keys(changes).length) { onClose(); return; }
    setBusy(true);
    try { await post('/actions/edit-iso-material', { requirementId: line.id, expectedVersion: line._version, ...changes }); await refresh(); notify('Material updated.'); onClose(); }
    catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Form title="Edit material" subtitle={text(material.materialNo)} onClose={onClose} busy={busy} error={error} fields={problems} submit="Update" onSubmit={event => void submit(event)}>
    <ReadOnly label="Material group" value={text(material.materialGroup)}/><ReadOnly label="Article No" value={text(material.articleNo)}/><ReadOnly label="Legacy No" value={text(material.legacyNo)}/><ReadOnly label="Material No" value={text(material.materialNo)}/><ReadOnly label="DIA" value={text(material.dia)}/><ReadOnly label="LBS/SCH" value={text(material.lbs)}/>
    <Choice label="Type" value={phaseId} onChange={setPhase} options={phaseOptions(rows)} empty={null} required error={problems.phaseId}/>
    <Choice label="Component code (ISO progress) (1=pipe, 2=supports, 3=appendages)" value={componentCode} onChange={setCode} options={['1', '2', '3'].map(value => ({ value, label: value }))} empty="----------" error={problems.componentCode}/>
    <ReadOnly label="Quantity" value={formatNumber(line.quantity, 3)}/>
    <Choice label="UOM" value={uom} onChange={setUom} options={[...new Set([...uoms, currentUom].filter(Boolean))].map(value => ({ value, label: value }))} empty={null} error={problems.uom}/>
    <ChargeNumber value={chargeNo} onChange={setCharge} options={charges} term={chargeTerm} onAutoFill={() => setChargeTerm(text(material.materialNo))}/>
    <div className="full-width"><ReadOnly label="Material description" value={text(material.description)}/></div>
  </Form>;
}

/** Set type for the checked rows (reference: one required "Type" select, button Update). */
function SetTypeDialog({ lines, onClose }: { lines: Row[]; onClose: (done: boolean) => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const [phaseId, setPhase] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!phaseId) { setError('Choose a type.'); return; }
    setBusy(true); setError('');
    try { await post('/actions/set-material-type', { requirementIds: lines.map(line => line.id), phaseId }); await refresh(); notify(`Type set for ${lines.length} ${lines.length === 1 ? 'material' : 'materials'}.`); onClose(true); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Form title={SET_TYPE_DIALOG.title} onClose={() => onClose(false)} onSubmit={event => void submit(event)} busy={busy} error={error} submit={SET_TYPE_DIALOG.submit}>
    <Choice label="Type" value={phaseId} onChange={setPhase} options={phaseOptions(rows, phasesByName)} empty={SET_TYPE_DIALOG.placeholder} required error={error && !phaseId ? error : undefined}/>
  </Form>;
}

/** Delete one or the checked lines: they are archived and can be restored. The server refuses a line that has an order. */
function DeleteLinesDialog({ lines, onClose }: { lines: Row[]; onClose: (done: boolean) => void }) {
  const { refresh, notify } = useWorkspace();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError('');
    try { await post('/actions/archive-iso-materials', { requirementIds: lines.map(line => line.id) }); await refresh(); notify(`${lines.length} ${lines.length === 1 ? 'material' : 'materials'} deleted.`); onClose(true); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={lines.length === 1 ? 'Delete material' : 'Delete selected materials?'} subtitle={`${lines.length} ${lines.length === 1 ? 'material' : 'checked materials'}`} onClose={() => onClose(false)}>
    <div className="modal-body">{error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}<p>Are you sure?</p><p className="muted">The materials leave this isometric. Their history stays, and they can be restored from the Materials list. A material that is ordered cannot be deleted.</p></div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={() => onClose(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy && <Loader2 size={15} className="spin"/>}Delete</button></div>
  </Modal>;
}

/** The stock detail the Inv. truck opens: the order of the line, what arrived on it, and the receipts of that order. */
function OrderDetailsDialog({ requirementId, onClose }: { requirementId: string; onClose: () => void }) {
  const { rows, label, activity } = useWorkspace();
  const details = useMemo(() => orderDetails(rows, requirementId), [rows, requirementId]);
  if (!details) return null;
  const who = (id: string) => activity.find(event => event.entityType === 'receipts' && event.entityId === id)?.actorName || '—';
  const item = (name: string, value: ReactNode) => <div className="mto-detail-item"><dt>{name}</dt><dd>{value}</dd></div>;
  return <Modal title="Details" onClose={onClose} wide><div className="modal-body mto-order-details">
    <dl className="mto-detail-summary">{item('Material No', <>{details.materialNo}<br/><span className="muted">{details.description}</span></>)}{item('Ord. No.', details.orderNo)}{item('Date', details.orderDate ? formatDate(details.orderDate) : '-')}{item('Ordered on this ISO', formatNumber(details.orderedOnIso, 2))}{details.showOrderedInOrder && item('Ordered in this order', formatNumber(details.orderedInOrder, 2))}{item('Received in this order', formatNumber(details.receivedInOrder, 2))}{item('Inventory on site', formatNumber(details.inventory, 2))}</dl>
    <div><h3>Audit trail</h3><TableScroll><table className="data-table"><thead><tr><th>Date</th><th>Order No.</th><th className="number-cell">Quantity</th><th>Supplier</th><th>Action</th><th>User</th></tr></thead>
      <tbody>{details.history.map(entry => <tr key={entry.id}><td>{formatDate(entry.date)}</td><td>{entry.orderNo}</td><td className="number-cell">{formatNumber(entry.quantity, 2)}</td><td>{entry.supplierId ? label('suppliers', entry.supplierId) : '—'}</td><td>{entry.action}</td><td>{who(entry.id)}</td></tr>)}</tbody></table></TableScroll>
      {!details.history.length && <p className="muted">No receipts yet.</p>}</div>
  </div><div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div></Modal>;
}

/** Material status per revision: the quantity changes booked against each ISO revision (the reference reads a sentence while there are none). */
function MaterialStatusByRevisionDialog({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows } = useWorkspace();
  const groups = useMemo(() => materialStatusByRevision(rows, iso.id), [rows, iso.id]);
  return <Modal title="Material status per revision" subtitle={text(iso.isoNo)} onClose={onClose}><div className="modal-body">
    {!groups.length ? <p>{NO_REVISION_CHANGES}</p> : groups.map(group => <section key={group.revisionId} aria-label={`Revision ${group.revNo}`}><h3>Revision {group.revNo}{group.comment ? ` ${group.comment}` : ''}</h3>
      <TableScroll><table className="data-table"><thead><tr><th>Material No</th><th>Description</th><th className="number-cell">Quantity removed</th><th>Date</th></tr></thead><tbody>{group.changes.map((change, index) => <tr key={`${change.requirementId}-${index}`}><td>{change.materialNo}</td><td className="description-cell">{change.description}</td><td className="number-cell">{formatNumber(change.removed, 2)}</td><td>{formatDate(change.date)}</td></tr>)}</tbody></table></TableScroll></section>)}
  </div><div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div></Modal>;
}

interface IsoImportPreview { rows: IsoImportRow[]; summary: { total: number; valid: number; errors: number } }
/** Import in ISO: an Excel file (template to download) becomes material lines of this isometric; every row is checked in a preview first. */
function ImportInIsoDialog({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const fileId = useId();
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<IsoImportPreview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!file) { setError('Choose an Excel file (.xlsx).'); return; }
    setBusy(true);
    try { const body = new FormData(); body.set('file', file); body.set('isoId', iso.id); setPreview(await api<IsoImportPreview>('/iso-material-import/preview', { method: 'POST', body })); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true); setError('');
    try { const result = await post<{ committed: number; failed: number }>('/iso-material-import/commit', { isoId: iso.id, rows: preview.rows.map(row => ({ rowNo: row.rowNo, values: row.values })) }); await refresh(); notify(`${result.committed} ${result.committed === 1 ? 'material' : 'materials'} imported${result.failed ? `, ${result.failed} skipped` : ''}.`); onClose(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Import in ISO" subtitle={`Import materials from Excel into ${text(iso.isoNo)}.`} onClose={onClose} wide>
    <form noValidate onSubmit={event => void check(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="field"><label htmlFor={fileId}>Excel file</label><input id={fileId} type="file" accept=".xlsx" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); }}/></div>
      <p className="material-import-templates"><a className="text-link" href={apiUrl(`/iso-material-import/template?isoId=${encodeURIComponent(iso.id)}`)}><Download size={14}/> Download Excel template</a></p>
      {preview && <><p role="status">{preview.summary.valid} of {preview.summary.total} rows can be imported{preview.summary.errors ? `, ${preview.summary.errors} with errors are skipped` : ''}.</p>
        <TableScroll><table className="data-table material-import-table"><thead><tr><th>Row</th>{ISO_IMPORT_COLUMNS.filter(column => column.field !== 'spool').map(column => <th key={column.field}>{column.header}</th>)}<th>Check</th></tr></thead>
          <tbody>{preview.rows.map(row => <tr key={row.rowNo}><td>{row.rowNo}</td>{ISO_IMPORT_COLUMNS.filter(column => column.field !== 'spool').map(column => <td key={column.field} className={row.error[column.field] ? 'mi-error-cell' : undefined}>{row.values[column.field] || '—'}</td>)}<td>{Object.values(row.error).join(' ') || (row.source === 'Catalog' ? 'From the database' : 'Custom material')}</td></tr>)}</tbody></table></TableScroll></>}
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
      {preview ? <button type="button" className="btn primary" disabled={busy || !preview.summary.valid} onClick={() => void commit()}>{busy && <Loader2 size={15} className="spin"/>}Import {preview.summary.valid} {preview.summary.valid === 1 ? 'material' : 'materials'}</button>
        : <button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Import</button>}</div></form>
  </Modal>;
}
