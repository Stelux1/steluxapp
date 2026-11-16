import { AppError } from '../store.ts';
import { companyForDocuments } from './company.ts';
import { A4_LANDSCAPE, A4_PORTRAIT, documentHeader, heading, noteBlock, plainTable, renderOperational, type Step } from './operational-blocks.ts';
import type { PdfScopedDefinition, PdfScopedRequest } from './documents.ts';
import {
  DASHBOARD_REPORTS, DASHBOARD_REPORTS_ACCESS, WELDER_REPORT_COLUMNS, ndtTracking, openWelds, reportData, reportHeader, reportRefusal, reportRows, revisionsReport,
  scopeFilters, wdiTracking, wdiTrackingV2, welderReport, welderTracer, welderTracking, type DashboardReport, type ReportData, type ReportScopeFilters, type Totals,
} from '../../shared/dashboard-reports.ts';
import type { Row } from '../../shared/types.ts';

/**
 * The ten PDFs of Reports ▾ on the Weld Pilot dashboard (`GET /api/pdf/dashboard-…?<dashboard filters>`). The query is
 * what the report's dialog sends (shared/dashboard-reports.ts `reportQuery`); the server refuses it with the dialog's own
 * sentences, then prints the figures of `reportData` over the records the account may read in the pilot and, except for
 * All sites, the project site of the dashboard.
 */
const n = (value: number) => String(value);
const pct = (value: number) => `${value}%`;
const safe = (value: unknown) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
const totalsRow = (totals: Totals) => [n(totals.welded), n(totals.examined), n(totals.examinedMm), n(totals.repaired), pct(totals.repairRate)];
const TOTALS_HEADERS = ['Welds', 'Examined', 'Examined (mm)', 'Repaired', 'Repaired percent'];
const empty = (steps: Step[], rows: unknown[], message: string) => { if (!rows.length) steps.push({ block: noteBlock('', message), before: 6 }); };

