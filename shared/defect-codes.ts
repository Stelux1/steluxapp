import { DEFECT_NORMS } from './site-settings.ts';

/**
 * The standard defect codes the workspace ships (Weld Pilot -> NDT data -> Defect codes): ISO 6520-1, ASME B31.3 and
 * API 1104, each with its English and Dutch text, its group and its ISO 6520-1 reference, as the reference product
 * lists them. They are system data: locked against editing and deleting, switched on or off per main project only.
 * The reference lists 98 standard codes (63 of ISO 6520-1, 9 of ASME B31.3, 15 of API 1104 and the 11 of the "Current list"); all are shipped.
 * Order: [code, English, Dutch, group, norm, ISO 6520-1 reference].
 */
export type StandardDefectCode = readonly [code: string, english: string, dutch: string, group: string, norm: string, isoRef: string];
export const STANDARD_DEFECT_CODES: readonly StandardDefectCode[] = [
  ['100', 'Crack', 'Scheur', 'Crack', 'ISO 6520-1', '100'],
  ['101', 'Longitudinal crack', 'Langsscheur', 'Crack', 'ISO 6520-1', '101'],
  ['102', 'Transverse crack', 'Dwarscheur', 'Crack', 'ISO 6520-1', '102'],
  ['103', 'Radiating cracks', 'Stervormige scheuren', 'Crack', 'ISO 6520-1', '103'],
  ['104', 'Crater crack', 'Eindkraterscheur', 'Crack', 'ISO 6520-1', '104'],
  ['105', 'Group of disconnected cracks', 'Groep losse scheuren', 'Crack', 'ISO 6520-1', '105'],
  ['106', 'Branching crack', 'Vertakte scheur', 'Crack', 'ISO 6520-1', '106'],
  ['201', 'Gas cavity', 'Gasholte', 'Cavity', 'ISO 6520-1', '201'],
  ['202', 'Shrinkage cavity', 'Krimpholte', 'Cavity', 'ISO 6520-1', '202'],
  ['301', 'Slag inclusion', 'Slakinsluiting', 'Inclusion', 'ISO 6520-1', '301'],
  ['302', 'Flux inclusion', 'Fluxinsluiting', 'Inclusion', 'ISO 6520-1', '302'],
  ['303', 'Oxide inclusion', 'Oxide-insluiting', 'Inclusion', 'ISO 6520-1', '303'],
  ['304', 'Metallic inclusion', 'Metaalinsluiting', 'Inclusion', 'ISO 6520-1', '304'],
  ['401', 'Lack of fusion', 'Bindingsfout', 'Fusion', 'ISO 6520-1', '401'],
  ['402', 'Incomplete penetration', 'Onvolledige doorlassing', 'Fusion', 'ISO 6520-1', '402'],
  ['501', 'Undercut', 'Inkarteling', 'Shape', 'ISO 6520-1', '501'],
  ['502', 'Excess weld metal', 'Te hoge sluitlaag', 'Shape', 'ISO 6520-1', '502'],
  ['503', 'Excessive convexity', 'Te bolle hoeklas', 'Shape', 'ISO 6520-1', '503'],
  ['504', 'Excess penetration', 'Te veel doorlassing', 'Shape', 'ISO 6520-1', '504'],
  ['505', 'Incorrect weld toe angle', 'Verkeerde teenhoek', 'Shape', 'ISO 6520-1', '505'],
  ['506', 'Overlap', 'Overlap', 'Shape', 'ISO 6520-1', '506'],
  ['507', 'Linear misalignment', 'Lineaire hoog-laag', 'Shape', 'ISO 6520-1', '507'],
  ['508', 'Angular misalignment', 'Hoekverdraaiing', 'Shape', 'ISO 6520-1', '508'],
  ['509', 'Sagging', 'Doorzakking', 'Shape', 'ISO 6520-1', '509'],
  ['510', 'Burn-through', 'Doorbranding', 'Shape', 'ISO 6520-1', '510'],
  ['511', 'Incompletely filled groove', 'Onvolledig gevulde groef', 'Shape', 'ISO 6520-1', '511'],
  ['CRACK', 'Crack', 'Scheur', 'Crack', 'ASME B31.3', '100'],
  ['LOF', 'Lack of fusion', 'Bindingsfout', 'Fusion', 'ASME B31.3', '401'],
  ['IP', 'Incomplete penetration', 'Onvolledige doorlassing', 'Fusion', 'ASME B31.3', '402'],
  ['ROUND', 'Rounded indications', 'Ronde indicaties', 'Cavity', 'ASME B31.3', '201'],
  ['ELONG', 'Elongated indication', 'Langgerekte indicatie', 'Inclusion', 'ASME B31.3', '301'],
  ['UC', 'Undercutting', 'Inkarteling', 'Shape', 'ASME B31.3', '501'],
  ['REINF', 'Face or root reinforcement', 'Sluitlaag of doorlassing', 'Shape', 'ASME B31.3', '502'],
  ['C', 'Crack', 'Scheur', 'Crack', 'API 1104', '100'],
  ['IP', 'Inadequate penetration', 'Onvolledige doorlassing', 'Fusion', 'API 1104', '402'],
  ['IPD', 'Inadequate penetration due to high-low', 'Onvolledige doorlassing door hoog-laag', 'Fusion', 'API 1104', '402'],
  ['ICP', 'Inadequate cross penetration', 'Onvolledige kruisbinding', 'Fusion', 'API 1104', '401'],
  ['IF', 'Incomplete fusion', 'Bindingsfout', 'Fusion', 'API 1104', '401'],
  ['BT', 'Burn-through', 'Doorbranding', 'Shape', 'API 1104', '510'],
  ['P', 'Porosity', 'Porositeit', 'Cavity', 'API 1104', '201'],
  // Rows 41 to 98 of the reference list, in the order captured (weld__ndt__defect-codes.txt). The reference shows "-" as group and
  // ISO reference of the 11 "Current list" codes; they are stored empty (the group is a select of six groups).
  ['512', 'Excessive asymmetry of fillet weld', 'Ongelijke beenlengte hoeklas', 'Shape', 'ISO 6520-1', '512'],
  ['513', 'Irregular weld width', 'Onregelmatige lasbreedte', 'Shape', 'ISO 6520-1', '513'],
  ['514', 'Irregular surface', 'Onregelmatig oppervlak', 'Shape', 'ISO 6520-1', '514'],
  ['IC', 'Internal concavity', 'Wortelterugval', 'Shape', 'API 1104', '515'],
  ['CONC', 'Concave root or burn-through', 'Wortelterugval of doorbranding', 'Shape', 'ASME B31.3', '515'],
  ['515', 'Root concavity', 'Wortelterugval', 'Shape', 'ISO 6520-1', '515'],
  ['516', 'Root porosity', 'Wortelporositeit', 'Shape', 'ISO 6520-1', '516'],
  ['517', 'Poor restart', 'Slechte herstart', 'Shape', 'ISO 6520-1', '517'],
  ['521', 'Incorrect weld dimensions', 'Verkeerde lasafmeting', 'Shape', 'ISO 6520-1', '521'],
  ['601', 'Stray arc', 'Zwerflas', 'Miscellaneous', 'ISO 6520-1', '601'],
  ['602', 'Spatter', 'Spatten', 'Miscellaneous', 'ISO 6520-1', '602'],
  ['603', 'Torn surface', 'Ingescheurd oppervlak', 'Miscellaneous', 'ISO 6520-1', '603'],
  ['604', 'Grinding mark', 'Slijpspoor', 'Miscellaneous', 'ISO 6520-1', '604'],
  ['606', 'Excessive grinding', 'Te ver weggeslepen', 'Miscellaneous', 'ISO 6520-1', '606'],
  ['610', 'Temper colour', 'Aanloopkleur', 'Miscellaneous', 'ISO 6520-1', '610'],
  ['615', 'Residual slag', 'Restslak', 'Miscellaneous', 'ISO 6520-1', '615'],
  ['618', 'Faulty tack weld', 'Foute hechtlas', 'Miscellaneous', 'ISO 6520-1', '618'],
  ['2011', 'Isolated gas pore', 'Enkele gasporie', 'Cavity', 'ISO 6520-1', '2011'],
  ['2012', 'Uniformly distributed porosity', 'Gelijkmatig verdeelde porositeit', 'Cavity', 'ISO 6520-1', '2012'],
  ['CP', 'Cluster porosity', 'Porositeitsnest', 'Cavity', 'API 1104', '2013'],
  ['2013', 'Clustered porosity', 'Porositeitsnest', 'Cavity', 'ISO 6520-1', '2013'],
  ['2014', 'Linear porosity', 'Lineaire porositeit', 'Cavity', 'ISO 6520-1', '2014'],
  ['2015', 'Elongated cavity', 'Langgerekte holte', 'Cavity', 'ISO 6520-1', '2015'],
  ['HB', 'Hollow bead porosity', 'Holle rupsporie', 'Cavity', 'API 1104', '2016'],
  ['2016', 'Wormhole', 'Wormgat', 'Cavity', 'ISO 6520-1', '2016'],
  ['SURF', 'Surface porosity or exposed slag', 'Oppervlakteporie of zichtbare slak', 'Cavity', 'ASME B31.3', '2017'],
  ['2017', 'Surface pore', 'Oppervlakteporie', 'Cavity', 'ISO 6520-1', '2017'],
  ['2024', 'Crater pipe', 'Eindkraterpijp', 'Cavity', 'ISO 6520-1', '2024'],
  ['ESI', 'Elongated slag inclusion', 'Langgerekte slakinsluiting', 'Inclusion', 'API 1104', '3011'],
  ['3011', 'Linear slag inclusion', 'Lineaire slakinsluiting', 'Inclusion', 'ISO 6520-1', '3011'],
  ['ISI', 'Isolated slag inclusion', 'Enkele slakinsluiting', 'Inclusion', 'API 1104', '3012'],
  ['3012', 'Isolated slag inclusion', 'Enkele slakinsluiting', 'Inclusion', 'ISO 6520-1', '3012'],
  ['3013', 'Clustered slag inclusions', 'Slakinsluitingsnest', 'Inclusion', 'ISO 6520-1', '3013'],
  ['3041', 'Tungsten inclusion', 'Wolfraaminsluiting', 'Inclusion', 'ISO 6520-1', '3041'],
  ['3042', 'Copper inclusion', 'Koperinsluiting', 'Inclusion', 'ISO 6520-1', '3042'],
  ['4011', 'Lack of side-wall fusion', 'Flankbindingsfout', 'Fusion', 'ISO 6520-1', '4011'],
  ['IFD', 'Incomplete fusion due to cold lap', 'Bindingsfout door cold lap', 'Fusion', 'API 1104', '4012'],
  ['4012', 'Lack of inter-run fusion', 'Bindingsfout tussen de lagen', 'Fusion', 'ISO 6520-1', '4012'],
  ['4013', 'Lack of root fusion', 'Wortelbindingsfout', 'Fusion', 'ISO 6520-1', '4013'],
  ['EU', 'External undercut', 'Uitwendige inkarteling', 'Shape', 'API 1104', '5011'],
  ['5011', 'Continuous undercut', 'Doorlopende inkarteling', 'Shape', 'ISO 6520-1', '5011'],
  ['5012', 'Intermittent undercut', 'Onderbroken inkarteling', 'Shape', 'ISO 6520-1', '5012'],
  ['IU', 'Internal undercut', 'Inwendige inkarteling', 'Shape', 'API 1104', '5013'],
  ['5013', 'Shrinkage groove', 'Wortelkerf', 'Shape', 'ISO 6520-1', '5013'],
  ['5014', 'Inter-run undercut', 'Inkarteling tussen de lagen', 'Shape', 'ISO 6520-1', '5014'],
  ['5211', 'Excessive throat thickness', 'Te grote a-hoogte', 'Shape', 'ISO 6520-1', '5211'],
  ['5213', 'Insufficient throat thickness', 'Te kleine a-hoogte', 'Shape', 'ISO 6520-1', '5213'],
  ['GI', 'Gas Inclusion', 'Gasinsluiting', '', 'Current list', ''],
  ['FMI', 'Foreign Material Inclusion', 'Insluiting van vast materiaal', '', 'Current list', ''],
  ['UW', 'Undercut Weld', 'Insnoering', '', 'Current list', ''],
  ['CR', 'Crater', 'Krater', '', 'Current list', ''],
  ['CS', 'Crack Shrinkage', 'Krimpscheuren', '', 'Current list', ''],
  ['LI', 'Lack of Inter-run Fusion', 'Lasinsluiting', '', 'Current list', ''],
  ['OW', 'Overlap Weld', 'Lasverbranding', '', 'Current list', ''],
  ['LOF', 'Lack of Fusion', 'Onvolledige doorsmelting', '', 'Current list', ''],
  ['PO', 'Porosity', 'Porositeit', '', 'Current list', ''],
  ['SI', 'Slag Inclusion', 'Slakinsluiting', '', 'Current list', ''],
  ['RSC', 'Root surface concavity', 'Wortelinkeping', '', 'Current list', ''],
];
/** Stable id of a standard code in a workspace: the same code of the same norm is never shipped twice. */
export const standardDefectCodeId = (code: string, norm: string) => `std-defect-${norm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
/** The data of one standard code as it is stored. */
export const standardDefectCodeData = ([code, english, dutch, group, norm, isoRef]: StandardDefectCode) => ({ code, english, dutch, group, norm, isoRef, system: true });
export const STANDARD_DEFECT_NORMS = DEFECT_NORMS.slice(1);
const STANDARD_KEYS = new Set(STANDARD_DEFECT_CODES.map(([code, , , , norm]) => `${norm}\n${code}`));
/**
 * Whether a defect code counts as a standard code (locked in the list, edit and delete refused, switchable per main project):
 * its stored flag `system`, or a code + norm equal to a standard code. The second covers a workspace that held a code of
 * its own with the same code and norm before the standard codes shipped: the hosted upgrade only adds, so that record
 * keeps its own texts and stored flag, and counts as the standard code when read.
 */
export const isStandardDefectCode = (row: { readonly [name: string]: unknown }) => row.system === true || STANDARD_KEYS.has(`${row.norm}\n${row.code}`);
