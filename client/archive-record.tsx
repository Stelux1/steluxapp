import { useState } from 'react';
import { Archive, RotateCcw } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { useWorkspace } from './context.tsx';
import { post } from './api.ts';
import { Modal } from './components.tsx';

export function ArchiveRecordDialog({ resourceKey, record, onClose, onSaved }: { resourceKey: string; record: Row; onClose: () => void; onSaved?: () => void }) {
  const { canRecord, refresh, notify, label } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const restoring = record._archived, verb = restoring ? 'Restore' : 'Archive';
  if (!canRecord(resourceKey, 'delete', record)) return null;
  async function submit() {
    setBusy(true); setError('');
    try {
      await post(`/records/${resourceKey}/${record.id}/archive`, { _version: record._version });
      await refresh(); notify(`Record ${restoring ? 'restored' : 'archived'}.`); onClose(); onSaved?.();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`${verb} ${RESOURCE_MAP[resourceKey].singular}?`} subtitle={label(resourceKey, record.id)} onClose={onClose}>
    <div className="modal-body"><p>{restoring ? 'This record will appear in active lists again.' : 'Remove this record from active lists and keep its documents and history. Archive linked active records first.'}</p>{error && <div className="alert error" role="alert">{error}</div>}</div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{verb} record</button></div>
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
  const { refresh, notify, label } = useWorkspace(); const [records] = useState(selection);
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
  return <Modal title={`Archive ${records.length} selected ${RESOURCE_MAP[resourceKey].title.toLowerCase()}?`} subtitle="Archived records keep their documents and history and can be restored." onClose={onClose}>
    <div className="modal-body">
      {finished ? <div className="alert error" role="alert"><div><strong>{archived} archived, {failed.length} could not be archived.</strong><ul>{failed.map(item => <li key={item.id}>{item.name}: {item.message}</li>)}</ul></div></div>
        : <><p>These records leave the active lists. A record that still has active linked records stays and is reported afterwards.</p><ul>{records.map(record => <li key={record.id}>{label(resourceKey, record.id)}</li>)}</ul></>}
    </div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>{finished ? 'Close' : 'Cancel'}</button>{!finished && <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Archiving…' : `Archive ${records.length} ${records.length === 1 ? 'record' : 'records'}`}</button>}</div>
  </Modal>;
}
