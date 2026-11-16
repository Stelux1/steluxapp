import { RESOURCE_MAP } from './resources.ts';

/**
 * "Duplicate Project site" (reference: Edit project site → Duplicate): the copy gets " (Copy)" after the name and takes
 * over the ticked parts. Projects, isometrics, welds and every record that lives inside a main project are never copied;
 * the catalogs themselves are global, so an "activated list" copies only which records are switched on for the site.
 * The reference's ISO Book, Memo templates, Daily reporting and Spools options have nothing to copy here and are not offered.
 */
export interface DuplicatePart {
  key: string; label: string; group: 'Site settings' | 'Activated lists';
  /** Site settings: the section of the main project form whose fields are copied. */
  section?: string;
  /** Activated lists: the catalog whose "Enabled on this site" links are copied (`catalog_sites`), or the link record of a list that is enabled per site. */
  catalog?: string; links?: { resource: string; ownerKey: string };
}
export const DUPLICATE_PARTS: DuplicatePart[] = [
  { key: 'projectSettings', label: 'Project settings', group: 'Site settings', section: 'Project settings' },
  { key: 'documentSettings', label: 'Document settings', group: 'Site settings', section: 'Document settings' },
  { key: 'isoProgress', label: 'Iso progress', group: 'Site settings', section: 'Iso progress' },
  { key: 'ndtProcess', label: 'NDT process', group: 'Activated lists', catalog: 'ndt_processes' },
  { key: 'weldTypes', label: 'Weld types', group: 'Activated lists', catalog: 'weld_types' },
  { key: 'wpsMethods', label: 'WPS methods', group: 'Activated lists', links: { resource: 'wps_sites', ownerKey: 'wpsId' } },
  { key: 'welders', label: 'Welders', group: 'Activated lists', links: { resource: 'welder_sites', ownerKey: 'welderId' } },
  { key: 'materialSupplier', label: 'Material supplier', group: 'Activated lists', catalog: 'suppliers' },
  { key: 'ndtLocations', label: 'NDT locations', group: 'Activated lists', catalog: 'ndt_locations' },
  { key: 'pwhtProcess', label: 'PWHT process', group: 'Activated lists', catalog: 'pwht_processes' },
  { key: 'pwhtLocations', label: 'PWHT locations', group: 'Activated lists', catalog: 'pwht_locations' },
  { key: 'qaqcEngineers', label: 'QA/QC engineers', group: 'Activated lists', catalog: 'qa_engineers' },
];
export const DUPLICATE_PART_KEYS = DUPLICATE_PARTS.map(part => part.key);
/** Contact fields that travel with "Project settings" (the reference keeps them in that tab). The IRN Code identifies one site and is never copied. */
const CONTACT = ['address', 'zip', 'residence', 'phone', 'email'];
export const NOT_COPIED = ['name', 'irnCode', 'irnAuto', 'irnCounter'];
/** The site fields a ticked "Site settings" part copies. */
export function duplicateFields(part: DuplicatePart): string[] {
  const fields = RESOURCE_MAP.sites.fields.filter(field => !NOT_COPIED.includes(field.name));
  if (!part.section) return [];
  return [...(part.section === 'Project settings' ? CONTACT : []), ...fields.filter(field => field.section === part.section).map(field => field.name)];
}
/** The parts of a request, or null when it names something that is not an option. */
export function duplicateParts(value: unknown): DuplicatePart[] | null {
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(item => !DUPLICATE_PART_KEYS.includes(item as string))) return null;
  return DUPLICATE_PARTS.filter(part => value.includes(part.key));
}
/** The records the account must be able to read for the parts it asks to copy (a list it cannot see is not copied for it). */
export const duplicateReadResources = (parts: DuplicatePart[]) => [...new Set(parts.flatMap(part => part.catalog ? [part.catalog] : part.links ? [part.links.resource] : []))];
/** The name of the copy: "<name> (Copy)", numbered when that is taken. */
export function copyName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(value => value.trim().toLowerCase()));
  let candidate = `${name} (Copy)`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name} (Copy ${n})`;
  return candidate;
}
