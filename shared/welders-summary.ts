import { qualificationLabel } from './welder-data.ts';
import type { Row } from './types.ts';

/**
 * Welder's summary of one isometric (a generated part of the ISO Book and a document of its own): the welders who
 * worked on the isometric, their welds, and whether their qualification was valid on the date of each weld.
 */
export type QualificationStatus = 'Valid' | 'Expired' | 'Not yet valid' | 'No qualification' | 'No weld date';
export interface SummaryWeld { weld: Row; weldNo: string; date: string; wps: string; status: QualificationStatus; qualification: string; validUntil: string }
export interface SummaryWelder { welder: Row; label: string; welds: SummaryWeld[] }
export interface WeldersSummaryModel { iso: Row; project?: Row; welders: SummaryWelder[]; weldsWithoutWelder: number }

const text = (value: unknown) => String(value ?? '').trim();
const day = (value: unknown) => { const raw = text(value).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''; };
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/**
 * UNVERIFIED RULE (PARITY.md): the reference does not state what "valid at the weld date" compares. The simplest
 * explicit reading: a qualification (welder certificate) covers a date when `issuedAt <= date <= expiresAt`; an empty
 * bound is open. The welding process, position and range of the qualification are not compared.
 */
export function qualificationStatusAt(certificates: Row[], date: unknown): { status: QualificationStatus; covering: Row[] } {
  const at = day(date), live = certificates.filter(certificate => !certificate._archived);
  if (!at) return { status: 'No weld date', covering: [] };
  if (!live.length) return { status: 'No qualification', covering: [] };
  const covering = live.filter(certificate => (!day(certificate.issuedAt) || day(certificate.issuedAt) <= at) && (!day(certificate.expiresAt) || day(certificate.expiresAt) >= at));
  if (covering.length) return { status: 'Valid', covering };
  return { status: live.every(certificate => day(certificate.issuedAt) > at) ? 'Not yet valid' : 'Expired', covering: [] };
}

/** `rows` holds the records the account may read; welders it may not read are named by their id only. */
export function weldersSummaryModel(rows: Record<string, Row[] | undefined>, isoId: string): WeldersSummaryModel | null {
  const iso = (rows.isometrics || []).find(row => row.id === isoId && !row._archived);
  if (!iso) return null;
  const find = (key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
  const project = find('projects', iso.projectId);
  const byWelder = new Map<string, SummaryWelder>(); let without = 0;
  const welds = (rows.welds || []).filter(weld => !weld._archived && weld.isoId === isoId).sort((a, b) => natural(text(a.weldNo), text(b.weldNo)));
  for (const weld of welds) {
    const ids = [...new Set([1, 2, 3, 4].map(i => text(weld[`welder${i}Id`])).filter(Boolean))];
    if (!ids.length) { without++; continue; }
    for (const id of ids) {
      const welder = find('welders', id) ?? ({ id, number: '', name: '' } as unknown as Row);
      const entry = byWelder.get(id) ?? { welder, label: [text(welder.number), text(welder.name)].filter(Boolean).join(' | ') || 'Welder', welds: [] };
      const certificates = (rows.welder_certificates || []).filter(certificate => certificate.welderId === id);
      const { status, covering } = qualificationStatusAt(certificates, weld.date);
      const lookups = (certificate: Row) => ({ custom: find('welder_customs_catalog', certificate.customId), type: find('certificate_types', certificate.certificateTypeId), process: find('weld_processes', certificate.processId) });
      entry.welds.push({
        weld, weldNo: text(weld.weldNo), date: day(weld.date), wps: text(find('wps', weld.wpsId)?.name), status,
        qualification: covering.map(certificate => qualificationLabel(certificate, lookups(certificate))).join('; '),
        validUntil: covering.map(certificate => day(certificate.expiresAt)).filter(Boolean).sort().at(-1) ?? '',
      });
      byWelder.set(id, entry);
    }
  }
  return { iso, project, welders: [...byWelder.values()].sort((a, b) => natural(a.label, b.label)), weldsWithoutWelder: without };
}
