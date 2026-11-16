import { MATERIAL_BAND, OWNER_PAGE, guMvHeader, materialColumns, ndtMethodBand, ndtPairColumns, signatureGroups, signatureOf, wpsRows, wpsTable, renderOwnerDocument, type OwnerColumn, type OwnerFormInput } from './lisl-gu.ts';
import type { PageSetup } from './engine.ts';
import { NDT_FORM_COLUMNS } from '../../shared/pdf-ndt-columns.ts';
import { ownerFormTexts } from '../../shared/site-settings.ts';

/** A3 landscape: nine NDT methods with two columns each, the consumables and four welders do not fit A4 at a readable size. */
const MV_PAGE: PageSetup = { ...OWNER_PAGE, size: 'A3' };

/**
 * LISL Report [MV]: the frame of [GU] with the wider right half of the table: location, joint type, welders 1 to 4,
 * the consumables (wire 1 / mm / wire 2 / mm), the fit-up date and the NDT pairs including PMI.
 */
export function lislMvPdf(input: OwnerFormInput) {
  const { model } = input, texts = ownerFormTexts(model.site, 'mv');
  const record = (on: boolean, value: string) => on ? value : '';
  const welder = (i: number): OwnerColumn => ({ header: ['Welder', String(i + 1)], weight: 22, cell: (weld, on) => record(on, weld.welders[i] ?? '') });
  const right: OwnerColumn[] = [
    { header: ['Weld', 'No.'], weight: 28, cell: weld => [weld.weldNo, weld.typeName].filter(Boolean).join('\n') },
    { header: ['Location'], weight: 28, cell: weld => weld.location },
    { header: ['Joint', 'Type'], weight: 20, cell: weld => weld.joint },
    ...[0, 1, 2, 3].map(welder),
    { header: ['Date'], weight: 30, cell: (weld, on) => record(on, weld.date) },
    { header: ['WPS'], weight: 34, cell: (weld, on) => record(on, weld.wps) },
    { header: ['Wire 1'], weight: 28, cell: (weld, on) => record(on, weld.wires[0].name) },
    { header: ['mm'], weight: 12, cell: (weld, on) => record(on, weld.wires[0].mm) },
    { header: ['Wire 2'], weight: 28, cell: (weld, on) => record(on, weld.wires[1].name) },
    { header: ['mm'], weight: 12, cell: (weld, on) => record(on, weld.wires[1].mm) },
    { header: ['Fit-up', 'date'], weight: 30, cell: (weld, on) => record(on, weld.fitup) },
    ...ndtPairColumns('mv', 14, 34),
  ];
  const columns = [...materialColumns(), ...right];
  const wires = 9 + 9, first = 9 + 14, ndtEnd = first + 2 * NDT_FORM_COLUMNS.mv.length - 1;
  return renderOwnerDocument({
    title: `ISO ${String(model.base.iso.isoNo ?? '')} - LISL Report [MV]`, page: MV_PAGE, generatedAt: input.generatedAt, welds: model.welds, record: input.options.weldRecord,
    async build(pdf, state) {
      const { image, name } = await signatureOf(pdf, input);
      return {
        header: guMvHeader(model, texts, input.company, state), columns, size: 6,
        bands: [[MATERIAL_BAND, { label: 'Consumable details', from: wires, to: wires + 3 }, { label: 'Not Destructive Test', from: first, to: ndtEnd }], ndtMethodBand('mv', first)],
        after: [signatureGroups(model, input.company, image, name)],
        wps: wpsTable(['WPS name', 'WPS process', 'Definition'], wpsRows(model, wps => [wps.name, wps.process]), [2, 2, 6]),
      };
    },
  });
}
