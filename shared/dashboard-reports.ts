import type { Row } from './types.ts';
import { share, weldWelderIds, isWelded, isTracerWeld, isNdtCompleted, isRepairedWeld, weldTypeLabel, type DashboardFilters } from './weld-dashboard.ts';
import { weldItpId } from './itp-dashboard.ts';
import { openRejection } from './inspections.ts';
import { isNonWeldCode } from './weld-codes.ts';
import { newest } from './iso-status.ts';
import { repairPerformanceLimit } from './site-settings.ts';
import { hydrotestState } from './hydrotest.ts';
import { pilotScope, projectScope } from './project-scope.ts';
import { welderOptionLabel } from './welder-data.ts';

/**
 * Reports ▾ of the Weld Pilot dashboard (reference weld__start__dashboard.txt:2043-2064, dialogs :491-790, submit rules
 * :5174-5253). Pure: the menu, the query each dialog sends (the dashboard filters it carries plus its own fields), the
 * refusals, and the figures each PDF prints. The server builds the PDFs from these models (server/pdf/dashboard-reports.ts);
 * the figures are taken over the same welds and with the same predicates as the dashboard (shared/weld-dashboard.ts).
 */

/** Dashboard filters as the reference names them in the dialogs' hidden fields. */
export const REPORT_FILTERS = ['project', 'ndt', 'wps', 'welder', 'from', 'to', 'company', 'weldType', 'itp', 'pipingClass', 'irn', 'material', 'ped', 'testSystemFilter', 'tracer'] as const;
export type ReportFilter = typeof REPORT_FILTERS[number];

export type ReportOption =
  | { name: 'single'; label: 'Report type'; kind: 'select'; options: { value: string; label: string }[]; defaultValue: string }
  | { name: 'ndt' | 'weldType'; label: string; kind: 'catalog'; any: string; defaultValue: '0' }
  | { name: 'percent'; label: 'Percentage?'; kind: 'number'; defaultValue: string }
  | { name: 'na' | 'includeWithoutNdt' | 'examinedWelds' | 'tsShow'; label: string; kind: 'checkbox'; defaultValue: false };

export interface DashboardReport {
  /** Server document key (`/api/pdf/<key>`). */
  key: string;
  /** Menu entry. */ label: string;
  /** Dialog title, as captured. */ title: string;
  /** Dashboard filters the dialog carries; the report ignores every other one. */
  carries: ReportFilter[];
  /** The dashboard's To date goes along even while it is the untouched default (the other reports then cover every date). */
  defaultTo: boolean;
  requiresWelder?: boolean;
  /** Welder tracking: 'Show single NDT process' needs a chosen NDT process. */
  requiresNdtForSingle?: boolean;
  /** Longest From → To range in months (only checked when From is set). */
  maxMonths?: number;
  /** Fixed hidden values (single=no, welder=0, viewweld). */
  fixed?: Record<string, string>;
  /** Limited to the current project site in the reference (hidden projectSite); every report except All sites follows the dashboard's site. */
  allSites?: boolean;
  options: ReportOption[];
  orientation: 'portrait' | 'landscape';
}

const WELDER_REPORT_FILTERS: ReportFilter[] = ['project', 'ndt', 'wps', 'welder', 'from', 'to', 'testSystemFilter', 'pipingClass', 'itp', 'irn', 'material', 'ped'];
const TRACKING_FILTERS: ReportFilter[] = ['project', 'ndt', 'wps', 'welder', 'from', 'to', 'testSystemFilter', 'company', 'weldType', 'pipingClass', 'itp', 'irn', 'material', 'ped'];
export const SINGLE_OPTIONS = [{ value: 'no', label: 'Show grouped NDT (by NDT method)' }, { value: 'yes', label: 'Show single NDT process' }];
export const WELDER_REQUIRED = 'Please select a welder in the dashboard filter before generating this report.';
export const NDT_REQUIRED = 'Select an NDT process before generating this report.';
export const RANGE_TOO_LONG = 'The date range for Welder report – All sites may not exceed 6 months.';
export const PERCENT_INVALID = 'Enter a percentage from 0 to 100.';
export const DATE_INVALID = 'Enter dates as day, month and year.';

