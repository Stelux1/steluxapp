import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { ISO_EDIT_FILES_NOTE, isoDocumentType, isoFiles, pdfFileError } from '../shared/project-iso-forms.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { api, apiUrl, formatDate } from './api.ts';
import { AddRevisionDialog } from './drawing-revisions.tsx';

/** The PDF inputs of the Add isometric form (Isometric, ITP document, ITP document Field) or of Edit isometric (Isometric, with the ITP catalog note). */
export function IsoFileInputs({ editing, files, errors, onChange }: { editing: boolean; files: Record<string, File | null>; errors: Record<string, string>; onChange: (name: string, file: File | null) => void }) {
  return <>{isoFiles(editing).map(input => <div className="field full-width" key={input.name}>
    <label htmlFor={`field-${input.name}`}>{input.label}</label>
    <input id={`field-${input.name}`} name={input.name} type="file" accept=".pdf,application/pdf" aria-invalid={Boolean(errors[input.name])} aria-describedby={errors[input.name] ? `field-${input.name}-error` : undefined} onChange={event => onChange(input.name, event.target.files?.[0] ?? null)}/>
    {errors[input.name] ? <small className="field-error" id={`field-${input.name}-error`} role="alert">{errors[input.name]}</small> : files[input.name] ? <small className="field-hint">{files[input.name]!.name}</small> : null}
  </div>)}{editing && <p className="field-hint full-width">{ISO_EDIT_FILES_NOTE}</p>}</>;
}

/** The PDFs chosen in the form are attached once the isometric is saved: each as the document the input stands for. Returns the names that failed. */
export async function uploadIsoFiles(iso: Row, files: Record<string, File | null>, editing: boolean): Promise<string[]> {
  const failed: string[] = [];
  for (const input of isoFiles(editing)) {
    const file = files[input.name]; if (!file) continue;
    const body = new FormData(); body.set('file', file); body.set('entityType', 'isometrics'); body.set('entityId', iso.id); body.set('documentType', isoDocumentType(input.kind, iso));
    try { await api('/files', { method: 'POST', body }); } catch { failed.push(input.label); }
  }
  return failed;
}
/** Errors of the chosen files (a PDF is required of every input that has a file). */
export function isoFileErrors(files: Record<string, File | null>, editing: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const input of isoFiles(editing)) { const message = files[input.name] ? pdfFileError(files[input.name]!.name) : ''; if (message) errors[input.name] = message; }
  return errors;
}

/** Edit isometric, under Revision number: where the current revision number is changed, and the link to Add rev (a new revision with its PDF). */
export function IsoRevisionHelp({ iso }: { iso: Row }) {
  const [open, setOpen] = useState(false);
  return <div className="field full-width"><p className="field-hint">Change the current revision number here. To add a new revision with PDF use <button type="button" className="text-link" onClick={() => setOpen(true)}>Add rev</button>.</p>{open && <AddRevisionDialog iso={iso} kind="ISO" onClose={() => setOpen(false)}/>}</div>;
}
/** Edit isometric, under the ITP fields: the revisions of the drawing with their comments and PDFs. */
export function IsoCurrentRevisions({ iso }: { iso: Row }) {
  const { rows } = useWorkspace();
  const revisions = activeRows(rows, 'revisions').filter(row => row.isoId === iso.id && row.type === 'ISO').sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)) || b.id.localeCompare(a.id));
  if (!revisions.length) return null;
  const fileOf = (revision: Row) => activeRows(rows, 'attachments').find(file => file.entityType === 'revisions' && file.entityId === revision.id);
  return <div className="field full-width"><strong>Current revisions:</strong><ul className="current-revision-list">{revisions.map(revision => { const file = fileOf(revision); return <li key={revision.id}>{file ? <a className="text-link" href={apiUrl(`/files/${file.id}`)}>{String(revision.revNo)}<Download size={12} aria-hidden="true"/></a> : <span>{String(revision.revNo)}</span>}{String(revision.comment ?? '').trim() && <span className="muted"> ({String(revision.comment)})</span>}<small className="muted"> {formatDate(revision.date || revision._createdAt)}</small></li>; })}</ul></div>;
}
