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
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';
import { inspectionCellState, REQUEST_DOCUMENT } from '../shared/inspections.ts';
import { pickListReports } from '../shared/mto-logistics.ts';
import { engineerSignerId, hydrotestDocumentModel, releaseDocumentModel, releaseSignatureBlock, requestDocumentModel, requestDocumentOptions, visualReportModel, weldInspectionState } from '../shared/pdf-documents.ts';
import { blankPunchHeader, flangeReportModel, flangeReportOptions, pickListModel, punchListModel, punchListOptions } from '../shared/pdf-lists.ts';
import { companyFromRow } from '../shared/pdf-company.ts';
import { requestPdf, visualPdf } from '../server/pdf/operational-requests.ts';
import { hydrotestPdf, releasePdf } from '../server/pdf/operational-release.ts';
import { blankPunchPdf, flangePdf, pickListPdf, punchPdf } from '../server/pdf/operational-lists.ts';
import { FOOTER_HEIGHT, type Layout } from '../server/pdf/engine.ts';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';
import { pdfDocumentQuery } from '../client/pdf-documents.tsx';
import { PDF_MENU } from '../client/pdf-reports.tsx';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
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
  const upload = (as: ReturnType<typeof client>, pilot: string, entityType: string, entityId: string, content: Uint8Array | string, name: string, type: string) => {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); body.set('file', new Blob([content as BlobPart], { type }), name);
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
  const text = await get(f, 'ndt-request?requestNo=R-2026-0004');
  for (const label of ['NDT request', 'Request R-2026-0004', 'Client', 'Intern prj. no.', 'Request no.', 'Request date', 'NDT location', 'Processes', 'Weld no.', 'Type', 'Dia.', 'Wall thk.', 'Material', 'WPS', 'Welder', 'Weld date', 'Note', 'Requested by', 'Received by', 'Kestrel Pipe Fabrication B.V.']) assert.ok(text.includes(label), label);
  for (const id of ['weld-22', 'weld-23', 'weld-24']) assert.ok(text.includes(weldNo(f.store, id)), id);
  assert.ok(text.includes('RT, UT') && text.includes('Radiography of the field closing welds; UT where film access is limited.'));
  assert.ok(text.some(line => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(line)) && text.includes('1/1'));
  assert.ok(!text.includes('Test system') && !text.includes('Rev.'), 'no isometric list unless asked');
  const asked = await get(f, 'ndt-request?requestNo=R-2026-0004&isometrics=1');
  assert.ok(asked.includes('ISO number') && asked.includes('Drawing no.') && asked.includes('Test system'));
  const onlyRt = await get(f, 'ndt-request?requestNo=R-2026-0004&processes=ndt-0');
  assert.ok(onlyRt.includes('RT') && !onlyRt.includes('RT, UT'));
  const noted = await get(f, `ndt-request?requestNo=R-2026-0004&note=${encodeURIComponent('Film density as per procedure.')}`);
  assert.ok(noted.includes('Film density as per procedure.') && !noted.includes('Radiography of the field closing welds; UT where film access is limited.'));
  assert.equal((await f.admin.request(`/pdf/ndt-request?requestNo=R-2026-0004&note=${'x'.repeat(2001)}`, { pilot: 'weld' })).status, 422);
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R-2026-0003', { pilot: 'weld' })).status, 404, 'an NDT Pre request is not an NDT request');
  assert.equal((await f.admin.request('/pdf/ndt-request', { pilot: 'weld' })).status, 404);
  assert.match((await f.admin.request('/pdf/ndt-request?requestNo=R-2026-0004', { pilot: 'weld' })).headers.get('content-disposition') || '', new RegExp(`filename="${TODAY}-STX-2402-NDT-request-R-2026-0004\\.pdf"`));
});

