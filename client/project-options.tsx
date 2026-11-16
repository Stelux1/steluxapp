import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookText, ChevronDown, FolderOpen, Pencil, Printer, Trash2 } from 'lucide-react';
import { PROJECT_OPTIONS } from '../shared/iso-pages.ts';
import type { Row } from '../shared/types.ts';
import { Dropdown } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { IsoBookDialog } from './iso-book.tsx';
import { PdfDialog, pdfEntries, type PdfMenuItem } from './pdf-reports.tsx';
import { usePilot } from './pilot.tsx';

/** The isometrics of the projects, for the project book (one WP book per project: every isometric of it). */
const isometricsOf = (rows: Record<string, Row[]>, projectIds: string[]) => activeRows(rows, 'isometrics').filter(iso => projectIds.includes(String(iso.projectId)));

/**
 * Options menu of the Projects page (reference weld__welding__projects.txt:393-404), Weld Pilot: Delete selected projects,
 * Edit projects (Mass edit), Generate multiple WP books, Show deleted work packages. The first three work on the checked projects.
 */
export function ProjectsOptionsMenu({ checked, canDelete, canEdit, onDelete, onMassEdit, onShowDeleted }: { checked: Row[]; canDelete: boolean; canEdit: boolean; onDelete: () => void; onMassEdit: () => void; onShowDeleted: () => void }) {
  const { rows } = useWorkspace(); const [books, setBooks] = useState(false);
  const none = checked.length === 0, isos = isometricsOf(rows, checked.map(row => row.id));
  const [remove, edit, generate, deleted] = PROJECT_OPTIONS;
  return <>
    <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}>
      <button disabled={none || !canDelete} title={none ? 'Check one or more projects first.' : undefined} onClick={onDelete}>{remove}</button>
      <button disabled={none || !canEdit} title={none ? 'Check one or more projects first.' : undefined} onClick={onMassEdit}>{edit}</button>
      <button disabled={none} title={none ? 'Check one or more projects first.' : undefined} onClick={() => setBooks(true)}>{generate}</button>
      <button onClick={onShowDeleted}>{deleted}</button>
    </Dropdown>
    {books && <IsoBookDialog isos={isos} choose={!isos.length} onClose={() => setBooks(false)}/>}
  </>;
}

/** The buttons of a project row (reference :433): open, print (Certification index, Project book), punch list, edit, delete. */
export function ProjectRowButtons({ row, onEdit, onDelete }: { row: Row; onEdit?: () => void; onDelete?: () => void }) {
  const { rows, canRecord, canReadReport } = useWorkspace(); const pilot = usePilot(); const navigate = useNavigate();
  const [dialog, setDialog] = useState<'' | 'index' | 'book' | 'punch'>('');
  const name = String(row.internnumber ?? row.id);
  const index = pdfEntries(pilot?.pilot.key, 'certifications').find(entry => entry.key === 'certification-index') as PdfMenuItem | undefined;
  const punch = pdfEntries(pilot?.pilot.key, 'projects').find(entry => entry.key === 'punch-list') as PdfMenuItem | undefined;
  const showIndex = Boolean(index) && canRecord('certifications'), showBook = canRecord('isometrics'), showPunch = Boolean(punch) && canReadReport(punch!.report);
  return <>
    <button className="icon-btn" aria-label={`Open project ${name}`} title="Open" onClick={() => navigate(`/workspace/projects/${row.id}/isometrics`)}><FolderOpen size={16}/></button>
    {(showIndex || showBook) && <Dropdown label={`Print for project ${name}`} trigger={<span className="icon-btn" title="Print"><Printer size={16}/></span>}>
      {showIndex && <button onClick={() => setDialog('index')}>Certification index</button>}
      {showBook && <button onClick={() => setDialog('book')}>Project book</button>}
    </Dropdown>}
    {showPunch && <button className="icon-btn" aria-label={`Punch list of project ${name}`} title="Punch list" onClick={() => setDialog('punch')}><BookText size={16}/></button>}
    {onEdit && <button className="icon-btn" aria-label={`Edit project ${name}`} title="Edit" onClick={onEdit}><Pencil size={16}/></button>}
    {onDelete && <button className="icon-btn" aria-label={`Delete project ${name}`} title="Delete" onClick={onDelete}><Trash2 size={16}/></button>}
    {dialog === 'index' && index && <PdfDialog item={index} projectId={row.id} onClose={() => setDialog('')}/>}
    {dialog === 'punch' && punch && <PdfDialog item={punch} projectId={row.id} onClose={() => setDialog('')}/>}
    {dialog === 'book' && <IsoBookDialog isos={isometricsOf(rows, [row.id])} choose={!isometricsOf(rows, [row.id]).length} onClose={() => setDialog('')}/>}
  </>;
}
