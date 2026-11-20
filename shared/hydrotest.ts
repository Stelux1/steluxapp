import type { ActionDefinition, ActionField, Field, Resource, Row } from './types.ts';

/**
 * Hydrotest release: test systems composed at spool level, the hydrotest release (Pressure Test Plan) of a test
 * system, its results and its custom documents.
 * Pure definitions and rules shared by the client and the server. No I/O and no import of the resource registry
 * (the registry imports this file), so everything here is built from plain objects.
 */

// ----- vocabulary ---------------------------------------------------------------------------------------------

/** "Test system accepted by client". An empty value is shown as "-- Not set --". */
export const TS_NOT_APPLICABLE = 'Testing not applicable';
export const TS_APPROVED = 'Approved';
export const TS_ACCEPTED_OPTIONS = [TS_NOT_APPLICABLE, TS_APPROVED];
export const TS_NOT_SET = '-- Not set --';
/** The empty choice of "Move to test system": takes the spools off their test system. */
export const NO_TEST_SYSTEM = '----';

/** Custom document types of a test system ("Attachments"), in the order and wording of the reference. */
export const HYDROTEST_DOCUMENT_TYPES = ['Punchlist', 'Pressure test ITP', 'Blind list', 'Pressure gauge/recorder calibration cert.', 'Piping and instrumentation diagram (P&ID)', '3D snippet'];
/** Types of documents attached to a hydrotest request before they moved to the test system; still valid there. */
const LEGACY_REQUEST_DOCUMENT_TYPES = ['Pressure test', 'Calibration certificate', 'Test diagram', 'Other'];
/** The generic type the Documents tab of any record attaches with; still accepted so that tab keeps working. */
const GENERIC_DOCUMENT_TYPE = 'Attachment';
/** Document type of the signed files of an entered result. */
export const HYDROTEST_RESULT_DOCUMENT = 'Hydrotest result';
/** Earlier result values of a hydrotest request (no longer entered; a stored "Passed" still completes the system). */
export const HYDROTEST_RESULTS = ['Passed', 'Failed'];
export const PDF_ONLY = 'Only PDFs are allowed.';

// ----- resource definitions -----------------------------------------------------------------------------------

const t = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', ...extra });
const TIME_HINT = 'Time as HH:MM, for example 09:30.';

/** Added to the existing `test_systems` resource (see `extend()` in shared/resources.ts). */
export const TEST_SYSTEM_FIELDS: Field[] = [
  t('accepted', 'Test system accepted by client', { type: 'select', options: TS_ACCEPTED_OPTIONS, default: '', blank: TS_NOT_SET, hint: '"Testing not applicable" takes the spools of the system out of the hydrotest; "Approved" completes it, and is set only after a signed document is uploaded.' }),
];
/** Added to the `spools` resource: the test system a spool is tested in, written only by "Move to test system". */
export const SPOOL_TEST_SYSTEM_FIELDS: Field[] = [
  t('testSystemId', 'Test system', { type: 'ref', ref: 'test_systems', hidden: true }),
];

/** The fields of the "Hydrotest release" dialog, in the order of the reference. None is required. */
const requestFields: Field[] = [
  // Fixed by the Spools tab filter; not offered in the dialog.
  t('testSystemId', 'Test system', { type: 'ref', ref: 'test_systems', required: true, hidden: true }),
  t('engineerId', 'QA/QC engineer', { type: 'ref', ref: 'qa_engineers' }),
  t('recordNo', 'Test record no.', { hint: 'Left empty, the next number is given.' }),
  t('pumpType', 'Pump type'), t('hoseType', 'Hose type'), t('manifold', 'Manifold'),
  t('gaugeNo', 'Pressure gauge no.'), t('recorderNo', 'Recorder No'), t('calibrationCert', 'Calibration cert'),
  t('pipingClass', 'Piping class'), t('designCode', 'Design code'), t('testMedium', 'Test medium'),
  t('requiredPressure', 'Required Test pressure'), t('actualPressure', 'Actual Test pressure'), t('date', 'Date', { type: 'date' }),
  t('testStart', 'Test start', { hint: TIME_HINT }), t('testEnd', 'Test end', { hint: TIME_HINT }),
  t('areaTemp', 'Area temp'), t('testDuration', 'Test duration'),
  t('requiredLeakPressure', 'Required Leak Test Pressure'), t('leakDuration', 'Leak Test duration'),
  t('note', 'Note', { type: 'textarea' }),
  t('includeIsometrics', 'Include isometric(s)', { type: 'checkbox', default: false }),
  // Written by the server when the release is made: the custom document types ticked under "Include files in hydrotest
  // release" and the spools of the test system at that moment (JSON lists).
  t('includeDocuments', 'Included documents', { hidden: true }),
  t('spoolIds', 'Spools', { hidden: true }),
  // Earlier way of recording the outcome on the request; kept on stored records, no longer entered.
  t('result', 'Result', { type: 'select', options: HYDROTEST_RESULTS, default: '', hidden: true }),
];

