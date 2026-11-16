import { SYSTEM, type Store } from './store.ts';
import { setAvailability } from './weld-catalogs.ts';

/**
 * Sample weld catalogs of the local workspace: weld types, coatings, NDT / PWHT catalogs, defect codes (ISO 6520-1
 * designations), QA/QC engineers and attachment names, with a few records switched off on one main project.
 * Called from the sample seed inside its transaction; companies, sites and the diameters are created before.
 */
const TYPES: [string, string, string, string][] = [
  ['Butt Weld', 'BW', 'Butt joint', 'V-groove'], ['Branch welds', 'BR', 'Branch connection', 'Single bevel'], ['Socket welds', 'SW', 'Socket joint', 'Fillet'],
  ['Fillet Weld', 'FW', 'T-joint', 'Fillet'], ['Longitudinal Welds', 'LW', 'Butt joint', 'V-groove'], ['Victaulic Joint', 'VJ', 'Mechanical coupling', ''],
  ['Reinforcement Pad GW', 'RPG', 'Branch connection', 'Single bevel'], ['Reinforcement Pad FW', 'RPF', 'Branch connection', 'Fillet'],
];
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
/** [code, English, Dutch, group, norm, ISO 6520-1 reference] */
const DEFECTS: [string, string, string, string, string, string][] = [
  ['100', 'Crack', 'Scheur', 'Crack', 'ISO 6520-1', '100'], ['101', 'Longitudinal crack', 'Langsscheur', 'Crack', 'ISO 6520-1', '101'], ['102', 'Transverse crack', 'Dwarsscheur', 'Crack', 'ISO 6520-1', '102'],
  ['2011', 'Gas pore', 'Gasporie', 'Cavity', 'ISO 6520-1', '2011'], ['2013', 'Clustered porosity', 'Nestvormige porositeit', 'Cavity', 'ISO 6520-1', '2013'], ['2015', 'Elongated cavity', 'Langwerpige holte', 'Cavity', 'ISO 6520-1', '2015'],
  ['301', 'Slag inclusion', 'Slakinsluiting', 'Inclusion', 'ISO 6520-1', '301'], ['304', 'Metallic inclusion', 'Metaalinsluiting', 'Inclusion', 'ISO 6520-1', '304'],
  ['401', 'Lack of fusion', 'Bindfout', 'Lack of fusion', 'ISO 6520-1', '401'], ['402', 'Incomplete penetration', 'Onvoldoende doorlassing', 'Lack of fusion', 'ISO 6520-1', '402'],
  ['501', 'Undercut', 'Inbranding', 'Imperfect shape', 'ISO 6520-1', '501'], ['502', 'Excess weld metal', 'Te grote lasoverhoogte', 'Imperfect shape', 'ISO 6520-1', '502'], ['507', 'Linear misalignment', 'Hoog-laagverschil', 'Imperfect shape', 'ISO 6520-1', '507'], ['510', 'Burn-through', 'Doorbranding', 'Imperfect shape', 'ISO 6520-1', '510'],
  ['601', 'Stray arc', 'Ontstekingsplek', 'Miscellaneous', 'ISO 6520-1', '601'],
  ['PO', 'Porosity', 'Porositeit', 'Cavity', 'Current list', '2011'], ['SL', 'Slag', 'Slak', 'Inclusion', 'Current list', '301'], ['LF', 'Lack of fusion', 'Bindfout', 'Lack of fusion', 'Current list', '401'], ['UC', 'Undercut', 'Inbranding', 'Imperfect shape', 'Current list', '501'],
  ['B31-CR', 'Cracks', 'Scheuren', 'Crack', 'ASME B31.3', '100'], ['B31-IP', 'Incomplete penetration', 'Onvoldoende doorlassing', 'Lack of fusion', 'ASME B31.3', '402'], ['B31-CV', 'Concave root surface', 'Holle wortel', 'Imperfect shape', 'ASME B31.3', ''],
];

