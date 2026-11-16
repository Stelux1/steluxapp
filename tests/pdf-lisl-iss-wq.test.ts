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
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { OWNER_SETTING_NAMES, dnOfInch, issModel, ownerSettings, wqModel } from '../shared/pdf-lisl-iss-wq.ts';
import { NDT_FORM_COLUMNS, ndtFormCells, ndtMethodOf } from '../shared/pdf-ndt-columns.ts';
const ISS_METHOD_COLUMNS = NDT_FORM_COLUMNS.iss, WQ_NDT_COLUMNS = NDT_FORM_COLUMNS.wq;
import { issPdf } from '../server/pdf/lisl-iss.ts';
import { wqPdf } from '../server/pdf/lisl-wq.ts';
import { pdfText } from '../server/pdf/text.ts';
import type { Layout } from '../server/pdf/engine.ts';
import { PDF_MENU } from '../client/pdf-reports.tsx';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';

const PASSWORD = 'Pdf-Test-Password';
const RW = 'Read & write', NONE = 'No access';
const ACTOR = { id: 'test', name: 'test' };
const NOW = new Date('2026-11-16T10:00:00');

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-pdf-'));
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
    const login = async (email: string) => { assert.equal((await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } })).status, 200, email); };
    return { request, login };
  };
  const profile = (name: string, levels: Record<string, string>) => store.create('profiles', { name, settingsPermission: NONE, toolsPermission: NONE, ...levels }).id;
  const account = (name: string, data: Record<string, unknown>) => {
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, active: true, ...data });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    return { id: user.id, email: String(user.email) };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Pdf admin', email: 'pdf-admin@example.test', password: PASSWORD } })).status, 201);
  const rows = () => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key)])) as Record<string, Row[]>;
  return { store, client, admin, profile, account, rows };
}
const pdf = async (response: Response) => { assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf'); const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-'); return bytes; };
const printed = async (response: Response) => (await readPdf(await pdf(response))).pages.flatMap(page => page.text);
const OWNER_TEXTS = ['Northgate Pipeline Owner', 'Owner standard OS-PL-210 - pipeline construction', 'FORM-LISL-014', 'TPL-ISS-007 rev 2', 'Train 2'];
/** The main project's owner settings emptied (or restored with `values`). */
function setOwner(f: Awaited<ReturnType<typeof fixture>>, values: Record<string, string>) {
  const site = f.store.get('sites', 'site-north');
  f.store.update('sites', site.id, Object.fromEntries(OWNER_SETTING_NAMES.map(name => [name, values[name] ?? ''])), site._version, ACTOR);
}
const stamp = { _version: 1, _archived: false, _updatedAt: '', _createdAt: '2026-01-01T00:00:00Z' };

/** Nothing leaves the page and no two texts overlap (text boxes are shrunk by half a point). */
function assertClean(layout: Layout, name: string) {
  layout.pages.forEach((page, p) => {
    const boxes = page.texts.map(text => ({ ...text, right: text.x + text.width, bottom: text.y + text.size * 0.95 }));
    for (const box of boxes) {
      assert.ok(box.x >= 0 && box.right <= page.width && box.y >= 0 && box.bottom <= page.height, `${name} page ${p + 1}: "${box.text}" leaves the page`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x + 0.5 < b.right && b.x + 0.5 < a.right && a.y + 0.5 < b.bottom && b.y + 0.5 < a.bottom) assert.fail(`${name} page ${p + 1}: "${a.text}" overlaps "${b.text}"`);
    }
  });
}
const layoutTexts = (layout: Layout) => layout.pages.flatMap(page => page.texts.map(text => text.text));

test('pdfText keeps the German letters (ß ä ö ü are in WinAnsi) and the ellipsis; they reach the PDF', async () => {
  for (const word of ['Schweißnaht Nr.', 'Wandstärke', 'Prüfbericht', 'Größe', 'ÄÖÜ', 'Bezeichnung …']) assert.equal(pdfText(word), word);
  assert.equal(pdfText('ẞ'), 'SS', 'capital sharp s has no WinAnsi glyph');
});

test('the Reports menu lists the three owner-specific forms with the exact labels', () => {
  const labels = PDF_MENU.map(item => item.label);
  for (const label of ['LISL Report [ISS]', 'LISL Report [WQ]', 'LISL Report [WQ ver 2]']) assert.ok(labels.includes(label), label);
  for (const key of ['lisl-iss', 'lisl-wq', 'lisl-wq2']) assert.equal(PDF_MENU.find(item => item.key === key)?.report, 'lisl');
});

