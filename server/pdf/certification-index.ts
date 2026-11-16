import { box, GREY_FILL, GREY_LINE, labelValueGrid, spacer, stack, textBlock, type Block, type PageSetup, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { PdfProjectDocumentDefinition } from './documents.ts';
import { fileDay, fileSafe, naturalCompare } from './links.ts';
import { projectCertificates } from '../../shared/site-settings.ts';
import type { Row } from '../../shared/types.ts';

/**
 * Certification index (Weld Pilot or MTO Pilot, Material data -> Certifications -> "Certification index"): the
 * material certificates as Index number | Charge number | Certificate-type | Attest number | Material No |
 * Type of material | Material part | Dia. | Schedule | Wall thickness | Supplier | Controlled | Accepted.
 * With "Project-specific Material Certificates" on for the main project, a project (or the whole main project)
 * lists only the certificates linked to it.
 */
type Rows = Record<string, Row[]>;
const text = (value: unknown) => String(value ?? '').trim();
const find = (rows: Rows, key: string, id: unknown) => id ? (rows[key] || []).find(row => row.id === id) : undefined;
const ids = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : typeof value === 'string' && value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];

/**
 * The certificates linked to any of the projects. NOTE: `shared/` has no such helper yet and the certificate
 * record has no project field in this version, so the link is read locally from what exists: an explicit
 * `projectIds` / `projectId` / `allProjects` on the certificate (for when those fields are added), and the weld
 * records that name the certificate on one of their sides, via the weld's isometric. Welds and isometrics are
 * only used to find the link; the caller decides which certificates may be shown.
 */
export function certificatesForProject(rows: Rows, projectIds: string | string[]): Row[] {
  const wanted = new Set(Array.isArray(projectIds) ? projectIds : [projectIds]);
  const isoProject = new Map((rows.isometrics || []).map(iso => [iso.id, String(iso.projectId)]));
  const used = new Set<string>();
  for (const weld of rows.welds || []) {
    if (weld._archived || !wanted.has(isoProject.get(String(weld.isoId)) ?? '')) continue;
    for (const side of [1, 2]) if (weld[`certificate${side}Id`]) used.add(String(weld[`certificate${side}Id`]));
  }
  return (rows.certifications || []).filter(cert => !cert._archived && (cert.allProjects === true || used.has(cert.id) || wanted.has(String(cert.projectId ?? '')) || ids(cert.projectIds).some(id => wanted.has(id))));
}

export interface CertificateLine { cells: string[]; indexNo: string; name: string }
/** The 13 printed cells of a certificate. Cells the certificate record does not hold fall back to the linked material, or stay empty. */
export function certificateCells(rows: Rows, cert: Row): CertificateLine {
  const material = find(rows, 'materials', cert.materialId);
  const named = (key: string, ...refs: unknown[]) => { for (const ref of refs) { const row = find(rows, key, ref); if (row) return text(row.abbreviation) || text(row.name); } return ''; };
  const yes = (value: unknown) => value === true ? 'Yes' : value === false ? 'No' : '';
  const indexNo = text(cert.indexNo);
  return {
    indexNo, name: text(cert.name),
    cells: [
      indexNo, text(cert.chargeNo), named('certificate_types', cert.certificateTypeId) || text(cert.certificateType), text(cert.attestNo) || text(cert.name),
      text(material?.materialNo) || text(cert.materialCode), named('material_types', cert.typeId, cert.materialTypeId, material?.typeId) || text(cert.typeOfMaterial), named('material_parts', cert.partId, cert.materialPartId, material?.partId),
      text(cert.diameter) || text(material?.dia), text(cert.schedule) || text(material?.lbs), text(cert.wallThickness) || text(material?.wallThickness),
      named('suppliers', cert.supplierId), yes(cert.controlled), yes(cert.accepted),
    ],
  };
}
export const CERTIFICATE_COLUMNS: { header: string; width: number; align?: 'center' }[] = [
  { header: 'Index number', width: 7 }, { header: 'Charge number', width: 10 }, { header: 'Certificate-type', width: 8 }, { header: 'Attest number', width: 10 }, { header: 'Material No', width: 11 },
  { header: 'Type of material', width: 10 }, { header: 'Material part', width: 8 }, { header: 'Dia.', width: 5 }, { header: 'Schedule', width: 6 }, { header: 'Wall thickness', width: 7 },
  { header: 'Supplier', width: 10 }, { header: 'Controlled', width: 6, align: 'center' }, { header: 'Accepted', width: 6, align: 'center' },
];

