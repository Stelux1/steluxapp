import type { Row } from './types.ts';
import { printDate, type LabelValueItem } from './pdf-lisl.ts';
import { naturalCompare, pdfText as text, projectContext, projectItems, type ProjectContext } from './pdf-documents.ts';
import { PUNCH_FILE_TYPES, PUNCH_KPIS, PUNCH_LETTERS, PUNCH_SIGN_OFF_DOCUMENT, PUNCH_TYPES, PUNCH_VIEWS, comparePunchRows, isOverdue, matchesPunchKpi, punchCategory, punchDeadlineSoon, punchKind, punchKpis, punchStatus, punchToday, punchViewOf, withPunchPhases, type PunchKpiKey } from './punch.ts';
import { filterFlanges, flangeAssetTag, flangeItems, selectedFlanges, type FlangeItem } from './flanges.ts';
import { flangeStandard } from './site-settings.ts';
import { pickListReports, type PickListReport } from './mto-logistics.ts';
import { materialRecord } from './materials.ts';

/**
 * Data side of the list documents: the filled Punch list (the page's filters), the blank Punch list, the Flange report and the
 * Pick list. Pure functions over the rows an account may read; `isoIds` and `projectIds` are the isometrics and the projects
 * enabled in the current pilot. Layout lives in `server/pdf/operational-lists.ts`.
 */
type Rows = Record<string, Row[]>;
const live = (rows: Row[] | undefined | null) => (rows || []).filter(row => !row._archived);
const find = (rows: Rows, key: string, id: unknown) => id ? live(rows[key]).find(row => row.id === id) : undefined;
const flag = (value: string | undefined, fallback: boolean) => value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const number = (value: unknown) => { const raw = text(value); if (!raw) return ''; const n = Number(raw.replace(',', '.')); return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : raw; };

// ----- punch list ----------------------------------------------------------------------------------------------------------

export interface PunchListOptions {
  projectId: string; isoId: string; punchType: string; category: string; kpi: PunchKpiKey | ''; q: string; /** The Document column. */ documents: boolean;
  /** The page's view (open, finished, passed, removed); empty prints every status (the ISO book). */ view: string; /** The page's due filter: overdue or due_soon. */ due: string;
  /** Ticked rows: only these items are printed, whatever the filters say. */ ids: string[];
  /** Append the imported isometric drawing (PDF) of each printed isometric. */ isoDrawing: boolean;
}
/**
 * Options of the Punch list print from the query (the page's filters: `projectId`, `punchType`, `category` A to D, `kpi`, `q`;
 * plus `isoId`, and `documents=1|0`). Returns the first problem as `error`.
 *
 * UNVERIFIED. The reference print dialog has "include punch document" without saying what it adds. Here it adds a Document
 * column that names the files attached to each item (photos, documents and the sign-off), as the page's Document column does.
 */
export function punchListOptions(query: Record<string, string>): { options: PunchListOptions; error?: string } {
  const options: PunchListOptions = { projectId: text(query.projectId), isoId: text(query.isoId), punchType: text(query.punchType), category: text(query.category).toUpperCase(), kpi: text(query.kpi) as PunchKpiKey | '', q: text(query.q).toLowerCase(), documents: flag(query.documents, true),
    view: text(query.view).toLowerCase(), due: text(query.due).toLowerCase(), ids: [...new Set(text(query.ids).split(',').map(text).filter(Boolean))].slice(0, 500), isoDrawing: flag(query.isoDrawing, false) };
  let error: string | undefined;
  if (options.punchType && !(PUNCH_TYPES as readonly string[]).includes(options.punchType)) error = 'Choose Pre-punch or Punch.';
  else if (options.category && !(PUNCH_LETTERS as string[]).includes(options.category)) error = 'Choose a type from A to D.';
  else if (options.kpi && !PUNCH_KPIS.some(card => card.key === options.kpi)) error = 'Choose one of the key figures of the page.';
  else if (options.view && !(PUNCH_VIEWS as readonly string[]).includes(options.view)) error = 'Choose Open, Finished, Passed or Removed.';
  else if (options.due && !['overdue', 'due_soon'].includes(options.due)) error = 'Choose overdue or due within 7 days.';
  return { options, ...(error ? { error } : {}) };
}
export interface PunchListLine { item: Row; number: string; project: string; iso: string; category: string; description: string; due: string; contractor: string; kind: string; status: string; documents: string[] }
/** `drawings`: the isometrics whose imported drawing is appended (empty unless the option is ticked). */
export interface PunchListModel { options: PunchListOptions; lines: PunchListLine[]; drawings: Row[]; kpis: { label: string; count: number }[]; filters: string[]; context: ProjectContext; today: string }
const projectOf = (item: Row, rows: Rows) => text(item.projectId) || text(find(rows, 'isometrics', item.isoId)?.projectId);
const punchDocuments = (rows: Rows, item: Row) => live(rows.attachments).filter(file => file.entityType === 'punchlists' && file.entityId === item.id).sort((a, b) => a._createdAt.localeCompare(b._createdAt))
  .map(file => `${file.documentType === PUNCH_SIGN_OFF_DOCUMENT ? 'Sign-off' : file.documentType === PUNCH_FILE_TYPES[0] ? 'Photo' : 'Document'}: ${text(file.name)}`);
