import { canDocument, type AnyPdfDefinition } from './documents.ts';
import { ATTACHMENT_POSITIONS, orderedAttachmentNames } from '../../shared/weld-catalogs.ts';
import { attachmentPartKey, FIXED_PART_LABELS, FIXED_PART_ORDER, lislPartKey, type BookPartSource } from '../../shared/iso-book.ts';
import { currentRevision } from '../../shared/revisions.ts';
import { inspectionCellState, type InspectionKind } from '../../shared/inspections.ts';
import { certificatesForProject } from '../../shared/welder-data.ts';
import { projectCertificates } from '../../shared/site-settings.ts';
import type { Row, User } from '../../shared/types.ts';

/**
 * Which files and which generated documents make up each part of the ISO Book. This module decides only what a part
 * contains for one isometric; reading the files and assembling the PDF is `iso-book.ts`.
 */
export type Rows = Record<string, Row[]>;
export interface BookContext {
  user: User;
  /** Records the account may read (archived included, like the other documents). */
  rows: Rows;
  registry: AnyPdfDefinition[];
  /** True when the account may download the attachment directly (the same checks as `GET /api/files/:id`). */
  canFile(file: Row): boolean;
  /** The main project (site) record with its settings, read for a rule only (never printed); undefined when unknown. */
  site(id: unknown): Row | undefined;
  /** The certificate-to-project links, read for the "project-specific certificates" rule only. */
  certificateLinks(): Row[];
}
export interface PartPlan {
  key: string; label: string; source: BookPartSource;
  position?: 'Before Isometric' | 'After Isometric';
  /** Registry documents that fill the part (all of them are built, in registry order). */
  generators: AnyPdfDefinition[];
  /** Whether uploaded files can belong to the part. */
  files: boolean;
  /** Said when nothing is available and no generator exists. */
  missing: string;
}
export interface PartState { available: boolean; reason?: string; generators: AnyPdfDefinition[]; files: Row[] }

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows: Row[] | undefined) => (rows || []).filter(row => !row._archived);
const byCreated = (a: Row, b: Row) => a._createdAt.localeCompare(b._createdAt) || a.id.localeCompare(b.id);

/**
 * Registry documents that are no part of the reference's ISO Book (its checkbox list in `reference/montavar/mto.md`),
 * with the reason; every other document of PDF_DOCUMENTS fills a part (a test holds the registry to this).
 */
export const NOT_IN_BOOK: Record<string, string> = {
  'weld-cards': 'Weld cards are cut out and handed to the welders; the book has no Weld card part.',
  'weld-labels': 'Weld labels are stuck on the spools; the book\'s Flange labels part is a different label and is deferred.',
  'flange-labels': 'Flange labels are printed for the flanges ticked on the Flange Management page; the book\'s Flange labels part stays deferred.',
  'hydrotest-request': 'A hydrotest request covers a test system of several isometrics; the book has no Hydrotest part.',
};

/** The part a registry document fills: its own `bookPart`, else a match on its key (names of other agents' documents follow the reference's wording). */
export function partOfDocument(definition: AnyPdfDefinition): string | undefined {
  const key = definition.key.toLowerCase(), part = definition.bookPart;
  if (key in NOT_IN_BOOK) return undefined;
  if (part && part !== 'lisl') return part;
  if (part === 'lisl' || ('report' in definition && definition.report === 'lisl') || key.startsWith('lisl')) return /blank|template/.test(key) ? 'lisl-blank' : lislPartKey(definition.key);
  if (/pick/.test(key)) return 'pick-lists';
  if (/punch/.test(key)) return /blank|empty|template/.test(key) ? 'punch-list-blank' : 'punch-list';
  if (/flange/.test(key) && !/label/.test(key)) return 'flange-report';
  if (/cert.*index|index.*cert/.test(key)) return 'certificate-index';
  if (/release/.test(key)) return /prefab/.test(key) ? 'prefab-release' : /field/.test(key) ? 'field-release' : undefined;
  if (/^mto/.test(key)) return 'mto-report';
  if (/visual|^vi($|-)/.test(key)) return 'visual-reports';
  if (/welder.*summary|summary.*welder/.test(key)) return 'welders-summary';
  return undefined;
}