/** The ten entries of Reports ▾, in the reference order (weld__start__dashboard__reports-menu.txt). */
export const DASHBOARD_REPORTS: DashboardReport[] = [
  { key: 'dashboard-welder-report', label: 'Welder report', title: 'Welder report', carries: WELDER_REPORT_FILTERS, defaultTo: true, requiresWelder: true, options: [], orientation: 'landscape' },
  // The captured dialog carries no welder although it requires one (delta-I2b-009, not settled): built as "the dashboard's welder over every project site".
  { key: 'dashboard-welder-report-all-sites', label: 'Welder report - All sites', title: 'Welder report', carries: ['welder', 'ndt', 'from', 'to', 'testSystemFilter', 'pipingClass', 'itp', 'irn', 'material', 'ped', 'company', 'weldType'], defaultTo: true, requiresWelder: true, maxMonths: 6, allSites: true,
    options: [{ name: 'na', label: 'Include N/A NDT results', kind: 'checkbox', defaultValue: false }, { name: 'includeWithoutNdt', label: 'Include without NDT result', kind: 'checkbox', defaultValue: false }], orientation: 'landscape' },
  { key: 'dashboard-welder-tracking', label: 'Welder tracking', title: 'Welder tracking', carries: ['project', 'wps', 'welder', 'from', 'to', 'company', 'weldType', 'itp', 'pipingClass', 'testSystemFilter', 'irn', 'material', 'ped'], defaultTo: true, requiresWelder: true, requiresNdtForSingle: true,
    options: [{ name: 'single', label: 'Report type', kind: 'select', options: SINGLE_OPTIONS, defaultValue: 'no' }, { name: 'ndt', label: 'NDT process', kind: 'catalog', any: 'All NDT processes', defaultValue: '0' }], orientation: 'portrait' },
  { key: 'dashboard-wdi-tracking', label: 'WDI tracking', title: 'WDI Tracking', carries: TRACKING_FILTERS, defaultTo: false, fixed: { single: 'no' }, options: [], orientation: 'portrait' },
  { key: 'dashboard-wdi-tracking-v2', label: 'WDI tracking V2', title: 'WDI tracking V2', carries: ['from', 'to', 'company', 'weldType', 'ndt', 'itp', 'pipingClass', 'irn', 'ped', 'material', 'tracer', 'testSystemFilter'], defaultTo: true, fixed: { viewweld: 'welds' }, options: [], orientation: 'landscape' },
  { key: 'dashboard-welder-tracer', label: 'Welder tracking - With tracer', title: 'Welder tracking - With tracer', carries: TRACKING_FILTERS, defaultTo: false, fixed: { single: 'no' }, options: [], orientation: 'portrait' },
  { key: 'dashboard-welder-ndt-tracking', label: 'Welder tracking - NDT tracking', title: 'Welder tracking - NDT tracking', carries: TRACKING_FILTERS, defaultTo: false, fixed: { single: 'no' },
    options: [{ name: 'percent', label: 'Percentage?', kind: 'number', defaultValue: '10' }, { name: 'examinedWelds', label: 'Include examined welds', kind: 'checkbox', defaultValue: false }, { name: 'tsShow', label: 'Show test pressured welds', kind: 'checkbox', defaultValue: false }], orientation: 'portrait' },
  { key: 'dashboard-open-welds', label: 'Open welds', title: 'Open welds', carries: ['project', 'from', 'to'], defaultTo: false, fixed: { welder: '0' },
    options: [{ name: 'weldType', label: 'Weld type', kind: 'catalog', any: 'All weld types', defaultValue: '0' }], orientation: 'portrait' },
  { key: 'dashboard-revisions', label: 'Revisions report', title: 'Revisions report', carries: ['project', 'from', 'to'], defaultTo: false, fixed: { welder: '0' }, options: [], orientation: 'portrait' },
  { key: 'dashboard-tracer-report', label: 'Tracer report', title: 'Tracer report', carries: TRACKING_FILTERS, defaultTo: false, options: [], orientation: 'landscape' },
];
export const DASHBOARD_REPORT_MAP = Object.fromEntries(DASHBOARD_REPORTS.map(report => [report.key, report]));
/** Access key of the dashboard reports (shared/pdf-report-keys.ts): the export right on the weld register. */
export const DASHBOARD_REPORTS_ACCESS = 'pdf-dashboard-reports';

const text = (value: unknown) => String(value ?? '').trim();
/** One filter value as a list: the dashboard keeps single values today and lists for its multi-select filters. */
const list = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).map(text).filter(item => item && item !== '0');

/** The dashboard filter behind each reference name (the dashboard's Weld type is Shop / Field). The dashboard has no NDT filter (22.11.2026); `ndt` is set in the report dialog only. */
function dashboardValue(filters: DashboardFilters, name: ReportFilter): string[] {
  const f = filters as unknown as Record<string, unknown>;
  const source: Record<ReportFilter, unknown> = {
    project: f.projectId ?? f.projectIds, ndt: undefined, wps: f.wpsId ?? f.wpsIds, welder: f.welderId ?? f.welderIds, from: f.from, to: f.to,
    company: f.companyId, weldType: f.location, itp: f.itpId, pipingClass: f.pipingClass, irn: f.irn, material: f.material, ped: f.ped,
    testSystemFilter: f.testSystemId, tracer: f.tracer,
  };
  return list(source[name]);
}

export interface ReportDialogValues { [name: string]: string | boolean | undefined }
export interface ReportContext {
  /** The dashboard's untouched To date ('' while it has none): only the reports with `defaultTo` carry it. */
  defaultTo?: string;
  /** The current project site (main project). */
  siteId?: string;
}
/** Starting values of a dialog's own fields. */
export const dialogDefaults = (report: DashboardReport): ReportDialogValues => Object.fromEntries(report.options.map(option => [option.name, option.defaultValue]));

/**
 * The query a dialog sends: the dashboard filters it carries (lists comma-separated), its fixed hidden values, the
 * project site, and its own fields. The six reports without `defaultTo` leave To empty while it is the untouched default.
 */
