import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed, seedInspectionSamples } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { projectScope } from '../shared/project-scope.ts';
import { NO_DASHBOARD_FILTERS, weldDashboard, type DashboardFilters } from '../shared/weld-dashboard.ts';
import {
  DASHBOARD_REPORTS, DASHBOARD_REPORT_MAP, NDT_REQUIRED, RANGE_TOO_LONG, WELDER_REQUIRED, dialogDefaults, ndtTracking, reportData, reportQuery, reportRefusal, reportRows,
  scopeFilters, totals, wdiTracking, wdiTrackingV2, welderReport, welderTracer, welderTracking,
} from '../shared/dashboard-reports.ts';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';

const PASSWORD = 'Dashboard-Reports-Password';
const SITE = 'site-north';
const filters = (changes: Partial<DashboardFilters> = {}): DashboardFilters => ({ ...NO_DASHBOARD_FILTERS, ...changes });
const report = (key: string) => DASHBOARD_REPORT_MAP[key];
const rowsOf = (store: Store): Record<string, Row[]> => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
/** The dashboard as the browser computes it: the rows of the current project site, the site itself. */
function dashboard(rows: Record<string, Row[]>, f: DashboardFilters) {
  const scoped = projectScope(rows, SITE), site = scoped.sites.find(row => row.id === SITE);
  return weldDashboard({ welds: scoped.welds, isometrics: scoped.isometrics, projects: scoped.projects, weldTypes: scoped.weld_types, welders: scoped.welders, wps: scoped.wps, itps: scoped.itps, ndtProcesses: scoped.ndt_processes, ndtGroups: scoped.ndt_groups, requests: scoped.inspection_requests, results: scoped.inspection_results }, f, site);
}
/** A report's data for the dashboard filters, as the server reads the query the dialog sends. */
function dataFor(rows: Record<string, Row[]>, key: string, f: DashboardFilters, values = dialogDefaults(report(key))) {
  const definition = report(key), query = reportQuery(definition, f, values, { siteId: SITE });
  const { rows: scoped, site } = reportRows(rows, definition, 'weld', SITE), parsed = scopeFilters(definition, query);
  return { data: reportData(scoped, parsed, site), filters: parsed, query };
}

