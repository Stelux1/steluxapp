import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { seed, seedCompanySample, seedInspectionSamples } from '../server/seed.ts';
import { seedMtoLogistics } from '../server/mto-logistics.ts';
import { createApp } from '../server/http.ts';
import { runAction } from '../server/workflows.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { inspectionCellState, REQUEST_DOCUMENT } from '../shared/inspections.ts';
import { pickListReports, requestOf, SERVICE_REQUEST_COLUMNS, serviceRequestDocumentData, serviceRequestFileBase, siteNumber, tracingFlag } from '../shared/mto-logistics.ts';
import { documentStorage } from '../server/documents.ts';
import { buildServiceRequestDocuments } from '../server/service-requests.ts';
import { coatingReleasePdf, serviceRequestPdf } from '../server/pdf/service-request.ts';
import { engineerSignerId, visualSignerId, hydrotestDocumentModel, pressureTestSignatures, releaseDocumentModel, requestDocumentModel, requestDocumentOptions, visualReportModel, weldInspectionState } from '../shared/pdf-documents.ts';
import { blankPunchHeader, flangeReportModel, flangeReportOptions, pickListModel, punchListModel, punchListOptions } from '../shared/pdf-lists.ts';
import { companyFromRow } from '../shared/pdf-company.ts';
import { requestPdf, visualPdf } from '../server/pdf/operational-requests.ts';
import { releasePdf } from '../server/pdf/operational-release.ts';
import { hydrotestPdf } from '../server/pdf/hydrotest-book.ts';
import { blankPunchPdf, flangePdf, pickListPdf, punchPdf } from '../server/pdf/operational-lists.ts';
import { FOOTER_HEIGHT, type Layout } from '../server/pdf/engine.ts';
import type { Row } from '../shared/types.ts';
import { PDFDocument } from 'pdf-lib';
import { readPdf } from './pdf-helpers.ts';
import { pdfDocumentQuery } from '../client/pdf-documents.tsx';
import { PDF_MENU } from '../client/pdf-reports.tsx';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import { OPERATIONAL_DOCUMENTS } from '../server/pdf/operational-documents.ts';
import { PDF_REPORT_RESOURCES } from '../shared/pdf-report-keys.ts';
import { canReport } from '../shared/permissions.ts';

const PASSWORD = 'Pdf-Docs-Password';
const RW = 'Read & write', NONE = 'No access';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TODAY = new Date().toISOString().slice(0, 10);

type Options = { method?: string; pilot?: string; data?: unknown };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-pdf-docs-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store); seedInspectionSamples(store); seedMtoLogistics(store, SYSTEM); seedCompanySample(store);
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
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Pdf admin', email: 'pdf-docs-admin@example.test', password: PASSWORD } })).status, 201);
  const upload = (as: ReturnType<typeof client>, pilot: string, entityType: string, entityId: string, content: Uint8Array | string, name: string, type: string, documentType?: string) => {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); body.set('file', new Blob([content as BlobPart], { type }), name); if (documentType) body.set('documentType', documentType);
    return as.request('/files', { method: 'POST', pilot, data: body });
  };
  return { store, client, admin, profile, account, upload };
}
const pdf = async (response: Response) => { assert.equal(response.status, 200, await response.clone().text()); assert.equal(response.headers.get('content-type'), 'application/pdf'); const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-'); return bytes; };
const hasImage = (bytes: Uint8Array) => Buffer.from(bytes).includes('/Subtype /Image');
const textOf = async (bytes: Uint8Array) => (await readPdf(bytes)).pages.flatMap(page => page.text);
const get = async (f: Awaited<ReturnType<typeof fixture>>, path: string, pilot = 'weld') => textOf(await pdf(await f.admin.request(`/pdf/${path}`, { pilot })));
const rowsOf = (store: Store): Record<string, Row[]> => Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)]));
const allIsos = (rows: Record<string, Row[]>) => new Set(rows.isometrics.map(row => row.id));
const weldNo = (store: Store, id: string) => String(store.get('welds', id).weldNo);
const NOW = new Date('2026-11-16T09:30:00');

/** Layout model checks every operational document must pass: rows never split, headers repeat, footer with time and page n/N. */
function assertLayout(layout: Layout, name: string, options: { rowsMinimum?: number } = {}) {
  assert.ok(layout.pages.length >= 1, name);
  layout.pages.forEach((page, index) => {
    assert.ok(page.pageHeader, `${name}: page header on page ${index + 1}`);
    const limit = page.height - 28 - FOOTER_HEIGHT;
    for (const row of page.rows) { assert.ok(row.bottom <= limit + 0.5, `${name}: row ${row.index} ends above the footer (page ${index + 1})`); assert.ok(row.top >= 28, `${name}: row inside the page`); assert.ok(row.bottom > row.top); }
    if (page.rows.length) assert.ok(page.tableHeaders >= 1, `${name}: table header on page ${index + 1}`);
    assert.ok(page.texts.some(item => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(item.text)), `${name}: generation time in the footer`);
    assert.ok(page.texts.some(item => item.text === `${index + 1}/${layout.pages.length}`), `${name}: page n/N`);
  });
  assert.ok(layout.pages.flatMap(page => page.rows).length >= (options.rowsMinimum ?? 0), `${name}: rows`);
}

// ----- NDT / NDT Pre / PWHT requests -------------------------------------------------------------------------------------------

test('NDT request: header, request data, processes and the weld table of a mass request', async t => {
  const f = await fixture(t);
  const text = await get(f, 'ndt-request?requestNo=R00004');
  for (const label of ['NDT request', 'Request R00004', 'Client', 'Intern prj. no.', 'Request no.', 'Request date', 'NDT location', 'Processes', 'Weld no.', 'Type', 'Dia.', 'Wall thk.', 'Material', 'WPS', 'Welder', 'Weld date', 'Note', 'Requested by', 'Received by', 'Kestrel Pipe Fabrication B.V.']) assert.ok(text.includes(label), label);
  for (const id of ['weld-22', 'weld-23', 'weld-24']) assert.ok(text.includes(weldNo(f.store, id)), id);
  assert.ok(text.includes('RT, UT') && text.includes('Radiography of the field closing welds; UT where film access is limited.'));
  assert.ok(text.some(line => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(line)) && text.includes('1/1'));
  assert.ok(!text.includes('Test system') && !text.includes('Rev.'), 'no isometric list unless asked');
  const asked = await get(f, 'ndt-request?requestNo=R00004&isometrics=1');
  assert.ok(asked.includes('ISO number') && asked.includes('Drawing no.') && asked.includes('Test system'));
  const onlyRt = await get(f, 'ndt-request?requestNo=R00004&processes=ndt-0');
  assert.ok(onlyRt.includes('RT') && !onlyRt.includes('RT, UT'));
  const noted = await get(f, `ndt-request?requestNo=R00004&note=${encodeURIComponent('Film density as per procedure.')}`);
  assert.ok(noted.includes('Film density as per procedure.') && !noted.includes('Radiography of the field closing welds; UT where film access is limited.'));
  assert.equal((await f.admin.request(`/pdf/ndt-request?requestNo=R00004&note=${'x'.repeat(2001)}`, { pilot: 'weld' })).status, 422);
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R00003', { pilot: 'weld' })).status, 404, 'an NDT Pre request is not an NDT request');
  assert.equal((await f.admin.request('/pdf/ndt-request', { pilot: 'weld' })).status, 404);
  assert.match((await f.admin.request('/pdf/ndt-request?requestNo=R00004', { pilot: 'weld' })).headers.get('content-disposition') || '', new RegExp(`filename="${TODAY}-STX-2402-NDT-request-R00004\\.pdf"`));
});

