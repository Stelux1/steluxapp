/**
 * The diameter standard of a main project (client 17.11.2026, Weld Pilot → Material data → Weld diameters): "ASME (inch)" or "EN (DN)".
 * A new main project gets the 36 sizes of the client's chart of its standard enabled under Weld diameters and every other diameter
 * switched off for it (server/diameter-standard.ts); an older main project keeps every diameter it sees ("no link = enabled") and
 * reads as ASME (inch). This module holds the chart, the names the records carry, and the Unit + Value composition of a custom diameter.
 */
type Values = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '').trim();

export const DIAMETER_STANDARDS = ['ASME (inch)', 'EN (DN)'] as const;
export type DiameterStandard = typeof DIAMETER_STANDARDS[number];
/** The standard a main project works to; anything else (a main project saved before the setting existed) is ASME (inch). */
export const diameterStandard = (site: Values | null | undefined): DiameterStandard => DIAMETER_STANDARDS.find(option => option === text(site?.diameterStandard)) ?? DIAMETER_STANDARDS[0];
export const isEnStandard = (site: Values | null | undefined) => diameterStandard(site) === DIAMETER_STANDARDS[1];

/** One line of the client's chart: the nominal pipe size as the catalog names it (`1.1/4"`), its inch value, its DN and its outside diameter (mm). */
export interface ChartSize { inchName: string; inch: number; dn: number; od: number }
const line = (inchName: string, inch: number, dn: number, od: number): ChartSize => ({ inchName, inch, dn, od });
/** The 36 sizes of the chart in its order. Outside diameters are those of the catalog's inch rows (ASME B36.10); 1/8", 1/4" and 3/8" have none there. */
export const DIAMETER_CHART: readonly ChartSize[] = [
  line('1/8"', 0.125, 6, 10.3), line('1/4"', 0.25, 8, 13.7), line('3/8"', 0.375, 10, 17.1), line('1/2"', 0.5, 15, 21.3), line('3/4"', 0.75, 20, 26.7), line('1"', 1, 25, 33.4),
  line('1.1/4"', 1.25, 32, 42.2), line('1.1/2"', 1.5, 40, 48.3), line('2"', 2, 50, 60.3), line('2.1/2"', 2.5, 65, 73), line('3"', 3, 80, 88.9), line('3.1/2"', 3.5, 90, 101.6),
  line('4"', 4, 100, 114.3), line('5"', 5, 125, 141.3), line('6"', 6, 150, 168.3), line('8"', 8, 200, 219.1), line('10"', 10, 250, 273), line('12"', 12, 300, 323.8),
  line('14"', 14, 350, 355.6), line('16"', 16, 400, 406.4), line('18"', 18, 450, 457), line('20"', 20, 500, 508), line('22"', 22, 550, 559), line('24"', 24, 600, 610),
  line('26"', 26, 650, 660), line('28"', 28, 700, 711), line('30"', 30, 750, 762), line('32"', 32, 800, 813), line('34"', 34, 850, 864), line('36"', 36, 900, 914),
  line('38"', 38, 950, 965), line('40"', 40, 1000, 1016), line('42"', 42, 1050, 1067), line('44"', 44, 1100, 1118), line('46"', 46, 1150, 1168), line('48"', 48, 1200, 1219),
];
/** The record name of a DN size: `DN 50` (with the space, as the client writes it). */
export const dnName = (dn: number | string) => `DN ${dn}`;
/** The 36 record names of a standard, in chart order. */
export const chartNames = (standard: DiameterStandard): string[] => DIAMETER_CHART.map(size => standard === DIAMETER_STANDARDS[1] ? dnName(size.dn) : size.inchName);
/** Outline (circumference) of a pipe: pi x outside diameter, to 0.1 mm. */
export const outlineOf = (od: number) => Math.round(Math.PI * od * 10) / 10;
/** The record a chart size creates when the workspace has none of that name: Diameter, Size in mm (outside diameter), Size in inches, Outline, Sorting (chart position). */
export const chartRecord = (size: ChartSize, standard: DiameterStandard, position: number): Values => ({ diameter: standard === DIAMETER_STANDARDS[1] ? dnName(size.dn) : size.inchName, size: size.od, sizeinch: size.inch, outline: outlineOf(size.od), sorting: position + 1 });
/** Position of a diameter text in the chart of either standard (0 to 35), or -1. `DN50` and `DN 50` both count. */
export function chartPosition(diameter: unknown): number {
  const value = text(diameter).replace(/^DN\s*(\d)/i, 'DN $1');
  return DIAMETER_CHART.findIndex(size => size.inchName === value || dnName(size.dn) === value);
}

