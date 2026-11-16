import { PDFDocument } from 'pdf-lib';
import type { CompanyForDocuments } from './company.ts';
import { A4_LANDSCAPE, A4_PORTRAIT, documentHeader, noteBlock, plainTable, renderOperational, signatureBlock, type Step } from './operational-blocks.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { projectItems } from '../../shared/pdf-documents.ts';
import { BLANK_PUNCH_COLUMNS, BLANK_PUNCH_ROWS, FLANGE_PDF_COLUMNS, PICKLIST_COLUMNS, blankPunchHeader, punchColumns, punchRowCells, type FlangeReportModel, type PickListModel, type PunchListModel } from '../../shared/pdf-lists.ts';
import type { Row } from '../../shared/types.ts';
import type { ReservedLine } from '../../shared/mto-logistics.ts';
import { flangeAssetTag, flangePath, type FlangeItem } from '../../shared/flanges.ts';
import { columns, lineHeight, spacer, type Block } from './engine.ts';
import { DEFAULT_LABEL_GRID, LABEL_MARGIN, labelGeometry, type LabelGrid } from './weld-labels.ts';
import { renderBlocks } from './weld-cards.ts';
import { loadUploaded } from './iso-book.ts';

const text = (value: unknown) => String(value ?? '').trim();
type Rows = Record<string, Row[]>;
interface Common { company: CompanyForDocuments | null; generatedAt: Date; rows: Rows }

export interface PunchPdfInput extends Common {
  model: PunchListModel;
  /** The imported isometric drawing of each isometric of `model.drawings` (bytes null when the isometric has no readable file). */
  drawings?: { iso: string; bytes: Uint8Array | null }[];
}
/**
 * Punch list (filled): the items the page shows under its filters (or the ticked ones), landscape. With the isometric drawing option the
 * drawing PDF of each listed isometric follows the list, one after the other; an isometric without a readable drawing is named in the list.
 */
export async function punchPdf(input: PunchPdfInput): Promise<{ bytes: Uint8Array; layout: Awaited<ReturnType<typeof renderOperational>>['layout'] }> {
  const { model, company } = input, documents = model.options.documents;
  const loaded = await Promise.all((input.drawings ?? []).map(async drawing => ({ iso: drawing.iso, result: drawing.bytes ? await loadUploaded(`ISO ${drawing.iso}`, drawing.bytes) : { skipped: 'No drawing file is uploaded.' } })));
  const list = await renderOperational({
    page: A4_LANDSCAPE, title: 'Punch list', generatedAt: input.generatedAt,
    async layout(pdf) {
      const kpis = model.kpis.map(card => `${card.label} ${card.count}`).join('  -  ');
      const header = await documentHeader(pdf, { title: 'Punch list', subtitle: `${model.filters.length ? model.filters.join(' - ') : 'All punch items'} - ${model.lines.length} item${model.lines.length === 1 ? '' : 's'}`, company, left: projectItems(model.context, input.rows).filter(item => item.value && item.label !== 'Isometrics'), box: [{ label: 'Key figures', value: kpis }], boxColumns: 1 });
      const widths = documents ? [4, 9, 9, 4, 28, 8, 12, 7, 17, 9] : [4, 10, 10, 4, 34, 8, 14, 8, 10];
      const steps: Step[] = [{ table: plainTable(punchColumns(documents), widths, model.lines.map(line => punchRowCells(line, documents)), { size: 6.5, headerSize: 6.5, maxLines: 4 }) }];
      if (!model.lines.length) steps.push({ block: noteBlock('', 'No punch items match these filters.'), before: 6 });
      if (loaded.length) steps.push({ table: plainTable(['Isometric', 'Drawing'], [10, 30], loaded.map(({ iso, result }) => [iso, 'unit' in result ? `Appended, ${result.unit.pages} page${result.unit.pages === 1 ? '' : 's'}` : `Not included: ${result.skipped}`]), { size: 7, headerSize: 7 }), before: 8 });
      return { header, steps };
    },
  });
  const units = loaded.flatMap(entry => 'unit' in entry.result ? [entry.result.unit] : []);
  if (!units.length) return list;
  const out = await PDFDocument.load(list.bytes);
  for (const unit of units) for (const page of await out.copyPages(unit.doc, unit.doc.getPageIndices())) out.addPage(page);
  return { bytes: await out.save(), layout: list.layout };
}

