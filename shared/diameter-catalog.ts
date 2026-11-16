/**
 * The diameter catalog of the reference (Weld Pilot → Material data → Weld diameters): standard pipe sizes, reducer pairs and
 * hand-added sizes, as Diameter, Size in mm, Size in inches, Outline in mm and Sorting. The rows live in
 * `diameter-catalog-data.ts` (generated from the capture with scripts/build-diameter-catalog.ts); the sample workspace and the
 * hosted preparation step both load them with `server/diameter-catalog.ts`, which never touches a diameter that exists.
 */
import { parseDiameterDecimal } from './welder-data.ts';

export interface DiameterCatalogRow {
  /** The row's number in the reference (kept in the generated record id, so a reload finds its own rows). */
  ref: number;
  diameter: string;
  size: number;
  sizeinch: number | null;
  outline: number | null;
  sorting: number | null;
}
export interface SkippedDiameter { ref: number | null; diameter: string; reason: string }

/** Entries a person typed to try the sandbox out, not sizes. */
const TEST_ENTRY = /\b(test|testing|tst|asdf?|qwe\w*|xxx+|demo|sample)\b/i;

/**
 * Diameter rows of a captured table (`DTROW || cell | cell | …` lines, or the drawn `TR` rows: Diameter, Size in mm, Size in inches, Outline in mm, Sorting,
 * then the options cell that carries the row number as data-id). A comma becomes a point; a size in inches or outline that is only
 * a dash or a point (the reference holds `-`, `--` and `.` there) is left empty. Test entries, rows without a numeric size in mm and
 * repeated diameter texts are skipped and listed.
 */
export function parseDiameterCapture(capture: string): { rows: DiameterCatalogRow[]; skipped: SkippedDiameter[] } {
  const rows: DiameterCatalogRow[] = [], skipped: SkippedDiameter[] = [], seen = new Set<string>();
  for (const line of capture.split(/\r?\n/)) {
    // A row the capture holds in memory (`DTROW || …`) or draws (`TR … role="row" || …` with the edit button of a diameter).
    const trimmed = line.trimStart(), start = trimmed.indexOf(' || ');
    if (start < 0 || !(trimmed.startsWith('DTROW ') || trimmed.startsWith('TR ') && trimmed.includes('open-editWeldDiameters'))) continue;
    const cells = trimmed.slice(start + 4).split(' | ');
    const [diameter = '', size = '', sizeinch = '', outline = '', sorting = '', options = ''] = cells.map(cell => cell.trim());
    const ref = Number(/data-id="(\d+)"/.exec(options)?.[1]) || null;
    const skip = (reason: string) => skipped.push({ ref, diameter, reason });
    if (!diameter || diameter === '-') { skip('no diameter text'); continue; }
    if (TEST_ENTRY.test(diameter)) { skip('test entry'); continue; }
    const sizeMm = parseDiameterDecimal(size === '-' ? '' : size);
    if (typeof sizeMm !== 'number') { skip(`Size in mm "${size}" is not a number`); continue; }
    if (seen.has(diameter)) { skip('the same diameter text appears again'); continue; }
    const optional = (value: string) => { const parsed = parseDiameterDecimal(/^[-.]+$/.test(value) ? '' : value); return typeof parsed === 'number' ? parsed : null; };
    const order = parseDiameterDecimal(sorting === '-' ? '' : sorting);
    seen.add(diameter);
    rows.push({ ref: ref ?? rows.length + 1, diameter, size: sizeMm, sizeinch: optional(sizeinch), outline: optional(outline), sorting: typeof order === 'number' ? order : null });
  }
  return { rows, skipped };
}

/** The stored record of a catalog row (Size in inches, Outline and Sorting left out when empty). */
export const diameterRecord = (row: DiameterCatalogRow): Record<string, unknown> => ({ diameter: row.diameter, size: row.size, ...(row.sizeinch !== null ? { sizeinch: row.sizeinch } : {}), ...(row.outline !== null ? { outline: row.outline } : {}), ...(row.sorting !== null ? { sorting: row.sorting } : {}) });
export const diameterCatalogId = (row: DiameterCatalogRow) => `diameter-catalog-${row.ref}`;
/** Catalog rows no stored diameter (active or deleted, compared by its Diameter text) stands for yet. */
export const missingDiameters = (catalog: DiameterCatalogRow[], existing: { id: string; diameter?: unknown }[]) => {
  const texts = new Set(existing.map(row => String(row.diameter ?? '').trim())), ids = new Set(existing.map(row => row.id));
  return catalog.filter(row => !texts.has(row.diameter) && !ids.has(diameterCatalogId(row)));
};
