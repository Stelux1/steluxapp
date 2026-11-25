import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import { bookPlans, NOT_IN_BOOK, partOfDocument } from '../server/pdf/iso-book-parts.ts';
import { HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { bookRequestError, FIXED_PART_ORDER, ISO_BOOK_LIMITS, REMOVED_BOOK_PARTS, type BookPartsResponse } from '../shared/iso-book.ts';
import { BOOK_WELD_LABEL_GRID, bookWeldLabelsPdf, weldLabelContext } from '../server/pdf/iso-book-weld-labels.ts';
import { weldFacts } from '../server/pdf/weld-cards.ts';
import { qualificationStatusAt, weldersSummaryModel } from '../shared/welders-summary.ts';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';

const PASSWORD = 'Book-Test-Password';
const RW = 'Read & write', NONE = 'No access';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SYSTEM = { id: 'test', name: 'test' };

type Options = { method?: string; pilot?: string; data?: unknown };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-book-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot, data }: Options = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
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
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Book admin', email: 'book-admin@example.test', password: PASSWORD } })).status, 201);
  const upload = (as: ReturnType<typeof client>, entityType: string, entityId: string, content: Uint8Array | string, name: string, documentType?: string, pilot = 'weld') => {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); if (documentType) body.set('documentType', documentType); body.set('file', new Blob([content as BlobPart], { type: 'application/octet-stream' }), name);
    return as.request('/files', { method: 'POST', pilot, data: body });
  };
  /** A PDF of `pages` pages, each carrying `marker-<n>` as text. */
  const document = async (marker: string, pages = 1) => {
    const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= pages; i++) doc.addPage([400, 300]).drawText(`${marker}-${i}`, { x: 20, y: 150, size: 12, font });
    return doc.save();
  };
  const book = (as: ReturnType<typeof client>, body: unknown, pilot = 'weld') => as.request('/iso-book', { method: 'POST', pilot, data: body });
  const parts = async (as: ReturnType<typeof client>, ids: string, pilot = 'weld') => { const response = await as.request(`/iso-book/parts?isoIds=${ids}`, { pilot }); assert.equal(response.status, 200); return await response.json() as BookPartsResponse; };
  return { store, client, admin, profile, account, upload, document, book, parts };
}
const pdfOf = async (response: Response) => {
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-'); return bytes;
};
const texts = async (response: Response) => { const document = await readPdf(await pdfOf(response)); return { document, pages: document.pages, all: document.pages.flatMap(page => page.text) }; };
const ALL_GENERATED = ['lisl:lisl-gu', 'lisl-blank', 'weld-labels', 'welders-summary'];
const pageOf = (pages: { text: string[] }[], marker: string) => pages.findIndex(page => page.text.includes(marker));

