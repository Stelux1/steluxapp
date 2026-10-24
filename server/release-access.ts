import { RESOURCES } from '../shared/resources.ts';
import { canResource, RESOURCE_SCOPES } from '../shared/permissions.ts';
import { actionAvailable, fieldAvailable, projectRow, resourceAvailable, rowAvailable } from '../shared/release.ts';
import type { Availability, AuditEvent, Module, Row, User } from '../shared/types.ts';
import { Store, AppError } from './store.ts';
import { availableWps } from '../shared/welding.ts';

const notFound = () => new AppError(404, 'This resource could not be found.');

export function releaseAccess(store: Store, availability?: Availability) {
  function user(original: User): User {
    if (!availability) return original;
    const modules = new Set(RESOURCES.filter(r => resourceAvailable(availability, r.key)).map(r => r.module));
    const scopes = new Set(Object.entries(RESOURCE_SCOPES).filter(([key]) => resourceAvailable(availability, key)).flatMap(([, keys]) => keys));
    return { ...original, availability,
      permissions: Object.fromEntries(Object.entries(original.permissions).map(([module, level]) => [module, modules.has(module as Module) ? level : 0])) as User['permissions'],
      ...(original.capabilities ? { capabilities: Object.fromEntries(Object.entries(original.capabilities).filter(([key]) => scopes.has(key))) } : {}),
    };
  }
  function resource(key: string) {
    if (!resourceAvailable(availability, key)) throw notFound();
    return store.resource(key);
  }
  function visible(account: User, key: string, row: Row): boolean {
    if (!rowAvailable(availability, key, row)) return false;
    if (key !== 'attachments') return canResource(account, key, 'show', row);
    try {
      const target = String(row.entityType);
      return target !== 'attachments' && resourceAvailable(availability, target) && visible(account, target, store.get(target, row.entityId, true));
    } catch { return false; }
  }
  function record(key: string, id: unknown, archived = false): Row {
    resource(key);
    const row = store.get(key, id, archived);
    if (!rowAvailable(availability, key, row)) throw notFound();
    if (availability && key === 'attachments') {
      const target = String(row.entityType);
      if (target === 'attachments') throw notFound();
      record(target, row.entityId, true);
    }
    return row;
  }
  function input(key: string, value: Record<string, unknown>, action = false, existing?: Row) {
    if (!availability) return;
    const names = action ? availability.actions[key] : availability.resources[key];
    if (!names || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(name => !names.includes(name) && !(name === '_version' && !action))) throw notFound();
    if (action && !actionAvailable(availability, key, value.type)) throw notFound();
    if (!action && ['inspection_requests', 'inspection_results'].includes(key) && value.type !== undefined && !availability.inspectionTypes.includes(String(value.type))) throw notFound();
    if (!action && key === 'welds' && (!existing || value.isoId !== undefined || value.wpsId !== undefined)) {
      const wpsId = value.wpsId ?? existing?.wpsId;
      if (wpsId) {
        const iso = record('isometrics', value.isoId ?? existing?.isoId);
        const wps = record('wps', wpsId);
        const rows = Object.fromEntries(['projects', 'wps_projects', 'wps_sites'].map(resource => [resource, store.list(resource)]));
        if (!availableWps(rows, wps, String(iso.projectId))) throw new AppError(422, 'Choose a WPS available for this project and site.', { wpsId: 'Select a procedure available for this project and site.' });
      }
    }
  }
  function audit(account: User, event: AuditEvent): AuditEvent | null {
    try {
      if (!visible(account, event.entityType, record(event.entityType, event.entityId, true))) return null;
    } catch { return null; }
    if (availability) {
      if (!['created', 'updated', 'archived', 'restored', 'inspected', 'repair'].includes(event.action)) return null;
      if (event.action === 'inspected' && !availability.inspectionTypes.some(type => ['accepted', 'rejected'].some(result => event.summary.startsWith(`${type} ${result} · `)))) return null;
    }
    return availability || account.capabilities ? { ...event, summary: `${event.action[0].toUpperCase() + event.action.slice(1)} ${resource(event.entityType).singular}` } : event;
  }
  const project = (key: string, row: Row) => projectRow(availability, key, row);
  return { user, resource, visible, record, input, audit, project,
    field: (key: string, name: string) => fieldAvailable(availability, key, name),
    result: (result: ReturnType<typeof import('./workflows.ts').runAction>) => ({ ...result, ...(result.record ? { record: project(result.resource!, result.record) } : {}), ...(result.records ? { records: result.records.map(row => project(result.resource!, row)) } : {}) }),
  };
}
