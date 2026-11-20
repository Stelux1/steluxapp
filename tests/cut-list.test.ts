import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { loadFittingCatalog, missingFittingCatalog } from '../server/cut-list.ts';
import { CUT_LIST_DIAMETERS, CUT_LIST_FITTINGS } from '../shared/cut-list-fittings-data.ts';
import { cutLength, diameterKey, fittingFitsDiameter, fittingName, nextLineName } from '../shared/cut-list.ts';
import { buildReport } from '../shared/reports.ts';
import { RESOURCES } from '../shared/resources.ts';
import { availabilityFor } from '../shared/release.ts';

const takeoff = (code: string) => { const row = CUT_LIST_FITTINGS.find(item => item[1] === code); assert.ok(row, code); return row[4]; };
/** The 11 example lines of the client's sheet Calculation (TOTAL, BEVEL, EXTRA, FIT 1–4) and the PASTUK LENGTH the Excel shows. */
const EXCEL_LINES: [number, number | null, number | null, string[], number][] = [
  [1000, 2, null, ['e45-1in-', 'e45-1in-'], 951.54],
  [500, 2, null, ['e45-1in-', 'e45-1in-'], 451.54],
  [452, 1, 100, ['WN-1.1/4in-300', 'e45-1in-'], 462.77],
  [1600, 2, null, ['e45-2.1/2in-', 'e45-1in-'], 1528.82],
  [2540, 1, 100, ['CAP-22in-', 'e45-1in-'], 2361.77],
  [500, 2, null, ['e90-3in-', 'e90-3in-'], 267.4],
  [5000, 2, null, ['e45-1in-', 'e45-1in-'], 4951.54],
  [4520, 2, null, ['e45-1in-', 'e45-1in-'], 4471.54],
  [685, 2, null, ['e45-1in-', 'e45-1in-'], 636.54],
  [1500, 2, 200, ['e45-1in-', 'e45-1in-'], 1651.54],
  [500, null, null, ['WN-1/2in-150', 'Wolet-1in-(S40/80)-P12in'], 263.2],
];

test('the cut length formula gives the PASTUK LENGTH of every example line of the client\'s Excel', () => {
  for (const [totalLength, bevel, extraLength, fits, expected] of EXCEL_LINES) {
    const result = cutLength({ totalLength, bevel, extraLength }, fits.map(takeoff));
    assert.equal(result.length, expected, `${totalLength} / ${bevel} / ${extraLength} / ${fits.join(', ')}`);
  }
  // N = TOTAL + EXTRA − 2 × BEVEL; empty fittings take nothing off; text with a decimal comma counts as the Excel would type it.
  assert.deepEqual(cutLength({ totalLength: 1000, bevel: 2 }, []), { net: 996, takeoffs: [], length: 996 });
  assert.equal(cutLength({ totalLength: '1000,5', bevel: '', extraLength: null }, [0, 0, 0, 0]).length, 1000.5);
});

test('the fitting catalog holds the 1019 codes of sheet Codes and the diameter chart', () => {
  assert.equal(CUT_LIST_FITTINGS.length, 1019);
  assert.equal(new Set(CUT_LIST_FITTINGS.map(row => row[1].toLowerCase())).size, 1019, 'codes are unique');
  assert.ok(CUT_LIST_FITTINGS.every(row => Number.isFinite(row[4])), 'every take-off is a number');
  assert.deepEqual([takeoff('e45-1in-'), takeoff('WN-1/2in-150'), takeoff('Wolet-1in-(S40/80)-P12in'), takeoff('SWD')], [22.23, 47.8, 189, 2]);
  assert.equal(CUT_LIST_DIAMETERS.length, 56); assert.equal(CUT_LIST_DIAMETERS[0], '1/8"'); assert.equal(CUT_LIST_DIAMETERS.at(-1), 'DN600');
});

