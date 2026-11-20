import { CUT_LIST_PRINT_COLUMNS, formatLength } from '../../shared/cut-list.ts';
import type { RevisionSnapshot } from '../../shared/cut-list-revisions.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import { stack, textBlock } from './engine.ts';
import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, plainTable, renderOperational, type Step } from './operational-blocks.ts';

const ACTION_LABELS = { edit: 'changed', add: 'added', delete: 'deleted', restore: 'restored' } as const;

/**
 * The completed Cut List of one isometric revision (Complete Cut List, server/cut-list-revisions.ts), laid out as the printed
 * cut list of the client's workbook (sheet Print): Project, Project no, Created by, Date and the revision above the ten
 * columns ISO NAME … QC; Heat No and QC stay empty for the shop. It is drawn from the revision's snapshot only, so the
 * document shows exactly the data and norms the revision was completed with. An amendment repeats the document with the
 * corrected lines and the reasons given.
 */
export function cutListPdf(input: { snapshot: RevisionSnapshot; company: CompanyForDocuments | null; generatedAt: Date; amendment?: number }) {
  const { snapshot, company, amendment = 0 } = input;
  const rows = snapshot.lines.map(line => [snapshot.isoNo, line.sheet, line.spool, line.dia, line.schedule, formatLength(line.lengthMm) + (line.quantity > 1 ? ` × ${line.quantity}` : ''), line.bevel === null ? '' : formatLength(line.bevel), line.material, '', '']);
  return renderOperational({
    page: A4_PORTRAIT, title: `Cut list ${snapshot.isoNo} ${snapshot.revision}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, {
        title: 'Cut List', subtitle: `${snapshot.isoNo} · ${snapshot.revision}${amendment ? ` · amendment ${amendment}` : ''}`, company,
        left: [{ label: 'Project', value: snapshot.project }, { label: 'Project no', value: snapshot.projectNo }, { label: 'Isometric', value: snapshot.isoNo }],
        box: [{ label: 'Created by', value: snapshot.completedBy }, { label: 'Date', value: printDate(snapshot.completedAt.slice(0, 10)) }, { label: 'Revision', value: snapshot.revision }, { label: 'Status', value: 'Completed' }, { label: 'Standards', value: snapshot.standardsMode === 'Keep' ? 'Previous standards kept' : 'Latest standards' }, { label: 'Lines', value: String(snapshot.lines.length) }],
      });
      const steps: Step[] = [{ table: plainTable([...CUT_LIST_PRINT_COLUMNS], [16, 6, 10, 8, 9, 12, 7, 14, 10, 8], rows, { size: 7.5, headerSize: 7.5 }) }];
      steps.push({ block: textBlock(`Total cut length: ${formatLength(snapshot.totalMm)} mm`, { size: 8, font: 'bold', align: 'right' }), before: 6 });
      if (snapshot.amendments.length) steps.push({ block: stack([heading('Changes after completion'), ...snapshot.amendments.map(item => textBlock(`${printDate(item.at.slice(0, 10))} · ${item.byName} · line ${item.line} (${ACTION_LABELS[item.action]}): ${item.reason}`, { size: 7.5 }))], 1), before: 10 });
      return { header, steps };
    },
  });
}
