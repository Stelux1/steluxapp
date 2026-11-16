import type { Row } from './types.ts';
import { orderedAttachmentNames } from './weld-catalogs.ts';

/**
 * Options → Attachments of an isometric (reference: dialog #isoAttachmentsModal). The file is stored with the chosen
 * attachment name as its document type; several PDFs go up in one request and the ticked ones are deleted (archived).
 * Pure rules shared by the dialog and the server routes (server/iso-dialogs.ts).
 */
export const ISO_ATTACHMENTS_TITLE = 'Attachments';
export const ISO_ATTACHMENTS_UPLOAD_LABEL = 'Upload (Hold CTRL for multiple files upload) Only PDFs are allowed';
/** The toast of Delete with nothing ticked. */
export const CHECK_FOR_DELETE = 'Check for delete';
export const ISO_ATTACHMENTS_FILE_LIMIT = 20;
export const ISO_ATTACHMENTS_NOT_PDF = 'Only PDFs are allowed.';
export const ISO_ATTACHMENTS_NO_FILE = 'Choose at least one PDF file.';
export const ISO_ATTACHMENTS_NO_TYPE = 'Choose a report type.';

const text = (value: unknown) => String(value ?? '').trim();

export const isPdfName = (name: unknown) => /\.pdf$/i.test(text(name));

/** The report types the select offers: the live attachment names in the catalog's order; the first is the default. */
export const reportTypes = (names: Row[] | null | undefined): Row[] => orderedAttachmentNames(names || []);

/**
 * The attachments the dialog lists and counts: the live files of the isometric whose document type is one of the
 * attachment names (the drawing and ITP revision files keep their own place), newest first.
 */
export function isoAttachmentRows(attachments: Row[] | null | undefined, isoId: unknown, names: Row[] | null | undefined): Row[] {
  const known = new Set((names || []).map(row => text(row.name)));
  return (attachments || []).filter(file => !file._archived && file.entityType === 'isometrics' && file.entityId === isoId && known.has(text(file.documentType)))
    .sort((a, b) => text(b._createdAt).localeCompare(text(a._createdAt)) || text(b.id).localeCompare(text(a.id)));
}

/** Why an upload is refused (before anything is stored), or '' when it can go. */
export function attachmentUploadError(reportNo: unknown, names: Row[] | null | undefined, files: { name: string }[]): string {
  if (!(names || []).some(row => !row._archived && row.id === text(reportNo))) return ISO_ATTACHMENTS_NO_TYPE;
  if (!files.length) return ISO_ATTACHMENTS_NO_FILE;
  if (files.length > ISO_ATTACHMENTS_FILE_LIMIT) return `Upload at most ${ISO_ATTACHMENTS_FILE_LIMIT} files at once.`;
  if (files.some(file => !isPdfName(file.name))) return ISO_ATTACHMENTS_NOT_PDF;
  return '';
}

/** Ids ticked for delete: a non-empty list of distinct text ids, or an error text (nothing ticked: "Check for delete"). */
export function attachmentDeleteIds(value: unknown): { ids: string[]; error: string } {
  const ids = Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map(id => id.trim()))] : [];
  return ids.length ? { ids, error: '' } : { ids, error: CHECK_FOR_DELETE };
}