test('readable fitting names follow a rule for every prefix of the catalog', () => {
  const name = (code: string) => { const row = CUT_LIST_FITTINGS.find(item => item[1] === code)!; return fittingName({ code: row[1], description: row[2], diameter: row[3] }); };
  // The owner's examples.
  assert.equal(name('e90-2in-'), '90° Elbow 2"');
  assert.equal(name('e45-1in-'), '45° Elbow 1"');
  assert.equal(name('WN-2in-150'), 'Weld neck flange 2" LBS150');
  assert.equal(name('R-1/2x3/4in-'), 'Reducer 3/4" x 1/2"');
  assert.equal(name('TR-3/4x1/2in-'), 'Reducing tee 3/4" x 1/2"');
  assert.equal(name('Wolet-1in-(S40/80)-P12in'), 'Weldolet 1" SCH 40/80 on 12" run');
  assert.equal(name('CAP-22in-'), 'Cap 22"');
  assert.equal(name('e57-8in-'), 'Elbow cutback 57° 8"');
  // One per prefix of the file.
  const expected: Record<string, string> = {
    'WN-DN250-PN160': 'Weld neck flange DN250 PN160', 'T-1/2in-': 'Equal tee 1/2"', 'TR-5x4in-': 'Reducing tee 5" x 4"', 'SBL-1-150-RVS': 'Spectacle blind 1" LBS150 SS',
    'SBL-1/2-150-CS': 'Spectacle blind 1/2" LBS150 CS', 'HP-1/2in-': 'Half pipe diameter 1/2"', 'BL-DN10-PN6': 'Blind flange DN10 PN6', 'StEd-1/2in-ASME': 'Stub end 1/2" ASME B16.9',
    'StEd-2in-MSS': 'Stub end 2" MSS SP-43', 'GoV-1/2in-150-RF': 'Globe valve 1/2" Class 150 RF', 'GtV-1in-1500-RTJ': 'Gate valve 1" Class 1500 RTJ', 'GtVsw-1/2in-800': 'Gate valve SW 1/2" Class 800',
    'e34,63-8in-': 'Elbow cutback 34.63° 8"', 'e22,5-3in-': 'Elbow cutback 22.5° 3"', 'Nolet-3/4in-(S160)-P36': 'Nipolet 3/4" SCH 160 on 36" run', 'WoletSW-1/2in(3000)': 'Weldolet SW 1/2" Class 3000',
    'e90sw-1/2in-': '90° Elbow SW 1/2" Class 3000', 'e45sw-2in-': '45° Elbow SW 2" Class 3000', 'Tsw-1/2in-3000': 'Equal tee SW 1/2" Class 3000', 'FSW,5A': 'Socket weld flange 1/2" CL150 Class 3000',
    'FSW1,5A': 'Socket weld flange 1.1/2" CL150 Class 3000', 'SWD': 'Socket weld ring distance', 'SoF-All inch-': 'Slip-on flange (all sizes)', 'Wolet-3in-(S160)-P4in': 'Weldolet 3" SCH 160 on 4" run',
  };
  for (const [code, value] of Object.entries(expected)) assert.equal(name(code), value, code);
  // Every fitting: a rule named it (no code fragments, not the plain description) and no two fittings read the same.
  const prefixes = new Set<string>(), names = new Set<string>();
  for (const [, code, description, diameter] of CUT_LIST_FITTINGS) {
    const readable = fittingName({ code, description, diameter });
    prefixes.add(/^FSW/.test(code) ? 'FSW' : /^e[\d,]+-/.test(code) && !/^e(45|90)-/.test(code) ? 'e<angle>' : code.split(/[-(]/)[0]);
    assert.doesNotMatch(readable, /\din\b|in-|\$|undefined/, `${code} → ${readable}`);
    assert.notEqual(readable, description, code);
    assert.ok(!names.has(readable), `${readable} appears twice`); names.add(readable);
  }
  assert.deepEqual([...prefixes].sort(), ['BL', 'CAP', 'FSW', 'GoV', 'GtV', 'GtVsw', 'HP', 'Nolet', 'R', 'SBL', 'SWD', 'SoF', 'StEd', 'T', 'TR', 'Tsw', 'WN', 'Wolet', 'WoletSW', 'e45', 'e45sw', 'e90', 'e90sw', 'e<angle>'].sort());
  // A code no rule knows (one the client adds) reads as its description and diameter.
  assert.equal(fittingName({ code: 'XYZ-1', description: 'Special bend', diameter: '4' }), 'Special bend 4"');
});

test('the fitting dropdown puts the fittings of the line\'s DIA first', () => {
  assert.equal(diameterKey('1 1/2"'), diameterKey('1.1/2"')); assert.equal(diameterKey("8''"), diameterKey('8"')); assert.equal(diameterKey('2'), diameterKey('2"'));
  assert.ok(fittingFitsDiameter({ diameter: '1.1/2"' }, '1 1/2"'));
  assert.ok(fittingFitsDiameter({ diameter: '3/4"X1/2"' }, '1/2"') && fittingFitsDiameter({ diameter: '3/4"X1/2"' }, '3/4"'));
  assert.ok(fittingFitsDiameter({ diameter: '1" $ 12"' }, '12"'), 'an olet fits its run pipe');
  assert.ok(fittingFitsDiameter({ diameter: 'All inch' }, '6"') && fittingFitsDiameter({ diameter: '' }, '6"'), 'fittings of every size');
  assert.ok(!fittingFitsDiameter({ diameter: '2"' }, '1"') && !fittingFitsDiameter({ diameter: '2"' }, ''));
  assert.ok(fittingFitsDiameter({ diameter: 'DN50' }, 'dn50'));
  assert.equal(nextLineName([{ name: '1' }, { name: '7' }, { name: 'Piece A' }]), '8'); assert.equal(nextLineName([]), '1');
});

const rows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
const fittingId = (store: Store, code: string) => store.list('cut_fittings').find(row => row.code === code)!.id;

test('the server works out take-offs, cut length and line number; what the request sends for them is replaced', t => {
  const store = new Store(':memory:'); seed(store); t.after(() => store.close());
  assert.equal(store.list('cut_fittings').length, 1019, 'the sample workspace holds the catalog');
  assert.equal(loadFittingCatalog(store), 0, 'loading again adds nothing');
  const elbow = fittingId(store, 'e45-1in-');
  const line = store.create('cut_list', { isoId: 'iso-1', sheet: '1', spoolId: 'spool-1', dia: '1"', material: 'A106B', schedule: 'STD', totalLength: 1000, bevel: 2, fit1Id: elbow, fit2Id: elbow, takeoff1: 999, lengthMm: 5, quantity: null });
  assert.deepEqual([line.name, line.lengthMm, line.takeoff1, line.takeoff2, line.takeoff3, line.quantity], ['1', 951.54, 22.23, 22.23, null, 1]);
  const second = store.create('cut_list', { isoId: 'iso-1', totalLength: 452, bevel: 1, extraLength: 100, fit1Id: fittingId(store, 'WN-1.1/4in-300'), fit2Id: elbow });
  assert.deepEqual([second.name, second.lengthMm], ['2', 462.77]);
  // An edit works it out again; a fitting taken off takes nothing off.
  const edited = store.update('cut_list', line.id, { bevel: 0, fit2Id: '' }, line._version);
  assert.deepEqual([edited.lengthMm, edited.takeoff2], [977.77, null]);
  assert.throws(() => store.create('cut_list', { isoId: 'iso-1', totalLength: 30, fit1Id: fittingId(store, 'CAP-22in-') }), /cut length works out at -224 mm/);
  assert.throws(() => store.create('cut_list', { isoId: 'iso-1', totalLength: 'long' }), (error: { fields?: Record<string, string> }) => error.fields?.totalLength === 'Total length (mm) must be a number.');
  assert.throws(() => store.create('cut_list', { isoId: 'iso-1', totalLength: 100, fit1Id: 'missing' }), (error: { fields?: Record<string, string> }) => error.fields?.fit1Id === 'Choose an active fit 1.');
  // A changed take-off in the catalog: the report reads the catalog as it is now.
  const fitting = store.get('cut_fittings', elbow);
  store.update('cut_fittings', elbow, { takeoff: 20 }, fitting._version);
  const report = buildReport('cut-list', rows(store), { isoId: 'iso-1' });
  assert.deepEqual(report.rows.map(row => [row.values.name, row.values.lengthMm, row.values.fit1, row.values.material]), [['1', 980, 'e45-1in-', 'A106B'], ['2', 465, 'WN-1.1/4in-300', '']]);
  // A fitting without a name is named from its code; an earlier line (MTO material × pieces) keeps its entered cut length.
  assert.equal(store.create('cut_fittings', { code: 'e90-60in-', description: 'ELBOW 90DEG', diameter: '60"', takeoff: 1524 }).name, '90° Elbow 60"');
  assert.throws(() => store.create('cut_fittings', { code: 'e45-1in-', takeoff: 1 }), /already/);
  const material = store.create('iso_materials', { isoId: 'iso-1', customMaterial: true, materialNo: 'OLD-PIPE', description: 'Earlier cut list material', uom: 'M', quantity: 4 });
  const old = store.create('cut_list', { name: 'Piece 1', isoId: 'iso-1', requirementId: material.id, quantity: 3, lengthMm: 1250.5, takeoff1: 50 });
  assert.deepEqual([old.lengthMm, old.quantity, old.takeoff1 ?? null], [1250.5, 3, null]);
  assert.equal(buildReport('cut-list', rows(store), { isoId: 'iso-1' }).rows.find(row => row.values.name === 'Piece 1')?.values.totalMm, 3751.5);
});

test('the hosted preparation adds the catalog fittings a workspace lacks and never changes an existing one', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const sample = CUT_LIST_FITTINGS.slice(0, 3);
  store.create('cut_fittings', { name: 'Own name', code: sample[0][1], takeoff: 99 });
  assert.equal(missingFittingCatalog(store, sample).length, 2);
  assert.equal(loadFittingCatalog(store, sample), 2); assert.equal(loadFittingCatalog(store, sample), 0);
  const own = store.list('cut_fittings').find(row => row.code === sample[0][1])!;
  assert.deepEqual([own.name, own.takeoff], ['Own name', 99]);
  assert.equal(store.get('cut_fittings', `cut-fitting-${sample[1][0]}`).name, 'Weld neck flange 3/4" LBS150');
});

