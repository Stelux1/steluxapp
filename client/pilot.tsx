import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Boxes, Building2, Calculator, ChevronDown, ClipboardList, Flame, FolderKanban, HardHat, Layers3, LayoutDashboard, LayoutGrid, Loader2, LogOut, ScanLine, ScanSearch, Settings2, ShieldAlert, ShoppingCart, Truck } from 'lucide-react';
import { NO_RIGHTS_TEXT, PILOT_MAP, allowedPilots, legacyPilotPath, pagePilots, pilotItemPath, pilotItemState, pilotPageState, splitPilotPath, type MenuRights, type Pilot, type PilotGroupIcon, type PilotItem, type PilotKey } from '../shared/pilots.ts';
import { pageAvailable } from '../shared/release.ts';
import type { User } from '../shared/types.ts';
import { RESOURCES, RESOURCE_MAP } from './catalog.ts';
import { useWorkspace } from './context.tsx';
import { resourcePath } from './records.tsx';
import { EmptyState, Modal } from './components.tsx';
import { Wordmark } from './brand.tsx';
import { apiBlob, post } from './api.ts';

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
/** Icons of the menu groups: beside the group title, and alone when the menu is collapsed to icons. */
const GROUP_ICONS: Record<PilotGroupIcon, typeof ScanLine> = {
  general: Building2, start: LayoutDashboard, welders: HardHat, weld: Flame, material: Layers3, ndt: ScanSearch, welding: ClipboardList, releases: BadgeCheck,
  materials: Boxes, orders: ShoppingCart, projects: FolderKanban, logistics: Truck, calculations: Calculator, system: Settings2,
};

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
  // The server refuses every request of a pilot the account may not enter, so its workspace is not opened at all.
  if (!value.entered) return <PilotRefused user={user} pilot={value.pilot} onSelect={() => go('/')} onLogout={onLogout}/>;
  return <PilotContext.Provider value={value}><BrowserRouter key={pilot} basename={`/${pilot}`}>{children}</BrowserRouter></PilotContext.Provider>;
}

/** Header of the selector and the no-access screen: the account and Sign out. */
function AccountBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function logout() { setBusy(true); setError(''); try { await post('/auth/logout', {}); window.history.replaceState(null, '', '/'); onLogout(); } catch (e) { setError((e as Error).message); setBusy(false); } }
  return <><header className="pilot-select-top"><Wordmark/><div className="pilot-select-user"><span><strong>{user.name}</strong><small>{user.email}</small></span><button type="button" className="btn small" onClick={() => void logout()} disabled={busy}>{busy ? <Loader2 size={14} className="spin"/> : <LogOut size={14}/>}Sign out</button></div></header>{error && <div className="alert error" role="alert">{error}</div>}</>;
}

/** A pilot URL the account may not enter (not enabled for it, or its profile does not open the pilot). */
function PilotRefused({ user, pilot, onSelect, onLogout }: { user: User; pilot: Pilot; onSelect: () => void; onLogout: () => void }) {
  const others = allowedPilots(user).length;
  return <div className="pilot-select-page">
    <AccountBar user={user} onLogout={onLogout}/>
    <main className="pilot-select-main" id="main-content"><section className="panel pilot-select-empty" role="alert"><span className="pilot-no-access-icon"><ShieldAlert size={22}/></span><EmptyState title={`You do not have access to ${pilot.title}`} description={others ? 'Your account is not enabled for this workspace. Choose a workspace that is open to your account.' : 'Your account is not enabled for any workspace. Ask your administrator to enable Weld Pilot or MTO Pilot for your account.'} action={others ? <button className="btn primary" onClick={onSelect}>Select a workspace</button> : undefined}/></section></main>
  </div>;
}