test('method columns: technique by process name, then by group name; one small table per form', () => {
  assert.equal(ndtMethodOf('RT'), 'RT'); assert.equal(ndtMethodOf('Radiography'), 'RT'); assert.equal(ndtMethodOf('X-Ray'), 'RT');
  assert.equal(ndtMethodOf('UT'), 'UT'); assert.equal(ndtMethodOf('Ultrasonic testing'), 'UT');
  assert.equal(ndtMethodOf('UT phased array'), 'PA'); assert.equal(ndtMethodOf('PAUT'), 'PA'); assert.equal(ndtMethodOf('UT ToFD'), 'TOFD');
  assert.equal(ndtMethodOf('MT bevel'), 'MT'); assert.equal(ndtMethodOf('MT cap'), 'MT'); assert.equal(ndtMethodOf('PT'), 'PT');
  assert.equal(ndtMethodOf('PMI'), 'PMI'); assert.equal(ndtMethodOf('Ferrite number'), 'FN'); assert.equal(ndtMethodOf('HV hardness'), 'HV'); assert.equal(ndtMethodOf('VT'), 'VT');
  assert.equal(ndtMethodOf('Process 7', 'Radiography group'), 'RT', 'the group name decides when the process name says nothing');
  assert.equal(ndtMethodOf('Process 7', 'Volumetric examination'), null);
  assert.equal(ndtMethodOf('Custom', ''), null);
  assert.deepEqual(ISS_METHOD_COLUMNS.map(column => column.label), ['VT', 'RT', 'PT / MT', 'UT', 'PMI', 'FN', 'HV']);
  assert.deepEqual(WQ_NDT_COLUMNS.map(column => column.label), ['AUT / Phased Array', 'Radiography', 'US las', 'ToFD', 'MT cap / MT bevel']);
});

test('ndtFormCells: A / NA with report number and date, newest result per column, cancelled / archived / PWHT ignored', () => {
  const weld = { id: 'w1', weldNo: 'W1', ...stamp } as Row;
  const processes = ['RT', 'UT', 'PT', 'MT', 'VT', 'PAUT', 'ToFD', 'Custom'].map(name => ({ id: `p-${name}`, name, groupId: 'g', ...stamp })) as Row[];
  const groups = [{ id: 'g', name: 'Volumetric', ...stamp }] as Row[];
  const request = (id: string, process: string, extra: Record<string, unknown> = {}) => ({ id, weldId: 'w1', type: 'NDT', processId: `p-${process}`, status: 'Open', ...stamp, ...extra }) as Row;
  const result = (id: string, requestId: string, value: string, reportNo: string, date: string, extra: Record<string, unknown> = {}) => ({ id, requestId, weldId: 'w1', type: 'NDT', result: value, reportNo, date, ...stamp, ...extra }) as Row;
  const requests = [request('r1', 'RT'), request('r2', 'RT'), request('r3', 'UT'), request('r4', 'PT'), request('r5', 'MT'), request('r6', 'VT', { type: 'VI' }), request('r7', 'PAUT'), request('r8', 'ToFD', { status: 'Cancelled' }), request('r9', 'Custom'), request('h1', 'RT', { type: 'PWHT' })];
  const results = [
    result('x1', 'r1', 'Rejected', 'RT-1', '2026-02-01'), result('x2', 'r2', 'Accepted', 'RT-2', '2026-02-10'), result('x3', 'r3', 'Accepted', 'UT-1', '2026-02-03'), result('x4', 'r4', 'Rejected', 'PT-1', '2026-02-04'),
    result('x5', 'r5', 'Accepted', 'MT-1', '2026-02-05', { _archived: true }), result('x6', 'r6', 'Accepted', 'VI-1', '2026-02-06', { type: 'VI' }), result('x7', 'r7', 'Accepted', 'PA-1', '2026-02-07'), result('x8', 'r8', 'Accepted', 'TF-1', '2026-02-08'),
    result('x9', 'r9', 'Accepted', 'CU-1', '2026-02-09'), result('y1', 'h1', 'Accepted', 'HT-1', '2026-02-11', { type: 'PWHT' }), { ...result('z1', 'r1', 'Accepted', 'OTHER', '2026-03-01'), weldId: 'other' } as Row,
  ];
  const iss = ndtFormCells(ISS_METHOD_COLUMNS, weld, { results, requests, processes, groups });
  assert.deepEqual(iss.rt, { result: 'A', report: 'RT-2', date: '2026-02-10' }, 'the repeat examination replaces the rejected one');
  assert.deepEqual(iss.ut, { result: 'A', report: 'PA-1', date: '2026-02-07' }, 'all ultrasonic techniques print in UT, the newest counts');
  assert.deepEqual(iss.ptmt, { result: 'NA', report: 'PT-1', date: '2026-02-04' }, 'the archived MT result is ignored, PT remains');
  assert.deepEqual(iss.vt, { result: 'A', report: 'VI-1', date: '2026-02-06' }, 'a visual inspection result fills VT');
  for (const id of ['pmi', 'fn', 'hv']) assert.equal(iss[id].result, '', id);
  const wq = ndtFormCells(WQ_NDT_COLUMNS, weld, { results, requests, processes, groups });
  assert.deepEqual(wq.rt, iss.rt); assert.deepEqual(wq.ut, { result: 'A', report: 'UT-1', date: '2026-02-03' }, 'US las is plain UT only');
  assert.deepEqual(wq.aut, { result: 'A', report: 'PA-1', date: '2026-02-07' });
  assert.equal(wq.tofd.result, '', 'a cancelled request is ignored'); assert.equal(wq.mt.result, '');
  assert.equal(JSON.stringify(wq).includes('HT-1') || JSON.stringify(wq).includes('CU-1') || JSON.stringify(wq).includes('PT-1'), false, 'PWHT, unmapped processes and PT never print on the [WQ] form');
});