export function reportQuery(report: DashboardReport, filters: DashboardFilters, values: ReportDialogValues = dialogDefaults(report), context: ReportContext = {}): Record<string, string> {
  const query: Record<string, string> = {};
  for (const name of report.carries) {
    const value = dashboardValue(filters, name).join(',');
    if (name === 'to' && !report.defaultTo && value === text(context.defaultTo)) continue;
    if (value) query[name] = value;
  }
  Object.assign(query, report.fixed);
  if (context.siteId) query.projectSite = context.siteId;
  for (const option of report.options) {
    const value = values[option.name] ?? option.defaultValue;
    if (option.kind === 'checkbox') { if (value === true) query[option.name] = 'ok'; }
    else if (text(value)) query[option.name] = text(value);
  }
  return query;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseDate = (value: string) => { const m = DATE.exec(value); if (!m) return null; const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return date.getUTCDate() === +m[3] ? date : null; };
/** The reference's addMonths (JavaScript setMonth: 31 August + 6 months rolls over into March). */
const addMonths = (date: Date, months: number) => { const copy = new Date(date.getTime()); copy.setUTCMonth(copy.getUTCMonth() + months); return copy; };

export interface ReportRefusal { message: string; field: string }
/** The dialog's refusal for a query, in the reference's order (welder, NDT process, date range), or null. Client and server. */
export function reportRefusal(report: DashboardReport, query: Record<string, string>): ReportRefusal | null {
  if (report.requiresWelder && !list(text(query.welder).split(',')).length) return { message: WELDER_REQUIRED, field: 'welder' };
  if (report.requiresNdtForSingle && query.single === 'yes' && !list(query.ndt).length) return { message: NDT_REQUIRED, field: 'ndt' };
  for (const name of ['from', 'to']) if (text(query[name]) && !parseDate(text(query[name]))) return { message: DATE_INVALID, field: name };
  if (report.maxMonths && text(query.from)) {
    const from = parseDate(text(query.from)), to = parseDate(text(query.to));
    if (!from || !to || to.getTime() > addMonths(from, report.maxMonths).getTime()) return { message: RANGE_TOO_LONG, field: 'to' };
  }
  if (report.options.some(option => option.name === 'percent')) {
    const percent = text(query.percent), number = Number(percent);
    if (percent === '' || !Number.isFinite(number) || number < 0 || number > 100) return { message: PERCENT_INVALID, field: 'percent' };
  }
  return null;
}

// ----- scope: the welds of the dashboard filters ------------------------------------------------------------------

/** Filters of a report as the server reads them from the query: only the ones the report carries. */
export interface ReportScopeFilters { [name: string]: string[] }
export function scopeFilters(report: DashboardReport, query: Record<string, string>): ReportScopeFilters {
  return Object.fromEntries(report.carries.map(name => [name, list(text(query[name]).split(','))]));
}

const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);

export interface ReportWeld {
  weld: Row; iso: Row | undefined; project: Row | undefined; welderIds: string[]; wpsId: string; companyIds: string[]; itpId: string;
  location: string; typeId: string; processIds: Set<string>;
}
export interface ReportData {
  rows: Record<string, Row[]>; welds: ReportWeld[];
  /** Welds of the filters other than the dates (WDI tracking compares dated and undated welds). */
  undated: ReportWeld[];
  site: Row | null;
}

/**
 * The rows a report reads: the pilot's projects, then (every report except All sites) the current project site, as
 * the dashboard's rows are (client/context.tsx); `siteId` must be a site of the rows, otherwise all sites stay.
 */
export function reportRows(rows: Record<string, Row[]>, report: DashboardReport, pilot: string | undefined, siteId: string): { rows: Record<string, Row[]>; site: Row | null } {
  const piloted = pilotScope(rows, pilot), site = live(rows.sites).find(row => row.id === siteId) ?? null;
  return { rows: report.allSites || !site ? piloted : projectScope(piloted, site.id), site };
}

