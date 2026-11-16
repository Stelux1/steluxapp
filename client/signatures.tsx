import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, ImageUp, Loader2, PenLine, Save, Undo2 } from 'lucide-react';
import { SIGNATURE_KINDS, SIGNATURE_MAX_BYTES, SIGNATURE_TYPES } from '../shared/signatures.ts';
import type { Row } from '../shared/types.ts';
import { api, apiBlob, post, ApiError } from './api.ts';
import { activeRows, useWorkspace } from './context.tsx';

type Kind = typeof SIGNATURE_KINDS[number];
type Point = { x: number; y: number };
const INK = '#061b42';

/** The newest image of a signature record; earlier images stay as attachments (history). */
const currentFile = (rows: Record<string, Row[]>, record?: Row) => record ? (rows.attachments || []).filter(row => !row._archived && row.entityType === 'signatures' && row.entityId === record.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt))[0] : undefined;

/** Signatures page (pilots profile): each user keeps a full and a short signature; administrators may view others'. */
export function SignaturesPage() {
  const { user, rows, canRecord } = useWorkspace();
  const administrator = canRecord('users');
  const [ownerId, setOwnerId] = useState(user.id);
  const people = administrator ? activeRows(rows, 'users') : [];
  const own = ownerId === user.id;
  const owner = own ? user.name : String(people.find(person => person.id === ownerId)?.name || 'Selected user');
  return <div className="page signatures-page">
    <div className="page-heading"><div><div className="eyebrow">SYSTEM · SIGNATURES</div><h1>{own ? 'My signatures' : `Signatures of ${owner}`}</h1><p>{own ? 'Your full and short signature for released documents. Draw with a mouse, pen or finger, or upload a PNG or JPEG image.' : 'Administrators can view another user’s signatures. Only that user can change them.'}</p></div></div>
    {administrator && people.length > 1 && <div className="field signature-owner"><label htmlFor="signature-owner">Show signatures of</label><select id="signature-owner" value={ownerId} onChange={event => setOwnerId(event.target.value)}>{people.map(person => <option key={person.id} value={person.id}>{String(person.name)}{person.id === user.id ? ' (you)' : ''}</option>)}</select></div>}
    <div className="signature-cards">{SIGNATURE_KINDS.map(kind => <SignatureCard key={kind.kind + ownerId} kind={kind} ownerId={ownerId} ownerName={owner} editable={own}/>)}</div>
  </div>;
}

