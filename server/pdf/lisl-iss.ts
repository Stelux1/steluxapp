import { columns, imageBlock, spacer, stack, textBlock, type Block, type Canvas, type PageSetup, type PdfBuilder, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { CompanyForDocuments } from './company.ts';
import { bilingual, checkBox, formHeader, infoGrid, measurer, type HeaderCell, type InfoCell } from './form-header.ts';
import { NDT_STANDARD_OPTIONS, type IssModel } from '../../shared/pdf-lisl-iss-wq.ts';
import { ISS_METHOD_COLUMNS } from '../../shared/pdf-ndt-columns-iss-wq.ts';

export interface IssPdfInput { model: IssModel; company: CompanyForDocuments | null; generatedAt: Date }
const MM = 72 / 25.4;
const PAGE: PageSetup = { size: 'A4', orientation: 'landscape', margins: { left: 18, right: 18, top: 20, bottom: 18 } };

/** Table columns before the method columns: relative width and the bilingual heading labels (German, English). */
const LEADING: { width: number; labels: [string, string][] }[] = [
  { width: 52, labels: [['Schweißnaht Nr.', 'Weld No.'], ['Nahtart', 'Weld type']] },
  { width: 66, labels: [['Bezeichnung', 'Description']] },
  { width: 52, labels: [['Durchmesser /', 'Diameter /'], ['Wandstärke', 'Wall thickness']] },
  { width: 60, labels: [['Zeugnisnummer', 'Certificate No.'], ['Schmelze Nr.', 'Heat No.']] },
  { width: 56, labels: [['WPS Nr.', 'WPS No.'], ['PQR Nr.', 'PQR No.']] },
  { width: 52, labels: [['Schweißzusatz', 'Filler'], ['Schmelze Nr.', 'Heat No.']] },
  { width: 50, labels: [['Schweißer ID', 'Welder ID'], ['Schweißdatum', 'Welding date']] },
];
const METHOD_WIDTH = 46, COMMENTS_WIDTH = 56;
/** Heading of a method column: "RT 5 %" with the isometric's percentage, "RT … %" while it is not known. */
export const issMethodHeading = (label: string, percent: string | undefined) => `${label} ${percent || '…'} %`;

/** The three signature boxes at the foot of every page: supplier, inspector and the end client, each with date, section and name. */
function signatureBoxes(model: IssModel): Block {
  const HEIGHT = 44;
  const boxes = [
    { german: 'Lieferant', english: 'Supplier', name: model.supplier }, { german: 'Prüfer', english: 'Inspector', name: '' },
    { german: 'Endkunde', english: 'End client', name: model.owner.ownerName || model.base.client },
  ];
  const fields: [string, string, number][] = [['Datum', 'Date', 0.24], ['Abteilung', 'Section', 0.26], ['Name', 'Name', 0.5]];
  return {
    height: () => HEIGHT,
    draw(canvas: Canvas, x: number, y: number, width: number) {
      const gap = 8, w = (width - 2 * gap) / 3;
      boxes.forEach((box, i) => {
        const left = x + i * (w + gap);
        canvas.rect(left, y, w, HEIGHT, { stroke: 0.2, lineWidth: 0.7 });
        canvas.text(box.german, left + 4, y + 3, { size: 6.5, font: 'bold' });
        canvas.text(`/ ${box.english}`, left + 6 + canvas.measure(box.german, 'bold', 6.5), y + 3.4, { size: 5.7, font: 'italic' });
        if (box.name) canvas.text(box.name, left + w - 4, y + 3, { size: 6.5, align: 'right', maxWidth: w * 0.55 });
        let cursor = left + 4;
        for (const [german, english, share] of fields) {
          const fieldWidth = (w - 8) * share;
          canvas.line(cursor, y + HEIGHT - 12, cursor + fieldWidth - 4, y + HEIGHT - 12, { width: 0.5 });
          canvas.text(german, cursor, y + HEIGHT - 11, { size: 5.4, font: 'bold', maxWidth: fieldWidth - 4 });
          canvas.text(english, cursor, y + HEIGHT - 5.5, { size: 4.8, font: 'italic', maxWidth: fieldWidth - 4 });
          cursor += fieldWidth;
        }
      });
    },
  };
}

/** The "NDT standard" value cell: check boxes ASME and EN ISO, the chosen one crossed. */
const standardBoxes = (ticked: string): InfoCell['extra'] => (canvas, x, y) => {
  let cursor = x; const top = y + 8;
  for (const option of NDT_STANDARD_OPTIONS) {
    checkBox(canvas, cursor, top, 7, ticked === option);
    canvas.text(option, cursor + 9, top, { size: 6.5 });
    cursor += 9 + canvas.measure(option, 'regular', 6.5) + 8;
  }
};

function headerItems(model: IssModel, page: number, total: number): InfoCell[] {
  return [
    { label: bilingual('Zeichnungsnummer', 'Drawing number'), value: model.drawingNo }, { label: bilingual('Blatt', 'Sheet'), value: '' },
    { label: bilingual('Seite n von N', 'Page n of N'), value: `${page} of ${total}` }, { label: bilingual('Spool-Nummer', 'Spool number'), value: model.spools },
    { label: bilingual('Projektname', 'Project name'), value: model.projectName }, { label: bilingual('Anlagenstrang', 'Train'), value: model.owner.issTrain },
    { label: bilingual('Projektnummer', 'Project number'), value: model.projectNo }, { label: bilingual('ITP-Nummern', 'ITP numbers'), value: model.itpNumbers },
    { label: bilingual('Dokumentvorlage', 'Document template'), value: model.owner.issDocTemplate }, { label: bilingual('Lieferant', 'Supplier'), value: model.supplier },
    { label: bilingual('Fluidkategorie / PED-Kategorie', 'Fluid service / PED category'), value: model.fluidService },
    { label: bilingual('Prüfnorm (ZfP)', 'NDT standard'), value: '', extra: standardBoxes(model.ndtStandard) },
  ];
}

/**
 * LISL Report [ISS] "Inspection Summary Sheet": A4 landscape, German / English labels, one column per examination
 * method. The document is laid out twice so every page can say "n of N".
 */
export async function issPdf(input: IssPdfInput) {
  const { model, company } = input;
  const title = `ISO ${String(model.base.iso.isoNo ?? '')} - LISL Report [ISS]`;
  const m = await measurer();
  const render = (total: number) => renderDocument({
    page: PAGE, title, generatedAt: input.generatedAt,
    async layout(pdf: PdfBuilder) {
      const logo = company?.logo ? await pdf.embedImage(company.logo) : null;
      const logoHeight = Math.min((company?.company.logoHeightMm ?? 18) * MM, 34);
      const heading = stack([textBlock('Prüfzusammenfassung', { size: 13, font: 'bold' }), textBlock('Inspection Summary Sheet', { size: 9.5, font: 'italic' })]);
      const top = logo ? columns([{ block: heading, width: { fill: 1 } }, { block: imageBlock(logo, 170, logoHeight, 'right'), width: 170 }]) : heading;
      let page = 0;
      const compose = (n: number) => stack([top, spacer(5), infoGrid(headerItems(model, n, total), 4), spacer(6)]);
      const header: Block = { height: (width, metrics) => compose(1).height(width, metrics), draw(canvas, x, y, width) { page++; compose(page).draw(canvas, x, y, width); } };
      const relative = [...LEADING.map(item => item.width), ...ISS_METHOD_COLUMNS.map(() => METHOD_WIDTH), COMMENTS_WIDTH];
      const cells: HeaderCell[] = [
        ...LEADING.map((item, col): HeaderCell => ({ col, tier: 0, rows: 2, lines: item.labels.flatMap(([german, english]) => bilingual(german, english)) })),
        ...ISS_METHOD_COLUMNS.flatMap((method, i): HeaderCell[] => [
          { col: LEADING.length + i, tier: 0, lines: [{ text: issMethodHeading(method.label, model.percent[method.key]), font: 'bold', size: 6.5 }] },
          { col: LEADING.length + i, tier: 1, lines: [...bilingual('Prüfbericht Nr.', 'Report No.', 5.6), ...bilingual('Prüfdatum', 'Test date', 5.6)] },
        ]),
        { col: LEADING.length + ISS_METHOD_COLUMNS.length, tier: 0, rows: 2, lines: bilingual('Bemerkungen', 'Comments') },
      ];
      const { header: customHeader } = formHeader(cells, relative, pdf.contentWidth, m);
      const rows = model.welds.map(weld => [
        [weld.weldNo, weld.weldType], weld.description, weld.diameter, weld.certificate, weld.wps, weld.filler, weld.welder,
        ...ISS_METHOD_COLUMNS.map(method => weld.methods[method.key] ?? []), weld.comments,
      ]);
      const table: TableSpec = { columns: relative.map(width => ({ header: '', width })), rows, size: 6, fit: 'wrap', minLines: 4, padding: 2.5, customHeader };
      return { header, table, footerBlock: signatureBoxes(model) };
    },
  });
  const probe = await render(0);
  return render(probe.layout.pages.length);
}
