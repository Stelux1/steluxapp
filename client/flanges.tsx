import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Download, ExternalLink, FileText, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { FLANGE_LIST_COLUMNS, FLANGE_STATUSES, NO_FLANGE_FILTERS, filterFlanges, flangeItems, flangeStandardNotice, flangesCsv, isoFlangeCount, selectedFlanges, type FlangeFilters, type FlangeItem } from '../shared/flanges.ts';
import type { Row } from '../shared/types.ts';
import { ArchiveRecordDialog } from './archive-record.tsx';
import { Badge, Dropdown, EmptyState, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { RecordEditor } from './dialogs.tsx';
import { FlangeLabelsPdfButton, FlangeReportPdfButton } from './pdf-documents.tsx';
import { usePilot } from './pilot.tsx';
import { TablePage } from './records.tsx';

const PAGE_SIZES = [20, 50, 100];

/** Flange Management: the generic table where the profile has no pilots, the dedicated page where it does. */
export function FlangesPage() {
  const { hasFeature } = useWorkspace();
  return hasFeature('pilots') ? <FlangeManagement/> : <TablePage resourceKey="flanges"/>;
}

function FlangeManagement() {
  const { rows, canRecord, openRecord, notify, siteId } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const isoId = params.get('isoId') || '';
  const [filters, setFilters] = useState<FlangeFilters>({ ...NO_FLANGE_FILTERS });
  const [open, setOpen] = useState(false), [page, setPage] = useState(0), [size, setSize] = useState(20);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [deleting, setDeleting] = useState<Row | null>(null);
  const [ticked, setTicked] = useState<string[]>([]), [hiddenColumns, setHiddenColumns] = useState<string[]>(() => FLANGE_LIST_COLUMNS.filter(column => column.hidden).map(column => column.key));
  const items = useMemo(() => flangeItems(activeRows(rows, 'flanges'), activeRows(rows, 'isometrics'), activeRows(rows, 'projects')), [rows]);
  const shown = useMemo(() => filterFlanges(items, { ...filters, isoId }), [items, filters, isoId]);
  const pages = Math.max(1, Math.ceil(shown.length / size)), current = Math.min(page, pages - 1);
  const visible = shown.slice(current * size, (current + 1) * size);
  const projects = activeRows(rows, 'projects');
  const columns = FLANGE_LIST_COLUMNS.filter(column => !hiddenColumns.includes(column.key));
  // What Export, Report and Print labels act on: the ticked flanges that are still in the list.
  const chosen = useMemo(() => selectedFlanges(shown, ticked), [shown, ticked]), chosenIds = chosen.map(item => item.row.id);
  const pageIds = visible.map(item => item.row.id), allTicked = pageIds.length > 0 && pageIds.every(id => chosenIds.includes(id));
  const checkAll = useRef<HTMLInputElement>(null);
  useEffect(() => { if (checkAll.current) checkAll.current.indeterminate = !allTicked && pageIds.some(id => chosenIds.includes(id)); });
  const tick = (ids: string[], on: boolean) => setTicked(old => on ? [...new Set([...old, ...ids])] : old.filter(id => !ids.includes(id)));
  const isoRow = rows.isometrics?.find(row => row.id === isoId);
  const project = projects.find(row => row.id === (filters.projectId || isoRow?.projectId));
  const site = rows.sites?.find(row => row.id === (project?.siteId || siteId)) ?? (rows.sites?.length === 1 ? rows.sites[0] : undefined);
  const notice = flangeStandardNotice(site);
  const filterCount = [filters.projectId, filters.finished, isoId].filter(Boolean).length;
  const change = (patch: Partial<FlangeFilters>) => { setFilters(old => ({ ...old, ...patch })); setPage(0); };
  const clearIso = () => { const next = new URLSearchParams(params); next.delete('isoId'); setParams(next, { replace: true }); setPage(0); };

  if (!canRecord('flanges')) return <EmptyState title="This area is restricted" description="Your permission profile does not include flange records."/>;
  const creatable = canRecord('flanges', 'insert');
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([flangesCsv(chosen)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `flanges-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
    notify(`${chosen.length} flange${chosen.length === 1 ? '' : 's'} exported.`);
  }
  const clear = () => { setFilters({ ...NO_FLANGE_FILTERS }); clearIso(); };

  return <div className="page records-page flanges-page">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>Flange Management<span className="heading-count">{items.length}</span></h1><p>Bolted connections per isometric: bolting, tightening, inspection and commissioning.</p></div>
      <div className="heading-actions">
        {canRecord('flanges', 'export') && <button className="btn" onClick={exportCsv} disabled={!chosen.length} title={chosen.length ? undefined : 'Tick at least one flange first.'}><Download size={16}/>Export</button>}
        <FlangeReportPdfButton ids={chosenIds}/>
        <FlangeLabelsPdfButton ids={chosenIds}/>
        <button className={`btn ${open || filterCount ? 'active-filter' : ''}`} aria-expanded={open} aria-controls="flange-filters" onClick={() => setOpen(v => !v)}><SlidersHorizontal size={16}/>Filter{filterCount > 0 && <span className="count-pill">{filterCount}</span>}</button>
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add flange</button>}
      </div></div>
    <p className={`flange-standard ${notice.catalog ? '' : 'flange-standard-free'}`} role="note"><strong>Tightening standard</strong><span>{notice.standard}</span><small>{notice.message}</small></p>
    <div className="table-card">
      {open && <div id="flange-filters" className="filters-panel" role="group" aria-label="Flange filters">
        <div className="field"><label htmlFor="flange-project">Project</label><select id="flange-project" value={filters.projectId} onChange={e => change({ projectId: e.target.value })}><option value="">All</option>{projects.map(row => <option key={row.id} value={row.id}>{String(row.internnumber || row.description)}</option>)}</select></div>
        <div className="field"><label htmlFor="flange-finished">Finished?</label><select id="flange-finished" value={filters.finished} onChange={e => change({ finished: e.target.value as FlangeFilters['finished'] })}><option value="">--------</option><option>No</option><option>Yes</option></select></div>
      </div>}
      <div className="table-toolbar"><SearchInput value={filters.query} onChange={value => change({ query: value })} placeholder="Search flanges…"/><div className="toolbar-right"><Dropdown trigger={<span className="btn small">Columns<ChevronDown size={12}/></span>} menuClassName="column-picker"><button onClick={() => setHiddenColumns(FLANGE_LIST_COLUMNS.filter(column => column.hidden).map(column => column.key))}>Reset to default columns</button>{FLANGE_LIST_COLUMNS.map(column => <label key={column.key}><input type="checkbox" checked={!hiddenColumns.includes(column.key)} disabled={columns.length === 1 && columns[0].key === column.key} onChange={event => setHiddenColumns(old => event.target.checked ? old.filter(key => key !== column.key) : [...old, column.key])}/>{column.label}</label>)}</Dropdown></div></div>
      {isoId && <div className="applied-filters" aria-label="Applied filters"><span>Filtered by</span><button onClick={clearIso} aria-label="Remove the isometric filter">Isometric {String(isoRow?.isoNo || '')}<X size={12}/></button></div>}
      {shown.length > 0 && <TableScroll><table className="data-table"><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}<th className="actions-cell">Options</th><th className="select-cell"><input ref={checkAll} type="checkbox" title="Select all" aria-label="Select all flanges on this page" checked={allTicked} onChange={event => tick(pageIds, event.target.checked)}/></th></tr></thead>
        <tbody>{visible.map(item => <FlangeRow key={item.row.id} item={item} columns={columns} ticked={chosenIds.includes(item.row.id)} onTick={on => tick([item.row.id], on)} onView={() => openRecord('flanges', item.row.id)} onEdit={() => setEditor(item.row)} onDelete={() => setDeleting(item.row)}/>)}</tbody></table></TableScroll>}
      {!shown.length && (items.length
        ? <EmptyState title="No flanges match your search or filters" description="Try another search or clear your filters." action={<button className="btn" onClick={clear}>Clear search & filters</button>}/>
        : <EmptyState title="No flanges yet" description="Add the first flange of an isometric to start tracking its tightening and inspection." action={creatable ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add flange</button> : undefined}/>)}
      <div className="table-footer"><span role="status" aria-live="polite">{shown.length ? `${current * size + 1}–${Math.min((current + 1) * size, shown.length)}` : '0'} of {shown.length} flanges</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }}>{PAGE_SIZES.map(n => <option key={n}>{n}</option>)}</select>
        <button className="btn small" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button className="btn small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </div>
    {editor && <RecordEditor resourceKey="flanges" record={editor === 'new' ? undefined : editor} defaults={isoId ? { isoId } : {}} onClose={() => setEditor(null)}/>}
    {deleting && <ArchiveRecordDialog resourceKey="flanges" record={deleting} onClose={() => setDeleting(null)}/>}
  </div>;
}

function FlangeRow({ item, columns, ticked, onTick, onView, onEdit, onDelete }: { item: FlangeItem; columns: typeof FLANGE_LIST_COLUMNS; ticked: boolean; onTick: (on: boolean) => void; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const { canRecord } = useWorkspace(); const name = String(item.row.flange_id || 'flange');
  return <tr className={ticked ? 'row-selected' : undefined}>{columns.map(column => <td key={column.key}>{column.key === 'status' ? <Badge>{item.status}</Badge> : column.key === 'flange_id' ? <button className="record-link" onClick={onView}>{String(column.value(item)) || '—'}</button> : column.value(item) === '' ? '—' : column.value(item)}</td>)}
    <td className="actions-cell"><div className="flange-options">
      <button className="icon-btn" aria-label={`View flange ${name}`} title="View" onClick={onView}><ExternalLink size={16}/></button>
      {canRecord('flanges', 'edit', item.row) && <button className="icon-btn" aria-label={`Edit flange ${name}`} title="Edit" onClick={onEdit}><Pencil size={16}/></button>}
      <button className="icon-btn" aria-label={`Documents of flange ${name}`} title="Documents" onClick={onView}><FileText size={16}/></button>
      {canRecord('flanges', 'delete', item.row) && <button className="icon-btn" aria-label={`Delete flange ${name}`} title="Delete" onClick={onDelete}><Trash2 size={16}/></button>}
    </div></td>
    <td className="select-cell"><input type="checkbox" aria-label={`Select flange ${name}`} checked={ticked} onChange={event => onTick(event.target.checked)}/></td></tr>;
}

/** Card on the isometric page: how many flanges the isometric has, by status, and the link to the list. */
export function IsoFlangesCard({ isoId }: { isoId: string }) {
  const { rows, canRecord } = useWorkspace(); const pilot = usePilot();
  if (!rows.flanges || !canRecord('flanges') || (pilot && pilot.pilot.key !== 'weld')) return null;
  const count = isoFlangeCount(rows.flanges, isoId);
  const own = flangeItems(activeRows(rows, 'flanges').filter(row => row.isoId === isoId), [], []);
  const byStatus = FLANGE_STATUSES.map(status => [status, own.filter(item => item.status === status).length] as const).filter(([, n]) => n > 0);
  return <section className="panel iso-flanges" aria-label="Flanges of this isometric"><div><strong>Flanges</strong><span className="count-pill">{count}</span>{byStatus.length > 0 && <small>{byStatus.map(([status, n]) => `${n} ${status.toLowerCase()}`).join(' · ')}</small>}</div>
    <Link className="text-link" to={`/welding/flanges?isoId=${encodeURIComponent(isoId)}`}>{count ? 'Open in Flange Management' : 'Add in Flange Management'}</Link></section>;
}
