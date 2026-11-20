import type { Express, Request } from 'express';
import { CUT_LIST_FITS, cutLength, fitField, isCalculationLine, roundLength, sortLines } from '../shared/cut-list.ts';
import { DRAFT_EXISTS, REASON_REQUIRED, currentRevision, frozenStandards, isCompleted, isoRevisions, lineRevisionId, revisionDocumentType, revisionFileName, revisionLabel, revisionSnapshot, type Amendment, type CutListRevisionMode, type CutListStandardsChoice, type LineSnapshot, type RevisionSnapshot, type StandardsSnapshot } from '../shared/cut-list-revisions.ts';
import { canEditCompletedCutList } from '../shared/cut-list-rights.ts';
import { canResource } from '../shared/permissions.ts';
import { resourceAvailable } from '../shared/release.ts';
import type { Availability, PermissionVerb, Row } from '../shared/types.ts';
import { actorOf, type AuthRequest } from './auth.ts';
import { fittingTakeoff, withUnlockedCutList } from './cut-list.ts';
import type { documentStorage } from './documents.ts';
import { companyForDocuments } from './pdf/company.ts';
import { cutListPdf } from './pdf/cut-list-document.ts';
import { AppError, type Actor, type Store } from './store.ts';

/**
 * Cut list revisions of an isometric (shared/cut-list-revisions.ts):
 *
 *   Complete Cut List     works the current draft out with the entered data and the norms that apply to it, generates the PDF,
 *                         stores it in the isometric's Attachments (document type "Cut list Rev 00"), keeps a snapshot of the norms
 *                         and lines, records who completed it and when, and locks the lines.
 *   Create New Revision   once the current revision is completed: a copy of its lines ("Keep Previous Standards": the take-offs of
 *                         its snapshot; "Apply Latest Standards": the catalog as it is now) or an empty cut list; Rev. 01, Rev. 02, …
 *   Change a completed    administrators and accounts with "Edit completed cut lists" only, with a reason; logged on the line and the
 *     cut list            revision, the snapshot follows and a new PDF is added as an amendment. Earlier documents are never replaced.
 *
 * A change of the norms (Cut list standards) never reaches a completed revision or a revision that keeps the previous standards.
 */
type Documents = ReturnType<typeof documentStorage>;
const text = (value: unknown) => String(value ?? '').trim();
const numberOrNull = (value: unknown) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

