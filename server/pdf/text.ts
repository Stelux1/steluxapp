/**
 * Text helpers of the PDF engine: the one place that decides how characters the embedded Helvetica fonts
 * (WinAnsi encoding) cannot show are written, plus measured wrapping and truncation.
 */

/** Code points WinAnsi (Windows-1252) can show; the 0x80-0x9f block maps to these Unicode characters. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('').map(char => char.charCodeAt(0)));
export const winAnsiSupports = (code: number) => code === 0x09 || code === 0x0a || code >= 0x20 && code <= 0x7e || code >= 0xa0 && code <= 0xff || WIN_ANSI_EXTRA.has(code);

/** Letters without a WinAnsi glyph, in one deterministic table (Serbian / Croatian Latin first, then neighbours). */
const TRANSLITERATION: Record<string, string> = {
  č: 'c', ć: 'c', đ: 'dj', Č: 'C', Ć: 'C', Đ: 'Dj',
  ł: 'l', Ł: 'L', ń: 'n', Ń: 'N', ś: 's', Ś: 'S', ź: 'z', Ź: 'Z', ż: 'z', Ż: 'Z', ą: 'a', Ą: 'A', ę: 'e', Ę: 'E',
  ő: 'o', Ő: 'O', ű: 'u', Ű: 'U', ř: 'r', Ř: 'R', ě: 'e', Ě: 'E', ď: 'd', Ď: 'D', ť: 't', Ť: 'T', ň: 'n', Ň: 'N', ů: 'u', Ů: 'U',
  ā: 'a', Ā: 'A', ē: 'e', Ē: 'E', ī: 'i', Ī: 'I', ū: 'u', Ū: 'U', ğ: 'g', Ğ: 'G', ş: 's', Ş: 'S', ı: 'i', İ: 'I', ț: 't', Ț: 'T', ș: 's', Ș: 'S', ă: 'a', Ă: 'A',
  ẞ: 'SS', '‐': '-', '‑': '-', '‒': '-', '−': '-', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≠': '!=',
};
/**
 * The text as it is written to the PDF. Characters WinAnsi shows (including š ž Š Ž and the Dutch / German
 * letters) stay; the rest follows TRANSLITERATION, then loses its accent (NFD), then becomes "?".
 * Control characters become spaces (a line feed stays so callers can split lines first). Never throws.
 */
export function pdfText(value: unknown): string {
  let output = '';
  for (const char of String(value ?? '').normalize('NFC')) {
    const code = char.codePointAt(0)!;
    if (char === '\n') output += char;
    else if (code < 0x20 || code === 0x7f) output += ' ';
    else if (winAnsiSupports(code)) output += char;
    else if (TRANSLITERATION[char] !== undefined) output += TRANSLITERATION[char];
    else {
      const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
      output += base !== char && [...base].every(item => winAnsiSupports(item.codePointAt(0)!)) ? base : '?';
    }
  }
  return output;
}

export type Measure = (text: string) => number;
const ELLIPSIS = '...';

/** Cut a single line to `maxWidth`, ending in "..." when it had to be shortened. */
export function truncateText(text: string, measure: Measure, maxWidth: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (measure(line) <= maxWidth) return line;
  if (measure(ELLIPSIS) > maxWidth) return '';
  let end = line.length;
  while (end > 0 && measure(line.slice(0, end).trimEnd() + ELLIPSIS) > maxWidth) end--;
  return line.slice(0, end).trimEnd() + ELLIPSIS;
}

/**
 * Break text into lines no wider than `maxWidth`: at spaces, hard line feeds are kept, and a word wider than
 * the box is broken by characters. With `maxLines` the surplus is dropped and the last line ends in "...".
 */
export function wrapText(text: string, measure: Measure, maxWidth: number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    const push = () => { lines.push(line); line = ''; };
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) push();
      let rest = word;
      while (measure(rest) > maxWidth) {
        let end = rest.length - 1;
        while (end > 1 && measure(rest.slice(0, end)) > maxWidth) end--;
        const cut = Math.max(end, 1);
        lines.push(rest.slice(0, cut)); rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line || !paragraph) push();
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(maxLines, 1));
  kept[kept.length - 1] = truncateText(`${kept[kept.length - 1]} ${lines[kept.length]}`, measure, maxWidth);
  return kept;
}
