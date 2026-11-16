import { PDFDocument, StandardFonts } from 'pdf-lib';
import { GREY_FILL, GREY_LINE, lineHeight, type Block, type Canvas, type Color, type FontName, type Metrics, type TableSpec } from './engine.ts';
import { pdfText, wrapText } from './text.ts';

/**
 * Building blocks of the owner-specific LISL forms: grouped (multi-tier) table headings made of label lines in
 * several styles (German on top, English beneath in smaller italics), and a small measuring helper so the
 * heading height can be computed before the page exists.
 */
export interface HeaderLine { text: string; font?: FontName; size?: number }
/** One heading cell: `col` / `span` are column indexes of the table, `tier` 0 is the upper row; `rows` is how many tiers the cell spans (default 1). */
export interface HeaderCell { col: number; span?: number; tier: number; rows?: number; lines: HeaderLine[] }

/** German label with its English translation beneath it in smaller italics. */
export const bilingual = (german: string, english: string, size = 6): HeaderLine[] => [{ text: german, font: 'bold', size }, { text: english, font: 'italic', size: size - 0.8 }];

/** Text measurement without a page: the same Helvetica fonts the engine embeds. */
export async function measurer(): Promise<Metrics> {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), italic: await doc.embedFont(StandardFonts.HelveticaOblique) };
  return { measure: (text, font, size) => fonts[font].widthOfTextAtSize(pdfText(text).replace(/\n/g, ' '), size) };
}

export interface FormHeader { header: NonNullable<TableSpec['customHeader']>; /** Per cell: the lines as wrapped and the box they occupy (for tests). */ boxes: { cell: HeaderCell; x: number; y: number; width: number; height: number }[] }
const PAD = 2;
const wrapped = (cell: HeaderCell, width: number, m: Metrics) => cell.lines.flatMap(line => wrapText(pdfText(line.text), text => m.measure(text, line.font ?? 'regular', line.size ?? 6), width - 2 * PAD).map(text => ({ text, font: line.font ?? 'regular' as FontName, size: line.size ?? 6 })));
const textHeight = (lines: { size: number }[]) => lines.reduce((sum, line) => sum + lineHeight(line.size), 0) + 2 * PAD;

/**
 * A table heading of several tiers. `relative` are the column widths of the table spec (the engine scales them to the
 * content width); the tier heights follow from the wrapped text so nothing overflows its cell.
 */
export function formHeader(cells: HeaderCell[], relative: number[], contentWidth: number, m: Metrics, fill: Color = GREY_FILL): FormHeader {
  const total = relative.reduce((sum, width) => sum + width, 0), widths = relative.map(width => width / total * contentWidth);
  const spanWidth = (cell: HeaderCell) => widths.slice(cell.col, cell.col + (cell.span ?? 1)).reduce((sum, width) => sum + width, 0);
  const need = (cell: HeaderCell) => textHeight(wrapped(cell, spanWidth(cell), m));
  const tiers = Math.max(...cells.map(cell => cell.tier + (cell.rows ?? 1))), heights = Array.from({ length: tiers }, () => 0);
  for (const cell of cells.filter(cell => (cell.rows ?? 1) === 1)) heights[cell.tier] = Math.max(heights[cell.tier], need(cell));
  for (const cell of cells.filter(cell => (cell.rows ?? 1) > 1)) {
    const last = cell.tier + (cell.rows ?? 1) - 1, have = heights.slice(cell.tier, last + 1).reduce((sum, item) => sum + item, 0);
    heights[last] += Math.max(need(cell) - have, 0);
  }
  const height = heights.reduce((sum, item) => sum + item, 0), above = (tier: number) => heights.slice(0, tier).reduce((sum, item) => sum + item, 0);
  const boxes: FormHeader['boxes'] = [];
  const draw = (canvas: Canvas, x: number, y: number, actual: number[]) => {
    const lefts = actual.reduce<number[]>((list, width, i) => [...list, (list[i] ?? x) + width], [x]);
    for (const cell of cells) {
      const left = lefts[cell.col], width = actual.slice(cell.col, cell.col + (cell.span ?? 1)).reduce((sum, item) => sum + item, 0);
      const top = y + above(cell.tier), h = above(cell.tier + (cell.rows ?? 1)) - above(cell.tier);
      canvas.rect(left, top, width, h, { fill, stroke: GREY_LINE, lineWidth: 0.4 });
      const lines = wrapped(cell, width, m), used = lines.reduce((sum, line) => sum + lineHeight(line.size), 0);
      let cursor = top + (h - used) / 2;
      for (const line of lines) { canvas.text(line.text, left + width / 2, cursor, { size: line.size, font: line.font, align: 'center' }); cursor += lineHeight(line.size); }
      boxes.push({ cell, x: left, y: top, width, height: h });
    }
  };
  return { header: { height, draw }, boxes };
}

/** A check box drawn as a square, with a cross when ticked. Returns the width used. */
export function checkBox(canvas: Canvas, x: number, y: number, size: number, ticked: boolean) {
  canvas.rect(x, y, size, size, { stroke: 0.1, lineWidth: 0.6 });
  if (ticked) { canvas.line(x + 1.2, y + 1.2, x + size - 1.2, y + size - 1.2, { width: 0.8 }); canvas.line(x + size - 1.2, y + 1.2, x + 1.2, y + size - 1.2, { width: 0.8 }); }
}

export interface InfoCell { label: HeaderLine[]; value: string; /** Drawn after the value instead of plain text (e.g. check boxes). */ extra?: (canvas: Canvas, x: number, y: number, width: number) => void }
export const INFO_ROW = 24;
/** Bordered cells in `count` columns, each with a (bilingual) label on the left and its value to the right. */
export function infoGrid(items: InfoCell[], count: number, options: { labelShare?: number; valueSize?: number } = {}): Block {
  const rows = Math.ceil(items.length / count), share = options.labelShare ?? 0.42, size = options.valueSize ?? 7.5;
  return {
    height: () => rows * INFO_ROW,
    draw(canvas, x, y, width) {
      const w = width / count;
      items.forEach((item, i) => {
        const left = x + (i % count) * w, top = y + Math.floor(i / count) * INFO_ROW, labelWidth = w * share;
        canvas.rect(left, top, w, INFO_ROW, { stroke: GREY_LINE, lineWidth: 0.4 });
        canvas.rect(left, top, labelWidth, INFO_ROW, { fill: GREY_FILL, stroke: GREY_LINE, lineWidth: 0.4 });
        const label = item.label.flatMap(line => wrapText(pdfText(line.text), text => canvas.measure(text, line.font ?? 'regular', line.size ?? 6), labelWidth - 2 * PAD).map(text => ({ text, font: line.font ?? 'regular' as FontName, size: line.size ?? 6 })));
        const used = label.reduce((sum, line) => sum + lineHeight(line.size), 0);
        let cursor = top + Math.max((INFO_ROW - used) / 2, 1);
        for (const line of label) { canvas.text(line.text, left + PAD + 1, cursor, { size: line.size, font: line.font }); cursor += lineHeight(line.size); }
        const valueWidth = w - labelWidth - 2 * PAD - 2;
        const value = wrapText(pdfText(item.value), text => canvas.measure(text, 'regular', size), valueWidth, 2);
        value.forEach((line, n) => canvas.text(line, left + labelWidth + PAD + 1, top + 3 + n * lineHeight(size), { size }));
        item.extra?.(canvas, left + labelWidth + PAD + 1, top, valueWidth);
      });
    },
  };
}
