import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, noteBlock, plainTable, renderOperational, signatureBlock, type SignatureSlot, type Step } from './operational-blocks.ts';
import { labelValueGrid } from './engine.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { RELEASE_COLUMNS, engineerLine, projectItems, releaseRowCells, type ReleaseDocumentModel } from '../../shared/pdf-documents.ts';
import type { Row } from '../../shared/types.ts';

const text = (value: unknown) => String(value ?? '').trim();
type Rows = Record<string, Row[]>;

export interface ReleasePdfInput {
  model: ReleaseDocumentModel; company: CompanyForDocuments | null; generatedAt: Date; rows: Rows;
  /** The releasing signer's signature image, when the signature record has one. */
  signature: { content: Uint8Array; name: string } | null;
}
/** Prefab release and Field release document of one release record. */
export function releasePdf(input: ReleasePdfInput) {
  const { model, company } = input, release = model.release, iso = model.iso;
  const title = `${model.type} release`;
  return renderOperational({
    page: A4_PORTRAIT, title: `${title} ${model.docNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = [
        { label: 'Document no.', value: model.docNo }, { label: 'Release no.', value: text(release.number) }, { label: 'Report no.', value: text(release.reportNo) },
        { label: 'Release date', value: printDate(release.date) }, { label: 'Released by', value: text(release.releasedBy) }, { label: 'QA/QC engineer', value: engineerLine(model.engineer) },
        { label: 'Drawing no.', value: text(iso.drawingNo) }, { label: 'ITP No', value: text(iso.itpNo) }, { label: 'Piping class', value: text(iso.pipingClass) },
        ...(model.reopened ? [{ label: 'Status', value: `Reopened ${printDate(release.reopenedAt)}` }] : []),
      ];
      const header = await documentHeader(pdf, { title, subtitle: `Document ${model.docNo}${model.reopened ? ' - reopened, no longer in force' : ''}`, company, left: projectItems(model.context, input.rows), box });
      const image = input.signature ? await pdf.embedImage(input.signature.content) : null;
      const steps: Step[] = [
        { block: heading(`Welds - ${model.type === 'Prefab' ? 'shop' : 'field'} (${model.welds.length})`) },
        { table: plainTable(RELEASE_COLUMNS, [8, 5, 5, 9, 8, 12, 12, 12], model.welds.map(releaseRowCells), { size: 7, headerSize: 7 }), before: 2 },
      ];
      if (model.punch) {
        const punch = model.punch;
        steps.push({ block: heading('Punch summary'), before: 10 });
        steps.push({ table: plainTable(['Punch type', 'Open', 'Finished'], [10, 4, 4], punch.lines.map(line => [line.label, line.open, line.finished]), { size: 7, headerSize: 7 }), before: 2 });
        steps.push({ block: noteBlock('Overall', `Overdue ${punch.overdue} - blocking (open A / B) ${punch.blocking} - passed ${punch.passed} - removed ${punch.removed}`), before: 3 });
      }
      // The six signature titles of the Document settings belong to the Pressure Test Plan (server/pdf/hydrotest-book.ts).
      const slots: SignatureSlot[] = [{ title: 'Released by', image, name: input.signature?.name }];
      steps.push({ block: signatureBlock(slots, 3), before: 14 });
      return { header, steps };
    },
  });
}
