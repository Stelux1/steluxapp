import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, noteBlock, plainTable, renderOperational, signatureBlock, type Step } from './operational-blocks.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { REQUEST_COLUMNS, engineerLine, projectItems, requestBoxItems, requestRowCells, visualRowCells, VISUAL_COLUMNS, type RequestDocumentModel, type VisualReportModel } from '../../shared/pdf-documents.ts';
import { currentRevision } from '../../shared/revisions.ts';
import type { Row } from '../../shared/types.ts';

/** NDT request, NDT Pre request and Pre-HT/PWHT request: one document per request number. Layout only; the data comes from `requestDocumentModel`. */
export interface RequestPdfInput { model: RequestDocumentModel; company: CompanyForDocuments | null; generatedAt: Date; /** Rows for the isometric list (revisions). */ rows: Record<string, Row[]> }
const text = (value: unknown) => String(value ?? '').trim();
const WIDTHS = [8, 5, 5, 6, 14, 11, 9, 8];

export function requestPdf(input: RequestPdfInput) {
  const { model, company } = input, withIso = model.context.isometrics.length > 1;
  return renderOperational({
    page: A4_PORTRAIT, title: `${model.title} ${model.requestNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, { title: model.title, subtitle: `Request ${model.requestNo}`, company, left: projectItems(model.context, input.rows), box: requestBoxItems(model) });
      const headers = [...(withIso ? ['ISO'] : []), ...REQUEST_COLUMNS];
      const widths = [...(withIso ? [9] : []), ...WIDTHS];
      const steps: Step[] = [
        { table: plainTable(headers, widths, model.lines.map(line => requestRowCells(line, withIso)), { size: 7, headerSize: 7 }) },
        ...(model.note ? [{ block: noteBlock('Note', model.note), before: 8 }] : []),
      ];
      if (model.options.isometrics && model.context.isometrics.length) {
        steps.push({ block: heading('Isometrics'), before: 10 });
        steps.push({ table: plainTable(['ISO number', 'Rev.', 'Drawing no.', 'Piping class', 'Test system'], [10, 4, 10, 8, 8], model.context.isometrics.map(iso => [text(iso.isoNo), currentRevision(input.rows, iso.id), text(iso.drawingNo), text(iso.pipingClass), text(input.rows.test_systems?.find(system => system.id === iso.testSystemId)?.name)]), { size: 7, headerSize: 7 }), before: 2 });
      }
      steps.push({ block: signatureBlock([{ title: 'Requested by' }, { title: 'Received by' }, { title: 'Date of examination' }]), before: 12 });
      return { header, steps };
    },
  });
}

export interface VisualPdfInput { model: VisualReportModel; company: CompanyForDocuments | null; generatedAt: Date; rows: RequestPdfInput['rows']; signature: { content: Uint8Array; name: string } | null }
/** Visual inspection report of one report number. */
export function visualPdf(input: VisualPdfInput) {
  const { model, company } = input, withIso = model.context.isometrics.length > 1;
  return renderOperational({
    page: A4_PORTRAIT, title: `Visual inspection report ${model.reportNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = [
        { label: 'Report no.', value: model.reportNo }, { label: 'Inspection date', value: printDate(model.date) }, { label: 'ITP', value: model.itp },
        { label: 'Activity no.', value: model.activityNo }, { label: 'Custom no.', value: model.customNo }, { label: 'QA/QC engineer', value: engineerLine(model.engineer) },
        ...model.vtFields,
      ];
      const header = await documentHeader(pdf, { title: 'Visual inspection report', subtitle: `Report ${model.reportNo}`, company, left: projectItems(model.context, input.rows), box });
      const image = input.signature ? await pdf.embedImage(input.signature.content) : null;
      const headers = [...(withIso ? ['ISO'] : []), ...VISUAL_COLUMNS];
      const widths = [...(withIso ? [9] : []), 8, 5, 5, 6, 13, 11, 8, 8, 6, 7];
      return {
        header,
        steps: [
          { table: plainTable(headers, widths, model.lines.map(line => visualRowCells(line, withIso)), { size: 7, headerSize: 7 }) },
          { block: signatureBlock([{ title: `QA/QC engineer${model.engineer ? ` - ${text(model.engineer.name)}` : ''}`, image, name: input.signature?.name || engineerLine(model.engineer) }, { title: 'Reviewed by' }], 2), before: 14 },
        ],
      };
    },
  });
}
