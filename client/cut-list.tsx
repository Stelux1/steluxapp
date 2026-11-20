import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Download, Printer, Trash2, Wrench } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { CUT_LIST_DIAMETERS } from '../shared/cut-list-fittings-data.ts';
import { CUT_LIST_FITS, CUT_LIST_PRINT_COLUMNS, cutLength, fitField, fittingFitsDiameter, fittingMatches, formatLength, isCalculationLine, lineLengths, parseLength, printCells, sortLines } from '../shared/cut-list.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { api, apiUrl } from './api.ts';
import { EmptyState, TableScroll } from './components.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';
import { resourcePath } from './records.tsx';

/** What a line row edits, as typed (numbers are parsed when the line is saved). */
const TEXT_FIELDS = ['sheet', 'spoolId', 'dia', 'material', 'schedule'] as const;
const NUMBER_FIELDS = ['totalLength', 'bevel', 'extraLength'] as const;
const FIT_FIELDS = CUT_LIST_FITS.map(fitField);
type Draft = Record<string, string>;
const EDITED = [...TEXT_FIELDS, ...NUMBER_FIELDS, ...FIT_FIELDS];
const text = (value: unknown) => value === null || value === undefined ? '' : String(value);
const draftOf = (line: Row): Draft => Object.fromEntries(EDITED.map(name => [name, text(line[name])]));
/** A new line repeats SHT, DIA, material, SCH / WT and bevel of the line above it, as the Excel sheet is filled in. */
const newDraft = (previous?: Row): Draft => ({ ...Object.fromEntries(EDITED.map(name => [name, ''])), ...(previous ? Object.fromEntries(['sheet', 'dia', 'material', 'schedule', 'bevel'].map(name => [name, text(previous[name])])) : {}) });
const changed = (draft: Draft, line?: Row) => line ? EDITED.some(name => draft[name] !== text(line[name])) : Boolean(draft.totalLength.trim());
const payloadOf = (draft: Draft) => ({ ...Object.fromEntries([...TEXT_FIELDS, ...FIT_FIELDS].map(name => [name, draft[name].trim()])), ...Object.fromEntries(NUMBER_FIELDS.map(name => [name, parseLength(draft[name])])) });
const NEW = 'new';

/** The column headings (the Excel sheet Calculation, ISO NAME being the isometric itself). */
const HEADINGS = ['Line', 'SHT', 'SPOOL', 'DIA', 'MATERIAL', 'SCH / WT', 'TOTAL LENGTH', 'BEVEL', 'EXTRA LENGTH', 'FIT 1', 'FIT 2', 'FIT 3', 'FIT 4', 'Take-off 1', 'Take-off 2', 'Take-off 3', 'Take-off 4', 'PASTUK LENGTH'];

