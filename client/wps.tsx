import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Copy, Globe, Loader2, Pause, Pencil, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import {
  WPS_ALL_PROJECTS, WPS_DOCUMENT_TYPE, WPS_GROUP_FIELDS, WPS_GROUP_HINT, WPS_METHOD_PLACEHOLDER, WPS_PAGE_SIZES, WPS_RANGE_FIELDS, WPS_RANGE_NAMES, WPS_SITE_COLUMN, WPS_TABS, WPS_VARIANTS,
  enableOnSiteLabel, isWpsCopy, tagText, tagValues, wpsDocument, wpsEnabledOnSite, wpsProjectSelection, wpsProjectValues, wpsSiteChange, wpsSiteStatus,
  wpsTab, wpsTabCounts, wpsVariant, type WpsTab, type WpsVariant,
} from '../shared/wps.ts';
import { RELATIONS, relationIds } from './catalog.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { api, post, apiUrl, ApiError } from './api.ts';
import { Badge, Dropdown, EmptyState, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';

/**
 * Weld Pilot → Weld data → WPS methods (hosted profile): the list per project site with Active / Inactive / Deleted,
 * Originals / Copies, "Enabled on this site", row and bulk activation, copy to another project site, mass copy and
 * global deactivate (rules in shared/wps.ts, enforced by server/wps.ts).
 */
type Column = 'name' | 'method' | 'definition' | 'jointType';
const COLUMNS: [Column, string][] = [['name', 'WPS number'], ['method', 'Weld process'], ['definition', 'WPS definition'], ['jointType', 'Joint type']];
type Bulk = 'activate' | 'deactivate' | 'copy' | 'global';
const str = (value: unknown) => value === null || value === undefined ? '' : String(value);
/** A typed range value as the record API takes it: a number, '' for none, or the text itself when it is no number (the server names the field). */
const rangeValue = (value: unknown) => { const raw = str(value).trim().replace(',', '.'); return raw === '' || Number.isNaN(Number(raw)) ? str(value).trim() : Number(raw); };

export function WpsPage() {
  const { rows, allRows, siteId, canRecord, label } = useWorkspace();
  const [tab, setTab] = useState<WpsTab>('active'); const [variant, setVariant] = useState<WpsVariant>('originals');
  const [q, setQ] = useState(''); const [page, setPage] = useState(0); const [size, setSize] = useState(25);
  const [sort, setSort] = useState<{ column: Column; direction: 1 | -1 }>({ column: 'name', direction: 1 });
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<Row | 'new' | null>(null); const [archiving, setArchiving] = useState<Row | null>(null);
  const [copying, setCopying] = useState<Row[] | null>(null); const [bulk, setBulk] = useState<Bulk | null>(null); const [toggling, setToggling] = useState<{ row: Row; enabled: boolean } | null>(null);
  const site = (allRows.sites || []).find(row => row.id === siteId);
  const all = rows.wps || [];
  const counts = useMemo(() => wpsTabCounts(rows, siteId, variant), [rows, siteId, variant]);
  const listed = useMemo(() => {
    const query = q.toLowerCase().trim();
    return all.filter(row => wpsVariant(row) === variant && wpsTab(rows, row, siteId) === tab && (!query || COLUMNS.some(([column]) => str(row[column]).toLowerCase().includes(query))))
      .sort((a, b) => str(a[sort.column]).localeCompare(str(b[sort.column]), 'en', { numeric: true }) * sort.direction);
  }, [all, rows, siteId, variant, tab, q, sort]);
  const pages = Math.max(1, Math.ceil(listed.length / size)), current = Math.min(page, pages - 1), shown = listed.slice(current * size, (current + 1) * size);
  const checked = all.filter(row => selected.includes(row.id) && !row._archived);
  if (!canRecord('wps')) return <EmptyState title="This area is restricted" description="Your profile does not include WPS methods."/>;
  if (!siteId || !site) return <EmptyState title="Choose a main project" description="WPS methods are switched on per main project. Choose the main project you work on first."/>;
  const editable = canRecord('wps', 'edit'), creatable = canRecord('wps', 'insert'), deletable = canRecord('wps', 'delete');
  const reset = (next: () => void) => { next(); setPage(0); setSelected([]); };
  const toggleSort = (column: Column) => setSort(old => ({ column, direction: old.column === column && old.direction === 1 ? -1 : 1 }));
  return <div className="page records-page wps-page">
    <div className="page-heading"><div><div className="eyebrow">WELD DATA</div><h1>WPS methods<span className="heading-count">{counts.active + counts.inactive}</span></h1><p>Welding procedure specifications, switched on per main project.</p></div>
      <div className="heading-actions">
        {checked.length > 0 && (editable || creatable) && <Dropdown label="Options for the checked WPS methods" trigger={<span className="btn">Options<ChevronDown size={14}/></span>}>
          {editable && <button onClick={() => setBulk('activate')}><Play size={14}/>Activate selected</button>}
          {editable && <button onClick={() => setBulk('deactivate')}><Pause size={14}/>Deactivate selected</button>}
          {creatable && <button onClick={() => setCopying(checked)}><Copy size={14}/>Mass copy WPS</button>}
          {editable && <button onClick={() => setBulk('global')}><Globe size={14}/>Global deactivate</button>}
        </Dropdown>}
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add WPS method</button>}
      </div></div>
    <div className="table-card">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="WPS status on this site">{WPS_TABS.map(item => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'selected' : ''} onClick={() => reset(() => setTab(item.key))}>{item.label}<span aria-label={`${counts[item.key]} WPS methods`}>{counts[item.key]}</span></button>)}</div>
        <div className="wps-view" role="group" aria-label="View">{WPS_VARIANTS.map(item => <button key={item.key} className={`btn small ${variant === item.key ? 'active-filter' : 'subtle'}`} aria-pressed={variant === item.key} onClick={() => reset(() => setVariant(item.key))}>{item.label}</button>)}</div></div>
      <div className="wps-context"><span>Home location: <strong>{str(site.name)}</strong></span><span>View: <strong>{variant === 'copies' ? 'Copies' : 'Originals'}</strong></span><span className="muted">Status and counts are for this view and this main project.</span></div>
      <div className="table-toolbar"><SearchInput value={q} onChange={value => reset(() => setQ(value))} placeholder="Search WPS methods…"/></div>
      {checked.length > 0 && <div className="selection-bar"><strong>{checked.length} selected</strong><span>Use Options to activate, deactivate or copy them.</span><button className="clear-selection" onClick={() => setSelected([])}><X size={14}/>Clear</button></div>}
      <TableScroll><table className="data-table"><thead><tr>
        <th className="select-cell"><input type="checkbox" aria-label="Select all WPS methods on this page" disabled={tab === 'deleted'} checked={tab !== 'deleted' && shown.length > 0 && shown.every(row => selected.includes(row.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...shown.map(row => row.id)])] : old.filter(id => !shown.some(row => row.id === id)))}/></th>
        {COLUMNS.map(([column, title]) => <th key={column} aria-sort={sort.column === column ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => toggleSort(column)}>{title}<ArrowUpDown size={12} className={sort.column === column ? 'sort-active' : ''}/></button></th>)}
        <th>{WPS_SITE_COLUMN}</th><th className="wps-options-cell">Options</th></tr></thead>
        <tbody>{shown.map(row => { const document = wpsDocument(rows.attachments, row.id); const status = wpsSiteStatus(rows, row, siteId); const enabled = wpsEnabledOnSite(rows, row, siteId); const copy = isWpsCopy(row); return <tr key={row.id} className={selected.includes(row.id) ? 'row-selected' : ''}>
          <td className="select-cell"><input type="checkbox" aria-label={`Select WPS ${str(row.name)}`} disabled={row._archived} checked={selected.includes(row.id)} onChange={event => setSelected(old => event.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))}/></td>
          <td>{document ? <a className="record-link wps-document-link" href={apiUrl(`/files/${document.id}`)} target="_blank" rel="noreferrer" title="Open the WPS document (PDF)">{str(row.name)}</a> : <strong className="wps-number">{str(row.name)}</strong>}{copy && <small className="wps-copy-of">Copy of {label('wps', row.sourceId)}</small>}</td>
          {COLUMNS.slice(1).map(([column]) => <td key={column} className={column === 'definition' ? 'description-cell' : ''} title={column === 'definition' ? str(row[column]) : undefined}>{str(row[column]) || <span className="muted">—</span>}</td>)}
          <td>{status === 'No' ? <Badge color="red">No</Badge> : <Badge color="green">{status}</Badge>}</td>
          <td className="wps-options-cell"><div className="wps-row-actions">
            {row._archived ? deletable && <button className="icon-btn" aria-label={`Restore WPS ${str(row.name)}`} title="Restore" onClick={() => setArchiving(row)}><RotateCcw size={15}/></button> : <>
              {creatable && <button className={`icon-btn ${copy ? 'wps-copy-locked' : ''}`} disabled={copy} aria-label={copy ? `WPS ${str(row.name)} is a copy and cannot be copied again` : `Copy WPS ${str(row.name)} to another project site`} title={copy ? 'A copy cannot be copied again' : 'Copy'} onClick={() => setCopying([row])}><Copy size={15}/></button>}
              {editable && <button className="icon-btn" aria-label={`Edit WPS ${str(row.name)}`} title="Edit" onClick={() => setEditor(row)}><Pencil size={15}/></button>}
              {editable && <button className="icon-btn" aria-label={`${enabled ? 'Deactivate' : 'Activate'} WPS ${str(row.name)} on this site`} title={enabled ? 'Deactivate' : 'Activate'} onClick={() => setToggling({ row, enabled: !enabled })}>{enabled ? <Pause size={15}/> : <Play size={15}/>}</button>}
              {deletable && <button className="icon-btn" aria-label={`Delete WPS ${str(row.name)}`} title="Delete" onClick={() => setArchiving(row)}><Trash2 size={15}/></button>}
            </>}
          </div></td></tr>; })}</tbody></table></TableScroll>
      {!listed.length && <EmptyState title={q ? 'No matching WPS methods' : tab === 'deleted' ? 'No deleted WPS methods' : tab === 'inactive' ? 'No inactive WPS methods' : variant === 'copies' ? 'No copies active here' : 'No active WPS methods'} description={q ? 'Try another search.' : tab === 'active' ? `WPS methods enabled on ${str(site.name)} appear here.` : 'WPS methods appear here when their status on this main project changes.'} action={q ? <button className="btn" onClick={() => reset(() => setQ(''))}>Clear search</button> : creatable && tab === 'active' && variant === 'originals' ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add WPS method</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{listed.length ? `${current * size + 1}–${Math.min((current + 1) * size, listed.length)}` : '0'} of {listed.length} WPS methods</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{WPS_PAGE_SIZES.map(value => <option key={value}>{value}</option>)}</select><button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {editor && <WpsEditor record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="wps" record={archiving} onClose={() => setArchiving(null)} onSaved={() => setSelected([])}/>}
    {copying && <CopyDialog records={copying} onClose={() => setCopying(null)} onDone={() => setSelected([])}/>}
    {toggling && <ConfirmDialog title={toggling.enabled ? 'Activate on this site' : 'Deactivate on this site'} text={`WPS ${str(toggling.row.name)} will be ${toggling.enabled ? 'activated' : 'deactivated'} on ${str(site.name)}. Other main projects keep their setting.`} url="/wps/site" body={{ ids: [toggling.row.id], siteId, enabled: toggling.enabled }} done={`WPS ${toggling.enabled ? 'activated' : 'deactivated'} on ${str(site.name)}.`} onClose={() => setToggling(null)}/>}
    {bulk && bulk !== 'copy' && <ConfirmDialog danger={bulk === 'global'} title={bulk === 'activate' ? 'Activate selected' : bulk === 'deactivate' ? 'Deactivate selected' : 'Global deactivate WPS'}
      text={bulk === 'activate' ? 'By clicking ‘Confirm,’ you will activate the selected options.' : bulk === 'deactivate' ? 'By clicking ‘Confirm,’ you will deactivate the selected options.' : 'Warning: This will deactivate the selected WPS methods on all sites, not just the current site. Are you sure you want to proceed?'}
      url={bulk === 'global' ? '/wps/global-deactivate' : '/wps/site'} body={bulk === 'global' ? { ids: checked.map(row => row.id) } : { ids: checked.map(row => row.id), siteId, enabled: bulk === 'activate' }}
      done={`${checked.length} WPS ${checked.length === 1 ? 'method' : 'methods'} ${bulk === 'activate' ? 'activated' : 'deactivated'}${bulk === 'global' ? ' on every main project' : ` on ${str(site.name)}`}.`} list={checked.map(row => str(row.name))}
      onClose={() => setBulk(null)} onDone={() => setSelected([])}/>}
  </div>;
}

function ConfirmDialog({ title, text, url, body, done, list, danger = false, onClose, onDone }: { title: string; text: string; url: string; body: unknown; done: string; list?: string[]; danger?: boolean; onClose: () => void; onDone?: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try { await post(url, body); await refresh(); notify(done); onDone?.(); onClose(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={title} onClose={onClose}><div className="modal-body">{error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}<p className={danger ? 'wps-danger-text' : undefined}>{text}</p>{list && list.length > 0 && <ul className="wps-confirm-list">{list.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className={`btn primary ${danger ? 'wps-danger' : ''}`} disabled={busy} onClick={() => void confirm()}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div></Modal>;
}

/**
 * The project sites the Copy dialogs list (row copy and Mass Copy alike): every active project site in the order they were
 * created, and the one preselected is the current main project (the reference lists them in id order with the current one chosen).
 */
export function copyTargets(sites: Row[], siteId: string): { sites: Row[]; selected: string } {
  const listed = sites.filter(site => !site._archived).sort((a, b) => str(a._createdAt).localeCompare(str(b._createdAt)) || str(a.id).localeCompare(str(b.id), 'en', { numeric: true }));
  return { sites: listed, selected: listed.some(site => site.id === siteId) ? siteId : listed[0]?.id || '' };
}
/** "Copy WPS to another Project site" (one row) and "Mass Copy WPS" (the checked rows). */
function CopyDialog({ records, onClose, onDone }: { records: Row[]; onClose: () => void; onDone: () => void }) {
  const { allRows, siteId, refresh, notify } = useWorkspace();
  const mass = records.length > 1;
  // Both copies offer every project site in creation order with the current main project chosen, as the reference does.
  const { sites, selected } = copyTargets(activeRows(allRows, 'sites'), siteId);
  const [target, setTarget] = useState(selected); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const copies = records.filter(row => isWpsCopy(row));
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('/wps/copy', { ids: records.map(row => row.id), siteId: target }); await refresh(); notify(`${records.length} WPS ${records.length === 1 ? 'method' : 'methods'} copied to ${str(sites.find(site => site.id === target)?.name)}.`); onDone(); onClose(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={mass ? 'Mass Copy WPS' : 'Copy WPS to another Project site'} onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {mass && <p>Are you sure?</p>}
    {copies.length > 0 && <div className="alert error" role="alert"><AlertCircle size={18}/><span>A copy cannot be copied again: {copies.map(row => str(row.name)).join(', ')}. Uncheck it first.</span></div>}
    {sites.length ? <div className="field"><div className="select-wrap"><select id="wps-copy-site" aria-label="Project site" required value={target} onChange={event => setTarget(event.target.value)}>{sites.map(site => <option key={site.id} value={site.id}>{str(site.name)}</option>)}</select><ChevronDown size={14}/></div></div>
      : <p>There is no project site to copy to.</p>}
  </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !target || copies.length > 0}>{busy && <Loader2 size={15} className="spin"/>}Copy</button></div></form></Modal>;
}

/** A multi-value field: choose from the list or type a value that is not in it (Enter or comma adds it). */
function TagInput({ id, label, options, value, onChange }: { id: string; label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(''); const values = tagValues(value);
  const add = (item: string) => { const next = item.replace(/,/g, ' ').trim(); if (next) onChange(tagText([...values, next])); setDraft(''); };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(draft); }
    else if (event.key === 'Backspace' && !draft && values.length) onChange(tagText(values.slice(0, -1)));
  };
  return <div className="field full-width"><label htmlFor={id}>{label}</label>
    <div className="wps-tags">{values.map(item => <span key={item} className="wps-tag">{item}<button type="button" aria-label={`Remove ${item} from ${label}`} onClick={() => onChange(tagText(values.filter(other => other !== item)))}><X size={12}/></button></span>)}
      <input id={id} type="text" list={`${id}-options`} placeholder="Choose or type" value={draft} onChange={event => { const next = event.target.value; if (options.includes(next)) add(next); else setDraft(next); }} onKeyDown={key} onBlur={() => add(draft)} autoComplete="off"/>
      <datalist id={`${id}-options`}>{options.filter(option => !values.includes(option)).map(option => <option key={option} value={option}/>)}</datalist></div>
  </div>;
}

/** "Add WPS method" / "Edit WPS method" in the reference's order. */
export function WpsEditor({ record, onClose }: { record?: Row; onClose: () => void }) {
  const { rows, allRows, siteId, label, refresh, notify, canRecord } = useWorkspace();
  const projectsRelation = RELATIONS.wps?.find(item => item.field === 'projectIds'), pqrRelation = RELATIONS.wps?.find(item => item.field === 'pqrIds');
  const site = (allRows.sites || []).find(row => row.id === siteId);
  const initial = useMemo(() => ({
    name: str(record?.name), method: str(record?.method), definition: str(record?.definition), jointType: str(record?.jointType),
    ...Object.fromEntries([...WPS_GROUP_FIELDS.map(field => field.name), ...WPS_RANGE_NAMES].map(name => [name, str(record?.[name])])),
    projects: wpsProjectSelection(record, record && projectsRelation ? relationIds(rows, projectsRelation, record.id) : []),
    pqrIds: record && pqrRelation ? relationIds(rows, pqrRelation, record.id) : [] as string[],
    enabled: record ? wpsEnabledOnSite(rows, record, siteId) : false,
  }) as Record<string, unknown> & { projects: string[]; pqrIds: string[]; enabled: boolean }, [record, rows, siteId, projectsRelation, pqrRelation]);
  const [values, setValues] = useState(initial); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  const set = (name: string, value: unknown) => setValues(old => ({ ...old, [name]: value }));
  // Projects of the active main project (the reference lists ALL and the main project's projects); linked ones stay listed.
  const projects = activeRows(rows, 'projects').filter(project => !siteId || project.siteId === siteId || values.projects.includes(project.id));
  const pqrs = activeRows(rows, 'pqr').filter(pqr => canRecord('pqr', 'show', pqr) || values.pqrIds.includes(pqr.id));
  const document = record ? wpsDocument(rows.attachments, record.id) : undefined;
  const toggleProject = (id: string, on: boolean) => set('projects', id === WPS_ALL_PROJECTS ? (on ? [WPS_ALL_PROJECTS] : []) : on ? [...values.projects.filter(item => item !== WPS_ALL_PROJECTS), id] : values.projects.filter(item => item !== id));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setFields({});
    if (file && !/\.pdf$/i.test(file.name)) { setFields({ file: 'Choose a PDF file.' }); setError('Please check the highlighted fields.'); return; }
    const plain = ['name', 'method', 'definition', ...WPS_GROUP_FIELDS.map(field => field.name), 'jointType', ...WPS_RANGE_NAMES];
    // The diameter range (inches) is a number field: the server takes a number, or empty for no limit.
    const payload: Record<string, unknown> = Object.fromEntries(plain.filter(name => !record || values[name] !== initial[name]).map(name => [name, WPS_RANGE_NAMES.includes(name) ? rangeValue(values[name]) : values[name]]));
    if (!record || JSON.stringify(values.projects) !== JSON.stringify(initial.projects)) Object.assign(payload, wpsProjectValues(values.projects));
    if (!record || JSON.stringify(values.pqrIds) !== JSON.stringify(initial.pqrIds)) payload.pqrIds = values.pqrIds;
    if (!record) payload.siteIds = values.enabled && siteId ? [siteId] : [];
    else if (values.enabled !== initial.enabled && siteId) Object.assign(payload, wpsSiteChange(rows, record, siteId, values.enabled));
    setBusy(true);
    try {
      let id = record?.id;
      if (!record || Object.keys(payload).length) { const saved = await api<{ record: Row }>(`/records/wps${record ? `/${record.id}` : ''}`, { method: record ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, ...(record ? { _version: record._version } : {}) }) }); id = saved.record.id; }
      if (file && id) {
        const body = new FormData(); body.set('file', file); body.set('entityType', 'wps'); body.set('entityId', id); body.set('documentType', WPS_DOCUMENT_TYPE);
        try { await api('/files', { method: 'POST', body }); }
        catch (failure) { await refresh(); setError(`The WPS method was saved, but the document was not uploaded: ${(failure as Error).message}`); setBusy(false); return; }
      }
      await refresh(); notify(`WPS method ${record ? 'updated' : 'created'}.`); onClose();
    } catch (failure) { setError((failure as Error).message); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const text = (name: string, title: string, required = false, placeholder?: string) => <div className="field"><label htmlFor={`wps-${name}`}>{title}{required && <span className="required"> *</span>}</label><input id={`wps-${name}`} name={name} type="text" required={required} placeholder={placeholder} value={str(values[name])} aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `wps-${name}-error` : undefined} onChange={event => set(name, event.target.value)}/>{fields[name] && <small id={`wps-${name}-error`} className="field-error">{fields[name]}</small>}</div>;
  return <Modal title={record ? 'Edit WPS method' : 'Add WPS method'} subtitle={record ? str(record.name) : undefined} onClose={onClose} wide><form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="form-grid">
      {text('name', 'WPS number', true)}{text('method', 'Weld process', !record, record ? undefined : WPS_METHOD_PLACEHOLDER)}
      <div className="full-width">{text('definition', 'WPS definition', true)}</div>
      <p className="field-hint full-width wps-group-hint">{WPS_GROUP_HINT}</p>
      {WPS_GROUP_FIELDS.map(field => <TagInput key={field.name} id={`wps-${field.name}`} label={field.label} options={field.options} value={str(values[field.name])} onChange={value => set(field.name, value)}/>)}
      {text('jointType', 'Joint type')}
      {WPS_RANGE_FIELDS.map(field => <div className="field" key={field.name}><label htmlFor={`wps-${field.name}`}>{field.label}</label><input id={`wps-${field.name}`} name={field.name} type="text" inputMode="decimal" autoComplete="off" aria-invalid={Boolean(fields[field.name])} value={str(values[field.name])} onChange={event => set(field.name, event.target.value)}/><small className="field-hint">{field.hint}</small>{fields[field.name] && <small className="field-error">{fields[field.name]}</small>}</div>)}
      <fieldset className="field full-width wps-choices"><legend>Project</legend><div className="multi-options">
        <label><input type="checkbox" checked={values.projects.includes(WPS_ALL_PROJECTS)} onChange={event => toggleProject(WPS_ALL_PROJECTS, event.target.checked)}/><span>ALL</span></label>
        {projects.map(project => <label key={project.id}><input type="checkbox" disabled={values.projects.includes(WPS_ALL_PROJECTS)} checked={values.projects.includes(project.id)} onChange={event => toggleProject(project.id, event.target.checked)}/><span>{label('projects', project.id)}</span></label>)}
      </div><small className="field-hint">ALL makes the WPS available on every project of the main projects where it is enabled. Nothing chosen: no project.</small>{fields.projectIds && <small className="field-error">{fields.projectIds}</small>}</fieldset>
      <fieldset className="field full-width wps-choices"><legend>PQR</legend><div className="multi-options">{pqrs.length ? pqrs.map(pqr => <label key={pqr.id}><input type="checkbox" checked={values.pqrIds.includes(pqr.id)} onChange={event => set('pqrIds', event.target.checked ? [...values.pqrIds, pqr.id] : values.pqrIds.filter(id => id !== pqr.id))}/><span>{label('pqr', pqr.id)}</span></label>) : <p>No PQRs yet.</p>}</div>{fields.pqrIds && <small className="field-error">{fields.pqrIds}</small>}</fieldset>
      {canRecord('wps', 'import', record) && <div className="field full-width"><label htmlFor="wps-file">Document</label><input id="wps-file" type="file" accept=".pdf,application/pdf" aria-invalid={Boolean(fields.file)} onChange={event => setFile(event.target.files?.[0] || null)}/><small className="field-hint">{document ? `Current: ${str(document.name)}. A new PDF replaces it as the linked document.` : 'PDF. The WPS number links to it in the list.'}</small>{fields.file && <small className="field-error">{fields.file}</small>}</div>}
      {site && <div className="field checkbox-field full-width"><label htmlFor="wps-enabled"><input id="wps-enabled" type="checkbox" checked={values.enabled} onChange={event => set('enabled', event.target.checked)}/><span>{enableOnSiteLabel(str(site.name))}</span></label></div>}
    </div>
  </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{record ? 'Update' : 'Add'}</button></div></form></Modal>;
}
