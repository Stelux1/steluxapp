import { useState, type FormEvent } from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { currentRevision } from '../shared/revisions.ts';
import { nextRevisionNumber, REVISION_DIALOGS, revisionInputType } from '../shared/iso-pages.ts';
import type { Row } from '../shared/types.ts';
import { useWorkspace,activeRows } from './context.tsx';
import { Modal } from './components.tsx';
import { api, ApiError, formatDate, apiUrl } from './api.ts';

/**
 * Add rev / Add ITP revision / Add ITP revision 2 (reference weld__iso__0001.txt:1291-1352): the current revisions with their
 * files, the PDF, the revision number (the next one is filled in) and a comment, saved in one request.
 */
export function AddRevisionDialog({ iso, kind, onClose }: { iso: Row; kind: string; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const current = currentRevision(rows, iso.id, kind), type = revisionInputType(kind);
  const [revNo, setRevNo] = useState(nextRevisionNumber(current)), [comment, setComment] = useState(''), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({});
  const revisions = activeRows(rows, 'revisions').filter(row => row.isoId === iso.id && row.type === kind).sort((a, b) => b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id));
  const files = activeRows(rows, 'attachments').filter(item => item.entityType === 'revisions' && revisions.some(row => row.id === item.entityId));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    const number = revNo.trim();
    if (!number) { setProblems({ revNo: 'Enter a revision number.' }); setError('Enter a revision number.'); return; }
    if (type === 'number' && !Number.isFinite(Number(number))) { setProblems({ revNo: 'Enter a number.' }); setError('Enter the revision as a number.'); return; }
    if (number === current) { setProblems({ revNo: 'Enter a different number.' }); setError('The new revision must differ from the current revision.'); return; }
    if (file && !/\.pdf$/i.test(file.name)) { setProblems({ file: 'Choose a PDF file.' }); setError('Choose a PDF file.'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('isoId', iso.id); body.set('type', kind); body.set('revNo', number); body.set('date', new Date().toISOString().slice(0, 10)); body.set('comment', comment.trim());
      if (file) body.set('file', file);
      await api('/revisions', { method: 'POST', body });
      await refresh(); notify(`${kind === 'ISO' ? 'Revision' : `${kind} revision`} ${number} added${file ? ' with its file' : ''}.`); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title={REVISION_DIALOGS[kind]?.title ?? 'Add rev'} subtitle={String(iso.isoNo)} onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} aria-busy={busy}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
        <div className="field full-width"><span className="field-label">Current revisions:</span>
          {revisions.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{revisions.map(row => { const attached = files.filter(item => item.entityId === row.id); return <li key={row.id}>{attached.length ? attached.map(item => <a key={item.id} className="revision-document" href={apiUrl(`/files/${item.id}`)} target="_blank" rel="noreferrer"><FileText size={15}/>{String(item.name)}<Download size={13}/></a>) : <span>Rev {String(row.revNo)}</span>}{row.comment ? <span> / {String(row.comment)}</span> : null}</li>; })}</ul> : <p className="muted">Rev {current}, no earlier revisions recorded.</p>}
        </div>
        <div className="field"><label htmlFor="add-rev-file">Isometric</label><input id="add-rev-file" type="file" accept=".pdf" aria-invalid={Boolean(problems.file)} disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)}/>{problems.file && <small className="field-error" role="alert">{problems.file}</small>}</div>
        <div className="field"><label htmlFor="add-rev-number">Revision number</label><input id="add-rev-number" name="revNo" type={type} {...(type === 'number' ? { step: 0.01 } : {})} value={revNo} aria-invalid={Boolean(problems.revNo)} disabled={busy} onChange={event => setRevNo(event.target.value)}/>{problems.revNo && <small className="field-error" role="alert">{problems.revNo}</small>}</div>
        <div className="field"><label htmlFor="add-rev-comment">Comment</label><input id="add-rev-comment" name="comment" type="text" value={comment} disabled={busy} onChange={event => setComment(event.target.value)}/></div>
      </div>
      <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Add</button></div>
    </form>
  </Modal>;
}

export function DrawingRevisions({isoId}:{isoId:string}){
  const {rows,openRecord}=useWorkspace();const revisions=activeRows(rows,'revisions').filter(r=>r.isoId===isoId).sort((a,b)=>b._createdAt.localeCompare(a._createdAt)||b.id.localeCompare(a.id));
  const files=activeRows(rows,'attachments').filter(f=>f.entityType==='revisions'&&revisions.some(r=>r.id===f.entityId));
  return <section className="drawing-revisions"><h3>Drawings & revisions</h3><div className="current-revisions">{['ISO','ITP','ITP 2'].map(type=><div key={type}><span>{type}</span><strong>Rev {currentRevision(rows,isoId,type)}</strong></div>)}</div>{revisions.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Document</th><th>Revision</th><th>Date</th><th>Comment</th><th>Drawing files</th></tr></thead><tbody>{revisions.map(revision=><tr key={revision.id}><td>{String(revision.type)}</td><td><button className="record-link" onClick={()=>openRecord('revisions',revision.id)}>{String(revision.revNo)}</button>{String(revision.revNo)===currentRevision(rows,isoId,String(revision.type))&&<small className="execution-subvalue">Current</small>}</td><td>{formatDate(revision.date)}</td><td>{String(revision.comment||'—')}</td><td>{files.filter(f=>f.entityId===revision.id).map(f=><a className="revision-document" key={f.id} href={apiUrl(`/files/${f.id}`)}><FileText size={15}/>{String(f.name)}<Download size={13}/></a>)}{!files.some(f=>f.entityId===revision.id)&&<span className="muted">No file attached</span>}</td></tr>)}</tbody></table></div>:<p className="muted">No drawing revisions recorded yet.</p>}</section>;
}
