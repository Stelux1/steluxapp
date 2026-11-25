import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Check, Boxes, Calculator, ChevronDown, ClipboardList, Flame, FolderKanban, HardHat, Layers3, LayoutDashboard, LayoutGrid, Loader2, LogOut, Package, ScanLine, ScanSearch, Settings2, ShieldAlert, ShoppingCart, Truck, Users, Wrench } from 'lucide-react';
import { COMING_CORES, NO_RIGHTS_TEXT, coreFanItems, PILOTS, PILOT_MAP, allowedPilots, legacyPilotPath, pagePilots, pilotItemPath, pilotItemState, pilotPageState, splitPilotPath, type MenuRights, type Pilot, type PilotGroupIcon, type PilotItem, type PilotKey, type ComingCore, type CoreFanItem } from '../shared/pilots.ts';
import { pageAvailable } from '../shared/release.ts';
import type { User } from '../shared/types.ts';
import { RESOURCES, RESOURCE_MAP } from './catalog.ts';
import { useOptionalWorkspace, useWorkspace } from './context.tsx';
import { resourcePath } from './records.tsx';
import { EmptyState, Modal } from './components.tsx';
import { Wordmark } from './brand.tsx';
import { api, apiBlob, post } from './api.ts';
import type { LogoSizing } from '../shared/pdf-company.ts';

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

const ICONS: Record<PilotKey, typeof ScanLine> = { weld: ScanLine, mto: Package };
/** Icons of the Cores that are not built yet (selector only). */
const COMING_ICONS: Record<ComingCore['icon'], typeof ScanLine> = { tools: Wrench, finance: Calculator, teams: Users };
/** Icons of the menu groups: beside the group title, and alone when the menu is collapsed to icons. */
const GROUP_ICONS: Record<PilotGroupIcon, typeof ScanLine> = {
  start: LayoutDashboard, welders: HardHat, weld: Flame, material: Layers3, ndt: ScanSearch, welding: ClipboardList, releases: BadgeCheck,
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
  // `/` is always the Core selector, also for an account with one Core: the Core is chosen at every sign-in (client 20.11.2026).
  const redirect = pilot ? '' : path !== '/' ? legacyPilotPath(path, allowed.map(p => p.key)) + window.location.search + window.location.hash : '';
  useLayoutEffect(() => { if (redirect) go(redirect, true); }, [redirect, go]);
  if (redirect) return <div className="screen-center" role="status"><Wordmark dark/><p>Opening your workspace…</p></div>;
  if (!pilot) return <PilotSelector user={user} pilots={allowed} onOpen={key => go(`/${key}`)} onLogout={onLogout}/>;
  const value: PilotState = { pilot: PILOT_MAP[pilot], allowed, entered: allowed.some(p => p.key === pilot), openPilot: (key, page = '') => go(`/${key}${page}`), selectPilot: () => go('/') };
  // The server refuses every request of a pilot the account may not enter, so its workspace is not opened at all.
  if (!value.entered) return <PilotRefused user={user} pilot={value.pilot} onSelect={() => go('/')} onLogout={onLogout}/>;
  return <PilotContext.Provider value={value}><BrowserRouter key={pilot} basename={`/${pilot}`}>{children}</BrowserRouter></PilotContext.Provider>;
}

/** Header of the selector and the no-access screen: the account and Logout (reference wording). */
function AccountBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function logout() { setBusy(true); setError(''); try { await post('/auth/logout', {}); window.history.replaceState(null, '', '/'); onLogout(); } catch (e) { setError((e as Error).message); setBusy(false); } }
  return <><header className="pilot-select-top"><Wordmark/><div className="pilot-select-user"><span><strong>{user.name}</strong><small>{user.email}</small></span><button type="button" className="btn small" onClick={() => void logout()} disabled={busy}>{busy ? <Loader2 size={14} className="spin"/> : <LogOut size={14}/>}Logout</button></div></header>{error && <div className="alert error" role="alert">{error}</div>}</>;
}