/** The company logo of Company data for the application selector: its object URL, or '' while there is none (no logo saved, or it cannot be loaded). */
function useCompanyLogo(enabled: boolean) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, object = '';
    apiBlob('/company-logo').then(blob => { if (cancelled) return; object = URL.createObjectURL(blob); setUrl(object); }).catch(() => { if (!cancelled) setUrl(''); });
    return () => { cancelled = true; if (object) URL.revokeObjectURL(object); };
  }, [enabled]);
  return url;
}

/** `logo`: the logo to show (a URL), or '' for none; left out, the selector loads the company logo itself. */
export function PilotSelector({ user, pilots, onOpen, onLogout, logo }: { user: User; pilots: Pilot[]; onOpen: (key: PilotKey) => void; onLogout: () => void; logo?: string }) {
  const loaded = useCompanyLogo(logo === undefined), source = logo ?? loaded;
  return <div className="pilot-select-page">
    <AccountBar user={user} onLogout={onLogout}/>
    <main className="pilot-select-main" id="main-content">
      {source && <img className="pilot-select-logo" src={source} alt="Company logo"/>}
      <div className="eyebrow">BLITZKRIEG · WORKSPACES</div>
      <h1>Select your application workspace</h1>
      <p>Projects, isometrics, spools and certificates are shared. Choose where you want to work now; you can switch at any time.</p>
      {pilots.length ? <ul className="pilot-tiles">{pilots.map(pilot => { const Icon = ICONS[pilot.key]; return <li key={pilot.key}>
        <a className="pilot-tile" href={`/${pilot.key}`} style={{ '--pilot-color': pilot.color } as React.CSSProperties} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); onOpen(pilot.key); }}>
          <span className="pilot-tile-icon"><Icon size={26}/></span><span className="pilot-tile-text"><strong>{pilot.title}</strong><small>{pilot.description}</small></span><ArrowRight size={18}/>
        </a></li>; })}</ul>
        : <section className="panel pilot-select-empty"><EmptyState title="No workspace is open to your account" description="Your account is not enabled for Weld Pilot or MTO Pilot, or its profiles do not include welding or materials access. Ask your administrator to enable a workspace for your account."/></section>}
    </main>
  </div>;
}

const pathOnly = (path: string) => path.split('?')[0];
/** Whether the current page is a delivered page of this pilot's menu that the profile may not open (then the page says so). */
export function usePilotNoRights(pathname: string) {
  const state = usePilot(); const { user, canRecord, canReadReport, canArea, projectScopeEnabled, siteId } = useWorkspace();
  if (!state?.entered) return false;
  // The main project is chosen first: until then the choice is shown, whatever the page.
  if (projectScopeEnabled && !siteId) return false;
  return pilotPageState(state.pilot, pathname, { delivered: path => pageAvailable(user.availability, path, RESOURCES), canRecord, canReadReport, canArea }) === 'no-rights';
}
/** The page of a menu item the profile may not open (the server refuses its data in any case). */
export function PilotNoRights() {
  return <div className="page pilot-no-access pilot-no-rights" role="alert"><span className="pilot-no-access-icon"><ShieldAlert size={22}/></span><EmptyState title={NO_RIGHTS_TEXT} description="Ask an administrator to add the right to your permission profile." action={<Link className="btn" to="/dashboard">Go to dashboard</Link>}/></div>;
}
const queryOf = (path: string) => path.includes('?') ? path.slice(path.indexOf('?')) : '';

/**
 * Sidebar of the current pilot, rendered from `shared/pilots.ts`. Items appear only where their page is available.
 * `collapsed`: the menu is reduced to one icon per group; a group opens as a panel beside the icons.
 */
