import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import qrcode from 'qrcode-generator';
import { pdfText, truncateText, wrapText } from './text.ts';

/**
 * A small page-layout engine on top of pdf-lib. Coordinates are in points with the origin at the top left
 * of the page and y growing downwards. Content is made of Blocks (measure + draw) that the builder flows
 * from page to page; tables break between rows only. The builder also records a layout model of everything
 * it drew, which the tests (and later documents' tests) read instead of parsing PDF operators.
 */

export const PAGE_SIZES = { A4: [595.28, 841.89], A3: [841.89, 1190.55] } as const;
export interface Margins { top: number; right: number; bottom: number; left: number }
export interface PageSetup { size: keyof typeof PAGE_SIZES; orientation: 'portrait' | 'landscape'; margins?: Partial<Margins> }
export const DEFAULT_MARGINS: Margins = { top: 28, right: 28, bottom: 28, left: 28 };
/** Height reserved under the content for the footer line. */
export const FOOTER_HEIGHT = 16;

export type FontName = 'regular' | 'bold' | 'italic';
/** Grey level or RGB, each 0 to 1. */
export type Color = number | [number, number, number];
export interface TextStyle { size?: number; font?: FontName; color?: Color; align?: 'left' | 'right' | 'center' }
export interface BoxStyle { fill?: Color; stroke?: Color; lineWidth?: number }
export const BLACK: Color = 0, WHITE: Color = 1, GREY_FILL: Color = 0.9, GREY_LINE: Color = 0.45;
const paint = (color: Color) => typeof color === 'number' ? rgb(color, color, color) : rgb(color[0], color[1], color[2]);
/** Line box of a text size. */
export const lineHeight = (size: number) => size * 1.22;

export interface EmbeddedImage { image: PDFImage; width: number; height: number }
export interface Metrics { measure(text: string, font: FontName, size: number): number }
export interface Block {
  /** Height the block needs at this width. */
  height(width: number, metrics: Metrics): number;
  draw(canvas: Canvas, x: number, y: number, width: number): void;
}

// ----- layout model --------------------------------------------------------------------------------------------
export interface LayoutText { text: string; x: number; y: number; size: number; font: FontName; width: number }
export interface LayoutRow { table: number; index: number; top: number; bottom: number; texts: number }
export interface LayoutPage { width: number; height: number; texts: LayoutText[]; rows: LayoutRow[]; images: number; /** Whether the page header block was drawn. */ pageHeader: boolean; /** Table header rows drawn on this page. */ tableHeaders: number }
export interface Layout { pages: LayoutPage[] }

export type Fonts = Record<FontName, PDFFont>;

/** Drawing surface of one page. */
export class Canvas implements Metrics {
  constructor(readonly page: PDFPage, readonly model: LayoutPage, private fonts: Fonts) {}
  get width() { return this.model.width; }
  get height() { return this.model.height; }
  measure(text: string, font: FontName = 'regular', size = 8) { return this.fonts[font].widthOfTextAtSize(pdfText(text).replace(/\n/g, ' '), size); }
  /** Draw one line of text with its line box starting at `y`. With `maxWidth` it is shortened to fit. Returns what was written. */
  text(value: unknown, x: number, y: number, style: TextStyle & { maxWidth?: number } = {}): string {
    const size = style.size ?? 8, font = style.font ?? 'regular';
    let line = pdfText(value).replace(/\n/g, ' ');
    if (style.maxWidth !== undefined) line = truncateText(line, text => this.measure(text, font, size), style.maxWidth);
    if (!line) return '';
    const width = this.measure(line, font, size);
    const left = style.align === 'right' ? x - width : style.align === 'center' ? x - width / 2 : x;
    this.page.drawText(line, { x: left, y: this.height - y - size * 0.9, size, font: this.fonts[font], color: paint(style.color ?? BLACK) });
    this.model.texts.push({ text: line, x: left, y, size, font, width });
    return line;
  }
  rect(x: number, y: number, width: number, height: number, style: BoxStyle = {}) {
    this.page.drawRectangle({ x, y: this.height - y - height, width, height, color: style.fill === undefined ? undefined : paint(style.fill), borderColor: style.stroke === undefined ? undefined : paint(style.stroke), borderWidth: style.stroke === undefined ? 0 : style.lineWidth ?? 0.5 });
  }
  line(x1: number, y1: number, x2: number, y2: number, style: { width?: number; color?: Color; dash?: number[] } = {}) {
    this.page.drawLine({ start: { x: x1, y: this.height - y1 }, end: { x: x2, y: this.height - y2 }, thickness: style.width ?? 0.5, color: paint(style.color ?? BLACK), dashArray: style.dash });
  }
  /** An image scaled to fit inside the box, kept in proportion, aligned inside it. */
  image(embedded: EmbeddedImage, x: number, y: number, maxWidth: number, maxHeight: number, align: 'left' | 'right' | 'center' = 'left') {
    const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height);
    const width = embedded.width * scale, height = embedded.height * scale;
    const left = align === 'right' ? x + maxWidth - width : align === 'center' ? x + (maxWidth - width) / 2 : x;
    this.page.drawImage(embedded.image, { x: left, y: this.height - y - height, width, height });
    this.model.images++;
  }
  /** A QR code drawn as vector squares (no quiet zone is added; leave one around the box). */
  qr(data: string, x: number, y: number, size: number) {
    const matrix = qrMatrix(data), cell = size / matrix.length;
    this.rect(x, y, size, size, { fill: WHITE });
    matrix.forEach((row, r) => row.forEach((dark, c) => { if (dark) this.page.drawRectangle({ x: x + c * cell, y: this.height - y - (r + 1) * cell, width: cell + 0.02, height: cell + 0.02, color: paint(BLACK) }); }));
    this.model.images++;
  }
}