// ------------------------------------------------------------------------------------ custom diameter (Unit + Value)
export const DIAMETER_UNITS = ['inch', 'DN', 'mm'] as const;
const unitKind = (unit: string): 'inch' | 'dn' | 'mm' | 'other' => { const key = unit.toLowerCase(); return ['inch', 'in', '"', 'inches'].includes(key) ? 'inch' : key === 'dn' ? 'dn' : key === 'mm' ? 'mm' : 'other'; };
/** The number a diameter value stands for: `2`, `2,5`, `1/2` or `1.1/4` (whole part, point, fraction). null when it is none of those. */
export function diameterValueNumber(value: unknown): number | null {
  const raw = text(value).replace(',', '.');
  const fraction = /^(?:(\d+)\.)?(\d+)\/(\d+)$/.exec(raw);
  if (fraction) { const bottom = Number(fraction[3]); return bottom > 0 ? Number(fraction[1] ?? 0) + Number(fraction[2]) / bottom : null; }
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
}
/** The Diameter text composed from a unit and a value: inch → `2"`, DN → `DN 50`, mm → `12 mm`, another unit → `<value> <unit>`. '' while either is missing. */
export function composeDiameter(unit: unknown, value: unknown): string {
  const u = text(unit), v = text(value).replace(',', '.');
  if (!u || !v) return '';
  const kind = unitKind(u);
  return kind === 'inch' ? `${v}"` : kind === 'dn' ? dnName(v) : kind === 'mm' ? `${v} mm` : `${v} ${u}`;
}
/** What a unit and value fill in for Size in mm, Size in inches and Outline: the chart's outside diameter for an inch or DN size on the chart; mm → size = value (outline too, as the catalog's mm rows). */
export function unitPrefill(unit: unknown, value: unknown): Values {
  const kind = unitKind(text(unit)), number = diameterValueNumber(value);
  if (number === null) return {};
  if (kind === 'mm') return { size: number, outline: number };
  const size = kind === 'inch' ? DIAMETER_CHART.find(entry => Math.abs(entry.inch - number) < 1e-9) : kind === 'dn' ? DIAMETER_CHART.find(entry => entry.dn === number) : undefined;
  if (size) return { size: size.od, sizeinch: size.inch, outline: outlineOf(size.od) };
  return kind === 'inch' ? { sizeinch: number } : {};
}
/** Field errors of a Unit + Value pair: both or neither; the value is a number (an inch value may be a fraction). */
export function unitErrors(unit: unknown, value: unknown): Record<string, string> {
  const u = text(unit), v = text(value), errors: Record<string, string> = {};
  if (!u && !v) return errors;
  if (!u) errors.unit = 'Choose or type the unit.';
  if (!v) errors.unitValue = 'Enter the value.';
  else if (diameterValueNumber(v) === null || (u && unitKind(u) !== 'inch' && /\//.test(v))) errors.unitValue = 'The value must be a number.';
  return errors;
}

// ------------------------------------------------------------------------------------ how a weld's diameter is printed
const DN_TEXT = /^DN\s*\d/i;
/**
 * The diameter label of a weld on the lists and documents: the diameter record's own text when it is a DN size; for a weld of a main
 * project that works to EN (DN) a chart inch size prints as `DN <n>`. '' when the label stays the inch size (`2"`, built by the caller).
 */
export function diameterPrintLabel(diameter: Values | null | undefined, site: Values | null | undefined): string {
  const own = text(diameter?.diameter);
  if (DN_TEXT.test(own)) return own.replace(/^DN\s*/i, 'DN ');
  if (!isEnStandard(site)) return '';
  const inch = Number(text(diameter?.sizeinch)), size = DIAMETER_CHART.find(entry => Math.abs(entry.inch - inch) < 1e-9);
  return size ? dnName(size.dn) : '';
}
