import { AppError } from '../store.ts';
import { phaseNumber } from '../../shared/material-db.ts';
import { box, GREY_FILL, GREY_LINE, labelValueGrid, spacer, stack, textBlock, type Block, type PageSetup, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { PdfDocumentDefinition } from './documents.ts';
import { fileDay, fileSafe, naturalCompare, printedNumber } from './links.ts';
import { currentRevision } from '../../shared/revisions.ts';
import { materialRecord } from '../../shared/materials.ts';
import type { Row } from '../../shared/types.ts';

/**
 * MTO report (MTO Pilot, isometric -> Materials -> Print): the material list of one isometric as
 * Group | Mat.no. | DIA | LBS/SCH | Description | Type | Qty. | UOM, for all operation phases (grouped by phase) or
 * for one, with the totals per unit of measure under the table.
 */
type Rows = Record<string, Row[]>;
const text = (value: unknown) => String(value ?? '').trim();

export interface MtoLine { group: string; materialNo: string; dia: string; lbs: string; description: string; phase: string; phaseSort: number; quantity: number; uom: string }
export interface UomTotal { uom: string; lines: number; quantity: number }
export interface MtoModel { iso: Row; project: Row | undefined; revision: string; phase: { id: string; name: string } | null; lines: MtoLine[]; totals: UomTotal[] }

/** `all` (or empty) for every phase, otherwise the id of an operation phase. */
export function mtoPhase(rows: Rows, value: string | undefined): { id: string; name: string } | null {
  const wanted = text(value);
  if (!wanted || wanted.toLowerCase() === 'all') return null;
  const phase = (rows.operation_phases || []).find(row => row.id === wanted && !row._archived);
  if (!phase) throw new AppError(422, 'Choose an operation phase or all phases.', { phase: 'Choose an operation phase or all phases.' });
  return { id: phase.id, name: text(phase.name) };
}

export function mtoModel(rows: Rows, iso: Row, phaseOption?: string): MtoModel {
  const phase = mtoPhase(rows, phaseOption), phases = new Map((rows.operation_phases || []).map(row => [row.id, row]));
  const lines = (rows.iso_materials || []).filter(row => !row._archived && row.isoId === iso.id && (!phase || row.phaseId === phase.id)).map((row): MtoLine => {
    const material = materialRecord(rows, row) || row, own = phases.get(String(row.phaseId));
    return { group: text(material.materialGroup), materialNo: text(material.materialNo), dia: text(material.dia), lbs: text(material.lbs), description: text(material.description), phase: text(own?.name), phaseSort: own ? phaseNumber(own) ?? 0 : 1e9, quantity: Number(row.quantity) || 0, uom: text(material.uom) };
  }).sort((a, b) => a.phaseSort - b.phaseSort || naturalCompare(a.phase, b.phase) || naturalCompare(a.group, b.group) || naturalCompare(a.materialNo, b.materialNo));
  const totals = new Map<string, UomTotal>();
  for (const line of lines) { const total = totals.get(line.uom) ?? { uom: line.uom, lines: 0, quantity: 0 }; total.lines++; total.quantity += line.quantity; totals.set(line.uom, total); }
  return { iso, project: (rows.projects || []).find(row => row.id === iso.projectId), revision: text(currentRevision(rows, iso.id, 'ISO') || iso.revNo), phase, lines, totals: [...totals.values()].sort((a, b) => naturalCompare(a.uom, b.uom)) };
}

/** Columns of the material table, in the order of the reference. */
export const MTO_COLUMNS: { header: string; width: number; align?: 'right' }[] = [
  { header: 'Group', width: 9 }, { header: 'Mat.no.', width: 12 }, { header: 'DIA', width: 6 }, { header: 'LBS/SCH', width: 8 }, { header: 'Description', width: 30 },
  { header: 'Type', width: 10 }, { header: 'Qty.', width: 7, align: 'right' }, { header: 'UOM', width: 6 },
];
export const mtoRowCells = (line: MtoLine) => [line.group, line.materialNo, line.dia, line.lbs, line.description, line.phase, printedNumber(line.quantity), line.uom];

/** Totals per UOM as a small table block ("UOM | Lines | Total quantity"), kept together on one page. */
function totalsBlock(totals: UomTotal[]): Block {
  const ROW = 12, widths = [60, 50, 80], head = ['UOM', 'Lines', 'Total quantity'];
  return {
    height: () => ROW * (totals.length + 2) + 4,
    draw(canvas, x, y) {
      canvas.text('Totals per UOM', x, y, { size: 8, font: 'bold' });
      const draw = (cells: string[], top: number, bold: boolean) => {
        let left = x;
        cells.forEach((cell, i) => { canvas.text(cell, i ? left + widths[i] - 4 : left + 3, top + 2, { size: 7, font: bold ? 'bold' : 'regular', align: i ? 'right' : 'left', maxWidth: widths[i] - 7 }); left += widths[i]; });
        canvas.line(x, top + ROW, x + widths.reduce((a, b) => a + b, 0), top + ROW, { width: 0.4, color: GREY_LINE });
      };
      draw(head, y + ROW + 2, true);
      totals.forEach((total, i) => draw([total.uom || '-', String(total.lines), printedNumber(total.quantity)], y + ROW * (i + 2) + 2, false));
    },
  };
}

export function mtoReportPdf(input: { model: MtoModel; generatedAt: Date }) {
  const { model } = input, iso = model.iso, project = model.project;
  const page: PageSetup = { size: 'A4', orientation: 'portrait', margins: { left: 24, right: 24 } };
  const title = `MTO report - ${text(iso.isoNo)}`;
  return renderDocument({
    page, title, generatedAt: input.generatedAt,
    layout() {
      const grid = labelValueGrid([
        { label: 'Project', value: text(project?.internnumber) }, { label: 'Iso number', value: `${text(iso.isoNo)}${model.revision ? ` Rev. ${model.revision}` : ''}` }, { label: 'Phase', value: model.phase?.name ?? 'All phases' },
        { label: 'Project description', value: text(project?.description) }, { label: 'Piping class', value: text(iso.pipingClass) }, { label: 'Drawing no.', value: text(iso.drawingNo) },
      ], { columns: 3, size: 7.5, labelShare: 0.42 });
      const header: Block = stack([textBlock('MTO report', { size: 13, font: 'bold' }), spacer(5), box(grid, { fill: GREY_FILL, stroke: GREY_LINE, padding: 4 }), spacer(6)]);
      const table: TableSpec = { columns: MTO_COLUMNS.map(column => ({ header: column.header, width: column.width, align: column.align })), rows: model.lines.map(mtoRowCells), size: 7, headerSize: 7, fit: 'wrap', padding: 2.5 };
      const after: Block[] = model.lines.length ? [totalsBlock(model.totals)] : [textBlock(model.phase ? `No materials in the phase ${model.phase.name}.` : 'No materials on this isometric.', { size: 8, font: 'italic' })];
      return { header, table, after };
    },
  });
}

export const mtoReportDocument: PdfDocumentDefinition = {
  key: 'mto-report', title: 'MTO report', report: 'mto',
  async build({ iso, rows, query, now }) {
    const model = mtoModel(rows, iso, query.phase), project = model.project;
    const { bytes } = await mtoReportPdf({ model, generatedAt: now });
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(project?.internnumber, 'project')}-${fileSafe(iso.isoNo, 'iso')}-MTO${model.phase ? `-${fileSafe(model.phase.name, 'phase')}` : ''}` };
  },
};
