import { Store, AppError, today, SYSTEM, type Actor } from './store.ts';
import { availableWps } from '../shared/welding.ts';
import type { Row } from '../shared/types.ts';
import { inOwnerSite } from '../shared/welder-data.ts';
import {
  MASS_EDIT_FIELDS, MASS_EDIT_MANDATORY_MESSAGE, WELD_ENTRY_FIELDS, WELD_SORTING_MESSAGES, certificateErrors, hasWelder, lockContext, massEditMissingFields, missingMandatoryFields, moveWeld, neighbourOf, normalizedNdtPercent,
  orderedWelds, planWeldRange, readMassEdit, weldLock, weldSortingDisabled, welderWpsErrors, wpsDiameterErrors, weldDiameterOf, EDIT_REASON_LABEL, EDIT_REASON_MAX, EDIT_TRACER_HINT, WELDERS, WELD_MANDATORY_MESSAGE, certificateSelectionErrors,
  diameterErrors, duplicateWelderErrors, editReason, specialWeldCleared, CERTIFICATE_NOT_SELECTABLE, NDT_LOCK_COMMENT_REQUIRED, ndtLock, ndtLockRefusal, ndtLockUseEditWeld,
} from '../shared/weld-entry.ts';
import { nonWeldCode } from '../shared/weld-codes.ts';
import { ndtOrPwhtInProgress } from '../shared/inspections.ts';
import { applyWeldSpool, weldSpoolChoice, type WeldSpoolChoice } from './spool-catalog.ts';

/**
 * Server side of the weld table and weld entry (Weld Pilot): the entry rules, the lock, and the actions behind the
 * Add weld / Edit weld form, Add welds (range), Mass edit welds and the table order. The rules themselves are pure
 * functions in `shared/weld-entry.ts`; this file only gathers the records they need and turns answers into errors.
 */
type Values = Record<string, unknown>;
export const WELD_ENTRY_ACTIONS = new Set(['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds', 'toggle-weld-sorting', 'stamp-weld']);

const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
const norm = (value: unknown) => value === undefined || value === null ? '' : JSON.stringify(value);
const changed = (input: Values, existing: Row | undefined, names: readonly string[]) => !existing || names.some(name => Object.hasOwn(input, name) && norm(input[name]) !== norm(existing[name]));
const fail = (errors: Record<string, string>) => {
  const { _: general, ...fields } = errors, messages = Object.values(fields);
  if (general && !messages.length) return new AppError(422, general);
  return new AppError(422, messages.length === 1 ? messages[0] : 'Please check the highlighted fields.', fields);
};

const lockContextOf = (store: Store) => lockContext(store.list('weld_types', true), store.list('releases'), store.list('isometrics', true));
function lockOf(store: Store, weld: Values) {
  return weldLock(weld, lockContextOf(store));
}
/** Lock rule (d), server side: a weld of a completed phase cannot change, be deleted or be brought back. */
export function assertWeldUnlocked(store: Store, weld: Values) {
  const lock = lockOf(store, weld);
  if (lock.locked) throw new AppError(423, lock.reason);
}

/**
 * The lock also covers the inspection results (NDT, NDT Pre, VI, Pre-HT / PWHT) of a completed phase: they cannot be
 * added, changed or removed until the phase is reopened, so a released document keeps what was released. The
 * system actor (sample data, imports) is not checked. One call at the top of every inspection result action.
 */
export function assertInspectionUnlocked(store: Store, key: string, data: Values, actor: Actor) {
  if (actor.id === SYSTEM.id) return;
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : typeof value === 'string' && value ? [value] : [];
  let weldIds: string[] = [];
  if (key === 'ndt-weld' || key === 'ndt-restart' || key === 'inspection-request-undo' || key === 'pwht-weld') weldIds = ids(data.weldId);
  else if (key === 'inspection-upload' || key === 'pwht-upload') weldIds = ids(data.weldIds);
  else if (key === 'visual-inspection') {
    weldIds = [...ids(data.weldIds), ...ids(data.accepted), ...ids(data.notAccepted), ...ids(data.notApplicable)];
    // Deleting a VT report takes the visual results of its welds with it, so its welds must be unlocked too.
    if (data.op === 'delete') for (const reportId of ids(data.reportIds)) { try { weldIds.push(...String(store.get('visual_reports', reportId, true).weldIds ?? '').split(',').filter(Boolean)); } catch { /* the action reports it */ } }
  }
  else if (key === 'inspection-result') { try { weldIds = ids(store.get('inspection_requests', data.requestId, true).weldId); } catch { return; } }
  else return;
  const context = lockContextOf(store);
  for (const id of new Set(weldIds)) {
    let weld: Row; try { weld = store.get('welds', id, true); } catch { continue; /* the action reports it */ }
    const lock = weldLock(weld, context);
    if (lock.locked) throw new AppError(423, `Weld ${String(weld.weldNo ?? '')}: ${lock.reason}`);
  }
}

