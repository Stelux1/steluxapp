import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfBuilder, box, columns, labelValueGrid, qrMatrix, spacer, stack, textBlock, type TableSpec } from '../server/pdf/engine.ts';
import { renderDocument } from '../server/pdf/document.ts';
import { pdfText, truncateText, wrapText } from '../server/pdf/text.ts';
import { readPdf } from './pdf-helpers.ts';

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const fixedWidth = (text: string) => text.length * 5;

test('text that WinAnsi cannot show is transliterated deterministically and never throws', () => {
  assert.equal(pdfText('Čačak Ćuprija Đorđe'), 'Cacak Cuprija Djordje');
  assert.equal(pdfText('Šabac Žarko'), 'Šabac Žarko', 'š and ž exist in WinAnsi and stay');
  assert.equal(pdfText('Müller Çelik Zoë Ångström Łódź'), 'Müller Çelik Zoë Ångström Lódz');
  assert.equal(pdfText('а'), '?', 'a script with no mapping becomes a question mark');
  assert.equal(pdfText('a\tb\u0000c\nd'), 'a b c\nd');
  assert.equal(pdfText(null), '');
  assert.equal(pdfText('Čačak'), pdfText('Čačak'));
});

test('wrapping breaks at spaces, breaks over-long words, keeps hard line feeds and truncates with an ellipsis', () => {
  assert.deepEqual(wrapText('aaa bbb ccc', fixedWidth, 35), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrapText('abcdefghij', fixedWidth, 20), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(wrapText('one\ntwo', fixedWidth, 100), ['one', 'two']);
  const lines = wrapText('aaa bbb ccc ddd', fixedWidth, 20, 2);
  assert.equal(lines.length, 2); assert.ok(lines[1].endsWith('...')); assert.ok(fixedWidth(lines[1]) <= 20);
  assert.equal(truncateText('short', fixedWidth, 100), 'short');
  const cut = truncateText('a very long piece of text', fixedWidth, 60); assert.ok(cut.endsWith('...') && fixedWidth(cut) <= 60);
});

test('the QR matrix is square, grows with the data and draws only dark modules', async () => {
  const small = qrMatrix('A'), large = qrMatrix('https://example.test/' + 'x'.repeat(60));
  assert.equal(small.length, 21); assert.ok(small.every(row => row.length === 21));
  assert.ok(large.length > 21 && (large.length - 17) % 4 === 0);
  assert.ok(small[0][0] && small[0][6] && small[6][0], 'finder pattern corner is dark');
  const { layout } = await renderDocument({ page: { size: 'A4', orientation: 'portrait' }, title: 'qr', generatedAt: new Date(2026, 10, 16, 9, 5), layout: () => ({ header: { height: () => 60, draw: canvas => canvas.qr('ISO-1', 28, 28, 50) } }) });
  assert.equal(layout.pages[0].images, 1);
});

function rowsTable(count: number): TableSpec {
  return { columns: [{ header: 'Weld', width: 1 }, { header: ['Side', 'lines'], width: 3 }], rows: Array.from({ length: count }, (_, i) => [[`W-${i}`, `type ${i}`], [`first side of ${i}`, `second side of ${i}`]]), fit: 'truncate', minLines: 2, size: 7 };
}

test('tables break between rows only, repeat the header row and keep every row on one page', async () => {
  const { layout, bytes } = await renderDocument({
    page: { size: 'A4', orientation: 'portrait' }, title: 'rows', generatedAt: new Date(2026, 10, 16, 9, 5),
    layout: () => ({ header: textBlock('Page header', { size: 12, font: 'bold' }), table: rowsTable(120), after: [box(textBlock('Acceptance'), { stroke: 0, padding: 6 })] }),
  });
  assert.ok(layout.pages.length >= 3);
  const placed = layout.pages.flatMap(page => page.rows), seen = new Set(placed.map(row => row.index));
  assert.equal(placed.length, 120); assert.equal(seen.size, 120);
  for (const page of layout.pages) {
    assert.ok(page.pageHeader, 'page header on every page'); assert.equal(page.tableHeaders, 1, 'table header row on every page');
    for (const row of page.rows) { assert.equal(row.texts, 4, 'two lines in two cells stay together'); assert.ok(row.bottom <= page.height - 28 - 16 + 0.01, 'row ends above the footer'); assert.ok(row.bottom > row.top); }
    const rowTexts = page.texts.filter(text => text.text.startsWith('W-')).map(text => Number(text.text.slice(2)));
    assert.deepEqual(rowTexts, page.rows.map(row => row.index), 'the weld numbers of the page are the rows of the page');
  }
  const parsed = await readPdf(bytes);
  assert.equal(parsed.pages.length, layout.pages.length);
  assert.ok(parsed.pages.every(page => page.width === 595 && page.height === 842));
  assert.ok(parsed.pages.every(page => page.text.includes('Page header') && page.text.includes('Weld')));
  assert.ok(parsed.pages[0].text.includes('W-0') && parsed.pages.at(-1)!.text.includes('W-119'));
  assert.ok(parsed.pages.at(-1)!.text.includes('Acceptance'), 'the block after the table follows the last row');
  assert.deepEqual(parsed.pages.map((_, i) => `${i + 1}/${parsed.pages.length}`).filter(label => !parsed.pages[Number(label.split('/')[0]) - 1].text.includes(label)), [], 'footer shows page/pages');
  assert.ok(parsed.pages[0].text.includes('16.11.2026 09:05'), 'footer shows the generation date and time');
});

test('A3 landscape swaps the page size and long cells are cut to their column', async () => {
  const { layout, bytes } = await renderDocument({ page: { size: 'A3', orientation: 'landscape' }, title: 'a3', generatedAt: new Date(), layout: () => ({ table: { columns: [{ header: 'Narrow', width: 1 }, { header: 'Wide', width: 5 }], rows: [['a very long cell that cannot possibly fit into one narrow column', 'x']], fit: 'truncate', size: 7 } }) });
  const parsed = await readPdf(bytes);
  assert.deepEqual([parsed.pages[0].width, parsed.pages[0].height], [1191, 842]);
  const cut = layout.pages[0].texts.find(text => text.text.startsWith('a very'))!;
  assert.ok(cut.text.endsWith('...')); assert.ok(cut.width <= layout.pages[0].width / 6);
});

test('wrapped cells grow the row; blocks (columns, grids, boxes) measure and draw', async () => {
  const pdf = await PdfBuilder.create({ size: 'A4', orientation: 'portrait' });
  const grid = labelValueGrid([{ label: 'Iso number', value: 'STX-1 Rev. 2' }, { label: 'ITP No', value: 'ITP-01' }, { label: 'Asset tag', value: 'AT-1' }], { columns: 3 });
  const layoutBlock = stack([textBlock('Title', { size: 12, font: 'bold' }), spacer(4), columns([{ block: grid, width: { fill: 1 } }, { block: textBlock('Company'), width: 100 }])]);
  pdf.add(layoutBlock);
  pdf.addTable({ columns: [{ header: 'A', width: 1 }], rows: [['one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty']], size: 9 });
  await pdf.save();
  const page = pdf.layout.pages[0];
  assert.ok(page.rows[0].bottom - page.rows[0].top > 14, 'a long cell wraps onto several lines');
  assert.ok(page.texts.some(text => text.text === 'Iso number') && page.texts.some(text => text.text === 'Company'));
});

test('PNG logos embed, damaged images are omitted', async () => {
  const pdf = await PdfBuilder.create({ size: 'A4', orientation: 'portrait' });
  assert.ok(await pdf.embedImage(PNG_1X1));
  assert.equal(await pdf.embedImage(Buffer.from('not an image at all')), null);
  assert.equal(await pdf.embedImage(null), null);
  assert.equal(await pdf.embedImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6])), null, 'a truncated PNG does not throw');
});
