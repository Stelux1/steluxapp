import type { Row } from './types.ts';

/**
 * Punch lists: pre-punch and punch items of an isometric (or of a whole project), from report to sign-off.
 * Pure functions over plain rows (no I/O), shared by the Punch lists page, the isometric header, the
 * isometric status calculations and the server's validation.
 *
 * Labels follow the reference. Rules the capture does not show are each one named function below, so they can be
 * corrected in one place (see `punchCategory`, `isOverdue`, `punchDeadlineSoon`, `punchFinishErrors`).
 */

export const PUNCH_TYPES = ['Pre-punch', 'Punch'] as const;
export type PunchType = typeof PUNCH_TYPES[number];

/** The four categories with their exact reference labels. The first two block the isometric. */
export const PUNCH_CATEGORIES = ['A — Immediate fix (blocking)', 'B — ASAP fix (blocking)', 'C — Fix (non-blocking)', 'D — Fix in operation (non-blocking)'];
export type PunchLetter = 'A' | 'B' | 'C' | 'D';
export const PUNCH_LETTERS: PunchLetter[] = ['A', 'B', 'C', 'D'];
/** Records saved before the four labels existed keep their single letter; it stands for the label. */
export const LEGACY_PUNCH_CATEGORIES: Record<string, string> = { A: PUNCH_CATEGORIES[0], B: PUNCH_CATEGORIES[1], C: PUNCH_CATEGORIES[2] };

export const PUNCH_STATUSES = ['Open', 'Finished', 'Passed', 'Removed'] as const;
export type PunchStatus = typeof PUNCH_STATUSES[number];
/** The earlier status values: "In progress" was still open, "Completed" is the contractor's "Finished". */
export const LEGACY_PUNCH_STATUSES: Record<string, string> = { 'In progress': 'Open', Completed: 'Finished' };

/** Punch progress choices of an isometric (stored as the label). */
export const PUNCH_PROGRESS_OPTIONS = ['0 %', '25 %', '50 %', '75 %', '100 %'];

/** Up to two photos or documents per item; the sign-off file does not count. */
export const PUNCH_FILE_LIMIT = 2;
export const PUNCH_FILE_TYPES = ['Punch photo', 'Punch document'];
export const PUNCH_SIGN_OFF_DOCUMENT = 'Punch sign-off';
export const SIGNER_TYPES = ['Client', 'Own inspector'];
export const SIGN_METHODS = ['Drawn', 'Uploaded PDF'];
/** The "Deadline 7 days" window. */
export const PUNCH_DEADLINE_DAYS = 7;

/** Fields only the transitions write (Mark as finished, Report passed, Mark as removed) and the system numbering. */
export const PUNCH_PROTECTED_FIELDS = ['number', 'status', 'finishedAt', 'finishedBy', 'signerType', 'signName', 'signCompany', 'signFunction', 'signInspector', 'signRemarks', 'signMethod', 'signAttachmentId', 'passedAt', 'passedBy', 'passRemarks', 'removedAt', 'removedBy', 'removeReason'];

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
/** Today as a date, the same UTC day the server uses. */
export const punchToday = () => new Date().toISOString().slice(0, 10);

/**
 * Category letter A-D of an item: the first letter of the stored label or of an earlier single letter.
 * A missing or unreadable category counts as B, the default the field always had.
 */
export function punchCategory(value: unknown): PunchLetter {
  const letter = text(typeof value === 'object' && value !== null ? (value as Row).category : value).charAt(0).toUpperCase();
  return (PUNCH_LETTERS as string[]).includes(letter) ? letter as PunchLetter : 'B';
}
/** A and B block the isometric; C and D do not. */
export const isBlockingCategory = (value: unknown) => ['A', 'B'].includes(punchCategory(value));
/** Label of a category letter. */
export const punchCategoryLabel = (letter: PunchLetter) => PUNCH_CATEGORIES[PUNCH_LETTERS.indexOf(letter)];

/** Status with earlier values mapped; anything unreadable counts as Open. */
export function punchStatus(row: Pick<Row, 'status'> | Row): PunchStatus {
  const value = text(row.status), mapped = LEGACY_PUNCH_STATUSES[value] ?? value;
  return (PUNCH_STATUSES as readonly string[]).includes(mapped) ? mapped as PunchStatus : 'Open';
}
/** Pre-punch or Punch; items saved before the type existed are Punch. */
export const punchKind = (row: Row): PunchType => text(row.punchType) === 'Pre-punch' ? 'Pre-punch' : 'Punch';

