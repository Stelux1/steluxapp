import { box, columns, GREY_FILL, GREY_LINE, imageBlock, labelValueGrid, lineHeight, spacer, stack, textBlock, type Block, type Cell, type EmbeddedImage, type Canvas, type PdfBuilder, type PageSetup, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { CompanyForDocuments } from './company.ts';
import { lislClientBlock, lislColumns, lislIsoBox, lislRowCells, type LislModel, type LislOptions } from '../../shared/pdf-lisl.ts';

export type LislVariant = 'a4' | 'a3' | 'blank';
export interface LislSignature { content: Uint8Array; name: string; nameUnder: boolean }
export interface LislPdfInput {
  model: LislModel; options: LislOptions; variant: LislVariant;
  company: CompanyForDocuments | null;
  /** The current user's short signature, used only with the "Signature on each page" option. */
  signature: LislSignature | null;
  generatedAt: Date;
}
const MM = 72 / 25.4;
/** Rows of the blank template: enough to fill a page above the acceptance boxes. */
export const BLANK_ROWS = 21;

/** Acceptance box: a title and three lines (company, Client, NoBo), each with a signature line and "Date:". */
function acceptanceBox(title: string, labels: string[], signature: EmbeddedImage | null, signatureName: string | null): Block {
  const ROW = 30, TITLE = 14;
  return {
    height: () => TITLE + ROW * labels.length + 6,
    draw(canvas: Canvas, x: number, y: number, width: number) {
      canvas.rect(x, y, width, TITLE + ROW * labels.length + 6, { stroke: 0.2, lineWidth: 0.7 });
      canvas.text(title, x + 5, y + 4, { size: 7.5, font: 'bold' });
      labels.forEach((label, i) => {
        const top = y + TITLE + i * ROW, labelWidth = Math.min(width * 0.36, 100), dateWidth = 60;
        canvas.text(label, x + 5, top + ROW - 9 - lineHeight(7), { size: 7, maxWidth: labelWidth - 4 });
        const lineStart = x + 5 + labelWidth, lineEnd = x + width - 8 - dateWidth - 24;
        canvas.line(lineStart, top + ROW - 8, lineEnd, top + ROW - 8, { width: 0.5 });
        if (i === 0 && signature) { canvas.image(signature, lineStart + 2, top + 1, lineEnd - lineStart - 4, ROW - 11, 'left'); if (signatureName) canvas.text(signatureName, lineEnd - 2, top + ROW - 7, { size: 5.5, align: 'right', color: 0.3 }); }
        canvas.text('Date:', lineEnd + 8, top + ROW - 9 - lineHeight(7), { size: 7 });
        canvas.line(lineEnd + 28, top + ROW - 8, x + width - 6, top + ROW - 8, { width: 0.5 });
      });
    },
  };
}
/** A compact company signature line, repeated at the foot of every page. */
function signatureLine(label: string, signature: EmbeddedImage, name: string | null): Block {
  const HEIGHT = 30;
  return {
    height: () => HEIGHT,
    draw(canvas: Canvas, x: number, y: number) {
      canvas.text(`${label}:`, x, y + HEIGHT - 9 - lineHeight(7), { size: 7, font: 'bold' });
      const start = x + Math.min(canvas.measure(`${label}:`, 'bold', 7) + 6, 200);
      canvas.line(start, y + HEIGHT - 8, start + 150, y + HEIGHT - 8, { width: 0.5 });
      canvas.image(signature, start + 2, y + 1, 146, HEIGHT - 11, 'left');
      if (name) canvas.text(name, start + 150, y + HEIGHT - 7, { size: 5.5, align: 'right', color: 0.3 });
    },
  };
}
const companyBlock = (company: CompanyForDocuments['company']): Block => stack([textBlock(company.name, { size: 8.5, font: 'bold' }), ...company.addressLines.map(line => textBlock(line, { size: 7.5 })), ...(company.phone ? [textBlock(`Tel. ${company.phone}`, { size: 7.5 })] : [])]);

/** LISL Report (A4 portrait), LISL Report (A3 landscape) and the blank template (A4, empty rows). */
export async function lislPdf(input: LislPdfInput) {
  const { model, options, variant, company, signature } = input, a3 = variant === 'a3';
  const page: PageSetup = a3 ? { size: 'A3', orientation: 'landscape', margins: { left: 24, right: 24 } } : { size: 'A4', orientation: 'portrait', margins: { left: 22, right: 22 } };
  const title = a3 ? 'LISL Report' : `ISO ${String(model.iso.isoNo ?? '')} - LISL Report`;
  const definition = {
    page, title, generatedAt: input.generatedAt,
    async layout(pdf: PdfBuilder) {
      const logo = company?.logo ? await pdf.embedImage(company.logo) : null;
      const signatureImage = options.signaturePerPage && signature ? await pdf.embedImage(signature.content) : null;
      const signatureName = signature?.nameUnder ? signature.name : null;
      const logoHeight = (company?.company.logoHeightMm ?? 18) * MM;
      const top = logo ? columns([{ block: textBlock(title, { size: 13, font: 'bold' }), width: { fill: 1 } }, { block: imageBlock(logo, 170, logoHeight, 'right'), width: 170 }]) : textBlock(title, { size: 13, font: 'bold' });
      const client = labelValueGrid(lislClientBlock(model), { columns: 1, labelShare: 0.3, size: 7.5 });
      const parties = company ? columns([{ block: client, width: { fill: 1 } }, { block: companyBlock(company.company), width: { fill: 1 } }], 14) : client;
      const header = stack([top, spacer(5), parties, spacer(5), box(labelValueGrid(lislIsoBox(model), { columns: 3, size: 7.5, labelShare: 0.42 }), { fill: GREY_FILL, stroke: GREY_LINE, padding: 4 }), spacer(6)]);
      const columnSet = lislColumns(a3);
      const rows: Cell[][] = variant === 'blank' ? Array.from({ length: BLANK_ROWS }, () => columnSet.map(() => ['', ''])) : model.entries.map(entry => lislRowCells(entry, columnSet, options.weldRecord));
      const table: TableSpec = { columns: columnSet.map(column => ({ header: column.header, width: column.width })), rows, size: a3 ? 6.5 : 6, headerSize: a3 ? 6.5 : 6, fit: 'truncate', minLines: 2, padding: 2.5 };
      const company_ = company?.company.name || 'Company', client_ = model.client || 'Client';
      const labels = [company_, client_, 'NoBo'];
      const acceptance = columns([
        { block: acceptanceBox('Acceptance / examine prefabrication', labels, signatureImage, signatureName), width: { fill: 1 } },
        { block: acceptanceBox('Acceptance / examine assembly', labels, signatureImage, signatureName), width: { fill: 1 } },
      ], 12);
      return { header, table, after: [acceptance], ...(signatureImage ? { footerBlock: signatureLine(company_, signatureImage, signatureName) } : {}) };
    },
  };
  return renderDocument(definition);
}
