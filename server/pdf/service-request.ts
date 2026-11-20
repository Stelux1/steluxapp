import { PDFDocument } from 'pdf-lib';
import { columns, GREY_LINE, lineHeight, qrBlock, type Block, type Canvas, type EmbeddedImage, type PdfBuilder } from './engine.ts';
import { A4_LANDSCAPE, documentHeader, heading, noteBlock, plainTable, renderOperational, type Step } from './operational-blocks.ts';
import type { CompanyForDocuments } from './company.ts';
import { loadUploaded } from './iso-book.ts';
import { SERVICE_REQUEST_COLUMNS, type ServiceRequestDocument } from '../../shared/mto-logistics.ts';

/**
 * The two documents of a spool service request (MTO Pilot → Logistic → Request archive):
 *  - ServiceRequest: header (Report no., Company, Added by, Date, Note, QR with the request id), one table per project,
 *    the isometric drawings appended when "Include isometric drawings in PDF" was ticked;
 *  - CoatingRelease ("Release note"): the same header and tables, and the Contractor / Supplier, Client and NoBo
 *    signature blocks in the footer. Sign online prints the three signatures into these blocks.
 * Layout only; the data comes from `serviceRequestDocumentData` (shared/mto-logistics.ts).
 */
export interface ReleaseSigner { name: string; date: string; image?: Uint8Array | null }
export interface ReleaseSignatures { contractor: ReleaseSigner; client: ReleaseSigner; nobo: ReleaseSigner }
export interface ServiceRequestPdfInput {
  model: ServiceRequestDocument; company: CompanyForDocuments | null; generatedAt: Date;
  /** What the QR code holds (a link to the request, or its id). */
  qr: string;
}
export const RELEASE_SIGNERS = [['contractor', 'Contractor / Supplier'], ['client', 'Client'], ['nobo', 'NoBo']] as const;
const WIDTHS = [12, 10, 9, 10, 8, 7, 8, 5, 9, 6];
const two = (value: number) => String(value).padStart(2, '0');
/** "28.06.2024. 09:16" as the archive writes it; a day without time prints the day. */
export function printStamp(value: string) {
  if (!value) return '';
  if (!value.includes('T') || /T00:00:00(\.000)?Z$/.test(value)) { const [y, m, d] = value.slice(0, 10).split('-'); return d ? `${d}.${m}.${y}.` : value; }
  const date = new Date(value); if (Number.isNaN(date.getTime())) return value;
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}. ${two(date.getHours())}:${two(date.getMinutes())}`;
}
const printDay = (value: string) => value ? printStamp(value.slice(0, 10)) : '';

async function header(pdf: PdfBuilder, input: ServiceRequestPdfInput, title: string, subtitle: string): Promise<Block> {
  const { model } = input;
  const top = await documentHeader(pdf, { title, subtitle, company: input.company, left: [], box: [{ label: 'Report no.', value: model.reportNo }, { label: 'Company', value: model.company }, { label: 'Added by', value: model.addedBy }, { label: 'Date', value: printStamp(model.dateTime || model.date) }], boxColumns: 2 });
  return columns([{ block: top, width: { fill: 1 } }, { block: qrBlock(input.qr, 62), width: 62 }], 10);
}
const groupSteps = (model: ServiceRequestDocument): Step[] => [
  ...(model.note ? [{ block: noteBlock('Note', model.note), before: 4 }] : []),
  ...model.groups.flatMap((group, index): Step[] => [
    { block: heading(`Project: ${group.project}`), before: index || model.note ? 10 : 2 },
    { table: plainTable(SERVICE_REQUEST_COLUMNS, WIDTHS, group.lines, { size: 7, headerSize: 7 }), before: 3 },
  ]),
];

const PARTY_HEIGHT = 74;
/**
 * The two signature blocks at the end of the Service request (the form is signed on paper, there is no online signing):
 * the Sender (the company that sends the elements, its name from Company data) and the Carrier (the transport company).
 * Each block has Company, Name, Signature and Date lines to fill in by hand.
 */
export function partySignatureBlock(senderCompany: string): Block {
  const parties = [{ title: 'Sender', company: senderCompany }, { title: 'Carrier (transport company)', company: '' }];
  return {
    height: () => PARTY_HEIGHT,
    draw(canvas: Canvas, x: number, y: number, width: number) {
      const gap = 10, w = (width - gap) / 2;
      parties.forEach((party, i) => {
        const left = x + i * (w + gap);
        canvas.rect(left, y, w, PARTY_HEIGHT, { stroke: GREY_LINE, lineWidth: 0.5 });
        canvas.text(party.title, left + 4, y + 3, { size: 7.5, font: 'bold', maxWidth: w - 8 });
        ['Company', 'Name', 'Signature', 'Date'].forEach((label, row) => {
          const top = y + 4 + lineHeight(7.5) + row * 14;
          canvas.text(`${label}:`, left + 4, top, { size: 7, color: 0.3 });
          if (label === 'Company' && party.company) canvas.text(party.company, left + 50, top, { size: 7, maxWidth: w - 54 });
          else canvas.line(left + 50, top + lineHeight(7) - 1, left + w - 4, top + lineHeight(7) - 1, { width: 0.5 });
        });
      });
    },
  };
}

/** The Service request document. `drawings` are the isometric drawing files to append (PDF or image), in order. */
export async function serviceRequestPdf(input: ServiceRequestPdfInput & { drawings?: { name: string; bytes: Uint8Array }[] }) {
  const result = await renderOperational({
    page: A4_LANDSCAPE, title: `Service request ${input.model.reportNo}`, generatedAt: input.generatedAt,
    async layout(pdf) { return { header: await header(pdf, input, 'Service request', `Report no. ${input.model.reportNo}`), steps: [...groupSteps(input.model), { block: partySignatureBlock(input.company?.company.name ?? ''), before: 16 }] }; },
  });
  if (!input.drawings?.length) return { ...result, appended: 0, skipped: [] as string[] };
  const out = await PDFDocument.load(result.bytes); let appended = 0; const skipped: string[] = [];
  for (const drawing of input.drawings) {
    const loaded = await loadUploaded(drawing.name, drawing.bytes);
    if ('skipped' in loaded) { skipped.push(`${drawing.name}: ${loaded.skipped}`); continue; }
    for (const page of await out.copyPages(loaded.unit.doc, loaded.unit.doc.getPageIndices())) out.addPage(page);
    appended++;
  }
  return { bytes: await out.save(), layout: result.layout, appended, skipped };
}

const BLOCK_HEIGHT = 78;
/** The footer of the Release note: Contractor / Supplier, Client and NoBo, each with Name, Date and Signature. */
function releaseFooter(signers: { title: string; name: string; date: string; image: EmbeddedImage | null }[]): Block {
  const gap = 10;
  return {
    height: () => BLOCK_HEIGHT,
    draw(canvas: Canvas, x: number, y: number, width: number) {
      const w = (width - gap * (signers.length - 1)) / signers.length;
      signers.forEach((signer, i) => {
        const left = x + i * (w + gap);
        canvas.rect(left, y, w, BLOCK_HEIGHT, { stroke: GREY_LINE, lineWidth: 0.5 });
        canvas.text(signer.title, left + 4, y + 3, { size: 7.5, font: 'bold', maxWidth: w - 8 });
        const row = (label: string, value: string, top: number) => { canvas.text(`${label}:`, left + 4, top, { size: 7, color: 0.3 }); canvas.text(value, left + 40, top, { size: 7, maxWidth: w - 44 }); };
        row('Name', signer.name, y + 4 + lineHeight(7.5));
        row('Date', signer.date, y + 4 + lineHeight(7.5) + lineHeight(7));
        const top = y + 6 + lineHeight(7.5) + 2 * lineHeight(7);
        canvas.text('Signature:', left + 4, top, { size: 7, color: 0.3 });
        if (signer.image) canvas.image(signer.image, left + 40, top, w - 44, BLOCK_HEIGHT - (top - y) - 4, 'left');
        else canvas.line(left + 40, y + BLOCK_HEIGHT - 8, left + w - 4, y + BLOCK_HEIGHT - 8, { width: 0.5 });
      });
    },
  };
}

/** The Coating release (Release note). With `signatures` it is the signed copy: names, dates and images in the footer. */
export async function coatingReleasePdf(input: ServiceRequestPdfInput & { signatures?: ReleaseSignatures }) {
  return renderOperational({
    page: A4_LANDSCAPE, title: `Release note ${input.model.reportNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const signers = await Promise.all(RELEASE_SIGNERS.map(async ([key, title]) => {
        const signer = input.signatures?.[key];
        return { title, name: signer?.name ?? '', date: signer ? printDay(signer.date) : '', image: signer?.image ? await pdf.embedImage(signer.image) : null };
      }));
      return { header: await header(pdf, input, 'Release note', `Coating release · Report no. ${input.model.reportNo}`), footerBlock: releaseFooter(signers), steps: groupSteps(input.model) };
    },
  });
}
