import { useId, useState, type FormEvent } from 'react';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { PUNCH_PRINT_OPTIONS, punchPrintHint } from '../shared/punch.ts';
import { ApiError, apiBlob, apiUrl } from './api.ts';
import { Modal } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';

/**
 * Buttons for the operational documents (server/pdf/operational-documents.ts): NDT / NDT Pre / Pre-HT/PWHT request, visual
 * inspection report, Prefab / Field release, hydrotest request, punch list, flange report and pick list. Every button opens a
 * small dialog with the document's options, creates the PDF on the server and downloads it. The request documents are also
 * attached to their request ("Request document"). The server decides who may print; a button is shown only where the account's
 * profile allows the document's report key, and an account without access gets the server's refusal in the dialog.
 */
export type PdfOption =
  | { name: string; label: string; kind: 'checkbox'; defaultValue?: boolean; hint?: string }
  | { name: string; label: string; kind: 'text' | 'textarea'; hint?: string; maxLength?: number; placeholder?: string }
  | { name: string; label: string; kind: 'choices'; choices: { value: string; label: string }[]; hint?: string };

interface ButtonProps {
  /** Server key of the document (`/api/pdf/<key>`). */
  document: string;
  /** Access key of the document family (`shared/pdf-report-keys.ts`). */
  report: string;
  params: Record<string, string>;
  label: string;
  /** Dialog title and subtitle; the label when absent. */
  title?: string; subtitle?: string;
  /** Download name without extension. */
  fileName: string;
  options?: PdfOption[];
  /** Text of the dialog's submit button; `Create PDF` when absent. */
  submit?: string;
  /** Create with POST so the server also stores the file on the request. */
  attach?: boolean;
  /** What the account may not do here, shown instead of the button's dialog (disabled button with this hint). */
  blocked?: string;
  /** Extra permission check (the row's own export right). */
  allowed?: boolean;
  hint?: string;
  /** A line above the options, and the text of the dialog's cancel button (`Close` when absent). */
  intro?: string; cancel?: string;
}

/** The query string of the chosen options: checkboxes as 1 / 0, text when filled, a choice list only when it is a subset. */
export function pdfDocumentQuery(params: Record<string, string>, options: PdfOption[], values: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ''));
  for (const option of options) {
    const value = values[option.name];
    if (option.kind === 'checkbox') query.set(option.name, value ? '1' : '0');
    else if (option.kind === 'choices') { const chosen = Array.isArray(value) ? value as string[] : []; if (chosen.length !== option.choices.length) query.set(option.name, chosen.join(',')); }
    else if (typeof value === 'string' && value.trim()) query.set(option.name, value.trim());
  }
  return query;
}
const initialValues = (options: PdfOption[]) => Object.fromEntries(options.map(option => [option.name, option.kind === 'checkbox' ? option.defaultValue ?? false : option.kind === 'choices' ? option.choices.map(choice => choice.value) : '']));

export function PdfDocumentButton({ document: key, report, params, label, title, subtitle, fileName, options = [], submit, attach = false, blocked, allowed = true, hint, intro, cancel }: ButtonProps) {
  const { canReadReport, hasFeature } = useWorkspace(); const pilot = usePilot();
  const [open, setOpen] = useState(false);
  if (!hasFeature('pilots') || !pilot || !allowed || !canReadReport(report, 'export')) return null;
  return <>
    <button type="button" className="btn small pdf-doc-button" disabled={Boolean(blocked)} title={blocked || hint} onClick={() => setOpen(true)}><FileText size={14} aria-hidden="true"/>{label}</button>
    {open && <PdfDocumentDialog document={key} params={params} label={label} title={title} subtitle={subtitle} fileName={fileName} options={options} submit={submit} attach={attach} intro={intro} cancel={cancel} onClose={() => setOpen(false)}/>}
  </>;
}

