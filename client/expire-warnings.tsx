import { useMemo } from 'react';
import { ShieldAlert } from 'lucide-react';
import { expiringQualifications, todayIso } from '../shared/welder-data.ts';
import { useWorkspace } from './context.tsx';
import { Dropdown } from './components.tsx';
import { usePilot } from './pilot.tsx';
import { resourcePath } from './records.tsx';

/**
 * Weld Pilot top bar: counter of the expired and soon-expiring qualifications and documents of welders with a
 * dropdown that lists them, one line each (`W01 Custom - 141|FM1-FM2|ISO9606-1 · 04.04.2024 Expired`). An entry is listed
 * when it is expired or inside its own "Notify (days)" and its notifications are on; every line opens the Welders page.
 */
export function ExpireWarnings() {
  const { rows, canRecord } = useWorkspace(); const pilot = usePilot();
  const warnings = useMemo(() => expiringQualifications(rows, todayIso()), [rows]);
  if (pilot?.pilot.key !== 'weld' || !canRecord('welders') || !canRecord('welder_certificates')) return null;
  const expired = warnings.filter(warning => warning.status === 'expired').length;
  return <Dropdown className="notification-menu expire-menu" label={`Expire warnings: ${warnings.length}`} trigger={<span className="icon-btn expire-trigger"><ShieldAlert size={19}/>{warnings.length > 0 && <span className={`expire-count ${expired ? 'expired' : ''}`}>{warnings.length}</span>}</span>} menuClassName="activity-dropdown expire-dropdown">
    <h3>Expire warnings{warnings.length > 0 && ` ${warnings.length}`}</h3>
    {warnings.length === 0 && <p className="expire-empty" role="status">No qualifications or documents are expired or about to expire.</p>}
    {warnings.map(warning => <button key={warning.id} type="button" className={`expire-item ${warning.status}`} onClick={() => pilot?.openPilot('weld', resourcePath('welders'))}>
      <span className="expire-line">{warning.text}</span>
    </button>)}
  </Dropdown>;
}