test('NDT Pre request and Pre-HT/PWHT request print their own types and processes', async t => {
  const f = await fixture(t);
  const pre = await get(f, 'ndt-pre-request?requestNo=R00003');
  for (const label of ['NDT Pre request', 'Request R00003', 'MT', 'Magnetic particle test of the root and hot pass before capping.']) assert.ok(pre.includes(label), label);
  for (const id of ['weld-22', 'weld-24']) assert.ok(pre.includes(weldNo(f.store, id)));
  assert.ok(!pre.includes(weldNo(f.store, 'weld-23')), 'only the welds of that request');
  const pwht = await get(f, 'pwht-request?requestNo=R00006');
  for (const label of ['Pre-HT / PWHT request', 'PWHT location', 'PWHT process', 'Heat treatment cycle as specified in the WPS; chart recorder required.']) assert.ok(pwht.includes(label), label);
  assert.ok(pwht.includes(weldNo(f.store, 'weld-20')));
  assert.ok((await get(f, 'pwht-request?requestNo=R00005')).includes(weldNo(f.store, 'weld-2')), 'Pre-HT requests print too');
  assert.equal((await f.admin.request('/pdf/pwht-request?requestNo=R00004', { pilot: 'weld' })).status, 404);
});

test('a request document is attached to its requests as "Request document" (POST only), and the weld cell finds it', async t => {
  const f = await fixture(t);
  const before = f.store.list('attachments').length;
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R00004', { pilot: 'weld' })).status, 200);
  assert.equal(f.store.list('attachments').length, before, 'GET does not store anything');
  const response = await f.admin.request('/pdf/ndt-request?requestNo=R00004', { method: 'POST', pilot: 'weld' });
  const bytes = await pdf(response);
  assert.equal(response.headers.get('x-attached'), '3');
  const files = f.store.list('attachments').filter(file => file.documentType === REQUEST_DOCUMENT);
  assert.equal(files.length, 3);
  const requests = f.store.list('inspection_requests').filter(row => row.number === 'R00004');
  assert.deepEqual(files.map(file => file.entityId).sort(), requests.map(row => row.id).sort());
  assert.ok(files.every(file => file.entityType === 'inspection_requests' && file.mime === 'application/pdf' && file.size === bytes.length && String(file.name).endsWith('.pdf')));
  const download = await f.admin.request(`/files/${files[0].id}`, { pilot: 'weld' });
  assert.equal(download.status, 200);
  assert.equal(Buffer.from(await download.arrayBuffer()).toString('latin1', 0, 5), '%PDF-');
  const weld = f.store.get('welds', String(requests[0].weldId));
  assert.equal(inspectionCellState(weld, 'NDT', { requests: f.store.list('inspection_requests'), attachments: f.store.list('attachments'), results: f.store.list('inspection_results') }).requestFiles.length, 1, 'the printer icon of the weld table');
  assert.equal((await f.admin.request('/pdf/visual-report?reportNo=VT-2026-014', { method: 'POST', pilot: 'weld' })).status, 404, 'only request documents are attachable');
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R-9999', { method: 'POST', pilot: 'weld' })).status, 404);
  assert.equal(f.store.list('attachments').filter(file => file.documentType === REQUEST_DOCUMENT).length, 3);
});

