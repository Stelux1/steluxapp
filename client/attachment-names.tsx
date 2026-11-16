import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, Lock, X } from 'lucide-react';
import { ATTACHMENT_SORT_LABELS, ATTACHMENT_SORT_MODES, STANDARD_DOCUMENT_MESSAGE, attachmentNamesInOrder, isStandardAttachmentName, moveEntry, type AttachmentSortMode } from '../shared/weld-catalogs.ts';
import { post } from './api.ts';
import { Dropdown } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { TablePage } from './records.tsx';

/**
 * General data → Attachment names (hosted). "Sorting: OFF" is the list as for every catalog; "Sorting: ISO book" and "Sorting:
 * Hydrotest" show only the documents of that kind, which are put in order by dragging (or with the arrow buttons) and saved at
 * once. The two orders are independent.
 */
export function AttachmentNamesPage() {
  const { canRun } = useWorkspace(); const [mode, setMode] = useState<AttachmentSortMode | null>(null);
  const menu = canRun('reorder-attachment-names') ? <Dropdown label="Sorting" trigger={<span className="btn">Sorting: {mode ? ATTACHMENT_SORT_LABELS[mode] : 'OFF'}<ChevronDown size={14}/></span>}>
    <button type="button" aria-current={!mode} onClick={() => setMode(null)}>OFF</button>
    {ATTACHMENT_SORT_MODES.map(item => <button type="button" key={item} aria-current={mode === item} onClick={() => setMode(item)}>{ATTACHMENT_SORT_LABELS[item]}</button>)}
  </Dropdown> : undefined;
  return mode ? <SortableNames key={mode} mode={mode} menu={menu}/> : <TablePage resourceKey="attachment_names" headingExtra={menu}/>;
}

function SortableNames({ mode, menu }: { mode: AttachmentSortMode; menu: React.ReactNode }) {
  const { rows, refresh, notify } = useWorkspace();
  const saved = attachmentNamesInOrder(rows.attachment_names || [], mode);
  const [order, setOrder] = useState(() => saved.map(row => row.id)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragging, setDragging] = useState('');
  const known = useRef(saved.map(row => row.id).join());
  // Pick up changes made elsewhere (a name added or archived) while no save is under way.
  useEffect(() => { const next = saved.map(row => row.id); if (next.join() !== known.current && !busy) { known.current = next.join(); setOrder(next); } }, [saved, busy]);
  const byId = new Map(saved.map(row => [row.id, row]));
  const items = order.filter(id => byId.has(id));
  async function save(next: string[]) {
    const before = order; setOrder(next); setBusy(true); setError('');
    try { await post('/actions/reorder-attachment-names', { mode, order: next }); known.current = next.join(); await refresh(); notify('Order saved'); }
    catch (failure) { setOrder(before); setError((failure as Error).message || 'Something went wrong.'); } finally { setBusy(false); }
  }
  const move = (from: number, to: number) => { const next = moveEntry(items, from, to); if (next !== items) void save(next); };
  return <div className="page records-page attachment-sort-page">
    <div className="page-heading"><div><div className="eyebrow">GENERAL DATA</div><h1>Attachment names</h1><p>Drag a document, or use the arrow buttons, to set its place in the {ATTACHMENT_SORT_LABELS[mode]} order. The order is saved at once.</p></div><div className="heading-actions">{menu}</div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <section className="table-card"><ol className="sort-list" aria-label={`Attachment names in ${ATTACHMENT_SORT_LABELS[mode]} order`} aria-busy={busy}>
      {items.map((id, index) => { const row = byId.get(id)!; return <li key={id} className={`sort-row${dragging === id ? ' dragging' : ''}`} draggable={!busy}
        onDragStart={event => { setDragging(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }} onDragEnd={() => setDragging('')}
        onDragOver={event => { if (dragging) event.preventDefault(); }}
        onDrop={event => { event.preventDefault(); const from = items.indexOf(dragging); setDragging(''); if (from >= 0) move(from, index); }}>
        <span className="sort-handle" title="Drag to reorder" aria-hidden="true"><GripVertical size={16}/></span>
        <span className="sort-name">{String(row.name)}{isStandardAttachmentName(row) && <span className="sort-lock" title={STANDARD_DOCUMENT_MESSAGE}><Lock size={13}/><span className="sr-only">{STANDARD_DOCUMENT_MESSAGE}</span></span>}</span>
        <span className="sort-flags"><span>{row.position === 'After Isometric' ? 'After Isometric' : 'Before Isometric'}</span><span title="ISO Book">{row.isoBook ? <Check size={14} aria-label="ISO Book"/> : <X size={14} aria-label="Not in ISO Book"/>}</span><span title="Hydrotest">{row.hydrotest ? <Check size={14} aria-label="Hydrotest"/> : <X size={14} aria-label="Not in Hydrotest"/>}</span></span>
        <span className="sort-buttons"><button type="button" className="icon-btn" aria-label={`Move ${String(row.name)} up`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={15}/></button><button type="button" className="icon-btn" aria-label={`Move ${String(row.name)} down`} disabled={busy || index === items.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={15}/></button></span>
      </li>; })}
      {!items.length && <li className="sort-empty" role="status">No data available in table</li>}
    </ol></section>
  </div>;
}