test('NDT Pre request and Pre-HT/PWHT request print their own types and processes', async t => {
  const f = await fixture(t);
  const pre = await get(f, 'ndt-pre-request?requestNo=R-2026-0003');
  for (const label of ['NDT Pre request', 'Request R-2026-0003', 'MT', 'Magnetic particle test of the root and hot pass before capping.']) assert.ok(pre.includes(label), label);
  for (const id of ['weld-22', 'weld-24']) assert.ok(pre.includes(weldNo(f.store, id)));
  assert.ok(!pre.includes(weldNo(f.store, 'weld-23')), 'only the welds of that request');
  const pwht = await get(f, 'pwht-request?requestNo=R-2026-0006');
  for (const label of ['Pre-HT / PWHT request', 'PWHT location', 'PWHT process', 'Heat treatment cycle as specified in the WPS; chart recorder required.']) assert.ok(pwht.includes(label), label);
  assert.ok(pwht.includes(weldNo(f.store, 'weld-20')));
  assert.ok((await get(f, 'pwht-request?requestNo=R-2026-0005')).includes(weldNo(f.store, 'weld-2')), 'Pre-HT requests print too');
  assert.equal((await f.admin.request('/pdf/pwht-request?requestNo=R-2026-0004', { pilot: 'weld' })).status, 404);
});

test('a request document is attached to its requests as "Request document" (POST only), and the weld cell finds it', async t => {
  const f = await fixture(t);
  const before = f.store.list('attachments').length;
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R-2026-0004', { pilot: 'weld' })).status, 200);
  assert.equal(f.store.list('attachments').length, before, 'GET does not store anything');
  const response = await f.admin.request('/pdf/ndt-request?requestNo=R-2026-0004', { method: 'POST', pilot: 'weld' });
  const bytes = await pdf(response);
  assert.equal(response.headers.get('x-attached'), '3');
  const files = f.store.list('attachments').filter(file => file.documentType === REQUEST_DOCUMENT);
  assert.equal(files.length, 3);
  const requests = f.store.list('inspection_requests').filter(row => row.number === 'R-2026-0004');
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
  const printed = await other.request('/pdf/ndt-request?requestNo=R-2026-0004', { pilot: 'weld' });
  await pdf(printed);
  assert.equal((await other.request('/pdf/ndt-request?requestNo=R-2026-0004', { method: 'POST', pilot: 'weld' })).status, 403, 'a reader may print but not attach');
  assert.equal(f.store.list('attachments').filter(file => file.documentType === REQUEST_DOCUMENT).length, 0);
});

// ----- visual inspection report ------------------------------------------------------------------------------------------------

test('Visual inspection report: ITP, activity, engineer with stamp, VT fields of the main project, welds and signature', async t => {
  const f = await fixture(t);
  const path = 'visual-report?reportNo=VT-2026-014';
  const text = await get(f, path);
  for (const label of ['Visual inspection report', 'Report VT-2026-014', 'ITP', 'ITP 1', 'Activity no.', '4.2', 'Custom no.', 'NFY-VT-07', 'QA/QC engineer', 'Morgan Lee - stamp ML-07', 'Inspection date', 'Rev.No.', 'VT-NFY-01 rev B', 'VT Procedure No.', 'PR-VT-004', 'VT type 2 order No', 'PO-44017', 'Accepted', 'applicable', 'Weld no.', 'Reviewed by']) assert.ok(text.includes(label), label);
  for (const id of ['weld-1', 'weld-10', 'weld-19']) assert.ok(text.includes(weldNo(f.store, id)), id);
  assert.equal(text.filter(line => line === 'X').length, 3, 'one mark per weld');
  assert.ok(text.includes('15.06.2026'), 'VT type 2 date prints as dd.mm.yyyy');
  assert.equal((await f.admin.request('/pdf/visual-report?reportNo=NOPE', { pilot: 'weld' })).status, 404);
  const before = await pdf(await f.admin.request(`/pdf/${path}`, { pilot: 'weld' }));
  assert.ok(!hasImage(before), 'no signature when the engineer has none');
  const engineer = f.store.get('qa_engineers', 'qa-1');
  f.store.update('qa_engineers', engineer.id, { email: 'pdf-docs-admin@example.test' }, engineer._version, SYSTEM);
  const me = f.store.list('users').find(user => user.email === 'pdf-docs-admin@example.test')!;
  const created = await f.admin.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Pdf admin', userId: me.id, kind: 'Full signature', nameUnder: true } });
  const record = (await created.json() as { record: Row }).record;
  assert.equal((await f.upload(f.admin, 'weld', 'signatures', record.id, PNG, 'full.png', 'image/png')).status, 201);
  const signed = await pdf(await f.admin.request(`/pdf/${path}`, { pilot: 'weld' }));
  assert.ok(hasImage(signed), 'the engineer\'s signature image');
  assert.ok((await textOf(signed)).includes('Pdf admin'), 'name under the signature');
});

