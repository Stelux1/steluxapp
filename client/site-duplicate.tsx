import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { DUPLICATE_PARTS, DUPLICATE_PART_KEYS } from '../shared/site-duplicate.ts';
import type { Row } from '../shared/types.ts';
import { ApiError, post } from './api.ts';
import { Modal } from './components.tsx';
import { useWorkspace } from './context.tsx';

/**
 * Duplicate Project site (Edit project site): a copy named "<name> (Copy)" with the ticked settings and activated lists.
 * Projects, isometrics and welds are never copied; the server checks every option again.
 */
export function DuplicateSiteDialog({ site, onClose, onBack }: { site: Row; onClose: () => void; onBack: () => void }) {
  const { refresh, notify, canRecord } = useWorkspace();
  const [parts, setParts] = useState<string[]>(DUPLICATE_PART_KEYS), [busy, setBusy] = useState(false), [error, setError] = useState('');
  // A list the account may not read is not offered (the server refuses it too).
  const offered = DUPLICATE_PARTS.filter(part => !part.catalog && !part.links || canRecord(part.catalog ?? part.links!.resource));
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await post<{ record: Row }>('/actions/duplicate-site', { siteId: site.id, parts: parts.filter(key => offered.some(part => part.key === key)) }); await refresh(); notify(`Project site ${String(result.record.name)} created.`); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : (e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Duplicate Project site" subtitle={`${String(site.name)} becomes a new project site named “${String(site.name)} (Copy)”. Its projects, isometrics and welds are not copied.`} onClose={onBack}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {(['Site settings', 'Activated lists'] as const).map(group => <fieldset className="duplicate-options" key={group}><legend>{group}</legend>{offered.filter(part => part.group === group).map(part => <label key={part.key}><input type="checkbox" checked={parts.includes(part.key)} onChange={event => setParts(list => event.target.checked ? [...list, part.key] : list.filter(key => key !== part.key))}/><span>{part.label}</span></label>)}</fieldset>)}
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onBack}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div></form>
  </Modal>;
}
