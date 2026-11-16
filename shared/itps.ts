import type { Field, Row } from './types.ts';
import { itpNdtPercent, itpsForProject } from './itp-dashboard.ts';
import { isoTestSystemError } from './project-iso-forms.ts';

/**
 * ITPs page and Link ITP (Weld Pilot), built from the vendor manual (chapter "18. ITPs") and the reference's ITP
 * picker script (getCoverageState / getAllowedScopesForActiveSlot / applyItpByScope). Pure functions over plain rows:
 * the server applies them in server/itps.ts, the client mirrors them.
 */

export const ITP_SCOPES = ['Shop', 'Field', 'Shop+Field'] as const;
export type ItpScope = typeof ITP_SCOPES[number];
/** Attachments of an ITP that are one of its revisions carry this document type and a revision number (`revNo`). */
export const ITP_REVISION_DOCUMENT = 'ITP revision';
/** The isometric slot a Link ITP button belongs to: `any` = the ITPs card button, the ITP's scope chooses the slot. */
export type LinkSlot = 'any' | 'primary' | 'secondary';
export const X_RAY_READONLY = 'X Ray % is taken from the linked ITP. It cannot be edited here.';

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);

/** Scope of a register entry; an entry without one counts as Shop+Field (the reference's default `both`). */
export function itpScope(itp: Row | Record<string, unknown> | undefined | null): ItpScope {
  const value = text(itp?.scope).toLowerCase();
  return value === 'shop' ? 'Shop' : value === 'field' ? 'Field' : 'Shop+Field';
}
/** Entries are active unless switched off (older entries have no flag). */
export const itpActive = (itp: Row | undefined | null) => Boolean(itp) && itp!.active !== false;

const linked = (iso: Row | Record<string, unknown>, field: 'itpId' | 'itp2Id', itps: Row[]) => { const id = text(iso[field]); return id ? itps.find(row => row.id === id) ?? null : null; };

/** Which domains the linked ITPs of an isometric cover (reference getCoverageState); free-text numbers do not count. */
export function itpCoverage(iso: Row | Record<string, unknown>, itps: Row[]) {
  const primary = linked(iso, 'itpId', itps), secondary = linked(iso, 'itp2Id', itps);
  const primaryScope = primary ? itpScope(primary) : null;
  const coversShop = primaryScope === 'Shop' || primaryScope === 'Shop+Field';
  const coversField = primaryScope === 'Shop+Field' || Boolean(secondary && itpScope(secondary) === 'Field');
  return { primary, secondary, coversShop, coversField, complete: coversShop && coversField, both: primaryScope === 'Shop+Field' };
}

/** Scopes the picker offers for a slot (reference getAllowedScopesForActiveSlot). An empty list means: nothing to link. */
export function allowedScopes(iso: Row | Record<string, unknown>, itps: Row[], slot: LinkSlot): ItpScope[] {
  const state = itpCoverage(iso, itps);
  if (slot === 'any') {
    if (!state.primary && !state.secondary) return [...ITP_SCOPES];
    if (state.coversShop && !state.coversField) return ['Field'];
    if (!state.coversShop) return ['Shop', 'Shop+Field'];
    return [];
  }
  if (slot === 'primary') {
    if (!state.primary && !state.secondary) return [...ITP_SCOPES];
    if (state.secondary && itpScope(state.secondary) === 'Field') return ['Shop'];
    return ['Shop', 'Shop+Field'];
  }
  return state.both ? [] : ['Field'];
}

/** The ITPs card of an isometric: counter "1/1" or "n/2", whether the second slot shows and whether Link ITP is offered. */
export function itpSlots(iso: Row, itps: Row[]) {
  const state = itpCoverage(iso, itps);
  // Links count by their id, so a pilot that does not read the register (MTO Pilot) still shows them.
  const count = (text(iso.itpId) ? 1 : 0) + (text(iso.itp2Id) && !state.both ? 1 : 0);
  const max = state.both ? 1 : 2;
  // Shop+Field hides ITP No 2; a slot that still holds an older number stays visible so nothing disappears.
  return { count, max, counter: `${count}/${max}`, showSecond: !state.both || Boolean(text(iso.itpNo2)), canLink: allowedScopes(iso, itps, 'any').length > 0 };
}

