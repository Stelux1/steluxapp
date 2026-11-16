/**
 * Links and file names shared by the printable documents.
 *
 * `weldLink` is the one place that decides what a weld QR code says: the URL of the weld in our app. The
 * server knows its public origin only when `STELUX_PUBLIC_URL` is configured; without it the QR holds the
 * relative app path, which a scanner inside the signed-in app can still open.
 */
export type LinkPilot = 'weld' | 'mto';

/** Path (and query) of a weld inside the app: the isometric workspace of its pilot with `?weld=<id>`. */
export function weldPath(input: { isoId: string; weldId: string; pilot?: LinkPilot }): string {
  return `/${input.pilot ?? 'weld'}/workspace/isometrics/${encodeURIComponent(input.isoId)}?weld=${encodeURIComponent(input.weldId)}`;
}

/** The text a weld QR code encodes: `<origin>/weld/workspace/isometrics/<iso>?weld=<id>`, or the same path without the origin. */
export function weldLink(input: { origin?: string | null; isoId: string; weldId: string; pilot?: LinkPilot }): string {
  const origin = String(input.origin ?? '').trim().replace(/\/+$/, '');
  return `${/^https?:\/\/[^/\s]+$/i.test(origin) ? origin : ''}${weldPath(input)}`;
}

/** A value usable inside a file name. */
export const fileSafe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
/** yyyy-mm-dd of a date (UTC, like the other documents). */
export const fileDay = (date: Date) => date.toISOString().slice(0, 10);

/** Quantities and other numbers as printed: up to three decimals, no trailing zeros. */
export const printedNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : '';
};

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
/** Natural order (W2 before W10). */
export const naturalCompare = natural;