export interface CertificationIndexInput {
  rows: Rows; certificates: Row[]; generatedAt: Date;
  /** Header lines: the project (or "All projects"), the main project and whether the list is limited to linked certificates. */
  project: string; mainProject: string; limited: boolean;
}
export function certificationIndexPdf(input: CertificationIndexInput) {
  const page: PageSetup = { size: 'A4', orientation: 'landscape', margins: { left: 24, right: 24 } };
  const lines = input.certificates.map(cert => certificateCells(input.rows, cert)).sort((a, b) => naturalCompare(a.indexNo, b.indexNo) || naturalCompare(a.name, b.name));
  return renderDocument({
    page, title: 'Certification index', generatedAt: input.generatedAt,
    layout() {
      const grid = labelValueGrid([
        { label: 'Project', value: input.project }, { label: 'Main project', value: input.mainProject },
        { label: 'Certificates', value: String(lines.length) }, { label: 'Filter', value: input.limited ? 'Only certificates linked to the project' : 'All certificates' },
      ], { columns: 2, size: 7.5, labelShare: 0.2 });
      const header: Block = stack([textBlock('Certification index', { size: 13, font: 'bold' }), spacer(5), box(grid, { fill: GREY_FILL, stroke: GREY_LINE, padding: 4 }), spacer(6)]);
      const table: TableSpec = { columns: CERTIFICATE_COLUMNS.map(column => ({ header: column.header, width: column.width, align: column.align })), rows: lines.map(line => line.cells), size: 7, headerSize: 7, fit: 'wrap', padding: 2.5 };
      return { header, table, after: lines.length ? [] : [textBlock('No certificates to list.', { size: 8, font: 'italic' })] };
    },
  });
}

export const certificationIndexDocument: PdfProjectDocumentDefinition = {
  key: 'certification-index', title: 'Certification index', scope: 'project', resource: 'certifications',
  async build({ store, rows, project, site, now }) {
    // The setting belongs to the main project; the links come from the full records, the certificates from what the account may read.
    const limited = Boolean(site) && projectCertificates(site);
    let certificates = (rows.certifications || []).filter(cert => !cert._archived);
    if (limited) {
      const scope = project ? [project.id] : store.list('projects').filter(row => row.siteId === site!.id).map(row => row.id);
      const linked = new Set(certificatesForProject({ certifications: certificates, welds: store.list('welds'), isometrics: store.list('isometrics') }, scope).map(cert => cert.id));
      certificates = certificates.filter(cert => linked.has(cert.id));
    }
    // The certificate decides what the account may see; the printed cells come from the stored record and the catalogs it names
    // (supplier, material, type of material...), which a pilot's own field list would otherwise hide from this document.
    const lookups: Rows = Object.fromEntries(['materials', 'material_types', 'material_parts', 'suppliers', 'certificate_types'].map(key => [key, store.list(key)]));
    const stored = new Map(store.list('certifications').map(cert => [cert.id, cert]));
    const { bytes } = await certificationIndexPdf({ rows: lookups, certificates: certificates.map(cert => stored.get(cert.id) ?? cert), generatedAt: now, limited, project: project ? [text(project.internnumber), text(project.description)].filter(Boolean).join(' - ') : 'All projects', mainProject: text(site?.name) });
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(project?.internnumber ?? site?.name, 'all-projects')}-certification-index` };
  },
};
