import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { DEFAULT_EXPIRE_WINDOW_DAYS, EXPIRE_WINDOWS, expiringQualifications, todayIso } from '../shared/welder-data.ts';
import { useWorkspace } from './context.tsx';
import { Dropdown } from './components.tsx';
import { formatDate } from './api.ts';
import { usePilot } from './pilot.tsx';

const STORAGE_KEY = 'blitzkrieg-expire-window';
function storedWindow() {
  try { const value = Number(window.localStorage.getItem(STORAGE_KEY)); return EXPIRE_WINDOWS.includes(value) ? value : DEFAULT_EXPIRE_WINDOW_DAYS; } catch { return DEFAULT_EXPIRE_WINDOW_DAYS; }
}

/**
 * Weld Pilot top bar: counter of expired and soon-expiring welder qualifications with a dropdown that lists
 * them (welder, qualification, date, status) and opens the welder. The warning window is chosen in the list.
 */
export function ExpireWarnings() {
  const { rows, canRecord, openRecord } = useWorkspace(); const pilot = usePilot();
  const [windowDays, setWindowDays] = useState(storedWindow);
  const warnings = useMemo(() => expiringQualifications(rows, todayIso(), windowDays), [rows, windowDays]);
  if (pilot?.pilot.key !== 'weld' || !canRecord('welders') || !canRecord('welder_certificates')) return null;
  const expired = warnings.filter(warning => warning.status === 'expired').length;
  const choose = (days: number) => { setWindowDays(days); try { window.localStorage.setItem(STORAGE_KEY, String(days)); } catch { /* the choice just is not remembered */ } };
  return <Dropdown className="notification-menu expire-menu" label={`Expire warnings: ${warnings.length}`} trigger={<span className="icon-btn expire-trigger"><ShieldAlert size={19}/>{warnings.length > 0 && <span className={`expire-count ${expired ? 'expired' : ''}`}>{warnings.length}</span>}</span>} menuClassName="activity-dropdown expire-dropdown">
    <h3>Expire warnings</h3>
    <fieldset className="expire-window"><legend>Warn when a qualification expires within</legend>{EXPIRE_WINDOWS.map(days => <label key={days}><input type="radio" name="expire-window" checked={windowDays === days} onChange={() => choose(days)}/>{days} days</label>)}</fieldset>
    {warnings.length === 0 && <p className="expire-empty" role="status">No qualifications are expired or expire within {windowDays} days.</p>}
    {warnings.map(warning => <button key={warning.id} type="button" className="expire-item" onClick={() => openRecord('welders', warning.welderId)}>
      <strong>{warning.welder}</strong><span>{warning.qualification}</span>
      <small><span className="tabular">{formatDate(warning.expiresAt)}</span> <span className={`expire-status ${warning.status}`}>{warning.message}</span></small>
    </button>)}
  </Dropdown>;
}
