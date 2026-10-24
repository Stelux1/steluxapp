import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ClipboardCheck, CircleCheck, CircleAlert, Plus, ScanLine } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { weldingStats } from '../shared/module-metrics.ts';
import { formatDate, formatNumber } from './api.ts';
import { Badge, EmptyState, FieldInput, Progress, TableScroll } from './components.tsx';
import { WorkflowDialog } from './dialogs.tsx';
import { resourcePath } from './records.tsx';

export function WeldingDashboard() {
  const { rows, canRecord, canRun, label, openRecord, activity } = useWorkspace();
  const [projectId, setProject] = useState('');
  const [action, setAction] = useState('');
  const stats = weldingStats(rows, { projectId }, 'length');
  const weldIds = new Set(stats.welds.map(w => w.id));
  const requests = activeRows(rows, 'inspection_requests').filter(r => weldIds.has(String(r.weldId)));
  const open = requests.filter(r => r.status === 'Open');
  const rejected = requests.filter(r => r.status === 'Rejected');
  const cards = [
    { title: 'Welds registered', value: stats.welds.length, sub: `${stats.welds.filter(w => w.date).length} with a weld date`, icon: ScanLine, href: resourcePath('welds') },
    { title: 'Open inspections', value: open.length, sub: 'NDT and visual inspection requests', icon: ClipboardCheck, href: resourcePath('inspection_requests') + '?status=Open' },
    { title: 'NDT examined length', value: formatNumber(stats.examined), unit: 'mm', sub: 'Within the selected project scope', icon: CircleCheck, href: resourcePath('inspection_results') },
    { title: 'Needs follow-up', value: rejected.length, sub: 'Inspection requests with rejected results', icon: CircleAlert, href: resourcePath('inspection_requests') + '?status=Rejected' },
  ];
  if (!canRecord('welds')) return <EmptyState title="Workspace overview" description="Choose an available page from the navigation."/>;
  return <div className="page dashboard-page welding welding-overview">
    <div className="dashboard-heading"><div><div className="eyebrow">BLITZKRIEG WELDING</div><h1>Welding overview</h1><p>Track weld execution, inspection results, and the work that needs attention.</p></div><div className="heading-actions">{canRun('inspection-request') && <button className="btn primary" onClick={() => setAction('inspection-request')}><Plus size={16}/>Request inspection</button>}</div></div>
    <div className="overview-filter"><span><span className="live-dot"/>Workspace snapshot</span><div><FieldInput field={{ name: 'project', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => setProject(String(value))}/></div></div>
    <div className="stat-grid">{cards.filter(card => canRecord(card.href.split('/')[2]?.split('?')[0] || '')).map(card => <Link className="stat-card" to={card.href + (projectId ? `${card.href.includes('?') ? '&' : '?'}projectId=${projectId}` : '')} key={card.title}><div className="stat-card-top"><span className="stat-icon blue"><card.icon size={19}/></span><ArrowUpRight size={17}/></div><div className="stat-value">{card.value}{'unit' in card&&<small className="stat-unit">{card.unit}</small>}</div><strong>{card.title}</strong><p>{card.sub}</p></Link>)}</div>
    <div className="dashboard-main-grid">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">EXECUTION</span><h2>NDT inspection progress</h2></div></div><div className="welding-progress-summary"><strong>{stats.total ? Math.min(100, Math.round(stats.examined / stats.total * 100)) : 0}%</strong><p>{formatNumber(stats.examined)} of {formatNumber(stats.total)} mm examined</p><Progress value={stats.total ? stats.examined / stats.total * 100 : 0}/><p>{formatNumber(stats.repaired)} mm marked for repair</p></div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">WORK QUEUE</span><h2>Needs attention</h2></div></div>{[...rejected, ...open].slice(0, 3).map(request => <button className="attention-item welding-queue-item" key={request.id} onClick={() => openRecord('inspection_requests', request.id)}><span className={`attention-count ${request.status === 'Rejected' ? 'amber' : 'blue'}`}>{request.type}</span><div><strong>{label('welds', request.weldId)}</strong><p>{String(request.number)} · {String(request.status)}</p></div><ArrowUpRight size={16}/></button>)}{open.length+rejected.length>3&&<div className="queue-footer"><Link className="text-link" to={resourcePath('inspection_requests')}>View all inspections<ArrowRight size={14}/></Link></div>}{!open.length && !rejected.length && <EmptyState title="All caught up" description="No open or rejected inspection requests in this view."/>}</section>
    </div>
    <section className="panel projects-panel"><div className="panel-heading"><div><span className="eyebrow">WELD REGISTER</span><h2>Recent welds</h2></div><Link className="text-link" to={resourcePath('welds')}>View all welds<ArrowRight size={15}/></Link></div><TableScroll><table className="project-table"><thead><tr><th>Weld</th><th>Isometric</th><th>WPS</th><th>Weld date</th><th>Repair</th></tr></thead><tbody>{stats.welds.slice(0, 8).map(weld => <tr key={weld.id}><td><button className="record-link" onClick={() => openRecord('welds', weld.id)}>{String(weld.weldNo)}</button></td><td>{label('isometrics', weld.isoId)}</td><td>{label('wps', weld.wpsId)}</td><td>{formatDate(weld.date)}</td><td><Badge color={weld.repair ? 'amber' : 'neutral'}>{weld.repair ? 'Recorded' : '—'}</Badge></td></tr>)}</tbody></table></TableScroll>{!stats.welds.length && <EmptyState title="No welds in this view" description="Add a weld to an isometric or choose another project."/>}</section>
    <section className="panel welding-activity"><div className="panel-heading"><h2>Recent activity</h2></div><div className="activity-list">{activity.slice(0, 6).map(event => <div key={event.id}><strong>{event.summary}</strong><small>{event.actorName} · {formatDate(event.createdAt)}</small></div>)}</div></section>
    <footer className="workspace-footer"><span>BLITZKRIEG <span>Welding workspace.</span></span><span>Sample workspace <span className="live-dot"/></span></footer>
    {action && <WorkflowDialog actionKey={action} onClose={() => setAction('')}/>}
  </div>;
}
