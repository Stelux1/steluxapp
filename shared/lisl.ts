import type { Row, Value } from './types.ts';

export interface LislColumn { key: string; label: string; group: string; type?: 'number' | 'date' }
const group = (name: string, entries: (string | [string, string, ('number' | 'date')?])[]): LislColumn[] => entries.map(entry => typeof entry === 'string' ? { key: entry, label: entry, group: name } : { key: entry[0], label: entry[1], type: entry[2], group: name });
/** The 87 columns in the supplied Access `ISO details` table, in source order. */
export const LISL_COLUMNS: LislColumn[] = [
  ...group('ISO details', ['Project site', 'Project', 'Isometric', 'ITP No', 'IRN no', 'Asset Tag', 'Drawing No', 'X-Ray', 'X-Axis', 'Y-Axis', 'Piping Class', 'Test Pressure', 'Test System', 'Test Medium', 'PED', 'Nom diameter', 'Paint Spec', 'Insulation', 'Elevation', 'Chemical Clean', 'Tracing', 'Zone/Area', 'Material']),
  ...group('Weld details', ['Weld No', 'Weld Type', 'Joint type', 'Welder', 'Welder 2', 'Welder 3', 'Welder 4', 'Wire 1', 'Wire 2', ['Fitup date', 'Fitup date', 'date'], ['Weld date', 'Weld date', 'date'], 'Spool']),
  ...group('VT & NDT', ['VT', 'VT Report', 'VT Uploade', 'NDT Req#', ...[1, 2, 3, 4].flatMap(i => [`NDT ${i}`, `NDT ${i} result`, `NDT Report ${i}`]), ['NA Length', 'NA Length', 'number'], 'Defect type']),
  ...group('Heat treatment', ['Pre-HT locaction', 'Pre-HT process', ['Pre-HT date', 'Pre-HT date', 'date'], 'Pre-HT req#no', 'Pre-HT report no', 'PWHT location', 'PWHT process', ['PWHT date', 'PWHT date', 'date'], 'PWHT req#no', 'PWHT report no']),
  ...group('Material traceability', ['Index No 1', 'Pos 1', 'Charge No 1', 'Material 1', 'Article no 1', 'Index No 2', 'Pos 2', 'Charge No 2', 'Material 2', 'Article no 2', 'Wall thickness 1', 'Wall thickness 2', 'Schedule 1', 'Schedule 2']),
  ...group('Procedure & diameter', ['Welding Process', 'WPS No', 'Coating 1', ['Diameter (inch)', 'Diameter (inch)', 'number'], ['Outline', 'Outline', 'number'], ['Dia', 'Dia', 'number'], ['Dia Length', 'Dia Length', 'number'], 'Tracer', ['Created', 'Created', 'date'], ['Last edit date', 'Last edit date', 'date']]),
];

