import type { Row } from './types.ts';

/** Project sites are the main projects; projects are their numbered subprojects. */
export function projectScope(rows: Record<string, Row[]>, siteId: string): Record<string, Row[]> {
  if (!siteId) return rows;
  const scoped = { ...rows };
  scoped.sites = (rows.sites || []).filter(row => row.id === siteId);
  scoped.projects = (rows.projects || []).filter(row => row.siteId === siteId);
  const projects = new Set(scoped.projects.map(row => row.id));
  scoped.isometrics = (rows.isometrics || []).filter(row => projects.has(String(row.projectId)));
  const isos = new Set(scoped.isometrics.map(row => row.id));
  for (const key of ['welds', 'spools', 'revisions', 'iso_materials', 'calculation_lines', 'cut_list', 'releases', 'punchlists', 'flanges']) scoped[key] = (rows[key] || []).filter(row => isos.has(String(row.isoId)));
  const welds = new Set(scoped.welds.map(row => row.id));
  for (const key of ['inspection_requests', 'inspection_results', 'repairs']) scoped[key] = (rows[key] || []).filter(row => welds.has(String(row.weldId)));
  scoped.test_systems = (rows.test_systems || []).filter(row => !row.projectId || projects.has(String(row.projectId)));
  const ids = Object.fromEntries(Object.entries(scoped).map(([key, values]) => [key, new Set(values.map(row => row.id))]));
  scoped.attachments = (rows.attachments || []).filter(row => ids[String(row.entityType)]?.has(String(row.entityId)));
  return scoped;
}
