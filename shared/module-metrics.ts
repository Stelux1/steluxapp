import type { Row } from './types.ts';
export const active = (rows: Record<string, Row[]>, key: string) => (rows[key] || []).filter(r => !r._archived);
export function spoolLocations(rows: Record<string, Row[]>, projectId = '') {
  const isos = Object.fromEntries(active(rows, 'isometrics').map(i => [i.id, i]));
  return active(rows, 'spools').filter(s => isos[String(s.isoId)] && (!projectId || isos[String(s.isoId)].projectId === projectId)).map(spool => ({ spool, iso: isos[String(spool.isoId)], projectId: String(isos[String(spool.isoId)].projectId), locationType: spool.serviceCompanyId ? 'Service' : 'Laydown', locationId: String(spool.serviceCompanyId || spool.laydownId || ''), lastRequest: active(rows, 'service_requests').filter(r => r.spoolId === spool.id).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b._createdAt).localeCompare(String(a._createdAt)))[0] }));
}
export function minimumArticles(rows: Record<string, Row[]>, warehouseId = '') {
  const stock = active(rows, 'tool_stock');
  return active(rows, 'articles').map(article => ({ article, available: stock.filter(s => s.articleId === article.id && (!warehouseId || s.warehouseId === warehouseId)).reduce((n, s) => n + Number(s.quantity), 0) })).filter(a => a.available <= Number(a.article.minimal || 0));
}
export type WeldFilters = Record<string, string>;
export function weldingStats(rows: Record<string, Row[]>, filters: WeldFilters = {}, mode: 'length' | 'count' = 'length') {
  const isos = Object.fromEntries(active(rows, 'isometrics').map(i => [i.id, i]));
  const projects = Object.fromEntries(active(rows, 'projects').map(p => [p.id, p]));
  const diameters = Object.fromEntries(active(rows, 'diameters').map(d => [d.id, d]));
  const processes = Object.fromEntries(active(rows, 'ndt_processes').map(p => [p.id, p]));
  const requests = active(rows, 'inspection_requests');
  const welds = active(rows, 'welds').filter(w => {
    const iso = isos[String(w.isoId)]; const project = iso ? projects[String(iso.projectId)] : undefined; if (!iso || !project) return false;
    if (filters.from && (!w.date || String(w.date) < filters.from) || filters.to && (!w.date || String(w.date) > filters.to)) return false;
    if (filters.companyId && project.companyId !== filters.companyId || filters.projectId && iso.projectId !== filters.projectId || filters.typeId && w.typeId !== filters.typeId || filters.wpsId && w.wpsId !== filters.wpsId) return false;
    if (filters.welderId && ![w.welder1Id, w.welder2Id, w.welder3Id, w.welder4Id].includes(filters.welderId)) return false;
    for (const key of ['itpNo', 'testSystemId', 'pipingClass', 'irn', 'ped', 'material']) if (filters[key] && iso[key] !== filters[key]) return false;
    if (filters.ndtProcessId || filters.ndtGroupId) {
      const relevant = requests.filter(r => r.weldId === w.id);
      if (!relevant.some(r => (!filters.ndtProcessId || r.processId === filters.ndtProcessId) && (!filters.ndtGroupId || processes[String(r.processId)]?.groupId === filters.ndtGroupId))) return false;
    }
    return true;
  });
  const results = active(rows, 'inspection_results').filter(r => r.type === 'NDT');
  const weight = (w: Row) => mode === 'count' ? 1 : w.lengthMode === 'Length in mm' ? Number(w.dialen) || 0 : Number(diameters[String(w.diameterId)]?.outline) || 0;
  const total = welds.reduce((n, w) => n + weight(w), 0);
  const examined = welds.reduce((n, w) => { const lengths = results.filter(r => r.weldId === w.id).map(r => Number(r.examinedLength) || 0); return n + (mode === 'count' ? (lengths.length ? 1 : 0) : Math.min(weight(w), Math.max(0, ...lengths))); }, 0);
  const repaired = welds.filter(w => w.repair).reduce((n, w) => n + weight(w), 0);
  const types = active(rows, 'weld_types').map(type => ({name:String(type.name),value:welds.filter(w => w.typeId === type.id).reduce((n, w) => n + weight(w),0)})).filter(t=>t.value>0);
  return {welds,total,examined,repaired,types,unit:mode==='count'?'welds':'mm'};
}
