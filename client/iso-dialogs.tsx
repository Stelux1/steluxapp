import { useEffect, useState, type FormEvent } from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { Modal } from './components.tsx';
import { api, apiUrl, formatDate, post } from './api.ts';
import { auditWeldOptions, ISO_AUDIT_ALL, ISO_AUDIT_EMPTY, ISO_AUDIT_FILTER_LABEL, ISO_AUDIT_TITLE } from '../shared/iso-audit.ts';
import { CHECK_FOR_DELETE, ISO_ATTACHMENTS_NO_FILE, ISO_ATTACHMENTS_NOT_PDF, ISO_ATTACHMENTS_TITLE, ISO_ATTACHMENTS_UPLOAD_LABEL, isoAttachmentRows, isPdfName, reportTypes } from '../shared/iso-attachments.ts';
import type { AuditEvent, Row } from '../shared/types.ts';

/** Number of attachments of an isometric (the badge on Options → Attachments); 0 when the account reads none. */
export function useIsoAttachmentCount(isoId: string) {
  const { rows } = useWorkspace();
  return isoAttachmentRows(rows.attachments, isoId, rows.attachment_names).length;
}

/** The count badge of the Options → Attachments entry. */
export function AttachmentCountBadge({ isoId }: { isoId: string }) {
  const count = useIsoAttachmentCount(isoId);
  return count > 0 ? <span className="count-pill iso-attachment-count" aria-label={`${count} attachment${count === 1 ? '' : 's'}`}>{count}</span> : null;
}

/**
 * Options → Attachments: Report type (the attachment names), several PDFs at once, and below them the isometric's
 * attachments with a tick box each. Delete (shown only when attachments exist) removes the ticked ones; with none
 * ticked it says "Check for delete". Cancel closes.
 */
