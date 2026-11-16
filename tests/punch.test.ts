import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { availabilityFor, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { isoBlockers, isoProgress, type IsoStatusInput } from '../shared/iso-status.ts';
import { pilotScope, projectScope } from '../shared/project-scope.ts';
import {
  PUNCH_CATEGORIES, PUNCH_MESSAGES, PUNCH_PROGRESS_OPTIONS, SIGNER_TYPES, canTransition, finishSummary, hasPunchProgress, isBlockingCategory, isOverdue, matchesPunchKpi, nextPunchNumber, punchAddRefusal,
  punchBlocking, punchCategory, punchCounts, punchDeadlineSoon, punchFinishErrors, punchInputErrors, punchKind, punchKpis, punchPhasePassed, punchProgress, punchProgressLabel, punchStatus, punchWriteError,
  withPunchPhases, PUNCH_FORM_FIELDS, punchFormDefaults,
  EMPTY_PUNCH_FILTERS, PUNCH_DEFAULT_PAGE_SIZE, PUNCH_HEIC_MESSAGE, PUNCH_KPI_FILTERS, PUNCH_LETTERS, PUNCH_LIST_PATH, PUNCH_PAGE_SIZES, PUNCH_PRINT_OPTIONS, comparePunchRows, matchesPunchFilters, punchDialogWarnings, punchFileProblem,
  punchFiltersFromParams, punchFiltersToParams, punchKpiActive, punchListLink, punchPhaseWarning, punchPrintHint, punchProjectLabel, punchReportPassedRefusal, punchResizeTarget, punchRowClass,
} from '../shared/punch.ts';
import { punchListOptions } from '../shared/pdf-lists.ts';
import type { Row, User } from '../shared/types.ts';

const TODAY = '2026-11-16';
const row = (id: string, data: Record<string, unknown> = {}): Row => ({ id, _version: 1, _archived: false, _createdAt: '2026-11-01T00:00:00Z', _updatedAt: '2026-11-01T00:00:00Z', ...data }) as Row;
const [A, B, C, D] = PUNCH_CATEGORIES;

// ----- pure rules ------------------------------------------------------------------------------------------

test('categories keep the four reference labels and map earlier single letters; A and B block', () => {
  assert.deepEqual(PUNCH_CATEGORIES, ['A — Immediate fix (blocking)', 'B — ASAP fix (blocking)', 'C — Fix (non-blocking)', 'D — Fix in operation (non-blocking)']);
  assert.deepEqual([A, B, C, D, 'A', 'B', 'C', 'D', '', undefined].map(value => punchCategory(value)), ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'B', 'B']);
  assert.deepEqual([A, B, C, D, 'C'].map(isBlockingCategory), [true, true, false, false, false]);
});

test('status maps earlier values; kind defaults to Punch; blocking is open A and B items only', () => {
  assert.deepEqual(['Open', 'In progress', 'Completed', 'Finished', 'Passed', 'Removed', ''].map(status => punchStatus(row('x', { status }))), ['Open', 'Open', 'Finished', 'Finished', 'Passed', 'Removed', 'Open']);
  assert.equal(punchKind(row('x')), 'Punch'); assert.equal(punchKind(row('x', { punchType: 'Pre-punch' })), 'Pre-punch');
  const items = [row('a', { category: A }), row('b', { category: 'B', status: 'In progress' }), row('c', { category: C }), row('d', { category: D }), row('e', { category: A, status: 'Finished' }), row('f', { category: A, status: 'Passed' }), row('g', { category: B, status: 'Removed' }), row('h', { category: A, _archived: true })];
  assert.deepEqual(punchBlocking(items).map(item => item.id), ['a', 'b']);
});

test('overdue is derived from the due date of open items; the 7 day window starts today', () => {
  const open = (dueDate: string, extra: Record<string, unknown> = {}) => row('x', { dueDate, ...extra });
  assert.equal(isOverdue(open('2026-11-15'), TODAY), true); assert.equal(isOverdue(open('2026-11-16'), TODAY), false); assert.equal(isOverdue(open(''), TODAY), false);
  assert.equal(isOverdue(open('2026-11-01', { status: 'Finished' }), TODAY), false, 'a finished item waits for approval, not for the contractor');
  assert.deepEqual(['2026-11-15', '2026-11-16', '2026-11-23', '2026-11-24', ''].map(due => punchDeadlineSoon(open(due), TODAY)), [false, true, true, false, false]);
  assert.equal(punchDeadlineSoon(open('2026-11-20', { status: 'Passed' }), TODAY), false);
});

test('the eight key figures count and filter the same items', () => {
  const items = [
    row('1', { punchType: 'Pre-punch', dueDate: '2026-11-10' }), row('2', { punchType: 'Pre-punch', dueDate: '2026-11-20' }), row('3', { dueDate: '2026-11-18' }), row('4', { dueDate: '2027-01-01' }),
    row('5', { status: 'Finished' }), row('6', { status: 'Passed' }), row('7', { status: 'Removed' }), row('8', { status: 'Completed' }), row('9', { _archived: true }),
  ];
  const cards = Object.fromEntries(punchKpis(items, TODAY).map(card => [card.key, card.count]));
  assert.deepEqual(cards, { open: 4, prePunch: 2, punch: 2, overdue: 1, deadline: 2, finished: 2, passed: 1, removed: 1 });
  // Read through the phases: item 6 (stored Passed by an earlier version, no isometric) reads Finished, approved.
  assert.deepEqual(Object.fromEntries(punchKpis(withPunchPhases(items), TODAY).map(card => [card.key, card.count])), { open: 4, prePunch: 2, punch: 2, overdue: 1, deadline: 2, finished: 3, passed: 0, removed: 1 });
  assert.deepEqual(punchKpis(items, TODAY).map(card => card.label), ['Open', 'Pre-punch (open)', 'Punch (open)', 'Overdue', 'Deadline 7 days', 'Finished', 'Passed', 'Removed']);
  for (const card of punchKpis(items, TODAY)) assert.equal(items.filter(item => !item._archived && matchesPunchKpi(item, card.key, TODAY)).length, card.count, card.key);
});

test('counts of an isometric: open and finished pre-punch and punch, overdue and blocking', () => {
  const items = [row('1', { punchType: 'Pre-punch', category: A, dueDate: '2026-11-01' }), row('2', { punchType: 'Pre-punch', category: C, status: 'Finished' }), row('3', { category: B }), row('4', { category: D, status: 'Finished' }), row('5', { category: C, status: 'Passed' }), row('6', { status: 'Removed' })];
  // Item 5 was stored as Passed by the earlier version and has no isometric: it reads Finished (Passed needs an isometric).
  assert.deepEqual(punchCounts(items, TODAY), { prePunchOpen: 1, prePunchFinished: 1, punchOpen: 1, punchFinished: 2, overdue: 1, blocking: 2, prePunchPassed: false, punchPassed: false, prePunchWarn: 1, punchWarn: 1 });
});

test('punch progress options read 0% … 100% (default 0%); earlier labels with a space still read', () => {
  assert.deepEqual(PUNCH_PROGRESS_OPTIONS, ['0%', '25%', '50%', '75%', '100%']);
  assert.equal(punchProgress(row('i', { punchProgress: '50 %' })), 0.5); assert.equal(punchProgress(row('i', { punchProgress: '50%' })), 0.5);
  assert.deepEqual(['50 %', '100%', '', 'x'].map(value => punchProgressLabel(row('i', { punchProgress: value }))), ['50%', '100%', '', '']);
});

