import type { Row } from '../shared/types.ts';
import { COMPLETION_FIELDS, ITP_MISSING, RELEASE_PHASES, activeRelease, fwpAccepts, nextReportNo, phaseCompleted, releaseCheck, releaseDocumentData, releaseItpOf, type ReleasePhase } from '../shared/releases.ts';
import { itpLatest } from '../shared/itps.ts';
import { AppError, SYSTEM, validDate, type Actor, type Store } from './store.ts';

type Input = Record<string, unknown>;
interface ActionResult { resource: string; record?: Row; records?: Row[]; }
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const ids = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(item => typeof item !== 'string' || !item)) throw new AppError(422, `Select at least one ${label}.`);
  return [...new Set(value)] as string[];
};
export const REOPEN_REASON_LIMIT = 500;

/** The main project (project site) an isometric belongs to, through its project; undefined when the chain is incomplete. */
function siteOf(store: Store, iso: Row): Row | undefined {
  try { return store.get('sites', store.get('projects', iso.projectId, true).siteId, true); } catch { return undefined; }
}
/*
 * Refusals use 422, not 409: the hosted profile masks every 409 with a generic sentence, and these messages are the
 * user's only way to see what blocks a release.
 */
/** What blocks releasing an isometric for a phase, from the stored rows (the server's own copy of the rule the pages show). */
function checkOf(store: Store, iso: Row, type: ReleasePhase) {
  const welds = store.list('welds').filter(weld => weld.isoId === iso.id);
  const weldIds = new Set(welds.map(weld => weld.id));
  return releaseCheck(type, {
    iso, welds, weldTypes: store.list('weld_types'), results: store.list('inspection_results').filter(row => weldIds.has(String(row.weldId))),
    releases: store.list('releases'), punch: store.list('punchlists').filter(row => row.isoId === iso.id),
  });
}
const isoName = (iso: Row) => String(iso.isoNo || iso.id);

/**
 * The `release` action (the release document, "Release selected"). A Prefab or Field release is one document for one ITP:
 * the checked isometrics must all hold the chosen ITP in the phase's slot (Prefab: ITP No, Field: ITP No 2) and have
 * their phase completed and not released already; the whole batch is one transaction, so a blocked isometric stops every
 * record of the request. The report number is assigned automatically per main project and phase (00001, 00002 …) unless
 * one is sent (hydrotest, imports). Each record keeps who released and when, the ITP, and the numbering of the main
 * project's Document settings. Hydrotest records keep their earlier behaviour (a report number, no checks).
 * The system actor (sample data, imports of historic releases) is not checked.
 */
