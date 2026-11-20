import { materialRecord } from './materials.ts';
import type { Row } from './types.ts';
import { CUT_LIST_FITS, fitField, lineLengths, sortLines } from './cut-list.ts';
/** Planning resources (estimation). The hosted preparation derives every table from RESOURCES (server/hosted-schema.ts), so this list no longer decides which tables exist. */
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

/**
 * Cut list lines with their cut length: a line with a total length is worked out with the fitting catalog as it is now
 * (shared/cut-list.ts), an earlier line keeps its entered cut length. Total = pieces × cut length. Lines in line-number order.
 */
export function cutListEntries(rows: Record<string, Row[]>, isoIds?: Set<string>) {
  const isos = new Map(active(rows, 'isometrics').map(row => [row.id, row]));
  const requirements = new Map(active(rows, 'iso_materials').map(row => [row.id, row]));
  const fittings = new Map((rows.cut_fittings || []).map(row => [row.id, row]));
  return sortLines(active(rows, 'cut_list').filter(line => isos.has(String(line.isoId)) && (!isoIds || isoIds.has(String(line.isoId))))).map(line => {
    const requirement = line.requirementId ? requirements.get(String(line.requirementId)) : undefined;
    const lengths = lineLengths(line, fittings), quantity = number(line.quantity) ?? 1;
    return { line, iso: isos.get(String(line.isoId))!, material: requirement ? materialRecord(rows, requirement) : undefined, fittings: CUT_LIST_FITS.map(slot => fittings.get(String(line[fitField(slot)] ?? ''))),
      ...lengths, quantity, totalMm: round(quantity * lengths.length) };
  });
}
