import { Store, AppError, today, SYSTEM, type Actor } from './store.ts';
import { availableWps } from '../shared/welding.ts';
import type { Row } from '../shared/types.ts';
import { inOwnerSite } from '../shared/welder-data.ts';
import {
  MASS_EDIT_FIELDS, WELD_ENTRY_FIELDS, certificateErrors, hasWelder, lockContext, missingMandatoryFields, moveWeld, neighbourOf, normalizedNdtPercent, orderedWelds,
  planWeldRange, readMassEdit, weldLock, welderWpsErrors,
} from '../shared/weld-entry.ts';

/**
 * Server side of the weld table and weld entry (Weld Pilot): the entry rules, the lock, and the actions behind the
 * Add weld / Edit weld form, Add welds (range), Mass edit welds and the table order. The rules themselves are pure
 * functions in `shared/weld-entry.ts`; this file only gathers the records they need and turns answers into errors.
 */
type Values = Record<string, unknown>;
export const WELD_ENTRY_ACTIONS = new Set(['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']);

const norm = (value: unknown) => value === undefined || value === null ? '' : JSON.stringify(value);
const changed = (input: Values, existing: Row | undefined, names: readonly string[]) => !existing || names.some(name => Object.hasOwn(input, name) && norm(input[name]) !== norm(existing[name]));
const fail = (errors: Record<string, string>) => {
  const { _: general, ...fields } = errors, messages = Object.values(fields);
  if (general && !messages.length) return new AppError(422, general);
  return new AppError(422, messages.length === 1 ? messages[0] : 'Please check the highlighted fields.', fields);
};

function lockOf(store: Store, weld: Values) {
  return weldLock(weld, lockContext(store.list('weld_types', true), store.list('releases')));
}
/** Lock rule (d), server side: a weld of a completed phase cannot change, be deleted or be brought back. */
export function assertWeldUnlocked(store: Store, weld: Values) {
  const lock = lockOf(store, weld);
  if (lock.locked) throw new AppError(423, lock.reason);
}

/**
 * The entry rules for a weld that is created or changed. `input` holds what the request sets; `existing` is the
 * stored weld. A rule is evaluated when the request creates the weld or touches a field the rule concerns, so an
 * unrelated edit of an older incomplete weld is not blocked by it.
 */
export function assertWeldEntry(store: Store, input: Values, existing?: Row) {
  const merged: Values = { ...existing, ...Object.fromEntries(Object.entries(input).filter(([name]) => name !== '_version')) };
  if (!merged.isoId) return;
  let iso: Row, project: Row, site: Row;
  try { iso = store.get('isometrics', merged.isoId, true); project = store.get('projects', iso.projectId, true); site = store.get('sites', project.siteId, true); }
  catch { return; }
  const errors: Record<string, string> = {};
  // (d) lock: the stored weld and the weld as it would become.
  const context = lockContext(store.list('weld_types', true), store.list('releases'));
  for (const weld of existing ? [existing, merged] : [merged]) { const lock = weldLock(weld, context); if (lock.locked) throw new AppError(423, lock.reason); }
  if (existing ? input.tracer !== undefined && Boolean(input.tracer) !== Boolean(existing.tracer) : merged.tracer === true) errors.tracer = 'The tracer flag is set by the tracer workflow.';
  if (changed(input, existing, ['wpsId', 'isoId']) && merged.wpsId) {
    try {
      const wps = store.get('wps', merged.wpsId);
      if (wps.active === false && existing?.wpsId !== merged.wpsId) errors.wpsId = 'This procedure is inactive.';
      else if (!availableWps(Object.fromEntries(['projects', 'wps_projects', 'wps_sites'].map(key => [key, store.list(key)])), wps, String(project.id))) errors.wpsId = 'Select a procedure available for this project and site.';
    } catch { errors.wpsId = 'Choose an active WPS.'; }
  }
  // (a) mandatory fields
  if (changed(input, existing, ['typeId', 'wpsId', 'date', 'lengthMode', 'diameterId', 'dialen', 'chargeNo1', 'chargeNo2', 'certificate1Id', 'certificate2Id', 'welder1Id', 'welder2Id', 'welder3Id', 'welder4Id'])) Object.assign(errors, missingMandatoryFields(site, merged));
  // (b) validation on WPS
  if (changed(input, existing, ['welder1Id', 'welder2Id', 'welder3Id', 'welder4Id', 'wpsId', 'date']) && hasWelder(merged) && merged.wpsId) {
    let wps: Row | undefined; try { wps = store.get('wps', merged.wpsId, true); } catch { /* reported above */ }
    const certificates = store.list('welder_certificates');
    Object.assign(errors, welderWpsErrors(site, merged, wps, id => certificates.filter(row => row.welderId === id), id => { try { return store.display('welders', store.get('welders', id, true)); } catch { return 'This welder'; } }, today()));
  }
  // (c) project certificates
  const sides = [1, 2].filter(side => changed(input, existing, [`certificate${side}Id`]) && merged[`certificate${side}Id`]);
  if (sides.length) Object.assign(errors, certificateErrors(site, merged, sides, store.list('certifications'), String(project.id), { links: store.list('certificate_projects') }));
  if (Object.keys(errors).length) throw fail(errors);
}

