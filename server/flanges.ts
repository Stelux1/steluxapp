import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import type { Application, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { AppError, type Actor, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import type { releaseAccess } from './release-access.ts';
import { actorOf, checkResourcePermission, type AuthRequest } from './auth.ts';
import { assertSignatureImage } from './signatures.ts';
import { savedSignatureOf } from './punch.ts';
import { companyForDocuments } from './pdf/company.ts';
import { flangeProtocolPdf, type FlangeProtocolSignature } from './pdf/flange-record.ts';
import { canScope } from '../shared/permissions.ts';
import {
  FLANGE_GENERAL_DOCUMENT, FLANGE_HARDCOPY_DOCUMENT, FLANGE_LIST_COLUMNS, FLANGE_PROTOCOL_DOCUMENT, FLANGE_SIGNATURE_DOCUMENT, FLANGE_PREPARATION_CONTROLS, FLANGE_ASSEMBLY_CHECKLIST, RECORD_INPUT_FIELDS, SIGNATURE_ROLES,
  boltInputErrors, deviationInputErrors, flangeDocumentDeleteRefusal, flangeItems, flangeNumber, flangeTargets, gateOpen, gateRefusal, hardcopyInputErrors, labelInputErrors, latestRecord, leakTestInputErrors,
  openDeviations, passInputErrors, passWithinTolerance, recordInputErrors, recordPdfHashMatches, recordSignatures, registeredPdf, releaseGate, workflowInputErrors, type SignatureRole,
} from '../shared/flanges.ts';
import type { Row } from '../shared/types.ts';

type Input = Record<string, unknown>;
type Documents = ReturnType<typeof documentStorage>;
interface Dependencies { store: Store; documents: Documents; access: ReturnType<typeof releaseAccess>; upload: Documents['upload'] }
const str = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
const checked = (value: unknown) => value === true || value === 'true' || value === '1' || value === 'on';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const refuse = (errors: Record<string, string>) => { if (Object.keys(errors).length) throw new AppError(422, Object.values(errors)[0], errors); };
/** The Flanges commit right (reference "QC release requires the Flanges commit right"): the Import box of the Flanges area. */
export const FLANGE_COMMIT: [area: string, verb: 'import'] = ['100', 'import'];

/** Rows of one flange's record types, as the rules read them. */
export function flangeRows(store: Store, flangeId: string) {
  const of = (key: string) => store.list(key).filter(row => row.flangeId === flangeId);
  return {
    flange_records: of('flange_records'), flange_passes: of('flange_passes'), flange_bolts: of('flange_bolts'), flange_leak_tests: of('flange_leak_tests'), flange_labels: of('flange_labels'),
    flange_deviations: of('flange_deviations'), flange_signatures: of('flange_signatures'), flange_events: of('flange_events'),
    attachments: store.list('attachments').filter(file => file.entityType === 'flanges' && file.entityId === flangeId),
  };
}
/** The registered PDF of the latest record and whether its stored bytes still match the stored SHA-256. */
export function registeredPdfState(store: Store, documents: Documents, flangeId: string): { file?: Row; intact: boolean } {
  const rows = flangeRows(store, flangeId), record = latestRecord(rows.flange_records, flangeId), file = registeredPdf(rows.attachments, flangeId, record?.id);
  if (!file) return { intact: true };
  const bytes = documents.read(file.id);
  return { file, intact: Boolean(bytes) && recordPdfHashMatches(file.sha256, sha256(bytes!)) };
}
/**
 * The release gate as the server decides it, with the hash check of the registered PDF. Release judges what was signed
 * (sec2-005): once the protocol PDF of the latest record is registered, only evidence that existed when it was generated
 * counts, so a row written later (before the sign-off rule below existed) can neither open nor close the gate.
 */
export function serverGate(store: Store, documents: Documents, flangeId: string) {
  const rows = flangeRows(store, flangeId), state = registeredPdfState(store, documents, flangeId);
  const cut = state.file ? String(state.file._createdAt) : '';
  const signed = (list: Row[]) => cut ? list.filter(row => String(row._createdAt) <= cut) : list;
  const judged = { ...rows, flange_passes: signed(rows.flange_passes), flange_bolts: signed(rows.flange_bolts), flange_leak_tests: signed(rows.flange_leak_tests), flange_labels: signed(rows.flange_labels), flange_deviations: signed(rows.flange_deviations) };
  return releaseGate(judged, flangeId, state.intact);
}
/**
 * The evidence of a flange record (passes, bolts, leak tests, labels, deviations) is closed once QA/QC has signed the
 * latest record (sec2-005): new evidence needs a new record, which needs new signatures.
 */
export const SIGNED_RECORD_REFUSED = 'This record is signed by QA/QC. Its passes, bolts, leak tests, labels and deviations can no longer be added to.';
export function assertRecordOpen(store: Store, flangeId: string) {
  const rows = flangeRows(store, flangeId), latest = latestRecord(rows.flange_records, flangeId);
  if (latest && recordSignatures(rows.flange_signatures, latest.id)['QA/QC']) throw new AppError(422, SIGNED_RECORD_REFUSED);
}

/** Save record: a new assembly record row from the form; refused once QA/QC has signed the latest record. */
export function saveRecord(store: Store, flange: Row, data: Input, actor: Actor): Row {
  const rows = flangeRows(store, flange.id), latest = latestRecord(rows.flange_records, flange.id);
  if (latest && recordSignatures(rows.flange_signatures, latest.id)['QA/QC']) throw new AppError(422, 'This record is signed by QA/QC and can no longer be changed.');
  const values: Input = { flangeId: flange.id };
  const booleans = new Set([...FLANGE_PREPARATION_CONTROLS.map(([key]) => `check_${key}`), ...FLANGE_ASSEMBLY_CHECKLIST.map(([key]) => `checklist_${key}`), 'lmra_confirmed']);
  for (const name of RECORD_INPUT_FIELDS) values[name] = booleans.has(name) ? checked(data[name]) : str(data[name]);
  refuse(recordInputErrors(values));
  return store.create('flange_records', values, actor);
}
/** Record pass: validated against the master targets (±5%) and kept with its result, also when it is out of tolerance. */
export function recordPass(store: Store, flange: Row, data: Input, actor: Actor): Row {
  assertRecordOpen(store, flange.id);
  refuse(passInputErrors(data, flange));
  const rows = flangeRows(store, flange.id), targets = flangeTargets(flange);
  const measurement = { torque_nm: flangeNumber(data.torque_nm), stress_value: flangeNumber(data.stress_value) };
  return store.create('flange_passes', {
    flangeId: flange.id, recordId: latestRecord(rows.flange_records, flange.id)?.id ?? '', pass_number: flangeNumber(data.pass_number), ...measurement,
    tool_id: str(data.tool_id), operator_name: str(data.operator_name), performed_at: str(data.performed_at), target_nm: targets.torque, target_stress: targets.stress,
    result: passWithinTolerance(measurement, flange) ? 'OK' : 'NOK',
  }, actor);
}
/** Record bolt: a measurement of a recorded pass; a failed one needs and opens (or links) its deviation. */
export function recordBolt(store: Store, flange: Row, data: Input, actor: Actor): Row {
  assertRecordOpen(store, flange.id);
  const rows = flangeRows(store, flange.id);
  refuse(boltInputErrors(data, flange, rows.flange_passes));
  const measurement = { torque_nm: flangeNumber(data.torque_nm), stress_value: flangeNumber(data.stress_value) };
  const ok = passWithinTolerance(measurement, flange), reference = ok ? '' : str(data.deviation_reference);
  const bolt = store.create('flange_bolts', { flangeId: flange.id, passId: str(data.passId), bolt_no: flangeNumber(data.bolt_no), ...measurement, result: ok ? 'OK' : 'NOK', deviation_reference: reference, deviation_reason: ok ? '' : str(data.deviation_reason) }, actor);
  if (!ok && !openDeviations(rows.flange_deviations, flange.id).includes(reference)) store.create('flange_deviations', { flangeId: flange.id, reference, reason: str(data.deviation_reason), event: 'Opened', boltId: bolt.id }, actor);
  return bolt;
}
export function recordLeakTest(store: Store, flange: Row, data: Input, actor: Actor): Row {
  assertRecordOpen(store, flange.id);
  const values = { test_type: str(data.test_type), pressure_value: str(data.pressure_value), pressure_unit: str(data.pressure_unit), result: str(data.result) || 'Passed', tested_at: str(data.tested_at) };
  refuse(leakTestInputErrors(values));
  return store.create('flange_leak_tests', { flangeId: flange.id, ...values }, actor);
}
export function registerLabel(store: Store, flange: Row, data: Input, actor: Actor): Row {
  assertRecordOpen(store, flange.id);
  const values = { label_number: str(data.label_number), qr_token: str(data.qr_token), scan_reference: str(data.scan_reference) };
  refuse(labelInputErrors(values));
  if (store.list('flange_labels').some(row => row.qr_token === values.qr_token)) throw new AppError(409, 'This QR token is already registered.', { qr_token: 'This QR token is already registered.' });
  return store.create('flange_labels', { flangeId: flange.id, ...values }, actor);
}
/** Open deviation / Record restoration: a restoration needs an open deviation with the same reference. */
export function recordDeviation(store: Store, flange: Row, data: Input, actor: Actor): Row {
  assertRecordOpen(store, flange.id);
  const values = { reference: str(data.reference), reason: str(data.reason) };
  refuse(deviationInputErrors(values));
  const restore = data.event === 'Restored', open = openDeviations(flangeRows(store, flange.id).flange_deviations, flange.id).includes(values.reference);
  if (restore && !open) throw new AppError(422, `No open deviation has the reference ${values.reference}.`, { reference: 'Enter the reference of an open deviation.' });
  if (!restore && open) throw new AppError(422, `Deviation ${values.reference} is already open.`, { reference: 'This deviation is already open.' });
  return store.create('flange_deviations', { flangeId: flange.id, ...values, event: restore ? 'Restored' : 'Opened' }, actor);
}
/** Workflow action: Assembled / Rejected (with a reason); Released needs the commit right and an open gate. */
export function recordWorkflow(store: Store, documents: Documents, flange: Row, data: Input, actor: Actor, mayRelease: boolean): Row {
  const values = { to_status: str(data.to_status), reason: str(data.reason) };
  refuse(workflowInputErrors(values));
  if (values.to_status === 'Released') {
    if (!mayRelease) throw new AppError(403, 'QC release requires the Flanges commit right.');
    const gate = serverGate(store, documents, flange.id);
    if (!gateOpen(gate)) throw new AppError(422, gateRefusal(gate));
  }
  return store.create('flange_events', { flangeId: flange.id, ...values }, actor);
}

/** First bytes of an uploaded file, from memory (database storage) or from its temporary file (disk storage). */
function head(file: Express.Multer.File, length = 12): Uint8Array {
  if (file.buffer) return file.buffer.subarray(0, length);
  const fd = openSync(file.path, 'r');
  try { const bytes = Buffer.alloc(length); const read = readSync(fd, bytes, 0, length, 0); return bytes.subarray(0, read); }
  finally { closeSync(fd); }
}
/** A signed hard copy is a PDF, JPEG, PNG or WebP whose name, declared type and first bytes agree. */
export function assertHardcopyFile(file: Express.Multer.File) {
  const name = basename(file.originalname), bytes = Buffer.from(head(file)), latin = bytes.toString('latin1');
  const kind = /\.pdf$/i.test(name) ? latin.startsWith('%PDF-') && file.mimetype === 'application/pdf'
    : /\.jpe?g$/i.test(name) ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && file.mimetype === 'image/jpeg'
    : /\.png$/i.test(name) ? latin.startsWith('\x89PNG') && file.mimetype === 'image/png'
    : /\.webp$/i.test(name) ? latin.startsWith('RIFF') && latin.slice(8, 12) === 'WEBP' && file.mimetype === 'image/webp' : false;
  if (!kind) throw new AppError(422, 'Choose a PDF, JPEG, PNG or WebP file.', { hard_copy_file: 'Choose a PDF, JPEG, PNG or WebP file.' });
}
/** The generic upload adds general attachments to a flange only; protocol PDFs, signatures and hard copies have their own actions. */
export function assertFlangeFileAllowed(documentType: unknown) {
  const kind = str(documentType);
  if (kind && kind !== FLANGE_GENERAL_DOCUMENT && kind !== 'Attachment') throw new AppError(422, 'Add general attachments here. The protocol PDF, signatures and signed hard copies are added from the flange page and the Documents dialog.');
}

/**
 * Routes of the flange detail page and its Documents dialog (pilots profile). Every route reads the flange through the
 * access layer first (availability and access per project site), then checks the right: Flanges Edit to record; QA/QC
 * sign-off and release also need the Flanges commit right (its Import box). Every write is a new row in one transaction;
 * the flange master record is never written.
 */
export function registerFlangeRoutes(app: Application, { store, documents, access, upload }: Dependencies) {
  const user = (req: Request) => (req as unknown as AuthRequest).user;
  const flangeFor = (req: Request, verb: 'show' | 'edit' = 'edit') => { const flange = access.record('flanges', String(req.params.id)); checkResourcePermission(req, 'flanges', verb, flange); return flange; };
  const commit = (req: Request) => canScope(user(req), ...FLANGE_COMMIT);
  const json = (handler: (store: Store, flange: Row, data: Input, actor: Actor) => Row, resource: string) => (req: Request, res: Response) => {
    const flange = flangeFor(req);
    const record = store.transaction(() => handler(store, flange, (req.body || {}) as Input, actorOf(req)));
    res.status(201).json({ resource, record: access.project(resource, record) });
  };
  app.post('/api/flanges/:id/record', json(saveRecord, 'flange_records'));
  app.post('/api/flanges/:id/passes', json(recordPass, 'flange_passes'));
  app.post('/api/flanges/:id/bolts', json(recordBolt, 'flange_bolts'));
  app.post('/api/flanges/:id/leak-tests', json(recordLeakTest, 'flange_leak_tests'));
  app.post('/api/flanges/:id/labels', json(registerLabel, 'flange_labels'));
  app.post('/api/flanges/:id/deviations', json(recordDeviation, 'flange_deviations'));
  app.post('/api/flanges/:id/workflow', (req, res) => {
    const flange = flangeFor(req);
    const record = store.transaction(() => recordWorkflow(store, documents, flange, (req.body || {}) as Input, actorOf(req), commit(req)));
    res.status(201).json({ resource: 'flange_events', record: access.project('flange_events', record) });
  });

  /** Sign as technician / QC sign-off: the statement, then the saved signature or a drawn one, copied as an immutable snapshot. */
  app.post('/api/flanges/:id/signatures', upload.single('file'), (req, res) => {
    try {
      const flange = flangeFor(req), body = (req.body || {}) as Input, role = str(body.role) as SignatureRole, actor = actorOf(req);
      if (!(SIGNATURE_ROLES as readonly string[]).includes(role)) throw new AppError(422, 'Choose the technician or the QA/QC signature.');
      if (role === 'QA/QC' && !commit(req)) throw new AppError(403, 'QA/QC sign-off requires the Flanges commit right.');
      if (!checked(body.statement)) throw new AppError(422, 'Confirmation is required.', { statement: 'Confirmation is required.' });
      const rows = flangeRows(store, flange.id), record = latestRecord(rows.flange_records, flange.id);
      if (!record) throw new AppError(422, 'Save the record before signing it.');
      const signed = recordSignatures(rows.flange_signatures, record.id);
      if (signed[role]) throw new AppError(422, role === 'QA/QC' ? 'QA/QC has already signed this record.' : 'The technician has already signed this record.');
      if (role === 'QA/QC' && !signed.Technician) throw new AppError(422, 'The technician signs the record first.');
      const drawn = str(body.method) === 'Drawn signature';
      // The saved signature is copied, so a later new signature image never changes this one.
      let copy: { bytes: Uint8Array; name: string; mime: string } | null = null;
      if (drawn) {
        if (!req.file) throw new AppError(422, 'Draw your signature first.');
        assertSignatureImage(req.file);
      } else {
        const saved = savedSignatureOf(store, user(req).id), content = saved ? documents.read(saved.id) : null;
        if (!saved || !content) throw new AppError(422, 'You have no saved signature. Save one on the Signatures page, or choose Draw signature now.');
        copy = { bytes: content, name: str(saved.name) || 'signature.png', mime: str(saved.mime) || 'image/png' };
      }
      const qcNote = role === 'QA/QC' ? str(body.qc_note) : '';
      if (qcNote.length > 2000) throw new AppError(422, 'QC note can be at most 2000 characters.', { qc_note: 'At most 2000 characters.' });
      const statement = role === 'QA/QC' ? 'I confirm this protocol as QA/QC or customer QA/QC.' : 'I confirm that I performed and verified this assembly record.';
      const result = store.transaction(() => {
        const file = store.create('attachments', { name: copy ? copy.name : 'signature.png', entityType: 'flanges', entityId: flange.id, documentType: FLANGE_SIGNATURE_DOCUMENT, mime: copy ? copy.mime : req.file!.mimetype, size: copy ? copy.bytes.length : req.file!.size, note: `${role} signature` }, actor);
        if (copy) documents.saveBytes(file.id, copy.bytes); else documents.save(file.id, req.file!);
        return store.create('flange_signatures', { flangeId: flange.id, recordId: record.id, role, method: drawn ? 'Drawn signature' : 'Saved signature', userId: user(req).id, signer_name: actor.name, statement, qc_note: qcNote, attachmentId: file.id }, actor);
      });
      res.status(201).json({ resource: 'flange_signatures', record: access.project('flange_signatures', result) });
    } catch (error) { documents.discard(req.file); throw error; }
  });

  /** Signed hard-copy evidence (Documents): stored with its role, signer, date and reference; it is no release evidence until QA/QC validates it. */
  app.post('/api/flanges/:id/hardcopy', upload.single('hard_copy_file'), (req, res) => {
    try {
      const flange = flangeFor(req), body = (req.body || {}) as Input, actor = actorOf(req);
      refuse(hardcopyInputErrors(body, req.file?.originalname));
      assertHardcopyFile(req.file!);
      const record = latestRecord(flangeRows(store, flange.id).flange_records, flange.id);
      const result = store.transaction(() => {
        const file = store.create('attachments', { name: basename(req.file!.originalname).replace(/[\r\n]/g, ''), entityType: 'flanges', entityId: flange.id, documentType: FLANGE_HARDCOPY_DOCUMENT, mime: req.file!.mimetype, size: req.file!.size, note: `${str(body.signer_role)} · ${str(body.signer_name)} · ${str(body.reference)}` }, actor);
        documents.save(file.id, req.file!);
        return store.create('flange_signatures', { flangeId: flange.id, recordId: record?.id ?? '', role: str(body.signer_role), method: 'Signed hard-copy', userId: user(req).id, signer_name: str(body.signer_name), signed_date: str(body.signed_date), reference: str(body.reference), attachmentId: file.id }, actor);
      });
      res.status(201).json({ resource: 'flange_signatures', record: access.project('flange_signatures', result) });
    } catch (error) { documents.discard(req.file); throw error; }
  });

  /** Delete in the Documents dialog: the file is archived (kept); the registered PDF and signed evidence are refused. */
  app.post('/api/flanges/:id/documents/:fileId/archive', (req, res) => {
    const flange = flangeFor(req), file = access.record('attachments', String(req.params.fileId));
    if (file.entityType !== 'flanges' || file.entityId !== flange.id || file.documentType === FLANGE_SIGNATURE_DOCUMENT) throw new AppError(404, 'This document could not be found.');
    const refusal = flangeDocumentDeleteRefusal(file); if (refusal) throw new AppError(422, refusal);
    const record = store.transaction(() => store.archive('attachments', file.id, file._version, actorOf(req)));
    res.json({ record: access.project('attachments', record) });
  });

  const protocolInput = (req: Request, flange: Row, preview: boolean) => {
    const rows = flangeRows(store, flange.id), record = latestRecord(rows.flange_records, flange.id);
    const item = flangeItems([flange], store.list('isometrics', true), store.list('projects', true))[0];
    const project = store.list('projects', true).find(row => row.id === item.projectId), site = project ? store.list('sites', true).find(row => row.id === project.siteId) : undefined;
    const signed = recordSignatures(rows.flange_signatures, record?.id);
    const signatures: Partial<Record<SignatureRole, FlangeProtocolSignature>> = {};
    for (const role of SIGNATURE_ROLES) { const row = signed[role]; if (row) signatures[role] = { row, image: row.attachmentId ? documents.read(String(row.attachmentId)) : null }; }
    const byTime = (a: Row, b: Row) => String(a._createdAt).localeCompare(String(b._createdAt));
    return {
      item, record, passes: rows.flange_passes.sort(byTime), bolts: rows.flange_bolts.sort(byTime), leakTests: rows.flange_leak_tests.sort(byTime), labels: rows.flange_labels.sort(byTime), deviations: rows.flange_deviations.sort(byTime),
      signatures, procedureNo: str(site?.flangeProcedureNo), company: companyForDocuments(store, documents), generatedAt: record && !preview ? new Date(record._createdAt) : new Date(), preview,
    };
  };
  const sendPdf = (res: Response, bytes: Uint8Array, name: string) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name.replace(/[^A-Za-z0-9._-]/g, '-')}"`); res.setHeader('Content-Length', String(bytes.length));
    res.end(Buffer.from(bytes));
  };
  const fileName = (flange: Row, suffix: string) => `flange-${str(flange.flange_id) || flange.id}-${suffix}.pdf`;
  /** Open PDF preview: the record as stored, marked as a preview; never registered. */
  app.get('/api/flanges/:id/protocol-preview', async (req, res) => {
    const flange = flangeFor(req, 'show');
    sendPdf(res, (await flangeProtocolPdf(protocolInput(req, flange, true))).bytes, fileName(flange, 'preview'));
  });
  /** Generate immutable PDF: after both signatures, once per record; the bytes are stored with their SHA-256. */
  app.post('/api/flanges/:id/protocol-pdf', async (req, res) => {
    const flange = flangeFor(req);
    const input = protocolInput(req, flange, false);
    if (!input.record) throw new AppError(422, 'Save the record first.');
    if (!input.signatures.Technician || !input.signatures['QA/QC']) throw new AppError(422, 'The protocol PDF is generated after the technician and QA/QC signatures.');
    if (registeredPdf(flangeRows(store, flange.id).attachments, flange.id, input.record.id)) throw new AppError(422, 'The protocol PDF of this record is already registered.');
    const bytes = (await flangeProtocolPdf(input)).bytes, actor = actorOf(req);
    const file = store.transaction(() => {
      const row = store.create('attachments', { name: fileName(flange, 'protocol'), entityType: 'flanges', entityId: flange.id, documentType: FLANGE_PROTOCOL_DOCUMENT, mime: 'application/pdf', size: bytes.length, note: '', sha256: sha256(bytes), recordId: input.record!.id }, actor);
      documents.saveBytes(row.id, bytes);
      return row;
    });
    res.status(201).json({ resource: 'attachments', record: access.project('attachments', file) });
  });
  /** Export (list toolbar): the ticked flanges as an Excel workbook with the list columns, in the order sent. */
  app.get('/api/flanges-export', async (req, res) => {
    const ids = [...new Set(String(req.query.ids ?? '').split(',').map(id => id.trim()).filter(Boolean))];
    if (!ids.length) throw new AppError(422, 'Tick at least one flange first.');
    if (ids.length > 5000) throw new AppError(422, 'Export at most 5000 flanges at once.');
    const flanges = ids.map(id => { const row = access.record('flanges', id); checkResourcePermission(req, 'flanges', 'export', row); return row; });
    const items = flangeItems(flanges, store.list('isometrics', true), store.list('projects', true));
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Blitzkrieg';
    const sheet = workbook.addWorksheet('Flanges'); sheet.columns = FLANGE_LIST_COLUMNS.map(column => ({ header: column.label, key: column.key, width: 20 }));
    sheet.addRows(items.map(item => Object.fromEntries(FLANGE_LIST_COLUMNS.map(column => [column.key, column.value(item)]))));
    sheet.getRow(1).font = { name: 'Outfit', bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.attachment(`flanges-${new Date().toISOString().slice(0, 10)}.xlsx`); await workbook.xlsx.write(res); res.end();
  });
  /** Open PDF: the registered PDF of the latest record, after its stored hash is checked against the stored bytes. */
  app.get('/api/flanges/:id/protocol', (req, res) => {
    const flange = flangeFor(req, 'show');
    const state = registeredPdfState(store, documents, flange.id);
    if (!state.file) throw new AppError(404, 'No protocol PDF is registered for the latest record.');
    if (!state.intact) throw new AppError(409, 'The registered protocol PDF does not match its stored hash. It was not opened.');
    sendPdf(res, documents.read(state.file.id)!, str(state.file.name) || fileName(flange, 'protocol'));
  });
}