/**
 * The punch items of the page as printed: items of visible isometrics, and project-related items of projects enabled in the pilot,
 * narrowed by the same filters as the Punch lists page (project, punch type, type, search, then the chosen key figure) and in the
 * page's order (Status, then newest number first). Items are read through their phases, so Passed is as the page shows it.
 * Ticked rows (`ids`) are printed on their own; the isometric drawings follow when asked for.
 */
export function punchListModel(rows: Rows, options: PunchListOptions, isoIds: Set<string>, projectIds: Set<string>, today = punchToday()): PunchListModel {
  const iso = (item: Row) => find(rows, 'isometrics', item.isoId);
  const contractor = (item: Row) => item.contractorId ? text(find(rows, 'companies', item.contractorId)?.name) : text(item.assignedTo);
  const phased = withPunchPhases(live(rows.punchlists));
  const reachable = phased.filter(item => item.isoId ? isoIds.has(text(item.isoId)) : projectIds.has(projectOf(item, rows)));
  const scoped = reachable.filter(row => (!options.projectId || projectOf(row, rows) === options.projectId) && (!options.isoId || row.isoId === options.isoId) && (!options.punchType || punchKind(row) === options.punchType) && (!options.category || punchCategory(row.category) === options.category)
    && (!options.q || [row.description, row.name, row.reportedBy, row.number, iso(row)?.isoNo, contractor(row)].some(value => text(value).toLowerCase().includes(options.q))));
  const chosen = new Set(options.ids);
  const filtered = (options.ids.length ? reachable.filter(row => chosen.has(row.id))
    : scoped.filter(row => (!options.kpi || matchesPunchKpi(row, options.kpi, today)) && (!options.view || punchViewOf(row) === options.view) && (options.due !== 'overdue' || isOverdue(row, today)) && (options.due !== 'due_soon' || punchDeadlineSoon(row, today)))).sort(comparePunchRows);
  const label = (key: string, id: unknown) => text(find(rows, key, id)?.[key === 'projects' ? 'internnumber' : 'isoNo']);
  const lines = filtered.map((item): PunchListLine => ({
    item, number: text(item.number), project: label('projects', projectOf(item, rows)), iso: item.isoId ? label('isometrics', item.isoId) : 'Project related', category: punchCategory(item.category), description: text(item.description),
    due: printDate(item.dueDate), contractor: contractor(item), kind: punchKind(item), status: `${punchStatus(item)}${isOverdue(item, today) ? ' (overdue)' : ''}`, documents: punchDocuments(rows, item),
  }));
  const filters = [options.projectId && `Project ${label('projects', options.projectId) || '-'}`, options.isoId && `Isometric ${label('isometrics', options.isoId) || '-'}`, options.punchType && `Punch type ${options.punchType}`, options.category && `Type ${options.category}`,
    options.view && `View ${options.view.charAt(0).toUpperCase()}${options.view.slice(1)}`, options.due && `Due ${options.due === 'overdue' ? 'overdue' : 'within 7 days'}`, options.kpi && `Key figure ${PUNCH_KPIS.find(card => card.key === options.kpi)?.label}`, options.ids.length && `Selected items (${options.ids.length})`, options.q && `Search "${options.q}"`].filter(Boolean) as string[];
  const isometrics = [...new Set(lines.map(line => text(line.item.isoId)).filter(Boolean))].map(id => find(rows, 'isometrics', id)!).filter(Boolean);
  const context = options.isoId ? projectContext(rows, isometrics.length ? isometrics : [find(rows, 'isometrics', options.isoId)!].filter(Boolean)) : { ...projectContext(rows, []), project: find(rows, 'projects', options.projectId), isometrics: [] };
  const project = context.project ?? (options.projectId ? find(rows, 'projects', options.projectId) : undefined);
  const drawings = options.isoDrawing ? [...isometrics].sort((a, b) => naturalCompare(text(a.isoNo), text(b.isoNo))) : [];
  return { options, lines, drawings, kpis: punchKpis(scoped, today).map(card => ({ label: card.label, count: card.count })), filters, context: { ...context, project, site: context.site ?? find(rows, 'sites', project?.siteId), client: context.client || text(find(rows, 'companies', project?.companyId)?.name) }, today };
}
export const punchColumns = (documents: boolean) => ['#', 'Project', 'Isometric', 'Type', 'Description', 'Due date', 'Contractor', 'Punch', ...(documents ? ['Document'] : []), 'Status'];
export const punchRowCells = (line: PunchListLine, documents: boolean) => [line.number, line.project, line.iso, line.category, line.description, line.due, line.contractor, line.kind, ...(documents ? [line.documents.length ? line.documents : ['-']] : []), line.status];
/** Blank punch list: header and empty rows for one isometric. */
export const BLANK_PUNCH_ROWS = 16;
export const BLANK_PUNCH_COLUMNS: (string | string[])[] = ['#', ['Type', '(A-D)'], 'Description', 'Due date', 'Contractor', ['Pre-punch', '/ Punch'], 'Sign-off'];
export const blankPunchHeader = (rows: Rows, iso: Row): { context: ProjectContext; items: LabelValueItem[] } => {
  const context = projectContext(rows, [iso]);
  return { context, items: [...projectItems(context, rows), { label: 'Drawing no.', value: text(iso.drawingNo) }, { label: 'Piping class', value: text(iso.pipingClass) }] };
};

