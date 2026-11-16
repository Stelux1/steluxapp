import { EncryptedPDFError, PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { box, columns, GREY_FILL, GREY_LINE, labelValueGrid, spacer, stack, textBlock, type Block, type Cell, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import { pdfText, truncateText } from './text.ts';
import type { AnyPdfDefinition, BookRun, PdfResult } from './documents.ts';
import { partState, type BookContext, type PartPlan } from './iso-book-parts.ts';
import { AppError } from '../store.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { ISO_BOOK_LIMITS } from '../../shared/iso-book.ts';
import type { Row } from '../../shared/types.ts';

/**
 * ISO Book assembly (pdf-lib): generated parts come from their registry builders, uploaded PDFs are appended page by
 * page, uploaded PNG / JPEG images get one page each, everything else (and every damaged or encrypted PDF) is listed
 * on the "Files not included" page. A cover with the table of contents comes first; the generated pages carry the
 * book's page number in the footer.
 */
export interface BookEnvironment extends BookContext {
  now: Date;
  /** Builds a registry document for an isometric (the document's access rule already holds): of the isometric, of its project, or of a record of it. */
  generate(definition: AnyPdfDefinition, iso: Row, query: Record<string, string>): Promise<PdfResult>;
  /** Stored bytes of an attachment, or null when the file is unavailable. */
  read(file: Row): Uint8Array | null;
}
/** One document inside the book: pages that are copied as they are. */
export interface Unit { name: string; generated: boolean; doc: PDFDocument; pages: number }
/** Everything one part contributes for one isometric (one table-of-contents row). */
export interface Chunk { key: string; part: string; isoNo: string; units: Unit[] }
export interface SkippedFile { part: string; isoNo: string; name: string; reason: string }

/** Totals of one request: input size and pages are checked while the parts are collected. */
export class Budget {
  pages = 0; bytes = 0;
  addBytes(count: number) {
    this.bytes += count;
    if (this.bytes > ISO_BOOK_LIMITS.inputBytes) throw new AppError(413, `The files of this book are larger than ${ISO_BOOK_LIMITS.inputBytes / 1024 / 1024} MB in total. Choose fewer parts or isometrics.`, undefined, 'iso-book-size');
  }
  addPages(count: number) {
    this.pages += count;
    if (this.pages > ISO_BOOK_LIMITS.pages) throw new AppError(413, `The book would have more than ${ISO_BOOK_LIMITS.pages} pages. Choose fewer parts or isometrics.`, undefined, 'iso-book-pages');
  }
}

const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 1024)).includes('%PDF-');
const isPng = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

