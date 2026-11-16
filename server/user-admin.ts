import { canChangeRights, canResource, inheritedRules } from '../shared/permissions.ts';
import { SCOPE_PILOTS, siteProfilesField, siteProfilesOf } from '../shared/site-scope.ts';
import type { Row, User } from '../shared/types.ts';
import { effectiveProfileId, profileRights } from './auth.ts';
import { actorReach, allowedSites } from './site-scope.ts';
import { AppError, type Store } from './store.ts';

/**
 * Pilots profile: the writes on Users accounts (26) and Profiles (53) that change rights. The boxes of the two areas act
 * one by one (shared/permissions.ts `usersProfilesRight`); on top of them, and always on the server:
 * - an account's profile (any pilot, any project site) is set or changed only with Edit on both 26 and 53, and so is the
 *   password of another account (whoever sets it can sign in with that account's rights);
 * - the rights of a profile are changed only with Edit on both 26 and 53;
 * - nobody widens their own access: their own account's profile may only become narrower, their own application access
 *   is never switched on by themselves (their own project site access is refused in server/site-scope.ts), and the rights
 *   of a profile their own account uses may only become narrower;
 * - the last administrator stays (server/auth.ts `ensureAdministrator`) and passwords are never returned.
 */
export const RIGHTS_REFUSED = 'Changing the profile of an account or the rights of a profile needs the Edit right on both User accounts and Profiles.';
export const PASSWORD_REFUSED = 'Setting the password of another account needs the Edit right on both User accounts and Profiles.';
export const SELF_REFUSED = 'You cannot widen your own access. Ask another administrator.';
export const PROFILE_REACH_REFUSED = 'This profile is used by accounts that reach main projects outside your project site access. Ask an administrator with access to all project sites.';

const PROFILE_FIELDS = ['profileId', 'weldProfileId', 'mtoProfileId'];
const RIGHTS_FIELDS = ['permissionMode', 'permissionRules', 'generalPermission', 'materialsPermission', 'weldingPermission', 'toolsPermission', 'settingsPermission'];
const text = (value: unknown) => value === undefined || value === null ? '' : String(value);
const siteMaps = (row: Row | undefined) => SCOPE_PILOTS.map(pilot => JSON.stringify(siteProfilesOf(row?.[siteProfilesField(pilot)])));

/** Area/verb pairs a profile record grants (the whole matrix, before any pilot or release narrows it). */
function grants(profile: Row): Set<string> {
  const rights = profileRights(profile);
  const user: User = { id: '', name: '', email: '', profileId: String(profile.id), ...rights };
  return new Set(Object.entries(inheritedRules(user)).flatMap(([area, verbs]) => verbs.map(verb => `${area}:${verb}`)));
}
/** Whether profile `next` grants nothing that profile `previous` does not. */
export function profileWithin(next: Row, previous: Row): boolean { const allowed = grants(previous); return [...grants(next)].every(grant => allowed.has(grant)); }
const profileRow = (store: Store, id: string | null) => { if (!id) return undefined; try { return store.get('profiles', id, true); } catch { return undefined; } };
/** The profiles that apply to an account: per pilot, and per project site where it is limited. */
const profilesOf = (row: Row) => new Set([text(row.profileId), text(row.weldProfileId), text(row.mtoProfileId), ...SCOPE_PILOTS.flatMap(pilot => Object.values(siteProfilesOf(row[siteProfilesField(pilot)])))].filter(Boolean));

/**
 * Profiles are shared by every main project and both pilots (sec2-001): the rights of a profile are changed, and a profile
 * is archived or restored, only when every active account that uses it (as its profile, pilot profile or profile of a
 * project site) stays within the editor's own reach, the sec1-001 rule for accounts (`assertAccountReach`) applied to
 * every account of the profile. An administrator who reaches every main project in both pilots is never refused here.
 */
export function assertProfileUsersInReach(store: Store, actorId: string, profileId: string) {
  const actor = store.get('users', actorId);
  const reach = SCOPE_PILOTS.map(pilot => [pilot, actorReach(store, actor, pilot)] as const);
  if (reach.every(([, mine]) => mine === 'all')) return;
  for (const account of store.list('users')) {
    if (account.id === actorId || !profilesOf(account).has(profileId)) continue;
    for (const [pilot, mine] of reach) {
      if (mine === 'all' || account[`${pilot}Enabled`] === false) continue;
      const theirs = allowedSites(store, account, pilot);
      if (theirs === 'all' || [...theirs].some(id => !mine.has(id))) throw new AppError(403, PROFILE_REACH_REFUSED);
    }
  }
}

/** Before a user write: the password of another account needs the right to change rights. */
export function assertUserInput(actor: User, input: Record<string, unknown>, existing?: Row) {
  if (existing && existing.id !== actor.id && typeof input.password === 'string' && input.password && !canChangeRights(actor)) throw new AppError(403, PASSWORD_REFUSED);
}

/** Inside the write's transaction, on the record as saved (`before`: as it was; absent for a new record). */
export function assertRightsWrite(store: Store, actor: User, key: string, before: Row | undefined, after: Row) {
  if (key === 'users') {
    const changed = PROFILE_FIELDS.some(name => text(before?.[name]) !== text(after[name])) || JSON.stringify(siteMaps(before)) !== JSON.stringify(siteMaps(after));
    if (changed && !canChangeRights(actor)) throw new AppError(403, RIGHTS_REFUSED);
    if (!before || before.id !== actor.id) return;
    for (const pilot of SCOPE_PILOTS) {
      const was = effectiveProfileId(before, pilot), now = effectiveProfileId(after, pilot);
      if (now === was || now === null) continue;
      // Switching one's own application on, or moving to a profile that grants anything the old one did not, widens.
      const previous = profileRow(store, was), next = profileRow(store, now);
      if (!previous || !next || !profileWithin(next, previous)) throw new AppError(403, SELF_REFUSED);
    }
    const plain = (row: Row) => profileRow(store, text(row.profileId) || null);
    if (text(before.profileId) !== text(after.profileId)) { const previous = plain(before), next = plain(after); if (!previous || !next || !profileWithin(next, previous)) throw new AppError(403, SELF_REFUSED); }
    return;
  }
  if (key === 'profiles' && before) {
    if (!RIGHTS_FIELDS.some(name => text(before[name]) !== text(after[name]))) return;
    if (!canChangeRights(actor)) throw new AppError(403, RIGHTS_REFUSED);
    assertProfileUsersInReach(store, actor.id, before.id);
    const own = store.get('users', actor.id);
    if (profilesOf(own).has(before.id) && !profileWithin(after, before)) throw new AppError(403, SELF_REFUSED);
  }
}

/**
 * Project sites, "Archived" (last field of Project settings): ticked, the saved site is archived (it moves to the archived
 * list); the archived state is the record's own, so the value is taken out of the input. Returns whether it was ticked.
 */
export function siteArchiveInput(input: Record<string, unknown>): boolean {
  const ticked = input.archived === true;
  delete input.archived;
  return ticked;
}
/** Archiving through the checkbox needs the same right as the archive button (Delete on Project sites). */
export function assertSiteArchive(_store: Store, actor: User, site: Row) {
  if (!canResource(actor, 'sites', 'delete', site)) throw new AppError(403, 'Your permission profile does not allow this action.');
}
