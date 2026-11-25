import type { PhaseProgress } from './progress-model.ts';
import type { PunchCounts } from './punch.ts';

/**
 * Identification facts besides the four rows of the Identification card. Asset tag sits in the header's Details
 * disclosure (client change list 22.11.2026, image 20 does not show it); "Drawing no." stays in Edit isometric.
 */
export const IDENTIFICATION_FACTS: { label: string; field: string }[] = [{ label: 'Asset tag', field: 'assetTag' }];

/**
 * The four compact cards at the top of the isometric page and their rows, in order (client change list 22.11.2026,
 * image 20). Material Core shows Material status in place of Punch / Priority (statusCardParts in client/iso-header.tsx).
 */
export const ISO_HEADER_CARDS = [
  { key: 'identification', title: 'Identification', rows: ['ISO ID', 'Revision', 'ITP', 'Custom field'] },
  { key: 'compliance', title: 'Compliance', rows: ['NoBo', 'NoBo Reg. / Serial', 'PED Cat.-Mod', 'X-ray %'] },
  { key: 'technical', title: 'Technical', rows: ['Piping class', 'PWHT', 'Test pressure', 'Test system'] },
  { key: 'status', title: 'Progress & Status', rows: ['Completion', 'Shop / Field', 'Hydrotest', 'Punch / Priority'] },
] as const;

const round1 = (value: number) => Math.round((Number(value) || 0) * 10) / 10;

/** Hydrotest row: Completed, Pending while a test is in scope, "—" when the isometric has no test system or testing does not apply. */
export const hydrotestStateText = (state: { inScope: boolean; completed: boolean }) => state.completed ? 'Completed' : state.inScope ? 'Pending' : '—';
export const HYDROTEST_NOT_IN_SCOPE = 'No test system, or testing not applicable.';

/** Open punch items of the isometric (pre-punch and punch); null when punch items are not delivered to this account. */
export const openPunchCount = (counts: PunchCounts | null | undefined) => counts ? counts.prePunchOpen + counts.punchOpen : null;

/**
 * Tooltip of a phase in the Shop / Field row: the phase's share and points, then each activity with its fixed weight and
 * progress ("n/a" when there is nothing to measure; its weight then goes to the other activities of the phase).
 */
export function phaseBreakdown(phase: PhaseProgress): string {
  return [`${phase.label} ${round1(phase.percent)}% · ${phase.weight}% of the isometric · ${round1(phase.contribution)} points`,
    ...phase.activities.map(activity => `${activity.label} (${activity.weight}%): ${activity.progress === null ? 'n/a' : `${round1(activity.progress)}%`}`)].join('\n');
}
