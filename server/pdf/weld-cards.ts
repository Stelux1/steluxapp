import { AppError } from '../store.ts';
import { PdfBuilder, FOOTER_HEIGHT, GREY_LINE, columns, lineHeight, spacer, type Block, type Canvas, type PageSetup } from './engine.ts';
import { generationStamp } from './document.ts';
import type { PdfDocumentDefinition } from './documents.ts';
import { fileDay, fileSafe, naturalCompare, weldLink } from './links.ts';
import { currentRevision } from '../../shared/revisions.ts';
import type { Row } from '../../shared/types.ts';

/**
 * Weld cards (Weld Pilot, isometric -> Reports -> "Weld card"): one card per selected weld, four or eight
 * cards per A4 page with dashed cut lines. Each card holds the identification of the weld, a QR code with the
 * weld's URL in our app and ruled fields the shop floor fills in by hand. Weld labels (`weld-labels.ts`) reuse
 * the weld selection, the facts of a weld and `renderBlocks` below.
 */

type Rows = Record<string, Row[]>;
const text = (value: unknown) => String(value ?? '').trim();
const find = (rows: Rows, key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);

/** What a card or label prints about one weld. */
export interface WeldFacts {
  id: string; weldNo: string; type: string; typeShort: string; diameter: string; wps: string; spool: string;
  /** The text of the QR code. */
  url: string;
}
export interface IsometricFacts { project: string; projectDescription: string; isoNo: string; revision: string }

export function isometricFacts(rows: Rows, iso: Row): IsometricFacts {
  const project = find(rows, 'projects', iso.projectId);
  return { project: text(project?.internnumber), projectDescription: text(project?.description), isoNo: text(iso.isoNo), revision: text(currentRevision(rows, iso.id, 'ISO') || iso.revNo) };
}
export function weldFacts(rows: Rows, weld: Row, iso: Row, origin?: string | null): WeldFacts {
  const type = find(rows, 'weld_types', weld.typeId), diameter = find(rows, 'diameters', weld.diameterId);
  const length = weld.lengthMode === 'Length in mm' && Number(weld.dialen) ? `${Number(weld.dialen)} mm` : '';
  return {
    id: weld.id, weldNo: text(weld.weldNo), type: text(type?.name), typeShort: text(type?.abbreviation) || text(type?.name),
    diameter: text(diameter?.diameter) || length, wps: text(find(rows, 'wps', weld.wpsId)?.name), spool: text(find(rows, 'spools', weld.spoolId)?.name),
    url: weldLink({ origin, isoId: iso.id, weldId: weld.id }),
  };
}

/**
 * The welds to print: `selection` is empty or "all" for every active weld of the isometric, otherwise a comma
 * separated list of weld ids of that isometric. The result is in weld-number order.
 */
export function selectWelds(rows: Rows, isoId: string, selection?: string): Row[] {
  const all = (rows.welds || []).filter(weld => !weld._archived && weld.isoId === isoId).sort((a, b) => naturalCompare(text(a.weldNo), text(b.weldNo)) || a.id.localeCompare(b.id));
  const value = text(selection);
  if (!value || value.toLowerCase() === 'all') {
    if (!all.length) throw new AppError(422, 'This isometric has no welds to print.', { welds: 'This isometric has no welds to print.' });
    return all;
  }
  const ids = [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))];
  const chosen = ids.map(id => all.find(weld => weld.id === id));
  if (!ids.length || chosen.some(weld => !weld)) throw new AppError(422, 'Choose welds of this isometric.', { welds: 'Choose welds of this isometric.' });
  return (chosen as Row[]).sort((a, b) => naturalCompare(text(a.weldNo), text(b.weldNo)) || a.id.localeCompare(b.id));
}

/** Lays blocks under each other from the top margin (a page break when one does not fit), with the footer of every document. */
export async function renderBlocks(input: { page: PageSetup; title: string; generatedAt: Date; blocks: Block[] }) {
  const pdf = await PdfBuilder.create(input.page, { title: input.title });
  pdf.setFooter(generationStamp(input.generatedAt));
  for (const block of input.blocks) pdf.add(block);
  return { bytes: await pdf.save(), layout: pdf.layout };
}

// ----- card geometry ------------------------------------------------------------------------------------------
export const CARD_MARGIN = 20;
export const CARDS_PER_PAGE = [4, 8] as const;
export type CardsPerPage = typeof CARDS_PER_PAGE[number];
export interface CardGeometry { perPage: CardsPerPage; columns: number; rows: number; cardWidth: number; cardHeight: number; left: number; top: number }
/** Position and size of the cards on an A4 portrait page: two columns, two or four rows, filling the space above the footer. */
export function cardGeometry(perPage: CardsPerPage, pageWidth = 595.28, pageHeight = 841.89): CardGeometry {
  const rows = perPage / 2, available = pageHeight - 2 * CARD_MARGIN - FOOTER_HEIGHT;
  return { perPage, columns: 2, rows, cardWidth: (pageWidth - 2 * CARD_MARGIN) / 2, cardHeight: Math.floor(available / rows), left: CARD_MARGIN, top: CARD_MARGIN };
}

interface CardStyle { pad: number; body: number; label: number; weldNo: number; qr: number; detailLabel: number }
const cardStyle = (perPage: CardsPerPage): CardStyle => perPage === 4
  ? { pad: 14, body: 9.5, label: 7, weldNo: 24, qr: 86, detailLabel: 54 }
  : { pad: 9, body: 8, label: 6, weldNo: 16, qr: 62, detailLabel: 44 };