export function releaseIsometrics(store: Store, data: Input, actor: Actor, defaults: { date: string; note: string }): ActionResult {
  const type = str(data.type);
  if (!['Prefab', 'Field', 'Hydrotest'].includes(type)) throw new AppError(422, 'Choose a release type.');
  let reportNo = str(data.reportNo); if (!reportNo && type === 'Hydrotest') throw new AppError(422, 'Enter a report number.');
  if (data.engineerId) store.get('qa_engineers', data.engineerId);
  if (data.signatureId) {
    const signature = store.get('signatures', data.signatureId);
    // Hosted rule: a signature belongs to its account (shared/permissions.ts), and the release document prints its
    // image, so a release may only carry the releasing account's own signature.
    if (store.hostedRules && actor.id !== SYSTEM.id && signature.userId !== actor.id) throw new AppError(403, 'You can only sign a release with your own signature.', { signatureId: 'Choose one of your own signatures.' });
  }
  const isometrics = ids(data.isoIds, 'isometric').map(id => store.get('isometrics', id));
  let itp = '';
  if (type !== 'Hydrotest') {
    const phase = type as ReleasePhase; const releases = store.list('releases');
    if (actor.id !== SYSTEM.id) {
      // The release document follows the phase's Complete on the isometric: only completed isometrics are released.
      const refused = isometrics.flatMap(iso => {
        if (activeRelease(releases, iso.id, phase)) return [{ iso, message: `${phase} is already released.` }];
        if (!phaseCompleted(iso, phase, releases)) return [{ iso, message: `${phase} is not complete yet. Mark it ${phase} complete on the isometric first.` }];
        return releaseItpOf(iso, phase) ? [] : [{ iso, message: ITP_MISSING[phase] }];
      });
      if (refused.length) {
        const shown = refused.slice(0, 3).map(item => `${isoName(item.iso)}: ${item.message}`).join(' ');
        throw new AppError(422, `Nothing was released. ${shown}${refused.length > 3 ? ` ${refused.length - 3} more isometrics are blocked.` : ''}`);
      }
      // One document per ITP: the chosen ITP (or, without one, the single ITP all checked isometrics share).
      const held = [...new Set(isometrics.map(iso => releaseItpOf(iso, phase)))];
      itp = str(data.itp) || (held.length === 1 ? held[0] : '');
      if (!itp) throw new AppError(422, 'Choose one ITP first: the checked isometrics have different ITPs, and a release document is made per ITP.', { itp: 'Choose an ITP.' });
      const other = isometrics.filter(iso => releaseItpOf(iso, phase) !== itp);
      if (other.length) throw new AppError(422, `Nothing was released. ${other.slice(0, 3).map(iso => `${isoName(iso)}: ${phase === 'Prefab' ? 'ITP No' : 'ITP No 2'} is ${releaseItpOf(iso, phase)}, not the chosen ITP ${itp}.`).join(' ')}${other.length > 3 ? ` ${other.length - 3} more isometrics are blocked.` : ''}`, { itp: 'Release one ITP at a time.' });
      if (new Set(isometrics.map(iso => siteOf(store, iso)?.id ?? '')).size > 1) throw new AppError(422, 'Release the isometrics of one main project at a time.');
    } else itp = str(data.itp) || releaseItpOf(isometrics[0], phase);
    if (!reportNo) {
      const site = siteOf(store, isometrics[0])?.id ?? '', siteOfIso = new Map<string, string>();
      const inSite = (release: Row) => { const key = String(release.isoId); if (!siteOfIso.has(key)) { let id = ''; try { id = siteOf(store, store.get('isometrics', key, true))?.id ?? ''; } catch { id = ''; } siteOfIso.set(key, id); } return siteOfIso.get(key) === site; };
      reportNo = nextReportNo(store.list('releases', true), type, inSite);
    }
  }
  const itpEntry = itp ? store.list('itps').find(entry => String(entry.number) === itp) : undefined;
  const itpRev = itpEntry ? itpLatest(itpEntry, store.list('attachments')).revNo : '';
  const number = store.next(type === 'Hydrotest' ? 'HYDRO' : 'REL'); const now = new Date().toISOString();
  const created = isometrics.map(iso => store.create('releases', {
    number, isoId: iso.id, type, reportNo, date: defaults.date, engineerId: data.engineerId || '', signatureId: data.signatureId || '', note: defaults.note,
    status: 'Released', releasedBy: actor.name, releasedAt: now, ...(type === 'Hydrotest' ? {} : { itp, itpRev }), ...releaseDocumentData(siteOf(store, iso), iso),
  }, actor));
  for (const record of created) store.audit('releases', record.id, 'released', `${type} release ${number} · ${reportNo}${itp ? ` · ${itp}` : ''}`, actor);
  return { resource: 'releases', records: created };
}

const phaseOf = (data: Input) => {
  const type = str(data.type);
  if (!(RELEASE_PHASES as readonly string[]).includes(type)) throw new AppError(422, 'Choose the prefab or the field release.', { type: 'Choose Prefab or Field.' });
  return type as ReleasePhase;
};

/**
 * The `complete-phase` action ("Prefab complete" / "Field complete" on the isometric): a confirmation only. Refused
 * when the phase is completed already or not ready (`releaseCheck`: Field needs Prefab complete first; open punch
 * never holds it). It stores who and when on the isometric, which locks the phase's welds and lists the isometric
 * on the phase's release page. No release record and no number are made. The system actor is not checked.
 */
