import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { materialQuantityLog } from '../shared/revisions.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { formatDate,formatNumber } from './api.ts';
import { Modal, EmptyState } from './components.tsx';
import { WorkflowDialog } from './dialogs.tsx';

export function MaterialQuantityLogDialog({requirementId,onClose}:{requirementId:string;onClose:()=>void}){
  const {rows,label,can}=useWorkspace();const [action,setAction]=useState('');
  const requirement=rows.iso_materials?.find(r=>r.id===requirementId);if(!requirement)return null;
  const log=materialQuantityLog(rows,requirement);const revisions=activeRows(rows,'revisions').filter(r=>r.type==='ISO'&&r.isoId===requirement.isoId);
  if(action)return <WorkflowDialog actionKey={action} defaults={action==='revision'?{isoId:requirement.isoId}:{requirementId}} onClose={()=>setAction('')}/>;
  return <Modal title="Material quantity log" subtitle={`${label('iso_materials',requirementId)} · ${label('isometrics',requirement.isoId)}`} onClose={onClose} wide><div className="modal-body">
    <div className="quantity-balances"><div><span>Beginning</span><strong>{formatNumber(log.beginning,3)}</strong></div><div><span>Now</span><strong>{formatNumber(log.current,3)}</strong></div></div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Change</th><th>Revision</th><th>Quantity</th><th>Balance</th><th>Notes</th></tr></thead><tbody>{log.changes.map(change=><tr key={change.id}><td>{formatDate(change.date)}</td><td>{String(change.type)}</td><td>{change.revisionId?`ISO ${label('revisions',change.revisionId)}`:'—'}</td><td>{Number(change.quantity)>0?'+':''}{formatNumber(change.quantity,3)}</td><td>{formatNumber(change.newQuantity,3)}</td><td>{String(change.note||'—')}</td></tr>)}</tbody></table></div>
    {!log.changes.length&&<EmptyState title="No quantity changes recorded" description="Quantity edits and removals appear here."/>}
    {can('materials',2)&&!requirement._archived&&<div className="quantity-revision-actions"><div><h3>Remove quantity by revision</h3><p>Choose an ISO revision and remove up to {formatNumber(log.current,3)} from this requirement.</p></div><button className="btn" disabled={!revisions.length||log.current<0.01} onClick={()=>setAction('remove-material-quantity')}><Minus size={15}/>Remove quantity</button>{!revisions.length&&<p className="muted">Add an ISO revision before recording a revision removal.</p>}{can('general',2)&&<button className="btn small" onClick={()=>setAction('revision')}><Plus size={14}/>Add drawing revision</button>}</div>}
  </div><div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div></Modal>;
}
