import type { Row } from './types.ts';

/**
 * Punch lists: pre-punch and punch items of an isometric (or of a whole project), from report to sign-off.
 * Pure functions over plain rows (no I/O), shared by the Punch lists page, the isometric header, the
 * isometric status calculations and the server's validation.
 *
 * Status model of the reference (user manual §24 "Statuses"): an item is Open, Finished or Removed; besides that it
 * carries the client approval ("Akkoord", shown as "Client approved"), set by the sign-off or by "Mark as Client
 * approved". Passed is never stored: it is derived per phase, the pre-punch or the punch items of one isometric
 * (`punchPhasePassed`). Labels follow the reference. Rules the capture does not show are each one named function
 * below, so they can be corrected in one place (see `punchCategory`, `isOverdue`, `punchDeadlineSoon`,
 * `punchPhasePassed`, `punchAddRefusal`, `canTransition`, `punchFinishErrors`).
 */

export const PUNCH_TYPES = ['Pre-punch', 'Punch'] as const;
export type PunchType = typeof PUNCH_TYPES[number];
/** Labels of the Pre-Punch / Punch toggle of the Add item form (stored as PUNCH_TYPES). */
export const PUNCH_TYPE_LABELS: Record<PunchType, string> = { 'Pre-punch': 'Pre-Punch', Punch: 'Punch' };

/** The four categories with their exact reference labels. The first two block the isometric. */
export const PUNCH_CATEGORIES = ['A — Immediate fix (blocking)', 'B — ASAP fix (blocking)', 'C — Fix (non-blocking)', 'D — Fix in operation (non-blocking)'];
export type PunchLetter = 'A' | 'B' | 'C' | 'D';
export const PUNCH_LETTERS: PunchLetter[] = ['A', 'B', 'C', 'D'];
/** Records saved before the four labels existed keep their single letter; it stands for the label. */
export const LEGACY_PUNCH_CATEGORIES: Record<string, string> = { A: PUNCH_CATEGORIES[0], B: PUNCH_CATEGORIES[1], C: PUNCH_CATEGORIES[2] };

/** Statuses as the pages show them. "Passed" is derived (see `withPunchPhases`); a stored "Passed" of an earlier version reads as Finished and approved. */
export const PUNCH_STATUSES = ['Open', 'Finished', 'Passed', 'Removed'] as const;
export type PunchStatus = typeof PUNCH_STATUSES[number];
/** The earlier status values: "In progress" was still open, "Completed" is the contractor's "Finished". */
export const LEGACY_PUNCH_STATUSES: Record<string, string> = { 'In progress': 'Open', Completed: 'Finished' };

/** Punch progress choices of an isometric (stored as the label), as in the reference's Punch select. */
export const PUNCH_PROGRESS_OPTIONS = ['0%', '25%', '50%', '75%', '100%'];
/** Labels saved before, with a space before the percent sign; they stand for the new labels. */
export const LEGACY_PUNCH_PROGRESS: Record<string, string> = Object.fromEntries(PUNCH_PROGRESS_OPTIONS.map(option => [option.replace('%', ' %'), option]));
/** The preselected option of the reference's Punch select. */
export const PUNCH_PROGRESS_DEFAULT = PUNCH_PROGRESS_OPTIONS[0];

/** Up to two photos or documents per item; the sign-off file does not count. */
export const PUNCH_FILE_LIMIT = 2;
export const PUNCH_FILE_TYPES = ['Punch photo', 'Punch document'];
export const PUNCH_SIGN_OFF_DOCUMENT = 'Punch sign-off';
/** "Signed by" of the sign-off; Client is preselected. */
export const SIGNER_TYPES = ['Client', 'User', 'Inspection'];
/** Signer types saved before: "Own inspector" is the reference's "Inspection". */
export const LEGACY_SIGNER_TYPES: Record<string, string> = { 'Own inspector': 'Inspection' };
/** How the sign-off is given: drawn, a signed PDF, or (signer User) the account's saved signature. */
export const SIGN_METHODS = ['Drawn', 'Uploaded PDF', 'Saved signature'];
/** The "Deadline 7 days" window. */
export const PUNCH_DEADLINE_DAYS = 7;

