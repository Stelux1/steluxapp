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
import { isoBlockers, type BlockerItem, type IsoStatusInput } from '../shared/iso-status.ts';
import { blockerOpening, punchListUrl } from '../shared/iso-blocker-targets.ts';
import { IDENTIFICATION_FACTS } from '../shared/iso-card-facts.ts';
import { ITP_TITLE_LIMIT, NO_ITP_LINKED, cutItpTitle, itpCard } from '../shared/iso-itps-card.ts';
import { CHECK_FOR_DELETE, attachmentDeleteIds, attachmentUploadError, isoAttachmentRows, reportTypes } from '../shared/iso-attachments.ts';
import { ISO_AUDIT_EMPTY, auditEntities, auditWeldOptions } from '../shared/iso-audit.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-10-01T00:00:00.000Z', _updatedAt: '2026-10-01T00:00:00.000Z', ...data }) as Row;

// ----- delta-I1-001: blocker items open the dialog that fixes them ---------------------------------------------------------

const weldTypes = [row('wt-shop', { location: 'Shop' }), row('wt-field', { location: 'Field' })];
const weld = (id: string, data: Record<string, unknown> = {}) => row(id, { weldNo: id.toUpperCase(), isoId: 'iso', typeId: 'wt-shop', welder1Id: 'w1', wpsId: 'wps', date: '2026-10-05', lengthMode: 'Diameter', diameterId: 'd4', chargeNo1: 'H1', chargeNo2: 'H2', ndoReq: false, ...data });
const result = (weldId: string, outcome: string, date: string, extra: Record<string, unknown> = {}) => row(`${weldId}-${date}-${outcome}`, { weldId, type: 'NDT', result: outcome, date, ...extra });
const input = (data: Partial<IsoStatusInput>): IsoStatusInput => ({ iso: row('iso', { projectId: 'p1' }), welds: [], weldTypes, diameters: [], results: [], releases: [], punch: [], ...data });
const items = (blockers: ReturnType<typeof isoBlockers>, key: string): BlockerItem[] => blockers.groups.find(group => group.key === key)?.items ?? [];

test('blocker items carry the target of the dialog that fixes them: release, Edit weld, NDT, NDT Pre, the repair weld once it exists', () => {
  const welds = [
    weld('w1', { chargeNo2: '' }),                                                   // a weld missing a required field
    weld('n1', { ndoReq: true }), weld('p1', { ndoReqPre: true }),                   // NDT / NDT Pre without a result
    weld('r1', { weldNo: '002', ndoReq: true, _createdAt: '2026-10-01T08:00:00.000Z' }),   // rejected, no repair weld yet
    weld('r2', { weldNo: '010', ndoReq: true, _createdAt: '2026-10-02T08:00:00.000Z' }),   // rejected, repair 010R1 exists
    weld('r2a', { weldNo: '010R1', repairOfId: 'r2', _createdAt: '2026-10-03T08:00:00.000Z' }),
  ];
  const results = [result('r1', 'Rejected', '2026-10-04'), result('r2', 'Rejected', '2026-10-04')];
  const punch = [row('pu1', { isoId: 'iso', status: 'Open', category: 'A — Immediate fix (blocking)' })];
  const blockers = isoBlockers(input({ welds, results, punch }));
  assert.deepEqual(items(blockers, 'release').map(item => item.target), [{ kind: 'release' }, { kind: 'release' }]);
  assert.deepEqual(items(blockers, 'welds').map(item => item.target), [{ kind: 'edit-weld', weldId: 'w1' }]);
  assert.deepEqual(items(blockers, 'ndt').map(item => [item.message, item.target]), [
    ['NDT on weld N1 has no result', { kind: 'ndt', weldId: 'n1' }], ['NDT PRE on weld P1 has no result', { kind: 'ndt-pre', weldId: 'p1' }],
  ]);
  // Repair: the NDT dialog of the rejected weld while no repair weld exists; Edit weld of the repair weld once it does.
  assert.deepEqual(items(blockers, 'repair').map(item => [item.message, item.target]), [
    ['Rejection on weld 002, repair 002R1 is still open', { kind: 'ndt', weldId: 'r1' }],
    ['Rejection on weld 010, repair 010R1 is still open', { kind: 'edit-weld', weldId: 'r2a' }],
  ]);
  assert.deepEqual(items(blockers, 'punch').map(item => item.target), [{ kind: 'punch' }]);
});

