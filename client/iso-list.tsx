import { useState, type FormEvent } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { Modal } from './components.tsx';
import { formatNumber } from './api.ts';
import { NO_ISO_FILTERS, type PhaseFlag, type IsoKpi, type IsoListFilters, type Tri } from '../shared/iso-list.ts';
import type { Row } from '../shared/types.ts';

/** A tick, cross, orange minus ("ready, not signed off", Pfb / Fld only) or empty dash, with a text alternative and a tooltip naming the flag. */
export function FlagMark({ flag, title }: { flag: PhaseFlag; title: string }) {
  const state = flag === 'ready' ? 'ready, not signed off' : flag === null ? 'not applicable' : flag ? 'yes' : 'no';
  const kind = flag === 'ready' ? 'ready' : flag === null ? 'na' : flag ? 'yes' : 'no';
  return <span className={`iso-flag ${kind}`} role="img" aria-label={`${title}: ${state}`} title={`${title}: ${state}`}>{flag === null || flag === 'ready' ? <Minus size={15} aria-hidden="true"/> : flag ? <Check size={16} aria-hidden="true"/> : <X size={15} aria-hidden="true"/>}</span>;
}

/** The six key figures above the list, each as a percentage and n / total. */
export function IsoKpiCards({ cards }: { cards: IsoKpi[] }) {
  return <section className="iso-kpis" aria-label="Isometric key figures">{cards.map(card => <div className="panel iso-kpi" key={card.key}>
    <small>{card.label}</small>
    <strong>{formatNumber(card.percent, 1)} %</strong>
    <span>{formatNumber(card.count, 0)} / {formatNumber(card.total, 0)}</span>
    <div className="iso-kpi-bar" role="presentation"><span style={{ width: `${Math.min(100, card.percent)}%` }}/></div>
  </div>)}</section>;
}

const TRI_FILTERS: { key: 'ndt' | 'pwht' | 'mto' | 'est' | 'weld'; label: string; hint: string }[] = [
  { key: 'ndt', label: 'NDT', hint: 'Has welds that require NDT' },
  { key: 'pwht', label: 'PWHT', hint: 'Isometric requires PWHT' },
  { key: 'mto', label: 'MTO ready', hint: 'Materials complete' },
  { key: 'est', label: 'EST ready', hint: 'Calculation complete' },
  { key: 'weld', label: 'Weld ready', hint: 'Welds complete' },
];

/** Project and the yes / no choices; the filters typed under the column headers stay as they are. */
export function IsoFilterDialog({ filters, projectId, projects, showProject, showEstimate, onApply, onClose }: {
  filters: IsoListFilters; projectId: string; projects: Row[]; showProject: boolean; showEstimate: boolean;
  onApply: (filters: IsoListFilters, projectId: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters), [project, setProject] = useState(projectId);
  const submit = (event: FormEvent) => { event.preventDefault(); onApply(draft, project); onClose(); };
  const reset = () => { setDraft({ ...NO_ISO_FILTERS, text: draft.text }); setProject(showProject ? '' : projectId); };
  return <Modal title="Filter isometrics" subtitle="Choose what the list and the key figures should include. Filters combine." onClose={onClose}>
    <form onSubmit={submit}><div className="modal-body"><div className="form-grid">
      {showProject && <div className="field"><label htmlFor="iso-filter-project">Project</label><select id="iso-filter-project" value={project} onChange={event => setProject(event.target.value)}><option value="">All projects</option>{projects.map(row => <option key={row.id} value={row.id}>{String(row.internnumber)}{row.description ? ` · ${String(row.description)}` : ''}</option>)}</select></div>}
      {TRI_FILTERS.filter(item => item.key !== 'est' || showEstimate).map(item => <div className="field" key={item.key}><label htmlFor={`iso-filter-${item.key}`}>{item.label}</label>
        <select id={`iso-filter-${item.key}`} value={draft[item.key]} onChange={event => setDraft(current => ({ ...current, [item.key]: event.target.value as Tri }))}><option value="">All</option><option value="no">No</option><option value="yes">Yes</option></select><small className="field-hint">{item.hint}</small></div>)}
    </div></div>
    <div className="modal-footer"><button type="button" className="btn" onClick={reset}>Reset</button><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Apply filters</button></div></form>
  </Modal>;
}
