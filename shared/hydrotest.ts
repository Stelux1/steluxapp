import type { ActionDefinition, ActionField, Field, Resource, Row } from './types.ts';

/**
 * Hydrotest release: test systems, their hydrotest requests and documents.
 * Pure definitions and rules shared by the client and the server. No I/O and no import of the resource registry
 * (the registry imports this file), so everything here is built from plain objects.
 */

// ----- vocabulary ---------------------------------------------------------------------------------------------

/** "Test system accepted by client". An empty value is shown as "-- Not set --". */
export const TS_NOT_APPLICABLE = 'Testing not applicable';
export const TS_ACCEPTED_OPTIONS = [TS_NOT_APPLICABLE, 'Approved'];
export const TS_NOT_SET = '-- Not set --';

/**
 * Types of the custom hydrotest documents. The capture shows a selector of six and names three of them
 * (Punchlist, Pressure test, Blind list); the other three are our own wording (unverified).
 */
export const HYDROTEST_DOCUMENT_TYPES = ['Punchlist', 'Pressure test', 'Blind list', 'Calibration certificate', 'Test diagram', 'Other'];
/** The generic type the Documents tab of any record attaches with; still accepted so that tab keeps working. */
const GENERIC_DOCUMENT_TYPE = 'Attachment';
export const HYDROTEST_RESULTS = ['Passed', 'Failed'];

// ----- resource definitions -----------------------------------------------------------------------------------

const t = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', ...extra });
const EQUIPMENT = 'Equipment', CONDITIONS = 'Test conditions', RESULT = 'Result';
const TIME_HINT = 'Time as HH:MM, for example 09:30.';

/** Added to the existing `test_systems` catalog (see `extend()` in shared/resources.ts). */
export const TEST_SYSTEM_FIELDS: Field[] = [
  t('accepted', 'Test system accepted by client', { type: 'select', options: TS_ACCEPTED_OPTIONS, default: '', blank: '-- Not set --', hint: 'Leave unset until the client decides. "Testing not applicable" takes the isometrics out of the hydrotest.' }),
];

const requestFields: Field[] = [
  t('testSystemId', 'Test system', { type: 'ref', ref: 'test_systems', required: true }),
  t('recordNo', 'Test record no.', { required: true }),
  t('engineerId', 'QA/QC engineer', { type: 'ref', ref: 'qa_engineers' }),
  t('date', 'Date', { type: 'date' }),
  t('pumpType', 'Pump type', { section: EQUIPMENT }), t('hoseType', 'Hose type', { section: EQUIPMENT }), t('manifold', 'Manifold', { section: EQUIPMENT }),
  t('gaugeNo', 'Pressure gauge no.', { section: EQUIPMENT }), t('recorderNo', 'Recorder No', { section: EQUIPMENT }), t('calibrationCert', 'Calibration cert', { section: EQUIPMENT }),
  t('pipingClass', 'Piping class', { section: CONDITIONS }), t('designCode', 'Design code', { section: CONDITIONS }), t('testMedium', 'Test medium', { section: CONDITIONS }),
  t('requiredPressure', 'Required test pressure', { section: CONDITIONS, hint: 'With its unit, for example 15 bar.' }), t('actualPressure', 'Actual test pressure', { section: CONDITIONS, hint: 'With its unit, for example 15.2 bar.' }),
  t('testStart', 'Test start', { section: CONDITIONS, hint: TIME_HINT }), t('testEnd', 'Test end', { section: CONDITIONS, hint: TIME_HINT }),
  t('areaTemp', 'Area temp', { section: CONDITIONS }), t('testDuration', 'Test duration', { section: CONDITIONS }),
  t('requiredLeakPressure', 'Required leak test pressure', { section: CONDITIONS }), t('leakDuration', 'Leak test duration', { section: CONDITIONS }),
  t('includeIsometrics', 'Include isometric(s)', { type: 'checkbox', default: true, section: CONDITIONS, hint: 'List the isometrics of the test system on the test document.' }),
  // Set by "Record hydrotest result"; hidden in the generic form so the result is recorded in one place.
  t('result', 'Result', { type: 'select', options: HYDROTEST_RESULTS, default: '', section: RESULT, hidden: true }),
  t('note', 'Note', { type: 'textarea', section: 'Notes' }),
];

/** Resource definition of the hydrotest requests (inserted into the registry by shared/resources.ts). */
export const HYDROTEST_REQUEST_RESOURCE: Resource = {
  key: 'hydrotest_requests', title: 'Hydrotest requests', singular: 'hydrotest request', module: 'welding', group: 'Releases',
  description: 'Pressure test records of a test system, with the equipment used and the result.',
  fields: requestFields, columns: ['recordNo', 'testSystemId', 'date', 'requiredPressure', 'actualPressure', 'result'], display: 'recordNo', unique: [['recordNo']],
};
export const HYDROTEST_RESOURCES: Resource[] = [HYDROTEST_REQUEST_RESOURCE];
/** Permission area of the new resource: the reference's "Hydrotest request" area. */
export const HYDROTEST_SCOPES: Record<string, string[]> = { hydrotest_requests: ['74'] };

