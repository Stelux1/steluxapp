import { materialRecord } from './materials.ts';
import type { Row } from './types.ts';
export const PLANNING_RESOURCES = ['calculation_norms', 'calculation_lines', 'cut_list'];

const active = (rows: Record<string, Row[]>, key: string) => (rows[key] || []).filter(row => !row._archived);
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const number = (value: unknown): number | null => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

export function calculationEntries(rows: Record<string, Row[]>, isoIds?: Set<string>) {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  const norms = new Map(active(rows, 'calculation_norms').map(row => [row.id, row]));
  const requirements = new Map(active(rows, 'iso_materials').map(row => [row.id, row]));
  return active(rows, 'calculation_lines').filter(line => isos.has(String(line.isoId)) && (!isoIds || isoIds.has(String(line.isoId)))).map(line => {
    const requirement = requirements.get(String(line.requirementId)), norm = norms.get(String(line.normId));
    const material = requirement ? materialRecord(rows, requirement) : undefined;
    const quantity = number(line.requirementId ? requirement?.quantity : line.quantity);
    const hoursPerUnit = number(norm?.hoursPerUnit);
    const uom = String(norm?.uom || '');
    const status = !norm ? 'Norm unavailable' : line.requirementId && (!requirement || requirement.isoId !== line.isoId) ? 'MTO unavailable' : requirement && String(material?.uom || '').trim().toLowerCase() !== uom.trim().toLowerCase() ? 'Unit mismatch' : quantity === null || quantity < 0 ? 'Quantity missing' : hoursPerUnit === null || hoursPerUnit < 0 || !Number.isFinite(quantity * hoursPerUnit) ? 'Norm incomplete' : 'Ready';
    return { line, iso: isos.get(String(line.isoId))!, requirement, material, norm, quantity, uom, hoursPerUnit, hours: status === 'Ready' ? round(quantity! * hoursPerUnit!) : null, status };
  });
}

export function cutListEntries(rows: Record<string, Row[]>, isoIds?: Set<string>) {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  return active(rows, 'cut_list').filter(line => isos.has(String(line.isoId)) && (!isoIds || isoIds.has(String(line.isoId)))).map(line => {
    const requirement = active(rows, 'iso_materials').find(row => row.id === line.requirementId);
    return { line, iso: isos.get(String(line.isoId))!, material: requirement ? materialRecord(rows, requirement) : undefined,
      totalMm: round(Number(line.quantity) * Number(line.lengthMm)) };
  });
}
