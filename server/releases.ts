import type { Row } from '../shared/types.ts';
import { RELEASE_PHASES, activeRelease, fwpAccepts, releaseCheck, releaseDocumentData, type ReleasePhase } from '../shared/releases.ts';
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
 * The `release` action. A Prefab or Field release is created only when nothing blocks the phase and the phase is not
 * released already; the whole batch is one transaction, so a blocked isometric stops every record of the request.
 * Each record keeps who released and when, the numbering of the main project's Document settings and its signature block titles.
 * Hydrotest records keep their earlier behaviour (no checks) and get the same document data.
 * The system actor (sample data, imports of historic releases) is not checked.
 */
export function releaseIsometrics(store: Store, data: Input, actor: Actor, defaults: { date: string; note: string }): ActionResult {
  const type = str(data.type);
  if (!['Prefab', 'Field', 'Hydrotest'].includes(type)) throw new AppError(422, 'Choose a release type.');
  const reportNo = str(data.reportNo); if (!reportNo) throw new AppError(422, 'Enter a report number.');
  if (data.engineerId) store.get('qa_engineers', data.engineerId);
  if (data.signatureId) {
    const signature = store.get('signatures', data.signatureId);
    // Hosted rule: a signature belongs to its account (shared/permissions.ts), and the release document prints its
    // image, so a release may only carry the releasing account's own signature.
    if (store.hostedRules && actor.id !== SYSTEM.id && signature.userId !== actor.id) throw new AppError(403, 'You can only sign a release with your own signature.', { signatureId: 'Choose one of your own signatures.' });
  }
  const isometrics = ids(data.isoIds, 'isometric').map(id => store.get('isometrics', id));
  if (type !== 'Hydrotest' && actor.id !== SYSTEM.id) {
    const phase = type as ReleasePhase;
    const refused = isometrics.flatMap(iso => {
      if (activeRelease(store.list('releases'), iso.id, phase)) return [{ iso, message: `${phase} is already released.` }];
      const check = checkOf(store, iso, phase);
      return check.ready ? [] : [{ iso, message: check.reasons[0].message + (check.reasons.length > 1 ? ` (and ${check.reasons.length - 1} more)` : '') }];
    });
    if (refused.length) {
      const shown = refused.slice(0, 3).map(item => `${isoName(item.iso)}: ${item.message}`).join(' ');
      throw new AppError(422, `Nothing was released. ${shown}${refused.length > 3 ? ` ${refused.length - 3} more isometrics are blocked.` : ''}`);
    }
  }
  const number = store.next(type === 'Hydrotest' ? 'HYDRO' : 'REL'); const now = new Date().toISOString();
  const created = isometrics.map(iso => store.create('releases', {
    number, isoId: iso.id, type, reportNo, date: defaults.date, engineerId: data.engineerId || '', signatureId: data.signatureId || '', note: defaults.note,
    status: 'Released', releasedBy: actor.name, releasedAt: now, ...releaseDocumentData(siteOf(store, iso), iso),
  }, actor));
  for (const record of created) store.audit('releases', record.id, 'released', `${type} release ${number} · ${reportNo}`, actor);
  return { resource: 'releases', records: created };
}

/** The `reopen-release` action: the phase's release becomes inactive (its welds unlock) and keeps the reason, who and when. */
export function reopenRelease(store: Store, data: Input, actor: Actor): ActionResult {
  const type = str(data.type);
  if (!(RELEASE_PHASES as readonly string[]).includes(type)) throw new AppError(422, 'Choose the prefab or the field release.', { type: 'Choose Prefab or Field.' });
  const reason = str(data.reason);
  if (!reason) throw new AppError(422, 'Enter the reason for reopening.', { reason: 'A reason is required.' });
  if (reason.length > REOPEN_REASON_LIMIT) throw new AppError(422, `The reason can have at most ${REOPEN_REASON_LIMIT} characters.`, { reason: `Use at most ${REOPEN_REASON_LIMIT} characters.` });
  if (data.date) validDate(data.date);
  const iso = store.get('isometrics', data.isoId);
  const releases = store.list('releases');
  const release = activeRelease(releases, iso.id, type);
  if (!release) throw new AppError(422, `The ${type.toLowerCase()} release of ${isoName(iso)} is not active, so there is nothing to reopen.`);
  if (type === 'Prefab' && activeRelease(releases, iso.id, 'Field')) throw new AppError(422, `Reopen the field release of ${isoName(iso)} first: it depends on the prefab release.`);
  const record = store.update('releases', release.id, { status: 'Reopened', reopenedAt: new Date().toISOString(), reopenedBy: actor.name, reopenReason: reason }, release._version, actor);
  store.audit('releases', release.id, 'reopened', `${type} release ${release.number} reopened · ${reason}`, actor);
  store.audit('isometrics', iso.id, 'reopened', `${type} release reopened · ${reason}`, actor);
  return { resource: 'releases', record };
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
