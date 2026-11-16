import type { PermissionRules, PermissionVerb, Row } from './types.ts';

/**
 * Users, profiles and signatures of the hosted pilots as the reference shows them (labels, order, defaults, small rules).
 * Nothing here decides who may do what: the access rules stay in server/auth.ts, server/site-scope.ts,
 * server/release-access.ts and shared/permissions.ts.
 */

/** Column headings of the profile table's actions in the hosted profile (the reference tooltips). */
export const HOSTED_VERB_LABELS: Record<PermissionVerb, string> = { show: 'Show', insert: 'Insert', edit: 'Edit', delete: 'Delete', export: 'Export', import: 'Import', print: 'Print' };
export const SELECT_ALL_LABEL = 'Select / deselect all';
/** The 'Filter app' select of the profile form; only our two applications (the reference lists its other apps too). */
export const PROFILE_APP_FILTER = [{ value: '', label: 'All apps' }, { value: 'mto', label: 'MTOPilot' }, { value: 'weld', label: 'WeldPilot' }] as const;
export const PILOT_BADGES: Record<string, { letter: string; title: string }> = { weld: { letter: 'W', title: 'WeldPilot' }, mto: { letter: 'M', title: 'MTOPilot' } };
/** The sample profile every new account starts with (reference: the first profile of the list). */
export const FULL_RIGHTS_PROFILE = 'Full rights';

/** The areas of the profile table: one list sorted by name across both applications, filtered by application. */
export function hostedProfileAreas<T extends { key: string; name: string }>(areas: T[], pilotsOf: (key: string) => string[], filter: string, query = ''): T[] {
  const needle = query.trim().toLowerCase();
  return areas.filter(area => { const pilots = pilotsOf(area.key); return pilots.length > 0 && (!filter || pilots.includes(filter)) && (!needle || area.name.toLowerCase().includes(needle)); })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.key.localeCompare(b.key, 'en', { numeric: true }));
}

/** The profile a new account's application starts with: 'Full rights' where the workspace has it, else the first profile by name. */
export function defaultPilotProfileId(profiles: { id: string; name?: unknown }[]): string {
  const sorted = [...profiles].sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));
  return String((sorted.find(row => String(row.name).trim().toLowerCase() === FULL_RIGHTS_PROFILE.toLowerCase()) ?? sorted[0])?.id ?? '');
}

/** The profiles a new account's form starts with: 'Full rights' (else the first profile) for the account and for each application. */
export function newUserProfileDefaults(profiles: { id: string; name?: unknown }[]): Record<string, string> {
  const id = defaultPilotProfileId(profiles);
  return id ? { profileId: id, weldProfileId: id, mtoProfileId: id } : {};
}

/** User list of the hosted profile: it shows the active accounts; 'Show inactive' lists the deactivated ones instead. */
export const accountListed = (row: Record<string, unknown>, showInactive: boolean) => (row.active === false) === showInactive;

/** The order of the application blocks in the user form (reference: MTOPilot first, then WeldPilot). */
export const USER_APPLICATION_ORDER = ['mto', 'weld'] as const;
const SPECIFIC_SITES = 'Specific project site(s)';

/**
 * A new account of the hosted pilots starts with no application ticked (reference); an account saved before keeps what it
 * has (a missing flag reads as enabled, shared/release.ts projectRow). Fills the flags a new account's request leaves out.
 */
export function withNewUserDefaults(body: Record<string, unknown>): Record<string, unknown> {
  for (const pilot of USER_APPLICATION_ORDER) if (body[`${pilot}Enabled`] === undefined) body[`${pilot}Enabled`] = false;
  return body;
}

/**
 * An application that is ticked needs a profile (reference: Profile is required once Enabled is ticked). With
 * 'Specific project site(s)' the profile is chosen per project site instead. The account's permission profile counts
 * as that profile where no pilot profile is chosen, because the server works under it there (server/auth.ts
 * `effectiveProfileId`); the hosted form always sends a pilot profile. A change that touches neither the flag nor the
 * profile of an application is not checked, so an older account can still be edited.
 */
export function pilotProfileErrors(body: Record<string, unknown>, existing?: Row): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const pilot of USER_APPLICATION_ORDER) {
    const flag = `${pilot}Enabled`, profile = `${pilot}ProfileId`, scope = `${pilot}SiteScope`;
    if (existing && body[flag] === undefined && body[profile] === undefined && body[scope] === undefined) continue;
    const enabled = body[flag] ?? existing?.[flag] ?? (existing ? true : false);
    if (enabled !== true || String(body[scope] ?? existing?.[scope] ?? '') === SPECIFIC_SITES) continue;
    if (!String(body[profile] ?? existing?.[profile] ?? '').trim() && !String(body.profileId ?? existing?.profileId ?? '').trim()) errors[profile] = 'Choose a profile.';
  }
  return errors;
}

/** The request that copies a profile under a new name (reference: 'Duplicate profile'): same rights, same description. */
export function duplicateProfileData(source: Row, name: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { name: name.trim(), description: String(source.description ?? '').trim() || name.trim(), permissionMode: source.permissionMode, permissionRules: source.permissionRules };
  for (const module of ['general', 'materials', 'welding', 'tools', 'settings']) copy[`${module}Permission`] = source[`${module}Permission`];
  return copy;
}

/** The rights of a profile as 'show/insert/…' counts for a summary line. */
export const countRules = (rules: PermissionRules) => Object.values(rules).reduce((total, verbs) => total + verbs.length, 0);

/** Signature composition (client/signatures.tsx): where the background image goes on the 800 x 200 canvas. */
export const BACKGROUND_SIZES = [{ value: 25, label: 'Small (25%)' }, { value: 50, label: 'Medium (50%)' }, { value: 75, label: 'Large (75%)' }, { value: 100, label: 'Full (100%)' }] as const;
export const BACKGROUND_HORIZONTAL = [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] as const;
export const BACKGROUND_VERTICAL = [{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }] as const;
export interface BackgroundPlacement { size: number; horizontal: 'left' | 'center' | 'right'; vertical: 'top' | 'center' | 'bottom' }
export const DEFAULT_BACKGROUND: BackgroundPlacement = { size: 50, horizontal: 'center', vertical: 'center' };
/** The rectangle the image is drawn in: as large as `size` percent of the canvas allows with its proportions kept, then aligned. */
export function backgroundRect(canvas: { width: number; height: number }, image: { width: number; height: number }, placement: BackgroundPlacement) {
  const scale = Math.min(canvas.width * placement.size / 100 / Math.max(1, image.width), canvas.height * placement.size / 100 / Math.max(1, image.height));
  const width = image.width * scale, height = image.height * scale;
  const x = placement.horizontal === 'left' ? 0 : placement.horizontal === 'right' ? canvas.width - width : (canvas.width - width) / 2;
  const y = placement.vertical === 'top' ? 0 : placement.vertical === 'bottom' ? canvas.height - height : (canvas.height - height) / 2;
  return { x, y, width, height };
}
/** The name under the signature as the reference burns it into the picture: 40 px, centred at the bottom, in the pen colour. */
export const NAME_OVERLAY = { fontSize: 40, fontFamily: 'Verdana, Arial, sans-serif', color: '#061b42', margin: 6 } as const;
export function nameOverlayPlacement(canvas: { width: number; height: number }) { return { x: canvas.width / 2, y: canvas.height - NAME_OVERLAY.margin }; }
