import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import { ArrowRight, Boxes, ChevronDown, LayoutGrid, Loader2, LogOut, ScanLine, ShieldAlert } from 'lucide-react';
import { PILOT_MAP, allowedPilots, legacyPilotPath, pagePilots, pilotItemPath, pilotItemResources, splitPilotPath, type Pilot, type PilotItem, type PilotKey } from '../shared/pilots.ts';
import { pageAvailable } from '../shared/release.ts';
import type { User } from '../shared/types.ts';
import { RESOURCES, RESOURCE_MAP } from './catalog.ts';
import { useWorkspace } from './context.tsx';
import { resourcePath } from './records.tsx';
import { EmptyState } from './components.tsx';
import { Wordmark } from './brand.tsx';
import { post } from './api.ts';

interface PilotState {
  pilot: Pilot;
  /** Pilots this account may enter. */
  allowed: Pilot[];
  /** Whether the account may enter the pilot in the URL. */
  entered: boolean;
  /** Open a page (route-table path, e.g. `/workspace/isometrics/x`) in a pilot. */
  openPilot: (key: PilotKey, page?: string) => void;
  /** Return to the application selector. */
  selectPilot: () => void;
}
const PilotContext = createContext<PilotState | null>(null);
/** The current pilot, or null in profiles without pilots. */
export const usePilot = () => useContext(PilotContext);

const ICONS: Record<PilotKey, typeof ScanLine> = { weld: ScanLine, mto: Boxes };

/**
 * Hosted entry: `/` is the selector, `/weld/...` and `/mto/...` mount the existing route table under a
 * basename, and old un-prefixed URLs are replaced by their pilot URL.
 */
export function PilotRoot({ user, onLogout, children }: { user: User; onLogout: () => void; children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => { const pop = () => setPath(window.location.pathname); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const go = useCallback((next: string, replace = false) => { window.history[replace ? 'replaceState' : 'pushState'](null, '', next); setPath(new URL(next, window.location.origin).pathname); window.scrollTo(0, 0); }, []);
  const allowed = allowedPilots(user);
  const { pilot } = splitPilotPath(path);
  const redirect = pilot ? '' : path !== '/' ? legacyPilotPath(path, allowed.map(p => p.key)) + window.location.search + window.location.hash : allowed.length === 1 ? `/${allowed[0].key}` : '';
  useLayoutEffect(() => { if (redirect) go(redirect, true); }, [redirect, go]);
  if (redirect) return <div className="screen-center" role="status"><Wordmark dark/><p>Opening your workspace…</p></div>;
  if (!pilot) return <PilotSelector user={user} pilots={allowed} onOpen={key => go(`/${key}`)} onLogout={onLogout}/>;
  const value: PilotState = { pilot: PILOT_MAP[pilot], allowed, entered: allowed.some(p => p.key === pilot), openPilot: (key, page = '') => go(`/${key}${page}`), selectPilot: () => go('/') };
  return <PilotContext.Provider value={value}><BrowserRouter key={pilot} basename={`/${pilot}`}>{children}</BrowserRouter></PilotContext.Provider>;
}

export function PilotSelector({ user, pilots, onOpen, onLogout }: { user: User; pilots: Pilot[]; onOpen: (key: PilotKey) => void; onLogout: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function logout() { setBusy(true); setError(''); try { await post('/auth/logout', {}); window.history.replaceState(null, '', '/'); onLogout(); } catch (e) { setError((e as Error).message); setBusy(false); } }
  return <div className="pilot-select-page">
    <header className="pilot-select-top"><Wordmark/><div className="pilot-select-user"><span><strong>{user.name}</strong><small>{user.email}</small></span><button type="button" className="btn small" onClick={() => void logout()} disabled={busy}>{busy ? <Loader2 size={14} className="spin"/> : <LogOut size={14}/>}Sign out</button></div></header>
    <main className="pilot-select-main" id="main-content">
      <div className="eyebrow">BLITZKRIEG · WORKSPACES</div>
      <h1>Select your application workspace</h1>
      <p>Projects, isometrics, spools and certificates are shared. Choose where you want to work now; you can switch at any time.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {pilots.length ? <ul className="pilot-tiles">{pilots.map(pilot => { const Icon = ICONS[pilot.key]; return <li key={pilot.key}>
        <a className="pilot-tile" href={`/${pilot.key}`} style={{ '--pilot-color': pilot.color } as React.CSSProperties} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); onOpen(pilot.key); }}>
          <span className="pilot-tile-icon"><Icon size={26}/></span><span className="pilot-tile-text"><strong>{pilot.title}</strong><small>{pilot.description}</small></span><ArrowRight size={18}/>
        </a></li>; })}</ul>
        : <section className="panel pilot-select-empty"><EmptyState title="No workspace is open to your account" description="Your permission profile does not include welding or materials access. Ask your administrator to add Weld Pilot or MTO Pilot to your profile."/></section>}
    </main>
  </div>;
}