/** A pilot URL the account may not enter (not enabled for it, or its profile does not open the pilot). */
function PilotRefused({ user, pilot, onSelect, onLogout }: { user: User; pilot: Pilot; onSelect: () => void; onLogout: () => void }) {
  const others = allowedPilots(user).length;
  return <div className="pilot-select-page">
    <AccountBar user={user} onLogout={onLogout}/>
    <main className="pilot-select-main" id="main-content"><section className="panel pilot-select-empty" role="alert"><span className="pilot-no-access-icon"><ShieldAlert size={22}/></span><EmptyState title={`You do not have access to ${pilot.title}`} description={others ? 'Your account is not enabled for this workspace. Choose a workspace that is open to your account.' : 'Your account is not enabled for any workspace. Ask your administrator to enable Weld Core or Material Core for your account.'} action={others ? <button className="btn primary" onClick={onSelect}>Select a workspace</button> : undefined}/></section></main>
  </div>;
}

/** The company logo of Company data for the application selector: its object URL, or '' while there is none (no logo saved, or it cannot be loaded). */
function useCompanyLogo(enabled: boolean) {
  const [url, setUrl] = useState(''), [sizing, setSizing] = useState<LogoSizing | undefined>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, object = '';
    apiBlob('/company-logo').then(blob => { if (cancelled) return; object = URL.createObjectURL(blob); setUrl(object); }).catch(() => { if (!cancelled) setUrl(''); });
    // The size and padding saved in Company data; without them the stylesheet's size stays.
    api<LogoSizing>('/company-logo?sizing=1').then(value => { if (!cancelled) setSizing(value); }).catch(() => { if (!cancelled) setSizing(undefined); });
    return () => { cancelled = true; if (object) URL.revokeObjectURL(object); };
  }, [enabled]);
  return { url, sizing };
}
/** The inline style of the selector's logo from the Company data sizing (pixels). */
export const logoStyle = (sizing?: LogoSizing): React.CSSProperties | undefined => sizing ? { maxHeight: sizing.maxHeight, paddingTop: sizing.paddingTop, paddingBottom: sizing.paddingBottom } : undefined;

/**
 * The Core selector (client design 20.11.2026): Weld Core and Material Core open when the account may enter them; the Cores
 * that are not built yet are shown with "Coming soon" and never open. `pilots`: the Cores the account may enter.
 * `logo`: the logo to show (a URL), or '' for none; left out, the selector loads the company logo itself.
 */
export function PilotSelector({ user, pilots, onOpen, onLogout, logo, sizing }: { user: User; pilots: Pilot[]; onOpen: (key: PilotKey) => void; onLogout: () => void; logo?: string; sizing?: LogoSizing }) {
  const loaded = useCompanyLogo(logo === undefined), source = logo ?? loaded.url, size = sizing ?? (logo === undefined ? loaded.sizing : undefined);
  const card = (title: string, description: string, Icon: typeof ScanLine, badge?: string) => <>
    <span className="pilot-tile-icon"><Icon size={26}/></span><span className="pilot-tile-divider" aria-hidden="true"/>
    <span className="pilot-tile-text"><strong>{title}</strong><small>{description}</small>{badge && <span className="pilot-tile-badge">{badge}</span>}</span><ArrowRight size={18} aria-hidden="true"/>
  </>;
  const closed = (key: string, color: string, body: ReactNode, label: string) => <li key={key}><div className="pilot-tile is-disabled" role="link" aria-disabled="true" aria-label={label} style={{ '--pilot-color': color } as React.CSSProperties}>{body}</div></li>;
  return <div className="pilot-select-page">
    <AccountBar user={user} onLogout={onLogout}/>
    <main className="pilot-select-main" id="main-content">
      {source && <img className="pilot-select-logo" src={source} alt="Company logo" style={logoStyle(size)}/>}
      <div className="eyebrow">BLITZKRIEG · CORES</div>
      <h1>Select your application workspace</h1>
      <p>Projects, isometrics, spools and certificates are shared between the Cores. Choose where you want to work now; you can switch at any time.</p>
      {pilots.length ? <ul className="pilot-tiles">
        {PILOTS.map(pilot => { const Icon = ICONS[pilot.key], open = pilots.some(entry => entry.key === pilot.key);
          if (!open) return closed(pilot.key, pilot.color, card(pilot.title, pilot.description, Icon, 'Not enabled'), `${pilot.title}: not enabled for your account`);
          return <li key={pilot.key}><a className="pilot-tile" href={`/${pilot.key}`} style={{ '--pilot-color': pilot.color } as React.CSSProperties} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); onOpen(pilot.key); }}>
            {card(pilot.title, pilot.description, Icon)}
          </a></li>; })}
        {COMING_CORES.map(core => closed(core.key, core.color, card(core.title, core.description, COMING_ICONS[core.icon], 'Coming soon'), `${core.title}: coming soon`))}
      </ul>
        : <section className="panel pilot-select-empty"><EmptyState title="No workspace is open to your account" description="Your account is not enabled for Weld Core or Material Core. Ask your administrator to enable a workspace for your account."/></section>}
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
/**
 * Where "Go to dashboard" of the no-rights page leads: the dashboard when the profile opens it, otherwise the first menu page
 * it opens, or nowhere (no button) when it opens none, so the button never leads to another no-rights page.
 */
