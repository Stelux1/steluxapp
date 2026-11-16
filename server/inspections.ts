import { Store, AppError, validDate, today, type Actor } from './store.ts';
import type { Row } from '../shared/types.ts';
import { scopeRows } from './site-scope.ts';
import {
  MASS_REQUEST_TEXTS, NDT_ROUNDS, NDT_TYPES, REPAIR_COPY_FIELDS, REQUEST_PREFIX, EXTRA_RESULT_OPTION, massRequestPlan, nextRequestNumber, requestFlag, requestProcessIds, VISUAL_NO_CHOICE, currentRequest, locationField, nextRepairNumber,
  processField, repairDue, roundErrors, roundLockedError, roundsHaveNa, naBlockErrors, tracerError, tracersOf, tracerProposal, weldWelderIds, type RoundInput, type TracerContext,
  VT_DOCUMENT, VT_ITPS, VT_MODES, VT_NO_WELDS, VT_TICK_ONE, nextVtSeq, vtGenerateError, vtMarks, vtMissingMessage, vtNumber, vtOpenWeldIds, vtWeldIds,
} from '../shared/inspections.ts';
import { groupTracerProposal } from '../shared/weld-dashboard.ts';

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

  /**
   * Creates the repair weld (`010` → `010R1`) when the weld's latest NDT result is not accepted and it has none yet.
   * Only the explicit repair action (and the sample seed) call it: an NA result records the result and nothing more,
   * as in the reference (weld-inspections-009); the user adds `<no>R1` with Add weld.
   */
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

  /**
   * The weld's request of a type, created when it has none. The number is never typed: the next R + five digits after the
   * highest one that exists (a visual inspection keeps the older yearly counter, it is not an NDT request). `onCreate` is
   * written only when the request is created.
   */
  function requestFor(weld: Row, type: string, input: Input = {}, onCreate: Input = {}): Row {
    const existing = currentRequest(store.list('inspection_requests'), weld.id, type);
    if (existing) return Object.keys(input).length ? patch('inspection_requests', existing, input) : existing;
    const number = type === 'VI' ? store.next(REQUEST_PREFIX) : nextRequestNumber(store.list('inspection_requests', true));
    return store.create('inspection_requests', { number, weldId: weld.id, type, date: today(), status: 'Open', ...onCreate, ...input }, actor);
  }
  const processRows = () => store.list('ndt_processes', true);
  const processName = (id: string) => String(processRows().find(row => row.id === id)?.name ?? '');
  /**
   * Takes processes off one request line (one weld on one request): their results are removed (archived), the line keeps
   * its other processes, and a line left with none (or asked to go whole) is archived: the weld leaves the request.
   * Nothing is deleted for good. Returns the line, or undefined when the processes were not on it.
   */
  function undoLine(line: Row, processIds: string[]): Row | undefined {
    const all = requestProcessIds(line, results(), processRows());
    const gone = processIds.length ? all.filter(id => processIds.includes(id)) : all;
    if (processIds.length && !gone.length) return undefined;
    const whole = !processIds.length || gone.length === all.length;
    for (const item of results().filter(row => row.requestId === line.id && (whole || gone.includes(String(row.processId))))) store.archive('inspection_results', item.id, item._version, actor);
    const weld = store.get('welds', line.weldId, true);
    if (whole) {
      store.archive('inspection_requests', line.id, line._version, actor);
      store.audit('welds', weld.id, 'request-undone', `${line.type} request ${line.number} removed from weld ${weld.weldNo}`, actor);
      return line;
    }
    const left = all.filter(id => !gone.includes(id));
    const changed = patch('inspection_requests', store.get('inspection_requests', line.id), { processes: left.map(processName).join(', '), processId: left[0] });
    store.audit('welds', weld.id, 'request-undone', `${gone.map(processName).join(', ')} taken off ${line.type} request ${line.number} of weld ${weld.weldNo}`, actor);
    return settle(changed);
  }

  /** The NA block of one save: written on the save's NA results (one set per weld, reference showNDO). */
  type NaBlock = { naLength: number | null; defectType: string; welderForErrorId: string; reweld: boolean };
  const NO_NA: NaBlock = { naLength: null, defectType: '', welderForErrorId: '', reweld: false };
  /** Writes one round of a weld's NDT: updates the round's result, records a new one, or removes it ("—"). */
  function writeRound(weld: Row, request: Row, type: string, input: RoundInput, fallbackDate: string, block: NaBlock = NO_NA): Row | null {
    const length = weldLengthMm(store, weld);
    const errors = roundErrors(input);
    if (Object.keys(errors).length) throw new AppError(422, `${NDT_ROUNDS.find(round => round.key === input.round)?.label ?? 'Round'}: ${Object.values(errors)[0]}`);
    if (input.processId) store.get('ndt_processes', input.processId);
    const result = str(input.result);
    const existing = store.list('inspection_results').filter(row => row.weldId === weld.id && row.type === type && row.round === input.round && row.requestId === request.id && str(row.result) !== '');
    if (!result) { for (const row of existing) store.archive('inspection_results', row.id, row._version, actor); return null; }
    const na = result === 'Rejected' ? block : NO_NA;
    const data = {
      requestId: request.id, weldId: weld.id, type, round: input.round, result, reportNo: str(input.reportNo), filmNo: str(input.filmNo), processId: str(input.processId),
      date: optionalDate(input.date, 'NDT date') || fallbackDate, examinedLength: length, ...na,
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


  /** Visual (VT) report operations; they run under the "visual-inspection" action so the permission of visual inspection decides. */
  function visualReportOp(data: Input, date: string): { resource: string; record?: Row; records?: Row[] } {
    const op = str(data.op);
    const report = (id: unknown) => { const row = store.get('visual_reports', id); return row; };
    if (op === 'generate') {
      const iso = store.get('isometrics', data.isoId);
      const weldIds = ids(data.weldIds, 'weld');
      const mode = str(data.mode) || 'Go (PDF)'; if (!(VT_MODES as readonly string[]).includes(mode)) throw new AppError(422, 'Choose Digital fill-in or Go (PDF).');
      const problem = vtGenerateError(weldIds, welds(), store.list('visual_reports'), results(), iso.id); if (problem) throw new AppError(422, problem, { weldIds: problem });
      const itp = short(data.itp, 'ITP') || VT_ITPS[0]; if (!VT_ITPS.includes(itp)) throw new AppError(422, 'Choose ITP 1 or ITP 2.');
      const engineerId = short(data.engineerId, 'QAQC Engineer'); if (engineerId) store.get('qa_engineers', engineerId);
      const siteId = str(iso.projectId) ? str(store.get('projects', iso.projectId, true).siteId) : '';
      const seq = nextVtSeq(store.list('visual_reports', true), siteId);
      const created = store.create('visual_reports', { number: vtNumber(seq), seq, siteId, isoId: iso.id, date, mode, weldIds: weldIds.join(','), itp, activityNo: short(data.activityNo, 'Activity No'), engineerId, customNo: short(data.customNo, 'Custom Report No', 80), uploaded: false }, actor);
      store.audit('visual_reports', created.id, 'created', `${created.number} generated for ${weldIds.length} weld${weldIds.length === 1 ? '' : 's'}`, actor);
      return { resource: 'visual_reports', record: created };
    }
    if (op === 'marks') {
      const row = report(data.reportId), wanted = vtWeldIds(row);
      const accepted = optionalIds(data.accepted, 'weld'), notAccepted = optionalIds(data.notAccepted, 'weld');
      if (!accepted.length && !notAccepted.length) throw new AppError(422, VT_TICK_ONE);
      if (accepted.some(id => notAccepted.includes(id))) throw new AppError(422, 'Choose A or NA per weld, not both.');
      if ([...accepted, ...notAccepted].some(id => !wanted.includes(id))) throw new AppError(422, 'A result was chosen for a weld that is not on this report.');
      const inspectionDate = validDate(data.date, 'Inspection date');
      const written: Row[] = [];
      for (const [list, result] of [[accepted, 'Accepted'], [notAccepted, 'Rejected']] as const) for (const id of list) {
        const weld = store.get('welds', id);
        const previous = store.list('inspection_results').find(item => item.weldId === id && item.type === 'VI' && item.reportNo === row.number);
        const request = previous ? store.get('inspection_requests', previous.requestId) : requestFor(weld, 'VI');
        const values = { requestId: request.id, weldId: id, type: 'VI', round: 'Initial', result, reportNo: row.number, date: inspectionDate, examinedLength: weldLengthMm(store, weld), itp: row.itp ?? '', activityNo: row.activityNo ?? '', engineerId: row.engineerId ?? '', customNo: row.customNo ?? '' };
        written.push(previous ? store.update('inspection_results', previous.id, values, previous._version, actor) : store.create('inspection_results', { ...values, note: '' }, actor));
        patch('inspection_requests', store.get('inspection_requests', request.id), { status: result });
        store.audit('welds', id, 'inspected', `VI ${result === 'Rejected' ? 'not accepted' : 'accepted'} · ${row.number}`, actor);
      }
      return { resource: 'inspection_results', records: written };
    }
    if (op === 'upload') {
      const row = report(data.reportId);
      const open = vtOpenWeldIds(row, results());
      if (open.length) throw new AppError(422, vtMissingMessage(open.map(id => String(store.get('welds', id, true).weldNo))));
      const files = store.list('attachments').filter(file => file.entityType === 'visual_reports' && file.entityId === row.id && file.documentType === VT_DOCUMENT);
      if (!files.length) throw new AppError(422, 'Choose at least one PDF file to upload.');
      if (files.some(file => !/\.pdf$/i.test(str(file.name)))) throw new AppError(422, 'VI documents must be PDF files.');
      return { resource: 'visual_reports', record: patch('visual_reports', row, { uploaded: true }) };
    }
    if (op === 'delete') {
      const removed: Row[] = [];
      for (const id of ids(data.reportIds, 'report')) {
        const row = report(id);
        const marked = store.list('inspection_results').filter(item => item.type === 'VI' && item.reportNo === row.number && vtWeldIds(row).includes(String(item.weldId)));
        for (const item of marked) store.archive('inspection_results', item.id, item._version, actor);
        // A visual request that no longer has a result is dropped with them.
        for (const requestId of new Set(marked.map(item => String(item.requestId)))) if (!store.list('inspection_results').some(item => item.requestId === requestId)) { const request = store.get('inspection_requests', requestId, true); if (!request._archived) store.archive('inspection_requests', request.id, request._version, actor); }
        store.archive('visual_reports', row.id, row._version, actor);
        store.audit('visual_reports', row.id, 'deleted', `${row.number} deleted`, actor);
        removed.push(row);
      }
      return { resource: 'visual_reports', records: removed };
    }
    throw new AppError(422, 'This visual report operation is not available.');
  }
  const tracerContext = (): TracerContext => ({ requests: store.list('inspection_requests'), isometrics: store.list('isometrics'), itps: store.list('itps'), weldTypes: store.list('weld_types') });
  /** Links exactly `wanted` as the tracers of `source` (reference rules in `tracerError`); linking sets NDT Req. on the tracer. */
  function linkTracers(source: Row, wanted: string[], options: { pending?: boolean; welderId?: string } = {}): Row[] {
    const all = welds();
    const error = tracerError(source, wanted, all, results(), { ...tracerContext(), pending: options.pending, welderId: options.welderId });
    if (error) throw new AppError(422, error, { tracerIds: error });
    for (const tracer of tracersOf(source, all)) if (!wanted.includes(tracer.id)) patch('welds', tracer, { tracer: false, tracerOfId: '' });
    // A tracer weld is examined: linking sets NDT Req. on it (INFERRED, see PARITY.md).
    return wanted.map(id => patch('welds', store.get('welds', id), { tracer: true, tracerOfId: source.id, ndoReq: true }));
  }
  /** NA block of the input: top-level fields, or (older callers) the values written on an NA round. */
  function naBlock(data: Input, list: RoundInput[]): { naLength?: unknown; defectType?: unknown; welderForErrorId?: unknown; reweld?: unknown } {
    const legacy = list.find(item => item.naLength !== undefined || item.defectType !== undefined || item.reweld !== undefined) || {} as RoundInput;
    const pick = (name: 'naLength' | 'defectType' | 'reweld') => data[name] !== undefined ? data[name] : legacy[name];
    return { naLength: pick('naLength'), defectType: pick('defectType'), welderForErrorId: data.welderForErrorId, reweld: pick('reweld') };
  }

  return {
    ensureRepair,
    /** The tracer proposal of the NDT dialog for a weld (GET /api/tracer-proposal). */
    proposal(query: Input) {
      // The dashboard's Tracer proposal: one welder / WPS / ITP-KNR group of the compliance (welds the request may read).
      if (query.group === true) {
        const welderId = str(query.welderId); store.get('welders', welderId);
        const list = (key: string) => scopeRows(key, store.list(key));
        // The group of the dashboard's main project (`siteId`, only narrowing what the request may read); tracers may sit elsewhere.
        const siteId = str(query.siteId), projects = new Set(list('projects').filter(project => !siteId || project.siteId === siteId).map(project => project.id));
        const isoIds = new Set(list('isometrics').filter(iso => projects.has(String(iso.projectId))).map(iso => iso.id));
        const rows = { welds: list('welds').filter(weld => isoIds.has(String(weld.isoId))), tracerWelds: list('welds'), isometrics: list('isometrics'), projects: list('projects'), weldTypes: list('weld_types'), welders: list('welders'), wps: list('wps'), itps: list('itps'), ndtProcesses: list('ndt_processes'), requests: list('inspection_requests'), results: list('inspection_results') };
        const proposal = groupTracerProposal(rows, { welderId, wpsId: str(query.wpsId), itpId: str(query.itpId) }, { requests: rows.requests, isometrics: rows.isometrics, itps: rows.itps, weldTypes: rows.weldTypes });
        if (!proposal) throw new AppError(404, 'This welder / WPS / ITP-KNR group has no welds.');
        return proposal;
      }
      const weld = store.get('welds', str(query.weldId));
      const welderId = str(query.welderId);
      if (welderId && !weldWelderIds(weld).includes(welderId)) throw new AppError(422, 'Welder for error must be one of the welders of this weld.');
      // Only welds the request may read: of its main project and of projects switched on for the pilot (sec1-004).
      const context = tracerContext();
      const scoped: TracerContext = { requests: scopeRows('inspection_requests', context.requests || []), isometrics: scopeRows('isometrics', context.isometrics || []), itps: scopeRows('itps', context.itps || []), weldTypes: context.weldTypes };
      return tracerProposal(weld, scopeRows('welds', welds()), scopeRows('inspection_results', results()), scoped, { welderId, pending: query.pending === '1' || query.pending === true });
    },
    run(key: string, data: Input): { resource: string; record?: Row; records?: Row[] } {
      const date = data.date ? validDate(data.date) : today();
      if (key === 'ndt-weld') {
        const weld = store.get('welds', data.weldId); const type = ndtType(data.type); const pre = type === 'NDT PRE';
        const existing = currentRequest(store.list('inspection_requests'), weld.id, type);
        // Request number: generated by the request (mass request or first save), never typed (reference: always disabled); a typed number is ignored.
        // NDT location: locked once the weld has a request (reference: disabled, the request's location is kept).
        const storedLocation = str(weld[locationField(pre)]) || str(existing?.locationId);
        let locationId = short(data.locationId, 'NDT location');
        if (existing) { if (data.locationId !== undefined && locationId !== storedLocation) throw new AppError(422, 'The NDT location is locked once the weld has a request.', { locationId: 'Locked by the request.' }); locationId = storedLocation; }
        if (locationId) store.get('ndt_locations', locationId);
        // NDT Pre: the dialog's Welder is required (reference welderPre).
        const welderId = short(data.welderId, 'Welder');
        if (pre && !welderId) throw new AppError(422, 'Choose the welder.', { welderId: 'Choose the welder.' });
        if (!pre && welderId) throw new AppError(422, 'The NDT dialog shows the weld\'s welders; it does not take a welder.');
        if (welderId) store.get('welders', welderId);
        const list = rounds(data.rounds ?? [], false);
        for (const item of list) { const locked = roundLockedError(item); if (locked) throw new AppError(422, `${NDT_ROUNDS.find(round => round.key === item.round)!.label}: ${locked}`); }
        const hasNa = roundsHaveNa(list);
        const block = naBlock(data, list);
        const blockErrors = naBlockErrors({ naLength: block.naLength as string, defectType: block.defectType as string, welderForErrorId: block.welderForErrorId as string, reweld: block.reweld as boolean }, { pre, hasNa, length: weldLengthMm(store, weld), welderIds: weldWelderIds(weld) });
        if (Object.keys(blockErrors).length) throw new AppError(422, Object.values(blockErrors)[0], blockErrors);
        if (block.reweld !== undefined && typeof block.reweld !== 'boolean') throw new AppError(422, 'ReWeld? must be ticked or not.');
        const na: NaBlock = hasNa && !pre ? { naLength: block.naLength === undefined || block.naLength === null || block.naLength === '' ? null : Number(block.naLength), defectType: short(block.defectType, 'Defect type'), welderForErrorId: str(block.welderForErrorId), reweld: block.reweld === true } : NO_NA;
        const tracerIds = data.tracerIds === undefined ? undefined : optionalIds(data.tracerIds, 'tracer weld');
        if (tracerIds && (pre || !hasNa)) throw new AppError(422, 'Tracers are chosen while a result is NA.');
        const processes = Object.fromEntries(list.map(item => [processField(pre, NDT_ROUNDS.find(round => round.key === item.round)!.index), str(item.processId)]));
        const updated = patch('welds', weld, { [locationField(pre)]: locationId, ...processes });
        const initial = list.find(item => item.round === 'Initial');
        const touched = list.some(item => str(item.result)) || existing;
        if (!touched) return { resource: 'welds', record: updated };
        const named = list.map(item => processName(str(item.processId))).filter(Boolean);
        const request = requestFor(updated, type, { locationId, ...(initial ? { processId: str(initial.processId) } : {}), ...(pre ? { welderId } : {}) }, { processes: [...new Set(named)].join(', ') });
        const written = list.map(item => writeRound(updated, request, type, item, date, na)).filter((row): row is Row => Boolean(row));
        settle(request);
        // Tracers picked in the dialog for this weld while its NA is entered are saved with the NA.
        if (tracerIds) linkTracers(store.get('welds', weld.id), tracerIds);
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
          settle(request);
        }
        return { resource: 'inspection_results', records: written };
      }
      if (key === 'mass-inspection-request') {
        // The request is created when its PDF is generated (the dialog's Go): the welds ticked in the table, the open processes ticked in the dialog.
        // Location and PWHT process come from the weld, the date is today, the number is the next R + five digits.
        const type = str(data.type); if (!['NDT PRE', 'NDT', 'PRE-HT', 'PWHT'].includes(type)) throw new AppError(422, 'Choose the request type.');
        const ndt = NDT_TYPES.includes(type), pre = type === 'NDT PRE';
        const selected = ids(data.weldIds, 'weld').map(id => store.get('welds', id));
        for (const weld of selected) if (weld[requestFlag(type)] !== true) throw new AppError(422, `Weld ${weld.weldNo} does not require ${pre ? 'NDT Pre' : type === 'PRE-HT' ? 'Pre-HT' : type}.`);
        const requests = store.list('inspection_requests');
        if (!ndt) { const busy = selected.find(weld => requests.some(row => row.weldId === weld.id && row.type === type && row.status === 'Open')); if (busy) throw new AppError(422, `Weld ${busy.weldNo} already has an open ${type} request.`); }
        const plan = massRequestPlan(type, selected, requests, results(), processRows());
        if (plan.error) throw new AppError(422, plan.error);
        const chosen = optionalIds(data.processIds, 'NDT process');
        if (ndt) {
          if (!chosen.length) throw new AppError(422, MASS_REQUEST_TEXTS.selectProcess, { processIds: MASS_REQUEST_TEXTS.selectProcess });
          for (const id of chosen) { store.get('ndt_processes', id); if (!plan.processIds.includes(id)) throw new AppError(422, 'A chosen NDT process is not open on the selected welds.', { processIds: 'Choose an open process.' }); }
        }
        const note = short(data.note, 'Note', 2000);
        const number = nextRequestNumber(store.list('inspection_requests', true)); const created: Row[] = [];
        for (const line of plan.open) {
          const weld = store.get('welds', line.weldId);
          const mine = line.processIds.filter(id => !ndt || chosen.includes(id)); if (ndt && !mine.length) continue;
          const heat = type === 'PRE-HT' ? ['pwhtPreProcessId', 'pwhtPreLocationId'] : ['pwhtProcessId', 'pwhtLocationId'];
          created.push(store.create('inspection_requests', { number, weldId: weld.id, type, processId: mine[0] ?? '', processes: mine.map(processName).join(', '), locationId: ndt ? str(weld[locationField(pre)]) : '', pwhtProcessId: ndt ? '' : str(weld[heat[0]]), pwhtLocationId: ndt ? '' : str(weld[heat[1]]), date: today(), status: 'Open', note }, actor));
          store.audit('welds', weld.id, 'requested', `${type} request ${number} generated`, actor);
        }
        if (!created.length) throw new AppError(422, MASS_REQUEST_TEXTS.allDone);
        return { resource: 'inspection_requests', records: created };
      }
      if (key === 'ndt-restart') {
        // Restart NDT process (the weld's NDT / NDT Pre dialog): the picked processes leave their request and their results are removed.
        const weld = store.get('welds', data.weldId), type = ndtType(data.type);
        const picked = ids(data.processIds, 'NDT process');
        const touched = store.list('inspection_requests').filter(row => row.weldId === weld.id && row.type === type && row.status !== 'Cancelled').map(line => undoLine(line, picked)).filter((row): row is Row => Boolean(row));
        if (!touched.length) throw new AppError(422, 'The selected NDT process is not on a request of this weld.');
        return { resource: 'inspection_requests', records: touched };
      }
      if (key === 'inspection-request-undo') {
        // Request archive: take a weld (no processes given) or some of its processes off a request; the line stays as removed.
        const type = ndtType(data.type), number = short(data.requestNo, 'Request number', 40); if (!number) throw new AppError(422, 'Choose the request.');
        const weld = store.get('welds', data.weldId, true), picked = optionalIds(data.processIds, 'NDT process');
        const lines = store.list('inspection_requests').filter(row => row.weldId === weld.id && row.type === type && row.number === number && row.status !== 'Cancelled');
        if (!lines.length) throw new AppError(404, 'This weld is not on that request.');
        const touched = lines.map(line => undoLine(line, picked)).filter((row): row is Row => Boolean(row));
        if (!touched.length) throw new AppError(422, 'The selected process is not on this request.');
        return { resource: 'inspection_requests', records: touched };
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
        if (data.op !== undefined) return visualReportOp(data, date);
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
        // One source (weldId + tracerIds), or the NDT dialog's "Save tracers": { sourceId: [tracer ids] } for the group.
        const assignments: [string, string[]][] = data.assignments !== undefined
          ? (() => { const value = data.assignments; if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100) throw new AppError(422, 'Choose the tracers per rejected weld.'); return Object.entries(value as Record<string, unknown>).map(([id, list]) => [id, optionalIds(list, 'tracer weld')] as [string, string[]]); })()
          : [[str(data.weldId), optionalIds(data.tracerIds, 'tracer weld')]];
        if (!assignments.length || assignments.some(([id]) => !id)) throw new AppError(422, 'Choose the rejected weld.');
        const chosen = assignments.flatMap(([, list]) => list);
        if (new Set(chosen).size !== chosen.length) throw new AppError(422, 'A weld can be the tracer of one rejected weld only.');
        // From the dashboard: the group's welder (one of each rejected weld's welders) decides the tracer group.
        const welderId = short(data.welderId, 'Welder');
        if (welderId) for (const [id] of assignments) if (!weldWelderIds(store.get('welds', id)).includes(welderId)) throw new AppError(422, 'The welder must be one of the welders of each rejected weld.');
        const linked = assignments.flatMap(([id, list]) => linkTracers(store.get('welds', id), list, { welderId: welderId || undefined }));
        return { resource: 'welds', records: linked };
      }
      throw new AppError(404, 'This action is not available.');
    },
  };
}
