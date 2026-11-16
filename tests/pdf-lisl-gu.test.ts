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
import { RESOURCES } from '../shared/resources.ts';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import { dnOfInch, lislGuPdf, ownerModel, wrapCell, type OwnerFormInput } from '../server/pdf/lisl-gu.ts';
import { lislMvPdf } from '../server/pdf/lisl-mv.ts';
import { isometricUrl, lislGuRevPdf } from '../server/pdf/lisl-gu-rev.ts';
import { qrMatrix } from '../server/pdf/engine.ts';
import { COLUMN_TABLE, NDT_FORM_COLUMNS, ndtColumnCells, ndtColumnOf, ndtMethodOf } from '../shared/pdf-ndt-columns.ts';
import { OWNER_FORM_SETTINGS, ownerFormTexts } from '../shared/site-settings.ts';
import { PDF_MENU } from '../client/pdf-reports.tsx';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';

const PASSWORD = 'Pdf-Test-Password';
const RW = 'Read & write', NONE = 'No access';
const ACTOR = { id: 'test', name: 'test' };
const FORMS = [
  { key: 'lisl-gu', label: 'LISL Report [GU]', size: [842, 595] },
  { key: 'lisl-mv', label: 'LISL Report [MV]', size: [1191, 842] },
  { key: 'lisl-gu-rev2', label: 'LISL Report [GU Rev 2]', size: [842, 595] },
  { key: 'lisl-gu-rev3', label: 'LISL Report [GU Rev 3]', size: [842, 595] },
] as const;

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-pdf-gu-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: 'welding-workspace', serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
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
  return { store, client, admin, profile, account, origin };
}
const pdf = async (response: Response) => { assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf'); const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-'); return bytes; };
const allRows = (store: Store) => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)])) as Record<string, Row[]>;
const input = (store: Store, extra: Partial<OwnerFormInput> = {}): OwnerFormInput => ({ model: ownerModel(allRows(store), 'iso-1', 'All')!, options: { type: 'All', weldRecord: true, signaturePerPage: false }, company: null, signature: null, generatedAt: new Date('2026-11-16T10:00:00Z'), origin: 'https://app.example.test', ...extra });

const stamp = { _version: 1, _archived: false, _updatedAt: '', _createdAt: '2026-01-01T00:00:00Z' };

test('the four documents are in the registry and the Reports menu with the same access rule as the LISL report', () => {
  for (const form of FORMS) {
    assert.equal(PDF_DOCUMENTS.find(document => document.key === form.key)?.report, 'lisl', form.key);
    assert.equal(PDF_DOCUMENTS.find(document => document.key === form.key)?.title, form.label);
    assert.deepEqual(PDF_MENU.filter(item => item.key === form.key).map(item => [item.label, item.report]), [[form.label, 'lisl']]);
  }
});

