import { AppError } from '../store.ts';
import { materialIdentity } from '../../shared/materials.ts';
import { materialLabels, type MaterialLabel } from '../../shared/mto-stock.ts';
import { columns, lineHeight, spacer, type Block } from './engine.ts';
import { DEFAULT_LABEL_GRID, LABEL_MARGIN, labelGeometry } from './weld-labels.ts';
import { renderBlocks } from './weld-cards.ts';
import type { Row } from '../../shared/types.ts';
import type { PdfScopedDefinition } from './documents.ts';

/**
 * Material QR labels (MTO Pilot: Material inventory row "Print QR label" and the bulk labels on storehouse lines):
 * one label per Material No in a grid of labels per A4 sheet (default 3 x 8). The QR code encodes the Material No.
 *
 *   GET /api/pdf/material-labels?materialno=7430050581[,7430050582,…]   (at most 500 Material Nos)
 */
export const MAX_LABELS = 500;

/** One label: Material No (large), description, size and unit, with the QR code of the Material No on the left. */
export function materialLabelBlock(label: MaterialLabel, width: number, height: number): Block {
  const size = Math.min(9, Math.max(5, height / 9)), pad = Math.min(5, height / 12), qr = Math.min(height - 2 * pad, width * 0.4, 72);
  return {
    height: () => height,
    draw(canvas, x, y, w) {
      canvas.rect(x, y, w, height, { stroke: 0.75, lineWidth: 0.3 });
      const textLeft = x + pad + qr + 7, textWidth = w - 2 * pad - qr - 7, big = size * 1.7;
      const content = lineHeight(size) * 2 + lineHeight(big); let top = y + Math.max(pad, (height - content) / 2);
      canvas.text(label.materialNo, textLeft, top, { size: big, font: 'bold', maxWidth: textWidth }); top += lineHeight(big);
      canvas.text(label.description, textLeft, top, { size, maxWidth: textWidth }); top += lineHeight(size);
      canvas.text([label.dia, label.lbs, label.uom].filter(Boolean).join(' / '), textLeft, top, { size, maxWidth: textWidth });
      canvas.qr(label.payload, x + pad, y + (height - qr) / 2, qr);
    },
  };
}

export function materialLabelsPdf(input: { labels: MaterialLabel[]; generatedAt: Date }) {
  const grid = DEFAULT_LABEL_GRID, geometry = labelGeometry(grid), rows: Block[] = [];
  for (let i = 0; i < input.labels.length; i += grid.columns) {
    const chunk = input.labels.slice(i, i + grid.columns);
    rows.push(columns(Array.from({ length: grid.columns }, (_, c) => ({ block: chunk[c] ? materialLabelBlock(chunk[c], geometry.labelWidth, geometry.labelHeight) : spacer(geometry.labelHeight), width: { fill: 1 } })), 0));
  }
  return renderBlocks({ page: { size: 'A4', orientation: 'portrait', margins: { top: LABEL_MARGIN, bottom: LABEL_MARGIN, left: LABEL_MARGIN, right: LABEL_MARGIN } }, title: 'Material labels', generatedAt: input.generatedAt, blocks: rows });
}

/**
 * The document. Only materials the account can see in a stock row (a storehouse line or a project site's inventory) get a
 * label; the descriptions come from the catalogs.
 */
export const materialLabelsDocument: PdfScopedDefinition = {
  key: 'material-labels', title: 'Material labels', report: 'pdf-material-label', scope: 'scoped',
  async build({ store, rows, query, now }) {
    const numbers = (query.materialno ?? '').split(',').map(no => no.trim()).filter(Boolean);
    if (!numbers.length) throw new AppError(422, 'Choose the materials to print labels for.');
    if (numbers.length > MAX_LABELS) throw new AppError(422, `Choose at most ${MAX_LABELS} materials for one sheet of labels.`);
    const catalog = { materials: store.list('materials'), custom_materials: store.list('custom_materials') };
    const held = new Set((rows.stock || []).filter(stock => !stock._archived).map(stock => materialIdentity(stock)));
    const visible = numbers.filter(no => {
      const material = catalog.materials.find(row => row.materialNo === no), custom = catalog.custom_materials.find(row => row.materialNo === no);
      return (material && held.has(materialIdentity({ materialId: material.id } as unknown as Row))) || (custom && held.has(materialIdentity({ customMaterialId: custom.id } as unknown as Row)));
    });
    const { labels } = materialLabels(catalog, visible);
    if (!labels.length) throw new AppError(404, 'These materials could not be found.');
    const { bytes } = await materialLabelsPdf({ labels, generatedAt: now });
    return { bytes, fileName: `${now.toISOString().slice(0, 10)}-Material-label${labels.length === 1 ? `-${labels[0].materialNo.replace(/[^A-Za-z0-9._-]+/g, '-')}` : 's'}` };
  },
};
