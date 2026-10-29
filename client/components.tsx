import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type InvalidEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Check, Search, FileText, ArrowUpRight } from 'lucide-react';
import type { ActionField, Field, Row } from '../shared/types.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { availableWps } from './catalog.ts';
import { useWorkspace } from './context.tsx';
import { formatDate, formatNumber } from './api.ts';

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current; const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]') || []).filter(e => e.getClientRects().length > 0);
    const focus = requestAnimationFrame(() => (focusable().find(e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName)) || focusable()[0] || dialog)?.focus());
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); } if (e.key === 'Tab') { const els = focusable(); const first = els[0], last = els.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); cancelAnimationFrame(focus); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}

// Native validation must be able to reach required fields in collapsed sections.
export function revealInvalidField(event: InvalidEvent<HTMLFormElement>) {
  const field = event.target as HTMLInputElement;
  const section = field.closest('details');
  if (section && !section.open) section.open = true;
}

export function TableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    const update = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(update); observer.observe(element); if (element.firstElementChild) observer.observe(element.firstElementChild);
    update(); return () => observer.disconnect();
  }, []);
  return <div className="table-scroll-wrap"><div className="table-scroll" ref={ref} tabIndex={overflow ? 0 : undefined} role={overflow ? 'region' : undefined} aria-label={overflow ? 'Scrollable table. Use arrow keys to see more columns.' : undefined}>{children}</div>{overflow && <p className="table-scroll-hint"><ArrowUpRight size={13}/>Scroll horizontally to see all columns</p>}</div>;
}