export function PilotNavigation({ onPassword, collapsed = false }: { onPassword: () => void; collapsed?: boolean }) {
  const state = usePilot()!; const { user, canRecord, canReadReport, canArea } = useWorkspace(); const location = useLocation();
  const [searching, setSearching] = useState(false);
  // Collapsed menu: the group whose panel is open, and where the panel starts (the top of its icon).
  const [panel, setPanel] = useState<{ title: string; top: number } | null>(null);
  const panelGroup = useRef<HTMLDivElement>(null), panelBox = useRef<HTMLDivElement>(null), panelButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setPanel(null); }, [collapsed, location.pathname, location.search]);
  useEffect(() => {
    if (!panel) return;
    const inside = (target: EventTarget | null, box: HTMLElement | null) => target instanceof Node && Boolean(box?.contains(target));
    const outside = (event: Event) => { if (!inside(event.target, panelGroup.current)) setPanel(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPanel(null); panelButton.current?.focus(); } };
    // The panel is placed beside its icon: once the icons scroll or the window changes, it no longer is.
    const moved = (event: Event) => { if (!inside(event.target, panelBox.current)) setPanel(null); };
    document.addEventListener('mousedown', outside); document.addEventListener('focusin', outside); document.addEventListener('keydown', key);
    document.addEventListener('scroll', moved, true); window.addEventListener('resize', moved);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', key); document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved); };
  }, [panel]);
  // Keep the whole panel on screen: a group low in the menu opens upwards as far as needed.
  useLayoutEffect(() => {
    const box = panelBox.current; if (!box || !panel) return;
    const over = box.getBoundingClientRect().bottom - (window.innerHeight - 12);
    if (over > 1) setPanel({ ...panel, top: Math.max(12, panel.top - over) });
  }, [panel]);
  const target = (item: PilotItem) => item.resource && RESOURCE_MAP[item.resource] && !item.path ? resourcePath(item.resource) : pilotItemPath(item);
  // Every page the workspace delivers is listed; one the profile may not open is greyed and opens the "no rights" page.
  // Page areas (the Weld dashboard 35, Export welds 81, …) need their own Show as well.
  const rights: MenuRights = { delivered: path => pageAvailable(user.availability, path, RESOURCES), canRecord, canReadReport, canArea };
  const restricted = (item: PilotItem) => pilotItemState(item, rights) === 'no-rights';
  const groups = state.pilot.groups.map(group => ({ ...group, items: group.items.filter(item => pilotItemState(item, rights) !== 'hidden') })).filter(group => group.items.length);
  const items = groups.flatMap(group => group.items);
  const here = (item: PilotItem) => { const to = target(item); return Boolean(to) && pathOnly(to!) === location.pathname; };
  const active = items.find(item => here(item) && queryOf(target(item)!) && queryOf(target(item)!) === location.search) || items.find(item => here(item) && !queryOf(target(item)!));
  if (!state.entered) return <p className="pilot-nav-note">{state.pilot.title} is not included in your permission profile.</p>;
  const entry = (item: PilotItem) => item.action
    ? <button key={item.label} type="button" className={`sub-nav-item pilot-nav-button${restricted(item) ? ' no-rights' : ''}`} aria-disabled={restricted(item) || undefined} title={restricted(item) ? NO_RIGHTS_TEXT : undefined} onClick={() => { setPanel(null); if (restricted(item)) return; if (item.action === 'password') onPassword(); else setSearching(true); }}>{item.label}</button>
    : <Link key={item.label} to={target(item)!} className={`sub-nav-item${item === active ? ' active' : ''}${restricted(item) ? ' no-rights' : ''}`} aria-current={item === active ? 'page' : undefined} aria-disabled={restricted(item) || undefined} title={restricted(item) ? NO_RIGHTS_TEXT : undefined} onClick={() => setPanel(null)}>{item.label}</Link>;
  const search = searching && <ProjectSearch onClose={() => setSearching(false)}/>;
  if (collapsed) return <>{groups.map(group => {
    const Icon = GROUP_ICONS[group.icon], current = group.items.includes(active!), open = panel?.title === group.title, only = group.items.length === 1 && !group.items[0].action ? group.items[0] : null;
    // A group of one page (Start → Dashboard) opens that page directly.
    if (only) return <div key={state.pilot.key + group.title} className="nav-rail-group"><Link to={target(only)!} className={`nav-rail-button${current ? ' active' : ''}${restricted(only) ? ' no-rights' : ''}`} aria-disabled={restricted(only) || undefined} aria-label={only.label} title={only.label} aria-current={current ? 'page' : undefined}><Icon size={18}/></Link></div>;
    return <div key={state.pilot.key + group.title} ref={open ? panelGroup : undefined} className={`nav-rail-group${open ? ' open' : ''}`}>
      <button type="button" className={`nav-rail-button${current ? ' active' : ''}`} aria-label={group.title} title={open ? undefined : group.title} aria-haspopup="true" aria-expanded={open}
        onClick={event => { panelButton.current = event.currentTarget; setPanel(open ? null : { title: group.title, top: event.currentTarget.getBoundingClientRect().top }); }}><Icon size={18}/></button>
      {open && <div ref={panelBox} className="nav-flyout" role="group" aria-label={group.title} style={{ top: panel!.top }}><strong className="nav-flyout-title">{group.title}</strong>{group.items.map(entry)}</div>}
    </div>;
  })}{search}</>;
  return <>{groups.map(group => { const Icon = GROUP_ICONS[group.icon]; return <details key={state.pilot.key + group.title} className="nav-group pilot-nav-group" open={group.items.includes(active!)}>
    <summary><span className="nav-group-title"><Icon size={15}/>{group.title}</span><ChevronDown size={13}/></summary>
    {group.items.map(entry)}
  </details>; })}{search}</>;
}