/** The fields filled in by hand: label, then a ruled line. Two columns, three rows. */
export const HAND_FIELDS = [['Welder', 'Heat no. side 1'], ['Fit-up date', 'Heat no. side 2'], ['Weld date', 'VT']] as const;

function drawDashedBox(canvas: Canvas, x: number, y: number, width: number, height: number) {
  const dash = { width: 0.4, color: 0.45, dash: [3, 2] };
  canvas.line(x, y, x + width, y, dash); canvas.line(x, y + height, x + width, y + height, dash);
  canvas.line(x, y, x, y + height, dash); canvas.line(x + width, y, x + width, y + height, dash);
}

/** One weld card, `height` points tall at whatever width the grid gives it. */
export function weldCardBlock(weld: WeldFacts, iso: IsometricFacts, perPage: CardsPerPage, height: number): Block {
  const s = cardStyle(perPage);
  return {
    height: () => height,
    draw(canvas, x, y, width) {
      drawDashedBox(canvas, x, y, width, height);
      const left = x + s.pad, inner = width - 2 * s.pad, textWidth = inner - s.qr - 8, line = lineHeight(s.body);
      let top = y + s.pad;
      canvas.text('WELD CARD', left, top, { size: s.label, font: 'bold', color: 0.4, maxWidth: textWidth });
      top += lineHeight(s.label) + 1;
      const detail = (label: string, value: string, bold = false) => {
        canvas.text(label, left, top + (s.body - (s.label + 0.5)) * 0.9, { size: s.label + 0.5, color: 0.35, maxWidth: s.detailLabel - 2 });
        canvas.text(value, left + s.detailLabel, top, { size: s.body, font: bold ? 'bold' : 'regular', maxWidth: textWidth - s.detailLabel });
        top += line;
      };
      detail('Project', iso.project, true);
      detail('Isometric', `${iso.isoNo}${iso.revision ? ` Rev. ${iso.revision}` : ''}`, true);
      canvas.text('Weld no.', left, top + (s.weldNo - (s.label + 0.5)) * 0.9, { size: s.label + 0.5, color: 0.35, maxWidth: s.detailLabel - 2 });
      canvas.text(weld.weldNo, left + s.detailLabel, top, { size: s.weldNo, font: 'bold', maxWidth: textWidth - s.detailLabel });
      top += lineHeight(s.weldNo) + 1;
      detail('Type', weld.type); detail('Diameter', weld.diameter); detail('WPS', weld.wps); detail('Spool', weld.spool);
      canvas.qr(weld.url, x + width - s.pad - s.qr, y + s.pad, s.qr);
      // Fields to fill in by hand, two columns of ruled lines filling what is left of the card.
      const fieldsTop = Math.max(top, y + s.pad + s.qr) + (perPage === 4 ? 12 : 6), rowHeight = (y + height - s.pad - fieldsTop) / HAND_FIELDS.length, gap = 12, cell = (inner - gap) / 2;
      HAND_FIELDS.forEach((pair, r) => pair.forEach((label, c) => {
        const cx = left + c * (cell + gap), cy = fieldsTop + r * rowHeight;
        canvas.text(label, cx, cy + rowHeight - 5 - lineHeight(s.label + 0.5) - 1, { size: s.label + 0.5, color: 0.35, maxWidth: cell });
        canvas.line(cx, cy + rowHeight - 5, cx + cell, cy + rowHeight - 5, { width: 0.6, color: GREY_LINE });
      }));
    },
  };
}

/** The cards in rows of two, as blocks that exactly fill the page height. */
export function cardRows(welds: WeldFacts[], iso: IsometricFacts, perPage: CardsPerPage): Block[] {
  const geometry = cardGeometry(perPage), rows: Block[] = [];
  for (let i = 0; i < welds.length; i += geometry.columns) {
    const pair = welds.slice(i, i + geometry.columns);
    rows.push(columns(Array.from({ length: geometry.columns }, (_, c) => ({ block: pair[c] ? weldCardBlock(pair[c], iso, perPage, geometry.cardHeight) : spacer(geometry.cardHeight), width: { fill: 1 } })), 0));
  }
  return rows;
}

export interface WeldCardsInput { welds: WeldFacts[]; iso: IsometricFacts; perPage: CardsPerPage; generatedAt: Date }
export function weldCardsPdf(input: WeldCardsInput) {
  return renderBlocks({ page: { size: 'A4', orientation: 'portrait', margins: { top: CARD_MARGIN, bottom: CARD_MARGIN, left: CARD_MARGIN, right: CARD_MARGIN } }, title: `Weld cards - ${input.iso.isoNo}`, generatedAt: input.generatedAt, blocks: cardRows(input.welds, input.iso, input.perPage) });
}

/** "4" or "8" (default 4). */
export function cardsPerPage(value: string | undefined): CardsPerPage {
  const wanted = text(value) || '4';
  const found = CARDS_PER_PAGE.find(count => String(count) === wanted);
  if (!found) throw new AppError(422, 'Choose 4 or 8 cards per page.', { perPage: 'Choose 4 or 8 cards per page.' });
  return found;
}

export const weldCardsDocument: PdfDocumentDefinition = {
  key: 'weld-cards', title: 'Weld card', report: 'weld-cards',
  async build({ iso, rows, query, now, publicOrigin }) {
    const perPage = cardsPerPage(query.perPage), selected = selectWelds(rows, iso.id, query.welds);
    const facts = isometricFacts(rows, iso);
    const { bytes } = await weldCardsPdf({ welds: selected.map(weld => weldFacts(rows, weld, iso, publicOrigin)), iso: facts, perPage, generatedAt: now });
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(facts.project, 'project')}-${fileSafe(facts.isoNo, 'iso')}-weld-cards` };
  },
};
