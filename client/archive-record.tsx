import { useState } from 'react';
import { Archive, RotateCcw } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { useWorkspace } from './context.tsx';
import { post } from './api.ts';
import { Modal } from './components.tsx';
import { DELETE_WORDING_RESOURCES, deleteWording } from '../shared/weld-catalogs.ts';
import { isometricDeleteNotice, isometricUseOf, PROJECT_DELETE_TEXT, projectDeleteRefusal } from '../shared/iso-pages.ts';

export function ArchiveRecordDialog({ resourceKey, record, onClose, onSaved }: { resourceKey: string; record: Row; onClose: () => void; onSaved?: () => void }) {
  const { canRecord, refresh, notify, label, user, rows } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const restoring = record._archived, verb = restoring ? 'Restore' : 'Archive';
  // A catalog of the hosted profile reads "Delete" and "Are you sure?" as the reference does; the record is archived underneath.
  const hosted = Boolean(user.availability?.features.includes('pilots'));
  const deleting = !restoring && hosted && (DELETE_WORDING_RESOURCES.includes(resourceKey) || ['projects', 'isometrics'].includes(resourceKey));
  // The reference names the reason and keeps Delete off (the server decides again; here only what the loaded records show).
  const blocked = !restoring && hosted ? resourceKey === 'projects' ? projectDeleteRefusal((rows.isometrics || []).filter(row => !row._archived && row.projectId === record.id).length) : '' : '';
  const notice = deleting && resourceKey === 'isometrics' ? isometricDeleteNotice(isometricUseOf(rows, record.id)) : '';
  const wording = deleteWording(resourceKey, RESOURCE_MAP[resourceKey].singular);
  if (!canRecord(resourceKey, 'delete', record)) return null;
  async function submit() {
    setBusy(true); setError('');
    try {
      await post(`/records/${resourceKey}/${record.id}/archive`, { _version: record._version });
      await refresh(); notify(`Record ${restoring ? 'restored' : deleting ? 'deleted' : 'archived'}.`); onClose(); onSaved?.();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={deleting ? wording.title : `${verb} ${RESOURCE_MAP[resourceKey].singular}?`} subtitle={label(resourceKey, record.id)} onClose={onClose}>
    <div className="modal-body">{blocked && <div className="alert error" role="alert">{blocked}</div>}<p>{deleting ? wording.text : restoring ? 'This record will appear in active lists again.' : 'Remove this record from active lists and keep its documents and history. Archive linked active records first.'}</p>{notice && <p className="muted">{notice}</p>}{error && <div className="alert error" role="alert">{error}</div>}</div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || Boolean(blocked)} onClick={() => void submit()}>{deleting ? wording.button : `${verb} record`}</button></div>
  </Modal>;
}

export function ArchiveRecordButton({ resourceKey, record, onArchive }: { resourceKey: string; record: Row; onArchive: () => void }) {
  const { canRecord, label } = useWorkspace();
  if (!canRecord(resourceKey, 'delete', record)) return null;
  const Icon = record._archived ? RotateCcw : Archive;
  return <button className="icon-btn" aria-label={`${record._archived ? 'Restore' : 'Archive'} ${RESOURCE_MAP[resourceKey].singular} ${label(resourceKey, record.id)}`} onClick={onArchive}><Icon size={16}/></button>;
}

/** Archive several checked records one by one; a record in active use stays and is listed with the reason. */
export function BulkArchiveDialog({ resourceKey, records: selection, onClose, onDone }: { resourceKey: string; records: Row[]; onClose: () => void; onDone: () => void }) {
  const { refresh, notify, label, user } = useWorkspace(); const [records] = useState(selection);
  // Projects (hosted): "Delete selected projects" of the Options menu; only unused (blank) projects go.
  const deletingProjects = resourceKey === 'projects' && Boolean(user.availability?.features.includes('pilots'));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState<{ id: string; name: string; message: string }[]>([]), [archived, setArchived] = useState(0);
  async function submit() {
    setBusy(true); const problems: typeof failed = []; let done = 0;
    for (const record of records) {
      try { await post(`/records/${resourceKey}/${record.id}/archive`, { _version: record._version }); done++; }
      catch (error) { problems.push({ id: record.id, name: label(resourceKey, record.id), message: (error as Error).message }); }
    }
    try { await refresh(); } catch { /* the workspace shows its own connection error */ }
    setArchived(done); setFailed(problems); setBusy(false);
    if (!problems.length) { notify(`${done} ${done === 1 ? 'record' : 'records'} archived.`); onDone(); onClose(); } else if (done) onDone();
  }
  const finished = failed.length > 0;
  return <Modal title={deletingProjects ? 'Delete selected projects' : `Archive ${records.length} selected ${RESOURCE_MAP[resourceKey].title.toLowerCase()}?`} subtitle={deletingProjects ? PROJECT_DELETE_TEXT.intro : 'Archived records keep their documents and history and can be restored.'} onClose={onClose}>
    <div className="modal-body">
      {finished ? <div className="alert error" role="alert"><div><strong>{archived} {deletingProjects ? 'deleted' : 'archived'}, {failed.length} could not be {deletingProjects ? 'deleted' : 'archived'}.</strong><ul>{failed.map(item => <li key={item.id}>{item.name}: {item.message}</li>)}</ul></div></div>
        : deletingProjects ? <><p>{PROJECT_DELETE_TEXT.confirm}</p><p>{PROJECT_DELETE_TEXT.note}</p><ul>{records.map(record => <li key={record.id}>{label(resourceKey, record.id)}</li>)}</ul></>
        : <><p>These records leave the active lists. A record that still has active linked records stays and is reported afterwards.</p><ul>{records.map(record => <li key={record.id}>{label(resourceKey, record.id)}</li>)}</ul></>}
    </div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>{finished ? 'Close' : 'Cancel'}</button>{!finished && <button className="btn primary" disabled={busy} onClick={() => void submit()}>{deletingProjects ? (busy ? 'Deleting…' : 'Delete') : busy ? 'Archiving…' : `Archive ${records.length} ${records.length === 1 ? 'record' : 'records'}`}</button>}</div>
  </Modal>;
}