export function completePhase(store: Store, data: Input, actor: Actor): ActionResult {
  const type = phaseOf(data);
  const iso = store.get('isometrics', data.isoId);
  if (phaseCompleted(iso, type, store.list('releases'))) throw new AppError(422, `${isoName(iso)} is already ${type} complete.`);
  if (actor.id !== SYSTEM.id) {
    const check = checkOf(store, iso, type);
    if (!check.ready) throw new AppError(422, `${type} complete is not available for ${isoName(iso)}. ${check.reasons[0].message}${check.reasons.length > 1 ? ` (and ${check.reasons.length - 1} more)` : ''}`);
  }
  const fields = COMPLETION_FIELDS[type];
  const record = store.update('isometrics', iso.id, { [fields.at]: new Date().toISOString(), [fields.by]: actor.name }, iso._version, actor);
  store.audit('isometrics', iso.id, 'completed', `${type} complete`, actor);
  return { resource: 'isometrics', record };
}

/**
 * The `reopen-release` action ("Reopen" of Prefab / Field complete): the phase is no longer completed, its welds
 * unlock and the isometric leaves the phase's release page. A release document of the phase becomes Reopened and
 * keeps the reason, who and when. Prefab and Field reopen independently (reopening Prefab leaves Field completed).
 */
export function reopenRelease(store: Store, data: Input, actor: Actor): ActionResult {
  const type = phaseOf(data);
  const reason = str(data.reason);
  if (!reason) throw new AppError(422, 'Enter the reason for reopening.', { reason: 'A reason is required.' });
  if (reason.length > REOPEN_REASON_LIMIT) throw new AppError(422, `The reason can have at most ${REOPEN_REASON_LIMIT} characters.`, { reason: `Use at most ${REOPEN_REASON_LIMIT} characters.` });
  if (data.date) validDate(data.date);
  const iso = store.get('isometrics', data.isoId);
  const releases = store.list('releases');
  if (!phaseCompleted(iso, type, releases)) throw new AppError(422, `${isoName(iso)} is not ${type} complete, so there is nothing to reopen.`);
  const release = activeRelease(releases, iso.id, type);
  const fields = COMPLETION_FIELDS[type];
  const cleared = String(iso[fields.at] ?? '') || String(iso[fields.by] ?? '') ? store.update('isometrics', iso.id, { [fields.at]: '', [fields.by]: '' }, iso._version, actor) : iso;
  const record = release ? store.update('releases', release.id, { status: 'Reopened', reopenedAt: new Date().toISOString(), reopenedBy: actor.name, reopenReason: reason }, release._version, actor) : undefined;
  if (release) store.audit('releases', release.id, 'reopened', `${type} release ${release.number} reopened · ${reason}`, actor);
  store.audit('isometrics', iso.id, 'reopened', `${type} complete reopened · ${reason}`, actor);
  return record ? { resource: 'releases', record } : { resource: 'isometrics', record: cleared };
}

/** Plain record routes cannot write the completion fields: only the complete and reopen actions do. */
export function dropCompletionInput(key: string, input: unknown) {
  if (key !== 'isometrics' || !input || typeof input !== 'object') return;
  for (const fields of Object.values(COMPLETION_FIELDS)) { delete (input as Input)[fields.at]; delete (input as Input)[fields.by]; }
}

/** The `assign-fwp` action: set (or, without a package, clear) the field work package of the checked isometrics, all or nothing. */
export function assignFieldPackage(store: Store, data: Input, actor: Actor): ActionResult {
  const isometrics = ids(data.isoIds, 'isometric').map(id => store.get('isometrics', id));
  const packageId = str(data.fieldPackageId);
  const fieldPackage = packageId ? store.get('field_packages', packageId) : undefined;
  const wrong = isometrics.filter(iso => !fwpAccepts(fieldPackage, iso));
  if (wrong.length) throw new AppError(422, `${fieldPackage!.name} belongs to another project than ${wrong.slice(0, 3).map(isoName).join(', ')}${wrong.length > 3 ? ` and ${wrong.length - 3} more` : ''}.`, { fieldPackageId: 'Choose a package of the same project.' });
  const records = isometrics.map(iso => iso.fieldPackageId === packageId || (!iso.fieldPackageId && !packageId) ? iso : store.update('isometrics', iso.id, { fieldPackageId: packageId }, iso._version, actor));
  return { resource: 'isometrics', records };
}