/** The QR modules of a text (true = dark), error correction level M, smallest version that fits. */
export function qrMatrix(data: string): boolean[][] {
  const code = qrcode(0, 'M'); code.addData(data); code.make();
  const count = code.getModuleCount();
  return Array.from({ length: count }, (_, r) => Array.from({ length: count }, (_, c) => code.isDark(r, c)));
}

/** PNG or JPEG bytes as an embeddable image, or null when the bytes are neither or damaged (callers then omit the image). */
export async function embedImage(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<EmbeddedImage | null> {
  if (!bytes || bytes.length < 8) return null;
  try {
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!png && !jpeg) return null;
    const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    return image.width > 0 && image.height > 0 ? { image, width: image.width, height: image.height } : null;
  } catch { return null; }
}

// ----- blocks --------------------------------------------------------------------------------------------------
const textStyleOf = (style: TextStyle) => ({ size: style.size ?? 8, font: style.font ?? 'regular' as FontName });
export const spacer = (height: number): Block => ({ height: () => height, draw() {} });
/** Wrapped text, `maxLines` optional (the surplus ends in "..."). */
export function textBlock(value: unknown, style: TextStyle & { maxLines?: number } = {}): Block {
  const { size, font } = textStyleOf(style);
  const lines = (width: number, m: Metrics) => wrapText(pdfText(value), text => m.measure(text, font, size), width, style.maxLines);
  return {
    height: (width, m) => String(value ?? '') === '' ? 0 : lines(width, m).length * lineHeight(size),
    draw(canvas, x, y, width) { lines(width, canvas).forEach((line, i) => canvas.text(line, style.align === 'right' ? x + width : style.align === 'center' ? x + width / 2 : x, y + i * lineHeight(size), style)); },
  };
}
export const emptyBlock: Block = spacer(0);
/** A block with padding and optional border / fill around another block. */
export function box(child: Block, options: BoxStyle & { padding?: number | [number, number] } = {}): Block {
  const [padX, padY] = Array.isArray(options.padding) ? options.padding : [options.padding ?? 4, options.padding ?? 4];
  return {
    height: (width, m) => child.height(width - 2 * padX, m) + 2 * padY,
    draw(canvas, x, y, width) {
      const height = child.height(width - 2 * padX, canvas) + 2 * padY;
      if (options.fill !== undefined || options.stroke !== undefined) canvas.rect(x, y, width, height, options);
      child.draw(canvas, x + padX, y + padY, width - 2 * padX);
    },
  };
}
/** A box of a fixed height (e.g. a signature area) around other content. */
export function fixedBox(height: number, child: Block | null, options: BoxStyle & { padding?: number } = {}): Block {
  const pad = options.padding ?? 4;
  return { height: () => height, draw(canvas, x, y, width) { canvas.rect(x, y, width, height, options); child?.draw(canvas, x + pad, y + pad, width - 2 * pad); } };
}
export interface Column { block: Block; /** Points, or a share (`{ fill: weight }`) of what the fixed columns leave. */ width: number | { fill: number } }
/** Blocks side by side. */
export function columns(items: Column[], gap = 8): Block {
  const widths = (total: number) => {
    const fixed = items.reduce((sum, item) => sum + (typeof item.width === 'number' ? item.width : 0), 0), weights = items.reduce((sum, item) => sum + (typeof item.width === 'number' ? 0 : item.width.fill), 0);
    const free = Math.max(total - fixed - gap * (items.length - 1), 0);
    return items.map(item => typeof item.width === 'number' ? item.width : free * item.width.fill / weights);
  };
  return {
    height: (width, m) => { const w = widths(width); return Math.max(0, ...items.map((item, i) => item.block.height(w[i], m))); },
    draw(canvas, x, y, width) { const w = widths(width); let left = x; items.forEach((item, i) => { item.block.draw(canvas, left, y, w[i]); left += w[i] + gap; }); },
  };
}
export const stack = (items: Block[], gap = 0): Block => ({
  height: (width, m) => items.reduce((sum, item, i) => sum + item.height(width, m) + (i ? gap : 0), 0),
  draw(canvas, x, y, width) { let top = y; for (const item of items) { item.draw(canvas, x, top, width); top += item.height(width, canvas) + gap; } },
});
export interface LabelValue { label: string; value: unknown }
/**
 * Label / value pairs in `columns` columns (filled row by row): the label in bold, the value after it. Both wrap.
 * Use `box(...)` around it for the grey isometric box.
 */
