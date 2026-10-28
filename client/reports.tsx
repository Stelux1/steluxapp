import { Wordmark } from './brand.tsx';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Printer, FileBarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildReport, type ReportFilters, type ReportColumn } from '../shared/reports.ts';
import { REPORTS } from './catalog.ts';
import { projectReport } from '../shared/release.ts';
import type { Module, Value } from '../shared/types.ts';
import { useWorkspace } from './context.tsx';
import { EmptyState, FieldInput, SearchInput, TableScroll } from './components.tsx';
import { formatDate, formatNumber } from './api.ts';

export function Reports({module}:{module:Module}){
  const {rows,user,siteId,canReadReport,openRecord}=useWorkspace();const [params,setParams]=useSearchParams();
  const definitions=REPORTS.filter(r=>r.module===module&&canReadReport(r.key));
  const key=definitions.find(r=>r.key===params.get('report'))?.key||definitions[0]?.key;
  const [filters,setFilters]=useState<ReportFilters>({});const [query,setQuery]=useState('');const [page,setPage]=useState(0);
  if(user.availability&&params.get('report')&&!Object.hasOwn(user.availability.reports,params.get('report')!))return <EmptyState title="Page not found" description="Choose a page from the workspace navigation."/>;
  if(!key)return <EmptyState title="Reports are restricted" description="Your profile does not include these reports."/>;
  const report=projectReport(user.availability,buildReport(key,rows,{...filters,siteId}));const filtered={...report,rows:report.rows.filter(r=>!query||Object.values(r.values).some(v=>String(v??'').toLowerCase().includes(query.toLowerCase())))};
  const dateReport=!['mto','spool-locations','isometric-status','open-welds'].includes(key);const tool=module==='tools';
  function change(name:string,value:unknown){setFilters(f=>({...f,[name]:String(value),...(name==='projectId'?{isoId:''}:{})}));setPage(0);}
  const downloadUrl=`/api/reports/${key}?${new URLSearchParams({siteId,...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),q:query}).toString()}`;
  const format=(value:Value|undefined,c:ReportColumn)=>value===''||value===undefined||value===null?'—':c.type==='date'?formatDate(value):c.type==='number'?formatNumber(value):String(value);
  const pages=Math.max(1,Math.ceil(filtered.rows.length/50));const current=Math.min(page,pages-1);
  return <div className="page reports-page"><div className="page-heading"><div><div className="eyebrow">BLITZKRIEG REPORTING</div><h1>Reports & documents</h1><p>Review the current records, export a spreadsheet, or print a project document.</p></div><div className="heading-actions">{canReadReport(key,'export')&&<a className="btn" href={downloadUrl}><Download size={16}/>Download CSV</a>}{canReadReport(key,'print')&&<button className="btn primary" onClick={()=>window.print()}><Printer size={16}/>Print / Save PDF</button>}</div></div>
    <section className="panel report-controls"><div className="report-selector"><span className="report-selector-icon"><FileBarChart2 size={24}/></span><div className="field"><label htmlFor="report-type">Report</label><select id="report-type" value={key} onChange={e=>{setParams({report:e.target.value});setFilters(f=>({...f,type:'',from:e.target.value==='open-welds'?'':f.from,to:e.target.value==='open-welds'?'':f.to}));setPage(0);}}>{definitions.map(r=><option key={r.key} value={r.key}>{r.title}</option>)}</select><small className="field-hint">{report.definition.description}</small></div></div><div className="report-filters">
      {!tool&&<><FieldInput field={{name:'projectId',label:'Project',type:'ref',ref:'projects'}} value={filters.projectId} onChange={v=>change('projectId',v)}/><FieldInput field={{name:'isoId',label:'Isometric',type:'ref',ref:'isometrics'}} values={{projectId:filters.projectId}} value={filters.isoId} onChange={v=>change('isoId',v)}/></>}
      {module==='welding'&&!['releases'].includes(key)&&<FieldInput field={{name:'welderId',label:'Welder',type:'ref',ref:'welders'}} value={filters.welderId} onChange={v=>change('welderId',v)}/>}
      {tool&&<FieldInput field={{name:'warehouseId',label:'Warehouse',type:'ref',ref:'warehouses'}} value={filters.warehouseId} onChange={v=>change('warehouseId',v)}/>}
      {key==='rentals'&&<FieldInput field={{name:'clientId',label:'Client',type:'ref',ref:'clients'}} value={filters.clientId} onChange={v=>change('clientId',v)}/>}
      {key.startsWith('inspection-')&&<FieldInput field={{name:'type',label:'Inspection type',type:'select',options:user.availability?.inspectionTypes||['NDT','NDT PRE','VI','PWHT','PRE-HT']}} value={filters.type} onChange={v=>change('type',v)}/>}
      {key==='releases'&&<FieldInput field={{name:'type',label:'Release type',type:'select',options:['Prefab','Field','Hydrotest']}} value={filters.type} onChange={v=>change('type',v)}/>}
      {dateReport&&<><FieldInput field={{name:'from',label:'From date',type:'date'}} value={filters.from} onChange={v=>change('from',v)}/><FieldInput field={{name:'to',label:'To date',type:'date'}} value={filters.to} onChange={v=>change('to',v)}/></>}
    </div><div className="report-search"><SearchInput value={query} onChange={v=>{setQuery(v);setPage(0);}} placeholder="Search report rows…"/><button className="text-link" onClick={()=>{setFilters({});setQuery('');setPage(0);}}>Clear filters</button><span>{filtered.rows.length} records</span></div></section>
    <section className={`panel report-document ${key==='weld-cards'?'card-document':''}`}><header className="report-document-heading"><div><span className="report-brand"><Wordmark dark/></span><h2>{report.definition.title}</h2><p>{Object.values(filters).filter(Boolean).length?'Filtered records':'All current records'} · {filtered.rows.length} records · Prepared {new Date().toLocaleDateString('en-GB')}</p></div><span className="report-document-mark">{module.toUpperCase()}<br/>OPERATIONS REPORT</span></header>
      {report.note&&<p className="report-note">{report.note}</p>}
      {key==='weld-cards'?<div className="weld-card-grid">{filtered.rows.map(r=><article className="weld-card" key={r.id}><div className="weld-card-heading"><Wordmark dark/><strong>WELD {r.values.weld}</strong></div><h3>{r.values.iso}</h3><div className="weld-card-meta">{['project','revision','spool','type','wps','welder1','welder2','welder3','welder4','date','wire1','wire2','charge1','charge2','ndt','pwht'].filter(k=>r.values[k]!==''&&r.values[k]!==undefined).map(k=><div key={k}><small>{report.columns.find(c=>c.key===k)?.label}</small><strong>{format(r.values[k],report.columns.find(c=>c.key===k)!)}</strong></div>)}</div></article>)}</div>:<TableScroll><table className="data-table report-table"><thead><tr>{report.columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{filtered.rows.map((r,index)=><tr className={index<current*50||index>=(current+1)*50?'report-off-page':''} key={r.id}>{report.columns.map((c,i)=><td key={c.key}>{i===0&&r.source?<button className="record-link" onClick={()=>openRecord(r.source!.resource,r.source!.id)}>{format(r.values[c.key],c)}</button>:format(r.values[c.key],c)}</td>)}</tr>)}</tbody></table></TableScroll>}
      {!filtered.rows.length&&<EmptyState title="No records in this report" description="Choose another scope or clear your filters."/>}
      <footer className="table-footer"><span>{filtered.rows.length} records · Blitzkrieg</span>{key!=='weld-cards'&&<div><button className="icon-btn" disabled={!current} aria-label="Previous report page" onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button><span>Page {current+1} of {pages}</span><button className="icon-btn" disabled={current+1>=pages} aria-label="Next report page" onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button></div>}</footer>
    </section></div>;
}