const pick = (data: Values, names: readonly string[]) => Object.fromEntries(names.filter(name => data[name] !== undefined).map(name => [name, data[name]]));
const activeWelds = (store: Store, isoId: unknown) => store.list('welds').filter(weld => weld.isoId === isoId);

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
      if (!existing && !data.isoId) throw new AppError(422, 'Choose an isometric.', { isoId: 'Isometric is required.' });
      const isoId = existing?.isoId ?? data.isoId;
      for (const flag of ['updatePrev', 'updateNext']) if (data[flag] !== undefined && typeof data[flag] !== 'boolean') throw new AppError(422, 'Choose Yes or No.', { [flag]: 'Choose Yes or No.' });
      const input: Values = pick(data, WELD_ENTRY_FIELDS);
      const merged: Values = { ...existing, ...input, isoId };
      if (changed(input, existing, ['lengthMode', 'ndoReq', 'ndtpercent'])) { const percent = normalizedNdtPercent(merged); if (percent !== (merged.ndtpercent === '' || merged.ndtpercent === undefined ? null : merged.ndtpercent)) input.ndtpercent = percent === null ? '' : percent; }
      assertWeldEntry(store, { ...input, isoId }, existing);
      // Neighbours in table order: this weld's charge goes to the adjoining side of the previous / next weld.
      const neighbours: { weld: Row; patch: Values }[] = [];
      if (data.updatePrev === true || data.updateNext === true) {
        const order = orderedWelds(activeWelds(store, isoId)).map(weld => weld.id);
        const anchor = existing?.id ?? '', ids = existing ? order : [...order, ''];
        for (const [flag, which, from, to] of [['updatePrev', 'prev', 1, 2], ['updateNext', 'next', 2, 1]] as const) {
          if (data[flag] !== true) continue;
          const id = neighbourOf(ids, anchor, which); if (!id) continue;
          const weld = store.get('welds', id);
          const patch: Values = { [`chargeNo${to}`]: merged[`chargeNo${from}`] ?? '', [`certificate${to}Id`]: merged[`certificate${from}Id`] ?? '', [`material${to}Id`]: merged[`material${from}Id`] ?? '' };
          neighbours.push({ weld, patch });
        }
      }
      for (const { weld, patch } of neighbours) { assertWeldEntry(store, { ...patch, isoId: weld.isoId }, weld); }
      const record = existing ? store.update('welds', existing.id, input, existing._version, actor) : store.create('welds', { ...input, isoId, sortOrder: nextSortOrder(store, isoId, actor) }, actor);
      const updated = neighbours.map(({ weld, patch }) => store.update('welds', weld.id, patch, store.get('welds', weld.id)._version, actor));
      return { resource: 'welds', record, records: [record, ...updated] };
    }
    if (key === 'add-welds') {
      const iso = store.get('isometrics', data.isoId);
      if (data.diameterId) store.get('diameters', data.diameterId);
      let plan; try { plan = planWeldRange(data.start, data.end, store.list('welds').filter(weld => weld.isoId === iso.id).map(weld => String(weld.weldNo))); } catch (error) { throw new AppError(422, (error as Error).message); }
      if (!plan.numbers.length) throw new AppError(422, 'Every weld number in this range already exists.');
      let order = nextSortOrder(store, iso.id, actor);
      const created = plan.numbers.map(weldNo => { const input = { weldNo, isoId: iso.id, lengthMode: 'Diameter', diameterId: data.diameterId ?? '', sortOrder: order++ }; assertWeldEntry(store, input); return store.create('welds', input, actor); });
      return { resource: 'welds', records: created };
    }
    if (key === 'mass-edit-welds') {
      const ids = Array.isArray(data.weldIds) ? data.weldIds : [];
      if (!ids.length || ids.length > 500 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) throw new AppError(422, 'Select between 1 and 500 unique welds.');
      if (!data.changes || typeof data.changes !== 'object' || Array.isArray(data.changes)) throw new AppError(422, 'Change at least one field.');
      const unknown = Object.keys(data.changes as Values).filter(name => !(MASS_EDIT_FIELDS as readonly string[]).includes(name) && !['clearDatefit', 'clearDate'].includes(name));
      if (unknown.length) throw new AppError(422, 'A field of the mass edit is not available.', Object.fromEntries(unknown.map(name => [name, 'This field cannot be mass edited.'])));
      const { changes, errors } = readMassEdit(data.changes as Values);
      if (Object.keys(errors).length) throw fail(errors);
      const versions = (data.versions && typeof data.versions === 'object' ? data.versions : {}) as Record<string, unknown>;
      const records = (ids as string[]).map(id => {
        const weld = store.get('welds', id);
        if (versions[id] !== undefined && versions[id] !== weld._version) throw new AppError(409, `Weld ${weld.weldNo} changed since you opened it. Refresh and try again.`);
        try { assertWeldEntry(store, changes, weld); } catch (error) { if (error instanceof AppError) throw new AppError(error.status, `Weld ${weld.weldNo}: ${error.message}`, error.fields); throw error; }
        const patch: Values = { ...changes }; const merged = { ...weld, ...patch };
        if (changed(patch, weld, ['lengthMode', 'ndoReq', 'ndtpercent'])) { const percent = normalizedNdtPercent(merged); if (percent === null && weld.ndtpercent !== undefined && weld.ndtpercent !== null && weld.ndtpercent !== '') patch.ndtpercent = ''; }
        return store.update('welds', weld.id, patch, weld._version, actor);
      });
      return { resource: 'welds', records };
    }
    if (key === 'reorder-welds') {
      const iso = store.get('isometrics', data.isoId);
      const ids = Array.isArray(data.weldIds) ? data.weldIds as unknown[] : [];
      const current = activeWelds(store, iso.id);
      if (ids.length !== current.length || new Set(ids).size !== ids.length || !current.every(weld => ids.includes(weld.id))) throw new AppError(409, 'The welds of this isometric changed. Refresh and try again.');
      const records = (ids as string[]).flatMap((id, index) => { const weld = current.find(row => row.id === id)!; return weld.sortOrder === index + 1 ? [] : [store.update('welds', id, { sortOrder: index + 1 }, weld._version, actor)]; });
      return { resource: 'welds', records };
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