/** MTO Pilot → isometric → Cut list: the calculation table of the client's cut list Excel, with print and Excel export. */
export function CutListPanel({ iso }: { iso: Row }) {
  const { rows, user, canRecord, canReadReport, refresh } = useWorkspace();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}), [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(''), [deleting, setDeleting] = useState<Row | null>(null), [printing, setPrinting] = useState(false);
  const table = useRef<HTMLTableElement>(null);
  const lines = useMemo(() => sortLines(activeRows(rows, 'cut_list').filter(line => line.isoId === iso.id)), [rows, iso.id]);
  const fittingRows = useMemo(() => activeRows(rows, 'cut_fittings'), [rows]);
  const fittings = useMemo(() => new Map((rows.cut_fittings || []).map(row => [row.id, row])), [rows]);
  const spools = useMemo(() => activeRows(rows, 'spools').filter(spool => spool.isoId === iso.id).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true })), [rows, iso.id]);
  const project = rows.projects?.find(row => row.id === iso.projectId), site = rows.sites?.find(row => row.id === project?.siteId);
  const canAdd = canRecord('cut_list', 'insert');

  useEffect(() => {
    if (!printing) return;
    const done = () => { document.body.classList.remove('cut-list-printing'); setPrinting(false); };
    document.body.classList.add('cut-list-printing'); window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => window.print());
    return () => { cancelAnimationFrame(frame); window.removeEventListener('afterprint', done); document.body.classList.remove('cut-list-printing'); };
  }, [printing]);

  if (!canRecord('cut_list')) return <EmptyState title="Cut list restricted" description="Your permission profile does not include the cut list."/>;

  const draftFor = (id: string, line?: Row) => drafts[id] ?? (line ? draftOf(line) : newDraft(lines.at(-1)));
  const setField = (id: string, line: Row | undefined, name: string, value: string) => setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? (line ? draftOf(line) : newDraft(lines.at(-1)))), [name]: value } }));
  const revert = (id: string) => { setDrafts(({ [id]: _, ...rest }) => rest); setErrors(({ [id]: _, ...rest }) => rest); };
  const focusCell = (row: number, column: string) => requestAnimationFrame(() => table.current?.querySelector<HTMLElement>(`[data-cell="${row}-${column}"]`)?.focus());

  async function save(id: string, line: Row | undefined, next?: { row: number; column: string }) {
    const draft = draftFor(id, line);
    if (saving || !changed(draft, line)) { if (next) focusCell(next.row, next.column); return; }
    setSaving(id); setErrors(({ [id]: _, ...rest }) => rest);
    try {
      await api(`/records/cut_list${line ? `/${line.id}` : ''}`, { method: line ? 'PUT' : 'POST', body: JSON.stringify({ ...payloadOf(draft), ...(line ? { _version: line._version } : { isoId: iso.id }) }) });
      await refresh();
      setDrafts(({ [id]: _, ...rest }) => rest);
      if (next) focusCell(next.row, next.column);
    } catch (error) { setErrors(current => ({ ...current, [id]: (error as Error).message })); } finally { setSaving(''); }
  }

  const entries = lines.map(line => ({ id: line.id, line, editable: canRecord('cut_list', 'edit', line) }));
  const all = [...entries, ...(canAdd ? [{ id: NEW, line: undefined, editable: true }] : [])];
  const lengthOf = (draft: Draft, line?: Row) => {
    const takeoffs = FIT_FIELDS.map(name => draft[name] ? Number(fittings.get(draft[name])?.takeoff ?? 0) : 0);
    if (!draft.totalLength.trim()) return { takeoffs, length: line && !isCalculationLine(line) && !changed(draft, line) ? lineLengths(line, fittings).length : null };
    const numbers = Object.fromEntries(NUMBER_FIELDS.map(name => [name, parseLength(draft[name])]));
    if (NUMBER_FIELDS.some(name => typeof numbers[name] === 'string')) return { takeoffs, length: null };
    return { takeoffs, length: cutLength(numbers, takeoffs).length };
  };
  const total = lines.reduce((sum, line) => sum + lineLengths(line, fittings).length * (Number(line.quantity) || 1), 0);
  const spoolName = (id: unknown) => String(spools.find(spool => spool.id === id)?.name ?? rows.spools?.find(spool => spool.id === id)?.name ?? '');

  return <section className="panel cut-list-panel" aria-label="Cut list">
    <div className="panel-heading"><div><h2>Cut list</h2><p className="cut-list-formula">PASTUK LENGTH = total length + extra length − 2 × bevel − take-offs of FIT 1–4. Enter saves the line; Esc undoes its changes.</p></div>
      <div className="heading-actions">
        {canRecord('cut_fittings') && <Link className="btn" to={resourcePath('cut_fittings')}><Wrench size={15}/>Fittings</Link>}
        {canReadReport('cut-list', 'export') && <a className="btn" href={apiUrl(`/cut-list/export?isoId=${encodeURIComponent(iso.id)}`)}><Download size={15}/>Excel</a>}
        {canReadReport('cut-list', 'print') && <button type="button" className="btn" disabled={!lines.length} onClick={() => setPrinting(true)}><Printer size={15}/>Print / PDF</button>}
      </div>
    </div>
    <TableScroll><table ref={table} className="data-table cut-list-table">
      <thead><tr>{HEADINGS.map(heading => <th key={heading} scope="col" className={/LENGTH|BEVEL|Take-off/.test(heading) ? 'number-cell' : undefined}>{heading}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{all.map(({ id, line, editable }, index) => {
        const draft = draftFor(id, line), dirty = changed(draft, line), { takeoffs, length } = lengthOf(draft, line);
        const cell = (column: string) => ({ 'data-cell': `${index}-${column}`, disabled: !editable || saving === id, onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.defaultPrevented) return;
          if (event.key === 'Enter') { event.preventDefault(); void save(id, line, { row: id === NEW ? index + 1 : Math.min(index + 1, all.length - 1), column }); }
          if (event.key === 'Escape') { event.preventDefault(); revert(id); }
        } });
        const input = (name: string, label: string, options: { numeric?: boolean; list?: string } = {}) => <input {...cell(name)} aria-label={`${label}, line ${line ? text(line.name) : 'new'}`} value={draft[name]} inputMode={options.numeric ? 'decimal' : undefined} list={options.list} onChange={event => setField(id, line, name, event.target.value)}/>;
        const leave = (event: FocusEvent<HTMLTableRowElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && dirty) void save(id, line); };
        const legacy = line && !isCalculationLine(line) && !draft.totalLength.trim();
        return [<tr key={id} className={[dirty ? 'cut-line-dirty' : '', id === NEW ? 'cut-line-new' : '', errors[id] ? 'cut-line-invalid' : ''].join(' ')} onBlur={leave} aria-busy={saving === id}>
          <td className="cut-line-number">{line ? text(line.name) : <span className="muted">New</span>}</td>
          <td>{input('sheet', 'SHT')}</td>
          <td><select {...cell('spoolId')} aria-label={`Spool, line ${line ? text(line.name) : 'new'}`} value={draft.spoolId} onChange={event => setField(id, line, 'spoolId', event.target.value)}><option value="">—</option>{spools.map(spool => <option key={spool.id} value={spool.id}>{String(spool.name)}</option>)}{draft.spoolId && !spools.some(spool => spool.id === draft.spoolId) && <option value={draft.spoolId}>{spoolName(draft.spoolId) || 'Unavailable spool'}</option>}</select></td>
          <td>{input('dia', 'DIA', { list: 'cut-list-diameters' })}</td>
          <td>{input('material', 'Material')}</td>
          <td>{input('schedule', 'SCH / WT')}</td>
          {NUMBER_FIELDS.map(name => <td key={name} className="number-cell">{input(name, name === 'totalLength' ? 'Total length' : name === 'bevel' ? 'Bevel' : 'Extra length', { numeric: true })}</td>)}
          {FIT_FIELDS.map((name, slot) => <td key={name} className="fit-cell"><FittingSelect {...cell(name)} label={`Fit ${slot + 1}, line ${line ? text(line.name) : 'new'}`} value={draft[name]} fittings={fittingRows} byId={fittings} dia={draft.dia} onChange={value => setField(id, line, name, value)}/></td>)}
          {takeoffs.map((takeoff, slot) => <td key={slot} className="number-cell takeoff-cell">{draft[FIT_FIELDS[slot]] ? formatLength(takeoff) : '—'}</td>)}
          <td className={`number-cell cut-length${length !== null && length <= 0 ? ' negative' : ''}`}>{length === null ? '—' : formatLength(length)}{legacy && Number(line.quantity) > 1 && <small> × {String(line.quantity)}</small>}</td>
          <td className="actions-cell">{line && canRecord('cut_list', 'delete', line) && <button type="button" className="icon-btn" aria-label={`Delete cut list line ${text(line.name)}`} onClick={() => setDeleting(line)}><Trash2 size={15}/></button>}</td>
        </tr>, errors[id] && <tr key={`${id}-error`} className="cut-line-error"><td colSpan={HEADINGS.length + 1} role="alert">{errors[id]}</td></tr>];
      })}</tbody>
      {lines.length > 0 && <tfoot><tr><td colSpan={HEADINGS.length - 1}>{lines.length} {lines.length === 1 ? 'line' : 'lines'} · total cut length</td><td className="number-cell cut-length">{formatLength(total)}</td><td/></tr></tfoot>}
    </table></TableScroll>
    <datalist id="cut-list-diameters">{CUT_LIST_DIAMETERS.map(dia => <option key={dia} value={dia}/>)}</datalist>
    {!lines.length && !canAdd && <EmptyState title="No cut list lines" description="This isometric has no cut list yet."/>}
    {deleting && <ArchiveRecordDialog resourceKey="cut_list" record={deleting} onClose={() => setDeleting(null)}/>}
    {printing && createPortal(<CutListPrint iso={iso} project={String(site?.name ?? '')} projectNo={String(project?.internnumber ?? '')} createdBy={user.name} lines={lines.map(line => printCells({ ...line, material: line.material || '' }, String(iso.isoNo ?? ''), spoolName(line.spoolId), lineLengths(line, fittings).length))}/>, document.body)}
  </section>;
}