test('a blocker target maps to its dialog for every kind; a locked weld opens Edit weld read-only; the punch link filters to the isometric', () => {
  const iso = { id: 'iso-7', projectId: 'project-3' };
  const locked = (id: string) => id === 'locked';
  assert.deepEqual(blockerOpening({ kind: 'release' }, iso, locked), { dialog: 'release' });
  assert.deepEqual(blockerOpening({ kind: 'edit-weld', weldId: 'free' }, iso, locked), { dialog: 'edit-weld', weldId: 'free', readOnly: false });
  assert.deepEqual(blockerOpening({ kind: 'edit-weld', weldId: 'locked' }, iso, locked), { dialog: 'edit-weld', weldId: 'locked', readOnly: true });
  assert.deepEqual(blockerOpening({ kind: 'ndt', weldId: 'w' }, iso, locked), { dialog: 'ndt', weldId: 'w', type: 'NDT' });
  assert.deepEqual(blockerOpening({ kind: 'ndt-pre', weldId: 'w' }, iso, locked), { dialog: 'ndt', weldId: 'w', type: 'NDT PRE' });
  assert.deepEqual(blockerOpening({ kind: 'punch' }, iso, locked), { dialog: 'punch', url: '/welding/punchlists?iso_id=iso-7&project_id=project-3&punch_type=prepunch' });
  assert.equal(punchListUrl(iso), '/welding/punchlists?iso_id=iso-7&project_id=project-3&punch_type=prepunch');
  // Nothing to open: a count line (no target) and a weld item without its weld.
  assert.equal(blockerOpening(undefined, iso, locked), null);
  assert.equal(blockerOpening({ kind: 'ndt' }, iso, locked), null);
  assert.equal(blockerOpening({ kind: 'edit-weld' }, iso, locked), null);
});

// ----- delta-I1-008 / delta-I1-007: Identification and ITPS cards -----------------------------------------------------------

test('Identification shows the Asset tag after the ISO No slot and no Drawing no. row', () => {
  assert.deepEqual(IDENTIFICATION_FACTS.map(fact => fact.label), ['Asset tag']);
});

test('ITPS card: typed ITP numbers do not count; a Shop+Field ITP counts 1/1 with one row; a linked row has scope, title cut to 25 characters, revision, PDF', () => {
  const itps = [
    row('shop', { number: 'S-1', scope: 'Shop', title: 'Pressure piping inspection plan 2026' }), row('field', { number: 'F-1', scope: 'Field', title: 'Field' }),
    row('both', { number: 'B-1', scope: 'Shop+Field', title: 'Combined', revision: '2' }),
  ];
  const revision = row('file-1', { entityType: 'itps', entityId: 'shop', documentType: 'ITP revision', revNo: '3', _createdAt: '2026-10-05T00:00:00.000Z' });
  const typed = row('iso', { itpNo: '111111', itpNo2: '222222' });
  assert.deepEqual(itpCard(typed, itps, []), { counter: '0/2', count: 0, max: 2, canLink: true, rows: [] }, 'typed numbers are no links');
  assert.equal(NO_ITP_LINKED, 'No ITP linked');
  const one = itpCard(row('iso', { itpId: 'both', itpNo: 'B-1', itpNo2: 'OLD' }), itps, []);
  assert.deepEqual([one.counter, one.canLink, one.rows.length], ['1/1', false, 1], 'Shop+Field: 1/1 and no ITP No 2 row');
  assert.deepEqual([one.rows[0].number, one.rows[0].scope, one.rows[0].revision, one.rows[0].slot], ['B-1', 'Shop+Field', '2', 1]);
  const two = itpCard(row('iso', { itpId: 'shop', itp2Id: 'field' }), itps, [revision]);
  assert.equal(two.counter, '2/2');
  assert.deepEqual(two.rows.map(entry => [entry.slot, entry.number, entry.scope, entry.revision]), [[1, 'S-1', 'Shop', '3'], [2, 'F-1', 'Field', '']]);
  assert.equal(two.rows[0].file?.id, 'file-1', 'the PDF of the latest revision');
  assert.equal(two.rows[1].file, undefined);
  assert.equal(two.rows[0].titleCut, 'Pressure piping inspectio…', 'cut to 25 characters plus an ellipsis');
  assert.equal(two.rows[0].title, 'Pressure piping inspection plan 2026', 'the full title is the tooltip');
  assert.equal(cutItpTitle('x'.repeat(ITP_TITLE_LIMIT)), 'x'.repeat(ITP_TITLE_LIMIT), 'exactly 25 characters stay whole');
  // The register is not readable: the linked number copied into the isometric stands in.
  assert.deepEqual(itpCard(row('iso', { itpId: 'gone', itpNo: 'G-9', itpRevNo: '1' }), [], []).rows.map(entry => [entry.number, entry.revision, entry.scope]), [['G-9', '1', '']]);
});