/** Sort order first (entries without one last), then ITP No. */
export function itpOrder(a: Row, b: Row) {
  const order = (row: Row) => row.sortOrder === null || row.sortOrder === undefined || row.sortOrder === '' ? Number.POSITIVE_INFINITY : Number(row.sortOrder);
  const left = order(a), right = order(b);
  return (left === right ? 0 : left < right ? -1 : 1) || text(a.number).localeCompare(text(b.number), 'en', { numeric: true });
}

/**
 * Register entries the Link ITP picker offers for a slot: active, of an allowed scope, open to the isometric's project
 * (an entry linked to projects is limited to them) and not already linked to this isometric.
 */
export function itpPickerOptions(iso: Row, itps: Row[], projectLinks: Row[], slot: LinkSlot): Row[] {
  const scopes = allowedScopes(iso, itps, slot);
  return itpsForProject(itps, projectLinks, iso.projectId)
    .filter(itp => itpActive(itp) && scopes.includes(itpScope(itp)) && itp.id !== iso.itpId && itp.id !== iso.itp2Id)
    .sort(itpOrder);
}

/** The revisions of an entry (its PDF attachments), newest first. */
export function itpRevisions(itp: Row, attachments: Row[] | undefined): Row[] {
  return live(attachments).filter(file => file.entityType === 'itps' && file.entityId === itp.id && file.documentType === ITP_REVISION_DOCUMENT)
    .sort((a, b) => b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id));
}
/** Latest revision of an entry: the newest uploaded revision; entries without uploads (imported, older) show their stored number. */
export function itpLatest(itp: Row, attachments: Row[] | undefined): { revNo: string; file?: Row } {
  const file = itpRevisions(itp, attachments)[0];
  return file ? { revNo: text(file.revNo), file } : { revNo: text(itp.revision) };
}
/** Isometrics linking an entry in either slot. */
export const itpIsometrics = (itpId: string, isometrics: Row[] | undefined) => live(isometrics).filter(iso => iso.itpId === itpId || iso.itp2Id === itpId);

/** Picker line of the reference: "ITP No — Title [Scope] (Rev n)". */
export function itpPickerLabel(itp: Row, revNo: string) {
  const title = text(itp.title);
  return `${text(itp.number)}${title ? ` — ${title}` : ''} [${itpScope(itp)}]${revNo ? ` (Rev ${revNo})` : ''}`;
}

/** X Ray % text written to an isometric from an NDT % (14 → "14", 12.5 → "12.5"). */
export const xRayText = (percent: number) => String(Math.round(percent * 100) / 100);
/** X Ray % an isometric takes from its linked ITPs: slot 1's NDT %, otherwise slot 2's; null keeps the stored value. */
export function isoXRay(iso: Row | Record<string, unknown>, itps: Row[]): string | null {
  for (const field of ['itpId', 'itp2Id'] as const) { const percent = itpNdtPercent(linked(iso, field, itps)); if (percent !== null) return xRayText(percent); }
  return null;
}

export interface LinkResult { error?: string; values: Record<string, string> }
/**
 * Link one register entry to an isometric (reference applyItpByScope): Field fills ITP No 2; Shop fills ITP No;
 * Shop+Field fills ITP No and clears ITP No 2. The number and revision follow the entry, X Ray % its NDT %.
 */
