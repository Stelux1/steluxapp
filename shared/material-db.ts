import type { Row } from './types.ts';
import { requirementExecution } from './materials.ts';

/**
 * The Material database of MTO Pilot (hosted profile): the Add / Edit / Mass edit forms, the list's page sizes and
 * sorting, the Excel import with its preview, "Take over missing materials from this site", the UOM a material points
 * at and the ID of an operation phase. Pure rules, used by the server (which enforces them) and the pages.
 */
type Rows = Record<string, Row[] | undefined>;
const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const active = (rows: Row[] | undefined) => (rows || []).filter(row => !row._archived);
const byCreation = (a: Row, b: Row) => text(a._createdAt).localeCompare(text(b._createdAt)) || a.id.localeCompare(b.id);

// ----- list ---------------------------------------------------------------------------------------------------------

/** "Show [20] entries" of the reference list (capture mto__materials__material-database.txt:62,66). */
export const MATERIAL_PAGE_SIZES = [10, 20, 50, 100, 500];
export const MATERIAL_PAGE_SIZE = 20;
/** The reference opens the list sorted by its UOM column, ascending (DataTables order [[7, "asc"]]). */
export const MATERIAL_DEFAULT_SORT: { column: string; direction: 'asc' | 'desc' } = { column: 'uom', direction: 'asc' };
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** Sort rows on one column (text, numbers by value), ties by Material No. */
export function sortMaterials(rows: Row[], column: string, direction: 'asc' | 'desc'): Row[] {
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => sign * collator.compare(text(a[column]), text(b[column])) || collator.compare(text(a.materialNo), text(b.materialNo)) || a.id.localeCompare(b.id));
}
/** Footer of the reference list: "Showing 1 to 20 of 34 entries". */
export const showingEntries = (first: number, last: number, total: number) => `Showing ${total ? first : 0} to ${total ? last : 0} of ${total.toLocaleString('en')} entries`;

// ----- UOM --------------------------------------------------------------------------------------------------------

/** The UOMs record named `code` (exact name first, then ignoring case when only one matches). */
export function uomByName(uoms: Row[], code: unknown): Row | undefined {
  const wanted = text(code);
  if (!wanted) return undefined;
  const live = active(uoms);
  const exact = live.find(row => text(row.name) === wanted);
  if (exact) return exact;
  const loose = live.filter(row => text(row.name).toLowerCase() === wanted.toLowerCase());
  return loose.length === 1 ? loose[0] : undefined;
}
/** The UOM record id of a material: the stored reference, or (materials saved before UOMs were referenced) the UOM of its code. */
export const materialUomId = (material: Row, uoms: Row[]) => text(material.uomId) || uomByName(uoms, material.uom)?.id || '';
/** The UOM preselected when a material is added: EA, as the reference form does. */
export const DEFAULT_UOM = 'EA';
/** Whether a UOM is the one of a material (by reference, or by the code of a material saved before references). */
export const uomOfMaterial = (material: Row, uom: Pick<Row, 'id'> & { name?: unknown }) => text(material.uomId) ? material.uomId === uom.id : text(material.uom) !== '' && text(material.uom) === text(uom.name);
export const UOM_IN_USE = 'This UOM is used by materials in the Material database. Give those materials another UOM first.';
/**
 * The UOM fields a material write stores (hosted profile): the chosen UOM record and its code. A typed code must name a
 * UOMs record; a new material without a UOM gets EA. Returns the values to store or the field error.
 */
export function resolveMaterialUom(input: Record<string, unknown>, existing: Row | undefined, uoms: Row[]): { uomId: string; uom: string } | { error: [string, string] } {
  const live = active(uoms);
  if (text(input.uomId)) {
    const chosen = live.find(row => row.id === text(input.uomId));
    return chosen ? { uomId: chosen.id, uom: text(chosen.name) } : { error: ['uomId', 'Choose a UOM from the UOMs page.'] };
  }
  if (text(input.uom)) {
    const named = uomByName(live, input.uom);
    return named ? { uomId: named.id, uom: text(named.name) } : { error: [input.uomId !== undefined ? 'uomId' : 'uom', `UOM ${text(input.uom)} is not on the UOMs page.`] };
  }
  if (existing) {
    const kept = live.find(row => row.id === text(existing.uomId)) ?? (text(existing.uomId) ? undefined : uomByName(live, existing.uom));
    return kept ? { uomId: kept.id, uom: text(kept.name) } : { uomId: text(existing.uomId), uom: text(existing.uom) };
  }
  const fallback = uomByName(live, DEFAULT_UOM);
  return fallback ? { uomId: fallback.id, uom: text(fallback.name) } : { error: [input.uomId !== undefined ? 'uomId' : 'uom', 'UOM is required. Add it on the UOMs page first.'] };
}

