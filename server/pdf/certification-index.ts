import { box, GREY_FILL, GREY_LINE, labelValueGrid, spacer, stack, textBlock, type Block, type PageSetup, type TableSpec } from './engine.ts';
import { renderDocument } from './document.ts';
import type { PdfProjectDocumentDefinition } from './documents.ts';
import { fileDay, fileSafe, naturalCompare } from './links.ts';
import { projectCertificates } from '../../shared/site-settings.ts';
import { certificatesForProject, inOwnerSite } from '../../shared/welder-data.ts';
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
export interface CertificateLine { cells: string[]; indexNo: string; name: string }
/**
 * The 13 printed cells of a certificate, read from the certificate as the Certifications page stores it: Index number,
 * Charge number, Certificate-type (`certType`), Attest number (`name`), Material No (the linked material's number),
 * Type of material and Material part (their catalogs), Dia. (`diameter`), Schedule, Wall thickness, Supplier,
 * Controlled and Accepted.
 */
export function certificateCells(rows: Rows, cert: Row): CertificateLine {
  const material = find(rows, 'materials', cert.materialId);
  const named = (key: string, id: unknown) => text(find(rows, key, id)?.name);
  const yes = (value: unknown) => value === true ? 'Yes' : 'No';
  const indexNo = text(cert.indexNo);
  return {
    indexNo, name: text(cert.name),
    cells: [
      indexNo, text(cert.chargeNo), text(cert.certType), text(cert.name), text(material?.materialNo), named('material_types', cert.materialTypeId), named('material_parts', cert.materialPartId),
      text(cert.diameter), text(cert.schedule), text(cert.wallThickness), named('suppliers', cert.supplierId), yes(cert.controlled), yes(cert.accepted),
    ],
  };
}
/**
 * The certificates of a project or main project: with "Project-specific Material Certificates" on for the main project, only the
 * certificates linked to the project (or to all projects), the rule of the weld form (`certificatesForProject` in
 * `shared/welder-data.ts`); a main project lists the certificates of any of its projects.
 */
export function indexCertificates(certificates: Row[], links: Row[], projectIds: string[], site: Row | null): Row[] {
  const wanted = new Set<string>();
  for (const projectId of projectIds) for (const certificate of certificatesForProject({ certificates, links, projectId, site: site ?? undefined })) wanted.add(certificate.id);
  return certificates.filter(certificate => wanted.has(certificate.id));
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
    // A certificate belongs to one main project: the index lists that main project's certificates (and shared older ones).
    if (site) { const owned = { links: store.list('certificate_projects', true), projects: store.list('projects', true) }; certificates = certificates.filter(cert => inOwnerSite('certifications', cert, site.id, owned)); }
    if (limited) certificates = indexCertificates(certificates, store.list('certificate_projects'), project ? [project.id] : store.list('projects').filter(row => row.siteId === site!.id).map(row => row.id), site);
    // The certificate decides what the account may see; the printed cells come from the stored record and the catalogs it names
    // (supplier, material, type of material...), which a pilot's own field list would otherwise hide from this document.
    const lookups: Rows = Object.fromEntries(['materials', 'material_types', 'material_parts', 'suppliers'].map(key => [key, store.list(key)]));
    const stored = new Map(store.list('certifications').map(cert => [cert.id, cert]));
    const { bytes } = await certificationIndexPdf({ rows: lookups, certificates: certificates.map(cert => stored.get(cert.id) ?? cert), generatedAt: now, limited, project: project ? [text(project.internnumber), text(project.description)].filter(Boolean).join(' - ') : 'All projects', mainProject: text(site?.name) });
    return { bytes, fileName: `${fileDay(now)}-${fileSafe(project?.internnumber ?? site?.name, 'all-projects')}-certification-index` };
  },
};
