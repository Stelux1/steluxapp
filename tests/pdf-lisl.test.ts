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
import { HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { lislModel, lislNdtCells } from '../shared/pdf-lisl.ts';
import { companyFromRow } from '../shared/pdf-company.ts';
import type { Row } from '../shared/types.ts';
import { readPdf } from './pdf-helpers.ts';

const PASSWORD = 'Pdf-Test-Password';
const RW = 'Read & write', NONE = 'No access';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

type Options = { method?: string; pilot?: string; data?: unknown };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-pdf-'));
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
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Pdf admin', email: 'pdf-admin@example.test', password: PASSWORD } })).status, 201);
  const upload = (as: ReturnType<typeof client>, pilot: string, entityType: string, entityId: string, content: Uint8Array | string, name: string, type: string) => {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); body.set('file', new Blob([content as BlobPart], { type }), name);
    return as.request('/files', { method: 'POST', pilot, data: body });
  };
  return { store, client, admin, profile, account, upload };
}
const pdf = async (response: Response) => { assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf'); const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-'); return bytes; };
const hasImage = (bytes: Uint8Array) => Buffer.from(bytes).includes('/Subtype /Image');
const TODAY = new Date().toISOString().slice(0, 10);

const COMPANY = { name: 'Kestrel Pipe Fabrication B.V.', address: 'Havenstraat 112', zip: '3089 KB', residence: 'Rotterdam', phone: '+31 10 555 0100' };

