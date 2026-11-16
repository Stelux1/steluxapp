import type { CompanyForDocuments } from './company.ts';
import { A4_LANDSCAPE, A4_PORTRAIT, documentHeader, noteBlock, plainTable, renderOperational, signatureBlock, type Step } from './operational-blocks.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { projectItems } from '../../shared/pdf-documents.ts';
import { BLANK_PUNCH_COLUMNS, BLANK_PUNCH_ROWS, FLANGE_PDF_COLUMNS, PICKLIST_COLUMNS, blankPunchHeader, punchColumns, punchRowCells, type FlangeReportModel, type PickListModel, type PunchListModel } from '../../shared/pdf-lists.ts';
import type { Row } from '../../shared/types.ts';

const text = (value: unknown) => String(value ?? '').trim();
type Rows = Record<string, Row[]>;
interface Common { company: CompanyForDocuments | null; generatedAt: Date; rows: Rows }

export interface PunchPdfInput extends Common { model: PunchListModel }
/** Punch list (filled): the items the page shows under its filters, landscape. */
export function punchPdf(input: PunchPdfInput) {
  const { model, company } = input, documents = model.options.documents;
  return renderOperational({
    page: A4_LANDSCAPE, title: 'Punch list', generatedAt: input.generatedAt,
    async layout(pdf) {
      const kpis = model.kpis.map(card => `${card.label} ${card.count}`).join('  -  ');
      const header = await documentHeader(pdf, { title: 'Punch list', subtitle: `${model.filters.length ? model.filters.join(' - ') : 'All punch items'} - ${model.lines.length} item${model.lines.length === 1 ? '' : 's'}`, company, left: projectItems(model.context, input.rows).filter(item => item.value && item.label !== 'Isometrics'), box: [{ label: 'Key figures', value: kpis }], boxColumns: 1 });
      const widths = documents ? [4, 9, 9, 4, 28, 8, 12, 7, 17, 9] : [4, 10, 10, 4, 34, 8, 14, 8, 10];
      const steps: Step[] = [{ table: plainTable(punchColumns(documents), widths, model.lines.map(line => punchRowCells(line, documents)), { size: 6.5, headerSize: 6.5, maxLines: 4 }) }];
      if (!model.lines.length) steps.push({ block: noteBlock('', 'No punch items match these filters.'), before: 6 });
      return { header, steps };
    },
  });
}

export interface BlankPunchPdfInput extends Common { iso: Row }
/** Punch list - blank: the header of an isometric and empty rows for the items, with room for the sign-off. */
export function blankPunchPdf(input: BlankPunchPdfInput) {
  const { company } = input, head = blankPunchHeader(input.rows, input.iso);
  return renderOperational({
    page: A4_PORTRAIT, title: `Punch list - blank ${text(input.iso.isoNo)}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, { title: 'Punch list - blank', subtitle: `ISO ${text(input.iso.isoNo)}`, company, left: head.items.slice(0, 5), box: head.items.slice(5) , boxColumns: 2 });
      const rows = Array.from({ length: BLANK_PUNCH_ROWS }, () => BLANK_PUNCH_COLUMNS.map(() => ['', '']));
      return { header, steps: [{ table: plainTable(BLANK_PUNCH_COLUMNS, [4, 6, 30, 8, 14, 9, 14], rows, { size: 7, headerSize: 7, fit: 'truncate', minLines: 2 }) }] };
    },
  });
}

export interface FlangePdfInput extends Common { model: FlangeReportModel }
/** Flange report: the flange table with the tightening values and the inspection result, landscape. */
export function flangePdf(input: FlangePdfInput) {
  const { model, company } = input, project = model.context.project;
  const scope = model.context.isometrics.length === 1 ? `ISO ${text(model.context.isometrics[0].isoNo)}` : `Project ${text(project?.internnumber)}`;
  return renderOperational({
    page: A4_LANDSCAPE, title: `Flange report ${scope}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, { title: 'Flange report', subtitle: `${scope} - ${model.items.length} flange${model.items.length === 1 ? '' : 's'}`, company, left: projectItems(model.context, input.rows).filter(item => item.value && item.label !== 'Isometrics'),
        box: [{ label: 'Tightening standard', value: model.standard }, { label: 'Flange procedure No.', value: model.procedureNo }, { label: 'Finished', value: model.options.finished || 'All' }] });
      const steps: Step[] = [{ table: plainTable(FLANGE_PDF_COLUMNS.map(column => column.header), FLANGE_PDF_COLUMNS.map(column => column.width), model.items.map(item => FLANGE_PDF_COLUMNS.map(column => column.cell(item))), { size: 6, headerSize: 6, maxLines: 2 }) }];
      if (!model.items.length) steps.push({ block: noteBlock('', 'No flanges match this selection.'), before: 6 });
      steps.push({ block: signatureBlock([{ title: 'Operator' }, { title: 'Inspector' }, { title: 'Client representative' }], 3), before: 12 });
      return { header, steps };
    },
  });
}

export interface PickListPdfInput extends Common { model: PickListModel }
/** Pick list: the material lines of one report with the "taken by" signature line. */
export function pickListPdf(input: PickListPdfInput) {
  const { model, company } = input, report = model.report;
  return renderOperational({
    page: A4_PORTRAIT, title: `Pick list ${report.reportNo}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const box = [{ label: 'Report no.', value: report.reportNo }, { label: 'Date', value: printDate(report.date) }, { label: 'Taken', value: model.taken ? 'Yes' : 'No' }];
      const header = await documentHeader(pdf, { title: 'Pick list', subtitle: `Report ${report.reportNo}`, company, left: projectItems(model.context, input.rows), box });
      return {
        header,
        steps: [
          { table: plainTable(PICKLIST_COLUMNS, [8, 10, 26, 6, 7, 7, 5, 11], model.lines, { size: 7, headerSize: 7 }) },
          { block: signatureBlock([{ title: 'Taken by' }, { title: 'Issued by' }], 2), before: 14 },
        ],
      };
    },
  });
}
