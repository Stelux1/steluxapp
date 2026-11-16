import type { Field, Row } from './types.ts';
import { isoImportPreview } from './mto-materials.ts';
import { planWeldRange } from './weld-entry.ts';

/**
 * Projects → Import (reference weld__welding__projects.txt:168-232, weld__welding__projects-import.txt:142-188; manuals
 * weld__user__manual-mtopilot.txt:313 and weld__user__user-manuals.txt:492):
 * - "Import projects": one row per project of the open main project;
 * - "Import all project data": one row per isometric, with its project, an optional weld range (Wt.Start / Wt.End) and an
 *   optional material line; several rows of one isometric add several material lines.
 * Row 1 of the template holds a hint per column, row 2 the headers (the labels of Edit project / Edit isometric), the data
 * starts on row 3. Everything here is pure: the server reads the sheet, passes the current data in and writes the plan.
 */

export type ImportMode = 'projects' | 'full';
export type ImportPart = 'projects' | 'isometrics' | 'welds' | 'iso_materials';
export const IMPORT_MODES: ImportMode[] = ['projects', 'full'];

/** The titles of the two dialogs and their menu entries per pilot (Weld Pilot says "WP" for work package, reference :406). */
export const IMPORT_TITLES: Record<ImportMode, string> = { projects: 'Import projects', full: 'Import all project data' };
export const IMPORT_MENU: Record<string, Record<ImportMode, string>> = {
  weld: { projects: 'Import projects', full: 'Import all WP data' },
  mto: { projects: 'Import projects', full: 'Import all project data' },
};
export const importMenuLabel = (pilot: string | undefined, mode: ImportMode) => (IMPORT_MENU[pilot || ''] ?? IMPORT_MENU.mto)[mode];

/** What each part is called in a refusal. */
export const IMPORT_PART_NAMES: Record<ImportPart, string> = { projects: 'projects', isometrics: 'isometrics', welds: 'welds', iso_materials: 'materials in isometrics' };

/**
 * THE header table of the import. The vendor's exact template headers are not known (a question for the client): the
 * columns follow the labels of Edit project / Edit isometric, so a changed label changes the template, and every rule
 * below works on field names. To read another header, add it to `headers` (replaces the label) or `aliases` (read as well).
 */
export const IMPORT_TABLE = {
  /** Fields of the forms that are not imported: the open main project and the application visibility come from the page; Test system, X Ray %, Price and the isometric memo are never imported (manual :313). */
  exclude: {
    projects: ['siteId', 'weldPilot', 'mtoPilot'],
    isometrics: ['projectId', 'testSystemId', 'xRay', 'description', 'fieldPackageId', 'price'],
  } as Record<'projects' | 'isometrics', string[]>,
  /** Form sections that are progress, phase or release state of the record, not header values. */
  excludeSections: ['Progress', 'Phases', 'Release', 'Schedule'],
  headers: { projects: {}, isometrics: {} } as Record<'projects' | 'isometrics', Record<string, string>>,
  aliases: {
    projects: { internnumber: ['Intern prj. no.', 'InternalNo', 'ProjectNo', 'Internal project number'], externnumber: ['Extern prj. no.', 'ExternalNo'], companyId: ['Customer', 'Company'], phone: ['Phone'] },
    isometrics: { isoNo: ['Iso number', 'Iso', 'IsoNo'], revNo: ['Rev'], noBo: ['NoBo'], pwht: ['PWHT'] },
  } as Record<'projects' | 'isometrics', Record<string, string[]>>,
  welds: [
    { field: 'start', header: 'Wt.Start', aliases: ['Weld no. Start'], hint: 'First weld number of the range (whole number).' },
    { field: 'end', header: 'Wt.End', aliases: ['Weld no. End'], hint: 'Last weld number of the range (whole number).' },
  ],
  /** One material line of the isometric; the fields are those of the Import in ISO rules (shared/mto-materials.ts). */
  materials: [
    { field: 'componentCode', header: 'Component code', aliases: ['CC', 'Component code (ISO progress)'], hint: '1=pipe, 2=supports, 3=appendages.' },
    { field: 'materialGroup', header: 'Material group', aliases: ['Group'], hint: 'Text.' },
    { field: 'articleNo', header: 'Article No', aliases: [], hint: 'Text.' },
    { field: 'materialNo', header: 'Material No', aliases: ['MaterialNo'], hint: 'Material No of the Material database; another number becomes a custom material.' },
    { field: 'description', header: 'Material description', aliases: [], hint: 'Needed for a material that is not in the Material database.' },
    { field: 'dia', header: 'DIA', aliases: ['Dia1'], hint: 'Text.' },
    { field: 'lbs', header: 'LBS/SCH', aliases: ['LBS'], hint: 'Text.' },
    { field: 'uom', header: 'UOM', aliases: [], hint: 'A UOM name, for example EA or M (empty: EA).' },
    { field: 'quantity', header: 'Qty', aliases: ['Quantity'], hint: 'Number from 0.01, rounded to three decimals.' },
    { field: 'phase', header: 'Type', aliases: ['Operation phase'], hint: 'Shop, Field or another name from the Type table (empty: the first type).' },
  ],
} as const;