test('LISL Report: golden structure of the A4 document, company block, weld rows and acceptance boxes', async t => {
  const f = await fixture(t);
  const iso = f.store.get('isometrics', 'iso-1'), welds = f.store.list('welds').filter(row => row.isoId === iso.id);
  assert.ok(welds.length >= 2);
  const plain = await f.admin.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' });
  assert.equal(plain.headers.get('cache-control'), 'no-store');
  assert.match(plain.headers.get('content-disposition') || '', new RegExp(`filename="${TODAY}-STX-2401-LISL\\.pdf"`));
  const first = await readPdf(await pdf(plain));
  assert.equal(first.pages.length, 1);
  assert.deepEqual([first.pages[0].width, first.pages[0].height], [595, 842]);
  const text = first.pages[0].text;
  for (const weld of welds) assert.ok(text.includes(String(weld.weldNo)), String(weld.weldNo));
  for (const label of ['ISO STX-CW-001 - LISL Report', 'Client', 'Intern prj. no.', 'Extern prj. no.', 'Project description', 'Iso number', 'ITP No', 'Asset tag', 'NoBo Reg. no.', 'PED Cat.-Mod', 'X Ray %', 'Piping class', 'Test system', 'WN', 'Type', 'Ind. no.', 'Pos /', 'Dia./', 'WT', 'Sch.', 'Chg.No.', 'WPS', 'Welder', 'Date', 'NDT', 'Rp/Nr.', 'PWHT', 'Rp/Nr.', 'Acceptance / examine prefabrication', 'Acceptance / examine assembly', 'NoBo', 'Date:'])
    assert.ok(text.includes(label), label);
  assert.ok(text.includes('STX-2401') && text.includes('STX-CW-001 Rev. 2'), 'project number and revision');
  assert.ok(text.some(line => /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(line)) && text.includes('1/1'), 'footer');
  assert.ok(!text.includes(COMPANY.name), 'no company block without company data, and no placeholder text');
  assert.ok(text.includes('RT-2026-001') || welds.every(weld => !f.store.list('inspection_results').some(row => row.weldId === weld.id)), 'NDT report numbers are printed');

  f.store.create('company_data', { ...COMPANY, address2: 'Unit 4', logoHeight: 18 }, { id: 'test', name: 'test' });
  const branded = (await readPdf(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' })))).pages[0].text;
  for (const line of [COMPANY.name, COMPANY.address, 'Unit 4', '3089 KB Rotterdam', 'Tel. +31 10 555 0100']) assert.ok(branded.includes(line), line);
});

test('Shop / Field options filter by weld type location; "Weld record" off leaves the recorded cells empty', async t => {
  const f = await fixture(t);
  const location = (weld: Row) => String(f.store.get('weld_types', String(weld.typeId)).location);
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-1');
  const field = welds.filter(weld => location(weld) === 'Field'), shop = welds.filter(weld => location(weld) === 'Shop');
  assert.ok(field.length && shop.length);
  const printed = async (query: string) => (await readPdf(await pdf(await f.admin.request(`/pdf/lisl?isoId=iso-1&${query}`, { pilot: 'weld' })))).pages.flatMap(page => page.text);
  const onlyField = await printed('type=Field'), onlyShop = await printed('type=Shop'), all = await printed('type=All');
  for (const weld of field) { assert.ok(onlyField.includes(String(weld.weldNo))); assert.ok(!onlyShop.includes(String(weld.weldNo))); }
  for (const weld of shop) { assert.ok(onlyShop.includes(String(weld.weldNo))); assert.ok(!onlyField.includes(String(weld.weldNo))); }
  for (const weld of welds) assert.ok(all.includes(String(weld.weldNo)));
  assert.equal((await f.admin.request('/pdf/lisl?isoId=iso-1&type=Everything', { pilot: 'weld' })).status, 422);
  const dated = welds.find(weld => weld.date)!;
  const recorded = await printed('weldRecord=1'), blank = await printed('weldRecord=0');
  const printedDate = String(dated.date).split('-').reverse().join('.');
  assert.ok(recorded.includes(printedDate)); assert.ok(!blank.includes(printedDate)); assert.ok(blank.includes(String(dated.weldNo)));
  assert.ok(!blank.some(line => /^RT-/.test(line)));
});

test('LISL Report (A3) is landscape with attest number and NDT PRE columns; the blank template keeps the frame with empty rows', async t => {
  const f = await fixture(t);
  const a3 = (await readPdf(await pdf(await f.admin.request('/pdf/lisl-a3?isoId=iso-1', { pilot: 'weld' })))).pages[0];
  assert.deepEqual([a3.width, a3.height], [1191, 842]);
  for (const label of ['LISL Report', 'Attest number', 'PRE 1', 'PRE 5', 'NDT Rp/Nr.', 'WN', 'Welder']) assert.ok(a3.text.includes(label), label);
  assert.equal(a3.text.filter(line => line === 'NDT Rp/Nr.').length, 10);
  const blank = await f.admin.request('/pdf/lisl-blank?isoId=iso-1', { pilot: 'weld' });
  assert.match(blank.headers.get('content-disposition') || '', /-LISL-template\.pdf/);
  const page = (await readPdf(await pdf(blank))).pages[0];
  assert.deepEqual([page.width, page.height], [595, 842]);
  for (const label of ['Iso number', 'Chg.No.', 'Acceptance / examine assembly']) assert.ok(page.text.includes(label), label);
  for (const weld of f.store.list('welds').filter(row => row.isoId === 'iso-1')) assert.ok(!page.text.includes(String(weld.weldNo)), 'no weld rows on the blank template');
});

test('a long weld list continues on further pages with the header blocks and the table header repeated', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 60; i++) f.store.create('welds', { weldNo: `X${String(i).padStart(3, '0')}`, isoId: 'iso-1', typeId: 'weld-type-1' }, { id: 'test', name: 'test' });
  const document = await readPdf(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' })));
  assert.ok(document.pages.length >= 2);
  document.pages.forEach((page, index) => {
    for (const label of ['ISO STX-CW-001 - LISL Report', 'Iso number', `${index + 1}/${document.pages.length}`]) assert.ok(page.text.includes(label), `${label} on page ${index + 1}`);
    if (page.text.some(line => /^X\d{3}$/.test(line))) assert.ok(page.text.includes('Chg.No.'), `table header on page ${index + 1}`);
  });
  const numbers = document.pages.flatMap(page => page.text.filter(line => /^X\d{3}$/.test(line)));
  assert.equal(numbers.length, 60); assert.equal(new Set(numbers).size, 60);
  assert.ok(document.pages.at(-1)!.text.includes('Acceptance / examine assembly'));
});

test('signature on each page: the current user\'s short signature image is placed when saved, nothing when not', async t => {
  const f = await fixture(t);
  const withoutSignature = await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1&signature=1', { pilot: 'weld' }));
  assert.ok(!hasImage(withoutSignature), 'no signature saved: the line stays empty');
  const me = f.store.list('users').find(user => user.email === 'pdf-admin@example.test')!;
  const created = await f.admin.request('/records/signatures', { method: 'POST', pilot: 'weld', data: { name: 'Pdf admin', userId: me.id, kind: 'Short signature', nameUnder: true } });
  const record = (await created.json() as { record: Row }).record;
  assert.equal((await f.upload(f.admin, 'weld', 'signatures', record.id, PNG, 'short.png', 'image/png')).status, 201);
  assert.ok(hasImage(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1&signature=1', { pilot: 'weld' }))));
  assert.ok(!hasImage(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1&signature=0', { pilot: 'weld' }))), 'only with the option');
  const named = (await readPdf(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1&signature=1', { pilot: 'weld' })))).pages[0].text;
  assert.ok(named.includes('Pdf admin'), 'name under the signature');
});

test('company data: administrators only, one record, logo validated and printed on the document', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const editor = f.account('Weld editor', { profileId: writer, mtoEnabled: false }), other = f.client(); await other.login(editor.email);
  const mine = await f.admin.request('/records/company_data', { method: 'POST', pilot: 'weld', data: { name: COMPANY.name, address: COMPANY.address, logoHeight: 20 } });
  assert.equal(mine.status, 201); const record = (await mine.json() as { record: Row }).record;
  assert.equal((await f.admin.request('/records/company_data', { method: 'POST', pilot: 'weld', data: { name: 'Second' } })).status, 409, 'one company record');
  assert.equal((await other.request('/records/company_data', { pilot: 'weld' })).status, 403, 'not readable by a non-administrator');
  assert.equal((await other.request('/records/company_data', { method: 'POST', pilot: 'weld', data: { name: 'Mine' } })).status, 403);
  assert.equal((await f.upload(f.admin, 'weld', 'company_data', record.id, 'not an image', 'logo.png', 'image/png')).status, 422);
  assert.equal((await f.upload(f.admin, 'weld', 'company_data', record.id, PNG, 'logo.gif', 'image/gif')).status, 422);
  assert.equal((await f.upload(other, 'weld', 'company_data', record.id, PNG, 'logo.png', 'image/png')).status, 403);
  assert.ok(!hasImage(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' }))));
  assert.equal((await f.upload(f.admin, 'weld', 'company_data', record.id, PNG, 'logo.png', 'image/png')).status, 201);
  assert.ok(hasImage(await pdf(await f.admin.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' }))), 'the logo is printed');
  assert.equal(companyFromRow({ ...record, logoHeight: 500 } as Row)?.logoHeightMm, 40, 'logo height is bounded');
  assert.equal(companyFromRow({ ...record, name: ' ' } as Row), null, 'no name, no company block');
});

test('access: the PDF follows the LISL report rules inside the current pilot, both directions', async t => {
  const f = await fixture(t);
  const writer = f.profile('Writer', { generalPermission: RW, materialsPermission: RW, weldingPermission: RW });
  const weldNone = f.profile('No weld module', { generalPermission: RW, materialsPermission: RW, weldingPermission: NONE });
  const weldOnly = f.account('Weld only', { profileId: writer, weldEnabled: true, weldProfileId: writer, mtoEnabled: false });
  const mtoOnly = f.account('MTO only', { profileId: writer, weldEnabled: false, mtoEnabled: true, mtoProfileId: writer });
  const noReport = f.account('Materials only', { profileId: weldNone, weldEnabled: true, weldProfileId: weldNone, mtoEnabled: true, mtoProfileId: writer });
  const weld = f.client(), mto = f.client(), none = f.client(); await weld.login(weldOnly.email); await mto.login(mtoOnly.email); await none.login(noReport.email);
  await pdf(await weld.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' }));
  assert.equal((await weld.request('/pdf/lisl?isoId=iso-1', { pilot: 'mto' })).status, 403, 'the weld-only account may not enter MTO Pilot');
  assert.equal((await mto.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' })).status, 403, 'the MTO-only account may not enter Weld Pilot');
  assert.equal((await mto.request('/pdf/lisl?isoId=iso-1', { pilot: 'mto' })).status, 403, 'MTO Pilot has no LISL report');
  assert.equal((await f.admin.request('/pdf/lisl?isoId=iso-1', { pilot: 'mto' })).status, 403, 'the same account is refused in the other pilot');
  assert.equal((await f.admin.request('/pdf/lisl?isoId=iso-1')).status, 403, 'a request without a pilot');
  assert.equal((await none.request('/pdf/lisl?isoId=iso-1', { pilot: 'weld' })).status, 403, 'no report permission in the pilot');
  assert.equal((await f.admin.request('/pdf/lisl-a3?isoId=iso-1', { pilot: 'mto' })).status, 403);
  assert.equal((await f.admin.request('/pdf/lisl-blank?isoId=iso-1', { pilot: 'mto' })).status, 403);
  assert.equal((await f.admin.request('/pdf/nonsense?isoId=iso-1', { pilot: 'weld' })).status, 404);
  assert.equal((await f.admin.request('/pdf/lisl?isoId=missing', { pilot: 'weld' })).status, 404);
  assert.equal((await f.admin.request('/pdf/lisl', { pilot: 'weld' })).status, 404);
  const skid = f.store.get('projects', 'project-skid'); f.store.update('projects', skid.id, { weldPilot: false }, skid._version, { id: 'test', name: 'test' });
  const skidIso = f.store.list('isometrics').find(row => row.projectId === 'project-skid')!;
  assert.equal((await f.admin.request(`/pdf/lisl?isoId=${skidIso.id}`, { pilot: 'weld' })).status, 404, 'an isometric of a project not enabled in this pilot');
});

test('other profiles keep behaving as before: no PDF endpoint, no company data resource', async t => {
  for (const profile of ['welding-demo', 'access-prototype'] as ReleaseProfile[]) {
    const f = await fixture(t, profile);
    assert.equal((await f.admin.request('/pdf/lisl?isoId=iso-1')).status, 404, profile);
    assert.equal((await f.admin.request('/records/company_data')).status, 404, profile);
  }
  const full = await fixture(t, 'full');
  assert.equal((await full.admin.request('/pdf/lisl?isoId=iso-1')).status, 404);
});

test('lislNdtCells maps requests and results to report number, process and A / NA / --- per round', () => {
  const stamp = { _version: 1, _archived: false, _updatedAt: '', _createdAt: '2026-01-01T00:00:00Z' };
  const weld = { id: 'w1', weldNo: 'W1', ...stamp } as Row;
  const request = (id: string, type: string, date: string, extra: Record<string, unknown> = {}) => ({ id, weldId: 'w1', type, date, status: 'Open', processId: 'RT', ...extra, ...stamp }) as Row;
  const result = (id: string, requestId: string, round: string, value: string, reportNo: string, date = '2026-02-01') => ({ id, requestId, weldId: 'w1', round, result: value, reportNo, date, type: 'NDT', ...stamp }) as Row;
  const requests = [request('r1', 'NDT', '2026-01-10'), request('r2', 'NDT', '2026-01-20', { processId: 'MT' }), request('r3', 'NDT', '2026-01-30', { processId: 'PT' }), request('p1', 'NDT PRE', '2026-01-05'), request('t1', 'PWHT', '2026-02-01', { processId: '', pwhtProcessId: 'HT' }), request('c1', 'NDT', '2026-01-02', { status: 'Cancelled' }), { ...request('o1', 'NDT', '2026-01-03'), weldId: 'other' } as Row];
  const results = [result('x1', 'r1', 'Initial', 'Rejected', 'RPT-1'), result('x2', 'r2', 'Remaining', 'Accepted', 'RPT-2'), result('x3', 'p1', 'Initial', 'Accepted', 'PRE-1'), result('x4', 't1', 'Initial', 'Accepted', 'HT-1')];
  const names: Record<string, string> = { RT: 'RT', MT: 'MT', PT: 'PT', HT: 'PWHT-1' };
  const cells = lislNdtCells(weld, results, requests, request => names[String(request.processId || request.pwhtProcessId)]);
  assert.equal(cells.ndt.length, 5); assert.equal(cells.pre.length, 5);
  assert.deepEqual(cells.ndt[0].lines, ['RPT-1', 'RT (NA)']); assert.equal(cells.ndt[0].result, 'NA');
  assert.deepEqual(cells.ndt[1].lines, ['RPT-2', 'MT (A)']);
  assert.deepEqual(cells.ndt[2].lines, ['', 'PT ---'], 'requested, no result');
  assert.deepEqual(cells.ndt[3].lines, ['', '']); assert.equal(cells.ndt[3].result, '');
  assert.deepEqual(cells.pre[0].lines, ['PRE-1', 'RT (A)']);
  assert.deepEqual(cells.pwht.lines, ['HT-1', 'PWHT-1 (A)']);
  // The earlier "Additional 1" round counts as Additional; a taken round does not overwrite.
  const more = lislNdtCells(weld, [result('y1', 'r1', 'Additional 1', 'Accepted', 'A-1'), result('y2', 'r2', 'Additional', 'Rejected', 'A-2')], requests, () => 'RT');
  assert.deepEqual([more.ndt[2].lines[0], more.ndt[3].lines[0]], ['A-1', ''], 'the earlier "Additional 1" counts as Additional');
  assert.equal(more.ndt[0].lines[0], 'A-2', 'a request whose round is taken falls to the first free column');
});

test('lislModel sorts welds by number and the company model omits a nameless record', () => {
  const stamp = { _version: 1, _archived: false, _updatedAt: '', _createdAt: '2026-01-01T00:00:00Z' };
  const rows = { isometrics: [{ id: 'i', isoNo: 'ISO-1', projectId: 'p', ...stamp }], projects: [{ id: 'p', internnumber: 'P-1', ...stamp }], welds: ['W10', 'W2', 'W1'].map(weldNo => ({ id: weldNo, weldNo, isoId: 'i', ...stamp })) } as unknown as Record<string, Row[]>;
  const model = lislModel(rows, 'i')!;
  assert.deepEqual(model.entries.map(entry => entry.weld.weldNo), ['W1', 'W2', 'W10']);
  assert.equal(lislModel(rows, 'missing'), null);
});