/** Overdue is derived: an item still Open whose due date lies before today. Finished items wait for approval, not for the contractor. */
export const isOverdue = (row: Row, today = punchToday()) => punchStatus(row) === 'Open' && Boolean(text(row.dueDate)) && text(row.dueDate) < today;
/** An open item that is due within the next seven days (today included) and not yet overdue. */
export function punchDeadlineSoon(row: Row, today = punchToday()) {
  const due = text(row.dueDate);
  if (punchStatus(row) !== 'Open' || !due || due < today) return false;
  const limit = new Date(`${today}T00:00:00Z`); limit.setUTCDate(limit.getUTCDate() + PUNCH_DEADLINE_DAYS);
  return due <= limit.toISOString().slice(0, 10);
}

// ----- what the isometric reads ------------------------------------------------------------------------------

/** Open items of the blocking categories A and B; they hold the isometric back. Pass the items of one isometric. */
export const punchBlocking = (items: Row[]) => live(items).filter(row => punchStatus(row) === 'Open' && isBlockingCategory(row.category));

const PROGRESS_STEPS = [0, 25, 50, 75, 100];
/** The percentage stored on an isometric, or null while none (or an unknown one) is entered. */
const progressPercent = (iso: Row): number | null => { const match = /^\s*(\d{1,3})\s*%?\s*$/.exec(text(iso.punchProgress)); const percent = match ? Number(match[1]) : NaN; return PROGRESS_STEPS.includes(percent) ? percent : null; };
/** Punch progress of an isometric as 0..1; 0 while nothing is entered. */
export const punchProgress = (iso: Row): number => (progressPercent(iso) ?? 0) / 100;
/** Whether a punch progress was entered for the isometric; until then the driver stays out of the progress. */
export const hasPunchProgress = (iso: Row) => progressPercent(iso) !== null;

export interface PunchCounts { prePunchOpen: number; prePunchFinished: number; punchOpen: number; punchFinished: number; overdue: number; blocking: number; }
/** Counts of the items of one isometric for its status card. Passed and removed items are not counted. */
export function punchCounts(items: Row[], today = punchToday()): PunchCounts {
  const counts: PunchCounts = { prePunchOpen: 0, prePunchFinished: 0, punchOpen: 0, punchFinished: 0, overdue: 0, blocking: 0 };
  for (const row of live(items)) {
    const status = punchStatus(row), pre = punchKind(row) === 'Pre-punch';
    if (status === 'Open') { if (pre) counts.prePunchOpen++; else counts.punchOpen++; if (isOverdue(row, today)) counts.overdue++; if (isBlockingCategory(row.category)) counts.blocking++; }
    else if (status === 'Finished') { if (pre) counts.prePunchFinished++; else counts.punchFinished++; }
  }
  return counts;
}

// ----- the page's key figures ---------------------------------------------------------------------------------

export type PunchKpiKey = 'open' | 'prePunch' | 'punch' | 'overdue' | 'deadline' | 'finished' | 'passed' | 'removed';
export const PUNCH_KPIS: { key: PunchKpiKey; label: string }[] = [
  { key: 'open', label: 'Open' }, { key: 'prePunch', label: 'Pre-punch (open)' }, { key: 'punch', label: 'Punch (open)' }, { key: 'overdue', label: 'Overdue' },
  { key: 'deadline', label: 'Deadline 7 days' }, { key: 'finished', label: 'Finished' }, { key: 'passed', label: 'Passed' }, { key: 'removed', label: 'Removed' },
];
/** Whether an item belongs to a key figure; the cards double as quick filters. */
export function matchesPunchKpi(row: Row, key: PunchKpiKey, today = punchToday()): boolean {
  const status = punchStatus(row);
  switch (key) {
    case 'open': return status === 'Open';
    case 'prePunch': return status === 'Open' && punchKind(row) === 'Pre-punch';
    case 'punch': return status === 'Open' && punchKind(row) === 'Punch';
    case 'overdue': return isOverdue(row, today);
    case 'deadline': return punchDeadlineSoon(row, today);
    case 'finished': return status === 'Finished';
    case 'passed': return status === 'Passed';
    case 'removed': return status === 'Removed';
  }
}
export const punchKpis = (items: Row[], today = punchToday()) => PUNCH_KPIS.map(card => ({ ...card, count: live(items).filter(row => matchesPunchKpi(row, card.key, today)).length }));