export interface ImportColumn {
  /** `${part}.${field}`, the key of a sheet row's values. */
  key: string; part: ImportPart; field: string; header: string; aliases: string[];
  type: string; options?: string[]; ref?: string; required?: boolean; hint: string;
}
const formPart = (part: 'projects' | 'isometrics', fields: Field[], required: string[]): ImportColumn[] => fields
  .filter(field => !field.hidden && !field.readonly && !IMPORT_TABLE.exclude[part].includes(field.name) && !(IMPORT_TABLE.excludeSections as readonly string[]).includes(field.section || ''))
  .map(field => ({
    key: `${part}.${field.name}`, part, field: field.name, header: IMPORT_TABLE.headers[part][field.name] || field.label, aliases: IMPORT_TABLE.aliases[part][field.name] || [],
    type: field.type, ...(field.options ? { options: field.options } : {}), ...(field.ref ? { ref: field.ref } : {}), ...(required.includes(field.name) ? { required: true } : {}),
    hint: cellHint(field, required.includes(field.name)),
  }));
/** Row 1 of the template: what a column expects. */
function cellHint(field: Field, required: boolean): string {
  const kind = field.type === 'number' ? 'Number (rounded to three decimals).' : field.type === 'date' ? 'Date as YYYY-MM-DD.' : field.type === 'checkbox' ? 'Yes or No.'
    : field.type === 'select' && field.options ? `One of: ${field.options.filter(Boolean).join(', ')}.` : field.ref ? 'A name from the list of the form.' : 'Text.';
  return required ? `Required. ${kind}` : kind;
}
/**
 * The columns of a mode, in template order: the project columns (Edit project), then the isometric columns (Edit
 * isometric), the weld range and the material line. `forms` are the fields of the two forms as the profile delivers them.
 */
export function importColumns(mode: ImportMode, forms: { projects: Field[]; isometrics: Field[] }): ImportColumn[] {
  const columns = formPart('projects', forms.projects, ['internnumber']);
  if (mode === 'full') {
    columns.push(...formPart('isometrics', forms.isometrics, ['isoNo']));
    columns.push(...IMPORT_TABLE.welds.map(item => ({ key: `welds.${item.field}`, part: 'welds' as const, field: item.field, header: item.header, aliases: [...item.aliases], type: 'number', hint: item.hint })));
    columns.push(...IMPORT_TABLE.materials.map(item => ({ key: `iso_materials.${item.field}`, part: 'iso_materials' as const, field: item.field, header: item.header, aliases: [...item.aliases], type: item.field === 'quantity' ? 'number' : 'text', hint: item.hint })));
  }
  // A header used twice (for example Description in both forms) is named after its part, so every column stays readable.
  const seen = new Set<string>();
  return columns.map(column => {
    let header = column.header;
    if (seen.has(heading(header))) header = `${column.part === 'projects' ? 'Project' : column.part === 'isometrics' ? 'Isometric' : column.part === 'welds' ? 'Weld' : 'Material'} ${header.charAt(0).toLowerCase()}${header.slice(1)}`;
    seen.add(heading(header));
    return { ...column, header };
  });
}
const heading = (value: string) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** The column of each sheet header (index → column key); headers are matched without case and punctuation, an alias only where no column has that header. */
export function headerColumns(headers: string[], columns: ImportColumn[]): Map<number, string> {
  const result = new Map<number, string>(), taken = new Set<string>();
  const exact = new Map(columns.map(column => [heading(column.header), column.key]));
  const alias = new Map<string, string>();
  for (const column of columns) for (const name of column.aliases) if (!exact.has(heading(name)) && !alias.has(heading(name))) alias.set(heading(name), column.key);
  headers.forEach((header, index) => {
    const key = exact.get(heading(header)) ?? alias.get(heading(header));
    if (key && !taken.has(key)) { result.set(index, key); taken.add(key); }
  });
  return result;
}