function steps(report: DashboardReport, data: ReportData, filters: ReportScopeFilters, query: Record<string, string>): { subtitle: string; steps: Step[]; title?: string } {
  const out: Step[] = [];
  switch (report.key) {
    case 'dashboard-welder-report':
    case 'dashboard-welder-report-all-sites': {
      const sections = welderReport(data, filters, { allSites: report.allSites, na: query.na === 'ok', withoutNdt: query.includeWithoutNdt === 'ok' });
      for (const section of sections) {
        out.push({ block: heading(section.welder), before: out.length ? 12 : 0 });
        out.push({ table: plainTable(WELDER_REPORT_COLUMNS, [11, 13, 8, 10, 11, 10, 10, 8, 7, 9, 6, 5], section.lines, { size: 6.2, headerSize: 6.2 }) });
        empty(out, section.lines, 'No welds of this welder match the filters.');
        out.push({ table: plainTable(['NDT process', 'WPS method', ...TOTALS_HEADERS], [24, 24, 8, 8, 10, 8, 10], [[section.ndtProcesses, section.wpsMethods, ...totalsRow(section.totals)]], { size: 7, headerSize: 7 }), before: 4 });
      }
      empty(out, sections, 'No welds of the selected welder match the filters.');
      return { subtitle: `${sections.length} welder${sections.length === 1 ? '' : 's'}`, steps: out };
    }
    case 'dashboard-welder-tracking': {
      const single = query.single === 'yes' ? { processId: String(query.ndt) } : null;
      const lines = welderTracking(data, filters, single);
      out.push({ table: plainTable(['Welder', 'WPS method', single ? 'NDT process' : 'NDT method', 'Welds', 'Examined', '%', 'Accepted', 'Rejected'], [20, 16, 16, 7, 8, 7, 8, 8], lines.map(line => [line.welder, line.wps, line.ndt, n(line.welds), n(line.examined), pct(line.percent), n(line.accepted), n(line.rejected)]), { size: 7, headerSize: 7 }) });
      empty(out, lines, 'No welded welds match the filters.');
      return { subtitle: single ? 'Single NDT process' : 'Grouped NDT (by NDT method)', steps: out };
    }
    case 'dashboard-wdi-tracking': {
      const { rows, total } = wdiTracking(data);
      const cells = (line: typeof total) => [line.project, n(line.completed), n(line.completedInch), n(line.open), n(line.openInch), n(line.total), pct(line.progress)];
      out.push({ table: plainTable(['Project', 'Completed welds', 'Completed (inch)', 'Open welds', 'Open (inch)', 'Total welds', 'Progress (inch)'], [26, 10, 10, 9, 9, 9, 10], [...rows.map(cells), cells(total)], { size: 7, headerSize: 7 }) });
      out.push({ block: noteBlock('', 'Completed: welds with a weld date in the period (every weld date when From and To are empty). Open: welds without a weld date.'), before: 6 });
      return { subtitle: `${total.completed} completed, ${total.open} open`, steps: out };
    }
    case 'dashboard-wdi-tracking-v2': {
      const view = query.viewweld === 'length' ? 'length' : 'welds', v2 = wdiTrackingV2(data, view), unit = view === 'length' ? ' (mm)' : '';
      out.push({ table: plainTable([`Total welds${unit}`, `Welded${unit}`, `Examined${unit}`, 'Examined %', `Repaired${unit}`, 'Repair rate', 'Limit', 'Status', `Reweld${unit}`], [10, 9, 9, 8, 9, 8, 7, 10, 8],
        [[n(v2.total), n(v2.welded), n(v2.examined), pct(v2.examinedPercent), n(v2.repaired), pct(v2.repairRate), pct(v2.limit), v2.aboveLimit ? 'Above limit' : 'Within limit', n(v2.reweld)]], { size: 7.5, headerSize: 7 }) });
      out.push({ block: heading('Per weld type'), before: 10 });
      out.push({ table: plainTable(['Weld type', `Total${unit}`, `Welded${unit}`, `Examined${unit}`, `Repaired${unit}`], [20, 10, 10, 10, 10], v2.byType.map(line => [line.label, n(line.total), n(line.welded), n(line.examined), n(line.repaired)]), { size: 7, headerSize: 7 }) });
      empty(out, v2.byType, 'No welds match the filters.');
      return { subtitle: view === 'length' ? 'Welds length' : 'Number of welds', steps: out };
    }
    case 'dashboard-welder-tracer': {
      const { groups, tracers } = welderTracer(data, filters);
      out.push({ table: plainTable(['Welder', 'WPS method', 'Welds', 'Examined', 'Rejected', 'Tracers', 'Tracer status'], [22, 18, 7, 8, 8, 7, 14], groups.map(group => [group.welder, group.wps, n(group.welds), n(group.examined), n(group.rejected), n(group.tracers), group.status]), { size: 7, headerSize: 7 }) });
      empty(out, groups, 'No welded welds match the filters.');
      out.push({ block: heading('Tracer welds'), before: 10 });
      out.push({ table: plainTable(['Project', 'ISO', 'Tracer weld', 'Traces weld', 'Welder', 'Welded', 'Result'], [12, 16, 9, 9, 16, 9, 7], tracers.map(line => [line.project, line.iso, line.weld, line.traces, line.welder, line.date, line.result]), { size: 7, headerSize: 7 }) });
      empty(out, tracers, 'No tracer welds match the filters.');
      return { subtitle: `${tracers.length} tracer weld${tracers.length === 1 ? '' : 's'}`, steps: out };
    }
    case 'dashboard-welder-ndt-tracking': {
      const percent = Number(query.percent), { groups, welds } = ndtTracking(data, filters, { percent, examinedWelds: query.examinedWelds === 'ok', testPressured: query.tsShow === 'ok' });
      out.push({ table: plainTable(['Welder', 'WPS method', 'Welds', 'Total', '%', 'Good', 'Rejected'], [24, 20, 8, 8, 8, 8, 8], groups.map(group => [group.welder, group.wps, n(group.welds), n(group.total), pct(group.percent), n(group.good), n(group.rejected)]), { size: 7, headerSize: 7 }) });
      empty(out, groups, `No welder / WPS group is below ${percent}% examined.`);
      out.push({ block: heading('Open welds'), before: 10 });
      out.push({ table: plainTable(['Project', 'ISO', 'Diameter', 'Weld no.', 'Welder', 'WPS method', 'Examined'], [12, 18, 9, 9, 18, 14, 8], welds.map(line => [line.project, line.iso, line.diameter, line.weld, line.welder, line.wps, line.examined]), { size: 7, headerSize: 7 }) });
      empty(out, welds, 'No open welds in these groups.');
      return { title: `Welder tracking - NDT < ${percent}%`, subtitle: `${groups.length} group${groups.length === 1 ? '' : 's'}, ${welds.length} weld${welds.length === 1 ? '' : 's'}`, steps: out };
    }
    case 'dashboard-open-welds': {
      const lines = openWelds(data, String(query.weldType ?? ''));
      out.push({ table: plainTable(['Project', 'ISO', 'Weld no.', 'Weld type', 'Diameter', 'Spool', 'WPS method'], [11, 17, 8, 18, 9, 10, 14], lines.map(line => [line.project, line.iso, line.weld, line.type, line.diameter, line.spool, line.wps]), { size: 7, headerSize: 7 }) });
      empty(out, lines, 'No open welds match the filters.');
      return { subtitle: `${lines.length} open weld${lines.length === 1 ? '' : 's'}`, steps: out };
    }
    case 'dashboard-revisions': {
      const lines = revisionsReport(data.rows, filters);
      out.push({ table: plainTable(['Project', 'Isometric', 'Revision number', 'Date', 'Comment'], [12, 18, 10, 9, 40], lines.map(line => [line.project, line.iso, line.revision, line.date, line.comment]), { size: 7, headerSize: 7 }) });
      empty(out, lines, 'No revisions match the filters.');
      return { title: 'Revisions', subtitle: `${lines.length} revision${lines.length === 1 ? '' : 's'}`, steps: out };
    }
    case 'dashboard-tracer-report': {
      const { tracers } = welderTracer(data, filters);
      out.push({ table: plainTable(['Project', 'ISO', 'Tracer weld', 'Traces weld', 'Welder', 'Welded', 'Result'], [12, 18, 9, 9, 18, 9, 7], tracers.map(line => [line.project, line.iso, line.weld, line.traces, line.welder, line.date, line.result]), { size: 7, headerSize: 7 }) });
      empty(out, tracers, 'No tracer welds match the filters.');
      return { subtitle: `${tracers.length} tracer weld${tracers.length === 1 ? '' : 's'}`, steps: out };
    }
  }
  throw new AppError(404, 'This document does not exist.');
}