export interface BlankPunchPdfInput extends Common { iso: Row }
/** Punch list - blank: the header of an isometric and empty rows for the items, with room for the sign-off. */
export function blankPunchPdf(input: BlankPunchPdfInput) {
  const { company } = input, head = blankPunchHeader(input.rows, input.iso);
  return renderOperational({
    page: A4_PORTRAIT, title: `Punch list - blank ${text(input.iso.isoNo)}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, { title: 'Punch list - blank', subtitle: `ISO ${text(input.iso.isoNo)}`, company, left: head.items.slice(0, 5), box: head.items.slice(5) , boxColumns: 2 });
      const rows = Array.from({ length: BLANK_PUNCH_ROWS }, () => BLANK_PUNCH_COLUMNS.map(() => ['', '']));
      return { header, steps: [{ table: plainTable(BLANK_PUNCH_COLUMNS, [4, 6, 30, 8, 14, 9, 14], rows, { size: 7, headerSize: 7, fit: 'truncate', minLines: 2 }) }] };
    },
  });
}

export interface FlangePdfInput extends Common { model: FlangeReportModel }
/** Flange report: the flange table with the tightening values and the inspection result, landscape. */
export function flangePdf(input: FlangePdfInput) {
  const { model, company } = input, project = model.context.project;
  const scope = model.context.isometrics.length === 1 ? `ISO ${text(model.context.isometrics[0].isoNo)}` : `Project ${text(project?.internnumber)}`;
  return renderOperational({
    page: A4_LANDSCAPE, title: `Flange report ${scope}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, { title: 'Flange report', subtitle: `${scope} - ${model.items.length} flange${model.items.length === 1 ? '' : 's'}`, company, left: projectItems(model.context, input.rows).filter(item => item.value && item.label !== 'Isometrics'),
        box: [{ label: 'Tightening standard', value: model.standard }, { label: 'Flange procedure No.', value: model.procedureNo }, { label: 'Finished', value: model.options.finished || 'All' }] });
      const steps: Step[] = [{ table: plainTable(FLANGE_PDF_COLUMNS.map(column => column.header), FLANGE_PDF_COLUMNS.map(column => column.width), model.items.map(item => FLANGE_PDF_COLUMNS.map(column => column.cell(item))), { size: 6, headerSize: 6, maxLines: 2 }) }];
      if (!model.items.length) steps.push({ block: noteBlock('', 'No flanges match this selection.'), before: 6 });
      steps.push({ block: signatureBlock([{ title: 'Operator' }, { title: 'Inspector' }, { title: 'Client representative' }], 3), before: 12 });
      return { header, steps };
    },
  });
}