test('the engineer signature is found through the matching user, else not at all', () => {
  const users = [{ id: 'u1', email: 'a@x.test', name: 'A' }, { id: 'u2', email: 'quality@example.com', name: 'Someone' }] as unknown as Row[];
  assert.equal(engineerSignerId({ id: 'e', email: 'QUALITY@example.com', name: 'Morgan' } as unknown as Row, users), 'u2');
  assert.equal(engineerSignerId({ id: 'e', email: '', name: 'a' } as unknown as Row, users), 'u1');
  assert.equal(engineerSignerId({ id: 'e', email: '', name: 'Nobody' } as unknown as Row, users), '');
  assert.equal(engineerSignerId(undefined, users), '');
});

// ----- release documents ----------------------------------------------------------------------------------------------------------

const releaseOf = (store: Store, isoId: string, type: string) => store.list('releases').find(row => row.isoId === isoId && row.type === type && row.status !== 'Reopened')!;

test('Prefab and Field release: document number, isometric box, welds of the phase with their NDT state, punch summary, six signature titles', async t => {
  const f = await fixture(t);
  const prefab = releaseOf(f.store, 'iso-3', 'Prefab'), field = releaseOf(f.store, 'iso-3', 'Field');
  const text = await get(f, `prefab-release?releaseId=${prefab.id}`);
  for (const label of ['Prefab release', 'Document DWG-2403-STX-CW-003', 'Document no.', 'Release no.', 'Report no.', 'PFR-002', 'Release date', 'Drawing no.', 'NDT (Pre)', 'NDT', 'Pre-HT/PWHT', 'Punch summary', 'Pre-punch', 'Punch', 'Open', 'Finished', 'Accepted', 'RT-2026-003']) assert.ok(text.includes(label), label);
  assert.ok(text.some(line => line.startsWith('Welds - shop')));
  const site = f.store.get('sites', 'site-north');
  for (const name of ['signSubQaqc', 'signSubConstruction', 'signPrincipalUi', 'signContractorQaqc', 'signContractorConstruction', 'signNobo']) if (site[name]) assert.ok(text.includes(String(site[name])), String(site[name]));
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-3'), location = (weld: Row) => String(f.store.get('weld_types', String(weld.typeId)).location);
  for (const weld of welds.filter(weld => location(weld) === 'Shop')) assert.ok(text.includes(String(weld.weldNo)), `shop ${weld.weldNo}`);
  for (const weld of welds.filter(weld => location(weld) === 'Field')) assert.ok(!text.includes(String(weld.weldNo)), `no field ${weld.weldNo} on the prefab release`);
  const fieldText = await get(f, `field-release?releaseId=${field.id}`);
  assert.ok(fieldText.includes('Field release') && fieldText.some(line => line.startsWith('Welds - field')) && fieldText.includes('FLR-001'));
  for (const weld of welds.filter(weld => location(weld) === 'Field')) assert.ok(fieldText.includes(String(weld.weldNo)));
  assert.equal((await f.admin.request(`/pdf/field-release?releaseId=${prefab.id}`, { pilot: 'weld' })).status, 422, 'a prefab release is not printed as a field release');
  const hydro = f.store.list('releases').find(row => row.type === 'Hydrotest')!;
  assert.equal((await f.admin.request(`/pdf/prefab-release?releaseId=${hydro.id}`, { pilot: 'weld' })).status, 404);
  assert.equal((await f.admin.request('/pdf/prefab-release?releaseId=missing', { pilot: 'weld' })).status, 404);
});

