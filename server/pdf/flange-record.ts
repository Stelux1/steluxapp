import type { CompanyForDocuments } from './company.ts';
import { A4_PORTRAIT, documentHeader, heading, noteBlock, plainTable, renderOperational, signatureBlock, type Step } from './operational-blocks.ts';
import { labelValueGrid, type EmbeddedImage } from './engine.ts';
import { printDate } from '../../shared/pdf-lisl.ts';
import {
  ALIGNMENT_POINTS, FLANGE_ASSEMBLY_CHECKLIST, FLANGE_COMPLETION_CHECKS, FLANGE_PREPARATION_CONTROLS, METHOD_FIELDS, RECORD_PASS_ROWS,
  alignmentDifference, flangeAssetTag, flangeMoment, type FlangeItem, type SignatureRole,
} from '../../shared/flanges.ts';
import type { Row } from '../../shared/types.ts';

const text = (value: unknown) => String(value ?? '').trim();
const dash = (value: unknown) => text(value) || '-';
const tick = (value: unknown) => value === true ? 'Yes' : 'No';
/** Every moment of the document in one rule: local time, as the footer (shared/flanges.ts flangeMoment). */
const when = (value: unknown) => flangeMoment(value);

export interface FlangeProtocolSignature { row: Row; image: Uint8Array | null }
export interface FlangeProtocolInput {
  item: FlangeItem;
  /** The saved record the document shows; a preview of a flange without one prints the empty form. */
  record?: Row;
  passes: Row[]; bolts: Row[]; leakTests: Row[]; labels: Row[]; deviations: Row[];
  signatures: Partial<Record<SignatureRole, FlangeProtocolSignature>>;
  procedureNo: string;
  company: CompanyForDocuments | null;
  generatedAt: Date;
  /** A preview is marked as such and is never registered. */
  preview: boolean;
}

/**
 * The flange joint assembly record as a PDF: master data (read only), the assembly data, the controls and checklist, the
 * tightening passes, completion checks, alignment, the validated passes and bolts, the leak tests, labels and deviations,
 * and the technician and QA/QC signatures. Built from stored data only; the same input always gives the same content.
 */