test('NDT column mapping: one table from request type and method (process name or process group) to the form columns', () => {
  assert.deepEqual(['RT', 'rt 100%', 'Radiography', 'UT', 'Ultrasonic testing', 'TOFD', 'Phased array UT', 'PAUT', 'MT', 'Magnetic particle', 'PT', 'Liquid penetrant', 'PMI', 'VT', 'Visual', 'Hydro'].map(ndtMethodOf), ['RT', 'RT', 'RT', 'UT', 'UT', 'TOFD', 'PA', 'PA', 'MT', 'MT', 'PT', 'PT', 'PMI', 'VT', 'VT', null]);
  const request = (type: string) => ({ id: 'r', type, ...stamp }) as Row;
  const column = (type: string, process: string, group = '') => ndtColumnOf(request(type), { process, group });
  assert.equal(column('NDT', 'RT'), 'RT'); assert.equal(column('NDT', 'UT'), 'US'); assert.equal(column('NDT', 'TOFD'), 'TOFD'); assert.equal(column('NDT', 'PAUT'), 'PA');
  assert.equal(column('NDT', 'MT'), 'MTPT'); assert.equal(column('NDT', 'PT'), 'MTPT'); assert.equal(column('NDT', 'PMI'), 'PMI'); assert.equal(column('NDT', 'VT'), 'VT');
  assert.equal(column('NDT PRE', 'MT'), 'MTPT_PRE'); assert.equal(column('NDT PRE', 'UT'), 'US_PRE'); assert.equal(column('NDT PRE', 'RT'), null, 'no column for RT before welding');
  assert.equal(column('VI', ''), 'VT'); assert.equal(column('PWHT', ''), 'PWHT'); assert.equal(column('PRE-HT', ''), null);
  assert.equal(column('NDT', 'Custom method', 'Radiographic examination'), 'RT', 'the process group names the method when the process does not');
  assert.equal(column('NDT', 'Custom method', 'Something else'), null);
  assert.deepEqual(Object.keys(COLUMN_TABLE).sort(), ['NDT', 'NDT PRE', 'PWHT', 'VI']);
  assert.deepEqual(NDT_FORM_COLUMNS.gu.map(item => item.label), ['VT', 'PA', 'RT', 'PWHT', 'US weld', 'ToFD', 'MT/PT bevel', 'MT/PT']);
  assert.deepEqual(NDT_FORM_COLUMNS.mv.map(item => item.label), [...NDT_FORM_COLUMNS.gu.map(item => item.label), 'PMI']);
  assert.deepEqual(NDT_FORM_COLUMNS.rev.map(item => item.label), ['AUT/Phased Array', 'Radiography', 'US dubb.', 'US las', 'ToFD', 'MT bevel', 'MT cap']);
});

test('ndtColumnCells prints A or NA with the report number, the latest result per column, nothing without a result', () => {
  const weld = { id: 'w1', weldNo: 'W1', ...stamp } as Row;
  const request = (id: string, type: string, process: string, extra: Record<string, unknown> = {}) => ({ id, weldId: 'w1', type, processId: process, status: 'Open', date: '2026-01-10', ...extra, ...stamp }) as Row;
  const result = (id: string, requestId: string, value: string, reportNo: string, date: string) => ({ id, requestId, weldId: 'w1', result: value, reportNo, date, ...stamp }) as Row;
  const requests = [request('a', 'NDT', 'RT'), request('b', 'NDT', 'RT', { date: '2026-01-20' }), request('c', 'NDT', 'MT'), request('d', 'NDT PRE', 'MT'), request('e', 'NDT', 'UT'), request('f', 'PWHT', ''), request('g', 'NDT', 'TOFD', { status: 'Cancelled' }), { ...request('h', 'NDT', 'PMI'), weldId: 'other' } as Row];
  const results = [result('x1', 'a', 'Rejected', 'RT-1', '2026-02-01'), result('x2', 'b', 'Accepted', 'RT-2', '2026-02-10'), result('x3', 'c', 'Rejected', 'MT-1', '2026-02-01'), result('x4', 'd', 'Accepted', 'MTB-1', '2026-01-15'), result('x5', 'f', 'Accepted', 'HT-1', '2026-02-02'), result('x6', 'g', 'Accepted', 'TF-1', '2026-02-02'), result('x7', 'h', 'Accepted', 'PMI-1', '2026-02-02')];
  const names = (item: Row) => ({ process: String(item.processId ?? ''), group: '' });
  const cells = ndtColumnCells(weld, results, requests, names);
  assert.deepEqual(cells.RT, { result: 'A', report: 'RT-2' }, 'a later accepted examination replaces the earlier rejected one');
  assert.deepEqual(cells.MTPT, { result: 'NA', report: 'MT-1' });
  assert.deepEqual(cells.MTPT_PRE, { result: 'A', report: 'MTB-1' });
  assert.deepEqual(cells.US, { result: '', report: '' }, 'requested, no result: empty');
  assert.deepEqual(cells.PWHT, { result: 'A', report: 'HT-1' });
  assert.deepEqual(cells.TOFD, { result: '', report: '' }, 'cancelled request');
  assert.deepEqual(cells.PMI, { result: '', report: '' }, 'another weld');
  assert.deepEqual(cells.VT, { result: '', report: '' });
});