// ----- transitions ------------------------------------------------------------------------------------------

export type PunchTransition = 'finish' | 'pass' | 'remove';
/** Open -> Finished -> Passed; an open or finished item can be removed. Passed and removed items are final. */
export const canTransition = (row: Row, transition: PunchTransition) => {
  const status = punchStatus(row);
  return transition === 'finish' ? status === 'Open' : transition === 'pass' ? status === 'Finished' : status === 'Open' || status === 'Finished';
};
export const TRANSITION_REFUSALS: Record<PunchTransition, string> = {
  finish: 'Only an open punch item can be marked as finished.',
  pass: 'Only a finished punch item can be reported as passed.',
  remove: 'Only an open or finished punch item can be marked as removed.',
};

// ----- validation -------------------------------------------------------------------------------------------

/**
 * Errors of a punch item about to be saved: it belongs to an isometric or to a project, and the due date does not
 * precede the day it was reported. `iso` is the chosen isometric's row, when there is one.
 */
export function punchInputErrors(data: Record<string, unknown>, existing?: Row, iso?: Row): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!text(data.isoId) && !text(data.projectId)) errors.projectId = 'Choose a project, or an isometric for an item that belongs to one.';
  if (iso && text(data.projectId) && text(data.projectId) !== text(iso.projectId)) errors.projectId = 'The project must be the isometric’s project.';
  if (text(data.dueDate) && text(data.reportedDate) && text(data.dueDate) < text(data.reportedDate)) errors.dueDate = 'The due date cannot be before the reported date.';
  if (existing && punchStatus(existing) === 'Passed') errors.status = 'A passed punch item cannot be changed.';
  return errors;
}
/** An item on an isometric carries that isometric's project. */
export function normalizePunch(data: Record<string, unknown>, iso?: Row) {
  if (iso) data.projectId = iso.projectId;
  if (!text(data.name)) data.name = text(data.description).replace(/\s+/g, ' ').slice(0, 80);
  return data;
}

/**
 * Why a write through the ordinary record API is refused in the hosted workspace, or null. Status, sign-off and
 * numbering change only through the transitions, and a passed item cannot be edited at all.
 */
export function punchWriteError(input: Record<string, unknown>, existing?: Row): string | null {
  if (existing && punchStatus(existing) === 'Passed') return 'A passed punch item cannot be edited.';
  for (const name of PUNCH_PROTECTED_FIELDS) {
    if (input[name] === undefined) continue;
    const unchanged = existing ? text(input[name]) === text(existing[name]) : name === 'status' && text(input[name]) === 'Open';
    if (!unchanged) return 'Use Mark as finished, Report passed or Mark as removed to change the status.';
  }
  return null;
}

export interface FinishInput { signerType?: unknown; clientName?: unknown; company?: unknown; function?: unknown; inspector?: unknown; date?: unknown; note?: unknown; signMethod?: unknown }
/**
 * Errors of the finish sign-off: a client signs with name and company, an own inspector with the inspector's name;
 * the sign-off itself is a drawn signature or a signed PDF. `signed` says whether that file is present.
 */
export function punchFinishErrors(input: FinishInput, signed: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  const type = text(input.signerType);
  if (!SIGNER_TYPES.includes(type)) errors.signerType = 'Choose who signs: the client or your own inspector.';
  if (type === 'Client') { if (!text(input.clientName)) errors.clientName = 'Enter the client’s name.'; if (!text(input.company)) errors.company = 'Enter the client’s company.'; }
  if (type === 'Own inspector' && !text(input.inspector)) errors.inspector = 'Enter the inspector’s name.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(input.date))) errors.date = 'Enter the sign-off date.';
  if (!SIGN_METHODS.includes(text(input.signMethod))) errors.signMethod = 'Choose how the sign-off is given.';
  else if (!signed) errors.signMethod = text(input.signMethod) === 'Drawn' ? 'Draw the signature before saving.' : 'Choose the signed PDF.';
  for (const name of ['clientName', 'company', 'function', 'inspector', 'note'] as const) if (text(input[name]).length > (name === 'note' ? 2000 : 200)) errors[name === 'note' ? 'note' : name] = 'This is too long.';
  return errors;
}