test('the dialog lists every part in the reference order; parts without a generator or files are disabled with a reason, nothing is faked', async t => {
  const f = await fixture(t);
  const listing = await f.parts(f.admin, 'iso-1');
  assert.deepEqual(listing.isometrics, [{ id: 'iso-1', isoNo: 'STX-CW-001' }]);
  const labels = listing.parts.map(part => part.label);
  const order = ['ITP documents', 'Isometric drawing', 'ITP', 'Isometric', 'NDT report', 'Material certificate', 'Signed release', 'NDT Pre', 'NDT', 'PWHT', 'LISL Report [GU]', 'Blank LISL', 'Weld Label', 'Pick lists', 'Punch list', 'Punch list (blank)', 'Flange report', 'Certificate index', 'PQR', 'WPS', 'NDT process documents', "Welder's summary", 'Visual reports', 'Prefab release', 'Field release', 'Material certificates', 'MTO report per operation phase'];
  assert.deepEqual(labels.filter(label => order.includes(label)), order.filter(label => label !== 'Blank LISL' || labels.includes('Blank LISL')).filter(label => labels.includes(label)));
  assert.ok(!labels.includes('Hydrotest report'), 'attachment names not flagged "ISO Book" get no checkbox');
  const part = (key: string) => listing.parts.find(item => item.key === key)!;
  for (const key of ALL_GENERATED) assert.equal(part(key).available, true, key);
  // Documents of other tasks fill their parts when the isometric has something to print: the NDT request of iso-1, its punch
  // items and flanges, the project's certificate index.
  for (const key of ['ndt', 'punch-list', 'punch-list-blank', 'flange-report', 'certificate-index']) assert.equal(part(key).available, true, key);
  // Client change list 22.11.2026 (image 8): the removed parts are not offered at all.
  for (const key of REMOVED_BOOK_PARTS) assert.ok(!listing.parts.some(item => item.key === key), `${key} is not offered`);
  for (const label of ['Task sheet', 'ITP 2 document', 'LISL Report', 'LISL Report (A3)', 'LISL Report [MV]', 'LISL Report [WQ]', 'LISL Report [GU Rev 2]', 'LISL Report [ISS]', 'LISL Report [GU Rev 3]', 'LISL Report [WQ ver 2]']) assert.ok(!labels.includes(label), label);
  assert.deepEqual(listing.parts.filter(item => item.key.startsWith('lisl')).map(item => item.key), ['lisl:lisl-gu', 'lisl-blank'], 'LISL [GU] and Blank LISL stay');
  for (const key of ['itp', 'isometric', 'wps', 'pqr', 'material-certificates', 'pick-lists', 'prefab-release', 'field-release']) {
    assert.equal(part(key).available, false, key); assert.ok(part(key).reason && part(key).reason!.length > 10, `${key} says why`);
  }
  // The MTO report is an MTO Pilot document the administrator may read in that pilot: offered in Weld Pilot too (scn-SB-N8).
  assert.equal(part('mto-report').available, true, 'mto-report');
  assert.doesNotMatch(part('pick-lists').reason!, /permission profile/, 'pick lists are not refused to an account that may read them in MTO Pilot');
  assert.match(part('prefab-release').reason!, /No Prefab release/);
  assert.match(part('itp').reason!, /No ITP document/);
  const custom = listing.parts.filter(item => item.source === 'custom');
  assert.deepEqual(custom.map(item => [item.label, item.position]), [['Isometric drawing', 'Before Isometric'], ['ITP', 'Before Isometric'], ['NDT report', 'After Isometric'], ['Material certificate', 'After Isometric'], ['Signed release', 'After Isometric']]);
  const keys = listing.parts.map(item => item.key);
  assert.ok(keys.indexOf(custom[1].key) < keys.indexOf('isometric') && keys.indexOf('isometric') < keys.indexOf(custom[2].key), 'custom names sit before / after the isometric');
});

test('registry-driven: documents added to PDF_DOCUMENTS by other tasks are offered under their part by key or by bookPart', () => {
  const build = async () => ({ bytes: new Uint8Array(), fileName: 'x' });
  const registry = [PDF_DOCUMENTS[0], PDF_DOCUMENTS[1],
    { key: 'pick-list', title: 'Pick list', report: 'picklists', build }, { key: 'punch-list-blank', title: 'Punch list - blank', report: 'punchlists', build },
    { key: 'lisl-gu', title: 'LISL [GU]', report: 'lisl', build }, { key: 'anything', title: 'Prefab', report: 'releases', bookPart: 'prefab-release', build }];
  const plans = bookPlans(registry, []);
  const plan = (key: string) => plans.find(item => item.key === key)!;
  assert.equal(plan('pick-lists').generators.length, 1); assert.equal(plan('punch-list-blank').generators.length, 1); assert.equal(plan('punch-list').generators.length, 0);
  assert.equal(plan('prefab-release').generators[0].key, 'anything');
  assert.deepEqual(plans.filter(item => item.key.startsWith('lisl:')).map(item => item.label), ['LISL [GU]'], 'LISL and LISL A3 are no part of the book any more');
  assert.equal(partOfDocument({ key: 'lisl-blank', title: '', report: 'lisl', build }), 'lisl-blank');
});

