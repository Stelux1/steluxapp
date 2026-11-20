import { APPROVAL_NEEDS_DOCUMENT, HYDROTEST_DOCUMENT_TYPES, HYDROTEST_REQUEST_RESOURCE, TS_APPROVED, isoTestSystemIds, spoolTestSystemId, spoolsOfSystem } from '../shared/hydrotest.ts';
import type { Row } from '../shared/types.ts';
import { AppError, today, type Actor, type Store } from './store.ts';

type Input = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
type Result = { resource: string; record?: Row; records?: Row[] };
const ids = (value: unknown, message: string, max = 500) => {
  if (!Array.isArray(value) || !value.length || value.length > max || value.some(id => typeof id !== 'string' || !id)) throw new AppError(422, message);
  return [...new Set(value as string[])];
};

/**
 * Transactional actions of the hydrotest release. The permission check happens before this runs (`canAction`); this
 * validates the records the action touches. Under access per project site every record is read through `store.get`,
 * so a spool, isometric or test system outside the account's main projects is refused (Store.recordGuard).
 */
export function runHydrotestAction(store: Store, key: string, data: Input, actor: Actor): Result {
  return store.transaction((): Result => {
    if (key === 'hydrotest-move') return moveSpools(store, data, actor);
    if (key === 'hydrotest-release') return releaseSystem(store, data, actor);
    if (key === 'hydrotest-result') return enterResult(store, data, actor);
    if (key === 'hydrotest-result-delete') return deleteResult(store, data, actor);
    if (key === 'hydrotest-documents') return deleteDocuments(store, data, actor);
    throw new AppError(404, 'This action does not exist.');
  });
}

/**
 * The isometric's own test system follows its spools (the Technical card and the lists show it): the first test system
 * of its spools by spool number, or none. An isometric without spools keeps its own.
 */
function syncIsometric(store: Store, isoId: string, actor: Actor) {
  const iso = store.get('isometrics', isoId);
  const spools = store.list('spools').filter(spool => spool.isoId === iso.id).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  if (!spools.length) return iso;
  const next = isoTestSystemIds(iso, { spools })[0] ?? '';
  return next === str(iso.testSystemId) ? iso : store.update('isometrics', iso.id, { testSystemId: next }, iso._version, actor);
}

/** "Move to test system": the checked spools go into the chosen test system, or off it with "----" (empty). All or nothing; spools of any project. */
function moveSpools(store: Store, data: Input, actor: Actor): Result {
  const spoolIds = ids(data.spoolIds, 'Check at least one spool.');
  const systemId = str(data.testSystemId);
  if (systemId) store.get('test_systems', systemId);
  const spools = spoolIds.map(id => store.get('spools', id));
  // A spool saved before test systems moved to spool level follows its isometric. The isometric's own test system follows
  // its spools after the move, so its other spools without one of their own keep the system they show now.
  const moving = new Set(spools.map(spool => spool.id));
  for (const isoId of new Set(spools.map(spool => String(spool.isoId)))) {
    const iso = store.get('isometrics', isoId);
    for (const sibling of store.list('spools').filter(row => row.isoId === iso.id && !moving.has(row.id) && (row.testSystemId === undefined || row.testSystemId === null))) store.update('spools', sibling.id, { testSystemId: spoolTestSystemId(sibling, iso) }, sibling._version, actor);
  }
  const records = spools.map(spool => {
    store.get('isometrics', spool.isoId);
    return spool.testSystemId !== undefined && spool.testSystemId !== null && spool.testSystemId === systemId ? spool : store.update('spools', spool.id, { testSystemId: systemId }, spool._version, actor);
  });
  for (const isoId of new Set(spools.map(spool => String(spool.isoId)))) syncIsometric(store, isoId, actor);
  return { resource: 'spools', records };
}

/**
 * "Hydrotest release" of one test system: stores the dialog's values with the spools of the system at this moment and the
 * ticked document types, so the Pressure Test Plan can be printed (and printed again) from it. An empty test record
 * number gets the next number.
 */
