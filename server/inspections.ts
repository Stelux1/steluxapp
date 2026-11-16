import { Store, AppError, validDate, today, type Actor } from './store.ts';
import type { Row } from '../shared/types.ts';
import {
  NDT_ROUNDS, NDT_TYPES, REPAIR_COPY_FIELDS, REQUEST_PREFIX, EXTRA_RESULT_OPTION, VISUAL_NO_CHOICE, currentRequest, locationField, nextRepairNumber,
  processField, repairDue, requestNumberError, roundErrors, tracerError, tracersOf, type RoundInput,
} from '../shared/inspections.ts';

/**
 * Server side of NDT per weld, mass requests and uploads, visual inspection, Pre-HT / PWHT and tracers. Runs inside the
 * transaction of `runAction` (server/workflows.ts); permissions are checked by the HTTP layer before.
 */
type Input = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const ids = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(item => typeof item !== 'string' || !item)) throw new AppError(422, `Select at least one ${label}.`);
  return [...new Set(value)] as string[];
};
const optionalIds = (value: unknown, label: string) => value === undefined || value === null || (Array.isArray(value) && !value.length) ? [] : ids(value, label);
const short = (value: unknown, label: string, max = 80) => { const text = str(value); if (value !== undefined && value !== null && typeof value !== 'string') throw new AppError(422, `${label} must be text.`); if (text.length > max) throw new AppError(422, `${label} has at most ${max} characters.`); return text; };
const optionalDate = (value: unknown, label = 'Date') => value === undefined || value === null || value === '' ? '' : validDate(value, label);

export function weldLengthMm(store: Store, weld: Row) {
  if (weld.lengthMode === 'Length in mm') return Number(weld.dialen) || 0;
  return weld.diameterId ? Number(store.get('diameters', weld.diameterId, true).outline) || 0 : 0;
}