test('every document of PDF_DOCUMENTS fills its part of the book in the reference order, or is named as no part of it', () => {
  const plans = bookPlans(PDF_DOCUMENTS, []);
  const placed = new Map(plans.flatMap(plan => plan.generators.map(definition => [definition.key, plan.key] as const)));
  for (const definition of PDF_DOCUMENTS) assert.ok(placed.has(definition.key) !== Object.hasOwn(NOT_IN_BOOK, definition.key), `${definition.key}: a part, or listed in NOT_IN_BOOK`);
  assert.deepEqual(Object.keys(NOT_IN_BOOK).filter(key => !PDF_DOCUMENTS.some(definition => definition.key === key)), [], 'NOT_IN_BOOK names registry documents only');
  assert.deepEqual(Object.fromEntries(placed), {
    'ndt-pre-request': 'ndt-pre', 'ndt-request': 'ndt', 'pwht-request': 'pwht',
    'lisl-gu': 'lisl:lisl-gu', 'lisl-blank': 'lisl-blank', 'iso-book-weld-labels': 'weld-labels',
    'pick-list': 'pick-lists', 'punch-list': 'punch-list', 'punch-list-blank': 'punch-list-blank', 'flange-report': 'flange-report', 'certification-index': 'certificate-index',
    'welders-summary': 'welders-summary', 'visual-report': 'visual-reports', 'prefab-release': 'prefab-release', 'field-release': 'field-release', 'mto-report': 'mto-report',
  });
  // The parts keep the reference's order (FIXED_PART_ORDER), the LISL variants in registry order where LISL stands.
  const order = plans.map(plan => plan.key), position = (key: string) => order.indexOf(key);
  const fixed = FIXED_PART_ORDER.filter(key => key !== 'lisl');
  for (let index = 1; index < fixed.length; index++) assert.ok(position(fixed[index - 1]) < position(fixed[index]), `${fixed[index - 1]} before ${fixed[index]}`);
  const variants = order.filter(key => key.startsWith('lisl:'));
  assert.deepEqual(variants, PDF_DOCUMENTS.filter(definition => placed.get(definition.key)?.startsWith('lisl:')).map(definition => `lisl:${definition.key}`));
  assert.ok(position('pwht') < position(variants[0]) && position(variants.at(-1)!) < position('lisl-blank'));
  assert.equal(position('weld-labels'), position('lisl-blank') + 1, 'Weld Label follows the LISL parts');
  for (const key of REMOVED_BOOK_PARTS) assert.equal(position(key), -1, key);
  for (const key of ['lisl', 'lisl-a3', 'lisl-mv', 'lisl-wq', 'lisl-gu-rev2', 'lisl-iss', 'lisl-gu-rev3', 'lisl-wq2']) assert.ok(PDF_DOCUMENTS.some(definition => definition.key === key) && NOT_IN_BOOK[key], `${key} stays a report, outside the book`);
});

test('Weld Label: one label per weld with weld number, ISO number, spool, main project and a QR code of the weld link', async t => {
  const f = await fixture(t);
  const rows = Object.fromEntries(['isometrics', 'projects', 'sites', 'welds', 'spools', 'weld_types', 'diameters', 'wps'].map(key => [key, f.store.list(key)]));
  const iso = f.store.get('isometrics', 'iso-1'), welds = f.store.list('welds').filter(weld => weld.isoId === 'iso-1');
  const context = weldLabelContext(rows, iso);
  const site = f.store.get('sites', String(f.store.get('projects', String(iso.projectId)).siteId));
  assert.deepEqual([context.isoNo, context.mainProject], ['STX-CW-001', String(site.name)]);
  const facts = welds.map(weld => weldFacts(rows, weld, iso, 'https://app.example.test'));
  assert.ok(facts.every(fact => fact.url.startsWith('https://app.example.test/') && fact.url.includes('iso-1') && fact.url.includes(fact.id)), 'the QR opens the isometric page of that weld');
  const { bytes, layout } = await bookWeldLabelsPdf({ welds: facts, context, generatedAt: new Date('2026-11-25T10:00:00Z') });
  const document = await readPdf(bytes), text = document.pages.flatMap(page => page.text);
  assert.equal(document.pages.length, Math.ceil(welds.length / (BOOK_WELD_LABEL_GRID.columns * BOOK_WELD_LABEL_GRID.rows)));
  for (const fact of facts) assert.ok(text.includes(fact.weldNo), fact.weldNo);
  for (const label of ['ISO', 'Spool', 'Main project', 'STX-CW-001', String(site.name)]) assert.ok(text.includes(label), label);
  const spooled = facts.find(fact => fact.spool); if (spooled) assert.ok(text.includes(spooled.spool), 'the spool of the weld');
  assert.equal(layout.pages.reduce((sum, page) => sum + page.images, 0), welds.length, 'one QR code per weld');
  // In the book: offered for an isometric with welds, delivered as its own part, refused with its reason for one without welds.
  const delivered = await texts(await f.book(f.admin, { isoIds: ['iso-1'], parts: ['weld-labels'] }));
  assert.ok(delivered.all.includes('Main project') && facts.every(fact => delivered.all.includes(fact.weldNo)));
  const empty = f.store.create('isometrics', { isoNo: 'STX-EMPTY-01', projectId: iso.projectId }, SYSTEM);
  const listing = await f.parts(f.admin, empty.id);
  const part = listing.parts.find(item => item.key === 'weld-labels')!;
  assert.deepEqual([part.label, part.available, part.reason], ['Weld Label', false, 'No weld is recorded for this isometric.']);
  assert.equal((await f.book(f.admin, { isoIds: [empty.id], parts: ['weld-labels'] })).status, 422);
});