test('punch progress reads the stored percentage as 0..1 and is unset until entered', () => {
  assert.deepEqual(['0 %', '25 %', '50 %', '75 %', '100 %'].map(value => punchProgress(row('i', { punchProgress: value }))), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(['', undefined, '30 %', 'x'].map(value => punchProgress(row('i', { punchProgress: value }))), [0, 0, 0, 0]);
  assert.deepEqual(['0 %', '100 %', '', '30 %'].map(value => hasPunchProgress(row('i', { punchProgress: value }))), [true, true, false, false]);
});

test('the isometric blockers and the punch driver of the progress read these functions', () => {
  const site = row('site', { weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10, fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60 });
  const input = (punch: Row[] | null, iso: Row = row('iso')): IsoStatusInput => ({ iso, site, welds: [], weldTypes: [], diameters: [], results: [], releases: null, punch });
  const punch = [row('1', { isoId: 'iso', category: A }), row('2', { isoId: 'iso', category: C }), row('3', { isoId: 'iso', category: B, status: 'Finished' }), row('4', { isoId: 'other', category: A })];
  const blockers = isoBlockers(input(punch));
  assert.equal(blockers.total, 1); assert.equal(blockers.groups[0].key, 'punch'); assert.equal(blockers.groups[0].items[0].message, '1 open punch');
  assert.equal(isoBlockers(input([row('c', { isoId: 'iso', category: D })])).total, 0, 'non-blocking categories do not block');
  const driver = (iso: Row, extra: Partial<IsoStatusInput> = {}) => isoProgress({ ...input([], iso), ...extra }).phases[1].drivers.find(item => item.key === 'punch')!;
  assert.equal(driver(row('iso')).inScope, false, 'out of scope until a punch progress is entered');
  assert.equal(driver(row('iso', { punchProgress: '75 %' })).progress, 0.75);
  assert.equal(driver(row('iso', { punchProgress: '0 %' })).inScope, true);
  assert.equal(driver(row('iso', { punchProgress: '75 %' }), { punchProgress: 1 }).progress, 1, 'a value passed by the caller wins');
});

test('input and sign-off rules', () => {
  assert.deepEqual(punchInputErrors({ description: 'x' }), { projectId: 'Please select a project.' });
  assert.deepEqual(punchInputErrors({ projectId: 'p' }), {});
  assert.equal(punchInputErrors({ projectId: 'p', punchType: 'Final' }).punchType, 'Choose Pre-punch or Punch.');
  assert.ok(punchInputErrors({ isoId: 'i', projectId: 'p2' }, undefined, row('i', { projectId: 'p1' })).projectId);
  assert.ok(punchInputErrors({ projectId: 'p', dueDate: '2026-11-01', reportedDate: '2026-11-02' }).dueDate);
  assert.equal(punchWriteError({ description: 'x' }, row('p', { status: 'Open' })), null);
  assert.ok(punchWriteError({ description: 'x' }, row('p', { status: 'Passed' })));
  for (const name of ['status', 'clientApproved', 'approvedAt']) assert.ok(punchWriteError({ [name]: name === 'status' ? 'Passed' : true }, row('p', { status: 'Open' })), name);
  assert.equal(punchWriteError({ status: 'Open' }, undefined), null); assert.ok(punchWriteError({ status: 'Finished' }, undefined)); assert.ok(punchWriteError({ number: '99' }, undefined));
  // Sign-off: Client (default) / User / Inspection; only the client name is required for a client.
  assert.deepEqual(SIGNER_TYPES, ['Client', 'User', 'Inspection']);
  const client = { signerType: 'Client', clientName: 'Jan de Vries', date: TODAY, signMethod: 'Drawn' };
  assert.deepEqual(punchFinishErrors(client, true), {}, 'company and function are optional');
  assert.deepEqual(punchFinishErrors({ ...client, clientName: '' }, true), { clientName: 'Client name is required.' });
  assert.deepEqual(punchFinishErrors({ signerType: 'Inspection', date: TODAY, signMethod: 'Uploaded PDF' }, true), { inspectorId: 'Select an inspector.' });
  assert.deepEqual(punchFinishErrors({ signerType: 'Inspection', inspectorId: 'welder-1', date: TODAY, signMethod: 'Drawn' }, true), {});
  assert.deepEqual(punchFinishErrors(client, false), { signMethod: 'Signature is required.' });
  assert.deepEqual(punchFinishErrors({ signerType: 'User', date: TODAY, signMethod: 'Saved signature' }, false, true), {}, 'the saved signature needs no drawing');
  assert.ok(punchFinishErrors({ signerType: 'User', date: TODAY, signMethod: 'Saved signature' }, false, false).signMethod, 'without a saved signature the user draws');
  assert.ok(punchFinishErrors({ ...client, signMethod: 'Saved signature' }, false, true).signMethod, 'a client never signs with the account’s signature');
  assert.deepEqual(Object.keys(punchFinishErrors({ ...client, signerType: 'Own inspector' }, true)), ['signerType']);
  assert.equal(finishSummary(1, true), 'This item will be finished with sign-off.'); assert.equal(finishSummary(3), '3 item(s) will be finished with sign-off.');
  // Open → finish / promote (pre-punch) / approve / remove; Finished → approve (until approved) / remove; Passed and Removed are final.
  const actions = ['finish', 'approve', 'promote', 'remove'] as const;
  assert.deepEqual([row('p', { punchType: 'Pre-punch' }), row('p'), row('p', { status: 'Finished' }), row('p', { status: 'Finished', clientApproved: true }), row('p', { status: 'Passed' }), row('p', { status: 'Removed' })].map(item => actions.map(action => canTransition(item, action))),
    [[true, true, true, true], [true, true, false, true], [false, true, false, true], [false, false, false, true], [false, false, false, false], [false, false, false, false]]);
});

test('Passed is derived per isometric and phase: every A/B Finished and approved; open C items stay Open', () => {
  const item = (id: string, data: Record<string, unknown>) => row(id, { isoId: 'iso', punchType: 'Pre-punch', category: A, ...data });
  const one = item('a1', { status: 'Finished', clientApproved: true }), two = item('a2', { status: 'Finished' }), open = item('c1', { category: C });
  const cards = (items: Row[]) => Object.fromEntries(punchKpis(withPunchPhases(items), TODAY).map(card => [card.key, card.count]));
  // Two finished A items, one approved: neither is Passed, the Passed card is 0.
  let items = [one, two, open];
  assert.deepEqual(withPunchPhases(items).map(punchStatus), ['Finished', 'Finished', 'Open']);
  assert.equal(cards(items).passed, 0); assert.equal(punchPhasePassed(items, 'iso', 'Pre-punch'), false);
  // After approving the second, both read Passed (card 2); the open C stays Open and does not hold the phase back.
  items = [one, { ...two, clientApproved: true }, open];
  assert.deepEqual(withPunchPhases(items).map(punchStatus), ['Passed', 'Passed', 'Open']);
  assert.equal(cards(items).passed, 2); assert.equal(cards(items).open, 1); assert.equal(cards(items).finished, 0);
  assert.equal(punchCounts(items, TODAY).prePunchFinished, 0, 'the status card counts passed items apart from finished ones');
  // Other isometrics and the other phase are separate; Punch needs the pre-punch A/B items too.
  const punch = row('p1', { isoId: 'iso', punchType: 'Punch', category: B, status: 'Finished', clientApproved: true });
  assert.equal(punchStatus(withPunchPhases([punch, two])[0]), 'Finished', 'a pre-punch A not approved holds Punch back');
  assert.equal(punchStatus(withPunchPhases([punch, { ...two, clientApproved: true }, open])[0]), 'Passed', 'open pre-punch C does not block Punch');
  assert.equal(punchStatus(withPunchPhases([punch, row('x', { isoId: 'other', category: A })])[0]), 'Passed');
  // An item stored as Passed by the earlier version reads Finished and approved; it is Passed while its phase is.
  assert.deepEqual(withPunchPhases([item('old', { status: 'Passed' }), item('new', {})]).map(entry => [punchStatus(entry), entry.clientApproved]), [['Finished', true], ['Open', undefined]]);
  assert.equal(punchStatus(withPunchPhases([item('old', { status: 'Passed' })])[0]), 'Passed');
  // Removed and archived items do not count; a project-related item never passes; a phase without a finished item is not Passed.
  assert.equal(punchStatus(withPunchPhases([one, item('r', { status: 'Removed' }), item('z', { _archived: true })])[0]), 'Passed');
  assert.equal(punchStatus(withPunchPhases([row('pr', { projectId: 'p', status: 'Finished', clientApproved: true })])[0]), 'Finished');
  assert.equal(punchPhasePassed([open], 'iso', 'Pre-punch'), false);
  // Adding after Punch Passed: refused, except a Punch item by a full access account.
  const passed = [punch];
  assert.equal(punchAddRefusal({ isoId: 'iso', punchType: 'Pre-punch' }, [two], false), null, 'Punch not passed yet');
  assert.ok(punchAddRefusal({ isoId: 'iso', punchType: 'Punch' }, passed, false));
  assert.ok(punchAddRefusal({ isoId: 'iso', punchType: 'Pre-punch' }, passed, true));
  assert.equal(punchAddRefusal({ isoId: 'iso', punchType: 'Punch' }, passed, true), null);
  assert.equal(punchAddRefusal({ isoId: 'other', punchType: 'Punch' }, passed, false), null);
  // Numbering continues from the highest number.
  assert.equal(nextPunchNumber([row('1', { number: '8' }), row('2', { number: '3' }), row('3', {})]), '9'); assert.equal(nextPunchNumber([]), '1');
});

test('Add item follows the reference: field order, Type A, Pre-Punch, today, first contractor, Reported by "—", no Short title', () => {
  assert.deepEqual([...PUNCH_FORM_FIELDS], ['projectId', 'isoId', 'category', 'files', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedById', 'punchType']);
  assert.deepEqual(punchFormDefaults([row('company-1'), row('company-2')], TODAY), { projectId: '', isoId: '', category: A, description: '', dueDate: TODAY, contractorId: 'company-1', reportedDate: TODAY, reportedById: '', punchType: 'Pre-punch' });
  assert.ok(!(PUNCH_FORM_FIELDS as readonly string[]).includes('name'));
  assert.equal(PUNCH_MESSAGES.description, 'Please enter a description.');
});

// ----- the store ---------------------------------------------------------------------------------------------

test('items are numbered, take the isometric’s project and a title from the description; earlier records stay valid', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const one = store.create('punchlists', { isoId: 'iso-5', description: 'Gasket type does not match the line list.', category: A });
    const two = store.create('punchlists', { projectId: 'project-steam', description: 'Fence off the laydown area during the hydrotest.' });
    assert.equal(Number(two.number), Number(one.number) + 1);
    assert.equal(one.projectId, store.get('isometrics', 'iso-5').projectId); assert.equal(one.name, 'Gasket type does not match the line list.'); assert.equal(one.punchType, 'Punch'); assert.equal(one.status, 'Open');
    assert.throws(() => store.create('punchlists', { description: 'No project and no isometric.' }), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.projectId));
    assert.throws(() => store.create('punchlists', { isoId: 'iso-1', description: '' }), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.description));
    assert.throws(() => store.create('punchlists', { isoId: 'iso-5', projectId: 'project-cooling', description: 'x' }), (error: { fields?: Record<string, string> }) => Boolean(error.fields?.projectId));
    assert.equal(store.update('punchlists', one.id, { description: 'Changed.' }, one._version).number, one.number, 'the number never changes');
    // A record saved before the new fields: single-letter category and the old status words still validate and read as the new values.
    store.db.prepare("INSERT INTO punchlists(id,data,created_at,updated_at) VALUES ('legacy',?,?,?)").run(JSON.stringify({ name: 'Old item', isoId: 'iso-2', category: 'A', status: 'Completed', assignedTo: 'Site team', dueDate: '2026-10-27' }), '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
    const legacy = store.get('punchlists', 'legacy');
    assert.equal(punchCategory(legacy.category), 'A'); assert.equal(punchStatus(legacy), 'Finished');
    const edited = store.update('punchlists', 'legacy', { description: 'Now with a description.' }, legacy._version);
    assert.equal(edited.category, 'A'); assert.equal(edited.status, 'Completed'); assert.ok(edited.number);
  } finally { store.close(); }
});

