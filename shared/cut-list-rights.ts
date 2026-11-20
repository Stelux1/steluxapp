import { COMPLETED_CUT_LIST_AREA, canScope, isAdministrator } from './permissions.ts';
import type { User } from './types.ts';

/**
 * Who may change a completed cut list (owner, 20.11.2026): administrators, and accounts whose profile ticks Edit on the area
 * "Edit completed cut lists" (shared/permissions.ts). A profile of module levels has no such box, so there only administrators
 * may; the right never follows from the materials level. The server checks it (server/cut-list-revisions.ts); every such
 * change needs a reason and is logged.
 */
export const canEditCompletedCutList = (user: User) => isAdministrator(user) || Boolean(user.capabilities) && canScope(user, COMPLETED_CUT_LIST_AREA, 'edit');
