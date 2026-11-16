import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { FLAG_BULK_MESSAGES, FLAG_BULK_NOUN } from '../shared/welder-data.ts';
import { post } from './api.ts';
import { useWorkspace } from './context.tsx';

/**
 * The bulk bar of the welding wire (and certificate) list: for the ticked rows set Controlled, Accepted or both to
 * Yes or No ("Don't change" leaves a flag alone). Sits in the selection bar of the list.
 */
export function FlagBulkControls({ resourceKey, records, onDone }: { resourceKey: string; records: Row[]; onDone: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [controlled, setControlled] = useState(''), [accepted, setAccepted] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function apply() {
    setError('');
    if (!controlled && !accepted) { setError(FLAG_BULK_MESSAGES.pick); return; }
    const changes = { ...(controlled ? { controlled: controlled === '1' } : {}), ...(accepted ? { accepted: accepted === '1' } : {}) };
    setBusy(true);
    try {
      await post(`/bulk/${resourceKey}`, { ids: records.map(row => row.id), changes, versions: Object.fromEntries(records.map(row => [row.id, row._version])) });
      await refresh(); notify(`${records.length} ${records.length === 1 ? 'record' : 'records'} updated.`);
      setControlled(''); setAccepted(''); onDone();
    } catch { setError(FLAG_BULK_MESSAGES.failed(FLAG_BULK_NOUN[resourceKey] ?? 'records')); } finally { setBusy(false); }
  }
  const select = (label: string, value: string, set: (value: string) => void) => <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{label}<select style={{ minHeight: 32 }} value={value} onChange={event => set(event.target.value)}><option value="">Don't change</option><option value="1">Yes</option><option value="0">No</option></select></label>;
  return <>{select('Controlled', controlled, setControlled)}{select('Accepted', accepted, setAccepted)}<button className="btn small primary" disabled={busy} onClick={() => void apply()}>{busy && <Loader2 size={13} className="spin"/>}Apply</button>{error && <span className="field-error" role="alert">{error}</span>}</>;
}
