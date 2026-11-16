import type { Field, Resource, Row } from './types.ts';

/**
 * The project and isometric forms of the hosted profile (Weld Pilot and MTO Pilot), as the reference shows them:
 * the list columns of the Projects page, the Add / Edit project fields, and the Add / Edit isometric fields with the
 * reference labels and order (captures weld__welding__projects.txt:91-115, weld__iso__0001.txt:976-1092 for Add and
 * weld__iso__0001__edit-isometric.txt for Edit). Pure functions: the server delivers the same definitions, the browser
 * only mirrors them. Stored values of the fields that are hidden here stay on the records.
 */

// ----- Projects -----------------------------------------------------------------------------------------------------

/** Columns of the Projects list in the reference order; "Status (%)" follows from the list itself (the weld completion). */
export const PROJECT_LIST_COLUMNS = ['internnumber', 'externnumber', 'description', 'contact', 'authority'];
/** What the list headers read, in order: the client's names for the first two (Blitzkrieg - Zahtevi, p.2-3), the reference's for the rest. */
export const PROJECT_LIST_HEADERS = ['Sub Projects', 'Plant location', 'Project description', 'Contact name', 'Authority', 'Status (%)'];
/** The labels of the Add / Edit project form. */
export const PROJECT_LABELS: Record<string, string> = {
  internnumber: 'Sub Projects', externnumber: 'Plant location', contact: 'Contact name', phone: 'Phone', authority: 'Authority', description: 'Project description',
  siteId: 'Main project',
};
/** The Add / Edit project fields in the reference order (Application Visibility last); our own fields follow in the "More" section. */
export const PROJECT_FORM_ORDER = ['internnumber', 'externnumber', 'contact', 'phone', 'authority', 'description', 'weldPilot', 'mtoPilot'];
/** The section of our own project fields, which the reference form does not have. */
export const PROJECT_MORE = 'More';
/** Our own project fields: the main project the subproject belongs to, the company, the state and the dates. */
export const PROJECT_MORE_FIELDS = ['siteId', 'companyId', 'status', 'startdate', 'enddate'];
export const PROJECT_WORDING = { add: 'Add project', edit: 'Edit project', remove: 'Delete project' };

const ORDER_REST = Number.MAX_SAFE_INTEGER;
const sortBy = <T extends { name: string }>(fields: T[], order: string[]): T[] => {
  const rank = (name: string) => { const index = order.indexOf(name); return index < 0 ? ORDER_REST : index; };
  return [...fields].sort((a, b) => rank(a.name) - rank(b.name));
};

/** The projects resource as the hosted profile shows it: reference columns, labels and field order, wording "Add project" / "Add". */
export function hostedProjectResource(resource: Resource): Resource {
  const fields = resource.fields.map((field): Field => {
    const base = PROJECT_LABELS[field.name] ? { ...field, label: PROJECT_LABELS[field.name] } : field;
    if (field.name === 'weldPilot' || field.name === 'mtoPilot') return { ...base, section: undefined, hint: field.name === 'weldPilot' ? 'Application Visibility: show this project in Weld Pilot.' : 'Application Visibility: show this project in MTO Pilot.' };
    if (field.name === 'description') return { ...base, section: undefined };
    if (PROJECT_MORE_FIELDS.includes(field.name)) return { ...base, section: PROJECT_MORE };
    return base;
  });
  return { ...resource, wording: PROJECT_WORDING, columns: PROJECT_LIST_COLUMNS.filter(name => fields.some(field => field.name === name)), fields: sortBy(fields, [...PROJECT_FORM_ORDER, ...PROJECT_MORE_FIELDS]) };
}

// ----- Isometrics ---------------------------------------------------------------------------------------------------

/** Labels of the reference (the same in Add and Edit); the Memo label differs, see `isometricFormFields`. */
export const ISO_FORM_LABELS: Record<string, string> = {
  isoNo: 'Iso number', irn: 'IRN', revNo: 'Revision number', itpId: 'ITP No', itp2Id: 'ITP Field', assetTag: 'Asset tag', drawingNo: 'Drawing no. 1', date: 'Date',
  noBoReg: 'NoBo Reg. no.', noBoSerial: 'NoBo serial', pipingClass: 'Piping class', testPressure: 'Test pressure', testSystemId: 'Test system', testMedium: 'Test medium',
  xRay: 'X Ray %', ndtnorm: 'NDT norm', ped: 'PED Cat.-Mod', nomDiameter: 'Nom. diameter', material: 'Material', paintSpec: 'Paint spec.', ral: 'RAL',
  insulation: 'Insulation', elevation: 'Elevation', xaxis: 'X axis', yaxis: 'Y axis', zone: 'Zone / Area', priority: 'Priority', chemicalClean: 'Chemical clean',
  tracing: 'Tracing Spec', normNo: 'Norm No.', norm: 'Norm', noBo: 'NoBo', pwht: 'PWHT',
};
/** Add isometric (weld__iso__0001.txt:976-1092). `projectId` is ours: the reference adds from inside one project. */
export const ISO_ADD_ORDER = ['isoNo', 'projectId', 'irn', 'revNo', 'itpId', 'itp2Id', 'assetTag', 'drawingNo', 'date', 'noBoReg', 'noBoSerial', 'pipingClass', 'testPressure', 'testSystemId', 'testMedium', 'xRay', 'ndtnorm', 'ped', 'nomDiameter', 'material', 'paintSpec', 'ral', 'insulation', 'elevation', 'xaxis', 'yaxis', 'zone', 'priority', 'chemicalClean', 'tracing', 'normNo', 'norm', 'noBo', 'pwht', 'description'];
/** Edit isometric (weld__iso__0001__edit-isometric.txt): Asset tag comes before IRN. */
export const ISO_EDIT_ORDER = ['isoNo', 'projectId', 'assetTag', 'irn', 'revNo', 'itpId', 'itp2Id', 'drawingNo', 'date', 'noBoReg', 'noBoSerial', 'pipingClass', 'testPressure', 'testSystemId', 'testMedium', 'xRay', 'ndtnorm', 'ped', 'nomDiameter', 'material', 'paintSpec', 'ral', 'insulation', 'elevation', 'xaxis', 'yaxis', 'zone', 'priority', 'chemicalClean', 'tracing', 'normNo', 'norm', 'noBo', 'pwht', 'description'];
/**
 * Fields the reference form does not have. They stay stored: the ASME / ASME2 and NDT % duplicates of Norm / Norm No. / X Ray %,
 * the ITP numbers as typed text (the ITP pickers write them), their revisions (Add rev) and the phase flags (Set phase only).
 */
