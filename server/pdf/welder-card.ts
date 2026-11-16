import { box, GREY_FILL, GREY_LINE, spacer, stack, textBlock, type Block, type PageSetup, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { PdfScopedDefinition } from './documents.ts';
import { AppError } from '../store.ts';
import { fileDay, fileSafe } from './links.ts';
import { welderCardModel } from '../../shared/welder-data.ts';
import type { Row } from '../../shared/types.ts';

/**
 * Welder card (Weld Pilot, Welder data, Welders, Welder card, "Print"): the welder's card lines as
 * # | Welding wire | Weld process | Diameter | Thickness | BW/FW | POS | ASME/EN | WQ No.
 *   GET /api/pdf/welder-card?welderId=...
 */
type Rows = Record<string, Row[]>;
const WIDTHS = [4, 12, 10, 14, 12, 8, 24, 8, 8];

export async function welderCardPdf(rows: Rows, welderId: string, generatedAt: Date) {
  const model = welderCardModel(rows, welderId);
  if (!model) throw new AppError(404, 'This welder could not be found.');
  const page: PageSetup = { size: 'A4', orientation: 'landscape', margins: { left: 24, right: 24 } };
  const { bytes } = await renderDocument({
    page, title: 'Welder card', generatedAt,
    layout() {
      const header: Block = stack([textBlock('Welder card', { size: 13, font: 'bold' }), spacer(5), box(textBlock(model.heading, { size: 9 }), { fill: GREY_FILL, stroke: GREY_LINE, padding: 4 }), spacer(6)]);
      const table: TableSpec = { columns: model.columns.map((header, index) => ({ header, width: WIDTHS[index] ?? 8 })), rows: model.lines.map(line => line.cells), size: 7.5, headerSize: 7.5, fit: 'wrap', padding: 2.5 };
      return { header, table, after: model.lines.length ? [] : [textBlock('This welder has no card lines.', { size: 8, font: 'italic' })] };
    },
  });
  return { bytes, model };
}

export const welderCardDocument: PdfScopedDefinition = {
  key: 'welder-card', title: 'Welder card', report: 'pdf-welder-card', scope: 'scoped',
  async build({ rows, query, now }) {
    const { bytes, model } = await welderCardPdf(rows, String(query.welderId ?? ''), now);
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(model.welder.welderCode || model.welder.number, 'welder')}-welder-card` };
  },
};
