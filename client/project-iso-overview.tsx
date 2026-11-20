import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpDown, BookText, ChevronDown, ChevronLeft, ChevronRight, Database, Eye, FileText, FolderOpen, Pencil, Plus, Printer, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Badge, Dropdown, EmptyState, SearchInput, TableScroll } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { RecordEditor } from './dialogs.tsx';
import { IsoMassEditDialog } from './iso-mass-edit.tsx';
import { ArchiveRecordDialog, BulkArchiveDialog } from './archive-record.tsx';
import { CopyIsometricsDialog, PhaseDialog } from './iso-actions.tsx';
import { IsoBookDialog } from './iso-book.tsx';
import { FillIrnDialog } from './iso-irn.tsx';
import { FlagMark } from './iso-list.tsx';
import { PunchDialog } from './punch.tsx';
import { PdfDialog, pdfEntries, type PdfMenuItem } from './pdf-reports.tsx';
import { ISO_OVERVIEW_DEFAULT_SORT, ISO_OVERVIEW_FILTERS, ISO_OVERVIEW_MENUS, ISO_OVERVIEW_PAGE, ISO_OVERVIEW_TITLE, ISO_ROW_ACTIONS, NO_OVERVIEW_FILTERS, cellText, filterOptions, matchesOverviewFilters, overviewColumns, overviewFilterCount, overviewValue, qaBadges, sortOverview, startedFlags, statusText, type IsoOverviewFilters } from '../shared/iso-overview.ts';
import { pagePilots } from '../shared/pilots.ts';
import { priorityLabel } from '../shared/priority.ts';
import { EMPTY_TABLE_TEXT, NO_MATCH_TEXT, entriesText } from '../shared/ui-texts.ts';
import { rowDeleteLabel } from '../shared/weld-catalogs.ts';
import type { Row } from '../shared/types.ts';

type Dialog = '' | 'add' | 'mass' | 'phase' | 'copy' | 'book' | 'grouped' | 'delete-all' | 'delete-selected' | 'irn';
const [REPORTS, OPTIONS, ADD] = [ISO_OVERVIEW_MENUS.Reports, ISO_OVERVIEW_MENUS.Options, ISO_OVERVIEW_MENUS.Add];
const [OPEN, PRINT, OVERVIEW, PUNCH, EDIT, DELETE] = ISO_ROW_ACTIONS;
const CHECK_FIRST = 'Check one or more isometrics first.';
function closeMenu(event: React.MouseEvent) { event.currentTarget.closest('details')?.removeAttribute('open'); }

/**
 * The project's isometrics page, "Iso overview" (captures weld__welding__project-isometrics.txt and
 * mto__projects__project-isometrics.txt): the captured columns with QA badges, one-decimal Status and the Started
 * M / E / W links; page length 20 ordered by Started; the top-bar menus Reports / Options / Add and the row options.
 * The actions behind the menus are the existing dialogs of the isometric pages; the server decides every one of them.
 * Without `project` it is the main project's Iso overview: every isometric of every sub-project (useWorkspace rows are scoped to
 * the open main project), with a Sub-project column, the Filters panel and a mass edit of all the input fields.
 */