/** The welds of the filters, with the same rules as the dashboard's scope (shared/weld-dashboard.ts). */
export function reportData(rows: Record<string, Row[]>, filters: ReportScopeFilters, site: Row | null = null): ReportData {
  const isos = new Map(live(rows.isometrics).map(row => [row.id, row]));
  const projects = new Map(live(rows.projects).map(row => [row.id, row]));
  const welders = new Map(live(rows.welders).map(row => [row.id, row]));
  const types = new Map(live(rows.weld_types).map(row => [row.id, row]));
  const requests = live(rows.inspection_requests).filter(row => text(row.type) === 'NDT'), itps = live(rows.itps);
  // As the dashboard: weld numbers coded GAP, SP, E or B are no welds (shared/weld-codes.ts).
  const all = live(rows.welds).filter(weld => isos.has(text(weld.isoId)) && !isNonWeldCode(weld.weldNo)).map((weld): ReportWeld => {
    const iso = isos.get(text(weld.isoId)), welderIds = weldWelderIds(weld), location = text(types.get(text(weld.typeId))?.location);
    return {
      // As the dashboard: a Field weld takes ITP No 2 (weldItpId); the company filter matches any of the weld's welders.
      weld, iso, project: projects.get(text(iso?.projectId)), welderIds, wpsId: text(weld.wpsId), itpId: weldItpId(iso, location, itps),
      companyIds: welderIds.map(id => text(welders.get(id)?.companyId)).filter(Boolean),
      location, typeId: text(weld.typeId),
      processIds: new Set(requests.filter(request => request.weldId === weld.id).map(request => text(request.processId)).filter(Boolean)),
    };
  });
  const has = (name: string) => (filters[name] || []).length > 0, one = (name: string, value: string) => !has(name) || filters[name].includes(value);
  const plain = (item: ReportWeld) => one('project', text(item.iso?.projectId)) && (!has('welder') || item.welderIds.some(id => filters.welder.includes(id)))
    && (!has('company') || item.companyIds.some(id => filters.company.includes(id))) && one('weldType', item.location) && one('itp', item.itpId) && one('pipingClass', text(item.iso?.pipingClass))
    && one('irn', text(item.iso?.irn)) && one('ped', text(item.iso?.ped)) && one('material', text(item.iso?.material)) && one('wps', item.wpsId)
    && (!has('ndt') || filters.ndt.some(id => item.processIds.has(id))) && one('testSystemFilter', text(item.iso?.testSystemId))
    && (!has('tracer') || isTracerWeld(item.weld) === (filters.tracer[0] === '1'));
  const from = (filters.from || [])[0] ?? '', to = (filters.to || [])[0] ?? '';
  // As the dashboard: a weld without a weld date (not welded yet) stays in scope under From / To.
  const dated = (item: ReportWeld) => { const date = text(item.weld.date); return !date || (!from || date >= from) && (!to || date.slice(0, 10) <= to); };
  const undated = all.filter(plain);
  return { rows, welds: undated.filter(dated), undated, site };
}

// ----- figures ---------------------------------------------------------------------------------------------------

/** Weld length in mm, as the reports and the welder production report count it (diameter outline, or the length typed in mm). */
export function weldLength(weld: Row, rows: Record<string, Row[]>): number {
  if (weld.lengthMode === 'Length in mm') return Number(weld.dialen) || 0;
  return Number((rows.diameters || []).find(row => row.id === weld.diameterId)?.outline) || 0;
}
/** Weld diameter in inches (WDI: weld diameter inch). */
export const weldInches = (weld: Row, rows: Record<string, Row[]>) => Number((rows.diameters || []).find(row => row.id === weld.diameterId)?.sizeinch) || 0;
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export interface Totals {
  welds: number; welded: number; examined: number; examinedPercent: number; examinedMm: number;
  accepted: number; rejected: number; repaired: number; repairRate: number; repairedMm: number;
}
/** The dashboard's Examined: welded, not a tracer, and NDT completed (shared/weld-dashboard.ts). */
const examinedWeld = (item: ReportWeld, results: Row[]) => isWelded(item.weld) && !isTracerWeld(item.weld) && isNdtCompleted(results, item.weld);
/**
 * Figures of a set of welds with the dashboard's predicates: welded = a welder is recorded; examined = welded, no tracer,
 * NDT completed; rejected = examined, the latest NDT outcome is not accepted and no repair of it is accepted yet (`openRejection`).
 */
export function totals(items: ReportWeld[], rows: Record<string, Row[]>): Totals {
  const results = rows.inspection_results || [], allWelds = live(rows.welds);
  const welded = items.filter(item => isWelded(item.weld)), examined = welded.filter(item => examinedWeld(item, results));
  const rejected = examined.filter(item => openRejection(item.weld, allWelds, results)).length, repaired = welded.filter(item => isRepairedWeld(item.weld));
  const mm = (list: ReportWeld[]) => round(list.reduce((sum, item) => sum + weldLength(item.weld, rows), 0));
  return {
    welds: items.length, welded: welded.length, examined: examined.length, examinedPercent: share(examined.length, items.length), examinedMm: mm(examined),
    accepted: examined.length - rejected, rejected, repaired: repaired.length, repairRate: share(repaired.length, welded.length), repairedMm: mm(repaired),
  };
}

const byId = (rows: Row[] | undefined) => new Map(live(rows).map(row => [row.id, row]));
const naturally = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
export const welderName = (welder: Row | undefined) => welder ? welderOptionLabel(welder) || text(welder.id) : 'Unknown welder';
/** Latest NDT result of a weld (newest date, then newest record). */
export function latestNdt(rows: Record<string, Row[]>, weldId: string): Row | undefined {
  return live(rows.inspection_results).filter(row => row.weldId === weldId && text(row.type) === 'NDT' && ['Accepted', 'Rejected'].includes(text(row.result)))
    .sort(newest)[0];
}
const first = (values: unknown[]) => values.map(text).find(Boolean) ?? '';
const resultText = (row: Row | undefined) => !row ? '' : row.result === 'Rejected' ? 'NA' : 'A';

/** Welders a report is about: the filtered ones, else every welder recorded on the welds. */
function welderIdsOf(items: ReportWeld[], filters: ReportScopeFilters): string[] {
  const recorded = [...new Set(items.flatMap(item => item.welderIds))];
  return (filters.welder || []).length ? recorded.filter(id => filters.welder.includes(id)) : recorded;
}

