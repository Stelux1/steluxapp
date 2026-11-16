import { PDFDocument } from 'pdf-lib';
import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, noteBlock, plainTable, renderOperational, signatureBlock, type Step } from './operational-blocks.ts';
import { labelValueGrid } from './engine.ts';
import { loadUploaded } from './iso-book.ts';
import { HYDROTEST_ISO_COLUMNS, HYDROTEST_SPOOL_COLUMNS, hydrotestIsoCells, pressureTestSignatures, type HydrotestDocumentModel } from '../../shared/pdf-documents.ts';
import type { Row } from '../../shared/types.ts';

const text = (value: unknown) => String(value ?? '').trim();

export interface HydrotestPdfInput {
  model: HydrotestDocumentModel; company: CompanyForDocuments | null; generatedAt: Date; rows: Record<string, Row[]>;
  /** The stored bytes of an attachment (null when the file is unavailable). */
  read?: (id: string) => Uint8Array | null;
}

/**
 * The hydrotest book of one hydrotest release: the Pressure Test Plan (every field of the release, the spools of the test
 * system, its isometrics when included, the signature boxes titled by the main project's Document settings) followed by
 * the ticked custom documents of the test system. A document that cannot be read is named in the plan and left out.
 */
export async function hydrotestPdf(input: HydrotestPdfInput): Promise<{ bytes: Uint8Array; layout: Awaited<ReturnType<typeof renderOperational>>['layout'] }> {
  const { model, company } = input, request = model.request;
  const loaded = await Promise.all(model.documents.map(async file => {
    const bytes = input.read?.(file.id) ?? null;
    const result = bytes ? await loadUploaded(text(file.name), bytes) : { skipped: 'The file is unavailable.' };
    return { file, result };
  }));
  const system = text(model.testSystem?.name);
  const plan = await renderOperational({
    page: A4_PORTRAIT, title: `Pressure Test Plan ${system}`.trim(), generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = [{ label: 'Test system', value: system }, { label: 'Test record no.', value: text(request.recordNo) }, ...(model.plan ? [{ label: 'Hydrotest Execution Plan', value: model.plan }] : [])];
      const header = await documentHeader(pdf, { title: 'Pressure Test Plan', subtitle: `Hydrotest release ${system}`.trim(), company, left: [{ label: 'Client', value: model.context.client }, { label: 'Intern prj. no.', value: text(model.context.project?.internnumber) }, { label: 'Extern prj. no.', value: text(model.context.project?.externnumber) }, { label: 'Project description', value: text(model.context.project?.description) }], box });
      const steps: Step[] = [
        { block: heading('Hydrotest release') },
        { block: labelValueGrid(model.items, { columns: 2, size: 7.5, labelShare: 0.42 }), before: 2 },
      ];
      if (model.note) steps.push({ block: noteBlock('Note', model.note), before: 8 });
      steps.push({ block: heading(`Spools of the test system (${model.spools.length})`), before: 10 });
      steps.push({ table: plainTable(HYDROTEST_SPOOL_COLUMNS, [8, 9, 8, 6, 7, 10, 7], model.spools, { size: 7, headerSize: 7 }), before: 2 });
      if (model.includeIsometrics) {
        steps.push({ block: heading(`Isometrics of the test system (${model.isometrics.length})`), before: 10 });
        steps.push({ table: plainTable(HYDROTEST_ISO_COLUMNS, [10, 4, 10, 8, 8, 8], model.isometrics.map(iso => hydrotestIsoCells(iso, input.rows)), { size: 7, headerSize: 7 }), before: 2 });
      }
      if (loaded.length) {
        steps.push({ block: heading('Included files'), before: 10 });
        steps.push({ table: plainTable(['Document type', 'File', 'Included'], [12, 16, 12], loaded.map(({ file, result }) => [text(file.documentType), text(file.name), 'unit' in result ? `Yes, ${result.unit.pages} page${result.unit.pages === 1 ? '' : 's'}` : `No: ${result.skipped}`]), { size: 7, headerSize: 7 }), before: 2 });
      }
      steps.push({ block: signatureBlock(pressureTestSignatures(model).map(title => ({ title })), 3), before: 14 });
      return { header, steps };
    },
  });
  const units = loaded.flatMap(entry => 'unit' in entry.result ? [entry.result.unit] : []);
  if (!units.length) return plan;
  const out = await PDFDocument.load(plan.bytes);
  for (const unit of units) for (const page of await out.copyPages(unit.doc, unit.doc.getPageIndices())) out.addPage(page);
  return { bytes: await out.save(), layout: plan.layout };
}
