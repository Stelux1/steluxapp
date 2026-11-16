import type { Row } from './types.ts';
import { SITE_OWNED, inOwnerSite } from './welder-data.ts';

/** Row key that switches a project on for each pilot. Projects without the key (older records) are enabled. */
const PILOT_FLAGS: Record<string, string> = { weld: 'weldPilot', mto: 'mtoPilot' };
export const projectInPilot = (project: Row, pilot?: string) => !pilot || !PILOT_FLAGS[pilot] || project[PILOT_FLAGS[pilot]] !== false;

/** Keep only what hangs off the given projects: isometrics, their weld and material records, and documents. */
function narrowToProjects(rows: Record<string, Row[]>, projectRows: Row[], sites = rows.sites || []): Record<string, Row[]> {
  const scoped: Record<string, Row[]> = { ...rows, projects: projectRows, sites };
  const projects = new Set(projectRows.map(row => row.id));
  scoped.isometrics = (rows.isometrics || []).filter(row => projects.has(String(row.projectId)));
  const isos = new Set(scoped.isometrics.map(row => row.id));
  for (const key of ['welds', 'spools', 'revisions', 'iso_materials', 'calculation_lines', 'cut_list', 'releases', 'flanges']) scoped[key] = (rows[key] || []).filter(row => isos.has(String(row.isoId)));
  // A punch item belongs to an isometric of the projects, or to one of the projects itself.
  scoped.punchlists = (rows.punchlists || []).filter(row => row.isoId ? isos.has(String(row.isoId)) : projects.has(String(row.projectId)));
  const welds = new Set(scoped.welds.map(row => row.id));
  for (const key of ['inspection_requests', 'inspection_results', 'repairs']) scoped[key] = (rows[key] || []).filter(row => welds.has(String(row.weldId)));
  scoped.test_systems = (rows.test_systems || []).filter(row => !row.projectId || projects.has(String(row.projectId)));
  const ids = Object.fromEntries(Object.entries(scoped).map(([key, values]) => [key, new Set(values.map(row => row.id))]));
  scoped.attachments = (rows.attachments || []).filter(row => ids[String(row.entityType)]?.has(String(row.entityId)));
  return scoped;
}

/**
 * Visibility filter of the pilots: a project that is switched off for the current pilot, and everything
 * hanging off it, is left out of the workspace. This is a view of the data, not a security boundary; the
 * server still returns every record the account may read.
 */
export function pilotScope(rows: Record<string, Row[]>, pilot?: string): Record<string, Row[]> {
  const projects = rows.projects || [];
  if (!pilot || projects.every(project => projectInPilot(project, pilot))) return rows;
  return narrowToProjects(rows, projects.filter(project => projectInPilot(project, pilot)));
}

/** Project sites are the main projects; projects are their numbered subprojects. */
export function projectScope(rows: Record<string, Row[]>, siteId: string): Record<string, Row[]> {
  if (!siteId) return rows;
  const scoped = narrowToProjects(rows, (rows.projects || []).filter(row => row.siteId === siteId), (rows.sites || []).filter(row => row.id === siteId));
  // Certificates and welding wires belong to one main project (older ones without one follow their linked projects).
  for (const [key, owned] of Object.entries(SITE_OWNED)) if (rows[key]) scoped[key] = rows[key].filter(row => inOwnerSite(key, row, siteId, { links: rows[owned.links], projects: rows.projects }));
  const kept = Object.fromEntries(Object.keys(SITE_OWNED).map(key => [key, new Set((scoped[key] || []).map(row => row.id))]));
  if (scoped.attachments) scoped.attachments = scoped.attachments.filter(row => !kept[String(row.entityType)] || kept[String(row.entityType)].has(String(row.entityId)));
  return scoped;
}