const FILE_PARTS = new Set(['itp', 'itp2', 'isometric', 'ndt-pre', 'ndt', 'pwht', 'pqr', 'wps', 'ndt-process-docs', 'visual-reports', 'prefab-release', 'field-release', 'material-certificates']);
const MISSING: Record<string, string> = {
  itp: 'No ITP document is uploaded for the current revision.', itp2: 'No ITP 2 document is uploaded for the current revision.',
  isometric: 'No drawing file is uploaded for the current revision.',
  'ndt-pre': 'No NDT Pre report file is uploaded on the welds.', ndt: 'No NDT report file is uploaded on the welds.', pwht: 'No PWHT report file is uploaded on the welds.',
  'visual-reports': 'No visual report file is uploaded on the welds.',
  pqr: 'No PQR file is uploaded for the WPS used on this isometric.', wps: 'No WPS file is uploaded for the WPS used on this isometric.',
  'ndt-process-docs': 'No document is uploaded for the NDT processes used on this isometric.',
  'prefab-release': 'No Prefab release is uploaded for this isometric.', 'field-release': 'No Field release is uploaded for this isometric.',
  'material-certificates': 'No certificate file is uploaded for the certificates used on this isometric.',
  'pick-lists': 'No pick list exists for this isometric.', 'punch-list': 'No punch item is recorded for this isometric.',
  'flange-report': 'No flange is recorded for this isometric.',
};
/** Said when a part's documents are permitted but there is nothing of them for the isometric. */
const NOTHING = 'Nothing of this part is recorded for this isometric.';
const NO_GENERATOR = 'This document is not available in this workspace yet.';

/** Every part in book order for the registry and attachment names given (custom names flagged "ISO Book" sit before / after the isometric). */
export function bookPlans(registry: AnyPdfDefinition[], attachmentNames: Row[]): PartPlan[] {
  const byPart = new Map<string, AnyPdfDefinition[]>();
  for (const definition of registry) { const part = partOfDocument(definition); if (part) byPart.set(part, [...(byPart.get(part) || []), definition]); }
  const plan = (key: string, label: string, extra: Partial<PartPlan> = {}): PartPlan => {
    const generators = byPart.get(key) || [], files = FILE_PARTS.has(key);
    return { key, label, generators, files, source: key === 'task-sheet' ? 'cover' : generators.length && files ? 'both' : generators.length ? 'generated' : 'files', missing: files ? MISSING[key] : generators.length ? MISSING[key] || NOTHING : NO_GENERATOR, ...extra };
  };
  const custom = orderedAttachmentNames(attachmentNames).filter(row => row.isoBook === true);
  const customPlan = (row: Row): PartPlan => ({ key: attachmentPartKey(row.id), label: text(row.name), source: 'custom', position: row.position === ATTACHMENT_POSITIONS[1] ? 'After Isometric' : 'Before Isometric', generators: [], files: true, missing: `No file named "${text(row.name)}" is attached to this isometric.` });
  const before = custom.filter(row => row.position !== ATTACHMENT_POSITIONS[1]).map(customPlan), after = custom.filter(row => row.position === ATTACHMENT_POSITIONS[1]).map(customPlan);
  const plans: PartPlan[] = [];
  for (const key of FIXED_PART_ORDER) {
    if (key === 'isometric') plans.push(...before);
    if (key === 'lisl') {
      const variants = registry.filter(definition => { const part = partOfDocument(definition); return part?.startsWith('lisl:'); });
      if (!variants.length) plans.push(plan('lisl', 'LISL'));
      for (const definition of variants) plans.push({ ...plan(lislPartKey(definition.key), definition.title), generators: [definition], source: 'generated', files: false });
      continue;
    }
    plans.push(plan(key, FIXED_PART_LABELS[key]));
    if (key === 'isometric') plans.push(...after);
  }
  return plans;
}

// ----- files of one isometric ---------------------------------------------------------------------------------------

/** Attachments of one record. */
const attachmentsOf = (rows: Rows, entityType: string, ids: Iterable<string>) => { const wanted = new Set(ids); return live(rows.attachments).filter(file => file.entityType === entityType && wanted.has(String(file.entityId))); };
/** Files of the isometric itself: uploads on the isometric and on its drawing revisions. */
function isoFiles(rows: Rows, iso: Row): Row[] {
  const revisions = live(rows.revisions).filter(row => row.isoId === iso.id).map(row => row.id);
  return [...attachmentsOf(rows, 'isometrics', [iso.id]), ...attachmentsOf(rows, 'revisions', revisions)].sort(byCreated);
}
/** The file of the CURRENT revision of a drawing kind (ISO, ITP, ITP 2); an upload without a revision counts as a fallback. */
export function currentDrawingFile(rows: Rows, iso: Row, kind: 'ISO' | 'ITP' | 'ITP 2'): Row | undefined {
  const files = isoFiles(rows, iso), revision = currentRevision(rows, iso.id, kind);
  const named = files.filter(file => file.documentType === `${kind} revision ${revision}`);
  return (named.length ? named : files.filter(file => file.documentType === kind)).at(-1);
}
const weldsOf = (rows: Rows, iso: Row) => live(rows.welds).filter(weld => weld.isoId === iso.id);
function inspectionFiles(rows: Rows, iso: Row, kind: InspectionKind): Row[] {
  const seen = new Map<string, Row>();
  for (const weld of weldsOf(rows, iso)) for (const file of inspectionCellState(weld, kind, { results: rows.inspection_results, requests: rows.inspection_requests, attachments: rows.attachments, welds: rows.welds }).reportFiles) seen.set(file.id, file);
  return [...seen.values()].sort(byCreated);
}
const unique = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))];
function wpsIds(rows: Rows, iso: Row) { return unique(weldsOf(rows, iso).map(weld => weld.wpsId)); }
function pqrIds(rows: Rows, iso: Row) {
  const ids = wpsIds(rows, iso), wps = live(rows.wps).filter(row => ids.includes(row.id));
  return unique([...wps.map(row => row.pqrId), ...live(rows.wps_pqr).filter(link => ids.includes(String(link.wpsId))).map(link => link.pqrId)]);
}
/**
 * Certificates used on the isometric's welds (side 1 and 2). With "Project-specific Material Certificates" on for the
 * main project only the project's certificates count (the rule of the weld form, `certificatesForProject`).
 */
