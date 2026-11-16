import { emptyBlock, lineHeight, qrBlock, spacer, stack, textBlock, type Block, type EmbeddedImage } from './engine.ts';
import { OWNER_PAGE, documentLines, frameRow, labelColumns, labelLines, ndtMethodBand, ndtPairColumns, renderOwnerDocument, signatureOf, type OwnerColumn, type OwnerFormInput, type OwnerModel, type PageState, type Span } from './lisl-gu.ts';
import { NDT_FORM_COLUMNS } from '../../shared/pdf-ndt-columns.ts';
import { ownerFormTexts, type OwnerFormTexts } from '../../shared/site-settings.ts';

/** Where the QR code of the Rev forms leads: the isometric in this app. */
export const isometricUrl = (origin: string, isoId: string) => `${origin.replace(/\/+$/, '')}/workspace/isometrics/${encodeURIComponent(isoId)}`;
export const REV_TITLE = 'WELDING REPORT (HEAT TRANSPORT) PIPES AND INSTALLATIONS';

/** Framed header: owner line, QR code, "Pre-commissioning" and the title, then the label / value rows. */
function revHeader(model: OwnerModel, texts: OwnerFormTexts, revision: 2 | 3, origin: string | undefined, state: PageState): Block {
  const { base } = model, iso = base.iso, text = (value: unknown) => String(value ?? '').trim();
  const rows: [string, string][] = [
    ['Project site', text(model.site?.name)], ['Project No.', text(base.project?.internnumber)],
    ...(revision === 2 ? [['Visual inspection report(s)', model.vtReports.join(', ')] as [string, string]] : []),
    ['Location or line number', text(iso.area || iso.zone || iso.isoNo)], ['Drawing No.', text(iso.drawingNo || iso.isoNo)],
  ];
  const title = frameRow([
    { block: textBlock('Pre-commissioning', { size: 8, font: 'bold' }), width: 98 },
    { block: textBlock(REV_TITLE, { size: 10, font: 'bold' }), width: { fill: 1 } },
  ], { pad: 4, lineWidth: 0.6 });
  const left = stack([...(texts.ownerLine ? [textBlock(texts.ownerLine, { size: 8.5, font: 'bold' }), spacer(4)] : []), title, spacer(4), labelColumns(rows, 1, { labelWidth: 110 }), labelLines([], { state, labelWidth: 110 })]);
  const docs = documentLines(texts);
  const right = stack([origin ? qrBlock(isometricUrl(origin, text(iso.id)), 62) : emptyBlock, ...(docs.length ? [spacer(3), labelLines(docs, { labelWidth: 36 })] : [])]);
  return stack([frameRow([{ block: left, width: { fill: 1 } }, { block: right, width: 130 }], { pad: 5 }), spacer(4)]);
}

/** Footer grid: Construction Supervisor / Signature / Date for Contractor and Client, and the inspector's stamp box. */
export function revFooter(image: EmbeddedImage | null, imageName: string | null): Block {
  const HEAD = 14, ROWS = [['Construction Supervisor', 20], ['Signature', 34], ['Date', 20]] as const, height = HEAD + ROWS.reduce((sum, row) => sum + row[1], 0);
  return {
    height: () => height,
    draw(canvas, x, y, width) {
      const grid = width * 0.68, label = grid * 0.34, cell = (grid - label) / 2, gap = 12, stamp = width - grid - gap;
      canvas.rect(x, y, grid, height, { stroke: 0.2, lineWidth: 0.7 });
      canvas.line(x + label, y, x + label, y + height, { width: 0.5, color: 0.2 }); canvas.line(x + label + cell, y, x + label + cell, y + height, { width: 0.5, color: 0.2 });
      canvas.text('Contractor', x + label + cell / 2, y + 4, { size: 7.5, font: 'bold', align: 'center' }); canvas.text('Client', x + label + cell * 1.5, y + 4, { size: 7.5, font: 'bold', align: 'center' });
      let top = y + HEAD;
      for (const [name, rowHeight] of ROWS) {
        canvas.line(x, top, x + grid, top, { width: 0.5, color: 0.2 });
        canvas.text(name, x + 4, top + 4, { size: 7.5, font: 'bold', maxWidth: label - 8 });
        if (name === 'Signature' && image) { canvas.image(image, x + label + 3, top + 2, cell - 6, rowHeight - 8, 'left'); if (imageName) canvas.text(imageName, x + label + cell - 3, top + rowHeight - lineHeight(5.5) - 1, { size: 5.5, align: 'right', color: 0.3 }); }
        top += rowHeight;
      }
      canvas.rect(x + grid + gap, y, stamp, height, { stroke: 0.2, lineWidth: 0.7 });
      canvas.text("Inspector's Stamp", x + grid + gap + 5, y + 4, { size: 7.5, font: 'bold', maxWidth: stamp - 10 });
    },
  };
}

