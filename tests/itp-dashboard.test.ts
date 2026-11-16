import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor } from '../shared/release.ts';
import { PILOT_MAP, pagePilots } from '../shared/pilots.ts';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { areaPilots, canResource } from '../shared/permissions.ts';
import { DEFAULT_NDT_PERCENT, isoItpId, isoItpLinks, itpNdtPercent, itpSlotRefresh, itpsForProject } from '../shared/itp-dashboard.ts';
import { COMPLIANCE_PAGE_SIZE, NO_DASHBOARD_FILTERS, filterGroups, isTracerWeld, pageOf, requiredExaminations, share, weldDashboard, type DashboardFilters, type DashboardRows } from '../shared/weld-dashboard.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data } as Row);

// ----- hand-computed dataset ----------------------------------------------------------------------------------------
// welders: wa (company c1), wb (c2).  WPS: w1, w2.  ITP/KNR: i30 = 30 %, i50 = 50 %, i-empty = no NDT %.
// iso1: project p1, ITP slot 1 = i30.   iso2: project p1, no ITP.   iso3: project p2, slot 2 = i50.
// iso1 / wa / w1: a1..a8. a1 accepted, a2 rejected, a3 required without result, a4 repaired, a8 tracer.
// iso2 / wa / w1: b1..b3 (Field type). b1 accepted.   iso3 / wb / w2: c1..c4. c1, c2 accepted (c1 on a UT process).
// d1: iso1, no welder, flagged repaired (must not count in the repair rate). One archived weld is ignored.
const results = [
  row('x-a1', { weldId: 'a1', type: 'NDT', result: 'Accepted', date: '2026-10-10' }),
  row('x-a2', { weldId: 'a2', type: 'NDT', result: 'Rejected', date: '2026-10-10' }),
  row('x-b1', { weldId: 'b1', type: 'NDT', result: 'Accepted', date: '2026-11-10' }),
  row('x-c1', { weldId: 'c1', type: 'NDT', result: 'Accepted', date: '2026-10-20' }),
  row('x-c2', { weldId: 'c2', type: 'NDT', result: 'Accepted', date: '2026-10-20' }),
  row('x-a3-vi', { weldId: 'a3', type: 'VI', result: 'Accepted', date: '2026-10-10' }),
];
const base = { typeId: 't1', wpsId: 'w1' };
const welds = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => row(`a${i}`, { ...base, weldNo: `A${i}`, isoId: 'iso1', welder1Id: 'wa', date: `2026-10-0${i}`, ndoReq: i === 3, repair: i === 4, tracer: i === 8 })),
  ...[1, 2, 3].map(i => row(`b${i}`, { weldNo: `B${i}`, isoId: 'iso2', typeId: 't2', wpsId: 'w1', welder1Id: 'wa', date: `2026-11-0${i}` })),
  ...[1, 2, 3, 4].map(i => row(`c${i}`, { weldNo: `C${i}`, isoId: 'iso3', typeId: 't1', wpsId: 'w2', welder1Id: 'wb', date: '2026-10-15' })),
  row('d1', { weldNo: 'D1', isoId: 'iso1', typeId: 't1', wpsId: 'w1', repair: true }),
  row('gone', { weldNo: 'G1', isoId: 'iso1', typeId: 't1', wpsId: 'w1', welder1Id: 'wa', date: '2026-10-09', _archived: true }),
];
const rows: DashboardRows = {
  welds, results,
  isometrics: [row('iso1', { projectId: 'p1', itpId: 'i30', pipingClass: 'CS150', irn: 'IRN-1', ped: 'Cat II', material: 'A106 Gr B' }), row('iso2', { projectId: 'p1', pipingClass: 'SS300' }), row('iso3', { projectId: 'p2', itp2Id: 'i50' })],
  projects: [row('p1'), row('p2'), row('p3')],
  weldTypes: [row('t1', { name: 'Butt Weld - Shop', abbreviation: 'BW', location: 'Shop' }), row('t2', { name: 'Branch welds - Field', location: 'Field' })],
  welders: [row('wa', { name: 'Alex Taylor', companyId: 'c1' }), row('wb', { name: 'Robin Lane', companyId: 'c2' })],
  wps: [row('w1', { name: 'WPS-141' }), row('w2', { name: 'WPS-135' })],
  itps: [row('i30', { number: 'ITP-30', ndtPercent: 30 }), row('i50', { number: 'ITP-50', ndtPercent: 50 }), row('i-empty', { number: 'ITP-E', ndtPercent: null })],
  ndtProcesses: [row('pRT', { name: 'RT', groupId: 'g1' }), row('pUT', { name: 'UT', groupId: 'g2' })],
  requests: [row('r1', { weldId: 'a1', type: 'NDT', processId: 'pRT' }), row('r2', { weldId: 'c1', type: 'NDT', processId: 'pUT' }), row('r3', { weldId: 'a3', type: 'VI', processId: 'pRT' })],
};
const dash = (filters: Partial<DashboardFilters> = {}, site: Row | null = row('site', { repairLimit: 5 })) => weldDashboard(rows, { ...NO_DASHBOARD_FILTERS, ...filters }, site);

