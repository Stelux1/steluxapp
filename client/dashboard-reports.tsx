import { useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileText, Loader2 } from 'lucide-react';
import { ApiError, apiBlob } from './api.ts';
import { Dropdown, Modal } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { DASHBOARD_REPORTS, DASHBOARD_REPORTS_ACCESS, dialogDefaults, reportQuery, reportRefusal, type DashboardReport, type ReportDialogValues } from '../shared/dashboard-reports.ts';
import type { DashboardFilters } from '../shared/weld-dashboard.ts';

/**
 * Reports ▾ of the Weld Pilot dashboard: the ten reference entries in their order. Each opens its dialog (the reference's
 * own fields; Language is left out, English only), checks the dialog's rules, and opens the PDF of the applied dashboard
 * filters in a new tab. The server applies the same rules (shared/dashboard-reports.ts) and decides who may print.
 */
export function DashboardReports({ filters, defaultTo = '' }: { filters: DashboardFilters; /** The dashboard's untouched To date. */ defaultTo?: string }) {
  const { canReadReport, hasFeature } = useWorkspace(); const pilot = usePilot();
  const [report, setReport] = useState<DashboardReport | null>(null);
  if (!hasFeature('pilots') || pilot?.pilot.key !== 'weld' || !canReadReport(DASHBOARD_REPORTS_ACCESS, 'export')) return null;
  return <>
    <Dropdown className="wd-reports" label="Reports" trigger={<span className="btn"><FileText size={15} aria-hidden="true"/>Reports<ChevronDown size={15} aria-hidden="true"/></span>}>
      {DASHBOARD_REPORTS.map(entry => <button key={entry.key} type="button" onClick={() => setReport(entry)}>{entry.label}</button>)}
    </Dropdown>
    {/* The dashboard's filter form holds the menu: the dialog (a form of its own) is rendered outside it. */}
    {report && createPortal(<ReportDialog report={report} filters={filters} defaultTo={defaultTo} onClose={() => setReport(null)}/>, document.body)}
  </>;
}

function ReportDialog({ report, filters, defaultTo, onClose }: { report: DashboardReport; filters: DashboardFilters; defaultTo: string; onClose: () => void }) {
  const { rows, siteId } = useWorkspace(); const id = useId();
  const [values, setValues] = useState<ReportDialogValues>(() => dialogDefaults(report));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (name: string, value: string | boolean) => { setValues(current => ({ ...current, [name]: value })); setError(''); };
  const catalog = (name: string) => (name === 'ndt' ? activeRows(rows, 'ndt_processes') : activeRows(rows, 'weld_types').sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0)))
    .map(row => ({ value: row.id, label: String(row.name ?? row.id) }));
  async function go(event: FormEvent) {
    event.preventDefault(); event.stopPropagation(); setError('');
    const query = reportQuery(report, filters, values, { defaultTo, siteId });
    const refusal = reportRefusal(report, query);
    if (refusal) { setError(refusal.message); return; }
    // Opened now, while the click still counts, and pointed at the PDF once it is made.
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const blob = await apiBlob(`/pdf/${report.key}?${new URLSearchParams(query)}`);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else { const link = document.createElement('a'); link.href = url; link.download = `${report.label.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`; document.body.appendChild(link); link.click(); link.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onClose();
    } catch (problem) { tab?.close(); setError(problem instanceof ApiError ? problem.message : 'The PDF could not be created. Try again.'); }
    finally { setBusy(false); }
  }
  return <Modal title={report.title} onClose={onClose}>
    <form onSubmit={event => void go(event)} aria-busy={busy}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert">{error}</div>}
        <p className="muted">The PDF follows the filters applied on the dashboard and opens in a new tab.</p>
        {report.options.map(option => {
          const field = `${id}-${option.name}`, value = values[option.name];
          if (option.kind === 'checkbox') return <div className="field checkbox-field" key={option.name}><label htmlFor={field}><input id={field} type="checkbox" checked={value === true} disabled={busy} onChange={event => set(option.name, event.target.checked)}/><span>{option.label}</span></label></div>;
          if (option.kind === 'number') return <div className="field" key={option.name}><label htmlFor={field}>{option.label}</label><input id={field} type="number" inputMode="decimal" min={0} max={100} value={String(value ?? '')} disabled={busy} onChange={event => set(option.name, event.target.value)}/></div>;
          const choices = option.kind === 'select' ? option.options : [{ value: '0', label: option.any }, ...catalog(option.name)];
          return <div className="field" key={option.name}><label htmlFor={field}>{option.label}</label><select id={field} value={String(value ?? '')} disabled={busy} onChange={event => set(option.name, event.target.value)}>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></div>;
        })}
      </div>
      <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin"/>Creating PDF…</> : 'Go'}</button></div>
    </form>
  </Modal>;
}