/** The data of one dashboard report for a request (also used by the tests to compare its figures with the dashboard). */
export function dashboardReportData(report: DashboardReport, request: Pick<PdfScopedRequest, 'rows' | 'query' | 'user' | 'isoIds'>) {
  const refusal = reportRefusal(report, request.query);
  if (refusal) throw new AppError(400, refusal.message, { [refusal.field]: refusal.message });
  const readable: Record<string, Row[]> = { ...request.rows, isometrics: (request.rows.isometrics || []).filter(row => request.isoIds.has(row.id)) };
  const { rows, site } = reportRows(readable, report, request.user.pilot, String(request.query.projectSite ?? ''));
  const filters = scopeFilters(report, request.query);
  return { data: reportData(rows, filters, site), filters, site };
}

const definition = (report: DashboardReport): PdfScopedDefinition => ({
  key: report.key, title: report.label, report: DASHBOARD_REPORTS_ACCESS, scope: 'scoped',
  async build(request) {
    const { data, filters, site } = dashboardReportData(report, request);
    const body = steps(report, data, filters, request.query), head = reportHeader(report, data.rows, filters, site);
    const title = body.title ?? report.label, company = companyForDocuments(request.store, request.documents);
    const { bytes } = await renderOperational({
      page: report.orientation === 'landscape' ? A4_LANDSCAPE : A4_PORTRAIT, title, generatedAt: request.now,
      async layout(pdf) { return { header: await documentHeader(pdf, { title, subtitle: body.subtitle, company, left: head.left, box: head.box }), steps: body.steps }; },
    });
    return { bytes, fileName: `${request.now.toISOString().slice(0, 10)}-${safe(report.label)}` };
  },
});

export const DASHBOARD_REPORT_DOCUMENTS: PdfScopedDefinition[] = DASHBOARD_REPORTS.map(definition);