/** The lines of one revision of an isometric (active), in line-number order. */
function linesOf(store: Store, isoId: string, revisionId: string) {
  const revisions = store.list('cut_list_revisions', true);
  return sortLines(store.list('cut_list').filter(line => line.isoId === isoId && lineRevisionId(line, revisions) === revisionId));
}
/** The header of the document: main project (site), subproject number, isometric. */
function documentParties(store: Store, iso: Row) {
  let project: Row | undefined, site: Row | undefined;
  try { project = store.get('projects', iso.projectId, true); site = store.get('sites', project.siteId, true); } catch { /* left empty */ }
  return { project: text(site?.name), projectNo: text(project?.internnumber), isoNo: text(iso.isoNo) };
}
const fittingOf = (store: Store, id: string) => store.list('cut_fittings', true).find(row => row.id === id);
/** The norms of the fittings `lines` use: the frozen value where the revision has one, else the catalog as it is now. */
function standardsOf(store: Store, lines: Row[], frozen: StandardsSnapshot | null): StandardsSnapshot {
  const result: StandardsSnapshot = {};
  for (const line of lines) for (const slot of CUT_LIST_FITS) {
    const id = text(line[fitField(slot)]);
    if (!id || result[id]) continue;
    const fitting = fittingOf(store, id), kept = frozen?.[id];
    result[id] = kept ? { ...kept } : { code: text(fitting?.code), name: text(fitting?.name), description: text(fitting?.description), diameter: text(fitting?.diameter), takeoff: fittingTakeoff(store, id, null) };
  }
  return result;
}
/** One line worked out with `standards` (the Excel formula); an earlier line keeps its entered cut length. */
function lineSnapshot(store: Store, line: Row, standards: StandardsSnapshot): LineSnapshot {
  const fits = CUT_LIST_FITS.map(slot => text(line[fitField(slot)])).filter(Boolean).map(id => ({ id, code: standards[id]?.code ?? '', takeoff: Number(standards[id]?.takeoff ?? 0) }));
  let spool = '';
  if (line.spoolId) { try { spool = text(store.get('spools', line.spoolId, true).name); } catch { /* unavailable */ } }
  const calculated = isCalculationLine(line), result = calculated ? cutLength(line, CUT_LIST_FITS.map(slot => { const id = text(line[fitField(slot)]); return id ? Number(standards[id]?.takeoff ?? 0) : 0; })) : null;
  return {
    lineId: line.id, name: text(line.name), sheet: text(line.sheet), spool, spoolId: text(line.spoolId), dia: text(line.dia), material: text(line.material), schedule: text(line.schedule),
    totalLength: numberOrNull(line.totalLength), bevel: numberOrNull(line.bevel), extraLength: numberOrNull(line.extraLength), fits,
    net: result ? result.net : null, lengthMm: result ? result.length : Number(line.lengthMm) || 0, quantity: Number(line.quantity) || 1,
  };
}
function buildSnapshot(store: Store, iso: Row, revisionNo: unknown, standardsMode: string, lines: Row[], standards: StandardsSnapshot, completedAt: string, completedBy: string, amendments: Amendment[] = []): RevisionSnapshot {
  const snapshots = lines.map(line => lineSnapshot(store, line, standards));
  return { revision: revisionLabel(revisionNo), completedAt, completedBy, ...documentParties(store, iso), standardsMode, fittings: standards, lines: snapshots, totalMm: roundLength(snapshots.reduce((sum, line) => sum + line.lengthMm * line.quantity, 0)), amendments };
}
/** Refusals before anything is worked out: a line that cannot be completed as it is. */
function assertCompletable(store: Store, lines: Row[], standards: StandardsSnapshot) {
  if (!lines.length) throw new AppError(422, 'Add at least one line before completing the cut list.');
  for (const line of lines) {
    for (const slot of CUT_LIST_FITS) {
      const id = text(line[fitField(slot)]), fitting = id ? fittingOf(store, id) : undefined;
      if (id && (!fitting || fitting._archived)) throw new AppError(422, `Line ${text(line.name)}: fitting ${text(fitting?.code) || 'unavailable'} is no longer in the Cut list standards. Choose another fitting first.`);
    }
    const snapshot = lineSnapshot(store, line, standards);
    if (!(snapshot.lengthMm > 0)) throw new AppError(422, `Line ${text(line.name)}: the cut length works out at ${snapshot.lengthMm} mm. Check the line before completing the cut list.`);
  }
}
async function render(store: Store, documents: Documents, snapshot: RevisionSnapshot, now: Date, amendment = 0) {
  return (await cutListPdf({ snapshot, company: companyForDocuments(store, documents), generatedAt: now, amendment })).bytes;
}
/** The generated PDF as a new attachment of the isometric; an existing document is never touched. */
function attach(store: Store, documents: Documents, iso: Row, revNo: unknown, bytes: Uint8Array, actor: Actor, amendment = 0) {
  const file = store.create('attachments', { name: revisionFileName(iso.isoNo, revNo, amendment), entityType: 'isometrics', entityId: iso.id, documentType: revisionDocumentType(revNo, amendment), mime: 'application/pdf', size: bytes.length, note: amendment ? `Amendment ${amendment} of the completed cut list ${revisionLabel(revNo)}` : `Completed cut list ${revisionLabel(revNo)}` }, actor);
  documents.saveBytes(file.id, bytes);
  return file;
}
const versions = (lines: Row[]) => lines.map(line => `${line.id}:${line._version}`).join();

/**
 * Complete Cut List: the current draft of the isometric (`revisionId` '' for the Rev. 00 of lines saved before revisions) is
 * worked out, documented and locked. `revisionId`, when given, must still be the current revision (another tab may have moved on).
 */