test('MTO Pilot delivers the cut list fields and the fitting page; no calculation norms menu entry is needed for it', () => {
  const hosted = availabilityFor('welding-workspace')!;
  for (const name of ['sheet', 'dia', 'material', 'schedule', 'totalLength', 'bevel', 'extraLength', 'fit1Id', 'fit4Id', 'takeoff1', 'lengthMm']) assert.ok(hosted.resources.cut_list.includes(name), name);
  assert.deepEqual(hosted.resources.cut_fittings, ['name', 'code', 'description', 'diameter', 'takeoff']);
  assert.ok(hosted.navigation.includes('cut_fittings'));
  assert.ok(hosted.reports['cut-list'].includes('fit1') && hosted.reports['cut-list'].includes('lengthMm'));
});

test('hosted cut list: lines over HTTP, the Print export of the isometric, and the rights of a viewer', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-cut-list-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const app = createApp(store, dir, { releaseProfile: 'welding-workspace', serveClient: false }).listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { app.close(() => resolve()); app.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`; let cookie = '';
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'mto', Origin: origin, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  }
  const password = 'Cut-List-Test-Password';
  assert.equal((await request('/auth/setup', 'POST', { name: 'Cut list admin', email: 'cut@example.test', password })).status, 201);
  const elbow = fittingId(store, 'e45-1in-');
  let response = await request('/records/cut_list', 'POST', { isoId: 'iso-1', sheet: '1', spoolId: 'spool-1', dia: '1"', material: 'A106B', schedule: 'STD', totalLength: 1000, bevel: 2, fit1Id: elbow, fit2Id: elbow, lengthMm: 1 });
  assert.equal(response.status, 201); const created = (await response.json()).record;
  assert.deepEqual([created.name, created.lengthMm, created.takeoff1], ['1', 951.54, 22.23]);
  response = await request(`/records/cut_list/${created.id}`, 'PUT', { extraLength: 100, _version: created._version });
  assert.equal(response.status, 200); assert.equal((await response.json()).record.lengthMm, 1051.54);
  response = await request('/cut-list/export?isoId=iso-1'); assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.worksheets[0], iso = store.get('isometrics', 'iso-1'), project = store.get('projects', iso.projectId);
  assert.equal(sheet.getCell('A1').value, 'Cut List');
  assert.deepEqual([sheet.getCell('A3').value, sheet.getCell('B3').value, sheet.getCell('A4').value, sheet.getCell('B4').value, sheet.getCell('G3').value, sheet.getCell('H3').value, sheet.getCell('G4').value], ['Project:', store.get('sites', project.siteId).name, 'Project no:', project.internnumber, 'Created by:', 'Cut list admin', 'Date:']);
  assert.deepEqual((sheet.getRow(7).values as unknown[]).slice(1), ['ISO NAME', 'SHT', 'SPOOL', 'DIA', 'SCH / WT', 'PASTUK LENGTH', 'BEVEL', 'MATERIAL', 'Heat No', 'QC']);
  assert.deepEqual((sheet.getRow(8).values as unknown[]).slice(1, 9), [iso.isoNo, '1', store.get('spools', 'spool-1').name, '1"', 'STD', 1051.54, 2, 'A106B']);
  assert.equal((await request('/cut-list/export?isoId=missing')).status, 404);
  // The fitting catalog is maintained by the client: an administrator adds a fitting.
  assert.equal((await request('/records/cut_fittings', 'POST', { code: 'CUSTOM-1', description: 'Special bend', diameter: '4"', takeoff: 12.5 })).status, 201);
  const user = store.create('users', { name: 'Cut list viewer', email: 'viewer-cut@example.test', profileId: 'profile-viewer', active: true });
  const { passwordHash } = await import('../server/auth.ts'); store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
  assert.equal((await request('/auth/login', 'POST', { email: user.email, password })).status, 200);
  assert.equal((await request('/records/cut_list', 'POST', { isoId: 'iso-1', totalLength: 100 })).status, 403);
  assert.equal((await request(`/records/cut_list/${created.id}`, 'PUT', { bevel: 0, _version: created._version + 1 })).status, 403);
  assert.equal((await request('/records/cut_fittings', 'POST', { code: 'DENIED', takeoff: 1 })).status, 403);
});