test('the merged book: no cover (Task sheet left the book); parts in order; footer numbering; unreadable files are listed', async t => {
  const f = await fixture(t);
  const iso = f.store.get('isometrics', 'iso-1');
  const ok = async (response: Response) => assert.equal(response.status, 201, await response.clone().text());
  // Uploaded parts: the drawing (current revision), an older revision, ITP, a custom attachment, NDT result image, damaged / encrypted / unsupported files.
  await ok(await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('DRAWING', 2), 'drawing.pdf', `ISO revision ${iso.revNo}`));
  await ok(await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('OLDREV', 1), 'old.pdf', 'ISO revision 1'));
  await ok(await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('ITPDOC', 1), 'itp.pdf', `ITP revision ${iso.itpRevNo}`));
  await ok(await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('SIGNED', 1), 'signed.pdf', 'Signed release'));
  await ok(await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('FRONT', 1), 'front.pdf', 'ITP'));
  const result = (reportNo: string) => f.store.list('inspection_results').find(row => row.reportNo === reportNo)!;
  await ok(await f.upload(f.admin, 'inspection_results', result('RT-2026-001').id, PNG, 'rt-report.png'));
  await ok(await f.upload(f.admin, 'inspection_results', result('RT-2026-010').id, 'not really a pdf', 'rt-broken.pdf'));
  await ok(await f.upload(f.admin, 'wps', 'wps-1', await f.document('WPSDOC', 1), 'wps-1.pdf'));
  await ok(await f.upload(f.admin, 'wps', 'wps-1', Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n4 0 obj<</Filter/Standard/V 1/R 2/O(x)/U(y)/P -4>>endobj\ntrailer<</Root 1 0 R/Size 5/Encrypt 4 0 R>>\n%%EOF'), 'locked.pdf'));
  await ok(await f.upload(f.admin, 'certifications', 'certificate-1', await f.document('CERT1', 1), 'cert-1.pdf'));
  // A certificate takes a PDF only now; a Word file stored on one earlier is simulated by renaming a stored attachment.
  await ok(await f.upload(f.admin, 'certifications', 'cert-h1043', Buffer.from('PK\x03\x04 a word document'), 'cert-h1043.pdf'));
  const older = f.store.list('attachments').find(row => row.name === 'cert-h1043.pdf')!; f.store.update('attachments', older.id, { name: 'cert-h1043.docx' }, older._version, SYSTEM);
  await ok(await f.upload(f.admin, 'certifications', 'certificate-3', await f.document('CERT3', 1), 'unused.pdf'));
  const parts = ['itp', 'isometric', 'ndt', 'wps', 'material-certificates', 'lisl:lisl-gu', 'lisl-blank', 'weld-labels', 'welders-summary', ...(await f.parts(f.admin, 'iso-1')).parts.filter(part => part.source === 'custom' && part.available).map(part => part.key)];
  const response = await f.book(f.admin, { isoIds: ['iso-1'], parts });
  assert.match(response.headers.get('content-disposition') || '', /^attachment; filename="\d{4}-\d\d-\d\d-STX-2401-ISO-Book-STX-CW-001\.pdf"$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const bytes = await pdfOf(response.clone());
  // Maintainers: ISO_BOOK_DUMP=<file> writes this book to look at it.
  if (process.env.ISO_BOOK_DUMP) writeFileSync(process.env.ISO_BOOK_DUMP, bytes);
  const { pages, all } = await texts(response);
  assert.equal(String(pages.length), response.headers.get('x-iso-book-pages'));
  // No cover: the book starts with its first part (the ITP document of the current revision).
  assert.ok(!pages[0].text.includes('Task sheet') && !pages[0].text.includes('Contents'));
  assert.ok(pages[0].text.includes('ITPDOC-1'));
  // Order of the uploaded parts: ITP documents (current revision, then the custom "ITP" attachment is "before"), isometric, ... after-isometric attachment.
  const at = (marker: string) => { const index = pageOf(pages, marker); assert.ok(index > 0, `${marker} is in the book`); return index; };
  assert.ok(at('FRONT-1') < at('DRAWING-1'), 'custom attachment "before" the isometric');
  assert.equal(at('DRAWING-2'), at('DRAWING-1') + 1, 'uploaded PDFs are appended page by page');
  assert.ok(at('DRAWING-2') < at('SIGNED-1'), 'custom attachment "after" the isometric');
  assert.ok(pageOf(pages, 'ITPDOC-1') < at('DRAWING-1'));
  assert.ok(at('SIGNED-1') < at('WPSDOC-1') && at('WPSDOC-1') < at('CERT1-1'), 'reference order of the remaining parts');
  assert.equal(pageOf(pages, 'OLDREV-1'), -1, 'only the current revision of the drawing');
  assert.equal(pageOf(pages, 'CERT3-1'), -1, 'a certificate of an unused certificate is not in the book');
  // Generated parts carry the continuous book number; uploaded pages stay untouched.
  const total = pages.length;
  const label = pages.findIndex(page => page.text.includes('Main project'));
  assert.ok(label > at('DRAWING-1') && pages[label].text.includes(`ISO book page ${label + 1}/${total}`), 'Weld Label page number inside the book');
  assert.ok(!pages[0].text.some(line => line.startsWith('ISO book page')), 'an uploaded first page stays untouched');
  assert.ok(!pages[at('DRAWING-1')].text.some(line => line.startsWith('ISO book page')));
  // The image is placed on a page of its own; unreadable files are listed with their names and reasons.
  const last = pages.at(-1)!.text;
  for (const name of ['Files not included', 'rt-broken.pdf', 'locked.pdf', 'cert-h1043.docx']) assert.ok(last.includes(name), name);
  assert.ok(last.some(line => /encrypted/i.test(line)) && last.some(line => /not a valid PDF/.test(line)) && last.some(line => /DOCX files cannot be placed/.test(line)));
  assert.ok(all.includes('rt-report.png'), 'the caption of the image page');
  assert.ok(all.some(line => line.includes("ISO STX-CW-001 - Welder's summary")));
});

test('Welder\'s summary: welders, their welds and the qualification validity at the weld date', async t => {
  const certificate = (issuedAt: string, expiresAt: string, extra: Partial<Row> = {}) => ({ id: `c-${issuedAt}`, welderId: 'w', issuedAt, expiresAt, _archived: false, ...extra }) as Row;
  assert.equal(qualificationStatusAt([certificate('2026-01-01', '2026-12-31')], '2026-06-15').status, 'Valid');
  assert.equal(qualificationStatusAt([certificate('2026-01-01', '2026-12-31')], '2026-01-01').status, 'Valid', 'bounds are inclusive');
  assert.equal(qualificationStatusAt([certificate('2026-01-01', '2026-12-31')], '2027-01-01').status, 'Expired');
  assert.equal(qualificationStatusAt([certificate('2026-07-01', '2027-12-31')], '2026-06-15').status, 'Not yet valid');
  assert.equal(qualificationStatusAt([certificate('2025-01-01', '2025-12-31'), certificate('2026-01-01', '2026-12-31')], '2026-06-15').covering.length, 1, 'only the covering one');
  assert.equal(qualificationStatusAt([certificate('', '')], '2026-06-15').status, 'Valid', 'open bounds');
  assert.equal(qualificationStatusAt([], '2026-06-15').status, 'No qualification');
  assert.equal(qualificationStatusAt([certificate('2026-01-01', '2026-12-31', { _archived: true })], '2026-06-15').status, 'No qualification', 'archived ones do not count');
  assert.equal(qualificationStatusAt([certificate('2026-01-01', '2026-12-31')], '').status, 'No weld date');

  const f = await fixture(t);
  const rows = Object.fromEntries(['isometrics', 'projects', 'welds', 'welders', 'welder_certificates', 'wps'].map(key => [key, f.store.list(key)]));
  const model = weldersSummaryModel(rows, 'iso-1')!;
  const welds = f.store.list('welds').filter(weld => weld.isoId === 'iso-1');
  assert.equal(model.welders.reduce((sum, welder) => sum + welder.welds.length, 0), welds.length, 'every weld appears under its welder');
  assert.deepEqual(model.welders.map(welder => welder.welder.id).sort(), [...new Set(welds.map(weld => String(weld.welder1Id)))].sort());
  const w002 = model.welders.find(entry => entry.welder.id === 'welder-2')!;
  // The seed dates certificates from today, so the expected end date is read from the seeded certificate that covers the weld.
  const covering = f.store.list('welder_certificates').filter(row => row.welderId === 'welder-2' && !row.isDocument && String(row.issuedAt || '') <= String(w002.welds[0].date) && String(w002.welds[0].date) <= String(row.expiresAt || '9999')).map(row => String(row.expiresAt).slice(0, 10)).sort().at(-1);
  assert.equal(w002.welds[0].status, 'Valid'); assert.equal(w002.welds[0].validUntil, covering);
  const standalone = await texts(await f.admin.request('/pdf/welders-summary?isoId=iso-1', { pilot: 'weld' }));
  for (const label of ["ISO STX-CW-001 - Welder's summary", 'Welder', 'Weld', 'Weld date', 'WPS', 'Qualification', 'Valid until', 'At weld date', 'W001', 'Valid']) assert.ok(standalone.all.includes(label), label);
  assert.equal((await f.admin.request('/pdf/welders-summary?isoId=iso-1', { pilot: 'mto' })).status, 403, 'weld register report: Weld Pilot only');
});

test('several isometrics: one book per isometric one after the other, or one book grouped by part type', async t => {
  const f = await fixture(t);
  const second = f.store.list('isometrics').find(row => row.id !== 'iso-1' && row.projectId === 'project-cooling')!;
  assert.ok(second);
  const listing = await f.parts(f.admin, `iso-1,${second.id}`);
  assert.equal(listing.isometrics.length, 2);
  const parts = ['lisl-blank', 'welders-summary'];
  const separate = await texts(await f.book(f.admin, { isoIds: ['iso-1', second.id], parts, grouping: 'by-isometric' }));
  const starts = separate.pages.map((page, index) => page.text.some(line => line.startsWith('ISO book page 1/')) ? index : -1).filter(index => index >= 0);
  assert.equal(starts.length, 2, 'a book per isometric, its numbering restarting');
  assert.equal(starts[0], 0); assert.ok(separate.pages[starts[1]].text.some(line => line === 'ISO book page 1/' + (separate.pages.length - starts[1])));
  const grouped = await texts(await f.book(f.admin, { isoIds: ['iso-1', second.id], parts, grouping: 'by-part' }));
  assert.equal(grouped.pages.filter(page => page.text.some(line => line.startsWith('ISO book page 1/'))).length, 1, 'one grouped book');
  const kinds = grouped.pages.map(page => page.text.some(line => line.includes('Blank')) || page.text.includes('Iso number') && page.text.includes('Chg.No.') ? 'lisl' : page.text.some(line => line.includes("Welder's summary")) ? 'summary' : 'other');
  const firstSummary = kinds.indexOf('summary'), lastLisl = kinds.lastIndexOf('lisl');
  assert.ok(lastLisl < firstSummary, 'all blank LISL pages come before the first welder\'s summary');
  assert.equal((await f.book(f.admin, { isoIds: ['iso-1', second.id], parts, grouping: 'sideways' })).status, 422);
});

test('limits: total size and page count are enforced with a clear message', async t => {
  const f = await fixture(t);
  assert.equal((await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('BIG', 30), 'big.pdf', 'ISO revision 2')).status, 201);
  const request = { isoIds: ['iso-1'], parts: ['isometric', 'lisl-blank'] };
  const savedPages = ISO_BOOK_LIMITS.pages, savedBytes = ISO_BOOK_LIMITS.inputBytes;
  try {
    ISO_BOOK_LIMITS.pages = 20;
    const pages = await f.book(f.admin, request);
    assert.equal(pages.status, 413); assert.match((await pages.json() as { error: string }).error, /more than 20 pages/);
    ISO_BOOK_LIMITS.pages = savedPages; ISO_BOOK_LIMITS.inputBytes = 100;
    const size = await f.book(f.admin, request);
    assert.equal(size.status, 413); assert.match((await size.json() as { error: string }).error, /larger than/);
  } finally { ISO_BOOK_LIMITS.pages = savedPages; ISO_BOOK_LIMITS.inputBytes = savedBytes; }
  assert.equal((await f.book(f.admin, request)).status, 200, 'within the limits again');
  assert.match(bookRequestError({ isoIds: Array.from({ length: ISO_BOOK_LIMITS.isometrics + 1 }, (_, i) => `i${i}`), parts: ['isometric'] }), /at most/);
  assert.equal((await f.book(f.admin, { isoIds: [], parts: ['isometric'] })).status, 422);
  // A removed part cannot be requested through the route either.
  for (const removed of REMOVED_BOOK_PARTS) assert.equal((await f.book(f.admin, { isoIds: ['iso-1'], parts: [removed] })).status, 422, removed);
  assert.equal((await f.book(f.admin, { isoIds: ['iso-1'], parts: [] })).status, 422);
  assert.equal((await f.book(f.admin, { isoIds: ['iso-1'], parts: ['no-such-part'] })).status, 422);
  assert.equal((await f.book(f.admin, { isoIds: ['iso-1'], parts: ['itp'] })).status, 422, 'a part without content is refused with its reason');
});

