import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, noteBlock, plainTable, renderOperational, signatureBlock, type SignatureSlot, type Step } from './operational-blocks.ts';
import { labelValueGrid } from './engine.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { HYDROTEST_ISO_COLUMNS, RELEASE_COLUMNS, engineerLine, hydrotestIsoCells, projectItems, releaseRowCells, releaseSignatureBlock, type HydrotestDocumentModel, type ReleaseDocumentModel } from '../../shared/pdf-documents.ts';
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
      const titles = model.signatureTitles, owner = releaseSignatureBlock(titles);
      const slots: SignatureSlot[] = titles.length ? titles.map((entry, index) => ({ title: entry.title, ...(index === owner && image ? { image, name: input.signature?.name } : {}) })) : [{ title: 'Released by', image, name: input.signature?.name }];
      steps.push({ block: signatureBlock(slots, 3), before: 14 });
      return { header, steps };
    },
  });
}

export interface HydrotestPdfInput { model: HydrotestDocumentModel; company: CompanyForDocuments | null; generatedAt: Date; rows: Rows }
/** Hydrotest request document: every field of the request, the test system's isometrics and signature boxes. */
export function hydrotestPdf(input: HydrotestPdfInput) {
  const { model, company } = input, request = model.request;
  return renderOperational({
    page: A4_PORTRAIT, title: `Hydrotest request ${text(request.recordNo)}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = model.plan ? [{ label: 'Hydrotest Execution Plan', value: model.plan }] : [];
      const header = await documentHeader(pdf, { title: 'Hydrotest request', subtitle: `Record ${text(request.recordNo)}`, company, left: projectItems({ ...model.context, isometrics: [] }, input.rows).slice(0, 4), box });
      const steps: Step[] = [];
      for (const section of model.sections) {
        if (section.title === 'Notes') { steps.push({ block: noteBlock('Notes', section.items.map(item => item.value).join('\n')), before: 8 }); continue; }
        steps.push({ block: heading(section.title), before: steps.length ? 8 : 0 });
        steps.push({ block: labelValueGrid(section.items, { columns: 2, size: 7.5, labelShare: 0.42 }), before: 2 });
      }
      if (model.includeIsometrics) {
        steps.push({ block: heading(`Isometrics of the test system (${model.isometrics.length})`), before: 10 });
        steps.push({ table: plainTable(HYDROTEST_ISO_COLUMNS, [10, 4, 10, 8, 8, 8], model.isometrics.map(iso => hydrotestIsoCells(iso, input.rows)), { size: 7, headerSize: 7 }), before: 2 });
      }
      steps.push({ block: signatureBlock([{ title: `QA/QC engineer${model.engineer ? ` - ${text(model.engineer.name)}` : ''}` }, { title: 'Client representative' }, { title: 'Witness' }], 3), before: 14 });
      return { header, steps };
    },
  });
}
