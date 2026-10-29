import type { Row } from './types.ts';

/** PDF specification: diameter inches, completed when a Welder ID is filled. */
export function wdiProgress(welds: Row[], diameters: Row[]) {
  const inches = new Map(diameters.map(row => [row.id, Number(row.sizeinch)]));
  let total = 0, completed = 0, unmeasured = 0, completedWelds = 0;
  const active = welds.filter(weld => !weld._archived);
  for (const weld of active) {
    const done = [1, 2, 3, 4].some(side => Boolean(String(weld[`welder${side}Id`] || '').trim()));
    if (done) completedWelds++;
    const diameter = inches.get(String(weld.diameterId));
    if (diameter === undefined || !Number.isFinite(diameter) || diameter <= 0) { unmeasured++; continue; }
    total += diameter;
    if (done) completed += diameter;
  }
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return { total: round(total), completed: round(completed), remaining: round(total - completed),
    percent: total ? Math.round(completed / total * 100) : 0, unmeasured,
    welds: active.length, completedWelds };
}