/**
 * NDT lock (chat 17.11.2026, owner: administrators only): once a weld has an NDT request it stays as it is. An account
 * that is no administrator is refused; an administrator changes it only with a change comment (kept in the weld's
 * Previous edits, shown in Edit weld alone). `comment` is null where the route carries none (record routes): an
 * administrator is then sent to Edit weld. Returns whether the weld is locked (the caller stores the comment). The system
 * actor (sample data, imports) is not checked. Recording NDT results is no weld edit and is not checked here.
 */
export function assertNdtUnlocked(store: Store, weld: Row, actor: Actor, comment: string | null): boolean {
  if (actor.id === SYSTEM.id) return false;
  const lock = ndtLock(store.list('inspection_requests'), String(weld.id), actor.administrator === true);
  if (!lock.locked) return false;
  if (!lock.editable) throw new AppError(423, ndtLockRefusal(weld.weldNo));
  if (comment === null) throw new AppError(423, ndtLockUseEditWeld(weld.weldNo));
  if (!comment) throw new AppError(422, NDT_LOCK_COMMENT_REQUIRED);
  return true;
}
/** Deleting or bringing back a weld with an NDT request: administrators only (the delete dialog carries no comment). */
export function assertNdtRemovable(store: Store, weld: Row, actor: Actor) {
  if (actor.id === SYSTEM.id || actor.administrator === true) return;
  if (ndtLock(store.list('inspection_requests'), String(weld.id), false).locked) throw new AppError(423, ndtLockRefusal(weld.weldNo));
}

/**
 * The entry rules for a weld that is created or changed. `input` holds what the request sets; `existing` is the
 * stored weld. A rule is evaluated when the request creates the weld or touches a field the rule concerns, so an
 * unrelated edit of an older incomplete weld is not blocked by it.
 */
/**
 * `mode` says who writes: the Add / Edit weld form (`form`), the plain record routes (`record`), Mass edit (`mass`) or
 * the charge copied to a neighbour by Upd. prev. / next weld (`neighbour`). Mass edit may set the tracer flag and is
 * not held to the Dia. check (the reference's mass edit has neither rule); the copy to a neighbour is not either.
 */
