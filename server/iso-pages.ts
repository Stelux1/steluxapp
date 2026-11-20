import { RESOURCE_MAP } from '../shared/resources.ts';
import type { Row } from '../shared/types.ts';
import { headerFields, highestIrnCounter, IRN_AUTO_MESSAGE, irnNumber, nextIrnSeries, projectDeleteRefusal } from '../shared/iso-pages.ts';
import { AppError, type Actor, type Store } from './store.ts';
import { COMPLETION_FIELDS } from '../shared/iso-status.ts';

type Input = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
const live = (store: Store, key: string): Row[] => { try { return store.list(key); } catch { return []; } };

/** The main project (site) of a subproject, or undefined when the project is unknown. */
function siteOfProject(store: Store, projectId: unknown): Row | undefined {
  try { return store.get('sites', store.get('projects', projectId, true).siteId, true); } catch { return undefined; }
}

/** The isometrics of a main project with their IRN, in the order they were created. */
function isometricsOfSite(store: Store, siteId: string): Row[] {
  const projects = new Set(live(store, 'projects').filter(project => project.siteId === siteId).map(project => project.id));
  const order = store.db.prepare('SELECT id FROM "isometrics" WHERE archived=0 ORDER BY created_at, rowid').all() as { id: string }[];
  const byId = new Map(live(store, 'isometrics').map(row => [row.id, row]));
  return order.map(entry => byId.get(entry.id)).filter((row): row is Row => Boolean(row) && projects.has(String(row!.projectId)));
}

/** The next IRN of a main project with automatic numbers on; the counter is kept on the site (derived from the highest IRN when absent). */
function takeIrn(store: Store, site: Row, actor: Actor): string {
  const series = text(site.irnCode);
  const known = Number(site.irnCounter);
  const counter = Math.max(Number.isFinite(known) ? known : 0, highestIrnCounter(series, isometricsOfSite(store, site.id).map(row => row.irn))) + 1;
  store.update('sites', site.id, { irnCounter: counter }, site._version, actor);
  return irnNumber(series, counter);
}

/** A typed IRN is refused while the main project numbers its isometrics itself (the field is read only there). */
export function guardIrn(store: Store, value: Input, existing?: Row) {
  const moved = Boolean(existing) && value.projectId !== undefined && text(value.projectId) !== text(existing!.projectId);
  if (value.irn === undefined && !moved) return;
  const refuse = () => { throw new AppError(422, IRN_AUTO_MESSAGE, { irn: IRN_AUTO_MESSAGE }); };
  // Judged on the main project before and after the write (sec1-007): a move must not bring an IRN into a main project that numbers itself.
  const before = existing ? siteOfProject(store, existing.projectId) : undefined;
  const after = value.projectId !== undefined ? siteOfProject(store, value.projectId) : before;
  if (moved && after?.irnAuto === true && after.id !== before?.id) {
    if (text(value.irn !== undefined ? value.irn : existing?.irn)) refuse();
    return;
  }
  if (value.irn === undefined) return;
  if (before?.irnAuto !== true && after?.irnAuto !== true) return;
  if (text(value.irn) !== text(existing?.irn)) refuse();
}
/** A new isometric of a main project with automatic IRN numbers gets the next one. */
export function assignIrn(store: Store, value: Input, actor: Actor) {
  const site = siteOfProject(store, value.projectId);
  if (site?.irnAuto === true && text(site.irnCode)) value.irn = takeIrn(store, site, actor);
}

/** Switching the site's own flags by a plain write would skip the series check: only the fill-irn action does it. */
export function guardSiteIrn(value: Input) {
  if (value.irnAuto !== undefined || value.irnCounter !== undefined) throw new AppError(422, 'Use Automatically add IRN numbers to switch the IRN numbers of a main project on.');
}

/**
 * Automatically add IRN numbers: reserve a unique letter series for the main project (its own IRN Code when it has one),
 * switch the numbers on, and number the isometrics that have no IRN yet in the order they were created.
 */
export function fillIrn(store: Store, data: Input, actor: Actor) {
  const site = store.get('sites', data.siteId);
  const others = store.list('sites', true).filter(row => row.id !== site.id).map(row => text(row.irnCode));
  let series = text(site.irnCode);
  if (series && others.some(code => code.toLowerCase() === series.toLowerCase())) throw new AppError(422, 'This IRN series is already used by another main project.', { siteId: 'Choose a main project with its own IRN code.' });
  if (!series) series = nextIrnSeries(others);
  let current = store.update('sites', site.id, { irnCode: series, irnAuto: true }, site._version, actor);
  const numbered: Row[] = [];
  for (const iso of isometricsOfSite(store, site.id)) {
    if (text(iso.irn)) continue;
    const irn = takeIrn(store, current, actor);
    current = store.get('sites', site.id);
    numbered.push(store.update('isometrics', iso.id, { irn }, iso._version, actor));
  }
  store.audit('sites', site.id, 'updated', `Automatic IRN numbers on (${series}): ${numbered.length} isometric${numbered.length === 1 ? '' : 's'} numbered`, actor);
  return { resource: 'sites', record: store.get('sites', site.id), records: numbered.length ? numbered : undefined };
}

/** The fields of an isometric's header that Add new takes from the form (the project-bound assignments, progress and phases stay out, as in a copy). */
export const HEADER_FIELDS = headerFields(RESOURCE_MAP.isometrics.fields);
/** The edited header of Add new: a plain object of header fields. */
export function editedHeader(values: unknown): Input {
  if (values === undefined || values === null) return {};
  if (typeof values !== 'object' || Array.isArray(values)) throw new AppError(422, 'Check the fields of the isometric.');
  const header: Input = {};
  // The completion fields are dropped as on the record routes (only complete-phase and release set them, sec1-006).
  const completion = new Set(Object.values(COMPLETION_FIELDS).flatMap(fields => [fields.at, fields.by]));
  for (const [name, value] of Object.entries(values as Input)) {
    if (completion.has(name)) continue;
    if (!HEADER_FIELDS.includes(name)) throw new AppError(422, 'Check the fields of the isometric.');
    header[name] = value;
  }
  return header;
}
/** True when the main project of the project numbers its isometrics itself. */
export const siteNumbersIrn = (store: Store, project: Row) => siteOfProject(store, project.id)?.irnAuto === true;

/** Delete refusals: a project that is not blank. An isometric is never refused (its Delete right is the only gate; the store deletes what hangs on it). */
export function deleteRefusal(store: Store, key: string, row: Row): string {
  if (key === 'projects') return projectDeleteRefusal(live(store, 'isometrics').filter(item => item.projectId === row.id).length);
  return '';
}