test('project-related items stay in the project and pilot scope; the sample shows every key figure', () => {
  const store = new Store(':memory:'); seed(store);
  try {
    const rows = Object.fromEntries(['sites', 'projects', 'isometrics', 'punchlists', 'welds', 'attachments'].map(key => [key, store.list(key)]));
    const sample = Object.fromEntries(punchKpis(withPunchPhases(rows.punchlists)).map(card => [card.key, card.count]));
    for (const key of Object.keys(sample)) assert.ok(sample[key] > 0, `the sample has ${key} items`);
    const related = rows.punchlists.find(item => !item.isoId)!;
    assert.equal(related.projectId, 'project-cooling');
    assert.ok(projectScope(rows, 'site-north').punchlists.some(item => item.id === related.id));
    assert.ok(!projectScope(rows, 'site-river').punchlists.some(item => item.id === related.id));
    assert.ok(pilotScope(rows, 'mto').punchlists.some(item => item.id === related.id));
    const off = { ...rows, projects: rows.projects.map(project => project.id === 'project-skid' ? { ...project, mtoPilot: false } : project) };
    assert.ok(!pilotScope(off, 'mto').projects.some(project => project.id === 'project-skid'), 'a project switched off for MTO Pilot leaves it');
  } finally { store.close(); }
});

