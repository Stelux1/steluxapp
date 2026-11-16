import { AppError } from '../store.ts';
import { PICK_SHEET_COLUMNS, pickSheetModel } from '../../shared/mto-stock.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { companyForDocuments, type CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, noteBlock, plainTable, renderOperational, signatureBlock, type Step } from './operational-blocks.ts';
import type { PdfScopedDefinition } from './documents.ts';

/**
 * Print pick sheet (Transfer Order detail): the order's number, type, priority and route, and one line per item with the
 * place to take it from, an empty Qty picked / Line status for the handler (or the results saved so far) and two signature boxes.
 *
 *   GET /api/pdf/pick-sheet?orderId=<transfer order id>
 */
export function pickSheetPdf(input: { model: NonNullable<ReturnType<typeof pickSheetModel>>; company: CompanyForDocuments | null; generatedAt: Date }) {
  const { model, company } = input, order = model.order;
  return renderOperational({
    page: A4_PORTRAIT, title: `Pick sheet ${order.number}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, {
        title: 'Pick sheet', subtitle: `Transfer order ${order.number}`, company,
        left: [{ label: 'From', value: model.from }, { label: 'To', value: model.to }, { label: 'Handler', value: String(order.assignedName || '-') }],
        box: [{ label: 'Order No', value: String(order.number) }, { label: 'Type', value: model.type }, { label: 'Priority', value: String(order.priority || 'Normal') }, { label: 'Status', value: model.status }, { label: 'Created date', value: printDate(String(order.date || order._createdAt || '').slice(0, 10)) }],
      });
      const steps: Step[] = [{ table: plainTable(PICK_SHEET_COLUMNS, [3, 11, 26, 6, 5, 15, 7, 8], model.lines, { size: 7, headerSize: 7 }) }];
      if (!model.lines.length) steps.push({ block: noteBlock('', 'This transfer order has no items.'), before: 6 });
      if (order.notes) steps.push({ block: noteBlock('Notes', String(order.notes)), before: 8 });
      steps.push({ block: signatureBlock([{ title: 'Picked by' }, { title: 'Checked by' }], 2), before: 14 });
      return { header, steps };
    },
  });
}

/** The document; the order must be one the account may read (its rows), printing needs the export right of transfer orders. */
export const pickSheetDocument: PdfScopedDefinition = {
  key: 'pick-sheet', title: 'Pick sheet', report: 'pdf-pick-sheet', scope: 'scoped',
  async build({ store, documents, rows, query, now }) {
    const model = pickSheetModel(rows, String(query.orderId ?? ''));
    if (!model) throw new AppError(404, 'This transfer order could not be found.');
    const { bytes } = await pickSheetPdf({ model, company: companyForDocuments(store, documents), generatedAt: now });
    return { bytes, fileName: `${now.toISOString().slice(0, 10)}-Pick-sheet-${String(model.order.number).replace(/[^A-Za-z0-9._-]+/g, '-')}` };
  },
};