test('access: the book never yields a file the account could not download directly', async t => {
  const f = await fixture(t);
  assert.equal((await f.upload(f.admin, 'certifications', 'certificate-1', await f.document('SECRETCERT', 1), 'secret-cert.pdf')).status, 201);
  assert.equal((await f.upload(f.admin, 'isometrics', 'iso-1', await f.document('OPENDRAWING', 1), 'open.pdf', 'ISO revision 2')).status, 201);
  const certFile = f.store.list('attachments').find(file => file.name === 'secret-cert.pdf')!;
  // Detailed permissions: the isometric, its welds and the weld catalogs, but not the certifications ("18").
  const base = { '4': ['show'], '5': ['show'], '63': ['show'], '64': ['show'], '37': ['show'], '42': ['show'], '44': ['show'], '68': ['show'], '85': ['show'], '87': ['show'], '76': ['show'], '86': ['show'] };
  const detailed = (rules: Record<string, string[]>) => ({ permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules) });
  const noMaterials = f.profile('Welding without certifications', detailed(base));
  const withMaterials = f.profile('Welding with certifications', detailed({ ...base, '18': ['show'] }));
  const limited = f.account('Limited', { profileId: noMaterials, weldEnabled: true, weldProfileId: noMaterials, mtoEnabled: false });
  const allowed = f.account('Allowed', { profileId: withMaterials, weldEnabled: true, weldProfileId: withMaterials, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: withMaterials, weldEnabled: false, mtoEnabled: true, mtoProfileId: withMaterials });
  const a = f.client(), b = f.client(), c = f.client(); await a.login(limited.email); await b.login(allowed.email); await c.login(mtoOnly.email);
  // Direct download rule: allowed for one account, refused for the other.
  assert.equal((await b.request(`/files/${certFile.id}`, { pilot: 'weld' })).status, 200);
  assert.equal((await a.request(`/files/${certFile.id}`, { pilot: 'weld' })).status, 403);
  // The dialog shows the part as disabled for the limited account, enabled for the other; the book follows.
  const part = (listing: BookPartsResponse) => listing.parts.find(item => item.key === 'material-certificates')!;
  assert.equal(part(await f.parts(b, 'iso-1')).available, true);
  const refused = part(await f.parts(a, 'iso-1')); assert.equal(refused.available, false); assert.ok(refused.reason);
  const withIt = await f.book(b, { isoIds: ['iso-1'], parts: ['material-certificates', 'isometric'] });
  assert.ok((await texts(withIt)).all.includes('SECRETCERT-1'));
  const without = await f.book(a, { isoIds: ['iso-1'], parts: ['material-certificates'] });
  assert.equal(without.status, 422, 'asking for the part is refused');
  const mixed = await texts(await f.book(a, { isoIds: ['iso-1'], parts: ['isometric'] }));
  assert.ok(mixed.all.includes('OPENDRAWING-1') && !mixed.all.includes('SECRETCERT-1'), 'the accessible parts still work and the other file is absent');
  // Pilot boundary, both directions.
  assert.equal((await a.request('/iso-book/parts?isoIds=iso-1', { pilot: 'mto' })).status, 403, 'weld-only account in MTO Pilot');
  assert.equal((await book(c, 'weld')).status, 403, 'MTO-only account in Weld Pilot');
  assert.equal((await f.admin.request('/iso-book/parts?isoIds=iso-1')).status, 403, 'no pilot');
  assert.equal((await f.book(f.admin, { isoIds: ['iso-1'], parts: ['isometric'] }, '')).status, 403, 'no pilot on the POST');
  const mto = await f.parts(c, 'iso-1', 'mto');
  assert.equal(mto.parts.find(item => item.key === 'isometric')!.available, true);
  assert.equal(mto.parts.find(item => item.key === 'lisl:lisl-gu')!.available, false, 'MTO Pilot has no LISL report, so no LISL part');
  assert.equal((await f.book(c, { isoIds: ['iso-1'], parts: ['lisl:lisl-gu'] }, 'mto')).status, 422);
  assert.equal((await f.book(c, { isoIds: ['iso-1'], parts: ['isometric'] }, 'mto')).status, 200, 'the book works in both pilots');
  // Unknown or unreadable isometrics.
  assert.equal((await f.book(b, { isoIds: ['missing'], parts: ['isometric'] })).status, 404);
  const skid = f.store.get('projects', 'project-skid'); f.store.update('projects', skid.id, { weldPilot: false }, skid._version, SYSTEM);
  const skidIso = f.store.list('isometrics').find(row => row.projectId === 'project-skid')!;
  assert.equal((await f.book(f.admin, { isoIds: [skidIso.id], parts: ['isometric'] })).status, 404, 'an isometric of a project not enabled in this pilot');
  assert.equal((await f.admin.request(`/iso-book/parts?isoIds=iso-1,${skidIso.id}`, { pilot: 'weld' })).status, 404);
  async function book(client: ReturnType<typeof f.client>, pilot: string) { return f.book(client, { isoIds: ['iso-1'], parts: ['isometric'] }, pilot); }
});