const pathOnly = (path: string) => path.split('?')[0];
const queryOf = (path: string) => path.includes('?') ? path.slice(path.indexOf('?')) : '';

/** Sidebar of the current pilot, rendered from `shared/pilots.ts`. Items appear only where their page is available. */
export function PilotNavigation({ onPassword }: { onPassword: () => void }) {
  const state = usePilot()!; const { user, canRecord, canReadReport } = useWorkspace(); const location = useLocation();
  const target = (item: PilotItem) => item.resource && RESOURCE_MAP[item.resource] && !item.path ? resourcePath(item.resource) : pilotItemPath(item);
  const visible = (item: PilotItem) => {
    if (item.action) return true;
    const to = target(item); if (!to) return false;
    if (item.resource && !RESOURCE_MAP[item.resource]) return false;
    return pageAvailable(user.availability, pathOnly(to), RESOURCES) && pilotItemResources(item).every(key => canRecord(key)) && (!item.reports || item.reports.some(key => canReadReport(key)));
  };
  const groups = state.pilot.groups.map(group => ({ ...group, items: group.items.filter(visible) })).filter(group => group.items.length);
  const items = groups.flatMap(group => group.items);
  const here = (item: PilotItem) => { const to = target(item); return Boolean(to) && pathOnly(to!) === location.pathname; };
  const active = items.find(item => here(item) && queryOf(target(item)!) && queryOf(target(item)!) === location.search) || items.find(item => here(item) && !queryOf(target(item)!));
  if (!state.entered) return <p className="pilot-nav-note">{state.pilot.title} is not included in your permission profile.</p>;
  return <>{groups.map(group => <details key={state.pilot.key + group.title} className="nav-group pilot-nav-group" open={group.items.includes(active!)}>
    <summary>{group.title}<ChevronDown size={13}/></summary>
    {group.items.map(item => item.action === 'password'
      ? <button key={item.label} type="button" className="sub-nav-item pilot-nav-button" onClick={onPassword}>{item.label}</button>
      : <Link key={item.label} to={target(item)!} className={`sub-nav-item${item === active ? ' active' : ''}`} aria-current={item === active ? 'page' : undefined}>{item.label}</Link>)}
  </details>)}</>;
}

/** The pilot block in the sidebar: title in the pilot colour and the way back to the selector. */
export function PilotBadge() {
  const state = usePilot(); if (!state) return null; const Icon = ICONS[state.pilot.key];
  return <div className="pilot-badge"><span className="pilot-badge-icon"><Icon size={16}/></span><strong>{state.pilot.title}</strong>{state.allowed.length > 1 && <button type="button" className="pilot-badge-switch" onClick={state.selectPilot} aria-label="Select application workspace"><LayoutGrid size={14}/>Switch</button>}</div>;
}

/** Whether the current page must be replaced by the no-access state in this pilot. */
export const pilotBlocked = (state: PilotState | null, pathname: string) => Boolean(state) && (!state!.entered || !pagePilots(pathname).includes(state!.pilot.key));

/** Shown instead of the page when the account may not enter this pilot, or the page belongs to the other pilot. */
export function PilotNoAccess() {
  const state = usePilot()!; const location = useLocation();
  const other = state.allowed.find(pilot => pilot.key !== state.pilot.key);
  const icon = <span className="pilot-no-access-icon"><ShieldAlert size={22}/></span>;
  if (!state.entered) return <div className="page pilot-no-access" role="alert">{icon}<EmptyState title={`You do not have access to ${state.pilot.title}`} description="Your permission profile does not include this workspace. Choose a workspace that is open to your account." action={<button className="btn primary" onClick={state.selectPilot}>Select a workspace</button>}/></div>;
  const owner = PILOT_MAP[pagePilots(location.pathname)[0]];
  const canSwitch = other?.key === owner.key;
  return <div className="page pilot-no-access" role="alert">{icon}<EmptyState title={`This page is part of ${owner.title}`} description={`It cannot be opened from ${state.pilot.title}.${canSwitch ? ` Open it in ${owner.title} instead.` : ' Your permission profile does not include that workspace.'}`} action={<div className="heading-actions">{canSwitch && <button className="btn primary" onClick={() => state.openPilot(owner.key, location.pathname + location.search)}>Open in {owner.title}<ArrowRight size={15}/></button>}<Link className="btn" to="/dashboard">Go to dashboard</Link></div>}/></div>;
}
