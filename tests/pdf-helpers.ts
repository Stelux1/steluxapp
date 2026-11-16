import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, type PDFPage } from 'pdf-lib';

/** Page sizes and the text drawn on every page of a generated PDF, read back with pdf-lib (hex strings of the WinAnsi fonts decoded). */
export async function readPdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages().map(page => ({ width: Math.round(page.getWidth()), height: Math.round(page.getHeight()), text: pageText(doc, page) }));
  return { doc, pages };
}
function streamsOf(doc: PDFDocument, page: PDFPage): string[] {
  const contents = page.node.get(PDFName.of('Contents')), list: unknown[] = [];
  const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
  if (resolved instanceof PDFArray) for (let i = 0; i < resolved.size(); i++) list.push(doc.context.lookup(resolved.get(i)));
  else list.push(resolved);
  return list.filter((item): item is PDFRawStream => item instanceof PDFRawStream).map(stream => {
    const raw = Buffer.from(stream.contents), filter = stream.dict.get(PDFName.of('Filter'));
    return (filter ? inflateSync(raw) : raw).toString('latin1');
  });
}
/** Every string shown on the page, in drawing order. */
export function pageText(doc: PDFDocument, page: PDFPage): string[] {
  const output: string[] = [];
  for (const stream of streamsOf(doc, page)) for (const match of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) output.push(Buffer.from(match[1], 'hex').toString('latin1'));
  return output;
}
