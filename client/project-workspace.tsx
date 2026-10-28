import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FileStack, FolderKanban, MapPin, Pencil, Plus, ScanLine, Upload, FileText, Download, Loader2 } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useWorkspace, activeRows } from './context.tsx';
import { Badge, EmptyState, Modal, Progress, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { TablePage } from './records.tsx';
import { DataLisl } from './data-lisl.tsx';
import { api, formatDate, formatNumber } from './api.ts';
import type { Row } from '../shared/types.ts';

export function MainProjects() {
  const { allRows, canRecord, selectSite } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState(''), [editor, setEditor] = useState<Row | 'new' | null>(null);
  const sites = activeRows(allRows, 'sites').filter(site => [site.name, site.residence, site.address].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
  return <div className="page workflow-page main-projects-page">
    <div className="page-heading"><div><div className="eyebrow">BLITZKRIEG · PROJECT WORKSPACE</div><h1>Select a main project</h1><p>Open a project to work with its subprojects, isometrics, and weld records.</p></div>{canRecord('sites', 'insert') && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add main project</button>}</div>
    <div className="project-picker-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search main projects…"/><span>{sites.length} main projects</span></div>
    <div className="main-project-grid">{sites.map(site => {
      const projects = activeRows(allRows, 'projects').filter(project => project.siteId === site.id);
      const isos = activeRows(allRows, 'isometrics').filter(iso => projects.some(project => project.id === iso.projectId));
      const welds = activeRows(allRows, 'welds').filter(weld => isos.some(iso => iso.id === weld.isoId));
      const completed = welds.filter(weld => weld.date).length;
      return <section className="panel main-project-card" key={site.id}><div className="main-project-card-top"><span className="project-card-icon"><FolderKanban size={25}/></span>{canRecord('sites', 'edit', site) && <button className="icon-btn" aria-label={`Edit main project ${site.name}`} onClick={() => setEditor(site)}><Pencil size={16}/></button>}</div><h2>{String(site.name)}</h2><p className="project-location"><MapPin size={14}/>{String(site.residence || site.address || 'Location not recorded')}</p><div className="project-card-counts"><div><strong>{projects.length}</strong><span>Subprojects</span></div><div><strong>{isos.length}</strong><span>Isometrics</span></div><div><strong>{welds.length}</strong><span>Welds</span></div></div><div className="project-card-progress"><span>Weld execution <strong>{welds.length ? Math.round(completed / welds.length * 100) : 0}%</strong></span><Progress value={welds.length ? completed / welds.length * 100 : 0}/></div><button className="btn primary" onClick={() => { selectSite(site.id); navigate('/dashboard'); }}>Open project<ArrowRight size={16}/></button></section>;
    })}</div>
    {!sites.length && <EmptyState title={query ? 'No matching main projects' : 'Create your first main project'} description={query ? 'Try another project name or location.' : 'Add a main project, then create its numbered subprojects and isometrics.'}/>}
    {editor && <RecordEditor resourceKey="sites" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
  </div>;
}

export function ProjectOverview() {
  const { rows, siteId, canRecord, canReadReport, openRecord } = useWorkspace();
  const [editor, setEditor] = useState(false);
  const site = rows.sites?.find(row => row.id === siteId);
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
    <div className="page-heading"><div><div className="eyebrow">MAIN PROJECT · DASHBOARD</div><h1>{String(site?.name || 'Project overview')}</h1><p>Execution and traceability across this project's subprojects.</p></div><div className="heading-actions"><Link className="btn" to="/workspace/main-projects"><ArrowLeft size={16}/>All main projects</Link>{canRecord('projects', 'insert') && <button className="btn primary" onClick={() => setEditor(true)}><Plus size={16}/>Add subproject</button>}</div></div>
    <div className="workflow-stats">{[
      ['Subprojects', projects.length, `${isos.length} isometrics`, FolderKanban], ['Registered welds', welds.length, `${welded} welded`, ScanLine], ['WDI total', formatNumber(wdi), 'Diameter inches · all registered welds', FileStack], ['NDT required', ndt, 'Welds marked for examination', ScanLine],
    ].map(([title, value, description, Icon]) => { const I = Icon as typeof FileStack; return <div className="panel workflow-stat" key={String(title)}><span className="project-card-icon"><I size={20}/></span><small>{String(title)}</small><strong>{String(value)}</strong><span>{String(description)}</span></div>; })}</div>
    <div className="project-analytics-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">PRODUCTION</span><h2>Weld execution</h2></div><Badge>{welds.length ? Math.round(welded / welds.length * 100) : 0}% welded</Badge></div><div className="project-production-chart" role="img" aria-label={`Welds completed by week: ${weekly.map(item => `${item.week}: ${item.welds}`).join(', ')}`}><ResponsiveContainer width="100%" height={210}><BarChart data={weekly} margin={{ left: -20, right: 20, bottom: 5 }}><CartesianGrid vertical={false} stroke="#e2eaf5" strokeDasharray="3 4"/><XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><Tooltip cursor={{ fill: '#edf4ff' }}/><Bar dataKey="welds" name="Completed welds" fill="#0064e8" radius={[5, 5, 0, 0]} maxBarSize={36}/></BarChart></ResponsiveContainer></div></section>
      <section className="panel workflow-steps"><div className="panel-heading"><div><span className="eyebrow">PROJECT WORKFLOW</span><h2>Continue your work</h2></div></div>{[['/workspace/projects', '01', 'Subprojects', 'Open a subproject and its drawing list'], ['/workspace/isometrics', '02', 'ISO overview', 'Revisions, ITP references, and weld progress'], ['/welding/lisl', '03', 'LISL register', 'Welds and both material certificates']].filter(([path]) => path !== '/welding/lisl' || canReadReport('lisl')).map(([path, step, title, text]) => <Link key={path} to={path}><span>{step}</span><div><strong>{title}</strong><small>{text}</small></div><ArrowRight size={16}/></Link>)}</section></div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SUBPROJECTS</span><h2>Project progress</h2></div><Link className="text-link" to="/workspace/projects">View all subprojects<ArrowRight size={15}/></Link></div><TableScroll><table className="data-table"><thead><tr><th>Subproject</th><th>Name</th><th>Isometrics</th><th>Weld execution</th><th>Status</th><th/></tr></thead><tbody>{projects.map(project => {
      const drawings = isos.filter(iso => iso.projectId === project.id), scope = welds.filter(weld => drawings.some(iso => iso.id === weld.isoId)), complete = scope.filter(weld => weld.date).length;
      return <tr key={project.id}><td><button className="record-link" onClick={() => openRecord('projects', project.id)}>{String(project.internnumber)}</button></td><td>{String(project.description || '—')}</td><td>{drawings.length}</td><td><div className="subproject-progress"><Progress value={scope.length ? complete / scope.length * 100 : 0}/><span>{complete} / {scope.length}</span></div></td><td><Badge>{String(project.status || 'Active')}</Badge></td><td><button className="icon-btn" aria-label={`Open subproject ${project.internnumber}`} onClick={() => openRecord('projects', project.id)}><ArrowRight size={16}/></button></td></tr>;
    })}</tbody></table></TableScroll>{!projects.length && <EmptyState title="No subprojects yet" description="Add the first subproject to start building this project's drawing list."/>}</section>
    {editor && <RecordEditor resourceKey="projects" defaults={{ siteId }} onClose={() => setEditor(false)}/>}
  </div>;
}

export function SubprojectWorkspace() {
  const { projectId = '' } = useParams();
  const { rows, canRecord } = useWorkspace();
  const [editor, setEditor] = useState(false);
  const project = rows.projects?.find(row => row.id === projectId && !row._archived);
  if (!project || !canRecord('isometrics')) return <EmptyState title="Subproject unavailable" description="Choose a subproject in the selected main project."/>;
  return <><div className="page subproject-banner"><Link className="text-link" to="/workspace/projects"><ArrowLeft size={15}/>Subprojects</Link><div><div><span className="eyebrow">SUBPROJECT {String(project.internnumber)}</span><h2>{String(project.description || project.internnumber)}</h2><p>{String(project.contact || '')}{project.contact && ' · '}{String(project.status || 'Active')}</p></div>{canRecord('projects', 'edit', project) && <button className="btn" onClick={() => setEditor(true)}><Pencil size={15}/>Edit subproject</button>}</div></div><TablePage key={projectId} resourceKey="isometrics" scopeProjectId={projectId}/>{editor && <RecordEditor resourceKey="projects" record={project} onClose={() => setEditor(false)}/>}</>;
}

function DrawingUpload({ iso, kind, onClose }: { iso: Row; kind: string; onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return; setBusy(true); setError('');
    const body = new FormData(); body.set('file', file); body.set('entityType', 'isometrics'); body.set('entityId', iso.id); const revision = kind === 'ISO' ? iso.revNo : iso.itpRevNo; body.set('documentType', revision !== undefined && revision !== '' ? `${kind} revision ${revision}` : kind);
    try { await api('/files', { method: 'POST', body }); await refresh(); notify(`${kind} document attached.`); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`Upload ${kind} document`} subtitle={String(iso.isoNo)} onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}<div className="field"><label htmlFor="iso-document-file">Document file</label><input id="iso-document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" required onChange={event => setFile(event.target.files?.[0] || null)}/><small>Earlier uploads remain in Documents. Update drawing references through Edit isometric.</small></div></div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload document</button></div></form></Modal>;
}

export function IsometricWorkspace() {
  const { isoId = '' } = useParams();
  const { rows, canRecord, canReadReport, openRecord } = useWorkspace();
  const navigate = useNavigate();
  const [editor, setEditor] = useState(''), [editingSpool, setEditingSpool] = useState<Row | undefined>(), [tab, setTab] = useState('welds'), [upload, setUpload] = useState('');
  const iso = rows.isometrics?.find(row => row.id === isoId && !row._archived);
  if (!iso || !canRecord('isometrics')) return <EmptyState title="Isometric unavailable" description="Choose an isometric in the selected main project."/>;
  const project = rows.projects?.find(row => row.id === iso.projectId);
  const isos = activeRows(rows, 'isometrics').filter(row => row.projectId === iso.projectId).sort((a, b) => String(a.isoNo).localeCompare(String(b.isoNo), 'en', { numeric: true }));
  const index = isos.findIndex(row => row.id === isoId), welds = activeRows(rows, 'welds').filter(row => row.isoId === isoId), spools = activeRows(rows, 'spools').filter(row => row.isoId === isoId);
  const documents = activeRows(rows, 'attachments').filter(row => row.entityType === 'isometrics' && row.entityId === isoId).sort((a, b) => b._createdAt.localeCompare(a._createdAt));
  const wdi = welds.reduce((total, weld) => total + Number(rows.diameters?.find(diameter => diameter.id === weld.diameterId)?.sizeinch || 0), 0);
  return <div className="page workflow-page iso-workspace">
    <div className="iso-workspace-navigation"><Link className="text-link" to={`/workspace/projects/${iso.projectId}/isometrics`}><ArrowLeft size={15}/>{String(project?.internnumber || 'Subproject')} · Isometrics</Link><div><label className="sr-only" htmlFor="workspace-isometric">Switch isometric</label><select id="workspace-isometric" value={isoId} onChange={event => navigate(`/workspace/isometrics/${event.target.value}`)}>{isos.map(row => <option key={row.id} value={row.id}>{String(row.isoNo)}</option>)}</select><button className="icon-btn" aria-label="Previous isometric" disabled={index <= 0} onClick={() => navigate(`/workspace/isometrics/${isos[index - 1].id}`)}><ChevronLeft size={18}/></button><button className="icon-btn" aria-label="Next isometric" disabled={index + 1 >= isos.length} onClick={() => navigate(`/workspace/isometrics/${isos[index + 1].id}`)}><ChevronRight size={18}/></button></div></div>
    <div className="page-heading"><div><div className="eyebrow">ISOMETRIC WORKSPACE</div><h1>{String(iso.isoNo)}</h1><p>{String(project?.description || project?.internnumber || '')}{iso.area || iso.zone ? ` · ${iso.area || iso.zone}` : ''}</p></div><div className="heading-actions">{canRecord('isometrics', 'edit', iso) && <button className="btn" onClick={() => setEditor('isometrics')}><Pencil size={15}/>Edit isometric</button>}</div></div>
    <section className="panel iso-context-panel"><div className="iso-drawing-links">{['ISO', 'ITP'].map(kind => {
      const revision = kind === 'ISO' ? iso.revNo : iso.itpRevNo;
      const file = documents.find(row => row.documentType === `${kind} revision ${revision}` || row.documentType === kind);
      return <div key={kind}><FileText size={20}/><div><small>{kind === 'ISO' ? 'Isometric drawing' : 'Inspection & test plan'}</small>{file ? <a className="text-link" href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">{String(kind === 'ISO' ? iso.isoNo : iso.itpNo || 'ITP document')}<Download size={13}/></a> : <strong>{String(kind === 'ISO' ? iso.isoNo : iso.itpNo || 'Not assigned')}</strong>}<span>Rev {String(revision ?? '—')}{!file && ' · No file attached'}</span></div>{canRecord('isometrics', 'import', iso) && <button className="icon-btn" aria-label={`Upload ${kind} document`} onClick={() => setUpload(kind)}><Plus size={18}/></button>}</div>;
    })}<div className="iso-wdi"><small>WDI total</small><strong>{formatNumber(wdi)} <span>dia-inch</span></strong><span>{welds.length} registered welds · {welds.filter(row => row.date).length} welded</span></div></div><dl className="iso-technical-details">{[['Area / zone', iso.area || iso.zone], ['Piping class', iso.pipingClass], ['Test pressure', iso.testPressure], ['Test medium', iso.testMedium], ['Material', iso.material], ['IRN', iso.irn], ['Asset tag', iso.assetTag], ['Drawing no.', iso.drawingNo]].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value || '—')}</dd></div>)}</dl></section>
    <div className="iso-workspace-tabs" role="tablist" aria-label="Isometric records">{[['welds', 'LISL · Welds', welds.length], ...(canRecord('spools') ? [['spools', 'Spools', spools.length]] : []), ...(canRecord('attachments') ? [['documents', 'Documents', documents.length]] : [])].map(([key, title, count]) => <button key={String(key)} id={`iso-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`iso-panel-${isoId}`} tabIndex={tab === key ? 0 : -1} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const buttons = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')); const next = buttons[(buttons.indexOf(event.currentTarget) + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]; next.click(); next.focus(); } }} onClick={event => { setTab(String(key)); event.currentTarget.focus(); }}>{String(title)}<span>{String(count)}</span></button>)}</div>
    <div role="tabpanel" id={`iso-panel-${isoId}`} aria-labelledby={`iso-tab-${tab}`}>
      {tab === 'welds' && (canReadReport('lisl') ? <DataLisl key={isoId} scopeIsoId={isoId} scopeProjectId={String(iso.projectId)} embedded/> : <EmptyState title="Weld register restricted" description="Your permission profile does not include the LISL register."/>)}
      {tab === 'spools' && <section className="panel"><div className="panel-heading"><h2>Spools</h2>{canRecord('spools', 'insert') && <button className="btn primary" onClick={() => { setEditingSpool(undefined); setEditor('spools'); }}><Plus size={16}/>Add spool</button>}</div><TableScroll><table className="data-table"><thead><tr><th>Spool</th><th>Diameter</th><th>Welds</th><th/></tr></thead><tbody>{spools.map(spool => <tr key={spool.id}><td><button className="record-link" onClick={() => openRecord('spools', spool.id)}>{String(spool.name)}</button></td><td>{String(spool.diameter || '—')}</td><td>{welds.filter(weld => weld.spoolId === spool.id).length}</td><td>{canRecord('spools', 'edit', spool) && <button className="icon-btn" aria-label={`Edit spool ${spool.name}`} onClick={() => { setEditingSpool(spool); setEditor('spools'); }}><Pencil size={16}/></button>}</td></tr>)}</tbody></table></TableScroll>{!spools.length && <EmptyState title="No spools in this isometric" description="Add a spool, then assign it when adding or editing a weld."/>}</section>}
      {tab === 'documents' && <section className="panel iso-documents"><div className="panel-heading"><h2>Drawing documents</h2>{canRecord('isometrics', 'import', iso) && <button className="btn" onClick={() => setUpload('ISO')}><Upload size={15}/>Upload document</button>}</div>{documents.map(file => <a className="attachment-row" key={file.id} href={`/api/files/${file.id}`} target="_blank" rel="noreferrer"><FileText size={22}/><div><strong>{String(file.name)}</strong><small>{String(file.documentType)} · {formatDate(file._createdAt)}</small></div><Download size={17}/></a>)}{!documents.length && <EmptyState title="No drawing documents attached" description="Use the plus beside ISO or ITP to upload a document."/>}</section>}
    </div>
    {editor && <RecordEditor resourceKey={editor} record={editor === 'isometrics' ? iso : editingSpool} defaults={{ isoId }} onClose={() => setEditor('')}/>}
    {upload && <DrawingUpload iso={iso} kind={upload} onClose={() => setUpload('')}/>}
  </div>;
}