/** One flange label: isometric, flange ID, asset tag and size, with a QR code of the flange's page. */
export function flangeLabelBlock(item: FlangeItem, link: string, width: number, height: number): Block {
  const size = Math.min(9, Math.max(5, height / 9)), pad = Math.min(5, height / 12), qr = Math.min(height - 2 * pad, width * 0.4, 72);
  return {
    height: () => height,
    draw(canvas, x, y, w) {
      canvas.rect(x, y, w, height, { stroke: 0.75, lineWidth: 0.3 });
      const textLeft = x + pad + qr + 7, textWidth = w - 2 * pad - qr - 7, big = size * 1.7;
      const content = lineHeight(size) * 3 + lineHeight(big); let top = y + Math.max(pad, (height - content) / 2);
      canvas.text(item.isoNo, textLeft, top, { size, font: 'bold', maxWidth: textWidth }); top += lineHeight(size);
      canvas.text(text(item.row.flange_id) || 'No flange ID', textLeft, top, { size: big, font: 'bold', maxWidth: textWidth }); top += lineHeight(big);
      canvas.text(flangeAssetTag(item.row), textLeft, top, { size, maxWidth: textWidth }); top += lineHeight(size);
      canvas.text([item.row.flange_size, item.row.flange_rating].map(text).filter(Boolean).join(' / '), textLeft, top, { size, maxWidth: textWidth });
      canvas.qr(link, x + pad, y + (height - qr) / 2, qr);
    },
  };
}
export interface FlangeLabelsPdfInput { items: FlangeItem[]; origin?: string; grid?: LabelGrid; generatedAt: Date }
/** The text a flange QR code encodes: the flange page of the app, with the public origin when one is configured. */
export const flangeLabelLink = (origin: string | undefined, id: string) => `${/^https?:\/\/[^/\s]+$/i.test(String(origin ?? '').trim().replace(/\/+$/, '')) ? String(origin).trim().replace(/\/+$/, '') : ''}${flangePath(id)}`;
/** Flange labels: the ticked flanges in a grid of labels per A4 sheet (default 3 x 8), like the weld labels. */
export function flangeLabelsPdf(input: FlangeLabelsPdfInput) {
  const grid = input.grid ?? DEFAULT_LABEL_GRID, geometry = labelGeometry(grid), rows: Block[] = [];
  for (let i = 0; i < input.items.length; i += grid.columns) {
    const chunk = input.items.slice(i, i + grid.columns);
    rows.push(columns(Array.from({ length: grid.columns }, (_, c) => ({ block: chunk[c] ? flangeLabelBlock(chunk[c], flangeLabelLink(input.origin, chunk[c].row.id), geometry.labelWidth, geometry.labelHeight) : spacer(geometry.labelHeight), width: { fill: 1 } })), 0));
  }
  return renderBlocks({ page: { size: 'A4', orientation: 'portrait', margins: { top: LABEL_MARGIN, bottom: LABEL_MARGIN, left: LABEL_MARGIN, right: LABEL_MARGIN } }, title: 'Flange labels', generatedAt: input.generatedAt, blocks: rows });
}

export interface ReservedMaterialsPdfInput extends Common { lines: ReservedLine[]; grouped: boolean }
/** Reserved materials (Isometric execution → Reserved materials → Print): per reservation, or one line per material when grouped. */
export function reservedMaterialsPdf(input: ReservedMaterialsPdfInput) {
  const { company, lines, grouped } = input;
  const amount = (value: number) => String(Math.round(value * 1000) / 1000);
  return renderOperational({
    page: A4_PORTRAIT, title: 'Reserved materials', generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, { title: 'Reserved materials', subtitle: `${grouped ? 'Grouped by materials' : 'Per isometric'} - ${lines.length} line${lines.length === 1 ? '' : 's'}`, company, left: [] });
      const table = grouped
        ? plainTable(['Material no.', 'Description', 'Quantity', 'UOM'], [14, 40, 8, 6], lines.map(line => [line.materialNo, line.description, amount(line.quantity), line.uom]), { size: 7, headerSize: 7 })
        : plainTable(['Project', 'ISO', 'Material no.', 'Description', 'Quantity', 'UOM'], [10, 9, 12, 31, 7, 5], lines.map(line => [line.project, line.isoNo, line.materialNo, line.description, amount(line.quantity), line.uom]), { size: 7, headerSize: 7 });
      const steps: Step[] = [{ table }];
      if (!lines.length) steps.push({ block: noteBlock('', 'No materials are reserved.'), before: 6 });
      return { header, steps };
    },
  });
}

export interface PickListPdfInput extends Common { model: PickListModel }
/** Pick list: the material lines of one report with the "taken by" signature line. */
export function pickListPdf(input: PickListPdfInput) {
  const { model, company } = input, report = model.report;
  return renderOperational({
    page: A4_PORTRAIT, title: `Pick list ${report.reportNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = [{ label: 'Report no.', value: report.reportNo }, { label: 'Date', value: printDate(report.date) }, { label: 'Taken', value: model.taken ? 'Yes' : 'No' }];
      const header = await documentHeader(pdf, { title: 'Pick list', subtitle: `Report ${report.reportNo}`, company, left: projectItems(model.context, input.rows), box });
      return {
        header,
        steps: [
          { table: plainTable(PICKLIST_COLUMNS, [8, 10, 26, 6, 7, 7, 5, 11], model.lines, { size: 7, headerSize: 7 }) },
          { block: signatureBlock([{ title: 'Taken by' }, { title: 'Issued by' }], 2), before: 14 },
        ],
      };
    },
  });
}
