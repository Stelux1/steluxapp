import { Fragment, useState, lazy, Suspense, type FormEvent, type ReactNode } from 'react';
import { IsoFlangesCard } from './flanges.tsx';
import { ISO_PAGE_MENU, dataLislUrl, headingHasOptions, menuGroups } from '../shared/iso-pages.ts';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, FileStack, FolderKanban, LayoutGrid, List, MapPin, Pencil, Plus, ScanLine, Upload, FileText, Download, Loader2 } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useWorkspace, activeRows } from './context.tsx';
import { Badge, Dropdown, EmptyState, Modal, Progress, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { TablePage, resourcePath } from './records.tsx';
import { PhaseDialog } from './iso-actions.tsx';
import { DataLisl } from './data-lisl.tsx';
import { WeldsPanel } from './weld-entry.tsx';
import { wdiProgress } from '../shared/wdi.ts';
import { WdiProgress } from './wdi-progress.tsx';
import { WeldDashboard } from './itp-dashboard.tsx';
import { headerDate } from '../shared/weld-dashboard.ts';
import { siteNumber } from '../shared/mto-logistics.ts';
import { MtoDashboard } from './mto-dashboard.tsx';
import { IsometricHeader, IsoStartedTag } from './iso-header.tsx';
import { PdfReportsMenu } from './pdf-reports.tsx';
import { IsoBookButton } from './iso-book.tsx';
import { ArchiveRecordButton, ArchiveRecordDialog } from './archive-record.tsx';
import { AttachmentCountBadge, IsoAttachmentsDialog, IsoAuditDialog } from './iso-dialogs.tsx';
const PlanningRegister = lazy(() => import('./project-planning.tsx').then(module => ({ default: module.PlanningRegister })));
const CutListPanel = lazy(() => import('./cut-list.tsx').then(module => ({ default: module.CutListPanel })));
import { api, formatDate, formatNumber, apiUrl } from './api.ts';
import { usePilot } from './pilot.tsx';
import { IsoMaterialsPanel } from './mto-materials.tsx';
import { pagePilots } from '../shared/pilots.ts';
import { FillIrnOption } from './iso-irn.tsx';
import { ProjectIsoOverview } from './project-iso-overview.tsx';
export { ProjectIsoOverview };
import type { Row } from '../shared/types.ts';

/** Main projects as cards or as a list (client design 20.11.2026); the choice is kept per browser. */
export type MainProjectView = 'grid' | 'list';
const MAIN_PROJECT_VIEW_KEY = 'blitzkrieg.mainProjects.view';
/** The remembered view of the main projects page: 'list' only when that was chosen, otherwise the cards (also when storage is blocked). */
export function readMainProjectView(storage?: Pick<Storage, 'getItem'>): MainProjectView {
  try { return (storage ?? window.localStorage).getItem(MAIN_PROJECT_VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}
function writeMainProjectView(view: MainProjectView) { try { window.localStorage.setItem(MAIN_PROJECT_VIEW_KEY, view); } catch { /* the choice just is not remembered */ } }
const siteAddress = (site: Row) => [site.address, [site.zip, site.residence].filter(Boolean).join(' ')].filter(Boolean).join(', ');

export function MainProjects() {
  const { allRows, canRecord, selectSite, user } = useWorkspace();
  const navigate = useNavigate(); const pilot = usePilot();
  // Access per project site: a limited account cannot add a main project (it would be outside its scope).
  const limited = Boolean(user.siteLimited);
  const [query, setQuery] = useState(''), [editor, setEditor] = useState<Row | 'new' | null>(null);
  const [archived, setArchived] = useState(false), [archiving, setArchiving] = useState<Row | null>(null);
  const [view, setView] = useState<MainProjectView>(() => readMainProjectView());
  const chooseView = (next: MainProjectView) => { setView(next); writeMainProjectView(next); };
  // Weld counts and WDI only where this pilot reads welds (Material Core receives none, so they would always show 0).
  const weldData = canRecord('welds');
  const sites = (allRows.sites || []).filter(site => site._archived === archived).filter(site => [site.name, site.residence, site.address].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
  const entries = sites.map(site => {
    const projects = activeRows(allRows, 'projects').filter(project => project.siteId === site.id);
    const isos = activeRows(allRows, 'isometrics').filter(iso => projects.some(project => project.id === iso.projectId));
    const welds = weldData ? activeRows(allRows, 'welds').filter(weld => isos.some(iso => iso.id === weld.isoId)) : [];
    return { site, projects, isos, welds };
  });
  const open = (site: Row) => { selectSite(site.id); navigate('/dashboard'); };
  const actions = (site: Row) => <>{!site._archived && canRecord('sites', 'edit', site) && <button className="icon-btn" aria-label={`Edit main project ${site.name}`} onClick={() => setEditor(site)}><Pencil size={16}/></button>}<ArchiveRecordButton resourceKey="sites" record={site} onArchive={() => setArchiving(site)}/></>;
  return <div className="page workflow-page main-projects-page">
    <div className="page-heading"><div><div className="eyebrow">BLITZKRIEG · PROJECT WORKSPACE</div><h1>Select a main project</h1><p>{pilot?.pilot.key === 'mto' ? 'Open a project to work with its subprojects, isometrics, and materials.' : 'Open a project to work with its subprojects, isometrics, and weld records.'}</p></div><div className="heading-actions">{canRecord('sites') && <Link className="btn" to={resourcePath('sites')} title="Every main project in a sortable list with CSV and Excel export">Project sites list</Link>}{canRecord('sites', 'insert') && !limited && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add main project</button>}</div></div>
    <div className="table-tabs" role="group" aria-label="Main project visibility"><button className={!archived ? "selected" : ""} aria-pressed={!archived} onClick={() => setArchived(false)}>Active projects</button><button className={archived ? "selected" : ""} aria-pressed={archived} onClick={() => setArchived(true)}>Archived projects</button></div>
    <div className="project-picker-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search main projects…"/><div className="project-picker-tools"><span>{sites.length} main projects</span>
      <div className="segmented main-project-view" role="group" aria-label="Show main projects as">{([['grid', 'Grid', LayoutGrid], ['list', 'List', List]] as const).map(([key, text, Icon]) => <button key={key} type="button" className={view === key ? 'selected' : ''} aria-pressed={view === key} onClick={() => chooseView(key)}><Icon size={15} aria-hidden="true"/>{text}</button>)}</div></div></div>
    {view === 'grid' ? <div className="main-project-grid">{entries.map(({ site, projects, isos, welds }) =>
      <section className="panel main-project-card" key={site.id}>
        <div className="main-project-card-top"><span className="project-card-icon"><FolderKanban size={25}/></span><div className="heading-actions">{actions(site)}</div></div>
        <h2>{String(site.name)}{site._archived && <Badge>Archived</Badge>}</h2>
        <p className="project-location"><MapPin size={14}/>{siteAddress(site) || 'Address not recorded'}</p>
        <div className="project-card-counts"><div><strong>{projects.length}</strong><span>Subprojects</span></div><div><strong>{isos.length}</strong><span>Isometrics</span></div>{weldData && <div><strong>{welds.length}</strong><span>Welds</span></div>}</div>
        {weldData && <WdiProgress compact welds={welds} diameters={allRows.diameters || []}/>}
        {!site._archived && <button className="btn primary" onClick={() => open(site)}>Open project<ArrowRight size={16}/></button>}
      </section>)}</div>
    : entries.length > 0 && <section className="panel main-project-list"><TableScroll><table className="data-table">
      <thead><tr><th scope="col">Main project</th><th scope="col">Address</th><th scope="col" className="numeric">Subprojects</th><th scope="col" className="numeric">Isometrics</th>{weldData && <><th scope="col" className="numeric">Welds</th><th scope="col">WDI progress</th><th scope="col" className="numeric">WDI completed</th><th scope="col" className="numeric">WDI remaining</th><th scope="col" className="numeric">WDI total</th></>}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{entries.map(({ site, projects, isos, welds }) => { const wdi = weldData ? wdiProgress(welds, allRows.diameters || []) : null; return <tr key={site.id}>
        <th scope="row"><span className="main-project-list-name">{String(site.name)}{site._archived && <Badge>Archived</Badge>}</span></th>
        <td>{siteAddress(site) || <span className="main-project-list-muted">Address not recorded</span>}</td>
        <td className="numeric">{projects.length}</td><td className="numeric">{isos.length}</td>
        {wdi && <><td className="numeric">{welds.length}</td><td><div className="main-project-list-wdi"><Progress value={wdi.percent}/><span>{wdi.percent}%</span></div></td><td className="numeric">{formatNumber(wdi.completed)}</td><td className="numeric">{formatNumber(wdi.remaining)}</td><td className="numeric">{formatNumber(wdi.total)}</td></>}
        <td><div className="main-project-list-actions">{!site._archived && <button className="btn primary small" onClick={() => open(site)} aria-label={`Open project ${site.name}`}>Open project<ArrowRight size={14}/></button>}{actions(site)}</div></td>
      </tr>; })}</tbody>
    </table></TableScroll>{weldData && <p className="field-hint main-project-list-note">WDI in dia-inch. Completed: welder and weld date filled · Remaining: welder or weld date empty</p>}</section>}
    {!sites.length && (limited && !query && !archived && !(allRows.sites || []).length
      ? <SiteScopeEmpty pilotTitle={pilot?.pilot.title}/>
      : <EmptyState title={query ? 'No matching main projects' : archived ? 'No archived main projects' : limited ? 'No other main projects' : 'Create your first main project'} description={query ? 'Try another project name or location.' : limited ? 'Your account works only on the main projects an administrator assigned to it.' : 'Add a main project, then create its numbered subprojects and isometrics.'}/>)}
    {archiving && <ArchiveRecordDialog resourceKey="sites" record={archiving} onClose={() => setArchiving(null)}/>}
    {editor && <RecordEditor resourceKey="sites" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
  </div>;
}

/** An account limited to specific project sites with none assigned in this pilot (see shared/site-scope.ts). */
function SiteScopeEmpty({ pilotTitle }: { pilotTitle?: string }) {
  return <section className="panel" role="status"><EmptyState title="No main project is assigned to your account" description={`Your account works only on chosen main projects${pilotTitle ? ` in ${pilotTitle}` : ''}, and none is assigned yet. Ask an administrator to add a main project to your access under User accounts → Applications.`}/></section>;
}

export function ProjectOverview() {
  const { rows, allRows, siteId, canRecord, canReadReport, openRecord } = useWorkspace(); const pilot = usePilot();
  const [editor, setEditor] = useState(false);
  const site = rows.sites?.find(row => row.id === siteId), hosted = Boolean(pilot);
  const projects = activeRows(rows, 'projects'), isos = activeRows(rows, 'isometrics'), welds = activeRows(rows, 'welds');
  const welded = welds.filter(weld => weld.date).length;
  const ndt = welds.filter(weld => weld.ndoReq).length;
  const wdi = welds.reduce((total, weld) => total + Number(rows.diameters?.find(diameter => diameter.id === weld.diameterId)?.sizeinch || 0), 0);
  const weekly = Array.from({ length: 6 }, (_, index) => {
    const end = new Date(); end.setUTCHours(23, 59, 59, 999); end.setUTCDate(end.getUTCDate() - (5 - index) * 7);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 6); start.setUTCHours(0, 0, 0, 0);
    return { week: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }), welds: welds.filter(weld => weld.date && new Date(String(weld.date)) >= start && new Date(String(weld.date)) <= end).length };
  });
  return <div className="page workflow-page project-overview">
    <div className="page-heading"><div>{pilot?.pilot.key === 'weld' ? <><h1>{String(site?.name || 'Project overview')}</h1><p>{headerDate()}</p>{siteId && <p className="muted">Site ID #{siteNumber(allRows.sites || [], siteId)}</p>}</> : <><div className="eyebrow">MAIN PROJECT · DASHBOARD</div><h1>{String(site?.name || 'Project overview')}</h1><p>Execution and traceability across this project's subprojects.</p></>}</div><div className="heading-actions"><Link className="btn" to="/workspace/main-projects"><ArrowLeft size={16}/>All main projects</Link>{canRecord('projects', 'insert') && <button className="btn primary" onClick={() => setEditor(true)}><Plus size={16}/>Add subproject</button>}</div></div>
    {pilot?.pilot.key === 'mto' ? <MtoDashboard/> : <>
    {!hosted && <div className="workflow-stats">{[
      ['Subprojects', projects.length, `${isos.length} isometrics`, FolderKanban], ['Registered welds', welds.length, `${welded} welded`, ScanLine], ['WDI total', formatNumber(wdi), 'Diameter inches · all registered welds', FileStack], ['NDT required', ndt, 'Welds marked for examination', ScanLine],
    ].map(([title, value, description, Icon]) => { const I = Icon as typeof FileStack; return <div className="panel workflow-stat" key={String(title)}><span className="project-card-icon"><I size={20}/></span><small>{String(title)}</small><strong>{String(value)}</strong><span>{String(description)}</span></div>; })}</div>}
    <section className="panel project-wdi-panel"><WdiProgress welds={welds} diameters={rows.diameters || []}/></section>
    {hosted ? <WeldDashboard/> : <>
    <div className="project-analytics-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">PRODUCTION</span><h2>Weld activity by date</h2></div><Badge>{welded} dated welds</Badge></div><div className="project-production-chart" role="img" aria-label={`Welds completed by week: ${weekly.map(item => `${item.week}: ${item.welds}`).join(', ')}`}><ResponsiveContainer width="100%" height={210}><BarChart data={weekly} margin={{ left: -20, right: 20, bottom: 5 }}><CartesianGrid vertical={false} stroke="#e2eaf5" strokeDasharray="3 4"/><XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><Tooltip cursor={{ fill: '#edf4ff' }}/><Bar dataKey="welds" name="Completed welds" fill="#0064e8" radius={[5, 5, 0, 0]} maxBarSize={36}/></BarChart></ResponsiveContainer></div></section>
      <section className="panel workflow-steps"><div className="panel-heading"><div><span className="eyebrow">PROJECT WORKFLOW</span><h2>Continue your work</h2></div></div>{[['/workspace/projects', '01', 'Subprojects', 'Open a subproject and its drawing list'], ['/workspace/isometrics', '02', 'ISO overview', 'Revisions, ITP references, and weld progress'], ['/welding/lisl', '03', 'LISL register', 'Welds and both material certificates']].filter(([path]) => path !== '/welding/lisl' || canReadReport('lisl') && (!pilot || pagePilots(path).includes(pilot.pilot.key))).map(([path, step, title, text]) => <Link key={path} to={path}><span>{step}</span><div><strong>{title}</strong><small>{text}</small></div><ArrowRight size={16}/></Link>)}</section></div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SUBPROJECTS</span><h2>Project progress</h2></div><Link className="text-link" to="/workspace/projects">View all subprojects<ArrowRight size={15}/></Link></div><TableScroll><table className="data-table"><thead><tr><th>Subproject</th><th>Name</th><th>Isometrics</th><th>WDI progress</th><th>Status</th><th/></tr></thead><tbody>{projects.map(project => {
      const drawings = isos.filter(iso => iso.projectId === project.id), scope = welds.filter(weld => drawings.some(iso => iso.id === weld.isoId)), progress = wdiProgress(scope, rows.diameters || []);
      return <tr key={project.id}><td><button className="record-link" onClick={() => openRecord('projects', project.id)}>{String(project.internnumber)}</button></td><td>{String(project.description || '—')}</td><td>{drawings.length}</td><td><div className="subproject-progress"><Progress value={progress.percent}/><span>{formatNumber(progress.completed)} / {formatNumber(progress.total)} dia-inch</span></div></td><td><Badge>{String(project.status || 'Active')}</Badge></td><td><button className="icon-btn" aria-label={`Open subproject ${project.internnumber}`} onClick={() => openRecord('projects', project.id)}><ArrowRight size={16}/></button></td></tr>;
    })}</tbody></table></TableScroll>{!projects.length && <EmptyState title="No subprojects yet" description="Add the first subproject to start building this project's drawing list."/>}</section>
    </>}
    </>}
    {editor && <RecordEditor resourceKey="projects" defaults={{ siteId }} onClose={() => setEditor(false)}/>}
  </div>;
}

export function SubprojectWorkspace() {
  const { projectId = '' } = useParams();
  const { rows, canRecord } = useWorkspace(); const pilot = usePilot();
  const [editor, setEditor] = useState(false);
  const project = rows.projects?.find(row => row.id === projectId && !row._archived);
  if (!project || !canRecord('isometrics')) return <EmptyState title="Subproject unavailable" description="Choose a subproject in the selected main project."/>;
  return <><div className="page subproject-banner"><Link className="text-link" to="/workspace/projects"><ArrowLeft size={15}/>Subprojects</Link><div><div><span className="eyebrow">SUBPROJECT {String(project.internnumber)}</span><h2>{String(project.description || project.internnumber)}</h2><p>{String(project.contact || '')}{project.contact && ' · '}{String(project.status || 'Active')}</p></div>{!pilot && <FillIrnOption project={project}/>}{canRecord('projects', 'edit', project) && <button className="btn" onClick={() => setEditor(true)}><Pencil size={15}/>Edit subproject</button>}</div></div>{pilot ? <ProjectIsoOverview key={projectId} project={project}/> : <TablePage key={projectId} resourceKey="isometrics" scopeProjectId={projectId}/>}{editor && <RecordEditor resourceKey="projects" record={project} onClose={() => setEditor(false)}/>}</>;
}

function DrawingUpload({ iso, kind, onClose }: { iso: Row; kind: string; onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return; setBusy(true); setError('');
    const body = new FormData(); body.set('file', file); body.set('entityType', 'isometrics'); body.set('entityId', iso.id); const revision = kind === 'ISO' ? iso.revNo : kind === 'ITP 2' ? iso.itp2RevNo : iso.itpRevNo; body.set('documentType', revision !== undefined && revision !== '' ? `${kind} revision ${revision}` : kind);
    try { await api('/files', { method: 'POST', body }); await refresh(); notify(`${kind} document attached.`); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`Upload ${kind} document`} subtitle={String(iso.isoNo)} onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}<div className="field"><label htmlFor="iso-document-file">Document file</label><input id="iso-document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" required onChange={event => setFile(event.target.files?.[0] || null)}/><small>Earlier uploads remain in Drawing documents. Update drawing references through Edit isometric.</small></div></div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload document</button></div></form></Modal>;
}

/** The spools of the isometric: the Spools tab (Material Core, other profiles) and Options → Spools (Weld Core). */
function SpoolsTable({ spools, welds, onEdit }: { spools: Row[]; welds: Row[]; onEdit: (spool: Row) => void }) {
  const { canRecord, openRecord } = useWorkspace();
  return <>{spools.length > 0 && <TableScroll><table className="data-table"><thead><tr><th>Spool</th><th>Diameter</th><th>Welds</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{spools.map(spool => <tr key={spool.id}><td><button className="record-link" onClick={() => openRecord('spools', spool.id)}>{String(spool.name)}</button></td><td>{String(spool.diameter || '—')}</td><td>{welds.filter(weld => weld.spoolId === spool.id).length}</td><td>{canRecord('spools', 'edit', spool) && <button className="icon-btn" aria-label={`Edit spool ${spool.name}`} onClick={() => onEdit(spool)}><Pencil size={16}/></button>}</td></tr>)}</tbody></table></TableScroll>}
    {!spools.length && <EmptyState title="No spools in this isometric" description="Add a spool, then assign it when adding or editing a weld."/>}</>;
}
/** The drawing and ITP documents of the isometric: the Documents tab (Material Core, other profiles) and Options → Drawing documents (Weld Core). */
function DrawingDocuments({ documents }: { documents: Row[] }) {
  return <>{documents.map(file => <a className="attachment-row" key={file.id} href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer"><FileText size={22}/><div><strong>{String(file.name)}</strong><small>{String(file.documentType)} · {formatDate(file._createdAt)}</small></div><Download size={17}/></a>)}
    {!documents.length && <EmptyState title="No drawing documents attached" description="Upload the drawing or an ITP document with Upload document."/>}</>;
}

/**
 * The isometric page (client change list 22.11.2026, images 16–20). One slim top line: Main project › Sub-project › the
 * isometric switcher › LISL, with Options, Reports and Add weld at the right. Then four compact cards and, in Weld Core,
 * the LISL with no tab strip; Spools and Drawing documents open from Options. Material Core keeps its tabs. The Flanges
 * and WDI strips sit collapsed below the register.
 */
export function IsometricWorkspace() {
  const { isoId = '' } = useParams();
  const { rows, allRows, canRecord, canRun, canReadReport, hasFeature } = useWorkspace(); const pilot = usePilot();
  const navigate = useNavigate(); const [phasing, setPhasing] = useState(false), [auditing, setAuditing] = useState(false), [attaching, setAttaching] = useState(false);
  const [editor, setEditor] = useState(''), [editingSpool, setEditingSpool] = useState<Row | undefined>(), [selectedTab, setTab] = useState(pilot?.pilot.key === 'mto' ? 'mto' : 'welds'), [upload, setUpload] = useState('');
  const [archiving, setArchiving] = useState(false), [quantities, setQuantities] = useState(false), [listing, setListing] = useState<'spools' | 'documents' | ''>('');
  const iso = rows.isometrics?.find(row => row.id === isoId && !row._archived);
  if (!iso || !canRecord('isometrics')) return <EmptyState title="Isometric unavailable" description="Choose an isometric in the selected main project."/>;
  const project = rows.projects?.find(row => row.id === iso.projectId);
  const site = (rows.sites || allRows.sites)?.find(row => row.id === project?.siteId);
  const isos = activeRows(rows, 'isometrics').filter(row => row.projectId === iso.projectId).sort((a, b) => String(a.isoNo).localeCompare(String(b.isoNo), 'en', { numeric: true }));
  const index = isos.findIndex(row => row.id === isoId), welds = activeRows(rows, 'welds').filter(row => row.isoId === isoId), spools = activeRows(rows, 'spools').filter(row => row.isoId === isoId);
  const documents = activeRows(rows, 'attachments').filter(row => row.entityType === 'isometrics' && row.entityId === isoId).sort((a, b) => b._createdAt.localeCompare(a._createdAt));
  // Weld Core: the LISL is the page (no tab strip). Material Core keeps its materials and Cut list tabs, the other profiles every tab;
  // the calculation tab left Material Core with its Calculations section (client, 20.11.2026).
  const lislPage = pilot?.pilot.key === 'weld';
  const weldTabs = !pilot, mtoTabs = !pilot || pilot.pilot.key === 'mto';
  const tabs = lislPage ? [] : [...(weldTabs ? [['welds', 'LISL · Welds', welds.length]] : []), ...(mtoTabs ? (['mto', 'calculation', 'cut-list'] as const).filter(key => canReadReport(key) && !(pilot && key === 'calculation')).map(key => [key, key === 'mto' ? (pilot ? 'Materials' : 'MTO') : key === 'calculation' ? 'Calculation · MSPS' : 'Cut list', activeRows(rows, key === 'mto' ? 'iso_materials' : key === 'calculation' ? 'calculation_lines' : 'cut_list').filter(row => row.isoId === isoId).length]) : []), ...(canRecord('spools') ? [['spools', 'Spools', spools.length]] : []), ...(canRecord('attachments') ? [['documents', 'Documents', documents.length]] : [])];
  const tab = lislPage ? 'welds' : tabs.some(([key]) => key === selectedTab) ? selectedTab : String(tabs[0]?.[0] || '');
  const otherPilot = pilot?.allowed.find(other => other.key !== pilot.pilot.key);
  const canEdit = canRecord('isometrics', 'edit', iso), recordEntries = headingHasOptions(Boolean(pilot), tab);
  const editSpool = (spool?: Row) => { setEditingSpool(spool); setEditor('spools'); };
  const count = (value: number) => <span className="count-pill">{value}</span>;
  /** The page's own entries of the Options menu (ISO_PAGE_MENU); in Weld Core they join the LISL's entries in one menu. */
  const pageItem = (key: string, label: string): ReactNode => {
    switch (key) {
      case 'edit-isometric': return canEdit ? <button type="button" onClick={() => setEditor('isometrics')}>{label}</button> : null;
      case 'edit-quantities': return <button type="button" onClick={() => setQuantities(true)}>{label}</button>;
      case 'spools': return lislPage && canRecord('spools') ? <button type="button" onClick={() => setListing('spools')}>{label}{count(spools.length)}</button> : null;
      case 'documents': return lislPage && canRecord('attachments') ? <button type="button" onClick={() => setListing('documents')}>{label}{count(documents.length)}</button> : null;
      case 'attachments': return recordEntries ? <button type="button" disabled={!canRecord('attachments')} onClick={() => setAttaching(true)}>{label}<AttachmentCountBadge isoId={isoId}/></button> : null;
      case 'audit-trail': return recordEntries ? <button type="button" onClick={() => setAuditing(true)}>{label}</button> : null;
      case 'set-phase': return recordEntries ? <button type="button" disabled={!canRun('phases', { isoIds: [iso.id] })} onClick={() => setPhasing(true)}>{label}</button> : null;
      // The full-field register (the former "LISL (all fields)" view), filtered on this isometric.
      case 'data-lisl': return lislPage && hasFeature('lisl') && canReadReport('lisl') && pagePilots('/welding/lisl').includes(pilot!.pilot.key) ? <Link to={dataLislUrl(iso)}>{label}</Link> : null;
      case 'other-core': return otherPilot ? <button type="button" onClick={() => pilot!.openPilot(otherPilot.key, `/workspace/isometrics/${isoId}`)}>Open in {otherPilot.title}</button> : null;
      // The entry names what its dialog says: "Delete isometric" in the hosted profile (soft delete), "Archive isometric" where the dialog archives.
      case 'archive': return canRecord('isometrics', 'delete', iso) ? <button type="button" className="dropdown-danger" onClick={() => setArchiving(true)}>{hasFeature('pilots') ? label : 'Archive isometric'}</button> : null;
      default: return null;
    }
  };
  const groupedMenu = (groups: ReturnType<typeof menuGroups<ReactNode>>) => groups.length ? <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}>{groups.map((group, position) => <Fragment key={group.group}>{position > 0 && <div role="separator" className="dropdown-divider"/>}{group.items.map(item => <Fragment key={item.key}>{item.node}</Fragment>)}</Fragment>)}</Dropdown> : null;
  const current = lislPage ? 'LISL' : String(tabs.find(([key]) => key === tab)?.[1] || 'Isometric');
  const topLine = (actions: ReactNode) => <div className="iso-topline">
    <nav className="iso-crumbs" aria-label="Isometric location"><ol>
      <li><Link to="/dashboard" title="Main project">{String(site?.name || 'Main project')}</Link></li>
      <li><Link to={`/workspace/projects/${iso.projectId}/isometrics`} title={String(project?.description || 'Sub-project')}>{String(project?.internnumber || 'Sub-project')}</Link></li>
      <li className="iso-switcher"><label className="sr-only" htmlFor="workspace-isometric">Switch isometric</label><select id="workspace-isometric" value={isoId} onChange={event => navigate(`/workspace/isometrics/${event.target.value}`)}>{isos.map(row => <option key={row.id} value={row.id}>{String(row.isoNo)}</option>)}</select><button type="button" className="icon-btn" aria-label="Previous isometric" disabled={index <= 0} onClick={() => navigate(`/workspace/isometrics/${isos[index - 1].id}`)}><ChevronLeft size={17}/></button><button type="button" className="icon-btn" aria-label="Next isometric" disabled={index + 1 >= isos.length} onClick={() => navigate(`/workspace/isometrics/${isos[index + 1].id}`)}><ChevronRight size={17}/></button><IsoStartedTag iso={iso}/></li>
      <li aria-current="page">{current}</li>
    </ol></nav>
    <div className="iso-topline-actions">{actions}</div>
  </div>;
  const header = <IsometricHeader iso={iso} project={project} documents={documents} onEditIsometric={canEdit ? () => setEditor('isometrics') : undefined} quantities={quantities} onQuantities={setQuantities}/>;
  const strips = <div className="iso-strips">
    <IsoFlangesCard isoId={isoId}/>
    {canRecord('welds') && canRecord('diameters') && <details className="panel iso-wdi-panel"><summary>Weld inch progress (WDI)<span>{wdiProgress(welds, rows.diameters || []).percent}% completed</span></summary><WdiProgress welds={welds} diameters={rows.diameters || []}/></details>}
  </div>;
  return <div className={`page workflow-page iso-workspace${lislPage ? ' iso-workspace-lisl' : ''}`}>
    <h1 className="sr-only">Isometric {String(iso.isoNo)}</h1>
    {lislPage ? <WeldsPanel iso={iso} pageItem={pageItem} layout={({ menu, addWeld, panel }) => <>{topLine(<>{menu}<PdfReportsMenu iso={iso}/>{addWeld}</>)}{header}{panel}{strips}</>}/> : <>
      {topLine(<>{groupedMenu(menuGroups(ISO_PAGE_MENU, entry => pageItem(entry.key, entry.label)))}<PdfReportsMenu iso={iso}/>{pilot?.pilot.key === 'mto' && <IsoBookButton iso={iso}/>}</>)}
      {header}
      <div className="iso-workspace-tabs" role="tablist" aria-label={pilot ? `${pilot.pilot.title} isometric records` : 'Isometric records'}>{tabs.map(([key, title, total]) => <button key={String(key)} id={`iso-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`iso-panel-${isoId}`} tabIndex={tab === key ? 0 : -1} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const buttons = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')); const next = buttons[(buttons.indexOf(event.currentTarget) + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]; next.click(); next.focus(); } }} onClick={event => { setTab(String(key)); event.currentTarget.focus(); }}>{String(title)}<span>{String(total)}</span></button>)}</div>
      <div role="tabpanel" id={`iso-panel-${isoId}`} aria-labelledby={`iso-tab-${tab}`}>
        {tab === 'welds' && !pilot && (canReadReport('lisl') ? <DataLisl key={isoId} scopeIsoId={isoId} scopeProjectId={String(iso.projectId)} embedded/> : <EmptyState title="Weld register restricted" description="Your permission profile does not include the LISL register."/>)}
        {pilot && tab === 'mto' && <IsoMaterialsPanel key={isoId} iso={iso} onAttachments={() => setAttaching(true)} onAudit={() => setAuditing(true)} onPhase={() => setPhasing(true)}/>}
        {(['mto', 'calculation'] as const).filter(mode => !(pilot && mode === 'mto')).map(mode => tab === mode && <Suspense key={mode + isoId} fallback={<p role="status">Opening register…</p>}><PlanningRegister mode={mode} scopeIsoId={isoId} scopeProjectId={String(iso.projectId)}/></Suspense>)}
        {tab === 'cut-list' && <Suspense key={`cut-list-${isoId}`} fallback={<p role="status">Opening cut list…</p>}><CutListPanel iso={iso}/></Suspense>}
        {tab === 'spools' && <section className="panel"><div className="panel-heading"><h2>Spools</h2>{canRecord('spools', 'insert') && <button className="btn primary" onClick={() => editSpool(undefined)}><Plus size={16}/>Add spool</button>}</div><SpoolsTable spools={spools} welds={welds} onEdit={editSpool}/></section>}
        {tab === 'documents' && <section className="panel iso-documents"><div className="panel-heading"><h2>Drawing documents</h2>{canRecord('isometrics', 'import', iso) && <button className="btn" onClick={() => setUpload('ISO')}><Upload size={15}/>Upload document</button>}</div><DrawingDocuments documents={documents}/></section>}
      </div>
      {strips}
    </>}
    {/* Options → Spools / Drawing documents (Weld Core). The list steps aside while its editor or upload is open, and comes back after. */}
    {listing === 'spools' && !editor && <Modal title="Spools" subtitle={String(iso.isoNo)} wide onClose={() => setListing('')}><div className="modal-body iso-listing">{canRecord('spools', 'insert') && <div className="iso-listing-actions"><button type="button" className="btn primary" onClick={() => editSpool(undefined)}><Plus size={16}/>Add spool</button></div>}<SpoolsTable spools={spools} welds={welds} onEdit={editSpool}/></div><div className="modal-footer"><button type="button" className="btn" onClick={() => setListing('')}>Close</button></div></Modal>}
    {listing === 'documents' && !upload && <Modal title="Drawing documents" subtitle={String(iso.isoNo)} wide onClose={() => setListing('')}><div className="modal-body iso-listing iso-documents">{canRecord('isometrics', 'import', iso) && <div className="iso-listing-actions"><button type="button" className="btn" onClick={() => setUpload('ISO')}><Upload size={15}/>Upload document</button></div>}<DrawingDocuments documents={documents}/></div><div className="modal-footer"><button type="button" className="btn" onClick={() => setListing('')}>Close</button></div></Modal>}
    {editor && <RecordEditor resourceKey={editor} record={editor === 'isometrics' ? iso : editingSpool} defaults={{ isoId }} onClose={() => setEditor('')}/>}
    {archiving && <ArchiveRecordDialog resourceKey="isometrics" record={iso} onClose={() => setArchiving(false)} onSaved={() => navigate(`/workspace/projects/${iso.projectId}/isometrics`)}/>}
    {upload && <DrawingUpload iso={iso} kind={upload} onClose={() => setUpload('')}/>}
    {phasing && <PhaseDialog records={[iso]} onClose={() => setPhasing(false)}/>}
    {auditing && <IsoAuditDialog iso={iso} onClose={() => setAuditing(false)}/>}
    {attaching && <IsoAttachmentsDialog iso={iso} onClose={() => setAttaching(false)}/>}
  </div>;
}
