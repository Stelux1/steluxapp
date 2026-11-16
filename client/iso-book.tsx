import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Download, Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { BOOK_GROUPING_LABELS, BOOK_GROUPINGS, type BookGrouping, type BookPartsResponse } from '../shared/iso-book.ts';
import { api, ApiError, currentPilot } from './api.ts';
import { Modal } from './components.tsx';

/** The merged book as a blob: a POST (the choice is a body, not a URL), with the pilot of the current page. */
async function bookBlob(body: unknown): Promise<{ blob: Blob; fileName: string; pages: number }> {
  const pilot = currentPilot();
  const response = await fetch('/api/iso-book', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) { const failure = await response.json().catch(() => ({})) as { error?: string }; throw new ApiError(failure.error || 'The ISO Book could not be created. Try again.', response.status); }
  const disposition = response.headers.get('content-disposition') || '';
  return { blob: await response.blob(), fileName: /filename="([^"]+)"/.exec(disposition)?.[1] || 'ISO-Book.pdf', pages: Number(response.headers.get('x-iso-book-pages')) || 0 };
}
function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * ISO Book dialog: the parts of the book as checkboxes in the reference order. `choose` lets the user pick the
 * isometrics inside the dialog ("Generate multiple books"); otherwise `isos` are the ones named by the caller.
 */