test('DN follows the inch size and owner settings are read from the main project', () => {
  assert.equal(dnOfInch('6'), '150'); assert.equal(dnOfInch(0.5), '15'); assert.equal(dnOfInch('1.25'), '32'); assert.equal(dnOfInch('7'), ''); assert.equal(dnOfInch(''), '');
  assert.equal(ownerSettings(null).ownerName, '');
  assert.equal(ownerSettings({ id: 's', ownerName: ' Acme Owner ', ...stamp } as Row).ownerName, 'Acme Owner');
});

test('[ISS]: A4 landscape, every label in German and English, weld rows and method columns; owner texts follow the settings', async t => {
  const f = await fixture(t);
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-1');
  const response = await f.admin.request('/pdf/lisl-iss?isoId=iso-1', { pilot: 'weld' });
  assert.match(response.headers.get('content-disposition') || '', /-STX-2401-LISL-ISS\.pdf"/);
  const document = await readPdf(await pdf(response));
  assert.equal(document.pages.length, 1);
  assert.deepEqual([document.pages[0].width, document.pages[0].height], [842, 595]);
  const text = document.pages[0].text;
  for (const label of [
    'Zeichnungsnummer', 'Drawing number', 'Blatt', 'Sheet', 'Seite n von N', 'Page n of N', 'Spool-Nummer', 'Spool number', 'Projektname', 'Project name', 'Anlagenstrang', 'Train', 'Projektnummer', 'Project number',
    'ITP-Nummern', 'ITP numbers', 'Dokumentvorlage', 'Document template', 'Lieferant', 'Supplier', 'Fluidkategorie /', 'PED-Kategorie', 'Fluid service / PED category', 'Prüfnorm (ZfP)', 'NDT standard', 'ASME', 'EN ISO',
    'Schweißnaht Nr.', 'Weld No.', 'Nahtart', 'Weld type', 'Bezeichnung', 'Description', 'Durchmesser /', 'Diameter /', 'Wandstärke', 'Wall thickness', 'Zeugnisnummer', 'Certificate No.', 'Schmelze Nr.', 'Heat No.',
    'WPS Nr.', 'WPS No.', 'PQR Nr.', 'PQR No.', 'Schweißzusatz', 'Filler', 'Schweißer ID', 'Welder ID', 'Schweißdatum', 'Welding date', 'Prüfbericht Nr.', 'Report No.', 'Prüfdatum', 'Test date', 'Bemerkungen', 'Comments',
    'VT 100 %', 'Datum', 'Date', 'Abteilung', 'Section', 'Name', 'Prüfer', '/ Inspector', 'Endkunde', '/ End client', '1 of 1',
  ]) assert.ok(text.includes(label), label);
  for (const weld of welds) assert.ok(text.includes(String(weld.weldNo)), String(weld.weldNo));
  for (const owner of ['Northgate Pipeline Owner', 'TPL-ISS-007 rev 2', 'Train 2']) assert.ok(text.includes(owner), owner);
  assert.ok(text.includes('RT-2026-001') && text.includes('20.10.2026'), 'report number and test date of the RT column');
  // The same sheet without any owner setting: no owner text, the generic labels remain.
  setOwner(f, {});
  const bare = await printed(await f.admin.request('/pdf/lisl-iss?isoId=iso-1', { pilot: 'weld' }));
  for (const owner of OWNER_TEXTS) assert.ok(!bare.includes(owner), `${owner} must not be printed`);
  for (const label of ['Endkunde', '/ End client', 'Lieferant', 'Zeichnungsnummer']) assert.ok(bare.includes(label), label);
});

test('[ISS] layout model: sizes, "n of N" on every page, header and footer repeat, rows never split, nothing overflows or overlaps', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 40; i++) f.store.create('welds', { weldNo: `X${String(i).padStart(3, '0')}`, isoId: 'iso-1', typeId: 'weld-type-1', welder1Id: 'welder-1', wpsId: 'wps-1', date: '2026-10-05', chargeNo1: 'H-1042', description: 'A long remark that has to wrap onto several lines of the comments column of the sheet.' }, ACTOR);
  const rows = f.rows(), model = issModel(rows, 'iso-1', 'Kestrel Pipe Fabrication B.V.')!;
  const { layout, bytes } = await issPdf({ model, company: null, generatedAt: NOW });
  assert.ok(layout.pages.length >= 3);
  layout.pages.forEach((page, index) => {
    assert.deepEqual([Math.round(page.width), Math.round(page.height)], [842, 595]);
    const texts = page.texts.map(text => text.text);
    assert.ok(texts.includes(`${index + 1} of ${layout.pages.length}`), `page ${index + 1} of ${layout.pages.length}`);
    assert.ok(texts.includes('Zeichnungsnummer') && texts.includes('Endkunde'), 'header and footer on every page');
    assert.equal(page.tableHeaders, 1, 'table header on every page');
    assert.ok(texts.includes('RT 10 %') && texts.includes('RT … %') === false, 'the RT percentage comes from the isometric');
    assert.ok(texts.includes('PT / MT … %'));
    for (const row of page.rows) assert.ok(row.bottom <= page.height, 'rows stay on the page');
  });
  const numbers = layout.pages.flatMap(page => page.texts.map(text => text.text).filter(value => /^X\d{3}$/.test(value)));
  assert.equal(numbers.length, 40); assert.equal(new Set(numbers).size, 40);
  assertClean(layout, 'ISS');
  assert.equal((await readPdf(bytes)).pages.length, layout.pages.length);
  // Rows of one page never run into the signature boxes: the last row ends above the footer's top.
  for (const page of layout.pages) { const last = page.rows.at(-1)!, boxTop = Math.max(...page.texts.filter(text => text.text === 'Lieferant').map(text => text.y)); assert.ok(last.bottom < boxTop, 'last row above the signature boxes'); }
});