test('a release keeps the numbering and signature titles it was made with; a reopened release says so; the signature goes in one block', async t => {
  const f = await fixture(t);
  const release = releaseOf(f.store, 'iso-3', 'Prefab');
  const site = f.store.get('sites', 'site-north');
  f.store.update('sites', site.id, { prefix: 'ZZZ', releaseDocDrawing: 'Prefix + iso', signNobo: 'Changed after the release' }, site._version, SYSTEM);
  const text = await get(f, `prefab-release?releaseId=${release.id}`);
  assert.ok(text.includes('Document DWG-2403-STX-CW-003') && !text.includes('Changed after the release'), 'stored numbering and titles');
  const reopened = f.store.list('releases').find(row => row.status === 'Reopened')!;
  const reopenedText = await get(f, `prefab-release?releaseId=${reopened.id}`);
  assert.ok(reopenedText.some(line => line.includes('reopened')) && reopenedText.includes('Status'));
  assert.ok(!hasImage(await pdf(await f.admin.request(`/pdf/prefab-release?releaseId=${release.id}`, { pilot: 'weld' }))));
  const me = f.store.list('users').find(user => user.email === 'pdf-docs-admin@example.test')!;
  const created = await f.admin.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Pdf admin', userId: me.id, kind: 'Full signature', nameUnder: true } });
  const record = (await created.json() as { record: Row }).record;
  assert.equal((await f.upload(f.admin, 'weld', 'signatures', record.id, PNG, 'full.png', 'image/png')).status, 201);
  f.store.update('releases', release.id, { signatureId: record.id }, f.store.get('releases', release.id)._version, SYSTEM);
  const signed = await pdf(await f.admin.request(`/pdf/prefab-release?releaseId=${release.id}`, { pilot: 'weld' }));
  assert.ok(hasImage(signed), 'the signature image of the releasing signer');
  assert.ok((await textOf(signed)).includes('Pdf admin'), 'name under the signature');
  assert.equal(releaseSignatureBlock([{ label: 'Principal UI', title: 'x' }, { label: 'Subcontractor QA/QC', title: 'y' }]), 1);
  assert.equal(releaseSignatureBlock([{ label: 'NoBo', title: 'x' }]), 0);
  assert.equal(releaseSignatureBlock([]), -1);
});

