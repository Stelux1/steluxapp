/**
 * Import certifications (Weld Pilot → Material data → Certifications, hosted profile): the sheet columns and how a
 * sheet row becomes a certificate. Pure functions, used by the server preview / commit and by the preview table.
 *
 * The reference's own template could not be read (capture weld__material__certifications-import.txt shows the page and
 * the preview columns, not the sheet). The sheet therefore follows the Add certification form of the reference in its
 * field order, with the index number first as in the reference preview (a point to confirm with the client).
 */
import type { Row } from './types.ts';

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const key = (value: unknown) => text(value).replace(/\s+/g, ' ').toLowerCase();

export type ImportLookup = 'materials' | 'diameters' | 'material_parts' | 'material_types' | 'suppliers' | 'projects';
export interface ImportColumn { header: string; field: string; lookup?: ImportLookup; flag?: boolean }
/** Sheet columns: index number, then the Add certification form in the reference order. */
export const CERTIFICATE_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Index number', field: 'indexNo' },
  { header: 'Charge number', field: 'chargeNo' },
  { header: 'Attest number', field: 'name' },
  { header: 'Material', field: 'materialId', lookup: 'materials' },
  { header: 'Diameter', field: 'diameterId', lookup: 'diameters' },
  { header: 'Material part', field: 'materialPartId', lookup: 'material_parts' },
  { header: 'Type of material', field: 'materialTypeId', lookup: 'material_types' },
  { header: 'Schedule', field: 'schedule' },
  { header: 'Wall thickness', field: 'wallThickness' },
  { header: 'Hot yield', field: 'hotYield' },
  { header: 'Impact strength', field: 'impactStrength' },
  { header: 'Certificate-type', field: 'certType' },
  { header: 'Supplier', field: 'supplierId', lookup: 'suppliers' },
  { header: 'Project', field: 'projectIds', lookup: 'projects' },
  { header: 'Controlled', field: 'controlled', flag: true },
  { header: 'Accepted', field: 'accepted', flag: true },
  { header: 'Note', field: 'description' },
];
/** Columns of the preview table (the reference preview: Index, Charge, CertType, Attest, Wall, Schedule, TypeMaterial, MaterialPart, Diameter, Supplier, Ctr, Acc). */
export const CERTIFICATE_PREVIEW_COLUMNS = ['indexNo', 'chargeNo', 'certType', 'name', 'wallThickness', 'schedule', 'materialTypeId', 'materialPartId', 'diameterId', 'supplierId', 'controlled', 'accepted'];
export const IMPORT_ROW_LIMIT = 1000;

/** The option text of a type of material in the reference ("A234 Gr WPB/CS/Fitting/"). */
export const materialTypeOption = (row: Row) => [text(row.name), text(row.typeOfSteel), text(row.materialDescription), text(row.basicMaterial)].join('/');
/** How a sheet value names a record of each lookup. */
const NAMES: Record<ImportLookup, (row: Row) => string[]> = {
  materials: row => [text(row.materialNo)],
  diameters: row => [text(row.diameter)],
  material_parts: row => [text(row.name)],
  material_types: row => [text(row.name), materialTypeOption(row)],
  suppliers: row => [text(row.name)],
  projects: row => [text(row.internnumber)],
};
const NOUNS: Record<ImportLookup, string> = { materials: 'material', diameters: 'weld diameter', material_parts: 'material part', material_types: 'type of material', suppliers: 'supplier', projects: 'project' };

/** The one active record a sheet value names; an error text when none or several do. */
export function findByName(lookup: ImportLookup, value: unknown, rows: Row[]): { id: string } | { error: string } {
  const wanted = key(value);
  const matches = rows.filter(row => !row._archived && NAMES[lookup](row).some(name => key(name) === wanted));
  if (matches.length === 1) return { id: matches[0].id };
  return { error: matches.length ? `Several ${NOUNS[lookup]} records are called "${text(value)}". Choose one.` : `No ${NOUNS[lookup]} "${text(value)}".` };
}
/** Yes / No cells: empty is No. */
export function flagValue(value: unknown): boolean | null {
  const raw = key(value);
  if (['', '0', 'no', 'n', 'false', 'nee'].includes(raw)) return false;
  if (['1', 'yes', 'y', 'true', 'x', 'ja', 'j'].includes(raw)) return true;
  return null;
}

export interface ImportedRow {
  /** Row number in the sheet (the header is row 1). */
  row: number;
  /** The sheet cells by header. */
  cells: Record<string, string>;
  /** The certificate as it would be saved (record ids for the lookups). */
  values: Record<string, unknown>;
  /** Problems per field of `values`. */
  errors: Record<string, string>;
}
/**
 * One sheet row as a certificate of the main project `siteId`. `projects` are the projects of that main project only,
 * so a project of another main project is reported as unknown. Project "ALL" (or empty) means all projects.
 */
export function importRow(row: number, cells: Record<string, string>, lookups: Record<ImportLookup, Row[]>): ImportedRow {
  const values: Record<string, unknown> = {}, errors: Record<string, string> = {};
  const cell = (column: ImportColumn) => text(Object.entries(cells).find(([header]) => key(header) === key(column.header))?.[1]);
  for (const column of CERTIFICATE_IMPORT_COLUMNS) {
    const value = cell(column);
    if (column.flag) { const flag = flagValue(value); values[column.field] = flag ?? false; if (flag === null) errors[column.field] = `${column.header} must be Yes or No.`; continue; }
    if (column.lookup === 'projects') {
      const names = value.split(/[,;|]/).map(name => name.trim()).filter(Boolean);
      if (!names.length || names.some(name => key(name) === 'all')) { values.allProjects = true; values.projectIds = []; continue; }
      const found = names.map(name => findByName('projects', name, lookups.projects));
      const problem = found.find((item): item is { error: string } => 'error' in item);
      values.allProjects = false; values.projectIds = found.filter((item): item is { id: string } => 'id' in item).map(item => item.id);
      if (problem) errors.projectIds = problem.error;
      continue;
    }
    if (column.lookup) {
      if (!value) { values[column.field] = ''; continue; }
      const found = findByName(column.lookup, value, lookups[column.lookup]);
      if ('id' in found) values[column.field] = found.id; else { values[column.field] = ''; errors[column.field] = found.error; }
      continue;
    }
    values[column.field] = value;
  }
  return { row, cells, values, errors };
}
/** Count of the preview: rows, rows with errors, rows that would be imported now. */
export function importSummary(rows: { errors: Record<string, string>; action: string }[]) {
  const errors = rows.filter(row => Object.keys(row.errors).length).length;
  return { rows: rows.length, errors, importable: rows.filter(row => row.action === 'import' && !Object.keys(row.errors).length).length };
}
