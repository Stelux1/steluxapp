import { wdiProgress } from '../shared/wdi.ts';
import type { Row } from '../shared/types.ts';
import { formatNumber } from './api.ts';
import { Progress } from './components.tsx';

export function WdiProgress({ welds, diameters, compact = false }: { welds: Row[]; diameters: Row[]; compact?: boolean }) {
  const stats = wdiProgress(welds, diameters);
  return <div className={`wdi-progress${compact ? ' wdi-compact' : ''}`}>
    <div className="wdi-progress-heading"><strong>WDI progress</strong><span>{stats.percent}% completed</span></div>
    <Progress value={stats.percent}/>
    <dl className="wdi-totals">{[['Completed', stats.completed], ['Remaining', stats.remaining], ['Total', stats.total]].map(([label, value]) => <div key={label}><dt>WDI {label}</dt><dd>{formatNumber(value)} <small>dia-inch</small></dd></div>)}</dl>
    {!compact && <p>Completed: Welder ID filled · Remaining: Welder ID empty</p>}
    {stats.unmeasured > 0 && <p className="wdi-missing" role="status">{stats.unmeasured} weld{stats.unmeasured === 1 ? '' : 's'} without a diameter in inches. WDI covers measured welds only.</p>}
  </div>;
}
