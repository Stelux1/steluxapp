import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronDown, LayoutGrid, LogOut } from 'lucide-react';
import { NO_NOTIFICATIONS, type NotificationView } from '../shared/notifications.ts';
import { REFERENCE_PASSWORD_OK, referencePasswordLabel, referencePasswordScore } from '../shared/password-strength.ts';
import type { Row } from '../shared/types.ts';
import { api, formatDate, post } from './api.ts';
import { Dropdown } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';

/** How often the bell asks for new notifications (the reference asks every 30 seconds). */
const POLL_MS = 30_000;
interface BellState { unread: number; notifications: NotificationView[] }

/**
 * Hosted profile: the bell shows the account's own notifications with an unread count. A click marks one read and opens its
 * page; "Mark all read" clears the count. What may be shown is decided by the server for this account and pilot.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [bell, setBell] = useState<BellState>({ unread: 0, notifications: [] }), [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => { try { setBell(await api<BellState>('/notifications')); setFailed(false); } catch { setFailed(true); } finally { setLoaded(true); } }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS); return () => window.clearInterval(timer); }, [load]);
  async function open(item: NotificationView) {
    if (!item.read) { try { setBell(await post<BellState>(`/notifications/${item.id}/read`, {})); } catch { /* the page still opens */ } }
    if (item.link) navigate(item.link);
  }
  async function markAll() { try { setBell(await post<BellState>('/notifications/read-all', {})); setFailed(false); } catch { setFailed(true); } }
  return <Dropdown className="notification-menu" label={bell.unread ? `Notifications, ${bell.unread} unread` : 'Notifications'} menuClassName="activity-dropdown notification-dropdown"
    trigger={<span className="icon-btn bell-trigger"><Bell size={19}/>{bell.unread > 0 && <span className="bell-badge" aria-hidden="true">{bell.unread > 99 ? '99+' : bell.unread}</span>}</span>}>
    <div className="notification-head"><h3>Notifications</h3><button type="button" className="text-link" disabled={!bell.unread} onClick={() => void markAll()}>Mark all read</button></div>
    {failed && <p role="alert">Notifications could not be loaded.</p>}
    {bell.notifications.map(item => <button type="button" key={item.id} className={`notification-item${item.read ? '' : ' unread'}`} onClick={() => void open(item)}>
      <span className="notification-title">{item.title}{!item.read && <span className="notification-dot" aria-label="Unread"/>}</span>
      {item.message && <small>{item.message}</small>}<small className="notification-date">{formatDate(item.createdAt)}</small>
    </button>)}
    {loaded && !failed && !bell.notifications.length && <p className="notification-empty" role="status">{NO_NOTIFICATIONS}</p>}
  </Dropdown>;
}

/**
 * Hosted profile: the account menu. The trigger shows the user's name; the menu lists the main projects the account may work
 * on under "Change site" (a click makes one the main project of the whole session: every pilot and every open tab follows)
 * and Logout. Changing the password stays under System.
 */
export function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const { user, allRows, siteId, selectSite } = useWorkspace(); const navigate = useNavigate();
  const sites = (allRows.sites || []).filter((site: Row) => !site._archived).sort((a: Row, b: Row) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  return <Dropdown className="user-menu" label="Account menu" trigger={<span className="avatar-summary"><span className="user-avatar small">{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span className="user-menu-name">{user.name}</span><ChevronDown size={13}/></span>}>
    <div className="user-menu-info"><strong>{user.name}</strong><small>{user.email}</small></div>
    {sites.length > 0 && <div className="user-menu-sites" role="group" aria-label="Change site"><span className="user-menu-heading">Change site</span>
      {sites.map(site => <button type="button" key={site.id} aria-current={site.id === siteId ? 'true' : undefined} onClick={() => { selectSite(site.id); navigate('/dashboard'); }}>{site.id === siteId ? <Check size={14}/> : <span className="menu-gap"/>}{String(site.name)}</button>)}</div>}
    <button type="button" onClick={onLogout}><LogOut size={15}/>Logout</button>
  </Dropdown>;
}

/** Hosted profile, top bar: one click to the other application workspace, on its dashboard, with the same active main project. */
export function PilotSwitcher() {
  const pilot = usePilot(); if (!pilot || pilot.allowed.length < 2) return null;
  return <Dropdown className="pilot-switcher" label="Switch application workspace" trigger={<span className="icon-btn"><LayoutGrid size={17}/></span>}>
    {pilot.allowed.map(item => <button type="button" key={item.key} aria-current={item.key === pilot.pilot.key ? 'true' : undefined} onClick={() => { if (item.key !== pilot.pilot.key) pilot.openPilot(item.key, '/dashboard'); }}>{item.key === pilot.pilot.key ? <Check size={14}/> : <span className="menu-gap"/>}{item.title}</button>)}
  </Dropdown>;
}

/** The strength shown under "New password" while it is typed: the bar and text of the reference's Change password dialog. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = referencePasswordScore(password), band = !password ? 0 : score >= 8 ? 4 : score >= 6 ? 3 : score >= REFERENCE_PASSWORD_OK ? 2 : 1;
  return <div className={`password-strength level-${band}`} role="status" aria-live="polite"><span>Password strength</span><span className="strength-bar" aria-hidden="true"><i style={{ width: `${Math.round(score / 8 * 100)}%` }}/></span><strong>{referencePasswordLabel(password) || '—'}</strong></div>;
}
