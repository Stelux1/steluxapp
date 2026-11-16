import { AppError, SYSTEM, type Store } from './store.ts';
import { canResource } from '../shared/permissions.ts';
import type { Row, User } from '../shared/types.ts';
import { isoXRay } from '../shared/itps.ts';

/**
 * Local sample data of the ITP / KNR register and the Weld dashboard (called from `seed()` only, never for a
 * connected database): the register, links of the sample isometrics, abbreviations on the weld types, a second
 * WPS and welders spread over both, and two tracer welds, so the compliance table shows compliant and not
 * compliant groups.
 */
export function seedItpSamples(store: Store) {
  const add = (key: string, id: string, data: Record<string, unknown>) => store.create(key, data, SYSTEM, id);
  // Realistic plans: the number is the plan, NDT % the share of welds to examine.
  add('itps', 'itp-01', { number: 'ITP-01', title: 'CS process piping', scope: 'Shop', description: 'Carbon steel process piping, ASME B31.3 normal fluid service', ndtPercent: 10, revision: '2', projectIds: ['project-cooling'] });
  add('itps', 'itp-02', { number: 'ITP-02', title: 'SS steam piping', scope: 'Shop+Field', description: 'Stainless steel steam piping, 316L, category II', ndtPercent: 20, revision: '1', projectIds: ['project-steam'] });
  add('itps', 'itp-03', { number: 'ITP-03', title: 'Skid shop fabrication', scope: 'Shop', description: 'Skid piping, 316L, shop fabrication', ndtPercent: 5, revision: '0', projectIds: ['project-skid'] });
  add('itps', 'itp-ndt-01', { number: 'ITP-NDT-01', title: 'Supplementary RT', scope: 'Field', description: 'Supplementary radiography plan for lines with PWHT', ndtPercent: 30, revision: '0' });
  // A linked isometric takes its X Ray % from the ITP (shared/itps.ts), as Link ITP does.
  const link = (isoId: string, data: Record<string, unknown>) => { const iso = store.get('isometrics', isoId); const xRay = isoXRay({ ...iso, ...data }, store.list('itps')); store.update('isometrics', isoId, { ...data, ...(xRay === null ? {} : { xRay }) }, iso._version, SYSTEM); };
  // iso-1..3 follow ITP-01 (iso-1 also has the supplementary plan in slot 2), iso-4..6 ITP-02; iso-7..9 and iso-10 stay free text.
  for (const id of ['iso-1', 'iso-2', 'iso-3']) link(id, { itpId: 'itp-01' });
  link('iso-1', { itp2Id: 'itp-ndt-01' });
  for (const id of ['iso-4', 'iso-5', 'iso-6']) link(id, { itpId: 'itp-02' });
  // Weld type abbreviations used by the Total welds card come from the weld catalog seed (server/weld-catalogs-seed.ts).
  // A second procedure: the upper half of the welds were made under it.
  add('wps', 'wps-2', { name: 'STX-WPS-135-01', method: '135', definition: 'Sample procedure — see the attached specification', jointType: 'BW', allProjects: true, siteIds: ['site-north', 'site-river'], processId: 'process-2', pqrId: 'pqr-1', standard: 'ISO 15609-1' });
  for (const weld of store.list('welds')) {
    const number = Number(String(weld.weldNo).slice(1));
    const changes: Record<string, unknown> = {};
    if (number > 15 && number <= 30) changes.wpsId = 'wps-2';
    // Tracers of the rejected welds: W007 traces W005 (its second tracer comes with the inspection samples), W023 traces W011.
    if (number === 7) Object.assign(changes, { tracer: true, tracerOfId: 'weld-5' });
    if (number === 23) Object.assign(changes, { tracer: true, tracerOfId: 'weld-11' });
    if (Object.keys(changes).length) store.update('welds', weld.id, changes, weld._version, SYSTEM);
  }
  nameWeldedWps(store);
}

/**
 * Sample data only: "Validation on WPS" offers a welder for a WPS when one of the welder's qualification documents names
 * it, so every qualification document of a sample welder names the sample WPS that welder welds (SA2 N-D1).
 */
export function nameWeldedWps(store: Store) {
  const welded = new Map<string, Set<string>>();
  for (const weld of store.list('welds')) for (const field of ['welder1Id', 'welder2Id', 'welder3Id', 'welder4Id']) {
    const welderId = String(weld[field] || ''), wpsId = String(weld.wpsId || '');
    if (welderId && wpsId) welded.set(welderId, (welded.get(welderId) || new Set()).add(wpsId));
  }
  for (const document of store.list('welder_certificates')) {
    if (document.isDocument === true) continue;
    const named = String(document.wpsIds || '').split(',').map(id => id.trim()).filter(Boolean);
    const all = [...new Set([...named, ...(welded.get(String(document.welderId)) || [])])].sort();
    if (all.join(',') !== named.join(',')) store.update('welder_certificates', document.id, { wpsIds: all.join(',') }, document._version, SYSTEM);
  }
}

/**
 * Linking an isometric to the ITP / KNR register needs read access to the register (Weld Pilot): the server copies
 * the entry's number and revision into the isometric, so an account that cannot read the register must not name
 * entries. Unchanged links and clearing a link are not judged; free-text ITP numbers stay open to every editor.
 */
export function checkItpLinkAccess(user: User, key: string, input: Record<string, unknown>, existing?: Row) {
  if (key !== 'isometrics') return;
  const changed = ['itpId', 'itp2Id'].some(name => input[name] !== undefined && String(input[name] ?? '') !== '' && String(input[name]) !== String(existing?.[name] ?? ''));
  if (changed && !canResource(user, 'itps', 'show')) throw new AppError(403, 'Your profile does not open the ITP / KNR register in this application.');
}