export type WeldEntryMode = 'form' | 'record' | 'mass' | 'neighbour';
export function assertWeldEntry(store: Store, input: Values, existing?: Row, mode: WeldEntryMode = 'record') {
  const merged: Values = { ...existing, ...Object.fromEntries(Object.entries(input).filter(([name]) => name !== '_version')) };
  if (!merged.isoId) return;
  let iso: Row, project: Row, site: Row;
  try { iso = store.get('isometrics', merged.isoId, true); project = store.get('projects', iso.projectId, true); site = store.get('sites', project.siteId, true); }
  catch { return; }
  const errors: Record<string, string> = {};
  // (d) lock: the stored weld and the weld as it would become.
  const context = lockContextOf(store);
  for (const weld of existing ? [existing, merged] : [merged]) { const lock = weldLock(weld, context); if (lock.locked) throw new AppError(423, lock.reason); }
  // Tracer: ticked in Add weld and Mass edit (reference); Edit weld shows it disabled, so an edit cannot change it.
  if (existing && mode !== 'mass' && input.tracer !== undefined && Boolean(input.tracer) !== Boolean(existing.tracer)) errors.tracer = EDIT_TRACER_HINT;
  if (input.tracer !== undefined && typeof input.tracer !== 'boolean') errors.tracer = 'Choose Yes or No.';
  if (changed(input, existing, WELDERS)) Object.assign(errors, duplicateWelderErrors(merged));
  if (changed(input, existing, ['wpsId', 'isoId']) && merged.wpsId) {
    try {
      const wps = store.get('wps', merged.wpsId);
      if (wps.active === false && existing?.wpsId !== merged.wpsId) errors.wpsId = 'This procedure is inactive.';
      else if (!availableWps(Object.fromEntries(['projects', 'wps_projects', 'wps_sites'].map(key => [key, store.list(key)])), wps, String(project.id))) errors.wpsId = 'Select a procedure available for this project and site.';
    } catch { errors.wpsId = 'Choose an active WPS.'; }
  }
  // (a) mandatory fields
  // The mass edit has its own, smaller rule (massEditMissingFields).
  const missing = mode !== 'mass' && changed(input, existing, ['weldNo', 'typeId', 'wpsId', 'date', 'lengthMode', 'diameterId', 'dialen', 'chargeNo1', 'chargeNo2', 'certificate1Id', 'certificate2Id', 'welder1Id', 'welder2Id', 'welder3Id', 'welder4Id']) ? missingMandatoryFields(site, merged) : {};
  Object.assign(errors, missing);
  // (b) validation on WPS: the WPS's own diameter range (inches) holds the weld's diameter, and a welder's qualification listing the WPS holds it (mm).
  const diameter = weldDiameterOf(merged, store.list('diameters', true));
  if (changed(input, existing, ['wpsId', 'diameterId', 'lengthMode']) && merged.wpsId && !errors.wpsId) {
    let wps: Row | undefined; try { wps = store.get('wps', merged.wpsId, true); } catch { /* reported above */ }
    Object.assign(errors, wpsDiameterErrors(site, merged, wps, diameter));
  }
  if (changed(input, existing, ['welder1Id', 'welder2Id', 'welder3Id', 'welder4Id', 'wpsId', 'date', 'diameterId', 'lengthMode']) && hasWelder(merged) && merged.wpsId) {
    let wps: Row | undefined; try { wps = store.get('wps', merged.wpsId, true); } catch { /* reported above */ }
    const certificates = store.list('welder_certificates');
    Object.assign(errors, welderWpsErrors(site, merged, wps, id => certificates.filter(row => row.welderId === id), id => { try { return store.display('welders', store.get('welders', id, true)); } catch { return 'This welder'; } }, today(), diameter));
  }
  // (c) project certificates
  const sides = [1, 2].filter(side => changed(input, existing, [`certificate${side}Id`]) && merged[`certificate${side}Id`]);
  if (sides.length) {
    const certificates = store.list('certifications', true);
    // A certificate of another project is "not linked"; one of the project that is not Controlled + Accepted "cannot be selected".
    const linked = certificateErrors(site, merged, sides, store.list('certifications'), String(project.id), { links: store.list('certificate_projects') });
    Object.assign(errors, certificateSelectionErrors(merged, sides, certificates), linked);
  }
  // Dia. against the chosen certificates (with the Default diameter choice when the two differ).
  if ((mode === 'form' || mode === 'record') && changed(input, existing, ['weldNo', 'lengthMode', 'diameterId', 'chargeNo1', 'chargeNo2', 'certificate1Id', 'certificate2Id', 'defaultDiameter'])) {
    for (const [name, message] of Object.entries(diameterErrors(merged, { certificates: new Map(store.list('certifications', true).map(row => [row.id, row])), diameters: new Map(store.list('diameters', true).map(row => [row.id, row])) }))) errors[name] ??= message;
  }
  if (!Object.keys(errors).length) return;
  // Mass edit answers a certificate that is not both Controlled and Accepted with the form's sentence (the mass edit route names the weld).
  if (mode === 'mass' && Object.values(errors).includes(CERTIFICATE_NOT_SELECTABLE)) throw new AppError(422, CERTIFICATE_NOT_SELECTABLE, errors);
  // The form answers missing mandatory fields with the reference's one sentence; the fields are marked.
  if (mode === 'form' && Object.keys(missing).length) throw new AppError(422, WELD_MANDATORY_MESSAGE, errors);
  throw fail(errors);
}

