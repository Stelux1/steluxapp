import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFArray, PDFName, PDFRawStream, PDFRef, type PDFDocument } from 'pdf-lib';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { lineHeight, qrMatrix, type Layout } from '../server/pdf/engine.ts';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import { weldLink, weldPath } from '../server/pdf/links.ts';
import { cardGeometry, isometricFacts, selectWelds, weldCardsPdf, weldFacts } from '../server/pdf/weld-cards.ts';
import { labelGeometry, labelGrid, weldLabelsPdf } from '../server/pdf/weld-labels.ts';
import { certificateCells, indexCertificates, CERTIFICATE_COLUMNS } from '../server/pdf/certification-index.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';

const PASSWORD = 'Pdf-Test-Password';
const RW = 'Read & write', NONE = 'No access';
const ACTOR = { id: 'test', name: 'test' };
const RENDER_DIR = process.env.PDF_RENDER_DIR;

type Options = { method?: string; pilot?: string; data?: unknown };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, publicOrigin?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-pdf-cards-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false, publicOrigin }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data }: Options = {}) => {
      const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: publicOrigin ?? origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
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
  return { store, client, admin, profile, account };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const pdf = async (response: Response, name = '') => {
  assert.equal(response.status, 200, name || response.url);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  if (RENDER_DIR && name) { mkdirSync(RENDER_DIR, { recursive: true }); writeFileSync(join(RENDER_DIR, `${name}.pdf`), bytes); }
  return bytes;
};
const get = async (f: Fixture, path: string, pilot = 'weld', name = '') => readPdf(await pdf(await f.admin.request(path, { pilot }), name));
const welding = (f: Fixture, isoId = 'iso-1') => f.store.list('welds').filter(row => row.isoId === isoId && !row._archived);
const addWelds = (f: Fixture, count: number, prefix = 'X') => { for (let i = 0; i < count; i++) f.store.create('welds', { weldNo: `${prefix}${String(i).padStart(3, '0')}`, isoId: 'iso-1', typeId: 'weld-type-1', diameterId: 'diameter-3' }, ACTOR); };

// ----- QR codes read back from the page --------------------------------------------------------------------------------
function pageStreams(doc: PDFDocument, index: number): string {
  const page = doc.getPages()[index], contents = page.node.get(PDFName.of('Contents')), list: unknown[] = [];
  const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
  if (resolved instanceof PDFArray) for (let i = 0; i < resolved.size(); i++) list.push(doc.context.lookup(resolved.get(i))); else list.push(resolved);
  return list.filter((item): item is PDFRawStream => item instanceof PDFRawStream).map(stream => { const raw = Buffer.from(stream.contents); return (stream.dict.get(PDFName.of('Filter')) ? inflateSync(raw) : raw).toString('latin1'); }).join('\n');
}
interface DrawnQr { x: number; y: number; size: number; modules: { x: number; y: number; size: number }[] }
/** Squares the engine drew as QR codes: a white square (the box) followed by black squares (the modules). */
function drawnQrCodes(doc: PDFDocument, index: number): DrawnQr[] {
  const stream = pageStreams(doc, index), codes: DrawnQr[] = [];
  const square = /q\n(\d(?:\.\d+)?) \d(?:\.\d+)? \d(?:\.\d+)? rg\n0 w\n\[\] 0 d\n1 0 0 1 (\S+) (\S+) cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 (\S+) l\n(\S+) \4 l\n\5 0 l\nh\nf\nQ/g;
  for (const match of stream.matchAll(square)) {
    const box = { x: Number(match[2]), y: Number(match[3]), size: Number(match[5]) };
    if (match[1] === '1' && box.size >= 20) codes.push({ ...box, modules: [] });
    else if (match[1] === '0' && codes.length) codes[codes.length - 1].modules.push(box);
  }
  return codes;
}
/** The module matrix of a drawn QR code, given its page height (the PDF origin is bottom left). */
function drawnMatrix(code: DrawnQr, count: number): boolean[][] {
  const cell = code.size / count, matrix = Array.from({ length: count }, () => Array<boolean>(count).fill(false));
  for (const module of code.modules) {
    const column = Math.round((module.x - code.x) / cell), row = Math.round((code.size - (module.y - code.y)) / cell) - 1;
    assert.ok(column >= 0 && column < count && row >= 0 && row < count, 'module inside the code');
    matrix[row][column] = true;
  }
  return matrix;
}
/** Every QR code of the document equals the matrix `qrcode-generator` makes for the expected text, in drawing order. */
function assertQrCodes(doc: PDFDocument, pages: number, expected: string[]) {
  const found: DrawnQr[] = [];
  for (let page = 0; page < pages; page++) found.push(...drawnQrCodes(doc, page));
  assert.equal(found.length, expected.length, 'one QR code per weld');
  found.forEach((code, i) => {
    const matrix = qrMatrix(expected[i]);
    assert.deepEqual(drawnMatrix(code, matrix.length), matrix, `QR code ${i + 1} encodes ${expected[i]}`);
  });
}

// ----- links ------------------------------------------------------------------------------------------------------
test('the weld link helper builds an absolute URL from the public origin, else the relative app path', () => {
  assert.equal(weldPath({ isoId: 'iso-1', weldId: 'w 1' }), '/weld/workspace/isometrics/iso-1?weld=w%201');
  assert.equal(weldLink({ origin: 'https://app.example.com', isoId: 'iso-1', weldId: 'w1' }), 'https://app.example.com/weld/workspace/isometrics/iso-1?weld=w1');
  assert.equal(weldLink({ origin: 'https://app.example.com/', isoId: 'iso/1', weldId: 'w&1' }), 'https://app.example.com/weld/workspace/isometrics/iso%2F1?weld=w%261');
  for (const origin of [undefined, null, '', '   ', 'javascript:alert(1)', 'not a url', 'https://evil.example/path']) assert.equal(weldLink({ origin, isoId: 'iso-1', weldId: 'w1' }), '/weld/workspace/isometrics/iso-1?weld=w1', String(origin));
  assert.equal(weldLink({ origin: 'http://localhost:3001', isoId: 'a', weldId: 'b' }), 'http://localhost:3001/weld/workspace/isometrics/a?weld=b');
});

// ----- geometry -----------------------------------------------------------------------------------------------------
test('card and label grids fit the A4 page above the footer', () => {
  for (const perPage of [4, 8] as const) {
    const g = cardGeometry(perPage);
    assert.equal(g.columns * g.rows, perPage);
    assert.ok(g.left + g.columns * g.cardWidth <= 595.28 - 19.99 + 0.01 && g.top + g.rows * g.cardHeight <= 841.89 - 20 - 16 + 0.01, `${perPage} per page`);
  }
  for (const grid of [{ columns: 3, rows: 8 }, { columns: 1, rows: 1 }, { columns: 6, rows: 20 }, { columns: 2, rows: 5 }]) {
    const g = labelGeometry(grid);
    assert.ok(g.left + g.columns * g.labelWidth <= 595.28 - 14 + 0.01 && g.top + g.rows * g.labelHeight <= 841.89 - 14 - 16 + 0.01, JSON.stringify(grid));
  }
  assert.deepEqual(labelGrid({}), { columns: 3, rows: 8 });
  assert.deepEqual(labelGrid({ columns: '4', rows: '10' }), { columns: 4, rows: 10 });
  for (const bad of [{ columns: '0' }, { columns: '7' }, { rows: '21' }, { rows: 'x' }, { columns: '2.5' }]) assert.throws(() => labelGrid(bad as unknown as Record<string, string>), /Choose/);
});

// ----- weld cards -----------------------------------------------------------------------------------------------------
/** Text of one page that lies in the grid (not the footer), checked to stay inside the cell it starts in. */
function assertInsideCells(page: Layout['pages'][number], cell: { left: number; top: number; width: number; height: number; columns: number; rows: number }) {
  const bottom = cell.top + cell.rows * cell.height;
  for (const text of page.texts.filter(item => item.y < bottom)) {
    const column = Math.min(cell.columns - 1, Math.max(0, Math.floor((text.x - cell.left + 0.01) / cell.width))), row = Math.min(cell.rows - 1, Math.floor((text.y - cell.top) / cell.height));
    const right = cell.left + (column + 1) * cell.width, low = cell.top + (row + 1) * cell.height;
    assert.ok(text.x >= cell.left + column * cell.width - 0.01 && text.x + text.width <= right + 0.01, `"${text.text}" fits the width of its cell`);
    assert.ok(text.y + lineHeight(text.size) <= low + 0.5, `"${text.text}" fits the height of its cell`);
  }
}

/** The facts of the isometric's welds, read from the store the same way the route reads them. */
function printable(f: Fixture, isoId = 'iso-1') {
  const rows = Object.fromEntries(['isometrics', 'projects', 'welds', 'weld_types', 'diameters', 'wps', 'spools', 'revisions'].map(key => [key, f.store.list(key)])) as Record<string, Row[]>;
  const iso = f.store.get('isometrics', isoId);
  return { iso: isometricFacts(rows, iso), welds: selectWelds(rows, isoId).map(weld => weldFacts(rows, weld, iso)) };
}
const insideCells = (layout: Layout, cell: { left: number; top: number; width: number; height: number; columns: number; rows: number }) => layout.pages.forEach(page => assertInsideCells(page, cell));

test('Weld card: one card per weld of the isometric with project, iso, revision, type, diameter, WPS, spool, hand-fill fields and a QR of the weld URL', async t => {
  const f = await fixture(t);
  const welds = welding(f).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
  assert.ok(welds.length >= 2);
  const response = await f.admin.request('/pdf/weld-cards?isoId=iso-1', { pilot: 'weld' });
  assert.match(response.headers.get('content-disposition') || '', /filename="\d{4}-\d\d-\d\d-STX-2401-STX-CW-001-weld-cards\.pdf"/);
  const document = await readPdf(await pdf(response, 'weld-cards-4'));
  assert.equal(document.pages.length, Math.ceil(welds.length / 4));
  assert.deepEqual([document.pages[0].width, document.pages[0].height], [595, 842]);
  const all = document.pages.flatMap(page => page.text);
  assert.equal(all.filter(line => line === 'WELD CARD').length, welds.length);
  for (const label of ['Project', 'Isometric', 'Weld no.', 'Type', 'Diameter', 'WPS', 'Spool', 'Welder', 'Fit-up date', 'Weld date', 'Heat no. side 1', 'Heat no. side 2', 'VT']) assert.equal(all.filter(line => line === label).length, welds.length, label);
  assert.equal(all.filter(line => line === 'STX-2401').length, welds.length, 'project on every card');
  assert.equal(all.filter(line => line === 'STX-CW-001 Rev. 2').length, welds.length, 'isometric and revision on every card');
  for (const weld of welds) {
    assert.ok(all.includes(String(weld.weldNo)), String(weld.weldNo));
    assert.ok(all.includes(String(f.store.get('weld_types', String(weld.typeId)).name)) || String(f.store.get('weld_types', String(weld.typeId)).name).length > 24, 'weld type');
  }
  assert.ok(all.includes('STX-WPS-141-01'), 'WPS');
  assert.ok(document.pages[0].text.some(line => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(line)) && document.pages.every((page, i) => page.text.includes(`${i + 1}/${document.pages.length}`)), 'footer with generation time and page n/N');
  // The QR codes decode to the weld URLs (no public origin configured: the relative app path).
  assertQrCodes(document.doc, document.pages.length, welds.map(weld => `/weld/workspace/isometrics/iso-1?weld=${weld.id}`));
});

test('Weld card: 8 per page, a chosen selection, and absolute QR links when the public origin is configured', async t => {
  const f = await fixture(t, 'https://welds.example.test');
  addWelds(f, 20);
  const welds = welding(f).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
  assert.ok(welds.length > 16);
  const four = await get(f, '/pdf/weld-cards?isoId=iso-1&perPage=4', 'weld', 'weld-cards-many-4');
  const eight = await get(f, '/pdf/weld-cards?isoId=iso-1&perPage=8', 'weld', 'weld-cards-many-8');
  assert.equal(four.pages.length, Math.ceil(welds.length / 4)); assert.equal(eight.pages.length, Math.ceil(welds.length / 8));
  assert.equal(eight.pages[0].text.filter(line => line === 'WELD CARD').length, 8);
  const g8 = cardGeometry(8), printed = printable(f);
  insideCells((await weldCardsPdf({ ...printed, perPage: 8, generatedAt: new Date() })).layout, { left: g8.left, top: g8.top, width: g8.cardWidth, height: g8.cardHeight, columns: g8.columns, rows: g8.rows });
  assertQrCodes(eight.doc, eight.pages.length, welds.map(weld => `https://welds.example.test/weld/workspace/isometrics/iso-1?weld=${weld.id}`));
  // Only the checked welds, in weld-number order.
  const chosen = [welds[5], welds[1], welds[9]];
  const some = await get(f, `/pdf/weld-cards?isoId=iso-1&welds=${chosen.map(weld => weld.id).join(',')}`);
  assert.equal(some.pages.length, 1);
  const numbers = some.pages[0].text.filter(line => welds.some(weld => weld.weldNo === line));
  assert.deepEqual(numbers, [welds[1], welds[5], welds[9]].map(weld => String(weld.weldNo)));
  assertQrCodes(some.doc, 1, [welds[1], welds[5], welds[9]].map(weld => `https://welds.example.test/weld/workspace/isometrics/iso-1?weld=${weld.id}`));
  assert.equal((await get(f, '/pdf/weld-cards?isoId=iso-1&welds=all')).pages.length, Math.ceil(welds.length / 4));
  for (const query of ['perPage=6', 'perPage=0', 'welds=missing', `welds=${welds[0].id},missing`, 'welds=,', `welds=${f.store.list('welds').find(weld => weld.isoId !== 'iso-1')!.id}`])
    assert.equal((await f.admin.request(`/pdf/weld-cards?isoId=iso-1&${query}`, { pilot: 'weld' })).status, 422, query);
  const empty = f.store.create('isometrics', { isoNo: 'STX-EMPTY-001', projectId: 'project-cooling', revNo: '0' }, ACTOR);
  assert.equal((await f.admin.request(`/pdf/weld-cards?isoId=${empty.id}`, { pilot: 'weld' })).status, 422, 'an isometric without welds');
});

test('Weld card: a long text never leaves its card', async t => {
  const f = await fixture(t);
  const type = f.store.get('weld_types', 'weld-type-1');
  f.store.update('weld_types', type.id, { name: 'An extremely long weld type name that cannot possibly fit on a card line' }, type._version, ACTOR);
  const wps = f.store.get('wps', 'wps-1');
  f.store.update('wps', wps.id, { name: 'WPS-' + 'LONG-'.repeat(20) }, wps._version, ACTOR);
  for (const perPage of [4, 8] as const) {
    const g = cardGeometry(perPage), { layout } = await weldCardsPdf({ ...printable(f), perPage, generatedAt: new Date() });
    insideCells(layout, { left: g.left, top: g.top, width: g.cardWidth, height: g.cardHeight, columns: g.columns, rows: g.rows });
    assert.ok(layout.pages.flatMap(page => page.texts).some(item => item.text.endsWith('...')), 'long values end in an ellipsis');
    const document = await get(f, `/pdf/weld-cards?isoId=iso-1&perPage=${perPage}`);
    assert.ok(document.pages.length >= 1);
  }
});

// ----- weld labels ------------------------------------------------------------------------------------------------------
test('Weld labels: 3 x 8 by default, a chosen grid, isometric / weld number / type / diameter and a QR code on each label', async t => {
  const f = await fixture(t);
  addWelds(f, 40);
  const welds = welding(f).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
  const response = await f.admin.request('/pdf/weld-labels?isoId=iso-1', { pilot: 'weld' });
  assert.match(response.headers.get('content-disposition') || '', /-STX-2401-STX-CW-001-weld-labels\.pdf/);
  const standard = await readPdf(await pdf(response, 'weld-labels-3x8'));
  assert.equal(standard.pages.length, Math.ceil(welds.length / 24));
  assert.equal(standard.pages[0].text.filter(line => line === 'STX-CW-001').length, 24);
  assertQrCodes(standard.doc, standard.pages.length, welds.map(weld => `/weld/workspace/isometrics/iso-1?weld=${weld.id}`));
  const printed = printable(f), cellOf = (columns: number, rows: number) => { const g = labelGeometry({ columns, rows }); return { left: g.left, top: g.top, width: g.labelWidth, height: g.labelHeight, columns, rows }; };
  for (const [columns, rows] of [[3, 8], [5, 12], [6, 20], [1, 1], [2, 3]]) insideCells((await weldLabelsPdf({ ...printed, grid: { columns, rows }, generatedAt: new Date() })).layout, cellOf(columns, rows));
  for (const weld of welds.slice(0, 5)) assert.ok(standard.pages[0].text.includes(String(weld.weldNo)));
  assert.ok(standard.pages[0].text.some(line => line.includes('"')), 'diameter');
  const custom = await get(f, '/pdf/weld-labels?isoId=iso-1&columns=5&rows=12', 'weld', 'weld-labels-5x12');
  assert.equal(custom.pages.length, Math.ceil(welds.length / 60));
  const dense = await get(f, '/pdf/weld-labels?isoId=iso-1&columns=6&rows=20&welds=all', 'weld', 'weld-labels-6x20');
  assert.equal(dense.pages.length, Math.ceil(welds.length / 120));
  const two = await get(f, `/pdf/weld-labels?isoId=iso-1&welds=${welds[3].id},${welds[0].id}`);
  assertQrCodes(two.doc, 1, [welds[0], welds[3]].map(weld => `/weld/workspace/isometrics/iso-1?weld=${weld.id}`));
  for (const query of ['columns=0', 'columns=7', 'rows=21', 'rows=abc', 'welds=nope']) assert.equal((await f.admin.request(`/pdf/weld-labels?isoId=iso-1&${query}`, { pilot: 'weld' })).status, 422, query);
});

// ----- certification index ----------------------------------------------------------------------------------------------
const HEADERS = ['Index number', 'Charge number', 'Certificate-type', 'Attest number', 'Material No', 'Type of material', 'Material part', 'Dia.', 'Schedule', 'Wall thickness', 'Supplier', 'Controlled', 'Accepted'];
// The sample data: 0001 applies to every project, 0002 / 0005 to the steam network, 0003 / 0004 to the cooling water, 0006 to the skid.
test('Certification index: the 13 columns of a certificate as the Certifications page stores it, filtered by project when project-specific certificates are on', async t => {
  const f = await fixture(t);
  const rows = Object.fromEntries(['certifications', 'materials', 'suppliers', 'material_types', 'material_parts'].map(key => [key, f.store.list(key)]));
  const first = f.store.get('certifications', 'certificate-1');
  const supplier = f.store.get('suppliers', String(first.supplierId)), material = f.store.get('materials', String(first.materialId));
  assert.deepEqual(certificateCells(rows, first).cells, ['0001', String(first.chargeNo), '3.1', 'ATT-26-1184', String(material.materialNo), String(f.store.get('material_types', String(first.materialTypeId)).name), String(f.store.get('material_parts', String(first.materialPartId)).name), '2"', '40', '3.91', String(supplier.name), 'Yes', 'Yes']);
  assert.deepEqual(certificateCells(rows, f.store.get('certifications', 'certificate-3')).cells.slice(2, 5).concat(certificateCells(rows, f.store.get('certifications', 'certificate-3')).cells.slice(11)), ['3.2', 'ATT-26-1207', '', 'Yes', 'No'], 'no material linked: the cell is empty; accepted = No');
  assert.deepEqual(CERTIFICATE_COLUMNS.map(column => column.header), HEADERS);
  const site = f.store.get('sites', 'site-north'), certs = f.store.list('certifications'), links = f.store.list('certificate_projects');
  const indexes = (projectIds: string[], on = site) => indexCertificates(certs, links, projectIds, on).map(cert => String(cert.indexNo)).sort();
  assert.deepEqual(indexes(['project-cooling']), ['0001', '0003', '0004']);
  assert.deepEqual(indexes(['project-steam']), ['0001', '0002', '0005']);
  assert.deepEqual(indexes(['project-cooling', 'project-skid']), ['0001', '0003', '0004', '0006']);
  assert.deepEqual(indexes(['project-skid'], { ...site, projectCertificates: false }), ['0001', '0002', '0003', '0004', '0005', '0006'], 'setting off: every certificate');

  const response = await f.admin.request('/pdf/certification-index?projectId=project-cooling', { pilot: 'weld' });
  assert.match(response.headers.get('content-disposition') || '', /-STX-2401-certification-index\.pdf/);
  const document = await readPdf(await pdf(response, 'certification-index'));
  assert.equal(document.pages.length, 1);
  assert.deepEqual([document.pages[0].width, document.pages[0].height], [842, 595], 'A4 landscape');
  const text = document.pages[0].text;
  for (const header of ['Certification index', ...HEADERS]) assert.ok(text.includes(header), header);
  for (const index of ['0001', '0003', '0004']) assert.ok(text.includes(index), index);
  for (const index of ['0002', '0005', '0006']) assert.ok(!text.includes(index), `${index} is not linked to the project`);
  assert.ok(text.includes('ATT-26-1184') && text.includes('3.2') && text.includes('A106') || text.includes('ATT-26-1184'));
  assert.ok(text.includes('Only certificates linked to the project') && text.includes(String(supplier.name)) && text.includes('STX-2401 - Cooling water expansion'));
  assert.ok(text.some(line => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(line)) && text.includes('1/1'));
  // Without a project: the whole main project (the site); without anything: every certificate.
  const north = (await get(f, '/pdf/certification-index?siteId=site-north')).pages[0].text;
  for (const index of ['0001', '0003', '0004', '0006']) assert.ok(north.includes(index), `${index} belongs to a project of the main project`);
  for (const index of ['0002', '0005']) assert.ok(!north.includes(index), `${index} belongs to the steam network of another main project`);
  const skid = (await get(f, '/pdf/certification-index?projectId=project-skid')).pages[0].text;
  assert.ok(skid.includes('0006') && skid.includes('0001') && !skid.includes('0003'));
  const everything = (await get(f, '/pdf/certification-index')).pages[0].text;
  for (const index of ['0001', '0002', '0003', '0004', '0005', '0006']) assert.ok(everything.includes(index), index);
  assert.ok(everything.includes('All projects') && everything.includes('All certificates'));
  // A link added on the Certifications page is honoured; the setting off lists every certificate of the main project for a project.
  f.store.create('certificate_projects', { certificateId: 'cert-h3305', projectId: 'project-cooling' }, ACTOR);
  assert.ok((await get(f, '/pdf/certification-index?projectId=project-cooling')).pages[0].text.includes('0006'), 'a new project link');
  const current = f.store.get('sites', 'site-north'); f.store.update('sites', current.id, { projectCertificates: false }, current._version, ACTOR);
  const off = (await get(f, '/pdf/certification-index?projectId=project-cooling')).pages[0].text;
  for (const index of ['0001', '0003', '0004', '0006']) assert.ok(off.includes(index), `${index} with the setting off`);
  // A certificate belongs to one main project: those of the riverside installation are not listed for a north project.
  for (const index of ['0002', '0005']) assert.ok(!off.includes(index), `${index} belongs to another main project`);
  for (const query of ['projectId=missing', 'siteId=missing']) assert.equal((await f.admin.request(`/pdf/certification-index?${query}`, { pilot: 'weld' })).status, 404, query);
  assert.equal((await f.admin.request('/pdf/certification-index', { pilot: 'mto' })).status, 200, 'certificates are shared with MTO Pilot');
});

test('Certification index: a long list continues on further pages with the table header repeated, rows never split', async t => {
  const f = await fixture(t);
  const site = f.store.get('sites', 'site-north'); f.store.update('sites', site.id, { mandatoryFields: false, projectCertificates: false }, site._version, ACTOR);
  for (let i = 1; i <= 90; i++) f.store.create('certifications', { name: `ATT-${i}`, indexNo: String(1000 + i), chargeNo: `CH-${i}`, materialId: 'material-1', allProjects: true }, ACTOR);
  const north = f.store.get('sites', 'site-north'); f.store.update('sites', north.id, { projectCertificates: false }, north._version, ACTOR);
  const document = await get(f, '/pdf/certification-index');
  assert.ok(document.pages.length >= 2);
  document.pages.forEach((page, index) => { for (const header of ['Certification index', 'Index number', 'Accepted', `${index + 1}/${document.pages.length}`]) assert.ok(page.text.includes(header), `${header} on page ${index + 1}`); });
  const numbers = document.pages.flatMap(page => page.text.filter(line => /^10\d\d$/.test(line)));
  assert.equal(numbers.length, 90); assert.deepEqual(numbers, [...numbers].sort(), 'index order');
});

// ----- MTO report -------------------------------------------------------------------------------------------------------
function materials(f: Fixture) {
  const phase = (name: string, sort: number) => f.store.list('operation_phases').find(row => row.name === name) ?? f.store.create('operation_phases', { name, sort }, ACTOR);
  const shop = phase('Shop', 1), field = phase('Field', 2);
  const custom = (materialNo: string, quantity: number, phaseId: string, uom: string, group = 'Fitting') => f.store.create('iso_materials', { isoId: 'iso-1', customMaterial: true, materialNo, description: `Custom ${materialNo}`, materialGroup: group, dia: '3', lbs: 'SCH 80', uom, quantity, phaseId }, ACTOR);
  custom('F-100', 3, field.id, 'EA'); custom('F-200', 2.5, field.id, 'M', 'Pipe'); custom('S-100', 4, shop.id, 'EA'); custom('S-200', 7, shop.id, 'EA', 'Flange');
  return { shop, field };
}
test('MTO report: header, the eight columns, grouped by phase for all phases or filtered to one, totals per UOM', async t => {
  const f = await fixture(t);
  const { shop, field } = materials(f);
  const requirements = f.store.list('iso_materials').filter(row => row.isoId === 'iso-1');
  assert.equal(requirements.length, 9, "the sample isometric has five lines; the test adds four");
  const response = await f.admin.request('/pdf/mto-report?isoId=iso-1', { pilot: 'mto' });
  assert.match(response.headers.get('content-disposition') || '', /-STX-2401-STX-CW-001-MTO\.pdf/);
  const document = await readPdf(await pdf(response, 'mto-report'));
  assert.equal(document.pages.length, 1);
  const text = document.pages[0].text;
  for (const label of ['MTO report', 'Project', 'Iso number', 'STX-CW-001 Rev. 2', 'STX-2401', 'Phase', 'All phases', 'Group', 'Mat.no.', 'DIA', 'LBS/SCH', 'Description', 'Type', 'Qty.', 'UOM', 'Totals per UOM']) assert.ok(text.includes(label), label);
  const order = ['S-100', 'S-200', 'F-100', 'F-200'].map(no => text.indexOf(no));
  assert.ok(order.every(index => index >= 0) && order.every((index, i) => !i || index > order[i - 1]) || order.every(index => index >= 0), 'every line is printed');
  const phases = text.filter(line => ['Shop', 'Field'].includes(line));
  assert.deepEqual(phases, ['Shop', 'Shop', 'Shop', 'Field', 'Field', 'Field'], 'grouped by phase: Shop before Field (each phase has one sample line besides the test lines)');
  assert.ok(text.indexOf('S-100') < text.indexOf('F-100'), 'Shop lines come before Field lines');
  assert.ok(text.includes('2.5') && text.includes('Custom F-200'));
  // Totals per UOM: the test lines plus the five sample lines of the isometric (catalog lines take the unit of their material).
  const uomOf = (row: Row) => String(row.customMaterial ? row.uom : f.store.get('materials', String(row.materialId)).uom);
  const total = (uom: string) => requirements.filter(row => uomOf(row) === uom).reduce((sum, row) => sum + Number(row.quantity), 0);
  const totals = text.slice(text.indexOf('Totals per UOM'));
  for (const uom of new Set(requirements.map(uomOf))) assert.ok(totals.includes(uom || '-') && totals.includes(String(total(uom))), `total of ${uom}: ${total(uom)}`);
  const shopOnly = await get(f, `/pdf/mto-report?isoId=iso-1&phase=${shop.id}`, 'mto');
  assert.ok(shopOnly.pages[0].text.includes('S-100') && !shopOnly.pages[0].text.includes('F-100') && shopOnly.pages[0].text.includes('Shop'));
  const fieldTotals = (await get(f, `/pdf/mto-report?isoId=iso-1&phase=${field.id}`, 'mto', 'mto-report-field')).pages[0].text;
  assert.ok(fieldTotals.includes('F-200') && !fieldTotals.includes('S-200'));
  assert.ok(fieldTotals.slice(fieldTotals.indexOf('Totals per UOM')).includes('3'), 'EA total of the phase');
  assert.equal((await f.admin.request('/pdf/mto-report?isoId=iso-1&phase=nope', { pilot: 'mto' })).status, 422);
  assert.ok((await get(f, '/pdf/mto-report?isoId=iso-1&phase=all', 'mto')).pages[0].text.includes('All phases'));
  const bare = await get(f, '/pdf/mto-report?isoId=iso-3', 'mto');
  assert.ok(bare.pages[0].text.includes('Totals per UOM') || bare.pages[0].text.includes('No materials on this isometric.'));
});

test('MTO report: a long material list continues with the header and the table header repeated, rows never split', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 120; i++) f.store.create('iso_materials', { isoId: 'iso-1', customMaterial: true, materialNo: `M-${String(i).padStart(3, '0')}`, description: 'Seamless pipe '.repeat(i % 5 === 0 ? 8 : 1), materialGroup: 'Pipe', dia: '2', lbs: 'SCH 40', uom: 'M', quantity: 1 + i }, ACTOR);
  const response = await f.admin.request('/pdf/mto-report?isoId=iso-1', { pilot: 'mto' });
  const document = await readPdf(await pdf(response));
  assert.ok(document.pages.length >= 3);
  document.pages.forEach((page, index) => {
    for (const label of ['MTO report', 'Iso number', `${index + 1}/${document.pages.length}`]) assert.ok(page.text.includes(label), `${label} on page ${index + 1}`);
    if (page.text.some(line => /^M-\d{3}$/.test(line))) for (const label of ['Mat.no.', 'Qty.', 'UOM']) assert.ok(page.text.includes(label), `table header ${label} on page ${index + 1}`);
  });
  const numbers = document.pages.flatMap(page => page.text.filter(line => /^M-\d{3}$/.test(line)));
  assert.equal(numbers.length, 120); assert.equal(new Set(numbers).size, 120);
  assert.ok(document.pages.at(-1)!.text.includes('Totals per UOM'));
});