test('DN follows the nominal size in inches and the cell wrapper breaks report numbers at their hyphens', () => {
  assert.deepEqual(['2', '2"', '1.1/2"', '3/4', '0.5', '4', 'DN 80', ''].map(dnOfInch), ['50', '50', '40', '20', '15', '100', 'DN 80', '']);
  const measure = (text: string) => text.length * 3;
  assert.deepEqual(wrapCell('RT-2026-001', measure, 30, 3), ['RT-2026-', '001']);
  assert.deepEqual(wrapCell('Carbon steel pipe', measure, 36, 3), ['Carbon steel', 'pipe']);
  assert.deepEqual(wrapCell('', measure, 30, 3), ['']);
  assert.equal(wrapCell('one two three four five six', measure, 18, 2).length, 2);
});

test('owner settings: the text fields exist in the Document settings and are read per form family', () => {
  const site = RESOURCES.find(resource => resource.key === 'sites')!;
  for (const setting of OWNER_FORM_SETTINGS) { const field = site.fields.find(item => item.name === setting.name); assert.ok(field, setting.name); assert.equal(field.section, 'Document settings'); assert.ok(field.label && field.hint); }
  assert.deepEqual(ownerFormTexts({ lislGuField1: ' D-1 ', lislGuField2: 'V1', lislGuField3: '2026-01-02', lislGuSpec1: 'Spec', lislGuSpec2: '' }, 'gu'), { ownerLine: '', docNo: 'D-1', version: 'V1', date: '2026-01-02', specLines: ['Spec'] });
  assert.deepEqual(ownerFormTexts({ lislRevOwnerLine: 'Line' }, 'rev'), { ownerLine: 'Line', docNo: '', version: '', date: '', specLines: [] });
  assert.deepEqual(ownerFormTexts(undefined, 'mv'), { ownerLine: '', docNo: '', version: '', date: '', specLines: [] });
});

