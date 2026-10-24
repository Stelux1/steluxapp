import { materialIdentity,orderProjectIds } from './materials.ts';
import type { Row } from './types.ts';
export const percent = (part: number, total: number) => total ? Math.min(100, Math.round(part / total * 100)) : 0;
export function summary(rows: Record<string, Row[]>, projectId = '', from = '', to = '') {
  const list = (key: string) => (rows[key] || []).filter(r => !r._archived);
  const projects = list('projects').filter(p => !projectId || p.id === projectId);
  const projectIds = new Set(projects.map(p => p.id));
  const isos = list('isometrics').filter(i => projectIds.has(String(i.projectId)));
  const isoIds = new Set(isos.map(i => i.id));
  const welds = list('welds').filter(w => isoIds.has(String(w.isoId)) && (!from || String(w.date) >= from) && (!to || String(w.date) <= to));
  const weldIds = new Set(welds.map(w => w.id));
  const diameters = Object.fromEntries(list('diameters').map(r => [r.id, Number(r.outline) || 0]));
  const lengthOf = (w: Row) => w.lengthMode === 'Length in mm' ? Number(w.dialen) || 0 : diameters[String(w.diameterId)] || 0;
  const inspections = list('inspection_results').filter(r => weldIds.has(String(r.weldId)) && r.type === 'NDT');
  const examined = new Map<string, number>();
  for (const result of inspections) examined.set(String(result.weldId), Math.max(examined.get(String(result.weldId)) || 0, Number(result.examinedLength) || 0));
  const totalLength = welds.reduce((s, w) => s + lengthOf(w), 0);
  const examinedLength = welds.reduce((s, w) => s + Math.min(lengthOf(w), examined.get(w.id) || 0), 0);
  const repairedLength = welds.filter(w => w.repair).reduce((s, w) => s + lengthOf(w), 0);
  const requests = list('inspection_requests').filter(r => weldIds.has(String(r.weldId)));
  const orders = list('orders').filter(o => !projectId || orderProjectIds(rows,o.id).includes(projectId));
  const rentals = list('rentals');
  const outstandingRentals = rentals.filter(r => ['Rented', 'Partially returned'].includes(String(r.status)));
  const lowTools = list('articles').filter(a => list('tool_stock').filter(s => s.articleId === a.id).reduce((s, r) => s + Number(r.quantity), 0) <= Number(a.minimal || 0));
  const materialProgress = (isoId: string) => {
    const required = list('iso_materials').filter(r => r.isoId === isoId);
    if (!required.length) return 0;
    const grouped = new Map<string, number>(); required.forEach(r => grouped.set(materialIdentity(r), (grouped.get(materialIdentity(r)) || 0) + Number(r.quantity)));
    return Math.round([...grouped.entries()].reduce((sum, [materialId, amount]) => sum + Math.min(1, list('picklists').filter(p => p.isoId === isoId && materialIdentity(p) === materialId).reduce((s, p) => s + Number(p.quantity), 0) / amount), 0) / grouped.size * 100);
  };
  return {
    projects, isos, welds, orders, outstandingRentals, lowTools,
    activeProjects: projects.filter(p => p.status === 'Active').length,
    completedWelds: welds.filter(w => w.date).length,
    openInspections: requests.filter(r => r.status === 'Open').length,
    rejectedInspections: requests.filter(r => r.status === 'Rejected').length,
    pendingOrders: orders.filter(o => ['Pending', 'Partially received'].includes(String(o.status))).length,
    totalLength, examinedLength, repairedLength,
    examinedPercent: percent(examinedLength, totalLength), repairPercent: percent(repairedLength, totalLength),
    byProject: projects.map(p => { const projectIsos = isos.filter(i => i.projectId === p.id); const ids = new Set(projectIsos.map(i => i.id)); const ws = list('welds').filter(w => ids.has(String(w.isoId))); return { project: p, isometrics: projectIsos.length, welds: ws.length, completed: ws.filter(w => w.date).length, weldProgress: percent(ws.filter(w => w.date).length, ws.length), materialProgress: projectIsos.length ? Math.round(projectIsos.reduce((s, i) => s + materialProgress(i.id), 0) / projectIsos.length) : 0 }; }),
    materialsRequired: list('iso_materials').filter(r => isoIds.has(String(r.isoId))).length,
    stockQuantity: list('stock').reduce((s, r) => s + Number(r.quantity), 0),
    availableTools: list('tool_stock').reduce((s, r) => s + Number(r.quantity), 0),
    overdueRentals: outstandingRentals.filter(r => r.dueDate && String(r.dueDate) < new Date().toISOString().slice(0, 10)).length
  };
}