function PdfDocumentDialog({ document: key, params, label, title, subtitle, fileName, options, submit, attach, intro, cancel, onClose }: { document: string; params: Record<string, string>; label: string; title?: string; subtitle?: string; fileName: string; options: PdfOption[]; submit?: string; attach: boolean; intro?: string; cancel?: string; onClose: () => void }) {
  const { refresh } = useWorkspace(); const id = useId();
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(options));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const path = `/pdf/${key}?${pdfDocumentQuery(params, options, values)}`;
  const set = (name: string, value: unknown) => { setValues(current => ({ ...current, [name]: value })); setDone(''); };
  async function generate(event: FormEvent) {
    event.preventDefault(); setError(''); setDone('');
    const empty = options.find(option => option.kind === 'choices' && !(values[option.name] as string[]).length);
    if (empty) { setError(`Choose at least one: ${empty.label}.`); return; }
    setBusy(true);
    try {
      const blob = await apiBlob(path, attach ? { method: 'POST' } : {});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${fileName.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(attach ? 'The PDF was downloaded and attached to the request as a request document.' : 'The PDF was downloaded.');
      if (attach) await refresh().catch(() => undefined);
    } catch (problem) { setError(problem instanceof ApiError ? problem.message : 'The PDF could not be created. Try again.'); } finally { setBusy(false); }
  }
  return <Modal title={title || label} subtitle={subtitle} onClose={onClose}>
    <form onSubmit={event => void generate(event)} aria-busy={busy}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert">{error}</div>}
        {done && <div className="alert success" role="status">{done}{!attach && <> <a className="text-link" href={apiUrl(path)} target="_blank" rel="noreferrer">Open in a new tab<ExternalLink size={13} aria-hidden="true"/></a></>}</div>}
        {!options.length && <p className="muted">The document is created from the records as they are now.</p>}
        {intro && options.length > 0 && <p className="muted">{intro}</p>}
        {options.map(option => {
          const field = `${id}-${option.name}`;
          if (option.kind === 'checkbox') return <div className="field checkbox-field" key={option.name}><label htmlFor={field}><input id={field} type="checkbox" checked={Boolean(values[option.name])} disabled={busy} onChange={event => set(option.name, event.target.checked)}/><span>{option.label}</span></label>{option.hint && <small>{option.hint}</small>}</div>;
          if (option.kind === 'textarea') return <div className="field" key={option.name}><label htmlFor={field}>{option.label}</label><textarea id={field} rows={3} maxLength={option.maxLength} value={String(values[option.name] ?? '')} placeholder={option.placeholder} disabled={busy} onChange={event => set(option.name, event.target.value)}/>{option.hint && <small>{option.hint}</small>}</div>;
          if (option.kind === 'text') return <div className="field" key={option.name}><label htmlFor={field}>{option.label}</label><input id={field} maxLength={option.maxLength} value={String(values[option.name] ?? '')} placeholder={option.placeholder} disabled={busy} onChange={event => set(option.name, event.target.value)}/>{option.hint && <small>{option.hint}</small>}</div>;
          if (option.kind !== 'choices') return null;
          const chosen = values[option.name] as string[];
          return <fieldset className="field pdf-doc-choices" key={option.name}><legend>{option.label}</legend>{option.choices.map(choice => <label key={choice.value}><input type="checkbox" checked={chosen.includes(choice.value)} disabled={busy} onChange={event => set(option.name, event.target.checked ? [...chosen, choice.value] : chosen.filter(value => value !== choice.value))}/>{choice.label}</label>)}{option.hint && <small>{option.hint}</small>}</fieldset>;
        })}
      </div>
      <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>{cancel || 'Close'}</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin"/>Creating PDF…</> : submit || 'Create PDF'}</button></div>
    </form>
  </Modal>;
}

// ----- one button per document, with the data it needs from the row it sits on --------------------------------------------------

