import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { AlertCircle, Loader2, Pencil, Plus } from 'lucide-react';
import { api, post, ApiError } from './api.ts';
import { Badge, TableScroll } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { MEMO_DEFAULT_SORT, MEMO_LIMITS, MEMO_TEXTS, insertMemoTemplate, memoEditorButtons, type MemoInsertMode, type MemoTemplate } from '../shared/memo-templates.ts';

/**
 * Memo templates (rules in shared/memo-templates.ts, server in server/memo-templates.ts): the template buttons of the
 * isometric memo, and the template editor `MemoTemplatesTab`. The editor was the "Memo templates" tab of Edit project
 * site; the client removed that section from the form (change list 22.11.2026, image 9), so it is mounted nowhere until
 * the client names a new place for it. It saves on its own and uses no form element, so it fits inside any form.
 */
interface Listing { siteId: string; templates: MemoTemplate[]; canEdit: boolean; message?: string }
interface Draft { id?: string; scope: 'global' | 'site'; key: string; label: string; sortOrder: string; content: string }
const draftOf = (template?: MemoTemplate): Draft => template ? { id: template.id, scope: template.scope, key: template.key, label: template.label, sortOrder: String(template.sortOrder), content: template.content } : { scope: 'site', key: '', label: '', sortOrder: String(MEMO_DEFAULT_SORT), content: '' };

export function MemoTemplatesTab({ siteId }: { siteId: string }) {
  const { notify } = useWorkspace(); const id = useId().replaceAll(':', '');
  const [listing, setListing] = useState<Listing | null>(null), [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    api<Listing>(`/memo-templates?siteId=${encodeURIComponent(siteId)}`).then(result => { if (live) setListing(result); }).catch(failure => { if (live) setLoadError((failure as Error).message || 'The templates could not be loaded.'); });
    return () => { live = false; };
  }, [siteId]);
  const open = (template?: MemoTemplate) => { setDraft(draftOf(template)); setError(''); setFields({}); };
  async function send(action: 'save' | 'delete' | 'restore') {
    if (!draft) return;
    if (action === 'delete' && !window.confirm(MEMO_TEXTS.confirmDelete)) return;
    if (action === 'restore' && !window.confirm(MEMO_TEXTS.confirmRestore)) return;
    if (action === 'save' && !draft.content.trim()) { setError(MEMO_TEXTS.contentRequired); setFields({ content: MEMO_TEXTS.contentRequired }); return; }
    setBusy(action); setError(''); setFields({});
    try {
      const body = action === 'save' ? { siteId, recordId: draft.id ?? '', label: draft.label, key: draft.key, sortOrder: draft.sortOrder, content: draft.content } : action === 'delete' ? { siteId, recordId: draft.id } : { siteId, key: draft.key };
      const result = await post<Listing>(`/memo-templates/${action}`, body);
      setListing(result); setDraft(null); notify(result.message || MEMO_TEXTS.saved);
    } catch (failure) { setError((failure as Error).message); setFields((failure as ApiError).fields || {}); } finally { setBusy(''); }
  }
  // Enter in a one-line input saves the template, not the site form around it.
  const saveOnEnter = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); void send('save'); } };
  if (loadError) return <div className="alert error" role="alert"><AlertCircle size={18}/><span>{loadError}</span></div>;
  if (!listing) return <p className="muted" role="status"><Loader2 size={15} className="spin"/> Loading templates…</p>;
  const buttons = draft ? memoEditorButtons(draft) : undefined, set = (patch: Partial<Draft>) => setDraft(current => current && { ...current, ...patch });
  const input = (name: 'label' | 'key' | 'sortOrder', label: string, extra: Record<string, unknown> = {}) => <div className="field"><label htmlFor={`${id}-${name}`}>{label}{name === 'label' && <span className="required"> *</span>}</label><input id={`${id}-${name}`} value={draft![name]} aria-invalid={Boolean(fields[name]) || undefined} aria-describedby={fields[name] ? `${id}-${name}-error` : undefined} onKeyDown={saveOnEnter} onChange={event => set({ [name]: event.target.value })} {...extra}/>{fields[name] && <small className="field-error" id={`${id}-${name}-error`}>{fields[name]}</small>}</div>;
  return <div className="memo-templates" style={{ padding: '17px 15px 15px' }}>
    <p className="field-hint">{MEMO_TEXTS.intro}</p>
    {listing.templates.length ? <TableScroll><table className="data-table"><thead><tr>{MEMO_TEXTS.columns.map(column => <th key={column}>{column}</th>)}<th><span className="sr-only">Options</span></th></tr></thead><tbody>
      {listing.templates.map(template => <tr key={template.id}><td>{template.label} <Badge color="neutral">{template.scope === 'global' ? MEMO_TEXTS.global : MEMO_TEXTS.site}</Badge></td><td>{template.key}</td><td className="tabular">{template.sortOrder}</td>
        <td>{listing.canEdit && <button type="button" className="btn small" aria-label={`Edit ${template.label}`} onClick={() => open(template)}><Pencil size={13}/>Edit</button>}</td></tr>)}
    </tbody></table></TableScroll> : <p className="muted">{MEMO_TEXTS.empty}</p>}
    {listing.canEdit && !draft && <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => open()}><Plus size={14}/>{MEMO_TEXTS.add}</button>}
    {draft && <div className="form-section" role="group" aria-labelledby={`${id}-editor`} style={{ marginTop: 12, padding: 12 }}>
      <h3 id={`${id}-editor`}>{MEMO_TEXTS.editor}</h3>
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        {input('label', MEMO_TEXTS.label, { required: true, maxLength: MEMO_LIMITS.label, autoFocus: true })}
        {input('key', MEMO_TEXTS.key, { placeholder: MEMO_TEXTS.keyPlaceholder, maxLength: MEMO_LIMITS.key, readOnly: buttons!.keyReadonly })}
        {input('sortOrder', MEMO_TEXTS.sortOrder, { type: 'number', min: 0, max: MEMO_LIMITS.sortOrder })}
        <div className="field full-width"><label htmlFor={`${id}-content`}>{MEMO_TEXTS.content}<span className="required"> *</span></label><textarea id={`${id}-content`} rows={6} maxLength={MEMO_LIMITS.content} value={draft.content} aria-invalid={Boolean(fields.content) || undefined} aria-describedby={`${id}-content-hint`} onChange={event => set({ content: event.target.value })}/><small className="field-hint" id={`${id}-content-hint`}>{fields.content || MEMO_TEXTS.contentHint}</small></div>
      </div>
      <div className="heading-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn primary small" disabled={Boolean(busy)} onClick={() => void send('save')}>{busy === 'save' && <Loader2 size={14} className="spin"/>}{MEMO_TEXTS.save}</button>
        <button type="button" className="btn small" disabled={Boolean(busy)} onClick={() => setDraft(null)}>{MEMO_TEXTS.cancel}</button>
        {buttons!.restore && <button type="button" className="btn small" disabled={Boolean(busy)} onClick={() => void send('restore')}>{busy === 'restore' && <Loader2 size={14} className="spin"/>}{MEMO_TEXTS.restore}</button>}
        {buttons!.saveForSite && <button type="button" className="btn small" disabled={Boolean(busy)} onClick={() => void send('save')}>{MEMO_TEXTS.saveForSite}</button>}
        {buttons!.remove && <button type="button" className="btn small" disabled={Boolean(busy)} onClick={() => void send('delete')}>{busy === 'delete' && <Loader2 size={14} className="spin"/>}{MEMO_TEXTS.remove}</button>}
      </div>
    </div>}
  </div>;
}