test('release document number without stored data follows the main project settings', () => {
  const stamp = { _version: 1, _archived: false, _createdAt: '2026-01-01T00:00:00Z', _updatedAt: '' };
  const rows = { releases: [{ id: 'r1', isoId: 'i1', type: 'Prefab', ...stamp }], isometrics: [{ id: 'i1', isoNo: 'ISO-7', drawingNo: 'DW-9', projectId: 'p1', ...stamp }], projects: [{ id: 'p1', siteId: 's1', ...stamp }], sites: [{ id: 's1', prefix: 'AB', releaseDocDrawing: 'Prefix + iso', signSubQaqc: 'QA', ...stamp }] } as unknown as Record<string, Row[]>;
  const model = releaseDocumentModel(rows, 'r1', new Set(['i1']))!;
  assert.equal(model.docNo, 'AB-ISO-7');
  assert.deepEqual(model.signatureTitles.map(entry => entry.title), ['QA']);
  assert.equal(model.punch, null, 'without punch rows there is no punch summary');
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

test('Hydrotest request: every field of the request and the isometrics of the test system', async t => {
  const f = await fixture(t);
  const text = await get(f, 'hydrotest-request?requestId=hydrotest-cw-1');
  for (const label of ['Hydrotest request', 'Record HTR-CW-01', 'Test system', 'Test record no.', 'QA/QC engineer', 'Morgan Lee - stamp ML-07', 'Date', 'Pump type', 'Hose type', 'Manifold', 'Pressure gauge no.', 'Recorder No', 'Calibration cert', 'Piping class', 'Design code', 'Test medium',
    'Required test pressure', 'Actual test pressure', 'Test start', 'Test end', 'Area temp', 'Test duration', 'Required leak test pressure', 'Leak test duration', 'Include isometrics', 'Result', 'Notes', 'Execution Plan', 'HEP-NFY-001 rev 2', '15.2 bar', 'PG-1187', 'CAL-2026-0312', 'ASME B31.3', 'Passed', 'No visible leaks, pressure held for the full duration.', 'Client representative', 'ISO number', 'Test pressure']) assert.ok(text.includes(label), label);
  const isos = f.store.list('isometrics').filter(row => row.testSystemId === 'test-cw');
  assert.ok(isos.length >= 1);
  for (const iso of isos) assert.ok(text.includes(String(iso.isoNo)), String(iso.isoNo));
  const without = await get(f, 'hydrotest-request?requestId=hydrotest-cw-1&isometrics=0');
  assert.ok(!without.includes('ISO number'));
  assert.ok((await get(f, 'hydrotest-request?requestId=HTR-ST-01')).includes('HTR-ST-01'), 'by record number too');
  assert.equal((await f.admin.request('/pdf/hydrotest-request?requestId=missing', { pilot: 'weld' })).status, 404);
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
  assert.ok(text.includes(String(f.store.get('warehouses', String(report.lines[0].warehouseId)).name)), 'storehouse');
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
  const weldDocuments = ['ndt-request?requestNo=R-2026-0004', 'ndt-pre-request?requestNo=R-2026-0003', 'pwht-request?requestNo=R-2026-0006', 'visual-report?reportNo=VT-2026-014', `prefab-release?releaseId=${prefab.id}`, 'hydrotest-request?requestId=hydrotest-cw-1', 'punch-list', 'punch-list-blank?isoId=iso-1', 'flange-report?isoId=iso-1'];
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
  assert.equal((await weld.request('/pdf/ndt-request?requestNo=R-2026-0004', { method: 'POST', pilot: 'weld' })).status, 200);
  assert.equal((await mto.request('/pdf/ndt-request?requestNo=R-2026-0004', { method: 'POST', pilot: 'weld' })).status, 403);
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
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R-2026-0004', { pilot: 'weld' })).status, 200, 'a request of another project still prints');
  const steam = f.store.get('projects', 'project-steam'); f.store.update('projects', steam.id, { weldPilot: false }, steam._version, SYSTEM);
  assert.equal((await f.admin.request('/pdf/ndt-request?requestNo=R-2026-0004', { pilot: 'weld' })).status, 404);
  f.store.update('projects', steam.id, { weldPilot: true }, f.store.get('projects', steam.id)._version, SYSTEM);
  assert.ok((await get(f, 'flange-report?projectId=project-steam')).includes('FL-ST-004'), 'other projects still print');
  const pick = pickListReports(rowsOf(f.store)).find(report => f.store.get('isometrics', report.isoId).projectId === 'project-cooling')!;
  f.store.update('projects', cooling.id, { mtoPilot: false }, f.store.get('projects', cooling.id)._version, SYSTEM);
  assert.equal((await f.admin.request(`/pdf/pick-list?reportNo=${pick.reportNo}`, { pilot: 'mto' })).status, 404);
});

test('other profiles keep behaving as before: the new documents do not exist there', async t => {
  for (const profile of ['full', 'welding-demo', 'access-prototype'] as ReleaseProfile[]) {
    const f = await fixture(t, profile);
    for (const path of ['ndt-request?requestNo=R-2026-0004', 'punch-list', 'pick-list?reportNo=x', 'flange-report?isoId=iso-1']) assert.equal((await f.admin.request(`/pdf/${path}`)).status, 404, `${profile} ${path}`);
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
  const bare = await requestPdf({ model: requestDocumentModel('ndt-request', rows, 'R-2026-0004', isoIds, requestDocumentOptions({}).options)!, company: null, generatedAt: NOW, rows });
  const words = bare.layout.pages.flatMap(page => page.texts.map(item => item.text));
  assert.ok(!words.includes('Kestrel Pipe Fabrication B.V.') && bare.layout.pages.every(page => page.images === 0));
  assert.ok(words.includes('NDT request') && words.includes('Client'));
  assert.equal(requestDocumentModel('ndt-request', rows, 'R-2026-0004', new Set(), requestDocumentOptions({}).options), null, 'nothing outside the visible isometrics');
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
  for (const entry of PDF_MENU) { const definition = PDF_DOCUMENTS.find(item => item.key === entry.key); assert.ok(definition, entry.key); assert.equal(definition.report, entry.report, entry.key); }
});

test('every operational document has an access key that names a resource, and no key is a report', () => {
  const operational = PDF_DOCUMENTS.filter(item => !item.key.startsWith('lisl'));
  assert.equal(operational.length, 11);
  for (const item of operational) { assert.ok(PDF_REPORT_RESOURCES[item.report], `${item.key} -> ${item.report}`); assert.ok(item.report.startsWith('pdf-')); }
  assert.deepEqual(new Set(operational.map(item => item.key)).size, operational.length, 'unique keys');
  const nobody = { id: 'u', name: 'n', email: 'e', profileId: '', permissions: { general: 2, materials: 2, welding: 2, tools: 0, settings: 0 } } as never;
  assert.equal(canReport(nobody, 'pdf-punch', 'export'), true, 'without an availability (full profile) the key follows the resource');
});
