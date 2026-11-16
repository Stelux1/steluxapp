import { Fragment, useEffect, useId, useState, type FormEvent } from 'react';
import { ImageUp, Loader2, Save } from 'lucide-react';
import { LOGO_PX, logoSizing } from '../shared/pdf-company.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { SIGNATURE_MAX_BYTES, SIGNATURE_TYPES } from '../shared/signatures.ts';
import type { Row } from '../shared/types.ts';
import { api, apiBlob, post, ApiError } from './api.ts';
import { useWorkspace } from './context.tsx';

/** The text fields of the form in the reference order (Name to Fax); the Logo file follows Fax, then the three pixel values. */
const TEXT_KEYS = ['name', 'address', 'zip', 'residence', 'mailbox', 'mnZip', 'mnResidence', 'phone', 'fax'];
/** The preview is drawn at this fraction of the real pixel values. */
const PREVIEW_SCALE = 0.4;
const PIXEL_KEYS = ['logoMaxHeight', 'logoPaddingTop', 'logoPaddingBottom'] as const;
const pixelRange = (key: typeof PIXEL_KEYS[number]) => key === 'logoMaxHeight' ? LOGO_PX.maxHeight : LOGO_PX.padding;

/** System · Company data (administrators): the contractor printed on documents, with its logo. One record per workspace. */
export function CompanyDataPage() {
  const { rows, refresh, notify, canRecord } = useWorkspace(); const id = useId();
  const record = (rows.company_data || []).find(row => !row._archived);
  const logo = record ? (rows.attachments || []).filter(row => !row._archived && row.entityType === 'company_data' && row.entityId === record.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt))[0] : undefined;
  const [form, setForm] = useState<Record<string, string>>({}), [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => { const sizing = logoSizing(record); setForm({ ...Object.fromEntries(TEXT_KEYS.map(key => [key, String(record?.[key] ?? '')])), logoMaxHeight: String(sizing.maxHeight), logoPaddingTop: String(sizing.paddingTop), logoPaddingBottom: String(sizing.paddingBottom) }); }, [record?.id, record?._version]);
  useEffect(() => {
    if (file) { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }
    if (!logo) { setPreview(''); return; }
    let url = '', cancelled = false;
    apiBlob(`/files/${logo.id}`).then(blob => { if (!cancelled) { url = URL.createObjectURL(blob); setPreview(url); } }).catch(() => { if (!cancelled) setPreview(''); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file, logo?.id]);
  const writable = record ? canRecord('company_data', 'edit', record) : canRecord('company_data', 'insert');
  const labels = Object.fromEntries(RESOURCE_MAP.company_data.fields.map(field => [field.name, field.label]));
  const size = logoSizing({ logoMaxHeight: form.logoMaxHeight, logoPaddingTop: form.logoPaddingTop, logoPaddingBottom: form.logoPaddingBottom });

  function choose(next: File | null) {
    setError('');
    if (next && !SIGNATURE_TYPES[next.type]) { setFile(null); setError('Choose a PNG or JPEG image.'); return; }
    if (next && next.size > SIGNATURE_MAX_BYTES) { setFile(null); setError('A logo image can be at most 1 MB.'); return; }
    setFile(next);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      if (!form.name.trim()) throw new ApiError('Enter the company name.', 422, { name: 'Enter the company name.' });
      const numbers: Record<string, number> = {};
      for (const key of PIXEL_KEYS) { const range = pixelRange(key), value = Number(form[key]); if (!Number.isFinite(value) || value < range.min || value > range.max) throw new ApiError(`${labels[key]} must be from ${range.min} to ${range.max}.`, 422, { [key]: `Use ${range.min} to ${range.max}.` }); numbers[key] = value; }
      const data = { ...Object.fromEntries(TEXT_KEYS.map(key => [key, form[key] ?? ''])), ...numbers };
      const saved = record ? (await api<{ record: Row }>(`/records/company_data/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...data, _version: record._version }) })).record : (await post<{ record: Row }>('/records/company_data', data)).record;
      if (file) { const body = new FormData(); body.set('entityType', 'company_data'); body.set('entityId', saved.id); body.set('documentType', 'Company logo'); body.set('file', file, file.name); await api('/files', { method: 'POST', body }); }
      await refresh(); setFile(null); notify('Company data saved.');
    } catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.fields) setFields(e.fields); } finally { setBusy(false); }
  }
  return <div className="page company-data-page">
    <div className="page-heading"><div><div className="eyebrow">SYSTEM · COMPANY DATA</div><h1>Company data</h1><p>The name, address and logo printed on documents such as the LISL report. Documents leave the company block out while nothing is saved here.</p></div></div>
    <form className="panel" onSubmit={event => void save(event)} aria-busy={busy}>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="form-grid">{TEXT_KEYS.map(key => <Fragment key={key}><div className="field"><label htmlFor={`${id}-${key}`}>{labels[key]}{key === 'name' && <span className="required"> *</span>}</label><input id={`${id}-${key}`} value={form[key] ?? ''} required={key === 'name'} disabled={!writable || busy} aria-invalid={Boolean(fields[key])} onChange={event => setForm({ ...form, [key]: event.target.value })}/>{fields[key] && <small className="field-error">{fields[key]}</small>}</div>
        {key === 'fax' && <div className="field"><label htmlFor={`${id}-logo`}>Logo</label>{writable && <input id={`${id}-logo`} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => choose(event.target.files?.[0] || null)}/>}<small className="field-hint">PNG or JPEG, up to 1 MB.</small></div>}</Fragment>)}
        {PIXEL_KEYS.map(key => <div className="field" key={key}><label htmlFor={`${id}-${key}`}>{labels[key]}</label><input id={`${id}-${key}`} type="number" min={pixelRange(key).min} max={pixelRange(key).max} step="1" value={form[key] ?? ''} disabled={!writable || busy} aria-invalid={Boolean(fields[key])} onChange={event => setForm({ ...form, [key]: event.target.value })}/>{fields[key] && <small className="field-error">{fields[key]}</small>}</div>)}</div>
      <div className="field"><span id={`${id}-preview`} className="company-logo-preview-label">Launcher preview (home page)</span>
        <div className="company-logo-preview" role="img" aria-labelledby={`${id}-preview`}>
          {preview ? <img src={preview} alt="" style={{ maxHeight: Math.round(size.maxHeight * PREVIEW_SCALE), paddingTop: Math.round(size.paddingTop * PREVIEW_SCALE), paddingBottom: Math.round(size.paddingBottom * PREVIEW_SCALE) }}/> : <p className="muted">Upload a logo to preview the launcher home page.</p>}
          <strong>Select your application workspace</strong><span className="company-logo-preview-tiles"><i/><i/></span>
        </div></div>
      {writable && <button type="submit" className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : file ? <ImageUp size={15}/> : <Save size={15}/>}Save company data</button>}
    </form>
  </div>;
}
