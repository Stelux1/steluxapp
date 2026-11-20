import { useMemo, useState } from 'react';
import { Archive, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { FITTING_TYPES, diameterKey, fittingMatches, fittingSizes, fittingType, formatLength } from '../shared/cut-list.ts';
import { useWorkspace } from './context.tsx';
import { EmptyState, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';

const PAGE = 100;
const byCode = (a: Row, b: Row) => String(a.code ?? '').localeCompare(String(b.code ?? ''), 'en', { numeric: true, sensitivity: 'base' });

/**
 * MTO Pilot → Cut List → Cut list standards: the one database of standardized element dimensions the cut lists calculate with
 * (resource `cut_fittings`, the client's sheet Codes). View, search and filter by element type and diameter; add, edit and
 * archive elements with their code, matching standard and take-off. A change applies to new cut lists and new calculations
 * only: a completed cut list, and a revision that keeps the previous standards, keep the values they were calculated with
 * (shared/cut-list-revisions.ts).
 */
export function CutListStandardsPage() {
  const { rows, canRecord } = useWorkspace();
  const [query, setQuery] = useState(''), [type, setType] = useState(''), [diameter, setDiameter] = useState(''), [archived, setArchived] = useState(false), [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null), [archiving, setArchiving] = useState<Row | null>(null);
  const all = rows.cut_fittings || [];
  const diameters = useMemo(() => {
    const sizes = new Map<string, string>();
    for (const row of all) for (const size of String(row.diameter ?? '').split(/\s*(?:[xX]|\$)\s*/)) { const key = diameterKey(size); if (key && !/^all/.test(key) && !sizes.has(key)) sizes.set(key, size.trim().replace(/''/g, '"')); }
    return [...sizes.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([key, label]) => ({ key, label }));
  }, [all]);
  const filtered = useMemo(() => all.filter(row => Boolean(row._archived) === archived && (!type || fittingType(row) === type) && (!diameter || fittingSizes(row.diameter).includes(diameter)) && fittingMatches(row, query)).sort(byCode), [all, archived, type, diameter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)), current = Math.min(page, pages - 1), shown = filtered.slice(current * PAGE, (current + 1) * PAGE);
  const filter = (apply: () => void) => { apply(); setPage(0); };
  if (!canRecord('cut_fittings')) return <EmptyState title="Cut list standards restricted" description="Your permission profile does not include the cut list standards."/>;
  return <div className="page records-page cut-list-standards">
    <div className="page-heading"><div><div className="eyebrow">CUT LIST</div><h1>Cut list standards</h1>
      <p>The standardized elements the cut lists calculate with: code, matching standard, diameter and the take-off each element takes off the pipe piece. Changes apply to new cut lists and new calculations only; completed cut lists keep the standards they were calculated with.</p></div>
      <div className="heading-actions">{canRecord('cut_fittings', 'insert') && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={17}/>Add element</button>}</div>
    </div>
    <div className="table-card">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Record visibility">{[false, true].map(value => <button key={String(value)} role="tab" aria-selected={archived === value} className={archived === value ? 'selected' : ''} onClick={() => filter(() => setArchived(value))}>{value ? 'Archived' : 'Active elements'}{archived === value && <span>{filtered.length}</span>}</button>)}</div></div>
      <div className="table-toolbar cut-list-standards-toolbar">
        <SearchInput value={query} onChange={value => filter(() => setQuery(value))} placeholder="Search code, name, standard or diameter…"/>
        <label><span className="sr-only">Element type</span><select aria-label="Element type" value={type} onChange={event => filter(() => setType(event.target.value))}><option value="">All element types</option>{FITTING_TYPES.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">Diameter</span><select aria-label="Diameter" value={diameter} onChange={event => filter(() => setDiameter(event.target.value))}><option value="">All diameters</option>{diameters.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      </div>
      <TableScroll><table className="data-table">
        <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Description / standard</th><th scope="col">Diameter</th><th scope="col" className="numeric">Take-off mm</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{shown.map(row => <tr key={row.id}>
          <td><strong>{String(row.code ?? '')}</strong></td><td>{String(row.name ?? '')}<small className="muted cut-list-standards-type">{fittingType(row)}</small></td><td>{String(row.description ?? '')}</td><td>{String(row.diameter ?? '')}</td><td className="numeric tabular">{formatLength(Number(row.takeoff))}</td>
          <td className="actions-cell">{!row._archived && canRecord('cut_fittings', 'edit', row) && <button className="icon-btn" aria-label={`Edit ${String(row.code)}`} onClick={() => setEditing(row)}><Pencil size={15}/></button>}{canRecord('cut_fittings', 'delete', row) && <button className="icon-btn" aria-label={`${row._archived ? 'Restore' : 'Archive'} ${String(row.code)}`} onClick={() => setArchiving(row)}>{row._archived ? <RotateCcw size={15}/> : <Archive size={15}/>}</button>}</td>
        </tr>)}</tbody>
      </table></TableScroll>
      {!filtered.length && <EmptyState title={query || type || diameter ? 'No matching elements' : archived ? 'Nothing archived' : 'No elements yet'} description={query || type || diameter ? 'Try another search or clear the filters.' : 'Add the first standard element of the cut lists.'}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{filtered.length ? `${current * PAGE + 1}–${Math.min((current + 1) * PAGE, filtered.length)}` : '0'} of {filtered.length} elements</span><div><button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button><button className="icon-btn" disabled={current + 1 >= pages} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button></div></div>
    </div>
    {editing && <RecordEditor resourceKey="cut_fittings" record={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="cut_fittings" record={archiving} onClose={() => setArchiving(null)}/>}
  </div>;
}