// ----- delta-I1-002: attachments rules ------------------------------------------------------------------------------------

test('attachments: the report types are the live attachment names in catalog order; only PDFs, at least one file, a known type; Delete needs ticked ids', () => {
  const names = [row('b', { name: 'After', position: 'After Isometric', sort: 1 }), row('a', { name: 'Before', position: 'Before Isometric', sort: 2 }), row('x', { name: 'Gone', _archived: true })];
  assert.deepEqual(reportTypes(names).map(type => type.name), ['Before', 'After']);
  assert.equal(attachmentUploadError('a', names, [{ name: 'one.PDF' }, { name: 'two.pdf' }]), '');
  assert.equal(attachmentUploadError('a', names, [{ name: 'one.pdf' }, { name: 'photo.png' }]), 'Only PDFs are allowed.');
  assert.equal(attachmentUploadError('a', names, []), 'Choose at least one PDF file.');
  assert.equal(attachmentUploadError('x', names, [{ name: 'one.pdf' }]), 'Choose a report type.', 'an archived name is not offered');
  assert.equal(attachmentUploadError('', names, [{ name: 'one.pdf' }]), 'Choose a report type.');
  assert.deepEqual(attachmentDeleteIds([]), { ids: [], error: 'Check for delete' });
  assert.equal(CHECK_FOR_DELETE, 'Check for delete');
  assert.deepEqual(attachmentDeleteIds(['f1', 'f1', ' f2 ', '', 7]), { ids: ['f1', 'f2'], error: '' });
  assert.equal(attachmentDeleteIds('f1').error, 'Check for delete');
  // The dialog lists (and the badge counts) the live files of this isometric filed under an attachment name.
  const files = [
    row('f1', { entityType: 'isometrics', entityId: 'iso', documentType: 'Before', _createdAt: '2026-10-01T00:00:00.000Z' }), row('f2', { entityType: 'isometrics', entityId: 'iso', documentType: 'After', _createdAt: '2026-10-02T00:00:00.000Z' }),
    row('f3', { entityType: 'isometrics', entityId: 'iso', documentType: 'ISO revision 2' }), row('f4', { entityType: 'isometrics', entityId: 'other', documentType: 'Before' }), row('f5', { entityType: 'isometrics', entityId: 'iso', documentType: 'Before', _archived: true }),
  ];
  assert.deepEqual(isoAttachmentRows(files, 'iso', names).map(file => file.id), ['f2', 'f1']);
});

// ----- delta-I1-003: audit rules ------------------------------------------------------------------------------------------