export async function completeCutList(store: Store, documents: Documents, isoId: string, actor: Actor, revisionId?: string, now = new Date()) {
  const iso = store.get('isometrics', isoId);
  const current = currentRevision(store.list('cut_list_revisions'), isoId);
  if (revisionId !== undefined && revisionId !== String(current?.id ?? '')) throw new AppError(409, 'This cut list has a newer revision. Refresh and try again.');
  if (current && isCompleted(current)) throw new AppError(409, `${revisionLabel(current.revNo)} of this cut list is already completed.`);
  const lines = linesOf(store, isoId, String(current?.id ?? '')), standardsMode = String(current?.standardsMode || 'Latest');
  const standards = standardsOf(store, lines, frozenStandards(current));
  assertCompletable(store, lines, standards);
  const revNo = current ? Number(current.revNo) : 0, completedAt = now.toISOString();
  const snapshot = buildSnapshot(store, iso, revNo, standardsMode, lines, standards, completedAt, actor.name);
  const bytes = await render(store, documents, snapshot, now);
  return store.transaction(() => {
    // Nothing may have changed while the document was made.
    const again = currentRevision(store.list('cut_list_revisions'), isoId);
    if (String(again?.id ?? '') !== String(current?.id ?? '') || again && again._version !== current!._version || versions(linesOf(store, isoId, String(current?.id ?? ''))) !== versions(lines)) throw new AppError(409, 'The cut list changed while it was being completed. Check it and try again.');
    let revision = current ?? store.create('cut_list_revisions', { name: revisionLabel(0), isoId, revNo: 0, status: 'Draft', source: 'First', standardsMode: 'Latest', createdById: actor.id, createdByName: actor.name }, actor);
    const file = attach(store, documents, iso, revNo, bytes, actor);
    revision = store.update('cut_list_revisions', revision.id, { status: 'Completed', completedAt, completedById: actor.id, completedByName: actor.name, attachmentId: file.id, amendments: 0, snapshot: JSON.stringify(snapshot) }, revision._version, actor);
    // The lines take their revision and the take-offs of the snapshot (fixed from now on).
    withUnlockedCutList(store, () => { for (const line of lines) store.update('cut_list', line.id, { revisionId: revision.id }, line._version, actor); });
    store.audit('cut_list_revisions', revision.id, 'completed', `Completed cut list ${revisionLabel(revNo)} of ${text(iso.isoNo)}: ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, total ${snapshot.totalMm} mm, document ${file.name}`, actor);
    return { revision, attachment: file };
  });
}

/**
 * Create New Revision once the current revision is completed. `copy` takes the lines of `sourceRevisionId` (default: the
 * current revision) into the new draft, with its norms (`keep`) or the catalog as it is now (`latest`); `new` starts empty.
 * The source revision and its document stay as they are.
 */
export function createCutListRevision(store: Store, isoId: string, options: { mode: CutListRevisionMode; standards?: CutListStandardsChoice; sourceRevisionId?: string }, actor: Actor) {
  const iso = store.get('isometrics', isoId), revisions = isoRevisions(store.list('cut_list_revisions'), isoId), current = revisions.at(-1);
  if (!current) throw new AppError(409, DRAFT_EXISTS(revisionLabel(0)));
  if (!isCompleted(current)) throw new AppError(409, DRAFT_EXISTS(revisionLabel(current.revNo)));
  const source = options.sourceRevisionId ? revisions.find(row => row.id === options.sourceRevisionId) : current;
  if (!source) throw new AppError(422, 'Choose a revision of this isometric to copy.');
  const copy = options.mode === 'copy', keep = copy && options.standards === 'keep', revNo = Number(current.revNo) + 1;
  return store.transaction(() => {
    const revision = store.create('cut_list_revisions', { name: revisionLabel(revNo), isoId, revNo, status: 'Draft', source: copy ? 'Copy' : 'New', sourceRevisionId: copy ? source.id : '', standardsMode: keep ? 'Keep' : 'Latest', standards: keep ? JSON.stringify(frozenStandards(source) ?? {}) : '', createdById: actor.id, createdByName: actor.name }, actor);
    let copied = 0;
    if (copy) for (const line of linesOf(store, isoId, source.id)) {
      for (const slot of CUT_LIST_FITS) {
        const id = text(line[fitField(slot)]), fitting = id ? fittingOf(store, id) : undefined;
        if (id && (!fitting || fitting._archived)) throw new AppError(422, `Line ${text(line.name)} uses fitting ${text(fitting?.code) || 'unavailable'}, which is no longer in the Cut list standards. Restore it there, or create a new empty cut list.`);
      }
      const active = (key: string, id: unknown) => { if (!id) return ''; try { return store.get(key, id).id; } catch { return ''; } };
      const values = Object.fromEntries(['sheet', 'dia', 'material', 'schedule', 'totalLength', 'bevel', 'extraLength', ...CUT_LIST_FITS.map(fitField), 'quantity', 'description'].filter(name => line[name] !== undefined).map(name => [name, line[name]]));
      store.create('cut_list', { ...values, name: line.name, isoId, revisionId: revision.id, spoolId: active('spools', line.spoolId), requirementId: active('iso_materials', line.requirementId), ...(isCalculationLine(line) ? {} : { lengthMm: line.lengthMm }) }, actor);
      copied++;
    }
    store.audit('cut_list_revisions', revision.id, 'created', `Created cut list ${revisionLabel(revNo)} of ${text(iso.isoNo)}: ${copy ? `${copied} ${copied === 1 ? 'line' : 'lines'} from ${revisionLabel(source.revNo)}, ${keep ? 'previous standards kept' : 'latest standards applied'}` : 'new empty cut list'}`, actor);
    return revision;
  });
}