test('project-specific certificates: only the project\'s certificates are printed when the setting is on', async t => {
  const f = await fixture(t);
  assert.equal((await f.upload(f.admin, 'certifications', 'certificate-1', await f.document('LINKED', 1), 'linked.pdf')).status, 201);
  assert.equal((await f.upload(f.admin, 'certifications', 'cert-h1043', await f.document('UNLINKED', 1), 'unlinked.pdf')).status, 201);
  const request = { isoIds: ['iso-1'], parts: ['material-certificates'] };
  const before = (await texts(await f.book(f.admin, request))).all;
  assert.ok(before.includes('LINKED-1') && before.includes('UNLINKED-1'), 'setting off: every certificate used on the welds');
  const project = f.store.get('projects', 'project-cooling'), site = f.store.get('sites', String(project.siteId));
  f.store.update('sites', site.id, { projectCertificates: true }, site._version, SYSTEM);
  const linked = (await texts(await f.book(f.admin, request))).all;
  assert.ok(linked.includes('LINKED-1') && linked.includes('UNLINKED-1'), 'setting on: the certificate is linked to the project in the sample data');
  const link = f.store.list('certificate_projects').find(row => row.certificateId === 'cert-h1043' && row.projectId === 'project-cooling')!;
  f.store.archive('certificate_projects', link.id, link._version, SYSTEM);
  const after = (await texts(await f.book(f.admin, request))).all;
  assert.ok(after.includes('LINKED-1') && !after.includes('UNLINKED-1'), 'setting on: a certificate not linked to the project is left out');
  f.store.create('certificate_projects', { certificateId: 'cert-h1043', projectId: 'project-cooling' }, SYSTEM);
  assert.ok((await texts(await f.book(f.admin, request))).all.includes('UNLINKED-1'), 'linked again');
});