export function Dropdown({ trigger, label, children, className = '', menuClassName = '' }: {
  trigger: ReactNode; label?: string; children: ReactNode; className?: string; menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 400 });
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)') || []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchor.current!.getBoundingClientRect();
      const menu = panel.current!;
      const below = Math.max(0, window.innerHeight - rect.bottom - 12);
      const above = Math.max(0, rect.top - 12);
      const placeBelow = below >= Math.min(menu.scrollHeight, 280) || below >= above;
      const maxHeight = Math.min(400, placeBelow ? below : above);
      setPosition({
        top: placeBelow ? rect.bottom + 6 : Math.max(8, rect.top - Math.min(menu.scrollHeight, maxHeight) - 6),
        left: Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)),
        maxHeight,
      });
    };
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); setOpen(false); anchor.current?.focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', scroll, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', focus);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', scroll, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      document.removeEventListener('focusin', focus);
    };
  }, [open]);

  return <div className={`dropdown ${className}`}>
    <button type="button" ref={anchor} className="dropdown-trigger" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => {
        setOpen(value => !value);
        if (!open && event.detail === 0) requestAnimationFrame(() => items()[0]?.focus());
      }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault(); setOpen(true); requestAnimationFrame(() => items()[0]?.focus());
        }
      }}>{trigger}</button>
    {open && createPortal(<div id={id} ref={panel} className={`dropdown-menu dropdown-panel ${menuClassName}`} style={position}
      onClickCapture={event => {
        // Retain the trigger as the return point when a menu item opens a dialog.
        if ((event.target as HTMLElement).closest('button,a[href]')) anchor.current?.focus();
      }}
      onClick={event => { if ((event.target as HTMLElement).closest('button,a[href]')) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Tab') { setOpen(false); anchor.current?.focus(); return; }
        const list = items();
        const index = list.indexOf(document.activeElement as HTMLElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
          list[next]?.focus();
        }
      }}>{children}</div>, document.body)}
  </div>;
}
export function FieldInput({ field, value, onChange, error, values = {}, allowedIds }: { field: Field | ActionField; value: unknown; onChange: (value: unknown) => void; error?: string; values?: Record<string, unknown>;allowedIds?:string[] }) {
  const { rows, user, label, projectScopeEnabled } = useWorkspace();
  if (projectScopeEnabled && field.ref === 'projects' && /^(Project|Project scope)$/.test(field.label)) field = { ...field, label: 'Subproject' };
  const uniqueId=useId(); const id = `field-${field.name}-${uniqueId.replaceAll(':','')}`;
  if(field.hidden)return null;
  let options = field.ref ? (rows[field.ref] || []).filter(r => !r._archived) : [];
  if(field.refCategory)options=options.filter(r=>r.category===field.refCategory);
  if(allowedIds)options=options.filter(r=>allowedIds.includes(r.id));
  if (field.ref === 'spools' && values.isoId) options = options.filter(r => r.isoId === values.isoId);
  if (field.ref === 'iso_materials' && values.isoId) options = options.filter(r => r.isoId === values.isoId);
  if (field.ref === 'certifications' && /^certificate[12]Id$/.test(field.name)) {
    const material = values[`material${field.name.match(/[12]/)![0]}Id`];
    if (material) options = options.filter(row => !row.materialId || row.materialId === material);
  }
  if (field.ref === 'isometrics' && values.projectId) options = options.filter(r => r.projectId === values.projectId);
  if (user.availability && field.ref === 'wps' && values.isoId) { const project=rows.isometrics?.find(row=>row.id===values.isoId)?.projectId; if(project) options=options.filter(wps=>availableWps(rows,wps,String(project))); options=options.filter(wps=>wps.active!==false || wps.id===value); }
  if (field.ref === 'rentals') options = options.filter(r => ['Rented', 'Partially returned'].includes(String(r.status)));
  if (field.name === 'orderId') options = options.filter(r => ['Pending', 'Partially received'].includes(String(r.status)));
  const refLabel = (r: Row) => { let name = label(field.ref!, r.id); if (field.ref === 'calculation_norms') name += ` · ${r.uom} · ${r.hoursPerUnit} h/unit`; if (field.ref === 'welds'||field.ref==='iso_materials') name += ` · ${label('isometrics', r.isoId)}`; if (field.ref === 'iso_materials') name += ` · ${r.quantity} ${r.materialId ? rows.materials?.find(material => material.id === r.materialId)?.uom || '' : r.uom || ''}${r.chargeNo ? ` · ${r.chargeNo}` : ''}`; if (field.ref === 'inspection_requests') name += ` · ${label('welds', r.weldId)} · ${r.status}`; if (field.ref === 'rentals') name += ` · ${label('articles', r.articleId)} · ${Number(r.quantity) - Number(r.returned)} outstanding`; return name; };
  if (field.showIf && values[field.showIf[0]] !== field.showIf[1]) return null;
  if (field.name === 'ndtpercent' && !values.ndoReq) return null;
  const common = { id, name: field.name, required: field.required, disabled: field.readonly, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined };
  if (field.type === 'checkbox') return <div className="field checkbox-field"><label htmlFor={id}><input {...common} type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)}/><span>{field.label}</span></label>{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
  const multiple = 'multiple' in field && field.multiple;
  return <div className={`field ${field.type === 'textarea' || multiple ? 'full-width' : ''}`}><label htmlFor={id}>{field.label}{field.required && <span className="required"> *</span>}</label>
    {field.creatable?<><input {...common} type="text" list={`${id}-options`} value={String(options.find(r=>r.id===value)?.name??value??'')} onChange={e=>onChange(e.target.value)}/><datalist id={`${id}-options`}>{options.map(r=><option key={r.id} value={String(r.name)}/>)}</datalist></>:multiple ? <div className="multi-options" id={id}>{options.length ? options.map(r => <label key={r.id}><input type="checkbox" checked={Array.isArray(value) && value.includes(r.id)} onChange={e => { const list = Array.isArray(value) ? value : []; onChange(e.target.checked ? [...list, r.id] : list.filter(x => x !== r.id)); }}/><span>{refLabel(r)}</span></label>) : <p>No records available. Add {RESOURCE_MAP[field.ref!]?.title.toLowerCase()} first.</p>}</div>
    : field.type === 'textarea' ? <textarea {...common} value={String(value ?? '')} rows={3} onChange={e => onChange(e.target.value)}/>
    : field.type === 'ref' || field.type === 'select' ? <div className="select-wrap"><select {...common} value={String(value ?? '')} onChange={e => onChange(e.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{field.ref ? options.map(r => <option key={r.id} value={r.id}>{refLabel(r)}</option>) : field.options?.map(o => <option key={o}>{o}</option>)}</select><ChevronDown size={14}/></div>
    : <input {...common} type={field.type} value={typeof value === 'number' ? value : String(value ?? '')} min={field.min} max={field.max} step={field.type === 'number' ? field.step??'any' : undefined} autoComplete={field.type === 'password' ? 'new-password' : 'off'} onChange={e => onChange(field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)}/>}
    {field.hint && <small className="field-hint">{field.hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}
  </div>;
}
export function Badge({ children, color }: { children: ReactNode; color?: string }) { const value = String(children).toLowerCase(); const type = color || (/accepted|completed|received|returned|active|^yes$/.test(value) && !/partially|inactive/.test(value) ? 'green' : /rejected|critical|cancelled|overdue/.test(value) ? 'red' : /pending|open|high|partial|rented|requested|hold/.test(value) ? 'amber' : 'neutral'); return <span className={`badge ${type}`}><span/>{children}</span>; }
export function Cell({ field, value }: { field: Field; value: unknown }) {
  const { label } = useWorkspace();
  if (field.ref) return <>{label(field.ref, value)}</>;
  if (value === '' || value === undefined || value === null) return <span className="muted">—</span>;
  if (field.type === 'checkbox') return value ? <span className="check-value"><Check size={14}/>Yes</span> : <span className="muted">No</span>;
  if (field.type === 'date') return <span className="tabular">{formatDate(value)}</span>;
  if (field.type === 'number') return <span className="tabular">{formatNumber(value, field.name === 'price' ? 2 : 3)}</span>;
  if (['status', 'result', 'priority'].includes(field.name)) return <Badge>{String(value)}</Badge>;
  return <>{String(value)}</>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><FileText size={25}/></div><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Progress({ value, color = 'green' }: { value: number; color?: string }) { return <div className={`progress ${color}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }}/></div>; }
export function SearchInput({ value, onChange, placeholder = 'Search records…' }: {value: string; onChange: (v: string) => void; placeholder?: string}) { const input = useRef<HTMLInputElement>(null); return <div className="search-field"><Search size={17}/><input ref={input} type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/>{value && <button type="button" className="icon-btn" onClick={() => { onChange(''); input.current?.focus(); }} aria-label="Clear search"><X size={14}/></button>}</div>; }
export function InlineLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={13}/></button>; }