// ----- flange report ------------------------------------------------------------------------------------------------------

export interface FlangeReportOptions { isoId: string; projectId: string; finished: '' | 'No' | 'Yes'; q: string; /** The ticked flanges: when present, exactly these are reported. */ ids?: string[] }
/** Options of the Flange report from the query: `ids` (the ticked flanges, comma separated) or `isoId` or `projectId`, `finished=Yes|No`, `q`. */
export function flangeReportOptions(query: Record<string, string>): { options: FlangeReportOptions; error?: string } {
  const options: FlangeReportOptions = { isoId: text(query.isoId), projectId: text(query.projectId), finished: text(query.finished) as FlangeReportOptions['finished'], q: text(query.q) };
  const ids = text(query.ids).split(',').map(text).filter(Boolean); if (ids.length) options.ids = [...new Set(ids)];
  const error = !options.ids && !options.isoId && !options.projectId ? 'Tick the flanges, or choose an isometric or a project, for the flange report.' : options.finished && !['Yes', 'No'].includes(options.finished) ? 'Choose Yes or No for Finished.' : undefined;
  return { options, ...(error ? { error } : {}) };
}
export interface FlangeReportModel { options: FlangeReportOptions; items: FlangeItem[]; context: ProjectContext; standard: string; procedureNo: string }
export function flangeReportModel(rows: Rows, options: FlangeReportOptions, isoIds: Set<string>): FlangeReportModel {
  const isometrics = live(rows.isometrics).filter(iso => isoIds.has(iso.id));
  const flanges = live(rows.flanges).filter(row => isoIds.has(text(row.isoId)));
  const all = flangeItems(flanges, isometrics, live(rows.projects), rows.sites || []);
  const items = (options.ids ? selectedFlanges(all, options.ids) : filterFlanges(all, { projectId: options.projectId, isoId: options.isoId, finished: options.finished, query: options.q }))
    .sort((a, b) => naturalCompare(a.isoNo, b.isoNo) || naturalCompare(text(a.row.flange_id), text(b.row.flange_id)));
  const used = [...new Set(items.map(item => text(item.row.isoId)))].map(id => find(rows, 'isometrics', id)!).filter(Boolean);
  const chosen = options.isoId ? isometrics.filter(iso => iso.id === options.isoId) : [];
  const context = projectContext(rows, chosen.length ? chosen : used);
  const project = context.project ?? find(rows, 'projects', options.projectId), site = context.site ?? find(rows, 'sites', project?.siteId);
  return { options, items, context: { ...context, project, site, client: context.client || text(find(rows, 'companies', project?.companyId)?.name) }, standard: reportStandard(items, site), procedureNo: text(site?.flangeProcedureNo) };
}
/** The header's tightening standard: the one every listed flange follows, "Per flange" when they differ (each row prints its own). */
export const FLANGE_STANDARD_MIXED = 'Per flange (see the list)';
function reportStandard(items: FlangeItem[], site: Row | undefined): string {
  const standards = [...new Set(items.map(item => item.standard))];
  return standards.length > 1 ? FLANGE_STANDARD_MIXED : standards[0] ?? flangeStandard(site);
}
export const FLANGE_PDF_COLUMNS: { header: string | string[]; width: number; cell(item: FlangeItem): string }[] = [
  { header: 'Flange ID', width: 7, cell: item => text(item.row.flange_id) },
  { header: 'Iso number', width: 7, cell: item => item.isoNo },
  { header: 'Asset tag', width: 7, cell: item => flangeAssetTag(item.row) },
  { header: ['Flange', 'size'], width: 5, cell: item => text(item.row.flange_size) },
  { header: ['Flange', 'rating'], width: 5, cell: item => text(item.row.flange_rating) },
  { header: ['Gasket', 'type'], width: 7, cell: item => text(item.row.gasket_type) },
  { header: ['Stud bolts', '(dim. x no.)'], width: 8, cell: item => [text(item.row.studbolt_afmeting), number(item.row.aantal_studbolts) && `x ${number(item.row.aantal_studbolts)}`].filter(Boolean).join(' ') },
  { header: ['Tightening', 'standard'], width: 7, cell: item => item.standard },
  { header: ['Torque', 'wrench'], width: 6, cell: item => [text(item.row.torque_wrench_type), text(item.row.torque_wrench_id)].filter(Boolean).join(' ') },
  { header: ['First', 'pass (Nm)'], width: 4.5, cell: item => number(item.row.first_pass_nm) },
  { header: ['Second', 'pass (Nm)'], width: 4.5, cell: item => number(item.row.second_pass_nm) },
  { header: ['Target', '(Nm)'], width: 4.5, cell: item => number(item.row.target_moment_nm) },
  { header: ['Max', 'dev.'], width: 3.5, cell: item => number(item.row.max_dev) },
  { header: ['Tightening', 'date'], width: 5.5, cell: item => printDate(item.row.tightning_date) },
  { header: 'Operator', width: 5.5, cell: item => text(item.row.operator) },
  { header: ['Report', 'no.'], width: 5, cell: item => text(item.row.report_nr) },
  { header: ['Inspection', 'result'], width: 7, cell: item => [text(item.row.insp_result), text(item.row.rejection_type) && `(${text(item.row.rejection_type)})`].filter(Boolean).join(' ') },
  { header: 'Status', width: 5, cell: item => item.status },
];