export function pilotHomePath(pilot: Pilot, rights: MenuRights): { path: string; label: string } | null {
  if (pilotPageState(pilot, '/dashboard', rights) !== 'no-rights') return { path: '/dashboard', label: 'Go to dashboard' };
  const open = pilot.groups.flatMap(group => group.items).find(item => !item.action && pilotItemState(item, rights) === 'open');
  const path = open && pilotItemPath(open);
  return open && path ? { path, label: `Go to ${open.label}` } : null;
}
/** The page of a menu item the profile may not open (the server refuses its data in any case). */
export function PilotNoRights() {
  const state = usePilot(), workspace = useOptionalWorkspace();
  const home = state && workspace ? pilotHomePath(state.pilot, { delivered: path => pageAvailable(workspace.user.availability, path, RESOURCES), canRecord: workspace.canRecord, canReadReport: workspace.canReadReport, canArea: workspace.canArea }) : { path: '/dashboard', label: 'Go to dashboard' };
  return <div className="page pilot-no-access pilot-no-rights" role="alert"><span className="pilot-no-access-icon"><ShieldAlert size={22}/></span><EmptyState title={NO_RIGHTS_TEXT} description="Ask an administrator to add the right to your permission profile." action={home ? <Link className="btn" to={home.path}>{home.label}</Link> : undefined}/></div>;
}
const queryOf = (path: string) => path.includes('?') ? path.slice(path.indexOf('?')) : '';

/**
 * Sidebar of the current pilot, rendered from `shared/pilots.ts`. Items appear only where their page is available.
 * `collapsed`: the menu is reduced to one icon per group; a group opens as a panel beside the icons.
 */
export function PilotNavigation({ onPassword, collapsed = false }: { onPassword: () => void; collapsed?: boolean }) {
  const state = usePilot()!; const { user, canRecord, canReadReport, canArea } = useWorkspace(); const location = useLocation();
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
    ? <button key={item.label} type="button" className={`sub-nav-item pilot-nav-button${restricted(item) ? ' no-rights' : ''}`} aria-disabled={restricted(item) || undefined} title={restricted(item) ? NO_RIGHTS_TEXT : undefined} onClick={() => { setPanel(null); if (restricted(item)) return; onPassword(); }}>{item.label}</button>
    : <Link key={item.label} to={target(item)!} className={`sub-nav-item${item === active ? ' active' : ''}${restricted(item) ? ' no-rights' : ''}`} aria-current={item === active ? 'page' : undefined} aria-disabled={restricted(item) || undefined} title={restricted(item) ? NO_RIGHTS_TEXT : undefined} onClick={() => setPanel(null)}>{item.label}</Link>;
  if (collapsed) return <>{groups.map(group => {
    const Icon = GROUP_ICONS[group.icon], current = group.items.includes(active!), open = panel?.title === group.title, only = group.items.length === 1 && !group.items[0].action ? group.items[0] : null;
    // A group of one page (Start → Dashboard) opens that page directly.
    if (only) return <div key={state.pilot.key + group.title} className="nav-rail-group"><Link to={target(only)!} className={`nav-rail-button${current ? ' active' : ''}${restricted(only) ? ' no-rights' : ''}`} aria-disabled={restricted(only) || undefined} aria-label={only.label} title={only.label} aria-current={current ? 'page' : undefined}><Icon size={18}/></Link></div>;
    return <div key={state.pilot.key + group.title} ref={open ? panelGroup : undefined} className={`nav-rail-group${open ? ' open' : ''}`}>
      <button type="button" className={`nav-rail-button${current ? ' active' : ''}`} aria-label={group.title} title={open ? undefined : group.title} aria-haspopup="true" aria-expanded={open}
        onClick={event => { panelButton.current = event.currentTarget; setPanel(open ? null : { title: group.title, top: event.currentTarget.getBoundingClientRect().top }); }}><Icon size={18}/></button>
      {open && <div ref={panelBox} className="nav-flyout" role="group" aria-label={group.title} style={{ top: panel!.top }}><strong className="nav-flyout-title">{group.title}</strong>{group.items.map(entry)}</div>}
    </div>;
  })}</>;
  return <>{groups.map(group => { const Icon = GROUP_ICONS[group.icon]; return <details key={state.pilot.key + group.title} className="nav-group pilot-nav-group" open={group.items.includes(active!)}>
    <summary><span className="nav-group-title"><Icon size={15}/>{group.title}</span><ChevronDown size={13}/></summary>
    {group.items.map(entry)}
  </details>; })}</>;
}