// ----- forms ------------------------------------------------------------------------------------------------------

/** The Add / Edit material form of the reference, in its order (capture mto__materials__material-database.txt:137-171). */
export const MATERIAL_FORM_FIELDS = ['componentCode', 'materialGroup', 'articleNo', 'legacyNo', 'materialNo', 'dia', 'lbs', 'uomId', 'partId', 'typeId', 'description'];
/** The Mass edit materials form: every field but Material No, all optional (capture :184-224; Home location needs per-site materials). */
export const MASS_EDIT_FIELDS = ['componentCode', 'materialGroup', 'articleNo', 'legacyNo', 'dia', 'lbs', 'uomId', 'partId', 'typeId', 'description'];
export const MASS_EDIT_HELP = 'Changes apply to all selected materials. Leave a field empty to keep existing values. Material number cannot be changed.';
export const MASS_EDIT_BLANK = '-----------------------------';
/** What a mass edit writes: the filled fields only (an empty field keeps the stored values). */
export function massEditChanges(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => text(value) !== '').map(([name, value]) => [name, text(value)]));
}
/** Why a mass edit is refused, or '' (Material No is never changed for several materials at once). */
export function massEditRefusal(changes: Record<string, unknown>): string {
  if (Object.hasOwn(changes, 'materialNo')) return 'Material number cannot be changed with Mass edit.';
  if (Object.keys(changes).some(name => !MASS_EDIT_FIELDS.includes(name))) return 'An update field is invalid.';
  return Object.keys(changes).length ? '' : 'Fill in at least one field to change.';
}
/** Type of material in the material forms: "type / steel / description / basic material", empty parts kept. */
export const materialTypeLabel = (row: Record<string, unknown>) => [row.name, row.typeOfSteel, row.materialDescription, row.basicMaterial].map(text).join(' / ');
/** Options of a catalog select in the reference order (the record's own number, i.e. the order it was made in). */
export const catalogOrder = (rows: Row[] | undefined) => active(rows).sort(byCreation);

// ----- operation phases ----------------------------------------------------------------------------------------------

/** The ID of an operation phase: its own number, given on create; phases saved before keep the number typed as their ID. */
export function phaseNumber(phase: Row): number | undefined {
  const value = phase.number ?? phase.sort;
  return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
}
/** The next phase ID: one above every ID given so far, deleted phases included, so a number is never reused. */
export const nextPhaseNumber = (phases: Row[], counter = 0) => Math.max(counter, 0, ...phases.map(phase => phaseNumber(phase) ?? 0)) + 1;
/** Phases in ID order (the isometric's Type filter and the Add material Type select, whose first option is preselected). */
export const phasesById = (phases: Row[] | undefined) => active(phases).sort((a, b) => (phaseNumber(a) ?? Infinity) - (phaseNumber(b) ?? Infinity) || byCreation(a, b));
/** Phases by name, A-Z (the dashboard's Operation phase select and Set type). */
export const phasesByName = (phases: Row[] | undefined) => active(phases).sort((a, b) => collator.compare(text(a.name), text(b.name)) || byCreation(a, b));

// ----- import --------------------------------------------------------------------------------------------------------