export function IsoBookDialog({ isos, choose = false, onClose }: { isos: Row[]; choose?: boolean; onClose: () => void }) {
  const id = useId();
  const [picked, setPicked] = useState<string[]>(choose ? [] : isos.map(iso => iso.id));
  const [listing, setListing] = useState<BookPartsResponse | null>(null), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState(''), [reload, setReload] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set()), [grouping, setGrouping] = useState<BookGrouping>('by-isometric');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const first = useRef(true);
  const key = picked.join(',');
  useEffect(() => {
    if (!picked.length) { setListing(null); setLoadError(''); return; }
    let live = true; setLoading(true); setLoadError('');
    api<BookPartsResponse>(`/iso-book/parts?isoIds=${encodeURIComponent(key)}`).then(result => {
      if (!live) return;
      setListing(result);
      // The first load ticks everything that is available; later loads keep the user's choice where it still applies.
      setChecked(old => { const available = new Set(result.parts.filter(part => part.available).map(part => part.key)); return first.current ? available : new Set([...old].filter(part => available.has(part))); });
      first.current = false;
    }).catch(failure => { if (live) { setListing(null); setLoadError(failure instanceof ApiError ? failure.message : 'The parts of the book could not be loaded.'); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);
  const available = useMemo(() => (listing?.parts || []).filter(part => part.available), [listing]);
  const ordered = useMemo(() => (listing?.parts || []).filter(part => checked.has(part.key)).map(part => part.key), [listing, checked]);
  const title = picked.length === 1 ? String(isos.find(iso => iso.id === picked[0])?.isoNo ?? '') : `${picked.length} isometrics`;
  const toggle = (partKey: string, on: boolean) => { setChecked(old => { const next = new Set(old); if (on) next.add(partKey); else next.delete(partKey); return next; }); setDone(''); };
  async function generate(event: FormEvent) {
    event.preventDefault(); if (!ordered.length || !picked.length) return;
    setBusy(true); setError(''); setDone('');
    try {
      const result = await bookBlob({ isoIds: picked, parts: ordered, grouping });
      save(result.blob, result.fileName);
      setDone(`The ISO Book was downloaded (${result.pages} ${result.pages === 1 ? 'page' : 'pages'}). Files that could not be placed in it are listed on its last page.`);
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'The ISO Book could not be created. Try again.'); } finally { setBusy(false); }
  }
  return <Modal title="ISO Book" subtitle={picked.length ? title : 'Choose isometrics'} onClose={onClose} wide>
    <form onSubmit={event => void generate(event)} aria-busy={busy || loading} className="iso-book-form">
      <div className="modal-body">
        {error && <div className="alert error" role="alert">{error}</div>}
        {done && <div className="alert success" role="status"><Download size={15} aria-hidden="true"/> {done}</div>}
        {choose && <fieldset className="iso-book-isos"><legend>Isometrics</legend>
          <div className="iso-book-bulk"><button type="button" className="text-link" onClick={() => setPicked(isos.map(iso => iso.id))}>Check all</button><button type="button" className="text-link" onClick={() => setPicked([])}>Clear</button><span role="status">{picked.length} of {isos.length} checked</span></div>
          {isos.length ? <ul>{isos.map(iso => <li key={iso.id}><label><input type="checkbox" checked={picked.includes(iso.id)} onChange={event => { setPicked(old => event.target.checked ? [...old, iso.id] : old.filter(item => item !== iso.id)); setDone(''); }}/><span>{String(iso.isoNo)}</span></label></li>)}</ul> : <p className="muted">This project has no isometrics yet.</p>}
        </fieldset>}
        {!picked.length ? <p className="muted" role="status">Check at least one isometric to see the parts of the book.</p>
          : loading && !listing ? <p role="status"><Loader2 size={15} className="spin" aria-hidden="true"/> Loading the parts…</p>
          : loadError ? <div className="alert error" role="alert">{loadError} <button type="button" className="text-link" onClick={() => setReload(count => count + 1)}>Try again</button></div>
          : listing && <fieldset className="iso-book-parts" disabled={busy}><legend>Parts of the book</legend>
            <div className="iso-book-bulk"><button type="button" className="text-link" onClick={() => setChecked(new Set(available.map(part => part.key)))}>Check all available</button><button type="button" className="text-link" onClick={() => setChecked(new Set())}>Clear</button><span role="status">{ordered.length} of {available.length} available parts checked</span></div>
            <ul>{listing.parts.map(part => { const inputId = `${id}-${part.key}`; return <li key={part.key} className={part.available ? '' : 'iso-book-off'}>
              <label htmlFor={inputId}><input id={inputId} type="checkbox" checked={checked.has(part.key)} disabled={!part.available} aria-describedby={part.reason ? `${inputId}-why` : undefined} onChange={event => toggle(part.key, event.target.checked)}/><span>{part.label}{part.position && <em> · {part.position === 'Before Isometric' ? 'before the isometric' : 'after the isometric'}</em>}</span></label>
              {part.reason && <small id={`${inputId}-why`}>{part.reason}</small>}
            </li>; })}</ul>
          </fieldset>}
        {picked.length > 1 && listing && <fieldset className="iso-book-grouping" disabled={busy}><legend>Several isometrics</legend>
          {BOOK_GROUPINGS.map(value => <label key={value}><input type="radio" name={`${id}-grouping`} value={value} checked={grouping === value} onChange={() => setGrouping(value)}/><span>{BOOK_GROUPING_LABELS[value]}</span></label>)}
        </fieldset>}
        {listing && <small className="iso-book-limits">A book may hold at most {listing.limits.pages} pages and {Math.round(listing.limits.inputBytes / 1024 / 1024)} MB of uploaded files. Uploaded PDFs and PNG / JPEG images are included; other file types are listed on the last page.</small>}
      </div>
      <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button><button type="submit" className="btn primary" disabled={busy || loading || !ordered.length || !picked.length}>{busy ? <><Loader2 size={15} className="spin"/>Creating the book…</> : 'Create ISO Book'}</button></div>
    </form>
  </Modal>;
}

/** "ISO Book" button of the isometric page in MTO Pilot (Weld Pilot has the entry in its Reports menu). */
export function IsoBookButton({ iso }: { iso: Row }) {
  const [open, setOpen] = useState(false);
  return <><button className="btn" onClick={() => setOpen(true)}><BookOpen size={15}/>ISO Book</button>{open && <IsoBookDialog isos={[iso]} onClose={() => setOpen(false)}/>}</>;
}
/** Selection bar of the isometrics list: one book for every checked isometric. */
export function IsoBookSelectionButton({ isos }: { isos: Row[] }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}><BookOpen size={14}/>ISO Book for checked isometrics</button>{open && <IsoBookDialog isos={isos} onClose={() => setOpen(false)}/>}</>;
}
/** "Generate multiple books" of a project: the isometrics are checked inside the dialog. */
export function IsoBookProjectButton({ isos }: { isos: Row[] }) {
  const [open, setOpen] = useState(false);
  return <><button className="btn" onClick={() => setOpen(true)}><BookOpen size={15}/>Generate multiple books</button>{open && <IsoBookDialog isos={isos} choose onClose={() => setOpen(false)}/>}</>;
}