const text = (value: unknown) => String(value ?? '').trim();
const safe = (value: unknown) => text(value).replace(/[^A-Za-z0-9._-]+/g, '-');
const REQUEST_DOCUMENTS: Record<string, { document: string; label: string }> = {
  NDT: { document: 'ndt-request', label: 'NDT request' }, 'NDT PRE': { document: 'ndt-pre-request', label: 'NDT Pre request' },
  'PRE-HT': { document: 'pwht-request', label: 'Pre-HT/PWHT request' }, PWHT: { document: 'pwht-request', label: 'Pre-HT/PWHT request' },
};
/** NDT / NDT Pre / Pre-HT/PWHT request document of one request record (it covers every weld that shares its request number). */
export function RequestPdfButton({ request }: { request: Row }) {
  const { rows, canRecord } = useWorkspace();
  const kind = REQUEST_DOCUMENTS[text(request.type)], number = text(request.number);
  if (!kind || !number) return null;
  const ndt = text(request.type) === 'NDT' || text(request.type) === 'NDT PRE';
  const names = new Set((rows.inspection_requests || []).filter(row => !row._archived && row.number === number).flatMap(row => text(row.processes).split(',').map(text).concat(row.processId ? [text(rows.ndt_processes?.find(item => item.id === row.processId)?.name)] : [])).filter(Boolean));
  const processes = (rows.ndt_processes || []).filter(item => !item._archived && names.has(text(item.name))).map(item => ({ value: item.id, label: text(item.name) }));
  const options: PdfOption[] = [
    ...(ndt && processes.length ? [{ name: 'processes', label: 'NDT processes to include', kind: 'choices' as const, choices: processes }] : []),
    { name: 'note', label: 'Note', kind: 'textarea', maxLength: 2000, hint: 'Leave empty to print the note saved with the request.' },
    { name: 'isometrics', label: 'Include isometric(s)', kind: 'checkbox', defaultValue: false, hint: 'Adds the list of the isometrics this request covers.' },
  ];
  return <PdfDocumentButton document={kind.document} report="pdf-ndt-request" params={{ requestNo: number }} label="Request PDF" title={kind.label} subtitle={`Request ${number}`} fileName={`${kind.label}-${safe(number)}`} options={options} attach allowed={canRecord('inspection_requests', 'export', request)} hint="Create the printable request"/>;
}
/** A request PDF button for each live request of a weld (of the given inspection types): the weld's NDT and PWHT dialogs. */
export function WeldRequestPdfButtons({ weld, types }: { weld: Row; types: string[] }) {
  const { rows } = useWorkspace();
  const requests = (rows.inspection_requests || []).filter(row => !row._archived && row.weldId === weld.id && types.includes(text(row.type)) && row.status !== 'Cancelled' && text(row.number));
  return requests.length ? <p className="pdf-doc-row">{requests.map(request => <RequestPdfButton key={request.id} request={request}/>)}</p> : null;
}
/** Visual inspection report of one report number (the Visual reports archive). */
export function VisualReportPdfButton({ reportNo, label = 'Report PDF' }: { reportNo: string; label?: string }) {
  return reportNo && reportNo !== '—' ? <PdfDocumentButton document="visual-report" report="pdf-visual-report" params={{ reportNo }} label={label} title="Visual inspection report" subtitle={`Report ${reportNo}`} fileName={`Visual-inspection-report-${safe(reportNo)}`}/> : null;
}
/** Prefab or Field release document of one release record (Hydrotest releases have their own document). */
export function ReleasePdfButton({ release }: { release: Row }) {
  const type = text(release.type);
  if (type !== 'Prefab' && type !== 'Field') return null;
  return <PdfDocumentButton document={`${type.toLowerCase()}-release`} report="pdf-release" params={{ releaseId: release.id }} label="Release PDF" title={`${type} release`} subtitle={text(release.docNo) || text(release.number)} fileName={`${type}-release-${safe(release.docNo || release.number)}`}/>;
}
/** Hydrotest request document. */
export function HydrotestPdfButton({ request }: { request: Row }) {
  return <PdfDocumentButton document="hydrotest-request" report="pdf-hydrotest" params={{ requestId: request.id }} label="Request PDF" title="Hydrotest request" subtitle={text(request.recordNo)} fileName={`Hydrotest-request-${safe(request.recordNo)}`}
    options={[{ name: 'isometrics', label: 'Include isometric(s)', kind: 'checkbox', defaultValue: request.includeIsometrics !== false, hint: 'Lists the isometrics of the test system.' }]}/>;
}
export interface PunchPdfFilters { projectId: string; isoId: string; punchType: string; category: string; view: string; due: string; q: string }
/**
 * The one Print button of the Punch lists page. The dialog says what is printed: the ticked rows (`selected`, on their own) or
 * all items matching the current filter, and offers the optional attachments: the Document column and the imported isometric
 * drawing (PDF) of each printed isometric.
 */
export function PunchListPdfButton({ filters, selected = [] }: { filters: PunchPdfFilters; selected?: string[] }) {
  return <PdfDocumentButton document="punch-list" report="pdf-punch" params={{ projectId: filters.projectId, isoId: filters.isoId, punchType: filters.punchType, category: filters.category, view: filters.view, due: filters.due, q: filters.q.trim(), ids: selected.join(',') }}
    label="Print" title="Print" subtitle={punchPrintHint(selected.length)} submit="Print" cancel="Cancel" fileName="Punch-list" intro="Optional attachments (only for items in this report):"
    options={[{ name: 'documents', label: PUNCH_PRINT_OPTIONS.documents, kind: 'checkbox', defaultValue: false }, { name: 'isoDrawing', label: PUNCH_PRINT_OPTIONS.isoDrawing, kind: 'checkbox', defaultValue: false }]}/>;
}
/** Flange report of the ticked flanges (the page's checkboxes). */
export function FlangeReportPdfButton({ ids }: { ids: string[] }) {
  return <PdfDocumentButton document="flange-report" report="pdf-flanges" params={{ ids: ids.join(',') }} label="Report" title="Flanges — Report" subtitle={`${ids.length} flange${ids.length === 1 ? '' : 's'} ticked`} submit="Go" fileName="Flange-report"
    blocked={ids.length ? undefined : 'Tick at least one flange first.'}/>;
}
/** QR labels of the ticked flanges. */
export function FlangeLabelsPdfButton({ ids }: { ids: string[] }) {
  return <PdfDocumentButton document="flange-labels" report="pdf-flanges" params={{ ids: ids.join(',') }} label="Print labels" title="Print labels" subtitle={`${ids.length} flange${ids.length === 1 ? '' : 's'} ticked`} submit="Go" fileName="Flange-labels"
    blocked={ids.length ? undefined : 'Tick at least one flange first.'}/>;
}
/** Pick list of one report number (the Pick List archive). */
export function PickListPdfButton({ reportNo }: { reportNo: string }) {
  return <PdfDocumentButton document="pick-list" report="pdf-picklist" params={{ reportNo }} label="Pick list PDF" title="Pick list" subtitle={reportNo} fileName={`Pick-list-${safe(reportNo)}`}/>;
}
