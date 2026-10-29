import ExcelJS from 'exceljs';
import type { Report } from '../shared/reports.ts';

export function reportWorkbook(report: Report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Blitzkrieg';
  const sheet = workbook.addWorksheet(report.definition.key === 'cut-list' ? 'MSPS_Cut_list' : report.definition.key === 'calculation' ? 'M25001_Project_cal_MSPS' : report.definition.title.slice(0, 31));
  sheet.columns = report.columns.map(column => ({ header: column.label, key: column.key, width: column.type === 'number' ? 18 : 26 }));
  for (const source of report.rows) {
    const row = sheet.addRow(source.values);
    const formula = (target: string, left: string, right: string) => {
      if (typeof source.values[target] !== 'number' || ![target,left,right].every(key => report.columns.some(column => column.key === key))) return;
      row.getCell(target).value = { formula: `${sheet.getColumn(left).letter}${row.number}*${sheet.getColumn(right).letter}${row.number}`, result: Number(source.values[target]) };
      row.getCell(target).numFmt = '0.000';
    };
    if (report.definition.key === 'cut-list') formula('totalMm', 'quantity', 'lengthMm');
    if (report.definition.key === 'calculation') formula('hours', 'quantity', 'hoursPerUnit');
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF061B42' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: report.columns.length } };
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}