/** Previous edits of Edit weld: the reasons entered when editing a weld with NDT or PWHT in progress, newest first. */
export const EDIT_REASON_ACTION = 'edit-reason';
export function weldEditHistory(store: Store, weldId: string): { date: string; comment: string; user: string }[] {
  const sequence = store.db.dialect === 'postgres' ? 'sequence' : 'rowid';
  const rows = store.db.prepare(`SELECT summary, actor_name, created_at FROM audit WHERE entity_type=? AND entity_id=? AND action=? ORDER BY ${sequence} DESC LIMIT 200`).all('welds', weldId, EDIT_REASON_ACTION) as Record<string, unknown>[];
  return rows.map(row => ({ date: String(row.created_at), comment: String(row.summary), user: String(row.actor_name) }));
}

const pick = (data: Values, names: readonly string[]) => Object.fromEntries(names.filter(name => data[name] !== undefined).map(name => [name, data[name]]));
const activeWelds = (store: Store, isoId: unknown) => store.list('welds').filter(weld => weld.isoId === isoId);
/** The main project of an isometric (its "Mandatory fields" setting decides the mass edit rule). */
function siteOfIso(store: Store, isoId: unknown): Row | undefined {
  try { const iso = store.get('isometrics', isoId, true); return store.get('sites', store.get('projects', iso.projectId, true).siteId, true); } catch { return undefined; }
}
const sortingOff = (store: Store, isoId: unknown) => { try { return weldSortingDisabled(store.get('isometrics', isoId, true)); } catch { return false; } };

/** The next stored order for an isometric; welds that have none yet are numbered first so the new one really comes last. */
function nextSortOrder(store: Store, isoId: unknown, actor: Actor) {
  const welds = orderedWelds(activeWelds(store, isoId));
  if (welds.some(weld => typeof weld.sortOrder !== 'number')) welds.forEach((weld, index) => { if (weld.sortOrder !== index + 1) store.update('welds', weld.id, { sortOrder: index + 1 }, weld._version, actor); });
  return Math.max(0, ...activeWelds(store, isoId).map(weld => Number(weld.sortOrder) || 0)) + 1;
}

