import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { Bootstrap, Module, Row, User } from '../shared/types.ts';
import { RESOURCE_MAP, configureCatalog } from './catalog.ts';
import { hasFeature } from '../shared/release.ts';
import { Wordmark } from './brand.tsx';
import { api } from './api.ts';
import { canResource,canAction,canScope,canReport } from '../shared/permissions.ts';
import { projectScope } from '../shared/project-scope.ts';
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
export function WorkspaceProvider({ user, onUnauthenticated, children }: { user: User; onUnauthenticated: () => void; children: ReactNode }) {
  const navigate = useNavigate();
  const [selectedSite, setSelectedSite] = useState(() => sessionStorage.getItem(`blitzkrieg-project-${user.id}`) || '');
  const [data, setData] = useState<Bootstrap>({ user, rows: {}, activity: [] });
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [toast, setToast] = useState(''); const [detail, setDetail] = useState<{resource: string; id: string} | null>(null);
  const projectScopeEnabled = Boolean(data.user.availability?.features.includes('lisl') && canResource(data.user, 'sites') && canResource(data.user, 'projects'));
  const siteId = projectScopeEnabled && data.rows.sites?.some(site => site.id === selectedSite && !site._archived) ? selectedSite : '';
  const scopedRows = useMemo(() => projectScopeEnabled ? projectScope(data.rows, siteId) : data.rows, [data.rows, siteId, projectScopeEnabled]);
  const selectSite = (id: string) => { setSelectedSite(id); setDetail(null); sessionStorage.setItem(`blitzkrieg-project-${user.id}`, id); };
  const refresh = useCallback(async () => { try { const next = await api<Bootstrap>('/bootstrap'); configureCatalog(next.user.availability); setData(next); setReady(true); setError(''); } catch (e) { if ((e as {status: number}).status === 401) onUnauthenticated(); else setError((e as Error).message); } }, [onUnauthenticated]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const label = (resource: string, id: unknown) => {
    const row = data.rows[resource]?.find(r => r.id === id); if (!row) return id ? 'Unavailable record' : '—';
    if(resource==='welders'&&!row.name)return String(row.number);
    if (resource === 'iso_materials' && !row.materialId) return String(row.materialNo || 'Custom material');
    if(['order_lines','stock','movements','picklists'].includes(resource)&&row.customMaterialId)return String(data.rows.custom_materials?.find(r=>r.id===row.customMaterialId)?.materialNo||'Custom material');
    const def = RESOURCE_MAP[resource]; const field = def.fields.find(f => f.name === def.display);
    if (field?.ref) { const target = data.rows[field.ref]?.find(r => r.id === row[field.name]); return target ? String(target[RESOURCE_MAP[field.ref].display]) : String(row[field.name] || row.id); }
    return String(row[def.display] || row.id);
  };
  return <Context.Provider value={{ ...data, rows: scopedRows, allRows: data.rows, siteId, selectSite, projectScopeEnabled, activity: data.activity.filter(event => !siteId || scopedRows[event.entityType]?.some(row => row.id === event.entityId)), refresh, hasFeature: key => hasFeature(data.user.availability, key), notify: setToast, can: (module, level = 1) => data.user.permissions[module] >= level,canRecord:(key,verb='show',row)=>canResource(data.user,key,verb,row),canRun:(key,values={})=>canAction(data.user,key,values),canArea:(key,verb='show')=>canScope(data.user,key,verb),canReadReport:(key,verb='show')=>canReport(data.user,key,verb), label, openRecord: (resource, id) => { if (RESOURCE_MAP[resource] && canResource(data.user, resource) && data.rows[resource]?.some(row => row.id === id)) { if (projectScopeEnabled && ['projects', 'isometrics'].includes(resource)) { setDetail(null); navigate(resource === 'projects' ? `/workspace/projects/${id}/isometrics` : `/workspace/isometrics/${id}`); } else setDetail({ resource, id }); } }, detail, closeRecord: () => setDetail(null) }}>
    {!ready ? <div className="screen-center"><Wordmark dark/><p>{error || 'Opening your workspace…'}</p>{error && <button onClick={() => void refresh()}>Try again</button>}</div> : children}
    {ready && error && <div className="network-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></div>}
    {toast && <div className="toast" role="status"><span>✓</span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}>×</button></div>}
  </Context.Provider>;
}
export const activeRows = (rows: Record<string, Row[]>, key: string) => (rows[key] || []).filter(r => !r._archived);
