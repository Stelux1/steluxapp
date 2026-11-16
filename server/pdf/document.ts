import { PdfBuilder, type Block, type Layout, type PageSetup, type TableSpec } from './engine.ts';

/**
 * Defining a document: a page setup plus a layout function that returns what goes where. The engine does
 * the rest (repeating header, table with repeating header row, page breaks, footer, page numbers).
 *
 *   renderDocument({ page: { size: 'A4', orientation: 'portrait' }, title: 'Weld card', generatedAt: new Date(),
 *     layout: async pdf => ({ header: textBlock('Weld card', { size: 14, font: 'bold' }), table: { columns, rows } }) })
 */
export interface DocumentLayout {
  /** Drawn at the top of every page. */
  header?: Block;
  /** Drawn above the footer line of every page (its height is reserved on every page). */
  footerBlock?: Block;
  /** The main table; rows are never split across pages and the header row repeats. */
  table?: TableSpec;
  /** Blocks after the table; each moves to a new page as a whole when it does not fit. */
  after?: Block[];
}
export interface DocumentDefinition {
  page: PageSetup;
  title: string;
  generatedAt: Date;
  /** Receives the builder so images can be embedded (`pdf.embedImage(bytes)`) before the blocks are made. */
  layout(pdf: PdfBuilder): DocumentLayout | Promise<DocumentLayout>;
}

const two = (value: number) => String(value).padStart(2, '0');
/** The generation stamp of the footer: dd.mm.yyyy hh:mm (server time). */
export const generationStamp = (date: Date) => `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;

export async function renderDocument(definition: DocumentDefinition): Promise<{ bytes: Uint8Array; layout: Layout }> {
  const pdf = await PdfBuilder.create(definition.page, { title: definition.title });
  const layout = await definition.layout(pdf);
  pdf.setFooter(generationStamp(definition.generatedAt));
  if (layout.footerBlock) pdf.setFooterBlock(layout.footerBlock);
  if (layout.header) pdf.setHeader(layout.header);
  if (layout.table) pdf.addTable(layout.table); else pdf.newPage();
  for (const block of layout.after ?? []) { pdf.space(8); pdf.add(block); }
  return { bytes: await pdf.save(), layout: pdf.layout };
}
