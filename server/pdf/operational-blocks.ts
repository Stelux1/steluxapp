import { PdfBuilder, box, columns, GREY_FILL, GREY_LINE, imageBlock, labelValueGrid, lineHeight, spacer, stack, textBlock, type Block, type Canvas, type EmbeddedImage, type Layout, type PageSetup, type TableSpec } from './engine.ts';
import { generationStamp } from './document.ts';
import type { CompanyForDocuments } from './company.ts';
import type { LabelValueItem } from '../../shared/pdf-lisl.ts';

/**
 * Building blocks shared by the operational documents (requests, visual report, releases, hydrotest request, punch list,
 * flange report, pick list): the page header with company block and logo, signature boxes, and a renderer that flows a
 * sequence of blocks and tables with the engine's footer (generation time left, page n/N right) and repeating headers.
 */
export const MM = 72 / 25.4;

export interface Step { block?: Block; table?: TableSpec; /** Points of space before this step. */ before?: number }
export interface OperationalLayout {
  /** Drawn at the top of every page. */
  header?: Block;
  /** Drawn above the footer line of every page. */
  footerBlock?: Block;
  steps: Step[];
}
export interface OperationalDefinition {
  page: PageSetup; title: string; generatedAt: Date;
  layout(pdf: PdfBuilder): OperationalLayout | Promise<OperationalLayout>;
}
/** Flow the steps: blocks move to a new page as a whole when they do not fit, tables break between rows and repeat their header row. */
export async function renderOperational(definition: OperationalDefinition): Promise<{ bytes: Uint8Array; layout: Layout }> {
  const pdf = await PdfBuilder.create(definition.page, { title: definition.title });
  const layout = await definition.layout(pdf);
  pdf.setFooter(generationStamp(definition.generatedAt));
  if (layout.footerBlock) pdf.setFooterBlock(layout.footerBlock);
  if (layout.header) pdf.setHeader(layout.header);
  pdf.newPage();
  layout.steps.forEach((step, index) => {
    if (index && (step.before ?? 6)) pdf.space(step.before ?? 6);
    if (step.block) pdf.add(step.block);
    if (step.table) pdf.addTable(step.table);
  });
  return { bytes: await pdf.save(), layout: pdf.layout };
}

export const A4_PORTRAIT: PageSetup = { size: 'A4', orientation: 'portrait', margins: { left: 22, right: 22 } };
export const A4_LANDSCAPE: PageSetup = { size: 'A4', orientation: 'landscape', margins: { left: 24, right: 24 } };

/** The company's name, address lines and phone; nothing when there is no company data. */
export const companyBlock = (company: CompanyForDocuments['company']): Block =>
  stack([textBlock(company.name, { size: 8.5, font: 'bold' }), ...company.addressLines.map(line => textBlock(line, { size: 7.5 })), ...(company.phone ? [textBlock(`Tel. ${company.phone}`, { size: 7.5 })] : [])]);

export interface HeaderInput {
  title: string;
  /** A second line under the title (document number, filter summary). */
  subtitle?: string;
  company: CompanyForDocuments | null;
  /** Left block: label / value rows (client, project, isometric). */
  left: LabelValueItem[];
  /** The grey box under the parties, three columns. */
  box?: LabelValueItem[];
  boxColumns?: number;
}
/** Page header of every operational document: title with the logo at the right, parties (project left, company right), grey box. */
export async function documentHeader(pdf: PdfBuilder, input: HeaderInput): Promise<Block> {
  const logo = input.company?.logo ? await pdf.embedImage(input.company.logo) : null;
  const logoHeight = (input.company?.company.logoHeightMm ?? 18) * MM;
  const titleBlock = stack([textBlock(input.title, { size: 13, font: 'bold' }), ...(input.subtitle ? [textBlock(input.subtitle, { size: 8, color: 0.25 })] : [])]);
  const top = logo ? columns([{ block: titleBlock, width: { fill: 1 } }, { block: imageBlock(logo, 170, logoHeight, 'right'), width: 170 }]) : titleBlock;
  const left = input.left.length ? labelValueGrid(input.left, { columns: 1, labelShare: 0.3, size: 7.5 }) : null;
  const parties = left && input.company ? columns([{ block: left, width: { fill: 1 } }, { block: companyBlock(input.company.company), width: { fill: 1 } }], 14) : left ?? (input.company ? companyBlock(input.company.company) : null);
  return stack([top, ...(parties ? [spacer(5), parties] : []), ...(input.box?.length ? [spacer(5), box(labelValueGrid(input.box, { columns: input.boxColumns ?? 3, size: 7.5, labelShare: 0.42 }), { fill: GREY_FILL, stroke: GREY_LINE, padding: 4 })] : []), spacer(6)]);
}

/** A labelled paragraph ("Note" and its text); nothing when the text is empty. */
export function noteBlock(label: string, value: string): Block {
  return value.trim() ? stack([textBlock(label, { size: 7.5, font: 'bold' }), textBlock(value, { size: 7.5 })], 1) : spacer(0);
}
/** A small heading above a block. */
export const heading = (value: string): Block => textBlock(value, { size: 8.5, font: 'bold' });

export interface SignatureSlot {
  title: string;
  /** The signer's signature image, when there is one. */
  image?: EmbeddedImage | null;
  /** Printed under the line (the signer's name); "Name / date" when empty. */
  name?: string;
}
const SLOT_HEIGHT = 56;
/** Signature boxes, `perRow` side by side: the title, a space for the signature (the image, when given), a line and the name caption. */
export function signatureBlock(slots: SignatureSlot[], perRow = 3): Block {
  const rows = Math.ceil(slots.length / perRow), gap = 8;
  return {
    height: () => rows * SLOT_HEIGHT + Math.max(rows - 1, 0) * gap,
    draw(canvas: Canvas, x: number, y: number, width: number) {
      const w = (width - gap * (perRow - 1)) / perRow;
      slots.forEach((slot, i) => {
        const left = x + (i % perRow) * (w + gap), top = y + Math.floor(i / perRow) * (SLOT_HEIGHT + gap);
        canvas.rect(left, top, w, SLOT_HEIGHT, { stroke: GREY_LINE, lineWidth: 0.5 });
        canvas.text(slot.title, left + 4, top + 3, { size: 7, font: 'bold', maxWidth: w - 8 });
        if (slot.image) canvas.image(slot.image, left + 4, top + 5 + lineHeight(7), w - 8, 24, 'left');
        canvas.line(left + 4, top + SLOT_HEIGHT - 16, left + w - 4, top + SLOT_HEIGHT - 16, { width: 0.5 });
        canvas.text(slot.name || 'Name', left + 4, top + SLOT_HEIGHT - 14, { size: 6, color: 0.3, maxWidth: w - 8 });
        canvas.text('Date', left + 4, top + SLOT_HEIGHT - 14 + lineHeight(6), { size: 6, color: 0.3 });
      });
    },
  };
}

/** Plain table spec with the settings the operational documents share (rows wrap, at most `maxLines` lines). */
export function plainTable(headers: (string | string[])[], widths: number[], rows: TableSpec['rows'], options: Partial<TableSpec> = {}): TableSpec {
  return { columns: headers.map((header, i) => ({ header, width: widths[i] })), rows, size: 6.5, headerSize: 6.5, fit: 'wrap', maxLines: 3, padding: 2.5, ...options };
}