// Welder report (and All sites): the welder's welds with their NDT, a summary per welder.
export interface WelderReportLine { cells: string[] }
export interface WelderReportSection { welderId: string; welder: string; lines: string[][]; ndtProcesses: string; wpsMethods: string; totals: Totals }
export interface WelderReportOptions { /** All sites: Include N/A NDT results. */ na?: boolean; /** All sites: Include without NDT result. */ withoutNdt?: boolean; allSites?: boolean }
export const WELDER_REPORT_COLUMNS = ['Weld no. / Type', 'Project / ISO No', 'Ind.No.', 'Material', 'Diameter / W.T. / Sch.', 'Charge number', 'WPS number', 'Welder', 'Welded', 'NDT', 'Examined result', 'NA'];
/**
 * Lines: Welder report lists every welded weld of the welder; All sites lists the ones with an accepted NDT result,
 * plus N/A results and welds without a result when ticked. The summary counts every welded weld of the welder in scope.
 */
export function welderReport(data: ReportData, filters: ReportScopeFilters, options: WelderReportOptions = {}): WelderReportSection[] {
  const { rows } = data, welders = byId(rows.welders), wps = byId(rows.wps), types = byId(rows.weld_types), diameters = byId(rows.diameters), processes = byId(rows.ndt_processes);
  const materials = byId(rows.materials), certificates = byId(rows.certifications);
  return welderIdsOf(data.welds, filters).map(welderId => {
    const mine = data.welds.filter(item => item.welderIds.includes(welderId));
    const shown = mine.filter(item => {
      if (!options.allSites) return true;
      const latest = latestNdt(rows, item.weld.id);
      return latest ? latest.result === 'Accepted' || Boolean(options.na) : Boolean(options.withoutNdt);
    }).sort((a, b) => naturally(text(a.iso?.isoNo), text(b.iso?.isoNo)) || naturally(text(a.weld.weldNo), text(b.weld.weldNo)));
    const lines = shown.map(item => {
      const weld = item.weld, latest = latestNdt(rows, weld.id), diameter = diameters.get(text(weld.diameterId));
      const certs = [1, 2].map(side => certificates.get(text(weld[`certificate${side}Id`]))).filter(Boolean) as Row[];
      const mats = [1, 2].map(side => materials.get(text(weld[`material${side}Id`]))).filter(Boolean) as Row[];
      return [
        [text(weld.weldNo), text(types.get(item.typeId)?.name)].filter(Boolean).join(' / '),
        [text(item.project?.internnumber), text(item.iso?.isoNo)].filter(Boolean).join(' / '),
        certs.map(cert => text(cert.indexNo) || text(cert.name)).join(', '),
        mats.map(material => text(material.materialNo)).join(', ') || text(item.iso?.material),
        [text(diameter?.diameter) || (weld.lengthMode === 'Length in mm' ? `${text(weld.dialen)} mm` : ''), first([...certs.map(cert => cert.wallThickness), ...mats.map(material => material.wallThickness)]), first([...certs.map(cert => cert.schedule), ...mats.map(material => material.lbs)])].filter(Boolean).join(' / '),
        [text(weld.chargeNo1), text(weld.chargeNo2), ...certs.map(cert => text(cert.chargeNo))].filter(Boolean).filter((value, i, all) => all.indexOf(value) === i).join(', '),
        text(wps.get(item.wpsId)?.name),
        item.welderIds.map(id => text(welders.get(id)?.number) || welderName(welders.get(id))).join(', '),
        printDay(weld.date),
        [...item.processIds].map(id => text(processes.get(id)?.name)).filter(Boolean).join(', '),
        resultText(latest),
        latest?.result === 'Rejected' && text(latest.naLength) ? `${text(latest.naLength)} mm` : '',
      ];
    });
    const processNames = [...new Set(mine.flatMap(item => [...item.processIds].map(id => text(processes.get(id)?.name)).filter(Boolean)))].sort(naturally);
    const wpsNames = [...new Set(mine.map(item => text(wps.get(item.wpsId)?.name)).filter(Boolean))].sort(naturally);
    return { welderId, welder: welderName(welders.get(welderId)), lines, ndtProcesses: processNames.join(', ') || '-', wpsMethods: wpsNames.join(', ') || '-', totals: totals(mine, rows) };
  }).sort((a, b) => naturally(a.welder, b.welder));
}
export const printDay = (value: unknown) => { const raw = text(value).slice(0, 10); return DATE.test(raw) ? raw.split('-').reverse().join('.') : text(value); };