export function IsoAttachmentsDialog({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const types = reportTypes(rows.attachment_names);
  const listed = isoAttachmentRows(rows.attachments, iso.id, rows.attachment_names);
  const canChange = canRecord('isometrics', 'import', iso);
  const [reportNo, setReportNo] = useState(types[0]?.id ?? ''), [files, setFiles] = useState<File[]>([]), [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [inputKey, setInputKey] = useState(0);
  async function upload(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!files.length) { setError(ISO_ATTACHMENTS_NO_FILE); return; }
    if (files.some(file => !isPdfName(file.name))) { setError(ISO_ATTACHMENTS_NOT_PDF); return; }
    const body = new FormData(); body.set('reportNo', reportNo); for (const file of files) body.append('files', file);
    setBusy('upload');
    try { await api(`/isometrics/${iso.id}/attachments`, { method: 'POST', body }); await refresh(); notify(files.length === 1 ? 'Attachment uploaded.' : `${files.length} attachments uploaded.`); setFiles([]); setInputKey(key => key + 1); }
    catch (failure) { setError((failure as Error).message || 'The upload failed.'); } finally { setBusy(''); }
  }
  async function remove() {
    setError('');
    if (!ticked.length) { setError(CHECK_FOR_DELETE); return; }
    setBusy('delete');
    try { await post(`/isometrics/${iso.id}/attachments/delete`, { ids: ticked }); await refresh(); notify(ticked.length === 1 ? 'Attachment deleted.' : `${ticked.length} attachments deleted.`); setTicked([]); }
    catch (failure) { setError((failure as Error).message || 'The attachments could not be deleted.'); } finally { setBusy(''); }
  }
  const toggle = (id: string, on: boolean) => setTicked(current => on ? [...new Set([...current, id])] : current.filter(item => item !== id));
  return <Modal title={ISO_ATTACHMENTS_TITLE} subtitle={String(iso.isoNo)} onClose={onClose}>
    <div className="modal-body iso-attachments">
      {error && <div className="alert error" role="alert">{error}</div>}
      {canChange ? <form onSubmit={event => void upload(event)} aria-label="Upload attachments">
        <div className="field"><label htmlFor="iso-attachments-report">Report type</label>
          <select id="iso-attachments-report" value={reportNo} onChange={event => setReportNo(event.target.value)}>{types.map(type => <option key={type.id} value={type.id}>{String(type.name)}</option>)}</select></div>
        <div className="field"><label htmlFor="iso-attachments-files">{ISO_ATTACHMENTS_UPLOAD_LABEL}</label>
          <input key={inputKey} id="iso-attachments-files" type="file" multiple accept=".pdf,application/pdf" onChange={event => setFiles(Array.from(event.target.files || []))}/>
          <small className="field-hint">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Nothing selected'}</small></div>
        <button className="btn primary" disabled={Boolean(busy) || !types.length}>{busy === 'upload' ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload</button>
      </form> : <p className="muted">Your profile does not allow adding or deleting attachments of this isometric.</p>}
      <section className="iso-attachments-archive" aria-label="Attachments">
        <h3>Attachments</h3>
        {listed.length ? <ul>{listed.map(file => <li key={file.id}>
          {canChange && <input type="checkbox" aria-label={`Check ${String(file.name)} for delete`} checked={ticked.includes(file.id)} onChange={event => toggle(file.id, event.target.checked)}/>}
          <FileText size={18} aria-hidden="true"/>
          <div><a className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer">{String(file.name)}<Download size={13} aria-hidden="true"/></a><small>{String(file.documentType)} · {formatDate(String(file._createdAt))}</small></div>
        </li>)}</ul> : <p className="muted">Nothing selected</p>}
      </section>
    </div>
    <div className="modal-footer">
      {listed.length > 0 && canChange && <button type="button" className="btn iso-attachments-delete" disabled={Boolean(busy)} onClick={() => void remove()}>{busy === 'delete' ? <Loader2 size={15} className="spin"/> : <Trash2 size={15}/>}Delete</button>}
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
    </div>
  </Modal>;
}

/**
 * Options → Audit trail: the recorded changes of the isometric and of its welds (the ones this account may read, decided
 * by the server), newest first, with a "Weld no." filter.
 */
export function IsoAuditDialog({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows } = useWorkspace();
  const welds = auditWeldOptions(rows.welds, iso.id);
  const [weldId, setWeldId] = useState('0'), [events, setEvents] = useState<AuditEvent[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let current = true; setEvents(null); setError('');
    api<{ events: AuditEvent[] }>(`/isometrics/${iso.id}/audit?weldId=${encodeURIComponent(weldId)}`)
      .then(body => { if (current) setEvents(body.events); }).catch(failure => { if (current) setError((failure as Error).message || 'The audit trail could not be loaded.'); });
    return () => { current = false; };
  }, [iso.id, weldId]);
  const weldNo = (event: AuditEvent) => event.entityType === 'welds' ? welds.find(weld => weld.id === event.entityId)?.label || String(rows.welds?.find(weld => weld.id === event.entityId)?.weldNo ?? '') : '';
  return <Modal title={ISO_AUDIT_TITLE} subtitle={String(iso.isoNo)} onClose={onClose}>
    <div className="modal-body iso-audit">
      {welds.length > 0 && <div className="field iso-audit-filter"><label htmlFor="iso-audit-weld">{ISO_AUDIT_FILTER_LABEL}</label>
        <select id="iso-audit-weld" value={weldId} onChange={event => setWeldId(event.target.value)}><option value="0">{ISO_AUDIT_ALL}</option>{welds.map(weld => <option key={weld.id} value={weld.id}>{weld.label}</option>)}</select></div>}
      {error ? <div className="alert error" role="alert">{error}</div>
        : events === null ? <p role="status" className="muted"><Loader2 size={14} className="spin"/> Loading…</p>
        : events.length ? <ol className="iso-audit-list">{events.map(event => <li key={event.id}><strong>{event.summary}{weldNo(event) ? ` · weld ${weldNo(event)}` : ''}</strong><small>{event.actorName} · {formatDate(event.createdAt)}</small></li>)}</ol>
        : <div className="alert" role="status">{ISO_AUDIT_EMPTY}</div>}
    </div>
    <div className="modal-footer"><button type="button" className="btn primary" onClick={onClose}>Close</button></div>
  </Modal>;
}
