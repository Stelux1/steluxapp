import { AsyncResource } from 'node:async_hooks';
import { basename } from 'node:path';
import type { Application, Request, RequestHandler } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AppError, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import type { releaseAccess } from './release-access.ts';
import { actorOf, type AuthRequest } from './auth.ts';
import { runAction } from './workflows.ts';
import { keepSiteScope, scopeRows } from './site-scope.ts';
import { canAction, canResource, canScope } from '../shared/permissions.ts';
import { projectInPilot } from '../shared/project-scope.ts';
import { selectableDefectCodes } from '../shared/weld-catalogs.ts';
import { welderStamps } from '../shared/weld-entry.ts';
import { NDT_DOCUMENT, NDT_TYPES, currentRequest, inspectionFileError, locationField, repairsOf } from '../shared/inspections.ts';
import {
  NDT_BATCH_AREA, NDT_BATCH_COLUMNS, NDT_BATCH_MAX_ROWS, NDT_BATCH_TEXTS, batchDoneMessage, batchLookup, batchRequestNumber, batchRowInput, batchStates, batchSummary, ndtBatchRows,
  requestBatch, requestIsoErrors, requestTestInput, weldRoundOf, type NdtBatchContext, type NdtBatchRequestTest, type NdtBatchRow, type NdtBatchValues, type NdtWeldInput,
} from '../shared/ndt-batch.ts';
import type { PermissionVerb, Row } from '../shared/types.ts';

/**
 * NDT Batch Import (Weld Pilot → Welding data): template, preview, Lookup and commit of a results file, and the
 * request-number tab. Every result is written by the NDT cell's own action (`ndt-weld` through `runAction`), so the
 * rules of a result entered by hand apply to each row: the NA block, the column lock, the request, the phase lock
 * (423) and the account's NDT right. The preview is a dry run of those writes in a savepoint that is rolled back; a
 * commit writes all of its rows in one transaction, or none. Only welds of the open main project are ever matched.
 */
type Documents = ReturnType<typeof documentStorage>;
interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess> }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const refused = () => new AppError(403, 'Your permission profile does not allow this action.');