test('attaching needs the import right on the requests; printing alone does not attach', async t => {
  const f = await fixture(t);
  const reader = f.profile('Reader', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  const viewer = f.account('Weld reader', { profileId: reader, weldEnabled: true, weldProfileId: reader, mtoEnabled: false }), other = f.client(); await other.login(viewer.email);
  const printed = await other.request('/pdf/ndt-request?requestNo=R00004', { pilot: 'weld' });
  await pdf(printed);
  assert.equal((await other.request('/pdf/ndt-request?requestNo=R00004', { method: 'POST', pilot: 'weld' })).status, 403, 'a reader may print but not attach');
  assert.equal(f.store.list('attachments').filter(file => file.documentType === REQUEST_DOCUMENT).length, 0);
});

// ----- visual inspection report ------------------------------------------------------------------------------------------------

test('Visual inspection report: ITP, activity, engineer with stamp, VT fields of the main project, welds and signature', async t => {
  const f = await fixture(t);
  const path = 'visual-report?reportNo=VT-2026-014';
  const text = await get(f, path);
  for (const label of ['Visual inspection report', 'Report VT-2026-014', 'ITP', 'ITP 1', 'Activity no.', '4.2', 'Custom no.', 'NFY-VT-07', 'QA/QC engineer', 'Morgan Lee - stamp ML-07', 'Inspection date', 'VT type 2 order No', 'PO-44017', 'VT 2 prefix', 'VT2', 'Accepted', 'applicable', 'Weld no.', 'Reviewed by']) assert.ok(text.includes(label), label);
  for (const id of ['weld-1', 'weld-10', 'weld-19']) assert.ok(text.includes(weldNo(f.store, id)), id);
  assert.equal(text.filter(line => line === 'X').length, 3, 'one mark per weld');
  assert.ok(text.includes('15.06.2026'), 'VT type 2 date prints as dd.mm.yyyy');
  assert.ok(!text.includes('VT-NFY-01 rev B') && !text.includes('PR-VT-004'), 'a version 2 report prints no version 1 lines');
  assert.equal((await f.admin.request('/pdf/visual-report?reportNo=NOPE', { pilot: 'weld' })).status, 404);
  const before = await pdf(await f.admin.request(`/pdf/${path}`, { pilot: 'weld' }));
  assert.ok(!hasImage(before), 'no signature when the engineer has none');
  // Engineer qa-1 becomes account B, which has a full signature.
  const b = f.account('Morgan Lee', { profileId: f.profile('Visual inspector', { generalPermission: RW, weldingPermission: RW, materialsPermission: NONE }) });
  const inspectorB = f.client(); await inspectorB.login(b.email);
  const engineer = f.store.get('qa_engineers', 'qa-1');
  f.store.update('qa_engineers', engineer.id, { email: b.email }, engineer._version, SYSTEM);
  const created = await inspectorB.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Morgan Lee', userId: b.id, kind: 'Full signature', nameUnder: true } });
  assert.equal(created.status, 201, await created.clone().text());
  const record = (await created.json() as { record: Row }).record;
  assert.equal((await f.upload(inspectorB, 'weld', 'signatures', record.id, PNG, 'full.png', 'image/png')).status, 201);
  const print = async () => pdf(await f.admin.request(`/pdf/${path}`, { pilot: 'weld' }));
  assert.ok(!hasImage(await print()), 'the sample data recorded the results, not the engineer');
  const body = { weldIds: ['weld-1', 'weld-10', 'weld-19'], accepted: ['weld-1', 'weld-10'], notApplicable: ['weld-19'], itp: 'ITP 1', activityNo: '4.2', engineerId: 'qa-1', customNo: 'NFY-VT-07', reportNo: 'VT-2026-014', date: '2026-10-21' };
  // Recorded by account A (the administrator) naming engineer B: the name prints over an empty signature line.
  assert.equal((await f.admin.request('/actions/visual-inspection', { method: 'POST', pilot: 'weld', data: body })).status, 201);
  const byA = await print();
  assert.ok(!hasImage(byA), 'no image when another account recorded the result');
  assert.ok((await textOf(byA)).some(line => line.includes('Morgan Lee')), 'the engineer\'s name is printed');
  // Recorded by B itself: B's signature image.
  assert.equal((await inspectorB.request('/actions/visual-inspection', { method: 'POST', pilot: 'weld', data: body })).status, 201);
  const byB = await print();
  assert.ok(hasImage(byB), 'the engineer\'s signature image once the engineer recorded the result');
  assert.ok((await textOf(byB)).includes('Morgan Lee'), 'name under the signature');
});

test('the engineer signature is found through the matching user, else not at all', () => {
  const users = [{ id: 'u1', email: 'a@x.test', name: 'A' }, { id: 'u2', email: 'quality@example.com', name: 'Someone' }] as unknown as Row[];
  assert.equal(engineerSignerId({ id: 'e', email: 'QUALITY@example.com', name: 'Morgan' } as unknown as Row, users), 'u2');
  assert.equal(engineerSignerId({ id: 'e', email: '', name: 'a' } as unknown as Row, users), 'u1');
  assert.equal(engineerSignerId({ id: 'e', email: '', name: 'Nobody' } as unknown as Row, users), '');
  assert.equal(engineerSignerId(undefined, users), '');
  const engineer = { id: 'e', email: 'quality@example.com', name: '' } as unknown as Row;
  assert.equal(visualSignerId(engineer, users, ['r1', 'r2'], () => 'u2'), 'u2', 'the engineer recorded every result');
  assert.equal(visualSignerId(engineer, users, ['r1', 'r2'], id => id === 'r1' ? 'u2' : 'u1'), '', 'one result recorded by another account');
  assert.equal(visualSignerId(engineer, users, [], () => 'u2'), '');
});

// ----- release documents ----------------------------------------------------------------------------------------------------------

const releaseOf = (store: Store, isoId: string, type: string) => store.list('releases').find(row => row.isoId === isoId && row.type === type && row.status !== 'Reopened')!;

test('Prefab and Field release note: Report No, Project, ITP no., one row per isometric of the release, three signature boxes', async t => {
  const f = await fixture(t);
  const prefab = releaseOf(f.store, 'iso-3', 'Prefab'), field = releaseOf(f.store, 'iso-3', 'Field');
  const text = await get(f, `prefab-release?releaseId=${prefab.id}`);
  for (const label of ['Prefab Release note', 'Report No', 'PFR-002', 'Project', 'ITP no.', 'ITP-01 rev.2', 'Release date', 'ITP number', 'Spools', 'System / Medium', 'Doc. Number / Drg. Number', 'Rev.', 'DWG-2403-STX-CW-003', 'Contractor / Supplier QA/QC', 'Client', 'Notified body (NoBo)']) assert.ok(text.includes(label), label);
  assert.ok(!text.some(line => line.startsWith('Welds - shop')) && !text.includes('Punch summary'), 'the note lists isometrics, not welds or punch items');
  const site = f.store.get('sites', 'site-north');
  // The six signature titles label the Pressure Test Plan, not the release note.
  for (const name of ['signSubQaqc', 'signSubConstruction', 'signPrincipalUi', 'signContractorQaqc', 'signContractorConstruction', 'signNobo']) if (site[name]) assert.ok(!text.includes(String(site[name])), String(site[name]));
  const fieldText = await get(f, `field-release?releaseId=${field.id}`);
  assert.ok(fieldText.includes('Field Release note') && fieldText.includes('FLR-001'));
  assert.equal((await f.admin.request(`/pdf/field-release?releaseId=${prefab.id}`, { pilot: 'weld' })).status, 422, 'a prefab release is not printed as a field release');
  const hydro = f.store.list('releases').find(row => row.type === 'Hydrotest')!;
  assert.equal((await f.admin.request(`/pdf/prefab-release?releaseId=${hydro.id}`, { pilot: 'weld' })).status, 404);
  assert.equal((await f.admin.request('/pdf/prefab-release?releaseId=missing', { pilot: 'weld' })).status, 404);
});

test('one release of three isometrics of one ITP is one note with three rows and three signature boxes; the next report number follows', async t => {
  const f = await fixture(t);
  const made = runAction(f.store, 'release', { type: 'Prefab', isoIds: ['iso-1', 'iso-2', 'iso-4'], itp: 'ITP-NOTE', date: '2026-11-03' }, SYSTEM).records!;
  assert.deepEqual([new Set(made.map(row => row.reportNo)).size, made.every(row => row.itp === 'ITP-NOTE')], [1, true]);
  const rows = rowsOf(f.store), isoIds = allIsos(rows), company = { company: companyFromRow(rows.company_data[0])!, logo: PNG };
  const model = releaseDocumentModel(rows, made[0].id, isoIds)!;
  assert.equal(model.lines.length, 3); assert.equal(model.reportNo, made[0].reportNo); assert.equal(model.itpLabel, 'ITP-NOTE');
  assert.deepEqual(model.lines.map(line => line.docNo), made.map(row => String(row.docNo)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).sort((a, b) => model.lines.findIndex(line => line.docNo === a) - model.lines.findIndex(line => line.docNo === b)));
  const note = await releasePdf({ model, company, generatedAt: NOW, rows, signature: null });
  assertLayout(note.layout, 'release note', { rowsMinimum: 3 });
  const printed = note.layout.pages.flatMap(page => page.texts.map(item => item.text));
  for (const title of ['Contractor / Supplier QA/QC', 'Notified body (NoBo)']) assert.equal(printed.filter(item => item === title).length, 1, title);
  assert.equal(printed.filter(item => item === 'Client').length, 2, 'the Client of the header and the Client signature box');
  assert.equal(printed.filter(item => item === 'Name').length, 3, 'three signature boxes');
  const next = runAction(f.store, 'release', { type: 'Prefab', isoIds: ['iso-5'], itp: 'ITP-NOTE' }, SYSTEM).records![0];
  assert.notEqual(next.reportNo, made[0].reportNo);
});

test('a release keeps the numbering it was made with; a reopened release says so; the signature goes in the first box', async t => {
  const f = await fixture(t);
  const release = releaseOf(f.store, 'iso-3', 'Prefab');
  const site = f.store.get('sites', 'site-north');
  f.store.update('sites', site.id, { prefix: 'ZZZ', releaseDocDrawing: 'Prefix + iso', signNobo: 'Changed after the release' }, site._version, SYSTEM);
  const text = await get(f, `prefab-release?releaseId=${release.id}`);
  assert.ok(text.includes('DWG-2403-STX-CW-003') && !text.includes('ZZZ-STX-CW-003') && !text.includes('Changed after the release'), 'stored numbering, no signature titles');
  const reopened = f.store.list('releases').find(row => row.status === 'Reopened')!;
  const reopenedText = await get(f, `prefab-release?releaseId=${reopened.id}`);
  assert.ok(reopenedText.some(line => /reopened/i.test(line)) && reopenedText.includes('Status'));
  assert.ok(!hasImage(await pdf(await f.admin.request(`/pdf/prefab-release?releaseId=${release.id}`, { pilot: 'weld' }))));
  const me = f.store.list('users').find(user => user.email === 'pdf-docs-admin@example.test')!;
  const created = await f.admin.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Pdf admin', userId: me.id, kind: 'Full signature', nameUnder: true } });
  const record = (await created.json() as { record: Row }).record;
  assert.equal((await f.upload(f.admin, 'weld', 'signatures', record.id, PNG, 'full.png', 'image/png')).status, 201);
  f.store.update('releases', release.id, { signatureId: record.id }, f.store.get('releases', release.id)._version, SYSTEM);
  const signed = await pdf(await f.admin.request(`/pdf/prefab-release?releaseId=${release.id}`, { pilot: 'weld' }));
  assert.ok(hasImage(signed), 'the signature image of the releasing signer');
  assert.ok((await textOf(signed)).includes('Pdf admin'), 'name under the signature');
  // The six signature titles belong to the Pressure Test Plan: the release note has its three boxes.
  const titles = await textOf(signed);
  assert.ok(titles.includes('Contractor / Supplier QA/QC') && !titles.includes('QA/QC Manager'), 'no signature titles on the release document');
});

test('release document number without stored data follows the main project settings', () => {
  const stamp = { _version: 1, _archived: false, _createdAt: '2026-01-01T00:00:00Z', _updatedAt: '' };
  const rows = { releases: [{ id: 'r1', isoId: 'i1', type: 'Prefab', ...stamp }], isometrics: [{ id: 'i1', isoNo: 'ISO-7', drawingNo: 'DW-9', projectId: 'p1', ...stamp }], projects: [{ id: 'p1', siteId: 's1', ...stamp }], sites: [{ id: 's1', prefix: 'AB', releaseDocDrawing: 'Prefix + iso', signSubQaqc: 'QA', ...stamp }] } as unknown as Record<string, Row[]>;
  const model = releaseDocumentModel(rows, 'r1', new Set(['i1']))!;
  assert.equal(model.docNo, 'AB-ISO-7');
  assert.ok(!('signatureTitles' in model), 'the release document carries no signature titles');
  assert.deepEqual(model.lines.map(line => [line.docNo, line.itp, line.spools]), [['AB-ISO-7', '', '']], 'an older release without stored data and without an ITP');
  assert.equal(releaseDocumentModel(rows, 'r1', new Set()), null, 'an isometric outside the pilot');
});

test('the final NDT state of a weld names the state and the report number', async t => {
  const f = await fixture(t);
  const rows = rowsOf(f.store);
  assert.deepEqual(weldInspectionState(f.store.get('welds', 'weld-1'), 'NDT', rows), ['Accepted', 'RT-2026-001']);
  assert.deepEqual(weldInspectionState(f.store.get('welds', 'weld-5'), 'NDT', rows), ['Not accepted', 'RT-2026-005']);
  assert.equal(weldInspectionState(f.store.get('welds', 'weld-22'), 'NDT', rows)[0], 'Requested');
  assert.equal(weldInspectionState(f.store.get('welds', 'weld-1'), 'PWHT', rows)[0], 'Not required');
});

// ----- hydrotest request -------------------------------------------------------------------------------------------------------------

test('Pressure Test Plan: every field of the hydrotest release, the spools of the test system, the signature titles and the ticked documents', async t => {
  const f = await fixture(t);
  const text = await get(f, 'hydrotest-request?requestId=hydrotest-cw-1');
  for (const label of ['Pressure Test Plan', 'Hydrotest release CW-01', 'Test system', 'CW-01', 'Test record no.', 'HTR-CW-01', 'QA/QC engineer', 'Morgan Lee - stamp ML-07', 'Date', 'Pump type', 'Hose type', 'Manifold', 'Pressure gauge no.', 'Recorder No', 'Calibration cert', 'Piping class', 'Design code', 'Test medium',
    'Required Test pressure', 'Actual Test pressure', 'Test start', 'Test end', 'Area temp', 'Test duration', 'Required Leak Test Pressure', 'Leak Test duration', 'Note', 'HEP-NFY-001 rev 2', '15.2 bar', 'PG-1187', 'CAL-2026-0312', 'ASME B31.3', 'No visible leaks, pressure held for the full duration.',
    'Paint spec.', 'Asset tag', 'ISO number', 'QA/QC Manager']) assert.ok(text.includes(label), label);
  // The spools of the system (scenario SB S8: the request document listed no spools).
  const spools = f.store.list('spools').filter(row => row.testSystemId === 'test-cw');
  assert.ok(spools.length >= 1);
  for (const spool of spools) assert.ok(text.includes(String(spool.name)), String(spool.name));
  assert.ok(!(await get(f, 'hydrotest-request?requestId=hydrotest-cw-1&isometrics=0')).includes('ISO number'));
  assert.ok((await get(f, 'hydrotest-request?requestId=HTR-ST-01')).includes('HTR-ST-01'), 'by record number too');
  assert.equal((await f.admin.request('/pdf/hydrotest-request?requestId=missing', { pilot: 'weld' })).status, 404);
  // Ticked custom documents of the test system are named in the plan and appended to it.
  const { PDFDocument } = await import('pdf-lib');
  const extra = await PDFDocument.create(); extra.addPage(); extra.addPage();
  assert.equal((await f.upload(f.admin, 'weld', 'test_systems', 'test-cw', Buffer.from(await extra.save()), 'blinds.pdf', 'application/pdf', 'Blind list')).status, 201);
  const release = await f.admin.request('/actions/hydrotest-release', { method: 'POST', pilot: 'weld', data: { testSystemId: 'test-cw', includeDocuments: ['Blind list'], includeIsometrics: false } });
  assert.equal(release.status, 201, await release.clone().text());
  const id = ((await release.json()) as { record: Row }).record.id;
  const plain = await pdf(await f.admin.request(`/pdf/hydrotest-request?requestId=${id}`, { pilot: 'weld' }));
  const pages = (await PDFDocument.load(plain)).getPageCount();
  const bookText = await textOf(plain);
  assert.ok(bookText.includes('Included files') && bookText.includes('blinds.pdf'));
  assert.ok(pages >= 3, `plan plus the two pages of the blind list (${pages})`);
});

test('the Pressure Test Plan model of a site with signSubQaqc "QC lead" has a signature block "QC lead"; without titles our three', () => {
  const stamp = { _version: 1, _archived: false, _createdAt: '2026-01-01T00:00:00Z', _updatedAt: '' };
  const rows = {
    hydrotest_requests: [{ id: 'h1', testSystemId: 't1', recordNo: 'HT-1', ...stamp }], test_systems: [{ id: 't1', name: 'PTC 01', ...stamp }],
    spools: [{ id: 's1', isoId: 'i1', name: 'SP01', testSystemId: 't1', ...stamp }], isometrics: [{ id: 'i1', isoNo: 'ISO-7', projectId: 'p1', ...stamp }],
    projects: [{ id: 'p1', siteId: 's1', internnumber: '20240101', ...stamp }], sites: [{ id: 's1', signSubQaqc: 'QC lead', signNobo: 'Notified body', ...stamp }],
  } as unknown as Record<string, Row[]>;
  const model = hydrotestDocumentModel(rows, 'h1', new Set(['i1']))!;
  assert.deepEqual(model.signatureTitles.map(entry => entry.title), ['QC lead', 'Notified body']);
  assert.deepEqual(pressureTestSignatures(model), ['QC lead', 'Notified body']);
  assert.deepEqual(model.spools, [['20240101', 'ISO-7', 'SP01', '', '', '', '']]);
  assert.equal(model.includeIsometrics, false, 'Include isometric(s) starts unchecked');
  const plain = hydrotestDocumentModel({ ...rows, sites: [{ id: 's1', ...stamp }] } as unknown as Record<string, Row[]>, 'h1', new Set(['i1']))!;
  assert.deepEqual(pressureTestSignatures(plain), ['QA/QC engineer', 'Client representative', 'Witness']);
  assert.equal(hydrotestDocumentModel(rows, 'h1', new Set()), null, 'its spools lie outside the pilot');
});

// ----- punch lists -----------------------------------------------------------------------------------------------------------------------

test('Punch list (filled): the page filters narrow the items; the Document column is optional', async t => {
  const f = await fixture(t);
  const items = f.store.list('punchlists');
  const all = await get(f, 'punch-list');
  for (const label of ['Punch list', '#', 'Project', 'Isometric', 'Type', 'Description', 'Due date', 'Contractor', 'Punch', 'Document', 'Status', 'Key figures']) assert.ok(all.includes(label), label);
  assert.ok(all.some(line => line.startsWith('All punch items - ')));
  assert.ok(all.some(line => line.includes('Open ') && line.includes('Overdue')), 'key figures line');
  const has = (lines: string[], item: Row) => lines.some(line => line.startsWith(String(item.description).slice(0, 28)));
  for (const item of items) assert.ok(has(all, item), `${item.number} is printed`);
  const pre = await get(f, 'punch-list?punchType=Pre-punch');
  assert.ok(pre.some(line => line.includes('Punch type Pre-punch')));
  for (const item of items) assert.equal(has(pre, item), item.punchType === 'Pre-punch', `${item.number} ${item.punchType}`);
  const letterA = await get(f, 'punch-list?category=A&documents=0');
  assert.ok(!letterA.includes('Document') && letterA.some(line => line.includes('Type A')));
  for (const item of items) assert.equal(has(letterA, item), String(item.category).startsWith('A'), `${item.number} category`);
  const overdue = await get(f, 'punch-list?kpi=overdue');
  assert.ok(overdue.some(line => line.includes('Key figure Overdue')));
  const byIso = await get(f, 'punch-list?isoId=iso-1');
  for (const item of items) assert.equal(has(byIso, item), item.isoId === 'iso-1', `${item.number} on iso-1`);
  const projectRelated = await get(f, 'punch-list?projectId=project-cooling');
  assert.ok(projectRelated.some(line => line.includes('name plates')), 'project related items');
  const search = await get(f, 'punch-list?q=undercut');
  assert.ok(search.some(line => line.includes('undercut')) && !search.some(line => line.includes('Paint damage')));
  for (const bad of ['punchType=Final', 'category=Z', 'kpi=nothing']) assert.equal((await f.admin.request(`/pdf/punch-list?${bad}`, { pilot: 'weld' })).status, 422, bad);
  assert.equal((await f.admin.request('/pdf/punch-list?isoId=missing', { pilot: 'weld' })).status, 404);
  assert.equal((await f.admin.request('/pdf/punch-list?projectId=missing', { pilot: 'weld' })).status, 404);
});

test('Punch list print: ticked rows print on their own, the view and due filters apply, and the isometric drawing option appends the drawings', async t => {
  const f = await fixture(t);
  const rows = rowsOf(f.store), isoIds = allIsos(rows), projectIds = new Set(rows.projects.map(row => row.id));
  const open = rows.punchlists.filter(row => !row._archived && row.status === 'Open');
  const [first, second] = open.filter(row => row.isoId);
  const selected = punchListModel(rows, punchListOptions({ ids: `${first.id},${second.id}`, view: 'open' }).options, isoIds, projectIds, '2026-11-16');
  assert.deepEqual(selected.lines.map(line => line.item.id).sort(), [first.id, second.id].sort(), 'only the two ticked rows');
  assert.equal(selected.lines.length, 2); assert.deepEqual(selected.drawings, [], 'no drawings unless asked for');
  assert.ok(selected.filters.includes('Selected items (2)'));
  const withDrawing = punchListModel(rows, punchListOptions({ ids: `${first.id},${second.id}`, isoDrawing: '1' }).options, isoIds, projectIds, '2026-11-16');
  assert.deepEqual(withDrawing.drawings.map(iso => iso.id).sort(), [...new Set([first.isoId, second.isoId])].map(String).sort(), 'the isometric of each printed row');
  const all = punchListModel(rows, punchListOptions({ view: 'open' }).options, isoIds, projectIds, '2026-11-16');
  assert.ok(all.lines.length > 0 && all.lines.every(line => line.status.startsWith('Open')), 'the Open view prints only Open items');
  assert.ok(punchListModel(rows, punchListOptions({ view: 'finished' }).options, isoIds, projectIds, '2026-11-16').lines.every(line => line.status.startsWith('Finished')));
  assert.ok(punchListModel(rows, punchListOptions({ view: 'open', due: 'overdue' }).options, isoIds, projectIds, '2026-11-16').lines.every(line => line.status.includes('overdue')));
  // The drawing follows the list: the PDF grows by the pages of the drawing, and an isometric without one is named.
  const drawing = await PDFDocument.create(); drawing.addPage([300, 200]); drawing.addPage([300, 200]);
  const plain = await punchPdf({ model: withDrawing, company: null, generatedAt: NOW, rows });
  const printed = await punchPdf({ model: withDrawing, company: null, generatedAt: NOW, rows, drawings: [{ iso: 'ISO-A', bytes: await drawing.save() }, { iso: 'ISO-B', bytes: null }] });
  assert.equal((await PDFDocument.load(printed.bytes)).getPageCount(), (await PDFDocument.load(plain.bytes)).getPageCount() + 2);
  const texts = (await readPdf(printed.bytes)).pages.flatMap(page => page.text);
  assert.ok(texts.some(line => line.includes('Appended, 2 pages')) && texts.some(line => line.includes('Not included: No drawing file is uploaded.')));
  // Through the route: the ticked ids reach the document.
  const route = await get(f, `punch-list?ids=${first.id},${second.id}`);
  assert.ok(route.some(line => line.includes('Selected items (2)')));
});

test('Punch list - blank: the header of one isometric and empty rows', async t => {
  const f = await fixture(t);
  const text = await get(f, 'punch-list-blank?isoId=iso-1');
  for (const label of ['Punch list - blank', 'ISO STX-CW-001', 'Iso number', 'Client', 'Drawing no.', '#', '(A-D)', 'Description', 'Due date', 'Contractor', 'Sign-off']) assert.ok(text.includes(label), label);
  assert.ok(!text.some(line => line.includes('Paint damage')), 'no items');
  assert.equal((await f.admin.request('/pdf/punch-list-blank', { pilot: 'weld' })).status, 404);
  assert.equal((await f.admin.request('/pdf/punch-list-blank?isoId=iso-1', { pilot: 'mto' })).status, 403);
});

// ----- flange report --------------------------------------------------------------------------------------------------------------------------

test('Flange report: per isometric or per project, with tightening values and inspection result', async t => {
  const f = await fixture(t);
  const flanges = f.store.list('flanges');
  const one = await get(f, 'flange-report?isoId=iso-1');
  for (const label of ['Flange report', 'Flange ID', 'Iso number', 'Asset tag', 'Torque', 'Target', 'Tightening', 'Operator', 'Inspection', 'Status', 'Tightening standard', 'Flange procedure No.', 'FP-2026-03', 'Operator', 'Inspector']) assert.ok(one.includes(label) || one.some(line => line.startsWith(label)), label);
  for (const flange of flanges) assert.equal(one.includes(String(flange.flange_id)), flange.isoId === 'iso-1', String(flange.flange_id));
  const project = await get(f, 'flange-report?projectId=project-cooling');
  for (const flange of flanges.filter(row => ['iso-1', 'iso-2'].includes(String(row.isoId)))) assert.ok(project.includes(String(flange.flange_id)));
  assert.ok(!project.includes('FL-ST-004'), 'a flange of another project');
  const finished = await get(f, 'flange-report?projectId=project-cooling&finished=Yes');
  assert.ok(finished.some(line => line.includes('Finished: Yes') || line === 'Yes'));
  assert.equal((await f.admin.request('/pdf/flange-report', { pilot: 'weld' })).status, 422);
  assert.equal((await f.admin.request('/pdf/flange-report?isoId=iso-1&finished=Maybe', { pilot: 'weld' })).status, 422);
  assert.equal((await f.admin.request('/pdf/flange-report?isoId=missing', { pilot: 'weld' })).status, 404);
});

// ----- pick list ----------------------------------------------------------------------------------------------------------------------------------

test('Pick list: project, isometric, report no., date, material lines and the "taken by" line', async t => {
  const f = await fixture(t);
  const reports = pickListReports(rowsOf(f.store));
  assert.ok(reports.length >= 2);
  const report = reports[0];
  const text = await get(f, `pick-list?reportNo=${report.reportNo}`, 'mto');
  for (const label of ['Pick list', `Report ${report.reportNo}`, 'Client', 'Report no.', 'Date', 'Taken', 'Group', 'Material no.', 'Description', 'DIA', 'LBS/SCH', 'Quantity', 'UOM', 'Storehouse', 'Taken by', 'Issued by']) assert.ok(text.includes(label), label);
  const iso = f.store.get('isometrics', report.isoId);
  assert.ok(text.some(line => line.startsWith(String(iso.isoNo))));
  const material = f.store.get('materials', String(report.lines[0].materialId));
  assert.ok(text.includes(String(material.materialNo)), 'the material number of the first line');
  const source = report.lines[0].warehouseId ? f.store.get('warehouses', String(report.lines[0].warehouseId)) : f.store.get('sites', String(report.lines[0].siteId));
  assert.ok(text.includes(String(source.name)), 'the storehouse, or the project site whose inventory gives the material');
  assert.equal((await f.admin.request(`/pdf/pick-list?reportNo=${report.reportNo}`, { pilot: 'weld' })).status, 403, 'the pick list belongs to MTO Pilot');
  assert.equal((await f.admin.request('/pdf/pick-list?reportNo=nope', { pilot: 'mto' })).status, 404);
  assert.equal((await f.admin.request('/pdf/pick-list', { pilot: 'mto' })).status, 404);
});

// ----- access, both directions, and the pilot boundary --------------------------------------------------------------------------------------------

test('access: documents follow their family key inside the current pilot, both directions', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const weldNone = f.profile('No weld module', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const mtoNone = f.profile('No material module', { generalPermission: RW, materialsPermission: NONE, weldingPermission: RW });
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const noWeld = f.account('Materials only', { profileId: weldNone, weldEnabled: true, weldProfileId: weldNone, mtoEnabled: true, mtoProfileId: writer });
  const noMto = f.account('Welding only', { profileId: mtoNone, weldEnabled: true, weldProfileId: writer, mtoEnabled: true, mtoProfileId: mtoNone });
  const weld = f.client(), mto = f.client(), none = f.client(), noMaterial = f.client(); await weld.login(weldOnly.email); await mto.login(mtoOnly.email); await none.login(noWeld.email); await noMaterial.login(noMto.email);
  const prefab = releaseOf(f.store, 'iso-3', 'Prefab'), pick = pickListReports(rowsOf(f.store))[0];
  const weldDocuments = ['ndt-request?requestNo=R00004', 'ndt-pre-request?requestNo=R00003', 'pwht-request?requestNo=R00006', 'visual-report?reportNo=VT-2026-014', `prefab-release?releaseId=${prefab.id}`, 'hydrotest-request?requestId=hydrotest-cw-1', 'punch-list', 'punch-list-blank?isoId=iso-1', 'flange-report?isoId=iso-1'];
  const mtoDocuments = [`pick-list?reportNo=${pick.reportNo}`];
  for (const path of weldDocuments) {
    await pdf(await weld.request(`/pdf/${path}`, { pilot: 'weld' }));
    await pdf(await f.admin.request(`/pdf/${path}`, { pilot: 'weld' }));
    assert.equal((await weld.request(`/pdf/${path}`, { pilot: 'mto' })).status, 403, `${path}: the weld-only account may not enter MTO Pilot`);
    assert.equal((await mto.request(`/pdf/${path}`, { pilot: 'weld' })).status, 403, `${path}: the MTO-only account may not enter Weld Pilot`);
    assert.equal((await mto.request(`/pdf/${path}`, { pilot: 'mto' })).status, 403, `${path}: MTO Pilot does not carry this document`);
    assert.equal((await f.admin.request(`/pdf/${path}`, { pilot: 'mto' })).status, 403, `${path}: the same account is refused in the other pilot`);
    assert.equal((await f.admin.request(`/pdf/${path}`)).status, 403, `${path}: no pilot`);
    assert.equal((await none.request(`/pdf/${path}`, { pilot: 'weld' })).status, 403, `${path}: no weld rights`);
    await pdf(await noMaterial.request(`/pdf/${path}`, { pilot: 'weld' }));
  }
  for (const path of mtoDocuments) {
    await pdf(await mto.request(`/pdf/${path}`, { pilot: 'mto' }));
    await pdf(await f.admin.request(`/pdf/${path}`, { pilot: 'mto' }));
    assert.equal((await mto.request(`/pdf/${path}`, { pilot: 'weld' })).status, 403, `${path}: the MTO-only account may not enter Weld Pilot`);
    assert.equal((await weld.request(`/pdf/${path}`, { pilot: 'weld' })).status, 403, `${path}: Weld Pilot does not carry the pick list`);
    assert.equal((await weld.request(`/pdf/${path}`, { pilot: 'mto' })).status, 403, `${path}: the weld-only account may not enter MTO Pilot`);
    assert.equal((await noMaterial.request(`/pdf/${path}`, { pilot: 'mto' })).status, 403, `${path}: no material rights`);
    assert.equal((await f.admin.request(`/pdf/${path}`)).status, 403, `${path}: no pilot`);
  }
  // Request documents are attached only through POST and only where the document allows it.
  assert.equal((await weld.request('/pdf/ndt-request?requestNo=R00004', { method: 'POST', pilot: 'weld' })).status, 200);
  assert.equal((await mto.request('/pdf/ndt-request?requestNo=R00004', { method: 'POST', pilot: 'weld' })).status, 403);
  assert.equal((await f.admin.request('/pdf/punch-list', { method: 'POST', pilot: 'weld' })).status, 404);
});

test('pilot boundary: records of a project that is not enabled in the pilot are not printed', async t => {
  const f = await fixture(t);
  const cooling = f.store.get('projects', 'project-cooling');
  f.store.update('projects', cooling.id, { weldPilot: false }, cooling._version, SYSTEM);
  for (const path of ['visual-report?reportNo=VT-2026-014', `prefab-release?releaseId=${releaseOf(f.store, 'iso-3', 'Prefab').id}`, 'hydrotest-request?requestId=hydrotest-cw-1', 'punch-list-blank?isoId=iso-1', 'flange-report?isoId=iso-1', 'flange-report?projectId=project-cooling', 'punch-list?projectId=project-cooling'])
    assert.equal((await f.admin.request(`/pdf/${path}`, { pilot: 'weld' })).status, 404, path);
  const punch = await get(f, 'punch-list');
  assert.ok(!punch.some(line => line.includes('Paint damage') || line.includes('name plates')), 'no punch item of the disabled project');
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R00004', { pilot: 'weld' })).status, 200, 'a request of another project still prints');
  const steam = f.store.get('projects', 'project-steam'); f.store.update('projects', steam.id, { weldPilot: false }, steam._version, SYSTEM);
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R00004', { pilot: 'weld' })).status, 404);
  f.store.update('projects', steam.id, { weldPilot: true }, f.store.get('projects', steam.id)._version, SYSTEM);
  assert.ok((await get(f, 'flange-report?projectId=project-steam')).includes('FL-ST-004'), 'other projects still print');
  const pick = pickListReports(rowsOf(f.store)).find(report => f.store.get('isometrics', report.isoId).projectId === 'project-cooling')!;
  f.store.update('projects', cooling.id, { mtoPilot: false }, f.store.get('projects', cooling.id)._version, SYSTEM);
  assert.equal((await f.admin.request(`/pdf/pick-list?reportNo=${pick.reportNo}`, { pilot: 'mto' })).status, 404);
});

test('other profiles keep behaving as before: the new documents do not exist there', async t => {
  for (const profile of ['full', 'welding-demo', 'access-prototype'] as ReleaseProfile[]) {
    const f = await fixture(t, profile);
    for (const path of ['ndt-request?requestNo=R00004', 'punch-list', 'pick-list?reportNo=x', 'flange-report?isoId=iso-1']) assert.equal((await f.admin.request(`/pdf/${path}`)).status, 404, `${profile} ${path}`);
    assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=x', { method: 'POST' })).status, 404, profile);
  }
});

test('the operational access keys exist only in the hosted profile and are no reports', async t => {
  const f = await fixture(t);
  assert.equal((await f.admin.request('/reports/pdf-ndt-request', { pilot: 'weld' })).status, 404, 'no CSV report behind a document key');
  const bootstrap = await (await f.admin.request('/bootstrap', { pilot: 'weld' })).json() as { user: { availability: { reports: Record<string, string[]> } } };
  assert.ok(Object.keys(bootstrap.user.availability.reports).includes('pdf-picklist'));
  const demo = await fixture(t, 'welding-demo');
  const status = await (await demo.admin.request('/bootstrap')).json() as { user: { availability: { reports: Record<string, string[]> } } };
  assert.ok(!Object.keys(status.user.availability.reports).some(key => key.startsWith('pdf-')));
});

// ----- layout models ------------------------------------------------------------------------------------------------------------------------------------

test('layout model: long documents break between rows, repeat headers, keep header, footer time and page n/N', async t => {
  const f = await fixture(t);
  const stamp = { id: 'x', _version: 1, _archived: false, _createdAt: '2026-01-01T00:00:00Z', _updatedAt: '' };
  for (let i = 0; i < 70; i++) {
    const weld = f.store.create('welds', { weldNo: `Q${String(i).padStart(3, '0')}`, isoId: 'iso-1', typeId: 'weld-type-0' }, SYSTEM);
    f.store.create('inspection_requests', { number: 'R-LONG', weldId: weld.id, type: 'NDT', date: '2026-11-01', status: 'Open', processes: 'RT', note: 'Long request' }, SYSTEM);
    f.store.create('inspection_results', { weldId: weld.id, type: 'VI', reportNo: 'VT-LONG', result: i % 2 ? 'Accepted' : 'Not applicable', date: '2026-11-02', requestId: f.store.list('inspection_requests')[0].id }, SYSTEM);
  }
  const rows = rowsOf(f.store), isoIds = allIsos(rows), company = { company: companyFromRow(rows.company_data[0])!, logo: PNG };
  void stamp;
  const request = requestPdf({ model: requestDocumentModel('ndt-request', rows, 'R-LONG', isoIds, requestDocumentOptions({}).options)!, company, generatedAt: NOW, rows });
  const long = await request;
  assertLayout(long.layout, 'request', { rowsMinimum: 70 });
  assert.ok(long.layout.pages.length >= 2);
  assert.equal(long.layout.pages.flatMap(page => page.rows).length, 70);
  assert.ok(long.layout.pages.every(page => page.images >= 1), 'logo on every page');
  assert.ok(long.layout.pages.at(-1)!.texts.some(item => item.text === 'Requested by'), 'signature boxes after the table');
  const visual = await visualPdf({ model: visualReportModel(rows, 'VT-LONG', isoIds)!, company: null, generatedAt: NOW, rows, signature: { content: PNG, name: 'Morgan Lee' } });
  assertLayout(visual.layout, 'visual', { rowsMinimum: 70 });
  assert.ok(visual.layout.pages.length >= 2 && visual.layout.pages.at(-1)!.images >= 1, 'signature image');
  const release = await releasePdf({ model: releaseDocumentModel(rows, releaseOf(f.store, 'iso-3', 'Prefab').id, isoIds, '2026-11-16')!, company, generatedAt: NOW, rows, signature: null });
  assertLayout(release.layout, 'release', { rowsMinimum: 1 });
  const hydro = await hydrotestPdf({ model: hydrotestDocumentModel(rows, 'hydrotest-cw-1', isoIds)!, company, generatedAt: NOW, rows });
  assertLayout(hydro.layout, 'hydrotest');
  const punchModel = punchListModel(rows, punchListOptions({}).options, isoIds, new Set(rows.projects.map(row => row.id)), '2026-11-16');
  for (let i = 0; i < 80; i++) punchModel.lines.push({ ...punchModel.lines[0], number: String(100 + i) });
  const punch = await punchPdf({ model: punchModel, company, generatedAt: NOW, rows });
  assertLayout(punch.layout, 'punch', { rowsMinimum: 80 });
  assert.ok(punch.layout.pages.length >= 2 && punch.layout.pages[0].width > punch.layout.pages[0].height, 'landscape');
  const blank = await blankPunchPdf({ iso: rows.isometrics.find(row => row.id === 'iso-1')!, company, generatedAt: NOW, rows });
  assertLayout(blank.layout, 'blank punch', { rowsMinimum: 16 });
  assert.equal(blankPunchHeader(rows, rows.isometrics.find(row => row.id === 'iso-1')!).items[0].label, 'Client');
  const flangeModel = flangeReportModel(rows, flangeReportOptions({ projectId: 'project-cooling' }).options, isoIds);
  const flange = await flangePdf({ model: flangeModel, company, generatedAt: NOW, rows });
  assertLayout(flange.layout, 'flange', { rowsMinimum: 3 });
  const pick = await pickListPdf({ model: pickListModel(rows, pickListReports(rows)[0].reportNo, isoIds)!, company, generatedAt: NOW, rows });
  assertLayout(pick.layout, 'pick list', { rowsMinimum: 1 });
  assert.ok(pick.layout.pages.at(-1)!.texts.some(item => item.text === 'Taken by'));
});

test('documents print without company data and without a logo, and never a third-party name', async t => {
  const f = await fixture(t);
  const rows = rowsOf(f.store), isoIds = allIsos(rows);
  const bare = await requestPdf({ model: requestDocumentModel('ndt-request', rows, 'R00004', isoIds, requestDocumentOptions({}).options)!, company: null, generatedAt: NOW, rows });
  const words = bare.layout.pages.flatMap(page => page.texts.map(item => item.text));
  assert.ok(!words.includes('Kestrel Pipe Fabrication B.V.') && bare.layout.pages.every(page => page.images === 0));
  assert.ok(words.includes('NDT request') && words.includes('Client'));
  assert.equal(requestDocumentModel('ndt-request', rows, 'R00004', new Set(), requestDocumentOptions({}).options), null, 'nothing outside the visible isometrics');
});

test('options and models: request options, punch and flange validation, hydrotest by record number', () => {
  assert.deepEqual(requestDocumentOptions({ processes: 'a, b,a', isometrics: '1', note: ' hi ' }).options, { processIds: ['a', 'b'], note: 'hi', isometrics: true });
  assert.equal(requestDocumentOptions({}).options.note, null);
  assert.ok(requestDocumentOptions({ note: 'x'.repeat(2001) }).error);
  assert.ok(punchListOptions({ punchType: 'x' }).error && punchListOptions({ category: 'Q' }).error && punchListOptions({ kpi: 'zzz' }).error && !punchListOptions({ category: 'a', kpi: 'overdue' }).error);
  assert.equal(punchListOptions({}).options.documents, true);
  assert.equal(punchListOptions({ documents: '0' }).options.documents, false);
  assert.ok(flangeReportOptions({}).error && !flangeReportOptions({ isoId: 'x' }).error && flangeReportOptions({ isoId: 'x', finished: 'No' }).options.finished === 'No');
  assert.equal(hydrotestDocumentModel({}, 'x', new Set()), null);
});

test('client: the query of a document dialog, and every menu entry names a document and its access key', () => {
  const options = [{ name: 'processes', label: 'p', kind: 'choices' as const, choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }, { name: 'note', label: 'n', kind: 'textarea' as const }, { name: 'isometrics', label: 'i', kind: 'checkbox' as const }];
  assert.equal(pdfDocumentQuery({ requestNo: 'R-1', empty: '' }, options, { processes: ['a', 'b'], note: '  ', isometrics: false }).toString(), 'requestNo=R-1&isometrics=0', 'all processes and an empty note are not sent');
  assert.equal(pdfDocumentQuery({ requestNo: 'R-1' }, options, { processes: ['b'], note: ' Check film ', isometrics: true }).toString(), 'requestNo=R-1&processes=b&note=Check+film&isometrics=1');
  for (const entry of PDF_MENU) { const definition = PDF_DOCUMENTS.find(item => item.key === entry.key); assert.ok(definition, entry.key); if (definition.scope === 'project') assert.equal(definition.resource, entry.resource, entry.key); else assert.equal(definition.report, entry.report, entry.key); }
});

test('every operational document has an access key that names a resource, and no key is a report', () => {
  const operational = OPERATIONAL_DOCUMENTS;
  for (const item of operational) assert.ok(PDF_DOCUMENTS.includes(item), `${item.key} is registered`);
  assert.equal(operational.length, 14); // + Reserved materials (Isometric execution, mto-iso-execution-017) and Order materials (mto-procurement-014)
  for (const item of operational) { assert.ok(PDF_REPORT_RESOURCES[item.report], `${item.key} -> ${item.report}`); assert.ok(item.report.startsWith('pdf-')); }
  assert.deepEqual(new Set(operational.map(item => item.key)).size, operational.length, 'unique keys');
  const nobody = { id: 'u', name: 'n', email: 'e', profileId: '', permissions: { general: 2, materials: 2, welding: 2, tools: 0, settings: 0 } } as never;
  assert.equal(canReport(nobody, 'pdf-punch', 'export'), true, 'without an availability (full profile) the key follows the resource');
});

test('Visual inspection report: the main project switch Visual Inspection Ver 2 decides the header lines (version 1: Doc.No. & Rev.No. and Procedure No.; version 2: VT type 2 lines and the VT 2 prefix)', async t => {
  const f = await fixture(t);
  const site = f.store.list('sites')[0];
  const off = f.store.update('sites', site.id, { vt2Enabled: false }, site._version, SYSTEM);
  const v1 = await get(f, 'visual-report?reportNo=VT-2026-014');
  for (const label of ['VT-NFY-01 rev B', 'VT Procedure No.', 'PR-VT-004']) assert.ok(v1.includes(label), label);
  for (const label of ['VT type 2 order No', 'PO-44017', 'VT 2 prefix']) assert.ok(!v1.includes(label), `${label} stays off a version 1 report`);
  f.store.update('sites', site.id, { vt2Enabled: true }, off._version, SYSTEM);
  const v2 = await get(f, 'visual-report?reportNo=VT-2026-014');
  for (const label of ['VT type 2 order No', 'PO-44017', 'VT 2 prefix', 'VT2']) assert.ok(v2.includes(label), label);
  assert.ok(!v2.includes('VT Procedure No.') && !v2.includes('PR-VT-004'));
});

test('mto-logistics-004: a confirmed request with two spools of two projects yields the Service request and the Release note, two project groups each and three signature blocks', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-service-docs-'));
  const store = new Store(':memory:'); seed(store); seedMtoLogistics(store, SYSTEM);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const documents = documentStorage(store, dir, 'database');
  const iso7 = store.get('isometrics', 'iso-7'); store.update('isometrics', 'iso-7', { assetTag: 'TAG-07', tracing: 'ST-2', paintSpec: 'A10', pwht: true }, iso7._version, SYSTEM);
  const head = runAction(store, 'service', { spoolIds: ['spool-1', 'spool-7'], companyId: 'service-pwht', note: 'Pick up Monday' }, { id: 'u1', name: 'Matej Spisak' }).records![0];
  const rows = Object.fromEntries(RESOURCES.map(resource => [resource.key, store.list(resource.key, true)])) as Record<string, Row[]>;
  const request = requestOf(rows, head.id)!;
  const model = serviceRequestDocumentData(rows, request);
  assert.deepEqual(model.groups.map(group => group.project).sort(), [String(store.get('projects', 'project-cooling').internnumber), String(store.get('projects', 'project-skid').internnumber)].sort());
  const skid = model.groups.find(group => group.projectId === 'project-skid')!;
  assert.deepEqual(skid.lines[0].slice(1), [String(store.get('isometrics', 'iso-7').isoNo), 'TAG-07', String(store.get('isometrics', 'iso-7').drawingNo ?? ''), 'SP-007', String(store.get('spools', 'spool-7').diameter ?? ''), 'A10', 'YES', String(store.get('isometrics', 'iso-7').chemicalClean ?? ''), 'YES']);
  assert.equal(tracingFlag(''), 'NO'); assert.equal(tracingFlag('N/A'), 'NO'); assert.equal(tracingFlag('ST-2'), 'YES');
  assert.match(serviceRequestFileBase(request.date, siteNumber(rows.sites, request.siteId), request.number), /^\d{8}_S[1-9]\d*_R\d{5}$/);
  assert.equal(serviceRequestFileBase('2024-06-28', 1, '00002'), '20240628_S1_R00002');
  const texts = (layout: Layout) => layout.pages.flatMap(page => page.texts.map(item => item.text));
  const input = { model, company: null, generatedAt: new Date('2026-11-16T10:00:00Z'), qr: `request_id=${head.id}` };
  const serviceRequest = await serviceRequestPdf(input);
  for (const label of ['Service request', 'Report no.', 'Company', 'Added by', 'Date', 'Note', 'Pick up Monday', 'Matej Spisak', ...SERVICE_REQUEST_COLUMNS]) assert.ok(texts(serviceRequest.layout).includes(label), label);
  assert.equal(texts(serviceRequest.layout).filter(text => text.startsWith('Project: ')).length, 2, 'two project groups');
  assert.ok(serviceRequest.layout.pages[0].images >= 1, 'the QR code');
  const release = await coatingReleasePdf(input);
  for (const page of release.layout.pages) for (const title of ['Contractor / Supplier', 'Client', 'NoBo']) assert.ok(page.texts.some(item => item.text === title), `${title} in the footer of every page`);
  assert.equal(texts(release.layout).filter(text => text.startsWith('Project: ')).length, 2);
  assert.ok(texts(release.layout).includes('Release note'));
  // Signed: names, dates and the three images go into the footer.
  const png = new Uint8Array(PNG);
  const signed = await coatingReleasePdf({ ...input, signatures: { contractor: { name: 'Ivo Contractor', date: '2026-11-12', image: png }, client: { name: 'Ana Client', date: '2026-11-12', image: png }, nobo: { name: 'Nora NoBo', date: '2026-11-13', image: png } } });
  for (const text of ['Ivo Contractor', 'Ana Client', 'Nora NoBo', '13.11.2026.']) assert.ok(texts(signed.layout).includes(text), text);
  assert.equal(signed.layout.pages[0].images - release.layout.pages[0].images, 3, 'three signature images');
  // Both files through the server builder, named after the request.
  const built = await buildServiceRequestDocuments(store, documents, rows, request, new Date());
  assert.match(built.serviceRequest.name, /^\d{8}_S\d+_R\d{5}-ServiceRequest\.pdf$/); assert.match(built.coatingRelease.name, /^\d{8}_S\d+_R\d{5}-CoatingRelease\.pdf$/);
  assert.equal(Buffer.from(built.serviceRequest.bytes).subarray(0, 5).toString('latin1'), '%PDF-');
  // Include isometric drawings in PDF: the drawing of each isometric is appended.
  const drawing = await serviceRequestPdf({ ...input, drawings: [{ name: 'iso-7.png', bytes: png }] });
  assert.equal(drawing.appended, 1); assert.equal((await readPdf(drawing.bytes)).pages.length, serviceRequest.layout.pages.length + 1);
});
