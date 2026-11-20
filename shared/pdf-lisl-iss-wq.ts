import type { Row } from './types.ts';
import { ISS_NDT_STANDARDS, LISL_VT_SOURCES, LISL_VT_SOURCE_LEGACY } from './site-settings.ts';
import { lislModel, printDate, type LislEntry, type LislModel } from './pdf-lisl.ts';
import { NDT_FORM_COLUMNS, VT_COLUMN, ndtFormCells, ndtLookups, type NdtCell, type NdtFormColumn } from './pdf-ndt-columns.ts';

/**
 * Data side of the owner-specific LISL forms: [ISS] Inspection Summary Sheet and [WQ] / [WQ ver 2] Line
 * Inspection Status List. Layout lives in `server/pdf/lisl-iss.ts` and `server/pdf/lisl-wq.ts`.
 * Texts that name a third-party owner, an owner standard or a form / document number are read from the main
 * project's Document settings (`ownerSettings`) and are empty - and therefore not printed - when not set.
 */
const text = (value: unknown) => String(value ?? '').trim();
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** The owner-specific document settings of the main project ("Document settings" of the project site). */
export interface OwnerSettings {
  ownerName: string; ownerStandard: string;
  wqDocNo: string; wqVersion: string; wqDate: string;
  issDocTemplate: string; issSupplier: string; issTrain: string; issFluidService: string; issNdtStandard: string;
}
export const OWNER_SETTING_NAMES = ['ownerName', 'ownerStandard', 'wqDocNo', 'wqVersion', 'wqDate', 'issDocTemplate', 'issSupplier', 'issTrain', 'issFluidService', 'issNdtStandard'] as const;
export const ownerSettings = (site?: Row | null): OwnerSettings => Object.fromEntries(OWNER_SETTING_NAMES.map(name => [name, text(site?.[name])])) as unknown as OwnerSettings;

