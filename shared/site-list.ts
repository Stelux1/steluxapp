import type { Row } from './types.ts';

/**
 * General data → Project sites (reference table): columns Name, Address, Phone, Email address, IRN Code, Options, sorted by
 * IRN Code, 20 rows per page with 5 / 20 / 50 / 100 / 500, search over the shown columns.
 */
export const SITE_LIST_COLUMNS = ['name', 'address', 'phone', 'email', 'irnCode'] as const;
export const SITE_PAGE_SIZES = [5, 20, 50, 100, 500];
export const SITE_DEFAULT_SORT = { field: 'irnCode', direction: 1 as 1 | -1 };
const text = (value: unknown) => String(value ?? '').trim();
/** The rows of the list: active or archived, matching the search in any shown column, in the chosen order (equal values by name). */
export function siteListRows(rows: Row[], { archived, query, sort }: { archived: boolean; query: string; sort: { field: string; direction: 1 | -1 } }): Row[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => row._archived === archived && (!needle || SITE_LIST_COLUMNS.some(column => text(row[column]).toLowerCase().includes(needle))))
    .sort((a, b) => text(a[sort.field]).localeCompare(text(b[sort.field]), 'en', { numeric: true }) * sort.direction || text(a.name).localeCompare(text(b.name), 'en', { numeric: true }));
}