export function seedWeldCatalogs(store: Store) {
  const add = (key: string, id: string, data: Record<string, unknown>) => store.create(key, data, SYSTEM, id);
  WELD_TYPES.forEach((name, i) => {
    const base = name.replace(/ - (Shop|Field)$/, ''); const row = TYPES.find(type => type[0] === base) || ['HOOK-UP', 'HU', 'Butt joint', 'V-groove'];
    const location = name.includes('Field') ? 'Field' : 'Shop';
    add('weld_types', `weld-type-${i}`, { name, location, abbreviation: name === 'HOOK-UP' ? 'HU' : `${row[1]}-${location[0]}`, jointType: row[2], grooveType: row[3], sort: i + 1 });
  });
  [['coating-none', 'UNCOATED', 'UC'], ['coating-zinc', 'Zinc silicate primer', 'ZSP'], ['coating-epoxy', 'Epoxy primer', 'EP'], ['coating-pu', 'Polyurethane finish', 'PU'], ['coating-hdg', 'Hot-dip galvanized', 'HDG']].forEach(([id, name, abbreviation]) => add('coatings', id, { name, abbreviation }));
  NDT_GROUPS.forEach(([id, name, description]) => add('ndt_groups', `ndt-group-${id}`, { name, description }));
  NDT_PROCESSES.forEach(([id, name, group, description, wpr]) => add('ndt_processes', id, { name, groupId: `ndt-group-${group}`, description, wpr }));
  DEFECTS.forEach(([code, english, dutch, group, norm, isoRef], i) => add('ndt_defect_codes', `defect-${i + 1}`, { code, english, dutch, group, norm, isoRef }));
  add('ndt_locations', 'ndt-shop', { name: 'Fabrication shop' }); add('ndt_locations', 'ndt-site', { name: 'Site spool area' }); add('ndt_locations', 'ndt-lab', { name: 'External laboratory' });
  add('pwht_processes', 'pwht-1', { name: 'PWHT-01', description: 'Local post-weld heat treatment by electrical resistance heating' });
  add('pwht_processes', 'pwht-2', { name: 'PWHT-02', description: 'Post-weld heat treatment of complete spools in a furnace' });
  add('pwht_locations', 'pwht-shop', { name: 'Heat treatment bay' }); add('pwht_locations', 'pwht-site', { name: 'Site furnace area' });
  add('qa_engineers', 'qa-1', { name: 'Morgan Lee', companyId: 'company-stelux', phone: '+31 10 555 0121', email: 'quality@example.com', stamp: 'ML-07', level: 'Level 2', certificate1: 'ISO 9712 VT-2', certificate2: 'ISO 9712 PT-2' });
  add('qa_engineers', 'qa-2', { name: 'Priya Nair', companyId: 'company-north', phone: '+31 10 555 0187', email: 'p.nair@example.com', stamp: 'PN-12', level: 'Level 3', certificate1: 'ISO 9712 RT-3', certificate2: 'ISO 9712 UT-3' });
  [['Isometric drawing', true, false, 'Before Isometric'], ['ITP', true, false, 'Before Isometric'], ['NDT report', true, false, 'After Isometric'], ['Material certificate', true, false, 'After Isometric'], ['Signed release', true, false, 'After Isometric'], ['Hydrotest report', false, true, 'After Isometric']]
    .forEach(([name, isoBook, hydrotest, position], i) => add('attachment_names', `attachment-type-${i}`, { name, isoBook, hydrotest, position, sort: i + 1 }));
  // A few records are switched off on one main project; everything else stays enabled everywhere.
  const off = (key: string, id: string, siteId: string) => setAvailability(store, key, id, siteId, false, SYSTEM);
  off('weld_types', 'weld-type-11', 'site-river'); off('weld_types', 'weld-type-12', 'site-river');
  off('coatings', 'coating-pu', 'site-river'); off('ndt_locations', 'ndt-lab', 'site-north'); off('qa_engineers', 'qa-2', 'site-north');
  DEFECTS.forEach(([, , , , norm], i) => { if (norm === 'ASME B31.3') off('ndt_defect_codes', `defect-${i + 1}`, 'site-north'); });
}