const projectLabel = (project: Record<string, unknown>) => [project.internnumber, project.description].map(value => String(value ?? '').trim()).filter(Boolean).join(' - ') || 'Unnamed project';

/**
 * Iso overview → "Project search": choose one of the projects visible in this pilot and main project, then Search
 * opens its isometrics page. The input filters the project list as the user types (a native combobox).
 */
function ProjectSearch({ onClose }: { onClose: () => void }) {
  const { rows } = useWorkspace(); const navigate = useNavigate(); const id = useId();
  const projects = (rows.projects || []).filter(project => !project._archived).map(project => ({ id: project.id, label: projectLabel(project) })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
  const [query, setQuery] = useState(''), [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const wanted = query.trim().toLowerCase();
    const match = projects.find(project => project.label.toLowerCase() === wanted) || (wanted ? projects.filter(project => project.label.toLowerCase().includes(wanted)) : []).find((_, index, list) => list.length === 1);
    if (!match) { setError(wanted ? 'Choose one project from the list.' : 'Choose a project.'); return; }
    onClose(); navigate(`/workspace/projects/${match.id}/isometrics`);
  }
  return <Modal title="Project search" subtitle="Open the isometric overview of a project." onClose={onClose}>
    {projects.length ? <form onSubmit={submit}><div className="modal-body">
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="field"><label htmlFor={`${id}-project`}>Project</label><input id={`${id}-project`} list={`${id}-projects`} value={query} onChange={event => { setQuery(event.target.value); setError(''); }} placeholder="Search intern prj. no. or description" autoComplete="off" aria-invalid={Boolean(error)} required/>
        <datalist id={`${id}-projects`}>{projects.map(project => <option key={project.id} value={project.label}/>)}</datalist></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Search</button></div></form>
      : <><div className="modal-body"><EmptyState title="No projects" description="No project is visible in this main project."/></div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button></div></>}
  </Modal>;
}

/** The pilot block in the sidebar: title in the pilot colour and the way back to the selector. */
export function PilotBadge() {
  const state = usePilot(); if (!state) return null; const Icon = ICONS[state.pilot.key];
  return <div className="pilot-badge" title={state.pilot.title}><span className="pilot-badge-icon"><Icon size={16}/></span><strong>{state.pilot.title}</strong>{state.allowed.length > 1 && <button type="button" className="pilot-badge-switch" onClick={state.selectPilot} aria-label="Select application workspace" title="Select application workspace"><LayoutGrid size={14}/><span>Switch</span></button>}</div>;
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