export function linkItp(iso: Row, itp: Row | undefined, itps: Row[], projectLinks: Row[], slot: LinkSlot, latestRev: string): LinkResult {
  if (!itp || itp._archived) return { error: 'Choose an ITP from the list.', values: {} };
  if (!itpActive(itp)) return { error: `ITP ${text(itp.number)} is inactive. Choose an active ITP.`, values: {} };
  if (itp.id === iso.itpId || itp.id === iso.itp2Id) return { error: `ITP ${text(itp.number)} is already linked to this isometric.`, values: {} };
  if (!itpsForProject(itps, projectLinks, iso.projectId).some(row => row.id === itp.id)) return { error: `ITP ${text(itp.number)} is not linked to this isometric's project.`, values: {} };
  const scope = itpScope(itp), scopes = allowedScopes(iso, itps, slot);
  if (!scopes.includes(scope)) return { error: scopes.length ? `A ${scope} ITP cannot be linked here. Choose a ${scopes.join(' or ')} ITP.` : 'Both ITP slots are covered. Unlink an ITP first.', values: {} };
  const values: Record<string, string> = scope === 'Field'
    ? { itp2Id: itp.id, itpNo2: text(itp.number), ...(latestRev ? { itp2RevNo: latestRev } : {}) }
    : { itpId: itp.id, itpNo: text(itp.number), ...(latestRev ? { itpRevNo: latestRev } : {}), ...(scope === 'Shop+Field' ? { itp2Id: '', itpNo2: '' } : {}) };
  const xRay = isoXRay({ ...iso, ...values }, itps);
  return { values: xRay === null ? values : { ...values, xRay } };
}

/** Unlink one slot: the link goes; the number and revision stay as free text, and so does X Ray %. */
export const unlinkValues = (slot: 1 | 2): Record<string, string> => slot === 1 ? { itpId: '' } : { itp2Id: '' };

/**
 * Write rules for isometrics outside the Link ITP action (hosted profile): X Ray % cannot be typed, and a link
 * written through the record form must respect the slots (ITP No: Shop or Shop+Field; ITP No 2: Field, and empty
 * next to Shop+Field). Returns field errors; only changed values are judged.
 */
export function isoWriteErrors(input: Record<string, unknown>, existing: Row | undefined, itps: Row[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.xRay !== undefined && text(input.xRay) !== text(existing?.xRay)) errors.xRay = X_RAY_READONLY;
  const testSystem = isoTestSystemError(input, existing); if (testSystem) errors.testSystemId = testSystem;
  const changed = (field: 'itpId' | 'itp2Id') => input[field] !== undefined && text(input[field]) !== text(existing?.[field]) && Boolean(text(input[field]));
  const next = { ...existing, ...input };
  const primary = linked(next, 'itpId', itps), secondary = linked(next, 'itp2Id', itps);
  if (changed('itpId') && primary && itpScope(primary) === 'Field') errors.itpId = `ITP ${text(primary.number)} is a Field ITP. It belongs in ITP No 2.`;
  if (changed('itp2Id') && secondary && itpScope(secondary) !== 'Field') errors.itp2Id = `ITP ${text(secondary.number)} is a ${itpScope(secondary)} ITP. ITP No 2 takes a Field ITP.`;
  if ((changed('itpId') || changed('itp2Id')) && !errors.itp2Id && primary && secondary && itpScope(primary) === 'Shop+Field') errors.itp2Id = `ITP ${text(primary.number)} covers Shop+Field. ITP No 2 stays empty.`;
  return errors;
}

/** Revision upload checks (Add ITP and Upload revision). */
export function revisionErrors(revNo: unknown, file: { name: string } | undefined, existing: Row[] = []): Record<string, string> {
  const errors: Record<string, string> = {};
  const number = text(revNo);
  if (!number) errors.revNo = 'Revision number is required.';
  else if (number.length > 20) errors.revNo = 'Revision number is too long.';
  else if (existing.some(row => text(row.revNo).toLowerCase() === number.toLowerCase())) errors.revNo = `Revision ${number} already exists for this ITP.`;
  if (!file) errors.file = 'Choose the PDF of the revision.';
  else if (!/\.pdf$/i.test(file.name)) errors.file = 'Choose a PDF file.';
  return errors;
}

/** Why an entry cannot be deleted (manual: refused while isometrics are linked), or '' when it can. */
export function itpDeleteRefusal(itp: Row, isometrics: Row[]): string {
  const count = itpIsometrics(itp.id, isometrics).length;
  return count ? `ITP ${text(itp.number)} is linked to ${count} ${count === 1 ? 'isometric' : 'isometrics'}. Unlink it from ${count === 1 ? 'that isometric' : 'those isometrics'} first, or set the ITP to inactive.` : '';
}