function SignatureCard({ kind, ownerId, ownerName, editable }: { kind: Kind; ownerId: string; ownerName: string; editable: boolean }) {
  const { rows, refresh, notify, user } = useWorkspace(); const id = useId();
  const record = (rows.signatures || []).find(row => !row._archived && row.userId === ownerId && row.kind === kind.kind);
  const file = currentFile(rows, record);
  const [preview, setPreview] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [mode, setMode] = useState<'pen' | 'upload'>('pen');
  const [nameUnder, setNameUnder] = useState(record?.nameUnder === true);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [upload, setUpload] = useState<File | null>(null), [uploadPreview, setUploadPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    let url = '', cancelled = false; setLoading(true); setError('');
    apiBlob(`/files/${file.id}`).then(blob => { if (cancelled) return; url = URL.createObjectURL(blob); setPreview(url); }).catch(e => { if (!cancelled) setError((e as Error).message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file?.id]);
  useEffect(() => { if (!upload) { setUploadPreview(''); return; } const url = URL.createObjectURL(upload); setUploadPreview(url); return () => URL.revokeObjectURL(url); }, [upload]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d'); if (!context) return;
    context.clearRect(0, 0, kind.width, kind.height);
    context.strokeStyle = INK; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round';
    for (const stroke of strokes) { context.beginPath(); stroke.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); if (stroke.length === 1) context.lineTo(stroke[0].x + 0.1, stroke[0].y + 0.1); context.stroke(); }
  }, [strokes, kind.width, kind.height, mode]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>): Point => { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) * kind.width / box.width, y: (event.clientY - box.top) * kind.height / box.height }; };
  function start(event: ReactPointerEvent<HTMLCanvasElement>) { if (event.button !== 0 && event.pointerType === 'mouse') return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const first = point(event); setStrokes(old => [...old, [first]]); }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const next = point(event); setStrokes(old => old.length ? [...old.slice(0, -1), [...old[old.length - 1], next]] : old); }
  function end() { drawing.current = false; }

  const image = mode === 'pen' ? strokes.length > 0 : Boolean(upload);
  const flagChanged = Boolean(record) && nameUnder !== (record?.nameUnder === true);
  function chooseFile(next: File | null) {
    setError('');
    if (next && !SIGNATURE_TYPES[next.type]) { setUpload(null); setError('Choose a PNG or JPEG image.'); return; }
    if (next && next.size > SIGNATURE_MAX_BYTES) { setUpload(null); setError('A signature image can be at most 1 MB.'); return; }
    setUpload(next);
  }
  async function save() {
    setBusy(true); setError('');
    try {
      let target = record;
      if (!target) target = (await post<{ record: Row }>('/records/signatures', { name: user.name, userId: user.id, kind: kind.kind, nameUnder })).record;
      else if (flagChanged) target = (await api<{ record: Row }>(`/records/signatures/${target.id}`, { method: 'PUT', body: JSON.stringify({ nameUnder, _version: target._version }) })).record;
      if (image) {
        const blob = mode === 'pen' ? await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(result => result ? resolve(result) : reject(new Error('The drawing could not be saved.')), 'image/png')) : upload!;
        const name = mode === 'pen' ? `${kind.kind.toLowerCase().replace(/\s+/g, '-')}.png` : upload!.name;
        const body = new FormData(); body.set('entityType', 'signatures'); body.set('entityId', target!.id); body.set('file', blob, name);
        await api('/files', { method: 'POST', body });
      }
      await refresh(); setStrokes([]); setUpload(null);
      notify(`${kind.kind} ${image ? 'saved' : 'updated'}.`);
    } catch (e) { setError(e instanceof ApiError ? e.message : (e as Error).message); } finally { setBusy(false); }
  }

  const aspect = { aspectRatio: `${kind.width} / ${kind.height}`, maxWidth: kind.width } as React.CSSProperties;
  return <section className="panel signature-card" aria-labelledby={`${id}-title`}>
    <div className="panel-heading"><div><h2 id={`${id}-title`}>{kind.kind}</h2><small>{kind.width} × {kind.height} px</small></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <div className="signature-current">
      <span className="signature-label">Current signature</span>
      <figure className="signature-frame" style={aspect}>
        {loading ? <p role="status"><Loader2 size={16} className="spin"/>Loading signature…</p> : preview ? <img src={preview} alt={`${kind.kind} of ${ownerName}`}/> : <p className="muted">{`No ${kind.kind.toLowerCase()} saved yet.`}</p>}
      </figure>
      {preview && record?.nameUnder === true && <p className="signature-name">{ownerName}</p>}
    </div>
    {!editable ? null : <div className="signature-editor">
      <div className="table-tabs" role="group" aria-label={`How to set the ${kind.kind.toLowerCase()}`}>
        <button type="button" className={mode === 'pen' ? 'selected' : ''} aria-pressed={mode === 'pen'} onClick={() => setMode('pen')}><PenLine size={14}/>Sign with pen</button>
        <button type="button" className={mode === 'upload' ? 'selected' : ''} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}><ImageUp size={14}/>Upload image</button>
      </div>
      {mode === 'pen' ? <>
        <canvas ref={canvas} className="signature-canvas" style={aspect} width={kind.width} height={kind.height} role="img" aria-label={`${kind.kind} drawing area. Draw with a mouse, pen or finger. Keyboard users can choose Upload image.`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/>
        <div className="heading-actions signature-tools"><button type="button" className="btn" onClick={() => setStrokes([])} disabled={!strokes.length || busy}><Eraser size={14}/>Clear</button><button type="button" className="btn" onClick={() => setStrokes(old => old.slice(0, -1))} disabled={!strokes.length || busy}><Undo2 size={14}/>Undo</button></div>
      </> : <div className="field">
        <label htmlFor={`${id}-file`}>Signature image (PNG or JPEG, up to 1 MB)</label>
        <input id={`${id}-file`} type="file" accept="image/png,image/jpeg" onChange={event => chooseFile(event.target.files?.[0] || null)}/>
        {uploadPreview && <figure className="signature-frame" style={aspect}><img src={uploadPreview} alt={`Selected image for the ${kind.kind.toLowerCase()}`}/></figure>}
      </div>}
      <div className="field checkbox-field"><label htmlFor={`${id}-name`}><input id={`${id}-name`} type="checkbox" checked={nameUnder} onChange={event => setNameUnder(event.target.checked)}/><span>Add name under the signature</span></label></div>
      <button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !(image || flagChanged)}>{busy ? <Loader2 size={15} className="spin"/> : <Save size={15}/>}Save {kind.kind.toLowerCase()}</button>
    </div>}
  </section>;
}

/**
 * A drawing area for one signature, used where a document is signed on screen (punch sign-off). Same canvas and
 * stroke handling as a user's own signature above; the parent receives a reader for the PNG once something is drawn
 * (null while the area is empty). Keyboard users sign with an uploaded file instead.
 */
export function SignaturePad({ width = 800, height = 200, label, disabled = false, onChange }: { width?: number; height?: number; label: string; disabled?: boolean; onChange: (read: (() => Promise<Blob>) | null) => void }) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), notify = useRef(onChange); notify.current = onChange;
  useEffect(() => {
    const context = canvas.current?.getContext('2d'); if (!context) return;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = INK; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round';
    for (const stroke of strokes) { context.beginPath(); stroke.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); if (stroke.length === 1) context.lineTo(stroke[0].x + 0.1, stroke[0].y + 0.1); context.stroke(); }
    notify.current(strokes.length ? () => new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(result => result ? resolve(result) : reject(new Error('The drawing could not be saved.')), 'image/png')) : null);
  }, [strokes, width, height]);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>): Point => { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) * width / box.width, y: (event.clientY - box.top) * height / box.height }; };
  function start(event: ReactPointerEvent<HTMLCanvasElement>) { if (disabled || (event.button !== 0 && event.pointerType === 'mouse')) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const first = point(event); setStrokes(old => [...old, [first]]); }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const next = point(event); setStrokes(old => old.length ? [...old.slice(0, -1), [...old[old.length - 1], next]] : old); }
  const aspect = { aspectRatio: `${width} / ${height}`, maxWidth: width } as React.CSSProperties;
  return <div className="signature-pad">
    <canvas ref={canvas} className="signature-canvas" style={aspect} width={width} height={height} role="img" aria-label={`${label}. Draw with a mouse, pen or finger. Keyboard users can choose the signed PDF instead.`} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }}/>
    <div className="heading-actions signature-tools"><button type="button" className="btn" onClick={() => setStrokes([])} disabled={!strokes.length || disabled}><Eraser size={14}/>Clear</button><button type="button" className="btn" onClick={() => setStrokes(old => old.slice(0, -1))} disabled={!strokes.length || disabled}><Undo2 size={14}/>Undo</button></div>
  </div>;
}