test('audit trail rules: the filter lists All + the welds in table order; the empty text is the reference sentence; a foreign weld is refused', () => {
  const welds = [weld('b', { weldNo: '010' }), weld('a', { weldNo: '002' }), weld('c', { weldNo: '005', isoId: 'other' }), weld('d', { weldNo: '003', _archived: true })];
  assert.deepEqual(auditWeldOptions(welds, 'iso').map(option => option.label), ['002', '010']);
  assert.equal(ISO_AUDIT_EMPTY, 'No audit entries for this isometric yet.');
  const readable = [welds[0], welds[1]];
  assert.deepEqual(auditEntities('iso', readable, '').entities, [{ key: 'isometrics', ids: ['iso'] }, { key: 'welds', ids: ['b', 'a'] }]);
  assert.deepEqual(auditEntities('iso', readable, 'a').entities, [{ key: 'welds', ids: ['a'] }]);
  assert.match(auditEntities('iso', readable, 'c').error, /not part of the isometric/);
  assert.deepEqual(auditEntities('iso', [], '').entities, [{ key: 'isometrics', ids: ['iso'] }, { key: 'welds', ids: [] }], 'no right on welds: the isometric alone');
});

// ----- hosted server ---------------------------------------------------------------------------------------------------------

const PASSWORD = 'Iso-Dialogs-Test-Password';
const NONE = 'No access';
const SYSTEM = { id: 'system', name: 'System' };
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-isodialogs-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, serveClient: false }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => {
    let cookie = '';
    const request = async (path: string, { method = 'GET', pilot = 'weld', data }: { method?: string; pilot?: string; data?: unknown } = {}) => {
      const form = data instanceof FormData;
      const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', Origin: origin, 'X-Stelux-Pilot': pilot, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : form ? data : JSON.stringify(data) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    };
    return { request, login: async (email: string) => { const response = await request('/auth/login', { method: 'POST', data: { email, password: PASSWORD } }); assert.equal(response.status, 200, email); } };
  };
  const admin = client();
  assert.equal((await admin.request('/auth/setup', { method: 'POST', data: { name: 'Dialogs admin', email: 'dialogs-admin@example.test', password: PASSWORD } })).status, 201);
  /** An account with a detailed permission profile ({area: verbs}), signed in on its own client. */
  const account = async (name: string, rules: Record<string, string[]>) => {
    const profile = store.create('profiles', { name, permissionMode: 'Detailed permissions', permissionRules: JSON.stringify(rules), generalPermission: NONE, materialsPermission: NONE, weldingPermission: NONE, toolsPermission: NONE, settingsPermission: NONE });
    const email = `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, user = store.create('users', { name, email, active: true, profileId: profile.id });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const own = client(); await own.login(email); return own;
  };
  return { store, admin, account };
}
type Api = { request: (path: string, options?: { method?: string; pilot?: string; data?: unknown }) => Promise<Response> };
const json = async <T = Record<string, any>>(response: Response) => await response.json() as T;
const pdf = (names: string[], reportNo: string, type = 'application/pdf') => { const form = new FormData(); form.set('reportNo', reportNo); for (const name of names) form.append('files', new Blob([name.endsWith('.pdf') ? '%PDF-1.4 test' : 'not a pdf'], { type }), name); return form; };

test('Options → Attachments on the server: several PDFs in one request are stored under the report type; anything else is refused whole; Delete archives the ticked ones', async t => {
  const f = await fixture(t);
  const type = reportTypes(f.store.list('attachment_names'))[0];
  assert.ok(type, 'the sample data has attachment names');
  const stored = () => isoAttachmentRows(f.store.list('attachments'), 'iso-1', f.store.list('attachment_names'));
  const before = stored().length;
  const uploaded = await f.admin.request('/isometrics/iso-1/attachments', { method: 'POST', data: pdf(['report-a.pdf', 'report-b.PDF'], type.id) });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const records = (await json<{ records: Row[] }>(uploaded)).records;
  assert.deepEqual(records.map(record => [record.name, record.documentType, record.entityType, record.entityId]), [['report-a.pdf', type.name, 'isometrics', 'iso-1'], ['report-b.PDF', type.name, 'isometrics', 'iso-1']]);
  assert.equal(stored().length, before + 2, 'the count of the badge');
  // A file that is not a PDF refuses the whole request: nothing of it is stored.
  const mixed = await f.admin.request('/isometrics/iso-1/attachments', { method: 'POST', data: pdf(['ok.pdf', 'photo.png'], type.id, 'image/png') });
  assert.equal(mixed.status, 422); assert.equal((await json(mixed)).error, 'Only PDFs are allowed.');
  assert.equal((await f.admin.request('/isometrics/iso-1/attachments', { method: 'POST', data: pdf([], type.id) })).status, 422);
  assert.equal((await f.admin.request('/isometrics/iso-1/attachments', { method: 'POST', data: pdf(['ok.pdf'], 'no-such-type') })).status, 422);
  assert.equal(stored().length, before + 2);
  // Delete: nothing ticked says "Check for delete"; ticked ones are archived; a file of another isometric or kind is not found.
  const none = await f.admin.request('/isometrics/iso-1/attachments/delete', { method: 'POST', data: { ids: [] } });
  assert.equal(none.status, 422); assert.equal((await json(none)).error, 'Check for delete');
  const foreign = f.store.create('attachments', { name: 'other.pdf', entityType: 'isometrics', entityId: 'iso-2', documentType: type.name, mime: 'application/pdf', size: 1, note: '' }, SYSTEM);
  assert.equal((await f.admin.request('/isometrics/iso-1/attachments/delete', { method: 'POST', data: { ids: [foreign.id] } })).status, 404);
  const revision = f.store.create('attachments', { name: 'rev.pdf', entityType: 'isometrics', entityId: 'iso-1', documentType: 'ISO revision 2', mime: 'application/pdf', size: 1, note: '' }, SYSTEM);
  assert.equal((await f.admin.request('/isometrics/iso-1/attachments/delete', { method: 'POST', data: { ids: [revision.id] } })).status, 404, 'a drawing revision file is not an attachment of this dialog');
  const deleted = await f.admin.request('/isometrics/iso-1/attachments/delete', { method: 'POST', data: { ids: [records[0].id] } });
  assert.equal(deleted.status, 200); assert.equal((await json(deleted)).deleted, 1);
  assert.ok(stored().some(file => file.id === records[1].id) && !stored().some(file => file.id === records[0].id), 'the ticked file left the list, the other stays');
  assert.equal(f.store.get('attachments', records[0].id, true)._archived, true, 'archived, never removed');
  // An account that may read the isometric but not import to it cannot upload or delete.
  const viewer = await f.account('Isometric viewer', { '4': ['show'], '5': ['show'], '64': ['show'], 'local-documents': ['show'] });
  assert.equal((await viewer.request('/isometrics/iso-1/attachments', { method: 'POST', data: pdf(['v.pdf'], type.id) })).status, 403);
  assert.equal((await viewer.request('/isometrics/iso-1/attachments/delete', { method: 'POST', data: { ids: [records[1].id] } })).status, 403);
});

test('Options → Audit trail on the server: the isometric and its welds, one weld on request; welds only inside the account\'s read right on them', async t => {
  const f = await fixture(t);
  const welds = f.store.list('welds').filter(row => row.isoId === 'iso-1');
  assert.ok(welds.length >= 2);
  const [first, second] = welds;
  const iso = f.store.get('isometrics', 'iso-1');
  f.store.update('isometrics', 'iso-1', { description: 'Audit trail test' }, iso._version, SYSTEM);
  f.store.update('welds', first.id, { kr: 'audit-1' }, first._version, SYSTEM);
  f.store.update('welds', second.id, { kr: 'audit-2' }, second._version, SYSTEM);
  const entries = async (client: Api, query = '', pilot = 'weld') => (await json<{ events: { entityType: string; entityId: string }[] }>(await client.request(`/isometrics/iso-1/audit${query}`, { pilot }))).events;
  // All (weldId 0 or empty): the isometric's own change and the changes of its welds.
  const all = await entries(f.admin, '?weldId=0');
  assert.ok(all.some(event => event.entityType === 'isometrics' && event.entityId === 'iso-1'));
  assert.ok(all.some(event => event.entityType === 'welds' && event.entityId === first.id) && all.some(event => event.entityType === 'welds' && event.entityId === second.id));
  assert.ok(all.every(event => event.entityId === 'iso-1' || [first.id, second.id].includes(event.entityId) || f.store.get('welds', event.entityId, true).isoId === 'iso-1'), 'nothing of other isometrics');
  // One weld: only its events.
  const one = await entries(f.admin, `?weldId=${first.id}`);
  assert.ok(one.length > 0 && one.every(event => event.entityType === 'welds' && event.entityId === first.id));
  // A weld of another isometric is refused.
  const foreign = f.store.list('welds').find(row => row.isoId !== 'iso-1')!;
  assert.equal((await f.admin.request(`/isometrics/iso-1/audit?weldId=${foreign.id}`)).status, 404);
  // No right to read welds: the isometric's entries only, however the weld is asked for.
  const noWelds = await f.account('No weld reader', { '4': ['show'], '5': ['show'], '64': ['show'] });
  const limited = await entries(noWelds, '?weldId=0');
  assert.ok(limited.some(event => event.entityType === 'isometrics') && limited.every(event => event.entityType !== 'welds'), 'welds are not delivered without the right to read them');
  assert.equal((await noWelds.request(`/isometrics/iso-1/audit?weldId=${first.id}`)).status, 404, 'the weld filter does not open the welds either');
  // MTO Pilot reads no welds: the same.
  const inMto = await entries(f.admin, '?weldId=0', 'mto');
  assert.ok(inMto.every(event => event.entityType !== 'welds'));
  // No right on the isometric: refused.
  const blind = await f.account('No isometric reader', { '4': ['show'], '5': ['show'], '63': ['show'] });
  assert.equal((await blind.request('/isometrics/iso-1/audit')).status, 403);
});

test('Link ITP in MTO Pilot: the register reaches the pilot for an account that reads isometrics; linking needs Edit on the isometric (403 without it)', async t => {
  const f = await fixture(t);
  const itp = f.store.get('itps', 'itp-03'), target = f.store.get('isometrics', 'iso-10');
  assert.equal(target.itpId ?? '', '');
  const editor = await f.account('MTO isometric editor', { '4': ['show'], '5': ['show'], '64': ['show', 'edit'] });
  const reader = await f.account('MTO isometric reader', { '4': ['show'], '5': ['show'], '64': ['show'] });
  // The bootstrap of MTO Pilot carries the register (for the ITPs card and the picker) and the account may read, not write, it.
  const boot = await json<{ rows: Record<string, Row[]>; user: User }>(await editor.request('/bootstrap', { pilot: 'mto' }));
  assert.ok((boot.rows.itps || []).some(row => row.id === itp.id), 'the ITP register is in the MTO Pilot data');
  assert.equal((await editor.request('/records/itps', { method: 'POST', pilot: 'mto', data: { number: 'MTO-NEW' } })).status, 403, 'read-only there');
  assert.equal((await reader.request('/itps/link', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-10', itpId: itp.id } })).status, 403, 'no Edit on the isometric');
  assert.equal(f.store.get('isometrics', 'iso-10').itpId ?? '', '');
  const linked = await editor.request('/itps/link', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-10', itpId: itp.id } });
  assert.equal(linked.status, 200, await linked.clone().text());
  assert.equal(f.store.get('isometrics', 'iso-10').itpId, itp.id);
  // An account without any right on isometrics gets neither the register nor the link.
  const none = await f.account('MTO nothing', { '4': ['show'], '5': ['show'] });
  const noneBoot = await json<{ rows: Record<string, Row[]> }>(await none.request('/bootstrap', { pilot: 'mto' }));
  assert.equal((noneBoot.rows.itps || []).length, 0);
  assert.equal((await none.request('/itps/link', { method: 'POST', pilot: 'mto', data: { isoId: 'iso-9', itpId: itp.id } })).status, 403);
});
