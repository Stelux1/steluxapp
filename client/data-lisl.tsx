import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, FileStack, Plus, Pencil, Printer, ScanLine, ClipboardCheck } from 'lucide-react';
import { LISL_COLUMNS } from '../shared/lisl.ts';
import { buildReport } from '../shared/reports.ts';
import { useWorkspace } from './context.tsx';
import { Badge, EmptyState, FieldInput, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor, WorkflowDialog } from './dialogs.tsx';
import type { Row } from '../shared/types.ts';

const groups = [...new Set(LISL_COLUMNS.map(column => column.group))];
const overview = ['Weld Type', 'Joint type', 'Welder', 'VT', 'NDT Req#', 'Index No 1', 'Charge No 1', 'Material 1', 'Index No 2', 'Charge No 2', 'Material 2', 'WPS No', 'Diameter (inch)', 'Spool', 'Weld date'];
export function DataLisl({ scopeIsoId = '', scopeProjectId = '', embedded = false }: { scopeIsoId?: string; scopeProjectId?: string; embedded?: boolean }) {
  const { rows, siteId, canRecord, canRun, canReadReport, openRecord, hasFeature } = useWorkspace();
  const [projectId, setProject] = useState(scopeProjectId), [isoId, setIso] = useState(scopeIsoId), [query, setQuery] = useState('');
  const [group, setGroup] = useState('LISL overview'), [ndtRequired, setNdt] = useState(''), [inspection, setInspection] = useState<Row | null>(null), [page, setPage] = useState(0), [editor, setEditor] = useState<Row | 'new' | null>(null);
  if (!hasFeature('lisl') || !canReadReport('lisl')) return <EmptyState title="This area is restricted" description="Your profile does not include the LISL register."/>;
  const report = buildReport('lisl', rows, { projectId, isoId, siteId, ndtRequired });
  const filtered = report.rows.filter(row => !query.trim() || Object.values(row.values).some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => String(a.values.Isometric).localeCompare(String(b.values.Isometric), 'en', { numeric: true }) || String(a.values['Weld No']).localeCompare(String(b.values['Weld No']), 'en', { numeric: true }));
  const pinned = embedded ? ['Weld No'] : ['Isometric', 'Weld No'];
  const keys = group === 'LISL overview' ? overview : LISL_COLUMNS.filter(column => group === 'All fields' || column.group === group).map(column => column.key);
  const columns = [...new Set([...pinned, ...keys.filter(key => !embedded || key !== 'Isometric')])].map(key => LISL_COLUMNS.find(column => column.key === key)!);
  const pages = Math.max(1, Math.ceil(filtered.length / 50)), currentPage = Math.min(page, pages - 1);
  const shown = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  const summary = [
    ['Registered welds', filtered.length], ['Welded', filtered.filter(row => row.values['Weld date']).length],
    ['VT accepted', filtered.filter(row => row.values.VT === 'Yes').length], ['NDT required', filtered.filter(row => row.values['NDT Req#'] === 'Yes').length],
  ];
  const csvUrl = `/api/reports/lisl?${new URLSearchParams({ projectId, isoId, siteId, ndtRequired, q: query.trim() })}`;
  function cell(key: string, value: unknown, weld: Row | undefined) {
    const display = value === '' || value === null || value === undefined ? <span className="muted">—</span> : String(value);
    if (key === 'Isometric' && weld) return <button className="record-link" onClick={() => openRecord('isometrics', String(weld.isoId))}>{display}</button>;
    if (key === 'Weld No' && weld) return <button className="record-link lisl-weld-no" onClick={() => openRecord('welds', weld.id)}>{display}</button>;
    const side = /[12]$/.exec(key)?.[0];
    const resource = key.startsWith('Index No') ? 'certifications' : key.startsWith('Material ') ? 'materials' : key === 'WPS No' ? 'wps' : key === 'Spool' ? 'spools' : key === 'Welder' ? 'welders' : '';
    const id = resource === 'certifications' ? weld?.[`certificate${side}Id`] : resource === 'materials' ? weld?.[`material${side}Id`] : resource === 'wps' ? weld?.wpsId : resource === 'welders' ? weld?.welder1Id : weld?.spoolId;
    if (resource && id && canRecord(resource)) return <button className="text-link" onClick={() => openRecord(resource, String(id))}>{display}</button>;
    return ['Yes', 'No', 'Accepted', 'Rejected'].includes(String(value)) ? <Badge>{String(value)}</Badge> : display;
  }
  return <div className={embedded ? "lisl-page lisl-embedded" : "page lisl-page"}>
    <div className="page-heading"><div><div className="eyebrow">BLITZKRIEG · WELD TRACEABILITY</div>{embedded ? <h2>Line inspection summary list</h2> : <h1>Data LISL</h1>}<p>From isometric to inspection. Every weld and both material certificates in one register.</p></div><div className="heading-actions">{canReadReport('lisl', 'export') && <a className="btn" href={csvUrl}><Download size={16}/>Export 87 fields</a>}{canReadReport('lisl', 'print') && <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>}{canRecord('welds', 'insert') && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add weld</button>}</div></div>
    {!embedded && <div className="lisl-summary">{summary.map(([label, value], i) => <div className="panel" key={label}><span className={`lisl-summary-icon tone-${i}`}><ScanLine size={20}/></span><div><span>{label}</span><strong>{value}</strong></div></div>)}</div>}
    <section className="panel lisl-register"><div className="lisl-filters"><SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search all 87 fields…"/>{!embedded && <><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => { setProject(String(value)); setIso(''); setPage(0); }}/><FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={value => { setIso(String(value)); setPage(0); }}/></>}<div className="field"><label htmlFor="lisl-ndt-filter">NDT requirement</label><select id="lisl-ndt-filter" value={ndtRequired} onChange={e => { setNdt(e.target.value); setPage(0); }}><option value="">All welds</option><option value="yes">NDT required</option><option value="no">NDT not required</option></select></div>{(query || ndtRequired || !embedded && (isoId || projectId)) && <button className="btn small" onClick={() => { setQuery(''); setIso(scopeIsoId); setProject(scopeProjectId); setNdt(''); setPage(0); }}>Clear filters</button>}</div>
      <div className="lisl-groups" role="group" aria-label="Column groups">{['LISL overview', ...groups, 'All fields'].map(name => <button key={name} aria-pressed={group === name} className={group === name ? 'selected' : ''} onClick={() => setGroup(name)}>{name}<span>{name === 'LISL overview' ? overview.length + (embedded ? 1 : 2) : name === 'All fields' ? 87 : LISL_COLUMNS.filter(column => column.group === name).length}</span></button>)}</div>
      <div className="lisl-table-title"><span><FileStack size={17}/><strong>{group}</strong></span><small>{columns.length} columns · {embedded ? 'Weld number stays visible' : 'ISO and weld number stay visible'} · search covers all fields</small></div>
      <TableScroll><table className={`data-table lisl-table ${embedded ? "lisl-table-embedded" : ""}`} aria-label="LISL weld traceability register"><thead><tr>{columns.map(column => <th key={column.key}>{column.label === 'VT Uploade' ? 'VT document uploaded' : column.label === 'Pre-HT locaction' ? 'Pre-HT location' : column.label}</th>)}<th className="lisl-row-actions">Actions</th></tr></thead><tbody>{shown.map(row => { const weld = rows.welds?.find(weld => weld.id === row.id); return <tr key={row.id}>{columns.map(column => <td key={column.key}>{cell(column.key, row.values[column.key], weld)}</td>)}<td className="lisl-row-actions">{weld && canRecord('welds', 'edit', weld) && <button className="icon-btn" aria-label={`Edit weld ${row.values['Weld No']}`} onClick={() => setEditor(weld)}><Pencil size={16}/></button>}{weld && canRun('inspection-request', {type: 'NDT'}) && <button className="icon-btn" aria-label={`Request NDT for weld ${row.values['Weld No']}`} onClick={() => setInspection(weld)}><ClipboardCheck size={16}/></button>}</td></tr>; })}</tbody></table></TableScroll>
      {!filtered.length && <EmptyState title="No welds found" description="Add a weld or adjust the project, isometric, and search filters."/>}
      <div className="table-footer"><span role="status">{filtered.length ? `${currentPage * 50 + 1}–${Math.min((currentPage + 1) * 50, filtered.length)}` : '0'} of {filtered.length} welds</span><div><button className="btn small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} / {pages}</span><button className="btn small" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    </section><p className="lisl-history-note">NDT 1–4 show the first four requests in date order and the latest result for each request. <Link to="/welding/inspection_results">Open the complete inspection history<ArrowRight size={14}/></Link></p>
    {inspection && <WorkflowDialog actionKey="inspection-request" defaults={{weldIds: [inspection.id], type: 'NDT'}} onClose={() => setInspection(null)}/>}
    {editor && <RecordEditor resourceKey="welds" record={editor === 'new' ? undefined : editor} defaults={isoId ? { isoId } : {}} onClose={() => setEditor(null)}/>}
  </div>;
}