/** Fields only the actions write (sign-off, approval, promote, remove) and the system numbering. */
export const PUNCH_PROTECTED_FIELDS = ['number', 'status', 'finishedAt', 'finishedBy', 'signerType', 'signName', 'signCompany', 'signFunction', 'signInspector', 'signInspectorId', 'signRemarks', 'signMethod', 'signAttachmentId', 'clientApproved', 'approvedAt', 'approvedBy', 'passedAt', 'passedBy', 'passRemarks', 'removedAt', 'removedBy', 'removeReason'];

/** Texts of the reference (punch lists page scripts). */
export const PUNCH_MESSAGES = {
  description: 'Please enter a description.',
  project: 'Please select a project.',
  kind: 'Choose Pre-punch or Punch.',
  clientName: 'Client name is required.',
  inspector: 'Select an inspector.',
  signature: 'Signature is required.',
  select: 'Select one or more items first.',
  approveConfirm: 'Mark as Client approved',
  noActivity: 'No activity recorded.',
  itemSummary: 'This item will be finished with sign-off.',
  bulkSummary: '%d item(s) will be finished with sign-off.',
  noSavedSignature: 'No saved signature. Register one under Signatures.',
} as const;
/** The summary line of the sign-off dialog for one or more items. */
export const finishSummary = (count: number, single = false) => single ? PUNCH_MESSAGES.itemSummary : PUNCH_MESSAGES.bulkSummary.replace('%d', String(count));

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

/**
 * Status of a row with earlier values mapped; anything unreadable counts as Open. A row read through `withPunchPhases`
 * reads Passed when its phase passed; a raw stored row reads what was stored.
 */
export function punchStatus(row: Pick<Row, 'status'> | Row): PunchStatus {
  const value = text(row.status), mapped = LEGACY_PUNCH_STATUSES[value] ?? value;
  return (PUNCH_STATUSES as readonly string[]).includes(mapped) ? mapped as PunchStatus : 'Open';
}
/** The work status alone: Open, Finished or Removed (a Passed item is Finished). */
export const punchWorkStatus = (row: Row): Exclude<PunchStatus, 'Passed'> => { const status = punchStatus(row); return status === 'Passed' ? 'Finished' : status; };
/** Client approval ("Akkoord"): set by the sign-off or by Mark as Client approved; an item stored as Passed had it. */
export const punchApproved = (row: Row) => row.clientApproved === true || text(row.status) === 'Passed';
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

// ----- phases and the derived Passed ---------------------------------------------------------------------------

/** Finished and client approved. */
const done = (row: Row) => punchWorkStatus(row) === 'Finished' && punchApproved(row);
/** Items that count in a phase: live and not removed. */
const counted = (items: Row[]) => live(items).filter(row => punchWorkStatus(row) !== 'Removed');
/**
 * Whether the phase (the pre-punch or the punch items of one isometric) is Passed: every A/B item of the phase is
 * Finished and approved; for Punch also every A/B pre-punch item of the isometric (open pre-punch C/D items do not
 * block). Open C/D items of the phase stay Open and do not block. INFERRED: a phase passes only once at least one of
 * its items is Finished and approved, so an isometric without items (or with open C/D items only) has no Passed
 * phase. Project-related items (no isometric) never pass: the reference says "Passed requires an isometric".
 */
export function punchPhasePassed(items: Row[], isoId: unknown, kind: PunchType): boolean {
  if (!text(isoId)) return false;
  const mine = counted(items).filter(row => text(row.isoId) === text(isoId));
  const phase = mine.filter(row => punchKind(row) === kind);
  if (!phase.some(done)) return false;
  const blocking = (rows: Row[]) => rows.filter(row => isBlockingCategory(row.category));
  if (!blocking(phase).every(done)) return false;
  return kind === 'Pre-punch' || blocking(mine.filter(row => punchKind(row) === 'Pre-punch')).every(done);
}
/**
 * The items as the pages show them: status Passed for a Finished and approved item of a Passed phase, Finished (with
 * its approval) for an item stored as Passed whose phase is not. Pass every item of the isometrics concerned (the
 * phases are decided over them); the result can then be filtered freely. The stored rows are not changed.
 */