/** Resource definition of the hydrotest releases (inserted into the registry by shared/resources.ts). */
export const HYDROTEST_REQUEST_RESOURCE: Resource = {
  key: 'hydrotest_requests', title: 'Hydrotest releases', singular: 'hydrotest release', module: 'welding', group: 'Releases',
  description: 'Hydrotest releases (Pressure Test Plans) of a test system, with the equipment and the test conditions.',
  fields: requestFields, columns: ['recordNo', 'testSystemId', 'date', 'requiredPressure', 'actualPressure'], display: 'recordNo', unique: [['recordNo']],
};
/** Results of a test system ("Enter results"): the signed PDF(s) are attachments of the result. */
export const HYDROTEST_RESULT_RESOURCE: Resource = {
  key: 'hydrotest_results', title: 'Hydrotest results', singular: 'hydrotest result', module: 'welding', group: 'Releases',
  description: 'Signed hydrotest results of a test system with the client’s acceptance.',
  fields: [t('testSystemId', 'Test system', { type: 'ref', ref: 'test_systems', required: true }), t('date', 'Date', { type: 'date' }), t('accepted', 'Accepted?', { type: 'checkbox', default: false })],
  columns: ['testSystemId', 'date', 'accepted'], display: 'testSystemId', readonly: true, actions: ['hydrotest-result', 'hydrotest-result-delete'],
};
export const HYDROTEST_RESOURCES: Resource[] = [HYDROTEST_REQUEST_RESOURCE, HYDROTEST_RESULT_RESOURCE];
/** Permission area of the new resources: the reference's "Hydrotest request" area. */
export const HYDROTEST_SCOPES: Record<string, string[]> = { hydrotest_requests: ['74'], hydrotest_results: ['74'] };

// ----- actions ------------------------------------------------------------------------------------------------

const ref = (name: string, label: string, resource: string, extra: Partial<ActionField> = {}): ActionField => ({ name, label, type: 'ref', ref: resource, required: true, ...extra });
/** Fields of the "Hydrotest release" action: the dialog's fields and the ticked document types. */
const releaseFields: ActionField[] = [
  ...requestFields.filter(field => !['includeDocuments', 'spoolIds', 'result'].includes(field.name)),
  { ...t('includeDocuments', 'Include files in hydrotest release', { type: 'select', options: HYDROTEST_DOCUMENT_TYPES }), multiple: true },
];
export const HYDROTEST_ACTIONS: ActionDefinition[] = [
  { key: 'hydrotest-move', title: 'Move to test system', module: 'welding', submit: 'Confirm',
    description: 'Put the checked spools into a test system, or take them off with "----". A spool belongs to one test system at a time.',
    fields: [ref('spoolIds', 'Spools', 'spools', { multiple: true }), ref('testSystemId', 'Test system', 'test_systems', { required: false, blank: NO_TEST_SYSTEM })] },
  { key: 'hydrotest-release', title: 'Hydrotest release', module: 'welding', submit: 'Confirm',
    description: 'The Pressure Test Plan of the filtered test system with all of its spools.', fields: releaseFields },
  { key: 'hydrotest-result', title: 'Enter results', module: 'welding', submit: 'Add',
    description: 'The signed acceptance document of a test system; "Accepted?" approves the system once a signed document is uploaded, which finishes its hydrotest.',
    fields: [ref('testSystemId', 'Test system', 'test_systems'), t('accepted', 'Accepted?', { type: 'checkbox', default: false }), ref('resultId', 'Result', 'hydrotest_results', { required: false })] },
  { key: 'hydrotest-result-delete', title: 'Delete result', module: 'welding', submit: 'Delete',
    description: 'Remove a result and its files from the results history.', fields: [ref('resultId', 'Result', 'hydrotest_results')] },
  { key: 'hydrotest-documents', title: 'Attachments', module: 'welding', submit: 'Save',
    description: 'Delete the checked custom documents of a test system.',
    fields: [ref('testSystemId', 'Test system', 'test_systems'), ref('deleteIds', 'Check for delete', 'attachments', { multiple: true, required: false })] },
];
/** Permission of each action: [area, verb]. Moving also needs the edit right on isometrics (see canAction). */
export const HYDROTEST_ACTION_SCOPES: Record<string, [string, 'edit' | 'insert' | 'delete']> = {
  'hydrotest-move': ['87', 'edit'], 'hydrotest-release': ['74', 'insert'], 'hydrotest-result': ['74', 'insert'], 'hydrotest-result-delete': ['74', 'delete'], 'hydrotest-documents': ['87', 'edit'],
};