// Welder tracking: per welder and WPS, per NDT method (grouped) or for one NDT process (single).
export interface TrackingRow { welder: string; wps: string; ndt: string; welds: number; examined: number; percent: number; accepted: number; rejected: number }
/** NDT completed by results of a process set: the latest result of the weld among requests of those processes. */
function methodResult(rows: Record<string, Row[]>, weldId: string, processIds: Set<string>): Row | undefined {
  const requests = new Map(live(rows.inspection_requests).map(row => [row.id, row]));
  return live(rows.inspection_results).filter(row => row.weldId === weldId && text(row.type) === 'NDT' && ['Accepted', 'Rejected'].includes(text(row.result)) && processIds.has(text(requests.get(text(row.requestId))?.processId)))
    .sort(newest)[0];
}
export function welderTracking(data: ReportData, filters: ReportScopeFilters, single: { processId: string } | null): TrackingRow[] {
  const { rows } = data, welders = byId(rows.welders), wps = byId(rows.wps), processes = live(rows.ndt_processes), groups = byId(rows.ndt_groups);
  const methods: { label: string; ids: Set<string> }[] = single
    ? [{ label: text(processes.find(row => row.id === single.processId)?.name) || 'NDT process', ids: new Set([single.processId]) }]
    : [...new Set(processes.map(row => text(row.groupId)))].map(groupId => ({ label: text(groups.get(groupId)?.name) || 'No NDT method', ids: new Set(processes.filter(row => text(row.groupId) === groupId).map(row => row.id)) }))
      .sort((a, b) => naturally(a.label, b.label));
  const out: TrackingRow[] = [];
  for (const welderId of welderIdsOf(data.welds, filters)) {
    const mine = data.welds.filter(item => item.welderIds.includes(welderId) && isWelded(item.weld));
    for (const wpsId of [...new Set(mine.map(item => item.wpsId))]) {
      const pair = mine.filter(item => item.wpsId === wpsId);
      for (const method of methods) {
        const outcomes = pair.map(item => methodResult(rows, item.weld.id, method.ids)).filter(Boolean) as Row[];
        if (!single && !outcomes.length && !pair.some(item => [...item.processIds].some(id => method.ids.has(id)))) continue;
        const rejected = outcomes.filter(row => row.result === 'Rejected').length;
        out.push({ welder: welderName(welders.get(welderId)), wps: text(wps.get(wpsId)?.name) || 'No WPS', ndt: method.label, welds: pair.length, examined: outcomes.length, percent: share(outcomes.length, pair.length), accepted: outcomes.length - rejected, rejected });
      }
    }
  }
  return out.sort((a, b) => naturally(a.welder, b.welder) || naturally(a.wps, b.wps) || naturally(a.ndt, b.ndt));
}

// WDI tracking: completed welds in the period against the open welds without a weld date.
export interface WdiRow { project: string; completed: number; completedInch: number; open: number; openInch: number; total: number; progress: number }
export function wdiTracking(data: ReportData): { rows: WdiRow[]; total: WdiRow } {
  const { rows } = data;
  const completed = data.welds.filter(item => text(item.weld.date)), open = data.undated.filter(item => !text(item.weld.date));
  const inch = (items: ReportWeld[]) => round(items.reduce((sum, item) => sum + weldInches(item.weld, rows), 0), 2);
  const line = (project: string, done: ReportWeld[], left: ReportWeld[]): WdiRow => ({ project, completed: done.length, completedInch: inch(done), open: left.length, openInch: inch(left), total: done.length + left.length, progress: share(inch(done), inch(done) + inch(left)) });
  const projects = [...new Map([...completed, ...open].map(item => [text(item.project?.id), item.project])).values()];
  const label = (project: Row | undefined) => [text(project?.internnumber), text(project?.description)].filter(Boolean).join(' - ') || 'No project';
  return {
    rows: projects.map(project => line(label(project), completed.filter(item => item.project === project), open.filter(item => item.project === project))).sort((a, b) => naturally(a.project, b.project)),
    total: line('Total', completed, open),
  };
}

// WDI tracking V2: the dashboard's key figures over the same welds, per weld type, with Reweld.
export interface WdiV2 {
  view: 'welds' | 'length'; total: number; welded: number; examined: number; examinedPercent: number; repaired: number; repairRate: number;
  limit: number; aboveLimit: boolean; reweld: number; byType: { label: string; total: number; welded: number; examined: number; repaired: number }[];
}
/** `view` length: the same figures in mm instead of a number of welds (dashboard View: Welds length). */
export function wdiTrackingV2(data: ReportData, view: 'welds' | 'length' = 'welds'): WdiV2 {
  const { rows } = data, results = rows.inspection_results || [], types = byId(rows.weld_types);
  const weight = (items: ReportWeld[]) => view === 'length' ? round(items.reduce((sum, item) => sum + weldLength(item.weld, rows), 0)) : items.length;
  const figures = (items: ReportWeld[]) => {
    const welded = items.filter(item => isWelded(item.weld)), examined = welded.filter(item => examinedWeld(item, results)), repaired = welded.filter(item => isRepairedWeld(item.weld));
    return { total: weight(items), welded: weight(welded), examined: weight(examined), repaired: weight(repaired) };
  };
  // Repair rate as the dashboard: repaired / welded, in the length view repaired mm / examined mm.
  const all = figures(data.welds), limit = repairPerformanceLimit(data.site), repairRate = view === 'length' ? share(all.repaired, all.examined) : share(all.repaired, all.welded);
  const rewelded = data.welds.filter(item => live(results).some(row => row.weldId === item.weld.id && row.reweld === true));
  const labels = [...new Set(data.welds.map(item => weldTypeLabel(types.get(item.typeId))))].sort(naturally);
  return {
    view, ...all, examinedPercent: share(all.examined, all.total), repairRate, limit, aboveLimit: repairRate > limit, reweld: weight(rewelded),
    byType: labels.map(label => ({ label, ...figures(data.welds.filter(item => weldTypeLabel(types.get(item.typeId)) === label)) })),
  };
}

