/**
 * Weld numbers that do not stand for a real weld (reference: Export weld data "E | E12, 09E | End / appendage", GAP,
 * SP and B, which the dashboard leaves out; the weld form turns them into gap / spool / existing entries).
 * One predicate for every reader: a code next to digits, at the start (E12, B12, GAP3, SP01) or after the digits
 * (09E, 07B, 12GAP, 1SP2, digits may follow), case-insensitive. An ordinary number such as 120 or 005A is no code.
 */
export const NON_WELD_CODES = ['GAP', 'SP', 'E', 'B'] as const;
export type NonWeldCode = typeof NON_WELD_CODES[number];

const PATTERN = /^(?:(GAP|SP|E|B)\d+|\d+(GAP|SP|E|B)\d*)$/i;

/** The code a weld number carries, or null for an ordinary weld number. */
export function nonWeldCode(weldNo: unknown): NonWeldCode | null {
  const match = PATTERN.exec(String(weldNo ?? '').trim());
  return match ? (match[1] || match[2]).toUpperCase() as NonWeldCode : null;
}
/** True for a weld number coded GAP, SP, E or B, unless that code is in `included` (the export's ticked codes). */
export function isNonWeldCode(weldNo: unknown, included: readonly string[] = []): boolean {
  const code = nonWeldCode(weldNo);
  return code !== null && !included.map(value => value.toUpperCase()).includes(code);
}