test('[WQ] / [WQ ver 2]: A4 landscape, frames, columns, owner texts, visual inspection line only in [WQ], VT-no. only in [WQ ver 2]', async t => {
  const f = await fixture(t);
  const vi = f.store.create('inspection_requests', { weldId: 'weld-1', type: 'VI', date: '2026-10-19', status: 'Open' }, ACTOR);
  f.store.create('inspection_results', { requestId: vi.id, weldId: 'weld-1', type: 'VI', reportNo: 'VI-2026-001', result: 'Accepted', round: 'Initial', date: '2026-10-19' }, ACTOR);
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-1');
  const one = await readPdf(await pdf(await f.admin.request('/pdf/lisl-wq?isoId=iso-1', { pilot: 'weld' })));
  const two = await readPdf(await pdf(await f.admin.request('/pdf/lisl-wq2?isoId=iso-1', { pilot: 'weld' })));
  for (const document of [one, two]) {
    assert.equal(document.pages.length, 1); assert.deepEqual([document.pages[0].width, document.pages[0].height], [842, 595]);
    const text = document.pages[0].text, flat = text.join(' '); // narrow headings wrap onto lines that follow each other
    for (const label of ['Line Inspection Status List (LISL)', 'Home location: North fabrication yard', 'Doc.', 'Version', 'Date', 'Page', 'Asset Tag', 'Drawing No.', 'Diameter', 'Installation no.', 'Project no.',
      'Identification mark', 'Pipe or heat no.', 'B.B. no.', 'Diam. DN', 'Wall thk. mm', 'Material Type / quality', 'Pipe', 'Coating', 'Installed length', 'Description', 'POS', 'Weld no.', 'Welder', 'WPS no.',
      'Fixed points on route map', 'KM', 'VT-no.', 'Non-destructive testing', 'AUT / Phased Array', 'Radiography', 'US las', 'ToFD', 'MT cap / MT bevel', 'A / NA', 'Rep. No.', 'Weld coating', 'Insulation', 'Electrofusion shrink sleeve', 'QA/QC Approval',
      'Signed by (contractor)', 'Supervisor Northgate Pipeline Owner', 'Signature', 'Owner standard OS-PL-210 - pipeline construction', 'FORM-LISL-014', '01.03.2026', '1 of 1']) assert.ok(flat.includes(label), label);
    for (const weld of welds) assert.ok(text.includes(String(weld.weldNo)), String(weld.weldNo));
    assert.ok(text.includes('RT-2026-001'), 'radiography report number');
    assert.ok(text.includes('A'), 'result code');
  }
  assert.ok(one.pages[0].text.includes('Visual inspection report(s): VI-2026-001'), '[WQ] lists the visual inspection reports in the header');
  assert.equal(one.pages[0].text.filter(item => item === 'VI-2026-001').length, 0, '[WQ] leaves VT-no. empty');
  assert.ok(!two.pages[0].text.some(item => item.startsWith('Visual inspection')), '[WQ ver 2] has no visual inspection line');
  assert.ok(two.pages[0].text.includes('VI-2026-001'), '[WQ ver 2] fills VT-no. from the weld\'s visual inspection report');
  setOwner(f, {});
  const bare = await printed(await f.admin.request('/pdf/lisl-wq?isoId=iso-1', { pilot: 'weld' }));
  for (const owner of [...OWNER_TEXTS, 'Supervisor Northgate Pipeline Owner', '01.03.2026']) assert.ok(!bare.includes(owner), `${owner} must not be printed`);
  assert.ok(bare.includes('Supervisor') && bare.includes('Line Inspection Status List (LISL)'));
});