export const MATERIAL_IMPORT_PATH = '/materials/material-import';
/** Columns of the Excel template, in the order of the reference's column list (capture mto__materials__material-database-import.txt:45). */
export const MATERIAL_IMPORT_COLUMNS: { header: string; field: string }[] = [
  { header: 'CC', field: 'componentCode' }, { header: 'Group', field: 'materialGroup' }, { header: 'Article No', field: 'articleNo' }, { header: 'Material No', field: 'materialNo' },
  { header: 'Description', field: 'description' }, { header: 'DIA', field: 'dia' }, { header: 'LBS/SCH', field: 'lbs' }, { header: 'UOM', field: 'uom' },
  { header: 'Legacy No', field: 'legacyNo' }, { header: 'Type Material', field: 'typeMaterial' }, { header: 'Material Part', field: 'materialPart' },
];
export const MATERIAL_IMPORT_INFO = 'The Excel columns match the Material database: CC, Group, Article No, Material No, Description, DIA, LBS/SCH, UOM. Optional extras: Legacy No, Type Material, Material Part. CC is 1=pipe, 2=supports, 3=appendages. The template includes example rows (pipe, valves, elbows, flanges, supports); keep or replace them.';
/** Example rows of our template (one per kind the info text names). */
export const MATERIAL_IMPORT_EXAMPLES: Record<string, string>[] = [
  { componentCode: '1', materialGroup: 'PIPE CS', articleNo: 'ART-2001', materialNo: 'EX-PIPE-0600-S40', description: 'Pipe seamless A106 Gr B 6" SCH 40', dia: '6', lbs: 'SCH 40', uom: 'M', legacyNo: '', typeMaterial: '', materialPart: 'Pipe' },
  { componentCode: '3', materialGroup: 'VALVE GATE', articleNo: 'ART-2002', materialNo: 'EX-VALVE-0200-150', description: 'Gate valve A216 WCB 2" class 150 RF', dia: '2', lbs: '150', uom: 'EA', legacyNo: '', typeMaterial: '', materialPart: 'Valve' },
  { componentCode: '3', materialGroup: 'ELBOW 90 CS', articleNo: 'ART-2003', materialNo: 'EX-ELB90-0600-S40', description: 'Elbow 90 LR BW A234 WPB 6" SCH 40', dia: '6', lbs: 'SCH 40', uom: 'EA', legacyNo: '', typeMaterial: '', materialPart: 'Elbow 90' },
  { componentCode: '3', materialGroup: 'FLANGE WN CS', articleNo: 'ART-2004', materialNo: 'EX-FLWN-0600-150', description: 'Flange WN RF A105 6" class 150 SCH 40', dia: '6', lbs: '150', uom: 'EA', legacyNo: '', typeMaterial: '', materialPart: 'Flange' },
  { componentCode: '2', materialGroup: 'SUPPORT', articleNo: 'ART-2005', materialNo: 'EX-SUP-SHOE-0600', description: 'Pipe shoe with welded base plate 6"', dia: '6', lbs: '', uom: 'EA', legacyNo: '', typeMaterial: '', materialPart: '' },
];
/** A heading as the reference compares it: lower case without spaces. */
export const normKey = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, '');
const HEADER_FIELDS: Record<string, string> = { ...Object.fromEntries(MATERIAL_IMPORT_COLUMNS.map(column => [normKey(column.header), column.field])), material: 'materialNo', typeofmaterial: 'typeMaterial', materialgroup: 'materialGroup', materialdescription: 'description', componentcode: 'componentCode' };
/** The material field a column heading of the uploaded file fills, or '' for a column the import does not read. */
export const importField = (header: unknown) => HEADER_FIELDS[normKey(header)] || '';
export const IMPORT_FIELDS = MATERIAL_IMPORT_COLUMNS.map(column => column.field);
export const IMPORT_ACTIONS = ['import', 'skip'] as const;
export type ImportAction = typeof IMPORT_ACTIONS[number];
/** Where a preview row came from: the uploaded file, or a take-over of the site's isometric / order materials. */
export type ImportSource = 'file' | 'iso' | 'order';
export interface ImportRowInput { rowNo: number; values: Record<string, string>; action?: unknown; source?: unknown; /** Material No of the isometric lines a take-over row stands for. */ origin?: unknown }
export interface ImportRow { rowNo: number; values: Record<string, string>; action: ImportAction; source: ImportSource; origin?: string; error: Record<string, string>; warning: Record<string, string> }
export interface ImportContext { materials: Row[]; uoms: Row[]; parts: Row[]; types: Row[] }
const byName = (rows: Row[], value: string) => active(rows).find(row => text(row.name).toLowerCase() === value.toLowerCase());
export const COMPONENT_CODES = ['', '1', '2', '3'];
/**
 * Check every row as the reference preview does: errors on an empty Material No or Material group, a UOM that is not a
 * UOMs record, a CC other than empty / 1 / 2 / 3, and a Type Material or Material Part that names no record; a Material
 * No that is already in the database is a warning (the row is imported only once its Material No is changed). A Material
 * No used twice in the file is an error on the later rows.
 */