test('required examinations round up and never overshoot on floating-point dust', () => {
  for (const [welds, percent, expected] of [[3, 10, 1], [10, 10, 1], [11, 10, 2], [7, 30, 3], [4, 50, 2], [0, 50, 0], [5, 0, 0], [3, 33.3, 1], [10, 33.3, 4], [100, 7, 7], [20, 15, 3], [1, 100, 1]] as const) assert.equal(requiredExaminations(welds, percent), expected, `${welds} x ${percent}`);
  assert.equal(requiredExaminations(Number.NaN, 10), 0);
});

test('KPI cards: counts, weld types by abbreviation, welded, examined %, repaired and repair rate', () => {
  const { kpis } = dash();
  assert.deepEqual([kpis.projects, kpis.isometrics], [3, 3]);
  // 8 + 3 + 4 + 1 live welds; the archived one is ignored. Types: BW (t1) 8 + 4 + 1 = 13, "Branch welds - Field" (no abbreviation) 3.
  assert.equal(kpis.totalWelds, 16);
  assert.deepEqual(kpis.weldsByType.map(item => [item.label, item.count]), [['BW', 13], ['Branch welds - Field', 3]]);
  assert.equal(kpis.welded, 15);                       // every weld but d1 has a welder
  assert.equal(kpis.examined, 5);                      // a1, a2, b1, c1, c2 (the VI result of a3 does not count)
  assert.equal(kpis.examinedPercent, 31.3);            // 5 / 16 = 31.25 %
  assert.equal(kpis.repaired, 1);                      // a4; d1 has no welder and is excluded
  assert.equal(kpis.repairRate, 6.7);                  // 1 / 15 = 6.67 %
  assert.deepEqual([kpis.repairPerformance.value, kpis.repairPerformance.limit, kpis.repairPerformance.aboveLimit], [6.7, 5, true]);
  assert.equal(kpis.repairPerformance.scope, '1 of 15 welded welds');
});

test('repair performance uses the main project limit, 5 % when it is empty, and the badge only fires above the limit', () => {
  assert.equal(dash({}, row('s', { repairLimit: 8 })).kpis.repairPerformance.aboveLimit, false);
  assert.equal(dash({}, row('s', { repairLimit: 6.7 })).kpis.repairPerformance.aboveLimit, false);   // equal is not above
  assert.deepEqual([dash({}, row('s', { repairLimit: null })).kpis.repairPerformance.limit, dash({}, null).kpis.repairPerformance.limit], [5, 5]);
  assert.equal(dash({}, row('s', { repairLimit: 0 })).kpis.repairPerformance.limit, 0);
});

