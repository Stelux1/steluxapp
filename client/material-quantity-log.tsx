import { useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { materialQuantityLog } from '../shared/revisions.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { ApiError, formatDate, formatNumber, post } from './api.ts';
import { Modal, EmptyState } from './components.tsx';

/** Revisions of the select, oldest first as the reference lists them: "1.00 RFC". */
const revisionName = (revision: Record<string, unknown>) => `${String(revision.revNo ?? '')}${revision.comment ? ` ${String(revision.comment)}` : ''}`;

/**
 * Quantity log of one material line: Beginning, each change, Now, and below it the one form that changes a quantity,
 * "Remove quantity by revision" (an ISO revision of the isometric and the quantity to remove; the server stamps the date).
 */
export function MaterialQuantityLogDialog({requirementId,onClose}:{requirementId:string;onClose:()=>void}){
  const {rows,label,can,refresh,notify}=useWorkspace();const id=useId();
  const requirement=rows.iso_materials?.find(r=>r.id===requirementId);
  const revisions=requirement?activeRows(rows,'revisions').filter(r=>r.type==='ISO'&&r.isoId===requirement.isoId).sort((a,b)=>String(a._createdAt).localeCompare(String(b._createdAt))||Number(a.revNo)-Number(b.revNo)):[];
  const [revisionId,setRevision]=useState(''),[quantity,setQuantity]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[problems,setProblems]=useState<Record<string,string>>({});
  if(!requirement)return null;
  const log=materialQuantityLog(rows,requirement),chosen=revisionId||revisions[0]?.id||'';
  async function submit(event:FormEvent){
    event.preventDefault();setError('');setProblems({});
    const amount=Number(quantity);
    if(!chosen){setProblems({revisionId:'Choose the revision.'});return;}
    if(!(amount>=0.01)||amount>log.current){setProblems({quantity:`Enter a quantity from 0.01 to ${formatNumber(log.current,2)}.`});return;}
    setBusy(true);
    try{await post('/actions/remove-material-quantity',{requirementId,revisionId:chosen,quantity:amount,expectedVersion:requirement!._version});await refresh();notify('Quantity removed.');setQuantity('');}
    catch(failure){setError((failure as Error).message);setProblems((failure as ApiError).fields||{});}finally{setBusy(false);}
  }
  const canChange=can('materials',2)&&!requirement._archived;
  return <Modal title="Quantity log" subtitle={`${label('iso_materials',requirementId)} · ${label('isometrics',requirement.isoId)}`} onClose={onClose} wide><div className="modal-body">
    <div className="table-scroll"><table className="data-table quantity-log-table"><tbody>
      <tr><th scope="row">Beginning</th><td>-</td><td className="number-cell">{formatNumber(log.beginning,2)}</td><td>-</td></tr>
      {log.changes.map(change=><tr key={change.id}><th scope="row">{formatDate(change.date)} {String(change.type)}</th><td>{change.revisionId?`ISO ${label('revisions',change.revisionId)}`:'-'}</td><td className="number-cell">{Number(change.quantity)>0?'+':''}{formatNumber(change.quantity,2)} → {formatNumber(change.newQuantity,2)}</td><td>{String(change.note||'-')}</td></tr>)}
      <tr><th scope="row">Now</th><td>-</td><td className="number-cell">{formatNumber(log.current,2)}</td><td>-</td></tr>
    </tbody></table></div>
    {!log.changes.length&&<EmptyState title="No quantity changes recorded" description="Removals by revision appear here."/>}
    {canChange&&<form className="quantity-revision-actions" noValidate onSubmit={event=>void submit(event)}>
      <h3>Remove quantity by revision</h3>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {revisions.length?<>
        <div className="field"><label htmlFor={`${id}-rev`}>Revision</label><select id={`${id}-rev`} required value={chosen} aria-invalid={Boolean(problems.revisionId)} onChange={event=>setRevision(event.target.value)}>{revisions.map(revision=><option key={revision.id} value={revision.id}>{revisionName(revision)}</option>)}</select>{problems.revisionId&&<small className="field-error">{problems.revisionId}</small>}</div>
        <div className="field"><label htmlFor={`${id}-qty`}>Quantity to remove?</label><input id={`${id}-qty`} type="number" required min={0.01} max={log.current} step={0.01} inputMode="decimal" value={quantity} aria-invalid={Boolean(problems.quantity)} onChange={event=>setQuantity(event.target.value)}/>{problems.quantity&&<small className="field-error">{problems.quantity}</small>}</div>
        <button className="btn primary full-width" disabled={busy||log.current<0.01}>{busy&&<Loader2 size={15} className="spin"/>}Remove quantity</button>
      </>:<p className="muted">Add an ISO revision before recording a revision removal.</p>}
    </form>}
  </div><div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div></Modal>;
}
