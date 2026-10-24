import { RESOURCES as allResources, MODULES } from '../shared/resources.ts';
import { ACTIONS as allActions } from '../shared/actions.ts';
import { RELATIONS as allRelations, relationIds, availableWps, type Relation } from '../shared/welding.ts';
import { REPORTS as allReports } from '../shared/reports.ts';
import { actionAvailable, fieldAvailable, projectAction, projectResource, resourceAvailable } from '../shared/release.ts';
import type { ActionDefinition, ActionField, Availability, Resource } from '../shared/types.ts';

export { MODULES, relationIds, availableWps };
export { permissionValue } from '../shared/resources.ts';
export let RESOURCES: Resource[] = allResources;
export let RESOURCE_MAP: Record<string, Resource> = Object.fromEntries(RESOURCES.map(r => [r.key, r]));
export let ACTIONS: Record<string, ActionDefinition> = allActions;
export let RELATIONS: Record<string, Relation[]> = allRelations;
export let REPORTS = allReports;
export const RELATION_RESOURCES = new Set(Object.values(allRelations).flat().map(r => r.resource));
export const relationFields = (owner: string): ActionField[] => (RELATIONS[owner] || []).map(r => ({ name: r.field, label: r.label, type: 'ref', ref: r.target, multiple: true, section: 'Links & availability', showIf: r.showIf }));

/** Install the server's positive catalog before rendering workspace components. */
export function configureCatalog(availability?: Availability) {
  RESOURCES = allResources.filter(r => resourceAvailable(availability, r.key)).map(r => projectResource(availability, r));
  RESOURCE_MAP = Object.fromEntries(RESOURCES.map(r => [r.key, r]));
  ACTIONS = Object.fromEntries(Object.entries(allActions).filter(([key]) => actionAvailable(availability, key)).map(([key, action]) => [key, projectAction(availability, action)]));
  RELATIONS = Object.fromEntries(Object.entries(allRelations).filter(([owner]) => resourceAvailable(availability, owner)).map(([owner, relations]) => [owner, relations.filter(r => resourceAvailable(availability, r.resource) && resourceAvailable(availability, r.target) && fieldAvailable(availability, owner, r.field))]));
  REPORTS = allReports.filter(r => !availability || Boolean(availability.reports[r.key]));
}