test('the hosted profile delivers the page and its actions; other profiles keep their behaviour', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  assert.ok(hosted.navigation.includes('punchlists'));
  for (const name of ['number', 'punchType', 'category', 'projectId', 'isoId', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedBy', 'status', 'signAttachmentId']) assert.ok(hosted.resources.punchlists.includes(name), name);
  assert.ok(hosted.resources.isometrics.includes('punchProgress'));
  for (const key of ['punch-finish', 'punch-approve', 'punch-promote', 'punch-remove']) assert.ok(hosted.actions[key], key);
  assert.equal(hosted.actions['punch-pass'], undefined, 'Passed is derived, never reported by hand');
  for (const name of ['clientApproved', 'approvedAt', 'approvedBy', 'reportedById', 'signInspectorId']) assert.ok(hosted.resources.punchlists.includes(name), name);
  for (const profile of ['welding-demo', 'access-prototype'] as const) { const other = availabilityFor(profile)!; assert.ok(!other.navigation.includes('punchlists'), profile); assert.ok(!other.actions['punch-finish'], profile); assert.ok(!other.resources.punchlists, profile); }
  assert.equal(availabilityFor('full'), undefined);
});

// ----- through HTTP ------------------------------------------------------------------------------------------

const PASSWORD = 'Punch-Test-Password';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64)]);
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-punch-'));
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
    return request;
  };
  const account = async (name: string, profile: Record<string, unknown>) => {
    const profileId = store.create('profiles', { name, settingsPermission: 'No access', toolsPermission: 'No access', ...profile }).id;
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(PASSWORD));
    const request = client();
    assert.equal((await request('/auth/login', { method: 'POST', data: { email: user.email, password: PASSWORD } })).status, 200);
    return request;
  };
  /** Full rights in both pilots, a read-only reviewer, and detailed profiles for the verbs of area 77. */
  const worker = await account('Punch worker', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write' });
  const viewer = await account('Punch viewer', { generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only' });
  const detailed = (name: string, verbs: string[]) => account(name, { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '77': verbs, '5': ['show'], '64': ['show'] }) });
  const form = (fields: Record<string, string>, file?: { name: string; type: string; bytes: Buffer }) => {
    const body = new FormData(); for (const [name, value] of Object.entries(fields)) body.set(name, value);
    if (file) body.set('file', new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
    return body;
  };
  return { store, worker, viewer, detailed, form, account };
}
const json = async <T = Record<string, unknown>>(response: Response) => await response.json() as T;
const newItem = { punchType: 'Pre-punch', category: B, isoId: 'iso-5', description: 'Weld cap not removed on spool SP-005 branch connection.', dueDate: '2026-12-20', contractorId: 'company-stelux', reportedDate: '2026-11-16', reportedBy: 'Morgan Lee' };
const clientSignOff = { signerType: 'Client', clientName: 'Jan de Vries', company: 'Riverside Utilities', function: 'Site engineer', date: '2026-11-16', note: 'Accepted on site.', signMethod: 'Drawn' };

test('items are added and edited in the Weld Pilot; the MTO Pilot refuses them; a read-only account cannot write', async t => {
  const f = await fixture(t);
  const created = await f.worker('/records/punchlists', { method: 'POST', data: newItem }); assert.equal(created.status, 201);
  const item = (await json<{ record: Row }>(created)).record;
  assert.equal(item.status, 'Open'); assert.ok(item.number); assert.equal(item.projectId, f.store.get('isometrics', 'iso-5').projectId);
  const list = await json<{ rows: Row[] }>(await f.worker('/records/punchlists')); assert.ok(list.rows.some(row => row.id === item.id));
  const edited = await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'Weld cap removed? Check again.', category: C, _version: item._version } }); assert.equal(edited.status, 200);
  assert.equal((await json<{ record: Row }>(edited)).record.category, C);
  // The pilot boundary: the item is neither readable nor writable from the MTO Pilot.
  for (const [path, options] of [['/records/punchlists', {}], ['/records/punchlists', { method: 'POST', data: newItem }], [`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'Other pilot', _version: item._version + 1 } }], [`/history/punchlists/${item.id}`, {}], ['/actions/punch-approve', { method: 'POST', data: { punchId: item.id } }]] as const) {
    assert.equal((await f.worker(path, { ...options, pilot: 'mto' })).status, 403, path);
  }
  assert.equal(Object.hasOwn((await json<{ rows: Record<string, Row[]> }>(await f.worker('/bootstrap', { pilot: 'mto' }))).rows, 'punchlists'), false);
  // Read-only: sees the items, changes nothing.
  assert.equal((await f.viewer('/records/punchlists')).status, 200);
  assert.equal((await f.viewer('/records/punchlists', { method: 'POST', data: newItem })).status, 403);
  assert.equal((await f.viewer(`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'No', _version: edited.status && item._version + 1 } })).status, 403);
  // Invalid input is refused with the field named.
  const noTarget = await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: '', projectId: '' } }); assert.equal(noTarget.status, 422);
  const backwards = await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, dueDate: '2026-11-01' } }); assert.equal(backwards.status, 422);
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, category: 'E — Whatever' } })).status, 422);
});

test('status, sign-off and numbering change only through the transitions', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  for (const data of [{ status: 'Passed' }, { status: 'Finished' }, { number: '999' }, { passedAt: '2026-11-16' }, { signAttachmentId: 'attachment' }]) {
    const response = await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { ...data, _version: item._version } });
    assert.equal(response.status, 422, JSON.stringify(data));
  }
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, status: 'Passed' } })).status, 422);
  assert.equal(f.store.get('punchlists', item.id).status, 'Open');
});

test('Mark as finished takes the sign-off with its file in one request and audits it', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const finish = (fields: Record<string, string>, file?: { name: string; type: string; bytes: Buffer }, as = f.worker) => as(`/punch/${item.id}/finish`, { method: 'POST', data: f.form(fields, file) });
  const drawn = { name: 'punch-signature.png', type: 'image/png', bytes: PNG };
  // Refusals leave the item open and create no attachment.
  const missing = await finish(clientSignOff); assert.equal(missing.status, 422); assert.match((await json<{ error: string }>(missing)).error, /signature|signed/i);
  const noName = await finish({ ...clientSignOff, clientName: '' }, drawn); assert.equal(noName.status, 422); assert.match((await json<{ error: string }>(noName)).error, /client/i);
  assert.equal((await finish({ ...clientSignOff, signerType: 'Inspection' }, drawn)).status, 422, 'an inspection sign-off needs the inspector');
  assert.equal((await finish(clientSignOff, { name: 'sign.png', type: 'image/png', bytes: PDF })).status, 422, 'the content must be what the name says');
  assert.equal((await finish({ ...clientSignOff, signMethod: 'Uploaded PDF' }, { name: 'sign.pdf', type: 'application/pdf', bytes: PNG })).status, 422, 'a PNG is not a signed PDF');
  assert.equal((await finish({ ...clientSignOff, signMethod: 'Uploaded PDF' }, drawn)).status, 422);
  assert.equal((await finish({ ...clientSignOff, extra: 'x' }, drawn)).status, 404, 'unknown fields are not accepted');
  assert.equal((await finish(clientSignOff, drawn, f.viewer)).status, 403);
  assert.equal((await finish(clientSignOff, drawn, (path, options) => f.worker(path, { ...options, pilot: 'mto' }))).status, 403);
  assert.equal(f.store.get('punchlists', item.id).status, 'Open');
  assert.equal(f.store.list('attachments').filter(row => row.entityType === 'punchlists').length, 0);
  // A drawn client sign-off.
  const done = await finish(clientSignOff, drawn); assert.equal(done.status, 201);
  const finished = f.store.get('punchlists', item.id);
  assert.equal(finished.status, 'Finished'); assert.equal(finished.finishedAt, '2026-11-16'); assert.equal(finished.signerType, 'Client'); assert.equal(finished.signName, 'Jan de Vries'); assert.equal(finished.signCompany, 'Riverside Utilities'); assert.equal(finished.signFunction, 'Site engineer'); assert.equal(finished.signRemarks, 'Accepted on site.'); assert.equal(finished.signMethod, 'Drawn');
  const attachment = f.store.get('attachments', finished.signAttachmentId); assert.equal(attachment.entityId, item.id); assert.equal(attachment.documentType, 'Punch sign-off');
  assert.equal((await f.worker(`/files/${attachment.id}`)).status, 200);
  assert.equal((await f.worker(`/files/${attachment.id}`, { pilot: 'mto' })).status, 403);
  // Not twice.
  assert.equal((await finish(clientSignOff, drawn)).status, 422);
  assert.equal((await f.worker('/actions/punch-finish', { method: 'POST', data: { punchId: item.id, ...clientSignOff, attachmentId: attachment.id } })).status, 422);
  // The history names the step.
  const history = await json<{ events: { summary: string; action: string }[] }>(await f.worker(`/history/punchlists/${item.id}`));
  assert.ok(history.events.some(event => event.summary === 'Finished punch item'), JSON.stringify(history.events));
  // A signed PDF by an own inspector on another item.
  const other = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, projectId: '', isoId: 'iso-6' } }))).record;
  const pdf = await f.worker(`/punch/${other.id}/finish`, { method: 'POST', data: f.form({ signerType: 'Inspection', inspectorId: 'welder-1', date: '2026-11-17', signMethod: 'Uploaded PDF' }, { name: 'signed.pdf', type: 'application/pdf', bytes: PDF }) });
  assert.equal(pdf.status, 201); assert.equal(f.store.get('punchlists', other.id).signInspectorId, 'welder-1'); assert.equal(f.store.get('punchlists', other.id).signInspector, f.store.display('welders', f.store.get('welders', 'welder-1'))); assert.equal(f.store.get('punchlists', other.id).signMethod, 'Uploaded PDF');
  // The sign-off also gives the client approval.
  assert.equal(finished.clientApproved, true); assert.equal(finished.approvedAt, '2026-11-16');
});