export function labelValueGrid(items: LabelValue[], options: { columns?: number; size?: number; labelShare?: number; gap?: number } = {}): Block {
  const count = options.columns ?? 1, size = options.size ?? 7.5, share = options.labelShare ?? 0.4, gap = options.gap ?? 10;
  const rows = Array.from({ length: Math.ceil(items.length / count) }, (_, r) => items.slice(r * count, r * count + count));
  const cellWidth = (width: number) => (width - gap * (count - 1)) / count;
  const cell = (item: LabelValue, width: number, m: Metrics) => {
    const labelWidth = width * share, label = wrapText(pdfText(item.label), text => m.measure(text, 'bold', size), labelWidth - 3), value = wrapText(pdfText(item.value ?? ''), text => m.measure(text, 'regular', size), width - labelWidth, 3);
    return { label, value, lines: Math.max(label.length, value.length), labelWidth };
  };
  return {
    height: (width, m) => rows.reduce((sum, row) => sum + Math.max(1, ...row.map(item => cell(item, cellWidth(width), m).lines)) * lineHeight(size), 0),
    draw(canvas, x, y, width) {
      let top = y; const w = cellWidth(width);
      for (const row of rows) {
        const cells = row.map(item => cell(item, w, canvas));
        cells.forEach((c, i) => {
          const left = x + i * (w + gap);
          c.label.forEach((line, n) => canvas.text(line, left, top + n * lineHeight(size), { size, font: 'bold' }));
          c.value.forEach((line, n) => canvas.text(line, left + c.labelWidth, top + n * lineHeight(size), { size }));
        });
        top += Math.max(1, ...cells.map(c => c.lines)) * lineHeight(size);
      }
    },
  };
}
/** An image block that sizes itself to the image inside a maximum box. */
export function imageBlock(embedded: EmbeddedImage | null, maxWidth: number, maxHeight: number, align: 'left' | 'right' | 'center' = 'left'): Block {
  if (!embedded) return emptyBlock;
  const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height);
  return { height: () => embedded.height * scale, draw(canvas, x, y, width) { canvas.image(embedded, x, y, Math.min(width, maxWidth), maxHeight, align); } };
}
export const qrBlock = (data: string, size: number): Block => ({ height: () => size, draw(canvas, x, y, width) { canvas.qr(data, x + Math.max(width - size, 0), y, size); } });

// ----- tables --------------------------------------------------------------------------------------------------
/** A cell: one line of text, or several lines (each wrapped or truncated according to the table's `fit`). */
export type Cell = string | number | null | undefined | (string | number | null | undefined)[];
export interface TableColumn { header: string | string[]; /** Relative width. */ width: number; align?: 'left' | 'right' | 'center' }
export interface TableSpec {
  columns: TableColumn[];
  rows: Cell[][];
  size?: number; headerSize?: number; padding?: number;
  /** `truncate` keeps exactly the lines given (each cut to the column); `wrap` wraps long lines onto more lines. */
  fit?: 'wrap' | 'truncate';
  /** Rows are at least this many lines tall (blank templates). */
  minLines?: number;
  maxLines?: number;
  headerFill?: Color; headerColor?: Color; rowLine?: Color; zebra?: Color;
  /**
   * A header row drawn by the document itself (grouped or bilingual headings). It receives the left edge and the
   * width of every column; the column `header` texts are then ignored. Repeats on every page like the standard header.
   */
  customHeader?: { height: number; draw(canvas: Canvas, x: number, y: number, widths: number[]): void };
}
interface TableLayout { widths: number[]; size: number; headerSize: number; pad: number }
const cellLines = (cell: Cell) => (Array.isArray(cell) ? cell : [cell]).map(line => pdfText(line ?? ''));

