import type { Row, Value } from './types.ts';
import { lislValues } from './lisl.ts';

/**
 * The columns of Export weld data (Weld Pilot → Welding data → Export weld data), taken from the client's own export
 * file of 17.11.2026 (`Export-site2-user226-…xlsx`, 87 columns, sheet "Sheet1"). The headers are copied as that file
 * writes them, typing included ("Eelevation", "S chedule 2", and "NDT 1 Report" over the second NDT report), because
 * the client's own sheets read the file by these headers. Keys stay unique; only the labels repeat.
 * The Data LISL page keeps its own column list (`shared/lisl.ts`).
 */
export interface WeldExportColumn { key: string; label: string }
const HEADERS = [
  'Project Site', 'Project', 'Iso No', 'ITP no', 'IRN', 'Asset Tag', 'Drawing No', 'xRay', 'X-axis', 'Y-axis', 'Piping Class', 'Test Pressure', 'Test System', 'Test Medium', 'PED', 'Nom Diameter', 'Paint Spec', 'Insulation', 'Eelevation', 'Chemical Clean', 'Tracing', 'Zone', 'Material',
  'Weld no', 'Weld type', 'Joint Type', 'Welder', 'Welder 2', 'Welder 3', 'Welder 4', 'Wire 1', 'Wire 2', 'Date fit', 'Date', 'Spool',
  'VT', 'VT no', 'VT doc', 'NDT', 'NDT 1 Process', 'NDT 1 result', 'NDT 1 Report', 'NDT 2 Process', 'NDT 2 result', 'NDT 1 Report', 'NDT 3 Process', 'NDT 3 result', 'NDT 3 Report', 'NDT 4 Process', 'NDT 4 result', 'NDT 4 Report', 'Defect', 'Defect type',
  'PWHT Pre Location', 'PWHT Pre Process', 'PWHT Pre Date', 'PWHT Pre Request No', 'PWHT Pre Report No', 'PWHT Location', 'PWHT Process', 'PWHT Date', 'PWHT Request No', 'PWHT Report No',
  'Index No 1', 'Pos 1', 'Charge No 1', 'Material 1', 'Article No 1', 'Index No 2', 'Pos 2', 'Charge no 2', 'Material 2', 'Article No 2', 'WT 1', 'WT 2', 'Schedule 1', 'S chedule 2',
  'Welding Process', 'Wps No', 'Coating 1', 'Size inch', 'Outline', 'Diameter', 'Diameter mm', 'Tracer', 'Created', 'Last edit date',
] as const;
/** Column key = the header, except the second "NDT 1 Report" (it holds the report of NDT 2). */
export const WELD_EXPORT_COLUMNS: WeldExportColumn[] = HEADERS.map((label, index) => ({ key: label === 'NDT 1 Report' && index > 41 ? 'NDT 2 Report' : label, label }));

/** What the client's file writes for an empty welder or wire. */
export const EMPTY_PERSON = '------';
const text = (value: unknown) => value === null || value === undefined ? '' : String(value);
const resultWord = (value: unknown) => value === 'Accepted' ? 'YES' : value === 'Rejected' ? 'NO' : '';
/** A size the catalog stores as a bare number ("2", "1.5", "0,75") carries the inch mark, as in the client's file ('3"'); anything else stays as entered. */
const inch = (value: string) => /^\d+(?:[.,]\d+)?$/.test(value) ? `${value}"` : value;
/** "2026-08-03 14:42:31" from a stored ISO time stamp. */
const stamp = (value: unknown) => text(value).replace('T', ' ').slice(0, 19);