export function isoCertificates(context: BookContext, iso: Row): Row[] {
  const rows = context.rows;
  const used = new Set(unique(weldsOf(rows, iso).flatMap(weld => [weld.certificate1Id, weld.certificate2Id])));
  const project = live(rows.projects).find(row => row.id === iso.projectId), site = context.site(project?.siteId);
  const offered = certificatesForProject({ certificates: live(rows.certifications), links: context.certificateLinks(), projectId: String(iso.projectId), site: projectCertificates(site) ? { projectCertificates: true } : undefined });
  return offered.filter(certificate => used.has(certificate.id));
}
const customFiles = (rows: Rows, iso: Row, name: string) => isoFiles(rows, iso).filter(file => text(file.documentType).toLowerCase() === name.toLowerCase());
const sameType = (type: string) => (release: Row) => release.type === type;

/** The uploaded files of one part for one isometric (before the account's download check). */
export function partFiles(plan: PartPlan, context: BookContext, iso: Row): Row[] {
  const rows = context.rows;
  const one = (file: Row | undefined) => file ? [file] : [];
  switch (plan.key) {
    case 'itp': return [...one(currentDrawingFile(rows, iso, 'ITP')), ...attachmentsOf(rows, 'itps', unique([iso.itpId]))];
    case 'itp2': return [...one(currentDrawingFile(rows, iso, 'ITP 2')), ...attachmentsOf(rows, 'itps', unique([iso.itp2Id]))];
    case 'isometric': return one(currentDrawingFile(rows, iso, 'ISO'));
    case 'ndt-pre': return inspectionFiles(rows, iso, 'NDT PRE');
    case 'ndt': return inspectionFiles(rows, iso, 'NDT');
    case 'pwht': return inspectionFiles(rows, iso, 'PWHT');
    case 'visual-reports': return inspectionFiles(rows, iso, 'VI');
    case 'wps': return attachmentsOf(rows, 'wps', wpsIds(rows, iso)).sort(byCreated);
    case 'pqr': return attachmentsOf(rows, 'pqr', pqrIds(rows, iso)).sort(byCreated);
    case 'ndt-process-docs': {
      const weldIds = new Set(weldsOf(rows, iso).map(weld => weld.id));
      return attachmentsOf(rows, 'ndt_processes', unique(live(rows.inspection_requests).filter(request => weldIds.has(String(request.weldId))).map(request => request.processId))).sort(byCreated);
    }
    case 'prefab-release': case 'field-release': {
      const type = plan.key === 'prefab-release' ? 'Prefab' : 'Field';
      return attachmentsOf(rows, 'releases', live(rows.releases).filter(release => release.isoId === iso.id).filter(sameType(type)).map(release => release.id)).sort(byCreated);
    }
    case 'material-certificates': return attachmentsOf(rows, 'certifications', isoCertificates(context, iso).map(certificate => certificate.id)).sort(byCreated);
    default: return plan.source === 'custom' ? customFiles(rows, iso, plan.label) : [];
  }
}

/** What the part holds for the isometric and the account: permitted generators and downloadable files, or the reason it is disabled. */
export function partState(plan: PartPlan, context: BookContext, iso: Row): PartState {
  if (plan.key === 'task-sheet') return { available: true, generators: [], files: [] };
  const permitted = plan.generators.filter(definition => canDocument(context.user, definition));
  // A document of its own record contributes only when the isometric has such a record (a request, a release, a pick list).
  const printable = permitted.filter(definition => definition.scope !== 'scoped' || !definition.bookRuns || definition.bookRuns(context.rows, iso).length > 0);
  const all = plan.files ? partFiles(plan, context, iso) : [], files = all.filter(file => context.canFile(file));
  if (printable.length || files.length) return { available: true, generators: printable, files };
  const reason = !plan.generators.length ? (all.length ? 'You may not open the uploaded files of this part.' : plan.missing)
    : !permitted.length ? (plan.files && !all.length ? plan.missing : 'Your permission profile does not allow this document.')
    : all.length ? 'You may not open the uploaded files of this part.' : plan.missing;
  return { available: false, reason, generators: [], files: [] };
}
