import { DEFECT_NORMS } from './site-settings.ts';

/**
 * The standard defect codes the workspace ships (Weld Pilot -> NDT data -> Defect codes): ISO 6520-1, ASME B31.3 and
 * API 1104, each with its English and Dutch text, its group and its ISO 6520-1 reference, as the reference product
 * lists them. They are system data: locked against editing and deleting, switched on or off per main project only.
 * The reference lists 98 standard codes; these 40 are the rows captured so far (rows 41 to 98 still have to be read).
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