test('Mark as Client approved, Promote to Punch, and a passed phase locks its items and refuses new items', async t => {
  const f = await fixture(t);
  const create = async (data: Record<string, unknown>, as = f.worker) => as('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6', ...data } });
  const item = (await json<{ record: Row }>(await create({ category: A }))).record;
  const approve = (id: string, as = f.worker) => as('/actions/punch-approve', { method: 'POST', data: { punchId: id } });
  const promote = (id: string, as = f.worker) => as('/actions/punch-promote', { method: 'POST', data: { punchId: id } });
  // Approval before the sign-off: allowed, the item stays Open.
  assert.equal((await approve(item.id, f.viewer)).status, 403);
  assert.equal((await approve(item.id)).status, 201);
  assert.equal(f.store.get('punchlists', item.id).clientApproved, true); assert.equal(f.store.get('punchlists', item.id).status, 'Open');
  assert.equal((await approve(item.id)).status, 422, 'not twice');
  assert.equal((await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { clientApproved: false, _version: f.store.get('punchlists', item.id)._version } })).status, 422, 'the approval is not a plain field');
  // Promote: an open pre-punch item becomes Punch, once; a punch item is refused.
  const pre = (await json<{ record: Row }>(await create({ category: C }))).record;
  assert.equal((await promote(pre.id, f.viewer)).status, 403);
  assert.equal((await promote(pre.id)).status, 201); assert.equal(f.store.get('punchlists', pre.id).punchType, 'Punch');
  assert.equal((await promote(pre.id)).status, 422);
  // The activity log names both steps instead of "Updated".
  const events = async (id: string) => (await json<{ events: { summary: string; action: string }[] }>(await f.worker(`/history/punchlists/${id}`))).events;
  assert.ok((await events(item.id)).some(event => event.action === 'approved' && event.summary === 'Approved punch item'), JSON.stringify(await events(item.id)));
  assert.ok((await events(pre.id)).some(event => event.action === 'promoted' && event.summary === 'Promoted punch item'), JSON.stringify(await events(pre.id)));
  // Finish the pre-punch A item: its phase passes; the item is Passed, locked for edits, files and removal.
  assert.equal((await f.worker(`/punch/${item.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 'sign.png', type: 'image/png', bytes: PNG }) })).status, 201);
  const passed = f.store.get('punchlists', item.id);
  assert.equal(punchStatus(withPunchPhases(f.store.list('punchlists'))!.find(row => row.id === item.id)!), 'Passed');
  const edit = await f.worker(`/records/punchlists/${item.id}`, { method: 'PUT', data: { description: 'Changed after passing.', _version: passed._version } });
  assert.equal(edit.status, 422); assert.match(await edit.text(), /passed punch item cannot be changed/i);
  assert.equal((await f.worker('/actions/punch-remove', { method: 'POST', data: { punchId: item.id } })).status, 422);
  assert.equal((await f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: item.id, documentType: 'Punch photo' }, { name: 'late.png', type: 'image/png', bytes: PNG }) })).status, 422);
  // Pre-punch Passed does not stop new items. Finish the promoted C (Punch): Punch passes, then adding is refused.
  assert.equal((await f.worker(`/punch/${pre.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 'sign.png', type: 'image/png', bytes: PNG }) })).status, 201);
  assert.equal(punchPhasePassed(f.store.list('punchlists'), 'iso-6', 'Punch'), true);
  for (const punchType of ['Pre-punch', 'Punch']) {
    const refused = await create({ punchType }); assert.equal(refused.status, 422, punchType); assert.match((await json<{ error: string }>(refused)).error, /Punch is already Passed/);
  }
  // A full access account (the administrator) may still add a Punch item, not a Pre-punch item.
  const admin = await f.account('Punch admin', { generalPermission: 'Administration', materialsPermission: 'Administration', weldingPermission: 'Administration', settingsPermission: 'Administration' });
  assert.equal((await create({ punchType: 'Pre-punch' }, admin)).status, 422);
  assert.equal((await create({ punchType: 'Punch' }, admin)).status, 201);
  assert.equal((await create({ isoId: 'iso-5' })).status, 201, 'other isometrics are not affected');
});

test('bulk Mark as finished (Sign-off) finishes and approves the checked items in one transaction', async t => {
  const f = await fixture(t);
  const make = async () => (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const [one, two, three] = [await make(), await make(), await make()];
  const bulk = (ids: string[], fields: Record<string, string> = clientSignOff, as = f.worker) => as('/punch/finish', { method: 'POST', data: f.form({ ...fields, punchIds: ids.join(',') }, { name: 'sign.png', type: 'image/png', bytes: PNG }) });
  assert.equal((await bulk([])).status, 422);
  // One refused id (already removed) leaves every item unchanged.
  assert.equal((await f.worker('/actions/punch-remove', { method: 'POST', data: { punchId: three.id } })).status, 201);
  assert.equal((await bulk([one.id, three.id])).status, 422);
  assert.equal(f.store.get('punchlists', one.id).status, 'Open'); assert.equal(f.store.list('attachments').filter(row => row.entityType === 'punchlists').length, 0);
  assert.equal((await bulk([one.id, two.id], clientSignOff, f.viewer)).status, 403);
  const done = await bulk([one.id, two.id]); assert.equal(done.status, 201);
  assert.equal((await json<{ records: Row[] }>(done)).records.length, 2);
  for (const id of [one.id, two.id]) {
    const item = f.store.get('punchlists', id);
    assert.equal(item.status, 'Finished'); assert.equal(item.clientApproved, true); assert.equal(item.signName, 'Jan de Vries');
    const file = f.store.get('attachments', item.signAttachmentId); assert.equal(file.entityId, id); assert.equal(file.documentType, 'Punch sign-off');
    assert.equal((await f.worker(`/files/${file.id}`)).status, 200);
  }
});

test('a User sign-off uses the account’s saved signature from Signatures; without one the user draws', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const user = { signerType: 'User', date: '2026-11-16', signMethod: 'Saved signature' };
  assert.equal((await f.worker(`/punch/${item.id}/finish`, { method: 'POST', data: f.form(user) })).status, 422, 'no saved signature yet');
  const signature = (await json<{ record: Row }>(await f.worker('/records/signatures', { method: 'POST', data: { name: 'Punch worker', userId: f.store.list('users').find(row => row.name === 'Punch worker')!.id, kind: 'Full signature', nameUnder: false } }))).record;
  assert.equal((await f.worker('/files', { method: 'POST', data: f.form({ entityType: 'signatures', entityId: signature.id }, { name: 'full.png', type: 'image/png', bytes: PNG }) })).status, 201);
  const done = await f.worker(`/punch/${item.id}/finish`, { method: 'POST', data: f.form(user) }); assert.equal(done.status, 201, await done.clone().text());
  const finished = f.store.get('punchlists', item.id);
  assert.equal(finished.signerType, 'User'); assert.equal(finished.signName, 'Punch worker'); assert.equal(finished.signMethod, 'Saved signature'); assert.equal(finished.clientApproved, true);
  assert.equal((await f.worker(`/files/${finished.signAttachmentId}`)).status, 200);
});

test('new item numbers continue from the highest number of the list (scenario SB defect D4)', async t => {
  const f = await fixture(t);
  const highest = Math.max(...f.store.list('punchlists', true).map(row => Number(row.number) || 0));
  assert.equal(highest, 8, 'the sample holds items 1 to 8');
  const created = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  assert.equal(created.number, '9');
});