test('an empty selection shows zeros, never NaN', () => {
  const none = dash({ welderId: 'wb', wpsId: 'w1' });
  assert.deepEqual([none.kpis.totalWelds, none.kpis.welded, none.kpis.examinedPercent, none.kpis.repairRate, none.kpis.repairPerformance.value, none.kpis.projects, none.kpis.isometrics], [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(none.compliance, []);
  assert.equal(share(0, 0), 0);
});

test('compliance groups by welder + WPS + ITP/KNR with the required, examined, selected and remaining counts', () => {
  const groups = dash().compliance;
  assert.equal(groups.length, 3);
  const a = groups.find(group => group.welderId === 'wa' && group.itpId === 'i30')!;
  // 7 non-tracer welds (a1..a7) at 30 % -> ceil(2.1) = 3. Examined a1, a2. Selected: a3 requires NDT and has no NDT result (VI does not complete it).
  assert.deepEqual([a.total, a.required, a.examined, a.selected, a.remaining, a.compliant, a.usedPercent, a.itpPercent], [7, 3, 2, 1, 0, false, 30, 30]);
  assert.deepEqual(a.bar, { tested: 2, selected: 1, remaining: 0 });
  // iso2 has no ITP/KNR: 10 % of 3 welds -> 1, examined b1.
  const b = groups.find(group => group.itpId === '')!;
  assert.deepEqual([b.welderId, b.total, b.required, b.examined, b.selected, b.remaining, b.compliant, b.usedPercent, b.itpPercent, b.itpNumber], ['wa', 3, 1, 1, 0, 0, true, DEFAULT_NDT_PERCENT, null, 'No ITP/KNR']);
  // iso3 uses slot 2 (50 %): 4 x 50 % = 2 exactly, examined c1 and c2.
  const c = groups.find(group => group.welderId === 'wb')!;
  assert.deepEqual([c.total, c.required, c.examined, c.compliant, c.wpsName, c.itpNumber, c.welderName], [4, 2, 2, true, 'WPS-135', 'ITP-50', 'Robin Lane']);
  // Not compliant first.
  assert.equal(groups[0], a);
});

test('tracer welds and welds without a welder stay out of the compliance; the defect block reports them per welder and WPS', () => {
  const groups = dash().compliance;
  assert.equal(groups.reduce((sum, group) => sum + group.total, 0), 14);   // 16 - tracer a8 - no welder d1
  assert.equal(isTracerWeld(row('t', { tracer: true })), true); assert.equal(isTracerWeld(row('t', { tracer: false })), false);
  // wa + w1 spans two ITP groups: 10 non-tracer welds, examined a1 a2 b1, rejected a2, one tracer.
  for (const group of groups.filter(group => group.welderId === 'wa')) assert.deepEqual(group.defects, { welds: 10, examined: 3, examinedPercent: 30, rejected: 1, rejectedPercent: 33.3, tracers: 1 });
  const c = groups.find(group => group.welderId === 'wb')!;
  assert.deepEqual(c.defects, { welds: 4, examined: 2, examinedPercent: 50, rejected: 0, rejectedPercent: 0, tracers: 0 });
});

test('an ITP/KNR without an NDT % falls back to 10 %, and 0 % requires nothing', () => {
  const alt: DashboardRows = { ...rows, isometrics: rows.isometrics.map(iso => iso.id === 'iso2' ? { ...iso, itpId: 'i-empty' } as Row : iso) };
  const group = weldDashboard(alt, NO_DASHBOARD_FILTERS, null).compliance.find(item => item.itpNumber === 'ITP-E')!;
  assert.deepEqual([group.itpPercent, group.usedPercent, group.required], [null, 10, 1]);
  const zero: DashboardRows = { ...rows, itps: rows.itps.map(itp => itp.id === 'i30' ? { ...itp, ndtPercent: 0 } as Row : itp) };
  const free = weldDashboard(zero, NO_DASHBOARD_FILTERS, null).compliance.find(item => item.itpId === 'i30')!;
  assert.deepEqual([free.required, free.compliant, free.bar], [0, true, { tested: 0, selected: 0, remaining: 0 }]);
  assert.equal(itpNdtPercent(row('x', { ndtPercent: 120 })), null); assert.equal(itpNdtPercent(null), null);
});

test('filters narrow the welds: dates, company, weld type, project, welder, ITP, isometric fields, NDT process and group, WPS', () => {
  const count = (filters: Partial<DashboardFilters>) => dash(filters).kpis.totalWelds;
  assert.equal(count({ from: '2026-11-01' }), 3);                 // b1..b3; welds without a date drop out as soon as a date bound is set
  assert.equal(count({ to: '2026-10-07' }), 7);                   // a1..a7
  assert.equal(count({ from: '2026-10-08', to: '2026-10-15' }), 5);   // a8 + c1..c4
  assert.equal(count({ companyId: 'c2' }), 4);
  assert.equal(count({ location: 'Field' }), 3);                  // t2 is a Field type
  assert.equal(count({ location: 'Shop' }), 13);
  assert.equal(count({ projectId: 'p2' }), 4);
  assert.equal(count({ welderId: 'wb' }), 4);
  assert.equal(count({ itpId: 'i30' }), 9);                       // a1..a8 + d1
  assert.equal(count({ itpId: 'i50' }), 4);                       // slot 2 counts
  assert.equal(count({ pipingClass: 'SS300' }), 3);
  assert.equal(count({ irn: 'IRN-1' }), 9);
  assert.equal(count({ ped: 'Cat II' }), 9);
  assert.equal(count({ material: 'A106 Gr B' }), 9);
  assert.equal(count({ wpsId: 'w2' }), 4);
  assert.equal(count({ ndtProcessId: 'pRT' }), 1);                // a1 (the VI request of a3 is not an NDT process)
  assert.equal(count({ ndtProcessId: 'pUT' }), 1);
  assert.equal(count({ ndtGroupId: 'g2' }), 1);
  assert.equal(count({ ndtGroupId: 'g1', ndtProcessId: 'pUT' }), 0);
  const field = dash({ location: 'Field' });
  assert.deepEqual([field.kpis.projects, field.kpis.isometrics, field.kpis.examinedPercent, field.kpis.repairRate, field.compliance.length], [1, 1, 33.3, 0, 1]);
});

test('group filter, search and paging', () => {
  const groups = dash().compliance;
  assert.deepEqual(filterGroups(groups, 'Not compliant', '').map(group => group.itpNumber), ['ITP-30']);
  assert.equal(filterGroups(groups, 'Compliant', '').length, 2);
  assert.equal(filterGroups(groups, 'All groups', '').length, 3);
  assert.deepEqual(filterGroups(groups, 'All groups', ' ROBIN ').map(group => group.welderName), ['Robin Lane']);
  assert.deepEqual(filterGroups(groups, 'All groups', 'wps-135').length, 1);
  assert.equal(filterGroups(groups, 'Compliant', 'itp-30').length, 0);
  const items = Array.from({ length: 25 }, (_, index) => index);
  assert.deepEqual(pageOf(items, 0).items, items.slice(0, COMPLIANCE_PAGE_SIZE));
  assert.deepEqual([pageOf(items, 2).items.length, pageOf(items, 2).pages, pageOf(items, 9).page, pageOf(items, -3).page], [5, 3, 2, 0]);
  assert.deepEqual(pageOf([], 4), { items: [], page: 0, pages: 1 });
});

// ----- ITP / KNR links ---------------------------------------------------------------------------------------------------

test('ITP links: project scope, duplicate slots, number and revision copied from the register, stored links never block other edits', () => {
  const itps = [row('i1', { number: 'ITP-01', revision: '2' }), row('i2', { number: 'ITP-02', revision: '' }), row('i3', { number: 'ITP-03' }), row('gone', { number: 'ITP-X' })];
  itps[3] = { ...itps[3], _archived: true } as Row;
  const links = [row('l1', { itpId: 'i1', projectId: 'p1' }), row('l2', { itpId: 'i3', projectId: 'p2' })];
  assert.deepEqual(itpsForProject(itps, links, 'p1').map(itp => itp.id), ['i1', 'i2']);     // i3 is limited to p2, the archived entry is gone
  assert.deepEqual(itpsForProject(itps, links, 'p2').map(itp => itp.id), ['i2', 'i3']);
  const ok = isoItpLinks({ projectId: 'p1', itpId: 'i1', itp2Id: 'i2' }, itps, links);
  assert.deepEqual(ok.errors, {}); assert.deepEqual(ok.values, { itpNo: 'ITP-01', itpRevNo: '2', itpNo2: 'ITP-02' });   // i2 has no revision: the slot keeps its own
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p1', itpId: 'i3' }, itps, links).errors), ['itpId']);
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p1', itpId: 'i1', itp2Id: 'i1' }, itps, links).errors), ['itp2Id']);
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p1', itpId: 'gone' }, itps, links).errors), ['itpId']);
  assert.deepEqual(isoItpLinks({ projectId: 'p1', itpId: '', itp2Id: '' }, itps, links), { errors: {}, values: {} });
  // A link that is already stored (and a project that did not change) is not judged again.
  const stored = row('iso', { projectId: 'p1', itpId: 'i3' });
  assert.deepEqual(isoItpLinks({ projectId: 'p1', itpId: 'i3' }, itps, links, stored).errors, {});
  assert.deepEqual(Object.keys(isoItpLinks({ projectId: 'p2', itpId: 'i3', itp2Id: 'i3' }, itps, links, stored).errors), ['itp2Id']);
  assert.equal(isoItpId(row('x', { itpId: '', itp2Id: 'i2' })), 'i2'); assert.equal(isoItpId(row('x', { itpId: 'i1', itp2Id: 'i2' })), 'i1'); assert.equal(isoItpId(undefined), '');
});

test('editing a register entry refreshes the slots linked to it and leaves free text alone', () => {
  const itp = row('i1', { number: 'ITP-01-B', revision: '3' });
  const isos = [row('iso1', { itpId: 'i1', itpNo: 'ITP-01', itpRevNo: '2' }), row('iso2', { itp2Id: 'i1', itpNo2: 'ITP-01-B', itp2RevNo: '3' }), row('iso3', { itpNo: 'ITP-01', itpRevNo: '2' })];
  assert.deepEqual(itpSlotRefresh(itp, isos), [{ id: 'iso1', values: { itpNo: 'ITP-01-B', itpRevNo: '3' } }]);
});

// ----- menu, pilot and permission wiring ----------------------------------------------------------------------------------

test('ITPs sit in Weld Pilot → Welding data, not in MTO Pilot, and belong to the weld pilot only', () => {
  const weld = PILOT_MAP.weld.groups.find(group => group.title === 'Welding data')!.items.map(item => item.label);
  assert.ok(weld.includes('ITPs')); assert.ok(weld.indexOf('ITPs') === weld.indexOf('Isometrics list') + 1);
  assert.ok(!PILOT_MAP.mto.groups.flatMap(group => group.items).some(item => item.resource === 'itps'));
  assert.ok(!PILOT_MAP.weld.groups.flatMap(group => group.items).some(item => item.label === 'ITP templates'));
  assert.deepEqual(pagePilots('/welding/itps'), ['weld']);
  assert.deepEqual(areaPilots('local-itps'), ['weld']);
  assert.ok(RESOURCE_MAP.itps.fields.find(field => field.name === 'number')!.required);
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.resources.itps.includes('projectIds')); assert.ok(hosted.resources.isometrics.includes('itpId') && hosted.resources.isometrics.includes('itp2Id'));
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; assert.equal(Object.hasOwn(other.resources, 'itps'), false, profile); assert.ok(!other.resources.isometrics.includes('itpId'), profile); }
  assert.equal(Object.hasOwn(availabilityFor('full') ?? {}, 'resources'), false);
});

