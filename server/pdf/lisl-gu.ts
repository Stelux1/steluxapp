import { PDFDocument, StandardFonts } from 'pdf-lib';
import { GREY_LINE, PdfBuilder, WHITE, lineHeight, spacer, stack, textBlock, type Block, type Canvas, type EmbeddedImage, type FontName, type Layout, type PageSetup, type TableSpec } from './engine.ts';
import { generationStamp } from './document.ts';
import { pdfText, wrapText } from './text.ts';
import { companyForDocuments, type CompanyForDocuments } from './company.ts';
import { AppError } from '../store.ts';
import type { PdfRequest, PdfResult } from './documents.ts';
import { currentSignature } from '../signatures.ts';
import { lislModel, printDate, type LislModel, type LislOptions } from '../../shared/pdf-lisl.ts';
import { GU_FAMILY_COLUMNS, NDT_FORM_COLUMNS, ndtFormCells, ndtLookups, type NdtColumnCells, type NdtForm } from '../../shared/pdf-ndt-columns.ts';
import { ownerFormTexts, type OwnerFormTexts } from '../../shared/site-settings.ts';
import type { Row } from '../../shared/types.ts';

/**
 * The owner-specific LISL forms [GU], [MV], [GU Rev 2] and [GU Rev 3] on the PDF engine. This module holds what
 * the four share (the data model of a weld with its two material sides, the table / header-band / frame / signature
 * blocks, a two-pass renderer that knows "n of N" while it draws the page header) and the [GU] form itself;
 * `lisl-mv.ts` and `lisl-gu-rev.ts` define the others. Texts that name an owner, a specification or a form number
 * come from the main project's Document settings (`ownerFormTexts`) and are left out when not set.
 */

// ----- text measuring (the engine's Helvetica metrics, available before a builder exists) --------------------------
export type Measure = (text: string, font: FontName, size: number) => number;
let measurer: Promise<Measure> | null = null;
export function textMeasure(): Promise<Measure> {
  measurer ??= (async () => {
    const doc = await PDFDocument.create();
    const fonts: Record<FontName, Awaited<ReturnType<PDFDocument['embedFont']>>> = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), italic: await doc.embedFont(StandardFonts.HelveticaOblique) };
    return (text: string, font: FontName, size: number) => fonts[font].widthOfTextAtSize(pdfText(text).replace(/\n/g, ' '), size);
  })();
  return measurer;
}

// ----- data model ------------------------------------------------------------------------------------------------------
/** One material side of a weld. */
export interface OwnerSide { index: string; charge: string; item: string; dn: string; wt: string; type: string; coating: string; /** Insertion length of the side (weld entry). */ installed: string; description: string; pos: string }
export interface OwnerWire { name: string; mm: string }
export interface OwnerWeld {
  weldNo: string; typeName: string; location: string; joint: string;
  /** Welder codes 1 to 4 (empty when not set). */
  welders: string[];
  date: string; fitup: string; wps: string;
  /** KR, else FP, of the weld (weld entry). */ km: string; /** Coating weld (weld entry). */ weldCoating: string;
  sides: [OwnerSide, OwnerSide]; wires: [OwnerWire, OwnerWire]; ndt: NdtColumnCells;
}
export interface OwnerModel {
  base: LislModel; site: Row | undefined; welds: OwnerWeld[];
  /** Distinct WPS records of the printed welds, by name. */
  wps: { name: string; method: string; process: string; definition: string }[];
  /** Report numbers of the visual inspections of the printed welds, without duplicates. */
  vtReports: string[];
}

