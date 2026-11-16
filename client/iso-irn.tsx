import { useState, type FormEvent } from 'react';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { ApiError, post } from './api.ts';
import { Dropdown, Modal } from './components.tsx';
import { useWorkspace } from './context.tsx';

/**
 * "Automatically add IRN numbers" (reference dialog #fillIRN, rule in vendor-kb 5-27-1): the main project reserves a unique
 * letter series, switches its automatic numbers on and numbers the isometrics that have no IRN yet in the order they were created.
 */
export function FillIrnDialog({ site, onClose }: { site: Row; onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await post<{ records?: Row[] }>('/actions/fill-irn', { siteId: site.id });
      const count = result.records?.length ?? 0;
      await refresh(); notify(count ? `IRN numbers added to ${count} isometric${count === 1 ? '' : 's'}.` : 'Automatic IRN numbers are on. New isometrics get the next number.'); onClose();
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : (failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Automatically add IRN numbers" subtitle={String(site.name || '')} onClose={onClose}>
    <form onSubmit={event => void submit(event)}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
        <p>Are you sure?</p>
        <p className="muted">{site.irnAuto === true ? `This main project already numbers its isometrics (series ${String(site.irnCode)}). Isometrics without an IRN get the next numbers now.` : `A unique series of letters is reserved for this main project${site.irnCode ? ` (${String(site.irnCode)})` : ''}. New isometrics then get the series and four digits, and the IRN can no longer be typed. Isometrics without an IRN are numbered now, in the order they were created.`}</p>
      </div>
      <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Add IRN</button></div>
    </form>
  </Modal>;
}

/** The Options menu of a subproject's isometric overview: shown to accounts that may run the action. */
export function FillIrnOption({ project }: { project: Row }) {
  const { rows, canRun, user } = useWorkspace();
  const [open, setOpen] = useState(false);
  const site = rows.sites?.find(row => row.id === project.siteId);
  if (!user.availability?.features.includes('pilots') || !site || !canRun('fill-irn')) return null;
  return <>
    <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}><button onClick={() => setOpen(true)}>Automatically add IRN numbers</button></Dropdown>
    {open && <FillIrnDialog site={site} onClose={() => setOpen(false)}/>}
  </>;
}