export function lislValues(weld: Row, rows: Record<string, Row[]>): Record<string, Value> {
  const find = (key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
  const text = (row: Row | undefined, key: string): Value => row?.[key] ?? '';
  const name = (key: string, id: unknown, field = 'name'): Value => text(find(key, id), field);
  const iso = find('isometrics', weld.isoId), project = find('projects', iso?.projectId);
  const wps = find('wps', weld.wpsId), diameter = find('diameters', weld.diameterId), type = find('weld_types', weld.typeId);
  const requests = (rows.inspection_requests || []).filter(row => !row._archived && row.weldId === weld.id && row.status !== 'Cancelled').sort((a, b) => String(a.date).localeCompare(String(b.date)) || a._createdAt.localeCompare(b._createdAt) || a.id.localeCompare(b.id));
  const results = (rows.inspection_results || []).filter(row => !row._archived && row.weldId === weld.id).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id));
  const resultFor = (request: Row | undefined) => request && results.find(row => row.requestId === request.id);
  const latest = (type: string) => results.find(row => row.type === type && requests.some(request => request.id === row.requestId));
  const vt = latest('VI');
  const values: Record<string, Value> = {
    'Project site': name('sites', project?.siteId), Project: text(project, 'internnumber'), Isometric: text(iso, 'isoNo'),
    'ITP No': text(iso, 'itpNo'), 'IRN no': text(iso, 'irn'), 'Asset Tag': text(iso, 'assetTag'), 'Drawing No': text(iso, 'drawingNo'), 'X-Ray': text(iso, 'xRay'), 'X-Axis': text(iso, 'xaxis'), 'Y-Axis': text(iso, 'yaxis'),
    'Piping Class': text(iso, 'pipingClass'), 'Test Pressure': text(iso, 'testPressure'), 'Test System': name('test_systems', iso?.testSystemId), 'Test Medium': text(iso, 'testMedium'), PED: text(iso, 'ped'), 'Nom diameter': text(iso, 'nomDiameter'), 'Paint Spec': text(iso, 'paintSpec'), Insulation: text(iso, 'insulation'), Elevation: text(iso, 'elevation'), 'Chemical Clean': text(iso, 'chemicalClean'), Tracing: text(iso, 'tracing'), 'Zone/Area': iso?.area || iso?.zone || '', Material: text(iso, 'material'),
    'Weld No': weld.weldNo, 'Weld Type': type?.abbreviation || type?.name || '', 'Joint type': weld.jointType || wps?.jointType || '',
    ...Object.fromEntries([1, 2, 3, 4].map(i => { const welder = find('welders', weld[`welder${i}Id`]); return [i === 1 ? 'Welder' : `Welder ${i}`, welder ? [welder.welderCode || welder.number, welder.name].filter(Boolean).join(' | ') : '']; })),
    'Wire 1': name('welding_wires', weld.wire1Id), 'Wire 2': name('welding_wires', weld.wire2Id), 'Fitup date': weld.datefit || '', 'Weld date': weld.date || '', Spool: name('spools', weld.spoolId),
    VT: vt ? vt.result === 'Accepted' ? 'Yes' : 'No' : '', 'VT Report': vt?.reportNo || '',
    'VT Uploade': vt ? (rows.attachments || []).some(file => !file._archived && file.entityType === 'inspection_results' && file.entityId === vt.id) ? 'Yes' : 'No' : '',
    'NDT Req#': weld.ndoReq ? 'Yes' : 'No', 'NA Length': latest('NDT')?.naLength ?? '', 'Defect type': latest('NDT')?.defectType || '',
    'Welding Process': wps?.method || name('weld_processes', wps?.processId), 'WPS No': text(wps, 'name'), 'Coating 1': name('coatings', weld.coating1Id),
    'Diameter (inch)': text(diameter, 'sizeinch'), Outline: text(diameter, 'outline'), Dia: text(diameter, 'sizeinch'), 'Dia Length': weld.lengthMode === 'Length in mm' ? weld.dialen ?? '' : 0,
    Tracer: weld.tracer ? 'Yes' : 'No', Created: weld._createdAt.slice(0, 10), 'Last edit date': weld._updatedAt.slice(0, 10),
  };
  const ndt = requests.filter(request => request.type === 'NDT');
  for (let i = 1; i <= 4; i++) {
    const request = ndt[i - 1], result = resultFor(request);
    values[`NDT ${i}`] = request ? name('ndt_processes', request.processId) : '';
    values[`NDT ${i} result`] = result?.result || '';
    values[`NDT Report ${i}`] = result?.reportNo || '';
  }
  for (const [prefix, type] of [['Pre-HT', 'PRE-HT'], ['PWHT', 'PWHT']]) {
    const request = requests.filter(request => request.type === type).at(-1), result = resultFor(request);
    values[`${prefix} ${prefix === 'Pre-HT' ? 'locaction' : 'location'}`] = request ? name('pwht_locations', request.pwhtLocationId) : '';
    values[`${prefix} process`] = request ? name('pwht_processes', request.pwhtProcessId) : '';
    values[`${prefix} date`] = result?.date || request?.date || '';
    values[`${prefix} req#no`] = request?.number || '';
    values[`${prefix} report no`] = result?.reportNo || '';
  }
  for (const side of [1, 2]) {
    const certificate = find('certifications', weld[`certificate${side}Id`]), material = find('materials', weld[`material${side}Id`] || certificate?.materialId);
    values[`Index No ${side}`] = certificate?.indexNo || '';
    values[`Pos ${side}`] = weld[`pos${side}`] || '';
    values[`Charge No ${side}`] = weld[`chargeNo${side}`] || certificate?.chargeNo || '';
    values[`Material ${side}`] = material?.description || certificate?.materialDescription || '';
    values[`Article no ${side}`] = material?.articleNo || '';
    values[`Wall thickness ${side}`] = certificate?.wallThickness || material?.wallThickness || '';
    values[`Schedule ${side}`] = certificate?.schedule || material?.lbs || '';
  }
  return values;
}