// ----- rules --------------------------------------------------------------------------------------------------

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (value: unknown) => TIME.test(text(value));
export const isPdfName = (name: unknown) => /\.pdf$/i.test(text(name));

/** A stored JSON list of strings ('' or an unreadable value is an empty list). */
export function storedList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  try { const parsed = JSON.parse(text(value) || '[]'); return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : []; } catch { return []; }
}

/** Errors by field of a hydrotest release being saved: the time format. Nothing is required. */
export function hydrotestRequestErrors(data: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, label] of [['testStart', 'Test start'], ['testEnd', 'Test end']]) if (text(data[name]) && !isTime(data[name])) errors[name] = `${label} must be a time such as 09:30.`;
  return errors;
}
/**
 * Extra validation the store runs for the hydrotest records (called from `Store.validate`): the request rules above,
 * the custom documents of a test system (one of the six types, PDF only), the files of a result (PDF only) and the
 * documents attached to a request before they moved to the test system.
 */
export function hydrotestErrors(key: string, data: Record<string, unknown>): Record<string, string> {
  if (key === 'hydrotest_requests') return hydrotestRequestErrors(data);
  if (key !== 'attachments') return {};
  const type = text(data.documentType);
  if (data.entityType === 'test_systems') {
    if (!HYDROTEST_DOCUMENT_TYPES.includes(type) && type !== GENERIC_DOCUMENT_TYPE) return { documentType: `Choose one of: ${HYDROTEST_DOCUMENT_TYPES.join(', ')}.` };
    if (!isPdfName(data.name)) return { name: PDF_ONLY };
  }
  if (data.entityType === 'hydrotest_results' && !isPdfName(data.name)) return { name: PDF_ONLY };
  if (data.entityType === 'hydrotest_requests' && ![...HYDROTEST_DOCUMENT_TYPES, ...LEGACY_REQUEST_DOCUMENT_TYPES, GENERIC_DOCUMENT_TYPE].includes(type)) return { documentType: `Choose one of: ${HYDROTEST_DOCUMENT_TYPES.join(', ')}.` };
  return {};
}

/**
 * The test system of a spool. A spool saved before test systems moved to spool level has no `testSystemId` of its own:
 * it follows its isometric's. Nothing writes that value onto old spools (the hosted preparation only inserts); every reader
 * (Spools tab and its filter, hydrotest state of an isometric, release dialog, Pressure Test Plan) goes through this function.
 */
export function spoolTestSystemId(spool: Row, iso?: Row | null): string {
  return spool.testSystemId === undefined || spool.testSystemId === null ? text(iso?.testSystemId) : text(spool.testSystemId);
}
export interface HydrotestRows {
  test_systems?: Row[] | null;
  /** Spools; absent or `null`: the isometric's own `testSystemId` decides (callers that do not read spools). */
  spools?: Row[] | null;
  hydrotest_requests?: Row[] | null;
  hydrotest_results?: Row[] | null;
  /** Release records; a Hydrotest release of the isometric also counts as completed (earlier way of recording it). */
  releases?: Row[] | null;
}
/** The test systems of an isometric: those of its spools, or (without spools) its own. */
export function isoTestSystemIds(isometric: Row, rows: Pick<HydrotestRows, 'spools'>): string[] {
  const spools = rows.spools ? live(rows.spools).filter(spool => spool.isoId === isometric.id) : [];
  if (spools.length) return [...new Set(spools.map(spool => spoolTestSystemId(spool, isometric)).filter(Boolean))];
  return text(isometric.testSystemId) ? [text(isometric.testSystemId)] : [];
}
/** The spools of a test system, with their isometric. */
export function spoolsOfSystem(systemId: string, rows: { spools?: Row[] | null; isometrics?: Row[] | null }): { spool: Row; iso?: Row }[] {
  const isos = new Map(live(rows.isometrics).map(iso => [iso.id, iso]));
  return live(rows.spools).map(spool => ({ spool, iso: isos.get(text(spool.isoId)) })).filter(entry => text(systemId) !== '' && spoolTestSystemId(entry.spool, entry.iso) === text(systemId));
}
/** Message of a refused approval: the signed document comes first. */
export const APPROVAL_NEEDS_DOCUMENT = 'Upload the signed document (PDF) of this test system first, then approve it.';
/**
 * Whether a test system has a signed document: a live PDF attached as "Hydrotest result" to a live result of the system
 * (the files of "Enter results"). The custom documents of the system (punchlist, ITP, blind list …) are not signed results.
 */