/** Fields a change of a completed cut list may set (the computed ones are worked out again). */
const AMENDABLE = ['name', 'sheet', 'spoolId', 'dia', 'material', 'schedule', 'totalLength', 'bevel', 'extraLength', ...CUT_LIST_FITS.map(fitField), 'quantity', 'description'];
export type AmendAction = Amendment['action'];
export interface AmendInput { revisionId: string; action: AmendAction; lineId?: string; changes?: Record<string, unknown>; version?: number; reason: string }
/**
 * A change of a completed revision by an account that may (the caller checks `canEditCompletedCutList`): one line changed,
 * added, deleted or restored, with a reason. The change is logged on the line and the revision, the snapshot is worked out
 * again with the revision's norms (a newly chosen fitting adds its current values) and a new PDF is attached as amendment N.
 */
export async function amendCompletedCutList(store: Store, documents: Documents, input: AmendInput, actor: Actor, now = new Date()) {
  const reason = text(input.reason);
  if (!reason) throw new AppError(422, REASON_REQUIRED, { reason: REASON_REQUIRED });
  if (reason.length > 500) throw new AppError(422, 'Keep the reason under 500 characters.', { reason: 'Keep the reason under 500 characters.' });
  const changes = input.changes ?? {};
  if (typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(name => !AMENDABLE.includes(name))) throw new AppError(422, 'These fields of a cut list line cannot be changed.');
  const first = store.transaction(() => {
    const revision = store.get('cut_list_revisions', input.revisionId);
    if (!isCompleted(revision)) throw new AppError(409, `${revisionLabel(revision.revNo)} is a draft: change its lines in the table.`);
    const iso = store.get('isometrics', revision.isoId);
    let line: Row;
    withUnlockedCutList(store, () => {
      if (input.action === 'add') line = store.create('cut_list', { ...changes, isoId: iso.id, revisionId: revision.id }, actor);
      else {
        const existing = store.get('cut_list', input.lineId, true);
        if (existing.isoId !== iso.id || lineRevisionId(existing, store.list('cut_list_revisions', true)) !== revision.id) throw new AppError(422, 'This line is not part of the revision.');
        if (typeof input.version !== 'number') throw new AppError(422, 'A record version is required. Refresh and try again.');
        if (input.action === 'edit') line = store.update('cut_list', existing.id, changes, input.version, actor);
        else if ((input.action === 'delete') === Boolean(existing._archived)) throw new AppError(409, input.action === 'delete' ? 'This line is already deleted.' : 'This line is not deleted.');
        else line = store.archive('cut_list', existing.id, input.version, actor);
      }
    });
    const previous = revisionSnapshot(revision), lines = linesOf(store, iso.id, revision.id);
    const amendment = (Number(revision.amendments) || 0) + 1, at = now.toISOString();
    const entry: Amendment = { at, byId: actor.id, byName: actor.name, reason, action: input.action, line: text(line!.name) };
    const standards = standardsOf(store, lines, previous?.fittings ?? frozenStandards(revision));
    const snapshot = buildSnapshot(store, iso, revision.revNo, String(revision.standardsMode || 'Latest'), lines, { ...previous?.fittings, ...standards }, previous?.completedAt ?? String(revision.completedAt ?? at), previous?.completedBy ?? text(revision.completedByName), [...(previous?.amendments ?? []), entry]);
    const updated = store.update('cut_list_revisions', revision.id, { amendments: amendment, snapshot: JSON.stringify(snapshot) }, revision._version, actor);
    const summary = `Changed completed cut list ${revisionLabel(revision.revNo)} of ${text(iso.isoNo)}, line ${entry.line} (${input.action}). Reason: ${reason}`;
    store.audit('cut_list', line!.id, 'amended', summary, actor); store.audit('cut_list_revisions', revision.id, 'amended', summary, actor);
    return { revision: updated, iso, snapshot, amendment, line: line! };
  });
  // The amended document is added next to the earlier ones.
  const bytes = await render(store, documents, first.snapshot, now, first.amendment);
  return store.transaction(() => {
    const revision = store.get('cut_list_revisions', first.revision.id), file = attach(store, documents, first.iso, revision.revNo, bytes, actor, first.amendment);
    const snapshot = revisionSnapshot(revision);
    if (snapshot) { const last = snapshot.amendments.at(-1); if (last) last.attachmentId = file.id; }
    const updated = store.update('cut_list_revisions', revision.id, { attachmentId: file.id, ...(snapshot ? { snapshot: JSON.stringify(snapshot) } : {}) }, revision._version, actor);
    return { revision: updated, attachment: file, line: first.line };
  });
}

