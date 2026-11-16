import { box, GREY_FILL, GREY_LINE, labelValueGrid, spacer, stack, textBlock, type Cell, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { PdfDocumentDefinition } from './documents.ts';
import { AppError } from '../store.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { weldersSummaryModel } from '../../shared/welders-summary.ts';

const safe = (value: unknown, fallback: string) => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

/**
 * Welder's summary: welders of the isometric, their welds and the qualification validity at each weld date.
 * Registered in PDF_DOCUMENTS (a download of its own) and used by the ISO Book as the part "Welder's summary".
 * Access follows the weld register report ("wdi").
 */
export const weldersSummaryDocument: PdfDocumentDefinition = {
  key: 'welders-summary', title: "Welder's summary", report: 'wdi', bookPart: 'welders-summary',
  async build({ rows, iso, now }) {
    const model = weldersSummaryModel(rows, iso.id);
    if (!model) throw new AppError(404, 'This isometric could not be found.');
    const title = `ISO ${String(iso.isoNo ?? '')} - Welder's summary`;
    const { bytes } = await renderDocument({
      page: { size: 'A4', orientation: 'landscape', margins: { left: 24, right: 24 } }, title, generatedAt: now,
      layout() {
        const header = stack([
          textBlock(title, { size: 13, font: 'bold' }), spacer(5),
          box(labelValueGrid([
            { label: 'Project', value: [model.project?.internnumber, model.project?.description].filter(Boolean).join(' - ') },
            { label: 'Iso number', value: iso.isoNo }, { label: 'Revision', value: iso.revNo ?? '' },
            { label: 'Welders', value: model.welders.length }, { label: 'Welds without a welder', value: model.weldsWithoutWelder },
          ], { columns: 3, size: 7.5, labelShare: 0.42 }), { fill: GREY_FILL, stroke: GREY_LINE, padding: 4 }), spacer(6),
        ]);
        const tableRows: Cell[][] = model.welders.flatMap(entry => entry.welds.map(item => [entry.label, item.weldNo, printDate(item.date), item.wps, item.qualification, printDate(item.validUntil), item.status]));
        const table: TableSpec = {
          columns: [{ header: 'Welder', width: 20 }, { header: 'Weld', width: 8 }, { header: 'Weld date', width: 9 }, { header: 'WPS', width: 14 }, { header: 'Qualification', width: 28 }, { header: 'Valid until', width: 9 }, { header: 'At weld date', width: 12 }],
          rows: tableRows, size: 7, headerSize: 7, fit: 'wrap', maxLines: 3, padding: 2.5,
        };
        return { header, table };
      },
    });
    return { bytes, fileName: `${now.toISOString().slice(0, 10)}-${safe(model.project?.internnumber, 'project')}-Welders-summary-${safe(iso.isoNo, 'iso')}` };
  },
};