/** Example rows of the template (row 3 on): PROJECT 001 with two material lines and a weld range, PROJECT 002 with one isometric. */
export function templateExamples(mode: ImportMode, columns: ImportColumn[]): string[][] {
  const examples: Record<string, string>[] = mode === 'projects'
    ? [{ 'projects.internnumber': 'PROJECT 001', 'projects.description': 'Example project 1' }, { 'projects.internnumber': 'PROJECT 002', 'projects.description': 'Example project 2' }]
    : [
      { 'projects.internnumber': 'PROJECT 001', 'projects.description': 'Example project 1', 'isometrics.isoNo': 'ISO-001', 'isometrics.revNo': '0', 'welds.start': '1', 'welds.end': '3', 'iso_materials.componentCode': '1', 'iso_materials.materialNo': 'EXAMPLE-PIPE-DN50', 'iso_materials.description': 'Example pipe DN50', 'iso_materials.dia': 'DN50', 'iso_materials.uom': 'M', 'iso_materials.quantity': '6', 'iso_materials.phase': 'Shop' },
      { 'projects.internnumber': 'PROJECT 001', 'isometrics.isoNo': 'ISO-001', 'iso_materials.componentCode': '2', 'iso_materials.materialNo': 'EXAMPLE-SUPPORT', 'iso_materials.description': 'Example pipe support', 'iso_materials.uom': 'EA', 'iso_materials.quantity': '2', 'iso_materials.phase': 'Shop' },
      { 'projects.internnumber': 'PROJECT 002', 'projects.description': 'Example project 2', 'isometrics.isoNo': 'ISO-002', 'isometrics.revNo': '0', 'welds.start': '1', 'welds.end': '2' },
    ];
  return examples.map(example => columns.map(column => example[column.key] ?? ''));
}

// ----- reading the cells -------------------------------------------------------------------------------------------