export function registerNdtBatchRoutes(app: Application, { store, documents, access }: Dependencies) {
  const user = (req: Request) => (req as unknown as AuthRequest).user;
  const memory = keepSiteScope(multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }));
  const many = documents.uploadMany.any();
  const pdfs: RequestHandler = (req, res, next) => many(req, res, AsyncResource.bind(next));

  /**
   * The page's own right (area 121: Show opens it, Import uploads and commits) inside Weld Pilot, the records it reads,
   * and for a write the NDT right of the type (NDT 76 / NDT Pre 94 Add), exactly as the NDT cell needs it.
   */
  function allow(req: Request, verb: Extract<PermissionVerb, 'show' | 'import'>, type?: string) {
    access.resource('inspection_results');
    const account = user(req);
    if (account.pilot !== 'weld' || !account.availability?.features.includes('inspections')) throw refused();
    if (!canScope(account, NDT_BATCH_AREA, verb) || !canResource(account, 'welds') || !canResource(account, 'inspection_results') || !canResource(account, 'inspection_requests')) throw refused();
    if (type !== undefined && !canAction(account, 'ndt-weld', { type })) throw refused();
  }
  /** The open main project of the request (the session's, or a limited account's own). */
  function openSite(req: Request): Row {
    const siteId = user(req).siteId;
    if (!siteId) throw new AppError(422, NDT_BATCH_TEXTS.chooseSite);
    return store.get('sites', siteId);
  }
  /** Records of the open main project only (and of projects shown in Weld Pilot): a weld of another main project is never matched. */
  function context(site: Row): NdtBatchContext & { requests: Row[]; results: Row[] } {
    const projects = scopeRows('projects', store.list('projects')).filter(project => project.siteId === site.id && projectInPilot(project, 'weld'));
    const projectIds = new Set(projects.map(project => project.id));
    const isometrics = scopeRows('isometrics', store.list('isometrics')).filter(iso => projectIds.has(String(iso.projectId)));
    const isoIds = new Set(isometrics.map(iso => iso.id));
    const welds = scopeRows('welds', store.list('welds')).filter(weld => isoIds.has(String(weld.isoId)));
    const defectCodes = selectableDefectCodes({ ndt_defect_codes: store.list('ndt_defect_codes'), catalog_sites: store.list('catalog_sites') }, site, site.id);
    return { projects, isometrics, welds, processes: store.list('ndt_processes', true), welders: store.list('welders', true), diameters: store.list('diameters', true), defectCodes, requests: store.list('inspection_requests'), results: store.list('inspection_results') };
  }
  /** One result through the NDT cell's action; the NDT location stays the weld's (or its request's) own. */
  function write(input: NdtWeldInput, req: Request) {
    const weld = store.get('welds', input.weldId), pre = input.type === 'NDT PRE';
    const existing = currentRequest(store.list('inspection_requests'), weld.id, input.type);
    const locationId = text(weld[locationField(pre)]) || text(existing?.locationId);
    return runAction(store, 'ndt-weld', { ...input, locationId }, actorOf(req), { inspectionRules: true, hosted: true });
  }
  const message = (error: unknown) => { const failure = store.translate(error); if (failure instanceof AppError) return failure; throw failure; };
  /** Repair welds of the NA welds that already exist (`<no>R1` added by hand): the success message opens them. */
  function repairsFor(weldIds: string[]) {
    const all = store.list('welds');
    return [...new Set(weldIds)].flatMap(id => { const weld = all.find(row => row.id === id); const repair = weld ? repairsOf(weld, all)[0] : undefined; return weld && repair ? [{ weldId: weld.id, weldNo: String(weld.weldNo ?? ''), repairId: repair.id, repairNo: String(repair.weldNo ?? ''), isoId: String(repair.isoId ?? '') }] : []; });
  }

  // ----- Via file --------------------------------------------------------------------------------------------------
  const sent = (value: unknown): { rowNo: number; values: NdtBatchValues; weldId?: string }[] => {
    if (!Array.isArray(value) || !value.length || value.length > NDT_BATCH_MAX_ROWS) throw new AppError(422, 'Upload the file again and check the preview.');
    const fields = NDT_BATCH_COLUMNS.map(column => column.field) as string[];
    return value.map((row: Record<string, unknown>, index) => {
      const values = row && typeof row.values === 'object' && row.values && !Array.isArray(row.values) ? row.values as Record<string, unknown> : null;
      if (!values || Object.entries(values).some(([name, item]) => !fields.includes(name) || typeof item !== 'string' || item.length > 200)) throw new AppError(422, 'Upload the file again and check the preview.');
      if (row.weldId !== undefined && row.weldId !== '' && typeof row.weldId !== 'string') throw new AppError(422, 'Choose the weld again with Lookup.');
      return { rowNo: Number.isSafeInteger(row.rowNo) ? Number(row.rowNo) : index + 2, values: values as NdtBatchValues, ...(typeof row.weldId === 'string' && row.weldId ? { weldId: row.weldId } : {}) };
    });
  };
  /**
   * The rows' states, then each ready row written in its own savepoint so one refusal (a lock, a rule of the NDT cell)
   * marks only that row. A preview rolls everything back; a commit keeps it only when every ready row was written.
   */
  function evaluate(req: Request, input: { rowNo: number; values: NdtBatchValues; weldId?: string }[], commit: false | number[]) {
    const site = openSite(req), ctx = context(site);
    const rows: NdtBatchRow[] = batchStates(input, ctx);
    // A commit writes the rows the preview showed as Ready (`commit`) and nothing else; each of them is written, or none.
    if (commit) for (const row of rows) if (row.state === 'ready' && !commit.includes(row.rowNo)) Object.assign(row, { state: 'error', errors: ['Check the file again before this row is saved.'] });
    if (commit) for (const rowNo of commit) {
      const row = rows.find(item => item.rowNo === rowNo);
      if (!row) throw new AppError(422, 'Upload the file again and check the preview.');
      if (row.state !== 'ready') throw new AppError(422, `Row ${rowNo}: ${row.errors[0] ?? 'It cannot be saved.'} Nothing was saved.`);
    }
    return store.transaction(() => {
      store.db.exec('SAVEPOINT ndt_batch');
      let keep = false;
      try {
        const failed: NdtBatchRow[] = [];
        for (const row of rows) {
          if (row.state !== 'ready') continue;
          store.db.exec('SAVEPOINT ndt_batch_row');
          try { write(batchRowInput(row, ctx), req); store.db.exec('RELEASE ndt_batch_row'); }
          catch (error) { store.db.exec('ROLLBACK TO ndt_batch_row; RELEASE ndt_batch_row'); const failure = message(error); Object.assign(row, { state: 'error', errors: [failure.message] }); failed.push(row); }
        }
        const summary = batchSummary(rows);
        if (!commit) return { rows, summary };
        if (failed.length) throw new AppError(422, `Row ${failed[0].rowNo}: ${failed[0].errors[0]} Nothing was saved.`);
        if (!summary.ready) throw new AppError(422, NDT_BATCH_TEXTS.nothing);
        store.audit('sites', site.id, 'ndt-batch-import', `NDT Batch Import via file: ${summary.accepted} A, ${summary.rejected} NA`, actorOf(req));
        keep = true;
        const naWelds = rows.filter(row => row.state === 'ready' && row.result === 'Rejected').map(row => row.weldId);
        return { rows, summary, accepted: summary.accepted, rejected: summary.rejected, message: batchDoneMessage(summary.accepted, summary.rejected), skipped: summary.unmatched + summary.error, repairs: repairsFor(naWelds) };
      } finally { store.db.exec(keep ? 'RELEASE ndt_batch' : 'ROLLBACK TO ndt_batch; RELEASE ndt_batch'); }
    });
  }
  async function readFile(file: Express.Multer.File): Promise<unknown[][]> {
    const name = basename(file.originalname);
    if (/\.csv$/i.test(name)) {
      try { return parse(file.buffer, { bom: true, skip_empty_lines: true, trim: true, relax_column_count: true, delimiter: [',', ';', '\t'], max_record_size: 100_000 }) as unknown[][]; }
      catch { throw new AppError(422, 'This CSV file could not be read. Use the template and keep its headings.'); }
    }
    if (!/\.xlsx$/i.test(name)) throw new AppError(422, 'Choose a CSV or Excel file (.csv or .xlsx).');
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer); } catch { throw new AppError(422, 'This Excel file could not be read. Use the template and save it as .xlsx.'); }
    const sheet = workbook.worksheets[0]; if (!sheet) throw new AppError(422, 'The Excel file has no sheet.');
    const table: unknown[][] = [];
    for (let rowNo = 1; rowNo <= Math.min(sheet.rowCount, NDT_BATCH_MAX_ROWS + 2); rowNo++) {
      const line: unknown[] = []; const row = sheet.getRow(rowNo);
      for (let column = 1; column <= sheet.columnCount; column++) { const cell = row.getCell(column); line.push(cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text); }
      table.push(line);
    }
    return table;
  }

  app.get('/api/ndt-batch/template', async (req, res) => {
    allow(req, 'import');
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('NDT results');
    sheet.columns = NDT_BATCH_COLUMNS.map(column => ({ header: column.header, key: column.field, width: Math.max(12, column.header.length + 6) }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment('blitzkrieg-ndt-batch-import-template.xlsx'); await workbook.xlsx.write(res); res.end();
  });
  app.post('/api/ndt-batch/preview', memory.single('file'), async (req, res) => {
    allow(req, 'import', 'NDT');
    if (!req.file) throw new AppError(422, 'Choose a CSV or Excel file.');
    const parsed = ndtBatchRows(await readFile(req.file));
    if (parsed.error) throw new AppError(422, parsed.error);
    res.json(evaluate(req, parsed.rows, false));
  });
  // The preview again after Lookup chose a weld (nothing is saved).
  app.post('/api/ndt-batch/check', (req, res) => { allow(req, 'import', 'NDT'); res.json(evaluate(req, sent(req.body?.rows), false)); });
  app.get('/api/ndt-batch/welds', (req, res) => {
    allow(req, 'import', 'NDT');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ welds: batchLookup(typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '', context(openSite(req))) });
  });
  app.post('/api/ndt-batch/commit', (req, res) => {
    allow(req, 'import', 'NDT');
    const ready = req.body?.ready;
    if (!Array.isArray(ready) || ready.length > NDT_BATCH_MAX_ROWS || ready.some(rowNo => !Number.isSafeInteger(rowNo))) throw new AppError(422, 'Upload the file again and check the preview.');
    res.status(201).json(evaluate(req, sent(req.body?.rows), [...new Set(ready as number[])]));
  });

  // ----- Via request number ---------------------------------------------------------------------------------------
  const requestType = (value: unknown) => { const type = text(value); if (!NDT_TYPES.includes(type)) throw new AppError(422, 'Choose NDT-Pre or NDT.'); return type as 'NDT' | 'NDT PRE'; };
  const requestNo = (value: unknown) => { const number = batchRequestNumber(typeof value === 'string' ? value.slice(0, 40) : ''); if (!number) throw new AppError(422, 'Enter the NDT Request No.', { number: 'Enter the NDT Request No.' }); return number; };
  app.get('/api/ndt-batch/request', (req, res) => {
    allow(req, 'show');
    const type = requestType(req.query.type), number = requestNo(req.query.number);
    const ctx = context(openSite(req));
    const isos = requestBatch(number, type, ctx);
    const welderIds = new Set(isos.flatMap(iso => iso.welds.flatMap(weld => weld.welderIds)));
    const welders = ctx.welders.filter(row => welderIds.has(row.id)).map(row => ({ id: row.id, ...welderStamps([row])[0] }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ type, number, isos, welders, defectCodes: ctx.defectCodes.map(code => ({ code: String(code.code), english: String(code.english ?? '') })) });
  });
  app.post('/api/ndt-batch/request/commit', pdfs, (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(typeof req.body?.payload === 'string' ? req.body.payload : 'null') ?? {}; } catch { throw new AppError(422, 'Search the welds again and commit.'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppError(422, 'Search the welds again and commit.');
      const type = requestType(payload.type);
      allow(req, 'import', type);
      const number = requestNo(payload.number);
      const site = openSite(req), ctx = context(site);
      const groups = requestBatch(number, type, ctx);
      const sentIsos = Array.isArray(payload.isos) ? payload.isos as Record<string, unknown>[] : [];
      if (sentIsos.length > 500 || sentIsos.some(iso => !iso || typeof iso !== 'object' || typeof iso.isoId !== 'string' || !Array.isArray(iso.tests) || iso.tests.length > 1000)) throw new AppError(422, 'Search the welds again and commit.');
      const isos = sentIsos.filter(iso => (iso.tests as unknown[]).length).map(iso => {
        const group = groups.find(item => item.isoId === iso.isoId); if (!group) throw new AppError(422, 'A selected isometric is not on this request.');
        const tests = (iso.tests as Record<string, unknown>[]).map(test => {
          if (!test || typeof test !== 'object' || ['weldId', 'processId', 'result'].some(name => typeof test[name] !== 'string') || ['date', 'naLength', 'defectType', 'welderId'].some(name => test[name] !== undefined && (typeof test[name] !== 'string' || String(test[name]).length > 200)) || (test.reweld !== undefined && typeof test.reweld !== 'boolean')) throw new AppError(422, 'Search the welds again and commit.');
          const line = group.welds.find(weld => weld.weldId === test.weldId);
          if (!line || !line.tests.some(item => item.processId === test.processId)) throw new AppError(422, 'A selected test is not on this request.');
          if (line.superseded) throw new AppError(422, `Weld ${line.weldNo} has a later ${type === 'NDT PRE' ? 'NDT-Pre' : 'NDT'} request; enter its results there.`);
          return test as unknown as NdtBatchRequestTest;
        });
        const reportNo = text(iso.reportNo).slice(0, 80);
        const problems = requestIsoErrors({ reportNo, tests }, group.isoNo); if (problems.length) throw new AppError(422, problems[0]);
        const file = files.find(item => item.fieldname === `pdf-${group.isoId}`);
        if (file) { const problem = inspectionFileError(NDT_DOCUMENT, basename(file.originalname)); if (problem) throw new AppError(422, `ISO ${group.isoNo}: ${problem}`); }
        return { group, reportNo, tests, file };
      });
      if (!isos.length) throw new AppError(422, 'Select at least one test to import.');
      if (files.some(file => !isos.some(iso => iso.file === file))) throw new AppError(422, 'Upload the PDF on an isometric with selected tests.');
      const actor = actorOf(req); let accepted = 0, rejected = 0; const naWelds: string[] = [];
      const documentsSaved = store.transaction(() => {
        const saved: Row[] = [];
        for (const iso of isos) {
          let first: Row | undefined;
          for (const test of iso.tests) {
            const weld = store.get('welds', test.weldId);
            if (!weldRoundOf(weld, test.processId, type === 'NDT PRE')) throw new AppError(422, `Weld ${String(weld.weldNo)} has no NDT process ${String(ctx.processes.find(item => item.id === test.processId)?.name ?? '')}.`);
            let done;
            try { done = write(requestTestInput(test, weld, type, iso.reportNo), req); }
            catch (error) { const failure = message(error); throw new AppError(failure.status, `ISO ${iso.group.isoNo}, weld ${String(weld.weldNo)}: ${failure.message} Nothing was saved.`, failure.fields); }
            first ??= done.records?.[0];
            if (test.result === 'Accepted') accepted++; else { rejected++; naWelds.push(weld.id); }
          }
          if (iso.file && first) {
            if (!canResource(user(req), 'inspection_results', 'import', first)) throw refused();
            const record = store.create('attachments', { name: basename(iso.file.originalname).replace(/[\r\n]/g, ''), entityType: 'inspection_results', entityId: first.id, documentType: NDT_DOCUMENT, mime: iso.file.mimetype, size: iso.file.size, note: '' }, actor);
            documents.save(record.id, iso.file); saved.push(record);
          }
        }
        store.audit('sites', site.id, 'ndt-batch-import', `NDT Batch Import of request ${number}: ${accepted} A, ${rejected} NA`, actor);
        return saved;
      });
      res.status(201).json({ accepted, rejected, message: batchDoneMessage(accepted, rejected), documents: documentsSaved.length, repairs: repairsFor(naWelds) });
    } catch (error) { files.forEach(file => documents.discard(file)); throw error; }
  });
}