export function withPunchPhases(items: Row[]): Row[] {
  const passed = new Map<string, boolean>();
  const phase = (row: Row) => { const key = `${text(row.isoId)}|${punchKind(row)}`; if (!passed.has(key)) passed.set(key, punchPhasePassed(items, row.isoId, punchKind(row))); return passed.get(key)!; };
  return items.map(row => {
    if (row._archived || punchWorkStatus(row) !== 'Finished') return row;
    const approved = punchApproved(row), status = approved && phase(row) ? 'Passed' : 'Finished';
    return status === row.status && row.clientApproved === approved ? row : { ...row, status, clientApproved: approved };
  });
}
/** The status of one item, read with the other items of its isometric. */
export const punchPhaseStatus = (row: Row, items: Row[]): PunchStatus => punchStatus(withPunchPhases([row, ...items.filter(item => item.id !== row.id && text(item.isoId) === text(row.isoId))])[0]);

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
/** The option label of the stored punch progress ('50 %' of an earlier version reads '50%'), or '' while none is entered. */
export const punchProgressLabel = (iso: Row) => { const percent = progressPercent(iso); return percent === null ? '' : `${percent}%`; };

export interface PunchCounts { prePunchOpen: number; prePunchFinished: number; punchOpen: number; punchFinished: number; overdue: number; blocking: number; }
/** Counts of the items of one isometric for its status card. Passed (derived over these items) and removed items are not counted. */
export function punchCounts(items: Row[], today = punchToday()): PunchCounts {
  const counts: PunchCounts = { prePunchOpen: 0, prePunchFinished: 0, punchOpen: 0, punchFinished: 0, overdue: 0, blocking: 0 };
  for (const row of live(withPunchPhases(items))) {
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
/** Whether an item belongs to a key figure; the cards double as quick filters. Pass rows read through `withPunchPhases`. */
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
/** The eight cards over the given rows (read every item through `withPunchPhases` first, then filter). */
export const punchKpis = (items: Row[], today = punchToday()) => PUNCH_KPIS.map(card => ({ ...card, count: live(items).filter(row => matchesPunchKpi(row, card.key, today)).length }));

// ----- actions ------------------------------------------------------------------------------------------------

export type PunchTransition = 'finish' | 'approve' | 'promote' | 'remove';
/**
 * What can be done with an item (read through `withPunchPhases`): finish an open item (with the sign-off), approve an
 * open or finished item not approved yet, promote an open pre-punch item to Punch, remove an open or finished item.
 * Passed and removed items are final. INFERRED: the approval can be given before the item is finished (the reference
 * offers "Mark as Client approved" in the edit dialog of an open item); an Open item never reads Passed.
 */
export const canTransition = (row: Row, transition: PunchTransition) => {
  const status = punchStatus(row);
  switch (transition) {
    case 'finish': return status === 'Open';
    case 'approve': return (status === 'Open' || status === 'Finished') && !punchApproved(row);
    case 'promote': return status === 'Open' && punchKind(row) === 'Pre-punch';
    case 'remove': return status === 'Open' || status === 'Finished';
  }
};
export const TRANSITION_REFUSALS: Record<PunchTransition, string> = {
  finish: 'Only an open punch item can be marked as finished.',
  approve: 'Only an open or finished punch item that is not client approved yet can be marked as client approved.',
  promote: 'Only an open pre-punch item can be promoted to Punch.',
  remove: 'Only an open or finished punch item can be removed.',
};
export const PASSED_REFUSAL = 'A passed punch item cannot be changed.';

/** The next item number: one above the highest number of the list (archived items included, so a number is never reused). */
export const nextPunchNumber = (items: Row[]) => String(items.reduce((max, row) => Math.max(max, Math.floor(Number(row.number)) || 0), 0) + 1);

// ----- the Add item form ---------------------------------------------------------------------------------------

/** Add item (manual mode) in the order of the reference: Project, ISO, Type, File, Description, Due date, Contractor, Reported date, Reported by, Pre-Punch / Punch. */
export const PUNCH_FORM_FIELDS = ['projectId', 'isoId', 'category', 'files', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedById', 'punchType'] as const;
/** Defaults of a new item: Type A, today's due and reported dates, the first contractor, Reported by "—", Pre-Punch. */
export const punchFormDefaults = (companies: Row[], today = punchToday()): Record<string, unknown> => ({ projectId: '', isoId: '', category: PUNCH_CATEGORIES[0], description: '', dueDate: today, contractorId: companies[0]?.id ?? '', reportedDate: today, reportedById: '', punchType: 'Pre-punch' });

// ----- validation -------------------------------------------------------------------------------------------

/**
 * Errors of a punch item about to be saved: it belongs to a project (taken from the isometric when one is chosen), the
 * punch type is Pre-punch or Punch, and the due date does not precede the day it was reported. `iso` is the chosen
 * isometric's row, when there is one; `items` all punch items, to refuse changing an item whose phase is Passed.
 */
export function punchInputErrors(data: Record<string, unknown>, existing?: Row, iso?: Row, items?: Row[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!text(data.isoId) && !text(data.projectId)) errors.projectId = PUNCH_MESSAGES.project;
  if (iso && text(data.projectId) && text(data.projectId) !== text(iso.projectId)) errors.projectId = 'The project must be the isometric’s project.';
  if (data.punchType !== undefined && text(data.punchType) && !(PUNCH_TYPES as readonly string[]).includes(text(data.punchType))) errors.punchType = PUNCH_MESSAGES.kind;
  if (text(data.dueDate) && text(data.reportedDate) && text(data.dueDate) < text(data.reportedDate)) errors.dueDate = 'The due date cannot be before the reported date.';
  if (existing && (punchStatus(existing) === 'Passed' || (items && punchPhaseStatus(existing, items) === 'Passed'))) errors.status = PASSED_REFUSAL;
  return errors;
}
/** An item on an isometric carries that isometric's project. */
export function normalizePunch(data: Record<string, unknown>, iso?: Row) {
  if (iso) data.projectId = iso.projectId;
  if (!text(data.name)) data.name = text(data.description).replace(/\s+/g, ' ').slice(0, 80);
  return data;
}

/**
 * Why a new item cannot be added, or null: once the Punch phase of the isometric is Passed no item can be added, except
 * a Punch item (not Pre-punch) by a full access account. INFERRED: "full access" is the workspace administrator.
 */
export function punchAddRefusal(data: Record<string, unknown>, items: Row[], fullAccess: boolean): string | null {
  if (!text(data.isoId) || !punchPhasePassed(items, data.isoId, 'Punch')) return null;
  if (fullAccess && text(data.punchType) === 'Punch') return null;
  return fullAccess ? 'Punch is already Passed for this isometric. Only a Punch item can still be added.' : 'Punch is already Passed for this isometric. No more items can be added.';
}

/**
 * Why a write through the ordinary record API is refused in the hosted workspace, or null. Status, sign-off, approval
 * and numbering change only through the actions, and a passed item cannot be edited at all.
 */
export function punchWriteError(input: Record<string, unknown>, existing?: Row): string | null {
  if (existing && punchStatus(existing) === 'Passed') return 'A passed punch item cannot be edited.';
  for (const name of PUNCH_PROTECTED_FIELDS) {
    if (input[name] === undefined) continue;
    const unchanged = existing ? text(input[name]) === text(existing[name]) : name === 'status' && text(input[name]) === 'Open';
    if (!unchanged) return 'Use Mark as finished, Mark as Client approved or Remove to change the status.';
  }
  return null;
}

export interface FinishInput { signerType?: unknown; clientName?: unknown; company?: unknown; function?: unknown; inspectorId?: unknown; date?: unknown; note?: unknown; signMethod?: unknown }
/**
 * Errors of the finish sign-off. Client: the client name (company and function are optional). User: the signed-in
 * account signs; with a saved signature (`savedSignature`) that signature is used, without one the signature is drawn
 * or a signed PDF is attached. Inspection: an inspector from the personnel list. `signed` says whether the drawn
 * signature or the PDF is present.
 */
export function punchFinishErrors(input: FinishInput, signed: boolean, savedSignature = false): Record<string, string> {
  const errors: Record<string, string> = {};
  const type = text(input.signerType), method = text(input.signMethod);
  if (!SIGNER_TYPES.includes(type)) errors.signerType = 'Choose who signs: Client, User or Inspection.';
  if (type === 'Client' && !text(input.clientName)) errors.clientName = PUNCH_MESSAGES.clientName;
  if (type === 'Inspection' && !text(input.inspectorId)) errors.inspectorId = PUNCH_MESSAGES.inspector;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(input.date))) errors.date = 'Enter the sign-off date.';
  if (method === 'Saved signature') { if (type !== 'User' || !savedSignature) errors.signMethod = PUNCH_MESSAGES.noSavedSignature; }
  else if (!SIGN_METHODS.includes(method)) errors.signMethod = 'Choose how the sign-off is given.';
  else if (!signed) errors.signMethod = method === 'Drawn' ? PUNCH_MESSAGES.signature : 'Choose the signed PDF.';
  for (const name of ['clientName', 'company', 'function', 'note'] as const) if (text(input[name]).length > (name === 'note' ? 2000 : 200)) errors[name] = 'This is too long.';
  return errors;
}