/** Rounding of every imported quantity and number (manual :313: three decimals). */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;
const YES = ['yes', 'y', 'ja', 'true', '1', 'x'], NO = ['no', 'n', 'nee', 'false', '0'];
/** A date cell as YYYY-MM-DD (also DD-MM-YYYY, DD.MM.YYYY and DD/MM/YYYY), or undefined. */
export function importDate(value: string): string | undefined {
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  const parts = match ? [match[1], match[2], match[3]] : (match = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(text)) ? [match[3], match[2], match[1]] : null;
  if (!parts) return undefined;
  const [y, m, d] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Records offered for a reference column, and the field they are named by. */
export interface RefList { rows: Row[]; display: string; title: string }
/** One cell read for its form field: the value to store, or the reason it cannot be imported. */
export function readCell(column: ImportColumn, raw: string, refs: Record<string, RefList> = {}): { value?: unknown; error?: string } {
  const text = raw.trim();
  if (column.type === 'number') {
    const number = Number(text.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(number) && text !== '' ? { value: round3(number) } : { error: 'Enter a number.' };
  }
  if (column.type === 'date') { const date = importDate(text); return date ? { value: date } : { error: 'Enter a date as YYYY-MM-DD.' }; }
  if (column.type === 'checkbox') return YES.includes(text.toLowerCase()) ? { value: true } : NO.includes(text.toLowerCase()) ? { value: false } : { error: 'Enter Yes or No.' };
  if (column.type === 'select' && column.options) {
    const option = column.options.find(item => item.toLowerCase() === text.toLowerCase());
    return option !== undefined ? { value: option } : { error: `Use one of: ${column.options.filter(Boolean).join(', ')}.` };
  }
  if (column.ref) {
    const list = refs[column.ref];
    const found = list?.rows.find(row => !row._archived && String(row[list.display] ?? '').trim().toLowerCase() === text.toLowerCase());
    return found ? { value: found.id } : { error: `${text} is not in ${list?.title || 'the list'}.` };
  }
  return { value: text.slice(0, 2000) };
}

// ----- the plan ------------------------------------------------------------------------------------------------------

export interface SheetRow { rowNo: number; values: Record<string, string> }
/** The data an import is checked against, as it is now. Every list belongs to the open main project. */
export interface ImportContext {
  /** Projects of the open main project, archived ones included. */
  projects: Row[];
  /** Isometrics of those projects, archived ones included. */
  isometrics: Row[];
  /** Live weld numbers per isometric id. */
  weldNumbers: Record<string, string[]>;
  /** Live material lines per isometric id: Material No and Type (operation phase id). */
  materialLines: Record<string, { materialNo: string; phaseId: string }[]>;
  /** Records of the reference columns (companies, ITPs, …) by resource. */
  refs: Record<string, RefList>;
  /** What the material line is checked against: the Material database of the main project, the UOMs and the types. */
  materialRows: { materials: Row[]; uoms: Row[]; operation_phases: Row[] };
  /** Projects not shown in the current pilot (switched off there). */
  hiddenProjects?: Set<string>;
}
export interface ImportOptions { mode: ImportMode; withWelds?: boolean }
export type RowAction = 'New' | 'Update' | 'No change' | 'Error';
/** A preview row (reference columns # Actie ProjectNo Iso Rev Welds Dia MaterialNo Description LBS UOM Qty). */
export interface PreviewRow {
  rowNo: number; action: RowAction; projectNo: string; isoNo: string; rev: string; welds: string;
  materialNo: string; description: string; dia: string; lbs: string; uom: string; qty: string;
  /** The project cells of the row as typed (the preview of Import projects shows them). */
  project: Record<string, string>;
  /** Problems of the row, each naming its column. */
  errors: string[];
  /** The material line is already on the isometric (same Material No and Type): it is not added again. */
  materialExists?: boolean;
}
export interface ProjectPlan { internnumber: string; existing?: Row; values: Record<string, unknown> }
export interface IsoPlan {
  key: string; internnumber: string; isoNo: string; existing?: Row; values: Record<string, unknown>;
  /** Weld ranges of the rows, in row order, with the numbers each adds. */
  ranges: { start: number; end: number; numbers: string[] }[];
  /** Material lines to add, as rows of the Import in ISO rules. */
  materials: SheetRow[];
}
export interface ImportPlan {
  rows: PreviewRow[]; projects: ProjectPlan[]; isometrics: IsoPlan[];
  /** What the import writes per part (records created or updated): the right of each part with writes is checked. */
  writes: Record<ImportPart, { insert: number; edit: number }>;
  summary: ImportSummary;
}
export interface ImportSummary { rows: number; errors: number; importable: number; projects: { created: number; updated: number }; isometrics: { created: number; updated: number }; welds: number; materials: number }

const same = (a: unknown, b: unknown) => a === b || (a === '' || a === undefined || a === null) && (b === '' || b === undefined || b === null) || typeof a === 'number' && Number(b) === a || String(a ?? '') === String(b ?? '');
const cell = (row: SheetRow, key: string) => (row.values[key] ?? '').trim();

/**
 * Check every row against the data as it is now and plan the writes. A row with an error writes nothing; the other rows
 * create new projects and isometrics, and fill the non-empty cells into existing ones (an empty cell keeps the value).
 * Existing welds are never changed: a weld range only adds the missing numbers. A material line whose Material No and
 * Type are already on the isometric is not added again, so a second import of the same file writes nothing.
 */
export function planImport(input: SheetRow[], columns: ImportColumn[], context: ImportContext, options: ImportOptions): ImportPlan {
  const full = options.mode === 'full', withWelds = full && options.withWelds !== false;
  const projectColumns = columns.filter(column => column.part === 'projects'), isoColumns = columns.filter(column => column.part === 'isometrics');
  const materialColumns = columns.filter(column => column.part === 'iso_materials');
  const headerOf = (key: string) => columns.find(column => column.key === key)?.header || key;
  const projects = new Map<string, ProjectPlan>(), isometrics = new Map<string, IsoPlan>();
  const rows: PreviewRow[] = [];
  for (const sheet of input) {
    const errors: string[] = [];
    const fail = (key: string, message: string) => errors.push(`${headerOf(key)}: ${message}`);
    const read = (list: ImportColumn[]) => {
      const values: Record<string, unknown> = {};
      for (const column of list) {
        const raw = cell(sheet, column.key);
        if (!raw) { if (column.required) fail(column.key, 'Required.'); continue; }
        const result = readCell(column, raw, context.refs);
        if (result.error) fail(column.key, result.error); else values[column.field] = result.value;
      }
      return values;
    };
    const projectValues = read(projectColumns), isoValues = full ? read(isoColumns) : {};
    const internnumber = String(projectValues.internnumber ?? ''), isoNo = String(isoValues.isoNo ?? '');
    const preview: PreviewRow = {
      rowNo: sheet.rowNo, action: 'Error', projectNo: cell(sheet, 'projects.internnumber'), isoNo: cell(sheet, 'isometrics.isoNo'), rev: cell(sheet, 'isometrics.revNo'), welds: '',
      materialNo: cell(sheet, 'iso_materials.materialNo'), description: cell(sheet, 'iso_materials.description'), dia: cell(sheet, 'iso_materials.dia'), lbs: cell(sheet, 'iso_materials.lbs'), uom: cell(sheet, 'iso_materials.uom'), qty: cell(sheet, 'iso_materials.quantity'), errors,
      project: Object.fromEntries(projectColumns.map(column => [column.field, cell(sheet, column.key)]).filter(([, value]) => value)),
    };
    rows.push(preview);
    const existingProject = internnumber ? context.projects.find(project => String(project.internnumber ?? '').trim() === internnumber) : undefined;
    if (existingProject?._archived) fail('projects.internnumber', `Project ${internnumber} is deleted. Bring it back before importing into it.`);
    else if (existingProject && context.hiddenProjects?.has(existingProject.id)) fail('projects.internnumber', `Project ${internnumber} is not shown in this application.`);
    const existingIso = full && existingProject && isoNo ? context.isometrics.find(iso => iso.projectId === existingProject.id && String(iso.isoNo ?? '').trim() === isoNo) : undefined;
    if (existingIso?._archived) fail('isometrics.isoNo', `Isometric ${isoNo} is deleted. Bring it back before importing into it.`);
    const isoKey = `${internnumber}\u0000${isoNo}`;
    const planned = isometrics.get(isoKey);
    // Weld range: both cells or none; the numbers already there (or added by an earlier row) are skipped.
    let range: IsoPlan['ranges'][number] | undefined;
    const start = cell(sheet, 'welds.start'), end = cell(sheet, 'welds.end');
    if (withWelds && (start || end)) {
      if (!start || !end) fail(start ? 'welds.end' : 'welds.start', 'Fill both Wt.Start and Wt.End.');
      else {
        const present = [...(existingIso ? context.weldNumbers[existingIso.id] || [] : []), ...(planned?.ranges.flatMap(item => item.numbers) || [])];
        try { const plan = planWeldRange(start, end, present); range = { start: Number(start), end: Number(end), numbers: plan.numbers }; preview.welds = plan.numbers.length ? `${plan.numbers[0]}–${plan.numbers[plan.numbers.length - 1]} (${plan.numbers.length})` : '0'; }
        catch (error) { fail('welds.start', (error as Error).message); }
      }
    }
    // Material line: checked by the Import in ISO rules; one already on the isometric is not added again.
    let material: SheetRow | undefined;
    if (full && materialColumns.some(column => cell(sheet, column.key))) {
      const values = Object.fromEntries(materialColumns.map(column => [column.field, cell(sheet, column.key)]).filter(([, value]) => value));
      const [checked] = isoImportPreview([{ rowNo: sheet.rowNo, values }], context.materialRows);
      for (const [field, message] of Object.entries(checked.error)) fail(`iso_materials.${field}`, message);
      if (checked.quantity !== undefined) preview.qty = String(checked.quantity);
      if (!Object.keys(checked.error).length) {
        const materialNo = String(values.materialNo).trim().toLowerCase();
        const onIso = (existingIso ? context.materialLines[existingIso.id] || [] : []).some(line => line.materialNo.trim().toLowerCase() === materialNo && line.phaseId === checked.phaseId);
        if (onIso) preview.materialExists = true; else material = { rowNo: sheet.rowNo, values };
      }
    }
    if (errors.length) continue;
    // The row is valid: merge it into the plan (later rows of the same project / isometric fill further cells).
    let changed = false, created = false;
    let project = projects.get(internnumber);
    if (!project) { project = { internnumber, existing: existingProject, values: existingProject ? {} : { internnumber } }; projects.set(internnumber, project); if (!existingProject) created = true; }
    for (const [name, value] of Object.entries(projectValues)) if (project.existing ? !same(value, project.existing[name]) && !same(value, project.values[name]) : !same(value, project.values[name])) { project.values[name] = value; changed = true; }
    if (full) {
      let iso = isometrics.get(isoKey);
      if (!iso) { iso = { key: isoKey, internnumber, isoNo, existing: existingIso, values: existingIso ? {} : { isoNo }, ranges: [], materials: [] }; isometrics.set(isoKey, iso); if (!existingIso) created = true; }
      for (const [name, value] of Object.entries(isoValues)) if (iso.existing ? !same(value, iso.existing[name]) && !same(value, iso.values[name]) : !same(value, iso.values[name])) { iso.values[name] = value; changed = true; }
      if (range) { iso.ranges.push(range); if (range.numbers.length) changed = true; }
      if (material) { iso.materials.push(material); changed = true; }
    }
    preview.action = created ? 'New' : changed ? 'Update' : 'No change';
  }
  const projectList = [...projects.values()], isoList = [...isometrics.values()];
  const count = (list: { existing?: Row; values: Record<string, unknown> }[]) => ({ insert: list.filter(item => !item.existing).length, edit: list.filter(item => item.existing && Object.keys(item.values).length).length });
  const welds = isoList.reduce((sum, iso) => sum + iso.ranges.reduce((total, item) => total + item.numbers.length, 0), 0), materials = isoList.reduce((sum, iso) => sum + iso.materials.length, 0);
  const writes: ImportPlan['writes'] = { projects: count(projectList), isometrics: count(isoList), welds: { insert: welds, edit: 0 }, iso_materials: { insert: materials, edit: 0 } };
  const errors = rows.filter(row => row.action === 'Error').length;
  return {
    rows, projects: projectList, isometrics: isoList, writes,
    summary: { rows: rows.length, errors, importable: rows.length - errors, projects: { created: writes.projects.insert, updated: writes.projects.edit }, isometrics: { created: writes.isometrics.insert, updated: writes.isometrics.edit }, welds, materials },
  };
}

/** The parts an import writes, with the right each needs: import, and add / edit for what it creates / changes. */
export function neededRights(plan: Pick<ImportPlan, 'writes'>, mode: ImportMode): [ImportPart, ('import' | 'insert' | 'edit')[]][] {
  return (Object.entries(plan.writes) as [ImportPart, { insert: number; edit: number }][])
    .filter(([part, writes]) => writes.insert || writes.edit || part === (mode === 'projects' ? 'projects' : 'isometrics'))
    .map(([part, writes]) => [part, ['import', ...(writes.insert ? ['insert' as const] : []), ...(writes.edit ? ['edit' as const] : [])]]);
}

/** Preview rows shown by default: every error row plus 100 importable rows (reference "Show all rows"). */
export const PREVIEW_IMPORTABLE_ROWS = 100;
export const previewRows = (rows: PreviewRow[], all: boolean) => {
  if (all) return rows;
  let importable = 0;
  return rows.filter(row => row.action === 'Error' || importable++ < PREVIEW_IMPORTABLE_ROWS);
};
export const SHOW_ALL_ROWS = { label: 'Show all rows', hint: 'Default: all errors plus 100 importable rows.' } as const;
export const summaryText = (summary: ImportSummary) => `${summary.rows} rows: ${summary.importable} importable, ${summary.errors} with errors. Projects: ${summary.projects.created} new, ${summary.projects.updated} updated. Isometrics: ${summary.isometrics.created} new, ${summary.isometrics.updated} updated. Welds to add: ${summary.welds}. Material lines to add: ${summary.materials}.`;
/** Clean import of Import projects (reference: "Current list will be deleted"). */
export const CLEAN_PROJECTS_LABEL = 'Check if you want clean import (Current list will be deleted)';
export const CLEAN_PROJECTS_HINT = 'Projects of this main project that are not in the file are deleted; a project with isometrics is kept and listed.';
export const WITH_WELDS_LABEL = 'With welds';
/**
 * Preview table columns after # and Action (reference :190 "# Actie InternalNo ExternalNo Description Customer Contact Phone
 * Fax Authority" and :226 / projects-import.txt:188 "# Actie ProjectNo Iso Rev Welds Dia MaterialNo Description LBS Dia1 Dia2
 * UOM Qty"). Projects have no fax and a material line one diameter, so Fax, Dia2 and the weld Dia are left out.
 */
export const PREVIEW_COLUMNS: Record<ImportMode, { key: string; header: string; project?: boolean }[]> = {
  projects: [['internnumber', 'InternalNo'], ['externnumber', 'ExternalNo'], ['description', 'Description'], ['companyId', 'Customer'], ['contact', 'Contact'], ['phone', 'Phone'], ['authority', 'Authority']].map(([key, header]) => ({ key, header, project: true })),
  full: [['projectNo', 'ProjectNo'], ['isoNo', 'Iso'], ['rev', 'Rev'], ['welds', 'Welds'], ['materialNo', 'MaterialNo'], ['description', 'Description'], ['lbs', 'LBS'], ['dia', 'Dia1'], ['uom', 'UOM'], ['qty', 'Qty']].map(([key, header]) => ({ key, header })),
};
/** The steps of each dialog, in short (the reference's "How to use Project Data Import"). */
export const IMPORT_STEPS: Record<ImportMode, string[]> = {
  projects: [
    'Download the Excel template. Row 1 says what each column expects, row 2 holds the column headers; enter one project per row from row 3.',
    'Upload the file and check the preview. Rows with errors are marked and are not imported.',
    'Click Import. New projects are added to this main project; an existing project (same Sub Projects number) takes the filled cells.',
  ],
  full: [
    'Download the template (full + welds), or Excel (current data) to start from the projects and isometrics of this main project.',
    'Enter one row per isometric from row 3. The project number and the ISO number are required. A second row of the same isometric adds another material line.',
    'Upload the file. Tick With welds if the file holds weld ranges (Wt.Start / Wt.End). The preview shows every error row and 100 importable rows; Import processes every row without an error.',
    'Existing isometrics keep their values where a cell is empty. Existing welds are never changed: a range only adds the missing weld numbers. A material line already on the isometric (same Material No and Type) is not added again.',
  ],
};
export const IMPORT_DURATION_NOTE = 'A large file (10,000 rows or more) can take a few minutes. Keep this window open until the import is done.';
