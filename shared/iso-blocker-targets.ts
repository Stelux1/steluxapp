import type { BlockerTarget } from './iso-status.ts';
import { punchListLink } from './punch.ts';

/**
 * What a click on an item of "What blocks this isometric" opens (reference: the blockers menu of the isometric page):
 * the dialog that fixes the item, not the generic record view.
 *  - release: the Prefab / Field status line of the Status card (anchor #wsappsIsoRelease)
 *  - edit-weld: Edit weld of the weld, read-only with the lock banner when the weld is locked
 *  - ndt / ndt-pre: the NDT dialog of the weld
 *  - punch: the punch list filtered to the isometric (in a new tab)
 * Pure: the page maps the answer to its dialogs; a weld the account cannot read gives no action (the item stays text).
 */
export type BlockerOpening =
  | { dialog: 'release' }
  | { dialog: 'edit-weld'; weldId: string; /** True while the weld is locked: the dialog opens read-only. */ readOnly: boolean }
  | { dialog: 'ndt'; weldId: string; type: 'NDT' | 'NDT PRE' }
  | { dialog: 'punch'; url: string };

/** The id of the Prefab / Field status line on the Status card. */
export const RELEASE_STATUS_ANCHOR = 'iso-release-status';

/**
 * The punch list of the isometric, the link the reference gives (`page=punchlists&iso_id=…&project_id=…&punch_type=prepunch`):
 * the Punch lists page reads these filters from the address (shared/punch.ts `punchListLink`).
 */
export function punchListUrl(iso: { id: string; projectId?: unknown }, punchType: 'Pre-punch' | 'Punch' = 'Pre-punch') {
  return punchListLink({ isoId: String(iso.id), projectId: String(iso.projectId ?? ''), punchType });
}

/**
 * @param isLocked tells whether a weld is locked (shared/weld-entry.ts weldLock).
 * @returns null when the item has no target or names no weld it needs.
 */
export function blockerOpening(target: BlockerTarget | undefined, iso: { id: string; projectId?: unknown }, isLocked: (weldId: string) => boolean): BlockerOpening | null {
  if (!target) return null;
  switch (target.kind) {
    case 'release': return { dialog: 'release' };
    case 'punch': return { dialog: 'punch', url: punchListUrl(iso, target.punchType) };
    case 'edit-weld': return target.weldId ? { dialog: 'edit-weld', weldId: target.weldId, readOnly: isLocked(target.weldId) } : null;
    case 'ndt': return target.weldId ? { dialog: 'ndt', weldId: target.weldId, type: 'NDT' } : null;
    case 'ndt-pre': return target.weldId ? { dialog: 'ndt', weldId: target.weldId, type: 'NDT PRE' } : null;
  }
}