test('other profiles keep behaving as before: no ISO Book endpoints', async t => {
  for (const profile of ['welding-demo', 'access-prototype', 'full'] as ReleaseProfile[]) {
    const f = await fixture(t, profile);
    assert.equal((await f.admin.request('/iso-book/parts?isoIds=iso-1')).status, 404, profile);
    assert.equal((await f.admin.request('/iso-book', { method: 'POST', data: { isoIds: ['iso-1'], parts: ['isometric'] } })).status, 404, profile);
  }
});

test('scn-SB-N8: a part the account may read in its other pilot is offered and delivered in this one; an account that may not read it anywhere is refused', async t => {
  const f = await fixture(t);
  // The administrator reads the MTO report in MTO Pilot: Weld Pilot offers and delivers it too (it was denied before).
  const listing = await f.parts(f.admin, 'iso-1');
  assert.equal(listing.parts.find(part => part.key === 'mto-report')!.available, true);
  const delivered = await f.book(f.admin, { isoIds: ['iso-1'], parts: ['mto-report'] });
  assert.ok((await pdfOf(delivered)).length > 100);
  // Welding rights only in Weld Pilot, the full profile in MTO Pilot, and the same account without MTO access.
  const base = { '4': ['show'], '5': ['show'], '63': ['show'], '64': ['show'], '37': ['show'], '42': ['show'], '44': ['show'], '68': ['show'], '85': ['show'], '87': ['show'], '76': ['show'], '86': ['show'] };
  const weldOnly = f.profile('Welding only', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(base) });
  const full = String(f.store.list('users').find(user => user.email === 'book-admin@example.test')!.profileId);
  const both = f.account('Both pilots', { profileId: weldOnly, weldEnabled: true, weldProfileId: weldOnly, mtoEnabled: true, mtoProfileId: full });
  const single = f.account('Weld only', { profileId: weldOnly, weldEnabled: true, weldProfileId: weldOnly, mtoEnabled: false });
  const a = f.client(), b = f.client(); await a.login(both.email); await b.login(single.email);
  const part = (response: BookPartsResponse) => response.parts.find(item => item.key === 'mto-report')!;
  assert.equal(part(await f.parts(a, 'iso-1')).available, true, 'enabled and readable in the other pilot');
  assert.ok((await pdfOf(await f.book(a, { isoIds: ['iso-1'], parts: ['mto-report'] }))).length > 100);
  const refused = part(await f.parts(b, 'iso-1'));
  assert.equal(refused.available, false); assert.match(refused.reason!, /permission profile/);
  assert.equal((await f.book(b, { isoIds: ['iso-1'], parts: ['mto-report'] })).status, 422, 'asking for the part is refused');
});
