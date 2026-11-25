import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { EmptyState } from './components.tsx';
import { mainProjectProgress, type ProjectProgress } from '../shared/project-progress.ts';
import { COMPLETION_TEXTS, RING_CIRCUMFERENCE, RING_RADIUS, nextTabIndex, projectCompletion, ringSegments, type ActivityCard, type PhaseCompletion, type ProjectCompletion } from '../shared/project-completion.ts';
import type { ProgressPhaseKey } from '../shared/progress-model.ts';

/** One ring: `segments` are drawn clockwise from 12 o'clock over a neutral track; the centre shows `children`. Information is also in `label` (role="img"). */
function Ring({ label, segments, size, stroke, children }: { label: string; segments: { key: string; dashArray: string; dashOffset: number }[]; size: number; stroke: number; children: ReactNode }) {
  return <div className="pc-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <circle className="pc-track" cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth={stroke}/>
      {segments.map(segment => <circle key={segment.key} className={`pc-seg pc-${segment.key}`} cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth={stroke} strokeDasharray={segment.dashArray} strokeDashoffset={segment.dashOffset} transform="rotate(-90 50 50)"/>)}
    </svg>
    <div className="pc-ring-centre" aria-hidden="true">{children}</div>
  </div>;
}

function ActivityDonut({ card, phase }: { card: ActivityCard; phase: ProgressPhaseKey }) {
  const segments = ringSegments([{ key: phase, value: card.percent }]).slice(0, 1);
  return <li className={`pc-activity ${card.measurable ? '' : 'is-idle'}`}>
    <Ring label={card.summary} segments={card.measurable ? segments : []} size={84} stroke={11}><strong>{card.percentLabel}</strong></Ring>
    <div className="pc-activity-body">
      <h4>{card.label}</h4>
      {card.measurable ? <><p>{card.weightLabel}</p><p><strong>{card.contributionLabel}</strong></p></>
        : <><p className="pc-reason">{card.reason}</p><p>{card.weightLabel}</p></>}
    </div>
  </li>;
}

/** The presentational part: everything comes in through `view` (see shared/project-completion.ts). */
export function ProjectCompletionView({ view, initialPhase = 'shop' }: { view: ProjectCompletion; initialPhase?: ProgressPhaseKey }) {
  const id = useId(), [phaseKey, setPhaseKey] = useState<ProgressPhaseKey>(initialPhase), tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, view.phases.findIndex(phase => phase.key === phaseKey)), phase: PhaseCompletion = view.phases[index];
  const move = (event: KeyboardEvent, from: number) => {
    const next = nextTabIndex(event.key, from, view.phases.length);
    if (next === null) return;
    event.preventDefault(); setPhaseKey(view.phases[next].key); tabs.current[next]?.focus();
  };
  return <>
    {view.empty && <p className="wd-note pc-note" role="status">{COMPLETION_TEXTS.empty}</p>}
    <div className="pc-overview">
      <Ring label={view.ringLabel} segments={view.ring} size={176} stroke={13}><strong className="pc-total">{view.totalLabel}</strong><small>completed</small></Ring>
      <dl className="pc-legend">
        {view.phases.map(item => <div key={item.key} className={`pc-legend-row pc-legend-${item.key}`}>
          <dt><span className="pc-swatch" aria-hidden="true"/>{item.title}</dt>
          <dd><strong>{item.counted ? `${item.percent} %` : COMPLETION_TEXTS.noValue}</strong><small>{`Weight in project: ${item.weight} %`}</small><small>{`Contributes ${item.ringValue} of ${item.weight} pp`}</small></dd>
        </div>)}
        <div className="pc-legend-row pc-legend-remaining"><dt><span className="pc-swatch" aria-hidden="true"/>{COMPLETION_TEXTS.remaining}</dt><dd><strong>{`${Math.max(0, Math.round((100 - view.total) * 10) / 10)} %`}</strong></dd></div>
        <p className="pc-distribution">Distribution: {view.distribution}</p>
      </dl>
    </div>
    <div className="pc-switch" role="tablist" aria-label="Project completion by phase">
      {view.phases.map((item, position) => <button key={item.key} ref={node => { tabs.current[position] = node; }} type="button" role="tab" id={`${id}-tab-${item.key}`} aria-selected={item.key === phase.key} aria-controls={`${id}-panel`} tabIndex={item.key === phase.key ? 0 : -1} className={item.key === phase.key ? 'selected' : ''} onClick={() => setPhaseKey(item.key)} onKeyDown={event => move(event, position)}>{item.tab}</button>)}
    </div>
    <div className="pc-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${phase.key}`}>
      <div className="pc-panel-head"><div><h3>{phase.title}</h3><p>Each ring shows what is completed and what remains inside this phase.</p></div><span className="pc-chip">{phase.weightsLabel}</span></div>
      <ul className="pc-grid" aria-label={`${phase.title} activities`}>{phase.activities.map(card => <ActivityDonut key={`${phase.key}-${card.key}`} card={card} phase={phase.key}/>)}</ul>
    </div>
  </>;
}

/** The section's frame with its three states: loading, error, and the figures (an empty project reads 0 %, with a note). */
export function ProjectCompletionPanel({ progress, loading = false, error = '' }: { progress: ProjectProgress | null; loading?: boolean; error?: string }) {
  const view = useMemo(() => progress ? projectCompletion(progress) : null, [progress]);
  return <section className="panel pc-section" aria-labelledby="pc-title" aria-busy={loading || undefined}>
    <div className="panel-heading"><div><span className="eyebrow">{COMPLETION_TEXTS.eyebrow}</span><h2 id="pc-title">{COMPLETION_TEXTS.title}</h2><p className="wd-hint">{COMPLETION_TEXTS.subtitle}</p></div></div>
    {error ? <div className="alert error pc-state" role="alert">{error}</div>
      : loading ? <p className="wd-loading pc-state" role="status"><Loader2 size={16} className="spin" aria-hidden="true"/>{COMPLETION_TEXTS.loading}</p>
        : !view ? <div className="pc-state"><EmptyState title="No progress yet" description={COMPLETION_TEXTS.unavailable}/></div>
          : <div className="pc-body"><ProjectCompletionView view={view}/></div>}
  </section>;
}

/** The dashboard's first section: the whole main project (every sub-project), from the workspace's isometrics and their summaries. */
export function ProjectCompletionSection() {
  const { rows, isoSummaries } = useWorkspace();
  const result = useMemo(() => {
    if (!isoSummaries) return { progress: null as ProjectProgress | null, error: '' };
    try { return { progress: mainProjectProgress(rows.isometrics, isoSummaries), error: '' }; }
    catch { return { progress: null as ProjectProgress | null, error: 'Project progress could not be calculated. Reload the page to try again.' }; }
  }, [rows.isometrics, isoSummaries]);
  return <ProjectCompletionPanel progress={result.progress} error={result.error} loading={!isoSummaries && !rows.isometrics}/>;
}