// Welder tracking - With tracer: per welder and WPS, with the tracer welds and what they trace.
export interface TracerGroup { welder: string; wps: string; welds: number; examined: number; rejected: number; tracers: number; status: string }
export interface TracerLine { project: string; iso: string; weld: string; traces: string; welder: string; date: string; result: string }
export function tracerWelds(data: ReportData): TracerLine[] {
  const { rows } = data, welders = byId(rows.welders), welds = byId(rows.welds);
  return data.welds.filter(item => isTracerWeld(item.weld)).map(item => ({
    project: text(item.project?.internnumber), iso: text(item.iso?.isoNo), weld: text(item.weld.weldNo), traces: text(welds.get(text(item.weld.tracerOfId))?.weldNo) || '-',
    welder: item.welderIds.map(id => text(welders.get(id)?.number) || welderName(welders.get(id))).join(', '), date: printDay(item.weld.date), result: resultText(latestNdt(rows, item.weld.id)) || 'Open',
  })).sort((a, b) => naturally(a.project, b.project) || naturally(a.iso, b.iso) || naturally(a.weld, b.weld));
}
export function welderTracer(data: ReportData, filters: ReportScopeFilters): { groups: TracerGroup[]; tracers: TracerLine[] } {
  const { rows } = data, welders = byId(rows.welders), wps = byId(rows.wps), results = rows.inspection_results || [], allWelds = live(rows.welds);
  const groups: TracerGroup[] = [];
  for (const welderId of welderIdsOf(data.welds, filters)) {
    const mine = data.welds.filter(item => item.welderIds.includes(welderId) && isWelded(item.weld));
    for (const wpsId of [...new Set(mine.map(item => item.wpsId))]) {
      const pair = mine.filter(item => item.wpsId === wpsId), plain = pair.filter(item => !isTracerWeld(item.weld)), tracers = pair.filter(item => isTracerWeld(item.weld));
      const done = plain.filter(item => examinedWeld(item, results)), examined = done.length, rejected = done.filter(item => openRejection(item.weld, allWelds, results)).length;
      const open = tracers.filter(item => !isNdtCompleted(results, item.weld)).length;
      // Every rejected weld wants a tracer; tracers still without a result are open.
      const status = !rejected && !tracers.length ? '-' : tracers.length < rejected ? `${rejected - tracers.length} tracer${rejected - tracers.length === 1 ? '' : 's'} missing` : open ? `${open} open` : 'Complete';
      groups.push({ welder: welderName(welders.get(welderId)), wps: text(wps.get(wpsId)?.name) || 'No WPS', welds: plain.length, examined, rejected, tracers: tracers.length, status });
    }
  }
  return { groups: groups.sort((a, b) => naturally(a.welder, b.welder) || naturally(a.wps, b.wps)), tracers: tracerWelds(data) };
}

// Welder tracking - NDT tracking: welder / WPS totals under the percentage, then their open welds.
export interface NdtTrackingGroup { welder: string; wps: string; welds: number; total: number; percent: number; good: number; rejected: number }
export interface NdtTrackingWeld { project: string; iso: string; diameter: string; weld: string; welder: string; wps: string; examined: string }
export interface NdtTrackingOptions { percent: number; examinedWelds: boolean; testPressured: boolean }
export function ndtTracking(data: ReportData, filters: ReportScopeFilters, options: NdtTrackingOptions): { groups: NdtTrackingGroup[]; welds: NdtTrackingWeld[] } {
  const { rows } = data, welders = byId(rows.welders), wps = byId(rows.wps), diameters = byId(rows.diameters), results = rows.inspection_results || [];
  const groups: NdtTrackingGroup[] = [], welds: NdtTrackingWeld[] = [];
  const pressured = (iso: Row | undefined) => Boolean(iso) && hydrotestState(iso!, rows).completed;
  for (const welderId of welderIdsOf(data.welds, filters)) {
    const mine = data.welds.filter(item => item.welderIds.includes(welderId) && isWelded(item.weld) && !isTracerWeld(item.weld));
    for (const wpsId of [...new Set(mine.map(item => item.wpsId))]) {
      const pair = mine.filter(item => item.wpsId === wpsId), sums = totals(pair, rows);
      if (!(sums.examinedPercent < options.percent)) continue;
      const welder = welderName(welders.get(welderId)), method = text(wps.get(wpsId)?.name) || 'No WPS';
      groups.push({ welder, wps: method, welds: sums.welds, total: sums.examined, percent: sums.examinedPercent, good: sums.accepted, rejected: sums.rejected });
      for (const item of pair) {
        const done = isNdtCompleted(results, item.weld);
        if (done && !options.examinedWelds) continue;
        if (!options.testPressured && pressured(item.iso)) continue;
        welds.push({ project: text(item.project?.internnumber), iso: text(item.iso?.isoNo), diameter: text(diameters.get(text(item.weld.diameterId))?.diameter), weld: text(item.weld.weldNo), welder, wps: method, examined: done ? resultText(latestNdt(rows, item.weld.id)) : '' });
      }
    }
  }
  const order = (a: { welder: string; wps: string }, b: { welder: string; wps: string }) => naturally(a.welder, b.welder) || naturally(a.wps, b.wps);
  return { groups: groups.sort(order), welds: welds.sort((a, b) => order(a, b) || naturally(a.project, b.project) || naturally(a.iso, b.iso) || naturally(a.weld, b.weld)) };
}