const NOMINAL_SIZES: [number, number][] = [[0.5, 15], [0.75, 20], [1, 25], [1.25, 32], [1.5, 40], [2, 50], [2.5, 65], [3, 80], [4, 100], [5, 125], [6, 150], [8, 200], [10, 250], [12, 300], [14, 350], [16, 400], [18, 450], [20, 500], [24, 600]];
/** DN of a nominal size in inches ("2", `2"`, "1.1/2", "3/4"); anything else is printed as it was entered. */
export function dnOfInch(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const text = raw.replace(/["”″]|inch/gi, '').trim();
  let inches = Number.NaN;
  const mixed = /^(\d+)[.\- ](\d+)\/(\d+)$/.exec(text), fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (mixed) inches = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  else if (fraction) inches = Number(fraction[1]) / Number(fraction[2]);
  else if (/^\d+(\.\d+)?$/.test(text)) inches = Number(text);
  const found = NOMINAL_SIZES.find(([size]) => Math.abs(size - inches) < 0.01);
  return found ? String(found[1]) : raw;
}

/** The welds of one isometric (filtered like the base LISL) with their material sides and the NDT pairs of the forms. */
export function ownerModel(rows: Record<string, Row[]>, isoId: string, type: LislOptions['type'], fallbackSite?: Row): OwnerModel | null {
  const base = lislModel(rows, isoId, type);
  if (!base) return null;
  const find = (key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
  const text = (value: unknown) => String(value ?? '').trim();
  const site = base.site ?? fallbackSite;
  const lookups = ndtLookups(rows);
  const welds = base.entries.map((entry): OwnerWeld => {
    const { weld, values } = entry;
    const side = (i: 1 | 2): OwnerSide => {
      const certificate = find('certifications', weld[`certificate${i}Id`]), material = find('materials', weld[`material${i}Id`] || certificate?.materialId);
      const present = Boolean(certificate || material);
      return {
        index: values[`Index No ${i}`] ?? '', charge: values[`Charge No ${i}`] ?? '', item: text(material?.materialNo), dn: dnOfInch(certificate?.diameter || material?.dia),
        wt: values[`Wall thickness ${i}`] ?? '', type: present ? [text(find('material_types', certificate?.materialTypeId || material?.typeId)?.name), text(base.iso.material)].filter(Boolean).join(' ') : '',
        coating: text(find('coatings', weld[`coating${i}Id`])?.name), installed: text(weld[i === 1 ? 'insLength' : 'insLength2']), description: values[`Material ${i}`] ?? '', pos: values[`Pos ${i}`] ?? '',
      };
    };
    const wire = (i: 1 | 2): OwnerWire => ({ name: values[`Wire ${i}`] ?? '', mm: text(find('welding_wires', weld[`wire${i}Id`])?.diameter) });
    const code = (value: string | undefined) => (value ?? '').split(' | ')[0].trim();
    return {
      weldNo: text(weld.weldNo), typeName: text(entry.weldType?.abbreviation || entry.weldType?.name), location: text(entry.weldType?.location), joint: values['Joint type'] ?? '',
      welders: [values.Welder, values['Welder 2'], values['Welder 3'], values['Welder 4']].map(code), date: printDate(values['Weld date']), fitup: printDate(values['Fitup date']),
      wps: values['WPS No'] ?? '', km: text(weld.kr) || text(weld.fp), weldCoating: text(find('coatings', weld.coatingWeldId)?.name), sides: [side(1), side(2)], wires: [wire(1), wire(2)],
      ndt: ndtFormCells(GU_FAMILY_COLUMNS, weld, lookups),
    };
  });
  const usedWps = [...new Set(base.entries.map(entry => text(entry.weld.wpsId)).filter(Boolean))].map(id => find('wps', id)).filter((row): row is Row => Boolean(row));
  const wps = usedWps.map(row => ({ name: text(row.name), method: text(row.method), process: text(find('weld_processes', row.processId)?.name) || text(row.method), definition: text(row.definition) })).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const vtReports = [...new Set(welds.map(weld => weld.ndt.VT.report).filter(Boolean))];
  return { base, site, welds, wps, vtReports };
}

// ----- table of welds with two material lines per weld -----------------------------------------------------------------
export interface OwnerColumn {
  header: string[]; /** Relative width (points on a 800 pt page; scaled to the page). */ weight: number;
  /** A material-side column: the cell returns the text of side 1 and side 2, printed on separate lines. */
  side?: boolean;
  align?: 'left' | 'right' | 'center';
  /** `record` is false with "Weld record" off: cells that show what was recorded are then empty. */
  cell(weld: OwnerWeld, record: boolean): string | [string, string];
}
export interface Span { label: string; from: number; to: number }
const widthsOf = (weights: number[], total: number) => { const sum = weights.reduce((a, b) => a + b, 0); return weights.map(weight => weight / sum * total); };
const padTo = (lines: string[], count: number) => [...lines, ...Array.from({ length: Math.max(count - lines.length, 0) }, () => '')];
export const MAX_CELL_LINES = 3;
/**
 * Wraps a cell: at spaces, and a word wider than the cell (a report or WPS number) at its hyphens before any
 * character break; the surplus beyond `maxLines` ends in "...".
 */
export function wrapCell(value: string, measure: (text: string) => number, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      if (measure(word) <= width) { const joined = line ? `${line} ${word}` : word; if (measure(joined) <= width) line = joined; else { lines.push(line); line = word; } continue; }
      let current = line ? `${line} ` : '';
      for (const part of word.split(/(?<=-)/)) {
        if (measure(current + part) <= width) { current += part; continue; }
        if (current.trim()) lines.push(current.trimEnd());
        const pieces = wrapText(part, measure, width);
        lines.push(...pieces.slice(0, -1)); current = pieces.at(-1) ?? '';
      }
      line = current;
    }
    lines.push(line);
  }
  return wrapText(lines.join('\n'), measure, width, maxLines);
}

/**
 * The engine table of the forms. Every weld is `max(lines of side 1) + max(lines of side 2)` lines tall (at least two):
 * the two sides stay aligned across the material columns even when one wraps, and the weld cells start at the top.
 */
export function ownerTable(columns: OwnerColumn[], welds: OwnerWeld[], record: boolean, contentWidth: number, size: number, measure: Measure, pad = 1.5): TableSpec {
  const widths = widthsOf(columns.map(column => column.weight), contentWidth);
  const fit = (value: string, index: number) => wrapCell(pdfText(value), text => measure(text, 'regular', size), widths[index] - 2 * pad, MAX_CELL_LINES);
  const rows = welds.map(weld => {
    const lines = columns.map((column, i) => { const value = column.cell(weld, record); return column.side ? [fit(value[0], i), fit(value[1], i)] : [fit(String(value), i)]; });
    const first = Math.max(1, ...columns.map((column, i) => column.side ? lines[i][0].length : 0)), second = Math.max(1, ...columns.map((column, i) => column.side ? lines[i][1].length : 0));
    return columns.map((column, i) => column.side ? [...padTo(lines[i][0], first), ...padTo(lines[i][1], second)] : lines[i][0]);
  });
  return { columns: columns.map(column => ({ header: column.header, width: column.weight, align: column.align })), rows, size, headerSize: size, padding: pad, fit: 'truncate', minLines: 2 };
}

/** Black header bands above the table's header row: each span is a label over several columns. */
export function bandBlock(weights: number[], bands: Span[][], size: number): Block {
  const ROW = lineHeight(size) + 3;
  return {
    height: () => bands.length * ROW,
    draw(canvas: Canvas, x: number, y: number, width: number) {
      const widths = widthsOf(weights, width), left = (index: number) => x + widths.slice(0, index).reduce((a, b) => a + b, 0);
      bands.forEach((spans, r) => {
        const top = y + r * ROW;
        canvas.rect(x, top, width, ROW, { fill: 0 });
        for (const span of spans) {
          const start = left(span.from), end = left(span.to + 1);
          canvas.line(start, top, start, top + ROW, { width: 0.5, color: WHITE }); canvas.line(end, top, end, top + ROW, { width: 0.5, color: WHITE });
          canvas.text(span.label, (start + end) / 2, top + 1.5, { size, font: 'bold', color: WHITE, align: 'center', maxWidth: end - start - 2 });
        }
        canvas.line(x, top + ROW, x + width, top + ROW, { width: 0.5, color: WHITE });
      });
    },
  };
}

// ----- NDT columns of a form ---------------------------------------------------------------------------------------------
/** Pairs "A / NA" + "Rep. No." for every NDT column of the form. `record` off leaves them empty. */
export function ndtPairColumns(form: NdtForm, resultWeight: number, reportWeight: number): OwnerColumn[] {
  return NDT_FORM_COLUMNS[form].flatMap(({ id }): OwnerColumn[] => [
    { header: ['A /', 'NA'], weight: resultWeight, align: 'center', cell: (weld, record) => record ? weld.ndt[id].result : '' },
    { header: ['Rep.', 'No.'], weight: reportWeight, cell: (weld, record) => record ? weld.ndt[id].report : '' },
  ]);
}
/** The band over the method names of the NDT pairs, starting at column `first`. */
export const ndtMethodBand = (form: NdtForm, first: number): Span[] => NDT_FORM_COLUMNS[form].map(({ label }, i) => ({ label, from: first + 2 * i, to: first + 2 * i + 1 }));

// ----- page header blocks ------------------------------------------------------------------------------------------------
/** Counts the pages while the header is drawn on each of them; `total` is known on the second pass. */
export interface PageState { page: number; total: number }
type Fill = number | { fill: number };
/** Cells in one frame, separated by vertical lines. */
export function frameRow(cells: { block: Block; width: Fill }[], options: { pad?: number; lineWidth?: number } = {}): Block {
  const pad = options.pad ?? 4;
  const widths = (total: number) => {
    const fixed = cells.reduce((sum, cell) => sum + (typeof cell.width === 'number' ? cell.width : 0), 0), weights = cells.reduce((sum, cell) => sum + (typeof cell.width === 'number' ? 0 : cell.width.fill), 0);
    return cells.map(cell => typeof cell.width === 'number' ? cell.width : Math.max(total - fixed, 0) * cell.width.fill / weights);
  };
  const height = (width: number, m: Parameters<Block['height']>[1]) => Math.max(...cells.map((cell, i) => cell.block.height(widths(width)[i] - 2 * pad, m))) + 2 * pad;
  return {
    height,
    draw(canvas, x, y, width) {
      const w = widths(width), h = height(width, canvas);
      canvas.rect(x, y, width, h, { stroke: 0.2, lineWidth: options.lineWidth ?? 0.8 });
      let left = x;
      cells.forEach((cell, i) => {
        if (i) canvas.line(left, y, left, y + h, { width: 0.5, color: 0.2 });
        cell.block.draw(canvas, left + pad, y + pad, w[i] - 2 * pad); left += w[i];
      });
    },
  };
}
/** Bold label, value after it, one pair per line; the last line optionally "n of N". Values that do not fit are shortened. */
export function labelLines(items: [string, string][], options: { size?: number; labelWidth?: number; state?: PageState; pageLabel?: string } = {}): Block {
  const size = options.size ?? 7.5, labelWidth = options.labelWidth ?? 38, lines = items.length + (options.state ? 1 : 0);
  return {
    height: () => lines * lineHeight(size),
    draw(canvas, x, y, width) {
      const all: [string, string][] = [...items];
      if (options.state) { options.state.page += 1; all.push([options.pageLabel ?? 'Page', `${options.state.page} of ${options.state.total}`]); }
      all.forEach(([label, value], i) => { canvas.text(label, x, y + i * lineHeight(size), { size, font: 'bold', maxWidth: labelWidth - 2 }); canvas.text(value, x + labelWidth, y + i * lineHeight(size), { size, maxWidth: width - labelWidth }); });
    },
  };
}
/** Label / value pairs as wrapped lines in `count` columns: bold label, then the value (several lines when it wraps). */
export function labelColumns(items: [string, string][], count: number, options: { size?: number; labelWidth?: number; gap?: number } = {}): Block {
  const size = options.size ?? 7.5, labelWidth = options.labelWidth ?? 52, gap = options.gap ?? 8;
  const rows = Array.from({ length: Math.ceil(items.length / count) }, (_, r) => items.slice(r * count, r * count + count));
  const cell = (item: [string, string], width: number, m: Parameters<Block['height']>[1]) => wrapText(pdfText(item[1]), text => m.measure(text, 'regular', size), width - labelWidth, 3);
  const cellWidth = (width: number) => (width - gap * (count - 1)) / count;
  return {
    height: (width, m) => rows.reduce((sum, row) => sum + Math.max(1, ...row.map(item => cell(item, cellWidth(width), m).length)) * lineHeight(size), 0),
    draw(canvas, x, y, width) {
      let top = y; const w = cellWidth(width);
      for (const row of rows) {
        const wrapped = row.map(item => cell(item, w, canvas));
        row.forEach((item, i) => { const left = x + i * (w + gap); canvas.text(item[0], left, top, { size, font: 'bold', maxWidth: labelWidth - 2 }); wrapped[i].forEach((line, n) => canvas.text(line, left + labelWidth, top + n * lineHeight(size), { size })); });
        top += Math.max(1, ...wrapped.map(lines => lines.length)) * lineHeight(size);
      }
    },
  };
}
/** The Doc. / Version / Date lines of a form, only those that are set. */
export const documentLines = (texts: OwnerFormTexts): [string, string][] => [['Doc.', texts.docNo], ['Version', texts.version], ['Date', printDate(texts.date)], ['Procedure', texts.procedureNo]].filter((item): item is [string, string] => Boolean(item[1]));

/** Framed header of [GU] and [MV]: title and project, Doc. / Version / Date / Page; the second frame with the specification lines, the installation data and the section. */
export function guMvHeader(model: OwnerModel, texts: OwnerFormTexts, company: CompanyForDocuments | null, state: PageState): Block {
  const { base } = model, iso = base.iso, project = base.project;
  const text = (value: unknown) => String(value ?? '').trim();
  const frame1 = frameRow([
    { block: stack([textBlock('WELDING REPORT STATIONS/INSTALLATIONS', { size: 11, font: 'bold' }), spacer(2), textBlock(`Project: ${text(model.site?.name)}`, { size: 8.5 })]), width: { fill: 1 } },
    { block: labelLines(documentLines(texts), { state, size: 7.5, labelWidth: 40 }), width: 150 },
  ], { pad: 5 });
  const xray = text(iso.xRay), itp = [text(iso.itpNo), text(iso.itpNo2)].filter(Boolean).join(' / ');
  const installation = labelColumns([
    ['Installation no.', text(iso.irn)], ['Drawing No', `${text(iso.isoNo)}${base.revision ? ` Rev. ${base.revision}` : ''}`], ['Diameter', text(iso.nomDiameter)],
    ['ITP no:', itp], ['PED Cat.:', text(iso.ped)], ['X Ray:', xray && !xray.includes('%') ? `${xray}%` : xray],
  ], 2, { labelWidth: 55 });
  const section = labelColumns([['Section', text(project?.internnumber)], ['Paint spec.', text(iso.paintSpec)], ['Section description', text(project?.description)]], 1, { labelWidth: 82 });
  const frame2 = frameRow([
    ...(texts.specLines.length ? [{ block: stack(texts.specLines.map(line => textBlock(line, { size: 7.5 }))), width: { fill: 1.1 } }] : []),
    { block: installation, width: { fill: 1.9 } }, { block: section, width: { fill: 1.3 } },
  ], { pad: 4 });
  return stack([...(company ? [textBlock(company.company.name, { size: 8.5, font: 'italic' }), spacer(2)] : []), frame1, spacer(3), frame2, spacer(4)]);
}

// ----- signature blocks --------------------------------------------------------------------------------------------------
/** A bordered box with a title and one signature line per label ("Compiled by", "Date", "Signature"); an image goes on the `imageLine`. */
export function signatureBox(title: string, labels: string[], options: { image?: EmbeddedImage | null; imageLine?: string; imageName?: string | null } = {}): Block {
  const ROW = 20, TITLE = 14;
  return {
    height: () => TITLE + ROW * labels.length + 4,
    draw(canvas, x, y, width) {
      canvas.rect(x, y, width, TITLE + ROW * labels.length + 4, { stroke: 0.2, lineWidth: 0.7 });
      canvas.text(title, x + 5, y + 4, { size: 7.5, font: 'bold', maxWidth: width - 10 });
      labels.forEach((label, i) => {
        const top = y + TITLE + i * ROW, labelWidth = Math.min(width * 0.34, 60), start = x + 5 + labelWidth, end = x + width - 6;
        canvas.text(`${label}:`, x + 5, top + ROW - 8 - lineHeight(7), { size: 7, maxWidth: labelWidth - 2 });
        canvas.line(start, top + ROW - 7, end, top + ROW - 7, { width: 0.5 });
        if (options.image && label === options.imageLine) { canvas.image(options.image, start + 2, top + 1, end - start - 4, ROW - 9, 'left'); if (options.imageName) canvas.text(options.imageName, end - 2, top + ROW - 6, { size: 5.5, align: 'right', color: 0.3 }); }
      });
    },
  };
}
/** Three groups side by side: company, Client, NoBo (or "LISL GU/MV" Field 1 to 3 of the main project), each with Compiled by / Date / Signature. */
export function signatureGroups(model: OwnerModel, company: CompanyForDocuments | null, image: EmbeddedImage | null, imageName: string | null): Block {
  const parties = ownerFormTexts(model.site, 'gu').parties;
  const labels = ['Compiled by', 'Date', 'Signature'], titles = [parties[0] || company?.company.name || 'Contractor', parties[1] || model.base.client || 'Client', parties[2] || 'NoBo'];
  const boxes = titles.map((title, i) => signatureBox(title, labels, i === 0 ? { image, imageLine: 'Signature', imageName } : {}));
  return {
    height: (width, m) => boxes[0].height(width, m),
    draw(canvas, x, y, width) { const gap = 10, w = (width - 2 * gap) / 3; boxes.forEach((box, i) => box.draw(canvas, x + i * (w + gap), y, w)); },
  };
}

/** The list of the WPS used by the printed welds, as a second table below the weld table. */
export function wpsTable(headers: string[], rows: string[][], weights: number[]): TableSpec {
  return { columns: headers.map((header, i) => ({ header, width: weights[i] })), rows, size: 7, headerSize: 7, fit: 'wrap', maxLines: 4, padding: 3 };
}

// ----- the renderer ---------------------------------------------------------------------------------------------------------
export interface OwnerParts {
  /** Above the table on every page (frames); the header bands of the columns are added by the renderer. */
  header: Block; columns: OwnerColumn[]; bands: Span[][]; size: number;
  /** After the table, each as a whole. */
  after: Block[]; wps?: TableSpec;
}
export interface OwnerDocument { title: string; page: PageSetup; generatedAt: Date; welds: OwnerWeld[]; record: boolean; build(pdf: PdfBuilder, state: PageState): Promise<OwnerParts> }
/**
 * Draws the document twice: the first pass only counts the pages, so the second pass can write "n of N" in the
 * page header that is drawn before the later pages exist.
 */
export async function renderOwnerDocument(definition: OwnerDocument): Promise<{ bytes: Uint8Array; layout: Layout }> {
  const measure = await textMeasure();
  const pass = async (total: number) => {
    const pdf = await PdfBuilder.create(definition.page, { title: definition.title });
    const state: PageState = { page: 0, total };
    const parts = await definition.build(pdf, state);
    pdf.setFooter(generationStamp(definition.generatedAt));
    pdf.setHeader(stack([parts.header, bandBlock(parts.columns.map(column => column.weight), parts.bands, parts.size)]));
    pdf.addTable(ownerTable(parts.columns, definition.welds, definition.record, pdf.contentWidth, parts.size, measure));
    for (const block of parts.after) { pdf.space(8); pdf.add(block); }
    if (parts.wps?.rows.length) { pdf.space(10); pdf.addTable(parts.wps); }
    return { bytes: await pdf.save(), layout: pdf.layout };
  };
  const first = await pass(0);
  return pass(first.layout.pages.length);
}

// ----- [GU] ----------------------------------------------------------------------------------------------------------------
export interface OwnerFormInput {
  model: OwnerModel; options: LislOptions; company: CompanyForDocuments | null;
  /** The current user's short signature, placed on the signature line when "Signature on each page" is ticked. */
  signature: { content: Uint8Array; name: string; nameUnder: boolean } | null;
  generatedAt: Date;
  /** Public origin of the app; the QR code of the Rev forms points to the isometric below it. */
  origin?: string;
}
export const OWNER_PAGE: PageSetup = { size: 'A4', orientation: 'landscape', margins: { left: 14, right: 14, top: 18, bottom: 16 } };
/** Material-side columns shared by [GU] and [MV]; `scale` stretches the weights. */
export function materialColumns(scale = 1): OwnerColumn[] {
  const w = (value: number) => value * scale;
  return [
    { header: ['Index', 'No.'], weight: w(22), side: true, cell: weld => [weld.sides[0].index, weld.sides[1].index] },
    { header: ['Charge Nr.'], weight: w(38), side: true, cell: (weld, record) => record ? [weld.sides[0].charge, weld.sides[1].charge] : ['', ''] },
    { header: ['AP item', 'code'], weight: w(30), side: true, cell: weld => [weld.sides[0].item, weld.sides[1].item] },
    { header: ['Diam.', 'DN'], weight: w(24), side: true, cell: weld => [weld.sides[0].dn, weld.sides[1].dn] },
    { header: ['WT', 'mm'], weight: w(20), side: true, cell: weld => [weld.sides[0].wt, weld.sides[1].wt] },
    { header: ['Material', 'Type /', 'quality'], weight: w(42), side: true, cell: weld => [weld.sides[0].type, weld.sides[1].type] },
    { header: ['Pipe', 'Coating'], weight: w(38), side: true, cell: weld => [weld.sides[0].coating, weld.sides[1].coating] },
    { header: ['Description', 'of material'], weight: w(48), side: true, cell: weld => [weld.sides[0].description, weld.sides[1].description] },
    { header: ['POS'], weight: w(17), side: true, cell: weld => [weld.sides[0].pos, weld.sides[1].pos] },
  ];
}
export const MATERIAL_BAND: Span = { label: 'Identifications code', from: 0, to: 2 };
const recorded = (record: boolean, value: string) => record ? value : '';

/** Signature image and name for the signature line, or nothing. */
export async function signatureOf(pdf: PdfBuilder, input: OwnerFormInput) {
  const image = input.options.signaturePerPage && input.signature ? await pdf.embedImage(input.signature.content) : null;
  return { image, name: input.signature?.nameUnder ? input.signature.name : null };
}

/** WPS list rows: `[a, b, definition]` per WPS. */
export const wpsRows = (model: OwnerModel, pick: (wps: OwnerModel['wps'][number]) => [string, string]): string[][] => model.wps.map(wps => [...pick(wps), wps.definition]);

export function lislGuPdf(input: OwnerFormInput) {
  const { model } = input, texts = ownerFormTexts(model.site, 'gu');
  const right: OwnerColumn[] = [
    { header: ['Weld No.'], weight: 30, cell: weld => [weld.weldNo, weld.typeName].filter(Boolean).join('\n') },
    { header: ['Welders'], weight: 32, cell: (weld, record) => recorded(record, weld.welders.filter(Boolean).join(', ')) },
    { header: ['Date'], weight: 36, cell: (weld, record) => recorded(record, weld.date) },
    { header: ['WPS'], weight: 48, cell: (weld, record) => recorded(record, weld.wps) },
    ...ndtPairColumns('gu', 14, 40),
    { header: ['Field', 'coating', 'weld'], weight: 30, cell: weld => weld.weldCoating },
  ];
  const columns = [...materialColumns(), ...right], first = 9 + 4;
  const ndtEnd = first + 2 * NDT_FORM_COLUMNS.gu.length - 1;
  return renderOwnerDocument({
    title: `ISO ${String(model.base.iso.isoNo ?? '')} - LISL Report [GU]`, page: OWNER_PAGE, generatedAt: input.generatedAt, welds: model.welds, record: input.options.weldRecord,
    async build(pdf, state) {
      const { image, name } = await signatureOf(pdf, input);
      return {
        header: guMvHeader(model, texts, input.company, state), columns, size: 5.5,
        bands: [[MATERIAL_BAND, { label: 'Not Destructive Test', from: first, to: ndtEnd }], ndtMethodBand('gu', first)],
        after: [signatureGroups(model, input.company, image, name)],
        wps: wpsTable(['WPS code', 'WPS name', 'Definition'], wpsRows(model, wps => [wps.method, wps.name]), [1, 2, 7]),
      };
    },
  });
}

// ----- the documents of the registry ------------------------------------------------------------------------------------------
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const safe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
/**
 * What the registry's entries of the four documents share: the model of the isometric, company data and the
 * signature; `render` is the form's own function. `PDF_DOCUMENTS` (`documents.ts`) passes the parsed dialog options.
 */
export async function ownerLislResult(request: PdfRequest, options: LislOptions, suffix: string, render: (input: OwnerFormInput) => Promise<{ bytes: Uint8Array }>): Promise<PdfResult> {
  const { store, documents, user, iso, rows, now } = request;
  const project = rows.projects?.find(row => row.id === iso.projectId) ?? store.list('projects').find(row => row.id === iso.projectId);
  const model = ownerModel(rows, iso.id, options.type, store.list('sites').find(row => row.id === project?.siteId));
  if (!model) throw new AppError(404, 'This isometric could not be found.');
  const signature = options.signaturePerPage ? currentSignature(store, documents, user.id, 'Short signature') : null;
  const { bytes } = await render({ model, options, company: companyForDocuments(store, documents), signature: signature && { content: signature.content, name: signature.name, nameUnder: signature.nameUnder }, generatedAt: now, origin: request.origin });
  return { bytes, fileName: `${isoDate(now)}-${safe(model.base.project?.internnumber, 'project')}-LISL${suffix}` };
}
