import type { Row } from './types.ts';
import { itpLatest, itpScope, itpSlots, type ItpScope } from './itps.ts';

/**
 * Body of the ITPs card on the isometric page (reference script renderIsoItpLinksTable): one row per ITP of the register
 * that is linked to the isometric, never the free-text ITP numbers. A Shop+Field ITP in the first slot leaves no row
 * for the second. The counter is `itpSlots` (linked / max).
 */
export const ITP_TITLE_LIMIT = 25;
export const NO_ITP_LINKED = 'No ITP linked';

const text = (value: unknown) => String(value ?? '').trim();

/** The title cut to 25 characters plus an ellipsis; the full title stays available as the tooltip. */
export const cutItpTitle = (title: unknown) => { const full = text(title); return full.length > ITP_TITLE_LIMIT ? `${full.slice(0, ITP_TITLE_LIMIT)}…` : full; };

export interface ItpCardRow {
  /** The isometric slot the link sits in (1 = ITP No, 2 = ITP No 2). */
  slot: 1 | 2;
  id: string; number: string; scope: ItpScope | '';
  title: string; titleCut: string;
  /** Latest revision ('' when none is recorded) and its PDF, when the revision has a file. */
  revision: string; file?: Row;
}

export function itpCardRows(iso: Row, itps: Row[] | null | undefined, attachments: Row[] | null | undefined): ItpCardRow[] {
  const register = itps || [];
  const rows: ItpCardRow[] = [];
  for (const [slot, link, typed, typedRev] of [[1, 'itpId', 'itpNo', 'itpRevNo'], [2, 'itp2Id', 'itpNo2', 'itp2RevNo']] as const) {
    const id = text(iso[link]);
    if (!id) continue;
    const itp = register.find(row => row.id === id);
    // The register may be unreadable in this pilot: the number copied into the isometric when it was linked stands in.
    if (!itp) { rows.push({ slot, id, number: text(iso[typed]), scope: '', title: '', titleCut: '', revision: text(iso[typedRev]) }); continue; }
    const latest = itpLatest(itp, attachments || undefined);
    rows.push({ slot, id, number: text(itp.number), scope: itpScope(itp), title: text(itp.title), titleCut: cutItpTitle(itp.title), revision: latest.revNo, ...(latest.file ? { file: latest.file } : {}) });
  }
  // Shop+Field covers both slots: a second row (an older link kept next to it) is not shown.
  return rows.length === 2 && rows[0].scope === 'Shop+Field' ? [rows[0]] : rows;
}

/** Counter and rows of the card in one call. */
export function itpCard(iso: Row, itps: Row[] | null | undefined, attachments: Row[] | null | undefined) {
  const slots = itpSlots(iso, itps || []);
  return { counter: slots.counter, count: slots.count, max: slots.max, canLink: slots.canLink, rows: itpCardRows(iso, itps, attachments) };
}