export function ProjectIsoOverview({ project }: { project?: Row }) {
  const { rows, isoSummaries, canRecord, canRun, canReadReport, hasFeature, siteId, label } = useWorkspace();
  const pilot = usePilot(), navigate = useNavigate(), weld = pilot?.pilot.key === 'weld';
  const [query, setQuery] = useState(''), [sort, setSort] = useState<{ field: string; direction: 1 | -1 }>(ISO_OVERVIEW_DEFAULT_SORT);
  const [size, setSize] = useState(ISO_OVERVIEW_PAGE.initial), [page, setPage] = useState(0), [selected, setSelected] = useState<string[]>([]);
  const [deleted, setDeleted] = useState(false), [dialog, setDialog] = useState<Dialog>(''), [editing, setEditing] = useState<Row | null>(null), [removing, setRemoving] = useState<Row | null>(null);
  const [report, setReport] = useState<PdfMenuItem | null>(null), [row, setRow] = useState<{ kind: 'index' | 'book' | 'punch'; iso: Row } | null>(null);
  const all = !project, site = rows.sites?.find(item => item.id === (project ? project.siteId : siteId));
  const [filters, setFilters] = useState<IsoOverviewFilters>(NO_OVERVIEW_FILTERS), [filtersOpen, setFiltersOpen] = useState(false);
  const planning = hasFeature('project-planning');
  const columns = overviewColumns(all);
  const projectNames = useMemo(() => new Map((rows.projects || []).map(item => [item.id, [item.internnumber, item.description].map(part => String(part ?? '').trim()).filter(Boolean).join(' - ') || 'Unnamed project'])), [rows.projects]);
  const mine = useMemo(() => (rows.isometrics || []).filter(iso => !project || iso.projectId === project.id), [rows.isometrics, project]);
  const shownRows = useMemo(() => mine.filter(iso => Boolean(iso._archived) === deleted), [mine, deleted]);
  const value = (iso: Row, key: string) => key === 'projectId' ? projectNames.get(String(iso.projectId)) ?? '' : overviewValue(iso, key, isoSummaries?.[iso.id]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const get = (iso: Row, key: string) => key === 'projectId' ? projectNames.get(String(iso.projectId)) ?? '' : overviewValue(iso, key, isoSummaries?.[iso.id]);
    const narrowed = shownRows.filter(iso => matchesOverviewFilters(iso, filters));
    const found = needle ? narrowed.filter(iso => columns.some(column => column.sortable && column.kind !== 'mark' && String(get(iso, column.key)).toLowerCase().includes(needle))) : narrowed;
    return sortOverview(found, get, sort.field, sort.direction);
  }, [shownRows, query, filters, sort, isoSummaries, projectNames, columns]);
  const filterCount = all ? overviewFilterCount(filters) : 0;
  const filterLabel = (key: string) => (id: string) => key === 'projectId' ? projectNames.get(id) ?? id : key === 'testSystemId' ? label('test_systems', id) : key === 'fieldPackageId' ? label('field_packages', id) : key === 'priority' ? priorityLabel(id) : id;
  const filterChoices = useMemo(() => Object.fromEntries(ISO_OVERVIEW_FILTERS.filter(def => def.kind === 'select').map(def => [def.key, filterOptions(shownRows, def, filterLabel(def.key))])), [shownRows, projectNames]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFilter = (key: string, next: string) => { setFilters(old => ({ ...old, [key]: next })); reset(); };
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * size, (current + 1) * size);
  const checked = shownRows.filter(iso => selected.includes(iso.id) && !iso._archived);
  const none = checked.length === 0, writable = canRecord('isometrics', 'edit'), removable = canRecord('isometrics', 'delete');
  const allowedPilots = pilot?.allowed.map(item => item.key) ?? [];
  const toggleSort = (field: string) => setSort(old => ({ field, direction: old.field === field ? (old.direction === 1 ? -1 : 1) : 1 }));
  const reset = () => { setSelected([]); setPage(0); };
  const open = (iso: Row) => navigate(`/workspace/isometrics/${iso.id}`);
  const entry = (key: string) => pdfEntries(pilot?.pilot.key, 'isometric').find(item => item.key === key && canReadReport(item.report));
  const index = pdfEntries(pilot?.pilot.key, 'certifications').find(item => item.key === 'certification-index');
  const reports = REPORTS.map(label => ({ label, item: entry(label === 'Weld card' ? 'weld-cards' : 'weld-labels') })).filter(item => item.item);
  const add = canRecord('isometrics', 'insert');
  const close = () => setDialog('');
  const item = (label: string, onClick: () => void, disabled = false, hint?: string) => <button key={label} disabled={disabled} title={disabled ? hint : undefined} onClick={event => { closeMenu(event); onClick(); }}>{label}</button>;

  const cell = (iso: Row, key: string, kind?: string): ReactNode => {
    const summary = isoSummaries?.[iso.id];
    if (kind === 'mark') return <FlagMark flag={iso[key] === true} title={key === 'noBo' ? 'NoBo' : 'PWHT'}/>;
    if (kind === 'qa') return <span className="iso-qa">{qaBadges(summary?.qa).map(badge => <Link key={badge.key} className={`iso-qa-badge iso-qa-badge--${badge.state}`} to={`/workspace/isometrics/${iso.id}`} title={badge.title} aria-label={badge.title}>{badge.label}</Link>)}</span>;
    if (kind === 'status') return <span className="tabular">{statusText(summary?.progress.total)}</span>;
    if (kind === 'started') return <span className="iso-started-links">{startedFlags(summary?.flags, planning).map(flag => {
      const target = flag.key === 'm' ? 'mto' : flag.key === 'w' ? 'weld' : null, reachable = target !== null && allowedPilots.includes(target);
      const label = `${flag.letter}: ${flag.title}`, className = `iso-started-link ${flag.on ? 'on' : 'off'}`;
      return reachable ? <button key={flag.key} className={className} title={flag.title} aria-label={label} onClick={() => pilot?.openPilot(target!, `/workspace/isometrics/${iso.id}`)}>{flag.letter}</button> : <span key={flag.key} className={className} title={flag.title} role="img" aria-label={label}>{flag.letter}</span>;
    })}</span>;
    if (key === 'priority') return <span className="tabular">{String(value(iso, 'priority'))}</span>;
    if (key === 'projectId') return cellText(value(iso, 'projectId'));
    if (key === 'isoNo') return <button className="record-link" onClick={() => open(iso)}>{cellText(iso.isoNo)}{iso._archived && <Badge>Archived</Badge>}</button>;
    if (key === 'xRay') return cellText(String(iso.xRay ?? '').trim() ? `${String(iso.xRay).replace(/%$/, '')}` : '');
    return cellText(iso[key]);
  };
  const rowOptions = (iso: Row) => <span className="iso-row-options">
    {!iso._archived && <>
      <button className="icon-btn" title={OPEN} aria-label={`${OPEN} isometric ${String(iso.isoNo)}`} onClick={() => open(iso)}><FolderOpen size={16}/></button>
      {(Boolean(index) && canRecord('certifications') || canRecord('isometrics')) && <Dropdown label={`${PRINT} for isometric ${String(iso.isoNo)}`} trigger={<span className="icon-btn" title={PRINT}><Printer size={16}/></span>}>
        {Boolean(index) && canRecord('certifications') && item('Certification index', () => setRow({ kind: 'index', iso }))}
        {item('ISO Book', () => setRow({ kind: 'book', iso }))}
      </Dropdown>}
      <button className="icon-btn" title={OVERVIEW} aria-label={`${OVERVIEW} of ${String(iso.isoNo)}`} onClick={() => open(iso)}><Eye size={16}/></button>
      {weld && canRecord('punchlists') && <button className="icon-btn" title={PUNCH} aria-label={`${PUNCH} of ${String(iso.isoNo)}`} onClick={() => setRow({ kind: 'punch', iso })}><BookText size={16}/></button>}
      {writable && canRecord('isometrics', 'edit', iso) && <button className="icon-btn" title={EDIT} aria-label={`${EDIT} ${String(iso.isoNo)}`} onClick={() => setEditing(iso)}><Pencil size={16}/></button>}
    </>}
    {canRecord('isometrics', 'delete', iso) && <button className="icon-btn" title={rowDeleteLabel('isometrics', Boolean(iso._archived), true)} aria-label={`${rowDeleteLabel('isometrics', Boolean(iso._archived), true)} isometric ${String(iso.isoNo)}`} onClick={() => setRemoving(iso)}><Trash2 size={16}/></button>}
  </span>;

  return <div className="page records-page iso-overview">
    <div className="page-heading"><div><div className="eyebrow">{all ? 'MAIN PROJECT' : 'PROJECT WORKSPACE'}</div><h1>{ISO_OVERVIEW_TITLE}<span className="heading-count">{mine.filter(iso => !iso._archived).length}</span></h1><p>{all ? (deleted ? 'Deleted isometrics of every subproject in this main project.' : 'Every isometric of every subproject in this main project with its QA, progress and what has started.') : deleted ? 'Deleted isometrics of this subproject.' : 'The isometrics of this subproject with their QA, progress and what has started.'}</p></div>
      <div className="heading-actions">
        {canReadReport('lisl') && pilot && pagePilots('/welding/lisl').includes(pilot.pilot.key) && <Link className="btn" to="/welding/lisl"><Database size={15}/>Data LISL</Link>}
        {weld && reports.length > 0 && <Dropdown label="Reports" trigger={<span className="btn"><FileText size={15}/>Reports<ChevronDown size={15}/></span>}>{reports.map(({ label, item: entryItem }) => item(label, () => setReport(entryItem!), checked.length !== 1, 'Check one isometric first.'))}</Dropdown>}
        <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}>
          {/* Delete all would archive every isometric of the main project here: only a sub-project's page offers it. */}
          {!all && item(OPTIONS[0], () => setDialog('delete-all'), !removable || !shownRows.some(iso => !iso._archived), removable ? 'There are no isometrics to delete.' : 'You may not delete isometrics.')}
          {item(OPTIONS[1], () => setDialog('delete-selected'), none || !removable, none ? CHECK_FIRST : 'You may not delete isometrics.')}
          {item(OPTIONS[2], () => setDialog('mass'), none || !writable, none ? CHECK_FIRST : 'You may not edit isometrics.')}
          {item(OPTIONS[4], () => setDialog('phase'), none || !canRun('phases'), none ? CHECK_FIRST : 'You may not set phases.')}
          {item(OPTIONS[5], () => setDialog('book'))}
          {item(OPTIONS[6], () => setDialog('grouped'))}
          {item(deleted ? "Show active ISO's" : OPTIONS[7], () => { setDeleted(value => !value); reset(); })}
          {item(OPTIONS[8], () => setDialog('copy'), none || !canRun('copy-isometrics'), none ? CHECK_FIRST : 'You may not copy isometrics.')}
          {site && canRun('fill-irn') && item('Automatically add IRN numbers', () => setDialog('irn'))}
        </Dropdown>
        {add && <Dropdown label="Add" trigger={<span className="btn primary"><Plus size={16}/>Add<ChevronDown size={15}/></span>}>{item(ADD[0], () => setDialog('add'))}</Dropdown>}
      </div></div>
    <div className="table-card">
      <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); reset(); }} placeholder="Search"/>{checked.length > 0 && <span className="muted" role="status">{checked.length} checked</span>}{all && <div className="toolbar-right"><button className={`btn small ${filtersOpen || filterCount ? 'active-filter' : ''}`} aria-expanded={filtersOpen} aria-controls="iso-overview-filters" onClick={() => setFiltersOpen(open => !open)}><SlidersHorizontal size={15}/>Filters{filterCount > 0 && <span className="count-pill">{filterCount}</span>}</button></div>}</div>
      {all && filtersOpen && <div id="iso-overview-filters" className="filters-panel iso-overview-filters" role="group" aria-label="Filters">
        {ISO_OVERVIEW_FILTERS.map(def => <div className="field" key={def.key}><label htmlFor={`iso-filter-${def.key}`}>{def.label}</label>
          {def.kind === 'text' ? <input id={`iso-filter-${def.key}`} value={filters[def.key] ?? ''} onChange={event => setFilter(def.key, event.target.value)} placeholder="Contains…" autoComplete="off"/>
            : <select id={`iso-filter-${def.key}`} value={filters[def.key] ?? ''} onChange={event => setFilter(def.key, event.target.value)}><option value="">All</option>{def.kind === 'flag' ? <><option value="yes">Yes</option><option value="no">No</option></> : (filterChoices[def.key] || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</div>)}
        <button type="button" className="text-link" disabled={!filterCount} onClick={() => { setFilters(NO_OVERVIEW_FILTERS); reset(); }}>Clear filters</button>
      </div>}
      <TableScroll><table className="data-table iso-overview-table"><thead><tr>
        {columns.map(column => <th key={column.key} aria-sort={sort.field === column.key ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}>{column.sortable ? <button onClick={() => { toggleSort(column.key); setPage(0); }}>{column.label}<ArrowUpDown size={12} className={sort.field === column.key ? 'sort-active' : ''}/></button> : column.label}</th>)}
        <th className="select-cell"><input type="checkbox" aria-label="Select all isometrics on this page" ref={input => { if (input) input.indeterminate = visible.some(iso => selected.includes(iso.id)) && !visible.every(iso => selected.includes(iso.id)); }} checked={visible.length > 0 && visible.every(iso => selected.includes(iso.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...visible.map(iso => iso.id)])] : old.filter(id => !visible.some(iso => iso.id === id)))}/></th>
      </tr></thead><tbody>{visible.map(iso => <tr key={iso.id} className={selected.includes(iso.id) ? 'row-selected' : ''}>
        {columns.map(column => <td key={column.key} className={column.kind === 'options' ? 'actions-cell' : column.kind === 'mark' ? 'flag-cell' : undefined}>{column.kind === 'options' ? rowOptions(iso) : cell(iso, column.key, column.kind)}</td>)}
        <td className="select-cell"><input type="checkbox" aria-label={`Select ${String(iso.isoNo)}`} checked={selected.includes(iso.id)} onChange={event => setSelected(old => event.target.checked ? [...old, iso.id] : old.filter(id => id !== iso.id))}/></td>
      </tr>)}</tbody></table></TableScroll>
      {!filtered.length && <EmptyState title={query || filterCount ? NO_MATCH_TEXT : EMPTY_TABLE_TEXT} description={query || filterCount ? 'Try another search or clear the filters.' : deleted ? `No isometric of ${all ? 'this main project' : 'this subproject'} was deleted.` : `Add the first isometric of ${all ? 'this main project' : 'this subproject'}.`} action={query || filterCount ? <button className="btn" onClick={() => { setQuery(''); setFilters(NO_OVERVIEW_FILTERS); reset(); }}>Clear search{filterCount ? ' and filters' : ''}</button> : add && !deleted ? <button className="btn primary" onClick={() => setDialog('add')}><Plus size={16}/>{ADD[0]}</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{entriesText(filtered.length ? current * size + 1 : 0, Math.min((current + 1) * size, filtered.length), filtered.length)}</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{ISO_OVERVIEW_PAGE.sizes.map(count => <option key={count}>{count}</option>)}</select><button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {dialog === 'add' && <RecordEditor resourceKey="isometrics" defaults={project ? { projectId: project.id } : undefined} onClose={close}/>}
    {editing && <RecordEditor resourceKey="isometrics" record={editing} onClose={() => setEditing(null)}/>}
    {removing && <ArchiveRecordDialog resourceKey="isometrics" record={removing} onClose={() => setRemoving(null)}/>}
    {dialog === 'delete-all' && <BulkArchiveDialog resourceKey="isometrics" records={shownRows.filter(iso => !iso._archived)} onClose={close} onDone={reset}/>}
    {dialog === 'delete-selected' && <BulkArchiveDialog resourceKey="isometrics" records={checked} onClose={close} onDone={reset}/>}
    {dialog === 'mass' && <IsoMassEditDialog records={checked} onClose={close} onDone={reset}/>}
    {dialog === 'phase' && <PhaseDialog records={checked} onClose={close} onDone={reset}/>}
    {dialog === 'copy' && <CopyIsometricsDialog records={checked} onClose={close} onDone={reset}/>}
    {(dialog === 'book' || dialog === 'grouped') && <IsoBookDialog isos={checked.length ? checked : shownRows.filter(iso => !iso._archived)} choose={!checked.length} grouping={dialog === 'grouped' ? 'by-part' : undefined} onClose={close}/>}
    {dialog === 'irn' && site && <FillIrnDialog site={site} onClose={close}/>}
    {report && checked.length === 1 && <PdfDialog item={report} iso={checked[0]} onClose={() => setReport(null)}/>}
    {row?.kind === 'index' && index && <PdfDialog item={index as PdfMenuItem} projectId={String(row.iso.projectId)} onClose={() => setRow(null)}/>}
    {row?.kind === 'book' && <IsoBookDialog isos={[row.iso]} onClose={() => setRow(null)}/>}
    {row?.kind === 'punch' && <PunchDialog isoId={row.iso.id} onClose={() => setRow(null)}/>}
  </div>;
}

/** The route `/workspace/iso-overview`: the Iso overview of the whole main project. */
export function AllIsoOverview() {
  const { canRecord } = useWorkspace();
  if (!canRecord('isometrics')) return <EmptyState title="Iso overview unavailable" description="Your permission profile does not include isometrics."/>;
  return <ProjectIsoOverview/>;
}