test('[WQ] layout model: sizes, "n of N", repeating headers, rows stay whole, nothing overflows or overlaps', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 50; i++) f.store.create('welds', { weldNo: `X${String(i).padStart(3, '0')}`, isoId: 'iso-1', typeId: 'weld-type-1', welder1Id: 'welder-1', wpsId: 'wps-1', chargeNo1: 'H-1042' }, ACTOR);
  const model = wqModel(f.rows(), 'iso-1')!;
  for (const version of ['v1', 'v2'] as const) {
    const { layout } = await wqPdf({ model, version, company: { company: { name: 'Kestrel Pipe Fabrication B.V.', addressLines: [], phone: '', logoHeightMm: 18 }, logo: null }, generatedAt: NOW });
    assert.ok(layout.pages.length >= 2);
    layout.pages.forEach((page, index) => {
      assert.deepEqual([Math.round(page.width), Math.round(page.height)], [842, 595]);
      const texts = page.texts.map(text => text.text);
      assert.equal(texts.filter(value => value === `${index + 1} of ${layout.pages.length}`).length, 2, 'page number in both frames');
      assert.ok(texts.includes('Kestrel Pipe Fabrication B.V.') && texts.includes('Rep. No.') && texts.includes('Signed by (contractor)'));
      assert.equal(page.tableHeaders, 1);
    });
    assert.equal(layoutTexts(layout).filter(value => /^X\d{3}$/.test(value)).length, 50);
    assertClean(layout, `WQ ${version}`);
  }
});

test('access: the three forms follow the LISL report rules inside the current pilot, both directions', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const weldNone = f.profile('No weld module', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const noReport = f.account('Materials only', { profileId: weldNone, weldEnabled: true, weldProfileId: weldNone, mtoEnabled: true, mtoProfileId: writer });
  const weld = f.client(), mto = f.client(), none = f.client(); await weld.login(weldOnly.email); await mto.login(mtoOnly.email); await none.login(noReport.email);
  for (const key of ['lisl-iss', 'lisl-wq', 'lisl-wq2']) {
    const path = `/pdf/${key}?isoId=iso-1`;
    await pdf(await weld.request(path, { pilot: 'weld' })); await pdf(await f.admin.request(path, { pilot: 'weld' }));
    assert.equal((await weld.request(path, { pilot: 'mto' })).status, 403, `${key}: weld-only account in MTO Pilot`);
    assert.equal((await mto.request(path, { pilot: 'weld' })).status, 403, `${key}: MTO-only account in Weld Pilot`);
    assert.equal((await mto.request(path, { pilot: 'mto' })).status, 403, `${key}: MTO Pilot has no LISL report`);
    assert.equal((await f.admin.request(path, { pilot: 'mto' })).status, 403, `${key}: same account in the other pilot`);
    assert.equal((await f.admin.request(path)).status, 403, `${key}: no pilot`);
    assert.equal((await none.request(path, { pilot: 'weld' })).status, 403, `${key}: no report permission`);
    assert.equal((await f.admin.request(`/pdf/${key}?isoId=missing`, { pilot: 'weld' })).status, 404, `${key}: unknown isometric`);
  }
});