export const ISO_FORM_HIDDEN = ['asme', 'asme2', 'ndtPercentage', 'itpNo', 'itpNo2', 'itpRevNo', 'itp2RevNo', 'prefab_materials', 'prefab_est', 'prefab_welds', 'prefab_doc', 'field_doc', 'field_test', 'field_release', 'prep_finished'];
/** Our own isometric fields that stay, in a "More" section after the reference fields. */
export const ISO_MORE_FIELDS = ['fieldPackageId', 'area', 'pressureTestPlan'];
/** Read-only: the test system is assigned in the Hydrotest release, X Ray % comes from the ITP. */
export const ISO_READONLY_HINTS: Record<string, string> = {
  testSystemId: 'Assigned in the Hydrotest release; not editable here.',
  xRay: 'Comes from the linked ITP; not editable here.',
};
export const ISO_TEST_SYSTEM_READONLY = 'The test system is assigned in the Hydrotest release. It cannot be changed here.';
export const ISO_MEMO_LABEL = { add: 'Memo', edit: 'Instructions for field personnel' };
/** The three PDF inputs of Add isometric, and the one of Edit isometric, with the document each is saved as. */
export const ISO_ADD_FILES = [{ name: 'fileiso', label: 'Isometric', kind: 'ISO' }, { name: 'fileitp', label: 'ITP document', kind: 'ITP' }, { name: 'fileitp2', label: 'ITP document Field', kind: 'ITP 2' }] as const;
export const ISO_EDIT_FILES = [ISO_ADD_FILES[0]] as const;
export const ISO_EDIT_FILES_NOTE = 'ITP PDFs are managed in the ITP catalog. Select ITPs above; the latest revision is synced automatically.';
export const isoFiles = (editing: boolean) => editing ? ISO_EDIT_FILES : ISO_ADD_FILES;

/** The isometrics resource of the hosted profile: reference labels, read-only test system and X Ray %, duplicates and phase flags hidden. */
export function hostedIsometricResource(resource: Resource): Resource {
  const fields = resource.fields.map((field): Field => {
    const label = ISO_FORM_LABELS[field.name];
    const flat = { section: field.section === 'Technical details' || field.section === 'Notes' ? undefined : field.section };
    let next: Field = label ? { ...field, label, ...flat } : { ...field, ...flat };
    if (ISO_READONLY_HINTS[field.name]) next = { ...next, readonly: true, hint: ISO_READONLY_HINTS[field.name] };
    if (ISO_FORM_HIDDEN.includes(field.name)) next = { ...next, hidden: true };
    if (ISO_MORE_FIELDS.includes(field.name)) next = { ...next, section: 'More' };
    return next;
  });
  return { ...resource, fields };
}
/**
 * The isometric form fields in the order of Add (no record) or Edit (a record), the Memo labelled as that form calls it.
 * Fields the reference does not have keep their order after the listed ones.
 */
export function isometricFormFields<T extends { name: string; label?: string }>(fields: T[], record?: Record<string, unknown>): T[] {
  const sorted = sortBy(fields, record ? ISO_EDIT_ORDER : ISO_ADD_ORDER);
  return sorted.map(field => field.name === 'description' ? { ...field, label: record ? ISO_MEMO_LABEL.edit : ISO_MEMO_LABEL.add } : field);
}

/** The document type an uploaded PDF is saved under: the drawing's current revision when it has one (as the Documents tab does). */
export function isoDocumentType(kind: string, iso: Record<string, unknown>): string {
  const revision = kind === 'ISO' ? iso.revNo : kind === 'ITP 2' ? iso.itp2RevNo : iso.itpRevNo;
  return revision !== undefined && revision !== null && String(revision) !== '' ? `${kind} revision ${revision}` : kind;
}
/** The message of a chosen file that is not a PDF ('' when it is one). */
export const pdfFileError = (fileName: string) => /\.pdf$/i.test(fileName) ? '' : 'Choose a PDF file.';

/** A write to the isometric record that tries to change the test system (the Hydrotest release assigns it). */
export function isoTestSystemError(input: Record<string, unknown>, existing: Row | undefined): string {
  if (input.testSystemId === undefined) return '';
  return String(input.testSystemId ?? '').trim() === String(existing?.testSystemId ?? '').trim() ? '' : ISO_TEST_SYSTEM_READONLY;
}
