import { columns, lineHeight, spacer, type Block } from './engine.ts';
import type { PdfDocumentDefinition } from './documents.ts';
import { fileDay, fileSafe } from './links.ts';
import { LABEL_MARGIN, labelGeometry, type LabelGrid } from './weld-labels.ts';
import { isometricFacts, renderBlocks, selectWelds, weldFacts, type IsometricFacts, type WeldFacts } from './weld-cards.ts';
import type { Row } from '../../shared/types.ts';

/**
 * ISO Book part "Weld Label" (the reference's "Weld record", client change list 22.11.2026, image 8): one label per weld
 * of the isometric, in weld-number order, two columns of seven labels per A4 page. A label reads the weld number, the
 * ISO number, the spool and the main project, with a QR code of the weld's link: it opens the isometric page of that
 * weld (the same link as the weld cards and the Weld labels of the Reports menu). First version; the client details the
 * label later. The Reports menu keeps its own Weld labels document (server/pdf/weld-labels.ts) with its grid choice.
 */
export const BOOK_WELD_LABEL_GRID: LabelGrid = { columns: 2, rows: 7 };
/** What one label prints besides the weld facts. */
export interface WeldLabelContext extends IsometricFacts { mainProject: string }

const text = (value: unknown) => String(value ?? '').trim();
const find = (rows: Record<string, Row[]>, key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);

/** The isometric facts plus the main project (site) name; the project number when the site cannot be read. */
export function weldLabelContext(rows: Record<string, Row[]>, iso: Row): WeldLabelContext {
  const facts = isometricFacts(rows, iso), project = find(rows, 'projects', iso.projectId), site = find(rows, 'sites', project?.siteId);
  return { ...facts, mainProject: text(site?.name) || facts.project };
}

/** One label: weld number (large), ISO number, spool and main project beside the QR code. Empty values print a dash. */
export function bookWeldLabelBlock(weld: WeldFacts, context: WeldLabelContext, width: number, height: number): Block {
  const size = Math.min(9, Math.max(6, height / 11)), pad = Math.min(8, height / 10), qr = Math.min(height - 2 * pad, width * 0.38, 80);
  return {
    height: () => height,
    draw(canvas, x, y, w) {
      canvas.rect(x, y, w, height, { stroke: 0.75, lineWidth: 0.3 });
      const textLeft = x + pad + qr + 8, textWidth = w - 2 * pad - qr - 8, big = size * 1.8;
      const lines: [string, string][] = [['ISO', context.isoNo], ['Spool', weld.spool], ['Main project', context.mainProject]];
      const content = lineHeight(big) + lines.length * lineHeight(size) * 2;
      let top = y + Math.max(pad, (height - content) / 2);
      canvas.text(weld.weldNo || '-', textLeft, top, { size: big, font: 'bold', maxWidth: textWidth }); top += lineHeight(big);
      for (const [label, value] of lines) {
        canvas.text(label, textLeft, top, { size: size * 0.85, maxWidth: textWidth }); top += lineHeight(size);
        canvas.text(value || '-', textLeft, top, { size, font: 'bold', maxWidth: textWidth }); top += lineHeight(size);
      }
      canvas.qr(weld.url, x + pad, y + (height - qr) / 2, qr);
    },
  };
}

/** The label rows of a page grid, filled left to right; the last row is padded with empty cells. */
export function bookWeldLabelRows(welds: WeldFacts[], context: WeldLabelContext, grid: LabelGrid = BOOK_WELD_LABEL_GRID): Block[] {
  const geometry = labelGeometry(grid), rows: Block[] = [];
  for (let i = 0; i < welds.length; i += grid.columns) {
    const chunk = welds.slice(i, i + grid.columns);
    rows.push(columns(Array.from({ length: grid.columns }, (_, c) => ({ block: chunk[c] ? bookWeldLabelBlock(chunk[c], context, geometry.labelWidth, geometry.labelHeight) : spacer(geometry.labelHeight), width: { fill: 1 } })), 0));
  }
  return rows;
}

export function bookWeldLabelsPdf(input: { welds: WeldFacts[]; context: WeldLabelContext; generatedAt: Date }) {
  return renderBlocks({ page: { size: 'A4', orientation: 'portrait', margins: { top: LABEL_MARGIN, bottom: LABEL_MARGIN, left: LABEL_MARGIN, right: LABEL_MARGIN } }, title: `Weld Label - ${input.context.isoNo}`, generatedAt: input.generatedAt, blocks: bookWeldLabelRows(input.welds, input.context) });
}

/**
 * The generator of the part. It is no entry of PDF_DOCUMENTS (the Reports menu has its own Weld labels): the ISO Book
 * plans it directly (server/pdf/iso-book-parts.ts). Access: the export right of the weld cards report, as Weld labels.
 */
export const bookWeldLabelsDocument: PdfDocumentDefinition = {
  key: 'iso-book-weld-labels', title: 'Weld Label', report: 'weld-cards', bookPart: 'weld-labels',
  async build({ iso, rows, now, publicOrigin }) {
    const context = weldLabelContext(rows, iso), welds = selectWelds(rows, iso.id).map(weld => weldFacts(rows, weld, iso, publicOrigin));
    const { bytes } = await bookWeldLabelsPdf({ welds, context, generatedAt: now });
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(context.project, 'project')}-${fileSafe(context.isoNo, 'iso')}-weld-label` };
  },
};