export function materialImportPreview(input: ImportRowInput[], context: ImportContext): ImportRow[] {
  const existing = new Set(active(context.materials).map(material => text(material.materialNo)));
  const seen = new Set<string>();
  return input.map(({ rowNo, values: raw, action, source, origin }) => {
    const values = Object.fromEntries(IMPORT_FIELDS.map(field => [field, text(raw?.[field])]));
    const error: Record<string, string> = {}, warning: Record<string, string> = {};
    if (!values.materialNo) error.materialNo = 'Material No is required.';
    else if (seen.has(values.materialNo)) error.materialNo = 'This Material No is already on an earlier row of this import.';
    else if (existing.has(values.materialNo)) warning.materialNoExists = 'This Material No is already in the Material database. Change it to import the row.';
    if (values.materialNo) seen.add(values.materialNo);
    if (!values.materialGroup) error.materialGroup = 'Material group is required.';
    if (!uomByName(context.uoms, values.uom)) error.uom = values.uom ? `UOM ${values.uom} is not on the UOMs page.` : 'UOM is required.';
    if (!COMPONENT_CODES.includes(values.componentCode)) error.componentCode = 'CC must be empty, 1, 2 or 3.';
    if (values.typeMaterial && !byName(context.types, values.typeMaterial)) error.typeMaterial = `Type of material ${values.typeMaterial} is not in the list.`;
    if (values.materialPart && !byName(context.parts, values.materialPart)) error.materialPart = `Material part ${values.materialPart} is not in the list.`;
    const kind: ImportSource = source === 'iso' || source === 'order' ? source : 'file';
    return { rowNo, values, action: action === 'skip' ? 'skip' : 'import', source: kind, ...(kind !== 'file' && text(origin) ? { origin: text(origin) } : {}), error, warning };
  });
}
/** A row commit writes: chosen for import, no error and no warning. */
export const importable = (row: ImportRow) => row.action === 'import' && !Object.keys(row.error).length && !Object.keys(row.warning).length;
/** "Rows: n | Errors: n | Importable now: n". */
export function materialImportSummary(rows: ImportRow[]) {
  return { rows: rows.length, errors: rows.filter(row => Object.keys(row.error).length).length, importable: rows.filter(importable).length };
}
export const summaryText = (summary: ReturnType<typeof materialImportSummary>) => `Rows: ${summary.rows} | Errors: ${summary.errors} | Importable now: ${summary.importable}`;
/** The catalog record a valid row creates. */
export function importedMaterial(row: ImportRow, context: ImportContext): Record<string, string> {
  const { typeMaterial, materialPart, uom, ...plain } = row.values;
  return { ...plain, uomId: uomByName(context.uoms, uom)?.id || '', typeId: typeMaterial ? byName(context.types, typeMaterial)?.id || '' : '', partId: materialPart ? byName(context.parts, materialPart)?.id || '' : '' };
}

// ----- take over missing materials ------------------------------------------------------------------------------------

export interface MissingMaterial { materialNo: string; values: Record<string, string>; requirementIds: string[]; onOrder: boolean }
/**
 * Unique materials on the isometrics of a main project that are not in the Material database (custom lines, by Material No),
 * and whether each still appears on Order materials (a line with a quantity left to order).
 */
export function missingCatalogMaterials(rows: Rows, siteId: string): MissingMaterial[] {
  const catalog = new Set(active(rows.materials).map(material => text(material.materialNo)));
  const projects = new Set(active(rows.projects).filter(project => !siteId || project.siteId === siteId).map(project => project.id));
  const isos = new Set(active(rows.isometrics).filter(iso => projects.has(String(iso.projectId))).map(iso => iso.id));
  const toOrder = new Set(requirementExecution(rows as Record<string, Row[]>).filter(line => line.toOrder > 0).map(line => line.requirement.id));
  const found = new Map<string, MissingMaterial>();
  for (const line of active(rows.iso_materials).sort(byCreation)) {
    const materialNo = text(line.materialNo);
    if (line.materialId || !line.customMaterial || !materialNo || catalog.has(materialNo) || !isos.has(String(line.isoId))) continue;
    const entry = found.get(materialNo) ?? { materialNo, requirementIds: [], onOrder: false, values: { componentCode: text(line.componentCode), materialGroup: text(line.materialGroup), articleNo: text(line.articleNo), materialNo, description: text(line.description), dia: text(line.dia), lbs: text(line.lbs), uom: text(line.uom), legacyNo: text(line.legacyNo), typeMaterial: '', materialPart: '' } };
    entry.requirementIds.push(line.id);
    if (toOrder.has(line.id)) entry.onOrder = true;
    found.set(materialNo, entry);
  }
  return [...found.values()];
}
export const takeOverCounts = (missing: MissingMaterial[]) => ({ iso: missing.length, order: missing.filter(item => item.onOrder).length });
export const takeOverText = (counts: { iso: number; order: number }) => `Missing from catalog: ${counts.iso} unique isometric material(s), of which ${counts.order} still appear on Order materials.`;
export const TAKE_OVER_HELP = 'Creates catalog rows for unique materials that are already on isometrics or still on Order materials, but not yet in this site material database. Review the preview before commit.';
/** Preview rows of a take-over: every missing material ('iso') or those still on Order materials ('order'). */
export const takeOverRows = (missing: MissingMaterial[], source: 'iso' | 'order'): ImportRowInput[] =>
  missing.filter(item => source === 'iso' || item.onOrder).map((item, index) => ({ rowNo: index + 1, values: item.values, source, origin: item.materialNo }));