function fixtureStore() {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-dashboard-reports-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store); seedInspectionSamples(store);
  return { dir, store };
}
/** The welder with the most welds on the site, and a date range that holds some of them. */
function sample(rows: Record<string, Row[]>) {
  const welds = projectScope(rows, SITE).welds.filter(weld => !weld._archived);
  const counts = new Map<string, number>();
  for (const weld of welds) for (const id of [1, 2, 3, 4].map(side => String(weld[`welder${side}Id`] ?? '')).filter(Boolean)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const welderId = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const dates = welds.map(weld => String(weld.date ?? '')).filter(Boolean).sort();
  return { welderId, from: dates[0], to: dates[Math.floor(dates.length / 2)], welds };
}

test('Reports ▾ lists the ten reference entries in the reference order, with the captured dialog titles', () => {
  assert.deepEqual(DASHBOARD_REPORTS.map(entry => entry.label), ['Welder report', 'Welder report - All sites', 'Welder tracking', 'WDI tracking', 'WDI tracking V2', 'Welder tracking - With tracer', 'Welder tracking - NDT tracking', 'Open welds', 'Revisions report', 'Tracer report']);
  assert.deepEqual(DASHBOARD_REPORTS.map(entry => entry.title), ['Welder report', 'Welder report', 'Welder tracking', 'WDI Tracking', 'WDI tracking V2', 'Welder tracking - With tracer', 'Welder tracking - NDT tracking', 'Open welds', 'Revisions report', 'Tracer report']);
  const keys = PDF_DOCUMENTS.map(document => document.key);
  for (const entry of DASHBOARD_REPORTS) assert.ok(keys.includes(entry.key), `${entry.key} is a server document`);
  // Dialog fields as captured: Report type + NDT process; the two All sites check boxes; Percentage? 10 with two check boxes; Weld type.
  assert.deepEqual(report('dashboard-welder-tracking').options.map(option => option.label), ['Report type', 'NDT process']);
  assert.deepEqual(dialogDefaults(report('dashboard-welder-tracking')), { single: 'no', ndt: '0' });
  assert.deepEqual(report('dashboard-welder-report-all-sites').options.map(option => option.label), ['Include N/A NDT results', 'Include without NDT result']);
  assert.deepEqual(report('dashboard-welder-ndt-tracking').options.map(option => option.label), ['Percentage?', 'Include examined welds', 'Show test pressured welds']);
  assert.equal(dialogDefaults(report('dashboard-welder-ndt-tracking')).percent, '10');
  assert.deepEqual(report('dashboard-open-welds').options.map(option => option.label), ['Weld type']);
  for (const key of ['dashboard-wdi-tracking', 'dashboard-wdi-tracking-v2', 'dashboard-welder-tracer', 'dashboard-revisions', 'dashboard-tracer-report', 'dashboard-welder-report']) assert.deepEqual(report(key).options, [], key);
  // The menu is mounted on the dashboard next to Filter and Reset.
  const mount = readFileSync(new URL('../client/itp-dashboard.tsx', import.meta.url), 'utf8');
  assert.match(mount, /<DashboardReports filters=\{filters\}/);
});

test('each dialog sends the dashboard filters it carries, its fixed values and its own fields', () => {
  const TODAY = '2026-11-16', applied = filters({ welderId: 'welder-1', location: 'Shop', to: TODAY, projectId: 'project-cooling', wpsId: 'wps-1', companyId: 'company-north' });
  // Open welds: welder fixed 0, its own Weld type instead of the dashboard's, To left out while it is the untouched default, the project site.
  const open = reportQuery(report('dashboard-open-welds'), applied, { weldType: 'weld-type-3' }, { defaultTo: TODAY, siteId: SITE });
  assert.deepEqual(open, { project: 'project-cooling', welder: '0', projectSite: SITE, weldType: 'weld-type-3' });
  // WDI tracking with the untouched default To: no To, grouped NDT.
  const wdi = reportQuery(report('dashboard-wdi-tracking'), applied, {}, { defaultTo: TODAY });
  assert.equal(wdi.to, undefined); assert.equal(wdi.single, 'no'); assert.equal(wdi.welder, 'welder-1'); assert.equal(wdi.weldType, 'Shop');
  // A To the user chose goes along.
  assert.equal(reportQuery(report('dashboard-wdi-tracking'), { ...applied, to: '2026-10-31' }, {}, { defaultTo: TODAY }).to, '2026-10-31');
  // Welder report keeps the default To and carries neither company nor weld type.
  const welder = reportQuery(report('dashboard-welder-report'), applied, {}, { defaultTo: TODAY });
  assert.equal(welder.to, TODAY); assert.equal(welder.company, undefined); assert.equal(welder.weldType, undefined); assert.equal(welder.wps, 'wps-1');
  // All sites: no project or WPS; the welder goes along (the report requires one).
  const all = reportQuery(report('dashboard-welder-report-all-sites'), applied, { na: true, includeWithoutNdt: false }, { defaultTo: TODAY });
  assert.equal(all.project, undefined); assert.equal(all.wps, undefined); assert.equal(all.welder, 'welder-1'); assert.equal(all.na, 'ok'); assert.equal(all.includeWithoutNdt, undefined);
  // WDI tracking V2: Number of welds; no project, welder or WPS.
  const v2 = reportQuery(report('dashboard-wdi-tracking-v2'), applied, {}, { defaultTo: TODAY });
  assert.equal(v2.viewweld, 'welds'); assert.equal(v2.project, undefined); assert.equal(v2.welder, undefined); assert.equal(v2.to, TODAY);
  // Tracer report: the project site and every tracking filter.
  const tracer = reportQuery(report('dashboard-tracer-report'), applied, {}, { siteId: SITE });
  assert.equal(tracer.projectSite, SITE); assert.equal(tracer.welder, 'welder-1');
  // Multi-select dashboard filters (lists) are sent comma-separated.
  assert.equal(reportQuery(report('dashboard-tracer-report'), { ...applied, welderId: ['w-1', 'w-2'] as unknown as string }).welder, 'w-1,w-2');
});

test('the dialog rules: welder required, NDT process for a single NDT process, at most 6 months for All sites', () => {
  const welderReport = report('dashboard-welder-report'), tracking = report('dashboard-welder-tracking'), allSites = report('dashboard-welder-report-all-sites');
  assert.deepEqual(reportRefusal(welderReport, {}), { message: WELDER_REQUIRED, field: 'welder' });
  assert.deepEqual(reportRefusal(welderReport, { welder: '0' }), { message: WELDER_REQUIRED, field: 'welder' });
  assert.equal(reportRefusal(welderReport, { welder: 'w-1' }), null);
  assert.equal(reportRefusal(tracking, { welder: 'w-1', single: 'no', ndt: '0' }), null);
  assert.deepEqual(reportRefusal(tracking, { welder: 'w-1', single: 'yes', ndt: '0' }), { message: NDT_REQUIRED, field: 'ndt' });
  assert.equal(reportRefusal(tracking, { welder: 'w-1', single: 'yes', ndt: 'ndt-rt' }), null);
  assert.equal(RANGE_TOO_LONG, 'The date range for Welder report – All sites may not exceed 6 months.');
  assert.equal(reportRefusal(allSites, { welder: 'w-1', from: '2026-01-15', to: '2026-07-15' }), null, 'exactly 6 months');
  assert.deepEqual(reportRefusal(allSites, { welder: 'w-1', from: '2026-01-15', to: '2026-07-16' }), { message: RANGE_TOO_LONG, field: 'to' });
  assert.deepEqual(reportRefusal(allSites, { welder: 'w-1', from: '2026-01-15' }), { message: RANGE_TOO_LONG, field: 'to' }, 'From without To');
  assert.equal(reportRefusal(allSites, { welder: 'w-1', to: '2026-07-16' }), null, 'only checked when From is set');
  assert.equal(reportRefusal(report('dashboard-wdi-tracking'), { from: '2020-01-01', to: '2026-11-16' }), null, 'other reports have no limit');
  assert.ok(reportRefusal(report('dashboard-welder-ndt-tracking'), { percent: '120' }));
  assert.equal(reportRefusal(report('dashboard-welder-ndt-tracking'), { percent: '25' }), null);
});

test('the report figures equal the dashboard figures of the same welds', () => {
  const { dir, store } = fixtureStore();
  try {
    const rows = rowsOf(store), { welderId, from, to } = sample(rows);
    for (const f of [filters(), filters({ welderId }), filters({ from, to }), filters({ location: 'Shop' }), filters({ welderId, from, to })]) {
      const board = dashboard(rows, f), { data } = dataFor(rows, 'dashboard-tracer-report', f);
      assert.equal(data.welds.length, board.scopeWelds, `scope ${JSON.stringify(f)}`);
      const sums = totals(data.welds, data.rows);
      assert.deepEqual([sums.welds, sums.welded, sums.examined, sums.examinedPercent, sums.repaired, sums.repairRate], [board.kpis.totalWelds, board.kpis.welded, board.kpis.examined, board.kpis.examinedPercent, board.kpis.repaired, board.kpis.repairRate]);
      // WDI tracking V2 prints the dashboard's key figures.
      // WDI tracking V2 carries no project, welder or WPS: it is compared with the dashboard without them.
      const v2 = wdiTrackingV2(dataFor(rows, 'dashboard-wdi-tracking-v2', f).data), wide = dashboard(rows, { ...f, welderId: '', projectId: '', wpsId: '' });
      assert.deepEqual([v2.total, v2.welded, v2.examined, v2.examinedPercent, v2.repaired, v2.repairRate, v2.limit, v2.aboveLimit], [wide.kpis.totalWelds, wide.kpis.welded, wide.kpis.examined, wide.kpis.examinedPercent, wide.kpis.repaired, wide.kpis.repairRate, wide.kpis.repairPerformance.limit, wide.kpis.repairPerformance.aboveLimit]);
      assert.equal(v2.byType.reduce((sum, line) => sum + line.total, 0), wide.kpis.totalWelds);
    }
    assert.ok(dashboard(rows, filters()).kpis.examined > 0 && dashboard(rows, filters()).kpis.totalWelds > 0, 'the fixture has examined welds');
    // Welder report: the summary of the filtered welder is the dashboard of that welder.
    const board = dashboard(rows, filters({ welderId })), { data, filters: parsed } = dataFor(rows, 'dashboard-welder-report', filters({ welderId }));
    const [section] = welderReport(data, parsed);
    assert.equal(section.welderId, welderId);
    assert.deepEqual([section.totals.welded, section.totals.examined, section.totals.repaired, section.totals.repairRate], [board.kpis.welded, board.kpis.examined, board.kpis.repaired, board.kpis.repairRate]);
    assert.equal(section.lines.length, board.kpis.totalWelds, 'one line per weld of the welder');
    // All sites: by default only accepted results; ticking both boxes lists every weld of the welder (over every site).
    const all = dataFor(rows, 'dashboard-welder-report-all-sites', filters({ welderId }), { na: true, includeWithoutNdt: true });
    const allSection = welderReport(all.data, all.filters, { allSites: true, na: true, withoutNdt: true })[0];
    assert.ok(allSection.lines.length >= section.lines.length);
    const accepted = welderReport(all.data, all.filters, { allSites: true })[0];
    assert.ok(accepted.lines.every(line => line[10] === 'A'), 'only accepted results without the boxes');
    // Welder tracking: grouped rows of one welder / WPS never examine more welds than the group has; examined welds match the dashboard.
    const tracking = dataFor(rows, 'dashboard-welder-tracking', filters({ welderId }));
    for (const line of welderTracking(tracking.data, tracking.filters, null)) assert.ok(line.examined <= line.welds && line.accepted + line.rejected === line.examined);
    // WDI tracking without dates: completed + open = every weld of the dashboard; with dates the completed welds are the dashboard's scope.
    assert.equal(wdiTracking(dataFor(rows, 'dashboard-wdi-tracking', filters()).data).total.total, dashboard(rows, filters()).kpis.totalWelds);
    assert.equal(wdiTracking(dataFor(rows, 'dashboard-wdi-tracking', filters({ from, to })).data).total.completed, dashboard(rows, filters({ from, to })).kpis.totalWelds);
    // With tracer: the plain welds of the groups add up to the dashboard's compliance welds (tracers left out).
    const tracer = dataFor(rows, 'dashboard-welder-tracer', filters({ welderId }));
    const groups = welderTracer(tracer.data, tracer.filters).groups, compliance = board.compliance.filter(group => group.welderId === welderId);
    assert.equal(groups.reduce((sum, group) => sum + group.welds, 0), compliance.reduce((sum, group) => sum + group.total, 0));
    // NDT tracking at 100 % lists every welder / WPS group; Good + Rejected = Total examined.
    const ndt = dataFor(rows, 'dashboard-welder-ndt-tracking', filters({ welderId }));
    const tracked = ndtTracking(ndt.data, ndt.filters, { percent: 100.1, examinedWelds: true, testPressured: true });
    assert.equal(tracked.groups.reduce((sum, group) => sum + group.total, 0), compliance.reduce((sum, group) => sum + group.examined, 0));
    for (const group of tracked.groups) assert.equal(group.good + group.rejected, group.total);
    assert.equal(tracked.welds.length, tracked.groups.reduce((sum, group) => sum + group.welds, 0), 'with examined and test pressured welds every weld of the groups is listed');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

type Options = { method?: string; pilot?: string; data?: unknown };
async function server(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const { dir, store } = fixtureStore();
  const app = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(app, 'listening');
  const origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { app.close(() => resolve()); app.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    return async (path: string, { method = 'GET', pilot, data }: Options = {}) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
  };
  const admin = client();
  assert.equal((await admin('/auth/setup', { method: 'POST', data: { name: 'Reports admin', email: 'reports-admin@example.test', password: PASSWORD } })).status, 201);
  return { store, admin, client };
}
const get = (request: ReturnType<Awaited<ReturnType<typeof server>>['client']>, key: string, query: Record<string, string>) => request(`/pdf/${key}?${new URLSearchParams(query)}`, { pilot: 'weld' });
const pdfText = async (response: Response) => {
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  return (await readPdf(bytes)).pages.flatMap(page => page.text).join(' ');
};

test('the server refuses a Welder report without a welder (400) and an All sites range of 7 months, with the dialog sentences', async t => {
  const { store, admin } = await server(t), { welderId } = sample(rowsOf(store));
  const missing = await get(admin, 'dashboard-welder-report', { to: '2026-11-16' });
  assert.equal(missing.status, 400); assert.equal((await missing.json()).error, WELDER_REQUIRED);
  for (const key of ['dashboard-welder-report-all-sites', 'dashboard-welder-tracking']) assert.equal((await get(admin, key, {})).status, 400, key);
  const range = await get(admin, 'dashboard-welder-report-all-sites', { welder: welderId, from: '2026-01-01', to: '2026-08-01' });
  assert.equal(range.status, 400); assert.equal((await range.json()).error, RANGE_TOO_LONG);
  const single = await get(admin, 'dashboard-welder-tracking', { welder: welderId, single: 'yes', ndt: '0' });
  assert.equal(single.status, 400); assert.equal((await single.json()).error, NDT_REQUIRED);
  assert.equal((await get(admin, 'dashboard-welder-ndt-tracking', { percent: 'many' })).status, 400);
});

test('each of the ten reports returns a PDF for the dashboard filters, and prints the dashboard figures', async t => {
  const { store, admin } = await server(t), rows = rowsOf(store), { welderId } = sample(rows);
  const applied = filters({ welderId }), board = dashboard(rows, applied);
  for (const entry of DASHBOARD_REPORTS) {
    const values = entry.key === 'dashboard-welder-tracking' ? { single: 'yes', ndt: String(rows.ndt_processes.find(row => !row._archived)!.id) } : dialogDefaults(entry);
    const text = await pdfText(await get(admin, entry.key, reportQuery(entry, applied, values, { siteId: SITE })));
    assert.ok(text.includes(entry.key === 'dashboard-welder-ndt-tracking' ? 'Welder tracking - NDT < 10%' : entry.key === 'dashboard-revisions' ? 'Revisions' : entry.label), `${entry.key} title`);
    assert.ok(text.includes('North fabrication yard') || entry.allSites, `${entry.key} home location`);
  }
  const v2 = await pdfText(await get(admin, 'dashboard-wdi-tracking-v2', reportQuery(report('dashboard-wdi-tracking-v2'), filters(), {}, { siteId: SITE })));
  const all = dashboard(rows, filters()).kpis;
  for (const figure of [String(all.totalWelds), String(all.examined), `${all.examinedPercent}%`, `${all.repairRate}%`]) assert.ok(v2.includes(figure), `WDI tracking V2 prints ${figure}`);
  const welder = await pdfText(await get(admin, 'dashboard-welder-report', reportQuery(report('dashboard-welder-report'), applied, {}, { siteId: SITE })));
  assert.ok(welder.includes(`${board.kpis.repairRate}%`), 'Welder report prints the repaired percent of the dashboard');
});

test('dashboard reports need the export right on the weld register, and exist only with the pilots', async t => {
  const { store, admin, client } = await server(t), { welderId } = sample(rowsOf(store));
  const profile = store.create('profiles', { name: 'No weld register', settingsPermission: 'No access', toolsPermission: 'No access', generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'No access' }).id;
  const user = store.create('users', { name: 'Reader', email: 'reader@example.test', active: true, profileId: profile, weldEnabled: true, weldProfileId: profile, weldSiteScope: 'All project sites' }, SYSTEM);
  store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
  const reader = client();
  assert.equal((await reader('/auth/login', { method: 'POST', data: { email: 'reader@example.test', password: PASSWORD } })).status, 200);
  const refused = await get(reader, 'dashboard-tracer-report', { welder: welderId });
  assert.ok([403].includes(refused.status), `refused: ${refused.status}`);
  assert.equal((await get(admin, 'dashboard-tracer-report', { welder: welderId })).status, 200);
});

test('without the pilots feature the dashboard reports do not exist', async t => {
  const { admin } = await server(t, 'full');
  assert.equal((await admin('/pdf/dashboard-tracer-report', {})).status, 404);
});