/**
 * The template buttons above the isometric's instructions (Edit isometric): Append (default) / Replace and one button per
 * template of the isometric's main project. Nothing is shown before a project is chosen or while the account reads none.
 */
export function MemoTemplateToolbar({ projectId, value, onChange }: { projectId: string; value: unknown; onChange: (value: string) => void }) {
  const [templates, setTemplates] = useState<MemoTemplate[] | null>(null), [failed, setFailed] = useState(false), [mode, setMode] = useState<MemoInsertMode>('append');
  const name = useId();
  useEffect(() => {
    let live = true; setTemplates(null); setFailed(false);
    if (projectId) api<Listing>(`/memo-templates?projectId=${encodeURIComponent(projectId)}`).then(result => { if (live) setTemplates(result.templates); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [projectId]);
  if (!projectId || failed || templates && !templates.length) return null;
  return <div className="field full-width memo-template-toolbar" role="group" aria-label={MEMO_TEXTS.templates}>
    <small className="field-hint">{MEMO_TEXTS.help}</small>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <strong style={{ fontSize: 11 }}>{MEMO_TEXTS.templates}</strong>
      {(['append', 'replace'] as const).map(option => <label key={option} className="check-value" style={{ marginRight: 4 }}><input type="radio" name={name} checked={mode === option} onChange={() => setMode(option)}/>{option === 'append' ? MEMO_TEXTS.append : MEMO_TEXTS.replace}</label>)}
      {templates ? templates.map(template => <button type="button" className="btn small" key={template.id} onClick={() => onChange(insertMemoTemplate(value, template.content, mode))}>{template.label}</button>) : <Loader2 size={14} className="spin" aria-label="Loading templates"/>}
    </div>
  </div>;
}
