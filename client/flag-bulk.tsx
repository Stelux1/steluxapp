import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { FLAG_BULK_LIMIT, FLAG_BULK_MESSAGES, FLAG_BULK_NOUN, FLAG_CHOICES, flagBulkChanges } from '../shared/welder-data.ts';
import { post } from './api.ts';
import { useWorkspace } from './context.tsx';

/**
 * The one "Controlled / Accepted" bar of the welding wire and certificate lists (reference #certBulkBar): for the ticked
 * rows set Controlled, Accepted or both to Yes or No ("Don't change" leaves a flag alone). Sits in the selection bar of
 * the list; the server takes only those two fields (server/http.ts → flagBulkAllowed).
 */
export function FlagBulkControls({ resourceKey, records, onDone }: { resourceKey: string; records: Row[]; onDone: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [controlled, setControlled] = useState(''), [accepted, setAccepted] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const id = useId().replaceAll(':', '');
  const noun = FLAG_BULK_NOUN[resourceKey] ?? 'records';
  async function apply() {
    setError('');
    if (records.length > FLAG_BULK_LIMIT) { setError(FLAG_BULK_MESSAGES.tooMany(noun)); return; }
    const changes = flagBulkChanges(controlled, accepted);
    if (!changes) { setError(FLAG_BULK_MESSAGES.pick); return; }
    setBusy(true);
    try {
      await post(`/bulk/${resourceKey}`, { ids: records.map(row => row.id), changes, versions: Object.fromEntries(records.map(row => [row.id, row._version])) });
      await refresh(); notify(`${records.length} ${records.length === 1 ? noun.replace(/s$/, '') : noun} updated.`);
      setControlled(''); setAccepted(''); onDone();
    } catch { setError(FLAG_BULK_MESSAGES.failed(noun)); } finally { setBusy(false); }
  }
  const select = (label: string, value: string, set: (value: string) => void) => <label htmlFor={`${id}-${label}`}>{label}<select id={`${id}-${label}`} value={value} onChange={event => set(event.target.value)}>{FLAG_CHOICES.map(([option, title]) => <option key={option} value={option}>{title}</option>)}</select></label>;
  return <div className="cert-flags" role="group" aria-label={`Controlled and Accepted of the checked ${noun}`}>
    {select('Controlled', controlled, setControlled)}{select('Accepted', accepted, setAccepted)}
    <button type="button" className="btn small primary" disabled={busy || !records.length} onClick={() => void apply()}>{busy && <Loader2 size={13} className="spin"/>}Apply</button>
    {error && <span className="cert-flags-message" role="alert">{error}</span>}
  </div>;
}