// Open welds: registered welds without a weld date, optionally of one weld type.
export interface OpenWeld { project: string; iso: string; weld: string; type: string; diameter: string; wps: string; spool: string }
export function openWelds(data: ReportData, weldTypeId: string): OpenWeld[] {
  const { rows } = data, types = byId(rows.weld_types), diameters = byId(rows.diameters), wps = byId(rows.wps), spools = byId(rows.spools);
  return data.undated.filter(item => !text(item.weld.date) && (!weldTypeId || weldTypeId === '0' || item.typeId === weldTypeId)).map(item => ({
    project: text(item.project?.internnumber), iso: text(item.iso?.isoNo), weld: text(item.weld.weldNo), type: text(types.get(item.typeId)?.name),
    diameter: text(diameters.get(text(item.weld.diameterId))?.diameter), wps: text(wps.get(item.wpsId)?.name), spool: text(spools.get(text(item.weld.spoolId))?.name),
  })).sort((a, b) => naturally(a.project, b.project) || naturally(a.iso, b.iso) || naturally(a.weld, b.weld));
}

// Revisions report: ISO revisions of the project(s) in the period.
export interface RevisionLine { project: string; iso: string; revision: string; date: string; comment: string }
export function revisionsReport(rows: Record<string, Row[]>, filters: ReportScopeFilters): RevisionLine[] {
  const isos = byId(rows.isometrics), projects = byId(rows.projects), from = (filters.from || [])[0] ?? '', to = (filters.to || [])[0] ?? '';
  return live(rows.revisions).filter(row => !text(row.type) || text(row.type) === 'ISO').flatMap(row => {
    const iso = isos.get(text(row.isoId)), date = text(row.date).slice(0, 10);
    if (!iso || (filters.project || []).length && !filters.project.includes(text(iso.projectId))) return [];
    if ((from || to) && (!date || from && date < from || to && date > to)) return [];
    return [{ project: text(projects.get(text(iso.projectId))?.internnumber), iso: text(iso.isoNo), revision: text(row.revNo), date: printDay(row.date), comment: text(row.comment) }];
  }).sort((a, b) => naturally(a.project, b.project) || naturally(a.iso, b.iso) || naturally(a.revision, b.revision));
}

// ----- header ----------------------------------------------------------------------------------------------------

export interface HeaderItem { label: string; value: string }
/** The header block of the reports (vendor-kb 5-05: Home location, Project, Date range, Welder, WPS method, Weld type; PED Cat.-Mod, ITP, Custom field, Company, Piping class, Test system). */
export function reportHeader(report: DashboardReport, rows: Record<string, Row[]>, filters: ReportScopeFilters, site: Row | null): { left: HeaderItem[]; box: HeaderItem[] } {
  const names = (key: string, field: string, values: string[] = []) => values.map(id => text(byId(rows[key]).get(id)?.[field]) || id).join(', ');
  const all = (name: ReportFilter, value: string) => report.carries.includes(name) ? value || 'All' : 'All';
  const from = (filters.from || [])[0] ?? '', to = (filters.to || [])[0] ?? '';
  const welders = (filters.welder || []).map(id => welderName(byId(rows.welders).get(id))).join(', ');
  return {
    left: [
      { label: 'Home location', value: report.allSites ? 'All sites' : text(site?.name) || 'All sites' },
      { label: 'Sub-project', value: all('project', names('projects', 'internnumber', filters.project)) },
      { label: 'Date range', value: from || to ? `${from ? printDay(from) : '…'} - ${to ? printDay(to) : '…'}` : 'All dates' },
      { label: 'Welder', value: all('welder', welders) },
      { label: 'WPS method', value: all('wps', names('wps', 'name', filters.wps)) },
      { label: 'Weld type', value: all('weldType', (filters.weldType || []).join(', ')) },
    ],
    box: [
      { label: 'PED Cat.-Mod', value: all('ped', (filters.ped || []).join(', ')) }, { label: 'ITP', value: all('itp', names('itps', 'number', filters.itp)) },
      { label: 'Custom field', value: all('irn', (filters.irn || []).join(', ')) }, { label: 'Company', value: all('company', names('companies', 'name', filters.company)) },
      { label: 'Piping class', value: all('pipingClass', (filters.pipingClass || []).join(', ')) }, { label: 'Test system', value: all('testSystemFilter', names('test_systems', 'name', filters.testSystemFilter)) },
      ...(report.carries.includes('ndt') && (filters.ndt || []).length ? [{ label: 'NDT process', value: names('ndt_processes', 'name', filters.ndt) }] : []),
    ],
  };
}