/** The printed cut list (the Excel sheet Print): Project = main project, Project no = subproject, Created by, Date; Heat No and QC empty for the shop. */
function CutListPrint({ iso, project, projectNo, createdBy, lines }: { iso: Row; project: string; projectNo: string; createdBy: string; lines: (string | number)[][] }) {
  return <div className="cut-list-print" aria-hidden="true">
    <h1>Cut List</h1>
    <dl><div><dt>Project:</dt><dd>{project}</dd></div><div><dt>Created by:</dt><dd>{createdBy}</dd></div><div><dt>Project no:</dt><dd>{projectNo}</dd></div><div><dt>Date:</dt><dd>{new Date().toLocaleDateString('en-GB')}</dd></div></dl>
    <table><thead><tr>{CUT_LIST_PRINT_COLUMNS.map(column => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{lines.map((cells, index) => <tr key={index}>{cells.map((value, column) => <td key={column} className={column === 5 || column === 6 ? 'number' : undefined}>{column === 5 && typeof value === 'number' ? formatLength(value) : String(value)}</td>)}</tr>)}</tbody></table>
    <p className="cut-list-print-iso">{String(iso.isoNo ?? '')}</p>
  </div>;
}

/**
 * Searchable fitting dropdown: readable names, the code as secondary text, fittings of the line's DIA first.
 * Arrow keys move, Enter chooses, Esc closes; "No fitting" clears the choice.
 */
function FittingSelect({ value, onChange, fittings, byId, dia, label, disabled, onKeyDown, ...rest }: { value: string; onChange: (value: string) => void; fittings: Row[]; byId: Map<string, Row>; dia: string; label: string; disabled?: boolean; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void; 'data-cell': string }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0), [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const input = useRef<HTMLInputElement>(null), listId = `${rest['data-cell']}-fittings`;
  const selected = value ? byId.get(value) : undefined;
  const options = useMemo(() => {
    if (!open) return [];
    const matching = fittings.filter(fitting => fittingMatches(fitting, query));
    const fitting = matching.filter(row => fittingFitsDiameter(row, dia)), others = matching.filter(row => !fittingFitsDiameter(row, dia));
    const byName = (a: Row, b: Row) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true });
    return [...fitting.sort(byName).map(row => ({ row, group: 'dia' as const })), ...others.sort(byName).map(row => ({ row, group: 'other' as const }))].slice(0, 80);
  }, [open, fittings, query, dia]);
  const choices: ({ row: Row | null; group: 'clear' | 'dia' | 'other' })[] = [...(value ? [{ row: null, group: 'clear' as const }] : []), ...options];
  useEffect(() => {
    if (!open) return;
    const place = () => { const rect = input.current?.getBoundingClientRect(); if (rect) setBox({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 340) }); };
    place(); window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);
  const choose = (row: Row | null) => { onChange(row ? row.id : ''); setOpen(false); setQuery(''); };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) { setOpen(true); setActive(0); return; } setActive(current => Math.max(0, Math.min(choices.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); return; }
    if (open && event.key === 'Enter') { event.preventDefault(); if (choices[active]) choose(choices[active].row); return; }
    if (open && event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(''); return; }
    onKeyDown?.(event);
  };
  const shown = open ? query : selected ? String(selected.name || selected.code) : value ? 'Unavailable fitting' : '';
  return <div className="fitting-select">
    <input ref={input} {...rest} disabled={disabled} role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && choices[active] ? `${listId}-${active}` : undefined}
      value={shown} placeholder={open ? 'Search fittings…' : ''} title={selected ? `${String(selected.code)} · take-off ${formatLength(Number(selected.takeoff))} mm` : undefined}
      onFocus={() => { setOpen(true); setQuery(''); setActive(0); }} onBlur={() => { setOpen(false); setQuery(''); }} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={key}/>
    {selected && !open && <small className="fitting-code">{String(selected.code)}</small>}
    {open && box && createPortal(<ul id={listId} role="listbox" aria-label={label} className="fitting-options" style={{ top: box.top, left: box.left, width: box.width }}>
      {choices.map((choice, index) => [
        (index === 0 || choices[index - 1].group !== choice.group) && choice.group !== 'clear' && <li key={`${choice.group}-heading`} role="presentation" className="fitting-group">{choice.group === 'dia' ? `Diameter ${dia}` : dia.trim() ? 'Other diameters' : 'All fittings'}</li>,
        <li key={choice.row?.id ?? 'clear'} id={`${listId}-${index}`} role="option" aria-selected={index === active} className={index === active ? 'active' : undefined} onMouseDown={event => { event.preventDefault(); choose(choice.row); }} onMouseEnter={() => setActive(index)}>
          {choice.row ? <><span>{String(choice.row.name || choice.row.code)}</span><small>{String(choice.row.code)} · {formatLength(Number(choice.row.takeoff))} mm</small></> : <span className="muted">No fitting</span>}
        </li>])}
      {!options.length && <li role="presentation" className="fitting-group">No fitting matches “{query}”.</li>}
    </ul>, document.body)}
  </div>;
}