function releaseSystem(store: Store, data: Input, actor: Actor): Result {
  const system = store.get('test_systems', data.testSystemId);
  const spools = spoolsOfSystem(system.id, { spools: store.list('spools'), isometrics: store.list('isometrics') });
  for (const { spool } of spools) store.get('spools', spool.id);
  const types = Array.isArray(data.includeDocuments) ? [...new Set(data.includeDocuments.map(str))].filter(Boolean) : [];
  const unknown = types.filter(type => !HYDROTEST_DOCUMENT_TYPES.includes(type));
  if (unknown.length) throw new AppError(422, `Choose documents of these types: ${HYDROTEST_DOCUMENT_TYPES.join(', ')}.`, { includeDocuments: 'Choose one of the document types.' });
  const values: Input = {};
  for (const field of HYDROTEST_REQUEST_RESOURCE.fields) if (data[field.name] !== undefined && !['spoolIds', 'includeDocuments', 'result'].includes(field.name)) values[field.name] = data[field.name];
  values.testSystemId = system.id;
  values.recordNo = str(data.recordNo) || store.next('HTR');
  values.includeDocuments = JSON.stringify(HYDROTEST_DOCUMENT_TYPES.filter(type => types.includes(type)));
  values.spoolIds = JSON.stringify(spools.map(entry => entry.spool.id));
  const record = store.create('hydrotest_requests', values, actor);
  return { resource: 'hydrotest_requests', record };
}

/**
 * "Enter results": one result of a test system (its signed PDF files are attached to it afterwards). The hydrotest is
 * finished only when the system is Approved, and the server approves only after a signed document (PDF) is uploaded:
 * "Accepted?" on a new result is refused until an earlier result of the system has one; with `resultId` the client marks
 * the result it has just uploaded its files to as accepted and approves the system ("Test system accepted by client").
 * Every result stays in the Results history; a later one never replaces an earlier one.
 */
function enterResult(store: Store, data: Input, actor: Actor): Result {
  const system = store.get('test_systems', data.testSystemId);
  if (data.accepted !== undefined && typeof data.accepted !== 'boolean') throw new AppError(422, 'Accepted? must be checked or unchecked.', { accepted: 'Check or uncheck Accepted?.' });
  const accepted = data.accepted === true, resultId = str(data.resultId);
  let record: Row;
  if (resultId) {
    if (!accepted) throw new AppError(422, 'Accepted? must be checked to approve a result.', { accepted: 'Check Accepted?.' });
    const existing = store.get('hydrotest_results', resultId);
    if (existing.testSystemId !== system.id) throw new AppError(422, 'This result belongs to another test system.', { resultId: 'Choose a result of this test system.' });
    record = existing.accepted === true ? existing : store.update('hydrotest_results', existing.id, { accepted: true }, existing._version, actor);
  } else {
    record = store.create('hydrotest_results', { testSystemId: system.id, date: today(), accepted }, actor);
  }
  // The store refuses the approval without a signed document (after its own access check); the whole action is rolled back, the result included.
  if (accepted && system.accepted !== TS_APPROVED) {
    try { store.update('test_systems', system.id, { accepted: TS_APPROVED }, system._version, actor); }
    catch (error) { if (error instanceof AppError && error.status === 422 && error.fields?.accepted === APPROVAL_NEEDS_DOCUMENT) throw new AppError(422, APPROVAL_NEEDS_DOCUMENT, { accepted: APPROVAL_NEEDS_DOCUMENT }); throw error; }
  }
  return { resource: 'hydrotest_results', record };
}

const filesOf = (store: Store, entityType: string, entityId: string) => store.list('attachments').filter(file => file.entityType === entityType && file.entityId === entityId);

/** Delete one result of the Results history with its files. The system's acceptance is left as it is. */
function deleteResult(store: Store, data: Input, actor: Actor): Result {
  const result = store.get('hydrotest_results', data.resultId);
  store.get('test_systems', result.testSystemId);
  for (const file of filesOf(store, 'hydrotest_results', result.id)) store.archive('attachments', file.id, file._version, actor);
  const record = store.archive('hydrotest_results', result.id, result._version, actor);
  return { resource: 'hydrotest_results', record };
}