test('each form: page size and orientation, header labels, weld numbers, material and NDT data, owner texts from the settings', async t => {
  const f = await fixture(t);
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-1');
  assert.ok(welds.length >= 2);
  const site = f.store.get('sites', 'site-north');
  const texts: Record<string, string[]> = {
    'lisl-gu': [String(site.lislGuField1), String(site.lislGuField2), String(site.lislGuSpec1), String(site.lislGuSpec2)],
    'lisl-mv': [String(site.lislMvDocNo), String(site.lislMvVersion), String(site.lislMvSpec1), String(site.lislMvSpec2)],
    'lisl-gu-rev2': [String(site.lislRevOwnerLine), String(site.lislRevDocNo), String(site.lislRevVersion)],
    'lisl-gu-rev3': [String(site.lislRevOwnerLine), String(site.lislRevDocNo), String(site.lislRevVersion)],
  };
  const labels: Record<string, string[]> = {
    'lisl-gu': ['WELDING REPORT STATIONS/INSTALLATIONS', 'Project: North fabrication yard', 'Doc.', 'Version', 'Date', 'Page', '1 of 1', 'Installation no.', 'IRN-101', 'Drawing No', 'STX-CW-001 Rev. 2', 'Diameter', 'ITP no:', 'ITP-01 / ITP-NDT-01', 'PED Cat.:', 'X Ray:', '10%', 'Section', 'STX-2401', 'Paint spec.', 'Section description', 'Cooling water expansion', 'Identifications code', 'Not Destructive Test', 'VT', 'PA', 'RT', 'PWHT', 'US weld', 'ToFD', 'MT/PT bevel', 'MT/PT', 'Weld No.', 'Welders', 'WPS', 'Diam.', 'WT', 'Pipe', 'Description', 'POS', 'Rep.', 'Compiled by:', 'Signature:', 'Northline Process', 'NoBo', 'WPS code', 'WPS name', 'Definition', 'STX-WPS-141-01', '141'],
    'lisl-mv': ['WELDING REPORT STATIONS/INSTALLATIONS', 'Installation no.', 'Consumable details', 'Location', 'Joint', 'Welder', 'Wire 1', 'mm', 'Wire 2', 'Fit-up', 'PMI', 'MT/PT bevel', 'WPS name', 'WPS process', 'Definition', '2.4', 'Compiled by:', 'NoBo'],
    'lisl-gu-rev2': ['Pre-commissioning', 'WELDING REPORT (HEAT TRANSPORT) PIPES AND INSTALLATIONS', 'Project site', 'Project No.', 'Visual inspection report(s)', 'Location or line number', 'Drawing No.', 'Page', '1 of 1', 'Identification mark', 'Non-destructive testing', 'AUT/Phased Array', 'Radiography', 'US dubb.', 'US las', 'ToFD', 'MT bevel', 'MT cap', 'VT-no.', 'Construction Supervisor', 'Signature', 'Date', 'Contractor', 'Client', "Inspector's Stamp"],
    'lisl-gu-rev3': ['Pre-commissioning', 'WELDING REPORT (HEAT TRANSPORT) PIPES AND INSTALLATIONS', 'Project site', 'Project No.', 'Location or line number', 'Drawing No.', 'Page', 'Non-destructive testing', 'Construction Supervisor', "Inspector's Stamp"],
  };
  for (const form of FORMS) {
    const response = await f.admin.request(`/pdf/${form.key}?isoId=iso-1`, { pilot: 'weld' });
    assert.match(response.headers.get('content-disposition') || '', /filename="\d{4}-\d\d-\d\d-STX-2401-LISL-(GU|MV|GU-Rev[23])\.pdf"/, form.key);
    const document = await readPdf(await pdf(response));
    assert.equal(document.pages.length, 1, form.key);
    assert.deepEqual([document.pages[0].width, document.pages[0].height], form.size, `${form.key} size`);
    const text = document.pages[0].text;
    for (const weld of welds) assert.ok(text.includes(String(weld.weldNo)), `${form.key} ${weld.weldNo}`);
    for (const label of [...labels[form.key], ...texts[form.key]]) assert.ok(text.includes(label), `${form.key}: ${label}`);
    assert.ok(text.some(line => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(line)) && text.includes('1/1'), `${form.key} footer`);
    assert.ok(text.includes('RT-2026-001'), `${form.key} NDT report number`);
  }
  const rev3 = (await readPdf(await pdf(await f.admin.request('/pdf/lisl-gu-rev3?isoId=iso-1', { pilot: 'weld' })))).pages[0].text;
  assert.ok(!rev3.includes('Visual inspection report(s)'), 'Rev 3 has no visual inspection row');
  // A weld record of the first weld: the DN, material number and welder code of the sides come from the data.
  const gu = (await readPdf(await pdf(await f.admin.request('/pdf/lisl-gu?isoId=iso-1', { pilot: 'weld' })))).pages[0].text;
  assert.ok(f.store.list('welders').some(welder => gu.includes(String(welder.welderCode || welder.number))), 'welder code'); assert.ok(gu.includes(welds.find(weld => weld.date) ? String(welds.find(weld => weld.date)!.date).split('-').reverse().join('.') : ''));
});