/** Everything the builder keeps while it flows content. */
export class PdfBuilder {
  readonly layout: Layout = { pages: [] };
  private pages: { page: PDFPage; model: LayoutPage; canvas: Canvas }[] = [];
  private header: Block | null = null;
  private footerLeft = '';
  private footerBlock: Block | null = null;
  private cursor = 0;
  private tables = 0;
  readonly width: number; readonly height: number; readonly margins: Margins;
  private constructor(readonly doc: PDFDocument, private fonts: Fonts, readonly setup: PageSetup) {
    const [w, h] = PAGE_SIZES[setup.size];
    [this.width, this.height] = setup.orientation === 'landscape' ? [h, w] : [w, h];
    this.margins = { ...DEFAULT_MARGINS, ...setup.margins };
  }
  static async create(setup: PageSetup, options: { title?: string } = {}) {
    const doc = await PDFDocument.create();
    doc.setCreator('Blitzkrieg'); doc.setProducer('Blitzkrieg'); if (options.title) doc.setTitle(pdfText(options.title));
    const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), italic: await doc.embedFont(StandardFonts.HelveticaOblique) };
    return new PdfBuilder(doc, fonts, setup);
  }
  /** Usable width between the margins. */
  get contentWidth() { return this.width - this.margins.left - this.margins.right; }
  private get metrics(): Metrics { return { measure: (text, font, size) => this.fonts[font].widthOfTextAtSize(pdfText(text).replace(/\n/g, ' '), size) }; }
  private get bottom() { return this.height - this.margins.bottom - FOOTER_HEIGHT - (this.footerBlock ? this.footerBlock.height(this.contentWidth, this.metrics) + 4 : 0); }
  get canvas() { return this.current().canvas; }
  embedImage(bytes: Uint8Array | null | undefined) { return embedImage(this.doc, bytes); }
  /** Block drawn at the top of every page, now and on pages added later. */
  setHeader(block: Block | null) { this.header = block; }
  /** Block drawn above the footer line on every page (e.g. a signature line); its height is reserved on every page. Set it before adding content. */
  setFooterBlock(block: Block | null) { this.footerBlock = block; }
  /** Text at the left of the footer line; the right side always shows page/pages. */
  setFooter(left: string) { this.footerLeft = left; }
  private current() { return this.pages.length ? this.pages[this.pages.length - 1] : this.startPage(); }
  private startPage() {
    const page = this.doc.addPage([this.width, this.height]);
    const model: LayoutPage = { width: this.width, height: this.height, texts: [], rows: [], images: 0, pageHeader: false, tableHeaders: 0 };
    const entry = { page, model, canvas: new Canvas(page, model, this.fonts) };
    this.pages.push(entry); this.layout.pages.push(model);
    this.cursor = this.margins.top;
    if (this.header) { this.header.draw(entry.canvas, this.margins.left, this.cursor, this.contentWidth); this.cursor += this.header.height(this.contentWidth, this.metrics); model.pageHeader = true; }
    return entry;
  }
  newPage() { this.startPage(); }
  /** Space left on the current page. */
  get remaining() { this.current(); return this.bottom - this.cursor; }
  /** Place a block under the previous content; it moves to a new page when it does not fit (and would fit there). */
  add(block: Block) {
    const height = block.height(this.contentWidth, this.metrics);
    if (height > this.remaining && this.pages.length && this.cursor > this.margins.top + (this.header?.height(this.contentWidth, this.metrics) ?? 0)) this.startPage();
    block.draw(this.current().canvas, this.margins.left, this.cursor, this.contentWidth); this.cursor += height;
  }
  space(height: number) { this.current(); this.cursor += height; }

  private tableLayout(spec: TableSpec): TableLayout {
    const total = spec.columns.reduce((sum, column) => sum + column.width, 0);
    return { widths: spec.columns.map(column => column.width / total * this.contentWidth), size: spec.size ?? 7, headerSize: spec.headerSize ?? spec.size ?? 7, pad: spec.padding ?? 2.5 };
  }
  private rowLines(spec: TableSpec, layout: TableLayout, row: Cell[]) {
    const m = this.metrics;
    const cells = spec.columns.map((_, i) => {
      const inner = layout.widths[i] - 2 * layout.pad, fit = (text: string) => m.measure(text, 'regular', layout.size);
      return cellLines(row[i]).flatMap(line => spec.fit === 'truncate' ? [truncateText(line, fit, inner)] : wrapText(line, fit, inner, spec.maxLines));
    });
    const count = Math.max(spec.minLines ?? 1, ...cells.map(lines => lines.length));
    return { cells, count: spec.maxLines ? Math.min(count, spec.maxLines) : count };
  }
  /** Draw a table; the header row repeats on every page and a row is never split across pages. */
  addTable(spec: TableSpec) {
    const layout = this.tableLayout(spec), table = this.tables++, x = this.margins.left;
    const headerLines = Math.max(...spec.columns.map(column => (Array.isArray(column.header) ? column.header : [column.header]).length));
    const headerHeight = spec.customHeader?.height ?? headerLines * lineHeight(layout.headerSize) + 2 * layout.pad;
    const drawHeader = () => {
      const { canvas, model } = this.current(); const y = this.cursor;
      if (spec.customHeader) { spec.customHeader.draw(canvas, x, y, layout.widths); this.cursor += headerHeight; model.tableHeaders++; return; }
      canvas.rect(x, y, this.contentWidth, headerHeight, { fill: spec.headerFill ?? BLACK });
      let left = x;
      spec.columns.forEach((column, i) => {
        (Array.isArray(column.header) ? column.header : [column.header]).forEach((line, n) => canvas.text(line, column.align === 'right' ? left + layout.widths[i] - layout.pad : column.align === 'center' ? left + layout.widths[i] / 2 : left + layout.pad, y + layout.pad + n * lineHeight(layout.headerSize), { size: layout.headerSize, font: 'bold', color: spec.headerColor ?? WHITE, align: column.align, maxWidth: layout.widths[i] - 2 * layout.pad }));
        left += layout.widths[i];
      });
      this.cursor += headerHeight;
      model.tableHeaders++;
    };
    const firstRowHeight = spec.rows.length ? this.rowLines(spec, layout, spec.rows[0]).count * lineHeight(layout.size) + 2 * layout.pad : 0;
    if (this.remaining < headerHeight + firstRowHeight) this.startPage();
    drawHeader();
    spec.rows.forEach((row, index) => {
      const { cells, count } = this.rowLines(spec, layout, row), height = count * lineHeight(layout.size) + 2 * layout.pad;
      if (this.remaining < height) { this.startPage(); drawHeader(); }
      const { canvas, model } = this.current(); const top = this.cursor, before = model.texts.length;
      if (spec.zebra !== undefined && index % 2) canvas.rect(x, top, this.contentWidth, height, { fill: spec.zebra });
      let left = x;
      cells.forEach((lines, i) => {
        const column = spec.columns[i];
        lines.slice(0, count).forEach((line, n) => canvas.text(line, column.align === 'right' ? left + layout.widths[i] - layout.pad : column.align === 'center' ? left + layout.widths[i] / 2 : left + layout.pad, top + layout.pad + n * lineHeight(layout.size), { size: layout.size, align: column.align }));
        canvas.line(left, top, left, top + height, { width: 0.4, color: spec.rowLine ?? GREY_LINE });
        left += layout.widths[i];
      });
      canvas.line(left, top, left, top + height, { width: 0.4, color: spec.rowLine ?? GREY_LINE });
      canvas.line(x, top + height, x + this.contentWidth, top + height, { width: 0.4, color: spec.rowLine ?? GREY_LINE });
      model.rows.push({ table, index, top, bottom: top + height, texts: model.texts.length - before });
      this.cursor += height;
    });
  }
  /** Draw the footers (generation text left, page/pages right) and return the file bytes. */
  async save(): Promise<Uint8Array> {
    this.current();
    const total = this.pages.length, y = this.height - this.margins.bottom - 9;
    this.pages.forEach(({ canvas }, i) => {
      if (this.footerBlock) this.footerBlock.draw(canvas, this.margins.left, y - 3 - 4 - this.footerBlock.height(this.contentWidth, this.metrics), this.contentWidth);
      canvas.line(this.margins.left, y - 3, this.width - this.margins.right, y - 3, { width: 0.4, color: GREY_LINE });
      canvas.text(this.footerLeft, this.margins.left, y, { size: 7, color: 0.3 });
      canvas.text(`${i + 1}/${total}`, this.width - this.margins.right, y, { size: 7, color: 0.3, align: 'right' });
    });
    return this.doc.save({ useObjectStreams: false });
  }
}
