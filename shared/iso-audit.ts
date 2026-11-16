import type { Row } from './types.ts';
import { orderedWelds } from './weld-entry.ts';

/**
 * Options → Audit trail of an isometric (reference: #showIsometricAuditTrail): the recorded changes of the isometric and
 * of its welds, newest first, with a "Weld no." filter (All + the welds in table order). Pure rules shared by the dialog
 * and the server route (server/iso-dialogs.ts).
 */
export const ISO_AUDIT_TITLE = 'Audit trail';
export const ISO_AUDIT_EMPTY = 'No audit entries for this isometric yet.';
export const ISO_AUDIT_FILTER_LABEL = 'Weld no.';
export const ISO_AUDIT_ALL = 'All';

const text = (value: unknown) => String(value ?? '').trim();

/** The filter's welds: those of the isometric in table order (deleted ones stay out of the list). */
export function auditWeldOptions(welds: Row[] | null | undefined, isoId: unknown): { id: string; label: string }[] {
  return orderedWelds((welds || []).filter(weld => weld.isoId === isoId && !weld._archived)).map(weld => ({ id: weld.id, label: text(weld.weldNo) }));
}

/**
 * The records whose history the trail reads: the isometric and the welds the account may read (every one of the
 * isometric, deleted ones included, or only the chosen one). A weld that does not belong to the isometric is an error.
 * @param readable the welds of the isometric the account may read; empty without the right to read welds.
 */
export function auditEntities(isoId: string, readable: Row[], weldId: string): { entities: { key: string; ids: string[] }[]; error: string } {
  if (weldId) {
    if (!readable.some(weld => weld.id === weldId)) return { entities: [], error: 'This weld is not part of the isometric.' };
    return { entities: [{ key: 'welds', ids: [weldId] }], error: '' };
  }
  return { entities: [{ key: 'isometrics', ids: [isoId] }, { key: 'welds', ids: readable.map(weld => weld.id) }], error: '' };
}