export interface CutListRevisionRouteDependencies { app: Express; store: Store; documents: Documents; availability: Availability | undefined; readableRows(req: Request, key: string, archived?: boolean): Row[] }
/**
 *   POST /api/cut-list/complete   { isoId, revisionId? }                          Complete Cut List (Edit on the cut list)
 *   POST /api/cut-list/revisions  { isoId, mode: copy|new, standards: keep|latest } Create New Revision (Add on the cut list)
 *   POST /api/cut-list/amend      { revisionId, action, lineId?, changes?, _version?, reason }  change of a completed cut list
 */
export function registerCutListRevisionRoutes({ app, store, documents, availability, readableRows }: CutListRevisionRouteDependencies) {
  const available = () => { if (availability && !resourceAvailable(availability, 'cut_list_revisions')) throw new AppError(404, 'This resource could not be found.'); };
  const userOf = (req: Request) => (req as unknown as AuthRequest).user;
  /** The isometric, readable by the request (site scope and pilot included), and the right on the cut list. */
  function isometric(req: Request, id: unknown, verb: PermissionVerb) {
    const user = userOf(req);
    if (!canResource(user, 'cut_list', verb) || !canResource(user, 'cut_list_revisions')) throw new AppError(403, 'Your permission profile does not allow this action.');
    const iso = readableRows(req, 'isometrics').find(row => row.id === id);
    if (!iso) throw new AppError(404, 'The isometric could not be found.');
    return iso;
  }
  const body = (req: Request) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  app.post('/api/cut-list/complete', async (req, res) => {
    available();
    const input = body(req), iso = isometric(req, input.isoId, 'edit');
    const result = await completeCutList(store, documents, iso.id, actorOf(req), typeof input.revisionId === 'string' ? input.revisionId : undefined);
    res.status(201).json({ revisionId: result.revision.id, attachmentId: result.attachment.id });
  });
  app.post('/api/cut-list/revisions', (req, res) => {
    available();
    const input = body(req), iso = isometric(req, input.isoId, 'insert');
    if (input.mode !== 'copy' && input.mode !== 'new') throw new AppError(422, 'Choose how the new revision starts.');
    if (input.mode === 'copy' && input.standards !== 'keep' && input.standards !== 'latest') throw new AppError(422, 'Choose Keep Previous Standards or Apply Latest Standards.');
    const revision = createCutListRevision(store, iso.id, { mode: input.mode, standards: input.standards as CutListStandardsChoice | undefined, sourceRevisionId: typeof input.sourceRevisionId === 'string' ? input.sourceRevisionId : undefined }, actorOf(req));
    res.status(201).json({ revisionId: revision.id });
  });
  app.post('/api/cut-list/amend', async (req, res) => {
    available();
    const input = body(req), user = userOf(req);
    if (!canEditCompletedCutList(user)) throw new AppError(403, 'Only an administrator or an account with the right "Edit completed cut lists" can change a completed cut list.');
    const revision = readableRows(req, 'cut_list_revisions').find(row => row.id === input.revisionId);
    if (!revision) throw new AppError(404, 'This cut list revision could not be found.');
    if (!['edit', 'add', 'delete', 'restore'].includes(String(input.action))) throw new AppError(422, 'Choose a valid change.');
    isometric(req, revision.isoId, input.action === 'add' ? 'insert' : input.action === 'edit' ? 'edit' : 'delete');
    const result = await amendCompletedCutList(store, documents, { revisionId: revision.id, action: input.action as AmendAction, lineId: typeof input.lineId === 'string' ? input.lineId : undefined, changes: input.changes as Record<string, unknown> | undefined, version: typeof input._version === 'number' ? input._version : undefined, reason: String(input.reason ?? '') }, actorOf(req));
    res.json({ revisionId: result.revision.id, attachmentId: result.attachment.id, lineId: result.line.id });
  });
}
