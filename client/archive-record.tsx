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