const A4: [number, number] = [595.28, 841.89];
/** An image on a page of its own (A4, portrait or landscape by the image's shape), scaled to fit; the file name is printed small above it. */
async function imagePage(name: string, bytes: Uint8Array, png: boolean): Promise<PDFDocument> {
  const doc = await PDFDocument.create(), image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  if (!(image.width > 0 && image.height > 0)) throw new Error('empty image');
  const [w, h] = image.width > image.height ? [A4[1], A4[0]] : A4, margin = 28, caption = 14;
  const page = doc.addPage([w, h]), font = await doc.embedFont(StandardFonts.Helvetica);
  const scale = Math.min((w - 2 * margin) / image.width, (h - 2 * margin - caption) / image.height);
  const width = image.width * scale, height = image.height * scale;
  page.drawText(truncateText(pdfText(name), t => font.widthOfTextAtSize(t, 7), w - 2 * margin), { x: margin, y: h - margin - 6, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
  page.drawImage(image, { x: (w - width) / 2, y: h - margin - caption - height, width, height });
  return doc;
}

export type Loaded = { unit: Unit } | { skipped: string };
/** Reads an uploaded file as PDF pages; damaged, encrypted and other file types come back as a reason (never an exception). */
export async function loadUploaded(name: string, bytes: Uint8Array): Promise<Loaded> {
  try {
    if (isPdf(bytes)) {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      const pages = doc.getPageCount();
      if (!pages) return { skipped: 'The PDF has no pages.' };
      // A damaged page tree often loads and only fails when the pages are copied: prove it now, not in the middle of the book.
      await (await PDFDocument.create()).copyPages(doc, doc.getPageIndices());
      return { unit: { name, generated: false, doc, pages } };
    }
    if (isPng(bytes) || isJpeg(bytes)) return { unit: { name, generated: false, doc: await imagePage(name, bytes, isPng(bytes)), pages: 1 } };
  } catch (error) {
    const encrypted = error instanceof EncryptedPDFError || isPdf(bytes) && /\/Encrypt\b/.test(Buffer.from(bytes.subarray(Math.max(0, bytes.length - 4096))).toString('latin1'));
    return { skipped: encrypted ? 'The PDF is encrypted (password protected).' : isPdf(bytes) ? 'The PDF is damaged and could not be read.' : 'The image is damaged and could not be read.' };
  }
  const extension = /\.([A-Za-z0-9]{1,6})$/.exec(name)?.[1]?.toUpperCase();
  // A file that claims to be a PDF or an image but is neither is damaged; every other type is simply not supported in the book.
  if (extension && ['PDF', 'PNG', 'JPG', 'JPEG'].includes(extension)) return { skipped: `The file is not a valid ${extension === 'PDF' ? 'PDF' : 'image'} (damaged or renamed).` };
  return { skipped: `${extension ? `${extension} files` : 'This file type'} cannot be placed in the book (only PDF, PNG and JPEG).` };
}

async function loadGenerated(name: string, bytes: Uint8Array): Promise<Unit> {
  const doc = await PDFDocument.load(bytes);
  return { name, generated: true, doc, pages: doc.getPageCount() };
}

// ----- collecting the parts of one isometric -----------------------------------------------------------------------------

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
/** Operation phases the isometric has materials in, for the "MTO report per operation phase" part. */
function phasesOf(environment: BookEnvironment, iso: Row): { id: string; name: string }[] {
  const ids = [...new Set((environment.rows.iso_materials || []).filter(row => !row._archived && row.isoId === iso.id && row.phaseId).map(row => String(row.phaseId)))];
  return ids.map(id => ({ id, name: String((environment.rows.operation_phases || []).find(row => row.id === id)?.name ?? '') })).sort((a, b) => natural(a.name, b.name));
}

/**
 * The builds of one document for one isometric: per operation phase for the MTO report, for the isometric's project for a
 * project document, per record for a document of its own record (`bookRuns`), else once with `isoId`.
 */
export function bookRunsOf(environment: BookEnvironment, plan: PartPlan, definition: AnyPdfDefinition, iso: Row): BookRun[] {
  if (definition.scope === 'project') return [{ suffix: '', query: { projectId: String(iso.projectId ?? '') } }];
  if (definition.scope === 'scoped' && definition.bookRuns) return definition.bookRuns(environment.rows, iso);
  const phases = plan.key === 'mto-report' ? phasesOf(environment, iso) : [];
  return phases.length ? phases.map(phase => ({ suffix: phase.name ? ` - ${phase.name}` : '', query: { isoId: iso.id, phaseId: phase.id, phase: phase.name } })) : [{ suffix: '', query: { isoId: iso.id } }];
}

/**
 * The chunks of one isometric for the chosen parts (in the plans' order). `used` holds the attachment ids already placed
 * in this isometric's book, so a file that fits two parts appears once. Nothing here throws for a single bad file.
 */
export async function collectChunks(environment: BookEnvironment, plans: PartPlan[], iso: Row, budget: Budget, skipped: SkippedFile[]): Promise<Chunk[]> {
  const chunks: Chunk[] = [], used = new Set<string>(), isoNo = String(iso.isoNo ?? '');
  for (const plan of plans) {
    if (plan.key === 'task-sheet') continue;
    const state = partState(plan, environment, iso), units: Unit[] = [];
    if (!state.available) { skipped.push({ part: plan.label, isoNo, name: plan.label, reason: state.reason || 'Not available.' }); continue; }
    for (const definition of state.generators) {
      const runs = bookRunsOf(environment, plan, definition, iso);
      for (const run of runs) {
        const name = `${definition.title}${run.suffix}`;
        try {
          const result = await environment.generate(definition, iso, run.query);
          const unit = await loadGenerated(`${result.fileName}.pdf`, result.bytes);
          budget.addPages(unit.pages); units.push(unit);
        } catch (error) {
          if (error instanceof AppError && error.status === 413) throw error;
          skipped.push({ part: plan.label, isoNo, name, reason: error instanceof AppError ? error.message : 'The document could not be generated.' });
        }
      }
    }
    for (const file of state.files) {
      if (used.has(file.id)) continue;
      used.add(file.id);
      const name = String(file.name ?? 'file');
      budget.addBytes(Number(file.size) || 0);
      const bytes = environment.read(file);
      if (!bytes) { skipped.push({ part: plan.label, isoNo, name, reason: 'The file is unavailable on the server.' }); continue; }
      const loaded = await loadUploaded(name, bytes);
      if ('skipped' in loaded) { skipped.push({ part: plan.label, isoNo, name, reason: loaded.skipped }); continue; }
      budget.addPages(loaded.unit.pages); units.push(loaded.unit);
    }
    if (units.length) chunks.push({ key: plan.key, part: plan.label, isoNo, units });
  }
  return chunks;
}

// ----- cover, table of contents and the "not included" page -----------------------------------------------------------

export interface CoverModel {
  project?: Row; client: string;
  isometrics: { isoNo: string; revision: string; drawingNo: string }[];
  /** The one isometric of a single book. */
  single: boolean; preparedBy: string; now: Date;
}
export interface TocRow { no: number; part: string; isoNo: string; content: string; from: number; pages: number }

const PORTRAIT = { size: 'A4', orientation: 'portrait', margins: { left: 28, right: 28 } } as const;

async function renderCover(cover: CoverModel, toc: TocRow[]) {
  const first = cover.isometrics[0];
  const title = 'Task sheet';
  return renderDocument({
    page: PORTRAIT, title: cover.single ? `ISO ${first?.isoNo ?? ''} - ISO Book` : 'ISO Book', generatedAt: cover.now,
    layout() {
      const project = [cover.project?.internnumber, cover.project?.description].filter(Boolean).join(' - ');
      const facts = cover.single
        ? [{ label: 'Project', value: project }, { label: 'Client', value: cover.client }, { label: 'Iso number', value: first?.isoNo }, { label: 'Revision', value: first?.revision }, { label: 'Drawing number', value: first?.drawingNo }, { label: 'Date', value: printDate(cover.now.toISOString().slice(0, 10)) }, { label: 'Prepared by', value: cover.preparedBy }]
        : [{ label: 'Project', value: project }, { label: 'Client', value: cover.client }, { label: 'Isometrics', value: cover.isometrics.length }, { label: 'Date', value: printDate(cover.now.toISOString().slice(0, 10)) }, { label: 'Prepared by', value: cover.preparedBy }];
      const list: Block = cover.single ? spacer(0) : textBlock(cover.isometrics.map(item => `${item.isoNo} (Rev. ${item.revision})`).join(', '), { size: 7.5, maxLines: 8 });
      const header = stack([
        columns([{ block: textBlock(title, { size: 18, font: 'bold' }), width: { fill: 1 } }, { block: textBlock('ISO Book', { size: 11, align: 'right' }), width: 120 }]), spacer(8),
        box(labelValueGrid(facts, { columns: 1, size: 8.5, labelShare: 0.25 }), { fill: GREY_FILL, stroke: GREY_LINE, padding: 6 }), spacer(4), list, spacer(10),
        textBlock('Contents', { size: 11, font: 'bold' }), spacer(4),
      ]);
      const wide = !cover.single;
      const table: TableSpec = {
        columns: [{ header: 'No.', width: 4, align: 'right' }, { header: 'Part', width: 20 }, ...(wide ? [{ header: 'Isometric', width: 14 }] : []), { header: 'Content', width: 40 }, { header: 'From page', width: 8, align: 'right' as const }, { header: 'Pages', width: 7, align: 'right' as const }],
        rows: toc.map((row): Cell[] => [row.no, row.part, ...(wide ? [row.isoNo] : []), row.content, row.from || '', row.pages]),
        size: 8, headerSize: 8, fit: 'wrap', maxLines: 3, padding: 3,
      };
      return { header, table };
    },
  });
}

async function renderSkipped(skipped: SkippedFile[], now: Date, single: boolean) {
  return renderDocument({
    page: PORTRAIT, title: 'Files not included', generatedAt: now,
    layout() {
      const header = stack([textBlock('Files not included', { size: 14, font: 'bold' }), spacer(3), textBlock('These files or parts could not be placed in the book. Open them separately.', { size: 8 }), spacer(8)]);
      const table: TableSpec = {
        columns: [{ header: 'Part', width: 16 }, ...(single ? [] : [{ header: 'Isometric', width: 14 }]), { header: 'File', width: 30 }, { header: 'Reason', width: 40 }],
        rows: skipped.map((item): Cell[] => [item.part, ...(single ? [] : [item.isoNo]), item.name, item.reason]), size: 8, headerSize: 8, fit: 'wrap', maxLines: 4, padding: 3,
      };
      return { header, table };
    },
  });
}

export interface BookInput { cover: CoverModel | null; chunks: Chunk[]; skipped: SkippedFile[]; now: Date }

/**
 * Appends one book to `out`: cover with the table of contents, the chunks in the order given, the "not included" page.
 * Page numbers of the table of contents are relative to the book's own first page.
 */
export async function appendBook(out: PDFDocument, font: PDFFont, input: BookInput, budget: Budget): Promise<void> {
  const { cover, chunks, skipped, now } = input, single = !cover || cover.single;
  const notIncluded = skipped.length ? await loadGenerated('Files not included', (await renderSkipped(skipped, now, single)).bytes) : null;
  const tocOf = (coverPages: number): TocRow[] => {
    let page = coverPages + 1;
    const rows = chunks.map((chunk, index) => {
      const pages = chunk.units.reduce((sum, unit) => sum + unit.pages, 0), row: TocRow = { no: index + 1, part: chunk.part, isoNo: chunk.isoNo, content: chunk.units.map(unit => unit.name).join(', '), from: page, pages };
      page += pages; return row;
    });
    if (notIncluded) rows.push({ no: rows.length + 1, part: 'Files not included', isoNo: '', content: `${skipped.length} ${skipped.length === 1 ? 'entry' : 'entries'}`, from: page, pages: notIncluded.pages });
    return rows;
  };
  // The contents list is part of the cover, so its page count (and the page numbers in it) settle together.
  let coverDocument: Unit | null = null;
  if (cover) {
    let coverPages = 1;
    for (let attempt = 0; attempt < 4; attempt++) {
      const rendered = await renderCover(cover, tocOf(coverPages));
      coverDocument = await loadGenerated('Task sheet', rendered.bytes);
      if (coverDocument.pages === coverPages) break;
      coverPages = coverDocument.pages;
    }
    budget.addPages(coverDocument!.pages);
  }
  if (notIncluded) budget.addPages(notIncluded.pages);
  const units: Unit[] = [...(coverDocument ? [coverDocument] : []), ...chunks.flatMap(chunk => chunk.units), ...(notIncluded ? [notIncluded] : [])];
  const total = units.reduce((sum, unit) => sum + unit.pages, 0);
  let number = 0;
  for (const unit of units) {
    const pages = await out.copyPages(unit.doc, unit.doc.getPageIndices());
    for (const copy of pages) {
      const page = out.addPage(copy); number++;
      if (unit.generated) {
        // Centre of the footer line of the generated documents (their own "n/N" stays at the right).
        const label = `ISO book page ${number}/${total}`;
        page.drawText(label, { x: (page.getWidth() - font.widthOfTextAtSize(label, 7)) / 2, y: 31.5, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
      }
    }
  }
}

export async function createBook(title: string): Promise<{ out: PDFDocument; font: PDFFont }> {
  const out = await PDFDocument.create();
  out.setTitle(pdfText(title)); out.setCreator('Blitzkrieg'); out.setProducer('Blitzkrieg');
  return { out, font: await out.embedFont(StandardFonts.Helvetica) };
}