/** Where the pills of the fan sit: a gentle arc bulging to the right, centred on the Switch button. */
export const FAN_SPACING = 54, FAN_BULGE = 34;
export function fanOffsets(count: number): { dx: number; dy: number }[] {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => { const t = mid ? (index - mid) / mid : 0; return { dx: Math.round(FAN_BULGE * (1 - t * t)), dy: Math.round((index - mid) * FAN_SPACING) }; });
}
const fanIcon = (icon: CoreFanItem['icon']) => icon === 'weld' || icon === 'mto' ? ICONS[icon] : COMING_ICONS[icon];

/**
 * The pills of the Switch fan (client video 25.11.2026): a caption, then one pill per Core. Only the Cores that are open
 * to the account are buttons that act; the active Core ("Active" with a check), Cores that are not enabled and the Cores that
 * are coming soon are `aria-disabled` and do nothing. Free of state so it renders on the server; `CoreSwitch` adds the behaviour.
 */
export function CoreFanMenu({ items, onOpen, menuRef, style }: { items: CoreFanItem[]; onOpen?: (key: PilotKey) => void; menuRef?: React.Ref<HTMLDivElement>; style?: React.CSSProperties }) {
  const offsets = fanOffsets(items.length + 1);
  return <div ref={menuRef} className="core-fan" role="menu" aria-label="Switch Core" style={style}>
    <span className="core-fan-caption" aria-hidden="true" style={{ '--i': 0, '--dx': `${offsets[0].dx}px`, '--dy': `${offsets[0].dy}px` } as React.CSSProperties}>Switch Core</span>
    {items.map((item, index) => { const Icon = fanIcon(item.icon), at = offsets[index + 1], live = item.state === 'open';
      return <button key={item.key} type="button" role="menuitem" tabIndex={-1} className={`core-fan-item is-${item.state}`} aria-disabled={live ? undefined : true} aria-current={item.state === 'active' ? 'true' : undefined} data-core={item.key}
        style={{ '--i': index + 1, '--dx': `${at.dx}px`, '--dy': `${at.dy}px`, '--core': item.color } as React.CSSProperties} onClick={() => { if (live) onOpen?.(item.key as PilotKey); }}>
        <span className="core-fan-icon"><Icon size={17}/></span>
        <span className="core-fan-text"><strong>{item.label}</strong>{item.stateText && <small>{item.stateText}</small>}</span>
        {item.state === 'active' ? <Check size={14} className="core-fan-mark" aria-hidden="true"/> : live ? <ArrowRight size={16} className="core-fan-mark" aria-hidden="true"/> : null}
      </button>; })}
  </div>;
}

/** Room between the sidebar's edge and the fan: clears the collapse handle that sits 13 px over the edge. */
export const FAN_SIDEBAR_GAP = 22;
/** The caption's centre stays below this line, under the collapse handle (top 20 px, 26 px high) of the sidebar. */
export const FAN_TOP_CLEAR = 72;
/**
 * Where the fan opens beside the Switch button: to the right of the sidebar (its box, or the button when there is none),
 * centred on the button, but never so high that the caption meets the collapse handle nor so low that a pill leaves the window.
 * The backdrop starts at the sidebar's edge, so the sidebar stays visible and its Switch button closes the fan.
 */