export function hasSignedDocument(systemId: string, rows: { hydrotest_results?: Row[] | null; attachments?: Row[] | null }): boolean {
  const results = new Set(live(rows.hydrotest_results).filter(row => text(row.testSystemId) === systemId).map(row => row.id));
  return live(rows.attachments).some(file => file.entityType === 'hydrotest_results' && results.has(String(file.entityId)) && text(file.documentType) === HYDROTEST_RESULT_DOCUMENT && isPdfName(file.name));
}
/**
 * A test system's hydrotest is done only when the client's approval is recorded ("Approved", which the server sets only
 * after a signed document is uploaded). Systems finished under the earlier rule keep their completion: an accepted result
 * or a passed request of the system still counts (new approvals always carry both the document and the Approved status;
 * taking the status off an approved system also takes the acceptance off its results).
 */
export function systemCompleted(system: Row | undefined, systemId: string, rows: HydrotestRows): boolean {
  return text(system?.accepted) === TS_APPROVED
    || live(rows.hydrotest_results).some(row => text(row.testSystemId) === systemId && row.accepted === true)
    || live(rows.hydrotest_requests).some(row => text(row.testSystemId) === systemId && text(row.result) === 'Passed');
}

export interface HydrotestState {
  /** The isometric takes part in the hydrotest: a test system of its spools is not "Testing not applicable", and there are records to judge it by. */
  inScope: boolean;
  /** Every applicable test system of its spools is completed (see `systemCompleted`), or a Hydrotest release of the isometric is recorded. */
  completed: boolean;
}
const OUT: HydrotestState = { inScope: false, completed: false };
/**
 * Hydrotest state of one isometric, following the test systems of its spools. Pure: takes the isometric and the rows it
 * may read (`null` or absent means the account cannot read them; with neither requests, results nor releases readable
 * the isometric cannot be judged and is out of scope instead of 0 %). A test system that is unknown while test systems
 * are readable (deleted) counts as none.
 */
export function hydrotestState(isometric: Row, rows: HydrotestRows): HydrotestState {
  const ids = isoTestSystemIds(isometric, rows);
  if (!ids.length) return OUT;
  const systems = rows.test_systems ? live(rows.test_systems) : null;
  const systemOf = (id: string) => systems?.find(row => row.id === id);
  const applicable = ids.filter(id => (!systems || systemOf(id)) && text(systemOf(id)?.accepted) !== TS_NOT_APPLICABLE);
  if (!applicable.length) return OUT;
  if (!rows.hydrotest_requests && !rows.releases && !rows.hydrotest_results) return OUT;
  // A Reopened Hydrotest release no longer counts (same rule as isReleased() in shared/releases.ts, inlined to avoid an import cycle).
  const released = live(rows.releases).some(row => row.isoId === isometric.id && row.type === 'Hydrotest' && row.status !== 'Reopened');
  return { inScope: true, completed: released || applicable.every(id => systemCompleted(systemOf(id), id, rows)) };
}

/** Colour of a test system's state: Approved green, Testing not applicable red, Not set blue (not tested yet). */
export type HydrotestColour = 'green' | 'red' | 'blue';
export function testSystemColour(system: Row | undefined | null): HydrotestColour {
  const accepted = text(system?.accepted);
  return accepted === TS_APPROVED ? 'green' : accepted === TS_NOT_APPLICABLE ? 'red' : 'blue';
}
/** Colour of a spool row: its test system's colour; red without a test system. */
export const spoolColour = (system: Row | undefined | null): HydrotestColour => system ? testSystemColour(system) : 'red';
/** The text a colour stands for (screen readers and tooltips). */
export const colourMeaning = (system: Row | undefined | null) => !system ? 'No test system' : text(system.accepted) || TS_NOT_SET;

// ----- the Spools tab -----------------------------------------------------------------------------------------

/** Columns of the Spools tab, in the order of the reference. */
export const SPOOL_COLUMNS = ['Project', 'ISO', 'Spool', 'Diameter', 'Paint spec.', 'Asset tag', 'Test pressure', 'Test system', 'Check'];
/**
 * The first seven cells of a spool row (Project … Test pressure); '' where nothing is stored. Paint spec., Asset tag and
 * Test pressure are the isometric's (mto-catalogs-022: a spool's paint spec. is its isometric's).
 */
export function spoolFacts(spool: Row, iso: Row | undefined, project: Row | undefined): string[] {
  return [text(project?.internnumber), text(iso?.isoNo), text(spool.name), text(spool.diameter), text(iso?.paintSpec), text(iso?.assetTag), text(iso?.testPressure)];
}