/** One export line of a weld, in the client's value formats (Yes / No flags, YES / NO results, "------" for no welder). */
export function weldExportValues(weld: Row, rows: Record<string, Row[]>): Record<string, Value> {
  const lisl = lislValues(weld, rows);
  const find = (key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
  const wps = find('wps', weld.wpsId), diameter = find('diameters', weld.diameterId);
  const process = text(lisl['Welding Process']);
  const wire = (id: unknown) => {
    const row = find('welding_wires', id);
    if (!row) return EMPTY_PERSON;
    const mm = row.diameter === null || row.diameter === undefined || row.diameter === '' ? '' : `${row.diameter} mm`;
    return [text(row.name), process, text(row.classification), mm].join(' / ');
  };
  /** "3\"/40/5,49/A234-WPB/Equal Tee": size / schedule / wall / type of material / part, "???" when the part is unknown. */
  const material = (side: 1 | 2) => {
    const certificate = find('certifications', weld[`certificate${side}Id`]), row = find('materials', weld[`material${side}Id`] || certificate?.materialId);
    const part = text(find('material_parts', row?.partId)?.name) || text(row?.description) || text(certificate?.materialDescription);
    const grade = text(find('material_types', row?.typeId)?.name);
    return [inch(text(row?.dia)), text(lisl[`Schedule ${side}`]), text(lisl[`Wall thickness ${side}`]), grade, part || '???'].join('/');
  };
  const vt = text(lisl.VT);
  const values: Record<string, Value> = {
    'Project Site': lisl['Project site'], Project: lisl.Project, 'Iso No': lisl.Isometric, 'ITP no': lisl['ITP No'], IRN: lisl['IRN no'], 'Asset Tag': lisl['Asset Tag'], 'Drawing No': lisl['Drawing No'],
    xRay: lisl['X-Ray'], 'X-axis': lisl['X-Axis'], 'Y-axis': lisl['Y-Axis'], 'Piping Class': lisl['Piping Class'], 'Test Pressure': lisl['Test Pressure'], 'Test System': lisl['Test System'], 'Test Medium': lisl['Test Medium'],
    PED: lisl.PED, 'Nom Diameter': lisl['Nom diameter'], 'Paint Spec': lisl['Paint Spec'], Insulation: lisl.Insulation, Eelevation: lisl.Elevation, 'Chemical Clean': lisl['Chemical Clean'], Tracing: lisl.Tracing, Zone: lisl['Zone/Area'], Material: lisl.Material,
    'Weld no': lisl['Weld No'], 'Weld type': lisl['Weld Type'], 'Joint Type': lisl['Joint type'],
    Welder: text(lisl.Welder) || EMPTY_PERSON, 'Welder 2': text(lisl['Welder 2']) || EMPTY_PERSON, 'Welder 3': text(lisl['Welder 3']) || EMPTY_PERSON, 'Welder 4': text(lisl['Welder 4']) || EMPTY_PERSON,
    'Wire 1': wire(weld.wire1Id), 'Wire 2': wire(weld.wire2Id), 'Date fit': lisl['Fitup date'], Date: lisl['Weld date'], Spool: lisl.Spool,
    VT: vt === 'Yes' ? 'Yes' : 'No', 'VT no': lisl['VT Report'], 'VT doc': lisl['VT Uploade'] === 'Yes' ? 'Yes' : 'No', NDT: lisl['NDT Req#'] === 'Yes' ? 'Yes' : 'No',
    Defect: lisl['NA Length'], 'Defect type': lisl['Defect type'],
    'Welding Process': process, 'Wps No': text(wps?.name), 'Coating 1': lisl['Coating 1'],
    'Size inch': text(diameter?.sizeinch) || '0', Outline: lisl.Outline, Diameter: text(diameter?.sizeinch) || text(diameter?.diameter) || '0', 'Diameter mm': weld.lengthMode === 'Length in mm' ? text(weld.dialen) || '0' : '0',
    Tracer: weld.tracer ? 'Yes' : '', Created: text(weld._createdAt).slice(0, 10), 'Last edit date': stamp(weld._updatedAt),
  };
  for (const i of [1, 2, 3, 4]) {
    values[`NDT ${i} Process`] = lisl[`NDT ${i}`];
    values[`NDT ${i} result`] = resultWord(lisl[`NDT ${i} result`]);
    values[`NDT ${i} Report`] = lisl[`NDT Report ${i}`];
  }
  for (const [prefix, source] of [['PWHT Pre', 'Pre-HT'], ['PWHT', 'PWHT']] as const) {
    values[`${prefix} Location`] = lisl[`${source} ${source === 'Pre-HT' ? 'locaction' : 'location'}`];
    values[`${prefix} Process`] = lisl[`${source} process`];
    values[`${prefix} Date`] = lisl[`${source} date`];
    values[`${prefix} Request No`] = lisl[`${source} req#no`];
    values[`${prefix} Report No`] = lisl[`${source} report no`];
  }
  for (const side of [1, 2] as const) {
    values[`Index No ${side}`] = lisl[`Index No ${side}`];
    values[`Pos ${side}`] = lisl[`Pos ${side}`];
    values[side === 1 ? 'Charge No 1' : 'Charge no 2'] = lisl[`Charge No ${side}`];
    values[`Material ${side}`] = material(side);
    values[`Article No ${side}`] = lisl[`Article no ${side}`];
    values[`WT ${side}`] = lisl[`Wall thickness ${side}`];
    values[side === 1 ? 'Schedule 1' : 'S chedule 2'] = lisl[`Schedule ${side}`];
  }
  return Object.fromEntries(WELD_EXPORT_COLUMNS.map(column => [column.key, text(values[column.key])]));
}