test('owner texts name no third party unless the Document settings are filled in', async t => {
  const f = await fixture(t);
  const site = f.store.get('sites', 'site-north');
  const set = (data: Record<string, unknown>) => { const current = f.store.get('sites', 'site-north'); f.store.update('sites', 'site-north', data, current._version, ACTOR); };
  const printed = async (key: string) => (await readPdf(await pdf(await f.admin.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'weld' })))).pages.flatMap(page => page.text);
  const values = OWNER_FORM_SETTINGS.map(setting => String(site[setting.name])).concat([String(site.lislGuField1), String(site.lislGuField2), String(site.lislGuField3)]).filter(Boolean);
  assert.ok(values.length >= 11);
  for (const key of ['lisl-gu', 'lisl-mv', 'lisl-gu-rev2', 'lisl-gu-rev3']) { const text = await printed(key); assert.ok(values.some(value => text.includes(value)), `${key} prints settings`); }
  set(Object.fromEntries([...OWNER_FORM_SETTINGS.map(setting => [setting.name, '']), ['lislGuField1', ''], ['lislGuField2', ''], ['lislGuField3', '']]));
  for (const key of ['lisl-gu', 'lisl-mv', 'lisl-gu-rev2', 'lisl-gu-rev3']) {
    const text = await printed(key);
    for (const value of values) assert.ok(!text.includes(value), `${key} still prints "${value}"`);
    for (const label of ['Doc.', 'Version']) assert.ok(!text.includes(label), `${key} prints the label "${label}" without a value`);
    assert.ok(text.includes('Page') && text.includes('1 of 1'), `${key} still has the page block`);
    assert.ok(text.some(line => /^[A-Z]/.test(line)), key);
  }
  const gu = await printed('lisl-gu');
  assert.ok(gu.includes('WELDING REPORT STATIONS/INSTALLATIONS') && gu.includes('Installation no.'), 'the form itself is unchanged');
});

test('QR code of the Rev forms encodes the isometric URL; the GU and MV forms have none', async t => {
  const f = await fixture(t);
  const base = input(f.store);
  for (const revision of [2, 3] as const) {
    const { layout } = await lislGuRevPdf(base, revision);
    assert.equal(layout.pages[0].images, 1, `Rev ${revision} has a QR code`);
    assert.equal((await lislGuRevPdf({ ...base, origin: undefined }, revision)).layout.pages[0].images, 0, 'no origin, no QR code');
  }
  assert.equal((await lislGuPdf(base)).layout.pages[0].images, 0);
  assert.equal((await lislMvPdf(base)).layout.pages[0].images, 0);
  assert.equal(isometricUrl('https://app.example.test/', 'iso-1'), 'https://app.example.test/workspace/isometrics/iso-1');
  assert.ok(qrMatrix(isometricUrl('https://app.example.test', 'iso-1')).length >= 21);
  // The QR modules of two different isometrics differ.
  const one = qrMatrix(isometricUrl('https://app.example.test', 'iso-1')).flat().join(''), two = qrMatrix(isometricUrl('https://app.example.test', 'iso-2')).flat().join('');
  assert.notEqual(one, two);
  // Over HTTP the address is the origin of the request (no public origin configured in the test app).
  const http = await readPdf(await pdf(await f.admin.request('/pdf/lisl-gu-rev2?isoId=iso-1', { pilot: 'weld' })));
  assert.equal(http.pages.length, 1);
});

test('rows never split, headers repeat and the page block shows "n of N" on a long weld list', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 70; i++) f.store.create('welds', { weldNo: `X${String(i).padStart(3, '0')}`, isoId: 'iso-1', typeId: 'weld-type-1' }, ACTOR);
  for (const form of FORMS) {
    const document = await readPdf(await pdf(await f.admin.request(`/pdf/${form.key}?isoId=iso-1`, { pilot: 'weld' })));
    const total = document.pages.length;
    assert.ok(total >= 2, form.key);
    document.pages.forEach((page, index) => {
      assert.ok(page.text.includes(`${index + 1} of ${total}`), `${form.key} page ${index + 1} of ${total}`);
      assert.ok(page.text.includes(`${index + 1}/${total}`));
      assert.ok(page.text.includes('Non-destructive testing') || page.text.includes('Not Destructive Test'), `${form.key} header band on page ${index + 1}`);
      if (page.text.some(line => /^X\d{3}$/.test(line))) assert.ok(page.text.includes('Description') && page.text.includes('Rep.'), `table header on page ${index + 1}`);
      assert.deepEqual([page.width, page.height], form.size);
    });
    const numbers = document.pages.flatMap(page => page.text.filter(line => /^X\d{3}$/.test(line)));
    assert.equal(numbers.length, 70, form.key); assert.equal(new Set(numbers).size, 70);
  }
  const { layout } = await lislGuPdf(input(f.store));
  const pages = layout.pages.length;
  assert.ok(pages >= 2);
  layout.pages.forEach(page => { assert.ok(page.tableHeaders >= 1 && page.pageHeader); for (const row of page.rows) { assert.ok(row.top >= 0 && row.bottom <= page.height - 16 - 12, 'a row stays inside the page'); } });
  const rows = layout.pages.flatMap(page => page.rows).filter(row => row.table === 0);
  assert.equal(rows.length, ownerModel(allRows(f.store), 'iso-1', 'All')!.welds.length);
  // No text of a weld row leaves the page or crosses the right margin.
  for (const page of layout.pages) for (const item of page.texts) assert.ok(item.x >= 0 && item.x + item.width <= page.width, `text "${item.text}" inside the page`);
});