export function flangeProtocolPdf(input: FlangeProtocolInput) {
  const { item, record } = input, flange = item.row, r = record ?? ({} as Row);
  const title = input.preview ? 'Flange joint assembly record - preview' : 'Flange joint assembly record';
  return renderOperational({
    page: A4_PORTRAIT, title: `${title} ${text(flange.flange_id)}`, generatedAt: input.generatedAt,
    async layout(pdf) {
      const header = await documentHeader(pdf, {
        title, subtitle: input.preview ? 'Preview from stored data. Not a final document.' : `Flange ID ${dash(flange.flange_id)}`, company: input.company,
        left: [{ label: 'Project', value: item.projectName }, { label: 'Iso number', value: item.isoNo }, { label: 'Flange ID', value: text(flange.flange_id) }, { label: 'Procedure No.', value: dash(input.procedureNo) }],
        box: [
          { label: 'Target Moment (Nm)', value: dash(flange.target_moment_nm) }, { label: 'Torque Wrench ID', value: dash(flange.torque_wrench_id) }, { label: 'Gasket Type', value: dash(flange.gasket_type) },
          { label: 'No of Studbolts', value: dash(flange.aantal_studbolts) }, { label: 'Asset tag', value: dash(flangeAssetTag(flange)) }, { label: 'Flange Size', value: [flange.flange_size, flange.flange_rating].map(text).filter(Boolean).join(' / ') || '-' },
        ],
      });
      const method = text(r.tightening_method);
      const methodItems = (METHOD_FIELDS[method] || []).map(name => ({ label: { method_equipment_id: 'Machine / tool ID', method_pressure_a: 'Hydraulic pressure A (bar)', method_pressure_b: 'Hydraulic pressure B (bar)', method_tension_kn: 'Bolt tension (kN)' }[name] ?? name, value: dash(r[name]) }));
      const image = async (role: SignatureRole): Promise<EmbeddedImage | null> => { const bytes = input.signatures[role]?.image; return bytes ? await pdf.embedImage(bytes) : null; };
      const signer = (role: SignatureRole) => { const row = input.signatures[role]?.row; return row ? `${text(row.signer_name)} - ${when(row._createdAt)}` : ''; };
      const steps: Step[] = [
        { block: heading('Preparation and inspection controls') },
        { table: plainTable(['Control', 'Done'], [80, 20], FLANGE_PREPARATION_CONTROLS.map(([key, label]) => [label, tick(r[`check_${key}`])]), { size: 7, headerSize: 7 }), before: 3 },
        { block: heading('Assembly data'), before: 8 },
        { block: labelValueGrid([
          { label: 'Assembly date', value: r.assembly_date ? printDate(r.assembly_date) : '-' }, { label: 'Tightening method', value: dash(method) }, { label: 'Tool ID', value: dash(r.tool_id) }, { label: 'Operator', value: dash(r.operator_name) },
          ...methodItems,
          { label: 'Torque wrench manufacturer', value: dash(r.torque_wrench_manufacturer) }, { label: 'Torque wrench model', value: dash(r.torque_wrench_model) }, { label: 'Calibration certificate no.', value: dash(r.calibration_certificate) },
          { label: 'New bolts used', value: dash(r.new_bolts_used) }, { label: 'Washers used', value: dash(r.washers_used) }, { label: 'LMRA completed before assembly', value: tick(r.lmra_confirmed) },
        ], { columns: 2, size: 7.5, labelShare: 0.45 }), before: 3 },
        { block: heading('Tightening passes'), before: 8 },
        { table: plainTable(['#', 'Target (Nm)', 'Actual (Nm)', 'Result'], [10, 30, 30, 30], RECORD_PASS_ROWS.map(n => [String(n), dash(r[`pass${n}_target`]), dash(r[`pass${n}_actual`]), dash(r[`pass${n}_result`])]), { size: 7, headerSize: 7 }), before: 3 },
        { block: heading('Completion checks'), before: 8 },
        { table: plainTable(['Check', 'Date', 'Time'], [60, 22, 18], FLANGE_COMPLETION_CHECKS.map(([key, label]) => [label, r[`${key}_date`] ? printDate(r[`${key}_date`]) : '-', dash(r[`${key}_time`])]), { size: 7, headerSize: 7 }), before: 3 },
        { block: heading('Assembly checklist'), before: 8 },
        { table: plainTable(['Item', 'Done'], [80, 20], FLANGE_ASSEMBLY_CHECKLIST.map(([key, label]) => [label, tick(r[`checklist_${key}`])]), { size: 7, headerSize: 7 }), before: 3 },
        { block: labelValueGrid([{ label: 'Installer name', value: dash(r.installer_name) }, { label: 'Installer initials', value: dash(r.installer_initials) }], { columns: 2, size: 7.5, labelShare: 0.45 }), before: 6 },
        { block: heading('Alignment and deviation (point 1 = top / 12 o\'clock, clockwise; max. deviation 2 mm)'), before: 8 },
        { table: plainTable(['Point', 'Before (mm)', 'After (mm)', 'Difference (mm)'], [16, 28, 28, 28], ALIGNMENT_POINTS.map(n => { const difference = alignmentDifference(r[`alignment_before_${n}`], r[`alignment_after_${n}`]); return [String(n), dash(r[`alignment_before_${n}`]), dash(r[`alignment_after_${n}`]), difference === null ? '-' : difference.toFixed(3)]; }), { size: 7, headerSize: 7 }), before: 3 },
        { block: labelValueGrid([{ label: 'Deviation reference', value: dash(r.deviation_reference) }, { label: 'Test result', value: dash(r.test_result) }], { columns: 2, size: 7.5, labelShare: 0.45 }), before: 6 },
        { block: noteBlock('Non-conformities / remarks', text(r.non_conformity_notes)), before: 4 },
        { block: noteBlock('Note', text(r.notes)), before: 4 },
        { block: heading('Validated tightening passes (tolerance ±5%)'), before: 8 },
        { table: plainTable(['Pass', 'Measured torque (Nm)', 'Measured stress', 'Tool ID', 'Operator', 'Performed at', 'Result'], [8, 16, 14, 16, 18, 18, 10], input.passes.length ? input.passes.map(pass => [`Pass ${text(pass.pass_number)}`, text(pass.torque_nm), text(pass.stress_value), text(pass.tool_id), text(pass.operator_name), when(pass.performed_at), text(pass.result)]) : [['-', '', '', '', '', '', '']], { size: 6.5, headerSize: 6.5 }), before: 3 },
        ...(input.bolts.length ? [{ table: plainTable(['Pass', 'Bolt no.', 'Measured torque (Nm)', 'Measured stress', 'Result', 'Deviation reference'], [10, 10, 20, 20, 12, 28], input.bolts.map(bolt => { const pass = input.passes.find(row => row.id === bolt.passId); return [pass ? `Pass ${text(pass.pass_number)}` : '-', text(bolt.bolt_no), text(bolt.torque_nm), text(bolt.stress_value), text(bolt.result), dash(bolt.deviation_reference)]; }), { size: 6.5, headerSize: 6.5 }), before: 6 } as Step] : []),
        { block: heading('Leak test, label and deviations'), before: 8 },
        { table: plainTable(['Leak test type', 'Pressure', 'Result', 'Tested at'], [34, 22, 18, 26], input.leakTests.length ? input.leakTests.map(test => [text(test.test_type), [test.pressure_value, test.pressure_unit].map(text).filter(Boolean).join(' '), text(test.result), when(test.tested_at)]) : [['-', '', '', '']], { size: 6.5, headerSize: 6.5 }), before: 3 },
        ...(input.labels.length ? [{ table: plainTable(['Label number', 'QR token', 'Scan reference'], [30, 40, 30], input.labels.map(label => [text(label.label_number), text(label.qr_token), dash(label.scan_reference)]), { size: 6.5, headerSize: 6.5 }), before: 6 } as Step] : []),
        ...(input.deviations.length ? [{ table: plainTable(['Deviation', 'Event', 'Reason', 'Recorded'], [20, 14, 46, 20], input.deviations.map(row => [text(row.reference), text(row.event), text(row.reason), when(row._createdAt)]), { size: 6.5, headerSize: 6.5, maxLines: 4 }), before: 6 } as Step] : []),
        { block: signatureBlock([
          { title: 'Technician signature', image: await image('Technician'), name: signer('Technician') || (text(r.installer_name) ? `${text(r.installer_name)} (${dash(r.installer_initials)})` : '') },
          { title: 'QA/QC signature', image: await image('QA/QC'), name: signer('QA/QC') },
        ], 2), before: 12 },
        ...(text(input.signatures['QA/QC']?.row.qc_note) ? [{ block: noteBlock('QC note', text(input.signatures['QA/QC']!.row.qc_note)), before: 4 } as Step] : []),
      ];
      return { header, steps };
    },
  });
}