export function inspectionRules(store: Store, actor: Actor) {
  const patch = (key: string, row: Row, input: Input) => {
    const changed = Object.entries(input).some(([name, value]) => (row[name] ?? '') !== (value ?? ''));
    return changed ? store.update(key, row.id, input, store.get(key, row.id)._version, actor) : row;
  };
  const welds = () => store.list('welds');
  const results = () => store.list('inspection_results');

  /** Creates the repair weld (`010` → `010R1`) when the weld's latest NDT result is not accepted and it has none yet. */
  function ensureRepair(weld: Row): Row | undefined {
    const current = store.get('welds', weld.id);
    if (!repairDue(current, welds(), results())) return undefined;
    const number = nextRepairNumber(current, welds());
    const copy = Object.fromEntries(REPAIR_COPY_FIELDS.filter(name => current[name] !== undefined && current[name] !== '').map(name => [name, current[name]]));
    // The repair carries the original's definition, so it keeps references to catalog records since switched off on the site.
    const repair = store.keepingReferences(() => store.create('welds', { ...copy, weldNo: number, isoId: current.isoId, repair: true, repairOfId: current.id }, actor));
    store.audit('welds', current.id, 'repair', `Repair weld ${number} created`, actor);
    return repair;
  }

  /** The weld's request of a type, created when it has none (number: given, or the next `R-…`). */
  function requestFor(weld: Row, type: string, input: Input = {}): Row {
    const existing = currentRequest(store.list('inspection_requests'), weld.id, type);
    if (existing) return Object.keys(input).length ? patch('inspection_requests', existing, input) : existing;
    return store.create('inspection_requests', { number: str(input.number) || store.next(REQUEST_PREFIX), weldId: weld.id, type, date: today(), status: 'Open', ...input }, actor);
  }

  /** Writes one round of a weld's NDT: updates the round's result, records a new one, or removes it ("—"). */
  function writeRound(weld: Row, request: Row, type: string, input: RoundInput, fallbackDate: string): Row | null {
    const length = weldLengthMm(store, weld);
    const errors = roundErrors(input, length);
    if (Object.keys(errors).length) throw new AppError(422, `${NDT_ROUNDS.find(round => round.key === input.round)?.label ?? 'Round'}: ${Object.values(errors)[0]}`);
    if (input.processId) store.get('ndt_processes', input.processId);
    const result = str(input.result);
    const existing = store.list('inspection_results').filter(row => row.weldId === weld.id && row.type === type && row.round === input.round && row.requestId === request.id && str(row.result) !== '');
    if (!result) { for (const row of existing) store.archive('inspection_results', row.id, row._version, actor); return null; }
    const data = {
      requestId: request.id, weldId: weld.id, type, round: input.round, result, reportNo: str(input.reportNo), filmNo: str(input.filmNo), processId: str(input.processId),
      date: optionalDate(input.date, 'NDT date') || fallbackDate, examinedLength: length,
      naLength: input.round === 'Initial' && result === 'Rejected' && input.naLength !== undefined && input.naLength !== '' && input.naLength !== null ? Number(input.naLength) : null,
      defectType: input.round === 'Initial' && result === 'Rejected' ? str(input.defectType) : '', reweld: input.round === 'Remaining' && input.reweld === true,
    };
    const previous = existing[0];
    for (const extra of existing.slice(1)) store.archive('inspection_results', extra.id, extra._version, actor);
    const same = previous && Object.entries(data).every(([name, value]) => (previous[name] ?? '') === (value ?? ''));
    if (same) return previous;
    const record = previous ? store.update('inspection_results', previous.id, data, previous._version, actor) : store.create('inspection_results', { ...data, note: '' }, actor);
    store.audit('welds', weld.id, 'inspected', `${type} ${result.toLowerCase()} · ${data.reportNo}`, actor);
    return record;
  }
  /** Request status after a save: the result of the last round that has one, otherwise Open. */
  function settle(request: Row) {
    const recorded = store.list('inspection_results').filter(row => row.requestId === request.id && str(row.result) !== '');
    const last = NDT_ROUNDS.slice().reverse().map(round => recorded.find(row => row.round === round.key)).find(Boolean);
    return patch('inspection_requests', store.get('inspection_requests', request.id), { status: last ? String(last.result) : 'Open' });
  }
  function ndtType(value: unknown) { const type = str(value); if (!NDT_TYPES.includes(type)) throw new AppError(422, 'Choose NDT or NDT Pre.'); return type; }
  function rounds(value: unknown, requireResult: boolean): RoundInput[] {
    if (!Array.isArray(value) || value.length > NDT_ROUNDS.length || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new AppError(422, 'Enter the examination rounds.');
    const list = value as RoundInput[];
    if (new Set(list.map(item => item.round)).size !== list.length) throw new AppError(422, 'Enter each examination round once.');
    for (const item of list) {
      if (!NDT_ROUNDS.some(round => round.key === item.round)) throw new AppError(422, 'Choose an examination round.');
      for (const name of ['processId', 'filmNo', 'reportNo', 'date', 'result', 'defectType']) short(item[name as keyof RoundInput], name === 'reportNo' ? 'NDT Rp/Nr.' : name === 'filmNo' ? 'Film Nr.' : 'A round value');
      if (requireResult && (!str(item.result) || !str(item.reportNo))) throw new AppError(422, `${NDT_ROUNDS.find(round => round.key === item.round)!.label}: enter a report number and a result.`);
    }
    return list;
  }

  return {
    ensureRepair,
    run(key: string, data: Input): { resource: string; record?: Row; records?: Row[] } {
      const date = data.date ? validDate(data.date) : today();
      if (key === 'ndt-weld') {
        const weld = store.get('welds', data.weldId); const type = ndtType(data.type); const pre = type === 'NDT PRE';
        const locationId = short(data.locationId, 'NDT location'); if (locationId) store.get('ndt_locations', locationId);
        const requestNo = short(data.requestNo, 'Request number', 40); const numberError = requestNumberError(requestNo); if (numberError) throw new AppError(422, numberError, { requestNo: numberError });
        const list = rounds(data.rounds ?? [], false);
        const processes = Object.fromEntries(list.map(item => [processField(pre, NDT_ROUNDS.find(round => round.key === item.round)!.index), str(item.processId)]));
        const updated = patch('welds', weld, { [locationField(pre)]: locationId, ...processes });
        const initial = list.find(item => item.round === 'Initial');
        const touched = list.some(item => str(item.result)) || requestNo || currentRequest(store.list('inspection_requests'), weld.id, type);
        if (!touched) return { resource: 'welds', record: updated };
        const request = requestFor(updated, type, { ...(requestNo ? { number: requestNo } : {}), locationId, ...(initial ? { processId: str(initial.processId) } : {}) });
        const written = list.map(item => writeRound(updated, request, type, item, date)).filter((row): row is Row => Boolean(row));
        settle(request);
        ensureRepair(updated);
        return { resource: 'inspection_results', records: written };
      }
      if (key === 'inspection-upload') {
        const type = ndtType(data.type); const list = rounds(data.rounds, true);
        if (!list.length) throw new AppError(422, 'Enter a report number and a result for at least one round.');
        const written: Row[] = [];
        for (const id of ids(data.weldIds, 'weld')) {
          const weld = store.get('welds', id);
          const request = requestFor(weld, type);
          for (const item of list) { const row = writeRound(weld, request, type, { round: item.round, reportNo: item.reportNo, result: item.result }, date); if (row) written.push(row); }
          settle(request); ensureRepair(weld);
        }
        return { resource: 'inspection_results', records: written };
      }
      if (key === 'mass-inspection-request') {
        const type = str(data.type); if (!['NDT PRE', 'NDT', 'PRE-HT', 'PWHT'].includes(type)) throw new AppError(422, 'Choose the request type.');
        const ndt = NDT_TYPES.includes(type);
        const processIds = optionalIds(data.processIds, 'NDT process');
        if (ndt && !processIds.length) throw new AppError(422, 'Choose the NDT processes to include.', { processIds: 'Choose at least one process.' });
        const processes = processIds.map(id => String(store.get('ndt_processes', id).name));
        for (const [name, resource] of [['locationId', 'ndt_locations'], ['pwhtProcessId', 'pwht_processes'], ['pwhtLocationId', 'pwht_locations']] as const) if (str(data[name])) store.get(resource, data[name]);
        const note = short(data.note, 'Note', 2000);
        const flag = type === 'NDT PRE' ? 'ndoReqPre' : type === 'NDT' ? 'ndoReq' : type === 'PRE-HT' ? 'pwhtReqPre' : 'pwhtReq';
        const number = store.next(REQUEST_PREFIX); const created: Row[] = [];
        for (const id of ids(data.weldIds, 'weld')) {
          const weld = store.get('welds', id);
          if (weld[flag] !== true) throw new AppError(422, `Weld ${weld.weldNo} does not require ${type === 'NDT PRE' ? 'NDT Pre' : type === 'PRE-HT' ? 'Pre-HT' : type}.`);
          if (store.list('inspection_requests').some(row => row.weldId === id && row.type === type && row.status === 'Open')) throw new AppError(422, `Weld ${weld.weldNo} already has an open ${type} request.`);
          created.push(store.create('inspection_requests', { number, weldId: id, type, processId: ndt ? processIds[0] : '', processes: processes.join(', '), locationId: ndt ? str(data.locationId) : '', pwhtProcessId: ndt ? '' : str(data.pwhtProcessId), pwhtLocationId: ndt ? '' : str(data.pwhtLocationId), date, status: 'Open', note }, actor));
        }
        return { resource: 'inspection_requests', records: created };
      }
      if (key === 'pwht-upload') {
        const preReportNo = short(data.preReportNo, 'Pre report number'), reportNo = short(data.reportNo, 'Report number');
        if (!preReportNo && !reportNo) throw new AppError(422, 'Enter a Pre report number, a report number, or both.');
        if (data.checked !== undefined && typeof data.checked !== 'boolean') throw new AppError(422, 'Check must be ticked or not.');
        const written: Row[] = [];
        for (const id of ids(data.weldIds, 'weld')) {
          const weld = store.get('welds', id);
          for (const [type, number, flag, label] of [['PRE-HT', preReportNo, 'pwhtReqPre', 'Pre-HT'], ['PWHT', reportNo, 'pwhtReq', 'PWHT']] as const) {
            if (!number) continue;
            if (weld[flag] !== true) throw new AppError(422, `Weld ${weld.weldNo} does not require ${label}.`);
            const request = requestFor(weld, type);
            const data2 = { requestId: request.id, weldId: weld.id, type, round: 'Initial', result: 'Accepted', reportNo: number, preReportNo: type === 'PWHT' ? preReportNo : '', checked: data.checked === true, date, examinedLength: weldLengthMm(store, weld) };
            const previous = store.list('inspection_results').find(row => row.requestId === request.id && row.round === 'Initial');
            written.push(previous ? store.update('inspection_results', previous.id, data2, previous._version, actor) : store.create('inspection_results', { ...data2, note: '' }, actor));
            patch('inspection_requests', store.get('inspection_requests', request.id), { status: 'Accepted' });
            store.audit('welds', weld.id, 'inspected', `${type} accepted · ${number}`, actor);
          }
        }
        return { resource: 'inspection_results', records: written };
      }
      if (key === 'visual-inspection') {
        const reportNo = short(data.reportNo, 'Report No.'); if (!reportNo) throw new AppError(422, 'Enter the report number.', { reportNo: 'Enter the report number.' });
        const inspectionDate = validDate(data.date, 'Inspection date');
        const itp = short(data.itp, 'ITP'); if (itp && !['ITP 1', 'ITP 2'].includes(itp)) throw new AppError(422, 'Choose ITP 1 or ITP 2.');
        const engineerId = short(data.engineerId, 'QA/QC engineer'); if (engineerId) store.get('qa_engineers', engineerId);
        const extra = { itp, activityNo: short(data.activityNo, 'Activity No.'), engineerId, customNo: short(data.customNo, 'Custom No.') };
        // Only the welds the user chose a result for are written; a listed weld without a choice keeps what it had (PARITY "Visual inspection hub").
        const selected = ids(data.weldIds, 'weld'), choices = new Map<string, string>();
        for (const [list, result] of [[data.accepted, 'Accepted'], [data.notAccepted, 'Rejected'], [data.notApplicable, EXTRA_RESULT_OPTION]] as const) {
          for (const id of optionalIds(list, 'weld')) {
            if (!selected.includes(id)) throw new AppError(422, 'A result was chosen for a weld that is not in the report.');
            if (choices.has(id)) throw new AppError(422, 'Choose one result per weld.');
            choices.set(id, result);
          }
        }
        if (!choices.size) throw new AppError(422, VISUAL_NO_CHOICE);
        const written: Row[] = [];
        for (const id of selected) {
          const result = choices.get(id); if (!result) continue;
          const weld = store.get('welds', id);
          const previous = store.list('inspection_results').find(row => row.weldId === id && row.type === 'VI' && row.reportNo === reportNo);
          const request = previous ? store.get('inspection_requests', previous.requestId) : requestFor(weld, 'VI');
          const values = { requestId: request.id, weldId: id, type: 'VI', round: 'Initial', result, reportNo, date: inspectionDate, examinedLength: weldLengthMm(store, weld), ...extra };
          written.push(previous ? store.update('inspection_results', previous.id, values, previous._version, actor) : store.create('inspection_results', { ...values, note: '' }, actor));
          patch('inspection_requests', store.get('inspection_requests', request.id), { status: result });
          store.audit('welds', id, 'inspected', `VI ${(result === 'Rejected' ? 'Not accepted' : result).toLowerCase()} · ${reportNo}`, actor);
        }
        return { resource: 'inspection_results', records: written };
      }
      if (key === 'tracers') {
        const weld = store.get('welds', data.weldId); const wanted = optionalIds(data.tracerIds, 'tracer weld');
        const all = welds();
        const error = tracerError(weld, wanted, all, results()); if (error) throw new AppError(422, error, { tracerIds: error });
        for (const tracer of tracersOf(weld, all)) if (!wanted.includes(tracer.id)) patch('welds', tracer, { tracer: false, tracerOfId: '' });
        // A tracer weld is examined: linking sets NDT Req. on it (INFERRED, see PARITY.md).
        const linked = wanted.map(id => patch('welds', store.get('welds', id), { tracer: true, tracerOfId: weld.id, ndoReq: true }));
        return { resource: 'welds', records: linked };
      }
      throw new AppError(404, 'This action is not available.');
    },
  };
}
