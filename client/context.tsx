import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { Bootstrap, Module, Row, User } from '../shared/types.ts';
import { RESOURCE_MAP, configureCatalog } from './catalog.ts';
import { hasFeature } from '../shared/release.ts';
import { Wordmark } from './brand.tsx';
import { api, chooseSite } from './api.ts';
import { canResource,canAction,canScope,canReport } from '../shared/permissions.ts';
import { pilotScope, projectScope } from '../shared/project-scope.ts';
import { pqrNumber } from '../shared/wps.ts';
import { usePilot } from './pilot.tsx';
import { useNavigate } from 'react-router-dom';
import type {PermissionVerb} from '../shared/types.ts';
interface ProjectSelection {
  allRows: Record<string, Row[]>;
  siteId: string;
  selectSite: (id: string) => void;
  projectScopeEnabled: boolean;
}
interface WorkspaceContext extends Bootstrap, ProjectSelection { hasFeature: (key: string) => boolean; refresh: () => Promise<void>; notify: (message: string) => void; can: (module: Module, level?: number) => boolean; canRecord:(resource:string,verb?:PermissionVerb,row?:Row)=>boolean;canRun:(key:string,data?:Record<string,unknown>)=>boolean;canArea:(key:string,verb?:PermissionVerb)=>boolean;canReadReport:(key:string,verb?:PermissionVerb)=>boolean;label: (resource: string, id: unknown) => string; openRecord: (resource: string, id: string) => void; detail: {resource: string; id: string} | null; closeRecord: () => void; }
const Context = createContext<WorkspaceContext | null>(null);
export const useWorkspace = () => { const value = useContext(Context); if (!value) throw new Error('Workspace is unavailable.'); return value; };
export function WorkspaceProvider({ user, onUnauthenticated, children }: { user: User; onUnauthenticated: (ended?: boolean) => void; children: ReactNode }) {
  const navigate = useNavigate(); const pilotKey = usePilot()?.pilot.key;
  // Pilots: the active main project is the one of the sign-in session, kept by the server for every pilot and tab
  // (client/api.ts `chooseSite`); `pendingSite` shows a new choice until the workspace is loaded again. Other profiles keep
  // the main project of this tab.
  const sessionSites = Boolean(user.availability?.features.includes('pilots'));
  const [selectedSite, setSelectedSite] = useState(() => sessionSites ? '' : sessionStorage.getItem(`blitzkrieg-project-${user.id}`) || '');
  const [pendingSite, setPendingSite] = useState<string | null>(null);
  const [data, setData] = useState<Bootstrap>({ user, rows: {}, activity: [] });
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [toast, setToast] = useState(''); const [detail, setDetail] = useState<{resource: string; id: string} | null>(null);
  // A limited account that has not chosen one of its main projects yet sees the choice only (it has no rights until then).
  const choosing = Boolean(data.user.siteRequired);
  const projectScopeEnabled = Boolean(data.user.availability?.features.includes('lisl') && (choosing || canResource(data.user, 'sites') && canResource(data.user, 'projects')));
  // A limited account works in the main project the server evaluated its profile for; others choose freely.
  const chosenSite = sessionSites ? pendingSite ?? data.user.siteId ?? '' : selectedSite;
  const siteId = choosing ? '' : data.user.siteLimited && data.user.siteId ? data.user.siteId : projectScopeEnabled && data.rows.sites?.some(site => site.id === chosenSite && !site._archived) ? chosenSite : '';
  // Projects switched off for the current pilot are left out everywhere in the workspace (outside pilots: no change).
  // A limited account with several main projects also gets the choice of all of them (each read with its own profile).
  const pilotRows = useMemo(() => { const rows = pilotScope(data.rows, pilotKey); return data.siteRows ? { ...rows, ...pilotScope(data.siteRows, pilotKey) } : rows; }, [data.rows, data.siteRows, pilotKey]);
  const scopedRows = useMemo(() => projectScopeEnabled ? projectScope(data.siteRows ? pilotScope(data.rows, pilotKey) : pilotRows, siteId) : pilotRows, [data.rows, data.siteRows, pilotKey, pilotRows, siteId, projectScopeEnabled]);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Bootstrap>('/bootstrap');
      configureCatalog(next.user.availability); setData(next); setPendingSite(null); setReady(true); setError('');
    } catch (e) { const failure = e as { status: number; code?: string }; if (failure.status === 401 || failure.code === 'pilot') onUnauthenticated(failure.status === 401); else setError((e as Error).message); }
  }, [onUnauthenticated, user.id]);
  // A limited account's profile depends on the main project, so choosing another one loads the workspace again.
  const selectSite = (id: string) => {
    setDetail(null);
    if (!sessionSites) { setSelectedSite(id); sessionStorage.setItem(`blitzkrieg-project-${user.id}`, id); return; }
    // The server checks the choice; the workspace then loads again in that main project (a limited account's profile depends on it).
    setPendingSite(id);
    chooseSite(id).then(() => refresh(), (e: Error) => { setPendingSite(null); setError(e.message); });
  };
  useEffect(() => { void refresh(); }, [refresh]);
  // Another tab (or the other pilot) of this session may have changed the main project: check when this tab is shown again.
  const sessionSiteId = data.sessionSiteId ?? '';
  useEffect(() => {
    if (!sessionSites || !ready) return;
    let checking = false;
    const check = async () => {
      if (document.hidden || checking) return; checking = true;
      try { const status = await api<{ currentSiteId?: string }>('/auth/status'); if ((status.currentSiteId ?? '') !== sessionSiteId) await refresh(); } catch { /* the next request reports it */ } finally { checking = false; }
    };
    const visible = () => { void check(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible);
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); };
  }, [sessionSites, ready, sessionSiteId, refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const label = (resource: string, id: unknown) => {
    // A welder the account does not read, named by a readable weld: its stamp (code and name) from the bootstrap.
    const row = data.rows[resource]?.find(r => r.id === id) ?? (resource === 'welders' ? data.welderStamps?.find(stamp => stamp.id === id) as Row | undefined : undefined); if (!row) return id ? 'Unavailable record' : '—';
    if(resource==='welders'&&!row.name)return String(row.number);
    if (resource === 'pqr' && data.user.availability?.features.includes('pilots')) return pqrNumber(row, data.rows.qualification_options);
    if (resource === 'iso_materials' && !row.materialId) return String(row.materialNo || 'Custom material');
    if(['order_lines','stock','movements','picklists'].includes(resource)&&row.customMaterialId)return String(data.rows.custom_materials?.find(r=>r.id===row.customMaterialId)?.materialNo||'Custom material');
    const def = RESOURCE_MAP[resource]; const field = def.fields.find(f => f.name === def.display);
    if (field?.ref) { const target = data.rows[field.ref]?.find(r => r.id === row[field.name]); return target ? String(target[RESOURCE_MAP[field.ref].display]) : String(row[field.name] || row.id); }
    return String(row[def.display] || (resource === 'certifications' ? row.indexNo : '') || row.id);
  };
  return <Context.Provider value={{ ...data, rows: scopedRows, allRows: pilotRows, siteId, selectSite, projectScopeEnabled, activity: data.activity.filter(event => (!siteId || scopedRows[event.entityType]?.some(row => row.id === event.entityId)) && (pilotRows[event.entityType] === data.rows[event.entityType] || pilotRows[event.entityType]?.some(row => row.id === event.entityId))), refresh, hasFeature: key => hasFeature(data.user.availability, key), notify: setToast, can: (module, level = 1) => data.user.permissions[module] >= level,canRecord:(key,verb='show',row)=>canResource(data.user,key,verb,row),canRun:(key,values={})=>canAction(data.user,key,values),canArea:(key,verb='show')=>canScope(data.user,key,verb),canReadReport:(key,verb='show')=>canReport(data.user,key,verb), label, openRecord: (resource, id) => { if (RESOURCE_MAP[resource] && canResource(data.user, resource) && data.rows[resource]?.some(row => row.id === id)) { if (projectScopeEnabled && ['projects', 'isometrics'].includes(resource)) { setDetail(null); navigate(resource === 'projects' ? `/workspace/projects/${id}/isometrics` : `/workspace/isometrics/${id}`); } else setDetail({ resource, id }); } }, detail, closeRecord: () => setDetail(null) }}>
    {!ready ? <div className="screen-center"><Wordmark dark/><p>{error || 'Opening your workspace…'}</p>{error && <button onClick={() => void refresh()}>Try again</button>}</div> : children}
    {ready && error && <div className="network-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></div>}
    {toast && <div className="toast" role="status"><span>✓</span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}>×</button></div>}
  </Context.Provider>;
}
/** The workspace, or null outside it (components that are also shown without a workspace). */
export const useOptionalWorkspace = () => useContext(Context);
export const activeRows = (rows: Record<string, Row[]>, key: string) => (rows[key] || []).filter(r => !r._archived);
