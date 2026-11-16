import type { Row } from './types.ts';

/**
 * ITP / KNR register rules (Weld Pilot). The reference's ITP pages were not accessible, so everything here is
 * built from what is visible elsewhere (the two ITP slots on the isometric, the ITP/KNR % of the dashboard).
 * Pure functions over plain rows; the server applies them when an isometric is saved.
 */

/** NDT % used for welds whose isometric has no linked ITP / KNR (reference: 10 %). */
export const DEFAULT_NDT_PERCENT = 10;

/** The two ITP slots of an isometric: free-text number and revision, plus the optional register link. */
export const ITP_SLOTS = [
  { slot: 1, kind: 'ITP', link: 'itpId', number: 'itpNo', revision: 'itpRevNo', label: 'ITP No' },
  { slot: 2, kind: 'ITP 2', link: 'itp2Id', number: 'itpNo2', revision: 'itp2RevNo', label: 'ITP No 2' },
] as const;

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);

/** NDT % of a register entry; empty or invalid values count as "not set" (null). */
export function itpNdtPercent(itp: Row | undefined | null): number | null {
  if (!itp || itp.ndtPercent === null || itp.ndtPercent === undefined || itp.ndtPercent === '') return null;
  const value = Number(itp.ndtPercent);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

/**
 * Register entries a project may link: entries without any project link are open to every project, entries
 * with links only to the projects listed. Archived entries and links never count.
 */
export function itpsForProject(itps: Row[], links: Row[], projectId: unknown): Row[] {
  const project = text(projectId);
  const linked = (itp: Row) => live(links).filter(link => link.itpId === itp.id);
  return live(itps).filter(itp => { const entries = linked(itp); return !entries.length || entries.some(link => link.projectId === project); });
}

/**
 * The effective ITP / KNR of an isometric for the dashboard: slot 1, otherwise slot 2. Free-text numbers that
 * are not linked to the register carry no NDT %, so they do not count as linked.
 */
export function isoItpId(iso: Row | undefined | null): string {
  return text(iso?.itpId) || text(iso?.itp2Id);
}

export interface IsoItpLinks { errors: Record<string, string>; values: Record<string, string>; }
/**
 * Validates and completes the ITP links of an isometric being saved.
 * - a link must point at an active register entry open to the isometric's project;
 * - the two slots must not point at the same entry;
 * - a link copies the entry's number and (when it has one) revision into the slot, so the free-text fields and
 *   reports stay in step with the register. Clearing a link keeps the number and revision already shown.
 * `data` is the validated record about to be stored; `existing` the stored record when editing.
 */
export function isoItpLinks(data: Record<string, unknown>, itps: Row[], links: Row[], existing?: Row | null): IsoItpLinks {
  const errors: Record<string, string> = {}, values: Record<string, string> = {};
  const allowed = itpsForProject(itps, links, data.projectId);
  const chosen: string[] = [];
  for (const slot of ITP_SLOTS) {
    const id = text(data[slot.link]);
    // A link already stored stays as it is while the slot and the project are untouched, so unrelated edits never fail on it.
    if (!id || (existing && text(existing[slot.link]) === id && text(existing.projectId) === text(data.projectId))) { if (id) chosen.push(id); continue; }
    const itp = live(itps).find(row => row.id === id);
    if (!itp) { errors[slot.link] = 'Choose an active ITP / KNR from the register.'; continue; }
    if (!allowed.some(row => row.id === id)) { errors[slot.link] = `ITP / KNR ${text(itp.number)} is not linked to this isometric's project.`; continue; }
    if (chosen.includes(id)) { errors[slot.link] = 'The two ITP slots cannot use the same ITP / KNR.'; continue; }
    chosen.push(id);
    values[slot.number] = text(itp.number);
    if (text(itp.revision)) values[slot.revision] = text(itp.revision);
  }
  return { errors, values };
}

/** The isometrics linked to a register entry, with the values their slots must now show (after the entry was edited). */
export function itpSlotRefresh(itp: Row, isometrics: Row[]): { id: string; values: Record<string, string> }[] {
  const output: { id: string; values: Record<string, string> }[] = [];
  for (const iso of live(isometrics)) {
    const values: Record<string, string> = {};
    for (const slot of ITP_SLOTS) {
      if (iso[slot.link] !== itp.id) continue;
      if (text(iso[slot.number]) !== text(itp.number)) values[slot.number] = text(itp.number);
      if (text(itp.revision) && text(iso[slot.revision]) !== text(itp.revision)) values[slot.revision] = text(itp.revision);
    }
    if (Object.keys(values).length) output.push({ id: iso.id, values });
  }
  return output;
}
