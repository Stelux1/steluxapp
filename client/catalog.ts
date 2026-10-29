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
  if (availability?.features.includes('lisl')) RESOURCES = RESOURCES.map(resource => resource.key === 'sites' ? { ...resource, title: 'Main projects', singular: 'main project', description: 'Select the main project your team is working on.', fields: resource.fields.map(field => field.name === 'name' ? { ...field, label: 'Main project name' } : field) } : resource.key === 'projects' ? { ...resource, title: 'Subprojects', singular: 'subproject', columns: ['internnumber', 'externnumber', 'description', 'status'], description: 'Numbered subprojects in the selected main project.', fields: resource.fields.map(field => ({ ...field, label: field.name === 'internnumber' ? 'Subprojects' : field.name === 'externnumber' ? 'Plant location' : field.name === 'description' ? 'Subproject name / description' : field.name === 'siteId' ? 'Main project' : field.label })) } : resource.key === 'isometrics' ? { ...resource, columns: ['isoNo', 'area', 'zone', 'revNo', 'itpNo', 'pipingClass', 'priority'].filter(name => resource.fields.some(field => field.name === name)), fields: resource.fields.map(field => field.name === 'projectId' ? { ...field, label: 'Subproject' } : field) } : resource);
  RESOURCE_MAP = Object.fromEntries(RESOURCES.map(r => [r.key, r]));
  ACTIONS = Object.fromEntries(Object.entries(allActions).filter(([key]) => actionAvailable(availability, key)).map(([key, action]) => [key, projectAction(availability, action)]));
  RELATIONS = Object.fromEntries(Object.entries(allRelations).filter(([owner]) => resourceAvailable(availability, owner)).map(([owner, relations]) => [owner, relations.filter(r => resourceAvailable(availability, r.resource) && resourceAvailable(availability, r.target) && fieldAvailable(availability, owner, r.field))]));
  REPORTS = allReports.filter(r => !availability || Boolean(availability.reports[r.key]));
}