test('Weld record off leaves the recorded cells empty; Type filters welds by location', async t => {
  const f = await fixture(t);
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-1');
  const location = (weld: Row) => String(f.store.get('weld_types', String(weld.typeId)).location);
  const field = welds.filter(weld => location(weld) === 'Field'), shop = welds.filter(weld => location(weld) === 'Shop');
  assert.ok(field.length && shop.length);
  const printed = async (query: string) => (await readPdf(await pdf(await f.admin.request(`/pdf/lisl-gu?isoId=iso-1&${query}`, { pilot: 'weld' })))).pages.flatMap(page => page.text);
  const onlyField = await printed('type=Field');
  for (const weld of field) assert.ok(onlyField.includes(String(weld.weldNo)));
  for (const weld of shop) assert.ok(!onlyField.includes(String(weld.weldNo)));
  assert.equal((await f.admin.request('/pdf/lisl-gu?isoId=iso-1&type=Everything', { pilot: 'weld' })).status, 422);
  const recorded = await printed('weldRecord=1'), blank = await printed('weldRecord=0');
  assert.ok(recorded.includes('RT-2026-001') && !blank.includes('RT-2026-001'));
  assert.ok(recorded.includes('01.10.2026') && !blank.includes('01.10.2026'));
  assert.ok(blank.includes(String(welds[0].weldNo)));
});

test('access: the four documents follow the LISL report rules inside the current pilot, both directions', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const weldNone = f.profile('No weld module', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const noReport = f.account('Materials only', { profileId: weldNone, weldEnabled: true, weldProfileId: weldNone, mtoEnabled: true, mtoProfileId: writer });
  const weld = f.client(), mto = f.client(), none = f.client(); await weld.login(weldOnly.email); await mto.login(mtoOnly.email); await none.login(noReport.email);
  for (const { key } of FORMS) {
    await pdf(await f.admin.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'weld' }));
    await pdf(await weld.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'weld' }));
    assert.equal((await weld.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'mto' })).status, 403, `${key}: weld-only account in MTO Pilot`);
    assert.equal((await mto.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'weld' })).status, 403, `${key}: MTO-only account in Weld Pilot`);
    assert.equal((await mto.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'mto' })).status, 403, `${key}: MTO Pilot has no LISL report`);
    assert.equal((await f.admin.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'mto' })).status, 403, `${key}: the same account in the other pilot`);
    assert.equal((await f.admin.request(`/pdf/${key}?isoId=iso-1`)).status, 403, `${key}: no pilot`);
    assert.equal((await none.request(`/pdf/${key}?isoId=iso-1`, { pilot: 'weld' })).status, 403, `${key}: no report permission`);
    assert.equal((await f.admin.request(`/pdf/${key}?isoId=missing`, { pilot: 'weld' })).status, 404, `${key}: unknown isometric`);
  }
  const skid = f.store.get('projects', 'project-skid'); f.store.update('projects', skid.id, { weldPilot: false }, skid._version, ACTOR);
  const skidIso = f.store.list('isometrics').find(row => row.projectId === 'project-skid')!;
  for (const { key } of FORMS) assert.equal((await f.admin.request(`/pdf/${key}?isoId=${skidIso.id}`, { pilot: 'weld' })).status, 404, `${key}: an isometric of a project not enabled in this pilot`);
});
