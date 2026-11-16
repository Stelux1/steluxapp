import { AppError } from '../store.ts';
import { FOOTER_HEIGHT, columns, lineHeight, spacer, type Block } from './engine.ts';
import type { PdfDocumentDefinition } from './documents.ts';
import { fileDay, fileSafe } from './links.ts';
import { isometricFacts, renderBlocks, selectWelds, weldFacts, type IsometricFacts, type WeldFacts } from './weld-cards.ts';

/**
 * Weld labels (Weld Pilot, isometric -> Reports -> "Weld labels"): small labels in a grid of columns x rows per
 * A4 sheet (default 3 x 8), each with the isometric, weld number, type, diameter and a QR code of the weld's URL.
 */
export const LABEL_MARGIN = 14;
export const DEFAULT_LABEL_GRID = { columns: 3, rows: 8 } as const;
export const LABEL_LIMITS = { columns: [1, 6], rows: [1, 20] } as const;
export interface LabelGrid { columns: number; rows: number }
export interface LabelGeometry extends LabelGrid { labelWidth: number; labelHeight: number; left: number; top: number }

export function labelGeometry(grid: LabelGrid, pageWidth = 595.28, pageHeight = 841.89): LabelGeometry {
  const available = pageHeight - 2 * LABEL_MARGIN - FOOTER_HEIGHT;
  return { ...grid, labelWidth: (pageWidth - 2 * LABEL_MARGIN) / grid.columns, labelHeight: Math.floor(available / grid.rows), left: LABEL_MARGIN, top: LABEL_MARGIN };
}

/** The grid from the query (`columns`, `rows`), defaults 3 x 8; a whole number inside the limits is required. */
export function labelGrid(query: Record<string, string>): LabelGrid {
  const read = (name: 'columns' | 'rows'): number => {
    const raw = (query[name] ?? '').trim();
    if (!raw) return DEFAULT_LABEL_GRID[name];
    const [min, max] = LABEL_LIMITS[name], value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new AppError(422, `Choose ${min} to ${max} ${name}.`, { [name]: `Choose ${min} to ${max} ${name}.` });
    return value;
  };
  return { columns: read('columns'), rows: read('rows') };
}

/** Text size of a label, from its height. */
const labelFont = (height: number) => Math.min(9, Math.max(5, height / 9));

export function weldLabelBlock(weld: WeldFacts, iso: IsometricFacts, width: number, height: number): Block {
  const size = labelFont(height), pad = Math.min(5, height / 12), qr = Math.min(height - 2 * pad, width * 0.4, 72);
  return {
    height: () => height,
    draw(canvas, x, y, w) {
      canvas.rect(x, y, w, height, { stroke: 0.75, lineWidth: 0.3 });
      const textLeft = x + pad + qr + 7, textWidth = w - 2 * pad - qr - 7, big = size * 1.7;
      const content = lineHeight(size) * 3 + lineHeight(big), top0 = y + Math.max(pad, (height - content) / 2);
      let top = top0;
      canvas.text(iso.isoNo, textLeft, top, { size, font: 'bold', maxWidth: textWidth }); top += lineHeight(size);
      canvas.text(weld.weldNo, textLeft, top, { size: big, font: 'bold', maxWidth: textWidth }); top += lineHeight(big);
      canvas.text(weld.typeShort, textLeft, top, { size, maxWidth: textWidth }); top += lineHeight(size);
      canvas.text(weld.diameter, textLeft, top, { size, maxWidth: textWidth });
      canvas.qr(weld.url, x + pad, y + (height - qr) / 2, qr);
    },
  };
}

export function labelRows(welds: WeldFacts[], iso: IsometricFacts, grid: LabelGrid): Block[] {
  const geometry = labelGeometry(grid), rows: Block[] = [];
  for (let i = 0; i < welds.length; i += grid.columns) {
    const chunk = welds.slice(i, i + grid.columns);
    rows.push(columns(Array.from({ length: grid.columns }, (_, c) => ({ block: chunk[c] ? weldLabelBlock(chunk[c], iso, geometry.labelWidth, geometry.labelHeight) : spacer(geometry.labelHeight), width: { fill: 1 } })), 0));
  }
  return rows;
}

export function weldLabelsPdf(input: { welds: WeldFacts[]; iso: IsometricFacts; grid: LabelGrid; generatedAt: Date }) {
  return renderBlocks({ page: { size: 'A4', orientation: 'portrait', margins: { top: LABEL_MARGIN, bottom: LABEL_MARGIN, left: LABEL_MARGIN, right: LABEL_MARGIN } }, title: `Weld labels - ${input.iso.isoNo}`, generatedAt: input.generatedAt, blocks: labelRows(input.welds, input.iso, input.grid) });
}

export const weldLabelsDocument: PdfDocumentDefinition = {
  key: 'weld-labels', title: 'Weld labels', report: 'weld-cards',
  async build({ iso, rows, query, now, publicOrigin }) {
    const grid = labelGrid(query), selected = selectWelds(rows, iso.id, query.welds), facts = isometricFacts(rows, iso);
    const { bytes } = await weldLabelsPdf({ welds: selected.map(weld => weldFacts(rows, weld, iso, publicOrigin)), iso: facts, grid, generatedAt: now });
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(facts.project, 'project')}-${fileSafe(facts.isoNo, 'iso')}-weld-labels` };
  },
};
