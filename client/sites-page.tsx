import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ChevronLeft, ChevronRight, FolderOpen, Pencil, Plus, Printer } from 'lucide-react';
import { SITE_DEFAULT_SORT, SITE_LIST_COLUMNS, SITE_PAGE_SIZES, siteListRows } from '../shared/site-list.ts';
import { EMPTY_TABLE_TEXT, NO_MATCH_TEXT, entriesText } from '../shared/ui-texts.ts';
import { NO_RIGHTS_TEXT } from '../shared/pilots.ts';
import type { Row } from '../shared/types.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { apiUrl } from './api.ts';
import { ArchiveRecordButton, ArchiveRecordDialog } from './archive-record.tsx';
import { Badge, EmptyState, SearchInput, TableScroll } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { RecordEditor } from './dialogs.tsx';

/**
 * General data → Project sites (both pilots): the table of main projects. The name opens that site's Projects and makes it
 * the active site; Options open Projects, edit and archive. The card screen "Select a main project" stays the choice after sign-in.
 */
export function SitesPage() {
  const { allRows, canRecord, selectSite, user } = useWorkspace(); const navigate = useNavigate();
  const def = RESOURCE_MAP.sites;
  const [archived, setArchived] = useState(false), [query, setQuery] = useState(''), [size, setSize] = useState(SITE_PAGE_SIZES[1]), [page, setPage] = useState(0);
  const [sort, setSort] = useState(SITE_DEFAULT_SORT), [editor, setEditor] = useState<Row | 'new' | null>(null), [archiving, setArchiving] = useState<Row | null>(null);
  const all = allRows.sites || [];
  const rows = useMemo(() => siteListRows(all, { archived, query, sort }), [all, archived, query, sort]);
  if (!canRecord('sites')) return <div className="page"><EmptyState title={NO_RIGHTS_TEXT} description="Ask an administrator to add the right to your permission profile."/></div>;
  const pages = Math.max(1, Math.ceil(rows.length / size)), current = Math.min(page, pages - 1), shown = rows.slice(current * size, (current + 1) * size);
  const label = (name: string) => def.fields.find(field => field.name === name)?.label || name;
  const exportUrl = (format: string) => apiUrl(`/export/sites?format=${format}&archived=true&ids=${rows.map(row => row.id).join(',') || '__none__'}`);
  const open = (site: Row) => { selectSite(site.id); navigate(canRecord('projects') ? '/workspace/projects' : '/dashboard'); };
  const toggleSort = (field: string) => { setSort(old => ({ field, direction: old.field === field ? (old.direction === 1 ? -1 : 1) : 1 })); setPage(0); };
  // A limited account cannot add a main project: it would lie outside its access.
  const canAdd = canRecord('sites', 'insert') && !user.siteLimited;
  return <div className="page records-page sites-page">
    <div className="page-heading"><div><div className="eyebrow">GENERAL DATA</div><h1>{def.title}</h1><p>The main projects of your workspace. Open one to work in its projects.</p></div>
      <div className="heading-actions"><button type="button" className="btn" onClick={() => { setArchived(value => !value); setPage(0); }}>{archived ? 'Back to active sites' : 'Show archived sites'}</button>{canAdd && <button type="button" className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add project site</button>}</div></div>
    <div className="table-card">
      <div className="table-toolbar sites-toolbar">
        <label className="page-size">Show <select aria-label="Entries per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{SITE_PAGE_SIZES.map(option => <option key={option}>{option}</option>)}</select> entries</label>
        <div className="toolbar-right sites-export">
          {canRecord('sites', 'export') && <><a className="btn small" href={exportUrl('csv')}>CSV</a><a className="btn small" href={exportUrl('xlsx')}>Excel</a></>}
          {canRecord('sites', 'print') && <button type="button" className="btn small" onClick={() => window.print()}><Printer size={14}/>Print</button>}
        </div>
        <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search project sites…"/>
      </div>
      <TableScroll><table className="data-table sites-table"><thead><tr>
        {SITE_LIST_COLUMNS.map(column => <th key={column} aria-sort={sort.field === column ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => toggleSort(column)}>{label(column)}<ArrowUpDown size={12} className={sort.field === column ? 'sort-active' : ''}/></button></th>)}
        <th className="actions-cell">Options</th></tr></thead>
        <tbody>{shown.map(site => <tr key={site.id}>
          <td>{site._archived ? <>{String(site.name)} <Badge>Archived</Badge></> : <button type="button" className="record-link" onClick={() => open(site)}>{String(site.name)}</button>}</td>
          {SITE_LIST_COLUMNS.slice(1).map(column => <td key={column}>{String(site[column] ?? '') || <span className="muted">—</span>}</td>)}
          <td className="actions-cell"><span className="site-options">
            {!site._archived && <button type="button" className="icon-btn" aria-label={`Open projects of ${String(site.name)}`} title="Projects" onClick={() => open(site)}><FolderOpen size={16}/></button>}
            {!site._archived && canRecord('sites', 'edit', site) && <button type="button" className="icon-btn" aria-label={`Edit project site ${String(site.name)}`} title="Edit project site" onClick={() => setEditor(site)}><Pencil size={16}/></button>}
            <ArchiveRecordButton resourceKey="sites" record={site} onArchive={() => setArchiving(site)}/>
          </span></td></tr>)}
          {!shown.length && <tr><td colSpan={SITE_LIST_COLUMNS.length + 1} className="empty-cell" role="status">{query.trim() ? NO_MATCH_TEXT : EMPTY_TABLE_TEXT}</td></tr>}
        </tbody></table></TableScroll>
      <div className="table-footer"><span role="status" aria-live="polite">{entriesText(rows.length ? current * size + 1 : 0, Math.min((current + 1) * size, rows.length), rows.length)}</span>
        <div><button type="button" className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button type="button" className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {archiving && <ArchiveRecordDialog resourceKey="sites" record={archiving} onClose={() => setArchiving(null)}/>}
    {editor && <RecordEditor resourceKey="sites" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
  </div>;
}
