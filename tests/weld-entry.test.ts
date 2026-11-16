import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, SYSTEM } from '../server/store.ts';
import { runAction } from '../server/workflows.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { passwordHash } from '../server/auth.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor, type ReleaseProfile } from '../shared/release.ts';
import { canAction } from '../shared/permissions.ts';
import {
  certificateErrors, certificateMaterialText, certificatesForProject, chargeSelection, chargeValue, dropWeld, isSideValue, lockContext, missingMandatoryFields,
  moveWeld, neighbourOf, normalizedNdtPercent, orderedWelds, planWeldRange, readMassEdit, sideSummary, typeAbbreviation, weldDiameterText, weldLock, weldLocation, weldNumberStyle,
  welderQualifiedForWps, welderWpsErrors,
  MASS_EDIT_FIELDS, MASS_EDIT_MANDATORY_MESSAGE, WELD_OPTIONS_MENU, locationTooltip, massEditLabels, massEditMissingFields, orderFailureMessage, sideCellTexts, stampOptionLabel,
  weldMatchesSearch, weldSortingDisabled, weldSortingMenu, welderStamps, MASS_EDIT_COLUMNS, MASS_EDIT_SECTIONS,
  EDIT_TRACER_HINT, WELD_MANDATORY_MESSAGE,
  CERTIFICATE_NOT_SELECTABLE, DIAMETER_MESSAGES, DUPLICATE_WELDER, SIDE_VALUES, addNewEnabled, certificateLabel, certificateSelectable, certificateSelectionErrors, chargeDetails, chargeOptionList,
  compositeEnds, diameterErrors, diameterTextOrder, duplicateWelderErrors, editHistoryDate, editReason, newWeldDefaults, normalizeSizeInch, parseInchSize, specialWeldCleared, specialWeldHidden,
  weldDiameterCheck, weldFormLayout, wireLabel, wpsLabel,
  ADD_PRE_HT_LABEL, RANGE_DIALOG, WELDER_GROUP_LABELS, WELDER_PLACEHOLDER, chargeMaterialGroup, chargesForWelders, diameterRowSize, groupWeldersForDia, materialGroupWarnings, sortChargesForDia, suggestOnDia,
  welderFieldsDisabled, welderQualifiedByProcess, wpsValidationMode, welderOptionLabel, welderOptionList, weldersForWps, weldersQualifiedForDiameter, wpsChangeClearsWelders, wpsMatchesDiameter,
} from '../shared/weld-entry.ts';
import { ndtOrPwhtInProgress } from '../shared/inspections.ts';
import type { Row, User } from '../shared/types.ts';

const row = (id: string, data: Record<string, unknown> = {}) => ({ id, _version: 1, _archived: false, _createdAt: '', _updatedAt: '', ...data }) as Row;
const actor = { id: 'tester', name: 'Tester' };

// ---------------------------------------------------------------------------------------------------- pure rules

test('table order follows the stored order, then the weld number as numbers; moving and dropping keep every weld', () => {
  const welds = [row('c', { weldNo: '010' }), row('b', { weldNo: '9' }), row('a', { weldNo: '005A', sortOrder: 2 }), row('d', { weldNo: '010R1', sortOrder: 1 })];
  assert.deepEqual(orderedWelds(welds).map(w => w.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveWeld(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(moveWeld(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
  assert.equal(moveWeld(['a', 'b', 'c'], 'a', 'up'), null); assert.equal(moveWeld(['a', 'b', 'c'], 'c', 'down'), null); assert.equal(moveWeld(['a'], 'x', 'up'), null);
  assert.deepEqual(dropWeld(['a', 'b', 'c'], 'a', 'c'), ['b', 'a', 'c']); assert.deepEqual(dropWeld(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a']);
  assert.equal(dropWeld(['a', 'b', 'c'], 'b', 'c'), null, 'dropping where it already is changes nothing'); assert.equal(dropWeld(['a', 'b'], 'a', 'a'), null);
  assert.equal(neighbourOf(['a', 'b', 'c'], 'b', 'prev'), 'a'); assert.equal(neighbourOf(['a', 'b', 'c'], 'b', 'next'), 'c'); assert.equal(neighbourOf(['a', 'b', 'c'], 'a', 'prev'), null);
});

test('rule (a): mandatory fields apply only with the setting on and a welder on the weld', () => {
  const complete = { welder1Id: 'w', typeId: 't', wpsId: 'p', date: '2026-10-01', lengthMode: 'Diameter', diameterId: 'd', chargeNo1: 'EXISTING', certificate2Id: 'c' };
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, complete), {});
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: false }, { welder1Id: 'w' }), {}, 'setting off');
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, { typeId: '' }), {}, 'no welder yet');
  assert.deepEqual(Object.keys(missingMandatoryFields({ mandatoryFields: true }, { welder3Id: 'w' })).sort(), ['chargeNo1', 'chargeNo2', 'date', 'diameterId', 'typeId', 'wpsId']);
  // An explicit length replaces the diameter; a charge field or a certificate fills a charge number.
  assert.deepEqual(Object.keys(missingMandatoryFields({ mandatoryFields: true }, { ...complete, lengthMode: 'Length in mm', diameterId: '', dialen: null })), ['dialen']);
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, { ...complete, lengthMode: 'Length in mm', dialen: 120 }), {});
});

test('rule (b): a main project whose Validation on WPS was never saved keeps the older check by welding process and expiry on the weld date', () => {
  const wps = row('p', { name: 'WPS-141', processId: 'tig' });
  const certs: Record<string, Row[]> = { ok: [row('c1', { welderId: 'ok', processId: 'tig', expiresAt: '2027-01-01' })], old: [row('c2', { welderId: 'old', processId: 'tig', expiresAt: '2026-01-01' })], other: [row('c3', { welderId: 'other', processId: 'mma' })], none: [] };
  const ask = (site: Record<string, unknown>, weld: Record<string, unknown>, process: Row | undefined = wps) => welderWpsErrors(site, { wpsId: 'p', date: '2026-10-01', ...weld }, process, id => certs[id], id => id.toUpperCase(), '2026-11-16');
  assert.deepEqual(ask({}, { welder1Id: 'ok', welder2Id: 'ok' }), {});
  assert.deepEqual(Object.keys(ask({}, { welder1Id: 'ok', welder2Id: 'old', welder3Id: 'other', welder4Id: 'none' })), ['welder2Id', 'welder3Id', 'welder4Id']);
  assert.match(ask({}, { welder1Id: 'old' }).welder1Id, /OLD has no valid qualification for WPS WPS-141 on 2026-10-01/);
  assert.deepEqual(ask({}, { welder1Id: 'old', date: '2025-12-31' }), {}, 'the qualification was valid on the weld date');
  assert.deepEqual(Object.keys(ask({}, { welder1Id: 'old', date: '' })), ['welder1Id'], 'without a date, today counts');
  assert.deepEqual(ask({ wpsValidation: false }, { welder1Id: 'none' }), {}, 'setting off');
  assert.deepEqual(ask({}, { welder1Id: 'none' }, row('p', { name: 'WPS-X' })), {}, 'a WPS without a process reference cannot express a match: it passes');
  assert.deepEqual(ask({}, { welder1Id: 'none', wpsId: '' }), {}, 'no WPS yet');
  assert.equal(welderQualifiedForWps(null, [], '2026-10-01'), true);
});

test('rule (c): project certificates follow the welder-data project links (linked to the project or to all projects)', () => {
  // The welder-data flow owns the certificate-to-project link (certificate_projects); weld entry uses its rule.
  const links = [row('l1', { certificateId: 'listed', projectId: 'p1' }), row('l2', { certificateId: 'listed', projectId: 'p3' }), row('l3', { certificateId: 'elsewhere', projectId: 'p2' }), row('l4', { certificateId: 'gone-link', projectId: 'p1', _archived: true })];
  const certificates = [row('all'), row('every', { allProjects: true }), row('listed', { allProjects: false }), row('elsewhere', { allProjects: false }), row('gone-link', { allProjects: false }), row('archived', { allProjects: true, _archived: true })];
  const context = { links };
  assert.deepEqual(certificatesForProject(certificates, 'p1', context).map(c => c.id), ['all', 'every', 'listed']);
  assert.deepEqual(certificatesForProject(certificates, 'p2', context).map(c => c.id), ['all', 'every', 'elsewhere']);
  assert.deepEqual(certificateErrors({ projectCertificates: true }, { certificate1Id: 'elsewhere', certificate2Id: 'listed' }, [1, 2], certificates, 'p1', context), { certificate1Id: 'This certificate is not linked to the project.' });
  assert.deepEqual(certificateErrors({ projectCertificates: false }, { certificate1Id: 'elsewhere' }, [1], certificates, 'p1', context), {});
});

test('rule (d): a weld is locked once its phase is complete on the isometric (or released before the two steps), and unlocked when reopened', () => {
  const types = [row('shop', { name: 'Butt Weld - Shop', location: 'Shop' }), row('field', { name: 'Butt Weld - Field', location: 'Field' }), row('named', { name: 'Socket weld - Field' }), row('plain', { name: 'HOOK-UP' })];
  const releases = [row('r1', { isoId: 'i1', type: 'Field' }), row('r2', { isoId: 'i2', type: 'Prefab' }), row('r3', { isoId: 'i3', type: 'Hydrotest' }), row('r4', { isoId: 'i4', type: 'Field', _archived: true }), row('r5', { isoId: 'i5', type: 'Field', status: 'Reopened' }), row('r6', { isoId: 'i6', type: 'Prefab', status: 'Released' })];
  // i7 is Prefab complete on the isometric and has no release record at all (reference 0003: "Release not available").
  const isometrics = [row('i7', { prefabCompletedAt: '2026-11-02T08:00:00.000Z', prefabCompletedBy: 'Mila Kovač' }), row('i8', { fieldCompletedAt: '2026-11-02T08:00:00.000Z' })];
  const context = lockContext(types, releases, isometrics);
  const lock = (isoId: string, typeId: string) => weldLock({ isoId, typeId }, context);
  assert.deepEqual(lock('i7', 'shop'), { locked: true, release: 'Prefab', reason: 'Locked after Prefab complete' });
  assert.equal(lock('i7', 'field').locked, false, 'Prefab complete leaves the field welds open');
  assert.deepEqual(lock('i8', 'field'), { locked: true, release: 'Field', reason: 'Locked after Field complete' });
  assert.equal(lock('i8', 'shop').locked, false);
  assert.equal(weldLock({ isoId: 'i7', typeId: 'shop' }, lockContext(types, releases)).locked, false, 'without the isometrics only a release can lock');
  // Releases from before the two steps still count as completed.
  assert.equal(lock('i1', 'field').locked, true); assert.equal(lock('i1', 'field').release, 'Field'); assert.equal(lock('i1', 'named').locked, true, 'older types are read from their name');
  assert.equal(lock('i1', 'shop').locked, false, 'shop welds stay open with only a Field release');
  assert.equal(lock('i2', 'shop').locked, true); assert.equal(lock('i2', 'shop').release, 'Prefab'); assert.equal(lock('i2', 'field').locked, false);
  assert.equal(lock('i1', 'plain').locked, false, 'without a phase the weld is not locked'); assert.equal(weldLock({ isoId: 'i1' }, context).locked, false);
  assert.equal(lock('i3', 'field').locked, false, 'a hydrotest release does not lock welds'); assert.equal(lock('i4', 'field').locked, false, 'a removed release unlocks'); assert.equal(lock('i5', 'field').locked, false, 'a Reopened release unlocks');
  assert.equal(lock('i6', 'shop').reason, 'Locked after Prefab complete');
  assert.equal(lock('i1', 'field').reason, 'Locked after Field complete');
  assert.equal(weldLocation(row('x', { name: 'HOOK-UP' })), null);
});

test('Add welds (range): missing numbers only, written like the existing ones', () => {
  assert.deepEqual(planWeldRange(1, 4, ['W001', 'W003']), { numbers: ['W002', 'W004'], skipped: ['W001', 'W003'] });
  assert.deepEqual(planWeldRange(8, 11, ['W001', 'W010']), { numbers: ['W008', 'W009', 'W011'], skipped: ['W010'] });
  assert.deepEqual(planWeldRange(1, 3, ['005', '010', '010R1', '005A']).numbers, ['001', '002', '003']);
  assert.deepEqual(planWeldRange(10, 11, ['7', '8', '9']).numbers, ['10', '11'], 'unpadded numbers stay unpadded');
  assert.deepEqual(planWeldRange(1, 2, []).numbers, ['001', '002'], 'an empty isometric starts with three digits');
  assert.deepEqual(planWeldRange(5, 5, ['010']).numbers, ['005']);
  assert.deepEqual(planWeldRange(10, 10, ['W010']).numbers, [], 'a number written differently still counts as present');
  assert.deepEqual(planWeldRange('1', '2', ['A1', 'A2', 'A3', 'B1']).numbers, [], 'the most used prefix decides what exists');
  assert.deepEqual(weldNumberStyle(['W001', 'W002', 'X1']), { prefix: 'W', width: 3 });
  assert.throws(() => planWeldRange(5, 4, []), /End must not be lower/); assert.throws(() => planWeldRange(1.5, 4, []), /whole numbers/); assert.throws(() => planWeldRange(-1, 4, []), /whole numbers/); assert.throws(() => planWeldRange('', 4, []), /whole numbers/);
  assert.throws(() => planWeldRange(1, 501, []), /at most 500/); assert.equal(planWeldRange(1, 500, []).numbers.length, 500);
});