export interface ImportPlan { create: { number: string; scope: ItpScope; ndtPercent: number | null; revision: string }[]; link: { isoId: string; field: 'itpId' | 'itp2Id'; number: string }[] }
/**
 * Import from isometrics (one-time, manual): one entry per distinct ITP number on the isometrics that the register
 * does not hold yet, then the isometrics are linked to the entry of their number. A number found in ITP No becomes
 * a Shop ITP, one found only in ITP No 2 a Field ITP. NDT % and revision are taken over when every isometric carrying
 * the number agrees on one value; otherwise they stay empty. Slots that would break the slot rule keep their free text.
 */
export function importFromIsometrics(isometrics: Row[], itps: Row[]): ImportPlan {
  const key = (value: unknown) => text(value).toLowerCase();
  const known = new Set(live(itps).map(itp => key(itp.number)));
  const found = new Map<string, { number: string; primary: boolean; xRays: Set<string>; revisions: Set<string> }>();
  for (const iso of live(isometrics)) for (const [field, number, revision] of [['itpId', iso.itpNo, iso.itpRevNo], ['itp2Id', iso.itpNo2, iso.itp2RevNo]] as const) {
    if (!text(number) || text(iso[field]) || known.has(key(number))) continue;
    const entry = found.get(key(number)) ?? { number: text(number), primary: false, xRays: new Set<string>(), revisions: new Set<string>() };
    entry.primary ||= field === 'itpId'; entry.xRays.add(text(iso.xRay).replace(/\s*%$/, '')); entry.revisions.add(text(revision));
    found.set(key(number), entry);
  }
  const single = (values: Set<string>) => values.size === 1 ? [...values][0] : '';
  const create = [...found.values()].sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true })).map(entry => {
    const raw = single(entry.xRays), percent = Number(raw.replace(',', '.'));
    return { number: entry.number, scope: (entry.primary ? 'Shop' : 'Field') as ItpScope, ndtPercent: raw && Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null, revision: single(entry.revisions) };
  });
  const scopes = new Map(create.map(entry => [key(entry.number), entry.scope]));
  const link: ImportPlan['link'] = [];
  for (const iso of live(isometrics)) {
    if (!text(iso.itpId) && scopes.get(key(iso.itpNo)) === 'Shop') link.push({ isoId: iso.id, field: 'itpId', number: text(iso.itpNo) });
    if (!text(iso.itp2Id) && scopes.get(key(iso.itpNo2)) === 'Field' && key(iso.itpNo2) !== key(iso.itpNo)) link.push({ isoId: iso.id, field: 'itp2Id', number: text(iso.itpNo2) });
  }
  return { create, link };
}

/** Labels and rules of the hosted profile's isometric and ITP fields (reference wording; X Ray % read-only, one field only). */
const HOSTED_FIELDS: Record<string, Record<string, Partial<Field>>> = {
  isometrics: { xRay: { label: 'X Ray %', readonly: true, hint: 'Taken from the linked ITP.' }, ndtPercentage: { hidden: true } },
  itps: { number: { label: 'ITP No' }, ndtPercent: { label: 'X-Ray %', hint: 'Default X-Ray percentage. Linked isometrics take it as their X Ray %.' }, revision: { label: 'Latest Rev', hidden: true } },
};
export function itpHostedField(resource: string, field: Field): Field {
  const override = HOSTED_FIELDS[resource]?.[field.name];
  return override ? { ...field, ...override } : field;
}

/** Add ITP and Edit ITP dialogs (manual "Add ITP modal fields"; editing adds Sort order and Active, revisions are uploaded apart). */
export const ITP_ADD_FIELDS = ['number', 'title', 'description', 'scope', 'ndtPercent'] as const;
export const ITP_EDIT_FIELDS = ['number', 'title', 'description', 'scope', 'ndtPercent', 'sortOrder', 'active'] as const;
/** Columns of the ITPs page (manual "Columns / revision table"). */
export const ITP_COLUMNS = ['ITP No', 'Title', 'Scope', 'X Ray %', 'Latest Rev', 'Isometrics', 'Active', 'Options'] as const;