export function runWeldEntryAction(store: Store, key: string, data: Values, actor: Actor) {
  return store.transaction(() => {
    if (key === 'save-weld') {
      const existing = data.weldId ? store.get('welds', data.weldId) : undefined;
      if (existing && data.isoId !== undefined && data.isoId !== existing.isoId) throw new AppError(422, 'A weld cannot move to another isometric.');
      if (existing && data.expectedVersion !== undefined && data.expectedVersion !== existing._version) throw new AppError(409, 'This weld changed since you opened it. Refresh and try again.');
      // Editing a weld with NDT or PWHT in progress needs a reason; it is kept in the weld's history (Previous edits).
      // The reason is no weld field, so its refusals carry no field hint (the form marks the reason box itself).
      if (data.note !== undefined && typeof data.note !== 'string') throw new AppError(422, 'Enter the reason for editing as text.');
      const reason = editReason(data.note);
      if (reason.length > EDIT_REASON_MAX) throw new AppError(422, `The reason for editing has at most ${EDIT_REASON_MAX} characters.`);
      // A weld with an NDT request: administrators only, with the reason as change comment (the phase lock answers first).
      if (existing) { assertWeldUnlocked(store, existing); assertNdtUnlocked(store, existing, actor, reason); }
      if (!existing && !data.isoId) throw new AppError(422, 'Choose an isometric.', { isoId: 'Isometric is required.' });
      const isoId = existing?.isoId ?? data.isoId;
      for (const flag of ['updatePrev', 'updateNext']) if (data[flag] !== undefined && typeof data[flag] !== 'boolean') throw new AppError(422, 'Choose Yes or No.', { [flag]: 'Choose Yes or No.' });
      const input: Values = pick(data, [...WELD_ENTRY_FIELDS, 'tracer']);
      // A GAP / SP / E / B number is no weld: the weld fields the form hides for it are ignored (stored empty).
      const code = nonWeldCode(input.weldNo ?? existing?.weldNo);
      if (code) for (const name of specialWeldCleared(code)) { if (Object.hasOwn(input, name) || (existing && input.weldNo !== undefined && present(existing[name]))) input[name] = ''; }
      // Spool select of the hosted form: a catalog name (shared/spool-catalog.ts), checked now; the isometric's spool is created on first use below.
      let spoolChoice: WeldSpoolChoice | undefined;
      if (data.spoolName !== undefined && !(code && specialWeldCleared(code).includes('spoolId'))) { spoolChoice = weldSpoolChoice(store, String(isoId), data.spoolName); delete input.spoolId; }
      if (!existing) for (const name of Object.keys(input)) if (input[name] === '' && name !== 'weldNo') delete input[name];
      const merged: Values = { ...existing, ...input, isoId };
      if (changed(input, existing, ['lengthMode', 'ndoReq', 'ndtpercent'])) { const percent = normalizedNdtPercent(merged); if (percent !== (merged.ndtpercent === '' || merged.ndtpercent === undefined ? null : merged.ndtpercent)) input.ndtpercent = percent === null ? '' : percent; }
      const defaultDiameter = data.defaultDiameter === undefined ? {} : { defaultDiameter: String(data.defaultDiameter) };
      assertWeldEntry(store, { ...input, isoId, ...defaultDiameter }, existing, 'form');
      // Neighbours in table order: this weld's charge goes to the adjoining side of the previous / next weld.
      const neighbours: { weld: Row; patch: Values; locked: boolean }[] = [];
      if (data.updatePrev === true || data.updateNext === true) {
        const order = orderedWelds(activeWelds(store, isoId), sortingOff(store, isoId)).map(weld => weld.id);
        const anchor = existing?.id ?? '', ids = existing ? order : [...order, ''];
        for (const [flag, which, from, to] of [['updatePrev', 'prev', 1, 2], ['updateNext', 'next', 2, 1]] as const) {
          if (data[flag] !== true) continue;
          const id = neighbourOf(ids, anchor, which); if (!id) continue;
          const weld = store.get('welds', id);
          const patch: Values = { [`chargeNo${to}`]: merged[`chargeNo${from}`] ?? '', [`certificate${to}Id`]: merged[`certificate${from}Id`] ?? '', [`material${to}Id`]: merged[`material${from}Id`] ?? '' };
          // The neighbour that gets the charge is changed too: its NDT lock applies, with this edit's comment.
          assertWeldUnlocked(store, weld);
          neighbours.push({ weld, patch, locked: assertNdtUnlocked(store, weld, actor, reason) });
        }
      }
      for (const { weld, patch } of neighbours) { assertWeldEntry(store, { ...patch, isoId: weld.isoId }, weld, 'neighbour'); }
      if (existing && !reason && ndtOrPwhtInProgress(store.list('inspection_requests'), existing.id)) throw new AppError(422, EDIT_REASON_LABEL);
      if (spoolChoice) { const spoolId = applyWeldSpool(store, spoolChoice, actor); if (existing ? spoolId !== String(existing.spoolId ?? '') : spoolId) input.spoolId = spoolId; }
      const record = existing ? store.update('welds', existing.id, input, existing._version, actor) : store.create('welds', { ...input, isoId, sortOrder: nextSortOrder(store, isoId, actor) }, actor);
      if (existing && reason) store.audit('welds', existing.id, EDIT_REASON_ACTION, reason, actor);
      const updated = neighbours.map(({ weld, patch, locked }) => { const row = store.update('welds', weld.id, patch, store.get('welds', weld.id)._version, actor); if (locked) store.audit('welds', weld.id, EDIT_REASON_ACTION, reason, actor); return row; });
      return { resource: 'welds', record, records: [record, ...updated] };
    }
    if (key === 'add-welds') {
      const iso = store.get('isometrics', data.isoId);
      if (data.diameterId) store.get('diameters', data.diameterId);
      let plan; try { plan = planWeldRange(data.start, data.end, store.list('welds').filter(weld => weld.isoId === iso.id).map(weld => String(weld.weldNo))); } catch (error) { throw new AppError(422, (error as Error).message); }
      if (!plan.numbers.length) throw new AppError(422, 'Every weld number in this range already exists.');
      let order = nextSortOrder(store, iso.id, actor);
      const created = plan.numbers.map(weldNo => { const input = { weldNo, isoId: iso.id, lengthMode: 'Diameter', diameterId: data.diameterId ?? '', sortOrder: order++ }; assertWeldEntry(store, input); return store.create('welds', input, actor); });
      return { resource: 'welds', records: created, skipped: plan.skipped };
    }
    if (key === 'mass-edit-welds') {
      const ids = Array.isArray(data.weldIds) ? data.weldIds : [];
      if (!ids.length || ids.length > 500 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) throw new AppError(422, 'Select between 1 and 500 unique welds.');
      if (!data.changes || typeof data.changes !== 'object' || Array.isArray(data.changes)) throw new AppError(422, 'Change at least one field.');
      const unknown = Object.keys(data.changes as Values).filter(name => !(MASS_EDIT_FIELDS as readonly string[]).includes(name) && !['clearDatefit', 'clearDate'].includes(name));
      if (unknown.length) throw new AppError(422, 'A field of the mass edit is not available.', Object.fromEntries(unknown.map(name => [name, 'This field cannot be mass edited.'])));
      const { changes, errors } = readMassEdit(data.changes as Values);
      if (Object.keys(errors).length) throw fail(errors);
      // The change comment for welds with an NDT request (administrators only); stored on each of those welds.
      if (data.note !== undefined && typeof data.note !== 'string') throw new AppError(422, 'Enter the change comment as text.');
      const comment = editReason(data.note);
      if (comment.length > EDIT_REASON_MAX) throw new AppError(422, `The change comment has at most ${EDIT_REASON_MAX} characters.`);
      const versions = (data.versions && typeof data.versions === 'object' ? data.versions : {}) as Record<string, unknown>;
      // Every weld is read first, so a weld the account may not reach is refused before any rule names another one.
      const welds = (ids as string[]).map(id => store.get('welds', id));
      const records = welds.map(weld => { const id = weld.id;
        if (versions[id] !== undefined && versions[id] !== weld._version) throw new AppError(409, `Weld ${weld.weldNo} changed since you opened it. Refresh and try again.`);
        let locked = false; try { assertWeldUnlocked(store, weld); locked = assertNdtUnlocked(store, weld, actor, comment); } catch (error) { if (error instanceof AppError && error.status === 422) throw new AppError(422, `Weld ${weld.weldNo}: ${error.message}`); throw error; }
        // The reference's rule comes first, as it does before the browser sends anything: Weld type, WPS, Weld Date and Dia. must be there when the mass edit sets a welder.
        if (massEditMissingFields(siteOfIso(store, weld.isoId), weld, changes).length) throw new AppError(422, MASS_EDIT_MANDATORY_MESSAGE);
        try { assertWeldEntry(store, changes, weld, 'mass'); } catch (error) { if (error instanceof AppError) throw new AppError(error.status, `Weld ${weld.weldNo}: ${error.message}`, error.fields); throw error; }
        const patch: Values = { ...changes }; const merged = { ...weld, ...patch };
        if (changed(patch, weld, ['lengthMode', 'ndoReq', 'ndtpercent'])) { const percent = normalizedNdtPercent(merged); if (percent === null && weld.ndtpercent !== undefined && weld.ndtpercent !== null && weld.ndtpercent !== '') patch.ndtpercent = ''; }
        const record = store.update('welds', weld.id, patch, weld._version, actor);
        if (locked) store.audit('welds', weld.id, EDIT_REASON_ACTION, comment, actor);
        return record;
      });
      return { resource: 'welds', records };
    }
    if (key === 'reorder-welds') {
      const iso = store.get('isometrics', data.isoId);
      const ids = Array.isArray(data.weldIds) ? data.weldIds as unknown[] : [];
      if (weldSortingDisabled(iso)) throw new AppError(409, WELD_SORTING_MESSAGES.off);
      const current = activeWelds(store, iso.id);
      if (ids.length !== current.length || new Set(ids).size !== ids.length || !current.every(weld => ids.includes(weld.id))) throw new AppError(409, 'The welds of this isometric changed. Refresh and try again.');
      // Moving welds changes the place of a weld with an NDT request only for administrators (the order carries no comment).
      if (actor.id !== SYSTEM.id && actor.administrator !== true) {
        const requests = store.list('inspection_requests');
        const before = orderedWelds(current).map(row => row.id);
        const moved = (ids as string[]).find((id, index) => before[index] !== id && ndtLock(requests, id, false).locked);
        if (moved) throw new AppError(423, `${ndtLockRefusal(current.find(row => row.id === moved)!.weldNo)} Its place in the table cannot change.`);
      }
      const records = (ids as string[]).flatMap((id, index) => { const weld = current.find(row => row.id === id)!; return weld.sortOrder === index + 1 ? [] : [store.update('welds', id, { sortOrder: index + 1 }, weld._version, actor)]; });
      return { resource: 'welds', records };
    }
    if (key === 'toggle-weld-sorting') {
      const iso = store.get('isometrics', data.isoId);
      if (typeof data.enabled !== 'boolean') throw new AppError(422, 'Choose Yes or No.', { enabled: 'Choose Yes or No.' });
      const record = weldSortingDisabled(iso) === !data.enabled ? iso : store.update('isometrics', iso.id, { weldSortingDisabled: !data.enabled }, iso._version, actor);
      return { resource: 'isometrics', record, records: [record] };
    }
    if (key === 'stamp-weld') {
      const weld = store.get('welds', data.weldId);
      if (data.expectedVersion !== undefined && data.expectedVersion !== weld._version) throw new AppError(409, 'This weld changed since you opened it. Refresh and try again.');
      if (data.stampedBy !== undefined && typeof data.stampedBy !== 'string') throw new AppError(422, 'Choose a person from the list.', { stampedBy: 'Choose a person from the list.' });
      const person = String(data.stampedBy ?? '').trim();
      if (person) { try { store.get('qa_engineers', person); } catch { throw new AppError(422, 'Choose a person from the list.', { stampedBy: 'Choose a person from the list.' }); } }
      assertWeldUnlocked(store, weld);
      const record = store.update('welds', weld.id, { stampedBy: person, stampedAt: person ? new Date().toISOString() : '' }, weld._version, actor);
      return { resource: 'welds', record, records: [record] };
    }
    throw new AppError(404, 'This action is not available.');
  });
}
export { moveWeld };