test('Mass edit: only changed fields are read, Clear date and a date exclude each other', () => {
  assert.deepEqual(readMassEdit({ kr: 'ignored', typeId: 'weld-type-1', ndoReq: true, repair: false, pos1: '' }).changes, { typeId: 'weld-type-1', ndoReq: true, repair: false });
  assert.deepEqual(readMassEdit({ clearDatefit: true }).changes, { datefit: '' }); assert.deepEqual(readMassEdit({ clearDate: true, date: '' }).changes, { date: '' });
  assert.match(readMassEdit({ clearDate: true, date: '2026-10-01' }).errors.date, /not both/);
  assert.deepEqual(readMassEdit({ diameterId: 'diameter-6' }).changes, { diameterId: 'diameter-6', lengthMode: 'Diameter' });
  assert.deepEqual(readMassEdit({ dialen: 80 }).changes, { dialen: 80, lengthMode: 'Length in mm' });
  assert.ok(readMassEdit({ dialen: 80, diameterId: 'd' }).errors.dialen); assert.ok(readMassEdit({ dialen: 0 }).errors.dialen); assert.ok(readMassEdit({ ndoReq: 'yes' }).errors.ndoReq);
  assert.ok(readMassEdit({}).errors._, 'nothing changed'); assert.ok(readMassEdit({ weldNo: '9', isoId: 'x' }).errors._, 'fields outside the list are not read');
});

test('table text: NDT percent, side summaries, material text and type abbreviations', () => {
  assert.equal(normalizedNdtPercent({ lengthMode: 'Length in mm', ndoReq: true, ndtpercent: 40 }), 40);
  assert.equal(normalizedNdtPercent({ lengthMode: 'Diameter', ndoReq: true, ndtpercent: 40 }), null); assert.equal(normalizedNdtPercent({ lengthMode: 'Length in mm', ndoReq: false, ndtpercent: 40 }), null);
  assert.equal(normalizedNdtPercent({ lengthMode: 'Length in mm', ndoReq: true, ndtpercent: '' }), null);
  const certificate = row('c', { indexNo: 'IX-1', chargeNo: 'H-1', diameter: '1/2"', schedule: '40', wallThickness: '7,2', materialCode: 'A106 Gr B' });
  assert.equal(certificateMaterialText({ certificate, materialPart: 'Pipe' }), '1/2"/40/7,2/A106 Gr B/Pipe');
  assert.equal(certificateMaterialText({ certificate: row('c2', { diameter: '2"' }), material: row('m', { lbs: 'SCH 40', materialGroup: 'Elbow' }) }), '2"/SCH 40/-/-/Elbow', 'every slot stays, an empty one reads -');
  assert.deepEqual(sideSummary({ chargeNo1: 'EXISTING' }, 1), { kind: 'existing', index: '', charge: '', material: 'EXISTING' });
  assert.equal(sideSummary({ chargeNo2: 'CONN ISO' }, 2).material, 'CONN ISO');
  assert.deepEqual(sideSummary({ chargeNo1: 'H-1' }, 1, { certificate }), { kind: 'certificate', index: 'IX-1', charge: 'H-1', material: '1/2"/40/7,2/A106 Gr B/-' });
  assert.equal(sideSummary({ chargeNo1: 'H-9' }, 1).kind, 'charge'); assert.equal(sideSummary({}, 2).kind, 'none');
  assert.equal(typeAbbreviation(row('t', { name: 'Butt Weld - Field', abbreviation: 'BWF' })), 'BWF'); assert.equal(typeAbbreviation(row('t', { name: 'Butt Weld - Field' })), 'BWF'); assert.equal(typeAbbreviation(null), '');
  assert.equal(weldDiameterText({ lengthMode: 'Length in mm', dialen: 95 }), '95 mm'); assert.equal(weldDiameterText({ lengthMode: 'Diameter' }, row('d', { diameter: '2"' })), '2"');
  const certificates = [certificate];
  assert.deepEqual(chargeSelection('EXISTING', 1, certificates), { chargeNo1: 'EXISTING', certificate1Id: '', material1Id: '' });
  assert.deepEqual(chargeSelection('c', 2, certificates), { chargeNo2: 'H-1', certificate2Id: 'c', material2Id: '' }); assert.deepEqual(chargeSelection('', 1, certificates), { chargeNo1: '', certificate1Id: '', material1Id: '' });
  assert.equal(chargeValue({ chargeNo1: 'CONN ISO', certificate1Id: '' }, 1), 'CONN ISO'); assert.equal(chargeValue({ chargeNo2: 'H-1', certificate2Id: 'c' }, 2), 'c'); assert.equal(isSideValue('existing'), false);
});

test('table cells: material keeps empty slots as -, EXISTING / CONN ISO show in Material only, one tooltip per welder, the type tooltip is the type name', () => {
  const cap = row('c', { diameter: '1"', schedule: '40', wallThickness: '7.2', indexNo: '3', chargeNo: 'H-3' });
  assert.equal(certificateMaterialText({ certificate: cap, materialPart: 'Cap' }), '1"/40/7.2/-/Cap');
  assert.equal(certificateMaterialText({ certificate: row('c3', {}) }), '-/-/-/-/-');
  assert.deepEqual(sideCellTexts(sideSummary({ chargeNo1: 'EXISTING' }, 1)), { index: '-', charge: '-', material: 'EXISTING' });
  assert.deepEqual(sideCellTexts(sideSummary({ chargeNo2: 'CONN ISO' }, 2)), { index: '-', charge: '-', material: 'CONN ISO' });
  assert.deepEqual(sideSummary({ chargeNo1: 'EXISTING' }, 1), { kind: 'existing', index: '', charge: '', material: 'EXISTING' });
  assert.deepEqual(sideCellTexts(sideSummary({}, 1)), { index: '-', charge: '-', material: '-' });
  assert.deepEqual(sideCellTexts(sideSummary({ chargeNo1: 'H-3' }, 1, { certificate: cap })), { index: '3', charge: 'H-3', material: '1"/40/7.2/-/-' });
  assert.deepEqual(welderStamps([row('a', { welderCode: 'ML396', name: 'Aleksandar Djuric' }), row('b', { number: 'W-2', name: '' })]), [{ code: 'ML396', name: 'Aleksandar Djuric' }, { code: 'W-2', name: 'W-2' }], 'one stamp per welder, each with its own tooltip');
  assert.deepEqual(welderStamps([]), []);
  const type = row('t', { name: 'Butt Weld - Field', abbreviation: 'FW', location: 'Field' });
  assert.equal(typeAbbreviation(type), 'FW'); assert.equal(locationTooltip(type), 'Butt Weld - Field'); assert.equal(locationTooltip(null), '-'); assert.equal(locationTooltip(row('u', {})), '-');
});

test('search over the weld table: every word must occur, case does not matter', () => {
  assert.equal(weldMatchesSearch('005 FW ML396 Butt Weld - Field', '005'), true); assert.equal(weldMatchesSearch('005 FW ML396', 'ml396 fw'), true);
  assert.equal(weldMatchesSearch('005 FW', '006'), false); assert.equal(weldMatchesSearch('005 FW', '005 xx'), false); assert.equal(weldMatchesSearch('anything', '  '), true);
});

test('Disable welds sorting: the flag is read from the isometric, the menu entry flips, the automatic order is the weld number', () => {
  assert.equal(weldSortingDisabled(row('i', {})), false, 'isometrics saved before have sorting on'); assert.equal(weldSortingDisabled(row('i', { weldSortingDisabled: true })), true);
  assert.deepEqual(weldSortingMenu(false), { checked: true, label: 'Disable welds sorting' }); assert.deepEqual(weldSortingMenu(true), { checked: false, label: 'Enable welds sorting' });
  const welds = [row('c', { weldNo: '010', sortOrder: 1 }), row('b', { weldNo: '9', sortOrder: 2 }), row('a', { weldNo: '005', sortOrder: 3 })];
  assert.deepEqual(orderedWelds(welds).map(w => w.id), ['c', 'b', 'a']); assert.deepEqual(orderedWelds(welds, true).map(w => w.id), ['a', 'b', 'c'], 'the stored order is ignored while sorting is off');
  assert.equal(orderFailureMessage(new Error('The welds of this isometric changed.')), 'The welds of this isometric changed.'); assert.equal(orderFailureMessage(new Error('')), 'Something went wrong.'); assert.equal(orderFailureMessage(undefined), 'Something went wrong.');
});

test('Options menu: the reference order, with Punch list after the Pre-HT/PWHT upload and without Upload NDT on multiple welds', () => {
  assert.deepEqual(WELD_OPTIONS_MENU.map(entry => entry.label), ['Attachments', 'Visual inspection', 'Generate Mass NDT-Pre request', 'Generate Mass NDT request', 'Generate Mass Pre-HT/PWHT request', 'Upload Pre-HT/PWHT on multiple welds', 'Punch list', 'Audit trail', 'Set phase', 'Show deleted welds', 'Delete selected', 'Disable welds sorting']);
  assert.deepEqual(WELD_OPTIONS_MENU.filter(entry => entry.dividerBefore).map(entry => entry.label), ['Delete selected', 'Disable welds sorting']);
  assert.equal(WELD_OPTIONS_MENU.some(entry => /Upload NDT/.test(entry.label)), false);
});

test('Mass edit: the dialog has the reference labels in order, the rule checks four fields and only when a welder is set', () => {
  assert.deepEqual(massEditLabels(), ['Weld type', 'Welder', 'Welder 3', 'Coating 1', 'Welding wire 1', 'Pos 1', 'Charge number 1', 'WPS number', 'Welder 2', 'Welder 4', 'Coating 2', 'Welding wire 2', 'Pos 2', 'Charge number 2',
    'Fit-up Date', 'Clear date', 'Weld Date', 'Clear date', 'Dia.', 'NDT Req. Pre', 'NDT Req.', 'Pre-HT', 'PWHT Req.', 'Repair', 'Tracer',
    'NDT Pre', 'NDT location Pre', 'NDT process', 'NDT process', 'NDT process', 'NDT process', 'NDT process', 'NDT', 'NDT location', 'NDT process', 'NDT process', 'NDT process', 'NDT process', 'NDT process',
    'Pre-HT / PWHT', 'PWHT location Pre', 'PWHT process Pre', 'PWHT location', 'PWHT process']);
  assert.ok(!massEditLabels().includes('Weld process') && !massEditLabels().includes('Length in mm'), 'Weld process is hidden; Length in mm only after the length option');
  assert.ok(massEditLabels(true).includes('Length in mm'));
  for (const entry of [...MASS_EDIT_COLUMNS.flat(), ...MASS_EDIT_SECTIONS.flatMap(section => section.items)]) assert.ok(MASS_EDIT_FIELDS.includes(entry.name), `${entry.name} is a field the server accepts`);
  const site = { mandatoryFields: true }, weld = { welder1Id: 'w', typeId: 't', wpsId: 'p', date: '2026-10-01', lengthMode: 'Diameter', diameterId: 'd' };
  assert.deepEqual(massEditMissingFields(site, weld, { typeId: 'x' }), [], 'no welder set by the mass edit: no check (charge numbers are never checked)');
  assert.deepEqual(massEditMissingFields(site, weld, { welder2Id: 'w2', clearDate: true, date: '' }), [], 'Welder 2 to 4 do not count');
  assert.deepEqual(massEditMissingFields(site, weld, { welder1Id: 'w2' }), [], 'complete welds without charge numbers pass');
  assert.deepEqual(massEditMissingFields(site, { typeId: '' }, { welder1Id: 'w' }), ['typeId', 'wpsId', 'date', 'diameterId']);
  assert.deepEqual(massEditMissingFields(site, weld, { welder1Id: 'w', date: '' }), ['date'], 'Clear date counts as an empty date');
  assert.deepEqual(massEditMissingFields(site, { ...weld, diameterId: '' }, { welder1Id: 'w', dialen: 90, lengthMode: 'Length in mm' }), [], 'an explicit length stands for the diameter');
  assert.deepEqual(massEditMissingFields({ mandatoryFields: false }, {}, { welder1Id: 'w' }), [], 'setting off');
  assert.match(MASS_EDIT_MANDATORY_MESSAGE, /\(Weld type, WPS, Weld Date, Dia\.\)\.$/);
  assert.equal(stampOptionLabel(row('q', { name: 'Morgan Lee', stamp: 'ML-07' })), 'Morgan Lee / ML-07'); assert.equal(stampOptionLabel(row('q', { name: 'Zivorad Jovanovic' })), 'Zivorad Jovanovic / ');
});

// ---------------------------------------------------------------------------------------------------- the Add / Edit weld form