/** LISL Report [GU Rev 2] and [GU Rev 3] ("Welding report (heat transport) pipes and installations"); Rev 3 has no "Visual inspection report(s)" row. */
export function lislGuRevPdf(input: OwnerFormInput, revision: 2 | 3) {
  const { model } = input, texts = ownerFormTexts(model.site, 'rev');
  const on = (record: boolean, value: string) => record ? value : '';
  const columns: OwnerColumn[] = [
    { header: ['Pipe or', 'heat no.'], weight: 38, side: true, cell: (weld, record) => record ? [weld.sides[0].charge, weld.sides[1].charge] : ['', ''] },
    { header: ['B.B.', 'no.'], weight: 22, side: true, cell: weld => [weld.sides[0].index, weld.sides[1].index] },
    { header: ['Diam.', 'DN'], weight: 24, side: true, cell: weld => [weld.sides[0].dn, weld.sides[1].dn] },
    { header: ['Wall', 'thk.', 'mm'], weight: 22, side: true, cell: weld => [weld.sides[0].wt, weld.sides[1].wt] },
    { header: ['Material', 'Type /', 'quality'], weight: 42, side: true, cell: weld => [weld.sides[0].type, weld.sides[1].type] },
    { header: ['Coating'], weight: 38, side: true, cell: weld => [weld.sides[0].coating, weld.sides[1].coating] },
    { header: ['Installed', 'length'], weight: 28, side: true, cell: weld => [weld.sides[0].installed, weld.sides[1].installed] },
    { header: ['Description'], weight: 46, side: true, cell: weld => [weld.sides[0].description, weld.sides[1].description] },
    { header: ['POS'], weight: 16, side: true, cell: weld => [weld.sides[0].pos, weld.sides[1].pos] },
    { header: ['Weld no.'], weight: 28, cell: weld => [weld.weldNo, weld.typeName].filter(Boolean).join('\n') },
    { header: ['Welder'], weight: 30, cell: (weld, record) => on(record, weld.welders.filter(Boolean).join(', ')) },
    { header: ['WPS no.'], weight: 40, cell: (weld, record) => on(record, weld.wps) },
    { header: ['KM'], weight: 18, cell: weld => weld.km },
    { header: ['VT-no.'], weight: 34, cell: (weld, record) => on(record, weld.ndt.VT.report) },
    ...ndtPairColumns('rev', 14, 40),
    { header: ['Weld', 'coating'], weight: 28, cell: weld => weld.weldCoating },
  ];
  const first = 14, ndtEnd = first + 2 * NDT_FORM_COLUMNS.rev.length - 1;
  const bands: Span[][] = [[{ label: 'Identification mark', from: 0, to: 1 }, { label: 'Pipe', from: 5, to: 6 }, { label: 'Fixed points', from: 12, to: 13 }, { label: 'Non-destructive testing', from: first, to: ndtEnd }], ndtMethodBand('rev', first)];
  return renderOwnerDocument({
    title: `ISO ${String(model.base.iso.isoNo ?? '')} - LISL Report [GU Rev ${revision}]`, page: OWNER_PAGE, generatedAt: input.generatedAt, welds: model.welds, record: input.options.weldRecord,
    async build(pdf, state) {
      const { image, name } = await signatureOf(pdf, input);
      return { header: revHeader(model, texts, revision, input.origin, state), columns, bands, size: 5.8, after: [revFooter(image, name)] };
    },
  });
}