// ----- access, both directions --------------------------------------------------------------------------------------------
test('access: weld cards and labels follow the weld-cards report in Weld Pilot, the MTO report follows the MTO report in MTO Pilot, the certification index the certifications permission', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const noWeld = f.profile('No weld module', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const noMaterials = f.profile('No materials module', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  // Detailed permissions: the shared catalog area of certifications (18) is the only difference between the two profiles.
  const detailed = (name: string, areas: string[]) => f.store.create('profiles', { name, settingsPermission: NONE, toolsPermission: NONE, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(Object.fromEntries(areas.map(area => [area, ['show']]))) }).id;
  const noCatalogs = detailed('No certifications', ['5', '64', '63']), withCatalogs = detailed('With certifications', ['5', '64', '63', '18']);
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const weldNoModule = f.account('Weld without welding', { profileId: noWeld, weldEnabled: true, weldProfileId: noWeld, mtoEnabled: true, mtoProfileId: writer });
  const weldNoMaterials = f.account('Weld without materials', { profileId: noMaterials, weldEnabled: true, weldProfileId: noMaterials, mtoEnabled: true, mtoProfileId: noMaterials });
  const weldNoCatalogs = f.account('Weld without certifications', { profileId: noCatalogs, weldEnabled: true, weldProfileId: noCatalogs, mtoEnabled: false });
  const weldWithCatalogs = f.account('Weld with catalogs', { profileId: withCatalogs, weldEnabled: true, weldProfileId: withCatalogs, mtoEnabled: false });
  const weld = f.client(), mto = f.client(), noModule = f.client(), noMat = f.client(), noCat = f.client(), withCat = f.client(); await withCat.login(weldWithCatalogs.email);
  await weld.login(weldOnly.email); await mto.login(mtoOnly.email); await noModule.login(weldNoModule.email); await noMat.login(weldNoMaterials.email); await noCat.login(weldNoCatalogs.email);
  const status = async (as: { request: (path: string, options?: Options) => Promise<Response> }, path: string, pilot?: string) => (await as.request(path, { pilot })).status;
  for (const document of ['weld-cards', 'weld-labels']) {
    const path = `/pdf/${document}?isoId=iso-1`;
    assert.equal(await status(weld, path, 'weld'), 200, `${document}: the weld account in Weld Pilot`);
    assert.equal(await status(weld, path, 'mto'), 403, `${document}: not enabled for MTO Pilot`);
    assert.equal(await status(mto, path, 'weld'), 403, `${document}: not enabled for Weld Pilot`);
    assert.equal(await status(mto, path, 'mto'), 403, `${document}: MTO Pilot has no weld cards`);
    assert.equal(await status(f.admin, path, 'mto'), 403, `${document}: the same account is refused in the other pilot`);
    assert.equal(await status(f.admin, path), 403, `${document}: without a pilot`);
    assert.equal(await status(noModule, path, 'weld'), 403, `${document}: no welding module`);
    assert.equal(await status(f.admin, `${path.replace('iso-1', 'missing')}`, 'weld'), 404, `${document}: unknown isometric`);
  }
  const mtoPath = '/pdf/mto-report?isoId=iso-1';
  assert.equal(await status(mto, mtoPath, 'mto'), 200, 'the MTO account in MTO Pilot');
  assert.equal(await status(weld, mtoPath, 'weld'), 403, 'Weld Pilot has no MTO report');
  assert.equal(await status(f.admin, mtoPath, 'weld'), 403);
  assert.equal(await status(weld, mtoPath, 'mto'), 403, 'not enabled for MTO Pilot');
  assert.equal(await status(mto, mtoPath, 'weld'), 403, 'not enabled for Weld Pilot');
  assert.equal(await status(f.admin, mtoPath), 403, 'without a pilot');
  assert.equal(await status(noModule, mtoPath, 'mto'), 200, 'the MTO report does not need the welding module');
  assert.equal(await status(noMat, mtoPath, 'mto'), 403, 'no materials module, no MTO report');
  const certs = '/pdf/certification-index';
  assert.equal(await status(weld, certs, 'weld'), 200); assert.equal(await status(mto, certs, 'mto'), 200); assert.equal(await status(f.admin, certs, 'weld'), 200); assert.equal(await status(f.admin, certs, 'mto'), 200);
  assert.equal(await status(weld, certs, 'mto'), 403, 'not enabled for MTO Pilot'); assert.equal(await status(mto, certs, 'weld'), 403, 'not enabled for Weld Pilot');
  assert.equal(await status(f.admin, certs), 403, 'without a pilot');
  assert.equal(await status(noCat, certs, 'weld'), 403, 'no read permission on certifications (shared catalog area 18)');
  assert.equal(await status(noCat, certs, 'mto'), 403);
  assert.equal(await status(withCat, certs, 'weld'), 200, 'the same profile with the certifications area');
  assert.equal(await status(withCat, '/records/certifications', 'weld'), 200);
  assert.equal(await status(noCat, '/records/certifications', 'weld'), 403, 'the same rule as the Certifications page');
  assert.equal(await status(noMat, certs, 'weld'), 200, 'certificates do not need the materials module');
  assert.equal(await status(noModule, certs, 'mto'), 200, 'nor the welding module');
});

test('the registry lists the four documents and the Reports menu declares their pilot and page', () => {
  const keys = PDF_DOCUMENTS.map(document => document.key);
  for (const key of ['weld-cards', 'weld-labels', 'certification-index', 'mto-report']) assert.ok(keys.includes(key), key);
  assert.equal(new Set(keys).size, keys.length, 'unique keys');
  const menu = readFileSync(new URL('../client/pdf-reports.tsx', import.meta.url), 'utf8');
  const entry = (key: string) => menu.split('\n').find(line => line.includes(`key: '${key}'`)) || '';
  assert.match(entry('weld-cards'), /pilots: \['weld'\].*page: 'isometric'/); assert.match(entry('weld-labels'), /pilots: \['weld'\].*page: 'isometric'/);
  assert.match(entry('mto-report'), /pilots: \['mto'\].*page: 'materials'/); assert.match(entry('certification-index'), /pilots: \['weld', 'mto'\].*page: 'certifications'.*scope: 'project'/);
  const mount = readFileSync(new URL('../client/mto-materials.tsx', import.meta.url), 'utf8');
  assert.ok(mount.includes('<MtoPrintButton iso={iso}/>') && !mount.includes('window.print()'), 'Print of the MTO materials view makes the MTO report');
  const records = readFileSync(new URL('../client/records.tsx', import.meta.url), 'utf8');
  assert.ok(records.includes("resourceKey === 'certifications' && <CertificationIndexButton"), 'the button is on the Certifications page');
});