/** "Attachments" → "Check for delete" + Save: the checked custom documents of the test system are deleted. */
function deleteDocuments(store: Store, data: Input, actor: Actor): Result {
  const system = store.get('test_systems', data.testSystemId);
  const wanted = data.deleteIds === undefined || (Array.isArray(data.deleteIds) && !data.deleteIds.length) ? [] : ids(data.deleteIds, 'Check the documents to delete.');
  const own = new Map(filesOf(store, 'test_systems', system.id).map(file => [file.id, file]));
  const missing = wanted.filter(id => !own.has(id));
  if (missing.length) throw new AppError(422, 'Only documents of this test system can be deleted here.', { deleteIds: 'Check documents of this test system.' });
  const records = wanted.map(id => store.archive('attachments', id, own.get(id)!._version, actor));
  return { resource: 'attachments', records };
}

/**
 * Sample hydrotest data for the local workspace: acceptance per test system, a second and third test system with
 * their spools, one hydrotest release and one accepted result. Runs once; skips anything that is not in the sample seed.
 */
export function seedHydrotest(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_hydrotest_v1'").get()) return;
  const has = (key: string, id: string) => { try { store.get(key, id); return true; } catch { return false; } };
  store.transaction(() => {
    const system = store.get('test_systems', 'test-cw');
    store.update('test_systems', system.id, { accepted: 'Approved', description: 'Cooling water loop, hydrostatic test with potable water.' }, system._version);
    store.create('test_systems', { name: 'ST-01', projectId: 'project-steam', medium: 'Water', pressure: '24 bar', description: 'Steam condensate loop, tested before insulation.' }, undefined, 'test-st');
    store.create('test_systems', { name: 'SK-01', projectId: 'project-skid', medium: 'Water', pressure: '24 bar', accepted: 'Testing not applicable', description: 'Skid piping is pressure tested at the skid vendor.' }, undefined, 'test-sk');
    const assign = (isoId: string, testSystemId: string) => { if (has('isometrics', isoId)) { const iso = store.get('isometrics', isoId); store.update('isometrics', iso.id, { testSystemId }, iso._version); } };
    for (const id of ['iso-4', 'iso-5', 'iso-6']) assign(id, 'test-st');
    for (const id of ['iso-7', 'iso-8', 'iso-9', 'iso-10']) assign(id, 'test-sk');
    // Every sample spool is in the test system of its isometric.
    const isos = new Map(store.list('isometrics').map(iso => [iso.id, iso]));
    for (const spool of store.list('spools')) store.update('spools', spool.id, { testSystemId: String(isos.get(String(spool.isoId))?.testSystemId ?? '') }, spool._version);
    const qa = has('qa_engineers', 'qa-1') ? 'qa-1' : '';
    store.create('hydrotest_requests', {
      testSystemId: 'test-cw', recordNo: 'HTR-CW-01', engineerId: qa, date: '2026-10-26', pumpType: 'Electric hydrotest pump, 0–250 bar', hoseType: 'High-pressure hose, 350 bar rated', manifold: 'MF-02',
      gaugeNo: 'PG-1187', recorderNo: 'REC-044', calibrationCert: 'CAL-2026-0312', pipingClass: 'CS150', designCode: 'ASME B31.3', testMedium: 'Water',
      requiredPressure: '15 bar', actualPressure: '15.2 bar', testStart: '09:30', testEnd: '10:45', areaTemp: '14 °C', testDuration: '60 min',
      requiredLeakPressure: '5 bar', leakDuration: '30 min', includeIsometrics: true, note: 'No visible leaks, pressure held for the full duration.',
      spoolIds: JSON.stringify(store.list('spools').filter(spool => spool.testSystemId === 'test-cw').map(spool => spool.id)), includeDocuments: '[]',
    }, undefined, 'hydrotest-cw-1');
    store.create('hydrotest_results', { testSystemId: 'test-cw', date: '2026-10-27', accepted: true }, undefined, 'hydrotest-result-cw-1');
    store.create('hydrotest_requests', { testSystemId: 'test-st', recordNo: 'HTR-ST-01', engineerId: qa, date: '2026-11-20', pipingClass: 'SS300', designCode: 'ASME B31.3', testMedium: 'Water', requiredPressure: '24 bar', includeIsometrics: true, note: 'Planned after the field welds are accepted.' }, undefined, 'hydrotest-st-1');
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_hydrotest_v1','1')").run();
  });
}
