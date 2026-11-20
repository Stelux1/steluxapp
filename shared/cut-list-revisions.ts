/**
 * Cut list revisions (client, 20.11.2026: "Completing and automatic generation", "Revisions – Cut List Revision", "Changes of norms").
 *
 * Every isometric's cut list lives in revisions Rev. 00, Rev. 01, … (`cut_list_revisions`); a line (`cut_list`) points at its
 * revision with `revisionId`. A line saved before revisions existed has none: it belongs to the isometric's Rev. 00, which is
 * a draft until it is completed (the record itself is made when it is completed or a revision is created, server/cut-list-revisions.ts).
 *
 *   Draft      lines are edited as before; take-offs come from the fitting catalog (Cut list standards) as it is now, or, for
 *              a revision made with "Keep Previous Standards", from the norms the source revision used.
 *   Completed  the program has generated the PDF (Attachments of the isometric), stored a snapshot of the norms and lines and
 *              locked the lines: only administrators and accounts with "Edit completed cut lists" change them, with a reason.
 *
 * Only the newest revision of an isometric is the current one; a new revision is made only once the current one is completed.
 * Pure rules shared by the client and the server.
 */
import type { Row } from './types.ts';

export const CUT_LIST_REVISION_STATUSES = ['Draft', 'Completed'] as const;
export const CUT_LIST_REVISION_SOURCES = ['First', 'Copy', 'New'] as const;
export const CUT_LIST_STANDARDS_MODES = ['Latest', 'Keep'] as const;
export type CutListRevisionMode = 'copy' | 'new';
export type CutListStandardsChoice = 'keep' | 'latest';

const two = (value: unknown) => String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(2, '0');
/** "Rev. 00", "Rev. 01", … */
export const revisionLabel = (revNo: unknown) => `Rev. ${two(revNo)}`;
/** The document type of the generated PDF in the isometric's Attachments: "Cut list Rev 00" (an amendment adds its number). */
export const revisionDocumentType = (revNo: unknown, amendment = 0) => `Cut list Rev ${two(revNo)}${amendment > 0 ? ` (amendment ${amendment})` : ''}`;
/** The file name of the generated PDF. */
export const revisionFileName = (isoNo: unknown, revNo: unknown, amendment = 0) => `Cut-list-${String(isoNo ?? 'isometric').replace(/[^A-Za-z0-9._-]+/g, '-')}-Rev-${two(revNo)}${amendment > 0 ? `-amendment-${amendment}` : ''}.pdf`;

export const LOCKED_REFUSAL = (label: string) => `${label} of this cut list is completed and locked. Create a new revision to change it; only an administrator or an account with the right "Edit completed cut lists" can correct a completed cut list, with a reason.`;
export const DRAFT_EXISTS = (label: string) => `${label} is still a draft. Complete it before creating a new revision.`;
export const REASON_REQUIRED = 'Enter the reason for changing a completed cut list.';

/** The revisions of an isometric, Rev. 00 first (archived ones are left out). */
export const isoRevisions = (revisions: readonly Row[] | null | undefined, isoId: unknown) => (revisions || []).filter(row => !row._archived && row.isoId === isoId).sort((a, b) => Number(a.revNo) - Number(b.revNo));
/** The current revision of an isometric: its newest one, or undefined while it has none (lines then form the draft Rev. 00). */
export const currentRevision = (revisions: readonly Row[] | null | undefined, isoId: unknown) => isoRevisions(revisions, isoId).at(-1);
/** The revision a line belongs to: its own, or (a line saved before revisions) the isometric's Rev. 00; '' while Rev. 00 has no record yet. */
export function lineRevisionId(line: Row | Record<string, unknown>, revisions: readonly Row[] | null | undefined): string {
  if (line.revisionId) return String(line.revisionId);
  return String(isoRevisions(revisions, line.isoId).find(row => Number(row.revNo) === 0)?.id ?? '');
}
/** Lines of one revision of an isometric (`revisionId` '' is the Rev. 00 without a record). */
export const revisionLines = <T extends Row>(lines: readonly T[], revisions: readonly Row[] | null | undefined, isoId: unknown, revisionId: string) => lines.filter(line => line.isoId === isoId && lineRevisionId(line, revisions) === revisionId);
/** Whether a line belongs to the current revision of its isometric (reports, the export and copies read only these). */
export function inCurrentRevision(line: Row, revisions: readonly Row[] | null | undefined) {
  const current = currentRevision(revisions, line.isoId);
  return lineRevisionId(line, revisions) === String(current?.id ?? '');
}
export const isCompleted = (revision: Row | undefined | null) => revision?.status === 'Completed';

/** The norms a completed revision used, or a "Keep Previous Standards" revision takes over: fitting id → its values then. */
export interface FittingSnapshot { code: string; name: string; description: string; diameter: string; takeoff: number }
export type StandardsSnapshot = Record<string, FittingSnapshot>;
/** One line as it was completed. */
export interface LineSnapshot {
  lineId: string; name: string; sheet: string; spool: string; spoolId: string; dia: string; material: string; schedule: string;
  totalLength: number | null; bevel: number | null; extraLength: number | null; fits: { id: string; code: string; takeoff: number }[];
  net: number | null; lengthMm: number; quantity: number;
}
export interface Amendment { at: string; byId: string; byName: string; reason: string; action: 'edit' | 'add' | 'delete' | 'restore'; line: string; attachmentId?: string }
export interface RevisionSnapshot {
  revision: string; completedAt: string; completedBy: string;
  project: string; projectNo: string; isoNo: string;
  standardsMode: string; fittings: StandardsSnapshot; lines: LineSnapshot[]; totalMm: number;
  amendments: Amendment[];
}
/** A stored JSON text read back; anything that is not an object reads as empty. */
export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string' || !text.trim()) return fallback;
  try { const value = JSON.parse(text); return value && typeof value === 'object' ? value as T : fallback; } catch { return fallback; }
}
export const revisionSnapshot = (revision: Row | undefined | null) => revision?.snapshot ? parseJson<RevisionSnapshot | null>(revision.snapshot, null) : null;
/**
 * The norms a revision's take-offs are fixed to: a completed revision its snapshot, a "Keep Previous Standards" draft the
 * norms of its source revision; null where the catalog as it is now applies (an "Apply Latest Standards" draft, Rev. 00).
 */
export function frozenStandards(revision: Row | undefined | null): StandardsSnapshot | null {
  if (!revision) return null;
  if (isCompleted(revision)) return revisionSnapshot(revision)?.fittings ?? parseJson<StandardsSnapshot>(revision.standards, {});
  return revision.standardsMode === 'Keep' ? parseJson<StandardsSnapshot>(revision.standards, {}) : null;
}