export function fanPlace(button: { right: number; top: number; height: number; bottom: number }, sidebarRight: number | undefined, count: number, viewportHeight: number) {
  const offsets = fanOffsets(count), above = -offsets[0].dy, below = offsets[count - 1].dy, edge = Math.round(sidebarRight ?? button.right);
  const lowest = above + FAN_TOP_CLEAR, highest = Math.max(lowest, viewportHeight - below - 36);
  return { left: edge + FAN_SIDEBAR_GAP, top: Math.round(Math.min(Math.max(button.top + button.height / 2, lowest), highest)), bottom: Math.round(button.bottom + 8), shade: sidebarRight === undefined ? 0 : edge };
}

/**
 * The Switch button and its fan. Click / Enter / Space opens it; focus moves to the first Core that can be opened; the arrow
 * keys move, Escape, a click outside or a second click on the button close it and focus returns to the button. The fan is
 * drawn in a fixed layer on the page beside the sidebar, also from the icon-only button of the collapsed menu; the dim
 * backdrop covers the page only, the sidebar stays as it is.
 */
export function CoreSwitch({ current, allowed, onOpen }: { current: PilotKey; allowed: PilotKey[]; onOpen: (key: PilotKey) => void }) {
  const [place, setPlace] = useState<{ left: number; top: number; bottom: number; shade: number } | null>(null), button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const items = coreFanItems(allowed, current), open = place !== null;
  const close = useCallback((restore = true) => { setPlace(null); if (restore) button.current?.focus(); }, []);
  const toggle = () => {
    if (open) return close();
    const box = button.current!.getBoundingClientRect(), sidebar = button.current!.closest('.sidebar')?.getBoundingClientRect();
    // A sidebar drawn over the page (the phone drawer) is not beside it: there the backdrop covers the whole window.
    setPlace(fanPlace(box, sidebar && sidebar.right < window.innerWidth - 200 ? sidebar.right : undefined, items.length + 1, window.innerHeight));
  };
  useEffect(() => {
    if (!open) return;
    const buttons = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]') || []);
    (buttons().find(el => el.getAttribute('aria-disabled') !== 'true') || buttons()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      const list = buttons(), at = list.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'Tab') { event.preventDefault(); close(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); list[(at + 1) % list.length]?.focus(); }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
      else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus(); } else if (event.key === 'End') { event.preventDefault(); list.at(-1)?.focus(); }
    };
    const away = () => close(false);
    // The sidebar is not covered: a click there (other than on the Switch button, which toggles) closes the fan too.
    const outside = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target : null; if (target?.closest('.sidebar') && !button.current?.contains(target)) close(false); };
    document.addEventListener('keydown', key, true); document.addEventListener('mousedown', outside); window.addEventListener('resize', away);
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', outside); window.removeEventListener('resize', away); };
  }, [open, close]);
  return <>
    <button ref={button} type="button" className="pilot-badge-switch" aria-haspopup="menu" aria-expanded={open} aria-label="Switch Core" title="Switch Core" onClick={toggle}><LayoutGrid size={14}/><span>Switch</span></button>
    {open && createPortal(<div className="core-fan-layer" style={{ '--fan-shade': `${place.shade}px` } as React.CSSProperties}><div className="core-fan-backdrop" onClick={() => close()} aria-hidden="true"/>
      <CoreFanMenu items={items} menuRef={menu} onOpen={key => { close(false); onOpen(key); }} style={{ '--fan-left': `${place.left}px`, '--fan-top': `${place.top}px`, '--fan-bottom': `${place.bottom}px` } as React.CSSProperties}/></div>, document.body)}
  </>;
}

/**
 * The pilot block in the sidebar: title in the pilot colour and the Switch button that opens the fan of Cores. The button is
 * always there inside a Core, also for an account with one Core: the fan then shows the other built Core as "Not enabled".
 */
export function PilotBadge() {
  const state = usePilot(); if (!state) return null; const Icon = ICONS[state.pilot.key];
  return <div className="pilot-badge" title={state.pilot.title}><span className="pilot-badge-icon"><Icon size={16}/></span><strong>{state.pilot.title}</strong><CoreSwitch current={state.pilot.key} allowed={state.allowed.map(entry => entry.key)} onOpen={key => state.openPilot(key, '/dashboard')}/></div>;
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