// ----- pick list -----------------------------------------------------------------------------------------------------------

export interface PickListModel { report: PickListReport; iso: Row; context: ProjectContext; lines: string[][]; taken: boolean }
export const PICKLIST_COLUMNS = ['Group', 'Material no.', 'Description', 'DIA', 'LBS/SCH', 'Quantity', 'UOM', 'Storehouse'];
/** The pick list of one report number (its lines, project / isometric, date) when its isometric is visible in the pilot. */
export function pickListModel(rows: Rows, reportNo: string, isoIds: Set<string>): PickListModel | null {
  const wanted = text(reportNo);
  if (!wanted) return null;
  const report = pickListReports({ ...rows, isometrics: live(rows.isometrics).filter(iso => isoIds.has(iso.id)) }).find(item => item.reportNo === wanted);
  if (!report) return null;
  const iso = find(rows, 'isometrics', report.isoId);
  if (!iso) return null;
  const lines = report.lines.map(line => {
    const material = materialRecord(rows, line);
    return [text(material?.materialGroup), text(material?.materialNo), text(material?.description), text(material?.dia), text(material?.lbs), number(line.quantity), text(material?.uom), text(line.warehouseId ? find(rows, 'warehouses', line.warehouseId)?.name : find(rows, 'sites', line.siteId)?.name)]; // a line of a project site's inventory names the site
  });
  return { report, iso, context: projectContext(rows, [iso]), lines, taken: report.taken };
}