test('Mark as removed asks for the delete right, works from Open and Finished only and is final', async t => {
  const f = await fixture(t);
  const maker = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const editor = await f.detailed('Punch editor', ['show', 'insert', 'edit', 'import']);
  const remover = await f.detailed('Punch remover', ['show', 'edit', 'delete']);
  // Both directions: the editor may finish and approve but not remove; the remover may remove.
  assert.equal((await editor('/actions/punch-remove', { method: 'POST', data: { punchId: maker.id } })).status, 403);
  // A plain confirmation: no date and no reason; today is stored.
  assert.equal((await remover('/actions/punch-remove', { method: 'POST', data: { punchId: maker.id } })).status, 201);
  const removed = f.store.get('punchlists', maker.id); assert.equal(removed.status, 'Removed'); assert.equal(removed.removedAt, new Date().toISOString().slice(0, 10)); assert.equal(removed.removeReason, '');
  assert.equal((await remover('/actions/punch-remove', { method: 'POST', data: { punchId: maker.id } })).status, 422);
  assert.equal((await remover(`/punch/${maker.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 422);
  assert.equal((await remover('/actions/punch-approve', { method: 'POST', data: { punchId: maker.id } })).status, 422);
  const second = (await json<{ record: Row }>(await editor('/records/punchlists', { method: 'POST', data: newItem }))).record;
  assert.equal((await editor(`/punch/${second.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 201);
  assert.equal(f.store.get('punchlists', second.id).clientApproved, true);
  assert.equal((await remover('/records/punchlists', { method: 'POST', data: newItem })).status, 403, 'the remover cannot add items');
  // A profile that only reads cannot run any transition.
  const reader = await f.detailed('Punch reader', ['show']);
  const third = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  assert.equal((await reader('/actions/punch-remove', { method: 'POST', data: { punchId: third.id } })).status, 403);
  assert.equal((await reader('/actions/punch-approve', { method: 'POST', data: { punchId: third.id } })).status, 403);
  assert.equal((await reader('/actions/punch-promote', { method: 'POST', data: { punchId: third.id } })).status, 403);
  assert.equal((await reader(`/punch/${third.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 403);
  assert.equal(f.store.get('punchlists', third.id).status, 'Open');
});

test('an item holds up to two photos or documents; the sign-off type cannot be attached by hand', async t => {
  const f = await fixture(t);
  const item = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: newItem }))).record;
  const attach = (documentType: string, name = 'photo.png') => f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: item.id, documentType }, { name, type: 'image/png', bytes: PNG }) });
  assert.equal((await attach('Punch sign-off')).status, 422);
  assert.equal((await attach('Anything else')).status, 422);
  assert.equal((await attach('Punch photo', 'one.png')).status, 201);
  assert.equal((await attach('Punch document', 'two.png')).status, 201);
  const third = await attach('Punch photo', 'three.png'); assert.equal(third.status, 422); assert.match((await json<{ error: string }>(third)).error, /up to 2/);
  assert.equal(f.store.list('attachments').filter(row => row.entityType === 'punchlists' && row.entityId === item.id).length, 2);
  // The sign-off file does not use up the two places.
  // An open A item keeps the phase from Passed, so the finished item still takes files.
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6', category: A } })).status, 201);
  const other = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6' } }))).record;
  assert.equal((await f.worker(`/punch/${other.id}/finish`, { method: 'POST', data: f.form(clientSignOff, { name: 's.png', type: 'image/png', bytes: PNG }) })).status, 201);
  for (const name of ['a.png', 'b.png']) assert.equal((await f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: other.id, documentType: 'Punch photo' }, { name, type: 'image/png', bytes: PNG }) })).status, 201);
  // Export carries the visible columns only.
  const csv = await (await f.worker('/export/punchlists?format=csv')).text(); assert.match(csv.split('\n')[0], /Punch type/); assert.doesNotMatch(csv.split('\n')[0], /Sign-off document/);
  assert.equal((await f.viewer('/export/punchlists?format=csv')).status, 200);
  assert.equal((await f.worker('/export/punchlists?format=csv', { pilot: 'mto' })).status, 403);
});

test('the punch progress is stored on the isometric and drives the field progress', async t => {
  const f = await fixture(t);
  const iso = f.store.get('isometrics', 'iso-6');
  assert.equal((await f.worker(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '60 %', _version: iso._version } })).status, 422);
  const saved = await f.worker(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '75%', _version: iso._version } }); assert.equal(saved.status, 200);
  assert.equal(punchProgress(f.store.get('isometrics', 'iso-6')), 0.75);
  assert.equal((await f.viewer(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '100%', _version: iso._version + 1 } })).status, 403);
  assert.equal((await f.worker(`/records/isometrics/${iso.id}`, { method: 'PUT', data: { punchProgress: '50 %', _version: iso._version + 1 } })).status, 200, 'an earlier label is still accepted');
  assert.ok(punchKind(row('x')) && punchKpis([]).length === 8);
});

test('hosted Add item labels follow the capture: the category is "Type" and the isometric "ISO"; other profiles keep theirs', async () => {
  const { projectResource } = await import('../shared/release.ts');
  const { RESOURCES } = await import('../shared/resources.ts');
  const punch = RESOURCES.find(resource => resource.key === 'punchlists')!;
  const label = (profile: Parameters<typeof availabilityFor>[0], name: string) => projectResource(availabilityFor(profile), punch).fields.find(field => field.name === name)?.label;
  assert.equal(label(HOSTED_RELEASE_PROFILE, 'category'), 'Type');
  assert.equal(label(HOSTED_RELEASE_PROFILE, 'isoId'), 'ISO');
  assert.equal(label('full', 'category'), 'Category');
  assert.equal(label('full', 'isoId'), 'Isometric');
});

// ----- wave 3: punch list views, filters, the isometric card and the punch dialog -----------------------------------

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the list opens on the Open view; Finished, Passed and Removed are separate views', () => {
  const items = withPunchPhases([
    row('o', { isoId: 'i1', category: C }), row('f', { isoId: 'i2', category: C, status: 'Finished' }), row('r', { isoId: 'i3', category: C, status: 'Removed' }),
    row('p', { isoId: 'i4', category: A, status: 'Finished', clientApproved: true }), row('n', { isoId: 'i1', category: A, status: 'Finished', clientApproved: true }),
  ]);
  const ids = (address: string) => items.filter(item => matchesPunchFilters(item, punchFiltersFromParams(new URLSearchParams(address)), TODAY)).map(item => item.id);
  assert.deepEqual(ids(''), ['o'], 'no card chosen: only Open items');
  assert.deepEqual(ids('viewT=finished'), ['f']);
  assert.deepEqual(ids('viewT=passed'), ['p', 'n'], 'Finished and approved items of a passed phase');
  assert.deepEqual(ids('viewT=removed'), ['r']);
  assert.equal(punchFiltersFromParams(new URLSearchParams('viewT=nonsense')).view, 'open', 'an unknown view falls back to Open');
});

test('the filters live in the address with the reference names, and the cards set view, punch type and due filter', () => {
  const filters = punchFiltersFromParams(new URLSearchParams('iso_id=iso-1&project_id=project-1&punch_type=prepunch&viewT=finished&due_filter=overdue&item_type=b'));
  assert.deepEqual(filters, { view: 'finished', projectId: 'project-1', isoId: 'iso-1', punchType: 'Pre-punch', letter: 'B', due: 'overdue' });
  assert.equal(punchFiltersToParams(filters).toString(), 'iso_id=iso-1&project_id=project-1&punch_type=prepunch&item_type=B&viewT=finished&due_filter=overdue');
  assert.equal(punchFiltersToParams(EMPTY_PUNCH_FILTERS).toString(), '', 'the Open view with no filters writes nothing');
  assert.equal(punchListLink({ isoId: 'iso-1', projectId: 'project-1', punchType: 'Pre-punch' }), `${PUNCH_LIST_PATH}?iso_id=iso-1&project_id=project-1&punch_type=prepunch`);
  for (const [key, card] of Object.entries(PUNCH_KPI_FILTERS)) { assert.equal(punchKpiActive(key as keyof typeof PUNCH_KPI_FILTERS, { ...EMPTY_PUNCH_FILTERS, ...card, letter: '', isoId: '', projectId: '' }), true, key); }
  assert.equal(punchKpiActive('open', EMPTY_PUNCH_FILTERS), true); assert.equal(punchKpiActive('finished', EMPTY_PUNCH_FILTERS), false);
});

test('filter and table details: Type options A to D, Status ascending, page sizes 10 to 500 with 20 as default, Project option text', () => {
  assert.deepEqual(PUNCH_LETTERS, ['A', 'B', 'C', 'D']);
  assert.deepEqual(PUNCH_PAGE_SIZES, [10, 20, 50, 100, 500]); assert.equal(PUNCH_DEFAULT_PAGE_SIZE, 20);
  const rowsInOrder = [row('r', { status: 'Removed', number: '9' }), row('p', { status: 'Passed', number: '8' }), row('f', { status: 'Finished', number: '7' }), row('o1', { number: '1' }), row('o2', { number: '2' })];
  assert.deepEqual([...rowsInOrder].sort(comparePunchRows).map(item => item.id), ['o2', 'o1', 'f', 'p', 'r'], 'Status ascending (Open first), the newest number first inside a status');
  assert.equal(punchProjectLabel(row('x', { internnumber: '20240101', description: 'Template project' })), '20240101 — Template project');
  const source = read('client/punch.tsx');
  assert.match(source, /<option key=\{value\} value=\{value\}>\{value\}<\/option>\)\}<\/select><\/div>\s*<button type="button" className="btn small primary" onClick=\{\(\) => apply\(\{ letter/, 'short Type labels, then Apply');
  assert.match(source, />Apply<\/button>/); assert.match(source, />Reset<\/button>/); assert.match(source, /<option value="">All<\/option>/);
  assert.doesNotMatch(source, /Clear filters/, 'Apply and Reset replace Clear filters');
});

test('overdue rows are marked as a row, not with a badge; the Isometric cell links to the isometric in a new tab', () => {
  assert.equal(punchRowClass(row('x', { dueDate: '2024-03-21' }), TODAY), 'overdue');
  assert.equal(punchRowClass(row('x', { dueDate: '2026-11-19' }), TODAY), 'due-soon');
  assert.equal(punchRowClass(row('x', { dueDate: '2024-03-21', status: 'Finished' }), TODAY), '');
  const source = read('client/punch.tsx');
  assert.match(source, /to=\{`\/workspace\/isometrics\/\$\{row\.isoId\}`\} target="_blank"/);
  assert.doesNotMatch(source, /<Badge color="red">Overdue<\/Badge>/);
  assert.match(source, /punch-row-\$\{punchRowClass/);
});

test('the Print dialog is one button; selected rows print on their own and the drawing option is offered', () => {
  assert.equal(punchPrintHint(0), 'All items matching the current filter'); assert.equal(punchPrintHint(2), 'Selected punch items (2)');
  assert.deepEqual(Object.values(PUNCH_PRINT_OPTIONS), ['Punch document (Document column / download)', 'Isometric drawing (imported PDF per isometric)']);
  const source = read('client/punch.tsx'), pdf = read('client/pdf-documents.tsx');
  assert.doesNotMatch(source, /window\.print/); assert.doesNotMatch(source, /Print PDF/);
  assert.match(pdf, /label="Print" title="Print" subtitle=\{punchPrintHint\(selected\.length\)\}/);
  assert.match(pdf, /name: 'isoDrawing'/); assert.match(pdf, /ids: selected\.join\(','\)/);
  const options = punchListOptions({ ids: 'a,b,a', isoDrawing: '1', view: 'open' }).options;
  assert.deepEqual(options.ids, ['a', 'b']); assert.equal(options.isoDrawing, true); assert.equal(punchListOptions({ view: 'nonsense' }).error, 'Choose Open, Finished, Passed or Removed.');
});

test('photos: images and PDF only, HEIC has its own sentence, large photos are scaled to 1280 px', () => {
  assert.equal(punchFileProblem('IMG_1.heic', 'image/heic'), 'HEIC format is not supported. Use "Choose file" or save as JPEG.');
  assert.equal(punchFileProblem('IMG_2.HEIF'), PUNCH_HEIC_MESSAGE);
  assert.ok(punchFileProblem('list.xlsx'), 'a spreadsheet is refused'); assert.ok(punchFileProblem('notes.txt', 'text/plain'));
  assert.equal(punchFileProblem('a.jpg', 'image/jpeg'), ''); assert.equal(punchFileProblem('b.pdf', 'application/pdf'), ''); assert.equal(punchFileProblem('c.PNG'), '');
  assert.deepEqual(punchResizeTarget(4032, 3024), { width: 1280, height: 960 });
  assert.deepEqual(punchResizeTarget(3024, 4032), { width: 960, height: 1280 });
  assert.deepEqual(punchResizeTarget(800, 600), { width: 800, height: 600 }); assert.deepEqual(punchResizeTarget(1280, 1000), { width: 1280, height: 1000 });
});

test('per-phase badges, counts and warnings of the isometric status card', () => {
  // A Pre-punch A item that is Finished but not yet approved: the old blocking count drops it, the phase warning does not.
  const items = [row('1', { isoId: 'iso', punchType: 'Pre-punch', category: A, status: 'Finished' }), row('2', { isoId: 'iso', punchType: 'Punch', category: C })];
  assert.equal(punchBlocking(items).length, 0);
  const counts = punchCounts(items, TODAY);
  assert.equal(counts.prePunchWarn, 1); assert.equal(counts.punchWarn, 0); assert.equal(counts.prePunchPassed, false); assert.equal(counts.punchPassed, false);
  assert.equal(punchPhaseWarning('Pre-punch', counts.prePunchWarn), 'Pre-punch: 1 A/B still need Finished + approval.');
  assert.equal(punchPhaseWarning('Punch', counts.punchWarn), null);
  // Approved: the Pre-punch phase reads Passed and the warning goes.
  const passed = punchCounts([{ ...items[0], clientApproved: true }, items[1]], TODAY);
  assert.equal(passed.prePunchPassed, true); assert.equal(passed.prePunchWarn, 0); assert.equal(passed.prePunchFinished, 0, 'a passed item is not counted as finished');
  const source = read('client/punch.tsx');
  assert.match(source, />Punch list<\/Link>/); assert.match(source, /<Plus size=\{13\} aria-hidden="true"\/>Item<\/button>/); assert.match(source, /\{phase\.passed \? 'Passed' : 'Open'\}/);
  assert.match(source, /stat\(`\$\{phase\.open\} open`, \{ punchType: phase\.kind \}\)/); assert.match(source, /view: 'finished'/); assert.match(source, /due: 'overdue'/);
});

test('the punch dialog of an isometric: warnings, the shell of the reference, and the sign-off list of the phase', () => {
  const iso = row('iso', { testSystemId: '' });
  const items = [row('1', { isoId: 'iso', punchType: 'Pre-punch', category: A }), row('2', { isoId: 'iso', punchType: 'Pre-punch', category: B, status: 'Finished' })];
  assert.deepEqual(punchDialogWarnings(iso, items).map(warning => [warning.type, warning.message]), [
    ['ab_items_open', 'There are still 2 A/B items that must be Finished and approved before this phase can be Passed.'],
    ['hydro_not_required', 'No test system linked — hydrotest is not applicable.'],
  ]);
  assert.deepEqual(punchDialogWarnings(row('iso', { testSystemId: 'ts' }), []), []);
  const source = read('client/punch.tsx');
  assert.match(source, /<Modal title="Punch lists" onClose=\{onClose\} wide>/);
  assert.match(source, /Manage items and view lists on the punch list page\. This modal is for quick add and passed reporting only\./);
  assert.match(source, />Open punch list<\/Link>/); assert.match(source, />Passed overview<\/Link>/); assert.match(source, /punchListLink\(\{ view: 'passed' \}\)/);
  assert.match(source, /isoId \? 'Complete punch & Sign-off' : 'Report passed'/); assert.match(source, /<p className="panel-section-title">New item<\/p>/);
  assert.match(source, /Add<\/button>\s*<\/form>/); assert.doesNotMatch(source, /Add punch item/);
  for (const text of ['Select punch items', 'Select all', 'Finish \\+ Sign-off', 'Select one or more open items from this isometric to mark complete with sign-off\\.']) assert.match(source, new RegExp(text));
  assert.equal(PUNCH_MESSAGES.select, 'Select one or more items first.');
});

test('Edit punchlist item: title, fields, approval button, activity log and Save / Close', () => {
  const source = read('client/punch.tsx');
  const edit = source.slice(source.indexOf('function PunchEditDialog'), source.indexOf('// ----- actions'));
  assert.match(edit, /title="Edit punchlist item"/);
  for (const name of ['category', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedById']) assert.match(edit, new RegExp(`input\\('${name}'`), name);
  for (const gone of ["input('projectId'", "input('isoId'", "input('name'"]) assert.doesNotMatch(edit, new RegExp(gone.replace(/[()']/g, '\\$&')), `${gone} is not in Edit`);
  assert.match(edit, /Mark as Client approved/); assert.match(edit, /<RecordHistory resource=\{RESOURCE\} id=\{record\.id\}\/>/);
  assert.match(edit, />Close<\/button><button className="btn primary" disabled=\{busy\}>.*Save<\/button>/);
  assert.doesNotMatch(edit, /accept=/, 'Edit keeps one plain Choose file');
});

test('Register passed is refused without an isometric or while the phase still has open A/B items', () => {
  const items = [row('1', { isoId: 'iso', punchType: 'Pre-punch', category: A }), row('2', { isoId: 'other', punchType: 'Pre-punch', category: C })];
  assert.equal(punchReportPassedRefusal('', 'Pre-punch', items), 'Please select an isometric (Passed requires an isometric).');
  assert.match(punchReportPassedRefusal('iso', 'Pre-punch', items)!, /There are still 1 A\/B items/);
  assert.match(punchReportPassedRefusal('iso', 'Punch', items)!, /There are still 1 A\/B/, 'Punch waits for the Pre-punch A/B items too');
  assert.equal(punchReportPassedRefusal('other', 'Pre-punch', items), null);
  assert.equal(punchReportPassedRefusal('other', 'Sometimes', items), PUNCH_MESSAGES.kind);
});

test('the punch blocker line reads "<n> open pre-punch" and links to the filtered Punch lists page', () => {
  const punch = [row('1', { isoId: 'iso', punchType: 'Pre-punch', category: A }), row('2', { isoId: 'iso', punchType: 'Punch', category: B }), row('3', { isoId: 'iso', punchType: 'Punch', category: C })];
  const iso = row('iso', { projectId: 'project-1' });
  const blockers = isoBlockers({ iso, site: row('site'), welds: [], weldTypes: [], diameters: [], results: [], releases: null, punch });
  assert.equal(blockers.total, 2);
  assert.deepEqual(blockers.groups[0].items, [
    { message: '1 open pre-punch', href: '/welding/punchlists?iso_id=iso&project_id=project-1&punch_type=prepunch', target: { kind: 'punch', punchType: 'Pre-punch' } },
    { message: '1 open punch', href: '/welding/punchlists?iso_id=iso&project_id=project-1&punch_type=punch', target: { kind: 'punch', punchType: 'Punch' } },
  ]);
  assert.match(read('client/iso-header.tsx'), /item\.href && canRecord\('punchlists'\)/);
});

test('E2: one punch dialog per isometric: the weld table\'s Punch list option opens the Add item / Complete punch & Sign-off dialog, and each blocker line opens its own filtered list', async () => {
  const { blockerOpening, punchListUrl } = await import('../shared/iso-blocker-targets.ts');
  const weldEntry = read('client/weld-entry.tsx'), punch = read('client/punch.tsx');
  assert.match(weldEntry, /dialog === 'punch' && <PunchDialog isoId=\{iso\.id\}/, 'Options → Punch list opens the per-isometric dialog');
  assert.ok(!/IsoPunchDialog/.test(weldEntry + punch), 'the second punch dialog is gone');
  assert.match(punch, /isoId \? 'Complete punch & Sign-off' : 'Report passed'/);
  const punchRows = [row('1', { isoId: 'iso', punchType: 'Pre-punch', category: A }), row('2', { isoId: 'iso', punchType: 'Punch', category: B })];
  const iso = row('iso', { projectId: 'project-1' });
  const items = isoBlockers({ iso, site: row('site'), welds: [], weldTypes: [], diameters: [], results: [], releases: null, punch: punchRows }).groups[0].items;
  assert.deepEqual(items.map(item => item.message), ['1 open pre-punch', '1 open punch']);
  for (const item of items) assert.equal((blockerOpening(item.target, iso, () => false) as { url: string }).url, item.href, `${item.message} opens the list the Punch lists page filters by its address`);
  assert.deepEqual(punchFiltersFromParams(new URL(`http://x${items[1].href}`).searchParams).punchType, 'Punch');
  assert.equal(punchListUrl(iso), '/welding/punchlists?iso_id=iso&project_id=project-1&punch_type=prepunch');
  assert.match(read('client/iso-header.tsx'), /item\.target\.kind === 'punch' \? canRecord\('punchlists'\) && pilot\?\.pilot\.key === 'weld'/, 'a link in Weld Pilot for an account that reads punch lists, text otherwise');
});

test('Report passed over HTTP: needs an isometric, waits for open A/B items, shows in the Passed view and takes its evidence', async t => {
  const f = await fixture(t);
  const report = (data: Record<string, unknown>, as = f.worker, pilot = 'weld') => as('/actions/punch-report-passed', { method: 'POST', data, pilot });
  assert.equal((await report({ punchType: 'Pre-punch' })).status, 422, 'an isometric is required');
  assert.equal((await report({ isoId: 'iso-6', punchType: 'Sometimes' })).status, 422);
  assert.equal((await report({ isoId: 'iso-6', punchType: 'Pre-punch' }, f.viewer)).status, 403);
  assert.equal((await report({ isoId: 'iso-6', punchType: 'Pre-punch' }, f.worker, 'mto')).status, 403);
  const open = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6', category: A } }))).record;
  const refused = await report({ isoId: 'iso-6', punchType: 'Pre-punch' }); assert.equal(refused.status, 422); assert.match((await json<{ error: string }>(refused)).error, /still 1 A\/B items/);
  // A non-blocking open item does not hold the phase back.
  assert.equal((await f.worker('/actions/punch-remove', { method: 'POST', data: { punchId: open.id } })).status, 201);
  const minor = (await json<{ record: Row }>(await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6', category: C } }))).record;
  const done = await report({ isoId: 'iso-6', punchType: 'Pre-punch', reportedDate: '2026-11-16' }); assert.equal(done.status, 201, await done.clone().text());
  const marker = (await json<{ record: Row }>(done)).record;
  assert.equal(marker.reportPassed, true); assert.equal(marker.isoId, 'iso-6'); assert.equal(marker.punchType, 'Pre-punch');
  const view = withPunchPhases(f.store.list('punchlists'));
  assert.equal(punchStatus(view.find(item => item.id === marker.id)!), 'Passed'); assert.equal(punchStatus(view.find(item => item.id === minor.id)!), 'Open', 'the open C item stays Open');
  assert.ok(view.filter(item => matchesPunchFilters(item, { ...EMPTY_PUNCH_FILTERS, view: 'passed' }, TODAY)).some(item => item.id === marker.id));
  assert.equal((await report({ isoId: 'iso-6', punchType: 'Pre-punch' })).status, 422, 'not twice');
  // The evidence of a passed report can still be attached; any other passed item stays locked.
  assert.equal((await f.worker('/files', { method: 'POST', data: f.form({ entityType: 'punchlists', entityId: marker.id, documentType: 'Punch photo' }, { name: 'round.png', type: 'image/png', bytes: PNG }) })).status, 201);
  assert.equal((await report({ isoId: 'iso-6', punchType: 'Punch' })).status, 201, 'Punch can follow once the Pre-punch A/B items are done');
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, isoId: 'iso-6', punchType: 'Pre-punch' } })).status, 422, 'Punch is Passed: no more Pre-punch items');
  // Ordinary writes cannot forge the marker.
  assert.equal((await f.worker('/records/punchlists', { method: 'POST', data: { ...newItem, reportPassed: true } })).status, 422);
});