const find = (rows: Record<string, Row[]>, key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
/** Welder codes of a weld ("code | name" reduced to the code), joined with "/". */
const welderCodes = (entry: LislEntry) => [entry.values.Welder, entry.values['Welder 2'], entry.values['Welder 3'], entry.values['Welder 4']].map(value => (value ?? '').split(' | ')[0].trim()).filter(Boolean).join('/');
const lines = (...values: string[]) => values.filter(Boolean);
/** Inch size to nominal diameter DN (the usual pairs; a size without a pair has no DN). */
const DN_OF_INCH: Record<string, string> = { '0.5': '15', '0.75': '20', '1': '25', '1.25': '32', '1.5': '40', '2': '50', '2.5': '65', '3': '80', '4': '100', '5': '125', '6': '150', '8': '200', '10': '250', '12': '300', '14': '350', '16': '400', '18': '450', '20': '500', '24': '600', '28': '700', '30': '750', '32': '800', '36': '900', '40': '1000', '48': '1200' };
export const dnOfInch = (inch: unknown) => { const value = Number(text(inch)); return Number.isFinite(value) && value > 0 ? DN_OF_INCH[String(value)] ?? '' : ''; };

interface FormBase { base: LislModel; owner: OwnerSettings; rows: Record<string, Row[]> }
function formBase(rows: Record<string, Row[]>, isoId: string): FormBase | null {
  const base = lislModel(rows, isoId, 'All');
  return base ? { base, owner: ownerSettings(base.site), rows } : null;
}
const cellsOf = (columns: NdtFormColumn[], entry: LislEntry, rows: Record<string, Row[]>) => ndtFormCells(columns, entry.weld, ndtLookups(rows));

// ----- [ISS] ---------------------------------------------------------------------------------------------------
export const NDT_STANDARD_OPTIONS = ISS_NDT_STANDARDS;
export interface IssRow {
  weldNo: string; weldType: string;
  /** Material of each side. */
  description: string[]; diameter: string[]; certificate: string[]; wps: string[]; filler: string[]; welder: string[];
  /** Printed lines of each method column (key of `NDT_FORM_COLUMNS.iss`); a method without a result has none. */
  methods: Record<string, string[]>;
  comments: string;
}
export interface IssModel extends FormBase {
  drawingNo: string; spools: string; projectName: string; projectNo: string; itpNumbers: string; supplier: string; fluidService: string;
  /** The ticked NDT standard of the header (ASME or EN ISO), or ''. */
  ndtStandard: string;
  /** Percentage printed after "RT" etc. in the method headings; "VT" is always 100. */
  percent: Record<string, string>;
  welds: IssRow[];
}
/**
 * Edit project site → Document settings → "LISL ISS — VT source": `ndt` (default; also every site saved before the setting
 * existed) prints the VT column as it always did, `vt2` prints the report number of the weld's visual inspection report
 * (the newest VI result) and nothing else in that column.
 */
export const issVtSource = (site?: Row | null): 'ndt' | 'vt2' => [LISL_VT_SOURCES[1], LISL_VT_SOURCE_LEGACY].includes(text(site?.lislVtSource) as typeof LISL_VT_SOURCES[1]) ? 'vt2' : 'ndt';
/** The columns of [ISS] for a site: the standard set, with the VT column reading from the visual inspection report when the site says so. */
export const issVtColumns = (site?: Row | null): NdtFormColumn[] => issVtSource(site) === 'vt2' ? NDT_FORM_COLUMNS.iss.map(item => item.id === 'vt' ? { ...item, match: { VI: 'any' } } : item) : NDT_FORM_COLUMNS.iss;
export const issMethodLines =(cell: NdtCell | undefined): string[] => cell?.result ? lines(cell.result, cell.report, printDate(cell.date)) : [];
const percentOf = (value: unknown) => { const raw = text(value).replace('%', '').trim(); return /^\d+([.,]\d+)?$/.test(raw) ? raw.replace(',', '.') : ''; };

export function issModel(rows: Record<string, Row[]>, isoId: string, companyName = ''): IssModel | null {
  const form = formBase(rows, isoId);
  if (!form) return null;
  const { base, owner } = form, iso = base.iso; const issColumns = issVtColumns(base.site);
  const spools = [...new Set(base.entries.map(entry => text(find(rows, 'spools', entry.weld.spoolId)?.name)).filter(Boolean))].sort(natural).join(', ');
  const ndtStandard = NDT_STANDARD_OPTIONS.find(option => option === owner.issNdtStandard) ?? NDT_STANDARD_OPTIONS.find(option => text(iso.ndtnorm).toUpperCase().replace(/\s+/g, ' ').includes(option)) ?? '';
  const welds = base.entries.map((entry): IssRow => {
    const v = entry.values, wps = find(rows, 'wps', entry.weld.wpsId), pqr = find(rows, 'pqr', wps?.pqrId);
    const wires = [1, 2].map(side => find(rows, 'welding_wires', entry.weld[`wire${side}Id`])).map(wire => text(wire?.chargeNo) || text(find(rows, 'certifications', wire?.certificateId)?.chargeNo));
    const sides = [1, 2].map(side => ({ cert: entry.attest[side - 1], heat: v[`Charge No ${side}`] ?? '', wall: v[`Wall thickness ${side}`] ?? '', material: v[`Material ${side}`] ?? '' }));
    const methods = Object.fromEntries(Object.entries(cellsOf(issColumns, entry, rows)).map(([key, cell]) => [key, issMethodLines(cell)]));
    return {
      weldNo: text(entry.weld.weldNo), weldType: text(entry.weldType?.abbreviation || entry.weldType?.name),
      description: lines(...sides.map(side => side.material)),
      diameter: lines(v['Diameter (inch)'] ? `${v['Diameter (inch)']}"` : '', ...sides.map(side => side.wall)),
      certificate: lines(...sides.flatMap(side => [side.cert, side.heat])),
      wps: lines(v['WPS No'] ?? '', text(pqr?.name)),
      filler: lines(...wires),
      welder: lines(welderCodes(entry), printDate(v['Weld date'])),
      methods, comments: text(entry.weld.description),
    };
  });
  return {
    ...form,
    drawingNo: text(iso.drawingNo) || text(iso.isoNo), spools, projectName: text(base.project?.description), projectNo: text(base.project?.internnumber),
    itpNumbers: [text(iso.itpNo), text(iso.itpNo2)].filter(Boolean).join(', '),
    supplier: owner.issSupplier || companyName,
    fluidService: [owner.issFluidService, text(iso.ped)].filter(Boolean).join(' / '),
    ndtStandard, percent: { vt: '100', rt: percentOf(iso.xRay) }, welds,
  };
}

// ----- [WQ] / [WQ ver 2] ------------------------------------------------------------------------------------------
export interface WqRow {
  weldNo: string; heat: string[]; dn: string; wall: string[]; material: string; coating: string; description: string[]; pos: string[];
  welder: string; wps: string; km: string; /** Insertion length of side 1 and 2 (weld entry). */ installed: string[]; vt: string; weldCoating: string; sleeve: string;
  /** `A` / `NA` and the report number per NDT pair (key of `NDT_FORM_COLUMNS.wq`). */
  ndt: Record<string, { result: string; report: string }>;
}
export interface WqModel extends FormBase {
  drawingNo: string; assetTag: string; diameter: string; installationNo: string; projectNo: string;
  /** Visual inspection report numbers of the isometric's welds (the [WQ] header line). */
  visualReports: string;
  welds: WqRow[];
}
export function wqModel(rows: Record<string, Row[]>, isoId: string): WqModel | null {
  const form = formBase(rows, isoId);
  if (!form) return null;
  const { base } = form, iso = base.iso;
  const vtOf = (entry: LislEntry) => cellsOf([VT_COLUMN], entry, rows)[VT_COLUMN.id]?.report ?? '';
  const welds = base.entries.map((entry): WqRow => {
    const v = entry.values, cells = cellsOf(NDT_FORM_COLUMNS.wq, entry, rows);
    const coating = find(rows, 'coatings', entry.weld.coatingWeldId);
    return {
      weldNo: text(entry.weld.weldNo), heat: lines(v['Charge No 1'] ?? '', v['Charge No 2'] ?? ''), dn: dnOfInch(v['Diameter (inch)']),
      wall: lines(v['Wall thickness 1'] ?? '', v['Wall thickness 2'] ?? ''), material: text(iso.material), coating: v['Coating 1'] ?? '',
      description: [1, 2].map(side => lines(v[`Article no ${side}`] ?? '', v[`Material ${side}`] ?? '').join(' ')).filter(Boolean),
      pos: lines(v['Pos 1'] ?? '', v['Pos 2'] ?? ''), welder: welderCodes(entry), wps: v['WPS No'] ?? '',
      km: text(entry.weld.kr) || text(entry.weld.fp), installed: lines(text(entry.weld.insLength), text(entry.weld.insLength2)), vt: vtOf(entry), weldCoating: text(coating?.name), sleeve: text(entry.weld.sleeve),
      ndt: Object.fromEntries(Object.entries(cells).map(([key, cell]) => [key, { result: cell.result, report: cell.report }])),
    };
  });
  const visualReports = [...new Set(base.entries.map(vtOf).filter(Boolean))].sort(natural).join(', ');
  return { ...form, drawingNo: text(iso.drawingNo) || text(iso.isoNo), assetTag: text(iso.assetTag), diameter: text(iso.nomDiameter) || [...new Set(welds.map(weld => weld.dn).filter(Boolean))].sort(natural).map(dn => `DN${dn}`).join(', '), installationNo: text(iso.irn), projectNo: text(base.project?.externnumber) || text(base.project?.internnumber), visualReports, welds };
}
