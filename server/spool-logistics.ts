import { AppError, today, type Actor, type Store } from './store.ts';
import type { Row } from '../shared/types.ts';
import { nextRequestNumber, serviceLocationText } from '../shared/mto-logistics.ts';

/**
 * Spool service requests and moves to a laydown (MTO Pilot, Logistic -> Service request).
 *
 * `createSpoolServiceRequest` is the one place a spool request is made: the documents of a request (print, signing) hook in
 * here. Runs inside the transaction of `runAction` (server/workflows.ts). `hosted` is the hosted profile: the name of the
 * request is the signed-in user, and the date and time are now, whatever the client sent.
 */
type Input = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const idList = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(item => typeof item !== 'string' || !item)) throw new AppError(422, `Select at least one ${label}.`);
  return [...new Set(value)] as string[];
};
/** The moment of an entry: now, or the start of the day a dated entry (sample data, other profiles) names. */
const stamp = (date: string, explicit: boolean) => explicit ? `${date}T00:00:00.000Z` : new Date().toISOString();

export const nextNumber = (store: Store) => nextRequestNumber(store.list('service_requests', true).map(row => row.number));

export function createSpoolServiceRequest(store: Store, actor: Actor, input: Input, options: { hosted?: boolean; date?: string; note?: string } = {}): { resource: string; records: Row[] } {
  const company = store.get('service_companies', input.companyId);
  const hosted = options.hosted === true; const explicit = !hosted && Boolean(input.date);
  const date = hosted ? today() : options.date || today(); const requestedAt = stamp(date, explicit);
  const number = nextNumber(store); const created: Row[] = [];
  for (const id of idList(input.spoolIds, 'spool')) {
    const spool = store.get('spools', id);
    if (store.list('service_requests').some(row => row.spoolId === id && row.status !== 'Completed')) throw new AppError(409, `Spool ${spool.name} already has an open service request.`);
    const request = store.create('service_requests', { number, name: hosted ? actor.name : text(input.name), spoolId: id, companyId: company.id, services: text(input.services), includeDrawings: input.includeDrawings === true, date, requestedAt: explicit ? '' : requestedAt, addedBy: actor.name, status: 'Requested', note: options.note || '' }, actor);
    created.push(request);
    store.update('spools', spool.id, { serviceCompanyId: company.id, laydownId: '' }, spool._version, actor);
    store.create('spool_moves', { spoolId: id, date: requestedAt, type: 'Service', location: serviceLocationText(number, String(company.name)), requestId: request.id }, actor);
  }
  return { resource: 'service_requests', records: created };
}

/** Move to laydown. A spool that is at a service company comes back this way: its open request is closed with the move date. */
export function moveSpoolsToLaydown(store: Store, actor: Actor, input: Input, options: { hosted?: boolean; date?: string; note?: string } = {}): { resource: string } {
  const laydown = store.get('laydowns', input.laydownId);
  const hosted = options.hosted === true; const explicit = !hosted && Boolean(input.date);
  const date = hosted ? today() : options.date || today(); const movedAt = stamp(date, explicit); const note = options.note || '';
  for (const id of idList(input.spoolIds, 'spool')) {
    const spool = store.get('spools', id);
    if (spool.serviceCompanyId) {
      for (const request of store.list('service_requests').filter(row => row.spoolId === id && row.status !== 'Completed')) {
        if (date < String(request.date)) throw new AppError(422, 'The move date cannot be before the request date.');
        store.update('service_requests', request.id, { status: 'Completed', completedAt: date }, request._version, actor);
      }
    }
    store.update('spools', spool.id, { laydownId: laydown.id, serviceCompanyId: '' }, spool._version, actor);
    store.create('spool_moves', { spoolId: id, date: movedAt, type: 'Laydown', location: String(laydown.name), laydownId: laydown.id }, actor);
    store.audit('spools', id, 'moved', `Moved ${spool.name} to ${laydown.name} · ${date}${note ? ' · ' + note : ''}`, actor);
  }
  return { resource: 'spools' };
}
