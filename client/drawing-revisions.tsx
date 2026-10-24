import { Download,FileText } from 'lucide-react';
import { currentRevision } from '../shared/revisions.ts';
import { useWorkspace,activeRows } from './context.tsx';
import { formatDate } from './api.ts';

export function DrawingRevisions({isoId}:{isoId:string}){
  const {rows,openRecord}=useWorkspace();const revisions=activeRows(rows,'revisions').filter(r=>r.isoId===isoId).sort((a,b)=>b._createdAt.localeCompare(a._createdAt)||b.id.localeCompare(a.id));
  const files=activeRows(rows,'attachments').filter(f=>f.entityType==='revisions'&&revisions.some(r=>r.id===f.entityId));
  return <section className="drawing-revisions"><h3>Drawings & revisions</h3><div className="current-revisions">{['ISO','ITP','ITP 2'].map(type=><div key={type}><span>{type}</span><strong>Rev {currentRevision(rows,isoId,type)}</strong></div>)}</div>{revisions.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Document</th><th>Revision</th><th>Date</th><th>Comment</th><th>Drawing files</th></tr></thead><tbody>{revisions.map(revision=><tr key={revision.id}><td>{String(revision.type)}</td><td><button className="record-link" onClick={()=>openRecord('revisions',revision.id)}>{String(revision.revNo)}</button>{String(revision.revNo)===currentRevision(rows,isoId,String(revision.type))&&<small className="execution-subvalue">Current</small>}</td><td>{formatDate(revision.date)}</td><td>{String(revision.comment||'—')}</td><td>{files.filter(f=>f.entityId===revision.id).map(f=><a className="revision-document" key={f.id} href={`/api/files/${f.id}`}><FileText size={15}/>{String(f.name)}<Download size={13}/></a>)}{!files.some(f=>f.entityId===revision.id)&&<span className="muted">No file attached</span>}</td></tr>)}</tbody></table></div>:<p className="muted">No drawing revisions recorded yet.</p>}</section>;
}
