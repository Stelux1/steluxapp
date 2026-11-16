import { SYSTEM, type Store } from './store.ts';
import { setAvailability } from './weld-catalogs.ts';
import { STANDARD_DEFECT_CODES, standardDefectCodeData, standardDefectCodeId } from '../shared/defect-codes.ts';

/**
 * Sample weld catalogs of the local workspace: weld types, coatings, NDT / PWHT catalogs, the standard defect codes
 * (shared/defect-codes.ts), QA/QC engineers and attachment names, with a few records switched off on one main project.
 * Called from the sample seed inside its transaction; companies, sites and the diameters are created before.
 */
/** [weld type, joint type, groove type]: the reference's values (Weld data -> Weld type); the abbreviation is the Shop / Field code (WS / FW). */
const TYPES: [string, string, string][] = [
  ['Butt Weld', 'BW', '-'], ['Branch welds', 'BR', '-'], ['Socket welds', 'SW', '-'], ['Fillet Weld', 'FL', '-'], ['Longitudinal Welds', 'LG', '-'],
  ['Victaulic Joint', 'VJ', '-'], ['Reinforcement Pad GW', 'RP-GW', '-'], ['Reinforcement Pad FW', 'RP', '-'],
];
/** Groove types the reference lists for single types, by weld type name. */
const GROOVES: Record<string, string> = { 'Butt Weld - Shop': 'L', 'Butt Weld - Field': 'V', 'Branch welds - Field': '1' };
/** Same order and ids as before the catalogs were extended: weld-type-0 … weld-type-16. */
const WELD_TYPES = ['Butt Weld - Field', 'Butt Weld - Shop', 'Branch welds - Field', 'Branch welds - Shop', 'Socket welds - Shop', 'Socket welds - Field', 'Fillet Weld - Shop', 'Fillet Weld - Field', 'Longitudinal Welds - Shop', 'Longitudinal Welds - Field', 'HOOK-UP', 'Victaulic Joint - Shop', 'Victaulic Joint - Field', 'Reinforcement Pad GW - Shop', 'Reinforcement Pad GW - Field', 'Reinforcement Pad FW - Shop', 'Reinforcement Pad FW - Field'];
const NDT_GROUPS: [string, string, string][] = [
  ['rt', 'RT', 'Radiographic testing'], ['pt', 'PT', 'Penetrant testing'], ['mt', 'MT', 'Magnetic particle testing'], ['tofd', 'UT-ToFD', 'Ultrasonic testing, time of flight diffraction'], ['vt', 'VT', 'Visual testing'],
  ['pa', 'PA', 'Phased array ultrasonic testing'], ['mtb', 'MT-b', 'Magnetic particle testing of base material'], ['ptb', 'PT-b', 'Penetrant testing of base material'], ['ut', 'UT', 'Ultrasonic testing'],
  ['pmi', 'PMI', 'Positive material identification'], ['ferrite', 'FERRITE', 'Ferrite content measurement'],
];
/** [id, name, group, description, WPR] — the first five keep the ids of the earlier sample. */
const NDT_PROCESSES: [string, string, string, string, boolean][] = [
  ['ndt-0', 'RT', 'rt', 'Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675-1 level 1', true],
  ['ndt-1', 'UT', 'ut', 'Execution: EN ISO 17640 level B / acceptance: EN ISO 11666 level 2', true],
  ['ndt-2', 'PT', 'pt', 'Execution: EN ISO 3452-1 / acceptance: EN ISO 23277 level 2X', false],
  ['ndt-3', 'MT', 'mt', 'Execution: EN ISO 17638 / acceptance: EN ISO 23278 level 2X', false],
  ['ndt-4', 'VT', 'vt', 'Execution: EN ISO 17637 / acceptance: EN ISO 5817 level B', false],
  ['ndt-5', 'UT-ToFD', 'tofd', 'Execution: EN ISO 10863 / acceptance: EN ISO 15626', false],
  ['ndt-6', 'PMI', 'pmi', 'Alloy verification of the base and filler material with a handheld analyser', false],
];
export function seedWeldCatalogs(store: Store) {
  const add = (key: string, id: string, data: Record<string, unknown>) => store.create(key, data, SYSTEM, id);
  WELD_TYPES.forEach((name, i) => {
    const base = name.replace(/ - (Shop|Field)$/, ''); const row = TYPES.find(type => type[0] === base) || ['HOOK-UP', 'BW', '-'];
    const location = name === 'HOOK-UP' || name.includes('Field') ? 'Field' : 'Shop';
    add('weld_types', `weld-type-${i}`, { name, location, abbreviation: name === 'HOOK-UP' ? 'YTI' : location === 'Shop' ? 'WS' : 'FW', jointType: row[1], grooveType: GROOVES[name] ?? row[2], sort: i + 1 });
  });
  [['coating-none', 'UNCOATED', 'UC'], ['coating-zinc', 'Zinc silicate primer', 'ZSP'], ['coating-epoxy', 'Epoxy primer', 'EP'], ['coating-pu', 'Polyurethane finish', 'PU'], ['coating-hdg', 'Hot-dip galvanized', 'HDG']].forEach(([id, name, abbreviation]) => add('coatings', id, { name, abbreviation }));
  NDT_GROUPS.forEach(([id, name, description]) => add('ndt_groups', `ndt-group-${id}`, { name, description }));
  NDT_PROCESSES.forEach(([id, name, group, description, wpr]) => add('ndt_processes', id, { name, groupId: `ndt-group-${group}`, description, wpr }));
  for (const code of STANDARD_DEFECT_CODES) add('ndt_defect_codes', standardDefectCodeId(code[0], code[4]), standardDefectCodeData(code));
  add('ndt_locations', 'ndt-shop', { name: 'Fabrication shop' }); add('ndt_locations', 'ndt-site', { name: 'Site spool area' }); add('ndt_locations', 'ndt-lab', { name: 'External laboratory' });
  add('pwht_processes', 'pwht-1', { name: 'PWHT-01', description: 'Local post-weld heat treatment by electrical resistance heating' });
  add('pwht_processes', 'pwht-2', { name: 'PWHT-02', description: 'Post-weld heat treatment of complete spools in a furnace' });
  add('pwht_locations', 'pwht-shop', { name: 'Heat treatment bay' }); add('pwht_locations', 'pwht-site', { name: 'Site furnace area' });
  add('qa_engineers', 'qa-1', { name: 'Morgan Lee', companyId: 'company-stelux', company: 'Stelux Engineering', phone: '+31 10 555 0121', email: 'quality@example.com', stamp: 'ML-07', level: 'Level 2', certificate1: 'ISO 9712 VT-2', certificate2: 'ISO 9712 PT-2' });
  add('qa_engineers', 'qa-2', { name: 'Priya Nair', companyId: 'company-north', company: 'Northline Process', phone: '+31 10 555 0187', email: 'p.nair@example.com', stamp: 'PN-12', level: 'Level 3', certificate1: 'ISO 9712 RT-3', certificate2: 'ISO 9712 UT-3' });
  [['Isometric drawing', true, false, 'Before Isometric'], ['ITP', true, false, 'Before Isometric'], ['NDT report', true, false, 'After Isometric'], ['Material certificate', true, false, 'After Isometric'], ['Signed release', true, false, 'After Isometric'], ['Hydrotest report', false, true, 'After Isometric']]
    .forEach(([name, isoBook, hydrotest, position], i) => add('attachment_names', `attachment-type-${i}`, { name, isoBook, hydrotest, position, sort: i + 1 }));
  // A few records are switched off on one main project; everything else stays enabled everywhere.
  const off = (key: string, id: string, siteId: string) => setAvailability(store, key, id, siteId, false, SYSTEM);
  off('weld_types', 'weld-type-11', 'site-river'); off('weld_types', 'weld-type-12', 'site-river');
  off('coatings', 'coating-pu', 'site-river'); off('ndt_locations', 'ndt-lab', 'site-north'); off('qa_engineers', 'qa-2', 'site-north');
  for (const code of STANDARD_DEFECT_CODES) if (code[4] === 'ASME B31.3') off('ndt_defect_codes', standardDefectCodeId(code[0], code[4]), 'site-north');
}