// ----- actions ------------------------------------------------------------------------------------------------

const ref = (name: string, label: string, resource: string, extra: Partial<ActionField> = {}): ActionField => ({ name, label, type: 'ref', ref: resource, required: true, ...extra });
export const HYDROTEST_ACTIONS: ActionDefinition[] = [
  { key: 'hydrotest-move', title: 'Move isometric(s) to test system', module: 'welding', submit: 'Move isometrics',
    description: 'Assign the checked isometrics to a test system. An isometric belongs to one test system at a time.',
    fields: [ref('isoIds', 'Isometrics', 'isometrics', { multiple: true }), ref('testSystemId', 'Test system', 'test_systems')] },
  { key: 'hydrotest-result', title: 'Record hydrotest result', module: 'welding', submit: 'Record result',
    description: 'A passed test marks the hydrotest as completed for every isometric of the test system.',
    fields: [ref('requestId', 'Hydrotest request', 'hydrotest_requests'), t('result', 'Result', { type: 'select', options: HYDROTEST_RESULTS, required: true, default: 'Passed' }),
      t('actualPressure', 'Actual test pressure', { required: true }), t('date', 'Date', { type: 'date', required: true }),
      t('testStart', 'Test start', { hint: TIME_HINT }), t('testEnd', 'Test end', { hint: TIME_HINT }), t('note', 'Note', { type: 'textarea' })] },
];
/** Permission of each action: [area, verb]. Moving also needs the edit right on isometrics (see canAction). */
export const HYDROTEST_ACTION_SCOPES: Record<string, [string, 'edit']> = { 'hydrotest-move': ['87', 'edit'], 'hydrotest-result': ['74', 'edit'] };

// ----- rules --------------------------------------------------------------------------------------------------

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (value: unknown) => TIME.test(text(value));

/** Errors by field of a hydrotest request being saved: time format, and a passed result needs its evidence. */
export function hydrotestRequestErrors(data: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, label] of [['testStart', 'Test start'], ['testEnd', 'Test end']]) if (text(data[name]) && !isTime(data[name])) errors[name] = `${label} must be a time such as 09:30.`;
  if (text(data.result) === 'Passed') {
    if (!text(data.actualPressure)) errors.actualPressure = 'A passed test needs the actual test pressure.';
    if (!text(data.date)) errors.date = 'A passed test needs the test date.';
  }
  return errors;
}
/**
 * Extra validation the store runs for the hydrotest records (called from `Store.validate`): the request rules above,
 * and the document type of a file attached to a hydrotest request.
 */
export function hydrotestErrors(key: string, data: Record<string, unknown>): Record<string, string> {
  if (key === 'hydrotest_requests') return hydrotestRequestErrors(data);
  if (key === 'attachments' && data.entityType === 'hydrotest_requests') {
    const type = text(data.documentType);
    if (!HYDROTEST_DOCUMENT_TYPES.includes(type) && type !== GENERIC_DOCUMENT_TYPE) return { documentType: `Choose one of: ${HYDROTEST_DOCUMENT_TYPES.join(', ')}.` };
  }
  return {};
}

export interface HydrotestRows {
  test_systems?: Row[] | null;
  hydrotest_requests?: Row[] | null;
  /** Release records; a Hydrotest release of the isometric also counts as completed (earlier way of recording it). */
  releases?: Row[] | null;
}
export interface HydrotestState {
  /** The isometric takes part in the hydrotest: it has a test system that is not "Testing not applicable", and a record to judge it by. */
  inScope: boolean;
  /** A passed hydrotest request of its test system (or a Hydrotest release of the isometric) is recorded. */
  completed: boolean;
}
/**
 * Hydrotest state of one isometric. Pure: takes the isometric and the rows it may read (`null` or absent means
 * the account cannot read them; with neither requests nor releases readable the isometric cannot be judged and
 * is out of scope instead of 0 %).
 */
export function hydrotestState(isometric: Row, rows: HydrotestRows): HydrotestState {
  const systemId = text(isometric.testSystemId);
  if (!systemId) return { inScope: false, completed: false };
  const system = live(rows.test_systems).find(row => row.id === systemId);
  if (system && text(system.accepted) === TS_NOT_APPLICABLE) return { inScope: false, completed: false };
  if (!rows.hydrotest_requests && !rows.releases) return { inScope: false, completed: false };
  const passed = live(rows.hydrotest_requests).some(row => text(row.testSystemId) === systemId && text(row.result) === 'Passed');
  // A Reopened Hydrotest release no longer counts (same rule as isReleased() in shared/releases.ts, inlined to avoid an import cycle).
  const released = live(rows.releases).some(row => row.isoId === isometric.id && row.type === 'Hydrotest' && row.status !== 'Reopened');
  return { inScope: true, completed: passed || released };
}
