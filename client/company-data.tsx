import { useEffect, useId, useState, type FormEvent } from 'react';
import { ImageUp, Loader2, Save } from 'lucide-react';
import { LOGO_HEIGHT_DEFAULT, LOGO_HEIGHT_MAX, LOGO_HEIGHT_MIN } from '../shared/pdf-company.ts';
import { SIGNATURE_MAX_BYTES, SIGNATURE_TYPES } from '../shared/signatures.ts';
import type { Row } from '../shared/types.ts';
import { api, apiBlob, post, ApiError } from './api.ts';
import { useWorkspace } from './context.tsx';

const TEXT_FIELDS = [['name', 'Company name'], ['address', 'Address line 1'], ['address2', 'Address line 2'], ['zip', 'Postal code'], ['residence', 'City'], ['phone', 'Phone']] as const;

/** System · Company data (administrators): the contractor printed on documents, with its logo. One record per workspace. */
export function CompanyDataPage() {
  const { rows, refresh, notify, canRecord } = useWorkspace(); const id = useId();
  const record = (rows.company_data || []).find(row => !row._archived);
  const logo = record ? (rows.attachments || []).filter(row => !row._archived && row.entityType === 'company_data' && row.entityId === record.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt))[0] : undefined;
  const [form, setForm] = useState<Record<string, string>>({}), [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => { setForm({ ...Object.fromEntries(TEXT_FIELDS.map(([key]) => [key, String(record?.[key] ?? '')])), logoHeight: String(record?.logoHeight ?? LOGO_HEIGHT_DEFAULT) }); }, [record?.id, record?._version]);
  useEffect(() => {
    if (file) { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }
    if (!logo) { setPreview(''); return; }
    let url = '', cancelled = false;
    apiBlob(`/files/${logo.id}`).then(blob => { if (!cancelled) { url = URL.createObjectURL(blob); setPreview(url); } }).catch(() => { if (!cancelled) setPreview(''); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file, logo?.id]);
  const writable = record ? canRecord('company_data', 'edit', record) : canRecord('company_data', 'insert');

  function choose(next: File | null) {
    setError('');
    if (next && !SIGNATURE_TYPES[next.type]) { setFile(null); setError('Choose a PNG or JPEG image.'); return; }
    if (next && next.size > SIGNATURE_MAX_BYTES) { setFile(null); setError('A logo image can be at most 1 MB.'); return; }
    setFile(next);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      const height = Number(form.logoHeight);
      if (!form.name.trim()) throw new ApiError('Enter the company name.', 422, { name: 'Enter the company name.' });
      if (!Number.isFinite(height) || height < LOGO_HEIGHT_MIN || height > LOGO_HEIGHT_MAX) throw new ApiError(`The logo height must be from ${LOGO_HEIGHT_MIN} to ${LOGO_HEIGHT_MAX} mm.`, 422, { logoHeight: `Use ${LOGO_HEIGHT_MIN} to ${LOGO_HEIGHT_MAX} mm.` });
      const data = { ...form, logoHeight: height };
      const saved = record ? (await api<{ record: Row }>(`/records/company_data/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...data, _version: record._version }) })).record : (await post<{ record: Row }>('/records/company_data', data)).record;
      if (file) { const body = new FormData(); body.set('entityType', 'company_data'); body.set('entityId', saved.id); body.set('documentType', 'Company logo'); body.set('file', file, file.name); await api('/files', { method: 'POST', body }); }
      await refresh(); setFile(null); notify('Company data saved.');
    } catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.fields) setFields(e.fields); } finally { setBusy(false); }
  }
  return <div className="page company-data-page">
    <div className="page-heading"><div><div className="eyebrow">SYSTEM · COMPANY DATA</div><h1>Company data</h1><p>The name, address and logo printed on documents such as the LISL report. Documents leave the company block out while nothing is saved here.</p></div></div>
    <form className="panel" onSubmit={event => void save(event)} aria-busy={busy}>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="form-grid">{TEXT_FIELDS.map(([key, label]) => <div className="field" key={key}><label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} value={form[key] ?? ''} required={key === 'name'} disabled={!writable || busy} aria-invalid={Boolean(fields[key])} onChange={event => setForm({ ...form, [key]: event.target.value })}/>{fields[key] && <small className="field-error">{fields[key]}</small>}</div>)}</div>
      <div className="field"><label htmlFor={`${id}-logo`}>Logo (PNG or JPEG, up to 1 MB)</label>
        {preview ? <figure className="signature-frame" style={{ maxWidth: 260, minHeight: 60 }}><img src={preview} alt="Company logo" style={{ maxHeight: 90, maxWidth: '100%' }}/></figure> : <p className="muted">No logo saved yet.</p>}
        {writable && <input id={`${id}-logo`} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => choose(event.target.files?.[0] || null)}/>}
      </div>
      <div className="field"><label htmlFor={`${id}-height`}>Logo maximum height (mm)</label><input id={`${id}-height`} type="number" min={LOGO_HEIGHT_MIN} max={LOGO_HEIGHT_MAX} step="1" value={form.logoHeight ?? ''} disabled={!writable || busy} aria-invalid={Boolean(fields.logoHeight)} onChange={event => setForm({ ...form, logoHeight: event.target.value })}/>{fields.logoHeight && <small className="field-error">{fields.logoHeight}</small>}</div>
      {writable && <button type="submit" className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : file ? <ImageUp size={15}/> : <Save size={15}/>}Save company data</button>}
    </form>
  </div>;
}
