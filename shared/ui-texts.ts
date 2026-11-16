/** Texts of lists and pages in the hosted profile, as the reference words them. */
export const EMPTY_TABLE_TEXT = 'No data available in table';
export const NO_MATCH_TEXT = 'No matching records found';
/** "Showing 1 to 20 of 57 entries" (the position of the visible rows in the list). */
export const entriesText = (start: number, end: number, total: number) => total > 0 ? `Showing ${start} to ${end} of ${total} entries` : 'Showing 0 to 0 of 0 entries';
