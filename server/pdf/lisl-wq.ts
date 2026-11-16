import { columns, imageBlock, lineHeight, spacer, stack, textBlock, GREY_FILL, GREY_LINE, type Block, type Canvas, type PageSetup, type PdfBuilder, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { CompanyForDocuments } from './company.ts';
import { formHeader, measurer, type HeaderCell, type HeaderLine } from './form-header.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import type { WqModel } from '../../shared/pdf-lisl-iss-wq.ts';
import { WQ_NDT_COLUMNS } from '../../shared/pdf-ndt-columns-iss-wq.ts';

/** `v1` = [WQ] (header lists the visual inspection reports); `v2` = [WQ ver 2] (no such line, VT-no. filled per weld). */
export type WqVersion = 'v1' | 'v2';
export interface WqPdfInput { model: WqModel; version: WqVersion; company: CompanyForDocuments | null; generatedAt: Date }
const MM = 72 / 25.4;
const PAGE: PageSetup = { size: 'A4', orientation: 'landscape', margins: { left: 18, right: 18, top: 20, bottom: 18 } };

/** Relative widths of the table columns, in print order. */
const COLUMN_WIDTHS = [
  38, 22, // identification mark: pipe or heat no., B.B. no.
  22, 24, 34, // Diam. DN, Wall thk., Material
  40, 36, // Pipe: coating, installed length
  50, 20, 28, 28, 52, // Description, POS, Weld no., Welder, WPS no.
  26, 40, // fixed points: KM, VT-no.
  ...WQ_NDT_COLUMNS.flatMap(() => [16, 40]), // NDT pairs
  34, // weld coating
  46, 32, // insulation: electrofusion shrink sleeve, QA/QC approval
];
const NDT_START = 14, LAST_START = NDT_START + 2 * WQ_NDT_COLUMNS.length;

const line = (text: string, size = 5.8, font: HeaderLine['font'] = 'bold'): HeaderLine[] => [{ text, size, font }];
/** The three-tier heading of the table (English only, as in the capture). */
function headingCells(): HeaderCell[] {
  const leaf = (col: number, text: string, tier = 0): HeaderCell => ({ col, tier, rows: 3 - tier, lines: line(text) });
  return [
    { col: 0, span: 2, tier: 0, lines: line('Identification mark') }, { col: 0, tier: 1, rows: 2, lines: line('Pipe or heat no.') }, { col: 1, tier: 1, rows: 2, lines: line('B.B. no.') },
    leaf(2, 'Diam. DN'), leaf(3, 'Wall thk. mm'), leaf(4, 'Material Type / quality'),
    { col: 5, span: 2, tier: 0, lines: line('Pipe') }, { col: 5, tier: 1, rows: 2, lines: line('Coating') }, { col: 6, tier: 1, rows: 2, lines: line('Installed length') },
    leaf(7, 'Description'), leaf(8, 'POS'), leaf(9, 'Weld no.'), leaf(10, 'Welder'), leaf(11, 'WPS no.'),
    { col: 12, span: 2, tier: 0, lines: line('Fixed points on route map') }, { col: 12, tier: 1, rows: 2, lines: line('KM') }, { col: 13, tier: 1, rows: 2, lines: line('VT-no.') },
    { col: NDT_START, span: 2 * WQ_NDT_COLUMNS.length, tier: 0, lines: line('Non-destructive testing') },
    ...WQ_NDT_COLUMNS.flatMap((method, i): HeaderCell[] => [
      { col: NDT_START + 2 * i, span: 2, tier: 1, lines: line(method.label) }, { col: NDT_START + 2 * i, tier: 2, lines: line('A / NA') }, { col: NDT_START + 2 * i + 1, tier: 2, lines: line('Rep. No.') },
    ]),
    leaf(LAST_START, 'Weld coating'),
    { col: LAST_START + 1, span: 2, tier: 0, lines: line('Insulation') }, { col: LAST_START + 1, tier: 1, rows: 2, lines: line('Electrofusion shrink sleeve') }, { col: LAST_START + 2, tier: 1, rows: 2, lines: line('QA/QC Approval') },
  ];
}

/** A bordered cell with a small label above its value. */
function field(canvas: Canvas, x: number, y: number, width: number, height: number, label: string, value: string) {
  canvas.rect(x, y, width, height, { stroke: GREY_LINE, lineWidth: 0.4 });
  canvas.text(label, x + 3, y + 2, { size: 5.8, font: 'italic', color: 0.25, maxWidth: width - 6 });
  canvas.text(value, x + 3, y + 2 + lineHeight(5.8), { size: 8, maxWidth: width - 6 });
}

/** The two frames above the table: owner standard / title / home location / Doc.-Version-Date-Page, then asset data. */
function frames(model: WqModel, version: WqVersion, page: number, total: number): Block {
  const FRAME1 = 54, FRAME2 = 26, GAP = 4, owner = model.owner, site = model.base.site;
  return {
    height: () => FRAME1 + GAP + FRAME2,
    draw(canvas, x, y, width) {
      canvas.rect(x, y, width, FRAME1, { stroke: 0.2, lineWidth: 0.8 });
      let top = y + 4; const left = x + 6;
      if (owner.ownerStandard) { canvas.text(owner.ownerStandard, left, top, { size: 7.5, maxWidth: width * 0.6 }); top += lineHeight(7.5); }
      canvas.text('Line Inspection Status List (LISL)', left, top, { size: 12, font: 'bold' }); top += lineHeight(12) + 1;
      canvas.text(`Home location: ${String(site?.name ?? '')}`.trim(), left, top, { size: 8, maxWidth: width * 0.6 }); top += lineHeight(8);
      if (version === 'v1') canvas.text(`Visual inspection report(s): ${model.visualReports}`.trim(), left, top, { size: 7.5, maxWidth: width * 0.62 });
      const boxWidth = Math.min(width * 0.3, 210), boxLeft = x + width - boxWidth, rowHeight = FRAME1 / 4;
      [['Doc.', owner.wqDocNo], ['Version', owner.wqVersion], ['Date', printDate(owner.wqDate)], ['Page', `${page} of ${total}`]].forEach(([label, value], i) => {
        const rowTop = y + i * rowHeight;
        canvas.rect(boxLeft, rowTop, boxWidth, rowHeight, { stroke: GREY_LINE, lineWidth: 0.4 });
        canvas.rect(boxLeft, rowTop, 44, rowHeight, { fill: GREY_FILL, stroke: GREY_LINE, lineWidth: 0.4 });
        canvas.text(label, boxLeft + 4, rowTop + (rowHeight - lineHeight(7.5)) / 2, { size: 7.5, font: 'bold' });
        canvas.text(value, boxLeft + 49, rowTop + (rowHeight - lineHeight(7.5)) / 2, { size: 7.5, maxWidth: boxWidth - 53 });
      });
      const top2 = y + FRAME1 + GAP, w = width / 6;
      canvas.rect(x, top2, width, FRAME2, { stroke: 0.2, lineWidth: 0.8 });
      [['Asset Tag', model.assetTag], ['Drawing No.', model.drawingNo], ['Diameter', model.diameter], ['Installation no.', model.installationNo], ['Page', `${page} of ${total}`], ['Project no.', model.projectNo]]
        .forEach(([label, value], i) => field(canvas, x + i * w, top2, w, FRAME2, label, value));
    },
  };
}

/** Contractor and owner supervisor boxes at the foot of every page. */
function signatureBoxes(model: WqModel, company: string): Block {
  const HEIGHT = 40;
  const boxes = [
    { title: 'Signed by (contractor)', name: company, fields: ['Date', 'Signature'] },
    { title: model.owner.ownerName ? `Supervisor ${model.owner.ownerName}` : 'Supervisor', name: '', fields: ['Date', 'Signature'] },
  ];
  return {
    height: () => HEIGHT,
    draw(canvas, x, y, width) {
      const gap = 10, w = (width - gap) / 2;
      boxes.forEach((box, i) => {
        const left = x + i * (w + gap);
        canvas.rect(left, y, w, HEIGHT, { stroke: 0.2, lineWidth: 0.7 });
        canvas.text(box.title, left + 4, y + 3, { size: 6.8, font: 'bold', maxWidth: w * 0.5 });
        if (box.name) canvas.text(box.name, left + 4, y + 3 + lineHeight(6.8), { size: 6.5, maxWidth: w * 0.4 });
        let cursor = left + w * 0.42;
        box.fields.forEach((label, n) => {
          const fieldWidth = n === 0 ? w * 0.2 : w * 0.34;
          canvas.line(cursor, y + HEIGHT - 8, cursor + fieldWidth - 4, y + HEIGHT - 8, { width: 0.5 });
          canvas.text(label, cursor, y + HEIGHT - 7, { size: 5.8, font: 'italic' });
          cursor += fieldWidth;
        });
      });
    },
  };
}

/**
 * LISL Report [WQ] / [WQ ver 2] "Line Inspection Status List (LISL)": A4 landscape. The document is laid out
 * twice so every page can say "n of N".
 */
export async function wqPdf(input: WqPdfInput) {
  const { model, version, company } = input, v2 = version === 'v2';
  const title = `ISO ${String(model.base.iso.isoNo ?? '')} - LISL Report [WQ${v2 ? ' ver 2' : ''}]`;
  const m = await measurer();
  const companyName = company?.company.name ?? '';
  const render = (total: number) => renderDocument({
    page: PAGE, title, generatedAt: input.generatedAt,
    async layout(pdf: PdfBuilder) {
      const logo = company?.logo ? await pdf.embedImage(company.logo) : null;
      const logoHeight = Math.min((company?.company.logoHeightMm ?? 18) * MM, 26);
      const name = companyName ? textBlock(companyName, { size: 9.5, font: 'bold' }) : null;
      const top = logo ? columns([{ block: name ?? spacer(0), width: { fill: 1 } }, { block: imageBlock(logo, 150, logoHeight, 'right'), width: 150 }]) : name;
      let page = 0;
      const compose = (n: number) => stack([...(top ? [top, spacer(3)] : []), frames(model, version, n, total), spacer(5)]);
      const header: Block = { height: (width, metrics) => compose(1).height(width, metrics), draw(canvas, x, y, width) { page++; compose(page).draw(canvas, x, y, width); } };
      const { header: customHeader } = formHeader(headingCells(), COLUMN_WIDTHS, pdf.contentWidth, m);
      const rows = model.welds.map(weld => [
        weld.heat, '', weld.dn, weld.wall, weld.material, weld.coating, '', weld.description, weld.pos, weld.weldNo, weld.welder, weld.wps, weld.km, v2 ? weld.vt : '',
        ...WQ_NDT_COLUMNS.flatMap(method => [weld.ndt[method.key]?.result ?? '', weld.ndt[method.key]?.report ?? '']),
        weld.weldCoating, weld.sleeve, '',
      ]);
      const table: TableSpec = { columns: COLUMN_WIDTHS.map(width => ({ header: '', width })), rows, size: 5.6, fit: 'wrap', minLines: 2, padding: 2, customHeader };
      return { header, table, footerBlock: signatureBoxes(model, companyName) };
    },
  });
  const probe = await render(0);
  return render(probe.layout.pages.length);
}