/**
 * Sample data of the local workspace for the weld table: fitting and flange certificates with
 * their index numbers, a stored table order and charge numbers on the first isometrics.
 * Runs once inside the sample seed; it never touches a connected database.
 */
export function seedWeldEntry(store: Store) {
  const add = (key: string, id: string, data: Values) => store.create(key, data, SYSTEM, id);
  // Weld type abbreviations and the welders' qualifications come from the catalog and welder-data samples
  // (seedWeldCatalogs, seed.ts); every welder on the sample welds holds a 141 qualification for wps-1 valid on the weld dates.
  const proc = (id: string) => { try { return store.get('weld_processes', id).id; } catch { return ''; } };
  // The WPS names the process it is welded with, so validation on WPS can compare it with the welders' certificates.
  try { const wps = store.get('wps', 'wps-1'); if (!wps.processId) store.update('wps', wps.id, { processId: proc('process-0') }, wps._version, SYSTEM); } catch { /* no sample WPS */ }
  // Certificates of fittings and flanges next to the pipe certificates of the welder-data sample (certificate-1..3), in
  // the same format: generated index numbers, certificate type, type of material, material part and project links.
  const certificates: [string, Values][] = [
    ['cert-h1043', { siteId: 'site-north', diameterId: 'diameter-6', name: 'ATT-26-1191', indexNo: '0004', chargeNo: 'H-1043', certType: '3.1', materialId: 'material-2', materialTypeId: 'material-type-a106b', materialPartId: 'part-1', basicMaterial: 'C-Si', supplierId: 'supplier-steel', date: '2026-09-02', standard: 'EN 10204 3.1', materialCode: 'A234 WPB', diameter: '2"', schedule: '40', wallThickness: '3.91', materialDescription: '90° long radius elbow', allProjects: false, projectIds: ['project-cooling'], controlled: true, accepted: true }],
    ['cert-h2211', { siteId: 'site-river', diameterId: 'diameter-9', name: 'ATT-26-1198', indexNo: '0005', chargeNo: 'H-2211', certType: '3.1', materialId: 'material-7', materialTypeId: 'material-type-a312-316l', materialPartId: 'part-1', basicMaterial: 'Cr-Ni-Mo', supplierId: 'supplier-pipe', date: '2026-09-09', standard: 'EN 10204 3.1', materialCode: 'A403 WP316L', diameter: '4"', schedule: '10S', wallThickness: '3.05', materialDescription: '90° elbow, stainless steel 316L', allProjects: false, projectIds: ['project-steam'], controlled: true, accepted: true }],
    ['cert-h3305', { siteId: 'site-north', diameterId: 'diameter-6', name: 'ATT-26-1215', indexNo: '0006', chargeNo: 'H-3305', certType: '3.1', materialId: 'material-3', materialTypeId: 'material-type-a106b', materialPartId: 'part-2', basicMaterial: 'C-Si', supplierId: 'supplier-steel', date: '2026-09-16', standard: 'EN 10204 3.1', materialCode: 'A105', diameter: '2"', schedule: '150', wallThickness: '3.91', materialDescription: 'Weld neck flange, class 150', allProjects: false, projectIds: ['project-skid'], controlled: true, accepted: false }],
  ];
  for (const [id, data] of certificates) { try { add('certifications', id, data); } catch { /* material absent */ } }
  // Weld table order for every sample isometric, and welds of the first isometrics traced to certificates.
  const byIso = new Map<string, Row[]>();
  for (const weld of store.list('welds')) byIso.set(String(weld.isoId), [...(byIso.get(String(weld.isoId)) || []), weld]);
  for (const welds of byIso.values()) orderedWelds(welds).forEach((weld, index) => store.update('welds', weld.id, { sortOrder: index + 1, processId: proc('process-0') }, weld._version, SYSTEM));
  const trace: [string, string, string][] = [['weld-1', 'certificate-1', 'certificate-1'], ['weld-10', 'certificate-1', 'cert-h1043'], ['weld-2', 'certificate-1', 'cert-h1043'], ['weld-11', 'cert-h1043', 'certificate-1'], ['weld-5', 'certificate-2', 'cert-h2211'], ['weld-6', 'cert-h2211', 'certificate-2']];
  for (const [id, one, two] of trace) {
    try {
      const weld = store.get('welds', id), a = store.get('certifications', one), b = store.get('certifications', two);
      store.update('welds', id, { certificate1Id: a.id, material1Id: a.materialId, chargeNo1: a.chargeNo, certificate2Id: b.id, material2Id: b.materialId, chargeNo2: b.chargeNo, coating1Id: 'coating-none', kr: 'K1', fp: 'FP-A', insLength: '25', insLength2: '25', sleeve: id === 'weld-1' ? 'S-114' : '' }, weld._version, SYSTEM);
    } catch { /* sample weld absent */ }
  }
  // Weld 4 continues from existing pipework and weld 5 meets a connected isometric.
  for (const [id, one, two] of [['weld-4', 'EXISTING', 'CONN ISO'], ['weld-13', 'CONN ISO', 'EXISTING']] as const) { try { const weld = store.get('welds', id); store.update('welds', id, { chargeNo1: one, chargeNo2: two }, weld._version, SYSTEM); } catch { /* absent */ } }
  // Every other sample weld whose charge number matches exactly one sample certificate is traced to it, so Idx and Material show.
  const sampleCertificates = store.list('certifications');
  // Only a certificate of the weld's own main project (shared/welder-data.ts → SITE_OWNED).
  const isoSite = new Map(store.list('isometrics').map(iso => [iso.id, String(store.list('projects').find(project => project.id === iso.projectId)?.siteId ?? '')]));
  const owned = { links: store.list('certificate_projects'), projects: store.list('projects') };
  for (const weld of store.list('welds')) {
    const changes: Values = {};
    for (const side of [1, 2] as const) {
      const charge = String(weld[`chargeNo${side}`] ?? '').trim(); if (!charge || weld[`certificate${side}Id`]) continue;
      const matches = sampleCertificates.filter(row => String(row.chargeNo ?? '').trim() === charge && inOwnerSite('certifications', row, isoSite.get(String(weld.isoId)) ?? '', owned)); if (matches.length !== 1) continue;
      Object.assign(changes, { [`certificate${side}Id`]: matches[0].id, [`material${side}Id`]: matches[0].materialId ?? '' });
    }
    if (Object.keys(changes).length) { try { store.update('welds', weld.id, changes, weld._version, SYSTEM); } catch { /* a rule of the sample refuses it: leave the weld as it is */ } }
  }
}
