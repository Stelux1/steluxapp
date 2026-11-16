import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, plainTable, renderOperational, signatureBlock, type SignatureSlot, type Step } from './operational-blocks.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { RELEASE_COLUMNS, RELEASE_SIGNATURES, projectItems, releaseRowCells, type ReleaseDocumentModel } from '../../shared/pdf-documents.ts';
import type { Row } from '../../shared/types.ts';

const text = (value: unknown) => String(value ?? '').trim();
type Rows = Record<string, Row[]>;

export interface ReleasePdfInput {
  model: ReleaseDocumentModel; company: CompanyForDocuments | null; generatedAt: Date; rows: Rows;
  /** The releasing signer's signature image, when the signature record has one. */
  signature: { content: Uint8Array; name: string } | null;
}
/**
 * "Prefab Release note" / "Field Release note": one document per release (one ITP, many isometrics). Header with the
 * Report No, Project and ITP no.; a table with one row per isometric (ITP number, Spools, System / Medium, Doc. Number /
 * Drg. Number, Rev.); three signature boxes (Contractor / Supplier QA/QC, Client, Notified body).
 */
export function releasePdf(input: ReleasePdfInput) {
  const { model, company } = input, release = model.release;
  const title = `${model.type} Release note`, project = model.context.project;
  return renderOperational({
    page: A4_PORTRAIT, title: `${title} ${model.reportNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = [
        { label: 'Report No', value: model.reportNo }, { label: 'Project', value: text(project?.internnumber) || text(project?.description) }, { label: 'ITP no.', value: model.itpLabel },
        { label: 'Release date', value: printDate(release.date) }, { label: 'Released by', value: text(release.releasedBy) },
        ...(model.reopened ? [{ label: 'Status', value: `Reopened ${printDate(release.reopenedAt)}` }] : []),
      ];
      const header = await documentHeader(pdf, { title, subtitle: model.reopened ? 'Reopened, no longer in force' : undefined, company, left: projectItems(model.context, input.rows).slice(0, 4), box });
      const image = input.signature ? await pdf.embedImage(input.signature.content) : null;
      const steps: Step[] = [
        { block: heading(`Isometrics (${model.lines.length})`) },
        { table: plainTable(RELEASE_COLUMNS, [10, 8, 10, 14, 4], model.lines.map(releaseRowCells), { size: 7, headerSize: 7 }), before: 2 },
      ];
      const slots: SignatureSlot[] = RELEASE_SIGNATURES.map((slotTitle, index) => ({ title: slotTitle, image: index === 0 ? image : null, name: index === 0 ? input.signature?.name : undefined }));
      steps.push({ block: signatureBlock(slots, 3), before: 14 });
      return { header, steps };
    },
  });
}