test('weld form layout: Add weld is one flat form with all four welders and without the Edit-only fields; Edit weld follows the reference order', () => {
  const labels = (mode: 'add' | 'edit') => weldFormLayout(mode).map(column => column.map(item => item.label));
  // weld-iso-welds-014 / -015: three columns, Welder 2-4 always there, Dia. and Charge number 1/2 in the open form.
  assert.deepEqual(labels('add'), [
    ['Weld no.', 'Weld type', 'Welder', 'Welder 3', 'Coating 1', 'Welding wire 1', 'Pos 1', 'Charge number 1'],
    ['WPS number', 'Welder 2', 'Welder 4', 'Coating 2', 'Welding wire 2', 'Pos 2', 'Charge number 2'],
    ['Fitup date', 'Weld Date', 'Dia.', 'Length in mm', 'Spool', 'NDT Req. Pre', 'NDT Req.', 'Pre-WHT', 'PWHT Req.', 'Repair', 'Tracer'],
  ]);
  assert.ok(!labels('add').flat().includes('Multiple welders?'));
  // weld-iso-welds-016: the Edit-only fields and Weld process are not in Add weld; Edit has them (Weld process never).
  const editOnly = ['Coating weld', 'KR', 'FP', 'Sleeve', 'Ins. length 1', 'Ins. length 2', 'Upd. prev. weld', 'Upd. next weld', 'NDT percent'];
  for (const label of editOnly) { assert.ok(!labels('add').flat().includes(label), `Add: ${label}`); assert.ok(labels('edit').flat().includes(label), `Edit: ${label}`); }
  for (const mode of ['add', 'edit'] as const) assert.ok(!weldFormLayout(mode).flat().some(item => item.name === 'processId'), `${mode}: Weld process is hidden`);
  assert.deepEqual(labels('edit')[0], ['Weld no.', 'Weld type', 'Welder', 'Welder 3', 'Coating 1', 'Coating weld', 'KR', 'FP', 'Welding wire 1', 'Pos 1', 'Charge number 1', 'Upd. prev. weld']);
  assert.deepEqual(labels('edit')[1], ['WPS number', 'Welder 2', 'Welder 4', 'Coating 2', 'Sleeve', 'Ins. length 1', 'Ins. length 2', 'Welding wire 2', 'Pos 2', 'Charge number 2', 'Upd. next weld']);
  assert.deepEqual(labels('edit')[2].slice(0, 2), ['Fitup Date', 'Weld Date']);
  assert.equal(EDIT_TRACER_HINT, 'Tracer is assigned via NDT / dashboard, not here.');
});

test('weld form defaults and buttons: Weld Date is today on a new weld; Add new only for a changed, free weld number', () => {
  assert.deepEqual(newWeldDefaults('2026-11-16'), { date: '2026-11-16' }, 'weld-iso-welds-021');
  // weld-iso-welds-023
  const existing = ['001', '002', '005A'];
  assert.equal(addNewEnabled('001', '001', existing), false, 'unchanged');
  assert.equal(addNewEnabled('002', '001', existing), false, 'taken');
  assert.equal(addNewEnabled(' 003 ', '001', existing), true);
  assert.equal(addNewEnabled('', '001', existing), false);
});

test('weld form rules: the same welder twice, special weld numbers, live mandatory fields', () => {
  // weld-iso-welds-024
  assert.deepEqual(duplicateWelderErrors({ welder1Id: 'a', welder2Id: 'b', welder3Id: 'a', welder4Id: '' }), { welder3Id: DUPLICATE_WELDER });
  assert.deepEqual(duplicateWelderErrors({ welder1Id: 'a', welder2Id: 'b' }), {});
  assert.equal(DUPLICATE_WELDER, 'This welder is already selected in another field.');
  // weld-iso-welds-026: what each code clears and hides.
  assert.ok(specialWeldCleared('E').includes('welder1Id') && specialWeldCleared('E').includes('chargeNo2') && !specialWeldCleared('E').includes('chargeNo1'));
  assert.ok(specialWeldCleared('GAP').includes('chargeNo1')); assert.ok(specialWeldCleared('SP').includes('chargeNo1'));
  assert.ok(specialWeldCleared('E').includes('spoolId')); assert.ok(!specialWeldCleared('B').includes('spoolId')); assert.ok(!specialWeldCleared('SP').includes('spoolId'));
  assert.deepEqual(specialWeldCleared(null), []);
  const add = specialWeldHidden('E', 'add');
  for (const name of ['typeId', 'wpsId', 'welder1Id', 'welder4Id', 'coating1Id', 'wire2Id', 'chargeNo2', 'spoolId']) assert.ok(add.has(name), name);
  for (const name of ['weldNo', 'datefit', 'date', 'diameterId', 'pos1', 'pos2', 'chargeNo1', 'ndoReq', 'tracer']) assert.ok(!add.has(name), name);
  assert.ok(specialWeldHidden('GAP', 'add').has('chargeNo1')); assert.ok(!specialWeldHidden('B', 'add').has('spoolId'));
  const visible = (code: 'E' | 'B' | 'SP', mode: 'add' | 'edit') => weldFormLayout(mode).flat().map(item => item.name).filter(name => !specialWeldHidden(code, mode).has(name));
  assert.deepEqual(visible('E', 'edit'), ['weldNo', 'pos1', 'chargeNo1']); assert.deepEqual(visible('B', 'edit'), ['weldNo', 'pos1', 'chargeNo1', 'spoolId']); assert.deepEqual(visible('SP', 'edit'), ['weldNo', 'spoolId']);
  assert.equal(specialWeldHidden(null, 'add').size, 0);
  // Special numbers skip the mandatory fields (weld-iso-welds-026) and the check is the one sentence (weld-iso-welds-032).
  assert.deepEqual(missingMandatoryFields({ mandatoryFields: true }, { weldNo: 'E01', welder1Id: 'w' }), {});
  assert.equal(Object.keys(missingMandatoryFields({ mandatoryFields: true }, { weldNo: '001', welder1Id: 'w' })).length, 6);
  assert.equal(WELD_MANDATORY_MESSAGE, 'Fill Weld type, WPS, Weld Date, Dia., Charge number 1 and Charge number 2 before saving.');
});

test('charge numbers: 13 fixed part placeholders, disabled certificates, the reference option texts and the material table', () => {
  // weld-iso-welds-028
  assert.deepEqual([...SIDE_VALUES], ['CONN ISO', 'EXISTING', '1 / Pipe', '2 / Elbow 45', '3 / Elbow 90', '4 / Flange', '5 / Tee', '6 / Reducer', '7 / Nipple', '8 / Valve', '9 / Cap', '10 / Swivel Flange', '11 / Swivel Male', '12 / Ball race', '13 / Female Flange']);
  assert.deepEqual(chargeSelection('10 / Swivel Flange', 1, []), { chargeNo1: '10 / Swivel Flange', certificate1Id: '', material1Id: '' }, 'a placeholder is stored like EXISTING');
  assert.equal(chargeValue({ chargeNo2: '13 / Female Flange', certificate2Id: '' }, 2), '13 / Female Flange');
  const lookups = { diameters: new Map([['d1', row('d1', { diameter: '1/2"', sizeinch: 0.5 })]]), materialTypes: new Map([['t1', row('t1', { name: 'A106 Gr B' })]]), materialParts: new Map([['p1', row('p1', { name: 'Pipe' })]]), materials: new Map([['m1', row('m1', { materialNo: '7633186631' })]]) };
  const good = row('c1', { chargeNo: '11111', diameterId: 'd1', schedule: '40', materialPartId: 'p1', materialTypeId: 't1', materialId: 'm1', indexNo: '0001', controlled: true, accepted: true });
  const unaccepted = row('c2', { chargeNo: '564321', diameter: '1"', schedule: '40', controlled: true, accepted: false });
  assert.equal(certificateLabel(good, lookups), '11111 / 1/2" / 40 / Pipe / A106 Gr B / 7633186631');
  assert.equal(certificateLabel(unaccepted, lookups), '564321 / 1" / 40 /  /  / ', 'empty parts keep their place');
  const add = chargeOptionList([good, unaccepted], 'add', lookups), edit = chargeOptionList([good, unaccepted], 'edit', lookups);
  assert.deepEqual(add.map(option => option.value), ['c1', 'c2', ...SIDE_VALUES], 'Add weld and Mass edit: certificates first');
  assert.deepEqual(edit.map(option => option.value), [...SIDE_VALUES, 'c1', 'c2'], 'Edit weld: the fixed values first');
  // weld-iso-welds-029 / scn-SC-D2: a certificate that is not Controlled + Accepted is offered disabled.
  assert.deepEqual(add.filter(option => option.disabled).map(option => option.value), ['c2']);
  assert.equal(certificateSelectable(good), true); assert.equal(certificateSelectable(unaccepted), false); assert.equal(certificateSelectable(row('c3', { accepted: true })), false);
  assert.deepEqual(certificateSelectionErrors({ certificate1Id: 'c2', certificate2Id: 'c1' }, [1, 2], [good, unaccepted]), { certificate1Id: CERTIFICATE_NOT_SELECTABLE });
  // weld-iso-welds-031
  assert.deepEqual(chargeDetails(good, lookups), [['Index number', '0001'], ['Material', 'A106 Gr B'], ['Description', 'Pipe'], ['Diameter', '1/2"']]);
  assert.deepEqual(chargeDetails(undefined, lookups), [], 'nothing for blank, CONN ISO, EXISTING or a placeholder');
  // weld-iso-welds-038
  const wps = row('w', { name: '11111', method: '141-2-GTAW', definition: '141-2' });
  assert.equal(wpsLabel(wps), '11111 | 141-2-GTAW (141-2)'); assert.equal(wpsLabel(wps, 'mass'), '141-2-GTAW | 11111 (141-2)');
  assert.equal(wireLabel(row('x', { name: '0002', chargeNo: '110', classification: 'ad', typeMaterial: 'sddfs', diameter: 225 })), '110 / ad / sddfs / 225.0 mm');
  assert.deepEqual(diameterTextOrder(['10', '0,5', '1.5', '1,5', '-', '2', '.'].map(label => ({ label }))).map(option => option.label), ['-', '.', '0,5', '1,5', '1.5', '10', '2']);
});

test('Dia. must equal the diameter of the chosen charges, with a Default diameter choice when the two differ', () => {
  const diameters = new Map([['half', row('half', { diameter: '1/2"', sizeinch: 0.5 })], ['two', row('two', { diameter: '2"', sizeinch: 2 })], ['four', row('four', { diameter: '4"', sizeinch: 4 })], ['red', row('red', { diameter: '4"x2"' })]]);
  const certificates = new Map([['c-half', row('c-half', { diameterId: 'half' })], ['c-two', row('c-two', { diameterId: 'two' })], ['c-four', row('c-four', { diameterId: 'four' })], ['c-red', row('c-red', { diameterId: 'red' })], ['c-old', row('c-old', { diameter: '1.1/2"' })]]);
  const context = { certificates, diameters };
  const errors = (weld: Record<string, unknown>) => diameterErrors({ weldNo: '001', lengthMode: 'Diameter', ...weld }, context);
  assert.deepEqual(errors({ certificate1Id: 'c-half', chargeNo1: 'H', diameterId: 'four' }), { diameterId: 'Dia. must equal the diameter of charge 1/2 (0.5).' });
  assert.deepEqual(errors({ certificate1Id: 'c-half', chargeNo1: 'H', diameterId: 'half' }), {});
  assert.deepEqual(errors({ certificate1Id: 'c-half', chargeNo1: 'H' }), { diameterId: 'Dia. must be chosen and match the diameter of charge 1/2 (0.5).' });
  assert.deepEqual(errors({ certificate1Id: 'c-red', chargeNo1: 'R', diameterId: 'two' }), {}, 'a reducer allows both ends');
  assert.deepEqual(errors({ certificate1Id: 'c-old', chargeNo1: 'O', diameterId: 'two' }), { diameterId: 'Dia. must equal the diameter of charge 1/2 (1.5).' }, 'an older certificate is read from its diameter text');
  // Two charges without a common size: the Default diameter decides.
  assert.deepEqual(errors({ certificate1Id: 'c-two', chargeNo1: 'A', certificate2Id: 'c-four', chargeNo2: 'B', diameterId: 'two' }), { diameterId: DIAMETER_MESSAGES.pick });
  assert.equal(weldDiameterCheck({ certificate1Id: 'c-two', chargeNo1: 'A', certificate2Id: 'c-four', chargeNo2: 'B' }, context).choices.join(','), '2,4');
  assert.deepEqual(errors({ certificate1Id: 'c-two', chargeNo1: 'A', certificate2Id: 'c-four', chargeNo2: 'B', diameterId: 'two', defaultDiameter: '2' }), {});
  assert.deepEqual(errors({ certificate1Id: 'c-two', chargeNo1: 'A', certificate2Id: 'c-four', chargeNo2: 'B', diameterId: 'two', defaultDiameter: '4' }), { diameterId: 'Dia. must equal the diameter of charge 1/2 (4).' });
  assert.deepEqual(errors({ certificate1Id: 'c-two', chargeNo1: 'A', certificate2Id: 'c-red', chargeNo2: 'B', diameterId: 'two' }), {}, 'a shared size needs no choice');
  // Not checked: a special number, an explicit length, no certificate (EXISTING, CONN ISO, placeholders).
  assert.deepEqual(errors({ weldNo: 'E01', certificate1Id: 'c-half', chargeNo1: 'H', diameterId: 'four' }), {});
  assert.deepEqual(errors({ lengthMode: 'Length in mm', certificate1Id: 'c-half', chargeNo1: 'H' }), {});
  assert.deepEqual(errors({ chargeNo1: 'EXISTING', chargeNo2: '4 / Flange', diameterId: 'four' }), {});
  assert.equal(normalizeSizeInch('0,50"'), '0.5'); assert.equal(parseInchSize('3/4'), '0.75'); assert.deepEqual(compositeEnds('4" x 2"'), ['4', '2']);
});