// ----- HTTP: register, linking, access in both directions, pilot boundary ---------------------------------------------------

const PASSWORD = 'Itp-Test-Password';
const RW = 'Read & write', RO = 'Read only', NONE = 'No access';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-itp-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data }: { method?: string; pilot?: string; data?: unknown } = {}) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    const login = async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); return (await response.json()).user as User; };
    return { request, login };
  };
  const account = (name: string, levels: Record<string, string>, extra: Record<string, unknown> = {}) => {
    const profile = store.create('profiles', { name: `${name} profile`, settingsPermission: NONE, toolsPermission: NONE, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, profileId: profile.id, ...extra });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return String(user.email);
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Itp admin', email: 'itp-admin@example.test', password: PASSWORD } })).status, 201);
  return { store, client, admin, account };
}
const body = async <T = Record<string, any>>(response: Response) => await response.json() as T;

test('register: create with project links, unique number, NDT % bounds, access in both directions and the pilot boundary', async t => {
  const f = await fixture(t);
  const created = await f.admin.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-09', description: 'Hydrotest piping', ndtPercent: 15, revision: '1', projectIds: ['project-cooling'] } });
  assert.equal(created.status, 201); const itp = (await body(created)).record as Row;
  assert.deepEqual([itp.number, itp.ndtPercent, itp.revision], ['ITP-09', 15, '1']);
  assert.deepEqual(f.store.list('itp_projects').filter(link => link.itpId === itp.id).map(link => link.projectId), ['project-cooling']);
  for (const bad of [{ number: 'ITP-10', ndtPercent: 101 }, { number: 'ITP-10', ndtPercent: -1 }, { number: '' }]) assert.equal((await f.admin.request('/records/itps', { method: 'POST', pilot: 'weld', data: bad })).status, 422, JSON.stringify(bad));
  assert.ok([409, 422].includes((await f.admin.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-09' } })).status));
  // Weld Pilot: the account with write access works, a reader reads but cannot write, MTO Pilot refuses the register altogether.
  const writer = f.client(); await writer.login(f.account('Itp writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }));
  const reader = f.client(); await reader.login(f.account('Itp reader', { generalPermission: RO, materialsPermission: RO, weldingPermission: RO }));
  const blind = f.client(); await blind.login(f.account('Itp blind', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE }, { weldEnabled: false, mtoEnabled: true }));
  assert.equal((await writer.request('/records/itps', { pilot: 'weld' })).status, 200);
  assert.equal((await writer.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-11', ndtPercent: 5 } })).status, 201);
  assert.equal((await reader.request('/records/itps', { pilot: 'weld' })).status, 200);
  assert.equal((await reader.request('/records/itps', { method: 'POST', pilot: 'weld', data: { number: 'ITP-12' } })).status, 403);
  assert.equal((await reader.request(`/records/itps/${itp.id}`, { method: 'PUT', pilot: 'weld', data: { ndtPercent: 90, _version: itp._version } })).status, 403);
  assert.equal((await writer.request('/records/itps', { pilot: 'mto' })).status, 403);
  assert.equal((await writer.request('/records/itps', { method: 'POST', pilot: 'mto', data: { number: 'ITP-13' } })).status, 403);
  assert.equal((await blind.request('/records/itps', { pilot: 'weld' })).status, 403);
  assert.equal((await blind.request('/records/itps', { pilot: 'mto' })).status, 403);
  assert.equal((await f.admin.request('/records/itps', { pilot: 'mto' })).status, 403);
  const bootstrap = async (as: ReturnType<typeof f.client>, pilot: string) => (await body<{ rows: Record<string, Row[]> }>(await as.request('/bootstrap', { pilot }))).rows;
  assert.ok((await bootstrap(writer, 'weld')).itps.length >= 5);
  assert.equal((await bootstrap(writer, 'mto')).itps, undefined);
  // The register is not delivered to the other release profiles.
  assert.ok(!canResource({ id: 'u', name: 'x', email: 'x', profileId: 'p', availability: availabilityFor('welding-demo'), permissions: { general: 3, materials: 3, welding: 3, tools: 3, settings: 3 } }, 'itps'));
});

test('Link ITP: the picker rules are enforced on the server, number and revision follow the register, unlinking keeps the free text', async t => {
  const f = await fixture(t);
  const put = async (id: string, data: Record<string, unknown>, as = f.admin) => { const iso = f.store.get('isometrics', id); return as.request(`/records/isometrics/${id}`, { method: 'PUT', pilot: 'weld', data: { ...data, _version: iso._version } }); };
  // iso-7 (project-steam... skid/steam isometrics keep their free text) -> link ITP-02 (limited to project-steam, revision 1).
  const iso7 = f.store.get('isometrics', 'iso-7'); const project = String(iso7.projectId);
  const itp03 = f.store.get('itps', 'itp-03');
  assert.equal(project, 'project-skid'); assert.equal(iso7.itpNo, 'ITP-03');
  assert.equal((await put('iso-7', { itpId: 'itp-02' })).status, 422);                     // ITP-02 is linked to project-steam only
  assert.equal((await put('iso-7', { itpId: 'does-not-exist' })).status, 422);
  const linked = await put('iso-7', { itpId: 'itp-03' }); assert.equal(linked.status, 200);
  const iso = (await body(linked)).record as Row; assert.deepEqual([iso.itpId, iso.itpNo, iso.itpRevNo], ['itp-03', 'ITP-03', itp03.revision]);
  assert.equal((await put('iso-7', { itp2Id: 'itp-03' })).status, 422);                    // the two slots cannot share an entry
  const open = await put('iso-7', { itp2Id: 'itp-ndt-01' }); assert.equal(open.status, 200);   // no project link: open to every project
  const both = (await body(open)).record as Row; assert.deepEqual([both.itpNo2, both.itpId], ['ITP-NDT-01', 'itp-03']);
  // An unrelated edit never trips over the stored links.
  assert.equal((await put('iso-7', { description: 'Skid line' })).status, 200);
  // Editing the entry refreshes the slot; archiving it is refused while it is linked.
  const entry = f.store.get('itps', 'itp-03');
  assert.equal((await f.admin.request('/records/itps/itp-03', { method: 'PUT', pilot: 'weld', data: { number: 'ITP-03-A', revision: '4', _version: entry._version } })).status, 200);
  const refreshed = f.store.get('isometrics', 'iso-7'); assert.deepEqual([refreshed.itpNo, refreshed.itpRevNo], ['ITP-03-A', '4']);
  const archive = await f.admin.request('/records/itps/itp-03/archive', { method: 'POST', pilot: 'weld', data: { _version: f.store.get('itps', 'itp-03')._version } });
  assert.ok([409, 422].includes(archive.status), String(archive.status));
  // Unlink: the link goes, the number and revision stay as free text.
  const unlinked = (await body(await put('iso-7', { itpId: '' }))).record as Row;
  assert.deepEqual([unlinked.itpId, unlinked.itpNo, unlinked.itpRevNo], ['', 'ITP-03-A', '4']);
  // Rights: a reader may not link; a user outside Weld Pilot may not link through the other pilot either.
  const reader = f.client(); await reader.login(f.account('Link reader', { generalPermission: RO, materialsPermission: RW, weldingPermission: RO }));
  assert.equal((await put('iso-7', { itpId: 'itp-03' }, reader)).status, 403);
  const mto = f.client(); await mto.login(f.account('Link mto', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW }));
  // iso-1: STX-2403 (iso-7) is switched off for MTO Pilot, which does not deliver it at all (scn-SC-N9).
  const stale = f.store.get('isometrics', 'iso-1');
  assert.equal((await mto.request('/records/isometrics/iso-1', { method: 'PUT', pilot: 'mto', data: { itpId: 'itp-03', _version: stale._version } })).status, 403, 'the ITP register belongs to Weld Pilot');
});

test('the sample data lets the dashboard show compliant and not compliant groups, weld type abbreviations and tracers', () => {
  const store = new Store(':memory:'); seed(store);
  const list = (key: string) => store.list(key);
  const result = weldDashboard({ welds: list('welds'), isometrics: list('isometrics'), projects: list('projects'), weldTypes: list('weld_types'), welders: list('welders'), wps: list('wps'), itps: list('itps'), ndtProcesses: list('ndt_processes'), requests: list('inspection_requests'), results: list('inspection_results') }, NO_DASHBOARD_FILTERS, list('sites').find(site => site.id === 'site-north'));
  // 31 welds in the sample, one without a welder (W031); the main project's limit is 4 %; W005 was repaired.
  assert.deepEqual([result.kpis.totalWelds, result.kpis.welded, result.kpis.repaired, result.kpis.repairPerformance.limit], [31, 30, 1, 4]);
  assert.equal(result.kpis.repairRate, 3.3);                                          // 1 / 30
  // Abbreviations come from the weld catalog owner (server/weld-catalogs-seed.ts): the Shop / Field code of the reference (WS / FW).
  assert.deepEqual(result.kpis.weldsByType.map(item => item.label).sort(), ['FW', 'WS']);
  assert.equal(result.kpis.weldsByType.reduce((sum, item) => sum + item.count, 0), 31);
  assert.ok(result.compliance.some(group => group.compliant) && result.compliance.some(group => !group.compliant));
  assert.equal(result.compliance.reduce((sum, group) => sum + group.total, 0), 30 - 2 /* W007, W023 are tracers */ - 0);
  assert.ok(result.compliance.every(group => group.required >= 1));
  assert.equal(DEFAULT_NDT_PERCENT, 10);
});
