import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, Download, Pencil, Plus, Printer } from 'lucide-react';
import { buildReport } from '../shared/reports.ts';
import type { Row } from '../shared/types.ts';
import { useWorkspace } from './context.tsx';
import { formatNumber } from './api.ts';
import { Badge, EmptyState, FieldInput, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor, WorkflowDialog } from './dialogs.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';

type PlanningMode = 'mto' | 'calculation' | 'cut-list';
const modes = { mto: { title: 'MTO · Material list', resource: 'iso_materials', singular: 'material' }, calculation: { title: 'Project calculation · MSPS', resource: 'calculation_lines', singular: 'calculation line' }, 'cut-list': { title: 'MSPS cut list', resource: 'cut_list', singular: 'cut list item' } };

export function ProjectPlanning() {
  const { canReadReport } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const mode = Object.keys(modes).find(key => key === params.get('view') && canReadReport(key)) as PlanningMode || (Object.keys(modes).find(key => canReadReport(key)) as PlanningMode);
  if (!mode) return <EmptyState title="Planning unavailable" description="Your permission profile does not include project planning."/>;
  return <div className="page workflow-page"><div className="iso-workspace-tabs" role="group" aria-label="Project planning">{Object.entries(modes).filter(([key]) => canReadReport(key)).map(([key, value]) => <button key={key} aria-pressed={mode === key} className={mode === key ? 'planning-selected' : ''} onClick={() => setParams({ view: key })}>{value.title}</button>)}</div><PlanningRegister key={mode} mode={mode}/></div>;
}

export function PlanningRegister({ mode, scopeIsoId = '', scopeProjectId = '' }: { mode: PlanningMode; scopeIsoId?: string; scopeProjectId?: string }) {
  const { rows, siteId, canRecord, canReadReport, openRecord } = useWorkspace();
  const [projectId, setProject] = useState(scopeProjectId), [isoId, setIso] = useState(scopeIsoId), [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Row | 'new' | 'norm' | null>(null), [archive, setArchive] = useState<Row | null>(null), [page, setPage] = useState(0);
  const info = modes[mode];
  if (!canReadReport(mode)) return <EmptyState title="Planning unavailable" description="Your permission profile does not include this register."/>;
  const report = buildReport(mode, rows, { siteId, projectId, isoId });
  const filtered = report.rows.filter(row => Object.values(row.values).some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase())));
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const incomplete = filtered.filter(row => mode === 'calculation' && row.values.status !== 'Ready').length;
  const total = filtered.reduce((sum, row) => sum + Number(row.values[mode === 'calculation' ? 'hours' : 'totalMm'] || 0), 0);
  const exportUrl = `/api/reports/${mode}?${new URLSearchParams({ siteId, projectId, isoId, q: query.trim() })}`;
  const defaults = { ...(isoId ? { isoId } : {}), ...(projectId ? { projectId } : {}) };
  return <section className="planning-register">
    <div className="page-heading"><div><h2>{info.title}</h2><p>{report.definition.description}</p></div><div className="heading-actions">
      {mode === 'calculation' && canRecord('calculation_norms', 'insert') && <button className="btn" onClick={() => setEditor('norm')}><Plus size={15}/>Add norm</button>}
      {canReadReport(mode, 'export') && <><a className="btn" href={exportUrl}><Download size={15}/>CSV</a><a className="btn" href={`${exportUrl}&format=xlsx`}><Download size={15}/>Excel</a></>}
      {canReadReport(mode, 'print') && <button className="btn" onClick={() => window.print()}><Printer size={15}/>Print</button>}
      {canRecord(info.resource, 'insert') && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={15}/>Add {info.singular}</button>}
    </div></div>
    {mode !== 'mto' && <div className="planning-summary panel"><strong>{formatNumber(mode === 'cut-list' ? total / 1000 : total)} {mode === 'cut-list' ? 'm total cutting length' : 'planned hours'}</strong><span>{filtered.length} {filtered.length === 1 ? 'line' : 'lines'}{incomplete > 0 ? ` · ${incomplete} incomplete, excluded from total` : ''}</span><p>{mode === 'cut-list' ? 'Length = pieces × entered cut length. Enter measured lengths including your required cutting allowances.' : 'Hours = current MTO quantity (or manual quantity) × your norm. Norms are entered by your team.'}</p></div>}
    {report.note && <p className="planning-note">{report.note}</p>}
    <div className="panel"><div className="lisl-filters"><SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder={`Search ${info.title.toLowerCase()}…`}/>{!scopeIsoId && <><FieldInput field={{ name: 'projectId', label: 'Subproject', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => { setProject(String(value)); setIso(''); setPage(0); }}/><FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={value => { setIso(String(value)); setPage(0); }}/></>}</div>
      <TableScroll><table className="data-table planning-table"><thead><tr>{report.columns.filter(column => !scopeIsoId || !['project', 'iso'].includes(column.key)).map(column => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{filtered.slice(current * 50, (current + 1) * 50).map(item => {
        const record = rows[info.resource]?.find(row => row.id === item.id);
        return <tr key={item.id}>{report.columns.filter(column => !scopeIsoId || !['project', 'iso'].includes(column.key)).map((column, index) => <td key={column.key}>{column.key === 'status' ? <Badge>{String(item.values[column.key])}</Badge> : index === 0 && record ? <button className="record-link" onClick={() => openRecord(info.resource, record.id)}>{String(item.values[column.key] ?? '—')}</button> : item.values[column.key] === null || item.values[column.key] === '' || item.values[column.key] === undefined ? '—' : column.type === 'number' ? formatNumber(item.values[column.key]) : String(item.values[column.key])}</td>)}<td className="actions-cell">{record && canRecord(info.resource, 'edit', record) && <button className="icon-btn" aria-label={`Edit ${info.singular} ${record.name || record.id}`} onClick={() => setEditor(record)}><Pencil size={16}/></button>}{record && canRecord(info.resource, 'delete', record) && <button className="icon-btn" aria-label={`Archive ${info.singular} ${record.name || record.id}`} onClick={() => setArchive(record)}><Archive size={16}/></button>}</td></tr>;
      })}</tbody></table></TableScroll>
      {!filtered.length && <EmptyState title={`No ${mode === 'mto' ? 'materials' : 'planning lines'} in this scope`} description={mode === 'calculation' ? 'Add your norms, then add operations with an MTO material or a manual quantity.' : mode === 'cut-list' ? 'Add MTO materials first, then enter the pieces and measured cutting lengths.' : 'Add a catalog material or a custom item with its required quantity.'}/>}
      <div className="table-footer"><span>{filtered.length} {filtered.length === 1 ? 'line' : 'lines'}</span><div><button className="btn small" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {Math.max(1, Math.ceil(filtered.length / 50))}</span><button className="btn small" disabled={(current + 1) * 50 >= filtered.length} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </div><p className="planning-note"><Link to={`/materials/${info.resource}`}>Manage records and restore archived items</Link>{mode === 'calculation' && <> · <Link to="/materials/calculation_norms">Manage calculation norms</Link></>}</p>
    {editor === 'new' && mode === 'mto' ? <WorkflowDialog actionKey="add-iso-material" defaults={defaults} onClose={() => setEditor(null)}/> : editor && <RecordEditor resourceKey={editor === 'norm' ? 'calculation_norms' : info.resource} record={typeof editor === 'object' ? editor : undefined} defaults={editor === 'norm' ? {} : defaults} onClose={() => setEditor(null)}/>}
    {archive && <ArchiveRecordDialog resourceKey={info.resource} record={archive} onClose={() => setArchive(null)}/>}
  </section>;
}