test('NDT or PWHT in progress: an open NDT (Pre) or Pre-HT / PWHT request; the reason is kept as plain text', () => {
  const requests = [row('r1', { weldId: 'a', type: 'NDT', status: 'Open' }), row('r2', { weldId: 'b', type: 'NDT', status: 'Accepted' }), row('r3', { weldId: 'c', type: 'PWHT', status: 'Open' }), row('r4', { weldId: 'd', type: 'VI', status: 'Open' }), row('r5', { weldId: 'e', type: 'NDT PRE', status: 'Open', _archived: true })];
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].filter(id => ndtOrPwhtInProgress(requests, id)), ['a', 'c']);
  assert.equal(editReason('  <p>Charge&nbsp;corrected</p> '), 'Charge corrected'); assert.equal(editReason('<p><br></p>'), '');
  assert.match(editHistoryDate('2024-05-28T11:33:16'), /^28\.05\.2024 11:33:16$/);
});

// ---------------------------------------------------------------------------------------------------- through HTTP

async function fixture(t: { after: (fn: () => Promise<void>) => void }, profile: ReleaseProfile = HOSTED_RELEASE_PROFILE) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-weld-entry-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: profile, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '', pilot = 'weld';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', ...(profile === HOSTED_RELEASE_PROFILE ? { 'X-Stelux-Pilot': pilot } : {}), Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  const password = 'Weld-Entry-Test-Password';
  const signIn = async (name: string, levels: Record<string, string>) => {
    const profileRow = store.create('profiles', { name, ...levels });
    const user = store.create('users', { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.test`, profileId: profileRow.id, active: true });
    store.db.prepare('INSERT INTO credentials VALUES (?,?)').run(user.id, passwordHash(password));
    assert.equal((await request('/api/auth/login', 'POST', { email: user.email, password })).status, 200);
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Weld admin', email: 'weld-admin@example.test', password })).status, 201);
  const act = async (key: string, data: unknown) => { const response = await request(`/api/actions/${key}`, 'POST', data); return { status: response.status, body: await response.json() as Record<string, any> }; };
  return { store, request, act, signIn, usePilot: (key: string) => { pilot = key; } };
}
const complete = { isoId: 'iso-1', typeId: 'weld-type-1', wpsId: 'wps-1', date: '2026-10-22', welder1Id: 'welder-1', diameterId: 'diameter-6', chargeNo1: 'EXISTING', chargeNo2: 'CONN ISO' };
const orderOf = (store: Store, isoId: string) => orderedWelds(store.list('welds').filter(w => w.isoId === isoId)).map(w => w.id);
const archiveRelease = (store: Store, isoId: string, type: string) => { const release = store.list('releases').find(r => r.isoId === isoId && r.type === type)!; store.archive('releases', release.id, release._version, actor); };

test('the hosted profile delivers the weld entry fields and actions; other profiles keep their weld fields and actions', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const field of ['processId', 'coating2Id', 'coatingWeldId', 'sleeve', 'kr', 'fp', 'insLength', 'insLength2', 'sortOrder', 'chargeNo1', 'welder4Id']) assert.ok(hosted.resources.welds.includes(field), field);
  for (const key of ['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']) assert.ok(hosted.actions[key], key);
  for (const profile of ['welding-demo', 'access-prototype'] as const) {
    const other = availabilityFor(profile)!;
    for (const key of ['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']) assert.equal(other.actions[key], undefined, `${profile} ${key}`);
    for (const field of ['processId', 'coatingWeldId', 'sortOrder']) assert.ok(!other.resources.welds.includes(field), `${profile} ${field}`);
  }
  assert.equal(availabilityFor('full'), undefined);
});

test('save-weld creates a weld at the end of the table and enforces mandatory fields, validation on WPS and project certificates', async t => {
  const f = await fixture(t);
  // (a) mandatory fields on the North main project: a welder without the rest is refused with a message per field.
  let result = await f.act('save-weld', { isoId: 'iso-1', weldNo: 'W040', welder1Id: 'welder-1' });
  assert.equal(result.status, 422); assert.deepEqual(Object.keys(result.body.fields).sort(), ['chargeNo1', 'chargeNo2', 'date', 'diameterId', 'typeId', 'wpsId']);
  assert.equal(result.body.error, WELD_MANDATORY_MESSAGE, 'weld-iso-welds-032: the reference sentence, the fields are marked');
  assert.equal(f.store.list('welds').some(w => w.weldNo === 'W040'), false);
  result = await f.act('save-weld', { ...complete, weldNo: 'W040' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const created = f.store.get('welds', result.body.record.id);
  assert.equal(created.sortOrder, 5, 'after the four welds of the isometric'); assert.equal(orderOf(f.store, 'iso-1').at(-1), created.id);
  assert.equal(created.chargeNo1, 'EXISTING'); assert.equal(created.chargeNo2, 'CONN ISO');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W040' })).status, 409, 'weld numbers are unique on an isometric');
  // The same incomplete weld is fine where the setting is off (Riverside).
  assert.equal((await f.act('save-weld', { isoId: 'iso-5', weldNo: 'W090', welder1Id: 'welder-1' })).status, 201);
  // (b) validation on WPS (on at North): the WPS listed on a valid qualification document of the welder decides.
  const outsider = f.store.create('welders', { number: 'W-009', name: 'Pat Quinn', status: 'Active', globallyDeployable: true });
  result = await f.act('save-weld', { ...complete, weldNo: 'W041', welder1Id: outsider.id });
  assert.equal(result.status, 422); assert.match(result.body.fields.welder1Id, /Pat Quinn has no valid qualification for WPS STX-WPS-141-01/);
  const expiring = f.store.create('welder_certificates', { name: 'WQ-OLD', welderId: outsider.id, isDocument: true, wpsIds: 'wps-1', expiresAt: '2026-06-30' });
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W041', welder1Id: outsider.id })).status, 422, 'expired before the weld date');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W041', welder1Id: outsider.id, date: '2026-06-01' })).status, 201, 'valid on the weld date');
  f.store.update('welder_certificates', expiring.id, { expiresAt: '2027-06-30' }, expiring._version);
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W042', welder1Id: outsider.id })).status, 201);
  // (c) project certificates: a certificate of the Riverside project is refused on North and accepted on Riverside.
  const foreign = { chargeNo1: 'H-2210', certificate1Id: 'certificate-2' };
  result = await f.act('save-weld', { ...complete, weldNo: 'W043', ...foreign });
  assert.equal(result.status, 422); assert.equal(result.body.fields.certificate1Id, 'This certificate is not linked to the project.');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W043', chargeNo1: 'H-1043', certificate1Id: 'cert-h1043' })).status, 201, 'a certificate linked to the project');
  assert.equal((await f.act('save-weld', { ...complete, isoId: 'iso-5', weldNo: 'W091', ...foreign, diameterId: 'diameter-9' })).status, 201, 'the setting is off on Riverside');
});

test('save-weld edits send only changed fields, clears the NDT percent when it stops applying and refuses a tracer change on edit', async t => {
  const f = await fixture(t);
  const weld = f.store.get('welds', 'weld-5');
  let result = await f.act('save-weld', { weldId: weld.id, expectedVersion: weld._version, lengthMode: 'Length in mm', dialen: 95, ndoReq: true, ndtpercent: 40 });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(f.store.get('welds', weld.id).ndtpercent, 40);
  result = await f.act('save-weld', { weldId: weld.id, ndoReq: false });
  assert.equal(result.status, 201); assert.equal(f.store.get('welds', weld.id).ndtpercent, null, 'NDT percent only exists with NDT required');
  assert.equal(f.store.get('welds', weld.id).dialen, 95, 'untouched fields keep their value');
  assert.equal((await f.act('save-weld', { weldId: weld.id, expectedVersion: 1, kr: 'x' })).status, 409, 'stale form');
  assert.equal((await f.act('save-weld', { weldId: weld.id, isoId: 'iso-1', kr: 'x' })).status, 422, 'a weld stays on its isometric');
  result = await f.act('save-weld', { weldId: weld.id, tracer: true });
  assert.equal(result.status, 422, 'Edit weld shows the tracer disabled'); assert.equal(result.body.fields.tracer, EDIT_TRACER_HINT);
  const refused = await f.request(`/api/records/welds/${weld.id}`, 'PUT', { tracer: true, _version: f.store.get('welds', weld.id)._version });
  assert.equal(refused.status, 422); assert.equal(f.store.get('welds', weld.id).tracer, false);
});

test('Upd. prev. weld and Upd. next weld copy the charge to the adjoining side of the neighbour in table order', async t => {
  const f = await fixture(t);
  assert.deepEqual(orderOf(f.store, 'iso-1'), ['weld-1', 'weld-10', 'weld-19', 'weld-28']);
  const weld = f.store.get('welds', 'weld-10');
  const result = await f.act('save-weld', { weldId: weld.id, expectedVersion: weld._version, chargeNo1: 'H-1043', certificate1Id: 'cert-h1043', material1Id: 'material-2', chargeNo2: 'EXISTING', certificate2Id: '', material2Id: '', diameterId: 'diameter-6', updatePrev: true, updateNext: true });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const previous = f.store.get('welds', 'weld-1'), next = f.store.get('welds', 'weld-19');
  assert.deepEqual([previous.chargeNo2, previous.certificate2Id, previous.material2Id], ['H-1043', 'cert-h1043', 'material-2'], 'charge 1 goes to side 2 of the previous weld');
  assert.deepEqual([next.chargeNo1, next.certificate1Id, next.material1Id], ['EXISTING', '', ''], 'charge 2 goes to side 1 of the next weld');
  assert.equal(previous.chargeNo1, 'H-1042', 'the other side of the neighbour is untouched');
  assert.equal(result.body.records.length, 3);
  // No neighbour on that side is not an error; a locked neighbour refuses the whole save and nothing changes.
  const first = f.store.get('welds', 'weld-1');
  assert.equal((await f.act('save-weld', { weldId: first.id, expectedVersion: first._version, chargeNo1: 'EXISTING', certificate1Id: '', material1Id: '', updatePrev: true })).status, 201);
  assert.deepEqual(orderOf(f.store, 'iso-9'), ['weld-9', 'weld-18', 'weld-27']);
  const open = f.store.get('welds', 'weld-18');
  // Its side 2 is a 2" certificate, so Dia. follows (the sample weld still has 4").
  const locked = await f.act('save-weld', { weldId: open.id, expectedVersion: open._version, chargeNo1: 'EXISTING', diameterId: 'diameter-6', updatePrev: true });
  assert.equal(locked.status, 423); assert.equal(f.store.get('welds', 'weld-18')._version, open._version); assert.equal(f.store.get('welds', 'weld-9').chargeNo2, 'H-1042');
});

test('rule (d) through HTTP: Prefab / Field complete lock their welds and the inspection results of those welds (423) until reopened', async t => {
  const f = await fixture(t);
  const location = (weld: Row) => f.store.get('weld_types', String(weld.typeId)).location;
  const welds = f.store.list('welds').filter(weld => weld.isoId === 'iso-1');
  const shop = welds.find(weld => location(weld) === 'Shop')!, field = welds.find(weld => location(weld) === 'Field')!;
  // A VT report on the field weld, generated before the phases are completed.
  const vt = runAction(f.store, 'visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [field.id] }, SYSTEM).record!;
  // Marked complete without any release record (the sample's open NDT is skipped by the system actor).
  runAction(f.store, 'complete-phase', { isoId: 'iso-1', type: 'Prefab' }, SYSTEM);
  runAction(f.store, 'complete-phase', { isoId: 'iso-1', type: 'Field' }, SYSTEM);
  assert.equal(f.store.list('releases').filter(row => row.isoId === 'iso-1').length, 0, 'Complete makes no release record');
  let result = await f.act('save-weld', { weldId: shop.id, kr: 'K9' });
  assert.deepEqual([result.status, result.body.error], [423, 'Locked after Prefab complete']);
  result = await f.act('save-weld', { weldId: field.id, kr: 'K9' });
  assert.deepEqual([result.status, result.body.error], [423, 'Locked after Field complete']);
  assert.equal((await f.request(`/api/records/welds/${shop.id}`, 'PUT', { description: 'Changed', _version: f.store.get('welds', shop.id)._version })).status, 423);
  // scn-SB-D1: an NDT result on a locked weld is refused and the stored results stay as they were.
  const before = JSON.stringify(f.store.list('inspection_results').filter(row => row.weldId === shop.id || row.weldId === field.id));
  for (const weld of [shop, field]) {
    result = await f.act('inspection-upload', { type: 'NDT', weldIds: [weld.id], rounds: [{ round: 'Initial', reportNo: 'RT-SB-9', result: 'Accepted' }] });
    assert.equal(result.status, 423, JSON.stringify(result.body)); assert.match(result.body.error, new RegExp(`Weld ${weld.weldNo}: Locked after ${location(weld) === 'Shop' ? 'Prefab' : 'Field'} complete`));
  }
  assert.equal((await f.act('pwht-upload', { weldIds: [shop.id], reportNo: 'PW-1', date: '2026-11-02' })).status, 423);
  assert.equal((await f.act('visual-inspection', { weldIds: [field.id], accepted: [field.id], reportNo: 'VT-1', date: '2026-11-02' })).status, 423);
  // The VT report operations of the Visual inspection hub, and the NDT dialog, are refused on locked welds too.
  assert.equal((await f.act('visual-inspection', { op: 'generate', isoId: 'iso-1', weldIds: [shop.id] })).status, 423, 'VT generate');
  assert.equal((await f.act('visual-inspection', { op: 'marks', reportId: vt.id, accepted: [field.id], date: '2026-11-02' })).status, 423, 'VT A/NA');
  assert.equal((await f.act('visual-inspection', { op: 'delete', reportIds: [vt.id] })).status, 423, 'VT delete takes the results of locked welds');
  assert.equal(f.store.get('visual_reports', vt.id)._archived, false);
  assert.equal((await f.act('ndt-weld', { weldId: shop.id, type: 'NDT' })).status, 423, 'NDT dialog');
  assert.equal(JSON.stringify(f.store.list('inspection_results').filter(row => row.weldId === shop.id || row.weldId === field.id)), before);
  // The completion fields cannot be written through the record routes.
  const iso = f.store.get('isometrics', 'iso-1');
  assert.equal((await f.request('/api/records/isometrics/iso-1', 'PUT', { description: 'Changed', prefabCompletedAt: '', fieldCompletedBy: 'Forged', _version: iso._version })).status, 200);
  const after = f.store.get('isometrics', 'iso-1');
  assert.deepEqual([after.description, after.prefabCompletedAt, after.fieldCompletedBy], ['Changed', iso.prefabCompletedAt, iso.fieldCompletedBy], 'the other fields save, the completion stays');
  // Reopen Prefab while Field stays completed (reference 0003: both Reopen buttons are offered independently).
  result = await f.act('reopen-release', { isoId: 'iso-1', type: 'Prefab', reason: 'Charge number on a shop weld corrected' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(f.store.get('isometrics', 'iso-1').prefabCompletedAt, ''); assert.ok(f.store.get('isometrics', 'iso-1').fieldCompletedAt, 'Field stays completed');
  assert.equal((await f.act('save-weld', { weldId: shop.id, kr: 'K9' })).status, 201);
  assert.equal((await f.act('inspection-upload', { type: 'NDT', weldIds: [shop.id], rounds: [{ round: 'Initial', reportNo: 'RT-SB-9', result: 'Accepted' }] })).status, 201);
  assert.equal((await f.act('save-weld', { weldId: field.id, kr: 'K9' })).status, 423, 'the field welds stay locked');
});

test('rule (d) through HTTP: locked welds cannot be edited, deleted or restored; reopening the release unlocks them; shop and field are separate', async t => {
  const f = await fixture(t);
  // iso-3 has a Prefab and a Field release: weld-3 is a shop weld, weld-12 a field weld.
  assert.equal(f.store.get('weld_types', f.store.get('welds', 'weld-3').typeId as string).location, 'Shop'); assert.equal(f.store.get('weld_types', f.store.get('welds', 'weld-12').typeId as string).location, 'Field');
  for (const id of ['weld-3', 'weld-12']) {
    const weld = f.store.get('welds', id);
    assert.equal((await f.request(`/api/records/welds/${id}`, 'PUT', { description: 'Changed', _version: weld._version })).status, 423, `PUT ${id}`);
    assert.equal((await f.act('save-weld', { weldId: id, kr: 'K9' })).status, 423, `save ${id}`);
    assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: weld._version })).status, 423, `delete ${id}`);
    assert.equal(f.store.get('welds', id)._archived, false);
  }
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-1', 'weld-3'], changes: { pos2: '2G' } })).status, 423, 'one locked weld stops the whole mass edit');
  assert.equal(f.store.get('welds', 'weld-1').pos2 ?? '', '', 'and nothing is written');
  // New welds of a completed phase are refused as well; a weld cannot be typed into a locked phase.
  assert.equal((await f.act('save-weld', { isoId: 'iso-3', weldNo: 'W900', typeId: 'weld-type-0' })).status, 423);
  assert.equal((await f.act('save-weld', { isoId: 'iso-3', weldNo: 'W901' })).status, 201, 'no type, no phase yet');
  // iso-9 only has a Prefab release: its shop weld is locked, its field weld is not.
  assert.equal((await f.act('save-weld', { weldId: 'weld-9', kr: 'K9' })).status, 423);
  assert.equal((await f.act('save-weld', { weldId: 'weld-18', kr: 'K9', note: 'KR corrected' })).status, 201, 'weld-18 has an open NDT request: the reason is required');
  assert.equal((await f.act('save-weld', { weldId: 'weld-18', typeId: 'weld-type-1' })).status, 423, 'typing it as a shop weld would lock it');
  // Removing the Field release unlocks weld-12 at once; the Prefab release still holds weld-3.
  archiveRelease(f.store, 'iso-3', 'Field');
  assert.equal((await f.act('save-weld', { weldId: 'weld-12', kr: 'K9' })).status, 201); assert.equal((await f.act('save-weld', { weldId: 'weld-3', kr: 'K9' })).status, 423);
  // Reopening the Prefab release (the releases flow keeps the record with status Reopened) unlocks weld-3 too.
  runAction(f.store, 'reopen-release', { isoId: 'iso-3', type: 'Prefab', reason: 'Weld repair on spool 3' }, SYSTEM);
  assert.equal((await f.act('save-weld', { weldId: 'weld-3', kr: 'K9' })).status, 201, 'a Reopened release no longer locks');
  runAction(f.store, 'release', { isoIds: ['iso-3'], type: 'Prefab', reportNo: 'PR-REL-3' }, SYSTEM);
  assert.equal((await f.act('save-weld', { weldId: 'weld-3', kr: 'K8' })).status, 423, 'releasing again locks again');
  // Delete, show deleted and bring back; a new Field release locks the deleted field weld against coming back.
  const added = await f.act('save-weld', { isoId: 'iso-3', weldNo: 'W902', typeId: 'weld-type-0' }); assert.equal(added.status, 201);
  const id = added.body.record.id as string;
  assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: f.store.get('welds', id)._version })).status, 200);
  const deleted = (await (await f.request('/api/bootstrap')).json()).rows.welds.find((item: Row) => item.id === id); assert.equal(deleted._archived, true);
  const reinstated = f.store.create('releases', { isoId: 'iso-3', type: 'Field', number: 'FLR-002', reportNo: 'FLR-002', date: '2026-11-01' });
  assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: deleted._version })).status, 423);
  f.store.archive('releases', reinstated.id, reinstated._version, actor);
  assert.equal((await f.request(`/api/records/welds/${id}/archive`, 'POST', { _version: deleted._version })).status, 200);
  assert.equal(f.store.get('welds', id)._archived, false);
});

test('the other profiles keep their behaviour: no lock and no entry rules on the plain record routes', async t => {
  const f = await fixture(t, 'access-prototype');
  const weld = f.store.get('welds', 'weld-3');
  assert.equal((await f.request('/api/records/welds/weld-3', 'PUT', { description: 'Changed', _version: weld._version })).status, 200);
  assert.equal((await f.act('save-weld', { isoId: 'iso-1', weldNo: 'W040' })).status, 404);
});

test('Add welds (range) creates the missing numbers all or nothing, after the existing welds', async t => {
  const f = await fixture(t);
  const before = f.store.list('welds').length;
  let result = await f.act('add-welds', { isoId: 'iso-1', start: 8, end: 11, diameterId: 'diameter-6' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.body.records.map((r: Row) => r.weldNo), ['W008', 'W009', 'W011'], 'W010 exists');
  const added = result.body.records.map((r: Row) => f.store.get('welds', r.id));
  assert.ok(added.every((w: Row) => w.diameterId === 'diameter-6' && w.lengthMode === 'Diameter' && !w.date));
  assert.deepEqual(orderOf(f.store, 'iso-1').slice(-3), added.map((w: Row) => w.id), 'new welds follow the existing ones');
  assert.equal(f.store.list('welds').length, before + 3);
  for (const data of [{ isoId: 'iso-1', start: 5, end: 4 }, { isoId: 'iso-1', start: 1, end: 800 }, { isoId: 'iso-1', start: 9.5, end: 12 }, { isoId: 'iso-1', start: 20, end: 22, diameterId: 'nope' }, { isoId: 'nope', start: 1, end: 2 }]) {
    result = await f.act('add-welds', data); assert.ok([404, 422].includes(result.status), JSON.stringify(data)); assert.equal(f.store.list('welds').length, before + 3);
  }
  result = await f.act('add-welds', { isoId: 'iso-1', start: 8, end: 11 }); assert.equal(result.status, 422); assert.match(result.body.error, /already exists/);
  assert.equal((await f.act('add-welds', { isoId: 'iso-1', start: 12, end: 12, kr: 'x' })).status, 404, 'only the range fields are accepted');
});

test('Mass edit welds writes only the fields that change, clears dates on request and is all or nothing', async t => {
  const f = await fixture(t);
  const before = Object.fromEntries(['weld-5', 'weld-6'].map(id => [id, f.store.get('welds', id)]));
  const versions = Object.fromEntries(Object.entries(before).map(([id, weld]) => [id, weld._version]));
  let result = await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions, changes: { kr: 'ignored' } });
  assert.equal(result.status, 422, 'fields outside the capture list are refused');
  result = await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions, changes: { coating1Id: 'coating-none', pos1: '1G', ndoReqPre: true, clearDatefit: true } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  for (const id of ['weld-5', 'weld-6']) {
    const weld = f.store.get('welds', id);
    assert.equal(weld.pos1, '1G'); assert.equal(weld.ndoReqPre, true); assert.equal(weld.datefit, ''); assert.equal(weld.coating1Id, 'coating-none');
    for (const name of ['weldNo', 'date', 'welder1Id', 'wpsId', 'typeId', 'chargeNo1', 'ndoReq', 'repair', 'description']) assert.equal(weld[name] ?? '', before[id][name] ?? '', `${id}.${name} is untouched`);
  }
  // Diameter and length are exclusive; a stale version, an unknown weld and an empty change refuse everything.
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: { diameterId: 'diameter-6', dialen: 90 } })).status, 422);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions: { 'weld-5': 1 }, changes: { pos2: '2G' } })).status, 409);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5', 'nope'], changes: { pos2: '2G' } })).status, 404);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: {} })).status, 422);
  assert.equal(f.store.get('welds', 'weld-5').pos2 ?? '', '');
  // A WPS that is not available to the project refuses the whole batch, and mandatory fields apply to each weld.
  const foreign = f.store.create('wps', { name: 'STX-WPS-RIVER', method: '111', definition: 'Sample', allProjects: true, siteIds: ['site-river'], processId: 'process-1' });
  result = await f.act('mass-edit-welds', { weldIds: ['weld-1', 'weld-10'], changes: { wpsId: foreign.id, pos2: '2G' } });
  assert.equal(result.status, 422); assert.equal(f.store.get('welds', 'weld-1').pos2 ?? '', '');
  // The reference checks Weld type, WPS, Weld Date and Dia. only when the mass edit sets the Welder (w3-weld-table): Clear date alone passes the rule.
  result = await f.act('mass-edit-welds', { weldIds: ['weld-1', 'weld-10'], changes: { welder1Id: 'welder-1', clearDate: true } });
  assert.equal(result.status, 422); assert.equal(result.body.error, MASS_EDIT_MANDATORY_MESSAGE); assert.ok(f.store.get('welds', 'weld-1').date);
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], changes: { clearDate: true } })).status, 201, 'Riverside has no mandatory fields');
  assert.equal(f.store.get('welds', 'weld-5').date, '');
  // The inspection inputs of the capture's Mass edit (NDT location / process per round, PWHT location / process).
  const fresh = Object.fromEntries(['weld-5', 'weld-6'].map(id => [id, f.store.get('welds', id)._version]));
  result = await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], versions: fresh, changes: { ndtLocationId: 'ndt-shop', ndtProcess2Id: 'ndt-0', pwhtProcessId: 'pwht-1' } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  for (const id of ['weld-5', 'weld-6']) { const weld = f.store.get('welds', id); assert.deepEqual([weld.ndtLocationId, weld.ndtProcess2Id, weld.pwhtProcessId], ['ndt-shop', 'ndt-0', 'pwht-1'], id); }
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: { ndtLocationId: 'no-such-location' } })).status, 422, 'a reference must exist');
});

test('the table order is stored per isometric; a stale order is refused', async t => {
  const f = await fixture(t);
  const order = orderOf(f.store, 'iso-1'); assert.deepEqual(order, ['weld-1', 'weld-10', 'weld-19', 'weld-28']);
  const next = moveWeld(order, 'weld-19', 'up')!;
  const result = await f.act('reorder-welds', { isoId: 'iso-1', weldIds: next });
  assert.equal(result.status, 201, JSON.stringify(result.body)); assert.equal(result.body.records.length, 2, 'only welds whose place changed are written');
  assert.deepEqual(orderOf(f.store, 'iso-1'), next);
  assert.equal(orderOf(f.store, 'iso-2').length, 4); assert.deepEqual(orderOf(f.store, 'iso-9'), ['weld-9', 'weld-18', 'weld-27'], 'other isometrics keep their order');
  for (const weldIds of [next.slice(1), [...next, 'weld-2'], [...next.slice(1), next[1]], 'weld-1']) assert.equal((await f.act('reorder-welds', { isoId: 'iso-1', weldIds })).status, 409);
  assert.deepEqual(orderOf(f.store, 'iso-1'), next);
  // A weld added later still comes last, even where an older weld had no stored order yet.
  f.store.create('welds', { weldNo: 'W000', isoId: 'iso-2' });
  const created = await f.act('save-weld', { isoId: 'iso-2', weldNo: 'W050' }); assert.equal(created.status, 201);
  assert.equal(orderOf(f.store, 'iso-2').at(-1), created.body.record.id);
});

test('access: only accounts that may edit welds in Weld Pilot can use the actions, in both directions and across the pilot boundary', async t => {
  const f = await fixture(t);
  const payload = { ...complete, weldNo: 'W060' };
  const attempts = () => [['save-weld', payload], ['add-welds', { isoId: 'iso-1', start: 20, end: 21 }], ['mass-edit-welds', { weldIds: ['weld-5'], changes: { pos2: '2G' } }], ['reorder-welds', { isoId: 'iso-1', weldIds: orderOf(f.store, 'iso-1') }]] as const;
  // The administrator in the other pilot is refused: the pilot is the boundary.
  f.usePilot('mto');
  for (const [key, data] of attempts()) assert.equal((await f.act(key, data)).status, 403, `mto ${key}`);
  f.usePilot('weld');
  await f.signIn('Weld viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  for (const [key, data] of attempts()) assert.equal((await f.act(key, data)).status, 403, `viewer ${key}`);
  assert.equal((await f.request('/api/records/welds/weld-5', 'PUT', { pos2: '2G', _version: f.store.get('welds', 'weld-5')._version })).status, 403);
  await f.signIn('MTO planner', { generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'No access' });
  assert.equal((await f.act('save-weld', payload)).status, 403);
  await f.signIn('Weld operator', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' });
  for (const key of ['save-weld', 'add-welds', 'mass-edit-welds', 'reorder-welds']) assert.equal((await f.act(key, attempts().find(([name]) => name === key)![1])).status, 201, `operator ${key}`);
  // Detailed permissions: add and edit are separate rights on the weld area (63).
  await f.signIn('Insert only', { permissionMode: 'Detailed permissions', permissionRules: JSON.stringify({ '5': ['show'], '63': ['show', 'insert'], '64': ['show'] }) });
  assert.equal((await f.act('save-weld', { ...payload, weldNo: 'W061' })).status, 201);
  assert.equal((await f.act('save-weld', { weldId: 'weld-5', pos2: '3G' })).status, 403, 'editing needs the edit right');
  assert.equal((await f.act('mass-edit-welds', { weldIds: ['weld-5'], changes: { pos2: '2G' } })).status, 403);
  // The check the form uses to show its buttons.
  const user = (await (await f.request('/api/auth/status')).json()).user as User;
  const as = (welding: number) => ({ ...user, availability: availabilityFor(HOSTED_RELEASE_PROFILE), permissions: { general: 2, materials: 0, welding, tools: 0, settings: 0 }, capabilities: undefined }) as User;
  assert.equal(canAction(as(2), 'save-weld', { weldId: 'x' }), true); assert.equal(canAction(as(2), 'save-weld', {}), true); assert.equal(canAction(as(1), 'mass-edit-welds'), false); assert.equal(canAction(as(1), 'save-weld', {}), false);
});

test('the sample seed carries realistic entry data: qualifications, certificates with index numbers, abbreviations and a stored order', () => {
  const s = new Store(':memory:'); seed(s);
  assert.ok(s.list('welder_certificates').length >= 6); assert.ok(s.list('certifications').every(c => c.indexNo && c.chargeNo && (c.materialId || c.materialTypeId)));
  assert.equal(new Set(s.list('certifications').map(c => c.chargeNo)).size, s.list('certifications').length, 'one certificate per charge / heat number');
  assert.equal(s.get('weld_types', 'weld-type-0').abbreviation, 'FW', 'the weld catalog sample owns the abbreviations (the Shop / Field code, as in the reference)');
  const first = s.get('welds', 'weld-1');
  assert.equal(first.certificate1Id, 'certificate-1'); assert.equal(first.material1Id, 'material-1'); assert.equal(s.get('welds', 'weld-4').chargeNo1, 'EXISTING');
  assert.ok(s.list('welds').every(w => typeof w.sortOrder === 'number'));
  s.close();
});

test('Disable welds sorting is stored on the isometric: every user sees it, reordering is refused while it is off, the order returns when it is on again', async t => {
  const f = await fixture(t);
  assert.equal(f.store.get('isometrics', 'iso-1').weldSortingDisabled ?? false, false);
  assert.equal((await f.act('toggle-weld-sorting', { isoId: 'iso-1', enabled: 'no' })).status, 422);
  const off = await f.act('toggle-weld-sorting', { isoId: 'iso-1', enabled: false });
  assert.equal(off.status, 201, JSON.stringify(off.body)); assert.equal(f.store.get('isometrics', 'iso-1').weldSortingDisabled, true);
  assert.equal(f.store.get('isometrics', 'iso-2').weldSortingDisabled ?? false, false, 'per isometric');
  // A second user reads the same flag from the server.
  await f.signIn('Second welder', { generalPermission: 'Read & write', materialsPermission: 'No access', weldingPermission: 'Read & write' });
  const seen = (await (await f.request('/api/bootstrap')).json()).rows.isometrics.find((item: Row) => item.id === 'iso-1');
  assert.equal(seen.weldSortingDisabled, true);
  assert.equal((await f.act('reorder-welds', { isoId: 'iso-1', weldIds: orderOf(f.store, 'iso-1') })).status, 409, 'no manual order while sorting is off');
  assert.equal((await f.act('toggle-weld-sorting', { isoId: 'iso-1', enabled: true })).status, 201);
  assert.equal(f.store.get('isometrics', 'iso-1').weldSortingDisabled, false);
  assert.equal((await f.act('reorder-welds', { isoId: 'iso-1', weldIds: orderOf(f.store, 'iso-1') })).status, 201);
  // A viewer may not switch it.
  await f.signIn('Sorting viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await f.act('toggle-weld-sorting', { isoId: 'iso-1', enabled: false })).status, 403);
});

test('the table order saves for locked welds too (they can be moved as the reference allows)', async t => {
  const f = await fixture(t);
  const order = orderOf(f.store, 'iso-3'); assert.ok(order.includes('weld-3'), 'weld-3 is a locked shop weld of iso-3');
  assert.equal((await f.act('save-weld', { weldId: 'weld-3', kr: 'K9' })).status, 423);
  const next = moveWeld(order, 'weld-3', 'down')!;
  const result = await f.act('reorder-welds', { isoId: 'iso-3', weldIds: next });
  assert.equal(result.status, 201, JSON.stringify(result.body)); assert.deepEqual(orderOf(f.store, 'iso-3'), next);
});

test('Mass edit without charge numbers: Weld type only, on welds that have a welder and no charge numbers, succeeds; setting a welder checks the four fields', async t => {
  const f = await fixture(t);
  const weld = f.store.create('welds', { weldNo: 'W070', isoId: 'iso-1', welder1Id: 'welder-1', wpsId: 'wps-1', date: '2026-10-22', diameterId: 'diameter-6', lengthMode: 'Diameter', sortOrder: 9 });
  assert.equal(weld.chargeNo1 ?? '', '');
  assert.equal((await f.act('mass-edit-welds', { weldIds: [weld.id], changes: { typeId: 'weld-type-1' } })).status, 201, 'no charge numbers needed');
  assert.equal(f.store.get('welds', weld.id).typeId, 'weld-type-1');
  // Without a Weld type, setting the welder is refused with the reference message and nothing is written.
  const bare = f.store.create('welds', { weldNo: 'W071', isoId: 'iso-1', wpsId: 'wps-1', date: '2026-10-22', diameterId: 'diameter-6', lengthMode: 'Diameter', sortOrder: 10 });
  const refused = await f.act('mass-edit-welds', { weldIds: [bare.id], changes: { welder1Id: 'welder-1' } });
  assert.equal(refused.status, 422); assert.equal(refused.body.error, MASS_EDIT_MANDATORY_MESSAGE); assert.equal(f.store.get('welds', bare.id).welder1Id ?? '', '');
  // The same change with a Weld type in the same mass edit passes (charge numbers are still not needed).
  assert.equal((await f.act('mass-edit-welds', { weldIds: [bare.id], changes: { welder1Id: 'welder-1', typeId: 'weld-type-1' } })).status, 201);
  assert.equal(f.store.get('welds', bare.id).welder1Id, 'welder-1');
});

test('Stamp: the QC person who stamped the weld is stored on the weld; welders and the weld date stay as they are', async t => {
  const f = await fixture(t);
  const before = f.store.get('welds', 'weld-5');
  const bad = await f.act('stamp-weld', { weldId: 'weld-5', stampedBy: 'nobody' }); assert.equal(bad.status, 422);
  const result = await f.act('stamp-weld', { weldId: 'weld-5', stampedBy: 'qa-1', expectedVersion: before._version });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const after = f.store.get('welds', 'weld-5');
  assert.equal(after.stampedBy, 'qa-1'); assert.ok(after.stampedAt);
  for (const name of ['welder1Id', 'welder2Id', 'date', 'datefit', 'typeId', 'weldNo']) assert.equal(after[name] ?? '', before[name] ?? '', name);
  assert.equal((await f.act('stamp-weld', { weldId: 'weld-5', stampedBy: 'qa-2', expectedVersion: before._version })).status, 409, 'a stale weld is refused');
  assert.equal((await f.act('stamp-weld', { weldId: 'weld-5', stampedBy: '' })).status, 201); assert.equal(f.store.get('welds', 'weld-5').stampedBy, ''); assert.equal(f.store.get('welds', 'weld-5').stampedAt, '');
  // A weld of a completed phase cannot be stamped; a viewer cannot stamp.
  assert.equal((await f.act('stamp-weld', { weldId: 'weld-3', stampedBy: 'qa-1' })).status, 423);
  await f.signIn('Stamp viewer', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'Read only' });
  assert.equal((await f.act('stamp-weld', { weldId: 'weld-5', stampedBy: 'qa-1' })).status, 403);
});

test('Delete weld: a weld with an open inspection request is deleted (and can be brought back) without a refusal', async t => {
  const f = await fixture(t);
  const request = f.store.create('inspection_requests', { weldId: 'weld-5', type: 'NDT', status: 'Open', date: '2026-11-16' }, SYSTEM);
  assert.ok(request.id);
  const weld = f.store.get('welds', 'weld-5');
  const gone = await f.request('/api/records/welds/weld-5/archive', 'POST', { _version: weld._version });
  assert.equal(gone.status, 200, JSON.stringify(await gone.json().catch(() => ({})))); assert.equal(f.store.get('welds', 'weld-5', true)._archived, true);
  const back = await f.request('/api/records/welds/weld-5/archive', 'POST', { _version: f.store.get('welds', 'weld-5', true)._version });
  assert.equal(back.status, 200); assert.equal(f.store.get('welds', 'weld-5')._archived, false);
});

test('the new fields are delivered by the hosted profile only; the other profiles do not get the actions', () => {
  const hosted = availabilityFor(HOSTED_RELEASE_PROFILE)!;
  for (const field of ['stampedBy', 'stampedAt']) assert.ok(hosted.resources.welds.includes(field), field);
  assert.ok(hosted.resources.isometrics.includes('weldSortingDisabled'));
  for (const key of ['toggle-weld-sorting', 'stamp-weld']) { assert.ok(hosted.actions[key], key); for (const profile of ['welding-demo', 'access-prototype'] as const) assert.equal(availabilityFor(profile)!.actions[key], undefined, `${profile} ${key}`); }
});

test('sample weld types carry the reference abbreviations (Shop WS, Field FW, HOOK-UP YTI, Longitudinal Field WS)', () => {
  const s = new Store(':memory:'); seed(s);
  const abbreviation = (name: string) => s.list('weld_types').find(type => type.name === name)?.abbreviation;
  assert.equal(abbreviation('Butt Weld - Field'), 'FW'); assert.equal(abbreviation('Butt Weld - Shop'), 'WS'); assert.equal(abbreviation('HOOK-UP'), 'YTI');
  assert.equal(abbreviation('Longitudinal Welds - Field'), 'WS'); assert.equal(abbreviation('Fillet Weld - Field'), 'FW'); assert.equal(abbreviation('Victaulic Joint - Shop'), 'WS');
  assert.equal(locationTooltip(s.list('weld_types').find(type => type.name === 'Butt Weld - Field')), 'Butt Weld - Field');
  s.close();
});

test('save-weld form rules: the same welder twice, Dia. against the charges with Default diameter, special weld numbers, unaccepted certificates, tracer on Add', async t => {
  const f = await fixture(t);
  // weld-iso-welds-024: a second identical welder is refused.
  let result = await f.act('save-weld', { ...complete, weldNo: 'W070', welder2Id: 'welder-1' });
  assert.equal(result.status, 422); assert.equal(result.body.fields.welder2Id, DUPLICATE_WELDER);
  // weld-iso-welds-025: Dia. 4" against a 2" certificate is refused; 2" is accepted.
  result = await f.act('save-weld', { ...complete, weldNo: 'W071', chargeNo1: 'H-1043', certificate1Id: 'cert-h1043', diameterId: 'diameter-9' });
  assert.equal(result.status, 422); assert.equal(result.body.fields.diameterId, 'Dia. must equal the diameter of charge 1/2 (2).');
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W071', chargeNo1: 'H-1043', certificate1Id: 'cert-h1043' })).status, 201);
  // Two certificates without a common size (Riverside: 4" and a new 2"): refused unless a matching Default diameter is chosen.
  f.store.create('certifications', { siteId: 'site-river', name: 'ATT-26-1301', indexNo: '0009', chargeNo: 'H-2290', diameterId: 'diameter-6', diameter: '2"', allProjects: true, controlled: true, accepted: true });
  const two = f.store.list('certifications').find(row => row.chargeNo === 'H-2290')!;
  const mixed = { isoId: 'iso-5', weldNo: 'W072', diameterId: 'diameter-6', chargeNo1: 'H-2290', certificate1Id: two.id, chargeNo2: 'H-2210', certificate2Id: 'certificate-2' };
  result = await f.act('save-weld', mixed);
  assert.equal(result.status, 422); assert.equal(result.body.fields.diameterId, DIAMETER_MESSAGES.pick);
  assert.equal((await f.act('save-weld', { ...mixed, defaultDiameter: '4' })).status, 422, 'the default must be the chosen Dia.');
  result = await f.act('save-weld', { ...mixed, defaultDiameter: '2' });
  assert.equal(result.status, 201);
  assert.equal(f.store.get('welds', result.body.record.id).defaultDiameter, undefined, 'the choice is not stored on the weld');
  // weld-iso-welds-026: 12GAP saves without type, WPS or welder on a site with mandatory fields; the hidden weld fields are ignored.
  result = await f.act('save-weld', { isoId: 'iso-1', weldNo: '12GAP', welder1Id: 'welder-1', typeId: 'weld-type-1', chargeNo1: 'EXISTING', date: '2026-11-16' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const gap = f.store.get('welds', result.body.record.id);
  assert.deepEqual([gap.welder1Id ?? '', gap.typeId ?? '', gap.chargeNo1 ?? '', gap.date], ['', '', '', '2026-11-16']);
  assert.equal((await f.act('save-weld', { isoId: 'iso-1', weldNo: 'E01', welder1Id: 'welder-1', chargeNo1: 'EXISTING' })).status, 201, 'E01 keeps Charge number 1');
  assert.equal(f.store.list('welds').find(row => row.weldNo === 'E01')!.chargeNo1, 'EXISTING');
  // weld-iso-welds-029 / scn-SC-D2: the Cooling project's certificate ATT-26-1207 is Controlled but not Accepted: refused (it was saved with 201).
  assert.equal(f.store.get('certifications', 'certificate-3').accepted, false);
  result = await f.act('save-weld', { ...complete, weldNo: 'SC-2', chargeNo1: 'H-5120', certificate1Id: 'certificate-3', diameterId: 'diameter-8' });
  assert.equal(result.status, 422); assert.equal(result.body.fields.certificate1Id, CERTIFICATE_NOT_SELECTABLE);
  assert.equal(f.store.list('welds').some(row => row.weldNo === 'SC-2'), false);
  const weld = f.store.get('welds', 'weld-1');
  assert.equal((await f.request(`/api/records/welds/${weld.id}`, 'PUT', { certificate2Id: 'certificate-3', chargeNo2: 'H-5120', _version: weld._version })).status, 422, 'the record route refuses it too');
  // weld-iso-welds-017: Tracer can be ticked in Add weld.
  result = await f.act('save-weld', { ...complete, weldNo: 'W073', tracer: true });
  assert.equal(result.status, 201, JSON.stringify(result.body)); assert.equal(f.store.get('welds', result.body.record.id).tracer, true);
});

test('Mass edit welds applies the Tracer flag (weld-iso-welds-018)', async t => {
  const f = await fixture(t);
  assert.deepEqual(['weld-5', 'weld-6'].map(id => Boolean(f.store.get('welds', id).tracer)), [false, false]);
  const result = await f.act('mass-edit-welds', { weldIds: ['weld-5', 'weld-6'], changes: { tracer: true } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(['weld-5', 'weld-6'].map(id => f.store.get('welds', id).tracer), [true, true]);
});

test('editing a weld with NDT or PWHT in progress needs a reason, which Previous edits lists (weld-iso-welds-R1, -040)', async t => {
  const f = await fixture(t);
  const weld = f.store.get('welds', 'weld-15');
  assert.ok(f.store.list('inspection_requests').some(row => row.weldId === weld.id && row.status === 'Open'), 'the sample has an open NDT request on weld 15');
  let result = await f.act('save-weld', { weldId: weld.id, expectedVersion: weld._version, kr: 'K2' });
  assert.equal(result.status, 422); assert.equal(result.body.error, 'You MUST enter reason for editing weld');
  assert.equal((await f.act('save-weld', { weldId: weld.id, kr: 'K2', note: '<p> </p>' })).status, 422, 'markup alone is no reason');
  assert.equal(f.store.get('welds', weld.id).kr ?? '', weld.kr ?? '');
  let history = await (await f.request(`/api/weld-history/${weld.id}`)).json();
  assert.deepEqual(history.edits, [], 'no previous edits yet');
  result = await f.act('save-weld', { weldId: weld.id, expectedVersion: weld._version, kr: 'K2', note: 'KR from the revised drawing' });
  assert.equal(result.status, 201, JSON.stringify(result.body)); assert.equal(f.store.get('welds', weld.id).kr, 'K2');
  history = await (await f.request(`/api/weld-history/${weld.id}`)).json();
  assert.equal(history.edits.length, 1); assert.equal(history.edits[0].comment, 'KR from the revised drawing'); assert.equal(history.edits[0].user, 'Weld admin');
  // A weld without a request in progress needs none.
  assert.equal((await f.act('save-weld', { weldId: 'weld-1', kr: 'K3' })).status, 201);
  // The history needs read access to the weld.
  await f.signIn('No welding', { generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'No access' });
  assert.equal((await f.request(`/api/weld-history/${weld.id}`)).status, 403);
});

test('the weld history route is not offered where the profile has no weld entry', async t => {
  const f = await fixture(t, 'access-prototype');
  assert.equal((await f.request('/api/weld-history/weld-1')).status, 404);
});

// ----- wave 3 integration (E9): what the weld form stores, as the weld table and Mass edit show it -------------------------
test('E9: a fixed part placeholder shows as Material with "-" in Idx / Chg.No.; Mass edit shows the WPS as process | number and refuses an unaccepted certificate with the form\'s sentence', async t => {
  for (const placeholder of ['4 / Flange', '13 / Female Flange']) {
    assert.deepEqual(sideSummary({ chargeNo1: placeholder, certificate1Id: '' }, 1), { kind: 'placeholder', index: '', charge: '', material: placeholder });
    assert.deepEqual(sideCellTexts(sideSummary({ chargeNo2: placeholder }, 2)), { index: '-', charge: '-', material: placeholder });
  }
  assert.deepEqual(sideCellTexts(sideSummary({ chargeNo1: 'H-77' }, 1)), { index: '-', charge: 'H-77', material: '-' }, 'a plain charge number keeps its cell');
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('client/weld-entry.tsx', 'utf8'), mass = source.slice(source.indexOf('function MassEditDialog'), source.indexOf('async function submit', source.indexOf('function MassEditDialog')));
  assert.match(mass, /label: wpsLabel\(row, 'mass'\)/);
  assert.match(source, /certificateSelectionErrors\(read\.changes, \[1, 2\], data\.certificates\)[\s\S]{0,120}setError\(CERTIFICATE_NOT_SELECTABLE\)/, 'refused in the dialog before sending');
  const f = await fixture(t);
  assert.equal(f.store.get('certifications', 'certificate-3').accepted, false);
  const before = f.store.get('welds', 'weld-1');
  const result = await f.act('mass-edit-welds', { weldIds: ['weld-1'], changes: { chargeNo1: 'H-5120', certificate1Id: 'certificate-3' } });
  assert.equal(result.status, 422); assert.match(String(result.body.error), new RegExp(`${CERTIFICATE_NOT_SELECTABLE.replace(/[.:]/g, '\\$&')}$`));
  assert.equal(f.store.get('welds', 'weld-1')._version, before._version, 'nothing stored');
});


// ---------------------------------------------------------------------------------------------------- w4-weld-form-rules

test('Add weld calls the Pre-HT box Pre-WHT (bound to pwhtReqPre); Edit weld and Mass edit keep Pre-HT (weld-iso-welds-019)', () => {
  const add = weldFormLayout('add').flat().find(item => item.name === 'pwhtReqPre');
  assert.deepEqual(add, { name: 'pwhtReqPre', label: 'Pre-WHT' }); assert.equal(ADD_PRE_HT_LABEL, 'Pre-WHT');
  assert.equal(weldFormLayout('edit').flat().find(item => item.name === 'pwhtReqPre')!.label, 'Pre-HT');
  assert.ok(massEditLabels().includes('Pre-HT') && !massEditLabels().includes('Pre-WHT'));
});

test('Add welds range: 001..015 by default, zero padding of Start, existing numbers skipped and reported (weld-iso-welds-013)', () => {
  assert.deepEqual({ title: RANGE_DIALOG.title, start: RANGE_DIALOG.start, end: RANGE_DIALOG.end, button: RANGE_DIALOG.button, toolbar: RANGE_DIALOG.toolbar }, { title: 'Add weld', start: '001', end: '015', button: 'Add', toolbar: 'Add welds' });
  const plan = planWeldRange(RANGE_DIALOG.start, RANGE_DIALOG.end, []);
  assert.equal(plan.numbers.length, 15); assert.equal(plan.numbers[0], '001'); assert.equal(plan.numbers.at(-1), '015');
  const again = planWeldRange('001', '015', ['003', '010']);
  assert.equal(again.numbers.length, 13); assert.deepEqual(again.skipped, ['003', '010']);
  assert.deepEqual(planWeldRange('01', '03', []).numbers, ['01', '02', '03'], 'the padding is the one of Start');
});

test('Add welds range through HTTP: 001..015 creates the missing numbers and says which it skipped', async t => {
  const f = await fixture(t);
  const iso = 'iso-2', before = f.store.list('welds').filter(w => w.isoId === iso).map(w => String(w.weldNo));
  assert.ok(before.length > 0);
  const result = await f.act('add-welds', { isoId: iso, start: '001', end: '015' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual([...result.body.skipped].sort(), before.filter(name => Number(name.replace(/\D/g, '')) <= 15).sort(), 'the numbers that existed are skipped and reported');
  assert.equal(result.body.records.length + result.body.skipped.length, 15);
  const names = f.store.list('welds').filter(w => w.isoId === iso).map(w => String(w.weldNo));
  assert.equal(new Set(names).size, names.length); assert.ok(names.some(name => name.endsWith('015')));
});

const dias = new Map<string, Row>([['d2', row('d2', { diameter: '2"', sizeinch: 2, size: 60.3 })], ['d4', row('d4', { diameter: '4"', sizeinch: 4, size: 114.3 })]]);
const lookups = { diameters: dias };
const certs = new Map<string, Row>([
  ['c2', row('c2', { chargeNo: 'A-2', diameterId: 'd2', controlled: true, accepted: true, materialId: 'm1' })],
  ['c4', row('c4', { chargeNo: 'A-4', diameterId: 'd4', controlled: true, accepted: true })],
  ['u2', row('u2', { chargeNo: 'U-2', diameterId: 'd2', controlled: true, accepted: false })],
]);
const ask = (over: Record<string, unknown> = {}) => suggestOnDia({ values: {}, diameterSize: '2', previous: null, next: null, certificates: certs, lookups, matchingWps: [], ...over } as Parameters<typeof suggestOnDia>[0]);

test('after Dia.: charge 1 from the previous weld charge 2 and charge 2 from the next weld charge 1, only Controlled + Accepted with this diameter (weld-iso-welds-027)', () => {
  assert.equal(diameterRowSize(dias.get('d2')), '2');
  const suggestion = ask({ previous: { certificate2Id: 'c2', chargeNo2: 'A-2' }, next: { certificate1Id: 'c2', chargeNo1: 'A-2' } });
  assert.deepEqual(suggestion.patch, { chargeNo1: 'A-2', certificate1Id: 'c2', material1Id: 'm1', chargeNo2: 'A-2', certificate2Id: 'c2', material2Id: 'm1' });
  assert.deepEqual(ask({ previous: { certificate2Id: 'u2', chargeNo2: 'U-2' } }).patch, {}, 'not Controlled + Accepted: only sorted');
  assert.deepEqual(ask({ previous: { certificate2Id: 'c4', chargeNo2: 'A-4' } }).patch, {}, 'another diameter');
  assert.deepEqual(ask({ previous: { certificate2Id: '', chargeNo2: 'EXISTING' } }).patch, {}, 'a fixed value is no certificate');
  assert.deepEqual(ask().patch, {}, 'no neighbour: nothing proposed');
  assert.deepEqual(ask({ values: { chargeNo1: 'EXISTING' }, previous: { certificate2Id: 'c2', chargeNo2: 'A-2' } }).patch, {}, 'a charge already chosen is never changed');
});

test('after Dia.: one matching WPS is selected, two are not, a chosen WPS and welders stay, the weld type is never suggested', () => {
  assert.equal(ask({ matchingWps: ['wps-1'] }).wpsId, 'wps-1');
  assert.equal(ask({ matchingWps: ['wps-1', 'wps-2'] }).wpsId, '');
  assert.equal(ask({ values: { wpsId: 'wps-9' }, matchingWps: ['wps-1'] }).wpsId, '', 'an already chosen WPS is kept');
  const result = ask({ values: { welder1Id: 'welder-1', typeId: '' }, matchingWps: ['wps-1'], previous: { certificate2Id: 'c2' } });
  assert.deepEqual(Object.keys(result.patch).filter(name => /welder|typeId/.test(name)), [], 'welders and the weld type are not in the proposal');
  assert.equal(ask({ diameterSize: '', matchingWps: ['wps-1'] }).wpsId, '');
});

test('charge lists after Dia.: certificates of the diameter first, each group in its own order; the fixed values keep their place', () => {
  const list = [...certs.values()];
  assert.deepEqual(sortChargesForDia(list, '4', lookups).map(c => c.id), ['c4', 'c2', 'u2']);
  assert.deepEqual(sortChargesForDia(list, '2', lookups).map(c => c.id), ['c2', 'u2', 'c4']);
  assert.deepEqual(sortChargesForDia(list, '', lookups).map(c => c.id), ['c2', 'c4', 'u2'], 'no diameter: the order stays');
  const add = chargeOptionList(list, 'add', lookups, '4').map(option => option.value);
  assert.deepEqual(add.slice(0, 3), ['c4', 'c2', 'u2']); assert.equal(add[3], 'CONN ISO');
  assert.deepEqual(chargeOptionList(list, 'edit', lookups, '4').map(option => option.value).slice(0, 3), ['CONN ISO', 'EXISTING', '1 / Pipe']);
  assert.equal(chargeOptionList(list, 'edit', lookups, '4').map(option => option.value).indexOf('c4') < chargeOptionList(list, 'edit', lookups, '4').map(option => option.value).indexOf('c2'), true);
});

test('welder lists after Dia.: qualified for the diameter first, the others under Other welders', () => {
  const qualifications = [row('q1', { welderId: 'w1', diameterFrom: '21.3', diameterTo: '168.3' }), row('q2', { welderId: 'w2', diameterFrom: '100', diameterTo: '200', expiresAt: '2020-01-01' }), row('q3', { welderId: 'w3', diameterFrom: '', diameterTo: '' })];
  const ids = weldersQualifiedForDiameter(qualifications, 60.3, '2026-11-16');
  assert.deepEqual([...ids], ['w1'], 'a range that holds the size, valid on the date; an expired or empty range does not count');
  const options = [{ value: 'w1', label: 'A' }, { value: 'w2', label: 'B' }, { value: 'w3', label: 'C' }];
  const groups = groupWeldersForDia(options, ids);
  assert.deepEqual(groups.map(group => [group.label, group.options.map(o => o.value)]), [[WELDER_GROUP_LABELS.qualified, ['w1']], [WELDER_GROUP_LABELS.other, ['w2', 'w3']]]);
  assert.deepEqual([WELDER_GROUP_LABELS.qualified, WELDER_GROUP_LABELS.other], ['Qualified for this diameter', 'Other welders']);
  assert.equal(groupWeldersForDia(options, new Set(options.map(o => o.value))).length, 1, 'an empty group is not shown');
});

test('WPS match a diameter by the scope of their PQR; one number is exact, a lower limit is open ended', () => {
  assert.equal(wpsMatchesDiameter(['21.3 - 168.3'], 60.3), true);
  assert.equal(wpsMatchesDiameter(['21,3-48.3'], 60.3), false);
  assert.equal(wpsMatchesDiameter(['> 50'], 60.3), true);
  assert.equal(wpsMatchesDiameter(['n/a', ''], 60.3), false);
  assert.equal(wpsMatchesDiameter(['21.3 - 168.3'], null), false);
});

test('material group warning: one warning when the pair is not covered, none for an allowed pair, one for a WPS without groups (weld-iso-welds-030)', () => {
  const wps = (data: Record<string, unknown>) => row('w', { name: 'WPS-141', ...data });
  assert.deepEqual(materialGroupWarnings({ iso: '1.1' }, { iso: '8.1' }, wps({ isoGroups: '1.1' })), ['Material groups 1.1 / 8.1 are not covered by WPS WPS-141.']);
  assert.deepEqual(materialGroupWarnings({ iso: '1.1' }, { iso: '8.1' }, wps({ isoGroups: '1.1', isoPairs: '1.1+8.1' })), [], 'an allowed dissimilar pair');
  assert.deepEqual(materialGroupWarnings({ iso: '8.1' }, { iso: '1.1' }, wps({ isoPairs: '1.1+8.1' })), [], 'the pair has no direction');
  assert.deepEqual(materialGroupWarnings({ iso: '1.1' }, { iso: '1.2' }, wps({ isoGroups: '1.1, 1.2' })), [], 'both inside the WPS groups');
  assert.equal(materialGroupWarnings({ iso: '1.1' }, { iso: '1.1' }, wps({})).length, 1, 'a WPS without groups');
  assert.deepEqual(materialGroupWarnings({ iso: '1.1' }, { iso: '' }, wps({})), [], 'a charge without a group');
  assert.deepEqual(materialGroupWarnings({ asme: 'P-1' }, { asme: 'P-8' }, wps({ asmePNumbers: 'P-1', asmePairs: 'P-1+P-4' })), ['Material groups P-1 / P-8 are not covered by WPS WPS-141.']);
  assert.deepEqual(materialGroupWarnings({ asme: 'P-1' }, { asme: 'P-8' }, wps({ asmePairs: 'P-1+P-8' })), []);
  assert.deepEqual(materialGroupWarnings({ iso: '1.1' }, { iso: '8.1' }, null), [], 'no WPS chosen yet');
  const types = new Map<string, Row>([['t1', row('t1', { iso15608: '1.1', asmePNumber: 'P-1' })]]);
  assert.deepEqual(chargeMaterialGroup(row('c', { materialTypeId: 't1' }), types), { iso: '1.1', asme: 'P-1' });
});

test('saving is never blocked by a material group warning: a WPS that does not cover the charge groups still saves', async t => {
  const f = await fixture(t);
  const wps = f.store.get('wps', 'wps-1');
  f.store.update('wps', wps.id, { isoGroups: '8.1' }, wps._version);
  const result = await f.act('save-weld', { ...complete, weldNo: 'W060' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
});

const welders = [row('w1', { number: '1', name: 'Ann', welderCode: 'W01' }), row('w2', { number: '2', name: '', welderCode: 'W02' }), row('w3', { number: '3', name: 'Cy', welderCode: 'W03', status: 'Inactive' }), row('w4', { number: '4', name: 'Di', welderCode: 'W04' })];
const documents = [
  row('d1', { welderId: 'w1', isDocument: true, wpsIds: 'A,B', expiresAt: '2027-01-01' }),
  row('d2', { welderId: 'w4', isDocument: true, wpsIds: 'B', expiresAt: '2020-01-01' }),
];

test('Validation on WPS: the WPS listed on a valid qualification document decides; an expired document does not qualify (weld-iso-welds-036)', () => {
  const wps = (id: string) => row(id, { name: `WPS-${id}`, processId: 'tig' });
  assert.equal(welderQualifiedForWps(wps('B'), documents.filter(d => d.welderId === 'w1'), '2026-11-16'), true);
  assert.equal(welderQualifiedForWps(wps('C'), documents.filter(d => d.welderId === 'w1'), '2026-11-16'), false);
  assert.equal(welderQualifiedForWps(wps('B'), documents.filter(d => d.welderId === 'w4'), '2026-11-16'), false, 'expired');
  assert.equal(welderQualifiedForWps(wps('B'), documents.filter(d => d.welderId === 'w4'), '2019-01-01'), true, 'valid on the weld date');
  // The welding process does not qualify a welder any more; it is only the older check of a setting that was never saved.
  assert.equal(welderQualifiedForWps(wps('B'), [row('p', { welderId: 'w2', processId: 'tig' })], '2026-11-16'), false);
  assert.equal(welderQualifiedByProcess(wps('B'), [row('p', { welderId: 'w2', processId: 'tig' })], '2026-11-16'), true);
  assert.deepEqual([{ wpsValidation: true }, { wpsValidation: false }, {}, null].map(site => wpsValidationMode(site)), ['documents', 'off', 'process', 'off']);
});

test('Validation on WPS: off offers every active welder once a WPS is chosen, on only the qualified; none before a WPS; Add / Mass edit clear welders on a WPS change, Edit keeps them', () => {
  const wps = row('B', { name: 'WPS-B' });
  assert.deepEqual(weldersForWps({ wpsValidation: false }, welders, documents, undefined, '2026-11-16'), [], 'no WPS: nothing offered');
  assert.deepEqual(weldersForWps({ wpsValidation: false }, welders, documents, wps, '2026-11-16').map(w => w.id), ['w1', 'w2', 'w4'], 'every active welder, inactive left out, catalog order');
  assert.deepEqual(weldersForWps({ wpsValidation: true }, welders, documents, wps, '2026-11-16').map(w => w.id), ['w1'], 'only the qualified');
  assert.deepEqual(weldersForWps({ wpsValidation: true }, welders, documents, wps, '2026-11-16', ['w3']).map(w => w.id), ['w1', 'w3'], 'a welder the form already holds stays');
  assert.deepEqual(weldersForWps({ wpsValidation: true }, welders, undefined, wps, '2026-11-16').map(w => w.id), ['w1', 'w2', 'w4'], 'qualifications not known on the client: the server decides');
  assert.equal(welderFieldsDisabled({ wpsValidation: true }, ''), true); assert.equal(welderFieldsDisabled({ wpsValidation: true }, 'B'), false); assert.equal(welderFieldsDisabled({ wpsValidation: false }, ''), false);
  assert.deepEqual((['add', 'mass', 'edit'] as const).map(mode => wpsChangeClearsWelders(mode)), [true, true, false]);
  const all = [...certs.values()], size = (c: Row) => c.id === 'c4' ? 114.3 : 60.3;
  assert.equal(chargesForWelders(all, ['w1'], wps, documents, '2026-11-16', size).length, 3, 'a welder without a range limits nothing');
  const ranged = [...documents, row('r1', { welderId: 'w1', diameterFrom: '21.3', diameterTo: '70', expiresAt: '2027-01-01' })];
  assert.deepEqual(chargesForWelders(all, ['w1'], wps, ranged, '2026-11-16', size).map(c => c.id), ['c2', 'u2'], 'sizes outside the qualified range are left out');
  assert.deepEqual(chargesForWelders(all, ['w4'], wps, documents, '2026-11-16', () => null), [], 'a welder who is not qualified for the WPS: nothing');
});

test('welder option texts: "<code> <name>" in Add weld and Mass edit, "<code>, <name>" in Edit weld, code only without a name; catalog order; placeholders (delta-I1-009)', () => {
  assert.equal(welderOptionLabel(welders[0], 'add'), 'W01 Ann'); assert.equal(welderOptionLabel(welders[0], 'mass'), 'W01 Ann'); assert.equal(welderOptionLabel(welders[0], 'edit'), 'W01, Ann');
  assert.equal(welderOptionLabel(welders[1], 'add'), 'W02'); assert.equal(welderOptionLabel(welders[1], 'edit'), 'W02');
  assert.equal(welderOptionLabel(row('x', { number: '28', name: 'Zed' }), 'edit'), '28, Zed', 'without a welder code the number stands');
  assert.deepEqual(welderOptionList([welders[3], welders[0]], 'add').map(o => o.value), ['w4', 'w1'], 'the order of the rows is kept, not sorted by number');
  assert.deepEqual(WELDER_PLACEHOLDER, { add: 'Choose Welder', edit: '-----------------', mass: '-----------------' });
});

test('save-weld through HTTP with Validation on WPS: a welder not on a valid qualification document of the WPS is refused, a listed one is accepted (weld-iso-welds-036)', async t => {
  const f = await fixture(t);
  const wps = f.store.get('wps', 'wps-1');
  const other = f.store.create('wps', { name: 'WPS-OTHER', method: '141', definition: 'Other procedure' });
  const listed = f.store.create('welders', { number: 'W-101', name: 'Lia Roe', status: 'Active', globallyDeployable: true });
  const unlisted = f.store.create('welders', { number: 'W-102', name: 'Max Orr', status: 'Active', globallyDeployable: true });
  const expired = f.store.create('welders', { number: 'W-103', name: 'Eve Ash', status: 'Active', globallyDeployable: true });
  f.store.create('welder_certificates', { name: 'Doc A', welderId: listed.id, isDocument: true, wpsIds: wps.id, expiresAt: '2030-01-01' });
  f.store.create('welder_certificates', { name: 'Doc B', welderId: unlisted.id, isDocument: true, wpsIds: other.id, expiresAt: '2030-01-01' });
  f.store.create('welder_certificates', { name: 'Doc C', welderId: expired.id, isDocument: true, wpsIds: wps.id, expiresAt: '2026-01-01' });
  assert.equal((await f.act('save-weld', { ...complete, weldNo: 'W070', welder1Id: listed.id })).status, 201);
  let result = await f.act('save-weld', { ...complete, weldNo: 'W071', welder1Id: unlisted.id });
  assert.equal(result.status, 422); assert.match(result.body.fields.welder1Id, /Max Orr has no valid qualification for WPS/);
  result = await f.act('save-weld', { ...complete, weldNo: 'W072', welder1Id: expired.id });
  assert.equal(result.status, 422, 'an expired document does not qualify');
  const target = f.store.list('welds').find(w => w.isoId === 'iso-1' && w.wpsId === 'wps-1');
  assert.ok(target, 'a sample weld on WPS 1');
  const mass = await f.act('mass-edit-welds', { weldIds: [target!.id], versions: { [target!.id]: target!._version }, changes: { welder1Id: unlisted.id } });
  assert.equal(mass.status, 422, JSON.stringify(mass.body));
  // Setting off (Riverside): the same welder is accepted.
  assert.equal((await f.act('save-weld', { ...complete, isoId: 'iso-5', weldNo: 'W073', welder1Id: unlisted.id, diameterId: 'diameter-9' })).status, 201);
});
